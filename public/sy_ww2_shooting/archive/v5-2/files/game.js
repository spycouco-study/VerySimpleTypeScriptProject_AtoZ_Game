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
  // Velocity Y component
  constructor(x, y, width, height, imageName, speed, damage, type, initialVx = null, initialVy = null) {
    super(x, y, width, height, imageName);
    this.speed = speed;
    this.damage = damage;
    this.type = type;
    if (type === "player") {
      this.vx = speed;
      this.vy = 0;
    } else {
      this.vx = initialVx !== null ? initialVx : -speed;
      this.vy = initialVy !== null ? initialVy : 0;
    }
  }
  update(deltaTime, game) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    if (this.x > game.canvas.width || this.x + this.width < 0 || this.y > game.canvas.height || this.y + this.height < 0) {
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
      let bulletVx = 0;
      let bulletVy = 0;
      if (game.player && !game.player.markedForDeletion) {
        const enemyCenterX = this.x + this.width / 2;
        const enemyCenterY = this.y + this.height / 2;
        const playerCenterX = game.player.x + game.player.width / 2;
        const playerCenterY = game.player.y + game.player.height / 2;
        const dx = playerCenterX - enemyCenterX;
        const dy = playerCenterY - enemyCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
          bulletVx = dx / distance * this.bulletType.speed;
          bulletVy = dy / distance * this.bulletType.speed;
        } else {
          bulletVx = -this.bulletType.speed;
          bulletVy = 0;
        }
      } else {
        bulletVx = -this.bulletType.speed;
        bulletVy = 0;
      }
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
        "enemy",
        bulletVx,
        // Pass calculated vx
        bulletVy
        // Pass calculated vy
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHt9OyAvLyBNYWtlIHRoaXMgZmlsZSBhIG1vZHVsZSB0byBhbGxvdyBnbG9iYWwgYXVnbWVudGF0aW9uXHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVNldHRpbmdzIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICBwbGF5ZXJJbml0aWFsSGVhbHRoOiBudW1iZXI7XHJcbiAgICBleHBsb3Npb25EdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0OiBzdHJpbmdbXTtcclxuICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgbG9hZGluZ1RleHQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFBsYXllckNvbmZpZyB7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7IC8vIGJ1bGxldHMgcGVyIHNlY29uZFxyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgaGl0U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEVuZW15Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyO1xyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgbW92ZW1lbnRQYXR0ZXJuOiBcInN0cmFpZ2h0XCIgfCBcInNpbmVcIiB8IFwiZGlhZ29uYWxcIjtcclxuICAgIHNob290U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEJ1bGxldENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgc291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsU3Bhd25FdmVudCB7XHJcbiAgICB0aW1lOiBudW1iZXI7IC8vIHJlbGF0aXZlIHRvIGxldmVsIHN0YXJ0LCBpbiBzZWNvbmRzXHJcbiAgICBlbmVteU5hbWU6IHN0cmluZztcclxuICAgIHN0YXJ0WDogXCJyaWdodEVkZ2VcIiB8IG51bWJlcjsgLy8geCBwb3NpdGlvbiwgb3Iga2V5d29yZFxyXG4gICAgc3RhcnRZOiBcInJhbmRvbVwiIHwgXCJ0b3BcIiB8IFwiYm90dG9tXCIgfCBudW1iZXI7IC8vIHkgcG9zaXRpb24sIG9yIGtleXdvcmRcclxuICAgIGNvdW50PzogbnVtYmVyOyAvLyBmb3Igd2F2ZXNcclxuICAgIGludGVydmFsPzogbnVtYmVyOyAvLyBmb3Igd2F2ZXMgKHNlY29uZHMpXHJcbiAgICBfc3Bhd25lZD86IGJvb2xlYW47IC8vIEludGVybmFsIGZsYWcgdG8gdHJhY2sgaWYgdGhpcyBldmVudCBoYXMgYmVlbiB0cmlnZ2VyZWRcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsQ29uZmlnIHtcclxuICAgIGR1cmF0aW9uOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgIHNwYXduRXZlbnRzOiBMZXZlbFNwYXduRXZlbnRbXTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgcGxheWVyOiBQbGF5ZXJDb25maWc7XHJcbiAgICBlbmVteVR5cGVzOiBFbmVteUNvbmZpZ1tdO1xyXG4gICAgYnVsbGV0VHlwZXM6IEJ1bGxldENvbmZpZ1tdO1xyXG4gICAgbGV2ZWxzOiBMZXZlbENvbmZpZ1tdO1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJbWFnZUFzc2V0W107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZEFzc2V0W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HID0gXCJMT0FESU5HXCIsXHJcbiAgICBUSVRMRSA9IFwiVElUTEVcIixcclxuICAgIElOU1RSVUNUSU9OUyA9IFwiSU5TVFJVQ1RJT05TXCIsXHJcbiAgICBQTEFZSU5HID0gXCJQTEFZSU5HXCIsXHJcbiAgICBHQU1FX09WRVIgPSBcIkdBTUVfT1ZFUlwiLFxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG4gICAgbWFya2VkRm9yRGVsZXRpb246IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlZCByZWZlcmVuY2UgdG8gdGhlIGxvYWRlZCBpbWFnZVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gaW1hZ2VOYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5pbWFnZSA9IGdhbWUuaW1hZ2VzLmdldCh0aGlzLmltYWdlTmFtZSkgfHwgbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAncmVkJzsgLy8gRmFsbGJhY2tcclxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7fVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gYnVsbGV0cyBwZXIgc2Vjb25kXHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBsYXN0U2hvdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBpbnZpbmNpYmxlVGltZXI6IG51bWJlciA9IDA7IC8vIGZvciBicmllZiBpbnZpbmNpYmlsaXR5IGFmdGVyIGhpdFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyQ29uZmlnID0gZ2FtZS5kYXRhIS5wbGF5ZXI7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgcGxheWVyQ29uZmlnLndpZHRoLCBwbGF5ZXJDb25maWcuaGVpZ2h0LCBwbGF5ZXJDb25maWcuaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MucGxheWVySW5pdGlhbEhlYWx0aDtcclxuICAgICAgICB0aGlzLm1heEhlYWx0aCA9IHRoaXMuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBwbGF5ZXJDb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IHBsYXllckNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IHBsYXllckNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmludmluY2libGVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNb3ZlbWVudCBiYXNlZCBvbiBpbnB1dFxyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dVcCcpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlXJykpIHRoaXMueSAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dEb3duJykgfHwgZ2FtZS5pbnB1dC5nZXQoJ0tleVMnKSkgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKGdhbWUuaW5wdXQuZ2V0KCdBcnJvd0xlZnQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5QScpKSB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICBpZiAoZ2FtZS5pbnB1dC5nZXQoJ0Fycm93UmlnaHQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5RCcpKSB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gS2VlcCBwbGF5ZXIgd2l0aGluIGNhbnZhcyBib3VuZHNcclxuICAgICAgICB0aGlzLnggPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLngsIGdhbWUuY2FudmFzLndpZHRoIC0gdGhpcy53aWR0aCkpO1xyXG4gICAgICAgIHRoaXMueSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMueSwgZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpKTtcclxuXHJcbiAgICAgICAgLy8gU2hvb3RpbmdcclxuICAgICAgICBpZiAoKGdhbWUuaW5wdXQuZ2V0KCdTcGFjZScpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlKJykpICYmIChnYW1lLmN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0U2hvdFRpbWUpID4gKDEwMDAgLyB0aGlzLmZpcmVSYXRlKSkge1xyXG4gICAgICAgICAgICBnYW1lLnBsYXllckJ1bGxldHMucHVzaChuZXcgQnVsbGV0KFxyXG4gICAgICAgICAgICAgICAgdGhpcy54ICsgdGhpcy53aWR0aCwgLy8gU3Bhd24gYnVsbGV0IGZyb20gcGxheWVyJ3MgcmlnaHQgZWRnZVxyXG4gICAgICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyIC0gdGhpcy5idWxsZXRUeXBlLmhlaWdodCAvIDIsIC8vIENlbnRlcmVkIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS53aWR0aCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuaW1hZ2UsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuc3BlZWQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuZGFtYWdlLFxyXG4gICAgICAgICAgICAgICAgXCJwbGF5ZXJcIlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQodGhpcy5idWxsZXRUeXBlLnNvdW5kKTtcclxuICAgICAgICAgICAgdGhpcy5sYXN0U2hvdFRpbWUgPSBnYW1lLmN1cnJlbnRUaW1lO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGRhbWFnZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5oZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTb3VuZChnYW1lLmRhdGEhLnBsYXllci5oaXRTb3VuZCk7XHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gMTsgLy8gMSBzZWNvbmQgaW52aW5jaWJpbGl0eVxyXG4gICAgICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBnYW1lLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MuZXhwbG9zaW9uRHVyYXRpb24pKTtcclxuICAgICAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQoXCJnYW1lX292ZXJcIik7IC8vIFBsYXkgZ2FtZSBvdmVyIHNvdW5kXHJcbiAgICAgICAgICAgICAgICBnYW1lLnNldFN0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmxlVGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIEZsYXNoIGVmZmVjdCBkdXJpbmcgaW52aW5jaWJpbGl0eVxyXG4gICAgICAgICAgICBpZiAoTWF0aC5mbG9vcih0aGlzLmludmluY2libGVUaW1lciAqIDEwKSAlIDIgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHN1cGVyLmRyYXcoY3R4LCBnYW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHN1cGVyLmRyYXcoY3R4LCBnYW1lKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEJ1bGxldCBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgdHlwZTogXCJwbGF5ZXJcIiB8IFwiZW5lbXlcIjtcclxuICAgIHZ4OiBudW1iZXI7IC8vIFZlbG9jaXR5IFggY29tcG9uZW50XHJcbiAgICB2eTogbnVtYmVyOyAvLyBWZWxvY2l0eSBZIGNvbXBvbmVudFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcsIHNwZWVkOiBudW1iZXIsIGRhbWFnZTogbnVtYmVyLCB0eXBlOiBcInBsYXllclwiIHwgXCJlbmVteVwiLCBpbml0aWFsVng6IG51bWJlciB8IG51bGwgPSBudWxsLCBpbml0aWFsVnk6IG51bWJlciB8IG51bGwgPSBudWxsKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VOYW1lKTtcclxuICAgICAgICB0aGlzLnNwZWVkID0gc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5kYW1hZ2UgPSBkYW1hZ2U7XHJcbiAgICAgICAgdGhpcy50eXBlID0gdHlwZTtcclxuXHJcbiAgICAgICAgaWYgKHR5cGUgPT09IFwicGxheWVyXCIpIHtcclxuICAgICAgICAgICAgdGhpcy52eCA9IHNwZWVkOyAvLyBQbGF5ZXIgYnVsbGV0cyBhbHdheXMgbW92ZSByaWdodCBhdCAnc3BlZWQnXHJcbiAgICAgICAgICAgIHRoaXMudnkgPSAwO1xyXG4gICAgICAgIH0gZWxzZSB7IC8vIGVuZW15IGJ1bGxldFxyXG4gICAgICAgICAgICAvLyBVc2UgcHJvdmlkZWQgaW5pdGlhbFZ4L1Z5LCBvciBkZWZhdWx0IHRvIHN0cmFpZ2h0IGxlZnQgaWYgbm90IHByb3ZpZGVkXHJcbiAgICAgICAgICAgIHRoaXMudnggPSBpbml0aWFsVnggIT09IG51bGwgPyBpbml0aWFsVnggOiAtc3BlZWQ7XHJcbiAgICAgICAgICAgIHRoaXMudnkgPSBpbml0aWFsVnkgIT09IG51bGwgPyBpbml0aWFsVnkgOiAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICAvLyBCb3RoIHBsYXllciBhbmQgZW5lbXkgYnVsbGV0cyBub3cgdXNlIHZ4IGFuZCB2eSBmb3IgbW92ZW1lbnRcclxuICAgICAgICB0aGlzLnggKz0gdGhpcy52eCAqIGRlbHRhVGltZTtcclxuICAgICAgICB0aGlzLnkgKz0gdGhpcy52eSAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gTWFyayBmb3IgZGVsZXRpb24gaWYgb2ZmIHNjcmVlbiAoY2hlY2tzIGFsbCA0IHNpZGVzKVxyXG4gICAgICAgIGlmICh0aGlzLnggPiBnYW1lLmNhbnZhcy53aWR0aCB8fCB0aGlzLnggKyB0aGlzLndpZHRoIDwgMCB8fCB0aGlzLnkgPiBnYW1lLmNhbnZhcy5oZWlnaHQgfHwgdGhpcy55ICsgdGhpcy5oZWlnaHQgPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRW5lbXkgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7XHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBtb3ZlbWVudFBhdHRlcm46IFwic3RyYWlnaHRcIiB8IFwic2luZVwiIHwgXCJkaWFnb25hbFwiO1xyXG4gICAgbGFzdFNob3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgaW5pdGlhbFk6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSBvciBkaWFnb25hbCBwYXR0ZXJuc1xyXG4gICAgc2luZVdhdmVPZmZzZXQ6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSB0byBtYWtlIGVhY2ggZW5lbXkncyBwYXR0ZXJuIHVuaXF1ZVxyXG4gICAgdmVydGljYWxEaXJlY3Rpb246IDEgfCAtMSA9IDE7IC8vIEZvciBkaWFnb25hbCBtb3ZlbWVudDogMSBmb3IgZG93biwgLTEgZm9yIHVwXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbmZpZzogRW5lbXlDb25maWcsIGdhbWU6IEdhbWUpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCBjb25maWcud2lkdGgsIGNvbmZpZy5oZWlnaHQsIGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBjb25maWcuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IGNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBjb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IGNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IGNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICAgICAgdGhpcy5tb3ZlbWVudFBhdHRlcm4gPSBjb25maWcubW92ZW1lbnRQYXR0ZXJuO1xyXG4gICAgICAgIHRoaXMuaW5pdGlhbFkgPSB5O1xyXG4gICAgICAgIHRoaXMuc2luZVdhdmVPZmZzZXQgPSBNYXRoLnJhbmRvbSgpICogTWF0aC5QSSAqIDI7IC8vIFJhbmRvbSBwaGFzZSBmb3Igc2luZSB3YXZlXHJcbiAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IChNYXRoLnJhbmRvbSgpIDwgMC41KSA/IDEgOiAtMTsgLy8gUmFuZG9tIGluaXRpYWwgZGlyZWN0aW9uIGZvciBkaWFnb25hbFxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIC8vIEhvcml6b250YWwgbW92ZW1lbnRcclxuICAgICAgICB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gVmVydGljYWwgbW92ZW1lbnQgYmFzZWQgb24gcGF0dGVyblxyXG4gICAgICAgIGlmICh0aGlzLm1vdmVtZW50UGF0dGVybiA9PT0gXCJzaW5lXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgYW1wbGl0dWRlID0gNTA7IC8vIEhvdyBmYXIgdXAvZG93biBpdCBtb3Zlc1xyXG4gICAgICAgICAgICBjb25zdCBmcmVxdWVuY3kgPSAyOyAvLyBIb3cgZmFzdCBpdCB3aWdnbGVzXHJcbiAgICAgICAgICAgIHRoaXMueSA9IHRoaXMuaW5pdGlhbFkgKyBNYXRoLnNpbihnYW1lLmN1cnJlbnRUaW1lICogMC4wMDEgKiBmcmVxdWVuY3kgKyB0aGlzLnNpbmVXYXZlT2Zmc2V0KSAqIGFtcGxpdHVkZTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMubW92ZW1lbnRQYXR0ZXJuID09PSBcImRpYWdvbmFsXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhZ29uYWxTcGVlZCA9IHRoaXMuc3BlZWQgKiAwLjc7IC8vIFNsb3dlciB2ZXJ0aWNhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICB0aGlzLnkgKz0gdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiAqIGRpYWdvbmFsU3BlZWQgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBSZXZlcnNlIGRpcmVjdGlvbiBpZiBoaXR0aW5nIHRvcCBvciBib3R0b20gZWRnZXNcclxuICAgICAgICAgICAgaWYgKHRoaXMueSA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnkgPSAwO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IDE7IC8vIE1vdmUgZG93blxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMueSA+PSBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy55ID0gZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRpY2FsRGlyZWN0aW9uID0gLTE7IC8vIE1vdmUgdXBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGFtcCBZIHRvIHN0YXkgb24gc2NyZWVuIChvbmx5IG5lZWRlZCBpZiBtb3ZlbWVudCBwYXR0ZXJuIGRvZXNuJ3QgaGFuZGxlIGl0LCBlLmcuLCAnc3RyYWlnaHQnKVxyXG4gICAgICAgIC8vIEZvciAnc2luZScgYW5kICdkaWFnb25hbCcsIHRoZWlyIGxvZ2ljIHVzdWFsbHkgaW1wbGljaXRseSBrZWVwcyBpdCB3aXRoaW4gYm91bmRzIG9yXHJcbiAgICAgICAgLy8gdGhlIGJvdW5jZSBsb2dpYyBhZGp1c3RzIGl0LiBLZWVwaW5nIGl0IGFzIGEgZ2VuZXJhbCBmYWxsYmFjaywgdGhvdWdoIGxlc3MgY3JpdGljYWwgZm9yIHVwZGF0ZWQgZGlhZ29uYWwuXHJcbiAgICAgICAgdGhpcy55ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy55LCBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkpO1xyXG5cclxuXHJcbiAgICAgICAgLy8gU2hvb3RpbmdcclxuICAgICAgICBpZiAodGhpcy5maXJlUmF0ZSA+IDAgJiYgKGdhbWUuY3VycmVudFRpbWUgLSB0aGlzLmxhc3RTaG90VGltZSkgPiAoMTAwMCAvIHRoaXMuZmlyZVJhdGUpKSB7XHJcbiAgICAgICAgICAgIGxldCBidWxsZXRWeDogbnVtYmVyID0gMDtcclxuICAgICAgICAgICAgbGV0IGJ1bGxldFZ5OiBudW1iZXIgPSAwO1xyXG5cclxuICAgICAgICAgICAgaWYgKGdhbWUucGxheWVyICYmICFnYW1lLnBsYXllci5tYXJrZWRGb3JEZWxldGlvbikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZW5lbXlDZW50ZXJYID0gdGhpcy54ICsgdGhpcy53aWR0aCAvIDI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlbmVteUNlbnRlclkgPSB0aGlzLnkgKyB0aGlzLmhlaWdodCAvIDI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwbGF5ZXJDZW50ZXJYID0gZ2FtZS5wbGF5ZXIueCArIGdhbWUucGxheWVyLndpZHRoIC8gMjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBsYXllckNlbnRlclkgPSBnYW1lLnBsYXllci55ICsgZ2FtZS5wbGF5ZXIuaGVpZ2h0IC8gMjtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBkeCA9IHBsYXllckNlbnRlclggLSBlbmVteUNlbnRlclg7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkeSA9IHBsYXllckNlbnRlclkgLSBlbmVteUNlbnRlclk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZSA+IDApIHsgLy8gQXZvaWQgZGl2aXNpb24gYnkgemVyb1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgZGlyZWN0aW9uIHZlY3RvciBhbmQgc2NhbGUgYnkgYnVsbGV0IHNwZWVkXHJcbiAgICAgICAgICAgICAgICAgICAgYnVsbGV0VnggPSAoZHggLyBkaXN0YW5jZSkgKiB0aGlzLmJ1bGxldFR5cGUuc3BlZWQ7XHJcbiAgICAgICAgICAgICAgICAgICAgYnVsbGV0VnkgPSAoZHkgLyBkaXN0YW5jZSkgKiB0aGlzLmJ1bGxldFR5cGUuc3BlZWQ7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFBsYXllciBpcyBhdCB0aGUgc2FtZSBzcG90IGFzIGVuZW15LCBzaG9vdCBzdHJhaWdodCBsZWZ0IGFzIGZhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICAgICAgYnVsbGV0VnggPSAtdGhpcy5idWxsZXRUeXBlLnNwZWVkO1xyXG4gICAgICAgICAgICAgICAgICAgIGJ1bGxldFZ5ID0gMDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIE5vIHBsYXllciBvciBwbGF5ZXIgZGVsZXRlZCwgc2hvb3Qgc3RyYWlnaHQgbGVmdCBhcyBmYWxsYmFja1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0VnggPSAtdGhpcy5idWxsZXRUeXBlLnNwZWVkO1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0VnkgPSAwO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBnYW1lLmVuZW15QnVsbGV0cy5wdXNoKG5ldyBCdWxsZXQoXHJcbiAgICAgICAgICAgICAgICB0aGlzLnggLSB0aGlzLmJ1bGxldFR5cGUud2lkdGgsIC8vIFNwYXduIGJ1bGxldCBmcm9tIGVuZW15J3MgbGVmdCBlZGdlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnkgKyB0aGlzLmhlaWdodCAvIDIgLSB0aGlzLmJ1bGxldFR5cGUuaGVpZ2h0IC8gMiwgLy8gQ2VudGVyZWQgdmVydGljYWxseVxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmhlaWdodCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5pbWFnZSxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5zcGVlZCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5kYW1hZ2UsXHJcbiAgICAgICAgICAgICAgICBcImVuZW15XCIsXHJcbiAgICAgICAgICAgICAgICBidWxsZXRWeCwgLy8gUGFzcyBjYWxjdWxhdGVkIHZ4XHJcbiAgICAgICAgICAgICAgICBidWxsZXRWeSAgLy8gUGFzcyBjYWxjdWxhdGVkIHZ5XHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTb3VuZCh0aGlzLmJ1bGxldFR5cGUuc291bmQpO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RTaG90VGltZSA9IGdhbWUuY3VycmVudFRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNYXJrIGZvciBkZWxldGlvbiBpZiBvZmYgc2NyZWVuXHJcbiAgICAgICAgaWYgKHRoaXMueCArIHRoaXMud2lkdGggPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGRhbWFnZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgIGlmICh0aGlzLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICBnYW1lLnNjb3JlICs9IHRoaXMuc2NvcmVWYWx1ZTtcclxuICAgICAgICAgICAgZ2FtZS5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbih0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQsIGdhbWUuZGF0YSEuZ2FtZVNldHRpbmdzLmV4cGxvc2lvbkR1cmF0aW9uKSk7XHJcbiAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRXhwbG9zaW9uIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICB0aW1lcjogbnVtYmVyO1xyXG4gICAgZHVyYXRpb246IG51bWJlcjsgLy8gaW4gc2Vjb25kc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZHVyYXRpb246IG51bWJlcikge1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIFwiZXhwbG9zaW9uXCIpOyAvLyBBc3N1bWluZyBcImV4cGxvc2lvblwiIGlzIHRoZSBpbWFnZSBuYW1lXHJcbiAgICAgICAgdGhpcy5kdXJhdGlvbiA9IGR1cmF0aW9uO1xyXG4gICAgICAgIHRoaXMudGltZXIgPSBkdXJhdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICBpZiAodGhpcy50aW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQmFja2dyb3VuZCB7XHJcbiAgICBpbWFnZTogSFRNTEltYWdlRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG4gICAgc2Nyb2xsU3BlZWQ6IG51bWJlcjtcclxuICAgIHgxOiBudW1iZXIgPSAwO1xyXG4gICAgeDI6IG51bWJlciA9IDA7IC8vIGZvciBjb250aW51b3VzIHNjcm9sbGluZ1xyXG4gICAgZ2FtZVdpZHRoOiBudW1iZXI7XHJcbiAgICBnYW1lSGVpZ2h0OiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoaW1hZ2VOYW1lOiBzdHJpbmcsIHNjcm9sbFNwZWVkOiBudW1iZXIsIGdhbWVXaWR0aDogbnVtYmVyLCBnYW1lSGVpZ2h0OiBudW1iZXIsIGdhbWU6IEdhbWUpIHtcclxuICAgICAgICB0aGlzLmltYWdlID0gZ2FtZS5pbWFnZXMuZ2V0KGltYWdlTmFtZSkgfHwgbnVsbDtcclxuICAgICAgICB0aGlzLnNjcm9sbFNwZWVkID0gc2Nyb2xsU3BlZWQ7XHJcbiAgICAgICAgdGhpcy5nYW1lV2lkdGggPSBnYW1lV2lkdGg7XHJcbiAgICAgICAgdGhpcy5nYW1lSGVpZ2h0ID0gZ2FtZUhlaWdodDtcclxuICAgICAgICBpZiAodGhpcy5pbWFnZSkge1xyXG4gICAgICAgICAgICAvLyBJbml0aWFsaXplIHBvc2l0aW9ucyBmb3IgdHdvIHRpbGVzIHRvIGNvdmVyIHRoZSBzY3JlZW4gYW5kIGJleW9uZFxyXG4gICAgICAgICAgICB0aGlzLngxID0gMDtcclxuICAgICAgICAgICAgLy8gRW5zdXJlIHgyIHN0YXJ0cyB3aGVyZSB4MSBlbmRzLCBoYW5kbGluZyBwb3RlbnRpYWwgaW1hZ2Ugd2lkdGggZGlmZmVyZW5jZXNcclxuICAgICAgICAgICAgLy8gVGhlIGltYWdlIG1pZ2h0IG5vdCBiZSBleGFjdGx5IGNhbnZhcyB3aWR0aCwgc28gd2UgdGlsZSBpdCBiYXNlZCBvbiBpdHMgb3duIHdpZHRoLlxyXG4gICAgICAgICAgICB0aGlzLngyID0gdGhpcy5pbWFnZS53aWR0aDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmltYWdlKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHNjcm9sbEFtb3VudCA9IHRoaXMuc2Nyb2xsU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgdGhpcy54MSAtPSBzY3JvbGxBbW91bnQ7XHJcbiAgICAgICAgdGhpcy54MiAtPSBzY3JvbGxBbW91bnQ7XHJcblxyXG4gICAgICAgIC8vIElmIGFuIGltYWdlIHRpbGUgbW92ZXMgY29tcGxldGVseSBvZmYtc2NyZWVuIHRvIHRoZSBsZWZ0LCByZXNldCBpdCB0byB0aGUgcmlnaHRcclxuICAgICAgICBpZiAodGhpcy54MSA8PSAtdGhpcy5pbWFnZS53aWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLngxID0gdGhpcy54MiArIHRoaXMuaW1hZ2Uud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLngyIDw9IC10aGlzLmltYWdlLndpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMueDIgPSB0aGlzLngxICsgdGhpcy5pbWFnZS53aWR0aDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmltYWdlKSB7XHJcbiAgICAgICAgICAgIC8vIERyYXcgYm90aCBiYWNrZ3JvdW5kIHRpbGVzLCBzY2FsZWQgdG8gY2FudmFzIGhlaWdodFxyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueDEsIDAsIHRoaXMuaW1hZ2Uud2lkdGgsIHRoaXMuZ2FtZUhlaWdodCk7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54MiwgMCwgdGhpcy5pbWFnZS53aWR0aCwgdGhpcy5nYW1lSGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIGRhdGE6IEdhbWVEYXRhIHwgbnVsbCA9IG51bGw7XHJcbiAgICBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICBsYXN0RnJhbWVUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgY3VycmVudFRpbWU6IG51bWJlciA9IDA7IC8vIFRvdGFsIGVsYXBzZWQgdGltZSBpbiBtaWxsaXNlY29uZHNcclxuXHJcbiAgICBwbGF5ZXI6IFBsYXllciB8IG51bGwgPSBudWxsO1xyXG4gICAgZW5lbWllczogRW5lbXlbXSA9IFtdO1xyXG4gICAgcGxheWVyQnVsbGV0czogQnVsbGV0W10gPSBbXTtcclxuICAgIGVuZW15QnVsbGV0czogQnVsbGV0W10gPSBbXTtcclxuICAgIGV4cGxvc2lvbnM6IEV4cGxvc2lvbltdID0gW107XHJcbiAgICBiYWNrZ3JvdW5kOiBCYWNrZ3JvdW5kIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBjdXJyZW50TGV2ZWxJbmRleDogbnVtYmVyID0gMDtcclxuICAgIGxldmVsVGltZXI6IG51bWJlciA9IDA7IC8vIFRpbWUgZWxhcHNlZCBpbiBjdXJyZW50IGxldmVsIChzZWNvbmRzKVxyXG4gICAgYWN0aXZlU3Bhd25JbnRlcnZhbHM6IFNldDxudW1iZXI+ID0gbmV3IFNldCgpOyAvLyBUbyBjbGVhciBpbnRlcnZhbHMgd2hlbiBjaGFuZ2luZyBsZXZlbHNcclxuXHJcbiAgICBpbnB1dDogTWFwPHN0cmluZywgYm9vbGVhbj4gPSBuZXcgTWFwKCk7XHJcbiAgICBtdXNpYzogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG4gICAgICAgIHRoaXMuaW5pdEV2ZW50TGlzdGVuZXJzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbihcIkxvYWRpbmcgR2FtZSBEYXRhLi4uXCIpO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcblxyXG4gICAgICAgICAgICBpZiAoIXRoaXMuZGF0YSkgdGhyb3cgbmV3IEVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhLlwiKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5jYW52YXNIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKFwiTG9hZGluZyBBc3NldHMuLi5cIik7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAgICAgLy8gU2V0IHVwIGJhY2tncm91bmQgYWZ0ZXIgbG9hZGluZyBhc3NldHNcclxuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kID0gbmV3IEJhY2tncm91bmQoXHJcbiAgICAgICAgICAgICAgICBcImJhY2tncm91bmRcIixcclxuICAgICAgICAgICAgICAgIHRoaXMuZGF0YS5nYW1lU2V0dGluZ3Muc2Nyb2xsU3BlZWQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCxcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCxcclxuICAgICAgICAgICAgICAgIHRoaXNcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZShHYW1lU3RhdGUuVElUTEUpO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzdGFydCBnYW1lOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oYEVycm9yOiAke2Vycm9yfWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdMb2FkaW5nU2NyZWVuKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsLCBzYW5zLXNlcmlmJzsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobWVzc2FnZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuZGF0YS5hc3NldHMuaW1hZ2VzLm1hcChhc3luYyAoYXNzZXQpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChhc3NldC5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcy5tYXAoYXN5bmMgKGFzc2V0KSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8uc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIC8vIFByZWxvYWQgdG8gZW5zdXJlIGl0J3MgcmVhZHlcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0RXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoWydBcnJvd1VwJywgJ0Fycm93RG93bicsICdBcnJvd0xlZnQnLCAnQXJyb3dSaWdodCcsICdTcGFjZScsICdLZXlXJywgJ0tleUEnLCAnS2V5UycsICdLZXlEJywgJ0tleUonLCAnRW50ZXInXS5pbmNsdWRlcyhlLmNvZGUpKSB7XHJcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgc2Nyb2xsaW5nIGZvciBhcnJvdyBrZXlzL3NwYWNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0LnNldChlLmNvZGUsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGUuY29kZSA9PT0gJ0VudGVyJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlRW50ZXJLZXkoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChbJ0Fycm93VXAnLCAnQXJyb3dEb3duJywgJ0Fycm93TGVmdCcsICdBcnJvd1JpZ2h0JywgJ1NwYWNlJywgJ0tleVcnLCAnS2V5QScsICdLZXlTJywgJ0tleUQnLCAnS2V5SicsICdFbnRlciddLmluY2x1ZGVzKGUuY29kZSkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5wdXQuc2V0KGUuY29kZSwgZmFsc2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVFbnRlcktleSgpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZShHYW1lU3RhdGUuSU5TVFJVQ1RJT05TKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5QTEFZSU5HKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5USVRMRSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzZXRTdGF0ZShuZXdTdGF0ZTogR2FtZVN0YXRlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBuZXdTdGF0ZTtcclxuICAgICAgICBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhcnRNdXNpYyhcImJnbVwiLCB0cnVlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnN0b3BNdXNpYygpO1xyXG4gICAgICAgICAgICBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICAgICAgLy8gT3B0aW9uYWxseSBwbGF5IHRpdGxlIHNjcmVlbiBzcGVjaWZpYyBtdXNpYyBoZXJlXHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgICAgIC8vIEdhbWUgb3ZlciBzb3VuZCBpcyBwbGF5ZWQgaW4gUGxheWVyLnRha2VEYW1hZ2VcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGVhciBhbnkgYWN0aXZlIHNwYXduIGludGVydmFscyB3aGVuIHN0YXRlIGNoYW5nZXMgZnJvbSBQTEFZSU5HXHJcbiAgICAgICAgaWYgKG5ld1N0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmZvckVhY2goaWQgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmNsZWFyKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGluaXRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCAqIDAuMSxcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIHRoaXMuZGF0YS5wbGF5ZXIuaGVpZ2h0IC8gMixcclxuICAgICAgICAgICAgdGhpc1xyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gW107XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSBbXTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRMZXZlbEluZGV4ID0gMDtcclxuICAgICAgICB0aGlzLmxldmVsVGltZXIgPSAwO1xyXG4gICAgICAgIC8vIFJlc2V0IF9zcGF3bmVkIGZsYWcgZm9yIGFsbCBldmVudHMgaW4gYWxsIGxldmVsc1xyXG4gICAgICAgIHRoaXMuZGF0YS5sZXZlbHMuZm9yRWFjaChsZXZlbCA9PiB7XHJcbiAgICAgICAgICAgIGxldmVsLnNwYXduRXZlbnRzLmZvckVhY2goZXZlbnQgPT4gZXZlbnQuX3NwYXduZWQgPSBmYWxzZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2FtZUxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkge1xyXG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWVzdGFtcCAtIHRoaXMubGFzdEZyYW1lVGltZSkgLyAxMDAwOyAvLyBEZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSB0aW1lc3RhbXA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50VGltZSA9IHRpbWVzdGFtcDsgLy8gVG90YWwgZWxhcHNlZCB0aW1lIGluIG1pbGxpc2Vjb25kc1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5aW5nKGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGVQbGF5aW5nKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllciB8fCAhdGhpcy5kYXRhIHx8ICF0aGlzLmJhY2tncm91bmQpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBMZXZlbCBwcm9ncmVzc2lvbiBhbmQgZW5lbXkgc3Bhd25pbmdcclxuICAgICAgICB0aGlzLmxldmVsVGltZXIgKz0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRMZXZlbENvbmZpZyA9IHRoaXMuZGF0YS5sZXZlbHNbdGhpcy5jdXJyZW50TGV2ZWxJbmRleF07XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50TGV2ZWxDb25maWcpIHtcclxuICAgICAgICAgICAgY3VycmVudExldmVsQ29uZmlnLnNwYXduRXZlbnRzLmZvckVhY2goZXZlbnQgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LnRpbWUgPD0gdGhpcy5sZXZlbFRpbWVyICYmICFldmVudC5fc3Bhd25lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5jb3VudCAmJiBldmVudC5pbnRlcnZhbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudC5fc3Bhd25lZCA9IHRydWU7IC8vIE1hcmsgYXMgc3Bhd25lZCB0byBwcmV2ZW50IHJlLXRyaWdnZXJpbmcgd2F2ZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgc3Bhd25lZENvdW50ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW50ZXJ2YWxJZCA9IHNldEludGVydmFsKCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzcGF3bmVkQ291bnQgPCBldmVudC5jb3VudCEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRW5lbXkoZXZlbnQuZW5lbXlOYW1lLCBldmVudC5zdGFydFgsIGV2ZW50LnN0YXJ0WSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3Bhd25lZENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWxJZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5kZWxldGUoaW50ZXJ2YWxJZCBhcyBudW1iZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBldmVudC5pbnRlcnZhbCAqIDEwMDApOyAvLyBpbnRlcnZhbCBpbiBtaWxsaXNlY29uZHNcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5hZGQoaW50ZXJ2YWxJZCBhcyBudW1iZXIpOyAvLyBTdG9yZSBJRCB0byBjbGVhciBsYXRlclxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNpbmdsZSBlbmVteSBzcGF3blxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRW5lbXkoZXZlbnQuZW5lbXlOYW1lLCBldmVudC5zdGFydFgsIGV2ZW50LnN0YXJ0WSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50Ll9zcGF3bmVkID0gdHJ1ZTsgLy8gTWFyayBhcyBzcGF3bmVkXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIGxldmVsIGR1cmF0aW9uIGlzIG92ZXIsIGFkdmFuY2UgdG8gbmV4dCBsZXZlbCBvciBlbmQgZ2FtZVxyXG4gICAgICAgICAgICBpZiAodGhpcy5sZXZlbFRpbWVyID49IGN1cnJlbnRMZXZlbENvbmZpZy5kdXJhdGlvbikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCsrO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sZXZlbFRpbWVyID0gMDsgLy8gUmVzZXQgdGltZXIgZm9yIHRoZSBuZXcgbGV2ZWxcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBDbGVhciBhbnkgcmVtYWluaW5nIGludGVydmFscyBmb3IgdGhlIGp1c3QtZW5kZWQgbGV2ZWxcclxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuZm9yRWFjaChpZCA9PiBjbGVhckludGVydmFsKGlkKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmNsZWFyKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmRhdGEubGV2ZWxzW3RoaXMuY3VycmVudExldmVsSW5kZXhdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWxsIGxldmVscyBjb21wbGV0ZWRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVIpOyAvLyBDb3VsZCBiZSAnVklDVE9SWScgc3RhdGVcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIE5vIG1vcmUgbGV2ZWxzLCBwZXJoYXBzIGtlZXAgcHJldmlvdXMgbGV2ZWwncyBzcGF3bnMgb3IganVzdCB3YWl0IGZvciBwbGF5ZXIgdG8gZmluaXNoXHJcbiAgICAgICAgICAgIC8vIEZvciBub3csIGxldCdzIGp1c3QgdHJhbnNpdGlvbiB0byBnYW1lIG92ZXIuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgYW5kIGZpbHRlciBnYW1lIG9iamVjdHNcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlID0+IGUudXBkYXRlKGRlbHRhVGltZSwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGIgPT4gYi51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChiID0+IGIudXBkYXRlKGRlbHRhVGltZSwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGUgPT4gZS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIENvbGxpc2lvbiBkZXRlY3Rpb25cclxuICAgICAgICB0aGlzLmNoZWNrQ29sbGlzaW9ucygpO1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgbWFya2VkIGZvciBkZWxldGlvblxyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IHRoaXMuZW5lbWllcy5maWx0ZXIoZSA9PiAhZS5tYXJrZWRGb3JEZWxldGlvbik7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzID0gdGhpcy5wbGF5ZXJCdWxsZXRzLmZpbHRlcihiID0+ICFiLm1hcmtlZEZvckRlbGV0aW9uKTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cyA9IHRoaXMuZW5lbXlCdWxsZXRzLmZpbHRlcihiID0+ICFiLm1hcmtlZEZvckRlbGV0aW9uKTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSB0aGlzLmV4cGxvc2lvbnMuZmlsdGVyKGUgPT4gIWUubWFya2VkRm9yRGVsZXRpb24pO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBnYW1lIG92ZXIgY29uZGl0aW9uIChwbGF5ZXIuaGVhbHRoIDw9IDAgaXMgaGFuZGxlZCBpbiBQbGF5ZXIudGFrZURhbWFnZSlcclxuICAgIH1cclxuXHJcbiAgICBzcGF3bkVuZW15KGVuZW15TmFtZTogc3RyaW5nLCBzdGFydFg6IFwicmlnaHRFZGdlXCIgfCBudW1iZXIsIHN0YXJ0WTogXCJyYW5kb21cIiB8IFwidG9wXCIgfCBcImJvdHRvbVwiIHwgbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICBjb25zdCBlbmVteUNvbmZpZyA9IHRoaXMuZGF0YS5lbmVteVR5cGVzLmZpbmQoZSA9PiBlLm5hbWUgPT09IGVuZW15TmFtZSk7XHJcbiAgICAgICAgaWYgKCFlbmVteUNvbmZpZykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYEVuZW15IHR5cGUgJyR7ZW5lbXlOYW1lfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgYWN0dWFsWCA9IHN0YXJ0WCA9PT0gXCJyaWdodEVkZ2VcIiA/IHRoaXMuY2FudmFzLndpZHRoIDogc3RhcnRYO1xyXG4gICAgICAgIGxldCBhY3R1YWxZOiBudW1iZXI7XHJcblxyXG4gICAgICAgIGlmIChzdGFydFkgPT09IFwicmFuZG9tXCIpIHtcclxuICAgICAgICAgICAgYWN0dWFsWSA9IE1hdGgucmFuZG9tKCkgKiAodGhpcy5jYW52YXMuaGVpZ2h0IC0gZW5lbXlDb25maWcuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0WSA9PT0gXCJ0b3BcIikge1xyXG4gICAgICAgICAgICBhY3R1YWxZID0gMDtcclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0WSA9PT0gXCJib3R0b21cIikge1xyXG4gICAgICAgICAgICBhY3R1YWxZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC0gZW5lbXlDb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGFjdHVhbFkgPSBzdGFydFk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVuZW1pZXMucHVzaChuZXcgRW5lbXkoYWN0dWFsWCwgYWN0dWFsWSwgZW5lbXlDb25maWcsIHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBjaGVja0NvbGxpc2lvbnMoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllcikgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgYnVsbGV0cyB2cy4gRW5lbWllc1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICghYnVsbGV0Lm1hcmtlZEZvckRlbGV0aW9uICYmICFlbmVteS5tYXJrZWRGb3JEZWxldGlvbiAmJiB0aGlzLmlzQ29sbGlkaW5nKGJ1bGxldCwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkudGFrZURhbWFnZShidWxsZXQuZGFtYWdlLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBidWxsZXQubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRW5lbXkgYnVsbGV0cyB2cy4gUGxheWVyXHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWJ1bGxldC5tYXJrZWRGb3JEZWxldGlvbiAmJiAhdGhpcy5wbGF5ZXIhLm1hcmtlZEZvckRlbGV0aW9uICYmIHRoaXMuaXNDb2xsaWRpbmcoYnVsbGV0LCB0aGlzLnBsYXllciEpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllciEudGFrZURhbWFnZShidWxsZXQuZGFtYWdlLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHZzLiBFbmVtaWVzIChjb250YWN0IGRhbWFnZS9jb2xsaXNpb24pXHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWVuZW15Lm1hcmtlZEZvckRlbGV0aW9uICYmICF0aGlzLnBsYXllciEubWFya2VkRm9yRGVsZXRpb24gJiYgdGhpcy5pc0NvbGxpZGluZyh0aGlzLnBsYXllciEsIGVuZW15KSkge1xyXG4gICAgICAgICAgICAgICAgLy8gUGxheWVyIHRha2VzIGRhbWFnZSBhbmQgZW5lbXkgaXMgZGVzdHJveWVkXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllciEudGFrZURhbWFnZShlbmVteS5oZWFsdGgsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgZW5lbXkubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbihlbmVteS54LCBlbmVteS55LCBlbmVteS53aWR0aCwgZW5lbXkuaGVpZ2h0LCB0aGlzLmRhdGEhLmdhbWVTZXR0aW5ncy5leHBsb3Npb25EdXJhdGlvbikpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoXCJleHBsb3Npb25cIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpc0NvbGxpZGluZyhvYmoxOiBHYW1lT2JqZWN0LCBvYmoyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIG9iajEueCA8IG9iajIueCArIG9iajIud2lkdGggJiZcclxuICAgICAgICAgICAgb2JqMS54ICsgb2JqMS53aWR0aCA+IG9iajIueCAmJlxyXG4gICAgICAgICAgICBvYmoxLnkgPCBvYmoyLnkgKyBvYmoyLmhlaWdodCAmJlxyXG4gICAgICAgICAgICBvYmoxLnkgKyBvYmoxLmhlaWdodCA+IG9iajIueTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpOyAvLyBDbGVhciBlbnRpcmUgY2FudmFzXHJcblxyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oXCJMb2FkaW5nLi4uXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBbHdheXMgZHJhdyBiYWNrZ3JvdW5kIGlmIGxvYWRlZFxyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZD8uZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJQbGF5aW5nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyBMb2FkaW5nIHNjcmVlbiBhbHJlYWR5IGhhbmRsZWQgYnkgZHJhd0xvYWRpbmdTY3JlZW5cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJQbGF5aW5nKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGUgPT4gZS5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYiA9PiBiLmRyYXcodGhpcy5jdHgsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGIgPT4gYi5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXI/LmRyYXcodGhpcy5jdHgsIHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGUgPT4gZS5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUlcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBTY29yZTogJHt0aGlzLnNjb3JlfWAsIDEwLCAzMCwgJ3doaXRlJywgJ2xlZnQnLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBIZWFsdGg6ICR7dGhpcy5wbGF5ZXI/LmhlYWx0aCB8fCAwfWAsIDEwLCA2MCwgJ3doaXRlJywgJ2xlZnQnLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpOyAvLyBBc3N1bWluZyB0aXRsZV9iYWNrZ3JvdW5kIGltYWdlXHJcbiAgICAgICAgaWYgKHRpdGxlSW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRpdGxlSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdkYXJrYmx1ZSc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgJ3doaXRlJywgJ2NlbnRlcicsICc0OHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byBTdGFydFwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJ3doaXRlJywgJ2NlbnRlcicsICcyNHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckluc3RydWN0aW9uc1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlmICh0aXRsZUltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZSh0aXRsZUltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZGFya2JsdWUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dChcIlx1Qzg3MFx1Qzc5MVx1QkM5NVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIDEwMCwgJ3doaXRlJywgJ2NlbnRlcicsICc0MHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuaW5zdHJ1Y3Rpb25zVGV4dC5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGxpbmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgMTgwICsgaW5kZXggKiA0MCwgJ3doaXRlJywgJ2NlbnRlcicsICcyMHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byBQbGF5XCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMTAwLCAnd2hpdGUnLCAnY2VudGVyJywgJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyR2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ2FtZU92ZXJUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCwgJ3JlZCcsICdjZW50ZXInLCAnNjBweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBGaW5hbCBTY29yZTogJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJywgJ2NlbnRlcicsICczNnB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byByZXR1cm4gdG8gVGl0bGVcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODAsICd3aGl0ZScsICdjZW50ZXInLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgIH1cclxuXHJcbiAgICBkcmF3VGV4dCh0ZXh0OiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBhbGlnbjogQ2FudmFzVGV4dEFsaWduID0gJ2xlZnQnLCBmb250OiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gZm9udDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBhbGlnbjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQoc291bmROYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5zb3VuZHMuZ2V0KHNvdW5kTmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7IC8vIENsb25lIGZvciBjb25jdXJyZW50IHBsYXliYWNrXHJcbiAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgU291bmQgcGxheWJhY2sgZmFpbGVkOiAke3NvdW5kTmFtZX1gLCBlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtzb3VuZE5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0YXJ0TXVzaWMoc291bmROYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zdG9wTXVzaWMoKTsgLy8gU3RvcCBhbnkgZXhpc3RpbmcgbXVzaWNcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChzb3VuZE5hbWUpO1xyXG4gICAgICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljID0gYXVkaW87IC8vIFVzZSB0aGUgb3JpZ2luYWwgQXVkaW8gZWxlbWVudCBmb3IgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgTXVzaWMgcGxheWJhY2sgZmFpbGVkOiAke3NvdW5kTmFtZX1gLCBlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBNdXNpYyAnJHtzb3VuZE5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0b3BNdXNpYygpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5tdXNpYykge1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMubXVzaWMuY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdsb2JhbCBzY29wZSB0byBlbnN1cmUgaXQncyBhY2Nlc3NpYmxlIGJ5IEhUTUxcclxuZGVjbGFyZSBnbG9iYWwge1xyXG4gICAgaW50ZXJmYWNlIFdpbmRvdyB7XHJcbiAgICAgICAgZ2FtZTogR2FtZTtcclxuICAgIH1cclxufVxyXG5cclxud2luZG93Lm9ubG9hZCA9ICgpID0+IHtcclxuICAgIC8vIFJlbW92ZWQgY3VzdG9tIGZvbnQgbG9hZGluZyB0byBjb21wbHkgd2l0aCB0aGUgXCJiYXNpYyBmb250XCIgcmVxdWlyZW1lbnQuXHJcbiAgICAvLyBVc2luZyBhIGRlZmF1bHQgd2ViLXNhZmUgZm9udCBsaWtlIEFyaWFsLCBzYW5zLXNlcmlmLlxyXG4gICAgd2luZG93LmdhbWUgPSBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgd2luZG93LmdhbWUuc3RhcnQoKTtcclxufTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBeUZBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLFdBQUEsYUFBVTtBQUNWLEVBQUFBLFdBQUEsV0FBUTtBQUNSLEVBQUFBLFdBQUEsa0JBQWU7QUFDZixFQUFBQSxXQUFBLGFBQVU7QUFDVixFQUFBQSxXQUFBLGVBQVk7QUFMWCxTQUFBQTtBQUFBLEdBQUE7QUFRTCxNQUFNLFdBQVc7QUFBQTtBQUFBLEVBU2IsWUFBWSxHQUFXLEdBQVcsT0FBZSxRQUFnQixXQUFtQjtBQUhwRiw2QkFBNkI7QUFDN0IsaUJBQWlDO0FBRzdCLFNBQUssSUFBSTtBQUNULFNBQUssSUFBSTtBQUNULFNBQUssUUFBUTtBQUNiLFNBQUssU0FBUztBQUNkLFNBQUssWUFBWTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxLQUFLLEtBQStCLE1BQWtCO0FBQ2xELFFBQUksQ0FBQyxLQUFLLE9BQU87QUFDYixXQUFLLFFBQVEsS0FBSyxPQUFPLElBQUksS0FBSyxTQUFTLEtBQUs7QUFBQSxJQUNwRDtBQUNBLFFBQUksS0FBSyxPQUFPO0FBQ1osVUFBSSxVQUFVLEtBQUssT0FBTyxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssT0FBTyxLQUFLLE1BQU07QUFBQSxJQUNyRSxPQUFPO0FBQ0gsVUFBSSxZQUFZO0FBQ2hCLFVBQUksU0FBUyxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssT0FBTyxLQUFLLE1BQU07QUFBQSxJQUN4RDtBQUFBLEVBQ0o7QUFBQSxFQUNBLE9BQU8sV0FBbUIsTUFB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QUFLLFNBQVMsS0FBSyxLQUFLLGFBQWEsY0FBYyxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksSUFBSSxPQUFPLFVBQVUsd0JBQXdCO0FBQ2hKLFNBQUssU0FBUyxnQkFBZ0IsS0FBSyxLQUFLLElBQUksS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxHQUFHLFNBQVMsVUFBVSx3QkFBd0I7QUFDdEksU0FBSyxTQUFTLGtDQUFrQyxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksSUFBSSxTQUFTLFVBQVUsd0JBQXdCO0FBQUEsRUFDbko7QUFBQSxFQUVBLFNBQVMsTUFBYyxHQUFXLEdBQVcsT0FBZSxRQUF5QixRQUFRLE1BQW9CO0FBQzdHLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxlQUFlO0FBQ3hCLFNBQUssSUFBSSxTQUFTLE1BQU0sR0FBRyxDQUFDO0FBQUEsRUFDaEM7QUFBQSxFQUVBLFVBQVUsV0FBbUIsT0FBZ0IsT0FBYTtBQUN0RCxVQUFNLFFBQVEsS0FBSyxPQUFPLElBQUksU0FBUztBQUN2QyxRQUFJLE9BQU87QUFDUCxZQUFNLFFBQVEsTUFBTSxVQUFVLElBQUk7QUFDbEMsWUFBTSxTQUFTLE1BQU07QUFDckIsWUFBTSxPQUFPO0FBQ2IsWUFBTSxLQUFLLEVBQUUsTUFBTSxPQUFLLFFBQVEsS0FBSywwQkFBMEIsU0FBUyxJQUFJLENBQUMsQ0FBQztBQUFBLElBQ2xGLE9BQU87QUFDSCxjQUFRLEtBQUssVUFBVSxTQUFTLGNBQWM7QUFBQSxJQUNsRDtBQUFBLEVBQ0o7QUFBQSxFQUVBLFdBQVcsV0FBbUIsT0FBZ0IsTUFBWTtBQUN0RCxTQUFLLFVBQVU7QUFDZixVQUFNLFFBQVEsS0FBSyxPQUFPLElBQUksU0FBUztBQUN2QyxRQUFJLE9BQU87QUFDUCxXQUFLLFFBQVE7QUFDYixXQUFLLE1BQU0sT0FBTztBQUNsQixXQUFLLE1BQU0sS0FBSyxFQUFFLE1BQU0sT0FBSyxRQUFRLEtBQUssMEJBQTBCLFNBQVMsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUN2RixPQUFPO0FBQ0gsY0FBUSxLQUFLLFVBQVUsU0FBUyxjQUFjO0FBQUEsSUFDbEQ7QUFBQSxFQUNKO0FBQUEsRUFFQSxZQUFrQjtBQUNkLFFBQUksS0FBSyxPQUFPO0FBQ1osV0FBSyxNQUFNLE1BQU07QUFDakIsV0FBSyxNQUFNLGNBQWM7QUFDekIsV0FBSyxRQUFRO0FBQUEsSUFDakI7QUFBQSxFQUNKO0FBQ0o7QUFTQSxPQUFPLFNBQVMsTUFBTTtBQUdsQixTQUFPLE9BQU8sSUFBSSxLQUFLLFlBQVk7QUFDbkMsU0FBTyxLQUFLLE1BQU07QUFDdEI7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSJdCn0K
