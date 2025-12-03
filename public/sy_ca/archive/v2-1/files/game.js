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
    if (this.currentBombs < this.maxBombs) {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gZ2FtZS50c1xuLy8gVGhpcyBmaWxlIGNvbnRhaW5zIHRoZSBjb21wbGV0ZSBUeXBlU2NyaXB0IGNvZGUgZm9yIHRoZSBDcmF6eSBCb21iZXIgZ2FtZS5cbi8vIEl0IGlzIGRlc2lnbmVkIHRvIHJ1biBpbiBhIHdlYiBicm93c2VyLCBpbnRlcmFjdGluZyB3aXRoIGFuIEhUTUwgY2FudmFzIGVsZW1lbnQuXG5cbi8vIC0tLSBIZWxwZXIgSW50ZXJmYWNlcyBhbmQgRW51bXMgLS0tXG5cbi8qKlxuICogRGVmaW5lcyB0aGUgc3RydWN0dXJlIG9mIHRoZSBnYW1lJ3MgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb24uXG4gKi9cbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcbiAgICBnYW1lU2V0dGluZ3M6IHtcbiAgICAgICAgY2FudmFzV2lkdGg6IG51bWJlcjtcbiAgICAgICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XG4gICAgICAgIHRpbGVTaXplOiBudW1iZXI7XG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7IC8vIHBpeGVscyBwZXIgc2Vjb25kXG4gICAgICAgIGJvbWJGdXNlVGltZTogbnVtYmVyOyAvLyBzZWNvbmRzIHVudGlsIGJvbWIgZXhwbG9kZXNcbiAgICAgICAgZXhwbG9zaW9uRHVyYXRpb246IG51bWJlcjsgLy8gc2Vjb25kcyBleHBsb3Npb25zIHJlbWFpbiBhY3RpdmVcbiAgICAgICAgaW5pdGlhbEJvbWJSYW5nZTogbnVtYmVyOyAvLyB0aWxlc1xuICAgICAgICBpbml0aWFsTWF4Qm9tYnM6IG51bWJlcjtcbiAgICAgICAgaW5pdGlhbExpdmVzOiBudW1iZXI7XG4gICAgICAgIGFpQ291bnQ6IG51bWJlcjtcbiAgICAgICAgYnJlYWthYmxlQmxvY2tEZW5zaXR5OiBudW1iZXI7IC8vIDAgdG8gMSwgZGVuc2l0eSBvZiBicmVha2FibGUgYmxvY2tzIG9uIG1hcFxuICAgICAgICBwb3dlclVwRHJvcENoYW5jZTogbnVtYmVyOyAvLyAwIHRvIDEsIGNoYW5jZSBmb3IgcG93ZXItdXAgdG8gZHJvcCBmcm9tIGJyb2tlbiBibG9ja1xuICAgIH07XG4gICAgbWFwU2V0dGluZ3M6IHtcbiAgICAgICAgbWFwV2lkdGg6IG51bWJlcjsgLy8gaW4gdGlsZXNcbiAgICAgICAgbWFwSGVpZ2h0OiBudW1iZXI7IC8vIGluIHRpbGVzXG4gICAgfTtcbiAgICBhc3NldHM6IHtcbiAgICAgICAgaW1hZ2VzOiBBc3NldEltYWdlW107XG4gICAgICAgIHNvdW5kczogQXNzZXRTb3VuZFtdO1xuICAgIH07XG4gICAgdGV4dDoge1xuICAgICAgICB0aXRsZVNjcmVlbjogc3RyaW5nW107XG4gICAgICAgIGluc3RydWN0aW9uc1NjcmVlbjogc3RyaW5nW107XG4gICAgICAgIGdhbWVPdmVyV2luOiBzdHJpbmdbXTtcbiAgICAgICAgZ2FtZU92ZXJMb3NlOiBzdHJpbmdbXTtcbiAgICAgICAgc291bmRPbjogc3RyaW5nO1xuICAgICAgICBzb3VuZE9mZjogc3RyaW5nO1xuICAgIH07XG59XG5cbi8qKlxuICogRGVmaW5lcyB0aGUgc3RydWN0dXJlIGZvciBpbWFnZSBhc3NldHMuXG4gKi9cbmludGVyZmFjZSBBc3NldEltYWdlIHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG4gICAgaW1nPzogSFRNTEltYWdlRWxlbWVudDsgLy8gQWRkZWQgZHVyaW5nIGxvYWRpbmdcbn1cblxuLyoqXG4gKiBEZWZpbmVzIHRoZSBzdHJ1Y3R1cmUgZm9yIHNvdW5kIGFzc2V0cy5cbiAqL1xuaW50ZXJmYWNlIEFzc2V0U291bmQge1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBwYXRoOiBzdHJpbmc7XG4gICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xuICAgIHZvbHVtZTogbnVtYmVyO1xuICAgIGF1ZGlvPzogSFRNTEF1ZGlvRWxlbWVudDsgLy8gQWRkZWQgZHVyaW5nIGxvYWRpbmdcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIDJEIGNvb3JkaW5hdGVzLlxuICovXG5pbnRlcmZhY2UgQ29vcmRzIHtcbiAgICB4OiBudW1iZXI7XG4gICAgeTogbnVtYmVyO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgdGlsZSBncmlkIHBvc2l0aW9uIChyb3csIGNvbHVtbikuXG4gKi9cbmludGVyZmFjZSBUaWxlUG9zaXRpb24ge1xuICAgIHJvdzogbnVtYmVyO1xuICAgIGNvbDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEVudW0gZm9yIG1hbmFnaW5nIGRpZmZlcmVudCBnYW1lIHN0YXRlcy5cbiAqL1xuZW51bSBHYW1lU3RhdGUge1xuICAgIFRJVExFLFxuICAgIElOU1RSVUNUSU9OUyxcbiAgICBQTEFZSU5HLFxuICAgIEdBTUVfT1ZFUl9XSU4sXG4gICAgR0FNRV9PVkVSX0xPU0Vcbn1cblxuLyoqXG4gKiBFbnVtIGZvciBkaWZmZXJlbnQgdHlwZXMgb2YgbWFwIHRpbGVzLlxuICovXG5lbnVtIFRpbGVUeXBlIHtcbiAgICBFTVBUWSxcbiAgICBTT0xJRCxcbiAgICBCUkVBS0FCTEVcbn1cblxuLyoqXG4gKiBFbnVtIGZvciBkaWZmZXJlbnQgdHlwZXMgb2YgcG93ZXItdXBzLlxuICovXG5lbnVtIFBvd2VyVXBUeXBlIHtcbiAgICBCT01CX1VQLFxuICAgIFJBTkdFX1VQLFxuICAgIFNQRUVEX1VQXG59XG5cbi8vIC0tLSBBc3NldCBMb2FkZXIgQ2xhc3MgLS0tXG5cbi8qKlxuICogSGFuZGxlcyBsb2FkaW5nIG9mIGFsbCBpbWFnZSBhbmQgc291bmQgYXNzZXRzIGRlZmluZWQgaW4gdGhlIGdhbWUgY29uZmlnLlxuICovXG5jbGFzcyBBc3NldExvYWRlciB7XG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcbiAgICBwcml2YXRlIHRvdGFsQXNzZXRzID0gMDtcbiAgICBwcml2YXRlIGxvYWRlZEFzc2V0cyA9IDA7XG4gICAgcHJpdmF0ZSBjb25maWc6IEdhbWVDb25maWc7XG4gICAgcHJpdmF0ZSBvblByb2dyZXNzOiAoKHByb2dyZXNzOiBudW1iZXIpID0+IHZvaWQpIHwgbnVsbCA9IG51bGw7XG5cbiAgICBjb25zdHJ1Y3Rvcihjb25maWc6IEdhbWVDb25maWcpIHtcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgICAgIHRoaXMudG90YWxBc3NldHMgPSBjb25maWcuYXNzZXRzLmltYWdlcy5sZW5ndGggKyBjb25maWcuYXNzZXRzLnNvdW5kcy5sZW5ndGg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTG9hZHMgYWxsIGFzc2V0cy5cbiAgICAgKiBAcGFyYW0gb25Qcm9ncmVzcyBDYWxsYmFjayBmdW5jdGlvbiB0byByZXBvcnQgbG9hZGluZyBwcm9ncmVzcyAoMCB0byAxKS5cbiAgICAgKiBAcmV0dXJucyBBIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIG1hcHMgb2YgbG9hZGVkIGltYWdlcyBhbmQgc291bmRzLlxuICAgICAqL1xuICAgIHB1YmxpYyBhc3luYyBsb2FkKG9uUHJvZ3Jlc3M/OiAocHJvZ3Jlc3M6IG51bWJlcikgPT4gdm9pZCk6IFByb21pc2U8eyBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+LCBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+IH0+IHtcbiAgICAgICAgdGhpcy5vblByb2dyZXNzID0gb25Qcm9ncmVzcyB8fCBudWxsO1xuICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cyA9IDA7XG5cbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGltZ0RhdGEgPT4gdGhpcy5sb2FkSW1hZ2UoaW1nRGF0YSkpO1xuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc291bmREYXRhID0+IHRoaXMubG9hZFNvdW5kKHNvdW5kRGF0YSkpO1xuXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGltYWdlczogdGhpcy5pbWFnZXMsXG4gICAgICAgICAgICBzb3VuZHM6IHRoaXMuc291bmRzXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UoaW1nRGF0YTogQXNzZXRJbWFnZSk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XG4gICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuaW1hZ2VzLnNldChpbWdEYXRhLm5hbWUsIGltZyk7XG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRBc3NldHMrKztcbiAgICAgICAgICAgICAgICB0aGlzLnJlcG9ydFByb2dyZXNzKCk7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZ0RhdGEucGF0aH1gKTtcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrOyAvLyBTdGlsbCBpbmNyZW1lbnQgdG8gbm90IGJsb2NrIGxvYWRpbmdcbiAgICAgICAgICAgICAgICB0aGlzLnJlcG9ydFByb2dyZXNzKCk7XG4gICAgICAgICAgICAgICAgLy8gV2UgcmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIGFsbG93IHRoZSBnYW1lIHRvIHN0YXJ0IHdpdGggbWlzc2luZyBhc3NldHMsXG4gICAgICAgICAgICAgICAgLy8gdXNpbmcgZmFsbGJhY2sgZHJhd2luZy5cbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaW1nLnNyYyA9IGltZ0RhdGEucGF0aDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoc291bmREYXRhOiBBc3NldFNvdW5kKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmREYXRhLnBhdGgpO1xuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmREYXRhLnZvbHVtZTtcbiAgICAgICAgICAgIGF1ZGlvLmxvYWQoKTsgLy8gUHJlbG9hZCBhdWRpbyBtZXRhZGF0YVxuICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kRGF0YS5uYW1lLCBhdWRpbyk7XG4gICAgICAgICAgICB0aGlzLmxvYWRlZEFzc2V0cysrO1xuICAgICAgICAgICAgdGhpcy5yZXBvcnRQcm9ncmVzcygpO1xuICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGltbWVkaWF0ZWx5IGFzIGZ1bGwgYnVmZmVyaW5nIG1pZ2h0IGJlIHNsb3cgb3IgYmxvY2tlZFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlcG9ydFByb2dyZXNzKCkge1xuICAgICAgICBpZiAodGhpcy5vblByb2dyZXNzKSB7XG4gICAgICAgICAgICB0aGlzLm9uUHJvZ3Jlc3ModGhpcy5sb2FkZWRBc3NldHMgLyB0aGlzLnRvdGFsQXNzZXRzKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gLS0tIFNvdW5kIE1hbmFnZXIgQ2xhc3MgLS0tXG5cbi8qKlxuICogTWFuYWdlcyBwbGF5YmFjayBvZiBzb3VuZCBlZmZlY3RzIGFuZCBiYWNrZ3JvdW5kIG11c2ljLCBpbmNsdWRpbmcgYSBnbG9iYWwgdG9nZ2xlLlxuICovXG5jbGFzcyBTb3VuZE1hbmFnZXIge1xuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PjtcbiAgICBwcml2YXRlIGJhY2tncm91bmRNdXNpYzogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICAgIHB1YmxpYyBzb3VuZE9uOiBib29sZWFuID0gdHJ1ZTsgLy8gR2xvYmFsIHNvdW5kIHN0YXRlXG5cbiAgICBjb25zdHJ1Y3Rvcihzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+KSB7XG4gICAgICAgIHRoaXMuc291bmRzID0gc291bmRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGJhY2tncm91bmQgbXVzaWMgdG8gcGxheS5cbiAgICAgKiBAcGFyYW0gbmFtZSBUaGUgbmFtZSBvZiB0aGUgc291bmQgYXNzZXQgZm9yIEJHTS5cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0QmFja2dyb3VuZE11c2ljKG5hbWU6IHN0cmluZykge1xuICAgICAgICBpZiAodGhpcy5iYWNrZ3JvdW5kTXVzaWMpIHtcbiAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZE11c2ljLnBhdXNlKCk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgYmdtID0gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xuICAgICAgICBpZiAoYmdtKSB7XG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpYyA9IGJnbTtcbiAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZE11c2ljLmxvb3AgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWMudm9sdW1lID0gYmdtLnZvbHVtZTsgLy8gVXNlIHRoZSBpbml0aWFsIHZvbHVtZSBmcm9tIGNvbmZpZ1xuICAgICAgICAgICAgaWYgKHRoaXMuc291bmRPbikge1xuICAgICAgICAgICAgICAgICB0aGlzLnBsYXlCR00oKTsgLy8gVHJ5IHRvIHBsYXksIG1pZ2h0IG5lZWQgdXNlciBpbnRlcmFjdGlvblxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGxheXMgYSBzb3VuZCBlZmZlY3QuXG4gICAgICogQHBhcmFtIG5hbWUgVGhlIG5hbWUgb2YgdGhlIHNvdW5kIGFzc2V0IHRvIHBsYXkuXG4gICAgICogQHBhcmFtIGxvb3AgV2hldGhlciB0aGUgc291bmQgc2hvdWxkIGxvb3AuXG4gICAgICogQHBhcmFtIHZvbHVtZSBPcHRpb25hbCB2b2x1bWUgb3ZlcnJpZGUuXG4gICAgICogQHJldHVybnMgVGhlIGNsb25lZCBBdWRpbyBlbGVtZW50IGlmIHBsYXllZCwgbnVsbCBvdGhlcndpc2UuXG4gICAgICovXG4gICAgcHVibGljIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSwgdm9sdW1lPzogbnVtYmVyKTogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwge1xuICAgICAgICBpZiAoIXRoaXMuc291bmRPbikgcmV0dXJuIG51bGw7XG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5zb3VuZHMuZ2V0KG5hbWUpO1xuICAgICAgICBpZiAoYXVkaW8pIHtcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDsgLy8gQ2xvbmUgdG8gYWxsb3cgc2ltdWx0YW5lb3VzIHBsYXliYWNrXG4gICAgICAgICAgICBjbG9uZS52b2x1bWUgPSB2b2x1bWUgIT09IHVuZGVmaW5lZCA/IHZvbHVtZSA6IGF1ZGlvLnZvbHVtZTtcbiAgICAgICAgICAgIGNsb25lLmxvb3AgPSBsb29wO1xuICAgICAgICAgICAgY2xvbmUucGxheSgpLmNhdGNoKGUgPT4ge1xuICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUud2FybihgU291bmQgcGxheWJhY2sgYmxvY2tlZCBmb3IgJHtuYW1lfTogJHtlLm1lc3NhZ2V9YCk7XG4gICAgICAgICAgICAgICAgLy8gT2Z0ZW4gaGFwcGVucyBpZiBub3QgdHJpZ2dlcmVkIGJ5IGRpcmVjdCB1c2VyIGludGVyYWN0aW9uXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBjbG9uZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQbGF5cyB0aGUgY3VycmVudGx5IHNldCBiYWNrZ3JvdW5kIG11c2ljLlxuICAgICAqL1xuICAgIHB1YmxpYyBwbGF5QkdNKCkge1xuICAgICAgICBpZiAoIXRoaXMuc291bmRPbiB8fCAhdGhpcy5iYWNrZ3JvdW5kTXVzaWMpIHJldHVybjtcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWMucGxheSgpLmNhdGNoKGUgPT4ge1xuICAgICAgICAgICAgLy8gY29uc29sZS53YXJuKGBCR00gcGxheWJhY2sgYmxvY2tlZDogJHtlLm1lc3NhZ2V9LiBXaWxsIHRyeSBhZ2FpbiBvbiB1c2VyIGludGVyYWN0aW9uLmApO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdG9wcyB0aGUgYmFja2dyb3VuZCBtdXNpYy5cbiAgICAgKi9cbiAgICBwdWJsaWMgc3RvcEJHTSgpIHtcbiAgICAgICAgaWYgKHRoaXMuYmFja2dyb3VuZE11c2ljKSB7XG4gICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpYy5wYXVzZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVG9nZ2xlcyB0aGUgZ2xvYmFsIHNvdW5kIHN0YXRlIChvbi9vZmYpLlxuICAgICAqL1xuICAgIHB1YmxpYyB0b2dnbGVTb3VuZCgpIHtcbiAgICAgICAgdGhpcy5zb3VuZE9uID0gIXRoaXMuc291bmRPbjtcbiAgICAgICAgaWYgKHRoaXMuc291bmRPbikge1xuICAgICAgICAgICAgdGhpcy5wbGF5QkdNKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnN0b3BCR00oKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gLS0tIEdhbWUgT2JqZWN0IEJhc2UgQ2xhc3NlcyAtLS1cblxuLyoqXG4gKiBBYnN0cmFjdCBiYXNlIGNsYXNzIGZvciBhbGwgb2JqZWN0cyByZW5kZXJlZCBhbmQgdXBkYXRlZCBpbiB0aGUgZ2FtZS5cbiAqL1xuYWJzdHJhY3QgY2xhc3MgR2FtZU9iamVjdCB7XG4gICAgeDogbnVtYmVyO1xuICAgIHk6IG51bWJlcjtcbiAgICB3aWR0aDogbnVtYmVyO1xuICAgIGhlaWdodDogbnVtYmVyO1xuICAgIGltYWdlTmFtZTogc3RyaW5nO1xuXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnggPSB4O1xuICAgICAgICB0aGlzLnkgPSB5O1xuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICAgICAgICB0aGlzLmltYWdlTmFtZSA9IGltYWdlTmFtZTtcbiAgICB9XG5cbiAgICBhYnN0cmFjdCB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpOiB2b2lkO1xuXG4gICAgLyoqXG4gICAgICogRHJhd3MgdGhlIGdhbWUgb2JqZWN0IG9uIHRoZSBjYW52YXMuXG4gICAgICogQHBhcmFtIGN0eCBUaGUgMkQgcmVuZGVyaW5nIGNvbnRleHQuXG4gICAgICogQHBhcmFtIGltYWdlcyBNYXAgb2YgbG9hZGVkIGltYWdlcy5cbiAgICAgKiBAcGFyYW0gdGlsZVNpemUgU2l6ZSBvZiBhIHNpbmdsZSB0aWxlIGZvciBjb25zaXN0ZW50IHNjYWxpbmcuXG4gICAgICovXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiwgdGlsZVNpemU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBjb25zdCBpbWcgPSBpbWFnZXMuZ2V0KHRoaXMuaW1hZ2VOYW1lKTtcbiAgICAgICAgaWYgKGltZykge1xuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBGYWxsYmFjazogZHJhdyBhIGNvbG9yZWQgcmVjdGFuZ2xlIGlmIGltYWdlIGlzIG1pc3NpbmdcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAnZnVjaHNpYSc7IC8vIEJyaWdodCBjb2xvciBmb3IgdmlzaWJpbGl0eVxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSB0aWxlIHBvc2l0aW9uIG9mIHRoZSBjZW50ZXIgb2YgdGhlIGdhbWUgb2JqZWN0LlxuICAgICAqIEBwYXJhbSB0aWxlU2l6ZSBUaGUgc2l6ZSBvZiBhIHNpbmdsZSB0aWxlLlxuICAgICAqIEByZXR1cm5zIFRoZSB0aWxlIHBvc2l0aW9uLlxuICAgICAqL1xuICAgIGdldFRpbGVQb3ModGlsZVNpemU6IG51bWJlcik6IFRpbGVQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3c6IE1hdGguZmxvb3IoKHRoaXMueSArIHRoaXMuaGVpZ2h0IC8gMikgLyB0aWxlU2l6ZSksXG4gICAgICAgICAgICBjb2w6IE1hdGguZmxvb3IoKHRoaXMueCArIHRoaXMud2lkdGggLyAyKSAvIHRpbGVTaXplKVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyBmb3IgY29sbGlzaW9uIHdpdGggYW5vdGhlciBHYW1lT2JqZWN0IHVzaW5nIEFBQkIgKEF4aXMtQWxpZ25lZCBCb3VuZGluZyBCb3gpLlxuICAgICAqIEBwYXJhbSBvdGhlciBUaGUgb3RoZXIgR2FtZU9iamVjdCB0byBjaGVjayBhZ2FpbnN0LlxuICAgICAqIEByZXR1cm5zIFRydWUgaWYgY29sbGlkaW5nLCBmYWxzZSBvdGhlcndpc2UuXG4gICAgICovXG4gICAgY29sbGlkZXNXaXRoKG90aGVyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnggPCBvdGhlci54ICsgb3RoZXIud2lkdGggJiZcbiAgICAgICAgICAgICAgIHRoaXMueCArIHRoaXMud2lkdGggPiBvdGhlci54ICYmXG4gICAgICAgICAgICAgICB0aGlzLnkgPCBvdGhlci55ICsgb3RoZXIuaGVpZ2h0ICYmXG4gICAgICAgICAgICAgICB0aGlzLnkgKyB0aGlzLmhlaWdodCA+IG90aGVyLnk7XG4gICAgfVxufVxuXG4vKipcbiAqIEJhc2UgY2xhc3MgZm9yIG1vdmFibGUgZW50aXRpZXMgbGlrZSBwbGF5ZXJzIGFuZCBBSS5cbiAqL1xuY2xhc3MgRW50aXR5IGV4dGVuZHMgR2FtZU9iamVjdCB7XG4gICAgZHg6IG51bWJlciA9IDA7IC8vIERpcmVjdGlvbiB4ICgtMSwgMCwgMSlcbiAgICBkeTogbnVtYmVyID0gMDsgLy8gRGlyZWN0aW9uIHkgKC0xLCAwLCAxKVxuICAgIHNwZWVkOiBudW1iZXI7IC8vIE1vdmVtZW50IHNwZWVkIGluIHBpeGVscyBwZXIgc2Vjb25kXG4gICAgaXNNb3Zpbmc6IGJvb2xlYW4gPSBmYWxzZTsgLy8gVHJ1ZSBpZiBjdXJyZW50bHkgYW5pbWF0aW5nIG1vdmVtZW50IHRvIGEgbmV3IHRpbGVcbiAgICBjdXJyZW50VGlsZTogVGlsZVBvc2l0aW9uOyAvLyBUaGUgdGlsZSB0aGUgZW50aXR5IGlzIGN1cnJlbnRseSBjZW50ZXJlZCBvblxuICAgIHRhcmdldFRpbGU6IFRpbGVQb3NpdGlvbjsgLy8gVGhlIHRpbGUgdGhlIGVudGl0eSBpcyBtb3ZpbmcgdG93YXJkc1xuXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgc3BlZWQ6IG51bWJlciwgdGlsZVNpemU6IG51bWJlcikge1xuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xuICAgICAgICB0aGlzLnNwZWVkID0gc3BlZWQ7XG4gICAgICAgIHRoaXMuY3VycmVudFRpbGUgPSB0aGlzLmdldFRpbGVQb3ModGlsZVNpemUpO1xuICAgICAgICB0aGlzLnRhcmdldFRpbGUgPSB7IC4uLnRoaXMuY3VycmVudFRpbGUgfTsgLy8gSW5pdGlhbGx5LCB0YXJnZXQgaXMgY3VycmVudFxuICAgIH1cblxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xuICAgICAgICBjb25zdCB0aWxlU2l6ZSA9IGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZTtcblxuICAgICAgICBpZiAodGhpcy5pc01vdmluZykge1xuICAgICAgICAgICAgY29uc3QgdGFyZ2V0WCA9IHRoaXMudGFyZ2V0VGlsZS5jb2wgKiB0aWxlU2l6ZTtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFkgPSB0aGlzLnRhcmdldFRpbGUucm93ICogdGlsZVNpemU7XG5cbiAgICAgICAgICAgIGxldCByZWFjaGVkWCA9IGZhbHNlO1xuICAgICAgICAgICAgbGV0IHJlYWNoZWRZID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vIE1vdmUgaG9yaXpvbnRhbGx5XG4gICAgICAgICAgICBpZiAodGhpcy5keCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1vdmVBbW91bnQgPSB0aGlzLmR4ICogdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcbiAgICAgICAgICAgICAgICB0aGlzLnggKz0gbW92ZUFtb3VudDtcbiAgICAgICAgICAgICAgICBpZiAoKHRoaXMuZHggPiAwICYmIHRoaXMueCA+PSB0YXJnZXRYKSB8fCAodGhpcy5keCA8IDAgJiYgdGhpcy54IDw9IHRhcmdldFgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMueCA9IHRhcmdldFg7IC8vIFNuYXAgdG8gdGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgIHJlYWNoZWRYID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlYWNoZWRYID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTW92ZSB2ZXJ0aWNhbGx5XG4gICAgICAgICAgICBpZiAodGhpcy5keSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1vdmVBbW91bnQgPSB0aGlzLmR5ICogdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcbiAgICAgICAgICAgICAgICB0aGlzLnkgKz0gbW92ZUFtb3VudDtcbiAgICAgICAgICAgICAgICBpZiAoKHRoaXMuZHkgPiAwICYmIHRoaXMueSA+PSB0YXJnZXRZKSB8fCAodGhpcy5keSA8IDAgJiYgdGhpcy55IDw9IHRhcmdldFkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMueSA9IHRhcmdldFk7IC8vIFNuYXAgdG8gdGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgIHJlYWNoZWRZID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlYWNoZWRZID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSWYgdGFyZ2V0IHJlYWNoZWQgKG9yIG5vIG1vdmVtZW50IGluIHRoYXQgYXhpcyB3YXMgaW50ZW5kZWQpXG4gICAgICAgICAgICBpZiAocmVhY2hlZFggJiYgcmVhY2hlZFkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmlzTW92aW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGhpcy5keCA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5keSA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50VGlsZSA9IHsgLi4udGhpcy50YXJnZXRUaWxlIH07IC8vIFVwZGF0ZSBjdXJyZW50IHRpbGUgdG8gdGFyZ2V0XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBdHRlbXB0cyB0byBtb3ZlIHRoZSBlbnRpdHkgYnkgYSBnaXZlbiBkZWx0YSBpbiB0aWxlIGNvb3JkaW5hdGVzLlxuICAgICAqIEBwYXJhbSBkZWx0YUNvbCBDaGFuZ2UgaW4gY29sdW1uLlxuICAgICAqIEBwYXJhbSBkZWx0YVJvdyBDaGFuZ2UgaW4gcm93LlxuICAgICAqIEBwYXJhbSBtYXAgVGhlIGdhbWUgbWFwLlxuICAgICAqIEBwYXJhbSB0aWxlU2l6ZSBUaGUgc2l6ZSBvZiBhIHNpbmdsZSB0aWxlLlxuICAgICAqIEByZXR1cm5zIFRydWUgaWYgbW92ZW1lbnQgd2FzIGluaXRpYXRlZCwgZmFsc2Ugb3RoZXJ3aXNlIChlLmcuLCBibG9ja2VkKS5cbiAgICAgKi9cbiAgICBhdHRlbXB0TW92ZShkZWx0YUNvbDogbnVtYmVyLCBkZWx0YVJvdzogbnVtYmVyLCBtYXA6IFRpbGVbXVtdLCB0aWxlU2l6ZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICh0aGlzLmlzTW92aW5nKSByZXR1cm4gZmFsc2U7IC8vIENhbm5vdCBtb3ZlIGlmIGFscmVhZHkgbW92aW5nXG5cbiAgICAgICAgY29uc3QgbmV4dENvbCA9IHRoaXMuY3VycmVudFRpbGUuY29sICsgZGVsdGFDb2w7XG4gICAgICAgIGNvbnN0IG5leHRSb3cgPSB0aGlzLmN1cnJlbnRUaWxlLnJvdyArIGRlbHRhUm93O1xuXG4gICAgICAgIC8vIENoZWNrIG1hcCBib3VuZGFyaWVzXG4gICAgICAgIGlmIChuZXh0Q29sIDwgMCB8fCBuZXh0Q29sID49IG1hcFswXS5sZW5ndGggfHwgbmV4dFJvdyA8IDAgfHwgbmV4dFJvdyA+PSBtYXAubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBuZXh0VGlsZSA9IG1hcFtuZXh0Um93XVtuZXh0Q29sXTtcbiAgICAgICAgaWYgKG5leHRUaWxlLnR5cGUgPT09IFRpbGVUeXBlLlNPTElEIHx8IG5leHRUaWxlLnR5cGUgPT09IFRpbGVUeXBlLkJSRUFLQUJMRSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBDYW5ub3QgbW92ZSBpbnRvIHNvbGlkIG9yIGJyZWFrYWJsZSBibG9ja3NcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMudGFyZ2V0VGlsZSA9IHsgY29sOiBuZXh0Q29sLCByb3c6IG5leHRSb3cgfTtcbiAgICAgICAgdGhpcy5keCA9IGRlbHRhQ29sO1xuICAgICAgICB0aGlzLmR5ID0gZGVsdGFSb3c7XG4gICAgICAgIHRoaXMuaXNNb3ZpbmcgPSB0cnVlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHBsYXllciBjaGFyYWN0ZXIsIGVpdGhlciBodW1hbi1jb250cm9sbGVkIG9yIEFJLWNvbnRyb2xsZWQuXG4gKi9cbmNsYXNzIFBsYXllciBleHRlbmRzIEVudGl0eSB7XG4gICAgaWQ6IG51bWJlcjtcbiAgICBtYXhCb21iczogbnVtYmVyO1xuICAgIGN1cnJlbnRCb21iczogbnVtYmVyOyAvLyBCb21icyBjdXJyZW50bHkgYWN0aXZlL29uIG1hcFxuICAgIGJvbWJSYW5nZTogbnVtYmVyO1xuICAgIGxpdmVzOiBudW1iZXI7XG4gICAgaXNBSTogYm9vbGVhbjtcbiAgICBpbW11bmVUaW1lcjogbnVtYmVyID0gMDsgLy8gSW52aW5jaWJpbGl0eSBmcmFtZXMgYWZ0ZXIgYmVpbmcgaGl0XG4gICAgaXNEZWFkOiBib29sZWFuID0gZmFsc2U7XG5cbiAgICAvLyBBSSBzcGVjaWZpYyBwcm9wZXJ0aWVzXG4gICAgcHJpdmF0ZSBhaVBhdGg6IFRpbGVQb3NpdGlvbltdID0gW107IC8vIEN1cnJlbnQgcGF0aCBmb3IgQUkgbmF2aWdhdGlvblxuICAgIHByaXZhdGUgYWlTdGF0ZTogJ0lETEUnIHwgJ0NIQVNFJyB8ICdFVkFERScgfCAnQk9NQl9QTEFDRU1FTlQnID0gJ0lETEUnO1xuICAgIHByaXZhdGUgYWlCb21iVGltZXI6IG51bWJlciA9IDA7IC8vIENvb2xkb3duIGZvciBBSSBib21iIHBsYWNlbWVudFxuICAgIHByaXZhdGUgdGFyZ2V0UGxheWVyOiBQbGF5ZXIgfCBudWxsID0gbnVsbDsgLy8gQUkncyBjdXJyZW50IHRhcmdldCAoaHVtYW4gcGxheWVyKVxuXG4gICAgY29uc3RydWN0b3IoaWQ6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgc3BlZWQ6IG51bWJlciwgdGlsZVNpemU6IG51bWJlciwgY29uZmlnOiBHYW1lQ29uZmlnLCBpc0FJOiBib29sZWFuID0gZmFsc2UpIHtcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VOYW1lLCBzcGVlZCwgdGlsZVNpemUpO1xuICAgICAgICB0aGlzLmlkID0gaWQ7XG4gICAgICAgIHRoaXMubWF4Qm9tYnMgPSBjb25maWcuZ2FtZVNldHRpbmdzLmluaXRpYWxNYXhCb21icztcbiAgICAgICAgdGhpcy5jdXJyZW50Qm9tYnMgPSAwO1xuICAgICAgICB0aGlzLmJvbWJSYW5nZSA9IGNvbmZpZy5nYW1lU2V0dGluZ3MuaW5pdGlhbEJvbWJSYW5nZTtcbiAgICAgICAgdGhpcy5saXZlcyA9IGNvbmZpZy5nYW1lU2V0dGluZ3MuaW5pdGlhbExpdmVzO1xuICAgICAgICB0aGlzLmlzQUkgPSBpc0FJO1xuICAgIH1cblxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xuICAgICAgICBzdXBlci51cGRhdGUoZGVsdGFUaW1lLCBnYW1lKTtcblxuICAgICAgICBpZiAodGhpcy5pbW11bmVUaW1lciA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuaW1tdW5lVGltZXIgLT0gZGVsdGFUaW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuaXNBSSAmJiAhdGhpcy5pc0RlYWQpIHtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlQUkoZGVsdGFUaW1lLCBnYW1lKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4sIHRpbGVTaXplOiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuaXNEZWFkKSByZXR1cm47XG5cbiAgICAgICAgLy8gRmxhc2ggcGxheWVyIHdoZW4gaW1tdW5lXG4gICAgICAgIGlmICh0aGlzLmltbXVuZVRpbWVyID4gMCAmJiBNYXRoLmZsb29yKHRoaXMuaW1tdW5lVGltZXIgKiAxMCkgJSAyID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm47IC8vIFNraXAgZHJhd2luZyB0byBjcmVhdGUgYSBmbGFzaGluZyBlZmZlY3RcbiAgICAgICAgfVxuICAgICAgICBzdXBlci5kcmF3KGN0eCwgaW1hZ2VzLCB0aWxlU2l6ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gcGxhY2UgYSBib21iIGF0IHRoZSBwbGF5ZXIncyBjdXJyZW50IHRpbGUuXG4gICAgICogQHBhcmFtIGdhbWUgVGhlIG1haW4gZ2FtZSBpbnN0YW5jZS5cbiAgICAgKiBAcmV0dXJucyBUaGUgbmV3IEJvbWIgb2JqZWN0IGlmIHBsYWNlZCwgbnVsbCBvdGhlcndpc2UuXG4gICAgICovXG4gICAgcGxhY2VCb21iKGdhbWU6IEdhbWUpOiBCb21iIHwgbnVsbCB7XG4gICAgICAgIC8vIE1vZGlmaWVkOiBSZW1vdmVkIHRoZSBgIXRoaXMuaXNNb3ZpbmdgIGNvbmRpdGlvbiB0byBhbGxvdyBwbGFjaW5nIGJvbWJzIHdoaWxlIG1vdmluZy5cbiAgICAgICAgaWYgKHRoaXMuY3VycmVudEJvbWJzIDwgdGhpcy5tYXhCb21icykge1xuICAgICAgICAgICAgY29uc3QgdGlsZVggPSB0aGlzLmN1cnJlbnRUaWxlLmNvbCAqIGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZTtcbiAgICAgICAgICAgIGNvbnN0IHRpbGVZID0gdGhpcy5jdXJyZW50VGlsZS5yb3cgKiBnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemU7XG5cbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZXJlJ3MgYWxyZWFkeSBhIGJvbWIgYXQgdGhpcyBleGFjdCBzcG90XG4gICAgICAgICAgICBjb25zdCBleGlzdGluZ0JvbWIgPSBnYW1lLmJvbWJzLmZpbmQoYiA9PiBiLmdldFRpbGVQb3MoZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLnRpbGVTaXplKS5jb2wgPT09IHRoaXMuY3VycmVudFRpbGUuY29sICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGIuZ2V0VGlsZVBvcyhnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUpLnJvdyA9PT0gdGhpcy5jdXJyZW50VGlsZS5yb3cpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nQm9tYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRCb21icysrO1xuICAgICAgICAgICAgZ2FtZS5zb3VuZE1hbmFnZXIucGxheVNvdW5kKCdib21iX3BsYWNlJyk7XG4gICAgICAgICAgICByZXR1cm4gbmV3IEJvbWIoXG4gICAgICAgICAgICAgICAgdGlsZVgsXG4gICAgICAgICAgICAgICAgdGlsZVksXG4gICAgICAgICAgICAgICAgZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLnRpbGVTaXplLFxuICAgICAgICAgICAgICAgIGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZSxcbiAgICAgICAgICAgICAgICAnYm9tYicsXG4gICAgICAgICAgICAgICAgZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLmJvbWJGdXNlVGltZSxcbiAgICAgICAgICAgICAgICB0aGlzLmJvbWJSYW5nZSxcbiAgICAgICAgICAgICAgICB0aGlzLmlkXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBsYXllciB0YWtlcyBkYW1hZ2UsIHJlZHVjaW5nIGxpdmVzIGFuZCBncmFudGluZyB0ZW1wb3JhcnkgaW52aW5jaWJpbGl0eS5cbiAgICAgKiBAcGFyYW0gZ2FtZSBUaGUgbWFpbiBnYW1lIGluc3RhbmNlLlxuICAgICAqL1xuICAgIHRha2VEYW1hZ2UoZ2FtZTogR2FtZSkge1xuICAgICAgICBpZiAodGhpcy5pbW11bmVUaW1lciA8PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmxpdmVzLS07XG4gICAgICAgICAgICBnYW1lLnNvdW5kTWFuYWdlci5wbGF5U291bmQoJ3BsYXllcl9oaXQnKTtcbiAgICAgICAgICAgIGlmICh0aGlzLmxpdmVzIDw9IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLmlzRGVhZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgZ2FtZS5zb3VuZE1hbmFnZXIucGxheVNvdW5kKCdwbGF5ZXJfZGllJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuaW1tdW5lVGltZXIgPSAyOyAvLyAyIHNlY29uZHMgb2YgaW52aW5jaWJpbGl0eVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXBwbGllcyBhIGNvbGxlY3RlZCBwb3dlci11cCBlZmZlY3QgdG8gdGhlIHBsYXllci5cbiAgICAgKiBAcGFyYW0gdHlwZSBUaGUgdHlwZSBvZiBwb3dlci11cCBjb2xsZWN0ZWQuXG4gICAgICogQHBhcmFtIGdhbWUgVGhlIG1haW4gZ2FtZSBpbnN0YW5jZS5cbiAgICAgKi9cbiAgICBhcHBseVBvd2VyVXAodHlwZTogUG93ZXJVcFR5cGUsIGdhbWU6IEdhbWUpIHtcbiAgICAgICAgZ2FtZS5zb3VuZE1hbmFnZXIucGxheVNvdW5kKCdwb3dlcnVwX2NvbGxlY3QnKTtcbiAgICAgICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICAgICAgICBjYXNlIFBvd2VyVXBUeXBlLkJPTUJfVVA6XG4gICAgICAgICAgICAgICAgdGhpcy5tYXhCb21icysrO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBQb3dlclVwVHlwZS5SQU5HRV9VUDpcbiAgICAgICAgICAgICAgICB0aGlzLmJvbWJSYW5nZSsrO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBQb3dlclVwVHlwZS5TUEVFRF9VUDpcbiAgICAgICAgICAgICAgICB0aGlzLnNwZWVkICs9IDUwOyAvLyBJbmNyZWFzZSBzcGVlZCBieSA1MCBwaXhlbHMvc2VjXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyAtLS0gQUkgTG9naWMgLS0tXG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGVzIHRoZSBBSSdzIGJlaGF2aW9yIGJhc2VkIG9uIGdhbWUgc3RhdGUuXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSBUaW1lIGVsYXBzZWQgc2luY2UgbGFzdCBmcmFtZS5cbiAgICAgKiBAcGFyYW0gZ2FtZSBUaGUgbWFpbiBnYW1lIGluc3RhbmNlLlxuICAgICAqL1xuICAgIHByaXZhdGUgdXBkYXRlQUkoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpIHtcbiAgICAgICAgY29uc3QgeyB0aWxlU2l6ZSB9ID0gZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzO1xuICAgICAgICBjb25zdCBtYXAgPSBnYW1lLm1hcDtcblxuICAgICAgICAvLyBFbnN1cmUgQUkgaGFzIGEgdGFyZ2V0IGh1bWFuIHBsYXllclxuICAgICAgICBpZiAoIXRoaXMudGFyZ2V0UGxheWVyIHx8IHRoaXMudGFyZ2V0UGxheWVyLmlzRGVhZCkge1xuICAgICAgICAgICAgY29uc3QgbGl2ZVBsYXllcnMgPSBnYW1lLnBsYXllcnMuZmlsdGVyKHAgPT4gIXAuaXNBSSAmJiAhcC5pc0RlYWQpO1xuICAgICAgICAgICAgaWYgKGxpdmVQbGF5ZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRhcmdldFBsYXllciA9IGxpdmVQbGF5ZXJzWzBdOyAvLyBUYXJnZXQgdGhlIGZpcnN0IGh1bWFuIHBsYXllclxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBObyBodW1hbiBwbGF5ZXJzIGxlZnQsIEFJIG1pZ2h0IHdhbmRlciBvciBzdG9wLlxuICAgICAgICAgICAgICAgIC8vIEZvciBzaW1wbGljaXR5LCBpdCB3aWxsIGp1c3Qgbm90IGhhdmUgYSB0YXJnZXQuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbXlUaWxlID0gdGhpcy5jdXJyZW50VGlsZTtcbiAgICAgICAgY29uc3QgcGxheWVyVGlsZSA9IHRoaXMudGFyZ2V0UGxheWVyLmN1cnJlbnRUaWxlO1xuXG4gICAgICAgIC8vIFVwZGF0ZSBBSSBib21iIGNvb2xkb3duXG4gICAgICAgIGlmICh0aGlzLmFpQm9tYlRpbWVyID4gMCkge1xuICAgICAgICAgICAgdGhpcy5haUJvbWJUaW1lciAtPSBkZWx0YVRpbWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZXRlcm1pbmUgQUkgc3RhdGVcbiAgICAgICAgY29uc3QgZGFuZ2VyWm9uZSA9IHRoaXMuaXNUaWxlSW5FeHBsb3Npb25EYW5nZXIobXlUaWxlLCBnYW1lLmJvbWJzLCBnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MuYm9tYkZ1c2VUaW1lLCB0aWxlU2l6ZSk7XG4gICAgICAgIGNvbnN0IHBsYXllckNsb3NlID0gTWF0aC5hYnMobXlUaWxlLmNvbCAtIHBsYXllclRpbGUuY29sKSA8PSAzICYmIE1hdGguYWJzKG15VGlsZS5yb3cgLSBwbGF5ZXJUaWxlLnJvdykgPD0gMztcbiAgICAgICAgY29uc3QgY2FuUGxhY2VCb21iID0gdGhpcy5jdXJyZW50Qm9tYnMgPCB0aGlzLm1heEJvbWJzICYmIHRoaXMuYWlCb21iVGltZXIgPD0gMDtcblxuICAgICAgICBpZiAoZGFuZ2VyWm9uZSkge1xuICAgICAgICAgICAgdGhpcy5haVN0YXRlID0gJ0VWQURFJztcbiAgICAgICAgfSBlbHNlIGlmIChwbGF5ZXJDbG9zZSAmJiBjYW5QbGFjZUJvbWIgJiYgdGhpcy5jYW5Cb21iUGxheWVyKG15VGlsZSwgcGxheWVyVGlsZSwgbWFwLCBnYW1lLmJvbWJzKSkge1xuICAgICAgICAgICAgdGhpcy5haVN0YXRlID0gJ0JPTUJfUExBQ0VNRU5UJztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIERlZmF1bHQgc3RhdGU6IGNoYXNlIHBsYXllciBvciBicmVhayBibG9ja3NcbiAgICAgICAgICAgIHRoaXMuYWlTdGF0ZSA9ICdDSEFTRSc7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFeGVjdXRlIGJlaGF2aW9yIGJhc2VkIG9uIGN1cnJlbnQgc3RhdGVcbiAgICAgICAgc3dpdGNoICh0aGlzLmFpU3RhdGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ0VWQURFJzpcbiAgICAgICAgICAgICAgICB0aGlzLmV2YWRlQm9tYnMoZ2FtZSk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdCT01CX1BMQUNFTUVOVCc6XG4gICAgICAgICAgICAgICAgdGhpcy5wZXJmb3JtQm9tYlBsYWNlbWVudChnYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0NIQVNFJzpcbiAgICAgICAgICAgICAgICB0aGlzLmNoYXNlUGxheWVyKGdhbWUsIHBsYXllclRpbGUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnSURMRSc6IC8vIEZhbGxiYWNrL2RlZmF1bHQgaWYgb3RoZXIgc3RhdGVzIGFyZSBub3QgbWV0XG4gICAgICAgICAgICAgICAgdGhpcy5maW5kQW5kQnJlYWtCbG9jayhnYW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENoZWNrcyBpZiBhIGdpdmVuIHRpbGUgaXMgd2l0aGluIHRoZSBleHBsb3Npb24gcmFkaXVzIG9mIGFueSBhY3RpdmUgYm9tYi5cbiAgICAgKiBAcGFyYW0gdGlsZSBUaGUgdGlsZSB0byBjaGVjay5cbiAgICAgKiBAcGFyYW0gYm9tYnMgQWxsIGFjdGl2ZSBib21icyBpbiB0aGUgZ2FtZS5cbiAgICAgKiBAcGFyYW0gZnVzZVRpbWUgVGhlIHRvdGFsIGZ1c2UgdGltZSBvZiBhIGJvbWIuXG4gICAgICogQHBhcmFtIHRpbGVTaXplIFRoZSBzaXplIG9mIGEgc2luZ2xlIHRpbGUuXG4gICAgICogQHJldHVybnMgVHJ1ZSBpZiB0aGUgdGlsZSBpcyBpbiBkYW5nZXIsIGZhbHNlIG90aGVyd2lzZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGlzVGlsZUluRXhwbG9zaW9uRGFuZ2VyKHRpbGU6IFRpbGVQb3NpdGlvbiwgYm9tYnM6IEJvbWJbXSwgZnVzZVRpbWU6IG51bWJlciwgdGlsZVNpemU6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICBmb3IgKGNvbnN0IGJvbWIgb2YgYm9tYnMpIHtcbiAgICAgICAgICAgIC8vIENvbnNpZGVyIGRhbmdlciBpZiBib21iIGlzIGFjdGl2ZSBhbmQgaXMgYWJvdXQgdG8gZXhwbG9kZVxuICAgICAgICAgICAgaWYgKGJvbWIudGltZXIgPiAwICYmIGJvbWIudGltZXIgPD0gZnVzZVRpbWUgKiAwLjkpIHsgLy8gUHJvYWN0aXZlIGRhbmdlciB6b25lXG4gICAgICAgICAgICAgICAgY29uc3QgYm9tYlRpbGUgPSBib21iLmdldFRpbGVQb3ModGlsZVNpemUpO1xuICAgICAgICAgICAgICAgIGlmIChib21iVGlsZS5yb3cgPT09IHRpbGUucm93ICYmIE1hdGguYWJzKGJvbWJUaWxlLmNvbCAtIHRpbGUuY29sKSA8PSBib21iLnJhbmdlKSByZXR1cm4gdHJ1ZTsgLy8gSG9yaXpvbnRhbFxuICAgICAgICAgICAgICAgIGlmIChib21iVGlsZS5jb2wgPT09IHRpbGUuY29sICYmIE1hdGguYWJzKGJvbWJUaWxlLnJvdyAtIHRpbGUucm93KSA8PSBib21iLnJhbmdlKSByZXR1cm4gdHJ1ZTsgLy8gVmVydGljYWxcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmluZHMgYSBzYWZlIHBhdGggZnJvbSBhIHN0YXJ0IHRpbGUgdG8gYSB0YXJnZXQgdGlsZSwgYXZvaWRpbmcgZGFuZ2Vyb3VzIGV4cGxvc2lvbiB6b25lcy5cbiAgICAgKiBVc2VzIGEgc2ltcGxlIEJyZWFkdGgtRmlyc3QgU2VhcmNoIChCRlMpLlxuICAgICAqIEBwYXJhbSBzdGFydCBUaGUgc3RhcnRpbmcgdGlsZS5cbiAgICAgKiBAcGFyYW0gdGFyZ2V0IFRoZSB0YXJnZXQgdGlsZS5cbiAgICAgKiBAcGFyYW0gZ2FtZSBUaGUgbWFpbiBnYW1lIGluc3RhbmNlLlxuICAgICAqIEByZXR1cm5zIEFuIGFycmF5IG9mIFRpbGVQb3NpdGlvbnMgcmVwcmVzZW50aW5nIHRoZSBwYXRoLCBvciBlbXB0eSBhcnJheSBpZiBubyBzYWZlIHBhdGguXG4gICAgICovXG4gICAgcHJpdmF0ZSBnZXRTYWZlUGF0aChzdGFydDogVGlsZVBvc2l0aW9uLCB0YXJnZXQ6IFRpbGVQb3NpdGlvbiwgZ2FtZTogR2FtZSk6IFRpbGVQb3NpdGlvbltdIHtcbiAgICAgICAgY29uc3QgcXVldWU6IHsgdGlsZTogVGlsZVBvc2l0aW9uOyBwYXRoOiBUaWxlUG9zaXRpb25bXSB9W10gPSBbXTtcbiAgICAgICAgY29uc3QgdmlzaXRlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG4gICAgICAgIGNvbnN0IG1hcCA9IGdhbWUubWFwO1xuICAgICAgICBjb25zdCB7IHRpbGVTaXplLCBib21iRnVzZVRpbWUgfSA9IGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncztcblxuICAgICAgICBxdWV1ZS5wdXNoKHsgdGlsZTogc3RhcnQsIHBhdGg6IFtzdGFydF0gfSk7XG4gICAgICAgIHZpc2l0ZWQuYWRkKGAke3N0YXJ0LnJvd30sJHtzdGFydC5jb2x9YCk7XG5cbiAgICAgICAgY29uc3QgZGlyZWN0aW9ucyA9IFtcbiAgICAgICAgICAgIHsgZHI6IC0xLCBkYzogMCB9LCB7IGRyOiAxLCBkYzogMCB9LFxuICAgICAgICAgICAgeyBkcjogMCwgZGM6IC0xIH0sIHsgZHI6IDAsIGRjOiAxIH1cbiAgICAgICAgXTtcblxuICAgICAgICB3aGlsZSAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29uc3QgeyB0aWxlLCBwYXRoIH0gPSBxdWV1ZS5zaGlmdCgpITtcblxuICAgICAgICAgICAgaWYgKHRpbGUucm93ID09PSB0YXJnZXQucm93ICYmIHRpbGUuY29sID09PSB0YXJnZXQuY29sKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhdGg7IC8vIFRhcmdldCByZWFjaGVkXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgZGlyIG9mIGRpcmVjdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBuZWlnaGJvcjogVGlsZVBvc2l0aW9uID0geyByb3c6IHRpbGUucm93ICsgZGlyLmRyLCBjb2w6IHRpbGUuY29sICsgZGlyLmRjIH07XG5cbiAgICAgICAgICAgICAgICBpZiAobmVpZ2hib3Iucm93IDwgMCB8fCBuZWlnaGJvci5yb3cgPj0gbWFwLmxlbmd0aCB8fFxuICAgICAgICAgICAgICAgICAgICBuZWlnaGJvci5jb2wgPCAwIHx8IG5laWdoYm9yLmNvbCA+PSBtYXBbMF0ubGVuZ3RoKSBjb250aW51ZTsgLy8gT3V0IG9mIGJvdW5kc1xuXG4gICAgICAgICAgICAgICAgY29uc3QgbmVpZ2hib3JLZXkgPSBgJHtuZWlnaGJvci5yb3d9LCR7bmVpZ2hib3IuY29sfWA7XG4gICAgICAgICAgICAgICAgaWYgKHZpc2l0ZWQuaGFzKG5laWdoYm9yS2V5KSkgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB0aWxlVHlwZSA9IG1hcFtuZWlnaGJvci5yb3ddW25laWdoYm9yLmNvbF0udHlwZTtcbiAgICAgICAgICAgICAgICAvLyBDYW5ub3QgbW92ZSBpbnRvIHNvbGlkIG9yIGJyZWFrYWJsZSBibG9ja3NcbiAgICAgICAgICAgICAgICBpZiAodGlsZVR5cGUgPT09IFRpbGVUeXBlLlNPTElEIHx8IHRpbGVUeXBlID09PSBUaWxlVHlwZS5CUkVBS0FCTEUpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgLy8gQXZvaWQgdGlsZXMgaW4gaW1taW5lbnQgZGFuZ2VyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuaXNUaWxlSW5FeHBsb3Npb25EYW5nZXIobmVpZ2hib3IsIGdhbWUuYm9tYnMsIGJvbWJGdXNlVGltZSwgdGlsZVNpemUpKSBjb250aW51ZTtcblxuICAgICAgICAgICAgICAgIHZpc2l0ZWQuYWRkKG5laWdoYm9yS2V5KTtcbiAgICAgICAgICAgICAgICBxdWV1ZS5wdXNoKHsgdGlsZTogbmVpZ2hib3IsIHBhdGg6IFsuLi5wYXRoLCBuZWlnaGJvcl0gfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFtdOyAvLyBObyBzYWZlIHBhdGggZm91bmRcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBSSBhdHRlbXB0cyB0byBtb3ZlIHRvIGEgc2FmZSB0aWxlIGlmIGN1cnJlbnRseSBpbiBkYW5nZXIuXG4gICAgICogQHBhcmFtIGdhbWUgVGhlIG1haW4gZ2FtZSBpbnN0YW5jZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGV2YWRlQm9tYnMoZ2FtZTogR2FtZSkge1xuICAgICAgICBpZiAodGhpcy5pc01vdmluZykgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IG15VGlsZSA9IHRoaXMuY3VycmVudFRpbGU7XG4gICAgICAgIGNvbnN0IG1hcCA9IGdhbWUubWFwO1xuICAgICAgICBjb25zdCB7IGJvbWJGdXNlVGltZSwgdGlsZVNpemUgfSA9IGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncztcblxuICAgICAgICBjb25zdCBkaXJlY3Rpb25zID0gW1xuICAgICAgICAgICAgeyBkcjogLTEsIGRjOiAwIH0sIHsgZHI6IDEsIGRjOiAwIH0sXG4gICAgICAgICAgICB7IGRyOiAwLCBkYzogLTEgfSwgeyBkcjogMCwgZGM6IDEgfVxuICAgICAgICBdO1xuXG4gICAgICAgIC8vIFByaW9yaXRpemUgbW92aW5nIHRvIGFuIGFkamFjZW50IHNhZmUsIGVtcHR5IHRpbGVcbiAgICAgICAgZm9yIChjb25zdCBkaXIgb2YgZGlyZWN0aW9ucykge1xuICAgICAgICAgICAgY29uc3QgbmV4dFRpbGU6IFRpbGVQb3NpdGlvbiA9IHsgcm93OiBteVRpbGUucm93ICsgZGlyLmRyLCBjb2w6IG15VGlsZS5jb2wgKyBkaXIuZGMgfTtcbiAgICAgICAgICAgIGlmIChuZXh0VGlsZS5yb3cgPCAwIHx8IG5leHRUaWxlLnJvdyA+PSBtYXAubGVuZ3RoIHx8XG4gICAgICAgICAgICAgICAgbmV4dFRpbGUuY29sIDwgMCB8fCBuZXh0VGlsZS5jb2wgPj0gbWFwWzBdLmxlbmd0aCkgY29udGludWU7XG5cbiAgICAgICAgICAgIGNvbnN0IG1hcFRpbGUgPSBtYXBbbmV4dFRpbGUucm93XVtuZXh0VGlsZS5jb2xdO1xuICAgICAgICAgICAgaWYgKG1hcFRpbGUudHlwZSA9PT0gVGlsZVR5cGUuRU1QVFkgJiYgIXRoaXMuaXNUaWxlSW5FeHBsb3Npb25EYW5nZXIobmV4dFRpbGUsIGdhbWUuYm9tYnMsIGJvbWJGdXNlVGltZSwgdGlsZVNpemUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hdHRlbXB0TW92ZShkaXIuZGMsIGRpci5kciwgbWFwLCB0aWxlU2l6ZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5haVBhdGggPSBbXTsgLy8gQ2xlYXIgY3VycmVudCBwYXRoLCBhcyB3ZSBhcmUgZXZhZGluZ1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBJZiBubyBpbW1lZGlhdGUgc2FmZSBhZGphY2VudCB0aWxlLCBBSSBtaWdodCBnZXQgc3R1Y2sgb3IgdHJ5IHRvIHBhdGhmaW5kIGZ1cnRoZXIuXG4gICAgICAgIC8vIEZvciBzaW1wbGljaXR5LCBpZiBpbW1lZGlhdGUgZXZhZGUgZmFpbHMsIEFJIG1pZ2h0IG1vdmUgdG93YXJkcyBhIG5vbi1kYW5nZXJvdXMgY2VsbFxuICAgICAgICAvLyBpbiBpdHMgY3VycmVudCBwYXRoIG9yIHJlLWV2YWx1YXRlLlxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFJIGF0dGVtcHRzIHRvIGNoYXNlIHRoZSB0YXJnZXQgaHVtYW4gcGxheWVyLlxuICAgICAqIEBwYXJhbSBnYW1lIFRoZSBtYWluIGdhbWUgaW5zdGFuY2UuXG4gICAgICogQHBhcmFtIHBsYXllclRpbGUgVGhlIHRhcmdldCBwbGF5ZXIncyBjdXJyZW50IHRpbGUuXG4gICAgICovXG4gICAgcHJpdmF0ZSBjaGFzZVBsYXllcihnYW1lOiBHYW1lLCBwbGF5ZXJUaWxlOiBUaWxlUG9zaXRpb24pIHtcbiAgICAgICAgaWYgKHRoaXMuaXNNb3ZpbmcpIHJldHVybjtcblxuICAgICAgICAvLyBSZWNhbGN1bGF0ZSBwYXRoIGlmIG5vIHBhdGggb3IgdGFyZ2V0IHBsYXllciBtb3ZlZCBzaWduaWZpY2FudGx5XG4gICAgICAgIGlmICh0aGlzLmFpUGF0aC5sZW5ndGggPT09IDAgfHxcbiAgICAgICAgICAgICh0aGlzLmFpUGF0aC5sZW5ndGggPiAwICYmICh0aGlzLmFpUGF0aFt0aGlzLmFpUGF0aC5sZW5ndGggLSAxXS5yb3cgIT09IHBsYXllclRpbGUucm93IHx8IHRoaXMuYWlQYXRoW3RoaXMuYWlQYXRoLmxlbmd0aCAtIDFdLmNvbCAhPT0gcGxheWVyVGlsZS5jb2wpKSkge1xuICAgICAgICAgICAgdGhpcy5haVBhdGggPSB0aGlzLmdldFNhZmVQYXRoKHRoaXMuY3VycmVudFRpbGUsIHBsYXllclRpbGUsIGdhbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuYWlQYXRoLmxlbmd0aCA+IDEpIHsgLy8gSWYgcGF0aCBleGlzdHMgYW5kIGhhcyBtb3JlIHRoYW4ganVzdCB0aGUgY3VycmVudCB0aWxlXG4gICAgICAgICAgICBjb25zdCBuZXh0U3RlcCA9IHRoaXMuYWlQYXRoWzFdOyAvLyBUaGUgbmV4dCB0aWxlIGluIHRoZSBwYXRoXG4gICAgICAgICAgICBjb25zdCBkciA9IG5leHRTdGVwLnJvdyAtIHRoaXMuY3VycmVudFRpbGUucm93O1xuICAgICAgICAgICAgY29uc3QgZGMgPSBuZXh0U3RlcC5jb2wgLSB0aGlzLmN1cnJlbnRUaWxlLmNvbDtcbiAgICAgICAgICAgIHRoaXMuYXR0ZW1wdE1vdmUoZGMsIGRyLCBnYW1lLm1hcCwgZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLnRpbGVTaXplKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFBsYXllciBpcyB1bnJlYWNoYWJsZSBvciBhbHJlYWR5IG9uIHRoZSBzYW1lIHRpbGUsIHRyeSB0byBicmVhayBibG9ja3Mgb3IganVzdCBpZGxlXG4gICAgICAgICAgICB0aGlzLmZpbmRBbmRCcmVha0Jsb2NrKGdhbWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQUkgYXR0ZW1wdHMgdG8gcGxhY2UgYSBib21iIGFuZCB0aGVuIGV2YWRlLlxuICAgICAqIEBwYXJhbSBnYW1lIFRoZSBtYWluIGdhbWUgaW5zdGFuY2UuXG4gICAgICovXG4gICAgcHJpdmF0ZSBwZXJmb3JtQm9tYlBsYWNlbWVudChnYW1lOiBHYW1lKSB7XG4gICAgICAgIC8vIEFJIGNhbiBwbGFjZSBib21icyB3aGlsZSBtb3ZpbmcgaWYgaXQgbmVlZHMgdG8sIGJ1dCBmb3Igc3RyYXRlZ2ljIHJlYXNvbnMsXG4gICAgICAgIC8vIGl0IG1pZ2h0IGJlIGJldHRlciB0byBlbnN1cmUgaXQncyBvbiBhIHRpbGUgdG8gcHJvcGVybHkgYXNzZXNzIHRoZSBkYW5nZXIgem9uZVxuICAgICAgICAvLyBhZnRlciBwbGFjZW1lbnQuIEZvciBub3csIG1hdGNoaW5nIHRoZSBwbGF5ZXIgYmVoYXZpb3IgY2hhbmdlLlxuICAgICAgICBpZiAodGhpcy5haUJvbWJUaW1lciA+IDApIHJldHVybjsgLy8gUmVzcGVjdCBib21iIGNvb2xkb3duXG5cbiAgICAgICAgY29uc3QgYm9tYiA9IHRoaXMucGxhY2VCb21iKGdhbWUpO1xuICAgICAgICBpZiAoYm9tYikge1xuICAgICAgICAgICAgdGhpcy5haUJvbWJUaW1lciA9IDEuNTsgLy8gU2V0IGNvb2xkb3duIGFmdGVyIHBsYWNpbmcgYSBib21iXG4gICAgICAgICAgICB0aGlzLmV2YWRlQm9tYnMoZ2FtZSk7IC8vIEFmdGVyIHBsYWNpbmcsIGltbWVkaWF0ZWx5IHRyeSB0byBtb3ZlIGF3YXkgZnJvbSB0aGUgYm9tYlxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2tzIGlmIHRoZSBBSSBjYW4gZWZmZWN0aXZlbHkgYm9tYiB0aGUgdGFyZ2V0IHBsYXllciAobGluZSBvZiBzaWdodCBhbmQgcmFuZ2UpLlxuICAgICAqIEBwYXJhbSBteVRpbGUgQUkncyBjdXJyZW50IHRpbGUuXG4gICAgICogQHBhcmFtIHBsYXllclRpbGUgVGFyZ2V0IHBsYXllcidzIGN1cnJlbnQgdGlsZS5cbiAgICAgKiBAcGFyYW0gbWFwIFRoZSBnYW1lIG1hcC5cbiAgICAgKiBAcGFyYW0gYm9tYnMgQWxsIGFjdGl2ZSBib21icy5cbiAgICAgKiBAcmV0dXJucyBUcnVlIGlmIHRoZSBBSSBjYW4gYm9tYiB0aGUgcGxheWVyLlxuICAgICAqL1xuICAgIHByaXZhdGUgY2FuQm9tYlBsYXllcihteVRpbGU6IFRpbGVQb3NpdGlvbiwgcGxheWVyVGlsZTogVGlsZVBvc2l0aW9uLCBtYXA6IFRpbGVbXVtdLCBib21iczogQm9tYltdKTogYm9vbGVhbiB7XG4gICAgICAgIC8vIFByZXZlbnQgcGxhY2luZyBib21iIGlmIG9uZSBhbHJlYWR5IGV4aXN0cyBvbiBBSSdzIHRpbGVcbiAgICAgICAgY29uc3QgZXhpc3RpbmdCb21iQXRNeVRpbGUgPSBib21icy5zb21lKGIgPT4gYi5nZXRUaWxlUG9zKGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZSkuY29sID09PSBteVRpbGUuY29sICYmIGIuZ2V0VGlsZVBvcyhnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUpLnJvdyA9PT0gbXlUaWxlLnJvdyk7XG4gICAgICAgIGlmIChleGlzdGluZ0JvbWJBdE15VGlsZSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgIGNvbnN0IHJhbmdlID0gdGhpcy5ib21iUmFuZ2U7XG4gICAgICAgIC8vIENoZWNrIGhvcml6b250YWwgbGluZSBvZiBzaWdodFxuICAgICAgICBpZiAobXlUaWxlLnJvdyA9PT0gcGxheWVyVGlsZS5yb3cpIHtcbiAgICAgICAgICAgIGlmIChNYXRoLmFicyhteVRpbGUuY29sIC0gcGxheWVyVGlsZS5jb2wpIDw9IHJhbmdlKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhcnRDb2wgPSBNYXRoLm1pbihteVRpbGUuY29sLCBwbGF5ZXJUaWxlLmNvbCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZW5kQ29sID0gTWF0aC5tYXgobXlUaWxlLmNvbCwgcGxheWVyVGlsZS5jb2wpO1xuICAgICAgICAgICAgICAgIGxldCBibG9ja2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgYyA9IHN0YXJ0Q29sICsgMTsgYyA8IGVuZENvbDsgYysrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXBbbXlUaWxlLnJvd11bY10udHlwZSA9PT0gVGlsZVR5cGUuU09MSUQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJsb2NrZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFibG9ja2VkKSByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyBDaGVjayB2ZXJ0aWNhbCBsaW5lIG9mIHNpZ2h0XG4gICAgICAgIGlmIChteVRpbGUuY29sID09PSBwbGF5ZXJUaWxlLmNvbCkge1xuICAgICAgICAgICAgaWYgKE1hdGguYWJzKG15VGlsZS5yb3cgLSBwbGF5ZXJUaWxlLnJvdykgPD0gcmFuZ2UpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzdGFydFJvdyA9IE1hdGgubWluKG15VGlsZS5yb3csIHBsYXllclRpbGUucm93KTtcbiAgICAgICAgICAgICAgICBjb25zdCBlbmRSb3cgPSBNYXRoLm1heChteVRpbGUucm93LCBwbGF5ZXJUaWxlLnJvdyk7XG4gICAgICAgICAgICAgICAgbGV0IGJsb2NrZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCByID0gc3RhcnRSb3cgKyAxOyByIDwgZW5kUm93OyByKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hcFtyXVtteVRpbGUuY29sXS50eXBlID09PSBUaWxlVHlwZS5TT0xJRCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYmxvY2tlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIWJsb2NrZWQpIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBSSBhdHRlbXB0cyB0byBmaW5kIGFuZCBicmVhayBhIGJyZWFrYWJsZSBibG9jay5cbiAgICAgKiBAcGFyYW0gZ2FtZSBUaGUgbWFpbiBnYW1lIGluc3RhbmNlLlxuICAgICAqL1xuICAgIHByaXZhdGUgZmluZEFuZEJyZWFrQmxvY2soZ2FtZTogR2FtZSkge1xuICAgICAgICBpZiAodGhpcy5pc01vdmluZykgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IG15VGlsZSA9IHRoaXMuY3VycmVudFRpbGU7XG4gICAgICAgIGNvbnN0IG1hcCA9IGdhbWUubWFwO1xuICAgICAgICBjb25zdCB7IHRpbGVTaXplIH0gPSBnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3M7XG5cbiAgICAgICAgY29uc3QgZGlyZWN0aW9ucyA9IFtcbiAgICAgICAgICAgIHsgZHI6IC0xLCBkYzogMCB9LCB7IGRyOiAxLCBkYzogMCB9LFxuICAgICAgICAgICAgeyBkcjogMCwgZGM6IC0xIH0sIHsgZHI6IDAsIGRjOiAxIH1cbiAgICAgICAgXTtcblxuICAgICAgICAvLyBDaGVjayBmb3IgYWRqYWNlbnQgYnJlYWthYmxlIGJsb2Nrc1xuICAgICAgICBmb3IgKGNvbnN0IGRpciBvZiBkaXJlY3Rpb25zKSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0VGlsZTogVGlsZVBvc2l0aW9uID0geyByb3c6IG15VGlsZS5yb3cgKyBkaXIuZHIsIGNvbDogbXlUaWxlLmNvbCArIGRpci5kYyB9O1xuICAgICAgICAgICAgaWYgKG5leHRUaWxlLnJvdyA8IDAgfHwgbmV4dFRpbGUucm93ID49IG1hcC5sZW5ndGggfHxcbiAgICAgICAgICAgICAgICBuZXh0VGlsZS5jb2wgPCAwIHx8IG5leHRUaWxlLmNvbCA+PSBtYXBbMF0ubGVuZ3RoKSBjb250aW51ZTtcblxuICAgICAgICAgICAgY29uc3QgbWFwVGlsZSA9IG1hcFtuZXh0VGlsZS5yb3ddW25leHRUaWxlLmNvbF07XG4gICAgICAgICAgICBpZiAobWFwVGlsZS50eXBlID09PSBUaWxlVHlwZS5CUkVBS0FCTEUpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50Qm9tYnMgPCB0aGlzLm1heEJvbWJzICYmIHRoaXMuYWlCb21iVGltZXIgPD0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBlcmZvcm1Cb21iUGxhY2VtZW50KGdhbWUpOyAvLyBQbGFjZSBib21iXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZXZhZGVCb21icyhnYW1lKTsgLy8gVGhlbiBtb3ZlIGF3YXlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIG5vIGFkamFjZW50IGJyZWFrYWJsZSBibG9jayBvciBjYW5ub3QgcGxhY2UgYm9tYiwgcGF0aGZpbmQgdG8gYSByYW5kb20gYnJlYWthYmxlIGJsb2NrXG4gICAgICAgIGlmICh0aGlzLmFpUGF0aC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGJyZWFrYWJsZVRpbGVzOiBUaWxlUG9zaXRpb25bXSA9IFtdO1xuICAgICAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCBtYXAubGVuZ3RoOyByKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IG1hcFswXS5sZW5ndGg7IGMrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAobWFwW3JdW2NdLnR5cGUgPT09IFRpbGVUeXBlLkJSRUFLQUJMRSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWthYmxlVGlsZXMucHVzaCh7IHJvdzogciwgY29sOiBjIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYnJlYWthYmxlVGlsZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldCA9IGJyZWFrYWJsZVRpbGVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGJyZWFrYWJsZVRpbGVzLmxlbmd0aCldO1xuICAgICAgICAgICAgICAgIHRoaXMuYWlQYXRoID0gdGhpcy5nZXRTYWZlUGF0aChteVRpbGUsIHRhcmdldCwgZ2FtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5haVBhdGgubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgY29uc3QgbmV4dFN0ZXAgPSB0aGlzLmFpUGF0aFsxXTtcbiAgICAgICAgICAgIGNvbnN0IGRyID0gbmV4dFN0ZXAucm93IC0gdGhpcy5jdXJyZW50VGlsZS5yb3c7XG4gICAgICAgICAgICBjb25zdCBkYyA9IG5leHRTdGVwLmNvbCAtIHRoaXMuY3VycmVudFRpbGUuY29sO1xuICAgICAgICAgICAgdGhpcy5hdHRlbXB0TW92ZShkYywgZHIsIG1hcCwgdGlsZVNpemUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSWYgcGF0aGZpbmRpbmcgdG8gYSBicmVha2FibGUgYmxvY2sgZmFpbGVkLCBqdXN0IHdhbmRlciByYW5kb21seSB0byBleHBsb3JlXG4gICAgICAgICAgICBjb25zdCByYW5kb21EaXIgPSBkaXJlY3Rpb25zW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGRpcmVjdGlvbnMubGVuZ3RoKV07XG4gICAgICAgICAgICB0aGlzLmF0dGVtcHRNb3ZlKHJhbmRvbURpci5kYywgcmFuZG9tRGlyLmRyLCBtYXAsIHRpbGVTaXplKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgYm9tYiBwbGFjZWQgYnkgYSBwbGF5ZXIuXG4gKi9cbmNsYXNzIEJvbWIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcbiAgICB0aW1lcjogbnVtYmVyO1xuICAgIHJhbmdlOiBudW1iZXI7IC8vIEV4cGxvc2lvbiByYW5nZSBpbiB0aWxlc1xuICAgIG93bmVySWQ6IG51bWJlcjsgLy8gSUQgb2YgdGhlIHBsYXllciB3aG8gcGxhY2VkIHRoaXMgYm9tYlxuXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgZnVzZVRpbWU6IG51bWJlciwgcmFuZ2U6IG51bWJlciwgb3duZXJJZDogbnVtYmVyKSB7XG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGltYWdlTmFtZSk7XG4gICAgICAgIHRoaXMudGltZXIgPSBmdXNlVGltZTtcbiAgICAgICAgdGhpcy5yYW5nZSA9IHJhbmdlO1xuICAgICAgICB0aGlzLm93bmVySWQgPSBvd25lcklkO1xuICAgIH1cblxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSk6IHZvaWQge1xuICAgICAgICB0aGlzLnRpbWVyIC09IGRlbHRhVGltZTtcbiAgICAgICAgaWYgKHRoaXMudGltZXIgPD0gMCkge1xuICAgICAgICAgICAgZ2FtZS50cmlnZ2VyRXhwbG9zaW9uKHRoaXMpOyAvLyBUcmlnZ2VyIGV4cGxvc2lvbiB3aGVuIHRpbWVyIHJ1bnMgb3V0XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+LCB0aWxlU2l6ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGltZyA9IGltYWdlcy5nZXQodGhpcy5pbWFnZU5hbWUpO1xuICAgICAgICBpZiAoaW1nKSB7XG4gICAgICAgICAgICAgLy8gTWFrZSBib21iIGZsYXNoIGZhc3RlciBhcyBpdCBnZXRzIGNsb3NlciB0byBleHBsb2RpbmdcbiAgICAgICAgICAgIGNvbnN0IGZsYXNoUmF0ZSA9IHRoaXMudGltZXIgPCAwLjUgPyAwLjA1IDogMC4yO1xuICAgICAgICAgICAgaWYgKE1hdGguZmxvb3IodGhpcy50aW1lciAvIGZsYXNoUmF0ZSkgJSAyID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ29yYW5nZSc7IC8vIEZhbGxiYWNrXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGFuIGV4cGxvc2lvbiBzZWdtZW50IG9uIHRoZSBtYXAuXG4gKi9cbmNsYXNzIEV4cGxvc2lvbiBleHRlbmRzIEdhbWVPYmplY3Qge1xuICAgIHRpbWVyOiBudW1iZXI7IC8vIEhvdyBsb25nIHRoZSBleHBsb3Npb24gbGFzdHNcbiAgICBpc0NlbnRlcjogYm9vbGVhbjtcbiAgICBpc1ZlcnRpY2FsOiBib29sZWFuO1xuICAgIGlzRW5kOiBib29sZWFuO1xuXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgZHVyYXRpb246IG51bWJlciwgaXNDZW50ZXI6IGJvb2xlYW4gPSBmYWxzZSwgaXNWZXJ0aWNhbDogYm9vbGVhbiA9IGZhbHNlLCBpc0VuZDogYm9vbGVhbiA9IGZhbHNlKSB7XG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGltYWdlTmFtZSk7XG4gICAgICAgIHRoaXMudGltZXIgPSBkdXJhdGlvbjtcbiAgICAgICAgdGhpcy5pc0NlbnRlciA9IGlzQ2VudGVyO1xuICAgICAgICB0aGlzLmlzVmVydGljYWwgPSBpc1ZlcnRpY2FsO1xuICAgICAgICB0aGlzLmlzRW5kID0gaXNFbmQ7XG4gICAgfVxuXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKTogdm9pZCB7XG4gICAgICAgIHRoaXMudGltZXIgLT0gZGVsdGFUaW1lO1xuICAgICAgICAvLyBHYW1lIGxvb3Agd2lsbCByZW1vdmUgZXhwbG9zaW9ucyB3aGVuIHRpbWVyIDw9IDBcbiAgICB9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHNpbmdsZSB0aWxlIG9uIHRoZSBnYW1lIG1hcC5cbiAqL1xuY2xhc3MgVGlsZSB7XG4gICAgdHlwZTogVGlsZVR5cGU7XG4gICAgaW1hZ2VOYW1lOiBzdHJpbmc7XG4gICAgaGFzUG93ZXJVcDogUG93ZXJVcFR5cGUgfCBudWxsOyAvLyBOdWxsIGlmIG5vIHBvd2VyLXVwXG5cbiAgICBjb25zdHJ1Y3Rvcih0eXBlOiBUaWxlVHlwZSwgaW1hZ2VOYW1lOiBzdHJpbmcsIGhhc1Bvd2VyVXA6IFBvd2VyVXBUeXBlIHwgbnVsbCA9IG51bGwpIHtcbiAgICAgICAgdGhpcy50eXBlID0gdHlwZTtcbiAgICAgICAgdGhpcy5pbWFnZU5hbWUgPSBpbWFnZU5hbWU7XG4gICAgICAgIHRoaXMuaGFzUG93ZXJVcCA9IGhhc1Bvd2VyVXA7XG4gICAgfVxufVxuXG4vLyAtLS0gTWFpbiBHYW1lIENsYXNzIC0tLVxuXG4vKipcbiAqIE9yY2hlc3RyYXRlcyB0aGUgZW50aXJlIGdhbWUsIGluY2x1ZGluZyBzdGF0ZSwgbG9vcCwgcmVuZGVyaW5nLCBhbmQgbG9naWMuXG4gKi9cbmNsYXNzIEdhbWUge1xuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuICAgIHB1YmxpYyBjb25maWchOiBHYW1lQ29uZmlnOyAvLyBMb2FkZWQgZnJvbSBkYXRhLmpzb25cbiAgICBwcml2YXRlIGltYWdlcyE6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+OyAvLyBMb2FkZWQgaW1hZ2UgYXNzZXRzXG4gICAgcHVibGljIHNvdW5kTWFuYWdlciE6IFNvdW5kTWFuYWdlcjsgLy8gTWFuYWdlcyBnYW1lIGF1ZGlvXG5cbiAgICBwcml2YXRlIGxhc3RUaW1lOiBudW1iZXIgPSAwOyAvLyBUaW1lc3RhbXAgb2YgcHJldmlvdXMgZnJhbWVcbiAgICBwcml2YXRlIGFuaW1hdGlvbkZyYW1lSWQ6IG51bWJlciB8IG51bGwgPSBudWxsOyAvLyBJRCBmb3IgcmVxdWVzdEFuaW1hdGlvbkZyYW1lXG5cbiAgICBwdWJsaWMgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7IC8vIEN1cnJlbnQgZ2FtZSBzdGF0ZVxuICAgIHByaXZhdGUgaW5wdXQ6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307IC8vIFRyYWNrcyBjdXJyZW50bHkgcHJlc3NlZCBrZXlzXG4gICAgcHJpdmF0ZSBwcmVzc2VkS2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gVHJhY2tzIGtleXMgcHJlc3NlZCBvbmNlIHBlciBmcmFtZVxuXG4gICAgcHVibGljIHBsYXllcnM6IFBsYXllcltdID0gW107XG4gICAgcHVibGljIGJvbWJzOiBCb21iW10gPSBbXTtcbiAgICBwdWJsaWMgZXhwbG9zaW9uczogRXhwbG9zaW9uW10gPSBbXTtcbiAgICBwdWJsaWMgbWFwITogVGlsZVtdW107IC8vIFRoZSBnYW1lIG1hcCBncmlkXG5cbiAgICBwcml2YXRlIHBsYXllcjE6IFBsYXllciB8IG51bGwgPSBudWxsOyAvLyBSZWZlcmVuY2UgdG8gdGhlIGh1bWFuIHBsYXllclxuICAgIHByaXZhdGUgaHVtYW5QbGF5ZXJzQ291bnQ6IG51bWJlciA9IDA7IC8vIE51bWJlciBvZiBodW1hbiBwbGF5ZXJzIChjdXJyZW50bHkgb25seSAxKVxuICAgIHByaXZhdGUgYWlQbGF5ZXJzQ291bnQ6IG51bWJlciA9IDA7IC8vIE51bWJlciBvZiBBSSBwbGF5ZXJzXG5cbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xuXG4gICAgICAgIC8vIEV2ZW50IGxpc3RlbmVycyBmb3IgaW5wdXRcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleURvd24pO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUtleVVwKTtcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNhbnZhc0NsaWNrKTsgLy8gRm9yIFVJIGNsaWNrc1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5oYW5kbGVNb3VzZURvd24pOyAvLyBGb3IgaW5pdGlhbCB1c2VyIGludGVyYWN0aW9uIGZvciBhdWRpb1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhhbmRsZXMga2V5ZG93biBldmVudHMsIHVwZGF0aW5nIGlucHV0IHN0YXRlIGFuZCB0cmlnZ2VyaW5nIHN0YXRlIHRyYW5zaXRpb25zLlxuICAgICAqL1xuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93biA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMuaW5wdXRbZS5rZXldID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5wcmVzc2VkS2V5c1tlLmtleV0gPSB0cnVlOyAvLyBNYXJrIGFzIG5ld2x5IHByZXNzZWRcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgfHwgdGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlMpIHtcbiAgICAgICAgICAgIC8vIEFkdmFuY2Ugc3RhdGUgb24gYW55IGtleSBwcmVzcyBmcm9tIHRpdGxlL2luc3RydWN0aW9uc1xuICAgICAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kTWFuYWdlci5wbGF5QkdNKCk7IC8vIFRyeSBwbGF5aW5nIEJHTSBvbiBmaXJzdCB1c2VyIGludGVyYWN0aW9uXG4gICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VTdGF0ZShHYW1lU3RhdGUuSU5TVFJVQ1RJT05TKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNoYW5nZVN0YXRlKEdhbWVTdGF0ZS5QTEFZSU5HKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBIYW5kbGVzIGtleXVwIGV2ZW50cywgdXBkYXRpbmcgaW5wdXQgc3RhdGUuXG4gICAgICovXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlVcCA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMuaW5wdXRbZS5rZXldID0gZmFsc2U7XG4gICAgICAgIC8vIERvIE5PVCByZXNldCBwcmVzc2VkS2V5cyBoZXJlOyBpdCdzIHJlc2V0IGFmdGVyIGB1cGRhdGVgXG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEhhbmRsZXMgY2xpY2tzIG9uIHRoZSBjYW52YXMsIHByaW1hcmlseSBmb3IgVUkgZWxlbWVudHMgbGlrZSB0aGUgc291bmQgYnV0dG9uLlxuICAgICAqL1xuICAgIHByaXZhdGUgaGFuZGxlQ2FudmFzQ2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XG4gICAgICAgICAgICBjb25zdCBidXR0b25TaXplID0gMzA7XG4gICAgICAgICAgICBjb25zdCBwYWRkaW5nID0gMTA7XG4gICAgICAgICAgICBjb25zdCBidG5YID0gdGhpcy5jYW52YXMud2lkdGggLSBidXR0b25TaXplIC0gcGFkZGluZztcbiAgICAgICAgICAgIGNvbnN0IGJ0blkgPSBwYWRkaW5nO1xuXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBjbGljayBpcyB3aXRoaW4gdGhlIHNvdW5kIGJ1dHRvbiBhcmVhXG4gICAgICAgICAgICBpZiAoZS5vZmZzZXRYID49IGJ0blggJiYgZS5vZmZzZXRYIDw9IGJ0blggKyBidXR0b25TaXplICYmXG4gICAgICAgICAgICAgICAgZS5vZmZzZXRZID49IGJ0blkgJiYgZS5vZmZzZXRZIDw9IGJ0blkgKyBidXR0b25TaXplKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZE1hbmFnZXIudG9nZ2xlU291bmQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBIYW5kbGVzIGluaXRpYWwgbW91c2UgZG93biBldmVudCB0byBhdHRlbXB0IHBsYXlpbmcgQkdNLCBjaXJjdW12ZW50aW5nIGJyb3dzZXIgYXV0b3BsYXkgcG9saWNpZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBoYW5kbGVNb3VzZURvd24gPSAoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFICYmIHRoaXMuc291bmRNYW5hZ2VyKSB7XG4gICAgICAgICAgICB0aGlzLnNvdW5kTWFuYWdlci5wbGF5QkdNKCk7XG4gICAgICAgIH1cbiAgICAgICAgd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMuaGFuZGxlTW91c2VEb3duKTsgLy8gT25seSBuZWVkIHRvIGRvIHRoaXMgb25jZVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluaXRpYWxpemVzIHRoZSBnYW1lIGJ5IGxvYWRpbmcgY29uZmlndXJhdGlvbiBhbmQgYXNzZXRzLCB0aGVuIHN0YXJ0cyB0aGUgZ2FtZSBsb29wLlxuICAgICAqIEBwYXJhbSBjb25maWdQYXRoIFBhdGggdG8gdGhlIGRhdGEuanNvbiBjb25maWd1cmF0aW9uIGZpbGUuXG4gICAgICovXG4gICAgcHVibGljIGFzeW5jIGluaXQoY29uZmlnUGF0aDogc3RyaW5nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGNvbmZpZ1BhdGgpO1xuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoO1xuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcblxuICAgICAgICAgICAgLy8gTG9hZCBhc3NldHMgd2l0aCBhIGxvYWRpbmcgc2NyZWVuXG4gICAgICAgICAgICBjb25zdCBhc3NldExvYWRlciA9IG5ldyBBc3NldExvYWRlcih0aGlzLmNvbmZpZyk7XG4gICAgICAgICAgICBjb25zdCBhc3NldHMgPSBhd2FpdCBhc3NldExvYWRlci5sb2FkKChwcm9ncmVzcykgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4ocHJvZ3Jlc3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0aGlzLmltYWdlcyA9IGFzc2V0cy5pbWFnZXM7XG4gICAgICAgICAgICB0aGlzLnNvdW5kTWFuYWdlciA9IG5ldyBTb3VuZE1hbmFnZXIoYXNzZXRzLnNvdW5kcyk7XG4gICAgICAgICAgICB0aGlzLnNvdW5kTWFuYWdlci5zZXRCYWNrZ3JvdW5kTXVzaWMoJ2JnbScpO1xuXG4gICAgICAgICAgICAvLyBTdGFydCB0aGUgZ2FtZSBsb29wXG4gICAgICAgICAgICB0aGlzLmxhc3RUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgICAgICAgICB0aGlzLmxvb3AodGhpcy5sYXN0VGltZSk7XG5cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbiBvciBhc3NldHM6JywgZXJyb3IpO1xuICAgICAgICAgICAgLy8gRGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIG9uIGNhbnZhcyBpZiBjcml0aWNhbCBmYWlsdXJlXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmVkJztcbiAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBBcmlhbCc7XG4gICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdFUlJPUjogRmFpbGVkIHRvIGxvYWQgZ2FtZS4nLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRHJhd3MgYSBsb2FkaW5nIHByb2dyZXNzIHNjcmVlbiB3aGlsZSBhc3NldHMgYXJlIGJlaW5nIGxvYWRlZC5cbiAgICAgKiBAcGFyYW0gcHJvZ3Jlc3MgQ3VycmVudCBsb2FkaW5nIHByb2dyZXNzICgwIHRvIDEpLlxuICAgICAqL1xuICAgIHByaXZhdGUgZHJhd0xvYWRpbmdTY3JlZW4ocHJvZ3Jlc3M6IG51bWJlcikge1xuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snO1xuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KCdMb2FkaW5nIEFzc2V0cy4uLicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDIwKTtcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QodGhpcy5jYW52YXMud2lkdGggLyAyIC0gMTAwLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyLCAyMDAsIDEwKTtcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2dyZWVuJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QodGhpcy5jYW52YXMud2lkdGggLyAyIC0gMTAwLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyLCAyMDAgKiBwcm9ncmVzcywgMTApO1xuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHtNYXRoLnJvdW5kKHByb2dyZXNzICogMTAwKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdXAgdGhlIGluaXRpYWwgZ2FtZSBzdGF0ZSwgbWFwLCBhbmQgcGxheWVycyBmb3IgYSBuZXcgcm91bmQuXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXR1cEdhbWUoKSB7XG4gICAgICAgIHRoaXMubWFwID0gdGhpcy5nZW5lcmF0ZU1hcCgpO1xuICAgICAgICB0aGlzLnNwYXduUGxheWVycygpO1xuICAgICAgICB0aGlzLmJvbWJzID0gW107XG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucyA9IFtdO1xuICAgICAgICAvLyBFbnN1cmUgQkdNIGlzIHBsYXlpbmcgd2hlbiBnYW1lIHN0YXJ0c1xuICAgICAgICB0aGlzLnNvdW5kTWFuYWdlci5wbGF5QkdNKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hhbmdlcyB0aGUgY3VycmVudCBnYW1lIHN0YXRlIGFuZCBwZXJmb3JtcyBhbnkgbmVjZXNzYXJ5IGFjdGlvbnMgZm9yIHRoZSBuZXcgc3RhdGUuXG4gICAgICogQHBhcmFtIG5ld1N0YXRlIFRoZSBHYW1lU3RhdGUgdG8gdHJhbnNpdGlvbiB0by5cbiAgICAgKi9cbiAgICBwcml2YXRlIGNoYW5nZVN0YXRlKG5ld1N0YXRlOiBHYW1lU3RhdGUpIHtcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBuZXdTdGF0ZTtcbiAgICAgICAgaWYgKG5ld1N0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xuICAgICAgICAgICAgdGhpcy5zZXR1cEdhbWUoKTsgLy8gUmUtaW5pdGlhbGl6ZSBtYXAgYW5kIHBsYXllcnMgZm9yIGEgbmV3IGdhbWVcbiAgICAgICAgfSBlbHNlIGlmIChuZXdTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU4gfHwgbmV3U3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRSkge1xuICAgICAgICAgICAgdGhpcy5zb3VuZE1hbmFnZXIuc3RvcEJHTSgpOyAvLyBTdG9wIEJHTSBvbiBnYW1lIG92ZXJcbiAgICAgICAgfSBlbHNlIGlmIChuZXdTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFKSB7XG4gICAgICAgICAgICAvLyBPbiByZXR1cm5pbmcgdG8gdGl0bGUsIHJlLWVuYWJsZSBCR00gcGxheWJhY2sgYXR0ZW1wdHNcbiAgICAgICAgICAgIHRoaXMuc291bmRNYW5hZ2VyLnBsYXlCR00oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBtYWluIGdhbWUgbG9vcCwgY2FsbGVkIHJlcGVhdGVkbHkgdmlhIHJlcXVlc3RBbmltYXRpb25GcmFtZS5cbiAgICAgKiBAcGFyYW0gY3VycmVudFRpbWUgQ3VycmVudCB0aW1lc3RhbXAgZnJvbSBwZXJmb3JtYW5jZS5ub3coKS5cbiAgICAgKi9cbiAgICBwcml2YXRlIGxvb3AgPSAoY3VycmVudFRpbWU6IG51bWJlcikgPT4ge1xuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xuICAgICAgICB0aGlzLmxhc3RUaW1lID0gY3VycmVudFRpbWU7XG5cbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcblxuICAgICAgICAvLyBDbGVhciBwcmVzc2VkIGtleXMgZm9yIHRoZSBuZXh0IGZyYW1lXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHRoaXMucHJlc3NlZEtleXMpIHtcbiAgICAgICAgICAgIHRoaXMucHJlc3NlZEtleXNba2V5XSA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hbmltYXRpb25GcmFtZUlkID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMubG9vcCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgdGhlIGdhbWUgbG9naWMgYmFzZWQgb24gdGhlIGN1cnJlbnQgc3RhdGUuXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSBUaW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgdXBkYXRlLlxuICAgICAqL1xuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxuICAgICAgICAgICAgICAgIC8vIE5vdGhpbmcgdG8gdXBkYXRlLCB3YWl0aW5nIGZvciB1c2VyIGlucHV0XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlR2FtZVBsYXlpbmcoZGVsdGFUaW1lKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU46XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRTpcbiAgICAgICAgICAgICAgICAvLyBXYWl0IGZvciAnRW50ZXInIGtleSB0byByZXN0YXJ0XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucHJlc3NlZEtleXNbJ0VudGVyJ10pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGFuZ2VTdGF0ZShHYW1lU3RhdGUuVElUTEUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgZ2FtZSBsb2dpYyBzcGVjaWZpY2FsbHkgZm9yIHRoZSBQTEFZSU5HIHN0YXRlLlxuICAgICAqIEBwYXJhbSBkZWx0YVRpbWUgVGltZSBlbGFwc2VkLlxuICAgICAqL1xuICAgIHByaXZhdGUgdXBkYXRlR2FtZVBsYXlpbmcoZGVsdGFUaW1lOiBudW1iZXIpIHtcbiAgICAgICAgLy8gVXBkYXRlIHBsYXllcnNcbiAgICAgICAgdGhpcy5wbGF5ZXJzLmZvckVhY2gocGxheWVyID0+IHtcbiAgICAgICAgICAgIHBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKTtcbiAgICAgICAgICAgIGlmICghcGxheWVyLmlzQUkgJiYgIXBsYXllci5pc0RlYWQpIHsgLy8gSHVtYW4gcGxheWVyIGlucHV0XG4gICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVQbGF5ZXJJbnB1dChwbGF5ZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBVcGRhdGUgYm9tYnMgKHJldmVyc2UgbG9vcCBmb3Igc2FmZSByZW1vdmFsKVxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5ib21icy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgdGhpcy5ib21ic1tpXS51cGRhdGUoZGVsdGFUaW1lLCB0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVwZGF0ZSBleHBsb3Npb25zIChyZXZlcnNlIGxvb3AgZm9yIHNhZmUgcmVtb3ZhbClcbiAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMuZXhwbG9zaW9ucy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zW2ldLnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMpO1xuICAgICAgICAgICAgaWYgKHRoaXMuZXhwbG9zaW9uc1tpXS50aW1lciA8PSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY2hlY2tDb2xsaXNpb25zKCk7XG4gICAgICAgIHRoaXMuY2hlY2tHYW1lRW5kQ29uZGl0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGFuZGxlcyBrZXlib2FyZCBpbnB1dCBmb3IgdGhlIGh1bWFuIHBsYXllci5cbiAgICAgKiBAcGFyYW0gcGxheWVyIFRoZSBodW1hbiBwbGF5ZXIgb2JqZWN0LlxuICAgICAqL1xuICAgIHByaXZhdGUgaGFuZGxlUGxheWVySW5wdXQocGxheWVyOiBQbGF5ZXIpIHtcbiAgICAgICAgLy8gUGxheWVyIG1vdmVtZW50IGlzIG5vdyBzZXBhcmF0ZSBmcm9tIGJvbWIgcGxhY2VtZW50IGxvZ2ljLFxuICAgICAgICAvLyBzbyBgaWYgKHBsYXllci5pc01vdmluZykgcmV0dXJuO2AgaXMgb25seSBmb3IgbW92ZW1lbnQuXG4gICAgICAgIGxldCBtb3ZlZCA9IGZhbHNlO1xuICAgICAgICBpZiAodGhpcy5pbnB1dFsnQXJyb3dVcCddIHx8IHRoaXMuaW5wdXRbJ3cnXSkge1xuICAgICAgICAgICAgbW92ZWQgPSBwbGF5ZXIuYXR0ZW1wdE1vdmUoMCwgLTEsIHRoaXMubWFwLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemUpO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuaW5wdXRbJ0Fycm93RG93biddIHx8IHRoaXMuaW5wdXRbJ3MnXSkge1xuICAgICAgICAgICAgbW92ZWQgPSBwbGF5ZXIuYXR0ZW1wdE1vdmUoMCwgMSwgdGhpcy5tYXAsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5pbnB1dFsnQXJyb3dMZWZ0J10gfHwgdGhpcy5pbnB1dFsnYSddKSB7XG4gICAgICAgICAgICBtb3ZlZCA9IHBsYXllci5hdHRlbXB0TW92ZSgtMSwgMCwgdGhpcy5tYXAsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5pbnB1dFsnQXJyb3dSaWdodCddIHx8IHRoaXMuaW5wdXRbJ2QnXSkge1xuICAgICAgICAgICAgbW92ZWQgPSBwbGF5ZXIuYXR0ZW1wdE1vdmUoMSwgMCwgdGhpcy5tYXAsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobW92ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc291bmRNYW5hZ2VyLnBsYXlTb3VuZCgncGxheWVyX21vdmUnLCBmYWxzZSwgMC4zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLnByZXNzZWRLZXlzWycgJ10pIHsgLy8gU3BhY2ViYXIgZm9yIGJvbWJcbiAgICAgICAgICAgIGNvbnN0IG5ld0JvbWIgPSBwbGF5ZXIucGxhY2VCb21iKHRoaXMpO1xuICAgICAgICAgICAgaWYgKG5ld0JvbWIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmJvbWJzLnB1c2gobmV3Qm9tYik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgZm9yIGNvbGxpc2lvbnMgYmV0d2VlbiB2YXJpb3VzIGdhbWUgb2JqZWN0cy5cbiAgICAgKi9cbiAgICBwcml2YXRlIGNoZWNrQ29sbGlzaW9ucygpIHtcbiAgICAgICAgY29uc3QgdGlsZVNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGlsZVNpemU7XG5cbiAgICAgICAgLy8gUGxheWVyLUV4cGxvc2lvbiBjb2xsaXNpb25cbiAgICAgICAgdGhpcy5wbGF5ZXJzLmZvckVhY2gocGxheWVyID0+IHtcbiAgICAgICAgICAgIGlmIChwbGF5ZXIuaXNEZWFkIHx8IHBsYXllci5pbW11bmVUaW1lciA+IDApIHJldHVybjsgLy8gU2tpcCBkZWFkIG9yIGltbXVuZSBwbGF5ZXJzXG4gICAgICAgICAgICB0aGlzLmV4cGxvc2lvbnMuZm9yRWFjaChleHBsb3Npb24gPT4ge1xuICAgICAgICAgICAgICAgIGlmIChwbGF5ZXIuY29sbGlkZXNXaXRoKGV4cGxvc2lvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgcGxheWVyLnRha2VEYW1hZ2UodGhpcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFBsYXllci1Qb3dlclVwIGNvbGxpc2lvblxuICAgICAgICB0aGlzLnBsYXllcnMuZm9yRWFjaChwbGF5ZXIgPT4ge1xuICAgICAgICAgICAgaWYgKHBsYXllci5pc0RlYWQpIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IHBsYXllclRpbGUgPSBwbGF5ZXIuZ2V0VGlsZVBvcyh0aWxlU2l6ZSk7XG4gICAgICAgICAgICBjb25zdCBtYXBUaWxlID0gdGhpcy5tYXBbcGxheWVyVGlsZS5yb3ddW3BsYXllclRpbGUuY29sXTtcbiAgICAgICAgICAgIGlmIChtYXBUaWxlLnR5cGUgPT09IFRpbGVUeXBlLkVNUFRZICYmIG1hcFRpbGUuaGFzUG93ZXJVcCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHBsYXllci5hcHBseVBvd2VyVXAobWFwVGlsZS5oYXNQb3dlclVwLCB0aGlzKTtcbiAgICAgICAgICAgICAgICBtYXBUaWxlLmhhc1Bvd2VyVXAgPSBudWxsOyAvLyBQb3dlci11cCBjb2xsZWN0ZWRcbiAgICAgICAgICAgICAgICBtYXBUaWxlLmltYWdlTmFtZSA9ICdlbXB0eV90aWxlJzsgLy8gVXBkYXRlIHRpbGUgaW1hZ2UgYWZ0ZXIgY29sbGVjdGlvblxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmlnZ2VycyBhbiBleHBsb3Npb24gb3JpZ2luYXRpbmcgZnJvbSBhIGdpdmVuIGJvbWIuXG4gICAgICogSGFuZGxlcyBleHBsb3Npb24gcHJvcGFnYXRpb24sIGJsb2NrIGRlc3RydWN0aW9uLCBhbmQgY2hhaW4gcmVhY3Rpb25zLlxuICAgICAqIEBwYXJhbSBib21iIFRoZSBib21iIHRoYXQgaXMgZXhwbG9kaW5nLlxuICAgICAqL1xuICAgIHB1YmxpYyB0cmlnZ2VyRXhwbG9zaW9uKGJvbWI6IEJvbWIpIHtcbiAgICAgICAgdGhpcy5zb3VuZE1hbmFnZXIucGxheVNvdW5kKCdleHBsb3Npb24nKTtcblxuICAgICAgICBjb25zdCB0aWxlU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aWxlU2l6ZTtcbiAgICAgICAgY29uc3QgYm9tYlRpbGUgPSBib21iLmdldFRpbGVQb3ModGlsZVNpemUpO1xuICAgICAgICBjb25zdCBtYXBXaWR0aCA9IHRoaXMuY29uZmlnLm1hcFNldHRpbmdzLm1hcFdpZHRoO1xuICAgICAgICBjb25zdCBtYXBIZWlnaHQgPSB0aGlzLmNvbmZpZy5tYXBTZXR0aW5ncy5tYXBIZWlnaHQ7XG5cbiAgICAgICAgLy8gUmVsZWFzZSBib21iIGNvdW50IGZvciB0aGUgb3duZXIgb2YgdGhlIGJvbWJcbiAgICAgICAgY29uc3Qgb3duZXIgPSB0aGlzLnBsYXllcnMuZmluZChwID0+IHAuaWQgPT09IGJvbWIub3duZXJJZCk7XG4gICAgICAgIGlmIChvd25lcikge1xuICAgICAgICAgICAgb3duZXIuY3VycmVudEJvbWJzLS07XG4gICAgICAgICAgICBpZiAob3duZXIuY3VycmVudEJvbWJzIDwgMCkgb3duZXIuY3VycmVudEJvbWJzID0gMDsgLy8gU2FuaXR5IGNoZWNrXG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW1vdmUgdGhlIGV4cGxvZGluZyBib21iIGZyb20gdGhlIGFjdGl2ZSBib21icyBsaXN0XG4gICAgICAgIHRoaXMuYm9tYnMgPSB0aGlzLmJvbWJzLmZpbHRlcihiID0+IGIgIT09IGJvbWIpO1xuXG4gICAgICAgIC8vIENyZWF0ZSB0aGUgY2VudGVyIGV4cGxvc2lvbiBzcHJpdGVcbiAgICAgICAgdGhpcy5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbihcbiAgICAgICAgICAgIGJvbWJUaWxlLmNvbCAqIHRpbGVTaXplLCBib21iVGlsZS5yb3cgKiB0aWxlU2l6ZSxcbiAgICAgICAgICAgIHRpbGVTaXplLCB0aWxlU2l6ZSwgJ2V4cGxvc2lvbl9jZW50ZXInLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZXhwbG9zaW9uRHVyYXRpb24sIHRydWVcbiAgICAgICAgKSk7XG5cbiAgICAgICAgLy8gU3ByZWFkIGV4cGxvc2lvbiBpbiA0IGNhcmRpbmFsIGRpcmVjdGlvbnNcbiAgICAgICAgY29uc3QgZGlyZWN0aW9ucyA9IFtcbiAgICAgICAgICAgIHsgZHI6IDAsIGRjOiAxLCBpc1ZlcnRpY2FsOiBmYWxzZSB9LCAvLyBSaWdodFxuICAgICAgICAgICAgeyBkcjogMCwgZGM6IC0xLCBpc1ZlcnRpY2FsOiBmYWxzZSB9LCAvLyBMZWZ0XG4gICAgICAgICAgICB7IGRyOiAxLCBkYzogMCwgaXNWZXJ0aWNhbDogdHJ1ZSB9LCAgLy8gRG93blxuICAgICAgICAgICAgeyBkcjogLTEsIGRjOiAwLCBpc1ZlcnRpY2FsOiB0cnVlIH0gICAvLyBVcFxuICAgICAgICBdO1xuXG4gICAgICAgIGRpcmVjdGlvbnMuZm9yRWFjaChkaXIgPT4ge1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPD0gYm9tYi5yYW5nZTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0Um93ID0gYm9tYlRpbGUucm93ICsgZGlyLmRyICogaTtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRDb2wgPSBib21iVGlsZS5jb2wgKyBkaXIuZGMgKiBpO1xuXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgbWFwIGJvdW5kYXJpZXNcbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0Um93IDwgMCB8fCB0YXJnZXRSb3cgPj0gbWFwSGVpZ2h0IHx8IHRhcmdldENvbCA8IDAgfHwgdGFyZ2V0Q29sID49IG1hcFdpZHRoKSBicmVhaztcblxuICAgICAgICAgICAgICAgIGNvbnN0IHRhcmdldFRpbGUgPSB0aGlzLm1hcFt0YXJnZXRSb3ddW3RhcmdldENvbF07XG5cbiAgICAgICAgICAgICAgICAvLyBTb2xpZCBibG9ja3Mgc3RvcCBleHBsb3Npb25zXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldFRpbGUudHlwZSA9PT0gVGlsZVR5cGUuU09MSUQpIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgbGV0IGV4cGxvc2lvbkltYWdlTmFtZSA9IGRpci5pc1ZlcnRpY2FsID8gJ2V4cGxvc2lvbl92ZXJ0aWNhbCcgOiAnZXhwbG9zaW9uX2hvcml6b250YWwnO1xuICAgICAgICAgICAgICAgIC8vIFVzZSBlbmQgY2FwIGltYWdlIGZvciB0aGUgbGFzdCBzZWdtZW50IG9yIGlmIGl0IGhpdHMgYSBicmVha2FibGUgYmxvY2tcbiAgICAgICAgICAgICAgICBpZiAoaSA9PT0gYm9tYi5yYW5nZSB8fCB0YXJnZXRUaWxlLnR5cGUgPT09IFRpbGVUeXBlLkJSRUFLQUJMRSkge1xuICAgICAgICAgICAgICAgICAgICBleHBsb3Npb25JbWFnZU5hbWUgPSBkaXIuaXNWZXJ0aWNhbCA/ICdleHBsb3Npb25fZW5kX3ZlcnRpY2FsJyA6ICdleHBsb3Npb25fZW5kX2hvcml6b250YWwnO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEFkZCBleHBsb3Npb24gc2VnbWVudFxuICAgICAgICAgICAgICAgIHRoaXMuZXhwbG9zaW9ucy5wdXNoKG5ldyBFeHBsb3Npb24oXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldENvbCAqIHRpbGVTaXplLCB0YXJnZXRSb3cgKiB0aWxlU2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgdGlsZVNpemUsIHRpbGVTaXplLCBleHBsb3Npb25JbWFnZU5hbWUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5leHBsb3Npb25EdXJhdGlvbiwgZmFsc2UsIGRpci5pc1ZlcnRpY2FsLCBpID09PSBib21iLnJhbmdlXG4gICAgICAgICAgICAgICAgKSk7XG5cbiAgICAgICAgICAgICAgICAvLyBJZiBpdCBoaXRzIGEgYnJlYWthYmxlIGJsb2NrLCBkZXN0cm95IGl0IGFuZCBzdG9wIHNwcmVhZGluZyBpbiB0aGlzIGRpcmVjdGlvblxuICAgICAgICAgICAgICAgIGlmICh0YXJnZXRUaWxlLnR5cGUgPT09IFRpbGVUeXBlLkJSRUFLQUJMRSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRlc3Ryb3lCbG9jayh0YXJnZXRSb3csIHRhcmdldENvbCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIElmIGl0IGhpdHMgYW5vdGhlciBib21iLCB0cmlnZ2VyIHRoYXQgYm9tYiBpbW1lZGlhdGVseVxuICAgICAgICAgICAgICAgIGNvbnN0IGhpdEJvbWIgPSB0aGlzLmJvbWJzLmZpbmQoYiA9PlxuICAgICAgICAgICAgICAgICAgICBiLmdldFRpbGVQb3ModGlsZVNpemUpLnJvdyA9PT0gdGFyZ2V0Um93ICYmIGIuZ2V0VGlsZVBvcyh0aWxlU2l6ZSkuY29sID09PSB0YXJnZXRDb2xcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmIChoaXRCb21iKSB7XG4gICAgICAgICAgICAgICAgICAgIGhpdEJvbWIudGltZXIgPSAwOyAvLyBTZXQgdGltZXIgdG8gMCB0byB0cmlnZ2VyIGl0cyBleHBsb3Npb24gaW4gdGhlIG5leHQgdXBkYXRlIGN5Y2xlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXN0cm95cyBhIGJyZWFrYWJsZSBibG9jayBhdCB0aGUgZ2l2ZW4gbWFwIGNvb3JkaW5hdGVzLlxuICAgICAqIE1heSBkcm9wIGEgcG93ZXItdXAuXG4gICAgICogQHBhcmFtIHJvdyBSb3cgb2YgdGhlIGJsb2NrLlxuICAgICAqIEBwYXJhbSBjb2wgQ29sdW1uIG9mIHRoZSBibG9jay5cbiAgICAgKi9cbiAgICBwcml2YXRlIGRlc3Ryb3lCbG9jayhyb3c6IG51bWJlciwgY29sOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5tYXBbcm93XVtjb2xdLnR5cGUgPSBUaWxlVHlwZS5FTVBUWTtcbiAgICAgICAgdGhpcy5tYXBbcm93XVtjb2xdLmltYWdlTmFtZSA9ICdlbXB0eV90aWxlJztcbiAgICAgICAgdGhpcy5zb3VuZE1hbmFnZXIucGxheVNvdW5kKCdibG9ja19icmVhaycpO1xuXG4gICAgICAgIC8vIENoYW5jZSB0byBkcm9wIHBvd2VyLXVwXG4gICAgICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBvd2VyVXBEcm9wQ2hhbmNlKSB7XG4gICAgICAgICAgICBjb25zdCBwb3dlclVwVHlwZXMgPSBbUG93ZXJVcFR5cGUuQk9NQl9VUCwgUG93ZXJVcFR5cGUuUkFOR0VfVVAsIFBvd2VyVXBUeXBlLlNQRUVEX1VQXTtcbiAgICAgICAgICAgIGNvbnN0IHJhbmRvbVBvd2VyVXAgPSBwb3dlclVwVHlwZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogcG93ZXJVcFR5cGVzLmxlbmd0aCldO1xuICAgICAgICAgICAgdGhpcy5tYXBbcm93XVtjb2xdLmhhc1Bvd2VyVXAgPSByYW5kb21Qb3dlclVwO1xuICAgICAgICAgICAgdGhpcy5tYXBbcm93XVtjb2xdLmltYWdlTmFtZSA9IHRoaXMuZ2V0UG93ZXJVcEltYWdlTmFtZShyYW5kb21Qb3dlclVwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGFwcHJvcHJpYXRlIGltYWdlIG5hbWUgZm9yIGEgZ2l2ZW4gUG93ZXJVcFR5cGUuXG4gICAgICogQHBhcmFtIHR5cGUgVGhlIHR5cGUgb2YgcG93ZXItdXAuXG4gICAgICogQHJldHVybnMgVGhlIGltYWdlIG5hbWUgc3RyaW5nLlxuICAgICAqL1xuICAgIHByaXZhdGUgZ2V0UG93ZXJVcEltYWdlTmFtZSh0eXBlOiBQb3dlclVwVHlwZSk6IHN0cmluZyB7XG4gICAgICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICAgICAgY2FzZSBQb3dlclVwVHlwZS5CT01CX1VQOiByZXR1cm4gJ3Bvd2VydXBfYm9tYic7XG4gICAgICAgICAgICBjYXNlIFBvd2VyVXBUeXBlLlJBTkdFX1VQOiByZXR1cm4gJ3Bvd2VydXBfcmFuZ2UnO1xuICAgICAgICAgICAgY2FzZSBQb3dlclVwVHlwZS5TUEVFRF9VUDogcmV0dXJuICdwb3dlcnVwX3NwZWVkJztcbiAgICAgICAgICAgIGRlZmF1bHQ6IHJldHVybiAnZW1wdHlfdGlsZSc7IC8vIEZhbGxiYWNrXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVja3MgaWYgdGhlIGdhbWUgd2luIG9yIGxvc2UgY29uZGl0aW9ucyBoYXZlIGJlZW4gbWV0LlxuICAgICAqL1xuICAgIHByaXZhdGUgY2hlY2tHYW1lRW5kQ29uZGl0aW9uKCkge1xuICAgICAgICBjb25zdCBsaXZlSHVtYW5QbGF5ZXJzID0gdGhpcy5wbGF5ZXJzLmZpbHRlcihwID0+ICFwLmlzQUkgJiYgIXAuaXNEZWFkKTtcbiAgICAgICAgY29uc3QgbGl2ZUFJUGxheWVycyA9IHRoaXMucGxheWVycy5maWx0ZXIocCA9PiBwLmlzQUkgJiYgIXAuaXNEZWFkKTtcblxuICAgICAgICBpZiAobGl2ZUh1bWFuUGxheWVycy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuY2hhbmdlU3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUl9MT1NFKTtcbiAgICAgICAgfSBlbHNlIGlmIChsaXZlQUlQbGF5ZXJzLmxlbmd0aCA9PT0gMCAmJiB0aGlzLmh1bWFuUGxheWVyc0NvdW50ID4gMCkge1xuICAgICAgICAgICAgdGhpcy5jaGFuZ2VTdGF0ZShHYW1lU3RhdGUuR0FNRV9PVkVSX1dJTik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW5kZXJzIGFsbCBnYW1lIGVsZW1lbnRzIGJhc2VkIG9uIHRoZSBjdXJyZW50IGdhbWUgc3RhdGUuXG4gICAgICovXG4gICAgcHJpdmF0ZSByZW5kZXIoKSB7XG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcblxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0luc3RydWN0aW9uc1NjcmVlbigpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lUGxheWluZygpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSX1dJTjpcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlclNjcmVlbih0cnVlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUl9MT1NFOlxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyU2NyZWVuKGZhbHNlKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERyYXdzIHRoZSB0aXRsZSBzY3JlZW4uXG4gICAgICovXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKSB7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnNDhweCBBcmlhbCc7IC8vIFVzaW5nIEFyaWFsIGFzIGEgY29tbW9uIGZvbnQuIENvdWxkIGJlICdQcmVzcyBTdGFydCAyUCcgZm9yIHBpeGVsIGFydCBzdHlsZSBpZiBsb2FkZWQuXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50ZXh0LnRpdGxlU2NyZWVuWzBdLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XG5cbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ1ByZXNzIGFueSBrZXkgdG8gc3RhcnQnLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XG5cbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcxNnB4IEFyaWFsJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoJ0EgQ3JhenkgQm9tYmVyIEZhbiBHYW1lJywgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLSAzMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRHJhd3MgdGhlIGdhbWUgaW5zdHJ1Y3Rpb25zIHNjcmVlbi5cbiAgICAgKi9cbiAgICBwcml2YXRlIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKSB7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xuXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzZweCBBcmlhbCc7XG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnSG93IHRvIFBsYXknLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIDgwKTtcblxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzIwcHggQXJpYWwnO1xuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XG4gICAgICAgIGxldCB5T2Zmc2V0ID0gMTUwO1xuICAgICAgICB0aGlzLmNvbmZpZy50ZXh0Lmluc3RydWN0aW9uc1NjcmVlbi5mb3JFYWNoKGxpbmUgPT4ge1xuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobGluZSwgdGhpcy5jYW52YXMud2lkdGggLyA0LCB5T2Zmc2V0KTtcbiAgICAgICAgICAgIHlPZmZzZXQgKz0gMzA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnUHJlc3MgYW55IGtleSB0byBjb250aW51ZS4uLicsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gODApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERyYXdzIHRoZSBtYWluIGdhbWUgcGxheWluZyBzY3JlZW4sIGluY2x1ZGluZyBtYXAsIHBsYXllcnMsIGJvbWJzLCBleHBsb3Npb25zLCBhbmQgVUkuXG4gICAgICovXG4gICAgcHJpdmF0ZSBkcmF3R2FtZVBsYXlpbmcoKSB7XG4gICAgICAgIGNvbnN0IHRpbGVTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnRpbGVTaXplO1xuXG4gICAgICAgIC8vIERyYXcgbWFwIHRpbGVzXG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgdGhpcy5tYXAubGVuZ3RoOyByKyspIHtcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgdGhpcy5tYXBbcl0ubGVuZ3RoOyBjKyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0aWxlID0gdGhpcy5tYXBbcl1bY107XG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gdGhpcy5pbWFnZXMuZ2V0KHRpbGUuaW1hZ2VOYW1lKTtcbiAgICAgICAgICAgICAgICBpZiAoaW1nKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShpbWcsIGMgKiB0aWxlU2l6ZSwgciAqIHRpbGVTaXplLCB0aWxlU2l6ZSwgdGlsZVNpemUpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrIGNvbG9ycyBmb3IgZGVidWdnaW5nIGlmIGltYWdlcyBhcmUgbWlzc2luZ1xuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHRpbGUudHlwZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBUaWxlVHlwZS5FTVBUWTogdGhpcy5jdHguZmlsbFN0eWxlID0gJyMwMDY0MDAnOyBicmVhazsgLy8gRGFyayBHcmVlblxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSBUaWxlVHlwZS5TT0xJRDogdGhpcy5jdHguZmlsbFN0eWxlID0gJyM2OTY5NjknOyBicmVhazsgLy8gRGltIEdyYXlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgVGlsZVR5cGUuQlJFQUtBQkxFOiB0aGlzLmN0eC5maWxsU3R5bGUgPSAnIzhCNDUxMyc7IGJyZWFrOyAvLyBTYWRkbGUgQnJvd25cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChjICogdGlsZVNpemUsIHIgKiB0aWxlU2l6ZSwgdGlsZVNpemUsIHRpbGVTaXplKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEcmF3IGJvbWJzXG4gICAgICAgIHRoaXMuYm9tYnMuZm9yRWFjaChib21iID0+IGJvbWIuZHJhdyh0aGlzLmN0eCwgdGhpcy5pbWFnZXMsIHRpbGVTaXplKSk7XG5cbiAgICAgICAgLy8gRHJhdyBwbGF5ZXJzXG4gICAgICAgIHRoaXMucGxheWVycy5mb3JFYWNoKHBsYXllciA9PiBwbGF5ZXIuZHJhdyh0aGlzLmN0eCwgdGhpcy5pbWFnZXMsIHRpbGVTaXplKSk7XG5cbiAgICAgICAgLy8gRHJhdyBleHBsb3Npb25zIChvbiB0b3Agb2YgZXZlcnl0aGluZyBlbHNlIGZvciB2aXN1YWwgcHJpb3JpdHkpXG4gICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGV4cGxvc2lvbiA9PiBleHBsb3Npb24uZHJhdyh0aGlzLmN0eCwgdGhpcy5pbWFnZXMsIHRpbGVTaXplKSk7XG5cbiAgICAgICAgLy8gRHJhdyBVSSAtIFBsYXllciBsaXZlcywgYm9tYiBjb3VudHMsIHJhbmdlXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMTZweCBBcmlhbCc7XG4gICAgICAgIGxldCB1aVkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLSAyMDtcbiAgICAgICAgbGV0IHVpWCA9IDEwO1xuICAgICAgICB0aGlzLnBsYXllcnMuZmlsdGVyKHAgPT4gIXAuaXNBSSkuZm9yRWFjaChwbGF5ZXIgPT4geyAvLyBPbmx5IHNob3cgVUkgZm9yIGh1bWFuIHBsYXllcnNcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBQJHtwbGF5ZXIuaWR9IExpdmVzOiAke3BsYXllci5saXZlc30gQm9tYnM6ICR7cGxheWVyLmN1cnJlbnRCb21ic30vJHtwbGF5ZXIubWF4Qm9tYnN9IFJhbmdlOiAke3BsYXllci5ib21iUmFuZ2V9YCwgdWlYLCB1aVkpO1xuICAgICAgICAgICAgdWlYICs9IDI1MDsgLy8gT2Zmc2V0IGZvciBuZXh0IHBsYXllcidzIFVJIGlmIG11bHRpcGxlIGh1bWFuIHBsYXllcnNcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRHJhdyBzb3VuZCB0b2dnbGUgYnV0dG9uXG4gICAgICAgIGNvbnN0IGJ1dHRvblNpemUgPSAzMDtcbiAgICAgICAgY29uc3QgcGFkZGluZyA9IDEwO1xuICAgICAgICBjb25zdCBidG5YID0gdGhpcy5jYW52YXMud2lkdGggLSBidXR0b25TaXplIC0gcGFkZGluZztcbiAgICAgICAgY29uc3QgYnRuWSA9IHBhZGRpbmc7XG4gICAgICAgIGNvbnN0IHNvdW5kSW1nTmFtZSA9IHRoaXMuc291bmRNYW5hZ2VyLnNvdW5kT24gPyAnaWNvbl9zb3VuZF9vbicgOiAnaWNvbl9zb3VuZF9vZmYnO1xuICAgICAgICBjb25zdCBzb3VuZEltZyA9IHRoaXMuaW1hZ2VzLmdldChzb3VuZEltZ05hbWUpO1xuICAgICAgICBpZiAoc291bmRJbWcpIHtcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShzb3VuZEltZywgYnRuWCwgYnRuWSwgYnV0dG9uU2l6ZSwgYnV0dG9uU2l6ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBGYWxsYmFjayBmb3Igc291bmQgYnV0dG9uIGlmIGltYWdlcyBhcmUgbWlzc2luZ1xuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5zb3VuZE1hbmFnZXIuc291bmRPbiA/ICdncmVlbicgOiAncmVkJztcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGJ0blgsIGJ0blksIGJ1dHRvblNpemUsIGJ1dHRvblNpemUpO1xuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcbiAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMTBweCBBcmlhbCc7XG4gICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuc291bmRNYW5hZ2VyLnNvdW5kT24gPyAnT04nIDogJ09GRicsIGJ0blggKyBidXR0b25TaXplIC8gMiwgYnRuWSArIGJ1dHRvblNpemUgLyAyICsgNCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3cyB0aGUgZ2FtZSBvdmVyIHNjcmVlbiAod2luIG9yIGxvc2UpLlxuICAgICAqIEBwYXJhbSB3aW4gVHJ1ZSBpZiB0aGUgcGxheWVyIHdvbiwgZmFsc2UgaWYgbG9zdC5cbiAgICAgKi9cbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbih3aW46IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XG5cbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0OHB4IEFyaWFsJztcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSB3aW4gPyB0aGlzLmNvbmZpZy50ZXh0LmdhbWVPdmVyV2luWzBdIDogdGhpcy5jb25maWcudGV4dC5nYW1lT3Zlckxvc2VbMF07XG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KG1lc3NhZ2UsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcblxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCgnUHJlc3MgRW50ZXIgdG8gcmVzdGFydCcsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcbiAgICB9XG5cbiAgICAvLyAtLS0gTWFwIEdlbmVyYXRpb24gJiBQbGF5ZXIgU3Bhd25pbmcgLS0tXG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSBuZXcgZ2FtZSBtYXAgYmFzZWQgb24gY29uZmlndXJhdGlvbi5cbiAgICAgKiBAcmV0dXJucyBUaGUgZ2VuZXJhdGVkIDJEIFRpbGUgYXJyYXkuXG4gICAgICovXG4gICAgcHJpdmF0ZSBnZW5lcmF0ZU1hcCgpOiBUaWxlW11bXSB7XG4gICAgICAgIGNvbnN0IHsgbWFwV2lkdGgsIG1hcEhlaWdodCB9ID0gdGhpcy5jb25maWcubWFwU2V0dGluZ3M7XG4gICAgICAgIGNvbnN0IHsgYnJlYWthYmxlQmxvY2tEZW5zaXR5IH0gPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3M7XG4gICAgICAgIGNvbnN0IG1hcDogVGlsZVtdW10gPSBbXTtcblxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IG1hcEhlaWdodDsgcisrKSB7XG4gICAgICAgICAgICBtYXBbcl0gPSBbXTtcbiAgICAgICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgbWFwV2lkdGg7IGMrKykge1xuICAgICAgICAgICAgICAgIGlmIChyID09PSAwIHx8IHIgPT09IG1hcEhlaWdodCAtIDEgfHwgYyA9PT0gMCB8fCBjID09PSBtYXBXaWR0aCAtIDEpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gT3V0ZXIgcGVyaW1ldGVyIGlzIHNvbGlkIGJsb2Nrc1xuICAgICAgICAgICAgICAgICAgICBtYXBbcl1bY10gPSBuZXcgVGlsZShUaWxlVHlwZS5TT0xJRCwgJ3NvbGlkX2Jsb2NrJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyICUgMiA9PT0gMCAmJiBjICUgMiA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaXhlZCBncmlkIG9mIHNvbGlkIGJsb2Nrc1xuICAgICAgICAgICAgICAgICAgICBtYXBbcl1bY10gPSBuZXcgVGlsZShUaWxlVHlwZS5TT0xJRCwgJ3NvbGlkX2Jsb2NrJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gUmFuZG9tbHkgcGxhY2UgYnJlYWthYmxlIGJsb2Nrc1xuICAgICAgICAgICAgICAgICAgICBpZiAoTWF0aC5yYW5kb20oKSA8IGJyZWFrYWJsZUJsb2NrRGVuc2l0eSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWFwW3JdW2NdID0gbmV3IFRpbGUoVGlsZVR5cGUuQlJFQUtBQkxFLCAnYnJlYWthYmxlX2Jsb2NrJyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXBbcl1bY10gPSBuZXcgVGlsZShUaWxlVHlwZS5FTVBUWSwgJ2VtcHR5X3RpbGUnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWFwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwYXducyBwbGF5ZXJzIChodW1hbiBhbmQgQUkpIGF0IGRlc2lnbmF0ZWQgc3RhcnRpbmcgcG9pbnRzIGFuZCBjbGVhcnMgc3Vycm91bmRpbmcgdGlsZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBzcGF3blBsYXllcnMoKSB7XG4gICAgICAgIHRoaXMucGxheWVycyA9IFtdO1xuICAgICAgICB0aGlzLmh1bWFuUGxheWVyc0NvdW50ID0gMDtcbiAgICAgICAgdGhpcy5haVBsYXllcnNDb3VudCA9IDA7XG4gICAgICAgIGNvbnN0IHsgdGlsZVNpemUsIHBsYXllclNwZWVkLCBhaUNvdW50IH0gPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3M7XG4gICAgICAgIGNvbnN0IG1hcEhlaWdodCA9IHRoaXMubWFwLmxlbmd0aDtcbiAgICAgICAgY29uc3QgbWFwV2lkdGggPSB0aGlzLm1hcFswXS5sZW5ndGg7XG5cbiAgICAgICAgLy8gRGVmaW5lIHBvdGVudGlhbCBzcGF3biBwb2ludHMgKGNvcm5lcnMpXG4gICAgICAgIGNvbnN0IHNwYXduUG9pbnRzOiBUaWxlUG9zaXRpb25bXSA9IFtcbiAgICAgICAgICAgIHsgcm93OiAxLCBjb2w6IDEgfSxcbiAgICAgICAgICAgIHsgcm93OiBtYXBIZWlnaHQgLSAyLCBjb2w6IG1hcFdpZHRoIC0gMiB9LFxuICAgICAgICAgICAgeyByb3c6IDEsIGNvbDogbWFwV2lkdGggLSAyIH0sXG4gICAgICAgICAgICB7IHJvdzogbWFwSGVpZ2h0IC0gMiwgY29sOiAxIH1cbiAgICAgICAgXTtcblxuICAgICAgICAvLyBFbnN1cmUgc3Bhd24gcG9pbnRzIGFuZCB0aGVpciBpbW1lZGlhdGUgbmVpZ2hib3JzIGFyZSBjbGVhciBmb3IgbW92ZW1lbnQgYW5kIGJvbWIgcGxhY2VtZW50XG4gICAgICAgIHNwYXduUG9pbnRzLmZvckVhY2gocG9zID0+IHtcbiAgICAgICAgICAgIGZvciAobGV0IGRyID0gLTE7IGRyIDw9IDE7IGRyKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBkYyA9IC0xOyBkYyA8PSAxOyBkYysrKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHIgPSBwb3Mucm93ICsgZHI7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGMgPSBwb3MuY29sICsgZGM7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyID49IDAgJiYgciA8IG1hcEhlaWdodCAmJiBjID49IDAgJiYgYyA8IG1hcFdpZHRoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm1hcFtyXVtjXSA9IG5ldyBUaWxlKFRpbGVUeXBlLkVNUFRZLCAnZW1wdHlfdGlsZScpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBTcGF3biBQbGF5ZXIgMSAoaHVtYW4pXG4gICAgICAgIGNvbnN0IHBsYXllcjFTcGF3biA9IHNwYXduUG9pbnRzLnNoaWZ0KCkhOyAvLyBHZXQgZmlyc3Qgc3Bhd24gcG9pbnRcbiAgICAgICAgdGhpcy5wbGF5ZXIxID0gbmV3IFBsYXllcihcbiAgICAgICAgICAgIDEsXG4gICAgICAgICAgICBwbGF5ZXIxU3Bhd24uY29sICogdGlsZVNpemUsXG4gICAgICAgICAgICBwbGF5ZXIxU3Bhd24ucm93ICogdGlsZVNpemUsXG4gICAgICAgICAgICB0aWxlU2l6ZSwgdGlsZVNpemUsXG4gICAgICAgICAgICAncGxheWVyMScsIHBsYXllclNwZWVkLCB0aWxlU2l6ZSwgdGhpcy5jb25maWcsIGZhbHNlXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMucGxheWVycy5wdXNoKHRoaXMucGxheWVyMSk7XG4gICAgICAgIHRoaXMuaHVtYW5QbGF5ZXJzQ291bnQrKztcblxuICAgICAgICAvLyBTcGF3biBBSSBwbGF5ZXJzXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYWlDb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoc3Bhd25Qb2ludHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdOb3QgZW5vdWdoIHNwYXduIHBvaW50cyBmb3IgYWxsIEFJIHBsYXllcnMuJyk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhaVNwYXduID0gc3Bhd25Qb2ludHMuc2hpZnQoKSE7IC8vIEdldCBuZXh0IGF2YWlsYWJsZSBzcGF3biBwb2ludFxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJzLnB1c2gobmV3IFBsYXllcihcbiAgICAgICAgICAgICAgICBpICsgMiwgLy8gVW5pcXVlIElEIGZvciBBSSBwbGF5ZXJzXG4gICAgICAgICAgICAgICAgYWlTcGF3bi5jb2wgKiB0aWxlU2l6ZSxcbiAgICAgICAgICAgICAgICBhaVNwYXduLnJvdyAqIHRpbGVTaXplLFxuICAgICAgICAgICAgICAgIHRpbGVTaXplLCB0aWxlU2l6ZSxcbiAgICAgICAgICAgICAgICBgcGxheWVyJHtpICsgMn1gLCAvLyBlLmcuLCAncGxheWVyMicsICdwbGF5ZXIzJyBmb3IgQUkgaW1hZ2VzXG4gICAgICAgICAgICAgICAgcGxheWVyU3BlZWQsIHRpbGVTaXplLCB0aGlzLmNvbmZpZywgdHJ1ZVxuICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICB0aGlzLmFpUGxheWVyc0NvdW50Kys7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8vIEdsb2JhbCBpbnN0YW5jZSBhbmQgaW5pdGlhbGl6YXRpb25cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XG4gICAgY29uc3QgZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XG4gICAgZ2FtZS5pbml0KCdkYXRhLmpzb24nKTsgLy8gU3RhcnQgdGhlIGdhbWUgd2l0aCBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQW1GQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBTEMsU0FBQUE7QUFBQSxHQUFBO0FBV0wsSUFBSyxXQUFMLGtCQUFLQyxj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
