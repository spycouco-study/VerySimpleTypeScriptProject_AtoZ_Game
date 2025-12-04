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
    this.hiddenInput.value = "";
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICB0aXRsZVNjcmVlblRleHQ6IHN0cmluZztcclxuICAgIHN0YXJ0UHJvbXB0VGV4dDogc3RyaW5nO1xyXG4gICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XHJcbiAgICByZXN0YXJ0UHJvbXB0VGV4dDogc3RyaW5nO1xyXG4gICAgZm9udEZhbWlseTogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZztcclxuICAgIGlucHV0Qm94Q29sb3I6IHN0cmluZztcclxuICAgIGlucHV0VGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBlcnJvclRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgY29ycmVjdFRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgd29yZExpc3Q6IHN0cmluZ1tdO1xyXG4gICAgaW5pdGlhbFdvcmQ6IHN0cmluZztcclxuICAgIGFzc2V0czogQXNzZXRzQ29uZmlnO1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIGxvYWRlZENvdW50OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuXHJcbiAgICBhc3luYyBsb2FkKGFzc2V0c0NvbmZpZzogQXNzZXRzQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubGVuZ3RoICsgYXNzZXRzQ29uZmlnLnNvdW5kcy5sZW5ndGg7XHJcbiAgICAgICAgaWYgKHRoaXMudG90YWxBc3NldHMgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubWFwKGltZyA9PiB0aGlzLmxvYWRJbWFnZShpbWcpKTtcclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gYXNzZXRzQ29uZmlnLnNvdW5kcy5tYXAoc25kID0+IHRoaXMubG9hZFNvdW5kKHNuZCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKGFzc2V0OiBJbWFnZUFzc2V0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoYXNzZXQubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gLCBlKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoYXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9IChlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldC5wYXRofWAsIGUpO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGUpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIFJlcXVlc3QgdG8gbG9hZCB0aGUgYXVkaW9cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNvdW5kKG5hbWU6IHN0cmluZyk6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9hZGluZ1Byb2dyZXNzKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG90YWxBc3NldHMgPiAwID8gdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxBc3NldHMgOiAxO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGNvbmZpZyE6IEdhbWVDb25maWc7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyID0gbmV3IEFzc2V0TWFuYWdlcigpO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRXb3JkOiBzdHJpbmcgPSBcIlwiO1xyXG4gICAgcHJpdmF0ZSB1c2VySW5wdXQ6IHN0cmluZyA9IFwiXCI7XHJcbiAgICBwcml2YXRlIHVzZWRXb3JkczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBlcnJvck1lc3NhZ2U6IHN0cmluZyA9IFwiXCI7XHJcbiAgICBwcml2YXRlIGVycm9yTWVzc2FnZVRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBFUlJPUl9NRVNTQUdFX0RVUkFUSU9OID0gMjAwMDsgLy8gMiBzZWNvbmRzXHJcbiAgICBwcml2YXRlIGJnbUF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkO1xyXG4gICAgcHJpdmF0ZSBsb2FkaW5nQ29tcGxldGU6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIHByaXZhdGUgaGlkZGVuSW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQ7IC8vIFx1Q0Q5NFx1QUMwMDogXHVDMjI4XHVBQ0E4XHVDOUM0IEhUTUwgaW5wdXQgXHVDNjk0XHVDMThDXHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgZWxlbWVudCB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgICAgICAvLyBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXQgXHVDNjk0XHVDMThDIFx1QzBERFx1QzEzMSBcdUJDMEYgXHVDRDA4XHVBRTMwXHVENjU0XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC50eXBlID0gJ3RleHQnO1xyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUub3BhY2l0eSA9ICcwJzsgLy8gXHVDNjQ0XHVDODA0XHVENzg4IFx1RDIyQ1x1QkE4NVx1RDU1OFx1QUM4QyBcdUI5Q0NcdUI0RTZcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7IC8vIFx1QjlDOFx1QzZCMFx1QzJBNCBcdUM3NzRcdUJDQTRcdUQyQjggXHVCQjM0XHVDMkRDXHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5zdHlsZS5sZWZ0ID0gJy05OTk5cHgnOyAvLyBcdUQ2NTRcdUJBNzQgXHVCQzE2XHVDNzNDXHVCODVDIFx1Qzc3NFx1QjNEOVxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUudG9wID0gJy05OTk5cHgnO1xyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUud2lkdGggPSAnMXB4JzsgLy8gXHVDRDVDXHVDMThDIFx1RDA2Q1x1QUUzMFxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUuaGVpZ2h0ID0gJzFweCc7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmhpZGRlbklucHV0KTtcclxuXHJcbiAgICAgICAgdGhpcy5pbml0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZENvbmZpZygpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jb25maWcuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuc2V0dXBFdmVudExpc3RlbmVycygpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMuYXNzZXRNYW5hZ2VyLmxvYWQodGhpcy5jb25maWcuYXNzZXRzKTtcclxuICAgICAgICB0aGlzLmxvYWRpbmdDb21wbGV0ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5iZ21BdWRpbyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldFNvdW5kKCdiZ20nKTtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmxvb3AgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnZvbHVtZSA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpPy52b2x1bWUgfHwgMC41O1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnJlc2V0R2FtZSgpO1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkNvbmZpZ3VyYXRpb24gbG9hZGVkOlwiLCB0aGlzLmNvbmZpZyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cEV2ZW50TGlzdGVuZXJzKCkge1xyXG4gICAgICAgIC8vIFx1QUUzMFx1Qzg3NCBkb2N1bWVudCBrZXlkb3duIFx1QjlBQ1x1QzJBNFx1QjEwOCBcdUM4MUNcdUFDNzBcclxuICAgICAgICAvLyBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5oYW5kbGVLZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDbGljay5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gXHVDMjI4XHVBQ0E4XHVDOUM0IGlucHV0IFx1QzY5NFx1QzE4Q1x1QzVEMCBcdUM3NzRcdUJDQTRcdUQyQjggXHVCOUFDXHVDMkE0XHVCMTA4IFx1Q0Q5NFx1QUMwMFxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB0aGlzLmhhbmRsZVRleHRJbnB1dC5iaW5kKHRoaXMpKTtcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUlucHV0S2V5RG93bi5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gXHVCRTBDXHVCNzdDXHVDNkIwXHVDODAwXHVDNzU4IFx1QUUzMFx1QkNGOCBcdUIzRDlcdUM3OTEgKFx1QzYwODogQmFja3NwYWNlXHVCODVDIFx1QjRBNFx1Qjg1QyBcdUFDMDBcdUFFMzApIFx1QkMyOVx1QzlDMFxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIChlLmtleSA9PT0gJ0JhY2tzcGFjZScgfHwgZS5rZXkgPT09ICdFbnRlcicpKSB7XHJcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLmN1cnJlbnRXb3JkID0gdGhpcy5jb25maWcuaW5pdGlhbFdvcmQ7XHJcbiAgICAgICAgdGhpcy51c2VySW5wdXQgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMudXNlZFdvcmRzID0gbmV3IFNldCgpO1xyXG4gICAgICAgIHRoaXMudXNlZFdvcmRzLmFkZCh0aGlzLmNvbmZpZy5pbml0aWFsV29yZC50b0xvd2VyQ2FzZSgpKTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2VUaW1lciA9IDA7XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC52YWx1ZSA9IFwiXCI7IC8vIFx1QzIyOFx1QUNBOFx1QzlDNCBpbnB1dFx1Qzc1OCBcdUFDMTJcdUIzQzQgXHVDRDA4XHVBRTMwXHVENjU0XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkJHTSBwbGF5YmFjayBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC52YWx1ZSA9IHRoaXMudXNlcklucHV0OyAvLyBcdUQ2MDRcdUM3QUMgXHVDMEFDXHVDNkE5XHVDNzkwIFx1Qzc4NVx1QjgyNVx1Qzc0NCBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXRcdUM1RDAgXHVCQzE4XHVDNjAxXHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5mb2N1cygpOyAvLyBcdUFDOENcdUM3ODQgXHVDMkRDXHVDNzkxIFx1QzJEQyBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXRcdUM1RDAgXHVEM0VDXHVDRUU0XHVDMkE0XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCh0aW1lc3RhbXA6IG51bWJlcikge1xyXG4gICAgICAgIGlmICghdGhpcy5sYXN0VGltZSkgdGhpcy5sYXN0VGltZSA9IHRpbWVzdGFtcDtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSB0aW1lc3RhbXAgLSB0aGlzLmxhc3RUaW1lO1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lc3RhbXA7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAoIXRoaXMubG9hZGluZ0NvbXBsZXRlKSByZXR1cm47XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmVycm9yTWVzc2FnZVRpbWVyID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmVycm9yTWVzc2FnZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZXJyb3JNZXNzYWdlVGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2UgPSBcIlwiO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldEltYWdlKCdiYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgaWYgKGJhY2tncm91bmQpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJhY2tncm91bmQsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmJhY2tncm91bmRDb2xvcjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIXRoaXMubG9hZGluZ0NvbXBsZXRlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMzBweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1BsYXlpbmdTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0xvYWRpbmdTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuYmFja2dyb3VuZENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDQwcHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJcdUI4NUNcdUI1MjkgXHVDOTExLi4uXCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICBjb25zdCBwcm9ncmVzcyA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldExvYWRpbmdQcm9ncmVzcygpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke01hdGgucm91bmQocHJvZ3Jlc3MgKiAxMDApfSVgLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGA1MHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRpdGxlU2NyZWVuVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMjVweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy5zdGFydFByb21wdFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdQbGF5aW5nU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDIwcHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1QzgxMFx1QzIxODogJHt0aGlzLnNjb3JlfWAsIDUwLCA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgNDBweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVENjA0XHVDN0FDIFx1QjJFOFx1QzVCNDogJHt0aGlzLmN1cnJlbnRXb3JkfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDgwKTtcclxuXHJcbiAgICAgICAgY29uc3QgaW5wdXRCb3hXaWR0aCA9IDQwMDtcclxuICAgICAgICBjb25zdCBpbnB1dEJveEhlaWdodCA9IDYwO1xyXG4gICAgICAgIGNvbnN0IGlucHV0Qm94WCA9ICh0aGlzLmNhbnZhcy53aWR0aCAtIGlucHV0Qm94V2lkdGgpIC8gMjtcclxuICAgICAgICBjb25zdCBpbnB1dEJveFkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjA7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmlucHV0Qm94Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoaW5wdXRCb3hYLCBpbnB1dEJveFksIGlucHV0Qm94V2lkdGgsIGlucHV0Qm94SGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9IHRoaXMuY29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVJlY3QoaW5wdXRCb3hYLCBpbnB1dEJveFksIGlucHV0Qm94V2lkdGgsIGlucHV0Qm94SGVpZ2h0KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuaW5wdXRUZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAzMHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnVzZXJJbnB1dCwgaW5wdXRCb3hYICsgMTAsIGlucHV0Qm94WSArIGlucHV0Qm94SGVpZ2h0IC8gMiArIDEwKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZXJyb3JNZXNzYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmVycm9yVGV4dENvbG9yO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI1cHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmVycm9yTWVzc2FnZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCBpbnB1dEJveFkgKyBpbnB1dEJveEhlaWdodCArIDUwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGA1MHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLmdhbWVPdmVyVGV4dCArIHRoaXMuc2NvcmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI1cHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcucmVzdGFydFByb21wdFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXRcdUM3NTggJ2lucHV0JyBcdUM3NzRcdUJDQTRcdUQyQjggXHVENTc4XHVCNEU0XHVCN0VDIChcdUQ1NUNcdUFFMDAgXHVDODcwXHVENTY5IFx1QkMwRiBcdUM3N0NcdUJDMTggXHVCQjM4XHVDNzkwIFx1Qzc4NVx1QjgyNSBcdUNDOThcdUI5QUMpXHJcbiAgICBwcml2YXRlIGhhbmRsZVRleHRJbnB1dChldmVudDogRXZlbnQpIHtcclxuICAgICAgICBpZiAoIXRoaXMubG9hZGluZ0NvbXBsZXRlIHx8IHRoaXMuZ2FtZVN0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykgcmV0dXJuO1xyXG4gICAgICAgIHRoaXMudXNlcklucHV0ID0gdGhpcy5oaWRkZW5JbnB1dC52YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXRcdUM3NTggJ2tleWRvd24nIFx1Qzc3NFx1QkNBNFx1RDJCOCBcdUQ1NzhcdUI0RTRcdUI3RUMgKEVudGVyLCBCYWNrc3BhY2UgXHVCNEYxIFx1RDJCOVx1QzIxOCBcdUQwQTQgXHVDQzk4XHVCOUFDKVxyXG4gICAgcHJpdmF0ZSBoYW5kbGVJbnB1dEtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICBpZiAoIXRoaXMubG9hZGluZ0NvbXBsZXRlIHx8IHRoaXMuZ2FtZVN0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnRW50ZXInKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3VibWl0V29yZCgpO1xyXG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyBFbnRlciBcdUQwQTRcdUM3NTggXHVBRTMwXHVCQ0Y4IFx1QjNEOVx1Qzc5MSBcdUJDMjlcdUM5QzBcclxuICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gJ0JhY2tzcGFjZScpIHtcclxuICAgICAgICAgICAgLy8gJ2lucHV0JyBcdUM3NzRcdUJDQTRcdUQyQjhcdUFDMDAgXHVCQzMxXHVDMkE0XHVEMzk4XHVDNzc0XHVDMkE0XHVDNUQwIFx1Qzc1OFx1RDU1QyBcdUFDMTIgXHVCQ0MwXHVBQ0JEXHVDNzQ0IFx1Q0M5OFx1QjlBQ1x1RDU1OFx1QkJDMFx1Qjg1QywgXHVDNUVDXHVBRTMwXHVDMTFDXHVCMjk0IFx1QUUzMFx1QkNGOCBcdUIzRDlcdUM3OTFcdUI5Q0MgXHVCQzI5XHVDOUMwXHJcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFx1QkUwQ1x1Qjc3Q1x1QzZCMFx1QzgwMCBcdUI0QTRcdUI4NUMgXHVBQzAwXHVBRTMwIFx1QkMyOVx1QzlDMFxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBcdUIyRTRcdUI5NzggXHVCQjM4XHVDNzkwIFx1Qzc4NVx1QjgyNVx1Qzc0MCBoYW5kbGVUZXh0SW5wdXRcdUM1RDBcdUMxMUMgXHVDQzk4XHVCOUFDXHVCNDI5XHVCMkM4XHVCMkU0LlxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2soKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxvYWRpbmdDb21wbGV0ZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmhpZGRlbklucHV0LmJsdXIoKTsgLy8gXHVBQzhDXHVDNzg0IFx1QzYyNFx1QkM4NCBcdUQ2QzQgXHVEMEMwXHVDNzc0XHVEMkMwIFx1RDY1NFx1QkE3NFx1QzczQ1x1Qjg1QyBcdUFDMDggXHVCNTRDIFx1RDNFQ1x1Q0VFNFx1QzJBNCBcdUQ1NzRcdUM4MUNcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdWJtaXRXb3JkKCkge1xyXG4gICAgICAgIGNvbnN0IHRyaW1tZWRJbnB1dCA9IHRoaXMudXNlcklucHV0LnRyaW0oKTtcclxuICAgICAgICBpZiAodHJpbW1lZElucHV0Lmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnNob3dFcnJvcihcIlx1QjJFOFx1QzVCNFx1Qjk3QyBcdUM3ODVcdUI4MjVcdUQ1NThcdUMxMzhcdUM2OTQhXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBsYXN0Q2hhck9mQ3VycmVudFdvcmQgPSB0aGlzLmN1cnJlbnRXb3JkLmNoYXJBdCh0aGlzLmN1cnJlbnRXb3JkLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGNvbnN0IGZpcnN0Q2hhck9mSW5wdXQgPSB0cmltbWVkSW5wdXQuY2hhckF0KDApO1xyXG5cclxuICAgICAgICBpZiAoZmlyc3RDaGFyT2ZJbnB1dCAhPT0gbGFzdENoYXJPZkN1cnJlbnRXb3JkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2hvd0Vycm9yKGAnJHtsYXN0Q2hhck9mQ3VycmVudFdvcmR9JyhcdUM3M0MpXHVCODVDIFx1QzJEQ1x1Qzc5MVx1RDU3NFx1QzU3QyBcdUQ1NjlcdUIyQzhcdUIyRTQhYCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheUluY29ycmVjdFNvdW5kKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ29udmVydCB3b3JkIGxpc3QgdG8gYSBTZXQgZm9yIGZhc3RlciBsb29rdXAgYW5kIG5vcm1hbGl6ZSB0byBsb3dlcmNhc2VcclxuICAgICAgICBjb25zdCB3b3JkTGlzdFNldCA9IG5ldyBTZXQodGhpcy5jb25maWcud29yZExpc3QubWFwKHdvcmQgPT4gd29yZC50b0xvd2VyQ2FzZSgpKSk7XHJcblxyXG4gICAgICAgIGlmICghd29yZExpc3RTZXQuaGFzKHRyaW1tZWRJbnB1dC50b0xvd2VyQ2FzZSgpKSkge1xyXG4gICAgICAgICAgICB0aGlzLnNob3dFcnJvcihcIlx1QzBBQ1x1QzgwNFx1QzVEMCBcdUM1QzZcdUIyOTQgXHVCMkU4XHVDNUI0XHVDNzg1XHVCMkM4XHVCMkU0IVwiKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5SW5jb3JyZWN0U291bmQoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy51c2VkV29yZHMuaGFzKHRyaW1tZWRJbnB1dC50b0xvd2VyQ2FzZSgpKSkge1xyXG4gICAgICAgICAgICB0aGlzLnNob3dFcnJvcihcIlx1Qzc3NFx1QkJGOCBcdUMwQUNcdUM2QTlcdUQ1NUMgXHVCMkU4XHVDNUI0XHVDNzg1XHVCMkM4XHVCMkU0IVwiKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5SW5jb3JyZWN0U291bmQoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnBsYXlDb3JyZWN0U291bmQoKTtcclxuICAgICAgICB0aGlzLmN1cnJlbnRXb3JkID0gdHJpbW1lZElucHV0O1xyXG4gICAgICAgIHRoaXMudXNlZFdvcmRzLmFkZCh0cmltbWVkSW5wdXQudG9Mb3dlckNhc2UoKSk7XHJcbiAgICAgICAgdGhpcy5zY29yZSsrO1xyXG4gICAgICAgIHRoaXMudXNlcklucHV0ID0gXCJcIjtcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LnZhbHVlID0gXCJcIjsgLy8gXHVDODFDXHVDRDlDIFx1RDZDNCBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXQgXHVBQzEyXHVCM0M0IFx1Q0QwOFx1QUUzMFx1RDY1NFxyXG4gICAgICAgIHRoaXMuZXJyb3JNZXNzYWdlID0gXCJcIjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dFcnJvcihtZXNzYWdlOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IG1lc3NhZ2U7XHJcbiAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2VUaW1lciA9IHRoaXMuRVJST1JfTUVTU0FHRV9EVVJBVElPTjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBzb3VuZCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldFNvdW5kKG5hbWUpO1xyXG4gICAgICAgIGlmIChzb3VuZCkge1xyXG4gICAgICAgICAgICBjb25zdCBjbG9uZSA9IHNvdW5kLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBTb3VuZCBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlDb3JyZWN0U291bmQoKSB7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ2NvcnJlY3QnKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlJbmNvcnJlY3RTb3VuZCgpIHtcclxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnaW5jb3JyZWN0Jyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBpbml0aWFsaXplIGdhbWU6XCIsIGUpO1xyXG4gICAgICAgIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5ib2R5O1xyXG4gICAgICAgIGlmIChib2R5KSB7XHJcbiAgICAgICAgICAgIGJvZHkuaW5uZXJIVE1MID0gJzxwIHN0eWxlPVwiY29sb3I6cmVkOyB0ZXh0LWFsaWduOmNlbnRlcjtcIj5cdUFDOENcdUM3ODQgXHVDRDA4XHVBRTMwXHVENjU0XHVDNUQwIFx1QzJFNFx1RDMyOFx1RDU4OFx1QzJCNVx1QjJDOFx1QjJFNC4gXHVDRjU4XHVDMTk0XHVDNzQ0IFx1RDY1NVx1Qzc3OFx1RDU3NFx1QzhGQ1x1QzEzOFx1QzY5NC48L3A+JztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQXNDQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFIQyxTQUFBQTtBQUFBLEdBQUE7QUFNTCxNQUFNLGFBQWE7QUFBQSxFQUFuQjtBQUNJLFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQUN4RCxTQUFRLFNBQXdDLG9CQUFJLElBQUk7QUFDeEQsU0FBUSxjQUFzQjtBQUM5QixTQUFRLGNBQXNCO0FBQUE7QUFBQSxFQUU5QixNQUFNLEtBQUssY0FBMkM7QUFDbEQsU0FBSyxjQUFjLGFBQWEsT0FBTyxTQUFTLGFBQWEsT0FBTztBQUNwRSxRQUFJLEtBQUssZ0JBQWdCLEdBQUc7QUFDeEIsYUFBTyxRQUFRLFFBQVE7QUFBQSxJQUMzQjtBQUVBLFVBQU0sZ0JBQWdCLGFBQWEsT0FBTyxJQUFJLFNBQU8sS0FBSyxVQUFVLEdBQUcsQ0FBQztBQUN4RSxVQUFNLGdCQUFnQixhQUFhLE9BQU8sSUFBSSxTQUFPLEtBQUssVUFB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
