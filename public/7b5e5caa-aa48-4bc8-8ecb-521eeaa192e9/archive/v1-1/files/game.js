var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var BlockState = /* @__PURE__ */ ((BlockState2) => {
  BlockState2[BlockState2["IDLE"] = 0] = "IDLE";
  BlockState2[BlockState2["SWAPPING"] = 1] = "SWAPPING";
  BlockState2[BlockState2["CLEARING"] = 2] = "CLEARING";
  BlockState2[BlockState2["FALLING"] = 3] = "FALLING";
  return BlockState2;
})(BlockState || {});
class Game {
  constructor(canvasId) {
    this.gameState = 0 /* TITLE */;
    this.lastFrameTime = 0;
    // Game variables
    this.grid = [];
    this.score = 0;
    this.timeLeft = 0;
    this.selectedBlock = null;
    this.currentDifficultyLevel = 0;
    this.activeBlockTypes = 0;
    // Number of block types currently in play
    this.gravitySpeed = 0;
    // Current gravity speed in pixels/sec
    this.baseGravitySpeed = 0;
    // Base speed from config
    // Audio
    this.bgm = null;
    // UI Buttons for click detection
    this.buttons = [];
    this.gameLoop = (currentTime) => {
      const deltaTime = (currentTime - this.lastFrameTime) / 1e3;
      this.lastFrameTime = currentTime;
      this.update(deltaTime);
      this.render();
      requestAnimationFrame(this.gameLoop);
    };
    this.handleClick = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      switch (this.gameState) {
        case 0 /* TITLE */:
        case 1 /* INSTRUCTIONS */:
        case 3 /* GAME_OVER */:
          for (const button of this.buttons) {
            if (mouseX >= button.x && mouseX <= button.x + button.width && mouseY >= button.y && mouseY <= button.y + button.height) {
              button.onClick();
              return;
            }
          }
          break;
        case 2 /* PLAYING */:
          for (let r = 0; r < this.config.gridSizeY; r++) {
            for (let c = 0; c < this.config.gridSizeX; c++) {
              if (this.grid[r][c].state !== 0 /* IDLE */) {
                return;
              }
            }
          }
          const boardOffsetX = (this.canvas.width - this.config.gridSizeX * this.config.blockSize) / 2;
          const boardOffsetY = (this.canvas.height - this.config.gridSizeY * this.config.blockSize) / 2 + 50;
          if (mouseX >= boardOffsetX && mouseX < boardOffsetX + this.config.gridSizeX * this.config.blockSize && mouseY >= boardOffsetY && mouseY < boardOffsetY + this.config.gridSizeY * this.config.blockSize) {
            const gridX = Math.floor((mouseX - boardOffsetX) / this.config.blockSize);
            const gridY = Math.floor((mouseY - boardOffsetY) / this.config.blockSize);
            this.handleBlockClick(gridX, gridY);
          }
          break;
      }
    };
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.canvas.addEventListener("click", this.handleClick);
  }
  async start() {
    await this.loadConfig();
    this.setupCanvas();
    await this.loadAssets();
    this.initGameVariables();
    this.bgm = this.assets.sounds.get("bgm") || null;
    if (this.bgm) {
      this.bgm.loop = true;
      this.bgm.volume = this.config.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.5;
    }
    requestAnimationFrame(this.gameLoop);
  }
  async loadConfig() {
    const response = await fetch("data.json");
    this.config = await response.json();
  }
  setupCanvas() {
    this.canvas.width = this.config.canvasWidth;
    this.canvas.height = this.config.canvasHeight;
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
  }
  async loadAssets() {
    const imagePromises = this.config.assets.images.map((img) => {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = img.path;
        image.onload = () => resolve([img.name, image]);
        image.onerror = (e) => {
          console.error(`Failed to load image: ${img.path}`, e);
          const dummyImage = new Image();
          resolve([img.name, dummyImage]);
        };
      });
    });
    const soundPromises = this.config.assets.sounds.map((snd) => {
      return new Promise((resolve) => {
        const audio = new Audio();
        audio.src = snd.path;
        audio.volume = snd.volume;
        audio.load();
        audio.onerror = (e) => {
          console.error(`Failed to load sound: ${snd.path}`, e);
        };
        resolve([snd.name, audio]);
      });
    });
    const loadedImages = await Promise.all(imagePromises);
    const loadedSounds = await Promise.all(soundPromises);
    this.assets = {
      images: new Map(loadedImages),
      sounds: new Map(loadedSounds)
    };
  }
  initGameVariables() {
    this.score = 0;
    this.timeLeft = this.config.gameDurationSeconds;
    this.selectedBlock = null;
    this.currentDifficultyLevel = 0;
    this.activeBlockTypes = this.config.initialBlockTypes;
    this.baseGravitySpeed = this.config.gravitySpeed;
    this.gravitySpeed = this.baseGravitySpeed;
    this.initGrid();
  }
  initGrid() {
    this.grid = [];
    for (let y = 0; y < this.config.gridSizeY; y++) {
      this.grid.push([]);
      for (let x = 0; x < this.config.gridSizeX; x++) {
        this.grid[y].push(this.createRandomBlock(x, y - this.config.gridSizeY));
      }
    }
    for (let y = 0; y < this.config.gridSizeY; y++) {
      for (let x = 0; x < this.config.gridSizeX; x++) {
        this.grid[y][x].targetY = y;
        this.grid[y][x].state = 3 /* FALLING */;
      }
    }
    let matchesFound = true;
    while (matchesFound) {
      matchesFound = false;
      const matchedCoordinates = this.findMatches();
      if (matchedCoordinates.length > 0) {
        matchesFound = true;
        for (const { x, y } of matchedCoordinates) {
          this.grid[y][x] = this.createRandomBlock(x, y);
        }
      }
    }
  }
  createRandomBlock(x, y) {
    const type = Math.floor(Math.random() * this.activeBlockTypes);
    return { type, x, y, targetY: y, state: 0 /* IDLE */ };
  }
  update(deltaTime) {
    switch (this.gameState) {
      case 2 /* PLAYING */:
        this.timeLeft -= deltaTime;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.gameState = 3 /* GAME_OVER */;
          this.playSound("game_over");
          if (this.bgm) {
            this.bgm.pause();
            this.bgm.currentTime = 0;
          }
        }
        this.updateDifficulty();
        this.updateBlocks(deltaTime);
        break;
    }
  }
  updateBlocks(deltaTime) {
    let anyBlockAnimating = false;
    for (let y = 0; y < this.config.gridSizeY; y++) {
      for (let x = 0; x < this.config.gridSizeX; x++) {
        const block = this.grid[y][x];
        if (block.state === 3 /* FALLING */) {
          anyBlockAnimating = true;
          block.y += this.gravitySpeed * deltaTime / this.config.blockSize;
          if (block.y >= block.targetY) {
            block.y = block.targetY;
            block.state = 0 /* IDLE */;
          }
        } else if (block.state === 1 /* SWAPPING */) {
          anyBlockAnimating = true;
          if (block.swapProgress === void 0) block.swapProgress = 0;
          block.swapProgress += 2.5 * deltaTime;
          if (block.swapProgress >= 1) {
            block.swapProgress = 1;
          }
        } else if (block.state === 2 /* CLEARING */) {
          anyBlockAnimating = true;
          if (block.clearProgress === void 0) block.clearProgress = 0;
          block.clearProgress += 2.5 * deltaTime;
          if (block.clearProgress >= 1) {
            block.type = -1;
            block.state = 0 /* IDLE */;
            block.clearProgress = void 0;
          }
        }
      }
    }
    if (!anyBlockAnimating) {
      let blocksNeedGravityOrFill = false;
      for (let y = 0; y < this.config.gridSizeY; y++) {
        for (let x = 0; x < this.config.gridSizeX; x++) {
          if (this.grid[y][x].type === -1) {
            blocksNeedGravityOrFill = true;
            break;
          }
        }
        if (blocksNeedGravityOrFill) break;
      }
      if (blocksNeedGravityOrFill) {
        this.applyGravity();
        this.fillNewBlocks();
      } else {
        const matchedCoordinates = this.findMatches();
        if (matchedCoordinates.length > 0) {
          this.playSound("match");
          this.score += matchedCoordinates.length * 10;
          for (const { x, y } of matchedCoordinates) {
            this.grid[y][x].state = 2 /* CLEARING */;
            this.grid[y][x].clearProgress = 0;
          }
        }
      }
    }
  }
  findMatches() {
    const matches = [];
    const matchedGrid = Array.from(
      { length: this.config.gridSizeY },
      () => Array(this.config.gridSizeX).fill(false)
    );
    for (let y = 0; y < this.config.gridSizeY; y++) {
      for (let x = 0; x < this.config.gridSizeX - (this.config.matchLength - 1); x++) {
        const blockType = this.grid[y][x].type;
        if (blockType === -1) continue;
        let matchCount = 1;
        for (let i = 1; i < this.config.matchLength; i++) {
          if (this.grid[y][x + i] && this.grid[y][x + i].type === blockType) {
            matchCount++;
          } else {
            break;
          }
        }
        if (matchCount >= this.config.matchLength) {
          for (let i = 0; i < matchCount; i++) {
            if (!matchedGrid[y][x + i]) {
              matches.push({ x: x + i, y });
              matchedGrid[y][x + i] = true;
            }
          }
        }
      }
    }
    for (let x = 0; x < this.config.gridSizeX; x++) {
      for (let y = 0; y < this.config.gridSizeY - (this.config.matchLength - 1); y++) {
        const blockType = this.grid[y][x].type;
        if (blockType === -1) continue;
        let matchCount = 1;
        for (let i = 1; i < this.config.matchLength; i++) {
          if (this.grid[y + i] && this.grid[y + i][x] && this.grid[y + i][x].type === blockType) {
            matchCount++;
          } else {
            break;
          }
        }
        if (matchCount >= this.config.matchLength) {
          for (let i = 0; i < matchCount; i++) {
            if (!matchedGrid[y + i][x]) {
              matches.push({ x, y: y + i });
              matchedGrid[y + i][x] = true;
            }
          }
        }
      }
    }
    return matches;
  }
  applyGravity() {
    for (let x = 0; x < this.config.gridSizeX; x++) {
      let emptySpots = [];
      for (let y = this.config.gridSizeY - 1; y >= 0; y--) {
        const block = this.grid[y][x];
        if (block.type === -1) {
          emptySpots.push(y);
        } else if (emptySpots.length > 0) {
          const targetY = emptySpots.shift();
          this.grid[targetY][x] = { ...block, x, y, targetY, state: 3 /* FALLING */ };
          this.grid[y][x] = { type: -1, x, y, targetY: y, state: 0 /* IDLE */ };
          emptySpots.push(y);
        }
      }
    }
  }
  fillNewBlocks() {
    for (let y = 0; y < this.config.gridSizeY; y++) {
      for (let x = 0; x < this.config.gridSizeX; x++) {
        if (this.grid[y][x].type === -1) {
          const newBlockType = Math.floor(Math.random() * this.activeBlockTypes);
          this.grid[y][x] = {
            type: newBlockType,
            x,
            y: y - this.config.gridSizeY,
            // Start above the screen by a few block heights
            targetY: y,
            state: 3 /* FALLING */
          };
        }
      }
    }
  }
  updateDifficulty() {
    if (!this.config.difficultySettings || this.config.difficultySettings.length === 0) {
      return;
    }
    const nextDifficultyIndex = this.currentDifficultyLevel + 1;
    if (nextDifficultyIndex < this.config.difficultySettings.length) {
      const nextDifficulty = this.config.difficultySettings[nextDifficultyIndex];
      if (this.score >= nextDifficulty.scoreThreshold) {
        this.currentDifficultyLevel = nextDifficultyIndex;
        if (nextDifficulty.gravityModifier) {
          this.gravitySpeed = this.baseGravitySpeed * nextDifficulty.gravityModifier;
        }
        if (this.activeBlockTypes < this.config.numBlockTypes && Math.random() < nextDifficulty.newBlockTypeChance) {
          this.activeBlockTypes++;
          console.log(`Difficulty increased! Active block types: ${this.activeBlockTypes}, Gravity: ${this.gravitySpeed}`);
        }
      }
    }
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBackground();
    this.buttons = [];
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 1 /* INSTRUCTIONS */:
        this.drawInstructionsScreen();
        break;
      case 2 /* PLAYING */:
        this.drawGameScreen();
        break;
      case 3 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawBackground() {
    const bgImage = this.assets.images.get("background");
    if (bgImage && bgImage.width > 0) {
      this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "#333";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
  drawTitleScreen() {
    this.ctx.fillStyle = "#FFF";
    this.ctx.font = "48px Arial";
    this.ctx.fillText(this.config.texts.title, this.canvas.width / 2, this.canvas.height / 3);
    this.drawButton(this.canvas.width / 2, this.canvas.height / 2, 200, 60, this.config.texts.playButton, () => {
      this.gameState = 2 /* PLAYING */;
      this.initGameVariables();
      this.playSound("click");
      if (this.bgm) {
        this.bgm.play().catch((e) => console.error("BGM play failed:", e));
      }
    });
    this.drawButton(this.canvas.width / 2, this.canvas.height / 2 + 80, 200, 60, this.config.texts.instructionsButton, () => {
      this.gameState = 1 /* INSTRUCTIONS */;
      this.playSound("click");
    });
  }
  drawInstructionsScreen() {
    this.ctx.fillStyle = "#FFF";
    this.ctx.font = "36px Arial";
    this.ctx.fillText("\uC870\uC791\uBC95", this.canvas.width / 2, this.canvas.height / 4);
    this.ctx.font = "20px Arial";
    let yOffset = this.canvas.height / 3;
    for (const line of this.config.texts.instructions) {
      this.ctx.fillText(line, this.canvas.width / 2, yOffset);
      yOffset += 30;
    }
    this.drawButton(this.canvas.width / 2, this.canvas.height * 0.8, 150, 50, this.config.texts.backButton, () => {
      this.gameState = 0 /* TITLE */;
      this.playSound("click");
    });
  }
  drawGameScreen() {
    const boardOffsetX = (this.canvas.width - this.config.gridSizeX * this.config.blockSize) / 2;
    const boardOffsetY = (this.canvas.height - this.config.gridSizeY * this.config.blockSize) / 2 + 50;
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    this.ctx.lineWidth = 1;
    for (let y = 0; y <= this.config.gridSizeY; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(boardOffsetX, boardOffsetY + y * this.config.blockSize);
      this.ctx.lineTo(boardOffsetX + this.config.gridSizeX * this.config.blockSize, boardOffsetY + y * this.config.blockSize);
      this.ctx.stroke();
    }
    for (let x = 0; x <= this.config.gridSizeX; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(boardOffsetX + x * this.config.blockSize, boardOffsetY);
      this.ctx.lineTo(boardOffsetX + x * this.config.blockSize, boardOffsetY + this.config.gridSizeY * this.config.blockSize);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.config.gridSizeY; y++) {
      for (let x = 0; x < this.config.gridSizeX; x++) {
        const block = this.grid[y][x];
        if (block.type === -1) continue;
        let drawX = boardOffsetX + block.x * this.config.blockSize;
        let drawY = boardOffsetY + block.y * this.config.blockSize;
        if (block.state === 1 /* SWAPPING */) {
          const startX = boardOffsetX + block.x * this.config.blockSize;
          const startY = boardOffsetY + block.y * this.config.blockSize;
          const endX = boardOffsetX + (block.swapTargetX || block.x) * this.config.blockSize;
          const endY = boardOffsetY + (block.swapTargetY || block.y) * this.config.blockSize;
          drawX = startX + (endX - startX) * (block.swapProgress || 0);
          drawY = startY + (endY - startY) * (block.swapProgress || 0);
        } else if (block.state === 2 /* CLEARING */) {
          const scale = 1 - (block.clearProgress || 0);
          const halfBlock = this.config.blockSize / 2;
          const scaledSize = this.config.blockSize * scale;
          const offset = halfBlock * (1 - scale);
          drawX += offset;
          drawY += offset;
          this.drawBlock(block.type, drawX, drawY, scaledSize, scaledSize);
          continue;
        }
        this.drawBlock(block.type, drawX, drawY);
      }
    }
    if (this.selectedBlock) {
      const highlightX = boardOffsetX + this.selectedBlock.x * this.config.blockSize;
      const highlightY = boardOffsetY + this.selectedBlock.y * this.config.blockSize;
      const selectionImage = this.assets.images.get("selection");
      if (selectionImage && selectionImage.width > 0) {
        this.ctx.drawImage(selectionImage, highlightX, highlightY, this.config.blockSize, this.config.blockSize);
      } else {
        this.ctx.strokeStyle = "lime";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(highlightX, highlightY, this.config.blockSize, this.config.blockSize);
      }
    }
    this.ctx.fillStyle = "#FFF";
    this.ctx.font = "28px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`Score: ${this.score}`, 20, 40);
    this.ctx.textAlign = "right";
    this.ctx.fillText(`Time: ${Math.max(0, Math.floor(this.timeLeft))}`, this.canvas.width - 20, 40);
    this.ctx.textAlign = "center";
  }
  drawBlock(type, x, y, width, height) {
    const blockWidth = width || this.config.blockSize;
    const blockHeight = height || this.config.blockSize;
    const imageName = `block_${type}`;
    const blockImage = this.assets.images.get(imageName);
    if (blockImage && blockImage.width > 0) {
      this.ctx.drawImage(blockImage, x, y, blockWidth, blockHeight);
    } else {
      const colors = ["red", "blue", "green", "yellow", "purple", "orange"];
      this.ctx.fillStyle = colors[type % colors.length];
      this.ctx.fillRect(x, y, blockWidth, blockHeight);
      this.ctx.strokeStyle = "#000";
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(x, y, blockWidth, blockHeight);
    }
  }
  drawGameOverScreen() {
    this.ctx.fillStyle = "#FFF";
    this.ctx.font = "48px Arial";
    this.ctx.fillText(this.config.texts.gameOver, this.canvas.width / 2, this.canvas.height / 3);
    this.ctx.font = "36px Arial";
    this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
    this.drawButton(this.canvas.width / 2, this.canvas.height * 0.7, 200, 60, this.config.texts.retryButton, () => {
      this.gameState = 2 /* PLAYING */;
      this.initGameVariables();
      this.playSound("click");
      if (this.bgm) {
        this.bgm.play().catch((e) => console.error("BGM play failed:", e));
      }
    });
    this.drawButton(this.canvas.width / 2, this.canvas.height * 0.7 + 80, 200, 60, this.config.texts.backButton, () => {
      this.gameState = 0 /* TITLE */;
      this.playSound("click");
    });
  }
  drawButton(x, y, width, height, text, onClick) {
    const btnX = x - width / 2;
    const btnY = y - height / 2;
    this.ctx.fillStyle = "#666";
    this.ctx.fillRect(btnX, btnY, width, height);
    this.ctx.strokeStyle = "#FFF";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(btnX, btnY, width, height);
    this.ctx.fillStyle = "#FFF";
    this.ctx.font = "28px Arial";
    this.ctx.fillText(text, x, y);
    this.buttons.push({ x: btnX, y: btnY, width, height, onClick });
  }
  playSound(name) {
    const audio = this.assets.sounds.get(name);
    if (audio) {
      const clonedAudio = audio.cloneNode();
      clonedAudio.volume = audio.volume;
      clonedAudio.play().catch((e) => console.error(`Failed to play sound ${name}:`, e));
    }
  }
  handleBlockClick(x, y) {
    if (this.selectedBlock === null) {
      this.selectedBlock = { x, y };
    } else {
      const dx = Math.abs(x - this.selectedBlock.x);
      const dy = Math.abs(y - this.selectedBlock.y);
      if (dx === 1 && dy === 0 || dx === 0 && dy === 1) {
        this.performSwap(this.selectedBlock.x, this.selectedBlock.y, x, y);
      }
      this.selectedBlock = null;
    }
  }
  performSwap(x1, y1, x2, y2) {
    const block1 = this.grid[y1][x1];
    const block2 = this.grid[y2][x2];
    block1.state = 1 /* SWAPPING */;
    block1.swapTargetX = x2;
    block1.swapTargetY = y2;
    block1.swapProgress = 0;
    block2.state = 1 /* SWAPPING */;
    block2.swapTargetX = x1;
    block2.swapTargetY = y1;
    block2.swapProgress = 0;
    this.playSound("swap");
    setTimeout(() => {
      [this.grid[y1][x1], this.grid[y2][x2]] = [this.grid[y2][x2], this.grid[y1][x1]];
      block1.x = x2;
      block1.y = y2;
      block2.x = x1;
      block2.y = y1;
      const matches = this.findMatches();
      if (matches.length === 0) {
        this.playSound("swap");
        block1.state = 1 /* SWAPPING */;
        block1.swapTargetX = x1;
        block1.swapTargetY = y1;
        block1.swapProgress = 0;
        block2.state = 1 /* SWAPPING */;
        block2.swapTargetX = x2;
        block2.swapTargetY = y2;
        block2.swapProgress = 0;
        setTimeout(() => {
          [this.grid[y1][x1], this.grid[y2][x2]] = [this.grid[y2][x2], this.grid[y1][x1]];
          block1.x = x1;
          block1.y = y1;
          block2.x = x2;
          block2.y = y2;
          block1.state = 0 /* IDLE */;
          block2.state = 0 /* IDLE */;
          block1.swapTargetX = void 0;
          block1.swapTargetY = void 0;
          block1.swapProgress = void 0;
          block2.swapTargetX = void 0;
          block2.swapTargetY = void 0;
          block2.swapProgress = void 0;
        }, 400);
      } else {
        block1.state = 0 /* IDLE */;
        block2.state = 0 /* IDLE */;
        block1.swapTargetX = void 0;
        block1.swapTargetY = void 0;
        block1.swapProgress = void 0;
        block2.swapTargetX = void 0;
        block2.swapTargetY = void 0;
        block2.swapProgress = void 0;
      }
    }, 400);
  }
}
window.onload = () => {
  const game = new Game("gameCanvas");
  game.start().catch((e) => console.error("Game failed to start:", e));
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgZ3JpZFNpemVYOiBudW1iZXI7XHJcbiAgICBncmlkU2l6ZVk6IG51bWJlcjtcclxuICAgIGJsb2NrU2l6ZTogbnVtYmVyO1xyXG4gICAgbnVtQmxvY2tUeXBlczogbnVtYmVyO1xyXG4gICAgbWF0Y2hMZW5ndGg6IG51bWJlcjtcclxuICAgIGdhbWVEdXJhdGlvblNlY29uZHM6IG51bWJlcjtcclxuICAgIGdyYXZpdHlTcGVlZDogbnVtYmVyOyAvLyBQaXhlbHMgcGVyIHNlY29uZCBmb3IgZmFsbGluZyBibG9ja3NcclxuICAgIGRpZmZpY3VsdHlTZXR0aW5nczoge1xyXG4gICAgICAgIHNjb3JlVGhyZXNob2xkOiBudW1iZXI7XHJcbiAgICAgICAgbmV3QmxvY2tUeXBlQ2hhbmNlOiBudW1iZXI7IC8vIENoYW5jZSAoMC0xKSB0byBpbnRyb2R1Y2UgYSBuZXcgYmxvY2sgdHlwZSB3aGVuIGNyb3NzaW5nIHRocmVzaG9sZFxyXG4gICAgICAgIGdyYXZpdHlNb2RpZmllcjogbnVtYmVyOyAvLyBNdWx0aXBsaWVyIGZvciBncmF2aXR5U3BlZWRcclxuICAgIH1bXTtcclxuICAgIGluaXRpYWxCbG9ja1R5cGVzOiBudW1iZXI7IC8vIEhvdyBtYW55IGJsb2NrIHR5cGVzIGFyZSBhdmFpbGFibGUgYXQgdGhlIHN0YXJ0XHJcbiAgICB0ZXh0czoge1xyXG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgaW5zdHJ1Y3Rpb25zOiBzdHJpbmdbXTtcclxuICAgICAgICBnYW1lT3Zlcjogc3RyaW5nO1xyXG4gICAgICAgIHBsYXlCdXR0b246IHN0cmluZztcclxuICAgICAgICBpbnN0cnVjdGlvbnNCdXR0b246IHN0cmluZztcclxuICAgICAgICBiYWNrQnV0dG9uOiBzdHJpbmc7XHJcbiAgICAgICAgcmV0cnlCdXR0b246IHN0cmluZztcclxuICAgIH07XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyOyB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTG9hZGVkQXNzZXRzIHtcclxuICAgIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD47XHJcbiAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIElOU1RSVUNUSU9OUyxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVJcclxufVxyXG5cclxuZW51bSBCbG9ja1N0YXRlIHtcclxuICAgIElETEUsXHJcbiAgICBTV0FQUElORyxcclxuICAgIENMRUFSSU5HLFxyXG4gICAgRkFMTElOR1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQmxvY2sge1xyXG4gICAgdHlwZTogbnVtYmVyOyAvLyAtMSBmb3IgY2xlYXJlZC9lbXB0eSwgMCB0byBudW1CbG9ja1R5cGVzLTFcclxuICAgIHg6IG51bWJlcjsgLy8gQ3VycmVudCBncmlkIHhcclxuICAgIHk6IG51bWJlcjsgLy8gQ3VycmVudCBhbmltYXRlZCB5LXBvc2l0aW9uIGluIGdyaWQgdW5pdHMgKGNhbiBiZSBmbG9hdCBkdXJpbmcgZmFsbGluZylcclxuICAgIHRhcmdldFk6IG51bWJlcjsgLy8gVGFyZ2V0IHktcG9zaXRpb24gaW4gZ3JpZCB1bml0cyAoaW50ZWdlcikgZm9yIGZhbGxpbmdcclxuICAgIHN0YXRlOiBCbG9ja1N0YXRlO1xyXG4gICAgc3dhcFRhcmdldFg/OiBudW1iZXI7IC8vIFRhcmdldCB4IGZvciBzd2FwcGluZyBhbmltYXRpb25cclxuICAgIHN3YXBUYXJnZXRZPzogbnVtYmVyOyAvLyBUYXJnZXQgeSBmb3Igc3dhcHBpbmcgYW5pbWF0aW9uXHJcbiAgICBzd2FwUHJvZ3Jlc3M/OiBudW1iZXI7IC8vIDAgdG8gMSBmb3Igc3dhcCBhbmltYXRpb25cclxuICAgIGNsZWFyUHJvZ3Jlc3M/OiBudW1iZXI7IC8vIDAgdG8gMSBmb3IgY2xlYXIgYW5pbWF0aW9uIChzY2FsaW5nIGRvd24pXHJcbn1cclxuXHJcbmludGVyZmFjZSBTZWxlY3RlZEJsb2NrIHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBhc3NldHMhOiBMb2FkZWRBc3NldHM7XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIHByaXZhdGUgbGFzdEZyYW1lVGltZSA9IDA7XHJcblxyXG4gICAgLy8gR2FtZSB2YXJpYWJsZXNcclxuICAgIHByaXZhdGUgZ3JpZDogQmxvY2tbXVtdID0gW107XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB0aW1lTGVmdDogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgc2VsZWN0ZWRCbG9jazogU2VsZWN0ZWRCbG9jayB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50RGlmZmljdWx0eUxldmVsOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBhY3RpdmVCbG9ja1R5cGVzOiBudW1iZXIgPSAwOyAvLyBOdW1iZXIgb2YgYmxvY2sgdHlwZXMgY3VycmVudGx5IGluIHBsYXlcclxuXHJcbiAgICBwcml2YXRlIGdyYXZpdHlTcGVlZDogbnVtYmVyID0gMDsgLy8gQ3VycmVudCBncmF2aXR5IHNwZWVkIGluIHBpeGVscy9zZWNcclxuICAgIHByaXZhdGUgYmFzZUdyYXZpdHlTcGVlZDogbnVtYmVyID0gMDsgLy8gQmFzZSBzcGVlZCBmcm9tIGNvbmZpZ1xyXG5cclxuICAgIC8vIEF1ZGlvXHJcbiAgICBwcml2YXRlIGJnbTogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIC8vIFVJIEJ1dHRvbnMgZm9yIGNsaWNrIGRldGVjdGlvblxyXG4gICAgcHJpdmF0ZSBidXR0b25zOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgb25DbGljazogKCkgPT4gdm9pZCB9W10gPSBbXTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNsaWNrKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgYXN5bmMgc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQ29uZmlnKCk7XHJcbiAgICAgICAgdGhpcy5zZXR1cENhbnZhcygpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG4gICAgICAgIHRoaXMuaW5pdEdhbWVWYXJpYWJsZXMoKTtcclxuICAgICAgICB0aGlzLmJnbSA9IHRoaXMuYXNzZXRzLnNvdW5kcy5nZXQoJ2JnbScpIHx8IG51bGw7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtLmxvb3AgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmJnbS52b2x1bWUgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lIHx8IDAuNTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwQ2FudmFzKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jb25maWcuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7IC8vIFVzZSBhIGJhc2ljIGZvbnRcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxbc3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50XT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgICAgIGltYWdlLnNyYyA9IGltZy5wYXRoO1xyXG4gICAgICAgICAgICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4gcmVzb2x2ZShbaW1nLm5hbWUsIGltYWdlXSk7XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5vbmVycm9yID0gKGUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWcucGF0aH1gLCBlKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBSZXNvbHZlIHdpdGggYSBkdW1teSBpbWFnZSBvciBudWxsIHRvIGFsbG93IGdhbWUgdG8gcHJvY2VlZFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGR1bW15SW1hZ2UgPSBuZXcgSW1hZ2UoKTsgLy8gRmFsbGJhY2tcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKFtpbWcubmFtZSwgZHVtbXlJbWFnZV0pO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzbmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8W3N0cmluZywgSFRNTEF1ZGlvRWxlbWVudF0+KChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8uc3JjID0gc25kLnBhdGg7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzbmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9hZCgpOyAvLyBQcmVsb2FkIGF1ZGlvXHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKGUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzbmQucGF0aH1gLCBlKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKFtzbmQubmFtZSwgYXVkaW9dKTsgLy8gUmVzb2x2ZSBldmVuIGlmIGxvYWQgZmFpbHMsIHRvIGxldCBnYW1lIHN0YXJ0XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBsb2FkZWRJbWFnZXMgPSBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcclxuICAgICAgICBjb25zdCBsb2FkZWRTb3VuZHMgPSBhd2FpdCBQcm9taXNlLmFsbChzb3VuZFByb21pc2VzKTtcclxuXHJcbiAgICAgICAgdGhpcy5hc3NldHMgPSB7XHJcbiAgICAgICAgICAgIGltYWdlczogbmV3IE1hcChsb2FkZWRJbWFnZXMpLFxyXG4gICAgICAgICAgICBzb3VuZHM6IG5ldyBNYXAobG9hZGVkU291bmRzKVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0R2FtZVZhcmlhYmxlcygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLnRpbWVMZWZ0ID0gdGhpcy5jb25maWcuZ2FtZUR1cmF0aW9uU2Vjb25kcztcclxuICAgICAgICB0aGlzLnNlbGVjdGVkQmxvY2sgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuY3VycmVudERpZmZpY3VsdHlMZXZlbCA9IDA7XHJcbiAgICAgICAgdGhpcy5hY3RpdmVCbG9ja1R5cGVzID0gdGhpcy5jb25maWcuaW5pdGlhbEJsb2NrVHlwZXM7XHJcbiAgICAgICAgdGhpcy5iYXNlR3Jhdml0eVNwZWVkID0gdGhpcy5jb25maWcuZ3Jhdml0eVNwZWVkO1xyXG4gICAgICAgIHRoaXMuZ3Jhdml0eVNwZWVkID0gdGhpcy5iYXNlR3Jhdml0eVNwZWVkO1xyXG5cclxuICAgICAgICB0aGlzLmluaXRHcmlkKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBpbml0R3JpZCgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdyaWQgPSBbXTtcclxuICAgICAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHRoaXMuY29uZmlnLmdyaWRTaXplWTsgeSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JpZC5wdXNoKFtdKTtcclxuICAgICAgICAgICAgZm9yIChsZXQgeCA9IDA7IHggPCB0aGlzLmNvbmZpZy5ncmlkU2l6ZVg7IHgrKykge1xyXG4gICAgICAgICAgICAgICAgLy8gSW5pdGlhbGl6ZSBibG9ja3Mgd2l0aCB5IHBvc2l0aW9uIHNsaWdodGx5IGFib3ZlIHRoZWlyIHRhcmdldCAoZm9yIGluaXRpYWwgZmFsbClcclxuICAgICAgICAgICAgICAgIHRoaXMuZ3JpZFt5XS5wdXNoKHRoaXMuY3JlYXRlUmFuZG9tQmxvY2soeCwgeSAtIHRoaXMuY29uZmlnLmdyaWRTaXplWSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIExldCB0aGVtIGZhbGwgaW50byBwbGFjZSBpbml0aWFsbHlcclxuICAgICAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHRoaXMuY29uZmlnLmdyaWRTaXplWTsgeSsrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgdGhpcy5jb25maWcuZ3JpZFNpemVYOyB4KyspIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ3JpZFt5XVt4XS50YXJnZXRZID0geTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ3JpZFt5XVt4XS5zdGF0ZSA9IEJsb2NrU3RhdGUuRkFMTElORztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBSZXNvbHZlIGluaXRpYWwgbWF0Y2hlcyBhZnRlciBibG9ja3MgaGF2ZSBmYWxsZW4gKHRoaXMgbmVlZHMgYSBzbWFsbCBkZWxheSBvciBsb29wIHRocm91Z2ggdXBkYXRlcylcclxuICAgICAgICAvLyBGb3Igc2ltcGxpY2l0eSwgd2UgY2FuIGxldCB0aGUgZ2FtZSBsb29wIHNvcnQgaXQgb3V0IG9uIGZpcnN0IGZldyBmcmFtZXMsIG9yIHJlZ2VuZXJhdGUgZXhwbGljaXRseS5cclxuICAgICAgICAvLyBMZXQncyByZXNvbHZlIGltbWVkaWF0ZWx5LCBidXQgZW5zdXJlIHRoZXkgZG9uJ3QgZmFsbCBmcm9tIGFib3ZlIHNjcmVlbiBhZ2Fpbi5cclxuICAgICAgICBsZXQgbWF0Y2hlc0ZvdW5kID0gdHJ1ZTtcclxuICAgICAgICB3aGlsZSAobWF0Y2hlc0ZvdW5kKSB7XHJcbiAgICAgICAgICAgIG1hdGNoZXNGb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zdCBtYXRjaGVkQ29vcmRpbmF0ZXMgPSB0aGlzLmZpbmRNYXRjaGVzKCk7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaGVkQ29vcmRpbmF0ZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICAgICAgbWF0Y2hlc0ZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgeyB4LCB5IH0gb2YgbWF0Y2hlZENvb3JkaW5hdGVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gUmVwbGFjZSBpbW1lZGlhdGVseSwgbm90IGJ5IGZhbGxpbmdcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdyaWRbeV1beF0gPSB0aGlzLmNyZWF0ZVJhbmRvbUJsb2NrKHgsIHkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlUmFuZG9tQmxvY2soeDogbnVtYmVyLCB5OiBudW1iZXIpOiBCbG9jayB7XHJcbiAgICAgICAgY29uc3QgdHlwZSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRoaXMuYWN0aXZlQmxvY2tUeXBlcyk7XHJcbiAgICAgICAgcmV0dXJuIHsgdHlwZSwgeCwgeSwgdGFyZ2V0WTogeSwgc3RhdGU6IEJsb2NrU3RhdGUuSURMRSB9O1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AgPSAoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApOiB2b2lkID0+IHtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RGcmFtZVRpbWUpIC8gMTAwMDsgLy8gaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyKCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMudGltZUxlZnQgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudGltZUxlZnQgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGltZUxlZnQgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnZ2FtZV9vdmVyJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuYmdtKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYmdtLnBhdXNlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYmdtLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVEaWZmaWN1bHR5KCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZUJsb2NrcyhkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIC8vIE5vIHVwZGF0ZXMgbmVlZGVkIGZvciBUSVRMRSwgSU5TVFJVQ1RJT05TLCBHQU1FX09WRVIgc3RhdGVzIGJleW9uZCBpbnB1dFxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUJsb2NrcyhkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGxldCBhbnlCbG9ja0FuaW1hdGluZyA9IGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgYWxsIGJsb2NrIGFuaW1hdGlvbnMgKGZhbGxpbmcsIHN3YXBwaW5nLCBjbGVhcmluZylcclxuICAgICAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHRoaXMuY29uZmlnLmdyaWRTaXplWTsgeSsrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgdGhpcy5jb25maWcuZ3JpZFNpemVYOyB4KyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrID0gdGhpcy5ncmlkW3ldW3hdO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChibG9jay5zdGF0ZSA9PT0gQmxvY2tTdGF0ZS5GQUxMSU5HKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYW55QmxvY2tBbmltYXRpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJsb2NrLnkgKz0gdGhpcy5ncmF2aXR5U3BlZWQgKiBkZWx0YVRpbWUgLyB0aGlzLmNvbmZpZy5ibG9ja1NpemU7IC8vIEZhbGwgYnkgZnJhY3Rpb24gb2YgYmxvY2sgc2l6ZVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChibG9jay55ID49IGJsb2NrLnRhcmdldFkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmxvY2sueSA9IGJsb2NrLnRhcmdldFk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJsb2NrLnN0YXRlID0gQmxvY2tTdGF0ZS5JRExFO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYmxvY2suc3RhdGUgPT09IEJsb2NrU3RhdGUuU1dBUFBJTkcpIHtcclxuICAgICAgICAgICAgICAgICAgICBhbnlCbG9ja0FuaW1hdGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJsb2NrLnN3YXBQcm9ncmVzcyA9PT0gdW5kZWZpbmVkKSBibG9jay5zd2FwUHJvZ3Jlc3MgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIGJsb2NrLnN3YXBQcm9ncmVzcyArPSAyLjUgKiBkZWx0YVRpbWU7IC8vIEZhc3RlciBzd2FwIGFuaW1hdGlvbiBzcGVlZFxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChibG9jay5zd2FwUHJvZ3Jlc3MgPj0gMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBibG9jay5zd2FwUHJvZ3Jlc3MgPSAxO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgYWN0dWFsIGdyaWQgc3dhcCBhbmQgbWF0Y2ggY2hlY2sgaXMgaGFuZGxlZCBieSBgcGVyZm9ybVN3YXBgJ3Mgc2V0VGltZW91dFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIGJsb2NrIHdpbGwgdHJhbnNpdGlvbiB0byBJRExFIG9yIGJhY2sgdG8gU1dBUFBJTkcgKGZvciBzd2FwIGJhY2spIGJ5IGBwZXJmb3JtU3dhcGAuXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChibG9jay5zdGF0ZSA9PT0gQmxvY2tTdGF0ZS5DTEVBUklORykge1xyXG4gICAgICAgICAgICAgICAgICAgIGFueUJsb2NrQW5pbWF0aW5nID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYmxvY2suY2xlYXJQcm9ncmVzcyA9PT0gdW5kZWZpbmVkKSBibG9jay5jbGVhclByb2dyZXNzID0gMDtcclxuICAgICAgICAgICAgICAgICAgICBibG9jay5jbGVhclByb2dyZXNzICs9IDIuNSAqIGRlbHRhVGltZTsgLy8gRmFzdGVyIGNsZWFyIGFuaW1hdGlvbiBzcGVlZFxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChibG9jay5jbGVhclByb2dyZXNzID49IDEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmxvY2sudHlwZSA9IC0xOyAvLyBNYXJrIGFzIGNsZWFyZWRcclxuICAgICAgICAgICAgICAgICAgICAgICAgYmxvY2suc3RhdGUgPSBCbG9ja1N0YXRlLklETEU7IC8vIFRyYW5zaXRpb24gdG8gSURMRSBhZnRlciBjbGVhcmluZyBhbmltYXRpb25cclxuICAgICAgICAgICAgICAgICAgICAgICAgYmxvY2suY2xlYXJQcm9ncmVzcyA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE9ubHkgcHJvY2VzcyBnYW1lIGxvZ2ljIChncmF2aXR5LCBuZXcgYmxvY2tzLCBtYXRjaGVzKSBpZiBubyBibG9ja3MgYXJlIGFuaW1hdGluZ1xyXG4gICAgICAgIGlmICghYW55QmxvY2tBbmltYXRpbmcpIHtcclxuICAgICAgICAgICAgbGV0IGJsb2Nrc05lZWRHcmF2aXR5T3JGaWxsID0gZmFsc2U7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBjbGVhcmVkIGJsb2Nrc1xyXG4gICAgICAgICAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHRoaXMuY29uZmlnLmdyaWRTaXplWTsgeSsrKSB7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8IHRoaXMuY29uZmlnLmdyaWRTaXplWDsgeCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZ3JpZFt5XVt4XS50eXBlID09PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBibG9ja3NOZWVkR3Jhdml0eU9yRmlsbCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGlmIChibG9ja3NOZWVkR3Jhdml0eU9yRmlsbCkgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChibG9ja3NOZWVkR3Jhdml0eU9yRmlsbCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseUdyYXZpdHkoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbE5ld0Jsb2NrcygpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gSWYgbm8gYmxvY2tzIG5lZWRlZCBncmF2aXR5L2ZpbGwsIGNoZWNrIGZvciBuZXcgbWF0Y2hlcyAoY2FzY2FkZXMpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVkQ29vcmRpbmF0ZXMgPSB0aGlzLmZpbmRNYXRjaGVzKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlZENvb3JkaW5hdGVzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnbWF0Y2gnKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IG1hdGNoZWRDb29yZGluYXRlcy5sZW5ndGggKiAxMDtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHsgeCwgeSB9IG9mIG1hdGNoZWRDb29yZGluYXRlcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdyaWRbeV1beF0uc3RhdGUgPSBCbG9ja1N0YXRlLkNMRUFSSU5HO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdyaWRbeV1beF0uY2xlYXJQcm9ncmVzcyA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZmluZE1hdGNoZXMoKTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9W10ge1xyXG4gICAgICAgIGNvbnN0IG1hdGNoZXM6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfVtdID0gW107XHJcbiAgICAgICAgY29uc3QgbWF0Y2hlZEdyaWQ6IGJvb2xlYW5bXVtdID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogdGhpcy5jb25maWcuZ3JpZFNpemVZIH0sICgpID0+XHJcbiAgICAgICAgICAgIEFycmF5KHRoaXMuY29uZmlnLmdyaWRTaXplWCkuZmlsbChmYWxzZSlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBDaGVjayBob3Jpem9udGFsIG1hdGNoZXNcclxuICAgICAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHRoaXMuY29uZmlnLmdyaWRTaXplWTsgeSsrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgdGhpcy5jb25maWcuZ3JpZFNpemVYIC0gKHRoaXMuY29uZmlnLm1hdGNoTGVuZ3RoIC0gMSk7IHgrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmxvY2tUeXBlID0gdGhpcy5ncmlkW3ldW3hdLnR5cGU7XHJcbiAgICAgICAgICAgICAgICBpZiAoYmxvY2tUeXBlID09PSAtMSkgY29udGludWU7IC8vIFNraXAgY2xlYXJlZCBibG9ja3NcclxuXHJcbiAgICAgICAgICAgICAgICBsZXQgbWF0Y2hDb3VudCA9IDE7XHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IHRoaXMuY29uZmlnLm1hdGNoTGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5ncmlkW3ldW3ggKyBpXSAmJiB0aGlzLmdyaWRbeV1beCArIGldLnR5cGUgPT09IGJsb2NrVHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoQ291bnQgPj0gdGhpcy5jb25maWcubWF0Y2hMZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGNoQ291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW1hdGNoZWRHcmlkW3ldW3ggKyBpXSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKHsgeDogeCArIGksIHkgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkR3JpZFt5XVt4ICsgaV0gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDaGVjayB2ZXJ0aWNhbCBtYXRjaGVzXHJcbiAgICAgICAgZm9yIChsZXQgeCA9IDA7IHggPCB0aGlzLmNvbmZpZy5ncmlkU2l6ZVg7IHgrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCB5ID0gMDsgeSA8IHRoaXMuY29uZmlnLmdyaWRTaXplWSAtICh0aGlzLmNvbmZpZy5tYXRjaExlbmd0aCAtIDEpOyB5KyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJsb2NrVHlwZSA9IHRoaXMuZ3JpZFt5XVt4XS50eXBlO1xyXG4gICAgICAgICAgICAgICAgaWYgKGJsb2NrVHlwZSA9PT0gLTEpIGNvbnRpbnVlOyAvLyBTa2lwIGNsZWFyZWQgYmxvY2tzXHJcblxyXG4gICAgICAgICAgICAgICAgbGV0IG1hdGNoQ291bnQgPSAxO1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCB0aGlzLmNvbmZpZy5tYXRjaExlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZ3JpZFt5ICsgaV0gJiYgdGhpcy5ncmlkW3kgKyBpXVt4XSAmJiB0aGlzLmdyaWRbeSArIGldW3hdLnR5cGUgPT09IGJsb2NrVHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXRjaENvdW50Kys7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoQ291bnQgPj0gdGhpcy5jb25maWcubWF0Y2hMZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG1hdGNoQ291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW1hdGNoZWRHcmlkW3kgKyBpXVt4XSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKHsgeCwgeTogeSArIGkgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaGVkR3JpZFt5ICsgaV1beF0gPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXRjaGVzO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXBwbHlHcmF2aXR5KCk6IHZvaWQge1xyXG4gICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgdGhpcy5jb25maWcuZ3JpZFNpemVYOyB4KyspIHtcclxuICAgICAgICAgICAgbGV0IGVtcHR5U3BvdHM6IG51bWJlcltdID0gW107IC8vIFktY29vcmRpbmF0ZXMgb2YgZW1wdHkgc3BvdHMgZnJvbSBib3R0b20gdG8gdG9wXHJcbiAgICAgICAgICAgIGZvciAobGV0IHkgPSB0aGlzLmNvbmZpZy5ncmlkU2l6ZVkgLSAxOyB5ID49IDA7IHktLSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmxvY2sgPSB0aGlzLmdyaWRbeV1beF07XHJcbiAgICAgICAgICAgICAgICBpZiAoYmxvY2sudHlwZSA9PT0gLTEpIHsgLy8gLTEgbWVhbnMgY2xlYXJlZC9lbXB0eVxyXG4gICAgICAgICAgICAgICAgICAgIGVtcHR5U3BvdHMucHVzaCh5KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZW1wdHlTcG90cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gTW92ZSB0aGlzIGJsb2NrIGRvd24gdG8gdGhlIGxvd2VzdCBlbXB0eSBzcG90XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0WSA9IGVtcHR5U3BvdHMuc2hpZnQoKSE7IC8vIEdldCB0aGUgbG93ZXN0IGVtcHR5IHNwb3RcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdyaWRbdGFyZ2V0WV1beF0gPSB7IC4uLmJsb2NrLCB4OiB4LCB5OiB5LCB0YXJnZXRZOiB0YXJnZXRZLCBzdGF0ZTogQmxvY2tTdGF0ZS5GQUxMSU5HIH07XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmlkW3ldW3hdID0geyB0eXBlOiAtMSwgeDogeCwgeTogeSwgdGFyZ2V0WTogeSwgc3RhdGU6IEJsb2NrU3RhdGUuSURMRSB9OyAvLyBUaGUgb3JpZ2luYWwgc3BvdCBpcyBub3cgZW1wdHlcclxuICAgICAgICAgICAgICAgICAgICBlbXB0eVNwb3RzLnB1c2goeSk7IC8vIFRoaXMgc3BvdCBpcyBub3cgZW1wdHlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpbGxOZXdCbG9ja3MoKTogdm9pZCB7XHJcbiAgICAgICAgZm9yIChsZXQgeSA9IDA7IHkgPCB0aGlzLmNvbmZpZy5ncmlkU2l6ZVk7IHkrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8IHRoaXMuY29uZmlnLmdyaWRTaXplWDsgeCsrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5ncmlkW3ldW3hdLnR5cGUgPT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gR2VuZXJhdGUgbmV3IGJsb2NrIGF0IHRoZSB0b3AsXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gc2V0IGl0cyBpbml0aWFsIHkgYWJvdmUgZ3JpZCwgYW5kIHRhcmdldFkgdG8gaXRzIGdyaWQgcG9zaXRpb25cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXdCbG9ja1R5cGUgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmFjdGl2ZUJsb2NrVHlwZXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JpZFt5XVt4XSA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZTogbmV3QmxvY2tUeXBlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB4OiB4LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiB5IC0gKHRoaXMuY29uZmlnLmdyaWRTaXplWSksIC8vIFN0YXJ0IGFib3ZlIHRoZSBzY3JlZW4gYnkgYSBmZXcgYmxvY2sgaGVpZ2h0c1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRZOiB5LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZTogQmxvY2tTdGF0ZS5GQUxMSU5HXHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZURpZmZpY3VsdHkoKTogdm9pZCB7XHJcbiAgICAgICAgLy8gRW5zdXJlIGRpZmZpY3VsdHkgbGV2ZWxzIGFyZSBkZWZpbmVkXHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5kaWZmaWN1bHR5U2V0dGluZ3MgfHwgdGhpcy5jb25maWcuZGlmZmljdWx0eVNldHRpbmdzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBuZXh0RGlmZmljdWx0eUluZGV4ID0gdGhpcy5jdXJyZW50RGlmZmljdWx0eUxldmVsICsgMTtcclxuICAgICAgICBpZiAobmV4dERpZmZpY3VsdHlJbmRleCA8IHRoaXMuY29uZmlnLmRpZmZpY3VsdHlTZXR0aW5ncy5sZW5ndGgpIHsgLy8gRW5zdXJlIHRoZXJlIGlzIGEgbmV4dCBsZXZlbFxyXG4gICAgICAgICAgICBjb25zdCBuZXh0RGlmZmljdWx0eSA9IHRoaXMuY29uZmlnLmRpZmZpY3VsdHlTZXR0aW5nc1tuZXh0RGlmZmljdWx0eUluZGV4XTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuc2NvcmUgPj0gbmV4dERpZmZpY3VsdHkuc2NvcmVUaHJlc2hvbGQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudERpZmZpY3VsdHlMZXZlbCA9IG5leHREaWZmaWN1bHR5SW5kZXg7IC8vIEluY3JlbWVudCBsZXZlbFxyXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgZGlmZmljdWx0eSBjaGFuZ2VzXHJcbiAgICAgICAgICAgICAgICBpZiAobmV4dERpZmZpY3VsdHkuZ3Jhdml0eU1vZGlmaWVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmF2aXR5U3BlZWQgPSB0aGlzLmJhc2VHcmF2aXR5U3BlZWQgKiBuZXh0RGlmZmljdWx0eS5ncmF2aXR5TW9kaWZpZXI7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAvLyBJbnRyb2R1Y2UgbmV3IGJsb2NrIHR5cGVzIGdyYWR1YWxseSwgY2FwcGVkIGJ5IHRvdGFsIG51bUJsb2NrVHlwZXNcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmFjdGl2ZUJsb2NrVHlwZXMgPCB0aGlzLmNvbmZpZy5udW1CbG9ja1R5cGVzICYmIE1hdGgucmFuZG9tKCkgPCBuZXh0RGlmZmljdWx0eS5uZXdCbG9ja1R5cGVDaGFuY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZUJsb2NrVHlwZXMrKztcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRGlmZmljdWx0eSBpbmNyZWFzZWQhIEFjdGl2ZSBibG9jayB0eXBlczogJHt0aGlzLmFjdGl2ZUJsb2NrVHlwZXN9LCBHcmF2aXR5OiAke3RoaXMuZ3Jhdml0eVNwZWVkfWApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmRyYXdCYWNrZ3JvdW5kKCk7XHJcblxyXG4gICAgICAgIC8vIENsZWFyIGJ1dHRvbnMgZm9yIHRoZSBjdXJyZW50IGZyYW1lIHRvIHJlcG9wdWxhdGUgYmFzZWQgb24gZ2FtZSBzdGF0ZVxyXG4gICAgICAgIHRoaXMuYnV0dG9ucyA9IFtdO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3QmFja2dyb3VuZCgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBiZ0ltYWdlID0gdGhpcy5hc3NldHMuaW1hZ2VzLmdldCgnYmFja2dyb3VuZCcpO1xyXG4gICAgICAgIGlmIChiZ0ltYWdlICYmIGJnSW1hZ2Uud2lkdGggPiAwKSB7IC8vIENoZWNrIGlmIGltYWdlIGxvYWRlZCBwcm9wZXJseVxyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmdJbWFnZSwgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyMzMzMnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyNGRkYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnNDhweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dHMudGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMyk7XHJcblxyXG4gICAgICAgIHRoaXMuZHJhd0J1dHRvbih0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsIDIwMCwgNjAsIHRoaXMuY29uZmlnLnRleHRzLnBsYXlCdXR0b24sICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAgICAgdGhpcy5pbml0R2FtZVZhcmlhYmxlcygpOyAvLyBSZS1pbml0aWFsaXplIGZvciBuZXcgZ2FtZVxyXG4gICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnY2xpY2snKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuYmdtKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiQkdNIHBsYXkgZmFpbGVkOlwiLCBlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5kcmF3QnV0dG9uKHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDgwLCAyMDAsIDYwLCB0aGlzLmNvbmZpZy50ZXh0cy5pbnN0cnVjdGlvbnNCdXR0b24sICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnY2xpY2snKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyNGRkYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzZweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1x1Qzg3MFx1Qzc5MVx1QkM5NScsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gNCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBBcmlhbCc7XHJcbiAgICAgICAgbGV0IHlPZmZzZXQgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzO1xyXG4gICAgICAgIGZvciAoY29uc3QgbGluZSBvZiB0aGlzLmNvbmZpZy50ZXh0cy5pbnN0cnVjdGlvbnMpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobGluZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5T2Zmc2V0KTtcclxuICAgICAgICAgICAgeU9mZnNldCArPSAzMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZHJhd0J1dHRvbih0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAqIDAuOCwgMTUwLCA1MCwgdGhpcy5jb25maWcudGV4dHMuYmFja0J1dHRvbiwgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ2NsaWNrJyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBib2FyZE9mZnNldFggPSAodGhpcy5jYW52YXMud2lkdGggLSB0aGlzLmNvbmZpZy5ncmlkU2l6ZVggKiB0aGlzLmNvbmZpZy5ibG9ja1NpemUpIC8gMjtcclxuICAgICAgICBjb25zdCBib2FyZE9mZnNldFkgPSAodGhpcy5jYW52YXMuaGVpZ2h0IC0gdGhpcy5jb25maWcuZ3JpZFNpemVZICogdGhpcy5jb25maWcuYmxvY2tTaXplKSAvIDIgKyA1MDtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBncmlkIGxpbmVzXHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAncmdiYSgyNTUsIDI1NSwgMjU1LCAwLjIpJztcclxuICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAxO1xyXG4gICAgICAgIGZvciAobGV0IHkgPSAwOyB5IDw9IHRoaXMuY29uZmlnLmdyaWRTaXplWTsgeSsrKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmJlZ2luUGF0aCgpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5tb3ZlVG8oYm9hcmRPZmZzZXRYLCBib2FyZE9mZnNldFkgKyB5ICogdGhpcy5jb25maWcuYmxvY2tTaXplKTtcclxuICAgICAgICAgICAgdGhpcy5jdHgubGluZVRvKGJvYXJkT2Zmc2V0WCArIHRoaXMuY29uZmlnLmdyaWRTaXplWCAqIHRoaXMuY29uZmlnLmJsb2NrU2l6ZSwgYm9hcmRPZmZzZXRZICsgeSAqIHRoaXMuY29uZmlnLmJsb2NrU2l6ZSk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKGxldCB4ID0gMDsgeCA8PSB0aGlzLmNvbmZpZy5ncmlkU2l6ZVg7IHgrKykge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5iZWdpblBhdGgoKTtcclxuICAgICAgICAgICAgdGhpcy5jdHgubW92ZVRvKGJvYXJkT2Zmc2V0WCArIHggKiB0aGlzLmNvbmZpZy5ibG9ja1NpemUsIGJvYXJkT2Zmc2V0WSk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmxpbmVUbyhib2FyZE9mZnNldFggKyB4ICogdGhpcy5jb25maWcuYmxvY2tTaXplLCBib2FyZE9mZnNldFkgKyB0aGlzLmNvbmZpZy5ncmlkU2l6ZVkgKiB0aGlzLmNvbmZpZy5ibG9ja1NpemUpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2UoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAobGV0IHkgPSAwOyB5IDwgdGhpcy5jb25maWcuZ3JpZFNpemVZOyB5KyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgeCA9IDA7IHggPCB0aGlzLmNvbmZpZy5ncmlkU2l6ZVg7IHgrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYmxvY2sgPSB0aGlzLmdyaWRbeV1beF07XHJcbiAgICAgICAgICAgICAgICBpZiAoYmxvY2sudHlwZSA9PT0gLTEpIGNvbnRpbnVlOyAvLyBEb24ndCBkcmF3IGNsZWFyZWQgYmxvY2tzXHJcblxyXG4gICAgICAgICAgICAgICAgbGV0IGRyYXdYID0gYm9hcmRPZmZzZXRYICsgYmxvY2sueCAqIHRoaXMuY29uZmlnLmJsb2NrU2l6ZTtcclxuICAgICAgICAgICAgICAgIGxldCBkcmF3WSA9IGJvYXJkT2Zmc2V0WSArIGJsb2NrLnkgKiB0aGlzLmNvbmZpZy5ibG9ja1NpemU7IC8vIFVzZSBjdXJyZW50IGFuaW1hdGVkIHkgZm9yIGZhbGxpbmdcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoYmxvY2suc3RhdGUgPT09IEJsb2NrU3RhdGUuU1dBUFBJTkcpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdGFydFggPSBib2FyZE9mZnNldFggKyBibG9jay54ICogdGhpcy5jb25maWcuYmxvY2tTaXplO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0YXJ0WSA9IGJvYXJkT2Zmc2V0WSArIChibG9jay55ICogdGhpcy5jb25maWcuYmxvY2tTaXplKTsgLy8gVXNlIGN1cnJlbnQgYW5pbWF0ZWQgeSBhcyBzdGFydFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuZFggPSBib2FyZE9mZnNldFggKyAoYmxvY2suc3dhcFRhcmdldFggfHwgYmxvY2sueCkgKiB0aGlzLmNvbmZpZy5ibG9ja1NpemU7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZW5kWSA9IGJvYXJkT2Zmc2V0WSArIChibG9jay5zd2FwVGFyZ2V0WSB8fCBibG9jay55KSAqIHRoaXMuY29uZmlnLmJsb2NrU2l6ZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgZHJhd1ggPSBzdGFydFggKyAoZW5kWCAtIHN0YXJ0WCkgKiAoYmxvY2suc3dhcFByb2dyZXNzIHx8IDApO1xyXG4gICAgICAgICAgICAgICAgICAgIGRyYXdZID0gc3RhcnRZICsgKGVuZFkgLSBzdGFydFkpICogKGJsb2NrLnN3YXBQcm9ncmVzcyB8fCAwKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYmxvY2suc3RhdGUgPT09IEJsb2NrU3RhdGUuQ0xFQVJJTkcpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzY2FsZSA9IDEgLSAoYmxvY2suY2xlYXJQcm9ncmVzcyB8fCAwKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYWxmQmxvY2sgPSB0aGlzLmNvbmZpZy5ibG9ja1NpemUgLyAyO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHNjYWxlZFNpemUgPSB0aGlzLmNvbmZpZy5ibG9ja1NpemUgKiBzY2FsZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBvZmZzZXQgPSBoYWxmQmxvY2sgKiAoMSAtIHNjYWxlKTtcclxuICAgICAgICAgICAgICAgICAgICBkcmF3WCArPSBvZmZzZXQ7XHJcbiAgICAgICAgICAgICAgICAgICAgZHJhd1kgKz0gb2Zmc2V0O1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd0Jsb2NrKGJsb2NrLnR5cGUsIGRyYXdYLCBkcmF3WSwgc2NhbGVkU2l6ZSwgc2NhbGVkU2l6ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7IC8vIFNraXAgbm9ybWFsIGRyYXdpbmcgcGF0aCBmb3IgY2xlYXJpbmcgYmxvY2tzXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdCbG9jayhibG9jay50eXBlLCBkcmF3WCwgZHJhd1kpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IHNlbGVjdGVkIGJsb2NrIGhpZ2hsaWdodFxyXG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGVkQmxvY2spIHtcclxuICAgICAgICAgICAgY29uc3QgaGlnaGxpZ2h0WCA9IGJvYXJkT2Zmc2V0WCArIHRoaXMuc2VsZWN0ZWRCbG9jay54ICogdGhpcy5jb25maWcuYmxvY2tTaXplO1xyXG4gICAgICAgICAgICBjb25zdCBoaWdobGlnaHRZID0gYm9hcmRPZmZzZXRZICsgdGhpcy5zZWxlY3RlZEJsb2NrLnkgKiB0aGlzLmNvbmZpZy5ibG9ja1NpemU7XHJcbiAgICAgICAgICAgIGNvbnN0IHNlbGVjdGlvbkltYWdlID0gdGhpcy5hc3NldHMuaW1hZ2VzLmdldCgnc2VsZWN0aW9uJyk7XHJcbiAgICAgICAgICAgIGlmIChzZWxlY3Rpb25JbWFnZSAmJiBzZWxlY3Rpb25JbWFnZS53aWR0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShzZWxlY3Rpb25JbWFnZSwgaGlnaGxpZ2h0WCwgaGlnaGxpZ2h0WSwgdGhpcy5jb25maWcuYmxvY2tTaXplLCB0aGlzLmNvbmZpZy5ibG9ja1NpemUpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAnbGltZSc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAzO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdChoaWdobGlnaHRYLCBoaWdobGlnaHRZLCB0aGlzLmNvbmZpZy5ibG9ja1NpemUsIHRoaXMuY29uZmlnLmJsb2NrU2l6ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUlcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnI0ZGRic7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyOHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNjb3JlOiAke3RoaXMuc2NvcmV9YCwgMjAsIDQwKTtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAncmlnaHQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBUaW1lOiAke01hdGgubWF4KDAsIE1hdGguZmxvb3IodGhpcy50aW1lTGVmdCkpfWAsIHRoaXMuY2FudmFzLndpZHRoIC0gMjAsIDQwKTtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJzsgLy8gUmVzZXQgZm9yIG90aGVyIHRleHRzXHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3QmxvY2sodHlwZTogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg/OiBudW1iZXIsIGhlaWdodD86IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGJsb2NrV2lkdGggPSB3aWR0aCB8fCB0aGlzLmNvbmZpZy5ibG9ja1NpemU7XHJcbiAgICAgICAgY29uc3QgYmxvY2tIZWlnaHQgPSBoZWlnaHQgfHwgdGhpcy5jb25maWcuYmxvY2tTaXplO1xyXG4gICAgICAgIGNvbnN0IGltYWdlTmFtZSA9IGBibG9ja18ke3R5cGV9YDtcclxuICAgICAgICBjb25zdCBibG9ja0ltYWdlID0gdGhpcy5hc3NldHMuaW1hZ2VzLmdldChpbWFnZU5hbWUpO1xyXG5cclxuICAgICAgICBpZiAoYmxvY2tJbWFnZSAmJiBibG9ja0ltYWdlLndpZHRoID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmxvY2tJbWFnZSwgeCwgeSwgYmxvY2tXaWR0aCwgYmxvY2tIZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBkcmF3IGNvbG9yZWQgcmVjdGFuZ2xlXHJcbiAgICAgICAgICAgIGNvbnN0IGNvbG9ycyA9IFsncmVkJywgJ2JsdWUnLCAnZ3JlZW4nLCAneWVsbG93JywgJ3B1cnBsZScsICdvcmFuZ2UnXTtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gY29sb3JzW3R5cGUgJSBjb2xvcnMubGVuZ3RoXTtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoeCwgeSwgYmxvY2tXaWR0aCwgYmxvY2tIZWlnaHQpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2VTdHlsZSA9ICcjMDAwJztcclxuICAgICAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMTtcclxuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdCh4LCB5LCBibG9ja1dpZHRoLCBibG9ja0hlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjRkZGJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQ4cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRleHRzLmdhbWVPdmVyLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDMpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzZweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYEZpbmFsIFNjb3JlOiAke3RoaXMuc2NvcmV9YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuXHJcbiAgICAgICAgdGhpcy5kcmF3QnV0dG9uKHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0ICogMC43LCAyMDAsIDYwLCB0aGlzLmNvbmZpZy50ZXh0cy5yZXRyeUJ1dHRvbiwgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICB0aGlzLmluaXRHYW1lVmFyaWFibGVzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdjbGljaycpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ20pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoXCJCR00gcGxheSBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmRyYXdCdXR0b24odGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgKiAwLjcgKyA4MCwgMjAwLCA2MCwgdGhpcy5jb25maWcudGV4dHMuYmFja0J1dHRvbiwgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ2NsaWNrJyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3QnV0dG9uKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdGV4dDogc3RyaW5nLCBvbkNsaWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYnRuWCA9IHggLSB3aWR0aCAvIDI7XHJcbiAgICAgICAgY29uc3QgYnRuWSA9IHkgLSBoZWlnaHQgLyAyO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnIzY2Nic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYnRuWCwgYnRuWSwgd2lkdGgsIGhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlU3R5bGUgPSAnI0ZGRic7XHJcbiAgICAgICAgdGhpcy5jdHgubGluZVdpZHRoID0gMjtcclxuICAgICAgICB0aGlzLmN0eC5zdHJva2VSZWN0KGJ0blgsIGJ0blksIHdpZHRoLCBoZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnI0ZGRic7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyOHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcclxuXHJcbiAgICAgICAgLy8gU3RvcmUgYnV0dG9uIGRhdGEgZm9yIGNsaWNrIGhhbmRsaW5nXHJcbiAgICAgICAgdGhpcy5idXR0b25zLnB1c2goeyB4OiBidG5YLCB5OiBidG5ZLCB3aWR0aCwgaGVpZ2h0LCBvbkNsaWNrIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2sgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcclxuICAgICAgICBjb25zdCByZWN0ID0gdGhpcy5jYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgbW91c2VYID0gZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdDtcclxuICAgICAgICBjb25zdCBtb3VzZVkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgYW55IFVJIGJ1dHRvbiB3YXMgY2xpY2tlZFxyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBidXR0b24gb2YgdGhpcy5idXR0b25zKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1vdXNlWCA+PSBidXR0b24ueCAmJiBtb3VzZVggPD0gYnV0dG9uLnggKyBidXR0b24ud2lkdGggJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgbW91c2VZID49IGJ1dHRvbi55ICYmIG1vdXNlWSA8PSBidXR0b24ueSArIGJ1dHRvbi5oZWlnaHQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnV0dG9uLm9uQ2xpY2soKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIC8vIFByZXZlbnQgY2xpY2tzIGlmIGFueSBibG9jayBpcyBhbmltYXRpbmdcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgdGhpcy5jb25maWcuZ3JpZFNpemVZOyByKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IHRoaXMuY29uZmlnLmdyaWRTaXplWDsgYysrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbcl1bY10uc3RhdGUgIT09IEJsb2NrU3RhdGUuSURMRSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGJvYXJkT2Zmc2V0WCA9ICh0aGlzLmNhbnZhcy53aWR0aCAtIHRoaXMuY29uZmlnLmdyaWRTaXplWCAqIHRoaXMuY29uZmlnLmJsb2NrU2l6ZSkgLyAyO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYm9hcmRPZmZzZXRZID0gKHRoaXMuY2FudmFzLmhlaWdodCAtIHRoaXMuY29uZmlnLmdyaWRTaXplWSAqIHRoaXMuY29uZmlnLmJsb2NrU2l6ZSkgLyAyICsgNTA7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKG1vdXNlWCA+PSBib2FyZE9mZnNldFggJiYgbW91c2VYIDwgYm9hcmRPZmZzZXRYICsgdGhpcy5jb25maWcuZ3JpZFNpemVYICogdGhpcy5jb25maWcuYmxvY2tTaXplICYmXHJcbiAgICAgICAgICAgICAgICAgICAgbW91c2VZID49IGJvYXJkT2Zmc2V0WSAmJiBtb3VzZVkgPCBib2FyZE9mZnNldFkgKyB0aGlzLmNvbmZpZy5ncmlkU2l6ZVkgKiB0aGlzLmNvbmZpZy5ibG9ja1NpemUpIHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZ3JpZFggPSBNYXRoLmZsb29yKChtb3VzZVggLSBib2FyZE9mZnNldFgpIC8gdGhpcy5jb25maWcuYmxvY2tTaXplKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBncmlkWSA9IE1hdGguZmxvb3IoKG1vdXNlWSAtIGJvYXJkT2Zmc2V0WSkgLyB0aGlzLmNvbmZpZy5ibG9ja1NpemUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZUJsb2NrQ2xpY2soZ3JpZFgsIGdyaWRZKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuYXNzZXRzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIC8vIENsb25lIHRoZSBub2RlIHRvIHBsYXkgbXVsdGlwbGUgc291bmRzIHNpbXVsdGFuZW91c2x5IGlmIG5lZWRlZFxyXG4gICAgICAgICAgICBjb25zdCBjbG9uZWRBdWRpbyA9IGF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNsb25lZEF1ZGlvLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTtcclxuICAgICAgICAgICAgY2xvbmVkQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIHBsYXkgc291bmQgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQmxvY2tDbGljayh4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGVkQmxvY2sgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgLy8gRmlyc3QgY2xpY2ssIHNlbGVjdCB0aGUgYmxvY2tcclxuICAgICAgICAgICAgdGhpcy5zZWxlY3RlZEJsb2NrID0geyB4LCB5IH07XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gU2Vjb25kIGNsaWNrLCB0cnkgdG8gc3dhcFxyXG4gICAgICAgICAgICBjb25zdCBkeCA9IE1hdGguYWJzKHggLSB0aGlzLnNlbGVjdGVkQmxvY2sueCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gTWF0aC5hYnMoeSAtIHRoaXMuc2VsZWN0ZWRCbG9jay55KTtcclxuXHJcbiAgICAgICAgICAgIGlmICgoZHggPT09IDEgJiYgZHkgPT09IDApIHx8IChkeCA9PT0gMCAmJiBkeSA9PT0gMSkpIHtcclxuICAgICAgICAgICAgICAgIC8vIEFkamFjZW50IGJsb2NrLCBwZXJmb3JtIHN3YXBcclxuICAgICAgICAgICAgICAgIHRoaXMucGVyZm9ybVN3YXAodGhpcy5zZWxlY3RlZEJsb2NrLngsIHRoaXMuc2VsZWN0ZWRCbG9jay55LCB4LCB5KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGVkQmxvY2sgPSBudWxsOyAvLyBEZXNlbGVjdCBhZnRlciBzZWNvbmQgY2xpY2tcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwZXJmb3JtU3dhcCh4MTogbnVtYmVyLCB5MTogbnVtYmVyLCB4MjogbnVtYmVyLCB5MjogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYmxvY2sxID0gdGhpcy5ncmlkW3kxXVt4MV07XHJcbiAgICAgICAgY29uc3QgYmxvY2syID0gdGhpcy5ncmlkW3kyXVt4Ml07XHJcblxyXG4gICAgICAgIC8vIEFuaW1hdGUgc3dhcFxyXG4gICAgICAgIGJsb2NrMS5zdGF0ZSA9IEJsb2NrU3RhdGUuU1dBUFBJTkc7XHJcbiAgICAgICAgYmxvY2sxLnN3YXBUYXJnZXRYID0geDI7XHJcbiAgICAgICAgYmxvY2sxLnN3YXBUYXJnZXRZID0geTI7XHJcbiAgICAgICAgYmxvY2sxLnN3YXBQcm9ncmVzcyA9IDA7XHJcblxyXG4gICAgICAgIGJsb2NrMi5zdGF0ZSA9IEJsb2NrU3RhdGUuU1dBUFBJTkc7XHJcbiAgICAgICAgYmxvY2syLnN3YXBUYXJnZXRYID0geDE7XHJcbiAgICAgICAgYmxvY2syLnN3YXBUYXJnZXRZID0geTE7XHJcbiAgICAgICAgYmxvY2syLnN3YXBQcm9ncmVzcyA9IDA7XHJcblxyXG4gICAgICAgIHRoaXMucGxheVNvdW5kKCdzd2FwJyk7XHJcblxyXG4gICAgICAgIC8vIFdhaXQgZm9yIGFuaW1hdGlvbiB0byBjb21wbGV0ZSAoYXBwcm94IDAuNCBzZWNvbmRzIGJhc2VkIG9uIDIuNSAqIGRlbHRhVGltZSlcclxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgLy8gVGVtcG9yYXJpbHkgdXBkYXRlIGdyaWQgcG9zaXRpb25zIChmb3IgbWF0Y2ggY2hlY2spXHJcbiAgICAgICAgICAgIFt0aGlzLmdyaWRbeTFdW3gxXSwgdGhpcy5ncmlkW3kyXVt4Ml1dID0gW3RoaXMuZ3JpZFt5Ml1beDJdLCB0aGlzLmdyaWRbeTFdW3gxXV07XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgYmxvY2sncyBpbnRlcm5hbCAoeCx5KSB0byByZWZsZWN0IG5ldyBncmlkIHBvc2l0aW9uXHJcbiAgICAgICAgICAgIGJsb2NrMS54ID0geDI7XHJcbiAgICAgICAgICAgIGJsb2NrMS55ID0geTI7XHJcbiAgICAgICAgICAgIGJsb2NrMi54ID0geDE7XHJcbiAgICAgICAgICAgIGJsb2NrMi55ID0geTE7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gdGhpcy5maW5kTWF0Y2hlcygpO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIC8vIE5vIG1hdGNoLCBzd2FwIGJhY2tcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdzd2FwJyk7IC8vIFBsYXkgc3dhcCBzb3VuZCBhZ2FpbiBmb3Igc3dhcCBiYWNrXHJcbiAgICAgICAgICAgICAgICBibG9jazEuc3RhdGUgPSBCbG9ja1N0YXRlLlNXQVBQSU5HO1xyXG4gICAgICAgICAgICAgICAgYmxvY2sxLnN3YXBUYXJnZXRYID0geDE7XHJcbiAgICAgICAgICAgICAgICBibG9jazEuc3dhcFRhcmdldFkgPSB5MTtcclxuICAgICAgICAgICAgICAgIGJsb2NrMS5zd2FwUHJvZ3Jlc3MgPSAwO1xyXG5cclxuICAgICAgICAgICAgICAgIGJsb2NrMi5zdGF0ZSA9IEJsb2NrU3RhdGUuU1dBUFBJTkc7XHJcbiAgICAgICAgICAgICAgICBibG9jazIuc3dhcFRhcmdldFggPSB4MjtcclxuICAgICAgICAgICAgICAgIGJsb2NrMi5zd2FwVGFyZ2V0WSA9IHkyO1xyXG4gICAgICAgICAgICAgICAgYmxvY2syLnN3YXBQcm9ncmVzcyA9IDA7XHJcblxyXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gUmV2ZXJ0IGdyaWQgcG9zaXRpb25zXHJcbiAgICAgICAgICAgICAgICAgICAgW3RoaXMuZ3JpZFt5MV1beDFdLCB0aGlzLmdyaWRbeTJdW3gyXV0gPSBbdGhpcy5ncmlkW3kyXVt4Ml0sIHRoaXMuZ3JpZFt5MV1beDFdXTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBSZXZlcnQgYmxvY2sncyBpbnRlcm5hbCAoeCx5KVxyXG4gICAgICAgICAgICAgICAgICAgIGJsb2NrMS54ID0geDE7XHJcbiAgICAgICAgICAgICAgICAgICAgYmxvY2sxLnkgPSB5MTtcclxuICAgICAgICAgICAgICAgICAgICBibG9jazIueCA9IHgyO1xyXG4gICAgICAgICAgICAgICAgICAgIGJsb2NrMi55ID0geTI7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gUmVzZXQgc3RhdGVzIGFuZCBzd2FwIHByb3BlcnRpZXNcclxuICAgICAgICAgICAgICAgICAgICBibG9jazEuc3RhdGUgPSBCbG9ja1N0YXRlLklETEU7XHJcbiAgICAgICAgICAgICAgICAgICAgYmxvY2syLnN0YXRlID0gQmxvY2tTdGF0ZS5JRExFO1xyXG4gICAgICAgICAgICAgICAgICAgIGJsb2NrMS5zd2FwVGFyZ2V0WCA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgICAgICAgICBibG9jazEuc3dhcFRhcmdldFkgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgICAgICAgICAgYmxvY2sxLnN3YXBQcm9ncmVzcyA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgICAgICAgICBibG9jazIuc3dhcFRhcmdldFggPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgICAgICAgICAgYmxvY2syLnN3YXBUYXJnZXRZID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICAgICAgICAgIGJsb2NrMi5zd2FwUHJvZ3Jlc3MgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgICAgICB9LCA0MDApOyAvLyBEdXJhdGlvbiBvZiBzd2FwIGJhY2sgYW5pbWF0aW9uXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBNYXRjaGVzIGZvdW5kLCB0aGV5IHdpbGwgYmUgcHJvY2Vzc2VkIGJ5IHRoZSB1cGRhdGUgbG9vcCAoc2V0dGluZyBDTEVBUklORyBzdGF0ZSlcclxuICAgICAgICAgICAgICAgIC8vIFJlc2V0IHN0YXRlcyBhbmQgc3dhcCBwcm9wZXJ0aWVzIGZvciBibG9ja3MgdGhhdCB3ZXJlIGludm9sdmVkIGluIG1hdGNoXHJcbiAgICAgICAgICAgICAgICBibG9jazEuc3RhdGUgPSBCbG9ja1N0YXRlLklETEU7XHJcbiAgICAgICAgICAgICAgICBibG9jazIuc3RhdGUgPSBCbG9ja1N0YXRlLklETEU7XHJcbiAgICAgICAgICAgICAgICBibG9jazEuc3dhcFRhcmdldFggPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgICAgICBibG9jazEuc3dhcFRhcmdldFkgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgICAgICBibG9jazEuc3dhcFByb2dyZXNzID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICAgICAgYmxvY2syLnN3YXBUYXJnZXRYID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICAgICAgYmxvY2syLnN3YXBUYXJnZXRZID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICAgICAgYmxvY2syLnN3YXBQcm9ncmVzcyA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sIDQwMCk7IC8vIER1cmF0aW9uIG9mIGluaXRpYWwgc3dhcCBhbmltYXRpb25cclxuICAgIH1cclxufVxyXG5cclxuLy8gR2xvYmFsIHNjb3BlIHRvIGluaXRpYWxpemUgdGhlIGdhbWVcclxud2luZG93Lm9ubG9hZCA9ICgpID0+IHtcclxuICAgIGNvbnN0IGdhbWUgPSBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xyXG4gICAgZ2FtZS5zdGFydCgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIkdhbWUgZmFpbGVkIHRvIHN0YXJ0OlwiLCBlKSk7XHJcbn07XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQW9DQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUpDLFNBQUFBO0FBQUEsR0FBQTtBQU9MLElBQUssYUFBTCxrQkFBS0MsZ0JBQUw7QUFDSSxFQUFBQSx3QkFBQTtBQUNBLEVBQUFBLHdCQUFBO0FBQ0EsRUFBQUEsd0JBQUE7QUFDQSxFQUFBQSx3QkFBQTtBQUpDLFNBQUFBO0FBQUEsR0FBQTtBQXdCTCxNQUFNLEtBQUs7QUFBQSxFQTBCUCxZQUFZLFVBQWtCO0FBcEI5QixTQUFRLFlBQXVCO0FBQy9CLFNBQVEsZ0JBQWdCO0FBR3hCO0FBQUEsU0FBUSxPQUFrQixDQUFDO0FBQzNCLFNBQVEsUUFBZ0I7QUFDeEIsU0FBUSxXQUFtQjtBQUMzQixTQUFRLGdCQUFzQztBQUM5QyxTQUFRLHlCQUFpQztBQUN6QyxTQUFRLG1CQUEyQjtBQUVuQztBQUFBLFNBQVEsZUFBdUI7QUFDL0I7QUFBQSxTQUFRLG1CQUEyQjtBQUduQztBQUFBO0FBQUEsU0FBUSxNQUErQjtBQUd2QztBQUFBLFNBQVEsVUFBMEYsQ0FBQztBQTBIbkcsU0FBUSxXQUFXLENBQUMsZ0JBQTJDO0FBQzNELFlBQU0sYUFBYSxjQUFjLEtBQUssaUJBQWlCO0FBQ3ZELFdBQUssZ0JBQWdCO0FBRXJCLFdBQUssT0FBTyxTQUFTO0FBQ3JCLFdBQUssT0FBTztBQUVaLDRCQUFzQixLQUFLLFFBQVE7QUFBQSxJQUN2QztBQStaQSxTQUFRLGNB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
