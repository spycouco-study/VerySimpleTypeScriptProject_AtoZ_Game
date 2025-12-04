let canvas;
let ctx;
let game;
class AssetManager {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.loadedCount = 0;
    this.totalAssets = 0;
  }
  /**
   * Loads all assets defined in the game configuration.
   * @param config - The asset configuration from data.json.
   */
  async loadAssets(config) {
    this.totalAssets = config.images.length + config.sounds.length;
    const promises = [];
    for (const imgConfig of config.images) {
      promises.push(this.loadImage(imgConfig));
    }
    for (const soundConfig of config.sounds) {
      promises.push(this.loadSound(soundConfig));
    }
    await Promise.all(promises);
  }
  loadImage(config) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = config.path;
      img.onload = () => {
        this.images.set(config.name, img);
        this.loadedCount++;
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${config.path}`);
        reject();
      };
    });
  }
  loadSound(config) {
    return new Promise((resolve) => {
      const audio = new Audio(config.path);
      audio.volume = config.volume;
      audio.preload = "auto";
      audio.oncanplaythrough = () => {
        this.sounds.set(config.name, audio);
        this.loadedCount++;
        resolve();
      };
      audio.onerror = () => {
        console.warn(`Failed to load sound: ${config.path}`);
        this.loadedCount++;
        resolve();
      };
    });
  }
  getImage(name) {
    return this.images.get(name);
  }
  playSound(name, loop = false, volume) {
    const audio = this.sounds.get(name);
    if (audio) {
      const clone = audio.cloneNode();
      clone.loop = loop;
      clone.volume = volume !== void 0 ? volume : audio.volume;
      clone.play().catch((e) => console.warn(`Audio play failed for ${name}:`, e));
      return clone;
    }
    return void 0;
  }
  stopSound(audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  getLoadingProgress() {
    return this.totalAssets > 0 ? this.loadedCount / this.totalAssets : 0;
  }
}
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE_SCREEN"] = 1] = "TITLE_SCREEN";
  GameState2[GameState2["TUTORIAL_SCREEN"] = 2] = "TUTORIAL_SCREEN";
  GameState2[GameState2["WAITING_FOR_BITE"] = 3] = "WAITING_FOR_BITE";
  GameState2[GameState2["REELING_MINIGAME"] = 4] = "REELING_MINIGAME";
  GameState2[GameState2["REELING_UP_ANIMATION"] = 5] = "REELING_UP_ANIMATION";
  GameState2[GameState2["GAME_OVER"] = 6] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class Bobber {
  constructor(x, y, width, height, imageName) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.imageName = imageName;
  }
  draw(ctx2, assetManager) {
    const img = assetManager.getImage(this.imageName);
    if (img) {
      ctx2.drawImage(img, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    }
  }
}
class Fish {
  // -1 for left, 1 for right
  constructor(x, y, width, height, data) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.imageName = data.image;
    this.speed = data.speed;
    this.data = data;
    this.direction = Math.random() < 0.5 ? -1 : 1;
  }
  update(deltaTime, canvasWidth, bobberX) {
    this.x += this.speed * this.direction * deltaTime;
    if (this.x < 0 || this.x > canvasWidth) {
      this.direction *= -1;
      this.x = Math.max(0, Math.min(canvasWidth, this.x));
    }
    const distanceToBobber = Math.abs(this.x - bobberX);
    if (distanceToBobber < 200) {
      const pullDirection = bobberX - this.x > 0 ? 1 : -1;
      this.x += pullDirection * this.speed * deltaTime * (1 - distanceToBobber / 200) * 0.5;
    }
  }
  draw(ctx2, assetManager) {
    const img = assetManager.getImage(this.imageName);
    if (img) {
      ctx2.save();
      ctx2.translate(this.x, this.y);
      if (this.direction === -1) {
        ctx2.scale(-1, 1);
      }
      ctx2.drawImage(img, -this.width / 2, -this.height / 2, this.width, this.height);
      ctx2.restore();
    }
  }
}
class Game {
  constructor(canvas2, ctx2) {
    this.canvas = canvas2;
    this.ctx = ctx2;
    this.assetManager = new AssetManager();
    this.currentState = 0 /* LOADING */;
    this.lastTime = 0;
    this.score = 0;
    this.gameTimer = 0;
    // In seconds
    this.fishSpawnTimer = 0;
    // In seconds
    this.fishes = [];
    this.keysPressed = /* @__PURE__ */ new Set();
    this.caughtFishName = null;
    // For displaying catch outcome
    this.outcomeDisplayTimer = 0;
    // How long to display outcome
    // Bobber movement
    this.bobberMoveDirection = 0;
    // 0: none, -1: up, 1: down
    // Bite detection
    this.fishUnderBobber = null;
    this.fishUnderBobberTimer = 0;
    // Mini-game variables
    this.miniGameSuccess = 0;
    this.miniGameFailure = 0;
    this.miniGameTimer = 0;
    this.miniGamePointerPosition = 0;
    // -1 to 1 representing left to right
    this.miniGameTargetZoneCenter = 0;
    // The actual fish object currently being reeled
    // Reeling up animation variables
    this.reelingUpAnimationTimer = 0;
    this.reelingUpDuration = 0;
    this.reelingUpTargetY = 0;
    this.initialBobberYForReelUp = 0;
    /**
     * Handles keyboard key down events.
     * @param event - The KeyboardEvent object.
     */
    this.handleKeyDown = (event) => {
      this.keysPressed.add(event.code);
      if (event.code === "Space") {
        event.preventDefault();
        switch (this.currentState) {
          case 1 /* TITLE_SCREEN */:
            this.currentState = 2 /* TUTORIAL_SCREEN */;
            this.assetManager.playSound("select");
            break;
          case 2 /* TUTORIAL_SCREEN */:
            this.currentState = 3 /* WAITING_FOR_BITE */;
            this.assetManager.playSound("select");
            break;
          case 4 /* REELING_MINIGAME */:
            const targetZoneStart = this.miniGameTargetZoneCenter - this.config.miniGameTargetZoneWidth / 2;
            const targetZoneEnd = this.miniGameTargetZoneCenter + this.config.miniGameTargetZoneWidth / 2;
            if (this.miniGamePointerPosition >= targetZoneStart && this.miniGamePointerPosition <= targetZoneEnd) {
              this.miniGameSuccess += this.config.miniGamePressEffect;
            }
            this.assetManager.playSound("reel", false, 0.7);
            break;
          case 6 /* GAME_OVER */:
            this.initGame();
            this.currentState = 1 /* TITLE_SCREEN */;
            this.assetManager.playSound("select");
            break;
        }
      } else if (this.currentState === 3 /* WAITING_FOR_BITE */) {
        if (event.code === "ArrowUp") {
          this.bobberMoveDirection = -1;
        } else if (event.code === "ArrowDown") {
          this.bobberMoveDirection = 1;
        }
      }
    };
    /**
     * Handles keyboard key up events.
     * @param event - The KeyboardEvent object.
     */
    this.handleKeyUp = (event) => {
      this.keysPressed.delete(event.code);
      if (event.code === "ArrowUp" || event.code === "ArrowDown") {
        this.bobberMoveDirection = 0;
      }
    };
    /**
     * The main game loop, called by requestAnimationFrame.
     * @param currentTime - The current time provided by requestAnimationFrame.
     */
    this.loop = (currentTime) => {
      const deltaTime = (currentTime - this.lastTime) / 1e3;
      this.lastTime = currentTime;
      this.update(deltaTime);
      this.draw();
      requestAnimationFrame(this.loop);
    };
    this.canvas.width = 800;
    this.canvas.height = 600;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }
  /**
   * Starts the game by loading configuration and assets, then initiating the game loop.
   */
  async start() {
    await this.loadConfig();
    this.initGame();
    this.loop(0);
  }
  async loadConfig() {
    try {
      const response = await fetch("data.json");
      this.config = await response.json();
      this.canvas.width = this.config.canvasWidth;
      this.canvas.height = this.config.canvasHeight;
      await this.assetManager.loadAssets(this.config.assets);
      this.currentState = 1 /* TITLE_SCREEN */;
    } catch (error) {
      console.error("Failed to load game configuration or assets:", error);
      this.currentState = 6 /* GAME_OVER */;
    }
  }
  /**
   * Initializes or resets game-specific variables for a new game session.
   */
  initGame() {
    this.score = 0;
    this.gameTimer = this.config.gameDurationSeconds;
    this.fishSpawnTimer = 0;
    this.fishes = [];
    this.bobber = new Bobber(
      this.config.initialBobberX * this.canvas.width,
      this.config.initialBobberY * this.canvas.height,
      // Bobber starts at water surface
      this.config.bobberWidth,
      this.config.bobberHeight,
      "bobber"
    );
    if (this.bgmAudio) {
      this.assetManager.stopSound(this.bgmAudio);
    }
    this.bgmAudio = this.assetManager.playSound("bgm", true, this.config.assets.sounds.find((s) => s.name === "bgm")?.volume);
    this.miniGameSuccess = 0;
    this.miniGameFailure = 0;
    this.miniGameTimer = 0;
    this.miniGamePointerPosition = 0;
    this.miniGameTargetZoneCenter = 0;
    this.currentFishInMinigame = void 0;
    this.caughtFishName = null;
    this.outcomeDisplayTimer = 0;
    this.bobberMoveDirection = 0;
    this.fishUnderBobber = null;
    this.fishUnderBobberTimer = 0;
    this.reelingUpAnimationTimer = 0;
    this.reelingUpDuration = 0;
    this.reelingUpTargetY = 0;
    this.initialBobberYForReelUp = 0;
  }
  /**
   * Updates game logic based on the current state and time elapsed.
   * @param deltaTime - The time elapsed since the last frame, in seconds.
   */
  update(deltaTime) {
    if (this.currentState === 0 /* LOADING */) return;
    if (this.bgmAudio && this.bgmAudio.paused && this.currentState !== 1 /* TITLE_SCREEN */ && this.currentState !== 2 /* TUTORIAL_SCREEN */) {
      this.bgmAudio.play().catch((e) => console.warn("Failed to resume BGM:", e));
    }
    switch (this.currentState) {
      case 1 /* TITLE_SCREEN */:
      case 2 /* TUTORIAL_SCREEN */:
      case 6 /* GAME_OVER */:
        break;
      case 3 /* WAITING_FOR_BITE */:
        this.gameTimer -= deltaTime;
        if (this.gameTimer <= 0) {
          this.currentState = 6 /* GAME_OVER */;
          if (this.bgmAudio) this.assetManager.stopSound(this.bgmAudio);
          this.assetManager.playSound("gameOverSound");
          break;
        }
        if (this.bobberMoveDirection !== 0) {
          this.bobber.y += this.bobberMoveDirection * this.config.bobberMoveSpeed * deltaTime;
          this.bobber.y = Math.max(
            this.config.minBobberYRatio * this.canvas.height,
            Math.min(this.config.maxBobberYRatio * this.canvas.height, this.bobber.y)
          );
        }
        this.fishes.forEach((fish) => {
          if (fish !== this.fishUnderBobber) {
            fish.update(deltaTime * this.config.fishSwimSpeedMultiplier, this.canvas.width, this.bobber.x);
          }
        });
        this.fishSpawnTimer += deltaTime;
        if (this.fishSpawnTimer >= this.config.fishSpawnIntervalSeconds) {
          this.fishSpawnTimer = 0;
          this.spawnFish();
        }
        if (this.caughtFishName !== null) {
          this.outcomeDisplayTimer -= deltaTime;
          if (this.outcomeDisplayTimer <= 0) {
            this.caughtFishName = null;
          }
        }
        if (this.caughtFishName === null) {
          let closestFish = null;
          let minDistanceSq = Infinity;
          for (const fish of this.fishes) {
            const dx = fish.x - this.bobber.x;
            const dy = fish.y - this.bobber.y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq <= this.config.biteTriggerRadius * this.config.biteTriggerRadius) {
              if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                closestFish = fish;
              }
            }
          }
          if (closestFish) {
            if (this.fishUnderBobber === closestFish) {
              this.fishUnderBobberTimer += deltaTime;
              if (this.fishUnderBobberTimer >= this.config.biteHoldDurationSeconds) {
                this.currentState = 4 /* REELING_MINIGAME */;
                this.assetManager.playSound("bite");
                this.initMiniGame(this.fishUnderBobber);
                this.fishUnderBobber = null;
                this.fishUnderBobberTimer = 0;
              }
            } else {
              this.fishUnderBobber = closestFish;
              this.fishUnderBobberTimer = 0;
            }
          } else {
            this.fishUnderBobber = null;
            this.fishUnderBobberTimer = 0;
          }
        }
        break;
      case 4 /* REELING_MINIGAME */:
        this.miniGameTimer -= deltaTime;
        if (this.miniGameTimer <= 0) {
          this.resolveMiniGame();
          break;
        }
        this.miniGameSuccess = Math.max(0, this.miniGameSuccess - this.config.miniGameDecayRate * deltaTime);
        this.miniGamePointerPosition += this.config.miniGameBasePointerSpeed * deltaTime;
        if (this.miniGamePointerPosition > 1 || this.miniGamePointerPosition < -1) {
          this.config.miniGameBasePointerSpeed *= -1;
          this.miniGamePointerPosition = Math.max(-1, Math.min(1, this.miniGamePointerPosition));
        }
        const targetZoneStart = this.miniGameTargetZoneCenter - this.config.miniGameTargetZoneWidth / 2;
        const targetZoneEnd = this.miniGameTargetZoneCenter + this.config.miniGameTargetZoneWidth / 2;
        if (!(this.miniGamePointerPosition >= targetZoneStart && this.miniGamePointerPosition <= targetZoneEnd)) {
          this.miniGameFailure += deltaTime;
        }
        if (this.miniGameFailure >= this.config.miniGameFailureThreshold) {
          this.resolveMiniGame(false);
        } else if (this.miniGameSuccess >= this.config.miniGameSuccessTarget) {
          this.resolveMiniGame(true);
        }
        this.fishes.forEach((fish) => {
          if (fish !== this.currentFishInMinigame) {
            fish.update(deltaTime * this.config.fishSwimSpeedMultiplier, this.canvas.width, this.bobber.x);
          }
        });
        break;
      case 5 /* REELING_UP_ANIMATION */:
        if (!this.currentFishInMinigame) {
          this.currentState = 3 /* WAITING_FOR_BITE */;
          this.bobber.y = this.config.initialBobberY * this.canvas.height;
          break;
        }
        this.reelingUpAnimationTimer += deltaTime;
        const progress = Math.min(1, this.reelingUpAnimationTimer / this.reelingUpDuration);
        this.bobber.y = this.initialBobberYForReelUp + (this.reelingUpTargetY - this.initialBobberYForReelUp) * progress;
        this.currentFishInMinigame.x = this.bobber.x;
        this.currentFishInMinigame.y = this.bobber.y + this.bobber.height / 2 + this.currentFishInMinigame.height / 2 - 10;
        if (progress >= 1) {
          this.score += this.currentFishInMinigame.data.score;
          this.assetManager.playSound("catch");
          this.caughtFishName = this.config.ui.fishCaught;
          this.outcomeDisplayTimer = 2;
          const index = this.fishes.indexOf(this.currentFishInMinigame);
          if (index > -1) {
            this.fishes.splice(index, 1);
          }
          this.currentFishInMinigame = void 0;
          this.currentState = 3 /* WAITING_FOR_BITE */;
          this.bobber.y = this.config.initialBobberY * this.canvas.height;
        }
        this.fishes.forEach((fish) => {
          if (fish !== this.currentFishInMinigame) {
            fish.update(deltaTime * this.config.fishSwimSpeedMultiplier, this.canvas.width, this.bobber.x);
          }
        });
        break;
    }
  }
  /**
   * Spawns a new fish at a random position below the water line.
   */
  spawnFish() {
    const fishConfig = this.config.fishes[Math.floor(Math.random() * this.config.fishes.length)];
    const spawnX = Math.random() * this.canvas.width;
    const waterLineY = this.config.initialBobberY * this.canvas.height;
    const minSpawnY = waterLineY + this.config.fishDefaultHeight / 2 + 10;
    const maxSpawnY = this.canvas.height - this.config.fishDefaultHeight / 2 - 10;
    if (minSpawnY < maxSpawnY) {
      const spawnY = minSpawnY + Math.random() * (maxSpawnY - minSpawnY);
      const newFish = new Fish(
        spawnX,
        spawnY,
        this.config.fishDefaultWidth,
        this.config.fishDefaultHeight,
        fishConfig
      );
      this.fishes.push(newFish);
      if (this.fishes.length > this.config.maxFishOnScreen) {
        let removed = false;
        for (let i = 0; i < this.fishes.length - 1; i++) {
          if (this.fishes[i] !== this.currentFishInMinigame && this.fishes[i] !== this.fishUnderBobber) {
            this.fishes.splice(i, 1);
            removed = true;
            break;
          }
        }
        if (!removed && this.fishes.length > this.config.maxFishOnScreen && this.fishes[0] !== this.currentFishInMinigame && this.fishes[0] !== this.fishUnderBobber) {
          this.fishes.shift();
        }
      }
    } else {
      console.warn("Fish spawn range is invalid. Check canvas dimensions, initialBobberY, and fishDefaultHeight in config.");
    }
  }
  /**
   * Initializes the reeling mini-game.
   * @param fish - The actual Fish object that initiated the mini-game.
   */
  initMiniGame(fish) {
    this.miniGameSuccess = 0;
    this.miniGameFailure = 0;
    this.miniGameTimer = this.config.miniGameDurationSeconds;
    this.miniGamePointerPosition = 0;
    this.miniGameTargetZoneCenter = Math.random() * 1.6 - 0.8;
    this.currentFishInMinigame = fish;
    this.config.miniGameBasePointerSpeed = 1 + fish.data.miniGameDifficulty * 0.5;
    if (Math.random() < 0.5) {
      this.config.miniGameBasePointerSpeed *= -1;
    }
    this.config.miniGameDecayRate = 0.8 + fish.data.miniGameDifficulty * 0.2;
  }
  /**
   * Resolves the mini-game, determining if the fish was caught or lost.
   * @param forcedOutcome - Optional boolean to force a success or failure (e.g., if target/threshold reached early).
   */
  resolveMiniGame(forcedOutcome) {
    const caught = forcedOutcome !== void 0 ? forcedOutcome : this.miniGameSuccess >= this.config.miniGameSuccessTarget;
    if (caught && this.currentFishInMinigame) {
      this.initialBobberYForReelUp = this.bobber.y;
      const waterLineY = this.config.initialBobberY * this.canvas.height;
      const boatImage = this.assetManager.getImage("boat");
      const boatHeight = boatImage ? boatImage.height : 0;
      const boatY = waterLineY - boatHeight;
      this.reelingUpTargetY = boatY + this.config.fishingLineOffsetY;
      this.reelingUpDuration = this.config.reelingUpDurationSeconds;
      this.reelingUpAnimationTimer = 0;
      this.currentState = 5 /* REELING_UP_ANIMATION */;
    } else {
      this.assetManager.playSound("fail");
      this.caughtFishName = this.config.ui.fishLost;
      this.outcomeDisplayTimer = 2;
      if (this.currentFishInMinigame) {
        const index = this.fishes.indexOf(this.currentFishInMinigame);
        if (index > -1) {
          this.fishes.splice(index, 1);
        }
      }
      this.currentFishInMinigame = void 0;
      this.currentState = 3 /* WAITING_FOR_BITE */;
      this.bobber.y = this.config.initialBobberY * this.canvas.height;
    }
  }
  /**
   * Draws all game elements to the canvas based on the current game state.
   */
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const background = this.assetManager.getImage("background");
    if (background) {
      this.ctx.drawImage(background, 0, 0, this.canvas.width, this.canvas.height);
    }
    switch (this.currentState) {
      case 0 /* LOADING */:
        this.drawLoadingScreen();
        break;
      case 1 /* TITLE_SCREEN */:
        this.drawTitleScreen();
        break;
      case 2 /* TUTORIAL_SCREEN */:
        this.drawTutorialScreen();
        break;
      case 3 /* WAITING_FOR_BITE */:
      case 4 /* REELING_MINIGAME */:
      case 5 /* REELING_UP_ANIMATION */:
        this.drawGameplay();
        if (this.currentState === 4 /* REELING_MINIGAME */) {
          this.drawMiniGameUI();
        }
        if (this.caughtFishName !== null) {
          this.drawOutcomeMessage();
        }
        break;
      case 6 /* GAME_OVER */:
        this.drawGameplay();
        this.drawGameOverScreen();
        break;
    }
  }
  drawLoadingScreen() {
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(`${this.config.ui.loading} ${Math.round(this.assetManager.getLoadingProgress() * 100)}%`, this.canvas.width / 2, this.canvas.height / 2);
  }
  drawTitleScreen() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.ui.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px Arial";
    this.ctx.fillText(this.config.ui.pressSpace, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  drawTutorialScreen() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "30px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("\uC870\uC791\uBC95", this.canvas.width / 2, this.canvas.height / 2 - 120);
    this.ctx.font = "20px Arial";
    this.ctx.fillText(this.config.ui.tutorialLine1, this.canvas.width / 2, this.canvas.height / 2 - 60);
    this.ctx.fillText(this.config.ui.tutorialLine2, this.canvas.width / 2, this.canvas.height / 2 - 30);
    this.ctx.fillText(this.config.ui.tutorialLine3, this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.fillText(this.config.ui.tutorialLine4, this.canvas.width / 2, this.canvas.height / 2 + 30);
    this.ctx.font = "24px Arial";
    this.ctx.fillText(this.config.ui.pressSpace, this.canvas.width / 2, this.canvas.height / 2 + 100);
  }
  drawGameplay() {
    const waterLineY = this.config.initialBobberY * this.canvas.height;
    const boat = this.assetManager.getImage("boat");
    if (boat) {
      const boatX = this.canvas.width / 2 - boat.width / 2;
      const boatY = waterLineY - boat.height;
      this.ctx.drawImage(boat, boatX, boatY, boat.width, boat.height);
      this.ctx.strokeStyle = "white";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(this.bobber.x, boatY + this.config.fishingLineOffsetY);
      this.ctx.lineTo(this.bobber.x, this.bobber.y);
      this.ctx.stroke();
    }
    this.bobber.draw(this.ctx, this.assetManager);
    this.fishes.forEach((fish) => fish.draw(this.ctx, this.assetManager));
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`${this.config.ui.scorePrefix}${this.score}`, 10, 30);
    this.ctx.fillText(`${this.config.ui.timeRemainingPrefix}${Math.ceil(this.gameTimer)}`, 10, 60);
  }
  drawMiniGameUI() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, this.canvas.height - 150, this.canvas.width, 150);
    const barY = this.canvas.height - 100;
    const barHeight = 30;
    const barWidth = this.canvas.width * 0.8;
    const barX = (this.canvas.width - barWidth) / 2;
    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(barX, barY, barWidth, barHeight);
    const targetZoneWidthPx = barWidth * this.config.miniGameTargetZoneWidth;
    const targetZoneX = barX + this.miniGameTargetZoneCenter * (barWidth / 2) + barWidth / 2 - targetZoneWidthPx / 2;
    this.ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
    this.ctx.fillRect(targetZoneX, barY, targetZoneWidthPx, barHeight);
    const pointerX = barX + this.miniGamePointerPosition * (barWidth / 2) + barWidth / 2;
    this.ctx.fillStyle = "yellow";
    this.ctx.fillRect(pointerX - 5, barY - 10, 10, barHeight + 20);
    const successBarWidth = this.miniGameSuccess / this.config.miniGameSuccessTarget * barWidth;
    this.ctx.fillStyle = "blue";
    this.ctx.fillRect(barX, barY + barHeight + 10, successBarWidth, 10);
    const failureBarWidth = this.miniGameFailure / this.config.miniGameFailureThreshold * barWidth;
    this.ctx.fillStyle = "red";
    this.ctx.fillRect(barX, barY + barHeight + 25, failureBarWidth, 10);
    this.ctx.fillStyle = "white";
    this.ctx.font = "28px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.ui.reelInstruction, this.canvas.width / 2, barY - 30);
    this.ctx.font = "20px Arial";
    this.ctx.fillText(`${this.config.ui.reelTime}${Math.ceil(this.miniGameTimer)}s`, this.canvas.width / 2, barY + barHeight + 50);
  }
  drawOutcomeMessage() {
    if (this.caughtFishName) {
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      this.ctx.fillRect(0, this.canvas.height / 2 - 50, this.canvas.width, 100);
      this.ctx.fillStyle = "white";
      this.ctx.font = "40px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText(this.caughtFishName, this.canvas.width / 2, this.canvas.height / 2 + 10);
    }
  }
  drawGameOverScreen() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "60px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.ui.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 80);
    this.ctx.font = "36px Arial";
    this.ctx.fillText(`${this.config.ui.scorePrefix}${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.font = "24px Arial";
    this.ctx.fillText(this.config.ui.pressSpace, this.canvas.width / 2, this.canvas.height / 2 + 80);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("Canvas element with ID 'gameCanvas' not found!");
    return;
  }
  ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Failed to get 2D rendering context for canvas!");
    return;
  }
  game = new Game(canvas, ctx);
  game.start();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gVHlwZVNjcmlwdCBpbnRlcmZhY2VzIGZvciBnYW1lIGNvbmZpZ3VyYXRpb24gYW5kIGRhdGFcclxuaW50ZXJmYWNlIEFzc2V0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIHdpZHRoPzogbnVtYmVyO1xyXG4gICAgaGVpZ2h0PzogbnVtYmVyO1xyXG4gICAgZHVyYXRpb25fc2Vjb25kcz86IG51bWJlcjtcclxuICAgIHZvbHVtZT86IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEltYWdlRGF0YUNvbmZpZyBleHRlbmRzIEFzc2V0Q29uZmlnIHtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFNvdW5kRGF0YUNvbmZpZyBleHRlbmRzIEFzc2V0Q29uZmlnIHtcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRmlzaERhdGEge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgc2NvcmU6IG51bWJlcjtcclxuICAgIGltYWdlOiBzdHJpbmc7IC8vIEFzc2V0IG5hbWUgZm9yIHRoZSBmaXNoIGltYWdlXHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgbWluaUdhbWVEaWZmaWN1bHR5OiBudW1iZXI7IC8vIEZhY3RvciBmb3IgbWluaS1nYW1lIGNoYWxsZW5nZVxyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBnYW1lRHVyYXRpb25TZWNvbmRzOiBudW1iZXI7IC8vIFRvdGFsIGdhbWUgdGltZVxyXG4gICAgaW5pdGlhbEJvYmJlclg6IG51bWJlcjsgLy8gUmF0aW8gb2YgY2FudmFzIHdpZHRoXHJcbiAgICBpbml0aWFsQm9iYmVyWTogbnVtYmVyOyAvLyBSYXRpbyBvZiBjYW52YXMgaGVpZ2h0ICh3YXRlciBzdXJmYWNlKVxyXG4gICAgYm9iYmVyTW92ZVNwZWVkOiBudW1iZXI7IC8vIFNwZWVkIGZvciBib2JiZXIgdmVydGljYWwgbW92ZW1lbnRcclxuICAgIG1pbkJvYmJlcllSYXRpbzogbnVtYmVyOyAvLyBNaW4gWSByYXRpbyBmb3IgYm9iYmVyIHZlcnRpY2FsIG1vdmVtZW50XHJcbiAgICBtYXhCb2JiZXJZUmF0aW86IG51bWJlcjsgLy8gTWF4IFkgcmF0aW8gZm9yIGJvYmJlciB2ZXJ0aWNhbCBtb3ZlbWVudFxyXG4gICAgZmlzaGluZ0xpbmVPZmZzZXRZOiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZvciBmaXNoaW5nIGxpbmUgc3RhcnQgb24gYm9hdFxyXG4gICAgZmlzaFNwYXduSW50ZXJ2YWxTZWNvbmRzOiBudW1iZXI7IC8vIEhvdyBvZnRlbiBuZXcgZmlzaCBtaWdodCBhcHBlYXJcclxuICAgIGZpc2hTd2ltU3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXIgZm9yIGZpc2ggbW92ZW1lbnQgc3BlZWRcclxuICAgIG1heEZpc2hPblNjcmVlbjogbnVtYmVyOyAvLyBNYXhpbXVtIG51bWJlciBvZiBmaXNoIHZpc2libGVcclxuICAgIGJvYmJlcldpZHRoOiBudW1iZXI7XHJcbiAgICBib2JiZXJIZWlnaHQ6IG51bWJlcjtcclxuICAgIGZpc2hEZWZhdWx0V2lkdGg6IG51bWJlcjtcclxuICAgIGZpc2hEZWZhdWx0SGVpZ2h0OiBudW1iZXI7XHJcbiAgICBiaXRlVHJpZ2dlclJhZGl1czogbnVtYmVyOyAvLyBEaXN0YW5jZSBmb3IgYSBmaXNoIHRvIGJlIFwibmVhclwiIHRoZSBib2JiZXJcclxuICAgIGJpdGVIb2xkRHVyYXRpb25TZWNvbmRzOiBudW1iZXI7IC8vIEhvdyBsb25nIHRoZSBob29rIG11c3QgYmUgbmVhciBhIGZpc2ggZm9yIGEgYml0ZVxyXG4gICAgbWluaUdhbWVEdXJhdGlvblNlY29uZHM6IG51bWJlcjsgLy8gRHVyYXRpb24gb2YgdGhlIHJlZWxpbmcgbWluaS1nYW1lXHJcbiAgICBtaW5pR2FtZVN1Y2Nlc3NUYXJnZXQ6IG51bWJlcjsgLy8gSG93IG11Y2ggJ3N1Y2Nlc3MnIGlzIG5lZWRlZCB0byBjYXRjaCBhIGZpc2hcclxuICAgIG1pbmlHYW1lRmFpbHVyZVRocmVzaG9sZDogbnVtYmVyOyAvLyBIb3cgbXVjaCAnZmFpbHVyZScgbGVhZHMgdG8gbG9zaW5nIGEgZmlzaFxyXG4gICAgbWluaUdhbWVQcmVzc0VmZmVjdDogbnVtYmVyOyAvLyBIb3cgbXVjaCBhIFNQQUNFIHByZXNzIGNvbnRyaWJ1dGVzIHRvIHN1Y2Nlc3NcclxuICAgIG1pbmlHYW1lRGVjYXlSYXRlOiBudW1iZXI7IC8vIEhvdyBxdWlja2x5IHN1Y2Nlc3MgZGVjYXlzIG92ZXIgdGltZVxyXG4gICAgbWluaUdhbWVUYXJnZXRab25lV2lkdGg6IG51bWJlcjsgLy8gV2lkdGggb2YgdGhlIHRhcmdldCB6b25lIGluIHRoZSBtaW5pLWdhbWUgYmFyICgwIHRvIDEpXHJcbiAgICBtaW5pR2FtZUJhc2VQb2ludGVyU3BlZWQ6IG51bWJlcjsgLy8gQmFzZSBzcGVlZCBvZiB0aGUgcG9pbnRlciBpbiB0aGUgbWluaS1nYW1lXHJcbiAgICByZWVsaW5nVXBEdXJhdGlvblNlY29uZHM6IG51bWJlcjsgLy8gRHVyYXRpb24gZm9yIGZpc2ggcmVlbGluZyB1cCBhbmltYXRpb25cclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogSW1hZ2VEYXRhQ29uZmlnW107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZERhdGFDb25maWdbXTtcclxuICAgIH07XHJcbiAgICBmaXNoZXM6IEZpc2hEYXRhW107XHJcbiAgICB1aToge1xyXG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgcHJlc3NTcGFjZTogc3RyaW5nO1xyXG4gICAgICAgIHR1dG9yaWFsTGluZTE6IHN0cmluZztcclxuICAgICAgICB0dXRvcmlhbExpbmUyOiBzdHJpbmc7XHJcbiAgICAgICAgdHV0b3JpYWxMaW5lMzogc3RyaW5nO1xyXG4gICAgICAgIHR1dG9yaWFsTGluZTQ6IHN0cmluZztcclxuICAgICAgICBmaXNoQ2F1Z2h0OiBzdHJpbmc7XHJcbiAgICAgICAgZmlzaExvc3Q6IHN0cmluZztcclxuICAgICAgICBzY29yZVByZWZpeDogc3RyaW5nO1xyXG4gICAgICAgIHRpbWVSZW1haW5pbmdQcmVmaXg6IHN0cmluZztcclxuICAgICAgICBnYW1lT3Zlcjogc3RyaW5nO1xyXG4gICAgICAgIGxvYWRpbmc6IHN0cmluZztcclxuICAgICAgICByZWVsSW5zdHJ1Y3Rpb246IHN0cmluZztcclxuICAgICAgICByZWVsVGltZTogc3RyaW5nO1xyXG4gICAgfTtcclxufVxyXG5cclxuLy8gR2xvYmFsIGNhbnZhcyBhbmQgY29udGV4dCB2YXJpYWJsZXNcclxubGV0IGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbmxldCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxubGV0IGdhbWU6IEdhbWU7XHJcblxyXG4vKipcclxuICogQXNzZXRNYW5hZ2VyIGNsYXNzIHRvIGhhbmRsZSBsb2FkaW5nIGFuZCBhY2Nlc3NpbmcgZ2FtZSBhc3NldHMgKGltYWdlcyBhbmQgc291bmRzKS5cclxuICovXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIGxvYWRlZENvdW50ID0gMDtcclxuICAgIHRvdGFsQXNzZXRzID0gMDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIExvYWRzIGFsbCBhc3NldHMgZGVmaW5lZCBpbiB0aGUgZ2FtZSBjb25maWd1cmF0aW9uLlxyXG4gICAgICogQHBhcmFtIGNvbmZpZyAtIFRoZSBhc3NldCBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uLlxyXG4gICAgICovXHJcbiAgICBhc3luYyBsb2FkQXNzZXRzKGNvbmZpZzogR2FtZUNvbmZpZ1snYXNzZXRzJ10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLnRvdGFsQXNzZXRzID0gY29uZmlnLmltYWdlcy5sZW5ndGggKyBjb25maWcuc291bmRzLmxlbmd0aDtcclxuICAgICAgICBjb25zdCBwcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgaW1nQ29uZmlnIG9mIGNvbmZpZy5pbWFnZXMpIHtcclxuICAgICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLmxvYWRJbWFnZShpbWdDb25maWcpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChjb25zdCBzb3VuZENvbmZpZyBvZiBjb25maWcuc291bmRzKSB7XHJcbiAgICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5sb2FkU291bmQoc291bmRDb25maWcpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRJbWFnZShjb25maWc6IEltYWdlRGF0YUNvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gY29uZmlnLnBhdGg7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoY29uZmlnLm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7Y29uZmlnLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRTb3VuZChjb25maWc6IFNvdW5kRGF0YUNvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhjb25maWcucGF0aCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGNvbmZpZy52b2x1bWU7XHJcbiAgICAgICAgICAgIGF1ZGlvLnByZWxvYWQgPSAnYXV0byc7XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoY29uZmlnLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7Y29uZmlnLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgZXZlbiBvbiBlcnJvciB0byBub3QgYmxvY2sgZ2FtZVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEltYWdlKG5hbWU6IHN0cmluZyk6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmltYWdlcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcGxheVNvdW5kKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlLCB2b2x1bWU/OiBudW1iZXIpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgY29uc3QgY2xvbmUgPSBhdWRpby5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50OyAvLyBDbG9uZSB0byBhbGxvdyBtdWx0aXBsZSBjb25jdXJyZW50IHBsYXlzXHJcbiAgICAgICAgICAgIGNsb25lLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSB2b2x1bWUgIT09IHVuZGVmaW5lZCA/IHZvbHVtZSA6IGF1ZGlvLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBBdWRpbyBwbGF5IGZhaWxlZCBmb3IgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgICAgIHJldHVybiBjbG9uZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICBzdG9wU291bmQoYXVkaW86IEhUTUxBdWRpb0VsZW1lbnQpIHtcclxuICAgICAgICBhdWRpby5wYXVzZSgpO1xyXG4gICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgIH1cclxuXHJcbiAgICBnZXRMb2FkaW5nUHJvZ3Jlc3MoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50b3RhbEFzc2V0cyA+IDAgPyB0aGlzLmxvYWRlZENvdW50IC8gdGhpcy50b3RhbEFzc2V0cyA6IDA7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBFbnVtIGZvciBtYW5hZ2luZyBkaWZmZXJlbnQgc3RhdGVzIG9mIHRoZSBnYW1lLlxyXG4gKi9cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFX1NDUkVFTixcclxuICAgIFRVVE9SSUFMX1NDUkVFTixcclxuICAgIFdBSVRJTkdfRk9SX0JJVEUsXHJcbiAgICBSRUVMSU5HX01JTklHQU1FLFxyXG4gICAgUkVFTElOR19VUF9BTklNQVRJT04sIC8vIE5ldyBzdGF0ZSBmb3IgZmlzaCByZWVsaW5nIGFuaW1hdGlvblxyXG4gICAgR0FNRV9PVkVSLFxyXG59XHJcblxyXG4vKipcclxuICogQm9iYmVyIGdhbWUgb2JqZWN0LlxyXG4gKi9cclxuY2xhc3MgQm9iYmVyIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gaW1hZ2VOYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyKSB7XHJcbiAgICAgICAgY29uc3QgaW1nID0gYXNzZXRNYW5hZ2VyLmdldEltYWdlKHRoaXMuaW1hZ2VOYW1lKTtcclxuICAgICAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCB0aGlzLnggLSB0aGlzLndpZHRoIC8gMiwgdGhpcy55IC0gdGhpcy5oZWlnaHQgLyAyLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogRmlzaCBnYW1lIG9iamVjdC5cclxuICovXHJcbmNsYXNzIEZpc2gge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2VOYW1lOiBzdHJpbmc7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZGF0YTogRmlzaERhdGE7IC8vIFJlZmVyZW5jZSB0byBpdHMgZGF0YSBjb25maWdcclxuICAgIGRpcmVjdGlvbjogbnVtYmVyOyAvLyAtMSBmb3IgbGVmdCwgMSBmb3IgcmlnaHRcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGRhdGE6IEZpc2hEYXRhKSB7XHJcbiAgICAgICAgdGhpcy54ID0geDtcclxuICAgICAgICB0aGlzLnkgPSB5O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLmltYWdlTmFtZSA9IGRhdGEuaW1hZ2U7XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IGRhdGEuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5kYXRhID0gZGF0YTtcclxuICAgICAgICB0aGlzLmRpcmVjdGlvbiA9IE1hdGgucmFuZG9tKCkgPCAwLjUgPyAtMSA6IDE7IC8vIFN0YXJ0IG1vdmluZyByYW5kb21seVxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgY2FudmFzV2lkdGg6IG51bWJlciwgYm9iYmVyWDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54ICs9IHRoaXMuc3BlZWQgKiB0aGlzLmRpcmVjdGlvbiAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gU2ltcGxlIGJvdW5kYXJ5IGNoZWNrIGFuZCBjaGFuZ2UgZGlyZWN0aW9uXHJcbiAgICAgICAgaWYgKHRoaXMueCA8IDAgfHwgdGhpcy54ID4gY2FudmFzV2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy5kaXJlY3Rpb24gKj0gLTE7XHJcbiAgICAgICAgICAgIHRoaXMueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNhbnZhc1dpZHRoLCB0aGlzLngpKTsgLy8gQ2xhbXAgcG9zaXRpb25cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFkZCBhIHNsaWdodCBwdWxsIHRvd2FyZHMgdGhlIGJvYmJlciB3aGVuIGNsb3NlXHJcbiAgICAgICAgLy8gVGhpcyBtYWtlcyBmaXNoIG1vcmUgbGlrZWx5IHRvIGJlIG5lYXIgdGhlIGJvYmJlciBpZiBwbGF5ZXIgaG9sZHMgaXQgc3RpbGxcclxuICAgICAgICBjb25zdCBkaXN0YW5jZVRvQm9iYmVyID0gTWF0aC5hYnModGhpcy54IC0gYm9iYmVyWCk7XHJcbiAgICAgICAgaWYgKGRpc3RhbmNlVG9Cb2JiZXIgPCAyMDApIHsgLy8gSWYgd2l0aGluIDIwMHB4IG9mIGJvYmJlclxyXG4gICAgICAgICAgICBjb25zdCBwdWxsRGlyZWN0aW9uID0gKGJvYmJlclggLSB0aGlzLnggPiAwKSA/IDEgOiAtMTtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHB1bGxEaXJlY3Rpb24gKiB0aGlzLnNwZWVkICogZGVsdGFUaW1lICogKDEgLSBkaXN0YW5jZVRvQm9iYmVyIC8gMjAwKSAqIDAuNTsgLy8gV2Vha2VyIHB1bGxcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIpIHtcclxuICAgICAgICBjb25zdCBpbWcgPSBhc3NldE1hbmFnZXIuZ2V0SW1hZ2UodGhpcy5pbWFnZU5hbWUpO1xyXG4gICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgY3R4LnNhdmUoKTtcclxuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSh0aGlzLngsIHRoaXMueSk7XHJcbiAgICAgICAgICAgIC8vIEZsaXAgaW1hZ2UgaWYgbW92aW5nIGxlZnRcclxuICAgICAgICAgICAgaWYgKHRoaXMuZGlyZWN0aW9uID09PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgY3R4LnNjYWxlKC0xLCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgLXRoaXMud2lkdGggLyAyLCAtdGhpcy5oZWlnaHQgLyAyLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgICAgIGN0eC5yZXN0b3JlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogTWFpbiBHYW1lIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBtYW5hZ2luZyBnYW1lIHN0YXRlLCBsb2dpYywgYW5kIHJlbmRlcmluZy5cclxuICovXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlciA9IG5ldyBBc3NldE1hbmFnZXIoKTtcclxuICAgIHByaXZhdGUgY3VycmVudFN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG4gICAgcHJpdmF0ZSBiZ21BdWRpbzogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZDtcclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGdhbWVUaW1lcjogbnVtYmVyID0gMDsgLy8gSW4gc2Vjb25kc1xyXG4gICAgcHJpdmF0ZSBmaXNoU3Bhd25UaW1lcjogbnVtYmVyID0gMDsgLy8gSW4gc2Vjb25kc1xyXG4gICAgcHJpdmF0ZSBmaXNoZXM6IEZpc2hbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBib2JiZXIhOiBCb2JiZXI7XHJcbiAgICBwcml2YXRlIGtleXNQcmVzc2VkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcclxuICAgIHByaXZhdGUgY2F1Z2h0RmlzaE5hbWU6IHN0cmluZyB8IG51bGwgPSBudWxsOyAvLyBGb3IgZGlzcGxheWluZyBjYXRjaCBvdXRjb21lXHJcbiAgICBwcml2YXRlIG91dGNvbWVEaXNwbGF5VGltZXI6IG51bWJlciA9IDA7IC8vIEhvdyBsb25nIHRvIGRpc3BsYXkgb3V0Y29tZVxyXG5cclxuICAgIC8vIEJvYmJlciBtb3ZlbWVudFxyXG4gICAgcHJpdmF0ZSBib2JiZXJNb3ZlRGlyZWN0aW9uOiBudW1iZXIgPSAwOyAvLyAwOiBub25lLCAtMTogdXAsIDE6IGRvd25cclxuXHJcbiAgICAvLyBCaXRlIGRldGVjdGlvblxyXG4gICAgcHJpdmF0ZSBmaXNoVW5kZXJCb2JiZXI6IEZpc2ggfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgZmlzaFVuZGVyQm9iYmVyVGltZXI6IG51bWJlciA9IDA7XHJcblxyXG4gICAgLy8gTWluaS1nYW1lIHZhcmlhYmxlc1xyXG4gICAgcHJpdmF0ZSBtaW5pR2FtZVN1Y2Nlc3M6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lRmFpbHVyZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbWluaUdhbWVUaW1lcjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbWluaUdhbWVQb2ludGVyUG9zaXRpb246IG51bWJlciA9IDA7IC8vIC0xIHRvIDEgcmVwcmVzZW50aW5nIGxlZnQgdG8gcmlnaHRcclxuICAgIHByaXZhdGUgbWluaUdhbWVUYXJnZXRab25lQ2VudGVyOiBudW1iZXIgPSAwOyAvLyAtMSB0byAxXHJcbiAgICBwcml2YXRlIGN1cnJlbnRGaXNoSW5NaW5pZ2FtZTogRmlzaCB8IHVuZGVmaW5lZDsgLy8gVGhlIGFjdHVhbCBmaXNoIG9iamVjdCBjdXJyZW50bHkgYmVpbmcgcmVlbGVkXHJcblxyXG4gICAgLy8gUmVlbGluZyB1cCBhbmltYXRpb24gdmFyaWFibGVzXHJcbiAgICBwcml2YXRlIHJlZWxpbmdVcEFuaW1hdGlvblRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSByZWVsaW5nVXBEdXJhdGlvbjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgcmVlbGluZ1VwVGFyZ2V0WTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgaW5pdGlhbEJvYmJlcllGb3JSZWVsVXA6IG51bWJlciA9IDA7XHJcblxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCwgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIC8vIERlZmF1bHQgY2FudmFzIHNpemUsIHdpbGwgYmUgb3ZlcndyaXR0ZW4gYnkgY29uZmlnXHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSA4MDA7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gNjAwO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5oYW5kbGVLZXlEb3duKTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUtleVVwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN0YXJ0cyB0aGUgZ2FtZSBieSBsb2FkaW5nIGNvbmZpZ3VyYXRpb24gYW5kIGFzc2V0cywgdGhlbiBpbml0aWF0aW5nIHRoZSBnYW1lIGxvb3AuXHJcbiAgICAgKi9cclxuICAgIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZygpO1xyXG4gICAgICAgIHRoaXMuaW5pdEdhbWUoKTsgLy8gSW5pdGlhbGl6ZSBnYW1lIGNvbXBvbmVudHMgYWZ0ZXIgY29uZmlnIGlzIGxvYWRlZFxyXG4gICAgICAgIHRoaXMubG9vcCgwKTsgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgR2FtZUNvbmZpZztcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TWFuYWdlci5sb2FkQXNzZXRzKHRoaXMuY29uZmlnLmFzc2V0cyk7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLlRJVExFX1NDUkVFTjsgLy8gVHJhbnNpdGlvbiB0byB0aXRsZSBzY3JlZW4gYWZ0ZXIgbG9hZGluZ1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24gb3IgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGEgZmFpbHVyZSBzdGF0ZSBpZiBjcml0aWNhbCBsb2FkaW5nIGZhaWxzXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJbml0aWFsaXplcyBvciByZXNldHMgZ2FtZS1zcGVjaWZpYyB2YXJpYWJsZXMgZm9yIGEgbmV3IGdhbWUgc2Vzc2lvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBpbml0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmdhbWVUaW1lciA9IHRoaXMuY29uZmlnLmdhbWVEdXJhdGlvblNlY29uZHM7XHJcbiAgICAgICAgdGhpcy5maXNoU3Bhd25UaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5maXNoZXMgPSBbXTtcclxuICAgICAgICB0aGlzLmJvYmJlciA9IG5ldyBCb2JiZXIoXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJYICogdGhpcy5jYW52YXMud2lkdGgsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJZICogdGhpcy5jYW52YXMuaGVpZ2h0LCAvLyBCb2JiZXIgc3RhcnRzIGF0IHdhdGVyIHN1cmZhY2VcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuYm9iYmVyV2lkdGgsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmJvYmJlckhlaWdodCxcclxuICAgICAgICAgICAgJ2JvYmJlcidcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBTdG9wIGFueSBwcmV2aW91cyBCR00gYW5kIHN0YXJ0IG5ldyBvbmVcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5zdG9wU291bmQodGhpcy5iZ21BdWRpbyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYmdtQXVkaW8gPSB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2JnbScsIHRydWUsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpPy52b2x1bWUpO1xyXG5cclxuICAgICAgICAvLyBSZXNldCBtaW5pLWdhbWUgc3BlY2lmaWMgdmFyaWFibGVzXHJcbiAgICAgICAgdGhpcy5taW5pR2FtZVN1Y2Nlc3MgPSAwO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVGYWlsdXJlID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lVGltZXIgPSAwO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPSAwO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVUYXJnZXRab25lQ2VudGVyID0gMDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmNhdWdodEZpc2hOYW1lID0gbnVsbDtcclxuICAgICAgICB0aGlzLm91dGNvbWVEaXNwbGF5VGltZXIgPSAwO1xyXG5cclxuICAgICAgICAvLyBSZXNldCBib2JiZXIgYW5kIGJpdGUgZGV0ZWN0aW9uIHZhcmlhYmxlc1xyXG4gICAgICAgIHRoaXMuYm9iYmVyTW92ZURpcmVjdGlvbiA9IDA7XHJcbiAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXIgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuZmlzaFVuZGVyQm9iYmVyVGltZXIgPSAwO1xyXG5cclxuICAgICAgICAvLyBSZXNldCByZWVsaW5nIGFuaW1hdGlvbiB2YXJpYWJsZXNcclxuICAgICAgICB0aGlzLnJlZWxpbmdVcEFuaW1hdGlvblRpbWVyID0gMDtcclxuICAgICAgICB0aGlzLnJlZWxpbmdVcER1cmF0aW9uID0gMDtcclxuICAgICAgICB0aGlzLnJlZWxpbmdVcFRhcmdldFkgPSAwO1xyXG4gICAgICAgIHRoaXMuaW5pdGlhbEJvYmJlcllGb3JSZWVsVXAgPSAwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBrZXlib2FyZCBrZXkgZG93biBldmVudHMuXHJcbiAgICAgKiBAcGFyYW0gZXZlbnQgLSBUaGUgS2V5Ym9hcmRFdmVudCBvYmplY3QuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93biA9IChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgICAgIHRoaXMua2V5c1ByZXNzZWQuYWRkKGV2ZW50LmNvZGUpO1xyXG5cclxuICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ1NwYWNlJykge1xyXG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyBQcmV2ZW50IHBhZ2Ugc2Nyb2xsaW5nIHdpdGggc3BhY2ViYXJcclxuXHJcbiAgICAgICAgICAgIHN3aXRjaCAodGhpcy5jdXJyZW50U3RhdGUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU47XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZWxlY3QnKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRVVE9SSUFMX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5SRUVMSU5HX01JTklHQU1FOlxyXG4gICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgYXBwbHkgZWZmZWN0IGlmIHdpdGhpbiB0YXJnZXQgem9uZSBmb3IgbW9yZSBjaGFsbGVuZ2VcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab25lU3RhcnQgPSB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciAtIHRoaXMuY29uZmlnLm1pbmlHYW1lVGFyZ2V0Wm9uZVdpZHRoIC8gMjtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab25lRW5kID0gdGhpcy5taW5pR2FtZVRhcmdldFpvbmVDZW50ZXIgKyB0aGlzLmNvbmZpZy5taW5pR2FtZVRhcmdldFpvbmVXaWR0aCAvIDI7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPj0gdGFyZ2V0Wm9uZVN0YXJ0ICYmIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPD0gdGFyZ2V0Wm9uZUVuZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm1pbmlHYW1lU3VjY2VzcyArPSB0aGlzLmNvbmZpZy5taW5pR2FtZVByZXNzRWZmZWN0O1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3JlZWwnLCBmYWxzZSwgMC43KTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7IC8vIFJlc2V0IGdhbWUgc3RhdGVcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU47IC8vIEdvIGJhY2sgdG8gdGl0bGUgZm9yIHJlc3RhcnRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NlbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLldBSVRJTkdfRk9SX0JJVEUpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdBcnJvd1VwJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2JiZXJNb3ZlRGlyZWN0aW9uID0gLTE7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQuY29kZSA9PT0gJ0Fycm93RG93bicpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9iYmVyTW92ZURpcmVjdGlvbiA9IDE7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIGtleWJvYXJkIGtleSB1cCBldmVudHMuXHJcbiAgICAgKiBAcGFyYW0gZXZlbnQgLSBUaGUgS2V5Ym9hcmRFdmVudCBvYmplY3QuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAgPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkID0+IHtcclxuICAgICAgICB0aGlzLmtleXNQcmVzc2VkLmRlbGV0ZShldmVudC5jb2RlKTtcclxuICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ0Fycm93VXAnIHx8IGV2ZW50LmNvZGUgPT09ICdBcnJvd0Rvd24nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYm9iYmVyTW92ZURpcmVjdGlvbiA9IDA7IC8vIFN0b3AgYm9iYmVyIG1vdmVtZW50XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgYnkgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLlxyXG4gICAgICogQHBhcmFtIGN1cnJlbnRUaW1lIC0gVGhlIGN1cnJlbnQgdGltZSBwcm92aWRlZCBieSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgbG9vcCA9IChjdXJyZW50VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCk6IHZvaWQgPT4ge1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ29udmVydCB0byBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMuZHJhdygpO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5sb29wKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgZ2FtZSBsb2dpYyBiYXNlZCBvbiB0aGUgY3VycmVudCBzdGF0ZSBhbmQgdGltZSBlbGFwc2VkLlxyXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSAtIFRoZSB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgZnJhbWUsIGluIHNlY29uZHMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuTE9BRElORykgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBBdHRlbXB0IHRvIHBsYXkgQkdNIGlmIGl0IHBhdXNlZCwgdHlwaWNhbGx5IGR1ZSB0byBicm93c2VyIGF1dG9wbGF5IHBvbGljaWVzXHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8gJiYgdGhpcy5iZ21BdWRpby5wYXVzZWQgJiYgdGhpcy5jdXJyZW50U3RhdGUgIT09IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU4gJiYgdGhpcy5jdXJyZW50U3RhdGUgIT09IEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU4pIHtcclxuICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHJlc3VtZSBCR006XCIsIGUpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5jdXJyZW50U3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOOlxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU46XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIC8vIE5vIHNwZWNpZmljIHVwZGF0ZSBsb2dpYywganVzdCB3YWl0aW5nIGZvciB1c2VyIGlucHV0IHRvIHRyYW5zaXRpb25cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZ2FtZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHRoaXMuYXNzZXRNYW5hZ2VyLnN0b3BTb3VuZCh0aGlzLmJnbUF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2dhbWVPdmVyU291bmQnKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgYm9iYmVyIHBvc2l0aW9uIGJhc2VkIG9uIGlucHV0XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5ib2JiZXJNb3ZlRGlyZWN0aW9uICE9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib2JiZXIueSArPSB0aGlzLmJvYmJlck1vdmVEaXJlY3Rpb24gKiB0aGlzLmNvbmZpZy5ib2JiZXJNb3ZlU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib2JiZXIueSA9IE1hdGgubWF4KFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5taW5Cb2JiZXJZUmF0aW8gKiB0aGlzLmNhbnZhcy5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIE1hdGgubWluKHRoaXMuY29uZmlnLm1heEJvYmJlcllSYXRpbyAqIHRoaXMuY2FudmFzLmhlaWdodCwgdGhpcy5ib2JiZXIueSlcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBmaXNoIG1vdmVtZW50LCBleGNsdWRpbmcgYW55IGZpc2ggY3VycmVudGx5IHVuZGVyIHRoZSBib2JiZXIgZm9yIGEgYml0ZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5maXNoZXMuZm9yRWFjaChmaXNoID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZmlzaCAhPT0gdGhpcy5maXNoVW5kZXJCb2JiZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlzaC51cGRhdGUoZGVsdGFUaW1lICogdGhpcy5jb25maWcuZmlzaFN3aW1TcGVlZE11bHRpcGxpZXIsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmJvYmJlci54KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBTcGF3biBmaXNoXHJcbiAgICAgICAgICAgICAgICB0aGlzLmZpc2hTcGF3blRpbWVyICs9IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmZpc2hTcGF3blRpbWVyID49IHRoaXMuY29uZmlnLmZpc2hTcGF3bkludGVydmFsU2Vjb25kcykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlzaFNwYXduVGltZXIgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25GaXNoKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gTWFuYWdlIG91dGNvbWUgZGlzcGxheVxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY2F1Z2h0RmlzaE5hbWUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm91dGNvbWVEaXNwbGF5VGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLm91dGNvbWVEaXNwbGF5VGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNhdWdodEZpc2hOYW1lID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGJpdGUgb25seSBpZiBubyBvdXRjb21lIGlzIGN1cnJlbnRseSBkaXNwbGF5ZWRcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNhdWdodEZpc2hOYW1lID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IGNsb3Nlc3RGaXNoOiBGaXNoIHwgbnVsbCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1pbkRpc3RhbmNlU3EgPSBJbmZpbml0eTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBmaXNoIG9mIHRoaXMuZmlzaGVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGR4ID0gZmlzaC54IC0gdGhpcy5ib2JiZXIueDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZHkgPSBmaXNoLnkgLSB0aGlzLmJvYmJlci55O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkaXN0YW5jZVNxID0gZHggKiBkeCArIGR5ICogZHk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB3aXRoaW4gYml0ZVRyaWdnZXJSYWRpdXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRpc3RhbmNlU3EgPD0gdGhpcy5jb25maWcuYml0ZVRyaWdnZXJSYWRpdXMgKiB0aGlzLmNvbmZpZy5iaXRlVHJpZ2dlclJhZGl1cykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRpc3RhbmNlU3EgPCBtaW5EaXN0YW5jZVNxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWluRGlzdGFuY2VTcSA9IGRpc3RhbmNlU3E7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xvc2VzdEZpc2ggPSBmaXNoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoY2xvc2VzdEZpc2gpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZmlzaFVuZGVyQm9iYmVyID09PSBjbG9zZXN0RmlzaCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXJUaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5maXNoVW5kZXJCb2JiZXJUaW1lciA+PSB0aGlzLmNvbmZpZy5iaXRlSG9sZER1cmF0aW9uU2Vjb25kcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLlJFRUxJTkdfTUlOSUdBTUU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiaXRlJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbml0TWluaUdhbWUodGhpcy5maXNoVW5kZXJCb2JiZXIpOyAvLyBQYXNzIHRoZSBhY3R1YWwgRmlzaCBvYmplY3RcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hVbmRlckJvYmJlciA9IG51bGw7IC8vIFJlc2V0IGZvciBuZXh0IGJpdGVcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hVbmRlckJvYmJlclRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5ldyBmaXNoIGRldGVjdGVkIG9yIHN3aXRjaGVkIHRvIGEgZGlmZmVyZW50IGNsb3Nlc3QgZmlzaFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXIgPSBjbG9zZXN0RmlzaDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlzaFVuZGVyQm9iYmVyVGltZXIgPSAwOyAvLyBTdGFydCB0aW1lciBmb3IgdGhpcyBuZXcgZmlzaFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTm8gZmlzaCBuZWFyIGJvYmJlclxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hVbmRlckJvYmJlciA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlzaFVuZGVyQm9iYmVyVGltZXIgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5SRUVMSU5HX01JTklHQU1FOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5taW5pR2FtZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1pbmlHYW1lVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzb2x2ZU1pbmlHYW1lKCk7IC8vIFRpbWUncyB1cCwgcmVzb2x2ZSBiYXNlZCBvbiBzdWNjZXNzL2ZhaWx1cmVcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBEZWNheSBzdWNjZXNzIG92ZXIgdGltZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5taW5pR2FtZVN1Y2Nlc3MgPSBNYXRoLm1heCgwLCB0aGlzLm1pbmlHYW1lU3VjY2VzcyAtIHRoaXMuY29uZmlnLm1pbmlHYW1lRGVjYXlSYXRlICogZGVsdGFUaW1lKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgcG9pbnRlciBwb3NpdGlvbiAobW92ZXMgbGVmdC9yaWdodClcclxuICAgICAgICAgICAgICAgIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gKz0gdGhpcy5jb25maWcubWluaUdhbWVCYXNlUG9pbnRlclNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPiAxIHx8IHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPCAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLm1pbmlHYW1lQmFzZVBvaW50ZXJTcGVlZCAqPSAtMTsgLy8gUmV2ZXJzZSBkaXJlY3Rpb25cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uID0gTWF0aC5tYXgoLTEsIE1hdGgubWluKDEsIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24pKTsgLy8gQ2xhbXBcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBwb2ludGVyIGlzIG91dHNpZGUgdGFyZ2V0IHpvbmVcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFpvbmVTdGFydCA9IHRoaXMubWluaUdhbWVUYXJnZXRab25lQ2VudGVyIC0gdGhpcy5jb25maWcubWluaUdhbWVUYXJnZXRab25lV2lkdGggLyAyO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0Wm9uZUVuZCA9IHRoaXMubWluaUdhbWVUYXJnZXRab25lQ2VudGVyICsgdGhpcy5jb25maWcubWluaUdhbWVUYXJnZXRab25lV2lkdGggLyAyO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmICghKHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPj0gdGFyZ2V0Wm9uZVN0YXJ0ICYmIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPD0gdGFyZ2V0Wm9uZUVuZCkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm1pbmlHYW1lRmFpbHVyZSArPSBkZWx0YVRpbWU7IC8vIEZhaWx1cmUgaW5jcmVhc2VzIG92ZXIgdGltZSBvdXRzaWRlIHpvbmVcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5taW5pR2FtZUZhaWx1cmUgPj0gdGhpcy5jb25maWcubWluaUdhbWVGYWlsdXJlVGhyZXNob2xkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZXNvbHZlTWluaUdhbWUoZmFsc2UpOyAvLyBGb3JjZWQgZmFpbCBpZiBmYWlsdXJlIHRocmVzaG9sZCByZWFjaGVkXHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMubWluaUdhbWVTdWNjZXNzID49IHRoaXMuY29uZmlnLm1pbmlHYW1lU3VjY2Vzc1RhcmdldCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzb2x2ZU1pbmlHYW1lKHRydWUpOyAvLyBGb3JjZWQgc3VjY2VzcyBpZiBzdWNjZXNzIHRhcmdldCByZWFjaGVkXHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIG90aGVyIGZpc2ggbW92ZW1lbnQgZHVyaW5nIG1pbmktZ2FtZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5maXNoZXMuZm9yRWFjaChmaXNoID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZmlzaCAhPT0gdGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlzaC51cGRhdGUoZGVsdGFUaW1lICogdGhpcy5jb25maWcuZmlzaFN3aW1TcGVlZE11bHRpcGxpZXIsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmJvYmJlci54KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5SRUVMSU5HX1VQX0FOSU1BVElPTjpcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlc2V0IGJvYmJlciBZIHRvIGluaXRpYWwgd2F0ZXIgc3VyZmFjZSBsZXZlbFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYm9iYmVyLnkgPSB0aGlzLmNvbmZpZy5pbml0aWFsQm9iYmVyWSAqIHRoaXMuY2FudmFzLmhlaWdodDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlZWxpbmdVcEFuaW1hdGlvblRpbWVyICs9IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHByb2dyZXNzID0gTWF0aC5taW4oMSwgdGhpcy5yZWVsaW5nVXBBbmltYXRpb25UaW1lciAvIHRoaXMucmVlbGluZ1VwRHVyYXRpb24pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIEFuaW1hdGUgYm9iYmVyIG1vdmluZyB1cFxyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2JiZXIueSA9IHRoaXMuaW5pdGlhbEJvYmJlcllGb3JSZWVsVXAgKyAodGhpcy5yZWVsaW5nVXBUYXJnZXRZIC0gdGhpcy5pbml0aWFsQm9iYmVyWUZvclJlZWxVcCkgKiBwcm9ncmVzcztcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBGaXNoIGZvbGxvd3MgYm9iYmVyJ3MgWCwgYW5kIHN0YXlzIHNsaWdodGx5IGJlbG93IGJvYmJlcidzIFlcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lLnggPSB0aGlzLmJvYmJlci54O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUueSA9IHRoaXMuYm9iYmVyLnkgKyAodGhpcy5ib2JiZXIuaGVpZ2h0IC8gMikgKyAodGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUuaGVpZ2h0IC8gMikgLSAxMDsgLy8gMTBweCBvZmZzZXQgZm9yIHZpc3VhbCBhdHRhY2htZW50XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHByb2dyZXNzID49IDEpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBBbmltYXRpb24gZmluaXNoZWRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lLmRhdGEuc2NvcmU7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdjYXRjaCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2F1Z2h0RmlzaE5hbWUgPSB0aGlzLmNvbmZpZy51aS5maXNoQ2F1Z2h0O1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMub3V0Y29tZURpc3BsYXlUaW1lciA9IDI7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgc3VjY2Vzc2Z1bGx5IGNhdWdodCBmaXNoIGZyb20gdGhlIGFjdGl2ZSBmaXNoZXMgYXJyYXlcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuZmlzaGVzLmluZGV4T2YodGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbmRleCA+IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlzaGVzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlc2V0IGJvYmJlciBZIHRvIGluaXRpYWwgd2F0ZXIgc3VyZmFjZSBsZXZlbCBmb3IgbmV4dCBjYXN0XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib2JiZXIueSA9IHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJZICogdGhpcy5jYW52YXMuaGVpZ2h0O1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBvdGhlciBmaXNoIG1vdmVtZW50IGR1cmluZyByZWVsaW5nIHVwIGFuaW1hdGlvblxyXG4gICAgICAgICAgICAgICAgdGhpcy5maXNoZXMuZm9yRWFjaChmaXNoID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZmlzaCAhPT0gdGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZmlzaC51cGRhdGUoZGVsdGFUaW1lICogdGhpcy5jb25maWcuZmlzaFN3aW1TcGVlZE11bHRpcGxpZXIsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmJvYmJlci54KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNwYXducyBhIG5ldyBmaXNoIGF0IGEgcmFuZG9tIHBvc2l0aW9uIGJlbG93IHRoZSB3YXRlciBsaW5lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwYXduRmlzaCgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmaXNoQ29uZmlnID0gdGhpcy5jb25maWcuZmlzaGVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRoaXMuY29uZmlnLmZpc2hlcy5sZW5ndGgpXTtcclxuICAgICAgICBjb25zdCBzcGF3blggPSBNYXRoLnJhbmRvbSgpICogdGhpcy5jYW52YXMud2lkdGg7XHJcblxyXG4gICAgICAgIGNvbnN0IHdhdGVyTGluZVkgPSB0aGlzLmNvbmZpZy5pbml0aWFsQm9iYmVyWSAqIHRoaXMuY2FudmFzLmhlaWdodDtcclxuICAgICAgICBjb25zdCBtaW5TcGF3blkgPSB3YXRlckxpbmVZICsgdGhpcy5jb25maWcuZmlzaERlZmF1bHRIZWlnaHQgLyAyICsgMTA7IC8vIDEwcHggYnVmZmVyIGJlbG93IHdhdGVyIHN1cmZhY2VcclxuICAgICAgICBjb25zdCBtYXhTcGF3blkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLSB0aGlzLmNvbmZpZy5maXNoRGVmYXVsdEhlaWdodCAvIDIgLSAxMDsgLy8gMTBweCBidWZmZXIgZnJvbSBib3R0b20gZWRnZVxyXG5cclxuICAgICAgICAvLyBFbnN1cmUgdGhlcmUncyBhIHZhbGlkIHJhbmdlIGZvciBzcGF3bmluZ1xyXG4gICAgICAgIGlmIChtaW5TcGF3blkgPCBtYXhTcGF3blkpIHtcclxuICAgICAgICAgICAgY29uc3Qgc3Bhd25ZID0gbWluU3Bhd25ZICsgTWF0aC5yYW5kb20oKSAqIChtYXhTcGF3blkgLSBtaW5TcGF3blkpO1xyXG4gICAgICAgICAgICBjb25zdCBuZXdGaXNoID0gbmV3IEZpc2goXHJcbiAgICAgICAgICAgICAgICBzcGF3blgsXHJcbiAgICAgICAgICAgICAgICBzcGF3blksXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5maXNoRGVmYXVsdFdpZHRoLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jb25maWcuZmlzaERlZmF1bHRIZWlnaHQsXHJcbiAgICAgICAgICAgICAgICBmaXNoQ29uZmlnXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHRoaXMuZmlzaGVzLnB1c2gobmV3RmlzaCk7XHJcblxyXG4gICAgICAgICAgICAvLyBMaW1pdCB0aGUgbnVtYmVyIG9mIGZpc2ggb24gc2NyZWVuXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmZpc2hlcy5sZW5ndGggPiB0aGlzLmNvbmZpZy5tYXhGaXNoT25TY3JlZW4pIHtcclxuICAgICAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgb2xkZXN0IGZpc2gsIGJ1dCBvbmx5IGlmIGl0J3Mgbm90IHRoZSBvbmUgY3VycmVudGx5IGVuZ2FnZWQgaW4gbWluaWdhbWUvYW5pbWF0aW9uXHJcbiAgICAgICAgICAgICAgICBsZXQgcmVtb3ZlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmZpc2hlcy5sZW5ndGggLSAxOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5maXNoZXNbaV0gIT09IHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lICYmIHRoaXMuZmlzaGVzW2ldICE9PSB0aGlzLmZpc2hVbmRlckJvYmJlcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hlcy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgb2xkZXN0IG9uZSB3YXMgdGhlIGN1cnJlbnQgZmlzaCwganVzdCBkb24ndCByZW1vdmUgYW55dGhpbmcsIG9yIGZvcmNlIHJlbW92YWwgaWYgYXJyYXkgZ2V0cyB0b28gYmlnLlxyXG4gICAgICAgICAgICAgICAgLy8gRm9yIG5vdywgc2ltcGxlcjogaWYgaXQncyB0aGUgY3VycmVudCBmaXNoLCBpdCB3b24ndCBiZSBpbiB0aGUgYWN0aXZlIGFycmF5IGFueXdheSBhZnRlciBtaW5pZ2FtZSBzdGFydC5cclxuICAgICAgICAgICAgICAgIC8vIFNvLCBjdXJyZW50IGxvZ2ljIG9mIHRoaXMuZmlzaGVzLnNoaWZ0KCkgaXMgZmluZSBpZiBjdXJyZW50RmlzaEluTWluaWdhbWUgaXMgYWxyZWFkeSByZW1vdmVkLlxyXG4gICAgICAgICAgICAgICAgLy8gUmUtZXZhbHVhdGU6IGN1cnJlbnRGaXNoSW5NaW5pZ2FtZSBpcyBOT1QgcmVtb3ZlZCBmcm9tIGBmaXNoZXNgIGFycmF5IGF0IGBpbml0TWluaUdhbWVgLlxyXG4gICAgICAgICAgICAgICAgLy8gU28gd2UgbmVlZCB0byBlbnN1cmUgd2UgZG9uJ3QgcmVtb3ZlIGl0IGZyb20gdGhlIHN0YXJ0IG9mIHRoZSBhcnJheSBpZiBpdCdzIHRoZSBvbGRlc3QuXHJcbiAgICAgICAgICAgICAgICBpZiAoIXJlbW92ZWQgJiYgdGhpcy5maXNoZXMubGVuZ3RoID4gdGhpcy5jb25maWcubWF4RmlzaE9uU2NyZWVuICYmIHRoaXMuZmlzaGVzWzBdICE9PSB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSAmJiB0aGlzLmZpc2hlc1swXSAhPT0gdGhpcy5maXNoVW5kZXJCb2JiZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hlcy5zaGlmdCgpOyAvLyBGYWxsYmFjayB0byByZW1vdmluZyB0aGUgYWJzb2x1dGUgb2xkZXN0IGlmIG5vdCBlbmdhZ2VkXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJGaXNoIHNwYXduIHJhbmdlIGlzIGludmFsaWQuIENoZWNrIGNhbnZhcyBkaW1lbnNpb25zLCBpbml0aWFsQm9iYmVyWSwgYW5kIGZpc2hEZWZhdWx0SGVpZ2h0IGluIGNvbmZpZy5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5pdGlhbGl6ZXMgdGhlIHJlZWxpbmcgbWluaS1nYW1lLlxyXG4gICAgICogQHBhcmFtIGZpc2ggLSBUaGUgYWN0dWFsIEZpc2ggb2JqZWN0IHRoYXQgaW5pdGlhdGVkIHRoZSBtaW5pLWdhbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaW5pdE1pbmlHYW1lKGZpc2g6IEZpc2gpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lU3VjY2VzcyA9IDA7XHJcbiAgICAgICAgdGhpcy5taW5pR2FtZUZhaWx1cmUgPSAwO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVUaW1lciA9IHRoaXMuY29uZmlnLm1pbmlHYW1lRHVyYXRpb25TZWNvbmRzO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPSAwOyAvLyBTdGFydCBwb2ludGVyIGF0IGNlbnRlclxyXG4gICAgICAgIHRoaXMubWluaUdhbWVUYXJnZXRab25lQ2VudGVyID0gKE1hdGgucmFuZG9tKCkgKiAxLjYpIC0gMC44OyAvLyBSYW5kb20gcG9zaXRpb24gYmV0d2VlbiAtMC44IGFuZCAwLjhcclxuICAgICAgICB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSA9IGZpc2g7IC8vIFN0b3JlIHRoZSBhY3R1YWwgZmlzaCBpbnN0YW5jZSAoaXQgcmVtYWlucyBpbiB0aGUgZmlzaGVzIGFycmF5KVxyXG5cclxuICAgICAgICAvLyBBZGp1c3QgbWluaS1nYW1lIHBhcmFtZXRlcnMgYmFzZWQgb24gZmlzaCBkaWZmaWN1bHR5XHJcbiAgICAgICAgdGhpcy5jb25maWcubWluaUdhbWVCYXNlUG9pbnRlclNwZWVkID0gMS4wICsgKGZpc2guZGF0YS5taW5pR2FtZURpZmZpY3VsdHkgKiAwLjUpO1xyXG4gICAgICAgIC8vIFJhbmRvbWl6ZSBpbml0aWFsIHBvaW50ZXIgc3BlZWQgZGlyZWN0aW9uXHJcbiAgICAgICAgaWYgKE1hdGgucmFuZG9tKCkgPCAwLjUpIHsgdGhpcy5jb25maWcubWluaUdhbWVCYXNlUG9pbnRlclNwZWVkICo9IC0xOyB9XHJcbiAgICAgICAgdGhpcy5jb25maWcubWluaUdhbWVEZWNheVJhdGUgPSAwLjggKyAoZmlzaC5kYXRhLm1pbmlHYW1lRGlmZmljdWx0eSAqIDAuMik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXNvbHZlcyB0aGUgbWluaS1nYW1lLCBkZXRlcm1pbmluZyBpZiB0aGUgZmlzaCB3YXMgY2F1Z2h0IG9yIGxvc3QuXHJcbiAgICAgKiBAcGFyYW0gZm9yY2VkT3V0Y29tZSAtIE9wdGlvbmFsIGJvb2xlYW4gdG8gZm9yY2UgYSBzdWNjZXNzIG9yIGZhaWx1cmUgKGUuZy4sIGlmIHRhcmdldC90aHJlc2hvbGQgcmVhY2hlZCBlYXJseSkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcmVzb2x2ZU1pbmlHYW1lKGZvcmNlZE91dGNvbWU/OiBib29sZWFuKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgY2F1Z2h0ID0gZm9yY2VkT3V0Y29tZSAhPT0gdW5kZWZpbmVkID8gZm9yY2VkT3V0Y29tZSA6ICh0aGlzLm1pbmlHYW1lU3VjY2VzcyA+PSB0aGlzLmNvbmZpZy5taW5pR2FtZVN1Y2Nlc3NUYXJnZXQpO1xyXG5cclxuICAgICAgICBpZiAoY2F1Z2h0ICYmIHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lKSB7XHJcbiAgICAgICAgICAgIC8vIEluaXRpYXRlIHJlZWxpbmcgdXAgYW5pbWF0aW9uIGluc3RlYWQgb2YgaW5zdGFudGx5IGFkZGluZyBzY29yZVxyXG4gICAgICAgICAgICB0aGlzLmluaXRpYWxCb2JiZXJZRm9yUmVlbFVwID0gdGhpcy5ib2JiZXIueTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHdhdGVyTGluZVkgPSB0aGlzLmNvbmZpZy5pbml0aWFsQm9iYmVyWSAqIHRoaXMuY2FudmFzLmhlaWdodDtcclxuICAgICAgICAgICAgY29uc3QgYm9hdEltYWdlID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2JvYXQnKTtcclxuICAgICAgICAgICAgY29uc3QgYm9hdEhlaWdodCA9IGJvYXRJbWFnZSA/IGJvYXRJbWFnZS5oZWlnaHQgOiAwO1xyXG4gICAgICAgICAgICBjb25zdCBib2F0WSA9IHdhdGVyTGluZVkgLSBib2F0SGVpZ2h0OyAvLyBUb3AgWSBvZiB0aGUgYm9hdCBpbWFnZVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gVGFyZ2V0IHRoZSBib2JiZXIgdG8gdGhlIHBvaW50IHdoZXJlIHRoZSBmaXNoaW5nIGxpbmUgb3JpZ2luYXRlcyBvbiB0aGUgYm9hdFxyXG4gICAgICAgICAgICB0aGlzLnJlZWxpbmdVcFRhcmdldFkgPSBib2F0WSArIHRoaXMuY29uZmlnLmZpc2hpbmdMaW5lT2Zmc2V0WTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMucmVlbGluZ1VwRHVyYXRpb24gPSB0aGlzLmNvbmZpZy5yZWVsaW5nVXBEdXJhdGlvblNlY29uZHM7XHJcbiAgICAgICAgICAgIHRoaXMucmVlbGluZ1VwQW5pbWF0aW9uVGltZXIgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5SRUVMSU5HX1VQX0FOSU1BVElPTjtcclxuXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gRmFpbHVyZSBwYXRoXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnZmFpbCcpO1xyXG4gICAgICAgICAgICB0aGlzLmNhdWdodEZpc2hOYW1lID0gdGhpcy5jb25maWcudWkuZmlzaExvc3Q7IC8vIERpc3BsYXkgXCJMb3N0IVwiIG1lc3NhZ2VcclxuICAgICAgICAgICAgdGhpcy5vdXRjb21lRGlzcGxheVRpbWVyID0gMjtcclxuXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgbG9zdCBmaXNoIGZyb20gdGhlIGBmaXNoZXNgIGFycmF5XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLmZpc2hlcy5pbmRleE9mKHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lKTtcclxuICAgICAgICAgICAgICAgIGlmIChpbmRleCA+IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoZXMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSA9IHVuZGVmaW5lZDsgLy8gQ2xlYXIgZmlzaCBpbiBtaW5pLWdhbWVcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuV0FJVElOR19GT1JfQklURTsgLy8gUmV0dXJuIHRvIHdhaXRpbmdcclxuICAgICAgICAgICAgLy8gUmVzZXQgYm9iYmVyIFkgdG8gaW5pdGlhbCB3YXRlciBzdXJmYWNlIGxldmVsXHJcbiAgICAgICAgICAgIHRoaXMuYm9iYmVyLnkgPSB0aGlzLmNvbmZpZy5pbml0aWFsQm9iYmVyWSAqIHRoaXMuY2FudmFzLmhlaWdodDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEcmF3cyBhbGwgZ2FtZSBlbGVtZW50cyB0byB0aGUgY2FudmFzIGJhc2VkIG9uIHRoZSBjdXJyZW50IGdhbWUgc3RhdGUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgYmFja2dyb3VuZCBmaXJzdCBmb3IgYWxsIHN0YXRlcyAoZXhjZXB0IGxvYWRpbmcpXHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdiYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgaWYgKGJhY2tncm91bmQpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJhY2tncm91bmQsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmN1cnJlbnRTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5MT0FESU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVFVUT1JJQUxfU0NSRUVOOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VHV0b3JpYWxTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFOlxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5SRUVMSU5HX01JTklHQU1FOlxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5SRUVMSU5HX1VQX0FOSU1BVElPTjogLy8gRHJhdyBnYW1lcGxheSBkdXJpbmcgcmVlbGluZyBhbmltYXRpb25cclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVwbGF5KCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5SRUVMSU5HX01JTklHQU1FKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3TWluaUdhbWVVSSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY2F1Z2h0RmlzaE5hbWUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdPdXRjb21lTWVzc2FnZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVwbGF5KCk7IC8vIERyYXcgZ2FtZSBzY2VuZSBiZWhpbmQgZ2FtZSBvdmVyIHNjcmVlblxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdMb2FkaW5nU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpLmxvYWRpbmd9ICR7TWF0aC5yb3VuZCh0aGlzLmFzc2V0TWFuYWdlci5nZXRMb2FkaW5nUHJvZ3Jlc3MoKSAqIDEwMCl9JWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC41KSc7IC8vIFNlbWktdHJhbnNwYXJlbnQgb3ZlcmxheVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnNDhweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkudGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS5wcmVzc1NwYWNlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VHV0b3JpYWxTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC41KSc7IC8vIFNlbWktdHJhbnNwYXJlbnQgb3ZlcmxheVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1x1Qzg3MFx1Qzc5MVx1QkM5NScsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDEyMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkudHV0b3JpYWxMaW5lMSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNjApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnR1dG9yaWFsTGluZTIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDMwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS50dXRvcmlhbExpbmUzLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnR1dG9yaWFsTGluZTQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDMwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS5wcmVzc1NwYWNlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVwbGF5KCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHdhdGVyTGluZVkgPSB0aGlzLmNvbmZpZy5pbml0aWFsQm9iYmVyWSAqIHRoaXMuY2FudmFzLmhlaWdodDtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBib2F0XHJcbiAgICAgICAgY29uc3QgYm9hdCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdib2F0Jyk7XHJcbiAgICAgICAgaWYgKGJvYXQpIHtcclxuICAgICAgICAgICAgY29uc3QgYm9hdFggPSB0aGlzLmNhbnZhcy53aWR0aCAvIDIgLSBib2F0LndpZHRoIC8gMjtcclxuICAgICAgICAgICAgY29uc3QgYm9hdFkgPSB3YXRlckxpbmVZIC0gYm9hdC5oZWlnaHQ7IC8vIEJvdHRvbSBvZiBib2F0IGF0IHdhdGVyIGxpbmVcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJvYXQsIGJvYXRYLCBib2F0WSwgYm9hdC53aWR0aCwgYm9hdC5oZWlnaHQpO1xyXG5cclxuICAgICAgICAgICAgLy8gRHJhdyBmaXNoaW5nIGxpbmUgKGZyb20gYm9hdCB0byBib2JiZXIpXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMjtcclxuICAgICAgICAgICAgdGhpcy5jdHguYmVnaW5QYXRoKCk7XHJcbiAgICAgICAgICAgIC8vIExpbmUgc3RhcnRzIGZyb20gdGhlIGJvYXQgZGlyZWN0bHkgYWJvdmUgdGhlIGJvYmJlcidzIGN1cnJlbnQgWCBwb3NpdGlvblxyXG4gICAgICAgICAgICAvLyBhbmQgYXQgYSBzcGVjaWZpZWQgWSBvZmZzZXQgb24gdGhlIGJvYXQuXHJcbiAgICAgICAgICAgIHRoaXMuY3R4Lm1vdmVUbyh0aGlzLmJvYmJlci54LCBib2F0WSArIHRoaXMuY29uZmlnLmZpc2hpbmdMaW5lT2Zmc2V0WSk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmxpbmVUbyh0aGlzLmJvYmJlci54LCB0aGlzLmJvYmJlci55KTsgLy8gTGluZSBnb2VzIGZyb20gbGluZSBzdGFydCBvbiBib2F0IHRvIGJvYmJlclxyXG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2UoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYm9iYmVyLmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRNYW5hZ2VyKTtcclxuICAgICAgICB0aGlzLmZpc2hlcy5mb3JFYWNoKGZpc2ggPT4gZmlzaC5kcmF3KHRoaXMuY3R4LCB0aGlzLmFzc2V0TWFuYWdlcikpOyAvLyBBbGwgZmlzaCwgaW5jbHVkaW5nIGN1cnJlbnRGaXNoSW5NaW5pZ2FtZSBpZiBwcmVzZW50XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUkgZWxlbWVudHMgKHNjb3JlLCB0aW1lcilcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpLnNjb3JlUHJlZml4fSR7dGhpcy5zY29yZX1gLCAxMCwgMzApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpLnRpbWVSZW1haW5pbmdQcmVmaXh9JHtNYXRoLmNlaWwodGhpcy5nYW1lVGltZXIpfWAsIDEwLCA2MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TWluaUdhbWVVSSgpOiB2b2lkIHtcclxuICAgICAgICAvLyBEcmF3IGJhY2tncm91bmQgb3ZlcmxheSBmb3IgbWluaS1nYW1lXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC43KSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMTUwLCB0aGlzLmNhbnZhcy53aWR0aCwgMTUwKTsgLy8gQm90dG9tIGJhciBhcmVhXHJcblxyXG4gICAgICAgIGNvbnN0IGJhclkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLSAxMDA7XHJcbiAgICAgICAgY29uc3QgYmFySGVpZ2h0ID0gMzA7XHJcbiAgICAgICAgY29uc3QgYmFyV2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aCAqIDAuODtcclxuICAgICAgICBjb25zdCBiYXJYID0gKHRoaXMuY2FudmFzLndpZHRoIC0gYmFyV2lkdGgpIC8gMjtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBtaW5pLWdhbWUgYmFyIGJhY2tncm91bmRcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnIzMzMyc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYmFyWCwgYmFyWSwgYmFyV2lkdGgsIGJhckhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgdGFyZ2V0IHpvbmVcclxuICAgICAgICBjb25zdCB0YXJnZXRab25lV2lkdGhQeCA9IGJhcldpZHRoICogdGhpcy5jb25maWcubWluaUdhbWVUYXJnZXRab25lV2lkdGg7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0Wm9uZVggPSBiYXJYICsgKHRoaXMubWluaUdhbWVUYXJnZXRab25lQ2VudGVyICogKGJhcldpZHRoIC8gMikpICsgKGJhcldpZHRoIC8gMikgLSAodGFyZ2V0Wm9uZVdpZHRoUHggLyAyKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAyNTUsIDAsIDAuNSknOyAvLyBHcmVlbiB0YXJnZXQgem9uZVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHRhcmdldFpvbmVYLCBiYXJZLCB0YXJnZXRab25lV2lkdGhQeCwgYmFySGVpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBwb2ludGVyXHJcbiAgICAgICAgY29uc3QgcG9pbnRlclggPSBiYXJYICsgKHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gKiAoYmFyV2lkdGggLyAyKSkgKyAoYmFyV2lkdGggLyAyKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAneWVsbG93JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChwb2ludGVyWCAtIDUsIGJhclkgLSAxMCwgMTAsIGJhckhlaWdodCArIDIwKTsgLy8gUG9pbnRlciB3aWRlciBhbmQgdGFsbGVyXHJcblxyXG4gICAgICAgIC8vIERyYXcgc3VjY2VzcyBiYXJcclxuICAgICAgICBjb25zdCBzdWNjZXNzQmFyV2lkdGggPSAodGhpcy5taW5pR2FtZVN1Y2Nlc3MgLyB0aGlzLmNvbmZpZy5taW5pR2FtZVN1Y2Nlc3NUYXJnZXQpICogYmFyV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsdWUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGJhclgsIGJhclkgKyBiYXJIZWlnaHQgKyAxMCwgc3VjY2Vzc0JhcldpZHRoLCAxMCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgZmFpbHVyZSBiYXJcclxuICAgICAgICBjb25zdCBmYWlsdXJlQmFyV2lkdGggPSAodGhpcy5taW5pR2FtZUZhaWx1cmUgLyB0aGlzLmNvbmZpZy5taW5pR2FtZUZhaWx1cmVUaHJlc2hvbGQpICogYmFyV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYmFyWCwgYmFyWSArIGJhckhlaWdodCArIDI1LCBmYWlsdXJlQmFyV2lkdGgsIDEwKTtcclxuXHJcbiAgICAgICAgLy8gRGlzcGxheSBpbnN0cnVjdGlvbnMgYW5kIHRpbWVyXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI4cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnJlZWxJbnN0cnVjdGlvbiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCBiYXJZIC0gMzApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzIwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpLnJlZWxUaW1lfSR7TWF0aC5jZWlsKHRoaXMubWluaUdhbWVUaW1lcil9c2AsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgYmFyWSArIGJhckhlaWdodCArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdPdXRjb21lTWVzc2FnZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5jYXVnaHRGaXNoTmFtZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjYpJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwLCB0aGlzLmNhbnZhcy53aWR0aCwgMTAwKTtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0MHB4IEFyaWFsJztcclxuICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY2F1Z2h0RmlzaE5hbWUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC43KSc7IC8vIERhcmsgb3ZlcmxheVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnNjBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkuZ2FtZU92ZXIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDgwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczNnB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHt0aGlzLmNvbmZpZy51aS5zY29yZVByZWZpeH0ke3RoaXMuc2NvcmV9YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS5wcmVzc1NwYWNlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA4MCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEluaXRpYWxpemUgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGlzIGZ1bGx5IGxvYWRlZFxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZCFcIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG4gICAgaWYgKCFjdHgpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGdldCAyRCByZW5kZXJpbmcgY29udGV4dCBmb3IgY2FudmFzIVwiKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgZ2FtZSA9IG5ldyBHYW1lKGNhbnZhcywgY3R4KTtcclxuICAgIGdhbWUuc3RhcnQoKTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQStFQSxJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFLSixNQUFNLGFBQWE7QUFBQSxFQUFuQjtBQUNJLGtCQUF3QyxvQkFBSSxJQUFJO0FBQ2hELGtCQUF3QyxvQkFBSSxJQUFJO0FBQ2hELHVCQUFjO0FBQ2QsdUJBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNZCxNQUFNLFdBQVcsUUFBNkM7QUFDMUQsU0FBSyxjQUFjLE9BQU8sT0FBTyxTQUFTLE9BQU8sT0FBTztBQUN4RCxVQUFNLFdBQTRCLENBQUM7QUFFbkMsZUFBVyxhQUFhLE9BQU8sUUFBUTtBQUNuQyxlQUFTLEtBQUssS0FBSyxVQUFVLFNBQVMsQ0FBQztBQUFBLElBQzNDO0FBQ0EsZUFBVyxlQUFlLE9BQU8sUUFBUTtBQUNyQyxlQUFTLEtBQUssS0FBSyxVQUFVLFdBQVcsQ0FBQztBQUFBLElBQzdDO0FBRUEsVUFBTSxRQUFRLElBQUksUUFBUTtBQUFBLEVBQzlCO0FBQUEsRUFFUSxVQUFVLFFBQXdDO0FBQ3RELFdBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3BDLFlBQU0sTUFBTSxJQUFJLE1BQU07QUFDdEIsVUFBSSxNQUFNLE9BQU87QUFDakIsVUFBSSxTQUFTLE1BQU07QUFDZixhQUFLLE9BQU8sSUFBSSxPQUFPLE1BQU0sR0FBRztBQUNoQyxhQUFLO0FBQ0wsZ0JBQVE7QUFBQSxNQUNaO0FBQ0EsVUFBSSxVQUFVLE1BQU07QUFDaEIsZ0JBQVEsTUFBTSx5QkFBeUIsT0FBTyxJQUFJLEVBQUU7QUFDcEQsZUFBTztBQUFBLE1BQ1g7QUFBQSxJQUNKLENBQUM7QUFBQSxFQUNMO0FBQUEsRUFFUSxVQUFVLFFBQXdDO0FBQ3RELFdBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM1QixZQUFNLFFBQVEsSUFBSSxNQUFNLE9BQU8sSUFBSTtBQUNuQyxZQUFNLFNBQVMsT0FBTztBQUN0QixZQUFNLFVBQVU7QUFDaEIsWUFBTSxtQkFBbUIsTUFBTTtBQUMzQixhQUFLLE9BQU8sSUFBSSxPQUFPLE1BQU0sS0FBSztBQUNsQyxhQUFLO0FBQ0wsZ0JBQVE7QUFBQSxNQUNaO0FBQ0EsWUFBTSxVQUFVLE1BQU07QUFDbEIsZ0JBQVEsS0FBSyx5QkFBeUIsT0FBTyxJQUFJLEVBQUU7QUFDbkQsYUFBSztBQUNMLGdCQUFRO0FBQUEsTUFDWjtBQUFBLElBQ0osQ0FBQztBQUFBLEVBQ0w7QUFBQSxFQUVBLFNBQVMsTUFBNEM7QUFDakQsV0FBTyxLQUFLLE9BQU8sSUFBSSxJQUFJO0FBQUEsRUFDL0I7QUFBQSxFQUVBLFVBQVUsTUFBYyxPQUFnQixPQUFPLFFBQStDO0FBQzFGLFVBQU0sUUFBUSxLQUFLLE9BQU8sSUFBSSxJQUFJO0FBQ2xDLFFBQUksT0FBTztBQUNQLFlBQU0sUUFBUSxNQUFNLFVBQVU7QUFDOUIsWUFBTSxPQUFPO0FBQ2IsWUFBTSxTQUFTLFdBQVcsU0FBWSxTQUFTLE1BQU07QUFDckQsWUFBTSxLQUFLLEVBQUUsTUFBTSxPQUFLLFFBQVEsS0FBSyx5QkFBeUIsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUN6RSxhQUFPO0FBQUEsSUFDWDtBQUNBLFdBQU87QUFBQSxFQUNYO0FBQUEsRUFFQSxVQUFVLE9BQXlCO0FBQy9CLFVBQU0sTUFBTTtBQUNaLFVBQU0sY0FBYztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxxQkFBNkI7QUFDekIsV0FBTyxLQUFLLGNBQWMsSUFBSSxLQUFLLGNBQWMsS0FBSyxjQUFjO0FBQUEsRUFDeEU7QUFDSjtBQUtBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBUEMsU0FBQUE7QUFBQSxHQUFBO0FBYUwsTUFBTSxPQUFPO0FBQUEsRUFPVCxZQUFZLEdBQVcsR0FBVyxPQUFlLFFBQWdCLFdBQW1CO0FBQ2hGLFNBQUssSUFBSTtBQUNULFNBQUssSUFBSTtBQUNULFNBQUssUUFBUTtBQUNiLFNBQUssU0FBUztBQUNkLFNBQUssWUFBWTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxLQUFLQyxNQUErQixjQUE0QjtBQUM1RCxVQUFNLE1BQU0sYUFBYSxTQUFTLEtBQUssU0FBUztBQUNoRCxRQUFJLEtBQUs7QUFDTCxNQUFBQSxLQUFJLFVBQVUsS0FBSyxLQUFLLElBQUksS0FBSyxRQUFRLEdBQUcsS0FBSyxJQUFJLEtBQUssU0FBUyxHQUFHLEtBQUssT0FBTyxLQUFLLE1BQU07QUFBQSxJQUNqRztBQUFBLEVBQ0o7QUFDSjtBQUtBLE1BQU0sS0FBSztBQUFBO0FBQUEsRUFVUCxZQUFZLEdBQVcsR0FBVyxPQUFlLFFBQWdCLE1BQWdCO0FBQzdFLFNBQUssSUFBSTtBQUNULFNBQUssSUFBSTtBQUNULFNBQUssUUFBUTtBQUNiLFNBQUssU0FBUztBQUNkLFNBQUssWUFBWSxLQUFLO0FBQ3RCLFNBQUssUUFBUSxLQUFLO0FBQ2xCLFNBQUssT0FBTztBQUNaLFNBQUssWUFBWSxLQUFLLE9BQU8sSUFBSSxNQUFNLEtBQUs7QUFBQSxFQUNoRDtBQUFBLEVBRUEsT0FBTyxXQUFtQixhQUFxQixTQUFpQjtBQUM1RCxTQUFLLEtBQUssS0FBSyxRQUFRLEtBQUssWUFBWTtBQUd4QyxRQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxhQUFhO0FBQ3BDLFdBQUssYUFBYTtBQUNsQixXQUFLLElBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLGFBQWEsS0FBSyxDQUFDLENBQUM7QUFBQSxJQUN0RDtBQUlBLFVBQU0sbUJBQW1CLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTztBQUNsRCxRQUFJLG1CQUFtQixLQUFLO0FBQ3hCLFlBQU0sZ0JBQWlCLFVBQVUsS0FBSyxJQUFJLElBQUssSUFBSTtBQUNuRCxXQUFLLEtBQUssZ0JBQWdCLEtBQUssUUFBUSxhQUFhLElBQUksbUJBQW1CLE9BQU87QUFBQSxJQUN0RjtBQUFBLEVBQ0o7QUFBQSxFQUVBLEtBQUtBLE1BQStCLGNBQTRCO0FBQzVELFVBQU0sTUFBTSxhQUFhLFNBQVMsS0FBSyxTQUFTO0FBQ2hELFFBQUksS0FBSztBQUNMLE1BQUFBLEtBQUksS0FBSztBQUNULE1BQUFBLEtBQUksVUFBVSxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBRTVCLFVBQUksS0FBSyxjQUFjLElBQUk7QUFDdkIsUUFBQUEsS0FBSSxNQUFNLElBQUksQ0FBQztBQUFBLE1BQ25CO0FBQ0EsTUFBQUEsS0FBSSxVQUFVLEtBQUssQ0FBQyxLQUFLLFFBQVEsR0FBRyxDQUFDLEtBQUssU0FBUyxHQUFHLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDN0UsTUFBQUEsS0FBSSxRQUFRO0FBQUEsSUFDaEI7QUFBQSxFQUNKO0FBQ0o7QUFLQSxNQUFNLEtBQUs7QUFBQSxFQXFDUCxZQUFvQkMsU0FBbUNELE1BQStCO0FBQWxFLGtCQUFBQztBQUFtQyxlQUFBRDtBQW5DdkQsU0FBUSxlQUE2QixJQUFJLGFBQWE7QUFDdEQsU0FBUSxlQUEwQjtBQUNsQyxTQUFRLFdBQWdDO0FBRXhDLFNBQVEsUUFBZ0I7QUFDeEIsU0FBUSxZQUFvQjtBQUM1QjtBQUFBLFNBQVEsaUJBQXlCO0FBQ2pDO0FBQUEsU0FBUSxTQUFpQixDQUFDO0FBRTFCLFNBQVEsY0FBMkIsb0JBQUksSUFBSTtBQUMzQyxTQUFRLGlCQUFnQztBQUN4QztBQUFBLFNBQVEsc0JBQThCO0FBR3RDO0FBQUE7QUFBQSxTQUFRLHNCQUE4QjtBQUd0QztBQUFBO0FBQUEsU0FBUSxrQkFBK0I7QUFDdkMsU0FBUSx1QkFBK0I7QUFHdkM7QUFBQSxTQUFRLGtCQUEwQjtBQUNsQyxTQUFRLGtCQUEwQjtBQUNsQyxTQUFRLGdCQUF3QjtBQUNoQyxTQUFRLDBCQUFrQztBQUMxQztBQUFBLFNBQVEsMkJBQW1DO0FBSTNDO0FBQUE7QUFBQSxTQUFRLDBCQUFrQztBQUMxQyxTQUFRLG9CQUE0QjtBQUNwQyxTQUFRLG1CQUEyQjtBQUNuQyxTQUFRLDBCQUFrQztBQW1GMUM7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLGdCQUFnQixDQUFDLFVBQStCO0FBQ3BELFdBQUssWUFBWSxJQUFJLE1BQU0sSUFBSTtBQUUvQixVQUFJLE1BQU0sU0FBUyxTQUFTO0FBQ3hCLGNBQU0sZUFBZTtBQUVyQixnQkFBUSxLQUFLLGNBQWM7QUFBQSxVQUN2QixLQUFLO0FBQ0QsaUJBQUssZUFBZTtBQUNwQixpQkFBSyxhQUFhLFVBQVUsUUFBUTtBQUNwQztBQUFBLFVBQ0osS0FBSztBQUNELGlCQUFLLGVBQWU7QUFDcEIsaUJBQUssYUFBYSxVQUFVLFFBQVE7QUFDcEM7QUFBQSxVQUNKLEtBQUs7QUFFRCxrQkFBTSxrQkFBa0IsS0FBSywyQkFBMkIsS0FBSyxPQUFPLDBCQUEwQjtBQUM5RixrQkFBTSxnQkFBZ0IsS0FBSywyQkFBMkIsS0FBSyxPQUFPLDBCQUEwQjtBQUM1RixnQkFBSSxLQUFLLDJCQUEyQixtQkFBbUIsS0FBSywyQkFBMkIsZUFBZTtBQUNsRyxtQkFBSyxtQkFBbUIsS0FBSyxPQUFPO0FBQUEsWUFDeEM7QUFDQSxpQkFBSyxhQUFhLFVBQVUsUUFBUSxPQUFPLEdBQUc7QUFDOUM7QUFBQSxVQUNKLEtBQUs7QUFDRCxpQkFBSyxTQUFTO0FBQ2QsaUJBQUssZUFBZTtBQUNwQixpQkFBSyxhQUFhLFVBQVUsUUFBUTtBQUNwQztBQUFBLFFBQ1I7QUFBQSxNQUNKLFdBQVcsS0FBSyxpQkFBaUIsMEJBQTRCO0FBQ3pELFlBQUksTUFBTSxTQUFTLFdBQVc7QUFDMUIsZUFBSyxzQkFBc0I7QUFBQSxRQUMvQixXQUFXLE1BQU0sU0FBUyxhQUFhO0FBQ25DLGVBQUssc0JBQXNCO0FBQUEsUUFDL0I7QUFBQSxNQUNKO0FBQUEsSUFDSjtBQU1BO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUSxjQUFjLENBQUMsVUFBK0I7QUFDbEQsV0FBSyxZQUFZLE9BQU8sTUFBTSxJQUFJO0FBQ2xDLFVBQUksTUFBTSxTQUFTLGFBQWEsTUFBTSxTQUFTLGFBQWE7QUFDeEQsYUFBSyxzQkFBc0I7QUFBQSxNQUMvQjtBQUFBLElBQ0o7QUFNQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsT0FBTyxDQUFDLGdCQUEyQztBQUN2RCxZQUFNLGFBQWEsY0FBYyxLQUFLLFlBQVk7QUFDbEQsV0FBSyxXQUFXO0FBRWhCLFdBQUssT0FBTyxTQUFTO0FBQ3JCLFdBQUssS0FBSztBQUVWLDRCQUFzQixLQUFLLElBQUk7QUFBQSxJQUNuQztBQTVJSSxTQUFLLE9BQU8sUUFBUTtBQUNwQixTQUFLLE9BQU8sU0FBUztBQUNyQixXQUFPLGlCQUFpQixXQUFXLEtBQUssYUFBYTtBQUNyRCxXQUFPLGlCQUFpQixTQUFTLEtBQUssV0FBVztBQUFBLEVBQ3JEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxNQUFNLFFBQXVCO0FBQ3pCLFVBQU0sS0FBSyxXQUFXO0FBQ3RCLFNBQUssU0FBUztBQUNkLFNBQUssS0FBSyxDQUFDO0FBQUEsRUFDZjtBQUFBLEVBRUEsTUFBYyxhQUE0QjtBQUN0QyxRQUFJO0FBQ0EsWUFBTSxXQUFXLE1BQU0sTUFBTSxXQUFXO0FBQ3hDLFdBQUssU0FBUyxNQUFNLFNBQVMsS0FBSztBQUNsQyxXQUFLLE9BQU8sUUFBUSxLQUFLLE9BQU87QUFDaEMsV0FBSyxPQUFPLFNBQVMsS0FBSyxPQUFPO0FBQ2pDLFlBQU0sS0FBSyxhQUFhLFdBQVcsS0FBSyxPQUFPLE1BQU07QUFDckQsV0FBSyxlQUFlO0FBQUEsSUFDeEIsU0FBUyxPQUFPO0FBQ1osY0FBUSxNQUFNLGdEQUFnRCxLQUFLO0FBRW5FLFdBQUssZUFBZTtBQUFBLElBQ3hCO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsV0FBaUI7QUFDckIsU0FBSyxRQUFRO0FBQ2IsU0FBSyxZQUFZLEtBQUssT0FBTztBQUM3QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLFNBQVMsQ0FBQztBQUNmLFNBQUssU0FBUyxJQUFJO0FBQUEsTUFDZCxLQUFLLE9BQU8saUJBQWlCLEtBQUssT0FBTztBQUFBLE1BQ3pDLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxPQUFPO0FBQUE7QUFBQSxNQUN6QyxLQUFLLE9BQU87QUFBQSxNQUNaLEtBQUssT0FBTztBQUFBLE1BQ1o7QUFBQSxJQUNKO0FBR0EsUUFBSSxLQUFLLFVBQVU7QUFDZixXQUFLLGFBQWEsVUFBVSxLQUFLLFFBQVE7QUFBQSxJQUM3QztBQUNBLFNBQUssV0FBVyxLQUFLLGFBQWEsVUFBVSxPQUFPLE1BQU0sS0FBSyxPQUFPLE9BQU8sT0FBTyxLQUFLLE9BQUssRUFBRSxTQUFTLEtBQUssR0FBRyxNQUFNO0FBR3RILFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssMkJBQTJCO0FBQ2hDLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssc0JBQXNCO0FBRzNCLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssdUJBQXVCO0FBRzVCLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssMEJBQTBCO0FBQUEsRUFDbkM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBMEVRLE9BQU8sV0FBeUI7QUFDcEMsUUFBSSxLQUFLLGlCQUFpQixnQkFBbUI7QUFHN0MsUUFBSSxLQUFLLFlBQVksS0FBSyxTQUFTLFVBQVUsS0FBSyxpQkFBaUIsd0JBQTBCLEtBQUssaUJBQWlCLHlCQUEyQjtBQUN6SSxXQUFLLFNBQVMsS0FBSyxFQUFFLE1BQU0sT0FBSyxRQUFRLEtBQUsseUJBQXlCLENBQUMsQ0FBQztBQUFBLElBQzdFO0FBRUEsWUFBUSxLQUFLLGNBQWM7QUFBQSxNQUN2QixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBRUQ7QUFBQSxNQUNKLEtBQUs7QUFDRCxhQUFLLGFBQWE7QUFDbEIsWUFBSSxLQUFLLGFBQWEsR0FBRztBQUNyQixlQUFLLGVBQWU7QUFDcEIsY0FBSSxLQUFLLFNBQVUsTUFBSyxhQUFhLFVBQVUsS0FBSyxRQUFRO0FBQzVELGVBQUssYUFBYSxVQUFVLGVBQWU7QUFDM0M7QUFBQSxRQUNKO0FBR0EsWUFBSSxLQUFLLHdCQUF3QixHQUFHO0FBQ2hDLGVBQUssT0FBTyxLQUFLLEtBQUssc0JBQXNCLEtBQUssT0FBTyxrQkFBa0I7QUFDMUUsZUFBSyxPQUFPLElBQUksS0FBSztBQUFBLFlBQ2pCLEtBQUssT0FBTyxrQkFBa0IsS0FBSyxPQUFPO0FBQUEsWUFDMUMsS0FBSyxJQUFJLEtBQUssT0FBTyxrQkFBa0IsS0FBSyxPQUFPLFFBQVEsS0FBSyxPQUFPLENBQUM7QUFBQSxVQUM1RTtBQUFBLFFBQ0o7QUFHQSxhQUFLLE9BQU8sUUFBUSxVQUFRO0FBQ3hCLGNBQUksU0FBUyxLQUFLLGlCQUFpQjtBQUMvQixpQkFBSyxPQUFPLFlBQVksS0FBSyxPQUFPLHlCQUF5QixLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sQ0FBQztBQUFBLFVBQ2pHO0FBQUEsUUFDSixDQUFDO0FBR0QsYUFBSyxrQkFBa0I7QUFDdkIsWUFBSSxLQUFLLGtCQUFrQixLQUFLLE9BQU8sMEJBQTBCO0FBQzdELGVBQUssaUJBQWlCO0FBQ3RCLGVBQUssVUFBVTtBQUFBLFFBQ25CO0FBR0EsWUFBSSxLQUFLLG1CQUFtQixNQUFNO0FBQzlCLGVBQUssdUJBQXVCO0FBQzVCLGNBQUksS0FBSyx1QkFBdUIsR0FBRztBQUMvQixpQkFBSyxpQkFBaUI7QUFBQSxVQUMxQjtBQUFBLFFBQ0o7QUFHQSxZQUFJLEtBQUssbUJBQW1CLE1BQU07QUFDOUIsY0FBSSxjQUEyQjtBQUMvQixjQUFJLGdCQUFnQjtBQUVwQixxQkFBVyxRQUFRLEtBQUssUUFBUTtBQUM1QixrQkFBTSxLQUFLLEtBQUssSUFBSSxLQUFLLE9BQU87QUFDaEMsa0JBQU0sS0FBSyxLQUFLLElBQUksS0FBSyxPQUFPO0FBQ2hDLGtCQUFNLGFBQWEsS0FBSyxLQUFLLEtBQUs7QUFHbEMsZ0JBQUksY0FBYyxLQUFLLE9BQU8sb0JBQW9CLEtBQUssT0FBTyxtQkFBbUI7QUFDN0Usa0JBQUksYUFBYSxlQUFlO0FBQzVCLGdDQUFnQjtBQUNoQiw4QkFBYztBQUFBLGNBQ2xCO0FBQUEsWUFDSjtBQUFBLFVBQ0o7QUFFQSxjQUFJLGFBQWE7QUFDYixnQkFBSSxLQUFLLG9CQUFvQixhQUFhO0FBQ3RDLG1CQUFLLHdCQUF3QjtBQUM3QixrQkFBSSxLQUFLLHdCQUF3QixLQUFLLE9BQU8seUJBQXlCO0FBQ2xFLHFCQUFLLGVBQWU7QUFDcEIscUJBQUssYUFBYSxVQUFVLE1BQU07QUFDbEMscUJBQUssYUFBYSxLQUFLLGVBQWU7QUFDdEMscUJBQUssa0JBQWtCO0FBQ3ZCLHFCQUFLLHVCQUF1QjtBQUFBLGNBQ2hDO0FBQUEsWUFDSixPQUFPO0FBRUgsbUJBQUssa0JBQWtCO0FBQ3ZCLG1CQUFLLHVCQUF1QjtBQUFBLFlBQ2hDO0FBQUEsVUFDSixPQUFPO0FBRUgsaUJBQUssa0JBQWtCO0FBQ3ZCLGlCQUFLLHVCQUF1QjtBQUFBLFVBQ2hDO0FBQUEsUUFDSjtBQUNBO0FBQUEsTUFDSixLQUFLO0FBQ0QsYUFBSyxpQkFBaUI7QUFDdEIsWUFBSSxLQUFLLGlCQUFpQixHQUFHO0FBQ3pCLGVBQUssZ0JBQWdCO0FBQ3JCO0FBQUEsUUFDSjtBQUdBLGFBQUssa0JBQWtCLEtBQUssSUFBSSxHQUFHLEtBQUssa0JBQWtCLEtBQUssT0FBTyxvQkFBb0IsU0FBUztBQUduRyxhQUFLLDJCQUEyQixLQUFLLE9BQU8sMkJBQTJCO0FBQ3ZFLFlBQUksS0FBSywwQkFBMEIsS0FBSyxLQUFLLDBCQUEwQixJQUFJO0FBQ3ZFLGVBQUssT0FBTyw0QkFBNEI7QUFDeEMsZUFBSywwQkFBMEIsS0FBSyxJQUFJLElBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyx1QkFBdUIsQ0FBQztBQUFBLFFBQ3pGO0FBR0EsY0FBTSxrQkFBa0IsS0FBSywyQkFBMkIsS0FBSyxPQUFPLDBCQUEwQjtBQUM5RixjQUFNLGdCQUFnQixLQUFLLDJCQUEyQixLQUFLLE9BQU8sMEJBQTBCO0FBRTVGLFlBQUksRUFBRSxLQUFLLDJCQUEyQixtQkFBbUIsS0FBSywyQkFBMkIsZ0JBQWdCO0FBQ3JHLGVBQUssbUJBQW1CO0FBQUEsUUFDNUI7QUFFQSxZQUFJLEtBQUssbUJBQW1CLEtBQUssT0FBTywwQkFBMEI7QUFDOUQsZUFBSyxnQkFBZ0IsS0FBSztBQUFBLFFBQzlCLFdBQVcsS0FBSyxtQkFBbUIsS0FBSyxPQUFPLHVCQUF1QjtBQUNsRSxlQUFLLGdCQUFnQixJQUFJO0FBQUEsUUFDN0I7QUFHQSxhQUFLLE9BQU8sUUFBUSxVQUFRO0FBQ3hCLGNBQUksU0FBUyxLQUFLLHVCQUF1QjtBQUNyQyxpQkFBSyxPQUFPLFlBQVksS0FBSyxPQUFPLHlCQUF5QixLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sQ0FBQztBQUFBLFVBQ2pHO0FBQUEsUUFDSixDQUFDO0FBQ0Q7QUFBQSxNQUNKLEtBQUs7QUFDRCxZQUFJLENBQUMsS0FBSyx1QkFBdUI7QUFDN0IsZUFBSyxlQUFlO0FBRXBCLGVBQUssT0FBTyxJQUFJLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxPQUFPO0FBQ3pEO0FBQUEsUUFDSjtBQUVBLGFBQUssMkJBQTJCO0FBQ2hDLGNBQU0sV0FBVyxLQUFLLElBQUksR0FBRyxLQUFLLDBCQUEwQixLQUFLLGlCQUFpQjtBQUdsRixhQUFLLE9BQU8sSUFBSSxLQUFLLDJCQUEyQixLQUFLLG1CQUFtQixLQUFLLDJCQUEyQjtBQUd4RyxhQUFLLHNCQUFzQixJQUFJLEtBQUssT0FBTztBQUMzQyxhQUFLLHNCQUFzQixJQUFJLEtBQUssT0FBTyxJQUFLLEtBQUssT0FBTyxTQUFTLElBQU0sS0FBSyxzQkFBc0IsU0FBUyxJQUFLO0FBRXBILFlBQUksWUFBWSxHQUFHO0FBRWYsZUFBSyxTQUFTLEtBQUssc0JBQXNCLEtBQUs7QUFDOUMsZUFBSyxhQUFhLFVBQVUsT0FBTztBQUNuQyxlQUFLLGlCQUFpQixLQUFLLE9BQU8sR0FBRztBQUNyQyxlQUFLLHNCQUFzQjtBQUczQixnQkFBTSxRQUFRLEtBQUssT0FBTyxRQUFRLEtBQUsscUJBQXFCO0FBQzVELGNBQUksUUFBUSxJQUFJO0FBQ1osaUJBQUssT0FBTyxPQUFPLE9BQU8sQ0FBQztBQUFBLFVBQy9CO0FBRUEsZUFBSyx3QkFBd0I7QUFDN0IsZUFBSyxlQUFlO0FBRXBCLGVBQUssT0FBTyxJQUFJLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxPQUFPO0FBQUEsUUFDN0Q7QUFHQSxhQUFLLE9BQU8sUUFBUSxVQUFRO0FBQ3hCLGNBQUksU0FBUyxLQUFLLHVCQUF1QjtBQUNyQyxpQkFBSyxPQUFPLFlBQVksS0FBSyxPQUFPLHlCQUF5QixLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sQ0FBQztBQUFBLFVBQ2pHO0FBQUEsUUFDSixDQUFDO0FBQ0Q7QUFBQSxJQUNSO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsWUFBa0I7QUFDdEIsVUFBTSxhQUFhLEtBQUssT0FBTyxPQUFPLEtBQUssTUFBTSxLQUFLLE9BQU8sSUFBSSxLQUFLLE9BQU8sT0FBTyxNQUFNLENBQUM7QUFDM0YsVUFBTSxTQUFTLEtBQUssT0FBTyxJQUFJLEtBQUssT0FBTztBQUUzQyxVQUFNLGFBQWEsS0FBSyxPQUFPLGlCQUFpQixLQUFLLE9BQU87QUFDNUQsVUFBTSxZQUFZLGFBQWEsS0FBSyxPQUFPLG9CQUFvQixJQUFJO0FBQ25FLFVBQU0sWUFBWSxLQUFLLE9BQU8sU0FBUyxLQUFLLE9BQU8sb0JBQW9CLElBQUk7QUFHM0UsUUFBSSxZQUFZLFdBQVc7QUFDdkIsWUFBTSxTQUFTLFlBQVksS0FBSyxPQUFPLEtBQUssWUFBWTtBQUN4RCxZQUFNLFVBQVUsSUFBSTtBQUFBLFFBQ2hCO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSyxPQUFPO0FBQUEsUUFDWixLQUFLLE9BQU87QUFBQSxRQUNaO0FBQUEsTUFDSjtBQUNBLFdBQUssT0FBTyxLQUFLLE9BQU87QUFHeEIsVUFBSSxLQUFLLE9BQU8sU0FBUyxLQUFLLE9BQU8saUJBQWlCO0FBRWxELFlBQUksVUFBVTtBQUNkLGlCQUFTLElBQUksR0FBRyxJQUFJLEtBQUssT0FBTyxTQUFTLEdBQUcsS0FBSztBQUM3QyxjQUFJLEtBQUssT0FBTyxDQUFDLE1BQU0sS0FBSyx5QkFBeUIsS0FBSyxPQUFPLENBQUMsTUFBTSxLQUFLLGlCQUFpQjtBQUMxRixpQkFBSyxPQUFPLE9BQU8sR0FBRyxDQUFDO0FBQ3ZCLHNCQUFVO0FBQ1Y7QUFBQSxVQUNKO0FBQUEsUUFDSjtBQU1BLFlBQUksQ0FBQyxXQUFXLEtBQUssT0FBTyxTQUFTLEtBQUssT0FBTyxtQkFBbUIsS0FBSyxPQUFPLENBQUMsTUFBTSxLQUFLLHlCQUF5QixLQUFLLE9BQU8sQ0FBQyxNQUFNLEtBQUssaUJBQWlCO0FBQzFKLGVBQUssT0FBTyxNQUFNO0FBQUEsUUFDdEI7QUFBQSxNQUNKO0FBQUEsSUFDSixPQUFPO0FBQ0gsY0FBUSxLQUFLLHdHQUF3RztBQUFBLElBQ3pIO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxhQUFhLE1BQWtCO0FBQ25DLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssZ0JBQWdCLEtBQUssT0FBTztBQUNqQyxTQUFLLDBCQUEwQjtBQUMvQixTQUFLLDJCQUE0QixLQUFLLE9BQU8sSUFBSSxNQUFPO0FBQ3hELFNBQUssd0JBQXdCO0FBRzdCLFNBQUssT0FBTywyQkFBMkIsSUFBTyxLQUFLLEtBQUsscUJBQXFCO0FBRTdFLFFBQUksS0FBSyxPQUFPLElBQUksS0FBSztBQUFFLFdBQUssT0FBTyw0QkFBNEI7QUFBQSxJQUFJO0FBQ3ZFLFNBQUssT0FBTyxvQkFBb0IsTUFBTyxLQUFLLEtBQUsscUJBQXFCO0FBQUEsRUFDMUU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsZ0JBQWdCLGVBQStCO0FBQ25ELFVBQU0sU0FBUyxrQkFBa0IsU0FBWSxnQkFBaUIsS0FBSyxtQkFBbUIsS0FBSyxPQUFPO0FBRWxHLFFBQUksVUFBVSxLQUFLLHVCQUF1QjtBQUV0QyxXQUFLLDBCQUEwQixLQUFLLE9BQU87QUFFM0MsWUFBTSxhQUFhLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxPQUFPO0FBQzVELFlBQU0sWUFBWSxLQUFLLGFBQWEsU0FBUyxNQUFNO0FBQ25ELFlBQU0sYUFBYSxZQUFZLFVBQVUsU0FBUztBQUNsRCxZQUFNLFFBQVEsYUFBYTtBQUczQixXQUFLLG1CQUFtQixRQUFRLEtBQUssT0FBTztBQUU1QyxXQUFLLG9CQUFvQixLQUFLLE9BQU87QUFDckMsV0FBSywwQkFBMEI7QUFDL0IsV0FBSyxlQUFlO0FBQUEsSUFFeEIsT0FBTztBQUVILFdBQUssYUFBYSxVQUFVLE1BQU07QUFDbEMsV0FBSyxpQkFBaUIsS0FBSyxPQUFPLEdBQUc7QUFDckMsV0FBSyxzQkFBc0I7QUFHM0IsVUFBSSxLQUFLLHVCQUF1QjtBQUM1QixjQUFNLFFBQVEsS0FBSyxPQUFPLFFBQVEsS0FBSyxxQkFBcUI7QUFDNUQsWUFBSSxRQUFRLElBQUk7QUFDWixlQUFLLE9BQU8sT0FBTyxPQUFPLENBQUM7QUFBQSxRQUMvQjtBQUFBLE1BQ0o7QUFDQSxXQUFLLHdCQUF3QjtBQUM3QixXQUFLLGVBQWU7QUFFcEIsV0FBSyxPQUFPLElBQUksS0FBSyxPQUFPLGlCQUFpQixLQUFLLE9BQU87QUFBQSxJQUM3RDtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLE9BQWE7QUFDakIsU0FBSyxJQUFJLFVBQVUsR0FBRyxHQUFHLEtBQUssT0FBTyxPQUFPLEtBQUssT0FBTyxNQUFNO0FBRzlELFVBQU0sYUFBYSxLQUFLLGFBQWEsU0FBUyxZQUFZO0FBQzFELFFBQUksWUFBWTtBQUNaLFdBQUssSUFBSSxVQUFVLFlBQVksR0FBRyxHQUFHLEtBQUssT0FBTyxPQUFPLEtBQUssT0FBTyxNQUFNO0FBQUEsSUFDOUU7QUFFQSxZQUFRLEtBQUssY0FBYztBQUFBLE1BQ3ZCLEtBQUs7QUFDRCxhQUFLLGtCQUFrQjtBQUN2QjtBQUFBLE1BQ0osS0FBSztBQUNELGFBQUssZ0JBQWdCO0FBQ3JCO0FBQUEsTUFDSixLQUFLO0FBQ0QsYUFBSyxtQkFBbUI7QUFDeEI7QUFBQSxNQUNKLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFDRCxhQUFLLGFBQWE7QUFDbEIsWUFBSSxLQUFLLGlCQUFpQiwwQkFBNEI7QUFDbEQsZUFBSyxlQUFlO0FBQUEsUUFDeEI7QUFDQSxZQUFJLEtBQUssbUJBQW1CLE1BQU07QUFDOUIsZUFBSyxtQkFBbUI7QUFBQSxRQUM1QjtBQUNBO0FBQUEsTUFDSixLQUFLO0FBQ0QsYUFBSyxhQUFhO0FBQ2xCLGFBQUssbUJBQW1CO0FBQ3hCO0FBQUEsSUFDUjtBQUFBLEVBQ0o7QUFBQSxFQUVRLG9CQUEwQjtBQUM5QixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFDN0QsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsR0FBRyxLQUFLLE9BQU8sR0FBRyxPQUFPLElBQUksS0FBSyxNQUFNLEtBQUssYUFBYSxtQkFBbUIsSUFBSSxHQUFHLENBQUMsS0FBSyxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLENBQUM7QUFBQSxFQUM3SjtBQUFBLEVBRVEsa0JBQXdCO0FBQzVCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLEdBQUcsR0FBRyxLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sTUFBTTtBQUU3RCxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxPQUFPLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBRTFGLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxHQUFHLFlBQVksS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEVBQUU7QUFBQSxFQUNuRztBQUFBLEVBRVEscUJBQTJCO0FBQy9CLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLEdBQUcsR0FBRyxLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sTUFBTTtBQUU3RCxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxzQkFBTyxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksR0FBRztBQUU1RSxTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxlQUFlLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBQ2xHLFNBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxHQUFHLGVBQWUsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEVBQUU7QUFDbEcsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsZUFBZSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLENBQUM7QUFDN0YsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsZUFBZSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksRUFBRTtBQUVsRyxTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxZQUFZLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxHQUFHO0FBQUEsRUFDcEc7QUFBQSxFQUVRLGVBQXFCO0FBQ3pCLFVBQU0sYUFBYSxLQUFLLE9BQU8saUJBQWlCLEtBQUssT0FBTztBQUc1RCxVQUFNLE9BQU8sS0FBSyxhQUFhLFNBQVMsTUFBTTtBQUM5QyxRQUFJLE1BQU07QUFDTixZQUFNLFFBQVEsS0FBSyxPQUFPLFFBQVEsSUFBSSxLQUFLLFFBQVE7QUFDbkQsWUFBTSxRQUFRLGFBQWEsS0FBSztBQUNoQyxXQUFLLElBQUksVUFBVSxNQUFNLE9BQU8sT0FBTyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBRzlELFdBQUssSUFBSSxjQUFjO0FBQ3ZCLFdBQUssSUFBSSxZQUFZO0FBQ3JCLFdBQUssSUFBSSxVQUFVO0FBR25CLFdBQUssSUFBSSxPQUFPLEtBQUssT0FBTyxHQUFHLFFBQVEsS0FBSyxPQUFPLGtCQUFrQjtBQUNyRSxXQUFLLElBQUksT0FBTyxLQUFLLE9BQU8sR0FBRyxLQUFLLE9BQU8sQ0FBQztBQUM1QyxXQUFLLElBQUksT0FBTztBQUFBLElBQ3BCO0FBRUEsU0FBSyxPQUFPLEtBQUssS0FBSyxLQUFLLEtBQUssWUFBWTtBQUM1QyxTQUFLLE9BQU8sUUFBUSxVQUFRLEtBQUssS0FBSyxLQUFLLEtBQUssS0FBSyxZQUFZLENBQUM7QUFHbEUsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsR0FBRyxLQUFLLE9BQU8sR0FBRyxXQUFXLEdBQUcsS0FBSyxLQUFLLElBQUksSUFBSSxFQUFFO0FBQ3RFLFNBQUssSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFPLEdBQUcsbUJBQW1CLEdBQUcsS0FBSyxLQUFLLEtBQUssU0FBUyxDQUFDLElBQUksSUFBSSxFQUFFO0FBQUEsRUFDakc7QUFBQSxFQUVRLGlCQUF1QjtBQUUzQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxHQUFHLEtBQUssT0FBTyxTQUFTLEtBQUssS0FBSyxPQUFPLE9BQU8sR0FBRztBQUVyRSxVQUFNLE9BQU8sS0FBSyxPQUFPLFNBQVM7QUFDbEMsVUFBTSxZQUFZO0FBQ2xCLFVBQU0sV0FBVyxLQUFLLE9BQU8sUUFBUTtBQUNyQyxVQUFNLFFBQVEsS0FBSyxPQUFPLFFBQVEsWUFBWTtBQUc5QyxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxNQUFNLE1BQU0sVUFBVSxTQUFTO0FBR2pELFVBQU0sb0JBQW9CLFdBQVcsS0FBSyxPQUFPO0FBQ2pELFVBQU0sY0FBYyxPQUFRLEtBQUssNEJBQTRCLFdBQVcsS0FBTyxXQUFXLElBQU0sb0JBQW9CO0FBQ3BILFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLGFBQWEsTUFBTSxtQkFBbUIsU0FBUztBQUdqRSxVQUFNLFdBQVcsT0FBUSxLQUFLLDJCQUEyQixXQUFXLEtBQU8sV0FBVztBQUN0RixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxXQUFXLEdBQUcsT0FBTyxJQUFJLElBQUksWUFBWSxFQUFFO0FBRzdELFVBQU0sa0JBQW1CLEtBQUssa0JBQWtCLEtBQUssT0FBTyx3QkFBeUI7QUFDckYsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsTUFBTSxPQUFPLFlBQVksSUFBSSxpQkFBaUIsRUFBRTtBQUdsRSxVQUFNLGtCQUFtQixLQUFLLGtCQUFrQixLQUFLLE9BQU8sMkJBQTRCO0FBQ3hGLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLE1BQU0sT0FBTyxZQUFZLElBQUksaUJBQWlCLEVBQUU7QUFHbEUsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsaUJBQWlCLEtBQUssT0FBTyxRQUFRLEdBQUcsT0FBTyxFQUFFO0FBRWxGLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFPLEdBQUcsUUFBUSxHQUFHLEtBQUssS0FBSyxLQUFLLGFBQWEsQ0FBQyxLQUFLLEtBQUssT0FBTyxRQUFRLEdBQUcsT0FBTyxZQUFZLEVBQUU7QUFBQSxFQUNqSTtBQUFBLEVBRVEscUJBQTJCO0FBQy9CLFFBQUksS0FBSyxnQkFBZ0I7QUFDckIsV0FBSyxJQUFJLFlBQVk7QUFDckIsV0FBSyxJQUFJLFNBQVMsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLElBQUksS0FBSyxPQUFPLE9BQU8sR0FBRztBQUN4RSxXQUFLLElBQUksWUFBWTtBQUNyQixXQUFLLElBQUksT0FBTztBQUNoQixXQUFLLElBQUksWUFBWTtBQUNyQixXQUFLLElBQUksU0FBUyxLQUFLLGdCQUFnQixLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksRUFBRTtBQUFBLElBQzdGO0FBQUEsRUFDSjtBQUFBLEVBRVEscUJBQTJCO0FBQy9CLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLEdBQUcsR0FBRyxLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sTUFBTTtBQUU3RCxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxVQUFVLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBRTdGLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFPLEdBQUcsV0FBVyxHQUFHLEtBQUssS0FBSyxJQUFJLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsQ0FBQztBQUU3RyxTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxZQUFZLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBQUEsRUFDbkc7QUFDSjtBQUdBLFNBQVMsaUJBQWlCLG9CQUFvQixNQUFNO0FBQ2hELFdBQVMsU0FBUyxlQUFlLFlBQVk7QUFDN0MsTUFBSSxDQUFDLFFBQVE7QUFDVCxZQUFRLE1BQU0sZ0RBQWdEO0FBQzlEO0FBQUEsRUFDSjtBQUNBLFFBQU0sT0FBTyxXQUFXLElBQUk7QUFDNUIsTUFBSSxDQUFDLEtBQUs7QUFDTixZQUFRLE1BQU0sZ0RBQWdEO0FBQzlEO0FBQUEsRUFDSjtBQUVBLFNBQU8sSUFBSSxLQUFLLFFBQVEsR0FBRztBQUMzQixPQUFLLE1BQU07QUFDZixDQUFDOyIsCiAgIm5hbWVzIjogWyJHYW1lU3RhdGUiLCAiY3R4IiwgImNhbnZhcyJdCn0K
