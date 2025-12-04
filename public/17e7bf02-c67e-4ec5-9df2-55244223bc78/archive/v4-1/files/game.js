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
  GameState2[GameState2["GAME_OVER"] = 5] = "GAME_OVER";
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
  // The actual fish object currently being reeled
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
          case 5 /* GAME_OVER */:
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
      this.currentState = 5 /* GAME_OVER */;
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
      case 5 /* GAME_OVER */:
        break;
      case 3 /* WAITING_FOR_BITE */:
        this.gameTimer -= deltaTime;
        if (this.gameTimer <= 0) {
          this.currentState = 5 /* GAME_OVER */;
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
        this.fishes.forEach((fish) => fish.update(deltaTime * this.config.fishSwimSpeedMultiplier, this.canvas.width, this.bobber.x));
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
                const index = this.fishes.indexOf(this.fishUnderBobber);
                if (index > -1) {
                  this.fishes.splice(index, 1);
                }
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
        this.fishes.shift();
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
      this.score += this.currentFishInMinigame.data.score;
      this.assetManager.playSound("catch");
      this.caughtFishName = this.config.ui.fishCaught;
    } else {
      this.assetManager.playSound("fail");
      this.caughtFishName = this.config.ui.fishLost;
    }
    this.currentFishInMinigame = void 0;
    this.outcomeDisplayTimer = 2;
    this.currentState = 3 /* WAITING_FOR_BITE */;
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
        this.drawGameplay();
        if (this.currentState === 4 /* REELING_MINIGAME */) {
          this.drawMiniGameUI();
        }
        if (this.caughtFishName !== null) {
          this.drawOutcomeMessage();
        }
        break;
      case 5 /* GAME_OVER */:
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
      this.ctx.moveTo(boatX + this.config.fishingLineOffsetX, boatY + this.config.fishingLineOffsetY);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gVHlwZVNjcmlwdCBpbnRlcmZhY2VzIGZvciBnYW1lIGNvbmZpZ3VyYXRpb24gYW5kIGRhdGFcclxuaW50ZXJmYWNlIEFzc2V0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIHdpZHRoPzogbnVtYmVyO1xyXG4gICAgaGVpZ2h0PzogbnVtYmVyO1xyXG4gICAgZHVyYXRpb25fc2Vjb25kcz86IG51bWJlcjtcclxuICAgIHZvbHVtZT86IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEltYWdlRGF0YUNvbmZpZyBleHRlbmRzIEFzc2V0Q29uZmlnIHtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFNvdW5kRGF0YUNvbmZpZyBleHRlbmRzIEFzc2V0Q29uZmlnIHtcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRmlzaERhdGEge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgc2NvcmU6IG51bWJlcjtcclxuICAgIGltYWdlOiBzdHJpbmc7IC8vIEFzc2V0IG5hbWUgZm9yIHRoZSBmaXNoIGltYWdlXHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgbWluaUdhbWVEaWZmaWN1bHR5OiBudW1iZXI7IC8vIEZhY3RvciBmb3IgbWluaS1nYW1lIGNoYWxsZW5nZVxyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBnYW1lRHVyYXRpb25TZWNvbmRzOiBudW1iZXI7IC8vIFRvdGFsIGdhbWUgdGltZVxyXG4gICAgaW5pdGlhbEJvYmJlclg6IG51bWJlcjsgLy8gUmF0aW8gb2YgY2FudmFzIHdpZHRoXHJcbiAgICBpbml0aWFsQm9iYmVyWTogbnVtYmVyOyAvLyBSYXRpbyBvZiBjYW52YXMgaGVpZ2h0ICh3YXRlciBzdXJmYWNlKVxyXG4gICAgYm9iYmVyTW92ZVNwZWVkOiBudW1iZXI7IC8vIFNwZWVkIGZvciBib2JiZXIgdmVydGljYWwgbW92ZW1lbnRcclxuICAgIG1pbkJvYmJlcllSYXRpbzogbnVtYmVyOyAvLyBNaW4gWSByYXRpbyBmb3IgYm9iYmVyIHZlcnRpY2FsIG1vdmVtZW50XHJcbiAgICBtYXhCb2JiZXJZUmF0aW86IG51bWJlcjsgLy8gTWF4IFkgcmF0aW8gZm9yIGJvYmJlciB2ZXJ0aWNhbCBtb3ZlbWVudFxyXG4gICAgZmlzaGluZ0xpbmVPZmZzZXRYOiBudW1iZXI7IC8vIFggb2Zmc2V0IGZvciBmaXNoaW5nIGxpbmUgc3RhcnQgb24gYm9hdFxyXG4gICAgZmlzaGluZ0xpbmVPZmZzZXRZOiBudW1iZXI7IC8vIFkgb2Zmc2V0IGZvciBmaXNoaW5nIGxpbmUgc3RhcnQgb24gYm9hdFxyXG4gICAgZmlzaFNwYXduSW50ZXJ2YWxTZWNvbmRzOiBudW1iZXI7IC8vIEhvdyBvZnRlbiBuZXcgZmlzaCBtaWdodCBhcHBlYXJcclxuICAgIGZpc2hTd2ltU3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7IC8vIE11bHRpcGxpZXIgZm9yIGZpc2ggbW92ZW1lbnQgc3BlZWRcclxuICAgIG1heEZpc2hPblNjcmVlbjogbnVtYmVyOyAvLyBNYXhpbXVtIG51bWJlciBvZiBmaXNoIHZpc2libGVcclxuICAgIGJvYmJlcldpZHRoOiBudW1iZXI7XHJcbiAgICBib2JiZXJIZWlnaHQ6IG51bWJlcjtcclxuICAgIGZpc2hEZWZhdWx0V2lkdGg6IG51bWJlcjtcclxuICAgIGZpc2hEZWZhdWx0SGVpZ2h0OiBudW1iZXI7XHJcbiAgICBiaXRlVHJpZ2dlclJhZGl1czogbnVtYmVyOyAvLyBEaXN0YW5jZSBmb3IgYSBmaXNoIHRvIGJlIFwibmVhclwiIHRoZSBib2JiZXJcclxuICAgIGJpdGVIb2xkRHVyYXRpb25TZWNvbmRzOiBudW1iZXI7IC8vIEhvdyBsb25nIHRoZSBob29rIG11c3QgYmUgbmVhciBhIGZpc2ggZm9yIGEgYml0ZVxyXG4gICAgbWluaUdhbWVEdXJhdGlvblNlY29uZHM6IG51bWJlcjsgLy8gRHVyYXRpb24gb2YgdGhlIHJlZWxpbmcgbWluaS1nYW1lXHJcbiAgICBtaW5pR2FtZVN1Y2Nlc3NUYXJnZXQ6IG51bWJlcjsgLy8gSG93IG11Y2ggJ3N1Y2Nlc3MnIGlzIG5lZWRlZCB0byBjYXRjaCBhIGZpc2hcclxuICAgIG1pbmlHYW1lRmFpbHVyZVRocmVzaG9sZDogbnVtYmVyOyAvLyBIb3cgbXVjaCAnZmFpbHVyZScgbGVhZHMgdG8gbG9zaW5nIGEgZmlzaFxyXG4gICAgbWluaUdhbWVQcmVzc0VmZmVjdDogbnVtYmVyOyAvLyBIb3cgbXVjaCBhIFNQQUNFIHByZXNzIGNvbnRyaWJ1dGVzIHRvIHN1Y2Nlc3NcclxuICAgIG1pbmlHYW1lRGVjYXlSYXRlOiBudW1iZXI7IC8vIEhvdyBxdWlja2x5IHN1Y2Nlc3MgZGVjYXlzIG92ZXIgdGltZVxyXG4gICAgbWluaUdhbWVUYXJnZXRab25lV2lkdGg6IG51bWJlcjsgLy8gV2lkdGggb2YgdGhlIHRhcmdldCB6b25lIGluIHRoZSBtaW5pLWdhbWUgYmFyICgwIHRvIDEpXHJcbiAgICBtaW5pR2FtZUJhc2VQb2ludGVyU3BlZWQ6IG51bWJlcjsgLy8gQmFzZSBzcGVlZCBvZiB0aGUgcG9pbnRlciBpbiB0aGUgbWluaS1nYW1lXHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEltYWdlRGF0YUNvbmZpZ1tdO1xyXG4gICAgICAgIHNvdW5kczogU291bmREYXRhQ29uZmlnW107XHJcbiAgICB9O1xyXG4gICAgZmlzaGVzOiBGaXNoRGF0YVtdO1xyXG4gICAgdWk6IHtcclxuICAgICAgICB0aXRsZTogc3RyaW5nO1xyXG4gICAgICAgIHByZXNzU3BhY2U6IHN0cmluZztcclxuICAgICAgICB0dXRvcmlhbExpbmUxOiBzdHJpbmc7XHJcbiAgICAgICAgdHV0b3JpYWxMaW5lMjogc3RyaW5nO1xyXG4gICAgICAgIHR1dG9yaWFsTGluZTM6IHN0cmluZztcclxuICAgICAgICB0dXRvcmlhbExpbmU0OiBzdHJpbmc7XHJcbiAgICAgICAgZmlzaENhdWdodDogc3RyaW5nO1xyXG4gICAgICAgIGZpc2hMb3N0OiBzdHJpbmc7XHJcbiAgICAgICAgc2NvcmVQcmVmaXg6IHN0cmluZztcclxuICAgICAgICB0aW1lUmVtYWluaW5nUHJlZml4OiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZU92ZXI6IHN0cmluZztcclxuICAgICAgICBsb2FkaW5nOiBzdHJpbmc7XHJcbiAgICAgICAgcmVlbEluc3RydWN0aW9uOiBzdHJpbmc7XHJcbiAgICAgICAgcmVlbFRpbWU6IHN0cmluZztcclxuICAgIH07XHJcbn1cclxuXHJcbi8vIEdsb2JhbCBjYW52YXMgYW5kIGNvbnRleHQgdmFyaWFibGVzXHJcbmxldCBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG5sZXQgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbmxldCBnYW1lOiBHYW1lO1xyXG5cclxuLyoqXHJcbiAqIEFzc2V0TWFuYWdlciBjbGFzcyB0byBoYW5kbGUgbG9hZGluZyBhbmQgYWNjZXNzaW5nIGdhbWUgYXNzZXRzIChpbWFnZXMgYW5kIHNvdW5kcykuXHJcbiAqL1xyXG5jbGFzcyBBc3NldE1hbmFnZXIge1xyXG4gICAgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBsb2FkZWRDb3VudCA9IDA7XHJcbiAgICB0b3RhbEFzc2V0cyA9IDA7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMb2FkcyBhbGwgYXNzZXRzIGRlZmluZWQgaW4gdGhlIGdhbWUgY29uZmlndXJhdGlvbi5cclxuICAgICAqIEBwYXJhbSBjb25maWcgLSBUaGUgYXNzZXQgY29uZmlndXJhdGlvbiBmcm9tIGRhdGEuanNvbi5cclxuICAgICAqL1xyXG4gICAgYXN5bmMgbG9hZEFzc2V0cyhjb25maWc6IEdhbWVDb25maWdbJ2Fzc2V0cyddKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGNvbmZpZy5pbWFnZXMubGVuZ3RoICsgY29uZmlnLnNvdW5kcy5sZW5ndGg7XHJcbiAgICAgICAgY29uc3QgcHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGltZ0NvbmZpZyBvZiBjb25maWcuaW1hZ2VzKSB7XHJcbiAgICAgICAgICAgIHByb21pc2VzLnB1c2godGhpcy5sb2FkSW1hZ2UoaW1nQ29uZmlnKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZvciAoY29uc3Qgc291bmRDb25maWcgb2YgY29uZmlnLnNvdW5kcykge1xyXG4gICAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMubG9hZFNvdW5kKHNvdW5kQ29uZmlnKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UoY29uZmlnOiBJbWFnZURhdGFDb25maWcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGNvbmZpZy5wYXRoO1xyXG4gICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pbWFnZXMuc2V0KGNvbmZpZy5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRDb3VudCsrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2NvbmZpZy5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoY29uZmlnOiBTb3VuZERhdGFDb25maWcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oY29uZmlnLnBhdGgpO1xyXG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBjb25maWcudm9sdW1lO1xyXG4gICAgICAgICAgICBhdWRpby5wcmVsb2FkID0gJ2F1dG8nO1xyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGNvbmZpZy5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke2NvbmZpZy5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRDb3VudCsrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIGdhbWVcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSwgdm9sdW1lPzogbnVtYmVyKTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDsgLy8gQ2xvbmUgdG8gYWxsb3cgbXVsdGlwbGUgY29uY3VycmVudCBwbGF5c1xyXG4gICAgICAgICAgICBjbG9uZS5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgY2xvbmUudm9sdW1lID0gdm9sdW1lICE9PSB1bmRlZmluZWQgPyB2b2x1bWUgOiBhdWRpby52b2x1bWU7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgQXVkaW8gcGxheSBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgICAgICByZXR1cm4gY2xvbmU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcblxyXG4gICAgc3RvcFNvdW5kKGF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50KSB7XHJcbiAgICAgICAgYXVkaW8ucGF1c2UoKTtcclxuICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9hZGluZ1Byb2dyZXNzKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG90YWxBc3NldHMgPiAwID8gdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxBc3NldHMgOiAwO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogRW51bSBmb3IgbWFuYWdpbmcgZGlmZmVyZW50IHN0YXRlcyBvZiB0aGUgZ2FtZS5cclxuICovXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcsXHJcbiAgICBUSVRMRV9TQ1JFRU4sXHJcbiAgICBUVVRPUklBTF9TQ1JFRU4sXHJcbiAgICBXQUlUSU5HX0ZPUl9CSVRFLFxyXG4gICAgUkVFTElOR19NSU5JR0FNRSxcclxuICAgIEdBTUVfT1ZFUixcclxufVxyXG5cclxuLyoqXHJcbiAqIEJvYmJlciBnYW1lIG9iamVjdC5cclxuICovXHJcbmNsYXNzIEJvYmJlciB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBpbWFnZU5hbWU6IHN0cmluZztcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlTmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy54ID0geDtcclxuICAgICAgICB0aGlzLnkgPSB5O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLmltYWdlTmFtZSA9IGltYWdlTmFtZTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlcikge1xyXG4gICAgICAgIGNvbnN0IGltZyA9IGFzc2V0TWFuYWdlci5nZXRJbWFnZSh0aGlzLmltYWdlTmFtZSk7XHJcbiAgICAgICAgaWYgKGltZykge1xyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgdGhpcy54IC0gdGhpcy53aWR0aCAvIDIsIHRoaXMueSAtIHRoaXMuaGVpZ2h0IC8gMiwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEZpc2ggZ2FtZSBvYmplY3QuXHJcbiAqL1xyXG5jbGFzcyBGaXNoIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhdGE6IEZpc2hEYXRhOyAvLyBSZWZlcmVuY2UgdG8gaXRzIGRhdGEgY29uZmlnXHJcbiAgICBkaXJlY3Rpb246IG51bWJlcjsgLy8gLTEgZm9yIGxlZnQsIDEgZm9yIHJpZ2h0XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBkYXRhOiBGaXNoRGF0YSkge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbWFnZU5hbWUgPSBkYXRhLmltYWdlO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBkYXRhLnNwZWVkO1xyXG4gICAgICAgIHRoaXMuZGF0YSA9IGRhdGE7XHJcbiAgICAgICAgdGhpcy5kaXJlY3Rpb24gPSBNYXRoLnJhbmRvbSgpIDwgMC41ID8gLTEgOiAxOyAvLyBTdGFydCBtb3ZpbmcgcmFuZG9tbHlcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGNhbnZhc1dpZHRoOiBudW1iZXIsIGJvYmJlclg6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMueCArPSB0aGlzLnNwZWVkICogdGhpcy5kaXJlY3Rpb24gKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgIC8vIFNpbXBsZSBib3VuZGFyeSBjaGVjayBhbmQgY2hhbmdlIGRpcmVjdGlvblxyXG4gICAgICAgIGlmICh0aGlzLnggPCAwIHx8IHRoaXMueCA+IGNhbnZhc1dpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZGlyZWN0aW9uICo9IC0xO1xyXG4gICAgICAgICAgICB0aGlzLnggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihjYW52YXNXaWR0aCwgdGhpcy54KSk7IC8vIENsYW1wIHBvc2l0aW9uXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBZGQgYSBzbGlnaHQgcHVsbCB0b3dhcmRzIHRoZSBib2JiZXIgd2hlbiBjbG9zZVxyXG4gICAgICAgIC8vIFRoaXMgbWFrZXMgZmlzaCBtb3JlIGxpa2VseSB0byBiZSBuZWFyIHRoZSBib2JiZXIgaWYgcGxheWVyIGhvbGRzIGl0IHN0aWxsXHJcbiAgICAgICAgY29uc3QgZGlzdGFuY2VUb0JvYmJlciA9IE1hdGguYWJzKHRoaXMueCAtIGJvYmJlclgpO1xyXG4gICAgICAgIGlmIChkaXN0YW5jZVRvQm9iYmVyIDwgMjAwKSB7IC8vIElmIHdpdGhpbiAyMDBweCBvZiBib2JiZXJcclxuICAgICAgICAgICAgY29uc3QgcHVsbERpcmVjdGlvbiA9IChib2JiZXJYIC0gdGhpcy54ID4gMCkgPyAxIDogLTE7XHJcbiAgICAgICAgICAgIHRoaXMueCArPSBwdWxsRGlyZWN0aW9uICogdGhpcy5zcGVlZCAqIGRlbHRhVGltZSAqICgxIC0gZGlzdGFuY2VUb0JvYmJlciAvIDIwMCkgKiAwLjU7IC8vIFdlYWtlciBwdWxsXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyKSB7XHJcbiAgICAgICAgY29uc3QgaW1nID0gYXNzZXRNYW5hZ2VyLmdldEltYWdlKHRoaXMuaW1hZ2VOYW1lKTtcclxuICAgICAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgICAgIGN0eC5zYXZlKCk7XHJcbiAgICAgICAgICAgIGN0eC50cmFuc2xhdGUodGhpcy54LCB0aGlzLnkpO1xyXG4gICAgICAgICAgICAvLyBGbGlwIGltYWdlIGlmIG1vdmluZyBsZWZ0XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmRpcmVjdGlvbiA9PT0gLTEpIHtcclxuICAgICAgICAgICAgICAgIGN0eC5zY2FsZSgtMSwgMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIC10aGlzLndpZHRoIC8gMiwgLXRoaXMuaGVpZ2h0IC8gMiwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICBjdHgucmVzdG9yZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE1haW4gR2FtZSBjbGFzcyByZXNwb25zaWJsZSBmb3IgbWFuYWdpbmcgZ2FtZSBzdGF0ZSwgbG9naWMsIGFuZCByZW5kZXJpbmcuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZztcclxuICAgIHByaXZhdGUgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIgPSBuZXcgQXNzZXRNYW5hZ2VyKCk7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBnYW1lVGltZXI6IG51bWJlciA9IDA7IC8vIEluIHNlY29uZHNcclxuICAgIHByaXZhdGUgZmlzaFNwYXduVGltZXI6IG51bWJlciA9IDA7IC8vIEluIHNlY29uZHNcclxuICAgIHByaXZhdGUgZmlzaGVzOiBGaXNoW10gPSBbXTtcclxuICAgIHByaXZhdGUgYm9iYmVyITogQm9iYmVyO1xyXG4gICAgcHJpdmF0ZSBrZXlzUHJlc3NlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIGNhdWdodEZpc2hOYW1lOiBzdHJpbmcgfCBudWxsID0gbnVsbDsgLy8gRm9yIGRpc3BsYXlpbmcgY2F0Y2ggb3V0Y29tZVxyXG4gICAgcHJpdmF0ZSBvdXRjb21lRGlzcGxheVRpbWVyOiBudW1iZXIgPSAwOyAvLyBIb3cgbG9uZyB0byBkaXNwbGF5IG91dGNvbWVcclxuXHJcbiAgICAvLyBCb2JiZXIgbW92ZW1lbnRcclxuICAgIHByaXZhdGUgYm9iYmVyTW92ZURpcmVjdGlvbjogbnVtYmVyID0gMDsgLy8gMDogbm9uZSwgLTE6IHVwLCAxOiBkb3duXHJcblxyXG4gICAgLy8gQml0ZSBkZXRlY3Rpb25cclxuICAgIHByaXZhdGUgZmlzaFVuZGVyQm9iYmVyOiBGaXNoIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGZpc2hVbmRlckJvYmJlclRpbWVyOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIC8vIE1pbmktZ2FtZSB2YXJpYWJsZXNcclxuICAgIHByaXZhdGUgbWluaUdhbWVTdWNjZXNzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBtaW5pR2FtZUZhaWx1cmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lUG9pbnRlclBvc2l0aW9uOiBudW1iZXIgPSAwOyAvLyAtMSB0byAxIHJlcHJlc2VudGluZyBsZWZ0IHRvIHJpZ2h0XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlcjogbnVtYmVyID0gMDsgLy8gLTEgdG8gMVxyXG4gICAgcHJpdmF0ZSBjdXJyZW50RmlzaEluTWluaWdhbWU6IEZpc2ggfCB1bmRlZmluZWQ7IC8vIFRoZSBhY3R1YWwgZmlzaCBvYmplY3QgY3VycmVudGx5IGJlaW5nIHJlZWxlZFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCwgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIC8vIERlZmF1bHQgY2FudmFzIHNpemUsIHdpbGwgYmUgb3ZlcndyaXR0ZW4gYnkgY29uZmlnXHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSA4MDA7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gNjAwO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5oYW5kbGVLZXlEb3duKTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUtleVVwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN0YXJ0cyB0aGUgZ2FtZSBieSBsb2FkaW5nIGNvbmZpZ3VyYXRpb24gYW5kIGFzc2V0cywgdGhlbiBpbml0aWF0aW5nIHRoZSBnYW1lIGxvb3AuXHJcbiAgICAgKi9cclxuICAgIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZygpO1xyXG4gICAgICAgIHRoaXMuaW5pdEdhbWUoKTsgLy8gSW5pdGlhbGl6ZSBnYW1lIGNvbXBvbmVudHMgYWZ0ZXIgY29uZmlnIGlzIGxvYWRlZFxyXG4gICAgICAgIHRoaXMubG9vcCgwKTsgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgR2FtZUNvbmZpZztcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TWFuYWdlci5sb2FkQXNzZXRzKHRoaXMuY29uZmlnLmFzc2V0cyk7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLlRJVExFX1NDUkVFTjsgLy8gVHJhbnNpdGlvbiB0byB0aXRsZSBzY3JlZW4gYWZ0ZXIgbG9hZGluZ1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24gb3IgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIGEgZmFpbHVyZSBzdGF0ZSBpZiBjcml0aWNhbCBsb2FkaW5nIGZhaWxzXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJbml0aWFsaXplcyBvciByZXNldHMgZ2FtZS1zcGVjaWZpYyB2YXJpYWJsZXMgZm9yIGEgbmV3IGdhbWUgc2Vzc2lvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBpbml0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmdhbWVUaW1lciA9IHRoaXMuY29uZmlnLmdhbWVEdXJhdGlvblNlY29uZHM7XHJcbiAgICAgICAgdGhpcy5maXNoU3Bhd25UaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5maXNoZXMgPSBbXTtcclxuICAgICAgICB0aGlzLmJvYmJlciA9IG5ldyBCb2JiZXIoXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJYICogdGhpcy5jYW52YXMud2lkdGgsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJZICogdGhpcy5jYW52YXMuaGVpZ2h0LCAvLyBCb2JiZXIgc3RhcnRzIGF0IHdhdGVyIHN1cmZhY2VcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuYm9iYmVyV2lkdGgsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmJvYmJlckhlaWdodCxcclxuICAgICAgICAgICAgJ2JvYmJlcidcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBTdG9wIGFueSBwcmV2aW91cyBCR00gYW5kIHN0YXJ0IG5ldyBvbmVcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5zdG9wU291bmQodGhpcy5iZ21BdWRpbyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYmdtQXVkaW8gPSB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2JnbScsIHRydWUsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpPy52b2x1bWUpO1xyXG5cclxuICAgICAgICAvLyBSZXNldCBtaW5pLWdhbWUgc3BlY2lmaWMgdmFyaWFibGVzXHJcbiAgICAgICAgdGhpcy5taW5pR2FtZVN1Y2Nlc3MgPSAwO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVGYWlsdXJlID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lVGltZXIgPSAwO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPSAwO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVUYXJnZXRab25lQ2VudGVyID0gMDtcclxuICAgICAgICB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICB0aGlzLmNhdWdodEZpc2hOYW1lID0gbnVsbDtcclxuICAgICAgICB0aGlzLm91dGNvbWVEaXNwbGF5VGltZXIgPSAwO1xyXG5cclxuICAgICAgICAvLyBSZXNldCBib2JiZXIgYW5kIGJpdGUgZGV0ZWN0aW9uIHZhcmlhYmxlc1xyXG4gICAgICAgIHRoaXMuYm9iYmVyTW92ZURpcmVjdGlvbiA9IDA7XHJcbiAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXIgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuZmlzaFVuZGVyQm9iYmVyVGltZXIgPSAwO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBrZXlib2FyZCBrZXkgZG93biBldmVudHMuXHJcbiAgICAgKiBAcGFyYW0gZXZlbnQgLSBUaGUgS2V5Ym9hcmRFdmVudCBvYmplY3QuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93biA9IChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQgPT4ge1xyXG4gICAgICAgIHRoaXMua2V5c1ByZXNzZWQuYWRkKGV2ZW50LmNvZGUpO1xyXG5cclxuICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ1NwYWNlJykge1xyXG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyBQcmV2ZW50IHBhZ2Ugc2Nyb2xsaW5nIHdpdGggc3BhY2ViYXJcclxuXHJcbiAgICAgICAgICAgIHN3aXRjaCAodGhpcy5jdXJyZW50U3RhdGUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU47XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdzZWxlY3QnKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRVVE9SSUFMX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5SRUVMSU5HX01JTklHQU1FOlxyXG4gICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgYXBwbHkgZWZmZWN0IGlmIHdpdGhpbiB0YXJnZXQgem9uZSBmb3IgbW9yZSBjaGFsbGVuZ2VcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab25lU3RhcnQgPSB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciAtIHRoaXMuY29uZmlnLm1pbmlHYW1lVGFyZ2V0Wm9uZVdpZHRoIC8gMjtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab25lRW5kID0gdGhpcy5taW5pR2FtZVRhcmdldFpvbmVDZW50ZXIgKyB0aGlzLmNvbmZpZy5taW5pR2FtZVRhcmdldFpvbmVXaWR0aCAvIDI7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPj0gdGFyZ2V0Wm9uZVN0YXJ0ICYmIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPD0gdGFyZ2V0Wm9uZUVuZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm1pbmlHYW1lU3VjY2VzcyArPSB0aGlzLmNvbmZpZy5taW5pR2FtZVByZXNzRWZmZWN0O1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3JlZWwnLCBmYWxzZSwgMC43KTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7IC8vIFJlc2V0IGdhbWUgc3RhdGVcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU47IC8vIEdvIGJhY2sgdG8gdGl0bGUgZm9yIHJlc3RhcnRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NlbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLldBSVRJTkdfRk9SX0JJVEUpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdBcnJvd1VwJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5ib2JiZXJNb3ZlRGlyZWN0aW9uID0gLTE7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQuY29kZSA9PT0gJ0Fycm93RG93bicpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9iYmVyTW92ZURpcmVjdGlvbiA9IDE7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIGtleWJvYXJkIGtleSB1cCBldmVudHMuXHJcbiAgICAgKiBAcGFyYW0gZXZlbnQgLSBUaGUgS2V5Ym9hcmRFdmVudCBvYmplY3QuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAgPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkID0+IHtcclxuICAgICAgICB0aGlzLmtleXNQcmVzc2VkLmRlbGV0ZShldmVudC5jb2RlKTtcclxuICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ0Fycm93VXAnIHx8IGV2ZW50LmNvZGUgPT09ICdBcnJvd0Rvd24nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYm9iYmVyTW92ZURpcmVjdGlvbiA9IDA7IC8vIFN0b3AgYm9iYmVyIG1vdmVtZW50XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgYnkgcmVxdWVzdEFuaW1hdGlvbkZyYW1lLlxyXG4gICAgICogQHBhcmFtIGN1cnJlbnRUaW1lIC0gVGhlIGN1cnJlbnQgdGltZSBwcm92aWRlZCBieSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgbG9vcCA9IChjdXJyZW50VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCk6IHZvaWQgPT4ge1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ29udmVydCB0byBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMuZHJhdygpO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5sb29wKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgZ2FtZSBsb2dpYyBiYXNlZCBvbiB0aGUgY3VycmVudCBzdGF0ZSBhbmQgdGltZSBlbGFwc2VkLlxyXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSAtIFRoZSB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgZnJhbWUsIGluIHNlY29uZHMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuTE9BRElORykgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBBdHRlbXB0IHRvIHBsYXkgQkdNIGlmIGl0IHBhdXNlZCwgdHlwaWNhbGx5IGR1ZSB0byBicm93c2VyIGF1dG9wbGF5IHBvbGljaWVzXHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8gJiYgdGhpcy5iZ21BdWRpby5wYXVzZWQgJiYgdGhpcy5jdXJyZW50U3RhdGUgIT09IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU4gJiYgdGhpcy5jdXJyZW50U3RhdGUgIT09IEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU4pIHtcclxuICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHJlc3VtZSBCR006XCIsIGUpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5jdXJyZW50U3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOOlxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU46XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIC8vIE5vIHNwZWNpZmljIHVwZGF0ZSBsb2dpYywganVzdCB3YWl0aW5nIGZvciB1c2VyIGlucHV0IHRvIHRyYW5zaXRpb25cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZ2FtZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHRoaXMuYXNzZXRNYW5hZ2VyLnN0b3BTb3VuZCh0aGlzLmJnbUF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2dhbWVPdmVyU291bmQnKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgYm9iYmVyIHBvc2l0aW9uIGJhc2VkIG9uIGlucHV0XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5ib2JiZXJNb3ZlRGlyZWN0aW9uICE9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib2JiZXIueSArPSB0aGlzLmJvYmJlck1vdmVEaXJlY3Rpb24gKiB0aGlzLmNvbmZpZy5ib2JiZXJNb3ZlU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ib2JiZXIueSA9IE1hdGgubWF4KFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5taW5Cb2JiZXJZUmF0aW8gKiB0aGlzLmNhbnZhcy5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIE1hdGgubWluKHRoaXMuY29uZmlnLm1heEJvYmJlcllSYXRpbyAqIHRoaXMuY2FudmFzLmhlaWdodCwgdGhpcy5ib2JiZXIueSlcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBmaXNoIG1vdmVtZW50XHJcbiAgICAgICAgICAgICAgICB0aGlzLmZpc2hlcy5mb3JFYWNoKGZpc2ggPT4gZmlzaC51cGRhdGUoZGVsdGFUaW1lICogdGhpcy5jb25maWcuZmlzaFN3aW1TcGVlZE11bHRpcGxpZXIsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmJvYmJlci54KSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gU3Bhd24gZmlzaFxyXG4gICAgICAgICAgICAgICAgdGhpcy5maXNoU3Bhd25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5maXNoU3Bhd25UaW1lciA+PSB0aGlzLmNvbmZpZy5maXNoU3Bhd25JbnRlcnZhbFNlY29uZHMpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hTcGF3blRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRmlzaCgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIE1hbmFnZSBvdXRjb21lIGRpc3BsYXlcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNhdWdodEZpc2hOYW1lICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vdXRjb21lRGlzcGxheVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5vdXRjb21lRGlzcGxheVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jYXVnaHRGaXNoTmFtZSA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGZvciBiaXRlIG9ubHkgaWYgbm8gb3V0Y29tZSBpcyBjdXJyZW50bHkgZGlzcGxheWVkXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jYXVnaHRGaXNoTmFtZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBjbG9zZXN0RmlzaDogRmlzaCB8IG51bGwgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIGxldCBtaW5EaXN0YW5jZVNxID0gSW5maW5pdHk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZmlzaCBvZiB0aGlzLmZpc2hlcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkeCA9IGZpc2gueCAtIHRoaXMuYm9iYmVyLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGR5ID0gZmlzaC55IC0gdGhpcy5ib2JiZXIueTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGlzdGFuY2VTcSA9IGR4ICogZHggKyBkeSAqIGR5O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgd2l0aGluIGJpdGVUcmlnZ2VyUmFkaXVzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZVNxIDw9IHRoaXMuY29uZmlnLmJpdGVUcmlnZ2VyUmFkaXVzICogdGhpcy5jb25maWcuYml0ZVRyaWdnZXJSYWRpdXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZVNxIDwgbWluRGlzdGFuY2VTcSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1pbkRpc3RhbmNlU3EgPSBkaXN0YW5jZVNxO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsb3Nlc3RGaXNoID0gZmlzaDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNsb3Nlc3RGaXNoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmZpc2hVbmRlckJvYmJlciA9PT0gY2xvc2VzdEZpc2gpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlzaFVuZGVyQm9iYmVyVGltZXIgKz0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZmlzaFVuZGVyQm9iYmVyVGltZXIgPj0gdGhpcy5jb25maWcuYml0ZUhvbGREdXJhdGlvblNlY29uZHMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5SRUVMSU5HX01JTklHQU1FO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnYml0ZScpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW5pdE1pbmlHYW1lKHRoaXMuZmlzaFVuZGVyQm9iYmVyKTsgLy8gUGFzcyB0aGUgYWN0dWFsIEZpc2ggb2JqZWN0XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgZmlzaCBmcm9tIHRoZSBzY3JlZW4gaW5zdGFudGx5IHVwb24gYml0ZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5maXNoZXMuaW5kZXhPZih0aGlzLmZpc2hVbmRlckJvYmJlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluZGV4ID4gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoZXMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXIgPSBudWxsOyAvLyBSZXNldCBmb3IgbmV4dCBiaXRlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXJUaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBOZXcgZmlzaCBkZXRlY3RlZCBvciBzd2l0Y2hlZCB0byBhIGRpZmZlcmVudCBjbG9zZXN0IGZpc2hcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZmlzaFVuZGVyQm9iYmVyID0gY2xvc2VzdEZpc2g7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hVbmRlckJvYmJlclRpbWVyID0gMDsgLy8gU3RhcnQgdGltZXIgZm9yIHRoaXMgbmV3IGZpc2hcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5vIGZpc2ggbmVhciBib2JiZXJcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5maXNoVW5kZXJCb2JiZXIgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hVbmRlckJvYmJlclRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUkVFTElOR19NSU5JR0FNRTpcclxuICAgICAgICAgICAgICAgIHRoaXMubWluaUdhbWVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5taW5pR2FtZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc29sdmVNaW5pR2FtZSgpOyAvLyBUaW1lJ3MgdXAsIHJlc29sdmUgYmFzZWQgb24gc3VjY2Vzcy9mYWlsdXJlXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRGVjYXkgc3VjY2VzcyBvdmVyIHRpbWVcclxuICAgICAgICAgICAgICAgIHRoaXMubWluaUdhbWVTdWNjZXNzID0gTWF0aC5tYXgoMCwgdGhpcy5taW5pR2FtZVN1Y2Nlc3MgLSB0aGlzLmNvbmZpZy5taW5pR2FtZURlY2F5UmF0ZSAqIGRlbHRhVGltZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIHBvaW50ZXIgcG9zaXRpb24gKG1vdmVzIGxlZnQvcmlnaHQpXHJcbiAgICAgICAgICAgICAgICB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uICs9IHRoaXMuY29uZmlnLm1pbmlHYW1lQmFzZVBvaW50ZXJTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uID4gMSB8fCB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uIDwgLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5taW5pR2FtZUJhc2VQb2ludGVyU3BlZWQgKj0gLTE7IC8vIFJldmVyc2UgZGlyZWN0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiA9IE1hdGgubWF4KC0xLCBNYXRoLm1pbigxLCB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uKSk7IC8vIENsYW1wXHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcG9pbnRlciBpcyBvdXRzaWRlIHRhcmdldCB6b25lXHJcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab25lU3RhcnQgPSB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciAtIHRoaXMuY29uZmlnLm1pbmlHYW1lVGFyZ2V0Wm9uZVdpZHRoIC8gMjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFpvbmVFbmQgPSB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciArIHRoaXMuY29uZmlnLm1pbmlHYW1lVGFyZ2V0Wm9uZVdpZHRoIC8gMjtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoISh0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uID49IHRhcmdldFpvbmVTdGFydCAmJiB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uIDw9IHRhcmdldFpvbmVFbmQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5taW5pR2FtZUZhaWx1cmUgKz0gZGVsdGFUaW1lOyAvLyBGYWlsdXJlIGluY3JlYXNlcyBvdmVyIHRpbWUgb3V0c2lkZSB6b25lXHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMubWluaUdhbWVGYWlsdXJlID49IHRoaXMuY29uZmlnLm1pbmlHYW1lRmFpbHVyZVRocmVzaG9sZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzb2x2ZU1pbmlHYW1lKGZhbHNlKTsgLy8gRm9yY2VkIGZhaWwgaWYgZmFpbHVyZSB0aHJlc2hvbGQgcmVhY2hlZFxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLm1pbmlHYW1lU3VjY2VzcyA+PSB0aGlzLmNvbmZpZy5taW5pR2FtZVN1Y2Nlc3NUYXJnZXQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc29sdmVNaW5pR2FtZSh0cnVlKTsgLy8gRm9yY2VkIHN1Y2Nlc3MgaWYgc3VjY2VzcyB0YXJnZXQgcmVhY2hlZFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3Bhd25zIGEgbmV3IGZpc2ggYXQgYSByYW5kb20gcG9zaXRpb24gYmVsb3cgdGhlIHdhdGVyIGxpbmUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3Bhd25GaXNoKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGZpc2hDb25maWcgPSB0aGlzLmNvbmZpZy5maXNoZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5jb25maWcuZmlzaGVzLmxlbmd0aCldO1xyXG4gICAgICAgIGNvbnN0IHNwYXduWCA9IE1hdGgucmFuZG9tKCkgKiB0aGlzLmNhbnZhcy53aWR0aDtcclxuXHJcbiAgICAgICAgY29uc3Qgd2F0ZXJMaW5lWSA9IHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJZICogdGhpcy5jYW52YXMuaGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IG1pblNwYXduWSA9IHdhdGVyTGluZVkgKyB0aGlzLmNvbmZpZy5maXNoRGVmYXVsdEhlaWdodCAvIDIgKyAxMDsgLy8gMTBweCBidWZmZXIgYmVsb3cgd2F0ZXIgc3VyZmFjZVxyXG4gICAgICAgIGNvbnN0IG1heFNwYXduWSA9IHRoaXMuY2FudmFzLmhlaWdodCAtIHRoaXMuY29uZmlnLmZpc2hEZWZhdWx0SGVpZ2h0IC8gMiAtIDEwOyAvLyAxMHB4IGJ1ZmZlciBmcm9tIGJvdHRvbSBlZGdlXHJcblxyXG4gICAgICAgIC8vIEVuc3VyZSB0aGVyZSdzIGEgdmFsaWQgcmFuZ2UgZm9yIHNwYXduaW5nXHJcbiAgICAgICAgaWYgKG1pblNwYXduWSA8IG1heFNwYXduWSkge1xyXG4gICAgICAgICAgICBjb25zdCBzcGF3blkgPSBtaW5TcGF3blkgKyBNYXRoLnJhbmRvbSgpICogKG1heFNwYXduWSAtIG1pblNwYXduWSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG5ld0Zpc2ggPSBuZXcgRmlzaChcclxuICAgICAgICAgICAgICAgIHNwYXduWCxcclxuICAgICAgICAgICAgICAgIHNwYXduWSxcclxuICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmZpc2hEZWZhdWx0V2lkdGgsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5maXNoRGVmYXVsdEhlaWdodCxcclxuICAgICAgICAgICAgICAgIGZpc2hDb25maWdcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgdGhpcy5maXNoZXMucHVzaChuZXdGaXNoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIExpbWl0IHRoZSBudW1iZXIgb2YgZmlzaCBvbiBzY3JlZW5cclxuICAgICAgICAgICAgaWYgKHRoaXMuZmlzaGVzLmxlbmd0aCA+IHRoaXMuY29uZmlnLm1heEZpc2hPblNjcmVlbikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5maXNoZXMuc2hpZnQoKTsgLy8gUmVtb3ZlIHRoZSBvbGRlc3QgZmlzaFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiRmlzaCBzcGF3biByYW5nZSBpcyBpbnZhbGlkLiBDaGVjayBjYW52YXMgZGltZW5zaW9ucywgaW5pdGlhbEJvYmJlclksIGFuZCBmaXNoRGVmYXVsdEhlaWdodCBpbiBjb25maWcuXCIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEluaXRpYWxpemVzIHRoZSByZWVsaW5nIG1pbmktZ2FtZS5cclxuICAgICAqIEBwYXJhbSBmaXNoIC0gVGhlIGFjdHVhbCBGaXNoIG9iamVjdCB0aGF0IGluaXRpYXRlZCB0aGUgbWluaS1nYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGluaXRNaW5pR2FtZShmaXNoOiBGaXNoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5taW5pR2FtZVN1Y2Nlc3MgPSAwO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVGYWlsdXJlID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lVGltZXIgPSB0aGlzLmNvbmZpZy5taW5pR2FtZUR1cmF0aW9uU2Vjb25kcztcclxuICAgICAgICB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uID0gMDsgLy8gU3RhcnQgcG9pbnRlciBhdCBjZW50ZXJcclxuICAgICAgICB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciA9IChNYXRoLnJhbmRvbSgpICogMS42KSAtIDAuODsgLy8gUmFuZG9tIHBvc2l0aW9uIGJldHdlZW4gLTAuOCBhbmQgMC44XHJcbiAgICAgICAgdGhpcy5jdXJyZW50RmlzaEluTWluaWdhbWUgPSBmaXNoOyAvLyBTdG9yZSB0aGUgYWN0dWFsIGZpc2ggaW5zdGFuY2VcclxuXHJcbiAgICAgICAgLy8gQWRqdXN0IG1pbmktZ2FtZSBwYXJhbWV0ZXJzIGJhc2VkIG9uIGZpc2ggZGlmZmljdWx0eVxyXG4gICAgICAgIHRoaXMuY29uZmlnLm1pbmlHYW1lQmFzZVBvaW50ZXJTcGVlZCA9IDEuMCArIChmaXNoLmRhdGEubWluaUdhbWVEaWZmaWN1bHR5ICogMC41KTtcclxuICAgICAgICAvLyBSYW5kb21pemUgaW5pdGlhbCBwb2ludGVyIHNwZWVkIGRpcmVjdGlvblxyXG4gICAgICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgMC41KSB7IHRoaXMuY29uZmlnLm1pbmlHYW1lQmFzZVBvaW50ZXJTcGVlZCAqPSAtMTsgfVxyXG4gICAgICAgIHRoaXMuY29uZmlnLm1pbmlHYW1lRGVjYXlSYXRlID0gMC44ICsgKGZpc2guZGF0YS5taW5pR2FtZURpZmZpY3VsdHkgKiAwLjIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVzb2x2ZXMgdGhlIG1pbmktZ2FtZSwgZGV0ZXJtaW5pbmcgaWYgdGhlIGZpc2ggd2FzIGNhdWdodCBvciBsb3N0LlxyXG4gICAgICogQHBhcmFtIGZvcmNlZE91dGNvbWUgLSBPcHRpb25hbCBib29sZWFuIHRvIGZvcmNlIGEgc3VjY2VzcyBvciBmYWlsdXJlIChlLmcuLCBpZiB0YXJnZXQvdGhyZXNob2xkIHJlYWNoZWQgZWFybHkpLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlc29sdmVNaW5pR2FtZShmb3JjZWRPdXRjb21lPzogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGNhdWdodCA9IGZvcmNlZE91dGNvbWUgIT09IHVuZGVmaW5lZCA/IGZvcmNlZE91dGNvbWUgOiAodGhpcy5taW5pR2FtZVN1Y2Nlc3MgPj0gdGhpcy5jb25maWcubWluaUdhbWVTdWNjZXNzVGFyZ2V0KTtcclxuXHJcbiAgICAgICAgaWYgKGNhdWdodCAmJiB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSkge1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lLmRhdGEuc2NvcmU7IC8vIEFjY2VzcyBzY29yZSBmcm9tIGZpc2guZGF0YVxyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2NhdGNoJyk7XHJcbiAgICAgICAgICAgIHRoaXMuY2F1Z2h0RmlzaE5hbWUgPSB0aGlzLmNvbmZpZy51aS5maXNoQ2F1Z2h0OyAvLyBEaXNwbGF5IFwiQ2F1Z2h0IVwiIG1lc3NhZ2VcclxuICAgICAgICAgICAgLy8gVGhlIGZpc2ggaGFzIGFscmVhZHkgYmVlbiByZW1vdmVkIGZyb20gdGhlIGBmaXNoZXNgIGFycmF5IHdoZW4gdGhlIG1pbmktZ2FtZSBzdGFydGVkLlxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnZmFpbCcpO1xyXG4gICAgICAgICAgICB0aGlzLmNhdWdodEZpc2hOYW1lID0gdGhpcy5jb25maWcudWkuZmlzaExvc3Q7IC8vIERpc3BsYXkgXCJMb3N0IVwiIG1lc3NhZ2VcclxuICAgICAgICAgICAgLy8gSWYgdGhlIGZpc2ggaXMgbG9zdCwgaXQncyBjb25zaWRlcmVkIHRvIGhhdmUgXCJnb3R0ZW4gYXdheVwiIGFuZCBpcyBub3QgcmUtYWRkZWQgdG8gdGhlIHNjcmVlbi5cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lID0gdW5kZWZpbmVkOyAvLyBDbGVhciBmaXNoIGluIG1pbmktZ2FtZVxyXG4gICAgICAgIHRoaXMub3V0Y29tZURpc3BsYXlUaW1lciA9IDI7IC8vIERpc3BsYXkgbWVzc2FnZSBmb3IgMiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuV0FJVElOR19GT1JfQklURTsgLy8gUmV0dXJuIHRvIHdhaXRpbmdcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIERyYXdzIGFsbCBnYW1lIGVsZW1lbnRzIHRvIHRoZSBjYW52YXMgYmFzZWQgb24gdGhlIGN1cnJlbnQgZ2FtZSBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBkcmF3KCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBiYWNrZ3JvdW5kIGZpcnN0IGZvciBhbGwgc3RhdGVzIChleGNlcHQgbG9hZGluZylcclxuICAgICAgICBjb25zdCBiYWNrZ3JvdW5kID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoJ2JhY2tncm91bmQnKTtcclxuICAgICAgICBpZiAoYmFja2dyb3VuZCkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmFja2dyb3VuZCwgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuY3VycmVudFN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU46XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUdXRvcmlhbFNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLldBSVRJTkdfRk9SX0JJVEU6XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlJFRUxJTkdfTUlOSUdBTUU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lcGxheSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuUkVFTElOR19NSU5JR0FNRSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd01pbmlHYW1lVUkoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNhdWdodEZpc2hOYW1lICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3T3V0Y29tZU1lc3NhZ2UoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lcGxheSgpOyAvLyBEcmF3IGdhbWUgc2NlbmUgYmVoaW5kIGdhbWUgb3ZlciBzY3JlZW5cclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TG9hZGluZ1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHt0aGlzLmNvbmZpZy51aS5sb2FkaW5nfSAke01hdGgucm91bmQodGhpcy5hc3NldE1hbmFnZXIuZ2V0TG9hZGluZ1Byb2dyZXNzKCkgKiAxMDApfSVgLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNSknOyAvLyBTZW1pLXRyYW5zcGFyZW50IG92ZXJsYXlcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQ4cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnRpdGxlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkucHJlc3NTcGFjZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1R1dG9yaWFsU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNSknOyAvLyBTZW1pLXRyYW5zcGFyZW50IG92ZXJsYXlcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzMwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdcdUM4NzBcdUM3OTFcdUJDOTUnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAxMjApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzIwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnR1dG9yaWFsTGluZTEsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDYwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS50dXRvcmlhbExpbmUyLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAzMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkudHV0b3JpYWxMaW5lMywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS50dXRvcmlhbExpbmU0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAzMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkucHJlc3NTcGFjZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lcGxheSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB3YXRlckxpbmVZID0gdGhpcy5jb25maWcuaW5pdGlhbEJvYmJlclkgKiB0aGlzLmNhbnZhcy5oZWlnaHQ7XHJcblxyXG4gICAgICAgIC8vIERyYXcgYm9hdFxyXG4gICAgICAgIGNvbnN0IGJvYXQgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnYm9hdCcpO1xyXG4gICAgICAgIGlmIChib2F0KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvYXRYID0gdGhpcy5jYW52YXMud2lkdGggLyAyIC0gYm9hdC53aWR0aCAvIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvYXRZID0gd2F0ZXJMaW5lWSAtIGJvYXQuaGVpZ2h0OyAvLyBCb3R0b20gb2YgYm9hdCBhdCB3YXRlciBsaW5lXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShib2F0LCBib2F0WCwgYm9hdFksIGJvYXQud2lkdGgsIGJvYXQuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgICAgIC8vIERyYXcgZmlzaGluZyBsaW5lIChmcm9tIGJvYXQgdG8gYm9iYmVyKVxyXG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmxpbmVXaWR0aCA9IDI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmJlZ2luUGF0aCgpO1xyXG4gICAgICAgICAgICAvLyBMaW5lIHN0YXJ0cyBmcm9tIGEgcG9pbnQgb24gdGhlIGJvYXQgd2hlcmUgdGhlIGZpc2hpbmcgcm9kIG1pZ2h0IGJlXHJcbiAgICAgICAgICAgIHRoaXMuY3R4Lm1vdmVUbyhib2F0WCArIHRoaXMuY29uZmlnLmZpc2hpbmdMaW5lT2Zmc2V0WCwgYm9hdFkgKyB0aGlzLmNvbmZpZy5maXNoaW5nTGluZU9mZnNldFkpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5saW5lVG8odGhpcy5ib2JiZXIueCwgdGhpcy5ib2JiZXIueSk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5ib2JiZXIuZHJhdyh0aGlzLmN0eCwgdGhpcy5hc3NldE1hbmFnZXIpO1xyXG4gICAgICAgIHRoaXMuZmlzaGVzLmZvckVhY2goZmlzaCA9PiBmaXNoLmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRNYW5hZ2VyKSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUkgZWxlbWVudHMgKHNjb3JlLCB0aW1lcilcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpLnNjb3JlUHJlZml4fSR7dGhpcy5zY29yZX1gLCAxMCwgMzApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpLnRpbWVSZW1haW5pbmdQcmVmaXh9JHtNYXRoLmNlaWwodGhpcy5nYW1lVGltZXIpfWAsIDEwLCA2MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TWluaUdhbWVVSSgpOiB2b2lkIHtcclxuICAgICAgICAvLyBEcmF3IGJhY2tncm91bmQgb3ZlcmxheSBmb3IgbWluaS1nYW1lXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC43KSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMTUwLCB0aGlzLmNhbnZhcy53aWR0aCwgMTUwKTsgLy8gQm90dG9tIGJhciBhcmVhXHJcblxyXG4gICAgICAgIGNvbnN0IGJhclkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLSAxMDA7XHJcbiAgICAgICAgY29uc3QgYmFySGVpZ2h0ID0gMzA7XHJcbiAgICAgICAgY29uc3QgYmFyV2lkdGggPSB0aGlzLmNhbnZhcy53aWR0aCAqIDAuODtcclxuICAgICAgICBjb25zdCBiYXJYID0gKHRoaXMuY2FudmFzLndpZHRoIC0gYmFyV2lkdGgpIC8gMjtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBtaW5pLWdhbWUgYmFyIGJhY2tncm91bmRcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnIzMzMyc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYmFyWCwgYmFyWSwgYmFyV2lkdGgsIGJhckhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgdGFyZ2V0IHpvbmVcclxuICAgICAgICBjb25zdCB0YXJnZXRab25lV2lkdGhQeCA9IGJhcldpZHRoICogdGhpcy5jb25maWcubWluaUdhbWVUYXJnZXRab25lV2lkdGg7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0Wm9uZVggPSBiYXJYICsgKHRoaXMubWluaUdhbWVUYXJnZXRab25lQ2VudGVyICogKGJhcldpZHRoIC8gMikpICsgKGJhcldpZHRoIC8gMikgLSAodGFyZ2V0Wm9uZVdpZHRoUHggLyAyKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAyNTUsIDAsIDAuNSknOyAvLyBHcmVlbiB0YXJnZXQgem9uZVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHRhcmdldFpvbmVYLCBiYXJZLCB0YXJnZXRab25lV2lkdGhQeCwgYmFySGVpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBwb2ludGVyXHJcbiAgICAgICAgY29uc3QgcG9pbnRlclggPSBiYXJYICsgKHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gKiAoYmFyV2lkdGggLyAyKSkgKyAoYmFyV2lkdGggLyAyKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAneWVsbG93JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChwb2ludGVyWCAtIDUsIGJhclkgLSAxMCwgMTAsIGJhckhlaWdodCArIDIwKTsgLy8gUG9pbnRlciB3aWRlciBhbmQgdGFsbGVyXHJcblxyXG4gICAgICAgIC8vIERyYXcgc3VjY2VzcyBiYXJcclxuICAgICAgICBjb25zdCBzdWNjZXNzQmFyV2lkdGggPSAodGhpcy5taW5pR2FtZVN1Y2Nlc3MgLyB0aGlzLmNvbmZpZy5taW5pR2FtZVN1Y2Nlc3NUYXJnZXQpICogYmFyV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsdWUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGJhclgsIGJhclkgKyBiYXJIZWlnaHQgKyAxMCwgc3VjY2Vzc0JhcldpZHRoLCAxMCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgZmFpbHVyZSBiYXJcclxuICAgICAgICBjb25zdCBmYWlsdXJlQmFyV2lkdGggPSAodGhpcy5taW5pR2FtZUZhaWx1cmUgLyB0aGlzLmNvbmZpZy5taW5pR2FtZUZhaWx1cmVUaHJlc2hvbGQpICogYmFyV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYmFyWCwgYmFyWSArIGJhckhlaWdodCArIDI1LCBmYWlsdXJlQmFyV2lkdGgsIDEwKTtcclxuXHJcbiAgICAgICAgLy8gRGlzcGxheSBpbnN0cnVjdGlvbnMgYW5kIHRpbWVyXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI4cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnJlZWxJbnN0cnVjdGlvbiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCBiYXJZIC0gMzApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzIwcHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpLnJlZWxUaW1lfSR7TWF0aC5jZWlsKHRoaXMubWluaUdhbWVUaW1lcil9c2AsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgYmFyWSArIGJhckhlaWdodCArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdPdXRjb21lTWVzc2FnZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5jYXVnaHRGaXNoTmFtZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjYpJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwLCB0aGlzLmNhbnZhcy53aWR0aCwgMTAwKTtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0MHB4IEFyaWFsJztcclxuICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY2F1Z2h0RmlzaE5hbWUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC43KSc7IC8vIERhcmsgb3ZlcmxheVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnNjBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkuZ2FtZU92ZXIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDgwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczNnB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHt0aGlzLmNvbmZpZy51aS5zY29yZVByZWZpeH0ke3RoaXMuc2NvcmV9YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS5wcmVzc1NwYWNlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA4MCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEluaXRpYWxpemUgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGlzIGZ1bGx5IGxvYWRlZFxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZCFcIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG4gICAgaWYgKCFjdHgpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGdldCAyRCByZW5kZXJpbmcgY29udGV4dCBmb3IgY2FudmFzIVwiKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgZ2FtZSA9IG5ldyBHYW1lKGNhbnZhcywgY3R4KTtcclxuICAgIGdhbWUuc3RhcnQoKTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQStFQSxJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFLSixNQUFNLGFBQWE7QUFBQSxFQUFuQjtBQUNJLGtCQUF3QyxvQkFBSSxJQUFJO0FBQ2hELGtCQUF3QyxvQkFBSSxJQUFJO0FBQ2hELHVCQUFjO0FBQ2QsdUJBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNZCxNQUFNLFdBQVcsUUFBNkM7QUFDMUQsU0FBSyxjQUFjLE9BQU8sT0FBTyxTQUFTLE9BQU8sT0FBTztBQUN4RCxVQUFNLFdBQTRCLENBQUM7QUFFbkMsZUFBVyxhQUFhLE9BQU8sUUFBUTtBQUNuQyxlQUFTLEtBQUssS0FBSyxVQUFVLFNBQVMsQ0FBQztBQUFBLElBQzNDO0FBQ0EsZUFBVyxlQUFlLE9BQU8sUUFBUTtBQUNyQyxlQUFTLEtBQUssS0FBSyxVQUFVLFdBQVcsQ0FBQztBQUFBLElBQzdDO0FBRUEsVUFBTSxRQUFRLElBQUksUUFBUTtBQUFBLEVBQzlCO0FBQUEsRUFFUSxVQUFVLFFBQXdDO0FBQ3RELFdBQU8sSUFBSSxRQUFRLENBQUMsU0FBUyxXQUFXO0FBQ3BDLFlBQU0sTUFBTSxJQUFJLE1BQU07QUFDdEIsVUFBSSxNQUFNLE9BQU87QUFDakIsVUFBSSxTQUFTLE1BQU07QUFDZixhQUFLLE9BQU8sSUFBSSxPQUFPLE1BQU0sR0FBRztBQUNoQyxhQUFLO0FBQ0wsZ0JBQVE7QUFBQSxNQUNaO0FBQ0EsVUFBSSxVQUFVLE1BQU07QUFDaEIsZ0JBQVEsTUFBTSx5QkFBeUIsT0FBTyxJQUFJLEVBQUU7QUFDcEQsZUFBTztBQUFBLE1BQ1g7QUFBQSxJQUNKLENBQUM7QUFBQSxFQUNMO0FBQUEsRUFFUSxVQUFVLFFBQXdDO0FBQ3RELFdBQU8sSUFBSSxRQUFRLENBQUMsWUFBWTtBQUM1QixZQUFNLFFBQVEsSUFBSSxNQUFNLE9BQU8sSUFBSTtBQUNuQyxZQUFNLFNBQVMsT0FBTztBQUN0QixZQUFNLFVBQVU7QUFDaEIsWUFBTSxtQkFBbUIsTUFBTTtBQUMzQixhQUFLLE9BQU8sSUFBSSxPQUFPLE1BQU0sS0FBSztBQUNsQyxhQUFLO0FBQ0wsZ0JBQVE7QUFBQSxNQUNaO0FBQ0EsWUFBTSxVQUFVLE1BQU07QUFDbEIsZ0JBQVEsS0FBSyx5QkFBeUIsT0FBTyxJQUFJLEVBQUU7QUFDbkQsYUFBSztBQUNMLGdCQUFRO0FBQUEsTUFDWjtBQUFBLElBQ0osQ0FBQztBQUFBLEVBQ0w7QUFBQSxFQUVBLFNBQVMsTUFBNEM7QUFDakQsV0FBTyxLQUFLLE9BQU8sSUFBSSxJQUFJO0FBQUEsRUFDL0I7QUFBQSxFQUVBLFVBQVUsTUFBYyxPQUFnQixPQUFPLFFBQStDO0FBQzFGLFVBQU0sUUFBUSxLQUFLLE9BQU8sSUFBSSxJQUFJO0FBQ2xDLFFBQUksT0FBTztBQUNQLFlBQU0sUUFBUSxNQUFNLFVBQVU7QUFDOUIsWUFBTSxPQUFPO0FBQ2IsWUFBTSxTQUFTLFdBQVcsU0FBWSxTQUFTLE1BQU07QUFDckQsWUFBTSxLQUFLLEVBQUUsTUFBTSxPQUFLLFFBQVEsS0FBSyx5QkFBeUIsSUFBSSxLQUFLLENBQUMsQ0FBQztBQUN6RSxhQUFPO0FBQUEsSUFDWDtBQUNBLFdBQU87QUFBQSxFQUNYO0FBQUEsRUFFQSxVQUFVLE9BQXlCO0FBQy9CLFVBQU0sTUFBTTtBQUNaLFVBQU0sY0FBYztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxxQkFBNkI7QUFDekIsV0FBTyxLQUFLLGNBQWMsSUFBSSxLQUFLLGNBQWMsS0FBSyxjQUFjO0FBQUEsRUFDeEU7QUFDSjtBQUtBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQU5DLFNBQUFBO0FBQUEsR0FBQTtBQVlMLE1BQU0sT0FBTztBQUFBLEVBT1QsWUFBWSxHQUFXLEdBQVcsT0FBZSxRQUFnQixXQUFtQjtBQUNoRixTQUFLLElBQUk7QUFDVCxTQUFLLElBQUk7QUFDVCxTQUFLLFFBQVE7QUFDYixTQUFLLFNBQVM7QUFDZCxTQUFLLFlBQVk7QUFBQSxFQUNyQjtBQUFBLEVBRUEsS0FBS0MsTUFBK0IsY0FBNEI7QUFDNUQsVUFBTSxNQUFNLGFBQWEsU0FBUyxLQUFLLFNBQVM7QUFDaEQsUUFBSSxLQUFLO0FBQ0wsTUFBQUEsS0FBSSxVQUFVLEtBQUssS0FBSyxJQUFJLEtBQUssUUFBUSxHQUFHLEtBQUssSUFBSSxLQUFLLFNBQVMsR0FBRyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsSUFDakc7QUFBQSxFQUNKO0FBQ0o7QUFLQSxNQUFNLEtBQUs7QUFBQTtBQUFBLEVBVVAsWUFBWSxHQUFXLEdBQVcsT0FBZSxRQUFnQixNQUFnQjtBQUM3RSxTQUFLLElBQUk7QUFDVCxTQUFLLElBQUk7QUFDVCxTQUFLLFFBQVE7QUFDYixTQUFLLFNBQVM7QUFDZCxTQUFLLFlBQVksS0FBSztBQUN0QixTQUFLLFFBQVEsS0FBSztBQUNsQixTQUFLLE9BQU87QUFDWixTQUFLLFlBQVksS0FBSyxPQUFPLElBQUksTUFBTSxLQUFLO0FBQUEsRUFDaEQ7QUFBQSxFQUVBLE9BQU8sV0FBbUIsYUFBcUIsU0FBaUI7QUFDNUQsU0FBSyxLQUFLLEtBQUssUUFBUSxLQUFLLFlBQVk7QUFHeEMsUUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksYUFBYTtBQUNwQyxXQUFLLGFBQWE7QUFDbEIsV0FBSyxJQUFJLEtBQUssSUFBSSxHQUFHLEtBQUssSUFBSSxhQUFhLEtBQUssQ0FBQyxDQUFDO0FBQUEsSUFDdEQ7QUFJQSxVQUFNLG1CQUFtQixLQUFLLElBQUksS0FBSyxJQUFJLE9BQU87QUFDbEQsUUFBSSxtQkFBbUIsS0FBSztBQUN4QixZQUFNLGdCQUFpQixVQUFVLEtBQUssSUFBSSxJQUFLLElBQUk7QUFDbkQsV0FBSyxLQUFLLGdCQUFnQixLQUFLLFFBQVEsYUFBYSxJQUFJLG1CQUFtQixPQUFPO0FBQUEsSUFDdEY7QUFBQSxFQUNKO0FBQUEsRUFFQSxLQUFLQSxNQUErQixjQUE0QjtBQUM1RCxVQUFNLE1BQU0sYUFBYSxTQUFTLEtBQUssU0FBUztBQUNoRCxRQUFJLEtBQUs7QUFDTCxNQUFBQSxLQUFJLEtBQUs7QUFDVCxNQUFBQSxLQUFJLFVBQVUsS0FBSyxHQUFHLEtBQUssQ0FBQztBQUU1QixVQUFJLEtBQUssY0FBYyxJQUFJO0FBQ3ZCLFFBQUFBLEtBQUksTUFBTSxJQUFJLENBQUM7QUFBQSxNQUNuQjtBQUNBLE1BQUFBLEtBQUksVUFBVSxLQUFLLENBQUMsS0FBSyxRQUFRLEdBQUcsQ0FBQyxLQUFLLFNBQVMsR0FBRyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQzdFLE1BQUFBLEtBQUksUUFBUTtBQUFBLElBQ2hCO0FBQUEsRUFDSjtBQUNKO0FBS0EsTUFBTSxLQUFLO0FBQUE7QUFBQSxFQThCUCxZQUFvQkMsU0FBbUNELE1BQStCO0FBQWxFLGtCQUFBQztBQUFtQyxlQUFBRDtBQTVCdkQsU0FBUSxlQUE2QixJQUFJLGFBQWE7QUFDdEQsU0FBUSxlQUEwQjtBQUNsQyxTQUFRLFdBQWdDO0FBRXhDLFNBQVEsUUFBZ0I7QUFDeEIsU0FBUSxZQUFvQjtBQUM1QjtBQUFBLFNBQVEsaUJBQXlCO0FBQ2pDO0FBQUEsU0FBUSxTQUFpQixDQUFDO0FBRTFCLFNBQVEsY0FBMkIsb0JBQUksSUFBSTtBQUMzQyxTQUFRLGlCQUFnQztBQUN4QztBQUFBLFNBQVEsc0JBQThCO0FBR3RDO0FBQUE7QUFBQSxTQUFRLHNCQUE4QjtBQUd0QztBQUFBO0FBQUEsU0FBUSxrQkFBK0I7QUFDdkMsU0FBUSx1QkFBK0I7QUFHdkM7QUFBQSxTQUFRLGtCQUEwQjtBQUNsQyxTQUFRLGtCQUEwQjtBQUNsQyxTQUFRLGdCQUF3QjtBQUNoQyxTQUFRLDBCQUFrQztBQUMxQztBQUFBLFNBQVEsMkJBQW1DO0FBNkUzQztBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsZ0JBQWdCLENBQUMsVUFBK0I7QUFDcEQsV0FBSyxZQUFZLElBQUksTUFBTSxJQUFJO0FBRS9CLFVBQUksTUFBTSxTQUFTLFNBQVM7QUFDeEIsY0FBTSxlQUFlO0FBRXJCLGdCQUFRLEtBQUssY0FBYztBQUFBLFVBQ3ZCLEtBQUs7QUFDRCxpQkFBSyxlQUFlO0FBQ3BCLGlCQUFLLGFBQWEsVUFBVSxRQUFRO0FBQ3BDO0FBQUEsVUFDSixLQUFLO0FBQ0QsaUJBQUssZUFBZTtBQUNwQixpQkFBSyxhQUFhLFVBQVUsUUFBUTtBQUNwQztBQUFBLFVBQ0osS0FBSztBQUVELGtCQUFNLGtCQUFrQixLQUFLLDJCQUEyQixLQUFLLE9BQU8sMEJBQTBCO0FBQzlGLGtCQUFNLGdCQUFnQixLQUFLLDJCQUEyQixLQUFLLE9BQU8sMEJBQTBCO0FBQzVGLGdCQUFJLEtBQUssMkJBQTJCLG1CQUFtQixLQUFLLDJCQUEyQixlQUFlO0FBQ2xHLG1CQUFLLG1CQUFtQixLQUFLLE9BQU87QUFBQSxZQUN4QztBQUNBLGlCQUFLLGFBQWEsVUFBVSxRQUFRLE9BQU8sR0FBRztBQUM5QztBQUFBLFVBQ0osS0FBSztBQUNELGlCQUFLLFNBQVM7QUFDZCxpQkFBSyxlQUFlO0FBQ3BCLGlCQUFLLGFBQWEsVUFBVSxRQUFRO0FBQ3BDO0FBQUEsUUFDUjtBQUFBLE1BQ0osV0FBVyxLQUFLLGlCQUFpQiwwQkFBNEI7QUFDekQsWUFBSSxNQUFNLFNBQVMsV0FBVztBQUMxQixlQUFLLHNCQUFzQjtBQUFBLFFBQy9CLFdBQVcsTUFBTSxTQUFTLGFBQWE7QUFDbkMsZUFBSyxzQkFBc0I7QUFBQSxRQUMvQjtBQUFBLE1BQ0o7QUFBQSxJQUNKO0FBTUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLGNBQWMsQ0FBQyxVQUErQjtBQUNsRCxXQUFLLFlBQVksT0FBTyxNQUFNLElBQUk7QUFDbEMsVUFBSSxNQUFNLFNBQVMsYUFBYSxNQUFNLFNBQVMsYUFBYTtBQUN4RCxhQUFLLHNCQUFzQjtBQUFBLE1BQy9CO0FBQUEsSUFDSjtBQU1BO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUSxPQUFPLENBQUMsZ0JBQTJDO0FBQ3ZELFlBQU0sYUFBYSxjQUFjLEtBQUssWUFBWTtBQUNsRCxXQUFLLFdBQVc7QUFFaEIsV0FBSyxPQUFPLFNBQVM7QUFDckIsV0FBSyxLQUFLO0FBRVYsNEJBQXNCLEtBQUssSUFBSTtBQUFBLElBQ25DO0FBdElJLFNBQUssT0FBTyxRQUFRO0FBQ3BCLFNBQUssT0FBTyxTQUFTO0FBQ3JCLFdBQU8saUJBQWlCLFdBQVcsS0FBSyxhQUFhO0FBQ3JELFdBQU8saUJBQWlCLFNBQVMsS0FBSyxXQUFXO0FBQUEsRUFDckQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0sUUFBdUI7QUFDekIsVUFBTSxLQUFLLFdBQVc7QUFDdEIsU0FBSyxTQUFTO0FBQ2QsU0FBSyxLQUFLLENBQUM7QUFBQSxFQUNmO0FBQUEsRUFFQSxNQUFjLGFBQTRCO0FBQ3RDLFFBQUk7QUFDQSxZQUFNLFdBQVcsTUFBTSxNQUFNLFdBQVc7QUFDeEMsV0FBSyxTQUFTLE1BQU0sU0FBUyxLQUFLO0FBQ2xDLFdBQUssT0FBTyxRQUFRLEtBQUssT0FBTztBQUNoQyxXQUFLLE9BQU8sU0FBUyxLQUFLLE9BQU87QUFDakMsWUFBTSxLQUFLLGFBQWEsV0FBVyxLQUFLLE9BQU8sTUFBTTtBQUNyRCxXQUFLLGVBQWU7QUFBQSxJQUN4QixTQUFTLE9BQU87QUFDWixjQUFRLE1BQU0sZ0RBQWdELEtBQUs7QUFFbkUsV0FBSyxlQUFlO0FBQUEsSUFDeEI7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxXQUFpQjtBQUNyQixTQUFLLFFBQVE7QUFDYixTQUFLLFlBQVksS0FBSyxPQUFPO0FBQzdCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssU0FBUyxDQUFDO0FBQ2YsU0FBSyxTQUFTLElBQUk7QUFBQSxNQUNkLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxPQUFPO0FBQUEsTUFDekMsS0FBSyxPQUFPLGlCQUFpQixLQUFLLE9BQU87QUFBQTtBQUFBLE1BQ3pDLEtBQUssT0FBTztBQUFBLE1BQ1osS0FBSyxPQUFPO0FBQUEsTUFDWjtBQUFBLElBQ0o7QUFHQSxRQUFJLEtBQUssVUFBVTtBQUNmLFdBQUssYUFBYSxVQUFVLEtBQUssUUFBUTtBQUFBLElBQzdDO0FBQ0EsU0FBSyxXQUFXLEtBQUssYUFBYSxVQUFVLE9BQU8sTUFBTSxLQUFLLE9BQU8sT0FBTyxPQUFPLEtBQUssT0FBSyxFQUFFLFNBQVMsS0FBSyxHQUFHLE1BQU07QUFHdEgsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSywwQkFBMEI7QUFDL0IsU0FBSywyQkFBMkI7QUFDaEMsU0FBSyx3QkFBd0I7QUFDN0IsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxzQkFBc0I7QUFHM0IsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyx1QkFBdUI7QUFBQSxFQUNoQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUEwRVEsT0FBTyxXQUF5QjtBQUNwQyxRQUFJLEtBQUssaUJBQWlCLGdCQUFtQjtBQUc3QyxRQUFJLEtBQUssWUFBWSxLQUFLLFNBQVMsVUFBVSxLQUFLLGlCQUFpQix3QkFBMEIsS0FBSyxpQkFBaUIseUJBQTJCO0FBQ3pJLFdBQUssU0FBUyxLQUFLLEVBQUUsTUFBTSxPQUFLLFFBQVEsS0FBSyx5QkFBeUIsQ0FBQyxDQUFDO0FBQUEsSUFDN0U7QUFFQSxZQUFRLEtBQUssY0FBYztBQUFBLE1BQ3ZCLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFFRDtBQUFBLE1BQ0osS0FBSztBQUNELGFBQUssYUFBYTtBQUNsQixZQUFJLEtBQUssYUFBYSxHQUFHO0FBQ3JCLGVBQUssZUFBZTtBQUNwQixjQUFJLEtBQUssU0FBVSxNQUFLLGFBQWEsVUFBVSxLQUFLLFFBQVE7QUFDNUQsZUFBSyxhQUFhLFVBQVUsZUFBZTtBQUMzQztBQUFBLFFBQ0o7QUFHQSxZQUFJLEtBQUssd0JBQXdCLEdBQUc7QUFDaEMsZUFBSyxPQUFPLEtBQUssS0FBSyxzQkFBc0IsS0FBSyxPQUFPLGtCQUFrQjtBQUMxRSxlQUFLLE9BQU8sSUFBSSxLQUFLO0FBQUEsWUFDakIsS0FBSyxPQUFPLGtCQUFrQixLQUFLLE9BQU87QUFBQSxZQUMxQyxLQUFLLElBQUksS0FBSyxPQUFPLGtCQUFrQixLQUFLLE9BQU8sUUFBUSxLQUFLLE9BQU8sQ0FBQztBQUFBLFVBQzVFO0FBQUEsUUFDSjtBQUdBLGFBQUssT0FBTyxRQUFRLFVBQVEsS0FBSyxPQUFPLFlBQVksS0FBSyxPQUFPLHlCQUF5QixLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBRzFILGFBQUssa0JBQWtCO0FBQ3ZCLFlBQUksS0FBSyxrQkFBa0IsS0FBSyxPQUFPLDBCQUEwQjtBQUM3RCxlQUFLLGlCQUFpQjtBQUN0QixlQUFLLFVBQVU7QUFBQSxRQUNuQjtBQUdBLFlBQUksS0FBSyxtQkFBbUIsTUFBTTtBQUM5QixlQUFLLHVCQUF1QjtBQUM1QixjQUFJLEtBQUssdUJBQXVCLEdBQUc7QUFDL0IsaUJBQUssaUJBQWlCO0FBQUEsVUFDMUI7QUFBQSxRQUNKO0FBR0EsWUFBSSxLQUFLLG1CQUFtQixNQUFNO0FBQzlCLGNBQUksY0FBMkI7QUFDL0IsY0FBSSxnQkFBZ0I7QUFFcEIscUJBQVcsUUFBUSxLQUFLLFFBQVE7QUFDNUIsa0JBQU0sS0FBSyxLQUFLLElBQUksS0FBSyxPQUFPO0FBQ2hDLGtCQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssT0FBTztBQUNoQyxrQkFBTSxhQUFhLEtBQUssS0FBSyxLQUFLO0FBR2xDLGdCQUFJLGNBQWMsS0FBSyxPQUFPLG9CQUFvQixLQUFLLE9BQU8sbUJBQW1CO0FBQzdFLGtCQUFJLGFBQWEsZUFBZTtBQUM1QixnQ0FBZ0I7QUFDaEIsOEJBQWM7QUFBQSxjQUNsQjtBQUFBLFlBQ0o7QUFBQSxVQUNKO0FBRUEsY0FBSSxhQUFhO0FBQ2IsZ0JBQUksS0FBSyxvQkFBb0IsYUFBYTtBQUN0QyxtQkFBSyx3QkFBd0I7QUFDN0Isa0JBQUksS0FBSyx3QkFBd0IsS0FBSyxPQUFPLHlCQUF5QjtBQUNsRSxxQkFBSyxlQUFlO0FBQ3BCLHFCQUFLLGFBQWEsVUFBVSxNQUFNO0FBQ2xDLHFCQUFLLGFBQWEsS0FBSyxlQUFlO0FBR3RDLHNCQUFNLFFBQVEsS0FBSyxPQUFPLFFBQVEsS0FBSyxlQUFlO0FBQ3RELG9CQUFJLFFBQVEsSUFBSTtBQUNaLHVCQUFLLE9BQU8sT0FBTyxPQUFPLENBQUM7QUFBQSxnQkFDL0I7QUFDQSxxQkFBSyxrQkFBa0I7QUFDdkIscUJBQUssdUJBQXVCO0FBQUEsY0FDaEM7QUFBQSxZQUNKLE9BQU87QUFFSCxtQkFBSyxrQkFBa0I7QUFDdkIsbUJBQUssdUJBQXVCO0FBQUEsWUFDaEM7QUFBQSxVQUNKLE9BQU87QUFFSCxpQkFBSyxrQkFBa0I7QUFDdkIsaUJBQUssdUJBQXVCO0FBQUEsVUFDaEM7QUFBQSxRQUNKO0FBQ0E7QUFBQSxNQUNKLEtBQUs7QUFDRCxhQUFLLGlCQUFpQjtBQUN0QixZQUFJLEtBQUssaUJBQWlCLEdBQUc7QUFDekIsZUFBSyxnQkFBZ0I7QUFDckI7QUFBQSxRQUNKO0FBR0EsYUFBSyxrQkFBa0IsS0FBSyxJQUFJLEdBQUcsS0FBSyxrQkFBa0IsS0FBSyxPQUFPLG9CQUFvQixTQUFTO0FBR25HLGFBQUssMkJBQTJCLEtBQUssT0FBTywyQkFBMkI7QUFDdkUsWUFBSSxLQUFLLDBCQUEwQixLQUFLLEtBQUssMEJBQTBCLElBQUk7QUFDdkUsZUFBSyxPQUFPLDRCQUE0QjtBQUN4QyxlQUFLLDBCQUEwQixLQUFLLElBQUksSUFBSSxLQUFLLElBQUksR0FBRyxLQUFLLHVCQUF1QixDQUFDO0FBQUEsUUFDekY7QUFHQSxjQUFNLGtCQUFrQixLQUFLLDJCQUEyQixLQUFLLE9BQU8sMEJBQTBCO0FBQzlGLGNBQU0sZ0JBQWdCLEtBQUssMkJBQTJCLEtBQUssT0FBTywwQkFBMEI7QUFFNUYsWUFBSSxFQUFFLEtBQUssMkJBQTJCLG1CQUFtQixLQUFLLDJCQUEyQixnQkFBZ0I7QUFDckcsZUFBSyxtQkFBbUI7QUFBQSxRQUM1QjtBQUVBLFlBQUksS0FBSyxtQkFBbUIsS0FBSyxPQUFPLDBCQUEwQjtBQUM5RCxlQUFLLGdCQUFnQixLQUFLO0FBQUEsUUFDOUIsV0FBVyxLQUFLLG1CQUFtQixLQUFLLE9BQU8sdUJBQXVCO0FBQ2xFLGVBQUssZ0JBQWdCLElBQUk7QUFBQSxRQUM3QjtBQUNBO0FBQUEsSUFDUjtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLFlBQWtCO0FBQ3RCLFVBQU0sYUFBYSxLQUFLLE9BQU8sT0FBTyxLQUFLLE1BQU0sS0FBSyxPQUFPLElBQUksS0FBSyxPQUFPLE9BQU8sTUFBTSxDQUFDO0FBQzNGLFVBQU0sU0FBUyxLQUFLLE9BQU8sSUFBSSxLQUFLLE9BQU87QUFFM0MsVUFBTSxhQUFhLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxPQUFPO0FBQzVELFVBQU0sWUFBWSxhQUFhLEtBQUssT0FBTyxvQkFBb0IsSUFBSTtBQUNuRSxVQUFNLFlBQVksS0FBSyxPQUFPLFNBQVMsS0FBSyxPQUFPLG9CQUFvQixJQUFJO0FBRzNFLFFBQUksWUFBWSxXQUFXO0FBQ3ZCLFlBQU0sU0FBUyxZQUFZLEtBQUssT0FBTyxLQUFLLFlBQVk7QUFDeEQsWUFBTSxVQUFVLElBQUk7QUFBQSxRQUNoQjtBQUFBLFFBQ0E7QUFBQSxRQUNBLEtBQUssT0FBTztBQUFBLFFBQ1osS0FBSyxPQUFPO0FBQUEsUUFDWjtBQUFBLE1BQ0o7QUFDQSxXQUFLLE9BQU8sS0FBSyxPQUFPO0FBR3hCLFVBQUksS0FBSyxPQUFPLFNBQVMsS0FBSyxPQUFPLGlCQUFpQjtBQUNsRCxhQUFLLE9BQU8sTUFBTTtBQUFBLE1BQ3RCO0FBQUEsSUFDSixPQUFPO0FBQ0gsY0FBUSxLQUFLLHdHQUF3RztBQUFBLElBQ3pIO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxhQUFhLE1BQWtCO0FBQ25DLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssZ0JBQWdCLEtBQUssT0FBTztBQUNqQyxTQUFLLDBCQUEwQjtBQUMvQixTQUFLLDJCQUE0QixLQUFLLE9BQU8sSUFBSSxNQUFPO0FBQ3hELFNBQUssd0JBQXdCO0FBRzdCLFNBQUssT0FBTywyQkFBMkIsSUFBTyxLQUFLLEtBQUsscUJBQXFCO0FBRTdFLFFBQUksS0FBSyxPQUFPLElBQUksS0FBSztBQUFFLFdBQUssT0FBTyw0QkFBNEI7QUFBQSxJQUFJO0FBQ3ZFLFNBQUssT0FBTyxvQkFBb0IsTUFBTyxLQUFLLEtBQUsscUJBQXFCO0FBQUEsRUFDMUU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsZ0JBQWdCLGVBQStCO0FBQ25ELFVBQU0sU0FBUyxrQkFBa0IsU0FBWSxnQkFBaUIsS0FBSyxtQkFBbUIsS0FBSyxPQUFPO0FBRWxHLFFBQUksVUFBVSxLQUFLLHVCQUF1QjtBQUN0QyxXQUFLLFNBQVMsS0FBSyxzQkFBc0IsS0FBSztBQUM5QyxXQUFLLGFBQWEsVUFBVSxPQUFPO0FBQ25DLFdBQUssaUJBQWlCLEtBQUssT0FBTyxHQUFHO0FBQUEsSUFFekMsT0FBTztBQUNILFdBQUssYUFBYSxVQUFVLE1BQU07QUFDbEMsV0FBSyxpQkFBaUIsS0FBSyxPQUFPLEdBQUc7QUFBQSxJQUV6QztBQUVBLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssZUFBZTtBQUFBLEVBQ3hCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxPQUFhO0FBQ2pCLFNBQUssSUFBSSxVQUFVLEdBQUcsR0FBRyxLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sTUFBTTtBQUc5RCxVQUFNLGFBQWEsS0FBSyxhQUFhLFNBQVMsWUFBWTtBQUMxRCxRQUFJLFlBQVk7QUFDWixXQUFLLElBQUksVUFBVSxZQUFZLEdBQUcsR0FBRyxLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sTUFBTTtBQUFBLElBQzlFO0FBRUEsWUFBUSxLQUFLLGNBQWM7QUFBQSxNQUN2QixLQUFLO0FBQ0QsYUFBSyxrQkFBa0I7QUFDdkI7QUFBQSxNQUNKLEtBQUs7QUFDRCxhQUFLLGdCQUFnQjtBQUNyQjtBQUFBLE1BQ0osS0FBSztBQUNELGFBQUssbUJBQW1CO0FBQ3hCO0FBQUEsTUFDSixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0QsYUFBSyxhQUFhO0FBQ2xCLFlBQUksS0FBSyxpQkFBaUIsMEJBQTRCO0FBQ2xELGVBQUssZUFBZTtBQUFBLFFBQ3hCO0FBQ0EsWUFBSSxLQUFLLG1CQUFtQixNQUFNO0FBQzlCLGVBQUssbUJBQW1CO0FBQUEsUUFDNUI7QUFDQTtBQUFBLE1BQ0osS0FBSztBQUNELGFBQUssYUFBYTtBQUNsQixhQUFLLG1CQUFtQjtBQUN4QjtBQUFBLElBQ1I7QUFBQSxFQUNKO0FBQUEsRUFFUSxvQkFBMEI7QUFDOUIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsR0FBRyxHQUFHLEtBQUssT0FBTyxPQUFPLEtBQUssT0FBTyxNQUFNO0FBQzdELFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFPLEdBQUcsT0FBTyxJQUFJLEtBQUssTUFBTSxLQUFLLGFBQWEsbUJBQW1CLElBQUksR0FBRyxDQUFDLEtBQUssS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxDQUFDO0FBQUEsRUFDN0o7QUFBQSxFQUVRLGtCQUF3QjtBQUM1QixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFFN0QsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsT0FBTyxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksRUFBRTtBQUUxRixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxZQUFZLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBQUEsRUFDbkc7QUFBQSxFQUVRLHFCQUEyQjtBQUMvQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFFN0QsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsc0JBQU8sS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEdBQUc7QUFFNUUsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsZUFBZSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksRUFBRTtBQUNsRyxTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxlQUFlLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBQ2xHLFNBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxHQUFHLGVBQWUsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxDQUFDO0FBQzdGLFNBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxHQUFHLGVBQWUsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEVBQUU7QUFFbEcsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsWUFBWSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksR0FBRztBQUFBLEVBQ3BHO0FBQUEsRUFFUSxlQUFxQjtBQUN6QixVQUFNLGFBQWEsS0FBSyxPQUFPLGlCQUFpQixLQUFLLE9BQU87QUFHNUQsVUFBTSxPQUFPLEtBQUssYUFBYSxTQUFTLE1BQU07QUFDOUMsUUFBSSxNQUFNO0FBQ04sWUFBTSxRQUFRLEtBQUssT0FBTyxRQUFRLElBQUksS0FBSyxRQUFRO0FBQ25ELFlBQU0sUUFBUSxhQUFhLEtBQUs7QUFDaEMsV0FBSyxJQUFJLFVBQVUsTUFBTSxPQUFPLE9BQU8sS0FBSyxPQUFPLEtBQUssTUFBTTtBQUc5RCxXQUFLLElBQUksY0FBYztBQUN2QixXQUFLLElBQUksWUFBWTtBQUNyQixXQUFLLElBQUksVUFBVTtBQUVuQixXQUFLLElBQUksT0FBTyxRQUFRLEtBQUssT0FBTyxvQkFBb0IsUUFBUSxLQUFLLE9BQU8sa0JBQWtCO0FBQzlGLFdBQUssSUFBSSxPQUFPLEtBQUssT0FBTyxHQUFHLEtBQUssT0FBTyxDQUFDO0FBQzVDLFdBQUssSUFBSSxPQUFPO0FBQUEsSUFDcEI7QUFFQSxTQUFLLE9BQU8sS0FBSyxLQUFLLEtBQUssS0FBSyxZQUFZO0FBQzVDLFNBQUssT0FBTyxRQUFRLFVBQVEsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLLFlBQVksQ0FBQztBQUdsRSxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxHQUFHLEtBQUssT0FBTyxHQUFHLFdBQVcsR0FBRyxLQUFLLEtBQUssSUFBSSxJQUFJLEVBQUU7QUFDdEUsU0FBSyxJQUFJLFNBQVMsR0FBRyxLQUFLLE9BQU8sR0FBRyxtQkFBbUIsR0FBRyxLQUFLLEtBQUssS0FBSyxTQUFTLENBQUMsSUFBSSxJQUFJLEVBQUU7QUFBQSxFQUNqRztBQUFBLEVBRVEsaUJBQXVCO0FBRTNCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFPLFNBQVMsS0FBSyxLQUFLLE9BQU8sT0FBTyxHQUFHO0FBRXJFLFVBQU0sT0FBTyxLQUFLLE9BQU8sU0FBUztBQUNsQyxVQUFNLFlBQVk7QUFDbEIsVUFBTSxXQUFXLEtBQUssT0FBTyxRQUFRO0FBQ3JDLFVBQU0sUUFBUSxLQUFLLE9BQU8sUUFBUSxZQUFZO0FBRzlDLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLE1BQU0sTUFBTSxVQUFVLFNBQVM7QUFHakQsVUFBTSxvQkFBb0IsV0FBVyxLQUFLLE9BQU87QUFDakQsVUFBTSxjQUFjLE9BQVEsS0FBSyw0QkFBNEIsV0FBVyxLQUFPLFdBQVcsSUFBTSxvQkFBb0I7QUFDcEgsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsYUFBYSxNQUFNLG1CQUFtQixTQUFTO0FBR2pFLFVBQU0sV0FBVyxPQUFRLEtBQUssMkJBQTJCLFdBQVcsS0FBTyxXQUFXO0FBQ3RGLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLFdBQVcsR0FBRyxPQUFPLElBQUksSUFBSSxZQUFZLEVBQUU7QUFHN0QsVUFBTSxrQkFBbUIsS0FBSyxrQkFBa0IsS0FBSyxPQUFPLHdCQUF5QjtBQUNyRixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxNQUFNLE9BQU8sWUFBWSxJQUFJLGlCQUFpQixFQUFFO0FBR2xFLFVBQU0sa0JBQW1CLEtBQUssa0JBQWtCLEtBQUssT0FBTywyQkFBNEI7QUFDeEYsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsTUFBTSxPQUFPLFlBQVksSUFBSSxpQkFBaUIsRUFBRTtBQUdsRSxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxpQkFBaUIsS0FBSyxPQUFPLFFBQVEsR0FBRyxPQUFPLEVBQUU7QUFFbEYsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMsR0FBRyxLQUFLLE9BQU8sR0FBRyxRQUFRLEdBQUcsS0FBSyxLQUFLLEtBQUssYUFBYSxDQUFDLEtBQUssS0FBSyxPQUFPLFFBQVEsR0FBRyxPQUFPLFlBQVksRUFBRTtBQUFBLEVBQ2pJO0FBQUEsRUFFUSxxQkFBMkI7QUFDL0IsUUFBSSxLQUFLLGdCQUFnQjtBQUNyQixXQUFLLElBQUksWUFBWTtBQUNyQixXQUFLLElBQUksU0FBUyxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksSUFBSSxLQUFLLE9BQU8sT0FBTyxHQUFHO0FBQ3hFLFdBQUssSUFBSSxZQUFZO0FBQ3JCLFdBQUssSUFBSSxPQUFPO0FBQ2hCLFdBQUssSUFBSSxZQUFZO0FBQ3JCLFdBQUssSUFBSSxTQUFTLEtBQUssZ0JBQWdCLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBQUEsSUFDN0Y7QUFBQSxFQUNKO0FBQUEsRUFFUSxxQkFBMkI7QUFDL0IsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsR0FBRyxHQUFHLEtBQUssT0FBTyxPQUFPLEtBQUssT0FBTyxNQUFNO0FBRTdELFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxHQUFHLFVBQVUsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEVBQUU7QUFFN0YsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMsR0FBRyxLQUFLLE9BQU8sR0FBRyxXQUFXLEdBQUcsS0FBSyxLQUFLLElBQUksS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxDQUFDO0FBRTdHLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxHQUFHLFlBQVksS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEVBQUU7QUFBQSxFQUNuRztBQUNKO0FBR0EsU0FBUyxpQkFBaUIsb0JBQW9CLE1BQU07QUFDaEQsV0FBUyxTQUFTLGVBQWUsWUFBWTtBQUM3QyxNQUFJLENBQUMsUUFBUTtBQUNULFlBQVEsTUFBTSxnREFBZ0Q7QUFDOUQ7QUFBQSxFQUNKO0FBQ0EsUUFBTSxPQUFPLFdBQVcsSUFBSTtBQUM1QixNQUFJLENBQUMsS0FBSztBQUNOLFlBQVEsTUFBTSxnREFBZ0Q7QUFDOUQ7QUFBQSxFQUNKO0FBRUEsU0FBTyxJQUFJLEtBQUssUUFBUSxHQUFHO0FBQzNCLE9BQUssTUFBTTtBQUNmLENBQUM7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSIsICJjdHgiLCAiY2FudmFzIl0KfQo=
