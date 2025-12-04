var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER_WIN"] = 3] = "GAME_OVER_WIN";
  GameState2[GameState2["GAME_OVER_LOSE"] = 4] = "GAME_OVER_LOSE";
  return GameState2;
})(GameState || {});
var TileType = /* @__PURE__ */ ((TileType2) => {
  TileType2[TileType2["EMPTY"] = 0] = "EMPTY";
  TileType2[TileType2["SOLID"] = 1] = "SOLID";
  TileType2[TileType2["BREAKABLE"] = 2] = "BREAKABLE";
  return TileType2;
})(TileType || {});
var PowerUpType = /* @__PURE__ */ ((PowerUpType2) => {
  PowerUpType2[PowerUpType2["BOMB_UP"] = 0] = "BOMB_UP";
  PowerUpType2[PowerUpType2["RANGE_UP"] = 1] = "RANGE_UP";
  PowerUpType2[PowerUpType2["SPEED_UP"] = 2] = "SPEED_UP";
  return PowerUpType2;
})(PowerUpType || {});
class AssetLoader {
  constructor(config) {
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.totalAssets = 0;
    this.loadedAssets = 0;
    this.onProgress = null;
    this.config = config;
    this.totalAssets = config.assets.images.length + config.assets.sounds.length;
  }
  /**
   * Loads all assets.
   * @param onProgress Callback function to report loading progress (0 to 1).
   * @returns A promise that resolves with maps of loaded images and sounds.
   */
  async load(onProgress) {
    this.onProgress = onProgress || null;
    this.loadedAssets = 0;
    const imagePromises = this.config.assets.images.map((imgData) => this.loadImage(imgData));
    const soundPromises = this.config.assets.sounds.map((soundData) => this.loadSound(soundData));
    await Promise.all([...imagePromises, ...soundPromises]);
    return {
      images: this.images,
      sounds: this.sounds
    };
  }
  loadImage(imgData) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(imgData.name, img);
        this.loadedAssets++;
        this.reportProgress();
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${imgData.path}`);
        this.loadedAssets++;
        this.reportProgress();
        resolve();
      };
      img.src = imgData.path;
    });
  }
  loadSound(soundData) {
    return new Promise((resolve) => {
      const audio = new Audio(soundData.path);
      audio.volume = soundData.volume;
      audio.load();
      this.sounds.set(soundData.name, audio);
      this.loadedAssets++;
      this.reportProgress();
      resolve();
    });
  }
  reportProgress() {
    if (this.onProgress) {
      this.onProgress(this.loadedAssets / this.totalAssets);
    }
  }
}
class SoundManager {
  // Global sound state
  constructor(sounds) {
    this.backgroundMusic = null;
    this.soundOn = true;
    this.sounds = sounds;
  }
  /**
   * Sets the background music to play.
   * @param name The name of the sound asset for BGM.
   */
  setBackgroundMusic(name) {
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
    }
    const bgm = this.sounds.get(name);
    if (bgm) {
      this.backgroundMusic = bgm;
      this.backgroundMusic.loop = true;
      this.backgroundMusic.volume = bgm.volume;
      if (this.soundOn) {
        this.playBGM();
      }
    }
  }
  /**
   * Plays a sound effect.
   * @param name The name of the sound asset to play.
   * @param loop Whether the sound should loop.
   * @param volume Optional volume override.
   * @returns The cloned Audio element if played, null otherwise.
   */
  playSound(name, loop = false, volume) {
    if (!this.soundOn) return null;
    const audio = this.sounds.get(name);
    if (audio) {
      const clone = audio.cloneNode();
      clone.volume = volume !== void 0 ? volume : audio.volume;
      clone.loop = loop;
      clone.play().catch((e) => {
      });
      return clone;
    }
    return null;
  }
  /**
   * Plays the currently set background music.
   */
  playBGM() {
    if (!this.soundOn || !this.backgroundMusic) return;
    this.backgroundMusic.play().catch((e) => {
    });
  }
  /**
   * Stops the background music.
   */
  stopBGM() {
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
    }
  }
  /**
   * Toggles the global sound state (on/off).
   */
  toggleSound() {
    this.soundOn = !this.soundOn;
    if (this.soundOn) {
      this.playBGM();
    } else {
      this.stopBGM();
    }
  }
}
class GameObject {
  constructor(x, y, width, height, imageName) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.imageName = imageName;
  }
  /**
   * Draws the game object on the canvas.
   * @param ctx The 2D rendering context.
   * @param images Map of loaded images.
   * @param tileSize Size of a single tile for consistent scaling.
   */
  draw(ctx, images, tileSize) {
    const img = images.get(this.imageName);
    if (img) {
      ctx.drawImage(img, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = "fuchsia";
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
  /**
   * Gets the tile position of the center of the game object.
   * @param tileSize The size of a single tile.
   * @returns The tile position.
   */
  getTilePos(tileSize) {
    return {
      row: Math.floor((this.y + this.height / 2) / tileSize),
      col: Math.floor((this.x + this.width / 2) / tileSize)
    };
  }
  /**
   * Checks for collision with another GameObject using AABB (Axis-Aligned Bounding Box).
   * @param other The other GameObject to check against.
   * @returns True if colliding, false otherwise.
   */
  collidesWith(other) {
    return this.x < other.x + other.width && this.x + this.width > other.x && this.y < other.y + other.height && this.y + this.height > other.y;
  }
}
class Entity extends GameObject {
  // The tile the entity is moving towards
  constructor(x, y, width, height, imageName, speed, tileSize) {
    super(x, y, width, height, imageName);
    this.dx = 0;
    // Direction x (-1, 0, 1)
    this.dy = 0;
    // Movement speed in pixels per second
    this.isMoving = false;
    this.speed = speed;
    this.currentTile = this.getTilePos(tileSize);
    this.targetTile = { ...this.currentTile };
  }
  update(deltaTime, game2) {
    const tileSize = game2.config.gameSettings.tileSize;
    if (this.isMoving) {
      const targetX = this.targetTile.col * tileSize;
      const targetY = this.targetTile.row * tileSize;
      let reachedX = false;
      let reachedY = false;
      if (this.dx !== 0) {
        const moveAmount = this.dx * this.speed * deltaTime;
        this.x += moveAmount;
        if (this.dx > 0 && this.x >= targetX || this.dx < 0 && this.x <= targetX) {
          this.x = targetX;
          reachedX = true;
        }
      } else {
        reachedX = true;
      }
      if (this.dy !== 0) {
        const moveAmount = this.dy * this.speed * deltaTime;
        this.y += moveAmount;
        if (this.dy > 0 && this.y >= targetY || this.dy < 0 && this.y <= targetY) {
          this.y = targetY;
          reachedY = true;
        }
      } else {
        reachedY = true;
      }
      if (reachedX && reachedY) {
        this.isMoving = false;
        this.dx = 0;
        this.dy = 0;
        this.currentTile = { ...this.targetTile };
      }
    }
  }
  /**
   * Attempts to move the entity by a given delta in tile coordinates.
   * @param deltaCol Change in column.
   * @param deltaRow Change in row.
   * @param map The game map.
   * @param tileSize The size of a single tile.
   * @returns True if movement was initiated, false otherwise (e.g., blocked).
   */
  attemptMove(deltaCol, deltaRow, map, tileSize) {
    if (this.isMoving) return false;
    const nextCol = this.currentTile.col + deltaCol;
    const nextRow = this.currentTile.row + deltaRow;
    if (nextCol < 0 || nextCol >= map[0].length || nextRow < 0 || nextRow >= map.length) {
      return false;
    }
    const nextTile = map[nextRow][nextCol];
    if (nextTile.type === 1 /* SOLID */ || nextTile.type === 2 /* BREAKABLE */) {
      return false;
    }
    this.targetTile = { col: nextCol, row: nextRow };
    this.dx = deltaCol;
    this.dy = deltaRow;
    this.isMoving = true;
    return true;
  }
}
class Player extends Entity {
  // AI's current target (human player)
  constructor(id, x, y, width, height, imageName, speed, tileSize, config, isAI = false) {
    super(x, y, width, height, imageName, speed, tileSize);
    this.immuneTimer = 0;
    // Invincibility frames after being hit
    this.isDead = false;
    // AI specific properties
    this.aiPath = [];
    // Current path for AI navigation
    this.aiState = "IDLE";
    this.aiBombTimer = 0;
    // Cooldown for AI bomb placement
    this.targetPlayer = null;
    this.id = id;
    this.maxBombs = config.gameSettings.initialMaxBombs;
    this.currentBombs = 0;
    this.bombRange = config.gameSettings.initialBombRange;
    this.lives = config.gameSettings.initialLives;
    this.isAI = isAI;
  }
  update(deltaTime, game2) {
    super.update(deltaTime, game2);
    if (this.immuneTimer > 0) {
      this.immuneTimer -= deltaTime;
    }
    if (this.isAI && !this.isDead) {
      this.updateAI(deltaTime, game2);
    }
  }
  draw(ctx, images, tileSize) {
    if (this.isDead) return;
    if (this.immuneTimer > 0 && Math.floor(this.immuneTimer * 10) % 2 === 0) {
      return;
    }
    super.draw(ctx, images, tileSize);
  }
  /**
   * Attempts to place a bomb at the player's current tile.
   * @param game The main game instance.
   * @returns The new Bomb object if placed, null otherwise.
   */
  placeBomb(game2) {
    if (this.currentBombs < this.maxBombs && !this.isMoving) {
      const tileX = this.currentTile.col * game2.config.gameSettings.tileSize;
      const tileY = this.currentTile.row * game2.config.gameSettings.tileSize;
      const existingBomb = game2.bombs.find((b) => b.getTilePos(game2.config.gameSettings.tileSize).col === this.currentTile.col && b.getTilePos(game2.config.gameSettings.tileSize).row === this.currentTile.row);
      if (existingBomb) {
        return null;
      }
      this.currentBombs++;
      game2.soundManager.playSound("bomb_place");
      return new Bomb(
        tileX,
        tileY,
        game2.config.gameSettings.tileSize,
        game2.config.gameSettings.tileSize,
        "bomb",
        game2.config.gameSettings.bombFuseTime,
        this.bombRange,
        this.id
      );
    }
    return null;
  }
  /**
   * Player takes damage, reducing lives and granting temporary invincibility.
   * @param game The main game instance.
   */
  takeDamage(game2) {
    if (this.immuneTimer <= 0) {
      this.lives--;
      game2.soundManager.playSound("player_hit");
      if (this.lives <= 0) {
        this.isDead = true;
        game2.soundManager.playSound("player_die");
      } else {
        this.immuneTimer = 2;
      }
    }
  }
  /**
   * Applies a collected power-up effect to the player.
   * @param type The type of power-up collected.
   * @param game The main game instance.
   */
  applyPowerUp(type, game2) {
    game2.soundManager.playSound("powerup_collect");
    switch (type) {
      case 0 /* BOMB_UP */:
        this.maxBombs++;
        break;
      case 1 /* RANGE_UP */:
        this.bombRange++;
        break;
      case 2 /* SPEED_UP */:
        this.speed += 50;
        break;
    }
  }
  // --- AI Logic ---
  /**
   * Updates the AI's behavior based on game state.
   * @param deltaTime Time elapsed since last frame.
   * @param game The main game instance.
   */
  updateAI(deltaTime, game2) {
    const { tileSize } = game2.config.gameSettings;
    const map = game2.map;
    if (!this.targetPlayer || this.targetPlayer.isDead) {
      const livePlayers = game2.players.filter((p) => !p.isAI && !p.isDead);
      if (livePlayers.length > 0) {
        this.targetPlayer = livePlayers[0];
      } else {
        return;
      }
    }
    const myTile = this.currentTile;
    const playerTile = this.targetPlayer.currentTile;
    if (this.aiBombTimer > 0) {
      this.aiBombTimer -= deltaTime;
    }
    const dangerZone = this.isTileInExplosionDanger(myTile, game2.bombs, game2.config.gameSettings.bombFuseTime, tileSize);
    const playerClose = Math.abs(myTile.col - playerTile.col) <= 3 && Math.abs(myTile.row - playerTile.row) <= 3;
    const canPlaceBomb = this.currentBombs < this.maxBombs && this.aiBombTimer <= 0;
    if (dangerZone) {
      this.aiState = "EVADE";
    } else if (playerClose && canPlaceBomb && this.canBombPlayer(myTile, playerTile, map, game2.bombs)) {
      this.aiState = "BOMB_PLACEMENT";
    } else {
      this.aiState = "CHASE";
    }
    switch (this.aiState) {
      case "EVADE":
        this.evadeBombs(game2);
        break;
      case "BOMB_PLACEMENT":
        this.performBombPlacement(game2);
        break;
      case "CHASE":
        this.chasePlayer(game2, playerTile);
        break;
      case "IDLE":
        this.findAndBreakBlock(game2);
        break;
    }
  }
  /**
   * Checks if a given tile is within the explosion radius of any active bomb.
   * @param tile The tile to check.
   * @param bombs All active bombs in the game.
   * @param fuseTime The total fuse time of a bomb.
   * @param tileSize The size of a single tile.
   * @returns True if the tile is in danger, false otherwise.
   */
  isTileInExplosionDanger(tile, bombs, fuseTime, tileSize) {
    for (const bomb of bombs) {
      if (bomb.timer > 0 && bomb.timer <= fuseTime * 0.9) {
        const bombTile = bomb.getTilePos(tileSize);
        if (bombTile.row === tile.row && Math.abs(bombTile.col - tile.col) <= bomb.range) return true;
        if (bombTile.col === tile.col && Math.abs(bombTile.row - tile.row) <= bomb.range) return true;
      }
    }
    return false;
  }
  /**
   * Finds a safe path from a start tile to a target tile, avoiding dangerous explosion zones.
   * Uses a simple Breadth-First Search (BFS).
   * @param start The starting tile.
   * @param target The target tile.
   * @param game The main game instance.
   * @returns An array of TilePositions representing the path, or empty array if no safe path.
   */
  getSafePath(start, target, game2) {
    const queue = [];
    const visited = /* @__PURE__ */ new Set();
    const map = game2.map;
    const { tileSize, bombFuseTime } = game2.config.gameSettings;
    queue.push({ tile: start, path: [start] });
    visited.add(`${start.row},${start.col}`);
    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];
    while (queue.length > 0) {
      const { tile, path } = queue.shift();
      if (tile.row === target.row && tile.col === target.col) {
        return path;
      }
      for (const dir of directions) {
        const neighbor = { row: tile.row + dir.dr, col: tile.col + dir.dc };
        if (neighbor.row < 0 || neighbor.row >= map.length || neighbor.col < 0 || neighbor.col >= map[0].length) continue;
        const neighborKey = `${neighbor.row},${neighbor.col}`;
        if (visited.has(neighborKey)) continue;
        const tileType = map[neighbor.row][neighbor.col].type;
        if (tileType === 1 /* SOLID */ || tileType === 2 /* BREAKABLE */) continue;
        if (this.isTileInExplosionDanger(neighbor, game2.bombs, bombFuseTime, tileSize)) continue;
        visited.add(neighborKey);
        queue.push({ tile: neighbor, path: [...path, neighbor] });
      }
    }
    return [];
  }
  /**
   * AI attempts to move to a safe tile if currently in danger.
   * @param game The main game instance.
   */
  evadeBombs(game2) {
    if (this.isMoving) return;
    const myTile = this.currentTile;
    const map = game2.map;
    const { bombFuseTime, tileSize } = game2.config.gameSettings;
    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];
    for (const dir of directions) {
      const nextTile = { row: myTile.row + dir.dr, col: myTile.col + dir.dc };
      if (nextTile.row < 0 || nextTile.row >= map.length || nextTile.col < 0 || nextTile.col >= map[0].length) continue;
      const mapTile = map[nextTile.row][nextTile.col];
      if (mapTile.type === 0 /* EMPTY */ && !this.isTileInExplosionDanger(nextTile, game2.bombs, bombFuseTime, tileSize)) {
        this.attemptMove(dir.dc, dir.dr, map, tileSize);
        this.aiPath = [];
        return;
      }
    }
  }
  /**
   * AI attempts to chase the target human player.
   * @param game The main game instance.
   * @param playerTile The target player's current tile.
   */
  chasePlayer(game2, playerTile) {
    if (this.isMoving) return;
    if (this.aiPath.length === 0 || this.aiPath.length > 0 && (this.aiPath[this.aiPath.length - 1].row !== playerTile.row || this.aiPath[this.aiPath.length - 1].col !== playerTile.col)) {
      this.aiPath = this.getSafePath(this.currentTile, playerTile, game2);
    }
    if (this.aiPath.length > 1) {
      const nextStep = this.aiPath[1];
      const dr = nextStep.row - this.currentTile.row;
      const dc = nextStep.col - this.currentTile.col;
      this.attemptMove(dc, dr, game2.map, game2.config.gameSettings.tileSize);
    } else {
      this.findAndBreakBlock(game2);
    }
  }
  /**
   * AI attempts to place a bomb and then evade.
   * @param game The main game instance.
   */
  performBombPlacement(game2) {
    if (this.isMoving) return;
    if (this.aiBombTimer > 0) return;
    const bomb = this.placeBomb(game2);
    if (bomb) {
      this.aiBombTimer = 1.5;
      this.evadeBombs(game2);
    }
  }
  /**
   * Checks if the AI can effectively bomb the target player (line of sight and range).
   * @param myTile AI's current tile.
   * @param playerTile Target player's current tile.
   * @param map The game map.
   * @param bombs All active bombs.
   * @returns True if the AI can bomb the player.
   */
  canBombPlayer(myTile, playerTile, map, bombs) {
    const existingBombAtMyTile = bombs.some((b) => b.getTilePos(game.config.gameSettings.tileSize).col === myTile.col && b.getTilePos(game.config.gameSettings.tileSize).row === myTile.row);
    if (existingBombAtMyTile) return false;
    const range = this.bombRange;
    if (myTile.row === playerTile.row) {
      if (Math.abs(myTile.col - playerTile.col) <= range) {
        const startCol = Math.min(myTile.col, playerTile.col);
        const endCol = Math.max(myTile.col, playerTile.col);
        let blocked = false;
        for (let c = startCol + 1; c < endCol; c++) {
          if (map[myTile.row][c].type === 1 /* SOLID */) {
            blocked = true;
            break;
          }
        }
        if (!blocked) return true;
      }
    }
    if (myTile.col === playerTile.col) {
      if (Math.abs(myTile.row - playerTile.row) <= range) {
        const startRow = Math.min(myTile.row, playerTile.row);
        const endRow = Math.max(myTile.row, playerTile.row);
        let blocked = false;
        for (let r = startRow + 1; r < endRow; r++) {
          if (map[r][myTile.col].type === 1 /* SOLID */) {
            blocked = true;
            break;
          }
        }
        if (!blocked) return true;
      }
    }
    return false;
  }
  /**
   * AI attempts to find and break a breakable block.
   * @param game The main game instance.
   */
  findAndBreakBlock(game2) {
    if (this.isMoving) return;
    const myTile = this.currentTile;
    const map = game2.map;
    const { tileSize } = game2.config.gameSettings;
    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];
    for (const dir of directions) {
      const nextTile = { row: myTile.row + dir.dr, col: myTile.col + dir.dc };
      if (nextTile.row < 0 || nextTile.row >= map.length || nextTile.col < 0 || nextTile.col >= map[0].length) continue;
      const mapTile = map[nextTile.row][nextTile.col];
      if (mapTile.type === 2 /* BREAKABLE */) {
        if (this.currentBombs < this.maxBombs && this.aiBombTimer <= 0) {
          this.performBombPlacement(game2);
          this.evadeBombs(game2);
          return;
        }
      }
    }
    if (this.aiPath.length === 0) {
      const breakableTiles = [];
      for (let r = 0; r < map.length; r++) {
        for (let c = 0; c < map[0].length; c++) {
          if (map[r][c].type === 2 /* BREAKABLE */) {
            breakableTiles.push({ row: r, col: c });
          }
        }
      }
      if (breakableTiles.length > 0) {
        const target = breakableTiles[Math.floor(Math.random() * breakableTiles.length)];
        this.aiPath = this.getSafePath(myTile, target, game2);
      }
    }
    if (this.aiPath.length > 1) {
      const nextStep = this.aiPath[1];
      const dr = nextStep.row - this.currentTile.row;
      const dc = nextStep.col - this.currentTile.col;
      this.attemptMove(dc, dr, map, tileSize);
    } else {
      const randomDir = directions[Math.floor(Math.random() * directions.length)];
      this.attemptMove(randomDir.dc, randomDir.dr, map, tileSize);
    }
  }
}
class Bomb extends GameObject {
  // ID of the player who placed this bomb
  constructor(x, y, width, height, imageName, fuseTime, range, ownerId) {
    super(x, y, width, height, imageName);
    this.timer = fuseTime;
    this.range = range;
    this.ownerId = ownerId;
  }
  update(deltaTime, game2) {
    this.timer -= deltaTime;
    if (this.timer <= 0) {
      game2.triggerExplosion(this);
    }
  }
  draw(ctx, images, tileSize) {
    const img = images.get(this.imageName);
    if (img) {
      const flashRate = this.timer < 0.5 ? 0.05 : 0.2;
      if (Math.floor(this.timer / flashRate) % 2 === 0) {
        ctx.drawImage(img, this.x, this.y, this.width, this.height);
      }
    } else {
      ctx.fillStyle = "orange";
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}
class Explosion extends GameObject {
  constructor(x, y, width, height, imageName, duration, isCenter = false, isVertical = false, isEnd = false) {
    super(x, y, width, height, imageName);
    this.timer = duration;
    this.isCenter = isCenter;
    this.isVertical = isVertical;
    this.isEnd = isEnd;
  }
  update(deltaTime, game2) {
    this.timer -= deltaTime;
  }
}
class Tile {
  // Null if no power-up
  constructor(type, imageName, hasPowerUp = null) {
    this.type = type;
    this.imageName = imageName;
    this.hasPowerUp = hasPowerUp;
  }
}
class Game {
  // Number of AI players
  constructor(canvasId) {
    // Manages game audio
    this.lastTime = 0;
    // Timestamp of previous frame
    this.animationFrameId = null;
    // ID for requestAnimationFrame
    this.gameState = 0 /* TITLE */;
    // Current game state
    this.input = {};
    // Tracks currently pressed keys
    this.pressedKeys = {};
    // Tracks keys pressed once per frame
    this.players = [];
    this.bombs = [];
    this.explosions = [];
    // The game map grid
    this.player1 = null;
    // Reference to the human player
    this.humanPlayersCount = 0;
    // Number of human players (currently only 1)
    this.aiPlayersCount = 0;
    /**
     * Handles keydown events, updating input state and triggering state transitions.
     */
    this.handleKeyDown = (e) => {
      this.input[e.key] = true;
      this.pressedKeys[e.key] = true;
      if (this.gameState === 0 /* TITLE */ || this.gameState === 1 /* INSTRUCTIONS */) {
        if (this.gameState === 0 /* TITLE */) {
          this.soundManager.playBGM();
          this.changeState(1 /* INSTRUCTIONS */);
        } else if (this.gameState === 1 /* INSTRUCTIONS */) {
          this.changeState(2 /* PLAYING */);
        }
      }
    };
    /**
     * Handles keyup events, updating input state.
     */
    this.handleKeyUp = (e) => {
      this.input[e.key] = false;
    };
    /**
     * Handles clicks on the canvas, primarily for UI elements like the sound button.
     */
    this.handleCanvasClick = (e) => {
      if (this.gameState === 2 /* PLAYING */) {
        const buttonSize = 30;
        const padding = 10;
        const btnX = this.canvas.width - buttonSize - padding;
        const btnY = padding;
        if (e.offsetX >= btnX && e.offsetX <= btnX + buttonSize && e.offsetY >= btnY && e.offsetY <= btnY + buttonSize) {
          this.soundManager.toggleSound();
        }
      }
    };
    /**
     * Handles initial mouse down event to attempt playing BGM, circumventing browser autoplay policies.
     */
    this.handleMouseDown = () => {
      if (this.gameState === 0 /* TITLE */ && this.soundManager) {
        this.soundManager.playBGM();
      }
      window.removeEventListener("mousedown", this.handleMouseDown);
    };
    /**
     * The main game loop, called repeatedly via requestAnimationFrame.
     * @param currentTime Current timestamp from performance.now().
     */
    this.loop = (currentTime) => {
      const deltaTime = (currentTime - this.lastTime) / 1e3;
      this.lastTime = currentTime;
      this.update(deltaTime);
      this.render();
      for (const key in this.pressedKeys) {
        this.pressedKeys[key] = false;
      }
      this.animationFrameId = requestAnimationFrame(this.loop);
    };
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    this.canvas.addEventListener("click", this.handleCanvasClick);
    window.addEventListener("mousedown", this.handleMouseDown);
  }
  /**
   * Initializes the game by loading configuration and assets, then starts the game loop.
   * @param configPath Path to the data.json configuration file.
   */
  async init(configPath) {
    try {
      const response = await fetch(configPath);
      this.config = await response.json();
      this.canvas.width = this.config.gameSettings.canvasWidth;
      this.canvas.height = this.config.gameSettings.canvasHeight;
      const assetLoader = new AssetLoader(this.config);
      const assets = await assetLoader.load((progress) => {
        this.drawLoadingScreen(progress);
      });
      this.images = assets.images;
      this.soundManager = new SoundManager(assets.sounds);
      this.soundManager.setBackgroundMusic("bgm");
      this.lastTime = performance.now();
      this.loop(this.lastTime);
    } catch (error) {
      console.error("Failed to load game configuration or assets:", error);
      this.ctx.fillStyle = "red";
      this.ctx.font = "24px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText("ERROR: Failed to load game.", this.canvas.width / 2, this.canvas.height / 2);
    }
  }
  /**
   * Draws a loading progress screen while assets are being loaded.
   * @param progress Current loading progress (0 to 1).
   */
  drawLoadingScreen(progress) {
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Loading Assets...", this.canvas.width / 2, this.canvas.height / 2 - 20);
    this.ctx.fillRect(this.canvas.width / 2 - 100, this.canvas.height / 2, 200, 10);
    this.ctx.fillStyle = "green";
    this.ctx.fillRect(this.canvas.width / 2 - 100, this.canvas.height / 2, 200 * progress, 10);
    this.ctx.fillText(`${Math.round(progress * 100)}%`, this.canvas.width / 2, this.canvas.height / 2 + 40);
  }
  /**
   * Sets up the initial game state, map, and players for a new round.
   */
  setupGame() {
    this.map = this.generateMap();
    this.spawnPlayers();
    this.bombs = [];
    this.explosions = [];
    this.soundManager.playBGM();
  }
  /**
   * Changes the current game state and performs any necessary actions for the new state.
   * @param newState The GameState to transition to.
   */
  changeState(newState) {
    this.gameState = newState;
    if (newState === 2 /* PLAYING */) {
      this.setupGame();
    } else if (newState === 3 /* GAME_OVER_WIN */ || newState === 4 /* GAME_OVER_LOSE */) {
      this.soundManager.stopBGM();
    } else if (newState === 0 /* TITLE */) {
      this.soundManager.playBGM();
    }
  }
  /**
   * Updates the game logic based on the current state.
   * @param deltaTime Time elapsed since the last update.
   */
  update(deltaTime) {
    switch (this.gameState) {
      case 0 /* TITLE */:
      case 1 /* INSTRUCTIONS */:
        break;
      case 2 /* PLAYING */:
        this.updateGamePlaying(deltaTime);
        break;
      case 3 /* GAME_OVER_WIN */:
      case 4 /* GAME_OVER_LOSE */:
        if (this.pressedKeys["Enter"]) {
          this.changeState(0 /* TITLE */);
        }
        break;
    }
  }
  /**
   * Updates game logic specifically for the PLAYING state.
   * @param deltaTime Time elapsed.
   */
  updateGamePlaying(deltaTime) {
    this.players.forEach((player) => {
      player.update(deltaTime, this);
      if (!player.isAI && !player.isDead) {
        this.handlePlayerInput(player);
      }
    });
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      this.bombs[i].update(deltaTime, this);
    }
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      this.explosions[i].update(deltaTime, this);
      if (this.explosions[i].timer <= 0) {
        this.explosions.splice(i, 1);
      }
    }
    this.checkCollisions();
    this.checkGameEndCondition();
  }
  /**
   * Handles keyboard input for the human player.
   * @param player The human player object.
   */
  handlePlayerInput(player) {
    if (player.isMoving) return;
    let moved = false;
    if (this.input["ArrowUp"] || this.input["w"]) {
      moved = player.attemptMove(0, -1, this.map, this.config.gameSettings.tileSize);
    } else if (this.input["ArrowDown"] || this.input["s"]) {
      moved = player.attemptMove(0, 1, this.map, this.config.gameSettings.tileSize);
    } else if (this.input["ArrowLeft"] || this.input["a"]) {
      moved = player.attemptMove(-1, 0, this.map, this.config.gameSettings.tileSize);
    } else if (this.input["ArrowRight"] || this.input["d"]) {
      moved = player.attemptMove(1, 0, this.map, this.config.gameSettings.tileSize);
    }
    if (moved) {
      this.soundManager.playSound("player_move", false, 0.3);
    }
    if (this.pressedKeys[" "]) {
      const newBomb = player.placeBomb(this);
      if (newBomb) {
        this.bombs.push(newBomb);
      }
    }
  }
  /**
   * Checks for collisions between various game objects.
   */
  checkCollisions() {
    const tileSize = this.config.gameSettings.tileSize;
    this.players.forEach((player) => {
      if (player.isDead || player.immuneTimer > 0) return;
      this.explosions.forEach((explosion) => {
        if (player.collidesWith(explosion)) {
          player.takeDamage(this);
        }
      });
    });
    this.players.forEach((player) => {
      if (player.isDead) return;
      const playerTile = player.getTilePos(tileSize);
      const mapTile = this.map[playerTile.row][playerTile.col];
      if (mapTile.type === 0 /* EMPTY */ && mapTile.hasPowerUp !== null) {
        player.applyPowerUp(mapTile.hasPowerUp, this);
        mapTile.hasPowerUp = null;
        mapTile.imageName = "empty_tile";
      }
    });
  }
  /**
   * Triggers an explosion originating from a given bomb.
   * Handles explosion propagation, block destruction, and chain reactions.
   * @param bomb The bomb that is exploding.
   */
  triggerExplosion(bomb) {
    this.soundManager.playSound("explosion");
    const tileSize = this.config.gameSettings.tileSize;
    const bombTile = bomb.getTilePos(tileSize);
    const mapWidth = this.config.mapSettings.mapWidth;
    const mapHeight = this.config.mapSettings.mapHeight;
    const owner = this.players.find((p) => p.id === bomb.ownerId);
    if (owner) {
      owner.currentBombs--;
      if (owner.currentBombs < 0) owner.currentBombs = 0;
    }
    this.bombs = this.bombs.filter((b) => b !== bomb);
    this.explosions.push(new Explosion(
      bombTile.col * tileSize,
      bombTile.row * tileSize,
      tileSize,
      tileSize,
      "explosion_center",
      this.config.gameSettings.explosionDuration,
      true
    ));
    const directions = [
      { dr: 0, dc: 1, isVertical: false },
      // Right
      { dr: 0, dc: -1, isVertical: false },
      // Left
      { dr: 1, dc: 0, isVertical: true },
      // Down
      { dr: -1, dc: 0, isVertical: true }
      // Up
    ];
    directions.forEach((dir) => {
      for (let i = 1; i <= bomb.range; i++) {
        const targetRow = bombTile.row + dir.dr * i;
        const targetCol = bombTile.col + dir.dc * i;
        if (targetRow < 0 || targetRow >= mapHeight || targetCol < 0 || targetCol >= mapWidth) break;
        const targetTile = this.map[targetRow][targetCol];
        if (targetTile.type === 1 /* SOLID */) break;
        let explosionImageName = dir.isVertical ? "explosion_vertical" : "explosion_horizontal";
        if (i === bomb.range || targetTile.type === 2 /* BREAKABLE */) {
          explosionImageName = dir.isVertical ? "explosion_end_vertical" : "explosion_end_horizontal";
        }
        this.explosions.push(new Explosion(
          targetCol * tileSize,
          targetRow * tileSize,
          tileSize,
          tileSize,
          explosionImageName,
          this.config.gameSettings.explosionDuration,
          false,
          dir.isVertical,
          i === bomb.range
        ));
        if (targetTile.type === 2 /* BREAKABLE */) {
          this.destroyBlock(targetRow, targetCol);
          break;
        }
        const hitBomb = this.bombs.find(
          (b) => b.getTilePos(tileSize).row === targetRow && b.getTilePos(tileSize).col === targetCol
        );
        if (hitBomb) {
          hitBomb.timer = 0;
        }
      }
    });
  }
  /**
   * Destroys a breakable block at the given map coordinates.
   * May drop a power-up.
   * @param row Row of the block.
   * @param col Column of the block.
   */
  destroyBlock(row, col) {
    this.map[row][col].type = 0 /* EMPTY */;
    this.map[row][col].imageName = "empty_tile";
    this.soundManager.playSound("block_break");
    if (Math.random() < this.config.gameSettings.powerUpDropChance) {
      const powerUpTypes = [0 /* BOMB_UP */, 1 /* RANGE_UP */, 2 /* SPEED_UP */];
      const randomPowerUp = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
      this.map[row][col].hasPowerUp = randomPowerUp;
      this.map[row][col].imageName = this.getPowerUpImageName(randomPowerUp);
    }
  }
  /**
   * Returns the appropriate image name for a given PowerUpType.
   * @param type The type of power-up.
   * @returns The image name string.
   */
  getPowerUpImageName(type) {
    switch (type) {
      case 0 /* BOMB_UP */:
        return "powerup_bomb";
      case 1 /* RANGE_UP */:
        return "powerup_range";
      case 2 /* SPEED_UP */:
        return "powerup_speed";
      default:
        return "empty_tile";
    }
  }
  /**
   * Checks if the game win or lose conditions have been met.
   */
  checkGameEndCondition() {
    const liveHumanPlayers = this.players.filter((p) => !p.isAI && !p.isDead);
    const liveAIPlayers = this.players.filter((p) => p.isAI && !p.isDead);
    if (liveHumanPlayers.length === 0) {
      this.changeState(4 /* GAME_OVER_LOSE */);
    } else if (liveAIPlayers.length === 0 && this.humanPlayersCount > 0) {
      this.changeState(3 /* GAME_OVER_WIN */);
    }
  }
  /**
   * Renders all game elements based on the current game state.
   */
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 1 /* INSTRUCTIONS */:
        this.drawInstructionsScreen();
        break;
      case 2 /* PLAYING */:
        this.drawGamePlaying();
        break;
      case 3 /* GAME_OVER_WIN */:
        this.drawGameOverScreen(true);
        break;
      case 4 /* GAME_OVER_LOSE */:
        this.drawGameOverScreen(false);
        break;
    }
  }
  /**
   * Draws the title screen.
   */
  drawTitleScreen() {
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.font = "48px Arial";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.text.titleScreen[0], this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px Arial";
    this.ctx.fillText("Press any key to start", this.canvas.width / 2, this.canvas.height / 2 + 50);
    this.ctx.font = "16px Arial";
    this.ctx.fillText("A Crazy Bomber Fan Game", this.canvas.width / 2, this.canvas.height - 30);
  }
  /**
   * Draws the game instructions screen.
   */
  drawInstructionsScreen() {
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.font = "36px Arial";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "center";
    this.ctx.fillText("How to Play", this.canvas.width / 2, 80);
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "left";
    let yOffset = 150;
    this.config.text.instructionsScreen.forEach((line) => {
      this.ctx.fillText(line, this.canvas.width / 4, yOffset);
      yOffset += 30;
    });
    this.ctx.textAlign = "center";
    this.ctx.fillText("Press any key to continue...", this.canvas.width / 2, this.canvas.height - 80);
  }
  /**
   * Draws the main game playing screen, including map, players, bombs, explosions, and UI.
   */
  drawGamePlaying() {
    const tileSize = this.config.gameSettings.tileSize;
    for (let r = 0; r < this.map.length; r++) {
      for (let c = 0; c < this.map[r].length; c++) {
        const tile = this.map[r][c];
        const img = this.images.get(tile.imageName);
        if (img) {
          this.ctx.drawImage(img, c * tileSize, r * tileSize, tileSize, tileSize);
        } else {
          switch (tile.type) {
            case 0 /* EMPTY */:
              this.ctx.fillStyle = "#006400";
              break;
            // Dark Green
            case 1 /* SOLID */:
              this.ctx.fillStyle = "#696969";
              break;
            // Dim Gray
            case 2 /* BREAKABLE */:
              this.ctx.fillStyle = "#8B4513";
              break;
          }
          this.ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
        }
      }
    }
    this.bombs.forEach((bomb) => bomb.draw(this.ctx, this.images, tileSize));
    this.players.forEach((player) => player.draw(this.ctx, this.images, tileSize));
    this.explosions.forEach((explosion) => explosion.draw(this.ctx, this.images, tileSize));
    this.ctx.fillStyle = "white";
    this.ctx.font = "16px Arial";
    let uiY = this.canvas.height - 20;
    let uiX = 10;
    this.players.filter((p) => !p.isAI).forEach((player) => {
      this.ctx.fillText(`P${player.id} Lives: ${player.lives} Bombs: ${player.currentBombs}/${player.maxBombs} Range: ${player.bombRange}`, uiX, uiY);
      uiX += 250;
    });
    const buttonSize = 30;
    const padding = 10;
    const btnX = this.canvas.width - buttonSize - padding;
    const btnY = padding;
    const soundImgName = this.soundManager.soundOn ? "icon_sound_on" : "icon_sound_off";
    const soundImg = this.images.get(soundImgName);
    if (soundImg) {
      this.ctx.drawImage(soundImg, btnX, btnY, buttonSize, buttonSize);
    } else {
      this.ctx.fillStyle = this.soundManager.soundOn ? "green" : "red";
      this.ctx.fillRect(btnX, btnY, buttonSize, buttonSize);
      this.ctx.fillStyle = "white";
      this.ctx.font = "10px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText(this.soundManager.soundOn ? "ON" : "OFF", btnX + buttonSize / 2, btnY + buttonSize / 2 + 4);
    }
  }
  /**
   * Draws the game over screen (win or lose).
   * @param win True if the player won, false if lost.
   */
  drawGameOverScreen(win) {
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.font = "48px Arial";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "center";
    const message = win ? this.config.text.gameOverWin[0] : this.config.text.gameOverLose[0];
    this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px Arial";
    this.ctx.fillText("Press Enter to restart", this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  // --- Map Generation & Player Spawning ---
  /**
   * Generates a new game map based on configuration.
   * @returns The generated 2D Tile array.
   */
  generateMap() {
    const { mapWidth, mapHeight } = this.config.mapSettings;
    const { breakableBlockDensity } = this.config.gameSettings;
    const map = [];
    for (let r = 0; r < mapHeight; r++) {
      map[r] = [];
      for (let c = 0; c < mapWidth; c++) {
        if (r === 0 || r === mapHeight - 1 || c === 0 || c === mapWidth - 1) {
          map[r][c] = new Tile(1 /* SOLID */, "solid_block");
        } else if (r % 2 === 0 && c % 2 === 0) {
          map[r][c] = new Tile(1 /* SOLID */, "solid_block");
        } else {
          if (Math.random() < breakableBlockDensity) {
            map[r][c] = new Tile(2 /* BREAKABLE */, "breakable_block");
          } else {
            map[r][c] = new Tile(0 /* EMPTY */, "empty_tile");
          }
        }
      }
    }
    return map;
  }
  /**
   * Spawns players (human and AI) at designated starting points and clears surrounding tiles.
   */
  spawnPlayers() {
    this.players = [];
    this.humanPlayersCount = 0;
    this.aiPlayersCount = 0;
    const { tileSize, playerSpeed, aiCount } = this.config.gameSettings;
    const mapHeight = this.map.length;
    const mapWidth = this.map[0].length;
    const spawnPoints = [
      { row: 1, col: 1 },
      { row: mapHeight - 2, col: mapWidth - 2 },
      { row: 1, col: mapWidth - 2 },
      { row: mapHeight - 2, col: 1 }
    ];
    spawnPoints.forEach((pos) => {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = pos.row + dr;
          const c = pos.col + dc;
          if (r >= 0 && r < mapHeight && c >= 0 && c < mapWidth) {
            this.map[r][c] = new Tile(0 /* EMPTY */, "empty_tile");
          }
        }
      }
    });
    const player1Spawn = spawnPoints.shift();
    this.player1 = new Player(
      1,
      player1Spawn.col * tileSize,
      player1Spawn.row * tileSize,
      tileSize,
      tileSize,
      "player1",
      playerSpeed,
      tileSize,
      this.config,
      false
    );
    this.players.push(this.player1);
    this.humanPlayersCount++;
    for (let i = 0; i < aiCount; i++) {
      if (spawnPoints.length === 0) {
        console.warn("Not enough spawn points for all AI players.");
        break;
      }
      const aiSpawn = spawnPoints.shift();
      this.players.push(new Player(
        i + 2,
        // Unique ID for AI players
        aiSpawn.col * tileSize,
        aiSpawn.row * tileSize,
        tileSize,
        tileSize,
        `player${i + 2}`,
        // e.g., 'player2', 'player3' for AI images
        playerSpeed,
        tileSize,
        this.config,
        true
      ));
      this.aiPlayersCount++;
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const game2 = new Game("gameCanvas");
  game2.init("data.json");
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gZ2FtZS50c1xuLy8gVGhpcyBmaWxlIGNvbnRhaW5zIHRoZSBjb21wbGV0ZSBUeXBlU2NyaXB0IGNvZGUgZm9yIHRoZSBDcmF6eSBCb21iZXIgZ2FtZS5cbi8vIEl0IGlzIGRlc2lnbmVkIHRvIHJ1biBpbiBhIHdlYiBicm93c2VyLCBpbnRlcmFjdGluZyB3aXRoIGFuIEhUTUwgY2FudmFzIGVsZW1lbnQuXG5cbi8vIC0tLSBIZWxwZXIgSW50ZXJmYWNlcyBhbmQgRW51bXMgLS0tXG5cbi8qKlxuICogRGVmaW5lcyB0aGUgc3RydWN0dXJlIG9mIHRoZSBnYW1lJ3MgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb24uXG4gKi9cbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcbiAgICBnYW1lU2V0dGluZ3M6IHtcbiAgICAgICAgY2FudmFzV2lkdGg6IG51bWJlcjtcbiAgICAgICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XG4gICAgICAgIHRpbGVTaXplOiBudW1iZXI7XG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7IC8vIHBpeGVscyBwZXIgc2Vjb25kXG4gICAgICAgIGJvbWJGdXNlVGltZTogbnVtYmVyOyAvLyBzZWNvbmRzIHVudGlsIGJvbWIgZXhwbG9kZXNcbiAgICAgICAgZXhwbG9zaW9uRHVyYXRpb246IG51bWJlcjsgLy8gc2Vjb25kcyBleHBsb3Npb25zIHJlbWFpbiBhY3RpdmVcbiAgICAgICAgaW5pdGlhbEJvbWJSYW5nZTogbnVtYmVyOyAvLyB0aWxlc1xuICAgICAgICBpbml0aWFsTWF4Qm9tYnM6IG51bWJlcjtcbiAgICAgICAgaW5pdGlhbExpdmVzOiBudW1iZXI7XG4gICAgICAgIGFpQ291bnQ6IG51bWJlcjtcbiAgICAgICAgYnJlYWthYmxlQmxvY2tEZW5zaXR5OiBudW1iZXI7IC8vIDAgdG8gMSwgZGVuc2l0eSBvZiBicmVha2FibGUgYmxvY2tzIG9uIG1hcFxuICAgICAgICBwb3dlclVwRHJvcENoYW5jZTogbnVtYmVyOyAvLyAwIHRvIDEsIGNoYW5jZSBmb3IgcG93ZXItdXAgdG8gZHJvcCBmcm9tIGJyb2tlbiBibG9ja1xuICAgIH07XG4gICAgbWFwU2V0dGluZ3M6IHtcbiAgICAgICAgbWFwV2lkdGg6IG51bWJlcjsgLy8gaW4gdGlsZXNcbiAgICAgICAgbWFwSGVpZ2h0OiBudW1iZXI7IC8vIGluIHRpbGVzXG4gICAgfTtcbiAgICBhc3NldHM6IHtcbiAgICAgICAgaW1hZ2VzOiBBc3NldEltYWdlW107XG4gICAgICAgIHNvdW5kczogQXNzZXRTb3VuZFtdO1xuICAgIH07XG4gICAgdGV4dDoge1xuICAgICAgICB0aXRsZVNjcmVlbjogc3RyaW5nW107XG4gICAgICAgIGluc3RydWN0aW9uc1NjcmVlbjogc3RyaW5nW107XG4gICAgICAgIGdhbWVPdmVyV2luOiBzdHJpbmdbXTtcbiAgICAgICAgZ2FtZU92ZXJMb3NlOiBzdHJpbmdbXTtcbiAgICAgICAgc291bmRPbjogc3RyaW5nO1xuICAgICAgICBzb3VuZE9mZjogc3RyaW5nO1xuICAgIH07XG59XG5cbi8qKlxuICogRGVmaW5lcyB0aGUgc3RydWN0dXJlIGZvciBpbWFnZSBhc3NldHMuXG4gKi9cbmludGVyZmFjZSBBc3NldEltYWdlIHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgaW1nPzogSFRNTEltYWdlRWxlbWVudDsgLy8gQWRkZWQgZHVyaW5nIGxvYWRpbmdcbn1cblxuLyoqXG4gKiBEZWZpbmVzIHRoZSBzdHJ1Y3R1cmUgZm9yIHNvdW5kIGFzc2V0cy5cbiAqL1xuaW50ZXJmYWNlIEFzc2V0U291bmQge1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBwYXRoOiBzdHJpbmc7XG4gICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xuICAgIHZvbHVtZTogbnVtYmVyO1xuICAgIGF1ZGlvPzogSFRNTEF1ZGlvRWxlbWVudDsgLy8gQWRkZWQgZHVyaW5nIGxvYWRpbmdcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIDJEIGNvb3JkaW5hdGVzLlxuICovXG5pbnRlcmZhY2UgQ29vcmRzIHtcbiAgICB4OiBudW1iZXI7XG4gICAgeTogbnVtYmVyO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgdGlsZSBncmlkIHBvc2l0aW9uIChyb3csIGNvbHVtbikuXG4gKi9cbmludGVyZmFjZSBUaWxlUG9zaXRpb24ge1xuICAgIHJvdzogbnVtYmVyO1xuICAgIGNvbDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEVudW0gZm9yIG1hbmFnaW5nIGRpZmZlcmVudCBnYW1lIHN0YXRlcy5cbiAqL1xuZW51bSBHYW1lU3RhdGUge1xuICAgIFRJVExFLFxuICAgIElOU1RSVUNUSU9OUyxcbiAgICBQTEFZSU5HLFxuICAgIEdBTUVfT1ZFUl9XSU4sXG4gICAgR0FNRV9PVkVSX0xPU0Vcbn1cblxuLyoqXG4gKiBFbnVtIGZvciBkaWZmZXJlbnQgdHlwZXMgb2YgbWFwIHRpbGVzLlxuICovXG5lbnVtIFRpbGVUeXBlIHtcbiAgICBFTVBUWSxcbiAgICBTT0xJRCxcbiAgICBCUkVBS0FCTEVcbn1cblxuLyoqXG4gKiBFbnVtIGZvciBkaWZmZXJlbnQgdHlwZXMgb2YgcG93ZXItdXBzLlxuICovXG5lbnVtIFBvd2VyVXBUeXBlIHtcbiAgICBCT01CX1VQLFxuICAgIFJBTkdFX1VQLFxuICAgIFNQRUVEX1VQXG59XG5cbi8vIC0tLSBBc3NldCBMb2FkZXIgQ2xhc3MgLS0tXG5cbi8qKlxuICogSGFuZGxlcyBsb2FkaW5nIG9mIGFsbCBpbWFnZSBhbmQgc291bmQgYXNzZXRzIGRlZmluZWQgaW4gdGhlIGdhbWUgY29uZmlnLlxuICovXG5jbGFzcyBBc3NldExvYWRlciB7XG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzID0gMDtcbiAgICBwcml2YXRlIGxvYWRlZEFzc2V0cyA9IDA7XG4gICAgcHJpdmF0ZSBjb25maWc6IEdhbWVDb25maWc7XG4gICAgcHJpdmF0ZSBvblByb2dyZXNzOiAoKHByb2dyZXNzOiBudW1iZXIpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgICBjb25zdHJ1Y3Rvcihjb25maWc6IEdhbWVDb25maWcpIHtcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgICAgIHRoaXMudG90YWxBc3NldHMgPSBjb25maWcuYXNzZXRzLmltYWdlcy5sZW5ndGggKyBjb25maWcuYXNzZXRzLnNvdW5kcy5sZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTG9hZHMgYWxsIGFzc2V0cy5cbiAgICAgKiBAcGFyYW0gb25Qcm9ncmVzcyBDYWxsYmFjayBmdW5jdGlvbiB0byByZXBvcnQgbG9hZGluZyBwcm9ncmVzcyAoMCB0byAxKS5cbiAgICAgKiBAcmV0dXJucyBBIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIG1hcHMgb2YgbG9hZGVkIGltYWdlcyBhbmQgc291bmRzLlxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBsb2FkKG9uUHJvZ3Jlc3M/OiAocHJvZ3Jlc3M6IG51bWJlcikgPT4gdm9pZCk6IFByb21pc2U8eyBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+LCBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+IH0+IHtcbiAgICAgICAgdGhpcy5vblByb2dyZXNzID0gb25Qcm9ncmVzcyB8fCBudWxsO1xuICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cyA9IDA7XG5cbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGltZ0RhdGEgPT4gdGhpcy5sb2FkSW1hZ2UoaW1nRGF0YSkpO1xuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc291bmREYXRhID0+IHRoaXMubG9hZFNvdW5kKHNvdW5kRGF0YSkpO1xuXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGltYWdlczogdGhpcy5pbWFnZXMsXG4gICAgICAgICAgICBzb3VuZHM6IHRoaXMuc291bmRzXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UoaW1nRGF0YTogQXNzZXRJbWFnZSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XG4gICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChpbWdEYXRhLm5hbWUsIGltZyk7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcbiAgICAgICAgICAgICAgICB0aGlzLnJlcG9ydFByb2dyZXNzKCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZ0RhdGEucGF0aH1gKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrOyAvLyBTdGlsbCBpbmNyZW1lbnQgdG8gbm90IGJsb2NrIGxvYWRpbmdcbiAgICAgICAgICAgICAgICB0aGlzLnJlcG9ydFByb2dyZXNzKCk7XG4gICAgICAgICAgICAgICAgLy8gV2UgcmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIGFsbG93IHRoZSBnYW1lIHRvIHN0YXJ0IHdpdGggbWlzc2luZyBhc3NldHMsXG4gICAgICAgICAgICAgICAgLy8gdXNpbmcgZmFsbGJhY2sgZHJhd2luZy5cbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaW1nLnNyYyA9IGltZ0RhdGEucGF0aDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoc291bmREYXRhOiBBc3NldFNvdW5kKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmREYXRhLnBhdGgpO1xuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmREYXRhLnZvbHVtZTtcbiAgICAgICAgICAgIGF1ZGlvLmxvYWQoKTsgLy8gUHJlbG9hZCBhdWRpbyBtZXRhZGF0YVxuICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kRGF0YS5uYW1lLCBhdWRpbyk7XG4gICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrO1xuICAgICAgICAgICAgdGhpcy5yZXBvcnRQcm9ncmVzcygpO1xuICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGltbWVkaWF0ZWx5IGFzIGZ1bGwgYnVmZmVyaW5nIG1pZ2h0IGJlIHNsb3cgb3IgYmxvY2tlZFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlcG9ydFByb2dyZXNzKCkge1xuICAgICAgICBpZiAodGhpcy5vblByb2dyZXNzKSB7XG4gICAgICAgICAgICB0aGlzLm9uUHJvZ3Jlc3ModGhpcy5sb2FkZWRBc3NldHMgLyB0aGlzLnRvdGFsQXNzZXRzKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gLS0tIFNvdW5kIE1hbmFnZXIgQ2xhc3MgLS0tXG5cbi8qKlxuICogTWFuYWdlcyBwbGF5YmFjayBvZiBzb3VuZCBlZmZlY3RzIGFuZCBiYWNrZ3JvdW5kIG11c2ljLCBpbmNsdWRpbmcgYSBnbG9iYWwgdG9nZ2xlLlxuICovXG5jbGFzcyBTb3VuZE1hbmFnZXIge1xuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PjtcbiAgICBwcml2YXRlIGJhY2tncm91bmRNdXNpYzogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgIHB1YmxpYyBzb3VuZE9uOiBib29sZWFuID0gdHJ1ZTsgLy8gR2xvYmFsIHNvdW5kIHN0YXRlXG5cbiAgICBjb25zdHJ1Y3Rvcihzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+KSB7XG4gICAgICAgIHRoaXMuc291bmRzID0gc291bmRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGJhY2tncm91bmQgbXVzaWMgdG8gcGxheS5cbiAgICAgKiBAcGFyYW0gbmFtZSBUaGUgbmFtZSBvZiB0aGUgc291bmQgYXNzZXQgZm9yIEJHTS5cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0QmFja2dyb3VuZE11c2ljKG5hbWU6IHN0cmluZykge1xuICAgICAgICBpZiAodGhpcy5iYWNrZ3JvdW5kTXVzaWMpIHtcbiAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZE11c2ljLnBhdXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYmdtID0gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xuICAgICAgICBpZiAoYmdtKSB7XG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpYyA9IGJnbTtcbiAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZE11c2ljLmxvb3AgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWMudm9sdW1lID0gYmdtLnZvbHVtZTsgLy8gVXNlIHRoZSBpbml0aWFsIHZvbHVtZSBmcm9tIGNvbmZpZ1xuICAgICAgICAgICAgaWYgKHRoaXMuc291bmRPbikge1xuICAgICAgICAgICAgICAgICB0aGlzLnBsYXlCR00oKTsgLy8gVHJ5IHRvIHBsYXksIG1pZ2h0IG5lZWQgdXNlciBpbnRlcmFjdGlvblxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGxheXMgYSBzb3VuZCBlZmZlY3QuXG4gICAgICogQHBhcmFtIG5hbWUgVGhlIG5hbWUgb2YgdGhlIHNvdW5kIGFzc2V0IHRvIHBsYXkuXG4gICAgICogQHBhcmFtIGxvb3AgV2hldGhlciB0aGUgc291bmQgc2hvdWxkIGxvb3AuXG4gICAgICogQHBhcmFtIHZvbHVtZSBPcHRpb25hbCB2b2x1bWUgb3ZlcnJpZGUuXG4gICAgICogQHJldHVybnMgVGhlIGNsb25lZCBBdWRpbyBlbGVtZW50IGlmIHBsYXllZCwgbnVsbCBvdGhlcndpc2UuXG4gICAgICovXG4gICAgcHVibGljIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSwgdm9sdW1lPzogbnVtYmVyKTogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwge1xuICAgICAgICBpZiAoIXRoaXMuc291bmRPbikgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xuICAgICAgICBpZiAoYXVkaW8pIHtcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDsgLy8gQ2xvbmUgdG8gYWxsb3cgc2ltdWx0YW5lb3VzIHBsYXliYWNrXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSB2b2x1bWUgIT09IHVuZGVmaW5lZCA/IHZvbHVtZSA6IGF1ZGlvLnZvbHVtZTtcbiAgICAgICAgICAgIGNsb25lLmxvb3AgPSBsb29wO1xuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4ge1xuICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUud2FybihgU291bmQgcGxheWJhY2sgYmxvY2tlZCBmb3IgJHtuYW1lfTogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICAgICAgICAgICAgLy8gT2Z0ZW4gaGFwcGVucyBpZiBub3QgdHJpZ2dlcmVkIGJ5IGRpcmVjdCB1c2VyIGludGVyYWN0aW9uXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBjbG9uZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQbGF5cyB0aGUgY3VycmVudGx5IHNldCBiYWNrZ3JvdW5kIG11c2ljLlxuICAgICAqL1xuICAgIHB1YmxpYyBwbGF5QkdNKCkge1xuICAgICAgICBpZiAoIXRoaXMuc291bmRPbiB8fCAhdGhpcy5iYWNrZ3JvdW5kTXVzaWMpIHJldHVybjtcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWMucGxheSgpLmNhdGNoKGUgPT4ge1xuICAgICAgICAgICAgLy8gY29uc29sZS53YXJuKGBCR00gcGxheWJhY2sgYmxvY2tlZDogJHtlLm1lc3NhZ2V9LiBXaWxsIHRyeSBhZ2FpbiBvbiB1c2VyIGludGVyYWN0aW9uLmApO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdG9wcyB0aGUgYmFja2dyb3VuZCBtdXNpYy5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RvcEJHTSgpIHtcbiAgICAgICAgaWYgKHRoaXMuYmFja2dyb3VuZE11c2ljKSB7XG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpYy5wYXVzZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVG9nZ2xlcyB0aGUgZ2xvYmFsIHNvdW5kIHN0YXRlIChvbi9vZmYpLlxuICAgICAqL1xuICAgIHB1YmxpYyB0b2dnbGVTb3VuZCgpIHtcbiAgICAgICAgdGhpcy5zb3VuZE9uID0gIXRoaXMuc291bmRPbjtcbiAgICAgICAgaWYgKHRoaXMuc291bmRPbikge1xuICAgICAgICAgICAgdGhpcy5wbGF5QkdNKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnN0b3BCR00oKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gLS0tIEdhbWUgT2JqZWN0IEJhc2UgQ2xhc3NlcyAtLS1cblxuLyoqXG4gKiBBYnN0cmFjdCBiYXNlIGNsYXNzIGZvciBhbGwgb2JqZWN0cyByZW5kZXJlZCBhbmQgdXBkYXRlZCBpbiB0aGUgZ2FtZS5cbiAqL1xuYWJzdHJhY3QgY2xhc3MgR2FtZU9iamVjdCB7XG4gICAgeDogbnVtYmVyO1xuICAgIHk6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIGltYWdlTmFtZTogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnggPSB4O1xuICAgICAgICB0aGlzLnkgPSB5O1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICB0aGlzLmltYWdlTmFtZSA9IGltYWdlTmFtZTtcbiAgICB9XG5cbiAgICBhYnN0cmFjdCB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkO1xuXG4gICAgLyoqXG4gICAgICogRHJhd3MgdGhlIGdhbWUgb2JqZWN0IG9uIHRoZSBjYW52YXMuXG4gICAgICogQHBhcmFtIGN0eCBUaGUgMkQgcmVuZGVyaW5nIGNvbnRleHQuXG4gICAgICogQHBhcmFtIGltYWdlcyBNYXAgb2YgbG9hZGVkIGltYWdlcy5cbiAgICAgKiBAcGFyYW0gdGlsZVNpemUgU2l6ZSBvZiBhIHNpbmdsZSB0aWxlIGZvciBjb25zaXN0ZW50IHNjYWxpbmcuXG4gICAgICovXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiwgdGlsZVNpemU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBpbWcgPSBpbWFnZXMuZ2V0KHRoaXMuaW1hZ2VOYW1lKTtcbiAgICAgICAgaWYgKGltZykge1xuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBGYWxsYmFjazogZHJhdyBhIGNvbG9yZWQgcmVjdGFuZ2xlIGlmIGltYWdlIGlzIG1pc3NpbmdcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAnZnVjaHNpYSc7IC8vIEJyaWdodCBjb2xvciBmb3IgdmlzaWJpbGl0eVxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSB0aWxlIHBvc2l0aW9uIG9mIHRoZSBjZW50ZXIgb2YgdGhlIGdhbWUgb2JqZWN0LlxuICAgICAqIEBwYXJhbSB0aWxlU2l6ZSBUaGUgc2l6ZSBvZiBhIHNpbmdsZSB0aWxlLlxuICAgICAqIEByZXR1cm5zIFRoZSB0aWxlIHBvc2l0aW9uLlxuICAgICAqL1xuICAgIGdldFRpbGVQb3ModGlsZVNpemU6IG51bWJlcik6IFRpbGVQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3c6IE1hdGguZmxvb3IoKHRoaXMueSArIHRoaXMuaGVpZ2h0IC8gMikgLyB0aWxlU2l6ZSksXG4gICAgICAgICAgICBjb2w6IE1hdGguZmxvb3IoKHRoaXMueCArIHRoaXMud2lkdGggLyAyKSAvIHRpbGVTaXplKVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyBmb3IgY29sbGlzaW9uIHdpdGggYW5vdGhlciBHYW1lT2JqZWN0IHVzaW5nIEFBQkIgKEF4aXMtQWxpZ25lZCBCb3VuZGluZyBCb3gpLlxuICAgICAqIEBwYXJhbSBvdGhlciBUaGUgb3RoZXIgR2FtZU9iamVjdCB0byBjaGVjayBhZ2FpbnN0LlxuICAgICAqIEByZXR1cm5zIFRydWUgaWYgY29sbGlkaW5nLCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICovXG4gICAgY29sbGlkZXNXaXRoKG90aGVyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnggPCBvdGhlci54ICsgb3RoZXIud2lkdGggJiZcbiAgICAgICAgICAgICAgIHRoaXMueCArIHRoaXMud2lkdGggPiBvdGhlci54ICYmXG4gICAgICAgICAgICAgICB0aGlzLnkgPCBvdGhlci55ICsgb3RoZXIuaGVpZ2h0ICYmXG4gICAgICAgICAgICAgICB0aGlzLnkgKyB0aGlzLmhlaWdodCA+IG90aGVyLnk7XG4gICAgfVxufVxuXG4vKipcbiAqIEJhc2UgY2xhc3MgZm9yIG1vdmFibGUgZW50aXRpZXMgbGlrZSBwbGF5ZXJzIGFuZCBBSS5cbiAqL1xuY2xhc3MgRW50aXR5IGV4dGVuZHMgR2FtZU9iamVjdCB7XG4gICAgZHg6IG51bWJlciA9IDA7IC8vIERpcmVjdGlvbiB4ICgtMSwgMCwgMSlcbiAgICBkeTogbnVtYmVyID0gMDsgLy8gRGlyZWN0aW9uIHkgKC0xLCAwLCAxKVxuICAgIHNwZWVkOiBudW1iZXI7IC8vIE1vdmVtZW50IHNwZWVkIGluIHBpeGVscyBwZXIgc2Vjb25kXG4gICAgaXNNb3Zpbmc6IGJvb2xlYW4gPSBmYWxzZTsgLy8gVHJ1ZSBpZiBjdXJyZW50bHkgYW5pbWF0aW5nIG1vdmVtZW50IHRvIGEgbmV3IHRpbGVcbiAgICBjdXJyZW50VGlsZTogVGlsZVBvc2l0aW9uOyAvLyBUaGUgdGlsZSB0aGUgZW50aXR5IGlzIGN1cnJlbnRseSBjZW50ZXJlZCBvblxuICAgIHRhcmdldFRpbGU6IFRpbGVQb3NpdGlvbjsgLy8gVGhlIHRpbGUgdGhlIGVudGl0eSBpcyBtb3ZpbmcgdG93YXJkc1xuXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgc3BlZWQ6IG51bWJlciwgdGlsZVNpemU6IG51bWJlcikge1xuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xuICAgICAgICB0aGlzLnNwZWVkID0gc3BlZWQ7XG4gICAgICAgIHRoaXMuY3VycmVudFRpbGUgPSB0aGlzLmdldFRpbGVQb3ModGlsZVNpemUpO1xuICAgICAgICB0aGlzLnRhcmdldFRpbGUgPSB7IC4uLnRoaXMuY3VycmVudFRpbGUgfTsgLy8gSW5pdGlhbGx5LCB0YXJnZXQgaXMgY3VycmVudFxuICAgIH1cblxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xuICAgICAgICBjb25zdCB0aWxlU2l6ZSA9IGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZTtcblxuICAgICAgICBpZiAodGhpcy5pc01vdmluZykge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0WCA9IHRoaXMudGFyZ2V0VGlsZS5jb2wgKiB0aWxlU2l6ZTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFkgPSB0aGlzLnRhcmdldFRpbGUucm93ICogdGlsZVNpemU7XG5cbiAgICAgICAgICAgIGxldCByZWFjaGVkWCA9IGZhbHNlO1xuICAgICAgICAgICAgbGV0IHJlYWNoZWRZID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vIE1vdmUgaG9yaXpvbnRhbGx5XG4gICAgICAgICAgICBpZiAodGhpcy5keCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1vdmVBbW91bnQgPSB0aGlzLmR4ICogdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcbiAgICAgICAgICAgICAgICB0aGlzLnggKz0gbW92ZUFtb3VudDtcbiAgICAgICAgICAgICAgICBpZiAoKHRoaXMuZHggPiAwICYmIHRoaXMueCA+PSB0YXJnZXRYKSB8fCAodGhpcy5keCA8IDAgJiYgdGhpcy54IDw9IHRhcmdldFgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMueCA9IHRhcmdldFg7IC8vIFNuYXAgdG8gdGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgIHJlYWNoZWRYID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlYWNoZWRYID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTW92ZSB2ZXJ0aWNhbGx5XG4gICAgICAgICAgICBpZiAodGhpcy5keSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1vdmVBbW91bnQgPSB0aGlzLmR5ICogdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcbiAgICAgICAgICAgICAgICB0aGlzLnkgKz0gbW92ZUFtb3VudDtcbiAgICAgICAgICAgICAgICBpZiAoKHRoaXMuZHkgPiAwICYmIHRoaXMueSA+PSB0YXJnZXRZKSB8fCAodGhpcy5keSA8IDAgJiYgdGhpcy55IDw9IHRhcmdldFkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMueSA9IHRhcmdldFk7IC8vIFNuYXAgdG8gdGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgIHJlYWNoZWRZID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlYWNoZWRZID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSWYgdGFyZ2V0IHJlYWNoZWQgKG9yIG5vIG1vdmVtZW50IGluIHRoYXQgYXhpcyB3YXMgaW50ZW5kZWQpXG4gICAgICAgICAgICBpZiAocmVhY2hlZFggJiYgcmVhY2hlZFkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmlzTW92aW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGhpcy5keCA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5keSA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50VGlsZSA9IHsgLi4udGhpcy50YXJnZXRUaWxlIH07IC8vIFVwZGF0ZSBjdXJyZW50IHRpbGUgdG8gdGFyZ2V0XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBdHRlbXB0cyB0byBtb3ZlIHRoZSBlbnRpdHkgYnkgYSBnaXZlbiBkZWx0YSBpbiB0aWxlIGNvb3JkaW5hdGVzLlxuICAgICAqIEBwYXJhbSBkZWx0YUNvbCBDaGFuZ2UgaW4gY29sdW1uLlxuICAgICAqIEBwYXJhbSBkZWx0YVJvdyBDaGFuZ2UgaW4gcm93LlxuICAgICAqIEBwYXJhbSBtYXAgVGhlIGdhbWUgbWFwLlxuICAgICAqIEBwYXJhbSB0aWxlU2l6ZSBUaGUgc2l6ZSBvZiBhIHNpbmdsZSB0aWxlLlxuICAgICAqIEByZXR1cm5zIFRydWUgaWYgbW92ZW1lbnQgd2FzIGluaXRpYXRlZCwgZmFsc2Ugb3RoZXJ3aXNlIChlLmcuLCBibG9ja2VkKS5cbiAgICAgKi9cbiAgICBhdHRlbXB0TW92ZShkZWx0YUNvbDogbnVtYmVyLCBkZWx0YVJvdzogbnVtYmVyLCBtYXA6IFRpbGVbXVtdLCB0aWxlU2l6ZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0aGlzLmlzTW92aW5nKSByZXR1cm4gZmFsc2U7IC8vIENhbm5vdCBtb3ZlIGlmIGFscmVhZHkgbW92aW5nXG5cbiAgICAgICAgY29uc3QgbmV4dENvbCA9IHRoaXMuY3VycmVudFRpbGUuY29sICsgZGVsdGFDb2w7XG4gICAgICAgIGNvbnN0IG5leHRSb3cgPSB0aGlzLmN1cnJlbnRUaWxlLnJvdyArIGRlbHRhUm93O1xuXG4gICAgICAgIC8vIENoZWNrIG1hcCBib3VuZGFyaWVzXG4gICAgICAgIGlmIChuZXh0Q29sIDwgMCB8fCBuZXh0Q29sID49IG1hcFswXS5sZW5ndGggfHwgbmV4dFJvdyA8IDAgfHwgbmV4dFJvdyA+PSBtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBuZXh0VGlsZSA9IG1hcFtuZXh0Um93XVtuZXh0Q29sXTtcbiAgICAgICAgaWYgKG5leHRUaWxlLnR5cGUgPT09IFRpbGVUeXBlLlNPTElEIHx8IG5leHRUaWxlLnR5cGUgPT09IFRpbGVUeXBlLkJSRUFLQUJMRSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBDYW5ub3QgbW92ZSBpbnRvIHNvbGlkIG9yIGJyZWFrYWJsZSBibG9ja3NcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMudGFyZ2V0VGlsZSA9IHsgY29sOiBuZXh0Q29sLCByb3c6IG5leHRSb3cgfTtcbiAgICAgICAgdGhpcy5keCA9IGRlbHRhQ29sO1xuICAgICAgICB0aGlzLmR5ID0gZGVsdGFSb3c7XG4gICAgICAgIHRoaXMuaXNNb3ZpbmcgPSB0cnVlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHBsYXllciBjaGFyYWN0ZXIsIGVpdGhlciBodW1hbi1jb250cm9sbGVkIG9yIEFJLWNvbnRyb2xsZWQuXG4gKi9cbmNsYXNzIFBsYXllciBleHRlbmRzIEVudGl0eSB7XG4gICAgaWQ6IG51bWJlcjtcbiAgICBtYXhCb21iczogbnVtYmVyO1xuICAgIGN1cnJlbnRCb21iczogbnVtYmVyOyAvLyBCb21icyBjdXJyZW50bHkgYWN0aXZlL29uIG1hcFxuICAgIGJvbWJSYW5nZTogbnVtYmVyO1xuICAgIGxpdmVzOiBudW1iZXI7XG4gICAgaXNBSTogYm9vbGVhbjtcbiAgICBpbW11bmVUaW1lcjogbnVtYmVyID0gMDsgLy8gSW52aW5jaWJpbGl0eSBmcmFtZXMgYWZ0ZXIgYmVpbmcgaGl0XG4gICAgaXNEZWFkOiBib29sZWFuID0gZmFsc2U7XG5cbiAgICAvLyBBSSBzcGVjaWZpYyBwcm9wZXJ0aWVzXG4gICAgcHJpdmF0ZSBhaVBhdGg6IFRpbGVQb3NpdGlvbltdID0gW107IC8vIEN1cnJlbnQgcGF0aCBmb3IgQUkgbmF2aWdhdGlvblxuICAgIHByaXZhdGUgYWlTdGF0ZTogJ0lETEUnIHwgJ0NIQVNFJyB8ICdFVkFERScgfCAnQk9NQl9QTEFDRU1FTlQnID0gJ0lETEUnO1xuICAgIHByaXZhdGUgYWlCb21iVGltZXI6IG51bWJlciA9IDA7IC8vIENvb2xkb3duIGZvciBBSSBib21iIHBsYWNlbWVudFxuICAgIHByaXZhdGUgdGFyZ2V0UGxheWVyOiBQbGF5ZXIgfCBudWxsID0gbnVsbDsgLy8gQUkncyBjdXJyZW50IHRhcmdldCAoaHVtYW4gcGxheWVyKVxuXG4gICAgY29uc3RydWN0b3IoaWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgc3BlZWQ6IG51bWJlciwgdGlsZVNpemU6IG51bWJlciwgY29uZmlnOiBHYW1lQ29uZmlnLCBpc0FJOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VOYW1lLCBzcGVlZCwgdGlsZVNpemUpO1xuICAgICAgICB0aGlzLmlkID0gaWQ7XG4gICAgICAgIHRoaXMubWF4Qm9tYnMgPSBjb25maWcuZ2FtZVNldHRpbmdzLmluaXRpYWxNYXhCb21icztcbiAgICAgICAgdGhpcy5jdXJyZW50Qm9tYnMgPSAwO1xuICAgICAgICB0aGlzLmJvbWJSYW5nZSA9IGNvbmZpZy5nYW1lU2V0dGluZ3MuaW5pdGlhbEJvbWJSYW5nZTtcbiAgICAgICAgdGhpcy5saXZlcyA9IGNvbmZpZy5nYW1lU2V0dGluZ3MuaW5pdGlhbExpdmVzO1xuICAgICAgICB0aGlzLmlzQUkgPSBpc0FJO1xuICAgIH1cblxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xuICAgICAgICBzdXBlci51cGRhdGUoZGVsdGFUaW1lLCBnYW1lKTtcblxuICAgICAgICBpZiAodGhpcy5pbW11bmVUaW1lciA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuaW1tdW5lVGltZXIgLT0gZGVsdGFUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuaXNBSSAmJiAhdGhpcy5pc0RlYWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlQUkoZGVsdGFUaW1lLCBnYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4sIHRpbGVTaXplOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuaXNEZWFkKSByZXR1cm47XG5cbiAgICAgICAgLy8gRmxhc2ggcGxheWVyIHdoZW4gaW1tdW5lXG4gICAgICAgIGlmICh0aGlzLmltbXVuZVRpbWVyID4gMCAmJiBNYXRoLmZsb29yKHRoaXMuaW1tdW5lVGltZXIgKiAxMCkgJSAyID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm47IC8vIFNraXAgZHJhd2luZyB0byBjcmVhdGUgYSBmbGFzaGluZyBlZmZlY3RcbiAgICAgICAgfVxuICAgICAgICBzdXBlci5kcmF3KGN0eCwgaW1hZ2VzLCB0aWxlU2l6ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gcGxhY2UgYSBib21iIGF0IHRoZSBwbGF5ZXIncyBjdXJyZW50IHRpbGUuXG4gICAgICogQHBhcmFtIGdhbWUgVGhlIG1haW4gZ2FtZSBpbnN0YW5jZS5cbiAgICAgKiBAcmV0dXJucyBUaGUgbmV3IEJvbWIgb2JqZWN0IGlmIHBsYWNlZCwgbnVsbCBvdGhlcndpc2UuXG4gICAgICovXG4gICAgcGxhY2VCb21iKGdhbWU6IEdhbWUpOiBCb21iIHwgbnVsbCB7XG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRCb21icyA8IHRoaXMubWF4Qm9tYnMgJiYgIXRoaXMuaXNNb3ZpbmcpIHsgLy8gT25seSBwbGFjZSBpZiBub3QgbW92aW5nXG4gICAgICAgICAgICBjb25zdCB0aWxlWCA9IHRoaXMuY3VycmVudFRpbGUuY29sICogZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLnRpbGVTaXplO1xuICAgICAgICAgICAgY29uc3QgdGlsZVkgPSB0aGlzLmN1cnJlbnRUaWxlLnJvdyAqIGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZTtcblxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhlcmUncyBhbHJlYWR5IGEgYm9tYiBhdCB0aGlzIGV4YWN0IHNwb3RcbiAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nQm9tYiA9IGdhbWUuYm9tYnMuZmluZChiID0+IGIuZ2V0VGlsZVBvcyhnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUpLmNvbCA9PT0gdGhpcy5jdXJyZW50VGlsZS5jb2wgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYi5nZXRUaWxlUG9zKGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZSkucm93ID09PSB0aGlzLmN1cnJlbnRUaWxlLnJvdyk7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmdCb21iKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY3VycmVudEJvbWJzKys7XG4gICAgICAgICAgICBnYW1lLnNvdW5kTWFuYWdlci5wbGF5U291bmQoJ2JvbWJfcGxhY2UnKTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgQm9tYihcbiAgICAgICAgICAgICAgICB0aWxlWCxcbiAgICAgICAgICAgICAgICB0aWxlWSxcbiAgICAgICAgICAgICAgICBnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUsXG4gICAgICAgICAgICAgICAgZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLnRpbGVTaXplLFxuICAgICAgICAgICAgICAgICdib21iJyxcbiAgICAgICAgICAgICAgICBnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MuYm9tYkZ1c2VUaW1lLFxuICAgICAgICAgICAgICAgIHRoaXMuYm9tYlJhbmdlLFxuICAgICAgICAgICAgICAgIHRoaXMuaWRcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGxheWVyIHRha2VzIGRhbWFnZSwgcmVkdWNpbmcgbGl2ZXMgYW5kIGdyYW50aW5nIHRlbXBvcmFyeSBpbnZpbmNpYmlsaXR5LlxuICAgICAqIEBwYXJhbSBnYW1lIFRoZSBtYWluIGdhbWUgaW5zdGFuY2UuXG4gICAgICovXG4gICAgdGFrZURhbWFnZShnYW1lOiBHYW1lKSB7XG4gICAgICAgIGlmICh0aGlzLmltbXVuZVRpbWVyIDw9IDApIHtcbiAgICAgICAgICAgIHRoaXMubGl2ZXMtLTtcbiAgICAgICAgICAgIGdhbWUuc291bmRNYW5hZ2VyLnBsYXlTb3VuZCgncGxheWVyX2hpdCcpO1xuICAgICAgICAgICAgaWYgKHRoaXMubGl2ZXMgPD0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuaXNEZWFkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBnYW1lLnNvdW5kTWFuYWdlci5wbGF5U291bmQoJ3BsYXllcl9kaWUnKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pbW11bmVUaW1lciA9IDI7IC8vIDIgc2Vjb25kcyBvZiBpbnZpbmNpYmlsaXR5XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBcHBsaWVzIGEgY29sbGVjdGVkIHBvd2VyLXVwIGVmZmVjdCB0byB0aGUgcGxheWVyLlxuICAgICAqIEBwYXJhbSB0eXBlIFRoZSB0eXBlIG9mIHBvd2VyLXVwIGNvbGxlY3RlZC5cbiAgICAgKiBAcGFyYW0gZ2FtZSBUaGUgbWFpbiBnYW1lIGluc3RhbmNlLlxuICAgICAqL1xuICAgIGFwcGx5UG93ZXJVcCh0eXBlOiBQb3dlclVwVHlwZSwgZ2FtZTogR2FtZSkge1xuICAgICAgICBnYW1lLnNvdW5kTWFuYWdlci5wbGF5U291bmQoJ3Bvd2VydXBfY29sbGVjdCcpO1xuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgUG93ZXJVcFR5cGUuQk9NQl9VUDpcbiAgICAgICAgICAgICAgICB0aGlzLm1heEJvbWJzKys7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFBvd2VyVXBUeXBlLlJBTkdFX1VQOlxuICAgICAgICAgICAgICAgIHRoaXMuYm9tYlJhbmdlKys7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFBvd2VyVXBUeXBlLlNQRUVEX1VQOlxuICAgICAgICAgICAgICAgIHRoaXMuc3BlZWQgKz0gNTA7IC8vIEluY3JlYXNlIHNwZWVkIGJ5IDUwIHBpeGVscy9zZWNcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLSBBSSBMb2dpYyAtLS1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgdGhlIEFJJ3MgYmVoYXZpb3IgYmFzZWQgb24gZ2FtZSBzdGF0ZS5cbiAgICAgKiBAcGFyYW0gZGVsdGFUaW1lIFRpbWUgZWxhcHNlZCBzaW5jZSBsYXN0IGZyYW1lLlxuICAgICAqIEBwYXJhbSBnYW1lIFRoZSBtYWluIGdhbWUgaW5zdGFuY2UuXG4gICAgICovXG4gICAgcHJpdmF0ZSB1cGRhdGVBSShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSkge1xuICAgICAgICBjb25zdCB7IHRpbGVTaXplIH0gPSBnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3M7XG4gICAgICAgIGNvbnN0IG1hcCA9IGdhbWUubWFwO1xuXG4gICAgICAgIC8vIEVuc3VyZSBBSSBoYXMgYSB0YXJnZXQgaHVtYW4gcGxheWVyXG4gICAgICAgIGlmICghdGhpcy50YXJnZXRQbGF5ZXIgfHwgdGhpcy50YXJnZXRQbGF5ZXIuaXNEZWFkKSB7XG4gICAgICAgICAgICBjb25zdCBsaXZlUGxheWVycyA9IGdhbWUucGxheWVycy5maWx0ZXIocCA9PiAhcC5pc0FJICYmICFwLmlzRGVhZCk7XG4gICAgICAgICAgICBpZiAobGl2ZVBsYXllcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMudGFyZ2V0UGxheWVyID0gbGl2ZVBsYXllcnNbMF07IC8vIFRhcmdldCB0aGUgZmlyc3QgaHVtYW4gcGxheWVyXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIE5vIGh1bWFuIHBsYXllcnMgbGVmdCwgQUkgbWlnaHQgd2FuZGVyIG9yIHN0b3AuXG4gICAgICAgICAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHksIGl0IHdpbGwganVzdCBub3QgaGF2ZSBhIHRhcmdldC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBteVRpbGUgPSB0aGlzLmN1cnJlbnRUaWxlO1xuICAgICAgICBjb25zdCBwbGF5ZXJUaWxlID0gdGhpcy50YXJnZXRQbGF5ZXIuY3VycmVudFRpbGU7XG5cbiAgICAgICAgLy8gVXBkYXRlIEFJIGJvbWIgY29vbGRvd25cbiAgICAgICAgaWYgKHRoaXMuYWlCb21iVGltZXIgPiAwKSB7XG4gICAgICAgICAgICB0aGlzLmFpQm9tYlRpbWVyIC09IGRlbHRhVGltZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSBBSSBzdGF0ZVxuICAgICAgICBjb25zdCBkYW5nZXJab25lID0gdGhpcy5pc1RpbGVJbkV4cGxvc2lvbkRhbmdlcihteVRpbGUsIGdhbWUuYm9tYnMsIGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncy5ib21iRnVzZVRpbWUsIHRpbGVTaXplKTtcbiAgICAgICAgY29uc3QgcGxheWVyQ2xvc2UgPSBNYXRoLmFicyhteVRpbGUuY29sIC0gcGxheWVyVGlsZS5jb2wpIDw9IDMgJiYgTWF0aC5hYnMobXlUaWxlLnJvdyAtIHBsYXllclRpbGUucm93KSA8PSAzO1xuICAgICAgICBjb25zdCBjYW5QbGFjZUJvbWIgPSB0aGlzLmN1cnJlbnRCb21icyA8IHRoaXMubWF4Qm9tYnMgJiYgdGhpcy5haUJvbWJUaW1lciA8PSAwO1xuXG4gICAgICAgIGlmIChkYW5nZXJab25lKSB7XG4gICAgICAgICAgICB0aGlzLmFpU3RhdGUgPSAnRVZBREUnO1xuICAgICAgICB9IGVsc2UgaWYgKHBsYXllckNsb3NlICYmIGNhblBsYWNlQm9tYiAmJiB0aGlzLmNhbkJvbWJQbGF5ZXIobXlUaWxlLCBwbGF5ZXJUaWxlLCBtYXAsIGdhbWUuYm9tYnMpKSB7XG4gICAgICAgICAgICB0aGlzLmFpU3RhdGUgPSAnQk9NQl9QTEFDRU1FTlQnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gRGVmYXVsdCBzdGF0ZTogY2hhc2UgcGxheWVyIG9yIGJyZWFrIGJsb2Nrc1xuICAgICAgICAgICAgdGhpcy5haVN0YXRlID0gJ0NIQVNFJztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEV4ZWN1dGUgYmVoYXZpb3IgYmFzZWQgb24gY3VycmVudCBzdGF0ZVxuICAgICAgICBzd2l0Y2ggKHRoaXMuYWlTdGF0ZSkge1xuICAgICAgICAgICAgY2FzZSAnRVZBREUnOlxuICAgICAgICAgICAgICAgIHRoaXMuZXZhZGVCb21icyhnYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0JPTUJfUExBQ0VNRU5UJzpcbiAgICAgICAgICAgICAgICB0aGlzLnBlcmZvcm1Cb21iUGxhY2VtZW50KGdhbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnQ0hBU0UnOlxuICAgICAgICAgICAgICAgIHRoaXMuY2hhc2VQbGF5ZXIoZ2FtZSwgcGxheWVyVGlsZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdJRExFJzogLy8gRmFsbGJhY2svZGVmYXVsdCBpZiBvdGhlciBzdGF0ZXMgYXJlIG5vdCBtZXRcbiAgICAgICAgICAgICAgICB0aGlzLmZpbmRBbmRCcmVha0Jsb2NrKGdhbWUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIGlmIGEgZ2l2ZW4gdGlsZSBpcyB3aXRoaW4gdGhlIGV4cGxvc2lvbiByYWRpdXMgb2YgYW55IGFjdGl2ZSBib21iLlxuICAgICAqIEBwYXJhbSB0aWxlIFRoZSB0aWxlIHRvIGNoZWNrLlxuICAgICAqIEBwYXJhbSBib21icyBBbGwgYWN0aXZlIGJvbWJzIGluIHRoZSBnYW1lLlxuICAgICAqIEBwYXJhbSBmdXNlVGltZSBUaGUgdG90YWwgZnVzZSB0aW1lIG9mIGEgYm9tYi5cbiAgICAgKiBAcGFyYW0gdGlsZVNpemUgVGhlIHNpemUgb2YgYSBzaW5nbGUgdGlsZS5cbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSB0aWxlIGlzIGluIGRhbmdlciwgZmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAqL1xuICAgIHByaXZhdGUgaXNUaWxlSW5FeHBsb3Npb25EYW5nZXIodGlsZTogVGlsZVBvc2l0aW9uLCBib21iczogQm9tYltdLCBmdXNlVGltZTogbnVtYmVyLCB0aWxlU2l6ZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGZvciAoY29uc3QgYm9tYiBvZiBib21icykge1xuICAgICAgICAgICAgLy8gQ29uc2lkZXIgZGFuZ2VyIGlmIGJvbWIgaXMgYWN0aXZlIGFuZCBpcyBhYm91dCB0byBleHBsb2RlXG4gICAgICAgICAgICBpZiAoYm9tYi50aW1lciA+IDAgJiYgYm9tYi50aW1lciA8PSBmdXNlVGltZSAqIDAuOSkgeyAvLyBQcm9hY3RpdmUgZGFuZ2VyIHpvbmVcbiAgICAgICAgICAgICAgICBjb25zdCBib21iVGlsZSA9IGJvbWIuZ2V0VGlsZVBvcyh0aWxlU2l6ZSk7XG4gICAgICAgICAgICAgICAgaWYgKGJvbWJUaWxlLnJvdyA9PT0gdGlsZS5yb3cgJiYgTWF0aC5hYnMoYm9tYlRpbGUuY29sIC0gdGlsZS5jb2wpIDw9IGJvbWIucmFuZ2UpIHJldHVybiB0cnVlOyAvLyBIb3Jpem9udGFsXG4gICAgICAgICAgICAgICAgaWYgKGJvbWJUaWxlLmNvbCA9PT0gdGlsZS5jb2wgJiYgTWF0aC5hYnMoYm9tYlRpbGUucm93IC0gdGlsZS5yb3cpIDw9IGJvbWIucmFuZ2UpIHJldHVybiB0cnVlOyAvLyBWZXJ0aWNhbFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaW5kcyBhIHNhZmUgcGF0aCBmcm9tIGEgc3RhcnQgdGlsZSB0byBhIHRhcmdldCB0aWxlLCBhdm9pZGluZyBkYW5nZXJvdXMgZXhwbG9zaW9uIHpvbmVzLlxuICAgICAqIFVzZXMgYSBzaW1wbGUgQnJlYWR0aC1GaXJzdCBTZWFyY2ggKEJGUykuXG4gICAgICogQHBhcmFtIHN0YXJ0IFRoZSBzdGFydGluZyB0aWxlLlxuICAgICAqIEBwYXJhbSB0YXJnZXQgVGhlIHRhcmdldCB0aWxlLlxuICAgICAqIEBwYXJhbSBnYW1lIFRoZSBtYWluIGdhbWUgaW5zdGFuY2UuXG4gICAgICogQHJldHVybnMgQW4gYXJyYXkgb2YgVGlsZVBvc2l0aW9ucyByZXByZXNlbnRpbmcgdGhlIHBhdGgsIG9yIGVtcHR5IGFycmF5IGlmIG5vIHNhZmUgcGF0aC5cbiAgICAgKi9cbiAgICBwcml2YXRlIGdldFNhZmVQYXRoKHN0YXJ0OiBUaWxlUG9zaXRpb24sIHRhcmdldDogVGlsZVBvc2l0aW9uLCBnYW1lOiBHYW1lKTogVGlsZVBvc2l0aW9uW10ge1xuICAgICAgICBjb25zdCBxdWV1ZTogeyB0aWxlOiBUaWxlUG9zaXRpb247IHBhdGg6IFRpbGVQb3NpdGlvbltdIH1bXSA9IFtdO1xuICAgICAgICBjb25zdCB2aXNpdGVkOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcbiAgICAgICAgY29uc3QgbWFwID0gZ2FtZS5tYXA7XG4gICAgICAgIGNvbnN0IHsgdGlsZVNpemUsIGJvbWJGdXNlVGltZSB9ID0gZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzO1xuXG4gICAgICAgIHF1ZXVlLnB1c2goeyB0aWxlOiBzdGFydCwgcGF0aDogW3N0YXJ0XSB9KTtcbiAgICAgICAgdmlzaXRlZC5hZGQoYCR7c3RhcnQucm93fSwke3N0YXJ0LmNvbH1gKTtcblxuICAgICAgICBjb25zdCBkaXJlY3Rpb25zID0gW1xuICAgICAgICAgICAgeyBkcjogLTEsIGRjOiAwIH0sIHsgZHI6IDEsIGRjOiAwIH0sXG4gICAgICAgICAgICB7IGRyOiAwLCBkYzogLTEgfSwgeyBkcjogMCwgZGM6IDEgfVxuICAgICAgICBdO1xuXG4gICAgICAgIHdoaWxlIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb25zdCB7IHRpbGUsIHBhdGggfSA9IHF1ZXVlLnNoaWZ0KCkhO1xuXG4gICAgICAgICAgICBpZiAodGlsZS5yb3cgPT09IHRhcmdldC5yb3cgJiYgdGlsZS5jb2wgPT09IHRhcmdldC5jb2wpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcGF0aDsgLy8gVGFyZ2V0IHJlYWNoZWRcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChjb25zdCBkaXIgb2YgZGlyZWN0aW9ucykge1xuICAgICAgICAgICAgICAgIGNvbnN0IG5laWdoYm9yOiBUaWxlUG9zaXRpb24gPSB7IHJvdzogdGlsZS5yb3cgKyBkaXIuZHIsIGNvbDogdGlsZS5jb2wgKyBkaXIuZGMgfTtcblxuICAgICAgICAgICAgICAgIGlmIChuZWlnaGJvci5yb3cgPCAwIHx8IG5laWdoYm9yLnJvdyA+PSBtYXAubGVuZ3RoIHx8XG4gICAgICAgICAgICAgICAgICAgIG5laWdoYm9yLmNvbCA8IDAgfHwgbmVpZ2hib3IuY29sID49IG1hcFswXS5sZW5ndGgpIGNvbnRpbnVlOyAvLyBPdXQgb2YgYm91bmRzXG5cbiAgICAgICAgICAgICAgICBjb25zdCBuZWlnaGJvcktleSA9IGAke25laWdoYm9yLnJvd30sJHtuZWlnaGJvci5jb2x9YDtcbiAgICAgICAgICAgICAgICBpZiAodmlzaXRlZC5oYXMobmVpZ2hib3JLZXkpKSBjb250aW51ZTtcblxuICAgICAgICAgICAgICAgIGNvbnN0IHRpbGVUeXBlID0gbWFwW25laWdoYm9yLnJvd11bbmVpZ2hib3IuY29sXS50eXBlO1xuICAgICAgICAgICAgICAgIC8vIENhbm5vdCBtb3ZlIGludG8gc29saWQgb3IgYnJlYWthYmxlIGJsb2Nrc1xuICAgICAgICAgICAgICAgIGlmICh0aWxlVHlwZSA9PT0gVGlsZVR5cGUuU09MSUQgfHwgdGlsZVR5cGUgPT09IFRpbGVUeXBlLkJSRUFLQUJMRSkgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICAvLyBBdm9pZCB0aWxlcyBpbiBpbW1pbmVudCBkYW5nZXJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5pc1RpbGVJbkV4cGxvc2lvbkRhbmdlcihuZWlnaGJvciwgZ2FtZS5ib21icywgYm9tYkZ1c2VUaW1lLCB0aWxlU2l6ZSkpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgdmlzaXRlZC5hZGQobmVpZ2hib3JLZXkpO1xuICAgICAgICAgICAgICAgIHF1ZXVlLnB1c2goeyB0aWxlOiBuZWlnaGJvciwgcGF0aDogWy4uLnBhdGgsIG5laWdoYm9yXSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gW107IC8vIE5vIHNhZmUgcGF0aCBmb3VuZFxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFJIGF0dGVtcHRzIHRvIG1vdmUgdG8gYSBzYWZlIHRpbGUgaWYgY3VycmVudGx5IGluIGRhbmdlci5cbiAgICAgKiBAcGFyYW0gZ2FtZSBUaGUgbWFpbiBnYW1lIGluc3RhbmNlLlxuICAgICAqL1xuICAgIHByaXZhdGUgZXZhZGVCb21icyhnYW1lOiBHYW1lKSB7XG4gICAgICAgIGlmICh0aGlzLmlzTW92aW5nKSByZXR1cm47XG5cbiAgICAgICAgY29uc3QgbXlUaWxlID0gdGhpcy5jdXJyZW50VGlsZTtcbiAgICAgICAgY29uc3QgbWFwID0gZ2FtZS5tYXA7XG4gICAgICAgIGNvbnN0IHsgYm9tYkZ1c2VUaW1lLCB0aWxlU2l6ZSB9ID0gZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzO1xuXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbnMgPSBbXG4gICAgICAgICAgICB7IGRyOiAtMSwgZGM6IDAgfSwgeyBkcjogMSwgZGM6IDAgfSxcbiAgICAgICAgICAgIHsgZHI6IDAsIGRjOiAtMSB9LCB7IGRyOiAwLCBkYzogMSB9XG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gUHJpb3JpdGl6ZSBtb3ZpbmcgdG8gYW4gYWRqYWNlbnQgc2FmZSwgZW1wdHkgdGlsZVxuICAgICAgICBmb3IgKGNvbnN0IGRpciBvZiBkaXJlY3Rpb25zKSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0VGlsZTogVGlsZVBvc2l0aW9uID0geyByb3c6IG15VGlsZS5yb3cgKyBkaXIuZHIsIGNvbDogbXlUaWxlLmNvbCArIGRpci5kYyB9O1xuICAgICAgICAgICAgaWYgKG5leHRUaWxlLnJvdyA8IDAgfHwgbmV4dFRpbGUucm93ID49IG1hcC5sZW5ndGggfHxcbiAgICAgICAgICAgICAgICBuZXh0VGlsZS5jb2wgPCAwIHx8IG5leHRUaWxlLmNvbCA+PSBtYXBbMF0ubGVuZ3RoKSBjb250aW51ZTtcblxuICAgICAgICAgICAgY29uc3QgbWFwVGlsZSA9IG1hcFtuZXh0VGlsZS5yb3ddW25leHRUaWxlLmNvbF07XG4gICAgICAgICAgICBpZiAobWFwVGlsZS50eXBlID09PSBUaWxlVHlwZS5FTVBUWSAmJiAhdGhpcy5pc1RpbGVJbkV4cGxvc2lvbkRhbmdlcihuZXh0VGlsZSwgZ2FtZS5ib21icywgYm9tYkZ1c2VUaW1lLCB0aWxlU2l6ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmF0dGVtcHRNb3ZlKGRpci5kYywgZGlyLmRyLCBtYXAsIHRpbGVTaXplKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFpUGF0aCA9IFtdOyAvLyBDbGVhciBjdXJyZW50IHBhdGgsIGFzIHdlIGFyZSBldmFkaW5nXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIElmIG5vIGltbWVkaWF0ZSBzYWZlIGFkamFjZW50IHRpbGUsIEFJIG1pZ2h0IGdldCBzdHVjayBvciB0cnkgdG8gcGF0aGZpbmQgZnVydGhlci5cbiAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHksIGlmIGltbWVkaWF0ZSBldmFkZSBmYWlscywgQUkgbWlnaHQgbW92ZSB0b3dhcmRzIGEgbm9uLWRhbmdlcm91cyBjZWxsXG4gICAgICAgIC8vIGluIGl0cyBjdXJyZW50IHBhdGggb3IgcmUtZXZhbHVhdGUuXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQUkgYXR0ZW1wdHMgdG8gY2hhc2UgdGhlIHRhcmdldCBodW1hbiBwbGF5ZXIuXG4gICAgICogQHBhcmFtIGdhbWUgVGhlIG1haW4gZ2FtZSBpbnN0YW5jZS5cbiAgICAgKiBAcGFyYW0gcGxheWVyVGlsZSBUaGUgdGFyZ2V0IHBsYXllcidzIGN1cnJlbnQgdGlsZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGNoYXNlUGxheWVyKGdhbWU6IEdhbWUsIHBsYXllclRpbGU6IFRpbGVQb3NpdGlvbikge1xuICAgICAgICBpZiAodGhpcy5pc01vdmluZykgcmV0dXJuO1xuXG4gICAgICAgIC8vIFJlY2FsY3VsYXRlIHBhdGggaWYgbm8gcGF0aCBvciB0YXJnZXQgcGxheWVyIG1vdmVkIHNpZ25pZmljYW50bHlcbiAgICAgICAgaWYgKHRoaXMuYWlQYXRoLmxlbmd0aCA9PT0gMCB8fFxuICAgICAgICAgICAgKHRoaXMuYWlQYXRoLmxlbmd0aCA+IDAgJiYgKHRoaXMuYWlQYXRoW3RoaXMuYWlQYXRoLmxlbmd0aCAtIDFdLnJvdyAhPT0gcGxheWVyVGlsZS5yb3cgfHwgdGhpcy5haVBhdGhbdGhpcy5haVBhdGgubGVuZ3RoIC0gMV0uY29sICE9PSBwbGF5ZXJUaWxlLmNvbCkpKSB7XG4gICAgICAgICAgICB0aGlzLmFpUGF0aCA9IHRoaXMuZ2V0U2FmZVBhdGgodGhpcy5jdXJyZW50VGlsZSwgcGxheWVyVGlsZSwgZ2FtZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5haVBhdGgubGVuZ3RoID4gMSkgeyAvLyBJZiBwYXRoIGV4aXN0cyBhbmQgaGFzIG1vcmUgdGhhbiBqdXN0IHRoZSBjdXJyZW50IHRpbGVcbiAgICAgICAgICAgIGNvbnN0IG5leHRTdGVwID0gdGhpcy5haVBhdGhbMV07IC8vIFRoZSBuZXh0IHRpbGUgaW4gdGhlIHBhdGhcbiAgICAgICAgICAgIGNvbnN0IGRyID0gbmV4dFN0ZXAucm93IC0gdGhpcy5jdXJyZW50VGlsZS5yb3c7XG4gICAgICAgICAgICBjb25zdCBkYyA9IG5leHRTdGVwLmNvbCAtIHRoaXMuY3VycmVudFRpbGUuY29sO1xuICAgICAgICAgICAgdGhpcy5hdHRlbXB0TW92ZShkYywgZHIsIGdhbWUubWFwLCBnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gUGxheWVyIGlzIHVucmVhY2hhYmxlIG9yIGFscmVhZHkgb24gdGhlIHNhbWUgdGlsZSwgdHJ5IHRvIGJyZWFrIGJsb2NrcyBvciBqdXN0IGlkbGVcbiAgICAgICAgICAgIHRoaXMuZmluZEFuZEJyZWFrQmxvY2soZ2FtZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBSSBhdHRlbXB0cyB0byBwbGFjZSBhIGJvbWIgYW5kIHRoZW4gZXZhZGUuXG4gICAgICogQHBhcmFtIGdhbWUgVGhlIG1haW4gZ2FtZSBpbnN0YW5jZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHBlcmZvcm1Cb21iUGxhY2VtZW50KGdhbWU6IEdhbWUpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNNb3ZpbmcpIHJldHVybjsgLy8gV2FpdCB1bnRpbCBBSSBzdG9wcyBtb3ZpbmdcbiAgICAgICAgaWYgKHRoaXMuYWlCb21iVGltZXIgPiAwKSByZXR1cm47IC8vIFJlc3BlY3QgYm9tYiBjb29sZG93blxuXG4gICAgICAgIGNvbnN0IGJvbWIgPSB0aGlzLnBsYWNlQm9tYihnYW1lKTtcbiAgICAgICAgaWYgKGJvbWIpIHtcbiAgICAgICAgICAgIHRoaXMuYWlCb21iVGltZXIgPSAxLjU7IC8vIFNldCBjb29sZG93biBhZnRlciBwbGFjaW5nIGEgYm9tYlxuICAgICAgICAgICAgdGhpcy5ldmFkZUJvbWJzKGdhbWUpOyAvLyBBZnRlciBwbGFjaW5nLCBpbW1lZGlhdGVseSB0cnkgdG8gbW92ZSBhd2F5IGZyb20gdGhlIGJvbWJcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyBpZiB0aGUgQUkgY2FuIGVmZmVjdGl2ZWx5IGJvbWIgdGhlIHRhcmdldCBwbGF5ZXIgKGxpbmUgb2Ygc2lnaHQgYW5kIHJhbmdlKS5cbiAgICAgKiBAcGFyYW0gbXlUaWxlIEFJJ3MgY3VycmVudCB0aWxlLlxuICAgICAqIEBwYXJhbSBwbGF5ZXJUaWxlIFRhcmdldCBwbGF5ZXIncyBjdXJyZW50IHRpbGUuXG4gICAgICogQHBhcmFtIG1hcCBUaGUgZ2FtZSBtYXAuXG4gICAgICogQHBhcmFtIGJvbWJzIEFsbCBhY3RpdmUgYm9tYnMuXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgQUkgY2FuIGJvbWIgdGhlIHBsYXllci5cbiAgICAgKi9cbiAgICBwcml2YXRlIGNhbkJvbWJQbGF5ZXIobXlUaWxlOiBUaWxlUG9zaXRpb24sIHBsYXllclRpbGU6IFRpbGVQb3NpdGlvbiwgbWFwOiBUaWxlW11bXSwgYm9tYnM6IEJvbWJbXSk6IGJvb2xlYW4ge1xuICAgICAgICAvLyBQcmV2ZW50IHBsYWNpbmcgYm9tYiBpZiBvbmUgYWxyZWFkeSBleGlzdHMgb24gQUkncyB0aWxlXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nQm9tYkF0TXlUaWxlID0gYm9tYnMuc29tZShiID0+IGIuZ2V0VGlsZVBvcyhnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUpLmNvbCA9PT0gbXlUaWxlLmNvbCAmJiBiLmdldFRpbGVQb3MoZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLnRpbGVTaXplKS5yb3cgPT09IG15VGlsZS5yb3cpO1xuICAgICAgICBpZiAoZXhpc3RpbmdCb21iQXRNeVRpbGUpIHJldHVybiBmYWxzZTtcblxuICAgICAgICBjb25zdCByYW5nZSA9IHRoaXMuYm9tYlJhbmdlO1xuICAgICAgICAvLyBDaGVjayBob3Jpem9udGFsIGxpbmUgb2Ygc2lnaHRcbiAgICAgICAgaWYgKG15VGlsZS5yb3cgPT09IHBsYXllclRpbGUucm93KSB7XG4gICAgICAgICAgICBpZiAoTWF0aC5hYnMobXlUaWxlLmNvbCAtIHBsYXllclRpbGUuY29sKSA8PSByYW5nZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXJ0Q29sID0gTWF0aC5taW4obXlUaWxlLmNvbCwgcGxheWVyVGlsZS5jb2wpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVuZENvbCA9IE1hdGgubWF4KG15VGlsZS5jb2wsIHBsYXllclRpbGUuY29sKTtcbiAgICAgICAgICAgICAgICBsZXQgYmxvY2tlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGMgPSBzdGFydENvbCArIDE7IGMgPCBlbmRDb2w7IGMrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAobWFwW215VGlsZS5yb3ddW2NdLnR5cGUgPT09IFRpbGVUeXBlLlNPTElEKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBibG9ja2VkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghYmxvY2tlZCkgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2hlY2sgdmVydGljYWwgbGluZSBvZiBzaWdodFxuICAgICAgICBpZiAobXlUaWxlLmNvbCA9PT0gcGxheWVyVGlsZS5jb2wpIHtcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhteVRpbGUucm93IC0gcGxheWVyVGlsZS5yb3cpIDw9IHJhbmdlKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhcnRSb3cgPSBNYXRoLm1pbihteVRpbGUucm93LCBwbGF5ZXJUaWxlLnJvdyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5kUm93ID0gTWF0aC5tYXgobXlUaWxlLnJvdywgcGxheWVyVGlsZS5yb3cpO1xuICAgICAgICAgICAgICAgIGxldCBibG9ja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgciA9IHN0YXJ0Um93ICsgMTsgciA8IGVuZFJvdzsgcisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXBbcl1bbXlUaWxlLmNvbF0udHlwZSA9PT0gVGlsZVR5cGUuU09MSUQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJsb2NrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFibG9ja2VkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQUkgYXR0ZW1wdHMgdG8gZmluZCBhbmQgYnJlYWsgYSBicmVha2FibGUgYmxvY2suXG4gICAgICogQHBhcmFtIGdhbWUgVGhlIG1haW4gZ2FtZSBpbnN0YW5jZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGZpbmRBbmRCcmVha0Jsb2NrKGdhbWU6IEdhbWUpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNNb3ZpbmcpIHJldHVybjtcblxuICAgICAgICBjb25zdCBteVRpbGUgPSB0aGlzLmN1cnJlbnRUaWxlO1xuICAgICAgICBjb25zdCBtYXAgPSBnYW1lLm1hcDtcbiAgICAgICAgY29uc3QgeyB0aWxlU2l6ZSB9ID0gZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzO1xuXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbnMgPSBbXG4gICAgICAgICAgICB7IGRyOiAtMSwgZGM6IDAgfSwgeyBkcjogMSwgZGM6IDAgfSxcbiAgICAgICAgICAgIHsgZHI6IDAsIGRjOiAtMSB9LCB7IGRyOiAwLCBkYzogMSB9XG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gQ2hlY2sgZm9yIGFkamFjZW50IGJyZWFrYWJsZSBibG9ja3NcbiAgICAgICAgZm9yIChjb25zdCBkaXIgb2YgZGlyZWN0aW9ucykge1xuICAgICAgICAgICAgY29uc3QgbmV4dFRpbGU6IFRpbGVQb3NpdGlvbiA9IHsgcm93OiBteVRpbGUucm93ICsgZGlyLmRyLCBjb2w6IG15VGlsZS5jb2wgKyBkaXIuZGMgfTtcbiAgICAgICAgICAgIGlmIChuZXh0VGlsZS5yb3cgPCAwIHx8IG5leHRUaWxlLnJvdyA+PSBtYXAubGVuZ3RoIHx8XG4gICAgICAgICAgICAgICAgbmV4dFRpbGUuY29sIDwgMCB8fCBuZXh0VGlsZS5jb2wgPj0gbWFwWzBdLmxlbmd0aCkgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IG1hcFRpbGUgPSBtYXBbbmV4dFRpbGUucm93XVtuZXh0VGlsZS5jb2xdO1xuICAgICAgICAgICAgaWYgKG1hcFRpbGUudHlwZSA9PT0gVGlsZVR5cGUuQlJFQUtBQkxFKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudEJvbWJzIDwgdGhpcy5tYXhCb21icyAmJiB0aGlzLmFpQm9tYlRpbWVyIDw9IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wZXJmb3JtQm9tYlBsYWNlbWVudChnYW1lKTsgLy8gUGxhY2UgYm9tYlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmV2YWRlQm9tYnMoZ2FtZSk7IC8vIFRoZW4gbW92ZSBhd2F5XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiBubyBhZGphY2VudCBicmVha2FibGUgYmxvY2sgb3IgY2Fubm90IHBsYWNlIGJvbWIsIHBhdGhmaW5kIHRvIGEgcmFuZG9tIGJyZWFrYWJsZSBibG9ja1xuICAgICAgICBpZiAodGhpcy5haVBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBicmVha2FibGVUaWxlczogVGlsZVBvc2l0aW9uW10gPSBbXTtcbiAgICAgICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgbWFwLmxlbmd0aDsgcisrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBtYXBbMF0ubGVuZ3RoOyBjKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hcFtyXVtjXS50eXBlID09PSBUaWxlVHlwZS5CUkVBS0FCTEUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrYWJsZVRpbGVzLnB1c2goeyByb3c6IHIsIGNvbDogYyB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGJyZWFrYWJsZVRpbGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXQgPSBicmVha2FibGVUaWxlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBicmVha2FibGVUaWxlcy5sZW5ndGgpXTtcbiAgICAgICAgICAgICAgICB0aGlzLmFpUGF0aCA9IHRoaXMuZ2V0U2FmZVBhdGgobXlUaWxlLCB0YXJnZXQsIGdhbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuYWlQYXRoLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IG5leHRTdGVwID0gdGhpcy5haVBhdGhbMV07XG4gICAgICAgICAgICBjb25zdCBkciA9IG5leHRTdGVwLnJvdyAtIHRoaXMuY3VycmVudFRpbGUucm93O1xuICAgICAgICAgICAgY29uc3QgZGMgPSBuZXh0U3RlcC5jb2wgLSB0aGlzLmN1cnJlbnRUaWxlLmNvbDtcbiAgICAgICAgICAgIHRoaXMuYXR0ZW1wdE1vdmUoZGMsIGRyLCBtYXAsIHRpbGVTaXplKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIElmIHBhdGhmaW5kaW5nIHRvIGEgYnJlYWthYmxlIGJsb2NrIGZhaWxlZCwganVzdCB3YW5kZXIgcmFuZG9tbHkgdG8gZXhwbG9yZVxuICAgICAgICAgICAgY29uc3QgcmFuZG9tRGlyID0gZGlyZWN0aW9uc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBkaXJlY3Rpb25zLmxlbmd0aCldO1xuICAgICAgICAgICAgdGhpcy5hdHRlbXB0TW92ZShyYW5kb21EaXIuZGMsIHJhbmRvbURpci5kciwgbWFwLCB0aWxlU2l6ZSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIGJvbWIgcGxhY2VkIGJ5IGEgcGxheWVyLlxuICovXG5jbGFzcyBCb21iIGV4dGVuZHMgR2FtZU9iamVjdCB7XG4gICAgdGltZXI6IG51bWJlcjtcbiAgICByYW5nZTogbnVtYmVyOyAvLyBFeHBsb3Npb24gcmFuZ2UgaW4gdGlsZXNcbiAgICBvd25lcklkOiBudW1iZXI7IC8vIElEIG9mIHRoZSBwbGF5ZXIgd2hvIHBsYWNlZCB0aGlzIGJvbWJcblxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcsIGZ1c2VUaW1lOiBudW1iZXIsIHJhbmdlOiBudW1iZXIsIG93bmVySWQ6IG51bWJlcikge1xuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xuICAgICAgICB0aGlzLnRpbWVyID0gZnVzZVRpbWU7XG4gICAgICAgIHRoaXMucmFuZ2UgPSByYW5nZTtcbiAgICAgICAgdGhpcy5vd25lcklkID0gb3duZXJJZDtcbiAgICB9XG5cbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkIHtcbiAgICAgICAgdGhpcy50aW1lciAtPSBkZWx0YVRpbWU7XG4gICAgICAgIGlmICh0aGlzLnRpbWVyIDw9IDApIHtcbiAgICAgICAgICAgIGdhbWUudHJpZ2dlckV4cGxvc2lvbih0aGlzKTsgLy8gVHJpZ2dlciBleHBsb3Npb24gd2hlbiB0aW1lciBydW5zIG91dFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiwgdGlsZVNpemU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBpbWcgPSBpbWFnZXMuZ2V0KHRoaXMuaW1hZ2VOYW1lKTtcbiAgICAgICAgaWYgKGltZykge1xuICAgICAgICAgICAgIC8vIE1ha2UgYm9tYiBmbGFzaCBmYXN0ZXIgYXMgaXQgZ2V0cyBjbG9zZXIgdG8gZXhwbG9kaW5nXG4gICAgICAgICAgICBjb25zdCBmbGFzaFJhdGUgPSB0aGlzLnRpbWVyIDwgMC41ID8gMC4wNSA6IDAuMjtcbiAgICAgICAgICAgIGlmIChNYXRoLmZsb29yKHRoaXMudGltZXIgLyBmbGFzaFJhdGUpICUgMiA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICdvcmFuZ2UnOyAvLyBGYWxsYmFja1xuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBleHBsb3Npb24gc2VnbWVudCBvbiB0aGUgbWFwLlxuICovXG5jbGFzcyBFeHBsb3Npb24gZXh0ZW5kcyBHYW1lT2JqZWN0IHtcbiAgICB0aW1lcjogbnVtYmVyOyAvLyBIb3cgbG9uZyB0aGUgZXhwbG9zaW9uIGxhc3RzXG4gICAgaXNDZW50ZXI6IGJvb2xlYW47XG4gICAgaXNWZXJ0aWNhbDogYm9vbGVhbjtcbiAgICBpc0VuZDogYm9vbGVhbjtcblxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VOYW1lOiBzdHJpbmcsIGR1cmF0aW9uOiBudW1iZXIsIGlzQ2VudGVyOiBib29sZWFuID0gZmFsc2UsIGlzVmVydGljYWw6IGJvb2xlYW4gPSBmYWxzZSwgaXNFbmQ6IGJvb2xlYW4gPSBmYWxzZSkge1xuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xuICAgICAgICB0aGlzLnRpbWVyID0gZHVyYXRpb247XG4gICAgICAgIHRoaXMuaXNDZW50ZXIgPSBpc0NlbnRlcjtcbiAgICAgICAgdGhpcy5pc1ZlcnRpY2FsID0gaXNWZXJ0aWNhbDtcbiAgICAgICAgdGhpcy5pc0VuZCA9IGlzRW5kO1xuICAgIH1cblxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xuICAgICAgICB0aGlzLnRpbWVyIC09IGRlbHRhVGltZTtcbiAgICAgICAgLy8gR2FtZSBsb29wIHdpbGwgcmVtb3ZlIGV4cGxvc2lvbnMgd2hlbiB0aW1lciA8PSAwXG4gICAgfVxufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBzaW5nbGUgdGlsZSBvbiB0aGUgZ2FtZSBtYXAuXG4gKi9cbmNsYXNzIFRpbGUge1xuICAgIHR5cGU6IFRpbGVUeXBlO1xuICAgIGltYWdlTmFtZTogc3RyaW5nO1xuICAgIGhhc1Bvd2VyVXA6IFBvd2VyVXBUeXBlIHwgbnVsbDsgLy8gTnVsbCBpZiBubyBwb3dlci11cFxuXG4gICAgY29uc3RydWN0b3IodHlwZTogVGlsZVR5cGUsIGltYWdlTmFtZTogc3RyaW5nLCBoYXNQb3dlclVwOiBQb3dlclVwVHlwZSB8IG51bGwgPSBudWxsKSB7XG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGU7XG4gICAgICAgIHRoaXMuaW1hZ2VOYW1lID0gaW1hZ2VOYW1lO1xuICAgICAgICB0aGlzLmhhc1Bvd2VyVXAgPSBoYXNQb3dlclVwO1xuICAgIH1cbn1cblxuLy8gLS0tIE1haW4gR2FtZSBDbGFzcyAtLS1cblxuLyoqXG4gKiBPcmNoZXN0cmF0ZXMgdGhlIGVudGlyZSBnYW1lLCBpbmNsdWRpbmcgc3RhdGUsIGxvb3AsIHJlbmRlcmluZywgYW5kIGxvZ2ljLlxuICovXG5jbGFzcyBHYW1lIHtcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcbiAgICBwdWJsaWMgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gTG9hZGVkIGZyb20gZGF0YS5qc29uXG4gICAgcHJpdmF0ZSBpbWFnZXMhOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PjsgLy8gTG9hZGVkIGltYWdlIGFzc2V0c1xuICAgIHB1YmxpYyBzb3VuZE1hbmFnZXIhOiBTb3VuZE1hbmFnZXI7IC8vIE1hbmFnZXMgZ2FtZSBhdWRpb1xuXG4gICAgcHJpdmF0ZSBsYXN0VGltZTogbnVtYmVyID0gMDsgLy8gVGltZXN0YW1wIG9mIHByZXZpb3VzIGZyYW1lXG4gICAgcHJpdmF0ZSBhbmltYXRpb25GcmFtZUlkOiBudW1iZXIgfCBudWxsID0gbnVsbDsgLy8gSUQgZm9yIHJlcXVlc3RBbmltYXRpb25GcmFtZVxuXG4gICAgcHVibGljIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IGdhbWUgc3RhdGVcbiAgICBwcml2YXRlIGlucHV0OiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9OyAvLyBUcmFja3MgY3VycmVudGx5IHByZXNzZWQga2V5c1xuICAgIHByaXZhdGUgcHJlc3NlZEtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307IC8vIFRyYWNrcyBrZXlzIHByZXNzZWQgb25jZSBwZXIgZnJhbWVcblxuICAgIHB1YmxpYyBwbGF5ZXJzOiBQbGF5ZXJbXSA9IFtdO1xuICAgIHB1YmxpYyBib21iczogQm9tYltdID0gW107XG4gICAgcHVibGljIGV4cGxvc2lvbnM6IEV4cGxvc2lvbltdID0gW107XG4gICAgcHVibGljIG1hcCE6IFRpbGVbXVtdOyAvLyBUaGUgZ2FtZSBtYXAgZ3JpZFxuXG4gICAgcHJpdmF0ZSBwbGF5ZXIxOiBQbGF5ZXIgfCBudWxsID0gbnVsbDsgLy8gUmVmZXJlbmNlIHRvIHRoZSBodW1hbiBwbGF5ZXJcbiAgICBwcml2YXRlIGh1bWFuUGxheWVyc0NvdW50OiBudW1iZXIgPSAwOyAvLyBOdW1iZXIgb2YgaHVtYW4gcGxheWVycyAoY3VycmVudGx5IG9ubHkgMSlcbiAgICBwcml2YXRlIGFpUGxheWVyc0NvdW50OiBudW1iZXIgPSAwOyAvLyBOdW1iZXIgb2YgQUkgcGxheWVyc1xuXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcblxuICAgICAgICAvLyBFdmVudCBsaXN0ZW5lcnMgZm9yIGlucHV0XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5oYW5kbGVLZXlEb3duKTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5oYW5kbGVLZXlVcCk7XG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDYW52YXNDbGljayk7IC8vIEZvciBVSSBjbGlja3NcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMuaGFuZGxlTW91c2VEb3duKTsgLy8gRm9yIGluaXRpYWwgdXNlciBpbnRlcmFjdGlvbiBmb3IgYXVkaW9cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIYW5kbGVzIGtleWRvd24gZXZlbnRzLCB1cGRhdGluZyBpbnB1dCBzdGF0ZSBhbmQgdHJpZ2dlcmluZyBzdGF0ZSB0cmFuc2l0aW9ucy5cbiAgICAgKi9cbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24gPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAgICAgICB0aGlzLmlucHV0W2Uua2V5XSA9IHRydWU7XG4gICAgICAgIHRoaXMucHJlc3NlZEtleXNbZS5rZXldID0gdHJ1ZTsgLy8gTWFyayBhcyBuZXdseSBwcmVzc2VkXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TKSB7XG4gICAgICAgICAgICAvLyBBZHZhbmNlIHN0YXRlIG9uIGFueSBrZXkgcHJlc3MgZnJvbSB0aXRsZS9pbnN0cnVjdGlvbnNcbiAgICAgICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZE1hbmFnZXIucGxheUJHTSgpOyAvLyBUcnkgcGxheWluZyBCR00gb24gZmlyc3QgdXNlciBpbnRlcmFjdGlvblxuICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlU3RhdGUoR2FtZVN0YXRlLklOU1RSVUNUSU9OUyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VTdGF0ZShHYW1lU3RhdGUuUExBWUlORyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogSGFuZGxlcyBrZXl1cCBldmVudHMsIHVwZGF0aW5nIGlucHV0IHN0YXRlLlxuICAgICAqL1xuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAgPSAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAgICAgICB0aGlzLmlucHV0W2Uua2V5XSA9IGZhbHNlO1xuICAgICAgICAvLyBEbyBOT1QgcmVzZXQgcHJlc3NlZEtleXMgaGVyZTsgaXQncyByZXNldCBhZnRlciBgdXBkYXRlYFxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBIYW5kbGVzIGNsaWNrcyBvbiB0aGUgY2FudmFzLCBwcmltYXJpbHkgZm9yIFVJIGVsZW1lbnRzIGxpa2UgdGhlIHNvdW5kIGJ1dHRvbi5cbiAgICAgKi9cbiAgICBwcml2YXRlIGhhbmRsZUNhbnZhc0NsaWNrID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uU2l6ZSA9IDMwO1xuICAgICAgICAgICAgY29uc3QgcGFkZGluZyA9IDEwO1xuICAgICAgICAgICAgY29uc3QgYnRuWCA9IHRoaXMuY2FudmFzLndpZHRoIC0gYnV0dG9uU2l6ZSAtIHBhZGRpbmc7XG4gICAgICAgICAgICBjb25zdCBidG5ZID0gcGFkZGluZztcblxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgY2xpY2sgaXMgd2l0aGluIHRoZSBzb3VuZCBidXR0b24gYXJlYVxuICAgICAgICAgICAgaWYgKGUub2Zmc2V0WCA+PSBidG5YICYmIGUub2Zmc2V0WCA8PSBidG5YICsgYnV0dG9uU2l6ZSAmJlxuICAgICAgICAgICAgICAgIGUub2Zmc2V0WSA+PSBidG5ZICYmIGUub2Zmc2V0WSA8PSBidG5ZICsgYnV0dG9uU2l6ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc291bmRNYW5hZ2VyLnRvZ2dsZVNvdW5kKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogSGFuZGxlcyBpbml0aWFsIG1vdXNlIGRvd24gZXZlbnQgdG8gYXR0ZW1wdCBwbGF5aW5nIEJHTSwgY2lyY3VtdmVudGluZyBicm93c2VyIGF1dG9wbGF5IHBvbGljaWVzLlxuICAgICAqL1xuICAgIHByaXZhdGUgaGFuZGxlTW91c2VEb3duID0gKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSAmJiB0aGlzLnNvdW5kTWFuYWdlcikge1xuICAgICAgICAgICAgdGhpcy5zb3VuZE1hbmFnZXIucGxheUJHTSgpO1xuICAgICAgICB9XG4gICAgICAgIHdpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLmhhbmRsZU1vdXNlRG93bik7IC8vIE9ubHkgbmVlZCB0byBkbyB0aGlzIG9uY2VcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbml0aWFsaXplcyB0aGUgZ2FtZSBieSBsb2FkaW5nIGNvbmZpZ3VyYXRpb24gYW5kIGFzc2V0cywgdGhlbiBzdGFydHMgdGhlIGdhbWUgbG9vcC5cbiAgICAgKiBAcGFyYW0gY29uZmlnUGF0aCBQYXRoIHRvIHRoZSBkYXRhLmpzb24gY29uZmlndXJhdGlvbiBmaWxlLlxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBpbml0KGNvbmZpZ1BhdGg6IHN0cmluZykge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChjb25maWdQYXRoKTtcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNIZWlnaHQ7XG5cbiAgICAgICAgICAgIC8vIExvYWQgYXNzZXRzIHdpdGggYSBsb2FkaW5nIHNjcmVlblxuICAgICAgICAgICAgY29uc3QgYXNzZXRMb2FkZXIgPSBuZXcgQXNzZXRMb2FkZXIodGhpcy5jb25maWcpO1xuICAgICAgICAgICAgY29uc3QgYXNzZXRzID0gYXdhaXQgYXNzZXRMb2FkZXIubG9hZCgocHJvZ3Jlc3MpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKHByb2dyZXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGhpcy5pbWFnZXMgPSBhc3NldHMuaW1hZ2VzO1xuICAgICAgICAgICAgdGhpcy5zb3VuZE1hbmFnZXIgPSBuZXcgU291bmRNYW5hZ2VyKGFzc2V0cy5zb3VuZHMpO1xuICAgICAgICAgICAgdGhpcy5zb3VuZE1hbmFnZXIuc2V0QmFja2dyb3VuZE11c2ljKCdiZ20nKTtcblxuICAgICAgICAgICAgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxuICAgICAgICAgICAgdGhpcy5sYXN0VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgICAgICAgICAgdGhpcy5sb29wKHRoaXMubGFzdFRpbWUpO1xuXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24gb3IgYXNzZXRzOicsIGVycm9yKTtcbiAgICAgICAgICAgIC8vIERpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBvbiBjYW52YXMgaWYgY3JpdGljYWwgZmFpbHVyZVxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JlZCc7XG4gICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xuICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnRVJST1I6IEZhaWxlZCB0byBsb2FkIGdhbWUuJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERyYXdzIGEgbG9hZGluZyBwcm9ncmVzcyBzY3JlZW4gd2hpbGUgYXNzZXRzIGFyZSBiZWluZyBsb2FkZWQuXG4gICAgICogQHBhcmFtIHByb2dyZXNzIEN1cnJlbnQgbG9hZGluZyBwcm9ncmVzcyAoMCB0byAxKS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGRyYXdMb2FkaW5nU2NyZWVuKHByb2dyZXNzOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnTG9hZGluZyBBc3NldHMuLi4nLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAyMCk7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDEwMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgMjAwLCAxMCk7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdncmVlbic7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KHRoaXMuY2FudmFzLndpZHRoIC8gMiAtIDEwMCwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiwgMjAwICogcHJvZ3Jlc3MsIDEwKTtcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYCR7TWF0aC5yb3VuZChwcm9ncmVzcyAqIDEwMCl9JWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDQwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHVwIHRoZSBpbml0aWFsIGdhbWUgc3RhdGUsIG1hcCwgYW5kIHBsYXllcnMgZm9yIGEgbmV3IHJvdW5kLlxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0dXBHYW1lKCkge1xuICAgICAgICB0aGlzLm1hcCA9IHRoaXMuZ2VuZXJhdGVNYXAoKTtcbiAgICAgICAgdGhpcy5zcGF3blBsYXllcnMoKTtcbiAgICAgICAgdGhpcy5ib21icyA9IFtdO1xuICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSBbXTtcbiAgICAgICAgLy8gRW5zdXJlIEJHTSBpcyBwbGF5aW5nIHdoZW4gZ2FtZSBzdGFydHNcbiAgICAgICAgdGhpcy5zb3VuZE1hbmFnZXIucGxheUJHTSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoYW5nZXMgdGhlIGN1cnJlbnQgZ2FtZSBzdGF0ZSBhbmQgcGVyZm9ybXMgYW55IG5lY2Vzc2FyeSBhY3Rpb25zIGZvciB0aGUgbmV3IHN0YXRlLlxuICAgICAqIEBwYXJhbSBuZXdTdGF0ZSBUaGUgR2FtZVN0YXRlIHRvIHRyYW5zaXRpb24gdG8uXG4gICAgICovXG4gICAgcHJpdmF0ZSBjaGFuZ2VTdGF0ZShuZXdTdGF0ZTogR2FtZVN0YXRlKSB7XG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gbmV3U3RhdGU7XG4gICAgICAgIGlmIChuZXdTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dXBHYW1lKCk7IC8vIFJlLWluaXRpYWxpemUgbWFwIGFuZCBwbGF5ZXJzIGZvciBhIG5ldyBnYW1lXG4gICAgICAgIH0gZWxzZSBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVJfV0lOIHx8IG5ld1N0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSX0xPU0UpIHtcbiAgICAgICAgICAgIHRoaXMuc291bmRNYW5hZ2VyLnN0b3BCR00oKTsgLy8gU3RvcCBCR00gb24gZ2FtZSBvdmVyXG4gICAgICAgIH0gZWxzZSBpZiAobmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xuICAgICAgICAgICAgLy8gT24gcmV0dXJuaW5nIHRvIHRpdGxlLCByZS1lbmFibGUgQkdNIHBsYXliYWNrIGF0dGVtcHRzXG4gICAgICAgICAgICB0aGlzLnNvdW5kTWFuYWdlci5wbGF5QkdNKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgbWFpbiBnYW1lIGxvb3AsIGNhbGxlZCByZXBlYXRlZGx5IHZpYSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUuXG4gICAgICogQHBhcmFtIGN1cnJlbnRUaW1lIEN1cnJlbnQgdGltZXN0YW1wIGZyb20gcGVyZm9ybWFuY2Uubm93KCkuXG4gICAgICovXG4gICAgcHJpdmF0ZSBsb29wID0gKGN1cnJlbnRUaW1lOiBudW1iZXIpID0+IHtcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwOyAvLyBDb252ZXJ0IHRvIHNlY29uZHNcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IGN1cnJlbnRUaW1lO1xuXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG5cbiAgICAgICAgLy8gQ2xlYXIgcHJlc3NlZCBrZXlzIGZvciB0aGUgbmV4dCBmcmFtZVxuICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiB0aGlzLnByZXNzZWRLZXlzKSB7XG4gICAgICAgICAgICB0aGlzLnByZXNzZWRLZXlzW2tleV0gPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmxvb3ApO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIHRoZSBnYW1lIGxvZ2ljIGJhc2VkIG9uIHRoZSBjdXJyZW50IHN0YXRlLlxuICAgICAqIEBwYXJhbSBkZWx0YVRpbWUgVGltZSBlbGFwc2VkIHNpbmNlIHRoZSBsYXN0IHVwZGF0ZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcbiAgICAgICAgICAgICAgICAvLyBOb3RoaW5nIHRvIHVwZGF0ZSwgd2FpdGluZyBmb3IgdXNlciBpbnB1dFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZUdhbWVQbGF5aW5nKGRlbHRhVGltZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVJfV0lOOlxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSX0xPU0U6XG4gICAgICAgICAgICAgICAgLy8gV2FpdCBmb3IgJ0VudGVyJyBrZXkgdG8gcmVzdGFydFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLnByZXNzZWRLZXlzWydFbnRlciddKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2hhbmdlU3RhdGUoR2FtZVN0YXRlLlRJVExFKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIGdhbWUgbG9naWMgc3BlY2lmaWNhbGx5IGZvciB0aGUgUExBWUlORyBzdGF0ZS5cbiAgICAgKiBAcGFyYW0gZGVsdGFUaW1lIFRpbWUgZWxhcHNlZC5cbiAgICAgKi9cbiAgICBwcml2YXRlIHVwZGF0ZUdhbWVQbGF5aW5nKGRlbHRhVGltZTogbnVtYmVyKSB7XG4gICAgICAgIC8vIFVwZGF0ZSBwbGF5ZXJzXG4gICAgICAgIHRoaXMucGxheWVycy5mb3JFYWNoKHBsYXllciA9PiB7XG4gICAgICAgICAgICBwbGF5ZXIudXBkYXRlKGRlbHRhVGltZSwgdGhpcyk7XG4gICAgICAgICAgICBpZiAoIXBsYXllci5pc0FJICYmICFwbGF5ZXIuaXNEZWFkKSB7IC8vIEh1bWFuIHBsYXllciBpbnB1dFxuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlUGxheWVySW5wdXQocGxheWVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVXBkYXRlIGJvbWJzIChyZXZlcnNlIGxvb3AgZm9yIHNhZmUgcmVtb3ZhbClcbiAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMuYm9tYnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIHRoaXMuYm9tYnNbaV0udXBkYXRlKGRlbHRhVGltZSwgdGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVcGRhdGUgZXhwbG9zaW9ucyAocmV2ZXJzZSBsb29wIGZvciBzYWZlIHJlbW92YWwpXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLmV4cGxvc2lvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgICAgIHRoaXMuZXhwbG9zaW9uc1tpXS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmV4cGxvc2lvbnNbaV0udGltZXIgPD0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZXhwbG9zaW9ucy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNoZWNrQ29sbGlzaW9ucygpO1xuICAgICAgICB0aGlzLmNoZWNrR2FtZUVuZENvbmRpdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhhbmRsZXMga2V5Ym9hcmQgaW5wdXQgZm9yIHRoZSBodW1hbiBwbGF5ZXIuXG4gICAgICogQHBhcmFtIHBsYXllciBUaGUgaHVtYW4gcGxheWVyIG9iamVjdC5cbiAgICAgKi9cbiAgICBwcml2YXRlIGhhbmRsZVBsYXllcklucHV0KHBsYXllcjogUGxheWVyKSB7XG4gICAgICAgIGlmIChwbGF5ZXIuaXNNb3ZpbmcpIHJldHVybjtcblxuICAgICAgICBsZXQgbW92ZWQgPSBmYWxzZTtcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRbJ0Fycm93VXAnXSB8fCB0aGlzLmlucHV0Wyd3J10pIHtcbiAgICAgICAgICAgIG1vdmVkID0gcGxheWVyLmF0dGVtcHRNb3ZlKDAsIC0xLCB0aGlzLm1hcCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnRpbGVTaXplKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlucHV0WydBcnJvd0Rvd24nXSB8fCB0aGlzLmlucHV0WydzJ10pIHtcbiAgICAgICAgICAgIG1vdmVkID0gcGxheWVyLmF0dGVtcHRNb3ZlKDAsIDEsIHRoaXMubWFwLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaW5wdXRbJ0Fycm93TGVmdCddIHx8IHRoaXMuaW5wdXRbJ2EnXSkge1xuICAgICAgICAgICAgbW92ZWQgPSBwbGF5ZXIuYXR0ZW1wdE1vdmUoLTEsIDAsIHRoaXMubWFwLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaW5wdXRbJ0Fycm93UmlnaHQnXSB8fCB0aGlzLmlucHV0WydkJ10pIHtcbiAgICAgICAgICAgIG1vdmVkID0gcGxheWVyLmF0dGVtcHRNb3ZlKDEsIDAsIHRoaXMubWFwLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG1vdmVkKSB7XG4gICAgICAgICAgICB0aGlzLnNvdW5kTWFuYWdlci5wbGF5U291bmQoJ3BsYXllcl9tb3ZlJywgZmFsc2UsIDAuMyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5wcmVzc2VkS2V5c1snICddKSB7IC8vIFNwYWNlYmFyIGZvciBib21iXG4gICAgICAgICAgICBjb25zdCBuZXdCb21iID0gcGxheWVyLnBsYWNlQm9tYih0aGlzKTtcbiAgICAgICAgICAgIGlmIChuZXdCb21iKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ib21icy5wdXNoKG5ld0JvbWIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIGZvciBjb2xsaXNpb25zIGJldHdlZW4gdmFyaW91cyBnYW1lIG9iamVjdHMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBjaGVja0NvbGxpc2lvbnMoKSB7XG4gICAgICAgIGNvbnN0IHRpbGVTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnRpbGVTaXplO1xuXG4gICAgICAgIC8vIFBsYXllci1FeHBsb3Npb24gY29sbGlzaW9uXG4gICAgICAgIHRoaXMucGxheWVycy5mb3JFYWNoKHBsYXllciA9PiB7XG4gICAgICAgICAgICBpZiAocGxheWVyLmlzRGVhZCB8fCBwbGF5ZXIuaW1tdW5lVGltZXIgPiAwKSByZXR1cm47IC8vIFNraXAgZGVhZCBvciBpbW11bmUgcGxheWVyc1xuICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zLmZvckVhY2goZXhwbG9zaW9uID0+IHtcbiAgICAgICAgICAgICAgICBpZiAocGxheWVyLmNvbGxpZGVzV2l0aChleHBsb3Npb24pKSB7XG4gICAgICAgICAgICAgICAgICAgIHBsYXllci50YWtlRGFtYWdlKHRoaXMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBQbGF5ZXItUG93ZXJVcCBjb2xsaXNpb25cbiAgICAgICAgdGhpcy5wbGF5ZXJzLmZvckVhY2gocGxheWVyID0+IHtcbiAgICAgICAgICAgIGlmIChwbGF5ZXIuaXNEZWFkKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBwbGF5ZXJUaWxlID0gcGxheWVyLmdldFRpbGVQb3ModGlsZVNpemUpO1xuICAgICAgICAgICAgY29uc3QgbWFwVGlsZSA9IHRoaXMubWFwW3BsYXllclRpbGUucm93XVtwbGF5ZXJUaWxlLmNvbF07XG4gICAgICAgICAgICBpZiAobWFwVGlsZS50eXBlID09PSBUaWxlVHlwZS5FTVBUWSAmJiBtYXBUaWxlLmhhc1Bvd2VyVXAgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBwbGF5ZXIuYXBwbHlQb3dlclVwKG1hcFRpbGUuaGFzUG93ZXJVcCwgdGhpcyk7XG4gICAgICAgICAgICAgICAgbWFwVGlsZS5oYXNQb3dlclVwID0gbnVsbDsgLy8gUG93ZXItdXAgY29sbGVjdGVkXG4gICAgICAgICAgICAgICAgbWFwVGlsZS5pbWFnZU5hbWUgPSAnZW1wdHlfdGlsZSc7IC8vIFVwZGF0ZSB0aWxlIGltYWdlIGFmdGVyIGNvbGxlY3Rpb25cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlcnMgYW4gZXhwbG9zaW9uIG9yaWdpbmF0aW5nIGZyb20gYSBnaXZlbiBib21iLlxuICAgICAqIEhhbmRsZXMgZXhwbG9zaW9uIHByb3BhZ2F0aW9uLCBibG9jayBkZXN0cnVjdGlvbiwgYW5kIGNoYWluIHJlYWN0aW9ucy5cbiAgICAgKiBAcGFyYW0gYm9tYiBUaGUgYm9tYiB0aGF0IGlzIGV4cGxvZGluZy5cbiAgICAgKi9cbiAgICBwdWJsaWMgdHJpZ2dlckV4cGxvc2lvbihib21iOiBCb21iKSB7XG4gICAgICAgIHRoaXMuc291bmRNYW5hZ2VyLnBsYXlTb3VuZCgnZXhwbG9zaW9uJyk7XG5cbiAgICAgICAgY29uc3QgdGlsZVNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemU7XG4gICAgICAgIGNvbnN0IGJvbWJUaWxlID0gYm9tYi5nZXRUaWxlUG9zKHRpbGVTaXplKTtcbiAgICAgICAgY29uc3QgbWFwV2lkdGggPSB0aGlzLmNvbmZpZy5tYXBTZXR0aW5ncy5tYXBXaWR0aDtcbiAgICAgICAgY29uc3QgbWFwSGVpZ2h0ID0gdGhpcy5jb25maWcubWFwU2V0dGluZ3MubWFwSGVpZ2h0O1xuXG4gICAgICAgIC8vIFJlbGVhc2UgYm9tYiBjb3VudCBmb3IgdGhlIG93bmVyIG9mIHRoZSBib21iXG4gICAgICAgIGNvbnN0IG93bmVyID0gdGhpcy5wbGF5ZXJzLmZpbmQocCA9PiBwLmlkID09PSBib21iLm93bmVySWQpO1xuICAgICAgICBpZiAob3duZXIpIHtcbiAgICAgICAgICAgIG93bmVyLmN1cnJlbnRCb21icy0tO1xuICAgICAgICAgICAgaWYgKG93bmVyLmN1cnJlbnRCb21icyA8IDApIG93bmVyLmN1cnJlbnRCb21icyA9IDA7IC8vIFNhbml0eSBjaGVja1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBleHBsb2RpbmcgYm9tYiBmcm9tIHRoZSBhY3RpdmUgYm9tYnMgbGlzdFxuICAgICAgICB0aGlzLmJvbWJzID0gdGhpcy5ib21icy5maWx0ZXIoYiA9PiBiICE9PSBib21iKTtcblxuICAgICAgICAvLyBDcmVhdGUgdGhlIGNlbnRlciBleHBsb3Npb24gc3ByaXRlXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucy5wdXNoKG5ldyBFeHBsb3Npb24oXG4gICAgICAgICAgICBib21iVGlsZS5jb2wgKiB0aWxlU2l6ZSwgYm9tYlRpbGUucm93ICogdGlsZVNpemUsXG4gICAgICAgICAgICB0aWxlU2l6ZSwgdGlsZVNpemUsICdleHBsb3Npb25fY2VudGVyJywgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmV4cGxvc2lvbkR1cmF0aW9uLCB0cnVlXG4gICAgICAgICkpO1xuXG4gICAgICAgIC8vIFNwcmVhZCBleHBsb3Npb24gaW4gNCBjYXJkaW5hbCBkaXJlY3Rpb25zXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbnMgPSBbXG4gICAgICAgICAgICB7IGRyOiAwLCBkYzogMSwgaXNWZXJ0aWNhbDogZmFsc2UgfSwgLy8gUmlnaHRcbiAgICAgICAgICAgIHsgZHI6IDAsIGRjOiAtMSwgaXNWZXJ0aWNhbDogZmFsc2UgfSwgLy8gTGVmdFxuICAgICAgICAgICAgeyBkcjogMSwgZGM6IDAsIGlzVmVydGljYWw6IHRydWUgfSwgIC8vIERvd25cbiAgICAgICAgICAgIHsgZHI6IC0xLCBkYzogMCwgaXNWZXJ0aWNhbDogdHJ1ZSB9ICAgLy8gVXBcbiAgICAgICAgXTtcblxuICAgICAgICBkaXJlY3Rpb25zLmZvckVhY2goZGlyID0+IHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDw9IGJvbWIucmFuZ2U7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFJvdyA9IGJvbWJUaWxlLnJvdyArIGRpci5kciAqIGk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0Q29sID0gYm9tYlRpbGUuY29sICsgZGlyLmRjICogaTtcblxuICAgICAgICAgICAgICAgIC8vIENoZWNrIG1hcCBib3VuZGFyaWVzXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldFJvdyA8IDAgfHwgdGFyZ2V0Um93ID49IG1hcEhlaWdodCB8fCB0YXJnZXRDb2wgPCAwIHx8IHRhcmdldENvbCA+PSBtYXBXaWR0aCkgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRUaWxlID0gdGhpcy5tYXBbdGFyZ2V0Um93XVt0YXJnZXRDb2xdO1xuXG4gICAgICAgICAgICAgICAgLy8gU29saWQgYmxvY2tzIHN0b3AgZXhwbG9zaW9uc1xuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRUaWxlLnR5cGUgPT09IFRpbGVUeXBlLlNPTElEKSBicmVhaztcblxuICAgICAgICAgICAgICAgIGxldCBleHBsb3Npb25JbWFnZU5hbWUgPSBkaXIuaXNWZXJ0aWNhbCA/ICdleHBsb3Npb25fdmVydGljYWwnIDogJ2V4cGxvc2lvbl9ob3Jpem9udGFsJztcbiAgICAgICAgICAgICAgICAvLyBVc2UgZW5kIGNhcCBpbWFnZSBmb3IgdGhlIGxhc3Qgc2VnbWVudCBvciBpZiBpdCBoaXRzIGEgYnJlYWthYmxlIGJsb2NrXG4gICAgICAgICAgICAgICAgaWYgKGkgPT09IGJvbWIucmFuZ2UgfHwgdGFyZ2V0VGlsZS50eXBlID09PSBUaWxlVHlwZS5CUkVBS0FCTEUpIHtcbiAgICAgICAgICAgICAgICAgICAgZXhwbG9zaW9uSW1hZ2VOYW1lID0gZGlyLmlzVmVydGljYWwgPyAnZXhwbG9zaW9uX2VuZF92ZXJ0aWNhbCcgOiAnZXhwbG9zaW9uX2VuZF9ob3Jpem9udGFsJztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBZGQgZXhwbG9zaW9uIHNlZ21lbnRcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRDb2wgKiB0aWxlU2l6ZSwgdGFyZ2V0Um93ICogdGlsZVNpemUsXG4gICAgICAgICAgICAgICAgICAgIHRpbGVTaXplLCB0aWxlU2l6ZSwgZXhwbG9zaW9uSW1hZ2VOYW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZXhwbG9zaW9uRHVyYXRpb24sIGZhbHNlLCBkaXIuaXNWZXJ0aWNhbCwgaSA9PT0gYm9tYi5yYW5nZVxuICAgICAgICAgICAgICAgICkpO1xuXG4gICAgICAgICAgICAgICAgLy8gSWYgaXQgaGl0cyBhIGJyZWFrYWJsZSBibG9jaywgZGVzdHJveSBpdCBhbmQgc3RvcCBzcHJlYWRpbmcgaW4gdGhpcyBkaXJlY3Rpb25cbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0VGlsZS50eXBlID09PSBUaWxlVHlwZS5CUkVBS0FCTEUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kZXN0cm95QmxvY2sodGFyZ2V0Um93LCB0YXJnZXRDb2wpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBJZiBpdCBoaXRzIGFub3RoZXIgYm9tYiwgdHJpZ2dlciB0aGF0IGJvbWIgaW1tZWRpYXRlbHlcbiAgICAgICAgICAgICAgICBjb25zdCBoaXRCb21iID0gdGhpcy5ib21icy5maW5kKGIgPT5cbiAgICAgICAgICAgICAgICAgICAgYi5nZXRUaWxlUG9zKHRpbGVTaXplKS5yb3cgPT09IHRhcmdldFJvdyAmJiBiLmdldFRpbGVQb3ModGlsZVNpemUpLmNvbCA9PT0gdGFyZ2V0Q29sXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoaGl0Qm9tYikge1xuICAgICAgICAgICAgICAgICAgICBoaXRCb21iLnRpbWVyID0gMDsgLy8gU2V0IHRpbWVyIHRvIDAgdG8gdHJpZ2dlciBpdHMgZXhwbG9zaW9uIGluIHRoZSBuZXh0IHVwZGF0ZSBjeWNsZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVzdHJveXMgYSBicmVha2FibGUgYmxvY2sgYXQgdGhlIGdpdmVuIG1hcCBjb29yZGluYXRlcy5cbiAgICAgKiBNYXkgZHJvcCBhIHBvd2VyLXVwLlxuICAgICAqIEBwYXJhbSByb3cgUm93IG9mIHRoZSBibG9jay5cbiAgICAgKiBAcGFyYW0gY29sIENvbHVtbiBvZiB0aGUgYmxvY2suXG4gICAgICovXG4gICAgcHJpdmF0ZSBkZXN0cm95QmxvY2socm93OiBudW1iZXIsIGNvbDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMubWFwW3Jvd11bY29sXS50eXBlID0gVGlsZVR5cGUuRU1QVFk7XG4gICAgICAgIHRoaXMubWFwW3Jvd11bY29sXS5pbWFnZU5hbWUgPSAnZW1wdHlfdGlsZSc7XG4gICAgICAgIHRoaXMuc291bmRNYW5hZ2VyLnBsYXlTb3VuZCgnYmxvY2tfYnJlYWsnKTtcblxuICAgICAgICAvLyBDaGFuY2UgdG8gZHJvcCBwb3dlci11cFxuICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA8IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wb3dlclVwRHJvcENoYW5jZSkge1xuICAgICAgICAgICAgY29uc3QgcG93ZXJVcFR5cGVzID0gW1Bvd2VyVXBUeXBlLkJPTUJfVVAsIFBvd2VyVXBUeXBlLlJBTkdFX1VQLCBQb3dlclVwVHlwZS5TUEVFRF9VUF07XG4gICAgICAgICAgICBjb25zdCByYW5kb21Qb3dlclVwID0gcG93ZXJVcFR5cGVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHBvd2VyVXBUeXBlcy5sZW5ndGgpXTtcbiAgICAgICAgICAgIHRoaXMubWFwW3Jvd11bY29sXS5oYXNQb3dlclVwID0gcmFuZG9tUG93ZXJVcDtcbiAgICAgICAgICAgIHRoaXMubWFwW3Jvd11bY29sXS5pbWFnZU5hbWUgPSB0aGlzLmdldFBvd2VyVXBJbWFnZU5hbWUocmFuZG9tUG93ZXJVcCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBhcHByb3ByaWF0ZSBpbWFnZSBuYW1lIGZvciBhIGdpdmVuIFBvd2VyVXBUeXBlLlxuICAgICAqIEBwYXJhbSB0eXBlIFRoZSB0eXBlIG9mIHBvd2VyLXVwLlxuICAgICAqIEByZXR1cm5zIFRoZSBpbWFnZSBuYW1lIHN0cmluZy5cbiAgICAgKi9cbiAgICBwcml2YXRlIGdldFBvd2VyVXBJbWFnZU5hbWUodHlwZTogUG93ZXJVcFR5cGUpOiBzdHJpbmcge1xuICAgICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgUG93ZXJVcFR5cGUuQk9NQl9VUDogcmV0dXJuICdwb3dlcnVwX2JvbWInO1xuICAgICAgICAgICAgY2FzZSBQb3dlclVwVHlwZS5SQU5HRV9VUDogcmV0dXJuICdwb3dlcnVwX3JhbmdlJztcbiAgICAgICAgICAgIGNhc2UgUG93ZXJVcFR5cGUuU1BFRURfVVA6IHJldHVybiAncG93ZXJ1cF9zcGVlZCc7XG4gICAgICAgICAgICBkZWZhdWx0OiByZXR1cm4gJ2VtcHR5X3RpbGUnOyAvLyBGYWxsYmFja1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIGlmIHRoZSBnYW1lIHdpbiBvciBsb3NlIGNvbmRpdGlvbnMgaGF2ZSBiZWVuIG1ldC5cbiAgICAgKi9cbiAgICBwcml2YXRlIGNoZWNrR2FtZUVuZENvbmRpdGlvbigpIHtcbiAgICAgICAgY29uc3QgbGl2ZUh1bWFuUGxheWVycyA9IHRoaXMucGxheWVycy5maWx0ZXIocCA9PiAhcC5pc0FJICYmICFwLmlzRGVhZCk7XG4gICAgICAgIGNvbnN0IGxpdmVBSVBsYXllcnMgPSB0aGlzLnBsYXllcnMuZmlsdGVyKHAgPT4gcC5pc0FJICYmICFwLmlzRGVhZCk7XG5cbiAgICAgICAgaWYgKGxpdmVIdW1hblBsYXllcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmNoYW5nZVN0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRSk7XG4gICAgICAgIH0gZWxzZSBpZiAobGl2ZUFJUGxheWVycy5sZW5ndGggPT09IDAgJiYgdGhpcy5odW1hblBsYXllcnNDb3VudCA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuY2hhbmdlU3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVuZGVycyBhbGwgZ2FtZSBlbGVtZW50cyBiYXNlZCBvbiB0aGUgY3VycmVudCBnYW1lIHN0YXRlLlxuICAgICAqL1xuICAgIHByaXZhdGUgcmVuZGVyKCkge1xuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGl0bGVTY3JlZW4oKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZVBsYXlpbmcoKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU46XG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4odHJ1ZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRTpcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbihmYWxzZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3cyB0aGUgdGl0bGUgc2NyZWVuLlxuICAgICAqL1xuICAgIHByaXZhdGUgZHJhd1RpdGxlU2NyZWVuKCkge1xuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcblxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQ4cHggQXJpYWwnOyAvLyBVc2luZyBBcmlhbCBhcyBhIGNvbW1vbiBmb250LiBDb3VsZCBiZSAnUHJlc3MgU3RhcnQgMlAnIGZvciBwaXhlbCBhcnQgc3R5bGUgaWYgbG9hZGVkLlxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGV4dC50aXRsZVNjcmVlblswXSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xuXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdQcmVzcyBhbnkga2V5IHRvIHN0YXJ0JywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xuXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMTZweCBBcmlhbCc7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdBIENyYXp5IEJvbWJlciBGYW4gR2FtZScsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gMzApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERyYXdzIHRoZSBnYW1lIGluc3RydWN0aW9ucyBzY3JlZW4uXG4gICAgICovXG4gICAgcHJpdmF0ZSBkcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCkge1xuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcblxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzM2cHggQXJpYWwnO1xuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ0hvdyB0byBQbGF5JywgdGhpcy5jYW52YXMud2lkdGggLyAyLCA4MCk7XG5cbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyMHB4IEFyaWFsJztcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xuICAgICAgICBsZXQgeU9mZnNldCA9IDE1MDtcbiAgICAgICAgdGhpcy5jb25maWcudGV4dC5pbnN0cnVjdGlvbnNTY3JlZW4uZm9yRWFjaChsaW5lID0+IHtcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGxpbmUsIHRoaXMuY2FudmFzLndpZHRoIC8gNCwgeU9mZnNldCk7XG4gICAgICAgICAgICB5T2Zmc2V0ICs9IDMwO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1ByZXNzIGFueSBrZXkgdG8gY29udGludWUuLi4nLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAtIDgwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3cyB0aGUgbWFpbiBnYW1lIHBsYXlpbmcgc2NyZWVuLCBpbmNsdWRpbmcgbWFwLCBwbGF5ZXJzLCBib21icywgZXhwbG9zaW9ucywgYW5kIFVJLlxuICAgICAqL1xuICAgIHByaXZhdGUgZHJhd0dhbWVQbGF5aW5nKCkge1xuICAgICAgICBjb25zdCB0aWxlU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZTtcblxuICAgICAgICAvLyBEcmF3IG1hcCB0aWxlc1xuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IHRoaXMubWFwLmxlbmd0aDsgcisrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IHRoaXMubWFwW3JdLmxlbmd0aDsgYysrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGlsZSA9IHRoaXMubWFwW3JdW2NdO1xuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IHRoaXMuaW1hZ2VzLmdldCh0aWxlLmltYWdlTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKGltZykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoaW1nLCBjICogdGlsZVNpemUsIHIgKiB0aWxlU2l6ZSwgdGlsZVNpemUsIHRpbGVTaXplKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBGYWxsYmFjayBjb2xvcnMgZm9yIGRlYnVnZ2luZyBpZiBpbWFnZXMgYXJlIG1pc3NpbmdcbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoICh0aWxlLnR5cGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgVGlsZVR5cGUuRU1QVFk6IHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjMDA2NDAwJzsgYnJlYWs7IC8vIERhcmsgR3JlZW5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgVGlsZVR5cGUuU09MSUQ6IHRoaXMuY3R4LmZpbGxTdHlsZSA9ICcjNjk2OTY5JzsgYnJlYWs7IC8vIERpbSBHcmF5XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlIFRpbGVUeXBlLkJSRUFLQUJMRTogdGhpcy5jdHguZmlsbFN0eWxlID0gJyM4QjQ1MTMnOyBicmVhazsgLy8gU2FkZGxlIEJyb3duXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYyAqIHRpbGVTaXplLCByICogdGlsZVNpemUsIHRpbGVTaXplLCB0aWxlU2l6ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRHJhdyBib21ic1xuICAgICAgICB0aGlzLmJvbWJzLmZvckVhY2goYm9tYiA9PiBib21iLmRyYXcodGhpcy5jdHgsIHRoaXMuaW1hZ2VzLCB0aWxlU2l6ZSkpO1xuXG4gICAgICAgIC8vIERyYXcgcGxheWVyc1xuICAgICAgICB0aGlzLnBsYXllcnMuZm9yRWFjaChwbGF5ZXIgPT4gcGxheWVyLmRyYXcodGhpcy5jdHgsIHRoaXMuaW1hZ2VzLCB0aWxlU2l6ZSkpO1xuXG4gICAgICAgIC8vIERyYXcgZXhwbG9zaW9ucyAob24gdG9wIG9mIGV2ZXJ5dGhpbmcgZWxzZSBmb3IgdmlzdWFsIHByaW9yaXR5KVxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMuZm9yRWFjaChleHBsb3Npb24gPT4gZXhwbG9zaW9uLmRyYXcodGhpcy5jdHgsIHRoaXMuaW1hZ2VzLCB0aWxlU2l6ZSkpO1xuXG4gICAgICAgIC8vIERyYXcgVUkgLSBQbGF5ZXIgbGl2ZXMsIGJvbWIgY291bnRzLCByYW5nZVxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzE2cHggQXJpYWwnO1xuICAgICAgICBsZXQgdWlZID0gdGhpcy5jYW52YXMuaGVpZ2h0IC0gMjA7XG4gICAgICAgIGxldCB1aVggPSAxMDtcbiAgICAgICAgdGhpcy5wbGF5ZXJzLmZpbHRlcihwID0+ICFwLmlzQUkpLmZvckVhY2gocGxheWVyID0+IHsgLy8gT25seSBzaG93IFVJIGZvciBodW1hbiBwbGF5ZXJzXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgUCR7cGxheWVyLmlkfSBMaXZlczogJHtwbGF5ZXIubGl2ZXN9IEJvbWJzOiAke3BsYXllci5jdXJyZW50Qm9tYnN9LyR7cGxheWVyLm1heEJvbWJzfSBSYW5nZTogJHtwbGF5ZXIuYm9tYlJhbmdlfWAsIHVpWCwgdWlZKTtcbiAgICAgICAgICAgIHVpWCArPSAyNTA7IC8vIE9mZnNldCBmb3IgbmV4dCBwbGF5ZXIncyBVSSBpZiBtdWx0aXBsZSBodW1hbiBwbGF5ZXJzXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIERyYXcgc291bmQgdG9nZ2xlIGJ1dHRvblxuICAgICAgICBjb25zdCBidXR0b25TaXplID0gMzA7XG4gICAgICAgIGNvbnN0IHBhZGRpbmcgPSAxMDtcbiAgICAgICAgY29uc3QgYnRuWCA9IHRoaXMuY2FudmFzLndpZHRoIC0gYnV0dG9uU2l6ZSAtIHBhZGRpbmc7XG4gICAgICAgIGNvbnN0IGJ0blkgPSBwYWRkaW5nO1xuICAgICAgICBjb25zdCBzb3VuZEltZ05hbWUgPSB0aGlzLnNvdW5kTWFuYWdlci5zb3VuZE9uID8gJ2ljb25fc291bmRfb24nIDogJ2ljb25fc291bmRfb2ZmJztcbiAgICAgICAgY29uc3Qgc291bmRJbWcgPSB0aGlzLmltYWdlcy5nZXQoc291bmRJbWdOYW1lKTtcbiAgICAgICAgaWYgKHNvdW5kSW1nKSB7XG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2Uoc291bmRJbWcsIGJ0blgsIGJ0blksIGJ1dHRvblNpemUsIGJ1dHRvblNpemUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gRmFsbGJhY2sgZm9yIHNvdW5kIGJ1dHRvbiBpZiBpbWFnZXMgYXJlIG1pc3NpbmdcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuc291bmRNYW5hZ2VyLnNvdW5kT24gPyAnZ3JlZW4nIDogJ3JlZCc7XG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChidG5YLCBidG5ZLCBidXR0b25TaXplLCBidXR0b25TaXplKTtcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XG4gICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gJzEwcHggQXJpYWwnO1xuICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLnNvdW5kTWFuYWdlci5zb3VuZE9uID8gJ09OJyA6ICdPRkYnLCBidG5YICsgYnV0dG9uU2l6ZSAvIDIsIGJ0blkgKyBidXR0b25TaXplIC8gMiArIDQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRHJhd3MgdGhlIGdhbWUgb3ZlciBzY3JlZW4gKHdpbiBvciBsb3NlKS5cbiAgICAgKiBAcGFyYW0gd2luIFRydWUgaWYgdGhlIHBsYXllciB3b24sIGZhbHNlIGlmIGxvc3QuXG4gICAgICovXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4od2luOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnNDhweCBBcmlhbCc7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICAgICAgICBjb25zdCBtZXNzYWdlID0gd2luID8gdGhpcy5jb25maWcudGV4dC5nYW1lT3ZlcldpblswXSA6IHRoaXMuY29uZmlnLnRleHQuZ2FtZU92ZXJMb3NlWzBdO1xuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChtZXNzYWdlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XG5cbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1ByZXNzIEVudGVyIHRvIHJlc3RhcnQnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XG4gICAgfVxuXG4gICAgLy8gLS0tIE1hcCBHZW5lcmF0aW9uICYgUGxheWVyIFNwYXduaW5nIC0tLVxuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGEgbmV3IGdhbWUgbWFwIGJhc2VkIG9uIGNvbmZpZ3VyYXRpb24uXG4gICAgICogQHJldHVybnMgVGhlIGdlbmVyYXRlZCAyRCBUaWxlIGFycmF5LlxuICAgICAqL1xuICAgIHByaXZhdGUgZ2VuZXJhdGVNYXAoKTogVGlsZVtdW10ge1xuICAgICAgICBjb25zdCB7IG1hcFdpZHRoLCBtYXBIZWlnaHQgfSA9IHRoaXMuY29uZmlnLm1hcFNldHRpbmdzO1xuICAgICAgICBjb25zdCB7IGJyZWFrYWJsZUJsb2NrRGVuc2l0eSB9ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzO1xuICAgICAgICBjb25zdCBtYXA6IFRpbGVbXVtdID0gW107XG5cbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCBtYXBIZWlnaHQ7IHIrKykge1xuICAgICAgICAgICAgbWFwW3JdID0gW107XG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IG1hcFdpZHRoOyBjKyspIHtcbiAgICAgICAgICAgICAgICBpZiAociA9PT0gMCB8fCByID09PSBtYXBIZWlnaHQgLSAxIHx8IGMgPT09IDAgfHwgYyA9PT0gbWFwV2lkdGggLSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE91dGVyIHBlcmltZXRlciBpcyBzb2xpZCBibG9ja3NcbiAgICAgICAgICAgICAgICAgICAgbWFwW3JdW2NdID0gbmV3IFRpbGUoVGlsZVR5cGUuU09MSUQsICdzb2xpZF9ibG9jaycpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAociAlIDIgPT09IDAgJiYgYyAlIDIgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRml4ZWQgZ3JpZCBvZiBzb2xpZCBibG9ja3NcbiAgICAgICAgICAgICAgICAgICAgbWFwW3JdW2NdID0gbmV3IFRpbGUoVGlsZVR5cGUuU09MSUQsICdzb2xpZF9ibG9jaycpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFJhbmRvbWx5IHBsYWNlIGJyZWFrYWJsZSBibG9ja3NcbiAgICAgICAgICAgICAgICAgICAgaWYgKE1hdGgucmFuZG9tKCkgPCBicmVha2FibGVCbG9ja0RlbnNpdHkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hcFtyXVtjXSA9IG5ldyBUaWxlKFRpbGVUeXBlLkJSRUFLQUJMRSwgJ2JyZWFrYWJsZV9ibG9jaycpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWFwW3JdW2NdID0gbmV3IFRpbGUoVGlsZVR5cGUuRU1QVFksICdlbXB0eV90aWxlJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTcGF3bnMgcGxheWVycyAoaHVtYW4gYW5kIEFJKSBhdCBkZXNpZ25hdGVkIHN0YXJ0aW5nIHBvaW50cyBhbmQgY2xlYXJzIHN1cnJvdW5kaW5nIHRpbGVzLlxuICAgICAqL1xuICAgIHByaXZhdGUgc3Bhd25QbGF5ZXJzKCkge1xuICAgICAgICB0aGlzLnBsYXllcnMgPSBbXTtcbiAgICAgICAgdGhpcy5odW1hblBsYXllcnNDb3VudCA9IDA7XG4gICAgICAgIHRoaXMuYWlQbGF5ZXJzQ291bnQgPSAwO1xuICAgICAgICBjb25zdCB7IHRpbGVTaXplLCBwbGF5ZXJTcGVlZCwgYWlDb3VudCB9ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzO1xuICAgICAgICBjb25zdCBtYXBIZWlnaHQgPSB0aGlzLm1hcC5sZW5ndGg7XG4gICAgICAgIGNvbnN0IG1hcFdpZHRoID0gdGhpcy5tYXBbMF0ubGVuZ3RoO1xuXG4gICAgICAgIC8vIERlZmluZSBwb3RlbnRpYWwgc3Bhd24gcG9pbnRzIChjb3JuZXJzKVxuICAgICAgICBjb25zdCBzcGF3blBvaW50czogVGlsZVBvc2l0aW9uW10gPSBbXG4gICAgICAgICAgICB7IHJvdzogMSwgY29sOiAxIH0sXG4gICAgICAgICAgICB7IHJvdzogbWFwSGVpZ2h0IC0gMiwgY29sOiBtYXBXaWR0aCAtIDIgfSxcbiAgICAgICAgICAgIHsgcm93OiAxLCBjb2w6IG1hcFdpZHRoIC0gMiB9LFxuICAgICAgICAgICAgeyByb3c6IG1hcEhlaWdodCAtIDIsIGNvbDogMSB9XG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gRW5zdXJlIHNwYXduIHBvaW50cyBhbmQgdGhlaXIgaW1tZWRpYXRlIG5laWdoYm9ycyBhcmUgY2xlYXIgZm9yIG1vdmVtZW50IGFuZCBib21iIHBsYWNlbWVudFxuICAgICAgICBzcGF3blBvaW50cy5mb3JFYWNoKHBvcyA9PiB7XG4gICAgICAgICAgICBmb3IgKGxldCBkciA9IC0xOyBkciA8PSAxOyBkcisrKSB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgZGMgPSAtMTsgZGMgPD0gMTsgZGMrKykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCByID0gcG9zLnJvdyArIGRyO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjID0gcG9zLmNvbCArIGRjO1xuICAgICAgICAgICAgICAgICAgICBpZiAociA+PSAwICYmIHIgPCBtYXBIZWlnaHQgJiYgYyA+PSAwICYmIGMgPCBtYXBXaWR0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5tYXBbcl1bY10gPSBuZXcgVGlsZShUaWxlVHlwZS5FTVBUWSwgJ2VtcHR5X3RpbGUnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gU3Bhd24gUGxheWVyIDEgKGh1bWFuKVxuICAgICAgICBjb25zdCBwbGF5ZXIxU3Bhd24gPSBzcGF3blBvaW50cy5zaGlmdCgpITsgLy8gR2V0IGZpcnN0IHNwYXduIHBvaW50XG4gICAgICAgIHRoaXMucGxheWVyMSA9IG5ldyBQbGF5ZXIoXG4gICAgICAgICAgICAxLFxuICAgICAgICAgICAgcGxheWVyMVNwYXduLmNvbCAqIHRpbGVTaXplLFxuICAgICAgICAgICAgcGxheWVyMVNwYXduLnJvdyAqIHRpbGVTaXplLFxuICAgICAgICAgICAgdGlsZVNpemUsIHRpbGVTaXplLFxuICAgICAgICAgICAgJ3BsYXllcjEnLCBwbGF5ZXJTcGVlZCwgdGlsZVNpemUsIHRoaXMuY29uZmlnLCBmYWxzZVxuICAgICAgICApO1xuICAgICAgICB0aGlzLnBsYXllcnMucHVzaCh0aGlzLnBsYXllcjEpO1xuICAgICAgICB0aGlzLmh1bWFuUGxheWVyc0NvdW50Kys7XG5cbiAgICAgICAgLy8gU3Bhd24gQUkgcGxheWVyc1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFpQ291bnQ7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNwYXduUG9pbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignTm90IGVub3VnaCBzcGF3biBwb2ludHMgZm9yIGFsbCBBSSBwbGF5ZXJzLicpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYWlTcGF3biA9IHNwYXduUG9pbnRzLnNoaWZ0KCkhOyAvLyBHZXQgbmV4dCBhdmFpbGFibGUgc3Bhd24gcG9pbnRcbiAgICAgICAgICAgIHRoaXMucGxheWVycy5wdXNoKG5ldyBQbGF5ZXIoXG4gICAgICAgICAgICAgICAgaSArIDIsIC8vIFVuaXF1ZSBJRCBmb3IgQUkgcGxheWVyc1xuICAgICAgICAgICAgICAgIGFpU3Bhd24uY29sICogdGlsZVNpemUsXG4gICAgICAgICAgICAgICAgYWlTcGF3bi5yb3cgKiB0aWxlU2l6ZSxcbiAgICAgICAgICAgICAgICB0aWxlU2l6ZSwgdGlsZVNpemUsXG4gICAgICAgICAgICAgICAgYHBsYXllciR7aSArIDJ9YCwgLy8gZS5nLiwgJ3BsYXllcjInLCAncGxheWVyMycgZm9yIEFJIGltYWdlc1xuICAgICAgICAgICAgICAgIHBsYXllclNwZWVkLCB0aWxlU2l6ZSwgdGhpcy5jb25maWcsIHRydWVcbiAgICAgICAgICAgICkpO1xuICAgICAgICAgICAgdGhpcy5haVBsYXllcnNDb3VudCsrO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBHbG9iYWwgaW5zdGFuY2UgYW5kIGluaXRpYWxpemF0aW9uXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuICAgIGNvbnN0IGdhbWUgPSBuZXcgR2FtZSgnZ2FtZUNhbnZhcycpO1xuICAgIGdhbWUuaW5pdCgnZGF0YS5qc29uJyk7IC8vIFN0YXJ0IHRoZSBnYW1lIHdpdGggY29uZmlndXJhdGlvbiBmcm9tIGRhdGEuanNvblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFtRkEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUxDLFNBQUFBO0FBQUEsR0FBQTtBQVdMLElBQUssV0FBTCxrQkFBS0MsY0FBTDtBQUNJLEVBQUFBLG9CQUFBO0FBQ0EsRUFBQUEsb0JBQUE7QUFDQSxFQUFBQSxvQkFBQTtBQUhDLFNBQUFBO0FBQUEsR0FBQTtBQVNMLElBQUssY0FBTCxrQkFBS0MsaUJBQUw7QUFDSSxFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBQ0EsRUFBQUEsMEJBQUE7QUFIQyxTQUFBQTtBQUFBLEdBQUE7QUFXTCxNQUFNLFlBQVk7QUFBQSxFQVFkLFlBQVksUUFBb0I7QUFQaEMsU0FBUSxTQUF3QyxvQkFBSSxJQUFJO0FBQ3hELFNBQVEsU0FBd0Msb0JBQUksSUFBSTtBQUN4RCxTQUFRLGNBQWM7QUFDdEIsU0FBUSxlQUFlO0FBRXZCLFNBQVEsYUFBa0Q7QUFHdEQsU0FBSyxTQUFTO0FBQ2Qs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QUFBQSxNQUNmO0FBQUEsTUFDQSxhQUFhLE1BQU07QUFBQSxNQUNuQixhQUFhLE1BQU07QUFBQSxNQUNuQjtBQUFBLE1BQVU7QUFBQSxNQUNWO0FBQUEsTUFBVztBQUFBLE1BQWE7QUFBQSxNQUFVLEtBQUs7QUFBQSxNQUFRO0FBQUEsSUFDbkQ7QUFDQSxTQUFLLFFBQVEsS0FBSyxLQUFLLE9BQU87QUFDOUIsU0FBSztBQUdMLGFBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxLQUFLO0FBQzlCLFVBQUksWUFBWSxXQUFXLEdBQUc7QUFDMUIsZ0JBQVEsS0FBSyw2Q0FBNkM7QUFDMUQ7QUFBQSxNQUNKO0FBQ0EsWUFBTSxVQUFVLFlBQVksTUFBTTtBQUNsQyxXQUFLLFFBQVEsS0FBSyxJQUFJO0FBQUEsUUFDbEIsSUFBSTtBQUFBO0FBQUEsUUFDSixRQUFRLE1BQU07QUFBQSxRQUNkLFFBQVEsTUFBTTtBQUFBLFFBQ2Q7QUFBQSxRQUFVO0FBQUEsUUFDVixTQUFTLElBQUksQ0FBQztBQUFBO0FBQUEsUUFDZDtBQUFBLFFBQWE7QUFBQSxRQUFVLEtBQUs7QUFBQSxRQUFRO0FBQUEsTUFDeEMsQ0FBQztBQUNELFdBQUs7QUFBQSxJQUNUO0FBQUEsRUFDSjtBQUNKO0FBR0EsU0FBUyxpQkFBaUIsb0JBQW9CLE1BQU07QUFDaEQsUUFBTUEsUUFBTyxJQUFJLEtBQUssWUFBWTtBQUNsQyxFQUFBQSxNQUFLLEtBQUssV0FBVztBQUN6QixDQUFDOyIsCiAgIm5hbWVzIjogWyJHYW1lU3RhdGUiLCAiVGlsZVR5cGUiLCAiUG93ZXJVcFR5cGUiLCAiZ2FtZSJdCn0K
