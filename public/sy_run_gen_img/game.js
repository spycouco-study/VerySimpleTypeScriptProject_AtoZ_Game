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
  // Tracks consecutive jumps
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
    this.jumpCount = 0;
    this.x = config.x;
    this.y = config.y;
    this.width = config.width;
    this.height = config.height;
    this.initialHeight = config.height;
    this.baseY = groundY - config.height;
    this.y = this.baseY;
    this.lives = config.lives;
    this.jumpCount = 0;
  }
  jump() {
    if (this.onGround && this.animationState !== 2 /* SLIDING */) {
      this.velocityY = -this.config.jumpForce;
      this.onGround = false;
      this.animationState = 1 /* JUMPING */;
      this.animationTimer = 0;
      this.jumpCount = 1;
      return true;
    } else if (!this.onGround && this.jumpCount < this.config.maxJumps && this.animationState !== 2 /* SLIDING */) {
      this.velocityY = -this.config.jumpForce;
      this.animationState = 1 /* JUMPING */;
      this.animationTimer = 0;
      this.jumpCount++;
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
        this.jumpCount = 0;
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
    this.jumpCount = 0;
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
    const playerGroundTopY = this.player.baseY;
    const playerSingleJumpApexTopY = playerGroundTopY - this.config.player.jumpHeight;
    const playerSingleJumpApexBottomY = playerSingleJumpApexTopY + this.player.height;
    if (associatedObstacle) {
      collectibleX = associatedObstacle.x + associatedObstacle.width / 2 - collectible.width / 2;
      const obstacleTopY = associatedObstacle.y;
      let targetY;
      const idealCollectibleTopY_reachable = playerSingleJumpApexTopY + this.player.height * 0.2;
      const maxCollectibleTopY_clearance = obstacleTopY - collectible.height - 10;
      targetY = idealCollectibleTopY_reachable;
      if (targetY + collectible.height + 5 > obstacleTopY) {
        targetY = maxCollectibleTopY_clearance;
      }
      collectibleY = targetY;
      collectibleY += (Math.random() - 0.5) * 20;
    } else {
      collectibleX = customX !== void 0 ? customX : this.canvas.width + Math.random() * 100;
      let tempY = this.config.ground.y - (this.config.gameplay.collectibleSpawnOffsetMin + Math.random() * (this.config.gameplay.collectibleSpawnOffsetMax - this.config.gameplay.collectibleSpawnOffsetMin));
      const maxAllowedCollectibleTopY = playerSingleJumpApexTopY + this.player.height * 0.2;
      tempY = Math.max(tempY, maxAllowedCollectibleTopY);
      const minAllowedCollectibleTopY = this.config.ground.y - collectible.height - 10;
      tempY = Math.min(tempY, minAllowedCollectibleTopY);
      collectibleY = tempY;
      collectibleY += (Math.random() - 0.5) * 20;
    }
    collectibleY = Math.max(collectibleY, 0);
    collectibleY = Math.min(collectibleY, this.config.ground.y - collectible.height - 5);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9O1xyXG4gICAgcGxheWVyOiBQbGF5ZXJDb25maWc7XHJcbiAgICBnYW1lcGxheTogR2FtZXBsYXlDb25maWc7XHJcbiAgICBwYXJhbGxheDogUGFyYWxsYXhMYXllckNvbmZpZ1tdO1xyXG4gICAgZ3JvdW5kOiBHcm91bmRDb25maWc7XHJcbiAgICBvYnN0YWNsZXM6IE9ic3RhY2xlQ29uZmlnW107XHJcbiAgICBjb2xsZWN0aWJsZXM6IENvbGxlY3RpYmxlQ29uZmlnW107XHJcbiAgICB1aTogVUlDb25maWc7XHJcbiAgICBhc3NldHM6IHsgaW1hZ2VzOiBJbWFnZUFzc2V0W107IHNvdW5kczogU291bmRBc3NldFtdOyB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUGxheWVyQ29uZmlnIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjsgLy8gSW5pdGlhbCBZIHBvc2l0aW9uIChncm91bmRlZClcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGp1bXBIZWlnaHQ6IG51bWJlcjtcclxuICAgIHNsaWRlSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBncmF2aXR5OiBudW1iZXI7XHJcbiAgICBqdW1wRm9yY2U6IG51bWJlcjtcclxuICAgIHNsaWRlRHVyYXRpb246IG51bWJlcjtcclxuICAgIGFuaW1hdGlvblNwZWVkOiBudW1iZXI7IC8vIFRpbWUgcGVyIGZyYW1lIGluIHNlY29uZHNcclxuICAgIHJ1bm5pbmdGcmFtZXM6IHN0cmluZ1tdO1xyXG4gICAganVtcGluZ0ZyYW1lOiBzdHJpbmc7XHJcbiAgICBzbGlkaW5nRnJhbWU6IHN0cmluZztcclxuICAgIGludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyOyAvLyBEdXJhdGlvbiBvZiBpbnZpbmNpYmlsaXR5IGFmdGVyIGhpdFxyXG4gICAgYmxpbmtGcmVxdWVuY3k6IG51bWJlcjsgLy8gSG93IG9mdGVuIHBsYXllciBibGlua3MgZHVyaW5nIGludmluY2liaWxpdHlcclxuICAgIGxpdmVzOiBudW1iZXI7XHJcbiAgICBtYXhKdW1wczogbnVtYmVyOyAvLyBOdW1iZXIgb2YganVtcHMgYWxsb3dlZCAoMSBmb3Igc2luZ2xlLCAyIGZvciBkb3VibGUpXHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lcGxheUNvbmZpZyB7XHJcbiAgICBpbml0aWFsR2FtZVNwZWVkOiBudW1iZXI7XHJcbiAgICBtYXhHYW1lU3BlZWQ6IG51bWJlcjtcclxuICAgIHNwZWVkSW5jcmVhc2VSYXRlOiBudW1iZXI7IC8vIFNwZWVkIGluY3JlYXNlIHBlciBzZWNvbmRcclxuICAgIG9ic3RhY2xlU3Bhd25JbnRlcnZhbE1pbjogbnVtYmVyOyAvLyBNaW4gdGltZSBiZWZvcmUgbmV4dCBvYnN0YWNsZSBzcGF3blxyXG4gICAgb2JzdGFjbGVTcGF3bkludGVydmFsTWF4OiBudW1iZXI7IC8vIE1heCB0aW1lIGJlZm9yZSBuZXh0IG9ic3RhY2xlIHNwYXduXHJcbiAgICBjb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWxNaW46IG51bWJlcjsgLy8gTWluIHRpbWUgYmVmb3JlIG5leHQgc3RhbmRhbG9uZSBjb2xsZWN0aWJsZSBzcGF3biAoTkVXKVxyXG4gICAgY29sbGVjdGlibGVTcGF3bkludGVydmFsTWF4OiBudW1iZXI7IC8vIE1heCB0aW1lIGJlZm9yZSBuZXh0IHN0YW5kYWxvbmUgY29sbGVjdGlibGUgc3Bhd24gKE5FVylcclxuICAgIGNvbGxlY3RpYmxlU3Bhd25DaGFuY2U6IG51bWJlcjsgLy8gUHJvYmFiaWxpdHkgdG8gc3Bhd24gYSBjb2xsZWN0aWJsZSB3aXRoIGFuIG9ic3RhY2xlXHJcbiAgICBjb2xsZWN0aWJsZVNwYXduT2Zmc2V0TWluOiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kIGZvciBzdGFuZGFsb25lIGNvbGxlY3RpYmxlXHJcbiAgICBjb2xsZWN0aWJsZVNwYXduT2Zmc2V0TWF4OiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kIGZvciBzdGFuZGFsb25lIGNvbGxlY3RpYmxlXHJcbiAgICBzY29yZVBlclNlY29uZDogbnVtYmVyO1xyXG4gICAgb2JzdGFjbGVEYW1hZ2U6IG51bWJlcjsgLy8gSG93IG11Y2ggZGFtYWdlIGFuIG9ic3RhY2xlIGRvZXNcclxufVxyXG5cclxuaW50ZXJmYWNlIFBhcmFsbGF4TGF5ZXJDb25maWcge1xyXG4gICAgaW1hZ2U6IHN0cmluZztcclxuICAgIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xyXG4gICAgeU9mZnNldDogbnVtYmVyOyAvLyBZIHBvc2l0aW9uIHJlbGF0aXZlIHRvIGNhbnZhcyB0b3BcclxuICAgIGhlaWdodDogbnVtYmVyOyAvLyBIZWlnaHQgdG8gZHJhdyB0aGUgaW1hZ2VcclxufVxyXG5cclxuaW50ZXJmYWNlIEdyb3VuZENvbmZpZyB7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgeTogbnVtYmVyOyAvLyBZIHBvc2l0aW9uIG9mIHRoZSB0b3Agb2YgdGhlIGdyb3VuZFxyXG4gICAgaGVpZ2h0OiBudW1iZXI7IC8vIEhlaWdodCB0byBkcmF3IHRoZSBncm91bmQgaW1hZ2VcclxufVxyXG5cclxuaW50ZXJmYWNlIE9ic3RhY2xlQ29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB5T2Zmc2V0OiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kXHJcbn1cclxuXHJcbmludGVyZmFjZSBDb2xsZWN0aWJsZUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVUlDb25maWcge1xyXG4gICAgZm9udDogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICB0aXRsZU1lc3NhZ2U6IHN0cmluZztcclxuICAgIGNvbnRyb2xzTWVzc2FnZTogc3RyaW5nO1xyXG4gICAgc3RhcnRNZXNzYWdlOiBzdHJpbmc7XHJcbiAgICBnYW1lT3Zlck1lc3NhZ2U6IHN0cmluZztcclxuICAgIHJlc3RhcnRNZXNzYWdlOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBSZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuLy8gVXRpbGl0eSBmdW5jdGlvbiBmb3IgQUFCQiBjb2xsaXNpb24gZGV0ZWN0aW9uXHJcbmZ1bmN0aW9uIGNoZWNrQ29sbGlzaW9uKHJlY3QxOiBSZWN0LCByZWN0MjogUmVjdCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHJlY3QxLnggPCByZWN0Mi54ICsgcmVjdDIud2lkdGggJiZcclxuICAgICAgICAgICByZWN0MS54ICsgcmVjdDEud2lkdGggPiByZWN0Mi54ICYmXHJcbiAgICAgICAgICAgcmVjdDEueSA8IHJlY3QyLnkgKyByZWN0Mi5oZWlnaHQgJiZcclxuICAgICAgICAgICByZWN0MS55ICsgcmVjdDEuaGVpZ2h0ID4gcmVjdDIueTtcclxufVxyXG5cclxuLy8gQXNzZXQgTG9hZGVyIENsYXNzXHJcbmNsYXNzIEFzc2V0TG9hZGVyIHtcclxuICAgIHByaXZhdGUgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgbG9hZGVkQ291bnQ6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHRvdGFsQ291bnQ6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG9uUHJvZ3Jlc3M/OiAocHJvZ3Jlc3M6IG51bWJlcikgPT4gdm9pZDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihvblByb2dyZXNzPzogKHByb2dyZXNzOiBudW1iZXIpID0+IHZvaWQpIHtcclxuICAgICAgICB0aGlzLm9uUHJvZ3Jlc3MgPSBvblByb2dyZXNzO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGxvYWQoaW1hZ2VBc3NldHM6IEltYWdlQXNzZXRbXSwgc291bmRBc3NldHM6IFNvdW5kQXNzZXRbXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMudG90YWxDb3VudCA9IGltYWdlQXNzZXRzLmxlbmd0aCArIHNvdW5kQXNzZXRzLmxlbmd0aDtcclxuICAgICAgICBpZiAodGhpcy50b3RhbENvdW50ID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMub25Qcm9ncmVzcz8uKDEpO1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gaW1hZ2VBc3NldHMubWFwKGFzc2V0ID0+IHRoaXMubG9hZEltYWdlKGFzc2V0KSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHNvdW5kQXNzZXRzLm1hcChhc3NldCA9PiB0aGlzLmxvYWRTb3VuZChhc3NldCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICB0aGlzLm9uUHJvZ3Jlc3M/LigxKTsgLy8gRW5zdXJlIHByb2dyZXNzIGlzIDEgYXQgdGhlIGVuZFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUHJvZ3Jlc3MoKSB7XHJcbiAgICAgICAgdGhpcy5sb2FkZWRDb3VudCsrO1xyXG4gICAgICAgIHRoaXMub25Qcm9ncmVzcz8uKHRoaXMucHJvZ3Jlc3MpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKGFzc2V0OiBJbWFnZUFzc2V0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoYXNzZXQubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQcm9ncmVzcygpOyAvLyBTdGlsbCBjb3VudCBhcyBsb2FkZWQgdG8gYXZvaWQgYmxvY2tpbmdcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBhbnl3YXkgdG8gYWxsb3cgb3RoZXIgYXNzZXRzIHRvIGxvYWRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoYXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAvLyBVc2luZyBvbmNhbnBsYXl0aHJvdWdoIGVuc3VyZXMgdGhlIGVudGlyZSBzb3VuZCBjYW4gcGxheSB3aXRob3V0IGludGVycnVwdGlvblxyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gYXNzZXQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke2Fzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVByb2dyZXNzKCk7IC8vIFN0aWxsIGNvdW50IGFzIGxvYWRlZFxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGFueXdheVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIEV4cGxpY2l0bHkgbG9hZCBmb3Igc29tZSBicm93c2Vyc1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEltYWdlKG5hbWU6IHN0cmluZyk6IEhUTUxJbWFnZUVsZW1lbnQge1xyXG4gICAgICAgIGNvbnN0IGltZyA9IHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoIWltZykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYEltYWdlIFwiJHtuYW1lfVwiIG5vdCBmb3VuZCBpbiBhc3NldHMuIFJldHVybmluZyBhIGR1bW15IGltYWdlLmApO1xyXG4gICAgICAgICAgICBjb25zdCBkdW1teSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBkdW1teS5zcmMgPSBcImRhdGE6aW1hZ2UvZ2lmO2Jhc2U2NCxSMGxHT0RsaEFRQUJBQUQvQUN3QUFBQUFBUUFCQUFBQ0FEcz1cIjsgLy8gVHJhbnNwYXJlbnQgMXgxIEdJRlxyXG4gICAgICAgICAgICByZXR1cm4gZHVtbXk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBpbWc7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0U291bmQobmFtZTogc3RyaW5nKTogSFRNTEF1ZGlvRWxlbWVudCB7XHJcbiAgICAgICAgY29uc3Qgc291bmQgPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKCFzb3VuZCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kIFwiJHtuYW1lfVwiIG5vdCBmb3VuZCBpbiBhc3NldHMuIFJldHVybmluZyBhIGR1bW15IEF1ZGlvLmApO1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEF1ZGlvKCk7IC8vIFJldHVybiBhIHNpbGVudCBhdWRpbyBvYmplY3RcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHNvdW5kO1xyXG4gICAgfVxyXG5cclxuICAgIGdldCBwcm9ncmVzcygpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRvdGFsQ291bnQgPiAwID8gdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxDb3VudCA6IDE7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdhbWUgU3RhdGUgRW51bVxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HLFxyXG4gICAgVElUTEUsXHJcbiAgICBDT05UUk9MUyxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVJcclxufVxyXG5cclxuLy8gUGxheWVyIFN0YXRlc1xyXG5lbnVtIFBsYXllckFuaW1hdGlvblN0YXRlIHtcclxuICAgIFJVTk5JTkcsXHJcbiAgICBKVU1QSU5HLFxyXG4gICAgU0xJRElOR1xyXG59XHJcblxyXG4vLyBQbGF5ZXIgQ2xhc3NcclxuY2xhc3MgUGxheWVyIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGJhc2VZOiBudW1iZXI7IC8vIFkgcG9zaXRpb24gd2hlbiBvbiBncm91bmQgd2l0aCBpbml0aWFsIGhlaWdodFxyXG4gICAgaW5pdGlhbEhlaWdodDogbnVtYmVyOyAvLyBQbGF5ZXIncyBoZWlnaHQgd2hlbiBydW5uaW5nXHJcbiAgICB2ZWxvY2l0eVk6IG51bWJlciA9IDA7XHJcbiAgICBvbkdyb3VuZDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICBhbmltYXRpb25TdGF0ZTogUGxheWVyQW5pbWF0aW9uU3RhdGUgPSBQbGF5ZXJBbmltYXRpb25TdGF0ZS5SVU5OSU5HO1xyXG4gICAgY3VycmVudEFuaW1hdGlvbkZyYW1lOiBudW1iZXIgPSAwO1xyXG4gICAgYW5pbWF0aW9uVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBzbGlkZVRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgaXNJbnZpbmNpYmxlOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBpbnZpbmNpYmxlVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBibGlua1RpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgbGl2ZXM6IG51bWJlcjtcclxuICAgIGp1bXBDb3VudDogbnVtYmVyID0gMDsgLy8gVHJhY2tzIGNvbnNlY3V0aXZlIGp1bXBzXHJcblxyXG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBjb25maWc6IFBsYXllckNvbmZpZywgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXIsIGdyb3VuZFk6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCA9IGNvbmZpZy54O1xyXG4gICAgICAgIHRoaXMueSA9IGNvbmZpZy55O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSBjb25maWcud2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW5pdGlhbEhlaWdodCA9IGNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5iYXNlWSA9IGdyb3VuZFkgLSBjb25maWcuaGVpZ2h0OyAvLyBDYWxjdWxhdGUgYmFzZSBZIGJhc2VkIG9uIGdyb3VuZFxyXG4gICAgICAgIHRoaXMueSA9IHRoaXMuYmFzZVk7IC8vIFN0YXJ0IG9uIHRoZSBncm91bmRcclxuICAgICAgICB0aGlzLmxpdmVzID0gY29uZmlnLmxpdmVzO1xyXG4gICAgICAgIHRoaXMuanVtcENvdW50ID0gMDtcclxuICAgIH1cclxuXHJcbiAgICBqdW1wKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIC8vIEFsbG93IGp1bXAgaWYgb24gZ3JvdW5kIE9SIGlmIGhhcyByZW1haW5pbmcganVtcHMgKGZvciBkb3VibGUganVtcClcclxuICAgICAgICBpZiAodGhpcy5vbkdyb3VuZCAmJiB0aGlzLmFuaW1hdGlvblN0YXRlICE9PSBQbGF5ZXJBbmltYXRpb25TdGF0ZS5TTElESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZID0gLXRoaXMuY29uZmlnLmp1bXBGb3JjZTtcclxuICAgICAgICAgICAgdGhpcy5vbkdyb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuSlVNUElORztcclxuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciA9IDA7IC8vIFJlc2V0IGFuaW1hdGlvbiBmb3IganVtcCBmcmFtZVxyXG4gICAgICAgICAgICB0aGlzLmp1bXBDb3VudCA9IDE7IC8vIEZpcnN0IGp1bXBcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfSBlbHNlIGlmICghdGhpcy5vbkdyb3VuZCAmJiB0aGlzLmp1bXBDb3VudCA8IHRoaXMuY29uZmlnLm1heEp1bXBzICYmIHRoaXMuYW5pbWF0aW9uU3RhdGUgIT09IFBsYXllckFuaW1hdGlvblN0YXRlLlNMSURJTkcpIHtcclxuICAgICAgICAgICAgLy8gRG91YmxlIGp1bXAgKG9yIG11bHRpcGxlIGp1bXBzIGJhc2VkIG9uIG1heEp1bXBzKVxyXG4gICAgICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IC10aGlzLmNvbmZpZy5qdW1wRm9yY2U7IC8vIEFwcGx5IGZ1bGwganVtcCBmb3JjZSBhZ2FpblxyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuSlVNUElORztcclxuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuanVtcENvdW50Kys7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgc2xpZGUoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKHRoaXMub25Hcm91bmQgJiYgdGhpcy5hbmltYXRpb25TdGF0ZSAhPT0gUGxheWVyQW5pbWF0aW9uU3RhdGUuSlVNUElORyAmJiB0aGlzLmFuaW1hdGlvblN0YXRlICE9PSBQbGF5ZXJBbmltYXRpb25TdGF0ZS5TTElESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYW5pbWF0aW9uU3RhdGUgPSBQbGF5ZXJBbmltYXRpb25TdGF0ZS5TTElESU5HO1xyXG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuY29uZmlnLnNsaWRlSGVpZ2h0O1xyXG4gICAgICAgICAgICAvLyBBZGp1c3QgWSB0byBrZWVwIGJvdHRvbSBvZiBwbGF5ZXIgYXQgZ3JvdW5kIGxldmVsXHJcbiAgICAgICAgICAgIHRoaXMueSA9IHRoaXMuYmFzZVkgKyAodGhpcy5pbml0aWFsSGVpZ2h0IC0gdGhpcy5jb25maWcuc2xpZGVIZWlnaHQpO1xyXG4gICAgICAgICAgICB0aGlzLnNsaWRlVGltZXIgPSB0aGlzLmNvbmZpZy5zbGlkZUR1cmF0aW9uO1xyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGlvblRpbWVyID0gMDsgLy8gUmVzZXQgYW5pbWF0aW9uIGZvciBzbGlkZSBmcmFtZVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ3JvdW5kWTogbnVtYmVyKSB7XHJcbiAgICAgICAgLy8gSGFuZGxlIGdyYXZpdHlcclxuICAgICAgICBpZiAoIXRoaXMub25Hcm91bmQpIHtcclxuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgKz0gdGhpcy5jb25maWcuZ3Jhdml0eSAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMudmVsb2NpdHlZICogZGVsdGFUaW1lO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBmb3IgbGFuZGluZyBvbiBncm91bmRcclxuICAgICAgICBpZiAodGhpcy55ICsgdGhpcy5oZWlnaHQgPj0gZ3JvdW5kWSkge1xyXG4gICAgICAgICAgICB0aGlzLnkgPSBncm91bmRZIC0gdGhpcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5vbkdyb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vbkdyb3VuZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IDA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmp1bXBDb3VudCA9IDA7IC8vIFJlc2V0IGp1bXAgY291bnQgb24gbGFuZGluZ1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uU3RhdGUgPT09IFBsYXllckFuaW1hdGlvblN0YXRlLkpVTVBJTkcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuUlVOTklORzsgLy8gTGFuZGVkLCBnbyBiYWNrIHRvIHJ1bm5pbmdcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaW5pdGlhbEhlaWdodDsgLy8gUmVzZXQgaGVpZ2h0XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5iYXNlWTsgLy8gUmUtYWxpZ24gcGxheWVyIHRvIGdyb3VuZCBhZnRlciBqdW1wXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBzbGlkaW5nIGR1cmF0aW9uXHJcbiAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uU3RhdGUgPT09IFBsYXllckFuaW1hdGlvblN0YXRlLlNMSURJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5zbGlkZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc2xpZGVUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuUlVOTklORztcclxuICAgICAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5pbml0aWFsSGVpZ2h0OyAvLyBSZXNldCBoZWlnaHQgYWZ0ZXIgc2xpZGluZ1xyXG4gICAgICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5iYXNlWTsgLy8gUmVzZXQgWSBwb3NpdGlvblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcnVubmluZyBhbmltYXRpb24gZnJhbWUgdXBkYXRlXHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uU3RhdGUgPT09IFBsYXllckFuaW1hdGlvblN0YXRlLlJVTk5JTkcgJiYgdGhpcy5hbmltYXRpb25UaW1lciA+PSB0aGlzLmNvbmZpZy5hbmltYXRpb25TcGVlZCkge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRBbmltYXRpb25GcmFtZSA9ICh0aGlzLmN1cnJlbnRBbmltYXRpb25GcmFtZSArIDEpICUgdGhpcy5jb25maWcucnVubmluZ0ZyYW1lcy5sZW5ndGg7XHJcbiAgICAgICAgICAgIHRoaXMuYW5pbWF0aW9uVGltZXIgPSAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGludmluY2liaWxpdHlcclxuICAgICAgICBpZiAodGhpcy5pc0ludmluY2libGUpIHtcclxuICAgICAgICAgICAgdGhpcy5pbnZpbmNpYmxlVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICB0aGlzLmJsaW5rVGltZXIgKz0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmxlVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pc0ludmluY2libGUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmxpbmtUaW1lciA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGlmICh0aGlzLmlzSW52aW5jaWJsZSAmJiBNYXRoLmZsb29yKHRoaXMuYmxpbmtUaW1lciAqIHRoaXMuY29uZmlnLmJsaW5rRnJlcXVlbmN5KSAlIDIgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBCbGluayBlZmZlY3Q6IHNraXAgZHJhd2luZ1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGltYWdlO1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5hbmltYXRpb25TdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIFBsYXllckFuaW1hdGlvblN0YXRlLkpVTVBJTkc6XHJcbiAgICAgICAgICAgICAgICBpbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcuanVtcGluZ0ZyYW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFBsYXllckFuaW1hdGlvblN0YXRlLlNMSURJTkc6XHJcbiAgICAgICAgICAgICAgICBpbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcuc2xpZGluZ0ZyYW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFBsYXllckFuaW1hdGlvblN0YXRlLlJVTk5JTkc6XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBpbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcucnVubmluZ0ZyYW1lc1t0aGlzLmN1cnJlbnRBbmltYXRpb25GcmFtZV0pO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0Q29sbGlzaW9uUmVjdCgpOiBSZWN0IHtcclxuICAgICAgICByZXR1cm4geyB4OiB0aGlzLngsIHk6IHRoaXMueSwgd2lkdGg6IHRoaXMud2lkdGgsIGhlaWdodDogdGhpcy5oZWlnaHQgfTtcclxuICAgIH1cclxuXHJcbiAgICBoaXQoZGFtYWdlOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNJbnZpbmNpYmxlKSB7XHJcbiAgICAgICAgICAgIHRoaXMubGl2ZXMgLT0gZGFtYWdlO1xyXG4gICAgICAgICAgICB0aGlzLmlzSW52aW5jaWJsZSA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gdGhpcy5jb25maWcuaW52aW5jaWJpbGl0eUR1cmF0aW9uO1xyXG4gICAgICAgICAgICB0aGlzLmJsaW5rVGltZXIgPSAwO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gUGxheWVyIHdhcyBoaXQgYW5kIHRvb2sgZGFtYWdlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTsgLy8gUGxheWVyIHdhcyBpbnZpbmNpYmxlXHJcbiAgICB9XHJcblxyXG4gICAgcmVzZXQoKSB7XHJcbiAgICAgICAgdGhpcy54ID0gdGhpcy5jb25maWcueDtcclxuICAgICAgICB0aGlzLnkgPSB0aGlzLmJhc2VZO1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmNvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaW5pdGlhbEhlaWdodDtcclxuICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IDA7XHJcbiAgICAgICAgdGhpcy5vbkdyb3VuZCA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25TdGF0ZSA9IFBsYXllckFuaW1hdGlvblN0YXRlLlJVTk5JTkc7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QW5pbWF0aW9uRnJhbWUgPSAwO1xyXG4gICAgICAgIHRoaXMuYW5pbWF0aW9uVGltZXIgPSAwO1xyXG4gICAgICAgIHRoaXMuc2xpZGVUaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5pc0ludmluY2libGUgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmludmluY2libGVUaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5ibGlua1RpbWVyID0gMDtcclxuICAgICAgICB0aGlzLmxpdmVzID0gdGhpcy5jb25maWcubGl2ZXM7XHJcbiAgICAgICAgdGhpcy5qdW1wQ291bnQgPSAwOyAvLyBSZXNldCBqdW1wIGNvdW50XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFBhcmFsbGF4IExheWVyIENsYXNzXHJcbmNsYXNzIFBhcmFsbGF4TGF5ZXIge1xyXG4gICAgeDogbnVtYmVyID0gMDtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgc3BlZWQ6IG51bWJlcjsgLy8gQ2FsY3VsYXRlZCBiYXNlZCBvbiBnYW1lIHNwZWVkIGFuZCBtdWx0aXBsaWVyXHJcblxyXG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBjb25maWc6IFBhcmFsbGF4TGF5ZXJDb25maWcsIHByaXZhdGUgYXNzZXRMb2FkZXI6IEFzc2V0TG9hZGVyLCBjYW52YXNXaWR0aDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UoY29uZmlnLmltYWdlKTtcclxuICAgICAgICB0aGlzLnkgPSBjb25maWcueU9mZnNldDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgLy8gSW1hZ2Ugd2lkdGggc2hvdWxkIGlkZWFsbHkgYmUgY2FudmFzV2lkdGggb3IgYSBtdWx0aXBsZSBmb3Igc2VhbWxlc3MgdGlsaW5nXHJcbiAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHksIHdlIGFzc3VtZSBpbWFnZS53aWR0aCB3aWxsIGJlIHVzZWQgYW5kIGRyYXduIHR3aWNlLlxyXG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmltYWdlLndpZHRoOyAvLyBVc2UgYWN0dWFsIGltYWdlIHdpZHRoIGZvciBjYWxjdWxhdGlvblxyXG4gICAgICAgIGlmICh0aGlzLndpZHRoID09PSAwKSB7IC8vIEZhbGxiYWNrIGZvciB1bmxvYWRlZCBpbWFnZVxyXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gY2FudmFzV2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc3BlZWQgPSAwOyAvLyBXaWxsIGJlIHVwZGF0ZWQgYnkgZ2FtZSBsb2dpY1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNwZWVkID0gZ2FtZVNwZWVkICogdGhpcy5jb25maWcuc3BlZWRNdWx0aXBsaWVyO1xyXG4gICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggPD0gLXRoaXMud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICAvLyBEcmF3IHRoZSBpbWFnZSB0d2ljZSB0byBjcmVhdGUgYSBzZWFtbGVzcyBsb29wXHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54ICsgdGhpcy53aWR0aCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgLy8gSWYgaW1hZ2UgaXMgc21hbGxlciB0aGFuIGNhbnZhcywgZHJhdyBhZ2FpbiB0byBmaWxsIHBvdGVudGlhbGx5IGVtcHR5IHNwYWNlXHJcbiAgICAgICAgaWYgKHRoaXMud2lkdGggPCBjdHguY2FudmFzLndpZHRoKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54ICsgdGhpcy53aWR0aCAqIDIsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gR3JvdW5kIENsYXNzXHJcbmNsYXNzIEdyb3VuZCB7XHJcbiAgICB4OiBudW1iZXIgPSAwO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBzcGVlZDogbnVtYmVyOyAvLyBTYW1lIGFzIGdhbWUgc3BlZWRcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGNvbmZpZzogR3JvdW5kQ29uZmlnLCBwcml2YXRlIGFzc2V0TG9hZGVyOiBBc3NldExvYWRlciwgY2FudmFzV2lkdGg6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy55ID0gY29uZmlnLnk7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmltYWdlLndpZHRoO1xyXG4gICAgICAgIGlmICh0aGlzLndpZHRoID09PSAwKSB7IC8vIEZhbGxiYWNrIGZvciB1bmxvYWRlZCBpbWFnZVxyXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gY2FudmFzV2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc3BlZWQgPSAwO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNwZWVkID0gZ2FtZVNwZWVkO1xyXG4gICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggPD0gLXRoaXMud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLnggKyB0aGlzLndpZHRoLCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRDb2xsaXNpb25SZWN0KCk6IFJlY3Qge1xyXG4gICAgICAgIHJldHVybiB7IHg6IHRoaXMueCwgeTogdGhpcy55LCB3aWR0aDogdGhpcy53aWR0aCAqIDIsIGhlaWdodDogdGhpcy5oZWlnaHQgfTsgLy8gR3JvdW5kIGlzIGVmZmVjdGl2ZWx5IGVuZGxlc3NcclxuICAgIH1cclxufVxyXG5cclxuLy8gT2JzdGFjbGUgQ2xhc3NcclxuY2xhc3MgT2JzdGFjbGUge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBhY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGNvbGxpZGVkOiBib29sZWFuID0gZmFsc2U7IC8vIFRvIHByZXZlbnQgbXVsdGlwbGUgY29sbGlzaW9uIGNoZWNrc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY29uZmlnOiBPYnN0YWNsZUNvbmZpZywgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXIsIGdyb3VuZFk6IG51bWJlciwgaW5pdGlhbFg6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IGNvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgdGhpcy54ID0gaW5pdGlhbFg7XHJcbiAgICAgICAgdGhpcy55ID0gZ3JvdW5kWSAtIGNvbmZpZy55T2Zmc2V0IC0gdGhpcy5oZWlnaHQ7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lU3BlZWQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCAtPSBnYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRoaXMueCArIHRoaXMud2lkdGggPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmUpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBnZXRDb2xsaXNpb25SZWN0KCk6IFJlY3Qge1xyXG4gICAgICAgIHJldHVybiB7IHg6IHRoaXMueCwgeTogdGhpcy55LCB3aWR0aDogdGhpcy53aWR0aCwgaGVpZ2h0OiB0aGlzLmhlaWdodCB9O1xyXG4gICAgfVxyXG5cclxuICAgIHJlc2V0KG5ld1g6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCA9IG5ld1g7XHJcbiAgICAgICAgdGhpcy5hY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuY29sbGlkZWQgPSBmYWxzZTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gQ29sbGVjdGlibGUgQ2xhc3NcclxuY2xhc3MgQ29sbGVjdGlibGUge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBhY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGNvbGxlY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY29uZmlnOiBDb2xsZWN0aWJsZUNvbmZpZywgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXIsIGluaXRpYWxYOiBudW1iZXIsIGluaXRpYWxZOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5hc3NldExvYWRlci5nZXRJbWFnZShjb25maWcuaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMud2lkdGggPSBjb25maWcud2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMueCA9IGluaXRpYWxYO1xyXG4gICAgICAgIHRoaXMueSA9IGluaXRpYWxZO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IGNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggLT0gZ2FtZVNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggKyB0aGlzLndpZHRoIDwgMCkge1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlICYmICF0aGlzLmNvbGxlY3RlZCkge1xyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldENvbGxpc2lvblJlY3QoKTogUmVjdCB7XHJcbiAgICAgICAgcmV0dXJuIHsgeDogdGhpcy54LCB5OiB0aGlzLnksIHdpZHRoOiB0aGlzLndpZHRoLCBoZWlnaHQ6IHRoaXMuaGVpZ2h0IH07XHJcbiAgICB9XHJcblxyXG4gICAgcmVzZXQobmV3WDogbnVtYmVyLCBuZXdZOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggPSBuZXdYO1xyXG4gICAgICAgIHRoaXMueSA9IG5ld1k7XHJcbiAgICAgICAgdGhpcy5hY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGVkID0gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vLyBNYWluIEdhbWUgQ2xhc3NcclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXI7XHJcbiAgICBwcml2YXRlIHN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIHByaXZhdGUgbGFzdEZyYW1lVGltZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgZ2FtZVNwZWVkOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50U3BlZWQ6IG51bWJlciA9IDA7IC8vIEN1cnJlbnQgYWN0dWFsIHNwZWVkIGZvciBzY3JvbGxpbmdcclxuICAgIHByaXZhdGUgZ2FtZVBhdXNlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUbyBwYXVzZSBnYW1lIGxvZ2ljIG9uIHRpdGxlL2NvbnRyb2xzL2dhbWUgb3ZlclxyXG5cclxuICAgIHByaXZhdGUgcGxheWVyITogUGxheWVyO1xyXG4gICAgcHJpdmF0ZSBwYXJhbGxheExheWVyczogUGFyYWxsYXhMYXllcltdID0gW107XHJcbiAgICBwcml2YXRlIGdyb3VuZCE6IEdyb3VuZDtcclxuICAgIHByaXZhdGUgb2JzdGFjbGVzOiBPYnN0YWNsZVtdID0gW107XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlczogQ29sbGVjdGlibGVbXSA9IFtdO1xyXG5cclxuICAgIHByaXZhdGUgb2JzdGFjbGVTcGF3blRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBuZXh0T2JzdGFjbGVTcGF3blRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlU3Bhd25UaW1lcjogbnVtYmVyID0gMDsgLy8gTkVXOiBUaW1lciBmb3Igc3RhbmRhbG9uZSBjb2xsZWN0aWJsZXNcclxuICAgIHByaXZhdGUgbmV4dENvbGxlY3RpYmxlU3Bhd25UaW1lOiBudW1iZXIgPSAwOyAvLyBORVc6IE5leHQgc3Bhd24gdGltZSBmb3Igc3RhbmRhbG9uZSBjb2xsZWN0aWJsZXNcclxuXHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBoaWdoU2NvcmVzOiB7IHNjb3JlOiBudW1iZXIsIGRhdGU6IHN0cmluZyB9W10gPSBbXTtcclxuICAgIHByaXZhdGUgc2NvcmVEaXNwbGF5OiBudW1iZXIgPSAwOyAvLyBGb3Igc21vb3RoIHNjb3JlIHVwZGF0ZSBhbmltYXRpb25cclxuXHJcbiAgICBwcml2YXRlIGF1ZGlvQ29udGV4dDogQXVkaW9Db250ZXh0O1xyXG4gICAgcHJpdmF0ZSBiZ21Tb3VyY2U6IEF1ZGlvQnVmZmVyU291cmNlTm9kZSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBiZ21CdWZmZXI6IEF1ZGlvQnVmZmVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGJnbUdhaW5Ob2RlOiBHYWluTm9kZTtcclxuXHJcbiAgICBwcml2YXRlIGtleVByZXNzZWQ6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XHJcbiAgICBwcml2YXRlIGlzV2FpdGluZ0ZvcklucHV0OiBib29sZWFuID0gdHJ1ZTsgLy8gRm9yIHRpdGxlIGFuZCBjb250cm9scyBzY3JlZW5cclxuXHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgZWxlbWVudCB3aXRoIElEIFwiJHtjYW52YXNJZH1cIiBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gZ2V0IDJEIHJlbmRlcmluZyBjb250ZXh0LlwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYXNzZXRMb2FkZXIgPSBuZXcgQXNzZXRMb2FkZXIodGhpcy5kcmF3TG9hZGluZ1NjcmVlbi5iaW5kKHRoaXMpKTtcclxuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyAod2luZG93LkF1ZGlvQ29udGV4dCB8fCAod2luZG93IGFzIGFueSkud2Via2l0QXVkaW9Db250ZXh0KSgpO1xyXG4gICAgICAgIHRoaXMuYmdtR2Fpbk5vZGUgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XHJcbiAgICAgICAgdGhpcy5iZ21HYWluTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuXHJcbiAgICAgICAgdGhpcy5sb2FkR2FtZURhdGEoKTtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXJzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNvbmZpZy5jYW52YXMud2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuY29uZmlnLmNhbnZhcy5oZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICAvLyBMb2FkIGFzc2V0cyAoaW1hZ2VzIGFuZCBzb3VuZCBlZmZlY3RzIGFzIEhUTUxBdWRpb0VsZW1lbnRzKVxyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TG9hZGVyLmxvYWQodGhpcy5jb25maWcuYXNzZXRzLmltYWdlcywgdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBEZWNvZGUgQkdNIGZvciBXZWIgQXVkaW8gQVBJIHVzaW5nIGl0cyBwYXRoIGRpcmVjdGx5XHJcbiAgICAgICAgICAgIGNvbnN0IGJnbUFzc2V0Q29uZmlnID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnYmdtJyk7XHJcbiAgICAgICAgICAgIGlmIChiZ21Bc3NldENvbmZpZykge1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBiZ21SZXNwb25zZSA9IGF3YWl0IGZldGNoKGJnbUFzc2V0Q29uZmlnLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgYmdtUmVzcG9uc2UuYXJyYXlCdWZmZXIoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJnbUJ1ZmZlciA9IGF3YWl0IHRoaXMuYXVkaW9Db250ZXh0LmRlY29kZUF1ZGlvRGF0YShhcnJheUJ1ZmZlcik7XHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGRlY29kZSBCR00gZnJvbSAke2JnbUFzc2V0Q29uZmlnLnBhdGh9OmAsIGUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7XHJcbiAgICAgICAgICAgIHRoaXMubG9hZEhpZ2hTY29yZXMoKTtcclxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lTG9vcCgwKTsgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEgb3IgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSOyAvLyBPciBhbiBlcnJvciBzdGF0ZVxyXG4gICAgICAgICAgICB0aGlzLmRyYXdFcnJvclNjcmVlbihcIlx1QUM4Q1x1Qzc4NCBcdUI4NUNcdUI0REMgXHVDMkU0XHVEMzI4ISBcdUNGNThcdUMxOTRcdUM3NDQgXHVENjU1XHVDNzc4XHVENTc0XHVDOEZDXHVDMTM4XHVDNjk0LlwiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVwbGF5LmluaXRpYWxHYW1lU3BlZWQ7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50U3BlZWQgPSB0aGlzLmdhbWVTcGVlZDsgLy8gSW5pdGlhbGl6ZSBjdXJyZW50U3BlZWRcclxuICAgICAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIodGhpcy5jb25maWcucGxheWVyLCB0aGlzLmFzc2V0TG9hZGVyLCB0aGlzLmNvbmZpZy5ncm91bmQueSk7XHJcblxyXG4gICAgICAgIHRoaXMucGFyYWxsYXhMYXllcnMgPSB0aGlzLmNvbmZpZy5wYXJhbGxheC5tYXAobGF5ZXJDb25maWcgPT5cclxuICAgICAgICAgICAgbmV3IFBhcmFsbGF4TGF5ZXIobGF5ZXJDb25maWcsIHRoaXMuYXNzZXRMb2FkZXIsIHRoaXMuY2FudmFzLndpZHRoKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHRoaXMuZ3JvdW5kID0gbmV3IEdyb3VuZCh0aGlzLmNvbmZpZy5ncm91bmQsIHRoaXMuYXNzZXRMb2FkZXIsIHRoaXMuY2FudmFzLndpZHRoKTtcclxuXHJcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBvYmplY3QgcG9vbHMgZm9yIG9ic3RhY2xlcyBhbmQgY29sbGVjdGlibGVzXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHsgLy8gUHJlLWFsbG9jYXRlIHNvbWUgb2JqZWN0c1xyXG4gICAgICAgICAgICBjb25zdCBvYnNDb25maWcgPSB0aGlzLmNvbmZpZy5vYnN0YWNsZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5jb25maWcub2JzdGFjbGVzLmxlbmd0aCldO1xyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlcy5wdXNoKG5ldyBPYnN0YWNsZShvYnNDb25maWcsIHRoaXMuYXNzZXRMb2FkZXIsIHRoaXMuY29uZmlnLmdyb3VuZC55LCB0aGlzLmNhbnZhcy53aWR0aCkpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY29sbENvbmZpZyA9IHRoaXMuY29uZmlnLmNvbGxlY3RpYmxlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5jb2xsZWN0aWJsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVzLnB1c2gobmV3IENvbGxlY3RpYmxlKGNvbGxDb25maWcsIHRoaXMuYXNzZXRMb2FkZXIsIHRoaXMuY2FudmFzLndpZHRoLCAwKSk7IC8vIFkgd2lsbCBiZSBzZXQgb24gcmVzZXRcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5yZXNldFNwYXduVGltZXJzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNldFNwYXduVGltZXJzKCkge1xyXG4gICAgICAgIHRoaXMub2JzdGFjbGVTcGF3blRpbWVyID0gMDtcclxuICAgICAgICB0aGlzLm5leHRPYnN0YWNsZVNwYXduVGltZSA9IHRoaXMuZ2V0UmFuZG9tU3Bhd25UaW1lKHRoaXMuY29uZmlnLmdhbWVwbGF5Lm9ic3RhY2xlU3Bhd25JbnRlcnZhbE1pbiwgdGhpcy5jb25maWcuZ2FtZXBsYXkub2JzdGFjbGVTcGF3bkludGVydmFsTWF4KTtcclxuICAgICAgICAvLyBORVc6IEluaXRpYWxpemUgY29sbGVjdGlibGUgc3Bhd24gdGltZXJcclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5uZXh0Q29sbGVjdGlibGVTcGF3blRpbWUgPSB0aGlzLmdldFJhbmRvbVNwYXduVGltZShcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZXBsYXkuY29sbGVjdGlibGVTcGF3bkludGVydmFsTWluLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWxNYXhcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0UmFuZG9tU3Bhd25UaW1lKG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluKSArIG1pbjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFkZEV2ZW50TGlzdGVuZXJzKCk6IHZvaWQge1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUtleVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDbGljay5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkxPQURJTkcpIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmtleVByZXNzZWRbZXZlbnQuY29kZV0pIHsgLy8gT25seSB0cmlnZ2VyIG9uIGZpcnN0IHByZXNzXHJcbiAgICAgICAgICAgIHRoaXMua2V5UHJlc3NlZFtldmVudC5jb2RlXSA9IHRydWU7XHJcblxyXG4gICAgICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5DT05UUk9MUyB8fCB0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pc1dhaXRpbmdGb3JJbnB1dCkgeyAvLyBFbnN1cmUgb25seSBvbmUgaW5wdXQgdG8gdHJhbnNpdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5DT05UUk9MUztcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkNPTlRST0xTKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc2V0R2FtZSgpOyAvLyBTdGFydCB0aGUgZ2FtZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlCR00oKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IGZhbHNlOyAvLyBSZXNldCB0byBhbGxvdyBpbnB1dCBmb3IgdGl0bGVcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdG9wQkdNKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBDb25zdW1lIGlucHV0LCBkb24ndCBwYXNzIHRvIHBsYXllciBhY3Rpb25zXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiAhdGhpcy5nYW1lUGF1c2VkKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5jb2RlID09PSAnU3BhY2UnKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuanVtcCgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9qdW1wJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQuY29kZSA9PT0gJ0Fycm93RG93bicpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5zbGlkZSgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9zbGlkZScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmtleVByZXNzZWRbZXZlbnQuY29kZV0gPSBmYWxzZTtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5DT05UUk9MUyB8fCB0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNXYWl0aW5nRm9ySW5wdXQgPSB0cnVlOyAvLyBBbGxvdyBuZXcgaW5wdXQgZm9yIG5leHQgdHJhbnNpdGlvblxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUNsaWNrKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgLy8gU2ltaWxhciB0byBrZXlkb3duIGJ1dCBvbmx5IGZvciBnZW5lcmFsIFwic3RhcnRcIlxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgJiYgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLkNPTlRST0xTO1xyXG4gICAgICAgICAgICB0aGlzLmlzV2FpdGluZ0ZvcklucHV0ID0gZmFsc2U7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuQ09OVFJPTFMgJiYgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgICAgIHRoaXMuaXNXYWl0aW5nRm9ySW5wdXQgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5QkdNKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSICYmIHRoaXMuaXNXYWl0aW5nRm9ySW5wdXQpIHtcclxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLnN0b3BCR00oKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcChjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0RnJhbWVUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkxPQURJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbih0aGlzLmFzc2V0TG9hZGVyLnByb2dyZXNzKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuZ2FtZVBhdXNlZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmRyYXcoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyBJbmNyZWFzZSBnYW1lIHNwZWVkIG92ZXIgdGltZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3BlZWQgPSBNYXRoLm1pbih0aGlzLmNvbmZpZy5nYW1lcGxheS5tYXhHYW1lU3BlZWQsIHRoaXMuZ2FtZVNwZWVkICsgdGhpcy5jb25maWcuZ2FtZXBsYXkuc3BlZWRJbmNyZWFzZVJhdGUgKiBkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3BlZWQgPSB0aGlzLmdhbWVTcGVlZDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgcGxheWVyXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5ncm91bmQueSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIHBhcmFsbGF4IGxheWVyc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wYXJhbGxheExheWVycy5mb3JFYWNoKGxheWVyID0+IGxheWVyLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMuY3VycmVudFNwZWVkKSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIGdyb3VuZFxyXG4gICAgICAgICAgICAgICAgdGhpcy5ncm91bmQudXBkYXRlKGRlbHRhVGltZSwgdGhpcy5jdXJyZW50U3BlZWQpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFNwYXduIG9ic3RhY2xlcyBhbmQgdGhlaXIgYXNzb2NpYXRlZCBjb2xsZWN0aWJsZXNcclxuICAgICAgICAgICAgICAgIHRoaXMub2JzdGFjbGVTcGF3blRpbWVyICs9IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA+PSB0aGlzLm5leHRPYnN0YWNsZVNwYXduVGltZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25PYnN0YWNsZUFuZExpbmtlZENvbGxlY3RpYmxlKCk7IC8vIE1vZGlmaWVkIHRvIGhhbmRsZSBsaW5rZWQgY29sbGVjdGlibGVzXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vYnN0YWNsZVNwYXduVGltZXIgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubmV4dE9ic3RhY2xlU3Bhd25UaW1lID0gdGhpcy5nZXRSYW5kb21TcGF3blRpbWUodGhpcy5jb25maWcuZ2FtZXBsYXkub2JzdGFjbGVTcGF3bkludGVydmFsTWluLCB0aGlzLmNvbmZpZy5nYW1lcGxheS5vYnN0YWNsZVNwYXduSW50ZXJ2YWxNYXgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIE5FVzogU3Bhd24gc3RhbmRhbG9uZSBjb2xsZWN0aWJsZXNcclxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyICs9IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA+PSB0aGlzLm5leHRDb2xsZWN0aWJsZVNwYXduVGltZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25TdGFuZGFsb25lQ29sbGVjdGlibGUoKTsgLy8gTmV3IGZ1bmN0aW9uIGZvciBjb2xsZWN0aWJsZXMgd2l0aG91dCBvYnN0YWNsZXNcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXh0Q29sbGVjdGlibGVTcGF3blRpbWUgPSB0aGlzLmdldFJhbmRvbVNwYXduVGltZShcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZXBsYXkuY29sbGVjdGlibGVTcGF3bkludGVydmFsTWluLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduSW50ZXJ2YWxNYXhcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBhbmQgY2hlY2sgY29sbGlzaW9ucyBmb3Igb2JzdGFjbGVzXHJcbiAgICAgICAgICAgICAgICBjb25zdCBwbGF5ZXJSZWN0ID0gdGhpcy5wbGF5ZXIuZ2V0Q29sbGlzaW9uUmVjdCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMuZm9yRWFjaChvYnN0YWNsZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9ic3RhY2xlLmFjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBvYnN0YWNsZS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmN1cnJlbnRTcGVlZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghb2JzdGFjbGUuY29sbGlkZWQgJiYgY2hlY2tDb2xsaXNpb24ocGxheWVyUmVjdCwgb2JzdGFjbGUuZ2V0Q29sbGlzaW9uUmVjdCgpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmhpdCh0aGlzLmNvbmZpZy5nYW1lcGxheS5vYnN0YWNsZURhbWFnZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2hpdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9ic3RhY2xlLmNvbGxpZGVkID0gdHJ1ZTsgLy8gTWFyayBhcyBjb2xsaWRlZFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5saXZlcyA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgYW5kIGNoZWNrIGNvbGxpc2lvbnMgZm9yIGNvbGxlY3RpYmxlc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMuZm9yRWFjaChjb2xsZWN0aWJsZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbGxlY3RpYmxlLmFjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xsZWN0aWJsZS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmN1cnJlbnRTcGVlZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghY29sbGVjdGlibGUuY29sbGVjdGVkICYmIGNoZWNrQ29sbGlzaW9uKHBsYXllclJlY3QsIGNvbGxlY3RpYmxlLmdldENvbGxpc2lvblJlY3QoKSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gY29sbGVjdGlibGUuc2NvcmVWYWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbGxlY3RpYmxlLmNvbGxlY3RlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2NvbGxlY3QnKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBzY29yZSBiYXNlZCBvbiBkaXN0YW5jZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSB0aGlzLmNvbmZpZy5nYW1lcGxheS5zY29yZVBlclNlY29uZCAqIGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NvcmVEaXNwbGF5ID0gTWF0aC5taW4odGhpcy5zY29yZSwgdGhpcy5zY29yZURpc3BsYXkgKyAodGhpcy5zY29yZSAtIHRoaXMuc2NvcmVEaXNwbGF5KSAqIGRlbHRhVGltZSAqIDUpOyAvLyBTbW9vdGggdXBkYXRlXHJcblxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgcGFyYWxsYXggbGF5ZXJzXHJcbiAgICAgICAgdGhpcy5wYXJhbGxheExheWVycy5mb3JFYWNoKGxheWVyID0+IGxheWVyLmRyYXcodGhpcy5jdHgpKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBncm91bmRcclxuICAgICAgICB0aGlzLmdyb3VuZC5kcmF3KHRoaXMuY3R4KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBvYnN0YWNsZXNcclxuICAgICAgICB0aGlzLm9ic3RhY2xlcy5mb3JFYWNoKG9ic3RhY2xlID0+IG9ic3RhY2xlLmRyYXcodGhpcy5jdHgpKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBjb2xsZWN0aWJsZXNcclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5mb3JFYWNoKGNvbGxlY3RpYmxlID0+IGNvbGxlY3RpYmxlLmRyYXcodGhpcy5jdHgpKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBwbGF5ZXJcclxuICAgICAgICB0aGlzLnBsYXllci5kcmF3KHRoaXMuY3R4KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBVSVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gdGhpcy5jb25maWcudWkuZm9udDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1QzgxMFx1QzIxODogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmVEaXNwbGF5KX1gLCAyMCwgNDApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBcdUNDQjRcdUI4MjU6ICR7dGhpcy5wbGF5ZXIubGl2ZXN9YCwgMjAsIDgwKTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKHRoaXMuYXNzZXRMb2FkZXIucHJvZ3Jlc3MpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Q2VudGVyZWRUZXh0KHRoaXMuY29uZmlnLnVpLnRpdGxlTWVzc2FnZSwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0NlbnRlcmVkVGV4dCh0aGlzLmNvbmZpZy51aS5zdGFydE1lc3NhZ2UsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCwgMjQpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkNPTlRST0xTOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Q2VudGVyZWRUZXh0KHRoaXMuY29uZmlnLnVpLmNvbnRyb2xzTWVzc2FnZSwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0NlbnRlcmVkVGV4dCh0aGlzLmNvbmZpZy51aS5zdGFydE1lc3NhZ2UsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCwgMjQpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0NlbnRlcmVkVGV4dCh0aGlzLmNvbmZpZy51aS5nYW1lT3Zlck1lc3NhZ2UsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdDZW50ZXJlZFRleHQoYFx1Q0Q1Q1x1Qzg4NSBcdUM4MTBcdUMyMTg6ICR7TWF0aC5mbG9vcih0aGlzLnNjb3JlKX1gLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMjApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3SGlnaFNjb3JlcygpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Q2VudGVyZWRUZXh0KHRoaXMuY29uZmlnLnVpLnJlc3RhcnRNZXNzYWdlLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTAwLCAyNCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TG9hZGluZ1NjcmVlbihwcm9ncmVzczogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzMwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdcdUI4NUNcdUI1MjkgXHVDOTExLi4uJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMzApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDEwMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgMjAwICogcHJvZ3Jlc3MsIDIwKTtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdCh0aGlzLmNhbnZhcy53aWR0aCAvIDIgLSAxMDAsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsIDIwMCwgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0NlbnRlcmVkVGV4dCh0ZXh0OiBzdHJpbmcsIHk6IG51bWJlciwgZm9udFNpemU6IG51bWJlciA9IDM2KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWkudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHtmb250U2l6ZX1weCAke3RoaXMuY29uZmlnLnVpLmZvbnQuc3BsaXQoJyAnKVsxXSB8fCAnQXJpYWwnfWA7IC8vIEV4dHJhY3QgZm9udCBmYW1pbHlcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlbmFtZWQgYW5kIG1vZGlmaWVkIGV4aXN0aW5nIHNwYXduT2JzdGFjbGUgdG8gb25seSBzcGF3biBvYnN0YWNsZSBhbmQgbGlua2VkIGNvbGxlY3RpYmxlXHJcbiAgICBwcml2YXRlIHNwYXduT2JzdGFjbGVBbmRMaW5rZWRDb2xsZWN0aWJsZSgpOiB2b2lkIHtcclxuICAgICAgICBsZXQgb2JzdGFjbGUgPSB0aGlzLm9ic3RhY2xlcy5maW5kKG8gPT4gIW8uYWN0aXZlKTtcclxuICAgICAgICBpZiAoIW9ic3RhY2xlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG9ic0NvbmZpZyA9IHRoaXMuY29uZmlnLm9ic3RhY2xlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5vYnN0YWNsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgIG9ic3RhY2xlID0gbmV3IE9ic3RhY2xlKG9ic0NvbmZpZywgdGhpcy5hc3NldExvYWRlciwgdGhpcy5jb25maWcuZ3JvdW5kLnksIHRoaXMuY2FudmFzLndpZHRoKTtcclxuICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMucHVzaChvYnN0YWNsZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByYW5kb21Db25maWcgPSB0aGlzLmNvbmZpZy5vYnN0YWNsZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5jb25maWcub2JzdGFjbGVzLmxlbmd0aCldO1xyXG4gICAgICAgIGNvbnN0IHNwYXduWCA9IHRoaXMuY2FudmFzLndpZHRoICsgTWF0aC5yYW5kb20oKSAqIDEwMDsgLy8gU3Bhd24gc2xpZ2h0bHkgb2ZmLXNjcmVlbiB0byB0aGUgcmlnaHRcclxuICAgICAgICBvYnN0YWNsZS5yZXNldChzcGF3blgpO1xyXG4gICAgICAgIG9ic3RhY2xlLndpZHRoID0gcmFuZG9tQ29uZmlnLndpZHRoO1xyXG4gICAgICAgIG9ic3RhY2xlLmhlaWdodCA9IHJhbmRvbUNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgb2JzdGFjbGUuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKHJhbmRvbUNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgb2JzdGFjbGUueSA9IHRoaXMuY29uZmlnLmdyb3VuZC55IC0gcmFuZG9tQ29uZmlnLnlPZmZzZXQgLSBvYnN0YWNsZS5oZWlnaHQ7XHJcbiAgICAgICAgb2JzdGFjbGUuYWN0aXZlID0gdHJ1ZTtcclxuICAgICAgICBvYnN0YWNsZS5jb2xsaWRlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBQb3RlbnRpYWxseSBzcGF3biBhIGNvbGxlY3RpYmxlICp3aXRoKiB0aGlzIG9ic3RhY2xlLCBhdCBhIGp1bXBhYmxlIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKE1hdGgucmFuZG9tKCkgPCB0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduQ2hhbmNlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25Db2xsZWN0aWJsZShvYnN0YWNsZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIE5FVzogRnVuY3Rpb24gdG8gc3Bhd24gY29sbGVjdGlibGVzIGluZGVwZW5kZW50bHkgb2Ygb2JzdGFjbGVzXHJcbiAgICBwcml2YXRlIHNwYXduU3RhbmRhbG9uZUNvbGxlY3RpYmxlKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHNwYXduWCA9IHRoaXMuY2FudmFzLndpZHRoICsgTWF0aC5yYW5kb20oKSAqIDE1MDsgLy8gU3Bhd24gZnVydGhlciBhaGVhZCBmb3Igc3RhbmRhbG9uZVxyXG4gICAgICAgIHRoaXMuc3Bhd25Db2xsZWN0aWJsZSh1bmRlZmluZWQsIHNwYXduWCk7IC8vIENhbGwgd2l0aCBubyBhc3NvY2lhdGVkIG9ic3RhY2xlXHJcbiAgICB9XHJcblxyXG4gICAgLy8gTW9kaWZpZWQgdG8gYWNjZXB0IG9wdGlvbmFsIGFzc29jaWF0ZWRPYnN0YWNsZSBmb3IgcG9zaXRpb25pbmcgbG9naWNcclxuICAgIHByaXZhdGUgc3Bhd25Db2xsZWN0aWJsZShhc3NvY2lhdGVkT2JzdGFjbGU/OiBPYnN0YWNsZSwgY3VzdG9tWD86IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGxldCBjb2xsZWN0aWJsZSA9IHRoaXMuY29sbGVjdGlibGVzLmZpbmQoYyA9PiAhYy5hY3RpdmUpO1xyXG4gICAgICAgIGlmICghY29sbGVjdGlibGUpIHtcclxuICAgICAgICAgICAgY29uc3QgY29sbENvbmZpZyA9IHRoaXMuY29uZmlnLmNvbGxlY3RpYmxlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5jb2xsZWN0aWJsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlID0gbmV3IENvbGxlY3RpYmxlKGNvbGxDb25maWcsIHRoaXMuYXNzZXRMb2FkZXIsIDAsIDApO1xyXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5wdXNoKGNvbGxlY3RpYmxlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHJhbmRvbUNvbmZpZyA9IHRoaXMuY29uZmlnLmNvbGxlY3RpYmxlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5jb2xsZWN0aWJsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgY29sbGVjdGlibGUuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKHJhbmRvbUNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgY29sbGVjdGlibGUuc2NvcmVWYWx1ZSA9IHJhbmRvbUNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgICAgIGNvbGxlY3RpYmxlLndpZHRoID0gcmFuZG9tQ29uZmlnLndpZHRoO1xyXG4gICAgICAgIGNvbGxlY3RpYmxlLmhlaWdodCA9IHJhbmRvbUNvbmZpZy5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGxldCBjb2xsZWN0aWJsZVk6IG51bWJlcjtcclxuICAgICAgICBsZXQgY29sbGVjdGlibGVYOiBudW1iZXI7XHJcblxyXG4gICAgICAgIC8vIFBsYXllcidzIFkgY29vcmRpbmF0ZSBmb3IgdGhlIHRvcCBvZiB0aGVpciBzcHJpdGUgd2hlbiBvbiB0aGUgZ3JvdW5kXHJcbiAgICAgICAgY29uc3QgcGxheWVyR3JvdW5kVG9wWSA9IHRoaXMucGxheWVyLmJhc2VZO1xyXG4gICAgICAgIC8vIFBsYXllcidzIFkgY29vcmRpbmF0ZSBmb3IgdGhlIHRvcCBvZiB0aGVpciBzcHJpdGUgYXQgdGhlIHBlYWsgb2YgYSBzaW5nbGUganVtcFxyXG4gICAgICAgIGNvbnN0IHBsYXllclNpbmdsZUp1bXBBcGV4VG9wWSA9IHBsYXllckdyb3VuZFRvcFkgLSB0aGlzLmNvbmZpZy5wbGF5ZXIuanVtcEhlaWdodDtcclxuICAgICAgICAvLyBQbGF5ZXIncyBZIGNvb3JkaW5hdGUgZm9yIHRoZSBib3R0b20gb2YgdGhlaXIgc3ByaXRlIGF0IHRoZSBwZWFrIG9mIGEgc2luZ2xlIGp1bXBcclxuICAgICAgICBjb25zdCBwbGF5ZXJTaW5nbGVKdW1wQXBleEJvdHRvbVkgPSBwbGF5ZXJTaW5nbGVKdW1wQXBleFRvcFkgKyB0aGlzLnBsYXllci5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGlmIChhc3NvY2lhdGVkT2JzdGFjbGUpIHtcclxuICAgICAgICAgICAgLy8gQ29sbGVjdGlibGUgYXNzb2NpYXRlZCB3aXRoIGFuIG9ic3RhY2xlXHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlWCA9IGFzc29jaWF0ZWRPYnN0YWNsZS54ICsgYXNzb2NpYXRlZE9ic3RhY2xlLndpZHRoIC8gMiAtIGNvbGxlY3RpYmxlLndpZHRoIC8gMjtcclxuICAgICAgICAgICAgY29uc3Qgb2JzdGFjbGVUb3BZID0gYXNzb2NpYXRlZE9ic3RhY2xlLnk7XHJcblxyXG4gICAgICAgICAgICAvLyBUYXJnZXQgY29sbGVjdGlibGVZICh0b3Agb2YgY29sbGVjdGlibGUpXHJcbiAgICAgICAgICAgIGxldCB0YXJnZXRZOiBudW1iZXI7XHJcblxyXG4gICAgICAgICAgICAvLyAxLiBNaW5pbXVtIFkgKGhpZ2hlc3QgcG9zaXRpb24pIHRoZSBjb2xsZWN0aWJsZSBzaG91bGQgYmUgdG8gZW5zdXJlIHJlYWNoYWJpbGl0eS5cclxuICAgICAgICAgICAgLy8gV2Ugd2FudCB0aGUgY29sbGVjdGlibGUncyB0b3AgdG8gYmUgc2xpZ2h0bHkgYmVsb3cgdGhlIHBsYXllcidzIGhlYWQgYXQganVtcCBhcGV4IGZvciBjb21mb3J0YWJsZSBjb2xsZWN0aW9uLlxyXG4gICAgICAgICAgICBjb25zdCBpZGVhbENvbGxlY3RpYmxlVG9wWV9yZWFjaGFibGUgPSBwbGF5ZXJTaW5nbGVKdW1wQXBleFRvcFkgKyAodGhpcy5wbGF5ZXIuaGVpZ2h0ICogMC4yKTsgLy8gMjAlIGRvd24gZnJvbSBwbGF5ZXIncyBoZWFkIGF0IGFwZXhcclxuXHJcbiAgICAgICAgICAgIC8vIDIuIE1heGltdW0gWSAobG93ZXN0IHBvc2l0aW9uKSB0aGUgY29sbGVjdGlibGUgc2hvdWxkIGJlIHdoaWxlIGNsZWFyaW5nIHRoZSBvYnN0YWNsZS5cclxuICAgICAgICAgICAgLy8gSXQgc2hvdWxkIGJlIGF0IGxlYXN0IDEwcHggYWJvdmUgdGhlIG9ic3RhY2xlJ3MgdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBtYXhDb2xsZWN0aWJsZVRvcFlfY2xlYXJhbmNlID0gb2JzdGFjbGVUb3BZIC0gY29sbGVjdGlibGUuaGVpZ2h0IC0gMTA7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBDaG9vc2UgdGhlIFkgcG9zaXRpb24uIFdlIHN0YXJ0IHdpdGggdGhlIGlkZWFsIHJlYWNoYWJsZSBZLlxyXG4gICAgICAgICAgICB0YXJnZXRZID0gaWRlYWxDb2xsZWN0aWJsZVRvcFlfcmVhY2hhYmxlO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgcGxhY2luZyBpdCBhdCBgaWRlYWxDb2xsZWN0aWJsZVRvcFlfcmVhY2hhYmxlYCBjYXVzZXMgaXQgdG8gb3ZlcmxhcCBvciBiZSB0b28gY2xvc2UgdG8gdGhlIG9ic3RhY2xlLFxyXG4gICAgICAgICAgICAvLyB3ZSBtdXN0IHJhaXNlIGl0IChtYWtlIFkgdmFsdWUgc21hbGxlcikgdG8gY2xlYXIgdGhlIG9ic3RhY2xlLlxyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBjb2xsZWN0aWJsZSBib3R0b20gKHRhcmdldFkgKyBjb2xsZWN0aWJsZS5oZWlnaHQpIGlzIGJlbG93IG9ic3RhY2xlIHRvcCAob2JzdGFjbGVUb3BZKSB3aXRoIGEgYnVmZmVyLlxyXG4gICAgICAgICAgICBpZiAodGFyZ2V0WSArIGNvbGxlY3RpYmxlLmhlaWdodCArIDUgPiBvYnN0YWNsZVRvcFkpIHsgLy8gNXB4IGJ1ZmZlciBmb3IgY29sbGlzaW9uXHJcbiAgICAgICAgICAgICAgICB0YXJnZXRZID0gbWF4Q29sbGVjdGlibGVUb3BZX2NsZWFyYW5jZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29sbGVjdGlibGVZID0gdGFyZ2V0WTtcclxuICAgICAgICAgICAgY29sbGVjdGlibGVZICs9IChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDIwOyAvLyBBZGQgc2xpZ2h0IHJhbmRvbW5lc3MgKy8tIDEwcHhcclxuXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gU3RhbmRhbG9uZSBjb2xsZWN0aWJsZVxyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZVggPSBjdXN0b21YICE9PSB1bmRlZmluZWQgPyBjdXN0b21YIDogdGhpcy5jYW52YXMud2lkdGggKyBNYXRoLnJhbmRvbSgpICogMTAwO1xyXG5cclxuICAgICAgICAgICAgLy8gVXNlIGdhbWVwbGF5IGNvbmZpZydzIG9mZnNldHMgZm9yIHN0YW5kYWxvbmUgY29sbGVjdGlibGVzLCByZWxhdGl2ZSB0byBncm91bmRcclxuICAgICAgICAgICAgbGV0IHRlbXBZID0gdGhpcy5jb25maWcuZ3JvdW5kLnkgLSAodGhpcy5jb25maWcuZ2FtZXBsYXkuY29sbGVjdGlibGVTcGF3bk9mZnNldE1pbiArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBNYXRoLnJhbmRvbSgpICogKHRoaXMuY29uZmlnLmdhbWVwbGF5LmNvbGxlY3RpYmxlU3Bhd25PZmZzZXRNYXggLSB0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduT2Zmc2V0TWluKSk7XHJcblxyXG4gICAgICAgICAgICAvLyBFbnN1cmUgaXQncyBub3QgdG9vIGhpZ2ggKHVucmVhY2hhYmxlIGJ5IHNpbmdsZSBqdW1wKVxyXG4gICAgICAgICAgICAvLyBUaGUgY29sbGVjdGlibGUncyB0b3Agc2hvdWxkIG5vdCBiZSBoaWdoZXIgKHNtYWxsZXIgWSB2YWx1ZSkgdGhhbiBwbGF5ZXIncyB0b3AgYXQgcGVhayBqdW1wICsgYSBzbWFsbCBidWZmZXIuXHJcbiAgICAgICAgICAgIGNvbnN0IG1heEFsbG93ZWRDb2xsZWN0aWJsZVRvcFkgPSBwbGF5ZXJTaW5nbGVKdW1wQXBleFRvcFkgKyAodGhpcy5wbGF5ZXIuaGVpZ2h0ICogMC4yKTtcclxuICAgICAgICAgICAgdGVtcFkgPSBNYXRoLm1heCh0ZW1wWSwgbWF4QWxsb3dlZENvbGxlY3RpYmxlVG9wWSk7IC8vIEVuc3VyZXMgY29sbGVjdGlibGVZIGlzIG5vdCBzbWFsbGVyIChoaWdoZXIpIHRoYW4gdGhpcy5cclxuXHJcbiAgICAgICAgICAgIC8vIEVuc3VyZSBpdCdzIG5vdCB0b28gbG93IChvbiB0aGUgZ3JvdW5kKVxyXG4gICAgICAgICAgICAvLyBUaGUgY29sbGVjdGlibGUncyBib3R0b20gc2hvdWxkIGJlIGF0IGxlYXN0IDEwcHggb2ZmIHRoZSBncm91bmQuXHJcbiAgICAgICAgICAgIGNvbnN0IG1pbkFsbG93ZWRDb2xsZWN0aWJsZVRvcFkgPSB0aGlzLmNvbmZpZy5ncm91bmQueSAtIGNvbGxlY3RpYmxlLmhlaWdodCAtIDEwO1xyXG4gICAgICAgICAgICB0ZW1wWSA9IE1hdGgubWluKHRlbXBZLCBtaW5BbGxvd2VkQ29sbGVjdGlibGVUb3BZKTsgLy8gRW5zdXJlcyBjb2xsZWN0aWJsZVkgaXMgbm90IGxhcmdlciAobG93ZXIpIHRoYW4gdGhpcy5cclxuXHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlWSA9IHRlbXBZO1xyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZVkgKz0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMjA7IC8vIEFkZCBzbGlnaHQgcmFuZG9tbmVzcyArLy0gMTBweFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRmluYWwgc2FmZXR5IGNsYW1wc1xyXG4gICAgICAgIGNvbGxlY3RpYmxlWSA9IE1hdGgubWF4KGNvbGxlY3RpYmxlWSwgMCk7IC8vIENhbm5vdCBnbyBhYm92ZSBjYW52YXMgdG9wIChZPTApXHJcbiAgICAgICAgY29sbGVjdGlibGVZID0gTWF0aC5taW4oY29sbGVjdGlibGVZLCB0aGlzLmNvbmZpZy5ncm91bmQueSAtIGNvbGxlY3RpYmxlLmhlaWdodCAtIDUpOyAvLyBDYW5ub3QgZ28gYmVsb3cgNXB4IG9mZiBncm91bmRcclxuXHJcbiAgICAgICAgY29sbGVjdGlibGUucmVzZXQoY29sbGVjdGlibGVYLCBjb2xsZWN0aWJsZVkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgdGhpcy5zdG9wQkdNKCk7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9nYW1lX292ZXInKTtcclxuICAgICAgICB0aGlzLnNhdmVIaWdoU2NvcmUoTWF0aC5mbG9vcih0aGlzLnNjb3JlKSk7XHJcbiAgICAgICAgdGhpcy5nYW1lUGF1c2VkID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmlzV2FpdGluZ0ZvcklucHV0ID0gdHJ1ZTsgLy8gQWxsb3cgaW5wdXQgdG8gcmVzdGFydC9nbyB0byB0aXRsZVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzZXRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMucGxheWVyLnJlc2V0KCk7XHJcbiAgICAgICAgdGhpcy5nYW1lU3BlZWQgPSB0aGlzLmNvbmZpZy5nYW1lcGxheS5pbml0aWFsR2FtZVNwZWVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNwZWVkID0gdGhpcy5nYW1lU3BlZWQ7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5zY29yZURpc3BsYXkgPSAwO1xyXG5cclxuICAgICAgICAvLyBEZWFjdGl2YXRlIGFsbCBvYnN0YWNsZXMgYW5kIGNvbGxlY3RpYmxlc1xyXG4gICAgICAgIHRoaXMub2JzdGFjbGVzLmZvckVhY2gobyA9PiBvLmFjdGl2ZSA9IGZhbHNlKTtcclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5mb3JFYWNoKGMgPT4gYy5hY3RpdmUgPSBmYWxzZSk7XHJcblxyXG4gICAgICAgIHRoaXMucmVzZXRTcGF3blRpbWVycygpO1xyXG4gICAgICAgIHRoaXMuZ2FtZVBhdXNlZCA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuaXNXYWl0aW5nRm9ySW5wdXQgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLnBsYXlCR00oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5hc3NldExvYWRlci5nZXRTb3VuZChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgY29uc3Qgc291bmRJbnN0YW5jZSA9IGF1ZGlvLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICBzb3VuZEluc3RhbmNlLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBzb3VuZEluc3RhbmNlLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTtcclxuICAgICAgICAgICAgc291bmRJbnN0YW5jZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEF1ZGlvIHBsYXliYWNrIGZhaWxlZCBmb3IgJHtuYW1lfTogJHtlfWApKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5QkdNKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUJ1ZmZlciAmJiB0aGlzLmF1ZGlvQ29udGV4dC5zdGF0ZSA9PT0gJ3N1c3BlbmRlZCcpIHtcclxuICAgICAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCkudGhlbigoKSA9PiB0aGlzLl9zdGFydEJHTSgpKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuYmdtQnVmZmVyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX3N0YXJ0QkdNKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgX3N0YXJ0QkdNKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmJnbVNvdXJjZSkge1xyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdXJjZS5zdG9wKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291cmNlLmRpc2Nvbm5lY3QoKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VyY2UgPSBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5iZ21Tb3VyY2UgPSB0aGlzLmF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgICAgICB0aGlzLmJnbVNvdXJjZS5idWZmZXIgPSB0aGlzLmJnbUJ1ZmZlcjtcclxuICAgICAgICB0aGlzLmJnbVNvdXJjZS5sb29wID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmJnbVNvdXJjZS5jb25uZWN0KHRoaXMuYmdtR2Fpbk5vZGUpO1xyXG4gICAgICAgIHRoaXMuYmdtU291cmNlLnN0YXJ0KDApO1xyXG4gICAgICAgIHRoaXMuYmdtR2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpPy52b2x1bWUgfHwgMC41O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RvcEJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21Tb3VyY2UpIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VyY2Uuc3RvcCgpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdXJjZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291cmNlID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkSGlnaFNjb3JlcygpOiB2b2lkIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBzdG9yZWRTY29yZXMgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY29va2llUnVubmVySGlnaFNjb3JlcycpO1xyXG4gICAgICAgICAgICB0aGlzLmhpZ2hTY29yZXMgPSBzdG9yZWRTY29yZXMgPyBKU09OLnBhcnNlKHN0b3JlZFNjb3JlcykgOiBbXTtcclxuICAgICAgICAgICAgdGhpcy5oaWdoU2NvcmVzLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKTsgLy8gU29ydCBkZXNjZW5kaW5nXHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgaGlnaCBzY29yZXM6XCIsIGUpO1xyXG4gICAgICAgICAgICB0aGlzLmhpZ2hTY29yZXMgPSBbXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzYXZlSGlnaFNjb3JlKG5ld1Njb3JlOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG4gICAgICAgIGNvbnN0IHNjb3JlRW50cnkgPSB7XHJcbiAgICAgICAgICAgIHNjb3JlOiBuZXdTY29yZSxcclxuICAgICAgICAgICAgZGF0ZTogYCR7bm93LmdldEZ1bGxZZWFyKCl9LSR7KG5vdy5nZXRNb250aCgpICsgMSkudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfS0ke25vdy5nZXREYXRlKCkudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfWBcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICB0aGlzLmhpZ2hTY29yZXMucHVzaChzY29yZUVudHJ5KTtcclxuICAgICAgICB0aGlzLmhpZ2hTY29yZXMuc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpO1xyXG4gICAgICAgIHRoaXMuaGlnaFNjb3JlcyA9IHRoaXMuaGlnaFNjb3Jlcy5zbGljZSgwLCA1KTsgLy8gS2VlcCB0b3AgNSBzY29yZXNcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2Nvb2tpZVJ1bm5lckhpZ2hTY29yZXMnLCBKU09OLnN0cmluZ2lmeSh0aGlzLmhpZ2hTY29yZXMpKTtcclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gc2F2ZSBoaWdoIHNjb3JlczpcIiwgZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0hpZ2hTY29yZXMoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWkudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMjRweCAke3RoaXMuY29uZmlnLnVpLmZvbnQuc3BsaXQoJyAnKVsxXSB8fCAnQXJpYWwnfWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1x1Q0Q1Q1x1QUNFMCBcdUM4MTBcdUMyMTgnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAzMCk7XHJcblxyXG4gICAgICAgIHRoaXMuaGlnaFNjb3Jlcy5mb3JFYWNoKChlbnRyeSwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7aW5kZXggKyAxfS4gJHtlbnRyeS5zY29yZX0gKCR7ZW50cnkuZGF0ZX0pYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNjAgKyBpbmRleCAqIDMwKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdFcnJvclNjcmVlbihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzMwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdcdUM2MjRcdUI5NTggXHVCQzFDXHVDMEREIScsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChtZXNzYWdlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBFbnN1cmUgdGhlIGdhbWUgc3RhcnRzIHdoZW4gdGhlIERPTSBpcyByZWFkeVxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaW5pdGlhbGl6ZSBnYW1lOlwiLCBlKTtcclxuICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIGVycm9yRGl2LnN0eWxlLmNvbG9yID0gJ3JlZCc7XHJcbiAgICAgICAgZXJyb3JEaXYuc3R5bGUudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgZXJyb3JEaXYuc3R5bGUubWFyZ2luVG9wID0gJzUwcHgnO1xyXG4gICAgICAgIGVycm9yRGl2LmlubmVyVGV4dCA9IGBcdUFDOENcdUM3ODQgXHVDRDA4XHVBRTMwXHVENjU0IFx1QzkxMSBcdUM2MjRcdUI5NTggXHVCQzFDXHVDMEREOiAke2UubWVzc2FnZX0uIFx1Q0Y1OFx1QzE5NFx1Qzc0NCBcdUQ2NTVcdUM3NzhcdUQ1NzRcdUM4RkNcdUMxMzhcdUM2OTQuYDtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgIH1cclxufSk7XHJcbiJd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
