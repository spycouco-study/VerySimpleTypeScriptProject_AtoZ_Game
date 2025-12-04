var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class AssetManager {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.totalAssets = 0;
    this.loadedAssets = 0;
    this.onReadyCallbacks = [];
  }
  async load(data) {
    this.totalAssets = data.images.length + data.sounds.length;
    if (this.totalAssets === 0) {
      this.notifyReady();
      return;
    }
    const imagePromises = data.images.map((img) => this.loadImage(img.name, img.path));
    const soundPromises = data.sounds.map((snd) => this.loadSound(snd.name, snd.path));
    await Promise.all([...imagePromises, ...soundPromises]);
    this.notifyReady();
  }
  loadImage(name, path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = path;
      img.onload = () => {
        this.images.set(name, img);
        this.loadedAssets++;
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${path}`);
        this.loadedAssets++;
        resolve();
      };
    });
  }
  loadSound(name, path) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = path;
      audio.preload = "auto";
      audio.oncanplaythrough = () => {
        this.sounds.set(name, audio);
        this.loadedAssets++;
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${path}`);
        this.loadedAssets++;
        resolve();
      };
    });
  }
  getImage(name) {
    return this.images.get(name);
  }
  getSound(name) {
    return this.sounds.get(name);
  }
  playSound(name, loop = false, volume) {
    const sound = this.sounds.get(name);
    if (sound) {
      const clone = sound.cloneNode(true);
      clone.loop = loop;
      clone.volume = volume !== void 0 ? volume : sound.volume;
      clone.play().catch((e) => console.warn(`Failed to play sound ${name}:`, e));
      return clone;
    }
    return void 0;
  }
  stopSound(audioElement) {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
  }
  getLoadProgress() {
    return this.totalAssets === 0 ? 1 : this.loadedAssets / this.totalAssets;
  }
  onReady(callback) {
    if (this.isReady()) {
      callback();
    } else {
      this.onReadyCallbacks.push(callback);
    }
  }
  isReady() {
    return this.loadedAssets === this.totalAssets;
  }
  notifyReady() {
    this.onReadyCallbacks.forEach((callback) => callback());
    this.onReadyCallbacks = [];
  }
}
class InputHandler {
  constructor() {
    this.keys = /* @__PURE__ */ new Set();
    this.pressCallbacks = /* @__PURE__ */ new Map();
    this.handleKeyDown = (e) => {
      if (!this.keys.has(e.code)) {
        this.keys.add(e.code);
        this.pressCallbacks.get(e.code)?.();
      }
    };
    this.handleKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this.handleClick = (e) => {
      this.pressCallbacks.get("click")?.();
    };
    this.handleTouchStart = (e) => {
      e.preventDefault();
      this.pressCallbacks.get("click")?.();
    };
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("click", this.handleClick);
    window.addEventListener("touchstart", this.handleTouchStart, { passive: false });
  }
  isKeyDown(key) {
    return this.keys.has(key);
  }
  onKeyPress(key, callback) {
    this.pressCallbacks.set(key, callback);
  }
  clearKeyPressCallbacks() {
    this.pressCallbacks.clear();
  }
}
class GameObject {
  constructor(x, y, width, height, image, speed = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.image = image;
    this.speed = speed;
  }
  update(deltaTime, gameSpeed) {
    this.x -= (this.speed || gameSpeed) * deltaTime;
  }
  draw(ctx) {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
  }
  isColliding(other) {
    return this.x < other.x + other.width && this.x + this.width > other.x && this.y < other.y + other.height && this.y + this.height > other.y;
  }
  isOffscreen(canvasWidth) {
    return this.x + this.width < 0;
  }
}
class Player extends GameObject {
  // NEW: Total allowed jumps
  constructor(x, y, width, height, imageRun, imageJump, imageSlide, maxHealth, hitInvincibilityDuration, gameSettings, input, assetManager) {
    super(x, y, width, height, imageRun);
    this.imageJump = imageJump;
    this.imageSlide = imageSlide;
    this.hitInvincibilityDuration = hitInvincibilityDuration;
    this.velocityY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.hitInvincibilityTimer = 0;
    this.currentRunFrame = 0;
    this.runFrameSpeed = 0.1;
    this.score = 0;
    this.canJumpInput = true;
    this.originalY = y;
    this.health = maxHealth;
    this.gameSettings = gameSettings;
    this.input = input;
    this.assetManager = assetManager;
    this.maxJumps = this.gameSettings.player.maxJumps;
    this.jumpsRemaining = this.maxJumps;
  }
  update(deltaTime, gameSpeed) {
    const jumpKeyPressed = this.input.isKeyDown("Space") || this.input.isKeyDown("click");
    if (jumpKeyPressed && this.canJumpInput && !this.isSliding) {
      if (this.jumpsRemaining > 0) {
        this.jump(this.gameSettings.player.jumpForce);
        this.assetManager.playSound("sfx_jump", false, 0.5);
        this.jumpsRemaining--;
        this.canJumpInput = false;
      }
    } else if (!jumpKeyPressed) {
      this.canJumpInput = true;
    }
    if (this.input.isKeyDown("ArrowDown")) {
      if (!this.isJumping && !this.isSliding) {
        this.slide(this.gameSettings.player.slideDuration, this.gameSettings.player.height);
        this.assetManager.playSound("sfx_slide", false, 0.5);
      }
    }
    this.velocityY += this.gameSettings.gravity * deltaTime;
    this.y += this.velocityY * deltaTime;
    if (this.y >= this.originalY) {
      this.y = this.originalY;
      this.velocityY = 0;
      this.isJumping = false;
      this.jumpsRemaining = this.maxJumps;
    } else {
      this.isJumping = true;
    }
    if (this.isSliding) {
      this.slideTimer -= deltaTime;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
        this.height = this.gameSettings.player.height;
      }
    }
    if (this.hitInvincibilityTimer > 0) {
      this.hitInvincibilityTimer -= deltaTime;
    }
    if (!this.isJumping && !this.isSliding) {
      this.currentRunFrame = (this.currentRunFrame + this.runFrameSpeed * deltaTime * 60) % 2;
      if (this.image.src !== this.assetManager.getImage("cookie_run")?.src) {
        this.image = this.assetManager.getImage("cookie_run");
      }
    } else if (this.isJumping) {
      this.image = this.imageJump;
    } else if (this.isSliding) {
      this.image = this.imageSlide;
    }
  }
  draw(ctx) {
    if (this.hitInvincibilityTimer > 0 && Math.floor(this.hitInvincibilityTimer * 10) % 2) {
      return;
    }
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
  }
  jump(force) {
    this.isJumping = true;
    this.velocityY = -force;
  }
  slide(duration, originalHeight) {
    if (!this.isJumping && !this.isSliding) {
      this.isSliding = true;
      this.slideTimer = duration;
      this.height = originalHeight * 0.5;
    }
  }
  takeDamage(amount) {
    if (this.hitInvincibilityTimer <= 0) {
      this.health -= amount;
      this.hitInvincibilityTimer = this.hitInvincibilityDuration;
    }
  }
  addScore(amount) {
    this.score += amount;
  }
  isInvincible() {
    return this.hitInvincibilityTimer > 0;
  }
}
class ParallaxBackground extends GameObject {
  constructor(x, y, width, height, image, speed, canvasWidth) {
    super(x, y, width, height, image, speed);
    this.canvasWidth = canvasWidth;
  }
  update(deltaTime, gameSpeed) {
    this.x -= this.speed * gameSpeed * deltaTime;
    if (this.x + this.width <= 0) {
      this.x += this.width;
      if (this.x + this.width <= 0) {
        this.x += this.width;
      }
    }
  }
  draw(ctx) {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
    if (this.width < this.canvasWidth && this.x + 2 * this.width <= this.canvasWidth + this.speed * 10) {
      ctx.drawImage(this.image, this.x + 2 * this.width, this.y, this.width, this.height);
    }
  }
}
class Game {
  constructor(canvasId) {
    this.assetManager = new AssetManager();
    this.inputHandler = new InputHandler();
    this.gameState = 0 /* LOADING */;
    this.lastTime = 0;
    this.backgrounds = [];
    this.obstacles = [];
    this.collectibles = [];
    this.obstacleSpawnTimer = 0;
    this.collectibleSpawnTimer = 0;
    this.startGame = () => {
      this.gameState = 2 /* PLAYING */;
      this.inputHandler.clearKeyPressCallbacks();
      this.resetGame();
      this.currentBGM?.pause();
      this.currentBGM = this.assetManager.playSound("bgm_game", true, 0.5);
    };
    this.gameOver = () => {
      this.gameState = 3 /* GAME_OVER */;
      this.currentBGM?.pause();
      this.assetManager.playSound("sfx_game_over", false, 0.7);
      this.inputHandler.clearKeyPressCallbacks();
      this.inputHandler.onKeyPress("Space", this.returnToTitle);
      this.inputHandler.onKeyPress("click", this.returnToTitle);
    };
    this.returnToTitle = () => {
      this.gameState = 1 /* TITLE */;
      this.setupTitleScreen();
      this.currentBGM?.pause();
      this.currentBGM = this.assetManager.playSound("bgm_title", true, 0.5);
    };
    this.gameLoop = (currentTime) => {
      if (!this.lastTime) this.lastTime = currentTime;
      const deltaTime = (currentTime - this.lastTime) / 1e3;
      this.lastTime = currentTime;
      if (this.gameState === 0 /* LOADING */) {
        this.renderLoadingScreen();
      } else {
        this.update(deltaTime);
        this.render();
      }
      requestAnimationFrame(this.gameLoop);
    };
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      console.error("Canvas context not found!");
      return;
    }
  }
  async init() {
    await this.loadGameData();
    this.canvas.width = this.data.gameSettings.canvasWidth;
    this.canvas.height = this.data.gameSettings.canvasHeight;
    this.ctx.imageSmoothingEnabled = true;
    await this.assetManager.load(this.data.assets);
    this.assetManager.onReady(() => {
      console.log("Assets loaded. Transitioning to TITLE state.");
      this.gameState = 1 /* TITLE */;
      this.setupTitleScreen();
      this.currentBGM = this.assetManager.playSound("bgm_title", true, 0.5);
    });
    requestAnimationFrame(this.gameLoop);
  }
  async loadGameData() {
    try {
      const response = await fetch("data.json");
      this.data = await response.json();
    } catch (error) {
      console.error("Failed to load game data:", error);
    }
  }
  setupTitleScreen() {
    this.inputHandler.clearKeyPressCallbacks();
    this.inputHandler.onKeyPress("Space", this.startGame);
    this.inputHandler.onKeyPress("click", this.startGame);
  }
  resetGame() {
    const gs = this.data.gameSettings;
    const playerImageRun = this.assetManager.getImage("cookie_run");
    const playerImageJump = this.assetManager.getImage("cookie_jump");
    const playerImageSlide = this.assetManager.getImage("cookie_slide");
    const playerGroundY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.player.height + gs.player.groundOffsetY;
    this.player = new Player(
      gs.canvasWidth * 0.1,
      // Player starting X
      playerGroundY,
      gs.player.width,
      gs.player.height,
      playerImageRun,
      playerImageJump,
      playerImageSlide,
      gs.player.maxHealth,
      gs.player.hitInvincibilityDuration,
      gs,
      // Pass gameSettings
      this.inputHandler,
      // Pass inputHandler
      this.assetManager
      // Pass assetManager
    );
    this.backgrounds = gs.backgrounds.map((bg) => {
      const img = this.assetManager.getImage(bg.name);
      const bgHeight = gs.canvasHeight * bg.height;
      const aspectRatio = img.width / img.height;
      const bgWidth = bgHeight * aspectRatio;
      return new ParallaxBackground(0, gs.canvasHeight * bg.yOffset, bgWidth, bgHeight, img, bg.speedMultiplier, this.canvas.width);
    });
    const groundImage = this.assetManager.getImage(gs.ground.name);
    const groundHeight = gs.canvasHeight * gs.ground.height;
    const groundY = gs.canvasHeight - groundHeight;
    const groundWidth = this.canvas.width * (groundImage.width / groundImage.height) / (this.canvas.height / groundHeight);
    this.ground = new ParallaxBackground(0, groundY, this.canvas.width, groundHeight, groundImage, 1, this.canvas.width);
    this.obstacles = [];
    this.collectibles = [];
    this.obstacleSpawnTimer = gs.obstacle.minSpawnInterval;
    this.collectibleSpawnTimer = gs.obstacle.minSpawnInterval;
  }
  update(deltaTime) {
    if (this.gameState === 2 /* PLAYING */) {
      const gs = this.data.gameSettings;
      this.player.update(deltaTime, gs.gameSpeed);
      if (this.player.health <= 0) {
        this.gameOver();
        return;
      }
      this.backgrounds.forEach((bg) => bg.update(deltaTime, gs.gameSpeed));
      this.ground.update(deltaTime, gs.gameSpeed);
      this.obstacleSpawnTimer -= deltaTime;
      if (this.obstacleSpawnTimer <= 0) {
        this.spawnObstacle();
        this.obstacleSpawnTimer = Math.random() * (gs.obstacle.maxSpawnInterval - gs.obstacle.minSpawnInterval) + gs.obstacle.minSpawnInterval;
      }
      this.collectibleSpawnTimer -= deltaTime;
      if (this.collectibleSpawnTimer <= 0) {
        this.spawnCollectible();
        this.collectibleSpawnTimer = Math.random() * (gs.collectible.maxSpawnInterval - gs.collectible.minSpawnInterval) + gs.collectible.minSpawnInterval;
      }
      this.obstacles.forEach((obstacle) => obstacle.update(deltaTime, gs.gameSpeed * gs.obstacle.speedMultiplier));
      this.obstacles = this.obstacles.filter((obstacle) => !obstacle.isOffscreen(this.canvas.width));
      this.collectibles.forEach((collectible) => collectible.update(deltaTime, gs.gameSpeed * gs.collectible.speedMultiplier));
      this.collectibles = this.collectibles.filter((collectible) => !collectible.isOffscreen(this.canvas.width));
      this.checkCollisions();
      this.player.addScore(deltaTime * 10);
    }
  }
  renderLoadingScreen() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial";
    this.ctx.fillText("Loading Assets...", this.canvas.width / 2, this.canvas.height / 2);
    const progress = this.assetManager.getLoadProgress();
    this.ctx.fillText(`${(progress * 100).toFixed(0)}%`, this.canvas.width / 2, this.canvas.height / 2 + 40);
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    switch (this.gameState) {
      case 1 /* TITLE */:
        const titleBg = this.assetManager.getImage("title_background");
        if (titleBg) {
          this.ctx.drawImage(titleBg, 0, 0, this.canvas.width, this.canvas.height);
        } else {
          this.ctx.fillStyle = "lightblue";
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "white";
        this.ctx.font = `bold ${this.data.gameSettings.ui.scoreFontSize * 1.5}px Arial`;
        this.ctx.fillText("Cookie Runner", this.canvas.width / 2, this.canvas.height / 3);
        this.ctx.font = `${this.data.gameSettings.ui.scoreFontSize}px Arial`;
        this.ctx.fillText("Press SPACE or TAP to Start", this.canvas.width / 2, this.canvas.height / 2);
        break;
      case 2 /* PLAYING */:
        this.backgrounds.forEach((bg) => bg.draw(this.ctx));
        this.ground.draw(this.ctx);
        this.obstacles.forEach((obstacle) => obstacle.draw(this.ctx));
        this.collectibles.forEach((collectible) => collectible.draw(this.ctx));
        this.player.draw(this.ctx);
        this.drawUI();
        break;
      case 3 /* GAME_OVER */:
        const gameOverBg = this.assetManager.getImage("game_over_background");
        if (gameOverBg) {
          this.ctx.drawImage(gameOverBg, 0, 0, this.canvas.width, this.canvas.height);
        } else {
          this.ctx.fillStyle = "darkred";
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = "white";
        this.ctx.font = `bold ${this.data.gameSettings.ui.scoreFontSize * 1.5}px Arial`;
        this.ctx.fillText("GAME OVER", this.canvas.width / 2, this.canvas.height / 3);
        this.ctx.font = `${this.data.gameSettings.ui.scoreFontSize}px Arial`;
        this.ctx.fillText(`SCORE: ${Math.floor(this.player.score)}`, this.canvas.width / 2, this.canvas.height / 2.2);
        this.ctx.fillText("Press SPACE or TAP to return to Title", this.canvas.width / 2, this.canvas.height / 1.8);
        break;
    }
  }
  drawUI() {
    const gs = this.data.gameSettings;
    this.ctx.fillStyle = "black";
    this.ctx.font = `${gs.ui.scoreFontSize}px Arial`;
    this.ctx.textAlign = "left";
    this.ctx.fillText(`SCORE: ${Math.floor(this.player.score)}`, 10, 30);
    const healthBarX = this.canvas.width - gs.ui.healthBarWidth - 10;
    const healthBarY = 10;
    const currentHealthWidth = this.player.health / gs.player.maxHealth * gs.ui.healthBarWidth;
    this.ctx.fillStyle = "gray";
    this.ctx.fillRect(healthBarX, healthBarY, gs.ui.healthBarWidth, gs.ui.healthBarHeight);
    this.ctx.fillStyle = "red";
    this.ctx.fillRect(healthBarX, healthBarY, currentHealthWidth, gs.ui.healthBarHeight);
    this.ctx.strokeStyle = "white";
    this.ctx.strokeRect(healthBarX, healthBarY, gs.ui.healthBarWidth, gs.ui.healthBarHeight);
  }
  spawnObstacle() {
    const gs = this.data.gameSettings;
    const obstacleImage = this.assetManager.getImage("obstacle_spike");
    if (!obstacleImage) {
      console.warn("Obstacle image not found!");
      return;
    }
    const obstacleY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.obstacle.height;
    this.obstacles.push(new GameObject(this.canvas.width, obstacleY, gs.obstacle.width, gs.obstacle.height, obstacleImage));
  }
  spawnCollectible() {
    const gs = this.data.gameSettings;
    const jellyImage = this.assetManager.getImage("jelly_basic");
    if (!jellyImage) {
      console.warn("Collectible image not found!");
      return;
    }
    const minJellyY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.collectible.height * 2;
    const maxJellyY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.collectible.height * 4;
    const jellyY = Math.random() * (minJellyY - maxJellyY) + maxJellyY;
    this.collectibles.push(new GameObject(this.canvas.width, jellyY, gs.collectible.width, gs.collectible.height, jellyImage));
  }
  checkCollisions() {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obstacle = this.obstacles[i];
      if (this.player.isColliding(obstacle)) {
        if (!this.player.isInvincible()) {
          this.player.takeDamage(1);
          this.assetManager.playSound("sfx_hit", false, 0.7);
          if (this.player.health <= 0) {
            this.gameOver();
            return;
          }
        }
      }
    }
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const collectible = this.collectibles[i];
      if (this.player.isColliding(collectible)) {
        this.player.addScore(this.data.gameSettings.collectible.scoreValue);
        this.collectibles.splice(i, 1);
        this.assetManager.playSound("sfx_collect", false, 0.5);
      }
    }
  }
}
const game = new Game("gameCanvas");
game.init();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgZ2FtZVNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgZ3Jhdml0eTogbnVtYmVyO1xyXG4gICAgICAgIHBsYXllcjoge1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICAgICAganVtcEZvcmNlOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNsaWRlRHVyYXRpb246IG51bWJlcjtcclxuICAgICAgICAgICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGhpdEludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgICAgICAgICBncm91bmRPZmZzZXRZOiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kIGxpbmVcclxuICAgICAgICAgICAgbWF4SnVtcHM6IG51bWJlcjsgLy8gTkVXOiBNYXhpbXVtIG51bWJlciBvZiBqdW1wcyBhbGxvd2VkXHJcbiAgICAgICAgfTtcclxuICAgICAgICBvYnN0YWNsZToge1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICAgICAgbWluU3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgICAgICAgICBtYXhTcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyOyAvLyBNdWx0aXBsaWVzIGdhbWVTcGVlZFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgY29sbGVjdGlibGU6IHtcclxuICAgICAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgICAgIG1pblNwYXduSW50ZXJ2YWw6IG51bWJlcjtcclxuICAgICAgICAgICAgbWF4U3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgICAgICAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyOyAvLyBNdWx0aXBsaWVzIGdhbWVTcGVlZFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgYmFja2dyb3VuZHM6IEFycmF5PHtcclxuICAgICAgICAgICAgbmFtZTogc3RyaW5nO1xyXG4gICAgICAgICAgICBzcGVlZE11bHRpcGxpZXI6IG51bWJlcjtcclxuICAgICAgICAgICAgeU9mZnNldDogbnVtYmVyOyAvLyAlIG9mIGNhbnZhcyBoZWlnaHRcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodFxyXG4gICAgICAgIH0+O1xyXG4gICAgICAgIGdyb3VuZDoge1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIGhlaWdodDogbnVtYmVyOyAvLyAlIG9mIGNhbnZhcyBoZWlnaHRcclxuICAgICAgICAgICAgeU9mZnNldDogbnVtYmVyOyAvLyAlIG9mIGNhbnZhcyBoZWlnaHQgZnJvbSBib3R0b21cclxuICAgICAgICB9O1xyXG4gICAgICAgIHVpOiB7XHJcbiAgICAgICAgICAgIHNjb3JlRm9udFNpemU6IG51bWJlcjtcclxuICAgICAgICAgICAgaGVhbHRoQmFyV2lkdGg6IG51bWJlcjtcclxuICAgICAgICAgICAgaGVhbHRoQmFySGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEFycmF5PHtcclxuICAgICAgICAgICAgbmFtZTogc3RyaW5nO1xyXG4gICAgICAgICAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHdpZHRoOiBudW1iZXI7IC8vIE9yaWdpbmFsIHdpZHRoXHJcbiAgICAgICAgICAgIGhlaWdodDogbnVtYmVyOyAvLyBPcmlnaW5hbCBoZWlnaHRcclxuICAgICAgICB9PjtcclxuICAgICAgICBzb3VuZHM6IEFycmF5PHtcclxuICAgICAgICAgICAgbmFtZTogc3RyaW5nO1xyXG4gICAgICAgICAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgICAgICAgICAgdm9sdW1lOiBudW1iZXI7XHJcbiAgICAgICAgfT47XHJcbiAgICB9O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HLFxyXG4gICAgVElUTEUsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSLFxyXG59XHJcblxyXG5jbGFzcyBBc3NldE1hbmFnZXIge1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbG9hZGVkQXNzZXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBvblJlYWR5Q2FsbGJhY2tzOiAoKCkgPT4gdm9pZClbXSA9IFtdO1xyXG5cclxuICAgIGFzeW5jIGxvYWQoZGF0YTogR2FtZURhdGFbJ2Fzc2V0cyddKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGRhdGEuaW1hZ2VzLmxlbmd0aCArIGRhdGEuc291bmRzLmxlbmd0aDtcclxuICAgICAgICBpZiAodGhpcy50b3RhbEFzc2V0cyA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLm5vdGlmeVJlYWR5KCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBkYXRhLmltYWdlcy5tYXAoaW1nID0+IHRoaXMubG9hZEltYWdlKGltZy5uYW1lLCBpbWcucGF0aCkpO1xyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSBkYXRhLnNvdW5kcy5tYXAoc25kID0+IHRoaXMubG9hZFNvdW5kKHNuZC5uYW1lLCBzbmQucGF0aCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIHRoaXMubm90aWZ5UmVhZHkoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRJbWFnZShuYW1lOiBzdHJpbmcsIHBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gcGF0aDtcclxuICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChuYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtwYXRofWApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKzsgLy8gU3RpbGwgY291bnQgdG8gYXZvaWQgYmxvY2tpbmdcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBhbnl3YXkgdG8gY29udGludWUgbG9hZGluZyBvdGhlciBhc3NldHNcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRTb3VuZChuYW1lOiBzdHJpbmcsIHBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnNyYyA9IHBhdGg7XHJcbiAgICAgICAgICAgIGF1ZGlvLnByZWxvYWQgPSAnYXV0byc7IC8vIFByZWxvYWQgdGhlIGF1ZGlvXHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQobmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3BhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrOyAvLyBTdGlsbCBjb3VudCB0byBhdm9pZCBibG9ja2luZ1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGFueXdheSB0byBjb250aW51ZSBsb2FkaW5nIG90aGVyIGFzc2V0c1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEltYWdlKG5hbWU6IHN0cmluZyk6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmltYWdlcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0U291bmQobmFtZTogc3RyaW5nKTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UsIHZvbHVtZT86IG51bWJlcik6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIGNvbnN0IHNvdW5kID0gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgICAgIGlmIChzb3VuZCkge1xyXG4gICAgICAgICAgICBjb25zdCBjbG9uZSA9IHNvdW5kLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICBjbG9uZS5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgY2xvbmUudm9sdW1lID0gdm9sdW1lICE9PSB1bmRlZmluZWQgPyB2b2x1bWUgOiBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgRmFpbGVkIHRvIHBsYXkgc291bmQgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgICAgIHJldHVybiBjbG9uZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICBzdG9wU291bmQoYXVkaW9FbGVtZW50OiBIVE1MQXVkaW9FbGVtZW50KSB7XHJcbiAgICAgICAgaWYgKGF1ZGlvRWxlbWVudCkge1xyXG4gICAgICAgICAgICBhdWRpb0VsZW1lbnQucGF1c2UoKTtcclxuICAgICAgICAgICAgYXVkaW9FbGVtZW50LmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9hZFByb2dyZXNzKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG90YWxBc3NldHMgPT09IDAgPyAxIDogdGhpcy5sb2FkZWRBc3NldHMgLyB0aGlzLnRvdGFsQXNzZXRzO1xyXG4gICAgfVxyXG5cclxuICAgIG9uUmVhZHkoY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5pc1JlYWR5KCkpIHtcclxuICAgICAgICAgICAgY2FsbGJhY2soKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLm9uUmVhZHlDYWxsYmFja3MucHVzaChjYWxsYmFjayk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlzUmVhZHkoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubG9hZGVkQXNzZXRzID09PSB0aGlzLnRvdGFsQXNzZXRzO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbm90aWZ5UmVhZHkoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5vblJlYWR5Q2FsbGJhY2tzLmZvckVhY2goY2FsbGJhY2sgPT4gY2FsbGJhY2soKSk7XHJcbiAgICAgICAgdGhpcy5vblJlYWR5Q2FsbGJhY2tzID0gW107XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIElucHV0SGFuZGxlciB7XHJcbiAgICBwcml2YXRlIGtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xyXG4gICAgcHJpdmF0ZSBwcmVzc0NhbGxiYWNrczogTWFwPHN0cmluZywgKCkgPT4gdm9pZD4gPSBuZXcgTWFwKCk7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMuaGFuZGxlS2V5VXApO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2xpY2spO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0JywgdGhpcy5oYW5kbGVUb3VjaFN0YXJ0LCB7IHBhc3NpdmU6IGZhbHNlIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93biA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmtleXMuaGFzKGUuY29kZSkpIHsgLy8gT25seSB0cmlnZ2VyIG9uIGZpcnN0IHByZXNzXHJcbiAgICAgICAgICAgIHRoaXMua2V5cy5hZGQoZS5jb2RlKTtcclxuICAgICAgICAgICAgdGhpcy5wcmVzc0NhbGxiYWNrcy5nZXQoZS5jb2RlKT8uKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAgPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xyXG4gICAgICAgIHRoaXMua2V5cy5kZWxldGUoZS5jb2RlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUNsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgICAgICB0aGlzLnByZXNzQ2FsbGJhY2tzLmdldCgnY2xpY2snKT8uKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVUb3VjaFN0YXJ0ID0gKGU6IFRvdWNoRXZlbnQpID0+IHtcclxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgZGVmYXVsdCB0b3VjaCBiZWhhdmlvciBsaWtlIHNjcm9sbGluZ1xyXG4gICAgICAgIHRoaXMucHJlc3NDYWxsYmFja3MuZ2V0KCdjbGljaycpPy4oKTsgLy8gVHJlYXQgdG91Y2ggYXMgYSBjbGlja1xyXG4gICAgfVxyXG5cclxuICAgIGlzS2V5RG93bihrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmtleXMuaGFzKGtleSk7XHJcbiAgICB9XHJcblxyXG4gICAgb25LZXlQcmVzcyhrZXk6IHN0cmluZywgY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcclxuICAgICAgICB0aGlzLnByZXNzQ2FsbGJhY2tzLnNldChrZXksIGNhbGxiYWNrKTtcclxuICAgIH1cclxuXHJcbiAgICBjbGVhcktleVByZXNzQ2FsbGJhY2tzKCkge1xyXG4gICAgICAgIHRoaXMucHJlc3NDYWxsYmFja3MuY2xlYXIoKTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgR2FtZU9iamVjdCB7XHJcbiAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICBwdWJsaWMgeDogbnVtYmVyLFxyXG4gICAgICAgIHB1YmxpYyB5OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIHdpZHRoOiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIHB1YmxpYyBpbWFnZTogSFRNTEltYWdlRWxlbWVudCxcclxuICAgICAgICBwdWJsaWMgc3BlZWQ6IG51bWJlciA9IDBcclxuICAgICkge31cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWVTcGVlZDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54IC09ICh0aGlzLnNwZWVkIHx8IGdhbWVTcGVlZCkgKiBkZWx0YVRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBpc0NvbGxpZGluZyhvdGhlcjogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgIHRoaXMueCA8IG90aGVyLnggKyBvdGhlci53aWR0aCAmJlxyXG4gICAgICAgICAgICB0aGlzLnggKyB0aGlzLndpZHRoID4gb3RoZXIueCAmJlxyXG4gICAgICAgICAgICB0aGlzLnkgPCBvdGhlci55ICsgb3RoZXIuaGVpZ2h0ICYmXHJcbiAgICAgICAgICAgIHRoaXMueSArIHRoaXMuaGVpZ2h0ID4gb3RoZXIueVxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNPZmZzY3JlZW4oY2FudmFzV2lkdGg6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnggKyB0aGlzLndpZHRoIDwgMDtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUGxheWVyIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBwcml2YXRlIHZlbG9jaXR5WTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgaXNKdW1waW5nOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIGlzU2xpZGluZzogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBzbGlkZVRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBoaXRJbnZpbmNpYmlsaXR5VGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRSdW5GcmFtZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgcnVuRnJhbWVTcGVlZDogbnVtYmVyID0gMC4xOyAvLyBBbmltYXRpb24gc3BlZWQgZm9yIHJ1bm5pbmcgY29va2llXHJcblxyXG4gICAgcHVibGljIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgcHVibGljIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHVibGljIG9yaWdpbmFsWTogbnVtYmVyO1xyXG5cclxuICAgIHByaXZhdGUgZ2FtZVNldHRpbmdzOiBHYW1lRGF0YVsnZ2FtZVNldHRpbmdzJ107XHJcbiAgICBwcml2YXRlIGlucHV0OiBJbnB1dEhhbmRsZXI7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyO1xyXG5cclxuICAgIHByaXZhdGUgY2FuSnVtcElucHV0OiBib29sZWFuID0gdHJ1ZTsgLy8gTkVXOiBGbGFnIHRvIHRyYWNrIGlmIGp1bXAgaW5wdXQgaXMgXCJmcmVzaFwiXHJcbiAgICBwcml2YXRlIGp1bXBzUmVtYWluaW5nOiBudW1iZXI7ICAgICAgICAvLyBORVc6IEhvdyBtYW55IGp1bXBzIGFyZSBsZWZ0XHJcbiAgICBwcml2YXRlIG1heEp1bXBzOiBudW1iZXI7ICAgICAgICAgICAgICAvLyBORVc6IFRvdGFsIGFsbG93ZWQganVtcHNcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICB4OiBudW1iZXIsXHJcbiAgICAgICAgeTogbnVtYmVyLFxyXG4gICAgICAgIHdpZHRoOiBudW1iZXIsXHJcbiAgICAgICAgaGVpZ2h0OiBudW1iZXIsXHJcbiAgICAgICAgaW1hZ2VSdW46IEhUTUxJbWFnZUVsZW1lbnQsXHJcbiAgICAgICAgcHJpdmF0ZSBpbWFnZUp1bXA6IEhUTUxJbWFnZUVsZW1lbnQsXHJcbiAgICAgICAgcHJpdmF0ZSBpbWFnZVNsaWRlOiBIVE1MSW1hZ2VFbGVtZW50LFxyXG4gICAgICAgIG1heEhlYWx0aDogbnVtYmVyLFxyXG4gICAgICAgIHByaXZhdGUgaGl0SW52aW5jaWJpbGl0eUR1cmF0aW9uOiBudW1iZXIsXHJcbiAgICAgICAgZ2FtZVNldHRpbmdzOiBHYW1lRGF0YVsnZ2FtZVNldHRpbmdzJ10sXHJcbiAgICAgICAgaW5wdXQ6IElucHV0SGFuZGxlcixcclxuICAgICAgICBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlclxyXG4gICAgKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VSdW4pO1xyXG4gICAgICAgIHRoaXMub3JpZ2luYWxZID0geTtcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IG1heEhlYWx0aDtcclxuICAgICAgICB0aGlzLmdhbWVTZXR0aW5ncyA9IGdhbWVTZXR0aW5ncztcclxuICAgICAgICB0aGlzLmlucHV0ID0gaW5wdXQ7XHJcbiAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIgPSBhc3NldE1hbmFnZXI7XHJcblxyXG4gICAgICAgIHRoaXMubWF4SnVtcHMgPSB0aGlzLmdhbWVTZXR0aW5ncy5wbGF5ZXIubWF4SnVtcHM7IC8vIE5FVzogSW5pdGlhbGl6ZSBtYXhKdW1wcyBmcm9tIHNldHRpbmdzXHJcbiAgICAgICAgdGhpcy5qdW1wc1JlbWFpbmluZyA9IHRoaXMubWF4SnVtcHM7ICAgICAgICAgICAgICAgLy8gTkVXOiBTdGFydCB3aXRoIGFsbCBqdW1wcyBhdmFpbGFibGVcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWVTcGVlZDogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3QganVtcEtleVByZXNzZWQgPSB0aGlzLmlucHV0LmlzS2V5RG93bignU3BhY2UnKSB8fCB0aGlzLmlucHV0LmlzS2V5RG93bignY2xpY2snKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGp1bXAgaW5wdXRcclxuICAgICAgICBpZiAoanVtcEtleVByZXNzZWQgJiYgdGhpcy5jYW5KdW1wSW5wdXQgJiYgIXRoaXMuaXNTbGlkaW5nKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmp1bXBzUmVtYWluaW5nID4gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5qdW1wKHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5qdW1wRm9yY2UpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZnhfanVtcCcsIGZhbHNlLCAwLjUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5qdW1wc1JlbWFpbmluZy0tOyAvLyBEZWNyZW1lbnQgcmVtYWluaW5nIGp1bXBzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbkp1bXBJbnB1dCA9IGZhbHNlOyAvLyBNYXJrIGlucHV0IGFzIGNvbnN1bWVkIGZvciB0aGlzIHByZXNzXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKCFqdW1wS2V5UHJlc3NlZCkge1xyXG4gICAgICAgICAgICAvLyBSZXNldCBjYW5KdW1wSW5wdXQgd2hlbiBqdW1wIGtleSBpcyByZWxlYXNlZFxyXG4gICAgICAgICAgICB0aGlzLmNhbkp1bXBJbnB1dCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgc2xpZGUgaW5wdXQgKG9ubHkgaWYgbm90IGp1bXBpbmcpXHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXQuaXNLZXlEb3duKCdBcnJvd0Rvd24nKSkge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuaXNKdW1waW5nICYmICF0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zbGlkZSh0aGlzLmdhbWVTZXR0aW5ncy5wbGF5ZXIuc2xpZGVEdXJhdGlvbiwgdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9zbGlkZScsIGZhbHNlLCAwLjUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBcHBseSBncmF2aXR5XHJcbiAgICAgICAgdGhpcy52ZWxvY2l0eVkgKz0gdGhpcy5nYW1lU2V0dGluZ3MuZ3Jhdml0eSAqIGRlbHRhVGltZTtcclxuICAgICAgICB0aGlzLnkgKz0gdGhpcy52ZWxvY2l0eVkgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgIC8vIEdyb3VuZCBjb2xsaXNpb25cclxuICAgICAgICBpZiAodGhpcy55ID49IHRoaXMub3JpZ2luYWxZKSB7XHJcbiAgICAgICAgICAgIHRoaXMueSA9IHRoaXMub3JpZ2luYWxZO1xyXG4gICAgICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuaXNKdW1waW5nID0gZmFsc2U7IC8vIFBsYXllciBpcyBvbiB0aGUgZ3JvdW5kXHJcbiAgICAgICAgICAgIHRoaXMuanVtcHNSZW1haW5pbmcgPSB0aGlzLm1heEp1bXBzOyAvLyBSZXNldCBqdW1wcyBvbiBsYW5kaW5nXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pc0p1bXBpbmcgPSB0cnVlOyAvLyBQbGF5ZXIgaXMgYWlyYm9ybmVcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNsaWRlIHRpbWVyXHJcbiAgICAgICAgaWYgKHRoaXMuaXNTbGlkaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2xpZGVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnNsaWRlVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pc1NsaWRpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLmhlaWdodDsgLy8gUmVzdG9yZSBvcmlnaW5hbCBoZWlnaHRcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSW52aW5jaWJpbGl0eSB0aW1lclxyXG4gICAgICAgIGlmICh0aGlzLmhpdEludmluY2liaWxpdHlUaW1lciA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5oaXRJbnZpbmNpYmlsaXR5VGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGFuaW1hdGlvbiBmcmFtZSBmb3IgcnVubmluZ1xyXG4gICAgICAgIGlmICghdGhpcy5pc0p1bXBpbmcgJiYgIXRoaXMuaXNTbGlkaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFJ1bkZyYW1lID0gKHRoaXMuY3VycmVudFJ1bkZyYW1lICsgdGhpcy5ydW5GcmFtZVNwZWVkICogZGVsdGFUaW1lICogNjApICUgMjsgLy8gU2ltcGxlIDItZnJhbWUgYW5pbWF0aW9uXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmltYWdlLnNyYyAhPT0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2Nvb2tpZV9ydW4nKT8uc3JjKSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdjb29raWVfcnVuJykhO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzSnVtcGluZykge1xyXG4gICAgICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5pbWFnZUp1bXA7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5pbWFnZVNsaWRlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyID4gMCAmJiBNYXRoLmZsb29yKHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyICogMTApICUgMikge1xyXG4gICAgICAgICAgICAvLyBCbGluayBlZmZlY3QgZHVyaW5nIGludmluY2liaWxpdHlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAganVtcChmb3JjZTogbnVtYmVyKSB7XHJcbiAgICAgICAgLy8gV2Ugbm8gbG9uZ2VyIGNoZWNrIGlzSnVtcGluZyBoZXJlLCBhcyBqdW1wc1JlbWFpbmluZyBoYW5kbGVzIHRoZSBsb2dpY1xyXG4gICAgICAgIC8vIFRoaXMgbWV0aG9kIGp1c3QgYXBwbGllcyB0aGUganVtcCBmb3JjZVxyXG4gICAgICAgIHRoaXMuaXNKdW1waW5nID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IC1mb3JjZTtcclxuICAgIH1cclxuXHJcbiAgICBzbGlkZShkdXJhdGlvbjogbnVtYmVyLCBvcmlnaW5hbEhlaWdodDogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzSnVtcGluZyAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1NsaWRpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNsaWRlVGltZXIgPSBkdXJhdGlvbjtcclxuICAgICAgICAgICAgdGhpcy5oZWlnaHQgPSBvcmlnaW5hbEhlaWdodCAqIDAuNTsgLy8gSGFsZiBoZWlnaHQgd2hpbGUgc2xpZGluZ1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGFtb3VudDogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5oZWFsdGggLT0gYW1vdW50O1xyXG4gICAgICAgICAgICB0aGlzLmhpdEludmluY2liaWxpdHlUaW1lciA9IHRoaXMuaGl0SW52aW5jaWJpbGl0eUR1cmF0aW9uO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhZGRTY29yZShhbW91bnQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuc2NvcmUgKz0gYW1vdW50O1xyXG4gICAgfVxyXG5cclxuICAgIGlzSW52aW5jaWJsZSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5oaXRJbnZpbmNpYmlsaXR5VGltZXIgPiAwO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQYXJhbGxheEJhY2tncm91bmQgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHByaXZhdGUgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihcclxuICAgICAgICB4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsXHJcbiAgICAgICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQsIHNwZWVkOiBudW1iZXIsIGNhbnZhc1dpZHRoOiBudW1iZXJcclxuICAgICkge1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGltYWdlLCBzcGVlZCk7XHJcbiAgICAgICAgdGhpcy5jYW52YXNXaWR0aCA9IGNhbnZhc1dpZHRoO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGdhbWVTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmlyc3QgaW1hZ2UgaGFzIHNjcm9sbGVkIG9mZi1zY3JlZW5cclxuICAgICAgICBpZiAodGhpcy54ICsgdGhpcy53aWR0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMueCArPSB0aGlzLndpZHRoOyAvLyBNb3ZlIGl0IHRvIHRoZSByaWdodCBvZiB0aGUgc2Vjb25kIGltYWdlIHRvIGNyZWF0ZSBhIGxvb3BcclxuICAgICAgICAgICAgLy8gVG8gZW5zdXJlIHNlYW1sZXNzbmVzcyBpZiBnYW1lU3BlZWQgaXMgaGlnaCBhbmQgZnJhbWUgcmF0ZSBsb3csXHJcbiAgICAgICAgICAgIC8vIHdlIG1pZ2h0IG5lZWQgdG8gYWRqdXN0IGJ5IGFub3RoZXIgd2lkdGggaWYgaXQganVtcHMgdG9vIGZhclxyXG4gICAgICAgICAgICBpZiAodGhpcy54ICsgdGhpcy53aWR0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnggKz0gdGhpcy53aWR0aDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgLy8gRHJhdyB0aGUgaW1hZ2UgbXVsdGlwbGUgdGltZXMgdG8gY292ZXIgdGhlIGNhbnZhcyBmb3Igc2VhbWxlc3Mgc2Nyb2xsaW5nXHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54ICsgdGhpcy53aWR0aCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgLy8gSWYgdGhlIHNjYWxlZCBpbWFnZSB3aWR0aCBpcyBsZXNzIHRoYW4gY2FudmFzIHdpZHRoLCBkcmF3IGEgdGhpcmQgZm9yIGZ1bGwgY292ZXJhZ2VcclxuICAgICAgICBpZiAodGhpcy53aWR0aCA8IHRoaXMuY2FudmFzV2lkdGggJiYgdGhpcy54ICsgMiAqIHRoaXMud2lkdGggPD0gdGhpcy5jYW52YXNXaWR0aCArICh0aGlzLnNwZWVkICogMTApKSB7IC8vIFNtYWxsIGJ1ZmZlciBmb3Igc21vb3RoIGxvb3BcclxuICAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54ICsgMiAqIHRoaXMud2lkdGgsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZGF0YSE6IEdhbWVEYXRhO1xyXG4gICAgcHJpdmF0ZSBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlciA9IG5ldyBBc3NldE1hbmFnZXIoKTtcclxuICAgIHByaXZhdGUgaW5wdXRIYW5kbGVyOiBJbnB1dEhhbmRsZXIgPSBuZXcgSW5wdXRIYW5kbGVyKCk7XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG4gICAgcHJpdmF0ZSBsYXN0VGltZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIHBsYXllciE6IFBsYXllcjtcclxuICAgIHByaXZhdGUgYmFja2dyb3VuZHM6IFBhcmFsbGF4QmFja2dyb3VuZFtdID0gW107XHJcbiAgICBwcml2YXRlIGdyb3VuZCE6IFBhcmFsbGF4QmFja2dyb3VuZDsgXHJcbiAgICBwcml2YXRlIG9ic3RhY2xlczogR2FtZU9iamVjdFtdID0gW107XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlczogR2FtZU9iamVjdFtdID0gW107XHJcblxyXG4gICAgcHJpdmF0ZSBvYnN0YWNsZVNwYXduVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlU3Bhd25UaW1lcjogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIGN1cnJlbnRCR006IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGNvbnRleHQgbm90IGZvdW5kIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEdhbWVEYXRhKCk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuY3R4LmltYWdlU21vb3RoaW5nRW5hYmxlZCA9IHRydWU7IC8vIEZvciBiZXR0ZXIgc2NhbGluZ1xyXG5cclxuICAgICAgICAvLyBMb2FkIGFzc2V0c1xyXG4gICAgICAgIGF3YWl0IHRoaXMuYXNzZXRNYW5hZ2VyLmxvYWQodGhpcy5kYXRhLmFzc2V0cyk7XHJcbiAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIub25SZWFkeSgoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQXNzZXRzIGxvYWRlZC4gVHJhbnNpdGlvbmluZyB0byBUSVRMRSBzdGF0ZS5cIik7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QkdNID0gdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlLCAwLjUpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGE6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBGYWxsYmFjayB0byBkZWZhdWx0IG9yIGVycm9yIHN0YXRlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5jbGVhcktleVByZXNzQ2FsbGJhY2tzKCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIub25LZXlQcmVzcygnU3BhY2UnLCB0aGlzLnN0YXJ0R2FtZSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIub25LZXlQcmVzcygnY2xpY2snLCB0aGlzLnN0YXJ0R2FtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5jbGVhcktleVByZXNzQ2FsbGJhY2tzKCk7XHJcbiAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRCR00/LnBhdXNlKCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QkdNID0gdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ21fZ2FtZScsIHRydWUsIDAuNSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lT3ZlciA9ICgpID0+IHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QkdNPy5wYXVzZSgpO1xyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X2dhbWVfb3ZlcicsIGZhbHNlLCAwLjcpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5jbGVhcktleVByZXNzQ2FsbGJhY2tzKCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIub25LZXlQcmVzcygnU3BhY2UnLCB0aGlzLnJldHVyblRvVGl0bGUpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLm9uS2V5UHJlc3MoJ2NsaWNrJywgdGhpcy5yZXR1cm5Ub1RpdGxlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJldHVyblRvVGl0bGUgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgdGhpcy5zZXR1cFRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QkdNPy5wYXVzZSgpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEJHTSA9IHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnYmdtX3RpdGxlJywgdHJ1ZSwgMC41KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZSgpIHtcclxuICAgICAgICBjb25zdCBncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgY29uc3QgcGxheWVySW1hZ2VSdW4gPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnY29va2llX3J1bicpITtcclxuICAgICAgICBjb25zdCBwbGF5ZXJJbWFnZUp1bXAgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnY29va2llX2p1bXAnKSE7XHJcbiAgICAgICAgY29uc3QgcGxheWVySW1hZ2VTbGlkZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdjb29raWVfc2xpZGUnKSE7XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZFkgPSBncy5jYW52YXNIZWlnaHQgKiAoMSAtIGdzLmdyb3VuZC55T2Zmc2V0KSAtIGdzLnBsYXllci5oZWlnaHQgKyBncy5wbGF5ZXIuZ3JvdW5kT2Zmc2V0WTtcclxuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgICAgICBncy5jYW52YXNXaWR0aCAqIDAuMSwgLy8gUGxheWVyIHN0YXJ0aW5nIFhcclxuICAgICAgICAgICAgcGxheWVyR3JvdW5kWSxcclxuICAgICAgICAgICAgZ3MucGxheWVyLndpZHRoLFxyXG4gICAgICAgICAgICBncy5wbGF5ZXIuaGVpZ2h0LFxyXG4gICAgICAgICAgICBwbGF5ZXJJbWFnZVJ1bixcclxuICAgICAgICAgICAgcGxheWVySW1hZ2VKdW1wLFxyXG4gICAgICAgICAgICBwbGF5ZXJJbWFnZVNsaWRlLFxyXG4gICAgICAgICAgICBncy5wbGF5ZXIubWF4SGVhbHRoLFxyXG4gICAgICAgICAgICBncy5wbGF5ZXIuaGl0SW52aW5jaWJpbGl0eUR1cmF0aW9uLFxyXG4gICAgICAgICAgICBncywgLy8gUGFzcyBnYW1lU2V0dGluZ3NcclxuICAgICAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIsIC8vIFBhc3MgaW5wdXRIYW5kbGVyXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyIC8vIFBhc3MgYXNzZXRNYW5hZ2VyXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kcyA9IGdzLmJhY2tncm91bmRzLm1hcChiZyA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKGJnLm5hbWUpITtcclxuICAgICAgICAgICAgY29uc3QgYmdIZWlnaHQgPSBncy5jYW52YXNIZWlnaHQgKiBiZy5oZWlnaHQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGFzcGVjdFJhdGlvID0gaW1nLndpZHRoIC8gaW1nLmhlaWdodDtcclxuICAgICAgICAgICAgY29uc3QgYmdXaWR0aCA9IGJnSGVpZ2h0ICogYXNwZWN0UmF0aW87IC8vIFNjYWxlIHdpZHRoIHRvIG1haW50YWluIGFzcGVjdCByYXRpbyB3aXRoIHNjYWxlZCBoZWlnaHRcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQYXJhbGxheEJhY2tncm91bmQoMCwgZ3MuY2FudmFzSGVpZ2h0ICogYmcueU9mZnNldCwgYmdXaWR0aCwgYmdIZWlnaHQsIGltZywgYmcuc3BlZWRNdWx0aXBsaWVyLCB0aGlzLmNhbnZhcy53aWR0aCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdyb3VuZEltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoZ3MuZ3JvdW5kLm5hbWUpITtcclxuICAgICAgICBjb25zdCBncm91bmRIZWlnaHQgPSBncy5jYW52YXNIZWlnaHQgKiBncy5ncm91bmQuaGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZFkgPSBncy5jYW52YXNIZWlnaHQgLSBncm91bmRIZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kV2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aCAqIChncm91bmRJbWFnZS53aWR0aCAvIGdyb3VuZEltYWdlLmhlaWdodCkgLyAodGhpcy5jYW52YXMuaGVpZ2h0IC8gZ3JvdW5kSGVpZ2h0KTsgLy8gTWFpbnRhaW4gYXNwZWN0IHJhdGlvIGJ1dCBtYWtlIHN1cmUgaXQgc2NhbGVzIGNvcnJlY3RseVxyXG4gICAgICAgIHRoaXMuZ3JvdW5kID0gbmV3IFBhcmFsbGF4QmFja2dyb3VuZCgwLCBncm91bmRZLCB0aGlzLmNhbnZhcy53aWR0aCwgZ3JvdW5kSGVpZ2h0LCBncm91bmRJbWFnZSwgMS4wLCB0aGlzLmNhbnZhcy53aWR0aCk7IC8vIEdyb3VuZCB3aWR0aCBlcXVhbCB0byBjYW52YXMgd2lkdGggdG8gc3RhcnQsIGl0IHdpbGwgdGlsZVxyXG4gICAgICAgIFxyXG5cclxuICAgICAgICB0aGlzLm9ic3RhY2xlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVzID0gW107XHJcbiAgICAgICAgdGhpcy5vYnN0YWNsZVNwYXduVGltZXIgPSBncy5vYnN0YWNsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyID0gZ3Mub2JzdGFjbGUubWluU3Bhd25JbnRlcnZhbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wID0gKGN1cnJlbnRUaW1lOiBudW1iZXIpID0+IHtcclxuICAgICAgICBpZiAoIXRoaXMubGFzdFRpbWUpIHRoaXMubGFzdFRpbWUgPSBjdXJyZW50VGltZTtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuTE9BRElORykge1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlckxvYWRpbmdTY3JlZW4oKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICBjb25zdCBncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgcGxheWVyXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgYmFja2dyb3VuZHMgYW5kIGdyb3VuZFxyXG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRzLmZvckVhY2goYmcgPT4gYmcudXBkYXRlKGRlbHRhVGltZSwgZ3MuZ2FtZVNwZWVkKSk7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTcGF3biBvYnN0YWNsZXNcclxuICAgICAgICAgICAgdGhpcy5vYnN0YWNsZVNwYXduVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5vYnN0YWNsZVNwYXduVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zcGF3bk9ic3RhY2xlKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA9IE1hdGgucmFuZG9tKCkgKiAoZ3Mub2JzdGFjbGUubWF4U3Bhd25JbnRlcnZhbCAtIGdzLm9ic3RhY2xlLm1pblNwYXduSW50ZXJ2YWwpICsgZ3Mub2JzdGFjbGUubWluU3Bhd25JbnRlcnZhbDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gU3Bhd24gY29sbGVjdGlibGVzXHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25Db2xsZWN0aWJsZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZVNwYXduVGltZXIgPSBNYXRoLnJhbmRvbSgpICogKGdzLmNvbGxlY3RpYmxlLm1heFNwYXduSW50ZXJ2YWwgLSBncy5jb2xsZWN0aWJsZS5taW5TcGF3bkludGVydmFsKSArIGdzLmNvbGxlY3RpYmxlLm1pblNwYXduSW50ZXJ2YWw7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBvYnN0YWNsZXNcclxuICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMuZm9yRWFjaChvYnN0YWNsZSA9PiBvYnN0YWNsZS51cGRhdGUoZGVsdGFUaW1lLCBncy5nYW1lU3BlZWQgKiBncy5vYnN0YWNsZS5zcGVlZE11bHRpcGxpZXIpKTtcclxuICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMgPSB0aGlzLm9ic3RhY2xlcy5maWx0ZXIob2JzdGFjbGUgPT4gIW9ic3RhY2xlLmlzT2Zmc2NyZWVuKHRoaXMuY2FudmFzLndpZHRoKSk7XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgY29sbGVjdGlibGVzXHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzLmZvckVhY2goY29sbGVjdGlibGUgPT4gY29sbGVjdGlibGUudXBkYXRlKGRlbHRhVGltZSwgZ3MuZ2FtZVNwZWVkICogZ3MuY29sbGVjdGlibGUuc3BlZWRNdWx0aXBsaWVyKSk7XHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzID0gdGhpcy5jb2xsZWN0aWJsZXMuZmlsdGVyKGNvbGxlY3RpYmxlID0+ICFjb2xsZWN0aWJsZS5pc09mZnNjcmVlbih0aGlzLmNhbnZhcy53aWR0aCkpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jaGVja0NvbGxpc2lvbnMoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYWRkU2NvcmUoZGVsdGFUaW1lICogMTApOyAvLyBDb250aW51b3VzIHNjb3JlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyTG9hZGluZ1NjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ0xvYWRpbmcgQXNzZXRzLi4uJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgICAgICBjb25zdCBwcm9ncmVzcyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldExvYWRQcm9ncmVzcygpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAkeyhwcm9ncmVzcyAqIDEwMCkudG9GaXhlZCgwKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNDApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRpdGxlQmcgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgndGl0bGVfYmFja2dyb3VuZCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRpdGxlQmcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UodGl0bGVCZywgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdsaWdodGJsdWUnO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkICR7dGhpcy5kYXRhLmdhbWVTZXR0aW5ncy51aS5zY29yZUZvbnRTaXplICogMS41fXB4IEFyaWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdDb29raWUgUnVubmVyJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnVpLnNjb3JlRm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1ByZXNzIFNQQUNFIG9yIFRBUCB0byBTdGFydCcsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IGJhY2tncm91bmRzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJhY2tncm91bmRzLmZvckVhY2goYmcgPT4gYmcuZHJhdyh0aGlzLmN0eCkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ncm91bmQuZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRHJhdyBvYnN0YWNsZXMgYW5kIGNvbGxlY3RpYmxlc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMuZm9yRWFjaChvYnN0YWNsZSA9PiBvYnN0YWNsZS5kcmF3KHRoaXMuY3R4KSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5mb3JFYWNoKGNvbGxlY3RpYmxlID0+IGNvbGxlY3RpYmxlLmRyYXcodGhpcy5jdHgpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IHBsYXllclxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRHJhdyBVSVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VUkoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgY29uc3QgZ2FtZU92ZXJCZyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdnYW1lX292ZXJfYmFja2dyb3VuZCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGdhbWVPdmVyQmcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoZ2FtZU92ZXJCZywgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdkYXJrcmVkJztcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCAke3RoaXMuZGF0YS5nYW1lU2V0dGluZ3MudWkuc2NvcmVGb250U2l6ZSAqIDEuNX1weCBBcmlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnR0FNRSBPVkVSJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnVpLnNjb3JlRm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNDT1JFOiAke01hdGguZmxvb3IodGhpcy5wbGF5ZXIuc2NvcmUpfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMi4yKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdQcmVzcyBTUEFDRSBvciBUQVAgdG8gcmV0dXJuIHRvIFRpdGxlJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAxLjgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1VJKCkge1xyXG4gICAgICAgIGNvbnN0IGdzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICAvLyBTY29yZVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke2dzLnVpLnNjb3JlRm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgU0NPUkU6ICR7TWF0aC5mbG9vcih0aGlzLnBsYXllci5zY29yZSl9YCwgMTAsIDMwKTtcclxuXHJcbiAgICAgICAgLy8gSGVhbHRoIEJhclxyXG4gICAgICAgIGNvbnN0IGhlYWx0aEJhclggPSB0aGlzLmNhbnZhcy53aWR0aCAtIGdzLnVpLmhlYWx0aEJhcldpZHRoIC0gMTA7XHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFyWSA9IDEwO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRIZWFsdGhXaWR0aCA9ICh0aGlzLnBsYXllci5oZWFsdGggLyBncy5wbGF5ZXIubWF4SGVhbHRoKSAqIGdzLnVpLmhlYWx0aEJhcldpZHRoO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZ3JheSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgZ3MudWkuaGVhbHRoQmFyV2lkdGgsIGdzLnVpLmhlYWx0aEJhckhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgY3VycmVudEhlYWx0aFdpZHRoLCBncy51aS5oZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KGhlYWx0aEJhclgsIGhlYWx0aEJhclksIGdzLnVpLmhlYWx0aEJhcldpZHRoLCBncy51aS5oZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3Bhd25PYnN0YWNsZSgpIHtcclxuICAgICAgICBjb25zdCBncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgY29uc3Qgb2JzdGFjbGVJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdvYnN0YWNsZV9zcGlrZScpO1xyXG4gICAgICAgIGlmICghb2JzdGFjbGVJbWFnZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJPYnN0YWNsZSBpbWFnZSBub3QgZm91bmQhXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBvYnN0YWNsZVkgPSBncy5jYW52YXNIZWlnaHQgKiAoMSAtIGdzLmdyb3VuZC55T2Zmc2V0KSAtIGdzLm9ic3RhY2xlLmhlaWdodDtcclxuICAgICAgICB0aGlzLm9ic3RhY2xlcy5wdXNoKG5ldyBHYW1lT2JqZWN0KHRoaXMuY2FudmFzLndpZHRoLCBvYnN0YWNsZVksIGdzLm9ic3RhY2xlLndpZHRoLCBncy5vYnN0YWNsZS5oZWlnaHQsIG9ic3RhY2xlSW1hZ2UpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduQ29sbGVjdGlibGUoKSB7XHJcbiAgICAgICAgY29uc3QgZ3MgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIGNvbnN0IGplbGx5SW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnamVsbHlfYmFzaWMnKTtcclxuICAgICAgICBpZiAoIWplbGx5SW1hZ2UpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiQ29sbGVjdGlibGUgaW1hZ2Ugbm90IGZvdW5kIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbWluSmVsbHlZID0gZ3MuY2FudmFzSGVpZ2h0ICogKDEgLSBncy5ncm91bmQueU9mZnNldCkgLSBncy5jb2xsZWN0aWJsZS5oZWlnaHQgKiAyO1xyXG4gICAgICAgIGNvbnN0IG1heEplbGx5WSA9IGdzLmNhbnZhc0hlaWdodCAqICgxIC0gZ3MuZ3JvdW5kLnlPZmZzZXQpIC0gZ3MuY29sbGVjdGlibGUuaGVpZ2h0ICogNDtcclxuICAgICAgICBjb25zdCBqZWxseVkgPSBNYXRoLnJhbmRvbSgpICogKG1pbkplbGx5WSAtIG1heEplbGx5WSkgKyBtYXhKZWxseVk7XHJcblxyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVzLnB1c2gobmV3IEdhbWVPYmplY3QodGhpcy5jYW52YXMud2lkdGgsIGplbGx5WSwgZ3MuY29sbGVjdGlibGUud2lkdGgsIGdzLmNvbGxlY3RpYmxlLmhlaWdodCwgamVsbHlJbWFnZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hlY2tDb2xsaXNpb25zKCkge1xyXG4gICAgICAgIC8vIFBsYXllciB2cyBPYnN0YWNsZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5vYnN0YWNsZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3Qgb2JzdGFjbGUgPSB0aGlzLm9ic3RhY2xlc1tpXTtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmlzQ29sbGlkaW5nKG9ic3RhY2xlKSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnBsYXllci5pc0ludmluY2libGUoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnRha2VEYW1hZ2UoMSk7IC8vIE9uZSBkYW1hZ2UgcGVyIGhpdFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X2hpdCcsIGZhbHNlLCAwLjcpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVPdmVyKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFBsYXllciB2cyBDb2xsZWN0aWJsZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5jb2xsZWN0aWJsZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgY29sbGVjdGlibGUgPSB0aGlzLmNvbGxlY3RpYmxlc1tpXTtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmlzQ29sbGlkaW5nKGNvbGxlY3RpYmxlKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYWRkU2NvcmUodGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5jb2xsZWN0aWJsZS5zY29yZVZhbHVlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzLnNwbGljZShpLCAxKTsgLy8gUmVtb3ZlIGNvbGxlY3RlZCBpdGVtXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9jb2xsZWN0JywgZmFsc2UsIDAuNSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEluaXRpYWxpemUgdGhlIGdhbWVcclxuY29uc3QgZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbmdhbWUuaW5pdCgpOyJdLAogICJtYXBwaW5ncyI6ICJBQWdFQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUpDLFNBQUFBO0FBQUEsR0FBQTtBQU9MLE1BQU0sYUFBYTtBQUFBLEVBQW5CO0FBQ0ksU0FBUSxTQUF3QyxvQkFBSSxJQUFJO0FBQ3hELFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQUN4RCxTQUFRLGNBQXNCO0FBQzlCLFNBQVEsZUFBdUI7QUFDL0IsU0FBUSxtQkFBbUMsQ0FBQztBQUFBO0FBQUEsRUFFNUMsTUFBTSxLQUFLLE1BQXlDO0FBQ2hELFNBQUssY0FBYyxLQUFLLE9BQU8sU0FBUyxLQUFLLE9BQU87QUFDcEQsUUFBSSxLQUFLLGdCQUFnQixHQUFHO0FBQ3hCLFdBQUssWUFBWTtBQUNqQjtBQUFBLElBQ0o7QUFFQSxVQUFNLGdCQUFnQixLQUFLLE9BQU8sSUFBSSxTQUFPLEtBQUssVUFBVSxJQUFJLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFDL0UsVUFBTSxnQkFBZ0IsS0FBSyxPQUFPLElBQUksU0FBTyxLQUFLLFVBQVUsSUFBSSxNQUFNLElBQUksSUFBSSxDQUFDO0FBRS9FLFVBQU0sUUFBUSxJQUFJLENBQUMsR0FBRyxlQUFlLEdBQUcsYUFBYSxDQUFDO0FBQ3RELFNBQUssWUFBWTtBQUFBLEVBQ3JCO0FBQUEsRUFFUSxVQUFVLE1BQWMsTUFBNkI7QUFDekQsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDcEMsWUFBTSxNQUFNLElBQUksTUFBTTtBQUN0QixVQUFJLE1BQU07QUFDVixVQUFJLFNBQVMsTUFBTTtBQUNmLGFBQUssT0FBTyxJQUFJLE1BQU0sR0FBRztBQUN6QixhQUFLO0FBQ0wsZ0JBQVE7QUFBQSxNQUNaO0FBQ0EsVUFBSSxVQUFVLE1BQU07QUFDaEIsZ0JBQVEsTUFBTSx5QkFBeUIsSUFBSSxFQUFFO0FBQzdDLGFBQUs7QUFDTCxnQkFBUTtBQUFBLE1BQ1o7QUFBQSxJQUNKLENBQUM7QUFBQSxFQUNMO0FBQUEsRUFFUSxVQUFVLE1BQWMsTUFBNkI7QUFDekQsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDcEMsWUFBTSxRQUFRLElBQUksTUFBTTtBQUN4QixZQUFNLE1BQU07QUFDWixZQUFNLFVBQVU7QUFDaEIsWUFBTSxtQkFBbUIsTUFBTTtBQUMzQixhQUFLLE9BQU8sSUFBSSxNQUFNLEtBQUs7QUFDM0IsYUFBSztBQUNMLGdCQUFRO0FBQUEsTUFDWjtBQUNBLFlBQU0sVUFBVSxNQUFNO0FBQ2xCLGdCQUFRLE1BQU0seUJBQXlCLElBQUksRUFBRTtBQUM3QyxhQUFLO0FBQ0wsZ0JBQVE7QUFBQSxNQUNaO0FBQUEsSUFDSixDQUFDO0FBQUEsRUFDTDtBQUFBLEVBRUEsU0FBUyxNQUE0QztBQUNqRCxXQUFPLEtBQUssT0FBTyxJQUFJLElBQUk7QUFBQSxFQUMvQjtBQUFBLEVBRUEsU0FBUyxNQUE0QztBQUNqRCxXQUFPLEtBQUssT0FBTyxJQUFJLElBQUk7QUFBQSxFQUMvQjtBQUFBLEVBRUEsVUFBVSxNQUFjLE9BQWdCLE9BQU8sUUFBK0M7QUFDMUYsVUFBTSxRQUFRLEtBQUssT0FBTyxJQUFJLElBQUk7QUFDbEMsUUFBSSxPQUFPO0FBQ1AsWUFBTSxRQUFRLE1BQU0sVUFBVSxJQUFJO0FBQ2xDLFlBQU0sT0FBTztBQUNiLFlBQU0sU0FBUyxXQUFXLFNBQVksU0FBUyxNQUFNO0FBQ3JELFlBQU0sS0FBSyxFQUFFLE1BQU0sT0FBSyxRQUFRLEtBQUssd0JBQXdCLElBQUksS0FBSyxDQUFDLENBQUM7QUFDeEUsYUFBTztBQUFBLElBQ1g7QUFDQSxXQUFPO0FBQUEsRUFDWDtBQUFBLEVBRUEsVUFBVSxjQUFnQztBQUN0QyxRQUFJLGNBQWM7QUFDZCxtQkFBYSxNQUFNO0FBQ25CLG1CQUFhLGNBQWM7QUFBQSxJQUMvQjtBQUFBLEVBQ0o7QUFBQSxFQUVBLGtCQUEwQjtBQUN0QixXQUFPLEtBQUssZ0JBQWdCLElBQUksSUFBSSxLQUFLLGVBQWUsS0FBSztBQUFBLEVBQ2pFO0FBQUEsRUFFQSxRQUFRLFVBQTRCO0FBQ2hDLFFBQUksS0FBSyxRQUFRLEdBQUc7QUFDaEIsZUFBUztBQUFBLElBQ2IsT0FBTztBQUNILFdBQUssaUJBQWlCLEtBQUssUUFBUTtBQUFBLElBQ3ZDO0FBQUEsRUFDSjtBQUFBLEVBRUEsVUFBbUI7QUFDZixXQUFPLEtBQUssaUJBQWlCLEtBQUs7QUFBQSxFQUN0QztBQUFBLEVBRVEsY0FBb0I7QUFDeEIsU0FBSyxpQkFBaUIsUUFBUSxjQUFZLFNBQVMsQ0FBQztBQUNwRCxTQUFLLG1CQUFtQixDQUFDO0FBQUEsRUFDN0I7QUFDSjtBQUVBLE1BQU0sYUFBYTtBQUFBLEVBSWYsY0FBYztBQUhkLFNBQVEsT0FBb0Isb0JBQUksSUFBSTtBQUNwQyxTQUFRLGlCQUEwQyxvQkFBSSxJQUFJO0FBUzFELFNBQVEsZ0JBQWdCLENBQUMsTUFBcUI7QUFDMUMsVUFBSSxDQUFDLEtBQUssS0FBSyxJQUFJLEVBQUUsSUFBSSxHQUFHO0FBQ3hCLGFBQUssS0FBSyxJQUFJLEVBQUUsSUFBSTtBQUNwQixhQUFLLGVBQWUsSUFBSSxFQUFFLElBQUksSUFBSTtBQUFBLE1BQ3RDO0FBQUEsSUFDSjtBQUVBLFNBQVEsY0FBYyxDQUFDLE1BQXFCO0FBQ3hDLFdBQUssS0FBSyxPQUFPLEVBQUUsSUFBSTtBQUFBLElBQzNCO0FBRUEsU0FBUSxjQUFjLENBQUMsTUFBa0I7QUFDckMsV0FBSyxlQUFlLElBQUksT0FBTyxJQUFJO0FBQUEsSUFDdkM7QUFFQSxTQUFRLG1CQUFtQixDQUFDLE1BQWtCO0FBQzFDLFFBQUUsZUFBZTtBQUNqQixXQUFLLGVBQWUsSUFBSSxPQUFPLElBQUk7QUFBQSxJQUN2QztBQXhCSSxXQUFPLGlCQUFpQixXQUFXLEtBQUssYUFBYTtBQUNyRCxXQUFPLGlCQUFpQixTQUFTLEtBQUssV0FBVztBQUNqRCxXQUFPLGlCQUFpQixTQUFTLEtBQUssV0FBVztBQUNqRCxXQUFPLGlCQUFpQixjQUFjLEtBQUssa0JBQWtCLEVBQUUsU0FBUyxNQUFNLENBQUM7QUFBQSxFQUNuRjtBQUFBLEVBc0JBLFVBQVUsS0FBc0I7QUFDNUIsV0FBTyxLQUFLLEtBQUssSUFBSSxHQUFHO0FBQUEsRUFDNUI7QUFBQSxFQUVBLFdBQVcsS0FBYSxVQUFzQjtBQUMxQyxTQUFLLGVBQWUsSUFBSSxLQUFLLFFBQVE7QUFBQSxFQUN6QztBQUFBLEVBRUEseUJBQXlCO0FBQ3JCLFNBQUssZUFBZSxNQUFNO0FBQUEsRUFDOUI7QUFDSjtBQUVBLE1BQU0sV0FBVztBQUFBLEVBQ2IsWUFDVyxHQUNBLEdBQ0EsT0FDQSxRQUNBLE9BQ0EsUUFBZ0IsR0FDekI7QUFOUztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBQSxFQUNSO0FBQUEsRUFFSCxPQUFPLFdBQW1CLFdBQW1CO0FBQ3pDLFNBQUssTUFBTSxLQUFLLFNBQVMsYUFBYTtBQUFBLEVBQzFDO0FBQUEsRUFFQSxLQUFLLEtBQStCO0FBQ2hDLFFBQUksVUFBVSxLQUFLLE9BQU8sS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsRUFDckU7QUFBQSxFQUVBLFlBQVksT0FBNEI7QUFDcEMsV0FDSSxLQUFLLElBQUksTUFBTSxJQUFJLE1BQU0sU0FDekIsS0FBSyxJQUFJLEtBQUssUUFBUSxNQUFNLEtBQzVCLEtBQUssSUFBSSxNQUFNLElBQUksTUFBTSxVQUN6QixLQUFLLElBQUksS0FBSyxTQUFTLE1BQU07QUFBQSxFQUVyQztBQUFBLEVBRUEsWUFBWSxhQUE4QjtBQUN0QyxXQUFPLEtBQUssSUFBSSxLQUFLLFFBQVE7QUFBQSxFQUNqQztBQUNKO0FBRUEsTUFBTSxlQUFlLFdBQVc7QUFBQTtBQUFBLEVBcUI1QixZQUNJLEdBQ0EsR0FDQSxPQUNBLFFBQ0EsVUFDUSxXQUNBLFlBQ1IsV0FDUSwwQkFDUixjQUNBLE9BQ0EsY0FDRjtBQUNFLFVBQU0sR0FBRyxHQUFHLE9BQU8sUUFBUSxRQUFRO0FBUjNCO0FBQ0E7QUFFQTtBQTdCWixTQUFRLFlBQW9CO0FBQzVCLFNBQVEsWUFBcUI7QUFDN0IsU0FBUSxZQUFxQjtBQUM3QixTQUFRLGFBQXFCO0FBQzdCLFNBQVEsd0JBQWdDO0FBQ3hDLFNBQVEsa0JBQTBCO0FBQ2xDLFNBQVEsZ0JBQXdCO0FBR2hDLFNBQU8sUUFBZ0I7QUFPdkIsU0FBUSxlQUF3QjtBQW1CNUIsU0FBSyxZQUFZO0FBQ2pCLFNBQUssU0FBUztBQUNkLFNBQUssZUFBZTtBQUNwQixTQUFLLFFBQVE7QUFDYixTQUFLLGVBQWU7QUFFcEIsU0FBSyxXQUFXLEtBQUssYUFBYSxPQUFPO0FBQ3pDLFNBQUssaUJBQWlCLEtBQUs7QUFBQSxFQUMvQjtBQUFBLEVBRUEsT0FBTyxXQUFtQixXQUFtQjtBQUN6QyxVQUFNLGlCQUFpQixLQUFLLE1BQU0sVUFBVSxPQUFPLEtBQUssS0FBSyxNQUFNLFVBQVUsT0FBTztBQUdwRixRQUFJLGtCQUFrQixLQUFLLGdCQUFnQixDQUFDLEtBQUssV0FBVztBQUN4RCxVQUFJLEtBQUssaUJBQWlCLEdBQUc7QUFDekIsYUFBSyxLQUFLLEtBQUssYUFBYSxPQUFPLFNBQVM7QUFDNUMsYUFBSyxhQUFhLFVBQVUsWUFBWSxPQUFPLEdBQUc7QUFDbEQsYUFBSztBQUNMLGFBQUssZUFBZTtBQUFBLE1BQ3hCO0FBQUEsSUFDSixXQUFXLENBQUMsZ0JBQWdCO0FBRXhCLFdBQUssZUFBZTtBQUFBLElBQ3hCO0FBR0EsUUFBSSxLQUFLLE1BQU0sVUFBVSxXQUFXLEdBQUc7QUFDbkMsVUFBSSxDQUFDLEtBQUssYUFBYSxDQUFDLEtBQUssV0FBVztBQUNwQyxhQUFLLE1BQU0sS0FBSyxhQUFhLE9BQU8sZUFBZSxLQUFLLGFBQWEsT0FBTyxNQUFNO0FBQ2xGLGFBQUssYUFBYSxVQUFVLGFBQWEsT0FBTyxHQUFHO0FBQUEsTUFDdkQ7QUFBQSxJQUNKO0FBR0EsU0FBSyxhQUFhLEtBQUssYUFBYSxVQUFVO0FBQzlDLFNBQUssS0FBSyxLQUFLLFlBQVk7QUFHM0IsUUFBSSxLQUFLLEtBQUssS0FBSyxXQUFXO0FBQzFCLFdBQUssSUFBSSxLQUFLO0FBQ2QsV0FBSyxZQUFZO0FBQ2pCLFdBQUssWUFBWTtBQUNqQixXQUFLLGlCQUFpQixLQUFLO0FBQUEsSUFDL0IsT0FBTztBQUNILFdBQUssWUFBWTtBQUFBLElBQ3JCO0FBR0EsUUFBSSxLQUFLLFdBQVc7QUFDaEIsV0FBSyxjQUFjO0FBQ25CLFVBQUksS0FBSyxjQUFjLEdBQUc7QUFDdEIsYUFBSyxZQUFZO0FBQ2pCLGFBQUssU0FBUyxLQUFLLGFBQWEsT0FBTztBQUFBLE1BQzNDO0FBQUEsSUFDSjtBQUdBLFFBQUksS0FBSyx3QkFBd0IsR0FBRztBQUNoQyxXQUFLLHlCQUF5QjtBQUFBLElBQ2xDO0FBR0EsUUFBSSxDQUFDLEtBQUssYUFBYSxDQUFDLEtBQUssV0FBVztBQUNwQyxXQUFLLG1CQUFtQixLQUFLLGtCQUFrQixLQUFLLGdCQUFnQixZQUFZLE1BQU07QUFDdEYsVUFBSSxLQUFLLE1BQU0sUUFBUSxLQUFLLGFBQWEsU0FBUyxZQUFZLEdBQUcsS0FBSztBQUNqRSxhQUFLLFFBQVEsS0FBSyxhQUFhLFNBQVMsWUFBWTtBQUFBLE1BQ3pEO0FBQUEsSUFDSixXQUFXLEtBQUssV0FBVztBQUN2QixXQUFLLFFBQVEsS0FBSztBQUFBLElBQ3RCLFdBQVcsS0FBSyxXQUFXO0FBQ3ZCLFdBQUssUUFBUSxLQUFLO0FBQUEsSUFDdEI7QUFBQSxFQUNKO0FBQUEsRUFFQSxLQUFLLEtBQStCO0FBQ2hDLFFBQUksS0FBSyx3QkFBd0IsS0FBSyxLQUFLLE1BQU0sS0FBSyx3QkFBd0IsRUFBRSxJQUFJLEdBQUc7QUFFbkY7QUFBQSxJQUNKO0FBQ0EsUUFBSSxVQUFVLEtBQUssT0FBTyxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssT0FBTyxLQUFLLE1BQU07QUFBQSxFQUNyRTtBQUFBLEVBRUEsS0FBSyxPQUFlO0FBR2hCLFNBQUssWUFBWTtBQUNqQixTQUFLLFlBQVksQ0FBQztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxNQUFNLFVBQWtCLGdCQUF3QjtBQUM1QyxRQUFJLENBQUMsS0FBSyxhQUFhLENBQUMsS0FBSyxXQUFXO0FBQ3BDLFdBQUssWUFBWTtBQUNqQixXQUFLLGFBQWE7QUFDbEIsV0FBSyxTQUFTLGlCQUFpQjtBQUFBLElBQ25DO0FBQUEsRUFDSjtBQUFBLEVBRUEsV0FBVyxRQUFnQjtBQUN2QixRQUFJLEtBQUsseUJBQXlCLEdBQUc7QUFDakMsV0FBSyxVQUFVO0FBQ2YsV0FBSyx3QkFBd0IsS0FBSztBQUFBLElBQ3RDO0FBQUEsRUFDSjtBQUFBLEVBRUEsU0FBUyxRQUFnQjtBQUNyQixTQUFLLFNBQVM7QUFBQSxFQUNsQjtBQUFBLEVBRUEsZUFBd0I7QUFDcEIsV0FBTyxLQUFLLHdCQUF3QjtBQUFBLEVBQ3hDO0FBQ0o7QUFFQSxNQUFNLDJCQUEyQixXQUFXO0FBQUEsRUFHeEMsWUFDSSxHQUFXLEdBQVcsT0FBZSxRQUNyQyxPQUF5QixPQUFlLGFBQzFDO0FBQ0UsVUFBTSxHQUFHLEdBQUcsT0FBTyxRQUFRLE9BQU8sS0FBSztBQUN2QyxTQUFLLGNBQWM7QUFBQSxFQUN2QjtBQUFBLEVBRUEsT0FBTyxXQUFtQixXQUFtQjtBQUN6QyxTQUFLLEtBQUssS0FBSyxRQUFRLFlBQVk7QUFFbkMsUUFBSSxLQUFLLElBQUksS0FBSyxTQUFTLEdBQUc7QUFDMUIsV0FBSyxLQUFLLEtBQUs7QUFHZixVQUFJLEtBQUssSUFBSSxLQUFLLFNBQVMsR0FBRztBQUMxQixhQUFLLEtBQUssS0FBSztBQUFBLE1BQ25CO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFBQSxFQUVBLEtBQUssS0FBK0I7QUFFaEMsUUFBSSxVQUFVLEtBQUssT0FBTyxLQUFLLEdBQUcsS0FBSyxHQUFHLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDakUsUUFBSSxVQUFVLEtBQUssT0FBTyxLQUFLLElBQUksS0FBSyxPQUFPLEtBQUssR0FBRyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBRTlFLFFBQUksS0FBSyxRQUFRLEtBQUssZUFBZSxLQUFLLElBQUksSUFBSSxLQUFLLFNBQVMsS0FBSyxjQUFlLEtBQUssUUFBUSxJQUFLO0FBQ2pHLFVBQUksVUFBVSxLQUFLLE9BQU8sS0FBSyxJQUFJLElBQUksS0FBSyxPQUFPLEtBQUssR0FBRyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsSUFDdkY7QUFBQSxFQUNKO0FBQ0o7QUFHQSxNQUFNLEtBQUs7QUFBQSxFQXFCUCxZQUFZLFVBQWtCO0FBakI5QixTQUFRLGVBQTZCLElBQUksYUFBYTtBQUN0RCxTQUFRLGVBQTZCLElBQUksYUFBYTtBQUV0RCxTQUFRLFlBQXVCO0FBQy9CLFNBQVEsV0FBbUI7QUFHM0IsU0FBUSxjQUFvQyxDQUFDO0FBRTdDLFNBQVEsWUFBMEIsQ0FBQztBQUNuQyxTQUFRLGVBQTZCLENBQUM7QUFFdEMsU0FBUSxxQkFBNkI7QUFDckMsU0FBUSx3QkFBZ0M7QUErQ3hDLFNBQVEsWUFBWSxNQUFNO0FBQ3RCLFdBQUssWUFBWTtBQUNqQixXQUFLLGFBQWEsdUJBQXVCO0FBQ3pDLFdBQUssVUFBVTtBQUNmLFdBQUssWUFBWSxNQUFNO0FBQ3ZCLFdBQUssYUFBYSxLQUFLLGFBQWEsVUFBVSxZQUFZLE1BQU0sR0FBRztBQUFBLElBQ3ZFO0FBRUEsU0FBUSxXQUFXLE1BQU07QUFDckIsV0FBSyxZQUFZO0FBQ2pCLFdBQUssWUFBWSxNQUFNO0FBQ3ZCLFdBQUssYUFBYSxVQUFVLGlCQUFpQixPQUFPLEdBQUc7QUFFdkQsV0FBSyxhQUFhLHVCQUF1QjtBQUN6QyxXQUFLLGFBQWEsV0FBVyxTQUFTLEtBQUssYUFBYTtBQUN4RCxXQUFLLGFBQWEsV0FBVyxTQUFTLEtBQUssYUFBYTtBQUFBLElBQzVEO0FBRUEsU0FBUSxnQkFBZ0IsTUFBTTtBQUMxQixXQUFLLFlBQVk7QUFDakIsV0FBSyxpQkFBaUI7QUFDdEIsV0FBSyxZQUFZLE1BQU07QUFDdkIsV0FBSyxhQUFhLEtBQUssYUFBYSxVQUFVLGFBQWEsTUFBTSxHQUFHO0FBQUEsSUFDeEU7QUE4Q0EsU0FBUSxXQUFXLENBQUMsZ0JBQXdCO0FBQ3hDLFVBQUksQ0FBQyxLQUFLLFNBQVUsTUFBSyxXQUFXO0FBQ3BDLFlBQU0sYUFBYSxjQUFjLEtBQUssWUFBWTtBQUNsRCxXQUFLLFdBQVc7QUFFaEIsVUFBSSxLQUFLLGNBQWMsaUJBQW1CO0FBQ3RDLGFBQUssb0JBQW9CO0FBQUEsTUFDN0IsT0FBTztBQUNILGFBQUssT0FBTyxTQUFTO0FBQ3JCLGFBQUssT0FBTztBQUFBLE1BQ2hCO0FBRUEsNEJBQXNCLEtBQUssUUFBUTtBQUFBLElBQ3ZDO0FBNUhJLFNBQUssU0FBUyxTQUFTLGVBQWUsUUFBUTtBQUM5QyxTQUFLLE1BQU0sS0FBSyxPQUFPLFdBQVcsSUFBSTtBQUN0QyxRQUFJLENBQUMsS0FBSyxLQUFLO0FBQ1gsY0FBUSxNQUFNLDJCQUEyQjtBQUN6QztBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUEsRUFFQSxNQUFNLE9BQU87QUFDVCxVQUFNLEtBQUssYUFBYTtBQUN4QixTQUFLLE9BQU8sUUFBUSxLQUFLLEtBQUssYUFBYTtBQUMzQyxTQUFLLE9BQU8sU0FBUyxLQUFLLEtBQUssYUFBYTtBQUM1QyxTQUFLLElBQUksd0JBQXdCO0FBR2pDLFVBQU0sS0FBSyxhQUFhLEtBQUssS0FBSyxLQUFLLE1BQU07QUFDN0MsU0FBSyxhQUFhLFFBQVEsTUFBTTtBQUM1QixjQUFRLElBQUksOENBQThDO0FBQzFELFdBQUssWUFBWTtBQUNqQixXQUFLLGlCQUFpQjtBQUN0QixXQUFLLGFBQWEsS0FBSyxhQUFhLFVBQVUsYUFBYSxNQUFNLEdBQUc7QUFBQSxJQUN4RSxDQUFDO0FBRUQsMEJBQXNCLEtBQUssUUFBUTtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxNQUFjLGVBQThCO0FBQ3hDLFFBQUk7QUFDQSxZQUFNLFdBQVcsTUFBTSxNQUFNLFdBQVc7QUFDeEMsV0FBSyxPQUFPLE1BQU0sU0FBUyxLQUFLO0FBQUEsSUFDcEMsU0FBUyxPQUFPO0FBQ1osY0FBUSxNQUFNLDZCQUE2QixLQUFLO0FBQUEsSUFFcEQ7QUFBQSxFQUNKO0FBQUEsRUFFUSxtQkFBbUI7QUFDdkIsU0FBSyxhQUFhLHVCQUF1QjtBQUN6QyxTQUFLLGFBQWEsV0FBVyxTQUFTLEtBQUssU0FBUztBQUNwRCxTQUFLLGFBQWEsV0FBVyxTQUFTLEtBQUssU0FBUztBQUFBLEVBQ3hEO0FBQUEsRUEyQlEsWUFBWTtBQUNoQixVQUFNLEtBQUssS0FBSyxLQUFLO0FBQ3JCLFVBQU0saUJBQWlCLEtBQUssYUFBYSxTQUFTLFlBQVk7QUFDOUQsVUFBTSxrQkFBa0IsS0FBSyxhQUFhLFNBQVMsYUFBYTtBQUNoRSxVQUFNLG1CQUFtQixLQUFLLGFBQWEsU0FBUyxjQUFjO0FBRWxFLFVBQU0sZ0JBQWdCLEdBQUcsZ0JBQWdCLElBQUksR0FBRyxPQUFPLFdBQVcsR0FBRyxPQUFPLFNBQVMsR0FBRyxPQUFPO0FBRS9GLFNBQUssU0FBUyxJQUFJO0FBQUEsTUFDZCxHQUFHLGNBQWM7QUFBQTtBQUFBLE1BQ2pCO0FBQUEsTUFDQSxHQUFHLE9BQU87QUFBQSxNQUNWLEdBQUcsT0FBTztBQUFBLE1BQ1Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsR0FBRyxPQUFPO0FBQUEsTUFDVixHQUFHLE9BQU87QUFBQSxNQUNWO0FBQUE7QUFBQSxNQUNBLEtBQUs7QUFBQTtBQUFBLE1BQ0wsS0FBSztBQUFBO0FBQUEsSUFDVDtBQUVBLFNBQUssY0FBYyxHQUFHLFlBQVksSUFBSSxRQUFNO0FBQ3hDLFlBQU0sTUFBTSxLQUFLLGFBQWEsU0FBUyxHQUFHLElBQUk7QUFDOUMsWUFBTSxXQUFXLEdBQUcsZUFBZSxHQUFHO0FBQ3RDLFlBQU0sY0FBYyxJQUFJLFFBQVEsSUFBSTtBQUNwQyxZQUFNLFVBQVUsV0FBVztBQUMzQixhQUFPLElBQUksbUJBQW1CLEdBQUcsR0FBRyxlQUFlLEdBQUcsU0FBUyxTQUFTLFVBQVUsS0FBSyxHQUFHLGlCQUFpQixLQUFLLE9BQU8sS0FBSztBQUFBLElBQ2hJLENBQUM7QUFFRCxVQUFNLGNBQWMsS0FBSyxhQUFhLFNBQVMsR0FBRyxPQUFPLElBQUk7QUFDN0QsVUFBTSxlQUFlLEdBQUcsZUFBZSxHQUFHLE9BQU87QUFDakQsVUFBTSxVQUFVLEdBQUcsZUFBZTtBQUNsQyxVQUFNLGNBQWMsS0FBSyxPQUFPLFNBQVMsWUFBWSxRQUFRLFlBQVksV0FBVyxLQUFLLE9BQU8sU0FBUztBQUN6RyxTQUFLLFNBQVMsSUFBSSxtQkFBbUIsR0FBRyxTQUFTLEtBQUssT0FBTyxPQUFPLGNBQWMsYUFBYSxHQUFLLEtBQUssT0FBTyxLQUFLO0FBR3JILFNBQUssWUFBWSxDQUFDO0FBQ2xCLFNBQUssZUFBZSxDQUFDO0FBQ3JCLFNBQUsscUJBQXFCLEdBQUcsU0FBUztBQUN0QyxTQUFLLHdCQUF3QixHQUFHLFNBQVM7QUFBQSxFQUM3QztBQUFBLEVBaUJRLE9BQU8sV0FBbUI7QUFDOUIsUUFBSSxLQUFLLGNBQWMsaUJBQW1CO0FBQ3RDLFlBQU0sS0FBSyxLQUFLLEtBQUs7QUFHckIsV0FBSyxPQUFPLE9BQU8sV0FBVyxHQUFHLFNBQVM7QUFDMUMsVUFBSSxLQUFLLE9BQU8sVUFBVSxHQUFHO0FBQ3pCLGFBQUssU0FBUztBQUNkO0FBQUEsTUFDSjtBQUdBLFdBQUssWUFBWSxRQUFRLFFBQU0sR0FBRyxPQUFPLFdBQVcsR0FBRyxTQUFTLENBQUM7QUFDakUsV0FBSyxPQUFPLE9BQU8sV0FBVyxHQUFHLFNBQVM7QUFHMUMsV0FBSyxzQkFBc0I7QUFDM0IsVUFBSSxLQUFLLHNCQUFzQixHQUFHO0FBQzlCLGFBQUssY0FBYztBQUNuQixhQUFLLHFCQUFxQixLQUFLLE9BQU8sS0FBSyxHQUFHLFNBQVMsbUJBQW1CLEdBQUcsU0FBUyxvQkFBb0IsR0FBRyxTQUFTO0FBQUEsTUFDMUg7QUFHQSxXQUFLLHlCQUF5QjtBQUM5QixVQUFJLEtBQUsseUJBQXlCLEdBQUc7QUFDakMsYUFBSyxpQkFBaUI7QUFDdEIsYUFBSyx3QkFBd0IsS0FBSyxPQUFPLEtBQUssR0FBRyxZQUFZLG1CQUFtQixHQUFHLFlBQVksb0JBQW9CLEdBQUcsWUFBWTtBQUFBLE1BQ3RJO0FBR0EsV0FBSyxVQUFVLFFBQVEsY0FBWSxTQUFTLE9BQU8sV0FBVyxHQUFHLFlBQVksR0FBRyxTQUFTLGVBQWUsQ0FBQztBQUN6RyxXQUFLLFlBQVksS0FBSyxVQUFVLE9BQU8sY0FBWSxDQUFDLFNBQVMsWUFBWSxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBRzNGLFdBQUssYUFBYSxRQUFRLGlCQUFlLFlBQVksT0FBTyxXQUFXLEdBQUcsWUFBWSxHQUFHLFlBQVksZUFBZSxDQUFDO0FBQ3JILFdBQUssZUFBZSxLQUFLLGFBQWEsT0FBTyxpQkFBZSxDQUFDLFlBQVksWUFBWSxLQUFLLE9BQU8sS0FBSyxDQUFDO0FBRXZHLFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssT0FBTyxTQUFTLFlBQVksRUFBRTtBQUFBLElBQ3ZDO0FBQUEsRUFDSjtBQUFBLEVBRVEsc0JBQXNCO0FBQzFCLFNBQUssSUFBSSxVQUFVLEdBQUcsR0FBRyxLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sTUFBTTtBQUM5RCxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFDN0QsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMscUJBQXFCLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsQ0FBQztBQUNwRixVQUFNLFdBQVcsS0FBSyxhQUFhLGdCQUFnQjtBQUNuRCxTQUFLLElBQUksU0FBUyxJQUFJLFdBQVcsS0FBSyxRQUFRLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBQUEsRUFDM0c7QUFBQSxFQUVRLFNBQVM7QUFDYixTQUFLLElBQUksVUFBVSxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFFOUQsWUFBUSxLQUFLLFdBQVc7QUFBQSxNQUNwQixLQUFLO0FBQ0QsY0FBTSxVQUFVLEtBQUssYUFBYSxTQUFTLGtCQUFrQjtBQUM3RCxZQUFJLFNBQVM7QUFDVCxlQUFLLElBQUksVUFBVSxTQUFTLEdBQUcsR0FBRyxLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sTUFBTTtBQUFBLFFBQzNFLE9BQU87QUFDSCxlQUFLLElBQUksWUFBWTtBQUNyQixlQUFLLElBQUksU0FBUyxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFBQSxRQUNqRTtBQUNBLGFBQUssSUFBSSxZQUFZO0FBQ3JCLGFBQUssSUFBSSxZQUFZO0FBQ3JCLGFBQUssSUFBSSxPQUFPLFFBQVEsS0FBSyxLQUFLLGFBQWEsR0FBRyxnQkFBZ0IsR0FBRztBQUNyRSxhQUFLLElBQUksU0FBUyxpQkFBaUIsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxDQUFDO0FBQ2hGLGFBQUssSUFBSSxPQUFPLEdBQUcsS0FBSyxLQUFLLGFBQWEsR0FBRyxhQUFhO0FBQzFELGFBQUssSUFBSSxTQUFTLCtCQUErQixLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLENBQUM7QUFDOUY7QUFBQSxNQUVKLEtBQUs7QUFFRCxhQUFLLFlBQVksUUFBUSxRQUFNLEdBQUcsS0FBSyxLQUFLLEdBQUcsQ0FBQztBQUNoRCxhQUFLLE9BQU8sS0FBSyxLQUFLLEdBQUc7QUFHekIsYUFBSyxVQUFVLFFBQVEsY0FBWSxTQUFTLEtBQUssS0FBSyxHQUFHLENBQUM7QUFDMUQsYUFBSyxhQUFhLFFBQVEsaUJBQWUsWUFBWSxLQUFLLEtBQUssR0FBRyxDQUFDO0FBR25FLGFBQUssT0FBTyxLQUFLLEtBQUssR0FBRztBQUd6QixhQUFLLE9BQU87QUFDWjtBQUFBLE1BRUosS0FBSztBQUNELGNBQU0sYUFBYSxLQUFLLGFBQWEsU0FBUyxzQkFBc0I7QUFDcEUsWUFBSSxZQUFZO0FBQ1osZUFBSyxJQUFJLFVBQVUsWUFBWSxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFBQSxRQUM5RSxPQUFPO0FBQ0gsZUFBSyxJQUFJLFlBQVk7QUFDckIsZUFBSyxJQUFJLFNBQVMsR0FBRyxHQUFHLEtBQUssT0FBTyxPQUFPLEtBQUssT0FBTyxNQUFNO0FBQUEsUUFDakU7QUFDQSxhQUFLLElBQUksWUFBWTtBQUNyQixhQUFLLElBQUksWUFBWTtBQUNyQixhQUFLLElBQUksT0FBTyxRQUFRLEtBQUssS0FBSyxhQUFhLEdBQUcsZ0JBQWdCLEdBQUc7QUFDckUsYUFBSyxJQUFJLFNBQVMsYUFBYSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLENBQUM7QUFDNUUsYUFBSyxJQUFJLE9BQU8sR0FBRyxLQUFLLEtBQUssYUFBYSxHQUFHLGFBQWE7QUFDMUQsYUFBSyxJQUFJLFNBQVMsVUFBVSxLQUFLLE1BQU0sS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsR0FBRztBQUM1RyxhQUFLLElBQUksU0FBUyx5Q0FBeUMsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxHQUFHO0FBQzFHO0FBQUEsSUFDUjtBQUFBLEVBQ0o7QUFBQSxFQUVRLFNBQVM7QUFDYixVQUFNLEtBQUssS0FBSyxLQUFLO0FBRXJCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxPQUFPLEdBQUcsR0FBRyxHQUFHLGFBQWE7QUFDdEMsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsVUFBVSxLQUFLLE1BQU0sS0FBSyxPQUFPLEtBQUssQ0FBQyxJQUFJLElBQUksRUFBRTtBQUduRSxVQUFNLGFBQWEsS0FBSyxPQUFPLFFBQVEsR0FBRyxHQUFHLGlCQUFpQjtBQUM5RCxVQUFNLGFBQWE7QUFDbkIsVUFBTSxxQkFBc0IsS0FBSyxPQUFPLFNBQVMsR0FBRyxPQUFPLFlBQWEsR0FBRyxHQUFHO0FBRTlFLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLFlBQVksWUFBWSxHQUFHLEdBQUcsZ0JBQWdCLEdBQUcsR0FBRyxlQUFlO0FBQ3JGLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLFlBQVksWUFBWSxvQkFBb0IsR0FBRyxHQUFHLGVBQWU7QUFDbkYsU0FBSyxJQUFJLGNBQWM7QUFDdkIsU0FBSyxJQUFJLFdBQVcsWUFBWSxZQUFZLEdBQUcsR0FBRyxnQkFBZ0IsR0FBRyxHQUFHLGVBQWU7QUFBQSxFQUMzRjtBQUFBLEVBRVEsZ0JBQWdCO0FBQ3BCLFVBQU0sS0FBSyxLQUFLLEtBQUs7QUFDckIsVUFBTSxnQkFBZ0IsS0FBSyxhQUFhLFNBQVMsZ0JBQWdCO0FBQ2pFLFFBQUksQ0FBQyxlQUFlO0FBQ2hCLGNBQVEsS0FBSywyQkFBMkI7QUFDeEM7QUFBQSxJQUNKO0FBRUEsVUFBTSxZQUFZLEdBQUcsZ0JBQWdCLElBQUksR0FBRyxPQUFPLFdBQVcsR0FBRyxTQUFTO0FBQzFFLFNBQUssVUFBVSxLQUFLLElBQUksV0FBVyxLQUFLLE9BQU8sT0FBTyxXQUFXLEdBQUcsU0FBUyxPQUFPLEdBQUcsU0FBUyxRQUFRLGFBQWEsQ0FBQztBQUFBLEVBQzFIO0FBQUEsRUFFUSxtQkFBbUI7QUFDdkIsVUFBTSxLQUFLLEtBQUssS0FBSztBQUNyQixVQUFNLGFBQWEsS0FBSyxhQUFhLFNBQVMsYUFBYTtBQUMzRCxRQUFJLENBQUMsWUFBWTtBQUNiLGNBQVEsS0FBSyw4QkFBOEI7QUFDM0M7QUFBQSxJQUNKO0FBRUEsVUFBTSxZQUFZLEdBQUcsZ0JBQWdCLElBQUksR0FBRyxPQUFPLFdBQVcsR0FBRyxZQUFZLFNBQVM7QUFDdEYsVUFBTSxZQUFZLEdBQUcsZ0JBQWdCLElBQUksR0FBRyxPQUFPLFdBQVcsR0FBRyxZQUFZLFNBQVM7QUFDdEYsVUFBTSxTQUFTLEtBQUssT0FBTyxLQUFLLFlBQVksYUFBYTtBQUV6RCxTQUFLLGFBQWEsS0FBSyxJQUFJLFdBQVcsS0FBSyxPQUFPLE9BQU8sUUFBUSxHQUFHLFlBQVksT0FBTyxHQUFHLFlBQVksUUFBUSxVQUFVLENBQUM7QUFBQSxFQUM3SDtBQUFBLEVBRVEsa0JBQWtCO0FBRXRCLGFBQVMsSUFBSSxLQUFLLFVBQVUsU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQ2pELFlBQU0sV0FBVyxLQUFLLFVBQVUsQ0FBQztBQUNqQyxVQUFJLEtBQUssT0FBTyxZQUFZLFFBQVEsR0FBRztBQUNuQyxZQUFJLENBQUMsS0FBSyxPQUFPLGFBQWEsR0FBRztBQUM3QixlQUFLLE9BQU8sV0FBVyxDQUFDO0FBQ3hCLGVBQUssYUFBYSxVQUFVLFdBQVcsT0FBTyxHQUFHO0FBQ2pELGNBQUksS0FBSyxPQUFPLFVBQVUsR0FBRztBQUN6QixpQkFBSyxTQUFTO0FBQ2Q7QUFBQSxVQUNKO0FBQUEsUUFDSjtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBR0EsYUFBUyxJQUFJLEtBQUssYUFBYSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDcEQsWUFBTSxjQUFjLEtBQUssYUFBYSxDQUFDO0FBQ3ZDLFVBQUksS0FBSyxPQUFPLFlBQVksV0FBVyxHQUFHO0FBQ3RDLGFBQUssT0FBTyxTQUFTLEtBQUssS0FBSyxhQUFhLFlBQVksVUFBVTtBQUNsRSxhQUFLLGFBQWEsT0FBTyxHQUFHLENBQUM7QUFDN0IsYUFBSyxhQUFhLFVBQVUsZUFBZSxPQUFPLEdBQUc7QUFBQSxNQUN6RDtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQ0o7QUFHQSxNQUFNLE9BQU8sSUFBSSxLQUFLLFlBQVk7QUFDbEMsS0FBSyxLQUFLOyIsCiAgIm5hbWVzIjogWyJHYW1lU3RhdGUiXQp9Cg==
