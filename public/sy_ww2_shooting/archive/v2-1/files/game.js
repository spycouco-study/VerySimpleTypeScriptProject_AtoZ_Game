var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2["LOADING"] = "LOADING";
  GameState2["TITLE"] = "TITLE";
  GameState2["INSTRUCTIONS"] = "INSTRUCTIONS";
  GameState2["PLAYING"] = "PLAYING";
  GameState2["GAME_OVER"] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class GameObject {
  // Stored reference to the loaded image
  constructor(x, y, width, height, imageName) {
    this.markedForDeletion = false;
    this.image = null;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.imageName = imageName;
  }
  draw(ctx, game) {
    if (!this.image) {
      this.image = game.images.get(this.imageName) || null;
    }
    if (this.image) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = "red";
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
  update(deltaTime, game) {
  }
}
class Player extends GameObject {
  // for brief invincibility after hit
  constructor(x, y, game) {
    const playerConfig = game.data.player;
    super(x, y, playerConfig.width, playerConfig.height, playerConfig.image);
    this.lastShotTime = 0;
    this.invincibleTimer = 0;
    this.health = game.data.gameSettings.playerInitialHealth;
    this.maxHealth = this.health;
    this.speed = playerConfig.speed;
    this.fireRate = playerConfig.fireRate;
    this.bulletType = game.data.bulletTypes.find((b) => b.name === playerConfig.bulletType);
  }
  update(deltaTime, game) {
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= deltaTime;
    }
    if (game.input.get("ArrowUp") || game.input.get("KeyW")) this.y -= this.speed * deltaTime;
    if (game.input.get("ArrowDown") || game.input.get("KeyS")) this.y += this.speed * deltaTime;
    if (game.input.get("ArrowLeft") || game.input.get("KeyA")) this.x -= this.speed * deltaTime;
    if (game.input.get("ArrowRight") || game.input.get("KeyD")) this.x += this.speed * deltaTime;
    this.x = Math.max(0, Math.min(this.x, game.canvas.width - this.width));
    this.y = Math.max(0, Math.min(this.y, game.canvas.height - this.height));
    if ((game.input.get("Space") || game.input.get("KeyJ")) && game.currentTime - this.lastShotTime > 1e3 / this.fireRate) {
      game.playerBullets.push(new Bullet(
        this.x + this.width,
        // Spawn bullet from player's right edge
        this.y + this.height / 2 - this.bulletType.height / 2,
        // Centered vertically
        this.bulletType.width,
        this.bulletType.height,
        this.bulletType.image,
        this.bulletType.speed,
        this.bulletType.damage,
        "player"
      ));
      game.playSound(this.bulletType.sound);
      this.lastShotTime = game.currentTime;
    }
  }
  takeDamage(damage, game) {
    if (this.invincibleTimer <= 0) {
      this.health -= damage;
      game.playSound(game.data.player.hitSound);
      this.invincibleTimer = 1;
      if (this.health <= 0) {
        this.markedForDeletion = true;
        game.explosions.push(new Explosion(this.x, this.y, this.width, this.height, game.data.gameSettings.explosionDuration));
        game.playSound("explosion");
        game.playSound("game_over");
        game.setState("GAME_OVER" /* GAME_OVER */);
      }
    }
  }
  draw(ctx, game) {
    if (this.invincibleTimer > 0) {
      if (Math.floor(this.invincibleTimer * 10) % 2 === 0) {
        super.draw(ctx, game);
      }
    } else {
      super.draw(ctx, game);
    }
  }
}
class Bullet extends GameObject {
  constructor(x, y, width, height, imageName, speed, damage, type) {
    super(x, y, width, height, imageName);
    this.speed = speed;
    this.damage = damage;
    this.type = type;
  }
  update(deltaTime, game) {
    if (this.type === "player") {
      this.x += this.speed * deltaTime;
    } else {
      this.x -= this.speed * deltaTime;
    }
    if (this.x > game.canvas.width || this.x + this.width < 0) {
      this.markedForDeletion = true;
    }
  }
}
class Enemy extends GameObject {
  // For diagonal movement: 1 for down, -1 for up
  constructor(x, y, config, game) {
    super(x, y, config.width, config.height, config.image);
    this.lastShotTime = 0;
    // For sine wave to make each enemy's pattern unique
    this.verticalDirection = 1;
    this.health = config.health;
    this.scoreValue = config.scoreValue;
    this.speed = config.speed;
    this.fireRate = config.fireRate;
    this.bulletType = game.data.bulletTypes.find((b) => b.name === config.bulletType);
    this.movementPattern = config.movementPattern;
    this.initialY = y;
    this.sineWaveOffset = Math.random() * Math.PI * 2;
    this.verticalDirection = Math.random() < 0.5 ? 1 : -1;
  }
  update(deltaTime, game) {
    this.x -= this.speed * deltaTime;
    if (this.movementPattern === "sine") {
      const amplitude = 50;
      const frequency = 2;
      this.y = this.initialY + Math.sin(game.currentTime * 1e-3 * frequency + this.sineWaveOffset) * amplitude;
    } else if (this.movementPattern === "diagonal") {
      const diagonalSpeed = this.speed * 0.7;
      this.y += this.verticalDirection * diagonalSpeed * deltaTime;
      if (this.y <= 0) {
        this.y = 0;
        this.verticalDirection = 1;
      } else if (this.y >= game.canvas.height - this.height) {
        this.y = game.canvas.height - this.height;
        this.verticalDirection = -1;
      }
    }
    this.y = Math.max(0, Math.min(this.y, game.canvas.height - this.height));
    if (this.fireRate > 0 && game.currentTime - this.lastShotTime > 1e3 / this.fireRate) {
      game.enemyBullets.push(new Bullet(
        this.x - this.bulletType.width,
        // Spawn bullet from enemy's left edge
        this.y + this.height / 2 - this.bulletType.height / 2,
        // Centered vertically
        this.bulletType.width,
        this.bulletType.height,
        this.bulletType.image,
        this.bulletType.speed,
        this.bulletType.damage,
        "enemy"
      ));
      game.playSound(this.bulletType.sound);
      this.lastShotTime = game.currentTime;
    }
    if (this.x + this.width < 0) {
      this.markedForDeletion = true;
    }
  }
  takeDamage(damage, game) {
    this.health -= damage;
    if (this.health <= 0) {
      this.markedForDeletion = true;
      game.score += this.scoreValue;
      game.explosions.push(new Explosion(this.x, this.y, this.width, this.height, game.data.gameSettings.explosionDuration));
      game.playSound("explosion");
    }
  }
}
class Explosion extends GameObject {
  // in seconds
  constructor(x, y, width, height, duration) {
    super(x, y, width, height, "explosion");
    this.duration = duration;
    this.timer = duration;
  }
  update(deltaTime, game) {
    this.timer -= deltaTime;
    if (this.timer <= 0) {
      this.markedForDeletion = true;
    }
  }
}
class Background {
  constructor(imageName, scrollSpeed, gameWidth, gameHeight, game) {
    this.image = null;
    this.x1 = 0;
    this.x2 = 0;
    this.image = game.images.get(imageName) || null;
    this.scrollSpeed = scrollSpeed;
    this.gameWidth = gameWidth;
    this.gameHeight = gameHeight;
    if (this.image) {
      this.x1 = 0;
      this.x2 = this.image.width;
    }
  }
  update(deltaTime) {
    if (!this.image) return;
    const scrollAmount = this.scrollSpeed * deltaTime;
    this.x1 -= scrollAmount;
    this.x2 -= scrollAmount;
    if (this.x1 <= -this.image.width) {
      this.x1 = this.x2 + this.image.width;
    }
    if (this.x2 <= -this.image.width) {
      this.x2 = this.x1 + this.image.width;
    }
  }
  draw(ctx) {
    if (this.image) {
      ctx.drawImage(this.image, this.x1, 0, this.image.width, this.gameHeight);
      ctx.drawImage(this.image, this.x2, 0, this.image.width, this.gameHeight);
    }
  }
}
class Game {
  constructor(canvasId) {
    this.data = null;
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.gameState = "LOADING" /* LOADING */;
    this.lastFrameTime = 0;
    this.currentTime = 0;
    // Total elapsed time in milliseconds
    this.player = null;
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.explosions = [];
    this.background = null;
    this.score = 0;
    this.currentLevelIndex = 0;
    this.levelTimer = 0;
    // Time elapsed in current level (seconds)
    this.activeSpawnIntervals = /* @__PURE__ */ new Set();
    // To clear intervals when changing levels
    this.input = /* @__PURE__ */ new Map();
    this.music = null;
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.initEventListeners();
  }
  async start() {
    this.drawLoadingScreen("Loading Game Data...");
    try {
      const response = await fetch("data.json");
      this.data = await response.json();
      if (!this.data) throw new Error("Failed to load game data.");
      this.canvas.width = this.data.gameSettings.canvasWidth;
      this.canvas.height = this.data.gameSettings.canvasHeight;
      this.drawLoadingScreen("Loading Assets...");
      await this.loadAssets();
      this.background = new Background(
        "background",
        this.data.gameSettings.scrollSpeed,
        this.canvas.width,
        this.canvas.height,
        this
      );
      this.setState("TITLE" /* TITLE */);
      this.lastFrameTime = performance.now();
      requestAnimationFrame(this.gameLoop.bind(this));
    } catch (error) {
      console.error("Failed to start game:", error);
      this.drawLoadingScreen(`Error: ${error}`);
    }
  }
  drawLoadingScreen(message) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
  }
  async loadAssets() {
    if (!this.data) return;
    const imagePromises = this.data.assets.images.map(async (asset) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = asset.path;
        img.onload = () => {
          this.images.set(asset.name, img);
          resolve();
        };
        img.onerror = () => reject(`Failed to load image: ${asset.path}`);
      });
    });
    const soundPromises = this.data.assets.sounds.map(async (asset) => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = asset.path;
        audio.volume = asset.volume;
        audio.oncanplaythrough = () => {
          this.sounds.set(asset.name, audio);
          resolve();
        };
        audio.onerror = () => reject(`Failed to load sound: ${asset.path}`);
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  initEventListeners() {
    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "Enter"].includes(e.code)) {
        e.preventDefault();
        this.input.set(e.code, true);
        if (e.code === "Enter") {
          this.handleEnterKey();
        }
      }
    });
    window.addEventListener("keyup", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "Enter"].includes(e.code)) {
        this.input.set(e.code, false);
      }
    });
  }
  handleEnterKey() {
    switch (this.gameState) {
      case "TITLE" /* TITLE */:
        this.setState("INSTRUCTIONS" /* INSTRUCTIONS */);
        break;
      case "INSTRUCTIONS" /* INSTRUCTIONS */:
        this.initGame();
        this.setState("PLAYING" /* PLAYING */);
        break;
      case "GAME_OVER" /* GAME_OVER */:
        this.setState("TITLE" /* TITLE */);
        break;
      default:
        break;
    }
  }
  setState(newState) {
    this.gameState = newState;
    if (newState === "PLAYING" /* PLAYING */) {
      this.startMusic("bgm", true);
    } else {
      this.stopMusic();
      if (newState === "TITLE" /* TITLE */) {
      } else if (newState === "GAME_OVER" /* GAME_OVER */) {
      }
    }
    if (newState !== "PLAYING" /* PLAYING */) {
      this.activeSpawnIntervals.forEach((id) => clearInterval(id));
      this.activeSpawnIntervals.clear();
    }
  }
  initGame() {
    if (!this.data) return;
    this.player = new Player(
      this.canvas.width * 0.1,
      this.canvas.height / 2 - this.data.player.height / 2,
      this
    );
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.explosions = [];
    this.score = 0;
    this.currentLevelIndex = 0;
    this.levelTimer = 0;
    this.data.levels.forEach((level) => {
      level.spawnEvents.forEach((event) => event._spawned = false);
    });
  }
  gameLoop(timestamp) {
    if (!this.data) {
      requestAnimationFrame(this.gameLoop.bind(this));
      return;
    }
    const deltaTime = (timestamp - this.lastFrameTime) / 1e3;
    this.lastFrameTime = timestamp;
    this.currentTime = timestamp;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.update(deltaTime);
    this.render();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    switch (this.gameState) {
      case "PLAYING" /* PLAYING */:
        this.updatePlaying(deltaTime);
        break;
      default:
        break;
    }
  }
  updatePlaying(deltaTime) {
    if (!this.player || !this.data || !this.background) return;
    this.background.update(deltaTime);
    this.player.update(deltaTime, this);
    this.levelTimer += deltaTime;
    const currentLevelConfig = this.data.levels[this.currentLevelIndex];
    if (currentLevelConfig) {
      currentLevelConfig.spawnEvents.forEach((event) => {
        if (event.time <= this.levelTimer && !event._spawned) {
          if (event.count && event.interval) {
            event._spawned = true;
            let spawnedCount = 0;
            const intervalId = setInterval(() => {
              if (spawnedCount < event.count) {
                this.spawnEnemy(event.enemyName, event.startX, event.startY);
                spawnedCount++;
              } else {
                clearInterval(intervalId);
                this.activeSpawnIntervals.delete(intervalId);
              }
            }, event.interval * 1e3);
            this.activeSpawnIntervals.add(intervalId);
          } else {
            this.spawnEnemy(event.enemyName, event.startX, event.startY);
            event._spawned = true;
          }
        }
      });
      if (this.levelTimer >= currentLevelConfig.duration) {
        this.currentLevelIndex++;
        this.levelTimer = 0;
        this.activeSpawnIntervals.forEach((id) => clearInterval(id));
        this.activeSpawnIntervals.clear();
        if (!this.data.levels[this.currentLevelIndex]) {
          this.setState("GAME_OVER" /* GAME_OVER */);
        }
      }
    } else {
      this.setState("GAME_OVER" /* GAME_OVER */);
    }
    this.enemies.forEach((e) => e.update(deltaTime, this));
    this.playerBullets.forEach((b) => b.update(deltaTime, this));
    this.enemyBullets.forEach((b) => b.update(deltaTime, this));
    this.explosions.forEach((e) => e.update(deltaTime, this));
    this.checkCollisions();
    this.enemies = this.enemies.filter((e) => !e.markedForDeletion);
    this.playerBullets = this.playerBullets.filter((b) => !b.markedForDeletion);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.markedForDeletion);
    this.explosions = this.explosions.filter((e) => !e.markedForDeletion);
  }
  spawnEnemy(enemyName, startX, startY) {
    if (!this.data) return;
    const enemyConfig = this.data.enemyTypes.find((e) => e.name === enemyName);
    if (!enemyConfig) {
      console.warn(`Enemy type '${enemyName}' not found.`);
      return;
    }
    let actualX = startX === "rightEdge" ? this.canvas.width : startX;
    let actualY;
    if (startY === "random") {
      actualY = Math.random() * (this.canvas.height - enemyConfig.height);
    } else if (startY === "top") {
      actualY = 0;
    } else if (startY === "bottom") {
      actualY = this.canvas.height - enemyConfig.height;
    } else {
      actualY = startY;
    }
    this.enemies.push(new Enemy(actualX, actualY, enemyConfig, this));
  }
  checkCollisions() {
    if (!this.player) return;
    this.playerBullets.forEach((bullet) => {
      this.enemies.forEach((enemy) => {
        if (!bullet.markedForDeletion && !enemy.markedForDeletion && this.isColliding(bullet, enemy)) {
          enemy.takeDamage(bullet.damage, this);
          bullet.markedForDeletion = true;
        }
      });
    });
    this.enemyBullets.forEach((bullet) => {
      if (!bullet.markedForDeletion && !this.player.markedForDeletion && this.isColliding(bullet, this.player)) {
        this.player.takeDamage(bullet.damage, this);
        bullet.markedForDeletion = true;
      }
    });
    this.enemies.forEach((enemy) => {
      if (!enemy.markedForDeletion && !this.player.markedForDeletion && this.isColliding(this.player, enemy)) {
        this.player.takeDamage(enemy.health, this);
        enemy.markedForDeletion = true;
        this.explosions.push(new Explosion(enemy.x, enemy.y, enemy.width, enemy.height, this.data.gameSettings.explosionDuration));
        this.playSound("explosion");
      }
    });
  }
  isColliding(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width && obj1.x + obj1.width > obj2.x && obj1.y < obj2.y + obj2.height && obj1.y + obj1.height > obj2.y;
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.data) {
      this.drawLoadingScreen("Loading...");
      return;
    }
    this.background?.draw(this.ctx);
    switch (this.gameState) {
      case "TITLE" /* TITLE */:
        this.renderTitleScreen();
        break;
      case "INSTRUCTIONS" /* INSTRUCTIONS */:
        this.renderInstructionsScreen();
        break;
      case "PLAYING" /* PLAYING */:
        this.renderPlaying();
        break;
      case "GAME_OVER" /* GAME_OVER */:
        this.renderGameOverScreen();
        break;
      case "LOADING" /* LOADING */:
        break;
    }
  }
  renderPlaying() {
    this.enemies.forEach((e) => e.draw(this.ctx, this));
    this.playerBullets.forEach((b) => b.draw(this.ctx, this));
    this.enemyBullets.forEach((b) => b.draw(this.ctx, this));
    this.player?.draw(this.ctx, this);
    this.explosions.forEach((e) => e.draw(this.ctx, this));
    this.drawText(`Score: ${this.score}`, 10, 30, "white", "left", "24px Arial, sans-serif");
    this.drawText(`Health: ${this.player?.health || 0}`, 10, 60, "white", "left", "24px Arial, sans-serif");
  }
  renderTitleScreen() {
    if (!this.data) return;
    const titleImage = this.images.get("title_background");
    if (titleImage) {
      this.ctx.drawImage(titleImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "darkblue";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.drawText(this.data.gameSettings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2 - 50, "white", "center", "48px Arial, sans-serif");
    this.drawText("Press ENTER to Start", this.canvas.width / 2, this.canvas.height / 2 + 50, "white", "center", "24px Arial, sans-serif");
  }
  renderInstructionsScreen() {
    if (!this.data) return;
    const titleImage = this.images.get("title_background");
    if (titleImage) {
      this.ctx.drawImage(titleImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "darkblue";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.drawText("\uC870\uC791\uBC95", this.canvas.width / 2, 100, "white", "center", "40px Arial, sans-serif");
    this.data.gameSettings.instructionsText.forEach((line, index) => {
      this.drawText(line, this.canvas.width / 2, 180 + index * 40, "white", "center", "20px Arial, sans-serif");
    });
    this.drawText("Press ENTER to Play", this.canvas.width / 2, this.canvas.height - 100, "white", "center", "24px Arial, sans-serif");
  }
  renderGameOverScreen() {
    if (!this.data) return;
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawText(this.data.gameSettings.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 80, "red", "center", "60px Arial, sans-serif");
    this.drawText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2, "white", "center", "36px Arial, sans-serif");
    this.drawText("Press ENTER to return to Title", this.canvas.width / 2, this.canvas.height / 2 + 80, "white", "center", "24px Arial, sans-serif");
  }
  drawText(text, x, y, color, align = "left", font) {
    this.ctx.fillStyle = color;
    this.ctx.font = font;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, x, y);
  }
  playSound(soundName, loop = false) {
    const audio = this.sounds.get(soundName);
    if (audio) {
      const clone = audio.cloneNode(true);
      clone.volume = audio.volume;
      clone.loop = loop;
      clone.play().catch((e) => console.warn(`Sound playback failed: ${soundName}`, e));
    } else {
      console.warn(`Sound '${soundName}' not found.`);
    }
  }
  startMusic(soundName, loop = true) {
    this.stopMusic();
    const audio = this.sounds.get(soundName);
    if (audio) {
      this.music = audio;
      this.music.loop = loop;
      this.music.play().catch((e) => console.warn(`Music playback failed: ${soundName}`, e));
    } else {
      console.warn(`Music '${soundName}' not found.`);
    }
  }
  stopMusic() {
    if (this.music) {
      this.music.pause();
      this.music.currentTime = 0;
      this.music = null;
    }
  }
}
window.onload = () => {
  window.game = new Game("gameCanvas");
  window.game.start();
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHt9OyAvLyBNYWtlIHRoaXMgZmlsZSBhIG1vZHVsZSB0byBhbGxvdyBnbG9iYWwgYXVnbWVudGF0aW9uXHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVNldHRpbmdzIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICBwbGF5ZXJJbml0aWFsSGVhbHRoOiBudW1iZXI7XHJcbiAgICBleHBsb3Npb25EdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0OiBzdHJpbmdbXTtcclxuICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgbG9hZGluZ1RleHQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFBsYXllckNvbmZpZyB7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7IC8vIGJ1bGxldHMgcGVyIHNlY29uZFxyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgaGl0U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEVuZW15Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyO1xyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgbW92ZW1lbnRQYXR0ZXJuOiBcInN0cmFpZ2h0XCIgfCBcInNpbmVcIiB8IFwiZGlhZ29uYWxcIjtcclxuICAgIHNob290U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEJ1bGxldENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgc291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsU3Bhd25FdmVudCB7XHJcbiAgICB0aW1lOiBudW1iZXI7IC8vIHJlbGF0aXZlIHRvIGxldmVsIHN0YXJ0LCBpbiBzZWNvbmRzXHJcbiAgICBlbmVteU5hbWU6IHN0cmluZztcclxuICAgIHN0YXJ0WDogXCJyaWdodEVkZ2VcIiB8IG51bWJlcjsgLy8geCBwb3NpdGlvbiwgb3Iga2V5d29yZFxyXG4gICAgc3RhcnRZOiBcInJhbmRvbVwiIHwgXCJ0b3BcIiB8IFwiYm90dG9tXCIgfCBudW1iZXI7IC8vIHkgcG9zaXRpb24sIG9yIGtleXdvcmRcclxuICAgIGNvdW50PzogbnVtYmVyOyAvLyBmb3Igd2F2ZXNcclxuICAgIGludGVydmFsPzogbnVtYmVyOyAvLyBmb3Igd2F2ZXMgKHNlY29uZHMpXHJcbiAgICBfc3Bhd25lZD86IGJvb2xlYW47IC8vIEludGVybmFsIGZsYWcgdG8gdHJhY2sgaWYgdGhpcyBldmVudCBoYXMgYmVlbiB0cmlnZ2VyZWRcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsQ29uZmlnIHtcclxuICAgIGR1cmF0aW9uOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgIHNwYXduRXZlbnRzOiBMZXZlbFNwYXduRXZlbnRbXTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgcGxheWVyOiBQbGF5ZXJDb25maWc7XHJcbiAgICBlbmVteVR5cGVzOiBFbmVteUNvbmZpZ1tdO1xyXG4gICAgYnVsbGV0VHlwZXM6IEJ1bGxldENvbmZpZ1tdO1xyXG4gICAgbGV2ZWxzOiBMZXZlbENvbmZpZ1tdO1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJbWFnZUFzc2V0W107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZEFzc2V0W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HID0gXCJMT0FESU5HXCIsXHJcbiAgICBUSVRMRSA9IFwiVElUTEVcIixcclxuICAgIElOU1RSVUNUSU9OUyA9IFwiSU5TVFJVQ1RJT05TXCIsXHJcbiAgICBQTEFZSU5HID0gXCJQTEFZSU5HXCIsXHJcbiAgICBHQU1FX09WRVIgPSBcIkdBTUVfT1ZFUlwiLFxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG4gICAgbWFya2VkRm9yRGVsZXRpb246IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlZCByZWZlcmVuY2UgdG8gdGhlIGxvYWRlZCBpbWFnZVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gaW1hZ2VOYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5pbWFnZSA9IGdhbWUuaW1hZ2VzLmdldCh0aGlzLmltYWdlTmFtZSkgfHwgbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAncmVkJzsgLy8gRmFsbGJhY2tcclxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7fVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gYnVsbGV0cyBwZXIgc2Vjb25kXHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBsYXN0U2hvdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBpbnZpbmNpYmxlVGltZXI6IG51bWJlciA9IDA7IC8vIGZvciBicmllZiBpbnZpbmNpYmlsaXR5IGFmdGVyIGhpdFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyQ29uZmlnID0gZ2FtZS5kYXRhIS5wbGF5ZXI7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgcGxheWVyQ29uZmlnLndpZHRoLCBwbGF5ZXJDb25maWcuaGVpZ2h0LCBwbGF5ZXJDb25maWcuaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MucGxheWVySW5pdGlhbEhlYWx0aDtcclxuICAgICAgICB0aGlzLm1heEhlYWx0aCA9IHRoaXMuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBwbGF5ZXJDb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IHBsYXllckNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IHBsYXllckNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmludmluY2libGVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNb3ZlbWVudCBiYXNlZCBvbiBpbnB1dFxyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dVcCcpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlXJykpIHRoaXMueSAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dEb3duJykgfHwgZ2FtZS5pbnB1dC5nZXQoJ0tleVMnKSkgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKGdhbWUuaW5wdXQuZ2V0KCdBcnJvd0xlZnQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5QScpKSB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICBpZiAoZ2FtZS5pbnB1dC5nZXQoJ0Fycm93UmlnaHQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5RCcpKSB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gS2VlcCBwbGF5ZXIgd2l0aGluIGNhbnZhcyBib3VuZHNcclxuICAgICAgICB0aGlzLnggPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLngsIGdhbWUuY2FudmFzLndpZHRoIC0gdGhpcy53aWR0aCkpO1xyXG4gICAgICAgIHRoaXMueSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMueSwgZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpKTtcclxuXHJcbiAgICAgICAgLy8gU2hvb3RpbmdcclxuICAgICAgICBpZiAoKGdhbWUuaW5wdXQuZ2V0KCdTcGFjZScpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlKJykpICYmIChnYW1lLmN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0U2hvdFRpbWUpID4gKDEwMDAgLyB0aGlzLmZpcmVSYXRlKSkge1xyXG4gICAgICAgICAgICBnYW1lLnBsYXllckJ1bGxldHMucHVzaChuZXcgQnVsbGV0KFxyXG4gICAgICAgICAgICAgICAgdGhpcy54ICsgdGhpcy53aWR0aCwgLy8gU3Bhd24gYnVsbGV0IGZyb20gcGxheWVyJ3MgcmlnaHQgZWRnZVxyXG4gICAgICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyIC0gdGhpcy5idWxsZXRUeXBlLmhlaWdodCAvIDIsIC8vIENlbnRlcmVkIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS53aWR0aCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuaW1hZ2UsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuc3BlZWQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuZGFtYWdlLFxyXG4gICAgICAgICAgICAgICAgXCJwbGF5ZXJcIlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQodGhpcy5idWxsZXRUeXBlLnNvdW5kKTtcclxuICAgICAgICAgICAgdGhpcy5sYXN0U2hvdFRpbWUgPSBnYW1lLmN1cnJlbnRUaW1lO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGRhbWFnZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5oZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTb3VuZChnYW1lLmRhdGEhLnBsYXllci5oaXRTb3VuZCk7XHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gMTsgLy8gMSBzZWNvbmQgaW52aW5jaWJpbGl0eVxyXG4gICAgICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBnYW1lLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MuZXhwbG9zaW9uRHVyYXRpb24pKTtcclxuICAgICAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQoXCJnYW1lX292ZXJcIik7IC8vIFBsYXkgZ2FtZSBvdmVyIHNvdW5kXHJcbiAgICAgICAgICAgICAgICBnYW1lLnNldFN0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmxlVGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIEZsYXNoIGVmZmVjdCBkdXJpbmcgaW52aW5jaWJpbGl0eVxyXG4gICAgICAgICAgICBpZiAoTWF0aC5mbG9vcih0aGlzLmludmluY2libGVUaW1lciAqIDEwKSAlIDIgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHN1cGVyLmRyYXcoY3R4LCBnYW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHN1cGVyLmRyYXcoY3R4LCBnYW1lKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEJ1bGxldCBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgdHlwZTogXCJwbGF5ZXJcIiB8IFwiZW5lbXlcIjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlTmFtZTogc3RyaW5nLCBzcGVlZDogbnVtYmVyLCBkYW1hZ2U6IG51bWJlciwgdHlwZTogXCJwbGF5ZXJcIiB8IFwiZW5lbXlcIikge1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGltYWdlTmFtZSk7XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IHNwZWVkO1xyXG4gICAgICAgIHRoaXMuZGFtYWdlID0gZGFtYWdlO1xyXG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMudHlwZSA9PT0gXCJwbGF5ZXJcIikge1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9IGVsc2UgeyAvLyBlbmVteSBidWxsZXRcclxuICAgICAgICAgICAgdGhpcy54IC09IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNYXJrIGZvciBkZWxldGlvbiBpZiBvZmYgc2NyZWVuXHJcbiAgICAgICAgaWYgKHRoaXMueCA+IGdhbWUuY2FudmFzLndpZHRoIHx8IHRoaXMueCArIHRoaXMud2lkdGggPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRW5lbXkgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7XHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBtb3ZlbWVudFBhdHRlcm46IFwic3RyYWlnaHRcIiB8IFwic2luZVwiIHwgXCJkaWFnb25hbFwiO1xyXG4gICAgbGFzdFNob3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgaW5pdGlhbFk6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSBvciBkaWFnb25hbCBwYXR0ZXJuc1xyXG4gICAgc2luZVdhdmVPZmZzZXQ6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSB0byBtYWtlIGVhY2ggZW5lbXkncyBwYXR0ZXJuIHVuaXF1ZVxyXG4gICAgdmVydGljYWxEaXJlY3Rpb246IDEgfCAtMSA9IDE7IC8vIEZvciBkaWFnb25hbCBtb3ZlbWVudDogMSBmb3IgZG93biwgLTEgZm9yIHVwXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbmZpZzogRW5lbXlDb25maWcsIGdhbWU6IEdhbWUpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCBjb25maWcud2lkdGgsIGNvbmZpZy5oZWlnaHQsIGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBjb25maWcuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IGNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBjb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IGNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IGNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICAgICAgdGhpcy5tb3ZlbWVudFBhdHRlcm4gPSBjb25maWcubW92ZW1lbnRQYXR0ZXJuO1xyXG4gICAgICAgIHRoaXMuaW5pdGlhbFkgPSB5O1xyXG4gICAgICAgIHRoaXMuc2luZVdhdmVPZmZzZXQgPSBNYXRoLnJhbmRvbSgpICogTWF0aC5QSSAqIDI7IC8vIFJhbmRvbSBwaGFzZSBmb3Igc2luZSB3YXZlXHJcbiAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IChNYXRoLnJhbmRvbSgpIDwgMC41KSA/IDEgOiAtMTsgLy8gUmFuZG9tIGluaXRpYWwgZGlyZWN0aW9uIGZvciBkaWFnb25hbFxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIC8vIEhvcml6b250YWwgbW92ZW1lbnRcclxuICAgICAgICB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gVmVydGljYWwgbW92ZW1lbnQgYmFzZWQgb24gcGF0dGVyblxyXG4gICAgICAgIGlmICh0aGlzLm1vdmVtZW50UGF0dGVybiA9PT0gXCJzaW5lXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgYW1wbGl0dWRlID0gNTA7IC8vIEhvdyBmYXIgdXAvZG93biBpdCBtb3Zlc1xyXG4gICAgICAgICAgICBjb25zdCBmcmVxdWVuY3kgPSAyOyAvLyBIb3cgZmFzdCBpdCB3aWdnbGVzXHJcbiAgICAgICAgICAgIHRoaXMueSA9IHRoaXMuaW5pdGlhbFkgKyBNYXRoLnNpbihnYW1lLmN1cnJlbnRUaW1lICogMC4wMDEgKiBmcmVxdWVuY3kgKyB0aGlzLnNpbmVXYXZlT2Zmc2V0KSAqIGFtcGxpdHVkZTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMubW92ZW1lbnRQYXR0ZXJuID09PSBcImRpYWdvbmFsXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhZ29uYWxTcGVlZCA9IHRoaXMuc3BlZWQgKiAwLjc7IC8vIFNsb3dlciB2ZXJ0aWNhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICB0aGlzLnkgKz0gdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiAqIGRpYWdvbmFsU3BlZWQgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBSZXZlcnNlIGRpcmVjdGlvbiBpZiBoaXR0aW5nIHRvcCBvciBib3R0b20gZWRnZXNcclxuICAgICAgICAgICAgaWYgKHRoaXMueSA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnkgPSAwO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IDE7IC8vIE1vdmUgZG93blxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMueSA+PSBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy55ID0gZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRpY2FsRGlyZWN0aW9uID0gLTE7IC8vIE1vdmUgdXBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGFtcCBZIHRvIHN0YXkgb24gc2NyZWVuIChvbmx5IG5lZWRlZCBpZiBtb3ZlbWVudCBwYXR0ZXJuIGRvZXNuJ3QgaGFuZGxlIGl0LCBlLmcuLCAnc3RyYWlnaHQnKVxyXG4gICAgICAgIC8vIEZvciAnc2luZScgYW5kICdkaWFnb25hbCcsIHRoZWlyIGxvZ2ljIHVzdWFsbHkgaW1wbGljaXRseSBrZWVwcyBpdCB3aXRoaW4gYm91bmRzIG9yXHJcbiAgICAgICAgLy8gdGhlIGJvdW5jZSBsb2dpYyBhZGp1c3RzIGl0LiBLZWVwaW5nIGl0IGFzIGEgZ2VuZXJhbCBmYWxsYmFjaywgdGhvdWdoIGxlc3MgY3JpdGljYWwgZm9yIHVwZGF0ZWQgZGlhZ29uYWwuXHJcbiAgICAgICAgdGhpcy55ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy55LCBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkpO1xyXG5cclxuXHJcbiAgICAgICAgLy8gU2hvb3RpbmdcclxuICAgICAgICBpZiAodGhpcy5maXJlUmF0ZSA+IDAgJiYgKGdhbWUuY3VycmVudFRpbWUgLSB0aGlzLmxhc3RTaG90VGltZSkgPiAoMTAwMCAvIHRoaXMuZmlyZVJhdGUpKSB7XHJcbiAgICAgICAgICAgIGdhbWUuZW5lbXlCdWxsZXRzLnB1c2gobmV3IEJ1bGxldChcclxuICAgICAgICAgICAgICAgIHRoaXMueCAtIHRoaXMuYnVsbGV0VHlwZS53aWR0aCwgLy8gU3Bhd24gYnVsbGV0IGZyb20gZW5lbXkncyBsZWZ0IGVkZ2VcclxuICAgICAgICAgICAgICAgIHRoaXMueSArIHRoaXMuaGVpZ2h0IC8gMiAtIHRoaXMuYnVsbGV0VHlwZS5oZWlnaHQgLyAyLCAvLyBDZW50ZXJlZCB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUud2lkdGgsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmltYWdlLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLnNwZWVkLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmRhbWFnZSxcclxuICAgICAgICAgICAgICAgIFwiZW5lbXlcIlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQodGhpcy5idWxsZXRUeXBlLnNvdW5kKTtcclxuICAgICAgICAgICAgdGhpcy5sYXN0U2hvdFRpbWUgPSBnYW1lLmN1cnJlbnRUaW1lO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTWFyayBmb3IgZGVsZXRpb24gaWYgb2ZmIHNjcmVlblxyXG4gICAgICAgIGlmICh0aGlzLnggKyB0aGlzLndpZHRoIDwgMCkge1xyXG4gICAgICAgICAgICB0aGlzLm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShkYW1hZ2U6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoIC09IGRhbWFnZTtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgZ2FtZS5zY29yZSArPSB0aGlzLnNjb3JlVmFsdWU7XHJcbiAgICAgICAgICAgIGdhbWUuZXhwbG9zaW9ucy5wdXNoKG5ldyBFeHBsb3Npb24odGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0LCBnYW1lLmRhdGEhLmdhbWVTZXR0aW5ncy5leHBsb3Npb25EdXJhdGlvbikpO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTb3VuZChcImV4cGxvc2lvblwiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEV4cGxvc2lvbiBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgdGltZXI6IG51bWJlcjtcclxuICAgIGR1cmF0aW9uOiBudW1iZXI7IC8vIGluIHNlY29uZHNcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGR1cmF0aW9uOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBcImV4cGxvc2lvblwiKTsgLy8gQXNzdW1pbmcgXCJleHBsb3Npb25cIiBpcyB0aGUgaW1hZ2UgbmFtZVxyXG4gICAgICAgIHRoaXMuZHVyYXRpb24gPSBkdXJhdGlvbjtcclxuICAgICAgICB0aGlzLnRpbWVyID0gZHVyYXRpb247XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy50aW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRoaXMudGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEJhY2tncm91bmQge1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICB4MTogbnVtYmVyID0gMDtcclxuICAgIHgyOiBudW1iZXIgPSAwOyAvLyBmb3IgY29udGludW91cyBzY3JvbGxpbmdcclxuICAgIGdhbWVXaWR0aDogbnVtYmVyO1xyXG4gICAgZ2FtZUhlaWdodDogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGltYWdlTmFtZTogc3RyaW5nLCBzY3JvbGxTcGVlZDogbnVtYmVyLCBnYW1lV2lkdGg6IG51bWJlciwgZ2FtZUhlaWdodDogbnVtYmVyLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IGdhbWUuaW1hZ2VzLmdldChpbWFnZU5hbWUpIHx8IG51bGw7XHJcbiAgICAgICAgdGhpcy5zY3JvbGxTcGVlZCA9IHNjcm9sbFNwZWVkO1xyXG4gICAgICAgIHRoaXMuZ2FtZVdpZHRoID0gZ2FtZVdpZHRoO1xyXG4gICAgICAgIHRoaXMuZ2FtZUhlaWdodCA9IGdhbWVIZWlnaHQ7XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgLy8gSW5pdGlhbGl6ZSBwb3NpdGlvbnMgZm9yIHR3byB0aWxlcyB0byBjb3ZlciB0aGUgc2NyZWVuIGFuZCBiZXlvbmRcclxuICAgICAgICAgICAgdGhpcy54MSA9IDA7XHJcbiAgICAgICAgICAgIC8vIEVuc3VyZSB4MiBzdGFydHMgd2hlcmUgeDEgZW5kcywgaGFuZGxpbmcgcG90ZW50aWFsIGltYWdlIHdpZHRoIGRpZmZlcmVuY2VzXHJcbiAgICAgICAgICAgIC8vIFRoZSBpbWFnZSBtaWdodCBub3QgYmUgZXhhY3RseSBjYW52YXMgd2lkdGgsIHNvIHdlIHRpbGUgaXQgYmFzZWQgb24gaXRzIG93biB3aWR0aC5cclxuICAgICAgICAgICAgdGhpcy54MiA9IHRoaXMuaW1hZ2Uud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5pbWFnZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBzY3JvbGxBbW91bnQgPSB0aGlzLnNjcm9sbFNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIHRoaXMueDEgLT0gc2Nyb2xsQW1vdW50O1xyXG4gICAgICAgIHRoaXMueDIgLT0gc2Nyb2xsQW1vdW50O1xyXG5cclxuICAgICAgICAvLyBJZiBhbiBpbWFnZSB0aWxlIG1vdmVzIGNvbXBsZXRlbHkgb2ZmLXNjcmVlbiB0byB0aGUgbGVmdCwgcmVzZXQgaXQgdG8gdGhlIHJpZ2h0XHJcbiAgICAgICAgaWYgKHRoaXMueDEgPD0gLXRoaXMuaW1hZ2Uud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54MSA9IHRoaXMueDIgKyB0aGlzLmltYWdlLndpZHRoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy54MiA8PSAtdGhpcy5pbWFnZS53aWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLngyID0gdGhpcy54MSArIHRoaXMuaW1hZ2Uud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5pbWFnZSkge1xyXG4gICAgICAgICAgICAvLyBEcmF3IGJvdGggYmFja2dyb3VuZCB0aWxlcywgc2NhbGVkIHRvIGNhbnZhcyBoZWlnaHRcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngxLCAwLCB0aGlzLmltYWdlLndpZHRoLCB0aGlzLmdhbWVIZWlnaHQpO1xyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueDIsIDAsIHRoaXMuaW1hZ2Uud2lkdGgsIHRoaXMuZ2FtZUhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBkYXRhOiBHYW1lRGF0YSB8IG51bGwgPSBudWxsO1xyXG4gICAgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG4gICAgbGFzdEZyYW1lVGltZTogbnVtYmVyID0gMDtcclxuICAgIGN1cnJlbnRUaW1lOiBudW1iZXIgPSAwOyAvLyBUb3RhbCBlbGFwc2VkIHRpbWUgaW4gbWlsbGlzZWNvbmRzXHJcblxyXG4gICAgcGxheWVyOiBQbGF5ZXIgfCBudWxsID0gbnVsbDtcclxuICAgIGVuZW1pZXM6IEVuZW15W10gPSBbXTtcclxuICAgIHBsYXllckJ1bGxldHM6IEJ1bGxldFtdID0gW107XHJcbiAgICBlbmVteUJ1bGxldHM6IEJ1bGxldFtdID0gW107XHJcbiAgICBleHBsb3Npb25zOiBFeHBsb3Npb25bXSA9IFtdO1xyXG4gICAgYmFja2dyb3VuZDogQmFja2dyb3VuZCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgY3VycmVudExldmVsSW5kZXg6IG51bWJlciA9IDA7XHJcbiAgICBsZXZlbFRpbWVyOiBudW1iZXIgPSAwOyAvLyBUaW1lIGVsYXBzZWQgaW4gY3VycmVudCBsZXZlbCAoc2Vjb25kcylcclxuICAgIGFjdGl2ZVNwYXduSW50ZXJ2YWxzOiBTZXQ8bnVtYmVyPiA9IG5ldyBTZXQoKTsgLy8gVG8gY2xlYXIgaW50ZXJ2YWxzIHdoZW4gY2hhbmdpbmcgbGV2ZWxzXHJcblxyXG4gICAgaW5wdXQ6IE1hcDxzdHJpbmcsIGJvb2xlYW4+ID0gbmV3IE1hcCgpO1xyXG4gICAgbXVzaWM6IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICB0aGlzLmluaXRFdmVudExpc3RlbmVycygpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oXCJMb2FkaW5nIEdhbWUgRGF0YS4uLlwiKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgdGhpcy5kYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YS5cIik7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbihcIkxvYWRpbmcgQXNzZXRzLi4uXCIpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFNldCB1cCBiYWNrZ3JvdW5kIGFmdGVyIGxvYWRpbmcgYXNzZXRzXHJcbiAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZCA9IG5ldyBCYWNrZ3JvdW5kKFxyXG4gICAgICAgICAgICAgICAgXCJiYWNrZ3JvdW5kXCIsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnNjcm9sbFNwZWVkLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGgsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICB0aGlzXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLlRJVExFKTtcclxuICAgICAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc3RhcnQgZ2FtZTpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKGBFcnJvcjogJHtlcnJvcn1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TG9hZGluZ1NjcmVlbihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZic7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KG1lc3NhZ2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmRhdGEuYXNzZXRzLmltYWdlcy5tYXAoYXN5bmMgKGFzc2V0KSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgICAgIGltZy5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoYXNzZXQubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiByZWplY3QoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2Fzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5kYXRhLmFzc2V0cy5zb3VuZHMubWFwKGFzeW5jIChhc3NldCkgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBhc3NldC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICAvLyBQcmVsb2FkIHRvIGVuc3VyZSBpdCdzIHJlYWR5XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChhc3NldC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiByZWplY3QoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke2Fzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaW5pdEV2ZW50TGlzdGVuZXJzKCk6IHZvaWQge1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKFsnQXJyb3dVcCcsICdBcnJvd0Rvd24nLCAnQXJyb3dMZWZ0JywgJ0Fycm93UmlnaHQnLCAnU3BhY2UnLCAnS2V5VycsICdLZXlBJywgJ0tleVMnLCAnS2V5RCcsICdLZXlKJywgJ0VudGVyJ10uaW5jbHVkZXMoZS5jb2RlKSkge1xyXG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpOyAvLyBQcmV2ZW50IHNjcm9sbGluZyBmb3IgYXJyb3cga2V5cy9zcGFjZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5pbnB1dC5zZXQoZS5jb2RlLCB0cnVlKTtcclxuICAgICAgICAgICAgICAgIGlmIChlLmNvZGUgPT09ICdFbnRlcicpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUVudGVyS2V5KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoWydBcnJvd1VwJywgJ0Fycm93RG93bicsICdBcnJvd0xlZnQnLCAnQXJyb3dSaWdodCcsICdTcGFjZScsICdLZXlXJywgJ0tleUEnLCAnS2V5UycsICdLZXlEJywgJ0tleUonLCAnRW50ZXInXS5pbmNsdWRlcyhlLmNvZGUpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0LnNldChlLmNvZGUsIGZhbHNlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlRW50ZXJLZXkoKTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLklOU1RSVUNUSU9OUyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5pbml0R2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZShHYW1lU3RhdGUuUExBWUlORyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZShHYW1lU3RhdGUuVElUTEUpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc2V0U3RhdGUobmV3U3RhdGU6IEdhbWVTdGF0ZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gbmV3U3RhdGU7XHJcbiAgICAgICAgaWYgKG5ld1N0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0TXVzaWMoXCJiZ21cIiwgdHJ1ZSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5zdG9wTXVzaWMoKTtcclxuICAgICAgICAgICAgaWYgKG5ld1N0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcclxuICAgICAgICAgICAgICAgIC8vIE9wdGlvbmFsbHkgcGxheSB0aXRsZSBzY3JlZW4gc3BlY2lmaWMgbXVzaWMgaGVyZVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5ld1N0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBHYW1lIG92ZXIgc291bmQgaXMgcGxheWVkIGluIFBsYXllci50YWtlRGFtYWdlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQ2xlYXIgYW55IGFjdGl2ZSBzcGF3biBpbnRlcnZhbHMgd2hlbiBzdGF0ZSBjaGFuZ2VzIGZyb20gUExBWUlOR1xyXG4gICAgICAgIGlmIChuZXdTdGF0ZSAhPT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5mb3JFYWNoKGlkID0+IGNsZWFySW50ZXJ2YWwoaWQpKTtcclxuICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5jbGVhcigpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpbml0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIHRoaXMucGxheWVyID0gbmV3IFBsYXllcihcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggKiAwLjEsXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSB0aGlzLmRhdGEucGxheWVyLmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgIHRoaXNcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IFtdO1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cyA9IFtdO1xyXG4gICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzID0gW107XHJcbiAgICAgICAgdGhpcy5leHBsb3Npb25zID0gW107XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCA9IDA7XHJcbiAgICAgICAgdGhpcy5sZXZlbFRpbWVyID0gMDtcclxuICAgICAgICAvLyBSZXNldCBfc3Bhd25lZCBmbGFnIGZvciBhbGwgZXZlbnRzIGluIGFsbCBsZXZlbHNcclxuICAgICAgICB0aGlzLmRhdGEubGV2ZWxzLmZvckVhY2gobGV2ZWwgPT4ge1xyXG4gICAgICAgICAgICBsZXZlbC5zcGF3bkV2ZW50cy5mb3JFYWNoKGV2ZW50ID0+IGV2ZW50Ll9zcGF3bmVkID0gZmFsc2UpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGdhbWVMb29wKHRpbWVzdGFtcDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHtcclxuICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9ICh0aW1lc3RhbXAgLSB0aGlzLmxhc3RGcmFtZVRpbWUpIC8gMTAwMDsgLy8gRGVsdGEgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gdGltZXN0YW1wO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFRpbWUgPSB0aW1lc3RhbXA7IC8vIFRvdGFsIGVsYXBzZWQgdGltZSBpbiBtaWxsaXNlY29uZHNcclxuXHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyKCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUGxheWluZyhkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlUGxheWluZyhkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5wbGF5ZXIgfHwgIXRoaXMuZGF0YSB8fCAhdGhpcy5iYWNrZ3JvdW5kKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZC51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKTtcclxuXHJcbiAgICAgICAgLy8gTGV2ZWwgcHJvZ3Jlc3Npb24gYW5kIGVuZW15IHNwYXduaW5nXHJcbiAgICAgICAgdGhpcy5sZXZlbFRpbWVyICs9IGRlbHRhVGltZTtcclxuICAgICAgICBjb25zdCBjdXJyZW50TGV2ZWxDb25maWcgPSB0aGlzLmRhdGEubGV2ZWxzW3RoaXMuY3VycmVudExldmVsSW5kZXhdO1xyXG5cclxuICAgICAgICBpZiAoY3VycmVudExldmVsQ29uZmlnKSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRMZXZlbENvbmZpZy5zcGF3bkV2ZW50cy5mb3JFYWNoKGV2ZW50ID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChldmVudC50aW1lIDw9IHRoaXMubGV2ZWxUaW1lciAmJiAhZXZlbnQuX3NwYXduZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZXZlbnQuY291bnQgJiYgZXZlbnQuaW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuX3NwYXduZWQgPSB0cnVlOyAvLyBNYXJrIGFzIHNwYXduZWQgdG8gcHJldmVudCByZS10cmlnZ2VyaW5nIHdhdmVcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHNwYXduZWRDb3VudCA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGludGVydmFsSWQgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3Bhd25lZENvdW50IDwgZXZlbnQuY291bnQhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGF3bkVuZW15KGV2ZW50LmVuZW15TmFtZSwgZXZlbnQuc3RhcnRYLCBldmVudC5zdGFydFkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNwYXduZWRDb3VudCsrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsSWQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuZGVsZXRlKGludGVydmFsSWQgYXMgbnVtYmVyKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSwgZXZlbnQuaW50ZXJ2YWwgKiAxMDAwKTsgLy8gaW50ZXJ2YWwgaW4gbWlsbGlzZWNvbmRzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuYWRkKGludGVydmFsSWQgYXMgbnVtYmVyKTsgLy8gU3RvcmUgSUQgdG8gY2xlYXIgbGF0ZXJcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBTaW5nbGUgZW5lbXkgc3Bhd25cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGF3bkVuZW15KGV2ZW50LmVuZW15TmFtZSwgZXZlbnQuc3RhcnRYLCBldmVudC5zdGFydFkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudC5fc3Bhd25lZCA9IHRydWU7IC8vIE1hcmsgYXMgc3Bhd25lZFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBJZiBsZXZlbCBkdXJhdGlvbiBpcyBvdmVyLCBhZHZhbmNlIHRvIG5leHQgbGV2ZWwgb3IgZW5kIGdhbWVcclxuICAgICAgICAgICAgaWYgKHRoaXMubGV2ZWxUaW1lciA+PSBjdXJyZW50TGV2ZWxDb25maWcuZHVyYXRpb24pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudExldmVsSW5kZXgrKztcclxuICAgICAgICAgICAgICAgIHRoaXMubGV2ZWxUaW1lciA9IDA7IC8vIFJlc2V0IHRpbWVyIGZvciB0aGUgbmV3IGxldmVsXHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQ2xlYXIgYW55IHJlbWFpbmluZyBpbnRlcnZhbHMgZm9yIHRoZSBqdXN0LWVuZGVkIGxldmVsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmZvckVhY2goaWQgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5jbGVhcigpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5kYXRhLmxldmVsc1t0aGlzLmN1cnJlbnRMZXZlbEluZGV4XSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIEFsbCBsZXZlbHMgY29tcGxldGVkXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZShHYW1lU3RhdGUuR0FNRV9PVkVSKTsgLy8gQ291bGQgYmUgJ1ZJQ1RPUlknIHN0YXRlXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBObyBtb3JlIGxldmVscywgcGVyaGFwcyBrZWVwIHByZXZpb3VzIGxldmVsJ3Mgc3Bhd25zIG9yIGp1c3Qgd2FpdCBmb3IgcGxheWVyIHRvIGZpbmlzaFxyXG4gICAgICAgICAgICAvLyBGb3Igbm93LCBsZXQncyBqdXN0IHRyYW5zaXRpb24gdG8gZ2FtZSBvdmVyLlxyXG4gICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGFuZCBmaWx0ZXIgZ2FtZSBvYmplY3RzXHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZSA9PiBlLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMuZm9yRWFjaChiID0+IGIudXBkYXRlKGRlbHRhVGltZSwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzLmZvckVhY2goYiA9PiBiLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMuZm9yRWFjaChlID0+IGUudXBkYXRlKGRlbHRhVGltZSwgdGhpcykpO1xyXG5cclxuICAgICAgICAvLyBDb2xsaXNpb24gZGV0ZWN0aW9uXHJcbiAgICAgICAgdGhpcy5jaGVja0NvbGxpc2lvbnMoKTtcclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIG1hcmtlZCBmb3IgZGVsZXRpb25cclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSB0aGlzLmVuZW1pZXMuZmlsdGVyKGUgPT4gIWUubWFya2VkRm9yRGVsZXRpb24pO1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cyA9IHRoaXMucGxheWVyQnVsbGV0cy5maWx0ZXIoYiA9PiAhYi5tYXJrZWRGb3JEZWxldGlvbik7XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMgPSB0aGlzLmVuZW15QnVsbGV0cy5maWx0ZXIoYiA9PiAhYi5tYXJrZWRGb3JEZWxldGlvbik7XHJcbiAgICAgICAgdGhpcy5leHBsb3Npb25zID0gdGhpcy5leHBsb3Npb25zLmZpbHRlcihlID0+ICFlLm1hcmtlZEZvckRlbGV0aW9uKTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgZ2FtZSBvdmVyIGNvbmRpdGlvbiAocGxheWVyLmhlYWx0aCA8PSAwIGlzIGhhbmRsZWQgaW4gUGxheWVyLnRha2VEYW1hZ2UpXHJcbiAgICB9XHJcblxyXG4gICAgc3Bhd25FbmVteShlbmVteU5hbWU6IHN0cmluZywgc3RhcnRYOiBcInJpZ2h0RWRnZVwiIHwgbnVtYmVyLCBzdGFydFk6IFwicmFuZG9tXCIgfCBcInRvcFwiIHwgXCJib3R0b21cIiB8IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSByZXR1cm47XHJcbiAgICAgICAgY29uc3QgZW5lbXlDb25maWcgPSB0aGlzLmRhdGEuZW5lbXlUeXBlcy5maW5kKGUgPT4gZS5uYW1lID09PSBlbmVteU5hbWUpO1xyXG4gICAgICAgIGlmICghZW5lbXlDb25maWcpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBFbmVteSB0eXBlICcke2VuZW15TmFtZX0nIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGFjdHVhbFggPSBzdGFydFggPT09IFwicmlnaHRFZGdlXCIgPyB0aGlzLmNhbnZhcy53aWR0aCA6IHN0YXJ0WDtcclxuICAgICAgICBsZXQgYWN0dWFsWTogbnVtYmVyO1xyXG5cclxuICAgICAgICBpZiAoc3RhcnRZID09PSBcInJhbmRvbVwiKSB7XHJcbiAgICAgICAgICAgIGFjdHVhbFkgPSBNYXRoLnJhbmRvbSgpICogKHRoaXMuY2FudmFzLmhlaWdodCAtIGVuZW15Q29uZmlnLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChzdGFydFkgPT09IFwidG9wXCIpIHtcclxuICAgICAgICAgICAgYWN0dWFsWSA9IDA7XHJcbiAgICAgICAgfSBlbHNlIGlmIChzdGFydFkgPT09IFwiYm90dG9tXCIpIHtcclxuICAgICAgICAgICAgYWN0dWFsWSA9IHRoaXMuY2FudmFzLmhlaWdodCAtIGVuZW15Q29uZmlnLmhlaWdodDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBhY3R1YWxZID0gc3RhcnRZO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLnB1c2gobmV3IEVuZW15KGFjdHVhbFgsIGFjdHVhbFksIGVuZW15Q29uZmlnLCB0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgY2hlY2tDb2xsaXNpb25zKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5wbGF5ZXIpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIGJ1bGxldHMgdnMuIEVuZW1pZXNcclxuICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWJ1bGxldC5tYXJrZWRGb3JEZWxldGlvbiAmJiAhZW5lbXkubWFya2VkRm9yRGVsZXRpb24gJiYgdGhpcy5pc0NvbGxpZGluZyhidWxsZXQsIGVuZW15KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGVuZW15LnRha2VEYW1hZ2UoYnVsbGV0LmRhbWFnZSwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnVsbGV0Lm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIEVuZW15IGJ1bGxldHMgdnMuIFBsYXllclxyXG4gICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IHtcclxuICAgICAgICAgICAgaWYgKCFidWxsZXQubWFya2VkRm9yRGVsZXRpb24gJiYgIXRoaXMucGxheWVyIS5tYXJrZWRGb3JEZWxldGlvbiAmJiB0aGlzLmlzQ29sbGlkaW5nKGJ1bGxldCwgdGhpcy5wbGF5ZXIhKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIhLnRha2VEYW1hZ2UoYnVsbGV0LmRhbWFnZSwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciB2cy4gRW5lbWllcyAoY29udGFjdCBkYW1hZ2UvY29sbGlzaW9uKVxyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgaWYgKCFlbmVteS5tYXJrZWRGb3JEZWxldGlvbiAmJiAhdGhpcy5wbGF5ZXIhLm1hcmtlZEZvckRlbGV0aW9uICYmIHRoaXMuaXNDb2xsaWRpbmcodGhpcy5wbGF5ZXIhLCBlbmVteSkpIHtcclxuICAgICAgICAgICAgICAgIC8vIFBsYXllciB0YWtlcyBkYW1hZ2UgYW5kIGVuZW15IGlzIGRlc3Ryb3llZFxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIhLnRha2VEYW1hZ2UoZW5lbXkuaGVhbHRoLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgIGVuZW15Lm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZXhwbG9zaW9ucy5wdXNoKG5ldyBFeHBsb3Npb24oZW5lbXkueCwgZW5lbXkueSwgZW5lbXkud2lkdGgsIGVuZW15LmhlaWdodCwgdGhpcy5kYXRhIS5nYW1lU2V0dGluZ3MuZXhwbG9zaW9uRHVyYXRpb24pKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNDb2xsaWRpbmcob2JqMTogR2FtZU9iamVjdCwgb2JqMjogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiBvYmoxLnggPCBvYmoyLnggKyBvYmoyLndpZHRoICYmXHJcbiAgICAgICAgICAgIG9iajEueCArIG9iajEud2lkdGggPiBvYmoyLnggJiZcclxuICAgICAgICAgICAgb2JqMS55IDwgb2JqMi55ICsgb2JqMi5oZWlnaHQgJiZcclxuICAgICAgICAgICAgb2JqMS55ICsgb2JqMS5oZWlnaHQgPiBvYmoyLnk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTsgLy8gQ2xlYXIgZW50aXJlIGNhbnZhc1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKFwiTG9hZGluZy4uLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWx3YXlzIGRyYXcgYmFja2dyb3VuZCBpZiBsb2FkZWRcclxuICAgICAgICB0aGlzLmJhY2tncm91bmQ/LmRyYXcodGhpcy5jdHgpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVySW5zdHJ1Y3Rpb25zU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyUGxheWluZygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyR2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5MT0FESU5HOlxyXG4gICAgICAgICAgICAgICAgLy8gTG9hZGluZyBzY3JlZW4gYWxyZWFkeSBoYW5kbGVkIGJ5IGRyYXdMb2FkaW5nU2NyZWVuXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyUGxheWluZygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlID0+IGUuZHJhdyh0aGlzLmN0eCwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGIgPT4gYi5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChiID0+IGIuZHJhdyh0aGlzLmN0eCwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMucGxheWVyPy5kcmF3KHRoaXMuY3R4LCB0aGlzKTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMuZm9yRWFjaChlID0+IGUuZHJhdyh0aGlzLmN0eCwgdGhpcykpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IFVJXHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dChgU2NvcmU6ICR7dGhpcy5zY29yZX1gLCAxMCwgMzAsICd3aGl0ZScsICdsZWZ0JywgJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dChgSGVhbHRoOiAke3RoaXMucGxheWVyPy5oZWFsdGggfHwgMH1gLCAxMCwgNjAsICd3aGl0ZScsICdsZWZ0JywgJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyVGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICBjb25zdCB0aXRsZUltYWdlID0gdGhpcy5pbWFnZXMuZ2V0KFwidGl0bGVfYmFja2dyb3VuZFwiKTsgLy8gQXNzdW1pbmcgdGl0bGVfYmFja2dyb3VuZCBpbWFnZVxyXG4gICAgICAgIGlmICh0aXRsZUltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZSh0aXRsZUltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZGFya2JsdWUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnRpdGxlU2NyZWVuVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTAsICd3aGl0ZScsICdjZW50ZXInLCAnNDhweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KFwiUHJlc3MgRU5URVIgdG8gU3RhcnRcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTAsICd3aGl0ZScsICdjZW50ZXInLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJJbnN0cnVjdGlvbnNTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICBjb25zdCB0aXRsZUltYWdlID0gdGhpcy5pbWFnZXMuZ2V0KFwidGl0bGVfYmFja2dyb3VuZFwiKTtcclxuICAgICAgICBpZiAodGl0bGVJbWFnZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UodGl0bGVJbWFnZSwgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2RhcmtibHVlJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJcdUM4NzBcdUM3OTFcdUJDOTVcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCAxMDAsICd3aGl0ZScsICdjZW50ZXInLCAnNDBweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmluc3RydWN0aW9uc1RleHQuZm9yRWFjaCgobGluZSwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChsaW5lLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIDE4MCArIGluZGV4ICogNDAsICd3aGl0ZScsICdjZW50ZXInLCAnMjBweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KFwiUHJlc3MgRU5URVIgdG8gUGxheVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAtIDEwMCwgJ3doaXRlJywgJ2NlbnRlcicsICcyNHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckdhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC43KSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmdhbWVPdmVyVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gODAsICdyZWQnLCAnY2VudGVyJywgJzYwcHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dChgRmluYWwgU2NvcmU6ICR7dGhpcy5zY29yZX1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsICd3aGl0ZScsICdjZW50ZXInLCAnMzZweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KFwiUHJlc3MgRU5URVIgdG8gcmV0dXJuIHRvIFRpdGxlXCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDgwLCAnd2hpdGUnLCAnY2VudGVyJywgJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICB9XHJcblxyXG4gICAgZHJhd1RleHQodGV4dDogc3RyaW5nLCB4OiBudW1iZXIsIHk6IG51bWJlciwgY29sb3I6IHN0cmluZywgYWxpZ246IENhbnZhc1RleHRBbGlnbiA9ICdsZWZ0JywgZm9udDogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gY29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGZvbnQ7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gYWxpZ247XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGV4dCwgeCwgeSk7XHJcbiAgICB9XHJcblxyXG4gICAgcGxheVNvdW5kKHNvdW5kTmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChzb3VuZE5hbWUpO1xyXG4gICAgICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgICAgICBjb25zdCBjbG9uZSA9IGF1ZGlvLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MQXVkaW9FbGVtZW50OyAvLyBDbG9uZSBmb3IgY29uY3VycmVudCBwbGF5YmFja1xyXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSBhdWRpby52b2x1bWU7XHJcbiAgICAgICAgICAgIGNsb25lLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBjbG9uZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYFNvdW5kIHBsYXliYWNrIGZhaWxlZDogJHtzb3VuZE5hbWV9YCwgZSkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7c291bmROYW1lfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzdGFydE11c2ljKHNvdW5kTmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuc3RvcE11c2ljKCk7IC8vIFN0b3AgYW55IGV4aXN0aW5nIG11c2ljXHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLnNvdW5kcy5nZXQoc291bmROYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5tdXNpYyA9IGF1ZGlvOyAvLyBVc2UgdGhlIG9yaWdpbmFsIEF1ZGlvIGVsZW1lbnQgZm9yIGJhY2tncm91bmQgbXVzaWNcclxuICAgICAgICAgICAgdGhpcy5tdXNpYy5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgdGhpcy5tdXNpYy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYE11c2ljIHBsYXliYWNrIGZhaWxlZDogJHtzb3VuZE5hbWV9YCwgZSkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgTXVzaWMgJyR7c291bmROYW1lfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzdG9wTXVzaWMoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMubXVzaWMpIHtcclxuICAgICAgICAgICAgdGhpcy5tdXNpYy5wYXVzZSgpO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgdGhpcy5tdXNpYyA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBHbG9iYWwgc2NvcGUgdG8gZW5zdXJlIGl0J3MgYWNjZXNzaWJsZSBieSBIVE1MXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICAgIGludGVyZmFjZSBXaW5kb3cge1xyXG4gICAgICAgIGdhbWU6IEdhbWU7XHJcbiAgICB9XHJcbn1cclxuXHJcbndpbmRvdy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAvLyBSZW1vdmVkIGN1c3RvbSBmb250IGxvYWRpbmcgdG8gY29tcGx5IHdpdGggdGhlIFwiYmFzaWMgZm9udFwiIHJlcXVpcmVtZW50LlxyXG4gICAgLy8gVXNpbmcgYSBkZWZhdWx0IHdlYi1zYWZlIGZvbnQgbGlrZSBBcmlhbCwgc2Fucy1zZXJpZi5cclxuICAgIHdpbmRvdy5nYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgIHdpbmRvdy5nYW1lLnN0YXJ0KCk7XHJcbn07XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQXlGQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxXQUFBLGFBQVU7QUFDVixFQUFBQSxXQUFBLFdBQVE7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U0FBUyxHQUFHLFNBQVMsVUFBVSx3QkFBd0I7QUFDdEksU0FBSyxTQUFTLGtDQUFrQyxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksSUFBSSxTQUFTLFVBQVUsd0JBQXdCO0FBQUEsRUFDbko7QUFBQSxFQUVBLFNBQVMsTUFBYyxHQUFXLEdBQVcsT0FBZSxRQUF5QixRQUFRLE1BQW9CO0FBQzdHLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxlQUFlO0FBQ3hCLFNBQUssSUFBSSxTQUFTLE1BQU0sR0FBRyxDQUFDO0FBQUEsRUFDaEM7QUFBQSxFQUVBLFVBQVUsV0FBbUIsT0FBZ0IsT0FBYTtBQUN0RCxVQUFNLFFBQVEsS0FBSyxPQUFPLElBQUksU0FBUztBQUN2QyxRQUFJLE9BQU87QUFDUCxZQUFNLFFBQVEsTUFBTSxVQUFVLElBQUk7QUFDbEMsWUFBTSxTQUFTLE1BQU07QUFDckIsWUFBTSxPQUFPO0FBQ2IsWUFBTSxLQUFLLEVBQUUsTUFBTSxPQUFLLFFBQVEsS0FBSywwQkFBMEIsU0FBUyxJQUFJLENBQUMsQ0FBQztBQUFBLElBQ2xGLE9BQU87QUFDSCxjQUFRLEtBQUssVUFBVSxTQUFTLGNBQWM7QUFBQSxJQUNsRDtBQUFBLEVBQ0o7QUFBQSxFQUVBLFdBQVcsV0FBbUIsT0FBZ0IsTUFBWTtBQUN0RCxTQUFLLFVBQVU7QUFDZixVQUFNLFFBQVEsS0FBSyxPQUFPLElBQUksU0FBUztBQUN2QyxRQUFJLE9BQU87QUFDUCxXQUFLLFFBQVE7QUFDYixXQUFLLE1BQU0sT0FBTztBQUNsQixXQUFLLE1BQU0sS0FBSyxFQUFFLE1BQU0sT0FBSyxRQUFRLEtBQUssMEJBQTBCLFNBQVMsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUN2RixPQUFPO0FBQ0gsY0FBUSxLQUFLLFVBQVUsU0FBUyxjQUFjO0FBQUEsSUFDbEQ7QUFBQSxFQUNKO0FBQUEsRUFFQSxZQUFrQjtBQUNkLFFBQUksS0FBSyxPQUFPO0FBQ1osV0FBSyxNQUFNLE1BQU07QUFDakIsV0FBSyxNQUFNLGNBQWM7QUFDekIsV0FBSyxRQUFRO0FBQUEsSUFDakI7QUFBQSxFQUNKO0FBQ0o7QUFTQSxPQUFPLFNBQVMsTUFBTTtBQUdsQixTQUFPLE9BQU8sSUFBSSxLQUFLLFlBQVk7QUFDbkMsU0FBTyxLQUFLLE1BQU07QUFDdEI7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSJdCn0K
