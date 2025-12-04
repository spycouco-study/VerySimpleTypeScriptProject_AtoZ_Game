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
            rotationAngle = -Math.PI / 2;
            break;
          // -90 degrees
          case 1 /* DOWN */:
            rotationAngle = Math.PI / 2;
            break;
          // 90 degrees
          case 2 /* LEFT */:
            rotationAngle = Math.PI;
            break;
          // 180 degrees
          case 3 /* RIGHT */:
            rotationAngle = 0;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBncmlkU2l6ZTogbnVtYmVyO1xyXG4gICAgaW5pdGlhbFNuYWtlTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBzbmFrZVNwZWVkTXM6IG51bWJlcjtcclxuICAgIGZvb2RDb3VudDogbnVtYmVyO1xyXG4gICAgYmFja2dyb3VuZENvbG9yOiBzdHJpbmc7XHJcbiAgICBzY29yZVBlckZvb2Q6IG51bWJlcjtcclxuICAgIHdhbGxDb2xvcjogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVRleHQge1xyXG4gICAgdGl0bGU6IHN0cmluZztcclxuICAgIHByZXNzU3BhY2U6IHN0cmluZztcclxuICAgIGluc3RydWN0aW9uc1RpdGxlOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnMxOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnMyOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnMzOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNDb250aW51ZTogc3RyaW5nO1xyXG4gICAgZ2FtZU92ZXI6IHN0cmluZztcclxuICAgIHlvdXJTY29yZTogc3RyaW5nO1xyXG4gICAgcHJlc3NTcGFjZVJlc3RhcnQ6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVBc3NldEltYWdlRGF0YSB7IC8vIFJlbmFtZWQgZnJvbSBJbWFnZURhdGEgdG8gYXZvaWQgY29uZmxpY3Qgd2l0aCBET00ncyBJbWFnZURhdGFcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIFNvdW5kRGF0YSB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgdGV4dDogR2FtZVRleHQ7XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEdhbWVBc3NldEltYWdlRGF0YVtdOyAvLyBVcGRhdGVkIHR5cGUgaGVyZVxyXG4gICAgICAgIHNvdW5kczogU291bmREYXRhW107XHJcbiAgICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTG9hZGVkQXNzZXRzIHtcclxuICAgIGltYWdlczogeyBba2V5OiBzdHJpbmddOiBIVE1MSW1hZ2VFbGVtZW50IH07XHJcbiAgICBzb3VuZHM6IHsgW2tleTogc3RyaW5nXTogSFRNTEF1ZGlvRWxlbWVudCB9O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIElOU1RSVUNUSU9OUyxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmVudW0gRGlyZWN0aW9uIHtcclxuICAgIFVQLFxyXG4gICAgRE9XTixcclxuICAgIExFRlQsXHJcbiAgICBSSUdIVCxcclxuICAgIE5PTkUsIC8vIEZvciBpbml0aWFsIHN0YXRlIG9yIG5vIG1vdmVtZW50XHJcbn1cclxuXHJcbmludGVyZmFjZSBTbmFrZVNlZ21lbnQge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRm9vZCB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbn1cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZGF0YTogR2FtZURhdGEgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgc2V0dGluZ3M6IEdhbWVTZXR0aW5ncyB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSB0ZXh0OiBHYW1lVGV4dCB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBhc3NldHM6IExvYWRlZEFzc2V0cyA9IHsgaW1hZ2VzOiB7fSwgc291bmRzOiB7fSB9O1xyXG5cclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICBwcml2YXRlIHNuYWtlOiBTbmFrZVNlZ21lbnRbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBmb29kOiBGb29kW10gPSBbXTtcclxuICAgIHByaXZhdGUgY3VycmVudERpcmVjdGlvbjogRGlyZWN0aW9uID0gRGlyZWN0aW9uLk5PTkU7XHJcbiAgICBwcml2YXRlIHBlbmRpbmdEaXJlY3Rpb246IERpcmVjdGlvbiA9IERpcmVjdGlvbi5OT05FO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbGFzdFVwZGF0ZVRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGdhbWVMb29wSW50ZXJ2YWxJZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGdhbWVBbmltYXRpb25GcmFtZUlkOiBudW1iZXIgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYXNzZXRMb2FkUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzIHx8ICF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGVsZW1lbnQgbm90IGZvdW5kIG9yIGNvbnRleHQgbm90IHN1cHBvcnRlZC5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuaW5pdCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRHYW1lRGF0YSgpO1xyXG4gICAgICAgIGlmICh0aGlzLmRhdGEpIHtcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgICAgIHRoaXMudGV4dCA9IHRoaXMuZGF0YS50ZXh0O1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5hZGRFdmVudExpc3RlbmVycygpO1xyXG4gICAgICAgIHRoaXMuc3RhcnRSZW5kZXJpbmdMb29wKCk7IC8vIFN0YXJ0IHRoZSBhbmltYXRpb24gbG9vcCBpbW1lZGlhdGVseSBmb3IgdGl0bGUgc2NyZWVuXHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJHYW1lIGRhdGEgbG9hZGVkOlwiLCB0aGlzLmRhdGEpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIGdhbWUgZGF0YTpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICB0aGlzLmRhdGEgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5kYXRhLmFzc2V0cy5pbWFnZXMuZm9yRWFjaChpbWdEYXRhID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgIGltZy5zcmMgPSBpbWdEYXRhLnBhdGg7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLmltYWdlc1tpbWdEYXRhLm5hbWVdID0gaW1nO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWdEYXRhLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdGhpcy5hc3NldExvYWRQcm9taXNlcy5wdXNoKHByb21pc2UpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmRhdGEuYXNzZXRzLnNvdW5kcy5mb3JFYWNoKHNvdW5kRGF0YSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kRGF0YS5wYXRoKTtcclxuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmREYXRhLnZvbHVtZTtcclxuICAgICAgICAgICAgLy8gUHJlbG9hZCB0byBlbnN1cmUgcGxheWJhY2sgcmVsaWFiaWxpdHlcclxuICAgICAgICAgICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHMuc291bmRzW3NvdW5kRGF0YS5uYW1lXSA9IGF1ZGlvO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kRGF0YS5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdCgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuYXNzZXRMb2FkUHJvbWlzZXMucHVzaChwcm9taXNlKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5hc3NldExvYWRQcm9taXNlcyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIHNvbWUgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYWRkRXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlSW5wdXQuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgLy8gQWRkIGEgY2xpY2sgbGlzdGVuZXIgdG8gdGhlIGNhbnZhcyB0byBlbmFibGUgYXVkaW8gY29udGV4dCBpbiBzb21lIGJyb3dzZXJzXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFICYmIHRoaXMuYXNzZXRzLnNvdW5kc1snYmdtJ10pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9vcFNvdW5kKCdiZ20nKTsgLy8gVHJ5IHRvIHBsYXkgQkdNIG9uIGZpcnN0IGludGVyYWN0aW9uXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5zb3VuZHNbJ2JnbSddLnBhdXNlKCk7IC8vIFBhdXNlIGl0IGZvciBub3csIHdpbGwgcGxheSBsYXRlclxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSwgeyBvbmNlOiB0cnVlIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlSW5wdXQoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LmNvZGUgPT09ICdTcGFjZScpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3KCk7IC8vIFJlZHJhdyBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgICAgIGlmIChldmVudC5jb2RlID09PSAnU3BhY2UnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZVBsYXlpbmdJbnB1dChldmVudC5jb2RlKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ1NwYWNlJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RvcFNvdW5kKCdnYW1lX292ZXInKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5aW5nSW5wdXQoa2V5Q29kZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEhlYWQgPSB0aGlzLnNuYWtlWzBdO1xyXG4gICAgICAgIGNvbnN0IG5leHRTZWdtZW50ID0gdGhpcy5zbmFrZVsxXSB8fCB7IHg6IGN1cnJlbnRIZWFkLngsIHk6IGN1cnJlbnRIZWFkLnkgfTsgLy8gSWYgc25ha2UgaGFzIG9ubHkgaGVhZFxyXG5cclxuICAgICAgICBsZXQgbmV3RGlyZWN0aW9uOiBEaXJlY3Rpb24gPSB0aGlzLmN1cnJlbnREaXJlY3Rpb247XHJcblxyXG4gICAgICAgIHN3aXRjaCAoa2V5Q29kZSkge1xyXG4gICAgICAgICAgICBjYXNlICdBcnJvd1VwJzpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnREaXJlY3Rpb24gIT09IERpcmVjdGlvbi5ET1dOICYmICEoY3VycmVudEhlYWQueCA9PT0gbmV4dFNlZ21lbnQueCAmJiBjdXJyZW50SGVhZC55IC0gMSA9PT0gbmV4dFNlZ21lbnQueSkpIHtcclxuICAgICAgICAgICAgICAgICAgICBuZXdEaXJlY3Rpb24gPSBEaXJlY3Rpb24uVVA7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnQXJyb3dEb3duJzpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnREaXJlY3Rpb24gIT09IERpcmVjdGlvbi5VUCAmJiAhKGN1cnJlbnRIZWFkLnggPT09IG5leHRTZWdtZW50LnggJiYgY3VycmVudEhlYWQueSArIDEgPT09IG5leHRTZWdtZW50LnkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RGlyZWN0aW9uID0gRGlyZWN0aW9uLkRPV047XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnQXJyb3dMZWZ0JzpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnREaXJlY3Rpb24gIT09IERpcmVjdGlvbi5SSUdIVCAmJiAhKGN1cnJlbnRIZWFkLnggLSAxID09PSBuZXh0U2VnbWVudC54ICYmIGN1cnJlbnRIZWFkLnkgPT09IG5leHRTZWdtZW50LnkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RGlyZWN0aW9uID0gRGlyZWN0aW9uLkxFRlQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnQXJyb3dSaWdodCc6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50RGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uTEVGVCAmJiAhKGN1cnJlbnRIZWFkLnggKyAxID09PSBuZXh0U2VnbWVudC54ICYmIGN1cnJlbnRIZWFkLnkgPT09IG5leHRTZWdtZW50LnkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3RGlyZWN0aW9uID0gRGlyZWN0aW9uLlJJR0hUO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBPbmx5IHVwZGF0ZSBwZW5kaW5nIGRpcmVjdGlvbiBpZiBpdCdzIGEgdmFsaWQgY2hhbmdlXHJcbiAgICAgICAgaWYgKG5ld0RpcmVjdGlvbiAhPT0gdGhpcy5jdXJyZW50RGlyZWN0aW9uKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ0RpcmVjdGlvbiA9IG5ld0RpcmVjdGlvbjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5zZXR0aW5ncyB8fCAhdGhpcy50ZXh0KSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiU3RhcnRpbmcgbmV3IGdhbWUuLi5cIik7XHJcbiAgICAgICAgdGhpcy5zdG9wU291bmQoJ2JnbScpOyAvLyBFbnN1cmUgYW55IHByZXZpb3VzIEJHTSBpcyBzdG9wcGVkXHJcbiAgICAgICAgdGhpcy5sb29wU291bmQoJ2JnbScpO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuc25ha2UgPSBbXTtcclxuICAgICAgICB0aGlzLmZvb2QgPSBbXTtcclxuICAgICAgICB0aGlzLmN1cnJlbnREaXJlY3Rpb24gPSBEaXJlY3Rpb24uUklHSFQ7IC8vIFN0YXJ0IG1vdmluZyByaWdodFxyXG4gICAgICAgIHRoaXMucGVuZGluZ0RpcmVjdGlvbiA9IERpcmVjdGlvbi5SSUdIVDtcclxuXHJcbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBzbmFrZSBpbiB0aGUgbWlkZGxlLWxlZnRcclxuICAgICAgICBjb25zdCBzdGFydFggPSBNYXRoLmZsb29yKHRoaXMuc2V0dGluZ3MuY2FudmFzV2lkdGggLyB0aGlzLnNldHRpbmdzLmdyaWRTaXplIC8gNCk7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRZID0gTWF0aC5mbG9vcih0aGlzLnNldHRpbmdzLmNhbnZhc0hlaWdodCAvIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemUgLyAyKTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc2V0dGluZ3MuaW5pdGlhbFNuYWtlTGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdGhpcy5zbmFrZS5wdXNoKHsgeDogc3RhcnRYIC0gaSwgeTogc3RhcnRZIH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5nZW5lcmF0ZUZvb2QodGhpcy5zZXR0aW5ncy5mb29kQ291bnQpO1xyXG5cclxuICAgICAgICAvLyBDbGVhciBwcmV2aW91cyBpbnRlcnZhbCBpZiBhbnkgYW5kIHN0YXJ0IG5ldyBnYW1lIGxvb3BcclxuICAgICAgICBpZiAodGhpcy5nYW1lTG9vcEludGVydmFsSWQgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aGlzLmdhbWVMb29wSW50ZXJ2YWxJZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZ2FtZUxvb3BJbnRlcnZhbElkID0gc2V0SW50ZXJ2YWwodGhpcy51cGRhdGUuYmluZCh0aGlzKSwgdGhpcy5zZXR0aW5ncy5zbmFrZVNwZWVkTXMpIGFzIHVua25vd24gYXMgbnVtYmVyO1xyXG5cclxuICAgICAgICB0aGlzLmxhc3RVcGRhdGVUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydFJlbmRlcmluZ0xvb3AoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgcmVuZGVyID0gKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXcoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lQW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy5nYW1lQW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShyZW5kZXIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5aW5nKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWluZygpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGN1cnJlbnQgZGlyZWN0aW9uIGZyb20gcGVuZGluZyBkaXJlY3Rpb25cclxuICAgICAgICBpZiAodGhpcy5wZW5kaW5nRGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uTk9ORSkge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnREaXJlY3Rpb24gPSB0aGlzLnBlbmRpbmdEaXJlY3Rpb247XHJcbiAgICAgICAgICAgIHRoaXMucGVuZGluZ0RpcmVjdGlvbiA9IERpcmVjdGlvbi5OT05FOyAvLyBSZXNldCBwZW5kaW5nIGFmdGVyIGFwcGx5aW5nXHJcbiAgICAgICAgfVxyXG5cclxuXHJcbiAgICAgICAgY29uc3QgaGVhZCA9IHsgLi4udGhpcy5zbmFrZVswXSB9OyAvLyBDb3B5IGN1cnJlbnQgaGVhZFxyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgbmV3IGhlYWQgcG9zaXRpb25cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuY3VycmVudERpcmVjdGlvbikge1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5VUDogaGVhZC55LS07IGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5ET1dOOiBoZWFkLnkrKzsgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLkxFRlQ6IGhlYWQueC0tOyBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uUklHSFQ6IGhlYWQueCsrOyBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciBjb2xsaXNpb25zXHJcbiAgICAgICAgaWYgKHRoaXMuY2hlY2tDb2xsaXNpb24oaGVhZCkpIHtcclxuICAgICAgICAgICAgdGhpcy5lbmRHYW1lKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFkZCBuZXcgaGVhZFxyXG4gICAgICAgIHRoaXMuc25ha2UudW5zaGlmdChoZWFkKTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGZvb2QgY29uc3VtcHRpb25cclxuICAgICAgICBjb25zdCBmb29kRWF0ZW5JbmRleCA9IHRoaXMuZm9vZC5maW5kSW5kZXgoZiA9PiBmLnggPT09IGhlYWQueCAmJiBmLnkgPT09IGhlYWQueSk7XHJcbiAgICAgICAgaWYgKGZvb2RFYXRlbkluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuc2V0dGluZ3Muc2NvcmVQZXJGb29kO1xyXG4gICAgICAgICAgICB0aGlzLmZvb2Quc3BsaWNlKGZvb2RFYXRlbkluZGV4LCAxKTsgLy8gUmVtb3ZlIGVhdGVuIGZvb2RcclxuICAgICAgICAgICAgdGhpcy5nZW5lcmF0ZUZvb2QoMSk7IC8vIEdlbmVyYXRlIG5ldyBmb29kXHJcbiAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdlYXQnKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLnNuYWtlLnBvcCgpOyAvLyBSZW1vdmUgdGFpbCBpZiBubyBmb29kIGVhdGVuIChub3JtYWwgbW92ZW1lbnQpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hlY2tDb2xsaXNpb24oaGVhZDogU25ha2VTZWdtZW50KTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzKSByZXR1cm4gdHJ1ZTsgLy8gU2hvdWxkIG5vdCBoYXBwZW5cclxuXHJcbiAgICAgICAgY29uc3QgZ3JpZFdpZHRoID0gdGhpcy5zZXR0aW5ncy5jYW52YXNXaWR0aCAvIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgY29uc3QgZ3JpZEhlaWdodCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzSGVpZ2h0IC8gdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZTtcclxuXHJcbiAgICAgICAgLy8gV2FsbCBjb2xsaXNpb25cclxuICAgICAgICBpZiAoaGVhZC54IDwgMCB8fCBoZWFkLnggPj0gZ3JpZFdpZHRoIHx8IGhlYWQueSA8IDAgfHwgaGVhZC55ID49IGdyaWRIZWlnaHQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTZWxmLWNvbGxpc2lvbiAoY2hlY2sgYWdhaW5zdCBib2R5IHNlZ21lbnRzLCBub3QgdGhlIG5ldyBoZWFkIGl0c2VsZilcclxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IHRoaXMuc25ha2UubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKGhlYWQueCA9PT0gdGhpcy5zbmFrZVtpXS54ICYmIGhlYWQueSA9PT0gdGhpcy5zbmFrZVtpXS55KSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZW5kR2FtZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkdhbWUgT3ZlciFcIik7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVMb29wSW50ZXJ2YWxJZCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBjbGVhckludGVydmFsKHRoaXMuZ2FtZUxvb3BJbnRlcnZhbElkKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lTG9vcEludGVydmFsSWQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnN0b3BTb3VuZCgnYmdtJyk7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ2dhbWVfb3ZlcicpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2VuZXJhdGVGb29kKGNvdW50OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgZ3JpZFdpZHRoID0gdGhpcy5zZXR0aW5ncy5jYW52YXNXaWR0aCAvIHRoaXMuc2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgY29uc3QgZ3JpZEhlaWdodCA9IHRoaXMuc2V0dGluZ3MuY2FudmFzSGVpZ2h0IC8gdGhpcy5zZXR0aW5ncy5ncmlkU2l6ZTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGxldCBuZXdGb29kOiBGb29kO1xyXG4gICAgICAgICAgICBsZXQgY29sbGlzaW9uOiBib29sZWFuO1xyXG4gICAgICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgICAgICBuZXdGb29kID0ge1xyXG4gICAgICAgICAgICAgICAgICAgIHg6IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGdyaWRXaWR0aCksXHJcbiAgICAgICAgICAgICAgICAgICAgeTogTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZ3JpZEhlaWdodCksXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgY29sbGlzaW9uID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBuZXcgZm9vZCBjb2xsaWRlcyB3aXRoIHNuYWtlXHJcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHNlZ21lbnQgb2YgdGhpcy5zbmFrZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzZWdtZW50LnggPT09IG5ld0Zvb2QueCAmJiBzZWdtZW50LnkgPT09IG5ld0Zvb2QueSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb2xsaXNpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBuZXcgZm9vZCBjb2xsaWRlcyB3aXRoIGV4aXN0aW5nIGZvb2RcclxuICAgICAgICAgICAgICAgIGlmICghY29sbGlzaW9uKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBleGlzdGluZ0Zvb2Qgb2YgdGhpcy5mb29kKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ0Zvb2QueCA9PT0gbmV3Rm9vZC54ICYmIGV4aXN0aW5nRm9vZC55ID09PSBuZXdGb29kLnkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbGxpc2lvbiA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSB3aGlsZSAoY29sbGlzaW9uKTtcclxuICAgICAgICAgICAgdGhpcy5mb29kLnB1c2gobmV3Rm9vZCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhdygpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3R4IHx8ICF0aGlzLnNldHRpbmdzIHx8ICF0aGlzLnRleHQpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuZHJhd0JhY2tncm91bmQoKTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1BsYXlpbmcoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0JhY2tncm91bmQoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCB8fCAhdGhpcy5zZXR0aW5ncykgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLnNldHRpbmdzLmJhY2tncm91bmRDb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZFRpbGUgPSB0aGlzLmFzc2V0cy5pbWFnZXNbJ2JhY2tncm91bmRfdGlsZSddO1xyXG4gICAgICAgIGlmIChiYWNrZ3JvdW5kVGlsZSkge1xyXG4gICAgICAgICAgICBjb25zdCBncmlkU2l6ZSA9IHRoaXMuc2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgdGhpcy5jYW52YXMud2lkdGg7IHggKz0gZ3JpZFNpemUpIHtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IHkgPSAwOyB5IDwgdGhpcy5jYW52YXMuaGVpZ2h0OyB5ICs9IGdyaWRTaXplKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJhY2tncm91bmRUaWxlLCB4LCB5LCBncmlkU2l6ZSwgZ3JpZFNpemUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jdHggfHwgIXRoaXMudGV4dCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnRleHQudGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMudGV4dC5wcmVzc1NwYWNlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jdHggfHwgIXRoaXMudGV4dCkgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzM2cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnRleHQuaW5zdHJ1Y3Rpb25zVGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDEyMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnRleHQuaW5zdHJ1Y3Rpb25zMSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMudGV4dC5pbnN0cnVjdGlvbnMyLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAyMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy50ZXh0Lmluc3RydWN0aW9uczMsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMudGV4dC5pbnN0cnVjdGlvbnNDb250aW51ZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1BsYXlpbmcoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCB8fCAhdGhpcy5zZXR0aW5ncykgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBncmlkU2l6ZSA9IHRoaXMuc2V0dGluZ3MuZ3JpZFNpemU7XHJcbiAgICAgICAgY29uc3Qgc25ha2VIZWFkSW1hZ2UgPSB0aGlzLmFzc2V0cy5pbWFnZXNbJ3NuYWtlX2hlYWQnXTtcclxuICAgICAgICBjb25zdCBzbmFrZUJvZHlJbWFnZSA9IHRoaXMuYXNzZXRzLmltYWdlc1snc25ha2VfYm9keSddO1xyXG4gICAgICAgIGNvbnN0IGZvb2RCZXJyeUltYWdlID0gdGhpcy5hc3NldHMuaW1hZ2VzWydmb29kX2JlcnJ5J107XHJcblxyXG4gICAgICAgIC8vIERyYXcgZm9vZFxyXG4gICAgICAgIHRoaXMuZm9vZC5mb3JFYWNoKGYgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZm9vZEJlcnJ5SW1hZ2UpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShmb29kQmVycnlJbWFnZSwgZi54ICogZ3JpZFNpemUsIGYueSAqIGdyaWRTaXplLCBncmlkU2l6ZSwgZ3JpZFNpemUpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChmLnggKiBncmlkU2l6ZSwgZi55ICogZ3JpZFNpemUsIGdyaWRTaXplLCBncmlkU2l6ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBzbmFrZVxyXG4gICAgICAgIHRoaXMuc25ha2UuZm9yRWFjaCgoc2VnbWVudCwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeCA9IHNlZ21lbnQueCAqIGdyaWRTaXplO1xyXG4gICAgICAgICAgICBjb25zdCB5ID0gc2VnbWVudC55ICogZ3JpZFNpemU7XHJcblxyXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IDAgJiYgc25ha2VIZWFkSW1hZ2UpIHsgLy8gSGVhZFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguc2F2ZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHgudHJhbnNsYXRlKHggKyBncmlkU2l6ZSAvIDIsIHkgKyBncmlkU2l6ZSAvIDIpOyAvLyBUcmFuc2xhdGUgdG8gY2VudGVyIG9mIGNlbGxcclxuICAgICAgICAgICAgICAgIGxldCByb3RhdGlvbkFuZ2xlID0gMDtcclxuICAgICAgICAgICAgICAgIHN3aXRjaCAodGhpcy5jdXJyZW50RGlyZWN0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uVVA6IHJvdGF0aW9uQW5nbGUgPSAtTWF0aC5QSSAvIDI7IGJyZWFrOyAvLyAtOTAgZGVncmVlc1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgRGlyZWN0aW9uLkRPV046IHJvdGF0aW9uQW5nbGUgPSBNYXRoLlBJIC8gMjsgYnJlYWs7IC8vIDkwIGRlZ3JlZXNcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIERpcmVjdGlvbi5MRUZUOiByb3RhdGlvbkFuZ2xlID0gTWF0aC5QSTsgYnJlYWs7IC8vIDE4MCBkZWdyZWVzXHJcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBEaXJlY3Rpb24uUklHSFQ6IHJvdGF0aW9uQW5nbGUgPSAwOyBicmVhazsgLy8gMCBkZWdyZWVzXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5yb3RhdGUocm90YXRpb25BbmdsZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2Uoc25ha2VIZWFkSW1hZ2UsIC1ncmlkU2l6ZSAvIDIsIC1ncmlkU2l6ZSAvIDIsIGdyaWRTaXplLCBncmlkU2l6ZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5yZXN0b3JlKCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc25ha2VCb2R5SW1hZ2UpIHsgLy8gQm9keVxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKHNuYWtlQm9keUltYWdlLCB4LCB5LCBncmlkU2l6ZSwgZ3JpZFNpemUpO1xyXG4gICAgICAgICAgICB9IGVsc2UgeyAvLyBGYWxsYmFjayB0byBjb2xvclxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gaW5kZXggPT09IDAgPyAnZGFya2dyZWVuJyA6ICdncmVlbic7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCh4LCB5LCBncmlkU2l6ZSwgZ3JpZFNpemUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgc2NvcmVcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ3RvcCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNjb3JlOiAke3RoaXMuc2NvcmV9YCwgMTAsIDEwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY3R4IHx8ICF0aGlzLnRleHQpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0OHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy50ZXh0LmdhbWVPdmVyLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA4MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzZweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHt0aGlzLnRleHQueW91clNjb3JlfSR7dGhpcy5zY29yZX1gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy50ZXh0LnByZXNzU3BhY2VSZXN0YXJ0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA4MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5U291bmQobmFtZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLmFzc2V0cy5zb3VuZHNbbmFtZV07XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDsgLy8gUmV3aW5kIHRvIHN0YXJ0XHJcbiAgICAgICAgICAgIGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgQXVkaW8gcGxheWJhY2sgZmFpbGVkIGZvciAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdG9wU291bmQobmFtZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLmFzc2V0cy5zb3VuZHNbbmFtZV07XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb29wU291bmQobmFtZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLmFzc2V0cy5zb3VuZHNbbmFtZV07XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGF1ZGlvLmxvb3AgPSB0cnVlO1xyXG4gICAgICAgICAgICBhdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEF1ZGlvIGxvb3AgcGxheWJhY2sgZmFpbGVkIGZvciAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEVuc3VyZSB0aGUgRE9NIGlzIGZ1bGx5IGxvYWRlZCBiZWZvcmUgaW5pdGlhbGl6aW5nIHRoZSBnYW1lXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICAvLyBDaGVjayBpZiB0aGUgY2FudmFzIGVsZW1lbnQgZXhpc3RzIGJlZm9yZSBjcmVhdGluZyB0aGUgR2FtZSBpbnN0YW5jZVxyXG4gICAgY29uc3QgZ2FtZUNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJyk7XHJcbiAgICBpZiAoZ2FtZUNhbnZhcyBpbnN0YW5jZW9mIEhUTUxDYW52YXNFbGVtZW50KSB7XHJcbiAgICAgICAgbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZC5cIik7XHJcbiAgICAgICAgLy8gT3B0aW9uYWxseSwgY3JlYXRlIGEgY2FudmFzIHByb2dyYW1tYXRpY2FsbHkgaWYgaXQncyBtaXNzaW5nIGZvciB0ZXN0aW5nL3JvYnVzdG5lc3NcclxuICAgICAgICBjb25zdCBuZXdDYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgICAgICBuZXdDYW52YXMuaWQgPSAnZ2FtZUNhbnZhcyc7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChuZXdDYW52YXMpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQ3JlYXRlZCBtaXNzaW5nIGNhbnZhcyBlbGVtZW50LlwiKTtcclxuICAgICAgICBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgfVxyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBcURBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVB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
