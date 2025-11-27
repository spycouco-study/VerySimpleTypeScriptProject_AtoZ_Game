var PlayerState = /* @__PURE__ */ ((PlayerState2) => {
  PlayerState2[PlayerState2["RUNNING"] = 0] = "RUNNING";
  PlayerState2[PlayerState2["JUMPING"] = 1] = "JUMPING";
  PlayerState2[PlayerState2["SLIDING"] = 2] = "SLIDING";
  return PlayerState2;
})(PlayerState || {});
class GameObject {
  constructor(x, y, width, height, image) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.image = image;
  }
  draw(ctx) {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
  }
  // Basic collision detection (Axis-Aligned Bounding Box)
  intersects(other) {
    return this.x < other.x + other.width && this.x + this.width > other.x && this.y < other.y + other.height && this.y + this.height > other.y;
  }
}
class InputHandler {
  constructor(canvas) {
    this.keys = /* @__PURE__ */ new Map();
    this.keysPressedThisFrame = /* @__PURE__ */ new Set();
    this.mouseClickedThisFrame = false;
    this.isMouseDown = false;
    window.addEventListener("keydown", (e) => {
      this.keys.set(e.code, true);
      this.keysPressedThisFrame.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      this.keys.set(e.code, false);
    });
    canvas.addEventListener("mousedown", () => {
      this.isMouseDown = true;
      this.mouseClickedThisFrame = true;
    });
    canvas.addEventListener("mouseup", () => {
      this.isMouseDown = false;
    });
    canvas.addEventListener("touchstart", (e) => {
      this.isMouseDown = true;
      this.mouseClickedThisFrame = true;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("touchend", () => {
      this.isMouseDown = false;
    });
  }
  isKeyDown(code) {
    return this.keys.get(code) || false;
  }
  wasKeyPressedThisFrame(code) {
    return this.keysPressedThisFrame.has(code);
  }
  wasClickedThisFrame() {
    return this.mouseClickedThisFrame;
  }
  resetFrameState() {
    this.keysPressedThisFrame.clear();
    this.mouseClickedThisFrame = false;
  }
}
class AssetManager {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.loadedAssets = 0;
    this.totalAssets = 0;
    this.activeLoopingSounds = /* @__PURE__ */ new Map();
  }
  // Track active looping sounds
  async loadAssets(assetsData) {
    this.totalAssets = assetsData.images.length + assetsData.sounds.length;
    this.loadedAssets = 0;
    const imagePromises = assetsData.images.map((img) => this.loadImage(img));
    const soundPromises = assetsData.sounds.map((snd) => this.loadSound(snd));
    await Promise.allSettled([...imagePromises, ...soundPromises]);
    console.log("All assets loading attempts completed.");
  }
  loadImage(data) {
    return new Promise((resolve, reject) => {
      const img = new Image(data.width, data.height);
      img.src = data.path;
      img.onload = () => {
        this.images.set(data.name, img);
        this.loadedAssets++;
        resolve();
      };
      img.onerror = (e) => {
        console.error(`Failed to load image: ${data.path}`, e);
        reject(e);
      };
    });
  }
  loadSound(data) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(data.path);
      audio.volume = data.volume;
      audio.preload = "auto";
      audio.oncanplaythrough = () => {
        this.sounds.set(data.name, audio);
        this.loadedAssets++;
        resolve();
      };
      audio.onerror = (e) => {
        console.error(`Failed to load sound: ${data.path}`, e);
        reject(e);
      };
      audio.load();
    });
  }
  getImage(name) {
    return this.images.get(name);
  }
  playSound(name, loop = false) {
    const audioTemplate = this.sounds.get(name);
    if (audioTemplate) {
      if (loop) {
        this.stopSound(name);
        const clonedAudio = audioTemplate.cloneNode(true);
        clonedAudio.loop = true;
        clonedAudio.volume = audioTemplate.volume;
        clonedAudio.play().catch((e) => console.warn(`Error playing looping sound ${name}:`, e));
        this.activeLoopingSounds.set(name, clonedAudio);
      } else {
        const clonedAudio = audioTemplate.cloneNode();
        clonedAudio.volume = audioTemplate.volume;
        clonedAudio.play().catch((e) => console.warn(`Error playing sound ${name}:`, e));
      }
    } else {
      console.warn(`Sound not found: ${name}`);
    }
  }
  stopSound(name) {
    const activeAudio = this.activeLoopingSounds.get(name);
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      this.activeLoopingSounds.delete(name);
    }
  }
  getLoadingProgress() {
    return this.totalAssets > 0 ? this.loadedAssets / this.totalAssets : 0;
  }
}
class Player extends GameObject {
  constructor(x, y, width, height, runImageNames, jumpImageName, slideImageName, gameSettings, inputHandler, assetManager) {
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
    this.effectiveGroundedTopY = y;
    this.gameSettings = gameSettings;
    this.inputHandler = inputHandler;
    this.assetManager = assetManager;
    this.health = this.gameSettings.player.maxHealth;
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
    if (this.y >= this.effectiveGroundedTopY) {
      this.y = this.effectiveGroundedTopY;
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
      this.y = this.effectiveGroundedTopY + this.originalHeight * 0.5;
      this.height = this.originalHeight * 0.5;
      this.assetManager.playSound("sfx_slide", false);
    }
  }
  stopSlide() {
    if (this.isSliding) {
      this.isSliding = false;
      this.y = this.effectiveGroundedTopY;
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
      this.assetManager.playSound("sfx_hit", false);
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
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["GAME"] = 2] = "GAME";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class Obstacle extends GameObject {
  constructor(x, y, width, height, image, gameSpeed) {
    super(x, y, width, height, image);
    this.gameSpeed = gameSpeed;
  }
  update(deltaTime) {
    this.x -= this.gameSpeed * deltaTime;
  }
}
class Collectible extends GameObject {
  constructor(x, y, width, height, image, gameSpeed, scoreValue) {
    super(x, y, width, height, image);
    this.collected = false;
    this.gameSpeed = gameSpeed;
    this.scoreValue = scoreValue;
  }
  update(deltaTime) {
    this.x -= this.gameSpeed * deltaTime;
  }
}
class BackgroundLayer {
  constructor(image, y, width, height, speedMultiplier) {
    this.x = 0;
    this.image = image;
    this.x = 0;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speedMultiplier = speedMultiplier;
  }
  update(deltaTime, gameSpeed) {
    this.x -= gameSpeed * this.speedMultiplier * deltaTime;
    if (this.x <= -this.width) {
      this.x = 0;
    }
  }
  draw(ctx) {
    ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    ctx.drawImage(this.image, this.x + this.width, this.y, this.width, this.height);
  }
}
class Game {
  constructor(canvasId) {
    this.lastTime = 0;
    this.animationFrameId = 0;
    this.gameState = 0 /* LOADING */;
    this.backgrounds = [];
    this.obstacles = [];
    this.collectibles = [];
    this.obstacleSpawnTimer = 0;
    this.collectibleSpawnTimer = 0;
    this.gameLoop = (currentTime) => {
      this.animationFrameId = requestAnimationFrame(this.gameLoop);
      const deltaTime = (currentTime - this.lastTime) / 1e3;
      this.lastTime = currentTime;
      if (deltaTime > 0.1) {
        this.inputHandler.resetFrameState();
        return;
      }
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      switch (this.gameState) {
        case 0 /* LOADING */:
          this.drawLoadingScreen();
          break;
        case 1 /* TITLE */:
          this.drawTitleScreen();
          if (this.inputHandler.wasKeyPressedThisFrame("Space") || this.inputHandler.wasClickedThisFrame()) {
            this.gameState = 2 /* GAME */;
            this.resetGame();
          }
          break;
        case 2 /* GAME */:
          this.updateGame(deltaTime);
          this.drawGame();
          if (this.player.health <= 0) {
            this.gameState = 3 /* GAME_OVER */;
            this.assetManager.stopSound("bgm_game");
            this.assetManager.playSound("sfx_game_over", false);
          }
          break;
        case 3 /* GAME_OVER */:
          this.drawGameOverScreen();
          if (this.inputHandler.wasKeyPressedThisFrame("Space") || this.inputHandler.wasClickedThisFrame()) {
            this.gameState = 1 /* TITLE */;
            this.assetManager.playSound("bgm_title", true);
          }
          break;
      }
      this.inputHandler.resetFrameState();
    };
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.assetManager = new AssetManager();
    this.inputHandler = new InputHandler(this.canvas);
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.loadGameDataAndStart();
  }
  async loadGameDataAndStart() {
    try {
      const response = await fetch("data.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.gameData = await response.json();
      this.gameSettings = this.gameData.gameSettings;
      this.canvas.width = this.gameSettings.canvasWidth;
      this.canvas.height = this.gameSettings.canvasHeight;
      await this.assetManager.loadAssets(this.gameData.assets);
      this.gameState = 1 /* TITLE */;
      console.log("Game ready, showing title screen.");
      this.assetManager.playSound("bgm_title", true);
      this.gameLoop(0);
    } catch (error) {
      console.error("Failed to load game data or assets:", error);
      this.ctx.fillStyle = "red";
      this.ctx.font = "30px Arial";
      this.ctx.fillText("ERROR: Failed to load game data or assets.", 50, this.canvas.height / 2);
    }
  }
  resetGame() {
    this.obstacles = [];
    this.collectibles = [];
    this.obstacleSpawnTimer = 0;
    this.collectibleSpawnTimer = 0;
    const playerSettings = this.gameSettings.player;
    const groundSettings = this.gameSettings.ground;
    const visualGroundTopY = this.canvas.height * (1 - groundSettings.height - groundSettings.yOffset);
    const playerGroundedY = visualGroundTopY - playerSettings.height + playerSettings.groundOffsetY;
    this.player = new Player(
      this.gameSettings.canvasWidth * 0.1,
      playerGroundedY,
      // Pass the already calculated effective grounded Y
      playerSettings.width,
      playerSettings.height,
      playerSettings.runAnimationFrames,
      "cookie_jump",
      "cookie_slide",
      this.gameSettings,
      this.inputHandler,
      this.assetManager
    );
    this.player.score = 0;
    this.backgrounds = this.gameSettings.backgrounds.map((bg) => {
      const image = this.assetManager.getImage(bg.name);
      return new BackgroundLayer(
        image,
        this.canvas.height * bg.yOffset,
        this.canvas.width,
        this.canvas.height * bg.height,
        bg.speedMultiplier
      );
    });
    const groundImage = this.assetManager.getImage(groundSettings.name);
    this.ground = new BackgroundLayer(
      groundImage,
      visualGroundTopY,
      // Ground starts at visualGroundTopY
      this.canvas.width,
      this.canvas.height * groundSettings.height,
      1
    );
    this.assetManager.stopSound("bgm_title");
    this.assetManager.stopSound("sfx_game_over");
    this.assetManager.playSound("bgm_game", true);
  }
  updateGame(deltaTime) {
    this.player.update(deltaTime, this.gameSettings.gameSpeed);
    this.backgrounds.forEach((bg) => bg.update(deltaTime, this.gameSettings.gameSpeed));
    this.ground.update(deltaTime, this.gameSettings.gameSpeed);
    this.obstacleSpawnTimer -= deltaTime;
    if (this.obstacleSpawnTimer <= 0) {
      this.spawnObstacle();
      this.obstacleSpawnTimer = Math.random() * (this.gameSettings.obstacle.maxSpawnInterval - this.gameSettings.obstacle.minSpawnInterval) + this.gameSettings.obstacle.minSpawnInterval;
    }
    this.collectibleSpawnTimer -= deltaTime;
    if (this.collectibleSpawnTimer <= 0) {
      this.spawnCollectible();
      this.collectibleSpawnTimer = Math.random() * (this.gameSettings.collectible.maxSpawnInterval - this.gameSettings.collectible.minSpawnInterval) + this.gameSettings.collectible.minSpawnInterval;
    }
    this.obstacles = this.obstacles.filter((obstacle) => {
      obstacle.update(deltaTime);
      if (this.player.intersects(obstacle) && !this.player.isInvincible()) {
        this.player.takeDamage(1);
        return false;
      }
      return obstacle.x + obstacle.width > 0;
    });
    this.collectibles = this.collectibles.filter((collectible) => {
      collectible.update(deltaTime);
      if (this.player.intersects(collectible) && !collectible.collected) {
        collectible.collected = true;
        this.player.addScore(collectible.scoreValue);
        this.assetManager.playSound("sfx_collect", false);
        return false;
      }
      return collectible.x + collectible.width > 0;
    });
  }
  spawnObstacle() {
    const obstacleSettings = this.gameSettings.obstacle;
    const obstacleImage = this.assetManager.getImage("obstacle_spike");
    const visualGroundTopY = this.canvas.height * (1 - this.gameSettings.ground.height - this.gameSettings.ground.yOffset);
    const obstacleY = visualGroundTopY - obstacleSettings.height;
    this.obstacles.push(new Obstacle(
      this.canvas.width,
      obstacleY,
      obstacleSettings.width,
      obstacleSettings.height,
      obstacleImage,
      this.gameSettings.gameSpeed * obstacleSettings.speedMultiplier
    ));
  }
  spawnCollectible() {
    const collectibleSettings = this.gameSettings.collectible;
    const collectibleImage = this.assetManager.getImage("jelly_basic");
    const visualGroundTopY = this.canvas.height * (1 - this.gameSettings.ground.height - this.gameSettings.ground.yOffset);
    const minHeightOffset = this.player.originalHeight * 0.5;
    const maxHeightOffset = this.player.originalHeight * 1.5;
    const playerGroundedBottomY = visualGroundTopY + this.gameSettings.player.groundOffsetY;
    const minCollectibleY = playerGroundedBottomY - minHeightOffset - collectibleSettings.height;
    const maxCollectibleY = playerGroundedBottomY - maxHeightOffset - collectibleSettings.height;
    const collectibleY = Math.random() * (maxCollectibleY - minCollectibleY) + minCollectibleY;
    this.collectibles.push(new Collectible(
      this.canvas.width,
      collectibleY,
      collectibleSettings.width,
      collectibleSettings.height,
      collectibleImage,
      this.gameSettings.gameSpeed * collectibleSettings.speedMultiplier,
      collectibleSettings.scoreValue
    ));
  }
  drawGame() {
    this.backgrounds.forEach((bg) => bg.draw(this.ctx));
    this.ground.draw(this.ctx);
    this.player.draw(this.ctx);
    this.obstacles.forEach((obstacle) => obstacle.draw(this.ctx));
    this.collectibles.forEach((collectible) => collectible.draw(this.ctx));
    this.drawUI();
  }
  drawUI() {
    this.ctx.font = `${this.gameSettings.ui.scoreFontSize}px Arial`;
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`Score: ${this.player.score}`, 20, 40);
    const barX = 20;
    const barY = 60;
    const barWidth = this.gameSettings.ui.healthBarWidth;
    const barHeight = this.gameSettings.ui.healthBarHeight;
    const maxHealth = this.gameSettings.player.maxHealth;
    const currentHealth = this.player.health;
    this.ctx.fillStyle = "gray";
    this.ctx.fillRect(barX, barY, barWidth, barHeight);
    this.ctx.fillStyle = "red";
    this.ctx.fillRect(barX, barY, currentHealth / maxHealth * barWidth, barHeight);
    this.ctx.strokeStyle = "white";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(barX, barY, barWidth, barHeight);
  }
  drawLoadingScreen() {
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.font = "40px Arial";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Loading Assets...", this.canvas.width / 2, this.canvas.height / 2 - 20);
    const progress = this.assetManager.getLoadingProgress();
    this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 30);
  }
  drawTitleScreen() {
    const titleImage = this.assetManager.getImage("title_background");
    if (titleImage) {
      this.ctx.drawImage(titleImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "black";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.font = "60px Arial";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Cookie Run Clone", this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "30px Arial";
    this.ctx.fillText("Press SPACE or Click to Start", this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  drawGameOverScreen() {
    const gameOverImage = this.assetManager.getImage("game_over_background");
    if (gameOverImage) {
      this.ctx.drawImage(gameOverImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.font = "80px Arial";
    this.ctx.fillStyle = "red";
    this.ctx.textAlign = "center";
    this.ctx.fillText("GAME OVER", this.canvas.width / 2, this.canvas.height / 2 - 80);
    this.ctx.font = "40px Arial";
    this.ctx.fillStyle = "white";
    this.ctx.fillText(`Final Score: ${this.player.score}`, this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.font = "30px Arial";
    this.ctx.fillText("Press SPACE or Click for Title", this.canvas.width / 2, this.canvas.height / 2 + 80);
  }
}
window.onload = () => {
  new Game("gameCanvas");
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZW51bSBQbGF5ZXJTdGF0ZSB7XHJcbiAgICBSVU5OSU5HLFxyXG4gICAgSlVNUElORyxcclxuICAgIFNMSURJTkcsXHJcbn1cclxuXHJcbmNsYXNzIEdhbWVPYmplY3Qge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZTogSFRNTEltYWdlRWxlbWVudCkge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IGltYWdlO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQmFzaWMgY29sbGlzaW9uIGRldGVjdGlvbiAoQXhpcy1BbGlnbmVkIEJvdW5kaW5nIEJveClcclxuICAgIGludGVyc2VjdHMob3RoZXI6IEdhbWVPYmplY3QpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy54IDwgb3RoZXIueCArIG90aGVyLndpZHRoICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueCArIHRoaXMud2lkdGggPiBvdGhlci54ICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueSA8IG90aGVyLnkgKyBvdGhlci5oZWlnaHQgJiZcclxuICAgICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgPiBvdGhlci55O1xyXG4gICAgfVxyXG59XHJcblxyXG5pbnRlcmZhY2UgUGxheWVyU2V0dGluZ3Mge1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAganVtcEZvcmNlOiBudW1iZXI7XHJcbiAgICBzbGlkZUR1cmF0aW9uOiBudW1iZXI7XHJcbiAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgIGhpdEludmluY2liaWxpdHlEdXJhdGlvbjogbnVtYmVyO1xyXG4gICAgZ3JvdW5kT2Zmc2V0WTogbnVtYmVyO1xyXG4gICAgbWF4SnVtcHM6IG51bWJlcjtcclxuICAgIHJ1bkFuaW1hdGlvblNwZWVkOiBudW1iZXI7XHJcbiAgICBydW5BbmltYXRpb25GcmFtZXM6IHN0cmluZ1tdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgT2JzdGFjbGVTZXR0aW5ncyB7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBtaW5TcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICBtYXhTcGF3bkludGVydmFsOiBudW1iZXI7XHJcbiAgICBzcGVlZE11bHRpcGxpZXI6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIENvbGxlY3RpYmxlU2V0dGluZ3Mge1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgbWluU3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgbWF4U3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG4gICAgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBCYWNrZ3JvdW5kTGF5ZXJTZXR0aW5ncyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBzcGVlZE11bHRpcGxpZXI6IG51bWJlcjtcclxuICAgIHlPZmZzZXQ6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR3JvdW5kU2V0dGluZ3Mge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB5T2Zmc2V0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBVSVNldHRpbmdzIHtcclxuICAgIHNjb3JlRm9udFNpemU6IG51bWJlcjtcclxuICAgIGhlYWx0aEJhcldpZHRoOiBudW1iZXI7XHJcbiAgICBoZWFsdGhCYXJIZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBnYW1lU3BlZWQ6IG51bWJlcjtcclxuICAgIGdyYXZpdHk6IG51bWJlcjtcclxuICAgIHBsYXllcjogUGxheWVyU2V0dGluZ3M7XHJcbiAgICBvYnN0YWNsZTogT2JzdGFjbGVTZXR0aW5ncztcclxuICAgIGNvbGxlY3RpYmxlOiBDb2xsZWN0aWJsZVNldHRpbmdzO1xyXG4gICAgYmFja2dyb3VuZHM6IEJhY2tncm91bmRMYXllclNldHRpbmdzW107XHJcbiAgICBncm91bmQ6IEdyb3VuZFNldHRpbmdzO1xyXG4gICAgdWk6IFVJU2V0dGluZ3M7XHJcbn1cclxuXHJcbmludGVyZmFjZSBJbWFnZURhdGEge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmREYXRhIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXNzZXRzRGF0YSB7XHJcbiAgICBpbWFnZXM6IEltYWdlRGF0YVtdO1xyXG4gICAgc291bmRzOiBTb3VuZERhdGFbXTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgYXNzZXRzOiBBc3NldHNEYXRhO1xyXG59XHJcblxyXG5jbGFzcyBJbnB1dEhhbmRsZXIge1xyXG4gICAgcHJpdmF0ZSBrZXlzOiBNYXA8c3RyaW5nLCBib29sZWFuPiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUga2V5c1ByZXNzZWRUaGlzRnJhbWU6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xyXG4gICAgcHJpdmF0ZSBtb3VzZUNsaWNrZWRUaGlzRnJhbWU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgaXNNb3VzZURvd246IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50KSB7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHtcclxuICAgICAgICAgICAgdGhpcy5rZXlzLnNldChlLmNvZGUsIHRydWUpO1xyXG4gICAgICAgICAgICB0aGlzLmtleXNQcmVzc2VkVGhpc0ZyYW1lLmFkZChlLmNvZGUpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIGUgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmtleXMuc2V0KGUuY29kZSwgZmFsc2UpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNNb3VzZURvd24gPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLm1vdXNlQ2xpY2tlZFRoaXNGcmFtZSA9IHRydWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNNb3VzZURvd24gPSBmYWxzZTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNNb3VzZURvd24gPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLm1vdXNlQ2xpY2tlZFRoaXNGcmFtZSA9IHRydWU7XHJcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBzY3JvbGxpbmcgb24gbW9iaWxlXHJcbiAgICAgICAgfSwgeyBwYXNzaXZlOiBmYWxzZSB9KTtcclxuICAgICAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNNb3VzZURvd24gPSBmYWxzZTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBpc0tleURvd24oY29kZTogc3RyaW5nKTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMua2V5cy5nZXQoY29kZSkgfHwgZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgd2FzS2V5UHJlc3NlZFRoaXNGcmFtZShjb2RlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5rZXlzUHJlc3NlZFRoaXNGcmFtZS5oYXMoY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgd2FzQ2xpY2tlZFRoaXNGcmFtZSgpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5tb3VzZUNsaWNrZWRUaGlzRnJhbWU7XHJcbiAgICB9XHJcblxyXG4gICAgcmVzZXRGcmFtZVN0YXRlKCkge1xyXG4gICAgICAgIHRoaXMua2V5c1ByZXNzZWRUaGlzRnJhbWUuY2xlYXIoKTtcclxuICAgICAgICB0aGlzLm1vdXNlQ2xpY2tlZFRoaXNGcmFtZSA9IGZhbHNlO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBBc3NldE1hbmFnZXIge1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRBc3NldHM6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBhY3RpdmVMb29waW5nU291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTsgLy8gVHJhY2sgYWN0aXZlIGxvb3Bpbmcgc291bmRzXHJcblxyXG4gICAgYXN5bmMgbG9hZEFzc2V0cyhhc3NldHNEYXRhOiBBc3NldHNEYXRhKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGFzc2V0c0RhdGEuaW1hZ2VzLmxlbmd0aCArIGFzc2V0c0RhdGEuc291bmRzLmxlbmd0aDtcclxuICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cyA9IDA7XHJcblxyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBhc3NldHNEYXRhLmltYWdlcy5tYXAoaW1nID0+IHRoaXMubG9hZEltYWdlKGltZykpO1xyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSBhc3NldHNEYXRhLnNvdW5kcy5tYXAoc25kID0+IHRoaXMubG9hZFNvdW5kKHNuZCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTsgLy8gVXNlIFByb21pc2UuYWxsU2V0dGxlZCB0byBjb250aW51ZSBpZiBzb21lIGZhaWxcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkFsbCBhc3NldHMgbG9hZGluZyBhdHRlbXB0cyBjb21wbGV0ZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKGRhdGE6IEltYWdlRGF0YSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZShkYXRhLndpZHRoLCBkYXRhLmhlaWdodCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBkYXRhLnBhdGg7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoZGF0YS5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7ZGF0YS5wYXRofWAsIGUpO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGUpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKGRhdGE6IFNvdW5kRGF0YSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKGRhdGEucGF0aCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGRhdGEudm9sdW1lO1xyXG4gICAgICAgICAgICBhdWRpby5wcmVsb2FkID0gJ2F1dG8nO1xyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGRhdGEubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9IChlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtkYXRhLnBhdGh9YCwgZSk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QoZSk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGF1ZGlvLmxvYWQoKTsgLy8gU3RhcnQgbG9hZGluZyB0aGUgYXVkaW9cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSkge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvVGVtcGxhdGUgPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvVGVtcGxhdGUpIHtcclxuICAgICAgICAgICAgaWYgKGxvb3ApIHtcclxuICAgICAgICAgICAgICAgIC8vIFN0b3AgYW55IGV4aXN0aW5nIGluc3RhbmNlIG9mIHRoaXMgc3BlY2lmaWMgbG9vcGluZyBzb3VuZCBmaXJzdFxyXG4gICAgICAgICAgICAgICAgdGhpcy5zdG9wU291bmQobmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgY2xvbmVkQXVkaW8gPSBhdWRpb1RlbXBsYXRlLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgY2xvbmVkQXVkaW8ubG9vcCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBjbG9uZWRBdWRpby52b2x1bWUgPSBhdWRpb1RlbXBsYXRlLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGNsb25lZEF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgRXJyb3IgcGxheWluZyBsb29waW5nIHNvdW5kICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVMb29waW5nU291bmRzLnNldChuYW1lLCBjbG9uZWRBdWRpbyk7IC8vIFN0b3JlIHRoZSBhY3RpdmUgbG9vcGluZyBpbnN0YW5jZVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gRm9yIG9uZS1zaG90IHNvdW5kcywganVzdCBjbG9uZSBhbmQgcGxheTsgbm8gbmVlZCB0byB0cmFja1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY2xvbmVkQXVkaW8gPSBhdWRpb1RlbXBsYXRlLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBjbG9uZWRBdWRpby52b2x1bWUgPSBhdWRpb1RlbXBsYXRlLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGNsb25lZEF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgRXJyb3IgcGxheWluZyBzb3VuZCAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgU291bmQgbm90IGZvdW5kOiAke25hbWV9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0b3BTb3VuZChuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICAvLyBTdG9wIGN1cnJlbnRseSBhY3RpdmUgbG9vcGluZyBzb3VuZCBieSBuYW1lXHJcbiAgICAgICAgY29uc3QgYWN0aXZlQXVkaW8gPSB0aGlzLmFjdGl2ZUxvb3BpbmdTb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgICAgIGlmIChhY3RpdmVBdWRpbykge1xyXG4gICAgICAgICAgICBhY3RpdmVBdWRpby5wYXVzZSgpO1xyXG4gICAgICAgICAgICBhY3RpdmVBdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlTG9vcGluZ1NvdW5kcy5kZWxldGUobmFtZSk7IC8vIFJlbW92ZSBmcm9tIGFjdGl2ZSBsaXN0XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldExvYWRpbmdQcm9ncmVzcygpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRvdGFsQXNzZXRzID4gMCA/IHRoaXMubG9hZGVkQXNzZXRzIC8gdGhpcy50b3RhbEFzc2V0cyA6IDA7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIFBsYXllciBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgcHJpdmF0ZSBnYW1lU2V0dGluZ3M6IEdhbWVTZXR0aW5ncztcclxuICAgIHByaXZhdGUgaW5wdXRIYW5kbGVyOiBJbnB1dEhhbmRsZXI7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyO1xyXG5cclxuICAgIHByaXZhdGUgdmVsb2NpdHlZOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBpc09uR3JvdW5kOiBib29sZWFuID0gdHJ1ZTtcclxuICAgIHByaXZhdGUganVtcHNSZW1haW5pbmc6IG51bWJlcjtcclxuICAgIHByaXZhdGUgcGxheWVyU3RhdGU6IFBsYXllclN0YXRlID0gUGxheWVyU3RhdGUuUlVOTklORztcclxuXHJcbiAgICBwcml2YXRlIHJ1bkFuaW1hdGlvbkZyYW1lczogSFRNTEltYWdlRWxlbWVudFtdID0gW107XHJcbiAgICBwcml2YXRlIGN1cnJlbnRSdW5GcmFtZUluZGV4OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBhbmltYXRpb25UaW1lcjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY3VycmVudEltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG5cclxuICAgIHByaXZhdGUganVtcEltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBzbGlkZUltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG5cclxuICAgIHByaXZhdGUgaXNTbGlkaW5nOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIHNsaWRlVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG9yaWdpbmFsSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBwcml2YXRlIGVmZmVjdGl2ZUdyb3VuZGVkVG9wWTogbnVtYmVyOyAvLyBUaGUgYWN0dWFsIFkgY29vcmRpbmF0ZSBmb3IgdGhlIHRvcCBvZiB0aGUgcGxheWVyIHdoZW4gZ3JvdW5kZWQuXHJcblxyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgaW52aW5jaWJpbGl0eVRpbWVyOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgLy8geSBpcyBub3cgdGhlIGVmZmVjdGl2ZSBncm91bmRlZCB5XHJcbiAgICAgICAgICAgICAgICBydW5JbWFnZU5hbWVzOiBzdHJpbmdbXSxcclxuICAgICAgICAgICAgICAgIGp1bXBJbWFnZU5hbWU6IHN0cmluZyxcclxuICAgICAgICAgICAgICAgIHNsaWRlSW1hZ2VOYW1lOiBzdHJpbmcsXHJcbiAgICAgICAgICAgICAgICBnYW1lU2V0dGluZ3M6IEdhbWVTZXR0aW5ncyxcclxuICAgICAgICAgICAgICAgIGlucHV0SGFuZGxlcjogSW5wdXRIYW5kbGVyLFxyXG4gICAgICAgICAgICAgICAgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIpIHtcclxuICAgICAgICBjb25zdCBpbml0aWFsSW1hZ2UgPSBhc3NldE1hbmFnZXIuZ2V0SW1hZ2UocnVuSW1hZ2VOYW1lc1swXSkhO1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGluaXRpYWxJbWFnZSk7XHJcblxyXG4gICAgICAgIHRoaXMub3JpZ2luYWxIZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5lZmZlY3RpdmVHcm91bmRlZFRvcFkgPSB5OyAvLyBJdCdzIHBhc3NlZCBkaXJlY3RseSBub3cuXHJcblxyXG4gICAgICAgIHRoaXMuZ2FtZVNldHRpbmdzID0gZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyID0gaW5wdXRIYW5kbGVyO1xyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyID0gYXNzZXRNYW5hZ2VyO1xyXG5cclxuICAgICAgICB0aGlzLmhlYWx0aCA9IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5tYXhIZWFsdGg7XHJcbiAgICAgICAgdGhpcy5qdW1wc1JlbWFpbmluZyA9IGdhbWVTZXR0aW5ncy5wbGF5ZXIubWF4SnVtcHM7XHJcblxyXG4gICAgICAgIHRoaXMucnVuQW5pbWF0aW9uRnJhbWVzID0gcnVuSW1hZ2VOYW1lcy5tYXAobmFtZSA9PiBhc3NldE1hbmFnZXIuZ2V0SW1hZ2UobmFtZSkhKTtcclxuICAgICAgICB0aGlzLmp1bXBJbWFnZSA9IGFzc2V0TWFuYWdlci5nZXRJbWFnZShqdW1wSW1hZ2VOYW1lKSE7XHJcbiAgICAgICAgdGhpcy5zbGlkZUltYWdlID0gYXNzZXRNYW5hZ2VyLmdldEltYWdlKHNsaWRlSW1hZ2VOYW1lKSE7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50SW1hZ2UgPSB0aGlzLnJ1bkFuaW1hdGlvbkZyYW1lc1swXTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJpbGl0eVRpbWVyID4gMCAmJiBNYXRoLmZsb29yKHRoaXMuaW52aW5jaWJpbGl0eVRpbWVyICogMTApICUgMiA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5jdXJyZW50SW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lU3BlZWQ6IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IHdhbnRzVG9KdW1wID0gdGhpcy5pbnB1dEhhbmRsZXIud2FzS2V5UHJlc3NlZFRoaXNGcmFtZSgnU3BhY2UnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIud2FzS2V5UHJlc3NlZFRoaXNGcmFtZSgnS2V5VycpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmlucHV0SGFuZGxlci53YXNLZXlQcmVzc2VkVGhpc0ZyYW1lKCdBcnJvd1VwJykgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLndhc0NsaWNrZWRUaGlzRnJhbWUoKTsgLy8gQ2xpY2svVGFwIGFsc28gdHJpZ2dlcnMganVtcFxyXG4gICAgICAgIGlmICh3YW50c1RvSnVtcCkge1xyXG4gICAgICAgICAgICB0aGlzLmp1bXAoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHdhbnRzVG9TbGlkZSA9IHRoaXMuaW5wdXRIYW5kbGVyLndhc0tleVByZXNzZWRUaGlzRnJhbWUoJ0tleVMnKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLndhc0tleVByZXNzZWRUaGlzRnJhbWUoJ0Fycm93RG93bicpO1xyXG4gICAgICAgIGlmICh3YW50c1RvU2xpZGUpIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFydFNsaWRlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnZlbG9jaXR5WSArPSB0aGlzLmdhbWVTZXR0aW5ncy5ncmF2aXR5ICogZGVsdGFUaW1lO1xyXG4gICAgICAgIHRoaXMueSArPSB0aGlzLnZlbG9jaXR5WSAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgcGxheWVyIGlzIG9uIG9yIGJlbG93IHRoZSBlZmZlY3RpdmUgZ3JvdW5kIGxldmVsXHJcbiAgICAgICAgaWYgKHRoaXMueSA+PSB0aGlzLmVmZmVjdGl2ZUdyb3VuZGVkVG9wWSkge1xyXG4gICAgICAgICAgICB0aGlzLnkgPSB0aGlzLmVmZmVjdGl2ZUdyb3VuZGVkVG9wWTsgLy8gU25hcCB0byBlZmZlY3RpdmUgZ3JvdW5kXHJcbiAgICAgICAgICAgIGlmICghdGhpcy5pc09uR3JvdW5kKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmlzT25Hcm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSAwO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5qdW1wc1JlbWFpbmluZyA9IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5tYXhKdW1wcztcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyU3RhdGUgPSBQbGF5ZXJTdGF0ZS5SVU5OSU5HO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNTbGlkaW5nKSB0aGlzLnN0b3BTbGlkZSgpOyAvLyBTdG9wIHNsaWRpbmcgaWYgbGFuZGVkIHdoaWxlIHNsaWRpbmdcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNPbkdyb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaW52aW5jaWJpbGl0eVRpbWVyID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmludmluY2liaWxpdHlUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZUFuaW1hdGlvbihkZWx0YVRpbWUpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy5zbGlkZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc2xpZGVUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3BTbGlkZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUganVtcCgpIHtcclxuICAgICAgICBpZiAodGhpcy5qdW1wc1JlbWFpbmluZyA+IDAgJiYgIXRoaXMuaXNTbGlkaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZID0gLXRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5qdW1wRm9yY2U7XHJcbiAgICAgICAgICAgIHRoaXMuaXNPbkdyb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmp1bXBzUmVtYWluaW5nLS07XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyU3RhdGUgPSBQbGF5ZXJTdGF0ZS5KVU1QSU5HO1xyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9qdW1wJywgZmFsc2UpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0U2xpZGUoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNPbkdyb3VuZCAmJiAhdGhpcy5pc1NsaWRpbmcpIHtcclxuICAgICAgICAgICAgdGhpcy5pc1NsaWRpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNsaWRlVGltZXIgPSB0aGlzLmdhbWVTZXR0aW5ncy5wbGF5ZXIuc2xpZGVEdXJhdGlvbjtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJTdGF0ZSA9IFBsYXllclN0YXRlLlNMSURJTkc7XHJcblxyXG4gICAgICAgICAgICAvLyBBZGp1c3QgeSBhbmQgaGVpZ2h0IGZvciBzbGlkaW5nLCBrZWVwaW5nIHRoZSBib3R0b20gYWxpZ25lZFxyXG4gICAgICAgICAgICB0aGlzLnkgPSB0aGlzLmVmZmVjdGl2ZUdyb3VuZGVkVG9wWSArICh0aGlzLm9yaWdpbmFsSGVpZ2h0ICogMC41KTtcclxuICAgICAgICAgICAgdGhpcy5oZWlnaHQgPSB0aGlzLm9yaWdpbmFsSGVpZ2h0ICogMC41O1xyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9zbGlkZScsIGZhbHNlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdG9wU2xpZGUoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNTbGlkaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNTbGlkaW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgIC8vIFJlc3RvcmUgb3JpZ2luYWwgaGVpZ2h0IGFuZCB5IHBvc2l0aW9uXHJcbiAgICAgICAgICAgIHRoaXMueSA9IHRoaXMuZWZmZWN0aXZlR3JvdW5kZWRUb3BZO1xyXG4gICAgICAgICAgICB0aGlzLmhlaWdodCA9IHRoaXMub3JpZ2luYWxIZWlnaHQ7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmlzT25Hcm91bmQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyU3RhdGUgPSBQbGF5ZXJTdGF0ZS5SVU5OSU5HO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJTdGF0ZSA9IFBsYXllclN0YXRlLkpVTVBJTkc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVBbmltYXRpb24oZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5wbGF5ZXJTdGF0ZSA9PT0gUGxheWVyU3RhdGUuSlVNUElORykge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRJbWFnZSA9IHRoaXMuanVtcEltYWdlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wbGF5ZXJTdGF0ZSA9PT0gUGxheWVyU3RhdGUuU0xJRElORykge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRJbWFnZSA9IHRoaXMuc2xpZGVJbWFnZTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucGxheWVyU3RhdGUgPT09IFBsYXllclN0YXRlLlJVTk5JTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmFuaW1hdGlvblRpbWVyID49IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5ydW5BbmltYXRpb25TcGVlZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hbmltYXRpb25UaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRSdW5GcmFtZUluZGV4ID0gKHRoaXMuY3VycmVudFJ1bkZyYW1lSW5kZXggKyAxKSAlIHRoaXMucnVuQW5pbWF0aW9uRnJhbWVzLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEltYWdlID0gdGhpcy5ydW5BbmltYXRpb25GcmFtZXNbdGhpcy5jdXJyZW50UnVuRnJhbWVJbmRleF07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShhbW91bnQ6IG51bWJlcikge1xyXG4gICAgICAgIGlmICh0aGlzLmludmluY2liaWxpdHlUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGVhbHRoIC09IGFtb3VudDtcclxuICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZnhfaGl0JywgZmFsc2UpOyAvLyBBZGQgaGl0IHNvdW5kIHdoZW4gZGFtYWdlIGlzIHRha2VuXHJcbiAgICAgICAgICAgIHRoaXMuaW52aW5jaWJpbGl0eVRpbWVyID0gdGhpcy5nYW1lU2V0dGluZ3MucGxheWVyLmhpdEludmluY2liaWxpdHlEdXJhdGlvbjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaXNJbnZpbmNpYmxlKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmludmluY2liaWxpdHlUaW1lciA+IDA7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkU2NvcmUoYW1vdW50OiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnNjb3JlICs9IGFtb3VudDtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcsXHJcbiAgICBUSVRMRSxcclxuICAgIEdBTUUsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbi8vIE1pbmltYWwgY2xhc3NlcyBmb3Igb3RoZXIgZ2FtZSBvYmplY3RzIHRvIG1ha2UgdGhlIGdhbWUgcnVubmFibGUuXHJcbmNsYXNzIE9ic3RhY2xlIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBwcml2YXRlIGdhbWVTcGVlZDogbnVtYmVyO1xyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZTogSFRNTEltYWdlRWxlbWVudCwgZ2FtZVNwZWVkOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZSk7XHJcbiAgICAgICAgdGhpcy5nYW1lU3BlZWQgPSBnYW1lU3BlZWQ7XHJcbiAgICB9XHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggLT0gdGhpcy5nYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIENvbGxlY3RpYmxlIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBwcml2YXRlIGdhbWVTcGVlZDogbnVtYmVyO1xyXG4gICAgc2NvcmVWYWx1ZTogbnVtYmVyO1xyXG4gICAgY29sbGVjdGVkOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LCBnYW1lU3BlZWQ6IG51bWJlciwgc2NvcmVWYWx1ZTogbnVtYmVyKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2UpO1xyXG4gICAgICAgIHRoaXMuZ2FtZVNwZWVkID0gZ2FtZVNwZWVkO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IHNjb3JlVmFsdWU7XHJcbiAgICB9XHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggLT0gdGhpcy5nYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEJhY2tncm91bmRMYXllciB7XHJcbiAgICBpbWFnZTogSFRNTEltYWdlRWxlbWVudDtcclxuICAgIHg6IG51bWJlciA9IDA7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBzcGVlZE11bHRpcGxpZXI6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihpbWFnZTogSFRNTEltYWdlRWxlbWVudCwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgc3BlZWRNdWx0aXBsaWVyOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLmltYWdlID0gaW1hZ2U7XHJcbiAgICAgICAgdGhpcy54ID0gMDtcclxuICAgICAgICB0aGlzLnkgPSB5O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLnNwZWVkTXVsdGlwbGllciA9IHNwZWVkTXVsdGlwbGllcjtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWVTcGVlZDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54IC09IGdhbWVTcGVlZCAqIHRoaXMuc3BlZWRNdWx0aXBsaWVyICogZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnggPD0gLXRoaXMud2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy54ID0gMDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHRoaXMueCArIHRoaXMud2lkdGgsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGdhbWVEYXRhITogR2FtZURhdGE7XHJcbiAgICBwcml2YXRlIGdhbWVTZXR0aW5ncyE6IEdhbWVTZXR0aW5ncztcclxuICAgIHByaXZhdGUgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXI7XHJcbiAgICBwcml2YXRlIGlucHV0SGFuZGxlcjogSW5wdXRIYW5kbGVyO1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXIhOiBQbGF5ZXI7XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBhbmltYXRpb25GcmFtZUlkOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG5cclxuICAgIHByaXZhdGUgYmFja2dyb3VuZHM6IEJhY2tncm91bmRMYXllcltdID0gW107XHJcbiAgICBwcml2YXRlIGdyb3VuZCE6IEJhY2tncm91bmRMYXllcjtcclxuICAgIHByaXZhdGUgb2JzdGFjbGVzOiBPYnN0YWNsZVtdID0gW107XHJcbiAgICBwcml2YXRlIGNvbGxlY3RpYmxlczogQ29sbGVjdGlibGVbXSA9IFtdO1xyXG5cclxuICAgIHByaXZhdGUgb2JzdGFjbGVTcGF3blRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjb2xsZWN0aWJsZVNwYXduVGltZXI6IG51bWJlciA9IDA7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgd2l0aCBJRCAnJHtjYW52YXNJZH0nIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICB0aGlzLmFzc2V0TWFuYWdlciA9IG5ldyBBc3NldE1hbmFnZXIoKTtcclxuICAgICAgICB0aGlzLmlucHV0SGFuZGxlciA9IG5ldyBJbnB1dEhhbmRsZXIodGhpcy5jYW52YXMpO1xyXG5cclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IDEyODA7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gNzIwO1xyXG5cclxuICAgICAgICB0aGlzLmxvYWRHYW1lRGF0YUFuZFN0YXJ0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgbG9hZEdhbWVEYXRhQW5kU3RhcnQoKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmdhbWVEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTZXR0aW5ncyA9IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hc3NldE1hbmFnZXIubG9hZEFzc2V0cyh0aGlzLmdhbWVEYXRhLmFzc2V0cyk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkdhbWUgcmVhZHksIHNob3dpbmcgdGl0bGUgc2NyZWVuLlwiKTtcclxuICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ21fdGl0bGUnLCB0cnVlKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZUxvb3AoMCk7IC8vIFN0YXJ0IHRoZSBnYW1lIGxvb3AgZm9yIHRpdGxlIHNjcmVlblxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGRhdGEgb3IgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZWQnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gJzMwcHggQXJpYWwnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnRVJST1I6IEZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YSBvciBhc3NldHMuJywgNTAsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLm9ic3RhY2xlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVzID0gW107XHJcbiAgICAgICAgdGhpcy5vYnN0YWNsZVNwYXduVGltZXIgPSAwO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVTcGF3blRpbWVyID0gMDtcclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyU2V0dGluZ3MgPSB0aGlzLmdhbWVTZXR0aW5ncy5wbGF5ZXI7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kU2V0dGluZ3MgPSB0aGlzLmdhbWVTZXR0aW5ncy5ncm91bmQ7XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgYWJzb2x1dGUgWSBjb29yZGluYXRlIG9mIHRoZSAqdG9wIGVkZ2UqIG9mIHRoZSB2aXN1YWwgZ3JvdW5kIGxheWVyXHJcbiAgICAgICAgY29uc3QgdmlzdWFsR3JvdW5kVG9wWSA9IHRoaXMuY2FudmFzLmhlaWdodCAqICgxIC0gZ3JvdW5kU2V0dGluZ3MuaGVpZ2h0IC0gZ3JvdW5kU2V0dGluZ3MueU9mZnNldCk7XHJcbiAgICAgICAgLy8gUGxheWVyJ3MgdG9wIFkgY29vcmRpbmF0ZSB3aGVuIHBlcmZlY3RseSBncm91bmRlZCwgY29uc2lkZXJpbmcgaXRzIGhlaWdodCBhbmQgZ3JvdW5kT2Zmc2V0WVxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZGVkWSA9IHZpc3VhbEdyb3VuZFRvcFkgLSBwbGF5ZXJTZXR0aW5ncy5oZWlnaHQgKyBwbGF5ZXJTZXR0aW5ncy5ncm91bmRPZmZzZXRZO1xyXG5cclxuICAgICAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIoXHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoICogMC4xLFxyXG4gICAgICAgICAgICBwbGF5ZXJHcm91bmRlZFksIC8vIFBhc3MgdGhlIGFscmVhZHkgY2FsY3VsYXRlZCBlZmZlY3RpdmUgZ3JvdW5kZWQgWVxyXG4gICAgICAgICAgICBwbGF5ZXJTZXR0aW5ncy53aWR0aCxcclxuICAgICAgICAgICAgcGxheWVyU2V0dGluZ3MuaGVpZ2h0LFxyXG4gICAgICAgICAgICBwbGF5ZXJTZXR0aW5ncy5ydW5BbmltYXRpb25GcmFtZXMsXHJcbiAgICAgICAgICAgICdjb29raWVfanVtcCcsXHJcbiAgICAgICAgICAgICdjb29raWVfc2xpZGUnLFxyXG4gICAgICAgICAgICB0aGlzLmdhbWVTZXR0aW5ncyxcclxuICAgICAgICAgICAgdGhpcy5pbnB1dEhhbmRsZXIsXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLnBsYXllci5zY29yZSA9IDA7XHJcblxyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZHMgPSB0aGlzLmdhbWVTZXR0aW5ncy5iYWNrZ3JvdW5kcy5tYXAoYmcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKGJnLm5hbWUpITtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBCYWNrZ3JvdW5kTGF5ZXIoXHJcbiAgICAgICAgICAgICAgICBpbWFnZSxcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAqIGJnLnlPZmZzZXQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCxcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAqIGJnLmhlaWdodCxcclxuICAgICAgICAgICAgICAgIGJnLnNwZWVkTXVsdGlwbGllclxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBncm91bmRJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKGdyb3VuZFNldHRpbmdzLm5hbWUpITtcclxuICAgICAgICB0aGlzLmdyb3VuZCA9IG5ldyBCYWNrZ3JvdW5kTGF5ZXIoXHJcbiAgICAgICAgICAgIGdyb3VuZEltYWdlLFxyXG4gICAgICAgICAgICB2aXN1YWxHcm91bmRUb3BZLCAvLyBHcm91bmQgc3RhcnRzIGF0IHZpc3VhbEdyb3VuZFRvcFlcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGgsXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAqIGdyb3VuZFNldHRpbmdzLmhlaWdodCxcclxuICAgICAgICAgICAgMS4wXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIuc3RvcFNvdW5kKCdiZ21fdGl0bGUnKTtcclxuICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5zdG9wU291bmQoJ3NmeF9nYW1lX292ZXInKTsgLy8gRW5zdXJlIGdhbWUgb3ZlciBzb3VuZCBpcyBzdG9wcGVkIGlmIGl0IHdhcyBwbGF5aW5nXHJcbiAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ21fZ2FtZScsIHRydWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AgPSAoY3VycmVudFRpbWU6IG51bWJlcikgPT4ge1xyXG4gICAgICAgIHRoaXMuYW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7XHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBpZiAoZGVsdGFUaW1lID4gMC4xKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLnJlc2V0RnJhbWVTdGF0ZSgpOyAvLyBTdGlsbCByZXNldCBpbnB1dCBkdXJpbmcgbGFyZ2UgZGVsdGEgdGltZVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuTE9BRElORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pbnB1dEhhbmRsZXIud2FzS2V5UHJlc3NlZFRoaXNGcmFtZSgnU3BhY2UnKSB8fCB0aGlzLmlucHV0SGFuZGxlci53YXNDbGlja2VkVGhpc0ZyYW1lKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRTpcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlR2FtZShkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnN0b3BTb3VuZCgnYmdtX2dhbWUnKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NmeF9nYW1lX292ZXInLCBmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmlucHV0SGFuZGxlci53YXNLZXlQcmVzc2VkVGhpc0ZyYW1lKCdTcGFjZScpIHx8IHRoaXMuaW5wdXRIYW5kbGVyLndhc0NsaWNrZWRUaGlzRnJhbWUoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnYmdtX3RpdGxlJywgdHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuaW5wdXRIYW5kbGVyLnJlc2V0RnJhbWVTdGF0ZSgpO1xyXG4gICAgfTtcclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUdhbWUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmdhbWVTZXR0aW5ncy5nYW1lU3BlZWQpO1xyXG5cclxuICAgICAgICB0aGlzLmJhY2tncm91bmRzLmZvckVhY2goYmcgPT4gYmcudXBkYXRlKGRlbHRhVGltZSwgdGhpcy5nYW1lU2V0dGluZ3MuZ2FtZVNwZWVkKSk7XHJcbiAgICAgICAgdGhpcy5ncm91bmQudXBkYXRlKGRlbHRhVGltZSwgdGhpcy5nYW1lU2V0dGluZ3MuZ2FtZVNwZWVkKTtcclxuXHJcbiAgICAgICAgdGhpcy5vYnN0YWNsZVNwYXduVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25PYnN0YWNsZSgpO1xyXG4gICAgICAgICAgICB0aGlzLm9ic3RhY2xlU3Bhd25UaW1lciA9IE1hdGgucmFuZG9tKCkgKlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKHRoaXMuZ2FtZVNldHRpbmdzLm9ic3RhY2xlLm1heFNwYXduSW50ZXJ2YWwgLSB0aGlzLmdhbWVTZXR0aW5ncy5vYnN0YWNsZS5taW5TcGF3bkludGVydmFsKSArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTZXR0aW5ncy5vYnN0YWNsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jb2xsZWN0aWJsZVNwYXduVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25Db2xsZWN0aWJsZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RpYmxlU3Bhd25UaW1lciA9IE1hdGgucmFuZG9tKCkgKlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKHRoaXMuZ2FtZVNldHRpbmdzLmNvbGxlY3RpYmxlLm1heFNwYXduSW50ZXJ2YWwgLSB0aGlzLmdhbWVTZXR0aW5ncy5jb2xsZWN0aWJsZS5taW5TcGF3bkludGVydmFsKSArXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTZXR0aW5ncy5jb2xsZWN0aWJsZS5taW5TcGF3bkludGVydmFsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5vYnN0YWNsZXMgPSB0aGlzLm9ic3RhY2xlcy5maWx0ZXIob2JzdGFjbGUgPT4ge1xyXG4gICAgICAgICAgICBvYnN0YWNsZS51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmludGVyc2VjdHMob2JzdGFjbGUpICYmICF0aGlzLnBsYXllci5pc0ludmluY2libGUoKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIudGFrZURhbWFnZSgxKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gb2JzdGFjbGUueCArIG9ic3RhY2xlLndpZHRoID4gMDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5jb2xsZWN0aWJsZXMgPSB0aGlzLmNvbGxlY3RpYmxlcy5maWx0ZXIoY29sbGVjdGlibGUgPT4ge1xyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZS51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmludGVyc2VjdHMoY29sbGVjdGlibGUpICYmICFjb2xsZWN0aWJsZS5jb2xsZWN0ZWQpIHtcclxuICAgICAgICAgICAgICAgIGNvbGxlY3RpYmxlLmNvbGxlY3RlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5hZGRTY29yZShjb2xsZWN0aWJsZS5zY29yZVZhbHVlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2Z4X2NvbGxlY3QnLCBmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGNvbGxlY3RpYmxlLnggKyBjb2xsZWN0aWJsZS53aWR0aCA+IDA7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzcGF3bk9ic3RhY2xlKCkge1xyXG4gICAgICAgIGNvbnN0IG9ic3RhY2xlU2V0dGluZ3MgPSB0aGlzLmdhbWVTZXR0aW5ncy5vYnN0YWNsZTtcclxuICAgICAgICBjb25zdCBvYnN0YWNsZUltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ29ic3RhY2xlX3NwaWtlJykhO1xyXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgYWJzb2x1dGUgWSBjb29yZGluYXRlIG9mIHRoZSAqdG9wIGVkZ2UqIG9mIHRoZSB2aXN1YWwgZ3JvdW5kIGxheWVyXHJcbiAgICAgICAgY29uc3QgdmlzdWFsR3JvdW5kVG9wWSA9IHRoaXMuY2FudmFzLmhlaWdodCAqICgxIC0gdGhpcy5nYW1lU2V0dGluZ3MuZ3JvdW5kLmhlaWdodCAtIHRoaXMuZ2FtZVNldHRpbmdzLmdyb3VuZC55T2Zmc2V0KTtcclxuICAgICAgICBjb25zdCBvYnN0YWNsZVkgPSB2aXN1YWxHcm91bmRUb3BZIC0gb2JzdGFjbGVTZXR0aW5ncy5oZWlnaHQ7XHJcblxyXG4gICAgICAgIHRoaXMub2JzdGFjbGVzLnB1c2gobmV3IE9ic3RhY2xlKFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCxcclxuICAgICAgICAgICAgb2JzdGFjbGVZLFxyXG4gICAgICAgICAgICBvYnN0YWNsZVNldHRpbmdzLndpZHRoLFxyXG4gICAgICAgICAgICBvYnN0YWNsZVNldHRpbmdzLmhlaWdodCxcclxuICAgICAgICAgICAgb2JzdGFjbGVJbWFnZSxcclxuICAgICAgICAgICAgdGhpcy5nYW1lU2V0dGluZ3MuZ2FtZVNwZWVkICogb2JzdGFjbGVTZXR0aW5ncy5zcGVlZE11bHRpcGxpZXJcclxuICAgICAgICApKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduQ29sbGVjdGlibGUoKSB7XHJcbiAgICAgICAgY29uc3QgY29sbGVjdGlibGVTZXR0aW5ncyA9IHRoaXMuZ2FtZVNldHRpbmdzLmNvbGxlY3RpYmxlO1xyXG4gICAgICAgIGNvbnN0IGNvbGxlY3RpYmxlSW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnamVsbHlfYmFzaWMnKSE7XHJcbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBhYnNvbHV0ZSBZIGNvb3JkaW5hdGUgb2YgdGhlICp0b3AgZWRnZSogb2YgdGhlIHZpc3VhbCBncm91bmQgbGF5ZXJcclxuICAgICAgICBjb25zdCB2aXN1YWxHcm91bmRUb3BZID0gdGhpcy5jYW52YXMuaGVpZ2h0ICogKDEgLSB0aGlzLmdhbWVTZXR0aW5ncy5ncm91bmQuaGVpZ2h0IC0gdGhpcy5nYW1lU2V0dGluZ3MuZ3JvdW5kLnlPZmZzZXQpO1xyXG5cclxuICAgICAgICAvLyBTcGF3biBjb2xsZWN0aWJsZXMgYXQgYSByYW5kb20gWSBwb3NpdGlvbiBhYm92ZSB0aGUgZ3JvdW5kXHJcbiAgICAgICAgY29uc3QgbWluSGVpZ2h0T2Zmc2V0ID0gdGhpcy5wbGF5ZXIub3JpZ2luYWxIZWlnaHQgKiAwLjU7IC8vIE1pbiBvZmZzZXQgZnJvbSBwbGF5ZXIncyBlZmZlY3RpdmUgZ3JvdW5kZWQgYm90dG9tXHJcbiAgICAgICAgY29uc3QgbWF4SGVpZ2h0T2Zmc2V0ID0gdGhpcy5wbGF5ZXIub3JpZ2luYWxIZWlnaHQgKiAxLjU7IC8vIE1heCBvZmZzZXQgZnJvbSBwbGF5ZXIncyBlZmZlY3RpdmUgZ3JvdW5kZWQgYm90dG9tXHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZGVkQm90dG9tWSA9IHZpc3VhbEdyb3VuZFRvcFkgKyB0aGlzLmdhbWVTZXR0aW5ncy5wbGF5ZXIuZ3JvdW5kT2Zmc2V0WTsgLy8gQm90dG9tIG9mIHBsYXllciB3aGVuIGdyb3VuZGVkXHJcblxyXG4gICAgICAgIGNvbnN0IG1pbkNvbGxlY3RpYmxlWSA9IHBsYXllckdyb3VuZGVkQm90dG9tWSAtIG1pbkhlaWdodE9mZnNldCAtIGNvbGxlY3RpYmxlU2V0dGluZ3MuaGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IG1heENvbGxlY3RpYmxlWSA9IHBsYXllckdyb3VuZGVkQm90dG9tWSAtIG1heEhlaWdodE9mZnNldCAtIGNvbGxlY3RpYmxlU2V0dGluZ3MuaGVpZ2h0O1xyXG5cclxuICAgICAgICBjb25zdCBjb2xsZWN0aWJsZVkgPSBNYXRoLnJhbmRvbSgpICogKG1heENvbGxlY3RpYmxlWSAtIG1pbkNvbGxlY3RpYmxlWSkgKyBtaW5Db2xsZWN0aWJsZVk7XHJcblxyXG5cclxuICAgICAgICB0aGlzLmNvbGxlY3RpYmxlcy5wdXNoKG5ldyBDb2xsZWN0aWJsZShcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGgsXHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlWSxcclxuICAgICAgICAgICAgY29sbGVjdGlibGVTZXR0aW5ncy53aWR0aCxcclxuICAgICAgICAgICAgY29sbGVjdGlibGVTZXR0aW5ncy5oZWlnaHQsXHJcbiAgICAgICAgICAgIGNvbGxlY3RpYmxlSW1hZ2UsXHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVNldHRpbmdzLmdhbWVTcGVlZCAqIGNvbGxlY3RpYmxlU2V0dGluZ3Muc3BlZWRNdWx0aXBsaWVyLFxyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZVNldHRpbmdzLnNjb3JlVmFsdWVcclxuICAgICAgICApKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZHMuZm9yRWFjaChiZyA9PiBiZy5kcmF3KHRoaXMuY3R4KSk7XHJcbiAgICAgICAgdGhpcy5ncm91bmQuZHJhdyh0aGlzLmN0eCk7XHJcblxyXG4gICAgICAgIHRoaXMucGxheWVyLmRyYXcodGhpcy5jdHgpO1xyXG4gICAgICAgIHRoaXMub2JzdGFjbGVzLmZvckVhY2gob2JzdGFjbGUgPT4gb2JzdGFjbGUuZHJhdyh0aGlzLmN0eCkpO1xyXG4gICAgICAgIHRoaXMuY29sbGVjdGlibGVzLmZvckVhY2goY29sbGVjdGlibGUgPT4gY29sbGVjdGlibGUuZHJhdyh0aGlzLmN0eCkpO1xyXG4gICAgICAgIHRoaXMuZHJhd1VJKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VUkoKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke3RoaXMuZ2FtZVNldHRpbmdzLnVpLnNjb3JlRm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBTY29yZTogJHt0aGlzLnBsYXllci5zY29yZX1gLCAyMCwgNDApO1xyXG5cclxuICAgICAgICBjb25zdCBiYXJYID0gMjA7XHJcbiAgICAgICAgY29uc3QgYmFyWSA9IDYwO1xyXG4gICAgICAgIGNvbnN0IGJhcldpZHRoID0gdGhpcy5nYW1lU2V0dGluZ3MudWkuaGVhbHRoQmFyV2lkdGg7XHJcbiAgICAgICAgY29uc3QgYmFySGVpZ2h0ID0gdGhpcy5nYW1lU2V0dGluZ3MudWkuaGVhbHRoQmFySGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IG1heEhlYWx0aCA9IHRoaXMuZ2FtZVNldHRpbmdzLnBsYXllci5tYXhIZWFsdGg7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEhlYWx0aCA9IHRoaXMucGxheWVyLmhlYWx0aDtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2dyYXknO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGJhclgsIGJhclksIGJhcldpZHRoLCBiYXJIZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChiYXJYLCBiYXJZLCAoY3VycmVudEhlYWx0aCAvIG1heEhlYWx0aCkgKiBiYXJXaWR0aCwgYmFySGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmxpbmVXaWR0aCA9IDI7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdChiYXJYLCBiYXJZLCBiYXJXaWR0aCwgYmFySGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdMb2FkaW5nU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0MHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdMb2FkaW5nIEFzc2V0cy4uLicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDIwKTtcclxuICAgICAgICBjb25zdCBwcm9ncmVzcyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldExvYWRpbmdQcm9ncmVzcygpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke01hdGgucm91bmQocHJvZ3Jlc3MgKiAxMDApfSVgLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAzMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgY29uc3QgdGl0bGVJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCd0aXRsZV9iYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgaWYgKHRpdGxlSW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHRpdGxlSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzYwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ0Nvb2tpZSBSdW4gQ2xvbmUnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczMHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnUHJlc3MgU1BBQ0Ugb3IgQ2xpY2sgdG8gU3RhcnQnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKSB7XHJcbiAgICAgICAgY29uc3QgZ2FtZU92ZXJJbWFnZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdnYW1lX292ZXJfYmFja2dyb3VuZCcpO1xyXG4gICAgICAgIGlmIChnYW1lT3ZlckltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShnYW1lT3ZlckltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnODBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ0dBTUUgT1ZFUicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDgwKTtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYEZpbmFsIFNjb3JlOiAke3RoaXMucGxheWVyLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczMHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnUHJlc3MgU1BBQ0Ugb3IgQ2xpY2sgZm9yIFRpdGxlJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODApO1xyXG4gICAgfVxyXG59XHJcblxyXG53aW5kb3cub25sb2FkID0gKCkgPT4ge1xyXG4gICAgbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtc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
