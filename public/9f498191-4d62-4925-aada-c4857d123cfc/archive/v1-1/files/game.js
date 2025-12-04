class AssetManager {
  constructor(assetManifest) {
    this.assetManifest = assetManifest;
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.loadedCount = 0;
    this.totalCount = 0;
    this.onProgress = null;
    this.onComplete = null;
    this.totalCount = assetManifest.images.length + assetManifest.sounds.length;
  }
  setOnProgress(callback) {
    this.onProgress = callback;
  }
  setOnComplete(callback) {
    this.onComplete = callback;
  }
  async loadAll() {
    const imagePromises = this.assetManifest.images.map((imgData) => this.loadImage(imgData));
    const soundPromises = this.assetManifest.sounds.map((soundData) => this.loadSound(soundData));
    await Promise.all([...imagePromises, ...soundPromises]);
    if (this.onComplete) {
      this.onComplete();
    }
  }
  loadImage(imgData) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imgData.path;
      img.onload = () => {
        this.images.set(imgData.name, img);
        this.loadedCount++;
        if (this.onProgress) {
          this.onProgress(this.loadedCount / this.totalCount);
        }
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${imgData.path}`);
        reject(`Failed to load image: ${imgData.path}`);
      };
    });
  }
  loadSound(soundData) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = soundData.path;
      audio.volume = soundData.volume;
      audio.oncanplaythrough = () => {
        this.sounds.set(soundData.name, audio);
        this.loadedCount++;
        if (this.onProgress) {
          this.onProgress(this.loadedCount / this.totalCount);
        }
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${soundData.path}`);
        reject(`Failed to load sound: ${soundData.path}`);
      };
    });
  }
  getImage(name) {
    return this.images.get(name);
  }
  getSound(name) {
    return this.sounds.get(name);
  }
  // Public getter for sounds map, required by AudioPlayer constructor
  getSounds() {
    return this.sounds;
  }
}
class AudioPlayer {
  // Default SFX volume
  constructor(sounds, bgmVolume, sfxVolume) {
    this.currentBGM = null;
    this.bgmVolume = 0.5;
    // Default BGM volume
    this.sfxVolume = 0.7;
    this.sounds = sounds;
    this.bgmVolume = bgmVolume;
    this.sfxVolume = sfxVolume;
  }
  playSFX(name, volume) {
    const sound = this.sounds.get(name);
    if (sound) {
      const sfxInstance = sound.cloneNode();
      sfxInstance.volume = volume !== void 0 ? volume : this.sfxVolume;
      sfxInstance.play().catch((e) => console.warn("SFX playback failed:", e));
    }
  }
  playBGM(name, loop = true, volume) {
    if (this.currentBGM) {
      this.currentBGM.pause();
      this.currentBGM.currentTime = 0;
    }
    const sound = this.sounds.get(name);
    if (sound) {
      this.currentBGM = sound;
      this.currentBGM.loop = loop;
      this.currentBGM.volume = volume !== void 0 ? volume : this.bgmVolume;
      this.currentBGM.play().catch((e) => console.warn("BGM playback failed:", e));
    }
  }
  stopBGM() {
    if (this.currentBGM) {
      this.currentBGM.pause();
      this.currentBGM.currentTime = 0;
      this.currentBGM = null;
    }
  }
  setBGMVolume(volume) {
    this.bgmVolume = volume;
    if (this.currentBGM) {
      this.currentBGM.volume = volume;
    }
  }
  setSFXVolume(volume) {
    this.sfxVolume = volume;
  }
}
class Button {
  constructor(x, y, width, height, text, onClick, imageNormal, imageHover, imageDisabled) {
    this.isHovered = false;
    // Internal property for rendering
    this.enabled = true;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.text = text;
    this.onClick = onClick;
    this.imageNormal = imageNormal;
    this.imageHover = imageHover;
    this.imageDisabled = imageDisabled;
  }
  isClicked(x, y) {
    return this.enabled && x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
  }
  checkHover(x, y) {
    this.isHovered = this.enabled && x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
  }
  draw(ctx, textColor, accentColor) {
    let currentImage = this.imageNormal;
    if (!this.enabled && this.imageDisabled) {
      currentImage = this.imageDisabled;
    } else if (this.isHovered && this.imageHover) {
      currentImage = this.imageHover;
    }
    if (currentImage) {
      ctx.drawImage(currentImage, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = this.enabled ? this.isHovered ? accentColor : "#555" : "#888";
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
    ctx.fillStyle = textColor;
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.text, this.x + this.width / 2, this.y + this.height / 2);
  }
}
class ProgressBar {
  constructor(x, y, width, height, maxValue, currentValue, fillColor, bgColor, label, fillImage) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.maxValue = maxValue;
    this.currentValue = currentValue;
    this.fillColor = fillColor;
    this.bgColor = bgColor;
    this.label = label;
    this.fillImage = fillImage;
  }
  draw(ctx, textColor) {
    ctx.fillStyle = this.bgColor;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    const fillWidth = this.currentValue / this.maxValue * this.width;
    if (this.fillImage) {
      ctx.drawImage(this.fillImage, this.x, this.y, fillWidth, this.height);
    } else {
      ctx.fillStyle = this.fillColor;
      ctx.fillRect(this.x, this.y, fillWidth, this.height);
    }
    ctx.strokeStyle = "#FFF";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
    if (this.label) {
      ctx.fillStyle = textColor;
      ctx.font = "16px Arial";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${this.label} ${Math.round(this.currentValue)}/${this.maxValue}`, this.x, this.y - 10);
    }
  }
}
class Player {
  constructor(config) {
    this.money = config.initialMoney;
    this.energy = config.initialEnergy;
    this.maxEnergy = config.maxEnergy;
    this.energyRegenRate = config.energyRegenRate;
    this.stress = config.initialStress;
    this.maxStress = config.maxStress;
    this.stressDecayRate = config.stressDecayRate;
    this.performanceScore = 0;
    this.taskSpeedMultiplier = 1;
    this.maxActiveTasks = config.maxActiveTasks;
    this.focusPointsPerClick = config.focusPointsPerClick;
  }
  update(dt) {
    this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegenRate * dt);
    this.stress = Math.max(0, this.stress - this.stressDecayRate * dt);
  }
  addMoney(amount) {
    this.money += amount;
  }
  spendMoney(amount) {
    this.money -= amount;
  }
  addEnergy(amount) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }
  loseEnergy(amount) {
    this.energy = Math.max(0, this.energy - amount);
  }
  addStress(amount) {
    this.stress = Math.min(this.maxStress, this.stress + amount);
  }
  loseStress(amount) {
    this.stress = Math.max(0, this.stress - amount);
  }
  addPerformance(amount) {
    this.performanceScore += amount;
  }
  applyUpgrade(upgrade) {
    if (upgrade.effectType === "taskSpeedMultiplier") {
      this.taskSpeedMultiplier *= upgrade.effectValue;
    } else if (upgrade.effectType === "stressDecayRate") {
      this.stressDecayRate += upgrade.effectValue;
    } else if (upgrade.effectType === "energyRegenRate") {
      this.energyRegenRate += upgrade.effectValue;
    } else if (upgrade.effectType === "maxActiveTasks") {
      this.maxActiveTasks += upgrade.effectValue;
    }
  }
}
class Task {
  // Triggered by game logic, not directly by button
  constructor(data) {
    this.isCompleted = false;
    this.isHovered = false;
    // Internal property for rendering
    this.x = 0;
    // Position for rendering
    this.y = 0;
    this.width = 0;
    this.height = 0;
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.icon = data.icon;
    this.maxProgress = data.baseDuration;
    this.currentProgress = 0;
    this.moneyReward = data.moneyReward;
    this.performanceReward = data.performanceReward;
    this.stressCost = data.stressCost;
  }
  update(dt, taskSpeedMultiplier) {
    if (this.currentProgress < this.maxProgress) {
    }
  }
  applyFocus(focusPoints, playerTaskSpeedMultiplier) {
    if (this.isCompleted) return 0;
    const actualFocus = focusPoints * playerTaskSpeedMultiplier;
    this.currentProgress += actualFocus;
    if (this.currentProgress >= this.maxProgress) {
      this.currentProgress = this.maxProgress;
      this.isCompleted = true;
    }
    return actualFocus;
  }
  isClicked(x, y) {
    return x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
  }
  checkHover(x, y) {
    this.isHovered = x >= this.x && x <= this.x + this.width && y >= this.y && y <= this.y + this.height;
  }
  draw(ctx, assetManager, gameConfig) {
    const icon = assetManager.getImage(this.icon);
    const taskSlotBg = assetManager.getImage("task_slot_bg");
    if (taskSlotBg) {
      ctx.drawImage(taskSlotBg, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = this.isHovered ? gameConfig.accentColor : gameConfig.uiPanelColor;
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.strokeStyle = gameConfig.textColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
    if (icon) {
      const iconSize = this.height * 0.6;
      ctx.drawImage(icon, this.x + 10, this.y + (this.height - iconSize) / 2, iconSize, iconSize);
    }
    ctx.fillStyle = gameConfig.textColor;
    ctx.font = "18px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(this.name, this.x + this.height * 0.6 + 20, this.y + 10);
    const progressX = this.x + this.height * 0.6 + 20;
    const progressY = this.y + this.height - 30;
    const progressBarWidth = this.width - (this.height * 0.6 + 30);
    const progressBarHeight = 15;
    const progressBar = new ProgressBar(
      progressX,
      progressY,
      progressBarWidth,
      progressBarHeight,
      this.maxProgress,
      this.currentProgress,
      gameConfig.accentColor,
      "#555555",
      null
    );
    progressBar.draw(ctx, gameConfig.textColor);
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(this.currentProgress)}/${this.maxProgress}`, progressX + progressBarWidth / 2, progressY + progressBarHeight / 2);
  }
}
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 2] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 3] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 4] = "GAME_OVER";
  GameState2[GameState2["GAME_WIN"] = 5] = "GAME_WIN";
  return GameState2;
})(GameState || {});
class Game {
  constructor(canvasId) {
    this.gameState = 0 /* LOADING */;
    this.activeTasks = [];
    this.allTasksData = [];
    this.availableUpgradesData = [];
    this.purchasedUpgradeIds = /* @__PURE__ */ new Set();
    this.eventsData = [];
    this.currentEvent = null;
    this.eventDisplayTimer = 0;
    // How long an event message stays
    this.uiElements = [];
    this.gameButtons = [];
    // Buttons for the current screen
    this.taskButtons = [];
    // Tasks as clickable elements
    this.upgradeButtons = [];
    // Upgrade buttons
    this.lastTimestamp = 0;
    // Fixed typo
    this.mouseX = 0;
    this.mouseY = 0;
    this.isMouseDown = false;
    // To track if mouse button is held down for task focus
    this.taskSpawnTimer = 0;
    this.gameTimeElapsed = 0;
    // For workday timer
    this.eventTriggerTimer = 0;
    this.UI_TASK_HEIGHT = 80;
    this.UI_TASK_SPACING = 10;
    this.UI_UPGRADE_BUTTON_WIDTH = 250;
    this.UI_UPGRADE_BUTTON_HEIGHT = 60;
    this.UI_UPGRADE_SPACING = 15;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.addEventListeners();
    this.UI_TASK_PANEL_WIDTH = 500;
    this.UI_TASK_PANEL_X = 10;
    this.UI_TASK_PANEL_Y = 100;
    this.UI_UPGRADE_PANEL_WIDTH = 300;
    this.UI_UPGRADE_PANEL_HEIGHT = 600;
    this.UI_UPGRADE_PANEL_X = this.canvas.width - this.UI_UPGRADE_PANEL_WIDTH - 10;
    this.UI_UPGRADE_PANEL_Y = 100;
    this.loadGameDataAndAssets();
  }
  addEventListeners() {
    this.canvas.addEventListener("mousemove", this.onMouseMove.bind(this));
    this.canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
    this.canvas.addEventListener("mouseup", this.onMouseUp.bind(this));
  }
  async loadGameDataAndAssets() {
    try {
      const response = await fetch("data.json");
      this.gameData = await response.json();
      this.canvas.width = this.gameData.gameConfig.canvasWidth;
      this.canvas.height = this.gameData.gameConfig.canvasHeight;
      this.UI_UPGRADE_PANEL_X = this.canvas.width - this.UI_UPGRADE_PANEL_WIDTH - 10;
      this.UI_UPGRADE_PANEL_Y = 100;
      this.assetManager = new AssetManager(this.gameData.assets);
      this.audioPlayer = new AudioPlayer(
        this.assetManager.getSounds(),
        this.gameData.assets.sounds.find((s) => s.name === "bgm_office")?.volume || 0.3,
        this.gameData.assets.sounds.find((s) => s.name === "sfx_click")?.volume || 0.7
      );
      this.assetManager.setOnProgress((progress) => {
        this.renderLoadingScreen(progress);
      });
      this.assetManager.setOnComplete(() => {
        this.initGame();
      });
      await this.assetManager.loadAll();
    } catch (error) {
      console.error("Failed to load game data or assets:", error);
    }
  }
  initGame() {
    this.player = new Player(this.gameData.gameConfig);
    this.allTasksData = [...this.gameData.tasks];
    this.availableUpgradesData = [...this.gameData.upgrades];
    this.eventsData = [...this.gameData.events];
    this.activeTasks = [];
    this.purchasedUpgradeIds.clear();
    this.gameTimeElapsed = 0;
    this.taskSpawnTimer = this.getRandomTaskSpawnInterval();
    this.eventTriggerTimer = 10;
    this.setupTitleScreen();
    this.gameLoop(0);
  }
  setupTitleScreen() {
    this.gameState = 1 /* TITLE */;
    this.uiElements = [];
    this.gameButtons = [];
    this.audioPlayer.playBGM("bgm_office");
    const startButton = new Button(
      this.canvas.width / 2 - 150 / 2,
      this.canvas.height - 100,
      150,
      50,
      this.gameData.texts.clickToStart,
      () => this.setupInstructionsScreen(),
      this.assetManager.getImage("button_normal"),
      this.assetManager.getImage("button_hover")
    );
    this.gameButtons.push(startButton);
    this.uiElements.push(startButton);
  }
  setupInstructionsScreen() {
    this.gameState = 2 /* INSTRUCTIONS */;
    this.uiElements = [];
    this.gameButtons = [];
    const playButton = new Button(
      this.canvas.width / 2 - 150 / 2,
      this.canvas.height - 100,
      150,
      50,
      this.gameData.texts.instructionsText[this.gameData.texts.instructionsText.length - 1],
      () => this.startGameplay(),
      this.assetManager.getImage("button_normal"),
      this.assetManager.getImage("button_hover")
    );
    this.gameButtons.push(playButton);
    this.uiElements.push(playButton);
  }
  startGameplay() {
    this.gameState = 3 /* PLAYING */;
    this.uiElements = [];
    this.taskButtons = [];
    this.upgradeButtons = [];
    this.gameButtons = [];
    this.setupUpgradePanelButtons();
  }
  setupUpgradePanelButtons() {
    this.upgradeButtons = [];
    this.uiElements = this.uiElements.filter((el) => !(el instanceof Button && this.availableUpgradesData.some((u) => el.text.includes(u.name))));
    let upgradeButtonY = this.UI_UPGRADE_PANEL_Y + 50;
    this.availableUpgradesData.forEach((upgradeData) => {
      const isPurchased = this.purchasedUpgradeIds.has(upgradeData.id);
      const buttonText = isPurchased ? `${upgradeData.name} (\uAD6C\uB9E4\uB428)` : `${upgradeData.name} (\u20A9${upgradeData.cost})`;
      const button = new Button(
        this.UI_UPGRADE_PANEL_X + (this.UI_UPGRADE_PANEL_WIDTH - this.UI_UPGRADE_BUTTON_WIDTH) / 2,
        upgradeButtonY,
        this.UI_UPGRADE_BUTTON_WIDTH,
        this.UI_UPGRADE_BUTTON_HEIGHT,
        buttonText,
        () => this.buyUpgrade(upgradeData.id),
        this.assetManager.getImage("button_normal"),
        this.assetManager.getImage("button_hover"),
        this.assetManager.getImage("button_normal")
        // Use normal as disabled look for now
      );
      button.enabled = !isPurchased && this.player.money >= upgradeData.cost;
      this.upgradeButtons.push(button);
      this.uiElements.push(button);
      upgradeButtonY += this.UI_UPGRADE_BUTTON_HEIGHT + this.UI_UPGRADE_SPACING;
    });
  }
  getRandomTaskSpawnInterval() {
    const { taskSpawnIntervalMin, taskSpawnIntervalMax } = this.gameData.gameConfig;
    return Math.random() * (taskSpawnIntervalMax - taskSpawnIntervalMin) + taskSpawnIntervalMin;
  }
  spawnRandomTask() {
    if (this.activeTasks.length >= this.player.maxActiveTasks || this.allTasksData.length === 0) {
      return;
    }
    const availableTasks = this.allTasksData;
    const randomTaskData = availableTasks[Math.floor(Math.random() * availableTasks.length)];
    const newTask = new Task(randomTaskData);
    this.activeTasks.push(newTask);
    this.taskButtons.push(newTask);
    this.uiElements.push(newTask);
  }
  buyUpgrade(upgradeId) {
    this.audioPlayer.playSFX("sfx_click");
    const upgradeData = this.availableUpgradesData.find((u) => u.id === upgradeId);
    if (upgradeData && !this.purchasedUpgradeIds.has(upgradeData.id) && this.player.money >= upgradeData.cost) {
      this.player.spendMoney(upgradeData.cost);
      this.player.applyUpgrade(upgradeData);
      this.purchasedUpgradeIds.add(upgradeData.id);
      this.audioPlayer.playSFX("sfx_upgrade");
      this.setupUpgradePanelButtons();
    }
  }
  triggerRandomEvent() {
    const potentialEvents = this.eventsData.filter((e) => Math.random() < e.triggerChance);
    if (potentialEvents.length > 0) {
      this.audioPlayer.playSFX("sfx_event");
      this.currentEvent = potentialEvents[Math.floor(Math.random() * potentialEvents.length)];
      this.eventDisplayTimer = 5;
      if (this.currentEvent.effectType === "stressBoost") {
        this.player.addStress(this.currentEvent.effectValue);
      } else if (this.currentEvent.effectType === "bonusTask") {
        this.spawnRandomTask();
      }
    }
    this.eventTriggerTimer = Math.random() * 20 + 15;
  }
  gameLoop(timestamp) {
    const deltaTime = (timestamp - this.lastTimestamp) / 1e3;
    this.lastTimestamp = timestamp;
    this.update(deltaTime);
    this.render();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(dt) {
    switch (this.gameState) {
      case 3 /* PLAYING */:
        this.player.update(dt);
        this.gameTimeElapsed += dt;
        this.taskSpawnTimer -= dt * 1e3;
        if (this.taskSpawnTimer <= 0) {
          this.spawnRandomTask();
          this.taskSpawnTimer = this.getRandomTaskSpawnInterval();
        }
        this.eventTriggerTimer -= dt;
        if (this.eventTriggerTimer <= 0) {
          this.triggerRandomEvent();
        }
        if (this.currentEvent && this.eventDisplayTimer > 0) {
          this.eventDisplayTimer -= dt;
          if (this.eventDisplayTimer <= 0) {
            this.currentEvent = null;
          }
        }
        if (this.isMouseDown) {
          const clickedTask = this.taskButtons.find((task) => task.isHovered);
          if (clickedTask && !clickedTask.isCompleted && this.player.energy > 0) {
            const progressMade = clickedTask.applyFocus(this.player.focusPointsPerClick * dt, this.player.taskSpeedMultiplier);
            if (progressMade > 0) {
              this.player.loseEnergy(progressMade * 0.1);
              this.player.addStress(progressMade * clickedTask.stressCost / clickedTask.maxProgress * 0.1);
            }
            if (clickedTask.isCompleted) {
              this.audioPlayer.playSFX("sfx_task_complete");
              this.player.addMoney(clickedTask.moneyReward);
              this.player.addPerformance(clickedTask.performanceReward);
              this.activeTasks = this.activeTasks.filter((t) => t !== clickedTask);
              this.taskButtons = this.taskButtons.filter((t) => t !== clickedTask);
              this.uiElements = this.uiElements.filter((el) => el !== clickedTask);
              this.setupUpgradePanelButtons();
            }
          }
        }
        if (this.player.stress >= this.player.maxStress) {
          this.setGameOver(this.gameData.texts.gameOverStress);
        } else if (this.player.energy <= 0 && this.activeTasks.some((t) => !t.isCompleted)) {
          this.setGameOver(this.gameData.texts.gameOverEnergy);
        } else if (this.gameTimeElapsed >= this.gameData.gameConfig.gameDayDurationSeconds) {
          if (this.player.performanceScore >= this.gameData.gameConfig.earlyLeaveScoreTarget) {
            this.setGameWin();
          } else {
            this.setGameOver(`\uCE7C\uD1F4 \uBAA9\uD45C \uB2EC\uC131 \uC2E4\uD328! ${this.player.performanceScore}/${this.gameData.gameConfig.earlyLeaveScoreTarget}`);
          }
        }
        break;
      default:
        break;
    }
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    switch (this.gameState) {
      case 0 /* LOADING */:
        break;
      case 1 /* TITLE */:
        this.renderTitleScreen();
        break;
      case 2 /* INSTRUCTIONS */:
        this.renderInstructionsScreen();
        break;
      case 3 /* PLAYING */:
        this.renderGameplayScreen();
        break;
      case 4 /* GAME_OVER */:
      case 5 /* GAME_WIN */:
        this.renderEndScreen();
        break;
    }
    this.gameButtons.forEach((btn) => btn.draw(this.ctx, this.gameData.gameConfig.textColor, this.gameData.gameConfig.accentColor));
  }
  renderLoadingScreen(progress) {
    this.ctx.fillStyle = "#222222";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "30px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("\uAC8C\uC784 \uB85C\uB529 \uC911...", this.canvas.width / 2, this.canvas.height / 2 - 50);
    const progressBarWidth = 400;
    const progressBarHeight = 30;
    const progressBarX = this.canvas.width / 2 - progressBarWidth / 2;
    const progressBarY = this.canvas.height / 2;
    this.ctx.fillStyle = "#555555";
    this.ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);
    this.ctx.fillStyle = this.gameData?.gameConfig.accentColor || "#FFAA00";
    this.ctx.fillRect(progressBarX, progressBarY, progressBarWidth * progress, progressBarHeight);
    this.ctx.strokeStyle = "#FFFFFF";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "20px Arial";
    this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 20);
  }
  renderTitleScreen() {
    const bg = this.assetManager.getImage("title_bg");
    if (bg) {
      this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "#4A6B8A";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.fillStyle = this.gameData.gameConfig.textColor;
    this.ctx.font = "60px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.gameData.texts.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
  }
  renderInstructionsScreen() {
    const bg = this.assetManager.getImage("office_bg");
    if (bg) {
      this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "#6B8E23";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.fillStyle = "rgba(0,0,0,0.7)";
    this.ctx.fillRect(50, 50, this.canvas.width - 100, this.canvas.height - 150);
    this.ctx.fillStyle = this.gameData.gameConfig.textColor;
    this.ctx.font = "40px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "top";
    this.ctx.fillText(this.gameData.texts.instructionsTitle, this.canvas.width / 2, 70);
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "left";
    let textY = 150;
    this.gameData.texts.instructionsText.slice(0, -1).forEach((line) => {
      this.ctx.fillText(line, 70, textY);
      textY += 30;
    });
  }
  renderGameplayScreen() {
    const bg = this.assetManager.getImage("office_bg");
    if (bg) {
      this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "#6B8E23";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    const uiPanelHeight = 80;
    this.ctx.fillStyle = this.gameData.gameConfig.uiPanelColor;
    this.ctx.fillRect(0, 0, this.canvas.width, uiPanelHeight);
    this.ctx.fillStyle = this.gameData.gameConfig.textColor;
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    const playerAvatar = this.assetManager.getImage("player_avatar");
    if (playerAvatar) {
      this.ctx.drawImage(playerAvatar, 10, 10, 60, 60);
    }
    this.ctx.fillText(`${this.gameData.texts.moneyLabel}${Math.round(this.player.money)}`, 90, uiPanelHeight / 2);
    const energyBar = new ProgressBar(
      this.canvas.width / 2 - 200,
      20,
      180,
      20,
      this.player.maxEnergy,
      this.player.energy,
      "#00FF00",
      "#555555",
      this.gameData.texts.energyLabel,
      this.assetManager.getImage("energy_bar_fill")
    );
    energyBar.draw(this.ctx, this.gameData.gameConfig.textColor);
    const stressBar = new ProgressBar(
      this.canvas.width / 2 - 200,
      50,
      180,
      20,
      this.player.maxStress,
      this.player.stress,
      "#FF0000",
      "#555555",
      this.gameData.texts.stressLabel,
      this.assetManager.getImage("stress_bar_fill")
    );
    stressBar.draw(this.ctx, this.gameData.gameConfig.textColor);
    this.ctx.fillText(`${this.gameData.texts.performanceLabel}${this.player.performanceScore}/${this.gameData.gameConfig.earlyLeaveScoreTarget}`, this.canvas.width - 250, 30);
    const remainingTime = this.gameData.gameConfig.gameDayDurationSeconds - this.gameTimeElapsed;
    const minutes = Math.floor(remainingTime / 60);
    const seconds = Math.floor(remainingTime % 60);
    this.ctx.fillText(`${this.gameData.texts.timeLabel}${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`, this.canvas.width - 250, 60);
    this.ctx.fillStyle = this.gameData.gameConfig.uiPanelColor;
    this.ctx.fillRect(this.UI_TASK_PANEL_X, this.UI_TASK_PANEL_Y, this.UI_TASK_PANEL_WIDTH, this.canvas.height - this.UI_TASK_PANEL_Y - 10);
    this.ctx.strokeStyle = this.gameData.gameConfig.textColor;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(this.UI_TASK_PANEL_X, this.UI_TASK_PANEL_Y, this.UI_TASK_PANEL_WIDTH, this.canvas.height - this.UI_TASK_PANEL_Y - 10);
    this.ctx.fillStyle = this.gameData.gameConfig.textColor;
    this.ctx.font = "28px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("\uB0B4 \uC5C5\uBB34", this.UI_TASK_PANEL_X + this.UI_TASK_PANEL_WIDTH / 2, this.UI_TASK_PANEL_Y + 30);
    let currentTaskY = this.UI_TASK_PANEL_Y + 60;
    this.activeTasks.forEach((task) => {
      task.x = this.UI_TASK_PANEL_X + 10;
      task.y = currentTaskY;
      task.width = this.UI_TASK_PANEL_WIDTH - 20;
      task.height = this.UI_TASK_HEIGHT;
      task.draw(this.ctx, this.assetManager, this.gameData.gameConfig);
      currentTaskY += this.UI_TASK_HEIGHT + this.UI_TASK_SPACING;
    });
    this.ctx.fillStyle = this.gameData.gameConfig.uiPanelColor;
    this.ctx.fillRect(this.UI_UPGRADE_PANEL_X, this.UI_UPGRADE_PANEL_Y, this.UI_UPGRADE_PANEL_WIDTH, this.UI_UPGRADE_PANEL_HEIGHT);
    this.ctx.strokeStyle = this.gameData.gameConfig.textColor;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(this.UI_UPGRADE_PANEL_X, this.UI_UPGRADE_PANEL_Y, this.UI_UPGRADE_PANEL_WIDTH, this.UI_UPGRADE_PANEL_HEIGHT);
    this.ctx.fillStyle = this.gameData.gameConfig.textColor;
    this.ctx.font = "28px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.gameData.texts.upgradePanelTitle, this.UI_UPGRADE_PANEL_X + this.UI_UPGRADE_PANEL_WIDTH / 2, this.UI_UPGRADE_PANEL_Y + 30);
    this.upgradeButtons.forEach((btn) => btn.draw(this.ctx, this.gameData.gameConfig.textColor, this.gameData.gameConfig.accentColor));
    if (this.currentEvent) {
      const popupWidth = 400;
      const popupHeight = 150;
      const popupX = (this.canvas.width - popupWidth) / 2;
      const popupY = (this.canvas.height - popupHeight) / 2;
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      this.ctx.fillRect(popupX, popupY, popupWidth, popupHeight);
      this.ctx.strokeStyle = this.gameData.gameConfig.accentColor;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(popupX, popupY, popupWidth, popupHeight);
      this.ctx.fillStyle = this.gameData.gameConfig.textColor;
      this.ctx.font = "24px Arial";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(this.currentEvent.name, popupX + popupWidth / 2, popupY + 40);
      this.ctx.font = "16px Arial";
      this.ctx.fillText(this.currentEvent.description, popupX + popupWidth / 2, popupY + 90);
    }
  }
  renderEndScreen() {
    const bg = this.assetManager.getImage("office_bg");
    if (bg) {
      this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "#6B8E23";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.fillStyle = "rgba(0,0,0,0.7)";
    this.ctx.fillRect(50, 50, this.canvas.width - 100, this.canvas.height - 150);
    this.ctx.fillStyle = this.gameData.gameConfig.textColor;
    this.ctx.font = "60px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    let titleText = "";
    let messageText = "";
    if (this.gameState === 4 /* GAME_OVER */) {
      titleText = this.gameData.texts.gameOverTitle;
      messageText = this.currentEvent?.description || this.gameData.texts.gameOverStress;
    } else if (this.gameState === 5 /* GAME_WIN */) {
      titleText = this.gameData.texts.gameWinTitle;
      messageText = this.gameData.texts.gameWinMessage;
    }
    this.ctx.fillText(titleText, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px Arial";
    this.ctx.fillText(messageText, this.canvas.width / 2, this.canvas.height / 2 + 20);
    const restartButton = new Button(
      this.canvas.width / 2 - 150 / 2,
      this.canvas.height - 100,
      150,
      50,
      "\uB2E4\uC2DC \uC2DC\uC791",
      () => this.initGame(),
      // Re-initialize game to restart
      this.assetManager.getImage("button_normal"),
      this.assetManager.getImage("button_hover")
    );
    restartButton.draw(this.ctx, this.gameData.gameConfig.textColor, this.gameData.gameConfig.accentColor);
    this.uiElements = [restartButton];
  }
  setGameOver(reason) {
    this.gameState = 4 /* GAME_OVER */;
    this.currentEvent = { id: "game_over_reason", name: this.gameData.texts.gameOverTitle, description: reason, triggerChance: 0, effectType: "no_effect_yet", effectValue: 0, delaySeconds: 0 };
    this.uiElements = [];
  }
  setGameWin() {
    this.gameState = 5 /* GAME_WIN */;
    this.player.addMoney(this.gameData.gameConfig.earlyLeaveMoneyBonus);
    this.uiElements = [];
  }
  // --- Input Handlers ---
  onMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = event.clientX - rect.left;
    this.mouseY = event.clientY - rect.top;
    this.uiElements.forEach((el) => {
      el.checkHover(this.mouseX, this.mouseY);
    });
  }
  onMouseDown(event) {
    this.isMouseDown = true;
  }
  onMouseUp(event) {
    this.isMouseDown = false;
    const rect = this.canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    for (const el of this.uiElements) {
      if (el.isClicked(clickX, clickY)) {
        this.audioPlayer.playSFX("sfx_click");
        if (el.onClick) {
          el.onClick();
        }
        return;
      }
    }
  }
}
window.onload = () => {
  try {
    new Game("gameCanvas");
  } catch (e) {
    console.error("Failed to initialize game:", e);
    const body = document.querySelector("body");
    if (body) {
      body.innerHTML = `<div style="color: red; text-align: center; margin-top: 50px;">
                <h1>\uAC8C\uC784 \uC2E4\uD589 \uC624\uB958</h1>
                <p>\uAC8C\uC784 \uCD08\uAE30\uD654 \uC911 \uBB38\uC81C\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4: ${e instanceof Error ? e.message : String(e)}</p>
                <p>\uCF58\uC194\uC744 \uD655\uC778\uD558\uC5EC \uC790\uC138\uD55C \uC624\uB958 \uC815\uBCF4\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.</p>
            </div>`;
    }
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gZ2FtZS50c1xyXG5cclxuLy8gLS0tIERhdGEgSW50ZXJmYWNlcyAoYWxpZ25zIHdpdGggZGF0YS5qc29uKSAtLS1cclxuXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIGluaXRpYWxNb25leTogbnVtYmVyO1xyXG4gICAgaW5pdGlhbEVuZXJneTogbnVtYmVyO1xyXG4gICAgbWF4RW5lcmd5OiBudW1iZXI7XHJcbiAgICBlbmVyZ3lSZWdlblJhdGU6IG51bWJlcjsgLy8gZW5lcmd5IHBlciBzZWNvbmRcclxuICAgIGluaXRpYWxTdHJlc3M6IG51bWJlcjtcclxuICAgIG1heFN0cmVzczogbnVtYmVyO1xyXG4gICAgc3RyZXNzRGVjYXlSYXRlOiBudW1iZXI7IC8vIHN0cmVzcyBwZXIgc2Vjb25kXHJcbiAgICBmb2N1c1BvaW50c1BlckNsaWNrOiBudW1iZXI7IC8vIHByb2dyZXNzIGFkZGVkIHBlciBjbGlja1xyXG4gICAgdGFza1NwYXduSW50ZXJ2YWxNaW46IG51bWJlcjsgLy8gbWlsbGlzZWNvbmRzXHJcbiAgICB0YXNrU3Bhd25JbnRlcnZhbE1heDogbnVtYmVyOyAvLyBtaWxsaXNlY29uZHNcclxuICAgIG1heEFjdGl2ZVRhc2tzOiBudW1iZXI7XHJcbiAgICBlYXJseUxlYXZlU2NvcmVUYXJnZXQ6IG51bWJlcjtcclxuICAgIGVhcmx5TGVhdmVNb25leUJvbnVzOiBudW1iZXI7XHJcbiAgICBnYW1lRGF5RHVyYXRpb25TZWNvbmRzOiBudW1iZXI7IC8vIHNlY29uZHMgZm9yIGEgZnVsbCB3b3JrZGF5XHJcbiAgICB1aVBhbmVsQ29sb3I6IHN0cmluZztcclxuICAgIHRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgYWNjZW50Q29sb3I6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIFRhc2tEYXRhIHtcclxuICAgIGlkOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xyXG4gICAgYmFzZUR1cmF0aW9uOiBudW1iZXI7IC8vIHByb2dyZXNzIHBvaW50cyByZXF1aXJlZFxyXG4gICAgbW9uZXlSZXdhcmQ6IG51bWJlcjtcclxuICAgIHBlcmZvcm1hbmNlUmV3YXJkOiBudW1iZXI7XHJcbiAgICBzdHJlc3NDb3N0OiBudW1iZXI7XHJcbiAgICBpY29uOiBzdHJpbmc7IC8vIGFzc2V0IG5hbWVcclxufVxyXG5cclxuaW50ZXJmYWNlIFVwZ3JhZGVEYXRhIHtcclxuICAgIGlkOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBkZXNjcmlwdGlvbjogc3RyaW5nO1xyXG4gICAgY29zdDogbnVtYmVyO1xyXG4gICAgZWZmZWN0VHlwZTogXCJ0YXNrU3BlZWRNdWx0aXBsaWVyXCIgfCBcInN0cmVzc0RlY2F5UmF0ZVwiIHwgXCJlbmVyZ3lSZWdlblJhdGVcIiB8IFwibWF4QWN0aXZlVGFza3NcIjtcclxuICAgIGVmZmVjdFZhbHVlOiBudW1iZXI7IC8vIG11bHRpcGxpZXIgb3IgZGlyZWN0IGluY3JlbWVudFxyXG4gICAgaWNvbjogc3RyaW5nOyAvLyBhc3NldCBuYW1lXHJcbn1cclxuXHJcbmludGVyZmFjZSBFdmVudERhdGEge1xyXG4gICAgaWQ6IHN0cmluZztcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XHJcbiAgICB0cmlnZ2VyQ2hhbmNlOiBudW1iZXI7IC8vIDAgdG8gMVxyXG4gICAgZWZmZWN0VHlwZTogXCJzdHJlc3NCb29zdFwiIHwgXCJib251c1Rhc2tcIiB8IFwibm9fZWZmZWN0X3lldFwiO1xyXG4gICAgZWZmZWN0VmFsdWU6IG51bWJlcjtcclxuICAgIGRlbGF5U2Vjb25kczogbnVtYmVyOyAvLyBob3cgbG9uZyB0aGUgZXZlbnQgZWZmZWN0IG1pZ2h0IGxhc3Qgb3IgYmVmb3JlIGRlY2lzaW9uXHJcbn1cclxuXHJcbmludGVyZmFjZSBUZXh0Q29udGVudCB7XHJcbiAgICB0aXRsZTogc3RyaW5nO1xyXG4gICAgY2xpY2tUb1N0YXJ0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUaXRsZTogc3RyaW5nO1xyXG4gICAgaW5zdHJ1Y3Rpb25zVGV4dDogc3RyaW5nW107XHJcbiAgICBtb25leUxhYmVsOiBzdHJpbmc7XHJcbiAgICBlbmVyZ3lMYWJlbDogc3RyaW5nO1xyXG4gICAgc3RyZXNzTGFiZWw6IHN0cmluZztcclxuICAgIHBlcmZvcm1hbmNlTGFiZWw6IHN0cmluZztcclxuICAgIHRpbWVMYWJlbDogc3RyaW5nO1xyXG4gICAgdGFza0luUHJvZ3Jlc3M6IHN0cmluZztcclxuICAgIHRhc2tDb21wbGV0ZTogc3RyaW5nO1xyXG4gICAgdXBncmFkZVBhbmVsVGl0bGU6IHN0cmluZztcclxuICAgIGdhbWVPdmVyVGl0bGU6IHN0cmluZztcclxuICAgIGdhbWVPdmVyU3RyZXNzOiBzdHJpbmc7XHJcbiAgICBnYW1lT3ZlckVuZXJneTogc3RyaW5nO1xyXG4gICAgZ2FtZVdpblRpdGxlOiBzdHJpbmc7XHJcbiAgICBnYW1lV2luTWVzc2FnZTogc3RyaW5nO1xyXG59XHJcblxyXG4vLyBSZW5hbWVkIHRvIGF2b2lkIGNvbmZsaWN0IHdpdGggRE9NJ3MgSW1hZ2VEYXRhXHJcbmludGVyZmFjZSBBc3NldEltYWdlRGF0YSB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZERhdGEge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xyXG4gICAgdm9sdW1lOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBc3NldE1hbmlmZXN0IHtcclxuICAgIGltYWdlczogQXNzZXRJbWFnZURhdGFbXTsgLy8gVXBkYXRlZCB0byBBc3NldEltYWdlRGF0YVxyXG4gICAgc291bmRzOiBTb3VuZERhdGFbXTtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVDb25maWc6IEdhbWVDb25maWc7XHJcbiAgICB0YXNrczogVGFza0RhdGFbXTtcclxuICAgIHVwZ3JhZGVzOiBVcGdyYWRlRGF0YVtdO1xyXG4gICAgZXZlbnRzOiBFdmVudERhdGFbXTtcclxuICAgIHRleHRzOiBUZXh0Q29udGVudDtcclxuICAgIGFzc2V0czogQXNzZXRNYW5pZmVzdDtcclxufVxyXG5cclxuLy8gLS0tIEFzc2V0IE1hbmFnZW1lbnQgLS0tXHJcblxyXG5jbGFzcyBBc3NldE1hbmFnZXIge1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRDb3VudDogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgdG90YWxDb3VudDogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgb25Qcm9ncmVzczogKChwcm9ncmVzczogbnVtYmVyKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBvbkNvbXBsZXRlOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihwcml2YXRlIGFzc2V0TWFuaWZlc3Q6IEFzc2V0TWFuaWZlc3QpIHtcclxuICAgICAgICB0aGlzLnRvdGFsQ291bnQgPSBhc3NldE1hbmlmZXN0LmltYWdlcy5sZW5ndGggKyBhc3NldE1hbmlmZXN0LnNvdW5kcy5sZW5ndGg7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldE9uUHJvZ3Jlc3MoY2FsbGJhY2s6IChwcm9ncmVzczogbnVtYmVyKSA9PiB2b2lkKSB7XHJcbiAgICAgICAgdGhpcy5vblByb2dyZXNzID0gY2FsbGJhY2s7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldE9uQ29tcGxldGUoY2FsbGJhY2s6ICgpID0+IHZvaWQpIHtcclxuICAgICAgICB0aGlzLm9uQ29tcGxldGUgPSBjYWxsYmFjaztcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgYXN5bmMgbG9hZEFsbCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5hc3NldE1hbmlmZXN0LmltYWdlcy5tYXAoaW1nRGF0YSA9PiB0aGlzLmxvYWRJbWFnZShpbWdEYXRhKSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuYXNzZXRNYW5pZmVzdC5zb3VuZHMubWFwKHNvdW5kRGF0YSA9PiB0aGlzLmxvYWRTb3VuZChzb3VuZERhdGEpKTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBpZiAodGhpcy5vbkNvbXBsZXRlKSB7XHJcbiAgICAgICAgICAgIHRoaXMub25Db21wbGV0ZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRJbWFnZShpbWdEYXRhOiBBc3NldEltYWdlRGF0YSk6IFByb21pc2U8dm9pZD4geyAvLyBVcGRhdGVkIHRvIEFzc2V0SW1hZ2VEYXRhXHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBpbWdEYXRhLnBhdGg7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoaW1nRGF0YS5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRDb3VudCsrO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub25Qcm9ncmVzcykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMub25Qcm9ncmVzcyh0aGlzLmxvYWRlZENvdW50IC8gdGhpcy50b3RhbENvdW50KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdEYXRhLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZ0RhdGEucGF0aH1gKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRTb3VuZChzb3VuZERhdGE6IFNvdW5kRGF0YSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnNyYyA9IHNvdW5kRGF0YS5wYXRoO1xyXG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZERhdGEudm9sdW1lO1xyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kRGF0YS5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5vblByb2dyZXNzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vblByb2dyZXNzKHRoaXMubG9hZGVkQ291bnQgLyB0aGlzLnRvdGFsQ291bnQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c291bmREYXRhLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kRGF0YS5wYXRofWApO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAvLyBGb3Igc29tZSBicm93c2VycywgJ29uY2FucGxheXRocm91Z2gnIG1pZ2h0IG5vdCBmaXJlIGlmIG5vdCBleHBsaWNpdGx5IGxvYWRlZC5cclxuICAgICAgICAgICAgLy8gQSBzbWFsbCB0aW1lb3V0IGNhbiBhY3QgYXMgYSBmYWxsYmFjaywgb3Igd2UgYXNzdW1lIGl0J3MgbG9hZGVkIGVub3VnaC5cclxuICAgICAgICAgICAgLy8gRm9yIHRoaXMgc2ltcGxlIGdhbWUsIHdlIHRydXN0ICdvbmNhbnBsYXl0aHJvdWdoJy5cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0SW1hZ2UobmFtZTogc3RyaW5nKTogSFRNTEltYWdlRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuaW1hZ2VzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZ2V0U291bmQobmFtZTogc3RyaW5nKTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBQdWJsaWMgZ2V0dGVyIGZvciBzb3VuZHMgbWFwLCByZXF1aXJlZCBieSBBdWRpb1BsYXllciBjb25zdHJ1Y3RvclxyXG4gICAgcHVibGljIGdldFNvdW5kcygpOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuc291bmRzO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBBdWRpb1BsYXllciB7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD47XHJcbiAgICBwcml2YXRlIGN1cnJlbnRCR006IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYmdtVm9sdW1lOiBudW1iZXIgPSAwLjU7IC8vIERlZmF1bHQgQkdNIHZvbHVtZVxyXG4gICAgcHJpdmF0ZSBzZnhWb2x1bWU6IG51bWJlciA9IDAuNzsgLy8gRGVmYXVsdCBTRlggdm9sdW1lXHJcblxyXG4gICAgY29uc3RydWN0b3Ioc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiwgYmdtVm9sdW1lOiBudW1iZXIsIHNmeFZvbHVtZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5zb3VuZHMgPSBzb3VuZHM7XHJcbiAgICAgICAgdGhpcy5iZ21Wb2x1bWUgPSBiZ21Wb2x1bWU7XHJcbiAgICAgICAgdGhpcy5zZnhWb2x1bWUgPSBzZnhWb2x1bWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHBsYXlTRlgobmFtZTogc3RyaW5nLCB2b2x1bWU/OiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBzb3VuZCA9IHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoc291bmQpIHtcclxuICAgICAgICAgICAgY29uc3Qgc2Z4SW5zdGFuY2UgPSBzb3VuZC5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICBzZnhJbnN0YW5jZS52b2x1bWUgPSB2b2x1bWUgIT09IHVuZGVmaW5lZCA/IHZvbHVtZSA6IHRoaXMuc2Z4Vm9sdW1lO1xyXG4gICAgICAgICAgICBzZnhJbnN0YW5jZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oXCJTRlggcGxheWJhY2sgZmFpbGVkOlwiLCBlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBwbGF5QkdNKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IHRydWUsIHZvbHVtZT86IG51bWJlcikge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRCR00pIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QkdNLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEJHTS5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHNvdW5kID0gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgICAgIGlmIChzb3VuZCkge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRCR00gPSBzb3VuZDtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QkdNLmxvb3AgPSBsb29wO1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRCR00udm9sdW1lID0gdm9sdW1lICE9PSB1bmRlZmluZWQgPyB2b2x1bWUgOiB0aGlzLmJnbVZvbHVtZTtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QkdNLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkJHTSBwbGF5YmFjayBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHN0b3BCR00oKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudEJHTSkge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRCR00ucGF1c2UoKTtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QkdNLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QkdNID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldEJHTVZvbHVtZSh2b2x1bWU6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuYmdtVm9sdW1lID0gdm9sdW1lO1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRCR00pIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QkdNLnZvbHVtZSA9IHZvbHVtZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHNldFNGWFZvbHVtZSh2b2x1bWU6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuc2Z4Vm9sdW1lID0gdm9sdW1lO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyAtLS0gR2FtZSBVSSBDb21wb25lbnRzIC0tLVxyXG5cclxuLy8gVXBkYXRlZCBDbGlja2FibGUgaW50ZXJmYWNlIHRvIHVzZSBjaGVja0hvdmVyIG1ldGhvZCBmb3IgaG92ZXIgc3RhdGUgdXBkYXRlXHJcbmludGVyZmFjZSBDbGlja2FibGUge1xyXG4gICAgaXNDbGlja2VkKHg6IG51bWJlciwgeTogbnVtYmVyKTogYm9vbGVhbjtcclxuICAgIGNoZWNrSG92ZXIoeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkOyAvLyBNZXRob2QgdG8gdXBkYXRlIGludGVybmFsIGhvdmVyIHN0YXRlXHJcbiAgICBvbkNsaWNrPzogKCkgPT4gdm9pZDtcclxufVxyXG5cclxuY2xhc3MgQnV0dG9uIGltcGxlbWVudHMgQ2xpY2thYmxlIHtcclxuICAgIHB1YmxpYyB4OiBudW1iZXI7XHJcbiAgICBwdWJsaWMgeTogbnVtYmVyO1xyXG4gICAgcHVibGljIHdpZHRoOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBwdWJsaWMgdGV4dDogc3RyaW5nO1xyXG4gICAgcHVibGljIG9uQ2xpY2s/OiAoKSA9PiB2b2lkO1xyXG4gICAgcHVibGljIGlzSG92ZXJlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBJbnRlcm5hbCBwcm9wZXJ0eSBmb3IgcmVuZGVyaW5nXHJcbiAgICBwdWJsaWMgZW5hYmxlZDogYm9vbGVhbiA9IHRydWU7XHJcbiAgICBwdWJsaWMgaW1hZ2VOb3JtYWw/OiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgcHVibGljIGltYWdlSG92ZXI/OiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgcHVibGljIGltYWdlRGlzYWJsZWQ/OiBIVE1MSW1hZ2VFbGVtZW50O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdGV4dDogc3RyaW5nLCBvbkNsaWNrPzogKCkgPT4gdm9pZCwgaW1hZ2VOb3JtYWw/OiBIVE1MSW1hZ2VFbGVtZW50LCBpbWFnZUhvdmVyPzogSFRNTEltYWdlRWxlbWVudCwgaW1hZ2VEaXNhYmxlZD86IEhUTUxJbWFnZUVsZW1lbnQpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMudGV4dCA9IHRleHQ7XHJcbiAgICAgICAgdGhpcy5vbkNsaWNrID0gb25DbGljaztcclxuICAgICAgICB0aGlzLmltYWdlTm9ybWFsID0gaW1hZ2VOb3JtYWw7XHJcbiAgICAgICAgdGhpcy5pbWFnZUhvdmVyID0gaW1hZ2VIb3ZlcjtcclxuICAgICAgICB0aGlzLmltYWdlRGlzYWJsZWQgPSBpbWFnZURpc2FibGVkO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBpc0NsaWNrZWQoeDogbnVtYmVyLCB5OiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5lbmFibGVkICYmIHggPj0gdGhpcy54ICYmIHggPD0gdGhpcy54ICsgdGhpcy53aWR0aCAmJiB5ID49IHRoaXMueSAmJiB5IDw9IHRoaXMueSArIHRoaXMuaGVpZ2h0O1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBjaGVja0hvdmVyKHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7IC8vIEltcGxlbWVudHMgQ2xpY2thYmxlLmNoZWNrSG92ZXJcclxuICAgICAgICB0aGlzLmlzSG92ZXJlZCA9IHRoaXMuZW5hYmxlZCAmJiB4ID49IHRoaXMueCAmJiB4IDw9IHRoaXMueCArIHRoaXMud2lkdGggJiYgeSA+PSB0aGlzLnkgJiYgeSA8PSB0aGlzLnkgKyB0aGlzLmhlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgdGV4dENvbG9yOiBzdHJpbmcsIGFjY2VudENvbG9yOiBzdHJpbmcpIHtcclxuICAgICAgICBsZXQgY3VycmVudEltYWdlID0gdGhpcy5pbWFnZU5vcm1hbDtcclxuICAgICAgICBpZiAoIXRoaXMuZW5hYmxlZCAmJiB0aGlzLmltYWdlRGlzYWJsZWQpIHtcclxuICAgICAgICAgICAgY3VycmVudEltYWdlID0gdGhpcy5pbWFnZURpc2FibGVkO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5pc0hvdmVyZWQgJiYgdGhpcy5pbWFnZUhvdmVyKSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRJbWFnZSA9IHRoaXMuaW1hZ2VIb3ZlcjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50SW1hZ2UpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShjdXJyZW50SW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHRoaXMuZW5hYmxlZCA/ICh0aGlzLmlzSG92ZXJlZCA/IGFjY2VudENvbG9yIDogXCIjNTU1XCIpIDogXCIjODg4XCI7XHJcbiAgICAgICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSB0ZXh0Q29sb3I7XHJcbiAgICAgICAgICAgIGN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICAgICAgICBjdHguc3Ryb2tlUmVjdCh0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHRleHRDb2xvcjtcclxuICAgICAgICBjdHguZm9udCA9IFwiMjBweCBBcmlhbFwiO1xyXG4gICAgICAgIGN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgIGN0eC50ZXh0QmFzZWxpbmUgPSBcIm1pZGRsZVwiO1xyXG4gICAgICAgIGN0eC5maWxsVGV4dCh0aGlzLnRleHQsIHRoaXMueCArIHRoaXMud2lkdGggLyAyLCB0aGlzLnkgKyB0aGlzLmhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQcm9ncmVzc0JhciB7XHJcbiAgICBwdWJsaWMgeDogbnVtYmVyO1xyXG4gICAgcHVibGljIHk6IG51bWJlcjtcclxuICAgIHB1YmxpYyB3aWR0aDogbnVtYmVyO1xyXG4gICAgcHVibGljIGhlaWdodDogbnVtYmVyO1xyXG4gICAgcHVibGljIG1heFZhbHVlOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgY3VycmVudFZhbHVlOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgZmlsbENvbG9yOiBzdHJpbmc7XHJcbiAgICBwdWJsaWMgYmdDb2xvcjogc3RyaW5nO1xyXG4gICAgcHVibGljIGxhYmVsPzogc3RyaW5nO1xyXG4gICAgcHVibGljIGZpbGxJbWFnZT86IEhUTUxJbWFnZUVsZW1lbnQ7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBtYXhWYWx1ZTogbnVtYmVyLCBjdXJyZW50VmFsdWU6IG51bWJlciwgZmlsbENvbG9yOiBzdHJpbmcsIGJnQ29sb3I6IHN0cmluZywgbGFiZWw/OiBzdHJpbmcsIGZpbGxJbWFnZT86IEhUTUxJbWFnZUVsZW1lbnQpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMubWF4VmFsdWUgPSBtYXhWYWx1ZTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRWYWx1ZSA9IGN1cnJlbnRWYWx1ZTtcclxuICAgICAgICB0aGlzLmZpbGxDb2xvciA9IGZpbGxDb2xvcjtcclxuICAgICAgICB0aGlzLmJnQ29sb3IgPSBiZ0NvbG9yO1xyXG4gICAgICAgIHRoaXMubGFiZWwgPSBsYWJlbDtcclxuICAgICAgICB0aGlzLmZpbGxJbWFnZSA9IGZpbGxJbWFnZTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgdGV4dENvbG9yOiBzdHJpbmcpIHtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gdGhpcy5iZ0NvbG9yO1xyXG4gICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBjb25zdCBmaWxsV2lkdGggPSAodGhpcy5jdXJyZW50VmFsdWUgLyB0aGlzLm1heFZhbHVlKSAqIHRoaXMud2lkdGg7XHJcbiAgICAgICAgaWYgKHRoaXMuZmlsbEltYWdlKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5maWxsSW1hZ2UsIHRoaXMueCwgdGhpcy55LCBmaWxsV2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gdGhpcy5maWxsQ29sb3I7XHJcbiAgICAgICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLngsIHRoaXMueSwgZmlsbFdpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIiNGRkZcIjtcclxuICAgICAgICBjdHgubGluZVdpZHRoID0gMTtcclxuICAgICAgICBjdHguc3Ryb2tlUmVjdCh0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5sYWJlbCkge1xyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gdGV4dENvbG9yO1xyXG4gICAgICAgICAgICBjdHguZm9udCA9IFwiMTZweCBBcmlhbFwiO1xyXG4gICAgICAgICAgICBjdHgudGV4dEFsaWduID0gXCJsZWZ0XCI7XHJcbiAgICAgICAgICAgIGN0eC50ZXh0QmFzZWxpbmUgPSBcIm1pZGRsZVwiO1xyXG4gICAgICAgICAgICBjdHguZmlsbFRleHQoYCR7dGhpcy5sYWJlbH0gJHtNYXRoLnJvdW5kKHRoaXMuY3VycmVudFZhbHVlKX0vJHt0aGlzLm1heFZhbHVlfWAsIHRoaXMueCwgdGhpcy55IC0gMTApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIEdhbWUgRW50aXRpZXMgLS0tXHJcblxyXG5jbGFzcyBQbGF5ZXIge1xyXG4gICAgcHVibGljIG1vbmV5OiBudW1iZXI7XHJcbiAgICBwdWJsaWMgZW5lcmd5OiBudW1iZXI7XHJcbiAgICBwdWJsaWMgbWF4RW5lcmd5OiBudW1iZXI7XHJcbiAgICBwdWJsaWMgZW5lcmd5UmVnZW5SYXRlOiBudW1iZXI7IC8vIHBlciBzZWNvbmRcclxuICAgIHB1YmxpYyBzdHJlc3M6IG51bWJlcjtcclxuICAgIHB1YmxpYyBtYXhTdHJlc3M6IG51bWJlcjtcclxuICAgIHB1YmxpYyBzdHJlc3NEZWNheVJhdGU6IG51bWJlcjsgLy8gcGVyIHNlY29uZFxyXG4gICAgcHVibGljIHBlcmZvcm1hbmNlU2NvcmU6IG51bWJlcjtcclxuICAgIHB1YmxpYyB0YXNrU3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgbWF4QWN0aXZlVGFza3M6IG51bWJlcjtcclxuICAgIHB1YmxpYyBmb2N1c1BvaW50c1BlckNsaWNrOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY29uZmlnOiBHYW1lQ29uZmlnKSB7XHJcbiAgICAgICAgdGhpcy5tb25leSA9IGNvbmZpZy5pbml0aWFsTW9uZXk7XHJcbiAgICAgICAgdGhpcy5lbmVyZ3kgPSBjb25maWcuaW5pdGlhbEVuZXJneTtcclxuICAgICAgICB0aGlzLm1heEVuZXJneSA9IGNvbmZpZy5tYXhFbmVyZ3k7XHJcbiAgICAgICAgdGhpcy5lbmVyZ3lSZWdlblJhdGUgPSBjb25maWcuZW5lcmd5UmVnZW5SYXRlO1xyXG4gICAgICAgIHRoaXMuc3RyZXNzID0gY29uZmlnLmluaXRpYWxTdHJlc3M7XHJcbiAgICAgICAgdGhpcy5tYXhTdHJlc3MgPSBjb25maWcubWF4U3RyZXNzO1xyXG4gICAgICAgIHRoaXMuc3RyZXNzRGVjYXlSYXRlID0gY29uZmlnLnN0cmVzc0RlY2F5UmF0ZTtcclxuICAgICAgICB0aGlzLnBlcmZvcm1hbmNlU2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMudGFza1NwZWVkTXVsdGlwbGllciA9IDEuMDsgLy8gQmFzZSBtdWx0aXBsaWVyXHJcbiAgICAgICAgdGhpcy5tYXhBY3RpdmVUYXNrcyA9IGNvbmZpZy5tYXhBY3RpdmVUYXNrcztcclxuICAgICAgICB0aGlzLmZvY3VzUG9pbnRzUGVyQ2xpY2sgPSBjb25maWcuZm9jdXNQb2ludHNQZXJDbGljaztcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgdXBkYXRlKGR0OiBudW1iZXIpIHtcclxuICAgICAgICAvLyBFbmVyZ3kgcmVnZW5lcmF0aW9uXHJcbiAgICAgICAgdGhpcy5lbmVyZ3kgPSBNYXRoLm1pbih0aGlzLm1heEVuZXJneSwgdGhpcy5lbmVyZ3kgKyB0aGlzLmVuZXJneVJlZ2VuUmF0ZSAqIGR0KTtcclxuICAgICAgICAvLyBTdHJlc3MgZGVjYXlcclxuICAgICAgICB0aGlzLnN0cmVzcyA9IE1hdGgubWF4KDAsIHRoaXMuc3RyZXNzIC0gdGhpcy5zdHJlc3NEZWNheVJhdGUgKiBkdCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGFkZE1vbmV5KGFtb3VudDogbnVtYmVyKSB7IHRoaXMubW9uZXkgKz0gYW1vdW50OyB9XHJcbiAgICBwdWJsaWMgc3BlbmRNb25leShhbW91bnQ6IG51bWJlcikgeyB0aGlzLm1vbmV5IC09IGFtb3VudDsgfVxyXG4gICAgcHVibGljIGFkZEVuZXJneShhbW91bnQ6IG51bWJlcikgeyB0aGlzLmVuZXJneSA9IE1hdGgubWluKHRoaXMubWF4RW5lcmd5LCB0aGlzLmVuZXJneSArIGFtb3VudCk7IH1cclxuICAgIHB1YmxpYyBsb3NlRW5lcmd5KGFtb3VudDogbnVtYmVyKSB7IHRoaXMuZW5lcmd5ID0gTWF0aC5tYXgoMCwgdGhpcy5lbmVyZ3kgLSBhbW91bnQpOyB9XHJcbiAgICBwdWJsaWMgYWRkU3RyZXNzKGFtb3VudDogbnVtYmVyKSB7IHRoaXMuc3RyZXNzID0gTWF0aC5taW4odGhpcy5tYXhTdHJlc3MsIHRoaXMuc3RyZXNzICsgYW1vdW50KTsgfVxyXG4gICAgcHVibGljIGxvc2VTdHJlc3MoYW1vdW50OiBudW1iZXIpIHsgdGhpcy5zdHJlc3MgPSBNYXRoLm1heCgwLCB0aGlzLnN0cmVzcyAtIGFtb3VudCk7IH1cclxuICAgIHB1YmxpYyBhZGRQZXJmb3JtYW5jZShhbW91bnQ6IG51bWJlcikgeyB0aGlzLnBlcmZvcm1hbmNlU2NvcmUgKz0gYW1vdW50OyB9XHJcblxyXG4gICAgcHVibGljIGFwcGx5VXBncmFkZSh1cGdyYWRlOiBVcGdyYWRlRGF0YSkge1xyXG4gICAgICAgIGlmICh1cGdyYWRlLmVmZmVjdFR5cGUgPT09IFwidGFza1NwZWVkTXVsdGlwbGllclwiKSB7XHJcbiAgICAgICAgICAgIHRoaXMudGFza1NwZWVkTXVsdGlwbGllciAqPSB1cGdyYWRlLmVmZmVjdFZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodXBncmFkZS5lZmZlY3RUeXBlID09PSBcInN0cmVzc0RlY2F5UmF0ZVwiKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RyZXNzRGVjYXlSYXRlICs9IHVwZ3JhZGUuZWZmZWN0VmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIGlmICh1cGdyYWRlLmVmZmVjdFR5cGUgPT09IFwiZW5lcmd5UmVnZW5SYXRlXCIpIHtcclxuICAgICAgICAgICAgdGhpcy5lbmVyZ3lSZWdlblJhdGUgKz0gdXBncmFkZS5lZmZlY3RWYWx1ZTtcclxuICAgICAgICB9IGVsc2UgaWYgKHVwZ3JhZGUuZWZmZWN0VHlwZSA9PT0gXCJtYXhBY3RpdmVUYXNrc1wiKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWF4QWN0aXZlVGFza3MgKz0gdXBncmFkZS5lZmZlY3RWYWx1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIFRhc2sgaW1wbGVtZW50cyBDbGlja2FibGUge1xyXG4gICAgcHVibGljIGlkOiBzdHJpbmc7XHJcbiAgICBwdWJsaWMgbmFtZTogc3RyaW5nO1xyXG4gICAgcHVibGljIGRlc2NyaXB0aW9uOiBzdHJpbmc7XHJcbiAgICBwdWJsaWMgaWNvbjogc3RyaW5nO1xyXG4gICAgcHVibGljIG1heFByb2dyZXNzOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgY3VycmVudFByb2dyZXNzOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgbW9uZXlSZXdhcmQ6IG51bWJlcjtcclxuICAgIHB1YmxpYyBwZXJmb3JtYW5jZVJld2FyZDogbnVtYmVyO1xyXG4gICAgcHVibGljIHN0cmVzc0Nvc3Q6IG51bWJlcjtcclxuICAgIHB1YmxpYyBpc0NvbXBsZXRlZDogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHVibGljIGlzSG92ZXJlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBJbnRlcm5hbCBwcm9wZXJ0eSBmb3IgcmVuZGVyaW5nXHJcbiAgICBwdWJsaWMgeDogbnVtYmVyID0gMDsgLy8gUG9zaXRpb24gZm9yIHJlbmRlcmluZ1xyXG4gICAgcHVibGljIHk6IG51bWJlciA9IDA7XHJcbiAgICBwdWJsaWMgd2lkdGg6IG51bWJlciA9IDA7XHJcbiAgICBwdWJsaWMgaGVpZ2h0OiBudW1iZXIgPSAwO1xyXG4gICAgcHVibGljIG9uQ2xpY2s/OiAoKSA9PiB2b2lkOyAvLyBUcmlnZ2VyZWQgYnkgZ2FtZSBsb2dpYywgbm90IGRpcmVjdGx5IGJ5IGJ1dHRvblxyXG5cclxuICAgIGNvbnN0cnVjdG9yKGRhdGE6IFRhc2tEYXRhKSB7XHJcbiAgICAgICAgdGhpcy5pZCA9IGRhdGEuaWQ7XHJcbiAgICAgICAgdGhpcy5uYW1lID0gZGF0YS5uYW1lO1xyXG4gICAgICAgIHRoaXMuZGVzY3JpcHRpb24gPSBkYXRhLmRlc2NyaXB0aW9uO1xyXG4gICAgICAgIHRoaXMuaWNvbiA9IGRhdGEuaWNvbjtcclxuICAgICAgICB0aGlzLm1heFByb2dyZXNzID0gZGF0YS5iYXNlRHVyYXRpb247XHJcbiAgICAgICAgdGhpcy5jdXJyZW50UHJvZ3Jlc3MgPSAwO1xyXG4gICAgICAgIHRoaXMubW9uZXlSZXdhcmQgPSBkYXRhLm1vbmV5UmV3YXJkO1xyXG4gICAgICAgIHRoaXMucGVyZm9ybWFuY2VSZXdhcmQgPSBkYXRhLnBlcmZvcm1hbmNlUmV3YXJkO1xyXG4gICAgICAgIHRoaXMuc3RyZXNzQ29zdCA9IGRhdGEuc3RyZXNzQ29zdDtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgdXBkYXRlKGR0OiBudW1iZXIsIHRhc2tTcGVlZE11bHRpcGxpZXI6IG51bWJlcikge1xyXG4gICAgICAgIC8vIFBhc3NpdmUgcHJvZ3Jlc3MgZm9yIHNvbWUgdGFza3MsIG9yIGlmIHBsYXllciBoYXMgYXV0by13b3JrZXJzIChub3QgaW1wbGVtZW50ZWQgeWV0KVxyXG4gICAgICAgIC8vIEZvciBub3csIHByb2dyZXNzIG9ubHkgdmlhIGNsaWNrXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFByb2dyZXNzIDwgdGhpcy5tYXhQcm9ncmVzcykge1xyXG4gICAgICAgICAgICAvLyBQbGFjZWhvbGRlciBmb3IgZnV0dXJlIGF1dG8tcHJvZ3Jlc3NcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGFwcGx5Rm9jdXMoZm9jdXNQb2ludHM6IG51bWJlciwgcGxheWVyVGFza1NwZWVkTXVsdGlwbGllcjogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgICAgICBpZiAodGhpcy5pc0NvbXBsZXRlZCkgcmV0dXJuIDA7XHJcbiAgICAgICAgY29uc3QgYWN0dWFsRm9jdXMgPSBmb2N1c1BvaW50cyAqIHBsYXllclRhc2tTcGVlZE11bHRpcGxpZXI7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50UHJvZ3Jlc3MgKz0gYWN0dWFsRm9jdXM7XHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFByb2dyZXNzID49IHRoaXMubWF4UHJvZ3Jlc3MpIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50UHJvZ3Jlc3MgPSB0aGlzLm1heFByb2dyZXNzO1xyXG4gICAgICAgICAgICB0aGlzLmlzQ29tcGxldGVkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGFjdHVhbEZvY3VzO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBpc0NsaWNrZWQoeDogbnVtYmVyLCB5OiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4geCA+PSB0aGlzLnggJiYgeCA8PSB0aGlzLnggKyB0aGlzLndpZHRoICYmIHkgPj0gdGhpcy55ICYmIHkgPD0gdGhpcy55ICsgdGhpcy5oZWlnaHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGNoZWNrSG92ZXIoeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHsgLy8gSW1wbGVtZW50cyBDbGlja2FibGUuY2hlY2tIb3ZlclxyXG4gICAgICAgIHRoaXMuaXNIb3ZlcmVkID0geCA+PSB0aGlzLnggJiYgeCA8PSB0aGlzLnggKyB0aGlzLndpZHRoICYmIHkgPj0gdGhpcy55ICYmIHkgPD0gdGhpcy55ICsgdGhpcy5oZWlnaHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyLCBnYW1lQ29uZmlnOiBHYW1lQ29uZmlnKSB7XHJcbiAgICAgICAgY29uc3QgaWNvbiA9IGFzc2V0TWFuYWdlci5nZXRJbWFnZSh0aGlzLmljb24pO1xyXG4gICAgICAgIGNvbnN0IHRhc2tTbG90QmcgPSBhc3NldE1hbmFnZXIuZ2V0SW1hZ2UoXCJ0YXNrX3Nsb3RfYmdcIik7XHJcblxyXG4gICAgICAgIC8vIEJhY2tncm91bmQgLyBTbG90XHJcbiAgICAgICAgaWYgKHRhc2tTbG90QmcpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0YXNrU2xvdEJnLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSB0aGlzLmlzSG92ZXJlZCA/IGdhbWVDb25maWcuYWNjZW50Q29sb3IgOiBnYW1lQ29uZmlnLnVpUGFuZWxDb2xvcjtcclxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IGdhbWVDb25maWcudGV4dENvbG9yO1xyXG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gMjtcclxuICAgICAgICAgICAgY3R4LnN0cm9rZVJlY3QodGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEljb25cclxuICAgICAgICBpZiAoaWNvbikge1xyXG4gICAgICAgICAgICBjb25zdCBpY29uU2l6ZSA9IHRoaXMuaGVpZ2h0ICogMC42O1xyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGljb24sIHRoaXMueCArIDEwLCB0aGlzLnkgKyAodGhpcy5oZWlnaHQgLSBpY29uU2l6ZSkgLyAyLCBpY29uU2l6ZSwgaWNvblNpemUpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTmFtZVxyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBnYW1lQ29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICBjdHguZm9udCA9IFwiMThweCBBcmlhbFwiO1xyXG4gICAgICAgIGN0eC50ZXh0QWxpZ24gPSBcImxlZnRcIjtcclxuICAgICAgICBjdHgudGV4dEJhc2VsaW5lID0gXCJ0b3BcIjtcclxuICAgICAgICBjdHguZmlsbFRleHQodGhpcy5uYW1lLCB0aGlzLnggKyB0aGlzLmhlaWdodCAqIDAuNiArIDIwLCB0aGlzLnkgKyAxMCk7XHJcblxyXG4gICAgICAgIC8vIFByb2dyZXNzIGJhclxyXG4gICAgICAgIGNvbnN0IHByb2dyZXNzWCA9IHRoaXMueCArIHRoaXMuaGVpZ2h0ICogMC42ICsgMjA7XHJcbiAgICAgICAgY29uc3QgcHJvZ3Jlc3NZID0gdGhpcy55ICsgdGhpcy5oZWlnaHQgLSAzMDtcclxuICAgICAgICBjb25zdCBwcm9ncmVzc0JhcldpZHRoID0gdGhpcy53aWR0aCAtICh0aGlzLmhlaWdodCAqIDAuNiArIDMwKTtcclxuICAgICAgICBjb25zdCBwcm9ncmVzc0JhckhlaWdodCA9IDE1O1xyXG5cclxuICAgICAgICBjb25zdCBwcm9ncmVzc0JhciA9IG5ldyBQcm9ncmVzc0JhcihcclxuICAgICAgICAgICAgcHJvZ3Jlc3NYLCBwcm9ncmVzc1ksIHByb2dyZXNzQmFyV2lkdGgsIHByb2dyZXNzQmFySGVpZ2h0LFxyXG4gICAgICAgICAgICB0aGlzLm1heFByb2dyZXNzLCB0aGlzLmN1cnJlbnRQcm9ncmVzcyxcclxuICAgICAgICAgICAgZ2FtZUNvbmZpZy5hY2NlbnRDb2xvciwgXCIjNTU1NTU1XCIsXHJcbiAgICAgICAgICAgIG51bGxcclxuICAgICAgICApO1xyXG4gICAgICAgIHByb2dyZXNzQmFyLmRyYXcoY3R4LCBnYW1lQ29uZmlnLnRleHRDb2xvcik7XHJcblxyXG4gICAgICAgIC8vIFByb2dyZXNzIHRleHRcclxuICAgICAgICBjdHguZm9udCA9IFwiMTRweCBBcmlhbFwiO1xyXG4gICAgICAgIGN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgIGN0eC50ZXh0QmFzZWxpbmUgPSBcIm1pZGRsZVwiO1xyXG4gICAgICAgIGN0eC5maWxsVGV4dChgJHtNYXRoLnJvdW5kKHRoaXMuY3VycmVudFByb2dyZXNzKX0vJHt0aGlzLm1heFByb2dyZXNzfWAsIHByb2dyZXNzWCArIHByb2dyZXNzQmFyV2lkdGggLyAyLCBwcm9ncmVzc1kgKyBwcm9ncmVzc0JhckhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyAtLS0gTWFpbiBHYW1lIENsYXNzIC0tLVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFLFxyXG4gICAgSU5TVFJVQ1RJT05TLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUixcclxuICAgIEdBTUVfV0lOLFxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlciE6IEFzc2V0TWFuYWdlcjtcclxuICAgIHByaXZhdGUgYXVkaW9QbGF5ZXIhOiBBdWRpb1BsYXllcjtcclxuICAgIHByaXZhdGUgZ2FtZURhdGEhOiBHYW1lRGF0YTtcclxuXHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICBwcml2YXRlIHBsYXllciE6IFBsYXllcjtcclxuICAgIHByaXZhdGUgYWN0aXZlVGFza3M6IFRhc2tbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBhbGxUYXNrc0RhdGE6IFRhc2tEYXRhW10gPSBbXTtcclxuICAgIHByaXZhdGUgYXZhaWxhYmxlVXBncmFkZXNEYXRhOiBVcGdyYWRlRGF0YVtdID0gW107XHJcbiAgICBwcml2YXRlIHB1cmNoYXNlZFVwZ3JhZGVJZHM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xyXG4gICAgcHJpdmF0ZSBldmVudHNEYXRhOiBFdmVudERhdGFbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50RXZlbnQ6IEV2ZW50RGF0YSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBldmVudERpc3BsYXlUaW1lcjogbnVtYmVyID0gMDsgLy8gSG93IGxvbmcgYW4gZXZlbnQgbWVzc2FnZSBzdGF5c1xyXG5cclxuICAgIHByaXZhdGUgdWlFbGVtZW50czogQ2xpY2thYmxlW10gPSBbXTtcclxuICAgIHByaXZhdGUgZ2FtZUJ1dHRvbnM6IEJ1dHRvbltdID0gW107IC8vIEJ1dHRvbnMgZm9yIHRoZSBjdXJyZW50IHNjcmVlblxyXG4gICAgcHJpdmF0ZSB0YXNrQnV0dG9uczogVGFza1tdID0gW107IC8vIFRhc2tzIGFzIGNsaWNrYWJsZSBlbGVtZW50c1xyXG4gICAgcHJpdmF0ZSB1cGdyYWRlQnV0dG9uczogQnV0dG9uW10gPSBbXTsgLy8gVXBncmFkZSBidXR0b25zXHJcblxyXG4gICAgcHJpdmF0ZSBsYXN0VGltZXN0YW1wOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDsgLy8gRml4ZWQgdHlwb1xyXG4gICAgcHJpdmF0ZSBtb3VzZVg6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1vdXNlWTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgaXNNb3VzZURvd246IGJvb2xlYW4gPSBmYWxzZTsgLy8gVG8gdHJhY2sgaWYgbW91c2UgYnV0dG9uIGlzIGhlbGQgZG93biBmb3IgdGFzayBmb2N1c1xyXG5cclxuICAgIHByaXZhdGUgdGFza1NwYXduVGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGdhbWVUaW1lRWxhcHNlZDogbnVtYmVyID0gMDsgLy8gRm9yIHdvcmtkYXkgdGltZXJcclxuICAgIHByaXZhdGUgZXZlbnRUcmlnZ2VyVGltZXI6IG51bWJlciA9IDA7XHJcblxyXG4gICAgLy8gVUkgcG9zaXRpb25zIGFuZCBzaXplc1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBVSV9UQVNLX1BBTkVMX1g6IG51bWJlcjtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgVUlfVEFTS19QQU5FTF9ZOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IFVJX1RBU0tfUEFORUxfV0lEVEg6IG51bWJlcjtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgVUlfVEFTS19IRUlHSFQ6IG51bWJlciA9IDgwO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBVSV9UQVNLX1NQQUNJTkc6IG51bWJlciA9IDEwO1xyXG5cclxuICAgIC8vIFJlbW92ZWQgJ3JlYWRvbmx5JyBtb2RpZmllciBhcyB0aGVzZSBhcmUgYXNzaWduZWQgYWZ0ZXIgY2FudmFzIHdpZHRoIGlzIGtub3duXHJcbiAgICBwcml2YXRlIFVJX1VQR1JBREVfUEFORUxfWDogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBVSV9VUEdSQURFX1BBTkVMX1k6IG51bWJlcjtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgVUlfVVBHUkFERV9QQU5FTF9XSURUSDogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBVSV9VUEdSQURFX1BBTkVMX0hFSUdIVDogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBVSV9VUEdSQURFX0JVVFRPTl9XSURUSDogbnVtYmVyID0gMjUwO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBVSV9VUEdSQURFX0JVVFRPTl9IRUlHSFQ6IG51bWJlciA9IDYwO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBVSV9VUEdSQURFX1NQQUNJTkc6IG51bWJlciA9IDE1O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpITtcclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXJzKCk7XHJcblxyXG4gICAgICAgIC8vIEluaXRpYWxpemUgZGVmYXVsdCBzaXplcywgd2lsbCBiZSB1cGRhdGVkIGFmdGVyIGNvbmZpZyBpcyBsb2FkZWRcclxuICAgICAgICB0aGlzLlVJX1RBU0tfUEFORUxfV0lEVEggPSA1MDA7XHJcbiAgICAgICAgdGhpcy5VSV9UQVNLX1BBTkVMX1ggPSAxMDtcclxuICAgICAgICB0aGlzLlVJX1RBU0tfUEFORUxfWSA9IDEwMDtcclxuXHJcbiAgICAgICAgdGhpcy5VSV9VUEdSQURFX1BBTkVMX1dJRFRIID0gMzAwO1xyXG4gICAgICAgIHRoaXMuVUlfVVBHUkFERV9QQU5FTF9IRUlHSFQgPSA2MDA7XHJcbiAgICAgICAgLy8gSW5pdGlhbCBhc3NpZ25tZW50LCB3aWxsIGJlIHVwZGF0ZWQgYWZ0ZXIgY2FudmFzIHdpZHRoIGlzIHNldFxyXG4gICAgICAgIHRoaXMuVUlfVVBHUkFERV9QQU5FTF9YID0gdGhpcy5jYW52YXMud2lkdGggLSB0aGlzLlVJX1VQR1JBREVfUEFORUxfV0lEVEggLSAxMDtcclxuICAgICAgICB0aGlzLlVJX1VQR1JBREVfUEFORUxfWSA9IDEwMDtcclxuXHJcbiAgICAgICAgdGhpcy5sb2FkR2FtZURhdGFBbmRBc3NldHMoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFkZEV2ZW50TGlzdGVuZXJzKCkge1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMub25Nb3VzZU1vdmUuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpKTtcclxuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgdGhpcy5vbk1vdXNlVXAuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkR2FtZURhdGFBbmRBc3NldHMoKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZURhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuZ2FtZURhdGEuZ2FtZUNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuVUlfVVBHUkFERV9QQU5FTF9YID0gdGhpcy5jYW52YXMud2lkdGggLSB0aGlzLlVJX1VQR1JBREVfUEFORUxfV0lEVEggLSAxMDtcclxuICAgICAgICAgICAgdGhpcy5VSV9VUEdSQURFX1BBTkVMX1kgPSAxMDA7IC8vIEZpeGVkIFlcclxuXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyID0gbmV3IEFzc2V0TWFuYWdlcih0aGlzLmdhbWVEYXRhLmFzc2V0cyk7XHJcbiAgICAgICAgICAgIC8vIFVzZSBnZXRTb3VuZHMoKSB0byBhY2Nlc3MgdGhlIHByaXZhdGUgc291bmRzIG1hcFxyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvUGxheWVyID0gbmV3IEF1ZGlvUGxheWVyKHRoaXMuYXNzZXRNYW5hZ2VyLmdldFNvdW5kcygpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZURhdGEuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSBcImJnbV9vZmZpY2VcIik/LnZvbHVtZSB8fCAwLjMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lRGF0YS5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09IFwic2Z4X2NsaWNrXCIpPy52b2x1bWUgfHwgMC43KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnNldE9uUHJvZ3Jlc3MocHJvZ3Jlc3MgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJMb2FkaW5nU2NyZWVuKHByb2dyZXNzKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLnNldE9uQ29tcGxldGUoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5pbml0R2FtZSgpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXNzZXRNYW5hZ2VyLmxvYWRBbGwoKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhIG9yIGFzc2V0czpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5IHJlbmRlciBhbiBlcnJvciBzY3JlZW5cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIodGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnKTtcclxuICAgICAgICB0aGlzLmFsbFRhc2tzRGF0YSA9IFsuLi50aGlzLmdhbWVEYXRhLnRhc2tzXTtcclxuICAgICAgICB0aGlzLmF2YWlsYWJsZVVwZ3JhZGVzRGF0YSA9IFsuLi50aGlzLmdhbWVEYXRhLnVwZ3JhZGVzXTtcclxuICAgICAgICB0aGlzLmV2ZW50c0RhdGEgPSBbLi4udGhpcy5nYW1lRGF0YS5ldmVudHNdO1xyXG4gICAgICAgIHRoaXMuYWN0aXZlVGFza3MgPSBbXTtcclxuICAgICAgICB0aGlzLnB1cmNoYXNlZFVwZ3JhZGVJZHMuY2xlYXIoKTtcclxuICAgICAgICB0aGlzLmdhbWVUaW1lRWxhcHNlZCA9IDA7XHJcbiAgICAgICAgdGhpcy50YXNrU3Bhd25UaW1lciA9IHRoaXMuZ2V0UmFuZG9tVGFza1NwYXduSW50ZXJ2YWwoKTtcclxuICAgICAgICB0aGlzLmV2ZW50VHJpZ2dlclRpbWVyID0gMTA7IC8vIEZpcnN0IGV2ZW50IGNoZWNrIGFmdGVyIDEwIHNlY29uZHNcclxuXHJcbiAgICAgICAgdGhpcy5zZXR1cFRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgdGhpcy5nYW1lTG9vcCgwKTsgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICB0aGlzLnVpRWxlbWVudHMgPSBbXTtcclxuICAgICAgICB0aGlzLmdhbWVCdXR0b25zID0gW107XHJcblxyXG4gICAgICAgIHRoaXMuYXVkaW9QbGF5ZXIucGxheUJHTShcImJnbV9vZmZpY2VcIik7XHJcblxyXG4gICAgICAgIGNvbnN0IHN0YXJ0QnV0dG9uID0gbmV3IEJ1dHRvbihcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggLyAyIC0gMTUwIC8gMixcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMTAwLFxyXG4gICAgICAgICAgICAxNTAsIDUwLFxyXG4gICAgICAgICAgICB0aGlzLmdhbWVEYXRhLnRleHRzLmNsaWNrVG9TdGFydCxcclxuICAgICAgICAgICAgKCkgPT4gdGhpcy5zZXR1cEluc3RydWN0aW9uc1NjcmVlbigpLFxyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShcImJ1dHRvbl9ub3JtYWxcIiksXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKFwiYnV0dG9uX2hvdmVyXCIpXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLmdhbWVCdXR0b25zLnB1c2goc3RhcnRCdXR0b24pO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50cy5wdXNoKHN0YXJ0QnV0dG9uKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwSW5zdHJ1Y3Rpb25zU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUztcclxuICAgICAgICB0aGlzLnVpRWxlbWVudHMgPSBbXTtcclxuICAgICAgICB0aGlzLmdhbWVCdXR0b25zID0gW107XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXlCdXR0b24gPSBuZXcgQnV0dG9uKFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCAvIDIgLSAxNTAgLyAyLFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgLSAxMDAsXHJcbiAgICAgICAgICAgIDE1MCwgNTAsXHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZURhdGEudGV4dHMuaW5zdHJ1Y3Rpb25zVGV4dFt0aGlzLmdhbWVEYXRhLnRleHRzLmluc3RydWN0aW9uc1RleHQubGVuZ3RoIC0gMV0sXHJcbiAgICAgICAgICAgICgpID0+IHRoaXMuc3RhcnRHYW1lcGxheSgpLFxyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShcImJ1dHRvbl9ub3JtYWxcIiksXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKFwiYnV0dG9uX2hvdmVyXCIpXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLmdhbWVCdXR0b25zLnB1c2gocGxheUJ1dHRvbik7XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzLnB1c2gocGxheUJ1dHRvbik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWVwbGF5KCkge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzID0gW107XHJcbiAgICAgICAgdGhpcy50YXNrQnV0dG9ucyA9IFtdO1xyXG4gICAgICAgIHRoaXMudXBncmFkZUJ1dHRvbnMgPSBbXTtcclxuICAgICAgICB0aGlzLmdhbWVCdXR0b25zID0gW107IC8vIENsZWFyIGFueSByZXNpZHVhbCBidXR0b25zXHJcblxyXG4gICAgICAgIHRoaXMuc2V0dXBVcGdyYWRlUGFuZWxCdXR0b25zKCk7XHJcbiAgICAgICAgLy8gVGFza3MgYXJlIGR5bmFtaWNhbGx5IGFkZGVkIHRvIHRhc2tCdXR0b25zXHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cFVwZ3JhZGVQYW5lbEJ1dHRvbnMoKSB7XHJcbiAgICAgICAgdGhpcy51cGdyYWRlQnV0dG9ucyA9IFtdO1xyXG4gICAgICAgIC8vIENsZWFyIHByZXZpb3VzIHVwZ3JhZGUgYnV0dG9ucyBmcm9tIHVpRWxlbWVudHMgdG8gcHJldmVudCBkdXBsaWNhdGVzIGFuZCBvbGQgcmVmZXJlbmNlc1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50cyA9IHRoaXMudWlFbGVtZW50cy5maWx0ZXIoZWwgPT4gIShlbCBpbnN0YW5jZW9mIEJ1dHRvbiAmJiB0aGlzLmF2YWlsYWJsZVVwZ3JhZGVzRGF0YS5zb21lKHUgPT4gZWwudGV4dC5pbmNsdWRlcyh1Lm5hbWUpKSkpO1xyXG5cclxuICAgICAgICBsZXQgdXBncmFkZUJ1dHRvblkgPSB0aGlzLlVJX1VQR1JBREVfUEFORUxfWSArIDUwOyAvLyBTdGFydCBiZWxvdyB0aXRsZVxyXG5cclxuICAgICAgICB0aGlzLmF2YWlsYWJsZVVwZ3JhZGVzRGF0YS5mb3JFYWNoKHVwZ3JhZGVEYXRhID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaXNQdXJjaGFzZWQgPSB0aGlzLnB1cmNoYXNlZFVwZ3JhZGVJZHMuaGFzKHVwZ3JhZGVEYXRhLmlkKTtcclxuICAgICAgICAgICAgY29uc3QgYnV0dG9uVGV4dCA9IGlzUHVyY2hhc2VkID8gYCR7dXBncmFkZURhdGEubmFtZX0gKFx1QUQ2Q1x1QjlFNFx1QjQyOClgIDogYCR7dXBncmFkZURhdGEubmFtZX0gKFx1MjBBOSR7dXBncmFkZURhdGEuY29zdH0pYDtcclxuICAgICAgICAgICAgY29uc3QgYnV0dG9uID0gbmV3IEJ1dHRvbihcclxuICAgICAgICAgICAgICAgIHRoaXMuVUlfVVBHUkFERV9QQU5FTF9YICsgKHRoaXMuVUlfVVBHUkFERV9QQU5FTF9XSURUSCAtIHRoaXMuVUlfVVBHUkFERV9CVVRUT05fV0lEVEgpIC8gMixcclxuICAgICAgICAgICAgICAgIHVwZ3JhZGVCdXR0b25ZLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5VSV9VUEdSQURFX0JVVFRPTl9XSURUSCxcclxuICAgICAgICAgICAgICAgIHRoaXMuVUlfVVBHUkFERV9CVVRUT05fSEVJR0hULFxyXG4gICAgICAgICAgICAgICAgYnV0dG9uVGV4dCxcclxuICAgICAgICAgICAgICAgICgpID0+IHRoaXMuYnV5VXBncmFkZSh1cGdyYWRlRGF0YS5pZCksXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShcImJ1dHRvbl9ub3JtYWxcIiksXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShcImJ1dHRvbl9ob3ZlclwiKSxcclxuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKFwiYnV0dG9uX25vcm1hbFwiKSAvLyBVc2Ugbm9ybWFsIGFzIGRpc2FibGVkIGxvb2sgZm9yIG5vd1xyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBidXR0b24uZW5hYmxlZCA9ICFpc1B1cmNoYXNlZCAmJiB0aGlzLnBsYXllci5tb25leSA+PSB1cGdyYWRlRGF0YS5jb3N0O1xyXG4gICAgICAgICAgICB0aGlzLnVwZ3JhZGVCdXR0b25zLnB1c2goYnV0dG9uKTtcclxuICAgICAgICAgICAgdGhpcy51aUVsZW1lbnRzLnB1c2goYnV0dG9uKTsgLy8gQWRkIHRvIGdlbmVyYWwgVUkgZWxlbWVudHMgZm9yIGNsaWNrL2hvdmVyXHJcbiAgICAgICAgICAgIHVwZ3JhZGVCdXR0b25ZICs9IHRoaXMuVUlfVVBHUkFERV9CVVRUT05fSEVJR0hUICsgdGhpcy5VSV9VUEdSQURFX1NQQUNJTkc7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRSYW5kb21UYXNrU3Bhd25JbnRlcnZhbCgpOiBudW1iZXIge1xyXG4gICAgICAgIGNvbnN0IHsgdGFza1NwYXduSW50ZXJ2YWxNaW4sIHRhc2tTcGF3bkludGVydmFsTWF4IH0gPSB0aGlzLmdhbWVEYXRhLmdhbWVDb25maWc7XHJcbiAgICAgICAgcmV0dXJuIE1hdGgucmFuZG9tKCkgKiAodGFza1NwYXduSW50ZXJ2YWxNYXggLSB0YXNrU3Bhd25JbnRlcnZhbE1pbikgKyB0YXNrU3Bhd25JbnRlcnZhbE1pbjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduUmFuZG9tVGFzaygpIHtcclxuICAgICAgICBpZiAodGhpcy5hY3RpdmVUYXNrcy5sZW5ndGggPj0gdGhpcy5wbGF5ZXIubWF4QWN0aXZlVGFza3MgfHwgdGhpcy5hbGxUYXNrc0RhdGEubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGF2YWlsYWJsZVRhc2tzID0gdGhpcy5hbGxUYXNrc0RhdGE7IC8vIEFsbCB0YXNrcyBjYW4gYmUgc3Bhd25lZCBhZ2FpblxyXG4gICAgICAgIGNvbnN0IHJhbmRvbVRhc2tEYXRhID0gYXZhaWxhYmxlVGFza3NbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYXZhaWxhYmxlVGFza3MubGVuZ3RoKV07XHJcbiAgICAgICAgY29uc3QgbmV3VGFzayA9IG5ldyBUYXNrKHJhbmRvbVRhc2tEYXRhKTtcclxuICAgICAgICB0aGlzLmFjdGl2ZVRhc2tzLnB1c2gobmV3VGFzayk7XHJcbiAgICAgICAgdGhpcy50YXNrQnV0dG9ucy5wdXNoKG5ld1Rhc2spOyAvLyBBZGQgdG8gY2xpY2thYmxlIHRhc2tzXHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzLnB1c2gobmV3VGFzayk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBidXlVcGdyYWRlKHVwZ3JhZGVJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5hdWRpb1BsYXllci5wbGF5U0ZYKFwic2Z4X2NsaWNrXCIpO1xyXG4gICAgICAgIGNvbnN0IHVwZ3JhZGVEYXRhID0gdGhpcy5hdmFpbGFibGVVcGdyYWRlc0RhdGEuZmluZCh1ID0+IHUuaWQgPT09IHVwZ3JhZGVJZCk7XHJcbiAgICAgICAgaWYgKHVwZ3JhZGVEYXRhICYmICF0aGlzLnB1cmNoYXNlZFVwZ3JhZGVJZHMuaGFzKHVwZ3JhZGVEYXRhLmlkKSAmJiB0aGlzLnBsYXllci5tb25leSA+PSB1cGdyYWRlRGF0YS5jb3N0KSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLnNwZW5kTW9uZXkodXBncmFkZURhdGEuY29zdCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLmFwcGx5VXBncmFkZSh1cGdyYWRlRGF0YSk7XHJcbiAgICAgICAgICAgIHRoaXMucHVyY2hhc2VkVXBncmFkZUlkcy5hZGQodXBncmFkZURhdGEuaWQpO1xyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvUGxheWVyLnBsYXlTRlgoXCJzZnhfdXBncmFkZVwiKTtcclxuICAgICAgICAgICAgdGhpcy5zZXR1cFVwZ3JhZGVQYW5lbEJ1dHRvbnMoKTsgLy8gUmUtcmVuZGVyIHVwZ3JhZGUgYnV0dG9ucyB0byBzaG93IGNoYW5nZXNcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB0cmlnZ2VyUmFuZG9tRXZlbnQoKSB7XHJcbiAgICAgICAgY29uc3QgcG90ZW50aWFsRXZlbnRzID0gdGhpcy5ldmVudHNEYXRhLmZpbHRlcihlID0+IE1hdGgucmFuZG9tKCkgPCBlLnRyaWdnZXJDaGFuY2UpO1xyXG4gICAgICAgIGlmIChwb3RlbnRpYWxFdmVudHMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvUGxheWVyLnBsYXlTRlgoXCJzZnhfZXZlbnRcIik7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEV2ZW50ID0gcG90ZW50aWFsRXZlbnRzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHBvdGVudGlhbEV2ZW50cy5sZW5ndGgpXTtcclxuICAgICAgICAgICAgdGhpcy5ldmVudERpc3BsYXlUaW1lciA9IDU7IC8vIERpc3BsYXkgZm9yIDUgc2Vjb25kc1xyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudEV2ZW50LmVmZmVjdFR5cGUgPT09IFwic3RyZXNzQm9vc3RcIikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYWRkU3RyZXNzKHRoaXMuY3VycmVudEV2ZW50LmVmZmVjdFZhbHVlKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnRFdmVudC5lZmZlY3RUeXBlID09PSBcImJvbnVzVGFza1wiKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTcGF3biBhbiBhZGRpdGlvbmFsIHRhc2tcclxuICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25SYW5kb21UYXNrKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5ldmVudFRyaWdnZXJUaW1lciA9IE1hdGgucmFuZG9tKCkgKiAyMCArIDE1OyAvLyBOZXh0IGV2ZW50IGNoZWNrIGJldHdlZW4gMTUtMzUgc2Vjb25kc1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AodGltZXN0YW1wOiBET01IaWdoUmVzVGltZVN0YW1wKSB7IC8vIEZpeGVkIHR5cG9cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZXN0YW1wIC0gdGhpcy5sYXN0VGltZXN0YW1wKSAvIDEwMDA7IC8vIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RUaW1lc3RhbXAgPSB0aW1lc3RhbXA7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZHQ6IG51bWJlcikge1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZShkdCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVUaW1lRWxhcHNlZCArPSBkdDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBUYXNrIHNwYXduaW5nXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRhc2tTcGF3blRpbWVyIC09IGR0ICogMTAwMDsgLy8gQ29udmVydCBkdCB0byBtcyBmb3IgY29tcGFyaXNvblxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudGFza1NwYXduVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3Bhd25SYW5kb21UYXNrKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YXNrU3Bhd25UaW1lciA9IHRoaXMuZ2V0UmFuZG9tVGFza1NwYXduSW50ZXJ2YWwoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBFdmVudCB0cmlnZ2VyaW5nXHJcbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50VHJpZ2dlclRpbWVyIC09IGR0O1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZXZlbnRUcmlnZ2VyVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudHJpZ2dlclJhbmRvbUV2ZW50KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRXZlbnQgZGlzcGxheSB0aW1lclxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudEV2ZW50ICYmIHRoaXMuZXZlbnREaXNwbGF5VGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ldmVudERpc3BsYXlUaW1lciAtPSBkdDtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5ldmVudERpc3BsYXlUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEV2ZW50ID0gbnVsbDsgLy8gSGlkZSBldmVudFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBUYXNrIHByb2dyZXNzIGZyb20gY2xpY2tzXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pc01vdXNlRG93bikge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsaWNrZWRUYXNrID0gdGhpcy50YXNrQnV0dG9ucy5maW5kKHRhc2sgPT4gdGFzay5pc0hvdmVyZWQpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbGlja2VkVGFzayAmJiAhY2xpY2tlZFRhc2suaXNDb21wbGV0ZWQgJiYgdGhpcy5wbGF5ZXIuZW5lcmd5ID4gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9ncmVzc01hZGUgPSBjbGlja2VkVGFzay5hcHBseUZvY3VzKHRoaXMucGxheWVyLmZvY3VzUG9pbnRzUGVyQ2xpY2sgKiBkdCwgdGhpcy5wbGF5ZXIudGFza1NwZWVkTXVsdGlwbGllcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcm9ncmVzc01hZGUgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5sb3NlRW5lcmd5KHByb2dyZXNzTWFkZSAqIDAuMSk7IC8vIEVuZXJneSBjb3N0IHBlciBwcm9ncmVzcyBwb2ludFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYWRkU3RyZXNzKHByb2dyZXNzTWFkZSAqIGNsaWNrZWRUYXNrLnN0cmVzc0Nvc3QgLyBjbGlja2VkVGFzay5tYXhQcm9ncmVzcyAqIDAuMSk7IC8vIFN0cmVzcyBjb3N0IHBlciBwcm9ncmVzcyBwb2ludFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbGlja2VkVGFzay5pc0NvbXBsZXRlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hdWRpb1BsYXllci5wbGF5U0ZYKFwic2Z4X3Rhc2tfY29tcGxldGVcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5hZGRNb25leShjbGlja2VkVGFzay5tb25leVJld2FyZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5hZGRQZXJmb3JtYW5jZShjbGlja2VkVGFzay5wZXJmb3JtYW5jZVJld2FyZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBjb21wbGV0ZWQgdGFzayBmcm9tIGFjdGl2ZVRhc2tzLCB0YXNrQnV0dG9ucywgYW5kIHVpRWxlbWVudHNcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlVGFza3MgPSB0aGlzLmFjdGl2ZVRhc2tzLmZpbHRlcih0ID0+IHQgIT09IGNsaWNrZWRUYXNrKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGFza0J1dHRvbnMgPSB0aGlzLnRhc2tCdXR0b25zLmZpbHRlcih0ID0+IHQgIT09IGNsaWNrZWRUYXNrKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudWlFbGVtZW50cyA9IHRoaXMudWlFbGVtZW50cy5maWx0ZXIoZWwgPT4gZWwgIT09IGNsaWNrZWRUYXNrKTsgLy8gVGhpcyBjb21wYXJpc29uIHNob3VsZCBub3cgYmUgZmluZVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0dXBVcGdyYWRlUGFuZWxCdXR0b25zKCk7IC8vIENoZWNrIGlmIG5ldyB1cGdyYWRlcyBhcmUgYWZmb3JkYWJsZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIEdhbWUgT3ZlciAvIFdpbiBDb25kaXRpb25zXHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuc3RyZXNzID49IHRoaXMucGxheWVyLm1heFN0cmVzcykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2V0R2FtZU92ZXIodGhpcy5nYW1lRGF0YS50ZXh0cy5nYW1lT3ZlclN0cmVzcyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMucGxheWVyLmVuZXJneSA8PSAwICYmIHRoaXMuYWN0aXZlVGFza3Muc29tZSh0ID0+ICF0LmlzQ29tcGxldGVkKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbnNpZGVyIGdhbWUgb3ZlciBpZiBlbmVyZ3kgaXMgMCBhbmQgdGhlcmUgYXJlIHN0aWxsIHVuY29tcGxldGVkIHRhc2tzXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHksIGxldCdzIG1ha2UgaXQgYW4gaW1tZWRpYXRlIGdhbWUgb3ZlciBpZiBlbmVyZ3kgaXMgMCBhbmQgdGFza3MgYXJlIHByZXNlbnRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldEdhbWVPdmVyKHRoaXMuZ2FtZURhdGEudGV4dHMuZ2FtZU92ZXJFbmVyZ3kpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdhbWVUaW1lRWxhcHNlZCA+PSB0aGlzLmdhbWVEYXRhLmdhbWVDb25maWcuZ2FtZURheUR1cmF0aW9uU2Vjb25kcykge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5wZXJmb3JtYW5jZVNjb3JlID49IHRoaXMuZ2FtZURhdGEuZ2FtZUNvbmZpZy5lYXJseUxlYXZlU2NvcmVUYXJnZXQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRHYW1lV2luKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRHYW1lT3ZlcihgXHVDRTdDXHVEMUY0IFx1QkFBOVx1RDQ1QyBcdUIyRUNcdUMxMzEgXHVDMkU0XHVEMzI4ISAke3RoaXMucGxheWVyLnBlcmZvcm1hbmNlU2NvcmV9LyR7dGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLmVhcmx5TGVhdmVTY29yZVRhcmdldH1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIC8vIE5vIHNwZWNpZmljIHVwZGF0ZSBsb2dpYyBmb3Igb3RoZXIgc3RhdGVzXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXIoKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICAvLyByZW5kZXJMb2FkaW5nU2NyZWVuIGlzIGNhbGxlZCBkaXJlY3RseSBieSBhc3NldE1hbmFnZXIub25Qcm9ncmVzc1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVySW5zdHJ1Y3Rpb25zU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyR2FtZXBsYXlTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfV0lOOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJFbmRTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRHJhdyBjb21tb24gVUkgZWxlbWVudHMgaWYgYW55LCBvciBzcGVjaWZpYyBmb3IgY3VycmVudCBzdGF0ZVxyXG4gICAgICAgIHRoaXMuZ2FtZUJ1dHRvbnMuZm9yRWFjaChidG4gPT4gYnRuLmRyYXcodGhpcy5jdHgsIHRoaXMuZ2FtZURhdGEuZ2FtZUNvbmZpZy50ZXh0Q29sb3IsIHRoaXMuZ2FtZURhdGEuZ2FtZUNvbmZpZy5hY2NlbnRDb2xvcikpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyTG9hZGluZ1NjcmVlbihwcm9ncmVzczogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCIjMjIyMjIyXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiI0ZGRkZGRlwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjMwcHggQXJpYWxcIjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRCYXNlbGluZSA9IFwibWlkZGxlXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJcdUFDOENcdUM3ODQgXHVCODVDXHVCNTI5IFx1QzkxMS4uLlwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHByb2dyZXNzQmFyV2lkdGggPSA0MDA7XHJcbiAgICAgICAgY29uc3QgcHJvZ3Jlc3NCYXJIZWlnaHQgPSAzMDtcclxuICAgICAgICBjb25zdCBwcm9ncmVzc0JhclggPSB0aGlzLmNhbnZhcy53aWR0aCAvIDIgLSBwcm9ncmVzc0JhcldpZHRoIC8gMjtcclxuICAgICAgICBjb25zdCBwcm9ncmVzc0JhclkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIiM1NTU1NTVcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChwcm9ncmVzc0JhclgsIHByb2dyZXNzQmFyWSwgcHJvZ3Jlc3NCYXJXaWR0aCwgcHJvZ3Jlc3NCYXJIZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmdhbWVEYXRhPy5nYW1lQ29uZmlnLmFjY2VudENvbG9yIHx8IFwiI0ZGQUEwMFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHByb2dyZXNzQmFyWCwgcHJvZ3Jlc3NCYXJZLCBwcm9ncmVzc0JhcldpZHRoICogcHJvZ3Jlc3MsIHByb2dyZXNzQmFySGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSBcIiNGRkZGRkZcIjtcclxuICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QocHJvZ3Jlc3NCYXJYLCBwcm9ncmVzc0JhclksIHByb2dyZXNzQmFyV2lkdGgsIHByb2dyZXNzQmFySGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCIjRkZGRkZGXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMjBweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke01hdGgucm91bmQocHJvZ3Jlc3MgKiAxMDApfSVgLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICBjb25zdCBiZyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKFwidGl0bGVfYmdcIik7XHJcbiAgICAgICAgaWYgKGJnKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZywgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCIjNEE2QjhBXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCI2MHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSBcIm1pZGRsZVwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuZ2FtZURhdGEudGV4dHMudGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlckluc3RydWN0aW9uc1NjcmVlbigpIHtcclxuICAgICAgICBjb25zdCBiZyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKFwib2ZmaWNlX2JnXCIpO1xyXG4gICAgICAgIGlmIChiZykge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmcsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiIzZCOEUyM1wiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgwLDAsMCwwLjcpXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoNTAsIDUwLCB0aGlzLmNhbnZhcy53aWR0aCAtIDEwMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMTUwKTsgLy8gUGFuZWwgZm9yIHRleHRcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCI0MHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSBcInRvcFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuZ2FtZURhdGEudGV4dHMuaW5zdHJ1Y3Rpb25zVGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgNzApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIyMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJsZWZ0XCI7XHJcbiAgICAgICAgbGV0IHRleHRZID0gMTUwO1xyXG4gICAgICAgIHRoaXMuZ2FtZURhdGEudGV4dHMuaW5zdHJ1Y3Rpb25zVGV4dC5zbGljZSgwLCAtMSkuZm9yRWFjaChsaW5lID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobGluZSwgNzAsIHRleHRZKTtcclxuICAgICAgICAgICAgdGV4dFkgKz0gMzA7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJHYW1lcGxheVNjcmVlbigpIHtcclxuICAgICAgICBjb25zdCBiZyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKFwib2ZmaWNlX2JnXCIpO1xyXG4gICAgICAgIGlmIChiZykge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmcsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiIzZCOEUyM1wiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFRvcCBVSSBQYW5lbCBmb3IgcGxheWVyIHN0YXRzXHJcbiAgICAgICAgY29uc3QgdWlQYW5lbEhlaWdodCA9IDgwO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuZ2FtZURhdGEuZ2FtZUNvbmZpZy51aVBhbmVsQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHVpUGFuZWxIZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmdhbWVEYXRhLmdhbWVDb25maWcudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjI0cHggQXJpYWxcIjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcImxlZnRcIjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSBcIm1pZGRsZVwiO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgQXZhdGFyIChvcHRpb25hbClcclxuICAgICAgICBjb25zdCBwbGF5ZXJBdmF0YXIgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShcInBsYXllcl9hdmF0YXJcIik7XHJcbiAgICAgICAgaWYgKHBsYXllckF2YXRhcikge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UocGxheWVyQXZhdGFyLCAxMCwgMTAsIDYwLCA2MCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNb25leVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuZ2FtZURhdGEudGV4dHMubW9uZXlMYWJlbH0ke01hdGgucm91bmQodGhpcy5wbGF5ZXIubW9uZXkpfWAsIDkwLCB1aVBhbmVsSGVpZ2h0IC8gMik7XHJcblxyXG4gICAgICAgIC8vIEVuZXJneSBCYXJcclxuICAgICAgICBjb25zdCBlbmVyZ3lCYXIgPSBuZXcgUHJvZ3Jlc3NCYXIoXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDIwMCwgMjAsIDE4MCwgMjAsXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLm1heEVuZXJneSwgdGhpcy5wbGF5ZXIuZW5lcmd5LFxyXG4gICAgICAgICAgICBcIiMwMEZGMDBcIiwgXCIjNTU1NTU1XCIsXHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZURhdGEudGV4dHMuZW5lcmd5TGFiZWwsXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKFwiZW5lcmd5X2Jhcl9maWxsXCIpXHJcbiAgICAgICAgKTtcclxuICAgICAgICBlbmVyZ3lCYXIuZHJhdyh0aGlzLmN0eCwgdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLnRleHRDb2xvcik7XHJcblxyXG4gICAgICAgIC8vIFN0cmVzcyBCYXJcclxuICAgICAgICBjb25zdCBzdHJlc3NCYXIgPSBuZXcgUHJvZ3Jlc3NCYXIoXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDIwMCwgNTAsIDE4MCwgMjAsXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLm1heFN0cmVzcywgdGhpcy5wbGF5ZXIuc3RyZXNzLFxyXG4gICAgICAgICAgICBcIiNGRjAwMDBcIiwgXCIjNTU1NTU1XCIsXHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZURhdGEudGV4dHMuc3RyZXNzTGFiZWwsXHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKFwic3RyZXNzX2Jhcl9maWxsXCIpXHJcbiAgICAgICAgKTtcclxuICAgICAgICBzdHJlc3NCYXIuZHJhdyh0aGlzLmN0eCwgdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLnRleHRDb2xvcik7XHJcblxyXG4gICAgICAgIC8vIFBlcmZvcm1hbmNlIFNjb3JlXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5nYW1lRGF0YS50ZXh0cy5wZXJmb3JtYW5jZUxhYmVsfSR7dGhpcy5wbGF5ZXIucGVyZm9ybWFuY2VTY29yZX0vJHt0aGlzLmdhbWVEYXRhLmdhbWVDb25maWcuZWFybHlMZWF2ZVNjb3JlVGFyZ2V0fWAsIHRoaXMuY2FudmFzLndpZHRoIC0gMjUwLCAzMCk7XHJcblxyXG4gICAgICAgIC8vIFdvcmtkYXkgVGltZXJcclxuICAgICAgICBjb25zdCByZW1haW5pbmdUaW1lID0gdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLmdhbWVEYXlEdXJhdGlvblNlY29uZHMgLSB0aGlzLmdhbWVUaW1lRWxhcHNlZDtcclxuICAgICAgICBjb25zdCBtaW51dGVzID0gTWF0aC5mbG9vcihyZW1haW5pbmdUaW1lIC8gNjApO1xyXG4gICAgICAgIGNvbnN0IHNlY29uZHMgPSBNYXRoLmZsb29yKHJlbWFpbmluZ1RpbWUgJSA2MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGhpcy5nYW1lRGF0YS50ZXh0cy50aW1lTGFiZWx9JHttaW51dGVzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX06JHtzZWNvbmRzLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKX1gLCB0aGlzLmNhbnZhcy53aWR0aCAtIDI1MCwgNjApO1xyXG5cclxuXHJcbiAgICAgICAgLy8gVGFzayBQYW5lbFxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuZ2FtZURhdGEuZ2FtZUNvbmZpZy51aVBhbmVsQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QodGhpcy5VSV9UQVNLX1BBTkVMX1gsIHRoaXMuVUlfVEFTS19QQU5FTF9ZLCB0aGlzLlVJX1RBU0tfUEFORUxfV0lEVEgsIHRoaXMuY2FudmFzLmhlaWdodCAtIHRoaXMuVUlfVEFTS19QQU5FTF9ZIC0gMTApO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QodGhpcy5VSV9UQVNLX1BBTkVMX1gsIHRoaXMuVUlfVEFTS19QQU5FTF9ZLCB0aGlzLlVJX1RBU0tfUEFORUxfV0lEVEgsIHRoaXMuY2FudmFzLmhlaWdodCAtIHRoaXMuVUlfVEFTS19QQU5FTF9ZIC0gMTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmdhbWVEYXRhLmdhbWVDb25maWcudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjI4cHggQXJpYWxcIjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFwiXHVCMEI0IFx1QzVDNVx1QkIzNFwiLCB0aGlzLlVJX1RBU0tfUEFORUxfWCArIHRoaXMuVUlfVEFTS19QQU5FTF9XSURUSCAvIDIsIHRoaXMuVUlfVEFTS19QQU5FTF9ZICsgMzApO1xyXG5cclxuXHJcbiAgICAgICAgbGV0IGN1cnJlbnRUYXNrWSA9IHRoaXMuVUlfVEFTS19QQU5FTF9ZICsgNjA7XHJcbiAgICAgICAgdGhpcy5hY3RpdmVUYXNrcy5mb3JFYWNoKHRhc2sgPT4ge1xyXG4gICAgICAgICAgICB0YXNrLnggPSB0aGlzLlVJX1RBU0tfUEFORUxfWCArIDEwO1xyXG4gICAgICAgICAgICB0YXNrLnkgPSBjdXJyZW50VGFza1k7XHJcbiAgICAgICAgICAgIHRhc2sud2lkdGggPSB0aGlzLlVJX1RBU0tfUEFORUxfV0lEVEggLSAyMDtcclxuICAgICAgICAgICAgdGFzay5oZWlnaHQgPSB0aGlzLlVJX1RBU0tfSEVJR0hUO1xyXG4gICAgICAgICAgICB0YXNrLmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRNYW5hZ2VyLCB0aGlzLmdhbWVEYXRhLmdhbWVDb25maWcpO1xyXG4gICAgICAgICAgICBjdXJyZW50VGFza1kgKz0gdGhpcy5VSV9UQVNLX0hFSUdIVCArIHRoaXMuVUlfVEFTS19TUEFDSU5HO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBVcGdyYWRlIFBhbmVsXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLnVpUGFuZWxDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCh0aGlzLlVJX1VQR1JBREVfUEFORUxfWCwgdGhpcy5VSV9VUEdSQURFX1BBTkVMX1ksIHRoaXMuVUlfVVBHUkFERV9QQU5FTF9XSURUSCwgdGhpcy5VSV9VUEdSQURFX1BBTkVMX0hFSUdIVCk7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSB0aGlzLmdhbWVEYXRhLmdhbWVDb25maWcudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmxpbmVXaWR0aCA9IDI7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdCh0aGlzLlVJX1VQR1JBREVfUEFORUxfWCwgdGhpcy5VSV9VUEdSQURFX1BBTkVMX1ksIHRoaXMuVUlfVVBHUkFERV9QQU5FTF9XSURUSCwgdGhpcy5VSV9VUEdSQURFX1BBTkVMX0hFSUdIVCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuZ2FtZURhdGEuZ2FtZUNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMjhweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5nYW1lRGF0YS50ZXh0cy51cGdyYWRlUGFuZWxUaXRsZSwgdGhpcy5VSV9VUEdSQURFX1BBTkVMX1ggKyB0aGlzLlVJX1VQR1JBREVfUEFORUxfV0lEVEggLyAyLCB0aGlzLlVJX1VQR1JBREVfUEFORUxfWSArIDMwKTtcclxuXHJcbiAgICAgICAgdGhpcy51cGdyYWRlQnV0dG9ucy5mb3JFYWNoKGJ0biA9PiBidG4uZHJhdyh0aGlzLmN0eCwgdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLnRleHRDb2xvciwgdGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLmFjY2VudENvbG9yKSk7XHJcblxyXG4gICAgICAgIC8vIEV2ZW50IHBvcHVwXHJcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudEV2ZW50KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvcHVwV2lkdGggPSA0MDA7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvcHVwSGVpZ2h0ID0gMTUwO1xyXG4gICAgICAgICAgICBjb25zdCBwb3B1cFggPSAodGhpcy5jYW52YXMud2lkdGggLSBwb3B1cFdpZHRoKSAvIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IHBvcHVwWSA9ICh0aGlzLmNhbnZhcy5oZWlnaHQgLSBwb3B1cEhlaWdodCkgLyAyO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJyZ2JhKDAsIDAsIDAsIDAuOClcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QocG9wdXBYLCBwb3B1cFksIHBvcHVwV2lkdGgsIHBvcHVwSGVpZ2h0KTtcclxuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSB0aGlzLmdhbWVEYXRhLmdhbWVDb25maWcuYWNjZW50Q29sb3I7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmxpbmVXaWR0aCA9IDM7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QocG9wdXBYLCBwb3B1cFksIHBvcHVwV2lkdGgsIHBvcHVwSGVpZ2h0KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuZ2FtZURhdGEuZ2FtZUNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjI0cHggQXJpYWxcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gXCJtaWRkbGVcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jdXJyZW50RXZlbnQubmFtZSwgcG9wdXBYICsgcG9wdXBXaWR0aCAvIDIsIHBvcHVwWSArIDQwKTtcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMTZweCBBcmlhbFwiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmN1cnJlbnRFdmVudC5kZXNjcmlwdGlvbiwgcG9wdXBYICsgcG9wdXBXaWR0aCAvIDIsIHBvcHVwWSArIDkwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW5kZXJFbmRTY3JlZW4oKSB7XHJcbiAgICAgICAgY29uc3QgYmcgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShcIm9mZmljZV9iZ1wiKTtcclxuICAgICAgICBpZiAoYmcpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJnLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIiM2QjhFMjNcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcInJnYmEoMCwwLDAsMC43KVwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDUwLCA1MCwgdGhpcy5jYW52YXMud2lkdGggLSAxMDAsIHRoaXMuY2FudmFzLmhlaWdodCAtIDE1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuZ2FtZURhdGEuZ2FtZUNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiNjBweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gXCJtaWRkbGVcIjtcclxuXHJcbiAgICAgICAgbGV0IHRpdGxlVGV4dCA9IFwiXCI7XHJcbiAgICAgICAgbGV0IG1lc3NhZ2VUZXh0ID0gXCJcIjtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIHRpdGxlVGV4dCA9IHRoaXMuZ2FtZURhdGEudGV4dHMuZ2FtZU92ZXJUaXRsZTtcclxuICAgICAgICAgICAgbWVzc2FnZVRleHQgPSB0aGlzLmN1cnJlbnRFdmVudD8uZGVzY3JpcHRpb24gfHwgdGhpcy5nYW1lRGF0YS50ZXh0cy5nYW1lT3ZlclN0cmVzczsgLy8gVXNlIGV2ZW50IGRlc2MgYXMgcmVhc29uIG9yIGRlZmF1bHRcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9XSU4pIHtcclxuICAgICAgICAgICAgdGl0bGVUZXh0ID0gdGhpcy5nYW1lRGF0YS50ZXh0cy5nYW1lV2luVGl0bGU7XHJcbiAgICAgICAgICAgIG1lc3NhZ2VUZXh0ID0gdGhpcy5nYW1lRGF0YS50ZXh0cy5nYW1lV2luTWVzc2FnZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRpdGxlVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIyNHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobWVzc2FnZVRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwKTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVzdGFydEJ1dHRvbiA9IG5ldyBCdXR0b24oXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDE1MCAvIDIsXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAtIDEwMCxcclxuICAgICAgICAgICAgMTUwLCA1MCxcclxuICAgICAgICAgICAgXCJcdUIyRTRcdUMyREMgXHVDMkRDXHVDNzkxXCIsXHJcbiAgICAgICAgICAgICgpID0+IHRoaXMuaW5pdEdhbWUoKSwgLy8gUmUtaW5pdGlhbGl6ZSBnYW1lIHRvIHJlc3RhcnRcclxuICAgICAgICAgICAgdGhpcy5hc3NldE1hbmFnZXIuZ2V0SW1hZ2UoXCJidXR0b25fbm9ybWFsXCIpLFxyXG4gICAgICAgICAgICB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZShcImJ1dHRvbl9ob3ZlclwiKVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcmVzdGFydEJ1dHRvbi5kcmF3KHRoaXMuY3R4LCB0aGlzLmdhbWVEYXRhLmdhbWVDb25maWcudGV4dENvbG9yLCB0aGlzLmdhbWVEYXRhLmdhbWVDb25maWcuYWNjZW50Q29sb3IpO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50cyA9IFtyZXN0YXJ0QnV0dG9uXTsgLy8gT25seSByZXN0YXJ0IGJ1dHRvbiBpcyBjbGlja2FibGVcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldEdhbWVPdmVyKHJlYXNvbjogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEV2ZW50ID0geyBpZDogXCJnYW1lX292ZXJfcmVhc29uXCIsIG5hbWU6IHRoaXMuZ2FtZURhdGEudGV4dHMuZ2FtZU92ZXJUaXRsZSwgZGVzY3JpcHRpb246IHJlYXNvbiwgdHJpZ2dlckNoYW5jZTogMCwgZWZmZWN0VHlwZTogXCJub19lZmZlY3RfeWV0XCIsIGVmZmVjdFZhbHVlOiAwLCBkZWxheVNlY29uZHM6IDAgfTtcclxuICAgICAgICB0aGlzLnVpRWxlbWVudHMgPSBbXTsgLy8gQ2xlYXIgY3VycmVudCBjbGlja2FibGUgZWxlbWVudHNcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldEdhbWVXaW4oKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9XSU47XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuYWRkTW9uZXkodGhpcy5nYW1lRGF0YS5nYW1lQ29uZmlnLmVhcmx5TGVhdmVNb25leUJvbnVzKTsgLy8gQm9udXMgZm9yIHdpbm5pbmdcclxuICAgICAgICB0aGlzLnVpRWxlbWVudHMgPSBbXTsgLy8gQ2xlYXIgY3VycmVudCBjbGlja2FibGUgZWxlbWVudHNcclxuICAgIH1cclxuXHJcbiAgICAvLyAtLS0gSW5wdXQgSGFuZGxlcnMgLS0tXHJcbiAgICBwcml2YXRlIG9uTW91c2VNb3ZlKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IHRoaXMuY2FudmFzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIHRoaXMubW91c2VYID0gZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdDtcclxuICAgICAgICB0aGlzLm1vdXNlWSA9IGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcDtcclxuXHJcbiAgICAgICAgLy8gQWxsIGVsZW1lbnRzIGluIHVpRWxlbWVudHMgbm93IGNvbmZvcm0gdG8gdGhlIG5ldyBDbGlja2FibGUgaW50ZXJmYWNlXHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzLmZvckVhY2goZWwgPT4ge1xyXG4gICAgICAgICAgICBlbC5jaGVja0hvdmVyKHRoaXMubW91c2VYLCB0aGlzLm1vdXNlWSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlRG93bihldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIHRoaXMuaXNNb3VzZURvd24gPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nb3VzZVVwKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5pc01vdXNlRG93biA9IGZhbHNlO1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSB0aGlzLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBjbGlja1ggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xyXG4gICAgICAgIGNvbnN0IGNsaWNrWSA9IGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcDtcclxuXHJcbiAgICAgICAgLy8gRmluZCBhbmQgdHJpZ2dlciBjbGljayBhY3Rpb25cclxuICAgICAgICBmb3IgKGNvbnN0IGVsIG9mIHRoaXMudWlFbGVtZW50cykge1xyXG4gICAgICAgICAgICBpZiAoZWwuaXNDbGlja2VkKGNsaWNrWCwgY2xpY2tZKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb1BsYXllci5wbGF5U0ZYKFwic2Z4X2NsaWNrXCIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGVsLm9uQ2xpY2spIHtcclxuICAgICAgICAgICAgICAgICAgICBlbC5vbkNsaWNrKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBUaGUgdGFzayBwcm9ncmVzc2lvbiBsb2dpYyB3aGVuIGhvbGRpbmcgbW91c2UgaXMgaW4gdXBkYXRlIGxvb3AuXHJcbiAgICAgICAgICAgICAgICAvLyBUaGUgcmVzdGFydCBidXR0b24gb24gZW5kIHNjcmVlbnMgaGFzIGl0cyBvd24gb25DbGljayBoYW5kbGVyLlxyXG4gICAgICAgICAgICAgICAgLy8gTm8gbmVlZCBmb3IgZXhwbGljaXQgYHRoaXMuaW5pdEdhbWUoKWAgaGVyZSwgYXMgdGhlIGJ1dHRvbidzIG9uQ2xpY2sgaGFuZGxlcyBpdC5cclxuICAgICAgICAgICAgICAgIHJldHVybjsgLy8gT25seSBwcm9jZXNzIG9uZSBjbGlja1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSB3aW5kb3cgbG9hZHNcclxud2luZG93Lm9ubG9hZCA9ICgpID0+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgbmV3IEdhbWUoXCJnYW1lQ2FudmFzXCIpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaW5pdGlhbGl6ZSBnYW1lOlwiLCBlKTtcclxuICAgICAgICBjb25zdCBib2R5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignYm9keScpO1xyXG4gICAgICAgIGlmIChib2R5KSB7XHJcbiAgICAgICAgICAgIGJvZHkuaW5uZXJIVE1MID0gYDxkaXYgc3R5bGU9XCJjb2xvcjogcmVkOyB0ZXh0LWFsaWduOiBjZW50ZXI7IG1hcmdpbi10b3A6IDUwcHg7XCI+XHJcbiAgICAgICAgICAgICAgICA8aDE+XHVBQzhDXHVDNzg0IFx1QzJFNFx1RDU4OSBcdUM2MjRcdUI5NTg8L2gxPlxyXG4gICAgICAgICAgICAgICAgPHA+XHVBQzhDXHVDNzg0IFx1Q0QwOFx1QUUzMFx1RDY1NCBcdUM5MTEgXHVCQjM4XHVDODFDXHVBQzAwIFx1QkMxQ1x1QzBERFx1RDU4OFx1QzJCNVx1QjJDOFx1QjJFNDogJHtlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSl9PC9wPlxyXG4gICAgICAgICAgICAgICAgPHA+XHVDRjU4XHVDMTk0XHVDNzQ0IFx1RDY1NVx1Qzc3OFx1RDU1OFx1QzVFQyBcdUM3OTBcdUMxMzhcdUQ1NUMgXHVDNjI0XHVCOTU4IFx1QzgxNVx1QkNGNFx1Qjk3QyBcdUQ2NTVcdUM3NzhcdUQ1NzRcdUM4RkNcdUMxMzhcdUM2OTQuPC9wPlxyXG4gICAgICAgICAgICA8L2Rpdj5gO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBNEdBLE1BQU0sYUFBYTtBQUFBLEVBUWYsWUFBb0IsZUFBOEI7QUFBOUI7QUFQcEIsU0FBUSxTQUF3QyxvQkFBSSxJQUFJO0FBQ3hELFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQUN4RCxTQUFRLGNBQXNCO0FBQzlCLFNBQVEsYUFBcUI7QUFDN0IsU0FBUSxhQUFrRDtBQUMxRCxTQUFRLGFBQWtDO0FBR3RDLFNBQUssYUFBYSxjQUFjLE9BQU8sU0FBUyxjQUFjLE9BQU87QUFBQSxFQUN6RTtBQUFBLEVBRU8sY0FBYyxVQUFzQztBQUN2RCxTQUFLLGFBQWE7QUFBQSxFQUN0QjtBQUFBLEVBRU8sY0FBYyxVQUFzQjtBQUN2QyxTQUFLLGFBQWE7QUFBQSxFQUN0QjtBQUFBLEVBRUEsTUFBYSxVQUF5QjtBQUNsQyxVQUFNLGdCQUFnQixLQUFLLGNBQWMsT0FBTyxJQUFJLGFBQVcsS0FBSyxVQUFVLE9BQU8sQ0FBQztBQUN0RixVQUFNLGdCQUFnQixLQUFLLGNBQWMsT0FBTyxJQUFJLGVBQWEsS0FBSyxVQUFVLFNBQVMsQ0FBQztBQUUxRixVQUFNLFFBQVEsSUFBSSxDQUFDLEdBQUcsZUFBZSxHQUFHLGFBQWEsQ0FBQztBQUN0RCxRQUFJLEtBQUssWUFBWTtBQUNqQixXQUFLLFdBQVc7QUFBQSxJQUNwQjtBQUFBLEVBQ0o7QUFBQSxFQUVRLFVBQVUsU0FBd0M7QUFDdEQsV0FB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
