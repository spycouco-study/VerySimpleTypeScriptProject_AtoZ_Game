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
  // Total allowed jumps
  constructor(x, y, width, height, imageRun1, imageJump, imageSlide, maxHealth, hitInvincibilityDuration, gameSettings, input, assetManager) {
    super(x, y, width, height, imageRun1);
    this.imageJump = imageJump;
    this.imageSlide = imageSlide;
    this.hitInvincibilityDuration = hitInvincibilityDuration;
    this.velocityY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.hitInvincibilityTimer = 0;
    this.currentRunFrame = 0;
    // Current frame index for running animation (0 or 1)
    this.runAnimationTimer = 0;
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
      this.runAnimationTimer = 0;
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
      this.runAnimationTimer += deltaTime;
      if (this.runAnimationTimer >= this.gameSettings.player.runAnimationSpeed / 2) {
        this.runAnimationTimer = 0;
        this.currentRunFrame = (this.currentRunFrame + 1) % 2;
      }
      let currentRunImage;
      if (this.currentRunFrame === 0) {
        currentRunImage = this.assetManager.getImage("cookie_run_1");
      } else {
        currentRunImage = this.assetManager.getImage("cookie_run_2");
      }
      if (this.image !== currentRunImage) {
        this.image = currentRunImage;
      }
    } else if (this.isJumping) {
      if (this.image !== this.imageJump) {
        this.image = this.imageJump;
      }
    } else if (this.isSliding) {
      if (this.image !== this.imageSlide) {
        this.image = this.imageSlide;
      }
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
      this.hitInvincibilityTimer = this.gameSettings.player.hitInvincibilityDuration;
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
    const playerImageRun1 = this.assetManager.getImage("cookie_run_1");
    const playerImageJump = this.assetManager.getImage("cookie_jump");
    const playerImageSlide = this.assetManager.getImage("cookie_slide");
    const playerGroundY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.player.height + gs.player.groundOffsetY;
    this.player = new Player(
      gs.canvasWidth * 0.1,
      // Player starting X
      playerGroundY,
      gs.player.width,
      gs.player.height,
      playerImageRun1,
      // Pass the first run frame
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgZ2FtZVNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgZ3Jhdml0eTogbnVtYmVyO1xyXG4gICAgICAgIHBsYXllcjoge1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICAgICAganVtcEZvcmNlOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNsaWRlRHVyYXRpb246IG51bWJlcjtcclxuICAgICAgICAgICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGhpdEludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgICAgICAgICBncm91bmRPZmZzZXRZOiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kIGxpbmVcclxuICAgICAgICAgICAgbWF4SnVtcHM6IG51bWJlcjsgLy8gTkVXOiBNYXhpbXVtIG51bWJlciBvZiBqdW1wcyBhbGxvd2VkXHJcbiAgICAgICAgICAgIHJ1bkFuaW1hdGlvblNwZWVkOiBudW1iZXI7IC8vIE5FVzogVGltZSBpbiBzZWNvbmRzIGZvciBvbmUgZnVsbCBydW4gYW5pbWF0aW9uIGN5Y2xlIChlLmcuLCAyIGZyYW1lcylcclxuICAgICAgICB9O1xyXG4gICAgICAgIG9ic3RhY2xlOiB7XHJcbiAgICAgICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgICAgICBtaW5TcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICAgICAgICAgIG1heFNwYXduSW50ZXJ2YWw6IG51bWJlcjtcclxuICAgICAgICAgICAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXMgZ2FtZVNwZWVkXHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb2xsZWN0aWJsZToge1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICAgICAgbWluU3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgICAgICAgICBtYXhTcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNjb3JlVmFsdWU6IG51bWJlcjtcclxuICAgICAgICAgICAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXMgZ2FtZVNwZWVkXHJcbiAgICAgICAgfTtcclxuICAgICAgICBiYWNrZ3JvdW5kczogQXJyYXk8e1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xyXG4gICAgICAgICAgICB5T2Zmc2V0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodFxyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjsgLy8gJSBvZiBjYW52YXMgaGVpZ2h0XHJcbiAgICAgICAgfT47XHJcbiAgICAgICAgZ3JvdW5kOiB7XHJcbiAgICAgICAgICAgIG5hbWU6IHN0cmluZztcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodFxyXG4gICAgICAgICAgICB5T2Zmc2V0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodCBmcm9tIGJvdHRvbVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdWk6IHtcclxuICAgICAgICAgICAgc2NvcmVGb250U2l6ZTogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWFsdGhCYXJXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWFsdGhCYXJIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogQXJyYXk8e1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHBhdGg6IHN0cmluZztcclxuICAgICAgICAgICAgd2lkdGg6IG51bWJlcjsgLy8gT3JpZ2luYWwgd2lkdGhcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7IC8vIE9yaWdpbmFsIGhlaWdodFxyXG4gICAgICAgIH0+O1xyXG4gICAgICAgIHNvdW5kczogQXJyYXk8e1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHBhdGg6IHN0cmluZztcclxuICAgICAgICAgICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xyXG4gICAgICAgICAgICB2b2x1bWU6IG51bWJlcjtcclxuICAgICAgICB9PjtcclxuICAgIH07XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcsXHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRBc3NldHM6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG9uUmVhZHlDYWxsYmFja3M6ICgoKSA9PiB2b2lkKVtdID0gW107XHJcblxyXG4gICAgYXN5bmMgbG9hZChkYXRhOiBHYW1lRGF0YVsnYXNzZXRzJ10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLnRvdGFsQXNzZXRzID0gZGF0YS5pbWFnZXMubGVuZ3RoICsgZGF0YS5zb3VuZHMubGVuZ3RoO1xyXG4gICAgICAgIGlmICh0aGlzLnRvdGFsQXNzZXRzID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubm90aWZ5UmVhZHkoKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGRhdGEuaW1hZ2VzLm1hcChpbWcgPT4gdGhpcy5sb2FkSW1hZ2UoaW1nLm5hbWUsIGltZy5wYXRoKSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IGRhdGEuc291bmRzLm1hcChzbmQgPT4gdGhpcy5sb2FkU291bmQoc25kLm5hbWUsIHNuZC5wYXRoKSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgdGhpcy5ub3RpZnlSZWFkeSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBwYXRoO1xyXG4gICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pbWFnZXMuc2V0KG5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke3BhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrOyAvLyBTdGlsbCBjb3VudCB0byBhdm9pZCBibG9ja2luZ1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGFueXdheSB0byBjb250aW51ZSBsb2FkaW5nIG90aGVyIGFzc2V0c1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgYXVkaW8uc3JjID0gcGF0aDtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJzsgLy8gUHJlbG9hZCB0aGUgYXVkaW9cclxuICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChuYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7cGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQXNzZXRzKys7IC8vIFN0aWxsIGNvdW50IHRvIGF2b2lkIGJsb2NraW5nXHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgYW55d2F5IHRvIGNvbnRpbnVlIGxvYWRpbmcgb3RoZXIgYXNzZXRzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0SW1hZ2UobmFtZTogc3RyaW5nKTogSFRNTEltYWdlRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRTb3VuZChuYW1lOiBzdHJpbmcpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSwgdm9sdW1lPzogbnVtYmVyKTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgY29uc3Qgc291bmQgPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKHNvdW5kKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gc291bmQuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNsb25lLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSB2b2x1bWUgIT09IHVuZGVmaW5lZCA/IHZvbHVtZSA6IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBGYWlsZWQgdG8gcGxheSBzb3VuZCAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICAgICAgcmV0dXJuIGNsb25lO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIHN0b3BTb3VuZChhdWRpb0VsZW1lbnQ6IEhUTUxBdWRpb0VsZW1lbnQpIHtcclxuICAgICAgICBpZiAoYXVkaW9FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIGF1ZGlvRWxlbWVudC5wYXVzZSgpO1xyXG4gICAgICAgICAgICBhdWRpb0VsZW1lbnQuY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBnZXRMb2FkUHJvZ3Jlc3MoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50b3RhbEFzc2V0cyA9PT0gMCA/IDEgOiB0aGlzLmxvYWRlZEFzc2V0cyAvIHRoaXMudG90YWxBc3NldHM7XHJcbiAgICB9XHJcblxyXG4gICAgb25SZWFkeShjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmlzUmVhZHkoKSkge1xyXG4gICAgICAgICAgICBjYWxsYmFjaygpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMub25SZWFkeUNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaXNSZWFkeSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5sb2FkZWRBc3NldHMgPT09IHRoaXMudG90YWxBc3NldHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBub3RpZnlSZWFkeSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm9uUmVhZHlDYWxsYmFja3MuZm9yRWFjaChjYWxsYmFjayA9PiBjYWxsYmFjaygpKTtcclxuICAgICAgICB0aGlzLm9uUmVhZHlDYWxsYmFja3MgPSBbXTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgSW5wdXRIYW5kbGVyIHtcclxuICAgIHByaXZhdGUga2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIHByZXNzQ2FsbGJhY2tzOiBNYXA8c3RyaW5nLCAoKSA9PiB2b2lkPiA9IG5ldyBNYXAoKTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bik7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5oYW5kbGVLZXlVcCk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDbGljayk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCB0aGlzLmhhbmRsZVRvdWNoU3RhcnQsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlEb3duID0gKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcclxuICAgICAgICBpZiAoIXRoaXMua2V5cy5oYXMoZS5jb2RlKSkgeyAvLyBPbmx5IHRyaWdnZXIgb24gZmlyc3QgcHJlc3NcclxuICAgICAgICAgICAgdGhpcy5rZXlzLmFkZChlLmNvZGUpO1xyXG4gICAgICAgICAgICB0aGlzLnByZXNzQ2FsbGJhY2tzLmdldChlLmNvZGUpPy4oKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlVcCA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgdGhpcy5rZXlzLmRlbGV0ZShlLmNvZGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlc3NDYWxsYmFja3MuZ2V0KCdjbGljaycpPy4oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZVRvdWNoU3RhcnQgPSAoZTogVG91Y2hFdmVudCkgPT4ge1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBkZWZhdWx0IHRvdWNoIGJlaGF2aW9yIGxpa2Ugc2Nyb2xsaW5nXHJcbiAgICAgICAgdGhpcy5wcmVzc0NhbGxiYWNrcy5nZXQoJ2NsaWNrJyk/LigpOyAvLyBUcmVhdCB0b3VjaCBhcyBhIGNsaWNrXHJcbiAgICB9XHJcblxyXG4gICAgaXNLZXlEb3duKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMua2V5cy5oYXMoa2V5KTtcclxuICAgIH1cclxuXHJcbiAgICBvbktleVByZXNzKGtleTogc3RyaW5nLCBjYWxsYmFjazogKCkgPT4gdm9pZCkge1xyXG4gICAgICAgIHRoaXMucHJlc3NDYWxsYmFja3Muc2V0KGtleSwgY2FsbGJhY2spO1xyXG4gICAgfVxyXG5cclxuICAgIGNsZWFyS2V5UHJlc3NDYWxsYmFja3MoKSB7XHJcbiAgICAgICAgdGhpcy5wcmVzc0NhbGxiYWNrcy5jbGVhcigpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHB1YmxpYyB4OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIHk6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgd2lkdGg6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgaGVpZ2h0OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LFxyXG4gICAgICAgIHB1YmxpYyBzcGVlZDogbnVtYmVyID0gMFxyXG4gICAgKSB7fVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggLT0gKHRoaXMuc3BlZWQgfHwgZ2FtZVNwZWVkKSAqIGRlbHRhVGltZTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIGlzQ29sbGlkaW5nKG90aGVyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgdGhpcy54IDwgb3RoZXIueCArIG90aGVyLndpZHRoICYmXHJcbiAgICAgICAgICAgIHRoaXMueCArIHRoaXMud2lkdGggPiBvdGhlci54ICYmXHJcbiAgICAgICAgICAgIHRoaXMueSA8IG90aGVyLnkgKyBvdGhlci5oZWlnaHQgJiZcclxuICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgPiBvdGhlci55XHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBpc09mZnNjcmVlbihjYW52YXNXaWR0aDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMueCArIHRoaXMud2lkdGggPCAwO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHByaXZhdGUgdmVsb2NpdHlZOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBpc0p1bXBpbmc6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgaXNTbGlkaW5nOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIHNsaWRlVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGhpdEludmluY2liaWxpdHlUaW1lcjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY3VycmVudFJ1bkZyYW1lOiBudW1iZXIgPSAwOyAvLyBDdXJyZW50IGZyYW1lIGluZGV4IGZvciBydW5uaW5nIGFuaW1hdGlvbiAoMCBvciAxKVxyXG4gICAgcHJpdmF0ZSBydW5BbmltYXRpb25UaW1lcjogbnVtYmVyID0gMDsgLy8gVGltZXIgdG8gY29udHJvbCBydW4gYW5pbWF0aW9uIGZyYW1lIHN3aXRjaGluZ1xyXG5cclxuICAgIHB1YmxpYyBoZWFsdGg6IG51bWJlcjtcclxuICAgIHB1YmxpYyBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHB1YmxpYyBvcmlnaW5hbFk6IG51bWJlcjtcclxuXHJcbiAgICBwcml2YXRlIGdhbWVTZXR0aW5nczogR2FtZURhdGFbJ2dhbWVTZXR0aW5ncyddO1xyXG4gICAgcHJpdmF0ZSBpbnB1dDogSW5wdXRIYW5kbGVyO1xyXG4gICAgcHJpdmF0ZSBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlcjtcclxuXHJcbiAgICBwcml2YXRlIGNhbkp1bXBJbnB1dDogYm9vbGVhbiA9IHRydWU7IC8vIEZsYWcgdG8gdHJhY2sgaWYganVtcCBpbnB1dCBpcyBcImZyZXNoXCJcclxuICAgIHByaXZhdGUganVtcHNSZW1haW5pbmc6IG51bWJlcjsgICAgICAgIC8vIEhvdyBtYW55IGp1bXBzIGFyZSBsZWZ0XHJcbiAgICBwcml2YXRlIG1heEp1bXBzOiBudW1iZXI7ICAgICAgICAgICAgICAvLyBUb3RhbCBhbGxvd2VkIGp1bXBzXHJcblxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgeDogbnVtYmVyLFxyXG4gICAgICAgIHk6IG51bWJlcixcclxuICAgICAgICB3aWR0aDogbnVtYmVyLFxyXG4gICAgICAgIGhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIGltYWdlUnVuMTogSFRNTEltYWdlRWxlbWVudCwgLy8gTm93IHNwZWNpZmljYWxseSB0aGUgZmlyc3QgcnVuIGZyYW1lXHJcbiAgICAgICAgcHJpdmF0ZSBpbWFnZUp1bXA6IEhUTUxJbWFnZUVsZW1lbnQsXHJcbiAgICAgICAgcHJpdmF0ZSBpbWFnZVNsaWRlOiBIVE1MSW1hZ2VFbGVtZW50LFxyXG4gICAgICAgIG1heEhlYWx0aDogbnVtYmVyLFxyXG4gICAgICAgIHByaXZhdGUgaGl0SW52aW5jaWJpbGl0eUR1cmF0aW9uOiBudW1iZXIsXHJcbiAgICAgICAgZ2FtZVNldHRpbmdzOiBHYW1lRGF0YVsnZ2FtZVNldHRpbmdzJ10sXHJcbiAgICAgICAgaW5wdXQ6IElucHV0SGFuZGxlcixcclxuICAgICAgICBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlclxyXG4gICAgKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VSdW4xKTsgLy8gRGVmYXVsdCB0byBmaXJzdCBydW4gaW1hZ2VcclxuICAgICAgICB0aGlzLm9yaWdpbmFsWSA9IHk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBtYXhIZWFsdGg7XHJcbiAgICAgICAgdGhpcy5nYW1lU2V0dGluZ3MgPSBnYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgdGhpcy5pbnB1dCA9IGlucHV0O1xyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyID0gYXNzZXRNYW5hZ2VyO1xyXG5cclxuICAgICAgICB0aGlzLm1heEp1bXBzID0gdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLm1heEp1bXBzO1xyXG4gICAgICAgIHRoaXMuanVtcHNSZW1haW5pbmcgPSB0aGlzLm1heEp1bXBzO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBqdW1wS2V5UHJlc3NlZCA9IHRoaXMuaW5wdXQuaXNLZXlEb3duKCdTcGFjZScpIHx8IHRoaXMuaW5wdXQuaXNLZXlEb3duKCdjbGljaycpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUganVtcCBpbnB1dFxyXG4gICAgICAgIGlmIChqdW1wS2V5UHJlc3NlZCAmJiB0aGlzLmNhbkp1bXBJbnB1dCAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuanVtcHNSZW1haW5pbmcgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmp1bXAodGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLmp1bXBGb3JjZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9qdW1wJywgZmFsc2UsIDAuNSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmp1bXBzUmVtYWluaW5nLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbkp1bXBJbnB1dCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICghanVtcEtleVByZXNzZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW5KdW1wSW5wdXQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHNsaWRlIGlucHV0IChvbmx5IGlmIG5vdCBqdW1waW5nKVxyXG4gICAgICAgIGlmICh0aGlzLmlucHV0LmlzS2V5RG93bignQXJyb3dEb3duJykpIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzSnVtcGluZyAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2xpZGUodGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLnNsaWRlRHVyYXRpb24sIHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZnhfc2xpZGUnLCBmYWxzZSwgMC41KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQXBwbHkgZ3Jhdml0eVxyXG4gICAgICAgIHRoaXMudmVsb2NpdHlZICs9IHRoaXMuZ2FtZVNldHRpbmdzLmdyYXZpdHkgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMudmVsb2NpdHlZICogZGVsdGFUaW1lO1xyXG5cclxuICAgICAgICAvLyBHcm91bmQgY29sbGlzaW9uXHJcbiAgICAgICAgaWYgKHRoaXMueSA+PSB0aGlzLm9yaWdpbmFsWSkge1xyXG4gICAgICAgICAgICB0aGlzLnkgPSB0aGlzLm9yaWdpbmFsWTtcclxuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmlzSnVtcGluZyA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmp1bXBzUmVtYWluaW5nID0gdGhpcy5tYXhKdW1wczsgLy8gUmVzZXQganVtcHMgb24gbGFuZGluZ1xyXG4gICAgICAgICAgICB0aGlzLnJ1bkFuaW1hdGlvblRpbWVyID0gMDsgLy8gUmVzZXQgYW5pbWF0aW9uIHRpbWVyIG9uIGxhbmRpbmdcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlzSnVtcGluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTbGlkZSB0aW1lclxyXG4gICAgICAgIGlmICh0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICB0aGlzLnNsaWRlVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5zbGlkZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXNTbGlkaW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5oZWlnaHQ7IC8vIFJlc3RvcmUgb3JpZ2luYWwgaGVpZ2h0XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEludmluY2liaWxpdHkgdGltZXJcclxuICAgICAgICBpZiAodGhpcy5oaXRJbnZpbmNpYmlsaXR5VGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBhbmltYXRpb24gZnJhbWUgYmFzZWQgb24gcGxheWVyIHN0YXRlXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzSnVtcGluZyAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy5ydW5BbmltYXRpb25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnJ1bkFuaW1hdGlvblRpbWVyID49IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5ydW5BbmltYXRpb25TcGVlZCAvIDIpIHsgLy8gSGFsZiB0aGUgdG90YWwgY3ljbGUgdGltZSBmb3IgZWFjaCBmcmFtZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5ydW5BbmltYXRpb25UaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRSdW5GcmFtZSA9ICh0aGlzLmN1cnJlbnRSdW5GcmFtZSArIDEpICUgMjsgLy8gVG9nZ2xlIGJldHdlZW4gMCBhbmQgMVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBsZXQgY3VycmVudFJ1bkltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50UnVuRnJhbWUgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRSdW5JbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdjb29raWVfcnVuXzEnKSE7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50UnVuSW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnY29va2llX3J1bl8yJykhO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5pbWFnZSAhPT0gY3VycmVudFJ1bkltYWdlKSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZSA9IGN1cnJlbnRSdW5JbWFnZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc0p1bXBpbmcpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaW1hZ2UgIT09IHRoaXMuaW1hZ2VKdW1wKSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuaW1hZ2VKdW1wO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5pbWFnZSAhPT0gdGhpcy5pbWFnZVNsaWRlKSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuaW1hZ2VTbGlkZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyID4gMCAmJiBNYXRoLmZsb29yKHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyICogMTApICUgMikge1xyXG4gICAgICAgICAgICAvLyBCbGluayBlZmZlY3QgZHVyaW5nIGludmluY2liaWxpdHlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAganVtcChmb3JjZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5pc0p1bXBpbmcgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMudmVsb2NpdHlZID0gLWZvcmNlO1xyXG4gICAgfVxyXG5cclxuICAgIHNsaWRlKGR1cmF0aW9uOiBudW1iZXIsIG9yaWdpbmFsSGVpZ2h0OiBudW1iZXIpIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNKdW1waW5nICYmICF0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICB0aGlzLmlzU2xpZGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuc2xpZGVUaW1lciA9IGR1cmF0aW9uO1xyXG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IG9yaWdpbmFsSGVpZ2h0ICogMC41OyAvLyBIYWxmIGhlaWdodCB3aGlsZSBzbGlkaW5nXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRha2VEYW1hZ2UoYW1vdW50OiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5oaXRJbnZpbmNpYmlsaXR5VGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmhlYWx0aCAtPSBhbW91bnQ7XHJcbiAgICAgICAgICAgIHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyID0gdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLmhpdEludmluY2liaWxpdHlEdXJhdGlvbjsgLy8gVXNlIGdhbWVTZXR0aW5ncyBmb3IgZHVyYXRpb25cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYWRkU2NvcmUoYW1vdW50OiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNjb3JlICs9IGFtb3VudDtcclxuICAgIH1cclxuXHJcbiAgICBpc0ludmluY2libGUoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyID4gMDtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUGFyYWxsYXhCYWNrZ3JvdW5kIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBwcml2YXRlIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LCBzcGVlZDogbnVtYmVyLCBjYW52YXNXaWR0aDogbnVtYmVyXHJcbiAgICApIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZSwgc3BlZWQpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzV2lkdGggPSBjYW52YXNXaWR0aDtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWVTcGVlZDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54IC09IHRoaXMuc3BlZWQgKiBnYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGZpcnN0IGltYWdlIGhhcyBzY3JvbGxlZCBvZmYtc2NyZWVuXHJcbiAgICAgICAgaWYgKHRoaXMueCArIHRoaXMud2lkdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gdGhpcy53aWR0aDsgLy8gTW92ZSBpdCB0byB0aGUgcmlnaHQgb2YgdGhlIHNlY29uZCBpbWFnZSB0byBjcmVhdGUgYSBsb29wXHJcbiAgICAgICAgICAgIC8vIFRoZSByZWR1bmRhbnQgbmVzdGVkIGNoZWNrIGhhcyBiZWVuIHJlbW92ZWQ6XHJcbiAgICAgICAgICAgIC8vIGlmICh0aGlzLnggKyB0aGlzLndpZHRoIDw9IDApIHtcclxuICAgICAgICAgICAgLy8gICAgIHRoaXMueCArPSB0aGlzLndpZHRoO1xyXG4gICAgICAgICAgICAvLyB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICAvLyBEcmF3IHRoZSBpbWFnZSBtdWx0aXBsZSB0aW1lcyB0byBjb3ZlciB0aGUgY2FudmFzIGZvciBzZWFtbGVzcyBzY3JvbGxpbmdcclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLnggKyB0aGlzLndpZHRoLCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICAvLyBJZiB0aGUgc2NhbGVkIGltYWdlIHdpZHRoIGlzIGxlc3MgdGhhbiBjYW52YXMgd2lkdGgsIGRyYXcgYSB0aGlyZCBmb3IgZnVsbCBjb3ZlcmFnZVxyXG4gICAgICAgIC8vIFRoaXMgY29uZGl0aW9uIGNvcnJlY3RseSBwcmV2ZW50cyBkcmF3aW5nIGEgdGhpcmQgaW1hZ2Ugd2hlbiB0aGlzLndpZHRoIGVxdWFscyBjYW52YXNXaWR0aFxyXG4gICAgICAgIGlmICh0aGlzLndpZHRoIDwgdGhpcy5jYW52YXNXaWR0aCAmJiB0aGlzLnggKyAyICogdGhpcy53aWR0aCA8PSB0aGlzLmNhbnZhc1dpZHRoICsgKHRoaXMuc3BlZWQgKiAxMCkpIHsgLy8gU21hbGwgYnVmZmVyIGZvciBzbW9vdGggbG9vcFxyXG4gICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLnggKyAyICogdGhpcy53aWR0aCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBkYXRhITogR2FtZURhdGE7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyID0gbmV3IEFzc2V0TWFuYWdlcigpO1xyXG4gICAgcHJpdmF0ZSBpbnB1dEhhbmRsZXI6IElucHV0SGFuZGxlciA9IG5ldyBJbnB1dEhhbmRsZXIoKTtcclxuXHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgcGxheWVyITogUGxheWVyO1xyXG4gICAgcHJpdmF0ZSBiYWNrZ3JvdW5kczogUGFyYWxsYXhCYWNrZ3JvdW5kW10gPSBbXTtcclxuICAgIHByaXZhdGUgZ3JvdW5kITogUGFyYWxsYXhCYWNrZ3JvdW5kOyBcclxuICAgIHByaXZhdGUgb2JzdGFjbGVzOiBHYW1lT2JqZWN0W10gPSBbXTtcclxuICAgIHByaXZhdGUgY29sbGVjdGlibGVzOiBHYW1lT2JqZWN0W10gPSBbXTtcclxuXHJcbiAgICBwcml2YXRlIG9ic3RhY2xlU3Bhd25UaW1lcjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY29sbGVjdGlibGVTcGF3blRpbWVyOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgY3VycmVudEJHTTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICBpZiAoIXRoaXMuY3R4KSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDYW52YXMgY29udGV4dCBub3QgZm91bmQhXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkR2FtZURhdGEoKTtcclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5jYW52YXNIZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5jdHguaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gdHJ1ZTsgLy8gRm9yIGJldHRlciBzY2FsaW5nXHJcblxyXG4gICAgICAgIC8vIExvYWQgYXNzZXRzXHJcbiAgICAgICAgYXdhaXQgdGhpcy5hc3NldE1hbmFnZXIubG9hZCh0aGlzLmRhdGEuYXNzZXRzKTtcclxuICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5vblJlYWR5KCgpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJBc3NldHMgbG9hZGVkLiBUcmFuc2l0aW9uaW5nIHRvIFRJVExFIHN0YXRlLlwiKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgICAgIHRoaXMuc2V0dXBUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRCR00gPSB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2JnbV90aXRsZScsIHRydWUsIDAuNSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRHYW1lRGF0YSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgdGhpcy5kYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YTonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGRlZmF1bHQgb3IgZXJyb3Igc3RhdGVcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cFRpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLmNsZWFyS2V5UHJlc3NDYWxsYmFja3MoKTtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5vbktleVByZXNzKCdTcGFjZScsIHRoaXMuc3RhcnRHYW1lKTtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5vbktleVByZXNzKCdjbGljaycsIHRoaXMuc3RhcnRHYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSA9ICgpID0+IHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLmNsZWFyS2V5UHJlc3NDYWxsYmFja3MoKTtcclxuICAgICAgICB0aGlzLnJlc2V0R2FtZSgpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEJHTT8ucGF1c2UoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRCR00gPSB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2JnbV9nYW1lJywgdHJ1ZSwgMC41KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVPdmVyID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICB0aGlzLmN1cnJlbnRCR00/LnBhdXNlKCk7XHJcbiAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZnhfZ2FtZV9vdmVyJywgZmFsc2UsIDAuNyk7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLmNsZWFyS2V5UHJlc3NDYWxsYmFja3MoKTtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5vbktleVByZXNzKCdTcGFjZScsIHRoaXMucmV0dXJuVG9UaXRsZSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIub25LZXlQcmVzcygnY2xpY2snLCB0aGlzLnJldHVyblRvVGl0bGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmV0dXJuVG9UaXRsZSA9ICgpID0+IHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRCR00/LnBhdXNlKCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QkdNID0gdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlLCAwLjUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzZXRHYW1lKCkge1xyXG4gICAgICAgIGNvbnN0IGdzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBjb25zdCBwbGF5ZXJJbWFnZVJ1bjEgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnY29va2llX3J1bl8xJykhOyAvLyBOb3cgc3BlY2lmaWNhbGx5ICdjb29raWVfcnVuXzEnXHJcbiAgICAgICAgY29uc3QgcGxheWVySW1hZ2VKdW1wID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2Nvb2tpZV9qdW1wJykhO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckltYWdlU2xpZGUgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnY29va2llX3NsaWRlJykhO1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJHcm91bmRZID0gZ3MuY2FudmFzSGVpZ2h0ICogKDEgLSBncy5ncm91bmQueU9mZnNldCkgLSBncy5wbGF5ZXIuaGVpZ2h0ICsgZ3MucGxheWVyLmdyb3VuZE9mZnNldFk7XHJcblxyXG4gICAgICAgIHRoaXMucGxheWVyID0gbmV3IFBsYXllcihcclxuICAgICAgICAgICAgZ3MuY2FudmFzV2lkdGggKiAwLjEsIC8vIFBsYXllciBzdGFydGluZyBYXHJcbiAgICAgICAgICAgIHBsYXllckdyb3VuZFksXHJcbiAgICAgICAgICAgIGdzLnBsYXllci53aWR0aCxcclxuICAgICAgICAgICAgZ3MucGxheWVyLmhlaWdodCxcclxuICAgICAgICAgICAgcGxheWVySW1hZ2VSdW4xLCAvLyBQYXNzIHRoZSBmaXJzdCBydW4gZnJhbWVcclxuICAgICAgICAgICAgcGxheWVySW1hZ2VKdW1wLFxyXG4gICAgICAgICAgICBwbGF5ZXJJbWFnZVNsaWRlLFxyXG4gICAgICAgICAgICBncy5wbGF5ZXIubWF4SGVhbHRoLFxyXG4gICAgICAgICAgICBncy5wbGF5ZXIuaGl0SW52aW5jaWJpbGl0eUR1cmF0aW9uLFxyXG4gICAgICAgICAgICBncywgLy8gUGFzcyBnYW1lU2V0dGluZ3NcclxuICAgICAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIsIC8vIFBhc3MgaW5wdXRIYW5kbGVyXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyIC8vIFBhc3MgYXNzZXRNYW5hZ2VyXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kcyA9IGdzLmJhY2tncm91bmRzLm1hcChiZyA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKGJnLm5hbWUpITtcclxuICAgICAgICAgICAgY29uc3QgYmdIZWlnaHQgPSBncy5jYW52YXNIZWlnaHQgKiBiZy5oZWlnaHQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGFzcGVjdFJhdGlvID0gaW1nLndpZHRoIC8gaW1nLmhlaWdodDtcclxuICAgICAgICAgICAgY29uc3QgYmdXaWR0aCA9IGJnSGVpZ2h0ICogYXNwZWN0UmF0aW87IC8vIFNjYWxlIHdpZHRoIHRvIG1haW50YWluIGFzcGVjdCByYXRpbyB3aXRoIHNjYWxlZCBoZWlnaHRcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQYXJhbGxheEJhY2tncm91bmQoMCwgZ3MuY2FudmFzSGVpZ2h0ICogYmcueU9mZnNldCwgYmdXaWR0aCwgYmdIZWlnaHQsIGltZywgYmcuc3BlZWRNdWx0aXBsaWVyLCB0aGlzLmNhbnZhcy53aWR0aCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdyb3VuZEltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoZ3MuZ3JvdW5kLm5hbWUpITtcclxuICAgICAgICBjb25zdCBncm91bmRIZWlnaHQgPSBncy5jYW52YXNIZWlnaHQgKiBncy5ncm91bmQuaGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZFkgPSBncy5jYW52YXNIZWlnaHQgLSBncm91bmRIZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5ncm91bmQgPSBuZXcgUGFyYWxsYXhCYWNrZ3JvdW5kKDAsIGdyb3VuZFksIHRoaXMuY2FudmFzLndpZHRoLCBncm91bmRIZWlnaHQsIGdyb3VuZEltYWdlLCAxLjAsIHRoaXMuY2FudmFzLndpZHRoKTsgLy8gR3JvdW5kIHdpZHRoIGVxdWFsIHRvIGNhbnZhcyB3aWR0aCB0byBzdGFydCwgaXQgd2lsbCB0aWxlXHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIHRoaXMub2JzdGFjbGVzID0gW107XHJcbiAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMgPSBbXTtcclxuICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA9IGdzLm9ic3RhY2xlLm1pblNwYXduSW50ZXJ2YWw7XHJcbiAgICAgICAgdGhpcy5jb2xsZWN0aWJsZVNwYXduVGltZXIgPSBncy5vYnN0YWNsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AgPSAoY3VycmVudFRpbWU6IG51bWJlcikgPT4ge1xyXG4gICAgICAgIGlmICghdGhpcy5sYXN0VGltZSkgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ29udmVydCB0byBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5MT0FESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyTG9hZGluZ1NjcmVlbigpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGdzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncztcclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBwbGF5ZXJcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXIudXBkYXRlKGRlbHRhVGltZSwgZ3MuZ2FtZVNwZWVkKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVPdmVyKCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBiYWNrZ3JvdW5kcyBhbmQgZ3JvdW5kXHJcbiAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZHMuZm9yRWFjaChiZyA9PiBiZy51cGRhdGUoZGVsdGFUaW1lLCBncy5nYW1lU3BlZWQpKTtcclxuICAgICAgICAgICAgdGhpcy5ncm91bmQudXBkYXRlKGRlbHRhVGltZSwgZ3MuZ2FtZVNwZWVkKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFNwYXduIG9ic3RhY2xlc1xyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNwYXduT2JzdGFjbGUoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMub2JzdGFjbGVTcGF3blRpbWVyID0gTWF0aC5yYW5kb20oKSAqIChncy5vYnN0YWNsZS5tYXhTcGF3bkludGVydmFsIC0gZ3Mub2JzdGFjbGUubWluU3Bhd25JbnRlcnZhbCkgKyBncy5vYnN0YWNsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBTcGF3biBjb2xsZWN0aWJsZXNcclxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZVNwYXduVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5jb2xsZWN0aWJsZVNwYXduVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zcGF3bkNvbGxlY3RpYmxlKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA9IE1hdGgucmFuZG9tKCkgKiAoZ3MuY29sbGVjdGlibGUubWF4U3Bhd25JbnRlcnZhbCAtIGdzLmNvbGxlY3RpYmxlLm1pblNwYXduSW50ZXJ2YWwpICsgZ3MuY29sbGVjdGlibGUubWluU3Bhd25JbnRlcnZhbDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gVXBkYXRlIG9ic3RhY2xlc1xyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlcy5mb3JFYWNoKG9ic3RhY2xlID0+IG9ic3RhY2xlLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCAqIGdzLm9ic3RhY2xlLnNwZWVkTXVsdGlwbGllcikpO1xyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlcyA9IHRoaXMub2JzdGFjbGVzLmZpbHRlcihvYnN0YWNsZSA9PiAhb2JzdGFjbGUuaXNPZmZzY3JlZW4odGhpcy5jYW52YXMud2lkdGgpKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBjb2xsZWN0aWJsZXNcclxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMuZm9yRWFjaChjb2xsZWN0aWJsZSA9PiBjb2xsZWN0aWJsZS51cGRhdGUoZGVsdGFUaW1lLCBncy5nYW1lU3BlZWQgKiBncy5jb2xsZWN0aWJsZS5zcGVlZE11bHRpcGxpZXIpKTtcclxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMgPSB0aGlzLmNvbGxlY3RpYmxlcy5maWx0ZXIoY29sbGVjdGlibGUgPT4gIWNvbGxlY3RpYmxlLmlzT2Zmc2NyZWVuKHRoaXMuY2FudmFzLndpZHRoKSk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmNoZWNrQ29sbGlzaW9ucygpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllci5hZGRTY29yZShkZWx0YVRpbWUgKiAxMCk7IC8vIENvbnRpbnVvdXMgc2NvcmVcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJMb2FkaW5nU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnTG9hZGluZyBBc3NldHMuLi4nLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgIGNvbnN0IHByb2dyZXNzID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0TG9hZFByb2dyZXNzKCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7KHByb2dyZXNzICogMTAwKS50b0ZpeGVkKDApfSVgLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA0MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgY29uc3QgdGl0bGVCZyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCd0aXRsZV9iYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGl0bGVCZykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZSh0aXRsZUJnLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2xpZ2h0Ymx1ZSc7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gYGJvbGQgJHt0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnVpLnNjb3JlRm9udFNpemUgKiAxLjV9cHggQXJpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ0Nvb2tpZSBSdW5uZXInLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDMpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke3RoaXMuZGF0YS5nYW1lU2V0dGluZ3MudWkuc2NvcmVGb250U2l6ZX1weCBBcmlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnUHJlc3MgU1BBQ0Ugb3IgVEFQIHRvIFN0YXJ0JywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIC8vIERyYXcgYmFja2dyb3VuZHNcclxuICAgICAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZHMuZm9yRWFjaChiZyA9PiBiZy5kcmF3KHRoaXMuY3R4KSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdyb3VuZC5kcmF3KHRoaXMuY3R4KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IG9ic3RhY2xlcyBhbmQgY29sbGVjdGlibGVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9ic3RhY2xlcy5mb3JFYWNoKG9ic3RhY2xlID0+IG9ic3RhY2xlLmRyYXcodGhpcy5jdHgpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzLmZvckVhY2goY29sbGVjdGlibGUgPT4gY29sbGVjdGlibGUuZHJhdyh0aGlzLmN0eCkpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIERyYXcgcGxheWVyXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5kcmF3KHRoaXMuY3R4KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IFVJXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdVSSgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICBjb25zdCBnYW1lT3ZlckJnID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2dhbWVfb3Zlcl9iYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZ2FtZU92ZXJCZykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShnYW1lT3ZlckJnLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2RhcmtyZWQnO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkICR7dGhpcy5kYXRhLmdhbWVTZXR0aW5ncy51aS5zY29yZUZvbnRTaXplICogMS41fXB4IEFyaWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdHQU1FIE9WRVInLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDMpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke3RoaXMuZGF0YS5nYW1lU2V0dGluZ3MudWkuc2NvcmVGb250U2l6ZX1weCBBcmlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgU0NPUkU6ICR7TWF0aC5mbG9vcih0aGlzLnBsYXllci5zY29yZSl9YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyLjIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1ByZXNzIFNQQUNFIG9yIFRBUCB0byByZXR1cm4gdG8gVGl0bGUnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDEuOCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VUkoKSB7XHJcbiAgICAgICAgY29uc3QgZ3MgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIC8vIFNjb3JlXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYCR7Z3MudWkuc2NvcmVGb250U2l6ZX1weCBBcmlhbGA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBTQ09SRTogJHtNYXRoLmZsb29yKHRoaXMucGxheWVyLnNjb3JlKX1gLCAxMCwgMzApO1xyXG5cclxuICAgICAgICAvLyBIZWFsdGggQmFyXHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFyWCA9IHRoaXMuY2FudmFzLndpZHRoIC0gZ3MudWkuaGVhbHRoQmFyV2lkdGggLSAxMDtcclxuICAgICAgICBjb25zdCBoZWFsdGhCYXJZID0gMTA7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEhlYWx0aFdpZHRoID0gKHRoaXMucGxheWVyLmhlYWx0aCAvIGdzLnBsYXllci5tYXhIZWFsdGgpICogZ3MudWkuaGVhbHRoQmFyV2lkdGg7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdncmF5JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBncy51aS5oZWFsdGhCYXJXaWR0aCwgZ3MudWkuaGVhbHRoQmFySGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBjdXJyZW50SGVhbHRoV2lkdGgsIGdzLnVpLmhlYWx0aEJhckhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgZ3MudWkuaGVhbHRoQmFyV2lkdGgsIGdzLnVpLmhlYWx0aEJhckhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzcGF3bk9ic3RhY2xlKCkge1xyXG4gICAgICAgIGNvbnN0IGdzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBjb25zdCBvYnN0YWNsZUltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ29ic3RhY2xlX3NwaWtlJyk7XHJcbiAgICAgICAgaWYgKCFvYnN0YWNsZUltYWdlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIk9ic3RhY2xlIGltYWdlIG5vdCBmb3VuZCFcIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IG9ic3RhY2xlWSA9IGdzLmNhbnZhc0hlaWdodCAqICgxIC0gZ3MuZ3JvdW5kLnlPZmZzZXQpIC0gZ3Mub2JzdGFjbGUuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMub2JzdGFjbGVzLnB1c2gobmV3IEdhbWVPYmplY3QodGhpcy5jYW52YXMud2lkdGgsIG9ic3RhY2xlWSwgZ3Mub2JzdGFjbGUud2lkdGgsIGdzLm9ic3RhY2xlLmhlaWdodCwgb2JzdGFjbGVJbWFnZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3Bhd25Db2xsZWN0aWJsZSgpIHtcclxuICAgICAgICBjb25zdCBncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgY29uc3QgamVsbHlJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdqZWxseV9iYXNpYycpO1xyXG4gICAgICAgIGlmICghamVsbHlJbWFnZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJDb2xsZWN0aWJsZSBpbWFnZSBub3QgZm91bmQhXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBtaW5KZWxseVkgPSBncy5jYW52YXNIZWlnaHQgKiAoMSAtIGdzLmdyb3VuZC55T2Zmc2V0KSAtIGdzLmNvbGxlY3RpYmxlLmhlaWdodCAqIDI7XHJcbiAgICAgICAgY29uc3QgbWF4SmVsbHlZID0gZ3MuY2FudmFzSGVpZ2h0ICogKDEgLSBncy5ncm91bmQueU9mZnNldCkgLSBncy5jb2xsZWN0aWJsZS5oZWlnaHQgKiA0O1xyXG4gICAgICAgIGNvbnN0IGplbGx5WSA9IE1hdGgucmFuZG9tKCkgKiAobWluSmVsbHlZIC0gbWF4SmVsbHlZKSArIG1heEplbGx5WTtcclxuXHJcbiAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMucHVzaChuZXcgR2FtZU9iamVjdCh0aGlzLmNhbnZhcy53aWR0aCwgamVsbHlZLCBncy5jb2xsZWN0aWJsZS53aWR0aCwgZ3MuY29sbGVjdGlibGUuaGVpZ2h0LCBqZWxseUltYWdlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjaGVja0NvbGxpc2lvbnMoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIHZzIE9ic3RhY2xlc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLm9ic3RhY2xlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICBjb25zdCBvYnN0YWNsZSA9IHRoaXMub2JzdGFjbGVzW2ldO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuaXNDb2xsaWRpbmcob2JzdGFjbGUpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMucGxheWVyLmlzSW52aW5jaWJsZSgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIudGFrZURhbWFnZSgxKTsgLy8gT25lIGRhbWFnZSBwZXIgaGl0XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZnhfaGl0JywgZmFsc2UsIDAuNyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHZzIENvbGxlY3RpYmxlc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLmNvbGxlY3RpYmxlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xsZWN0aWJsZSA9IHRoaXMuY29sbGVjdGlibGVzW2ldO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuaXNDb2xsaWRpbmcoY29sbGVjdGlibGUpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5hZGRTY29yZSh0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNvbGxlY3RpYmxlLnNjb3JlVmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMuc3BsaWNlKGksIDEpOyAvLyBSZW1vdmUgY29sbGVjdGVkIGl0ZW1cclxuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X2NvbGxlY3QnLCBmYWxzZSwgMC41KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gSW5pdGlhbGl6ZSB0aGUgZ2FtZVxyXG5jb25zdCBnYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuZ2FtZS5pbml0KCk7Il0sCiAgIm1hcHBpbmdzIjogIkFBaUVBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSkMsU0FBQUE7QUFBQSxHQUFBO0FBT0wsTUFBTSxhQUFhO0FBQUEsRUFBbkI7QUFDSSxTQUFRLFNBQXdDLG9CQUFJLElBQUk7QUFDeEQsU0FBUSxTQUF3QyxvQkFBSSxJQUFJO0FBQ3hELFNBQVEsY0FBc0I7QUFDOUIsU0FBUSxlQUF1QjtBQUMvQixTQUFRLG1CQUFtQyxDQUFDO0FBQUE7QUFBQSxFQUU1QyxNQUFNLEtBQUssTUFBeUM7QUFDaEQsU0FBSyxjQUFjLEtBQUssT0FBTyxTQUFTLEtBQUssT0FBTztBQUNwRCxRQUFJLEtBQUssZ0JBQWdCLEdBQUc7QUFDeEIsV0FBSyxZQUFZO0FBQ2pCO0FBQUEsSUFDSjtBQUVBLFVBQU0sZ0JBQWdCLEtBQUssT0FBTyxJQUFJLFNBQU8sS0FBSyxVQUFVLElBQUksTUFBTSxJQUFJLElBQUksQ0FBQztBQUMvRSxVQUFNLGdCQUFnQixLQUFLLE9BQU8sSUFBSSxTQUFPLEtBQUssVUFBVSxJQUFJLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFFL0UsVUFBTSxRQUFRLElBQUksQ0FBQyxHQUFHLGVBQWUsR0FBRyxhQUFhLENBQUM7QUFDdEQsU0FBSyxZQUFZO0FBQUEsRUFDckI7QUFBQSxFQUVRLFVBQVUsTUFBYyxNQUE2QjtBQUN6RCxXQUFPLElBQUksUUFBUSxDQUFDLFNBQVMsV0FBVztBQUNwQyxZQUFNLE1BQU0sSUFBSSxNQUFNO0FBQ3RCLFVBQUksTUFBTTtBQUNWLFVBQUksU0FBUyxNQUFNO0FBQ2YsYUFBSyxPQUFPLElBQUksTUFBTSxHQUFHO0FBQ3pCLGFBQUs7QUFDTCxnQkFB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
