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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgZ2FtZVNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgZ3Jhdml0eTogbnVtYmVyO1xyXG4gICAgICAgIHBsYXllcjoge1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICAgICAganVtcEZvcmNlOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNsaWRlRHVyYXRpb246IG51bWJlcjtcclxuICAgICAgICAgICAgbWF4SGVhbHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGhpdEludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgICAgICAgICBncm91bmRPZmZzZXRZOiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kIGxpbmVcclxuICAgICAgICAgICAgbWF4SnVtcHM6IG51bWJlcjsgLy8gTkVXOiBNYXhpbXVtIG51bWJlciBvZiBqdW1wcyBhbGxvd2VkXHJcbiAgICAgICAgICAgIHJ1bkFuaW1hdGlvblNwZWVkOiBudW1iZXI7IC8vIE5FVzogVGltZSBpbiBzZWNvbmRzIGZvciBvbmUgZnVsbCBydW4gYW5pbWF0aW9uIGN5Y2xlIChlLmcuLCAyIGZyYW1lcylcclxuICAgICAgICB9O1xyXG4gICAgICAgIG9ic3RhY2xlOiB7XHJcbiAgICAgICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgICAgICBtaW5TcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICAgICAgICAgIG1heFNwYXduSW50ZXJ2YWw6IG51bWJlcjtcclxuICAgICAgICAgICAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXMgZ2FtZVNwZWVkXHJcbiAgICAgICAgfTtcclxuICAgICAgICBjb2xsZWN0aWJsZToge1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICAgICAgbWluU3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgICAgICAgICBtYXhTcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICAgICAgICAgIHNjb3JlVmFsdWU6IG51bWJlcjtcclxuICAgICAgICAgICAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXMgZ2FtZVNwZWVkXHJcbiAgICAgICAgfTtcclxuICAgICAgICBiYWNrZ3JvdW5kczogQXJyYXk8e1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xyXG4gICAgICAgICAgICB5T2Zmc2V0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodFxyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjsgLy8gJSBvZiBjYW52YXMgaGVpZ2h0XHJcbiAgICAgICAgfT47XHJcbiAgICAgICAgZ3JvdW5kOiB7XHJcbiAgICAgICAgICAgIG5hbWU6IHN0cmluZztcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodFxyXG4gICAgICAgICAgICB5T2Zmc2V0OiBudW1iZXI7IC8vICUgb2YgY2FudmFzIGhlaWdodCBmcm9tIGJvdHRvbVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdWk6IHtcclxuICAgICAgICAgICAgc2NvcmVGb250U2l6ZTogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWFsdGhCYXJXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBoZWFsdGhCYXJIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICB9O1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogQXJyYXk8e1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHBhdGg6IHN0cmluZztcclxuICAgICAgICAgICAgd2lkdGg6IG51bWJlcjsgLy8gT3JpZ2luYWwgd2lkdGhcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7IC8vIE9yaWdpbmFsIGhlaWdodFxyXG4gICAgICAgIH0+O1xyXG4gICAgICAgIHNvdW5kczogQXJyYXk8e1xyXG4gICAgICAgICAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIHBhdGg6IHN0cmluZztcclxuICAgICAgICAgICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xyXG4gICAgICAgICAgICB2b2x1bWU6IG51bWJlcjtcclxuICAgICAgICB9PjtcclxuICAgIH07XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcsXHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRBc3NldHM6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG9uUmVhZHlDYWxsYmFja3M6ICgoKSA9PiB2b2lkKVtdID0gW107XHJcblxyXG4gICAgYXN5bmMgbG9hZChkYXRhOiBHYW1lRGF0YVsnYXNzZXRzJ10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLnRvdGFsQXNzZXRzID0gZGF0YS5pbWFnZXMubGVuZ3RoICsgZGF0YS5zb3VuZHMubGVuZ3RoO1xyXG4gICAgICAgIGlmICh0aGlzLnRvdGFsQXNzZXRzID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubm90aWZ5UmVhZHkoKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGRhdGEuaW1hZ2VzLm1hcChpbWcgPT4gdGhpcy5sb2FkSW1hZ2UoaW1nLm5hbWUsIGltZy5wYXRoKSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IGRhdGEuc291bmRzLm1hcChzbmQgPT4gdGhpcy5sb2FkU291bmQoc25kLm5hbWUsIHNuZC5wYXRoKSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgdGhpcy5ub3RpZnlSZWFkeSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBwYXRoO1xyXG4gICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pbWFnZXMuc2V0KG5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke3BhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrOyAvLyBTdGlsbCBjb3VudCB0byBhdm9pZCBibG9ja2luZ1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGFueXdheSB0byBjb250aW51ZSBsb2FkaW5nIG90aGVyIGFzc2V0c1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgYXVkaW8uc3JjID0gcGF0aDtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJzsgLy8gUHJlbG9hZCB0aGUgYXVkaW9cclxuICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChuYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7cGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQXNzZXRzKys7IC8vIFN0aWxsIGNvdW50IHRvIGF2b2lkIGJsb2NraW5nXHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgYW55d2F5IHRvIGNvbnRpbnVlIGxvYWRpbmcgb3RoZXIgYXNzZXRzXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0SW1hZ2UobmFtZTogc3RyaW5nKTogSFRNTEltYWdlRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRTb3VuZChuYW1lOiBzdHJpbmcpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSwgdm9sdW1lPzogbnVtYmVyKTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgY29uc3Qgc291bmQgPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKHNvdW5kKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gc291bmQuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNsb25lLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSB2b2x1bWUgIT09IHVuZGVmaW5lZCA/IHZvbHVtZSA6IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBGYWlsZWQgdG8gcGxheSBzb3VuZCAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICAgICAgcmV0dXJuIGNsb25lO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIHN0b3BTb3VuZChhdWRpb0VsZW1lbnQ6IEhUTUxBdWRpb0VsZW1lbnQpIHtcclxuICAgICAgICBpZiAoYXVkaW9FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIGF1ZGlvRWxlbWVudC5wYXVzZSgpO1xyXG4gICAgICAgICAgICBhdWRpb0VsZW1lbnQuY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBnZXRMb2FkUHJvZ3Jlc3MoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50b3RhbEFzc2V0cyA9PT0gMCA/IDEgOiB0aGlzLmxvYWRlZEFzc2V0cyAvIHRoaXMudG90YWxBc3NldHM7XHJcbiAgICB9XHJcblxyXG4gICAgb25SZWFkeShjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmlzUmVhZHkoKSkge1xyXG4gICAgICAgICAgICBjYWxsYmFjaygpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMub25SZWFkeUNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaXNSZWFkeSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5sb2FkZWRBc3NldHMgPT09IHRoaXMudG90YWxBc3NldHM7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBub3RpZnlSZWFkeSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm9uUmVhZHlDYWxsYmFja3MuZm9yRWFjaChjYWxsYmFjayA9PiBjYWxsYmFjaygpKTtcclxuICAgICAgICB0aGlzLm9uUmVhZHlDYWxsYmFja3MgPSBbXTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgSW5wdXRIYW5kbGVyIHtcclxuICAgIHByaXZhdGUga2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIHByZXNzQ2FsbGJhY2tzOiBNYXA8c3RyaW5nLCAoKSA9PiB2b2lkPiA9IG5ldyBNYXAoKTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bik7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5oYW5kbGVLZXlVcCk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDbGljayk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCB0aGlzLmhhbmRsZVRvdWNoU3RhcnQsIHsgcGFzc2l2ZTogZmFsc2UgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlEb3duID0gKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcclxuICAgICAgICBpZiAoIXRoaXMua2V5cy5oYXMoZS5jb2RlKSkgeyAvLyBPbmx5IHRyaWdnZXIgb24gZmlyc3QgcHJlc3NcclxuICAgICAgICAgICAgdGhpcy5rZXlzLmFkZChlLmNvZGUpO1xyXG4gICAgICAgICAgICB0aGlzLnByZXNzQ2FsbGJhY2tzLmdldChlLmNvZGUpPy4oKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlVcCA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgdGhpcy5rZXlzLmRlbGV0ZShlLmNvZGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlc3NDYWxsYmFja3MuZ2V0KCdjbGljaycpPy4oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZVRvdWNoU3RhcnQgPSAoZTogVG91Y2hFdmVudCkgPT4ge1xyXG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBkZWZhdWx0IHRvdWNoIGJlaGF2aW9yIGxpa2Ugc2Nyb2xsaW5nXHJcbiAgICAgICAgdGhpcy5wcmVzc0NhbGxiYWNrcy5nZXQoJ2NsaWNrJyk/LigpOyAvLyBUcmVhdCB0b3VjaCBhcyBhIGNsaWNrXHJcbiAgICB9XHJcblxyXG4gICAgaXNLZXlEb3duKGtleTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMua2V5cy5oYXMoa2V5KTtcclxuICAgIH1cclxuXHJcbiAgICBvbktleVByZXNzKGtleTogc3RyaW5nLCBjYWxsYmFjazogKCkgPT4gdm9pZCkge1xyXG4gICAgICAgIHRoaXMucHJlc3NDYWxsYmFja3Muc2V0KGtleSwgY2FsbGJhY2spO1xyXG4gICAgfVxyXG5cclxuICAgIGNsZWFyS2V5UHJlc3NDYWxsYmFja3MoKSB7XHJcbiAgICAgICAgdGhpcy5wcmVzc0NhbGxiYWNrcy5jbGVhcigpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHB1YmxpYyB4OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIHk6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgd2lkdGg6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgaGVpZ2h0OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LFxyXG4gICAgICAgIHB1YmxpYyBzcGVlZDogbnVtYmVyID0gMFxyXG4gICAgKSB7fVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggLT0gKHRoaXMuc3BlZWQgfHwgZ2FtZVNwZWVkKSAqIGRlbHRhVGltZTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIGlzQ29sbGlkaW5nKG90aGVyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgdGhpcy54IDwgb3RoZXIueCArIG90aGVyLndpZHRoICYmXHJcbiAgICAgICAgICAgIHRoaXMueCArIHRoaXMud2lkdGggPiBvdGhlci54ICYmXHJcbiAgICAgICAgICAgIHRoaXMueSA8IG90aGVyLnkgKyBvdGhlci5oZWlnaHQgJiZcclxuICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgPiBvdGhlci55XHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBpc09mZnNjcmVlbihjYW52YXNXaWR0aDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMueCArIHRoaXMud2lkdGggPCAwO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHByaXZhdGUgdmVsb2NpdHlZOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBpc0p1bXBpbmc6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgaXNTbGlkaW5nOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIHNsaWRlVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGhpdEludmluY2liaWxpdHlUaW1lcjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY3VycmVudFJ1bkZyYW1lOiBudW1iZXIgPSAwOyAvLyBDdXJyZW50IGZyYW1lIGluZGV4IGZvciBydW5uaW5nIGFuaW1hdGlvbiAoMCBvciAxKVxyXG4gICAgcHJpdmF0ZSBydW5BbmltYXRpb25UaW1lcjogbnVtYmVyID0gMDsgLy8gVGltZXIgdG8gY29udHJvbCBydW4gYW5pbWF0aW9uIGZyYW1lIHN3aXRjaGluZ1xyXG5cclxuICAgIHB1YmxpYyBoZWFsdGg6IG51bWJlcjtcclxuICAgIHB1YmxpYyBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHB1YmxpYyBvcmlnaW5hbFk6IG51bWJlcjtcclxuXHJcbiAgICBwcml2YXRlIGdhbWVTZXR0aW5nczogR2FtZURhdGFbJ2dhbWVTZXR0aW5ncyddO1xyXG4gICAgcHJpdmF0ZSBpbnB1dDogSW5wdXRIYW5kbGVyO1xyXG4gICAgcHJpdmF0ZSBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlcjtcclxuXHJcbiAgICBwcml2YXRlIGNhbkp1bXBJbnB1dDogYm9vbGVhbiA9IHRydWU7IC8vIEZsYWcgdG8gdHJhY2sgaWYganVtcCBpbnB1dCBpcyBcImZyZXNoXCJcclxuICAgIHByaXZhdGUganVtcHNSZW1haW5pbmc6IG51bWJlcjsgICAgICAgIC8vIEhvdyBtYW55IGp1bXBzIGFyZSBsZWZ0XHJcbiAgICBwcml2YXRlIG1heEp1bXBzOiBudW1iZXI7ICAgICAgICAgICAgICAvLyBUb3RhbCBhbGxvd2VkIGp1bXBzXHJcblxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgeDogbnVtYmVyLFxyXG4gICAgICAgIHk6IG51bWJlcixcclxuICAgICAgICB3aWR0aDogbnVtYmVyLFxyXG4gICAgICAgIGhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIGltYWdlUnVuMTogSFRNTEltYWdlRWxlbWVudCwgLy8gTm93IHNwZWNpZmljYWxseSB0aGUgZmlyc3QgcnVuIGZyYW1lXHJcbiAgICAgICAgcHJpdmF0ZSBpbWFnZUp1bXA6IEhUTUxJbWFnZUVsZW1lbnQsXHJcbiAgICAgICAgcHJpdmF0ZSBpbWFnZVNsaWRlOiBIVE1MSW1hZ2VFbGVtZW50LFxyXG4gICAgICAgIG1heEhlYWx0aDogbnVtYmVyLFxyXG4gICAgICAgIHByaXZhdGUgaGl0SW52aW5jaWJpbGl0eUR1cmF0aW9uOiBudW1iZXIsXHJcbiAgICAgICAgZ2FtZVNldHRpbmdzOiBHYW1lRGF0YVsnZ2FtZVNldHRpbmdzJ10sXHJcbiAgICAgICAgaW5wdXQ6IElucHV0SGFuZGxlcixcclxuICAgICAgICBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlclxyXG4gICAgKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VSdW4xKTsgLy8gRGVmYXVsdCB0byBmaXJzdCBydW4gaW1hZ2VcclxuICAgICAgICB0aGlzLm9yaWdpbmFsWSA9IHk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBtYXhIZWFsdGg7XHJcbiAgICAgICAgdGhpcy5nYW1lU2V0dGluZ3MgPSBnYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgdGhpcy5pbnB1dCA9IGlucHV0O1xyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyID0gYXNzZXRNYW5hZ2VyO1xyXG5cclxuICAgICAgICB0aGlzLm1heEp1bXBzID0gdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLm1heEp1bXBzO1xyXG4gICAgICAgIHRoaXMuanVtcHNSZW1haW5pbmcgPSB0aGlzLm1heEp1bXBzO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBqdW1wS2V5UHJlc3NlZCA9IHRoaXMuaW5wdXQuaXNLZXlEb3duKCdTcGFjZScpIHx8IHRoaXMuaW5wdXQuaXNLZXlEb3duKCdjbGljaycpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUganVtcCBpbnB1dFxyXG4gICAgICAgIGlmIChqdW1wS2V5UHJlc3NlZCAmJiB0aGlzLmNhbkp1bXBJbnB1dCAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuanVtcHNSZW1haW5pbmcgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmp1bXAodGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLmp1bXBGb3JjZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9qdW1wJywgZmFsc2UsIDAuNSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmp1bXBzUmVtYWluaW5nLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbkp1bXBJbnB1dCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICghanVtcEtleVByZXNzZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW5KdW1wSW5wdXQgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHNsaWRlIGlucHV0IChvbmx5IGlmIG5vdCBqdW1waW5nKVxyXG4gICAgICAgIGlmICh0aGlzLmlucHV0LmlzS2V5RG93bignQXJyb3dEb3duJykpIHtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzSnVtcGluZyAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2xpZGUodGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLnNsaWRlRHVyYXRpb24sIHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZnhfc2xpZGUnLCBmYWxzZSwgMC41KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQXBwbHkgZ3Jhdml0eVxyXG4gICAgICAgIHRoaXMudmVsb2NpdHlZICs9IHRoaXMuZ2FtZVNldHRpbmdzLmdyYXZpdHkgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMudmVsb2NpdHlZICogZGVsdGFUaW1lO1xyXG5cclxuICAgICAgICAvLyBHcm91bmQgY29sbGlzaW9uXHJcbiAgICAgICAgaWYgKHRoaXMueSA+PSB0aGlzLm9yaWdpbmFsWSkge1xyXG4gICAgICAgICAgICB0aGlzLnkgPSB0aGlzLm9yaWdpbmFsWTtcclxuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmlzSnVtcGluZyA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmp1bXBzUmVtYWluaW5nID0gdGhpcy5tYXhKdW1wczsgLy8gUmVzZXQganVtcHMgb24gbGFuZGluZ1xyXG4gICAgICAgICAgICB0aGlzLnJ1bkFuaW1hdGlvblRpbWVyID0gMDsgLy8gUmVzZXQgYW5pbWF0aW9uIHRpbWVyIG9uIGxhbmRpbmdcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlzSnVtcGluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTbGlkZSB0aW1lclxyXG4gICAgICAgIGlmICh0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICB0aGlzLnNsaWRlVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5zbGlkZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXNTbGlkaW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5oZWlnaHQ7IC8vIFJlc3RvcmUgb3JpZ2luYWwgaGVpZ2h0XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEludmluY2liaWxpdHkgdGltZXJcclxuICAgICAgICBpZiAodGhpcy5oaXRJbnZpbmNpYmlsaXR5VGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBhbmltYXRpb24gZnJhbWUgYmFzZWQgb24gcGxheWVyIHN0YXRlXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzSnVtcGluZyAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy5ydW5BbmltYXRpb25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnJ1bkFuaW1hdGlvblRpbWVyID49IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5ydW5BbmltYXRpb25TcGVlZCAvIDIpIHsgLy8gSGFsZiB0aGUgdG90YWwgY3ljbGUgdGltZSBmb3IgZWFjaCBmcmFtZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5ydW5BbmltYXRpb25UaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRSdW5GcmFtZSA9ICh0aGlzLmN1cnJlbnRSdW5GcmFtZSArIDEpICUgMjsgLy8gVG9nZ2xlIGJldHdlZW4gMCBhbmQgMVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBsZXQgY3VycmVudFJ1bkltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50UnVuRnJhbWUgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRSdW5JbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdjb29raWVfcnVuXzEnKSE7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50UnVuSW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnY29va2llX3J1bl8yJykhO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5pbWFnZSAhPT0gY3VycmVudFJ1bkltYWdlKSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZSA9IGN1cnJlbnRSdW5JbWFnZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc0p1bXBpbmcpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaW1hZ2UgIT09IHRoaXMuaW1hZ2VKdW1wKSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuaW1hZ2VKdW1wO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5pbWFnZSAhPT0gdGhpcy5pbWFnZVNsaWRlKSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuaW1hZ2VTbGlkZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyID4gMCAmJiBNYXRoLmZsb29yKHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyICogMTApICUgMikge1xyXG4gICAgICAgICAgICAvLyBCbGluayBlZmZlY3QgZHVyaW5nIGludmluY2liaWxpdHlcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAganVtcChmb3JjZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5pc0p1bXBpbmcgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMudmVsb2NpdHlZID0gLWZvcmNlO1xyXG4gICAgfVxyXG5cclxuICAgIHNsaWRlKGR1cmF0aW9uOiBudW1iZXIsIG9yaWdpbmFsSGVpZ2h0OiBudW1iZXIpIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNKdW1waW5nICYmICF0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICB0aGlzLmlzU2xpZGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuc2xpZGVUaW1lciA9IGR1cmF0aW9uO1xyXG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IG9yaWdpbmFsSGVpZ2h0ICogMC41OyAvLyBIYWxmIGhlaWdodCB3aGlsZSBzbGlkaW5nXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRha2VEYW1hZ2UoYW1vdW50OiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5oaXRJbnZpbmNpYmlsaXR5VGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmhlYWx0aCAtPSBhbW91bnQ7XHJcbiAgICAgICAgICAgIHRoaXMuaGl0SW52aW5jaWJpbGl0eVRpbWVyID0gdGhpcy5oaXRJbnZpbmNpYmlsaXR5RHVyYXRpb247XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFkZFNjb3JlKGFtb3VudDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5zY29yZSArPSBhbW91bnQ7XHJcbiAgICB9XHJcblxyXG4gICAgaXNJbnZpbmNpYmxlKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmhpdEludmluY2liaWxpdHlUaW1lciA+IDA7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIFBhcmFsbGF4QmFja2dyb3VuZCBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgcHJpdmF0ZSBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcixcclxuICAgICAgICBpbWFnZTogSFRNTEltYWdlRWxlbWVudCwgc3BlZWQ6IG51bWJlciwgY2FudmFzV2lkdGg6IG51bWJlclxyXG4gICAgKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2UsIHNwZWVkKTtcclxuICAgICAgICB0aGlzLmNhbnZhc1dpZHRoID0gY2FudmFzV2lkdGg7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lU3BlZWQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZ2FtZVNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBmaXJzdCBpbWFnZSBoYXMgc2Nyb2xsZWQgb2ZmLXNjcmVlblxyXG4gICAgICAgIGlmICh0aGlzLnggKyB0aGlzLndpZHRoIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMud2lkdGg7IC8vIE1vdmUgaXQgdG8gdGhlIHJpZ2h0IG9mIHRoZSBzZWNvbmQgaW1hZ2UgdG8gY3JlYXRlIGEgbG9vcFxyXG4gICAgICAgICAgICAvLyBUbyBlbnN1cmUgc2VhbWxlc3NuZXNzIGlmIGdhbWVTcGVlZCBpcyBoaWdoIGFuZCBmcmFtZSByYXRlIGxvdyxcclxuICAgICAgICAgICAgLy8gd2UgbWlnaHQgbmVlZCB0byBhZGp1c3QgYnkgYW5vdGhlciB3aWR0aCBpZiBpdCBqdW1wcyB0b28gZmFyXHJcbiAgICAgICAgICAgIGlmICh0aGlzLnggKyB0aGlzLndpZHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMueCArPSB0aGlzLndpZHRoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICAvLyBEcmF3IHRoZSBpbWFnZSB0d2ljZSB0byBlbnN1cmUgc2VhbWxlc3Mgc2Nyb2xsaW5nLlxyXG4gICAgICAgIC8vICd0aGlzLndpZHRoJyBpcyBleHBlY3RlZCB0byBiZSBlaXRoZXIgY2FudmFzV2lkdGggb3IgYSByZXBlYXRpbmcgdGlsZSB3aWR0aFxyXG4gICAgICAgIC8vIHRoYXQgY292ZXJzIHRoZSBjYW52YXMgd2hlbiBkcmF3biBhdCBsZWFzdCB0d2ljZSAodGhpcy54IGFuZCB0aGlzLnggKyB0aGlzLndpZHRoKS5cclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLnggKyB0aGlzLndpZHRoLCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZGF0YSE6IEdhbWVEYXRhO1xyXG4gICAgcHJpdmF0ZSBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlciA9IG5ldyBBc3NldE1hbmFnZXIoKTtcclxuICAgIHByaXZhdGUgaW5wdXRIYW5kbGVyOiBJbnB1dEhhbmRsZXIgPSBuZXcgSW5wdXRIYW5kbGVyKCk7XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG4gICAgcHJpdmF0ZSBsYXN0VGltZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIHBsYXllciE6IFBsYXllcjtcclxuICAgIHByaXZhdGUgYmFja2dyb3VuZHM6IFBhcmFsbGF4QmFja2dyb3VuZFtdID0gW107XHJcbiAgICBwcml2YXRlIGdyb3VuZCE6IFBhcmFsbGF4QmFja2dyb3VuZDsgXHJcbiAgICBwcml2YXRlIG9ic3RhY2xlczogR2FtZU9iamVjdFtdID0gW107XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlczogR2FtZU9iamVjdFtdID0gW107XHJcblxyXG4gICAgcHJpdmF0ZSBvYnN0YWNsZVNwYXduVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlU3Bhd25UaW1lcjogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIGN1cnJlbnRCR006IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGNvbnRleHQgbm90IGZvdW5kIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEdhbWVEYXRhKCk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuY3R4LmltYWdlU21vb3RoaW5nRW5hYmxlZCA9IHRydWU7IC8vIEZvciBiZXR0ZXIgc2NhbGluZ1xyXG5cclxuICAgICAgICAvLyBMb2FkIGFzc2V0c1xyXG4gICAgICAgIGF3YWl0IHRoaXMuYXNzZXRNYW5hZ2VyLmxvYWQodGhpcy5kYXRhLmFzc2V0cyk7XHJcbiAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIub25SZWFkeSgoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQXNzZXRzIGxvYWRlZC4gVHJhbnNpdGlvbmluZyB0byBUSVRMRSBzdGF0ZS5cIik7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QkdNID0gdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlLCAwLjUpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGE6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBGYWxsYmFjayB0byBkZWZhdWx0IG9yIGVycm9yIHN0YXRlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5jbGVhcktleVByZXNzQ2FsbGJhY2tzKCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIub25LZXlQcmVzcygnU3BhY2UnLCB0aGlzLnN0YXJ0R2FtZSk7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIub25LZXlQcmVzcygnY2xpY2snLCB0aGlzLnN0YXJ0R2FtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5jbGVhcktleVByZXNzQ2FsbGJhY2tzKCk7XHJcbiAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRCR00/LnBhdXNlKCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QkdNID0gdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ21fZ2FtZScsIHRydWUsIDAuNSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lT3ZlciA9ICgpID0+IHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QkdNPy5wYXVzZSgpO1xyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X2dhbWVfb3ZlcicsIGZhbHNlLCAwLjcpO1xyXG5cclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5jbGVhcktleVByZXNzQ2FsbGJhY2tzKCk7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIub25LZXlQcmVzcygnU3BhY2UnLCB0aGlzLnJldHVyblRvVGl0bGUpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLm9uS2V5UHJlc3MoJ2NsaWNrJywgdGhpcy5yZXR1cm5Ub1RpdGxlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJldHVyblRvVGl0bGUgPSAoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgdGhpcy5zZXR1cFRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QkdNPy5wYXVzZSgpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEJHTSA9IHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnYmdtX3RpdGxlJywgdHJ1ZSwgMC41KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZSgpIHtcclxuICAgICAgICBjb25zdCBncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgY29uc3QgcGxheWVySW1hZ2VSdW4xID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2Nvb2tpZV9ydW5fMScpITsgLy8gTm93IHNwZWNpZmljYWxseSAnY29va2llX3J1bl8xJ1xyXG4gICAgICAgIGNvbnN0IHBsYXllckltYWdlSnVtcCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdjb29raWVfanVtcCcpITtcclxuICAgICAgICBjb25zdCBwbGF5ZXJJbWFnZVNsaWRlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2Nvb2tpZV9zbGlkZScpITtcclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyR3JvdW5kWSA9IGdzLmNhbnZhc0hlaWdodCAqICgxIC0gZ3MuZ3JvdW5kLnlPZmZzZXQpIC0gZ3MucGxheWVyLmhlaWdodCArIGdzLnBsYXllci5ncm91bmRPZmZzZXRZO1xyXG5cclxuICAgICAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIoXHJcbiAgICAgICAgICAgIGdzLmNhbnZhc1dpZHRoICogMC4xLCAvLyBQbGF5ZXIgc3RhcnRpbmcgWFxyXG4gICAgICAgICAgICBwbGF5ZXJHcm91bmRZLFxyXG4gICAgICAgICAgICBncy5wbGF5ZXIud2lkdGgsXHJcbiAgICAgICAgICAgIGdzLnBsYXllci5oZWlnaHQsXHJcbiAgICAgICAgICAgIHBsYXllckltYWdlUnVuMSwgLy8gUGFzcyB0aGUgZmlyc3QgcnVuIGZyYW1lXHJcbiAgICAgICAgICAgIHBsYXllckltYWdlSnVtcCxcclxuICAgICAgICAgICAgcGxheWVySW1hZ2VTbGlkZSxcclxuICAgICAgICAgICAgZ3MucGxheWVyLm1heEhlYWx0aCxcclxuICAgICAgICAgICAgZ3MucGxheWVyLmhpdEludmluY2liaWxpdHlEdXJhdGlvbixcclxuICAgICAgICAgICAgZ3MsIC8vIFBhc3MgZ2FtZVNldHRpbmdzXHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLCAvLyBQYXNzIGlucHV0SGFuZGxlclxyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlciAvLyBQYXNzIGFzc2V0TWFuYWdlclxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZHMgPSBncy5iYWNrZ3JvdW5kcy5tYXAoYmcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWcgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShiZy5uYW1lKSE7XHJcbiAgICAgICAgICAgIGNvbnN0IGJnSGVpZ2h0ID0gZ3MuY2FudmFzSGVpZ2h0ICogYmcuaGVpZ2h0O1xyXG4gICAgICAgICAgICBjb25zdCBhc3BlY3RSYXRpbyA9IGltZy53aWR0aCAvIGltZy5oZWlnaHQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGJnV2lkdGggPSBiZ0hlaWdodCAqIGFzcGVjdFJhdGlvOyAvLyBTY2FsZSB3aWR0aCB0byBtYWludGFpbiBhc3BlY3QgcmF0aW8gd2l0aCBzY2FsZWQgaGVpZ2h0XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUGFyYWxsYXhCYWNrZ3JvdW5kKDAsIGdzLmNhbnZhc0hlaWdodCAqIGJnLnlPZmZzZXQsIGJnV2lkdGgsIGJnSGVpZ2h0LCBpbWcsIGJnLnNwZWVkTXVsdGlwbGllciwgdGhpcy5jYW52YXMud2lkdGgpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBncm91bmRJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKGdzLmdyb3VuZC5uYW1lKSE7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kSGVpZ2h0ID0gZ3MuY2FudmFzSGVpZ2h0ICogZ3MuZ3JvdW5kLmhlaWdodDtcclxuICAgICAgICBjb25zdCBncm91bmRZID0gZ3MuY2FudmFzSGVpZ2h0IC0gZ3JvdW5kSGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kID0gbmV3IFBhcmFsbGF4QmFja2dyb3VuZCgwLCBncm91bmRZLCB0aGlzLmNhbnZhcy53aWR0aCwgZ3JvdW5kSGVpZ2h0LCBncm91bmRJbWFnZSwgMS4wLCB0aGlzLmNhbnZhcy53aWR0aCk7IC8vIEdyb3VuZCB3aWR0aCBlcXVhbCB0byBjYW52YXMgd2lkdGggdG8gc3RhcnQsIGl0IHdpbGwgdGlsZVxyXG4gICAgICAgIFxyXG5cclxuICAgICAgICB0aGlzLm9ic3RhY2xlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVzID0gW107XHJcbiAgICAgICAgdGhpcy5vYnN0YWNsZVNwYXduVGltZXIgPSBncy5vYnN0YWNsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyID0gZ3Mub2JzdGFjbGUubWluU3Bhd25JbnRlcnZhbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wID0gKGN1cnJlbnRUaW1lOiBudW1iZXIpID0+IHtcclxuICAgICAgICBpZiAoIXRoaXMubGFzdFRpbWUpIHRoaXMubGFzdFRpbWUgPSBjdXJyZW50VGltZTtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuTE9BRElORykge1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlckxvYWRpbmdTY3JlZW4oKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICBjb25zdCBncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgcGxheWVyXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgYmFja2dyb3VuZHMgYW5kIGdyb3VuZFxyXG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRzLmZvckVhY2goYmcgPT4gYmcudXBkYXRlKGRlbHRhVGltZSwgZ3MuZ2FtZVNwZWVkKSk7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTcGF3biBvYnN0YWNsZXNcclxuICAgICAgICAgICAgdGhpcy5vYnN0YWNsZVNwYXduVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5vYnN0YWNsZVNwYXduVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zcGF3bk9ic3RhY2xlKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA9IE1hdGgucmFuZG9tKCkgKiAoZ3Mub2JzdGFjbGUubWF4U3Bhd25JbnRlcnZhbCAtIGdzLm9ic3RhY2xlLm1pblNwYXduSW50ZXJ2YWwpICsgZ3Mub2JzdGFjbGUubWluU3Bhd25JbnRlcnZhbDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gU3Bhd24gY29sbGVjdGlibGVzXHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25Db2xsZWN0aWJsZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZVNwYXduVGltZXIgPSBNYXRoLnJhbmRvbSgpICogKGdzLmNvbGxlY3RpYmxlLm1heFNwYXduSW50ZXJ2YWwgLSBncy5jb2xsZWN0aWJsZS5taW5TcGF3bkludGVydmFsKSArIGdzLmNvbGxlY3RpYmxlLm1pblNwYXduSW50ZXJ2YWw7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBvYnN0YWNsZXNcclxuICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMuZm9yRWFjaChvYnN0YWNsZSA9PiBvYnN0YWNsZS51cGRhdGUoZGVsdGFUaW1lLCBncy5nYW1lU3BlZWQgKiBncy5vYnN0YWNsZS5zcGVlZE11bHRpcGxpZXIpKTtcclxuICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMgPSB0aGlzLm9ic3RhY2xlcy5maWx0ZXIob2JzdGFjbGUgPT4gIW9ic3RhY2xlLmlzT2Zmc2NyZWVuKHRoaXMuY2FudmFzLndpZHRoKSk7XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgY29sbGVjdGlibGVzXHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzLmZvckVhY2goY29sbGVjdGlibGUgPT4gY29sbGVjdGlibGUudXBkYXRlKGRlbHRhVGltZSwgZ3MuZ2FtZVNwZWVkICogZ3MuY29sbGVjdGlibGUuc3BlZWRNdWx0aXBsaWVyKSk7XHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzID0gdGhpcy5jb2xsZWN0aWJsZXMuZmlsdGVyKGNvbGxlY3RpYmxlID0+ICFjb2xsZWN0aWJsZS5pc09mZnNjcmVlbih0aGlzLmNhbnZhcy53aWR0aCkpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jaGVja0NvbGxpc2lvbnMoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYWRkU2NvcmUoZGVsdGFUaW1lICogMTApOyAvLyBDb250aW51b3VzIHNjb3JlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyTG9hZGluZ1NjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ0xvYWRpbmcgQXNzZXRzLi4uJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgICAgICBjb25zdCBwcm9ncmVzcyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldExvYWRQcm9ncmVzcygpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAkeyhwcm9ncmVzcyAqIDEwMCkudG9GaXhlZCgwKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNDApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRpdGxlQmcgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgndGl0bGVfYmFja2dyb3VuZCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRpdGxlQmcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UodGl0bGVCZywgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdsaWdodGJsdWUnO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkICR7dGhpcy5kYXRhLmdhbWVTZXR0aW5ncy51aS5zY29yZUZvbnRTaXplICogMS41fXB4IEFyaWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdDb29raWUgUnVubmVyJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnVpLnNjb3JlRm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1ByZXNzIFNQQUNFIG9yIFRBUCB0byBTdGFydCcsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuXHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IGJhY2tncm91bmRzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJhY2tncm91bmRzLmZvckVhY2goYmcgPT4gYmcuZHJhdyh0aGlzLmN0eCkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ncm91bmQuZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRHJhdyBvYnN0YWNsZXMgYW5kIGNvbGxlY3RpYmxlc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMuZm9yRWFjaChvYnN0YWNsZSA9PiBvYnN0YWNsZS5kcmF3KHRoaXMuY3R4KSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5mb3JFYWNoKGNvbGxlY3RpYmxlID0+IGNvbGxlY3RpYmxlLmRyYXcodGhpcy5jdHgpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IHBsYXllclxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRHJhdyBVSVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VUkoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgY29uc3QgZ2FtZU92ZXJCZyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdnYW1lX292ZXJfYmFja2dyb3VuZCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGdhbWVPdmVyQmcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoZ2FtZU92ZXJCZywgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdkYXJrcmVkJztcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCAke3RoaXMuZGF0YS5nYW1lU2V0dGluZ3MudWkuc2NvcmVGb250U2l6ZSAqIDEuNX1weCBBcmlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnR0FNRSBPVkVSJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnVpLnNjb3JlRm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNDT1JFOiAke01hdGguZmxvb3IodGhpcy5wbGF5ZXIuc2NvcmUpfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMi4yKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdQcmVzcyBTUEFDRSBvciBUQVAgdG8gcmV0dXJuIHRvIFRpdGxlJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAxLjgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1VJKCkge1xyXG4gICAgICAgIGNvbnN0IGdzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICAvLyBTY29yZVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke2dzLnVpLnNjb3JlRm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgU0NPUkU6ICR7TWF0aC5mbG9vcih0aGlzLnBsYXllci5zY29yZSl9YCwgMTAsIDMwKTtcclxuXHJcbiAgICAgICAgLy8gSGVhbHRoIEJhclxyXG4gICAgICAgIGNvbnN0IGhlYWx0aEJhclggPSB0aGlzLmNhbnZhcy53aWR0aCAtIGdzLnVpLmhlYWx0aEJhcldpZHRoIC0gMTA7XHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFyWSA9IDEwO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRIZWFsdGhXaWR0aCA9ICh0aGlzLnBsYXllci5oZWFsdGggLyBncy5wbGF5ZXIubWF4SGVhbHRoKSAqIGdzLnVpLmhlYWx0aEJhcldpZHRoO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZ3JheSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgZ3MudWkuaGVhbHRoQmFyV2lkdGgsIGdzLnVpLmhlYWx0aEJhckhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgY3VycmVudEhlYWx0aFdpZHRoLCBncy51aS5oZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KGhlYWx0aEJhclgsIGhlYWx0aEJhclksIGdzLnVpLmhlYWx0aEJhcldpZHRoLCBncy51aS5oZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3Bhd25PYnN0YWNsZSgpIHtcclxuICAgICAgICBjb25zdCBncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgY29uc3Qgb2JzdGFjbGVJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdvYnN0YWNsZV9zcGlrZScpO1xyXG4gICAgICAgIGlmICghb2JzdGFjbGVJbWFnZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJPYnN0YWNsZSBpbWFnZSBub3QgZm91bmQhXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBvYnN0YWNsZVkgPSBncy5jYW52YXNIZWlnaHQgKiAoMSAtIGdzLmdyb3VuZC55T2Zmc2V0KSAtIGdzLm9ic3RhY2xlLmhlaWdodDtcclxuICAgICAgICB0aGlzLm9ic3RhY2xlcy5wdXNoKG5ldyBHYW1lT2JqZWN0KHRoaXMuY2FudmFzLndpZHRoLCBvYnN0YWNsZVksIGdzLm9ic3RhY2xlLndpZHRoLCBncy5vYnN0YWNsZS5oZWlnaHQsIG9ic3RhY2xlSW1hZ2UpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduQ29sbGVjdGlibGUoKSB7XHJcbiAgICAgICAgY29uc3QgZ3MgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIGNvbnN0IGplbGx5SW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnamVsbHlfYmFzaWMnKTtcclxuICAgICAgICBpZiAoIWplbGx5SW1hZ2UpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiQ29sbGVjdGlibGUgaW1hZ2Ugbm90IGZvdW5kIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbWluSmVsbHlZID0gZ3MuY2FudmFzSGVpZ2h0ICogKDEgLSBncy5ncm91bmQueU9mZnNldCkgLSBncy5jb2xsZWN0aWJsZS5oZWlnaHQgKiAyO1xyXG4gICAgICAgIGNvbnN0IG1heEplbGx5WSA9IGdzLmNhbnZhc0hlaWdodCAqICgxIC0gZ3MuZ3JvdW5kLnlPZmZzZXQpIC0gZ3MuY29sbGVjdGlibGUuaGVpZ2h0ICogNDtcclxuICAgICAgICBjb25zdCBqZWxseVkgPSBNYXRoLnJhbmRvbSgpICogKG1pbkplbGx5WSAtIG1heEplbGx5WSkgKyBtYXhKZWxseVk7XHJcblxyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVzLnB1c2gobmV3IEdhbWVPYmplY3QodGhpcy5jYW52YXMud2lkdGgsIGplbGx5WSwgZ3MuY29sbGVjdGlibGUud2lkdGgsIGdzLmNvbGxlY3RpYmxlLmhlaWdodCwgamVsbHlJbWFnZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hlY2tDb2xsaXNpb25zKCkge1xyXG4gICAgICAgIC8vIFBsYXllciB2cyBPYnN0YWNsZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5vYnN0YWNsZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3Qgb2JzdGFjbGUgPSB0aGlzLm9ic3RhY2xlc1tpXTtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmlzQ29sbGlkaW5nKG9ic3RhY2xlKSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnBsYXllci5pc0ludmluY2libGUoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnRha2VEYW1hZ2UoMSk7IC8vIE9uZSBkYW1hZ2UgcGVyIGhpdFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X2hpdCcsIGZhbHNlLCAwLjcpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVPdmVyKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFBsYXllciB2cyBDb2xsZWN0aWJsZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5jb2xsZWN0aWJsZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgY29sbGVjdGlibGUgPSB0aGlzLmNvbGxlY3RpYmxlc1tpXTtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmlzQ29sbGlkaW5nKGNvbGxlY3RpYmxlKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYWRkU2NvcmUodGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5jb2xsZWN0aWJsZS5zY29yZVZhbHVlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzLnNwbGljZShpLCAxKTsgLy8gUmVtb3ZlIGNvbGxlY3RlZCBpdGVtXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9jb2xsZWN0JywgZmFsc2UsIDAuNSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEluaXRpYWxpemUgdGhlIGdhbWVcclxuY29uc3QgZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbmdhbWUuaW5pdCgpOyJdLAogICJtYXBwaW5ncyI6ICJBQWlFQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUpDLFNBQUFBO0FBQUEsR0FBQTtBQU9MLE1BQU0sYUFBYTtBQUFBLEVBQW5CO0FBQ0ks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
