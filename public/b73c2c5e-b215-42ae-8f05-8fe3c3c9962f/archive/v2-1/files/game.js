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
    if (this.isHovered) {
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
    this.drawBackground();
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
    this.drawBackground();
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
    this.drawBackground();
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
      return;
    }
    const animalTypes = [];
    for (let i = 0; i < totalTiles / 2; i++) {
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
              console.warn("No more matches available on board, but not cleared!");
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
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    switch (this.gameState) {
      case 0 /* TITLE_SCREEN */:
        this.ui.drawTitleScreen(() => this.gameState = 1 /* INSTRUCTIONS_SCREEN */);
        break;
      case 1 /* INSTRUCTIONS_SCREEN */:
        this.ui.drawInstructionsScreen(() => this.startLevel(0));
        break;
      case 2 /* PLAYING */:
        const bgImage = this.images.get("background");
        if (bgImage) {
          this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
          this.ctx.fillStyle = "#ADD8E6";
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEFzc2V0SW1hZ2VDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXNzZXRTb3VuZENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEFzc2V0SW1hZ2VDb25maWdbXTtcclxuICAgIHNvdW5kczogQXNzZXRTb3VuZENvbmZpZ1tdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTGV2ZWxDb25maWcge1xyXG4gICAgcm93czogbnVtYmVyO1xyXG4gICAgY29sczogbnVtYmVyO1xyXG4gICAgbnVtQW5pbWFsVHlwZXM6IG51bWJlcjtcclxuICAgIHRpbWVMaW1pdFNlY29uZHM6IG51bWJlcjtcclxuICAgIHNjb3JlTXVsdGlwbGllcjogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBib2FyZE1hcmdpblg6IG51bWJlcjtcclxuICAgIGJvYXJkTWFyZ2luWTogbnVtYmVyO1xyXG4gICAgYmFzZVRpbGVTaXplOiBudW1iZXI7XHJcbiAgICB0aWxlUGFkZGluZzogbnVtYmVyO1xyXG4gICAgbWF0Y2hTY29yZTogbnVtYmVyO1xyXG4gICAgcGVuYWx0eVRpbWU6IG51bWJlcjtcclxuICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgdGl0bGVCdXR0b25UZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0OiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbnNCdXR0b25UZXh0OiBzdHJpbmc7XHJcbiAgICBnYW1lT3ZlcldpblRleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyTG9zZVRleHQ6IHN0cmluZztcclxuICAgIGdhbWVPdmVyQnV0dG9uVGV4dDogc3RyaW5nO1xyXG4gICAgZ2FtZUZvbnQ6IHN0cmluZztcclxuICAgIHVpQ29sb3I6IHN0cmluZztcclxuICAgIHVpQnV0dG9uQ29sb3I6IHN0cmluZztcclxuICAgIHVpQnV0dG9uSG92ZXJDb2xvcjogc3RyaW5nO1xyXG4gICAgdWlCdXR0b25UZXh0Q29sb3I6IHN0cmluZztcclxuICAgIHNlbGVjdGVkVGlsZU91dGxpbmVDb2xvcjogc3RyaW5nO1xyXG4gICAgYXNzZXRzOiBBc3NldHNDb25maWc7XHJcbiAgICBsZXZlbHM6IExldmVsQ29uZmlnW107XHJcbn1cclxuXHJcbi8vIC0tLSBVdGlsaXR5IENsYXNzZXMgYW5kIEZ1bmN0aW9ucyAtLS1cclxuY2xhc3MgVmVjdG9yMiB7XHJcbiAgICBjb25zdHJ1Y3RvcihwdWJsaWMgeDogbnVtYmVyLCBwdWJsaWMgeTogbnVtYmVyKSB7fVxyXG59XHJcblxyXG4vLyAtLS0gQXNzZXQgTWFuYWdlbWVudCAtLS1cclxuY2xhc3MgQXNzZXRMb2FkZXIge1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEFzc2V0czogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbG9hZGVkQXNzZXRzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge31cclxuXHJcbiAgICBhc3luYyBsb2FkKGFzc2V0c0NvbmZpZzogQXNzZXRzQ29uZmlnKTogUHJvbWlzZTx7IGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4sIHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gfT4ge1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBhc3NldHNDb25maWcuaW1hZ2VzLm1hcChpbWcgPT4gdGhpcy5sb2FkSW1hZ2UoaW1nKSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IGFzc2V0c0NvbmZpZy5zb3VuZHMubWFwKHNuZCA9PiB0aGlzLmxvYWRTb3VuZChzbmQpKTtcclxuXHJcbiAgICAgICAgdGhpcy50b3RhbEFzc2V0cyA9IGltYWdlUHJvbWlzZXMubGVuZ3RoICsgc291bmRQcm9taXNlcy5sZW5ndGg7XHJcbiAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMgPSAwO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIHJldHVybiB7IGltYWdlczogdGhpcy5pbWFnZXMsIHNvdW5kczogdGhpcy5zb3VuZHMgfTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRJbWFnZShpbWFnZUNvbmZpZzogQXNzZXRJbWFnZUNvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gaW1hZ2VDb25maWcucGF0aDtcclxuICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChpbWFnZUNvbmZpZy5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBMb2FkZWQgaW1hZ2U6ICR7aW1hZ2VDb25maWcubmFtZX0gKCR7dGhpcy5sb2FkZWRBc3NldHN9LyR7dGhpcy50b3RhbEFzc2V0c30pYCk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7aW1hZ2VDb25maWcucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltYWdlQ29uZmlnLnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKHNvdW5kQ29uZmlnOiBBc3NldFNvdW5kQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgYXVkaW8uc3JjID0gc291bmRDb25maWcucGF0aDtcclxuICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9ICdhdXRvJztcclxuICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHsgLy8gRW5zdXJlIGF1ZGlvIGlzIGZ1bGx5IGxvYWRlZFxyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kQ29uZmlnLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkQXNzZXRzKys7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgTG9hZGVkIHNvdW5kOiAke3NvdW5kQ29uZmlnLm5hbWV9ICgke3RoaXMubG9hZGVkQXNzZXRzfS8ke3RoaXMudG90YWxBc3NldHN9KWApO1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c291bmRDb25maWcucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kQ29uZmlnLnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAvLyBGb3Igc29tZSBicm93c2VycywgY2hlY2tpbmcgYXVkaW8ucmVhZHlTdGF0ZSBtaWdodCBiZSBuZWVkZWQgaWYgb25jYW5wbGF5dGhyb3VnaCBkb2Vzbid0IGZpcmUgaW1tZWRpYXRlbHlcclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQXVkaW9NYW5hZ2VyIHtcclxuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PjtcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYmdtVm9sdW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBiZ21Mb29waW5nOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3RydWN0b3Ioc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50Pikge1xyXG4gICAgICAgIHRoaXMuc291bmRzID0gc291bmRzO1xyXG4gICAgfVxyXG5cclxuICAgIHBsYXkobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UsIHZvbHVtZTogbnVtYmVyID0gMS4wKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLnNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGlmIChsb29wKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3BCR00oKTsgLy8gU3RvcCBhbnkgcHJldmlvdXMgQkdNXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvID0gYXVkaW87XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVZvbHVtZSA9IHZvbHVtZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtTG9vcGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoYEVycm9yIHBsYXlpbmcgQkdNICR7bmFtZX06YCwgZSkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gRm9yIHNvdW5kIGVmZmVjdHMsIGNyZWF0ZSBhIGNsb25lIHRvIGFsbG93IHNpbXVsdGFuZW91cyBwbGF5YmFja1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY2xvbmVkQXVkaW8gPSBhdWRpby5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgY2xvbmVkQXVkaW8udm9sdW1lID0gdm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgY2xvbmVkQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihgRXJyb3IgcGxheWluZyBzb3VuZCBlZmZlY3QgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kIFwiJHtuYW1lfVwiIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc3RvcChuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBhdWRpbyA9IHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgYXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbyA9PT0gYXVkaW8pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8gPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21Mb29waW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc3RvcEJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvID0gbnVsbDtcclxuICAgICAgICAgICAgdGhpcy5iZ21Mb29waW5nID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNldEJHTVZvbHVtZSh2b2x1bWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8udm9sdW1lID0gdm9sdW1lO1xyXG4gICAgICAgICAgICB0aGlzLmJnbVZvbHVtZSA9IHZvbHVtZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSGVscGVyIGZvciBicm93c2VyIGF1dG8tcGxheSBwb2xpY3lcclxuICAgIHJlc3VtZUJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbyAmJiB0aGlzLmJnbUxvb3BpbmcgJiYgdGhpcy5iZ21BdWRpby5wYXVzZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiQ291bGQgbm90IHJlc3VtZSBCR006XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBVSSBDb21wb25lbnRzIC0tLVxyXG5jbGFzcyBCdXR0b24ge1xyXG4gICAgcHJpdmF0ZSB4OiBudW1iZXI7XHJcbiAgICBwcml2YXRlIHk6IG51bWJlcjtcclxuICAgIHByaXZhdGUgd2lkdGg6IG51bWJlcjtcclxuICAgIHByaXZhdGUgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBwcml2YXRlIHRleHQ6IHN0cmluZztcclxuICAgIHByaXZhdGUgY29sb3I6IHN0cmluZztcclxuICAgIHByaXZhdGUgaG92ZXJDb2xvcjogc3RyaW5nO1xyXG4gICAgcHJpdmF0ZSB0ZXh0Q29sb3I6IHN0cmluZztcclxuICAgIHByaXZhdGUgaXNIb3ZlcmVkOiBib29sZWFuID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIGNhbGxiYWNrOiAoKSA9PiB2b2lkO1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZm9udDogc3RyaW5nO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxyXG4gICAgICAgIHg6IG51bWJlciwgeTogbnVtYmVyLFxyXG4gICAgICAgIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLFxyXG4gICAgICAgIHRleHQ6IHN0cmluZyxcclxuICAgICAgICBjb2xvcjogc3RyaW5nLCBob3ZlckNvbG9yOiBzdHJpbmcsIHRleHRDb2xvcjogc3RyaW5nLFxyXG4gICAgICAgIGZvbnQ6IHN0cmluZyxcclxuICAgICAgICBjYWxsYmFjazogKCkgPT4gdm9pZFxyXG4gICAgKSB7XHJcbiAgICAgICAgdGhpcy5jdHggPSBjdHg7XHJcbiAgICAgICAgdGhpcy54ID0geDtcclxuICAgICAgICB0aGlzLnkgPSB5O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLnRleHQgPSB0ZXh0O1xyXG4gICAgICAgIHRoaXMuY29sb3IgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLmhvdmVyQ29sb3IgPSBob3ZlckNvbG9yO1xyXG4gICAgICAgIHRoaXMudGV4dENvbG9yID0gdGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuZm9udCA9IGZvbnQ7XHJcbiAgICAgICAgdGhpcy5jYWxsYmFjayA9IGNhbGxiYWNrO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5pc0hvdmVyZWQgPyB0aGlzLmhvdmVyQ29sb3IgOiB0aGlzLmNvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCAke3RoaXMuaGVpZ2h0IC8gMi41fXB4ICR7dGhpcy5mb250fWA7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy50ZXh0LCB0aGlzLnggKyB0aGlzLndpZHRoIC8gMiwgdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVNb3VzZU1vdmUobW91c2VYOiBudW1iZXIsIG1vdXNlWTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5pc0hvdmVyZWQgPSAoXHJcbiAgICAgICAgICAgIG1vdXNlWCA+PSB0aGlzLnggJiYgbW91c2VYIDw9IHRoaXMueCArIHRoaXMud2lkdGggJiZcclxuICAgICAgICAgICAgbW91c2VZID49IHRoaXMueSAmJiBtb3VzZVkgPD0gdGhpcy55ICsgdGhpcy5oZWlnaHRcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIGhhbmRsZUNsaWNrKG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLmlzSG92ZXJlZCkge1xyXG4gICAgICAgICAgICB0aGlzLmNhbGxiYWNrKCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEdhbWVVSSB7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWc6IEdhbWVDb25maWc7XHJcbiAgICBwcml2YXRlIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD47XHJcbiAgICBwcml2YXRlIGJ1dHRvbnM6IEJ1dHRvbltdID0gW107XHJcbiAgICBwcml2YXRlIGN1cnJlbnRTY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY3VycmVudFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRMZXZlbDogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgdG90YWxMZXZlbHM6IG51bWJlciA9IDA7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGNvbmZpZzogR2FtZUNvbmZpZywgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50Pikge1xyXG4gICAgICAgIHRoaXMuY3R4ID0gY3R4O1xyXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xyXG4gICAgICAgIHRoaXMuaW1hZ2VzID0gaW1hZ2VzO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2xlYXJCdXR0b25zKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuYnV0dG9ucyA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYWRkQnV0dG9uKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdGV4dDogc3RyaW5nLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuYnV0dG9ucy5wdXNoKG5ldyBCdXR0b24oXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LCB4LCB5LCB3aWR0aCwgaGVpZ2h0LCB0ZXh0LFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy51aUJ1dHRvbkNvbG9yLCB0aGlzLmNvbmZpZy51aUJ1dHRvbkhvdmVyQ29sb3IsIHRoaXMuY29uZmlnLnVpQnV0dG9uVGV4dENvbG9yLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lRm9udCxcclxuICAgICAgICAgICAgY2FsbGJhY2tcclxuICAgICAgICApKTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3VGl0bGVTY3JlZW4ob25TdGFydEdhbWU6ICgpID0+IHZvaWQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmNsZWFyQnV0dG9ucygpO1xyXG4gICAgICAgIHRoaXMuZHJhd0JhY2tncm91bmQoKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy51aUNvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgYm9sZCA2MHB4ICR7dGhpcy5jb25maWcuZ2FtZUZvbnR9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50aXRsZVNjcmVlblRleHQsIHRoaXMuY29uZmlnLmNhbnZhc1dpZHRoIC8gMiwgdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgY29uc3QgYnV0dG9uV2lkdGggPSAyMDA7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uSGVpZ2h0ID0gNjA7XHJcbiAgICAgICAgdGhpcy5hZGRCdXR0b24oXHJcbiAgICAgICAgICAgICh0aGlzLmNvbmZpZy5jYW52YXNXaWR0aCAtIGJ1dHRvbldpZHRoKSAvIDIsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodCAvIDIgKyA1MCxcclxuICAgICAgICAgICAgYnV0dG9uV2lkdGgsIGJ1dHRvbkhlaWdodCxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcudGl0bGVCdXR0b25UZXh0LFxyXG4gICAgICAgICAgICBvblN0YXJ0R2FtZVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5idXR0b25zLmZvckVhY2goYnRuID0+IGJ0bi5kcmF3KCkpO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4ob25QbGF5R2FtZTogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY2xlYXJCdXR0b25zKCk7XHJcbiAgICAgICAgdGhpcy5kcmF3QmFja2dyb3VuZCgpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAyMHB4ICR7dGhpcy5jb25maWcuZ2FtZUZvbnR9YDtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuXHJcbiAgICAgICAgY29uc3QgbGluZXMgPSB0aGlzLmNvbmZpZy5pbnN0cnVjdGlvbnNUZXh0LnNwbGl0KCdcXG4nKTtcclxuICAgICAgICBjb25zdCBzdGFydFkgPSAxMDA7XHJcbiAgICAgICAgY29uc3QgbGluZUhlaWdodCA9IDMwO1xyXG5cclxuICAgICAgICBsaW5lcy5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChsaW5lLCB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aCAvIDIsIHN0YXJ0WSArIGluZGV4ICogbGluZUhlaWdodCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1dHRvbldpZHRoID0gMjAwO1xyXG4gICAgICAgIGNvbnN0IGJ1dHRvbkhlaWdodCA9IDYwO1xyXG4gICAgICAgIHRoaXMuYWRkQnV0dG9uKFxyXG4gICAgICAgICAgICAodGhpcy5jb25maWcuY2FudmFzV2lkdGggLSBidXR0b25XaWR0aCkgLyAyLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQgLSAxMDAsXHJcbiAgICAgICAgICAgIGJ1dHRvbldpZHRoLCBidXR0b25IZWlnaHQsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmluc3RydWN0aW9uc0J1dHRvblRleHQsXHJcbiAgICAgICAgICAgIG9uUGxheUdhbWVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMuYnV0dG9ucy5mb3JFYWNoKGJ0biA9PiBidG4uZHJhdygpKTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3UGxheWluZ1VJKHNjb3JlOiBudW1iZXIsIHRpbWU6IG51bWJlciwgbGV2ZWw6IG51bWJlciwgdG90YWxMZXZlbHM6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3VycmVudFNjb3JlID0gc2NvcmU7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50VGltZSA9IHRpbWU7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWwgPSBsZXZlbDtcclxuICAgICAgICB0aGlzLnRvdGFsTGV2ZWxzID0gdG90YWxMZXZlbHM7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkIDI0cHggJHt0aGlzLmNvbmZpZy5nYW1lRm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAndG9wJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDODEwXHVDMjE4OiAke3RoaXMuY3VycmVudFNjb3JlfWAsIDEwLCAxMCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1QjgwOFx1QkNBODogJHt0aGlzLmN1cnJlbnRMZXZlbCArIDF9IC8gJHt0aGlzLnRvdGFsTGV2ZWxzfWAsIDEwLCA0MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdyaWdodCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1QzJEQ1x1QUMwNDogJHtNYXRoLm1heCgwLCBNYXRoLmZsb29yKHRoaXMuY3VycmVudFRpbWUpKX1zYCwgdGhpcy5jb25maWcuY2FudmFzV2lkdGggLSAxMCwgMTApO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXdHYW1lT3ZlclNjcmVlbih3aW46IGJvb2xlYW4sIG9uUmVzdGFydDogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY2xlYXJCdXR0b25zKCk7XHJcbiAgICAgICAgdGhpcy5kcmF3QmFja2dyb3VuZCgpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLnVpQ29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkIDUwcHggJHt0aGlzLmNvbmZpZy5nYW1lRm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFxyXG4gICAgICAgICAgICB3aW4gPyB0aGlzLmNvbmZpZy5nYW1lT3ZlcldpblRleHQgOiB0aGlzLmNvbmZpZy5nYW1lT3Zlckxvc2VUZXh0LFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aCAvIDIsIHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodCAvIDIgLSA1MFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGBib2xkIDMwcHggJHt0aGlzLmNvbmZpZy5nYW1lRm9udH1gO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBcdUNENUNcdUM4ODUgXHVDODEwXHVDMjE4OiAke3RoaXMuY3VycmVudFNjb3JlfWAsIHRoaXMuY29uZmlnLmNhbnZhc1dpZHRoIC8gMiwgdGhpcy5jb25maWcuY2FudmFzSGVpZ2h0IC8gMiArIDEwKTtcclxuXHJcbiAgICAgICAgY29uc3QgYnV0dG9uV2lkdGggPSAyMDA7XHJcbiAgICAgICAgY29uc3QgYnV0dG9uSGVpZ2h0ID0gNjA7XHJcbiAgICAgICAgdGhpcy5hZGRCdXR0b24oXHJcbiAgICAgICAgICAgICh0aGlzLmNvbmZpZy5jYW52YXNXaWR0aCAtIGJ1dHRvbldpZHRoKSAvIDIsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodCAvIDIgKyA4MCxcclxuICAgICAgICAgICAgYnV0dG9uV2lkdGgsIGJ1dHRvbkhlaWdodCxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZU92ZXJCdXR0b25UZXh0LFxyXG4gICAgICAgICAgICBvblJlc3RhcnRcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMuYnV0dG9ucy5mb3JFYWNoKGJ0biA9PiBidG4uZHJhdygpKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVNb3VzZU1vdmUobW91c2VYOiBudW1iZXIsIG1vdXNlWTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5idXR0b25zLmZvckVhY2goYnRuID0+IGJ0bi5oYW5kbGVNb3VzZU1vdmUobW91c2VYLCBtb3VzZVkpKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVDbGljayhtb3VzZVg6IG51bWJlciwgbW91c2VZOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGJ0biBvZiB0aGlzLmJ1dHRvbnMpIHtcclxuICAgICAgICAgICAgaWYgKGJ0bi5oYW5kbGVDbGljayhtb3VzZVgsIG1vdXNlWSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdCYWNrZ3JvdW5kKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGJnSW1hZ2UgPSB0aGlzLmltYWdlcy5nZXQoJ2JhY2tncm91bmQnKTtcclxuICAgICAgICBpZiAoYmdJbWFnZSkge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoYmdJbWFnZSwgMCwgMCwgdGhpcy5jb25maWcuY2FudmFzV2lkdGgsIHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyNBREQ4RTYnOyAvLyBGYWxsYmFjayBiYWNrZ3JvdW5kIGNvbG9yXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY29uZmlnLmNhbnZhc1dpZHRoLCB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIEdhbWUgTG9naWMgQ2xhc3NlcyAtLS1cclxuY2xhc3MgVGlsZSB7XHJcbiAgICBpbWFnZTogSFRNTEltYWdlRWxlbWVudDtcclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHB1YmxpYyByb3c6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgY29sOiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGFuaW1hbFR5cGU6IG51bWJlcixcclxuICAgICAgICBpbWFnZU1hcDogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4sXHJcbiAgICAgICAgcHVibGljIHRpbGVTaXplOiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIHRpbGVQYWRkaW5nOiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGJvYXJkTWFyZ2luWDogbnVtYmVyLFxyXG4gICAgICAgIHB1YmxpYyBib2FyZE1hcmdpblk6XHJcbiAgICAgICAgbnVtYmVyXHJcbiAgICApIHtcclxuICAgICAgICBjb25zdCBpbWFnZU5hbWUgPSBgYW5pbWFsXyR7YW5pbWFsVHlwZX1gO1xyXG4gICAgICAgIGNvbnN0IGltZyA9IGltYWdlTWFwLmdldChpbWFnZU5hbWUpO1xyXG4gICAgICAgIGlmICghaW1nKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW1hZ2UgZm9yIGFuaW1hbCB0eXBlICR7YW5pbWFsVHlwZX0gKCR7aW1hZ2VOYW1lfSkgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmltYWdlID0gaW1nO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGlzU2VsZWN0ZWQ6IGJvb2xlYW4sIHNlbGVjdGVkT3V0bGluZUNvbG9yOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCB4ID0gdGhpcy5ib2FyZE1hcmdpblggKyB0aGlzLmNvbCAqICh0aGlzLnRpbGVTaXplICsgdGhpcy50aWxlUGFkZGluZyk7XHJcbiAgICAgICAgY29uc3QgeSA9IHRoaXMuYm9hcmRNYXJnaW5ZICsgdGhpcy5yb3cgKiAodGhpcy50aWxlU2l6ZSArIHRoaXMudGlsZVBhZGRpbmcpO1xyXG5cclxuICAgICAgICBjdHguZHJhd0ltYWdlKHRoaXMuaW1hZ2UsIHgsIHksIHRoaXMudGlsZVNpemUsIHRoaXMudGlsZVNpemUpO1xyXG5cclxuICAgICAgICBpZiAoaXNTZWxlY3RlZCkge1xyXG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSBzZWxlY3RlZE91dGxpbmVDb2xvcjtcclxuICAgICAgICAgICAgY3R4LmxpbmVXaWR0aCA9IDM7XHJcbiAgICAgICAgICAgIGN0eC5zdHJva2VSZWN0KHgsIHksIHRoaXMudGlsZVNpemUsIHRoaXMudGlsZVNpemUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBnZXRCb3VuZHMoKTogeyB4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIgfSB7XHJcbiAgICAgICAgY29uc3QgeCA9IHRoaXMuYm9hcmRNYXJnaW5YICsgdGhpcy5jb2wgKiAodGhpcy50aWxlU2l6ZSArIHRoaXMudGlsZVBhZGRpbmcpO1xyXG4gICAgICAgIGNvbnN0IHkgPSB0aGlzLmJvYXJkTWFyZ2luWSArIHRoaXMucm93ICogKHRoaXMudGlsZVNpemUgKyB0aGlzLnRpbGVQYWRkaW5nKTtcclxuICAgICAgICByZXR1cm4geyB4LCB5LCB3aWR0aDogdGhpcy50aWxlU2l6ZSwgaGVpZ2h0OiB0aGlzLnRpbGVTaXplIH07XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIFBhdGhmaW5kZXIge1xyXG4gICAgcHJpdmF0ZSBib2FyZDogQm9hcmQ7XHJcbiAgICBwcml2YXRlIGNvbmZpZzogR2FtZUNvbmZpZztcclxuICAgIHByaXZhdGUgcm93czogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBjb2xzOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYm9hcmQ6IEJvYXJkLCBjb25maWc6IEdhbWVDb25maWcpIHtcclxuICAgICAgICB0aGlzLmJvYXJkID0gYm9hcmQ7XHJcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XHJcbiAgICAgICAgdGhpcy5yb3dzID0gYm9hcmQucm93cztcclxuICAgICAgICB0aGlzLmNvbHMgPSBib2FyZC5jb2xzO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEhlbHBlcjogQ2hlY2sgaWYgYSBnaXZlbiBjZWxsIChyLCBjKSBpcyBvdXRzaWRlIHRoZSBib2FyZCwgZW1wdHksIG9yIG9uZSBvZiB0aGUgc2VsZWN0ZWQgdGlsZXNcclxuICAgIHByaXZhdGUgX2lzQ2VsbENsZWFyKHI6IG51bWJlciwgYzogbnVtYmVyLCBzZWxlY3RlZFRpbGUxOiBUaWxlLCBzZWxlY3RlZFRpbGUyOiBUaWxlKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKHIgPCAwIHx8IHIgPj0gdGhpcy5yb3dzIHx8IGMgPCAwIHx8IGMgPj0gdGhpcy5jb2xzKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBPdXRzaWRlIGJvYXJkIGlzIGNvbnNpZGVyZWQgY2xlYXJcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgdGlsZUF0UG9zID0gdGhpcy5ib2FyZC5nZXRUaWxlKHIsIGMpO1xyXG4gICAgICAgIHJldHVybiB0aWxlQXRQb3MgPT09IG51bGwgfHwgdGlsZUF0UG9zID09PSBzZWxlY3RlZFRpbGUxIHx8IHRpbGVBdFBvcyA9PT0gc2VsZWN0ZWRUaWxlMjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBIZWxwZXI6IENoZWNrIGlmIGEgc3RyYWlnaHQgbGluZSBzZWdtZW50IGlzIGNsZWFyXHJcbiAgICBwcml2YXRlIF9pc0xpbmVDbGVhcihyMTogbnVtYmVyLCBjMTogbnVtYmVyLCByMjogbnVtYmVyLCBjMjogbnVtYmVyLCBzZWxlY3RlZFRpbGUxOiBUaWxlLCBzZWxlY3RlZFRpbGUyOiBUaWxlKTogYm9vbGVhbiB7XHJcbiAgICAgICAgLy8gSG9yaXpvbnRhbCBsaW5lXHJcbiAgICAgICAgaWYgKHIxID09PSByMikge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBjID0gTWF0aC5taW4oYzEsIGMyKSArIDE7IGMgPCBNYXRoLm1heChjMSwgYzIpOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5faXNDZWxsQ2xlYXIocjEsIGMsIHNlbGVjdGVkVGlsZTEsIHNlbGVjdGVkVGlsZTIpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gVmVydGljYWwgbGluZVxyXG4gICAgICAgIGVsc2UgaWYgKGMxID09PSBjMikge1xyXG4gICAgICAgICAgICBmb3IgKGxldCByID0gTWF0aC5taW4ocjEsIHIyKSArIDE7IHIgPCBNYXRoLm1heChyMSwgcjIpOyByKyspIHtcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5faXNDZWxsQ2xlYXIociwgYzEsIHNlbGVjdGVkVGlsZTEsIHNlbGVjdGVkVGlsZTIpKSByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gRGlhZ29uYWwgb3Igbm9uLXN0cmFpZ2h0IGxpbmVcclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBNYWluIHBhdGhmaW5kaW5nIGxvZ2ljXHJcbiAgICBmaW5kUGF0aCh0aWxlMTogVGlsZSwgdGlsZTI6IFRpbGUpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAoIXRpbGUxIHx8ICF0aWxlMiB8fCB0aWxlMS5hbmltYWxUeXBlICE9PSB0aWxlMi5hbmltYWxUeXBlIHx8ICh0aWxlMS5yb3cgPT09IHRpbGUyLnJvdyAmJiB0aWxlMS5jb2wgPT09IHRpbGUyLmNvbCkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBOb3Qgc2FtZSB0eXBlIG9yIHNhbWUgdGlsZVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcjEgPSB0aWxlMS5yb3c7XHJcbiAgICAgICAgY29uc3QgYzEgPSB0aWxlMS5jb2w7XHJcbiAgICAgICAgY29uc3QgcjIgPSB0aWxlMi5yb3c7XHJcbiAgICAgICAgY29uc3QgYzIgPSB0aWxlMi5jb2w7XHJcblxyXG4gICAgICAgIC8vIDAgYmVuZHMgKHN0cmFpZ2h0IGxpbmUpXHJcbiAgICAgICAgaWYgKHRoaXMuX2lzTGluZUNsZWFyKHIxLCBjMSwgcjIsIGMyLCB0aWxlMSwgdGlsZTIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMSBiZW5kIChMLXNoYXBlKVxyXG4gICAgICAgIC8vIENoZWNrIChyMSwgYzIpIGFzIGNvcm5lclxyXG4gICAgICAgIGlmICh0aGlzLl9pc0NlbGxDbGVhcihyMSwgYzIsIHRpbGUxLCB0aWxlMikgJiZcclxuICAgICAgICAgICAgdGhpcy5faXNMaW5lQ2xlYXIocjEsIGMxLCByMSwgYzIsIHRpbGUxLCB0aWxlMikgJiZcclxuICAgICAgICAgICAgdGhpcy5faXNMaW5lQ2xlYXIocjEsIGMyLCByMiwgYzIsIHRpbGUxLCB0aWxlMikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIENoZWNrIChyMiwgYzEpIGFzIGNvcm5lclxyXG4gICAgICAgIGlmICh0aGlzLl9pc0NlbGxDbGVhcihyMiwgYzEsIHRpbGUxLCB0aWxlMikgJiZcclxuICAgICAgICAgICAgdGhpcy5faXNMaW5lQ2xlYXIocjEsIGMxLCByMiwgYzEsIHRpbGUxLCB0aWxlMikgJiZcclxuICAgICAgICAgICAgdGhpcy5faXNMaW5lQ2xlYXIocjIsIGMxLCByMiwgYzIsIHRpbGUxLCB0aWxlMikpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyAyIGJlbmRzIChaLCBVLCBDLXNoYXBlKSAtIGl0ZXJhdGUgdGhyb3VnaCBhbGwgcG9zc2libGUgaW50ZXJtZWRpYXRlIGNlbGxzIChpbmNsdWRpbmcgb3V0c2lkZSBib2FyZClcclxuICAgICAgICBjb25zdCBleHRlbmRNaW5SID0gLTE7XHJcbiAgICAgICAgY29uc3QgZXh0ZW5kTWF4UiA9IHRoaXMucm93cztcclxuICAgICAgICBjb25zdCBleHRlbmRNaW5DID0gLTE7XHJcbiAgICAgICAgY29uc3QgZXh0ZW5kTWF4QyA9IHRoaXMuY29scztcclxuXHJcbiAgICAgICAgLy8gUGF0aCAoSC1WLUgpIHZpYSAocjEsIGNfaW50ZXJtZWRpYXRlKSBhbmQgKHIyLCBjX2ludGVybWVkaWF0ZSlcclxuICAgICAgICBmb3IgKGxldCBjYyA9IGV4dGVuZE1pbkM7IGNjIDw9IGV4dGVuZE1heEM7IGNjKyspIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuX2lzQ2VsbENsZWFyKHIxLCBjYywgdGlsZTEsIHRpbGUyKSAmJlxyXG4gICAgICAgICAgICAgICAgdGhpcy5faXNDZWxsQ2xlYXIocjIsIGNjLCB0aWxlMSwgdGlsZTIpICYmXHJcbiAgICAgICAgICAgICAgICB0aGlzLl9pc0xpbmVDbGVhcihyMSwgYzEsIHIxLCBjYywgdGlsZTEsIHRpbGUyKSAmJiAvLyBGaXJzdCBIIHNlZ21lbnRcclxuICAgICAgICAgICAgICAgIHRoaXMuX2lzTGluZUNsZWFyKHIxLCBjYywgcjIsIGNjLCB0aWxlMSwgdGlsZTIpICYmIC8vIFYgc2VnbWVudFxyXG4gICAgICAgICAgICAgICAgdGhpcy5faXNMaW5lQ2xlYXIocjIsIGNjLCByMiwgYzIsIHRpbGUxLCB0aWxlMikpIHsgLy8gU2Vjb25kIEggc2VnbWVudFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFBhdGggKFYtSC1WKSB2aWEgKHJfaW50ZXJtZWRpYXRlLCBjMSkgYW5kIChyX2ludGVybWVkaWF0ZSwgYzIpXHJcbiAgICAgICAgZm9yIChsZXQgcnIgPSBleHRlbmRNaW5SOyByciA8PSBleHRlbmRNYXhSOyBycisrKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLl9pc0NlbGxDbGVhcihyciwgYzEsIHRpbGUxLCB0aWxlMikgJiZcclxuICAgICAgICAgICAgICAgIHRoaXMuX2lzQ2VsbENsZWFyKHJyLCBjMiwgdGlsZTEsIHRpbGUyKSAmJlxyXG4gICAgICAgICAgICAgICAgdGhpcy5faXNMaW5lQ2xlYXIocjEsIGMxLCByciwgYzEsIHRpbGUxLCB0aWxlMikgJiYgLy8gRmlyc3QgViBzZWdtZW50XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9pc0xpbmVDbGVhcihyciwgYzEsIHJyLCBjMiwgdGlsZTEsIHRpbGUyKSAmJiAvLyBIIHNlZ21lbnRcclxuICAgICAgICAgICAgICAgIHRoaXMuX2lzTGluZUNsZWFyKHJyLCBjMiwgcjIsIGMyLCB0aWxlMSwgdGlsZTIpKSB7IC8vIFNlY29uZCBWIHNlZ21lbnRcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gZmFsc2U7IC8vIE5vIHBhdGggZm91bmRcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQm9hcmQge1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgY29uZmlnOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+O1xyXG4gICAgcHJpdmF0ZSBfcm93czogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBfY29sczogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBfdGlsZVNpemU6IG51bWJlcjtcclxuICAgIHByaXZhdGUgX3RpbGVQYWRkaW5nOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIF9ib2FyZE1hcmdpblg6IG51bWJlcjtcclxuICAgIHByaXZhdGUgX2JvYXJkTWFyZ2luWTogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBfbnVtQW5pbWFsVHlwZXM6IG51bWJlcjtcclxuXHJcbiAgICBwcml2YXRlIGdyaWQ6IChUaWxlIHwgbnVsbClbXVtdO1xyXG4gICAgcHJpdmF0ZSBwYXRoZmluZGVyOiBQYXRoZmluZGVyO1xyXG5cclxuICAgIGdldCByb3dzKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9yb3dzOyB9XHJcbiAgICBnZXQgY29scygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fY29sczsgfVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBjb25maWc6IEdhbWVDb25maWcsIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4pIHtcclxuICAgICAgICB0aGlzLmN0eCA9IGN0eDtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLmltYWdlcyA9IGltYWdlcztcclxuICAgIH1cclxuXHJcbiAgICBpbml0KGxldmVsQ29uZmlnOiBMZXZlbENvbmZpZyk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuX3Jvd3MgPSBsZXZlbENvbmZpZy5yb3dzO1xyXG4gICAgICAgIHRoaXMuX2NvbHMgPSBsZXZlbENvbmZpZy5jb2xzO1xyXG4gICAgICAgIHRoaXMuX3RpbGVTaXplID0gdGhpcy5jb25maWcuYmFzZVRpbGVTaXplO1xyXG4gICAgICAgIHRoaXMuX3RpbGVQYWRkaW5nID0gdGhpcy5jb25maWcudGlsZVBhZGRpbmc7XHJcbiAgICAgICAgdGhpcy5fYm9hcmRNYXJnaW5YID0gdGhpcy5jb25maWcuYm9hcmRNYXJnaW5YO1xyXG4gICAgICAgIHRoaXMuX2JvYXJkTWFyZ2luWSA9IHRoaXMuY29uZmlnLmJvYXJkTWFyZ2luWTtcclxuICAgICAgICB0aGlzLl9udW1BbmltYWxUeXBlcyA9IGxldmVsQ29uZmlnLm51bUFuaW1hbFR5cGVzO1xyXG5cclxuICAgICAgICB0aGlzLmdyaWQgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiB0aGlzLl9yb3dzIH0sICgpID0+IEFycmF5KHRoaXMuX2NvbHMpLmZpbGwobnVsbCkpO1xyXG4gICAgICAgIHRoaXMucGF0aGZpbmRlciA9IG5ldyBQYXRoZmluZGVyKHRoaXMsIHRoaXMuY29uZmlnKTtcclxuICAgICAgICB0aGlzLmdlbmVyYXRlQm9hcmQoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdlbmVyYXRlQm9hcmQoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgdG90YWxUaWxlcyA9IHRoaXMuX3Jvd3MgKiB0aGlzLl9jb2xzO1xyXG4gICAgICAgIGlmICh0b3RhbFRpbGVzICUgMiAhPT0gMCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiQm9hcmQgc2l6ZSBtdXN0IGJlIGV2ZW4gZm9yIHRpbGUgcGFpcmluZy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGFuaW1hbFR5cGVzOiBudW1iZXJbXSA9IFtdO1xyXG4gICAgICAgIC8vIEVuc3VyZSBlYWNoIGFuaW1hbCB0eXBlIGFwcGVhcnMgYW4gZXZlbiBudW1iZXIgb2YgdGltZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRvdGFsVGlsZXMgLyAyOyBpKyspIHtcclxuICAgICAgICAgICAgYW5pbWFsVHlwZXMucHVzaCgoaSAlIHRoaXMuX251bUFuaW1hbFR5cGVzKSArIDEpO1xyXG4gICAgICAgICAgICBhbmltYWxUeXBlcy5wdXNoKChpICUgdGhpcy5fbnVtQW5pbWFsVHlwZXMpICsgMSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBGaXNoZXItWWF0ZXMgc2h1ZmZsZVxyXG4gICAgICAgIGZvciAobGV0IGkgPSBhbmltYWxUeXBlcy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGogPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAoaSArIDEpKTtcclxuICAgICAgICAgICAgW2FuaW1hbFR5cGVzW2ldLCBhbmltYWxUeXBlc1tqXV0gPSBbYW5pbWFsVHlwZXNbal0sIGFuaW1hbFR5cGVzW2ldXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBhbmltYWxJbmRleCA9IDA7XHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCB0aGlzLl9yb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCB0aGlzLl9jb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ3JpZFtyXVtjXSA9IG5ldyBUaWxlKFxyXG4gICAgICAgICAgICAgICAgICAgIHIsIGMsIGFuaW1hbFR5cGVzW2FuaW1hbEluZGV4KytdLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3RpbGVTaXplLCB0aGlzLl90aWxlUGFkZGluZyxcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9ib2FyZE1hcmdpblgsIHRoaXMuX2JvYXJkTWFyZ2luWVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkcmF3KHNlbGVjdGVkVGlsZTogVGlsZSB8IG51bGwpOiB2b2lkIHtcclxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IHRoaXMuX3Jvd3M7IHIrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IHRoaXMuX2NvbHM7IGMrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGlsZSA9IHRoaXMuZ3JpZFtyXVtjXTtcclxuICAgICAgICAgICAgICAgIGlmICh0aWxlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGlsZS5kcmF3KHRoaXMuY3R4LCB0aWxlID09PSBzZWxlY3RlZFRpbGUsIHRoaXMuY29uZmlnLnNlbGVjdGVkVGlsZU91dGxpbmVDb2xvcik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0VGlsZUF0KG1vdXNlWDogbnVtYmVyLCBtb3VzZVk6IG51bWJlcik6IFRpbGUgfCBudWxsIHtcclxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IHRoaXMuX3Jvd3M7IHIrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IHRoaXMuX2NvbHM7IGMrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGlsZSA9IHRoaXMuZ3JpZFtyXVtjXTtcclxuICAgICAgICAgICAgICAgIGlmICh0aWxlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYm91bmRzID0gdGlsZS5nZXRCb3VuZHMoKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobW91c2VYID49IGJvdW5kcy54ICYmIG1vdXNlWCA8IGJvdW5kcy54ICsgYm91bmRzLndpZHRoICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vdXNlWSA+PSBib3VuZHMueSAmJiBtb3VzZVkgPCBib3VuZHMueSArIGJvdW5kcy5oZWlnaHQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRpbGU7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFRpbGUocjogbnVtYmVyLCBjOiBudW1iZXIpOiBUaWxlIHwgbnVsbCB7XHJcbiAgICAgICAgaWYgKHIgPCAwIHx8IHIgPj0gdGhpcy5fcm93cyB8fCBjIDwgMCB8fCBjID49IHRoaXMuX2NvbHMpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7IC8vIE91dHNpZGUgYm9hcmRcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ3JpZFtyXVtjXTtcclxuICAgIH1cclxuXHJcbiAgICBjaGVja01hdGNoKHRpbGUxOiBUaWxlLCB0aWxlMjogVGlsZSk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnBhdGhmaW5kZXIuZmluZFBhdGgodGlsZTEsIHRpbGUyKTtcclxuICAgIH1cclxuXHJcbiAgICByZW1vdmVUaWxlcyh0aWxlMTogVGlsZSwgdGlsZTI6IFRpbGUpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdyaWRbdGlsZTEucm93XVt0aWxlMS5jb2xdID0gbnVsbDtcclxuICAgICAgICB0aGlzLmdyaWRbdGlsZTIucm93XVt0aWxlMi5jb2xdID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBpc0JvYXJkQ2xlYXIoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCB0aGlzLl9yb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCB0aGlzLl9jb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbcl1bY10gIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT3B0aW9uYWw6IENoZWNrIGlmIHRoZXJlIGFyZSBhbnkgdmFsaWQgbW92ZXMgcmVtYWluaW5nIChjYW4gYmUgZXhwZW5zaXZlKVxyXG4gICAgaGFzUmVtYWluaW5nTWF0Y2hlcygpOiBib29sZWFuIHtcclxuICAgICAgICBjb25zdCBhY3RpdmVUaWxlczogVGlsZVtdID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCB0aGlzLl9yb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCB0aGlzLl9jb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmdyaWRbcl1bY10pIHtcclxuICAgICAgICAgICAgICAgICAgICBhY3RpdmVUaWxlcy5wdXNoKHRoaXMuZ3JpZFtyXVtjXSEpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYWN0aXZlVGlsZXMubGVuZ3RoID09PSAwKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWN0aXZlVGlsZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgYWN0aXZlVGlsZXMubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRpbGUxID0gYWN0aXZlVGlsZXNbaV07XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aWxlMiA9IGFjdGl2ZVRpbGVzW2pdO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRpbGUxLmFuaW1hbFR5cGUgPT09IHRpbGUyLmFuaW1hbFR5cGUgJiYgdGhpcy5wYXRoZmluZGVyLmZpbmRQYXRoKHRpbGUxLCB0aWxlMikpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT3B0aW9uYWw6IFNodWZmbGUgcmVtYWluaW5nIHRpbGVzIGlmIG5vIG1hdGNoZXMgYXJlIGxlZnRcclxuICAgIHNodWZmbGUoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudEFjdGl2ZVRpbGVzOiBUaWxlW10gPSBbXTtcclxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IHRoaXMuX3Jvd3M7IHIrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IHRoaXMuX2NvbHM7IGMrKykge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZ3JpZFtyXVtjXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRBY3RpdmVUaWxlcy5wdXNoKHRoaXMuZ3JpZFtyXVtjXSEpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZ3JpZFtyXVtjXSA9IG51bGw7IC8vIENsZWFyIG9sZCBwb3NpdGlvbnNcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRXh0cmFjdCBhbmltYWwgdHlwZXMgdG8gc2h1ZmZsZVxyXG4gICAgICAgIGNvbnN0IGFuaW1hbFR5cGVzVG9TaHVmZmxlID0gY3VycmVudEFjdGl2ZVRpbGVzLm1hcCh0aWxlID0+IHRpbGUuYW5pbWFsVHlwZSk7XHJcblxyXG4gICAgICAgIC8vIFNodWZmbGUgdGhlIGFuaW1hbCB0eXBlc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSBhbmltYWxUeXBlc1RvU2h1ZmZsZS5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGogPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAoaSArIDEpKTtcclxuICAgICAgICAgICAgW2FuaW1hbFR5cGVzVG9TaHVmZmxlW2ldLCBhbmltYWxUeXBlc1RvU2h1ZmZsZVtqXV0gPSBbYW5pbWFsVHlwZXNUb1NodWZmbGVbal0sIGFuaW1hbFR5cGVzVG9TaHVmZmxlW2ldXTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlcG9wdWxhdGUgZ3JpZCB3aXRoIHNodWZmbGVkIHR5cGVzXHJcbiAgICAgICAgbGV0IHR5cGVJbmRleCA9IDA7XHJcbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCB0aGlzLl9yb3dzOyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCB0aGlzLl9jb2xzOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlSW5kZXggPCBhbmltYWxUeXBlc1RvU2h1ZmZsZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmdyaWRbcl1bY10gPSBuZXcgVGlsZShcclxuICAgICAgICAgICAgICAgICAgICAgICAgciwgYywgYW5pbWFsVHlwZXNUb1NodWZmbGVbdHlwZUluZGV4KytdLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmltYWdlcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5fdGlsZVNpemUsIHRoaXMuX3RpbGVQYWRkaW5nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9ib2FyZE1hcmdpblgsIHRoaXMuX2JvYXJkTWFyZ2luWVxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBNYWluIEdhbWUgQ2xhc3MgLS0tXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFX1NDUkVFTixcclxuICAgIElOU1RSVUNUSU9OU19TQ1JFRU4sXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSX1dJTixcclxuICAgIEdBTUVfT1ZFUl9MT1NFXHJcbn1cclxuXHJcbmNsYXNzIEFuaW1hbENvbm5lY3RHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGNvbmZpZzogR2FtZUNvbmZpZztcclxuICAgIHByaXZhdGUgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PjtcclxuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PjtcclxuXHJcbiAgICBwcml2YXRlIGF1ZGlvTWFuYWdlcjogQXVkaW9NYW5hZ2VyO1xyXG4gICAgcHJpdmF0ZSB1aTogR2FtZVVJO1xyXG4gICAgcHJpdmF0ZSBib2FyZDogQm9hcmQ7XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU47XHJcblxyXG4gICAgcHJpdmF0ZSBjdXJyZW50TGV2ZWxJbmRleDogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHRpbWVSZW1haW5pbmc6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHNlbGVjdGVkVGlsZTogVGlsZSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBsYXN0TWF0Y2hDaGVja1RpbWU6IG51bWJlciA9IDA7IC8vIFRvIHByZXZlbnQgcmFwaWQgZG91YmxlIGNsaWNrc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0VsZW1lbnRJZDogc3RyaW5nLCBjb25maWc6IEdhbWVDb25maWcsIGFzc2V0czogeyBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+LCBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+IH0pIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0VsZW1lbnRJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLmltYWdlcyA9IGFzc2V0cy5pbWFnZXM7XHJcbiAgICAgICAgdGhpcy5zb3VuZHMgPSBhc3NldHMuc291bmRzO1xyXG5cclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIgPSBuZXcgQXVkaW9NYW5hZ2VyKHRoaXMuc291bmRzKTtcclxuICAgICAgICB0aGlzLnVpID0gbmV3IEdhbWVVSSh0aGlzLmN0eCwgdGhpcy5jb25maWcsIHRoaXMuaW1hZ2VzKTtcclxuICAgICAgICB0aGlzLmJvYXJkID0gbmV3IEJvYXJkKHRoaXMuY3R4LCB0aGlzLmNvbmZpZywgdGhpcy5pbWFnZXMpO1xyXG5cclxuICAgICAgICB0aGlzLnNldHVwRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwRXZlbnRMaXN0ZW5lcnMoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNsaWNrLmJpbmQodGhpcykpO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMuaGFuZGxlTW91c2VNb3ZlLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIGluaXQoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCA9IDA7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5zZWxlY3RlZFRpbGUgPSBudWxsO1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFX1NDUkVFTjtcclxuICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5zdG9wQkdNKCk7XHJcbiAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheSgnYmdtX2xvb3AnLCB0cnVlLCB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ21fbG9vcCcpPy52b2x1bWUgfHwgMC4zKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0TGV2ZWwobGV2ZWxJbmRleDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKGxldmVsSW5kZXggPj0gdGhpcy5jb25maWcubGV2ZWxzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVJfV0lOO1xyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5wbGF5KCdsZXZlbF9jb21wbGV0ZScsIGZhbHNlLCB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdsZXZlbF9jb21wbGV0ZScpPy52b2x1bWUgfHwgMC44KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCA9IGxldmVsSW5kZXg7XHJcbiAgICAgICAgY29uc3QgbGV2ZWxDb25maWcgPSB0aGlzLmNvbmZpZy5sZXZlbHNbdGhpcy5jdXJyZW50TGV2ZWxJbmRleF07XHJcbiAgICAgICAgdGhpcy50aW1lUmVtYWluaW5nID0gbGV2ZWxDb25maWcudGltZUxpbWl0U2Vjb25kcztcclxuICAgICAgICB0aGlzLnNlbGVjdGVkVGlsZSA9IG51bGw7XHJcbiAgICAgICAgdGhpcy5ib2FyZC5pbml0KGxldmVsQ29uZmlnKTtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2soZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCByZWN0ID0gdGhpcy5jYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICAgICAgY29uc3QgbW91c2VYID0gZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdDtcclxuICAgICAgICBjb25zdCBtb3VzZVkgPSBldmVudC5jbGllbnRZIC0gcmVjdC50b3A7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnVpLmhhbmRsZUNsaWNrKG1vdXNlWCwgbW91c2VZKSkge1xyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5yZXN1bWVCR00oKTsgLy8gVHJ5IHRvIHJlc3VtZSBCR00gYWZ0ZXIgdXNlciBpbnRlcmFjdGlvblxyXG4gICAgICAgICAgICByZXR1cm47IC8vIFVJIGJ1dHRvbiBjbGljayBoYW5kbGVkXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsaWNrZWRUaWxlID0gdGhpcy5ib2FyZC5nZXRUaWxlQXQobW91c2VYLCBtb3VzZVkpO1xyXG4gICAgICAgICAgICBpZiAoY2xpY2tlZFRpbGUpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNlbGVjdGVkVGlsZSA9PT0gY2xpY2tlZFRpbGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBEZXNlbGVjdCBzYW1lIHRpbGVcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkVGlsZSA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheSgndGlsZV9zZWxlY3QnLCBmYWxzZSwgdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAndGlsZV9zZWxlY3QnKT8udm9sdW1lIHx8IDAuNyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc2VsZWN0ZWRUaWxlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gU2VsZWN0IGZpcnN0IHRpbGVcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkVGlsZSA9IGNsaWNrZWRUaWxlO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnBsYXkoJ3RpbGVfc2VsZWN0JywgZmFsc2UsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ3RpbGVfc2VsZWN0Jyk/LnZvbHVtZSB8fCAwLjcpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBTZWNvbmQgdGlsZSBzZWxlY3RlZCwgYXR0ZW1wdCBtYXRjaFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRpbGUxID0gdGhpcy5zZWxlY3RlZFRpbGU7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGlsZTIgPSBjbGlja2VkVGlsZTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkVGlsZSA9IG51bGw7IC8vIENsZWFyIHNlbGVjdGlvbiBpbW1lZGlhdGVseVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5ib2FyZC5jaGVja01hdGNoKHRpbGUxLCB0aWxlMikpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ib2FyZC5yZW1vdmVUaWxlcyh0aWxlMSwgdGlsZTIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IHRoaXMuY29uZmlnLm1hdGNoU2NvcmUgKiB0aGlzLmNvbmZpZy5sZXZlbHNbdGhpcy5jdXJyZW50TGV2ZWxJbmRleF0uc2NvcmVNdWx0aXBsaWVyO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5wbGF5KCd0aWxlX21hdGNoJywgZmFsc2UsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ3RpbGVfbWF0Y2gnKT8udm9sdW1lIHx8IDAuNyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmJvYXJkLmlzQm9hcmRDbGVhcigpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5wbGF5KCdsZXZlbF9jb21wbGV0ZScsIGZhbHNlLCB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdsZXZlbF9jb21wbGV0ZScpPy52b2x1bWUgfHwgMC44KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRMZXZlbCh0aGlzLmN1cnJlbnRMZXZlbEluZGV4ICsgMSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuYm9hcmQuaGFzUmVtYWluaW5nTWF0Y2hlcygpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gT3B0aW9uYWw6IElmIG5vIG1hdGNoZXMgbGVmdCwgc2h1ZmZsZSBvciBlbmQgZ2FtZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBub3csIGxldCdzIGFzc3VtZSB2YWxpZCBib2FyZHMgYXJlIGFsd2F5cyBzb2x2YWJsZSB1bnRpbCBjbGVhci5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBIHJlYWwgZ2FtZSBtaWdodCBzaHVmZmxlIG9yIG9mZmVyIGEgaGludCBoZXJlLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIGl0IGhhcHBlbnMsIGl0IG1pZ2h0IGluZGljYXRlIGJhZCBib2FyZCBnZW5lcmF0aW9uIG9yIGFuIHVuc29sdmFibGUgc3RhdGUuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwiTm8gbW9yZSBtYXRjaGVzIGF2YWlsYWJsZSBvbiBib2FyZCwgYnV0IG5vdCBjbGVhcmVkIVwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE1pc21hdGNoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGltZVJlbWFpbmluZyAtPSB0aGlzLmNvbmZpZy5wZW5hbHR5VGltZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheSgnd3JvbmdfbWF0Y2gnLCBmYWxzZSwgdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnd3JvbmdfbWF0Y2gnKT8udm9sdW1lIHx8IDAuNyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnRpbWVSZW1haW5pbmcgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50aW1lUmVtYWluaW5nID0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9MT1NFO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheSgnZ2FtZV9vdmVyJywgZmFsc2UsIHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2dhbWVfb3ZlcicpPy52b2x1bWUgfHwgMC44KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZU1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHJlY3QgPSB0aGlzLmNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICBjb25zdCBtb3VzZVggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xyXG4gICAgICAgIGNvbnN0IG1vdXNlWSA9IGV2ZW50LmNsaWVudFkgLSByZWN0LnRvcDtcclxuICAgICAgICB0aGlzLnVpLmhhbmRsZU1vdXNlTW92ZShtb3VzZVgsIG1vdXNlWSk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLnRpbWVSZW1haW5pbmcgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAodGhpcy50aW1lUmVtYWluaW5nIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMudGltZVJlbWFpbmluZyA9IDA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnBsYXkoJ2dhbWVfb3ZlcicsIGZhbHNlLCB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdnYW1lX292ZXInKT8udm9sdW1lIHx8IDAuOCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51aS5kcmF3VGl0bGVTY3JlZW4oKCkgPT4gdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TX1NDUkVFTik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgIHRoaXMudWkuZHJhd0luc3RydWN0aW9uc1NjcmVlbigoKSA9PiB0aGlzLnN0YXJ0TGV2ZWwoMCkpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICBjb25zdCBiZ0ltYWdlID0gdGhpcy5pbWFnZXMuZ2V0KCdiYWNrZ3JvdW5kJyk7XHJcbiAgICAgICAgICAgICAgICBpZiAoYmdJbWFnZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyNBREQ4RTYnOyAvLyBGYWxsYmFjayBiYWNrZ3JvdW5kIGNvbG9yXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvYXJkLmRyYXcodGhpcy5zZWxlY3RlZFRpbGUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51aS5kcmF3UGxheWluZ1VJKHRoaXMuc2NvcmUsIHRoaXMudGltZVJlbWFpbmluZywgdGhpcy5jdXJyZW50TGV2ZWxJbmRleCwgdGhpcy5jb25maWcubGV2ZWxzLmxlbmd0aCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSX1dJTjpcclxuICAgICAgICAgICAgICAgIHRoaXMudWkuZHJhd0dhbWVPdmVyU2NyZWVuKHRydWUsICgpID0+IHRoaXMuaW5pdCgpKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRTpcclxuICAgICAgICAgICAgICAgIHRoaXMudWkuZHJhd0dhbWVPdmVyU2NyZWVuKGZhbHNlLCAoKSA9PiB0aGlzLmluaXQoKSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBHYW1lIEluaXRpYWxpemF0aW9uIC0tLVxyXG5sZXQgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcbmxldCBkZWx0YVRpbWU6IG51bWJlciA9IDA7XHJcbmxldCBnYW1lSW5zdGFuY2U6IEFuaW1hbENvbm5lY3RHYW1lIHwgbnVsbCA9IG51bGw7XHJcblxyXG5mdW5jdGlvbiBnYW1lTG9vcChjdXJyZW50VGltZTogbnVtYmVyKSB7XHJcbiAgICBpZiAoIWxhc3RUaW1lKSBsYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG4gICAgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gbGFzdFRpbWUpIC8gMTAwMDsgLy8gZGVsdGEgdGltZSBpbiBzZWNvbmRzXHJcbiAgICBsYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgIGlmIChnYW1lSW5zdGFuY2UpIHtcclxuICAgICAgICBnYW1lSW5zdGFuY2UudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgZ2FtZUluc3RhbmNlLmRyYXcoKTtcclxuICAgIH1cclxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShnYW1lTG9vcCk7XHJcbn1cclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG5cclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQuIFBsZWFzZSBlbnN1cmUgeW91ciBIVE1MIGluY2x1ZGVzIDxjYW52YXMgaWQ9XCJnYW1lQ2FudmFzXCI+PC9jYW52YXM+LicpO1xyXG4gICAgICAgIGNvbnN0IGVycm9yRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgZXJyb3JEaXYuc3R5bGUuY29sb3IgPSAncmVkJztcclxuICAgICAgICBlcnJvckRpdi5zdHlsZS50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICBlcnJvckRpdi5zdHlsZS5tYXJnaW5Ub3AgPSAnNTBweCc7XHJcbiAgICAgICAgZXJyb3JEaXYuc3R5bGUuZm9udEZhbWlseSA9ICdzYW5zLXNlcmlmJztcclxuICAgICAgICBlcnJvckRpdi5pbm5lclRleHQgPSAnXHVDNjI0XHVCOTU4OiBcdUFDOENcdUM3ODQgXHVDRTk0XHVCQzg0XHVDMkE0IChJRCBcImdhbWVDYW52YXNcIilcdUI5N0MgXHVDQzNFXHVDNzQ0IFx1QzIxOCBcdUM1QzZcdUMyQjVcdUIyQzhcdUIyRTQuIEhUTUwgXHVEMzBDXHVDNzdDXHVDNUQwIDxjYW52YXMgaWQ9XCJnYW1lQ2FudmFzXCI+PC9jYW52YXM+IFx1QzY5NFx1QzE4Q1x1QUMwMCBcdUM3ODhcdUIyOTRcdUM5QzAgXHVENjU1XHVDNzc4XHVENTc0XHVDOEZDXHVDMTM4XHVDNjk0Lic7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICAgICAgcmV0dXJuOyAvLyBTdG9wIGV4ZWN1dGlvbiBpZiBjYW52YXMgaXMgbm90IGZvdW5kXHJcbiAgICB9XHJcblxyXG4gICAgZmV0Y2goJ2RhdGEuanNvbicpXHJcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC50aGVuKGFzeW5jIChkYXRhOiBHYW1lQ29uZmlnKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFzc2V0TG9hZGVyID0gbmV3IEFzc2V0TG9hZGVyKCk7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsb2FkZWRBc3NldHMgPSBhd2FpdCBhc3NldExvYWRlci5sb2FkKGRhdGEuYXNzZXRzKTtcclxuICAgICAgICAgICAgICAgIGdhbWVJbnN0YW5jZSA9IG5ldyBBbmltYWxDb25uZWN0R2FtZSgnZ2FtZUNhbnZhcycsIGRhdGEsIGxvYWRlZEFzc2V0cyk7XHJcbiAgICAgICAgICAgICAgICBnYW1lSW5zdGFuY2UuaW5pdCgpO1xyXG4gICAgICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTsgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBnYW1lIGFzc2V0czonLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcclxuICAgICAgICAgICAgICAgIGlmIChjdHgpIHtcclxuICAgICAgICAgICAgICAgICAgICBjdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdyZWQnO1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICAgICAgICAgICAgICBjdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxUZXh0KCdcdUFDOENcdUM3ODQgXHVDNUQwXHVDMTRCIFx1Qjg1Q1x1QjREQyBcdUM5MTEgXHVDNjI0XHVCOTU4IFx1QkMxQ1x1QzBERDogJyArIChlcnJvciBhcyBFcnJvcikubWVzc2FnZSwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIGdhbWUgZGF0YTonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIERpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBkaXJlY3RseSBvbiB0aGUgY2FudmFzIGlmIGxvYWRpbmcgZmFpbHNcclxuICAgICAgICAgICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XHJcbiAgICAgICAgICAgIGlmIChjdHgpIHtcclxuICAgICAgICAgICAgICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICAgICAgICAgIGN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgICAgICAgICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICAgICAgY3R4LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xyXG4gICAgICAgICAgICAgICAgY3R4LmZpbGxUZXh0KCdcdUFDOENcdUM3ODQgXHVCODVDXHVCNERDIFx1QzkxMSBcdUM2MjRcdUI5NTggXHVCQzFDXHVDMEREOiAnICsgZXJyb3IubWVzc2FnZSwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUFzREEsTUFBTSxRQUFRO0FBQUEsRUFDVixZQUFtQixH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
