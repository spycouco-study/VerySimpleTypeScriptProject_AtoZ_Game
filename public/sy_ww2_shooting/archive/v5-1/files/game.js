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
      const bulletSpeed = this.bulletType.speed;
      game.playerBullets.push(new Bullet(
        this.x + this.width,
        // Spawn bullet from player's right edge
        this.y + this.height / 2 - this.bulletType.height / 2,
        // Centered vertically
        this.bulletType.width,
        this.bulletType.height,
        this.bulletType.image,
        bulletSpeed,
        // vx (shoots straight right)
        0,
        // vy
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
  // Modified constructor to accept vx and vy instead of a single speed
  constructor(x, y, width, height, imageName, vx, vy, damage, type) {
    super(x, y, width, height, imageName);
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.type = type;
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
    if (this.fireRate > 0 && game.currentTime - this.lastShotTime > 1e3 / this.fireRate && game.player && !game.player.markedForDeletion) {
      const bulletSpawnX = this.x - this.bulletType.width;
      const bulletSpawnY = this.y + this.height / 2 - this.bulletType.height / 2;
      const playerCenterX = game.player.x + game.player.width / 2;
      const playerCenterY = game.player.y + game.player.height / 2;
      const directionX = playerCenterX - bulletSpawnX;
      const directionY = playerCenterY - bulletSpawnY;
      const magnitude = Math.sqrt(directionX * directionX + directionY * directionY);
      let bulletVx;
      let bulletVy;
      if (magnitude > 0) {
        const normalizedDirectionX = directionX / magnitude;
        const normalizedDirectionY = directionY / magnitude;
        bulletVx = normalizedDirectionX * this.bulletType.speed;
        bulletVy = normalizedDirectionY * this.bulletType.speed;
      } else {
        bulletVx = -this.bulletType.speed;
        bulletVy = 0;
      }
      game.enemyBullets.push(new Bullet(
        bulletSpawnX,
        bulletSpawnY,
        this.bulletType.width,
        this.bulletType.height,
        this.bulletType.image,
        bulletVx,
        // Calculated velocity X
        bulletVy,
        // Calculated velocity Y
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHt9OyAvLyBNYWtlIHRoaXMgZmlsZSBhIG1vZHVsZSB0byBhbGxvdyBnbG9iYWwgYXVnbWVudGF0aW9uXHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVNldHRpbmdzIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICBwbGF5ZXJJbml0aWFsSGVhbHRoOiBudW1iZXI7XHJcbiAgICBleHBsb3Npb25EdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0OiBzdHJpbmdbXTtcclxuICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgbG9hZGluZ1RleHQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFBsYXllckNvbmZpZyB7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7IC8vIGJ1bGxldHMgcGVyIHNlY29uZFxyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgaGl0U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEVuZW15Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyO1xyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgbW92ZW1lbnRQYXR0ZXJuOiBcInN0cmFpZ2h0XCIgfCBcInNpbmVcIiB8IFwiZGlhZ29uYWxcIjtcclxuICAgIHNob290U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEJ1bGxldENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgc291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsU3Bhd25FdmVudCB7XHJcbiAgICB0aW1lOiBudW1iZXI7IC8vIHJlbGF0aXZlIHRvIGxldmVsIHN0YXJ0LCBpbiBzZWNvbmRzXHJcbiAgICBlbmVteU5hbWU6IHN0cmluZztcclxuICAgIHN0YXJ0WDogXCJyaWdodEVkZ2VcIiB8IG51bWJlcjsgLy8geCBwb3NpdGlvbiwgb3Iga2V5d29yZFxyXG4gICAgc3RhcnRZOiBcInJhbmRvbVwiIHwgXCJ0b3BcIiB8IFwiYm90dG9tXCIgfCBudW1iZXI7IC8vIHkgcG9zaXRpb24sIG9yIGtleXdvcmRcclxuICAgIGNvdW50PzogbnVtYmVyOyAvLyBmb3Igd2F2ZXNcclxuICAgIGludGVydmFsPzogbnVtYmVyOyAvLyBmb3Igd2F2ZXMgKHNlY29uZHMpXHJcbiAgICBfc3Bhd25lZD86IGJvb2xlYW47IC8vIEludGVybmFsIGZsYWcgdG8gdHJhY2sgaWYgdGhpcyBldmVudCBoYXMgYmVlbiB0cmlnZ2VyZWRcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsQ29uZmlnIHtcclxuICAgIGR1cmF0aW9uOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgIHNwYXduRXZlbnRzOiBMZXZlbFNwYXduRXZlbnRbXTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgcGxheWVyOiBQbGF5ZXJDb25maWc7XHJcbiAgICBlbmVteVR5cGVzOiBFbmVteUNvbmZpZ1tdO1xyXG4gICAgYnVsbGV0VHlwZXM6IEJ1bGxldENvbmZpZ1tdO1xyXG4gICAgbGV2ZWxzOiBMZXZlbENvbmZpZ1tdO1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJbWFnZUFzc2V0W107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZEFzc2V0W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HID0gXCJMT0FESU5HXCIsXHJcbiAgICBUSVRMRSA9IFwiVElUTEVcIixcclxuICAgIElOU1RSVUNUSU9OUyA9IFwiSU5TVFJVQ1RJT05TXCIsXHJcbiAgICBQTEFZSU5HID0gXCJQTEFZSU5HXCIsXHJcbiAgICBHQU1FX09WRVIgPSBcIkdBTUVfT1ZFUlwiLFxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG4gICAgbWFya2VkRm9yRGVsZXRpb246IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlZCByZWZlcmVuY2UgdG8gdGhlIGxvYWRlZCBpbWFnZVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gaW1hZ2VOYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5pbWFnZSA9IGdhbWUuaW1hZ2VzLmdldCh0aGlzLmltYWdlTmFtZSkgfHwgbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAncmVkJzsgLy8gRmFsbGJhY2tcclxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7fVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gYnVsbGV0cyBwZXIgc2Vjb25kXHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBsYXN0U2hvdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBpbnZpbmNpYmxlVGltZXI6IG51bWJlciA9IDA7IC8vIGZvciBicmllZiBpbnZpbmNpYmlsaXR5IGFmdGVyIGhpdFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyQ29uZmlnID0gZ2FtZS5kYXRhIS5wbGF5ZXI7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgcGxheWVyQ29uZmlnLndpZHRoLCBwbGF5ZXJDb25maWcuaGVpZ2h0LCBwbGF5ZXJDb25maWcuaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MucGxheWVySW5pdGlhbEhlYWx0aDtcclxuICAgICAgICB0aGlzLm1heEhlYWx0aCA9IHRoaXMuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBwbGF5ZXJDb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IHBsYXllckNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IHBsYXllckNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmludmluY2libGVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNb3ZlbWVudCBiYXNlZCBvbiBpbnB1dFxyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dVcCcpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlXJykpIHRoaXMueSAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dEb3duJykgfHwgZ2FtZS5pbnB1dC5nZXQoJ0tleVMnKSkgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKGdhbWUuaW5wdXQuZ2V0KCdBcnJvd0xlZnQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5QScpKSB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICBpZiAoZ2FtZS5pbnB1dC5nZXQoJ0Fycm93UmlnaHQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5RCcpKSB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gS2VlcCBwbGF5ZXIgd2l0aGluIGNhbnZhcyBib3VuZHNcclxuICAgICAgICB0aGlzLnggPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLngsIGdhbWUuY2FudmFzLndpZHRoIC0gdGhpcy53aWR0aCkpO1xyXG4gICAgICAgIHRoaXMueSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMueSwgZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpKTtcclxuXHJcbiAgICAgICAgLy8gU2hvb3RpbmdcclxuICAgICAgICBpZiAoKGdhbWUuaW5wdXQuZ2V0KCdTcGFjZScpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlKJykpICYmIChnYW1lLmN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0U2hvdFRpbWUpID4gKDEwMDAgLyB0aGlzLmZpcmVSYXRlKSkge1xyXG4gICAgICAgICAgICBjb25zdCBidWxsZXRTcGVlZCA9IHRoaXMuYnVsbGV0VHlwZS5zcGVlZDtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5ZXJCdWxsZXRzLnB1c2gobmV3IEJ1bGxldChcclxuICAgICAgICAgICAgICAgIHRoaXMueCArIHRoaXMud2lkdGgsIC8vIFNwYXduIGJ1bGxldCBmcm9tIHBsYXllcidzIHJpZ2h0IGVkZ2VcclxuICAgICAgICAgICAgICAgIHRoaXMueSArIHRoaXMuaGVpZ2h0IC8gMiAtIHRoaXMuYnVsbGV0VHlwZS5oZWlnaHQgLyAyLCAvLyBDZW50ZXJlZCB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUud2lkdGgsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmltYWdlLFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0U3BlZWQsIC8vIHZ4IChzaG9vdHMgc3RyYWlnaHQgcmlnaHQpXHJcbiAgICAgICAgICAgICAgICAwLCAgICAgICAgICAgLy8gdnlcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5kYW1hZ2UsXHJcbiAgICAgICAgICAgICAgICBcInBsYXllclwiXHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTb3VuZCh0aGlzLmJ1bGxldFR5cGUuc291bmQpO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RTaG90VGltZSA9IGdhbWUuY3VycmVudFRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRha2VEYW1hZ2UoZGFtYWdlOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmxlVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmhlYWx0aCAtPSBkYW1hZ2U7XHJcbiAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKGdhbWUuZGF0YSEucGxheWVyLmhpdFNvdW5kKTtcclxuICAgICAgICAgICAgdGhpcy5pbnZpbmNpYmxlVGltZXIgPSAxOyAvLyAxIHNlY29uZCBpbnZpbmNpYmlsaXR5XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGdhbWUuZXhwbG9zaW9ucy5wdXNoKG5ldyBFeHBsb3Npb24odGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0LCBnYW1lLmRhdGEhLmdhbWVTZXR0aW5ncy5leHBsb3Npb25EdXJhdGlvbikpO1xyXG4gICAgICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQoXCJleHBsb3Npb25cIik7XHJcbiAgICAgICAgICAgICAgICBnYW1lLnBsYXlTb3VuZChcImdhbWVfb3ZlclwiKTsgLy8gUGxheSBnYW1lIG92ZXIgc291bmRcclxuICAgICAgICAgICAgICAgIGdhbWUuc2V0U3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmludmluY2libGVUaW1lciA+IDApIHtcclxuICAgICAgICAgICAgLy8gRmxhc2ggZWZmZWN0IGR1cmluZyBpbnZpbmNpYmlsaXR5XHJcbiAgICAgICAgICAgIGlmIChNYXRoLmZsb29yKHRoaXMuaW52aW5jaWJsZVRpbWVyICogMTApICUgMiA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgc3VwZXIuZHJhdyhjdHgsIGdhbWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc3VwZXIuZHJhdyhjdHgsIGdhbWUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQnVsbGV0IGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBkYW1hZ2U6IG51bWJlcjtcclxuICAgIHR5cGU6IFwicGxheWVyXCIgfCBcImVuZW15XCI7XHJcbiAgICB2eDogbnVtYmVyOyAvLyBWZWxvY2l0eSBYIGNvbXBvbmVudFxyXG4gICAgdnk6IG51bWJlcjsgLy8gVmVsb2NpdHkgWSBjb21wb25lbnRcclxuXHJcbiAgICAvLyBNb2RpZmllZCBjb25zdHJ1Y3RvciB0byBhY2NlcHQgdnggYW5kIHZ5IGluc3RlYWQgb2YgYSBzaW5nbGUgc3BlZWRcclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcsIHZ4OiBudW1iZXIsIHZ5OiBudW1iZXIsIGRhbWFnZTogbnVtYmVyLCB0eXBlOiBcInBsYXllclwiIHwgXCJlbmVteVwiKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VOYW1lKTtcclxuICAgICAgICB0aGlzLnZ4ID0gdng7XHJcbiAgICAgICAgdGhpcy52eSA9IHZ5O1xyXG4gICAgICAgIHRoaXMuZGFtYWdlID0gZGFtYWdlO1xyXG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy54ICs9IHRoaXMudnggKiBkZWx0YVRpbWU7IC8vIFVzZSB2eCBmb3IgaG9yaXpvbnRhbCBtb3ZlbWVudFxyXG4gICAgICAgIHRoaXMueSArPSB0aGlzLnZ5ICogZGVsdGFUaW1lOyAvLyBVc2UgdnkgZm9yIHZlcnRpY2FsIG1vdmVtZW50XHJcblxyXG4gICAgICAgIC8vIE1hcmsgZm9yIGRlbGV0aW9uIGlmIG9mZiBzY3JlZW4gaW4gYW55IGRpcmVjdGlvblxyXG4gICAgICAgIGlmICh0aGlzLnggPiBnYW1lLmNhbnZhcy53aWR0aCB8fCB0aGlzLnggKyB0aGlzLndpZHRoIDwgMCB8fFxyXG4gICAgICAgICAgICB0aGlzLnkgPiBnYW1lLmNhbnZhcy5oZWlnaHQgfHwgdGhpcy55ICsgdGhpcy5oZWlnaHQgPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRW5lbXkgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7XHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBtb3ZlbWVudFBhdHRlcm46IFwic3RyYWlnaHRcIiB8IFwic2luZVwiIHwgXCJkaWFnb25hbFwiO1xyXG4gICAgbGFzdFNob3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgaW5pdGlhbFk6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSBvciBkaWFnb25hbCBwYXR0ZXJuc1xyXG4gICAgc2luZVdhdmVPZmZzZXQ6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSB0byBtYWtlIGVhY2ggZW5lbXkncyBwYXR0ZXJuIHVuaXF1ZVxyXG4gICAgdmVydGljYWxEaXJlY3Rpb246IDEgfCAtMSA9IDE7IC8vIEZvciBkaWFnb25hbCBtb3ZlbWVudDogMSBmb3IgZG93biwgLTEgZm9yIHVwXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbmZpZzogRW5lbXlDb25maWcsIGdhbWU6IEdhbWUpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCBjb25maWcud2lkdGgsIGNvbmZpZy5oZWlnaHQsIGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBjb25maWcuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IGNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBjb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IGNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IGNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICAgICAgdGhpcy5tb3ZlbWVudFBhdHRlcm4gPSBjb25maWcubW92ZW1lbnRQYXR0ZXJuO1xyXG4gICAgICAgIHRoaXMuaW5pdGlhbFkgPSB5O1xyXG4gICAgICAgIHRoaXMuc2luZVdhdmVPZmZzZXQgPSBNYXRoLnJhbmRvbSgpICogTWF0aC5QSSAqIDI7IC8vIFJhbmRvbSBwaGFzZSBmb3Igc2luZSB3YXZlXHJcbiAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IChNYXRoLnJhbmRvbSgpIDwgMC41KSA/IDEgOiAtMTsgLy8gUmFuZG9tIGluaXRpYWwgZGlyZWN0aW9uIGZvciBkaWFnb25hbFxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIC8vIEhvcml6b250YWwgbW92ZW1lbnRcclxuICAgICAgICB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gVmVydGljYWwgbW92ZW1lbnQgYmFzZWQgb24gcGF0dGVyblxyXG4gICAgICAgIGlmICh0aGlzLm1vdmVtZW50UGF0dGVybiA9PT0gXCJzaW5lXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgYW1wbGl0dWRlID0gNTA7IC8vIEhvdyBmYXIgdXAvZG93biBpdCBtb3Zlc1xyXG4gICAgICAgICAgICBjb25zdCBmcmVxdWVuY3kgPSAyOyAvLyBIb3cgZmFzdCBpdCB3aWdnbGVzXHJcbiAgICAgICAgICAgIHRoaXMueSA9IHRoaXMuaW5pdGlhbFkgKyBNYXRoLnNpbihnYW1lLmN1cnJlbnRUaW1lICogMC4wMDEgKiBmcmVxdWVuY3kgKyB0aGlzLnNpbmVXYXZlT2Zmc2V0KSAqIGFtcGxpdHVkZTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMubW92ZW1lbnRQYXR0ZXJuID09PSBcImRpYWdvbmFsXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhZ29uYWxTcGVlZCA9IHRoaXMuc3BlZWQgKiAwLjc7IC8vIFNsb3dlciB2ZXJ0aWNhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICB0aGlzLnkgKz0gdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiAqIGRpYWdvbmFsU3BlZWQgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBSZXZlcnNlIGRpcmVjdGlvbiBpZiBoaXR0aW5nIHRvcCBvciBib3R0b20gZWRnZXNcclxuICAgICAgICAgICAgaWYgKHRoaXMueSA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnkgPSAwO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IDE7IC8vIE1vdmUgZG93blxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMueSA+PSBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy55ID0gZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRpY2FsRGlyZWN0aW9uID0gLTE7IC8vIE1vdmUgdXBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGFtcCBZIHRvIHN0YXkgb24gc2NyZWVuIChvbmx5IG5lZWRlZCBpZiBtb3ZlbWVudCBwYXR0ZXJuIGRvZXNuJ3QgaGFuZGxlIGl0LCBlLmcuLCAnc3RyYWlnaHQnKVxyXG4gICAgICAgIC8vIEZvciAnc2luZScgYW5kICdkaWFnb25hbCcsIHRoZWlyIGxvZ2ljIHVzdWFsbHkgaW1wbGljaXRseSBrZWVwcyBpdCB3aXRoaW4gYm91bmRzIG9yXHJcbiAgICAgICAgLy8gdGhlIGJvdW5jZSBsb2dpYyBhZGp1c3RzIGl0LiBLZWVwaW5nIGl0IGFzIGEgZ2VuZXJhbCBmYWxsYmFjaywgdGhvdWdoIGxlc3MgY3JpdGljYWwgZm9yIHVwZGF0ZWQgZGlhZ29uYWwuXHJcbiAgICAgICAgdGhpcy55ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy55LCBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkpO1xyXG5cclxuXHJcbiAgICAgICAgLy8gU2hvb3Rpbmc6IEVuZW1pZXMgbm93IGZpcmUgYnVsbGV0cyB0b3dhcmRzIHRoZSBwbGF5ZXIncyBwb3NpdGlvblxyXG4gICAgICAgIGlmICh0aGlzLmZpcmVSYXRlID4gMCAmJiAoZ2FtZS5jdXJyZW50VGltZSAtIHRoaXMubGFzdFNob3RUaW1lKSA+ICgxMDAwIC8gdGhpcy5maXJlUmF0ZSkgJiYgZ2FtZS5wbGF5ZXIgJiYgIWdhbWUucGxheWVyLm1hcmtlZEZvckRlbGV0aW9uKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldFNwYXduWCA9IHRoaXMueCAtIHRoaXMuYnVsbGV0VHlwZS53aWR0aDsgLy8gU3Bhd24gYnVsbGV0IGZyb20gZW5lbXkncyBsZWZ0IGVkZ2VcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0U3Bhd25ZID0gdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyIC0gdGhpcy5idWxsZXRUeXBlLmhlaWdodCAvIDI7IC8vIENlbnRlcmVkIHZlcnRpY2FsbHlcclxuXHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBkaXJlY3Rpb24gdmVjdG9yIHRvd2FyZHMgdGhlIHBsYXllcidzIGNlbnRlclxyXG4gICAgICAgICAgICBjb25zdCBwbGF5ZXJDZW50ZXJYID0gZ2FtZS5wbGF5ZXIueCArIGdhbWUucGxheWVyLndpZHRoIC8gMjtcclxuICAgICAgICAgICAgY29uc3QgcGxheWVyQ2VudGVyWSA9IGdhbWUucGxheWVyLnkgKyBnYW1lLnBsYXllci5oZWlnaHQgLyAyO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZGlyZWN0aW9uWCA9IHBsYXllckNlbnRlclggLSBidWxsZXRTcGF3blg7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpcmVjdGlvblkgPSBwbGF5ZXJDZW50ZXJZIC0gYnVsbGV0U3Bhd25ZO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbWFnbml0dWRlID0gTWF0aC5zcXJ0KGRpcmVjdGlvblggKiBkaXJlY3Rpb25YICsgZGlyZWN0aW9uWSAqIGRpcmVjdGlvblkpO1xyXG5cclxuICAgICAgICAgICAgbGV0IGJ1bGxldFZ4OiBudW1iZXI7XHJcbiAgICAgICAgICAgIGxldCBidWxsZXRWeTogbnVtYmVyO1xyXG5cclxuICAgICAgICAgICAgaWYgKG1hZ25pdHVkZSA+IDApIHtcclxuICAgICAgICAgICAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgZGlyZWN0aW9uIHZlY3RvciBhbmQgbXVsdGlwbHkgYnkgYnVsbGV0IHNwZWVkXHJcbiAgICAgICAgICAgICAgICBjb25zdCBub3JtYWxpemVkRGlyZWN0aW9uWCA9IGRpcmVjdGlvblggLyBtYWduaXR1ZGU7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBub3JtYWxpemVkRGlyZWN0aW9uWSA9IGRpcmVjdGlvblkgLyBtYWduaXR1ZGU7XHJcbiAgICAgICAgICAgICAgICBidWxsZXRWeCA9IG5vcm1hbGl6ZWREaXJlY3Rpb25YICogdGhpcy5idWxsZXRUeXBlLnNwZWVkO1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0VnkgPSBub3JtYWxpemVkRGlyZWN0aW9uWSAqIHRoaXMuYnVsbGV0VHlwZS5zcGVlZDtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBJZiBlbmVteSBpcyBvbiB0b3Agb2YgcGxheWVyIChtYWduaXR1ZGUgaXMgMCksIHNob290IHN0cmFpZ2h0IGxlZnRcclxuICAgICAgICAgICAgICAgIGJ1bGxldFZ4ID0gLXRoaXMuYnVsbGV0VHlwZS5zcGVlZDtcclxuICAgICAgICAgICAgICAgIGJ1bGxldFZ5ID0gMDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgZ2FtZS5lbmVteUJ1bGxldHMucHVzaChuZXcgQnVsbGV0KFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0U3Bhd25YLFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0U3Bhd25ZLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmhlaWdodCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5pbWFnZSxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFZ4LCAvLyBDYWxjdWxhdGVkIHZlbG9jaXR5IFhcclxuICAgICAgICAgICAgICAgIGJ1bGxldFZ5LCAvLyBDYWxjdWxhdGVkIHZlbG9jaXR5IFlcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5kYW1hZ2UsXHJcbiAgICAgICAgICAgICAgICBcImVuZW15XCJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKHRoaXMuYnVsbGV0VHlwZS5zb3VuZCk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdFNob3RUaW1lID0gZ2FtZS5jdXJyZW50VGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1hcmsgZm9yIGRlbGV0aW9uIGlmIG9mZiBzY3JlZW5cclxuICAgICAgICBpZiAodGhpcy54ICsgdGhpcy53aWR0aCA8IDApIHtcclxuICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRha2VEYW1hZ2UoZGFtYWdlOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmhlYWx0aCAtPSBkYW1hZ2U7XHJcbiAgICAgICAgaWYgKHRoaXMuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgIGdhbWUuc2NvcmUgKz0gdGhpcy5zY29yZVZhbHVlO1xyXG4gICAgICAgICAgICBnYW1lLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MuZXhwbG9zaW9uRHVyYXRpb24pKTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQoXCJleHBsb3Npb25cIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBFeHBsb3Npb24gZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHRpbWVyOiBudW1iZXI7XHJcbiAgICBkdXJhdGlvbjogbnVtYmVyOyAvLyBpbiBzZWNvbmRzXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBkdXJhdGlvbjogbnVtYmVyKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgXCJleHBsb3Npb25cIik7IC8vIEFzc3VtaW5nIFwiZXhwbG9zaW9uXCIgaXMgdGhlIGltYWdlIG5hbWVcclxuICAgICAgICB0aGlzLmR1cmF0aW9uID0gZHVyYXRpb247XHJcbiAgICAgICAgdGhpcy50aW1lciA9IGR1cmF0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMudGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBCYWNrZ3JvdW5kIHtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICBzY3JvbGxTcGVlZDogbnVtYmVyO1xyXG4gICAgeDE6IG51bWJlciA9IDA7XHJcbiAgICB4MjogbnVtYmVyID0gMDsgLy8gZm9yIGNvbnRpbnVvdXMgc2Nyb2xsaW5nXHJcbiAgICBnYW1lV2lkdGg6IG51bWJlcjtcclxuICAgIGdhbWVIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihpbWFnZU5hbWU6IHN0cmluZywgc2Nyb2xsU3BlZWQ6IG51bWJlciwgZ2FtZVdpZHRoOiBudW1iZXIsIGdhbWVIZWlnaHQ6IG51bWJlciwgZ2FtZTogR2FtZSkge1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSBnYW1lLmltYWdlcy5nZXQoaW1hZ2VOYW1lKSB8fCBudWxsO1xyXG4gICAgICAgIHRoaXMuc2Nyb2xsU3BlZWQgPSBzY3JvbGxTcGVlZDtcclxuICAgICAgICB0aGlzLmdhbWVXaWR0aCA9IGdhbWVXaWR0aDtcclxuICAgICAgICB0aGlzLmdhbWVIZWlnaHQgPSBnYW1lSGVpZ2h0O1xyXG4gICAgICAgIGlmICh0aGlzLmltYWdlKSB7XHJcbiAgICAgICAgICAgIC8vIEluaXRpYWxpemUgcG9zaXRpb25zIGZvciB0d28gdGlsZXMgdG8gY292ZXIgdGhlIHNjcmVlbiBhbmQgYmV5b25kXHJcbiAgICAgICAgICAgIHRoaXMueDEgPSAwO1xyXG4gICAgICAgICAgICAvLyBFbnN1cmUgeDIgc3RhcnRzIHdoZXJlIHgxIGVuZHMsIGhhbmRsaW5nIHBvdGVudGlhbCBpbWFnZSB3aWR0aCBkaWZmZXJlbmNlc1xyXG4gICAgICAgICAgICAvLyBUaGUgaW1hZ2UgbWlnaHQgbm90IGJlIGV4YWN0bHkgY2FudmFzIHdpZHRoLCBzbyB3ZSB0aWxlIGl0IGJhc2VkIG9uIGl0cyBvd24gd2lkdGguXHJcbiAgICAgICAgICAgIHRoaXMueDIgPSB0aGlzLmltYWdlLndpZHRoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaW1hZ2UpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3Qgc2Nyb2xsQW1vdW50ID0gdGhpcy5zY3JvbGxTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB0aGlzLngxIC09IHNjcm9sbEFtb3VudDtcclxuICAgICAgICB0aGlzLngyIC09IHNjcm9sbEFtb3VudDtcclxuXHJcbiAgICAgICAgLy8gSWYgYW4gaW1hZ2UgdGlsZSBtb3ZlcyBjb21wbGV0ZWx5IG9mZi1zY3JlZW4gdG8gdGhlIGxlZnQsIHJlc2V0IGl0IHRvIHRoZSByaWdodFxyXG4gICAgICAgIGlmICh0aGlzLngxIDw9IC10aGlzLmltYWdlLndpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMueDEgPSB0aGlzLngyICsgdGhpcy5pbWFnZS53aWR0aDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMueDIgPD0gLXRoaXMuaW1hZ2Uud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54MiA9IHRoaXMueDEgKyB0aGlzLmltYWdlLndpZHRoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgLy8gRHJhdyBib3RoIGJhY2tncm91bmQgdGlsZXMsIHNjYWxlZCB0byBjYW52YXMgaGVpZ2h0XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54MSwgMCwgdGhpcy5pbWFnZS53aWR0aCwgdGhpcy5nYW1lSGVpZ2h0KTtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngyLCAwLCB0aGlzLmltYWdlLndpZHRoLCB0aGlzLmdhbWVIZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgZGF0YTogR2FtZURhdGEgfCBudWxsID0gbnVsbDtcclxuICAgIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIGxhc3RGcmFtZVRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBjdXJyZW50VGltZTogbnVtYmVyID0gMDsgLy8gVG90YWwgZWxhcHNlZCB0aW1lIGluIG1pbGxpc2Vjb25kc1xyXG5cclxuICAgIHBsYXllcjogUGxheWVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBlbmVtaWVzOiBFbmVteVtdID0gW107XHJcbiAgICBwbGF5ZXJCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZW5lbXlCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZXhwbG9zaW9uczogRXhwbG9zaW9uW10gPSBbXTtcclxuICAgIGJhY2tncm91bmQ6IEJhY2tncm91bmQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIGN1cnJlbnRMZXZlbEluZGV4OiBudW1iZXIgPSAwO1xyXG4gICAgbGV2ZWxUaW1lcjogbnVtYmVyID0gMDsgLy8gVGltZSBlbGFwc2VkIGluIGN1cnJlbnQgbGV2ZWwgKHNlY29uZHMpXHJcbiAgICBhY3RpdmVTcGF3bkludGVydmFsczogU2V0PG51bWJlcj4gPSBuZXcgU2V0KCk7IC8vIFRvIGNsZWFyIGludGVydmFscyB3aGVuIGNoYW5naW5nIGxldmVsc1xyXG5cclxuICAgIGlucHV0OiBNYXA8c3RyaW5nLCBib29sZWFuPiA9IG5ldyBNYXAoKTtcclxuICAgIG11c2ljOiBIVE1MQXVkaW9FbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgdGhpcy5pbml0RXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKFwiTG9hZGluZyBHYW1lIERhdGEuLi5cIik7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuXHJcbiAgICAgICAgICAgIGlmICghdGhpcy5kYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEuXCIpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oXCJMb2FkaW5nIEFzc2V0cy4uLlwiKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgdXAgYmFja2dyb3VuZCBhZnRlciBsb2FkaW5nIGFzc2V0c1xyXG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmQgPSBuZXcgQmFja2dyb3VuZChcclxuICAgICAgICAgICAgICAgIFwiYmFja2dyb3VuZFwiLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5zY3JvbGxTcGVlZCxcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgdGhpc1xyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5USVRMRSk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHN0YXJ0IGdhbWU6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbihgRXJyb3I6ICR7ZXJyb3J9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0xvYWRpbmdTY3JlZW4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChtZXNzYWdlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5kYXRhLmFzc2V0cy5pbWFnZXMubWFwKGFzeW5jIChhc3NldCkgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBpbWcuc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZXMuc2V0KGFzc2V0Lm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuZGF0YS5hc3NldHMuc291bmRzLm1hcChhc3luYyAoYXNzZXQpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gYXNzZXQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgLy8gUHJlbG9hZCB0byBlbnN1cmUgaXQncyByZWFkeVxyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoYXNzZXQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGluaXRFdmVudExpc3RlbmVycygpOiB2b2lkIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChbJ0Fycm93VXAnLCAnQXJyb3dEb3duJywgJ0Fycm93TGVmdCcsICdBcnJvd1JpZ2h0JywgJ1NwYWNlJywgJ0tleVcnLCAnS2V5QScsICdLZXlTJywgJ0tleUQnLCAnS2V5SicsICdFbnRlciddLmluY2x1ZGVzKGUuY29kZSkpIHtcclxuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBzY3JvbGxpbmcgZm9yIGFycm93IGtleXMvc3BhY2VcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5wdXQuc2V0KGUuY29kZSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZS5jb2RlID09PSAnRW50ZXInKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVFbnRlcktleSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKFsnQXJyb3dVcCcsICdBcnJvd0Rvd24nLCAnQXJyb3dMZWZ0JywgJ0Fycm93UmlnaHQnLCAnU3BhY2UnLCAnS2V5VycsICdLZXlBJywgJ0tleVMnLCAnS2V5RCcsICdLZXlKJywgJ0VudGVyJ10uaW5jbHVkZXMoZS5jb2RlKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pbnB1dC5zZXQoZS5jb2RlLCBmYWxzZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUVudGVyS2V5KCk6IHZvaWQge1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5JTlNUUlVDVElPTlMpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5pdEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLlBMQVlJTkcpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLlRJVExFKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNldFN0YXRlKG5ld1N0YXRlOiBHYW1lU3RhdGUpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IG5ld1N0YXRlO1xyXG4gICAgICAgIGlmIChuZXdTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFydE11c2ljKFwiYmdtXCIsIHRydWUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RvcE11c2ljKCk7XHJcbiAgICAgICAgICAgIGlmIChuZXdTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBPcHRpb25hbGx5IHBsYXkgdGl0bGUgc2NyZWVuIHNwZWNpZmljIG11c2ljIGhlcmVcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChuZXdTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICAgICAgLy8gR2FtZSBvdmVyIHNvdW5kIGlzIHBsYXllZCBpbiBQbGF5ZXIudGFrZURhbWFnZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIENsZWFyIGFueSBhY3RpdmUgc3Bhd24gaW50ZXJ2YWxzIHdoZW4gc3RhdGUgY2hhbmdlcyBmcm9tIFBMQVlJTkdcclxuICAgICAgICBpZiAobmV3U3RhdGUgIT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuZm9yRWFjaChpZCA9PiBjbGVhckludGVydmFsKGlkKSk7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuY2xlYXIoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaW5pdEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIoXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoICogMC4xLFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gdGhpcy5kYXRhLnBsYXllci5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICB0aGlzXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSBbXTtcclxuICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cyA9IFtdO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucyA9IFtdO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudExldmVsSW5kZXggPSAwO1xyXG4gICAgICAgIHRoaXMubGV2ZWxUaW1lciA9IDA7XHJcbiAgICAgICAgLy8gUmVzZXQgX3NwYXduZWQgZmxhZyBmb3IgYWxsIGV2ZW50cyBpbiBhbGwgbGV2ZWxzXHJcbiAgICAgICAgdGhpcy5kYXRhLmxldmVscy5mb3JFYWNoKGxldmVsID0+IHtcclxuICAgICAgICAgICAgbGV2ZWwuc3Bhd25FdmVudHMuZm9yRWFjaChldmVudCA9PiBldmVudC5fc3Bhd25lZCA9IGZhbHNlKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnYW1lTG9vcCh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZXN0YW1wIC0gdGhpcy5sYXN0RnJhbWVUaW1lKSAvIDEwMDA7IC8vIERlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IHRpbWVzdGFtcDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRUaW1lID0gdGltZXN0YW1wOyAvLyBUb3RhbCBlbGFwc2VkIHRpbWUgaW4gbWlsbGlzZWNvbmRzXHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLnJlbmRlcigpO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyIHx8ICF0aGlzLmRhdGEgfHwgIXRoaXMuYmFja2dyb3VuZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmJhY2tncm91bmQudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIudXBkYXRlKGRlbHRhVGltZSwgdGhpcyk7XHJcblxyXG4gICAgICAgIC8vIExldmVsIHByb2dyZXNzaW9uIGFuZCBlbmVteSBzcGF3bmluZ1xyXG4gICAgICAgIHRoaXMubGV2ZWxUaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgY29uc3QgY3VycmVudExldmVsQ29uZmlnID0gdGhpcy5kYXRhLmxldmVsc1t0aGlzLmN1cnJlbnRMZXZlbEluZGV4XTtcclxuXHJcbiAgICAgICAgaWYgKGN1cnJlbnRMZXZlbENvbmZpZykge1xyXG4gICAgICAgICAgICBjdXJyZW50TGV2ZWxDb25maWcuc3Bhd25FdmVudHMuZm9yRWFjaChldmVudCA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQudGltZSA8PSB0aGlzLmxldmVsVGltZXIgJiYgIWV2ZW50Ll9zcGF3bmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LmNvdW50ICYmIGV2ZW50LmludGVydmFsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50Ll9zcGF3bmVkID0gdHJ1ZTsgLy8gTWFyayBhcyBzcGF3bmVkIHRvIHByZXZlbnQgcmUtdHJpZ2dlcmluZyB3YXZlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBzcGF3bmVkQ291bnQgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNwYXduZWRDb3VudCA8IGV2ZW50LmNvdW50ISkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25FbmVteShldmVudC5lbmVteU5hbWUsIGV2ZW50LnN0YXJ0WCwgZXZlbnQuc3RhcnRZKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGF3bmVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbElkKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmRlbGV0ZShpbnRlcnZhbElkIGFzIG51bWJlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGV2ZW50LmludGVydmFsICogMTAwMCk7IC8vIGludGVydmFsIGluIG1pbGxpc2Vjb25kc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmFkZChpbnRlcnZhbElkIGFzIG51bWJlcik7IC8vIFN0b3JlIElEIHRvIGNsZWFyIGxhdGVyXHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU2luZ2xlIGVuZW15IHNwYXduXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25FbmVteShldmVudC5lbmVteU5hbWUsIGV2ZW50LnN0YXJ0WCwgZXZlbnQuc3RhcnRZKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuX3NwYXduZWQgPSB0cnVlOyAvLyBNYXJrIGFzIHNwYXduZWRcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgbGV2ZWwgZHVyYXRpb24gaXMgb3ZlciwgYWR2YW5jZSB0byBuZXh0IGxldmVsIG9yIGVuZCBnYW1lXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmxldmVsVGltZXIgPj0gY3VycmVudExldmVsQ29uZmlnLmR1cmF0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRMZXZlbEluZGV4Kys7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxldmVsVGltZXIgPSAwOyAvLyBSZXNldCB0aW1lciBmb3IgdGhlIG5ldyBsZXZlbFxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENsZWFyIGFueSByZW1haW5pbmcgaW50ZXJ2YWxzIGZvciB0aGUganVzdC1lbmRlZCBsZXZlbFxyXG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5mb3JFYWNoKGlkID0+IGNsZWFySW50ZXJ2YWwoaWQpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuY2xlYXIoKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZGF0YS5sZXZlbHNbdGhpcy5jdXJyZW50TGV2ZWxJbmRleF0pIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBBbGwgbGV2ZWxzIGNvbXBsZXRlZFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUik7IC8vIENvdWxkIGJlICdWSUNUT1JZJyBzdGF0ZVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gTm8gbW9yZSBsZXZlbHMsIHBlcmhhcHMga2VlcCBwcmV2aW91cyBsZXZlbCdzIHNwYXducyBvciBqdXN0IHdhaXQgZm9yIHBsYXllciB0byBmaW5pc2hcclxuICAgICAgICAgICAgLy8gRm9yIG5vdywgbGV0J3MganVzdCB0cmFuc2l0aW9uIHRvIGdhbWUgb3Zlci5cclxuICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZShHYW1lU3RhdGUuR0FNRV9PVkVSKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBhbmQgZmlsdGVyIGdhbWUgb2JqZWN0c1xyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGUgPT4gZS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYiA9PiBiLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGIgPT4gYi51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5leHBsb3Npb25zLmZvckVhY2goZSA9PiBlLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gQ29sbGlzaW9uIGRldGVjdGlvblxyXG4gICAgICAgIHRoaXMuY2hlY2tDb2xsaXNpb25zKCk7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBtYXJrZWQgZm9yIGRlbGV0aW9uXHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gdGhpcy5lbmVtaWVzLmZpbHRlcihlID0+ICFlLm1hcmtlZEZvckRlbGV0aW9uKTtcclxuICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMgPSB0aGlzLnBsYXllckJ1bGxldHMuZmlsdGVyKGIgPT4gIWIubWFya2VkRm9yRGVsZXRpb24pO1xyXG4gICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzID0gdGhpcy5lbmVteUJ1bGxldHMuZmlsdGVyKGIgPT4gIWIubWFya2VkRm9yRGVsZXRpb24pO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucyA9IHRoaXMuZXhwbG9zaW9ucy5maWx0ZXIoZSA9PiAhZS5tYXJrZWRGb3JEZWxldGlvbik7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGdhbWUgb3ZlciBjb25kaXRpb24gKHBsYXllci5oZWFsdGggPD0gMCBpcyBoYW5kbGVkIGluIFBsYXllci50YWtlRGFtYWdlKVxyXG4gICAgfVxyXG5cclxuICAgIHNwYXduRW5lbXkoZW5lbXlOYW1lOiBzdHJpbmcsIHN0YXJ0WDogXCJyaWdodEVkZ2VcIiB8IG51bWJlciwgc3RhcnRZOiBcInJhbmRvbVwiIHwgXCJ0b3BcIiB8IFwiYm90dG9tXCIgfCBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGVuZW15Q29uZmlnID0gdGhpcy5kYXRhLmVuZW15VHlwZXMuZmluZChlID0+IGUubmFtZSA9PT0gZW5lbXlOYW1lKTtcclxuICAgICAgICBpZiAoIWVuZW15Q29uZmlnKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgRW5lbXkgdHlwZSAnJHtlbmVteU5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBhY3R1YWxYID0gc3RhcnRYID09PSBcInJpZ2h0RWRnZVwiID8gdGhpcy5jYW52YXMud2lkdGggOiBzdGFydFg7XHJcbiAgICAgICAgbGV0IGFjdHVhbFk6IG51bWJlcjtcclxuXHJcbiAgICAgICAgaWYgKHN0YXJ0WSA9PT0gXCJyYW5kb21cIikge1xyXG4gICAgICAgICAgICBhY3R1YWxZID0gTWF0aC5yYW5kb20oKSAqICh0aGlzLmNhbnZhcy5oZWlnaHQgLSBlbmVteUNvbmZpZy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhcnRZID09PSBcInRvcFwiKSB7XHJcbiAgICAgICAgICAgIGFjdHVhbFkgPSAwO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhcnRZID09PSBcImJvdHRvbVwiKSB7XHJcbiAgICAgICAgICAgIGFjdHVhbFkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLSBlbmVteUNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgYWN0dWFsWSA9IHN0YXJ0WTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW5lbWllcy5wdXNoKG5ldyBFbmVteShhY3R1YWxYLCBhY3R1YWxZLCBlbmVteUNvbmZpZywgdGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIGNoZWNrQ29sbGlzaW9ucygpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBidWxsZXRzIHZzLiBFbmVtaWVzXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IHtcclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFidWxsZXQubWFya2VkRm9yRGVsZXRpb24gJiYgIWVuZW15Lm1hcmtlZEZvckRlbGV0aW9uICYmIHRoaXMuaXNDb2xsaWRpbmcoYnVsbGV0LCBlbmVteSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbmVteS50YWtlRGFtYWdlKGJ1bGxldC5kYW1hZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJ1bGxldC5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBFbmVteSBidWxsZXRzIHZzLiBQbGF5ZXJcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIGlmICghYnVsbGV0Lm1hcmtlZEZvckRlbGV0aW9uICYmICF0aGlzLnBsYXllciEubWFya2VkRm9yRGVsZXRpb24gJiYgdGhpcy5pc0NvbGxpZGluZyhidWxsZXQsIHRoaXMucGxheWVyISkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyIS50YWtlRGFtYWdlKGJ1bGxldC5kYW1hZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0Lm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgdnMuIEVuZW1pZXMgKGNvbnRhY3QgZGFtYWdlL2NvbGxpc2lvbilcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghZW5lbXkubWFya2VkRm9yRGVsZXRpb24gJiYgIXRoaXMucGxheWVyIS5tYXJrZWRGb3JEZWxldGlvbiAmJiB0aGlzLmlzQ29sbGlkaW5nKHRoaXMucGxheWVyISwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBQbGF5ZXIgdGFrZXMgZGFtYWdlIGFuZCBlbmVteSBpcyBkZXN0cm95ZWRcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyIS50YWtlRGFtYWdlKGVuZW15LmhlYWx0aCwgdGhpcyk7IC8vIEVuZW15J3MgaGVhbHRoIGhlcmUgcmVwcmVzZW50cyBjb250YWN0IGRhbWFnZVxyXG4gICAgICAgICAgICAgICAgZW5lbXkubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbihlbmVteS54LCBlbmVteS55LCBlbmVteS53aWR0aCwgZW5lbXkuaGVpZ2h0LCB0aGlzLmRhdGEhLmdhbWVTZXR0aW5ncy5leHBsb3Npb25EdXJhdGlvbikpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoXCJleHBsb3Npb25cIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpc0NvbGxpZGluZyhvYmoxOiBHYW1lT2JqZWN0LCBvYmoyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIG9iajEueCA8IG9iajIueCArIG9iajIud2lkdGggJiZcclxuICAgICAgICAgICAgb2JqMS54ICsgb2JqMS53aWR0aCA+IG9iajIueCAmJlxyXG4gICAgICAgICAgICBvYmoxLnkgPCBvYmoyLnkgKyBvYmoyLmhlaWdodCAmJlxyXG4gICAgICAgICAgICBvYmoxLnkgKyBvYmoxLmhlaWdodCA+IG9iajIueTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpOyAvLyBDbGVhciBlbnRpcmUgY2FudmFzXHJcblxyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oXCJMb2FkaW5nLi4uXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBbHdheXMgZHJhdyBiYWNrZ3JvdW5kIGlmIGxvYWRlZFxyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZD8uZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJQbGF5aW5nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyBMb2FkaW5nIHNjcmVlbiBhbHJlYWR5IGhhbmRsZWQgYnkgZHJhd0xvYWRpbmdTY3JlZW5cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJQbGF5aW5nKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGUgPT4gZS5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYiA9PiBiLmRyYXcodGhpcy5jdHgsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGIgPT4gYi5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXI/LmRyYXcodGhpcy5jdHgsIHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGUgPT4gZS5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUlcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBTY29yZTogJHt0aGlzLnNjb3JlfWAsIDEwLCAzMCwgJ3doaXRlJywgJ2xlZnQnLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBIZWFsdGg6ICR7dGhpcy5wbGF5ZXI/LmhlYWx0aCB8fCAwfWAsIDEwLCA2MCwgJ3doaXRlJywgJ2xlZnQnLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpOyAvLyBBc3N1bWluZyB0aXRsZV9iYWNrZ3JvdW5kIGltYWdlXHJcbiAgICAgICAgaWYgKHRpdGxlSW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRpdGxlSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdkYXJrYmx1ZSc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgJ3doaXRlJywgJ2NlbnRlcicsICc0OHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byBTdGFydFwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJ3doaXRlJywgJ2NlbnRlcicsICcyNHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckluc3RydWN0aW9uc1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlmICh0aXRsZUltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZSh0aXRsZUltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZGFya2JsdWUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dChcIlx1Qzg3MFx1Qzc5MVx1QkM5NVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIDEwMCwgJ3doaXRlJywgJ2NlbnRlcicsICc0MHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuaW5zdHJ1Y3Rpb25zVGV4dC5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGxpbmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgMTgwICsgaW5kZXggKiA0MCwgJ3doaXRlJywgJ2NlbnRlcicsICcyMHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byBQbGF5XCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMTAwLCAnd2hpdGUnLCAnY2VudGVyJywgJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyR2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ2FtZU92ZXJUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCwgJ3JlZCcsICdjZW50ZXInLCAnNjBweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBGaW5hbCBTY29yZTogJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJywgJ2NlbnRlcicsICczNnB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byByZXR1cm4gdG8gVGl0bGVcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODAsICd3aGl0ZScsICdjZW50ZXInLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgIH1cclxuXHJcbiAgICBkcmF3VGV4dCh0ZXh0OiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBhbGlnbjogQ2FudmFzVGV4dEFsaWduID0gJ2xlZnQnLCBmb250OiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gZm9udDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBhbGlnbjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQoc291bmROYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5zb3VuZHMuZ2V0KHNvdW5kTmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7IC8vIENsb25lIGZvciBjb25jdXJyZW50IHBsYXliYWNrXHJcbiAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgU291bmQgcGxheWJhY2sgZmFpbGVkOiAke3NvdW5kTmFtZX1gLCBlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtzb3VuZE5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0YXJ0TXVzaWMoc291bmROYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zdG9wTXVzaWMoKTsgLy8gU3RvcCBhbnkgZXhpc3RpbmcgbXVzaWNcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChzb3VuZE5hbWUpO1xyXG4gICAgICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljID0gYXVkaW87IC8vIFVzZSB0aGUgb3JpZ2luYWwgQXVkaW8gZWxlbWVudCBmb3IgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgTXVzaWMgcGxheWJhY2sgZmFpbGVkOiAke3NvdW5kTmFtZX1gLCBlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBNdXNpYyAnJHtzb3VuZE5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0b3BNdXNpYygpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5tdXNpYykge1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMubXVzaWMuY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdsb2JhbCBzY29wZSB0byBlbnN1cmUgaXQncyBhY2Nlc3NpYmxlIGJ5IEhUTUxcclxuZGVjbGFyZSBnbG9iYWwge1xyXG4gICAgaW50ZXJmYWNlIFdpbmRvdyB7XHJcbiAgICAgICAgZ2FtZTogR2FtZTtcclxuICAgIH1cclxufVxyXG5cclxud2luZG93Lm9ubG9hZCA9ICgpID0+IHtcclxuICAgIC8vIFJlbW92ZWQgY3VzdG9tIGZvbnQgbG9hZGluZyB0byBjb21wbHkgd2l0aCB0aGUgXCJiYXNpYyBmb250XCIgcmVxdWlyZW1lbnQuXHJcbiAgICAvLyBVc2luZyBhIGRlZmF1bHQgd2ViLXNhZmUgZm9udCBsaWtlIEFyaWFsLCBzYW5zLXNlcmlmLlxyXG4gICAgd2luZG93LmdhbWUgPSBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgd2luZG93LmdhbWUuc3RhcnQoKTtcclxufTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBeUZBLElBQUssWUFBTCxrQkFBS0EsZUFB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
