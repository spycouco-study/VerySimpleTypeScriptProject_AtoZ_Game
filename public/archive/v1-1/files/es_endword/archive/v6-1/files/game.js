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
  // 추가: 숨겨진 HTML input 요소
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
    this.hiddenInput = document.createElement("input");
    this.hiddenInput.type = "text";
    this.hiddenInput.style.position = "absolute";
    this.hiddenInput.style.opacity = "0";
    this.hiddenInput.style.pointerEvents = "none";
    this.hiddenInput.style.left = "-9999px";
    this.hiddenInput.style.top = "-9999px";
    this.hiddenInput.style.width = "1px";
    this.hiddenInput.style.height = "1px";
    this.hiddenInput.style.zIndex = "-1";
    document.body.appendChild(this.hiddenInput);
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
    this.canvas.addEventListener("click", this.handleClick.bind(this));
    this.hiddenInput.addEventListener("input", this.handleTextInput.bind(this));
    this.hiddenInput.addEventListener("keydown", this.handleInputKeyDown.bind(this));
    document.addEventListener("keydown", (e) => {
      if (this.gameState === 1 /* PLAYING */ && (e.key === "Backspace" || e.key === "Enter")) {
        e.preventDefault();
      }
    });
  }
  resetGame() {
    this.currentWord = this.config.initialWord;
    this.userInput = "";
    this.usedWords = /* @__PURE__ */ new Set();
    this.usedWords.add(this.config.initialWord.toLowerCase());
    this.score = 0;
    this.errorMessage = "";
    this.errorMessageTimer = 0;
    this.hiddenInput.value = "";
  }
  startGame() {
    this.gameState = 1 /* PLAYING */;
    if (this.bgmAudio) {
      this.bgmAudio.play().catch((e) => console.warn("BGM playback failed:", e));
    }
    this.hiddenInput.value = this.userInput;
    this.hiddenInput.focus();
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
  // 숨겨진 input의 'input' 이벤트 핸들러 (한글 조합 및 일반 문자 입력 처리)
  handleTextInput(event) {
    if (!this.loadingComplete || this.gameState !== 1 /* PLAYING */) return;
    this.userInput = this.hiddenInput.value;
  }
  // 숨겨진 input의 'keydown' 이벤트 핸들러 (Enter, Backspace 등 특수 키 처리)
  handleInputKeyDown(event) {
    if (!this.loadingComplete || this.gameState !== 1 /* PLAYING */) return;
    if (event.key === "Enter") {
      this.submitWord();
      event.preventDefault();
    } else if (event.key === "Backspace") {
      event.preventDefault();
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
      this.hiddenInput.blur();
    } else if (this.gameState === 1 /* PLAYING */) {
      this.hiddenInput.focus();
    }
  }
  submitWord() {
    const trimmedInput = this.userInput.trim();
    this.userInput = "";
    this.hiddenInput.value = "";
    if (trimmedInput.length === 0) {
      this.showError("\uB2E8\uC5B4\uB97C \uC785\uB825\uD558\uC138\uC694!");
      return;
    }
    const lastCharOfCurrentWord = this.currentWord.charAt(this.currentWord.length - 1);
    const firstCharOfInput = trimmedInput.charAt(0);
    if (firstCharOfInput !== lastCharOfCurrentWord) {
      this.showError(`'${lastCharOfCurrentWord}'(\uC73C)\uB85C \uC2DC\uC791\uD574\uC57C \uD569\uB2C8\uB2E4!`);
      this.playIncorrectSound();
      return;
    }
    const wordListSet = new Set(this.config.wordList.map((word) => word.toLowerCase()));
    if (!wordListSet.has(trimmedInput.toLowerCase())) {
      this.showError("\uC0AC\uC804\uC5D0 \uC5C6\uB294 \uB2E8\uC5B4\uC785\uB2C8\uB2E4!");
      this.playIncorrectSound();
      return;
    }
    if (this.usedWords.has(trimmedInput.toLowerCase())) {
      this.showError("\uC774\uBBF8 \uC0AC\uC6A9\uD55C \uB2E8\uC5B4\uC785\uB2C8\uB2E4!");
      this.playIncorrectSound();
      return;
    }
    this.playCorrectSound();
    this.currentWord = trimmedInput;
    this.usedWords.add(trimmedInput.toLowerCase());
    this.score++;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICB0aXRsZVNjcmVlblRleHQ6IHN0cmluZztcclxuICAgIHN0YXJ0UHJvbXB0VGV4dDogc3RyaW5nO1xyXG4gICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XHJcbiAgICByZXN0YXJ0UHJvbXB0VGV4dDogc3RyaW5nO1xyXG4gICAgZm9udEZhbWlseTogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZztcclxuICAgIGlucHV0Qm94Q29sb3I6IHN0cmluZztcclxuICAgIGlucHV0VGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBlcnJvclRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgY29ycmVjdFRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgd29yZExpc3Q6IHN0cmluZ1tdO1xyXG4gICAgaW5pdGlhbFdvcmQ6IHN0cmluZztcclxuICAgIGFzc2V0czogQXNzZXRzQ29uZmlnO1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIGxvYWRlZENvdW50OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuXHJcbiAgICBhc3luYyBsb2FkKGFzc2V0c0NvbmZpZzogQXNzZXRzQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubGVuZ3RoICsgYXNzZXRzQ29uZmlnLnNvdW5kcy5sZW5ndGg7XHJcbiAgICAgICAgaWYgKHRoaXMudG90YWxBc3NldHMgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubWFwKGltZyA9PiB0aGlzLmxvYWRJbWFnZShpbWcpKTtcclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gYXNzZXRzQ29uZmlnLnNvdW5kcy5tYXAoc25kID0+IHRoaXMubG9hZFNvdW5kKHNuZCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKGFzc2V0OiBJbWFnZUFzc2V0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoYXNzZXQubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gLCBlKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoYXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9IChlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldC5wYXRofWAsIGUpO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGUpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIFJlcXVlc3QgdG8gbG9hZCB0aGUgYXVkaW9cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNvdW5kKG5hbWU6IHN0cmluZyk6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9hZGluZ1Byb2dyZXNzKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG90YWxBc3NldHMgPiAwID8gdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxBc3NldHMgOiAxO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGNvbmZpZyE6IEdhbWVDb25maWc7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyID0gbmV3IEFzc2V0TWFuYWdlcigpO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRXb3JkOiBzdHJpbmcgPSBcIlwiO1xyXG4gICAgcHJpdmF0ZSB1c2VySW5wdXQ6IHN0cmluZyA9IFwiXCI7XHJcbiAgICBwcml2YXRlIHVzZWRXb3JkczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBlcnJvck1lc3NhZ2U6IHN0cmluZyA9IFwiXCI7XHJcbiAgICBwcml2YXRlIGVycm9yTWVzc2FnZVRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBFUlJPUl9NRVNTQUdFX0RVUkFUSU9OID0gMjAwMDsgLy8gMiBzZWNvbmRzXHJcbiAgICBwcml2YXRlIGJnbUF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkO1xyXG4gICAgcHJpdmF0ZSBsb2FkaW5nQ29tcGxldGU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgaGlkZGVuSW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQ7IC8vIFx1Q0Q5NFx1QUMwMDogXHVDMjI4XHVBQ0E4XHVDOUM0IEhUTUwgaW5wdXQgXHVDNjk0XHVDMThDXHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgZWxlbWVudCB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgICAgICAvLyBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXQgXHVDNjk0XHVDMThDIFx1QzBERFx1QzEzMSBcdUJDMEYgXHVDRDA4XHVBRTMwXHVENjU0XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC50eXBlID0gJ3RleHQnO1xyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUub3BhY2l0eSA9ICcwJzsgLy8gXHVDNjQ0XHVDODA0XHVENzg4IFx1RDIyQ1x1QkE4NVx1RDU1OFx1QUM4QyBcdUI5Q0NcdUI0RTZcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7IC8vIFx1QjlDOFx1QzZCMFx1QzJBNCBcdUM3NzRcdUJDQTRcdUQyQjggXHVCQjM0XHVDMkRDXHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5zdHlsZS5sZWZ0ID0gJy05OTk5cHgnOyAvLyBcdUQ2NTRcdUJBNzQgXHVCQzE2XHVDNzNDXHVCODVDIFx1Qzc3NFx1QjNEOVxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUudG9wID0gJy05OTk5cHgnO1xyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUud2lkdGggPSAnMXB4JzsgLy8gXHVDRDVDXHVDMThDIFx1RDA2Q1x1QUUzMFxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUuaGVpZ2h0ID0gJzFweCc7XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5zdHlsZS56SW5kZXggPSAnLTEnOyAvLyBcdUQ2MzlcdUMyREMgXHVCQUE4XHVCOTdDIFx1QUMwNFx1QzEyRCBcdUJDMjlcdUM5QzBcdUI5N0MgXHVDNzA0XHVENTc0IHotaW5kZXhcdUI5N0MgXHVCMEFFXHVDREE0XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmhpZGRlbklucHV0KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbml0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZygpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jb25maWcuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuc2V0dXBFdmVudExpc3RlbmVycygpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMuYXNzZXRNYW5hZ2VyLmxvYWQodGhpcy5jb25maWcuYXNzZXRzKTtcclxuICAgICAgICB0aGlzLmxvYWRpbmdDb21wbGV0ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5iZ21BdWRpbyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldFNvdW5kKCdiZ20nKTtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmxvb3AgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnZvbHVtZSA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpPy52b2x1bWUgfHwgMC41O1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnJlc2V0R2FtZSgpO1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkNvbmZpZ3VyYXRpb24gbG9hZGVkOlwiLCB0aGlzLmNvbmZpZyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cEV2ZW50TGlzdGVuZXJzKCkge1xyXG4gICAgICAgIC8vIFx1QUUzMFx1Qzg3NCBkb2N1bWVudCBrZXlkb3duIFx1QjlBQ1x1QzJBNFx1QjEwOCBcdUM4MUNcdUFDNzBcclxuICAgICAgICAvLyBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5oYW5kbGVLZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDbGljay5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gXHVDMjI4XHVBQ0E4XHVDOUM0IGlucHV0IFx1QzY5NFx1QzE4Q1x1QzVEMCBcdUM3NzRcdUJDQTRcdUQyQjggXHVCOUFDXHVDMkE0XHVCMTA4IFx1Q0Q5NFx1QUMwMFxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB0aGlzLmhhbmRsZVRleHRJbnB1dC5iaW5kKHRoaXMpKTtcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUlucHV0S2V5RG93bi5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gXHVCRTBDXHVCNzdDXHVDNkIwXHVDODAwXHVDNzU4IFx1QUUzMFx1QkNGOCBcdUIzRDlcdUM3OTEgKFx1QzYwODogQmFja3NwYWNlXHVCODVDIFx1QjRBNFx1Qjg1QyBcdUFDMDBcdUFFMzApIFx1QkMyOVx1QzlDMFxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIChlLmtleSA9PT0gJ0JhY2tzcGFjZScgfHwgZS5rZXkgPT09ICdFbnRlcicpKSB7XHJcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLmN1cnJlbnRXb3JkID0gdGhpcy5jb25maWcuaW5pdGlhbFdvcmQ7XHJcbiAgICAgICAgdGhpcy51c2VySW5wdXQgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMudXNlZFdvcmRzID0gbmV3IFNldCgpO1xyXG4gICAgICAgIHRoaXMudXNlZFdvcmRzLmFkZCh0aGlzLmNvbmZpZy5pbml0aWFsV29yZC50b0xvd2VyQ2FzZSgpKTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2VUaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC52YWx1ZSA9IFwiXCI7IC8vIFx1QzIyOFx1QUNBOFx1QzlDNCBpbnB1dFx1Qzc1OCBcdUFDMTJcdUIzQzQgXHVDRDA4XHVBRTMwXHVENjU0XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkJHTSBwbGF5YmFjayBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC52YWx1ZSA9IHRoaXMudXNlcklucHV0OyAvLyBcdUQ2MDRcdUM3QUMgXHVDMEFDXHVDNkE5XHVDNzkwIFx1Qzc4NVx1QjgyNVx1Qzc0NCBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXRcdUM1RDAgXHVCQzE4XHVDNjAxIChcdUNEMDhcdUFFMzBcdUM1RDBcdUIyOTQgXHVCRTQ0XHVDNUI0XHVDNzg4XHVDNzRDKVxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuZm9jdXMoKTsgLy8gXHVBQzhDXHVDNzg0IFx1QzJEQ1x1Qzc5MSBcdUMyREMgXHVDMjI4XHVBQ0E4XHVDOUM0IGlucHV0XHVDNUQwIFx1RDNFQ1x1Q0VFNFx1QzJBNFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AodGltZXN0YW1wOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAoIXRoaXMubGFzdFRpbWUpIHRoaXMubGFzdFRpbWUgPSB0aW1lc3RhbXA7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gdGltZXN0YW1wIC0gdGhpcy5sYXN0VGltZTtcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gdGltZXN0YW1wO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyKCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxvYWRpbmdDb21wbGV0ZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5lcnJvck1lc3NhZ2VUaW1lciA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2VUaW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmVycm9yTWVzc2FnZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZXJyb3JNZXNzYWdlID0gXCJcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJhY2tncm91bmQgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnYmFja2dyb3VuZCcpO1xyXG4gICAgICAgIGlmIChiYWNrZ3JvdW5kKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiYWNrZ3JvdW5kLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5iYWNrZ3JvdW5kQ29sb3I7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmxvYWRpbmdDb21wbGV0ZSkge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDMwcHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdQbGF5aW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdMb2FkaW5nU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmJhY2tncm91bmRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGA0MHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFwiXHVCODVDXHVCNTI5IFx1QzkxMS4uLlwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcbiAgICAgICAgY29uc3QgcHJvZ3Jlc3MgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRMb2FkaW5nUHJvZ3Jlc3MoKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHtNYXRoLnJvdW5kKHByb2dyZXNzICogMTAwKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgNTBweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50aXRsZVNjcmVlblRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI1cHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcuc3RhcnRQcm9tcHRUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3UGxheWluZ1NjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyMHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBcdUM4MTBcdUMyMTg6ICR7dGhpcy5zY29yZX1gLCA1MCwgNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDQwcHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1RDYwNFx1QzdBQyBcdUIyRThcdUM1QjQ6ICR7dGhpcy5jdXJyZW50V29yZH1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGlucHV0Qm94V2lkdGggPSA0MDA7XHJcbiAgICAgICAgY29uc3QgaW5wdXRCb3hIZWlnaHQgPSA2MDtcclxuICAgICAgICBjb25zdCBpbnB1dEJveFggPSAodGhpcy5jYW52YXMud2lkdGggLSBpbnB1dEJveFdpZHRoKSAvIDI7XHJcbiAgICAgICAgY29uc3QgaW5wdXRCb3hZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5pbnB1dEJveENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGlucHV0Qm94WCwgaW5wdXRCb3hZLCBpbnB1dEJveFdpZHRoLCBpbnB1dEJveEhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMjtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KGlucHV0Qm94WCwgaW5wdXRCb3hZLCBpbnB1dEJveFdpZHRoLCBpbnB1dEJveEhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmlucHV0VGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMzBweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy51c2VySW5wdXQsIGlucHV0Qm94WCArIDEwLCBpbnB1dEJveFkgKyBpbnB1dEJveEhlaWdodCAvIDIgKyAxMCk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmVycm9yTWVzc2FnZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5lcnJvclRleHRDb2xvcjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyNXB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5lcnJvck1lc3NhZ2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgaW5wdXRCb3hZICsgaW5wdXRCb3hIZWlnaHQgKyA1MCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVPdmVyU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgNTBweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy5nYW1lT3ZlclRleHQgKyB0aGlzLnNjb3JlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyNXB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnJlc3RhcnRQcm9tcHRUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gXHVDMjI4XHVBQ0E4XHVDOUM0IGlucHV0XHVDNzU4ICdpbnB1dCcgXHVDNzc0XHVCQ0E0XHVEMkI4IFx1RDU3OFx1QjRFNFx1QjdFQyAoXHVENTVDXHVBRTAwIFx1Qzg3MFx1RDU2OSBcdUJDMEYgXHVDNzdDXHVCQzE4IFx1QkIzOFx1Qzc5MCBcdUM3ODVcdUI4MjUgXHVDQzk4XHVCOUFDKVxyXG4gICAgcHJpdmF0ZSBoYW5kbGVUZXh0SW5wdXQoZXZlbnQ6IEV2ZW50KSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxvYWRpbmdDb21wbGV0ZSB8fCB0aGlzLmdhbWVTdGF0ZSAhPT0gR2FtZVN0YXRlLlBMQVlJTkcpIHJldHVybjtcclxuICAgICAgICB0aGlzLnVzZXJJbnB1dCA9IHRoaXMuaGlkZGVuSW5wdXQudmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gXHVDMjI4XHVBQ0E4XHVDOUM0IGlucHV0XHVDNzU4ICdrZXlkb3duJyBcdUM3NzRcdUJDQTRcdUQyQjggXHVENTc4XHVCNEU0XHVCN0VDIChFbnRlciwgQmFja3NwYWNlIFx1QjRGMSBcdUQyQjlcdUMyMTggXHVEMEE0IFx1Q0M5OFx1QjlBQylcclxuICAgIHByaXZhdGUgaGFuZGxlSW5wdXRLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxvYWRpbmdDb21wbGV0ZSB8fCB0aGlzLmdhbWVTdGF0ZSAhPT0gR2FtZVN0YXRlLlBMQVlJTkcpIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKGV2ZW50LmtleSA9PT0gJ0VudGVyJykge1xyXG4gICAgICAgICAgICB0aGlzLnN1Ym1pdFdvcmQoKTtcclxuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTsgLy8gRW50ZXIgXHVEMEE0XHVDNzU4IFx1QUUzMFx1QkNGOCBcdUIzRDlcdUM3OTEgXHVCQzI5XHVDOUMwXHJcbiAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkgPT09ICdCYWNrc3BhY2UnKSB7XHJcbiAgICAgICAgICAgIC8vICdpbnB1dCcgXHVDNzc0XHVCQ0E0XHVEMkI4XHVBQzAwIFx1QkMzMVx1QzJBNFx1RDM5OFx1Qzc3NFx1QzJBNFx1QzVEMCBcdUM3NThcdUQ1NUMgXHVBQzEyIFx1QkNDMFx1QUNCRFx1Qzc0NCBcdUNDOThcdUI5QUNcdUQ1NThcdUJCQzBcdUI4NUMsIFx1QzVFQ1x1QUUzMFx1QzExQ1x1QjI5NCBcdUFFMzBcdUJDRjggXHVCM0Q5XHVDNzkxXHVCOUNDIFx1QkMyOVx1QzlDMFxyXG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyBcdUJFMENcdUI3N0NcdUM2QjBcdUM4MDAgXHVCNEE0XHVCODVDIFx1QUMwMFx1QUUzMCBcdUJDMjlcdUM5QzBcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gXHVCMkU0XHVCOTc4IFx1QkIzOFx1Qzc5MCBcdUM3ODVcdUI4MjVcdUM3NDAgaGFuZGxlVGV4dElucHV0XHVDNUQwXHVDMTFDIFx1Q0M5OFx1QjlBQ1x1QjQyOVx1QjJDOFx1QjJFNC5cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUNsaWNrKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5sb2FkaW5nQ29tcGxldGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5ibHVyKCk7IC8vIFx1QUM4Q1x1Qzc4NCBcdUM2MjRcdUJDODQgXHVENkM0IFx1RDBDMFx1Qzc3NFx1RDJDMCBcdUQ2NTRcdUJBNzRcdUM3M0NcdUI4NUMgXHVBQzA4IFx1QjU0QyBcdUQzRUNcdUNFRTRcdUMyQTQgXHVENTc0XHVDODFDXHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgLy8gXHVBQzhDXHVDNzg0IFx1RDUwQ1x1QjgwOFx1Qzc3NCBcdUM5MTEgXHVDRTk0XHVCQzg0XHVDMkE0XHVCOTdDIFx1RDA3NFx1QjlBRFx1RDU1OFx1QkE3NCBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXRcdUM1RDAgXHVCMkU0XHVDMkRDIFx1RDNFQ1x1Q0VFNFx1QzJBNFx1Qjk3QyBcdUM5MERcdUIyQzhcdUIyRTQuXHJcbiAgICAgICAgICAgIC8vIFx1Qzc3NFx1QjI5NCBcdUMwQUNcdUM2QTlcdUM3OTBcdUFDMDAgXHVDNzg1XHVCODI1IFx1RDU0NFx1QjREQyBcdUJDMTZcdUM3NDQgXHVEMDc0XHVCOUFEXHVENTU4XHVDNUVDIFx1RDNFQ1x1Q0VFNFx1QzJBNFx1Qjk3QyBcdUM3ODNcdUM1QzhcdUM3NDQgXHVCNTRDIFx1Qzc4NVx1QjgyNSBcdUFFMzBcdUIyQTVcdUM3NDQgXHVCQ0Y1XHVDNkQwXHVENTU4XHVCMjk0IFx1QjM3MCBcdUIzQzRcdUM2QzBcdUM3NzQgXHVCNDI5XHVCMkM4XHVCMkU0LlxyXG4gICAgICAgICAgICB0aGlzLmhpZGRlbklucHV0LmZvY3VzKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3VibWl0V29yZCgpIHtcclxuICAgICAgICBjb25zdCB0cmltbWVkSW5wdXQgPSB0aGlzLnVzZXJJbnB1dC50cmltKCk7XHJcblxyXG4gICAgICAgIC8vIFx1Qzc4NVx1QjgyNSBcdUM4MUNcdUNEOUMgXHVDOUMxXHVENkM0LCBcdUMwQUNcdUM2QTlcdUM3OTAgXHVDNzg1XHVCODI1IFx1RDU0NFx1QjREQ1x1Qjk3QyBcdUM5ODlcdUMyREMgXHVDRDA4XHVBRTMwXHVENjU0XHVENTU4XHVDNUVDIFx1QzJEQ1x1QUMwMVx1QzgwMVx1Qzc3OCBcdUM3OTRcdUM1RUNcdUJCM0NcdUM3NDQgXHVDODFDXHVBQzcwXHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gICAgICAgIHRoaXMudXNlcklucHV0ID0gXCJcIjtcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LnZhbHVlID0gXCJcIjtcclxuXHJcbiAgICAgICAgaWYgKHRyaW1tZWRJbnB1dC5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy5zaG93RXJyb3IoXCJcdUIyRThcdUM1QjRcdUI5N0MgXHVDNzg1XHVCODI1XHVENTU4XHVDMTM4XHVDNjk0IVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbGFzdENoYXJPZkN1cnJlbnRXb3JkID0gdGhpcy5jdXJyZW50V29yZC5jaGFyQXQodGhpcy5jdXJyZW50V29yZC5sZW5ndGggLSAxKTtcclxuICAgICAgICBjb25zdCBmaXJzdENoYXJPZklucHV0ID0gdHJpbW1lZElucHV0LmNoYXJBdCgwKTtcclxuXHJcbiAgICAgICAgaWYgKGZpcnN0Q2hhck9mSW5wdXQgIT09IGxhc3RDaGFyT2ZDdXJyZW50V29yZCkge1xyXG4gICAgICAgICAgICB0aGlzLnNob3dFcnJvcihgJyR7bGFzdENoYXJPZkN1cnJlbnRXb3JkfScoXHVDNzNDKVx1Qjg1QyBcdUMyRENcdUM3OTFcdUQ1NzRcdUM1N0MgXHVENTY5XHVCMkM4XHVCMkU0IWApO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXlJbmNvcnJlY3RTb3VuZCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDb252ZXJ0IHdvcmQgbGlzdCB0byBhIFNldCBmb3IgZmFzdGVyIGxvb2t1cCBhbmQgbm9ybWFsaXplIHRvIGxvd2VyY2FzZVxyXG4gICAgICAgIGNvbnN0IHdvcmRMaXN0U2V0ID0gbmV3IFNldCh0aGlzLmNvbmZpZy53b3JkTGlzdC5tYXAod29yZCA9PiB3b3JkLnRvTG93ZXJDYXNlKCkpKTtcclxuXHJcbiAgICAgICAgaWYgKCF3b3JkTGlzdFNldC5oYXModHJpbW1lZElucHV0LnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2hvd0Vycm9yKFwiXHVDMEFDXHVDODA0XHVDNUQwIFx1QzVDNlx1QjI5NCBcdUIyRThcdUM1QjRcdUM3ODVcdUIyQzhcdUIyRTQhXCIpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXlJbmNvcnJlY3RTb3VuZCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy51c2VkV29yZHMuaGFzKHRyaW1tZWRJbnB1dC50b0xvd2VyQ2FzZSgpKSkge1xyXG4gICAgICAgICAgICB0aGlzLnNob3dFcnJvcihcIlx1Qzc3NFx1QkJGOCBcdUMwQUNcdUM2QTlcdUQ1NUMgXHVCMkU4XHVDNUI0XHVDNzg1XHVCMkM4XHVCMkU0IVwiKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5SW5jb3JyZWN0U291bmQoKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5wbGF5Q29ycmVjdFNvdW5kKCk7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50V29yZCA9IHRyaW1tZWRJbnB1dDtcclxuICAgICAgICB0aGlzLnVzZWRXb3Jkcy5hZGQodHJpbW1lZElucHV0LnRvTG93ZXJDYXNlKCkpO1xyXG4gICAgICAgIHRoaXMuc2NvcmUrKztcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IFwiXCI7IC8vIFx1QzEzMVx1QUNGNVx1QzgwMVx1QzczQ1x1Qjg1QyBcdUM4MUNcdUNEOUNcdUQ1ODhcdUM3M0NcdUJCQzBcdUI4NUMgXHVDNjI0XHVCOTU4IFx1QkE1NFx1QzJEQ1x1QzlDMCBcdUM4MUNcdUFDNzBcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dFcnJvcihtZXNzYWdlOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IG1lc3NhZ2U7XHJcbiAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2VUaW1lciA9IHRoaXMuRVJST1JfTUVTU0FHRV9EVVJBVElPTjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBzb3VuZCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldFNvdW5kKG5hbWUpO1xyXG4gICAgICAgIGlmIChzb3VuZCkge1xyXG4gICAgICAgICAgICBjb25zdCBjbG9uZSA9IHNvdW5kLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBTb3VuZCBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlDb3JyZWN0U291bmQoKSB7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ2NvcnJlY3QnKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlJbmNvcnJlY3RTb3VuZCgpIHtcclxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnaW5jb3JyZWN0Jyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBpbml0aWFsaXplIGdhbWU6XCIsIGUpO1xyXG4gICAgICAgIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5ib2R5O1xyXG4gICAgICAgIGlmIChib2R5KSB7XHJcbiAgICAgICAgICAgIGJvZHkuaW5uZXJIVE1MID0gJzxwIHN0eWxlPVwiY29sb3I6cmVkOyB0ZXh0LWFsaWduOmNlbnRlcjtcIj5cdUFDOENcdUM3ODQgXHVDRDA4XHVBRTMwXHVENjU0XHVDNUQwIFx1QzJFNFx1RDMyOFx1RDU4OFx1QzJCNVx1QjJDOFx1QjJFNC4gXHVDRjU4XHVDMTk0XHVDNzQ0IFx1RDY1NVx1Qzc3OFx1RDU3NFx1QzhGQ1x1QzEzOFx1QzY5NC48L3A+JztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQXNDQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFIQyxTQUFBQTtBQUFBLEdBQUE7QUFNTCxNQUFNLGFBQWE7QUFBQSxFQUFuQjtBQUNJLFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQUN4RCxTQUFRLFNBQXdDLG9CQUFJLElBQUk7QUFDeEQsU0FBUSxjQUFzQjtBQUM5QixTQUFRLGNBQXNCO0FBQUE7QUFBQSxFQUU5QixNQUFNLEtBQUssY0FBMkM7QUFDbEQsU0FBSyxjQUFjLGFBQWEsT0FBTyxTQUFTLGFBQWEsT0FBTztBQUNwRSxRQUFJLEtBQUssZ0JBQWdCLEdBQUc7QUFDeEIsYUFBTyxRQUFRLFFBQVE7QUFBQSxJQUMzQjtBQUVBLFVBQU0sZ0JBQWdCLGFBQWEsT0FBTyxJQUFJLFNBQU8sS0FBSyxVQUFVLEdBQUcsQ0FBQztBQUN4RSxVQUFNLGdCQUFnQixhQUFhLE9BQU8sSUFBSSxTQUFPLEtBQUssVUFBVSxHQUFHLENB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
