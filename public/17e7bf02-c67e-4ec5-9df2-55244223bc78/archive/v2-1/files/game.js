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
  // The fish currently being reeled
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
          case 3 /* WAITING_FOR_BITE */:
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
      }
    };
    /**
     * Handles keyboard key up events.
     * @param event - The KeyboardEvent object.
     */
    this.handleKeyUp = (event) => {
      this.keysPressed.delete(event.code);
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
    this.caughtFishName = null;
    this.outcomeDisplayTimer = 0;
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
          const fishNearBobber = this.fishes.filter(
            (fish) => Math.abs(fish.x - this.bobber.x) < fish.width / 2 + this.bobber.width / 2 && Math.abs(fish.y - this.bobber.y) < fish.height / 2 + this.bobber.height / 2
          );
          if (fishNearBobber.length > 0 && Math.random() < deltaTime * 0.5) {
            this.currentState = 4 /* REELING_MINIGAME */;
            this.assetManager.playSound("bite");
            this.initMiniGame(fishNearBobber[0].data);
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
   * Spawns a new fish at a random position.
   */
  spawnFish() {
    const fishConfig = this.config.fishes[Math.floor(Math.random() * this.config.fishes.length)];
    const spawnX = Math.random() * this.canvas.width;
    const spawnY = this.bobber.y + (Math.random() * 100 - 50);
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
  }
  /**
   * Initializes the reeling mini-game.
   * @param fishData - The data of the fish that initiated the mini-game.
   */
  initMiniGame(fishData) {
    this.miniGameSuccess = 0;
    this.miniGameFailure = 0;
    this.miniGameTimer = this.config.miniGameDurationSeconds;
    this.miniGamePointerPosition = 0;
    this.miniGameTargetZoneCenter = Math.random() * 1.6 - 0.8;
    this.currentFishInMinigame = fishData;
    this.config.miniGameBasePointerSpeed = 1 + fishData.miniGameDifficulty * 0.5;
    if (Math.random() < 0.5) {
      this.config.miniGameBasePointerSpeed *= -1;
    }
    this.config.miniGameDecayRate = 0.8 + fishData.miniGameDifficulty * 0.2;
  }
  /**
   * Resolves the mini-game, determining if the fish was caught or lost.
   * @param forcedOutcome - Optional boolean to force a success or failure (e.g., if target/threshold reached early).
   */
  resolveMiniGame(forcedOutcome) {
    const caught = forcedOutcome !== void 0 ? forcedOutcome : this.miniGameSuccess >= this.config.miniGameSuccessTarget;
    if (caught && this.currentFishInMinigame) {
      this.score += this.currentFishInMinigame.score;
      this.assetManager.playSound("catch");
      this.caughtFishName = this.config.ui.fishCaught;
      const index = this.fishes.findIndex((f) => f.data.name === this.currentFishInMinigame.name);
      if (index > -1) {
        this.fishes.splice(index, 1);
      }
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
    const boat = this.assetManager.getImage("boat");
    if (boat) {
      this.ctx.drawImage(
        boat,
        this.canvas.width / 2 - boat.width / 2,
        this.config.initialBobberY * this.canvas.height - boat.height + 20,
        // Position boat slightly above the water line
        boat.width,
        boat.height
      );
    }
    this.ctx.strokeStyle = "white";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.canvas.width / 2 + 30, this.config.initialBobberY * this.canvas.height - boat.height / 2 + 20);
    this.ctx.lineTo(this.bobber.x, this.bobber.y);
    this.ctx.stroke();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gVHlwZVNjcmlwdCBpbnRlcmZhY2VzIGZvciBnYW1lIGNvbmZpZ3VyYXRpb24gYW5kIGRhdGFcclxuaW50ZXJmYWNlIEFzc2V0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIHdpZHRoPzogbnVtYmVyO1xyXG4gICAgaGVpZ2h0PzogbnVtYmVyO1xyXG4gICAgZHVyYXRpb25fc2Vjb25kcz86IG51bWJlcjtcclxuICAgIHZvbHVtZT86IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEltYWdlRGF0YUNvbmZpZyBleHRlbmRzIEFzc2V0Q29uZmlnIHtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFNvdW5kRGF0YUNvbmZpZyBleHRlbmRzIEFzc2V0Q29uZmlnIHtcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRmlzaERhdGEge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgc2NvcmU6IG51bWJlcjtcclxuICAgIGltYWdlOiBzdHJpbmc7IC8vIEFzc2V0IG5hbWUgZm9yIHRoZSBmaXNoIGltYWdlXHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgbWluaUdhbWVEaWZmaWN1bHR5OiBudW1iZXI7IC8vIEZhY3RvciBmb3IgbWluaS1nYW1lIGNoYWxsZW5nZVxyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBnYW1lRHVyYXRpb25TZWNvbmRzOiBudW1iZXI7IC8vIFRvdGFsIGdhbWUgdGltZVxyXG4gICAgaW5pdGlhbEJvYmJlclg6IG51bWJlcjsgLy8gUmF0aW8gb2YgY2FudmFzIHdpZHRoXHJcbiAgICBpbml0aWFsQm9iYmVyWTogbnVtYmVyOyAvLyBSYXRpbyBvZiBjYW52YXMgaGVpZ2h0XHJcbiAgICBmaXNoU3Bhd25JbnRlcnZhbFNlY29uZHM6IG51bWJlcjsgLy8gSG93IG9mdGVuIG5ldyBmaXNoIG1pZ2h0IGFwcGVhclxyXG4gICAgZmlzaFN3aW1TcGVlZE11bHRpcGxpZXI6IG51bWJlcjsgLy8gTXVsdGlwbGllciBmb3IgZmlzaCBtb3ZlbWVudCBzcGVlZFxyXG4gICAgbWF4RmlzaE9uU2NyZWVuOiBudW1iZXI7IC8vIE1heGltdW0gbnVtYmVyIG9mIGZpc2ggdmlzaWJsZVxyXG4gICAgYm9iYmVyV2lkdGg6IG51bWJlcjtcclxuICAgIGJvYmJlckhlaWdodDogbnVtYmVyO1xyXG4gICAgZmlzaERlZmF1bHRXaWR0aDogbnVtYmVyO1xyXG4gICAgZmlzaERlZmF1bHRIZWlnaHQ6IG51bWJlcjtcclxuICAgIG1pbmlHYW1lRHVyYXRpb25TZWNvbmRzOiBudW1iZXI7IC8vIER1cmF0aW9uIG9mIHRoZSByZWVsaW5nIG1pbmktZ2FtZVxyXG4gICAgbWluaUdhbWVTdWNjZXNzVGFyZ2V0OiBudW1iZXI7IC8vIEhvdyBtdWNoICdzdWNjZXNzJyBpcyBuZWVkZWQgdG8gY2F0Y2ggYSBmaXNoXHJcbiAgICBtaW5pR2FtZUZhaWx1cmVUaHJlc2hvbGQ6IG51bWJlcjsgLy8gSG93IG11Y2ggJ2ZhaWx1cmUnIGxlYWRzIHRvIGxvc2luZyBhIGZpc2hcclxuICAgIG1pbmlHYW1lUHJlc3NFZmZlY3Q6IG51bWJlcjsgLy8gSG93IG11Y2ggYSBTUEFDRSBwcmVzcyBjb250cmlidXRlcyB0byBzdWNjZXNzXHJcbiAgICBtaW5pR2FtZURlY2F5UmF0ZTogbnVtYmVyOyAvLyBIb3cgcXVpY2tseSBzdWNjZXNzIGRlY2F5cyBvdmVyIHRpbWVcclxuICAgIG1pbmlHYW1lVGFyZ2V0Wm9uZVdpZHRoOiBudW1iZXI7IC8vIFdpZHRoIG9mIHRoZSB0YXJnZXQgem9uZSBpbiB0aGUgbWluaS1nYW1lIGJhciAoMCB0byAxKVxyXG4gICAgbWluaUdhbWVCYXNlUG9pbnRlclNwZWVkOiBudW1iZXI7IC8vIEJhc2Ugc3BlZWQgb2YgdGhlIHBvaW50ZXIgaW4gdGhlIG1pbmktZ2FtZVxyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJbWFnZURhdGFDb25maWdbXTtcclxuICAgICAgICBzb3VuZHM6IFNvdW5kRGF0YUNvbmZpZ1tdO1xyXG4gICAgfTtcclxuICAgIGZpc2hlczogRmlzaERhdGFbXTtcclxuICAgIHVpOiB7XHJcbiAgICAgICAgdGl0bGU6IHN0cmluZztcclxuICAgICAgICBwcmVzc1NwYWNlOiBzdHJpbmc7XHJcbiAgICAgICAgdHV0b3JpYWxMaW5lMTogc3RyaW5nO1xyXG4gICAgICAgIHR1dG9yaWFsTGluZTI6IHN0cmluZztcclxuICAgICAgICB0dXRvcmlhbExpbmUzOiBzdHJpbmc7XHJcbiAgICAgICAgdHV0b3JpYWxMaW5lNDogc3RyaW5nO1xyXG4gICAgICAgIGZpc2hDYXVnaHQ6IHN0cmluZztcclxuICAgICAgICBmaXNoTG9zdDogc3RyaW5nO1xyXG4gICAgICAgIHNjb3JlUHJlZml4OiBzdHJpbmc7XHJcbiAgICAgICAgdGltZVJlbWFpbmluZ1ByZWZpeDogc3RyaW5nO1xyXG4gICAgICAgIGdhbWVPdmVyOiBzdHJpbmc7XHJcbiAgICAgICAgbG9hZGluZzogc3RyaW5nO1xyXG4gICAgICAgIHJlZWxJbnN0cnVjdGlvbjogc3RyaW5nO1xyXG4gICAgICAgIHJlZWxUaW1lOiBzdHJpbmc7XHJcbiAgICB9O1xyXG59XHJcblxyXG4vLyBHbG9iYWwgY2FudmFzIGFuZCBjb250ZXh0IHZhcmlhYmxlc1xyXG5sZXQgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxubGV0IGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG5sZXQgZ2FtZTogR2FtZTtcclxuXHJcbi8qKlxyXG4gKiBBc3NldE1hbmFnZXIgY2xhc3MgdG8gaGFuZGxlIGxvYWRpbmcgYW5kIGFjY2Vzc2luZyBnYW1lIGFzc2V0cyAoaW1hZ2VzIGFuZCBzb3VuZHMpLlxyXG4gKi9cclxuY2xhc3MgQXNzZXRNYW5hZ2VyIHtcclxuICAgIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgbG9hZGVkQ291bnQgPSAwO1xyXG4gICAgdG90YWxBc3NldHMgPSAwO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogTG9hZHMgYWxsIGFzc2V0cyBkZWZpbmVkIGluIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKiBAcGFyYW0gY29uZmlnIC0gVGhlIGFzc2V0IGNvbmZpZ3VyYXRpb24gZnJvbSBkYXRhLmpzb24uXHJcbiAgICAgKi9cclxuICAgIGFzeW5jIGxvYWRBc3NldHMoY29uZmlnOiBHYW1lQ29uZmlnWydhc3NldHMnXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMudG90YWxBc3NldHMgPSBjb25maWcuaW1hZ2VzLmxlbmd0aCArIGNvbmZpZy5zb3VuZHMubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IHByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBpbWdDb25maWcgb2YgY29uZmlnLmltYWdlcykge1xyXG4gICAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMubG9hZEltYWdlKGltZ0NvbmZpZykpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKGNvbnN0IHNvdW5kQ29uZmlnIG9mIGNvbmZpZy5zb3VuZHMpIHtcclxuICAgICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLmxvYWRTb3VuZChzb3VuZENvbmZpZykpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKGNvbmZpZzogSW1hZ2VEYXRhQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBjb25maWcucGF0aDtcclxuICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChjb25maWcubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtjb25maWcucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdCgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKGNvbmZpZzogU291bmREYXRhQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKGNvbmZpZy5wYXRoKTtcclxuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gY29uZmlnLnZvbHVtZTtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJztcclxuICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChjb25maWcubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRDb3VudCsrO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtjb25maWcucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIG5vdCBibG9jayBnYW1lXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0SW1hZ2UobmFtZTogc3RyaW5nKTogSFRNTEltYWdlRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UsIHZvbHVtZT86IG51bWJlcik6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgICAgICBjb25zdCBjbG9uZSA9IGF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7IC8vIENsb25lIHRvIGFsbG93IG11bHRpcGxlIGNvbmN1cnJlbnQgcGxheXNcclxuICAgICAgICAgICAgY2xvbmUubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IHZvbHVtZSAhPT0gdW5kZWZpbmVkID8gdm9sdW1lIDogYXVkaW8udm9sdW1lO1xyXG4gICAgICAgICAgICBjbG9uZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEF1ZGlvIHBsYXkgZmFpbGVkIGZvciAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICAgICAgcmV0dXJuIGNsb25lO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG5cclxuICAgIHN0b3BTb3VuZChhdWRpbzogSFRNTEF1ZGlvRWxlbWVudCkge1xyXG4gICAgICAgIGF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgfVxyXG5cclxuICAgIGdldExvYWRpbmdQcm9ncmVzcygpOiBudW1iZXIge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnRvdGFsQXNzZXRzID4gMCA/IHRoaXMubG9hZGVkQ291bnQgLyB0aGlzLnRvdGFsQXNzZXRzIDogMDtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEVudW0gZm9yIG1hbmFnaW5nIGRpZmZlcmVudCBzdGF0ZXMgb2YgdGhlIGdhbWUuXHJcbiAqL1xyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HLFxyXG4gICAgVElUTEVfU0NSRUVOLFxyXG4gICAgVFVUT1JJQUxfU0NSRUVOLFxyXG4gICAgV0FJVElOR19GT1JfQklURSxcclxuICAgIFJFRUxJTkdfTUlOSUdBTUUsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBCb2JiZXIgZ2FtZSBvYmplY3QuXHJcbiAqL1xyXG5jbGFzcyBCb2JiZXIge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2VOYW1lOiBzdHJpbmc7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbWFnZU5hbWUgPSBpbWFnZU5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIpIHtcclxuICAgICAgICBjb25zdCBpbWcgPSBhc3NldE1hbmFnZXIuZ2V0SW1hZ2UodGhpcy5pbWFnZU5hbWUpO1xyXG4gICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHRoaXMueCAtIHRoaXMud2lkdGggLyAyLCB0aGlzLnkgLSB0aGlzLmhlaWdodCAvIDIsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBGaXNoIGdhbWUgb2JqZWN0LlxyXG4gKi9cclxuY2xhc3MgRmlzaCB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBpbWFnZU5hbWU6IHN0cmluZztcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBkYXRhOiBGaXNoRGF0YTsgLy8gUmVmZXJlbmNlIHRvIGl0cyBkYXRhIGNvbmZpZ1xyXG4gICAgZGlyZWN0aW9uOiBudW1iZXI7IC8vIC0xIGZvciBsZWZ0LCAxIGZvciByaWdodFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZGF0YTogRmlzaERhdGEpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gZGF0YS5pbWFnZTtcclxuICAgICAgICB0aGlzLnNwZWVkID0gZGF0YS5zcGVlZDtcclxuICAgICAgICB0aGlzLmRhdGEgPSBkYXRhO1xyXG4gICAgICAgIHRoaXMuZGlyZWN0aW9uID0gTWF0aC5yYW5kb20oKSA8IDAuNSA/IC0xIDogMTsgLy8gU3RhcnQgbW92aW5nIHJhbmRvbWx5XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBjYW52YXNXaWR0aDogbnVtYmVyLCBib2JiZXJYOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIHRoaXMuZGlyZWN0aW9uICogZGVsdGFUaW1lO1xyXG5cclxuICAgICAgICAvLyBTaW1wbGUgYm91bmRhcnkgY2hlY2sgYW5kIGNoYW5nZSBkaXJlY3Rpb25cclxuICAgICAgICBpZiAodGhpcy54IDwgMCB8fCB0aGlzLnggPiBjYW52YXNXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLmRpcmVjdGlvbiAqPSAtMTtcclxuICAgICAgICAgICAgdGhpcy54ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY2FudmFzV2lkdGgsIHRoaXMueCkpOyAvLyBDbGFtcCBwb3NpdGlvblxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQWRkIGEgc2xpZ2h0IHB1bGwgdG93YXJkcyB0aGUgYm9iYmVyIHdoZW4gY2xvc2VcclxuICAgICAgICBjb25zdCBkaXN0YW5jZVRvQm9iYmVyID0gTWF0aC5hYnModGhpcy54IC0gYm9iYmVyWCk7XHJcbiAgICAgICAgaWYgKGRpc3RhbmNlVG9Cb2JiZXIgPCAyMDApIHsgLy8gSWYgd2l0aGluIDIwMHB4IG9mIGJvYmJlclxyXG4gICAgICAgICAgICBjb25zdCBwdWxsRGlyZWN0aW9uID0gKGJvYmJlclggLSB0aGlzLnggPiAwKSA/IDEgOiAtMTtcclxuICAgICAgICAgICAgdGhpcy54ICs9IHB1bGxEaXJlY3Rpb24gKiB0aGlzLnNwZWVkICogZGVsdGFUaW1lICogKDEgLSBkaXN0YW5jZVRvQm9iYmVyIC8gMjAwKSAqIDAuNTsgLy8gV2Vha2VyIHB1bGxcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIpIHtcclxuICAgICAgICBjb25zdCBpbWcgPSBhc3NldE1hbmFnZXIuZ2V0SW1hZ2UodGhpcy5pbWFnZU5hbWUpO1xyXG4gICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgY3R4LnNhdmUoKTtcclxuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSh0aGlzLngsIHRoaXMueSk7XHJcbiAgICAgICAgICAgIC8vIEZsaXAgaW1hZ2UgaWYgbW92aW5nIGxlZnRcclxuICAgICAgICAgICAgaWYgKHRoaXMuZGlyZWN0aW9uID09PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgY3R4LnNjYWxlKC0xLCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgLXRoaXMud2lkdGggLyAyLCAtdGhpcy5oZWlnaHQgLyAyLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgICAgIGN0eC5yZXN0b3JlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogTWFpbiBHYW1lIGNsYXNzIHJlc3BvbnNpYmxlIGZvciBtYW5hZ2luZyBnYW1lIHN0YXRlLCBsb2dpYywgYW5kIHJlbmRlcmluZy5cclxuICovXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlciA9IG5ldyBBc3NldE1hbmFnZXIoKTtcclxuICAgIHByaXZhdGUgY3VycmVudFN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG4gICAgcHJpdmF0ZSBiZ21BdWRpbzogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZDtcclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGdhbWVUaW1lcjogbnVtYmVyID0gMDsgLy8gSW4gc2Vjb25kc1xyXG4gICAgcHJpdmF0ZSBmaXNoU3Bhd25UaW1lcjogbnVtYmVyID0gMDsgLy8gSW4gc2Vjb25kc1xyXG4gICAgcHJpdmF0ZSBmaXNoZXM6IEZpc2hbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBib2JiZXIhOiBCb2JiZXI7XHJcbiAgICBwcml2YXRlIGtleXNQcmVzc2VkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcclxuICAgIHByaXZhdGUgY2F1Z2h0RmlzaE5hbWU6IHN0cmluZyB8IG51bGwgPSBudWxsOyAvLyBGb3IgZGlzcGxheWluZyBjYXRjaCBvdXRjb21lXHJcbiAgICBwcml2YXRlIG91dGNvbWVEaXNwbGF5VGltZXI6IG51bWJlciA9IDA7IC8vIEhvdyBsb25nIHRvIGRpc3BsYXkgb3V0Y29tZVxyXG5cclxuICAgIC8vIE1pbmktZ2FtZSB2YXJpYWJsZXNcclxuICAgIHByaXZhdGUgbWluaUdhbWVTdWNjZXNzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBtaW5pR2FtZUZhaWx1cmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lUG9pbnRlclBvc2l0aW9uOiBudW1iZXIgPSAwOyAvLyAtMSB0byAxIHJlcHJlc2VudGluZyBsZWZ0IHRvIHJpZ2h0XHJcbiAgICBwcml2YXRlIG1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlcjogbnVtYmVyID0gMDsgLy8gLTEgdG8gMVxyXG4gICAgcHJpdmF0ZSBjdXJyZW50RmlzaEluTWluaWdhbWU6IEZpc2hEYXRhIHwgdW5kZWZpbmVkOyAvLyBUaGUgZmlzaCBjdXJyZW50bHkgYmVpbmcgcmVlbGVkXHJcblxyXG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50LCBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgLy8gRGVmYXVsdCBjYW52YXMgc2l6ZSwgd2lsbCBiZSBvdmVyd3JpdHRlbiBieSBjb25maWdcclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IDgwMDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSA2MDA7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMuaGFuZGxlS2V5VXApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3RhcnRzIHRoZSBnYW1lIGJ5IGxvYWRpbmcgY29uZmlndXJhdGlvbiBhbmQgYXNzZXRzLCB0aGVuIGluaXRpYXRpbmcgdGhlIGdhbWUgbG9vcC5cclxuICAgICAqL1xyXG4gICAgYXN5bmMgc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQ29uZmlnKCk7XHJcbiAgICAgICAgdGhpcy5pbml0R2FtZSgpOyAvLyBJbml0aWFsaXplIGdhbWUgY29tcG9uZW50cyBhZnRlciBjb25maWcgaXMgbG9hZGVkXHJcbiAgICAgICAgdGhpcy5sb29wKDApOyAvLyBTdGFydCB0aGUgZ2FtZSBsb29wXHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBHYW1lQ29uZmlnO1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQ7XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXNzZXRNYW5hZ2VyLmxvYWRBc3NldHModGhpcy5jb25maWcuYXNzZXRzKTtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOOyAvLyBUcmFuc2l0aW9uIHRvIHRpdGxlIHNjcmVlbiBhZnRlciBsb2FkaW5nXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbiBvciBhc3NldHM6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgLy8gRmFsbGJhY2sgdG8gYSBmYWlsdXJlIHN0YXRlIGlmIGNyaXRpY2FsIGxvYWRpbmcgZmFpbHNcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEluaXRpYWxpemVzIG9yIHJlc2V0cyBnYW1lLXNwZWNpZmljIHZhcmlhYmxlcyBmb3IgYSBuZXcgZ2FtZSBzZXNzaW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGluaXRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuZ2FtZVRpbWVyID0gdGhpcy5jb25maWcuZ2FtZUR1cmF0aW9uU2Vjb25kcztcclxuICAgICAgICB0aGlzLmZpc2hTcGF3blRpbWVyID0gMDtcclxuICAgICAgICB0aGlzLmZpc2hlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuYm9iYmVyID0gbmV3IEJvYmJlcihcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuaW5pdGlhbEJvYmJlclggKiB0aGlzLmNhbnZhcy53aWR0aCxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuaW5pdGlhbEJvYmJlclkgKiB0aGlzLmNhbnZhcy5oZWlnaHQsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmJvYmJlcldpZHRoLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5ib2JiZXJIZWlnaHQsXHJcbiAgICAgICAgICAgICdib2JiZXInXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gU3RvcCBhbnkgcHJldmlvdXMgQkdNIGFuZCBzdGFydCBuZXcgb25lXHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIuc3RvcFNvdW5kKHRoaXMuYmdtQXVkaW8pO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmJnbUF1ZGlvID0gdGhpcy5hc3NldE1hbmFnZXIucGxheVNvdW5kKCdiZ20nLCB0cnVlLCB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lKTtcclxuXHJcbiAgICAgICAgLy8gUmVzZXQgbWluaS1nYW1lIHNwZWNpZmljIHZhcmlhYmxlc1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVTdWNjZXNzID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lRmFpbHVyZSA9IDA7XHJcbiAgICAgICAgdGhpcy5taW5pR2FtZVRpbWVyID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lUG9pbnRlclBvc2l0aW9uID0gMDtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciA9IDA7XHJcbiAgICAgICAgdGhpcy5jYXVnaHRGaXNoTmFtZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5vdXRjb21lRGlzcGxheVRpbWVyID0gMDtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMga2V5Ym9hcmQga2V5IGRvd24gZXZlbnRzLlxyXG4gICAgICogQHBhcmFtIGV2ZW50IC0gVGhlIEtleWJvYXJkRXZlbnQgb2JqZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24gPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkID0+IHtcclxuICAgICAgICB0aGlzLmtleXNQcmVzc2VkLmFkZChldmVudC5jb2RlKTtcclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdTcGFjZScpIHtcclxuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBwYWdlIHNjcm9sbGluZyB3aXRoIHNwYWNlYmFyXHJcblxyXG4gICAgICAgICAgICBzd2l0Y2ggKHRoaXMuY3VycmVudFN0YXRlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU46XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuVFVUT1JJQUxfU0NSRUVOO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnc2VsZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5UVVRPUklBTF9TQ1JFRU46XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50U3RhdGUgPSBHYW1lU3RhdGUuV0FJVElOR19GT1JfQklURTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NlbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuV0FJVElOR19GT1JfQklURTpcclxuICAgICAgICAgICAgICAgICAgICAvLyBJbnB1dCBpcyBub3QgdHlwaWNhbGx5IHByb2Nlc3NlZCBoZXJlLCB3YWl0aW5nIGZvciBmaXNoIGJpdGUgaXMgYXV0b21hdGljXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5SRUVMSU5HX01JTklHQU1FOlxyXG4gICAgICAgICAgICAgICAgICAgIC8vIE9ubHkgYXBwbHkgZWZmZWN0IGlmIHdpdGhpbiB0YXJnZXQgem9uZSBmb3IgbW9yZSBjaGFsbGVuZ2VcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab25lU3RhcnQgPSB0aGlzLm1pbmlHYW1lVGFyZ2V0Wm9uZUNlbnRlciAtIHRoaXMuY29uZmlnLm1pbmlHYW1lVGFyZ2V0Wm9uZVdpZHRoIC8gMjtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab25lRW5kID0gdGhpcy5taW5pR2FtZVRhcmdldFpvbmVDZW50ZXIgKyB0aGlzLmNvbmZpZy5taW5pR2FtZVRhcmdldFpvbmVXaWR0aCAvIDI7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPj0gdGFyZ2V0Wm9uZVN0YXJ0ICYmIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPD0gdGFyZ2V0Wm9uZUVuZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm1pbmlHYW1lU3VjY2VzcyArPSB0aGlzLmNvbmZpZy5taW5pR2FtZVByZXNzRWZmZWN0O1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3JlZWwnLCBmYWxzZSwgMC43KTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRHYW1lKCk7IC8vIFJlc2V0IGdhbWUgc3RhdGVcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU47IC8vIEdvIGJhY2sgdG8gdGl0bGUgZm9yIHJlc3RhcnRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ3NlbGVjdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBrZXlib2FyZCBrZXkgdXAgZXZlbnRzLlxyXG4gICAgICogQHBhcmFtIGV2ZW50IC0gVGhlIEtleWJvYXJkRXZlbnQgb2JqZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleVVwID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCA9PiB7XHJcbiAgICAgICAgdGhpcy5rZXlzUHJlc3NlZC5kZWxldGUoZXZlbnQuY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUaGUgbWFpbiBnYW1lIGxvb3AsIGNhbGxlZCBieSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUuXHJcbiAgICAgKiBAcGFyYW0gY3VycmVudFRpbWUgLSBUaGUgY3VycmVudCB0aW1lIHByb3ZpZGVkIGJ5IHJlcXVlc3RBbmltYXRpb25GcmFtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBsb29wID0gKGN1cnJlbnRUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wKTogdm9pZCA9PiB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwOyAvLyBDb252ZXJ0IHRvIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5kcmF3KCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmxvb3ApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyBnYW1lIGxvZ2ljIGJhc2VkIG9uIHRoZSBjdXJyZW50IHN0YXRlIGFuZCB0aW1lIGVsYXBzZWQuXHJcbiAgICAgKiBAcGFyYW0gZGVsdGFUaW1lIC0gVGhlIHRpbWUgZWxhcHNlZCBzaW5jZSB0aGUgbGFzdCBmcmFtZSwgaW4gc2Vjb25kcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50U3RhdGUgPT09IEdhbWVTdGF0ZS5MT0FESU5HKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIEF0dGVtcHQgdG8gcGxheSBCR00gaWYgaXQgcGF1c2VkLCB0eXBpY2FsbHkgZHVlIHRvIGJyb3dzZXIgYXV0b3BsYXkgcG9saWNpZXNcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbyAmJiB0aGlzLmJnbUF1ZGlvLnBhdXNlZCAmJiB0aGlzLmN1cnJlbnRTdGF0ZSAhPT0gR2FtZVN0YXRlLlRJVExFX1NDUkVFTiAmJiB0aGlzLmN1cnJlbnRTdGF0ZSAhPT0gR2FtZVN0YXRlLlRVVE9SSUFMX1NDUkVFTikge1xyXG4gICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gcmVzdW1lIEJHTTpcIiwgZSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmN1cnJlbnRTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU46XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRVVE9SSUFMX1NDUkVFTjpcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgLy8gTm8gc3BlY2lmaWMgdXBkYXRlIGxvZ2ljLCBqdXN0IHdhaXRpbmcgZm9yIHVzZXIgaW5wdXQgdG8gdHJhbnNpdGlvblxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLldBSVRJTkdfRk9SX0JJVEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5nYW1lVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykgdGhpcy5hc3NldE1hbmFnZXIuc3RvcFNvdW5kKHRoaXMuYmdtQXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnZ2FtZU92ZXJTb3VuZCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBmaXNoIG1vdmVtZW50XHJcbiAgICAgICAgICAgICAgICB0aGlzLmZpc2hlcy5mb3JFYWNoKGZpc2ggPT4gZmlzaC51cGRhdGUoZGVsdGFUaW1lICogdGhpcy5jb25maWcuZmlzaFN3aW1TcGVlZE11bHRpcGxpZXIsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmJvYmJlci54KSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gU3Bhd24gZmlzaFxyXG4gICAgICAgICAgICAgICAgdGhpcy5maXNoU3Bhd25UaW1lciArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5maXNoU3Bhd25UaW1lciA+PSB0aGlzLmNvbmZpZy5maXNoU3Bhd25JbnRlcnZhbFNlY29uZHMpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZpc2hTcGF3blRpbWVyID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwYXduRmlzaCgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIE1hbmFnZSBvdXRjb21lIGRpc3BsYXlcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmNhdWdodEZpc2hOYW1lICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vdXRjb21lRGlzcGxheVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5vdXRjb21lRGlzcGxheVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jYXVnaHRGaXNoTmFtZSA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGZvciBiaXRlIG9ubHkgaWYgbm8gb3V0Y29tZSBpcyBjdXJyZW50bHkgZGlzcGxheWVkXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jYXVnaHRGaXNoTmFtZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpc2hOZWFyQm9iYmVyID0gdGhpcy5maXNoZXMuZmlsdGVyKGZpc2ggPT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgTWF0aC5hYnMoZmlzaC54IC0gdGhpcy5ib2JiZXIueCkgPCBmaXNoLndpZHRoIC8gMiArIHRoaXMuYm9iYmVyLndpZHRoIC8gMiAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBNYXRoLmFicyhmaXNoLnkgLSB0aGlzLmJvYmJlci55KSA8IGZpc2guaGVpZ2h0IC8gMiArIHRoaXMuYm9iYmVyLmhlaWdodCAvIDJcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoZmlzaE5lYXJCb2JiZXIubGVuZ3RoID4gMCAmJiBNYXRoLnJhbmRvbSgpIDwgZGVsdGFUaW1lICogMC41KSB7IC8vIDUwJSBjaGFuY2UgcGVyIHNlY29uZCBmb3IgYSBiaXRlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLlJFRUxJTkdfTUlOSUdBTUU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnBsYXlTb3VuZCgnYml0ZScpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmluaXRNaW5pR2FtZShmaXNoTmVhckJvYmJlclswXS5kYXRhKTsgLy8gVXNlIHRoZSBmaXJzdCBmaXNoIHRoYXQgYml0XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlJFRUxJTkdfTUlOSUdBTUU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1pbmlHYW1lVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMubWluaUdhbWVUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZXNvbHZlTWluaUdhbWUoKTsgLy8gVGltZSdzIHVwLCByZXNvbHZlIGJhc2VkIG9uIHN1Y2Nlc3MvZmFpbHVyZVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIERlY2F5IHN1Y2Nlc3Mgb3ZlciB0aW1lXHJcbiAgICAgICAgICAgICAgICB0aGlzLm1pbmlHYW1lU3VjY2VzcyA9IE1hdGgubWF4KDAsIHRoaXMubWluaUdhbWVTdWNjZXNzIC0gdGhpcy5jb25maWcubWluaUdhbWVEZWNheVJhdGUgKiBkZWx0YVRpbWUpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBwb2ludGVyIHBvc2l0aW9uIChtb3ZlcyBsZWZ0L3JpZ2h0KVxyXG4gICAgICAgICAgICAgICAgdGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiArPSB0aGlzLmNvbmZpZy5taW5pR2FtZUJhc2VQb2ludGVyU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiA+IDEgfHwgdGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiA8IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcubWluaUdhbWVCYXNlUG9pbnRlclNwZWVkICo9IC0xOyAvLyBSZXZlcnNlIGRpcmVjdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPSBNYXRoLm1heCgtMSwgTWF0aC5taW4oMSwgdGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbikpOyAvLyBDbGFtcFxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHBvaW50ZXIgaXMgb3V0c2lkZSB0YXJnZXQgem9uZVxyXG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0Wm9uZVN0YXJ0ID0gdGhpcy5taW5pR2FtZVRhcmdldFpvbmVDZW50ZXIgLSB0aGlzLmNvbmZpZy5taW5pR2FtZVRhcmdldFpvbmVXaWR0aCAvIDI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRab25lRW5kID0gdGhpcy5taW5pR2FtZVRhcmdldFpvbmVDZW50ZXIgKyB0aGlzLmNvbmZpZy5taW5pR2FtZVRhcmdldFpvbmVXaWR0aCAvIDI7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKCEodGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiA+PSB0YXJnZXRab25lU3RhcnQgJiYgdGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiA8PSB0YXJnZXRab25lRW5kKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWluaUdhbWVGYWlsdXJlICs9IGRlbHRhVGltZTsgLy8gRmFpbHVyZSBpbmNyZWFzZXMgb3ZlciB0aW1lIG91dHNpZGUgem9uZVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLm1pbmlHYW1lRmFpbHVyZSA+PSB0aGlzLmNvbmZpZy5taW5pR2FtZUZhaWx1cmVUaHJlc2hvbGQpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc29sdmVNaW5pR2FtZShmYWxzZSk7IC8vIEZvcmNlZCBmYWlsIGlmIGZhaWx1cmUgdGhyZXNob2xkIHJlYWNoZWRcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5taW5pR2FtZVN1Y2Nlc3MgPj0gdGhpcy5jb25maWcubWluaUdhbWVTdWNjZXNzVGFyZ2V0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZXNvbHZlTWluaUdhbWUodHJ1ZSk7IC8vIEZvcmNlZCBzdWNjZXNzIGlmIHN1Y2Nlc3MgdGFyZ2V0IHJlYWNoZWRcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNwYXducyBhIG5ldyBmaXNoIGF0IGEgcmFuZG9tIHBvc2l0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNwYXduRmlzaCgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmaXNoQ29uZmlnID0gdGhpcy5jb25maWcuZmlzaGVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRoaXMuY29uZmlnLmZpc2hlcy5sZW5ndGgpXTtcclxuICAgICAgICBjb25zdCBzcGF3blggPSBNYXRoLnJhbmRvbSgpICogdGhpcy5jYW52YXMud2lkdGg7XHJcbiAgICAgICAgLy8gQ29ycmVjdGVkOiBGaXNoIHNob3VsZCBzcGF3biBhcm91bmQgdGhlIGJvYmJlcidzIFkgcG9zaXRpb24gdG8gYWxsb3cgZm9yIHZlcnRpY2FsIGludGVyYWN0aW9uXHJcbiAgICAgICAgY29uc3Qgc3Bhd25ZID0gdGhpcy5ib2JiZXIueSArIChNYXRoLnJhbmRvbSgpICogMTAwIC0gNTApOyAvLyArLy0gNTBweCBmcm9tIGJvYmJlciBZXHJcbiAgICAgICAgY29uc3QgbmV3RmlzaCA9IG5ldyBGaXNoKFxyXG4gICAgICAgICAgICBzcGF3blgsXHJcbiAgICAgICAgICAgIHNwYXduWSxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZmlzaERlZmF1bHRXaWR0aCxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZmlzaERlZmF1bHRIZWlnaHQsXHJcbiAgICAgICAgICAgIGZpc2hDb25maWdcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMuZmlzaGVzLnB1c2gobmV3RmlzaCk7XHJcblxyXG4gICAgICAgIC8vIExpbWl0IHRoZSBudW1iZXIgb2YgZmlzaCBvbiBzY3JlZW5cclxuICAgICAgICBpZiAodGhpcy5maXNoZXMubGVuZ3RoID4gdGhpcy5jb25maWcubWF4RmlzaE9uU2NyZWVuKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZmlzaGVzLnNoaWZ0KCk7IC8vIFJlbW92ZSB0aGUgb2xkZXN0IGZpc2hcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJbml0aWFsaXplcyB0aGUgcmVlbGluZyBtaW5pLWdhbWUuXHJcbiAgICAgKiBAcGFyYW0gZmlzaERhdGEgLSBUaGUgZGF0YSBvZiB0aGUgZmlzaCB0aGF0IGluaXRpYXRlZCB0aGUgbWluaS1nYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGluaXRNaW5pR2FtZShmaXNoRGF0YTogRmlzaERhdGEpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm1pbmlHYW1lU3VjY2VzcyA9IDA7XHJcbiAgICAgICAgdGhpcy5taW5pR2FtZUZhaWx1cmUgPSAwO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVUaW1lciA9IHRoaXMuY29uZmlnLm1pbmlHYW1lRHVyYXRpb25TZWNvbmRzO1xyXG4gICAgICAgIHRoaXMubWluaUdhbWVQb2ludGVyUG9zaXRpb24gPSAwOyAvLyBTdGFydCBwb2ludGVyIGF0IGNlbnRlclxyXG4gICAgICAgIHRoaXMubWluaUdhbWVUYXJnZXRab25lQ2VudGVyID0gKE1hdGgucmFuZG9tKCkgKiAxLjYpIC0gMC44OyAvLyBSYW5kb20gcG9zaXRpb24gYmV0d2VlbiAtMC44IGFuZCAwLjhcclxuICAgICAgICB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSA9IGZpc2hEYXRhO1xyXG5cclxuICAgICAgICAvLyBBZGp1c3QgbWluaS1nYW1lIHBhcmFtZXRlcnMgYmFzZWQgb24gZmlzaCBkaWZmaWN1bHR5XHJcbiAgICAgICAgdGhpcy5jb25maWcubWluaUdhbWVCYXNlUG9pbnRlclNwZWVkID0gMS4wICsgKGZpc2hEYXRhLm1pbmlHYW1lRGlmZmljdWx0eSAqIDAuNSk7XHJcbiAgICAgICAgLy8gUmFuZG9taXplIGluaXRpYWwgcG9pbnRlciBzcGVlZCBkaXJlY3Rpb25cclxuICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA8IDAuNSkgeyB0aGlzLmNvbmZpZy5taW5pR2FtZUJhc2VQb2ludGVyU3BlZWQgKj0gLTE7IH1cclxuICAgICAgICB0aGlzLmNvbmZpZy5taW5pR2FtZURlY2F5UmF0ZSA9IDAuOCArIChmaXNoRGF0YS5taW5pR2FtZURpZmZpY3VsdHkgKiAwLjIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVzb2x2ZXMgdGhlIG1pbmktZ2FtZSwgZGV0ZXJtaW5pbmcgaWYgdGhlIGZpc2ggd2FzIGNhdWdodCBvciBsb3N0LlxyXG4gICAgICogQHBhcmFtIGZvcmNlZE91dGNvbWUgLSBPcHRpb25hbCBib29sZWFuIHRvIGZvcmNlIGEgc3VjY2VzcyBvciBmYWlsdXJlIChlLmcuLCBpZiB0YXJnZXQvdGhyZXNob2xkIHJlYWNoZWQgZWFybHkpLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHJlc29sdmVNaW5pR2FtZShmb3JjZWRPdXRjb21lPzogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGNhdWdodCA9IGZvcmNlZE91dGNvbWUgIT09IHVuZGVmaW5lZCA/IGZvcmNlZE91dGNvbWUgOiAodGhpcy5taW5pR2FtZVN1Y2Nlc3MgPj0gdGhpcy5jb25maWcubWluaUdhbWVTdWNjZXNzVGFyZ2V0KTtcclxuXHJcbiAgICAgICAgaWYgKGNhdWdodCAmJiB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSkge1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lLnNjb3JlO1xyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2NhdGNoJyk7XHJcbiAgICAgICAgICAgIHRoaXMuY2F1Z2h0RmlzaE5hbWUgPSB0aGlzLmNvbmZpZy51aS5maXNoQ2F1Z2h0OyAvLyBEaXNwbGF5IFwiQ2F1Z2h0IVwiIG1lc3NhZ2VcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIHRoZSBzcGVjaWZpYyBmaXNoIHRoYXQgd2FzIGNhdWdodCBmcm9tIHRoZSBsaXN0IG9mIGFjdGl2ZSBmaXNoXHJcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5maXNoZXMuZmluZEluZGV4KGYgPT4gZi5kYXRhLm5hbWUgPT09IHRoaXMuY3VycmVudEZpc2hJbk1pbmlnYW1lIS5uYW1lKTtcclxuICAgICAgICAgICAgaWYgKGluZGV4ID4gLTEpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlzaGVzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5wbGF5U291bmQoJ2ZhaWwnKTtcclxuICAgICAgICAgICAgdGhpcy5jYXVnaHRGaXNoTmFtZSA9IHRoaXMuY29uZmlnLnVpLmZpc2hMb3N0OyAvLyBEaXNwbGF5IFwiTG9zdCFcIiBtZXNzYWdlXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRGaXNoSW5NaW5pZ2FtZSA9IHVuZGVmaW5lZDsgLy8gQ2xlYXIgZmlzaCBpbiBtaW5pLWdhbWVcclxuICAgICAgICB0aGlzLm91dGNvbWVEaXNwbGF5VGltZXIgPSAyOyAvLyBEaXNwbGF5IG1lc3NhZ2UgZm9yIDIgc2Vjb25kc1xyXG4gICAgICAgIHRoaXMuY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLldBSVRJTkdfRk9SX0JJVEU7IC8vIFJldHVybiB0byB3YWl0aW5nXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBEcmF3cyBhbGwgZ2FtZSBlbGVtZW50cyB0byB0aGUgY2FudmFzIGJhc2VkIG9uIHRoZSBjdXJyZW50IGdhbWUgc3RhdGUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgYmFja2dyb3VuZCBmaXJzdCBmb3IgYWxsIHN0YXRlcyAoZXhjZXB0IGxvYWRpbmcpXHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdiYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgaWYgKGJhY2tncm91bmQpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJhY2tncm91bmQsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmN1cnJlbnRTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5MT0FESU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVFVUT1JJQUxfU0NSRUVOOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VHV0b3JpYWxTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5XQUlUSU5HX0ZPUl9CSVRFOlxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5SRUVMSU5HX01JTklHQU1FOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZXBsYXkoKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnRTdGF0ZSA9PT0gR2FtZVN0YXRlLlJFRUxJTkdfTUlOSUdBTUUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdNaW5pR2FtZVVJKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jYXVnaHRGaXNoTmFtZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd091dGNvbWVNZXNzYWdlKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZXBsYXkoKTsgLy8gRHJhdyBnYW1lIHNjZW5lIGJlaGluZCBnYW1lIG92ZXIgc2NyZWVuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0xvYWRpbmdTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudWkubG9hZGluZ30gJHtNYXRoLnJvdW5kKHRoaXMuYXNzZXRNYW5hZ2VyLmdldExvYWRpbmdQcm9ncmVzcygpICogMTAwKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjUpJzsgLy8gU2VtaS10cmFuc3BhcmVudCBvdmVybGF5XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0OHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS50aXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnByZXNzU3BhY2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUdXRvcmlhbFNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjUpJzsgLy8gU2VtaS10cmFuc3BhcmVudCBvdmVybGF5XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczMHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnXHVDODcwXHVDNzkxXHVCQzk1JywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMTIwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyMHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS50dXRvcmlhbExpbmUxLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA2MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkudHV0b3JpYWxMaW5lMiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMzApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnR1dG9yaWFsTGluZTMsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkudHV0b3JpYWxMaW5lNCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMzApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnByZXNzU3BhY2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZXBsYXkoKTogdm9pZCB7XHJcbiAgICAgICAgLy8gRHJhdyBib2F0XHJcbiAgICAgICAgY29uc3QgYm9hdCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdib2F0Jyk7XHJcbiAgICAgICAgaWYgKGJvYXQpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJvYXQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCAvIDIgLSBib2F0LndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmluaXRpYWxCb2JiZXJZICogdGhpcy5jYW52YXMuaGVpZ2h0IC0gYm9hdC5oZWlnaHQgKyAyMCwgLy8gUG9zaXRpb24gYm9hdCBzbGlnaHRseSBhYm92ZSB0aGUgd2F0ZXIgbGluZVxyXG4gICAgICAgICAgICAgICAgYm9hdC53aWR0aCxcclxuICAgICAgICAgICAgICAgIGJvYXQuaGVpZ2h0XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IGZpc2hpbmcgbGluZSAoZnJvbSBib2F0IHRvIGJvYmJlcilcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMjtcclxuICAgICAgICB0aGlzLmN0eC5iZWdpblBhdGgoKTtcclxuICAgICAgICAvLyBMaW5lIHN0YXJ0cyBmcm9tIGEgcG9pbnQgb24gdGhlIGJvYXQgd2hlcmUgdGhlIGZpc2hpbmcgcm9kIG1pZ2h0IGJlXHJcbiAgICAgICAgdGhpcy5jdHgubW92ZVRvKHRoaXMuY2FudmFzLndpZHRoIC8gMiArIDMwLCB0aGlzLmNvbmZpZy5pbml0aWFsQm9iYmVyWSAqIHRoaXMuY2FudmFzLmhlaWdodCAtIGJvYXQhLmhlaWdodCAvIDIgKyAyMCk7XHJcbiAgICAgICAgdGhpcy5jdHgubGluZVRvKHRoaXMuYm9iYmVyLngsIHRoaXMuYm9iYmVyLnkpO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmJvYmJlci5kcmF3KHRoaXMuY3R4LCB0aGlzLmFzc2V0TWFuYWdlcik7XHJcbiAgICAgICAgdGhpcy5maXNoZXMuZm9yRWFjaChmaXNoID0+IGZpc2guZHJhdyh0aGlzLmN0eCwgdGhpcy5hc3NldE1hbmFnZXIpKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBVSSBlbGVtZW50cyAoc2NvcmUsIHRpbWVyKVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudWkuc2NvcmVQcmVmaXh9JHt0aGlzLnNjb3JlfWAsIDEwLCAzMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudWkudGltZVJlbWFpbmluZ1ByZWZpeH0ke01hdGguY2VpbCh0aGlzLmdhbWVUaW1lcil9YCwgMTAsIDYwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdNaW5pR2FtZVVJKCk6IHZvaWQge1xyXG4gICAgICAgIC8vIERyYXcgYmFja2dyb3VuZCBvdmVybGF5IGZvciBtaW5pLWdhbWVcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCB0aGlzLmNhbnZhcy5oZWlnaHQgLSAxNTAsIHRoaXMuY2FudmFzLndpZHRoLCAxNTApOyAvLyBCb3R0b20gYmFyIGFyZWFcclxuXHJcbiAgICAgICAgY29uc3QgYmFyWSA9IHRoaXMuY2FudmFzLmhlaWdodCAtIDEwMDtcclxuICAgICAgICBjb25zdCBiYXJIZWlnaHQgPSAzMDtcclxuICAgICAgICBjb25zdCBiYXJXaWR0aCA9IHRoaXMuY2FudmFzLndpZHRoICogMC44O1xyXG4gICAgICAgIGNvbnN0IGJhclggPSAodGhpcy5jYW52YXMud2lkdGggLSBiYXJXaWR0aCkgLyAyO1xyXG5cclxuICAgICAgICAvLyBEcmF3IG1pbmktZ2FtZSBiYXIgYmFja2dyb3VuZFxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjMzMzJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChiYXJYLCBiYXJZLCBiYXJXaWR0aCwgYmFySGVpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyB0YXJnZXQgem9uZVxyXG4gICAgICAgIGNvbnN0IHRhcmdldFpvbmVXaWR0aFB4ID0gYmFyV2lkdGggKiB0aGlzLmNvbmZpZy5taW5pR2FtZVRhcmdldFpvbmVXaWR0aDtcclxuICAgICAgICBjb25zdCB0YXJnZXRab25lWCA9IGJhclggKyAodGhpcy5taW5pR2FtZVRhcmdldFpvbmVDZW50ZXIgKiAoYmFyV2lkdGggLyAyKSkgKyAoYmFyV2lkdGggLyAyKSAtICh0YXJnZXRab25lV2lkdGhQeCAvIDIpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDI1NSwgMCwgMC41KSc7IC8vIEdyZWVuIHRhcmdldCB6b25lXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QodGFyZ2V0Wm9uZVgsIGJhclksIHRhcmdldFpvbmVXaWR0aFB4LCBiYXJIZWlnaHQpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IHBvaW50ZXJcclxuICAgICAgICBjb25zdCBwb2ludGVyWCA9IGJhclggKyAodGhpcy5taW5pR2FtZVBvaW50ZXJQb3NpdGlvbiAqIChiYXJXaWR0aCAvIDIpKSArIChiYXJXaWR0aCAvIDIpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd5ZWxsb3cnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHBvaW50ZXJYIC0gNSwgYmFyWSAtIDEwLCAxMCwgYmFySGVpZ2h0ICsgMjApOyAvLyBQb2ludGVyIHdpZGVyIGFuZCB0YWxsZXJcclxuXHJcbiAgICAgICAgLy8gRHJhdyBzdWNjZXNzIGJhclxyXG4gICAgICAgIGNvbnN0IHN1Y2Nlc3NCYXJXaWR0aCA9ICh0aGlzLm1pbmlHYW1lU3VjY2VzcyAvIHRoaXMuY29uZmlnLm1pbmlHYW1lU3VjY2Vzc1RhcmdldCkgKiBiYXJXaWR0aDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmx1ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYmFyWCwgYmFyWSArIGJhckhlaWdodCArIDEwLCBzdWNjZXNzQmFyV2lkdGgsIDEwKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBmYWlsdXJlIGJhclxyXG4gICAgICAgIGNvbnN0IGZhaWx1cmVCYXJXaWR0aCA9ICh0aGlzLm1pbmlHYW1lRmFpbHVyZSAvIHRoaXMuY29uZmlnLm1pbmlHYW1lRmFpbHVyZVRocmVzaG9sZCkgKiBiYXJXaWR0aDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChiYXJYLCBiYXJZICsgYmFySGVpZ2h0ICsgMjUsIGZhaWx1cmVCYXJXaWR0aCwgMTApO1xyXG5cclxuICAgICAgICAvLyBEaXNwbGF5IGluc3RydWN0aW9ucyBhbmQgdGltZXJcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjhweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWkucmVlbEluc3RydWN0aW9uLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIGJhclkgLSAzMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5jb25maWcudWkucmVlbFRpbWV9JHtNYXRoLmNlaWwodGhpcy5taW5pR2FtZVRpbWVyKX1zYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCBiYXJZICsgYmFySGVpZ2h0ICsgNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd091dGNvbWVNZXNzYWdlKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmNhdWdodEZpc2hOYW1lKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNiknO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTAsIHRoaXMuY2FudmFzLndpZHRoLCAxMDApO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQwcHggQXJpYWwnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jYXVnaHRGaXNoTmFtZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJzsgLy8gRGFyayBvdmVybGF5XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc2MHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aS5nYW1lT3ZlciwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gODApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzM2cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpLnNjb3JlUHJlZml4fSR7dGhpcy5zY29yZX1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpLnByZXNzU3BhY2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDgwKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gSW5pdGlhbGl6ZSB0aGUgZ2FtZSB3aGVuIHRoZSBET00gaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgaWYgKCFjYW52YXMpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCAnZ2FtZUNhbnZhcycgbm90IGZvdW5kIVwiKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICBpZiAoIWN0eCkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gZ2V0IDJEIHJlbmRlcmluZyBjb250ZXh0IGZvciBjYW52YXMhXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBnYW1lID0gbmV3IEdhbWUoY2FudmFzLCBjdHgpO1xyXG4gICAgZ2FtZS5zdGFydCgpO1xyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBd0VBLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUtKLE1BQU0sYUFBYTtBQUFBLEVBQW5CO0FBQ0ksa0JBQXdDLG9CQUFJLElBQUk7QUFDaEQsa0JBQXdDLG9CQUFJLElBQUk7QUFDaEQsdUJBQWM7QUFDZCx1QkFBYztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1kLE1BQU0sV0FBVyxRQUE2QztBQUMxRCxTQUFLLGNBQWMsT0FBTyxPQUFPLFNBQVMsT0FBTyxPQUFPO0FBQ3hELFVBQU0sV0FBNEIsQ0FBQztBQUVuQyxlQUFXLGFBQWEsT0FBTyxRQUFRO0FBQ25DLGVBQVMsS0FBSyxLQUFLLFVBQVUsU0FBUyxDQUFDO0FBQUEsSUFDM0M7QUFDQSxlQUFXLGVBQWUsT0FBTyxRQUFRO0FBQ3JDLGVBQVMsS0FBSyxLQUFLLFVBQVUsV0FBVyxDQUFDO0FBQUEsSUFDN0M7QUFFQSxVQUFNLFFBQVEsSUFBSSxRQUFRO0FBQUEsRUFDOUI7QUFBQSxFQUVRLFVBQVUsUUFBd0M7QUFDdEQsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDcEMsWUFBTSxNQUFNLElBQUksTUFBTTtBQUN0QixVQUFJLE1BQU0sT0FBTztBQUNqQixVQUFJLFNBQVMsTUFBTTtBQUNmLGFBQUssT0FBTyxJQUFJLE9BQU8sTUFBTSxHQUFHO0FBQ2hDLGFBQUs7QUFDTCxnQkFBUTtBQUFBLE1BQ1o7QUFDQSxVQUFJLFVBQVUsTUFBTTtBQUNoQixnQkFBUSxNQUFNLHlCQUF5QixPQUFPLElBQUksRUFBRTtBQUNwRCxlQUFPO0FBQUEsTUFDWDtBQUFBLElBQ0osQ0FBQztBQUFBLEVBQ0w7QUFBQSxFQUVRLFVBQVUsUUFBd0M7QUFDdEQsV0FBTyxJQUFJLFFBQVEsQ0FBQyxZQUFZO0FBQzVCLFlBQU0sUUFBUSxJQUFJLE1BQU0sT0FBTyxJQUFJO0FBQ25DLFlBQU0sU0FBUyxPQUFPO0FBQ3RCLFlBQU0sVUFBVTtBQUNoQixZQUFNLG1CQUFtQixNQUFNO0FBQzNCLGFBQUssT0FBTyxJQUFJLE9BQU8sTUFBTSxLQUFLO0FBQ2xDLGFBQUs7QUFDTCxnQkFBUTtBQUFBLE1BQ1o7QUFDQSxZQUFNLFVBQVUsTUFBTTtBQUNsQixnQkFBUSxLQUFLLHlCQUF5QixPQUFPLElBQUksRUFBRTtBQUNuRCxhQUFLO0FBQ0wsZ0JBQVE7QUFBQSxNQUNaO0FBQUEsSUFDSixDQUFDO0FBQUEsRUFDTDtBQUFBLEVBRUEsU0FBUyxNQUE0QztBQUNqRCxXQUFPLEtBQUssT0FBTyxJQUFJLElBQUk7QUFBQSxFQUMvQjtBQUFBLEVBRUEsVUFBVSxNQUFjLE9BQWdCLE9BQU8sUUFBK0M7QUFDMUYsVUFBTSxRQUFRLEtBQUssT0FBTyxJQUFJLElBQUk7QUFDbEMsUUFBSSxPQUFPO0FBQ1AsWUFBTSxRQUFRLE1BQU0sVUFBVTtBQUM5QixZQUFNLE9BQU87QUFDYixZQUFNLFNBQVMsV0FBVyxTQUFZLFNBQVMsTUFBTTtBQUNyRCxZQUFNLEtBQUssRUFBRSxNQUFNLE9BQUssUUFBUSxLQUFLLHlCQUF5QixJQUFJLEtBQUssQ0FBQyxDQUFDO0FBQ3pFLGFBQU87QUFBQSxJQUNYO0FBQ0EsV0FBTztBQUFBLEVBQ1g7QUFBQSxFQUVBLFVBQVUsT0FBeUI7QUFDL0IsVUFBTSxNQUFNO0FBQ1osVUFBTSxjQUFjO0FBQUEsRUFDeEI7QUFBQSxFQUVBLHFCQUE2QjtBQUN6QixXQUFPLEtBQUssY0FBYyxJQUFJLEtBQUssY0FBYyxLQUFLLGNBQWM7QUFBQSxFQUN4RTtBQUNKO0FBS0EsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBTkMsU0FBQUE7QUFBQSxHQUFBO0FBWUwsTUFBTSxPQUFPO0FBQUEsRUFPVCxZQUFZLEdBQVcsR0FBVyxPQUFlLFFBQWdCLFdBQW1CO0FBQ2hGLFNBQUssSUFBSTtBQUNULFNBQUssSUFBSTtBQUNULFNBQUssUUFBUTtBQUNiLFNBQUssU0FBUztBQUNkLFNBQUssWUFBWTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxLQUFLQyxNQUErQixjQUE0QjtBQUM1RCxVQUFNLE1BQU0sYUFBYSxTQUFTLEtBQUssU0FBUztBQUNoRCxRQUFJLEtBQUs7QUFDTCxNQUFBQSxLQUFJLFVBQVUsS0FBSyxLQUFLLElBQUksS0FBSyxRQUFRLEdBQUcsS0FBSyxJQUFJLEtBQUssU0FBUyxHQUFHLEtBQUssT0FBTyxLQUFLLE1BQU07QUFBQSxJQUNqRztBQUFBLEVBQ0o7QUFDSjtBQUtBLE1BQU0sS0FBSztBQUFBO0FBQUEsRUFVUCxZQUFZLEdBQVcsR0FBVyxPQUFlLFFBQWdCLE1BQWdCO0FBQzdFLFNBQUssSUFBSTtBQUNULFNBQUssSUFBSTtBQUNULFNBQUssUUFBUTtBQUNiLFNBQUssU0FBUztBQUNkLFNBQUssWUFBWSxLQUFLO0FBQ3RCLFNBQUssUUFBUSxLQUFLO0FBQ2xCLFNBQUssT0FBTztBQUNaLFNBQUssWUFBWSxLQUFLLE9BQU8sSUFBSSxNQUFNLEtBQUs7QUFBQSxFQUNoRDtBQUFBLEVBRUEsT0FBTyxXQUFtQixhQUFxQixTQUFpQjtBQUM1RCxTQUFLLEtBQUssS0FBSyxRQUFRLEtBQUssWUFBWTtBQUd4QyxRQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxhQUFhO0FBQ3BDLFdBQUssYUFBYTtBQUNsQixXQUFLLElBQUksS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLGFBQWEsS0FBSyxDQUFDLENBQUM7QUFBQSxJQUN0RDtBQUdBLFVBQU0sbUJBQW1CLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTztBQUNsRCxRQUFJLG1CQUFtQixLQUFLO0FBQ3hCLFlBQU0sZ0JBQWlCLFVBQVUsS0FBSyxJQUFJLElBQUssSUFBSTtBQUNuRCxXQUFLLEtBQUssZ0JBQWdCLEtBQUssUUFBUSxhQUFhLElBQUksbUJBQW1CLE9BQU87QUFBQSxJQUN0RjtBQUFBLEVBQ0o7QUFBQSxFQUVBLEtBQUtBLE1BQStCLGNBQTRCO0FBQzVELFVBQU0sTUFBTSxhQUFhLFNBQVMsS0FBSyxTQUFTO0FBQ2hELFFBQUksS0FBSztBQUNMLE1BQUFBLEtBQUksS0FBSztBQUNULE1BQUFBLEtBQUksVUFBVSxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBRTVCLFVBQUksS0FBSyxjQUFjLElBQUk7QUFDdkIsUUFBQUEsS0FBSSxNQUFNLElBQUksQ0FBQztBQUFBLE1BQ25CO0FBQ0EsTUFBQUEsS0FBSSxVQUFVLEtBQUssQ0FBQyxLQUFLLFFBQVEsR0FBRyxDQUFDLEtBQUssU0FBUyxHQUFHLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDN0UsTUFBQUEsS0FBSSxRQUFRO0FBQUEsSUFDaEI7QUFBQSxFQUNKO0FBQ0o7QUFLQSxNQUFNLEtBQUs7QUFBQTtBQUFBLEVBdUJQLFlBQW9CQyxTQUFtQ0QsTUFBK0I7QUFBbEUsa0JBQUFDO0FBQW1DLGVBQUFEO0FBckJ2RCxTQUFRLGVBQTZCLElBQUksYUFBYTtBQUN0RCxTQUFRLGVBQTBCO0FBQ2xDLFNBQVEsV0FBZ0M7QUFFeEMsU0FBUSxRQUFnQjtBQUN4QixTQUFRLFlBQW9CO0FBQzVCO0FBQUEsU0FBUSxpQkFBeUI7QUFDakM7QUFBQSxTQUFRLFNBQWlCLENBQUM7QUFFMUIsU0FBUSxjQUEyQixvQkFBSSxJQUFJO0FBQzNDLFNBQVEsaUJBQWdDO0FBQ3hDO0FBQUEsU0FBUSxzQkFBOEI7QUFHdEM7QUFBQTtBQUFBLFNBQVEsa0JBQTBCO0FBQ2xDLFNBQVEsa0JBQTBCO0FBQ2xDLFNBQVEsZ0JBQXdCO0FBQ2hDLFNBQVEsMEJBQWtDO0FBQzFDO0FBQUEsU0FBUSwyQkFBbUM7QUF1RTNDO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUSxnQkFBZ0IsQ0FBQyxVQUErQjtBQUNwRCxXQUFLLFlBQVksSUFBSSxNQUFNLElBQUk7QUFFL0IsVUFBSSxNQUFNLFNBQVMsU0FBUztBQUN4QixjQUFNLGVBQWU7QUFFckIsZ0JBQVEsS0FBSyxjQUFjO0FBQUEsVUFDdkIsS0FBSztBQUNELGlCQUFLLGVBQWU7QUFDcEIsaUJBQUssYUFBYSxVQUFVLFFBQVE7QUFDcEM7QUFBQSxVQUNKLEtBQUs7QUFDRCxpQkFBSyxlQUFlO0FBQ3BCLGlCQUFLLGFBQWEsVUFBVSxRQUFRO0FBQ3BDO0FBQUEsVUFDSixLQUFLO0FBRUQ7QUFBQSxVQUNKLEtBQUs7QUFFRCxrQkFBTSxrQkFBa0IsS0FBSywyQkFBMkIsS0FBSyxPQUFPLDBCQUEwQjtBQUM5RixrQkFBTSxnQkFBZ0IsS0FBSywyQkFBMkIsS0FBSyxPQUFPLDBCQUEwQjtBQUM1RixnQkFBSSxLQUFLLDJCQUEyQixtQkFBbUIsS0FBSywyQkFBMkIsZUFBZTtBQUNsRyxtQkFBSyxtQkFBbUIsS0FBSyxPQUFPO0FBQUEsWUFDeEM7QUFDQSxpQkFBSyxhQUFhLFVBQVUsUUFBUSxPQUFPLEdBQUc7QUFDOUM7QUFBQSxVQUNKLEtBQUs7QUFDRCxpQkFBSyxTQUFTO0FBQ2QsaUJBQUssZUFBZTtBQUNwQixpQkFBSyxhQUFhLFVBQVUsUUFBUTtBQUNwQztBQUFBLFFBQ1I7QUFBQSxNQUNKO0FBQUEsSUFDSjtBQU1BO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUSxjQUFjLENBQUMsVUFBK0I7QUFDbEQsV0FBSyxZQUFZLE9BQU8sTUFBTSxJQUFJO0FBQUEsSUFDdEM7QUFNQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsT0FBTyxDQUFDLGdCQUEyQztBQUN2RCxZQUFNLGFBQWEsY0FBYyxLQUFLLFlBQVk7QUFDbEQsV0FBSyxXQUFXO0FBRWhCLFdBQUssT0FBTyxTQUFTO0FBQ3JCLFdBQUssS0FBSztBQUVWLDRCQUFzQixLQUFLLElBQUk7QUFBQSxJQUNuQztBQTFISSxTQUFLLE9BQU8sUUFBUTtBQUNwQixTQUFLLE9BQU8sU0FBUztBQUNyQixXQUFPLGlCQUFpQixXQUFXLEtBQUssYUFBYTtBQUNyRCxXQUFPLGlCQUFpQixTQUFTLEtBQUssV0FBVztBQUFBLEVBQ3JEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxNQUFNLFFBQXVCO0FBQ3pCLFVBQU0sS0FBSyxXQUFXO0FBQ3RCLFNBQUssU0FBUztBQUNkLFNBQUssS0FBSyxDQUFDO0FBQUEsRUFDZjtBQUFBLEVBRUEsTUFBYyxhQUE0QjtBQUN0QyxRQUFJO0FBQ0EsWUFBTSxXQUFXLE1BQU0sTUFBTSxXQUFXO0FBQ3hDLFdBQUssU0FBUyxNQUFNLFNBQVMsS0FBSztBQUNsQyxXQUFLLE9BQU8sUUFBUSxLQUFLLE9BQU87QUFDaEMsV0FBSyxPQUFPLFNBQVMsS0FBSyxPQUFPO0FBQ2pDLFlBQU0sS0FBSyxhQUFhLFdBQVcsS0FBSyxPQUFPLE1BQU07QUFDckQsV0FBSyxlQUFlO0FBQUEsSUFDeEIsU0FBUyxPQUFPO0FBQ1osY0FBUSxNQUFNLGdEQUFnRCxLQUFLO0FBRW5FLFdBQUssZUFBZTtBQUFBLElBQ3hCO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsV0FBaUI7QUFDckIsU0FBSyxRQUFRO0FBQ2IsU0FBSyxZQUFZLEtBQUssT0FBTztBQUM3QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLFNBQVMsQ0FBQztBQUNmLFNBQUssU0FBUyxJQUFJO0FBQUEsTUFDZCxLQUFLLE9BQU8saUJBQWlCLEtBQUssT0FBTztBQUFBLE1BQ3pDLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxPQUFPO0FBQUEsTUFDekMsS0FBSyxPQUFPO0FBQUEsTUFDWixLQUFLLE9BQU87QUFBQSxNQUNaO0FBQUEsSUFDSjtBQUdBLFFBQUksS0FBSyxVQUFVO0FBQ2YsV0FBSyxhQUFhLFVBQVUsS0FBSyxRQUFRO0FBQUEsSUFDN0M7QUFDQSxTQUFLLFdBQVcsS0FBSyxhQUFhLFVBQVUsT0FBTyxNQUFNLEtBQUssT0FBTyxPQUFPLE9BQU8sS0FBSyxPQUFLLEVBQUUsU0FBUyxLQUFLLEdBQUcsTUFBTTtBQUd0SCxTQUFLLGtCQUFrQjtBQUN2QixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLGdCQUFnQjtBQUNyQixTQUFLLDBCQUEwQjtBQUMvQixTQUFLLDJCQUEyQjtBQUNoQyxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLHNCQUFzQjtBQUFBLEVBQy9CO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQW9FUSxPQUFPLFdBQXlCO0FBQ3BDLFFBQUksS0FBSyxpQkFBaUIsZ0JBQW1CO0FBRzdDLFFBQUksS0FBSyxZQUFZLEtBQUssU0FBUyxVQUFVLEtBQUssaUJBQWlCLHdCQUEwQixLQUFLLGlCQUFpQix5QkFBMkI7QUFDekksV0FBSyxTQUFTLEtBQUssRUFBRSxNQUFNLE9BQUssUUFBUSxLQUFLLHlCQUF5QixDQUFDLENBQUM7QUFBQSxJQUM3RTtBQUVBLFlBQVEsS0FBSyxjQUFjO0FBQUEsTUFDdkIsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUVEO0FBQUEsTUFDSixLQUFLO0FBQ0QsYUFBSyxhQUFhO0FBQ2xCLFlBQUksS0FBSyxhQUFhLEdBQUc7QUFDckIsZUFBSyxlQUFlO0FBQ3BCLGNBQUksS0FBSyxTQUFVLE1BQUssYUFBYSxVQUFVLEtBQUssUUFBUTtBQUM1RCxlQUFLLGFBQWEsVUFBVSxlQUFlO0FBQzNDO0FBQUEsUUFDSjtBQUdBLGFBQUssT0FBTyxRQUFRLFVBQVEsS0FBSyxPQUFPLFlBQVksS0FBSyxPQUFPLHlCQUF5QixLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBRzFILGFBQUssa0JBQWtCO0FBQ3ZCLFlBQUksS0FBSyxrQkFBa0IsS0FBSyxPQUFPLDBCQUEwQjtBQUM3RCxlQUFLLGlCQUFpQjtBQUN0QixlQUFLLFVBQVU7QUFBQSxRQUNuQjtBQUdBLFlBQUksS0FBSyxtQkFBbUIsTUFBTTtBQUM5QixlQUFLLHVCQUF1QjtBQUM1QixjQUFJLEtBQUssdUJBQXVCLEdBQUc7QUFDL0IsaUJBQUssaUJBQWlCO0FBQUEsVUFDMUI7QUFBQSxRQUNKO0FBR0EsWUFBSSxLQUFLLG1CQUFtQixNQUFNO0FBQzlCLGdCQUFNLGlCQUFpQixLQUFLLE9BQU87QUFBQSxZQUFPLFVBQ3RDLEtBQUssSUFBSSxLQUFLLElBQUksS0FBSyxPQUFPLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxLQUFLLE9BQU8sUUFBUSxLQUN4RSxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssT0FBTyxDQUFDLElBQUksS0FBSyxTQUFTLElBQUksS0FBSyxPQUFPLFNBQVM7QUFBQSxVQUM5RTtBQUVBLGNBQUksZUFBZSxTQUFTLEtBQUssS0FBSyxPQUFPLElBQUksWUFBWSxLQUFLO0FBQzlELGlCQUFLLGVBQWU7QUFDcEIsaUJBQUssYUFBYSxVQUFVLE1BQU07QUFDbEMsaUJBQUssYUFBYSxlQUFlLENBQUMsRUFBRSxJQUFJO0FBQUEsVUFDNUM7QUFBQSxRQUNKO0FBQ0E7QUFBQSxNQUNKLEtBQUs7QUFDRCxhQUFLLGlCQUFpQjtBQUN0QixZQUFJLEtBQUssaUJBQWlCLEdBQUc7QUFDekIsZUFBSyxnQkFBZ0I7QUFDckI7QUFBQSxRQUNKO0FBR0EsYUFBSyxrQkFBa0IsS0FBSyxJQUFJLEdBQUcsS0FBSyxrQkFBa0IsS0FBSyxPQUFPLG9CQUFvQixTQUFTO0FBR25HLGFBQUssMkJBQTJCLEtBQUssT0FBTywyQkFBMkI7QUFDdkUsWUFBSSxLQUFLLDBCQUEwQixLQUFLLEtBQUssMEJBQTBCLElBQUk7QUFDdkUsZUFBSyxPQUFPLDRCQUE0QjtBQUN4QyxlQUFLLDBCQUEwQixLQUFLLElBQUksSUFBSSxLQUFLLElBQUksR0FBRyxLQUFLLHVCQUF1QixDQUFDO0FBQUEsUUFDekY7QUFHQSxjQUFNLGtCQUFrQixLQUFLLDJCQUEyQixLQUFLLE9BQU8sMEJBQTBCO0FBQzlGLGNBQU0sZ0JBQWdCLEtBQUssMkJBQTJCLEtBQUssT0FBTywwQkFBMEI7QUFFNUYsWUFBSSxFQUFFLEtBQUssMkJBQTJCLG1CQUFtQixLQUFLLDJCQUEyQixnQkFBZ0I7QUFDckcsZUFBSyxtQkFBbUI7QUFBQSxRQUM1QjtBQUVBLFlBQUksS0FBSyxtQkFBbUIsS0FBSyxPQUFPLDBCQUEwQjtBQUM5RCxlQUFLLGdCQUFnQixLQUFLO0FBQUEsUUFDOUIsV0FBVyxLQUFLLG1CQUFtQixLQUFLLE9BQU8sdUJBQXVCO0FBQ2xFLGVBQUssZ0JBQWdCLElBQUk7QUFBQSxRQUM3QjtBQUNBO0FBQUEsSUFDUjtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLFlBQWtCO0FBQ3RCLFVBQU0sYUFBYSxLQUFLLE9BQU8sT0FBTyxLQUFLLE1BQU0sS0FBSyxPQUFPLElBQUksS0FBSyxPQUFPLE9BQU8sTUFBTSxDQUFDO0FBQzNGLFVBQU0sU0FBUyxLQUFLLE9BQU8sSUFBSSxLQUFLLE9BQU87QUFFM0MsVUFBTSxTQUFTLEtBQUssT0FBTyxLQUFLLEtBQUssT0FBTyxJQUFJLE1BQU07QUFDdEQsVUFBTSxVQUFVLElBQUk7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLEtBQUssT0FBTztBQUFBLE1BQ1osS0FBSyxPQUFPO0FBQUEsTUFDWjtBQUFBLElBQ0o7QUFDQSxTQUFLLE9BQU8sS0FBSyxPQUFPO0FBR3hCLFFBQUksS0FBSyxPQUFPLFNBQVMsS0FBSyxPQUFPLGlCQUFpQjtBQUNsRCxXQUFLLE9BQU8sTUFBTTtBQUFBLElBQ3RCO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxhQUFhLFVBQTBCO0FBQzNDLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssZ0JBQWdCLEtBQUssT0FBTztBQUNqQyxTQUFLLDBCQUEwQjtBQUMvQixTQUFLLDJCQUE0QixLQUFLLE9BQU8sSUFBSSxNQUFPO0FBQ3hELFNBQUssd0JBQXdCO0FBRzdCLFNBQUssT0FBTywyQkFBMkIsSUFBTyxTQUFTLHFCQUFxQjtBQUU1RSxRQUFJLEtBQUssT0FBTyxJQUFJLEtBQUs7QUFBRSxXQUFLLE9BQU8sNEJBQTRCO0FBQUEsSUFBSTtBQUN2RSxTQUFLLE9BQU8sb0JBQW9CLE1BQU8sU0FBUyxxQkFBcUI7QUFBQSxFQUN6RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxnQkFBZ0IsZUFBK0I7QUFDbkQsVUFBTSxTQUFTLGtCQUFrQixTQUFZLGdCQUFpQixLQUFLLG1CQUFtQixLQUFLLE9BQU87QUFFbEcsUUFBSSxVQUFVLEtBQUssdUJBQXVCO0FBQ3RDLFdBQUssU0FBUyxLQUFLLHNCQUFzQjtBQUN6QyxXQUFLLGFBQWEsVUFBVSxPQUFPO0FBQ25DLFdBQUssaUJBQWlCLEtBQUssT0FBTyxHQUFHO0FBRXJDLFlBQU0sUUFBUSxLQUFLLE9BQU8sVUFBVSxPQUFLLEVBQUUsS0FBSyxTQUFTLEtBQUssc0JBQXVCLElBQUk7QUFDekYsVUFBSSxRQUFRLElBQUk7QUFDWixhQUFLLE9BQU8sT0FBTyxPQUFPLENBQUM7QUFBQSxNQUMvQjtBQUFBLElBQ0osT0FBTztBQUNILFdBQUssYUFBYSxVQUFVLE1BQU07QUFDbEMsV0FBSyxpQkFBaUIsS0FBSyxPQUFPLEdBQUc7QUFBQSxJQUN6QztBQUVBLFNBQUssd0JBQXdCO0FBQzdCLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssZUFBZTtBQUFBLEVBQ3hCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxPQUFhO0FBQ2pCLFNBQUssSUFBSSxVQUFVLEdBQUcsR0FBRyxLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sTUFBTTtBQUc5RCxVQUFNLGFBQWEsS0FBSyxhQUFhLFNBQVMsWUFBWTtBQUMxRCxRQUFJLFlBQVk7QUFDWixXQUFLLElBQUksVUFBVSxZQUFZLEdBQUcsR0FBRyxLQUFLLE9BQU8sT0FBTyxLQUFLLE9BQU8sTUFBTTtBQUFBLElBQzlFO0FBRUEsWUFBUSxLQUFLLGNBQWM7QUFBQSxNQUN2QixLQUFLO0FBQ0QsYUFBSyxrQkFBa0I7QUFDdkI7QUFBQSxNQUNKLEtBQUs7QUFDRCxhQUFLLGdCQUFnQjtBQUNyQjtBQUFBLE1BQ0osS0FBSztBQUNELGFBQUssbUJBQW1CO0FBQ3hCO0FBQUEsTUFDSixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0QsYUFBSyxhQUFhO0FBQ2xCLFlBQUksS0FBSyxpQkFBaUIsMEJBQTRCO0FBQ2xELGVBQUssZUFBZTtBQUFBLFFBQ3hCO0FBQ0EsWUFBSSxLQUFLLG1CQUFtQixNQUFNO0FBQzlCLGVBQUssbUJBQW1CO0FBQUEsUUFDNUI7QUFDQTtBQUFBLE1BQ0osS0FBSztBQUNELGFBQUssYUFBYTtBQUNsQixhQUFLLG1CQUFtQjtBQUN4QjtBQUFBLElBQ1I7QUFBQSxFQUNKO0FBQUEsRUFFUSxvQkFBMEI7QUFDOUIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsR0FBRyxHQUFHLEtBQUssT0FBTyxPQUFPLEtBQUssT0FBTyxNQUFNO0FBQzdELFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFPLEdBQUcsT0FBTyxJQUFJLEtBQUssTUFBTSxLQUFLLGFBQWEsbUJBQW1CLElBQUksR0FBRyxDQUFDLEtBQUssS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxDQUFDO0FBQUEsRUFDN0o7QUFBQSxFQUVRLGtCQUF3QjtBQUM1QixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFFN0QsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsT0FBTyxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksRUFBRTtBQUUxRixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxZQUFZLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBQUEsRUFDbkc7QUFBQSxFQUVRLHFCQUEyQjtBQUMvQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFFN0QsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsc0JBQU8sS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEdBQUc7QUFFNUUsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsZUFBZSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksRUFBRTtBQUNsRyxTQUFLLElBQUksU0FBUyxLQUFLLE9BQU8sR0FBRyxlQUFlLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBQ2xHLFNBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxHQUFHLGVBQWUsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxDQUFDO0FBQzdGLFNBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxHQUFHLGVBQWUsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEVBQUU7QUFFbEcsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsWUFBWSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksR0FBRztBQUFBLEVBQ3BHO0FBQUEsRUFFUSxlQUFxQjtBQUV6QixVQUFNLE9BQU8sS0FBSyxhQUFhLFNBQVMsTUFBTTtBQUM5QyxRQUFJLE1BQU07QUFDTixXQUFLLElBQUk7QUFBQSxRQUFVO0FBQUEsUUFDZixLQUFLLE9BQU8sUUFBUSxJQUFJLEtBQUssUUFBUTtBQUFBLFFBQ3JDLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxPQUFPLFNBQVMsS0FBSyxTQUFTO0FBQUE7QUFBQSxRQUNoRSxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsTUFDVDtBQUFBLElBQ0o7QUFHQSxTQUFLLElBQUksY0FBYztBQUN2QixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksVUFBVTtBQUVuQixTQUFLLElBQUksT0FBTyxLQUFLLE9BQU8sUUFBUSxJQUFJLElBQUksS0FBSyxPQUFPLGlCQUFpQixLQUFLLE9BQU8sU0FBUyxLQUFNLFNBQVMsSUFBSSxFQUFFO0FBQ25ILFNBQUssSUFBSSxPQUFPLEtBQUssT0FBTyxHQUFHLEtBQUssT0FBTyxDQUFDO0FBQzVDLFNBQUssSUFBSSxPQUFPO0FBRWhCLFNBQUssT0FBTyxLQUFLLEtBQUssS0FBSyxLQUFLLFlBQVk7QUFDNUMsU0FBSyxPQUFPLFFBQVEsVUFBUSxLQUFLLEtBQUssS0FBSyxLQUFLLEtBQUssWUFBWSxDQUFDO0FBR2xFLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFPLEdBQUcsV0FBVyxHQUFHLEtBQUssS0FBSyxJQUFJLElBQUksRUFBRTtBQUN0RSxTQUFLLElBQUksU0FBUyxHQUFHLEtBQUssT0FBTyxHQUFHLG1CQUFtQixHQUFHLEtBQUssS0FBSyxLQUFLLFNBQVMsQ0FBQyxJQUFJLElBQUksRUFBRTtBQUFBLEVBQ2pHO0FBQUEsRUFFUSxpQkFBdUI7QUFFM0IsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsR0FBRyxLQUFLLE9BQU8sU0FBUyxLQUFLLEtBQUssT0FBTyxPQUFPLEdBQUc7QUFFckUsVUFBTSxPQUFPLEtBQUssT0FBTyxTQUFTO0FBQ2xDLFVBQU0sWUFBWTtBQUNsQixVQUFNLFdBQVcsS0FBSyxPQUFPLFFBQVE7QUFDckMsVUFBTSxRQUFRLEtBQUssT0FBTyxRQUFRLFlBQVk7QUFHOUMsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsTUFBTSxNQUFNLFVBQVUsU0FBUztBQUdqRCxVQUFNLG9CQUFvQixXQUFXLEtBQUssT0FBTztBQUNqRCxVQUFNLGNBQWMsT0FBUSxLQUFLLDRCQUE0QixXQUFXLEtBQU8sV0FBVyxJQUFNLG9CQUFvQjtBQUNwSCxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxhQUFhLE1BQU0sbUJBQW1CLFNBQVM7QUFHakUsVUFBTSxXQUFXLE9BQVEsS0FBSywyQkFBMkIsV0FBVyxLQUFPLFdBQVc7QUFDdEYsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsV0FBVyxHQUFHLE9BQU8sSUFBSSxJQUFJLFlBQVksRUFBRTtBQUc3RCxVQUFNLGtCQUFtQixLQUFLLGtCQUFrQixLQUFLLE9BQU8sd0JBQXlCO0FBQ3JGLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLE1BQU0sT0FBTyxZQUFZLElBQUksaUJBQWlCLEVBQUU7QUFHbEUsVUFBTSxrQkFBbUIsS0FBSyxrQkFBa0IsS0FBSyxPQUFPLDJCQUE0QjtBQUN4RixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxNQUFNLE9BQU8sWUFBWSxJQUFJLGlCQUFpQixFQUFFO0FBR2xFLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxHQUFHLGlCQUFpQixLQUFLLE9BQU8sUUFBUSxHQUFHLE9BQU8sRUFBRTtBQUVsRixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksU0FBUyxHQUFHLEtBQUssT0FBTyxHQUFHLFFBQVEsR0FBRyxLQUFLLEtBQUssS0FBSyxhQUFhLENBQUMsS0FBSyxLQUFLLE9BQU8sUUFBUSxHQUFHLE9BQU8sWUFBWSxFQUFFO0FBQUEsRUFDakk7QUFBQSxFQUVRLHFCQUEyQjtBQUMvQixRQUFJLEtBQUssZ0JBQWdCO0FBQ3JCLFdBQUssSUFBSSxZQUFZO0FBQ3JCLFdBQUssSUFBSSxTQUFTLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxJQUFJLEtBQUssT0FBTyxPQUFPLEdBQUc7QUFDeEUsV0FBSyxJQUFJLFlBQVk7QUFDckIsV0FBSyxJQUFJLE9BQU87QUFDaEIsV0FBSyxJQUFJLFlBQVk7QUFDckIsV0FBSyxJQUFJLFNBQVMsS0FBSyxnQkFBZ0IsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEVBQUU7QUFBQSxJQUM3RjtBQUFBLEVBQ0o7QUFBQSxFQUVRLHFCQUEyQjtBQUMvQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxHQUFHLEdBQUcsS0FBSyxPQUFPLE9BQU8sS0FBSyxPQUFPLE1BQU07QUFFN0QsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFlBQVk7QUFDckIsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsVUFBVSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksRUFBRTtBQUU3RixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksU0FBUyxHQUFHLEtBQUssT0FBTyxHQUFHLFdBQVcsR0FBRyxLQUFLLEtBQUssSUFBSSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLENBQUM7QUFFN0csU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLEdBQUcsWUFBWSxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksRUFBRTtBQUFBLEVBQ25HO0FBQ0o7QUFHQSxTQUFTLGlCQUFpQixvQkFBb0IsTUFBTTtBQUNoRCxXQUFTLFNBQVMsZUFBZSxZQUFZO0FBQzdDLE1BQUksQ0FBQyxRQUFRO0FBQ1QsWUFBUSxNQUFNLGdEQUFnRDtBQUM5RDtBQUFBLEVBQ0o7QUFDQSxRQUFNLE9BQU8sV0FBVyxJQUFJO0FBQzVCLE1BQUksQ0FBQyxLQUFLO0FBQ04sWUFBUSxNQUFNLGdEQUFnRDtBQUM5RDtBQUFBLEVBQ0o7QUFFQSxTQUFPLElBQUksS0FBSyxRQUFRLEdBQUc7QUFDM0IsT0FBSyxNQUFNO0FBQ2YsQ0FBQzsiLAogICJuYW1lcyI6IFsiR2FtZVN0YXRlIiwgImN0eCIsICJjYW52YXMiXQp9Cg==
