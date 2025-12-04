var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 2] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 3] = "PLAYING";
  GameState2[GameState2["ROUND_END"] = 4] = "ROUND_END";
  GameState2[GameState2["GAME_OVER"] = 5] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var RPSChoice = /* @__PURE__ */ ((RPSChoice2) => {
  RPSChoice2["ROCK"] = "rock";
  RPSChoice2["PAPER"] = "paper";
  RPSChoice2["SCISSORS"] = "scissors";
  return RPSChoice2;
})(RPSChoice || {});
var RoundResult = /* @__PURE__ */ ((RoundResult2) => {
  RoundResult2["WIN"] = "win";
  RoundResult2["LOSE"] = "lose";
  RoundResult2["TIMEOUT"] = "timeout";
  return RoundResult2;
})(RoundResult || {});
class AssetLoader {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.totalAssets = 0;
    this.loadedAssets = 0;
    this.assetPromises = [];
  }
  async loadAll(assetsConfig) {
    this.totalAssets = assetsConfig.images.length + assetsConfig.sounds.length;
    this.loadedAssets = 0;
    for (const img of assetsConfig.images) {
      this.assetPromises.push(this.loadImage(img.name, img.path));
    }
    for (const snd of assetsConfig.sounds) {
      this.assetPromises.push(this.loadSound(snd.name, snd.path, snd.volume));
    }
    await Promise.all(this.assetPromises);
    console.log("All assets loaded.");
  }
  loadImage(name, path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = path;
      img.onload = () => {
        this.images.set(name, img);
        this.loadedAssets++;
        resolve();
      };
      img.onerror = (e) => {
        console.error(`Failed to load image: ${path}`, e);
        reject(e);
      };
    });
  }
  loadSound(name, path, volume) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = path;
      audio.volume = volume;
      audio.oncanplaythrough = () => {
        this.sounds.set(name, audio);
        this.loadedAssets++;
        resolve();
      };
      audio.onerror = (e) => {
        console.error(`Failed to load sound: ${path}`, e);
        reject(e);
      };
      setTimeout(() => {
        if (!this.sounds.has(name)) {
          console.warn(`Sound ${name} (${path}) oncanplaythrough timed out. Resolving anyway.`);
          this.sounds.set(name, audio);
          this.loadedAssets++;
          resolve();
        }
      }, 5e3);
    });
  }
  getImage(name) {
    return this.images.get(name);
  }
  getSound(name) {
    return this.sounds.get(name);
  }
  getLoadingProgress() {
    return this.totalAssets > 0 ? this.loadedAssets / this.totalAssets : 0;
  }
}
class RPSGame {
  constructor(canvas, config) {
    this.gameState = 0 /* LOADING */;
    this.lastTimestamp = 0;
    this.lives = 0;
    this.currentRoundTimer = 0;
    this.centralIcon = null;
    this.userChoice = null;
    this.roundResult = null;
    this.roundResultDisplayTimer = 0;
    this.playerChoiceRects = /* @__PURE__ */ new Map();
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.assetLoader = new AssetLoader();
    this.canvas.width = config.canvas.width;
    this.canvas.height = config.canvas.height;
    this.canvas.addEventListener("click", this.handleInput.bind(this));
    document.addEventListener("visibilitychange", this.handleVisibilityChange.bind(this));
  }
  async init() {
    this.gameState = 0 /* LOADING */;
    this.drawLoadingScreen();
    try {
      await this.assetLoader.loadAll(this.config.assets);
      this.bgm = this.assetLoader.getSound("bgm");
      if (this.bgm) {
        this.bgm.loop = true;
        this.bgm.volume = this.config.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.3;
      }
      this.gameState = 1 /* TITLE */;
      this.loop(0);
    } catch (error) {
      console.error("Game initialization failed:", error);
      this.drawErrorMessage("\uC5D0\uC14B \uB85C\uB529 \uC2E4\uD328!");
    }
  }
  handleVisibilityChange() {
    if (document.hidden && this.bgm) {
      this.bgm.pause();
    } else if (!document.hidden && this.bgm && this.gameState !== 0 /* LOADING */) {
      if (this.bgm.paused) {
        this.bgm.play().catch((e) => console.log("BGM play interrupted on visibility change:", e));
      }
    }
  }
  startGame() {
    this.lives = this.config.gameSettings.initialLives;
    this.startRound();
    this.gameState = 3 /* PLAYING */;
  }
  startRound() {
    this.centralIcon = this.getRandomRPSChoice();
    this.currentRoundTimer = this.config.gameSettings.roundTimeLimitSeconds;
    this.userChoice = null;
    this.roundResult = null;
    this.roundResultDisplayTimer = 0;
  }
  getRandomRPSChoice() {
    const choices = ["rock" /* ROCK */, "paper" /* PAPER */, "scissors" /* SCISSORS */];
    return choices[Math.floor(Math.random() * choices.length)];
  }
  determineRoundResult(playerChoice, cpuChoice) {
    if (playerChoice === "rock" /* ROCK */ && cpuChoice === "scissors" /* SCISSORS */ || playerChoice === "paper" /* PAPER */ && cpuChoice === "rock" /* ROCK */ || playerChoice === "scissors" /* SCISSORS */ && cpuChoice === "paper" /* PAPER */) {
      return "win" /* WIN */;
    } else {
      return "lose" /* LOSE */;
    }
  }
  handleInput(event) {
    const clickX = event.clientX - this.canvas.offsetLeft;
    const clickY = event.clientY - this.canvas.offsetTop;
    if (this.bgm && this.bgm.paused) {
      this.bgm.play().catch((e) => console.log("BGM play prevented:", e));
    }
    switch (this.gameState) {
      case 1 /* TITLE */:
        this.playClickSound();
        this.gameState = 2 /* INSTRUCTIONS */;
        break;
      case 2 /* INSTRUCTIONS */:
        this.playClickSound();
        this.startGame();
        break;
      case 3 /* PLAYING */:
        if (this.userChoice === null) {
          for (const [choice, rect] of this.playerChoiceRects.entries()) {
            if (clickX >= rect.x && clickX <= rect.x + rect.width && clickY >= rect.y && clickY <= rect.y + rect.height) {
              this.playClickSound();
              this.userChoice = choice;
              this.processRoundEnd(this.userChoice, this.centralIcon);
              break;
            }
          }
        }
        break;
      case 5 /* GAME_OVER */:
        this.playClickSound();
        this.gameState = 1 /* TITLE */;
        break;
    }
  }
  processRoundEnd(playerChoice, cpuChoice, timedOut = false) {
    if (timedOut || playerChoice === null || cpuChoice === null) {
      this.roundResult = "timeout" /* TIMEOUT */;
      this.lives--;
      this.playLoseSound();
    } else {
      this.roundResult = this.determineRoundResult(playerChoice, cpuChoice);
      if (this.roundResult === "lose" /* LOSE */) {
        this.lives--;
        this.playLoseSound();
      } else {
        this.playWinSound();
      }
    }
    this.gameState = 4 /* ROUND_END */;
    this.roundResultDisplayTimer = this.config.gameSettings.roundResultDisplayDurationSeconds;
  }
  playClickSound() {
    const sound = this.assetLoader.getSound("click_sound");
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch((e) => console.log("Click sound play prevented:", e));
    }
  }
  playWinSound() {
    const sound = this.assetLoader.getSound("win_sound");
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch((e) => console.log("Win sound play prevented:", e));
    }
  }
  playLoseSound() {
    const sound = this.assetLoader.getSound("lose_sound");
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch((e) => console.log("Lose sound play prevented:", e));
    }
  }
  update(deltaTime) {
    switch (this.gameState) {
      case 3 /* PLAYING */:
        this.currentRoundTimer -= deltaTime;
        if (this.currentRoundTimer <= 0) {
          this.processRoundEnd(null, null, true);
        }
        break;
      case 4 /* ROUND_END */:
        this.roundResultDisplayTimer -= deltaTime;
        if (this.roundResultDisplayTimer <= 0) {
          if (this.lives <= 0) {
            this.gameState = 5 /* GAME_OVER */;
          } else {
            this.startRound();
            this.gameState = 3 /* PLAYING */;
          }
        }
        break;
    }
  }
  drawLoadingScreen() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#333333";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "30px Arial";
    this.ctx.fillText("\uB85C\uB529 \uC911...", this.canvas.width / 2, this.canvas.height / 2 - 20);
    const progress = this.assetLoader.getLoadingProgress();
    this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 20);
  }
  drawTitleScreen() {
    const texts = this.config.texts.titleScreen;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#1a1a1a";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = texts.fontColor;
    this.ctx.font = `${texts.titleFontSize} Arial`;
    this.ctx.fillText(texts.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = `${texts.subtitleFontSize} Arial`;
    this.ctx.fillText(texts.subtitle, this.canvas.width / 2, this.canvas.height / 2 + 20);
  }
  drawInstructionsScreen() {
    const texts = this.config.texts.instructionsScreen;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#1a1a1a";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = texts.fontColor;
    this.ctx.font = `${texts.titleFontSize} Arial`;
    this.ctx.fillText(texts.title, this.canvas.width / 2, this.canvas.height / 2 - 150);
    this.ctx.font = `${texts.lineFontSize} Arial`;
    this.ctx.fillText(texts.line1, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.fillText(texts.line2, this.canvas.width / 2, this.canvas.height / 2 - 20);
    this.ctx.fillText(texts.line3, this.canvas.width / 2, this.canvas.height / 2 + 10);
    this.ctx.fillText(texts.line4, this.canvas.width / 2, this.canvas.height / 2 + 40);
    this.ctx.font = `${texts.subtitleFontSize || texts.lineFontSize} Arial`;
    this.ctx.fillText(texts.line5, this.canvas.width / 2, this.canvas.height / 2 + 120);
  }
  drawPlayingScreen() {
    const texts = this.config.texts.playingScreen;
    const gameSettings = this.config.gameSettings;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#1a1a1a";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.centralIcon) {
      const icon = this.assetLoader.getImage(this.centralIcon);
      if (icon) {
        const x = this.canvas.width / 2 - gameSettings.centralIconSize / 2;
        const y = this.canvas.height / 3 - gameSettings.centralIconSize / 2;
        this.ctx.drawImage(icon, x, y, gameSettings.centralIconSize, gameSettings.centralIconSize);
      }
    }
    const iconNames = ["rock" /* ROCK */, "paper" /* PAPER */, "scissors" /* SCISSORS */];
    const iconWidth = gameSettings.iconSize;
    const iconHeight = gameSettings.iconSize;
    const totalWidth = iconNames.length * iconWidth + (iconNames.length - 1) * gameSettings.spacing;
    let currentX = (this.canvas.width - totalWidth) / 2;
    const iconY = this.canvas.height - gameSettings.playerIconOffset - iconHeight / 2;
    this.playerChoiceRects.clear();
    for (const name of iconNames) {
      const icon = this.assetLoader.getImage(name);
      if (icon) {
        this.ctx.drawImage(icon, currentX, iconY, iconWidth, iconHeight);
        this.playerChoiceRects.set(name, { x: currentX, y: iconY, width: iconWidth, height: iconHeight });
      }
      currentX += iconWidth + gameSettings.spacing;
    }
    this.ctx.textAlign = "left";
    this.ctx.fillStyle = texts.fontColor;
    this.ctx.font = `${texts.livesFontSize} Arial`;
    this.ctx.fillText(`${texts.livesLabel}${this.lives}`, 20, 40);
    this.ctx.textAlign = "right";
    this.ctx.font = `${texts.timerFontSize} Arial`;
    this.ctx.fillText(`${texts.timerLabel}${Math.max(0, Math.ceil(this.currentRoundTimer))}`, this.canvas.width - 20, 40);
  }
  drawRoundEndScreen() {
    this.drawPlayingScreen();
    const texts = this.config.texts.roundResult;
    this.ctx.textAlign = "center";
    this.ctx.font = `${texts.fontSize} Arial`;
    let resultText = "";
    let resultColor = "";
    if (this.roundResult === "win" /* WIN */) {
      resultText = texts.win;
      resultColor = texts.winColor;
    } else if (this.roundResult === "lose" /* LOSE */) {
      resultText = texts.lose;
      resultColor = texts.loseColor;
    } else if (this.roundResult === "timeout" /* TIMEOUT */) {
      resultText = texts.timeout;
      resultColor = texts.loseColor;
    }
    this.ctx.fillStyle = resultColor;
    this.ctx.fillText(resultText, this.canvas.width / 2, this.canvas.height / 2);
  }
  drawGameOverScreen() {
    const texts = this.config.texts.gameOverScreen;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#1a1a1a";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = texts.fontColor;
    this.ctx.font = `${texts.titleFontSize} Arial`;
    this.ctx.fillText(texts.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = `${texts.subtitleFontSize} Arial`;
    this.ctx.fillText(texts.subtitle, this.canvas.width / 2, this.canvas.height / 2 + 20);
  }
  drawErrorMessage(message) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#550000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "30px Arial";
    this.ctx.fillText("\uC624\uB958 \uBC1C\uC0DD!", this.canvas.width / 2, this.canvas.height / 2 - 40);
    this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2 + 10);
    this.ctx.font = "20px Arial";
    this.ctx.fillText("\uCF58\uC194\uC744 \uD655\uC778\uD558\uC138\uC694.", this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  draw() {
    switch (this.gameState) {
      case 0 /* LOADING */:
        this.drawLoadingScreen();
        break;
      case 1 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 2 /* INSTRUCTIONS */:
        this.drawInstructionsScreen();
        break;
      case 3 /* PLAYING */:
        this.drawPlayingScreen();
        break;
      case 4 /* ROUND_END */:
        this.drawRoundEndScreen();
        break;
      case 5 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  loop(timestamp) {
    const deltaTime = (timestamp - this.lastTimestamp) / 1e3;
    this.lastTimestamp = timestamp;
    if (this.gameState !== 0 /* LOADING */) {
      this.update(deltaTime);
    }
    this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }
}
async function main() {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("Canvas element with ID 'gameCanvas' not found!");
    return;
  }
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const config = await response.json();
    const game = new RPSGame(canvas, config);
    game.init();
  } catch (error) {
    console.error("Error loading game configuration or starting game:", error);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#550000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "24px Arial";
      ctx.fillText("\uAC8C\uC784 \uCD08\uAE30\uD654 \uC2E4\uD328: \uC124\uC815 \uD30C\uC77C\uC744 \uB85C\uB4DC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", canvas.width / 2, canvas.height / 2);
    }
  }
}
main();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ2FudmFzU2V0dGluZ3Mge1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVNldHRpbmdzIHtcclxuICAgIGluaXRpYWxMaXZlczogbnVtYmVyO1xyXG4gICAgcm91bmRUaW1lTGltaXRTZWNvbmRzOiBudW1iZXI7XHJcbiAgICByb3VuZFJlc3VsdERpc3BsYXlEdXJhdGlvblNlY29uZHM6IG51bWJlcjtcclxuICAgIGljb25TaXplOiBudW1iZXI7XHJcbiAgICBjZW50cmFsSWNvblNpemU6IG51bWJlcjtcclxuICAgIHBsYXllckljb25PZmZzZXQ6IG51bWJlcjtcclxuICAgIHNwYWNpbmc6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFRleHRDb25maWcge1xyXG4gICAgdGl0bGU/OiBzdHJpbmc7XHJcbiAgICBzdWJ0aXRsZT86IHN0cmluZztcclxuICAgIGxpbmUxPzogc3RyaW5nO1xyXG4gICAgbGluZTI/OiBzdHJpbmc7XHJcbiAgICBsaW5lMz86IHN0cmluZztcclxuICAgIGxpbmU0Pzogc3RyaW5nO1xyXG4gICAgbGluZTU/OiBzdHJpbmc7XHJcbiAgICB0aXRsZUZvbnRTaXplPzogc3RyaW5nO1xyXG4gICAgc3VidGl0bGVGb250U2l6ZT86IHN0cmluZztcclxuICAgIGxpbmVGb250U2l6ZT86IHN0cmluZztcclxuICAgIGZvbnRTaXplPzogc3RyaW5nOyAvLyBBZGQgdGhpcyBwcm9wZXJ0eSBmb3IgZ2VuZXJhbCB0ZXh0IGZvbnQgc2l6ZVxyXG4gICAgZm9udENvbG9yOiBzdHJpbmc7XHJcbiAgICB3aW4/OiBzdHJpbmc7XHJcbiAgICBsb3NlPzogc3RyaW5nO1xyXG4gICAgdGltZW91dD86IHN0cmluZztcclxuICAgIHdpbkNvbG9yPzogc3RyaW5nO1xyXG4gICAgbG9zZUNvbG9yPzogc3RyaW5nO1xyXG4gICAgbGl2ZXNMYWJlbD86IHN0cmluZztcclxuICAgIHRpbWVyTGFiZWw/OiBzdHJpbmc7XHJcbiAgICBsaXZlc0ZvbnRTaXplPzogc3RyaW5nO1xyXG4gICAgdGltZXJGb250U2l6ZT86IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzOiBDYW52YXNTZXR0aW5ncztcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgdGV4dHM6IHtcclxuICAgICAgICB0aXRsZVNjcmVlbjogVGV4dENvbmZpZztcclxuICAgICAgICBpbnN0cnVjdGlvbnNTY3JlZW46IFRleHRDb25maWc7XHJcbiAgICAgICAgcGxheWluZ1NjcmVlbjogVGV4dENvbmZpZztcclxuICAgICAgICByb3VuZFJlc3VsdDogVGV4dENvbmZpZztcclxuICAgICAgICBnYW1lT3ZlclNjcmVlbjogVGV4dENvbmZpZztcclxuICAgIH07XHJcbiAgICBhc3NldHM6IEFzc2V0c0NvbmZpZztcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFLFxyXG4gICAgSU5TVFJVQ1RJT05TLFxyXG4gICAgUExBWUlORyxcclxuICAgIFJPVU5EX0VORCxcclxuICAgIEdBTUVfT1ZFUixcclxufVxyXG5cclxuZW51bSBSUFNDaG9pY2Uge1xyXG4gICAgUk9DSyA9IFwicm9ja1wiLFxyXG4gICAgUEFQRVIgPSBcInBhcGVyXCIsXHJcbiAgICBTQ0lTU09SUyA9IFwic2Npc3NvcnNcIixcclxufVxyXG5cclxuZW51bSBSb3VuZFJlc3VsdCB7XHJcbiAgICBXSU4gPSBcIndpblwiLFxyXG4gICAgTE9TRSA9IFwibG9zZVwiLFxyXG4gICAgVElNRU9VVCA9IFwidGltZW91dFwiLFxyXG59XHJcblxyXG5jbGFzcyBBc3NldExvYWRlciB7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzID0gMDtcclxuICAgIHByaXZhdGUgbG9hZGVkQXNzZXRzID0gMDtcclxuICAgIHByaXZhdGUgYXNzZXRQcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcclxuXHJcbiAgICBhc3luYyBsb2FkQWxsKGFzc2V0c0NvbmZpZzogQXNzZXRzQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubGVuZ3RoICsgYXNzZXRzQ29uZmlnLnNvdW5kcy5sZW5ndGg7XHJcbiAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMgPSAwO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGltZyBvZiBhc3NldHNDb25maWcuaW1hZ2VzKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRQcm9taXNlcy5wdXNoKHRoaXMubG9hZEltYWdlKGltZy5uYW1lLCBpbWcucGF0aCkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKGNvbnN0IHNuZCBvZiBhc3NldHNDb25maWcuc291bmRzKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRQcm9taXNlcy5wdXNoKHRoaXMubG9hZFNvdW5kKHNuZC5uYW1lLCBzbmQucGF0aCwgc25kLnZvbHVtZSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5hc3NldFByb21pc2VzKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkFsbCBhc3NldHMgbG9hZGVkLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRJbWFnZShuYW1lOiBzdHJpbmcsIHBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gcGF0aDtcclxuICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChuYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7cGF0aH1gLCBlKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRTb3VuZChuYW1lOiBzdHJpbmcsIHBhdGg6IHN0cmluZywgdm9sdW1lOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBwYXRoO1xyXG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSB2b2x1bWU7XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQobmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9IChlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtwYXRofWAsIGUpO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGUpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAvLyBBZGQgYSB0aW1lb3V0IGZvciBzb3VuZHMgdGhhdCBtaWdodCBub3QgdHJpZ2dlciBvbmNhbnBsYXl0aHJvdWdoIGltbWVkaWF0ZWx5XHJcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnNvdW5kcy5oYXMobmFtZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kICR7bmFtZX0gKCR7cGF0aH0pIG9uY2FucGxheXRocm91Z2ggdGltZWQgb3V0LiBSZXNvbHZpbmcgYW55d2F5LmApO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChuYW1lLCBhdWRpbyk7IFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQXNzZXRzKys7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LCA1MDAwKTsgLy8gNSBzZWNvbmRzIHRpbWVvdXRcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNvdW5kKG5hbWU6IHN0cmluZyk6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9hZGluZ1Byb2dyZXNzKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG90YWxBc3NldHMgPiAwID8gdGhpcy5sb2FkZWRBc3NldHMgLyB0aGlzLnRvdGFsQXNzZXRzIDogMDtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUlBTR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWc6IEdhbWVDb25maWc7XHJcbiAgICBwcml2YXRlIGFzc2V0TG9hZGVyOiBBc3NldExvYWRlcjtcclxuXHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lc3RhbXAgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgbGl2ZXM6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRSb3VuZFRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjZW50cmFsSWNvbjogUlBTQ2hvaWNlIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIHVzZXJDaG9pY2U6IFJQU0Nob2ljZSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSByb3VuZFJlc3VsdDogUm91bmRSZXN1bHQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgcm91bmRSZXN1bHREaXNwbGF5VGltZXI6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGJnbTogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZDtcclxuICAgIHByaXZhdGUgcGxheWVyQ2hvaWNlUmVjdHM6IE1hcDxSUFNDaG9pY2UsIHsgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyIH0+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQsIGNvbmZpZzogR2FtZUNvbmZpZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gY2FudmFzO1xyXG4gICAgICAgIHRoaXMuY3R4ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiKSE7XHJcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XHJcbiAgICAgICAgdGhpcy5hc3NldExvYWRlciA9IG5ldyBBc3NldExvYWRlcigpO1xyXG5cclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IGNvbmZpZy5jYW52YXMud2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gY29uZmlnLmNhbnZhcy5oZWlnaHQ7XHJcblxyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCB0aGlzLmhhbmRsZUlucHV0LmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJ2aXNpYmlsaXR5Y2hhbmdlXCIsIHRoaXMuaGFuZGxlVmlzaWJpbGl0eUNoYW5nZS5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBpbml0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbiAgICAgICAgdGhpcy5kcmF3TG9hZGluZ1NjcmVlbigpO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TG9hZGVyLmxvYWRBbGwodGhpcy5jb25maWcuYXNzZXRzKTtcclxuICAgICAgICAgICAgdGhpcy5iZ20gPSB0aGlzLmFzc2V0TG9hZGVyLmdldFNvdW5kKFwiYmdtXCIpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ20pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtLmxvb3AgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ20udm9sdW1lID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSBcImJnbVwiKT8udm9sdW1lIHx8IDAuMztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgdGhpcy5sb29wKDApO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJHYW1lIGluaXRpYWxpemF0aW9uIGZhaWxlZDpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdFcnJvck1lc3NhZ2UoXCJcdUM1RDBcdUMxNEIgXHVCODVDXHVCNTI5IFx1QzJFNFx1RDMyOCFcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlVmlzaWJpbGl0eUNoYW5nZSgpIHtcclxuICAgICAgICBpZiAoZG9jdW1lbnQuaGlkZGVuICYmIHRoaXMuYmdtKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtLnBhdXNlKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICghZG9jdW1lbnQuaGlkZGVuICYmIHRoaXMuYmdtICYmIHRoaXMuZ2FtZVN0YXRlICE9PSBHYW1lU3RhdGUuTE9BRElORykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ20ucGF1c2VkKSB7IFxyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ20ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBpbnRlcnJ1cHRlZCBvbiB2aXNpYmlsaXR5IGNoYW5nZTpcIiwgZSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMubGl2ZXMgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuaW5pdGlhbExpdmVzO1xyXG4gICAgICAgIHRoaXMuc3RhcnRSb3VuZCgpO1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydFJvdW5kKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY2VudHJhbEljb24gPSB0aGlzLmdldFJhbmRvbVJQU0Nob2ljZSgpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFJvdW5kVGltZXIgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Mucm91bmRUaW1lTGltaXRTZWNvbmRzO1xyXG4gICAgICAgIHRoaXMudXNlckNob2ljZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5yb3VuZFJlc3VsdCA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5yb3VuZFJlc3VsdERpc3BsYXlUaW1lciA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRSYW5kb21SUFNDaG9pY2UoKTogUlBTQ2hvaWNlIHtcclxuICAgICAgICBjb25zdCBjaG9pY2VzID0gW1JQU0Nob2ljZS5ST0NLLCBSUFNDaG9pY2UuUEFQRVIsIFJQU0Nob2ljZS5TQ0lTU09SU107XHJcbiAgICAgICAgcmV0dXJuIGNob2ljZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogY2hvaWNlcy5sZW5ndGgpXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRldGVybWluZVJvdW5kUmVzdWx0KHBsYXllckNob2ljZTogUlBTQ2hvaWNlLCBjcHVDaG9pY2U6IFJQU0Nob2ljZSk6IFJvdW5kUmVzdWx0IHtcclxuICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgIChwbGF5ZXJDaG9pY2UgPT09IFJQU0Nob2ljZS5ST0NLICYmIGNwdUNob2ljZSA9PT0gUlBTQ2hvaWNlLlNDSVNTT1JTKSB8fFxyXG4gICAgICAgICAgICAocGxheWVyQ2hvaWNlID09PSBSUFNDaG9pY2UuUEFQRVIgJiYgY3B1Q2hvaWNlID09PSBSUFNDaG9pY2UuUk9DSykgfHxcclxuICAgICAgICAgICAgKHBsYXllckNob2ljZSA9PT0gUlBTQ2hvaWNlLlNDSVNTT1JTICYmIGNwdUNob2ljZSA9PT0gUlBTQ2hvaWNlLlBBUEVSKVxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgICByZXR1cm4gUm91bmRSZXN1bHQuV0lOO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHJldHVybiBSb3VuZFJlc3VsdC5MT1NFO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUlucHV0KGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgY2xpY2tYID0gZXZlbnQuY2xpZW50WCAtIHRoaXMuY2FudmFzLm9mZnNldExlZnQ7XHJcbiAgICAgICAgY29uc3QgY2xpY2tZID0gZXZlbnQuY2xpZW50WSAtIHRoaXMuY2FudmFzLm9mZnNldFRvcDtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuYmdtICYmIHRoaXMuYmdtLnBhdXNlZCkge1xyXG4gICAgICAgICAgICB0aGlzLmJnbS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IHByZXZlbnRlZDpcIiwgZSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheUNsaWNrU291bmQoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlDbGlja1NvdW5kKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy51c2VyQ2hvaWNlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBbY2hvaWNlLCByZWN0XSBvZiB0aGlzLnBsYXllckNob2ljZVJlY3RzLmVudHJpZXMoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xpY2tYID49IHJlY3QueCAmJiBjbGlja1ggPD0gcmVjdC54ICsgcmVjdC53aWR0aCAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xpY2tZID49IHJlY3QueSAmJiBjbGlja1kgPD0gcmVjdC55ICsgcmVjdC5oZWlnaHQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheUNsaWNrU291bmQoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudXNlckNob2ljZSA9IGNob2ljZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzc1JvdW5kRW5kKHRoaXMudXNlckNob2ljZSwgdGhpcy5jZW50cmFsSWNvbiEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5Q2xpY2tTb3VuZCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwcm9jZXNzUm91bmRFbmQocGxheWVyQ2hvaWNlOiBSUFNDaG9pY2UgfCBudWxsLCBjcHVDaG9pY2U6IFJQU0Nob2ljZSB8IG51bGwsIHRpbWVkT3V0OiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGltZWRPdXQgfHwgcGxheWVyQ2hvaWNlID09PSBudWxsIHx8IGNwdUNob2ljZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aGlzLnJvdW5kUmVzdWx0ID0gUm91bmRSZXN1bHQuVElNRU9VVDtcclxuICAgICAgICAgICAgdGhpcy5saXZlcy0tO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXlMb3NlU291bmQoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnJvdW5kUmVzdWx0ID0gdGhpcy5kZXRlcm1pbmVSb3VuZFJlc3VsdChwbGF5ZXJDaG9pY2UsIGNwdUNob2ljZSk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnJvdW5kUmVzdWx0ID09PSBSb3VuZFJlc3VsdC5MT1NFKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxpdmVzLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlMb3NlU291bmQoKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheVdpblNvdW5kKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUk9VTkRfRU5EO1xyXG4gICAgICAgIHRoaXMucm91bmRSZXN1bHREaXNwbGF5VGltZXIgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Mucm91bmRSZXN1bHREaXNwbGF5RHVyYXRpb25TZWNvbmRzO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGxheUNsaWNrU291bmQoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3Qgc291bmQgPSB0aGlzLmFzc2V0TG9hZGVyLmdldFNvdW5kKFwiY2xpY2tfc291bmRcIik7XHJcbiAgICAgICAgaWYgKHNvdW5kKSB7XHJcbiAgICAgICAgICAgIHNvdW5kLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgc291bmQucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJDbGljayBzb3VuZCBwbGF5IHByZXZlbnRlZDpcIiwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlXaW5Tb3VuZCgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBzb3VuZCA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0U291bmQoXCJ3aW5fc291bmRcIik7XHJcbiAgICAgICAgaWYgKHNvdW5kKSB7XHJcbiAgICAgICAgICAgIHNvdW5kLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgc291bmQucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJXaW4gc291bmQgcGxheSBwcmV2ZW50ZWQ6XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5TG9zZVNvdW5kKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHNvdW5kID0gdGhpcy5hc3NldExvYWRlci5nZXRTb3VuZChcImxvc2Vfc291bmRcIik7XHJcbiAgICAgICAgaWYgKHNvdW5kKSB7XHJcbiAgICAgICAgICAgIHNvdW5kLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgc291bmQucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJMb3NlIHNvdW5kIHBsYXkgcHJldmVudGVkOlwiLCBlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudFJvdW5kVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudFJvdW5kVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJvY2Vzc1JvdW5kRW5kKG51bGwsIG51bGwsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlJPVU5EX0VORDpcclxuICAgICAgICAgICAgICAgIHRoaXMucm91bmRSZXN1bHREaXNwbGF5VGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucm91bmRSZXN1bHREaXNwbGF5VGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmxpdmVzIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRSb3VuZCgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3TG9hZGluZ1NjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCIjMzMzMzMzXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIiNGRkZGRkZcIjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJcdUI4NUNcdUI1MjkgXHVDOTExLi4uXCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDIwKTtcclxuICAgICAgICBjb25zdCBwcm9ncmVzcyA9IHRoaXMuYXNzZXRMb2FkZXIuZ2V0TG9hZGluZ1Byb2dyZXNzKCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7TWF0aC5yb3VuZChwcm9ncmVzcyAqIDEwMCl9JWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwKTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3VGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgdGV4dHMgPSB0aGlzLmNvbmZpZy50ZXh0cy50aXRsZVNjcmVlbjtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCIjMWExYTFhXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGV4dHMuZm9udENvbG9yO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYCR7dGV4dHMudGl0bGVGb250U2l6ZX0gQXJpYWxgO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRleHRzLnRpdGxlISwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYCR7dGV4dHMuc3VidGl0bGVGb250U2l6ZX0gQXJpYWxgO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRleHRzLnN1YnRpdGxlISwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgdGV4dHMgPSB0aGlzLmNvbmZpZy50ZXh0cy5pbnN0cnVjdGlvbnNTY3JlZW47XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiIzFhMWExYVwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRleHRzLmZvbnRDb2xvcjtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke3RleHRzLnRpdGxlRm9udFNpemV9IEFyaWFsYDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0cy50aXRsZSEsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDE1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0ZXh0cy5saW5lRm9udFNpemV9IEFyaWFsYDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0cy5saW5lMSEsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0cy5saW5lMiEsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDIwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0cy5saW5lMyEsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0cy5saW5lNCEsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDQwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke3RleHRzLnN1YnRpdGxlRm9udFNpemUgfHwgdGV4dHMubGluZUZvbnRTaXplfSBBcmlhbGA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGV4dHMubGluZTUhLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAxMjApO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXdQbGF5aW5nU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHRleHRzID0gdGhpcy5jb25maWcudGV4dHMucGxheWluZ1NjcmVlbjtcclxuICAgICAgICBjb25zdCBnYW1lU2V0dGluZ3MgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiIzFhMWExYVwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5jZW50cmFsSWNvbikge1xyXG4gICAgICAgICAgICBjb25zdCBpY29uID0gdGhpcy5hc3NldExvYWRlci5nZXRJbWFnZSh0aGlzLmNlbnRyYWxJY29uKTtcclxuICAgICAgICAgICAgaWYgKGljb24pIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHggPSB0aGlzLmNhbnZhcy53aWR0aCAvIDIgLSBnYW1lU2V0dGluZ3MuY2VudHJhbEljb25TaXplIC8gMjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzIC0gZ2FtZVNldHRpbmdzLmNlbnRyYWxJY29uU2l6ZSAvIDI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoaWNvbiwgeCwgeSwgZ2FtZVNldHRpbmdzLmNlbnRyYWxJY29uU2l6ZSwgZ2FtZVNldHRpbmdzLmNlbnRyYWxJY29uU2l6ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGljb25OYW1lcyA9IFtSUFNDaG9pY2UuUk9DSywgUlBTQ2hvaWNlLlBBUEVSLCBSUFNDaG9pY2UuU0NJU1NPUlNdO1xyXG4gICAgICAgIGNvbnN0IGljb25XaWR0aCA9IGdhbWVTZXR0aW5ncy5pY29uU2l6ZTtcclxuICAgICAgICBjb25zdCBpY29uSGVpZ2h0ID0gZ2FtZVNldHRpbmdzLmljb25TaXplO1xyXG4gICAgICAgIGNvbnN0IHRvdGFsV2lkdGggPSBpY29uTmFtZXMubGVuZ3RoICogaWNvbldpZHRoICsgKGljb25OYW1lcy5sZW5ndGggLSAxKSAqIGdhbWVTZXR0aW5ncy5zcGFjaW5nO1xyXG4gICAgICAgIGxldCBjdXJyZW50WCA9ICh0aGlzLmNhbnZhcy53aWR0aCAtIHRvdGFsV2lkdGgpIC8gMjtcclxuICAgICAgICBjb25zdCBpY29uWSA9IHRoaXMuY2FudmFzLmhlaWdodCAtIGdhbWVTZXR0aW5ncy5wbGF5ZXJJY29uT2Zmc2V0IC0gaWNvbkhlaWdodCAvIDI7XHJcblxyXG4gICAgICAgIHRoaXMucGxheWVyQ2hvaWNlUmVjdHMuY2xlYXIoKTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBuYW1lIG9mIGljb25OYW1lcykge1xyXG4gICAgICAgICAgICBjb25zdCBpY29uID0gdGhpcy5hc3NldExvYWRlci5nZXRJbWFnZShuYW1lKTtcclxuICAgICAgICAgICAgaWYgKGljb24pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShpY29uLCBjdXJyZW50WCwgaWNvblksIGljb25XaWR0aCwgaWNvbkhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckNob2ljZVJlY3RzLnNldChuYW1lLCB7IHg6IGN1cnJlbnRYLCB5OiBpY29uWSwgd2lkdGg6IGljb25XaWR0aCwgaGVpZ2h0OiBpY29uSGVpZ2h0IH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGN1cnJlbnRYICs9IGljb25XaWR0aCArIGdhbWVTZXR0aW5ncy5zcGFjaW5nO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJsZWZ0XCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGV4dHMuZm9udENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0ZXh0cy5saXZlc0ZvbnRTaXplfSBBcmlhbGA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGV4dHMubGl2ZXNMYWJlbH0ke3RoaXMubGl2ZXN9YCwgMjAsIDQwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJyaWdodFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0ZXh0cy50aW1lckZvbnRTaXplfSBBcmlhbGA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7dGV4dHMudGltZXJMYWJlbH0ke01hdGgubWF4KDAsIE1hdGguY2VpbCh0aGlzLmN1cnJlbnRSb3VuZFRpbWVyKSl9YCwgdGhpcy5jYW52YXMud2lkdGggLSAyMCwgNDApO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXdSb3VuZEVuZFNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmRyYXdQbGF5aW5nU2NyZWVuKCk7XHJcbiAgICAgICAgY29uc3QgdGV4dHMgPSB0aGlzLmNvbmZpZy50ZXh0cy5yb3VuZFJlc3VsdDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0ZXh0cy5mb250U2l6ZX0gQXJpYWxgOyAvLyBUaGlzIGxpbmUgbm93IGNvcnJlY3RseSB1c2VzICdmb250U2l6ZSdcclxuXHJcbiAgICAgICAgbGV0IHJlc3VsdFRleHQgPSBcIlwiO1xyXG4gICAgICAgIGxldCByZXN1bHRDb2xvciA9IFwiXCI7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnJvdW5kUmVzdWx0ID09PSBSb3VuZFJlc3VsdC5XSU4pIHtcclxuICAgICAgICAgICAgcmVzdWx0VGV4dCA9IHRleHRzLndpbiE7XHJcbiAgICAgICAgICAgIHJlc3VsdENvbG9yID0gdGV4dHMud2luQ29sb3IhO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5yb3VuZFJlc3VsdCA9PT0gUm91bmRSZXN1bHQuTE9TRSkge1xyXG4gICAgICAgICAgICByZXN1bHRUZXh0ID0gdGV4dHMubG9zZSE7XHJcbiAgICAgICAgICAgIHJlc3VsdENvbG9yID0gdGV4dHMubG9zZUNvbG9yITtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucm91bmRSZXN1bHQgPT09IFJvdW5kUmVzdWx0LlRJTUVPVVQpIHtcclxuICAgICAgICAgICAgcmVzdWx0VGV4dCA9IHRleHRzLnRpbWVvdXQhO1xyXG4gICAgICAgICAgICByZXN1bHRDb2xvciA9IHRleHRzLmxvc2VDb2xvciE7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSByZXN1bHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChyZXN1bHRUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB0ZXh0cyA9IHRoaXMuY29uZmlnLnRleHRzLmdhbWVPdmVyU2NyZWVuO1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIiMxYTFhMWFcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0ZXh0cy5mb250Q29sb3I7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0ZXh0cy50aXRsZUZvbnRTaXplfSBBcmlhbGA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGV4dHMudGl0bGUhLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHt0ZXh0cy5zdWJ0aXRsZUZvbnRTaXplfSBBcmlhbGA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGV4dHMuc3VidGl0bGUhLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCk7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhd0Vycm9yTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCIjNTUwMDAwXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIiNGRkZGRkZcIjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJcdUM2MjRcdUI5NTggXHVCQzFDXHVDMEREIVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA0MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobWVzc2FnZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjIwcHggQXJpYWxcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcIlx1Q0Y1OFx1QzE5NFx1Qzc0NCBcdUQ2NTVcdUM3NzhcdUQ1NThcdUMxMzhcdUM2OTQuXCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgZHJhdygpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0luc3RydWN0aW9uc1NjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdQbGF5aW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUk9VTkRfRU5EOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3Um91bmRFbmRTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZXN0YW1wIC0gdGhpcy5sYXN0VGltZXN0YW1wKSAvIDEwMDA7XHJcbiAgICAgICAgdGhpcy5sYXN0VGltZXN0YW1wID0gdGltZXN0YW1wO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgIT09IEdhbWVTdGF0ZS5MT0FESU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZHJhdygpO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5sb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBtYWluKCkge1xyXG4gICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJnYW1lQ2FudmFzXCIpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgaWYgKCFjYW52YXMpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCAnZ2FtZUNhbnZhcycgbm90IGZvdW5kIVwiKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFwiZGF0YS5qc29uXCIpO1xyXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBjb25maWc6IEdhbWVDb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgY29uc3QgZ2FtZSA9IG5ldyBSUFNHYW1lKGNhbnZhcywgY29uZmlnKTtcclxuICAgICAgICBnYW1lLmluaXQoKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGxvYWRpbmcgZ2FtZSBjb25maWd1cmF0aW9uIG9yIHN0YXJ0aW5nIGdhbWU6XCIsIGVycm9yKTtcclxuICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xyXG4gICAgICAgIGlmIChjdHgpIHtcclxuICAgICAgICAgICAgY3R4LmNsZWFyUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gXCIjNTUwMDAwXCI7XHJcbiAgICAgICAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICBjdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwiI0ZGRkZGRlwiO1xyXG4gICAgICAgICAgICBjdHguZm9udCA9IFwiMjRweCBBcmlhbFwiO1xyXG4gICAgICAgICAgICBjdHguZmlsbFRleHQoXCJcdUFDOENcdUM3ODQgXHVDRDA4XHVBRTMwXHVENjU0IFx1QzJFNFx1RDMyODogXHVDMTI0XHVDODE1IFx1RDMwQ1x1Qzc3Q1x1Qzc0NCBcdUI4NUNcdUI0RENcdUQ1NjAgXHVDMjE4IFx1QzVDNlx1QzJCNVx1QjJDOFx1QjJFNC5cIiwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxubWFpbigpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUF1RUEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFB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QkFBZ0I7QUFDckI7QUFBQSxNQUNKLEtBQUs7QUFDRCxhQUFLLHVCQUF1QjtBQUM1QjtBQUFBLE1BQ0osS0FBSztBQUNELGFBQUssa0JBQWtCO0FBQ3ZCO0FBQUEsTUFDSixLQUFLO0FBQ0QsYUFBSyxtQkFBbUI7QUFDeEI7QUFBQSxNQUNKLEtBQUs7QUFDRCxhQUFLLG1CQUFtQjtBQUN4QjtBQUFBLElBQ1I7QUFBQSxFQUNKO0FBQUEsRUFFQSxLQUFLLFdBQXlCO0FBQzFCLFVBQU0sYUFBYSxZQUFZLEtBQUssaUJBQWlCO0FBQ3JELFNBQUssZ0JBQWdCO0FBRXJCLFFBQUksS0FBSyxjQUFjLGlCQUFtQjtBQUN0QyxXQUFLLE9BQU8sU0FBUztBQUFBLElBQ3pCO0FBQ0EsU0FBSyxLQUFLO0FBRVYsMEJBQXNCLEtBQUssS0FBSyxLQUFLLElBQUksQ0FBQztBQUFBLEVBQzlDO0FBQ0o7QUFFQSxlQUFlLE9BQU87QUFDbEIsUUFBTSxTQUFTLFNBQVMsZUFBZSxZQUFZO0FBQ25ELE1BQUksQ0FBQyxRQUFRO0FBQ1QsWUFBUSxNQUFNLGdEQUFnRDtBQUM5RDtBQUFBLEVBQ0o7QUFFQSxNQUFJO0FBQ0EsVUFBTSxXQUFXLE1BQU0sTUFBTSxXQUFXO0FBQ3hDLFFBQUksQ0FBQyxTQUFTLElBQUk7QUFDZCxZQUFNLElBQUksTUFBTSx1QkFBdUIsU0FBUyxNQUFNLEVBQUU7QUFBQSxJQUM1RDtBQUNBLFVBQU0sU0FBcUIsTUFBTSxTQUFTLEtBQUs7QUFDL0MsVUFBTSxPQUFPLElBQUksUUFBUSxRQUFRLE1BQU07QUFDdkMsU0FBSyxLQUFLO0FBQUEsRUFDZCxTQUFTLE9BQU87QUFDWixZQUFRLE1BQU0sc0RBQXNELEtBQUs7QUFDekUsVUFBTSxNQUFNLE9BQU8sV0FBVyxJQUFJO0FBQ2xDLFFBQUksS0FBSztBQUNMLFVBQUksVUFBVSxHQUFHLEdBQUcsT0FBTyxPQUFPLE9BQU8sTUFBTTtBQUMvQyxVQUFJLFlBQVk7QUFDaEIsVUFBSSxTQUFTLEdBQUcsR0FBRyxPQUFPLE9BQU8sT0FBTyxNQUFNO0FBQzlDLFVBQUksWUFBWTtBQUNoQixVQUFJLFlBQVk7QUFDaEIsVUFBSSxPQUFPO0FBQ1gsVUFBSSxTQUFTLHFJQUFpQyxPQUFPLFFBQVEsR0FBRyxPQUFPLFNBQVMsQ0FBQztBQUFBLElBQ3JGO0FBQUEsRUFDSjtBQUNKO0FBRUEsS0FBSzsiLAogICJuYW1lcyI6IFsiR2FtZVN0YXRlIiwgIlJQU0Nob2ljZSIsICJSb3VuZFJlc3VsdCJdCn0K
