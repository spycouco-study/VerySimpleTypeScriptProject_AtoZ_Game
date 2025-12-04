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
    this.soundVolumes = /* @__PURE__ */ new Map();
    this.totalAssets = 0;
    this.loadedAssets = 0;
    this.readyCallbacks = [];
  }
  async load(assets) {
    this.totalAssets = assets.images.length + assets.sounds.length;
    const promises = [];
    assets.images.forEach((img) => {
      promises.push(this.loadImage(img.name, img.path));
    });
    assets.sounds.forEach((sound) => {
      promises.push(this.loadSound(sound.name, sound.path, sound.volume));
    });
    await Promise.all(promises);
    this.triggerReady();
  }
  loadImage(name, path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(name, img);
        this.loadedAssets++;
        resolve();
      };
      img.onerror = (e) => {
        console.error(`Failed to load image: ${path}`, e);
        this.loadedAssets++;
        resolve();
      };
      img.src = path;
    });
  }
  loadSound(name, path, initialVolume) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(path);
      audio.oncanplaythrough = () => {
        this.sounds.set(name, audio);
        this.soundVolumes.set(name, initialVolume);
        this.loadedAssets++;
        resolve();
      };
      audio.onerror = (e) => {
        console.error(`Failed to load sound: ${path}`, e);
        this.loadedAssets++;
        resolve();
      };
      audio.load();
    });
  }
  getImage(name) {
    return this.images.get(name);
  }
  playSound(name, loop = false, volume) {
    const audio = this.sounds.get(name);
    if (audio) {
      const clonedAudio = audio.cloneNode();
      clonedAudio.loop = loop;
      clonedAudio.volume = volume !== void 0 ? volume : this.soundVolumes.get(name) || 1;
      clonedAudio.play().catch((e) => console.warn(`Audio playback blocked for ${name}:`, e));
      return clonedAudio;
    }
    return void 0;
  }
  getLoadProgress() {
    return this.totalAssets === 0 ? 0 : this.loadedAssets / this.totalAssets;
  }
  onReady(callback) {
    if (this.loadedAssets === this.totalAssets && this.totalAssets > 0) {
      callback();
    } else {
      this.readyCallbacks.push(callback);
    }
  }
  triggerReady() {
    this.readyCallbacks.forEach((cb) => cb());
    this.readyCallbacks = [];
  }
}
class InputHandler {
  constructor() {
    this.keysDown = /* @__PURE__ */ new Set();
    this.keysPressedThisFrame = /* @__PURE__ */ new Set();
    this.mouseClickedThisFrame = false;
    this.touchStartedThisFrame = false;
    this.oneTimeKeyPressCallbacks = /* @__PURE__ */ new Map();
    this.oneTimeClickCallback = null;
    this.handleKeyDown = (e) => {
      if (!this.keysDown.has(e.code)) {
        this.keysPressedThisFrame.add(e.code);
        if (this.oneTimeKeyPressCallbacks.has(e.code)) {
          this.oneTimeKeyPressCallbacks.get(e.code)();
          this.oneTimeKeyPressCallbacks.delete(e.code);
        }
      }
      this.keysDown.add(e.code);
    };
    this.handleKeyUp = (e) => {
      this.keysDown.delete(e.code);
    };
    this.handleMouseDown = (e) => {
      if (e.button === 0) {
        if (!this.mouseClickedThisFrame) {
          this.mouseClickedThisFrame = true;
          if (this.oneTimeClickCallback) {
            this.oneTimeClickCallback();
            this.oneTimeClickCallback = null;
          }
        }
      }
    };
    this.handleTouchStart = (e) => {
      if (e.touches.length > 0) {
        if (!this.touchStartedThisFrame) {
          this.touchStartedThisFrame = true;
          if (this.oneTimeClickCallback) {
            this.oneTimeClickCallback();
            this.oneTimeClickCallback = null;
          }
        }
      }
    };
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("mousedown", this.handleMouseDown);
    window.addEventListener("touchstart", this.handleTouchStart);
  }
  clearFrameInput() {
    this.keysPressedThisFrame.clear();
    this.mouseClickedThisFrame = false;
    this.touchStartedThisFrame = false;
  }
  isKeyDown(keyCode) {
    return this.keysDown.has(keyCode);
  }
  wasKeyPressedThisFrame(keyCode) {
    return this.keysPressedThisFrame.has(keyCode);
  }
  wasClickedThisFrame() {
    return this.mouseClickedThisFrame || this.touchStartedThisFrame;
  }
  onKeyPress(keyCode, callback) {
    if (keyCode === "click") {
      this.oneTimeClickCallback = callback;
    } else {
      this.oneTimeKeyPressCallbacks.set(keyCode, callback);
    }
  }
  clearKeyPressCallbacks() {
    this.oneTimeKeyPressCallbacks.clear();
    this.oneTimeClickCallback = null;
  }
}
class GameObject {
  constructor(x, y, width, height, image) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.image = image;
  }
  update(deltaTime, gameSpeed) {
    this.x -= gameSpeed * deltaTime;
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
class ParallaxBackground {
  constructor(x, y, width, height, image, speedMultiplier, canvasWidth) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.image = image;
    this.speedMultiplier = speedMultiplier;
    this.canvasWidth = canvasWidth;
  }
  update(deltaTime, gameSpeed) {
    const scrollAmount = gameSpeed * this.speedMultiplier * deltaTime;
    this.x -= scrollAmount;
    if (this.x <= -this.width) {
      this.x += this.width;
    }
  }
  draw(ctx) {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
  }
}
var PlayerState = /* @__PURE__ */ ((PlayerState2) => {
  PlayerState2[PlayerState2["RUNNING"] = 0] = "RUNNING";
  PlayerState2[PlayerState2["JUMPING"] = 1] = "JUMPING";
  PlayerState2[PlayerState2["SLIDING"] = 2] = "SLIDING";
  return PlayerState2;
})(PlayerState || {});
class Player extends GameObject {
  constructor(x, y, width, height, runImageNames, jumpImageName, slideImageName, maxHealth, hitInvincibilityDuration, gameSettings, inputHandler, assetManager) {
    const initialImage = assetManager.getImage(runImageNames[0]);
    super(x, y, width, height, initialImage);
    this.velocityY = 0;
    this.isOnGround = true;
    this.playerState = 0 /* RUNNING */;
    this.runAnimationFrames = [];
    this.currentRunFrameIndex = 0;
    this.animationTimer = 0;
    this.isSliding = false;
    this.slideTimer = 0;
    this.score = 0;
    this.invincibilityTimer = 0;
    this.originalHeight = height;
    this.originalY = y;
    this.gameSettings = gameSettings;
    this.inputHandler = inputHandler;
    this.assetManager = assetManager;
    this.health = maxHealth;
    this.jumpsRemaining = gameSettings.player.maxJumps;
    this.runAnimationFrames = runImageNames.map((name) => assetManager.getImage(name));
    this.jumpImage = assetManager.getImage(jumpImageName);
    this.slideImage = assetManager.getImage(slideImageName);
    this.currentImage = this.runAnimationFrames[0];
  }
  draw(ctx) {
    if (this.invincibilityTimer > 0 && Math.floor(this.invincibilityTimer * 10) % 2 === 0) {
      return;
    }
    ctx.drawImage(this.currentImage, this.x, this.y, this.width, this.height);
  }
  update(deltaTime, gameSpeed) {
    const wantsToJump = this.inputHandler.wasKeyPressedThisFrame("Space") || this.inputHandler.wasKeyPressedThisFrame("KeyW") || this.inputHandler.wasKeyPressedThisFrame("ArrowUp") || this.inputHandler.wasClickedThisFrame();
    if (wantsToJump) {
      this.jump();
    }
    const wantsToSlide = this.inputHandler.wasKeyPressedThisFrame("KeyS") || this.inputHandler.wasKeyPressedThisFrame("ArrowDown");
    if (wantsToSlide) {
      this.startSlide();
    }
    this.velocityY += this.gameSettings.gravity * deltaTime;
    this.y += this.velocityY * deltaTime;
    const playerGroundY = this.gameSettings.canvasHeight * (1 - this.gameSettings.ground.yOffset) - this.originalHeight + this.gameSettings.player.groundOffsetY;
    if (this.y >= playerGroundY) {
      this.y = playerGroundY;
      if (!this.isOnGround) {
        this.isOnGround = true;
        this.velocityY = 0;
        this.jumpsRemaining = this.gameSettings.player.maxJumps;
        this.playerState = 0 /* RUNNING */;
        if (this.isSliding) this.stopSlide();
      }
    } else {
      this.isOnGround = false;
    }
    if (this.invincibilityTimer > 0) {
      this.invincibilityTimer -= deltaTime;
    }
    this.updateAnimation(deltaTime);
    if (this.isSliding) {
      this.slideTimer -= deltaTime;
      if (this.slideTimer <= 0) {
        this.stopSlide();
      }
    }
  }
  jump() {
    if (this.jumpsRemaining > 0 && !this.isSliding) {
      this.velocityY = -this.gameSettings.player.jumpForce;
      this.isOnGround = false;
      this.jumpsRemaining--;
      this.playerState = 1 /* JUMPING */;
      this.assetManager.playSound("sfx_jump", false);
    }
  }
  startSlide() {
    if (this.isOnGround && !this.isSliding) {
      this.isSliding = true;
      this.slideTimer = this.gameSettings.player.slideDuration;
      this.playerState = 2 /* SLIDING */;
      this.y = this.originalY + this.originalHeight * 0.5;
      this.height = this.originalHeight * 0.5;
      this.assetManager.playSound("sfx_slide", false);
    }
  }
  stopSlide() {
    if (this.isSliding) {
      this.isSliding = false;
      this.y = this.originalY;
      this.height = this.originalHeight;
      if (this.isOnGround) {
        this.playerState = 0 /* RUNNING */;
      } else {
        this.playerState = 1 /* JUMPING */;
      }
    }
  }
  updateAnimation(deltaTime) {
    if (this.playerState === 1 /* JUMPING */) {
      this.currentImage = this.jumpImage;
    } else if (this.playerState === 2 /* SLIDING */) {
      this.currentImage = this.slideImage;
    } else if (this.playerState === 0 /* RUNNING */) {
      this.animationTimer += deltaTime;
      if (this.animationTimer >= this.gameSettings.player.runAnimationSpeed) {
        this.animationTimer = 0;
        this.currentRunFrameIndex = (this.currentRunFrameIndex + 1) % this.runAnimationFrames.length;
        this.currentImage = this.runAnimationFrames[this.currentRunFrameIndex];
      }
    }
  }
  takeDamage(amount) {
    if (this.invincibilityTimer <= 0) {
      this.health -= amount;
      this.invincibilityTimer = this.gameSettings.player.hitInvincibilityDuration;
    }
  }
  isInvincible() {
    return this.invincibilityTimer > 0;
  }
  addScore(amount) {
    this.score += amount;
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
      this.currentBGM = this.assetManager.playSound("bgm_game", true);
    };
    this.gameOver = () => {
      this.gameState = 3 /* GAME_OVER */;
      this.currentBGM?.pause();
      this.assetManager.playSound("sfx_game_over", false);
      this.inputHandler.clearKeyPressCallbacks();
      this.inputHandler.onKeyPress("Space", this.returnToTitle);
      this.inputHandler.onKeyPress("click", this.returnToTitle);
    };
    this.returnToTitle = () => {
      this.gameState = 1 /* TITLE */;
      this.setupTitleScreen();
      this.currentBGM?.pause();
      this.currentBGM = this.assetManager.playSound("bgm_title", true);
    };
    this.gameLoop = (currentTime) => {
      if (!this.lastTime) this.lastTime = currentTime;
      const deltaTime = (currentTime - this.lastTime) / 1e3;
      this.lastTime = currentTime;
      this.inputHandler.clearFrameInput();
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
      this.currentBGM = this.assetManager.playSound("bgm_title", true);
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
    const playerGroundY = gs.canvasHeight * (1 - gs.ground.yOffset) - gs.player.height + gs.player.groundOffsetY;
    this.player = new Player(
      gs.canvasWidth * 0.1,
      playerGroundY,
      gs.player.width,
      gs.player.height,
      gs.player.runAnimationFrames,
      "cookie_jump",
      "cookie_slide",
      gs.player.maxHealth,
      gs.player.hitInvincibilityDuration,
      gs,
      this.inputHandler,
      this.assetManager
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
    const groundAspectRatio = groundImage.width / groundImage.height;
    const groundWidth = groundHeight * groundAspectRatio;
    this.ground = new ParallaxBackground(0, groundY, groundWidth, groundHeight, groundImage, 1, this.canvas.width);
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
          this.assetManager.playSound("sfx_hit", false);
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
        this.assetManager.playSound("sfx_collect", false);
      }
    }
  }
}
const game = new Game("gameCanvas");
game.init();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUixcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0SW5mbyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBJbWFnZUFzc2V0SW5mbyBleHRlbmRzIEFzc2V0SW5mbyB7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0SW5mbyBleHRlbmRzIEFzc2V0SW5mbyB7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0RhdGEge1xyXG4gICAgaW1hZ2VzOiBJbWFnZUFzc2V0SW5mb1tdO1xyXG4gICAgc291bmRzOiBTb3VuZEFzc2V0SW5mb1tdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUGxheWVyU2V0dGluZ3Mge1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAganVtcEZvcmNlOiBudW1iZXI7XHJcbiAgICBzbGlkZUR1cmF0aW9uOiBudW1iZXI7XHJcbiAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgIGhpdEludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgZ3JvdW5kT2Zmc2V0WTogbnVtYmVyO1xyXG4gICAgbWF4SnVtcHM6IG51bWJlcjtcclxuICAgIHJ1bkFuaW1hdGlvblNwZWVkOiBudW1iZXI7XHJcbiAgICBydW5BbmltYXRpb25GcmFtZXM6IHN0cmluZ1tdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgT2JzdGFjbGVTZXR0aW5ncyB7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBtaW5TcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICBtYXhTcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICBzcGVlZE11bHRpcGxpZXI6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIENvbGxlY3RpYmxlU2V0dGluZ3Mge1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgbWluU3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgbWF4U3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG4gICAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBCYWNrZ3JvdW5kTGF5ZXJTZXR0aW5ncyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBzcGVlZE11bHRpcGxpZXI6IG51bWJlcjtcclxuICAgIHlPZmZzZXQ6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR3JvdW5kU2V0dGluZ3Mge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB5T2Zmc2V0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBVSVNldHRpbmdzIHtcclxuICAgIHNjb3JlRm9udFNpemU6IG51bWJlcjtcclxuICAgIGhlYWx0aEJhcldpZHRoOiBudW1iZXI7XHJcbiAgICBoZWFsdGhCYXJIZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBnYW1lU3BlZWQ6IG51bWJlcjtcclxuICAgIGdyYXZpdHk6IG51bWJlcjtcclxuICAgIHBsYXllcjogUGxheWVyU2V0dGluZ3M7XHJcbiAgICBvYnN0YWNsZTogT2JzdGFjbGVTZXR0aW5ncztcclxuICAgIGNvbGxlY3RpYmxlOiBDb2xsZWN0aWJsZVNldHRpbmdzO1xyXG4gICAgYmFja2dyb3VuZHM6IEJhY2tncm91bmRMYXllclNldHRpbmdzW107XHJcbiAgICBncm91bmQ6IEdyb3VuZFNldHRpbmdzO1xyXG4gICAgdWk6IFVJU2V0dGluZ3M7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lRGF0YSB7XHJcbiAgICBnYW1lU2V0dGluZ3M6IEdhbWVTZXR0aW5ncztcclxuICAgIGFzc2V0czogQXNzZXRzRGF0YTtcclxufVxyXG5cclxuY2xhc3MgQXNzZXRNYW5hZ2VyIHtcclxuICAgIHByaXZhdGUgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgc291bmRWb2x1bWVzOiBNYXA8c3RyaW5nLCBudW1iZXI+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbG9hZGVkQXNzZXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSByZWFkeUNhbGxiYWNrczogKCgpID0+IHZvaWQpW10gPSBbXTtcclxuXHJcbiAgICBhc3luYyBsb2FkKGFzc2V0czogQXNzZXRzRGF0YSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMudG90YWxBc3NldHMgPSBhc3NldHMuaW1hZ2VzLmxlbmd0aCArIGFzc2V0cy5zb3VuZHMubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IHByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcclxuXHJcbiAgICAgICAgYXNzZXRzLmltYWdlcy5mb3JFYWNoKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5sb2FkSW1hZ2UoaW1nLm5hbWUsIGltZy5wYXRoKSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGFzc2V0cy5zb3VuZHMuZm9yRWFjaChzb3VuZCA9PiB7XHJcbiAgICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5sb2FkU291bmQoc291bmQubmFtZSwgc291bmQucGF0aCwgc291bmQudm9sdW1lKSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICAgICAgICB0aGlzLnRyaWdnZXJSZWFkeSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQobmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQXNzZXRzKys7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKGUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke3BhdGh9YCwgZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gcGF0aDtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRTb3VuZChuYW1lOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgaW5pdGlhbFZvbHVtZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8ocGF0aCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQobmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZFZvbHVtZXMuc2V0KG5hbWUsIGluaXRpYWxWb2x1bWUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9IChlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtwYXRofWAsIGUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ubG9hZCgpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEltYWdlKG5hbWU6IHN0cmluZyk6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmltYWdlcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcGxheVNvdW5kKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlLCB2b2x1bWU/OiBudW1iZXIpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgY29uc3QgY2xvbmVkQXVkaW8gPSBhdWRpby5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICBjbG9uZWRBdWRpby5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgY2xvbmVkQXVkaW8udm9sdW1lID0gdm9sdW1lICE9PSB1bmRlZmluZWQgPyB2b2x1bWUgOiAodGhpcy5zb3VuZFZvbHVtZXMuZ2V0KG5hbWUpIHx8IDEuMCk7XHJcbiAgICAgICAgICAgIGNsb25lZEF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgQXVkaW8gcGxheWJhY2sgYmxvY2tlZCBmb3IgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgICAgIHJldHVybiBjbG9uZWRBdWRpbztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICBnZXRMb2FkUHJvZ3Jlc3MoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50b3RhbEFzc2V0cyA9PT0gMCA/IDAgOiB0aGlzLmxvYWRlZEFzc2V0cyAvIHRoaXMudG90YWxBc3NldHM7XHJcbiAgICB9XHJcblxyXG4gICAgb25SZWFkeShjYWxsYmFjazogKCkgPT4gdm9pZCkge1xyXG4gICAgICAgIGlmICh0aGlzLmxvYWRlZEFzc2V0cyA9PT0gdGhpcy50b3RhbEFzc2V0cyAmJiB0aGlzLnRvdGFsQXNzZXRzID4gMCkge1xyXG4gICAgICAgICAgICBjYWxsYmFjaygpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVhZHlDYWxsYmFja3MucHVzaChjYWxsYmFjayk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdHJpZ2dlclJlYWR5KCkge1xyXG4gICAgICAgIHRoaXMucmVhZHlDYWxsYmFja3MuZm9yRWFjaChjYiA9PiBjYigpKTtcclxuICAgICAgICB0aGlzLnJlYWR5Q2FsbGJhY2tzID0gW107XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIElucHV0SGFuZGxlciB7XHJcbiAgICBwcml2YXRlIGtleXNEb3duOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcclxuICAgIHByaXZhdGUga2V5c1ByZXNzZWRUaGlzRnJhbWU6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xyXG4gICAgcHJpdmF0ZSBtb3VzZUNsaWNrZWRUaGlzRnJhbWU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgdG91Y2hTdGFydGVkVGhpc0ZyYW1lOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgcHJpdmF0ZSBvbmVUaW1lS2V5UHJlc3NDYWxsYmFja3M6IE1hcDxzdHJpbmcsICgpID0+IHZvaWQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBvbmVUaW1lQ2xpY2tDYWxsYmFjazogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMuaGFuZGxlS2V5VXApO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLmhhbmRsZU1vdXNlRG93bik7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCB0aGlzLmhhbmRsZVRvdWNoU3RhcnQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93biA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmtleXNEb3duLmhhcyhlLmNvZGUpKSB7XHJcbiAgICAgICAgICAgIHRoaXMua2V5c1ByZXNzZWRUaGlzRnJhbWUuYWRkKGUuY29kZSk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9uZVRpbWVLZXlQcmVzc0NhbGxiYWNrcy5oYXMoZS5jb2RlKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vbmVUaW1lS2V5UHJlc3NDYWxsYmFja3MuZ2V0KGUuY29kZSkhKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9uZVRpbWVLZXlQcmVzc0NhbGxiYWNrcy5kZWxldGUoZS5jb2RlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmtleXNEb3duLmFkZChlLmNvZGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAgPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xyXG4gICAgICAgIHRoaXMua2V5c0Rvd24uZGVsZXRlKGUuY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVNb3VzZURvd24gPSAoZTogTW91c2VFdmVudCkgPT4ge1xyXG4gICAgICAgIGlmIChlLmJ1dHRvbiA9PT0gMCkgeyAvLyBMZWZ0IGNsaWNrXHJcbiAgICAgICAgICAgIGlmICghdGhpcy5tb3VzZUNsaWNrZWRUaGlzRnJhbWUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubW91c2VDbGlja2VkVGhpc0ZyYW1lID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm9uZVRpbWVDbGlja0NhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vbmVUaW1lQ2xpY2tDYWxsYmFjaygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMub25lVGltZUNsaWNrQ2FsbGJhY2sgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlVG91Y2hTdGFydCA9IChlOiBUb3VjaEV2ZW50KSA9PiB7XHJcbiAgICAgICAgaWYgKGUudG91Y2hlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy50b3VjaFN0YXJ0ZWRUaGlzRnJhbWUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudG91Y2hTdGFydGVkVGhpc0ZyYW1lID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm9uZVRpbWVDbGlja0NhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vbmVUaW1lQ2xpY2tDYWxsYmFjaygpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMub25lVGltZUNsaWNrQ2FsbGJhY2sgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNsZWFyRnJhbWVJbnB1dCgpIHtcclxuICAgICAgICB0aGlzLmtleXNQcmVzc2VkVGhpc0ZyYW1lLmNsZWFyKCk7XHJcbiAgICAgICAgdGhpcy5tb3VzZUNsaWNrZWRUaGlzRnJhbWUgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLnRvdWNoU3RhcnRlZFRoaXNGcmFtZSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGlzS2V5RG93bihrZXlDb2RlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5rZXlzRG93bi5oYXMoa2V5Q29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgd2FzS2V5UHJlc3NlZFRoaXNGcmFtZShrZXlDb2RlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5rZXlzUHJlc3NlZFRoaXNGcmFtZS5oYXMoa2V5Q29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgd2FzQ2xpY2tlZFRoaXNGcmFtZSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tb3VzZUNsaWNrZWRUaGlzRnJhbWUgfHwgdGhpcy50b3VjaFN0YXJ0ZWRUaGlzRnJhbWU7XHJcbiAgICB9XHJcblxyXG4gICAgb25LZXlQcmVzcyhrZXlDb2RlOiBzdHJpbmcsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKSB7XHJcbiAgICAgICAgaWYgKGtleUNvZGUgPT09ICdjbGljaycpIHtcclxuICAgICAgICAgICAgdGhpcy5vbmVUaW1lQ2xpY2tDYWxsYmFjayA9IGNhbGxiYWNrO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMub25lVGltZUtleVByZXNzQ2FsbGJhY2tzLnNldChrZXlDb2RlLCBjYWxsYmFjayk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNsZWFyS2V5UHJlc3NDYWxsYmFja3MoKSB7XHJcbiAgICAgICAgdGhpcy5vbmVUaW1lS2V5UHJlc3NDYWxsYmFja3MuY2xlYXIoKTtcclxuICAgICAgICB0aGlzLm9uZVRpbWVDbGlja0NhbGxiYWNrID0gbnVsbDtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgR2FtZU9iamVjdCB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBpbWFnZTogSFRNTEltYWdlRWxlbWVudDtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50KSB7XHJcbiAgICAgICAgdGhpcy54ID0geDtcclxuICAgICAgICB0aGlzLnkgPSB5O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLmltYWdlID0gaW1hZ2U7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lU3BlZWQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCAtPSBnYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBpc0NvbGxpZGluZyhvdGhlcjogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnggPCBvdGhlci54ICsgb3RoZXIud2lkdGggJiZcclxuICAgICAgICAgICAgICAgdGhpcy54ICsgdGhpcy53aWR0aCA+IG90aGVyLnggJiZcclxuICAgICAgICAgICAgICAgdGhpcy55IDwgb3RoZXIueSArIG90aGVyLmhlaWdodCAmJlxyXG4gICAgICAgICAgICAgICB0aGlzLnkgKyB0aGlzLmhlaWdodCA+IG90aGVyLnk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNPZmZzY3JlZW4oY2FudmFzV2lkdGg6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnggKyB0aGlzLndpZHRoIDwgMDtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUGFyYWxsYXhCYWNrZ3JvdW5kIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQsIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyLCBjYW52YXNXaWR0aDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54ID0geDtcclxuICAgICAgICB0aGlzLnkgPSB5O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLmltYWdlID0gaW1hZ2U7XHJcbiAgICAgICAgdGhpcy5zcGVlZE11bHRpcGxpZXIgPSBzcGVlZE11bHRpcGxpZXI7XHJcbiAgICAgICAgdGhpcy5jYW52YXNXaWR0aCA9IGNhbnZhc1dpZHRoO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBzY3JvbGxBbW91bnQgPSAoZ2FtZVNwZWVkICogdGhpcy5zcGVlZE11bHRpcGxpZXIpICogZGVsdGFUaW1lO1xyXG4gICAgICAgIHRoaXMueCAtPSBzY3JvbGxBbW91bnQ7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnggPD0gLXRoaXMud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLnggKyB0aGlzLndpZHRoLCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxufVxyXG5cclxuZW51bSBQbGF5ZXJTdGF0ZSB7XHJcbiAgICBSVU5OSU5HLFxyXG4gICAgSlVNUElORyxcclxuICAgIFNMSURJTkcsXHJcbn1cclxuXHJcbmNsYXNzIFBsYXllciBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgcHJpdmF0ZSBnYW1lU2V0dGluZ3M6IEdhbWVTZXR0aW5ncztcclxuICAgIHByaXZhdGUgaW5wdXRIYW5kbGVyOiBJbnB1dEhhbmRsZXI7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyO1xyXG5cclxuICAgIHByaXZhdGUgdmVsb2NpdHlZOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBpc09uR3JvdW5kOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIHByaXZhdGUganVtcHNSZW1haW5pbmc6IG51bWJlcjtcclxuICAgIHByaXZhdGUgcGxheWVyU3RhdGU6IFBsYXllclN0YXRlID0gUGxheWVyU3RhdGUuUlVOTklORztcclxuXHJcbiAgICBwcml2YXRlIHJ1bkFuaW1hdGlvbkZyYW1lczogSFRNTEltYWdlRWxlbWVudFtdID0gW107XHJcbiAgICBwcml2YXRlIGN1cnJlbnRSdW5GcmFtZUluZGV4OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBhbmltYXRpb25UaW1lcjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY3VycmVudEltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG5cclxuICAgIHByaXZhdGUganVtcEltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBzbGlkZUltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG5cclxuICAgIHByaXZhdGUgaXNTbGlkaW5nOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIHNsaWRlVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG9yaWdpbmFsSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBwcml2YXRlIG9yaWdpbmFsWTogbnVtYmVyO1xyXG5cclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGludmluY2liaWxpdHlUaW1lcjogbnVtYmVyID0gMDtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsXHJcbiAgICAgICAgICAgICAgICBydW5JbWFnZU5hbWVzOiBzdHJpbmdbXSxcclxuICAgICAgICAgICAgICAgIGp1bXBJbWFnZU5hbWU6IHN0cmluZyxcclxuICAgICAgICAgICAgICAgIHNsaWRlSW1hZ2VOYW1lOiBzdHJpbmcsXHJcbiAgICAgICAgICAgICAgICBtYXhIZWFsdGg6IG51bWJlcixcclxuICAgICAgICAgICAgICAgIGhpdEludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyLFxyXG4gICAgICAgICAgICAgICAgZ2FtZVNldHRpbmdzOiBHYW1lU2V0dGluZ3MsXHJcbiAgICAgICAgICAgICAgICBpbnB1dEhhbmRsZXI6IElucHV0SGFuZGxlcixcclxuICAgICAgICAgICAgICAgIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyKSB7XHJcbiAgICAgICAgY29uc3QgaW5pdGlhbEltYWdlID0gYXNzZXRNYW5hZ2VyLmdldEltYWdlKHJ1bkltYWdlTmFtZXNbMF0pITtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbml0aWFsSW1hZ2UpO1xyXG5cclxuICAgICAgICB0aGlzLm9yaWdpbmFsSGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMub3JpZ2luYWxZID0geTtcclxuXHJcbiAgICAgICAgdGhpcy5nYW1lU2V0dGluZ3MgPSBnYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIgPSBpbnB1dEhhbmRsZXI7XHJcbiAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIgPSBhc3NldE1hbmFnZXI7XHJcblxyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gbWF4SGVhbHRoO1xyXG4gICAgICAgIHRoaXMuanVtcHNSZW1haW5pbmcgPSBnYW1lU2V0dGluZ3MucGxheWVyLm1heEp1bXBzO1xyXG5cclxuICAgICAgICB0aGlzLnJ1bkFuaW1hdGlvbkZyYW1lcyA9IHJ1bkltYWdlTmFtZXMubWFwKG5hbWUgPT4gYXNzZXRNYW5hZ2VyLmdldEltYWdlKG5hbWUpISk7XHJcbiAgICAgICAgdGhpcy5qdW1wSW1hZ2UgPSBhc3NldE1hbmFnZXIuZ2V0SW1hZ2UoanVtcEltYWdlTmFtZSkhO1xyXG4gICAgICAgIHRoaXMuc2xpZGVJbWFnZSA9IGFzc2V0TWFuYWdlci5nZXRJbWFnZShzbGlkZUltYWdlTmFtZSkhO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEltYWdlID0gdGhpcy5ydW5BbmltYXRpb25GcmFtZXNbMF07XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGlmICh0aGlzLmludmluY2liaWxpdHlUaW1lciA+IDAgJiYgTWF0aC5mbG9vcih0aGlzLmludmluY2liaWxpdHlUaW1lciAqIDEwKSAlIDIgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuY3VycmVudEltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCB3YW50c1RvSnVtcCA9IHRoaXMuaW5wdXRIYW5kbGVyLndhc0tleVByZXNzZWRUaGlzRnJhbWUoJ1NwYWNlJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLndhc0tleVByZXNzZWRUaGlzRnJhbWUoJ0tleVcnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIud2FzS2V5UHJlc3NlZFRoaXNGcmFtZSgnQXJyb3dVcCcpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmlucHV0SGFuZGxlci53YXNDbGlja2VkVGhpc0ZyYW1lKCk7IC8vIENsaWNrL1RhcCBhbHNvIHRyaWdnZXJzIGp1bXBcclxuICAgICAgICBpZiAod2FudHNUb0p1bXApIHtcclxuICAgICAgICAgICAgdGhpcy5qdW1wKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCB3YW50c1RvU2xpZGUgPSB0aGlzLmlucHV0SGFuZGxlci53YXNLZXlQcmVzc2VkVGhpc0ZyYW1lKCdLZXlTJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmlucHV0SGFuZGxlci53YXNLZXlQcmVzc2VkVGhpc0ZyYW1lKCdBcnJvd0Rvd24nKTtcclxuICAgICAgICBpZiAod2FudHNUb1NsaWRlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhcnRTbGlkZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy52ZWxvY2l0eVkgKz0gdGhpcy5nYW1lU2V0dGluZ3MuZ3Jhdml0eSAqIGRlbHRhVGltZTtcclxuICAgICAgICB0aGlzLnkgKz0gdGhpcy52ZWxvY2l0eVkgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZFkgPSB0aGlzLmdhbWVTZXR0aW5ncy5jYW52YXNIZWlnaHQgKiAoMSAtIHRoaXMuZ2FtZVNldHRpbmdzLmdyb3VuZC55T2Zmc2V0KSAtIHRoaXMub3JpZ2luYWxIZWlnaHQgKyB0aGlzLmdhbWVTZXR0aW5ncy5wbGF5ZXIuZ3JvdW5kT2Zmc2V0WTtcclxuICAgICAgICBpZiAodGhpcy55ID49IHBsYXllckdyb3VuZFkpIHtcclxuICAgICAgICAgICAgdGhpcy55ID0gcGxheWVyR3JvdW5kWTtcclxuICAgICAgICAgICAgaWYgKCF0aGlzLmlzT25Hcm91bmQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaXNPbkdyb3VuZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IDA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmp1bXBzUmVtYWluaW5nID0gdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLm1heEp1bXBzO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJTdGF0ZSA9IFBsYXllclN0YXRlLlJVTk5JTkc7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pc1NsaWRpbmcpIHRoaXMuc3RvcFNsaWRlKCk7IC8vIFN0b3Agc2xpZGluZyBpZiBsYW5kZWQgd2hpbGUgc2xpZGluZ1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pc09uR3JvdW5kID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmlsaXR5VGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJpbGl0eVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlQW5pbWF0aW9uKGRlbHRhVGltZSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICB0aGlzLnNsaWRlVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5zbGlkZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RvcFNsaWRlKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBqdW1wKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmp1bXBzUmVtYWluaW5nID4gMCAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSAtdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLmp1bXBGb3JjZTtcclxuICAgICAgICAgICAgdGhpcy5pc09uR3JvdW5kID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuanVtcHNSZW1haW5pbmctLTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJTdGF0ZSA9IFBsYXllclN0YXRlLkpVTVBJTkc7XHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X2p1bXAnLCBmYWxzZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRTbGlkZSgpIHtcclxuICAgICAgICBpZiAodGhpcy5pc09uR3JvdW5kICYmICF0aGlzLmlzU2xpZGluZykge1xyXG4gICAgICAgICAgICB0aGlzLmlzU2xpZGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuc2xpZGVUaW1lciA9IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5zbGlkZUR1cmF0aW9uO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllclN0YXRlID0gUGxheWVyU3RhdGUuU0xJRElORztcclxuXHJcbiAgICAgICAgICAgIHRoaXMueSA9IHRoaXMub3JpZ2luYWxZICsgKHRoaXMub3JpZ2luYWxIZWlnaHQgKiAwLjUpO1xyXG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMub3JpZ2luYWxIZWlnaHQgKiAwLjU7XHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X3NsaWRlJywgZmFsc2UpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0b3BTbGlkZSgpIHtcclxuICAgICAgICBpZiAodGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1NsaWRpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5vcmlnaW5hbFk7XHJcbiAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5vcmlnaW5hbEhlaWdodDtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaXNPbkdyb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJTdGF0ZSA9IFBsYXllclN0YXRlLlJVTk5JTkc7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllclN0YXRlID0gUGxheWVyU3RhdGUuSlVNUElORztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUFuaW1hdGlvbihkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICh0aGlzLnBsYXllclN0YXRlID09PSBQbGF5ZXJTdGF0ZS5KVU1QSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEltYWdlID0gdGhpcy5qdW1wSW1hZ2U7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBsYXllclN0YXRlID09PSBQbGF5ZXJTdGF0ZS5TTElESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEltYWdlID0gdGhpcy5zbGlkZUltYWdlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wbGF5ZXJTdGF0ZSA9PT0gUGxheWVyU3RhdGUuUlVOTklORykge1xyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGlvblRpbWVyICs9IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uVGltZXIgPj0gdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLnJ1bkFuaW1hdGlvblNwZWVkKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGlvblRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFJ1bkZyYW1lSW5kZXggPSAodGhpcy5jdXJyZW50UnVuRnJhbWVJbmRleCArIDEpICUgdGhpcy5ydW5BbmltYXRpb25GcmFtZXMubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50SW1hZ2UgPSB0aGlzLnJ1bkFuaW1hdGlvbkZyYW1lc1t0aGlzLmN1cnJlbnRSdW5GcmFtZUluZGV4XTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGFtb3VudDogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJpbGl0eVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5oZWFsdGggLT0gYW1vdW50O1xyXG4gICAgICAgICAgICB0aGlzLmludmluY2liaWxpdHlUaW1lciA9IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5oaXRJbnZpbmNpYmlsaXR5RHVyYXRpb247XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlzSW52aW5jaWJsZSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbnZpbmNpYmlsaXR5VGltZXIgPiAwO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFNjb3JlKGFtb3VudDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5zY29yZSArPSBhbW91bnQ7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZGF0YSE6IEdhbWVEYXRhO1xyXG4gICAgcHJpdmF0ZSBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlciA9IG5ldyBBc3NldE1hbmFnZXIoKTtcclxuICAgIHByaXZhdGUgaW5wdXRIYW5kbGVyOiBJbnB1dEhhbmRsZXIgPSBuZXcgSW5wdXRIYW5kbGVyKCk7XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG4gICAgcHJpdmF0ZSBsYXN0VGltZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIHBsYXllciE6IFBsYXllcjtcclxuICAgIHByaXZhdGUgYmFja2dyb3VuZHM6IFBhcmFsbGF4QmFja2dyb3VuZFtdID0gW107XHJcbiAgICBwcml2YXRlIGdyb3VuZCE6IFBhcmFsbGF4QmFja2dyb3VuZDsgXHJcbiAgICBwcml2YXRlIG9ic3RhY2xlczogR2FtZU9iamVjdFtdID0gW107XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlczogR2FtZU9iamVjdFtdID0gW107XHJcblxyXG4gICAgcHJpdmF0ZSBvYnN0YWNsZVNwYXduVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlU3Bhd25UaW1lcjogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIGN1cnJlbnRCR006IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGNvbnRleHQgbm90IGZvdW5kIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEdhbWVEYXRhKCk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuY3R4LmltYWdlU21vb3RoaW5nRW5hYmxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgIGF3YWl0IHRoaXMuYXNzZXRNYW5hZ2VyLmxvYWQodGhpcy5kYXRhLmFzc2V0cyk7XHJcbiAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIub25SZWFkeSgoKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQXNzZXRzIGxvYWRlZC4gVHJhbnNpdGlvbmluZyB0byBUSVRMRSBzdGF0ZS5cIik7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QkdNID0gdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEdhbWVEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhOicsIGVycm9yKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cFRpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLmNsZWFyS2V5UHJlc3NDYWxsYmFja3MoKTtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5vbktleVByZXNzKCdTcGFjZScsIHRoaXMuc3RhcnRHYW1lKTtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5vbktleVByZXNzKCdjbGljaycsIHRoaXMuc3RhcnRHYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSA9ICgpID0+IHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLmNsZWFyS2V5UHJlc3NDYWxsYmFja3MoKTtcclxuICAgICAgICB0aGlzLnJlc2V0R2FtZSgpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEJHTT8ucGF1c2UoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRCR00gPSB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2JnbV9nYW1lJywgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lT3ZlciA9ICgpID0+IHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QkdNPy5wYXVzZSgpO1xyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X2dhbWVfb3ZlcicsIGZhbHNlKTtcclxuXHJcbiAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIuY2xlYXJLZXlQcmVzc0NhbGxiYWNrcygpO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLm9uS2V5UHJlc3MoJ1NwYWNlJywgdGhpcy5yZXR1cm5Ub1RpdGxlKTtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlci5vbktleVByZXNzKCdjbGljaycsIHRoaXMucmV0dXJuVG9UaXRsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXR1cm5Ub1RpdGxlID0gKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgIHRoaXMuc2V0dXBUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEJHTT8ucGF1c2UoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRCR00gPSB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2JnbV90aXRsZScsIHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzZXRHYW1lKCkge1xyXG4gICAgICAgIGNvbnN0IGdzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBwbGF5ZXJHcm91bmRZID0gZ3MuY2FudmFzSGVpZ2h0ICogKDEgLSBncy5ncm91bmQueU9mZnNldCkgLSBncy5wbGF5ZXIuaGVpZ2h0ICsgZ3MucGxheWVyLmdyb3VuZE9mZnNldFk7XHJcblxyXG4gICAgICAgIHRoaXMucGxheWVyID0gbmV3IFBsYXllcihcclxuICAgICAgICAgICAgZ3MuY2FudmFzV2lkdGggKiAwLjEsXHJcbiAgICAgICAgICAgIHBsYXllckdyb3VuZFksXHJcbiAgICAgICAgICAgIGdzLnBsYXllci53aWR0aCxcclxuICAgICAgICAgICAgZ3MucGxheWVyLmhlaWdodCxcclxuICAgICAgICAgICAgZ3MucGxheWVyLnJ1bkFuaW1hdGlvbkZyYW1lcyxcclxuICAgICAgICAgICAgJ2Nvb2tpZV9qdW1wJyxcclxuICAgICAgICAgICAgJ2Nvb2tpZV9zbGlkZScsXHJcbiAgICAgICAgICAgIGdzLnBsYXllci5tYXhIZWFsdGgsXHJcbiAgICAgICAgICAgIGdzLnBsYXllci5oaXRJbnZpbmNpYmlsaXR5RHVyYXRpb24sXHJcbiAgICAgICAgICAgIGdzLFxyXG4gICAgICAgICAgICB0aGlzLmlucHV0SGFuZGxlcixcclxuICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXJcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB0aGlzLmJhY2tncm91bmRzID0gZ3MuYmFja2dyb3VuZHMubWFwKGJnID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoYmcubmFtZSkhO1xyXG4gICAgICAgICAgICBjb25zdCBiZ0hlaWdodCA9IGdzLmNhbnZhc0hlaWdodCAqIGJnLmhlaWdodDtcclxuICAgICAgICAgICAgY29uc3QgYXNwZWN0UmF0aW8gPSBpbWcud2lkdGggLyBpbWcuaGVpZ2h0O1xyXG4gICAgICAgICAgICBjb25zdCBiZ1dpZHRoID0gYmdIZWlnaHQgKiBhc3BlY3RSYXRpbztcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQYXJhbGxheEJhY2tncm91bmQoMCwgZ3MuY2FudmFzSGVpZ2h0ICogYmcueU9mZnNldCwgYmdXaWR0aCwgYmdIZWlnaHQsIGltZywgYmcuc3BlZWRNdWx0aXBsaWVyLCB0aGlzLmNhbnZhcy53aWR0aCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdyb3VuZEltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoZ3MuZ3JvdW5kLm5hbWUpITtcclxuICAgICAgICBjb25zdCBncm91bmRIZWlnaHQgPSBncy5jYW52YXNIZWlnaHQgKiBncy5ncm91bmQuaGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZFkgPSBncy5jYW52YXNIZWlnaHQgLSBncm91bmRIZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kQXNwZWN0UmF0aW8gPSBncm91bmRJbWFnZS53aWR0aCAvIGdyb3VuZEltYWdlLmhlaWdodDtcclxuICAgICAgICBjb25zdCBncm91bmRXaWR0aCA9IGdyb3VuZEhlaWdodCAqIGdyb3VuZEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kID0gbmV3IFBhcmFsbGF4QmFja2dyb3VuZCgwLCBncm91bmRZLCBncm91bmRXaWR0aCwgZ3JvdW5kSGVpZ2h0LCBncm91bmRJbWFnZSwgMS4wLCB0aGlzLmNhbnZhcy53aWR0aCk7XHJcbiAgICAgICAgXHJcblxyXG4gICAgICAgIHRoaXMub2JzdGFjbGVzID0gW107XHJcbiAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMgPSBbXTtcclxuICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA9IGdzLm9ic3RhY2xlLm1pblNwYXduSW50ZXJ2YWw7XHJcbiAgICAgICAgdGhpcy5jb2xsZWN0aWJsZVNwYXduVGltZXIgPSBncy5jb2xsZWN0aWJsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AgPSAoY3VycmVudFRpbWU6IG51bWJlcikgPT4ge1xyXG4gICAgICAgIGlmICghdGhpcy5sYXN0VGltZSkgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDtcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLmNsZWFyRnJhbWVJbnB1dCgpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5MT0FESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyTG9hZGluZ1NjcmVlbigpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGdzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncztcclxuXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRzLmZvckVhY2goYmcgPT4gYmcudXBkYXRlKGRlbHRhVGltZSwgZ3MuZ2FtZVNwZWVkKSk7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNwYXduT2JzdGFjbGUoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMub2JzdGFjbGVTcGF3blRpbWVyID0gTWF0aC5yYW5kb20oKSAqIChncy5vYnN0YWNsZS5tYXhTcGF3bkludGVydmFsIC0gZ3Mub2JzdGFjbGUubWluU3Bhd25JbnRlcnZhbCkgKyBncy5vYnN0YWNsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNwYXduQ29sbGVjdGlibGUoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyID0gTWF0aC5yYW5kb20oKSAqIChncy5jb2xsZWN0aWJsZS5tYXhTcGF3bkludGVydmFsIC0gZ3MuY29sbGVjdGlibGUubWluU3Bhd25JbnRlcnZhbCkgKyBncy5jb2xsZWN0aWJsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlcy5mb3JFYWNoKG9ic3RhY2xlID0+IG9ic3RhY2xlLnVwZGF0ZShkZWx0YVRpbWUsIGdzLmdhbWVTcGVlZCAqIGdzLm9ic3RhY2xlLnNwZWVkTXVsdGlwbGllcikpO1xyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlcyA9IHRoaXMub2JzdGFjbGVzLmZpbHRlcihvYnN0YWNsZSA9PiAhb2JzdGFjbGUuaXNPZmZzY3JlZW4odGhpcy5jYW52YXMud2lkdGgpKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzLmZvckVhY2goY29sbGVjdGlibGUgPT4gY29sbGVjdGlibGUudXBkYXRlKGRlbHRhVGltZSwgZ3MuZ2FtZVNwZWVkICogZ3MuY29sbGVjdGlibGUuc3BlZWRNdWx0aXBsaWVyKSk7XHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzID0gdGhpcy5jb2xsZWN0aWJsZXMuZmlsdGVyKGNvbGxlY3RpYmxlID0+ICFjb2xsZWN0aWJsZS5pc09mZnNjcmVlbih0aGlzLmNhbnZhcy53aWR0aCkpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jaGVja0NvbGxpc2lvbnMoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYWRkU2NvcmUoZGVsdGFUaW1lICogMTApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlckxvYWRpbmdTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdMb2FkaW5nIEFzc2V0cy4uLicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgY29uc3QgcHJvZ3Jlc3MgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRMb2FkUHJvZ3Jlc3MoKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHsocHJvZ3Jlc3MgKiAxMDApLnRvRml4ZWQoMCl9JWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDQwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aXRsZUJnID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ3RpdGxlX2JhY2tncm91bmQnKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aXRsZUJnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRpdGxlQmcsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnbGlnaHRibHVlJztcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCAke3RoaXMuZGF0YS5nYW1lU2V0dGluZ3MudWkuc2NvcmVGb250U2l6ZSAqIDEuNX1weCBBcmlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnQ29va2llIFJ1bm5lcicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gYCR7dGhpcy5kYXRhLmdhbWVTZXR0aW5ncy51aS5zY29yZUZvbnRTaXplfXB4IEFyaWFsYDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdQcmVzcyBTUEFDRSBvciBUQVAgdG8gU3RhcnQnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kcy5mb3JFYWNoKGJnID0+IGJnLmRyYXcodGhpcy5jdHgpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ3JvdW5kLmRyYXcodGhpcy5jdHgpO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMub2JzdGFjbGVzLmZvckVhY2gob2JzdGFjbGUgPT4gb2JzdGFjbGUuZHJhdyh0aGlzLmN0eCkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMuZm9yRWFjaChjb2xsZWN0aWJsZSA9PiBjb2xsZWN0aWJsZS5kcmF3KHRoaXMuY3R4KSk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VUkoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgY29uc3QgZ2FtZU92ZXJCZyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdnYW1lX292ZXJfYmFja2dyb3VuZCcpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGdhbWVPdmVyQmcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoZ2FtZU92ZXJCZywgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdkYXJrcmVkJztcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCAke3RoaXMuZGF0YS5nYW1lU2V0dGluZ3MudWkuc2NvcmVGb250U2l6ZSAqIDEuNX1weCBBcmlhbGA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnR0FNRSBPVkVSJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnVpLnNjb3JlRm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNDT1JFOiAke01hdGguZmxvb3IodGhpcy5wbGF5ZXIuc2NvcmUpfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMi4yKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdQcmVzcyBTUEFDRSBvciBUQVAgdG8gcmV0dXJuIHRvIFRpdGxlJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAxLjgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1VJKCkge1xyXG4gICAgICAgIGNvbnN0IGdzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHtncy51aS5zY29yZUZvbnRTaXplfXB4IEFyaWFsYDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNDT1JFOiAke01hdGguZmxvb3IodGhpcy5wbGF5ZXIuc2NvcmUpfWAsIDEwLCAzMCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGhlYWx0aEJhclggPSB0aGlzLmNhbnZhcy53aWR0aCAtIGdzLnVpLmhlYWx0aEJhcldpZHRoIC0gMTA7XHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFyWSA9IDEwO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRIZWFsdGhXaWR0aCA9ICh0aGlzLnBsYXllci5oZWFsdGggLyBncy5wbGF5ZXIubWF4SGVhbHRoKSAqIGdzLnVpLmhlYWx0aEJhcldpZHRoO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnZ3JheSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgZ3MudWkuaGVhbHRoQmFyV2lkdGgsIGdzLnVpLmhlYWx0aEJhckhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgY3VycmVudEhlYWx0aFdpZHRoLCBncy51aS5oZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KGhlYWx0aEJhclgsIGhlYWx0aEJhclksIGdzLnVpLmhlYWx0aEJhcldpZHRoLCBncy51aS5oZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3Bhd25PYnN0YWNsZSgpIHtcclxuICAgICAgICBjb25zdCBncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgY29uc3Qgb2JzdGFjbGVJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdvYnN0YWNsZV9zcGlrZScpO1xyXG4gICAgICAgIGlmICghb2JzdGFjbGVJbWFnZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJPYnN0YWNsZSBpbWFnZSBub3QgZm91bmQhXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBvYnN0YWNsZVkgPSBncy5jYW52YXNIZWlnaHQgKiAoMSAtIGdzLmdyb3VuZC55T2Zmc2V0KSAtIGdzLm9ic3RhY2xlLmhlaWdodDtcclxuICAgICAgICB0aGlzLm9ic3RhY2xlcy5wdXNoKG5ldyBHYW1lT2JqZWN0KHRoaXMuY2FudmFzLndpZHRoLCBvYnN0YWNsZVksIGdzLm9ic3RhY2xlLndpZHRoLCBncy5vYnN0YWNsZS5oZWlnaHQsIG9ic3RhY2xlSW1hZ2UpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduQ29sbGVjdGlibGUoKSB7XHJcbiAgICAgICAgY29uc3QgZ3MgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIGNvbnN0IGplbGx5SW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnamVsbHlfYmFzaWMnKTtcclxuICAgICAgICBpZiAoIWplbGx5SW1hZ2UpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiQ29sbGVjdGlibGUgaW1hZ2Ugbm90IGZvdW5kIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbWluSmVsbHlZID0gZ3MuY2FudmFzSGVpZ2h0ICogKDEgLSBncy5ncm91bmQueU9mZnNldCkgLSBncy5jb2xsZWN0aWJsZS5oZWlnaHQgKiAyO1xyXG4gICAgICAgIGNvbnN0IG1heEplbGx5WSA9IGdzLmNhbnZhc0hlaWdodCAqICgxIC0gZ3MuZ3JvdW5kLnlPZmZzZXQpIC0gZ3MuY29sbGVjdGlibGUuaGVpZ2h0ICogNDtcclxuICAgICAgICBjb25zdCBqZWxseVkgPSBNYXRoLnJhbmRvbSgpICogKG1pbkplbGx5WSAtIG1heEplbGx5WSkgKyBtYXhKZWxseVk7XHJcblxyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVzLnB1c2gobmV3IEdhbWVPYmplY3QodGhpcy5jYW52YXMud2lkdGgsIGplbGx5WSwgZ3MuY29sbGVjdGlibGUud2lkdGgsIGdzLmNvbGxlY3RpYmxlLmhlaWdodCwgamVsbHlJbWFnZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hlY2tDb2xsaXNpb25zKCkge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLm9ic3RhY2xlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICBjb25zdCBvYnN0YWNsZSA9IHRoaXMub2JzdGFjbGVzW2ldO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuaXNDb2xsaWRpbmcob2JzdGFjbGUpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMucGxheWVyLmlzSW52aW5jaWJsZSgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIudGFrZURhbWFnZSgxKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9oaXQnLCBmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMuY29sbGVjdGlibGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbGxlY3RpYmxlID0gdGhpcy5jb2xsZWN0aWJsZXNbaV07XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5pc0NvbGxpZGluZyhjb2xsZWN0aWJsZSkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmFkZFNjb3JlKHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY29sbGVjdGlibGUuc2NvcmVWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9jb2xsZWN0JywgZmFsc2UpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxy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
