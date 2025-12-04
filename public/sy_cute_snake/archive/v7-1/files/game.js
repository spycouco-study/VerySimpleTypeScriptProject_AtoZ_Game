var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2[Direction2["UP"] = 0] = "UP";
  Direction2[Direction2["DOWN"] = 1] = "DOWN";
  Direction2[Direction2["LEFT"] = 2] = "LEFT";
  Direction2[Direction2["RIGHT"] = 3] = "RIGHT";
  Direction2[Direction2["NONE"] = 4] = "NONE";
  return Direction2;
})(Direction || {});
class Game {
  constructor(canvasId) {
    this.data = null;
    this.settings = null;
    this.text = null;
    this.assets = { images: {}, sounds: {} };
    this.gameState = 0 /* TITLE */;
    this.snake = [];
    this.food = [];
    this.currentDirection = 4 /* NONE */;
    this.pendingDirection = 4 /* NONE */;
    this.score = 0;
    this.lastUpdateTime = 0;
    this.gameLoopIntervalId = null;
    this.gameAnimationFrameId = null;
    this.assetLoadPromises = [];
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    if (!this.canvas || !this.ctx) {
      console.error("Canvas element not found or context not supported.");
      return;
    }
    this.init();
  }
  async init() {
    await this.loadGameData();
    if (this.data) {
      this.settings = this.data.gameSettings;
      this.text = this.data.text;
      this.canvas.width = this.settings.canvasWidth;
      this.canvas.height = this.settings.canvasHeight;
      await this.loadAssets();
    } else {
      console.error("Failed to load game data.");
      return;
    }
    this.addEventListeners();
    this.startRenderingLoop();
  }
  async loadGameData() {
    try {
      const response = await fetch("data.json");
      this.data = await response.json();
      console.log("Game data loaded:", this.data);
    } catch (error) {
      console.error("Error loading game data:", error);
      this.data = null;
    }
  }
  async loadAssets() {
    if (!this.data) return;
    this.data.assets.images.forEach((imgData) => {
      const img = new Image();
      img.src = imgData.path;
      const promise = new Promise((resolve, reject) => {
        img.onload = () => {
          this.assets.images[imgData.name] = img;
          resolve();
        };
        img.onerror = () => {
          console.error(`Failed to load image: ${imgData.path}`);
          reject();
        };
      });
      this.assetLoadPromises.push(promise);
    });
    this.data.assets.sounds.forEach((soundData) => {
      const audio = new Audio(soundData.path);
      audio.volume = soundData.volume;
      const promise = new Promise((resolve, reject) => {
        audio.oncanplaythrough = () => {
          this.assets.sounds[soundData.name] = audio;
          resolve();
        };
        audio.onerror = () => {
          console.error(`Failed to load sound: ${soundData.path}`);
          reject();
        };
      });
      this.assetLoadPromises.push(promise);
    });
    try {
      await Promise.all(this.assetLoadPromises);
      console.log("All assets loaded.");
    } catch (error) {
      console.error("Error loading some assets:", error);
    }
  }
  addEventListeners() {
    document.addEventListener("keydown", this.handleInput.bind(this));
    this.canvas.addEventListener("click", () => {
      if (this.gameState === 0 /* TITLE */ && this.assets.sounds["bgm"]) {
        this.loopSound("bgm");
        this.assets.sounds["bgm"].pause();
      }
    }, { once: true });
  }
  handleInput(event) {
    switch (this.gameState) {
      case 0 /* TITLE */:
        if (event.code === "Space") {
          this.gameState = 1 /* INSTRUCTIONS */;
          this.draw();
        }
        break;
      case 1 /* INSTRUCTIONS */:
        if (event.code === "Space") {
          this.startGame();
          this.gameState = 2 /* PLAYING */;
        }
        break;
      case 2 /* PLAYING */:
        this.handlePlayingInput(event.code);
        break;
      case 3 /* GAME_OVER */:
        if (event.code === "Space") {
          this.stopSound("game_over");
          this.startGame();
          this.gameState = 2 /* PLAYING */;
        }
        break;
    }
  }
  handlePlayingInput(keyCode) {
    const currentHead = this.snake[0];
    const nextSegment = this.snake[1] || { x: currentHead.x, y: currentHead.y };
    let newDirection = this.currentDirection;
    switch (keyCode) {
      case "ArrowUp":
        if (this.currentDirection !== 1 /* DOWN */ && !(currentHead.x === nextSegment.x && currentHead.y - 1 === nextSegment.y)) {
          newDirection = 0 /* UP */;
        }
        break;
      case "ArrowDown":
        if (this.currentDirection !== 0 /* UP */ && !(currentHead.x === nextSegment.x && currentHead.y + 1 === nextSegment.y)) {
          newDirection = 1 /* DOWN */;
        }
        break;
      case "ArrowLeft":
        if (this.currentDirection !== 3 /* RIGHT */ && !(currentHead.x - 1 === nextSegment.x && currentHead.y === nextSegment.y)) {
          newDirection = 2 /* LEFT */;
        }
        break;
      case "ArrowRight":
        if (this.currentDirection !== 2 /* LEFT */ && !(currentHead.x + 1 === nextSegment.x && currentHead.y === nextSegment.y)) {
          newDirection = 3 /* RIGHT */;
        }
        break;
    }
    if (newDirection !== this.currentDirection) {
      this.pendingDirection = newDirection;
    }
  }
  startGame() {
    if (!this.settings || !this.text) return;
    console.log("Starting new game...");
    this.stopSound("bgm");
    this.loopSound("bgm");
    this.score = 0;
    this.snake = [];
    this.food = [];
    this.currentDirection = 3 /* RIGHT */;
    this.pendingDirection = 3 /* RIGHT */;
    const startX = Math.floor(this.settings.canvasWidth / this.settings.gridSize / 4);
    const startY = Math.floor(this.settings.canvasHeight / this.settings.gridSize / 2);
    for (let i = 0; i < this.settings.initialSnakeLength; i++) {
      this.snake.push({ x: startX - i, y: startY });
    }
    this.generateFood(this.settings.foodCount);
    if (this.gameLoopIntervalId !== null) {
      clearInterval(this.gameLoopIntervalId);
    }
    this.gameLoopIntervalId = setInterval(this.update.bind(this), this.settings.snakeSpeedMs);
    this.lastUpdateTime = performance.now();
  }
  startRenderingLoop() {
    const render = () => {
      this.draw();
      this.gameAnimationFrameId = requestAnimationFrame(render);
    };
    this.gameAnimationFrameId = requestAnimationFrame(render);
  }
  update() {
    if (this.gameState === 2 /* PLAYING */) {
      this.updatePlaying();
    }
  }
  updatePlaying() {
    if (!this.settings) return;
    if (this.pendingDirection !== 4 /* NONE */) {
      this.currentDirection = this.pendingDirection;
      this.pendingDirection = 4 /* NONE */;
    }
    const head = { ...this.snake[0] };
    switch (this.currentDirection) {
      case 0 /* UP */:
        head.y--;
        break;
      case 1 /* DOWN */:
        head.y++;
        break;
      case 2 /* LEFT */:
        head.x--;
        break;
      case 3 /* RIGHT */:
        head.x++;
        break;
    }
    if (this.checkCollision(head)) {
      this.endGame();
      return;
    }
    this.snake.unshift(head);
    const foodEatenIndex = this.food.findIndex((f) => f.x === head.x && f.y === head.y);
    if (foodEatenIndex !== -1) {
      this.score += this.settings.scorePerFood;
      this.food.splice(foodEatenIndex, 1);
      this.generateFood(1);
      this.playSound("eat");
    } else {
      this.snake.pop();
    }
  }
  checkCollision(head) {
    if (!this.settings) return true;
    const gridWidth = this.settings.canvasWidth / this.settings.gridSize;
    const gridHeight = this.settings.canvasHeight / this.settings.gridSize;
    if (head.x < 0 || head.x >= gridWidth || head.y < 0 || head.y >= gridHeight) {
      return true;
    }
    for (let i = 1; i < this.snake.length; i++) {
      if (head.x === this.snake[i].x && head.y === this.snake[i].y) {
        return true;
      }
    }
    return false;
  }
  endGame() {
    console.log("Game Over!");
    this.gameState = 3 /* GAME_OVER */;
    if (this.gameLoopIntervalId !== null) {
      clearInterval(this.gameLoopIntervalId);
      this.gameLoopIntervalId = null;
    }
    this.stopSound("bgm");
    this.playSound("game_over");
  }
  generateFood(count) {
    if (!this.settings) return;
    const gridWidth = this.settings.canvasWidth / this.settings.gridSize;
    const gridHeight = this.settings.canvasHeight / this.settings.gridSize;
    for (let i = 0; i < count; i++) {
      let newFood;
      let collision;
      do {
        newFood = {
          x: Math.floor(Math.random() * gridWidth),
          y: Math.floor(Math.random() * gridHeight)
        };
        collision = false;
        for (const segment of this.snake) {
          if (segment.x === newFood.x && segment.y === newFood.y) {
            collision = true;
            break;
          }
        }
        if (!collision) {
          for (const existingFood of this.food) {
            if (existingFood.x === newFood.x && existingFood.y === newFood.y) {
              collision = true;
              break;
            }
          }
        }
      } while (collision);
      this.food.push(newFood);
    }
  }
  draw() {
    if (!this.ctx || !this.settings || !this.text) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBackground();
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 1 /* INSTRUCTIONS */:
        this.drawInstructionsScreen();
        break;
      case 2 /* PLAYING */:
        this.drawPlaying();
        break;
      case 3 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawBackground() {
    if (!this.ctx || !this.settings) return;
    this.ctx.fillStyle = this.settings.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const backgroundTile = this.assets.images["background_tile"];
    if (backgroundTile) {
      const gridSize = this.settings.gridSize;
      for (let x = 0; x < this.canvas.width; x += gridSize) {
        for (let y = 0; y < this.canvas.height; y += gridSize) {
          this.ctx.drawImage(backgroundTile, x, y, gridSize, gridSize);
        }
      }
    }
  }
  drawTitleScreen() {
    if (!this.ctx || !this.text) return;
    this.ctx.font = "48px sans-serif";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.text.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.text.pressSpace, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  drawInstructionsScreen() {
    if (!this.ctx || !this.text) return;
    this.ctx.font = "36px sans-serif";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.text.instructionsTitle, this.canvas.width / 2, this.canvas.height / 2 - 120);
    this.ctx.font = "20px sans-serif";
    this.ctx.fillText(this.text.instructions1, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.fillText(this.text.instructions2, this.canvas.width / 2, this.canvas.height / 2 - 20);
    this.ctx.fillText(this.text.instructions3, this.canvas.width / 2, this.canvas.height / 2 + 10);
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.text.instructionsContinue, this.canvas.width / 2, this.canvas.height / 2 + 80);
  }
  drawPlaying() {
    if (!this.ctx || !this.settings) return;
    const gridSize = this.settings.gridSize;
    const snakeHeadImage = this.assets.images["snake_head"];
    const snakeBodyImage = this.assets.images["snake_body"];
    const foodBerryImage = this.assets.images["food_berry"];
    this.food.forEach((f) => {
      if (foodBerryImage) {
        this.ctx.drawImage(foodBerryImage, f.x * gridSize, f.y * gridSize, gridSize, gridSize);
      } else {
        this.ctx.fillStyle = "red";
        this.ctx.fillRect(f.x * gridSize, f.y * gridSize, gridSize, gridSize);
      }
    });
    this.snake.forEach((segment, index) => {
      const x = segment.x * gridSize;
      const y = segment.y * gridSize;
      if (index === 0 && snakeHeadImage) {
        this.ctx.save();
        this.ctx.translate(x + gridSize / 2, y + gridSize / 2);
        let rotationAngle = 0;
        switch (this.currentDirection) {
          case 0 /* UP */:
            rotationAngle = 0;
            break;
          case 1 /* DOWN */:
            rotationAngle = Math.PI;
            break;
          // 180 degrees clockwise
          case 2 /* LEFT */:
            rotationAngle = -Math.PI / 2;
            break;
          // 90 degrees counter-clockwise
          case 3 /* RIGHT */:
            rotationAngle = Math.PI / 2;
            break;
        }
        this.ctx.rotate(rotationAngle);
        this.ctx.drawImage(snakeHeadImage, -gridSize / 2, -gridSize / 2, gridSize, gridSize);
        this.ctx.restore();
      } else if (snakeBodyImage) {
        this.ctx.drawImage(snakeBodyImage, x, y, gridSize, gridSize);
      } else {
        this.ctx.fillStyle = index === 0 ? "darkgreen" : "green";
        this.ctx.fillRect(x, y, gridSize, gridSize);
      }
    });
    this.ctx.font = "24px sans-serif";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";
    this.ctx.fillText(`Score: ${this.score}`, 10, 10);
  }
  drawGameOverScreen() {
    if (!this.ctx || !this.text) return;
    this.ctx.font = "48px sans-serif";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.text.gameOver, this.canvas.width / 2, this.canvas.height / 2 - 80);
    this.ctx.font = "36px sans-serif";
    this.ctx.fillText(`${this.text.yourScore}${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.text.pressSpaceRestart, this.canvas.width / 2, this.canvas.height / 2 + 80);
  }
  playSound(name) {
    const audio = this.assets.sounds[name];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch((e) => console.warn(`Audio playback failed for ${name}:`, e));
    }
  }
  stopSound(name) {
    const audio = this.assets.sounds[name];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }
  loopSound(name) {
    const audio = this.assets.sounds[name];
    if (audio) {
      audio.loop = true;
      audio.play().catch((e) => console.warn(`Audio loop playback failed for ${name}:`, e));
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const gameCanvas = document.getElementById("gameCanvas");
  if (gameCanvas instanceof HTMLCanvasElement) {
    new Game("gameCanvas");
  } else {
    console.error("Canvas element with ID 'gameCanvas' not found.");
    const newCanvas = document.createElement("canvas");
    newCanvas.id = "gameCanvas";
    document.body.appendChild(newCanvas);
    console.log("Created missing canvas element.");
    new Game("gameCanvas");
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBncmlkU2l6ZTogbnVtYmVyO1xyXG4gICAgaW5pdGlhbFNuYWtlTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBzbmFrZVNwZWVkTXM6IG51bWJlcjtcclxuICAgIGZvb2RDb3VudDogbnVtYmVyO1xyXG4gICAgYmFja2dyb3VuZENvbG9yOiBzdHJpbmc7XHJcbiAgICBzY29yZVBlckZvb2Q6IG51bWJlcjtcclxuICAgIHdhbGxDb2xvcjogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVRleHQge1xyXG4gICAgdGl0bGU6IHN0cmluZztcclxuICAgIHByZXNzU3BhY2U6IHN0cmluZztcclxuICAgIGluc3RydWN0aW9uc1RpdGxlOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnMxOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnMyOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnMzOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNDb250aW51ZTogc3RyaW5nO1xyXG4gICAgZ2FtZU92ZXI6IHN0cmluZztcclxuICAgIHlvdXJTY29yZTogc3RyaW5nO1xyXG4gICAgcHJlc3NTcGFjZVJlc3RhcnQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVBc3NldEltYWdlRGF0YSB7IC8vIFJlbmFtZWQgZnJvbSBJbWFnZURhdGEgdG8gYXZvaWQgY29uZmxpY3Qgd2l0aCBET00ncyBJbWFnZURhdGFcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFNvdW5kRGF0YSB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgdGV4dDogR2FtZVRleHQ7XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEdhbWVBc3NldEltYWdlRGF0YVtdOyAvLyBVcGRhdGVkIHR5cGUgaGVyZVxyXG4gICAgICAgIHNvdW5kczogU291bmREYXRhW107XHJcbiAgICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTG9hZGVkQXNzZXRzIHtcclxuICAgIGltYWdlczogeyBba2V5OiBzdHJpbmddOiBIVE1MSW1hZ2VFbGVtZW50IH07XHJcbiAgICBzb3VuZHM6IHsgW2tleTogc3RyaW5nXTogSFRNTEF1ZGlvRWxlbWVudCB9O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIElOU1RSVUNUSU9OUyxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmVudW0gRGlyZWN0aW9uIHtcclxuICAgIFVQLFxyXG4gICAgRE9XTixcclxuICAgIExFRlQsXHJcbiAgICBSSUdIVCxcclxuICAgIE5PTkUsIC8vIEZvciBpbml0aWFsIHN0YXRlIG9yIG5vIG1vdmVtZW50XHJcbn1cclxuXHJcbmludGVyZmFjZSBTbmFrZVNlZ21lbnQge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRm9vZCB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbn1cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZGF0YTogR2FtZURhdGEgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgc2V0dGluZ3M6IEdhbWVTZXR0aW5ncyB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSB0ZXh0OiBHYW1lVGV4dCB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBhc3NldHM6IExvYWRlZEFzc2V0cyA9IHsgaW1hZ2VzOiB7fSwgc291bmRzOiB7fSB9O1xyXG5cclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICBwcml2YXRlIHNuYWtlOiBTbmFrZVNlZ21lbnRbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBmb29kOiBGb29kW10gPSBbXTtcclxuICAgIHByaXZhdGUgY3VycmVudERpcmVjdGlvbjogRGlyZWN0aW9uID0gRGlyZWN0aW9uLk5PTkU7XHJcbiAgICBwcml2YXRlIHBlbmRpbmdEaXJlY3Rpb246IERpcmVjdGlvbiA9IERpcmVjdGlvbi5OT05FO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbGFzdFVwZGF0ZVRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGdhbWVMb29wSW50ZXJ2YWxJZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGdhbWVBbmltYXRpb25GcmFtZUlkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYXNzZXRMb2FkUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzIHx8ICF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGVsZW1lbnQgbm90IGZvdW5kIG9yIGNvbnRleHQgbm90IHN1cHBvcnRlZC5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuaW5pdCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRHYW1lRGF0YSgpO1xyXG4gICAgICAgIGlmICh0aGlzLmRhdGEpIHtcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgICAgIHRoaXMudGV4dCA9IHRoaXMuZGF0YS50ZXh0O1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVycygpO1xyXG4gICAgICAgIHRoaXMuc3RhcnRSZW5kZXJpbmdMb29wKCk7IC8vIFN0YXJ0IHRoZSBhbmltYXRpb24gbG9vcCBpbW1lZGlhdGVseSBmb3IgdGl0bGUgc2NyZWVuXHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJHYW1lIGRhdGEgbG9hZGVkOlwiLCB0aGlzLmRhdGEpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIGdhbWUgZGF0YTpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kYXRhLmFzc2V0cy5pbWFnZXMuZm9yRWFjaChpbWdEYXRhID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBpbWdEYXRhLnBhdGg7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLmltYWdlc1tpbWdEYXRhLm5hbWVdID0gaW1nO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdEYXRhLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdGhpcy5hc3NldExvYWRQcm9taXNlcy5wdXNoKHByb21pc2UpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcy5mb3JFYWNoKHNvdW5kRGF0YSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kRGF0YS5wYXRoKTtcclxuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmREYXRhLnZvbHVtZTtcclxuICAgICAgICAgICAgLy8gUHJlbG9hZCB0byBlbnN1cmUgcGxheWJhY2sgcmVsaWFiaWxpdHlcclxuICAgICAgICAgICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHMuc291bmRzW3NvdW5kRGF0YS5uYW1lXSA9IGF1ZGlvO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kRGF0YS5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdCgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRMb2FkUHJvbWlzZXMucHVzaChwcm9taXNlKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5hc3NldExvYWRQcm9taXNlcyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIHNvbWUgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYWRkRXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlSW5wdXQuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgLy8gQWRkIGEgY2xpY2sgbGlzdGVuZXIgdG8gdGhlIGNhbnZhcyB0byBlbmFibGUgYXVkaW8gY29udGV4dCBpbiBzb21lIGJyb3dzZXJzXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFICYmIHRoaXMuYXNzZXRzLnNvdW5kc1snYmdtJ10pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9vcFNvdW5kKCdiZ20nKTsgLy8gVHJ5IHRvIHBsYXkgQkdNIG9uIGZpcnN0IGludGVyYWN0aW9uXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5zb3VuZHNbJ2JnbSddLnBhdXNlKCk7IC8vIFBhdXNlIGl0IGZvciBub3csIHdpbGwgcGxheSBsYXRlclxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSwgeyBvbmNlOiB0cnVlIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlSW5wdXQoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdTcGFjZScpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3KCk7IC8vIFJlZHJhdyBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgICAgIGlmIChldmVudC5jb2RlID09PSAnU3BhY2UnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZVBsYXlpbmdJbnB1dChldmVudC5jb2RlKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ1NwYWNlJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RvcFNvdW5kKCdnYW1lX292ZXInKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5aW5nSW5wdXQoa2V5Q29kZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEhlYWQgPSB0aGlzLnNuYWtlWzBdO1xyXG4gICAgICAgIGNvbnN0IG5leHRTZWdtZW50ID0gdGhpcy5zbmFrZVsxXSB8fCB7IHg6IGN1cnJlbnRIZWFkLngsIHk6IGN1cnJlbnRIZWFkLnkgfTsgLy8gSWYgc25ha2UgaGFzIG9ubHkgaGVhZFxyXG5cclxuICAgICAgICBsZXQgbmV3RGlyZWN0aW9uOiBEaXJlY3Rpb24gPSB0aGlzLmN1cnJlbnREaXJlY3Rpb247XHJcblxyXG4gICAgICAgIHN3aXRjaCAoa2V5Q29kZSkge1xyXG4gICAgICAgICAgICBjYXNlICdBcnJvd1VwJzpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnREaXJlY3Rpb24gIT09IERpcmVjdGlvbi5ET1dOICYmICEoY3VycmVudEhlYWQueCA9PT0gbmV4dFNlZ21lbnQueCAmJiBjdXJyZW50SGVhZC55IC0gMSA9PT0gbmV4dFNlZ21lbnQueSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBuZXdEaXJlY3Rpb24gPSBEaXJlY3Rpb24uVVA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnQXJyb3dEb3duJzpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnREaXJlY3Rpb24gIT09IERpcmVjdGlvbi5VUCAmJiAhKGN1cnJlbnRIZWFkLnggPT09IG5leHRTZWdtZW50LnggJiYgY3VycmVudEhlYWQueSArIDEgPT09IG5leHRTZWdtZW50LnkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RGlyZWN0aW9uID0gRGlyZWN0aW9uLkRPV047XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnQXJyb3dMZWZ0JzpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnREaXJlY3Rpb24gIT09IERpcmVjdGlvbi5SSUdIVCAmJiAhKGN1cnJlbnRIZWFkLnggLSAxID09PSBuZXh0U2VnbWVudC54ICYmIGN1cnJlbnRIZWFkLnkgPT09IG5leHRTZWdtZW50LnkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RGlyZWN0aW9uID0gRGlyZWN0aW9uLkxFRlQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnQXJyb3dSaWdodCc6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50RGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uTEVGVCAmJiAhKGN1cnJlbnRIZWFkLnggKyAxID09PSBuZXh0U2VnbWVudC54ICYmIGN1cnJlbnRIZWFkLnkgPT09IG5leHRTZWdtZW50LnkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RGlyZWN0aW9uID0gRGlyZWN0aW9uLlJJR0hUO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBPbmx5IHVwZGF0ZSBwZW5kaW5nIGRpcmVjdGlvbiBpZiBpdCdzIGEgdmFsaWQgY2hhbmdlXHJcbiAgICAgICAgaWYgKG5ld0RpcmVjdGlvbiAhPT0gdGhpcy5jdXJyZW50RGlyZWN0aW9uKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ0RpcmVjdGlvbiA9IG5ld0RpcmVjdGlvbjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5zZXR0aW5ncyB8fCAhdGhpcy50ZXh0KSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiU3RhcnRpbmcgbmV3IGdhbWUuLi5cIik7XHJcbiAgICAgICAgdGhpcy5zdG9wU291bmQoJ2JnbScpOyAvLyBFbnN1cmUgYW55IHByZXZpb3VzIEJHTSBpcyBzdG9wcGVkXHJcbiAgICAgICAgdGhpcy5sb29wU291bmQoJ2JnbScpO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuc25ha2UgPSBbXTtcclxuICAgICAgICB0aGlzLmZvb2QgPSBbXTtcclxuICAgICAgICB0aGlzLmN1cnJlbnREaXJlY3Rpb24gPSBEaXJlY3Rpb24uUklHSFQ7IC8vIFN0YXJ0IG1vdmluZyByaWdodFxyXG4gICAgICAgIHRoaXMucGVuZGluZ0RpcmVjdGlvbiA9IERpcmVjdGlvbi5SSUdIVDtcclxuXHJcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBzbmFrZSBpbiB0aGUgbWlkZGxlLWxlZnRcclxuICAgICAgICBjb25zdCBzdGFydFggPSBNYXRoLmZsb29yKHRoaXMuc2V0dGluZ3MuY2FudmFzV2lkdGggLyB0aGlzLnNldHRpbmdzLmdyaWRTaXplIC8gNCk7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRZID0gTWF0aC5mbG9vcih0aGlzLnNldHRpbmdzLmNhbnZhc0hlaWdodCAvIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemUgLyAyKTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc2V0dGluZ3MuaW5pdGlhbFNuYWtlTGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdGhpcy5zbmFrZS5wdXNoKHsgeDogc3RhcnRYIC0gaSwgeTogc3RhcnRZIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5nZW5lcmF0ZUZvb2QodGhpcy5zZXR0aW5ncy5mb29kQ291bnQpO1xyXG5cclxuICAgICAgICAvLyBDbGVhciBwcmV2aW91cyBpbnRlcnZhbCBpZiBhbnkgYW5kIHN0YXJ0IG5ldyBnYW1lIGxvb3BcclxuICAgICAgICBpZiAodGhpcy5nYW1lTG9vcEludGVydmFsSWQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmdhbWVMb29wSW50ZXJ2YWxJZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZ2FtZUxvb3BJbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwodGhpcy51cGRhdGUuYmluZCh0aGlzKSwgdGhpcy5zZXR0aW5ncy5zbmFrZVNwZWVkTXMpIGFzIHVua25vd24gYXMgbnVtYmVyO1xyXG5cclxuICAgICAgICB0aGlzLmxhc3RVcGRhdGVUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydFJlbmRlcmluZ0xvb3AoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgcmVuZGVyID0gKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXcoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lQW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy5nYW1lQW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5aW5nKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWluZygpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGN1cnJlbnQgZGlyZWN0aW9uIGZyb20gcGVuZGluZyBkaXJlY3Rpb25cclxuICAgICAgICBpZiAodGhpcy5wZW5kaW5nRGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uTk9ORSkge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnREaXJlY3Rpb24gPSB0aGlzLnBlbmRpbmdEaXJlY3Rpb247XHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ0RpcmVjdGlvbiA9IERpcmVjdGlvbi5OT05FOyAvLyBSZXNldCBwZW5kaW5nIGFmdGVyIGFwcGx5aW5nXHJcbiAgICAgICAgfVxyXG5cclxuXHJcbiAgICAgICAgY29uc3QgaGVhZCA9IHsgLi4udGhpcy5zbmFrZVswXSB9OyAvLyBDb3B5IGN1cnJlbnQgaGVhZFxyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgbmV3IGhlYWQgcG9zaXRpb25cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuY3VycmVudERpcmVjdGlvbikge1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5VUDogaGVhZC55LS07IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5ET1dOOiBoZWFkLnkrKzsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLkxFRlQ6IGhlYWQueC0tOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uUklHSFQ6IGhlYWQueCsrOyBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciBjb2xsaXNpb25zXHJcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tDb2xsaXNpb24oaGVhZCkpIHtcclxuICAgICAgICAgICAgdGhpcy5lbmRHYW1lKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFkZCBuZXcgaGVhZFxyXG4gICAgICAgIHRoaXMuc25ha2UudW5zaGlmdChoZWFkKTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGZvb2QgY29uc3VtcHRpb25cclxuICAgICAgICBjb25zdCBmb29kRWF0ZW5JbmRleCA9IHRoaXMuZm9vZC5maW5kSW5kZXgoZiA9PiBmLnggPT09IGhlYWQueCAmJiBmLnkgPT09IGhlYWQueSk7XHJcbiAgICAgICAgaWYgKGZvb2RFYXRlbkluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuc2V0dGluZ3Muc2NvcmVQZXJGb29kO1xyXG4gICAgICAgICAgICB0aGlzLmZvb2Quc3BsaWNlKGZvb2RFYXRlbkluZGV4LCAxKTsgLy8gUmVtb3ZlIGVhdGVuIGZvb2RcclxuICAgICAgICAgICAgdGhpcy5nZW5lcmF0ZUZvb2QoMSk7IC8vIEdlbmVyYXRlIG5ldyBmb29kXHJcbiAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdlYXQnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnNuYWtlLnBvcCgpOyAvLyBSZW1vdmUgdGFpbCBpZiBubyBmb29kIGVhdGVuIChub3JtYWwgbW92ZW1lbnQpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hlY2tDb2xsaXNpb24oaGVhZDogU25ha2VTZWdtZW50KTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzKSByZXR1cm4gdHJ1ZTsgLy8gU2hvdWxkIG5vdCBoYXBwZW5cclxuXHJcbiAgICAgICAgY29uc3QgZ3JpZFdpZHRoID0gdGhpcy5zZXR0aW5ncy5jYW52YXNXaWR0aCAvIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgY29uc3QgZ3JpZEhlaWdodCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzSGVpZ2h0IC8gdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZTtcclxuXHJcbiAgICAgICAgLy8gV2FsbCBjb2xsaXNpb25cclxuICAgICAgICBpZiAoaGVhZC54IDwgMCB8fCBoZWFkLnggPj0gZ3JpZFdpZHRoIHx8IGhlYWQueSA8IDAgfHwgaGVhZC55ID49IGdyaWRIZWlnaHQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTZWxmLWNvbGxpc2lvbiAoY2hlY2sgYWdhaW5zdCBib2R5IHNlZ21lbnRzLCBub3QgdGhlIG5ldyBoZWFkIGl0c2VsZilcclxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IHRoaXMuc25ha2UubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKGhlYWQueCA9PT0gdGhpcy5zbmFrZVtpXS54ICYmIGhlYWQueSA9PT0gdGhpcy5zbmFrZVtpXS55KSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZW5kR2FtZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkdhbWUgT3ZlciFcIik7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVMb29wSW50ZXJ2YWxJZCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuZ2FtZUxvb3BJbnRlcnZhbElkKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lTG9vcEludGVydmFsSWQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnN0b3BTb3VuZCgnYmdtJyk7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ2dhbWVfb3ZlcicpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2VuZXJhdGVGb29kKGNvdW50OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgZ3JpZFdpZHRoID0gdGhpcy5zZXR0aW5ncy5jYW52YXNXaWR0aCAvIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgY29uc3QgZ3JpZEhlaWdodCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzSGVpZ2h0IC8gdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGxldCBuZXdGb29kOiBGb29kO1xyXG4gICAgICAgICAgICBsZXQgY29sbGlzaW9uOiBib29sZWFuO1xyXG4gICAgICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgICAgICBuZXdGb29kID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIHg6IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGdyaWRXaWR0aCksXHJcbiAgICAgICAgICAgICAgICAgICAgeTogTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZ3JpZEhlaWdodCksXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgY29sbGlzaW9uID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBuZXcgZm9vZCBjb2xsaWRlcyB3aXRoIHNuYWtlXHJcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHNlZ21lbnQgb2YgdGhpcy5zbmFrZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzZWdtZW50LnggPT09IG5ld0Zvb2QueCAmJiBzZWdtZW50LnkgPT09IG5ld0Zvb2QueSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xsaXNpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBuZXcgZm9vZCBjb2xsaWRlcyB3aXRoIGV4aXN0aW5nIGZvb2RcclxuICAgICAgICAgICAgICAgIGlmICghY29sbGlzaW9uKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBleGlzdGluZ0Zvb2Qgb2YgdGhpcy5mb29kKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ0Zvb2QueCA9PT0gbmV3Rm9vZC54ICYmIGV4aXN0aW5nRm9vZC55ID09PSBuZXdGb29kLnkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbGxpc2lvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSB3aGlsZSAoY29sbGlzaW9uKTtcclxuICAgICAgICAgICAgdGhpcy5mb29kLnB1c2gobmV3Rm9vZCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3R4IHx8ICF0aGlzLnNldHRpbmdzIHx8ICF0aGlzLnRleHQpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuZHJhd0JhY2tncm91bmQoKTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1BsYXlpbmcoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0JhY2tncm91bmQoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCB8fCAhdGhpcy5zZXR0aW5ncykgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLnNldHRpbmdzLmJhY2tncm91bmRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZFRpbGUgPSB0aGlzLmFzc2V0cy5pbWFnZXNbJ2JhY2tncm91bmRfdGlsZSddO1xyXG4gICAgICAgIGlmIChiYWNrZ3JvdW5kVGlsZSkge1xyXG4gICAgICAgICAgICBjb25zdCBncmlkU2l6ZSA9IHRoaXMuc2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgdGhpcy5jYW52YXMud2lkdGg7IHggKz0gZ3JpZFNpemUpIHtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IHkgPSAwOyB5IDwgdGhpcy5jYW52YXMuaGVpZ2h0OyB5ICs9IGdyaWRTaXplKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJhY2tncm91bmRUaWxlLCB4LCB5LCBncmlkU2l6ZSwgZ3JpZFNpemUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jdHggfHwgIXRoaXMudGV4dCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnRleHQudGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMudGV4dC5wcmVzc1NwYWNlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jdHggfHwgIXRoaXMudGV4dCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzM2cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnRleHQuaW5zdHJ1Y3Rpb25zVGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDEyMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnRleHQuaW5zdHJ1Y3Rpb25zMSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMudGV4dC5pbnN0cnVjdGlvbnMyLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAyMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy50ZXh0Lmluc3RydWN0aW9uczMsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMudGV4dC5pbnN0cnVjdGlvbnNDb250aW51ZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1BsYXlpbmcoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCB8fCAhdGhpcy5zZXR0aW5ncykgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBncmlkU2l6ZSA9IHRoaXMuc2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgY29uc3Qgc25ha2VIZWFkSW1hZ2UgPSB0aGlzLmFzc2V0cy5pbWFnZXNbJ3NuYWtlX2hlYWQnXTtcclxuICAgICAgICBjb25zdCBzbmFrZUJvZHlJbWFnZSA9IHRoaXMuYXNzZXRzLmltYWdlc1snc25ha2VfYm9keSddO1xyXG4gICAgICAgIGNvbnN0IGZvb2RCZXJyeUltYWdlID0gdGhpcy5hc3NldHMuaW1hZ2VzWydmb29kX2JlcnJ5J107XHJcblxyXG4gICAgICAgIC8vIERyYXcgZm9vZFxyXG4gICAgICAgIHRoaXMuZm9vZC5mb3JFYWNoKGYgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZm9vZEJlcnJ5SW1hZ2UpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShmb29kQmVycnlJbWFnZSwgZi54ICogZ3JpZFNpemUsIGYueSAqIGdyaWRTaXplLCBncmlkU2l6ZSwgZ3JpZFNpemUpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChmLnggKiBncmlkU2l6ZSwgZi55ICogZ3JpZFNpemUsIGdyaWRTaXplLCBncmlkU2l6ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBzbmFrZVxyXG4gICAgICAgIHRoaXMuc25ha2UuZm9yRWFjaCgoc2VnbWVudCwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeCA9IHNlZ21lbnQueCAqIGdyaWRTaXplO1xyXG4gICAgICAgICAgICBjb25zdCB5ID0gc2VnbWVudC55ICogZ3JpZFNpemU7XHJcblxyXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IDAgJiYgc25ha2VIZWFkSW1hZ2UpIHsgLy8gSGVhZFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguc2F2ZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHgudHJhbnNsYXRlKHggKyBncmlkU2l6ZSAvIDIsIHkgKyBncmlkU2l6ZSAvIDIpOyAvLyBUcmFuc2xhdGUgdG8gY2VudGVyIG9mIGNlbGxcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gQXNzdW1lIHNuYWtlX2hlYWQucG5nIGFzc2V0IGhhcyBpdHMgXCJub3NlXCIgYW5kIFwiY3Jvd25cIiBwb2ludGluZyBVUCBhdCAwIGRlZ3JlZXMgcm90YXRpb24uXHJcbiAgICAgICAgICAgICAgICAvLyBSb3RhdGUgdGhlIGltYWdlIHNvIHRoZSBcImNyb3duXCIgKHdoaWNoIGlzIGFsc28gdGhlIGxlYWRpbmcgcGFydCBpbiB0aGlzIHRvcC1kb3duIHZpZXcpXHJcbiAgICAgICAgICAgICAgICAvLyBwb2ludHMgaW4gdGhlIGN1cnJlbnQgZGlyZWN0aW9uIG9mIG1vdmVtZW50LlxyXG4gICAgICAgICAgICAgICAgbGV0IHJvdGF0aW9uQW5nbGUgPSAwO1xyXG4gICAgICAgICAgICAgICAgc3dpdGNoICh0aGlzLmN1cnJlbnREaXJlY3Rpb24pIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5VUDogcm90YXRpb25BbmdsZSA9IDA7IGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLkRPV046IHJvdGF0aW9uQW5nbGUgPSBNYXRoLlBJOyBicmVhazsgLy8gMTgwIGRlZ3JlZXMgY2xvY2t3aXNlXHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uTEVGVDogcm90YXRpb25BbmdsZSA9IC1NYXRoLlBJIC8gMjsgYnJlYWs7IC8vIDkwIGRlZ3JlZXMgY291bnRlci1jbG9ja3dpc2VcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5SSUdIVDogcm90YXRpb25BbmdsZSA9IE1hdGguUEkgLyAyOyBicmVhazsgLy8gOTAgZGVncmVlcyBjbG9ja3dpc2VcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LnJvdGF0ZShyb3RhdGlvbkFuZ2xlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShzbmFrZUhlYWRJbWFnZSwgLWdyaWRTaXplIC8gMiwgLWdyaWRTaXplIC8gMiwgZ3JpZFNpemUsIGdyaWRTaXplKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LnJlc3RvcmUoKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChzbmFrZUJvZHlJbWFnZSkgeyAvLyBCb2R5XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2Uoc25ha2VCb2R5SW1hZ2UsIHgsIHksIGdyaWRTaXplLCBncmlkU2l6ZSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7IC8vIEZhbGxiYWNrIHRvIGNvbG9yXHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBpbmRleCA9PT0gMCA/ICdkYXJrZ3JlZW4nIDogJ2dyZWVuJztcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHgsIHksIGdyaWRTaXplLCBncmlkU2l6ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBzY29yZVxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAndG9wJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgU2NvcmU6ICR7dGhpcy5zY29yZX1gLCAxMCwgMTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jdHggfHwgIXRoaXMudGV4dCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnRleHQuZ2FtZU92ZXIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDgwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczNnB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMudGV4dC55b3VyU2NvcmV9JHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnRleHQucHJlc3NTcGFjZVJlc3RhcnQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDgwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuYXNzZXRzLnNvdW5kc1tuYW1lXTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwOyAvLyBSZXdpbmQgdG8gc3RhcnRcclxuICAgICAgICAgICAgYXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBBdWRpbyBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0b3BTb3VuZChuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuYXNzZXRzLnNvdW5kc1tuYW1lXTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgYXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvb3BTb3VuZChuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuYXNzZXRzLnNvdW5kc1tuYW1lXTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgYXVkaW8ubG9vcCA9IHRydWU7XHJcbiAgICAgICAgICAgIGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgQXVkaW8gbG9vcCBwbGF5YmFjayBmYWlsZWQgZm9yICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gRW5zdXJlIHRoZSBET00gaXMgZnVsbHkgbG9hZGVkIGJlZm9yZSBpbml0aWFsaXppbmcgdGhlIGdhbWVcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIC8vIENoZWNrIGlmIHRoZSBjYW52YXMgZWxlbWVudCBleGlzdHMgYmVmb3JlIGNyZWF0aW5nIHRoZSBHYW1lIGluc3RhbmNlXHJcbiAgICBjb25zdCBnYW1lQ2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKTtcclxuICAgIGlmIChnYW1lQ2FudmFzIGluc3RhbmNlb2YgSFRNTENhbnZhc0VsZW1lbnQpIHtcclxuICAgICAgICBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCAnZ2FtZUNhbnZhcycgbm90IGZvdW5kLlwiKTtcclxuICAgICAgICAvLyBPcHRpb25hbGx5LCBjcmVhdGUgYSBjYW52YXMgcHJvZ3JhbW1hdGljYWxseSBpZiBpdCdzIG1pc3NpbmcgZm9yIHRlc3Rpbmcvcm9idXN0bmVzc1xyXG4gICAgICAgIGNvbnN0IG5ld0NhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xyXG4gICAgICAgIG5ld0NhbnZhcy5pZCA9ICdnYW1lQ2FudmFzJztcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG5ld0NhbnZhcyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJDcmVhdGVkIG1pc3NpbmcgY2FudmFzIGVsZW1lbnQuXCIpO1xyXG4gICAgICAgIG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICB9XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUFxREEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFKQyxTQUFBQTtBQUFBLEdBQUE7QUFPTCxJQUFLLFlBQUwsa0JBQUtDLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBTEMsU0FBQUE7QUFBQSxHQUFBO0FBa0JMLE1BQU0sS0FBSztBQUFBLEVBbUJQLFlBQVksVUFBa0I7QUFoQjlCLFNBQVEsT0FBd0I7QUFDaEMsU0FBUSxXQUFnQztBQUN4QyxTQUFRLE9BQXdCO0FBQ2hDLFNBQVEsU0FBdUIsRUFBRSxRQUFRLENBQUMsR0FBRyxRQUFRLENBQUMsRUFBRTtBQUV4RCxTQUFRLFlBQXVCO0FBQy9CLFNBQVEsUUFBd0IsQ0FBQztBQUNqQyxTQUFRLE9BQWUsQ0FBQztBQUN4QixTQUFRLG1CQUE4QjtBQUN0QyxTQUFRLG1CQUE4QjtBQUN0QyxTQUFRLFFBQWdCO0FBQ3hCLFNBQVEsaUJBQXlCO0FBQ2pDLFNBQVEscUJBQW9DO0FBQzVDLFNBQVEsdUJBQXNDO0FBQzlDLFNBQVEsb0JBQXFDLENBQUM7QUFHMUMsU0FBSyxTQUFT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
