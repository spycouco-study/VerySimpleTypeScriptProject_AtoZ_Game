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
      if (this.direction === 1) {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gVHlwZVNjcmlwdCBpbnRlcmZhY2VzIGZvciBnYW1lIGNvbmZpZ3VyYXRpb24gYW5kIGRhdGFcclxuaW50ZXJmYWNlIEFzc2V0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIHdpZHRoPzogbnVtYmVyO1xyXG4gICAgaGVpZ2h0PzogbnVtYmVyO1xyXG4gICAgZHVyYXRpb25fc2Vjb25kcz86IG51bWJlcjtcclxuICAgIHZvbHVtZT86IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEltYWdlRGF0YUNvbmZpZyBleHRlbmRzIEFzc2V0Q29uZmlnIHtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFNvdW5kRGF0YUNvbmZpZyBleHRlbmRzIEFzc2V0Q29uZmlnIHtcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRmlzaERhdGEge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgc2NvcmU6IG51bWJlcjtcclxuICAgIGltYWdlOiBzdHJpbmc7IC8vIEFzc2V0IG5hbWUgZm9yIHRoZSBmaXNoIGltYWdlXHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgbWluaUdhbWVEaWZmaWN1bHR5OiBudW1iZXI7IC8vIEZhY3RvciBmb3IgbWluaS1nYW1lIGNoYWxsZW5nZVxyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBnYW1lRHVyYXRpb25TZWNvbmRzOiBudW1iZXI7IC8vIFRvdGFsIGdhbWUgdGltZVxyXG4gICAgaW5pdGlhbEJvYmJlclg6IG51bWJlcjsgLy8gUmF0aW8gb2YgY2FudmFzIHdpZHRoXHJcbiAgICBpbml0aWFsQm9iYmVyWTogbnVtYmVyOyAvLyBSYXRpbyBvZiBjYW52YXMgaGVpZ2h0ICh3YXRlciBzdXJmYWNlKVxyXG4gICAgYm9iYmVyTW92ZVNwZWVkOiBudW1iZXI7IC8vIFNwZWVkIGZvciBib2JiZXIgdmVydGljYWwgbW92ZW1lbnRcclxuICAgIG1pbkJvYmJlcllSYXRpbzogbnVtYmVyOyAvLyBNaW4gWSByYXRpbyBmb3IgYm9iYmVyIHZlcnRpY2FsIG1vdmVtZW50XHJcbiAgICBtYXhCb2JiZXJZUmF0aW86IG51bWJlcjsgLy8gTWF4IFkgcmF0aW8gZm9yIGJvYmJlciB2ZXJ0aWNhbCBtb3ZlbWVudFxyXG4gICAgZmlzaGluZ0xpbmVPZmZzZXRZOiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZvciBmaXNoaW5nIGxpbmUgc3RhcnQgb24gYm9hdFxyXG4gICAgZmlzaFNwYXduSW50ZXJ2YWxTZWNvbmRzOiBudW1iZXI7IC8vIEhvdyBvZnRlbiBuZXcgZmlzaCBtaWdodCBhcHBlYXJcclxuICAgIGZpc2hTd2ltU3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXIgZm9yIGZpc2ggbW92ZW1lbnQgc3BlZWRcclxuICAgIG1heEZpc2hPblNjcmVlbjogbnVtYmVyOyAvLyBNYXhpbXVtIG51bWJlciBvZiBmaXNoIHZpc2libGVcclxuICAgIGJvYmJlcldpZHRoOiBudW1iZXI7XHJcbiAgICBib2JiZXJIZWlnaHQ6IG51bWJlcjtcclxuICAgIGZpc2hEZWZhdWx0V2lkdGg6IG51bWJlcjtcclxuICAgIGZpc2hEZWZhdWx0SGVpZ2h0OiBudW1iZXI7XHJcbiAgICBiaXRlVHJpZ2dlclJhZGl1czogbnVtYmVyOyAvLyBEaXN0YW5jZSBmb3IgYSBmaXNoIHRvIGJlIFwibmVhclwiIHRoZSBib2JiZXJcclxuICAgIGJpdGVIb2xkRHVyYXRpb25TZWNvbmRzOiBudW1iZXI7IC8vIEhvdyBsb25nIHRoZSBob29rIG11c3QgYmUgbmVhciBhIGZpc2ggZm9yIGEgYml0ZVxyXG4gICAgbWluaUdhbWVEdXJhdGlvblNlY29uZHM6IG51bWJlcjsgLy8gRHVyYXRpb24gb2YgdGhlIHJlZWxpbmcgbWluaS1nYW1lXHJcbiAgICBtaW5pR2FtZVN1Y2Nlc3NUYXJnZXQ6IG51bWJlcjsgLy8gSG93IG11Y2ggJ3N1Y2Nlc3MnIGlzIG5lZWRlZCB0byBjYXRjaCBhIGZpc2hcclxuICAgIG1pbmlHYW1lRmFpbHVyZVRocmVzaG9sZDogbnVtYmVyOyAvLyBIb3cgbXVjaCAnZmFpbHVyZScgbGVhZHMgdG8gbG9zaW5nIGEgZmlzaFxyXG4gICAgbWluaUdhbWVQcmVzc0VmZmVjdDogbnVtYmVyOyAvLyBIb3cgbXVjaCBhIFNQQUNFIHByZXNzIGNvbnRyaWJ1dGVzIHRvIHN1Y2Nlc3NcclxuICAgIG1pbmlHYW1lRGVjYXlSYXRlOiBudW1iZXI7IC8vIEhvdyBxdWlja2x5IHN1Y2Nlc3MgZGVjYXlzIG92ZXIgdGltZVxyXG4gICAgbWluaUdhbWVUYXJnZXRab25lV2lkdGg6IG51bWJlcjsgLy8gV2lkdGggb2YgdGhlIHRhcmdldCB6b25lIGluIHRoZSBtaW5pLWdhbWUgYmFyICgwIHRvIDEpXHJcbiAgICBtaW5pR2FtZUJhc2VQb2ludGVyU3BlZWQ6IG51bWJlcjsgLy8gQmFzZSBzcGVlZCBvZiB0aGUgcG9pbnRlciBpbiB0aGUgbWluaS1nYW1lXHJcbiAgICByZWVsaW5nVXBEdXJhdGlvblNlY29uZHM6IG51bWJlcjsgLy8gRHVyYXRpb24gZm9yIGZpc2ggcmVlbGluZyB1cCBhbmltYXRpb25cclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogSW1hZ2VEYXRhQ29uZmlnW107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZERhdGFDb25maWdbXTtcclxuICAgIH07XHJcbiAgICBmaXNoZXM6IEZpc2hEYXRhW107XHJcbiAgICB1aToge1xyXG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgcHJlc3NTcGFjZTogc3RyaW5nO1xyXG4gICAgICAgIHR1dG9yaWFsTGluZTE6IHN0cmluZztcclxuICAgICAgICB0dXRvcmlhbExpbmUyOiBzdHJpbmc7XHJcbiAgICAgICAgdHV0b3JpYWxMaW5lMzogc3RyaW5nO1xyXG4gICAgICAgIHR1dG9yaWFsTGluZTQ6IHN0cmluZztcclxuICAgICAgICBmaXNoQ2F1Z2h0OiBzdHJpbmc7XHJcbiAgICAgICAgZmlzaExvc3Q6IHN0cmluZztcclxuICAgICAgICBzY29yZVByZWZpeDogc3RyaW5nO1xyXG4gICAgICAgIHRpbWVSZW1haW5pbmdQcmVmaXg6IHN0cmluZztcclxuICAgICAgICBnYW1lT3Zlcjogc3RyaW5nO1xyXG4gICAgICAgIGxvYWRpbmc6IHN0cmluZztcclxuICAgICAgICByZWVsSW5zdHJ1Y3Rpb246IHN0cmluZztcclxuICAgICAgICByZWVsVGltZTogc3RyaW5nO1xyXG4gICAgfTtcclxufVxyXG5cclxuLy8gR2xvYmFsIGNhbnZhcyBhbmQgY29udGV4dCB2YXJpYWJsZXNcclxubGV0IGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbmxldCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxubGV0IGdhbWU6IEdhbWU7XHJcblxyXG4vKipcclxuICogQXNzZXRNYW5hZ2VyIGNsYXNzIHRvIGhhbmRsZSBsb2FkaW5nIGFuZCBhY2Nlc3NpbmcgZ2FtZSBhc3NldHMgKGltYWdlcyBhbmQgc291bmRzKS5cclxuICovXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIGxvYWRlZENvdW50ID0gMDtcclxuICAgIHRvdGFsQXNzZXRzID0gMDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIExvYWRzIGFsbCBhc3NldHMgZGVmaW5lZCBpbiB0aGUgZ2FtZSBjb25maWd1cmF0aW9uLlxyXG4gICAgICogQHBhcmFtIGNvbmZpZyAtIFRoZSBhc3NldCBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uLlxyXG4gICAgICovXHJcbiAgICBhc3luYyBsb2FkQXNzZXRzKGNvbmZpZzogR2FtZUNvbmZpZ1snYXNzZXRzJ10pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLnRvdGFsQXNzZXRzID0gY29uZmlnLmltYWdlcy5sZW5ndGggKyBjb25maWcuc291bmRzLmxlbmd0aDtcclxuICAgICAgICBjb25zdCBwcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgaW1nQ29uZmlnIG9mIGNvbmZpZy5pbWFnZXMpIHtcclxuICAgICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLmxvYWRJbWFnZShpbWdDb25maWcpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChjb25zdCBzb3VuZENvbmZpZyBvZiBjb25maWcuc291bmRzKSB7XHJcbiAgICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5sb2FkU291bmQoc291bmRDb25maWcpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRJbWFnZShjb25maWc6IEltYWdlRGF0YUNvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gY29uZmlnLnBhdGg7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoY29uZmlnLm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7Y29uZmlnLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRTb3VuZChjb25maWc6IFNvdW5kRGF0YUNvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhjb25maWcucGF0aCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGNvbmZpZy52b2x1bWU7XHJcbiAgICAgICAgICAgIGF1ZGlvLnByZWxvYWQgPSAnYXV0byc7XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoY29uZmlnLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7Y29uZmlnLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgZXZlbiBvbiBlcnJvciB0byBub3QgYmxvY2sgZ2FtZVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGdldEltYWdlKG5hbWU6IHN0cmluZyk6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmltYWdlcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcGxheVNvdW5kKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlLCB2b2x1bWU/OiBudW1iZXIpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgY29uc3QgY2xvbmUgPSBhdWRpby5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50OyAvLyBDbG9uZSB0byBhbGxvdyBtdWx0aXBsZSBjb25jdXJyZW50IHBsYXlzXHJcbiAgICAgICAgICAgIGNsb25lLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSB2b2x1bWUgIT09IHVuZGVmaW5lZCA/IHZvbHVtZSA6IGF1ZGlvLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBBdWRpbyBwbGF5IGZhaWxlZCBmb3IgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgICAgIHJldHVybiBjbG9uZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuXHJcbiAgICBzdG9wU291bmQoYXVkaW86IEhUTUxBdWRpb0VsZW1lbnQpIHtcclxuICAgICAgICBhdWRpby5wYXVzZSgpO1xyXG4gICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgIH1cclxuXHJcbiAgICBnZXRMb2FkaW5nUHJvZ3Jlc3MoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50b3RhbEFzc2V0cyA+IDAgPyB0aGlzLmxvYWRlZENvdW50IC8gdGhpcy50b3RhbEFzc2V0cyA6IDA7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBFbnVtIGZvciBtYW5hZ2luZyBkaWZmZXJlbnQgc3RhdGVzIG9mIHRoZSBnYW1lLlxyXG4gKi9cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFX1NDUkVFTixcclxuICAgIFRVVE9SSUFMX1NDUkVFTixcclxuICAgIFdBSVRJTkdfRk9SX0JJVEUsXHJcbiAgICBSRUVMSU5HX01JTklHQU1FLFxyXG4gICAgUkVFTElOR19VUF9BTklNQVRJT04sIC8vIE5ldyBzdGF0ZSBmb3IgZmlzaCByZWVsaW5nIGFuaW1hdGlvblxyXG4gICAgR0FNRV9PVkVSLFxyXG59XHJcblxyXG4vKipcclxuICogQm9iYmVyIGdhbWUgb2JqZWN0LlxyXG4gKi9cclxuY2xhc3MgQm9iYmVyIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gaW1hZ2VOYW1lO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyKSB7XHJcbiAgICAgICAgY29uc3QgaW1nID0gYXNzZXRNYW5hZ2VyLmdldEltYWdlKHRoaXMuaW1hZ2VOYW1lKTtcclxuICAgICAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCB0aGlzLnggLSB0aGlzLndpZHRoIC8gMiwgdGhpcy55IC0gdGhpcy5oZWlnaHQgLyAyLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogRmlzaCBnYW1lIG9iamVjdC5cclxuICovXHJcbmNsYXNzIEZpc2gge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2VOYW1lOiBzdHJpbmc7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZGF0YTogRmlzaERhdGE7IC8vIFJlZmVyZW5jZSB0byBpdHMgZGF0YSBjb25maWdcclxuICAgIGRpcmVjdGlvbjogbnVtYmVyOyAvLyAtMSBmb3IgbGVmdCwgMSBmb3IgcmlnaHRcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGRhdGE6IEZpc2hEYXRhKSB7XHJcbiAgICAgICAgdGhpcy54ID0geDtcclxuICAgICAgICB0aGlzLnkgPSB5O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLmltYWdlTmFtZSA9IGRhdGEuaW1hZ2U7XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IGRhdGEuc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5kYXRhID0gZGF0YTtcclxuICAgICAgICB0aGlzLmRpcmVjdGlvbiA9IE1hdGgucmFuZG9tKCkgPCAwLjUgPyAtMSA6IDE7IC8vIFN0YXJ0IG1vdmluZyByYW5kb21seVxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgY2FudmFzV2lkdGg6IG51bWJlciwgYm9iYmVyWDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54ICs9IHRoaXMuc3BlZWQgKiB0aGlzLmRpcmVjdGlvbiAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gU2ltcGxlIGJvdW5kYXJ5IGNoZWNrIGFuZCBjaGFuZ2UgZGlyZWN0aW9uXHJcbiAgICAgICAgaWYgKHRoaXMueCA8IDAgfHwgdGhpcy54ID4gY2FudmFzV2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy5kaXJlY3Rpb24gKj0gLTE7XHJcbiAgICAgICAgICAgIHRoaXMueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNhbnZhc1dpZHRoLCB0aGlzLngpKTsgLy8gQ2xhbXAgcG9zaXRpb25cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFkZCBhIHNsaWdodCBwdWxsIHRvd2FyZHMgdGhlIGJvYmJlciB3aGVuIGNsb3NlXHJcbiAgICAgICAgLy8gVGhpcyBtYWtlcyBmaXNoIG1vcmUgbGlrZWx5IHRvIGJlIG5lYXIgdGhlIGJvYmJlciBpZiBwbGF5ZXIgaG9sZHMgaXQgc3RpbGxcclxuICAgICAgICBjb25zdCBkaXN0YW5jZVRvQm9iYmVyID0gTWF0aC5hYnModGhpcy54IC0gYm9iYmVyWCk7XHJcbiAgICAgICAgaWYgKGRpc3RhbmNlVG9Cb2JiZXIgPCAyMDApIHsgLy8gSWYgd2l0aGluIDIwMHB4IG9mIGJvYmJlclxyXG4gICAgICAgICAgICBjb25zdCBwdWxsRGlyZWN0aW9uID0gKGJvYmJlclggLSB0aGlzLnggPiAwKSA/IDEgOiAtMTtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHB1bGxEaXJlY3Rpb24gKiB0aGlzLnNwZWVkICogZGVsdGFUaW1lICogKDEgLSBkaXN0YW5jZVRvQm9iYmVyIC8gMjAwKSAqIDAuNTsgLy8gV2Vha2VyIHB1bGxcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIpIHtcclxuICAgICAgICBjb25zdCBpbWcgPSBhc3NldE1hbmFnZXIuZ2V0SW1hZ2UodGhpcy5pbWFnZU5hbWUpO1xyXG4gICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgY3R4LnNhdmUoKTtcclxuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSh0aGlzLngsIHRoaXMueSk7XHJcbiAgICAgICAgICAgIC8vIEZsaXAgaW1hZ2UgaWYgbW92aW5nIHJpZ2h0IChhc3N1bWluZyBkZWZhdWx0IGltYWdlIGZhY2VzIGxlZnQpXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmRpcmVjdGlvbiA9PT0gMSkgeyBcclxuICAgICAgICAgICAgICAgIGN0eC5zY2FsZSgtMSwgMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIC10aGlzLndpZHRoIC8gMiwgLXRoaXMuaGVpZ2h0IC8gMiwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICBjdHgucmVzdG9yZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE1haW4gR2FtZSBjbGFzcyByZXNwb25zaWJsZSBmb3IgbWFuYWdpbmcgZ2FtZSBzdGF0ZSwgbG9naWMsIGFuZCByZW5kZXJpbmcuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZztcclxuICAgIHByaXZhdGUgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIgPSBuZXcgQXNzZXRNYW5hZ2VyKCk7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBnYW1lVGltZXI6IG51bWJlciA9IDA7IC8vIEluIHNlY29uZHNcclxuICAgIHByaXZhdGUgZmlzaFNwYXduVGltZXI6IG51bWJlciA9IDA7IC8vIEluIHNlY29uZHNcclxuICAgIHByaXZhdGUgZmlzaGVzOiBGaXNoW10gPSBbXTtcclxuICAgIHByaXZhdGUgYm9iYmVyITogQm9iYmVyO1xyXG4gICAgcHJpdmF0ZSBrZXlzUHJlc3NlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIGNhdWdodEZpc2hOYW1lOiBzdHJpbmcgfCBudWxsID0gbnVsbDsgLy8gRm9yIGRpc3BsYXlpbmcgY2F0Y2ggb3V0Y29tZVxyXG4gICAgcHJpdmF0ZSBvdXRjb21lRGlzcGxheVRpbWVyOiBudW1iZXIgPSAwOyAvLyBIb3cgbG9uZyB0byBkaXNwbGF5IG91dGNvbWVcclxuXHJcbiAgICAvLyBCb2JiZXIgbW92ZW1lbnRcclxuICAgIHByaXZhdGUgYm9iYmVyTW92ZURpcmVjdGlvbjogbnVtYmVyID0gMDsgLy8gMDogbm9uZSwgLTE6IHVwLCAxOiBkb3duXHJcblxyXG4gICAgLy8gQml0ZSBkZXRlY3Rpb25cclxuICAgIHByaXZhdGUgZmlzaFVuZGVyQm9iYmVyOiBGaXNoIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGZpc2hVbmRlckJvYmJlclRpbWVyOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIC8vIE1pbmktZ2FtZSB2YXJpYWJsZXNcclxuICAgIHByaXZhdGUgbWluaUdhbWVTdWNjZXNzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBtaW5pR2FtZUZhaWx1cmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lUG9pbnRlclBvc2l0aW9uOiBudW1iZXIgPSAwOyAvLyAtMSB0byAxIHJlcHJlc2VudGluZyBsZWZ0IHRvIHJpZ2h0XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlcjogbnVtYmVyID0gMDsgLy8gLTEgdG8gMVxyXG4gICAgcHJpdmF0ZSBjdXJyZW50RmlzaEluTWluaWdhbWU6IEZpc2ggfCB1bmRlZmluZWQ7IC8vIFRoZSBhY3R1YWwgZmlzaCBvYmplY3QgY3VycmVudGx5IGJlaW5nIHJlZWxlZFxyXG5cclxuICAgIC8vIFJlZWxpbmcgdXAgYW5pbWF0aW9uIHZhcmlhYmxlc1xyXG4gICAgcHJpdmF0ZSByZWVsaW5nVXBBbmltYXRpb25UaW1lcjogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgcmVlbGluZ1VwRHVyYXRpb246IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHJlZWxpbmdVcFRhcmdldFk6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGluaXRpYWxCb2JiZXJZRm9yUmVlbFVwOiBudW1iZXIgPSAwO1xyXG5cclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQsIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICAvLyBEZWZhdWx0IGNhbnZhcyBzaXplLCB3aWxsIGJlIG92ZXJ3cml0dGVuIGJ5IGNvbmZpZ1xyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gODAwO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IDYwMDtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bik7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5oYW5kbGVLZXlVcCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdGFydHMgdGhlIGdhbWUgYnkgbG9hZGluZyBjb25maWd1cmF0aW9uIGFuZCBhc3NldHMsIHRoZW4gaW5pdGlhdGluZyB0aGUgZ2FtZSBsb29wLlxyXG4gICAgICovXHJcbiAgICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRDb25maWcoKTtcclxuICAgICAgICB0aGlzLmluaXRHYW1lKCk7IC8vIEluaXRpYWxpemUgZ2FtZSBjb21wb25lbnRzIGFmdGVyIGNvbmZpZyBpcyBsb2FkZWRcclxuICAgICAgICB0aGlzLmxvb3AoMCk7IC8vIFN0YXJ0IHRoZSBnYW1lIGxvb3BcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRDb25maWcoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIEdhbWVDb25maWc7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jb25maWcuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodDtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hc3NldE1hbmFnZXIubG9hZEFzc2V0cyh0aGlzLmNvbmZpZy5hc3NldHMpO1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU47IC8vIFRyYW5zaXRpb24gdG8gdGl0bGUgc2NyZWVuIGFmdGVyIGxvYWRpbmdcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uIG9yIGFzc2V0czpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBGYWxsYmFjayB0byBhIGZhaWx1cmUgc3RhdGUgaWYgY3JpdGljYWwgbG9hZGluZyBmYWlsc1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5pdGlhbGl6ZXMgb3IgcmVzZXRzIGdhbWUtc3BlY2lmaWMgdmFyaWFibGVzIGZvciBhIG5ldyBnYW1lIHNlc3Npb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaW5pdEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5nYW1lVGltZXIgPSB0aGlzLmNvbmZpZy5nYW1lRHVyYXRpb25TZWNvbmRzO1xyXG4gICAgICAgIHRoaXMuZmlzaFNwYXduVGltZXIgPSAwO1xyXG4gICAgICAgIHRoaXMuZmlzaGVzID0gW107XHJcbiAgICAgICAgdGhpcy5ib2JiZXIgPSBuZXcgQm9iYmVyKFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5pbml0aWFsQm9iYmVyWCAqIHRoaXMuY2FudmFzLndpZHRoLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5pbml0aWFsQm9iYmVyWSAqIHRoaXMuY2FudmFzLmhlaWdodCwgLy8gQm9iYmVyIHN0YXJ0cyBhdCB3YXRlciBzdXJmYWNlXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmJvYmJlcldpZHRoLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5ib2JiZXJIZWlnaHQsXHJcbiAgICAgICAgICAgICdib2JiZXInXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gU3RvcCBhbnkgcHJldmlvdXMgQkdNIGFuZCBzdGFydCBuZXcgb25lXHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIuc3RvcFNvdW5kKHRoaXMuYmdtQXVkaW8pO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmJnbUF1ZGlvID0gdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ20nLCB0cnVlLCB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lKTtcclxuXHJcbiAgICAgICAgLy8gUmVzZXQgbWluaS1nYW1lIHNwZWNpZmljIHZhcmlhYmxlc1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVTdWNjZXNzID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lRmFpbHVyZSA9IDA7XHJcbiAgICAgICAgdGhpcy5taW5pR2FtZVRpbWVyID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciA9IDA7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgdGhpcy5jYXVnaHRGaXNoTmFtZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5vdXRjb21lRGlzcGxheVRpbWVyID0gMDtcclxuXHJcbiAgICAgICAgLy8gUmVzZXQgYm9iYmVyIGFuZCBiaXRlIGRldGVjdGlvbiB2YXJpYWJsZXNcclxuICAgICAgICB0aGlzLmJvYmJlck1vdmVEaXJlY3Rpb24gPSAwO1xyXG4gICAgICAgIHRoaXMuZmlzaFVuZGVyQm9iYmVyID0gbnVsbDtcclxuICAgICAgICB0aGlzLmZpc2hVbmRlckJvYmJlclRpbWVyID0gMDtcclxuXHJcbiAgICAgICAgLy8gUmVzZXQgcmVlbGluZyBhbmltYXRpb24gdmFyaWFibGVzXHJcbiAgICAgICAgdGhpcy5yZWVsaW5nVXBBbmltYXRpb25UaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5yZWVsaW5nVXBEdXJhdGlvbiA9IDA7XHJcbiAgICAgICAgdGhpcy5yZWVsaW5nVXBUYXJnZXRZID0gMDtcclxuICAgICAgICB0aGlzLmluaXRpYWxCb2JiZXJZRm9yUmVlbFVwID0gMDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMga2V5Ym9hcmQga2V5IGRvd24gZXZlbnRzLlxyXG4gICAgICogQHBhcmFtIGV2ZW50IC0gVGhlIEtleWJvYXJkRXZlbnQgb2JqZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24gPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkID0+IHtcclxuICAgICAgICB0aGlzLmtleXNQcmVzc2VkLmFkZChldmVudC5jb2RlKTtcclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdTcGFjZScpIHtcclxuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBwYWdlIHNjcm9sbGluZyB3aXRoIHNwYWNlYmFyXHJcblxyXG4gICAgICAgICAgICBzd2l0Y2ggKHRoaXMuY3VycmVudFN0YXRlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU46XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuVFVUT1JJQUxfU0NSRUVOO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU46XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuV0FJVElOR19GT1JfQklURTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NlbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUkVFTElOR19NSU5JR0FNRTpcclxuICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IGFwcGx5IGVmZmVjdCBpZiB3aXRoaW4gdGFyZ2V0IHpvbmUgZm9yIG1vcmUgY2hhbGxlbmdlXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0Wm9uZVN0YXJ0ID0gdGhpcy5taW5pR2FtZVRhcmdldFpvbmVDZW50ZXIgLSB0aGlzLmNvbmZpZy5taW5pR2FtZVRhcmdldFpvbmVXaWR0aCAvIDI7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0Wm9uZUVuZCA9IHRoaXMubWluaUdhbWVUYXJnZXRab25lQ2VudGVyICsgdGhpcy5jb25maWcubWluaUdhbWVUYXJnZXRab25lV2lkdGggLyAyO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uID49IHRhcmdldFpvbmVTdGFydCAmJiB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uIDw9IHRhcmdldFpvbmVFbmQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5taW5pR2FtZVN1Y2Nlc3MgKz0gdGhpcy5jb25maWcubWluaUdhbWVQcmVzc0VmZmVjdDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdyZWVsJywgZmFsc2UsIDAuNyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbml0R2FtZSgpOyAvLyBSZXNldCBnYW1lIHN0YXRlXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOOyAvLyBHbyBiYWNrIHRvIHRpdGxlIGZvciByZXN0YXJ0XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZWxlY3QnKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5jb2RlID09PSAnQXJyb3dVcCcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9iYmVyTW92ZURpcmVjdGlvbiA9IC0xO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmNvZGUgPT09ICdBcnJvd0Rvd24nKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvYmJlck1vdmVEaXJlY3Rpb24gPSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBrZXlib2FyZCBrZXkgdXAgZXZlbnRzLlxyXG4gICAgICogQHBhcmFtIGV2ZW50IC0gVGhlIEtleWJvYXJkRXZlbnQgb2JqZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleVVwID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICAgICAgdGhpcy5rZXlzUHJlc3NlZC5kZWxldGUoZXZlbnQuY29kZSk7XHJcbiAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdBcnJvd1VwJyB8fCBldmVudC5jb2RlID09PSAnQXJyb3dEb3duJykge1xyXG4gICAgICAgICAgICB0aGlzLmJvYmJlck1vdmVEaXJlY3Rpb24gPSAwOyAvLyBTdG9wIGJvYmJlciBtb3ZlbWVudFxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRoZSBtYWluIGdhbWUgbG9vcCwgY2FsbGVkIGJ5IHJlcXVlc3RBbmltYXRpb25GcmFtZS5cclxuICAgICAqIEBwYXJhbSBjdXJyZW50VGltZSAtIFRoZSBjdXJyZW50IHRpbWUgcHJvdmlkZWQgYnkgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGxvb3AgPSAoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApOiB2b2lkID0+IHtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLmRyYXcoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMubG9vcCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIGdhbWUgbG9naWMgYmFzZWQgb24gdGhlIGN1cnJlbnQgc3RhdGUgYW5kIHRpbWUgZWxhcHNlZC5cclxuICAgICAqIEBwYXJhbSBkZWx0YVRpbWUgLSBUaGUgdGltZSBlbGFwc2VkIHNpbmNlIHRoZSBsYXN0IGZyYW1lLCBpbiBzZWNvbmRzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLkxPQURJTkcpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gQXR0ZW1wdCB0byBwbGF5IEJHTSBpZiBpdCBwYXVzZWQsIHR5cGljYWxseSBkdWUgdG8gYnJvd3NlciBhdXRvcGxheSBwb2xpY2llc1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvICYmIHRoaXMuYmdtQXVkaW8ucGF1c2VkICYmIHRoaXMuY3VycmVudFN0YXRlICE9PSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOICYmIHRoaXMuY3VycmVudFN0YXRlICE9PSBHYW1lU3RhdGUuVFVUT1JJQUxfU0NSRUVOKSB7XHJcbiAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkZhaWxlZCB0byByZXN1bWUgQkdNOlwiLCBlKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuY3VycmVudFN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFX1NDUkVFTjpcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVFVUT1JJQUxfU0NSRUVOOlxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICAvLyBObyBzcGVjaWZpYyB1cGRhdGUgbG9naWMsIGp1c3Qgd2FpdGluZyBmb3IgdXNlciBpbnB1dCB0byB0cmFuc2l0aW9uXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuV0FJVElOR19GT1JfQklURTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmdhbWVUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB0aGlzLmFzc2V0TWFuYWdlci5zdG9wU291bmQodGhpcy5iZ21BdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdnYW1lT3ZlclNvdW5kJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIGJvYmJlciBwb3NpdGlvbiBiYXNlZCBvbiBpbnB1dFxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYm9iYmVyTW92ZURpcmVjdGlvbiAhPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYm9iYmVyLnkgKz0gdGhpcy5ib2JiZXJNb3ZlRGlyZWN0aW9uICogdGhpcy5jb25maWcuYm9iYmVyTW92ZVNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYm9iYmVyLnkgPSBNYXRoLm1heChcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcubWluQm9iYmVyWVJhdGlvICogdGhpcy5jYW52YXMuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBNYXRoLm1pbih0aGlzLmNvbmZpZy5tYXhCb2JiZXJZUmF0aW8gKiB0aGlzLmNhbnZhcy5oZWlnaHQsIHRoaXMuYm9iYmVyLnkpXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgZmlzaCBtb3ZlbWVudCwgZXhjbHVkaW5nIGFueSBmaXNoIGN1cnJlbnRseSB1bmRlciB0aGUgYm9iYmVyIGZvciBhIGJpdGVcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlzaGVzLmZvckVhY2goZmlzaCA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpc2ggIT09IHRoaXMuZmlzaFVuZGVyQm9iYmVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpc2gudXBkYXRlKGRlbHRhVGltZSAqIHRoaXMuY29uZmlnLmZpc2hTd2ltU3BlZWRNdWx0aXBsaWVyLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5ib2JiZXIueCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gU3Bhd24gZmlzaFxyXG4gICAgICAgICAgICAgICAgdGhpcy5maXNoU3Bhd25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5maXNoU3Bhd25UaW1lciA+PSB0aGlzLmNvbmZpZy5maXNoU3Bhd25JbnRlcnZhbFNlY29uZHMpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hTcGF3blRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRmlzaCgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIE1hbmFnZSBvdXRjb21lIGRpc3BsYXlcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNhdWdodEZpc2hOYW1lICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vdXRjb21lRGlzcGxheVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5vdXRjb21lRGlzcGxheVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jYXVnaHRGaXNoTmFtZSA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGZvciBiaXRlIG9ubHkgaWYgbm8gb3V0Y29tZSBpcyBjdXJyZW50bHkgZGlzcGxheWVkXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jYXVnaHRGaXNoTmFtZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBjbG9zZXN0RmlzaDogRmlzaCB8IG51bGwgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBtaW5EaXN0YW5jZVNxID0gSW5maW5pdHk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZmlzaCBvZiB0aGlzLmZpc2hlcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkeCA9IGZpc2gueCAtIHRoaXMuYm9iYmVyLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZmlzaC55IC0gdGhpcy5ib2JiZXIueTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzdGFuY2VTcSA9IGR4ICogZHggKyBkeSAqIGR5O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgd2l0aGluIGJpdGVUcmlnZ2VyUmFkaXVzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZVNxIDw9IHRoaXMuY29uZmlnLmJpdGVUcmlnZ2VyUmFkaXVzICogdGhpcy5jb25maWcuYml0ZVRyaWdnZXJSYWRpdXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZVNxIDwgbWluRGlzdGFuY2VTcSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1pbkRpc3RhbmNlU3EgPSBkaXN0YW5jZVNxO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsb3Nlc3RGaXNoID0gZmlzaDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsb3Nlc3RGaXNoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmZpc2hVbmRlckJvYmJlciA9PT0gY2xvc2VzdEZpc2gpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlzaFVuZGVyQm9iYmVyVGltZXIgKz0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZmlzaFVuZGVyQm9iYmVyVGltZXIgPj0gdGhpcy5jb25maWcuYml0ZUhvbGREdXJhdGlvblNlY29uZHMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5SRUVMSU5HX01JTklHQU1FO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnYml0ZScpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5pdE1pbmlHYW1lKHRoaXMuZmlzaFVuZGVyQm9iYmVyKTsgLy8gUGFzcyB0aGUgYWN0dWFsIEZpc2ggb2JqZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXIgPSBudWxsOyAvLyBSZXNldCBmb3IgbmV4dCBiaXRlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXJUaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOZXcgZmlzaCBkZXRlY3RlZCBvciBzd2l0Y2hlZCB0byBhIGRpZmZlcmVudCBjbG9zZXN0IGZpc2hcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlzaFVuZGVyQm9iYmVyID0gY2xvc2VzdEZpc2g7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hVbmRlckJvYmJlclRpbWVyID0gMDsgLy8gU3RhcnQgdGltZXIgZm9yIHRoaXMgbmV3IGZpc2hcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5vIGZpc2ggbmVhciBib2JiZXJcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXIgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hVbmRlckJvYmJlclRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUkVFTElOR19NSU5JR0FNRTpcclxuICAgICAgICAgICAgICAgIHRoaXMubWluaUdhbWVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5taW5pR2FtZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc29sdmVNaW5pR2FtZSgpOyAvLyBUaW1lJ3MgdXAsIHJlc29sdmUgYmFzZWQgb24gc3VjY2Vzcy9mYWlsdXJlXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRGVjYXkgc3VjY2VzcyBvdmVyIHRpbWVcclxuICAgICAgICAgICAgICAgIHRoaXMubWluaUdhbWVTdWNjZXNzID0gTWF0aC5tYXgoMCwgdGhpcy5taW5pR2FtZVN1Y2Nlc3MgLSB0aGlzLmNvbmZpZy5taW5pR2FtZURlY2F5UmF0ZSAqIGRlbHRhVGltZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIHBvaW50ZXIgcG9zaXRpb24gKG1vdmVzIGxlZnQvcmlnaHQpXHJcbiAgICAgICAgICAgICAgICB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uICs9IHRoaXMuY29uZmlnLm1pbmlHYW1lQmFzZVBvaW50ZXJTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uID4gMSB8fCB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uIDwgLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5taW5pR2FtZUJhc2VQb2ludGVyU3BlZWQgKj0gLTE7IC8vIFJldmVyc2UgZGlyZWN0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiA9IE1hdGgubWF4KC0xLCBNYXRoLm1pbigxLCB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uKSk7IC8vIENsYW1wXHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcG9pbnRlciBpcyBvdXRzaWRlIHRhcmdldCB6b25lXHJcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab25lU3RhcnQgPSB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciAtIHRoaXMuY29uZmlnLm1pbmlHYW1lVGFyZ2V0Wm9uZVdpZHRoIC8gMjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFpvbmVFbmQgPSB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciArIHRoaXMuY29uZmlnLm1pbmlHYW1lVGFyZ2V0Wm9uZVdpZHRoIC8gMjtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoISh0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uID49IHRhcmdldFpvbmVTdGFydCAmJiB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uIDw9IHRhcmdldFpvbmVFbmQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5taW5pR2FtZUZhaWx1cmUgKz0gZGVsdGFUaW1lOyAvLyBGYWlsdXJlIGluY3JlYXNlcyBvdmVyIHRpbWUgb3V0c2lkZSB6b25lXHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMubWluaUdhbWVGYWlsdXJlID49IHRoaXMuY29uZmlnLm1pbmlHYW1lRmFpbHVyZVRocmVzaG9sZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzb2x2ZU1pbmlHYW1lKGZhbHNlKTsgLy8gRm9yY2VkIGZhaWwgaWYgZmFpbHVyZSB0aHJlc2hvbGQgcmVhY2hlZFxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLm1pbmlHYW1lU3VjY2VzcyA+PSB0aGlzLmNvbmZpZy5taW5pR2FtZVN1Y2Nlc3NUYXJnZXQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc29sdmVNaW5pR2FtZSh0cnVlKTsgLy8gRm9yY2VkIHN1Y2Nlc3MgaWYgc3VjY2VzcyB0YXJnZXQgcmVhY2hlZFxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBvdGhlciBmaXNoIG1vdmVtZW50IGR1cmluZyBtaW5pLWdhbWVcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlzaGVzLmZvckVhY2goZmlzaCA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpc2ggIT09IHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpc2gudXBkYXRlKGRlbHRhVGltZSAqIHRoaXMuY29uZmlnLmZpc2hTd2ltU3BlZWRNdWx0aXBsaWVyLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5ib2JiZXIueCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUkVFTElOR19VUF9BTklNQVRJT046XHJcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuV0FJVElOR19GT1JfQklURTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBSZXNldCBib2JiZXIgWSB0byBpbml0aWFsIHdhdGVyIHN1cmZhY2UgbGV2ZWxcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJvYmJlci55ID0gdGhpcy5jb25maWcuaW5pdGlhbEJvYmJlclkgKiB0aGlzLmNhbnZhcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZWVsaW5nVXBBbmltYXRpb25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwcm9ncmVzcyA9IE1hdGgubWluKDEsIHRoaXMucmVlbGluZ1VwQW5pbWF0aW9uVGltZXIgLyB0aGlzLnJlZWxpbmdVcER1cmF0aW9uKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBBbmltYXRlIGJvYmJlciBtb3ZpbmcgdXBcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9iYmVyLnkgPSB0aGlzLmluaXRpYWxCb2JiZXJZRm9yUmVlbFVwICsgKHRoaXMucmVlbGluZ1VwVGFyZ2V0WSAtIHRoaXMuaW5pdGlhbEJvYmJlcllGb3JSZWVsVXApICogcHJvZ3Jlc3M7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRmlzaCBmb2xsb3dzIGJvYmJlcidzIFgsIGFuZCBzdGF5cyBzbGlnaHRseSBiZWxvdyBib2JiZXIncyBZXHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZS54ID0gdGhpcy5ib2JiZXIueDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lLnkgPSB0aGlzLmJvYmJlci55ICsgKHRoaXMuYm9iYmVyLmhlaWdodCAvIDIpICsgKHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lLmhlaWdodCAvIDIpIC0gMTA7IC8vIDEwcHggb2Zmc2V0IGZvciB2aXN1YWwgYXR0YWNobWVudFxyXG5cclxuICAgICAgICAgICAgICAgIGlmIChwcm9ncmVzcyA+PSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQW5pbWF0aW9uIGZpbmlzaGVkXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZS5kYXRhLnNjb3JlO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnY2F0Y2gnKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNhdWdodEZpc2hOYW1lID0gdGhpcy5jb25maWcudWkuZmlzaENhdWdodDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm91dGNvbWVEaXNwbGF5VGltZXIgPSAyO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBSZW1vdmUgdGhlIHN1Y2Nlc3NmdWxseSBjYXVnaHQgZmlzaCBmcm9tIHRoZSBhY3RpdmUgZmlzaGVzIGFycmF5XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLmZpc2hlcy5pbmRleE9mKHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPiAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hlcy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuV0FJVElOR19GT1JfQklURTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBSZXNldCBib2JiZXIgWSB0byBpbml0aWFsIHdhdGVyIHN1cmZhY2UgbGV2ZWwgZm9yIG5leHQgY2FzdFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYm9iYmVyLnkgPSB0aGlzLmNvbmZpZy5pbml0aWFsQm9iYmVyWSAqIHRoaXMuY2FudmFzLmhlaWdodDtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgb3RoZXIgZmlzaCBtb3ZlbWVudCBkdXJpbmcgcmVlbGluZyB1cCBhbmltYXRpb25cclxuICAgICAgICAgICAgICAgIHRoaXMuZmlzaGVzLmZvckVhY2goZmlzaCA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpc2ggIT09IHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpc2gudXBkYXRlKGRlbHRhVGltZSAqIHRoaXMuY29uZmlnLmZpc2hTd2ltU3BlZWRNdWx0aXBsaWVyLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5ib2JiZXIueCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTcGF3bnMgYSBuZXcgZmlzaCBhdCBhIHJhbmRvbSBwb3NpdGlvbiBiZWxvdyB0aGUgd2F0ZXIgbGluZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGF3bkZpc2goKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZmlzaENvbmZpZyA9IHRoaXMuY29uZmlnLmZpc2hlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5maXNoZXMubGVuZ3RoKV07XHJcbiAgICAgICAgY29uc3Qgc3Bhd25YID0gTWF0aC5yYW5kb20oKSAqIHRoaXMuY2FudmFzLndpZHRoO1xyXG5cclxuICAgICAgICBjb25zdCB3YXRlckxpbmVZID0gdGhpcy5jb25maWcuaW5pdGlhbEJvYmJlclkgKiB0aGlzLmNhbnZhcy5oZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgbWluU3Bhd25ZID0gd2F0ZXJMaW5lWSArIHRoaXMuY29uZmlnLmZpc2hEZWZhdWx0SGVpZ2h0IC8gMiArIDEwOyAvLyAxMHB4IGJ1ZmZlciBiZWxvdyB3YXRlciBzdXJmYWNlXHJcbiAgICAgICAgY29uc3QgbWF4U3Bhd25ZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC0gdGhpcy5jb25maWcuZmlzaERlZmF1bHRIZWlnaHQgLyAyIC0gMTA7IC8vIDEwcHggYnVmZmVyIGZyb20gYm90dG9tIGVkZ2VcclxuXHJcbiAgICAgICAgLy8gRW5zdXJlIHRoZXJlJ3MgYSB2YWxpZCByYW5nZSBmb3Igc3Bhd25pbmdcclxuICAgICAgICBpZiAobWluU3Bhd25ZIDwgbWF4U3Bhd25ZKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNwYXduWSA9IG1pblNwYXduWSArIE1hdGgucmFuZG9tKCkgKiAobWF4U3Bhd25ZIC0gbWluU3Bhd25ZKTtcclxuICAgICAgICAgICAgY29uc3QgbmV3RmlzaCA9IG5ldyBGaXNoKFxyXG4gICAgICAgICAgICAgICAgc3Bhd25YLFxyXG4gICAgICAgICAgICAgICAgc3Bhd25ZLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jb25maWcuZmlzaERlZmF1bHRXaWR0aCxcclxuICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmZpc2hEZWZhdWx0SGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgZmlzaENvbmZpZ1xyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLmZpc2hlcy5wdXNoKG5ld0Zpc2gpO1xyXG5cclxuICAgICAgICAgICAgLy8gTGltaXQgdGhlIG51bWJlciBvZiBmaXNoIG9uIHNjcmVlblxyXG4gICAgICAgICAgICBpZiAodGhpcy5maXNoZXMubGVuZ3RoID4gdGhpcy5jb25maWcubWF4RmlzaE9uU2NyZWVuKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgdGhlIG9sZGVzdCBmaXNoLCBidXQgb25seSBpZiBpdCdzIG5vdCB0aGUgb25lIGN1cnJlbnRseSBlbmdhZ2VkIGluIG1pbmlnYW1lL2FuaW1hdGlvblxyXG4gICAgICAgICAgICAgICAgbGV0IHJlbW92ZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5maXNoZXMubGVuZ3RoIC0gMTsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZmlzaGVzW2ldICE9PSB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSAmJiB0aGlzLmZpc2hlc1tpXSAhPT0gdGhpcy5maXNoVW5kZXJCb2JiZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoZXMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZW1vdmVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIG9sZGVzdCBvbmUgd2FzIHRoZSBjdXJyZW50IGZpc2gsIGp1c3QgZG9uJ3QgcmVtb3ZlIGFueXRoaW5nLCBvciBmb3JjZSByZW1vdmFsIGlmIGFycmF5IGdldHMgdG9vIGJpZy5cclxuICAgICAgICAgICAgICAgIC8vIEZvciBub3csIHNpbXBsZXI6IGlmIGl0J3MgdGhlIGN1cnJlbnQgZmlzaCwgaXQgd29uJ3QgYmUgaW4gdGhlIGFjdGl2ZSBhcnJheSBhbnl3YXkgYWZ0ZXIgbWluaWdhbWUgc3RhcnQuXHJcbiAgICAgICAgICAgICAgICAvLyBSZS1ldmFsdWF0ZTogY3VycmVudEZpc2hJbk1pbmlnYW1lIGlzIE5PVCByZW1vdmVkIGZyb20gYGZpc2hlc2AgYXJyYXkgYXQgYGluaXRNaW5pR2FtZWAuXHJcbiAgICAgICAgICAgICAgICAvLyBTbyB3ZSBuZWVkIHRvIGVuc3VyZSB3ZSBkb24ndCByZW1vdmUgaXQgZnJvbSB0aGUgc3RhcnQgb2YgdGhlIGFycmF5IGlmIGl0J3MgdGhlIG9sZGVzdC5cclxuICAgICAgICAgICAgICAgIGlmICghcmVtb3ZlZCAmJiB0aGlzLmZpc2hlcy5sZW5ndGggPiB0aGlzLmNvbmZpZy5tYXhGaXNoT25TY3JlZW4gJiYgdGhpcy5maXNoZXNbMF0gIT09IHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lICYmIHRoaXMuZmlzaGVzWzBdICE9PSB0aGlzLmZpc2hVbmRlckJvYmJlcikge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlzaGVzLnNoaWZ0KCk7IC8vIEZhbGxiYWNrIHRvIHJlbW92aW5nIHRoZSBhYnNvbHV0ZSBvbGRlc3QgaWYgbm90IGVuZ2FnZWRcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIkZpc2ggc3Bhd24gcmFuZ2UgaXMgaW52YWxpZC4gQ2hlY2sgY2FudmFzIGRpbWVuc2lvbnMsIGluaXRpYWxCb2JiZXJZLCBhbmQgZmlzaERlZmF1bHRIZWlnaHQgaW4gY29uZmlnLlwiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJbml0aWFsaXplcyB0aGUgcmVlbGluZyBtaW5pLWdhbWUuXHJcbiAgICAgKiBAcGFyYW0gZmlzaCAtIFRoZSBhY3R1YWwgRmlzaCBvYmplY3QgdGhhdCBpbml0aWF0ZWQgdGhlIG1pbmktZ2FtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBpbml0TWluaUdhbWUoZmlzaDogRmlzaCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVTdWNjZXNzID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lRmFpbHVyZSA9IDA7XHJcbiAgICAgICAgdGhpcy5taW5pR2FtZVRpbWVyID0gdGhpcy5jb25maWcubWluaUdhbWVEdXJhdGlvblNlY29uZHM7XHJcbiAgICAgICAgdGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiA9IDA7IC8vIFN0YXJ0IHBvaW50ZXIgYXQgY2VudGVyXHJcbiAgICAgICAgdGhpcy5taW5pR2FtZVRhcmdldFpvbmVDZW50ZXIgPSAoTWF0aC5yYW5kb20oKSAqIDEuNikgLSAwLjg7IC8vIFJhbmRvbSBwb3NpdGlvbiBiZXR3ZWVuIC0wLjggYW5kIDAuOFxyXG4gICAgICAgIHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lID0gZmlzaDsgLy8gU3RvcmUgdGhlIGFjdHVhbCBmaXNoIGluc3RhbmNlIChpdCByZW1haW5zIGluIHRoZSBmaXNoZXMgYXJyYXkpXHJcblxyXG4gICAgICAgIC8vIEFkanVzdCBtaW5pLWdhbWUgcGFyYW1ldGVycyBiYXNlZCBvbiBmaXNoIGRpZmZpY3VsdHlcclxuICAgICAgICB0aGlzLmNvbmZpZy5taW5pR2FtZUJhc2VQb2ludGVyU3BlZWQgPSAxLjAgKyAoZmlzaC5kYXRhLm1pbmlHYW1lRGlmZmljdWx0eSAqIDAuNSk7XHJcbiAgICAgICAgLy8gUmFuZG9taXplIGluaXRpYWwgcG9pbnRlciBzcGVlZCBkaXJlY3Rpb25cclxuICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA8IDAuNSkgeyB0aGlzLmNvbmZpZy5taW5pR2FtZUJhc2VQb2ludGVyU3BlZWQgKj0gLTE7IH1cclxuICAgICAgICB0aGlzLmNvbmZpZy5taW5pR2FtZURlY2F5UmF0ZSA9IDAuOCArIChmaXNoLmRhdGEubWluaUdhbWVEaWZmaWN1bHR5ICogMC4yKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlc29sdmVzIHRoZSBtaW5pLWdhbWUsIGRldGVybWluaW5nIGlmIHRoZSBmaXNoIHdhcyBjYXVnaHQgb3IgbG9zdC5cclxuICAgICAqIEBwYXJhbSBmb3JjZWRPdXRjb21lIC0gT3B0aW9uYWwgYm9vbGVhbiB0byBmb3JjZSBhIHN1Y2Nlc3Mgb3IgZmFpbHVyZSAoZS5nLiwgaWYgdGFyZ2V0L3RocmVzaG9sZCByZWFjaGVkIGVhcmx5KS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSByZXNvbHZlTWluaUdhbWUoZm9yY2VkT3V0Y29tZT86IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBjYXVnaHQgPSBmb3JjZWRPdXRjb21lICE9PSB1bmRlZmluZWQgPyBmb3JjZWRPdXRjb21lIDogKHRoaXMubWluaUdhbWVTdWNjZXNzID49IHRoaXMuY29uZmlnLm1pbmlHYW1lU3VjY2Vzc1RhcmdldCk7XHJcblxyXG4gICAgICAgIGlmIChjYXVnaHQgJiYgdGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUpIHtcclxuICAgICAgICAgICAgLy8gSW5pdGlhdGUgcmVlbGluZyB1cCBhbmltYXRpb24gaW5zdGVhZCBvZiBpbnN0YW50bHkgYWRkaW5nIHNjb3JlXHJcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbEJvYmJlcllGb3JSZWVsVXAgPSB0aGlzLmJvYmJlci55O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3Qgd2F0ZXJMaW5lWSA9IHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJZICogdGhpcy5jYW52YXMuaGVpZ2h0O1xyXG4gICAgICAgICAgICBjb25zdCBib2F0SW1hZ2UgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnYm9hdCcpO1xyXG4gICAgICAgICAgICBjb25zdCBib2F0SGVpZ2h0ID0gYm9hdEltYWdlID8gYm9hdEltYWdlLmhlaWdodCA6IDA7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvYXRZID0gd2F0ZXJMaW5lWSAtIGJvYXRIZWlnaHQ7IC8vIFRvcCBZIG9mIHRoZSBib2F0IGltYWdlXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBUYXJnZXQgdGhlIGJvYmJlciB0byB0aGUgcG9pbnQgd2hlcmUgdGhlIGZpc2hpbmcgbGluZSBvcmlnaW5hdGVzIG9uIHRoZSBib2F0XHJcbiAgICAgICAgICAgIHRoaXMucmVlbGluZ1VwVGFyZ2V0WSA9IGJvYXRZICsgdGhpcy5jb25maWcuZmlzaGluZ0xpbmVPZmZzZXRZO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5yZWVsaW5nVXBEdXJhdGlvbiA9IHRoaXMuY29uZmlnLnJlZWxpbmdVcER1cmF0aW9uU2Vjb25kcztcclxuICAgICAgICAgICAgdGhpcy5yZWVsaW5nVXBBbmltYXRpb25UaW1lciA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLlJFRUxJTkdfVVBfQU5JTUFUSU9OO1xyXG5cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBGYWlsdXJlIHBhdGhcclxuICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdmYWlsJyk7XHJcbiAgICAgICAgICAgIHRoaXMuY2F1Z2h0RmlzaE5hbWUgPSB0aGlzLmNvbmZpZy51aS5maXNoTG9zdDsgLy8gRGlzcGxheSBcIkxvc3QhXCIgbWVzc2FnZVxyXG4gICAgICAgICAgICB0aGlzLm91dGNvbWVEaXNwbGF5VGltZXIgPSAyO1xyXG5cclxuICAgICAgICAgICAgLy8gUmVtb3ZlIHRoZSBsb3N0IGZpc2ggZnJvbSB0aGUgYGZpc2hlc2AgYXJyYXlcclxuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuZmlzaGVzLmluZGV4T2YodGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hlcy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lID0gdW5kZWZpbmVkOyAvLyBDbGVhciBmaXNoIGluIG1pbmktZ2FtZVxyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFOyAvLyBSZXR1cm4gdG8gd2FpdGluZ1xyXG4gICAgICAgICAgICAvLyBSZXNldCBib2JiZXIgWSB0byBpbml0aWFsIHdhdGVyIHN1cmZhY2UgbGV2ZWxcclxuICAgICAgICAgICAgdGhpcy5ib2JiZXIueSA9IHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJZICogdGhpcy5jYW52YXMuaGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIERyYXdzIGFsbCBnYW1lIGVsZW1lbnRzIHRvIHRoZSBjYW52YXMgYmFzZWQgb24gdGhlIGN1cnJlbnQgZ2FtZSBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBkcmF3KCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBiYWNrZ3JvdW5kIGZpcnN0IGZvciBhbGwgc3RhdGVzIChleGNlcHQgbG9hZGluZylcclxuICAgICAgICBjb25zdCBiYWNrZ3JvdW5kID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2JhY2tncm91bmQnKTtcclxuICAgICAgICBpZiAoYmFja2dyb3VuZCkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmFja2dyb3VuZCwgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuY3VycmVudFN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU46XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUdXRvcmlhbFNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLldBSVRJTkdfRk9SX0JJVEU6XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlJFRUxJTkdfTUlOSUdBTUU6XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlJFRUxJTkdfVVBfQU5JTUFUSU9OOiAvLyBEcmF3IGdhbWVwbGF5IGR1cmluZyByZWVsaW5nIGFuaW1hdGlvblxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZXBsYXkoKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlJFRUxJTkdfTUlOSUdBTUUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdNaW5pR2FtZVVJKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jYXVnaHRGaXNoTmFtZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd091dGNvbWVNZXNzYWdlKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZXBsYXkoKTsgLy8gRHJhdyBnYW1lIHNjZW5lIGJlaGluZCBnYW1lIG92ZXIgc2NyZWVuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0xvYWRpbmdTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudWkubG9hZGluZ30gJHtNYXRoLnJvdW5kKHRoaXMuYXNzZXRNYW5hZ2VyLmdldExvYWRpbmdQcm9ncmVzcygpICogMTAwKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjUpJzsgLy8gU2VtaS10cmFuc3BhcmVudCBvdmVybGF5XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0OHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS50aXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnByZXNzU3BhY2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUdXRvcmlhbFNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjUpJzsgLy8gU2VtaS10cmFuc3BhcmVudCBvdmVybGF5XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczMHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnXHVDODcwXHVDNzkxXHVCQzk1JywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMTIwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyMHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS50dXRvcmlhbExpbmUxLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA2MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkudHV0b3JpYWxMaW5lMiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMzApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnR1dG9yaWFsTGluZTMsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkudHV0b3JpYWxMaW5lNCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMzApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnByZXNzU3BhY2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZXBsYXkoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3Qgd2F0ZXJMaW5lWSA9IHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJZICogdGhpcy5jYW52YXMuaGVpZ2h0O1xyXG5cclxuICAgICAgICAvLyBEcmF3IGJvYXRcclxuICAgICAgICBjb25zdCBib2F0ID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2JvYXQnKTtcclxuICAgICAgICBpZiAoYm9hdCkge1xyXG4gICAgICAgICAgICBjb25zdCBib2F0WCA9IHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIGJvYXQud2lkdGggLyAyO1xyXG4gICAgICAgICAgICBjb25zdCBib2F0WSA9IHdhdGVyTGluZVkgLSBib2F0LmhlaWdodDsgLy8gQm90dG9tIG9mIGJvYXQgYXQgd2F0ZXIgbGluZVxyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYm9hdCwgYm9hdFgsIGJvYXRZLCBib2F0LndpZHRoLCBib2F0LmhlaWdodCk7XHJcblxyXG4gICAgICAgICAgICAvLyBEcmF3IGZpc2hpbmcgbGluZSAoZnJvbSBib2F0IHRvIGJvYmJlcilcclxuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5iZWdpblBhdGgoKTtcclxuICAgICAgICAgICAgLy8gTGluZSBzdGFydHMgZnJvbSB0aGUgYm9hdCBkaXJlY3RseSBhYm92ZSB0aGUgYm9iYmVyJ3MgY3VycmVudCBYIHBvc2l0aW9uXHJcbiAgICAgICAgICAgIC8vIGFuZCBhdCBhIHNwZWNpZmllZCBZIG9mZnNldCBvbiB0aGUgYm9hdC5cclxuICAgICAgICAgICAgdGhpcy5jdHgubW92ZVRvKHRoaXMuYm9iYmVyLngsIGJvYXRZICsgdGhpcy5jb25maWcuZmlzaGluZ0xpbmVPZmZzZXRZKTtcclxuICAgICAgICAgICAgdGhpcy5jdHgubGluZVRvKHRoaXMuYm9iYmVyLngsIHRoaXMuYm9iYmVyLnkpOyAvLyBMaW5lIGdvZXMgZnJvbSBsaW5lIHN0YXJ0IG9uIGJvYXQgdG8gYm9iYmVyXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5ib2JiZXIuZHJhdyh0aGlzLmN0eCwgdGhpcy5hc3NldE1hbmFnZXIpO1xyXG4gICAgICAgIHRoaXMuZmlzaGVzLmZvckVhY2goZmlzaCA9PiBmaXNoLmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRNYW5hZ2VyKSk7IC8vIEFsbCBmaXNoLCBpbmNsdWRpbmcgY3VycmVudEZpc2hJbk1pbmlnYW1lIGlmIHByZXNlbnRcclxuXHJcbiAgICAgICAgLy8gRHJhdyBVSSBlbGVtZW50cyAoc2NvcmUsIHRpbWVyKVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudWkuc2NvcmVQcmVmaXh9JHt0aGlzLnNjb3JlfWAsIDEwLCAzMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudWkudGltZVJlbWFpbmluZ1ByZWZpeH0ke01hdGguY2VpbCh0aGlzLmdhbWVUaW1lcil9YCwgMTAsIDYwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdNaW5pR2FtZVVJKCk6IHZvaWQge1xyXG4gICAgICAgIC8vIERyYXcgYmFja2dyb3VuZCBvdmVybGF5IGZvciBtaW5pLWdhbWVcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCB0aGlzLmNhbnZhcy5oZWlnaHQgLSAxNTAsIHRoaXMuY2FudmFzLndpZHRoLCAxNTApOyAvLyBCb3R0b20gYmFyIGFyZWFcclxuXHJcbiAgICAgICAgY29uc3QgYmFyWSA9IHRoaXMuY2FudmFzLmhlaWdodCAtIDEwMDtcclxuICAgICAgICBjb25zdCBiYXJIZWlnaHQgPSAzMDtcclxuICAgICAgICBjb25zdCBiYXJXaWR0aCA9IHRoaXMuY2FudmFzLndpZHRoICogMC44O1xyXG4gICAgICAgIGNvbnN0IGJhclggPSAodGhpcy5jYW52YXMud2lkdGggLSBiYXJXaWR0aCkgLyAyO1xyXG5cclxuICAgICAgICAvLyBEcmF3IG1pbmktZ2FtZSBiYXIgYmFja2dyb3VuZFxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjMzMzJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChiYXJYLCBiYXJZLCBiYXJXaWR0aCwgYmFySGVpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyB0YXJnZXQgem9uZVxyXG4gICAgICAgIGNvbnN0IHRhcmdldFpvbmVXaWR0aFB4ID0gYmFyV2lkdGggKiB0aGlzLmNvbmZpZy5taW5pR2FtZVRhcmdldFpvbmVXaWR0aDtcclxuICAgICAgICBjb25zdCB0YXJnZXRab25lWCA9IGJhclggKyAodGhpcy5taW5pR2FtZVRhcmdldFpvbmVDZW50ZXIgKiAoYmFyV2lkdGggLyAyKSkgKyAoYmFyV2lkdGggLyAyKSAtICh0YXJnZXRab25lV2lkdGhQeCAvIDIpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDI1NSwgMCwgMC41KSc7IC8vIEdyZWVuIHRhcmdldCB6b25lXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QodGFyZ2V0Wm9uZVgsIGJhclksIHRhcmdldFpvbmVXaWR0aFB4LCBiYXJIZWlnaHQpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IHBvaW50ZXJcclxuICAgICAgICBjb25zdCBwb2ludGVyWCA9IGJhclggKyAodGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiAqIChiYXJXaWR0aCAvIDIpKSArIChiYXJXaWR0aCAvIDIpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd5ZWxsb3cnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHBvaW50ZXJYIC0gNSwgYmFyWSAtIDEwLCAxMCwgYmFySGVpZ2h0ICsgMjApOyAvLyBQb2ludGVyIHdpZGVyIGFuZCB0YWxsZXJcclxuXHJcbiAgICAgICAgLy8gRHJhdyBzdWNjZXNzIGJhclxyXG4gICAgICAgIGNvbnN0IHN1Y2Nlc3NCYXJXaWR0aCA9ICh0aGlzLm1pbmlHYW1lU3VjY2VzcyAvIHRoaXMuY29uZmlnLm1pbmlHYW1lU3VjY2Vzc1RhcmdldCkgKiBiYXJXaWR0aDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmx1ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYmFyWCwgYmFyWSArIGJhckhlaWdodCArIDEwLCBzdWNjZXNzQmFyV2lkdGgsIDEwKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBmYWlsdXJlIGJhclxyXG4gICAgICAgIGNvbnN0IGZhaWx1cmVCYXJXaWR0aCA9ICh0aGlzLm1pbmlHYW1lRmFpbHVyZSAvIHRoaXMuY29uZmlnLm1pbmlHYW1lRmFpbHVyZVRocmVzaG9sZCkgKiBiYXJXaWR0aDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChiYXJYLCBiYXJZICsgYmFySGVpZ2h0ICsgMjUsIGZhaWx1cmVCYXJXaWR0aCwgMTApO1xyXG5cclxuICAgICAgICAvLyBEaXNwbGF5IGluc3RydWN0aW9ucyBhbmQgdGltZXJcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjhweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkucmVlbEluc3RydWN0aW9uLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIGJhclkgLSAzMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudWkucmVlbFRpbWV9JHtNYXRoLmNlaWwodGhpcy5taW5pR2FtZVRpbWVyKX1zYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCBiYXJZICsgYmFySGVpZ2h0ICsgNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd091dGNvbWVNZXNzYWdlKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmNhdWdodEZpc2hOYW1lKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNiknO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTAsIHRoaXMuY2FudmFzLndpZHRoLCAxMDApO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQwcHggQXJpYWwnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jYXVnaHRGaXNoTmFtZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJzsgLy8gRGFyayBvdmVybGF5XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc2MHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS5nYW1lT3ZlciwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gODApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzM2cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpLnNjb3JlUHJlZml4fSR7dGhpcy5zY29yZX1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnByZXNzU3BhY2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDgwKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gSW5pdGlhbGl6ZSB0aGUgZ2FtZSB3aGVuIHRoZSBET00gaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgaWYgKCFjYW52YXMpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCAnZ2FtZUNhbnZhcycgbm90IGZvdW5kIVwiKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICBpZiAoIWN0eCkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZ2V0IDJEIHJlbmRlcmluZyBjb250ZXh0IGZvciBjYW52YXMhXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBnYW1lID0gbmV3IEdhbWUoY2FudmFzLCBjdHgpO1xyXG4gICAgZ2FtZS5zdGFydCgpO1xyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBK0VBLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUtKLE1BQU0sYUFBYTtBQUFBLEVBQW5CO0FBQ0ksa0JBQXdDLG9CQUFJLElBQUk7QUFDaEQsa0JBQXdDLG9CQUFJLElBQUk7QUFDaEQsdUJBQWM7QUFDZCx1QkFBYztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1kLE1BQU0sV0FBVyxRQUE2QztBQUMxRCxTQUFLLGNBQWMsT0FBTyxPQUFPLFNBQVMsT0FBTyxPQUFPO0FBQ3hELFVBQU0sV0FBNEIsQ0FBQztBQUVuQyxlQUFXLGFBQWEsT0FBTyxRQUFRO0FBQ25DLGVBQVMsS0FBSyxLQUFLLFVBQVUsU0FBUyxDQUFDO0FBQUEsSUFDM0M7QUFDQSxlQUFX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
