function checkCollision(rect1, rect2) {
  return rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x && rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y;
}
class AssetLoader {
  constructor(onProgress) {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.loadedCount = 0;
    this.totalCount = 0;
    this.onProgress = onProgress;
  }
  async load(imageAssets, soundAssets) {
    this.totalCount = imageAssets.length + soundAssets.length;
    if (this.totalCount === 0) {
      this.onProgress?.(1);
      return Promise.resolve();
    }
    const imagePromises = imageAssets.map((asset) => this.loadImage(asset));
    const soundPromises = soundAssets.map((asset) => this.loadSound(asset));
    await Promise.allSettled([...imagePromises, ...soundPromises]);
    this.onProgress?.(1);
  }
  updateProgress() {
    this.loadedCount++;
    this.onProgress?.(this.progress);
  }
  loadImage(asset) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(asset.name, img);
        this.updateProgress();
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${asset.path}`);
        this.updateProgress();
        resolve();
      };
      img.src = asset.path;
    });
  }
  loadSound(asset) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.oncanplaythrough = () => {
        audio.volume = asset.volume;
        this.sounds.set(asset.name, audio);
        this.updateProgress();
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${asset.path}`);
        this.updateProgress();
        resolve();
      };
      audio.src = asset.path;
      audio.load();
    });
  }
  getImage(name) {
    const img = this.images.get(name);
    if (!img) {
      console.warn(`Image "${name}" not found in assets. Returning a dummy image.`);
      const dummy = new Image();
      dummy.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      return dummy;
    }
    return img;
  }
  getSound(name) {
    const sound = this.sounds.get(name);
    if (!sound) {
      console.warn(`Sound "${name}" not found in assets. Returning a dummy Audio.`);
      return new Audio();
    }
    return sound;
  }
  get progress() {
    return this.totalCount > 0 ? this.loadedCount / this.totalCount : 1;
  }
}
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["CONTROLS"] = 2] = "CONTROLS";
  GameState2[GameState2["PLAYING"] = 3] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 4] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var PlayerAnimationState = /* @__PURE__ */ ((PlayerAnimationState2) => {
  PlayerAnimationState2[PlayerAnimationState2["RUNNING"] = 0] = "RUNNING";
  PlayerAnimationState2[PlayerAnimationState2["JUMPING"] = 1] = "JUMPING";
  PlayerAnimationState2[PlayerAnimationState2["SLIDING"] = 2] = "SLIDING";
  return PlayerAnimationState2;
})(PlayerAnimationState || {});
class Player {
  constructor(config, assetLoader, groundY) {
    this.config = config;
    this.assetLoader = assetLoader;
    // Player's height when running
    this.velocityY = 0;
    this.onGround = true;
    this.animationState = 0 /* RUNNING */;
    this.currentAnimationFrame = 0;
    this.animationTimer = 0;
    this.slideTimer = 0;
    this.isInvincible = false;
    this.invincibleTimer = 0;
    this.blinkTimer = 0;
    this.x = config.x;
    this.y = config.y;
    this.width = config.width;
    this.height = config.height;
    this.initialHeight = config.height;
    this.baseY = groundY - config.height;
    this.y = this.baseY;
    this.lives = config.lives;
  }
  jump() {
    if (this.onGround && this.animationState !== 2 /* SLIDING */) {
      this.velocityY = -this.config.jumpForce;
      this.onGround = false;
      this.animationState = 1 /* JUMPING */;
      this.animationTimer = 0;
      return true;
    }
    return false;
  }
  slide() {
    if (this.onGround && this.animationState !== 1 /* JUMPING */ && this.animationState !== 2 /* SLIDING */) {
      this.animationState = 2 /* SLIDING */;
      this.height = this.config.slideHeight;
      this.y = this.baseY + (this.initialHeight - this.config.slideHeight);
      this.slideTimer = this.config.slideDuration;
      this.animationTimer = 0;
      return true;
    }
    return false;
  }
  update(deltaTime, groundY) {
    if (!this.onGround) {
      this.velocityY += this.config.gravity * deltaTime;
    }
    this.y += this.velocityY * deltaTime;
    if (this.y + this.height >= groundY) {
      this.y = groundY - this.height;
      if (!this.onGround) {
        this.onGround = true;
        this.velocityY = 0;
        if (this.animationState === 1 /* JUMPING */) {
          this.animationState = 0 /* RUNNING */;
          this.height = this.initialHeight;
          this.y = this.baseY;
        }
      }
    }
    if (this.animationState === 2 /* SLIDING */) {
      this.slideTimer -= deltaTime;
      if (this.slideTimer <= 0) {
        this.animationState = 0 /* RUNNING */;
        this.height = this.initialHeight;
        this.y = this.baseY;
      }
    }
    this.animationTimer += deltaTime;
    if (this.animationState === 0 /* RUNNING */ && this.animationTimer >= this.config.animationSpeed) {
      this.currentAnimationFrame = (this.currentAnimationFrame + 1) % this.config.runningFrames.length;
      this.animationTimer = 0;
    }
    if (this.isInvincible) {
      this.invincibleTimer -= deltaTime;
      this.blinkTimer += deltaTime;
      if (this.invincibleTimer <= 0) {
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.blinkTimer = 0;
      }
    }
  }
  draw(ctx) {
    if (this.isInvincible && Math.floor(this.blinkTimer * this.config.blinkFrequency) % 2 === 0) {
      return;
    }
    let image;
    switch (this.animationState) {
      case 1 /* JUMPING */:
        image = this.assetLoader.getImage(this.config.jumpingFrame);
        break;
      case 2 /* SLIDING */:
        image = this.assetLoader.getImage(this.config.slidingFrame);
        break;
      case 0 /* RUNNING */:
      default:
        image = this.assetLoader.getImage(this.config.runningFrames[this.currentAnimationFrame]);
        break;
    }
    ctx.drawImage(image, this.x, this.y, this.width, this.height);
  }
  getCollisionRect() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
  hit(damage) {
    if (!this.isInvincible) {
      this.lives -= damage;
      this.isInvincible = true;
      this.invincibleTimer = this.config.invincibilityDuration;
      this.blinkTimer = 0;
      return true;
    }
    return false;
  }
  reset() {
    this.x = this.config.x;
    this.y = this.baseY;
    this.width = this.config.width;
    this.height = this.initialHeight;
    this.velocityY = 0;
    this.onGround = true;
    this.animationState = 0 /* RUNNING */;
    this.currentAnimationFrame = 0;
    this.animationTimer = 0;
    this.slideTimer = 0;
    this.isInvincible = false;
    this.invincibleTimer = 0;
    this.blinkTimer = 0;
    this.lives = this.config.lives;
  }
}
class ParallaxLayer {
  // Calculated based on game speed and multiplier
  constructor(config, assetLoader, canvasWidth) {
    this.config = config;
    this.assetLoader = assetLoader;
    this.x = 0;
    this.image = this.assetLoader.getImage(config.image);
    this.y = config.yOffset;
    this.height = config.height;
    this.width = this.image.width;
    if (this.width === 0) {
      this.width = canvasWidth;
    }
    this.speed = 0;
  }
  update(deltaTime, gameSpeed) {
    this.speed = gameSpeed * this.config.speedMultiplier;
    this.x -= this.speed * deltaTime;
    if (this.x <= -this.width) {
      this.x += this.width;
    }
  }
  draw(ctx) {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
    if (this.width < ctx.canvas.width) {
      ctx.drawImage(this.image, this.x + this.width * 2, this.y, this.width, this.height);
    }
  }
}
class Ground {
  // Same as game speed
  constructor(config, assetLoader, canvasWidth) {
    this.config = config;
    this.assetLoader = assetLoader;
    this.x = 0;
    this.image = this.assetLoader.getImage(config.image);
    this.y = config.y;
    this.height = config.height;
    this.width = this.image.width;
    if (this.width === 0) {
      this.width = canvasWidth;
    }
    this.speed = 0;
  }
  update(deltaTime, gameSpeed) {
    this.speed = gameSpeed;
    this.x -= this.speed * deltaTime;
    if (this.x <= -this.width) {
      this.x += this.width;
    }
  }
  draw(ctx) {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
  }
  getCollisionRect() {
    return { x: this.x, y: this.y, width: this.width * 2, height: this.height };
  }
}
class Obstacle {
  // To prevent multiple collision checks
  constructor(config, assetLoader, groundY, initialX) {
    this.config = config;
    this.assetLoader = assetLoader;
    this.active = false;
    this.collided = false;
    this.image = this.assetLoader.getImage(config.image);
    this.width = config.width;
    this.height = config.height;
    this.x = initialX;
    this.y = groundY - config.yOffset - this.height;
  }
  update(deltaTime, gameSpeed) {
    this.x -= gameSpeed * deltaTime;
    if (this.x + this.width < 0) {
      this.active = false;
    }
  }
  draw(ctx) {
    if (this.active) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
  }
  getCollisionRect() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
  reset(newX) {
    this.x = newX;
    this.active = true;
    this.collided = false;
  }
}
class Collectible {
  constructor(config, assetLoader, initialX, initialY) {
    this.config = config;
    this.assetLoader = assetLoader;
    this.active = false;
    this.collected = false;
    this.image = this.assetLoader.getImage(config.image);
    this.width = config.width;
    this.height = config.height;
    this.x = initialX;
    this.y = initialY;
    this.scoreValue = config.scoreValue;
  }
  update(deltaTime, gameSpeed) {
    this.x -= gameSpeed * deltaTime;
    if (this.x + this.width < 0) {
      this.active = false;
    }
  }
  draw(ctx) {
    if (this.active && !this.collected) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
  }
  getCollisionRect() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
  reset(newX, newY) {
    this.x = newX;
    this.y = newY;
    this.active = true;
    this.collected = false;
  }
}
class Game {
  // For title and controls screen
  constructor(canvasId) {
    this.state = 0 /* LOADING */;
    this.lastFrameTime = 0;
    this.gameSpeed = 0;
    this.currentSpeed = 0;
    // Current actual speed for scrolling
    this.gamePaused = false;
    this.parallaxLayers = [];
    this.obstacles = [];
    this.collectibles = [];
    this.obstacleSpawnTimer = 0;
    this.nextObstacleSpawnTime = 0;
    this.collectibleSpawnTimer = 0;
    // NEW: Timer for standalone collectibles
    this.nextCollectibleSpawnTime = 0;
    // NEW: Next spawn time for standalone collectibles
    this.score = 0;
    this.highScores = [];
    this.scoreDisplay = 0;
    this.bgmSource = null;
    this.bgmBuffer = null;
    this.keyPressed = {};
    this.isWaitingForInput = true;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with ID "${canvasId}" not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      throw new Error("Failed to get 2D rendering context.");
    }
    this.assetLoader = new AssetLoader(this.drawLoadingScreen.bind(this));
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.bgmGainNode = this.audioContext.createGain();
    this.bgmGainNode.connect(this.audioContext.destination);
    this.loadGameData();
    this.addEventListeners();
  }
  async loadGameData() {
    try {
      const response = await fetch("data.json");
      this.config = await response.json();
      this.canvas.width = this.config.canvas.width;
      this.canvas.height = this.config.canvas.height;
      await this.assetLoader.load(this.config.assets.images, this.config.assets.sounds);
      const bgmAssetConfig = this.config.assets.sounds.find((s) => s.name === "bgm");
      if (bgmAssetConfig) {
        try {
          const bgmResponse = await fetch(bgmAssetConfig.path);
          const arrayBuffer = await bgmResponse.arrayBuffer();
          this.bgmBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (e) {
          console.error(`Failed to decode BGM from ${bgmAssetConfig.path}:`, e);
        }
      }
      this.initGame();
      this.loadHighScores();
      this.state = 1 /* TITLE */;
      this.gameLoop(0);
    } catch (error) {
      console.error("Failed to load game data or assets:", error);
      this.state = 4 /* GAME_OVER */;
      this.drawErrorScreen("\uAC8C\uC784 \uB85C\uB4DC \uC2E4\uD328! \uCF58\uC194\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
    }
  }
  initGame() {
    this.gameSpeed = this.config.gameplay.initialGameSpeed;
    this.currentSpeed = this.gameSpeed;
    this.player = new Player(this.config.player, this.assetLoader, this.config.ground.y);
    this.parallaxLayers = this.config.parallax.map(
      (layerConfig) => new ParallaxLayer(layerConfig, this.assetLoader, this.canvas.width)
    );
    this.ground = new Ground(this.config.ground, this.assetLoader, this.canvas.width);
    for (let i = 0; i < 5; i++) {
      const obsConfig = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];
      this.obstacles.push(new Obstacle(obsConfig, this.assetLoader, this.config.ground.y, this.canvas.width));
      const collConfig = this.config.collectibles[Math.floor(Math.random() * this.config.collectibles.length)];
      this.collectibles.push(new Collectible(collConfig, this.assetLoader, this.canvas.width, 0));
    }
    this.resetSpawnTimers();
  }
  resetSpawnTimers() {
    this.obstacleSpawnTimer = 0;
    this.nextObstacleSpawnTime = this.getRandomSpawnTime(this.config.gameplay.obstacleSpawnIntervalMin, this.config.gameplay.obstacleSpawnIntervalMax);
    this.collectibleSpawnTimer = 0;
    this.nextCollectibleSpawnTime = this.getRandomSpawnTime(
      this.config.gameplay.collectibleSpawnIntervalMin,
      this.config.gameplay.collectibleSpawnIntervalMax
    );
  }
  getRandomSpawnTime(min, max) {
    return Math.random() * (max - min) + min;
  }
  addEventListeners() {
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));
    this.canvas.addEventListener("click", this.handleClick.bind(this));
  }
  handleKeyDown(event) {
    if (this.state === 0 /* LOADING */) return;
    if (!this.keyPressed[event.code]) {
      this.keyPressed[event.code] = true;
      if (this.state === 1 /* TITLE */ || this.state === 2 /* CONTROLS */ || this.state === 4 /* GAME_OVER */) {
        if (this.isWaitingForInput) {
          if (this.state === 1 /* TITLE */) {
            this.state = 2 /* CONTROLS */;
            this.isWaitingForInput = false;
          } else if (this.state === 2 /* CONTROLS */) {
            this.state = 3 /* PLAYING */;
            this.isWaitingForInput = false;
            this.resetGame();
            this.playBGM();
          } else if (this.state === 4 /* GAME_OVER */) {
            this.state = 1 /* TITLE */;
            this.isWaitingForInput = false;
            this.stopBGM();
          }
        }
        return;
      }
    }
    if (this.state === 3 /* PLAYING */ && !this.gamePaused) {
      if (event.code === "Space") {
        if (this.player.jump()) {
          this.playSound("sfx_jump");
        }
      } else if (event.code === "ArrowDown") {
        if (this.player.slide()) {
          this.playSound("sfx_slide");
        }
      }
    }
  }
  handleKeyUp(event) {
    this.keyPressed[event.code] = false;
    if (this.state === 1 /* TITLE */ || this.state === 2 /* CONTROLS */ || this.state === 4 /* GAME_OVER */) {
      this.isWaitingForInput = true;
    }
  }
  handleClick(event) {
    if (this.state === 1 /* TITLE */ && this.isWaitingForInput) {
      this.state = 2 /* CONTROLS */;
      this.isWaitingForInput = false;
    } else if (this.state === 2 /* CONTROLS */ && this.isWaitingForInput) {
      this.state = 3 /* PLAYING */;
      this.isWaitingForInput = false;
      this.resetGame();
      this.playBGM();
    } else if (this.state === 4 /* GAME_OVER */ && this.isWaitingForInput) {
      this.state = 1 /* TITLE */;
      this.isWaitingForInput = false;
      this.stopBGM();
    }
  }
  gameLoop(currentTime) {
    const deltaTime = (currentTime - this.lastFrameTime) / 1e3;
    this.lastFrameTime = currentTime;
    if (this.state === 0 /* LOADING */) {
      this.drawLoadingScreen(this.assetLoader.progress);
    } else {
      if (!this.gamePaused) {
        this.update(deltaTime);
      }
      this.draw();
    }
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    switch (this.state) {
      case 3 /* PLAYING */:
        this.gameSpeed = Math.min(this.config.gameplay.maxGameSpeed, this.gameSpeed + this.config.gameplay.speedIncreaseRate * deltaTime);
        this.currentSpeed = this.gameSpeed;
        this.player.update(deltaTime, this.config.ground.y);
        this.parallaxLayers.forEach((layer) => layer.update(deltaTime, this.currentSpeed));
        this.ground.update(deltaTime, this.currentSpeed);
        this.obstacleSpawnTimer += deltaTime;
        if (this.obstacleSpawnTimer >= this.nextObstacleSpawnTime) {
          this.spawnObstacleAndLinkedCollectible();
          this.obstacleSpawnTimer = 0;
          this.nextObstacleSpawnTime = this.getRandomSpawnTime(this.config.gameplay.obstacleSpawnIntervalMin, this.config.gameplay.obstacleSpawnIntervalMax);
        }
        this.collectibleSpawnTimer += deltaTime;
        if (this.collectibleSpawnTimer >= this.nextCollectibleSpawnTime) {
          this.spawnStandaloneCollectible();
          this.collectibleSpawnTimer = 0;
          this.nextCollectibleSpawnTime = this.getRandomSpawnTime(
            this.config.gameplay.collectibleSpawnIntervalMin,
            this.config.gameplay.collectibleSpawnIntervalMax
          );
        }
        const playerRect = this.player.getCollisionRect();
        this.obstacles.forEach((obstacle) => {
          if (obstacle.active) {
            obstacle.update(deltaTime, this.currentSpeed);
            if (!obstacle.collided && checkCollision(playerRect, obstacle.getCollisionRect())) {
              if (this.player.hit(this.config.gameplay.obstacleDamage)) {
                this.playSound("sfx_hit");
                obstacle.collided = true;
                if (this.player.lives <= 0) {
                  this.gameOver();
                }
              }
            }
          }
        });
        this.collectibles.forEach((collectible) => {
          if (collectible.active) {
            collectible.update(deltaTime, this.currentSpeed);
            if (!collectible.collected && checkCollision(playerRect, collectible.getCollisionRect())) {
              this.score += collectible.scoreValue;
              collectible.collected = true;
              this.playSound("sfx_collect");
            }
          }
        });
        this.score += this.config.gameplay.scorePerSecond * deltaTime;
        this.scoreDisplay = Math.min(this.score, this.scoreDisplay + (this.score - this.scoreDisplay) * deltaTime * 5);
        break;
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.parallaxLayers.forEach((layer) => layer.draw(this.ctx));
    this.ground.draw(this.ctx);
    this.obstacles.forEach((obstacle) => obstacle.draw(this.ctx));
    this.collectibles.forEach((collectible) => collectible.draw(this.ctx));
    this.player.draw(this.ctx);
    this.ctx.fillStyle = this.config.ui.textColor;
    this.ctx.font = this.config.ui.font;
    this.ctx.textAlign = "left";
    this.ctx.fillText(`\uC810\uC218: ${Math.floor(this.scoreDisplay)}`, 20, 40);
    this.ctx.fillText(`\uCCB4\uB825: ${this.player.lives}`, 20, 80);
    switch (this.state) {
      case 0 /* LOADING */:
        this.drawLoadingScreen(this.assetLoader.progress);
        break;
      case 1 /* TITLE */:
        this.drawCenteredText(this.config.ui.titleMessage, this.canvas.height / 2 - 50);
        this.drawCenteredText(this.config.ui.startMessage, this.canvas.height / 2 + 20, 24);
        break;
      case 2 /* CONTROLS */:
        this.drawCenteredText(this.config.ui.controlsMessage, this.canvas.height / 2 - 50);
        this.drawCenteredText(this.config.ui.startMessage, this.canvas.height / 2 + 20, 24);
        break;
      case 4 /* GAME_OVER */:
        this.drawCenteredText(this.config.ui.gameOverMessage, this.canvas.height / 2 - 80);
        this.drawCenteredText(`\uCD5C\uC885 \uC810\uC218: ${Math.floor(this.score)}`, this.canvas.height / 2 - 20);
        this.drawHighScores();
        this.drawCenteredText(this.config.ui.restartMessage, this.canvas.height / 2 + 100, 24);
        break;
    }
  }
  drawLoadingScreen(progress) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "30px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("\uB85C\uB529 \uC911...", this.canvas.width / 2, this.canvas.height / 2 - 30);
    this.ctx.fillRect(this.canvas.width / 2 - 100, this.canvas.height / 2, 200 * progress, 20);
    this.ctx.strokeStyle = "white";
    this.ctx.strokeRect(this.canvas.width / 2 - 100, this.canvas.height / 2, 200, 20);
  }
  drawCenteredText(text, y, fontSize = 36) {
    this.ctx.fillStyle = this.config.ui.textColor;
    this.ctx.font = `${fontSize}px ${this.config.ui.font.split(" ")[1] || "Arial"}`;
    this.ctx.textAlign = "center";
    this.ctx.fillText(text, this.canvas.width / 2, y);
  }
  // Renamed and modified existing spawnObstacle to only spawn obstacle and linked collectible
  spawnObstacleAndLinkedCollectible() {
    let obstacle = this.obstacles.find((o) => !o.active);
    if (!obstacle) {
      const obsConfig = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];
      obstacle = new Obstacle(obsConfig, this.assetLoader, this.config.ground.y, this.canvas.width);
      this.obstacles.push(obstacle);
    }
    const randomConfig = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];
    const spawnX = this.canvas.width + Math.random() * 100;
    obstacle.reset(spawnX);
    obstacle.width = randomConfig.width;
    obstacle.height = randomConfig.height;
    obstacle.image = this.assetLoader.getImage(randomConfig.image);
    obstacle.y = this.config.ground.y - randomConfig.yOffset - obstacle.height;
    obstacle.active = true;
    obstacle.collided = false;
    if (Math.random() < this.config.gameplay.collectibleSpawnChance) {
      this.spawnCollectible(obstacle);
    }
  }
  // NEW: Function to spawn collectibles independently of obstacles
  spawnStandaloneCollectible() {
    const spawnX = this.canvas.width + Math.random() * 150;
    this.spawnCollectible(void 0, spawnX);
  }
  // Modified to accept optional associatedObstacle for positioning logic
  spawnCollectible(associatedObstacle, customX) {
    let collectible = this.collectibles.find((c) => !c.active);
    if (!collectible) {
      const collConfig = this.config.collectibles[Math.floor(Math.random() * this.config.collectibles.length)];
      collectible = new Collectible(collConfig, this.assetLoader, 0, 0);
      this.collectibles.push(collectible);
    }
    const randomConfig = this.config.collectibles[Math.floor(Math.random() * this.config.collectibles.length)];
    collectible.image = this.assetLoader.getImage(randomConfig.image);
    collectible.scoreValue = randomConfig.scoreValue;
    collectible.width = randomConfig.width;
    collectible.height = randomConfig.height;
    let collectibleY;
    let collectibleX;
    if (associatedObstacle) {
      collectibleX = associatedObstacle.x + associatedObstacle.width / 2 - collectible.width / 2;
      const obstacleTopY = associatedObstacle.y;
      const playerBaseY = this.player.baseY;
      const playerJumpPeakY = playerBaseY - this.config.player.jumpHeight;
      const yFromObstacleTop = obstacleTopY - collectible.height - 20;
      const jumpableYFromGroundMinOffset = this.config.player.height * 0.5;
      const jumpableYFromGroundMaxOffset = this.config.player.jumpHeight * 0.8;
      let randomJumpableYFromGround = this.config.ground.y - (jumpableYFromGroundMinOffset + Math.random() * (jumpableYFromGroundMaxOffset - jumpableYFromGroundMinOffset));
      collectibleY = Math.min(yFromObstacleTop, randomJumpableYFromGround);
      collectibleY = Math.min(collectibleY, playerBaseY - collectible.height - 10);
      collectibleY = Math.max(collectibleY, playerJumpPeakY);
      collectibleY = Math.min(collectibleY, obstacleTopY - collectible.height - 10);
      collectibleY += (Math.random() - 0.5) * 10;
    } else {
      collectibleX = customX !== void 0 ? customX : this.canvas.width + Math.random() * 100;
      const offsetFromGround = this.config.gameplay.collectibleSpawnOffsetMin + Math.random() * (this.config.gameplay.collectibleSpawnOffsetMax - this.config.gameplay.collectibleSpawnOffsetMin);
      collectibleY = this.config.ground.y - offsetFromGround;
      collectibleY = Math.min(collectibleY, this.config.ground.y - collectible.height - 10);
      collectibleY = Math.max(collectibleY, this.player.baseY - this.config.player.jumpHeight * 1.1);
    }
    collectible.reset(collectibleX, collectibleY);
  }
  gameOver() {
    this.state = 4 /* GAME_OVER */;
    this.stopBGM();
    this.playSound("sfx_game_over");
    this.saveHighScore(Math.floor(this.score));
    this.gamePaused = true;
    this.isWaitingForInput = true;
  }
  resetGame() {
    this.player.reset();
    this.gameSpeed = this.config.gameplay.initialGameSpeed;
    this.currentSpeed = this.gameSpeed;
    this.score = 0;
    this.scoreDisplay = 0;
    this.obstacles.forEach((o) => o.active = false);
    this.collectibles.forEach((c) => c.active = false);
    this.resetSpawnTimers();
    this.gamePaused = false;
    this.isWaitingForInput = false;
    this.playBGM();
  }
  playSound(name, loop = false) {
    const audio = this.assetLoader.getSound(name);
    if (audio) {
      const soundInstance = audio.cloneNode(true);
      soundInstance.loop = loop;
      soundInstance.volume = audio.volume;
      soundInstance.play().catch((e) => console.warn(`Audio playback failed for ${name}: ${e}`));
    }
  }
  playBGM() {
    if (this.bgmBuffer && this.audioContext.state === "suspended") {
      this.audioContext.resume().then(() => this._startBGM());
    } else if (this.bgmBuffer) {
      this._startBGM();
    }
  }
  _startBGM() {
    if (this.bgmSource) {
      this.bgmSource.stop();
      this.bgmSource.disconnect();
      this.bgmSource = null;
    }
    this.bgmSource = this.audioContext.createBufferSource();
    this.bgmSource.buffer = this.bgmBuffer;
    this.bgmSource.loop = true;
    this.bgmSource.connect(this.bgmGainNode);
    this.bgmSource.start(0);
    this.bgmGainNode.gain.value = this.config.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.5;
  }
  stopBGM() {
    if (this.bgmSource) {
      this.bgmSource.stop();
      this.bgmSource.disconnect();
      this.bgmSource = null;
    }
  }
  loadHighScores() {
    try {
      const storedScores = localStorage.getItem("cookieRunnerHighScores");
      this.highScores = storedScores ? JSON.parse(storedScores) : [];
      this.highScores.sort((a, b) => b.score - a.score);
    } catch (e) {
      console.error("Failed to load high scores:", e);
      this.highScores = [];
    }
  }
  saveHighScore(newScore) {
    const now = /* @__PURE__ */ new Date();
    const scoreEntry = {
      score: newScore,
      date: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`
    };
    this.highScores.push(scoreEntry);
    this.highScores.sort((a, b) => b.score - a.score);
    this.highScores = this.highScores.slice(0, 5);
    try {
      localStorage.setItem("cookieRunnerHighScores", JSON.stringify(this.highScores));
    } catch (e) {
      console.error("Failed to save high scores:", e);
    }
  }
  drawHighScores() {
    this.ctx.fillStyle = this.config.ui.textColor;
    this.ctx.font = `24px ${this.config.ui.font.split(" ")[1] || "Arial"}`;
    this.ctx.textAlign = "center";
    this.ctx.fillText("\uCD5C\uACE0 \uC810\uC218", this.canvas.width / 2, this.canvas.height / 2 + 30);
    this.highScores.forEach((entry, index) => {
      this.ctx.fillText(`${index + 1}. ${entry.score} (${entry.date})`, this.canvas.width / 2, this.canvas.height / 2 + 60 + index * 30);
    });
  }
  drawErrorScreen(message) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "red";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "30px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("\uC624\uB958 \uBC1C\uC0DD!", this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  try {
    new Game("gameCanvas");
  } catch (e) {
    console.error("Failed to initialize game:", e);
    const errorDiv = document.createElement("div");
    errorDiv.style.color = "red";
    errorDiv.style.textAlign = "center";
    errorDiv.style.marginTop = "50px";
    errorDiv.innerText = `\uAC8C\uC784 \uCD08\uAE30\uD654 \uC911 \uC624\uB958 \uBC1C\uC0DD: ${e.message}. \uCF58\uC194\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.`;
    document.body.appendChild(errorDiv);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9O1xyXG4gICAgcGxheWVyOiBQbGF5ZXJDb25maWc7XHJcbiAgICBnYW1lcGxheTogR2FtZXBsYXlDb25maWc7XHJcbiAgICBwYXJhbGxheDogUGFyYWxsYXhMYXllckNvbmZpZ1tdO1xyXG4gICAgZ3JvdW5kOiBHcm91bmRDb25maWc7XHJcbiAgICBvYnN0YWNsZXM6IE9ic3RhY2xlQ29uZmlnW107XHJcbiAgICBjb2xsZWN0aWJsZXM6IENvbGxlY3RpYmxlQ29uZmlnW107XHJcbiAgICB1aTogVUlDb25maWc7XHJcbiAgICBhc3NldHM6IHsgaW1hZ2VzOiBJbWFnZUFzc2V0W107IHNvdW5kczogU291bmRBc3NldFtdOyB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUGxheWVyQ29uZmlnIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjsgLy8gSW5pdGlhbCBZIHBvc2l0aW9uIChncm91bmRlZClcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGp1bXBIZWlnaHQ6IG51bWJlcjtcclxuICAgIHNsaWRlSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBncmF2aXR5OiBudW1iZXI7XHJcbiAgICBqdW1wRm9yY2U6IG51bWJlcjtcclxuICAgIHNsaWRlRHVyYXRpb246IG51bWJlcjtcclxuICAgIGFuaW1hdGlvblNwZWVkOiBudW1iZXI7IC8vIFRpbWUgcGVyIGZyYW1lIGluIHNlY29uZHNcclxuICAgIHJ1bm5pbmdGcmFtZXM6IHN0cmluZ1tdO1xyXG4gICAganVtcGluZ0ZyYW1lOiBzdHJpbmc7XHJcbiAgICBzbGlkaW5nRnJhbWU6IHN0cmluZztcclxuICAgIGludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyOyAvLyBEdXJhdGlvbiBvZiBpbnZpbmNpYmlsaXR5IGFmdGVyIGhpdFxyXG4gICAgYmxpbmtGcmVxdWVuY3k6IG51bWJlcjsgLy8gSG93IG9mdGVuIHBsYXllciBibGlua3MgZHVyaW5nIGludmluY2liaWxpdHlcclxuICAgIGxpdmVzOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lcGxheUNvbmZpZyB7XHJcbiAgICBpbml0aWFsR2FtZVNwZWVkOiBudW1iZXI7XHJcbiAgICBtYXhHYW1lU3BlZWQ6IG51bWJlcjtcclxuICAgIHNwZWVkSW5jcmVhc2VSYXRlOiBudW1iZXI7IC8vIFNwZWVkIGluY3JlYXNlIHBlciBzZWNvbmRcclxuICAgIG9ic3RhY2xlU3Bhd25JbnRlcnZhbE1pbjogbnVtYmVyOyAvLyBNaW4gdGltZSBiZWZvcmUgbmV4dCBvYnN0YWNsZSBzcGF3blxyXG4gICAgb2JzdGFjbGVTcGF3bkludGVydmFsTWF4OiBudW1iZXI7IC8vIE1heCB0aW1lIGJlZm9yZSBuZXh0IG9ic3RhY2xlIHNwYXduXHJcbiAgICBjb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWxNaW46IG51bWJlcjsgLy8gTWluIHRpbWUgYmVmb3JlIG5leHQgc3RhbmRhbG9uZSBjb2xsZWN0aWJsZSBzcGF3biAoTkVXKVxyXG4gICAgY29sbGVjdGlibGVTcGF3bkludGVydmFsTWF4OiBudW1iZXI7IC8vIE1heCB0aW1lIGJlZm9yZSBuZXh0IHN0YW5kYWxvbmUgY29sbGVjdGlibGUgc3Bhd24gKE5FVylcclxuICAgIGNvbGxlY3RpYmxlU3Bhd25DaGFuY2U6IG51bWJlcjsgLy8gUHJvYmFiaWxpdHkgdG8gc3Bhd24gYSBjb2xsZWN0aWJsZSB3aXRoIGFuIG9ic3RhY2xlXHJcbiAgICBjb2xsZWN0aWJsZVNwYXduT2Zmc2V0TWluOiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kIGZvciBzdGFuZGFsb25lIGNvbGxlY3RpYmxlXHJcbiAgICBjb2xsZWN0aWJsZVNwYXduT2Zmc2V0TWF4OiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kIGZvciBzdGFuZGFsb25lIGNvbGxlY3RpYmxlXHJcbiAgICBzY29yZVBlclNlY29uZDogbnVtYmVyO1xyXG4gICAgb2JzdGFjbGVEYW1hZ2U6IG51bWJlcjsgLy8gSG93IG11Y2ggZGFtYWdlIGFuIG9ic3RhY2xlIGRvZXNcclxufVxyXG5cclxuaW50ZXJmYWNlIFBhcmFsbGF4TGF5ZXJDb25maWcge1xyXG4gICAgaW1hZ2U6IHN0cmluZztcclxuICAgIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xyXG4gICAgeU9mZnNldDogbnVtYmVyOyAvLyBZIHBvc2l0aW9uIHJlbGF0aXZlIHRvIGNhbnZhcyB0b3BcclxuICAgIGhlaWdodDogbnVtYmVyOyAvLyBIZWlnaHQgdG8gZHJhdyB0aGUgaW1hZ2VcclxufVxyXG5cclxuaW50ZXJmYWNlIEdyb3VuZENvbmZpZyB7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgeTogbnVtYmVyOyAvLyBZIHBvc2l0aW9uIG9mIHRoZSB0b3Agb2YgdGhlIGdyb3VuZFxyXG4gICAgaGVpZ2h0OiBudW1iZXI7IC8vIEhlaWdodCB0byBkcmF3IHRoZSBncm91bmQgaW1hZ2VcclxufVxyXG5cclxuaW50ZXJmYWNlIE9ic3RhY2xlQ29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB5T2Zmc2V0OiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kXHJcbn1cclxuXHJcbmludGVyZmFjZSBDb2xsZWN0aWJsZUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVUlDb25maWcge1xyXG4gICAgZm9udDogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICB0aXRsZU1lc3NhZ2U6IHN0cmluZztcclxuICAgIGNvbnRyb2xzTWVzc2FnZTogc3RyaW5nO1xyXG4gICAgc3RhcnRNZXNzYWdlOiBzdHJpbmc7XHJcbiAgICBnYW1lT3Zlck1lc3NhZ2U6IHN0cmluZztcclxuICAgIHJlc3RhcnRNZXNzYWdlOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBSZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuLy8gVXRpbGl0eSBmdW5jdGlvbiBmb3IgQUFCQiBjb2xsaXNpb24gZGV0ZWN0aW9uXHJcbmZ1bmN0aW9uIGNoZWNrQ29sbGlzaW9uKHJlY3QxOiBSZWN0LCByZWN0MjogUmVjdCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHJlY3QxLnggPCByZWN0Mi54ICsgcmVjdDIud2lkdGggJiZcclxuICAgICAgICAgICByZWN0MS54ICsgcmVjdDEud2lkdGggPiByZWN0Mi54ICYmXHJcbiAgICAgICAgICAgcmVjdDEueSA8IHJlY3QyLnkgKyByZWN0Mi5oZWlnaHQgJiZcclxuICAgICAgICAgICByZWN0MS55ICsgcmVjdDEuaGVpZ2h0ID4gcmVjdDIueTtcclxufVxyXG5cclxuLy8gQXNzZXQgTG9hZGVyIENsYXNzXHJcbmNsYXNzIEFzc2V0TG9hZGVyIHtcclxuICAgIHByaXZhdGUgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgbG9hZGVkQ291bnQ6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHRvdGFsQ291bnQ6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG9uUHJvZ3Jlc3M/OiAocHJvZ3Jlc3M6IG51bWJlcikgPT4gdm9pZDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihvblByb2dyZXNzPzogKHByb2dyZXNzOiBudW1iZXIpID0+IHZvaWQpIHtcclxuICAgICAgICB0aGlzLm9uUHJvZ3Jlc3MgPSBvblByb2dyZXNzO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGxvYWQoaW1hZ2VBc3NldHM6IEltYWdlQXNzZXRbXSwgc291bmRBc3NldHM6IFNvdW5kQXNzZXRbXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMudG90YWxDb3VudCA9IGltYWdlQXNzZXRzLmxlbmd0aCArIHNvdW5kQXNzZXRzLmxlbmd0aDtcclxuICAgICAgICBpZiAodGhpcy50b3RhbENvdW50ID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMub25Qcm9ncmVzcz8uKDEpO1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gaW1hZ2VBc3NldHMubWFwKGFzc2V0ID0+IHRoaXMubG9hZEltYWdlKGFzc2V0KSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHNvdW5kQXNzZXRzLm1hcChhc3NldCA9PiB0aGlzLmxvYWRTb3VuZChhc3NldCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICB0aGlzLm9uUHJvZ3Jlc3M/LigxKTsgLy8gRW5zdXJlIHByb2dyZXNzIGlzIDEgYXQgdGhlIGVuZFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUHJvZ3Jlc3MoKSB7XHJcbiAgICAgICAgdGhpcy5sb2FkZWRDb3VudCsrO1xyXG4gICAgICAgIHRoaXMub25Qcm9ncmVzcz8uKHRoaXMucHJvZ3Jlc3MpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKGFzc2V0OiBJbWFnZUFzc2V0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoYXNzZXQubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQcm9ncmVzcygpOyAvLyBTdGlsbCBjb3VudCBhcyBsb2FkZWQgdG8gYXZvaWQgYmxvY2tpbmdcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBhbnl3YXkgdG8gYWxsb3cgb3RoZXIgYXNzZXRzIHRvIGxvYWRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoYXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAvLyBVc2luZyBvbmNhbnBsYXl0aHJvdWdoIGVuc3VyZXMgdGhlIGVudGlyZSBzb3VuZCBjYW4gcGxheSB3aXRob3V0IGludGVycnVwdGlvblxyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gYXNzZXQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke2Fzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVByb2dyZXNzKCk7IC8vIFN0aWxsIGNvdW50IGFzIGxvYWRlZFxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGFueXdheVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIEV4cGxpY2l0bHkgbG9hZCBmb3Igc29tZSBicm93c2Vyc1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEltYWdlKG5hbWU6IHN0cmluZyk6IEhUTUxJbWFnZUVsZW1lbnQge1xyXG4gICAgICAgIGNvbnN0IGltZyA9IHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoIWltZykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYEltYWdlIFwiJHtuYW1lfVwiIG5vdCBmb3VuZCBpbiBhc3NldHMuIFJldHVybmluZyBhIGR1bW15IGltYWdlLmApO1xyXG4gICAgICAgICAgICBjb25zdCBkdW1teSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBkdW1teS5zcmMgPSBcImRhdGE6aW1hZ2UvZ2lmO2Jhc2U2NCxSMGxHT0RsaEFRQUJBQUQvQUN3QUFBQUFBUUFCQUFBQ0FEcz1cIjsgLy8gVHJhbnNwYXJlbnQgMXgxIEdJRlxyXG4gICAgICAgICAgICByZXR1cm4gZHVtbXk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBpbWc7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0U291bmQobmFtZTogc3RyaW5nKTogSFRNTEF1ZGlvRWxlbWVudCB7XHJcbiAgICAgICAgY29uc3Qgc291bmQgPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKCFzb3VuZCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kIFwiJHtuYW1lfVwiIG5vdCBmb3VuZCBpbiBhc3NldHMuIFJldHVybmluZyBhIGR1bW15IEF1ZGlvLmApO1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEF1ZGlvKCk7IC8vIFJldHVybiBhIHNpbGVudCBhdWRpbyBvYmplY3RcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHNvdW5kO1xyXG4gICAgfVxyXG5cclxuICAgIGdldCBwcm9ncmVzcygpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRvdGFsQ291bnQgPiAwID8gdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxDb3VudCA6IDE7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdhbWUgU3RhdGUgRW51bVxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HLFxyXG4gICAgVElUTEUsXHJcbiAgICBDT05UUk9MUyxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVJcclxufVxyXG5cclxuLy8gUGxheWVyIFN0YXRlc1xyXG5lbnVtIFBsYXllckFuaW1hdGlvblN0YXRlIHtcclxuICAgIFJVTk5JTkcsXHJcbiAgICBKVU1QSU5HLFxyXG4gICAgU0xJRElOR1xyXG59XHJcblxyXG4vLyBQbGF5ZXIgQ2xhc3NcclxuY2xhc3MgUGxheWVyIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGJhc2VZOiBudW1iZXI7IC8vIFkgcG9zaXRpb24gd2hlbiBvbiBncm91bmQgd2l0aCBpbml0aWFsIGhlaWdodFxyXG4gICAgaW5pdGlhbEhlaWdodDogbnVtYmVyOyAvLyBQbGF5ZXIncyBoZWlnaHQgd2hlbiBydW5uaW5nXHJcbiAgICB2ZWxvY2l0eVk6IG51bWJlciA9IDA7XHJcbiAgICBvbkdyb3VuZDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICBhbmltYXRpb25TdGF0ZTogUGxheWVyQW5pbWF0aW9uU3RhdGUgPSBQbGF5ZXJBbmltYXRpb25TdGF0ZS5SVU5OSU5HO1xyXG4gICAgY3VycmVudEFuaW1hdGlvbkZyYW1lOiBudW1iZXIgPSAwO1xyXG4gICAgYW5pbWF0aW9uVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBzbGlkZVRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgaXNJbnZpbmNpYmxlOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBpbnZpbmNpYmxlVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBibGlua1RpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgbGl2ZXM6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGNvbmZpZzogUGxheWVyQ29uZmlnLCBwcml2YXRlIGFzc2V0TG9hZGVyOiBBc3NldExvYWRlciwgZ3JvdW5kWTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54ID0gY29uZmlnLng7XHJcbiAgICAgICAgdGhpcy55ID0gY29uZmlnLnk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IGNvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbml0aWFsSGVpZ2h0ID0gY29uZmlnLmhlaWdodDtcclxuICAgICAgICB0aGlzLmJhc2VZID0gZ3JvdW5kWSAtIGNvbmZpZy5oZWlnaHQ7IC8vIENhbGN1bGF0ZSBiYXNlIFkgYmFzZWQgb24gZ3JvdW5kXHJcbiAgICAgICAgdGhpcy55ID0gdGhpcy5iYXNlWTsgLy8gU3RhcnQgb24gdGhlIGdyb3VuZFxyXG4gICAgICAgIHRoaXMubGl2ZXMgPSBjb25maWcubGl2ZXM7XHJcbiAgICB9XHJcblxyXG4gICAganVtcCgpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAodGhpcy5vbkdyb3VuZCAmJiB0aGlzLmFuaW1hdGlvblN0YXRlICE9PSBQbGF5ZXJBbmltYXRpb25TdGF0ZS5TTElESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZID0gLXRoaXMuY29uZmlnLmp1bXBGb3JjZTtcclxuICAgICAgICAgICAgdGhpcy5vbkdyb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuSlVNUElORztcclxuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciA9IDA7IC8vIFJlc2V0IGFuaW1hdGlvbiBmb3IganVtcCBmcmFtZVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHNsaWRlKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLm9uR3JvdW5kICYmIHRoaXMuYW5pbWF0aW9uU3RhdGUgIT09IFBsYXllckFuaW1hdGlvblN0YXRlLkpVTVBJTkcgJiYgdGhpcy5hbmltYXRpb25TdGF0ZSAhPT0gUGxheWVyQW5pbWF0aW9uU3RhdGUuU0xJRElORykge1xyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuU0xJRElORztcclxuICAgICAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmNvbmZpZy5zbGlkZUhlaWdodDtcclxuICAgICAgICAgICAgLy8gQWRqdXN0IFkgdG8ga2VlcCBib3R0b20gb2YgcGxheWVyIGF0IGdyb3VuZCBsZXZlbFxyXG4gICAgICAgICAgICB0aGlzLnkgPSB0aGlzLmJhc2VZICsgKHRoaXMuaW5pdGlhbEhlaWdodCAtIHRoaXMuY29uZmlnLnNsaWRlSGVpZ2h0KTtcclxuICAgICAgICAgICAgdGhpcy5zbGlkZVRpbWVyID0gdGhpcy5jb25maWcuc2xpZGVEdXJhdGlvbjtcclxuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciA9IDA7IC8vIFJlc2V0IGFuaW1hdGlvbiBmb3Igc2xpZGUgZnJhbWVcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdyb3VuZFk6IG51bWJlcikge1xyXG4gICAgICAgIC8vIEhhbmRsZSBncmF2aXR5XHJcbiAgICAgICAgaWYgKCF0aGlzLm9uR3JvdW5kKSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZICs9IHRoaXMuY29uZmlnLmdyYXZpdHkgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMueSArPSB0aGlzLnZlbG9jaXR5WSAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGxhbmRpbmcgb24gZ3JvdW5kXHJcbiAgICAgICAgaWYgKHRoaXMueSArIHRoaXMuaGVpZ2h0ID49IGdyb3VuZFkpIHtcclxuICAgICAgICAgICAgdGhpcy55ID0gZ3JvdW5kWSAtIHRoaXMuaGVpZ2h0O1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMub25Hcm91bmQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMub25Hcm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSAwO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uU3RhdGUgPT09IFBsYXllckFuaW1hdGlvblN0YXRlLkpVTVBJTkcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuUlVOTklORzsgLy8gTGFuZGVkLCBnbyBiYWNrIHRvIHJ1bm5pbmdcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaW5pdGlhbEhlaWdodDsgLy8gUmVzZXQgaGVpZ2h0XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5iYXNlWTsgLy8gUmUtYWxpZ24gcGxheWVyIHRvIGdyb3VuZCBhZnRlciBqdW1wXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBzbGlkaW5nIGR1cmF0aW9uXHJcbiAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uU3RhdGUgPT09IFBsYXllckFuaW1hdGlvblN0YXRlLlNMSURJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5zbGlkZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc2xpZGVUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuUlVOTklORztcclxuICAgICAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5pbml0aWFsSGVpZ2h0OyAvLyBSZXNldCBoZWlnaHQgYWZ0ZXIgc2xpZGluZ1xyXG4gICAgICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5iYXNlWTsgLy8gUmVzZXQgWSBwb3NpdGlvblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcnVubmluZyBhbmltYXRpb24gZnJhbWUgdXBkYXRlXHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uU3RhdGUgPT09IFBsYXllckFuaW1hdGlvblN0YXRlLlJVTk5JTkcgJiYgdGhpcy5hbmltYXRpb25UaW1lciA+PSB0aGlzLmNvbmZpZy5hbmltYXRpb25TcGVlZCkge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRBbmltYXRpb25GcmFtZSA9ICh0aGlzLmN1cnJlbnRBbmltYXRpb25GcmFtZSArIDEpICUgdGhpcy5jb25maWcucnVubmluZ0ZyYW1lcy5sZW5ndGg7XHJcbiAgICAgICAgICAgIHRoaXMuYW5pbWF0aW9uVGltZXIgPSAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGludmluY2liaWxpdHlcclxuICAgICAgICBpZiAodGhpcy5pc0ludmluY2libGUpIHtcclxuICAgICAgICAgICAgdGhpcy5pbnZpbmNpYmxlVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICB0aGlzLmJsaW5rVGltZXIgKz0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmxlVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pc0ludmluY2libGUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmxpbmtUaW1lciA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGlmICh0aGlzLmlzSW52aW5jaWJsZSAmJiBNYXRoLmZsb29yKHRoaXMuYmxpbmtUaW1lciAqIHRoaXMuY29uZmlnLmJsaW5rRnJlcXVlbmN5KSAlIDIgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBCbGluayBlZmZlY3Q6IHNraXAgZHJhd2luZ1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGltYWdlO1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5hbmltYXRpb25TdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIFBsYXllckFuaW1hdGlvblN0YXRlLkpVTVBJTkc6XHJcbiAgICAgICAgICAgICAgICBpbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcuanVtcGluZ0ZyYW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFBsYXllckFuaW1hdGlvblN0YXRlLlNMSURJTkc6XHJcbiAgICAgICAgICAgICAgICBpbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcuc2xpZGluZ0ZyYW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFBsYXllckFuaW1hdGlvblN0YXRlLlJVTk5JTkc6XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBpbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcucnVubmluZ0ZyYW1lc1t0aGlzLmN1cnJlbnRBbmltYXRpb25GcmFtZV0pO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0Q29sbGlzaW9uUmVjdCgpOiBSZWN0IHtcclxuICAgICAgICByZXR1cm4geyB4OiB0aGlzLngsIHk6IHRoaXMueSwgd2lkdGg6IHRoaXMud2lkdGgsIGhlaWdodDogdGhpcy5oZWlnaHQgfTtcclxuICAgIH1cclxuXHJcbiAgICBoaXQoZGFtYWdlOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNJbnZpbmNpYmxlKSB7XHJcbiAgICAgICAgICAgIHRoaXMubGl2ZXMgLT0gZGFtYWdlO1xyXG4gICAgICAgICAgICB0aGlzLmlzSW52aW5jaWJsZSA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gdGhpcy5jb25maWcuaW52aW5jaWJpbGl0eUR1cmF0aW9uO1xyXG4gICAgICAgICAgICB0aGlzLmJsaW5rVGltZXIgPSAwO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gUGxheWVyIHdhcyBoaXQgYW5kIHRvb2sgZGFtYWdlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTsgLy8gUGxheWVyIHdhcyBpbnZpbmNpYmxlXHJcbiAgICB9XHJcblxyXG4gICAgcmVzZXQoKSB7XHJcbiAgICAgICAgdGhpcy54ID0gdGhpcy5jb25maWcueDtcclxuICAgICAgICB0aGlzLnkgPSB0aGlzLmJhc2VZO1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmNvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaW5pdGlhbEhlaWdodDtcclxuICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IDA7XHJcbiAgICAgICAgdGhpcy5vbkdyb3VuZCA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25TdGF0ZSA9IFBsYXllckFuaW1hdGlvblN0YXRlLlJVTk5JTkc7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QW5pbWF0aW9uRnJhbWUgPSAwO1xyXG4gICAgICAgIHRoaXMuYW5pbWF0aW9uVGltZXIgPSAwO1xyXG4gICAgICAgIHRoaXMuc2xpZGVUaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5pc0ludmluY2libGUgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmludmluY2libGVUaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5ibGlua1RpbWVyID0gMDtcclxuICAgICAgICB0aGlzLmxpdmVzID0gdGhpcy5jb25maWcubGl2ZXM7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFBhcmFsbGF4IExheWVyIENsYXNzXHJcbmNsYXNzIFBhcmFsbGF4TGF5ZXIge1xyXG4gICAgeDogbnVtYmVyID0gMDtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgc3BlZWQ6IG51bWJlcjsgLy8gQ2FsY3VsYXRlZCBiYXNlZCBvbiBnYW1lIHNwZWVkIGFuZCBtdWx0aXBsaWVyXHJcblxyXG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBjb25maWc6IFBhcmFsbGF4TGF5ZXJDb25maWcsIHByaXZhdGUgYXNzZXRMb2FkZXI6IEFzc2V0TG9hZGVyLCBjYW52YXNXaWR0aDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UoY29uZmlnLmltYWdlKTtcclxuICAgICAgICB0aGlzLnkgPSBjb25maWcueU9mZnNldDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgLy8gSW1hZ2Ugd2lkdGggc2hvdWxkIGlkZWFsbHkgYmUgY2FudmFzV2lkdGggb3IgYSBtdWx0aXBsZSBmb3Igc2VhbWxlc3MgdGlsaW5nXHJcbiAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHksIHdlIGFzc3VtZSBpbWFnZS53aWR0aCB3aWxsIGJlIHVzZWQgYW5kIGRyYXduIHR3aWNlLlxyXG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmltYWdlLndpZHRoOyAvLyBVc2UgYWN0dWFsIGltYWdlIHdpZHRoIGZvciBjYWxjdWxhdGlvblxyXG4gICAgICAgIGlmICh0aGlzLndpZHRoID09PSAwKSB7IC8vIEZhbGxiYWNrIGZvciB1bmxvYWRlZCBpbWFnZVxyXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gY2FudmFzV2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc3BlZWQgPSAwOyAvLyBXaWxsIGJlIHVwZGF0ZWQgYnkgZ2FtZSBsb2dpY1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNwZWVkID0gZ2FtZVNwZWVkICogdGhpcy5jb25maWcuc3BlZWRNdWx0aXBsaWVyO1xyXG4gICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggPD0gLXRoaXMud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICAvLyBEcmF3IHRoZSBpbWFnZSB0d2ljZSB0byBjcmVhdGUgYSBzZWFtbGVzcyBsb29wXHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54ICsgdGhpcy53aWR0aCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgLy8gSWYgaW1hZ2UgaXMgc21hbGxlciB0aGFuIGNhbnZhcywgZHJhdyBhZ2FpbiB0byBmaWxsIHBvdGVudGlhbGx5IGVtcHR5IHNwYWNlXHJcbiAgICAgICAgaWYgKHRoaXMud2lkdGggPCBjdHguY2FudmFzLndpZHRoKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54ICsgdGhpcy53aWR0aCAqIDIsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gR3JvdW5kIENsYXNzXHJcbmNsYXNzIEdyb3VuZCB7XHJcbiAgICB4OiBudW1iZXIgPSAwO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBzcGVlZDogbnVtYmVyOyAvLyBTYW1lIGFzIGdhbWUgc3BlZWRcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGNvbmZpZzogR3JvdW5kQ29uZmlnLCBwcml2YXRlIGFzc2V0TG9hZGVyOiBBc3NldExvYWRlciwgY2FudmFzV2lkdGg6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy55ID0gY29uZmlnLnk7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmltYWdlLndpZHRoO1xyXG4gICAgICAgIGlmICh0aGlzLndpZHRoID09PSAwKSB7IC8vIEZhbGxiYWNrIGZvciB1bmxvYWRlZCBpbWFnZVxyXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gY2FudmFzV2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc3BlZWQgPSAwO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNwZWVkID0gZ2FtZVNwZWVkO1xyXG4gICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggPD0gLXRoaXMud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLnggKyB0aGlzLndpZHRoLCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRDb2xsaXNpb25SZWN0KCk6IFJlY3Qge1xyXG4gICAgICAgIHJldHVybiB7IHg6IHRoaXMueCwgeTogdGhpcy55LCB3aWR0aDogdGhpcy53aWR0aCAqIDIsIGhlaWdodDogdGhpcy5oZWlnaHQgfTsgLy8gR3JvdW5kIGlzIGVmZmVjdGl2ZWx5IGVuZGxlc3NcclxuICAgIH1cclxufVxyXG5cclxuLy8gT2JzdGFjbGUgQ2xhc3NcclxuY2xhc3MgT2JzdGFjbGUge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBhY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGNvbGxpZGVkOiBib29sZWFuID0gZmFsc2U7IC8vIFRvIHByZXZlbnQgbXVsdGlwbGUgY29sbGlzaW9uIGNoZWNrc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY29uZmlnOiBPYnN0YWNsZUNvbmZpZywgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXIsIGdyb3VuZFk6IG51bWJlciwgaW5pdGlhbFg6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IGNvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgdGhpcy54ID0gaW5pdGlhbFg7XHJcbiAgICAgICAgdGhpcy55ID0gZ3JvdW5kWSAtIGNvbmZpZy55T2Zmc2V0IC0gdGhpcy5oZWlnaHQ7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lU3BlZWQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCAtPSBnYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRoaXMueCArIHRoaXMud2lkdGggPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmUpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBnZXRDb2xsaXNpb25SZWN0KCk6IFJlY3Qge1xyXG4gICAgICAgIHJldHVybiB7IHg6IHRoaXMueCwgeTogdGhpcy55LCB3aWR0aDogdGhpcy53aWR0aCwgaGVpZ2h0OiB0aGlzLmhlaWdodCB9O1xyXG4gICAgfVxyXG5cclxuICAgIHJlc2V0KG5ld1g6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCA9IG5ld1g7XHJcbiAgICAgICAgdGhpcy5hY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuY29sbGlkZWQgPSBmYWxzZTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gQ29sbGVjdGlibGUgQ2xhc3NcclxuY2xhc3MgQ29sbGVjdGlibGUge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBhY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGNvbGxlY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY29uZmlnOiBDb2xsZWN0aWJsZUNvbmZpZywgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXIsIGluaXRpYWxYOiBudW1iZXIsIGluaXRpYWxZOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5hc3NldExvYWRlci5nZXRJbWFnZShjb25maWcuaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMud2lkdGggPSBjb25maWcud2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMueCA9IGluaXRpYWxYO1xyXG4gICAgICAgIHRoaXMueSA9IGluaXRpYWxZO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IGNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggLT0gZ2FtZVNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggKyB0aGlzLndpZHRoIDwgMCkge1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlICYmICF0aGlzLmNvbGxlY3RlZCkge1xyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldENvbGxpc2lvblJlY3QoKTogUmVjdCB7XHJcbiAgICAgICAgcmV0dXJuIHsgeDogdGhpcy54LCB5OiB0aGlzLnksIHdpZHRoOiB0aGlzLndpZHRoLCBoZWlnaHQ6IHRoaXMuaGVpZ2h0IH07XHJcbiAgICB9XHJcblxyXG4gICAgcmVzZXQobmV3WDogbnVtYmVyLCBuZXdZOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggPSBuZXdYO1xyXG4gICAgICAgIHRoaXMueSA9IG5ld1k7XHJcbiAgICAgICAgdGhpcy5hY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGVkID0gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vLyBNYWluIEdhbWUgQ2xhc3NcclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXI7XHJcbiAgICBwcml2YXRlIHN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIHByaXZhdGUgbGFzdEZyYW1lVGltZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgZ2FtZVNwZWVkOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50U3BlZWQ6IG51bWJlciA9IDA7IC8vIEN1cnJlbnQgYWN0dWFsIHNwZWVkIGZvciBzY3JvbGxpbmdcclxuICAgIHByaXZhdGUgZ2FtZVBhdXNlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUbyBwYXVzZSBnYW1lIGxvZ2ljIG9uIHRpdGxlL2NvbnRyb2xzL2dhbWUgb3ZlclxyXG5cclxuICAgIHByaXZhdGUgcGxheWVyITogUGxheWVyO1xyXG4gICAgcHJpdmF0ZSBwYXJhbGxheExheWVyczogUGFyYWxsYXhMYXllcltdID0gW107XHJcbiAgICBwcml2YXRlIGdyb3VuZCE6IEdyb3VuZDtcclxuICAgIHByaXZhdGUgb2JzdGFjbGVzOiBPYnN0YWNsZVtdID0gW107XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlczogQ29sbGVjdGlibGVbXSA9IFtdO1xyXG5cclxuICAgIHByaXZhdGUgb2JzdGFjbGVTcGF3blRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBuZXh0T2JzdGFjbGVTcGF3blRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlU3Bhd25UaW1lcjogbnVtYmVyID0gMDsgLy8gTkVXOiBUaW1lciBmb3Igc3RhbmRhbG9uZSBjb2xsZWN0aWJsZXNcclxuICAgIHByaXZhdGUgbmV4dENvbGxlY3RpYmxlU3Bhd25UaW1lOiBudW1iZXIgPSAwOyAvLyBORVc6IE5leHQgc3Bhd24gdGltZSBmb3Igc3RhbmRhbG9uZSBjb2xsZWN0aWJsZXNcclxuXHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBoaWdoU2NvcmVzOiB7IHNjb3JlOiBudW1iZXIsIGRhdGU6IHN0cmluZyB9W10gPSBbXTtcclxuICAgIHByaXZhdGUgc2NvcmVEaXNwbGF5OiBudW1iZXIgPSAwOyAvLyBGb3Igc21vb3RoIHNjb3JlIHVwZGF0ZSBhbmltYXRpb25cclxuXHJcbiAgICBwcml2YXRlIGF1ZGlvQ29udGV4dDogQXVkaW9Db250ZXh0O1xyXG4gICAgcHJpdmF0ZSBiZ21Tb3VyY2U6IEF1ZGlvQnVmZmVyU291cmNlTm9kZSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBiZ21CdWZmZXI6IEF1ZGlvQnVmZmVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGJnbUdhaW5Ob2RlOiBHYWluTm9kZTtcclxuXHJcbiAgICBwcml2YXRlIGtleVByZXNzZWQ6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XHJcbiAgICBwcml2YXRlIGlzV2FpdGluZ0ZvcklucHV0OiBib29sZWFuID0gdHJ1ZTsgLy8gRm9yIHRpdGxlIGFuZCBjb250cm9scyBzY3JlZW5cclxuXHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgZWxlbWVudCB3aXRoIElEIFwiJHtjYW52YXNJZH1cIiBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gZ2V0IDJEIHJlbmRlcmluZyBjb250ZXh0LlwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYXNzZXRMb2FkZXIgPSBuZXcgQXNzZXRMb2FkZXIodGhpcy5kcmF3TG9hZGluZ1NjcmVlbi5iaW5kKHRoaXMpKTtcclxuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyAod2luZG93LkF1ZGlvQ29udGV4dCB8fCAod2luZG93IGFzIGFueSkud2Via2l0QXVkaW9Db250ZXh0KSgpO1xyXG4gICAgICAgIHRoaXMuYmdtR2Fpbk5vZGUgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XHJcbiAgICAgICAgdGhpcy5iZ21HYWluTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuXHJcbiAgICAgICAgdGhpcy5sb2FkR2FtZURhdGEoKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXJzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNvbmZpZy5jYW52YXMud2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuY29uZmlnLmNhbnZhcy5oZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICAvLyBMb2FkIGFzc2V0cyAoaW1hZ2VzIGFuZCBzb3VuZCBlZmZlY3RzIGFzIEhUTUxBdWRpb0VsZW1lbnRzKVxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TG9hZGVyLmxvYWQodGhpcy5jb25maWcuYXNzZXRzLmltYWdlcywgdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBEZWNvZGUgQkdNIGZvciBXZWIgQXVkaW8gQVBJIHVzaW5nIGl0cyBwYXRoIGRpcmVjdGx5XHJcbiAgICAgICAgICAgIGNvbnN0IGJnbUFzc2V0Q29uZmlnID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnYmdtJyk7XHJcbiAgICAgICAgICAgIGlmIChiZ21Bc3NldENvbmZpZykge1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiZ21SZXNwb25zZSA9IGF3YWl0IGZldGNoKGJnbUFzc2V0Q29uZmlnLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgYmdtUmVzcG9uc2UuYXJyYXlCdWZmZXIoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJnbUJ1ZmZlciA9IGF3YWl0IHRoaXMuYXVkaW9Db250ZXh0LmRlY29kZUF1ZGlvRGF0YShhcnJheUJ1ZmZlcik7XHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGRlY29kZSBCR00gZnJvbSAke2JnbUFzc2V0Q29uZmlnLnBhdGh9OmAsIGUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7XHJcbiAgICAgICAgICAgIHRoaXMubG9hZEhpZ2hTY29yZXMoKTtcclxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lTG9vcCgwKTsgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEgb3IgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSOyAvLyBPciBhbiBlcnJvciBzdGF0ZVxyXG4gICAgICAgICAgICB0aGlzLmRyYXdFcnJvclNjcmVlbihcIlx1QUM4Q1x1Qzc4NCBcdUI4NUNcdUI0REMgXHVDMkU0XHVEMzI4ISBcdUNGNThcdUMxOTRcdUM3NDQgXHVENjU1XHVDNzc4XHVENTc0XHVDOEZDXHVDMTM4XHVDNjk0LlwiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVwbGF5LmluaXRpYWxHYW1lU3BlZWQ7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U3BlZWQgPSB0aGlzLmdhbWVTcGVlZDsgLy8gSW5pdGlhbGl6ZSBjdXJyZW50U3BlZWRcclxuICAgICAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIodGhpcy5jb25maWcucGxheWVyLCB0aGlzLmFzc2V0TG9hZGVyLCB0aGlzLmNvbmZpZy5ncm91bmQueSk7XHJcblxyXG4gICAgICAgIHRoaXMucGFyYWxsYXhMYXllcnMgPSB0aGlzLmNvbmZpZy5wYXJhbGxheC5tYXAobGF5ZXJDb25maWcgPT5cclxuICAgICAgICAgICAgbmV3IFBhcmFsbGF4TGF5ZXIobGF5ZXJDb25maWcsIHRoaXMuYXNzZXRMb2FkZXIsIHRoaXMuY2FudmFzLndpZHRoKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHRoaXMuZ3JvdW5kID0gbmV3IEdyb3VuZCh0aGlzLmNvbmZpZy5ncm91bmQsIHRoaXMuYXNzZXRMb2FkZXIsIHRoaXMuY2FudmFzLndpZHRoKTtcclxuXHJcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBvYmplY3QgcG9vbHMgZm9yIG9ic3RhY2xlcyBhbmQgY29sbGVjdGlibGVzXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHsgLy8gUHJlLWFsbG9jYXRlIHNvbWUgb2JqZWN0c1xyXG4gICAgICAgICAgICBjb25zdCBvYnNDb25maWcgPSB0aGlzLmNvbmZpZy5vYnN0YWNsZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5jb25maWcub2JzdGFjbGVzLmxlbmd0aCldO1xyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlcy5wdXNoKG5ldyBPYnN0YWNsZShvYnNDb25maWcsIHRoaXMuYXNzZXRMb2FkZXIsIHRoaXMuY29uZmlnLmdyb3VuZC55LCB0aGlzLmNhbnZhcy53aWR0aCkpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY29sbENvbmZpZyA9IHRoaXMuY29uZmlnLmNvbGxlY3RpYmxlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5jb2xsZWN0aWJsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzLnB1c2gobmV3IENvbGxlY3RpYmxlKGNvbGxDb25maWcsIHRoaXMuYXNzZXRMb2FkZXIsIHRoaXMuY2FudmFzLndpZHRoLCAwKSk7IC8vIFkgd2lsbCBiZSBzZXQgb24gcmVzZXRcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5yZXNldFNwYXduVGltZXJzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNldFNwYXduVGltZXJzKCkge1xyXG4gICAgICAgIHRoaXMub2JzdGFjbGVTcGF3blRpbWVyID0gMDtcclxuICAgICAgICB0aGlzLm5leHRPYnN0YWNsZVNwYXduVGltZSA9IHRoaXMuZ2V0UmFuZG9tU3Bhd25UaW1lKHRoaXMuY29uZmlnLmdhbWVwbGF5Lm9ic3RhY2xlU3Bhd25JbnRlcnZhbE1pbiwgdGhpcy5jb25maWcuZ2FtZXBsYXkub2JzdGFjbGVTcGF3bkludGVydmFsTWF4KTtcclxuICAgICAgICAvLyBORVc6IEluaXRpYWxpemUgY29sbGVjdGlibGUgc3Bhd24gdGltZXJcclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5uZXh0Q29sbGVjdGlibGVTcGF3blRpbWUgPSB0aGlzLmdldFJhbmRvbVNwYXduVGltZShcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZXBsYXkuY29sbGVjdGlibGVTcGF3bkludGVydmFsTWluLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWxNYXhcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0UmFuZG9tU3Bhd25UaW1lKG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluKSArIG1pbjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFkZEV2ZW50TGlzdGVuZXJzKCk6IHZvaWQge1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUtleVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDbGljay5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkxPQURJTkcpIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmtleVByZXNzZWRbZXZlbnQuY29kZV0pIHsgLy8gT25seSB0cmlnZ2VyIG9uIGZpcnN0IHByZXNzXHJcbiAgICAgICAgICAgIHRoaXMua2V5UHJlc3NlZFtldmVudC5jb2RlXSA9IHRydWU7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5DT05UUk9MUyB8fCB0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pc1dhaXRpbmdGb3JJbnB1dCkgeyAvLyBFbnN1cmUgb25seSBvbmUgaW5wdXQgdG8gdHJhbnNpdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5DT05UUk9MUztcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkNPTlRST0xTKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc2V0R2FtZSgpOyAvLyBTdGFydCB0aGUgZ2FtZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlCR00oKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IGZhbHNlOyAvLyBSZXNldCB0byBhbGxvdyBpbnB1dCBmb3IgdGl0bGVcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdG9wQkdNKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBDb25zdW1lIGlucHV0LCBkb24ndCBwYXNzIHRvIHBsYXllciBhY3Rpb25zXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiAhdGhpcy5nYW1lUGF1c2VkKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5jb2RlID09PSAnU3BhY2UnKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuanVtcCgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9qdW1wJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQuY29kZSA9PT0gJ0Fycm93RG93bicpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5zbGlkZSgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9zbGlkZScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmtleVByZXNzZWRbZXZlbnQuY29kZV0gPSBmYWxzZTtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5DT05UUk9MUyB8fCB0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNXYWl0aW5nRm9ySW5wdXQgPSB0cnVlOyAvLyBBbGxvdyBuZXcgaW5wdXQgZm9yIG5leHQgdHJhbnNpdGlvblxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUNsaWNrKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgLy8gU2ltaWxhciB0byBrZXlkb3duIGJ1dCBvbmx5IGZvciBnZW5lcmFsIFwic3RhcnRcIlxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgJiYgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLkNPTlRST0xTO1xyXG4gICAgICAgICAgICB0aGlzLmlzV2FpdGluZ0ZvcklucHV0ID0gZmFsc2U7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuQ09OVFJPTFMgJiYgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgICAgIHRoaXMuaXNXYWl0aW5nRm9ySW5wdXQgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5QkdNKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSICYmIHRoaXMuaXNXYWl0aW5nRm9ySW5wdXQpIHtcclxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLnN0b3BCR00oKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcChjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0RnJhbWVUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkxPQURJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbih0aGlzLmFzc2V0TG9hZGVyLnByb2dyZXNzKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuZ2FtZVBhdXNlZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmRyYXcoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyBJbmNyZWFzZSBnYW1lIHNwZWVkIG92ZXIgdGltZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3BlZWQgPSBNYXRoLm1pbih0aGlzLmNvbmZpZy5nYW1lcGxheS5tYXhHYW1lU3BlZWQsIHRoaXMuZ2FtZVNwZWVkICsgdGhpcy5jb25maWcuZ2FtZXBsYXkuc3BlZWRJbmNyZWFzZVJhdGUgKiBkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3BlZWQgPSB0aGlzLmdhbWVTcGVlZDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgcGxheWVyXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5ncm91bmQueSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIHBhcmFsbGF4IGxheWVyc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wYXJhbGxheExheWVycy5mb3JFYWNoKGxheWVyID0+IGxheWVyLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMuY3VycmVudFNwZWVkKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIGdyb3VuZFxyXG4gICAgICAgICAgICAgICAgdGhpcy5ncm91bmQudXBkYXRlKGRlbHRhVGltZSwgdGhpcy5jdXJyZW50U3BlZWQpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFNwYXduIG9ic3RhY2xlcyBhbmQgdGhlaXIgYXNzb2NpYXRlZCBjb2xsZWN0aWJsZXNcclxuICAgICAgICAgICAgICAgIHRoaXMub2JzdGFjbGVTcGF3blRpbWVyICs9IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA+PSB0aGlzLm5leHRPYnN0YWNsZVNwYXduVGltZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25PYnN0YWNsZUFuZExpbmtlZENvbGxlY3RpYmxlKCk7IC8vIE1vZGlmaWVkIHRvIGhhbmRsZSBsaW5rZWQgY29sbGVjdGlibGVzXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vYnN0YWNsZVNwYXduVGltZXIgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmV4dE9ic3RhY2xlU3Bhd25UaW1lID0gdGhpcy5nZXRSYW5kb21TcGF3blRpbWUodGhpcy5jb25maWcuZ2FtZXBsYXkub2JzdGFjbGVTcGF3bkludGVydmFsTWluLCB0aGlzLmNvbmZpZy5nYW1lcGxheS5vYnN0YWNsZVNwYXduSW50ZXJ2YWxNYXgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIE5FVzogU3Bhd24gc3RhbmRhbG9uZSBjb2xsZWN0aWJsZXNcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyICs9IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA+PSB0aGlzLm5leHRDb2xsZWN0aWJsZVNwYXduVGltZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25TdGFuZGFsb25lQ29sbGVjdGlibGUoKTsgLy8gTmV3IGZ1bmN0aW9uIGZvciBjb2xsZWN0aWJsZXMgd2l0aG91dCBvYnN0YWNsZXNcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXh0Q29sbGVjdGlibGVTcGF3blRpbWUgPSB0aGlzLmdldFJhbmRvbVNwYXduVGltZShcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZXBsYXkuY29sbGVjdGlibGVTcGF3bkludGVydmFsTWluLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWxNYXhcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBhbmQgY2hlY2sgY29sbGlzaW9ucyBmb3Igb2JzdGFjbGVzXHJcbiAgICAgICAgICAgICAgICBjb25zdCBwbGF5ZXJSZWN0ID0gdGhpcy5wbGF5ZXIuZ2V0Q29sbGlzaW9uUmVjdCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMuZm9yRWFjaChvYnN0YWNsZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9ic3RhY2xlLmFjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBvYnN0YWNsZS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmN1cnJlbnRTcGVlZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghb2JzdGFjbGUuY29sbGlkZWQgJiYgY2hlY2tDb2xsaXNpb24ocGxheWVyUmVjdCwgb2JzdGFjbGUuZ2V0Q29sbGlzaW9uUmVjdCgpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmhpdCh0aGlzLmNvbmZpZy5nYW1lcGxheS5vYnN0YWNsZURhbWFnZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2hpdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9ic3RhY2xlLmNvbGxpZGVkID0gdHJ1ZTsgLy8gTWFyayBhcyBjb2xsaWRlZFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5saXZlcyA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgYW5kIGNoZWNrIGNvbGxpc2lvbnMgZm9yIGNvbGxlY3RpYmxlc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMuZm9yRWFjaChjb2xsZWN0aWJsZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3RpYmxlLmFjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xsZWN0aWJsZS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmN1cnJlbnRTcGVlZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY29sbGVjdGlibGUuY29sbGVjdGVkICYmIGNoZWNrQ29sbGlzaW9uKHBsYXllclJlY3QsIGNvbGxlY3RpYmxlLmdldENvbGxpc2lvblJlY3QoKSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gY29sbGVjdGlibGUuc2NvcmVWYWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbGxlY3RpYmxlLmNvbGxlY3RlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2NvbGxlY3QnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBzY29yZSBiYXNlZCBvbiBkaXN0YW5jZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSB0aGlzLmNvbmZpZy5nYW1lcGxheS5zY29yZVBlclNlY29uZCAqIGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NvcmVEaXNwbGF5ID0gTWF0aC5taW4odGhpcy5zY29yZSwgdGhpcy5zY29yZURpc3BsYXkgKyAodGhpcy5zY29yZSAtIHRoaXMuc2NvcmVEaXNwbGF5KSAqIGRlbHRhVGltZSAqIDUpOyAvLyBTbW9vdGggdXBkYXRlXHJcblxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgcGFyYWxsYXggbGF5ZXJzXHJcbiAgICAgICAgdGhpcy5wYXJhbGxheExheWVycy5mb3JFYWNoKGxheWVyID0+IGxheWVyLmRyYXcodGhpcy5jdHgpKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBncm91bmRcclxuICAgICAgICB0aGlzLmdyb3VuZC5kcmF3KHRoaXMuY3R4KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBvYnN0YWNsZXNcclxuICAgICAgICB0aGlzLm9ic3RhY2xlcy5mb3JFYWNoKG9ic3RhY2xlID0+IG9ic3RhY2xlLmRyYXcodGhpcy5jdHgpKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBjb2xsZWN0aWJsZXNcclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5mb3JFYWNoKGNvbGxlY3RpYmxlID0+IGNvbGxlY3RpYmxlLmRyYXcodGhpcy5jdHgpKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBwbGF5ZXJcclxuICAgICAgICB0aGlzLnBsYXllci5kcmF3KHRoaXMuY3R4KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBVSVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gdGhpcy5jb25maWcudWkuZm9udDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1QzgxMFx1QzIxODogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmVEaXNwbGF5KX1gLCAyMCwgNDApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBcdUNDQjRcdUI4MjU6ICR7dGhpcy5wbGF5ZXIubGl2ZXN9YCwgMjAsIDgwKTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKHRoaXMuYXNzZXRMb2FkZXIucHJvZ3Jlc3MpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Q2VudGVyZWRUZXh0KHRoaXMuY29uZmlnLnVpLnRpdGxlTWVzc2FnZSwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0NlbnRlcmVkVGV4dCh0aGlzLmNvbmZpZy51aS5zdGFydE1lc3NhZ2UsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCwgMjQpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkNPTlRST0xTOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Q2VudGVyZWRUZXh0KHRoaXMuY29uZmlnLnVpLmNvbnRyb2xzTWVzc2FnZSwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0NlbnRlcmVkVGV4dCh0aGlzLmNvbmZpZy51aS5zdGFydE1lc3NhZ2UsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCwgMjQpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0NlbnRlcmVkVGV4dCh0aGlzLmNvbmZpZy51aS5nYW1lT3Zlck1lc3NhZ2UsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdDZW50ZXJlZFRleHQoYFx1Q0Q1Q1x1Qzg4NSBcdUM4MTBcdUMyMTg6ICR7TWF0aC5mbG9vcih0aGlzLnNjb3JlKX1gLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMjApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3SGlnaFNjb3JlcygpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Q2VudGVyZWRUZXh0KHRoaXMuY29uZmlnLnVpLnJlc3RhcnRNZXNzYWdlLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTAwLCAyNCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TG9hZGluZ1NjcmVlbihwcm9ncmVzczogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzMwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdcdUI4NUNcdUI1MjkgXHVDOTExLi4uJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMzApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDEwMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgMjAwICogcHJvZ3Jlc3MsIDIwKTtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdCh0aGlzLmNhbnZhcy53aWR0aCAvIDIgLSAxMDAsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsIDIwMCwgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0NlbnRlcmVkVGV4dCh0ZXh0OiBzdHJpbmcsIHk6IG51bWJlciwgZm9udFNpemU6IG51bWJlciA9IDM2KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWkudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHtmb250U2l6ZX1weCAke3RoaXMuY29uZmlnLnVpLmZvbnQuc3BsaXQoJyAnKVsxXSB8fCAnQXJpYWwnfWA7IC8vIEV4dHJhY3QgZm9udCBmYW1pbHlcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlbmFtZWQgYW5kIG1vZGlmaWVkIGV4aXN0aW5nIHNwYXduT2JzdGFjbGUgdG8gb25seSBzcGF3biBvYnN0YWNsZSBhbmQgbGlua2VkIGNvbGxlY3RpYmxlXHJcbiAgICBwcml2YXRlIHNwYXduT2JzdGFjbGVBbmRMaW5rZWRDb2xsZWN0aWJsZSgpOiB2b2lkIHtcclxuICAgICAgICBsZXQgb2JzdGFjbGUgPSB0aGlzLm9ic3RhY2xlcy5maW5kKG8gPT4gIW8uYWN0aXZlKTtcclxuICAgICAgICBpZiAoIW9ic3RhY2xlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG9ic0NvbmZpZyA9IHRoaXMuY29uZmlnLm9ic3RhY2xlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5vYnN0YWNsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgIG9ic3RhY2xlID0gbmV3IE9ic3RhY2xlKG9ic0NvbmZpZywgdGhpcy5hc3NldExvYWRlciwgdGhpcy5jb25maWcuZ3JvdW5kLnksIHRoaXMuY2FudmFzLndpZHRoKTtcclxuICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMucHVzaChvYnN0YWNsZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByYW5kb21Db25maWcgPSB0aGlzLmNvbmZpZy5vYnN0YWNsZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5jb25maWcub2JzdGFjbGVzLmxlbmd0aCldO1xyXG4gICAgICAgIGNvbnN0IHNwYXduWCA9IHRoaXMuY2FudmFzLndpZHRoICsgTWF0aC5yYW5kb20oKSAqIDEwMDsgLy8gU3Bhd24gc2xpZ2h0bHkgb2ZmLXNjcmVlbiB0byB0aGUgcmlnaHRcclxuICAgICAgICBvYnN0YWNsZS5yZXNldChzcGF3blgpO1xyXG4gICAgICAgIG9ic3RhY2xlLndpZHRoID0gcmFuZG9tQ29uZmlnLndpZHRoO1xyXG4gICAgICAgIG9ic3RhY2xlLmhlaWdodCA9IHJhbmRvbUNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgb2JzdGFjbGUuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKHJhbmRvbUNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgb2JzdGFjbGUueSA9IHRoaXMuY29uZmlnLmdyb3VuZC55IC0gcmFuZG9tQ29uZmlnLnlPZmZzZXQgLSBvYnN0YWNsZS5oZWlnaHQ7XHJcbiAgICAgICAgb2JzdGFjbGUuYWN0aXZlID0gdHJ1ZTtcclxuICAgICAgICBvYnN0YWNsZS5jb2xsaWRlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBQb3RlbnRpYWxseSBzcGF3biBhIGNvbGxlY3RpYmxlICp3aXRoKiB0aGlzIG9ic3RhY2xlLCBhdCBhIGp1bXBhYmxlIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKE1hdGgucmFuZG9tKCkgPCB0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduQ2hhbmNlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25Db2xsZWN0aWJsZShvYnN0YWNsZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIE5FVzogRnVuY3Rpb24gdG8gc3Bhd24gY29sbGVjdGlibGVzIGluZGVwZW5kZW50bHkgb2Ygb2JzdGFjbGVzXHJcbiAgICBwcml2YXRlIHNwYXduU3RhbmRhbG9uZUNvbGxlY3RpYmxlKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHNwYXduWCA9IHRoaXMuY2FudmFzLndpZHRoICsgTWF0aC5yYW5kb20oKSAqIDE1MDsgLy8gU3Bhd24gZnVydGhlciBhaGVhZCBmb3Igc3RhbmRhbG9uZVxyXG4gICAgICAgIHRoaXMuc3Bhd25Db2xsZWN0aWJsZSh1bmRlZmluZWQsIHNwYXduWCk7IC8vIENhbGwgd2l0aCBubyBhc3NvY2lhdGVkIG9ic3RhY2xlXHJcbiAgICB9XHJcblxyXG4gICAgLy8gTW9kaWZpZWQgdG8gYWNjZXB0IG9wdGlvbmFsIGFzc29jaWF0ZWRPYnN0YWNsZSBmb3IgcG9zaXRpb25pbmcgbG9naWNcclxuICAgIHByaXZhdGUgc3Bhd25Db2xsZWN0aWJsZShhc3NvY2lhdGVkT2JzdGFjbGU/OiBPYnN0YWNsZSwgY3VzdG9tWD86IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGxldCBjb2xsZWN0aWJsZSA9IHRoaXMuY29sbGVjdGlibGVzLmZpbmQoYyA9PiAhYy5hY3RpdmUpO1xyXG4gICAgICAgIGlmICghY29sbGVjdGlibGUpIHtcclxuICAgICAgICAgICAgY29uc3QgY29sbENvbmZpZyA9IHRoaXMuY29uZmlnLmNvbGxlY3RpYmxlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5jb2xsZWN0aWJsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlID0gbmV3IENvbGxlY3RpYmxlKGNvbGxDb25maWcsIHRoaXMuYXNzZXRMb2FkZXIsIDAsIDApO1xyXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5wdXNoKGNvbGxlY3RpYmxlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHJhbmRvbUNvbmZpZyA9IHRoaXMuY29uZmlnLmNvbGxlY3RpYmxlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5jb2xsZWN0aWJsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgY29sbGVjdGlibGUuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKHJhbmRvbUNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgY29sbGVjdGlibGUuc2NvcmVWYWx1ZSA9IHJhbmRvbUNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgICAgIGNvbGxlY3RpYmxlLndpZHRoID0gcmFuZG9tQ29uZmlnLndpZHRoO1xyXG4gICAgICAgIGNvbGxlY3RpYmxlLmhlaWdodCA9IHJhbmRvbUNvbmZpZy5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGxldCBjb2xsZWN0aWJsZVk6IG51bWJlcjtcclxuICAgICAgICBsZXQgY29sbGVjdGlibGVYOiBudW1iZXI7XHJcblxyXG4gICAgICAgIGlmIChhc3NvY2lhdGVkT2JzdGFjbGUpIHtcclxuICAgICAgICAgICAgLy8gQ29sbGVjdGlibGUgd2l0aCBhbiBvYnN0YWNsZTogUG9zaXRpb24gaXQgc3VjaCB0aGF0IHRoZSBwbGF5ZXIgY2FuIGp1bXAgdG8gYWNxdWlyZSBpdC5cclxuICAgICAgICAgICAgY29sbGVjdGlibGVYID0gYXNzb2NpYXRlZE9ic3RhY2xlLnggKyBhc3NvY2lhdGVkT2JzdGFjbGUud2lkdGggLyAyIC0gY29sbGVjdGlibGUud2lkdGggLyAyO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgb2JzdGFjbGVUb3BZID0gYXNzb2NpYXRlZE9ic3RhY2xlLnk7IC8vIFRvcCBlZGdlIG9mIHRoZSBvYnN0YWNsZVxyXG4gICAgICAgICAgICBjb25zdCBwbGF5ZXJCYXNlWSA9IHRoaXMucGxheWVyLmJhc2VZOyAvLyBQbGF5ZXIncyB0b3AgWSB3aGVuIHJ1bm5pbmcgb24gZ3JvdW5kXHJcbiAgICAgICAgICAgIGNvbnN0IHBsYXllckp1bXBQZWFrWSA9IHBsYXllckJhc2VZIC0gdGhpcy5jb25maWcucGxheWVyLmp1bXBIZWlnaHQ7IC8vIEhpZ2hlc3QgWSBwbGF5ZXIgY2FuIHJlYWNoIGR1cmluZyBhIGp1bXBcclxuXHJcbiAgICAgICAgICAgIC8vIDEuIENhbGN1bGF0ZSBhIHRhcmdldCBZIHJlbGF0aXZlIHRvIHRoZSBvYnN0YWNsZSwgZW5zdXJpbmcgY2xlYXJhbmNlIGFib3ZlIGl0LlxyXG4gICAgICAgICAgICBjb25zdCB5RnJvbU9ic3RhY2xlVG9wID0gb2JzdGFjbGVUb3BZIC0gY29sbGVjdGlibGUuaGVpZ2h0IC0gMjA7IC8vIDIwcHggYnVmZmVyIGFib3ZlIG9ic3RhY2xlXHJcblxyXG4gICAgICAgICAgICAvLyAyLiBDYWxjdWxhdGUgYSB0YXJnZXQgWSB0aGF0IGlzIGdlbmVyYWxseSB3aXRoaW4gYSBjb21mb3J0YWJsZSBqdW1wIHJhbmdlIChlLmcuLCBtaWQtanVtcCkuXHJcbiAgICAgICAgICAgIGNvbnN0IGp1bXBhYmxlWUZyb21Hcm91bmRNaW5PZmZzZXQgPSB0aGlzLmNvbmZpZy5wbGF5ZXIuaGVpZ2h0ICogMC41OyAvLyBBdCBsZWFzdCBoYWxmIHBsYXllciBoZWlnaHQgYWJvdmUgZ3JvdW5kXHJcbiAgICAgICAgICAgIGNvbnN0IGp1bXBhYmxlWUZyb21Hcm91bmRNYXhPZmZzZXQgPSB0aGlzLmNvbmZpZy5wbGF5ZXIuanVtcEhlaWdodCAqIDAuODsgLy8gVXAgdG8gODAlIG9mIG1heCBqdW1wIGhlaWdodFxyXG4gICAgICAgICAgICBsZXQgcmFuZG9tSnVtcGFibGVZRnJvbUdyb3VuZCA9IHRoaXMuY29uZmlnLmdyb3VuZC55IC0gKGp1bXBhYmxlWUZyb21Hcm91bmRNaW5PZmZzZXQgKyBNYXRoLnJhbmRvbSgpICogKGp1bXBhYmxlWUZyb21Hcm91bmRNYXhPZmZzZXQgLSBqdW1wYWJsZVlGcm9tR3JvdW5kTWluT2Zmc2V0KSk7XHJcblxyXG4gICAgICAgICAgICAvLyBDb21iaW5lIHRoZXNlOiBjaG9vc2UgdGhlIGhpZ2hlciAoc21hbGxlciBZIHZhbHVlKSB0byBlbnN1cmUgaXQncyBib3RoIGFib3ZlIHRoZSBvYnN0YWNsZSBBTkQgd2l0aGluIGEgZ2VuZXJhbCBqdW1wYWJsZSByYW5nZVxyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZVkgPSBNYXRoLm1pbih5RnJvbU9ic3RhY2xlVG9wLCByYW5kb21KdW1wYWJsZVlGcm9tR3JvdW5kKTtcclxuXHJcbiAgICAgICAgICAgIC8vIDMuIEFwcGx5IGZpbmFsIGNsYW1wcyB0byBlbnN1cmUgcGxheWFiaWxpdHk6XHJcbiAgICAgICAgICAgIC8vIE11c3QgYmUgYWJvdmUgcGxheWVyJ3MgcnVubmluZyBoZWFkIChzbyBpdCByZXF1aXJlcyBhIGp1bXApXHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlWSA9IE1hdGgubWluKGNvbGxlY3RpYmxlWSwgcGxheWVyQmFzZVkgLSBjb2xsZWN0aWJsZS5oZWlnaHQgLSAxMCk7IC8vIDEwcHggYnVmZmVyIGFib3ZlIHBsYXllcidzIHRvcCB3aGVuIHJ1bm5pbmdcclxuICAgICAgICAgICAgLy8gTXVzdCBiZSByZWFjaGFibGUgYnkgcGxheWVyJ3MgbWF4IGp1bXAgKGNhbm5vdCBiZSBoaWdoZXIgdGhhbiBwZWFrKVxyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZVkgPSBNYXRoLm1heChjb2xsZWN0aWJsZVksIHBsYXllckp1bXBQZWFrWSk7XHJcbiAgICAgICAgICAgIC8vIE11c3QgYmUgc3RyaWN0bHkgYWJvdmUgdGhlIG9ic3RhY2xlIChyZS1jbGFtcCB3aXRoIG1pbmltdW0gYnVmZmVyKVxyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZVkgPSBNYXRoLm1pbihjb2xsZWN0aWJsZVksIG9ic3RhY2xlVG9wWSAtIGNvbGxlY3RpYmxlLmhlaWdodCAtIDEwKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFkZCBzbGlnaHQgcmFuZG9tbmVzcyBhcm91bmQgdGhlIGZpbmFsIGNhbGN1bGF0ZWQgWVxyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZVkgKz0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMTA7IC8vICsvLSA1cHhcclxuXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gU3RhbmRhbG9uZSBjb2xsZWN0aWJsZTogUG9zaXRpb24gcmFuZG9tbHkgaW4gdGhlIGFpciwgbm90IHRpZWQgdG8gYW4gb2JzdGFjbGUuXHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlWCA9IGN1c3RvbVggIT09IHVuZGVmaW5lZCA/IGN1c3RvbVggOiB0aGlzLmNhbnZhcy53aWR0aCArIE1hdGgucmFuZG9tKCkgKiAxMDA7XHJcblxyXG4gICAgICAgICAgICAvLyBVc2UgdGhlIGNvbmZpZydzIGNvbGxlY3RpYmxlU3Bhd25PZmZzZXQgZm9yIHJhbmRvbSBhaXIgcG9zaXRpb24gZnJvbSBncm91bmRcclxuICAgICAgICAgICAgY29uc3Qgb2Zmc2V0RnJvbUdyb3VuZCA9IHRoaXMuY29uZmlnLmdhbWVwbGF5LmNvbGxlY3RpYmxlU3Bhd25PZmZzZXRNaW4gK1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTWF0aC5yYW5kb20oKSAqICh0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduT2Zmc2V0TWF4IC0gdGhpcy5jb25maWcuZ2FtZXBsYXkuY29sbGVjdGlibGVTcGF3bk9mZnNldE1pbik7XHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlWSA9IHRoaXMuY29uZmlnLmdyb3VuZC55IC0gb2Zmc2V0RnJvbUdyb3VuZDtcclxuXHJcbiAgICAgICAgICAgIC8vIEVuc3VyZSBpdCdzIG5vdCB0b28gbG93IChvbiBncm91bmQpIG9yIHRvbyBoaWdoICh1bnJlYWNoYWJsZSlcclxuICAgICAgICAgICAgY29sbGVjdGlibGVZID0gTWF0aC5taW4oY29sbGVjdGlibGVZLCB0aGlzLmNvbmZpZy5ncm91bmQueSAtIGNvbGxlY3RpYmxlLmhlaWdodCAtIDEwKTsgLy8gQXQgbGVhc3QgMTBweCBvZmYgZ3JvdW5kXHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlWSA9IE1hdGgubWF4KGNvbGxlY3RpYmxlWSwgdGhpcy5wbGF5ZXIuYmFzZVkgLSB0aGlzLmNvbmZpZy5wbGF5ZXIuanVtcEhlaWdodCAqIDEuMSk7IC8vIE1heCAxMTAlIG9mIHBsYXllciBqdW1wIGhlaWdodFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29sbGVjdGlibGUucmVzZXQoY29sbGVjdGlibGVYLCBjb2xsZWN0aWJsZVkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgdGhpcy5zdG9wQkdNKCk7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9nYW1lX292ZXInKTtcclxuICAgICAgICB0aGlzLnNhdmVIaWdoU2NvcmUoTWF0aC5mbG9vcih0aGlzLnNjb3JlKSk7XHJcbiAgICAgICAgdGhpcy5nYW1lUGF1c2VkID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmlzV2FpdGluZ0ZvcklucHV0ID0gdHJ1ZTsgLy8gQWxsb3cgaW5wdXQgdG8gcmVzdGFydC9nbyB0byB0aXRsZVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzZXRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMucGxheWVyLnJlc2V0KCk7XHJcbiAgICAgICAgdGhpcy5nYW1lU3BlZWQgPSB0aGlzLmNvbmZpZy5nYW1lcGxheS5pbml0aWFsR2FtZVNwZWVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNwZWVkID0gdGhpcy5nYW1lU3BlZWQ7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5zY29yZURpc3BsYXkgPSAwO1xyXG5cclxuICAgICAgICAvLyBEZWFjdGl2YXRlIGFsbCBvYnN0YWNsZXMgYW5kIGNvbGxlY3RpYmxlc1xyXG4gICAgICAgIHRoaXMub2JzdGFjbGVzLmZvckVhY2gobyA9PiBvLmFjdGl2ZSA9IGZhbHNlKTtcclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5mb3JFYWNoKGMgPT4gYy5hY3RpdmUgPSBmYWxzZSk7XHJcblxyXG4gICAgICAgIHRoaXMucmVzZXRTcGF3blRpbWVycygpO1xyXG4gICAgICAgIHRoaXMuZ2FtZVBhdXNlZCA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuaXNXYWl0aW5nRm9ySW5wdXQgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLnBsYXlCR00oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5hc3NldExvYWRlci5nZXRTb3VuZChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgY29uc3Qgc291bmRJbnN0YW5jZSA9IGF1ZGlvLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICBzb3VuZEluc3RhbmNlLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBzb3VuZEluc3RhbmNlLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTtcclxuICAgICAgICAgICAgc291bmRJbnN0YW5jZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEF1ZGlvIHBsYXliYWNrIGZhaWxlZCBmb3IgJHtuYW1lfTogJHtlfWApKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5QkdNKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUJ1ZmZlciAmJiB0aGlzLmF1ZGlvQ29udGV4dC5zdGF0ZSA9PT0gJ3N1c3BlbmRlZCcpIHtcclxuICAgICAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCkudGhlbigoKSA9PiB0aGlzLl9zdGFydEJHTSgpKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuYmdtQnVmZmVyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX3N0YXJ0QkdNKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3N0YXJ0QkdNKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmJnbVNvdXJjZSkge1xyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdXJjZS5zdG9wKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291cmNlLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VyY2UgPSBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5iZ21Tb3VyY2UgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICB0aGlzLmJnbVNvdXJjZS5idWZmZXIgPSB0aGlzLmJnbUJ1ZmZlcjtcclxuICAgICAgICB0aGlzLmJnbVNvdXJjZS5sb29wID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmJnbVNvdXJjZS5jb25uZWN0KHRoaXMuYmdtR2Fpbk5vZGUpO1xyXG4gICAgICAgIHRoaXMuYmdtU291cmNlLnN0YXJ0KDApO1xyXG4gICAgICAgIHRoaXMuYmdtR2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpPy52b2x1bWUgfHwgMC41O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RvcEJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21Tb3VyY2UpIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VyY2Uuc3RvcCgpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdXJjZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291cmNlID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkSGlnaFNjb3JlcygpOiB2b2lkIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBzdG9yZWRTY29yZXMgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY29va2llUnVubmVySGlnaFNjb3JlcycpO1xyXG4gICAgICAgICAgICB0aGlzLmhpZ2hTY29yZXMgPSBzdG9yZWRTY29yZXMgPyBKU09OLnBhcnNlKHN0b3JlZFNjb3JlcykgOiBbXTtcclxuICAgICAgICAgICAgdGhpcy5oaWdoU2NvcmVzLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKTsgLy8gU29ydCBkZXNjZW5kaW5nXHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgaGlnaCBzY29yZXM6XCIsIGUpO1xyXG4gICAgICAgICAgICB0aGlzLmhpZ2hTY29yZXMgPSBbXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzYXZlSGlnaFNjb3JlKG5ld1Njb3JlOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gICAgICAgIGNvbnN0IHNjb3JlRW50cnkgPSB7XHJcbiAgICAgICAgICAgIHNjb3JlOiBuZXdTY29yZSxcclxuICAgICAgICAgICAgZGF0ZTogYCR7bm93LmdldEZ1bGxZZWFyKCl9LSR7KG5vdy5nZXRNb250aCgpICsgMSkudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfS0ke25vdy5nZXREYXRlKCkudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfWBcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLmhpZ2hTY29yZXMucHVzaChzY29yZUVudHJ5KTtcclxuICAgICAgICB0aGlzLmhpZ2hTY29yZXMuc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpO1xyXG4gICAgICAgIHRoaXMuaGlnaFNjb3JlcyA9IHRoaXMuaGlnaFNjb3Jlcy5zbGljZSgwLCA1KTsgLy8gS2VlcCB0b3AgNSBzY29yZXNcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2Nvb2tpZVJ1bm5lckhpZ2hTY29yZXMnLCBKU09OLnN0cmluZ2lmeSh0aGlzLmhpZ2hTY29yZXMpKTtcclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBoaWdoIHNjb3JlczpcIiwgZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0hpZ2hTY29yZXMoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWkudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMjRweCAke3RoaXMuY29uZmlnLnVpLmZvbnQuc3BsaXQoJyAnKVsxXSB8fCAnQXJpYWwnfWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1x1Q0Q1Q1x1QUNFMCBcdUM4MTBcdUMyMTgnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAzMCk7XHJcblxyXG4gICAgICAgIHRoaXMuaGlnaFNjb3Jlcy5mb3JFYWNoKChlbnRyeSwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7aW5kZXggKyAxfS4gJHtlbnRyeS5zY29yZX0gKCR7ZW50cnkuZGF0ZX0pYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNjAgKyBpbmRleCAqIDMwKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdFcnJvclNjcmVlbihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzMwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdcdUM2MjRcdUI5NTggXHVCQzFDXHVDMEREIScsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChtZXNzYWdlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBFbnN1cmUgdGhlIGdhbWUgc3RhcnRzIHdoZW4gdGhlIERPTSBpcyByZWFkeVxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaW5pdGlhbGl6ZSBnYW1lOlwiLCBlKTtcclxuICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIGVycm9yRGl2LnN0eWxlLmNvbG9yID0gJ3JlZCc7XHJcbiAgICAgICAgZXJyb3JEaXYuc3R5bGUudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgZXJyb3JEaXYuc3R5bGUubWFyZ2luVG9wID0gJzUwcHgnO1xyXG4gICAgICAgIGVycm9yRGl2LmlubmVyVGV4dCA9IGBcdUFDOENcdUM3ODQgXHVDRDA4XHVBRTMwXHVENjU0IFx1QzkxMSBcdUM2MjRcdUI5NTggXHVCQzFDXHVDMEREOiAke2UubWVzc2FnZX0uIFx1Q0Y1OFx1QzE5NFx1Qzc0NCBcdUQ2NTVcdUM3NzhcdUQ1NzRcdUM4RkNcdUMxMzhcdUM2OTQuYDtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgIH1cclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQTJHQSxTQUFTLGVBQWUsT0FBYSxPQUFzQjtBQUN2RCxTQUFPLE1BQU0sSUFBSSxNQUFNLElBQUksTUFBTSxTQUMxQixNQUFNLElBQUksTUFBTSxRQUFRLE1BQU0sS0FDOUIsTUFBTSxJQUFJLE1BQU0sSUFBSSxNQUFNLFVBQzFCLE1BQU0sSUFBSSxNQUFNLFNBQVMsTUFBTTtBQUMxQztBQUdBLE1BQU0sWUFBWTtBQUFBLEVBT2QsWUFBWSxZQUF5QztBQU5yRCxTQUFRLFNBQXdDLG9CQUFJLElBQUk7QUFDeEQsU0FBUSxTQUF3QyxvQkFBSSxJQUFJO0FBQ3hELFNBQVEsY0FBc0I7QUFDOUIsU0FBUSxhQUFxQjtBQUl6QixTQUFLLGFBQWE7QUFBQSxFQUN0QjtBQUFBLEVBRUEsTUFBTSxLQUFLLGFBQTJCLGFBQTBDO0FBQzVFLFNBQUssYUFBYSxZQUFZLFNBQVMsWUFBWTtBQUNuRCxRQUFJLEtBQUssZUFBZSxHQUFHO0FBQ3ZCLFdBQUssYUFBYSxDQUFDO0FBQ25CLGFBQU8sUUFBUSxRQUFRO0FBQUEsSUFDM0I7QUFFQSxVQUFNLGdCQUFnQixZQUFZLElBQUksV0FBUyxLQUFLLFVBQVUsS0FBSyxDQUFDO0FBQ3BFLFVBQU0sZ0JBQWdCLFlBQVksSUFBSSxXQUFTLEtBQUssVUFBVSxLQUFLLENBQUM7QUFFcEUsVUFBTSxRQUFRLFdBQVcsQ0FBQyxHQUFHLGVBQWUsR0FBRyxhQUFhLENBQUM7QUFDN0QsU0FBSyxhQUFhLENBQUM7QUFBQSxFQUN2QjtBQUFBLEVBRVEsaUJBQWlCO0FBQ3JCLFNBQUs7QUFDTCxTQUFLLGFBQWEsS0FBSyxR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
