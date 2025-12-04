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
  // Stored scaled width based on canvas height and aspect ratio
  constructor(imageName, scrollSpeed, gameWidth, gameHeight, game) {
    this.image = null;
    this.x = 0;
    this.scaledWidth = 0;
    this.image = game.images.get(imageName) || null;
    this.scrollSpeed = scrollSpeed;
    this.gameWidth = gameWidth;
    this.gameHeight = gameHeight;
    if (this.image) {
      this.scaledWidth = this.image.width / this.image.height * this.gameHeight;
      if (isNaN(this.scaledWidth) || !isFinite(this.scaledWidth) || this.scaledWidth <= 0) {
        this.scaledWidth = Math.max(1, this.image.width);
        console.warn(`Background image '${imageName}' scaledWidth calculation resulted in invalid value. Using fallback width.`);
      }
      this.x = 0;
    }
  }
  update(deltaTime) {
    if (!this.image || this.scaledWidth <= 0) return;
    this.x -= this.scrollSpeed * deltaTime;
    while (this.x <= -this.scaledWidth) {
      this.x += this.scaledWidth;
    }
  }
  draw(ctx) {
    if (!this.image || this.scaledWidth <= 0) return;
    let currentDrawX = this.x;
    while (currentDrawX < this.gameWidth) {
      ctx.drawImage(this.image, currentDrawX, 0, this.scaledWidth, this.gameHeight);
      currentDrawX += this.scaledWidth;
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
  // Helper to draw an image using 'object-fit: contain' logic, centered (prevents cropping, may leave blank space)
  drawImageContain(ctx, image, canvasWidth, canvasHeight) {
    const imageRatio = image.width / image.height;
    const canvasRatio = canvasWidth / canvasHeight;
    let drawWidth;
    let drawHeight;
    if (imageRatio > canvasRatio) {
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imageRatio;
    } else {
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imageRatio;
    }
    const drawX = (canvasWidth - drawWidth) / 2;
    const drawY = (canvasHeight - drawHeight) / 2;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }
  // Helper to draw an image using 'object-fit: cover' logic (fills the canvas, may crop image edges)
  drawImageCover(ctx, image, canvasWidth, canvasHeight) {
    const imageRatio = image.width / image.height;
    const canvasRatio = canvasWidth / canvasHeight;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.width;
    let sourceHeight = image.height;
    let destX = 0;
    let destY = 0;
    let destWidth = canvasWidth;
    let destHeight = canvasHeight;
    if (imageRatio > canvasRatio) {
      sourceWidth = image.height * canvasRatio;
      sourceX = (image.width - sourceWidth) / 2;
    } else {
      sourceHeight = image.width / canvasRatio;
      sourceY = (image.height - sourceHeight) / 2;
    }
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);
  }
  renderTitleScreen() {
    if (!this.data) return;
    const titleImage = this.images.get("title_background");
    if (titleImage) {
      this.drawImageCover(this.ctx, titleImage, this.canvas.width, this.canvas.height);
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
      this.drawImageCover(this.ctx, titleImage, this.canvas.width, this.canvas.height);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IHt9OyAvLyBNYWtlIHRoaXMgZmlsZSBhIG1vZHVsZSB0byBhbGxvdyBnbG9iYWwgYXVnbWVudGF0aW9uXHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVNldHRpbmdzIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICBwbGF5ZXJJbml0aWFsSGVhbHRoOiBudW1iZXI7XHJcbiAgICBleHBsb3Npb25EdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0OiBzdHJpbmdbXTtcclxuICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgbG9hZGluZ1RleHQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFBsYXllckNvbmZpZyB7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7IC8vIGJ1bGxldHMgcGVyIHNlY29uZFxyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgaGl0U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEVuZW15Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyO1xyXG4gICAgYnVsbGV0VHlwZTogc3RyaW5nO1xyXG4gICAgbW92ZW1lbnRQYXR0ZXJuOiBcInN0cmFpZ2h0XCIgfCBcInNpbmVcIiB8IFwiZGlhZ29uYWxcIjtcclxuICAgIHNob290U291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEJ1bGxldENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgc291bmQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsU3Bhd25FdmVudCB7XHJcbiAgICB0aW1lOiBudW1iZXI7IC8vIHJlbGF0aXZlIHRvIGxldmVsIHN0YXJ0LCBpbiBzZWNvbmRzXHJcbiAgICBlbmVteU5hbWU6IHN0cmluZztcclxuICAgIHN0YXJ0WDogXCJyaWdodEVkZ2VcIiB8IG51bWJlcjsgLy8geCBwb3NpdGlvbiwgb3Iga2V5d29yZFxyXG4gICAgc3RhcnRZOiBcInJhbmRvbVwiIHwgXCJ0b3BcIiB8IFwiYm90dG9tXCIgfCBudW1iZXI7IC8vIHkgcG9zaXRpb24sIG9yIGtleXdvcmRcclxuICAgIGNvdW50PzogbnVtYmVyOyAvLyBmb3Igd2F2ZXNcclxuICAgIGludGVydmFsPzogbnVtYmVyOyAvLyBmb3Igd2F2ZXMgKHNlY29uZHMpXHJcbiAgICBfc3Bhd25lZD86IGJvb2xlYW47IC8vIEludGVybmFsIGZsYWcgdG8gdHJhY2sgaWYgdGhpcyBldmVudCBoYXMgYmVlbiB0cmlnZ2VyZWRcclxufVxyXG5cclxuaW50ZXJmYWNlIExldmVsQ29uZmlnIHtcclxuICAgIGR1cmF0aW9uOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgIHNwYXduRXZlbnRzOiBMZXZlbFNwYXduRXZlbnRbXTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgcGxheWVyOiBQbGF5ZXJDb25maWc7XHJcbiAgICBlbmVteVR5cGVzOiBFbmVteUNvbmZpZ1tdO1xyXG4gICAgYnVsbGV0VHlwZXM6IEJ1bGxldENvbmZpZ1tdO1xyXG4gICAgbGV2ZWxzOiBMZXZlbENvbmZpZ1tdO1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJbWFnZUFzc2V0W107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZEFzc2V0W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HID0gXCJMT0FESU5HXCIsXHJcbiAgICBUSVRMRSA9IFwiVElUTEVcIixcclxuICAgIElOU1RSVUNUSU9OUyA9IFwiSU5TVFJVQ1RJT05TXCIsXHJcbiAgICBQTEFZSU5HID0gXCJQTEFZSU5HXCIsXHJcbiAgICBHQU1FX09WRVIgPSBcIkdBTUVfT1ZFUlwiLFxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG4gICAgbWFya2VkRm9yRGVsZXRpb246IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbCA9IG51bGw7IC8vIFN0b3JlZCByZWZlcmVuY2UgdG8gdGhlIGxvYWRlZCBpbWFnZVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gaW1hZ2VOYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5pbWFnZSA9IGdhbWUuaW1hZ2VzLmdldCh0aGlzLmltYWdlTmFtZSkgfHwgbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAncmVkJzsgLy8gRmFsbGJhY2tcclxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7fVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gYnVsbGV0cyBwZXIgc2Vjb25kXHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBsYXN0U2hvdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBpbnZpbmNpYmxlVGltZXI6IG51bWJlciA9IDA7IC8vIGZvciBicmllZiBpbnZpbmNpYmlsaXR5IGFmdGVyIGhpdFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyQ29uZmlnID0gZ2FtZS5kYXRhIS5wbGF5ZXI7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgcGxheWVyQ29uZmlnLndpZHRoLCBwbGF5ZXJDb25maWcuaGVpZ2h0LCBwbGF5ZXJDb25maWcuaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MucGxheWVySW5pdGlhbEhlYWx0aDtcclxuICAgICAgICB0aGlzLm1heEhlYWx0aCA9IHRoaXMuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBwbGF5ZXJDb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IHBsYXllckNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IHBsYXllckNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmludmluY2libGVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNb3ZlbWVudCBiYXNlZCBvbiBpbnB1dFxyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dVcCcpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlXJykpIHRoaXMueSAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmIChnYW1lLmlucHV0LmdldCgnQXJyb3dEb3duJykgfHwgZ2FtZS5pbnB1dC5nZXQoJ0tleVMnKSkgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKGdhbWUuaW5wdXQuZ2V0KCdBcnJvd0xlZnQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5QScpKSB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICBpZiAoZ2FtZS5pbnB1dC5nZXQoJ0Fycm93UmlnaHQnKSB8fCBnYW1lLmlucHV0LmdldCgnS2V5RCcpKSB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gS2VlcCBwbGF5ZXIgd2l0aGluIGNhbnZhcyBib3VuZHNcclxuICAgICAgICB0aGlzLnggPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLngsIGdhbWUuY2FudmFzLndpZHRoIC0gdGhpcy53aWR0aCkpO1xyXG4gICAgICAgIHRoaXMueSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMueSwgZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpKTtcclxuXHJcbiAgICAgICAgLy8gU2hvb3RpbmdcclxuICAgICAgICBpZiAoKGdhbWUuaW5wdXQuZ2V0KCdTcGFjZScpIHx8IGdhbWUuaW5wdXQuZ2V0KCdLZXlKJykpICYmIChnYW1lLmN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0U2hvdFRpbWUpID4gKDEwMDAgLyB0aGlzLmZpcmVSYXRlKSkge1xyXG4gICAgICAgICAgICBnYW1lLnBsYXllckJ1bGxldHMucHVzaChuZXcgQnVsbGV0KFxyXG4gICAgICAgICAgICAgICAgdGhpcy54ICsgdGhpcy53aWR0aCwgLy8gU3Bhd24gYnVsbGV0IGZyb20gcGxheWVyJ3MgcmlnaHQgZWRnZVxyXG4gICAgICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyIC0gdGhpcy5idWxsZXRUeXBlLmhlaWdodCAvIDIsIC8vIENlbnRlcmVkIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS53aWR0aCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuaW1hZ2UsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuc3BlZWQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFR5cGUuZGFtYWdlLFxyXG4gICAgICAgICAgICAgICAgXCJwbGF5ZXJcIlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQodGhpcy5idWxsZXRUeXBlLnNvdW5kKTtcclxuICAgICAgICAgICAgdGhpcy5sYXN0U2hvdFRpbWUgPSBnYW1lLmN1cnJlbnRUaW1lO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGRhbWFnZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJsZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5oZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTb3VuZChnYW1lLmRhdGEhLnBsYXllci5oaXRTb3VuZCk7XHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gMTsgLy8gMSBzZWNvbmQgaW52aW5jaWJpbGl0eVxyXG4gICAgICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBnYW1lLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCwgZ2FtZS5kYXRhIS5nYW1lU2V0dGluZ3MuZXhwbG9zaW9uRHVyYXRpb24pKTtcclxuICAgICAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgICAgICAgICAgZ2FtZS5wbGF5U291bmQoXCJnYW1lX292ZXJcIik7IC8vIFBsYXkgZ2FtZSBvdmVyIHNvdW5kXHJcbiAgICAgICAgICAgICAgICBnYW1lLnNldFN0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmxlVGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIEZsYXNoIGVmZmVjdCBkdXJpbmcgaW52aW5jaWJpbGl0eVxyXG4gICAgICAgICAgICBpZiAoTWF0aC5mbG9vcih0aGlzLmludmluY2libGVUaW1lciAqIDEwKSAlIDIgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHN1cGVyLmRyYXcoY3R4LCBnYW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHN1cGVyLmRyYXcoY3R4LCBnYW1lKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEJ1bGxldCBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgdHlwZTogXCJwbGF5ZXJcIiB8IFwiZW5lbXlcIjtcclxuICAgIHZ4OiBudW1iZXI7IC8vIFZlbG9jaXR5IFggY29tcG9uZW50XHJcbiAgICB2eTogbnVtYmVyOyAvLyBWZWxvY2l0eSBZIGNvbXBvbmVudFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcsIHNwZWVkOiBudW1iZXIsIGRhbWFnZTogbnVtYmVyLCB0eXBlOiBcInBsYXllclwiIHwgXCJlbmVteVwiLCBpbml0aWFsVng6IG51bWJlciB8IG51bGwgPSBudWxsLCBpbml0aWFsVnk6IG51bWJlciB8IG51bGwgPSBudWxsKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VOYW1lKTtcclxuICAgICAgICB0aGlzLnNwZWVkID0gc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5kYW1hZ2UgPSBkYW1hZ2U7XHJcbiAgICAgICAgdGhpcy50eXBlID0gdHlwZTtcclxuXHJcbiAgICAgICAgaWYgKHR5cGUgPT09IFwicGxheWVyXCIpIHtcclxuICAgICAgICAgICAgdGhpcy52eCA9IHNwZWVkOyAvLyBQbGF5ZXIgYnVsbGV0cyBhbHdheXMgbW92ZSByaWdodCBhdCAnc3BlZWQnXHJcbiAgICAgICAgICAgIHRoaXMudnkgPSAwO1xyXG4gICAgICAgIH0gZWxzZSB7IC8vIGVuZW15IGJ1bGxldFxyXG4gICAgICAgICAgICAvLyBVc2UgcHJvdmlkZWQgaW5pdGlhbFZ4L1Z5LCBvciBkZWZhdWx0IHRvIHN0cmFpZ2h0IGxlZnQgaWYgbm90IHByb3ZpZGVkXHJcbiAgICAgICAgICAgIHRoaXMudnggPSBpbml0aWFsVnggIT09IG51bGwgPyBpbml0aWFsVnggOiAtc3BlZWQ7XHJcbiAgICAgICAgICAgIHRoaXMudnkgPSBpbml0aWFsVnkgIT09IG51bGwgPyBpbml0aWFsVnkgOiAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICAvLyBCb3RoIHBsYXllciBhbmQgZW5lbXkgYnVsbGV0cyBub3cgdXNlIHZ4IGFuZCB2eSBmb3IgbW92ZW1lbnRcclxuICAgICAgICB0aGlzLnggKz0gdGhpcy52eCAqIGRlbHRhVGltZTtcclxuICAgICAgICB0aGlzLnkgKz0gdGhpcy52eSAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gTWFyayBmb3IgZGVsZXRpb24gaWYgb2ZmIHNjcmVlbiAoY2hlY2tzIGFsbCA0IHNpZGVzKVxyXG4gICAgICAgIGlmICh0aGlzLnggPiBnYW1lLmNhbnZhcy53aWR0aCB8fCB0aGlzLnggKyB0aGlzLndpZHRoIDwgMCB8fCB0aGlzLnkgPiBnYW1lLmNhbnZhcy5oZWlnaHQgfHwgdGhpcy55ICsgdGhpcy5oZWlnaHQgPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRW5lbXkgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7XHJcbiAgICBidWxsZXRUeXBlOiBCdWxsZXRDb25maWc7XHJcbiAgICBtb3ZlbWVudFBhdHRlcm46IFwic3RyYWlnaHRcIiB8IFwic2luZVwiIHwgXCJkaWFnb25hbFwiO1xyXG4gICAgbGFzdFNob3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgaW5pdGlhbFk6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSBvciBkaWFnb25hbCBwYXR0ZXJuc1xyXG4gICAgc2luZVdhdmVPZmZzZXQ6IG51bWJlcjsgLy8gRm9yIHNpbmUgd2F2ZSB0byBtYWtlIGVhY2ggZW5lbXkncyBwYXR0ZXJuIHVuaXF1ZVxyXG4gICAgdmVydGljYWxEaXJlY3Rpb246IDEgfCAtMSA9IDE7IC8vIEZvciBkaWFnb25hbCBtb3ZlbWVudDogMSBmb3IgZG93biwgLTEgZm9yIHVwXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbmZpZzogRW5lbXlDb25maWcsIGdhbWU6IEdhbWUpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCBjb25maWcud2lkdGgsIGNvbmZpZy5oZWlnaHQsIGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBjb25maWcuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IGNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBjb25maWcuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IGNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFR5cGUgPSBnYW1lLmRhdGEhLmJ1bGxldFR5cGVzLmZpbmQoYiA9PiBiLm5hbWUgPT09IGNvbmZpZy5idWxsZXRUeXBlKSE7XHJcbiAgICAgICAgdGhpcy5tb3ZlbWVudFBhdHRlcm4gPSBjb25maWcubW92ZW1lbnRQYXR0ZXJuO1xyXG4gICAgICAgIHRoaXMuaW5pdGlhbFkgPSB5O1xyXG4gICAgICAgIHRoaXMuc2luZVdhdmVPZmZzZXQgPSBNYXRoLnJhbmRvbSgpICogTWF0aC5QSSAqIDI7IC8vIFJhbmRvbSBwaGFzZSBmb3Igc2luZSB3YXZlXHJcbiAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IChNYXRoLnJhbmRvbSgpIDwgMC41KSA/IDEgOiAtMTsgLy8gUmFuZG9tIGluaXRpYWwgZGlyZWN0aW9uIGZvciBkaWFnb25hbFxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xyXG4gICAgICAgIC8vIEhvcml6b250YWwgbW92ZW1lbnRcclxuICAgICAgICB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gVmVydGljYWwgbW92ZW1lbnQgYmFzZWQgb24gcGF0dGVyblxyXG4gICAgICAgIGlmICh0aGlzLm1vdmVtZW50UGF0dGVybiA9PT0gXCJzaW5lXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgYW1wbGl0dWRlID0gNTA7IC8vIEhvdyBmYXIgdXAvZG93biBpdCBtb3Zlc1xyXG4gICAgICAgICAgICBjb25zdCBmcmVxdWVuY3kgPSAyOyAvLyBIb3cgZmFzdCBpdCB3aWdnbGVzXHJcbiAgICAgICAgICAgIHRoaXMueSA9IHRoaXMuaW5pdGlhbFkgKyBNYXRoLnNpbihnYW1lLmN1cnJlbnRUaW1lICogMC4wMDEgKiBmcmVxdWVuY3kgKyB0aGlzLnNpbmVXYXZlT2Zmc2V0KSAqIGFtcGxpdHVkZTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMubW92ZW1lbnRQYXR0ZXJuID09PSBcImRpYWdvbmFsXCIpIHtcclxuICAgICAgICAgICAgY29uc3QgZGlhZ29uYWxTcGVlZCA9IHRoaXMuc3BlZWQgKiAwLjc7IC8vIFNsb3dlciB2ZXJ0aWNhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICB0aGlzLnkgKz0gdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiAqIGRpYWdvbmFsU3BlZWQgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgICAgICAvLyBSZXZlcnNlIGRpcmVjdGlvbiBpZiBoaXR0aW5nIHRvcCBvciBib3R0b20gZWRnZXNcclxuICAgICAgICAgICAgaWYgKHRoaXMueSA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnkgPSAwO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52ZXJ0aWNhbERpcmVjdGlvbiA9IDE7IC8vIE1vdmUgZG93blxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMueSA+PSBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy55ID0gZ2FtZS5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZlcnRpY2FsRGlyZWN0aW9uID0gLTE7IC8vIE1vdmUgdXBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGFtcCBZIHRvIHN0YXkgb24gc2NyZWVuIChvbmx5IG5lZWRlZCBpZiBtb3ZlbWVudCBwYXR0ZXJuIGRvZXNuJ3QgaGFuZGxlIGl0LCBlLmcuLCAnc3RyYWlnaHQnKVxyXG4gICAgICAgIC8vIEZvciAnc2luZScgYW5kICdkaWFnb25hbCcsIHRoZWlyIGxvZ2ljIHVzdWFsbHkgaW1wbGljaXRseSBrZWVwcyBpdCB3aXRoaW4gYm91bmRzIG9yXHJcbiAgICAgICAgLy8gdGhlIGJvdW5jZSBsb2dpYyBhZGp1c3RzIGl0LiBLZWVwaW5nIGl0IGFzIGEgZ2VuZXJhbCBmYWxsYmFjaywgdGhvdWdoIGxlc3MgY3JpdGljYWwgZm9yIHVwZGF0ZWQgZGlhZ29uYWwuXHJcbiAgICAgICAgdGhpcy55ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy55LCBnYW1lLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmhlaWdodCkpO1xyXG5cclxuXHJcbiAgICAgICAgLy8gU2hvb3RpbmdcclxuICAgICAgICBpZiAodGhpcy5maXJlUmF0ZSA+IDAgJiYgKGdhbWUuY3VycmVudFRpbWUgLSB0aGlzLmxhc3RTaG90VGltZSkgPiAoMTAwMCAvIHRoaXMuZmlyZVJhdGUpKSB7XHJcbiAgICAgICAgICAgIGxldCBidWxsZXRWeDogbnVtYmVyID0gMDtcclxuICAgICAgICAgICAgbGV0IGJ1bGxldFZ5OiBudW1iZXIgPSAwO1xyXG5cclxuICAgICAgICAgICAgaWYgKGdhbWUucGxheWVyICYmICFnYW1lLnBsYXllci5tYXJrZWRGb3JEZWxldGlvbikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZW5lbXlDZW50ZXJYID0gdGhpcy54ICsgdGhpcy53aWR0aCAvIDI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlbmVteUNlbnRlclkgPSB0aGlzLnkgKyB0aGlzLmhlaWdodCAvIDI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwbGF5ZXJDZW50ZXJYID0gZ2FtZS5wbGF5ZXIueCArIGdhbWUucGxheWVyLndpZHRoIC8gMjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBsYXllckNlbnRlclkgPSBnYW1lLnBsYXllci55ICsgZ2FtZS5wbGF5ZXIuaGVpZ2h0IC8gMjtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBkeCA9IHBsYXllckNlbnRlclggLSBlbmVteUNlbnRlclg7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkeSA9IHBsYXllckNlbnRlclkgLSBlbmVteUNlbnRlclk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZSA+IDApIHsgLy8gQXZvaWQgZGl2aXNpb24gYnkgemVyb1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgZGlyZWN0aW9uIHZlY3RvciBhbmQgc2NhbGUgYnkgYnVsbGV0IHNwZWVkXHJcbiAgICAgICAgICAgICAgICAgICAgYnVsbGV0VnggPSAoZHggLyBkaXN0YW5jZSkgKiB0aGlzLmJ1bGxldFR5cGUuc3BlZWQ7XHJcbiAgICAgICAgICAgICAgICAgICAgYnVsbGV0VnkgPSAoZHkgLyBkaXN0YW5jZSkgKiB0aGlzLmJ1bGxldFR5cGUuc3BlZWQ7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFBsYXllciBpcyBhdCB0aGUgc2FtZSBzcG90IGFzIGVuZW15LCBzaG9vdCBzdHJhaWdodCBsZWZ0IGFzIGZhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICAgICAgYnVsbGV0VnggPSAtdGhpcy5idWxsZXRUeXBlLnNwZWVkO1xyXG4gICAgICAgICAgICAgICAgICAgIGJ1bGxldFZ5ID0gMDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIE5vIHBsYXllciBvciBwbGF5ZXIgZGVsZXRlZCwgc2hvb3Qgc3RyYWlnaHQgbGVmdCBhcyBmYWxsYmFja1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0VnggPSAtdGhpcy5idWxsZXRUeXBlLnNwZWVkO1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0VnkgPSAwO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBnYW1lLmVuZW15QnVsbGV0cy5wdXNoKG5ldyBCdWxsZXQoXHJcbiAgICAgICAgICAgICAgICB0aGlzLnggLSB0aGlzLmJ1bGxldFR5cGUud2lkdGgsIC8vIFNwYXduIGJ1bGxldCBmcm9tIGVuZW15J3MgbGVmdCBlZGdlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnkgKyB0aGlzLmhlaWdodCAvIDIgLSB0aGlzLmJ1bGxldFR5cGUuaGVpZ2h0IC8gMiwgLy8gQ2VudGVyZWQgdmVydGljYWxseVxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRUeXBlLmhlaWdodCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5pbWFnZSxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5zcGVlZCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0VHlwZS5kYW1hZ2UsXHJcbiAgICAgICAgICAgICAgICBcImVuZW15XCIsXHJcbiAgICAgICAgICAgICAgICBidWxsZXRWeCwgLy8gUGFzcyBjYWxjdWxhdGVkIHZ4XHJcbiAgICAgICAgICAgICAgICBidWxsZXRWeSAgLy8gUGFzcyBjYWxjdWxhdGVkIHZ5XHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTb3VuZCh0aGlzLmJ1bGxldFR5cGUuc291bmQpO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RTaG90VGltZSA9IGdhbWUuY3VycmVudFRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNYXJrIGZvciBkZWxldGlvbiBpZiBvZmYgc2NyZWVuXHJcbiAgICAgICAgaWYgKHRoaXMueCArIHRoaXMud2lkdGggPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGRhbWFnZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgIGlmICh0aGlzLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICBnYW1lLnNjb3JlICs9IHRoaXMuc2NvcmVWYWx1ZTtcclxuICAgICAgICAgICAgZ2FtZS5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbih0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQsIGdhbWUuZGF0YSEuZ2FtZVNldHRpbmdzLmV4cGxvc2lvbkR1cmF0aW9uKSk7XHJcbiAgICAgICAgICAgIGdhbWUucGxheVNvdW5kKFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRXhwbG9zaW9uIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICB0aW1lcjogbnVtYmVyO1xyXG4gICAgZHVyYXRpb246IG51bWJlcjsgLy8gaW4gc2Vjb25kc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZHVyYXRpb246IG51bWJlcikge1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIFwiZXhwbG9zaW9uXCIpOyAvLyBBc3N1bWluZyBcImV4cGxvc2lvblwiIGlzIHRoZSBpbWFnZSBuYW1lXHJcbiAgICAgICAgdGhpcy5kdXJhdGlvbiA9IGR1cmF0aW9uO1xyXG4gICAgICAgIHRoaXMudGltZXIgPSBkdXJhdGlvbjtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICBpZiAodGhpcy50aW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VkRm9yRGVsZXRpb24gPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQmFja2dyb3VuZCB7XHJcbiAgICBpbWFnZTogSFRNTEltYWdlRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG4gICAgc2Nyb2xsU3BlZWQ6IG51bWJlcjtcclxuICAgIHg6IG51bWJlciA9IDA7IC8vIFVzZSBhIHNpbmdsZSB4IGZvciBjb250aW51b3VzIHRpbGluZ1xyXG4gICAgZ2FtZVdpZHRoOiBudW1iZXI7XHJcbiAgICBnYW1lSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBzY2FsZWRXaWR0aDogbnVtYmVyID0gMDsgLy8gU3RvcmVkIHNjYWxlZCB3aWR0aCBiYXNlZCBvbiBjYW52YXMgaGVpZ2h0IGFuZCBhc3BlY3QgcmF0aW9cclxuXHJcbiAgICBjb25zdHJ1Y3RvcihpbWFnZU5hbWU6IHN0cmluZywgc2Nyb2xsU3BlZWQ6IG51bWJlciwgZ2FtZVdpZHRoOiBudW1iZXIsIGdhbWVIZWlnaHQ6IG51bWJlciwgZ2FtZTogR2FtZSkge1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSBnYW1lLmltYWdlcy5nZXQoaW1hZ2VOYW1lKSB8fCBudWxsO1xyXG4gICAgICAgIHRoaXMuc2Nyb2xsU3BlZWQgPSBzY3JvbGxTcGVlZDtcclxuICAgICAgICB0aGlzLmdhbWVXaWR0aCA9IGdhbWVXaWR0aDtcclxuICAgICAgICB0aGlzLmdhbWVIZWlnaHQgPSBnYW1lSGVpZ2h0O1xyXG4gICAgICAgIGlmICh0aGlzLmltYWdlKSB7XHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBzY2FsZWQgd2lkdGggdG8gY292ZXIgZ2FtZUhlaWdodCB3aGlsZSBtYWludGFpbmluZyBhc3BlY3QgcmF0aW9cclxuICAgICAgICAgICAgdGhpcy5zY2FsZWRXaWR0aCA9ICh0aGlzLmltYWdlLndpZHRoIC8gdGhpcy5pbWFnZS5oZWlnaHQpICogdGhpcy5nYW1lSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgLy8gSGFuZGxlIHBvdGVudGlhbCBlZGdlIGNhc2VzIHdoZXJlIHNjYWxlZFdpZHRoIG1pZ2h0IGJlIGludmFsaWQgb3IgemVyb1xyXG4gICAgICAgICAgICBpZiAoaXNOYU4odGhpcy5zY2FsZWRXaWR0aCkgfHwgIWlzRmluaXRlKHRoaXMuc2NhbGVkV2lkdGgpIHx8IHRoaXMuc2NhbGVkV2lkdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zY2FsZWRXaWR0aCA9IE1hdGgubWF4KDEsIHRoaXMuaW1hZ2Uud2lkdGgpOyAvLyBGYWxsYmFjazogdXNlIG9yaWdpbmFsIHdpZHRoLCBlbnN1cmluZyBpdCdzIGF0IGxlYXN0IDFcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgQmFja2dyb3VuZCBpbWFnZSAnJHtpbWFnZU5hbWV9JyBzY2FsZWRXaWR0aCBjYWxjdWxhdGlvbiByZXN1bHRlZCBpbiBpbnZhbGlkIHZhbHVlLiBVc2luZyBmYWxsYmFjayB3aWR0aC5gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnggPSAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaW1hZ2UgfHwgdGhpcy5zY2FsZWRXaWR0aCA8PSAwKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMueCAtPSB0aGlzLnNjcm9sbFNwZWVkICogZGVsdGFUaW1lO1xyXG5cclxuICAgICAgICAvLyBSZXNldCB4IHdoZW4gaXQgbW92ZXMgY29tcGxldGVseSBvZmYtc2NyZWVuIHRvIHRoZSBsZWZ0IHRvIGNyZWF0ZSBhIHNlYW1sZXNzIGxvb3BcclxuICAgICAgICAvLyBFbnN1cmUgdGhpcy54IGlzIGFsd2F5cyBpbiB0aGUgcmFuZ2UgWy1zY2FsZWRXaWR0aCwgMClcclxuICAgICAgICB3aGlsZSAodGhpcy54IDw9IC10aGlzLnNjYWxlZFdpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMueCArPSB0aGlzLnNjYWxlZFdpZHRoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmltYWdlIHx8IHRoaXMuc2NhbGVkV2lkdGggPD0gMCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBTdGFydCBkcmF3aW5nIGZyb20gdGhlIGN1cnJlbnQgeCBwb3NpdGlvblxyXG4gICAgICAgIGxldCBjdXJyZW50RHJhd1ggPSB0aGlzLng7XHJcblxyXG4gICAgICAgIC8vIERyYXcgdGlsZXMgdW50aWwgdGhlIGVudGlyZSBjYW52YXMgd2lkdGggaXMgY292ZXJlZFxyXG4gICAgICAgIC8vIFdlIG5lZWQgdG8gZHJhdyB0aWxlcyB0aGF0IHN0YXJ0IGZyb20gJ2N1cnJlbnREcmF3WCcgYW5kIGdvIHBhc3QgJ2dhbWVXaWR0aCdcclxuICAgICAgICB3aGlsZSAoY3VycmVudERyYXdYIDwgdGhpcy5nYW1lV2lkdGgpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCBjdXJyZW50RHJhd1gsIDAsIHRoaXMuc2NhbGVkV2lkdGgsIHRoaXMuZ2FtZUhlaWdodCk7XHJcbiAgICAgICAgICAgIGN1cnJlbnREcmF3WCArPSB0aGlzLnNjYWxlZFdpZHRoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgZGF0YTogR2FtZURhdGEgfCBudWxsID0gbnVsbDtcclxuICAgIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIGxhc3RGcmFtZVRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBjdXJyZW50VGltZTogbnVtYmVyID0gMDsgLy8gVG90YWwgZWxhcHNlZCB0aW1lIGluIG1pbGxpc2Vjb25kc1xyXG5cclxuICAgIHBsYXllcjogUGxheWVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBlbmVtaWVzOiBFbmVteVtdID0gW107XHJcbiAgICBwbGF5ZXJCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZW5lbXlCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZXhwbG9zaW9uczogRXhwbG9zaW9uW10gPSBbXTtcclxuICAgIGJhY2tncm91bmQ6IEJhY2tncm91bmQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIGN1cnJlbnRMZXZlbEluZGV4OiBudW1iZXIgPSAwO1xyXG4gICAgbGV2ZWxUaW1lcjogbnVtYmVyID0gMDsgLy8gVGltZSBlbGFwc2VkIGluIGN1cnJlbnQgbGV2ZWwgKHNlY29uZHMpXHJcbiAgICBhY3RpdmVTcGF3bkludGVydmFsczogU2V0PG51bWJlcj4gPSBuZXcgU2V0KCk7IC8vIFRvIGNsZWFyIGludGVydmFscyB3aGVuIGNoYW5naW5nIGxldmVsc1xyXG5cclxuICAgIGlucHV0OiBNYXA8c3RyaW5nLCBib29sZWFuPiA9IG5ldyBNYXAoKTtcclxuICAgIG11c2ljOiBIVE1MQXVkaW9FbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgdGhpcy5pbml0RXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKFwiTG9hZGluZyBHYW1lIERhdGEuLi5cIik7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuXHJcbiAgICAgICAgICAgIGlmICghdGhpcy5kYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEuXCIpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oXCJMb2FkaW5nIEFzc2V0cy4uLlwiKTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgdXAgYmFja2dyb3VuZCBhZnRlciBsb2FkaW5nIGFzc2V0c1xyXG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmQgPSBuZXcgQmFja2dyb3VuZChcclxuICAgICAgICAgICAgICAgIFwiYmFja2dyb3VuZFwiLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5zY3JvbGxTcGVlZCxcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgdGhpc1xyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5USVRMRSk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHN0YXJ0IGdhbWU6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbihgRXJyb3I6ICR7ZXJyb3J9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0xvYWRpbmdTY3JlZW4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChtZXNzYWdlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5kYXRhLmFzc2V0cy5pbWFnZXMubWFwKGFzeW5jIChhc3NldCkgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBpbWcuc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZXMuc2V0KGFzc2V0Lm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuZGF0YS5hc3NldHMuc291bmRzLm1hcChhc3luYyAoYXNzZXQpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gYXNzZXQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgLy8gUHJlbG9hZCB0byBlbnN1cmUgaXQncyByZWFkeVxyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoYXNzZXQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGluaXRFdmVudExpc3RlbmVycygpOiB2b2lkIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChbJ0Fycm93VXAnLCAnQXJyb3dEb3duJywgJ0Fycm93TGVmdCcsICdBcnJvd1JpZ2h0JywgJ1NwYWNlJywgJ0tleVcnLCAnS2V5QScsICdLZXlTJywgJ0tleUQnLCAnS2V5SicsICdFbnRlciddLmluY2x1ZGVzKGUuY29kZSkpIHtcclxuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBzY3JvbGxpbmcgZm9yIGFycm93IGtleXMvc3BhY2VcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5wdXQuc2V0KGUuY29kZSwgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZS5jb2RlID09PSAnRW50ZXInKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVFbnRlcktleSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKFsnQXJyb3dVcCcsICdBcnJvd0Rvd24nLCAnQXJyb3dMZWZ0JywgJ0Fycm93UmlnaHQnLCAnU3BhY2UnLCAnS2V5VycsICdLZXlBJywgJ0tleVMnLCAnS2V5RCcsICdLZXlKJywgJ0VudGVyJ10uaW5jbHVkZXMoZS5jb2RlKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pbnB1dC5zZXQoZS5jb2RlLCBmYWxzZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUVudGVyS2V5KCk6IHZvaWQge1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFN0YXRlKEdhbWVTdGF0ZS5JTlNUUlVDVElPTlMpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5pdEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLlBMQVlJTkcpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLlRJVExFKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNldFN0YXRlKG5ld1N0YXRlOiBHYW1lU3RhdGUpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IG5ld1N0YXRlO1xyXG4gICAgICAgIGlmIChuZXdTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFydE11c2ljKFwiYmdtXCIsIHRydWUpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RvcE11c2ljKCk7XHJcbiAgICAgICAgICAgIGlmIChuZXdTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBPcHRpb25hbGx5IHBsYXkgdGl0bGUgc2NyZWVuIHNwZWNpZmljIG11c2ljIGhlcmVcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChuZXdTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICAgICAgLy8gR2FtZSBvdmVyIHNvdW5kIGlzIHBsYXllZCBpbiBQbGF5ZXIudGFrZURhbWFnZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIENsZWFyIGFueSBhY3RpdmUgc3Bhd24gaW50ZXJ2YWxzIHdoZW4gc3RhdGUgY2hhbmdlcyBmcm9tIFBMQVlJTkdcclxuICAgICAgICBpZiAobmV3U3RhdGUgIT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuZm9yRWFjaChpZCA9PiBjbGVhckludGVydmFsKGlkKSk7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuY2xlYXIoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaW5pdEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuICAgICAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIoXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoICogMC4xLFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gdGhpcy5kYXRhLnBsYXllci5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICB0aGlzXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSBbXTtcclxuICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cyA9IFtdO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucyA9IFtdO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuY3VycmVudExldmVsSW5kZXggPSAwO1xyXG4gICAgICAgIHRoaXMubGV2ZWxUaW1lciA9IDA7XHJcbiAgICAgICAgLy8gUmVzZXQgX3NwYXduZWQgZmxhZyBmb3IgYWxsIGV2ZW50cyBpbiBhbGwgbGV2ZWxzXHJcbiAgICAgICAgdGhpcy5kYXRhLmxldmVscy5mb3JFYWNoKGxldmVsID0+IHtcclxuICAgICAgICAgICAgbGV2ZWwuc3Bhd25FdmVudHMuZm9yRWFjaChldmVudCA9PiBldmVudC5fc3Bhd25lZCA9IGZhbHNlKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnYW1lTG9vcCh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSB7XHJcbiAgICAgICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZXN0YW1wIC0gdGhpcy5sYXN0RnJhbWVUaW1lKSAvIDEwMDA7IC8vIERlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IHRpbWVzdGFtcDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRUaW1lID0gdGltZXN0YW1wOyAvLyBUb3RhbCBlbGFwc2VkIHRpbWUgaW4gbWlsbGlzZWNvbmRzXHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLnJlbmRlcigpO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyIHx8ICF0aGlzLmRhdGEgfHwgIXRoaXMuYmFja2dyb3VuZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmJhY2tncm91bmQudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIudXBkYXRlKGRlbHRhVGltZSwgdGhpcyk7XHJcblxyXG4gICAgICAgIC8vIExldmVsIHByb2dyZXNzaW9uIGFuZCBlbmVteSBzcGF3bmluZ1xyXG4gICAgICAgIHRoaXMubGV2ZWxUaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgY29uc3QgY3VycmVudExldmVsQ29uZmlnID0gdGhpcy5kYXRhLmxldmVsc1t0aGlzLmN1cnJlbnRMZXZlbEluZGV4XTtcclxuXHJcbiAgICAgICAgaWYgKGN1cnJlbnRMZXZlbENvbmZpZykge1xyXG4gICAgICAgICAgICBjdXJyZW50TGV2ZWxDb25maWcuc3Bhd25FdmVudHMuZm9yRWFjaChldmVudCA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQudGltZSA8PSB0aGlzLmxldmVsVGltZXIgJiYgIWV2ZW50Ll9zcGF3bmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LmNvdW50ICYmIGV2ZW50LmludGVydmFsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50Ll9zcGF3bmVkID0gdHJ1ZTsgLy8gTWFyayBhcyBzcGF3bmVkIHRvIHByZXZlbnQgcmUtdHJpZ2dlcmluZyB3YXZlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBzcGF3bmVkQ291bnQgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNwYXduZWRDb3VudCA8IGV2ZW50LmNvdW50ISkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25FbmVteShldmVudC5lbmVteU5hbWUsIGV2ZW50LnN0YXJ0WCwgZXZlbnQuc3RhcnRZKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGF3bmVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbElkKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmRlbGV0ZShpbnRlcnZhbElkIGFzIG51bWJlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIGV2ZW50LmludGVydmFsICogMTAwMCk7IC8vIGludGVydmFsIGluIG1pbGxpc2Vjb25kc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZVNwYXduSW50ZXJ2YWxzLmFkZChpbnRlcnZhbElkIGFzIG51bWJlcik7IC8vIFN0b3JlIElEIHRvIGNsZWFyIGxhdGVyXHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU2luZ2xlIGVuZW15IHNwYXduXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25FbmVteShldmVudC5lbmVteU5hbWUsIGV2ZW50LnN0YXJ0WCwgZXZlbnQuc3RhcnRZKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuX3NwYXduZWQgPSB0cnVlOyAvLyBNYXJrIGFzIHNwYXduZWRcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgbGV2ZWwgZHVyYXRpb24gaXMgb3ZlciwgYWR2YW5jZSB0byBuZXh0IGxldmVsIG9yIGVuZCBnYW1lXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmxldmVsVGltZXIgPj0gY3VycmVudExldmVsQ29uZmlnLmR1cmF0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRMZXZlbEluZGV4Kys7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxldmVsVGltZXIgPSAwOyAvLyBSZXNldCB0aW1lciBmb3IgdGhlIG5ldyBsZXZlbFxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENsZWFyIGFueSByZW1haW5pbmcgaW50ZXJ2YWxzIGZvciB0aGUganVzdC1lbmRlZCBsZXZlbFxyXG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVTcGF3bkludGVydmFscy5mb3JFYWNoKGlkID0+IGNsZWFySW50ZXJ2YWwoaWQpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlU3Bhd25JbnRlcnZhbHMuY2xlYXIoKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZGF0YS5sZXZlbHNbdGhpcy5jdXJyZW50TGV2ZWxJbmRleF0pIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBBbGwgbGV2ZWxzIGNvbXBsZXRlZFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0U3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUik7IC8vIENvdWxkIGJlICdWSUNUT1JZJyBzdGF0ZVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gTm8gbW9yZSBsZXZlbHMsIHBlcmhhcHMga2VlcCBwcmV2aW91cyBsZXZlbCdzIHNwYXducyBvciBqdXN0IHdhaXQgZm9yIHBsYXllciB0byBmaW5pc2hcclxuICAgICAgICAgICAgLy8gRm9yIG5vdywgbGV0J3MganVzdCB0cmFuc2l0aW9uIHRvIGdhbWUgb3Zlci5cclxuICAgICAgICAgICAgdGhpcy5zZXRTdGF0ZShHYW1lU3RhdGUuR0FNRV9PVkVSKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBhbmQgZmlsdGVyIGdhbWUgb2JqZWN0c1xyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGUgPT4gZS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYiA9PiBiLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGIgPT4gYi51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5leHBsb3Npb25zLmZvckVhY2goZSA9PiBlLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gQ29sbGlzaW9uIGRldGVjdGlvblxyXG4gICAgICAgIHRoaXMuY2hlY2tDb2xsaXNpb25zKCk7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBtYXJrZWQgZm9yIGRlbGV0aW9uXHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gdGhpcy5lbmVtaWVzLmZpbHRlcihlID0+ICFlLm1hcmtlZEZvckRlbGV0aW9uKTtcclxuICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMgPSB0aGlzLnBsYXllckJ1bGxldHMuZmlsdGVyKGIgPT4gIWIubWFya2VkRm9yRGVsZXRpb24pO1xyXG4gICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzID0gdGhpcy5lbmVteUJ1bGxldHMuZmlsdGVyKGIgPT4gIWIubWFya2VkRm9yRGVsZXRpb24pO1xyXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucyA9IHRoaXMuZXhwbG9zaW9ucy5maWx0ZXIoZSA9PiAhZS5tYXJrZWRGb3JEZWxldGlvbik7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGdhbWUgb3ZlciBjb25kaXRpb24gKHBsYXllci5oZWFsdGggPD0gMCBpcyBoYW5kbGVkIGluIFBsYXllci50YWtlRGFtYWdlKVxyXG4gICAgfVxyXG5cclxuICAgIHNwYXduRW5lbXkoZW5lbXlOYW1lOiBzdHJpbmcsIHN0YXJ0WDogXCJyaWdodEVkZ2VcIiB8IG51bWJlciwgc3RhcnRZOiBcInJhbmRvbVwiIHwgXCJ0b3BcIiB8IFwiYm90dG9tXCIgfCBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGVuZW15Q29uZmlnID0gdGhpcy5kYXRhLmVuZW15VHlwZXMuZmluZChlID0+IGUubmFtZSA9PT0gZW5lbXlOYW1lKTtcclxuICAgICAgICBpZiAoIWVuZW15Q29uZmlnKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgRW5lbXkgdHlwZSAnJHtlbmVteU5hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBhY3R1YWxYID0gc3RhcnRYID09PSBcInJpZ2h0RWRnZVwiID8gdGhpcy5jYW52YXMud2lkdGggOiBzdGFydFg7XHJcbiAgICAgICAgbGV0IGFjdHVhbFk6IG51bWJlcjtcclxuXHJcbiAgICAgICAgaWYgKHN0YXJ0WSA9PT0gXCJyYW5kb21cIikge1xyXG4gICAgICAgICAgICBhY3R1YWxZID0gTWF0aC5yYW5kb20oKSAqICh0aGlzLmNhbnZhcy5oZWlnaHQgLSBlbmVteUNvbmZpZy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhcnRZID09PSBcInRvcFwiKSB7XHJcbiAgICAgICAgICAgIGFjdHVhbFkgPSAwO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoc3RhcnRZID09PSBcImJvdHRvbVwiKSB7XHJcbiAgICAgICAgICAgIGFjdHVhbFkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLSBlbmVteUNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgYWN0dWFsWSA9IHN0YXJ0WTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZW5lbWllcy5wdXNoKG5ldyBFbmVteShhY3R1YWxYLCBhY3R1YWxZLCBlbmVteUNvbmZpZywgdGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIGNoZWNrQ29sbGlzaW9ucygpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBidWxsZXRzIHZzLiBFbmVtaWVzXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IHtcclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFidWxsZXQubWFya2VkRm9yRGVsZXRpb24gJiYgIWVuZW15Lm1hcmtlZEZvckRlbGV0aW9uICYmIHRoaXMuaXNDb2xsaWRpbmcoYnVsbGV0LCBlbmVteSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbmVteS50YWtlRGFtYWdlKGJ1bGxldC5kYW1hZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJ1bGxldC5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBFbmVteSBidWxsZXRzIHZzLiBQbGF5ZXJcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIGlmICghYnVsbGV0Lm1hcmtlZEZvckRlbGV0aW9uICYmICF0aGlzLnBsYXllciEubWFya2VkRm9yRGVsZXRpb24gJiYgdGhpcy5pc0NvbGxpZGluZyhidWxsZXQsIHRoaXMucGxheWVyISkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyIS50YWtlRGFtYWdlKGJ1bGxldC5kYW1hZ2UsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0Lm1hcmtlZEZvckRlbGV0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgdnMuIEVuZW1pZXMgKGNvbnRhY3QgZGFtYWdlL2NvbGxpc2lvbilcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgIGlmICghZW5lbXkubWFya2VkRm9yRGVsZXRpb24gJiYgIXRoaXMucGxheWVyIS5tYXJrZWRGb3JEZWxldGlvbiAmJiB0aGlzLmlzQ29sbGlkaW5nKHRoaXMucGxheWVyISwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBQbGF5ZXIgdGFrZXMgZGFtYWdlIGFuZCBlbmVteSBpcyBkZXN0cm95ZWRcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyIS50YWtlRGFtYWdlKGVuZW15LmhlYWx0aCwgdGhpcyk7XHJcbiAgICAgICAgICAgICAgICBlbmVteS5tYXJrZWRGb3JEZWxldGlvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKGVuZW15LngsIGVuZW15LnksIGVuZW15LndpZHRoLCBlbmVteS5oZWlnaHQsIHRoaXMuZGF0YSEuZ2FtZVNldHRpbmdzLmV4cGxvc2lvbkR1cmF0aW9uKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZChcImV4cGxvc2lvblwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGlzQ29sbGlkaW5nKG9iajE6IEdhbWVPYmplY3QsIG9iajI6IEdhbWVPYmplY3QpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gb2JqMS54IDwgb2JqMi54ICsgb2JqMi53aWR0aCAmJlxyXG4gICAgICAgICAgICBvYmoxLnggKyBvYmoxLndpZHRoID4gb2JqMi54ICYmXHJcbiAgICAgICAgICAgIG9iajEueSA8IG9iajIueSArIG9iajIuaGVpZ2h0ICYmXHJcbiAgICAgICAgICAgIG9iajEueSArIG9iajEuaGVpZ2h0ID4gb2JqMi55O1xyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7IC8vIENsZWFyIGVudGlyZSBjYW52YXNcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHtcclxuICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbihcIkxvYWRpbmcuLi5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFsd2F5cyBkcmF3IGJhY2tncm91bmQgaWYgbG9hZGVkXHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kPy5kcmF3KHRoaXMuY3R4KTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlckluc3RydWN0aW9uc1NjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclBsYXlpbmcoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlckdhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuTE9BRElORzpcclxuICAgICAgICAgICAgICAgIC8vIExvYWRpbmcgc2NyZWVuIGFscmVhZHkgaGFuZGxlZCBieSBkcmF3TG9hZGluZ1NjcmVlblxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlclBsYXlpbmcoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZSA9PiBlLmRyYXcodGhpcy5jdHgsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMuZm9yRWFjaChiID0+IGIuZHJhdyh0aGlzLmN0eCwgdGhpcykpO1xyXG4gICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzLmZvckVhY2goYiA9PiBiLmRyYXcodGhpcy5jdHgsIHRoaXMpKTtcclxuICAgICAgICB0aGlzLnBsYXllcj8uZHJhdyh0aGlzLmN0eCwgdGhpcyk7XHJcbiAgICAgICAgdGhpcy5leHBsb3Npb25zLmZvckVhY2goZSA9PiBlLmRyYXcodGhpcy5jdHgsIHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBVSVxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoYFNjb3JlOiAke3RoaXMuc2NvcmV9YCwgMTAsIDMwLCAnd2hpdGUnLCAnbGVmdCcsICcyNHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoYEhlYWx0aDogJHt0aGlzLnBsYXllcj8uaGVhbHRoIHx8IDB9YCwgMTAsIDYwLCAnd2hpdGUnLCAnbGVmdCcsICcyNHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgfVxyXG5cclxuICAgIC8vIEhlbHBlciB0byBkcmF3IGFuIGltYWdlIHVzaW5nICdvYmplY3QtZml0OiBjb250YWluJyBsb2dpYywgY2VudGVyZWQgKHByZXZlbnRzIGNyb3BwaW5nLCBtYXkgbGVhdmUgYmxhbmsgc3BhY2UpXHJcbiAgICBwcml2YXRlIGRyYXdJbWFnZUNvbnRhaW4oY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LCBjYW52YXNXaWR0aDogbnVtYmVyLCBjYW52YXNIZWlnaHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGltYWdlUmF0aW8gPSBpbWFnZS53aWR0aCAvIGltYWdlLmhlaWdodDtcclxuICAgICAgICBjb25zdCBjYW52YXNSYXRpbyA9IGNhbnZhc1dpZHRoIC8gY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICBsZXQgZHJhd1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgbGV0IGRyYXdIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICAgICAgaWYgKGltYWdlUmF0aW8gPiBjYW52YXNSYXRpbykge1xyXG4gICAgICAgICAgICAvLyBJbWFnZSBpcyB3aWRlciB0aGFuIGNhbnZhcyAocmVsYXRpdmUgdG8gaGVpZ2h0KSwgc2NhbGUgdG8gZml0IGNhbnZhcyB3aWR0aFxyXG4gICAgICAgICAgICBkcmF3V2lkdGggPSBjYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgZHJhd0hlaWdodCA9IGNhbnZhc1dpZHRoIC8gaW1hZ2VSYXRpbztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBJbWFnZSBpcyB0YWxsZXIgdGhhbiBjYW52YXMgKHJlbGF0aXZlIHRvIHdpZHRoKSwgc2NhbGUgdG8gZml0IGNhbnZhcyBoZWlnaHRcclxuICAgICAgICAgICAgZHJhd0hlaWdodCA9IGNhbnZhc0hlaWdodDtcclxuICAgICAgICAgICAgZHJhd1dpZHRoID0gY2FudmFzSGVpZ2h0ICogaW1hZ2VSYXRpbztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGRyYXdYID0gKGNhbnZhc1dpZHRoIC0gZHJhd1dpZHRoKSAvIDI7XHJcbiAgICAgICAgY29uc3QgZHJhd1kgPSAoY2FudmFzSGVpZ2h0IC0gZHJhd0hlaWdodCkgLyAyO1xyXG5cclxuICAgICAgICBjdHguZHJhd0ltYWdlKGltYWdlLCBkcmF3WCwgZHJhd1ksIGRyYXdXaWR0aCwgZHJhd0hlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSGVscGVyIHRvIGRyYXcgYW4gaW1hZ2UgdXNpbmcgJ29iamVjdC1maXQ6IGNvdmVyJyBsb2dpYyAoZmlsbHMgdGhlIGNhbnZhcywgbWF5IGNyb3AgaW1hZ2UgZWRnZXMpXHJcbiAgICBwcml2YXRlIGRyYXdJbWFnZUNvdmVyKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBpbWFnZTogSFRNTEltYWdlRWxlbWVudCwgY2FudmFzV2lkdGg6IG51bWJlciwgY2FudmFzSGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBpbWFnZVJhdGlvID0gaW1hZ2Uud2lkdGggLyBpbWFnZS5oZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgY2FudmFzUmF0aW8gPSBjYW52YXNXaWR0aCAvIGNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgbGV0IHNvdXJjZVggPSAwO1xyXG4gICAgICAgIGxldCBzb3VyY2VZID0gMDtcclxuICAgICAgICBsZXQgc291cmNlV2lkdGggPSBpbWFnZS53aWR0aDtcclxuICAgICAgICBsZXQgc291cmNlSGVpZ2h0ID0gaW1hZ2UuaGVpZ2h0O1xyXG5cclxuICAgICAgICBsZXQgZGVzdFggPSAwO1xyXG4gICAgICAgIGxldCBkZXN0WSA9IDA7XHJcbiAgICAgICAgbGV0IGRlc3RXaWR0aCA9IGNhbnZhc1dpZHRoO1xyXG4gICAgICAgIGxldCBkZXN0SGVpZ2h0ID0gY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICBpZiAoaW1hZ2VSYXRpbyA+IGNhbnZhc1JhdGlvKSB7XHJcbiAgICAgICAgICAgIC8vIEltYWdlIGlzIHdpZGVyIHRoYW4gY2FudmFzIHJhdGlvLCBzbyBzY2FsZSBieSBoZWlnaHQgYW5kIGNyb3Agd2lkdGhcclxuICAgICAgICAgICAgc291cmNlV2lkdGggPSBpbWFnZS5oZWlnaHQgKiBjYW52YXNSYXRpbztcclxuICAgICAgICAgICAgc291cmNlWCA9IChpbWFnZS53aWR0aCAtIHNvdXJjZVdpZHRoKSAvIDI7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSW1hZ2UgaXMgdGFsbGVyIHRoYW4gY2FudmFzIHJhdGlvLCBzbyBzY2FsZSBieSB3aWR0aCBhbmQgY3JvcCBoZWlnaHRcclxuICAgICAgICAgICAgc291cmNlSGVpZ2h0ID0gaW1hZ2Uud2lkdGggLyBjYW52YXNSYXRpbztcclxuICAgICAgICAgICAgc291cmNlWSA9IChpbWFnZS5oZWlnaHQgLSBzb3VyY2VIZWlnaHQpIC8gMjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHNvdXJjZVgsIHNvdXJjZVksIHNvdXJjZVdpZHRoLCBzb3VyY2VIZWlnaHQsIGRlc3RYLCBkZXN0WSwgZGVzdFdpZHRoLCBkZXN0SGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXJUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoXCJ0aXRsZV9iYWNrZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlmICh0aXRsZUltYWdlKSB7XHJcbiAgICAgICAgICAgIC8vIFVzZSBkcmF3SW1hZ2VDb3ZlciBmb3IgdGhlIHRpdGxlIGJhY2tncm91bmQgdG8gZmlsbCB0aGUgZW50aXJlIGNhbnZhcywgcG90ZW50aWFsbHkgY3JvcHBpbmcgZWRnZXNcclxuICAgICAgICAgICAgdGhpcy5kcmF3SW1hZ2VDb3Zlcih0aGlzLmN0eCwgdGl0bGVJbWFnZSwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2RhcmtibHVlJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQodGhpcy5kYXRhLmdhbWVTZXR0aW5ncy50aXRsZVNjcmVlblRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwLCAnd2hpdGUnLCAnY2VudGVyJywgJzQ4cHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dChcIlByZXNzIEVOVEVSIHRvIFN0YXJ0XCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwLCAnd2hpdGUnLCAnY2VudGVyJywgJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVySW5zdHJ1Y3Rpb25zU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSByZXR1cm47XHJcbiAgICAgICAgY29uc3QgdGl0bGVJbWFnZSA9IHRoaXMuaW1hZ2VzLmdldChcInRpdGxlX2JhY2tncm91bmRcIik7XHJcbiAgICAgICAgaWYgKHRpdGxlSW1hZ2UpIHtcclxuICAgICAgICAgICAgLy8gVXNlIGRyYXdJbWFnZUNvdmVyIGZvciB0aGUgaW5zdHJ1Y3Rpb25zIGJhY2tncm91bmQgdG8gZmlsbCB0aGUgZW50aXJlIGNhbnZhcywgcG90ZW50aWFsbHkgY3JvcHBpbmcgZWRnZXNcclxuICAgICAgICAgICAgdGhpcy5kcmF3SW1hZ2VDb3Zlcih0aGlzLmN0eCwgdGl0bGVJbWFnZSwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2RhcmtibHVlJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZHJhd1RleHQoXCJcdUM4NzBcdUM3OTFcdUJDOTVcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCAxMDAsICd3aGl0ZScsICdjZW50ZXInLCAnNDBweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmluc3RydWN0aW9uc1RleHQuZm9yRWFjaCgobGluZSwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChsaW5lLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIDE4MCArIGluZGV4ICogNDAsICd3aGl0ZScsICdjZW50ZXInLCAnMjBweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KFwiUHJlc3MgRU5URVIgdG8gUGxheVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAtIDEwMCwgJ3doaXRlJywgJ2NlbnRlcicsICcyNHB4IEFyaWFsLCBzYW5zLXNlcmlmJyk7IC8vIENoYW5nZWQgdG8gYmFzaWMgZm9udFxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlckdhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kYXRhKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC43KSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmdhbWVPdmVyVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gODAsICdyZWQnLCAnY2VudGVyJywgJzYwcHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICAgICAgdGhpcy5kcmF3VGV4dChgRmluYWwgU2NvcmU6ICR7dGhpcy5zY29yZX1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsICd3aGl0ZScsICdjZW50ZXInLCAnMzZweCBBcmlhbCwgc2Fucy1zZXJpZicpOyAvLyBDaGFuZ2VkIHRvIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmRyYXdUZXh0KFwiUHJlc3MgRU5URVIgdG8gcmV0dXJuIHRvIFRpdGxlXCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDgwLCAnd2hpdGUnLCAnY2VudGVyJywgJzI0cHggQXJpYWwsIHNhbnMtc2VyaWYnKTsgLy8gQ2hhbmdlZCB0byBiYXNpYyBmb250XHJcbiAgICB9XHJcblxyXG4gICAgZHJhd1RleHQodGV4dDogc3RyaW5nLCB4OiBudW1iZXIsIHk6IG51bWJlciwgY29sb3I6IHN0cmluZywgYWxpZ246IENhbnZhc1RleHRBbGlnbiA9ICdsZWZ0JywgZm9udDogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gY29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGZvbnQ7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gYWxpZ247XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGV4dCwgeCwgeSk7XHJcbiAgICB9XHJcblxyXG4gICAgcGxheVNvdW5kKHNvdW5kTmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChzb3VuZE5hbWUpO1xyXG4gICAgICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgICAgICBjb25zdCBjbG9uZSA9IGF1ZGlvLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MQXVkaW9FbGVtZW50OyAvLyBDbG9uZSBmb3IgY29uY3VycmVudCBwbGF5YmFja1xyXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSBhdWRpby52b2x1bWU7XHJcbiAgICAgICAgICAgIGNsb25lLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBjbG9uZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYFNvdW5kIHBsYXliYWNrIGZhaWxlZDogJHtzb3VuZE5hbWV9YCwgZSkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7c291bmROYW1lfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzdGFydE11c2ljKHNvdW5kTmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuc3RvcE11c2ljKCk7IC8vIFN0b3AgYW55IGV4aXN0aW5nIG11c2ljXHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLnNvdW5kcy5nZXQoc291bmROYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5tdXNpYyA9IGF1ZGlvOyAvLyBVc2UgdGhlIG9yaWdpbmFsIEF1ZGlvIGVsZW1lbnQgZm9yIGJhY2tncm91bmQgbXVzaWNcclxuICAgICAgICAgICAgdGhpcy5tdXNpYy5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgdGhpcy5tdXNpYy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYE11c2ljIHBsYXliYWNrIGZhaWxlZDogJHtzb3VuZE5hbWV9YCwgZSkpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgTXVzaWMgJyR7c291bmROYW1lfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzdG9wTXVzaWMoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMubXVzaWMpIHtcclxuICAgICAgICAgICAgdGhpcy5tdXNpYy5wYXVzZSgpO1xyXG4gICAgICAgICAgICB0aGlzLm11c2ljLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgdGhpcy5tdXNpYyA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBHbG9iYWwgc2NvcGUgdG8gZW5zdXJlIGl0J3MgYWNjZXNzaWJsZSBieSBIVE1MXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICAgIGludGVyZmFjZSBXaW5kb3cge1xyXG4gICAgICAgIGdhbWU6IEdhbWU7XHJcbiAgICB9XHJcbn1cclxuXHJcbndpbmRvdy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAvLyBSZW1vdmVkIGN1c3RvbSBmb250IGxvYWRpbmcgdG8gY29tcGx5IHdpdGggdGhlIFwiYmFzaWMgZm9udFwiIHJlcXVpcmVtZW50LlxyXG4gICAgLy8gVXNpbmcgYSBkZWZhdWx0IHdlYi1zYWZlIGZvbnQgbGlrZSBBcmlhbCwgc2Fucy1zZXJpZi5cclxuICAgIHdpbmRvdy5nYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgIHdpbmRvdy5nYW1lLnN0YXJ0KCk7XHJcbn07XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQXlGQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxXQUFBLGFBQVU7QUFDVixFQUFBQSxXQUFBLFdBQVE7QUFDUixFQUFBQSxXQUFBLGtCQUFlO0FBQ2YsRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxlQUFZO0FBTFgsU0FBQUE7QUFBQSxHQUFBO0FBUUwsTUFBTSxXQUFXO0FBQUE7QUFBQSxFQVNiLFlBQVksR0FBVyxHQUFXLE9BQWUsUUFBZ0IsV0FB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
