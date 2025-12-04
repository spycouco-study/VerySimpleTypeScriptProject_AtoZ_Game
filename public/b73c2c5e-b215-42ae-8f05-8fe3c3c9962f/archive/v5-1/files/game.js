class Vector2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}
class AssetLoader {
  constructor() {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.totalAssets = 0;
    this.loadedAssets = 0;
  }
  async load(assetsConfig) {
    const imagePromises = assetsConfig.images.map((img) => this.loadImage(img));
    const soundPromises = assetsConfig.sounds.map((snd) => this.loadSound(snd));
    this.totalAssets = imagePromises.length + soundPromises.length;
    this.loadedAssets = 0;
    await Promise.all([...imagePromises, ...soundPromises]);
    return { images: this.images, sounds: this.sounds };
  }
  loadImage(imageConfig) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageConfig.path;
      img.onload = () => {
        this.images.set(imageConfig.name, img);
        this.loadedAssets++;
        console.log(`Loaded image: ${imageConfig.name} (${this.loadedAssets}/${this.totalAssets})`);
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${imageConfig.path}`);
        reject(new Error(`Failed to load image: ${imageConfig.path}`));
      };
    });
  }
  loadSound(soundConfig) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = soundConfig.path;
      audio.preload = "auto";
      audio.oncanplaythrough = () => {
        this.sounds.set(soundConfig.name, audio);
        this.loadedAssets++;
        console.log(`Loaded sound: ${soundConfig.name} (${this.loadedAssets}/${this.totalAssets})`);
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${soundConfig.path}`);
        reject(new Error(`Failed to load sound: ${soundConfig.path}`));
      };
    });
  }
}
class AudioManager {
  constructor(sounds) {
    this.bgmAudio = null;
    this.bgmVolume = 0;
    this.bgmLooping = false;
    this.sounds = sounds;
  }
  play(name, loop = false, volume = 1) {
    const audio = this.sounds.get(name);
    if (audio) {
      if (loop) {
        this.stopBGM();
        this.bgmAudio = audio;
        this.bgmVolume = volume;
        this.bgmLooping = true;
        audio.loop = true;
        audio.volume = volume;
        audio.play().catch((e) => console.error(`Error playing BGM ${name}:`, e));
      } else {
        const clonedAudio = audio.cloneNode();
        clonedAudio.volume = volume;
        clonedAudio.play().catch((e) => console.error(`Error playing sound effect ${name}:`, e));
      }
    } else {
      console.warn(`Sound "${name}" not found.`);
    }
  }
  stop(name) {
    const audio = this.sounds.get(name);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      if (this.bgmAudio === audio) {
        this.bgmAudio = null;
        this.bgmLooping = false;
      }
    }
  }
  stopBGM() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio = null;
      this.bgmLooping = false;
    }
  }
  setBGMVolume(volume) {
    if (this.bgmAudio) {
      this.bgmAudio.volume = volume;
      this.bgmVolume = volume;
    }
  }
  // Helper for browser auto-play policy
  resumeBGM() {
    if (this.bgmAudio && this.bgmLooping && this.bgmAudio.paused) {
      this.bgmAudio.play().catch((e) => console.error("Could not resume BGM:", e));
    }
  }
}
class Button {
  constructor(ctx, x, y, width, height, text, color, hoverColor, textColor, font, callback) {
    this.isHovered = false;
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.text = text;
    this.color = color;
    this.hoverColor = hoverColor;
    this.textColor = textColor;
    this.font = font;
    this.callback = callback;
  }
  draw() {
    this.ctx.fillStyle = this.isHovered ? this.hoverColor : this.color;
    this.ctx.fillRect(this.x, this.y, this.width, this.height);
    this.ctx.fillStyle = this.textColor;
    this.ctx.font = `bold ${this.height / 2.5}px ${this.font}`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.text, this.x + this.width / 2, this.y + this.height / 2);
  }
  handleMouseMove(mouseX, mouseY) {
    this.isHovered = mouseX >= this.x && mouseX <= this.x + this.width && mouseY >= this.y && mouseY <= this.y + this.height;
  }
  handleClick(mouseX, mouseY) {
    if (mouseX >= this.x && mouseX <= this.x + this.width && mouseY >= this.y && mouseY <= this.y + this.height) {
      this.callback();
      return true;
    }
    return false;
  }
}
class GameUI {
  constructor(ctx, config, images) {
    this.buttons = [];
    this.currentScore = 0;
    this.currentTime = 0;
    this.currentLevel = 0;
    this.totalLevels = 0;
    this.ctx = ctx;
    this.config = config;
    this.images = images;
  }
  clearButtons() {
    this.buttons = [];
  }
  addButton(x, y, width, height, text, callback) {
    this.buttons.push(new Button(
      this.ctx,
      x,
      y,
      width,
      height,
      text,
      this.config.uiButtonColor,
      this.config.uiButtonHoverColor,
      this.config.uiButtonTextColor,
      this.config.gameFont,
      callback
    ));
  }
  drawTitleScreen(onStartGame) {
    this.clearButtons();
    this.ctx.fillStyle = this.config.uiColor;
    this.ctx.font = `bold 60px ${this.config.gameFont}`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.config.titleScreenText, this.config.canvasWidth / 2, this.config.canvasHeight / 2 - 50);
    const buttonWidth = 200;
    const buttonHeight = 60;
    this.addButton(
      (this.config.canvasWidth - buttonWidth) / 2,
      this.config.canvasHeight / 2 + 50,
      buttonWidth,
      buttonHeight,
      this.config.titleButtonText,
      onStartGame
    );
    this.buttons.forEach((btn) => btn.draw());
  }
  drawInstructionsScreen(onPlayGame) {
    this.clearButtons();
    this.ctx.fillStyle = this.config.uiColor;
    this.ctx.font = `20px ${this.config.gameFont}`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    const lines = this.config.instructionsText.split("\n");
    const startY = 100;
    const lineHeight = 30;
    lines.forEach((line, index) => {
      this.ctx.fillText(line, this.config.canvasWidth / 2, startY + index * lineHeight);
    });
    const buttonWidth = 200;
    const buttonHeight = 60;
    this.addButton(
      (this.config.canvasWidth - buttonWidth) / 2,
      this.config.canvasHeight - 100,
      buttonWidth,
      buttonHeight,
      this.config.instructionsButtonText,
      onPlayGame
    );
    this.buttons.forEach((btn) => btn.draw());
  }
  drawPlayingUI(score, time, level, totalLevels) {
    this.currentScore = score;
    this.currentTime = time;
    this.currentLevel = level;
    this.totalLevels = totalLevels;
    this.ctx.fillStyle = this.config.uiColor;
    this.ctx.font = `bold 24px ${this.config.gameFont}`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";
    this.ctx.fillText(`\uC810\uC218: ${this.currentScore}`, 10, 10);
    this.ctx.fillText(`\uB808\uBCA8: ${this.currentLevel + 1} / ${this.totalLevels}`, 10, 40);
    this.ctx.textAlign = "right";
    this.ctx.fillText(`\uC2DC\uAC04: ${Math.max(0, Math.floor(this.currentTime))}s`, this.config.canvasWidth - 10, 10);
  }
  drawGameOverScreen(win, onRestart) {
    this.clearButtons();
    this.ctx.fillStyle = this.config.uiColor;
    this.ctx.font = `bold 50px ${this.config.gameFont}`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(
      win ? this.config.gameOverWinText : this.config.gameOverLoseText,
      this.config.canvasWidth / 2,
      this.config.canvasHeight / 2 - 50
    );
    this.ctx.font = `bold 30px ${this.config.gameFont}`;
    this.ctx.fillText(`\uCD5C\uC885 \uC810\uC218: ${this.currentScore}`, this.config.canvasWidth / 2, this.config.canvasHeight / 2 + 10);
    const buttonWidth = 200;
    const buttonHeight = 60;
    this.addButton(
      (this.config.canvasWidth - buttonWidth) / 2,
      this.config.canvasHeight / 2 + 80,
      buttonWidth,
      buttonHeight,
      this.config.gameOverButtonText,
      onRestart
    );
    this.buttons.forEach((btn) => btn.draw());
  }
  handleMouseMove(mouseX, mouseY) {
    this.buttons.forEach((btn) => btn.handleMouseMove(mouseX, mouseY));
  }
  handleClick(mouseX, mouseY) {
    for (const btn of this.buttons) {
      if (btn.handleClick(mouseX, mouseY)) {
        return true;
      }
    }
    return false;
  }
  drawBackground() {
    const bgImage = this.images.get("background");
    if (bgImage) {
      this.ctx.drawImage(bgImage, 0, 0, this.config.canvasWidth, this.config.canvasHeight);
    } else {
      this.ctx.fillStyle = "#ADD8E6";
      this.ctx.fillRect(0, 0, this.config.canvasWidth, this.config.canvasHeight);
    }
  }
}
class Tile {
  constructor(row, col, animalType, imageMap, tileSize, tilePadding, boardMarginX, boardMarginY) {
    this.row = row;
    this.col = col;
    this.animalType = animalType;
    this.tileSize = tileSize;
    this.tilePadding = tilePadding;
    this.boardMarginX = boardMarginX;
    this.boardMarginY = boardMarginY;
    const imageName = `animal_${animalType}`;
    const img = imageMap.get(imageName);
    if (!img) {
      throw new Error(`Image for animal type ${animalType} (${imageName}) not found.`);
    }
    this.image = img;
  }
  draw(ctx, isSelected, selectedOutlineColor) {
    const x = this.boardMarginX + this.col * (this.tileSize + this.tilePadding);
    const y = this.boardMarginY + this.row * (this.tileSize + this.tilePadding);
    ctx.drawImage(this.image, x, y, this.tileSize, this.tileSize);
    if (isSelected) {
      ctx.strokeStyle = selectedOutlineColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, this.tileSize, this.tileSize);
    }
  }
  getBounds() {
    const x = this.boardMarginX + this.col * (this.tileSize + this.tilePadding);
    const y = this.boardMarginY + this.row * (this.tileSize + this.tilePadding);
    return { x, y, width: this.tileSize, height: this.tileSize };
  }
}
class Pathfinder {
  constructor(board, config) {
    this.board = board;
    this.config = config;
    this.rows = board.rows;
    this.cols = board.cols;
  }
  // Helper: Check if a given cell (r, c) is outside the board, empty, or one of the selected tiles
  _isCellClear(r, c, selectedTile1, selectedTile2) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
      return true;
    }
    const tileAtPos = this.board.getTile(r, c);
    return tileAtPos === null || tileAtPos === selectedTile1 || tileAtPos === selectedTile2;
  }
  // Helper: Check if a straight line segment is clear
  _isLineClear(r1, c1, r2, c2, selectedTile1, selectedTile2) {
    if (r1 === r2) {
      for (let c = Math.min(c1, c2) + 1; c < Math.max(c1, c2); c++) {
        if (!this._isCellClear(r1, c, selectedTile1, selectedTile2)) return false;
      }
    } else if (c1 === c2) {
      for (let r = Math.min(r1, r2) + 1; r < Math.max(r1, r2); r++) {
        if (!this._isCellClear(r, c1, selectedTile1, selectedTile2)) return false;
      }
    } else {
      return false;
    }
    return true;
  }
  // Main pathfinding logic
  findPath(tile1, tile2) {
    if (!tile1 || !tile2 || tile1.animalType !== tile2.animalType || tile1.row === tile2.row && tile1.col === tile2.col) {
      return false;
    }
    const r1 = tile1.row;
    const c1 = tile1.col;
    const r2 = tile2.row;
    const c2 = tile2.col;
    if (this._isLineClear(r1, c1, r2, c2, tile1, tile2)) {
      return true;
    }
    if (this._isCellClear(r1, c2, tile1, tile2) && this._isLineClear(r1, c1, r1, c2, tile1, tile2) && this._isLineClear(r1, c2, r2, c2, tile1, tile2)) {
      return true;
    }
    if (this._isCellClear(r2, c1, tile1, tile2) && this._isLineClear(r1, c1, r2, c1, tile1, tile2) && this._isLineClear(r2, c1, r2, c2, tile1, tile2)) {
      return true;
    }
    const extendMinR = -1;
    const extendMaxR = this.rows;
    const extendMinC = -1;
    const extendMaxC = this.cols;
    for (let cc = extendMinC; cc <= extendMaxC; cc++) {
      if (this._isCellClear(r1, cc, tile1, tile2) && this._isCellClear(r2, cc, tile1, tile2) && this._isLineClear(r1, c1, r1, cc, tile1, tile2) && // First H segment
      this._isLineClear(r1, cc, r2, cc, tile1, tile2) && // V segment
      this._isLineClear(r2, cc, r2, c2, tile1, tile2)) {
        return true;
      }
    }
    for (let rr = extendMinR; rr <= extendMaxR; rr++) {
      if (this._isCellClear(rr, c1, tile1, tile2) && this._isCellClear(rr, c2, tile1, tile2) && this._isLineClear(r1, c1, rr, c1, tile1, tile2) && // First V segment
      this._isLineClear(rr, c1, rr, c2, tile1, tile2) && // H segment
      this._isLineClear(rr, c2, r2, c2, tile1, tile2)) {
        return true;
      }
    }
    return false;
  }
}
class Board {
  get rows() {
    return this._rows;
  }
  get cols() {
    return this._cols;
  }
  constructor(ctx, config, images) {
    this.ctx = ctx;
    this.config = config;
    this.images = images;
  }
  init(levelConfig) {
    this._rows = levelConfig.rows;
    this._cols = levelConfig.cols;
    this._tileSize = this.config.baseTileSize;
    this._tilePadding = this.config.tilePadding;
    this._boardMarginX = this.config.boardMarginX;
    this._boardMarginY = this.config.boardMarginY;
    this._numAnimalTypes = levelConfig.numAnimalTypes;
    this.grid = Array.from({ length: this._rows }, () => Array(this._cols).fill(null));
    this.pathfinder = new Pathfinder(this, this.config);
    this.generateBoard();
  }
  generateBoard() {
    const totalTiles = this._rows * this._cols;
    if (totalTiles % 2 !== 0) {
      console.error("Board size must be even for tile pairing.");
      if (this._cols % 2 !== 0) {
        this._cols--;
      }
      if (this._rows % 2 !== 0 && this._cols % 2 !== 0) {
        this._rows--;
      }
      if (this._rows * this._cols % 2 !== 0) {
        console.error("Board dimensions still result in odd tile count after adjustment. Game might be unplayable.");
        this._cols = Math.max(2, this._cols - 1);
      }
    }
    const currentTotalTiles = this._rows * this._cols;
    const animalTypes = [];
    for (let i = 0; i < currentTotalTiles / 2; i++) {
      animalTypes.push(i % this._numAnimalTypes + 1);
      animalTypes.push(i % this._numAnimalTypes + 1);
    }
    for (let i = animalTypes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [animalTypes[i], animalTypes[j]] = [animalTypes[j], animalTypes[i]];
    }
    let animalIndex = 0;
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        if (animalIndex < animalTypes.length) {
          this.grid[r][c] = new Tile(
            r,
            c,
            animalTypes[animalIndex++],
            this.images,
            this._tileSize,
            this._tilePadding,
            this._boardMarginX,
            this._boardMarginY
          );
        } else {
          this.grid[r][c] = null;
        }
      }
    }
  }
  draw(selectedTile) {
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        const tile = this.grid[r][c];
        if (tile) {
          tile.draw(this.ctx, tile === selectedTile, this.config.selectedTileOutlineColor);
        }
      }
    }
  }
  getTileAt(mouseX, mouseY) {
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        const tile = this.grid[r][c];
        if (tile) {
          const bounds = tile.getBounds();
          if (mouseX >= bounds.x && mouseX < bounds.x + bounds.width && mouseY >= bounds.y && mouseY < bounds.y + bounds.height) {
            return tile;
          }
        }
      }
    }
    return null;
  }
  getTile(r, c) {
    if (r < 0 || r >= this._rows || c < 0 || c >= this._cols) {
      return null;
    }
    return this.grid[r][c];
  }
  checkMatch(tile1, tile2) {
    return this.pathfinder.findPath(tile1, tile2);
  }
  removeTiles(tile1, tile2) {
    this.grid[tile1.row][tile1.col] = null;
    this.grid[tile2.row][tile2.col] = null;
  }
  isBoardClear() {
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        if (this.grid[r][c] !== null) {
          return false;
        }
      }
    }
    return true;
  }
  // Optional: Check if there are any valid moves remaining (can be expensive)
  hasRemainingMatches() {
    const activeTiles = [];
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        if (this.grid[r][c]) {
          activeTiles.push(this.grid[r][c]);
        }
      }
    }
    if (activeTiles.length === 0) return false;
    for (let i = 0; i < activeTiles.length; i++) {
      for (let j = i + 1; j < activeTiles.length; j++) {
        const tile1 = activeTiles[i];
        const tile2 = activeTiles[j];
        if (tile1.animalType === tile2.animalType && this.pathfinder.findPath(tile1, tile2)) {
          return true;
        }
      }
    }
    return false;
  }
  // Optional: Shuffle remaining tiles if no matches are left
  shuffle() {
    const currentActiveTiles = [];
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        if (this.grid[r][c]) {
          currentActiveTiles.push(this.grid[r][c]);
          this.grid[r][c] = null;
        }
      }
    }
    const animalTypesToShuffle = currentActiveTiles.map((tile) => tile.animalType);
    for (let i = animalTypesToShuffle.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [animalTypesToShuffle[i], animalTypesToShuffle[j]] = [animalTypesToShuffle[j], animalTypesToShuffle[i]];
    }
    let typeIndex = 0;
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        if (typeIndex < animalTypesToShuffle.length) {
          this.grid[r][c] = new Tile(
            r,
            c,
            animalTypesToShuffle[typeIndex++],
            this.images,
            this._tileSize,
            this._tilePadding,
            this._boardMarginX,
            this._boardMarginY
          );
        } else {
          this.grid[r][c] = null;
        }
      }
    }
  }
}
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE_SCREEN"] = 0] = "TITLE_SCREEN";
  GameState2[GameState2["INSTRUCTIONS_SCREEN"] = 1] = "INSTRUCTIONS_SCREEN";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER_WIN"] = 3] = "GAME_OVER_WIN";
  GameState2[GameState2["GAME_OVER_LOSE"] = 4] = "GAME_OVER_LOSE";
  return GameState2;
})(GameState || {});
class AnimalConnectGame {
  // To prevent rapid double clicks
  constructor(canvasElementId, config, assets) {
    this.gameState = 0 /* TITLE_SCREEN */;
    this.currentLevelIndex = 0;
    this.score = 0;
    this.timeRemaining = 0;
    this.selectedTile = null;
    this.lastMatchCheckTime = 0;
    this.canvas = document.getElementById(canvasElementId);
    this.ctx = this.canvas.getContext("2d");
    this.config = config;
    this.images = assets.images;
    this.sounds = assets.sounds;
    this.canvas.width = this.config.canvasWidth;
    this.canvas.height = this.config.canvasHeight;
    this.audioManager = new AudioManager(this.sounds);
    this.ui = new GameUI(this.ctx, this.config, this.images);
    this.board = new Board(this.ctx, this.config, this.images);
    this.setupEventListeners();
  }
  setupEventListeners() {
    this.canvas.addEventListener("click", this.handleClick.bind(this));
    this.canvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
  }
  init() {
    this.currentLevelIndex = 0;
    this.score = 0;
    this.selectedTile = null;
    this.gameState = 0 /* TITLE_SCREEN */;
    this.audioManager.stopBGM();
    this.audioManager.play("bgm_loop", true, this.config.assets.sounds.find((s) => s.name === "bgm_loop")?.volume || 0.3);
  }
  startLevel(levelIndex) {
    if (levelIndex >= this.config.levels.length) {
      this.gameState = 3 /* GAME_OVER_WIN */;
      this.audioManager.play("level_complete", false, this.config.assets.sounds.find((s) => s.name === "level_complete")?.volume || 0.8);
      return;
    }
    this.currentLevelIndex = levelIndex;
    const levelConfig = this.config.levels[this.currentLevelIndex];
    this.timeRemaining = levelConfig.timeLimitSeconds;
    this.selectedTile = null;
    this.board.init(levelConfig);
    this.gameState = 2 /* PLAYING */;
  }
  handleClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    if (this.ui.handleClick(mouseX, mouseY)) {
      this.audioManager.resumeBGM();
      return;
    }
    if (this.gameState === 2 /* PLAYING */) {
      const clickedTile = this.board.getTileAt(mouseX, mouseY);
      if (clickedTile) {
        if (this.selectedTile === clickedTile) {
          this.selectedTile = null;
          this.audioManager.play("tile_select", false, this.config.assets.sounds.find((s) => s.name === "tile_select")?.volume || 0.7);
        } else if (this.selectedTile === null) {
          this.selectedTile = clickedTile;
          this.audioManager.play("tile_select", false, this.config.assets.sounds.find((s) => s.name === "tile_select")?.volume || 0.7);
        } else {
          const tile1 = this.selectedTile;
          const tile2 = clickedTile;
          this.selectedTile = null;
          if (this.board.checkMatch(tile1, tile2)) {
            this.board.removeTiles(tile1, tile2);
            this.score += this.config.matchScore * this.config.levels[this.currentLevelIndex].scoreMultiplier;
            this.audioManager.play("tile_match", false, this.config.assets.sounds.find((s) => s.name === "tile_match")?.volume || 0.7);
            if (this.board.isBoardClear()) {
              this.audioManager.play("level_complete", false, this.config.assets.sounds.find((s) => s.name === "level_complete")?.volume || 0.8);
              this.startLevel(this.currentLevelIndex + 1);
            } else if (!this.board.hasRemainingMatches()) {
              console.warn("No more matches available on board, shuffling!");
              this.board.shuffle();
              this.timeRemaining -= this.config.penaltyTime;
              this.audioManager.play("wrong_match", false, this.config.assets.sounds.find((s) => s.name === "wrong_match")?.volume || 0.7);
              if (this.timeRemaining <= 0) {
                this.timeRemaining = 0;
                this.gameState = 4 /* GAME_OVER_LOSE */;
                this.audioManager.play("game_over", false, this.config.assets.sounds.find((s) => s.name === "game_over")?.volume || 0.8);
              }
            }
          } else {
            this.timeRemaining -= this.config.penaltyTime;
            this.audioManager.play("wrong_match", false, this.config.assets.sounds.find((s) => s.name === "wrong_match")?.volume || 0.7);
            if (this.timeRemaining <= 0) {
              this.timeRemaining = 0;
              this.gameState = 4 /* GAME_OVER_LOSE */;
              this.audioManager.play("game_over", false, this.config.assets.sounds.find((s) => s.name === "game_over")?.volume || 0.8);
            }
          }
        }
      }
    }
  }
  handleMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    this.ui.handleMouseMove(mouseX, mouseY);
  }
  update(deltaTime2) {
    if (this.gameState === 2 /* PLAYING */) {
      this.timeRemaining -= deltaTime2;
      if (this.timeRemaining <= 0) {
        this.timeRemaining = 0;
        this.gameState = 4 /* GAME_OVER_LOSE */;
        this.audioManager.play("game_over", false, this.config.assets.sounds.find((s) => s.name === "game_over")?.volume || 0.8);
      }
    }
  }
  drawGameBackground() {
    this.ui.drawBackground();
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGameBackground();
    switch (this.gameState) {
      case 0 /* TITLE_SCREEN */:
        this.ui.drawTitleScreen(() => this.gameState = 1 /* INSTRUCTIONS_SCREEN */);
        break;
      case 1 /* INSTRUCTIONS_SCREEN */:
        this.ui.drawInstructionsScreen(() => this.startLevel(0));
        break;
      case 2 /* PLAYING */:
        this.board.draw(this.selectedTile);
        this.ui.drawPlayingUI(this.score, this.timeRemaining, this.currentLevelIndex, this.config.levels.length);
        break;
      case 3 /* GAME_OVER_WIN */:
        this.ui.drawGameOverScreen(true, () => this.init());
        break;
      case 4 /* GAME_OVER_LOSE */:
        this.ui.drawGameOverScreen(false, () => this.init());
        break;
    }
  }
}
let lastTime = 0;
let deltaTime = 0;
let gameInstance = null;
function gameLoop(currentTime) {
  if (!lastTime) lastTime = currentTime;
  deltaTime = (currentTime - lastTime) / 1e3;
  lastTime = currentTime;
  if (gameInstance) {
    gameInstance.update(deltaTime);
    gameInstance.draw();
  }
  requestAnimationFrame(gameLoop);
}
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error('Canvas element with ID "gameCanvas" not found. Please ensure your HTML includes <canvas id="gameCanvas"></canvas>.');
    const errorDiv = document.createElement("div");
    errorDiv.style.color = "red";
    errorDiv.style.textAlign = "center";
    errorDiv.style.marginTop = "50px";
    errorDiv.style.fontFamily = "sans-serif";
    errorDiv.innerText = '\uC624\uB958: \uAC8C\uC784 \uCE94\uBC84\uC2A4 (ID "gameCanvas")\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. HTML \uD30C\uC77C\uC5D0 <canvas id="gameCanvas"></canvas> \uC694\uC18C\uAC00 \uC788\uB294\uC9C0 \uD655\uC778\uD574\uC8FC\uC138\uC694.';
    document.body.appendChild(errorDiv);
    return;
  }
  fetch("data.json").then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }).then(async (data) => {
    const assetLoader = new AssetLoader();
    try {
      const loadedAssets = await assetLoader.load(data.assets);
      gameInstance = new AnimalConnectGame("gameCanvas", data, loadedAssets);
      gameInstance.init();
      requestAnimationFrame(gameLoop);
    } catch (error) {
      console.error("Error loading game assets:", error);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "red";
        ctx.font = "24px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\uAC8C\uC784 \uC5D0\uC14B \uB85C\uB4DC \uC911 \uC624\uB958 \uBC1C\uC0DD: " + error.message, canvas.width / 2, canvas.height / 2);
      }
    }
  }).catch((error) => {
    console.error("Error loading game data:", error);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "red";
      ctx.font = "24px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\uAC8C\uC784 \uB85C\uB4DC \uC911 \uC624\uB958 \uBC1C\uC0DD: " + error.message, canvas.width / 2, canvas.height / 2);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEFzc2V0SW1hZ2VDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXNzZXRTb3VuZENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEFzc2V0SW1hZ2VDb25maWdbXTtcclxuICAgIHNvdW5kczogQXNzZXRTb3VuZENvbmZpZ1tdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTGV2ZWxDb25maWcge1xyXG4gICAgcm93czogbnVtYmVyO1xyXG4gICAgY29sczogbnVtYmVyO1xyXG4gICAgbnVtQW5pbWFsVHlwZXM6IG51bWJlcjtcclxuICAgIHRpbWVMaW1pdFNlY29uZHM6IG51bWJlcjtcclxuICAgIHNjb3JlTXVsdGlwbGllcjogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBib2FyZE1hcmdpblg6IG51bWJlcjtcclxuICAgIGJvYXJkTWFyZ2luWTogbnVtYmVyO1xyXG4gICAgYmFzZVRpbGVTaXplOiBudW1iZXI7XHJcbiAgICB0aWxlUGFkZGluZzogbnVtYmVyO1xyXG4gICAgbWF0Y2hTY29yZTogbnVtYmVyO1xyXG4gICAgcGVuYWx0eVRpbWU6IG51bWJlcjtcclxuICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgdGl0bGVCdXR0b25UZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNCdXR0b25UZXh0OiBzdHJpbmc7XHJcbiAgICBnYW1lT3ZlcldpblRleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyTG9zZVRleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyQnV0dG9uVGV4dDogc3RyaW5nO1xyXG4gICAgZ2FtZUZvbnQ6IHN0cmluZztcclxuICAgIHVpQ29sb3I6IHN0cmluZztcclxuICAgIHVpQnV0dG9uQ29sb3I6IHN0cmluZztcclxuICAgIHVpQnV0dG9uSG92ZXJDb2xvcjogc3RyaW5nO1xyXG4gICAgdWlCdXR0b25UZXh0Q29sb3I6IHN0cmluZztcclxuICAgIHNlbGVjdGVkVGlsZU91dGxpbmVDb2xvcjogc3RyaW5nO1xyXG4gICAgYXNzZXRzOiBBc3NldHNDb25maWc7XHJcbiAgICBsZXZlbHM6IExldmVsQ29uZmlnW107XHJcbn1cclxuXHJcbi8vIC0tLSBVdGlsaXR5IENsYXNzZXMgYW5kIEZ1bmN0aW9ucyAtLS1cclxuY2xhc3MgVmVjdG9yMiB7XHJcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgeDogbnVtYmVyLCBwdWJsaWMgeTogbnVtYmVyKSB7fVxyXG59XHJcblxyXG4vLyAtLS0gQXNzZXQgTWFuYWdlbWVudCAtLS1cclxuY2xhc3MgQXNzZXRMb2FkZXIge1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbG9hZGVkQXNzZXRzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge31cclxuXHJcbiAgICBhc3luYyBsb2FkKGFzc2V0c0NvbmZpZzogQXNzZXRzQ29uZmlnKTogUHJvbWlzZTx7IGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4sIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gfT4ge1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBhc3NldHNDb25maWcuaW1hZ2VzLm1hcChpbWcgPT4gdGhpcy5sb2FkSW1hZ2UoaW1nKSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IGFzc2V0c0NvbmZpZy5zb3VuZHMubWFwKHNuZCA9PiB0aGlzLmxvYWRTb3VuZChzbmQpKTtcclxuXHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGltYWdlUHJvbWlzZXMubGVuZ3RoICsgc291bmRQcm9taXNlcy5sZW5ndGg7XHJcbiAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMgPSAwO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIHJldHVybiB7IGltYWdlczogdGhpcy5pbWFnZXMsIHNvdW5kczogdGhpcy5zb3VuZHMgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRJbWFnZShpbWFnZUNvbmZpZzogQXNzZXRJbWFnZUNvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gaW1hZ2VDb25maWcucGF0aDtcclxuICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChpbWFnZUNvbmZpZy5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBMb2FkZWQgaW1hZ2U6ICR7aW1hZ2VDb25maWcubmFtZX0gKCR7dGhpcy5sb2FkZWRBc3NldHN9LyR7dGhpcy50b3RhbEFzc2V0c30pYCk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7aW1hZ2VDb25maWcucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltYWdlQ29uZmlnLnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKHNvdW5kQ29uZmlnOiBBc3NldFNvdW5kQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgYXVkaW8uc3JjID0gc291bmRDb25maWcucGF0aDtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJztcclxuICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHsgLy8gRW5zdXJlIGF1ZGlvIGlzIGZ1bGx5IGxvYWRlZFxyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kQ29uZmlnLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQXNzZXRzKys7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgTG9hZGVkIHNvdW5kOiAke3NvdW5kQ29uZmlnLm5hbWV9ICgke3RoaXMubG9hZGVkQXNzZXRzfS8ke3RoaXMudG90YWxBc3NldHN9KWApO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c291bmRDb25maWcucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kQ29uZmlnLnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAvLyBGb3Igc29tZSBicm93c2VycywgY2hlY2tpbmcgYXVkaW8ucmVhZHlTdGF0ZSBtaWdodCBiZSBuZWVkZWQgaWYgb25jYW5wbGF5dGhyb3VnaCBkb2Vzbid0IGZpcmUgaW1tZWRpYXRlbHlcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQXVkaW9NYW5hZ2VyIHtcclxuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PjtcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYmdtVm9sdW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBiZ21Mb29waW5nOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3RydWN0b3Ioc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50Pikge1xyXG4gICAgICAgIHRoaXMuc291bmRzID0gc291bmRzO1xyXG4gICAgfVxyXG5cclxuICAgIHBsYXkobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UsIHZvbHVtZTogbnVtYmVyID0gMS4wKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGlmIChsb29wKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3BCR00oKTsgLy8gU3RvcCBhbnkgcHJldmlvdXMgQkdNXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvID0gYXVkaW87XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVZvbHVtZSA9IHZvbHVtZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtTG9vcGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoYEVycm9yIHBsYXlpbmcgQkdNICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gRm9yIHNvdW5kIGVmZmVjdHMsIGNyZWF0ZSBhIGNsb25lIHRvIGFsbG93IHNpbXVsdGFuZW91cyBwbGF5YmFja1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY2xvbmVkQXVkaW8gPSBhdWRpby5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgY2xvbmVkQXVkaW8udm9sdW1lID0gdm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgY2xvbmVkQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihgRXJyb3IgcGxheWluZyBzb3VuZCBlZmZlY3QgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kIFwiJHtuYW1lfVwiIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc3RvcChuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgYXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbyA9PT0gYXVkaW8pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8gPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21Mb29waW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc3RvcEJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvID0gbnVsbDtcclxuICAgICAgICAgICAgdGhpcy5iZ21Mb29waW5nID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNldEJHTVZvbHVtZSh2b2x1bWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8udm9sdW1lID0gdm9sdW1lO1xyXG4gICAgICAgICAgICB0aGlzLmJnbVZvbHVtZSA9IHZvbHVtZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSGVscGVyIGZvciBicm93c2VyIGF1dG8tcGxheSBwb2xpY3lcclxuICAgIHJlc3VtZUJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbyAmJiB0aGlzLmJnbUxvb3BpbmcgJiYgdGhpcy5iZ21BdWRpby5wYXVzZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiQ291bGQgbm90IHJlc3VtZSBCR006XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBVSSBDb21wb25lbnRzIC0tLVxyXG5jbGFzcyBCdXR0b24ge1xyXG4gICAgcHJpdmF0ZSB4OiBudW1iZXI7XHJcbiAgICBwcml2YXRlIHk6IG51bWJlcjtcclxuICAgIHByaXZhdGUgd2lkdGg6IG51bWJlcjtcclxuICAgIHByaXZhdGUgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBwcml2YXRlIHRleHQ6IHN0cmluZztcclxuICAgIHByaXZhdGUgY29sb3I6IHN0cmluZztcclxuICAgIHByaXZhdGUgaG92ZXJDb2xvcjogc3RyaW5nO1xyXG4gICAgcHJpdmF0ZSB0ZXh0Q29sb3I6IHN0cmluZztcclxuICAgIHByaXZhdGUgaXNIb3ZlcmVkOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIGNhbGxiYWNrOiAoKSA9PiB2b2lkO1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZm9udDogc3RyaW5nO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxyXG4gICAgICAgIHg6IG51bWJlciwgeTogbnVtYmVyLFxyXG4gICAgICAgIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIHRleHQ6IHN0cmluZyxcclxuICAgICAgICBjb2xvcjogc3RyaW5nLCBob3ZlckNvbG9yOiBzdHJpbmcsIHRleHRDb2xvcjogc3RyaW5nLFxyXG4gICAgICAgIGZvbnQ6IHN0cmluZyxcclxuICAgICAgICBjYWxsYmFjazogKCkgPT4gdm9pZFxyXG4gICAgKSB7XHJcbiAgICAgICAgdGhpcy5jdHggPSBjdHg7XHJcbiAgICAgICAgdGhpcy54ID0geDtcclxuICAgICAgICB0aGlzLnkgPSB5O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLnRleHQgPSB0ZXh0O1xyXG4gICAgICAgIHRoaXMuY29sb3IgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLmhvdmVyQ29sb3IgPSBob3ZlckNvbG9yO1xyXG4gICAgICAgIHRoaXMudGV4dENvbG9yID0gdGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuZm9udCA9IGZvbnQ7XHJcbiAgICAgICAgdGhpcy5jYWxsYmFjayA9IGNhbGxiYWNrO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5pc0hvdmVyZWQgPyB0aGlzLmhvdmVyQ29sb3IgOiB0aGlzLmNvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCAke3RoaXMuaGVpZ2h0IC8gMi41fXB4ICR7dGhpcy5mb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy50ZXh0LCB0aGlzLnggKyB0aGlzLndpZHRoIC8gMiwgdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVNb3VzZU1vdmUobW91c2VYOiBudW1iZXIsIG1vdXNlWTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5pc0hvdmVyZWQgPSAoXHJcbiAgICAgICAgICAgIG1vdXNlWCA+PSB0aGlzLnggJiYgbW91c2VYIDw9IHRoaXMueCArIHRoaXMud2lkdGggJiZcclxuICAgICAgICAgICAgbW91c2VZID49IHRoaXMueSAmJiBtb3VzZVkgPD0gdGhpcy55ICsgdGhpcy5oZWlnaHRcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIGhhbmRsZUNsaWNrKG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIC8vIENoYW5nZWQgdG8gZXhwbGljaXRseSBjaGVjayBib3VuZHMgb24gY2xpY2ssIHJhdGhlciB0aGFuIHJlbHlpbmcgc29sZWx5IG9uIGBpc0hvdmVyZWRgXHJcbiAgICAgICAgaWYgKG1vdXNlWCA+PSB0aGlzLnggJiYgbW91c2VYIDw9IHRoaXMueCArIHRoaXMud2lkdGggJiZcclxuICAgICAgICAgICAgbW91c2VZID49IHRoaXMueSAmJiBtb3VzZVkgPD0gdGhpcy55ICsgdGhpcy5oZWlnaHQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYWxsYmFjaygpO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lVUkge1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgY29uZmlnOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+O1xyXG4gICAgcHJpdmF0ZSBidXR0b25zOiBCdXR0b25bXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50U2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50TGV2ZWw6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHRvdGFsTGV2ZWxzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBjb25maWc6IEdhbWVDb25maWcsIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4pIHtcclxuICAgICAgICB0aGlzLmN0eCA9IGN0eDtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLmltYWdlcyA9IGltYWdlcztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNsZWFyQnV0dG9ucygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmJ1dHRvbnMgPSBbXTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFkZEJ1dHRvbih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRleHQ6IHN0cmluZywgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmJ1dHRvbnMucHVzaChuZXcgQnV0dG9uKFxyXG4gICAgICAgICAgICB0aGlzLmN0eCwgeCwgeSwgd2lkdGgsIGhlaWdodCwgdGV4dCxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcudWlCdXR0b25Db2xvciwgdGhpcy5jb25maWcudWlCdXR0b25Ib3ZlckNvbG9yLCB0aGlzLmNvbmZpZy51aUJ1dHRvblRleHRDb2xvcixcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZUZvbnQsXHJcbiAgICAgICAgICAgIGNhbGxiYWNrXHJcbiAgICAgICAgKSk7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhd1RpdGxlU2NyZWVuKG9uU3RhcnRHYW1lOiAoKSA9PiB2b2lkKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jbGVhckJ1dHRvbnMoKTtcclxuICAgICAgICAvLyBCYWNrZ3JvdW5kIGlzIGRyYXduIGJ5IEFuaW1hbENvbm5lY3RHYW1lLmRyYXcoKVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkIDYwcHggJHt0aGlzLmNvbmZpZy5nYW1lRm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRpdGxlU2NyZWVuVGV4dCwgdGhpcy5jb25maWcuY2FudmFzV2lkdGggLyAyLCB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICBjb25zdCBidXR0b25XaWR0aCA9IDIwMDtcclxuICAgICAgICBjb25zdCBidXR0b25IZWlnaHQgPSA2MDtcclxuICAgICAgICB0aGlzLmFkZEJ1dHRvbihcclxuICAgICAgICAgICAgKHRoaXMuY29uZmlnLmNhbnZhc1dpZHRoIC0gYnV0dG9uV2lkdGgpIC8gMixcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0IC8gMiArIDUwLFxyXG4gICAgICAgICAgICBidXR0b25XaWR0aCwgYnV0dG9uSGVpZ2h0LFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy50aXRsZUJ1dHRvblRleHQsXHJcbiAgICAgICAgICAgIG9uU3RhcnRHYW1lXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLmJ1dHRvbnMuZm9yRWFjaChidG4gPT4gYnRuLmRyYXcoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhd0luc3RydWN0aW9uc1NjcmVlbihvblBsYXlHYW1lOiAoKSA9PiB2b2lkKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jbGVhckJ1dHRvbnMoKTtcclxuICAgICAgICAvLyBCYWNrZ3JvdW5kIGlzIGRyYXduIGJ5IEFuaW1hbENvbm5lY3RHYW1lLmRyYXcoKVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyMHB4ICR7dGhpcy5jb25maWcuZ2FtZUZvbnR9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuXHJcbiAgICAgICAgY29uc3QgbGluZXMgPSB0aGlzLmNvbmZpZy5pbnN0cnVjdGlvbnNUZXh0LnNwbGl0KCdcXG4nKTtcclxuICAgICAgICBjb25zdCBzdGFydFkgPSAxMDA7XHJcbiAgICAgICAgY29uc3QgbGluZUhlaWdodCA9IDMwO1xyXG5cclxuICAgICAgICBsaW5lcy5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChsaW5lLCB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aCAvIDIsIHN0YXJ0WSArIGluZGV4ICogbGluZUhlaWdodCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1dHRvbldpZHRoID0gMjAwO1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvbkhlaWdodCA9IDYwO1xyXG4gICAgICAgIHRoaXMuYWRkQnV0dG9uKFxyXG4gICAgICAgICAgICAodGhpcy5jb25maWcuY2FudmFzV2lkdGggLSBidXR0b25XaWR0aCkgLyAyLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQgLSAxMDAsXHJcbiAgICAgICAgICAgIGJ1dHRvbldpZHRoLCBidXR0b25IZWlnaHQsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmluc3RydWN0aW9uc0J1dHRvblRleHQsXHJcbiAgICAgICAgICAgIG9uUGxheUdhbWVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMuYnV0dG9ucy5mb3JFYWNoKGJ0biA9PiBidG4uZHJhdygpKTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3UGxheWluZ1VJKHNjb3JlOiBudW1iZXIsIHRpbWU6IG51bWJlciwgbGV2ZWw6IG51bWJlciwgdG90YWxMZXZlbHM6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNjb3JlID0gc2NvcmU7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50VGltZSA9IHRpbWU7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWwgPSBsZXZlbDtcclxuICAgICAgICB0aGlzLnRvdGFsTGV2ZWxzID0gdG90YWxMZXZlbHM7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkIDI0cHggJHt0aGlzLmNvbmZpZy5nYW1lRm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAndG9wJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDODEwXHVDMjE4OiAke3RoaXMuY3VycmVudFNjb3JlfWAsIDEwLCAxMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1QjgwOFx1QkNBODogJHt0aGlzLmN1cnJlbnRMZXZlbCArIDF9IC8gJHt0aGlzLnRvdGFsTGV2ZWxzfWAsIDEwLCA0MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdyaWdodCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1QzJEQ1x1QUMwNDogJHtNYXRoLm1heCgwLCBNYXRoLmZsb29yKHRoaXMuY3VycmVudFRpbWUpKX1zYCwgdGhpcy5jb25maWcuY2FudmFzV2lkdGggLSAxMCwgMTApO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXdHYW1lT3ZlclNjcmVlbih3aW46IGJvb2xlYW4sIG9uUmVzdGFydDogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY2xlYXJCdXR0b25zKCk7XHJcbiAgICAgICAgLy8gQmFja2dyb3VuZCBpcyBkcmF3biBieSBBbmltYWxDb25uZWN0R2FtZS5kcmF3KClcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy51aUNvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCA1MHB4ICR7dGhpcy5jb25maWcuZ2FtZUZvbnR9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcclxuICAgICAgICAgICAgd2luID8gdGhpcy5jb25maWcuZ2FtZU92ZXJXaW5UZXh0IDogdGhpcy5jb25maWcuZ2FtZU92ZXJMb3NlVGV4dCxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuY2FudmFzV2lkdGggLyAyLCB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQgLyAyIC0gNTBcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCAzMHB4ICR7dGhpcy5jb25maWcuZ2FtZUZvbnR9YDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDRDVDXHVDODg1IFx1QzgxMFx1QzIxODogJHt0aGlzLmN1cnJlbnRTY29yZX1gLCB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aCAvIDIsIHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodCAvIDIgKyAxMCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1dHRvbldpZHRoID0gMjAwO1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvbkhlaWdodCA9IDYwO1xyXG4gICAgICAgIHRoaXMuYWRkQnV0dG9uKFxyXG4gICAgICAgICAgICAodGhpcy5jb25maWcuY2FudmFzV2lkdGggLSBidXR0b25XaWR0aCkgLyAyLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQgLyAyICsgODAsXHJcbiAgICAgICAgICAgIGJ1dHRvbldpZHRoLCBidXR0b25IZWlnaHQsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVPdmVyQnV0dG9uVGV4dCxcclxuICAgICAgICAgICAgb25SZXN0YXJ0XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLmJ1dHRvbnMuZm9yRWFjaChidG4gPT4gYnRuLmRyYXcoKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlTW91c2VNb3ZlKG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuYnV0dG9ucy5mb3JFYWNoKGJ0biA9PiBidG4uaGFuZGxlTW91c2VNb3ZlKG1vdXNlWCwgbW91c2VZKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlQ2xpY2sobW91c2VYOiBudW1iZXIsIG1vdXNlWTogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgZm9yIChjb25zdCBidG4gb2YgdGhpcy5idXR0b25zKSB7XHJcbiAgICAgICAgICAgIGlmIChidG4uaGFuZGxlQ2xpY2sobW91c2VYLCBtb3VzZVkpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhd0JhY2tncm91bmQoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYmdJbWFnZSA9IHRoaXMuaW1hZ2VzLmdldCgnYmFja2dyb3VuZCcpO1xyXG4gICAgICAgIGlmIChiZ0ltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCAwLCB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aCwgdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnI0FERDhFNic7IC8vIEZhbGxiYWNrIGJhY2tncm91bmQgY29sb3JcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jb25maWcuY2FudmFzV2lkdGgsIHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyAtLS0gR2FtZSBMb2dpYyBDbGFzc2VzIC0tLVxyXG5jbGFzcyBUaWxlIHtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50O1xyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgcHVibGljIHJvdzogbnVtYmVyLFxyXG4gICAgICAgIHB1YmxpYyBjb2w6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgYW5pbWFsVHlwZTogbnVtYmVyLFxyXG4gICAgICAgIGltYWdlTWFwOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PixcclxuICAgICAgICBwdWJsaWMgdGlsZVNpemU6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgdGlsZVBhZGRpbmc6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgYm9hcmRNYXJnaW5YOiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGJvYXJkTWFyZ2luWTpcclxuICAgICAgICBudW1iZXJcclxuICAgICkge1xyXG4gICAgICAgIGNvbnN0IGltYWdlTmFtZSA9IGBhbmltYWxfJHthbmltYWxUeXBlfWA7XHJcbiAgICAgICAgY29uc3QgaW1nID0gaW1hZ2VNYXAuZ2V0KGltYWdlTmFtZSk7XHJcbiAgICAgICAgaWYgKCFpbWcpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbWFnZSBmb3IgYW5pbWFsIHR5cGUgJHthbmltYWxUeXBlfSAoJHtpbWFnZU5hbWV9KSBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSBpbWc7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgaXNTZWxlY3RlZDogYm9vbGVhbiwgc2VsZWN0ZWRPdXRsaW5lQ29sb3I6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHggPSB0aGlzLmJvYXJkTWFyZ2luWCArIHRoaXMuY29sICogKHRoaXMudGlsZVNpemUgKyB0aGlzLnRpbGVQYWRkaW5nKTtcclxuICAgICAgICBjb25zdCB5ID0gdGhpcy5ib2FyZE1hcmdpblkgKyB0aGlzLnJvdyAqICh0aGlzLnRpbGVTaXplICsgdGhpcy50aWxlUGFkZGluZyk7XHJcblxyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgeCwgeSwgdGhpcy50aWxlU2l6ZSwgdGhpcy50aWxlU2l6ZSk7XHJcblxyXG4gICAgICAgIGlmIChpc1NlbGVjdGVkKSB7XHJcbiAgICAgICAgICAgIGN0eC5zdHJva2VTdHlsZSA9IHNlbGVjdGVkT3V0bGluZUNvbG9yO1xyXG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gMztcclxuICAgICAgICAgICAgY3R4LnN0cm9rZVJlY3QoeCwgeSwgdGhpcy50aWxlU2l6ZSwgdGhpcy50aWxlU2l6ZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldEJvdW5kcygpOiB7IHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9IHtcclxuICAgICAgICBjb25zdCB4ID0gdGhpcy5ib2FyZE1hcmdpblggKyB0aGlzLmNvbCAqICh0aGlzLnRpbGVTaXplICsgdGhpcy50aWxlUGFkZGluZyk7XHJcbiAgICAgICAgY29uc3QgeSA9IHRoaXMuYm9hcmRNYXJnaW5ZICsgdGhpcy5yb3cgKiAodGhpcy50aWxlU2l6ZSArIHRoaXMudGlsZVBhZGRpbmcpO1xyXG4gICAgICAgIHJldHVybiB7IHgsIHksIHdpZHRoOiB0aGlzLnRpbGVTaXplLCBoZWlnaHQ6IHRoaXMudGlsZVNpemUgfTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUGF0aGZpbmRlciB7XHJcbiAgICBwcml2YXRlIGJvYXJkOiBCb2FyZDtcclxuICAgIHByaXZhdGUgY29uZmlnOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSByb3dzOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIGNvbHM6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihib2FyZDogQm9hcmQsIGNvbmZpZzogR2FtZUNvbmZpZykge1xyXG4gICAgICAgIHRoaXMuYm9hcmQgPSBib2FyZDtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLnJvd3MgPSBib2FyZC5yb3dzO1xyXG4gICAgICAgIHRoaXMuY29scyA9IGJvYXJkLmNvbHM7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSGVscGVyOiBDaGVjayBpZiBhIGdpdmVuIGNlbGwgKHIsIGMpIGlzIG91dHNpZGUgdGhlIGJvYXJkLCBlbXB0eSwgb3Igb25lIG9mIHRoZSBzZWxlY3RlZCB0aWxlc1xyXG4gICAgcHJpdmF0ZSBfaXNDZWxsQ2xlYXIocjogbnVtYmVyLCBjOiBudW1iZXIsIHNlbGVjdGVkVGlsZTE6IFRpbGUsIHNlbGVjdGVkVGlsZTI6IFRpbGUpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAociA8IDAgfHwgciA+PSB0aGlzLnJvd3MgfHwgYyA8IDAgfHwgYyA+PSB0aGlzLmNvbHMpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7IC8vIE91dHNpZGUgYm9hcmQgaXMgY29uc2lkZXJlZCBjbGVhclxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCB0aWxlQXRQb3MgPSB0aGlzLmJvYXJkLmdldFRpbGUociwgYyk7XHJcbiAgICAgICAgcmV0dXJuIHRpbGVBdFBvcyA9PT0gbnVsbCB8fCB0aWxlQXRQb3MgPT09IHNlbGVjdGVkVGlsZTEgfHwgdGlsZUF0UG9zID09PSBzZWxlY3RlZFRpbGUyO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEhlbHBlcjogQ2hlY2sgaWYgYSBzdHJhaWdodCBsaW5lIHNlZ21lbnQgaXMgY2xlYXJcclxuICAgIHByaXZhdGUgX2lzTGluZUNsZWFyKHIxOiBudW1iZXIsIGMxOiBudW1iZXIsIHIyOiBudW1iZXIsIGMyOiBudW1iZXIsIHNlbGVjdGVkVGlsZTE6IFRpbGUsIHNlbGVjdGVkVGlsZTI6IFRpbGUpOiBib29sZWFuIHtcclxuICAgICAgICAvLyBIb3Jpem9udGFsIGxpbmVcclxuICAgICAgICBpZiAocjEgPT09IHIyKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSBNYXRoLm1pbihjMSwgYzIpICsgMTsgYyA8IE1hdGgubWF4KGMxLCBjMik7IGMrKykge1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9pc0NlbGxDbGVhcihyMSwgYywgc2VsZWN0ZWRUaWxlMSwgc2VsZWN0ZWRUaWxlMikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBWZXJ0aWNhbCBsaW5lXHJcbiAgICAgICAgZWxzZSBpZiAoYzEgPT09IGMyKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IHIgPSBNYXRoLm1pbihyMSwgcjIpICsgMTsgciA8IE1hdGgubWF4KHIxLCByMik7IHIrKykge1xyXG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLl9pc0NlbGxDbGVhcihyLCBjMSwgc2VsZWN0ZWRUaWxlMSwgc2VsZWN0ZWRUaWxlMikpIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBEaWFnb25hbCBvciBub24tc3RyYWlnaHQgbGluZVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE1haW4gcGF0aGZpbmRpbmcgbG9naWNcclxuICAgIGZpbmRQYXRoKHRpbGUxOiBUaWxlLCB0aWxlMjogVGlsZSk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICghdGlsZTEgfHwgIXRpbGUyIHx8IHRpbGUxLmFuaW1hbFR5cGUgIT09IHRpbGUyLmFuaW1hbFR5cGUgfHwgKHRpbGUxLnJvdyA9PT0gdGlsZTIucm93ICYmIHRpbGUxLmNvbCA9PT0gdGlsZTIuY29sKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7IC8vIE5vdCBzYW1lIHR5cGUgb3Igc2FtZSB0aWxlXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCByMSA9IHRpbGUxLnJvdztcclxuICAgICAgICBjb25zdCBjMSA9IHRpbGUxLmNvbDtcclxuICAgICAgICBjb25zdCByMiA9IHRpbGUyLnJvdztcclxuICAgICAgICBjb25zdCBjMiA9IHRpbGUyLmNvbDtcclxuXHJcbiAgICAgICAgLy8gMCBiZW5kcyAoc3RyYWlnaHQgbGluZSlcclxuICAgICAgICBpZiAodGhpcy5faXNMaW5lQ2xlYXIocjEsIGMxLCByMiwgYzIsIHRpbGUxLCB0aWxlMikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyAxIGJlbmQgKEwtc2hhcGUpXHJcbiAgICAgICAgLy8gQ2hlY2sgKHIxLCBjMikgYXMgY29ybmVyXHJcbiAgICAgICAgaWYgKHRoaXMuX2lzQ2VsbENsZWFyKHIxLCBjMiwgdGlsZTEsIHRpbGUyKSAmJlxyXG4gICAgICAgICAgICB0aGlzLl9pc0xpbmVDbGVhcihyMSwgYzEsIHIxLCBjMiwgdGlsZTEsIHRpbGUyKSAmJlxyXG4gICAgICAgICAgICB0aGlzLl9pc0xpbmVDbGVhcihyMSwgYzIsIHIyLCBjMiwgdGlsZTEsIHRpbGUyKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQ2hlY2sgKHIyLCBjMSkgYXMgY29ybmVyXHJcbiAgICAgICAgaWYgKHRoaXMuX2lzQ2VsbENsZWFyKHIyLCBjMSwgdGlsZTEsIHRpbGUyKSAmJlxyXG4gICAgICAgICAgICB0aGlzLl9pc0xpbmVDbGVhcihyMSwgYzEsIHIyLCBjMSwgdGlsZTEsIHRpbGUyKSAmJlxyXG4gICAgICAgICAgICB0aGlzLl9pc0xpbmVDbGVhcihyMiwgYzEsIHIyLCBjMiwgdGlsZTEsIHRpbGUyKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIDIgYmVuZHMgKFosIFUsIEMtc2hhcGUpIC0gaXRlcmF0ZSB0aHJvdWdoIGFsbCBwb3NzaWJsZSBpbnRlcm1lZGlhdGUgY2VsbHMgKGluY2x1ZGluZyBvdXRzaWRlIGJvYXJkKVxyXG4gICAgICAgIGNvbnN0IGV4dGVuZE1pblIgPSAtMTtcclxuICAgICAgICBjb25zdCBleHRlbmRNYXhSID0gdGhpcy5yb3dzO1xyXG4gICAgICAgIGNvbnN0IGV4dGVuZE1pbkMgPSAtMTtcclxuICAgICAgICBjb25zdCBleHRlbmRNYXhDID0gdGhpcy5jb2xzO1xyXG5cclxuICAgICAgICAvLyBQYXRoIChILVYtSCkgdmlhIChyMSwgY19pbnRlcm1lZGlhdGUpIGFuZCAocjIsIGNfaW50ZXJtZWRpYXRlKVxyXG4gICAgICAgIGZvciAobGV0IGNjID0gZXh0ZW5kTWluQzsgY2MgPD0gZXh0ZW5kTWF4QzsgY2MrKykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5faXNDZWxsQ2xlYXIocjEsIGNjLCB0aWxlMSwgdGlsZTIpICYmXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9pc0NlbGxDbGVhcihyMiwgY2MsIHRpbGUxLCB0aWxlMikgJiZcclxuICAgICAgICAgICAgICAgIHRoaXMuX2lzTGluZUNsZWFyKHIxLCBjMSwgcjEsIGNjLCB0aWxlMSwgdGlsZTIpICYmIC8vIEZpcnN0IEggc2VnbWVudFxyXG4gICAgICAgICAgICAgICAgdGhpcy5faXNMaW5lQ2xlYXIocjEsIGNjLCByMiwgY2MsIHRpbGUxLCB0aWxlMikgJiYgLy8gViBzZWdtZW50XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9pc0xpbmVDbGVhcihyMiwgY2MsIHIyLCBjMiwgdGlsZTEsIHRpbGUyKSkgeyAvLyBTZWNvbmQgSCBzZWdtZW50XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUGF0aCAoVi1ILVYpIHZpYSAocl9pbnRlcm1lZGlhdGUsIGMxKSBhbmQgKHJfaW50ZXJtZWRpYXRlLCBjMilcclxuICAgICAgICBmb3IgKGxldCByciA9IGV4dGVuZE1pblI7IHJyIDw9IGV4dGVuZE1heFI7IHJyKyspIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuX2lzQ2VsbENsZWFyKHJyLCBjMSwgdGlsZTEsIHRpbGUyKSAmJlxyXG4gICAgICAgICAgICAgICAgdGhpcy5faXNDZWxsQ2xlYXIocnIsIGMyLCB0aWxlMSwgdGlsZTIpICYmXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9pc0xpbmVDbGVhcihyMSwgYzEsIHJyLCBjMSwgdGlsZTEsIHRpbGUyKSAmJiAvLyBGaXJzdCBWIHNlZ21lbnRcclxuICAgICAgICAgICAgICAgIHRoaXMuX2lzTGluZUNsZWFyKHJyLCBjMSwgcnIsIGMyLCB0aWxlMSwgdGlsZTIpICYmIC8vIEggc2VnbWVudFxyXG4gICAgICAgICAgICAgICAgdGhpcy5faXNMaW5lQ2xlYXIocnIsIGMyLCByMiwgYzIsIHRpbGUxLCB0aWxlMikpIHsgLy8gU2Vjb25kIFYgc2VnbWVudFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBmYWxzZTsgLy8gTm8gcGF0aCBmb3VuZFxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBCb2FyZCB7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWc6IEdhbWVDb25maWc7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD47XHJcbiAgICBwcml2YXRlIF9yb3dzOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIF9jb2xzOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIF90aWxlU2l6ZTogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBfdGlsZVBhZGRpbmc6IG51bWJlcjtcclxuICAgIHByaXZhdGUgX2JvYXJkTWFyZ2luWDogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBfYm9hcmRNYXJnaW5ZOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIF9udW1BbmltYWxUeXBlczogbnVtYmVyO1xyXG5cclxuICAgIHByaXZhdGUgZ3JpZDogKFRpbGUgfCBudWxsKVtdW107XHJcbiAgICBwcml2YXRlIHBhdGhmaW5kZXI6IFBhdGhmaW5kZXI7XHJcblxyXG4gICAgZ2V0IHJvd3MoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX3Jvd3M7IH1cclxuICAgIGdldCBjb2xzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9jb2xzOyB9XHJcblxyXG4gICAgY29uc3RydWN0b3IoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGNvbmZpZzogR2FtZUNvbmZpZywgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50Pikge1xyXG4gICAgICAgIHRoaXMuY3R4ID0gY3R4O1xyXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xyXG4gICAgICAgIHRoaXMuaW1hZ2VzID0gaW1hZ2VzO1xyXG4gICAgfVxyXG5cclxuICAgIGluaXQobGV2ZWxDb25maWc6IExldmVsQ29uZmlnKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5fcm93cyA9IGxldmVsQ29uZmlnLnJvd3M7XHJcbiAgICAgICAgdGhpcy5fY29scyA9IGxldmVsQ29uZmlnLmNvbHM7XHJcbiAgICAgICAgdGhpcy5fdGlsZVNpemUgPSB0aGlzLmNvbmZpZy5iYXNlVGlsZVNpemU7XHJcbiAgICAgICAgdGhpcy5fdGlsZVBhZGRpbmcgPSB0aGlzLmNvbmZpZy50aWxlUGFkZGluZztcclxuICAgICAgICB0aGlzLl9ib2FyZE1hcmdpblggPSB0aGlzLmNvbmZpZy5ib2FyZE1hcmdpblg7XHJcbiAgICAgICAgdGhpcy5fYm9hcmRNYXJnaW5ZID0gdGhpcy5jb25maWcuYm9hcmRNYXJnaW5ZO1xyXG4gICAgICAgIHRoaXMuX251bUFuaW1hbFR5cGVzID0gbGV2ZWxDb25maWcubnVtQW5pbWFsVHlwZXM7XHJcblxyXG4gICAgICAgIHRoaXMuZ3JpZCA9IEFycmF5LmZyb20oeyBsZW5ndGg6IHRoaXMuX3Jvd3MgfSwgKCkgPT4gQXJyYXkodGhpcy5fY29scykuZmlsbChudWxsKSk7XHJcbiAgICAgICAgdGhpcy5wYXRoZmluZGVyID0gbmV3IFBhdGhmaW5kZXIodGhpcywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIHRoaXMuZ2VuZXJhdGVCb2FyZCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2VuZXJhdGVCb2FyZCgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB0b3RhbFRpbGVzID0gdGhpcy5fcm93cyAqIHRoaXMuX2NvbHM7XHJcbiAgICAgICAgaWYgKHRvdGFsVGlsZXMgJSAyICE9PSAwKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJCb2FyZCBzaXplIG11c3QgYmUgZXZlbiBmb3IgdGlsZSBwYWlyaW5nLlwiKTtcclxuICAgICAgICAgICAgLy8gRm9yY2luZyBhbiBldmVuIG51bWJlciBvZiB0aWxlcywgYnkgcmVtb3ZpbmcgdGhlIGxhc3QgdGlsZSBpZiBib2FyZCBpcyBvZGQuXHJcbiAgICAgICAgICAgIC8vIFRoaXMgbmVlZHMgY2FyZWZ1bCBjb25zaWRlcmF0aW9uIGlmIHNwZWNpZmljIGRpbWVuc2lvbnMgYXJlIGFsd2F5cyBvZGQuXHJcbiAgICAgICAgICAgIC8vIEEgYmV0dGVyIHNvbHV0aW9uIHdvdWxkIGJlIHRvIGFsd2F5cyBjb25maWd1cmUgZXZlbiBkaW1lbnNpb25zIGluIGRhdGEuanNvbi5cclxuICAgICAgICAgICAgaWYgKHRoaXMuX2NvbHMgJSAyICE9PSAwKSB7IC8vIElmIGNvbHMgaXMgb2RkLCBtYWtlIGl0IGV2ZW4gZm9yIGNvbnNpc3RlbmN5LlxyXG4gICAgICAgICAgICAgICAgdGhpcy5fY29scy0tO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0aGlzLl9yb3dzICUgMiAhPT0gMCAmJiB0aGlzLl9jb2xzICUgMiAhPT0gMCkgeyAvLyBpZiBib3RoIGFyZSBvZGQsIGp1c3QgdHJ5IHRvIG1ha2UgY29scyBldmVuXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9yb3dzLS07XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKCh0aGlzLl9yb3dzICogdGhpcy5fY29scykgJSAyICE9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQm9hcmQgZGltZW5zaW9ucyBzdGlsbCByZXN1bHQgaW4gb2RkIHRpbGUgY291bnQgYWZ0ZXIgYWRqdXN0bWVudC4gR2FtZSBtaWdodCBiZSB1bnBsYXlhYmxlLlwiKTtcclxuICAgICAgICAgICAgICAgIC8vIEFzIGEgbGFzdCByZXNvcnQsIGp1c3QgcmVzZXQgY29scyB0byBiZSAxIGxlc3MgdG8gZm9yY2UgZXZlblxyXG4gICAgICAgICAgICAgICAgdGhpcy5fY29scyA9IE1hdGgubWF4KDIsIHRoaXMuX2NvbHMgLSAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBjdXJyZW50VG90YWxUaWxlcyA9IHRoaXMuX3Jvd3MgKiB0aGlzLl9jb2xzO1xyXG4gICAgICAgIGNvbnN0IGFuaW1hbFR5cGVzOiBudW1iZXJbXSA9IFtdO1xyXG4gICAgICAgIC8vIEVuc3VyZSBlYWNoIGFuaW1hbCB0eXBlIGFwcGVhcnMgYW4gZXZlbiBudW1iZXIgb2YgdGltZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGN1cnJlbnRUb3RhbFRpbGVzIC8gMjsgaSsrKSB7XHJcbiAgICAgICAgICAgIGFuaW1hbFR5cGVzLnB1c2goKGkgJSB0aGlzLl9udW1BbmltYWxUeXBlcykgKyAxKTtcclxuICAgICAgICAgICAgYW5pbWFsVHlwZXMucHVzaCgoaSAlIHRoaXMuX251bUFuaW1hbFR5cGVzKSArIDEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRmlzaGVyLVlhdGVzIHNodWZmbGVcclxuICAgICAgICBmb3IgKGxldCBpID0gYW5pbWFsVHlwZXMubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xyXG4gICAgICAgICAgICBjb25zdCBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGkgKyAxKSk7XHJcbiAgICAgICAgICAgIFthbmltYWxUeXBlc1tpXSwgYW5pbWFsVHlwZXNbal1dID0gW2FuaW1hbFR5cGVzW2pdLCBhbmltYWxUeXBlc1tpXV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgYW5pbWFsSW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgdGhpcy5fcm93czsgcisrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgdGhpcy5fY29sczsgYysrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYW5pbWFsSW5kZXggPCBhbmltYWxUeXBlcy5sZW5ndGgpIHsgLy8gRW5zdXJlIHdlIGRvbid0IGdvIG91dCBvZiBib3VuZHMgaWYgY3VycmVudFRvdGFsVGlsZXMgd2FzIGFkanVzdGVkXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmlkW3JdW2NdID0gbmV3IFRpbGUoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHIsIGMsIGFuaW1hbFR5cGVzW2FuaW1hbEluZGV4KytdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmltYWdlcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdGlsZVNpemUsIHRoaXMuX3RpbGVQYWRkaW5nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9ib2FyZE1hcmdpblgsIHRoaXMuX2JvYXJkTWFyZ2luWVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JpZFtyXVtjXSA9IG51bGw7IC8vIEZpbGwgcmVtYWluaW5nIHdpdGggbnVsbCBpZiBib2FyZCBzaXplIHdhcyByZWR1Y2VkXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhzZWxlY3RlZFRpbGU6IFRpbGUgfCBudWxsKTogdm9pZCB7XHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCB0aGlzLl9yb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCB0aGlzLl9jb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRpbGUgPSB0aGlzLmdyaWRbcl1bY107XHJcbiAgICAgICAgICAgICAgICBpZiAodGlsZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRpbGUuZHJhdyh0aGlzLmN0eCwgdGlsZSA9PT0gc2VsZWN0ZWRUaWxlLCB0aGlzLmNvbmZpZy5zZWxlY3RlZFRpbGVPdXRsaW5lQ29sb3IpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldFRpbGVBdChtb3VzZVg6IG51bWJlciwgbW91c2VZOiBudW1iZXIpOiBUaWxlIHwgbnVsbCB7XHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCB0aGlzLl9yb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCB0aGlzLl9jb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRpbGUgPSB0aGlzLmdyaWRbcl1bY107XHJcbiAgICAgICAgICAgICAgICBpZiAodGlsZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJvdW5kcyA9IHRpbGUuZ2V0Qm91bmRzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1vdXNlWCA+PSBib3VuZHMueCAmJiBtb3VzZVggPCBib3VuZHMueCArIGJvdW5kcy53aWR0aCAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtb3VzZVkgPj0gYm91bmRzLnkgJiYgbW91c2VZIDwgYm91bmRzLnkgKyBib3VuZHMuaGVpZ2h0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aWxlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBnZXRUaWxlKHI6IG51bWJlciwgYzogbnVtYmVyKTogVGlsZSB8IG51bGwge1xyXG4gICAgICAgIGlmIChyIDwgMCB8fCByID49IHRoaXMuX3Jvd3MgfHwgYyA8IDAgfHwgYyA+PSB0aGlzLl9jb2xzKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsOyAvLyBPdXRzaWRlIGJvYXJkXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLmdyaWRbcl1bY107XHJcbiAgICB9XHJcblxyXG4gICAgY2hlY2tNYXRjaCh0aWxlMTogVGlsZSwgdGlsZTI6IFRpbGUpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wYXRoZmluZGVyLmZpbmRQYXRoKHRpbGUxLCB0aWxlMik7XHJcbiAgICB9XHJcblxyXG4gICAgcmVtb3ZlVGlsZXModGlsZTE6IFRpbGUsIHRpbGUyOiBUaWxlKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5ncmlkW3RpbGUxLnJvd11bdGlsZTEuY29sXSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5ncmlkW3RpbGUyLnJvd11bdGlsZTIuY29sXSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgaXNCb2FyZENsZWFyKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgdGhpcy5fcm93czsgcisrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgdGhpcy5fY29sczsgYysrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5ncmlkW3JdW2NdICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE9wdGlvbmFsOiBDaGVjayBpZiB0aGVyZSBhcmUgYW55IHZhbGlkIG1vdmVzIHJlbWFpbmluZyAoY2FuIGJlIGV4cGVuc2l2ZSlcclxuICAgIGhhc1JlbWFpbmluZ01hdGNoZXMoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgY29uc3QgYWN0aXZlVGlsZXM6IFRpbGVbXSA9IFtdO1xyXG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgdGhpcy5fcm93czsgcisrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgdGhpcy5fY29sczsgYysrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5ncmlkW3JdW2NdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYWN0aXZlVGlsZXMucHVzaCh0aGlzLmdyaWRbcl1bY10hKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGFjdGl2ZVRpbGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFjdGl2ZVRpbGVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGogPSBpICsgMTsgaiA8IGFjdGl2ZVRpbGVzLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aWxlMSA9IGFjdGl2ZVRpbGVzW2ldO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGlsZTIgPSBhY3RpdmVUaWxlc1tqXTtcclxuICAgICAgICAgICAgICAgIGlmICh0aWxlMS5hbmltYWxUeXBlID09PSB0aWxlMi5hbmltYWxUeXBlICYmIHRoaXMucGF0aGZpbmRlci5maW5kUGF0aCh0aWxlMSwgdGlsZTIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE9wdGlvbmFsOiBTaHVmZmxlIHJlbWFpbmluZyB0aWxlcyBpZiBubyBtYXRjaGVzIGFyZSBsZWZ0XHJcbiAgICBzaHVmZmxlKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRBY3RpdmVUaWxlczogVGlsZVtdID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCB0aGlzLl9yb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCB0aGlzLl9jb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbcl1bY10pIHtcclxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50QWN0aXZlVGlsZXMucHVzaCh0aGlzLmdyaWRbcl1bY10hKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdyaWRbcl1bY10gPSBudWxsOyAvLyBDbGVhciBvbGQgcG9zaXRpb25zXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEV4dHJhY3QgYW5pbWFsIHR5cGVzIHRvIHNodWZmbGVcclxuICAgICAgICBjb25zdCBhbmltYWxUeXBlc1RvU2h1ZmZsZSA9IGN1cnJlbnRBY3RpdmVUaWxlcy5tYXAodGlsZSA9PiB0aWxlLmFuaW1hbFR5cGUpO1xyXG5cclxuICAgICAgICAvLyBTaHVmZmxlIHRoZSBhbmltYWwgdHlwZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gYW5pbWFsVHlwZXNUb1NodWZmbGUubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xyXG4gICAgICAgICAgICBjb25zdCBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGkgKyAxKSk7XHJcbiAgICAgICAgICAgIFthbmltYWxUeXBlc1RvU2h1ZmZsZVtpXSwgYW5pbWFsVHlwZXNUb1NodWZmbGVbal1dID0gW2FuaW1hbFR5cGVzVG9TaHVmZmxlW2pdLCBhbmltYWxUeXBlc1RvU2h1ZmZsZVtpXV07XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZXBvcHVsYXRlIGdyaWQgd2l0aCBzaHVmZmxlZCB0eXBlc1xyXG4gICAgICAgIGxldCB0eXBlSW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgdGhpcy5fcm93czsgcisrKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgdGhpcy5fY29sczsgYysrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZUluZGV4IDwgYW5pbWFsVHlwZXNUb1NodWZmbGUubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5ncmlkW3JdW2NdID0gbmV3IFRpbGUoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHIsIGMsIGFuaW1hbFR5cGVzVG9TaHVmZmxlW3R5cGVJbmRleCsrXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZXMsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3RpbGVTaXplLCB0aGlzLl90aWxlUGFkZGluZyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fYm9hcmRNYXJnaW5YLCB0aGlzLl9ib2FyZE1hcmdpbllcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdyaWRbcl1bY10gPSBudWxsOyAvLyBFbnN1cmUgY2VsbHMgYXJlIG51bGwgaWYgdGhlcmUgYXJlIGZld2VyIHRpbGVzIGFmdGVyIHNodWZmbGUgKHVubGlrZWx5IHdpdGggZXZlbiB0b3RhbCB0aWxlcylcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIE1haW4gR2FtZSBDbGFzcyAtLS1cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEVfU0NSRUVOLFxyXG4gICAgSU5TVFJVQ1RJT05TX1NDUkVFTixcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVJfV0lOLFxyXG4gICAgR0FNRV9PVkVSX0xPU0VcclxufVxyXG5cclxuY2xhc3MgQW5pbWFsQ29ubmVjdEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgY29uZmlnOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+O1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+O1xyXG5cclxuICAgIHByaXZhdGUgYXVkaW9NYW5hZ2VyOiBBdWRpb01hbmFnZXI7XHJcbiAgICBwcml2YXRlIHVpOiBHYW1lVUk7XHJcbiAgICBwcml2YXRlIGJvYXJkOiBCb2FyZDtcclxuXHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFX1NDUkVFTjtcclxuXHJcbiAgICBwcml2YXRlIGN1cnJlbnRMZXZlbEluZGV4OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgdGltZVJlbWFpbmluZzogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgc2VsZWN0ZWRUaWxlOiBUaWxlIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGxhc3RNYXRjaENoZWNrVGltZTogbnVtYmVyID0gMDsgLy8gVG8gcHJldmVudCByYXBpZCBkb3VibGUgY2xpY2tzXHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzRWxlbWVudElkOiBzdHJpbmcsIGNvbmZpZzogR2FtZUNvbmZpZywgYXNzZXRzOiB7IGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4sIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gfSkge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzRWxlbWVudElkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xyXG4gICAgICAgIHRoaXMuaW1hZ2VzID0gYXNzZXRzLmltYWdlcztcclxuICAgICAgICB0aGlzLnNvdW5kcyA9IGFzc2V0cy5zb3VuZHM7XHJcblxyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jb25maWcuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlciA9IG5ldyBBdWRpb01hbmFnZXIodGhpcy5zb3VuZHMpO1xyXG4gICAgICAgIHRoaXMudWkgPSBuZXcgR2FtZVVJKHRoaXMuY3R4LCB0aGlzLmNvbmZpZywgdGhpcy5pbWFnZXMpO1xyXG4gICAgICAgIHRoaXMuYm9hcmQgPSBuZXcgQm9hcmQodGhpcy5jdHgsIHRoaXMuY29uZmlnLCB0aGlzLmltYWdlcyk7XHJcblxyXG4gICAgICAgIHRoaXMuc2V0dXBFdmVudExpc3RlbmVycygpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBFdmVudExpc3RlbmVycygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2xpY2suYmluZCh0aGlzKSk7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5oYW5kbGVNb3VzZU1vdmUuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaW5pdCgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN1cnJlbnRMZXZlbEluZGV4ID0gMDtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLnNlbGVjdGVkVGlsZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOO1xyXG4gICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnN0b3BCR00oKTtcclxuICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5wbGF5KCdiZ21fbG9vcCcsIHRydWUsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbV9sb29wJyk/LnZvbHVtZSB8fCAwLjMpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRMZXZlbChsZXZlbEluZGV4OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAobGV2ZWxJbmRleCA+PSB0aGlzLmNvbmZpZy5sZXZlbHMubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU47XHJcbiAgICAgICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnBsYXkoJ2xldmVsX2NvbXBsZXRlJywgZmFsc2UsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2xldmVsX2NvbXBsZXRlJyk/LnZvbHVtZSB8fCAwLjgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN1cnJlbnRMZXZlbEluZGV4ID0gbGV2ZWxJbmRleDtcclxuICAgICAgICBjb25zdCBsZXZlbENvbmZpZyA9IHRoaXMuY29uZmlnLmxldmVsc1t0aGlzLmN1cnJlbnRMZXZlbEluZGV4XTtcclxuICAgICAgICB0aGlzLnRpbWVSZW1haW5pbmcgPSBsZXZlbENvbmZpZy50aW1lTGltaXRTZWNvbmRzO1xyXG4gICAgICAgIHRoaXMuc2VsZWN0ZWRUaWxlID0gbnVsbDtcclxuICAgICAgICB0aGlzLmJvYXJkLmluaXQobGV2ZWxDb25maWcpO1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVDbGljayhldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSB0aGlzLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBtb3VzZVggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xyXG4gICAgICAgIGNvbnN0IG1vdXNlWSA9IGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcDtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMudWkuaGFuZGxlQ2xpY2sobW91c2VYLCBtb3VzZVkpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnJlc3VtZUJHTSgpOyAvLyBUcnkgdG8gcmVzdW1lIEJHTSBhZnRlciB1c2VyIGludGVyYWN0aW9uXHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gVUkgYnV0dG9uIGNsaWNrIGhhbmRsZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgY29uc3QgY2xpY2tlZFRpbGUgPSB0aGlzLmJvYXJkLmdldFRpbGVBdChtb3VzZVgsIG1vdXNlWSk7XHJcbiAgICAgICAgICAgIGlmIChjbGlja2VkVGlsZSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2VsZWN0ZWRUaWxlID09PSBjbGlja2VkVGlsZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIERlc2VsZWN0IHNhbWUgdGlsZVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0ZWRUaWxlID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5wbGF5KCd0aWxlX3NlbGVjdCcsIGZhbHNlLCB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICd0aWxlX3NlbGVjdCcpPy52b2x1bWUgfHwgMC43KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5zZWxlY3RlZFRpbGUgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBTZWxlY3QgZmlyc3QgdGlsZVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0ZWRUaWxlID0gY2xpY2tlZFRpbGU7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheSgndGlsZV9zZWxlY3QnLCBmYWxzZSwgdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAndGlsZV9zZWxlY3QnKT8udm9sdW1lIHx8IDAuNyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFNlY29uZCB0aWxlIHNlbGVjdGVkLCBhdHRlbXB0IG1hdGNoXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGlsZTEgPSB0aGlzLnNlbGVjdGVkVGlsZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB0aWxlMiA9IGNsaWNrZWRUaWxlO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0ZWRUaWxlID0gbnVsbDsgLy8gQ2xlYXIgc2VsZWN0aW9uIGltbWVkaWF0ZWx5XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmJvYXJkLmNoZWNrTWF0Y2godGlsZTEsIHRpbGUyKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmJvYXJkLnJlbW92ZVRpbGVzKHRpbGUxLCB0aWxlMik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gdGhpcy5jb25maWcubWF0Y2hTY29yZSAqIHRoaXMuY29uZmlnLmxldmVsc1t0aGlzLmN1cnJlbnRMZXZlbEluZGV4XS5zY29yZU11bHRpcGxpZXI7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnBsYXkoJ3RpbGVfbWF0Y2gnLCBmYWxzZSwgdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAndGlsZV9tYXRjaCcpPy52b2x1bWUgfHwgMC43KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuYm9hcmQuaXNCb2FyZENsZWFyKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnBsYXkoJ2xldmVsX2NvbXBsZXRlJywgZmFsc2UsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2xldmVsX2NvbXBsZXRlJyk/LnZvbHVtZSB8fCAwLjgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGFydExldmVsKHRoaXMuY3VycmVudExldmVsSW5kZXggKyAxKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICghdGhpcy5ib2FyZC5oYXNSZW1haW5pbmdNYXRjaGVzKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBubyBtYXRjaGVzIGxlZnQgYW5kIGJvYXJkIGlzIG5vdCBjbGVhciwgc2h1ZmZsZSBhbmQgcGVuYWxpemVcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBtb3JlIG1hdGNoZXMgYXZhaWxhYmxlIG9uIGJvYXJkLCBzaHVmZmxpbmchXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYm9hcmQuc2h1ZmZsZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGltZVJlbWFpbmluZyAtPSB0aGlzLmNvbmZpZy5wZW5hbHR5VGltZTsgLy8gUGVuYWxpemUgZm9yIGZvcmNpbmcgYSBzaHVmZmxlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheSgnd3JvbmdfbWF0Y2gnLCBmYWxzZSwgdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnd3JvbmdfbWF0Y2gnKT8udm9sdW1lIHx8IDAuNyk7IC8vIFJldXNlIHdyb25nIG1hdGNoIHNvdW5kXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMudGltZVJlbWFpbmluZyA8PSAwKSB7IC8vIENoZWNrIGZvciBnYW1lIG92ZXIgYWZ0ZXIgcGVuYWx0eVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWVSZW1haW5pbmcgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheSgnZ2FtZV9vdmVyJywgZmFsc2UsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2dhbWVfb3ZlcicpPy52b2x1bWUgfHwgMC44KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBNaXNtYXRjaFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRpbWVSZW1haW5pbmcgLT0gdGhpcy5jb25maWcucGVuYWx0eVRpbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnBsYXkoJ3dyb25nX21hdGNoJywgZmFsc2UsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ3dyb25nX21hdGNoJyk/LnZvbHVtZSB8fCAwLjcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy50aW1lUmVtYWluaW5nIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGltZVJlbWFpbmluZyA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnBsYXkoJ2dhbWVfb3ZlcicsIGZhbHNlLCB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdnYW1lX292ZXInKT8udm9sdW1lIHx8IDAuOCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVNb3VzZU1vdmUoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gdGhpcy5jYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgbW91c2VYID0gZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdDtcclxuICAgICAgICBjb25zdCBtb3VzZVkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XHJcbiAgICAgICAgdGhpcy51aS5oYW5kbGVNb3VzZU1vdmUobW91c2VYLCBtb3VzZVkpO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy50aW1lUmVtYWluaW5nIC09IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMudGltZVJlbWFpbmluZyA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRpbWVSZW1haW5pbmcgPSAwO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSX0xPU0U7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5wbGF5KCdnYW1lX292ZXInLCBmYWxzZSwgdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnZ2FtZV9vdmVyJyk/LnZvbHVtZSB8fCAwLjgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVCYWNrZ3JvdW5kKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMudWkuZHJhd0JhY2tncm91bmQoKTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmRyYXdHYW1lQmFja2dyb3VuZCgpOyAvLyBBbHdheXMgZHJhdyBiYWNrZ3JvdW5kIGZpcnN0XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51aS5kcmF3VGl0bGVTY3JlZW4oKCkgPT4gdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TX1NDUkVFTik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgIHRoaXMudWkuZHJhd0luc3RydWN0aW9uc1NjcmVlbigoKSA9PiB0aGlzLnN0YXJ0TGV2ZWwoMCkpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvYXJkLmRyYXcodGhpcy5zZWxlY3RlZFRpbGUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51aS5kcmF3UGxheWluZ1VJKHRoaXMuc2NvcmUsIHRoaXMudGltZVJlbWFpbmluZywgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCwgdGhpcy5jb25maWcubGV2ZWxzLmxlbmd0aCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSX1dJTjpcclxuICAgICAgICAgICAgICAgIHRoaXMudWkuZHJhd0dhbWVPdmVyU2NyZWVuKHRydWUsICgpID0+IHRoaXMuaW5pdCgpKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRTpcclxuICAgICAgICAgICAgICAgIHRoaXMudWkuZHJhd0dhbWVPdmVyU2NyZWVuKGZhbHNlLCAoKSA9PiB0aGlzLmluaXQoKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBHYW1lIEluaXRpYWxpemF0aW9uIC0tLVxyXG5sZXQgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcbmxldCBkZWx0YVRpbWU6IG51bWJlciA9IDA7XHJcbmxldCBnYW1lSW5zdGFuY2U6IEFuaW1hbENvbm5lY3RHYW1lIHwgbnVsbCA9IG51bGw7XHJcblxyXG5mdW5jdGlvbiBnYW1lTG9vcChjdXJyZW50VGltZTogbnVtYmVyKSB7XHJcbiAgICBpZiAoIWxhc3RUaW1lKSBsYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG4gICAgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gbGFzdFRpbWUpIC8gMTAwMDsgLy8gZGVsdGEgdGltZSBpbiBzZWNvbmRzXHJcbiAgICBsYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgIGlmIChnYW1lSW5zdGFuY2UpIHtcclxuICAgICAgICBnYW1lSW5zdGFuY2UudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgZ2FtZUluc3RhbmNlLmRyYXcoKTtcclxuICAgIH1cclxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShnYW1lTG9vcCk7XHJcbn1cclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG5cclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQuIFBsZWFzZSBlbnN1cmUgeW91ciBIVE1MIGluY2x1ZGVzIDxjYW52YXMgaWQ9XCJnYW1lQ2FudmFzXCI+PC9jYW52YXM+LicpO1xyXG4gICAgICAgIGNvbnN0IGVycm9yRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgZXJyb3JEaXYuc3R5bGUuY29sb3IgPSAncmVkJztcclxuICAgICAgICBlcnJvckRpdi5zdHlsZS50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICBlcnJvckRpdi5zdHlsZS5tYXJnaW5Ub3AgPSAnNTBweCc7XHJcbiAgICAgICAgZXJyb3JEaXYuc3R5bGUuZm9udEZhbWlseSA9ICdzYW5zLXNlcmlmJztcclxuICAgICAgICBlcnJvckRpdi5pbm5lclRleHQgPSAnXHVDNjI0XHVCOTU4OiBcdUFDOENcdUM3ODQgXHVDRTk0XHVCQzg0XHVDMkE0IChJRCBcImdhbWVDYW52YXNcIilcdUI5N0MgXHVDQzNFXHVDNzQ0IFx1QzIxOCBcdUM1QzZcdUMyQjVcdUIyQzhcdUIyRTQuIEhUTUwgXHVEMzBDXHVDNzdDXHVDNUQwIDxjYW52YXMgaWQ9XCJnYW1lQ2FudmFzXCI+PC9jYW52YXM+IFx1QzY5NFx1QzE4Q1x1QUMwMCBcdUM3ODhcdUIyOTRcdUM5QzAgXHVENjU1XHVDNzc4XHVENTc0XHVDOEZDXHVDMTM4XHVDNjk0Lic7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICAgICAgcmV0dXJuOyAvLyBTdG9wIGV4ZWN1dGlvbiBpZiBjYW52YXMgaXMgbm90IGZvdW5kXHJcbiAgICB9XHJcblxyXG4gICAgZmV0Y2goJ2RhdGEuanNvbicpXHJcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC50aGVuKGFzeW5jIChkYXRhOiBHYW1lQ29uZmlnKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFzc2V0TG9hZGVyID0gbmV3IEFzc2V0TG9hZGVyKCk7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsb2FkZWRBc3NldHMgPSBhd2FpdCBhc3NldExvYWRlci5sb2FkKGRhdGEuYXNzZXRzKTtcclxuICAgICAgICAgICAgICAgIGdhbWVJbnN0YW5jZSA9IG5ldyBBbmltYWxDb25uZWN0R2FtZSgnZ2FtZUNhbnZhcycsIGRhdGEsIGxvYWRlZEFzc2V0cyk7XHJcbiAgICAgICAgICAgICAgICBnYW1lSW5zdGFuY2UuaW5pdCgpO1xyXG4gICAgICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTsgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBnYW1lIGFzc2V0czonLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcclxuICAgICAgICAgICAgICAgIGlmIChjdHgpIHtcclxuICAgICAgICAgICAgICAgICAgICBjdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdyZWQnO1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICAgICAgICAgICAgICBjdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxUZXh0KCdcdUFDOENcdUM3ODQgXHVDNUQwXHVDMTRCIFx1Qjg1Q1x1QjREQyBcdUM5MTEgXHVDNjI0XHVCOTU4IFx1QkMxQ1x1QzBERDogJyArIChlcnJvciBhcyBFcnJvcikubWVzc2FnZSwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIGdhbWUgZGF0YTonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIERpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBkaXJlY3RseSBvbiB0aGUgY2FudmFzIGlmIGxvYWRpbmcgZmFpbHNcclxuICAgICAgICAgICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XHJcbiAgICAgICAgICAgIGlmIChjdHgpIHtcclxuICAgICAgICAgICAgICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICAgICAgICAgIGN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgICAgICAgICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICAgICAgY3R4LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xyXG4gICAgICAgICAgICAgICAgY3R4LmZpbGxUZXh0KCdcdUFDOENcdUM3ODQgXHVCODVDXHVCNERDIFx1QzkxMSBcdUM2MjRcdUI5NTggXHVCQzFDXHVDMEREOiAnICsgZXJyb3IubWVzc2FnZSwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUFzREEsTUFBTSxRQUFRO0FBQUEsRUFDVixZQUFtQixHQUFrQixHQUFXO0FBQTdCO0FBQWtCO0FBQUEsRUFBWTtBQUNyRDtBQUdBLE1BQU0sWUFBWTtBQUFBLEVBTWQsY0FBYztBQUxkLFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQUN4RCxTQUFRLFNBQXdDLG9CQUFJLElBQUk7QUFDeEQsU0FBUSxjQUFzQjtBQUM5QixTQUFRLGVBQXVCO0FBQUEsRUFFaEI7QUFBQSxFQUVmLE1BQU0sS0FBSyxjQUF1SDtBQUM5SCxVQUFNLGdCQUFnQixhQUFhLE9BQU8sSUFBSSxTQUFPLEtBQUssVUFBVSxHQUFHLENBQUM7QUFDeEUsVUFBTSxnQkFBZ0IsYUFBYSxPQUFPLElBQUksU0FBTyxLQUFLLFVBQVUsR0FBRyxDQUFDO0FBRXhFLFNBQUssY0FBYyxjQUFjLFNBQVMsY0FBYztBQUN4RCxTQUFLLGVBQWU7QUFFcEIsVUFBTSxRQUFRLElBQUksQ0FBQyxHQUFHLGVBQWUsR0FBRyxhQUFhLENBQUM7QUFDdEQsV0FBTyxFQUFFLFFBQVEsS0FBSyxRQUFRLFFBQVEsS0FBSyxPQUFPO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLFVBQVUsYUFBOEM7QUFDNUQsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDcEMsWUFBTSxNQUFNLElBQUksTUFBTTtBQUN0QixVQUFJLE1BQU0sWUFBWTtBQUN0QixVQUFJLFNBQVMsTUFBTTtBQUNmLGFBQUssT0FBTyxJQUFJLFlBQVksTUFBTSxHQUFHO0FBQ3JDLGFBQUs7QUFDTCxnQkFBUSxJQUFJLGlCQUFpQixZQUFZLElBQUksS0FBSyxLQUFLLFlBQVksSUFBSSxLQUFLLFdBQVcsR0FBRztBQUMxRixnQkFBUTtBQUFB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QUN2QyxhQUFXO0FBRVgsTUFBSSxjQUFjO0FBQ2QsaUJBQWEsT0FBTyxTQUFTO0FBQzdCLGlCQUFhLEtBQUs7QUFBQSxFQUN0QjtBQUNBLHdCQUFzQixRQUFRO0FBQ2xDO0FBRUEsU0FBUyxpQkFBaUIsb0JBQW9CLE1BQU07QUFDaEQsUUFBTSxTQUFTLFNBQVMsZUFBZSxZQUFZO0FBRW5ELE1BQUksQ0FBQyxRQUFRO0FBQ1QsWUFBUSxNQUFNLG9IQUFvSDtBQUNsSSxVQUFNLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDN0MsYUFBUyxNQUFNLFFBQVE7QUFDdkIsYUFBUyxNQUFNLFlBQVk7QUFDM0IsYUFBUyxNQUFNLFlBQVk7QUFDM0IsYUFBUyxNQUFNLGFBQWE7QUFDNUIsYUFBUyxZQUFZO0FBQ3JCLGFBQVMsS0FBSyxZQUFZLFFBQVE7QUFDbEM7QUFBQSxFQUNKO0FBRUEsUUFBTSxXQUFXLEVBQ1osS0FBSyxjQUFZO0FBQ2QsUUFBSSxDQUFDLFNBQVMsSUFBSTtBQUNkLFlBQU0sSUFBSSxNQUFNLHVCQUF1QixTQUFTLE1BQU0sRUFBRTtBQUFBLElBQzVEO0FBQ0EsV0FBTyxTQUFTLEtBQUs7QUFBQSxFQUN6QixDQUFDLEVBQ0EsS0FBSyxPQUFPLFNBQXFCO0FBQzlCLFVBQU0sY0FBYyxJQUFJLFlBQVk7QUFDcEMsUUFBSTtBQUNBLFlBQU0sZUFBZSxNQUFNLFlBQVksS0FBSyxLQUFLLE1BQU07QUFDdkQscUJBQWUsSUFBSSxrQkFBa0IsY0FBYyxNQUFNLFlBQVk7QUFDckUsbUJBQWEsS0FBSztBQUNsQiw0QkFBc0IsUUFBUTtBQUFBLElBQ2xDLFNBQVMsT0FBTztBQUNaLGNBQVEsTUFBTSw4QkFBOEIsS0FBSztBQUNqRCxZQUFNLE1BQU0sT0FBTyxXQUFXLElBQUk7QUFDbEMsVUFBSSxLQUFLO0FBQ0wsWUFBSSxVQUFVLEdBQUcsR0FBRyxPQUFPLE9BQU8sT0FBTyxNQUFNO0FBQy9DLFlBQUksWUFBWTtBQUNoQixZQUFJLE9BQU87QUFDWCxZQUFJLFlBQVk7QUFDaEIsWUFBSSxlQUFlO0FBQ25CLFlBQUksU0FBUyw4RUFBd0IsTUFBZ0IsU0FBUyxPQUFPLFFBQVEsR0FBRyxPQUFPLFNBQVMsQ0FBQztBQUFBLE1BQ3JHO0FBQUEsSUFDSjtBQUFBLEVBQ0osQ0FBQyxFQUNBLE1BQU0sV0FBUztBQUNaLFlBQVEsTUFBTSw0QkFBNEIsS0FBSztBQUUvQyxVQUFNLE1BQU0sT0FBTyxXQUFXLElBQUk7QUFDbEMsUUFBSSxLQUFLO0FBQ0wsVUFBSSxVQUFVLEdBQUcsR0FBRyxPQUFPLE9BQU8sT0FBTyxNQUFNO0FBQy9DLFVBQUksWUFBWTtBQUNoQixVQUFJLE9BQU87QUFDWCxVQUFJLFlBQVk7QUFDaEIsVUFBSSxlQUFlO0FBQ25CLFVBQUksU0FBUyxpRUFBb0IsTUFBTSxTQUFTLE9BQU8sUUFBUSxHQUFHLE9BQU8sU0FBUyxDQUFDO0FBQUEsSUFDdkY7QUFBQSxFQUNKLENBQUM7QUFDVCxDQUFDOyIsCiAgIm5hbWVzIjogWyJHYW1lU3RhdGUiLCAiZGVsdGFUaW1lIl0KfQo=
