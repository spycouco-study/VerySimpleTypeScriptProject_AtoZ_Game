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
    this.originalY = y;
    this.health = maxHealth;
    this.gameSettings = gameSettings;
    this.input = input;
    this.assetManager = assetManager;
  }
  update(deltaTime, gameSpeed) {
    if (this.input.isKeyDown("Space") || this.input.isKeyDown("click")) {
      if (!this.isJumping && !this.isSliding) {
        this.jump(this.gameSettings.player.jumpForce);
        this.assetManager.playSound("sfx_jump", false, 0.5);
      }
    } else if (this.input.isKeyDown("ArrowDown")) {
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
    if (!this.isJumping && !this.isSliding) {
      this.isJumping = true;
      this.velocityY = -force;
    }
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
    this.collectibleSpawnTimer = gs.collectible.minSpawnInterval;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgZ2FtZVNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgZ3Jhdml0eTogbnVtYmVyO1xyXG4gICAgICAgIHBsYXllcjoge1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICAgICAganVtcEZvcmNlOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNsaWRlRHVyYXRpb246IG51bWJlcjtcclxuICAgICAgICAgICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGhpdEludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgICAgICAgICBncm91bmRPZmZzZXRZOiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kIGxpbmVcclxuICAgICAgICB9O1xyXG4gICAgICAgIG9ic3RhY2xlOiB7XHJcbiAgICAgICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgICAgICBtaW5TcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICAgICAgICAgIG1heFNwYXduSW50ZXJ2YWw6IG51bWJlcjtcclxuICAgICAgICAgICAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXMgZ2FtZVNwZWVkXHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb2xsZWN0aWJsZToge1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICAgICAgbWluU3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgICAgICAgICBtYXhTcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNjb3JlVmFsdWU6IG51bWJlcjtcclxuICAgICAgICAgICAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXMgZ2FtZVNwZWVkXHJcbiAgICAgICAgfTtcclxuICAgICAgICBiYWNrZ3JvdW5kczogQXJyYXk8e1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xyXG4gICAgICAgICAgICB5T2Zmc2V0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodFxyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjsgLy8gJSBvZiBjYW52YXMgaGVpZ2h0XHJcbiAgICAgICAgfT47XHJcbiAgICAgICAgZ3JvdW5kOiB7XHJcbiAgICAgICAgICAgIG5hbWU6IHN0cmluZztcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodFxyXG4gICAgICAgICAgICB5T2Zmc2V0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodCBmcm9tIGJvdHRvbVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdWk6IHtcclxuICAgICAgICAgICAgc2NvcmVGb250U2l6ZTogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWFsdGhCYXJXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWFsdGhCYXJIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogQXJyYXk8e1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHBhdGg6IHN0cmluZztcclxuICAgICAgICAgICAgd2lkdGg6IG51bWJlcjsgLy8gT3JpZ2luYWwgd2lkdGhcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7IC8vIE9yaWdpbmFsIGhlaWdodFxyXG4gICAgICAgIH0+O1xyXG4gICAgICAgIHNvdW5kczogQXJyYXk8e1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHBhdGg6IHN0cmluZztcclxuICAgICAgICAgICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xyXG4gICAgICAgICAgICB2b2x1bWU6IG51bWJlcjtcclxuICAgICAgICB9PjtcclxuICAgIH07XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcsXHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRBc3NldHM6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG9uUmVhZHlDYWxsYmFja3M6ICgoKSA9PiB2b2lkKVtdID0gW107XHJcblxyXG4gICAgYXN5bmMgbG9hZChkYXRhOiBHYW1lRGF0YVsnYXNzZXRzJ10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLnRvdGFsQXNzZXRzID0gZGF0YS5pbWFnZXMubGVuZ3RoICsgZGF0YS5zb3VuZHMubGVuZ3RoO1xyXG4gICAgICAgIGlmICh0aGlzLnRvdGFsQXNzZXRzID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubm90aWZ5UmVhZHkoKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGRhdGEuaW1hZ2VzLm1hcChpbWcgPT4gdGhpcy5sb2FkSW1hZ2UoaW1nLm5hbWUsIGltZy5wYXRoKSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IGRhdGEuc291bmRzLm1hcChzbmQgPT4gdGhpcy5sb2FkU291bmQoc25kLm5hbWUsIHNuZC5wYXRoKSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgdGhpcy5ub3RpZnlSZWFkeSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBwYXRoO1xyXG4gICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pbWFnZXMuc2V0KG5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke3BhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrOyAvLyBTdGlsbCBjb3VudCB0byBhdm9pZCBibG9ja2luZ1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGFueXdheSB0byBjb250aW51ZSBsb2FkaW5nIG90aGVyIGFzc2V0c1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgYXVkaW8uc3JjID0gcGF0aDtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJzsgLy8gUHJlbG9hZCB0aGUgYXVkaW9cclxuICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChuYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7cGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQXNzZXRzKys7IC8vIFN0aWxsIGNvdW50IHRvIGF2b2lkIGJsb2NraW5nXHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgYW55d2F5IHRvIGNvbnRpbnVlIGxvYWRpbmcgb3RoZXIgYXNzZXRzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0SW1hZ2UobmFtZTogc3RyaW5nKTogSFRNTEltYWdlRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRTb3VuZChuYW1lOiBzdHJpbmcpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSwgdm9sdW1lPzogbnVtYmVyKTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgY29uc3Qgc291bmQgPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKHNvdW5kKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gc291bmQuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNsb25lLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSB2b2x1bWUgIT09IHVuZGVmaW5lZCA/IHZvbHVtZSA6IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBGYWlsZWQgdG8gcGxheSBzb3VuZCAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICAgICAgcmV0dXJuIGNsb25lO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIHN0b3BTb3VuZChhdWRpb0VsZW1lbnQ6IEhUTUxBdWRpb0VsZW1lbnQpIHtcclxuICAgICAgICBpZiAoYXVkaW9FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIGF1ZGlvRWxlbWVudC5wYXVzZSgpO1xyXG4gICAgICAgICAgICBhdWRpb0VsZW1lbnQuY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBnZXRMb2FkUHJvZ3Jlc3MoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50b3RhbEFzc2V0cyA9PT0gMCA/IDEgOiB0aGlzLmxvYWRlZEFzc2V0cyAvIHRoaXMudG90YWxBc3NldHM7XHJcbiAgICB9XHJcblxyXG4gICAgb25SZWFkeShjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmlzUmVhZHkoKSkge1xyXG4gICAgICAgICAgICBjYWxsYmFjaygpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMub25SZWFkeUNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaXNSZWFkeSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5sb2FkZWRBc3NldHMgPT09IHRoaXMudG90YWxBc3NldHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBub3RpZnlSZWFkeSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm9uUmVhZHlDYWxsYmFja3MuZm9yRWFjaChjYWxsYmFjayA9PiBjYWxsYmFjaygpKTtcclxuICAgICAgICB0aGlzLm9uUmVhZHlDYWxsYmFja3MgPSBbXTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgSW5wdXRIYW5kbGVyIHtcclxuICAgIHByaXZhdGUga2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIHByZXNzQ2FsbGJhY2tzOiBNYXA8c3RyaW5nLCAoKSA9PiB2b2lkPiA9IG5ldyBNYXAoKTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bik7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5oYW5kbGVLZXlVcCk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDbGljayk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCB0aGlzLmhhbmRsZVRvdWNoU3RhcnQsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlEb3duID0gKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcclxuICAgICAgICBpZiAoIXRoaXMua2V5cy5oYXMoZS5jb2RlKSkgeyAvLyBPbmx5IHRyaWdnZXIgb24gZmlyc3QgcHJlc3NcclxuICAgICAgICAgICAgdGhpcy5rZXlzLmFkZChlLmNvZGUpO1xyXG4gICAgICAgICAgICB0aGlzLnByZXNzQ2FsbGJhY2tzLmdldChlLmNvZGUpPy4oKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlVcCA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgdGhpcy5rZXlzLmRlbGV0ZShlLmNvZGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlc3NDYWxsYmFja3MuZ2V0KCdjbGljaycpPy4oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZVRvdWNoU3RhcnQgPSAoZTogVG91Y2hFdmVudCkgPT4ge1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBkZWZhdWx0IHRvdWNoIGJlaGF2aW9yIGxpa2Ugc2Nyb2xsaW5nXHJcbiAgICAgICAgdGhpcy5wcmVzc0NhbGxiYWNrcy5nZXQoJ2NsaWNrJyk/LigpOyAvLyBUcmVhdCB0b3VjaCBhcyBhIGNsaWNrXHJcbiAgICB9XHJcblxyXG4gICAgaXNLZXlEb3duKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMua2V5cy5oYXMoa2V5KTtcclxuICAgIH1cclxuXHJcbiAgICBvbktleVByZXNzKGtleTogc3RyaW5nLCBjYWxsYmFjazogKCkgPT4gdm9pZCkge1xyXG4gICAgICAgIHRoaXMucHJlc3NDYWxsYmFja3Muc2V0KGtleSwgY2FsbGJhY2spO1xyXG4gICAgfVxyXG5cclxuICAgIGNsZWFyS2V5UHJlc3NDYWxsYmFja3MoKSB7XHJcbiAgICAgICAgdGhpcy5wcmVzc0NhbGxiYWNrcy5jbGVhcigpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHB1YmxpYyB4OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIHk6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgd2lkdGg6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgaGVpZ2h0OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LFxyXG4gICAgICAgIHB1YmxpYyBzcGVlZDogbnVtYmVyID0gMFxyXG4gICAgKSB7fVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggLT0gKHRoaXMuc3BlZWQgfHwgZ2FtZVNwZWVkKSAqIGRlbHRhVGltZTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIGlzQ29sbGlkaW5nKG90aGVyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgdGhpcy54IDwgb3RoZXIueCArIG90aGVyLndpZHRoICYmXHJcbiAgICAgICAgICAgIHRoaXMueCArIHRoaXMud2lkdGggPiBvdGhlci54ICYmXHJcbiAgICAgICAgICAgIHRoaXMueSA8IG90aGVyLnkgKyBvdGhlci5oZWlnaHQgJiZcclxuICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgPiBvdGhlci55XHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBpc09mZnNjcmVlbihjYW52YXNXaWR0aDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMueCArIHRoaXMud2lkdGggPCAwO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHByaXZhdGUgdmVsb2NpdHlZOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBpc0p1bXBpbmc6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgaXNTbGlkaW5nOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIHNsaWRlVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGhpdEludmluY2liaWxpdHlUaW1lcjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY3VycmVudFJ1bkZyYW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBydW5GcmFtZVNwZWVkOiBudW1iZXIgPSAwLjE7IC8vIEFuaW1hdGlvbiBzcGVlZCBmb3IgcnVubmluZyBjb29raWVcclxuXHJcbiAgICBwdWJsaWMgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwdWJsaWMgb3JpZ2luYWxZOiBudW1iZXI7XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lU2V0dGluZ3M6IEdhbWVEYXRhWydnYW1lU2V0dGluZ3MnXTtcclxuICAgIHByaXZhdGUgaW5wdXQ6IElucHV0SGFuZGxlcjtcclxuICAgIHByaXZhdGUgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgeDogbnVtYmVyLFxyXG4gICAgICAgIHk6IG51bWJlcixcclxuICAgICAgICB3aWR0aDogbnVtYmVyLFxyXG4gICAgICAgIGhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIGltYWdlUnVuOiBIVE1MSW1hZ2VFbGVtZW50LFxyXG4gICAgICAgIHByaXZhdGUgaW1hZ2VKdW1wOiBIVE1MSW1hZ2VFbGVtZW50LFxyXG4gICAgICAgIHByaXZhdGUgaW1hZ2VTbGlkZTogSFRNTEltYWdlRWxlbWVudCxcclxuICAgICAgICBtYXhIZWFsdGg6IG51bWJlcixcclxuICAgICAgICBwcml2YXRlIGhpdEludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyLFxyXG4gICAgICAgIGdhbWVTZXR0aW5nczogR2FtZURhdGFbJ2dhbWVTZXR0aW5ncyddLFxyXG4gICAgICAgIGlucHV0OiBJbnB1dEhhbmRsZXIsXHJcbiAgICAgICAgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXJcclxuICAgICkge1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGltYWdlUnVuKTtcclxuICAgICAgICB0aGlzLm9yaWdpbmFsWSA9IHk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBtYXhIZWFsdGg7XHJcbiAgICAgICAgdGhpcy5nYW1lU2V0dGluZ3MgPSBnYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgdGhpcy5pbnB1dCA9IGlucHV0O1xyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyID0gYXNzZXRNYW5hZ2VyO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICAvLyBIYW5kbGUgaW5wdXQgZm9yIGp1bXAvc2xpZGVcclxuICAgICAgICBpZiAodGhpcy5pbnB1dC5pc0tleURvd24oJ1NwYWNlJykgfHwgdGhpcy5pbnB1dC5pc0tleURvd24oJ2NsaWNrJykpIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzSnVtcGluZyAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuanVtcCh0aGlzLmdhbWVTZXR0aW5ncy5wbGF5ZXIuanVtcEZvcmNlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X2p1bXAnLCBmYWxzZSwgMC41KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5pbnB1dC5pc0tleURvd24oJ0Fycm93RG93bicpKSB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5pc0p1bXBpbmcgJiYgIXRoaXMuaXNTbGlkaW5nKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNsaWRlKHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5zbGlkZUR1cmF0aW9uLCB0aGlzLmdhbWVTZXR0aW5ncy5wbGF5ZXIuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X3NsaWRlJywgZmFsc2UsIDAuNSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGdyYXZpdHlcclxuICAgICAgICB0aGlzLnZlbG9jaXR5WSArPSB0aGlzLmdhbWVTZXR0aW5ncy5ncmF2aXR5ICogZGVsdGFUaW1lO1xyXG4gICAgICAgIHRoaXMueSArPSB0aGlzLnZlbG9jaXR5WSAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIGNvbGxpc2lvblxyXG4gICAgICAgIGlmICh0aGlzLnkgPj0gdGhpcy5vcmlnaW5hbFkpIHtcclxuICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5vcmlnaW5hbFk7XHJcbiAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZID0gMDtcclxuICAgICAgICAgICAgdGhpcy5pc0p1bXBpbmcgPSBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNsaWRlIHRpbWVyXHJcbiAgICAgICAgaWYgKHRoaXMuaXNTbGlkaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2xpZGVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnNsaWRlVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pc1NsaWRpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLmhlaWdodDsgLy8gUmVzdG9yZSBvcmlnaW5hbCBoZWlnaHRcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSW52aW5jaWJpbGl0eSB0aW1lclxyXG4gICAgICAgIGlmICh0aGlzLmhpdEludmluY2liaWxpdHlUaW1lciA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5oaXRJbnZpbmNpYmlsaXR5VGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGFuaW1hdGlvbiBmcmFtZSBmb3IgcnVubmluZ1xyXG4gICAgICAgIGlmICghdGhpcy5pc0p1bXBpbmcgJiYgIXRoaXMuaXNTbGlkaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFJ1bkZyYW1lID0gKHRoaXMuY3VycmVudFJ1bkZyYW1lICsgdGhpcy5ydW5GcmFtZVNwZWVkICogZGVsdGFUaW1lICogNjApICUgMjsgLy8gU2ltcGxlIDItZnJhbWUgYW5pbWF0aW9uXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmltYWdlLnNyYyAhPT0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2Nvb2tpZV9ydW4nKT8uc3JjKSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdjb29raWVfcnVuJykhO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzSnVtcGluZykge1xyXG4gICAgICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5pbWFnZUp1bXA7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5pbWFnZVNsaWRlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyID4gMCAmJiBNYXRoLmZsb29yKHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyICogMTApICUgMikge1xyXG4gICAgICAgICAgICAvLyBCbGluayBlZmZlY3QgZHVyaW5nIGludmluY2liaWxpdHlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAganVtcChmb3JjZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzSnVtcGluZyAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy5pc0p1bXBpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IC1mb3JjZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc2xpZGUoZHVyYXRpb246IG51bWJlciwgb3JpZ2luYWxIZWlnaHQ6IG51bWJlcikge1xyXG4gICAgICAgIGlmICghdGhpcy5pc0p1bXBpbmcgJiYgIXRoaXMuaXNTbGlkaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNTbGlkaW5nID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5zbGlkZVRpbWVyID0gZHVyYXRpb247XHJcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gb3JpZ2luYWxIZWlnaHQgKiAwLjU7IC8vIEhhbGYgaGVpZ2h0IHdoaWxlIHNsaWRpbmdcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShhbW91bnQ6IG51bWJlcikge1xyXG4gICAgICAgIGlmICh0aGlzLmhpdEludmluY2liaWxpdHlUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGVhbHRoIC09IGFtb3VudDtcclxuICAgICAgICAgICAgdGhpcy5oaXRJbnZpbmNpYmlsaXR5VGltZXIgPSB0aGlzLmhpdEludmluY2liaWxpdHlEdXJhdGlvbjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYWRkU2NvcmUoYW1vdW50OiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNjb3JlICs9IGFtb3VudDtcclxuICAgIH1cclxuXHJcbiAgICBpc0ludmluY2libGUoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyID4gMDtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUGFyYWxsYXhCYWNrZ3JvdW5kIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBwcml2YXRlIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LCBzcGVlZDogbnVtYmVyLCBjYW52YXNXaWR0aDogbnVtYmVyXHJcbiAgICApIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZSwgc3BlZWQpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzV2lkdGggPSBjYW52YXNXaWR0aDtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWVTcGVlZDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54IC09IHRoaXMuc3BlZWQgKiBnYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IGltYWdlIGhhcyBzY3JvbGxlZCBvZmYtc2NyZWVuXHJcbiAgICAgICAgaWYgKHRoaXMueCArIHRoaXMud2lkdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gdGhpcy53aWR0aDsgLy8gTW92ZSBpdCB0byB0aGUgcmlnaHQgb2YgdGhlIHNlY29uZCBpbWFnZSB0byBjcmVhdGUgYSBsb29wXHJcbiAgICAgICAgICAgIC8vIFRvIGVuc3VyZSBzZWFtbGVzc25lc3MgaWYgZ2FtZVNwZWVkIGlzIGhpZ2ggYW5kIGZyYW1lIHJhdGUgbG93LFxyXG4gICAgICAgICAgICAvLyB3ZSBtaWdodCBuZWVkIHRvIGFkanVzdCBieSBhbm90aGVyIHdpZHRoIGlmIGl0IGp1bXBzIHRvbyBmYXJcclxuICAgICAgICAgICAgaWYgKHRoaXMueCArIHRoaXMud2lkdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMud2lkdGg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIC8vIERyYXcgdGhlIGltYWdlIG11bHRpcGxlIHRpbWVzIHRvIGNvdmVyIHRoZSBjYW52YXMgZm9yIHNlYW1sZXNzIHNjcm9sbGluZ1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCArIHRoaXMud2lkdGgsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIC8vIElmIHRoZSBzY2FsZWQgaW1hZ2Ugd2lkdGggaXMgbGVzcyB0aGFuIGNhbnZhcyB3aWR0aCwgZHJhdyBhIHRoaXJkIGZvciBmdWxsIGNvdmVyYWdlXHJcbiAgICAgICAgaWYgKHRoaXMud2lkdGggPCB0aGlzLmNhbnZhc1dpZHRoICYmIHRoaXMueCArIDIgKiB0aGlzLndpZHRoIDw9IHRoaXMuY2FudmFzV2lkdGggKyAodGhpcy5zcGVlZCAqIDEwKSkgeyAvLyBTbWFsbCBidWZmZXIgZm9yIHNtb290aCBsb29wXHJcbiAgICAgICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCArIDIgKiB0aGlzLndpZHRoLCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGRhdGEhOiBHYW1lRGF0YTtcclxuICAgIHByaXZhdGUgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIgPSBuZXcgQXNzZXRNYW5hZ2VyKCk7XHJcbiAgICBwcml2YXRlIGlucHV0SGFuZGxlcjogSW5wdXRIYW5kbGVyID0gbmV3IElucHV0SGFuZGxlcigpO1xyXG5cclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5ZXIhOiBQbGF5ZXI7XHJcbiAgICBwcml2YXRlIGJhY2tncm91bmRzOiBQYXJhbGxheEJhY2tncm91bmRbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBncm91bmQhOiBQYXJhbGxheEJhY2tncm91bmQ7IFxyXG4gICAgcHJpdmF0ZSBvYnN0YWNsZXM6IEdhbWVPYmplY3RbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBjb2xsZWN0aWJsZXM6IEdhbWVPYmplY3RbXSA9IFtdO1xyXG5cclxuICAgIHByaXZhdGUgb2JzdGFjbGVTcGF3blRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjb2xsZWN0aWJsZVNwYXduVGltZXI6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBjdXJyZW50QkdNOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG4gICAgICAgIGlmICghdGhpcy5jdHgpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBjb250ZXh0IG5vdCBmb3VuZCFcIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRHYW1lRGF0YSgpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuICAgICAgICB0aGlzLmN0eC5pbWFnZVNtb290aGluZ0VuYWJsZWQgPSB0cnVlOyAvLyBGb3IgYmV0dGVyIHNjYWxpbmdcclxuXHJcbiAgICAgICAgLy8gTG9hZCBhc3NldHNcclxuICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TWFuYWdlci5sb2FkKHRoaXMuZGF0YS5hc3NldHMpO1xyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLm9uUmVhZHkoKCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkFzc2V0cyBsb2FkZWQuIFRyYW5zaXRpb25pbmcgdG8gVElUTEUgc3RhdGUuXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgdGhpcy5zZXR1cFRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEJHTSA9IHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnYmdtX3RpdGxlJywgdHJ1ZSwgMC41KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEdhbWVEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhOicsIGVycm9yKTtcclxuICAgICAgICAgICAgLy8gRmFsbGJhY2sgdG8gZGVmYXVsdCBvciBlcnJvciBzdGF0ZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwVGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIuY2xlYXJLZXlQcmVzc0NhbGxiYWNrcygpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLm9uS2V5UHJlc3MoJ1NwYWNlJywgdGhpcy5zdGFydEdhbWUpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLm9uS2V5UHJlc3MoJ2NsaWNrJywgdGhpcy5zdGFydEdhbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIuY2xlYXJLZXlQcmVzc0NhbGxiYWNrcygpO1xyXG4gICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QkdNPy5wYXVzZSgpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEJHTSA9IHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnYmdtX2dhbWUnLCB0cnVlLCAwLjUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEJHTT8ucGF1c2UoKTtcclxuICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9nYW1lX292ZXInLCBmYWxzZSwgMC43KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIuY2xlYXJLZXlQcmVzc0NhbGxiYWNrcygpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLm9uS2V5UHJlc3MoJ1NwYWNlJywgdGhpcy5yZXR1cm5Ub1RpdGxlKTtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5vbktleVByZXNzKCdjbGljaycsIHRoaXMucmV0dXJuVG9UaXRsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXR1cm5Ub1RpdGxlID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgIHRoaXMuc2V0dXBUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEJHTT8ucGF1c2UoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRCR00gPSB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2JnbV90aXRsZScsIHRydWUsIDAuNSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNldEdhbWUoKSB7XHJcbiAgICAgICAgY29uc3QgZ3MgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckltYWdlUnVuID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2Nvb2tpZV9ydW4nKSE7XHJcbiAgICAgICAgY29uc3QgcGxheWVySW1hZ2VKdW1wID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2Nvb2tpZV9qdW1wJykhO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckltYWdlU2xpZGUgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnY29va2llX3NsaWRlJykhO1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJHcm91bmRZID0gZ3MuY2FudmFzSGVpZ2h0ICogKDEgLSBncy5ncm91bmQueU9mZnNldCkgLSBncy5wbGF5ZXIuaGVpZ2h0ICsgZ3MucGxheWVyLmdyb3VuZE9mZnNldFk7XHJcblxyXG4gICAgICAgIHRoaXMucGxheWVyID0gbmV3IFBsYXllcihcclxuICAgICAgICAgICAgZ3MuY2FudmFzV2lkdGggKiAwLjEsIC8vIFBsYXllciBzdGFydGluZyBYXHJcbiAgICAgICAgICAgIHBsYXllckdyb3VuZFksXHJcbiAgICAgICAgICAgIGdzLnBsYXllci53aWR0aCxcclxuICAgICAgICAgICAgZ3MucGxheWVyLmhlaWdodCxcclxuICAgICAgICAgICAgcGxheWVySW1hZ2VSdW4sXHJcbiAgICAgICAgICAgIHBsYXllckltYWdlSnVtcCxcclxuICAgICAgICAgICAgcGxheWVySW1hZ2VTbGlkZSxcclxuICAgICAgICAgICAgZ3MucGxheWVyLm1heEhlYWx0aCxcclxuICAgICAgICAgICAgZ3MucGxheWVyLmhpdEludmluY2liaWxpdHlEdXJhdGlvbixcclxuICAgICAgICAgICAgZ3MsIC8vIFBhc3MgZ2FtZVNldHRpbmdzXHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLCAvLyBQYXNzIGlucHV0SGFuZGxlclxyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlciAvLyBQYXNzIGFzc2V0TWFuYWdlclxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZHMgPSBncy5iYWNrZ3JvdW5kcy5tYXAoYmcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWcgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShiZy5uYW1lKSE7XHJcbiAgICAgICAgICAgIGNvbnN0IGJnSGVpZ2h0ID0gZ3MuY2FudmFzSGVpZ2h0ICogYmcuaGVpZ2h0O1xyXG4gICAgICAgICAgICBjb25zdCBhc3BlY3RSYXRpbyA9IGltZy53aWR0aCAvIGltZy5oZWlnaHQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGJnV2lkdGggPSBiZ0hlaWdodCAqIGFzcGVjdFJhdGlvOyAvLyBTY2FsZSB3aWR0aCB0byBtYWludGFpbiBhc3BlY3QgcmF0aW8gd2l0aCBzY2FsZWQgaGVpZ2h0XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUGFyYWxsYXhCYWNrZ3JvdW5kKDAsIGdzLmNhbnZhc0hlaWdodCAqIGJnLnlPZmZzZXQsIGJnV2lkdGgsIGJnSGVpZ2h0LCBpbWcsIGJnLnNwZWVkTXVsdGlwbGllciwgdGhpcy5jYW52YXMud2lkdGgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBncm91bmRJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKGdzLmdyb3VuZC5uYW1lKSE7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kSGVpZ2h0ID0gZ3MuY2FudmFzSGVpZ2h0ICogZ3MuZ3JvdW5kLmhlaWdodDtcclxuICAgICAgICBjb25zdCBncm91bmRZID0gZ3MuY2FudmFzSGVpZ2h0IC0gZ3JvdW5kSGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZFdpZHRoID0gdGhpcy5jYW52YXMud2lkdGggKiAoZ3JvdW5kSW1hZ2Uud2lkdGggLyBncm91bmRJbWFnZS5oZWlnaHQpIC8gKHRoaXMuY2FudmFzLmhlaWdodCAvIGdyb3VuZEhlaWdodCk7IC8vIE1haW50YWluIGFzcGVjdCByYXRpbyBidXQgbWFrZSBzdXJlIGl0IHNjYWxlcyBjb3JyZWN0bHlcclxuICAgICAgICB0aGlzLmdyb3VuZCA9IG5ldyBQYXJhbGxheEJhY2tncm91bmQoMCwgZ3JvdW5kWSwgdGhpcy5jYW52YXMud2lkdGgsIGdyb3VuZEhlaWdodCwgZ3JvdW5kSW1hZ2UsIDEuMCwgdGhpcy5jYW52YXMud2lkdGgpOyAvLyBHcm91bmQgd2lkdGggZXF1YWwgdG8gY2FudmFzIHdpZHRoIHRvIHN0YXJ0LCBpdCB3aWxsIHRpbGVcclxuICAgICAgICBcclxuXHJcbiAgICAgICAgdGhpcy5vYnN0YWNsZXMgPSBbXTtcclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMub2JzdGFjbGVTcGF3blRpbWVyID0gZ3Mub2JzdGFjbGUubWluU3Bhd25JbnRlcnZhbDtcclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA9IGdzLmNvbGxlY3RpYmxlLm1pblNwYXduSW50ZXJ2YWw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCA9IChjdXJyZW50VGltZTogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxhc3RUaW1lKSB0aGlzLmxhc3RUaW1lID0gY3VycmVudFRpbWU7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwOyAvLyBDb252ZXJ0IHRvIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkxPQURJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJMb2FkaW5nU2NyZWVuKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgY29uc3QgZ3MgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzO1xyXG5cclxuICAgICAgICAgICAgLy8gVXBkYXRlIHBsYXllclxyXG4gICAgICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCBncy5nYW1lU3BlZWQpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gVXBkYXRlIGJhY2tncm91bmRzIGFuZCBncm91bmRcclxuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kcy5mb3JFYWNoKGJnID0+IGJnLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCkpO1xyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZC51cGRhdGUoZGVsdGFUaW1lLCBncy5nYW1lU3BlZWQpO1xyXG5cclxuICAgICAgICAgICAgLy8gU3Bhd24gb2JzdGFjbGVzXHJcbiAgICAgICAgICAgIHRoaXMub2JzdGFjbGVTcGF3blRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMub2JzdGFjbGVTcGF3blRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25PYnN0YWNsZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vYnN0YWNsZVNwYXduVGltZXIgPSBNYXRoLnJhbmRvbSgpICogKGdzLm9ic3RhY2xlLm1heFNwYXduSW50ZXJ2YWwgLSBncy5vYnN0YWNsZS5taW5TcGF3bkludGVydmFsKSArIGdzLm9ic3RhY2xlLm1pblNwYXduSW50ZXJ2YWw7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFNwYXduIGNvbGxlY3RpYmxlc1xyXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNwYXduQ29sbGVjdGlibGUoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyID0gTWF0aC5yYW5kb20oKSAqIChncy5jb2xsZWN0aWJsZS5tYXhTcGF3bkludGVydmFsIC0gZ3MuY29sbGVjdGlibGUubWluU3Bhd25JbnRlcnZhbCkgKyBncy5jb2xsZWN0aWJsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgb2JzdGFjbGVzXHJcbiAgICAgICAgICAgIHRoaXMub2JzdGFjbGVzLmZvckVhY2gob2JzdGFjbGUgPT4gb2JzdGFjbGUudXBkYXRlKGRlbHRhVGltZSwgZ3MuZ2FtZVNwZWVkICogZ3Mub2JzdGFjbGUuc3BlZWRNdWx0aXBsaWVyKSk7XHJcbiAgICAgICAgICAgIHRoaXMub2JzdGFjbGVzID0gdGhpcy5vYnN0YWNsZXMuZmlsdGVyKG9ic3RhY2xlID0+ICFvYnN0YWNsZS5pc09mZnNjcmVlbih0aGlzLmNhbnZhcy53aWR0aCkpO1xyXG5cclxuICAgICAgICAgICAgLy8gVXBkYXRlIGNvbGxlY3RpYmxlc1xyXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5mb3JFYWNoKGNvbGxlY3RpYmxlID0+IGNvbGxlY3RpYmxlLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCAqIGdzLmNvbGxlY3RpYmxlLnNwZWVkTXVsdGlwbGllcikpO1xyXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcyA9IHRoaXMuY29sbGVjdGlibGVzLmZpbHRlcihjb2xsZWN0aWJsZSA9PiAhY29sbGVjdGlibGUuaXNPZmZzY3JlZW4odGhpcy5jYW52YXMud2lkdGgpKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2hlY2tDb2xsaXNpb25zKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLmFkZFNjb3JlKGRlbHRhVGltZSAqIDEwKTsgLy8gQ29udGludW91cyBzY29yZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlckxvYWRpbmdTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdMb2FkaW5nIEFzc2V0cy4uLicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgY29uc3QgcHJvZ3Jlc3MgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRMb2FkUHJvZ3Jlc3MoKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHsocHJvZ3Jlc3MgKiAxMDApLnRvRml4ZWQoMCl9JWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDQwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aXRsZUJnID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ3RpdGxlX2JhY2tncm91bmQnKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aXRsZUJnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRpdGxlQmcsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnbGlnaHRibHVlJztcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCAke3RoaXMuZGF0YS5nYW1lU2V0dGluZ3MudWkuc2NvcmVGb250U2l6ZSAqIDEuNX1weCBBcmlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnQ29va2llIFJ1bm5lcicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gYCR7dGhpcy5kYXRhLmdhbWVTZXR0aW5ncy51aS5zY29yZUZvbnRTaXplfXB4IEFyaWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdQcmVzcyBTUEFDRSBvciBUQVAgdG8gU3RhcnQnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgLy8gRHJhdyBiYWNrZ3JvdW5kc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kcy5mb3JFYWNoKGJnID0+IGJnLmRyYXcodGhpcy5jdHgpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ3JvdW5kLmRyYXcodGhpcy5jdHgpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIERyYXcgb2JzdGFjbGVzIGFuZCBjb2xsZWN0aWJsZXNcclxuICAgICAgICAgICAgICAgIHRoaXMub2JzdGFjbGVzLmZvckVhY2gob2JzdGFjbGUgPT4gb2JzdGFjbGUuZHJhdyh0aGlzLmN0eCkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMuZm9yRWFjaChjb2xsZWN0aWJsZSA9PiBjb2xsZWN0aWJsZS5kcmF3KHRoaXMuY3R4KSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRHJhdyBwbGF5ZXJcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmRyYXcodGhpcy5jdHgpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIERyYXcgVUlcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1VJKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdhbWVPdmVyQmcgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnZ2FtZV9vdmVyX2JhY2tncm91bmQnKTtcclxuICAgICAgICAgICAgICAgIGlmIChnYW1lT3ZlckJnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGdhbWVPdmVyQmcsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZGFya3JlZCc7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gYGJvbGQgJHt0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnVpLnNjb3JlRm9udFNpemUgKiAxLjV9cHggQXJpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ0dBTUUgT1ZFUicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gYCR7dGhpcy5kYXRhLmdhbWVTZXR0aW5ncy51aS5zY29yZUZvbnRTaXplfXB4IEFyaWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBTQ09SRTogJHtNYXRoLmZsb29yKHRoaXMucGxheWVyLnNjb3JlKX1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIuMik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnUHJlc3MgU1BBQ0Ugb3IgVEFQIHRvIHJldHVybiB0byBUaXRsZScsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMS44KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdVSSgpIHtcclxuICAgICAgICBjb25zdCBncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgLy8gU2NvcmVcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHtncy51aS5zY29yZUZvbnRTaXplfXB4IEFyaWFsYDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNDT1JFOiAke01hdGguZmxvb3IodGhpcy5wbGF5ZXIuc2NvcmUpfWAsIDEwLCAzMCk7XHJcblxyXG4gICAgICAgIC8vIEhlYWx0aCBCYXJcclxuICAgICAgICBjb25zdCBoZWFsdGhCYXJYID0gdGhpcy5jYW52YXMud2lkdGggLSBncy51aS5oZWFsdGhCYXJXaWR0aCAtIDEwO1xyXG4gICAgICAgIGNvbnN0IGhlYWx0aEJhclkgPSAxMDtcclxuICAgICAgICBjb25zdCBjdXJyZW50SGVhbHRoV2lkdGggPSAodGhpcy5wbGF5ZXIuaGVhbHRoIC8gZ3MucGxheWVyLm1heEhlYWx0aCkgKiBncy51aS5oZWFsdGhCYXJXaWR0aDtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2dyYXknO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGhlYWx0aEJhclgsIGhlYWx0aEJhclksIGdzLnVpLmhlYWx0aEJhcldpZHRoLCBncy51aS5oZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZWQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGhlYWx0aEJhclgsIGhlYWx0aEJhclksIGN1cnJlbnRIZWFsdGhXaWR0aCwgZ3MudWkuaGVhbHRoQmFySGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBncy51aS5oZWFsdGhCYXJXaWR0aCwgZ3MudWkuaGVhbHRoQmFySGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduT2JzdGFjbGUoKSB7XHJcbiAgICAgICAgY29uc3QgZ3MgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIGNvbnN0IG9ic3RhY2xlSW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnb2JzdGFjbGVfc3Bpa2UnKTtcclxuICAgICAgICBpZiAoIW9ic3RhY2xlSW1hZ2UpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiT2JzdGFjbGUgaW1hZ2Ugbm90IGZvdW5kIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgb2JzdGFjbGVZID0gZ3MuY2FudmFzSGVpZ2h0ICogKDEgLSBncy5ncm91bmQueU9mZnNldCkgLSBncy5vYnN0YWNsZS5oZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5vYnN0YWNsZXMucHVzaChuZXcgR2FtZU9iamVjdCh0aGlzLmNhbnZhcy53aWR0aCwgb2JzdGFjbGVZLCBncy5vYnN0YWNsZS53aWR0aCwgZ3Mub2JzdGFjbGUuaGVpZ2h0LCBvYnN0YWNsZUltYWdlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzcGF3bkNvbGxlY3RpYmxlKCkge1xyXG4gICAgICAgIGNvbnN0IGdzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBjb25zdCBqZWxseUltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2plbGx5X2Jhc2ljJyk7XHJcbiAgICAgICAgaWYgKCFqZWxseUltYWdlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIkNvbGxlY3RpYmxlIGltYWdlIG5vdCBmb3VuZCFcIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG1pbkplbGx5WSA9IGdzLmNhbnZhc0hlaWdodCAqICgxIC0gZ3MuZ3JvdW5kLnlPZmZzZXQpIC0gZ3MuY29sbGVjdGlibGUuaGVpZ2h0ICogMjtcclxuICAgICAgICBjb25zdCBtYXhKZWxseVkgPSBncy5jYW52YXNIZWlnaHQgKiAoMSAtIGdzLmdyb3VuZC55T2Zmc2V0KSAtIGdzLmNvbGxlY3RpYmxlLmhlaWdodCAqIDQ7XHJcbiAgICAgICAgY29uc3QgamVsbHlZID0gTWF0aC5yYW5kb20oKSAqIChtaW5KZWxseVkgLSBtYXhKZWxseVkpICsgbWF4SmVsbHlZO1xyXG5cclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5wdXNoKG5ldyBHYW1lT2JqZWN0KHRoaXMuY2FudmFzLndpZHRoLCBqZWxseVksIGdzLmNvbGxlY3RpYmxlLndpZHRoLCBncy5jb2xsZWN0aWJsZS5oZWlnaHQsIGplbGx5SW1hZ2UpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrQ29sbGlzaW9ucygpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgdnMgT2JzdGFjbGVzXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMub2JzdGFjbGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG9ic3RhY2xlID0gdGhpcy5vYnN0YWNsZXNbaV07XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5pc0NvbGxpZGluZyhvYnN0YWNsZSkpIHtcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5wbGF5ZXIuaXNJbnZpbmNpYmxlKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci50YWtlRGFtYWdlKDEpOyAvLyBPbmUgZGFtYWdlIHBlciBoaXRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9oaXQnLCBmYWxzZSwgMC43KTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgdnMgQ29sbGVjdGlibGVzXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMuY29sbGVjdGlibGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbGxlY3RpYmxlID0gdGhpcy5jb2xsZWN0aWJsZXNbaV07XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5pc0NvbGxpZGluZyhjb2xsZWN0aWJsZSkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmFkZFNjb3JlKHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY29sbGVjdGlibGUuc2NvcmVWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5zcGxpY2UoaSwgMSk7IC8vIFJlbW92ZSBjb2xsZWN0ZWQgaXRlbVxyXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZnhfY29sbGVjdCcsIGZhbHNlLCAwLjUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBJbml0aWFsaXplIHRoZSBnYW1lXHJcbmNvbnN0IGdhbWUgPSBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG5nYW1lLmluaXQoKTsiXSwKICAibWFwcGluZ3MiOiAiQUErREEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFKQyxTQUFBQTtBQUFBLEdBQUE7QUFPTCxNQUFNLGFBQWE7QUFBQSxFQUFuQjtBQUNJLFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQUN4RCxTQUFRLFNBQXdDLG9CQUFJLElBQUk7QUFDeEQsU0FBUSxjQUFzQjtBQUM5QixTQUFRLGVBQXVCO0FBQy9CLFNBQVEsbUJBQW1DLENBQUM7QUFBQTtBQUFBLEVBRTVDLE1BQU0sS0FBSyxNQUF5QztBQUNoRCxTQUFLLGNBQWMsS0FBSyxPQUFPLFNBQVMsS0FBSyxPQUFPO0FBQ3BELFFBQUksS0FBSyxnQkFBZ0IsR0FBRztBQUN4QixXQUFLLFlBQVk7QUFDakI7QUFBQSxJQUNKO0FBRUEsVUFBTSxnQkFBZ0IsS0FBSyxPQUFPLElBQUksU0FBTyxLQUFLLFVBQVUsSUFBSSxNQUFNLElBQUksSUFBSSxDQUFDO0FBQy9FLFVBQU0sZ0JBQWdCLEtBQUssT0FBTyxJQUFJLFNBQU8sS0FBSyxVQUFVLElBQUksTUFBTSxJQUFJLElBQUksQ0FBQztBQUUvRSxVQUFNLFFBQVEsSUFBSSxDQUFDLEdBQUcsZUFBZSxHQUFHLGFBQWEsQ0FBQztBQUN0RCxTQUFLLFlBQVk7QUFBQSxFQUNyQjtBQUFBLEVBRVEsVUFBVSxNQUFjLE1BQTZCO0FBQ3pELFdBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3BDLFlBQU0sTUFBTSxJQUFJ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
