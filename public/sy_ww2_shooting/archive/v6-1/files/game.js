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
        game.playSound("explosion_sound");
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
  // Added shootSound
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
    this.shootSound = config.shootSound;
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
      game.playSound(this.shootSound);
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
      game.playSound("explosion_sound");
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
    const width = this.canvas.width || 960;
    const height = this.canvas.height || 540;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, width, height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText(message, width / 2, height / 2);
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
        this.playSound("explosion_sound");
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHt9OyAvLyBNYWtlIHRoaXMgZmlsZSBhIG1vZHVsZSB0byBhbGxvdyBnbG9iYWwgYXVnbWVudGF0aW9uXHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVNldHRpbmdzIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICBwbGF5ZXJJbml0aWFsSGVhbHRoOiBudW1iZXI7XHJcbiAgICBleHBsb3Npb25EdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0OiBzdHJpbmdbXTtcclxuICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgbG9hZGluZ1RleHQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFBsYXllckNvbmZpZyB7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7IC8vIGJ1bGxldHMgcGVyIHNlY29uZFxyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgaGl0U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEVuZW15Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyO1xyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgbW92ZW1lbnRQYXR0ZXJuOiBcInN0cmFpZ2h0XCIgfCBcInNpbmVcIiB8IFwiZGlhZ29uYWxcIjtcclxuICAgIHNob290U291bmQ6IHN0cmluZzsgLy8gQWRkZWQgc2hvb3RTb3VuZCB0byBFbmVteUNvbmZpZ1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQnVsbGV0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICBzb3VuZDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTGV2ZWxTcGF3bkV2ZW50IHtcclxuICAgIHRpbWU6IG51bWJlcjsgLy8gcmVsYXRpdmUgdG8gbGV2ZWwgc3RhcnQsIGluIHNlY29uZHNcclxuICAgIGVuZW15TmFtZTogc3RyaW5nO1xyXG4gICAgc3RhcnRYOiBcInJpZ2h0RWRnZVwiIHwgbnVtYmVyOyAvLyB4IHBvc2l0aW9uLCBvciBrZXl3b3JkXHJcbiAgICBzdGFydFk6IFwicmFuZG9tXCIgfCBcInRvcFwiIHwgXCJib3R0b21cIiB8IG51bWJlcjsgLy8geSBwb3NpdGlvbiwgb3Iga2V5d29yZFxyXG4gICAgY291bnQ/OiBudW1iZXI7IC8vIGZvciB3YXZlc1xyXG4gICAgaW50ZXJ2YWw/OiBudW1iZXI7IC8vIGZvciB3YXZlcyAoc2Vjb25kcylcclxuICAgIF9zcGF3bmVkPzogYm9vbGVhbjsgLy8gSW50ZXJuYWwgZmxhZyB0byB0cmFjayBpZiB0aGlzIGV2ZW50IGhhcyBiZWVuIHRyaWdnZXJlZFxyXG59XHJcblxyXG5pbnRlcmZhY2UgTGV2ZWxDb25maWcge1xyXG4gICAgZHVyYXRpb246IG51bWJlcjsgLy8gc2Vjb25kc1xyXG4gICAgc3Bhd25FdmVudHM6IExldmVsU3Bhd25FdmVudFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZURhdGEge1xyXG4gICAgZ2FtZVNldHRpbmdzOiBHYW1lU2V0dGluZ3M7XHJcbiAgICBwbGF5ZXI6IFBsYXllckNvbmZpZztcclxuICAgIGVuZW15VHlwZXM6IEVuZW15Q29uZmlnW107XHJcbiAgICBidWxsZXRUeXBlczogQnVsbGV0Q29uZmlnW107XHJcbiAgICBsZXZlbHM6IExldmVsQ29uZmlnW107XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgICAgICBzb3VuZHM6IFNvdW5kQXNzZXRbXTtcclxuICAgIH07XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcgPSBcIkxPQURJTkdcIixcclxuICAgIFRJVExFID0gXCJUSVRMRVwiLFxyXG4gICAgSU5TVFJVQ1RJT05TID0gXCJJTlNUUlVDVElPTlNcIixcclxuICAgIFBMQVlJTkcgPSBcIlBMQVlJTkdcIixcclxuICAgIEdBTUVfT1ZFUiA9IFwiR0FNRV9PVkVSXCIsXHJcbn1cclxuXHJcbmNsYXNzIEdhbWVPYmplY3Qge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2VOYW1lOiBzdHJpbmc7XHJcbiAgICBtYXJrZWRGb3JEZWxldGlvbjogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQgfCBudWxsID0gbnVsbDsgLy8gU3RvcmVkIHJlZmVyZW5jZSB0byB0aGUgbG9hZGVkIGltYWdlXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbWFnZU5hbWUgPSBpbWFnZU5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5pbWFnZSkge1xyXG4gICAgICAgICAgICB0aGlzLmltYWdlID0gZ2FtZS5pbWFnZXMuZ2V0KHRoaXMuaW1hZ2VOYW1lKSB8fCBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5pbWFnZSkge1xyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdyZWQnOyAvLyBGYWxsYmFja1xyXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHt9XHJcbn1cclxuXHJcbmNsYXNzIFBsYXllciBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyOyAvLyBidWxsZXRzIHBlciBzZWNvbmRcclxuICAgIGJ1bGxldFR5cGU6IEJ1bGxldENvbmZpZztcclxuICAgIGxhc3RTaG90VGltZTogbnVtYmVyID0gMDtcclxuICAgIGludmluY2libGVUaW1lcjogbnVtYmVyID0gMDsgLy8gZm9yIGJyaWVmIGludmluY2liaWxpdHkgYWZ0ZXIgaGl0XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGdhbWU6IEdhbWUpIHtcclxuICAgICAgICBjb25zdCBwbGF5ZXJDb25maWcgPSBnYW1lLmRhdGEhLnBsYXllcjtcclxuICAgICAgICBzdXBlcih4LCB5LCBwbGF5ZXJDb25maWcud2lkdGgsIHBsYXllckNvbmZpZy5oZWlnaHQsIHBsYXllckNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBnYW1lLmRhdGEhLmdhbWVTZXR0aW5ncy5wbGF5ZXJJbml0aWFsSGVhbHRoO1xyXG4gICAgICAgIHRoaXMubWF4SGVhbHRoID0gdGhpcy5oZWFsdGg7XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IHBsYXllckNvbmZpZy5zcGVlZDtcclxuICAgICAgICB0aGlzLmZpcmVSYXRlID0gcGxheWVyQ29uZmlnLmZpcmVSYXRlO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0VHlwZSA9IGdhbWUuZGF0YSEuYnVsbGV0VHlwZXMuZmluZChiID0+IGIubmFtZSA9PT0gcGxheWVyQ29uZmlnLmJ1bGxldFR5cGUpITtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmxlVGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1vdmVtZW50IGJhc2VkIG9uIGlucHV0XHJcbiAgICAgICAgaWYgKGdhbWUuaW5wdXQuZ2V0KCdBcnJvd1VwJykgfHwgZ2FtZS5pbnB1dC5nZXQoJ0tleVcnKSkgdGhpcy55IC09IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKGdhbWUuaW5wdXQuZ2V0KCdBcnJvd0Rvd24nKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5UycpKSB0aGlzLnkgKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICBpZiAoZ2FtZS5pbnB1dC5nZXQoJ0Fycm93TGVmdCcpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlBJykpIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dSaWdodCcpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlEJykpIHRoaXMueCArPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG5cclxuICAgICAgICAvLyBLZWVwIHBsYXllciB3aXRoaW4gY2FudmFzIGJvdW5kc1xyXG4gICAgICAgIHRoaXMueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMueCwgZ2FtZS5jYW52YXMud2lkdGggLSB0aGlzLndpZHRoKSk7XHJcbiAgICAgICAgdGhpcy55ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy55LCBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkpO1xyXG5cclxuICAgICAgICAvLyBTaG9vdGluZ1xyXG4gICAgICAgIGlmICgoZ2FtZS5pbnB1dC5nZXQoJ1NwYWNlJykgfHwgZ2FtZS5pbnB1dC5nZXQoJ0tleUonKSkgJiYgKGdhbWUuY3VycmVudFRpbWUgLSB0aGlzLmxhc3RTaG90VGltZSkgPiAoMTAwMCAvIHRoaXMuZmlyZVJhdGUpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldFNwZWVkID0gdGhpcy5idWxsZXRUeXBlLnNwZWVkO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXllckJ1bGxldHMucHVzaChuZXcgQnVsbGV0KFxyXG4gICAgICAgICAgICAgICAgdGhpcy54ICsgdGhpcy53aWR0aCwgLy8gU3Bhd24gYnVsbGV0IGZyb20gcGxheWVyJ3MgcmlnaHQgZWRnZVxyXG4gICAgICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyIC0gdGhpcy5idWxsZXRUeXBlLmhlaWdodCAvIDIsIC8vIENlbnRlcmVkIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS53aWR0aCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuaW1hZ2UsXHJcbiAgICAgICAgICAgICAgICBidWxsZXRTcGVlZCwgLy8gdnggKHNob290cyBzdHJhaWdodCByaWdodClcclxuICAgICAgICAgICAgICAgIDAsICAgICAgICAgICAvLyB2eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmRhbWFnZSxcclxuICAgICAgICAgICAgICAgIFwicGxheWVyXCJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKHRoaXMuYnVsbGV0VHlwZS5zb3VuZCk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdFNob3RUaW1lID0gZ2FtZS5jdXJyZW50VGltZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShkYW1hZ2U6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmludmluY2libGVUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGVhbHRoIC09IGRhbWFnZTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQoZ2FtZS5kYXRhIS5wbGF5ZXIuaGl0U291bmQpO1xyXG4gICAgICAgICAgICB0aGlzLmludmluY2libGVUaW1lciA9IDE7IC8vIDEgc2Vjb25kIGludmluY2liaWxpdHlcclxuICAgICAgICAgICAgaWYgKHRoaXMuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgZ2FtZS5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbih0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQsIGdhbWUuZGF0YSEuZ2FtZVNldHRpbmdzLmV4cGxvc2lvbkR1cmF0aW9uKSk7XHJcbiAgICAgICAgICAgICAgICBnYW1lLnBsYXlTb3VuZChcImV4cGxvc2lvbl9zb3VuZFwiKTsgLy8gQ2hhbmdlZCB0byBleHBsb3Npb25fc291bmRcclxuICAgICAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKFwiZ2FtZV9vdmVyXCIpOyAvLyBQbGF5IGdhbWUgb3ZlciBzb3VuZFxyXG4gICAgICAgICAgICAgICAgZ2FtZS5zZXRTdGF0ZShHYW1lU3RhdGUuR0FNRV9PVkVSKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyID4gMCkge1xyXG4gICAgICAgICAgICAvLyBGbGFzaCBlZmZlY3QgZHVyaW5nIGludmluY2liaWxpdHlcclxuICAgICAgICAgICAgaWYgKE1hdGguZmxvb3IodGhpcy5pbnZpbmNpYmxlVGltZXIgKiAxMCkgJSAyID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBzdXBlci5kcmF3KGN0eCwgZ2FtZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBzdXBlci5kcmF3KGN0eCwgZ2FtZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBCdWxsZXQgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgdHlwZTogXCJwbGF5ZXJcIiB8IFwiZW5lbXlcIjtcclxuICAgIHZ4OiBudW1iZXI7IC8vIFZlbG9jaXR5IFggY29tcG9uZW50XHJcbiAgICB2eTogbnVtYmVyOyAvLyBWZWxvY2l0eSBZIGNvbXBvbmVudFxyXG5cclxuICAgIC8vIE1vZGlmaWVkIGNvbnN0cnVjdG9yIHRvIGFjY2VwdCB2eCBhbmQgdnkgaW5zdGVhZCBvZiBhIHNpbmdsZSBzcGVlZFxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgdng6IG51bWJlciwgdnk6IG51bWJlciwgZGFtYWdlOiBudW1iZXIsIHR5cGU6IFwicGxheWVyXCIgfCBcImVuZW15XCIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xyXG4gICAgICAgIHRoaXMudnggPSB2eDtcclxuICAgICAgICB0aGlzLnZ5ID0gdnk7XHJcbiAgICAgICAgdGhpcy5kYW1hZ2UgPSBkYW1hZ2U7XHJcbiAgICAgICAgdGhpcy50eXBlID0gdHlwZTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnggKz0gdGhpcy52eCAqIGRlbHRhVGltZTsgLy8gVXNlIHZ4IGZvciBob3Jpem9udGFsIG1vdmVtZW50XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMudnkgKiBkZWx0YVRpbWU7IC8vIFVzZSB2eSBmb3IgdmVydGljYWwgbW92ZW1lbnRcclxuXHJcbiAgICAgICAgLy8gTWFyayBmb3IgZGVsZXRpb24gaWYgb2ZmIHNjcmVlbiBpbiBhbnkgZGlyZWN0aW9uXHJcbiAgICAgICAgaWYgKHRoaXMueCA+IGdhbWUuY2FudmFzLndpZHRoIHx8IHRoaXMueCArIHRoaXMud2lkdGggPCAwIHx8XHJcbiAgICAgICAgICAgIHRoaXMueSA+IGdhbWUuY2FudmFzLmhlaWdodCB8fCB0aGlzLnkgKyB0aGlzLmhlaWdodCA8IDApIHtcclxuICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBFbmVteSBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZmlyZVJhdGU6IG51bWJlcjtcclxuICAgIGJ1bGxldFR5cGU6IEJ1bGxldENvbmZpZztcclxuICAgIG1vdmVtZW50UGF0dGVybjogXCJzdHJhaWdodFwiIHwgXCJzaW5lXCIgfCBcImRpYWdvbmFsXCI7XHJcbiAgICBsYXN0U2hvdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBpbml0aWFsWTogbnVtYmVyOyAvLyBGb3Igc2luZSB3YXZlIG9yIGRpYWdvbmFsIHBhdHRlcm5zXHJcbiAgICBzaW5lV2F2ZU9mZnNldDogbnVtYmVyOyAvLyBGb3Igc2luZSB3YXZlIHRvIG1ha2UgZWFjaCBlbmVteSdzIHBhdHRlcm4gdW5pcXVlXHJcbiAgICB2ZXJ0aWNhbERpcmVjdGlvbjogMSB8IC0xID0gMTsgLy8gRm9yIGRpYWdvbmFsIG1vdmVtZW50OiAxIGZvciBkb3duLCAtMSBmb3IgdXBcclxuICAgIHNob290U291bmQ6IHN0cmluZzsgLy8gQWRkZWQgc2hvb3RTb3VuZFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCBjb25maWc6IEVuZW15Q29uZmlnLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgY29uZmlnLndpZHRoLCBjb25maWcuaGVpZ2h0LCBjb25maWcuaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gY29uZmlnLmhlYWx0aDtcclxuICAgICAgICB0aGlzLnNjb3JlVmFsdWUgPSBjb25maWcuc2NvcmVWYWx1ZTtcclxuICAgICAgICB0aGlzLnNwZWVkID0gY29uZmlnLnNwZWVkO1xyXG4gICAgICAgIHRoaXMuZmlyZVJhdGUgPSBjb25maWcuZmlyZVJhdGU7XHJcbiAgICAgICAgdGhpcy5idWxsZXRUeXBlID0gZ2FtZS5kYXRhIS5idWxsZXRUeXBlcy5maW5kKGIgPT4gYi5uYW1lID09PSBjb25maWcuYnVsbGV0VHlwZSkhO1xyXG4gICAgICAgIHRoaXMubW92ZW1lbnRQYXR0ZXJuID0gY29uZmlnLm1vdmVtZW50UGF0dGVybjtcclxuICAgICAgICB0aGlzLmluaXRpYWxZID0geTtcclxuICAgICAgICB0aGlzLnNpbmVXYXZlT2Zmc2V0ID0gTWF0aC5yYW5kb20oKSAqIE1hdGguUEkgKiAyOyAvLyBSYW5kb20gcGhhc2UgZm9yIHNpbmUgd2F2ZVxyXG4gICAgICAgIHRoaXMudmVydGljYWxEaXJlY3Rpb24gPSAoTWF0aC5yYW5kb20oKSA8IDAuNSkgPyAxIDogLTE7IC8vIFJhbmRvbSBpbml0aWFsIGRpcmVjdGlvbiBmb3IgZGlhZ29uYWxcclxuICAgICAgICB0aGlzLnNob290U291bmQgPSBjb25maWcuc2hvb3RTb3VuZDsgLy8gSW5pdGlhbGl6ZSBzaG9vdFNvdW5kXHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgLy8gSG9yaXpvbnRhbCBtb3ZlbWVudFxyXG4gICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG5cclxuICAgICAgICAvLyBWZXJ0aWNhbCBtb3ZlbWVudCBiYXNlZCBvbiBwYXR0ZXJuXHJcbiAgICAgICAgaWYgKHRoaXMubW92ZW1lbnRQYXR0ZXJuID09PSBcInNpbmVcIikge1xyXG4gICAgICAgICAgICBjb25zdCBhbXBsaXR1ZGUgPSA1MDsgLy8gSG93IGZhciB1cC9kb3duIGl0IG1vdmVzXHJcbiAgICAgICAgICAgIGNvbnN0IGZyZXF1ZW5jeSA9IDI7IC8vIEhvdyBmYXN0IGl0IHdpZ2dsZXNcclxuICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5pbml0aWFsWSArIE1hdGguc2luKGdhbWUuY3VycmVudFRpbWUgKiAwLjAwMSAqIGZyZXF1ZW5jeSArIHRoaXMuc2luZVdhdmVPZmZzZXQpICogYW1wbGl0dWRlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5tb3ZlbWVudFBhdHRlcm4gPT09IFwiZGlhZ29uYWxcIikge1xyXG4gICAgICAgICAgICBjb25zdCBkaWFnb25hbFNwZWVkID0gdGhpcy5zcGVlZCAqIDAuNzsgLy8gU2xvd2VyIHZlcnRpY2FsIG1vdmVtZW50XHJcbiAgICAgICAgICAgIHRoaXMueSArPSB0aGlzLnZlcnRpY2FsRGlyZWN0aW9uICogZGlhZ29uYWxTcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgICAgIC8vIFJldmVyc2UgZGlyZWN0aW9uIGlmIGhpdHRpbmcgdG9wIG9yIGJvdHRvbSBlZGdlc1xyXG4gICAgICAgICAgICBpZiAodGhpcy55IDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMueSA9IDA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRpY2FsRGlyZWN0aW9uID0gMTsgLy8gTW92ZSBkb3duXHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy55ID49IGdhbWUuY2FudmFzLmhlaWdodCAtIHRoaXMuaGVpZ2h0KSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnkgPSBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodDtcclxuICAgICAgICAgICAgICAgIHRoaXMudmVydGljYWxEaXJlY3Rpb24gPSAtMTsgLy8gTW92ZSB1cFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIENsYW1wIFkgdG8gc3RheSBvbiBzY3JlZW4gKG9ubHkgbmVlZGVkIGlmIG1vdmVtZW50IHBhdHRlcm4gZG9lc24ndCBoYW5kbGUgaXQsIGUuZy4sICdzdHJhaWdodCcpXHJcbiAgICAgICAgLy8gRm9yICdzaW5lJyBhbmQgJ2RpYWdvbmFsJywgdGhlaXIgbG9naWMgdXN1YWxseSBpbXBsaWNpdGx5IGtlZXBzIGl0IHdpdGhpbiBib3VuZHMgb3JcclxuICAgICAgICAvLyB0aGUgYm91bmNlIGxvZ2ljIGFkanVzdHMgaXQuIEtlZXBpbmcgaXQgYXMgYSBnZW5lcmFsIGZhbGxiYWNrLCB0aG91Z2ggbGVzcyBjcml0aWNhbCBmb3IgdXBkYXRlZCBkaWFnb25hbC5cclxuICAgICAgICB0aGlzLnkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLnksIGdhbWUuY2FudmFzLmhlaWdodCAtIHRoaXMuaGVpZ2h0KSk7XHJcblxyXG5cclxuICAgICAgICAvLyBTaG9vdGluZzogRW5lbWllcyBub3cgZmlyZSBidWxsZXRzIHRvd2FyZHMgdGhlIHBsYXllcidzIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKHRoaXMuZmlyZVJhdGUgPiAwICYmIChnYW1lLmN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0U2hvdFRpbWUpID4gKDEwMDAgLyB0aGlzLmZpcmVSYXRlKSAmJiBnYW1lLnBsYXllciAmJiAhZ2FtZS5wbGF5ZXIubWFya2VkRm9yRGVsZXRpb24pIHtcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0U3Bhd25YID0gdGhpcy54IC0gdGhpcy5idWxsZXRUeXBlLndpZHRoOyAvLyBTcGF3biBidWxsZXQgZnJvbSBlbmVteSdzIGxlZnQgZWRnZVxyXG4gICAgICAgICAgICBjb25zdCBidWxsZXRTcGF3blkgPSB0aGlzLnkgKyB0aGlzLmhlaWdodCAvIDIgLSB0aGlzLmJ1bGxldFR5cGUuaGVpZ2h0IC8gMjsgLy8gQ2VudGVyZWQgdmVydGljYWxseVxyXG5cclxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGRpcmVjdGlvbiB2ZWN0b3IgdG93YXJkcyB0aGUgcGxheWVyJ3MgY2VudGVyXHJcbiAgICAgICAgICAgIGNvbnN0IHBsYXllckNlbnRlclggPSBnYW1lLnBsYXllci54ICsgZ2FtZS5wbGF5ZXIud2lkdGggLyAyO1xyXG4gICAgICAgICAgICBjb25zdCBwbGF5ZXJDZW50ZXJZID0gZ2FtZS5wbGF5ZXIueSArIGdhbWUucGxheWVyLmhlaWdodCAvIDI7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBkaXJlY3Rpb25YID0gcGxheWVyQ2VudGVyWCAtIGJ1bGxldFNwYXduWDtcclxuICAgICAgICAgICAgY29uc3QgZGlyZWN0aW9uWSA9IHBsYXllckNlbnRlclkgLSBidWxsZXRTcGF3blk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBtYWduaXR1ZGUgPSBNYXRoLnNxcnQoZGlyZWN0aW9uWCAqIGRpcmVjdGlvblggKyBkaXJlY3Rpb25ZICogZGlyZWN0aW9uWSk7XHJcblxyXG4gICAgICAgICAgICBsZXQgYnVsbGV0Vng6IG51bWJlcjtcclxuICAgICAgICAgICAgbGV0IGJ1bGxldFZ5OiBudW1iZXI7XHJcblxyXG4gICAgICAgICAgICBpZiAobWFnbml0dWRlID4gMCkge1xyXG4gICAgICAgICAgICAgICAgLy8gTm9ybWFsaXplIHRoZSBkaXJlY3Rpb24gdmVjdG9yIGFuZCBtdWx0aXBseSBieSBidWxsZXQgc3BlZWRcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWREaXJlY3Rpb25YID0gZGlyZWN0aW9uWCAvIG1hZ25pdHVkZTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWREaXJlY3Rpb25ZID0gZGlyZWN0aW9uWSAvIG1hZ25pdHVkZTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldFZ4ID0gbm9ybWFsaXplZERpcmVjdGlvblggKiB0aGlzLmJ1bGxldFR5cGUuc3BlZWQ7XHJcbiAgICAgICAgICAgICAgICBidWxsZXRWeSA9IG5vcm1hbGl6ZWREaXJlY3Rpb25ZICogdGhpcy5idWxsZXRUeXBlLnNwZWVkO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2s6IElmIGVuZW15IGlzIG9uIHRvcCBvZiBwbGF5ZXIgKG1hZ25pdHVkZSBpcyAwKSwgc2hvb3Qgc3RyYWlnaHQgbGVmdFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0VnggPSAtdGhpcy5idWxsZXRUeXBlLnNwZWVkO1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0VnkgPSAwO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBnYW1lLmVuZW15QnVsbGV0cy5wdXNoKG5ldyBCdWxsZXQoXHJcbiAgICAgICAgICAgICAgICBidWxsZXRTcGF3blgsXHJcbiAgICAgICAgICAgICAgICBidWxsZXRTcGF3blksXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUud2lkdGgsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmltYWdlLFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0VngsIC8vIENhbGN1bGF0ZWQgdmVsb2NpdHkgWFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0VnksIC8vIENhbGN1bGF0ZWQgdmVsb2NpdHkgWVxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmRhbWFnZSxcclxuICAgICAgICAgICAgICAgIFwiZW5lbXlcIlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQodGhpcy5zaG9vdFNvdW5kKTsgLy8gVXNlIHRoZSBlbmVteSdzIHNwZWNpZmljIHNob290IHNvdW5kXHJcbiAgICAgICAgICAgIHRoaXMubGFzdFNob3RUaW1lID0gZ2FtZS5jdXJyZW50VGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1hcmsgZm9yIGRlbGV0aW9uIGlmIG9mZiBzY3JlZW5cclxuICAgICAgICBpZiAodGhpcy54ICsgdGhpcy53aWR0aCA8IDApIHtcclxuICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRha2VEYW1hZ2UoZGFtYWdlOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmhlYWx0aCAtPSBkYW1hZ2U7XHJcbiAgICAgICAgaWYgKHRoaXMuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgIGdhbWUuc2NvcmUgKz0gdGhpcy5zY29yZVZhbHVlO1xyXG4gICAgICAgICAgICBnYW1lLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MuZXhwbG9zaW9uRHVyYXRpb24pKTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQoXCJleHBsb3Npb25fc291bmRcIik7IC8vIENoYW5nZWQgdG8gZXhwbG9zaW9uX3NvdW5kXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBFeHBsb3Npb24gZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHRpbWVyOiBudW1iZXI7XHJcbiAgICBkdXJhdGlvbjogbnVtYmVyOyAvLyBpbiBzZWNvbmRzXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBkdXJhdGlvbjogbnVtYmVyKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgXCJleHBsb3Npb25cIik7IC8vIEFzc3VtaW5nIFwiZXhwbG9zaW9uXCIgaXMgdGhlIGltYWdlIG5hbWVcclxuICAgICAgICB0aGlzLmR1cmF0aW9uID0gZHVyYXRpb247XHJcbiAgICAgICAgdGhpcy50aW1lciA9IGR1cmF0aW9uO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMudGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBCYWNrZ3JvdW5kIHtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbiAgICBzY3JvbGxTcGVlZDogbnVtYmVyO1xyXG4gICAgeDE6IG51bWJlciA9IDA7XHJcbiAgICB4MjogbnVtYmVyID0gMDsgLy8gZm9yIGNvbnRpbnVvdXMgc2Nyb2xsaW5nXHJcbiAgICBnYW1lV2lkdGg6IG51bWJlcjtcclxuICAgIGdhbWVIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihpbWFnZU5hbWU6IHN0cmluZywgc2Nyb2xsU3BlZWQ6IG51bWJlciwgZ2FtZVdpZHRoOiBudW1iZXIsIGdhbWVIZWlnaHQ6IG51bWJlciwgZ2FtZTogR2FtZSkge1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSBnYW1lLmltYWdlcy5nZXQoaW1hZ2VOYW1lKSB8fCBudWxsO1xyXG4gICAgICAgIHRoaXMuc2Nyb2xsU3BlZWQgPSBzY3JvbGxTcGVlZDtcclxuICAgICAgICB0aGlzLmdhbWVXaWR0aCA9IGdhbWVXaWR0aDtcclxuICAgICAgICB0aGlzLmdhbWVIZWlnaHQgPSBnYW1lSGVpZ2h0O1xyXG4gICAgICAgIGlmICh0aGlzLmltYWdlKSB7XHJcbiAgICAgICAgICAgIC8vIEluaXRpYWxpemUgcG9zaXRpb25zIGZvciB0d28gdGlsZXMgdG8gY292ZXIgdGhlIHNjcmVlbiBhbmQgYmV5b25kXHJcbiAgICAgICAgICAgIHRoaXMueDEgPSAwO1xyXG4gICAgICAgICAgICAvLyBFbnN1cmUgeDIgc3RhcnRzIHdoZXJlIHgxIGVuZHMsIGhhbmRsaW5nIHBvdGVudGlhbCBpbWFnZSB3aWR0aCBkaWZmZXJlbmNlc1xyXG4gICAgICAgICAgICAvLyBUaGUgaW1hZ2UgbWlnaHQgbm90IGJlIGV4YWN0bHkgY2FudmFzIHdpZHRoLCBzbyB3ZSB0aWxlIGl0IGJhc2VkIG9uIGl0cyBvd24gd2lkdGguXHJcbiAgICAgICAgICAgIHRoaXMueDIgPSB0aGlzLmltYWdlLndpZHRoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaW1hZ2UpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3Qgc2Nyb2xsQW1vdW50ID0gdGhpcy5zY3JvbGxTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB0aGlzLngxIC09IHNjcm9sbEFtb3VudDtcclxuICAgICAgICB0aGlzLngyIC09IHNjcm9sbEFtb3VudDtcclxuXHJcbiAgICAgICAgLy8gSWYgYW4gaW1hZ2UgdGlsZSBtb3ZlcyBjb21wbGV0ZWx5IG9mZi1zY3JlZW4gdG8gdGhlIGxlZnQsIHJlc2V0IGl0IHRvIHRoZSByaWdodFxyXG4gICAgICAgIGlmICh0aGlzLngxIDw9IC10aGlzLmltYWdlLndpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMueDEgPSB0aGlzLngyICsgdGhpcy5pbWFnZS53aWR0aDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMueDIgPD0gLXRoaXMuaW1hZ2Uud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54MiA9IHRoaXMueDEgKyB0aGlzLmltYWdlLndpZHRoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgLy8gRHJhdyBib3RoIGJhY2tncm91bmQgdGlsZXMsIHNjYWxlZCB0byBjYW52YXMgaGVpZ2h0XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54MSwgMCwgdGhpcy5pbWFnZS53aWR0aCwgdGhpcy5nYW1lSGVpZ2h0KTtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngyLCAwLCB0aGlzLmltYWdlLndpZHRoLCB0aGlzLmdhbWVIZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgZGF0YTogR2FtZURhdGEgfCBudWxsID0gbnVsbDtcclxuICAgIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIGxhc3RGcmFtZVRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBjdXJyZW50VGltZTogbnVtYmVyID0gMDsgLy8gVG90YWwgZWxhcHNlZCB0aW1lIGluIG1pbGxpc2Vjb25kc1xyXG5cclxuICAgIHBsYXllcjogUGxheWVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBlbmVtaWVzOiBFbmVteVtdID0gW107XHJcbiAgICBwbGF5ZXJCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZW5lbXlCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZXhwbG9zaW9uczogRXhwbG9zaW9uW10gPSBbXTtcclxuICAgIGJhY2tncm91bmQ6IEJhY2tncm91bmQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIGN1cnJlbnRMZXZlbEluZGV4OiBudW1iZXIgPSAwO1xyXG4gICAgbGV2ZWxUaW1lcjogbnVtYmVyID0gMDsgLy8gVGltZSBlbGFwc2VkIGluIGN1cnJlbnQgbGV2ZWwgKHNlY29uZHMpXHJcbiAgICBhY3RpdmVTcGF3bkludGVydmFsczogU2V0PG51bWJlcj4gPSBuZXcgU2V0KCk7IC8vIFRvIGNsZWFyIGludGVydmFscyB3aGVuIGNoYW5naW5nIGxldmVsc1xyXG5cclxuICAgIGlucHV0OiBNYXA8c3RyaW5nLCBib29sZWFuPiA9IG5ldyBNYXAoKTtcclxuICAgIG11c2ljOiBIVE1MQXVkaW9FbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgdGhpcy5pbml0RXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKFwiTG9hZGluZyBHYW1lIERhdGEuLi5cIik7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuXHJcbiAgICAgICAgICAgIGlmICghdGhpcy5kYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEuXCIpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oXCJMb2FkaW5nIEFzc2V0cy4uLlwiKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgdXAgYmFja2dyb3VuZCBhZnRlciBsb2FkaW5nIGFzc2V0c1xyXG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmQgPSBuZXcgQmFja2dyb3VuZChcclxuICAgICAgICAgICAgICAgIFwiYmFja2dyb3VuZFwiLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5zY3JvbGxTcGVlZCxcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgdGhpc1xyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5USVRMRSk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHN0YXJ0IGdhbWU6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbihgRXJyb3I6ICR7ZXJyb3J9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0xvYWRpbmdTY3JlZW4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgLy8gRW5zdXJlIGNhbnZhcyBkaW1lbnNpb25zIGFyZSBzZXQgZXZlbiBpZiBkYXRhIGlzbid0IGxvYWRlZCB5ZXQgZm9yIGluaXRpYWwgc2NyZWVuXHJcbiAgICAgICAgLy8gVXNlIGZhbGxiYWNrIGlmIGRhdGEuZ2FtZVNldHRpbmdzIGlzbid0IGF2YWlsYWJsZSB5ZXRcclxuICAgICAgICBjb25zdCB3aWR0aCA9IHRoaXMuY2FudmFzLndpZHRoIHx8IDk2MDsgLy8gRGVmYXVsdCB3aWR0aFxyXG4gICAgICAgIGNvbnN0IGhlaWdodCA9IHRoaXMuY2FudmFzLmhlaWdodCB8fCA1NDA7IC8vIERlZmF1bHQgaGVpZ2h0XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB3aWR0aCwgaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsLCBzYW5zLXNlcmlmJzsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobWVzc2FnZSwgd2lkdGggLyAyLCBoZWlnaHQgLyAyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuZGF0YS5hc3NldHMuaW1hZ2VzLm1hcChhc3luYyAoYXNzZXQpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChhc3NldC5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcy5tYXAoYXN5bmMgKGFzc2V0KSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8uc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIC8vIFByZWxvYWQgdG8gZW5zdXJlIGl0J3MgcmVhZHlcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0RXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoWydBcnJvd1VwJywgJ0Fycm93RG93bicsICdBcnJvd0xlZnQnLCAnQXJyb3dSaWdodCcsICdTcGFjZScsICdLZXlXJywgJ0tleUEnLCAnS2V5UycsICdLZXlEJywgJ0tleUonLCAnRW50ZXInXS5pbmNsdWRlcyhlLmNvZGUpKSB7XHJcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgc2Nyb2xsaW5nIGZvciBhcnJvdyBrZXlzL3NwYWNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0LnNldChlLmNvZGUsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGUuY29kZSA9PT0gJ0VudGVyJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlRW50ZXJLZXkoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChbJ0Fycm93VXAnLCAnQXJyb3dEb3duJywgJ0Fycm93TGVmdCcsICdBcnJvd1JpZ2h0JywgJ1NwYWNlJywgJ0tleVcnLCAnS2V5QScsICdLZXlTJywgJ0tleUQnLCAnS2V5SicsICdFbnRlciddLmluY2x1ZGVzKGUuY29kZSkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5wdXQuc2V0KGUuY29kZSwgZmFsc2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVFbnRlcktleSgpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZShHYW1lU3RhdGUuSU5TVFJVQ1RJT05TKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5QTEFZSU5HKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5USVRMRSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzZXRTdGF0ZShuZXdTdGF0ZTogR2FtZVN0YXRlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBuZXdTdGF0ZTtcclxuICAgICAgICBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhcnRNdXNpYyhcImJnbVwiLCB0cnVlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnN0b3BNdXNpYygpO1xyXG4gICAgICAgICAgICBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICAgICAgLy8gT3B0aW9uYWxseSBwbGF5IHRpdGxlIHNjcmVlbiBzcGVjaWZpYyBtdXNpYyBoZXJlXHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgICAgIC8vIEdhbWUgb3ZlciBzb3VuZCBpcyBwbGF5ZWQgaW4gUGxheWVyLnRha2VEYW1hZ2VcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGVhciBhbnkgYWN0aXZlIHNwYXduIGludGVydmFscyB3aGVuIHN0YXRlIGNoYW5nZXMgZnJvbSBQTEFZSU5HXHJcbiAgICAgICAgaWYgKG5ld1N0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmZvckVhY2goaWQgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmNsZWFyKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGluaXRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCAqIDAuMSxcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIHRoaXMuZGF0YS5wbGF5ZXIuaGVpZ2h0IC8gMixcclxuICAgICAgICAgICAgdGhpc1xyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gW107XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSBbXTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRMZXZlbEluZGV4ID0gMDtcclxuICAgICAgICB0aGlzLmxldmVsVGltZXIgPSAwO1xyXG4gICAgICAgIC8vIFJlc2V0IF9zcGF3bmVkIGZsYWcgZm9yIGFsbCBldmVudHMgaW4gYWxsIGxldmVsc1xyXG4gICAgICAgIHRoaXMuZGF0YS5sZXZlbHMuZm9yRWFjaChsZXZlbCA9PiB7XHJcbiAgICAgICAgICAgIGxldmVsLnNwYXduRXZlbnRzLmZvckVhY2goZXZlbnQgPT4gZXZlbnQuX3NwYXduZWQgPSBmYWxzZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2FtZUxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkge1xyXG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWVzdGFtcCAtIHRoaXMubGFzdEZyYW1lVGltZSkgLyAxMDAwOyAvLyBEZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSB0aW1lc3RhbXA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50VGltZSA9IHRpbWVzdGFtcDsgLy8gVG90YWwgZWxhcHNlZCB0aW1lIGluIG1pbGxpc2Vjb25kc1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5aW5nKGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGVQbGF5aW5nKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllciB8fCAhdGhpcy5kYXRhIHx8ICF0aGlzLmJhY2tncm91bmQpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBMZXZlbCBwcm9ncmVzc2lvbiBhbmQgZW5lbXkgc3Bhd25pbmdcclxuICAgICAgICB0aGlzLmxldmVsVGltZXIgKz0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRMZXZlbENvbmZpZyA9IHRoaXMuZGF0YS5sZXZlbHNbdGhpcy5jdXJyZW50TGV2ZWxJbmRleF07XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50TGV2ZWxDb25maWcpIHtcclxuICAgICAgICAgICAgY3VycmVudExldmVsQ29uZmlnLnNwYXduRXZlbnRzLmZvckVhY2goZXZlbnQgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LnRpbWUgPD0gdGhpcy5sZXZlbFRpbWVyICYmICFldmVudC5fc3Bhd25lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5jb3VudCAmJiBldmVudC5pbnRlcnZhbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudC5fc3Bhd25lZCA9IHRydWU7IC8vIE1hcmsgYXMgc3Bhd25lZCB0byBwcmV2ZW50IHJlLXRyaWdnZXJpbmcgd2F2ZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgc3Bhd25lZENvdW50ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW50ZXJ2YWxJZCA9IHNldEludGVydmFsKCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzcGF3bmVkQ291bnQgPCBldmVudC5jb3VudCEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRW5lbXkoZXZlbnQuZW5lbXlOYW1lLCBldmVudC5zdGFydFgsIGV2ZW50LnN0YXJ0WSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3Bhd25lZENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWxJZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5kZWxldGUoaW50ZXJ2YWxJZCBhcyBudW1iZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBldmVudC5pbnRlcnZhbCAqIDEwMDApOyAvLyBpbnRlcnZhbCBpbiBtaWxsaXNlY29uZHNcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5hZGQoaW50ZXJ2YWxJZCBhcyBudW1iZXIpOyAvLyBTdG9yZSBJRCB0byBjbGVhciBsYXRlclxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNpbmdsZSBlbmVteSBzcGF3blxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRW5lbXkoZXZlbnQuZW5lbXlOYW1lLCBldmVudC5zdGFydFgsIGV2ZW50LnN0YXJ0WSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50Ll9zcGF3bmVkID0gdHJ1ZTsgLy8gTWFyayBhcyBzcGF3bmVkXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIGxldmVsIGR1cmF0aW9uIGlzIG92ZXIsIGFkdmFuY2UgdG8gbmV4dCBsZXZlbCBvciBlbmQgZ2FtZVxyXG4gICAgICAgICAgICBpZiAodGhpcy5sZXZlbFRpbWVyID49IGN1cnJlbnRMZXZlbENvbmZpZy5kdXJhdGlvbikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCsrO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sZXZlbFRpbWVyID0gMDsgLy8gUmVzZXQgdGltZXIgZm9yIHRoZSBuZXcgbGV2ZWxcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBDbGVhciBhbnkgcmVtYWluaW5nIGludGVydmFscyBmb3IgdGhlIGp1c3QtZW5kZWQgbGV2ZWxcclxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuZm9yRWFjaChpZCA9PiBjbGVhckludGVydmFsKGlkKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmNsZWFyKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmRhdGEubGV2ZWxzW3RoaXMuY3VycmVudExldmVsSW5kZXhdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWxsIGxldmVscyBjb21wbGV0ZWRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVIpOyAvLyBDb3VsZCBiZSAnVklDVE9SWScgc3RhdGVcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIE5vIG1vcmUgbGV2ZWxzLCBwZXJoYXBzIGtlZXAgcHJldmlvdXMgbGV2ZWwncyBzcGF3bnMgb3IganVzdCB3YWl0IGZvciBwbGF5ZXIgdG8gZmluaXNoXHJcbiAgICAgICAgICAgIC8vIEZvciBub3csIGxldCdzIGp1c3QgdHJhbnNpdGlvbiB0byBnYW1lIG92ZXIuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgYW5kIGZpbHRlciBnYW1lIG9iamVjdHNcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlID0+IGUudXBkYXRlKGRlbHRhVGltZSwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGIgPT4gYi51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChiID0+IGIudXBkYXRlKGRlbHRhVGltZSwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGUgPT4gZS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIENvbGxpc2lvbiBkZXRlY3Rpb25cclxuICAgICAgICB0aGlzLmNoZWNrQ29sbGlzaW9ucygpO1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgbWFya2VkIGZvciBkZWxldGlvblxyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IHRoaXMuZW5lbWllcy5maWx0ZXIoZSA9PiAhZS5tYXJrZWRGb3JEZWxldGlvbik7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzID0gdGhpcy5wbGF5ZXJCdWxsZXRzLmZpbHRlcihiID0+ICFiLm1hcmtlZEZvckRlbGV0aW9uKTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cyA9IHRoaXMuZW5lbXlCdWxsZXRzLmZpbHRlcihiID0+ICFiLm1hcmtlZEZvckRlbGV0aW9uKTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSB0aGlzLmV4cGxvc2lvbnMuZmlsdGVyKGUgPT4gIWUubWFya2VkRm9yRGVsZXRpb24pO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBnYW1lIG92ZXIgY29uZGl0aW9uIChwbGF5ZXIuaGVhbHRoIDw9IDAgaXMgaGFuZGxlZCBpbiBQbGF5ZXIudGFrZURhbWFnZSlcclxuICAgIH1cclxuXHJcbiAgICBzcGF3bkVuZW15KGVuZW15TmFtZTogc3RyaW5nLCBzdGFydFg6IFwicmlnaHRFZGdlXCIgfCBudW1iZXIsIHN0YXJ0WTogXCJyYW5kb21cIiB8IFwidG9wXCIgfCBcImJvdHRvbVwiIHwgbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICBjb25zdCBlbmVteUNvbmZpZyA9IHRoaXMuZGF0YS5lbmVteVR5cGVzLmZpbmQoZSA9PiBlLm5hbWUgPT09IGVuZW15TmFtZSk7XHJcbiAgICAgICAgaWYgKCFlbmVteUNvbmZpZykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYEVuZW15IHR5cGUgJyR7ZW5lbXlOYW1lfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgYWN0dWFsWCA9IHN0YXJ0WCA9PT0gXCJyaWdodEVkZ2VcIiA/IHRoaXMuY2FudmFzLndpZHRoIDogc3RhcnRYO1xyXG4gICAgICAgIGxldCBhY3R1YWxZOiBudW1iZXI7XHJcblxyXG4gICAgICAgIGlmIChzdGFydFkgPT09IFwicmFuZG9tXCIpIHtcclxuICAgICAgICAgICAgYWN0dWFsWSA9IE1hdGgucmFuZG9tKCkgKiAodGhpcy5jYW52YXMuaGVpZ2h0IC0gZW5lbXlDb25maWcuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0WSA9PT0gXCJ0b3BcIikge1xyXG4gICAgICAgICAgICBhY3R1YWxZID0gMDtcclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0WSA9PT0gXCJib3R0b21cIikge1xyXG4gICAgICAgICAgICBhY3R1YWxZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC0gZW5lbXlDb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGFjdHVhbFkgPSBzdGFydFk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVuZW1pZXMucHVzaChuZXcgRW5lbXkoYWN0dWFsWCwgYWN0dWFsWSwgZW5lbXlDb25maWcsIHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBjaGVja0NvbGxpc2lvbnMoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllcikgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgYnVsbGV0cyB2cy4gRW5lbWllc1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICghYnVsbGV0Lm1hcmtlZEZvckRlbGV0aW9uICYmICFlbmVteS5tYXJrZWRGb3JEZWxldGlvbiAmJiB0aGlzLmlzQ29sbGlkaW5nKGJ1bGxldCwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkudGFrZURhbWFnZShidWxsZXQuZGFtYWdlLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBidWxsZXQubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRW5lbXkgYnVsbGV0cyB2cy4gUGxheWVyXHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWJ1bGxldC5tYXJrZWRGb3JEZWxldGlvbiAmJiAhdGhpcy5wbGF5ZXIhLm1hcmtlZEZvckRlbGV0aW9uICYmIHRoaXMuaXNDb2xsaWRpbmcoYnVsbGV0LCB0aGlzLnBsYXllciEpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllciEudGFrZURhbWFnZShidWxsZXQuZGFtYWdlLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHZzLiBFbmVtaWVzIChjb250YWN0IGRhbWFnZS9jb2xsaXNpb24pXHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWVuZW15Lm1hcmtlZEZvckRlbGV0aW9uICYmICF0aGlzLnBsYXllciEubWFya2VkRm9yRGVsZXRpb24gJiYgdGhpcy5pc0NvbGxpZGluZyh0aGlzLnBsYXllciEsIGVuZW15KSkge1xyXG4gICAgICAgICAgICAgICAgLy8gUGxheWVyIHRha2VzIGRhbWFnZSBhbmQgZW5lbXkgaXMgZGVzdHJveWVkXHJcbiAgICAgICAgICAgICAgICAvLyBGb3Igc2ltcGxpY2l0eSwgbGV0J3Mgc2F5IGNvbnRhY3Qgd2l0aCBhbiBlbmVteSBpbnN0YW50bHkgZGVzdHJveXMgaXQgYW5kIGRlYWxzIHNpZ25pZmljYW50IGRhbWFnZSB0byBwbGF5ZXJcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyIS50YWtlRGFtYWdlKGVuZW15LmhlYWx0aCwgdGhpcyk7IC8vIEVuZW15J3MgaGVhbHRoIGhlcmUgcmVwcmVzZW50cyBjb250YWN0IGRhbWFnZVxyXG4gICAgICAgICAgICAgICAgZW5lbXkubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbihlbmVteS54LCBlbmVteS55LCBlbmVteS53aWR0aCwgZW5lbXkuaGVpZ2h0LCB0aGlzLmRhdGEhLmdhbWVTZXR0aW5ncy5leHBsb3Npb25EdXJhdGlvbikpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoXCJleHBsb3Npb25fc291bmRcIik7IC8vIENoYW5nZWQgdG8gZXhwbG9zaW9uX3NvdW5kXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpc0NvbGxpZGluZyhvYmoxOiBHYW1lT2JqZWN0LCBvYmoyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIG9iajEueCA8IG9iajIueCArIG9iajIud2lkdGggJiZcclxuICAgICAgICAgICAgb2JqMS54ICsgb2JqMS53aWR0aCA+IG9iajIueCAmJlxyXG4gICAgICAgICAgICBvYmoxLnkgPCBvYmoyLnkgKyBvYmoyLmhlaWdodCAmJlxyXG4gICAgICAgICAgICBvYmoxLnkgKyBvYmoxLmhlaWdodCA+IG9iajIueTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpOyAvLyBDbGVhciBlbnRpcmUgY2FudmFzXHJcblxyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oXCJMb2FkaW5nLi4uXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBbHdheXMgZHJhdyBiYWNrZ3JvdW5kIGlmIGxvYWRlZFxyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZD8uZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJQbGF5aW5nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyBMb2FkaW5nIHNjcmVlbiBhbHJlYWR5IGhhbmRsZWQgYnkgZHJhd0xvYWRpbmdTY3JlZW5cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJQbGF5aW5nKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGUgPT4gZS5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYiA9PiBiLmRyYXcodGhpcy5jdHgsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGIgPT4gYi5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXI/LmRyYXcodGhpcy5jdHgsIHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGUgPT4gZS5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUlcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBTY29yZTogJHt0aGlzLnNjb3JlfWAsIDEwLCAzMCwgJ3doaXRlJywgJ2xlZnQnLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBIZWFsdGg6ICR7dGhpcy5wbGF5ZXI/LmhlYWx0aCB8fCAwfWAsIDEwLCA2MCwgJ3doaXRlJywgJ2xlZnQnLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpOyAvLyBBc3N1bWluZyB0aXRsZV9iYWNrZ3JvdW5kIGltYWdlXHJcbiAgICAgICAgaWYgKHRpdGxlSW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRpdGxlSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdkYXJrYmx1ZSc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgJ3doaXRlJywgJ2NlbnRlcicsICc0OHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byBTdGFydFwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJ3doaXRlJywgJ2NlbnRlcicsICcyNHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckluc3RydWN0aW9uc1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlmICh0aXRsZUltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZSh0aXRsZUltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZGFya2JsdWUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dChcIlx1Qzg3MFx1Qzc5MVx1QkM5NVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIDEwMCwgJ3doaXRlJywgJ2NlbnRlcicsICc0MHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuaW5zdHJ1Y3Rpb25zVGV4dC5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGxpbmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgMTgwICsgaW5kZXggKiA0MCwgJ3doaXRlJywgJ2NlbnRlcicsICcyMHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byBQbGF5XCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMTAwLCAnd2hpdGUnLCAnY2VudGVyJywgJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyR2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ2FtZU92ZXJUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCwgJ3JlZCcsICdjZW50ZXInLCAnNjBweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBGaW5hbCBTY29yZTogJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJywgJ2NlbnRlcicsICczNnB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byByZXR1cm4gdG8gVGl0bGVcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODAsICd3aGl0ZScsICdjZW50ZXInLCAnMjRweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgIH1cclxuXHJcbiAgICBkcmF3VGV4dCh0ZXh0OiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBhbGlnbjogQ2FudmFzVGV4dEFsaWduID0gJ2xlZnQnLCBmb250OiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gZm9udDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBhbGlnbjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQoc291bmROYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5zb3VuZHMuZ2V0KHNvdW5kTmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7IC8vIENsb25lIGZvciBjb25jdXJyZW50IHBsYXliYWNrXHJcbiAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgU291bmQgcGxheWJhY2sgZmFpbGVkOiAke3NvdW5kTmFtZX1gLCBlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtzb3VuZE5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0YXJ0TXVzaWMoc291bmROYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zdG9wTXVzaWMoKTsgLy8gU3RvcCBhbnkgZXhpc3RpbmcgbXVzaWNcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChzb3VuZE5hbWUpO1xyXG4gICAgICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljID0gYXVkaW87IC8vIFVzZSB0aGUgb3JpZ2luYWwgQXVkaW8gZWxlbWVudCBmb3IgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgTXVzaWMgcGxheWJhY2sgZmFpbGVkOiAke3NvdW5kTmFtZX1gLCBlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBNdXNpYyAnJHtzb3VuZE5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0b3BNdXNpYygpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5tdXNpYykge1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMubXVzaWMuY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdsb2JhbCBzY29wZSB0byBlbnN1cmUgaXQncyBhY2Nlc3NpYmxlIGJ5IEhUTUxcclxuZGVjbGFyZSBnbG9iYWwge1xyXG4gICAgaW50ZXJmYWNlIFdpbmRvdyB7XHJcbiAgICAgICAgZ2FtZTogR2FtZTtcclxuICAgIH1cclxufVxyXG5cclxud2luZG93Lm9ubG9hZCA9ICgpID0+IHtcclxuICAgIC8vIFJlbW92ZWQgY3VzdG9tIGZvbnQgbG9hZGluZyB0byBjb21wbHkgd2l0aCB0aGUgXCJiYXNpYyBmb250XCIgcmVxdWlyZW1lbnQuXHJcbiAgICAvLyBVc2luZyBhIGRlZmF1bHQgd2ViLXNhZmUgZm9udCBsaWtlIEFyaWFsLCBzYW5zLXNlcmlmLlxyXG4gICAgd2luZG93LmdhbWUgPSBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgd2luZG93LmdhbWUuc3RhcnQoKTtcclxufTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBeUZBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLFdBQUEsYUFBVTtBQUNWLEVBQUFBLFdBQUEsV0FBUTtBQUNSLEVBQUFBLFdBQUEsa0JBQWU7QUFDZixFQUFBQSxXQUFBLGFBQVU7QUFDVixFQUFBQSxXQUFBLGVBQVk7QUFMWCxTQUFBQTtBQUFBLEdBQUE7QUFRTCxNQUFNLFdBQVc7QUFBQTtBQUFBLEVBU2IsWUFBWSxHQUFXLEdBQVcsT0FBZSxRQUFnQixXQUFtQjtBQUhwRiw2QkFBNkI7QUFDN0IsaUJBQWlDO0FBRzdCLFNBQUssSUFBSTtBQUNU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
