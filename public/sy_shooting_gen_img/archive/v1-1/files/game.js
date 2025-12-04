var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["CONTROLS"] = 1] = "CONTROLS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class AssetLoader {
  constructor(gameData) {
    this.loadedImages = {};
    this.loadedSounds = {};
    this.gameData = gameData;
  }
  async load() {
    const imagePromises = this.gameData.assets.images.map((img) => this.loadImage(img));
    const soundPromises = this.gameData.assets.sounds.map((snd) => this.loadSound(snd));
    await Promise.all(imagePromises);
    await Promise.all(soundPromises);
    console.log("All assets loaded.");
    return {
      images: this.loadedImages,
      sounds: this.loadedSounds
    };
  }
  loadImage(imageAsset) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageAsset.path;
      img.onload = () => {
        this.loadedImages[imageAsset.name] = img;
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${imageAsset.path}`);
        reject(new Error(`Failed to load image: ${imageAsset.path}`));
      };
    });
  }
  loadSound(soundAsset) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = soundAsset.path;
      audio.preload = "auto";
      audio.volume = soundAsset.volume;
      audio.oncanplaythrough = () => {
        this.loadedSounds[soundAsset.name] = audio;
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${soundAsset.path}`);
        reject(new Error(`Failed to load sound: ${soundAsset.path}`));
      };
    });
  }
}
class GameObject {
  constructor(x, y, width, height, assetName) {
    this.isAlive = true;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.assetName = assetName;
  }
  render(ctx, assets) {
    const img = assets.images[this.assetName];
    if (img) {
      ctx.drawImage(img, this.x, this.y, this.width, this.height);
    } else {
      console.warn(`Asset not found: ${this.assetName}`);
      ctx.fillStyle = "red";
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}
class Player extends GameObject {
  // current cooldown in milliseconds
  constructor(x, y, config) {
    super(x, y, config.player.width, config.player.height, "player_plane");
    this.health = config.player.health;
    this.speed = config.player.speed;
    this.fireRate = config.player.fireRate;
    this.bulletSpeed = config.player.bulletSpeed;
    this.bulletDamage = config.player.bulletDamage;
    this.fireCooldown = 0;
  }
  update(keys, deltaTime, config) {
    const gameSpeed = config.gameSettings.gameSpeedMultiplier;
    if (keys.has("ArrowUp") || keys.has("KeyW")) {
      this.y -= this.speed * gameSpeed * deltaTime;
    }
    if (keys.has("ArrowDown") || keys.has("KeyS")) {
      this.y += this.speed * gameSpeed * deltaTime;
    }
    if (keys.has("ArrowLeft") || keys.has("KeyA")) {
      this.x -= this.speed * gameSpeed * deltaTime;
    }
    if (keys.has("ArrowRight") || keys.has("KeyD")) {
      this.x += this.speed * gameSpeed * deltaTime;
    }
    this.x = Math.max(0, Math.min(this.x, config.gameSettings.canvasWidth - this.width));
    this.y = Math.max(0, Math.min(this.y, config.gameSettings.canvasHeight - this.height));
    if (this.fireCooldown > 0) {
      this.fireCooldown -= deltaTime * 1e3;
    }
  }
  shoot(assets, game2) {
    if (this.fireCooldown <= 0) {
      this.fireCooldown = this.fireRate;
      game2.playSFX("player_shoot");
      const bulletConfig = game2.data.bullets.player;
      return new Bullet(
        this.x + this.width / 2 - bulletConfig.width / 2,
        this.y,
        bulletConfig.width,
        bulletConfig.height,
        bulletConfig.asset,
        this.bulletSpeed * -1,
        // Player bullets go up
        this.bulletDamage,
        true
        // isPlayerBullet
      );
    }
    return null;
  }
  takeDamage(damage) {
    this.health -= damage;
    if (this.health <= 0) {
      this.isAlive = false;
    }
  }
}
class Bullet extends GameObject {
  constructor(x, y, width, height, assetName, speed, damage, isPlayerBullet) {
    super(x, y, width, height, assetName);
    this.speed = speed;
    this.damage = damage;
    this.isPlayerBullet = isPlayerBullet;
  }
  update(deltaTime, config) {
    this.y += this.speed * config.gameSettings.gameSpeedMultiplier * deltaTime;
    if (this.y + this.height < 0 || this.y > config.gameSettings.canvasHeight) {
      this.isAlive = false;
    }
  }
}
class Enemy extends GameObject {
  // Store original config for bullet properties
  constructor(x, y, config, gameData) {
    super(x, y, config.width, config.height, config.asset);
    this.enemyConfig = config;
    this.health = config.health;
    this.speed = config.speed;
    this.scoreValue = config.score;
    this.fireRate = config.fireRate;
    this.bulletSpeed = config.bulletSpeed;
    this.bulletDamage = config.bulletDamage;
    this.fireCooldown = Math.floor(Math.random() * this.fireRate);
  }
  update(deltaTime, config) {
    this.y += this.speed * config.gameSettings.gameSpeedMultiplier * deltaTime;
    if (this.fireCooldown > 0) {
      this.fireCooldown -= deltaTime * 1e3;
    }
    if (this.y > config.gameSettings.canvasHeight) {
      this.isAlive = false;
    }
  }
  shoot(assets, game2) {
    if (this.fireRate > 0 && this.fireCooldown <= 0) {
      this.fireCooldown = this.fireRate;
      game2.playSFX("enemy_shoot");
      const bulletConfig = game2.data.bullets.enemy;
      return new Bullet(
        this.x + this.width / 2 - bulletConfig.width / 2,
        this.y + this.height,
        bulletConfig.width,
        bulletConfig.height,
        bulletConfig.asset,
        this.bulletSpeed,
        // Enemy bullets go down
        this.bulletDamage,
        false
        // isPlayerBullet
      );
    }
    return null;
  }
  takeDamage(damage) {
    this.health -= damage;
    if (this.health <= 0) {
      this.isAlive = false;
    }
  }
}
class Explosion extends GameObject {
  constructor(x, y, width, height, assetName, totalFrames, frameDurationMs) {
    super(x, y, width, height, assetName);
    this.currentFrame = 0;
    this.maxFrames = totalFrames;
    this.frameDuration = frameDurationMs;
    this.elapsedTime = 0;
    this.isAlive = true;
    const assetImageInfo = game.data.assets.images.find((img) => img.name === assetName);
    if (assetImageInfo) {
      this.frameWidth = assetImageInfo.width;
      this.frameHeight = assetImageInfo.height;
    } else {
      this.frameWidth = width;
      this.frameHeight = height;
    }
  }
  update(deltaTime) {
    this.elapsedTime += deltaTime * 1e3;
    if (this.elapsedTime >= this.frameDuration) {
      this.currentFrame++;
      this.elapsedTime = 0;
    }
    if (this.currentFrame >= this.maxFrames) {
      this.isAlive = false;
    }
  }
  render(ctx, assets) {
    if (!this.isAlive) return;
    const img = assets.images[this.assetName];
    if (img) {
      const sx = this.currentFrame * this.frameWidth;
      const sy = 0;
      ctx.drawImage(img, sx, sy, this.frameWidth, this.frameHeight, this.x, this.y, this.width, this.height);
    } else {
      super.render(ctx, assets);
    }
  }
}
class Background {
  constructor(config) {
    const bgConfig = config.background;
    this.assetName = bgConfig.asset;
    this.scrollSpeed = bgConfig.scrollSpeed;
    this.assetWidth = bgConfig.width;
    this.assetHeight = bgConfig.height;
    this.yOffset = 0;
    this.canvasWidth = config.gameSettings.canvasWidth;
    this.canvasHeight = config.gameSettings.canvasHeight;
  }
  update(deltaTime, gameSpeedMultiplier) {
    this.yOffset = (this.yOffset + this.scrollSpeed * gameSpeedMultiplier * deltaTime) % this.assetHeight;
  }
  render(ctx, assets) {
    const img = assets.images[this.assetName];
    if (img) {
      ctx.drawImage(img, 0, this.yOffset, this.canvasWidth, this.assetHeight, 0, this.yOffset, this.canvasWidth, this.assetHeight);
      ctx.drawImage(img, 0, this.yOffset - this.assetHeight, this.canvasWidth, this.assetHeight, 0, this.yOffset - this.assetHeight, this.canvasWidth, this.assetHeight);
    } else {
      console.warn(`Background asset not found: ${this.assetName}`);
      ctx.fillStyle = "blue";
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
  }
}
class Game {
  constructor(canvasId) {
    this.data = null;
    this.assets = null;
    this.state = 0 /* TITLE */;
    this.lastFrameTime = 0;
    this.keysPressed = /* @__PURE__ */ new Set();
    this.animationFrameId = 0;
    this.player = null;
    this.playerBullets = [];
    this.enemies = [];
    this.enemyBullets = [];
    this.explosions = [];
    this.background = null;
    this.score = 0;
    this.lastEnemySpawnTime = 0;
    this.bgmPlaying = false;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with ID "${canvasId}" not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.addEventListeners();
  }
  addEventListeners() {
    window.addEventListener("keydown", (e) => {
      this.keysPressed.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter"].includes(e.code)) {
        e.preventDefault();
      }
      this.handleInput(e);
    });
    window.addEventListener("keyup", (e) => {
      this.keysPressed.delete(e.code);
    });
    document.addEventListener("click", () => {
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }
    }, { once: true });
  }
  handleInput(event) {
    if (event.code === "Enter") {
      if (this.state === 0 /* TITLE */) {
        this.state = 1 /* CONTROLS */;
      } else if (this.state === 1 /* CONTROLS */) {
        this.startGame();
      } else if (this.state === 3 /* GAME_OVER */) {
        this.resetGame();
        this.startGame();
      }
    }
    if (event.code === "Space" && this.state === 2 /* PLAYING */ && this.player?.isAlive) {
      const newBullet = this.player.shoot(this.assets, this);
      if (newBullet) {
        this.playerBullets.push(newBullet);
      }
    }
  }
  async init() {
    console.log("Initializing game...");
    try {
      this.data = await this.loadData();
      this.canvas.width = this.data.gameSettings.canvasWidth;
      this.canvas.height = this.data.gameSettings.canvasHeight;
      this.ctx.imageSmoothingEnabled = false;
      const assetLoader = new AssetLoader(this.data);
      this.assets = await assetLoader.load();
      console.log("Assets loaded:", this.assets);
      this.background = new Background(this.data);
      this.resetGame();
      this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
      console.log("Game initialized. Current state: TITLE");
    } catch (error) {
      console.error("Game initialization failed:", error);
      this.ctx.fillStyle = "red";
      this.ctx.font = "20px Arial";
      this.ctx.fillText("Failed to load game. Check console.", 10, 50);
    }
  }
  async loadData() {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`Failed to fetch data.json: ${response.statusText}`);
    }
    return response.json();
  }
  startGame() {
    if (!this.data || !this.assets) {
      console.error("Game data or assets not loaded.");
      return;
    }
    this.state = 2 /* PLAYING */;
    this.playBGM();
    this.lastEnemySpawnTime = performance.now();
    console.log("Game started.");
  }
  resetGame() {
    if (!this.data) return;
    this.player = new Player(
      this.data.gameSettings.canvasWidth / 2 - this.data.player.width / 2,
      this.data.gameSettings.canvasHeight - this.data.player.height - 20,
      this.data
    );
    this.playerBullets = [];
    this.enemies = [];
    this.enemyBullets = [];
    this.explosions = [];
    this.score = 0;
    this.lastEnemySpawnTime = performance.now();
    this.background = new Background(this.data);
    const bgm = this.assets?.sounds["bgm_ww2"];
    if (bgm) {
      bgm.pause();
      bgm.currentTime = 0;
    }
    this.bgmPlaying = false;
  }
  gameLoop(currentTime) {
    if (!this.data || !this.assets) {
      console.error("Game loop called before data/assets loaded.");
      return;
    }
    const deltaTime = (currentTime - this.lastFrameTime) / 1e3;
    this.lastFrameTime = currentTime;
    this.update(deltaTime);
    this.render();
    this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    if (!this.data) return;
    const gameSpeed = this.data.gameSettings.gameSpeedMultiplier;
    this.background?.update(deltaTime, gameSpeed);
    if (this.state === 2 /* PLAYING */) {
      if (this.player && this.player.isAlive) {
        this.player.update(this.keysPressed, deltaTime, this.data);
      } else if (this.player && !this.player.isAlive && this.player.health <= 0) {
        this.state = 3 /* GAME_OVER */;
        this.playSFX("game_over_sfx");
        this.assets.sounds["bgm_ww2"].pause();
        this.bgmPlaying = false;
        return;
      }
      this.playerBullets.forEach((bullet) => bullet.update(deltaTime, this.data));
      this.playerBullets = this.playerBullets.filter((bullet) => bullet.isAlive);
      const now = performance.now();
      if (this.enemies.length < this.data.spawner.maxEnemiesOnScreen && now - this.lastEnemySpawnTime > this.data.spawner.enemySpawnIntervalMs) {
        const enemyConfig = this.data.enemies[Math.floor(Math.random() * this.data.enemies.length)];
        const x = Math.random() * (this.data.gameSettings.canvasWidth - enemyConfig.width);
        const y = -enemyConfig.height;
        this.enemies.push(new Enemy(x, y, enemyConfig, this.data));
        this.lastEnemySpawnTime = now;
      }
      this.enemies.forEach((enemy) => {
        enemy.update(deltaTime, this.data);
        if (enemy.isAlive && enemy.fireRate > 0) {
          const newBullet = enemy.shoot(this.assets, this);
          if (newBullet) {
            this.enemyBullets.push(newBullet);
          }
        }
      });
      this.enemies = this.enemies.filter((enemy) => enemy.isAlive);
      this.enemyBullets.forEach((bullet) => bullet.update(deltaTime, this.data));
      this.enemyBullets = this.enemyBullets.filter((bullet) => bullet.isAlive);
      this.explosions.forEach((exp) => exp.update(deltaTime));
      this.explosions = this.explosions.filter((exp) => exp.isAlive);
      this.playerBullets.forEach((pBullet) => {
        if (!pBullet.isAlive) return;
        this.enemies.forEach((enemy) => {
          if (enemy.isAlive && checkCollision(pBullet, enemy)) {
            enemy.takeDamage(pBullet.damage);
            pBullet.isAlive = false;
            if (!enemy.isAlive) {
              this.score += enemy.scoreValue;
              this.playSFX("explosion_sfx");
              const explosionConfig = this.data.assets.images.find((img) => img.name === "explosion");
              if (explosionConfig) {
                this.explosions.push(new Explosion(
                  enemy.x + enemy.width / 2 - explosionConfig.width,
                  // Center explosion
                  enemy.y + enemy.height / 2 - explosionConfig.height,
                  explosionConfig.width * 2,
                  // Make explosion larger than frame size
                  explosionConfig.height * 2,
                  "explosion",
                  explosionConfig.frames,
                  50
                  // 50ms per frame
                ));
              }
            }
          }
        });
      });
      this.enemyBullets.forEach((eBullet) => {
        if (!eBullet.isAlive || !this.player?.isAlive) return;
        if (checkCollision(eBullet, this.player)) {
          this.player.takeDamage(eBullet.damage);
          eBullet.isAlive = false;
          if (!this.player.isAlive) {
            this.playSFX("explosion_sfx");
            const explosionConfig = this.data.assets.images.find((img) => img.name === "explosion");
            if (explosionConfig) {
              this.explosions.push(new Explosion(
                this.player.x + this.player.width / 2 - explosionConfig.width,
                this.player.y + this.player.height / 2 - explosionConfig.height,
                explosionConfig.width * 2,
                explosionConfig.height * 2,
                "explosion",
                explosionConfig.frames,
                50
              ));
            }
          }
        }
      });
      this.enemies.forEach((enemy) => {
        if (this.player?.isAlive && enemy.isAlive && checkCollision(this.player, enemy)) {
          this.player.takeDamage(20);
          enemy.takeDamage(enemy.health);
          enemy.isAlive = false;
          this.playSFX("explosion_sfx");
          const explosionConfig = this.data.assets.images.find((img) => img.name === "explosion");
          if (explosionConfig) {
            this.explosions.push(new Explosion(
              enemy.x + enemy.width / 2 - explosionConfig.width,
              enemy.y + enemy.height / 2 - explosionConfig.height,
              explosionConfig.width * 2,
              explosionConfig.height * 2,
              "explosion",
              explosionConfig.frames,
              50
            ));
          }
          if (!this.player.isAlive) {
          }
        }
      });
    }
  }
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.data || !this.assets) return;
    this.background?.render(this.ctx, this.assets);
    if (this.state === 0 /* TITLE */) {
      this.drawText(this.data.gameSettings.titleScreenText, this.canvas.width / 2, this.canvas.height / 2 - 50, "white", 48, "center");
      this.drawText(this.data.gameSettings.titleScreenPrompt, this.canvas.width / 2, this.canvas.height / 2 + 20, "white", 24, "center");
    } else if (this.state === 1 /* CONTROLS */) {
      const lines = this.data.gameSettings.controlsScreenText.split("\n");
      let yPos = this.canvas.height / 2 - lines.length / 2 * 30;
      lines.forEach((line) => {
        this.drawText(line, this.canvas.width / 2, yPos, "white", 24, "center");
        yPos += 30;
      });
      this.drawText("ENTER \uD0A4\uB97C \uB20C\uB7EC \uAC8C\uC784 \uC2DC\uC791", this.canvas.width / 2, yPos + 50, "white", 24, "center");
    } else if (this.state === 2 /* PLAYING */) {
      this.playerBullets.forEach((bullet) => bullet.render(this.ctx, this.assets));
      this.enemyBullets.forEach((bullet) => bullet.render(this.ctx, this.assets));
      this.enemies.forEach((enemy) => enemy.render(this.ctx, this.assets));
      if (this.player && this.player.isAlive) {
        this.player.render(this.ctx, this.assets);
      }
      this.explosions.forEach((exp) => exp.render(this.ctx, this.assets));
      this.drawText(`Score: ${this.score}`, 10, 30, "white", 20, "left");
      if (this.player) {
        this.drawText(`Health: ${Math.max(0, this.player.health)}`, this.canvas.width - 10, 30, "white", 20, "right");
      }
    } else if (this.state === 3 /* GAME_OVER */) {
      this.drawText(this.data.gameSettings.gameOverText, this.canvas.width / 2, this.canvas.height / 2 - 50, "red", 48, "center");
      const prompt = this.data.gameSettings.gameOverPrompt.replace("{score}", this.score.toString());
      this.drawText(prompt, this.canvas.width / 2, this.canvas.height / 2 + 20, "white", 24, "center");
      this.explosions.forEach((exp) => exp.render(this.ctx, this.assets));
      this.drawText(`Score: ${this.score}`, 10, 30, "white", 20, "left");
    }
  }
  drawText(text, x, y, color, size, align) {
    this.ctx.fillStyle = color;
    this.ctx.font = `${size}px 'Press Start 2P', Arial, sans-serif`;
    this.ctx.textAlign = align;
    this.ctx.fillText(text, x, y);
  }
  playBGM() {
    if (this.assets && !this.bgmPlaying) {
      const bgm = this.assets.sounds["bgm_ww2"];
      if (bgm) {
        bgm.loop = true;
        bgm.play().catch((e) => console.log("BGM playback blocked or failed:", e));
        this.bgmPlaying = true;
      }
    }
  }
  playSFX(assetName) {
    if (this.assets) {
      const sfx = this.assets.sounds[assetName];
      if (sfx) {
        const clonedSfx = sfx.cloneNode();
        clonedSfx.volume = sfx.volume;
        clonedSfx.play().catch((e) => console.log(`SFX ${assetName} playback blocked or failed:`, e));
      }
    }
  }
}
function checkCollision(obj1, obj2) {
  return obj1.x < obj2.x + obj2.width && obj1.x + obj1.width > obj2.x && obj1.y < obj2.y + obj2.height && obj1.y + obj1.height > obj2.y;
}
let game;
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  if (canvas) {
    game = new Game("gameCanvas");
    game.init();
  } else {
    console.error("No canvas element with id 'gameCanvas' found.");
    document.body.innerHTML = '<p>Error: Game canvas not found. Please ensure an element like &lt;canvas id="gameCanvas"&gt;&lt;/canvas&gt; exists in your HTML.</p>';
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjsgLy8gSW50ZW5kZWQgcmVuZGVyIHdpZHRoIGZvciBub24tc3ByaXRlc2hlZXQsIG9yIHNpbmdsZSBmcmFtZSB3aWR0aCBmb3Igc3ByaXRlc2hlZXRcclxuICAgIGhlaWdodDogbnVtYmVyOyAvLyBJbnRlbmRlZCByZW5kZXIgaGVpZ2h0IGZvciBub24tc3ByaXRlc2hlZXQsIG9yIHNpbmdsZSBmcmFtZSBoZWlnaHQgZm9yIHNwcml0ZXNoZWV0XHJcbiAgICBmcmFtZXM/OiBudW1iZXI7IC8vIFRvdGFsIGZyYW1lcyBmb3IgYSBzcHJpdGVzaGVldCAoaG9yaXpvbnRhbCBzdHJpcCBhc3N1bWVkKVxyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVBc3NldHMge1xyXG4gICAgaW1hZ2VzOiB7IFtrZXk6IHN0cmluZ106IEhUTUxJbWFnZUVsZW1lbnQgfTtcclxuICAgIHNvdW5kczogeyBba2V5OiBzdHJpbmddOiBIVE1MQXVkaW9FbGVtZW50IH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBFbmVteUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBhc3NldDogc3RyaW5nO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gbWlsbGlzZWNvbmRzIGJldHdlZW4gc2hvdHMgKDAgZm9yIG5vIHNob290aW5nKVxyXG4gICAgc2NvcmU6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGJ1bGxldFNwZWVkOiBudW1iZXI7XHJcbiAgICBidWxsZXREYW1hZ2U6IG51bWJlcjtcclxuICAgIGRyb3BzUG93ZXJ1cDogYm9vbGVhbjsgLy8gTm90IGltcGxlbWVudGVkLCBidXQgZ29vZCBmb3IgZnV0dXJlIGV4dGVuc2lvblxyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZURhdGEge1xyXG4gICAgZ2FtZVNldHRpbmdzOiB7XHJcbiAgICAgICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgICAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBnYW1lU3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7XHJcbiAgICAgICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgdGl0bGVTY3JlZW5Qcm9tcHQ6IHN0cmluZztcclxuICAgICAgICBjb250cm9sc1NjcmVlblRleHQ6IHN0cmluZztcclxuICAgICAgICBnYW1lT3ZlclRleHQ6IHN0cmluZztcclxuICAgICAgICBnYW1lT3ZlclByb21wdDogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIHBsYXllcjoge1xyXG4gICAgICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gbWlsbGlzZWNvbmRzIGJldHdlZW4gc2hvdHNcclxuICAgICAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgZW5lbWllczogRW5lbXlDb25maWdbXTtcclxuICAgIGJ1bGxldHM6IHtcclxuICAgICAgICBwbGF5ZXI6IHsgYXNzZXQ6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH07XHJcbiAgICAgICAgZW5lbXk6IHsgYXNzZXQ6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH07XHJcbiAgICB9O1xyXG4gICAgYmFja2dyb3VuZDoge1xyXG4gICAgICAgIGFzc2V0OiBzdHJpbmc7XHJcbiAgICAgICAgc2Nyb2xsU3BlZWQ6IG51bWJlcjtcclxuICAgICAgICB3aWR0aDogbnVtYmVyOyAvLyBPcmlnaW5hbCBhc3NldCB3aWR0aFxyXG4gICAgICAgIGhlaWdodDogbnVtYmVyOyAvLyBPcmlnaW5hbCBhc3NldCBoZWlnaHRcclxuICAgIH07XHJcbiAgICBzcGF3bmVyOiB7XHJcbiAgICAgICAgZW5lbXlTcGF3bkludGVydmFsTXM6IG51bWJlcjtcclxuICAgICAgICBtYXhFbmVtaWVzT25TY3JlZW46IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgICAgICBzb3VuZHM6IFNvdW5kQXNzZXRbXTtcclxuICAgIH07XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLFxyXG4gICAgQ09OVFJPTFMsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TG9hZGVyIHtcclxuICAgIHByaXZhdGUgZ2FtZURhdGE6IEdhbWVEYXRhO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRJbWFnZXM6IHsgW2tleTogc3RyaW5nXTogSFRNTEltYWdlRWxlbWVudCB9ID0ge307XHJcbiAgICBwcml2YXRlIGxvYWRlZFNvdW5kczogeyBba2V5OiBzdHJpbmddOiBIVE1MQXVkaW9FbGVtZW50IH0gPSB7fTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihnYW1lRGF0YTogR2FtZURhdGEpIHtcclxuICAgICAgICB0aGlzLmdhbWVEYXRhID0gZ2FtZURhdGE7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgbG9hZCgpOiBQcm9taXNlPEdhbWVBc3NldHM+IHtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5nYW1lRGF0YS5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4gdGhpcy5sb2FkSW1hZ2UoaW1nKSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuZ2FtZURhdGEuYXNzZXRzLnNvdW5kcy5tYXAoc25kID0+IHRoaXMubG9hZFNvdW5kKHNuZCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChzb3VuZFByb21pc2VzKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coXCJBbGwgYXNzZXRzIGxvYWRlZC5cIik7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaW1hZ2VzOiB0aGlzLmxvYWRlZEltYWdlcyxcclxuICAgICAgICAgICAgc291bmRzOiB0aGlzLmxvYWRlZFNvdW5kc1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UoaW1hZ2VBc3NldDogSW1hZ2VBc3NldCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gaW1hZ2VBc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRJbWFnZXNbaW1hZ2VBc3NldC5uYW1lXSA9IGltZztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWFnZUFzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWFnZUFzc2V0LnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKHNvdW5kQXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBzb3VuZEFzc2V0LnBhdGg7XHJcbiAgICAgICAgICAgIGF1ZGlvLnByZWxvYWQgPSAnYXV0byc7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kQXNzZXQudm9sdW1lO1xyXG5cclxuICAgICAgICAgICAgLy8gV2FpdCBmb3IgZW5vdWdoIGRhdGEgdG8gcGxheSwgb3IgZnVsbCBsb2FkXHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZFNvdW5kc1tzb3VuZEFzc2V0Lm5hbWVdID0gYXVkaW87XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZEFzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZEFzc2V0LnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGFzc2V0TmFtZTogc3RyaW5nO1xyXG4gICAgaXNBbGl2ZTogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBhc3NldE5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5hc3NldE5hbWUgPSBhc3NldE5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBhc3NldHM6IEdhbWVBc3NldHMpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBpbWcgPSBhc3NldHMuaW1hZ2VzW3RoaXMuYXNzZXROYW1lXTtcclxuICAgICAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgQXNzZXQgbm90IGZvdW5kOiAke3RoaXMuYXNzZXROYW1lfWApO1xyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUGxheWVyIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyOyAvLyBtaWxsaXNlY29uZHMgYmV0d2VlbiBzaG90c1xyXG4gICAgYnVsbGV0U3BlZWQ6IG51bWJlcjtcclxuICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgZmlyZUNvb2xkb3duOiBudW1iZXI7IC8vIGN1cnJlbnQgY29vbGRvd24gaW4gbWlsbGlzZWNvbmRzXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbmZpZzogR2FtZURhdGEpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCBjb25maWcucGxheWVyLndpZHRoLCBjb25maWcucGxheWVyLmhlaWdodCwgXCJwbGF5ZXJfcGxhbmVcIik7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBjb25maWcucGxheWVyLmhlYWx0aDtcclxuICAgICAgICB0aGlzLnNwZWVkID0gY29uZmlnLnBsYXllci5zcGVlZDtcclxuICAgICAgICB0aGlzLmZpcmVSYXRlID0gY29uZmlnLnBsYXllci5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFNwZWVkID0gY29uZmlnLnBsYXllci5idWxsZXRTcGVlZDtcclxuICAgICAgICB0aGlzLmJ1bGxldERhbWFnZSA9IGNvbmZpZy5wbGF5ZXIuYnVsbGV0RGFtYWdlO1xyXG4gICAgICAgIHRoaXMuZmlyZUNvb2xkb3duID0gMDtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoa2V5czogU2V0PHN0cmluZz4sIGRlbHRhVGltZTogbnVtYmVyLCBjb25maWc6IEdhbWVEYXRhKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZ2FtZVNwZWVkID0gY29uZmlnLmdhbWVTZXR0aW5ncy5nYW1lU3BlZWRNdWx0aXBsaWVyO1xyXG5cclxuICAgICAgICBpZiAoa2V5cy5oYXMoJ0Fycm93VXAnKSB8fCBrZXlzLmhhcygnS2V5VycpKSB7XHJcbiAgICAgICAgICAgIHRoaXMueSAtPSB0aGlzLnNwZWVkICogZ2FtZVNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoa2V5cy5oYXMoJ0Fycm93RG93bicpIHx8IGtleXMuaGFzKCdLZXlTJykpIHtcclxuICAgICAgICAgICAgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBnYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChrZXlzLmhhcygnQXJyb3dMZWZ0JykgfHwga2V5cy5oYXMoJ0tleUEnKSkge1xyXG4gICAgICAgICAgICB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGdhbWVTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGtleXMuaGFzKCdBcnJvd1JpZ2h0JykgfHwga2V5cy5oYXMoJ0tleUQnKSkge1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGdhbWVTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBjYW52YXMgYm91bmRhcmllc1xyXG4gICAgICAgIHRoaXMueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMueCwgY29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aCAtIHRoaXMud2lkdGgpKTtcclxuICAgICAgICB0aGlzLnkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLnksIGNvbmZpZy5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0IC0gdGhpcy5oZWlnaHQpKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZmlyZUNvb2xkb3duID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmZpcmVDb29sZG93biAtPSAoZGVsdGFUaW1lICogMTAwMCk7IC8vIERlY3JlbWVudCBpbiBtaWxsaXNlY29uZHNcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc2hvb3QoYXNzZXRzOiBHYW1lQXNzZXRzLCBnYW1lOiBHYW1lKTogQnVsbGV0IHwgbnVsbCB7XHJcbiAgICAgICAgaWYgKHRoaXMuZmlyZUNvb2xkb3duIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5maXJlQ29vbGRvd24gPSB0aGlzLmZpcmVSYXRlO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTRlgoXCJwbGF5ZXJfc2hvb3RcIik7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldENvbmZpZyA9IGdhbWUuZGF0YSEuYnVsbGV0cy5wbGF5ZXI7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgQnVsbGV0KFxyXG4gICAgICAgICAgICAgICAgdGhpcy54ICsgdGhpcy53aWR0aCAvIDIgLSBidWxsZXRDb25maWcud2lkdGggLyAyLFxyXG4gICAgICAgICAgICAgICAgdGhpcy55LFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0Q29uZmlnLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0Q29uZmlnLmhlaWdodCxcclxuICAgICAgICAgICAgICAgIGJ1bGxldENvbmZpZy5hc3NldCxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0U3BlZWQgKiAtMSwgLy8gUGxheWVyIGJ1bGxldHMgZ28gdXBcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0RGFtYWdlLFxyXG4gICAgICAgICAgICAgICAgdHJ1ZSAvLyBpc1BsYXllckJ1bGxldFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGRhbWFnZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgIGlmICh0aGlzLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNBbGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQnVsbGV0IGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICBpc1BsYXllckJ1bGxldDogYm9vbGVhbjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGFzc2V0TmFtZTogc3RyaW5nLCBzcGVlZDogbnVtYmVyLCBkYW1hZ2U6IG51bWJlciwgaXNQbGF5ZXJCdWxsZXQ6IGJvb2xlYW4pIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBhc3NldE5hbWUpO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBzcGVlZDtcclxuICAgICAgICB0aGlzLmRhbWFnZSA9IGRhbWFnZTtcclxuICAgICAgICB0aGlzLmlzUGxheWVyQnVsbGV0ID0gaXNQbGF5ZXJCdWxsZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBjb25maWc6IEdhbWVEYXRhKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBjb25maWcuZ2FtZVNldHRpbmdzLmdhbWVTcGVlZE11bHRpcGxpZXIgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgIC8vIE1hcmsgYXMgZGVhZCBpZiBvZmYtc2NyZWVuXHJcbiAgICAgICAgaWYgKHRoaXMueSArIHRoaXMuaGVpZ2h0IDwgMCB8fCB0aGlzLnkgPiBjb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodCkge1xyXG4gICAgICAgICAgICB0aGlzLmlzQWxpdmUgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEVuZW15IGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyOyAvLyBtaWxsaXNlY29uZHMgYmV0d2VlbiBzaG90c1xyXG4gICAgYnVsbGV0U3BlZWQ6IG51bWJlcjtcclxuICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgZmlyZUNvb2xkb3duOiBudW1iZXI7IC8vIGN1cnJlbnQgY29vbGRvd24gaW4gbWlsbGlzZWNvbmRzXHJcbiAgICBlbmVteUNvbmZpZzogRW5lbXlDb25maWc7IC8vIFN0b3JlIG9yaWdpbmFsIGNvbmZpZyBmb3IgYnVsbGV0IHByb3BlcnRpZXNcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgY29uZmlnOiBFbmVteUNvbmZpZywgZ2FtZURhdGE6IEdhbWVEYXRhKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgY29uZmlnLndpZHRoLCBjb25maWcuaGVpZ2h0LCBjb25maWcuYXNzZXQpO1xyXG4gICAgICAgIHRoaXMuZW5lbXlDb25maWcgPSBjb25maWc7IC8vIEtlZXAgYSByZWZlcmVuY2VcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IGNvbmZpZy5oZWFsdGg7XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IGNvbmZpZy5zcGVlZDtcclxuICAgICAgICB0aGlzLnNjb3JlVmFsdWUgPSBjb25maWcuc2NvcmU7XHJcbiAgICAgICAgdGhpcy5maXJlUmF0ZSA9IGNvbmZpZy5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFNwZWVkID0gY29uZmlnLmJ1bGxldFNwZWVkO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0RGFtYWdlID0gY29uZmlnLmJ1bGxldERhbWFnZTtcclxuICAgICAgICB0aGlzLmZpcmVDb29sZG93biA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRoaXMuZmlyZVJhdGUpOyAvLyBSYW5kb20gaW5pdGlhbCBjb29sZG93blxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgY29uZmlnOiBHYW1lRGF0YSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMueSArPSB0aGlzLnNwZWVkICogY29uZmlnLmdhbWVTZXR0aW5ncy5nYW1lU3BlZWRNdWx0aXBsaWVyICogZGVsdGFUaW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5maXJlQ29vbGRvd24gPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZmlyZUNvb2xkb3duIC09IChkZWx0YVRpbWUgKiAxMDAwKTsgLy8gRGVjcmVtZW50IGluIG1pbGxpc2Vjb25kc1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTWFyayBhcyBkZWFkIGlmIG9mZi1zY3JlZW5cclxuICAgICAgICBpZiAodGhpcy55ID4gY29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNIZWlnaHQpIHtcclxuICAgICAgICAgICAgdGhpcy5pc0FsaXZlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNob290KGFzc2V0czogR2FtZUFzc2V0cywgZ2FtZTogR2FtZSk6IEJ1bGxldCB8IG51bGwge1xyXG4gICAgICAgIGlmICh0aGlzLmZpcmVSYXRlID4gMCAmJiB0aGlzLmZpcmVDb29sZG93biA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZmlyZUNvb2xkb3duID0gdGhpcy5maXJlUmF0ZTtcclxuICAgICAgICAgICAgZ2FtZS5wbGF5U0ZYKFwiZW5lbXlfc2hvb3RcIik7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldENvbmZpZyA9IGdhbWUuZGF0YSEuYnVsbGV0cy5lbmVteTtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBCdWxsZXQoXHJcbiAgICAgICAgICAgICAgICB0aGlzLnggKyB0aGlzLndpZHRoIC8gMiAtIGJ1bGxldENvbmZpZy53aWR0aCAvIDIsXHJcbiAgICAgICAgICAgICAgICB0aGlzLnkgKyB0aGlzLmhlaWdodCxcclxuICAgICAgICAgICAgICAgIGJ1bGxldENvbmZpZy53aWR0aCxcclxuICAgICAgICAgICAgICAgIGJ1bGxldENvbmZpZy5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICBidWxsZXRDb25maWcuYXNzZXQsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldFNwZWVkLCAvLyBFbmVteSBidWxsZXRzIGdvIGRvd25cclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0RGFtYWdlLFxyXG4gICAgICAgICAgICAgICAgZmFsc2UgLy8gaXNQbGF5ZXJCdWxsZXRcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShkYW1hZ2U6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoIC09IGRhbWFnZTtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmlzQWxpdmUgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEV4cGxvc2lvbiBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgY3VycmVudEZyYW1lOiBudW1iZXI7XHJcbiAgICBtYXhGcmFtZXM6IG51bWJlcjtcclxuICAgIGZyYW1lV2lkdGg6IG51bWJlcjsgLy8gV2lkdGggb2YgYSBzaW5nbGUgZnJhbWUgaW4gdGhlIHNwcml0ZXNoZWV0IGFzc2V0XHJcbiAgICBmcmFtZUhlaWdodDogbnVtYmVyOyAvLyBIZWlnaHQgb2YgYSBzaW5nbGUgZnJhbWUgaW4gdGhlIHNwcml0ZXNoZWV0IGFzc2V0XHJcbiAgICBmcmFtZUR1cmF0aW9uOiBudW1iZXI7IC8vIG1pbGxpc2Vjb25kcyBwZXIgZnJhbWVcclxuICAgIGVsYXBzZWRUaW1lOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBhc3NldE5hbWU6IHN0cmluZywgdG90YWxGcmFtZXM6IG51bWJlciwgZnJhbWVEdXJhdGlvbk1zOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBhc3NldE5hbWUpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEZyYW1lID0gMDtcclxuICAgICAgICB0aGlzLm1heEZyYW1lcyA9IHRvdGFsRnJhbWVzO1xyXG4gICAgICAgIHRoaXMuZnJhbWVEdXJhdGlvbiA9IGZyYW1lRHVyYXRpb25NcztcclxuICAgICAgICB0aGlzLmVsYXBzZWRUaW1lID0gMDtcclxuICAgICAgICB0aGlzLmlzQWxpdmUgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBHZXQgYWN0dWFsIGRpbWVuc2lvbnMgb2YgYSBzaW5nbGUgZnJhbWUgZnJvbSBhc3NldCBkYXRhXHJcbiAgICAgICAgY29uc3QgYXNzZXRJbWFnZUluZm8gPSBnYW1lLmRhdGEhLmFzc2V0cy5pbWFnZXMuZmluZChpbWcgPT4gaW1nLm5hbWUgPT09IGFzc2V0TmFtZSk7XHJcbiAgICAgICAgaWYgKGFzc2V0SW1hZ2VJbmZvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZnJhbWVXaWR0aCA9IGFzc2V0SW1hZ2VJbmZvLndpZHRoOyAvLyBBc3NldCB3aWR0aCBpbiBkYXRhLmpzb24gaXMgYWxyZWFkeSBmcmFtZSB3aWR0aFxyXG4gICAgICAgICAgICB0aGlzLmZyYW1lSGVpZ2h0ID0gYXNzZXRJbWFnZUluZm8uaGVpZ2h0OyAvLyBBc3NldCBoZWlnaHQgaW4gZGF0YS5qc29uIGlzIGFscmVhZHkgZnJhbWUgaGVpZ2h0XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gRmFsbGJhY2sgaWYgYXNzZXQgaW5mbyBpcyBtaXNzaW5nXHJcbiAgICAgICAgICAgIHRoaXMuZnJhbWVXaWR0aCA9IHdpZHRoO1xyXG4gICAgICAgICAgICB0aGlzLmZyYW1lSGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmVsYXBzZWRUaW1lICs9IChkZWx0YVRpbWUgKiAxMDAwKTsgLy8gQWNjdW11bGF0ZSB0aW1lIGluIG1pbGxpc2Vjb25kc1xyXG4gICAgICAgIGlmICh0aGlzLmVsYXBzZWRUaW1lID49IHRoaXMuZnJhbWVEdXJhdGlvbikge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRGcmFtZSsrO1xyXG4gICAgICAgICAgICB0aGlzLmVsYXBzZWRUaW1lID0gMDsgLy8gUmVzZXQgZm9yIHRoZSBuZXh0IGZyYW1lXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50RnJhbWUgPj0gdGhpcy5tYXhGcmFtZXMpIHtcclxuICAgICAgICAgICAgdGhpcy5pc0FsaXZlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRzOiBHYW1lQXNzZXRzKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzQWxpdmUpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgaW1nID0gYXNzZXRzLmltYWdlc1t0aGlzLmFzc2V0TmFtZV07XHJcbiAgICAgICAgaWYgKGltZykge1xyXG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgc291cmNlIHgsIHksIHdpZHRoLCBoZWlnaHQgZnJvbSBzcHJpdGVzaGVldFxyXG4gICAgICAgICAgICBjb25zdCBzeCA9IHRoaXMuY3VycmVudEZyYW1lICogdGhpcy5mcmFtZVdpZHRoO1xyXG4gICAgICAgICAgICBjb25zdCBzeSA9IDA7IC8vIEFzc3VtaW5nIGhvcml6b250YWwgc3ByaXRlIHNoZWV0XHJcblxyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgc3gsIHN5LCB0aGlzLmZyYW1lV2lkdGgsIHRoaXMuZnJhbWVIZWlnaHQsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc3VwZXIucmVuZGVyKGN0eCwgYXNzZXRzKTsgLy8gRmFsbGJhY2sgdG8gYmFzaWMgb2JqZWN0IHJlbmRlcmluZ1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQmFja2dyb3VuZCB7XHJcbiAgICBhc3NldE5hbWU6IHN0cmluZztcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICBhc3NldFdpZHRoOiBudW1iZXI7IC8vIE9yaWdpbmFsIGFzc2V0IHdpZHRoXHJcbiAgICBhc3NldEhlaWdodDogbnVtYmVyOyAvLyBPcmlnaW5hbCBhc3NldCBoZWlnaHRcclxuICAgIHlPZmZzZXQ6IG51bWJlcjtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihjb25maWc6IEdhbWVEYXRhKSB7XHJcbiAgICAgICAgY29uc3QgYmdDb25maWcgPSBjb25maWcuYmFja2dyb3VuZDtcclxuICAgICAgICB0aGlzLmFzc2V0TmFtZSA9IGJnQ29uZmlnLmFzc2V0O1xyXG4gICAgICAgIHRoaXMuc2Nyb2xsU3BlZWQgPSBiZ0NvbmZpZy5zY3JvbGxTcGVlZDtcclxuICAgICAgICB0aGlzLmFzc2V0V2lkdGggPSBiZ0NvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmFzc2V0SGVpZ2h0ID0gYmdDb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMueU9mZnNldCA9IDA7XHJcbiAgICAgICAgdGhpcy5jYW52YXNXaWR0aCA9IGNvbmZpZy5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXNIZWlnaHQgPSBjb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWVTcGVlZE11bHRpcGxpZXI6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIC8vIFNjcm9sbCBzcGVlZCBpbiBwaXhlbHMgcGVyIHNlY29uZCwgY29udmVydGVkIHRvIHBpeGVscyBwZXIgZnJhbWVcclxuICAgICAgICB0aGlzLnlPZmZzZXQgPSAodGhpcy55T2Zmc2V0ICsgdGhpcy5zY3JvbGxTcGVlZCAqIGdhbWVTcGVlZE11bHRpcGxpZXIgKiBkZWx0YVRpbWUpICUgdGhpcy5hc3NldEhlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGFzc2V0czogR2FtZUFzc2V0cyk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGltZyA9IGFzc2V0cy5pbWFnZXNbdGhpcy5hc3NldE5hbWVdO1xyXG4gICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgLy8gRHJhdyBmaXJzdCBpbnN0YW5jZVxyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgMCwgdGhpcy55T2Zmc2V0LCB0aGlzLmNhbnZhc1dpZHRoLCB0aGlzLmFzc2V0SGVpZ2h0LCAwLCB0aGlzLnlPZmZzZXQsIHRoaXMuY2FudmFzV2lkdGgsIHRoaXMuYXNzZXRIZWlnaHQpO1xyXG4gICAgICAgICAgICAvLyBEcmF3IHNlY29uZCBpbnN0YW5jZSBhYm92ZSB0aGUgZmlyc3QgdG8gY3JlYXRlIGNvbnRpbnVvdXMgc2Nyb2xsXHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCAwLCB0aGlzLnlPZmZzZXQgLSB0aGlzLmFzc2V0SGVpZ2h0LCB0aGlzLmNhbnZhc1dpZHRoLCB0aGlzLmFzc2V0SGVpZ2h0LCAwLCB0aGlzLnlPZmZzZXQgLSB0aGlzLmFzc2V0SGVpZ2h0LCB0aGlzLmNhbnZhc1dpZHRoLCB0aGlzLmFzc2V0SGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYEJhY2tncm91bmQgYXNzZXQgbm90IGZvdW5kOiAke3RoaXMuYXNzZXROYW1lfWApO1xyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ2JsdWUnOyAvLyBGYWxsYmFjayBjb2xvclxyXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXNXaWR0aCwgdGhpcy5jYW52YXNIZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBkYXRhOiBHYW1lRGF0YSB8IG51bGwgPSBudWxsO1xyXG4gICAgYXNzZXRzOiBHYW1lQXNzZXRzIHwgbnVsbCA9IG51bGw7XHJcbiAgICBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgbGFzdEZyYW1lVGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcbiAgICBrZXlzUHJlc3NlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBhbmltYXRpb25GcmFtZUlkOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHBsYXllcjogUGxheWVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwbGF5ZXJCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZW5lbWllczogRW5lbXlbXSA9IFtdO1xyXG4gICAgZW5lbXlCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZXhwbG9zaW9uczogRXhwbG9zaW9uW10gPSBbXTtcclxuICAgIGJhY2tncm91bmQ6IEJhY2tncm91bmQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIGxhc3RFbmVteVNwYXduVGltZTogbnVtYmVyID0gMDtcclxuICAgIGJnbVBsYXlpbmc6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGF1ZGlvQ29udGV4dDogQXVkaW9Db250ZXh0O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIHdpdGggSUQgXCIke2NhbnZhc0lkfVwiIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyAod2luZG93LkF1ZGlvQ29udGV4dCB8fCAod2luZG93IGFzIGFueSkud2Via2l0QXVkaW9Db250ZXh0KSgpO1xyXG5cclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXJzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhZGRFdmVudExpc3RlbmVycygpOiB2b2lkIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMua2V5c1ByZXNzZWQuYWRkKGUuY29kZSk7XHJcbiAgICAgICAgICAgIC8vIFByZXZlbnQgZGVmYXVsdCBzY3JvbGwgYmVoYXZpb3IgZm9yIGFycm93IGtleXMgYW5kIHNwYWNlXHJcbiAgICAgICAgICAgIGlmIChbJ0Fycm93VXAnLCAnQXJyb3dEb3duJywgJ0Fycm93TGVmdCcsICdBcnJvd1JpZ2h0JywgJ1NwYWNlJywgJ0VudGVyJ10uaW5jbHVkZXMoZS5jb2RlKSkge1xyXG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlSW5wdXQoZSk7IC8vIEZvciBzdGF0ZSB0cmFuc2l0aW9ucyBhbmQgc2hvb3RpbmdcclxuICAgICAgICB9KTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmtleXNQcmVzc2VkLmRlbGV0ZShlLmNvZGUpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgdG91Y2gvY2xpY2sgdG8gc3RhcnQgYXVkaW8gY29udGV4dCBvbiBtb2JpbGVcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSAnc3VzcGVuZGVkJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVJbnB1dChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGlmIChldmVudC5jb2RlID09PSAnRW50ZXInKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuQ09OVFJPTFM7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkNPTlRST0xTKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFBsYXllciBzaG9vdGluZyBvbiBTUEFDRUJBUiBwcmVzcyAobm90IGhvbGQsIGR1ZSB0byBob3cgZmlyZUNvb2xkb3duIHdvcmtzKVxyXG4gICAgICAgIGlmIChldmVudC5jb2RlID09PSAnU3BhY2UnICYmIHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMucGxheWVyPy5pc0FsaXZlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5ld0J1bGxldCA9IHRoaXMucGxheWVyLnNob290KHRoaXMuYXNzZXRzISwgdGhpcyk7XHJcbiAgICAgICAgICAgIGlmIChuZXdCdWxsZXQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5wdXNoKG5ld0J1bGxldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgaW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkluaXRpYWxpemluZyBnYW1lLi4uXCIpO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuICAgICAgICAgICAgdGhpcy5jdHguaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7IC8vIEZvciBwaXhlbCBhcnQgZmVlbFxyXG5cclxuICAgICAgICAgICAgY29uc3QgYXNzZXRMb2FkZXIgPSBuZXcgQXNzZXRMb2FkZXIodGhpcy5kYXRhKTtcclxuICAgICAgICAgICAgdGhpcy5hc3NldHMgPSBhd2FpdCBhc3NldExvYWRlci5sb2FkKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQXNzZXRzIGxvYWRlZDpcIiwgdGhpcy5hc3NldHMpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kID0gbmV3IEJhY2tncm91bmQodGhpcy5kYXRhKTtcclxuICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTsgLy8gSW5pdGlhbGl6ZSBnYW1lIG9iamVjdHNcclxuXHJcbiAgICAgICAgICAgIHRoaXMuYW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkdhbWUgaW5pdGlhbGl6ZWQuIEN1cnJlbnQgc3RhdGU6IFRJVExFXCIpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJHYW1lIGluaXRpYWxpemF0aW9uIGZhaWxlZDpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBEaXNwbGF5IGVycm9yIG9uIGNhbnZhcyBpZiBwb3NzaWJsZVxyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyMHB4IEFyaWFsJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJGYWlsZWQgdG8gbG9hZCBnYW1lLiBDaGVjayBjb25zb2xlLlwiLCAxMCwgNTApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWREYXRhKCk6IFByb21pc2U8R2FtZURhdGE+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGRhdGEuanNvbjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSB8fCAhdGhpcy5hc3NldHMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkdhbWUgZGF0YSBvciBhc3NldHMgbm90IGxvYWRlZC5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIHRoaXMucGxheUJHTSgpO1xyXG4gICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7IC8vIFJlc2V0IHNwYXduIHRpbWVyIGZvciBuZXcgZ2FtZVxyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiR2FtZSBzdGFydGVkLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICByZXNldEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgICAgICB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoIC8gMiAtIHRoaXMuZGF0YS5wbGF5ZXIud2lkdGggLyAyLFxyXG4gICAgICAgICAgICB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodCAtIHRoaXMuZGF0YS5wbGF5ZXIuaGVpZ2h0IC0gMjAsXHJcbiAgICAgICAgICAgIHRoaXMuZGF0YVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSBbXTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmxhc3RFbmVteVNwYXduVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZCA9IG5ldyBCYWNrZ3JvdW5kKHRoaXMuZGF0YSk7IC8vIFJlc2V0IGJhY2tncm91bmQgc2Nyb2xsXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRml4IGZvciBUUzI3Nzk6IEVuc3VyZSB0aGUgYXVkaW8gZWxlbWVudCBleGlzdHMgYmVmb3JlIHRyeWluZyB0byBhc3NpZ24gdG8gY3VycmVudFRpbWVcclxuICAgICAgICBjb25zdCBiZ20gPSB0aGlzLmFzc2V0cz8uc291bmRzW1wiYmdtX3d3MlwiXTtcclxuICAgICAgICBpZiAoYmdtKSB7XHJcbiAgICAgICAgICAgIGJnbS5wYXVzZSgpO1xyXG4gICAgICAgICAgICBiZ20uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmJnbVBsYXlpbmcgPSBmYWxzZTsgLy8gRW5zdXJlIEJHTSByZXN0YXJ0cyBjbGVhbmx5XHJcbiAgICB9XHJcblxyXG4gICAgZ2FtZUxvb3AoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSB8fCAhdGhpcy5hc3NldHMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkdhbWUgbG9vcCBjYWxsZWQgYmVmb3JlIGRhdGEvYXNzZXRzIGxvYWRlZC5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMubGFzdEZyYW1lVGltZSkgLyAxMDAwOyAvLyBEZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLnJlbmRlcigpO1xyXG5cclxuICAgICAgICB0aGlzLmFuaW1hdGlvbkZyYW1lSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGdhbWVTcGVlZCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ2FtZVNwZWVkTXVsdGlwbGllcjtcclxuXHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kPy51cGRhdGUoZGVsdGFUaW1lLCBnYW1lU3BlZWQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyICYmIHRoaXMucGxheWVyLmlzQWxpdmUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZSh0aGlzLmtleXNQcmVzc2VkLCBkZWx0YVRpbWUsIHRoaXMuZGF0YSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5wbGF5ZXIgJiYgIXRoaXMucGxheWVyLmlzQWxpdmUgJiYgdGhpcy5wbGF5ZXIuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U0ZYKFwiZ2FtZV9vdmVyX3NmeFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzIS5zb3VuZHNbXCJiZ21fd3cyXCJdLnBhdXNlKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVBsYXlpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gVXBkYXRlIHBsYXllciBidWxsZXRzXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiBidWxsZXQudXBkYXRlKGRlbHRhVGltZSwgdGhpcy5kYXRhISkpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMgPSB0aGlzLnBsYXllckJ1bGxldHMuZmlsdGVyKGJ1bGxldCA9PiBidWxsZXQuaXNBbGl2ZSk7XHJcblxyXG4gICAgICAgICAgICAvLyBTcGF3biBlbmVtaWVzXHJcbiAgICAgICAgICAgIGNvbnN0IG5vdyA9IHBlcmZvcm1hbmNlLm5vdygpOyAvLyBDdXJyZW50IHRpbWUgaW4gbXNcclxuICAgICAgICAgICAgaWYgKHRoaXMuZW5lbWllcy5sZW5ndGggPCB0aGlzLmRhdGEuc3Bhd25lci5tYXhFbmVtaWVzT25TY3JlZW4gJiZcclxuICAgICAgICAgICAgICAgIG5vdyAtIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID4gdGhpcy5kYXRhLnNwYXduZXIuZW5lbXlTcGF3bkludGVydmFsTXMpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVuZW15Q29uZmlnID0gdGhpcy5kYXRhLmVuZW1pZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5kYXRhLmVuZW1pZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgICAgICBjb25zdCB4ID0gTWF0aC5yYW5kb20oKSAqICh0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoIC0gZW5lbXlDb25maWcud2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeSA9IC1lbmVteUNvbmZpZy5oZWlnaHQ7IC8vIFNwYXduIHNsaWdodGx5IGFib3ZlIHNjcmVlblxyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmVtaWVzLnB1c2gobmV3IEVuZW15KHgsIHksIGVuZW15Q29uZmlnLCB0aGlzLmRhdGEpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gbm93O1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgZW5lbWllcyBhbmQgaGFuZGxlIGVuZW15IHNob290aW5nXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgICAgIGVuZW15LnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMuZGF0YSEpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGVuZW15LmlzQWxpdmUgJiYgZW5lbXkuZmlyZVJhdGUgPiAwKSB7IC8vIE9ubHkgYXR0ZW1wdCB0byBzaG9vdCBpZiBlbmVteSBpcyBhbGl2ZSBhbmQgY2FuIHNob290XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3QnVsbGV0ID0gZW5lbXkuc2hvb3QodGhpcy5hc3NldHMhLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobmV3QnVsbGV0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzLnB1c2gobmV3QnVsbGV0KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB0aGlzLmVuZW1pZXMgPSB0aGlzLmVuZW1pZXMuZmlsdGVyKGVuZW15ID0+IGVuZW15LmlzQWxpdmUpO1xyXG5cclxuICAgICAgICAgICAgLy8gVXBkYXRlIGVuZW15IGJ1bGxldHNcclxuICAgICAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4gYnVsbGV0LnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMuZGF0YSEpKTtcclxuICAgICAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMgPSB0aGlzLmVuZW15QnVsbGV0cy5maWx0ZXIoYnVsbGV0ID0+IGJ1bGxldC5pc0FsaXZlKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBleHBsb3Npb25zXHJcbiAgICAgICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGV4cCA9PiBleHAudXBkYXRlKGRlbHRhVGltZSkpO1xyXG4gICAgICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSB0aGlzLmV4cGxvc2lvbnMuZmlsdGVyKGV4cCA9PiBleHAuaXNBbGl2ZSk7XHJcblxyXG4gICAgICAgICAgICAvLyAtLS0gQ29sbGlzaW9uIERldGVjdGlvbiAtLS1cclxuICAgICAgICAgICAgLy8gUGxheWVyIGJ1bGxldHMgdnMuIEVuZW1pZXNcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2gocEJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIXBCdWxsZXQuaXNBbGl2ZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZW5lbXkuaXNBbGl2ZSAmJiBjaGVja0NvbGxpc2lvbihwQnVsbGV0LCBlbmVteSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZW5lbXkudGFrZURhbWFnZShwQnVsbGV0LmRhbWFnZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBCdWxsZXQuaXNBbGl2ZSA9IGZhbHNlOyAvLyBCdWxsZXQgaXMgZGVzdHJveWVkIG9uIGltcGFjdFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIWVuZW15LmlzQWxpdmUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gZW5lbXkuc2NvcmVWYWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNGWChcImV4cGxvc2lvbl9zZnhcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBZGQgZXhwbG9zaW9uXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleHBsb3Npb25Db25maWcgPSB0aGlzLmRhdGEhLmFzc2V0cy5pbWFnZXMuZmluZChpbWcgPT4gaW1nLm5hbWUgPT09IFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4cGxvc2lvbkNvbmZpZykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXhwbG9zaW9ucy5wdXNoKG5ldyBFeHBsb3Npb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15LnggKyBlbmVteS53aWR0aCAvIDIgLSBleHBsb3Npb25Db25maWcud2lkdGgsIC8vIENlbnRlciBleHBsb3Npb25cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5lbXkueSArIGVuZW15LmhlaWdodCAvIDIgLSBleHBsb3Npb25Db25maWcuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBsb3Npb25Db25maWcud2lkdGggKiAyLCAvLyBNYWtlIGV4cGxvc2lvbiBsYXJnZXIgdGhhbiBmcmFtZSBzaXplXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGxvc2lvbkNvbmZpZy5oZWlnaHQgKiAyLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImV4cGxvc2lvblwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBsb3Npb25Db25maWcuZnJhbWVzISxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgNTAgLy8gNTBtcyBwZXIgZnJhbWVcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIEVuZW15IGJ1bGxldHMgdnMuIFBsYXllclxyXG4gICAgICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGVCdWxsZXQgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFlQnVsbGV0LmlzQWxpdmUgfHwgIXRoaXMucGxheWVyPy5pc0FsaXZlKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrQ29sbGlzaW9uKGVCdWxsZXQsIHRoaXMucGxheWVyKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnRha2VEYW1hZ2UoZUJ1bGxldC5kYW1hZ2UpO1xyXG4gICAgICAgICAgICAgICAgICAgIGVCdWxsZXQuaXNBbGl2ZSA9IGZhbHNlOyAvLyBCdWxsZXQgaXMgZGVzdHJveWVkIG9uIGltcGFjdFxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5wbGF5ZXIuaXNBbGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBHYW1lIG92ZXIgd2lsbCBiZSB0cmlnZ2VyZWQgaW4gdGhlIG5leHQgdXBkYXRlIGN5Y2xlIGR1ZSB0byBwbGF5ZXIuaXNBbGl2ZSBjaGVja1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTRlgoXCJleHBsb3Npb25fc2Z4XCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBleHBsb3Npb25Db25maWcgPSB0aGlzLmRhdGEhLmFzc2V0cy5pbWFnZXMuZmluZChpbWcgPT4gaW1nLm5hbWUgPT09IFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXhwbG9zaW9uQ29uZmlnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnggKyB0aGlzLnBsYXllci53aWR0aCAvIDIgLSBleHBsb3Npb25Db25maWcud2lkdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIueSArIHRoaXMucGxheWVyLmhlaWdodCAvIDIgLSBleHBsb3Npb25Db25maWcuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGxvc2lvbkNvbmZpZy53aWR0aCAqIDIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwbG9zaW9uQ29uZmlnLmhlaWdodCAqIDIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJleHBsb3Npb25cIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBsb3Npb25Db25maWcuZnJhbWVzISxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA1MFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gUGxheWVyIHZzLiBFbmVtaWVzIChjb2xsaXNpb24gZGFtYWdlKVxyXG4gICAgICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXI/LmlzQWxpdmUgJiYgZW5lbXkuaXNBbGl2ZSAmJiBjaGVja0NvbGxpc2lvbih0aGlzLnBsYXllciwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIudGFrZURhbWFnZSgyMCk7IC8vIERpcmVjdCBjb2xsaXNpb24gZGFtYWdlXHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkudGFrZURhbWFnZShlbmVteS5oZWFsdGgpOyAvLyBFbmVteSBpcyBpbnN0YW50bHkgZGVzdHJveWVkXHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkuaXNBbGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNGWChcImV4cGxvc2lvbl9zZnhcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRkIGV4cGxvc2lvbiBmb3IgZW5lbXlcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBleHBsb3Npb25Db25maWcgPSB0aGlzLmRhdGEhLmFzc2V0cy5pbWFnZXMuZmluZChpbWcgPT4gaW1nLm5hbWUgPT09IFwiZXhwbG9zaW9uXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChleHBsb3Npb25Db25maWcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15LnggKyBlbmVteS53aWR0aCAvIDIgLSBleHBsb3Npb25Db25maWcud2lkdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmVteS55ICsgZW5lbXkuaGVpZ2h0IC8gMiAtIGV4cGxvc2lvbkNvbmZpZy5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBsb3Npb25Db25maWcud2lkdGggKiAyLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwbG9zaW9uQ29uZmlnLmhlaWdodCAqIDIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImV4cGxvc2lvblwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwbG9zaW9uQ29uZmlnLmZyYW1lcyEsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA1MFxyXG4gICAgICAgICAgICAgICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnBsYXllci5pc0FsaXZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFBsYXllciBleHBsb3Npb24gd2lsbCBiZSBoYW5kbGVkIGJ5IHRoZSBwbGF5ZXIuaXNBbGl2ZSBjaGVjayBhdCB0aGUgYmVnaW5uaW5nIG9mIHVwZGF0ZSgpXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSB8fCAhdGhpcy5hc3NldHMpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gUmVuZGVyIGJhY2tncm91bmQgZmlyc3RcclxuICAgICAgICB0aGlzLmJhY2tncm91bmQ/LnJlbmRlcih0aGlzLmN0eCwgdGhpcy5hc3NldHMpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQodGhpcy5kYXRhLmdhbWVTZXR0aW5ncy50aXRsZVNjcmVlblRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwLCAnd2hpdGUnLCA0OCwgJ2NlbnRlcicpO1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5Qcm9tcHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDIwLCAnd2hpdGUnLCAyNCwgJ2NlbnRlcicpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkNPTlRST0xTKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gdGhpcy5kYXRhLmdhbWVTZXR0aW5ncy5jb250cm9sc1NjcmVlblRleHQuc3BsaXQoJ1xcbicpO1xyXG4gICAgICAgICAgICBsZXQgeVBvcyA9IHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAobGluZXMubGVuZ3RoIC8gMikgKiAzMDsgLy8gQWRqdXN0IHN0YXJ0aW5nIFkgZm9yIG11bHRpbGluZVxyXG4gICAgICAgICAgICBsaW5lcy5mb3JFYWNoKGxpbmUgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChsaW5lLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlQb3MsICd3aGl0ZScsIDI0LCAnY2VudGVyJyk7XHJcbiAgICAgICAgICAgICAgICB5UG9zICs9IDMwO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChcIkVOVEVSIFx1RDBBNFx1Qjk3QyBcdUIyMENcdUI3RUMgXHVBQzhDXHVDNzg0IFx1QzJEQ1x1Qzc5MVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHlQb3MgKyA1MCwgJ3doaXRlJywgMjQsICdjZW50ZXInKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiBidWxsZXQucmVuZGVyKHRoaXMuY3R4LCB0aGlzLmFzc2V0cyEpKTtcclxuICAgICAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4gYnVsbGV0LnJlbmRlcih0aGlzLmN0eCwgdGhpcy5hc3NldHMhKSk7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IGVuZW15LnJlbmRlcih0aGlzLmN0eCwgdGhpcy5hc3NldHMhKSk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXllciAmJiB0aGlzLnBsYXllci5pc0FsaXZlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5yZW5kZXIodGhpcy5jdHgsIHRoaXMuYXNzZXRzISk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zLmZvckVhY2goZXhwID0+IGV4cC5yZW5kZXIodGhpcy5jdHgsIHRoaXMuYXNzZXRzISkpO1xyXG5cclxuICAgICAgICAgICAgLy8gRHJhdyBVSVxyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGBTY29yZTogJHt0aGlzLnNjb3JlfWAsIDEwLCAzMCwgJ3doaXRlJywgMjAsICdsZWZ0Jyk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXllcikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChgSGVhbHRoOiAke01hdGgubWF4KDAsIHRoaXMucGxheWVyLmhlYWx0aCl9YCwgdGhpcy5jYW52YXMud2lkdGggLSAxMCwgMzAsICd3aGl0ZScsIDIwLCAncmlnaHQnKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ2FtZU92ZXJUZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgJ3JlZCcsIDQ4LCAnY2VudGVyJyk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByb21wdCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ2FtZU92ZXJQcm9tcHQucmVwbGFjZSgne3Njb3JlfScsIHRoaXMuc2NvcmUudG9TdHJpbmcoKSk7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQocHJvbXB0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCwgJ3doaXRlJywgMjQsICdjZW50ZXInKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFJlbmRlciBhbnkgcmVtYWluaW5nIGVudGl0aWVzIChleHBsb3Npb25zIHdpbGwgZmFkZSBvdXQpXHJcbiAgICAgICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGV4cCA9PiBleHAucmVuZGVyKHRoaXMuY3R4LCB0aGlzLmFzc2V0cyEpKTtcclxuXHJcbiAgICAgICAgICAgICAvLyBEcmF3IGZpbmFsIHNjb3JlXHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQoYFNjb3JlOiAke3RoaXMuc2NvcmV9YCwgMTAsIDMwLCAnd2hpdGUnLCAyMCwgJ2xlZnQnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhd1RleHQodGV4dDogc3RyaW5nLCB4OiBudW1iZXIsIHk6IG51bWJlciwgY29sb3I6IHN0cmluZywgc2l6ZTogbnVtYmVyLCBhbGlnbjogQ2FudmFzVGV4dEFsaWduKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gY29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IGAke3NpemV9cHggJ1ByZXNzIFN0YXJ0IDJQJywgQXJpYWwsIHNhbnMtc2VyaWZgOyAvLyBBZGRlZCBhIHBpeGVsLWFydCBmb250IHN1Z2dlc3Rpb25cclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBhbGlnbjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5QkdNKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmFzc2V0cyAmJiAhdGhpcy5iZ21QbGF5aW5nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJnbSA9IHRoaXMuYXNzZXRzLnNvdW5kc1tcImJnbV93dzJcIl07XHJcbiAgICAgICAgICAgIGlmIChiZ20pIHtcclxuICAgICAgICAgICAgICAgIGJnbS5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGJnbS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5YmFjayBibG9ja2VkIG9yIGZhaWxlZDpcIiwgZSkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21QbGF5aW5nID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwbGF5U0ZYKGFzc2V0TmFtZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuYXNzZXRzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNmeCA9IHRoaXMuYXNzZXRzLnNvdW5kc1thc3NldE5hbWVdO1xyXG4gICAgICAgICAgICBpZiAoc2Z4KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUbyBhbGxvdyBtdWx0aXBsZSBzb3VuZHMgdG8gcGxheSBjb25jdXJyZW50bHksIGNsb25lIHRoZSBhdWRpbyBlbGVtZW50XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjbG9uZWRTZnggPSBzZnguY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGNsb25lZFNmeC52b2x1bWUgPSBzZngudm9sdW1lOyAvLyBLZWVwIG9yaWdpbmFsIHZvbHVtZVxyXG4gICAgICAgICAgICAgICAgY2xvbmVkU2Z4LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKGBTRlggJHthc3NldE5hbWV9IHBsYXliYWNrIGJsb2NrZWQgb3IgZmFpbGVkOmAsIGUpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gSGVscGVyIGZ1bmN0aW9uIGZvciBBQUJCIGNvbGxpc2lvbiBkZXRlY3Rpb25cclxuZnVuY3Rpb24gY2hlY2tDb2xsaXNpb24ob2JqMTogR2FtZU9iamVjdCwgb2JqMjogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIG9iajEueCA8IG9iajIueCArIG9iajIud2lkdGggJiZcclxuICAgICAgICAgICBvYmoxLnggKyBvYmoxLndpZHRoID4gb2JqMi54ICYmXHJcbiAgICAgICAgICAgb2JqMS55IDwgb2JqMi55ICsgb2JqMi5oZWlnaHQgJiZcclxuICAgICAgICAgICBvYmoxLnkgKyBvYmoxLmhlaWdodCA+IG9iajIueTtcclxufVxyXG5cclxuLy8gR2xvYmFsIGdhbWUgaW5zdGFuY2VcclxubGV0IGdhbWU6IEdhbWU7XHJcblxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKTtcclxuICAgIGlmIChjYW52YXMpIHtcclxuICAgICAgICBnYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgICAgICBnYW1lLmluaXQoKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIk5vIGNhbnZhcyBlbGVtZW50IHdpdGggaWQgJ2dhbWVDYW52YXMnIGZvdW5kLlwiKTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmlubmVySFRNTCA9IFwiPHA+RXJyb3I6IEdhbWUgY2FudmFzIG5vdCBmb3VuZC4gUGxlYXNlIGVuc3VyZSBhbiBlbGVtZW50IGxpa2UgJmx0O2NhbnZhcyBpZD1cXFwiZ2FtZUNhbnZhc1xcXCImZ3Q7Jmx0Oy9jYW52YXMmZ3Q7IGV4aXN0cyBpbiB5b3VyIEhUTUwuPC9wPlwiO1xyXG4gICAgfVxyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIkFBMkVBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSkMsU0FBQUE7QUFBQSxHQUFBO0FBT0wsTUFBTSxZQUFZO0FBQUEsRUFLZCxZQUFZLFVBQW9CO0FBSGhDLFNBQVEsZUFBb0QsQ0FBQztBQUM3RCxTQUFRLGVBQW9ELENBQUM7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
