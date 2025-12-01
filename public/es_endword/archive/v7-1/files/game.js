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
    // 2 seconds
    this.correctMessage = "";
    // 추가: 올바른 단어 입력 시 표시할 메시지
    this.correctMessageTimer = 0;
    // 추가: 올바른 메시지 타이머
    this.CORRECT_MESSAGE_DURATION = 1500;
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
    this.correctMessage = "";
    this.correctMessageTimer = 0;
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
    if (this.correctMessageTimer > 0) {
      this.correctMessageTimer -= deltaTime;
      if (this.correctMessageTimer <= 0) {
        this.correctMessage = "";
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
    } else if (this.correctMessage) {
      this.ctx.fillStyle = this.config.correctTextColor;
      this.ctx.font = `25px ${this.config.fontFamily}`;
      this.ctx.textAlign = "center";
      this.ctx.fillText(this.correctMessage, this.canvas.width / 2, inputBoxY + inputBoxHeight + 50);
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
    this.errorMessage = "";
    this.errorMessageTimer = 0;
    this.correctMessage = "";
    this.correctMessageTimer = 0;
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
    this.showCorrectMessage("\uC815\uB2F5!");
  }
  showError(message) {
    this.errorMessage = message;
    this.errorMessageTimer = this.ERROR_MESSAGE_DURATION;
  }
  // 추가: 올바른 단어 메시지를 표시하는 헬퍼 함수
  showCorrectMessage(message) {
    this.correctMessage = message;
    this.correctMessageTimer = this.CORRECT_MESSAGE_DURATION;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICB0aXRsZVNjcmVlblRleHQ6IHN0cmluZztcclxuICAgIHN0YXJ0UHJvbXB0VGV4dDogc3RyaW5nO1xyXG4gICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XHJcbiAgICByZXN0YXJ0UHJvbXB0VGV4dDogc3RyaW5nO1xyXG4gICAgZm9udEZhbWlseTogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZztcclxuICAgIGlucHV0Qm94Q29sb3I6IHN0cmluZztcclxuICAgIGlucHV0VGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBlcnJvclRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgY29ycmVjdFRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgd29yZExpc3Q6IHN0cmluZ1tdO1xyXG4gICAgaW5pdGlhbFdvcmQ6IHN0cmluZztcclxuICAgIGFzc2V0czogQXNzZXRzQ29uZmlnO1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIGxvYWRlZENvdW50OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuXHJcbiAgICBhc3luYyBsb2FkKGFzc2V0c0NvbmZpZzogQXNzZXRzQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubGVuZ3RoICsgYXNzZXRzQ29uZmlnLnNvdW5kcy5sZW5ndGg7XHJcbiAgICAgICAgaWYgKHRoaXMudG90YWxBc3NldHMgPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGFzc2V0c0NvbmZpZy5pbWFnZXMubWFwKGltZyA9PiB0aGlzLmxvYWRJbWFnZShpbWcpKTtcclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gYXNzZXRzQ29uZmlnLnNvdW5kcy5tYXAoc25kID0+IHRoaXMubG9hZFNvdW5kKHNuZCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZEltYWdlKGFzc2V0OiBJbWFnZUFzc2V0KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmltYWdlcy5zZXQoYXNzZXQubmFtZSwgaW1nKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gLCBlKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoYXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQ291bnQrKztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9IChlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldC5wYXRofWAsIGUpO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGUpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIFJlcXVlc3QgdG8gbG9hZCB0aGUgYXVkaW9cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRJbWFnZShuYW1lOiBzdHJpbmcpOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbWFnZXMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNvdW5kKG5hbWU6IHN0cmluZyk6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9hZGluZ1Byb2dyZXNzKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG90YWxBc3NldHMgPiAwID8gdGhpcy5sb2FkZWRDb3VudCAvIHRoaXMudG90YWxBc3NldHMgOiAxO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGNvbmZpZyE6IEdhbWVDb25maWc7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyID0gbmV3IEFzc2V0TWFuYWdlcigpO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRXb3JkOiBzdHJpbmcgPSBcIlwiO1xyXG4gICAgcHJpdmF0ZSB1c2VySW5wdXQ6IHN0cmluZyA9IFwiXCI7XHJcbiAgICBwcml2YXRlIHVzZWRXb3JkczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBlcnJvck1lc3NhZ2U6IHN0cmluZyA9IFwiXCI7XHJcbiAgICBwcml2YXRlIGVycm9yTWVzc2FnZVRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBFUlJPUl9NRVNTQUdFX0RVUkFUSU9OID0gMjAwMDsgLy8gMiBzZWNvbmRzXHJcbiAgICBwcml2YXRlIGNvcnJlY3RNZXNzYWdlOiBzdHJpbmcgPSBcIlwiOyAvLyBcdUNEOTRcdUFDMDA6IFx1QzYyQ1x1QkMxNFx1Qjk3OCBcdUIyRThcdUM1QjQgXHVDNzg1XHVCODI1IFx1QzJEQyBcdUQ0NUNcdUMyRENcdUQ1NjAgXHVCQTU0XHVDMkRDXHVDOUMwXHJcbiAgICBwcml2YXRlIGNvcnJlY3RNZXNzYWdlVGltZXI6IG51bWJlciA9IDA7IC8vIFx1Q0Q5NFx1QUMwMDogXHVDNjJDXHVCQzE0XHVCOTc4IFx1QkE1NFx1QzJEQ1x1QzlDMCBcdUQwQzBcdUM3NzRcdUJBMzhcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgQ09SUkVDVF9NRVNTQUdFX0RVUkFUSU9OID0gMTUwMDsgLy8gXHVDRDk0XHVBQzAwOiBcdUM2MkNcdUJDMTRcdUI5NzggXHVCQTU0XHVDMkRDXHVDOUMwIFx1RDQ1Q1x1QzJEQyBcdUMyRENcdUFDMDQgKDEuNVx1Q0QwOClcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XHJcbiAgICBwcml2YXRlIGxvYWRpbmdDb21wbGV0ZTogYm9vbGVhbiA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBoaWRkZW5JbnB1dDogSFRNTElucHV0RWxlbWVudDsgLy8gXHVDRDk0XHVBQzAwOiBcdUMyMjhcdUFDQThcdUM5QzQgSFRNTCBpbnB1dCBcdUM2OTRcdUMxOENcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbnZhcyBlbGVtZW50IHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcblxyXG4gICAgICAgIC8vIFx1QzIyOFx1QUNBOFx1QzlDNCBpbnB1dCBcdUM2OTRcdUMxOEMgXHVDMEREXHVDMTMxIFx1QkMwRiBcdUNEMDhcdUFFMzBcdUQ2NTRcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LnR5cGUgPSAndGV4dCc7XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5zdHlsZS5vcGFjaXR5ID0gJzAnOyAvLyBcdUM2NDRcdUM4MDRcdUQ3ODggXHVEMjJDXHVCQTg1XHVENTU4XHVBQzhDIFx1QjlDQ1x1QjRFNlxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJzsgLy8gXHVCOUM4XHVDNkIwXHVDMkE0IFx1Qzc3NFx1QkNBNFx1RDJCOCBcdUJCMzRcdUMyRENcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LnN0eWxlLmxlZnQgPSAnLTk5OTlweCc7IC8vIFx1RDY1NFx1QkE3NCBcdUJDMTZcdUM3M0NcdUI4NUMgXHVDNzc0XHVCM0Q5XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5zdHlsZS50b3AgPSAnLTk5OTlweCc7XHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5zdHlsZS53aWR0aCA9ICcxcHgnOyAvLyBcdUNENUNcdUMxOEMgXHVEMDZDXHVBRTMwXHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5zdHlsZS5oZWlnaHQgPSAnMXB4JztcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LnN0eWxlLnpJbmRleCA9ICctMSc7IC8vIFx1RDYzOVx1QzJEQyBcdUJBQThcdUI5N0MgXHVBQzA0XHVDMTJEIFx1QkMyOVx1QzlDMFx1Qjk3QyBcdUM3MDRcdUQ1NzQgei1pbmRleFx1Qjk3QyBcdUIwQUVcdUNEQTRcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMuaGlkZGVuSW5wdXQpO1xyXG5cclxuICAgICAgICB0aGlzLmluaXQoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQ29uZmlnKCk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5zZXR1cEV2ZW50TGlzdGVuZXJzKCk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5hc3NldE1hbmFnZXIubG9hZCh0aGlzLmNvbmZpZy5hc3NldHMpO1xyXG4gICAgICAgIHRoaXMubG9hZGluZ0NvbXBsZXRlID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmJnbUF1ZGlvID0gdGhpcy5hc3NldE1hbmFnZXIuZ2V0U291bmQoJ2JnbScpO1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ubG9vcCA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8udm9sdW1lID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnYmdtJyk/LnZvbHVtZSB8fCAwLjU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQ29uZmlndXJhdGlvbiBsb2FkZWQ6XCIsIHRoaXMuY29uZmlnKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwRXZlbnRMaXN0ZW5lcnMoKSB7XHJcbiAgICAgICAgLy8gXHVBRTMwXHVDODc0IGRvY3VtZW50IGtleWRvd24gXHVCOUFDXHVDMkE0XHVCMTA4IFx1QzgxQ1x1QUM3MFxyXG4gICAgICAgIC8vIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNsaWNrLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICAvLyBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXQgXHVDNjk0XHVDMThDXHVDNUQwIFx1Qzc3NFx1QkNBNFx1RDJCOCBcdUI5QUNcdUMyQTRcdUIxMDggXHVDRDk0XHVBQzAwXHJcbiAgICAgICAgdGhpcy5oaWRkZW5JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHRoaXMuaGFuZGxlVGV4dElucHV0LmJpbmQodGhpcykpO1xyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlSW5wdXRLZXlEb3duLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICAvLyBcdUJFMENcdUI3N0NcdUM2QjBcdUM4MDBcdUM3NTggXHVBRTMwXHVCQ0Y4IFx1QjNEOVx1Qzc5MSAoXHVDNjA4OiBCYWNrc3BhY2VcdUI4NUMgXHVCNEE0XHVCODVDIFx1QUMwMFx1QUUzMCkgXHVCQzI5XHVDOUMwXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgKGUua2V5ID09PSAnQmFja3NwYWNlJyB8fCBlLmtleSA9PT0gJ0VudGVyJykpIHtcclxuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzZXRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuY3VycmVudFdvcmQgPSB0aGlzLmNvbmZpZy5pbml0aWFsV29yZDtcclxuICAgICAgICB0aGlzLnVzZXJJbnB1dCA9IFwiXCI7XHJcbiAgICAgICAgdGhpcy51c2VkV29yZHMgPSBuZXcgU2V0KCk7XHJcbiAgICAgICAgdGhpcy51c2VkV29yZHMuYWRkKHRoaXMuY29uZmlnLmluaXRpYWxXb3JkLnRvTG93ZXJDYXNlKCkpO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuZXJyb3JNZXNzYWdlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZVRpbWVyID0gMDtcclxuICAgICAgICB0aGlzLmNvcnJlY3RNZXNzYWdlID0gXCJcIjsgLy8gXHVDRDk0XHVBQzAwOiBcdUJBNTRcdUMyRENcdUM5QzAgXHVDRDA4XHVBRTMwXHVENjU0XHJcbiAgICAgICAgdGhpcy5jb3JyZWN0TWVzc2FnZVRpbWVyID0gMDsgLy8gXHVDRDk0XHVBQzAwOiBcdUJBNTRcdUMyRENcdUM5QzAgXHVEMEMwXHVDNzc0XHVCQTM4IFx1Q0QwOFx1QUUzMFx1RDY1NFxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQudmFsdWUgPSBcIlwiOyAvLyBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXRcdUM3NTggXHVBQzEyXHVCM0M0IFx1Q0QwOFx1QUUzMFx1RDY1NFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oXCJCR00gcGxheWJhY2sgZmFpbGVkOlwiLCBlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQudmFsdWUgPSB0aGlzLnVzZXJJbnB1dDsgLy8gXHVENjA0XHVDN0FDIFx1QzBBQ1x1QzZBOVx1Qzc5MCBcdUM3ODVcdUI4MjVcdUM3NDQgXHVDMjI4XHVBQ0E4XHVDOUM0IGlucHV0XHVDNUQwIFx1QkMxOFx1QzYwMSAoXHVDRDA4XHVBRTMwXHVDNUQwXHVCMjk0IFx1QkU0NFx1QzVCNFx1Qzc4OFx1Qzc0QylcclxuICAgICAgICB0aGlzLmhpZGRlbklucHV0LmZvY3VzKCk7IC8vIFx1QUM4Q1x1Qzc4NCBcdUMyRENcdUM3OTEgXHVDMkRDIFx1QzIyOFx1QUNBOFx1QzlDNCBpbnB1dFx1QzVEMCBcdUQzRUNcdUNFRTRcdUMyQTRcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wKHRpbWVzdGFtcDogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxhc3RUaW1lKSB0aGlzLmxhc3RUaW1lID0gdGltZXN0YW1wO1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IHRpbWVzdGFtcCAtIHRoaXMubGFzdFRpbWU7XHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHRpbWVzdGFtcDtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLnJlbmRlcigpO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICghdGhpcy5sb2FkaW5nQ29tcGxldGUpIHJldHVybjtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZXJyb3JNZXNzYWdlVGltZXIgPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZXJyb3JNZXNzYWdlVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5lcnJvck1lc3NhZ2VUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IFwiXCI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFx1Q0Q5NFx1QUMwMDogXHVDNjJDXHVCQzE0XHVCOTc4IFx1QkE1NFx1QzJEQ1x1QzlDMCBcdUQwQzBcdUM3NzRcdUJBMzggXHVDNUM1XHVCMzcwXHVDNzc0XHVEMkI4XHJcbiAgICAgICAgaWYgKHRoaXMuY29ycmVjdE1lc3NhZ2VUaW1lciA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5jb3JyZWN0TWVzc2FnZVRpbWVyIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuY29ycmVjdE1lc3NhZ2VUaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvcnJlY3RNZXNzYWdlID0gXCJcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlcigpIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJhY2tncm91bmQgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRJbWFnZSgnYmFja2dyb3VuZCcpO1xyXG4gICAgICAgIGlmIChiYWNrZ3JvdW5kKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiYWNrZ3JvdW5kLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5iYWNrZ3JvdW5kQ29sb3I7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmxvYWRpbmdDb21wbGV0ZSkge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnRleHRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDMwcHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdQbGF5aW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdMb2FkaW5nU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmJhY2tncm91bmRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGA0MHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFwiXHVCODVDXHVCNTI5IFx1QzkxMS4uLlwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcbiAgICAgICAgY29uc3QgcHJvZ3Jlc3MgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRMb2FkaW5nUHJvZ3Jlc3MoKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHtNYXRoLnJvdW5kKHByb2dyZXNzICogMTAwKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgNTBweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50aXRsZVNjcmVlblRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI1cHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcuc3RhcnRQcm9tcHRUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3UGxheWluZ1NjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyMHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBcdUM4MTBcdUMyMTg6ICR7dGhpcy5zY29yZX1gLCA1MCwgNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDQwcHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1RDYwNFx1QzdBQyBcdUIyRThcdUM1QjQ6ICR7dGhpcy5jdXJyZW50V29yZH1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGlucHV0Qm94V2lkdGggPSA0MDA7XHJcbiAgICAgICAgY29uc3QgaW5wdXRCb3hIZWlnaHQgPSA2MDtcclxuICAgICAgICBjb25zdCBpbnB1dEJveFggPSAodGhpcy5jYW52YXMud2lkdGggLSBpbnB1dEJveFdpZHRoKSAvIDI7XHJcbiAgICAgICAgY29uc3QgaW5wdXRCb3hZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5pbnB1dEJveENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGlucHV0Qm94WCwgaW5wdXRCb3hZLCBpbnB1dEJveFdpZHRoLCBpbnB1dEJveEhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMjtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KGlucHV0Qm94WCwgaW5wdXRCb3hZLCBpbnB1dEJveFdpZHRoLCBpbnB1dEJveEhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmlucHV0VGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgMzBweCAke3RoaXMuY29uZmlnLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy51c2VySW5wdXQsIGlucHV0Qm94WCArIDEwLCBpbnB1dEJveFkgKyBpbnB1dEJveEhlaWdodCAvIDIgKyAxMCk7XHJcblxyXG4gICAgICAgIC8vIFx1QzYyNFx1Qjk1OCBcdUJBNTRcdUMyRENcdUM5QzAgXHVCNjEwXHVCMjk0IFx1QzYyQ1x1QkMxNFx1Qjk3OCBcdUIyRThcdUM1QjQgXHVCQTU0XHVDMkRDXHVDOUMwIFx1RDQ1Q1x1QzJEQ1xyXG4gICAgICAgIGlmICh0aGlzLmVycm9yTWVzc2FnZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5lcnJvclRleHRDb2xvcjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyNXB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5lcnJvck1lc3NhZ2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgaW5wdXRCb3hZICsgaW5wdXRCb3hIZWlnaHQgKyA1MCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmNvcnJlY3RNZXNzYWdlKSB7IC8vIFx1QzYyNFx1Qjk1OCBcdUJBNTRcdUMyRENcdUM5QzBcdUFDMDAgXHVDNUM2XHVDNzQ0IFx1QjU0Q1x1QjlDQyBcdUM2MkNcdUJDMTRcdUI5NzggXHVCMkU4XHVDNUI0IFx1QkE1NFx1QzJEQ1x1QzlDMCBcdUQ0NUNcdUMyRENcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcuY29ycmVjdFRleHRDb2xvcjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyNXB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb3JyZWN0TWVzc2FnZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCBpbnB1dEJveFkgKyBpbnB1dEJveEhlaWdodCArIDUwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGA1MHB4ICR7dGhpcy5jb25maWcuZm9udEZhbWlseX1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLmdhbWVPdmVyVGV4dCArIHRoaXMuc2NvcmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gYDI1cHggJHt0aGlzLmNvbmZpZy5mb250RmFtaWx5fWA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcucmVzdGFydFByb21wdFRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXRcdUM3NTggJ2lucHV0JyBcdUM3NzRcdUJDQTRcdUQyQjggXHVENTc4XHVCNEU0XHVCN0VDIChcdUQ1NUNcdUFFMDAgXHVDODcwXHVENTY5IFx1QkMwRiBcdUM3N0NcdUJDMTggXHVCQjM4XHVDNzkwIFx1Qzc4NVx1QjgyNSBcdUNDOThcdUI5QUMpXHJcbiAgICBwcml2YXRlIGhhbmRsZVRleHRJbnB1dChldmVudDogRXZlbnQpIHtcclxuICAgICAgICBpZiAoIXRoaXMubG9hZGluZ0NvbXBsZXRlIHx8IHRoaXMuZ2FtZVN0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykgcmV0dXJuO1xyXG4gICAgICAgIHRoaXMudXNlcklucHV0ID0gdGhpcy5oaWRkZW5JbnB1dC52YWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBcdUMyMjhcdUFDQThcdUM5QzQgaW5wdXRcdUM3NTggJ2tleWRvd24nIFx1Qzc3NFx1QkNBNFx1RDJCOCBcdUQ1NzhcdUI0RTRcdUI3RUMgKEVudGVyLCBCYWNrc3BhY2UgXHVCNEYxIFx1RDJCOVx1QzIxOCBcdUQwQTQgXHVDQzk4XHVCOUFDKVxyXG4gICAgcHJpdmF0ZSBoYW5kbGVJbnB1dEtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICBpZiAoIXRoaXMubG9hZGluZ0NvbXBsZXRlIHx8IHRoaXMuZ2FtZVN0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAoZXZlbnQua2V5ID09PSAnRW50ZXInKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3VibWl0V29yZCgpO1xyXG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyBFbnRlciBcdUQwQTRcdUM3NTggXHVBRTMwXHVCQ0Y4IFx1QjNEOVx1Qzc5MSBcdUJDMjlcdUM5QzBcclxuICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmtleSA9PT0gJ0JhY2tzcGFjZScpIHtcclxuICAgICAgICAgICAgLy8gJ2lucHV0JyBcdUM3NzRcdUJDQTRcdUQyQjhcdUFDMDAgXHVCQzMxXHVDMkE0XHVEMzk4XHVDNzc0XHVDMkE0XHVDNUQwIFx1Qzc1OFx1RDU1QyBcdUFDMTIgXHVCQ0MwXHVBQ0JEXHVDNzQ0IFx1Q0M5OFx1QjlBQ1x1RDU1OFx1QkJDMFx1Qjg1QywgXHVDNUVDXHVBRTMwXHVDMTFDXHVCMjk0IFx1QUUzMFx1QkNGOCBcdUIzRDlcdUM3OTFcdUI5Q0MgXHVCQzI5XHVDOUMwXHJcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFx1QkUwQ1x1Qjc3Q1x1QzZCMFx1QzgwMCBcdUI0QTRcdUI4NUMgXHVBQzAwXHVBRTMwIFx1QkMyOVx1QzlDMFxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBcdUIyRTRcdUI5NzggXHVCQjM4XHVDNzkwIFx1Qzc4NVx1QjgyNVx1Qzc0MCBoYW5kbGVUZXh0SW5wdXRcdUM1RDBcdUMxMUMgXHVDQzk4XHVCOUFDXHVCNDI5XHVCMkM4XHVCMkU0LlxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2soKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmxvYWRpbmdDb21wbGV0ZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmhpZGRlbklucHV0LmJsdXIoKTsgLy8gXHVBQzhDXHVDNzg0IFx1QzYyNFx1QkM4NCBcdUQ2QzQgXHVEMEMwXHVDNzc0XHVEMkMwIFx1RDY1NFx1QkE3NFx1QzczQ1x1Qjg1QyBcdUFDMDggXHVCNTRDIFx1RDNFQ1x1Q0VFNFx1QzJBNCBcdUQ1NzRcdUM4MUNcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICAvLyBcdUFDOENcdUM3ODQgXHVENTBDXHVCODA4XHVDNzc0IFx1QzkxMSBcdUNFOTRcdUJDODRcdUMyQTRcdUI5N0MgXHVEMDc0XHVCOUFEXHVENTU4XHVCQTc0IFx1QzIyOFx1QUNBOFx1QzlDNCBpbnB1dFx1QzVEMCBcdUIyRTRcdUMyREMgXHVEM0VDXHVDRUU0XHVDMkE0XHVCOTdDIFx1QzkwRFx1QjJDOFx1QjJFNC5cclxuICAgICAgICAgICAgLy8gXHVDNzc0XHVCMjk0IFx1QzBBQ1x1QzZBOVx1Qzc5MFx1QUMwMCBcdUM3ODVcdUI4MjUgXHVENTQ0XHVCNERDIFx1QkMxNlx1Qzc0NCBcdUQwNzRcdUI5QURcdUQ1NThcdUM1RUMgXHVEM0VDXHVDRUU0XHVDMkE0XHVCOTdDIFx1Qzc4M1x1QzVDOFx1Qzc0NCBcdUI1NEMgXHVDNzg1XHVCODI1IFx1QUUzMFx1QjJBNVx1Qzc0NCBcdUJDRjVcdUM2RDBcdUQ1NThcdUIyOTQgXHVCMzcwIFx1QjNDNFx1QzZDMFx1Qzc3NCBcdUI0MjlcdUIyQzhcdUIyRTQuXHJcbiAgICAgICAgICAgIHRoaXMuaGlkZGVuSW5wdXQuZm9jdXMoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdWJtaXRXb3JkKCkge1xyXG4gICAgICAgIGNvbnN0IHRyaW1tZWRJbnB1dCA9IHRoaXMudXNlcklucHV0LnRyaW0oKTtcclxuXHJcbiAgICAgICAgLy8gXHVDNzg1XHVCODI1IFx1QzgxQ1x1Q0Q5QyBcdUM5QzFcdUQ2QzQsIFx1QzBBQ1x1QzZBOVx1Qzc5MCBcdUM3ODVcdUI4MjUgXHVENTQ0XHVCNERDXHVCOTdDIFx1Qzk4OVx1QzJEQyBcdUNEMDhcdUFFMzBcdUQ2NTRcdUQ1NThcdUM1RUMgXHVDMkRDXHVBQzAxXHVDODAxXHVDNzc4IFx1Qzc5NFx1QzVFQ1x1QkIzQ1x1Qzc0NCBcdUM4MUNcdUFDNzBcdUQ1NjlcdUIyQzhcdUIyRTQuXHJcbiAgICAgICAgdGhpcy51c2VySW5wdXQgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuaGlkZGVuSW5wdXQudmFsdWUgPSBcIlwiO1xyXG5cclxuICAgICAgICAvLyBcdUMwQzhcdUI4NUNcdUM2QjQgXHVCMkU4XHVDNUI0XHVCOTdDIFx1QzgxQ1x1Q0Q5Q1x1RDU1OFx1QkE3NCBcdUM3NzRcdUM4MDRcdUM3NTggXHVDNjJDXHVCQzE0XHVCOTc4L1x1QzYyNFx1Qjk1OCBcdUJBNTRcdUMyRENcdUM5QzBcdUI5N0MgXHVDRDA4XHVBRTMwXHVENjU0XHVENTY5XHVCMkM4XHVCMkU0LlxyXG4gICAgICAgIHRoaXMuZXJyb3JNZXNzYWdlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZVRpbWVyID0gMDtcclxuICAgICAgICB0aGlzLmNvcnJlY3RNZXNzYWdlID0gXCJcIjtcclxuICAgICAgICB0aGlzLmNvcnJlY3RNZXNzYWdlVGltZXIgPSAwO1xyXG5cclxuICAgICAgICBpZiAodHJpbW1lZElucHV0Lmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnNob3dFcnJvcihcIlx1QjJFOFx1QzVCNFx1Qjk3QyBcdUM3ODVcdUI4MjVcdUQ1NThcdUMxMzhcdUM2OTQhXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBsYXN0Q2hhck9mQ3VycmVudFdvcmQgPSB0aGlzLmN1cnJlbnRXb3JkLmNoYXJBdCh0aGlzLmN1cnJlbnRXb3JkLmxlbmd0aCAtIDEpO1xyXG4gICAgICAgIGNvbnN0IGZpcnN0Q2hhck9mSW5wdXQgPSB0cmltbWVkSW5wdXQuY2hhckF0KDApO1xyXG5cclxuICAgICAgICBpZiAoZmlyc3RDaGFyT2ZJbnB1dCAhPT0gbGFzdENoYXJPZkN1cnJlbnRXb3JkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2hvd0Vycm9yKGAnJHtsYXN0Q2hhck9mQ3VycmVudFdvcmR9JyhcdUM3M0MpXHVCODVDIFx1QzJEQ1x1Qzc5MVx1RDU3NFx1QzU3QyBcdUQ1NjlcdUIyQzhcdUIyRTQhYCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheUluY29ycmVjdFNvdW5kKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENvbnZlcnQgd29yZCBsaXN0IHRvIGEgU2V0IGZvciBmYXN0ZXIgbG9va3VwIGFuZCBub3JtYWxpemUgdG8gbG93ZXJjYXNlXHJcbiAgICAgICAgY29uc3Qgd29yZExpc3RTZXQgPSBuZXcgU2V0KHRoaXMuY29uZmlnLndvcmRMaXN0Lm1hcCh3b3JkID0+IHdvcmQudG9Mb3dlckNhc2UoKSkpO1xyXG5cclxuICAgICAgICBpZiAoIXdvcmRMaXN0U2V0Lmhhcyh0cmltbWVkSW5wdXQudG9Mb3dlckNhc2UoKSkpIHtcclxuICAgICAgICAgICAgdGhpcy5zaG93RXJyb3IoXCJcdUMwQUNcdUM4MDRcdUM1RDAgXHVDNUM2XHVCMjk0IFx1QjJFOFx1QzVCNFx1Qzc4NVx1QjJDOFx1QjJFNCFcIik7XHJcbiAgICAgICAgICAgIHRoaXMucGxheUluY29ycmVjdFNvdW5kKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnVzZWRXb3Jkcy5oYXModHJpbW1lZElucHV0LnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2hvd0Vycm9yKFwiXHVDNzc0XHVCQkY4IFx1QzBBQ1x1QzZBOVx1RDU1QyBcdUIyRThcdUM1QjRcdUM3ODVcdUIyQzhcdUIyRTQhXCIpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXlJbmNvcnJlY3RTb3VuZCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBcdUJBQThcdUI0RTAgXHVDODcwXHVBQzc0IFx1QjlDQ1x1Qzg3MTogXHVDNjJDXHVCQzE0XHVCOTc4IFx1QjJFOFx1QzVCNFxyXG4gICAgICAgIHRoaXMucGxheUNvcnJlY3RTb3VuZCgpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudFdvcmQgPSB0cmltbWVkSW5wdXQ7XHJcbiAgICAgICAgdGhpcy51c2VkV29yZHMuYWRkKHRyaW1tZWRJbnB1dC50b0xvd2VyQ2FzZSgpKTtcclxuICAgICAgICB0aGlzLnNjb3JlKys7XHJcbiAgICAgICAgdGhpcy5zaG93Q29ycmVjdE1lc3NhZ2UoXCJcdUM4MTVcdUIyRjUhXCIpOyAvLyBcdUM2MkNcdUJDMTRcdUI5NzggXHVCMkU4XHVDNUI0IFx1QkE1NFx1QzJEQ1x1QzlDMCBcdUQ0NUNcdUMyRENcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dFcnJvcihtZXNzYWdlOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmVycm9yTWVzc2FnZSA9IG1lc3NhZ2U7XHJcbiAgICAgICAgdGhpcy5lcnJvck1lc3NhZ2VUaW1lciA9IHRoaXMuRVJST1JfTUVTU0FHRV9EVVJBVElPTjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBcdUNEOTRcdUFDMDA6IFx1QzYyQ1x1QkMxNFx1Qjk3OCBcdUIyRThcdUM1QjQgXHVCQTU0XHVDMkRDXHVDOUMwXHVCOTdDIFx1RDQ1Q1x1QzJEQ1x1RDU1OFx1QjI5NCBcdUQ1RUNcdUQzN0MgXHVENTY4XHVDMjE4XHJcbiAgICBwcml2YXRlIHNob3dDb3JyZWN0TWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNvcnJlY3RNZXNzYWdlID0gbWVzc2FnZTtcclxuICAgICAgICB0aGlzLmNvcnJlY3RNZXNzYWdlVGltZXIgPSB0aGlzLkNPUlJFQ1RfTUVTU0FHRV9EVVJBVElPTjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBzb3VuZCA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldFNvdW5kKG5hbWUpO1xyXG4gICAgICAgIGlmIChzb3VuZCkge1xyXG4gICAgICAgICAgICBjb25zdCBjbG9uZSA9IHNvdW5kLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBTb3VuZCBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlDb3JyZWN0U291bmQoKSB7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ2NvcnJlY3QnKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlJbmNvcnJlY3RTb3VuZCgpIHtcclxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnaW5jb3JyZWN0Jyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBpbml0aWFsaXplIGdhbWU6XCIsIGUpO1xyXG4gICAgICAgIGNvbnN0IGJvZHkgPSBkb2N1bWVudC5ib2R5O1xyXG4gICAgICAgIGlmIChib2R5KSB7XHJcbiAgICAgICAgICAgIGJvZHkuaW5uZXJIVE1MID0gJzxwIHN0eWxlPVwiY29sb3I6cmVkOyB0ZXh0LWFsaWduOmNlbnRlcjtcIj5cdUFDOENcdUM3ODQgXHVDRDA4XHVBRTMwXHVENjU0XHVDNUQwIFx1QzJFNFx1RDMyOFx1RDU4OFx1QzJCNVx1QjJDOFx1QjJFNC4gXHVDRjU4XHVDMTk0XHVDNzQ0IFx1RDY1NVx1Qzc3OFx1RDU3NFx1QzhGQ1x1QzEzOFx1QzY5NC48L3A+JztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0p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
