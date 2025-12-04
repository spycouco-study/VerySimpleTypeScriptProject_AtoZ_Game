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
    this.ctx.font = "24px Arial";
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
    this.drawText(`Score: ${this.score}`, 10, 30, "white", "left", '24px "Press Start 2P"');
    this.drawText(`Health: ${this.player?.health || 0}`, 10, 60, "white", "left", '24px "Press Start 2P"');
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
    this.drawText(this.data.gameSettings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2 - 50, "white", "center", '48px "Press Start 2P"');
    this.drawText("Press ENTER to Start", this.canvas.width / 2, this.canvas.height / 2 + 50, "white", "center", '24px "Press Start 2P"');
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
    this.drawText("\uC870\uC791\uBC95", this.canvas.width / 2, 100, "white", "center", '40px "Press Start 2P"');
    this.data.gameSettings.instructionsText.forEach((line, index) => {
      this.drawText(line, this.canvas.width / 2, 180 + index * 40, "white", "center", '20px "Press Start 2P"');
    });
    this.drawText("Press ENTER to Play", this.canvas.width / 2, this.canvas.height - 100, "white", "center", '24px "Press Start 2P"');
  }
  renderGameOverScreen() {
    if (!this.data) return;
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawText(this.data.gameSettings.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 80, "red", "center", '60px "Press Start 2P"');
    this.drawText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2, "white", "center", '36px "Press Start 2P"');
    this.drawText("Press ENTER to return to Title", this.canvas.width / 2, this.canvas.height / 2 + 80, "white", "center", '24px "Press Start 2P"');
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
  const font = new FontFace("Press Start 2P", 'local("Press Start 2P"), url("https://fonts.gstatic.com/s/pressstart2p/v15/PFBpLAmMjDMHQgF9gQQEqalD_F8p_G-cT_g_Kx0xYw.woff2") format("woff2")');
  font.load().then(() => {
    document.fonts.add(font);
    window.game = new Game("gameCanvas");
    window.game.start();
  }).catch((e) => {
    console.warn("Failed to load custom font 'Press Start 2P', falling back to system fonts.", e);
    window.game = new Game("gameCanvas");
    window.game.start();
  });
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHt9OyAvLyBNYWtlIHRoaXMgZmlsZSBhIG1vZHVsZSB0byBhbGxvdyBnbG9iYWwgYXVnbWVudGF0aW9uXHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVNldHRpbmdzIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICBwbGF5ZXJJbml0aWFsSGVhbHRoOiBudW1iZXI7XHJcbiAgICBleHBsb3Npb25EdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0OiBzdHJpbmdbXTtcclxuICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgbG9hZGluZ1RleHQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFBsYXllckNvbmZpZyB7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7IC8vIGJ1bGxldHMgcGVyIHNlY29uZFxyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgaGl0U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEVuZW15Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyO1xyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgbW92ZW1lbnRQYXR0ZXJuOiBcInN0cmFpZ2h0XCIgfCBcInNpbmVcIiB8IFwiZGlhZ29uYWxcIjtcclxuICAgIHNob290U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEJ1bGxldENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgc291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsU3Bhd25FdmVudCB7XHJcbiAgICB0aW1lOiBudW1iZXI7IC8vIHJlbGF0aXZlIHRvIGxldmVsIHN0YXJ0LCBpbiBzZWNvbmRzXHJcbiAgICBlbmVteU5hbWU6IHN0cmluZztcclxuICAgIHN0YXJ0WDogXCJyaWdodEVkZ2VcIiB8IG51bWJlcjsgLy8geCBwb3NpdGlvbiwgb3Iga2V5d29yZFxyXG4gICAgc3RhcnRZOiBcInJhbmRvbVwiIHwgXCJ0b3BcIiB8IFwiYm90dG9tXCIgfCBudW1iZXI7IC8vIHkgcG9zaXRpb24sIG9yIGtleXdvcmRcclxuICAgIGNvdW50PzogbnVtYmVyOyAvLyBmb3Igd2F2ZXNcclxuICAgIGludGVydmFsPzogbnVtYmVyOyAvLyBmb3Igd2F2ZXMgKHNlY29uZHMpXHJcbiAgICBfc3Bhd25lZD86IGJvb2xlYW47IC8vIEludGVybmFsIGZsYWcgdG8gdHJhY2sgaWYgdGhpcyBldmVudCBoYXMgYmVlbiB0cmlnZ2VyZWRcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsQ29uZmlnIHtcclxuICAgIGR1cmF0aW9uOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgIHNwYXduRXZlbnRzOiBMZXZlbFNwYXduRXZlbnRbXTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgcGxheWVyOiBQbGF5ZXJDb25maWc7XHJcbiAgICBlbmVteVR5cGVzOiBFbmVteUNvbmZpZ1tdO1xyXG4gICAgYnVsbGV0VHlwZXM6IEJ1bGxldENvbmZpZ1tdO1xyXG4gICAgbGV2ZWxzOiBMZXZlbENvbmZpZ1tdO1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJbWFnZUFzc2V0W107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZEFzc2V0W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HID0gXCJMT0FESU5HXCIsXHJcbiAgICBUSVRMRSA9IFwiVElUTEVcIixcclxuICAgIElOU1RSVUNUSU9OUyA9IFwiSU5TVFJVQ1RJT05TXCIsXHJcbiAgICBQTEFZSU5HID0gXCJQTEFZSU5HXCIsXHJcbiAgICBHQU1FX09WRVIgPSBcIkdBTUVfT1ZFUlwiLFxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG4gICAgbWFya2VkRm9yRGVsZXRpb246IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlZCByZWZlcmVuY2UgdG8gdGhlIGxvYWRlZCBpbWFnZVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gaW1hZ2VOYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5pbWFnZSA9IGdhbWUuaW1hZ2VzLmdldCh0aGlzLmltYWdlTmFtZSkgfHwgbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAncmVkJzsgLy8gRmFsbGJhY2tcclxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7fVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gYnVsbGV0cyBwZXIgc2Vjb25kXHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBsYXN0U2hvdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBpbnZpbmNpYmxlVGltZXI6IG51bWJlciA9IDA7IC8vIGZvciBicmllZiBpbnZpbmNpYmlsaXR5IGFmdGVyIGhpdFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyQ29uZmlnID0gZ2FtZS5kYXRhIS5wbGF5ZXI7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgcGxheWVyQ29uZmlnLndpZHRoLCBwbGF5ZXJDb25maWcuaGVpZ2h0LCBwbGF5ZXJDb25maWcuaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MucGxheWVySW5pdGlhbEhlYWx0aDtcclxuICAgICAgICB0aGlzLm1heEhlYWx0aCA9IHRoaXMuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBwbGF5ZXJDb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IHBsYXllckNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IHBsYXllckNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmludmluY2libGVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNb3ZlbWVudCBiYXNlZCBvbiBpbnB1dFxyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dVcCcpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlXJykpIHRoaXMueSAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dEb3duJykgfHwgZ2FtZS5pbnB1dC5nZXQoJ0tleVMnKSkgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKGdhbWUuaW5wdXQuZ2V0KCdBcnJvd0xlZnQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5QScpKSB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICBpZiAoZ2FtZS5pbnB1dC5nZXQoJ0Fycm93UmlnaHQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5RCcpKSB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gS2VlcCBwbGF5ZXIgd2l0aGluIGNhbnZhcyBib3VuZHNcclxuICAgICAgICB0aGlzLnggPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLngsIGdhbWUuY2FudmFzLndpZHRoIC0gdGhpcy53aWR0aCkpO1xyXG4gICAgICAgIHRoaXMueSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMueSwgZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpKTtcclxuXHJcbiAgICAgICAgLy8gU2hvb3RpbmdcclxuICAgICAgICBpZiAoKGdhbWUuaW5wdXQuZ2V0KCdTcGFjZScpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlKJykpICYmIChnYW1lLmN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0U2hvdFRpbWUpID4gKDEwMDAgLyB0aGlzLmZpcmVSYXRlKSkge1xyXG4gICAgICAgICAgICBnYW1lLnBsYXllckJ1bGxldHMucHVzaChuZXcgQnVsbGV0KFxyXG4gICAgICAgICAgICAgICAgdGhpcy54ICsgdGhpcy53aWR0aCwgLy8gU3Bhd24gYnVsbGV0IGZyb20gcGxheWVyJ3MgcmlnaHQgZWRnZVxyXG4gICAgICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyIC0gdGhpcy5idWxsZXRUeXBlLmhlaWdodCAvIDIsIC8vIENlbnRlcmVkIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS53aWR0aCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuaW1hZ2UsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuc3BlZWQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuZGFtYWdlLFxyXG4gICAgICAgICAgICAgICAgXCJwbGF5ZXJcIlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQodGhpcy5idWxsZXRUeXBlLnNvdW5kKTtcclxuICAgICAgICAgICAgdGhpcy5sYXN0U2hvdFRpbWUgPSBnYW1lLmN1cnJlbnRUaW1lO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGRhbWFnZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5oZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTb3VuZChnYW1lLmRhdGEhLnBsYXllci5oaXRTb3VuZCk7XHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gMTsgLy8gMSBzZWNvbmQgaW52aW5jaWJpbGl0eVxyXG4gICAgICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBnYW1lLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MuZXhwbG9zaW9uRHVyYXRpb24pKTtcclxuICAgICAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQoXCJnYW1lX292ZXJcIik7IC8vIFBsYXkgZ2FtZSBvdmVyIHNvdW5kXHJcbiAgICAgICAgICAgICAgICBnYW1lLnNldFN0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmxlVGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIEZsYXNoIGVmZmVjdCBkdXJpbmcgaW52aW5jaWJpbGl0eVxyXG4gICAgICAgICAgICBpZiAoTWF0aC5mbG9vcih0aGlzLmludmluY2libGVUaW1lciAqIDEwKSAlIDIgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHN1cGVyLmRyYXcoY3R4LCBnYW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHN1cGVyLmRyYXcoY3R4LCBnYW1lKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEJ1bGxldCBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgdHlwZTogXCJwbGF5ZXJcIiB8IFwiZW5lbXlcIjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlTmFtZTogc3RyaW5nLCBzcGVlZDogbnVtYmVyLCBkYW1hZ2U6IG51bWJlciwgdHlwZTogXCJwbGF5ZXJcIiB8IFwiZW5lbXlcIikge1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGltYWdlTmFtZSk7XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IHNwZWVkO1xyXG4gICAgICAgIHRoaXMuZGFtYWdlID0gZGFtYWdlO1xyXG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMudHlwZSA9PT0gXCJwbGF5ZXJcIikge1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9IGVsc2UgeyAvLyBlbmVteSBidWxsZXRcclxuICAgICAgICAgICAgdGhpcy54IC09IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNYXJrIGZvciBkZWxldGlvbiBpZiBvZmYgc2NyZWVuXHJcbiAgICAgICAgaWYgKHRoaXMueCA+IGdhbWUuY2FudmFzLndpZHRoIHx8IHRoaXMueCArIHRoaXMud2lkdGggPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRW5lbXkgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7XHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBtb3ZlbWVudFBhdHRlcm46IFwic3RyYWlnaHRcIiB8IFwic2luZVwiIHwgXCJkaWFnb25hbFwiO1xyXG4gICAgbGFzdFNob3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgaW5pdGlhbFk6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSBvciBkaWFnb25hbCBwYXR0ZXJuc1xyXG4gICAgc2luZVdhdmVPZmZzZXQ6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSB0byBtYWtlIGVhY2ggZW5lbXkncyBwYXR0ZXJuIHVuaXF1ZVxyXG4gICAgdmVydGljYWxEaXJlY3Rpb246IDEgfCAtMSA9IDE7IC8vIEZvciBkaWFnb25hbCBtb3ZlbWVudDogMSBmb3IgZG93biwgLTEgZm9yIHVwXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbmZpZzogRW5lbXlDb25maWcsIGdhbWU6IEdhbWUpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCBjb25maWcud2lkdGgsIGNvbmZpZy5oZWlnaHQsIGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBjb25maWcuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IGNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBjb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IGNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IGNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICAgICAgdGhpcy5tb3ZlbWVudFBhdHRlcm4gPSBjb25maWcubW92ZW1lbnRQYXR0ZXJuO1xyXG4gICAgICAgIHRoaXMuaW5pdGlhbFkgPSB5O1xyXG4gICAgICAgIHRoaXMuc2luZVdhdmVPZmZzZXQgPSBNYXRoLnJhbmRvbSgpICogTWF0aC5QSSAqIDI7IC8vIFJhbmRvbSBwaGFzZSBmb3Igc2luZSB3YXZlXHJcbiAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IChNYXRoLnJhbmRvbSgpIDwgMC41KSA/IDEgOiAtMTsgLy8gUmFuZG9tIGluaXRpYWwgZGlyZWN0aW9uIGZvciBkaWFnb25hbFxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIC8vIEhvcml6b250YWwgbW92ZW1lbnRcclxuICAgICAgICB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gVmVydGljYWwgbW92ZW1lbnQgYmFzZWQgb24gcGF0dGVyblxyXG4gICAgICAgIGlmICh0aGlzLm1vdmVtZW50UGF0dGVybiA9PT0gXCJzaW5lXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgYW1wbGl0dWRlID0gNTA7IC8vIEhvdyBmYXIgdXAvZG93biBpdCBtb3Zlc1xyXG4gICAgICAgICAgICBjb25zdCBmcmVxdWVuY3kgPSAyOyAvLyBIb3cgZmFzdCBpdCB3aWdnbGVzXHJcbiAgICAgICAgICAgIHRoaXMueSA9IHRoaXMuaW5pdGlhbFkgKyBNYXRoLnNpbihnYW1lLmN1cnJlbnRUaW1lICogMC4wMDEgKiBmcmVxdWVuY3kgKyB0aGlzLnNpbmVXYXZlT2Zmc2V0KSAqIGFtcGxpdHVkZTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMubW92ZW1lbnRQYXR0ZXJuID09PSBcImRpYWdvbmFsXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhZ29uYWxTcGVlZCA9IHRoaXMuc3BlZWQgKiAwLjc7IC8vIFNsb3dlciB2ZXJ0aWNhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICB0aGlzLnkgKz0gdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiAqIGRpYWdvbmFsU3BlZWQgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBSZXZlcnNlIGRpcmVjdGlvbiBpZiBoaXR0aW5nIHRvcCBvciBib3R0b20gZWRnZXNcclxuICAgICAgICAgICAgaWYgKHRoaXMueSA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnkgPSAwO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IDE7IC8vIE1vdmUgZG93blxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMueSA+PSBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy55ID0gZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRpY2FsRGlyZWN0aW9uID0gLTE7IC8vIE1vdmUgdXBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGFtcCBZIHRvIHN0YXkgb24gc2NyZWVuIChvbmx5IG5lZWRlZCBpZiBtb3ZlbWVudCBwYXR0ZXJuIGRvZXNuJ3QgaGFuZGxlIGl0LCBlLmcuLCAnc3RyYWlnaHQnKVxyXG4gICAgICAgIC8vIEZvciAnc2luZScgYW5kICdkaWFnb25hbCcsIHRoZWlyIGxvZ2ljIHVzdWFsbHkgaW1wbGljaXRseSBrZWVwcyBpdCB3aXRoaW4gYm91bmRzIG9yXHJcbiAgICAgICAgLy8gdGhlIGJvdW5jZSBsb2dpYyBhZGp1c3RzIGl0LiBLZWVwaW5nIGl0IGFzIGEgZ2VuZXJhbCBmYWxsYmFjaywgdGhvdWdoIGxlc3MgY3JpdGljYWwgZm9yIHVwZGF0ZWQgZGlhZ29uYWwuXHJcbiAgICAgICAgdGhpcy55ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy55LCBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkpO1xyXG5cclxuXHJcbiAgICAgICAgLy8gU2hvb3RpbmdcclxuICAgICAgICBpZiAodGhpcy5maXJlUmF0ZSA+IDAgJiYgKGdhbWUuY3VycmVudFRpbWUgLSB0aGlzLmxhc3RTaG90VGltZSkgPiAoMTAwMCAvIHRoaXMuZmlyZVJhdGUpKSB7XHJcbiAgICAgICAgICAgIGdhbWUuZW5lbXlCdWxsZXRzLnB1c2gobmV3IEJ1bGxldChcclxuICAgICAgICAgICAgICAgIHRoaXMueCAtIHRoaXMuYnVsbGV0VHlwZS53aWR0aCwgLy8gU3Bhd24gYnVsbGV0IGZyb20gZW5lbXkncyBsZWZ0IGVkZ2VcclxuICAgICAgICAgICAgICAgIHRoaXMueSArIHRoaXMuaGVpZ2h0IC8gMiAtIHRoaXMuYnVsbGV0VHlwZS5oZWlnaHQgLyAyLCAvLyBDZW50ZXJlZCB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUud2lkdGgsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmltYWdlLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLnNwZWVkLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmRhbWFnZSxcclxuICAgICAgICAgICAgICAgIFwiZW5lbXlcIlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQodGhpcy5idWxsZXRUeXBlLnNvdW5kKTtcclxuICAgICAgICAgICAgdGhpcy5sYXN0U2hvdFRpbWUgPSBnYW1lLmN1cnJlbnRUaW1lO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTWFyayBmb3IgZGVsZXRpb24gaWYgb2ZmIHNjcmVlblxyXG4gICAgICAgIGlmICh0aGlzLnggKyB0aGlzLndpZHRoIDwgMCkge1xyXG4gICAgICAgICAgICB0aGlzLm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShkYW1hZ2U6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoIC09IGRhbWFnZTtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgZ2FtZS5zY29yZSArPSB0aGlzLnNjb3JlVmFsdWU7XHJcbiAgICAgICAgICAgIGdhbWUuZXhwbG9zaW9ucy5wdXNoKG5ldyBFeHBsb3Npb24odGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0LCBnYW1lLmRhdGEhLmdhbWVTZXR0aW5ncy5leHBsb3Npb25EdXJhdGlvbikpO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTb3VuZChcImV4cGxvc2lvblwiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEV4cGxvc2lvbiBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgdGltZXI6IG51bWJlcjtcclxuICAgIGR1cmF0aW9uOiBudW1iZXI7IC8vIGluIHNlY29uZHNcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGR1cmF0aW9uOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBcImV4cGxvc2lvblwiKTsgLy8gQXNzdW1pbmcgXCJleHBsb3Npb25cIiBpcyB0aGUgaW1hZ2UgbmFtZVxyXG4gICAgICAgIHRoaXMuZHVyYXRpb24gPSBkdXJhdGlvbjtcclxuICAgICAgICB0aGlzLnRpbWVyID0gZHVyYXRpb247XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy50aW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRoaXMudGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEJhY2tncm91bmQge1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICB4MTogbnVtYmVyID0gMDtcclxuICAgIHgyOiBudW1iZXIgPSAwOyAvLyBmb3IgY29udGludW91cyBzY3JvbGxpbmdcclxuICAgIGdhbWVXaWR0aDogbnVtYmVyO1xyXG4gICAgZ2FtZUhlaWdodDogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGltYWdlTmFtZTogc3RyaW5nLCBzY3JvbGxTcGVlZDogbnVtYmVyLCBnYW1lV2lkdGg6IG51bWJlciwgZ2FtZUhlaWdodDogbnVtYmVyLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IGdhbWUuaW1hZ2VzLmdldChpbWFnZU5hbWUpIHx8IG51bGw7XHJcbiAgICAgICAgdGhpcy5zY3JvbGxTcGVlZCA9IHNjcm9sbFNwZWVkO1xyXG4gICAgICAgIHRoaXMuZ2FtZVdpZHRoID0gZ2FtZVdpZHRoO1xyXG4gICAgICAgIHRoaXMuZ2FtZUhlaWdodCA9IGdhbWVIZWlnaHQ7XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgLy8gSW5pdGlhbGl6ZSBwb3NpdGlvbnMgZm9yIHR3byB0aWxlcyB0byBjb3ZlciB0aGUgc2NyZWVuIGFuZCBiZXlvbmRcclxuICAgICAgICAgICAgdGhpcy54MSA9IDA7XHJcbiAgICAgICAgICAgIC8vIEVuc3VyZSB4MiBzdGFydHMgd2hlcmUgeDEgZW5kcywgaGFuZGxpbmcgcG90ZW50aWFsIGltYWdlIHdpZHRoIGRpZmZlcmVuY2VzXHJcbiAgICAgICAgICAgIC8vIFRoZSBpbWFnZSBtaWdodCBub3QgYmUgZXhhY3RseSBjYW52YXMgd2lkdGgsIHNvIHdlIHRpbGUgaXQgYmFzZWQgb24gaXRzIG93biB3aWR0aC5cclxuICAgICAgICAgICAgdGhpcy54MiA9IHRoaXMuaW1hZ2Uud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5pbWFnZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBzY3JvbGxBbW91bnQgPSB0aGlzLnNjcm9sbFNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIHRoaXMueDEgLT0gc2Nyb2xsQW1vdW50O1xyXG4gICAgICAgIHRoaXMueDIgLT0gc2Nyb2xsQW1vdW50O1xyXG5cclxuICAgICAgICAvLyBJZiBhbiBpbWFnZSB0aWxlIG1vdmVzIGNvbXBsZXRlbHkgb2ZmLXNjcmVlbiB0byB0aGUgbGVmdCwgcmVzZXQgaXQgdG8gdGhlIHJpZ2h0XHJcbiAgICAgICAgaWYgKHRoaXMueDEgPD0gLXRoaXMuaW1hZ2Uud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54MSA9IHRoaXMueDIgKyB0aGlzLmltYWdlLndpZHRoO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy54MiA8PSAtdGhpcy5pbWFnZS53aWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLngyID0gdGhpcy54MSArIHRoaXMuaW1hZ2Uud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5pbWFnZSkge1xyXG4gICAgICAgICAgICAvLyBEcmF3IGJvdGggYmFja2dyb3VuZCB0aWxlcywgc2NhbGVkIHRvIGNhbnZhcyBoZWlnaHRcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngxLCAwLCB0aGlzLmltYWdlLndpZHRoLCB0aGlzLmdhbWVIZWlnaHQpO1xyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueDIsIDAsIHRoaXMuaW1hZ2Uud2lkdGgsIHRoaXMuZ2FtZUhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBkYXRhOiBHYW1lRGF0YSB8IG51bGwgPSBudWxsO1xyXG4gICAgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG4gICAgbGFzdEZyYW1lVGltZTogbnVtYmVyID0gMDtcclxuICAgIGN1cnJlbnRUaW1lOiBudW1iZXIgPSAwOyAvLyBUb3RhbCBlbGFwc2VkIHRpbWUgaW4gbWlsbGlzZWNvbmRzXHJcblxyXG4gICAgcGxheWVyOiBQbGF5ZXIgfCBudWxsID0gbnVsbDtcclxuICAgIGVuZW1pZXM6IEVuZW15W10gPSBbXTtcclxuICAgIHBsYXllckJ1bGxldHM6IEJ1bGxldFtdID0gW107XHJcbiAgICBlbmVteUJ1bGxldHM6IEJ1bGxldFtdID0gW107XHJcbiAgICBleHBsb3Npb25zOiBFeHBsb3Npb25bXSA9IFtdO1xyXG4gICAgYmFja2dyb3VuZDogQmFja2dyb3VuZCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgY3VycmVudExldmVsSW5kZXg6IG51bWJlciA9IDA7XHJcbiAgICBsZXZlbFRpbWVyOiBudW1iZXIgPSAwOyAvLyBUaW1lIGVsYXBzZWQgaW4gY3VycmVudCBsZXZlbCAoc2Vjb25kcylcclxuICAgIGFjdGl2ZVNwYXduSW50ZXJ2YWxzOiBTZXQ8bnVtYmVyPiA9IG5ldyBTZXQoKTsgLy8gVG8gY2xlYXIgaW50ZXJ2YWxzIHdoZW4gY2hhbmdpbmcgbGV2ZWxzXHJcblxyXG4gICAgaW5wdXQ6IE1hcDxzdHJpbmcsIGJvb2xlYW4+ID0gbmV3IE1hcCgpO1xyXG4gICAgbXVzaWM6IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICB0aGlzLmluaXRFdmVudExpc3RlbmVycygpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oXCJMb2FkaW5nIEdhbWUgRGF0YS4uLlwiKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgdGhpcy5kYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHRocm93IG5ldyBFcnJvcihcIkZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YS5cIik7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbihcIkxvYWRpbmcgQXNzZXRzLi4uXCIpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFNldCB1cCBiYWNrZ3JvdW5kIGFmdGVyIGxvYWRpbmcgYXNzZXRzXHJcbiAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZCA9IG5ldyBCYWNrZ3JvdW5kKFxyXG4gICAgICAgICAgICAgICAgXCJiYWNrZ3JvdW5kXCIsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnNjcm9sbFNwZWVkLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGgsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICB0aGlzXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLlRJVExFKTtcclxuICAgICAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc3RhcnQgZ2FtZTpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKGBFcnJvcjogJHtlcnJvcn1gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TG9hZGluZ1NjcmVlbihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobWVzc2FnZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuZGF0YS5hc3NldHMuaW1hZ2VzLm1hcChhc3luYyAoYXNzZXQpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChhc3NldC5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcy5tYXAoYXN5bmMgKGFzc2V0KSA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8uc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIC8vIFByZWxvYWQgdG8gZW5zdXJlIGl0J3MgcmVhZHlcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0RXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoWydBcnJvd1VwJywgJ0Fycm93RG93bicsICdBcnJvd0xlZnQnLCAnQXJyb3dSaWdodCcsICdTcGFjZScsICdLZXlXJywgJ0tleUEnLCAnS2V5UycsICdLZXlEJywgJ0tleUonLCAnRW50ZXInXS5pbmNsdWRlcyhlLmNvZGUpKSB7XHJcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgc2Nyb2xsaW5nIGZvciBhcnJvdyBrZXlzL3NwYWNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0LnNldChlLmNvZGUsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGUuY29kZSA9PT0gJ0VudGVyJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlRW50ZXJLZXkoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChbJ0Fycm93VXAnLCAnQXJyb3dEb3duJywgJ0Fycm93TGVmdCcsICdBcnJvd1JpZ2h0JywgJ1NwYWNlJywgJ0tleVcnLCAnS2V5QScsICdLZXlTJywgJ0tleUQnLCAnS2V5SicsICdFbnRlciddLmluY2x1ZGVzKGUuY29kZSkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5wdXQuc2V0KGUuY29kZSwgZmFsc2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVFbnRlcktleSgpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZShHYW1lU3RhdGUuSU5TVFJVQ1RJT05TKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5QTEFZSU5HKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5USVRMRSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzZXRTdGF0ZShuZXdTdGF0ZTogR2FtZVN0YXRlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBuZXdTdGF0ZTtcclxuICAgICAgICBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhcnRNdXNpYyhcImJnbVwiLCB0cnVlKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnN0b3BNdXNpYygpO1xyXG4gICAgICAgICAgICBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICAgICAgLy8gT3B0aW9uYWxseSBwbGF5IHRpdGxlIHNjcmVlbiBzcGVjaWZpYyBtdXNpYyBoZXJlXHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgICAgIC8vIEdhbWUgb3ZlciBzb3VuZCBpcyBwbGF5ZWQgaW4gUGxheWVyLnRha2VEYW1hZ2VcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGVhciBhbnkgYWN0aXZlIHNwYXduIGludGVydmFscyB3aGVuIHN0YXRlIGNoYW5nZXMgZnJvbSBQTEFZSU5HXHJcbiAgICAgICAgaWYgKG5ld1N0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmZvckVhY2goaWQgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmNsZWFyKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGluaXRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCAqIDAuMSxcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIHRoaXMuZGF0YS5wbGF5ZXIuaGVpZ2h0IC8gMixcclxuICAgICAgICAgICAgdGhpc1xyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gW107XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSBbXTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRMZXZlbEluZGV4ID0gMDtcclxuICAgICAgICB0aGlzLmxldmVsVGltZXIgPSAwO1xyXG4gICAgICAgIC8vIFJlc2V0IF9zcGF3bmVkIGZsYWcgZm9yIGFsbCBldmVudHMgaW4gYWxsIGxldmVsc1xyXG4gICAgICAgIHRoaXMuZGF0YS5sZXZlbHMuZm9yRWFjaChsZXZlbCA9PiB7XHJcbiAgICAgICAgICAgIGxldmVsLnNwYXduRXZlbnRzLmZvckVhY2goZXZlbnQgPT4gZXZlbnQuX3NwYXduZWQgPSBmYWxzZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2FtZUxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkge1xyXG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWVzdGFtcCAtIHRoaXMubGFzdEZyYW1lVGltZSkgLyAxMDAwOyAvLyBEZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSB0aW1lc3RhbXA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50VGltZSA9IHRpbWVzdGFtcDsgLy8gVG90YWwgZWxhcHNlZCB0aW1lIGluIG1pbGxpc2Vjb25kc1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5aW5nKGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGVQbGF5aW5nKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllciB8fCAhdGhpcy5kYXRhIHx8ICF0aGlzLmJhY2tncm91bmQpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpO1xyXG5cclxuICAgICAgICAvLyBMZXZlbCBwcm9ncmVzc2lvbiBhbmQgZW5lbXkgc3Bhd25pbmdcclxuICAgICAgICB0aGlzLmxldmVsVGltZXIgKz0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRMZXZlbENvbmZpZyA9IHRoaXMuZGF0YS5sZXZlbHNbdGhpcy5jdXJyZW50TGV2ZWxJbmRleF07XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50TGV2ZWxDb25maWcpIHtcclxuICAgICAgICAgICAgY3VycmVudExldmVsQ29uZmlnLnNwYXduRXZlbnRzLmZvckVhY2goZXZlbnQgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LnRpbWUgPD0gdGhpcy5sZXZlbFRpbWVyICYmICFldmVudC5fc3Bhd25lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5jb3VudCAmJiBldmVudC5pbnRlcnZhbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudC5fc3Bhd25lZCA9IHRydWU7IC8vIE1hcmsgYXMgc3Bhd25lZCB0byBwcmV2ZW50IHJlLXRyaWdnZXJpbmcgd2F2ZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgc3Bhd25lZENvdW50ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaW50ZXJ2YWxJZCA9IHNldEludGVydmFsKCgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzcGF3bmVkQ291bnQgPCBldmVudC5jb3VudCEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRW5lbXkoZXZlbnQuZW5lbXlOYW1lLCBldmVudC5zdGFydFgsIGV2ZW50LnN0YXJ0WSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3Bhd25lZENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWxJZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5kZWxldGUoaW50ZXJ2YWxJZCBhcyBudW1iZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9LCBldmVudC5pbnRlcnZhbCAqIDEwMDApOyAvLyBpbnRlcnZhbCBpbiBtaWxsaXNlY29uZHNcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5hZGQoaW50ZXJ2YWxJZCBhcyBudW1iZXIpOyAvLyBTdG9yZSBJRCB0byBjbGVhciBsYXRlclxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNpbmdsZSBlbmVteSBzcGF3blxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRW5lbXkoZXZlbnQuZW5lbXlOYW1lLCBldmVudC5zdGFydFgsIGV2ZW50LnN0YXJ0WSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50Ll9zcGF3bmVkID0gdHJ1ZTsgLy8gTWFyayBhcyBzcGF3bmVkXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIGxldmVsIGR1cmF0aW9uIGlzIG92ZXIsIGFkdmFuY2UgdG8gbmV4dCBsZXZlbCBvciBlbmQgZ2FtZVxyXG4gICAgICAgICAgICBpZiAodGhpcy5sZXZlbFRpbWVyID49IGN1cnJlbnRMZXZlbENvbmZpZy5kdXJhdGlvbikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCsrO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sZXZlbFRpbWVyID0gMDsgLy8gUmVzZXQgdGltZXIgZm9yIHRoZSBuZXcgbGV2ZWxcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBDbGVhciBhbnkgcmVtYWluaW5nIGludGVydmFscyBmb3IgdGhlIGp1c3QtZW5kZWQgbGV2ZWxcclxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuZm9yRWFjaChpZCA9PiBjbGVhckludGVydmFsKGlkKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmNsZWFyKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLmRhdGEubGV2ZWxzW3RoaXMuY3VycmVudExldmVsSW5kZXhdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWxsIGxldmVscyBjb21wbGV0ZWRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVIpOyAvLyBDb3VsZCBiZSAnVklDVE9SWScgc3RhdGVcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIE5vIG1vcmUgbGV2ZWxzLCBwZXJoYXBzIGtlZXAgcHJldmlvdXMgbGV2ZWwncyBzcGF3bnMgb3IganVzdCB3YWl0IGZvciBwbGF5ZXIgdG8gZmluaXNoXHJcbiAgICAgICAgICAgIC8vIEZvciBub3csIGxldCdzIGp1c3QgdHJhbnNpdGlvbiB0byBnYW1lIG92ZXIuXHJcbiAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgYW5kIGZpbHRlciBnYW1lIG9iamVjdHNcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlID0+IGUudXBkYXRlKGRlbHRhVGltZSwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGIgPT4gYi51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChiID0+IGIudXBkYXRlKGRlbHRhVGltZSwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGUgPT4gZS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIENvbGxpc2lvbiBkZXRlY3Rpb25cclxuICAgICAgICB0aGlzLmNoZWNrQ29sbGlzaW9ucygpO1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgbWFya2VkIGZvciBkZWxldGlvblxyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IHRoaXMuZW5lbWllcy5maWx0ZXIoZSA9PiAhZS5tYXJrZWRGb3JEZWxldGlvbik7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzID0gdGhpcy5wbGF5ZXJCdWxsZXRzLmZpbHRlcihiID0+ICFiLm1hcmtlZEZvckRlbGV0aW9uKTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cyA9IHRoaXMuZW5lbXlCdWxsZXRzLmZpbHRlcihiID0+ICFiLm1hcmtlZEZvckRlbGV0aW9uKTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSB0aGlzLmV4cGxvc2lvbnMuZmlsdGVyKGUgPT4gIWUubWFya2VkRm9yRGVsZXRpb24pO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBnYW1lIG92ZXIgY29uZGl0aW9uIChwbGF5ZXIuaGVhbHRoIDw9IDAgaXMgaGFuZGxlZCBpbiBQbGF5ZXIudGFrZURhbWFnZSlcclxuICAgIH1cclxuXHJcbiAgICBzcGF3bkVuZW15KGVuZW15TmFtZTogc3RyaW5nLCBzdGFydFg6IFwicmlnaHRFZGdlXCIgfCBudW1iZXIsIHN0YXJ0WTogXCJyYW5kb21cIiB8IFwidG9wXCIgfCBcImJvdHRvbVwiIHwgbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICBjb25zdCBlbmVteUNvbmZpZyA9IHRoaXMuZGF0YS5lbmVteVR5cGVzLmZpbmQoZSA9PiBlLm5hbWUgPT09IGVuZW15TmFtZSk7XHJcbiAgICAgICAgaWYgKCFlbmVteUNvbmZpZykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYEVuZW15IHR5cGUgJyR7ZW5lbXlOYW1lfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgYWN0dWFsWCA9IHN0YXJ0WCA9PT0gXCJyaWdodEVkZ2VcIiA/IHRoaXMuY2FudmFzLndpZHRoIDogc3RhcnRYO1xyXG4gICAgICAgIGxldCBhY3R1YWxZOiBudW1iZXI7XHJcblxyXG4gICAgICAgIGlmIChzdGFydFkgPT09IFwicmFuZG9tXCIpIHtcclxuICAgICAgICAgICAgYWN0dWFsWSA9IE1hdGgucmFuZG9tKCkgKiAodGhpcy5jYW52YXMuaGVpZ2h0IC0gZW5lbXlDb25maWcuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0WSA9PT0gXCJ0b3BcIikge1xyXG4gICAgICAgICAgICBhY3R1YWxZID0gMDtcclxuICAgICAgICB9IGVsc2UgaWYgKHN0YXJ0WSA9PT0gXCJib3R0b21cIikge1xyXG4gICAgICAgICAgICBhY3R1YWxZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC0gZW5lbXlDb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGFjdHVhbFkgPSBzdGFydFk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmVuZW1pZXMucHVzaChuZXcgRW5lbXkoYWN0dWFsWCwgYWN0dWFsWSwgZW5lbXlDb25maWcsIHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBjaGVja0NvbGxpc2lvbnMoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllcikgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgYnVsbGV0cyB2cy4gRW5lbWllc1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICghYnVsbGV0Lm1hcmtlZEZvckRlbGV0aW9uICYmICFlbmVteS5tYXJrZWRGb3JEZWxldGlvbiAmJiB0aGlzLmlzQ29sbGlkaW5nKGJ1bGxldCwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkudGFrZURhbWFnZShidWxsZXQuZGFtYWdlLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBidWxsZXQubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRW5lbXkgYnVsbGV0cyB2cy4gUGxheWVyXHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWJ1bGxldC5tYXJrZWRGb3JEZWxldGlvbiAmJiAhdGhpcy5wbGF5ZXIhLm1hcmtlZEZvckRlbGV0aW9uICYmIHRoaXMuaXNDb2xsaWRpbmcoYnVsbGV0LCB0aGlzLnBsYXllciEpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllciEudGFrZURhbWFnZShidWxsZXQuZGFtYWdlLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHZzLiBFbmVtaWVzIChjb250YWN0IGRhbWFnZS9jb2xsaXNpb24pXHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIWVuZW15Lm1hcmtlZEZvckRlbGV0aW9uICYmICF0aGlzLnBsYXllciEubWFya2VkRm9yRGVsZXRpb24gJiYgdGhpcy5pc0NvbGxpZGluZyh0aGlzLnBsYXllciEsIGVuZW15KSkge1xyXG4gICAgICAgICAgICAgICAgLy8gUGxheWVyIHRha2VzIGRhbWFnZSBhbmQgZW5lbXkgaXMgZGVzdHJveWVkXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllciEudGFrZURhbWFnZShlbmVteS5oZWFsdGgsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgZW5lbXkubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbihlbmVteS54LCBlbmVteS55LCBlbmVteS53aWR0aCwgZW5lbXkuaGVpZ2h0LCB0aGlzLmRhdGEhLmdhbWVTZXR0aW5ncy5leHBsb3Npb25EdXJhdGlvbikpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoXCJleHBsb3Npb25cIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpc0NvbGxpZGluZyhvYmoxOiBHYW1lT2JqZWN0LCBvYmoyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIG9iajEueCA8IG9iajIueCArIG9iajIud2lkdGggJiZcclxuICAgICAgICAgICAgb2JqMS54ICsgb2JqMS53aWR0aCA+IG9iajIueCAmJlxyXG4gICAgICAgICAgICBvYmoxLnkgPCBvYmoyLnkgKyBvYmoyLmhlaWdodCAmJlxyXG4gICAgICAgICAgICBvYmoxLnkgKyBvYmoxLmhlaWdodCA+IG9iajIueTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpOyAvLyBDbGVhciBlbnRpcmUgY2FudmFzXHJcblxyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oXCJMb2FkaW5nLi4uXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBbHdheXMgZHJhdyBiYWNrZ3JvdW5kIGlmIGxvYWRlZFxyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZD8uZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJQbGF5aW5nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyBMb2FkaW5nIHNjcmVlbiBhbHJlYWR5IGhhbmRsZWQgYnkgZHJhd0xvYWRpbmdTY3JlZW5cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJQbGF5aW5nKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGUgPT4gZS5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYiA9PiBiLmRyYXcodGhpcy5jdHgsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGIgPT4gYi5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXI/LmRyYXcodGhpcy5jdHgsIHRoaXMpO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGUgPT4gZS5kcmF3KHRoaXMuY3R4LCB0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUlcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBTY29yZTogJHt0aGlzLnNjb3JlfWAsIDEwLCAzMCwgJ3doaXRlJywgJ2xlZnQnLCAnMjRweCBcIlByZXNzIFN0YXJ0IDJQXCInKTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBIZWFsdGg6ICR7dGhpcy5wbGF5ZXI/LmhlYWx0aCB8fCAwfWAsIDEwLCA2MCwgJ3doaXRlJywgJ2xlZnQnLCAnMjRweCBcIlByZXNzIFN0YXJ0IDJQXCInKTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpOyAvLyBBc3N1bWluZyB0aXRsZV9iYWNrZ3JvdW5kIGltYWdlXHJcbiAgICAgICAgaWYgKHRpdGxlSW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRpdGxlSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdkYXJrYmx1ZSc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgJ3doaXRlJywgJ2NlbnRlcicsICc0OHB4IFwiUHJlc3MgU3RhcnQgMlBcIicpO1xyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byBTdGFydFwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJ3doaXRlJywgJ2NlbnRlcicsICcyNHB4IFwiUHJlc3MgU3RhcnQgMlBcIicpO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckluc3RydWN0aW9uc1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlmICh0aXRsZUltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZSh0aXRsZUltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZGFya2JsdWUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dChcIlx1Qzg3MFx1Qzc5MVx1QkM5NVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIDEwMCwgJ3doaXRlJywgJ2NlbnRlcicsICc0MHB4IFwiUHJlc3MgU3RhcnQgMlBcIicpO1xyXG4gICAgICAgIHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuaW5zdHJ1Y3Rpb25zVGV4dC5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGxpbmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgMTgwICsgaW5kZXggKiA0MCwgJ3doaXRlJywgJ2NlbnRlcicsICcyMHB4IFwiUHJlc3MgU3RhcnQgMlBcIicpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byBQbGF5XCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMTAwLCAnd2hpdGUnLCAnY2VudGVyJywgJzI0cHggXCJQcmVzcyBTdGFydCAyUFwiJyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyR2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ2FtZU92ZXJUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCwgJ3JlZCcsICdjZW50ZXInLCAnNjBweCBcIlByZXNzIFN0YXJ0IDJQXCInKTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KGBGaW5hbCBTY29yZTogJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgJ3doaXRlJywgJ2NlbnRlcicsICczNnB4IFwiUHJlc3MgU3RhcnQgMlBcIicpO1xyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJQcmVzcyBFTlRFUiB0byByZXR1cm4gdG8gVGl0bGVcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODAsICd3aGl0ZScsICdjZW50ZXInLCAnMjRweCBcIlByZXNzIFN0YXJ0IDJQXCInKTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3VGV4dCh0ZXh0OiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBjb2xvcjogc3RyaW5nLCBhbGlnbjogQ2FudmFzVGV4dEFsaWduID0gJ2xlZnQnLCBmb250OiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gZm9udDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBhbGlnbjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQoc291bmROYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5zb3VuZHMuZ2V0KHNvdW5kTmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7IC8vIENsb25lIGZvciBjb25jdXJyZW50IHBsYXliYWNrXHJcbiAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgU291bmQgcGxheWJhY2sgZmFpbGVkOiAke3NvdW5kTmFtZX1gLCBlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtzb3VuZE5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0YXJ0TXVzaWMoc291bmROYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zdG9wTXVzaWMoKTsgLy8gU3RvcCBhbnkgZXhpc3RpbmcgbXVzaWNcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChzb3VuZE5hbWUpO1xyXG4gICAgICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljID0gYXVkaW87IC8vIFVzZSB0aGUgb3JpZ2luYWwgQXVkaW8gZWxlbWVudCBmb3IgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgTXVzaWMgcGxheWJhY2sgZmFpbGVkOiAke3NvdW5kTmFtZX1gLCBlKSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBNdXNpYyAnJHtzb3VuZE5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0b3BNdXNpYygpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5tdXNpYykge1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMubXVzaWMuY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdsb2JhbCBzY29wZSB0byBlbnN1cmUgaXQncyBhY2Nlc3NpYmxlIGJ5IEhUTUxcclxuZGVjbGFyZSBnbG9iYWwge1xyXG4gICAgaW50ZXJmYWNlIFdpbmRvdyB7XHJcbiAgICAgICAgZ2FtZTogR2FtZTtcclxuICAgIH1cclxufVxyXG5cclxud2luZG93Lm9ubG9hZCA9ICgpID0+IHtcclxuICAgIC8vIEF0dGVtcHQgdG8gbG9hZCBcIlByZXNzIFN0YXJ0IDJQXCIgZm9udCBmb3IgcmV0cm8gZmVlbCwgZmFsbGJhY2sgdG8gQXJpYWwuXHJcbiAgICBjb25zdCBmb250ID0gbmV3IEZvbnRGYWNlKCdQcmVzcyBTdGFydCAyUCcsICdsb2NhbChcIlByZXNzIFN0YXJ0IDJQXCIpLCB1cmwoXCJodHRwczovL2ZvbnRzLmdzdGF0aWMuY29tL3MvcHJlc3NzdGFydDJwL3YxNS9QRkJwTEFtTWpETUhRZ0Y5Z1FRRXFhbERfRjhwX0ctY1RfZ19LeDB4WXcud29mZjJcIikgZm9ybWF0KFwid29mZjJcIiknKTtcclxuICAgIGZvbnQubG9hZCgpLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgIGRvY3VtZW50LmZvbnRzLmFkZChmb250KTtcclxuICAgICAgICB3aW5kb3cuZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICAgICAgd2luZG93LmdhbWUuc3RhcnQoKTtcclxuICAgIH0pLmNhdGNoKGUgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUud2FybihcIkZhaWxlZCB0byBsb2FkIGN1c3RvbSBmb250ICdQcmVzcyBTdGFydCAyUCcsIGZhbGxpbmcgYmFjayB0byBzeXN0ZW0gZm9udHMuXCIsIGUpO1xyXG4gICAgICAgIHdpbmRvdy5nYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgICAgICB3aW5kb3cuZ2FtZS5zdGFydCgpO1xyXG4gICAgfSk7XHJcbn07XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQXlGQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxXQUFBLGFBQVU7QUFDVixFQUFBQSxXQUFBLFdBQVE7QUFDUixFQUFBQSxXQUFBLGtCQUFlO0FBQ2YsRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxlQUFZO0FBTFgsU0FBQUE7QUFBQSxHQUFBO0FBUUwsTUFBTSxXQUFXO0FBQUE7QUFBQSxFQVNiLFlBQVksR0FBVyxHQUFXLE9BQWUsUUFBZ0IsV0FBbUI7QUFIcEYsNkJBQTZCO0FBQzdCLGlCQUFpQztBQUc3QixTQUFLLElBQUk7QUFDVCxTQUFLLElBQUk7QUFDVCxTQUFLLFFBQVE7QUFDYixTQUFLLFNBQVM7QUFDZCxTQUFLLFlBQVk7QUFBQSxFQUNyQjtBQUFBLEVBRUEsS0FBSyxLQUErQixNQUFrQjtBQUNsRCxRQUFJLENBQUMsS0FBSyxPQUFPO0FBQ2IsV0FBSyxRQUFRLEtBQUssT0FBTyxJQUFJLEtBQUssU0FBUyxLQUFLO0FBQUEsSUFDcEQ7QUFDQSxRQUFJLEtBQUssT0FBTztBQUNaLFVBQUksVUFBVSxLQUFLLE9BQU8sS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsSUFDckUsT0FBTztBQUNILFVBQUksWUFBWTtBQUNoQixVQUFJLFNBQVMsS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsSUFDeEQ7QUFBQSxFQUNKO0FBQUEsRUFDQSxPQUFPLFdBQW1CLE1BQWtCO0FBQUEsRUFBQztBQUNqRDtBQUVBLE1BQU0sZUFBZSxXQUFXO0FBQUE7QUFBQSxFQVM1QixZQUFZLEdBQVcsR0FBVyxNQUFZO0FBQzFDLFVBQU0sZUFBZSxLQUFLLEtBQU07QUFDaEMsVUFBTSxHQUFHLEdBQUcsYUFBYSxPQUFPLGFBQWEsUUFBUSxhQUFhLEtBQUs7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
