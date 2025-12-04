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
          this.spawnObstacle();
          this.obstacleSpawnTimer = 0;
          this.nextObstacleSpawnTime = this.getRandomSpawnTime(this.config.gameplay.obstacleSpawnIntervalMin, this.config.gameplay.obstacleSpawnIntervalMax);
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
  spawnObstacle() {
    let obstacle = this.obstacles.find((o) => !o.active);
    if (!obstacle) {
      const obsConfig = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];
      obstacle = new Obstacle(obsConfig, this.assetLoader, this.config.ground.y, this.canvas.width + Math.random() * 50);
      this.obstacles.push(obstacle);
    }
    const randomConfig = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];
    obstacle.reset(this.canvas.width + Math.random() * 100);
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
  spawnCollectible(associatedObstacle) {
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
    const collectibleY = this.config.ground.y - (this.config.gameplay.collectibleSpawnOffsetMin + Math.random() * (this.config.gameplay.collectibleSpawnOffsetMax - this.config.gameplay.collectibleSpawnOffsetMin));
    const collectibleX = associatedObstacle.x + associatedObstacle.width / 2 - collectible.width / 2;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9O1xyXG4gICAgcGxheWVyOiBQbGF5ZXJDb25maWc7XHJcbiAgICBnYW1lcGxheTogR2FtZXBsYXlDb25maWc7XHJcbiAgICBwYXJhbGxheDogUGFyYWxsYXhMYXllckNvbmZpZ1tdO1xyXG4gICAgZ3JvdW5kOiBHcm91bmRDb25maWc7XHJcbiAgICBvYnN0YWNsZXM6IE9ic3RhY2xlQ29uZmlnW107XHJcbiAgICBjb2xsZWN0aWJsZXM6IENvbGxlY3RpYmxlQ29uZmlnW107XHJcbiAgICB1aTogVUlDb25maWc7XHJcbiAgICBhc3NldHM6IHsgaW1hZ2VzOiBJbWFnZUFzc2V0W107IHNvdW5kczogU291bmRBc3NldFtdOyB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUGxheWVyQ29uZmlnIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjsgLy8gSW5pdGlhbCBZIHBvc2l0aW9uIChncm91bmRlZClcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGp1bXBIZWlnaHQ6IG51bWJlcjtcclxuICAgIHNsaWRlSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBncmF2aXR5OiBudW1iZXI7XHJcbiAgICBqdW1wRm9yY2U6IG51bWJlcjtcclxuICAgIHNsaWRlRHVyYXRpb246IG51bWJlcjtcclxuICAgIGFuaW1hdGlvblNwZWVkOiBudW1iZXI7IC8vIFRpbWUgcGVyIGZyYW1lIGluIHNlY29uZHNcclxuICAgIHJ1bm5pbmdGcmFtZXM6IHN0cmluZ1tdO1xyXG4gICAganVtcGluZ0ZyYW1lOiBzdHJpbmc7XHJcbiAgICBzbGlkaW5nRnJhbWU6IHN0cmluZztcclxuICAgIGludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyOyAvLyBEdXJhdGlvbiBvZiBpbnZpbmNpYmlsaXR5IGFmdGVyIGhpdFxyXG4gICAgYmxpbmtGcmVxdWVuY3k6IG51bWJlcjsgLy8gSG93IG9mdGVuIHBsYXllciBibGlua3MgZHVyaW5nIGludmluY2liaWxpdHlcclxuICAgIGxpdmVzOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lcGxheUNvbmZpZyB7XHJcbiAgICBpbml0aWFsR2FtZVNwZWVkOiBudW1iZXI7XHJcbiAgICBtYXhHYW1lU3BlZWQ6IG51bWJlcjtcclxuICAgIHNwZWVkSW5jcmVhc2VSYXRlOiBudW1iZXI7IC8vIFNwZWVkIGluY3JlYXNlIHBlciBzZWNvbmRcclxuICAgIG9ic3RhY2xlU3Bhd25JbnRlcnZhbE1pbjogbnVtYmVyOyAvLyBNaW4gdGltZSBiZWZvcmUgbmV4dCBvYnN0YWNsZSBzcGF3blxyXG4gICAgb2JzdGFjbGVTcGF3bkludGVydmFsTWF4OiBudW1iZXI7IC8vIE1heCB0aW1lIGJlZm9yZSBuZXh0IG9ic3RhY2xlIHNwYXduXHJcbiAgICBjb2xsZWN0aWJsZVNwYXduQ2hhbmNlOiBudW1iZXI7IC8vIFByb2JhYmlsaXR5IHRvIHNwYXduIGEgY29sbGVjdGlibGUgd2l0aCBhbiBvYnN0YWNsZVxyXG4gICAgY29sbGVjdGlibGVTcGF3bk9mZnNldE1pbjogbnVtYmVyOyAvLyBZIG9mZnNldCBmcm9tIGdyb3VuZCBmb3IgY29sbGVjdGlibGVcclxuICAgIGNvbGxlY3RpYmxlU3Bhd25PZmZzZXRNYXg6IG51bWJlcjsgLy8gWSBvZmZzZXQgZnJvbSBncm91bmQgZm9yIGNvbGxlY3RpYmxlXHJcbiAgICBzY29yZVBlclNlY29uZDogbnVtYmVyO1xyXG4gICAgb2JzdGFjbGVEYW1hZ2U6IG51bWJlcjsgLy8gSG93IG11Y2ggZGFtYWdlIGFuIG9ic3RhY2xlIGRvZXNcclxufVxyXG5cclxuaW50ZXJmYWNlIFBhcmFsbGF4TGF5ZXJDb25maWcge1xyXG4gICAgaW1hZ2U6IHN0cmluZztcclxuICAgIHNwZWVkTXVsdGlwbGllcjogbnVtYmVyO1xyXG4gICAgeU9mZnNldDogbnVtYmVyOyAvLyBZIHBvc2l0aW9uIHJlbGF0aXZlIHRvIGNhbnZhcyB0b3BcclxuICAgIGhlaWdodDogbnVtYmVyOyAvLyBIZWlnaHQgdG8gZHJhdyB0aGUgaW1hZ2VcclxufVxyXG5cclxuaW50ZXJmYWNlIEdyb3VuZENvbmZpZyB7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgeTogbnVtYmVyOyAvLyBZIHBvc2l0aW9uIG9mIHRoZSB0b3Agb2YgdGhlIGdyb3VuZFxyXG4gICAgaGVpZ2h0OiBudW1iZXI7IC8vIEhlaWdodCB0byBkcmF3IHRoZSBncm91bmQgaW1hZ2VcclxufVxyXG5cclxuaW50ZXJmYWNlIE9ic3RhY2xlQ29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB5T2Zmc2V0OiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZyb20gZ3JvdW5kXHJcbn1cclxuXHJcbmludGVyZmFjZSBDb2xsZWN0aWJsZUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBpbWFnZTogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVUlDb25maWcge1xyXG4gICAgZm9udDogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICB0aXRsZU1lc3NhZ2U6IHN0cmluZztcclxuICAgIGNvbnRyb2xzTWVzc2FnZTogc3RyaW5nO1xyXG4gICAgc3RhcnRNZXNzYWdlOiBzdHJpbmc7XHJcbiAgICBnYW1lT3Zlck1lc3NhZ2U6IHN0cmluZztcclxuICAgIHJlc3RhcnRNZXNzYWdlOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBSZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuLy8gVXRpbGl0eSBmdW5jdGlvbiBmb3IgQUFCQiBjb2xsaXNpb24gZGV0ZWN0aW9uXHJcbmZ1bmN0aW9uIGNoZWNrQ29sbGlzaW9uKHJlY3QxOiBSZWN0LCByZWN0MjogUmVjdCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHJlY3QxLnggPCByZWN0Mi54ICsgcmVjdDIud2lkdGggJiZcclxuICAgICAgICAgICByZWN0MS54ICsgcmVjdDEud2lkdGggPiByZWN0Mi54ICYmXHJcbiAgICAgICAgICAgcmVjdDEueSA8IHJlY3QyLnkgKyByZWN0Mi5oZWlnaHQgJiZcclxuICAgICAgICAgICByZWN0MS55ICsgcmVjdDEuaGVpZ2h0ID4gcmVjdDIueTtcclxufVxyXG5cclxuLy8gQXNzZXQgTG9hZGVyIENsYXNzXHJcbmNsYXNzIEFzc2V0TG9hZGVyIHtcclxuICAgIHByaXZhdGUgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgbG9hZGVkQ291bnQ6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHRvdGFsQ291bnQ6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG9uUHJvZ3Jlc3M/OiAocHJvZ3Jlc3M6IG51bWJlcikgPT4gdm9pZDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihvblByb2dyZXNzPzogKHByb2dyZXNzOiBudW1iZXIpID0+IHZvaWQpIHtcclxuICAgICAgICB0aGlzLm9uUHJvZ3Jlc3MgPSBvblByb2dyZXNzO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGxvYWQoaW1hZ2VBc3NldHM6IEltYWdlQXNzZXRbXSwgc291bmRBc3NldHM6IFNvdW5kQXNzZXRbXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMudG90YWxDb3VudCA9IGltYWdlQXNzZXRzLmxlbmd0aCArIHNvdW5kQXNzZXRzLmxlbmd0aDtcclxuICAgICAgICBpZiAodGhpcy50b3RhbENvdW50ID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMub25Qcm9ncmVzcz8uKDEpO1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gaW1hZ2VBc3NldHMubWFwKGFzc2V0ID0+IHRoaXMubG9hZEltYWdlKGFzc2V0KSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHNvdW5kQXNzZXRzLm1hcChhc3NldCA9PiB0aGlzLmxvYWRTb3VuZChhc3NldCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICB0aGlzLm9uUHJvZ3Jlc3M/LigxKTsgLy8gRW5zdXJlIHByb2dyZXNzIGlzIDEgYXQgdGhlIGVuZFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUHJvZ3Jlc3MoKSB7XHJcbiAgICAgICAgdGhpcy5sb2FkZWRDb3VudCsrO1xyXG4gICAgICAgIHRoaXMub25Qcm9ncmVzcz8uKHRoaXMucHJvZ3Jlc3MpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKGFzc2V0OiBJbWFnZUFzc2V0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoYXNzZXQubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQcm9ncmVzcygpOyAvLyBTdGlsbCBjb3VudCBhcyBsb2FkZWQgdG8gYXZvaWQgYmxvY2tpbmdcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBhbnl3YXkgdG8gYWxsb3cgb3RoZXIgYXNzZXRzIHRvIGxvYWRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoYXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAvLyBVc2luZyBvbmNhbnBsYXl0aHJvdWdoIGVuc3VyZXMgdGhlIGVudGlyZSBzb3VuZCBjYW4gcGxheSB3aXRob3V0IGludGVycnVwdGlvblxyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gYXNzZXQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlUHJvZ3Jlc3MoKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke2Fzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVByb2dyZXNzKCk7IC8vIFN0aWxsIGNvdW50IGFzIGxvYWRlZFxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGFueXdheVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIEV4cGxpY2l0bHkgbG9hZCBmb3Igc29tZSBicm93c2Vyc1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEltYWdlKG5hbWU6IHN0cmluZyk6IEhUTUxJbWFnZUVsZW1lbnQge1xyXG4gICAgICAgIGNvbnN0IGltZyA9IHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoIWltZykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYEltYWdlIFwiJHtuYW1lfVwiIG5vdCBmb3VuZCBpbiBhc3NldHMuIFJldHVybmluZyBhIGR1bW15IGltYWdlLmApO1xyXG4gICAgICAgICAgICBjb25zdCBkdW1teSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBkdW1teS5zcmMgPSBcImRhdGE6aW1hZ2UvZ2lmO2Jhc2U2NCxSMGxHT0RsaEFRQUJBQUQvQUN3QUFBQUFBUUFCQUFBQ0FEcz1cIjsgLy8gVHJhbnNwYXJlbnQgMXgxIEdJRlxyXG4gICAgICAgICAgICByZXR1cm4gZHVtbXk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBpbWc7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0U291bmQobmFtZTogc3RyaW5nKTogSFRNTEF1ZGlvRWxlbWVudCB7XHJcbiAgICAgICAgY29uc3Qgc291bmQgPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKCFzb3VuZCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kIFwiJHtuYW1lfVwiIG5vdCBmb3VuZCBpbiBhc3NldHMuIFJldHVybmluZyBhIGR1bW15IEF1ZGlvLmApO1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEF1ZGlvKCk7IC8vIFJldHVybiBhIHNpbGVudCBhdWRpbyBvYmplY3RcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHNvdW5kO1xyXG4gICAgfVxyXG5cclxuICAgIGdldCBwcm9ncmVzcygpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRvdGFsQ291bnQgPiAwID8gdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxDb3VudCA6IDE7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdhbWUgU3RhdGUgRW51bVxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HLFxyXG4gICAgVElUTEUsXHJcbiAgICBDT05UUk9MUyxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVJcclxufVxyXG5cclxuLy8gUGxheWVyIFN0YXRlc1xyXG5lbnVtIFBsYXllckFuaW1hdGlvblN0YXRlIHtcclxuICAgIFJVTk5JTkcsXHJcbiAgICBKVU1QSU5HLFxyXG4gICAgU0xJRElOR1xyXG59XHJcblxyXG4vLyBQbGF5ZXIgQ2xhc3NcclxuY2xhc3MgUGxheWVyIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGJhc2VZOiBudW1iZXI7IC8vIFkgcG9zaXRpb24gd2hlbiBvbiBncm91bmQgd2l0aCBpbml0aWFsIGhlaWdodFxyXG4gICAgaW5pdGlhbEhlaWdodDogbnVtYmVyOyAvLyBQbGF5ZXIncyBoZWlnaHQgd2hlbiBydW5uaW5nXHJcbiAgICB2ZWxvY2l0eVk6IG51bWJlciA9IDA7XHJcbiAgICBvbkdyb3VuZDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICBhbmltYXRpb25TdGF0ZTogUGxheWVyQW5pbWF0aW9uU3RhdGUgPSBQbGF5ZXJBbmltYXRpb25TdGF0ZS5SVU5OSU5HO1xyXG4gICAgY3VycmVudEFuaW1hdGlvbkZyYW1lOiBudW1iZXIgPSAwO1xyXG4gICAgYW5pbWF0aW9uVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBzbGlkZVRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgaXNJbnZpbmNpYmxlOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBpbnZpbmNpYmxlVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBibGlua1RpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgbGl2ZXM6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGNvbmZpZzogUGxheWVyQ29uZmlnLCBwcml2YXRlIGFzc2V0TG9hZGVyOiBBc3NldExvYWRlciwgZ3JvdW5kWTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54ID0gY29uZmlnLng7XHJcbiAgICAgICAgdGhpcy55ID0gY29uZmlnLnk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IGNvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbml0aWFsSGVpZ2h0ID0gY29uZmlnLmhlaWdodDtcclxuICAgICAgICB0aGlzLmJhc2VZID0gZ3JvdW5kWSAtIGNvbmZpZy5oZWlnaHQ7IC8vIENhbGN1bGF0ZSBiYXNlIFkgYmFzZWQgb24gZ3JvdW5kXHJcbiAgICAgICAgdGhpcy55ID0gdGhpcy5iYXNlWTsgLy8gU3RhcnQgb24gdGhlIGdyb3VuZFxyXG4gICAgICAgIHRoaXMubGl2ZXMgPSBjb25maWcubGl2ZXM7XHJcbiAgICB9XHJcblxyXG4gICAganVtcCgpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAodGhpcy5vbkdyb3VuZCAmJiB0aGlzLmFuaW1hdGlvblN0YXRlICE9PSBQbGF5ZXJBbmltYXRpb25TdGF0ZS5TTElESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZID0gLXRoaXMuY29uZmlnLmp1bXBGb3JjZTtcclxuICAgICAgICAgICAgdGhpcy5vbkdyb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuSlVNUElORztcclxuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciA9IDA7IC8vIFJlc2V0IGFuaW1hdGlvbiBmb3IganVtcCBmcmFtZVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHNsaWRlKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLm9uR3JvdW5kICYmIHRoaXMuYW5pbWF0aW9uU3RhdGUgIT09IFBsYXllckFuaW1hdGlvblN0YXRlLkpVTVBJTkcgJiYgdGhpcy5hbmltYXRpb25TdGF0ZSAhPT0gUGxheWVyQW5pbWF0aW9uU3RhdGUuU0xJRElORykge1xyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuU0xJRElORztcclxuICAgICAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLmNvbmZpZy5zbGlkZUhlaWdodDtcclxuICAgICAgICAgICAgLy8gQWRqdXN0IFkgdG8ga2VlcCBib3R0b20gb2YgcGxheWVyIGF0IGdyb3VuZCBsZXZlbFxyXG4gICAgICAgICAgICB0aGlzLnkgPSB0aGlzLmJhc2VZICsgKHRoaXMuaW5pdGlhbEhlaWdodCAtIHRoaXMuY29uZmlnLnNsaWRlSGVpZ2h0KTtcclxuICAgICAgICAgICAgdGhpcy5zbGlkZVRpbWVyID0gdGhpcy5jb25maWcuc2xpZGVEdXJhdGlvbjtcclxuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciA9IDA7IC8vIFJlc2V0IGFuaW1hdGlvbiBmb3Igc2xpZGUgZnJhbWVcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdyb3VuZFk6IG51bWJlcikge1xyXG4gICAgICAgIC8vIEhhbmRsZSBncmF2aXR5XHJcbiAgICAgICAgaWYgKCF0aGlzLm9uR3JvdW5kKSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZICs9IHRoaXMuY29uZmlnLmdyYXZpdHkgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMueSArPSB0aGlzLnZlbG9jaXR5WSAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGxhbmRpbmcgb24gZ3JvdW5kXHJcbiAgICAgICAgaWYgKHRoaXMueSArIHRoaXMuaGVpZ2h0ID49IGdyb3VuZFkpIHtcclxuICAgICAgICAgICAgdGhpcy55ID0gZ3JvdW5kWSAtIHRoaXMuaGVpZ2h0O1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMub25Hcm91bmQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMub25Hcm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSAwO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uU3RhdGUgPT09IFBsYXllckFuaW1hdGlvblN0YXRlLkpVTVBJTkcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuUlVOTklORzsgLy8gTGFuZGVkLCBnbyBiYWNrIHRvIHJ1bm5pbmdcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaW5pdGlhbEhlaWdodDsgLy8gUmVzZXQgaGVpZ2h0XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5iYXNlWTsgLy8gUmUtYWxpZ24gcGxheWVyIHRvIGdyb3VuZCBhZnRlciBqdW1wXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSBzbGlkaW5nIGR1cmF0aW9uXHJcbiAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uU3RhdGUgPT09IFBsYXllckFuaW1hdGlvblN0YXRlLlNMSURJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5zbGlkZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc2xpZGVUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFuaW1hdGlvblN0YXRlID0gUGxheWVyQW5pbWF0aW9uU3RhdGUuUlVOTklORztcclxuICAgICAgICAgICAgICAgIHRoaXMuaGVpZ2h0ID0gdGhpcy5pbml0aWFsSGVpZ2h0OyAvLyBSZXNldCBoZWlnaHQgYWZ0ZXIgc2xpZGluZ1xyXG4gICAgICAgICAgICAgICAgdGhpcy55ID0gdGhpcy5iYXNlWTsgLy8gUmVzZXQgWSBwb3NpdGlvblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcnVubmluZyBhbmltYXRpb24gZnJhbWUgdXBkYXRlXHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRoaXMuYW5pbWF0aW9uU3RhdGUgPT09IFBsYXllckFuaW1hdGlvblN0YXRlLlJVTk5JTkcgJiYgdGhpcy5hbmltYXRpb25UaW1lciA+PSB0aGlzLmNvbmZpZy5hbmltYXRpb25TcGVlZCkge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRBbmltYXRpb25GcmFtZSA9ICh0aGlzLmN1cnJlbnRBbmltYXRpb25GcmFtZSArIDEpICUgdGhpcy5jb25maWcucnVubmluZ0ZyYW1lcy5sZW5ndGg7XHJcbiAgICAgICAgICAgIHRoaXMuYW5pbWF0aW9uVGltZXIgPSAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGludmluY2liaWxpdHlcclxuICAgICAgICBpZiAodGhpcy5pc0ludmluY2libGUpIHtcclxuICAgICAgICAgICAgdGhpcy5pbnZpbmNpYmxlVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICB0aGlzLmJsaW5rVGltZXIgKz0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5pbnZpbmNpYmxlVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pc0ludmluY2libGUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmxpbmtUaW1lciA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGlmICh0aGlzLmlzSW52aW5jaWJsZSAmJiBNYXRoLmZsb29yKHRoaXMuYmxpbmtUaW1lciAqIHRoaXMuY29uZmlnLmJsaW5rRnJlcXVlbmN5KSAlIDIgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBCbGluayBlZmZlY3Q6IHNraXAgZHJhd2luZ1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGltYWdlO1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5hbmltYXRpb25TdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIFBsYXllckFuaW1hdGlvblN0YXRlLkpVTVBJTkc6XHJcbiAgICAgICAgICAgICAgICBpbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcuanVtcGluZ0ZyYW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFBsYXllckFuaW1hdGlvblN0YXRlLlNMSURJTkc6XHJcbiAgICAgICAgICAgICAgICBpbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcuc2xpZGluZ0ZyYW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFBsYXllckFuaW1hdGlvblN0YXRlLlJVTk5JTkc6XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBpbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UodGhpcy5jb25maWcucnVubmluZ0ZyYW1lc1t0aGlzLmN1cnJlbnRBbmltYXRpb25GcmFtZV0pO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0Q29sbGlzaW9uUmVjdCgpOiBSZWN0IHtcclxuICAgICAgICByZXR1cm4geyB4OiB0aGlzLngsIHk6IHRoaXMueSwgd2lkdGg6IHRoaXMud2lkdGgsIGhlaWdodDogdGhpcy5oZWlnaHQgfTtcclxuICAgIH1cclxuXHJcbiAgICBoaXQoZGFtYWdlOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNJbnZpbmNpYmxlKSB7XHJcbiAgICAgICAgICAgIHRoaXMubGl2ZXMgLT0gZGFtYWdlO1xyXG4gICAgICAgICAgICB0aGlzLmlzSW52aW5jaWJsZSA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJsZVRpbWVyID0gdGhpcy5jb25maWcuaW52aW5jaWJpbGl0eUR1cmF0aW9uO1xyXG4gICAgICAgICAgICB0aGlzLmJsaW5rVGltZXIgPSAwO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gUGxheWVyIHdhcyBoaXQgYW5kIHRvb2sgZGFtYWdlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTsgLy8gUGxheWVyIHdhcyBpbnZpbmNpYmxlXHJcbiAgICB9XHJcblxyXG4gICAgcmVzZXQoKSB7XHJcbiAgICAgICAgdGhpcy54ID0gdGhpcy5jb25maWcueDtcclxuICAgICAgICB0aGlzLnkgPSB0aGlzLmJhc2VZO1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmNvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMuaW5pdGlhbEhlaWdodDtcclxuICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IDA7XHJcbiAgICAgICAgdGhpcy5vbkdyb3VuZCA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25TdGF0ZSA9IFBsYXllckFuaW1hdGlvblN0YXRlLlJVTk5JTkc7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50QW5pbWF0aW9uRnJhbWUgPSAwO1xyXG4gICAgICAgIHRoaXMuYW5pbWF0aW9uVGltZXIgPSAwO1xyXG4gICAgICAgIHRoaXMuc2xpZGVUaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5pc0ludmluY2libGUgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmludmluY2libGVUaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5ibGlua1RpbWVyID0gMDtcclxuICAgICAgICB0aGlzLmxpdmVzID0gdGhpcy5jb25maWcubGl2ZXM7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFBhcmFsbGF4IExheWVyIENsYXNzXHJcbmNsYXNzIFBhcmFsbGF4TGF5ZXIge1xyXG4gICAgeDogbnVtYmVyID0gMDtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgc3BlZWQ6IG51bWJlcjsgLy8gQ2FsY3VsYXRlZCBiYXNlZCBvbiBnYW1lIHNwZWVkIGFuZCBtdWx0aXBsaWVyXHJcblxyXG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBjb25maWc6IFBhcmFsbGF4TGF5ZXJDb25maWcsIHByaXZhdGUgYXNzZXRMb2FkZXI6IEFzc2V0TG9hZGVyLCBjYW52YXNXaWR0aDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0SW1hZ2UoY29uZmlnLmltYWdlKTtcclxuICAgICAgICB0aGlzLnkgPSBjb25maWcueU9mZnNldDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgLy8gSW1hZ2Ugd2lkdGggc2hvdWxkIGlkZWFsbHkgYmUgY2FudmFzV2lkdGggb3IgYSBtdWx0aXBsZSBmb3Igc2VhbWxlc3MgdGlsaW5nXHJcbiAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHksIHdlIGFzc3VtZSBpbWFnZS53aWR0aCB3aWxsIGJlIHVzZWQgYW5kIGRyYXduIHR3aWNlLlxyXG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmltYWdlLndpZHRoOyAvLyBVc2UgYWN0dWFsIGltYWdlIHdpZHRoIGZvciBjYWxjdWxhdGlvblxyXG4gICAgICAgIGlmICh0aGlzLndpZHRoID09PSAwKSB7IC8vIEZhbGxiYWNrIGZvciB1bmxvYWRlZCBpbWFnZVxyXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gY2FudmFzV2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc3BlZWQgPSAwOyAvLyBXaWxsIGJlIHVwZGF0ZWQgYnkgZ2FtZSBsb2dpY1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNwZWVkID0gZ2FtZVNwZWVkICogdGhpcy5jb25maWcuc3BlZWRNdWx0aXBsaWVyO1xyXG4gICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggPD0gLXRoaXMud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICAvLyBEcmF3IHRoZSBpbWFnZSB0d2ljZSB0byBjcmVhdGUgYSBzZWFtbGVzcyBsb29wXHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54ICsgdGhpcy53aWR0aCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgLy8gSWYgaW1hZ2UgaXMgc21hbGxlciB0aGFuIGNhbnZhcywgZHJhdyBhZ2FpbiB0byBmaWxsIHBvdGVudGlhbGx5IGVtcHR5IHNwYWNlXHJcbiAgICAgICAgaWYgKHRoaXMud2lkdGggPCBjdHguY2FudmFzLndpZHRoKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54ICsgdGhpcy53aWR0aCAqIDIsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gR3JvdW5kIENsYXNzXHJcbmNsYXNzIEdyb3VuZCB7XHJcbiAgICB4OiBudW1iZXIgPSAwO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBzcGVlZDogbnVtYmVyOyAvLyBTYW1lIGFzIGdhbWUgc3BlZWRcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGNvbmZpZzogR3JvdW5kQ29uZmlnLCBwcml2YXRlIGFzc2V0TG9hZGVyOiBBc3NldExvYWRlciwgY2FudmFzV2lkdGg6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy55ID0gY29uZmlnLnk7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB0aGlzLmltYWdlLndpZHRoO1xyXG4gICAgICAgIGlmICh0aGlzLndpZHRoID09PSAwKSB7IC8vIEZhbGxiYWNrIGZvciB1bmxvYWRlZCBpbWFnZVxyXG4gICAgICAgICAgICB0aGlzLndpZHRoID0gY2FudmFzV2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc3BlZWQgPSAwO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNwZWVkID0gZ2FtZVNwZWVkO1xyXG4gICAgICAgIHRoaXMueCAtPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggPD0gLXRoaXMud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHRoaXMud2lkdGg7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLnggKyB0aGlzLndpZHRoLCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRDb2xsaXNpb25SZWN0KCk6IFJlY3Qge1xyXG4gICAgICAgIHJldHVybiB7IHg6IHRoaXMueCwgeTogdGhpcy55LCB3aWR0aDogdGhpcy53aWR0aCAqIDIsIGhlaWdodDogdGhpcy5oZWlnaHQgfTsgLy8gR3JvdW5kIGlzIGVmZmVjdGl2ZWx5IGVuZGxlc3NcclxuICAgIH1cclxufVxyXG5cclxuLy8gT2JzdGFjbGUgQ2xhc3NcclxuY2xhc3MgT2JzdGFjbGUge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBhY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGNvbGxpZGVkOiBib29sZWFuID0gZmFsc2U7IC8vIFRvIHByZXZlbnQgbXVsdGlwbGUgY29sbGlzaW9uIGNoZWNrc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY29uZmlnOiBPYnN0YWNsZUNvbmZpZywgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXIsIGdyb3VuZFk6IG51bWJlciwgaW5pdGlhbFg6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSB0aGlzLmFzc2V0TG9hZGVyLmdldEltYWdlKGNvbmZpZy5pbWFnZSk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IGNvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGNvbmZpZy5oZWlnaHQ7XHJcbiAgICAgICAgdGhpcy54ID0gaW5pdGlhbFg7XHJcbiAgICAgICAgdGhpcy55ID0gZ3JvdW5kWSAtIGNvbmZpZy55T2Zmc2V0IC0gdGhpcy5oZWlnaHQ7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lU3BlZWQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCAtPSBnYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRoaXMueCArIHRoaXMud2lkdGggPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmUpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBnZXRDb2xsaXNpb25SZWN0KCk6IFJlY3Qge1xyXG4gICAgICAgIHJldHVybiB7IHg6IHRoaXMueCwgeTogdGhpcy55LCB3aWR0aDogdGhpcy53aWR0aCwgaGVpZ2h0OiB0aGlzLmhlaWdodCB9O1xyXG4gICAgfVxyXG5cclxuICAgIHJlc2V0KG5ld1g6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCA9IG5ld1g7XHJcbiAgICAgICAgdGhpcy5hY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuY29sbGlkZWQgPSBmYWxzZTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gQ29sbGVjdGlibGUgQ2xhc3NcclxuY2xhc3MgQ29sbGVjdGlibGUge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBhY3RpdmU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGNvbGxlY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY29uZmlnOiBDb2xsZWN0aWJsZUNvbmZpZywgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXIsIGluaXRpYWxYOiBudW1iZXIsIGluaXRpYWxZOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLmltYWdlID0gdGhpcy5hc3NldExvYWRlci5nZXRJbWFnZShjb25maWcuaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMud2lkdGggPSBjb25maWcud2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBjb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMueCA9IGluaXRpYWxYO1xyXG4gICAgICAgIHRoaXMueSA9IGluaXRpYWxZO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IGNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggLT0gZ2FtZVNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggKyB0aGlzLndpZHRoIDwgMCkge1xyXG4gICAgICAgICAgICB0aGlzLmFjdGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuYWN0aXZlICYmICF0aGlzLmNvbGxlY3RlZCkge1xyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldENvbGxpc2lvblJlY3QoKTogUmVjdCB7XHJcbiAgICAgICAgcmV0dXJuIHsgeDogdGhpcy54LCB5OiB0aGlzLnksIHdpZHRoOiB0aGlzLndpZHRoLCBoZWlnaHQ6IHRoaXMuaGVpZ2h0IH07XHJcbiAgICB9XHJcblxyXG4gICAgcmVzZXQobmV3WDogbnVtYmVyLCBuZXdZOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggPSBuZXdYO1xyXG4gICAgICAgIHRoaXMueSA9IG5ld1k7XHJcbiAgICAgICAgdGhpcy5hY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGVkID0gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vLyBNYWluIEdhbWUgQ2xhc3NcclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBhc3NldExvYWRlcjogQXNzZXRMb2FkZXI7XHJcbiAgICBwcml2YXRlIHN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIHByaXZhdGUgbGFzdEZyYW1lVGltZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgZ2FtZVNwZWVkOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50U3BlZWQ6IG51bWJlciA9IDA7IC8vIEN1cnJlbnQgYWN0dWFsIHNwZWVkIGZvciBzY3JvbGxpbmdcclxuICAgIHByaXZhdGUgZ2FtZVBhdXNlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUbyBwYXVzZSBnYW1lIGxvZ2ljIG9uIHRpdGxlL2NvbnRyb2xzL2dhbWUgb3ZlclxyXG5cclxuICAgIHByaXZhdGUgcGxheWVyITogUGxheWVyO1xyXG4gICAgcHJpdmF0ZSBwYXJhbGxheExheWVyczogUGFyYWxsYXhMYXllcltdID0gW107XHJcbiAgICBwcml2YXRlIGdyb3VuZCE6IEdyb3VuZDtcclxuICAgIHByaXZhdGUgb2JzdGFjbGVzOiBPYnN0YWNsZVtdID0gW107XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlczogQ29sbGVjdGlibGVbXSA9IFtdO1xyXG5cclxuICAgIHByaXZhdGUgb2JzdGFjbGVTcGF3blRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBuZXh0T2JzdGFjbGVTcGF3blRpbWU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgaGlnaFNjb3JlczogeyBzY29yZTogbnVtYmVyLCBkYXRlOiBzdHJpbmcgfVtdID0gW107XHJcbiAgICBwcml2YXRlIHNjb3JlRGlzcGxheTogbnVtYmVyID0gMDsgLy8gRm9yIHNtb290aCBzY29yZSB1cGRhdGUgYW5pbWF0aW9uXHJcblxyXG4gICAgcHJpdmF0ZSBhdWRpb0NvbnRleHQ6IEF1ZGlvQ29udGV4dDtcclxuICAgIHByaXZhdGUgYmdtU291cmNlOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGUgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYmdtQnVmZmVyOiBBdWRpb0J1ZmZlciB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBiZ21HYWluTm9kZTogR2Fpbk5vZGU7XHJcblxyXG4gICAgcHJpdmF0ZSBrZXlQcmVzc2VkOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9O1xyXG4gICAgcHJpdmF0ZSBpc1dhaXRpbmdGb3JJbnB1dDogYm9vbGVhbiA9IHRydWU7IC8vIEZvciB0aXRsZSBhbmQgY29udHJvbHMgc2NyZWVuXHJcblxyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcIiR7Y2FudmFzSWR9XCIgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG4gICAgICAgIGlmICghdGhpcy5jdHgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRmFpbGVkIHRvIGdldCAyRCByZW5kZXJpbmcgY29udGV4dC5cIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmFzc2V0TG9hZGVyID0gbmV3IEFzc2V0TG9hZGVyKHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQgPSBuZXcgKHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgKHdpbmRvdyBhcyBhbnkpLndlYmtpdEF1ZGlvQ29udGV4dCkoKTtcclxuICAgICAgICB0aGlzLmJnbUdhaW5Ob2RlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpO1xyXG4gICAgICAgIHRoaXMuYmdtR2Fpbk5vZGUuY29ubmVjdCh0aGlzLmF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XHJcblxyXG4gICAgICAgIHRoaXMubG9hZEdhbWVEYXRhKCk7XHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVycygpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEdhbWVEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jb25maWcuY2FudmFzLndpZHRoO1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmNvbmZpZy5jYW52YXMuaGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgLy8gTG9hZCBhc3NldHMgKGltYWdlcyBhbmQgc291bmQgZWZmZWN0cyBhcyBIVE1MQXVkaW9FbGVtZW50cylcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hc3NldExvYWRlci5sb2FkKHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRGVjb2RlIEJHTSBmb3IgV2ViIEF1ZGlvIEFQSSB1c2luZyBpdHMgcGF0aCBkaXJlY3RseVxyXG4gICAgICAgICAgICBjb25zdCBiZ21Bc3NldENvbmZpZyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpO1xyXG4gICAgICAgICAgICBpZiAoYmdtQXNzZXRDb25maWcpIHtcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYmdtUmVzcG9uc2UgPSBhd2FpdCBmZXRjaChiZ21Bc3NldENvbmZpZy5wYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGJnbVJlc3BvbnNlLmFycmF5QnVmZmVyKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iZ21CdWZmZXIgPSBhd2FpdCB0aGlzLmF1ZGlvQ29udGV4dC5kZWNvZGVBdWRpb0RhdGEoYXJyYXlCdWZmZXIpO1xyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBkZWNvZGUgQkdNIGZyb20gJHtiZ21Bc3NldENvbmZpZy5wYXRofTpgLCBlKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5pbml0R2FtZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmxvYWRIaWdoU2NvcmVzKCk7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZUxvb3AoMCk7IC8vIFN0YXJ0IHRoZSBnYW1lIGxvb3BcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhIG9yIGFzc2V0czpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjsgLy8gT3IgYW4gZXJyb3Igc3RhdGVcclxuICAgICAgICAgICAgdGhpcy5kcmF3RXJyb3JTY3JlZW4oXCJcdUFDOENcdUM3ODQgXHVCODVDXHVCNERDIFx1QzJFNFx1RDMyOCEgXHVDRjU4XHVDMTk0XHVDNzQ0IFx1RDY1NVx1Qzc3OFx1RDU3NFx1QzhGQ1x1QzEzOFx1QzY5NC5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaW5pdEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3BlZWQgPSB0aGlzLmNvbmZpZy5nYW1lcGxheS5pbml0aWFsR2FtZVNwZWVkO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNwZWVkID0gdGhpcy5nYW1lU3BlZWQ7IC8vIEluaXRpYWxpemUgY3VycmVudFNwZWVkXHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKHRoaXMuY29uZmlnLnBsYXllciwgdGhpcy5hc3NldExvYWRlciwgdGhpcy5jb25maWcuZ3JvdW5kLnkpO1xyXG5cclxuICAgICAgICB0aGlzLnBhcmFsbGF4TGF5ZXJzID0gdGhpcy5jb25maWcucGFyYWxsYXgubWFwKGxheWVyQ29uZmlnID0+XHJcbiAgICAgICAgICAgIG5ldyBQYXJhbGxheExheWVyKGxheWVyQ29uZmlnLCB0aGlzLmFzc2V0TG9hZGVyLCB0aGlzLmNhbnZhcy53aWR0aClcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICB0aGlzLmdyb3VuZCA9IG5ldyBHcm91bmQodGhpcy5jb25maWcuZ3JvdW5kLCB0aGlzLmFzc2V0TG9hZGVyLCB0aGlzLmNhbnZhcy53aWR0aCk7XHJcblxyXG4gICAgICAgIC8vIEluaXRpYWxpemUgb2JqZWN0IHBvb2xzIGZvciBvYnN0YWNsZXMgYW5kIGNvbGxlY3RpYmxlc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7IC8vIFByZS1hbGxvY2F0ZSBzb21lIG9iamVjdHNcclxuICAgICAgICAgICAgY29uc3Qgb2JzQ29uZmlnID0gdGhpcy5jb25maWcub2JzdGFjbGVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRoaXMuY29uZmlnLm9ic3RhY2xlcy5sZW5ndGgpXTtcclxuICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMucHVzaChuZXcgT2JzdGFjbGUob2JzQ29uZmlnLCB0aGlzLmFzc2V0TG9hZGVyLCB0aGlzLmNvbmZpZy5ncm91bmQueSwgdGhpcy5jYW52YXMud2lkdGgpKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNvbGxDb25maWcgPSB0aGlzLmNvbmZpZy5jb2xsZWN0aWJsZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5jb25maWcuY29sbGVjdGlibGVzLmxlbmd0aCldO1xyXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5wdXNoKG5ldyBDb2xsZWN0aWJsZShjb2xsQ29uZmlnLCB0aGlzLmFzc2V0TG9hZGVyLCB0aGlzLmNhbnZhcy53aWR0aCwgMCkpOyAvLyBZIHdpbGwgYmUgc2V0IG9uIHJlc2V0XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucmVzZXRTcGF3blRpbWVycygpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzZXRTcGF3blRpbWVycygpIHtcclxuICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5uZXh0T2JzdGFjbGVTcGF3blRpbWUgPSB0aGlzLmdldFJhbmRvbVNwYXduVGltZSh0aGlzLmNvbmZpZy5nYW1lcGxheS5vYnN0YWNsZVNwYXduSW50ZXJ2YWxNaW4sIHRoaXMuY29uZmlnLmdhbWVwbGF5Lm9ic3RhY2xlU3Bhd25JbnRlcnZhbE1heCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRSYW5kb21TcGF3blRpbWUobWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4pICsgbWluO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYWRkRXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bi5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMuaGFuZGxlS2V5VXAuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNsaWNrLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuTE9BRElORykgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMua2V5UHJlc3NlZFtldmVudC5jb2RlXSkgeyAvLyBPbmx5IHRyaWdnZXIgb24gZmlyc3QgcHJlc3NcclxuICAgICAgICAgICAgdGhpcy5rZXlQcmVzc2VkW2V2ZW50LmNvZGVdID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgfHwgdGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkNPTlRST0xTIHx8IHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmlzV2FpdGluZ0ZvcklucHV0KSB7IC8vIEVuc3VyZSBvbmx5IG9uZSBpbnB1dCB0byB0cmFuc2l0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLkNPTlRST0xTO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmlzV2FpdGluZ0ZvcklucHV0ID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuQ09OVFJPTFMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmlzV2FpdGluZ0ZvcklucHV0ID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7IC8vIFN0YXJ0IHRoZSBnYW1lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheUJHTSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmlzV2FpdGluZ0ZvcklucHV0ID0gZmFsc2U7IC8vIFJlc2V0IHRvIGFsbG93IGlucHV0IGZvciB0aXRsZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnN0b3BCR00oKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm47IC8vIENvbnN1bWUgaW5wdXQsIGRvbid0IHBhc3MgdG8gcGxheWVyIGFjdGlvbnNcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmICF0aGlzLmdhbWVQYXVzZWQpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdTcGFjZScpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5qdW1wKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2p1bXAnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5jb2RlID09PSAnQXJyb3dEb3duJykge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLnNsaWRlKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X3NsaWRlJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMua2V5UHJlc3NlZFtldmVudC5jb2RlXSA9IGZhbHNlO1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgfHwgdGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkNPTlRST0xTIHx8IHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IHRydWU7IC8vIEFsbG93IG5ldyBpbnB1dCBmb3IgbmV4dCB0cmFuc2l0aW9uXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2soZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICAvLyBTaW1pbGFyIHRvIGtleWRvd24gYnV0IG9ubHkgZm9yIGdlbmVyYWwgXCJzdGFydFwiXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSAmJiB0aGlzLmlzV2FpdGluZ0ZvcklucHV0KSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuQ09OVFJPTFM7XHJcbiAgICAgICAgICAgIHRoaXMuaXNXYWl0aW5nRm9ySW5wdXQgPSBmYWxzZTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5DT05UUk9MUyAmJiB0aGlzLmlzV2FpdGluZ0ZvcklucHV0KSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLnJlc2V0R2FtZSgpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXlCR00oKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIgJiYgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICB0aGlzLmlzV2FpdGluZ0ZvcklucHV0ID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuc3RvcEJHTSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wKGN1cnJlbnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RGcmFtZVRpbWUpIC8gMTAwMDsgLy8gQ29udmVydCB0byBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuTE9BRElORykge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKHRoaXMuYXNzZXRMb2FkZXIucHJvZ3Jlc3MpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5nYW1lUGF1c2VkKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZHJhdygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuc3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIC8vIEluY3JlYXNlIGdhbWUgc3BlZWQgb3ZlciB0aW1lXHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTcGVlZCA9IE1hdGgubWluKHRoaXMuY29uZmlnLmdhbWVwbGF5Lm1heEdhbWVTcGVlZCwgdGhpcy5nYW1lU3BlZWQgKyB0aGlzLmNvbmZpZy5nYW1lcGxheS5zcGVlZEluY3JlYXNlUmF0ZSAqIGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTcGVlZCA9IHRoaXMuZ2FtZVNwZWVkO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBwbGF5ZXJcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMuY29uZmlnLmdyb3VuZC55KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgcGFyYWxsYXggbGF5ZXJzXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBhcmFsbGF4TGF5ZXJzLmZvckVhY2gobGF5ZXIgPT4gbGF5ZXIudXBkYXRlKGRlbHRhVGltZSwgdGhpcy5jdXJyZW50U3BlZWQpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgZ3JvdW5kXHJcbiAgICAgICAgICAgICAgICB0aGlzLmdyb3VuZC51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmN1cnJlbnRTcGVlZCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gU3Bhd24gb2JzdGFjbGVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vYnN0YWNsZVNwYXduVGltZXIgPj0gdGhpcy5uZXh0T2JzdGFjbGVTcGF3blRpbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduT2JzdGFjbGUoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5uZXh0T2JzdGFjbGVTcGF3blRpbWUgPSB0aGlzLmdldFJhbmRvbVNwYXduVGltZSh0aGlzLmNvbmZpZy5nYW1lcGxheS5vYnN0YWNsZVNwYXduSW50ZXJ2YWxNaW4sIHRoaXMuY29uZmlnLmdhbWVwbGF5Lm9ic3RhY2xlU3Bhd25JbnRlcnZhbE1heCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIGFuZCBjaGVjayBjb2xsaXNpb25zIGZvciBvYnN0YWNsZXNcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBsYXllclJlY3QgPSB0aGlzLnBsYXllci5nZXRDb2xsaXNpb25SZWN0KCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9ic3RhY2xlcy5mb3JFYWNoKG9ic3RhY2xlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAob2JzdGFjbGUuYWN0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG9ic3RhY2xlLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMuY3VycmVudFNwZWVkKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFvYnN0YWNsZS5jb2xsaWRlZCAmJiBjaGVja0NvbGxpc2lvbihwbGF5ZXJSZWN0LCBvYnN0YWNsZS5nZXRDb2xsaXNpb25SZWN0KCkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuaGl0KHRoaXMuY29uZmlnLmdhbWVwbGF5Lm9ic3RhY2xlRGFtYWdlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdzZnhfaGl0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2JzdGFjbGUuY29sbGlkZWQgPSB0cnVlOyAvLyBNYXJrIGFzIGNvbGxpZGVkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmxpdmVzIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBhbmQgY2hlY2sgY29sbGlzaW9ucyBmb3IgY29sbGVjdGlibGVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5mb3JFYWNoKGNvbGxlY3RpYmxlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdGlibGUuYWN0aXZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbGxlY3RpYmxlLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMuY3VycmVudFNwZWVkKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFjb2xsZWN0aWJsZS5jb2xsZWN0ZWQgJiYgY2hlY2tDb2xsaXNpb24ocGxheWVyUmVjdCwgY29sbGVjdGlibGUuZ2V0Q29sbGlzaW9uUmVjdCgpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSBjb2xsZWN0aWJsZS5zY29yZVZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sbGVjdGlibGUuY29sbGVjdGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdzZnhfY29sbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIHNjb3JlIGJhc2VkIG9uIGRpc3RhbmNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuY29uZmlnLmdhbWVwbGF5LnNjb3JlUGVyU2Vjb25kICogZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zY29yZURpc3BsYXkgPSBNYXRoLm1pbih0aGlzLnNjb3JlLCB0aGlzLnNjb3JlRGlzcGxheSArICh0aGlzLnNjb3JlIC0gdGhpcy5zY29yZURpc3BsYXkpICogZGVsdGFUaW1lICogNSk7IC8vIFNtb290aCB1cGRhdGVcclxuXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3KCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBwYXJhbGxheCBsYXllcnNcclxuICAgICAgICB0aGlzLnBhcmFsbGF4TGF5ZXJzLmZvckVhY2gobGF5ZXIgPT4gbGF5ZXIuZHJhdyh0aGlzLmN0eCkpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IGdyb3VuZFxyXG4gICAgICAgIHRoaXMuZ3JvdW5kLmRyYXcodGhpcy5jdHgpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IG9ic3RhY2xlc1xyXG4gICAgICAgIHRoaXMub2JzdGFjbGVzLmZvckVhY2gob2JzdGFjbGUgPT4gb2JzdGFjbGUuZHJhdyh0aGlzLmN0eCkpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IGNvbGxlY3RpYmxlc1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVzLmZvckVhY2goY29sbGVjdGlibGUgPT4gY29sbGVjdGlibGUuZHJhdyh0aGlzLmN0eCkpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IHBsYXllclxyXG4gICAgICAgIHRoaXMucGxheWVyLmRyYXcodGhpcy5jdHgpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IFVJXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudWkudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSB0aGlzLmNvbmZpZy51aS5mb250O1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDODEwXHVDMjE4OiAke01hdGguZmxvb3IodGhpcy5zY29yZURpc3BsYXkpfWAsIDIwLCA0MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1Q0NCNFx1QjgyNTogJHt0aGlzLnBsYXllci5saXZlc31gLCAyMCwgODApO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuc3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuTE9BRElORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4odGhpcy5hc3NldExvYWRlci5wcm9ncmVzcyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdDZW50ZXJlZFRleHQodGhpcy5jb25maWcudWkudGl0bGVNZXNzYWdlLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Q2VudGVyZWRUZXh0KHRoaXMuY29uZmlnLnVpLnN0YXJ0TWVzc2FnZSwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwLCAyNCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuQ09OVFJPTFM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdDZW50ZXJlZFRleHQodGhpcy5jb25maWcudWkuY29udHJvbHNNZXNzYWdlLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Q2VudGVyZWRUZXh0KHRoaXMuY29uZmlnLnVpLnN0YXJ0TWVzc2FnZSwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwLCAyNCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Q2VudGVyZWRUZXh0KHRoaXMuY29uZmlnLnVpLmdhbWVPdmVyTWVzc2FnZSwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDgwKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0NlbnRlcmVkVGV4dChgXHVDRDVDXHVDODg1IFx1QzgxMFx1QzIxODogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmUpfWAsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAyMCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdIaWdoU2NvcmVzKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdDZW50ZXJlZFRleHQodGhpcy5jb25maWcudWkucmVzdGFydE1lc3NhZ2UsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAxMDAsIDI0KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdMb2FkaW5nU2NyZWVuKHByb2dyZXNzOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1x1Qjg1Q1x1QjUyOSBcdUM5MTEuLi4nLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAzMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QodGhpcy5jYW52YXMud2lkdGggLyAyIC0gMTAwLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyLCAyMDAgKiBwcm9ncmVzcywgMjApO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDEwMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgMjAwLCAyMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3Q2VudGVyZWRUZXh0KHRleHQ6IHN0cmluZywgeTogbnVtYmVyLCBmb250U2l6ZTogbnVtYmVyID0gMzYpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy51aS50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke2ZvbnRTaXplfXB4ICR7dGhpcy5jb25maWcudWkuZm9udC5zcGxpdCgnICcpWzFdIHx8ICdBcmlhbCd9YDsgLy8gRXh0cmFjdCBmb250IGZhbWlseVxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzcGF3bk9ic3RhY2xlKCk6IHZvaWQge1xyXG4gICAgICAgIC8vIEZpbmQgYW4gaW5hY3RpdmUgb2JzdGFjbGUgaW4gdGhlIHBvb2xcclxuICAgICAgICBsZXQgb2JzdGFjbGUgPSB0aGlzLm9ic3RhY2xlcy5maW5kKG8gPT4gIW8uYWN0aXZlKTtcclxuICAgICAgICBpZiAoIW9ic3RhY2xlKSB7XHJcbiAgICAgICAgICAgIC8vIElmIG5vIGluYWN0aXZlIG9ic3RhY2xlLCBjcmVhdGUgYSBuZXcgb25lIChleHBhbmQgcG9vbClcclxuICAgICAgICAgICAgY29uc3Qgb2JzQ29uZmlnID0gdGhpcy5jb25maWcub2JzdGFjbGVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRoaXMuY29uZmlnLm9ic3RhY2xlcy5sZW5ndGgpXTtcclxuICAgICAgICAgICAgb2JzdGFjbGUgPSBuZXcgT2JzdGFjbGUob2JzQ29uZmlnLCB0aGlzLmFzc2V0TG9hZGVyLCB0aGlzLmNvbmZpZy5ncm91bmQueSwgdGhpcy5jYW52YXMud2lkdGggKyBNYXRoLnJhbmRvbSgpICogNTApO1xyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlcy5wdXNoKG9ic3RhY2xlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHJhbmRvbUNvbmZpZyA9IHRoaXMuY29uZmlnLm9ic3RhY2xlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5vYnN0YWNsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgb2JzdGFjbGUucmVzZXQodGhpcy5jYW52YXMud2lkdGggKyBNYXRoLnJhbmRvbSgpICogMTAwKTsgLy8gU3Bhd24gc2xpZ2h0bHkgb2ZmLXNjcmVlbiB0byB0aGUgcmlnaHRcclxuICAgICAgICBvYnN0YWNsZS53aWR0aCA9IHJhbmRvbUNvbmZpZy53aWR0aDtcclxuICAgICAgICBvYnN0YWNsZS5oZWlnaHQgPSByYW5kb21Db25maWcuaGVpZ2h0O1xyXG4gICAgICAgIG9ic3RhY2xlLmltYWdlID0gdGhpcy5hc3NldExvYWRlci5nZXRJbWFnZShyYW5kb21Db25maWcuaW1hZ2UpO1xyXG4gICAgICAgIG9ic3RhY2xlLnkgPSB0aGlzLmNvbmZpZy5ncm91bmQueSAtIHJhbmRvbUNvbmZpZy55T2Zmc2V0IC0gb2JzdGFjbGUuaGVpZ2h0O1xyXG4gICAgICAgIG9ic3RhY2xlLmFjdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgb2JzdGFjbGUuY29sbGlkZWQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgLy8gUG90ZW50aWFsbHkgc3Bhd24gYSBjb2xsZWN0aWJsZSB3aXRoIHRoZSBvYnN0YWNsZVxyXG4gICAgICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgdGhpcy5jb25maWcuZ2FtZXBsYXkuY29sbGVjdGlibGVTcGF3bkNoYW5jZSkge1xyXG4gICAgICAgICAgICB0aGlzLnNwYXduQ29sbGVjdGlibGUob2JzdGFjbGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduQ29sbGVjdGlibGUoYXNzb2NpYXRlZE9ic3RhY2xlOiBPYnN0YWNsZSk6IHZvaWQge1xyXG4gICAgICAgIGxldCBjb2xsZWN0aWJsZSA9IHRoaXMuY29sbGVjdGlibGVzLmZpbmQoYyA9PiAhYy5hY3RpdmUpO1xyXG4gICAgICAgIGlmICghY29sbGVjdGlibGUpIHtcclxuICAgICAgICAgICAgY29uc3QgY29sbENvbmZpZyA9IHRoaXMuY29uZmlnLmNvbGxlY3RpYmxlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5jb2xsZWN0aWJsZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlID0gbmV3IENvbGxlY3RpYmxlKGNvbGxDb25maWcsIHRoaXMuYXNzZXRMb2FkZXIsIDAsIDApOyAvLyBQb3NpdGlvbnMgd2lsbCBiZSBzZXQgb24gcmVzZXRcclxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMucHVzaChjb2xsZWN0aWJsZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByYW5kb21Db25maWcgPSB0aGlzLmNvbmZpZy5jb2xsZWN0aWJsZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5jb25maWcuY29sbGVjdGlibGVzLmxlbmd0aCldO1xyXG4gICAgICAgIGNvbGxlY3RpYmxlLmltYWdlID0gdGhpcy5hc3NldExvYWRlci5nZXRJbWFnZShyYW5kb21Db25maWcuaW1hZ2UpO1xyXG4gICAgICAgIGNvbGxlY3RpYmxlLnNjb3JlVmFsdWUgPSByYW5kb21Db25maWcuc2NvcmVWYWx1ZTtcclxuICAgICAgICBjb2xsZWN0aWJsZS53aWR0aCA9IHJhbmRvbUNvbmZpZy53aWR0aDtcclxuICAgICAgICBjb2xsZWN0aWJsZS5oZWlnaHQgPSByYW5kb21Db25maWcuaGVpZ2h0O1xyXG5cclxuICAgICAgICAvLyBQb3NpdGlvbiBjb2xsZWN0aWJsZSBhYm92ZSB0aGUgb2JzdGFjbGUgb3IgcmFuZG9tbHkgaW4gdGhlIGFpclxyXG4gICAgICAgIGNvbnN0IGNvbGxlY3RpYmxlWSA9IHRoaXMuY29uZmlnLmdyb3VuZC55IC1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICh0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduT2Zmc2V0TWluICsgTWF0aC5yYW5kb20oKSAqICh0aGlzLmNvbmZpZy5nYW1lcGxheS5jb2xsZWN0aWJsZVNwYXduT2Zmc2V0TWF4IC0gdGhpcy5jb25maWcuZ2FtZXBsYXkuY29sbGVjdGlibGVTcGF3bk9mZnNldE1pbikpO1xyXG4gICAgICAgIGNvbnN0IGNvbGxlY3RpYmxlWCA9IGFzc29jaWF0ZWRPYnN0YWNsZS54ICsgYXNzb2NpYXRlZE9ic3RhY2xlLndpZHRoIC8gMiAtIGNvbGxlY3RpYmxlLndpZHRoIC8gMjsgLy8gQ2VudGVyIGFib3ZlIG9ic3RhY2xlXHJcblxyXG4gICAgICAgIGNvbGxlY3RpYmxlLnJlc2V0KGNvbGxlY3RpYmxlWCwgY29sbGVjdGlibGVZKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVPdmVyKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIHRoaXMuc3RvcEJHTSgpO1xyXG4gICAgICAgIHRoaXMucGxheVNvdW5kKCdzZnhfZ2FtZV9vdmVyJyk7XHJcbiAgICAgICAgdGhpcy5zYXZlSGlnaFNjb3JlKE1hdGguZmxvb3IodGhpcy5zY29yZSkpO1xyXG4gICAgICAgIHRoaXMuZ2FtZVBhdXNlZCA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5pc1dhaXRpbmdGb3JJbnB1dCA9IHRydWU7IC8vIEFsbG93IGlucHV0IHRvIHJlc3RhcnQvZ28gdG8gdGl0bGVcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnBsYXllci5yZXNldCgpO1xyXG4gICAgICAgIHRoaXMuZ2FtZVNwZWVkID0gdGhpcy5jb25maWcuZ2FtZXBsYXkuaW5pdGlhbEdhbWVTcGVlZDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRTcGVlZCA9IHRoaXMuZ2FtZVNwZWVkO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuc2NvcmVEaXNwbGF5ID0gMDtcclxuXHJcbiAgICAgICAgLy8gRGVhY3RpdmF0ZSBhbGwgb2JzdGFjbGVzIGFuZCBjb2xsZWN0aWJsZXNcclxuICAgICAgICB0aGlzLm9ic3RhY2xlcy5mb3JFYWNoKG8gPT4gby5hY3RpdmUgPSBmYWxzZSk7XHJcbiAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMuZm9yRWFjaChjID0+IGMuYWN0aXZlID0gZmFsc2UpO1xyXG5cclxuICAgICAgICB0aGlzLnJlc2V0U3Bhd25UaW1lcnMoKTtcclxuICAgICAgICB0aGlzLmdhbWVQYXVzZWQgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmlzV2FpdGluZ0ZvcklucHV0ID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5wbGF5QkdNKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0U291bmQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNvdW5kSW5zdGFuY2UgPSBhdWRpby5jbG9uZU5vZGUodHJ1ZSkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgc291bmRJbnN0YW5jZS5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgc291bmRJbnN0YW5jZS52b2x1bWUgPSBhdWRpby52b2x1bWU7XHJcbiAgICAgICAgICAgIHNvdW5kSW5zdGFuY2UucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBBdWRpbyBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06ICR7ZX1gKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGxheUJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21CdWZmZXIgJiYgdGhpcy5hdWRpb0NvbnRleHQuc3RhdGUgPT09ICdzdXNwZW5kZWQnKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYXVkaW9Db250ZXh0LnJlc3VtZSgpLnRoZW4oKCkgPT4gdGhpcy5fc3RhcnRCR00oKSk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmJnbUJ1ZmZlcikge1xyXG4gICAgICAgICAgICB0aGlzLl9zdGFydEJHTSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIF9zdGFydEJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21Tb3VyY2UpIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VyY2Uuc3RvcCgpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdXJjZS5kaXNjb25uZWN0KCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291cmNlID0gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYmdtU291cmNlID0gdGhpcy5hdWRpb0NvbnRleHQuY3JlYXRlQnVmZmVyU291cmNlKCk7XHJcbiAgICAgICAgdGhpcy5iZ21Tb3VyY2UuYnVmZmVyID0gdGhpcy5iZ21CdWZmZXI7XHJcbiAgICAgICAgdGhpcy5iZ21Tb3VyY2UubG9vcCA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5iZ21Tb3VyY2UuY29ubmVjdCh0aGlzLmJnbUdhaW5Ob2RlKTtcclxuICAgICAgICB0aGlzLmJnbVNvdXJjZS5zdGFydCgwKTtcclxuICAgICAgICB0aGlzLmJnbUdhaW5Ob2RlLmdhaW4udmFsdWUgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lIHx8IDAuNTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0b3BCR00oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtU291cmNlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291cmNlLnN0b3AoKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VyY2UuZGlzY29ubmVjdCgpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdXJjZSA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEhpZ2hTY29yZXMoKTogdm9pZCB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3Qgc3RvcmVkU2NvcmVzID0gbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2Nvb2tpZVJ1bm5lckhpZ2hTY29yZXMnKTtcclxuICAgICAgICAgICAgdGhpcy5oaWdoU2NvcmVzID0gc3RvcmVkU2NvcmVzID8gSlNPTi5wYXJzZShzdG9yZWRTY29yZXMpIDogW107XHJcbiAgICAgICAgICAgIHRoaXMuaGlnaFNjb3Jlcy5zb3J0KChhLCBiKSA9PiBiLnNjb3JlIC0gYS5zY29yZSk7IC8vIFNvcnQgZGVzY2VuZGluZ1xyXG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGhpZ2ggc2NvcmVzOlwiLCBlKTtcclxuICAgICAgICAgICAgdGhpcy5oaWdoU2NvcmVzID0gW107XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2F2ZUhpZ2hTY29yZShuZXdTY29yZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcclxuICAgICAgICBjb25zdCBzY29yZUVudHJ5ID0ge1xyXG4gICAgICAgICAgICBzY29yZTogbmV3U2NvcmUsXHJcbiAgICAgICAgICAgIGRhdGU6IGAke25vdy5nZXRGdWxsWWVhcigpfS0keyhub3cuZ2V0TW9udGgoKSArIDEpLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX0tJHtub3cuZ2V0RGF0ZSgpLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX1gXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgdGhpcy5oaWdoU2NvcmVzLnB1c2goc2NvcmVFbnRyeSk7XHJcbiAgICAgICAgdGhpcy5oaWdoU2NvcmVzLnNvcnQoKGEsIGIpID0+IGIuc2NvcmUgLSBhLnNjb3JlKTtcclxuICAgICAgICB0aGlzLmhpZ2hTY29yZXMgPSB0aGlzLmhpZ2hTY29yZXMuc2xpY2UoMCwgNSk7IC8vIEtlZXAgdG9wIDUgc2NvcmVzXHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjb29raWVSdW5uZXJIaWdoU2NvcmVzJywgSlNPTi5zdHJpbmdpZnkodGhpcy5oaWdoU2NvcmVzKSk7XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNhdmUgaGlnaCBzY29yZXM6XCIsIGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdIaWdoU2NvcmVzKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI0cHggJHt0aGlzLmNvbmZpZy51aS5mb250LnNwbGl0KCcgJylbMV0gfHwgJ0FyaWFsJ31gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdcdUNENUNcdUFDRTAgXHVDODEwXHVDMjE4JywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMzApO1xyXG5cclxuICAgICAgICB0aGlzLmhpZ2hTY29yZXMuZm9yRWFjaCgoZW50cnksIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke2luZGV4ICsgMX0uICR7ZW50cnkuc2NvcmV9ICgke2VudHJ5LmRhdGV9KWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDYwICsgaW5kZXggKiAzMCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3RXJyb3JTY3JlZW4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZWQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczMHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnXHVDNjI0XHVCOTU4IFx1QkMxQ1x1QzBERCEnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobWVzc2FnZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gRW5zdXJlIHRoZSBnYW1lIHN0YXJ0cyB3aGVuIHRoZSBET00gaXMgcmVhZHlcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGluaXRpYWxpemUgZ2FtZTpcIiwgZSk7XHJcbiAgICAgICAgY29uc3QgZXJyb3JEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgIGVycm9yRGl2LnN0eWxlLnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIGVycm9yRGl2LnN0eWxlLm1hcmdpblRvcCA9ICc1MHB4JztcclxuICAgICAgICBlcnJvckRpdi5pbm5lclRleHQgPSBgXHVBQzhDXHVDNzg0IFx1Q0QwOFx1QUUzMFx1RDY1NCBcdUM5MTEgXHVDNjI0XHVCOTU4IFx1QkMxQ1x1QzBERDogJHtlLm1lc3NhZ2V9LiBcdUNGNThcdUMxOTRcdUM3NDQgXHVENjU1XHVDNzc4XHVENTc0XHVDOEZDXHVDMTM4XHVDNjk0LmA7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICB9XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUF5R0EsU0FBUyxlQUFlLE9BQWEsT0FBc0I7QUFDdkQsU0FBTyxNQUFNLElBQUksTUFBTSxJQUFJLE1BQU0sU0FDMUIsTUFBTSxJQUFJLE1BQU0sUUFBUSxNQUFNLEtBQzlCLE1BQU0sSUFBSSxNQUFNLElBQUksTUFBTSxVQUMxQixNQUFNLElBQUksTUFBTSxT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
