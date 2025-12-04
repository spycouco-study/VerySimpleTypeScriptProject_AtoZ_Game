var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 2] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class AssetManager {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.loadedCount = 0;
    this.totalAssets = 0;
  }
  async load(assetsConfig) {
    this.totalAssets = assetsConfig.images.length + assetsConfig.sounds.length;
    if (this.totalAssets === 0) {
      return Promise.resolve();
    }
    const imagePromises = assetsConfig.images.map((img) => this.loadImage(img));
    const soundPromises = assetsConfig.sounds.map((snd) => this.loadSound(snd));
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
  }
  loadImage(asset) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(asset.name, img);
        this.loadedCount++;
        resolve();
      };
      img.onerror = (e) => {
        console.error(`Failed to load image: ${asset.path}`, e);
        reject(e);
      };
      img.src = asset.path;
    });
  }
  loadSound(asset) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.oncanplaythrough = () => {
        this.sounds.set(asset.name, audio);
        audio.volume = asset.volume;
        this.loadedCount++;
        resolve();
      };
      audio.onerror = (e) => {
        console.error(`Failed to load sound: ${asset.path}`, e);
        reject(e);
      };
      audio.src = asset.path;
      audio.load();
    });
  }
  getImage(name) {
    return this.images.get(name);
  }
  getSound(name) {
    return this.sounds.get(name);
  }
  getLoadingProgress() {
    return this.totalAssets > 0 ? this.loadedCount / this.totalAssets : 1;
  }
}
class Game {
  constructor(canvasId) {
    this.assetManager = new AssetManager();
    this.gameState = 0 /* TITLE */;
    this.lastTime = 0;
    this.currentWord = "";
    this.userInput = "";
    this.usedWords = /* @__PURE__ */ new Set();
    this.score = 0;
    this.errorMessage = "";
    this.errorMessageTimer = 0;
    this.ERROR_MESSAGE_DURATION = 2e3;
    this.loadingComplete = false;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.init();
  }
  async init() {
    await this.loadConfig();
    this.canvas.width = this.config.canvasWidth;
    this.canvas.height = this.config.canvasHeight;
    this.setupEventListeners();
    await this.assetManager.load(this.config.assets);
    this.loadingComplete = true;
    this.bgmAudio = this.assetManager.getSound("bgm");
    if (this.bgmAudio) {
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = this.config.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.5;
    }
    this.resetGame();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  async loadConfig() {
    try {
      const response = await fetch("data.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.config = await response.json();
      console.log("Configuration loaded:", this.config);
    } catch (error) {
      console.error("Failed to load game configuration:", error);
      throw error;
    }
  }
  setupEventListeners() {
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    this.canvas.addEventListener("click", this.handleClick.bind(this));
  }
  resetGame() {
    this.currentWord = this.config.initialWord;
    this.userInput = "";
    this.usedWords = /* @__PURE__ */ new Set();
    this.usedWords.add(this.config.initialWord.toLowerCase());
    this.score = 0;
    this.errorMessage = "";
    this.errorMessageTimer = 0;
  }
  startGame() {
    this.gameState = 1 /* PLAYING */;
    if (this.bgmAudio) {
      this.bgmAudio.play().catch((e) => console.warn("BGM playback failed:", e));
    }
  }
  gameLoop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;
    this.update(deltaTime);
    this.render();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    if (!this.loadingComplete) return;
    if (this.errorMessageTimer > 0) {
      this.errorMessageTimer -= deltaTime;
      if (this.errorMessageTimer <= 0) {
        this.errorMessage = "";
      }
    }
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const background = this.assetManager.getImage("background");
    if (background) {
      this.ctx.drawImage(background, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = this.config.backgroundColor;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (!this.loadingComplete) {
      this.drawLoadingScreen();
      return;
    }
    this.ctx.fillStyle = this.config.textColor;
    this.ctx.font = `30px ${this.config.fontFamily}`;
    this.ctx.textAlign = "center";
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 1 /* PLAYING */:
        this.drawPlayingScreen();
        break;
      case 2 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawLoadingScreen() {
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.config.textColor;
    this.ctx.font = `40px ${this.config.fontFamily}`;
    this.ctx.fillText("\uB85C\uB529 \uC911...", this.canvas.width / 2, this.canvas.height / 2 - 50);
    const progress = this.assetManager.getLoadingProgress();
    this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  drawTitleScreen() {
    this.ctx.font = `50px ${this.config.fontFamily}`;
    this.ctx.fillText(this.config.titleScreenText, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = `25px ${this.config.fontFamily}`;
    this.ctx.fillText(this.config.startPromptText, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  drawPlayingScreen() {
    this.ctx.textAlign = "left";
    this.ctx.font = `20px ${this.config.fontFamily}`;
    this.ctx.fillText(`\uC810\uC218: ${this.score}`, 50, 50);
    this.ctx.textAlign = "center";
    this.ctx.font = `40px ${this.config.fontFamily}`;
    this.ctx.fillText(`\uD604\uC7AC \uB2E8\uC5B4: ${this.currentWord}`, this.canvas.width / 2, this.canvas.height / 2 - 80);
    const inputBoxWidth = 400;
    const inputBoxHeight = 60;
    const inputBoxX = (this.canvas.width - inputBoxWidth) / 2;
    const inputBoxY = this.canvas.height / 2 + 20;
    this.ctx.fillStyle = this.config.inputBoxColor;
    this.ctx.fillRect(inputBoxX, inputBoxY, inputBoxWidth, inputBoxHeight);
    this.ctx.strokeStyle = this.config.textColor;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(inputBoxX, inputBoxY, inputBoxWidth, inputBoxHeight);
    this.ctx.fillStyle = this.config.inputTextColor;
    this.ctx.font = `30px ${this.config.fontFamily}`;
    this.ctx.textAlign = "left";
    this.ctx.fillText(this.userInput, inputBoxX + 10, inputBoxY + inputBoxHeight / 2 + 10);
    if (this.errorMessage) {
      this.ctx.fillStyle = this.config.errorTextColor;
      this.ctx.font = `25px ${this.config.fontFamily}`;
      this.ctx.textAlign = "center";
      this.ctx.fillText(this.errorMessage, this.canvas.width / 2, inputBoxY + inputBoxHeight + 50);
    }
  }
  drawGameOverScreen() {
    this.ctx.font = `50px ${this.config.fontFamily}`;
    this.ctx.fillText(this.config.gameOverText + this.score, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = `25px ${this.config.fontFamily}`;
    this.ctx.fillText(this.config.restartPromptText, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  handleKeyDown(event) {
    if (!this.loadingComplete) return;
    if (this.gameState === 1 /* PLAYING */) {
      const key = event.key;
      if (key.length === 1 && (/[ㄱ-힣]/.test(key) || /[a-zA-Z0-9]/.test(key))) {
        this.userInput += key;
      } else if (key === "Backspace") {
        this.userInput = this.userInput.slice(0, -1);
      } else if (key === "Enter") {
        this.submitWord();
      }
    }
  }
  handleClick() {
    if (!this.loadingComplete) return;
    if (this.gameState === 0 /* TITLE */) {
      this.startGame();
    } else if (this.gameState === 2 /* GAME_OVER */) {
      this.resetGame();
      this.gameState = 0 /* TITLE */;
      if (this.bgmAudio) {
        this.bgmAudio.pause();
        this.bgmAudio.currentTime = 0;
      }
    }
  }
  submitWord() {
    const trimmedInput = this.userInput.trim();
    if (trimmedInput.length === 0) {
      this.showError("\uB2E8\uC5B4\uB97C \uC785\uB825\uD558\uC138\uC694!");
      return;
    }
    const lastCharOfCurrentWord = this.currentWord.charAt(this.currentWord.length - 1);
    const firstCharOfInput = trimmedInput.charAt(0);
    if (firstCharOfInput !== lastCharOfCurrentWord) {
      this.showError(`'${lastCharOfCurrentWord}'(\uC73C)\uB85C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4!`);
      this.playIncorrectSound();
      this.gameState = 2 /* GAME_OVER */;
      return;
    }
    const wordListSet = new Set(this.config.wordList.map((word) => word.toLowerCase()));
    if (!wordListSet.has(trimmedInput.toLowerCase())) {
      this.showError("\uC0AC\uC804\uC5D0 \uC5C6\uB294 \uB2E8\uC5B4\uC785\uB2C8\uB2E4!");
      this.playIncorrectSound();
      this.gameState = 2 /* GAME_OVER */;
      return;
    }
    if (this.usedWords.has(trimmedInput.toLowerCase())) {
      this.showError("\uC774\uBBF8 \uC0AC\uC6A9\uD55C \uB2E8\uC5B4\uC785\uB2C8\uB2E4!");
      this.playIncorrectSound();
      this.gameState = 2 /* GAME_OVER */;
      return;
    }
    this.playCorrectSound();
    this.currentWord = trimmedInput;
    this.usedWords.add(trimmedInput.toLowerCase());
    this.score++;
    this.userInput = "";
    this.errorMessage = "";
  }
  showError(message) {
    this.errorMessage = message;
    this.errorMessageTimer = this.ERROR_MESSAGE_DURATION;
  }
  playSound(name) {
    const sound = this.assetManager.getSound(name);
    if (sound) {
      const clone = sound.cloneNode();
      clone.volume = sound.volume;
      clone.play().catch((e) => console.warn(`Sound playback failed for ${name}:`, e));
    }
  }
  playCorrectSound() {
    this.playSound("correct");
  }
  playIncorrectSound() {
    this.playSound("incorrect");
  }
}
document.addEventListener("DOMContentLoaded", () => {
  try {
    new Game("gameCanvas");
  } catch (e) {
    console.error("Failed to initialize game:", e);
    const body = document.body;
    if (body) {
      body.innerHTML = '<p style="color:red; text-align:center;">\uAC8C\uC784 \uCD08\uAE30\uD654\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uCF58\uC194\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.</p>';
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICB0aXRsZVNjcmVlblRleHQ6IHN0cmluZztcclxuICAgIHN0YXJ0UHJvbXB0VGV4dDogc3RyaW5nO1xyXG4gICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XHJcbiAgICByZXN0YXJ0UHJvbXB0VGV4dDogc3RyaW5nO1xyXG4gICAgZm9udEZhbWlseTogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZztcclxuICAgIGlucHV0Qm94Q29sb3I6IHN0cmluZztcclxuICAgIGlucHV0VGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBlcnJvclRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgY29ycmVjdFRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgd29yZExpc3Q6IHN0cmluZ1tdO1xyXG4gICAgaW5pdGlhbFdvcmQ6IHN0cmluZztcclxuICAgIGFzc2V0czogQXNzZXRzQ29uZmlnO1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIGxvYWRlZENvdW50OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuXHJcbiAgICBhc3luYyBsb2FkKGFzc2V0c0NvbmZpZzogQXNzZXRzQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubGVuZ3RoICsgYXNzZXRzQ29uZmlnLnNvdW5kcy5sZW5ndGg7XHJcbiAgICAgICAgaWYgKHRoaXMudG90YWxBc3NldHMgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubWFwKGltZyA9PiB0aGlzLmxvYWRJbWFnZShpbWcpKTtcclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gYXNzZXRzQ29uZmlnLnNvdW5kcy5tYXAoc25kID0+IHRoaXMubG9hZFNvdW5kKHNuZCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKGFzc2V0OiBJbWFnZUFzc2V0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoYXNzZXQubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gLCBlKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoYXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9IChlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldC5wYXRofWAsIGUpO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGUpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIFJlcXVlc3QgdG8gbG9hZCB0aGUgYXVkaW9cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNvdW5kKG5hbWU6IHN0cmluZyk6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9hZGluZ1Byb2dyZXNzKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG90YWxBc3NldHMgPiAwID8gdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxBc3NldHMgOiAxO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGNvbmZpZyE6IEdhbWVDb25maWc7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyID0gbmV3IEFzc2V0TWFuYWdlcigpO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRXb3JkOiBzdHJpbmcgPSBcIlwiO1xyXG4gICAgcHJpdmF0ZSB1c2VySW5wdXQ6IHN0cmluZyA9IFwiXCI7XHJcbiAgICBwcml2YXRlIHVzZWRXb3JkczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBlcnJvck1lc3NhZ2U6IHN0cmluZyA9IFwiXCI7XHJcbiAgICBwcml2YXRlIGVycm9yTWVzc2FnZVRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBFUlJPUl9NRVNTQUdFX0RVUkFUSU9OID0gMjAwMDsgLy8gMiBzZWNvbmRzXHJcbiAgICBwcml2YXRlIGJnbUF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkO1xyXG4gICAgcHJpdmF0ZSBsb2FkaW5nQ29tcGxldGU6IGJvb2xlYW4gPSBmYWxzZTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbnZhcyBlbGVtZW50IHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcblxyXG4gICAgICAgIHRoaXMuaW5pdCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRDb25maWcoKTtcclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodDtcclxuICAgICAgICB0aGlzLnNldHVwRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgICAgICBhd2FpdCB0aGlzLmFzc2V0TWFuYWdlci5sb2FkKHRoaXMuY29uZmlnLmFzc2V0cyk7XHJcbiAgICAgICAgdGhpcy5sb2FkaW5nQ29tcGxldGUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuYmdtQXVkaW8gPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRTb3VuZCgnYmdtJyk7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby52b2x1bWUgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lIHx8IDAuNTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRDb25maWcoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJDb25maWd1cmF0aW9uIGxvYWRlZDpcIiwgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb246XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBFdmVudExpc3RlbmVycygpIHtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5oYW5kbGVLZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDbGljay5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLmN1cnJlbnRXb3JkID0gdGhpcy5jb25maWcuaW5pdGlhbFdvcmQ7XHJcbiAgICAgICAgdGhpcy51c2VySW5wdXQgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMudXNlZFdvcmRzID0gbmV3IFNldCgpO1xyXG4gICAgICAgIHRoaXMudXNlZFdvcmRzLmFkZCh0aGlzLmNvbmZpZy5pbml0aWFsV29yZC50b0xvd2VyQ2FzZSgpKTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2VUaW1lciA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkJHTSBwbGF5YmFjayBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCh0aW1lc3RhbXA6IG51bWJlcikge1xyXG4gICAgICAgIGlmICghdGhpcy5sYXN0VGltZSkgdGhpcy5sYXN0VGltZSA9IHRpbWVzdGFtcDtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSB0aW1lc3RhbXAgLSB0aGlzLmxhc3RUaW1lO1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lc3RhbXA7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAoIXRoaXMubG9hZGluZ0NvbXBsZXRlKSByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmVycm9yTWVzc2FnZVRpbWVyID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmVycm9yTWVzc2FnZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZXJyb3JNZXNzYWdlVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2UgPSBcIlwiO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdiYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgaWYgKGJhY2tncm91bmQpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJhY2tncm91bmQsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmJhY2tncm91bmRDb2xvcjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIXRoaXMubG9hZGluZ0NvbXBsZXRlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMzBweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1BsYXlpbmdTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0xvYWRpbmdTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuYmFja2dyb3VuZENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDQwcHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJcdUI4NUNcdUI1MjkgXHVDOTExLi4uXCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICBjb25zdCBwcm9ncmVzcyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldExvYWRpbmdQcm9ncmVzcygpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke01hdGgucm91bmQocHJvZ3Jlc3MgKiAxMDApfSVgLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGA1MHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRpdGxlU2NyZWVuVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMjVweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy5zdGFydFByb21wdFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdQbGF5aW5nU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDIwcHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1QzgxMFx1QzIxODogJHt0aGlzLnNjb3JlfWAsIDUwLCA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgNDBweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVENjA0XHVDN0FDIFx1QjJFOFx1QzVCNDogJHt0aGlzLmN1cnJlbnRXb3JkfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDgwKTtcclxuXHJcbiAgICAgICAgY29uc3QgaW5wdXRCb3hXaWR0aCA9IDQwMDtcclxuICAgICAgICBjb25zdCBpbnB1dEJveEhlaWdodCA9IDYwO1xyXG4gICAgICAgIGNvbnN0IGlucHV0Qm94WCA9ICh0aGlzLmNhbnZhcy53aWR0aCAtIGlucHV0Qm94V2lkdGgpIC8gMjtcclxuICAgICAgICBjb25zdCBpbnB1dEJveFkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjA7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmlucHV0Qm94Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoaW5wdXRCb3hYLCBpbnB1dEJveFksIGlucHV0Qm94V2lkdGgsIGlucHV0Qm94SGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9IHRoaXMuY29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QoaW5wdXRCb3hYLCBpbnB1dEJveFksIGlucHV0Qm94V2lkdGgsIGlucHV0Qm94SGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuaW5wdXRUZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAzMHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnVzZXJJbnB1dCwgaW5wdXRCb3hYICsgMTAsIGlucHV0Qm94WSArIGlucHV0Qm94SGVpZ2h0IC8gMiArIDEwKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZXJyb3JNZXNzYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmVycm9yVGV4dENvbG9yO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI1cHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmVycm9yTWVzc2FnZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCBpbnB1dEJveFkgKyBpbnB1dEJveEhlaWdodCArIDUwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGA1MHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLmdhbWVPdmVyVGV4dCArIHRoaXMuc2NvcmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI1cHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcucmVzdGFydFByb21wdFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICBpZiAoIXRoaXMubG9hZGluZ0NvbXBsZXRlKSByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgY29uc3Qga2V5ID0gZXZlbnQua2V5O1xyXG4gICAgICAgICAgICAvLyBBbGxvdyBLb3JlYW4sIEVuZ2xpc2gsIG51bWJlcnNcclxuICAgICAgICAgICAgaWYgKGtleS5sZW5ndGggPT09IDEgJiYgKC9bXHUzMTMxLVx1RDdBM10vLnRlc3Qoa2V5KSB8fCAvW2EtekEtWjAtOV0vLnRlc3Qoa2V5KSkpIHsgXHJcbiAgICAgICAgICAgICAgICB0aGlzLnVzZXJJbnB1dCArPSBrZXk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSAnQmFja3NwYWNlJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy51c2VySW5wdXQgPSB0aGlzLnVzZXJJbnB1dC5zbGljZSgwLCAtMSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSAnRW50ZXInKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN1Ym1pdFdvcmQoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUNsaWNrKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5sb2FkaW5nQ29tcGxldGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdWJtaXRXb3JkKCkge1xyXG4gICAgICAgIGNvbnN0IHRyaW1tZWRJbnB1dCA9IHRoaXMudXNlcklucHV0LnRyaW0oKTtcclxuICAgICAgICBpZiAodHJpbW1lZElucHV0Lmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnNob3dFcnJvcihcIlx1QjJFOFx1QzVCNFx1Qjk3QyBcdUM3ODVcdUI4MjVcdUQ1NThcdUMxMzhcdUM2OTQhXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBsYXN0Q2hhck9mQ3VycmVudFdvcmQgPSB0aGlzLmN1cnJlbnRXb3JkLmNoYXJBdCh0aGlzLmN1cnJlbnRXb3JkLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGNvbnN0IGZpcnN0Q2hhck9mSW5wdXQgPSB0cmltbWVkSW5wdXQuY2hhckF0KDApO1xyXG5cclxuICAgICAgICBpZiAoZmlyc3RDaGFyT2ZJbnB1dCAhPT0gbGFzdENoYXJPZkN1cnJlbnRXb3JkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2hvd0Vycm9yKGAnJHtsYXN0Q2hhck9mQ3VycmVudFdvcmR9JyhcdUM3M0MpXHVCODVDIFx1QzJEQ1x1Qzc5MVx1RDU3NFx1QzU3QyBcdUQ1NjlcdUIyQzhcdUIyRTQhYCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheUluY29ycmVjdFNvdW5kKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ29udmVydCB3b3JkIGxpc3QgdG8gYSBTZXQgZm9yIGZhc3RlciBsb29rdXAgYW5kIG5vcm1hbGl6ZSB0byBsb3dlcmNhc2VcclxuICAgICAgICBjb25zdCB3b3JkTGlzdFNldCA9IG5ldyBTZXQodGhpcy5jb25maWcud29yZExpc3QubWFwKHdvcmQgPT4gd29yZC50b0xvd2VyQ2FzZSgpKSk7XHJcblxyXG4gICAgICAgIGlmICghd29yZExpc3RTZXQuaGFzKHRyaW1tZWRJbnB1dC50b0xvd2VyQ2FzZSgpKSkge1xyXG4gICAgICAgICAgICB0aGlzLnNob3dFcnJvcihcIlx1QzBBQ1x1QzgwNFx1QzVEMCBcdUM1QzZcdUIyOTQgXHVCMkU4XHVDNUI0XHVDNzg1XHVCMkM4XHVCMkU0IVwiKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5SW5jb3JyZWN0U291bmQoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy51c2VkV29yZHMuaGFzKHRyaW1tZWRJbnB1dC50b0xvd2VyQ2FzZSgpKSkge1xyXG4gICAgICAgICAgICB0aGlzLnNob3dFcnJvcihcIlx1Qzc3NFx1QkJGOCBcdUMwQUNcdUM2QTlcdUQ1NUMgXHVCMkU4XHVDNUI0XHVDNzg1XHVCMkM4XHVCMkU0IVwiKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5SW5jb3JyZWN0U291bmQoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnBsYXlDb3JyZWN0U291bmQoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRXb3JkID0gdHJpbW1lZElucHV0O1xyXG4gICAgICAgIHRoaXMudXNlZFdvcmRzLmFkZCh0cmltbWVkSW5wdXQudG9Mb3dlckNhc2UoKSk7XHJcbiAgICAgICAgdGhpcy5zY29yZSsrO1xyXG4gICAgICAgIHRoaXMudXNlcklucHV0ID0gXCJcIjtcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IFwiXCI7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzaG93RXJyb3IobWVzc2FnZTogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2UgPSBtZXNzYWdlO1xyXG4gICAgICAgIHRoaXMuZXJyb3JNZXNzYWdlVGltZXIgPSB0aGlzLkVSUk9SX01FU1NBR0VfRFVSQVRJT047XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5U291bmQobmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3Qgc291bmQgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRTb3VuZChuYW1lKTtcclxuICAgICAgICBpZiAoc291bmQpIHtcclxuICAgICAgICAgICAgY29uc3QgY2xvbmUgPSBzb3VuZC5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgU291bmQgcGxheWJhY2sgZmFpbGVkIGZvciAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5Q29ycmVjdFNvdW5kKCkge1xyXG4gICAgICAgIHRoaXMucGxheVNvdW5kKCdjb3JyZWN0Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5SW5jb3JyZWN0U291bmQoKSB7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ2luY29ycmVjdCcpO1xyXG4gICAgfVxyXG59XHJcblxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaW5pdGlhbGl6ZSBnYW1lOlwiLCBlKTtcclxuICAgICAgICBjb25zdCBib2R5ID0gZG9jdW1lbnQuYm9keTtcclxuICAgICAgICBpZiAoYm9keSkge1xyXG4gICAgICAgICAgICBib2R5LmlubmVySFRNTCA9ICc8cCBzdHlsZT1cImNvbG9yOnJlZDsgdGV4dC1hbGlnbjpjZW50ZXI7XCI+XHVBQzhDXHVDNzg0IFx1Q0QwOFx1QUUzMFx1RDY1NFx1QzVEMCBcdUMyRTRcdUQzMjhcdUQ1ODhcdUMyQjVcdUIyQzhcdUIyRTQuIFx1Q0Y1OFx1QzE5NFx1Qzc0NCBcdUQ2NTVcdUM3NzhcdUQ1NzRcdUM4RkNc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
