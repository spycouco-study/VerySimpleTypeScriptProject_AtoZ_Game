const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("Could not get 2D context from canvas");
}
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 2] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class InputManager {
  constructor() {
    this.keysPressed = /* @__PURE__ */ new Set();
    window.addEventListener("keydown", this.onKeyDown.bind(this));
    window.addEventListener("keyup", this.onKeyUp.bind(this));
  }
  static getInstance() {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }
  onKeyDown(event) {
    this.keysPressed.add(event.code);
  }
  onKeyUp(event) {
    this.keysPressed.delete(event.code);
  }
  isKeyPressed(keyCode) {
    return this.keysPressed.has(keyCode);
  }
}
const inputManager = InputManager.getInstance();
class SoundPlayer {
  constructor() {
    this.sounds = /* @__PURE__ */ new Map();
    this.bgmAudio = null;
  }
  async loadSounds(soundConfigs) {
    const promises = soundConfigs.map((config) => {
      return new Promise((resolve) => {
        const audio = new Audio(config.path);
        audio.volume = config.volume;
        audio.load();
        this.sounds.set(config.name, audio);
        resolve();
      });
    });
    await Promise.all(promises);
  }
  playSound(name, loop = false) {
    const audioTemplate = this.sounds.get(name);
    if (audioTemplate) {
      const audio = audioTemplate.cloneNode();
      audio.volume = audioTemplate.volume;
      audio.loop = loop;
      audio.currentTime = 0;
      audio.play().catch((e) => console.warn(`Failed to play sound '${name}':`, e));
      if (loop) {
        if (this.bgmAudio) {
          this.bgmAudio.pause();
          this.bgmAudio.currentTime = 0;
        }
        this.bgmAudio = audio;
      }
    } else {
      console.warn(`Sound '${name}' not found.`);
    }
  }
  stopBGM() {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio = null;
    }
  }
  // This method is primarily for the Game class to know which sounds are available,
  // though SoundPlayer manages playing directly.
  getLoadedSounds() {
    return this.sounds;
  }
}
class GameObject {
  constructor(x, y, width, height, imageKey, health = 1, active = true) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.imageKey = imageKey;
    this.health = health;
    this.active = active;
  }
  draw(ctx2, assets) {
    if (!this.active) return;
    const image = assets.images.get(this.imageKey);
    if (image) {
      ctx2.drawImage(image, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    } else {
      ctx2.fillStyle = "fuchsia";
      ctx2.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
      ctx2.strokeStyle = "white";
      ctx2.strokeRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    }
  }
  isCollidingWith(other) {
    if (!this.active || !other.active) return false;
    return this.x - this.width / 2 < other.x + other.width / 2 && this.x + this.width / 2 > other.x - other.width / 2 && this.y - this.height / 2 < other.y + other.height / 2 && this.y + this.height / 2 > other.y - other.height / 2;
  }
}
class Player extends GameObject {
  constructor(x, y, width, height, imageKey, speed, health) {
    super(x, y, width, height, imageKey, health);
    this.lastShotTime = 0;
    this.speed = speed;
    this.maxHealth = health;
  }
  update(deltaTime) {
    if (inputManager.isKeyPressed("ArrowLeft") || inputManager.isKeyPressed("KeyA")) {
      this.x -= this.speed * deltaTime;
    }
    if (inputManager.isKeyPressed("ArrowRight") || inputManager.isKeyPressed("KeyD")) {
      this.x += this.speed * deltaTime;
    }
    this.x = Math.max(this.width / 2, Math.min(ctx.canvas.width - this.width / 2, this.x));
    this.y = Math.max(this.height / 2, Math.min(ctx.canvas.height - this.height / 2, this.y));
  }
}
class Bullet extends GameObject {
  // 1 for down, -1 for up
  constructor(x, y, width, height, imageKey, speed, damage, directionY) {
    super(x, y, width, height, imageKey, 1);
    this.speed = speed;
    this.damage = damage;
    this.directionY = directionY;
  }
  update(deltaTime) {
    this.y += this.speed * this.directionY * deltaTime;
    if (this.y < -this.height / 2 || this.y > ctx.canvas.height + this.height / 2) {
      this.active = false;
    }
  }
}
class Enemy extends GameObject {
  constructor(x, y, width, height, imageKey, speed, health, scoreValue) {
    super(x, y, width, height, imageKey, health);
    this.speed = speed;
    this.scoreValue = scoreValue;
  }
  update(deltaTime) {
    this.y += this.speed * deltaTime;
    if (this.y > ctx.canvas.height + this.height / 2) {
      this.active = false;
    }
  }
}
class Game {
  constructor(ctx2) {
    this.canvasWidth = 0;
    this.canvasHeight = 0;
    // Instance of SoundPlayer
    this.gameState = 0 /* TITLE */;
    this.lastFrameTime = 0;
    this.score = 0;
    this.enemies = [];
    this.playerBullets = [];
    this.lastEnemySpawnTime = 0;
    this.lastGameOverTime = 0;
    this.ctx = ctx2;
    this.soundPlayer = new SoundPlayer();
  }
  async loadConfig() {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`Failed to load data.json: ${response.statusText}`);
    }
    return response.json();
  }
  async loadAssets(config) {
    const imagePromises = config.assets.images.map((img) => {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = img.path;
        image.onload = () => resolve([img.name, image]);
        image.onerror = () => reject(`Failed to load image: ${img.path}`);
      });
    });
    const loadedImages = await Promise.all(imagePromises);
    const imagesMap = new Map(loadedImages);
    await this.soundPlayer.loadSounds(config.assets.sounds);
    return {
      images: imagesMap
    };
  }
  async init() {
    try {
      this.config = await this.loadConfig();
      this.canvasWidth = this.config.gameSettings.canvasWidth;
      this.canvasHeight = this.config.gameSettings.canvasHeight;
      this.ctx.canvas.width = this.canvasWidth;
      this.ctx.canvas.height = this.canvasHeight;
      this.assets = await this.loadAssets(this.config);
      console.log("Game initialized with config and assets:", this.config, this.assets);
      this.soundPlayer.playSound("title_bgm", true);
      requestAnimationFrame(this.loop.bind(this));
    } catch (error) {
      console.error("Game initialization failed:", error);
      this.ctx.fillStyle = "white";
      this.ctx.font = "20px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText(`Error: ${error}`, this.canvasWidth / 2, this.canvasHeight / 2);
    }
  }
  startGame() {
    this.score = 0;
    this.enemies = [];
    this.playerBullets = [];
    this.player = new Player(
      this.canvasWidth / 2,
      this.canvasHeight - this.config.player.height / 2 - 10,
      // Position player slightly above bottom edge
      this.config.player.width,
      this.config.player.height,
      this.config.player.imageKey,
      this.config.gameSettings.playerSpeed,
      this.config.gameSettings.playerHealth
    );
    this.lastEnemySpawnTime = performance.now();
    this.player.lastShotTime = performance.now();
    this.gameState = 1 /* PLAYING */;
    this.soundPlayer.stopBGM();
    this.soundPlayer.playSound("bgm", true);
  }
  resetGame() {
    this.gameState = 0 /* TITLE */;
    this.soundPlayer.stopBGM();
    this.soundPlayer.playSound("title_bgm", true);
  }
  update(deltaTime) {
    switch (this.gameState) {
      case 0 /* TITLE */:
        if (inputManager.isKeyPressed("Enter")) {
          this.startGame();
        }
        break;
      case 1 /* PLAYING */:
        this.player.update(deltaTime);
        if (inputManager.isKeyPressed("Space") && performance.now() - this.player.lastShotTime > this.config.gameSettings.playerBulletCooldown) {
          this.playerBullets.push(new Bullet(
            this.player.x,
            this.player.y - this.player.height / 2,
            // From top of player
            this.config.playerBullet.width,
            this.config.playerBullet.height,
            this.config.playerBullet.imageKey,
            this.config.gameSettings.playerBulletSpeed,
            this.config.gameSettings.playerBulletDamage,
            -1
            // Upwards
          ));
          this.soundPlayer.playSound("player_shoot_effect");
          this.player.lastShotTime = performance.now();
        }
        this.playerBullets.forEach((bullet) => bullet.update(deltaTime));
        this.playerBullets = this.playerBullets.filter((bullet) => bullet.active);
        this.enemies.forEach((enemy) => enemy.update(deltaTime));
        this.enemies = this.enemies.filter((enemy) => enemy.active);
        if (performance.now() - this.lastEnemySpawnTime > this.config.gameSettings.enemySpawnRate) {
          const enemyX = Math.random() * (this.canvasWidth - this.config.enemy.width) + this.config.enemy.width / 2;
          const enemySpeed = Math.random() * (this.config.gameSettings.enemyMoveSpeedMax - this.config.gameSettings.enemyMoveSpeedMin) + this.config.gameSettings.enemyMoveSpeedMin;
          this.enemies.push(new Enemy(
            enemyX,
            -this.config.enemy.height / 2,
            // Start off-screen top
            this.config.enemy.width,
            this.config.enemy.height,
            this.config.enemy.imageKey,
            enemySpeed,
            this.config.gameSettings.enemyHealth,
            this.config.enemy.scoreValue
          ));
          this.lastEnemySpawnTime = performance.now();
        }
        this.playerBullets.forEach((bullet) => {
          this.enemies.forEach((enemy) => {
            if (bullet.active && enemy.active && bullet.isCollidingWith(enemy)) {
              bullet.active = false;
              enemy.health -= bullet.damage;
              this.soundPlayer.playSound("enemy_hit_effect");
              if (enemy.health <= 0) {
                enemy.active = false;
                this.score += enemy.scoreValue;
                this.soundPlayer.playSound("enemy_destroy_effect");
              }
            }
          });
        });
        this.enemies.forEach((enemy) => {
          if (enemy.active && this.player.active && this.player.isCollidingWith(enemy)) {
            enemy.active = false;
            this.player.health--;
            this.soundPlayer.playSound("player_hit_effect");
            if (this.player.health <= 0) {
              this.player.active = false;
              this.gameState = 2 /* GAME_OVER */;
              this.lastGameOverTime = performance.now();
              this.soundPlayer.stopBGM();
              this.soundPlayer.playSound("game_over_bgm");
            }
          }
        });
        break;
      case 2 /* GAME_OVER */:
        if (performance.now() - this.lastGameOverTime > this.config.gameSettings.gameOverDelay && inputManager.isKeyPressed("Enter")) {
          this.resetGame();
        }
        break;
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
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
  drawTitleScreen() {
    this.ctx.fillStyle = "white";
    this.ctx.font = "48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.uiText.title, this.canvasWidth / 2, this.canvasHeight / 2 - 50);
    this.ctx.font = "24px Arial";
    this.ctx.fillText(this.config.uiText.pressToStart, this.canvasWidth / 2, this.canvasHeight / 2 + 20);
  }
  drawPlayingScreen() {
    if (this.player.active) {
      this.player.draw(this.ctx, this.assets);
    }
    this.playerBullets.forEach((bullet) => bullet.draw(this.ctx, this.assets));
    this.enemies.forEach((enemy) => enemy.draw(this.ctx, this.assets));
    this.ctx.fillStyle = "white";
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`${this.config.uiText.scorePrefix}${this.score}`, 10, 30);
    this.ctx.fillText(`${this.config.uiText.healthPrefix}${this.player.health}`, 10, 60);
  }
  drawGameOverScreen() {
    this.drawPlayingScreen();
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.ctx.fillStyle = "white";
    this.ctx.font = "48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.uiText.gameOver, this.canvasWidth / 2, this.canvasHeight / 2 - 50);
    this.ctx.font = "24px Arial";
    this.ctx.fillText(`${this.config.uiText.scorePrefix}${this.score}`, this.canvasWidth / 2, this.canvasHeight / 2);
    this.ctx.fillText(this.config.uiText.pressToRetry, this.canvasWidth / 2, this.canvasHeight / 2 + 50);
  }
  loop(currentTime) {
    const deltaTime = (currentTime - this.lastFrameTime) / 1e3;
    this.lastFrameTime = currentTime;
    this.update(deltaTime);
    this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }
}
const game = new Game(ctx);
game.init();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XHJcbmlmICghY3R4KSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBnZXQgMkQgY29udGV4dCBmcm9tIGNhbnZhcycpO1xyXG59XHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vLyAxLiBJbnRlcmZhY2VzICYgVHlwZXNcclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmludGVyZmFjZSBJbWFnZUFzc2V0Q29uZmlnIHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9XHJcbmludGVyZmFjZSBTb3VuZEFzc2V0Q29uZmlnIHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjsgdm9sdW1lOiBudW1iZXI7IH1cclxuXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgcGxheWVyQnVsbGV0Q29vbGRvd246IG51bWJlcjsgLy8gbXNcclxuICAgICAgICBlbmVteVNwYXduUmF0ZTogbnVtYmVyOyAgICAgLy8gbXNcclxuICAgICAgICBlbmVteU1vdmVTcGVlZE1pbjogbnVtYmVyOyAgLy8gcHgvc2VjXHJcbiAgICAgICAgZW5lbXlNb3ZlU3BlZWRNYXg6IG51bWJlcjsgIC8vIHB4L3NlY1xyXG4gICAgICAgIGVuZW15SGVhbHRoOiBudW1iZXI7XHJcbiAgICAgICAgcGxheWVyU3BlZWQ6IG51bWJlcjsgICAgICAgIC8vIHB4L3NlY1xyXG4gICAgICAgIHBsYXllckhlYWx0aDogbnVtYmVyO1xyXG4gICAgICAgIHBsYXllckJ1bGxldFNwZWVkOiBudW1iZXI7ICAvLyBweC9zZWNcclxuICAgICAgICBwbGF5ZXJCdWxsZXREYW1hZ2U6IG51bWJlcjtcclxuICAgICAgICBnYW1lT3ZlckRlbGF5OiBudW1iZXI7ICAgICAgLy8gbXNcclxuICAgIH07XHJcbiAgICBwbGF5ZXI6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGltYWdlS2V5OiBzdHJpbmc7IH07XHJcbiAgICBlbmVteTogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgaW1hZ2VLZXk6IHN0cmluZzsgc2NvcmVWYWx1ZTogbnVtYmVyOyB9O1xyXG4gICAgcGxheWVyQnVsbGV0OiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBpbWFnZUtleTogc3RyaW5nOyB9O1xyXG4gICAgdWlUZXh0OiB7XHJcbiAgICAgICAgdGl0bGU6IHN0cmluZztcclxuICAgICAgICBwcmVzc1RvU3RhcnQ6IHN0cmluZztcclxuICAgICAgICBnYW1lT3Zlcjogc3RyaW5nO1xyXG4gICAgICAgIHByZXNzVG9SZXRyeTogc3RyaW5nO1xyXG4gICAgICAgIHNjb3JlUHJlZml4OiBzdHJpbmc7XHJcbiAgICAgICAgaGVhbHRoUHJlZml4OiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJbWFnZUFzc2V0Q29uZmlnW107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZEFzc2V0Q29uZmlnW107XHJcbiAgICB9O1xyXG59XHJcblxyXG50eXBlIExvYWRlZEltYWdlID0gSFRNTEltYWdlRWxlbWVudDtcclxudHlwZSBMb2FkZWRTb3VuZCA9IEhUTUxBdWRpb0VsZW1lbnQ7IC8vIEZvciByZWZlcmVuY2UsIGFjdHVhbCBzb3VuZHMgYXJlIG1hbmFnZWQgYnkgU291bmRQbGF5ZXJcclxudHlwZSBBc3NldHMgPSB7XHJcbiAgICBpbWFnZXM6IE1hcDxzdHJpbmcsIExvYWRlZEltYWdlPjtcclxuICAgIC8vIHNvdW5kczogTWFwPHN0cmluZywgTG9hZGVkU291bmQ+OyAvLyBTb3VuZFBsYXllciBtYW5hZ2VzIHNvdW5kcyBpbnRlcm5hbGx5XHJcbn07XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbi8vIDIuIElucHV0IE1hbmFnZXIgKFNpbmdsZXRvbilcclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIElucHV0TWFuYWdlciB7XHJcbiAgICBwcml2YXRlIHN0YXRpYyBpbnN0YW5jZTogSW5wdXRNYW5hZ2VyO1xyXG4gICAgcHJpdmF0ZSBrZXlzUHJlc3NlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcblxyXG4gICAgcHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMub25LZXlVcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIGdldEluc3RhbmNlKCk6IElucHV0TWFuYWdlciB7XHJcbiAgICAgICAgaWYgKCFJbnB1dE1hbmFnZXIuaW5zdGFuY2UpIHtcclxuICAgICAgICAgICAgSW5wdXRNYW5hZ2VyLmluc3RhbmNlID0gbmV3IElucHV0TWFuYWdlcigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gSW5wdXRNYW5hZ2VyLmluc3RhbmNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5rZXlzUHJlc3NlZC5hZGQoZXZlbnQuY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5rZXlzUHJlc3NlZC5kZWxldGUoZXZlbnQuY29kZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGlzS2V5UHJlc3NlZChrZXlDb2RlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5rZXlzUHJlc3NlZC5oYXMoa2V5Q29kZSk7XHJcbiAgICB9XHJcbn1cclxuY29uc3QgaW5wdXRNYW5hZ2VyID0gSW5wdXRNYW5hZ2VyLmdldEluc3RhbmNlKCk7IC8vIEdsb2JhbCBpbnB1dCBtYW5hZ2VyXHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vLyAzLiBTb3VuZCBQbGF5ZXJcclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIFNvdW5kUGxheWVyIHtcclxuICAgIHByaXZhdGUgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBwdWJsaWMgYXN5bmMgbG9hZFNvdW5kcyhzb3VuZENvbmZpZ3M6IFNvdW5kQXNzZXRDb25maWdbXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gc291bmRDb25maWdzLm1hcChjb25maWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhjb25maWcucGF0aCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBjb25maWcudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgLy8gUHJlbG9hZCBtZXRhZGF0YSB0byBlbnN1cmUgdm9sdW1lIGlzIHNldCBiZWZvcmUgZmlyc3QgcGxheVxyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9hZCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGNvbmZpZy5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgcGxheVNvdW5kKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYXVkaW9UZW1wbGF0ZSA9IHRoaXMuc291bmRzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYXVkaW9UZW1wbGF0ZSkge1xyXG4gICAgICAgICAgICAvLyBDbG9uZSB0aGUgYXVkaW8gZWxlbWVudCBmb3IgZWZmZWN0cyB0byBhbGxvdyBvdmVybGFwcGluZyBwbGF5YmFja1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IGF1ZGlvVGVtcGxhdGUuY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gYXVkaW9UZW1wbGF0ZS52b2x1bWU7IC8vIEVuc3VyZSB2b2x1bWUgZnJvbSBjb25maWcgaXMgYXBwbGllZFxyXG4gICAgICAgICAgICBhdWRpby5sb29wID0gbG9vcDtcclxuICAgICAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwOyAvLyBSZXNldCB0byBzdGFydFxyXG4gICAgICAgICAgICBhdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBwbGF5IHNvdW5kICcke25hbWV9JzpgLCBlKSk7XHJcblxyXG4gICAgICAgICAgICBpZiAobG9vcCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7IC8vIFN0b3AgcHJldmlvdXMgQkdNIGlmIGFueVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpbyA9IGF1ZGlvO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtuYW1lfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgc3RvcEJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVGhpcyBtZXRob2QgaXMgcHJpbWFyaWx5IGZvciB0aGUgR2FtZSBjbGFzcyB0byBrbm93IHdoaWNoIHNvdW5kcyBhcmUgYXZhaWxhYmxlLFxyXG4gICAgLy8gdGhvdWdoIFNvdW5kUGxheWVyIG1hbmFnZXMgcGxheWluZyBkaXJlY3RseS5cclxuICAgIHB1YmxpYyBnZXRMb2FkZWRTb3VuZHMoKTogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4ge1xyXG4gICAgICAgIHJldHVybiB0aGlzLnNvdW5kcztcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuLy8gNC4gR2FtZSBPYmplY3RzXHJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5hYnN0cmFjdCBjbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHB1YmxpYyB4OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIHk6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgd2lkdGg6IG51bWJlcixcclxuICAgICAgICBwdWJsaWMgaGVpZ2h0OiBudW1iZXIsXHJcbiAgICAgICAgcHVibGljIGltYWdlS2V5OiBzdHJpbmcsXHJcbiAgICAgICAgcHVibGljIGhlYWx0aDogbnVtYmVyID0gMSxcclxuICAgICAgICBwdWJsaWMgYWN0aXZlOiBib29sZWFuID0gdHJ1ZVxyXG4gICAgKSB7fVxyXG5cclxuICAgIGFic3RyYWN0IHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQ7XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRzOiBBc3NldHMpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuYWN0aXZlKSByZXR1cm47XHJcbiAgICAgICAgY29uc3QgaW1hZ2UgPSBhc3NldHMuaW1hZ2VzLmdldCh0aGlzLmltYWdlS2V5KTtcclxuICAgICAgICBpZiAoaW1hZ2UpIHtcclxuICAgICAgICAgICAgLy8gRHJhdyBpbWFnZSBzY2FsZWQgdG8gb2JqZWN0J3Mgd2lkdGgvaGVpZ2h0XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1hZ2UsIHRoaXMueCAtIHRoaXMud2lkdGggLyAyLCB0aGlzLnkgLSB0aGlzLmhlaWdodCAvIDIsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBGYWxsYmFjazogZHJhdyBhIGNvbG9yZWQgcmVjdGFuZ2xlIGlmIGltYWdlIG5vdCBmb3VuZFxyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ2Z1Y2hzaWEnO1xyXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54IC0gdGhpcy53aWR0aCAvIDIsIHRoaXMueSAtIHRoaXMuaGVpZ2h0IC8gMiwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICBjdHguc3Ryb2tlU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgICAgICBjdHguc3Ryb2tlUmVjdCh0aGlzLnggLSB0aGlzLndpZHRoIC8gMiwgdGhpcy55IC0gdGhpcy5oZWlnaHQgLyAyLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlzQ29sbGlkaW5nV2l0aChvdGhlcjogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICghdGhpcy5hY3RpdmUgfHwgIW90aGVyLmFjdGl2ZSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgIHRoaXMueCAtIHRoaXMud2lkdGggLyAyIDwgb3RoZXIueCArIG90aGVyLndpZHRoIC8gMiAmJlxyXG4gICAgICAgICAgICB0aGlzLnggKyB0aGlzLndpZHRoIC8gMiA+IG90aGVyLnggLSBvdGhlci53aWR0aCAvIDIgJiZcclxuICAgICAgICAgICAgdGhpcy55IC0gdGhpcy5oZWlnaHQgLyAyIDwgb3RoZXIueSArIG90aGVyLmhlaWdodCAvIDIgJiZcclxuICAgICAgICAgICAgdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyID4gb3RoZXIueSAtIG90aGVyLmhlaWdodCAvIDJcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgIGxhc3RTaG90VGltZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlS2V5OiBzdHJpbmcsIHNwZWVkOiBudW1iZXIsIGhlYWx0aDogbnVtYmVyKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VLZXksIGhlYWx0aCk7XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IHNwZWVkO1xyXG4gICAgICAgIHRoaXMubWF4SGVhbHRoID0gaGVhbHRoO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmIChpbnB1dE1hbmFnZXIuaXNLZXlQcmVzc2VkKCdBcnJvd0xlZnQnKSB8fCBpbnB1dE1hbmFnZXIuaXNLZXlQcmVzc2VkKCdLZXlBJykpIHtcclxuICAgICAgICAgICAgdGhpcy54IC09IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChpbnB1dE1hbmFnZXIuaXNLZXlQcmVzc2VkKCdBcnJvd1JpZ2h0JykgfHwgaW5wdXRNYW5hZ2VyLmlzS2V5UHJlc3NlZCgnS2V5RCcpKSB7XHJcbiAgICAgICAgICAgIHRoaXMueCArPSB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gS2VlcCBwbGF5ZXIgd2l0aGluIGNhbnZhcyBib3VuZHNcclxuICAgICAgICB0aGlzLnggPSBNYXRoLm1heCh0aGlzLndpZHRoIC8gMiwgTWF0aC5taW4oY3R4LmNhbnZhcy53aWR0aCAtIHRoaXMud2lkdGggLyAyLCB0aGlzLngpKTtcclxuICAgICAgICB0aGlzLnkgPSBNYXRoLm1heCh0aGlzLmhlaWdodCAvIDIsIE1hdGgubWluKGN0eC5jYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQgLyAyLCB0aGlzLnkpKTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQnVsbGV0IGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICBkaXJlY3Rpb25ZOiBudW1iZXI7IC8vIDEgZm9yIGRvd24sIC0xIGZvciB1cFxyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2VLZXk6IHN0cmluZywgc3BlZWQ6IG51bWJlciwgZGFtYWdlOiBudW1iZXIsIGRpcmVjdGlvblk6IG51bWJlcikge1xyXG4gICAgICAgIHN1cGVyKHgsIHksIHdpZHRoLCBoZWlnaHQsIGltYWdlS2V5LCAxKTsgLy8gQnVsbGV0cyBoYXZlIDEgaGVhbHRoLCBkZXN0cm95ZWQgb24gaGl0XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IHNwZWVkO1xyXG4gICAgICAgIHRoaXMuZGFtYWdlID0gZGFtYWdlO1xyXG4gICAgICAgIHRoaXMuZGlyZWN0aW9uWSA9IGRpcmVjdGlvblk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiB0aGlzLmRpcmVjdGlvblkgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgIC8vIERlYWN0aXZhdGUgaWYgb2ZmLXNjcmVlblxyXG4gICAgICAgIGlmICh0aGlzLnkgPCAtdGhpcy5oZWlnaHQgLyAyIHx8IHRoaXMueSA+IGN0eC5jYW52YXMuaGVpZ2h0ICsgdGhpcy5oZWlnaHQgLyAyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBFbmVteSBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIHNjb3JlVmFsdWU6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlS2V5OiBzdHJpbmcsIHNwZWVkOiBudW1iZXIsIGhlYWx0aDogbnVtYmVyLCBzY29yZVZhbHVlOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZUtleSwgaGVhbHRoKTtcclxuICAgICAgICB0aGlzLnNwZWVkID0gc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5zY29yZVZhbHVlID0gc2NvcmVWYWx1ZTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnkgKz0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gRGVhY3RpdmF0ZSBpZiBvZmYtc2NyZWVuXHJcbiAgICAgICAgaWYgKHRoaXMueSA+IGN0eC5jYW52YXMuaGVpZ2h0ICsgdGhpcy5oZWlnaHQgLyAyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vLyA1LiBHYW1lIENvcmVcclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnO1xyXG4gICAgcHJpdmF0ZSBhc3NldHMhOiBBc3NldHM7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjYW52YXNXaWR0aDogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY2FudmFzSGVpZ2h0OiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgc291bmRQbGF5ZXI6IFNvdW5kUGxheWVyOyAvLyBJbnN0YW5jZSBvZiBTb3VuZFBsYXllclxyXG5cclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICBwcml2YXRlIGxhc3RGcmFtZVRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXIhOiBQbGF5ZXI7XHJcbiAgICBwcml2YXRlIGVuZW1pZXM6IEVuZW15W10gPSBbXTtcclxuICAgIHByaXZhdGUgcGxheWVyQnVsbGV0czogQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgbGFzdEVuZW15U3Bhd25UaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBsYXN0R2FtZU92ZXJUaW1lOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgdGhpcy5jdHggPSBjdHg7XHJcbiAgICAgICAgdGhpcy5zb3VuZFBsYXllciA9IG5ldyBTb3VuZFBsYXllcigpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpOiBQcm9taXNlPEdhbWVDb25maWc+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGxvYWQgZGF0YS5qc29uOiAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKGNvbmZpZzogR2FtZUNvbmZpZyk6IFByb21pc2U8QXNzZXRzPiB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8W3N0cmluZywgTG9hZGVkSW1hZ2VdPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1hZ2Uuc3JjID0gaW1nLnBhdGg7XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5vbmxvYWQgPSAoKSA9PiByZXNvbHZlKFtpbWcubmFtZSwgaW1hZ2VdKTtcclxuICAgICAgICAgICAgICAgIGltYWdlLm9uZXJyb3IgPSAoKSA9PiByZWplY3QoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZy5wYXRofWApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgbG9hZGVkSW1hZ2VzID0gYXdhaXQgUHJvbWlzZS5hbGwoaW1hZ2VQcm9taXNlcyk7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VzTWFwID0gbmV3IE1hcDxzdHJpbmcsIExvYWRlZEltYWdlPihsb2FkZWRJbWFnZXMpO1xyXG5cclxuICAgICAgICBhd2FpdCB0aGlzLnNvdW5kUGxheWVyLmxvYWRTb3VuZHMoY29uZmlnLmFzc2V0cy5zb3VuZHMpO1xyXG5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBpbWFnZXM6IGltYWdlc01hcCxcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBhc3luYyBpbml0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgdGhpcy5sb2FkQ29uZmlnKCk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzV2lkdGggPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzSGVpZ2h0ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuICAgICAgICAgICAgdGhpcy5jdHguY2FudmFzLndpZHRoID0gdGhpcy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jdHguY2FudmFzLmhlaWdodCA9IHRoaXMuY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgdGhpcy5hc3NldHMgPSBhd2FpdCB0aGlzLmxvYWRBc3NldHModGhpcy5jb25maWcpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnR2FtZSBpbml0aWFsaXplZCB3aXRoIGNvbmZpZyBhbmQgYXNzZXRzOicsIHRoaXMuY29uZmlnLCB0aGlzLmFzc2V0cyk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnNvdW5kUGxheWVyLnBsYXlTb3VuZCgndGl0bGVfYmdtJywgdHJ1ZSk7IC8vIFN0YXJ0IHRpdGxlIHNjcmVlbiBCR01cclxuXHJcbiAgICAgICAgICAgIC8vIFN0YXJ0IGdhbWUgbG9vcFxyXG4gICAgICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5sb29wLmJpbmQodGhpcykpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJHYW1lIGluaXRpYWxpemF0aW9uIGZhaWxlZDpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBEaXNwbGF5IGFuIGVycm9yIG1lc3NhZ2Ugb24gY2FudmFzXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBBcmlhbCc7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgRXJyb3I6ICR7ZXJyb3J9YCwgdGhpcy5jYW52YXNXaWR0aCAvIDIsIHRoaXMuY2FudmFzSGVpZ2h0IC8gMik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IFtdO1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cyA9IFtdO1xyXG4gICAgICAgIHRoaXMucGxheWVyID0gbmV3IFBsYXllcihcclxuICAgICAgICAgICAgdGhpcy5jYW52YXNXaWR0aCAvIDIsXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzSGVpZ2h0IC0gdGhpcy5jb25maWcucGxheWVyLmhlaWdodCAvIDIgLSAxMCwgLy8gUG9zaXRpb24gcGxheWVyIHNsaWdodGx5IGFib3ZlIGJvdHRvbSBlZGdlXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBsYXllci53aWR0aCxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcucGxheWVyLmhlaWdodCxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcucGxheWVyLmltYWdlS2V5LFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyU3BlZWQsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJIZWFsdGhcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIubGFzdFNob3RUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICB0aGlzLnNvdW5kUGxheWVyLnN0b3BCR00oKTsgLy8gU3RvcCB0aXRsZSBCR01cclxuICAgICAgICB0aGlzLnNvdW5kUGxheWVyLnBsYXlTb3VuZCgnYmdtJywgdHJ1ZSk7IC8vIFN0YXJ0IGdhbWUgQkdNXHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNldEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgdGhpcy5zb3VuZFBsYXllci5zdG9wQkdNKCk7XHJcbiAgICAgICAgdGhpcy5zb3VuZFBsYXllci5wbGF5U291bmQoJ3RpdGxlX2JnbScsIHRydWUpOyAvLyBQbGF5IHRpdGxlIEJHTVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIGlmIChpbnB1dE1hbmFnZXIuaXNLZXlQcmVzc2VkKCdFbnRlcicpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIudXBkYXRlKGRlbHRhVGltZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gSGFuZGxlIHBsYXllciBzaG9vdGluZ1xyXG4gICAgICAgICAgICAgICAgaWYgKGlucHV0TWFuYWdlci5pc0tleVByZXNzZWQoJ1NwYWNlJykgJiYgKHBlcmZvcm1hbmNlLm5vdygpIC0gdGhpcy5wbGF5ZXIubGFzdFNob3RUaW1lID4gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckJ1bGxldENvb2xkb3duKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5wdXNoKG5ldyBCdWxsZXQoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLngsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnkgLSB0aGlzLnBsYXllci5oZWlnaHQgLyAyLCAvLyBGcm9tIHRvcCBvZiBwbGF5ZXJcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcucGxheWVyQnVsbGV0LndpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wbGF5ZXJCdWxsZXQuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wbGF5ZXJCdWxsZXQuaW1hZ2VLZXksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJCdWxsZXRTcGVlZCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckJ1bGxldERhbWFnZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgLTEgLy8gVXB3YXJkc1xyXG4gICAgICAgICAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRQbGF5ZXIucGxheVNvdW5kKCdwbGF5ZXJfc2hvb3RfZWZmZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIubGFzdFNob3RUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIGFuZCBmaWx0ZXIgYnVsbGV0c1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IGJ1bGxldC51cGRhdGUoZGVsdGFUaW1lKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMgPSB0aGlzLnBsYXllckJ1bGxldHMuZmlsdGVyKGJ1bGxldCA9PiBidWxsZXQuYWN0aXZlKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgYW5kIGZpbHRlciBlbmVtaWVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiBlbmVteS51cGRhdGUoZGVsdGFUaW1lKSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMgPSB0aGlzLmVuZW1pZXMuZmlsdGVyKGVuZW15ID0+IGVuZW15LmFjdGl2ZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gRW5lbXkgU3Bhd25pbmdcclxuICAgICAgICAgICAgICAgIGlmIChwZXJmb3JtYW5jZS5ub3coKSAtIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID4gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15U3Bhd25SYXRlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZW5lbXlYID0gTWF0aC5yYW5kb20oKSAqICh0aGlzLmNhbnZhc1dpZHRoIC0gdGhpcy5jb25maWcuZW5lbXkud2lkdGgpICsgdGhpcy5jb25maWcuZW5lbXkud2lkdGggLyAyO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuZW15U3BlZWQgPSBNYXRoLnJhbmRvbSgpICogKHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteU1vdmVTcGVlZE1heCAtIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteU1vdmVTcGVlZE1pbikgKyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlNb3ZlU3BlZWRNaW47XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbmVtaWVzLnB1c2gobmV3IEVuZW15KFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmVteVgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC10aGlzLmNvbmZpZy5lbmVteS5oZWlnaHQgLyAyLCAvLyBTdGFydCBvZmYtc2NyZWVuIHRvcFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5lbmVteS53aWR0aCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuZW5lbXkuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5lbmVteS5pbWFnZUtleSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZW5lbXlTcGVlZCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SGVhbHRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5lbmVteS5zY29yZVZhbHVlXHJcbiAgICAgICAgICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXN0RW5lbXlTcGF3blRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBDb2xsaXNpb24gRGV0ZWN0aW9uOiBQbGF5ZXIgQnVsbGV0cyB2cyBFbmVtaWVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJ1bGxldC5hY3RpdmUgJiYgZW5lbXkuYWN0aXZlICYmIGJ1bGxldC5pc0NvbGxpZGluZ1dpdGgoZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBidWxsZXQuYWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmVteS5oZWFsdGggLT0gYnVsbGV0LmRhbWFnZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRQbGF5ZXIucGxheVNvdW5kKCdlbmVteV9oaXRfZWZmZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZW5lbXkuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmVteS5hY3RpdmUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IGVuZW15LnNjb3JlVmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZFBsYXllci5wbGF5U291bmQoJ2VuZW15X2Rlc3Ryb3lfZWZmZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIENvbGxpc2lvbiBEZXRlY3Rpb246IFBsYXllciB2cyBFbmVtaWVzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVuZW15LmFjdGl2ZSAmJiB0aGlzLnBsYXllci5hY3RpdmUgJiYgdGhpcy5wbGF5ZXIuaXNDb2xsaWRpbmdXaXRoKGVuZW15KSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmVteS5hY3RpdmUgPSBmYWxzZTsgLy8gRW5lbXkgaXMgZGVzdHJveWVkIG9uIGNvbGxpc2lvbiB3aXRoIHBsYXllclxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5oZWFsdGgtLTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZFBsYXllci5wbGF5U291bmQoJ3BsYXllcl9oaXRfZWZmZWN0Jyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmxhc3RHYW1lT3ZlclRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRQbGF5ZXIuc3RvcEJHTSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZFBsYXllci5wbGF5U291bmQoJ2dhbWVfb3Zlcl9iZ20nKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICBpZiAocGVyZm9ybWFuY2Uubm93KCkgLSB0aGlzLmxhc3RHYW1lT3ZlclRpbWUgPiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ2FtZU92ZXJEZWxheSAmJiBpbnB1dE1hbmFnZXIuaXNLZXlQcmVzc2VkKCdFbnRlcicpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXcoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzV2lkdGgsIHRoaXMuY2FudmFzSGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnYmxhY2snOyAvLyBCYWNrZ3JvdW5kIGNvbG9yXHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXNXaWR0aCwgdGhpcy5jYW52YXNIZWlnaHQpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3UGxheWluZ1NjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzQ4cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnVpVGV4dC50aXRsZSwgdGhpcy5jYW52YXNXaWR0aCAvIDIsIHRoaXMuY2FudmFzSGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy51aVRleHQucHJlc3NUb1N0YXJ0LCB0aGlzLmNhbnZhc1dpZHRoIC8gMiwgdGhpcy5jYW52YXNIZWlnaHQgLyAyICsgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1BsYXlpbmdTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgLy8gRHJhdyBQbGF5ZXJcclxuICAgICAgICBpZiAodGhpcy5wbGF5ZXIuYWN0aXZlKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRzKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIERyYXcgUGxheWVyIEJ1bGxldHNcclxuICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4gYnVsbGV0LmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRzKSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgRW5lbWllc1xyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IGVuZW15LmRyYXcodGhpcy5jdHgsIHRoaXMuYXNzZXRzKSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUk6IFNjb3JlIGFuZCBIZWFsdGhcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpVGV4dC5zY29yZVByZWZpeH0ke3RoaXMuc2NvcmV9YCwgMTAsIDMwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgJHt0aGlzLmNvbmZpZy51aVRleHQuaGVhbHRoUHJlZml4fSR7dGhpcy5wbGF5ZXIuaGVhbHRofWAsIDEwLCA2MCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3R2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5kcmF3UGxheWluZ1NjcmVlbigpOyAvLyBEcmF3IHRoZSBsYXN0IGZyYW1lIG9mIGdhbWVwbGF5IGJlaGluZCB0aGUgb3ZlcmxheVxyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJzsgLy8gU2VtaS10cmFuc3BhcmVudCBvdmVybGF5XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXNXaWR0aCwgdGhpcy5jYW52YXNIZWlnaHQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnNDhweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWlUZXh0LmdhbWVPdmVyLCB0aGlzLmNhbnZhc1dpZHRoIC8gMiwgdGhpcy5jYW52YXNIZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGAke3RoaXMuY29uZmlnLnVpVGV4dC5zY29yZVByZWZpeH0ke3RoaXMuc2NvcmV9YCwgdGhpcy5jYW52YXNXaWR0aCAvIDIsIHRoaXMuY2FudmFzSGVpZ2h0IC8gMik7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudWlUZXh0LnByZXNzVG9SZXRyeSwgdGhpcy5jYW52YXNXaWR0aCAvIDIsIHRoaXMuY2FudmFzSGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgbG9vcChjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0RnJhbWVUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMuZHJhdygpO1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5sb29wLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBJbml0aWFsaXplIGFuZCBzdGFydCB0aGUgZ2FtZVxyXG5jb25zdCBnYW1lID0gbmV3IEdhbWUoY3R4KTtcclxuZ2FtZS5pbml0KCk7Il0sCiAgIm1hcHBpbmdzIjogIkFBQUEsTUFBTSxTQUFTLFNBQVMsZUFBZSxZQUFZO0FBQ25ELE1BQU0sTUFBTSxPQUFPLFdBQVcsSUFBSTtBQUNsQyxJQUFJLENBQUMsS0FBSztBQUNOLFFBQU0sSUFBSSxNQUFNLHNDQUFzQztBQUMxRDtBQWdEQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFIQyxTQUFBQTtBQUFBLEdBQUE7QUFVTCxNQUFNLGFBQWE7QUFBQSxFQUlQLGNBQWM7QUFGdEIsU0FBUSxjQUEyQixvQkFBSSxJQUFJO0FBR3ZDLFdBQU8saUJBQWlCLFdBQVcsS0FBSyxVQUFVLEtBQUssSUFBSSxDQUFDO0FB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
