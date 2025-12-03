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
        0,
        // Player bullets have no X velocity
        this.bulletSpeed * -1,
        // Player bullets go up (negative Y velocity)
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
  constructor(x, y, width, height, assetName, velX, velY, damage, isPlayerBullet) {
    super(x, y, width, height, assetName);
    this.velX = velX;
    this.velY = velY;
    this.damage = damage;
    this.isPlayerBullet = isPlayerBullet;
  }
  update(deltaTime, config) {
    const gameSpeed = config.gameSettings.gameSpeedMultiplier;
    this.x += this.velX * gameSpeed * deltaTime;
    this.y += this.velY * gameSpeed * deltaTime;
    if (this.y + this.height < 0 || this.y > config.gameSettings.canvasHeight || this.x + this.width < 0 || this.x > config.gameSettings.canvasWidth) {
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
  render(ctx, assets) {
    const img = assets.images[this.assetName];
    if (img) {
      ctx.save();
      ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, -this.width / 2, -this.height / 2, this.width, this.height);
      ctx.restore();
    } else {
      super.render(ctx, assets);
    }
  }
  shoot(assets, game2, targetX, targetY) {
    if (this.fireRate > 0 && this.fireCooldown <= 0) {
      this.fireCooldown = this.fireRate;
      game2.playSFX("enemy_shoot");
      const bulletConfig = game2.data.bullets.enemy;
      const bulletStartX = this.x + this.width / 2 - bulletConfig.width / 2;
      const bulletStartY = this.y + this.height;
      const deltaX = targetX - bulletStartX;
      const deltaY = targetY - bulletStartY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      let velX = 0;
      let velY = this.bulletSpeed;
      if (distance > 0.01) {
        velX = deltaX / distance * this.bulletSpeed;
        velY = deltaY / distance * this.bulletSpeed;
      } else {
        velX = 0;
        velY = this.bulletSpeed;
      }
      return new Bullet(
        bulletStartX,
        bulletStartY,
        bulletConfig.width,
        bulletConfig.height,
        bulletConfig.asset,
        velX,
        velY,
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
        if (enemy.isAlive && enemy.fireRate > 0 && this.player && this.player.isAlive) {
          const newBullet = enemy.shoot(this.assets, this, this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjsgLy8gSW50ZW5kZWQgcmVuZGVyIHdpZHRoIGZvciBub24tc3ByaXRlc2hlZXQsIG9yIHNpbmdsZSBmcmFtZSB3aWR0aCBmb3Igc3ByaXRlc2hlZXRcclxuICAgIGhlaWdodDogbnVtYmVyOyAvLyBJbnRlbmRlZCByZW5kZXIgaGVpZ2h0IGZvciBub24tc3ByaXRlc2hlZXQsIG9yIHNpbmdsZSBmcmFtZSBoZWlnaHQgZm9yIHNwcml0ZXNoZWV0XHJcbiAgICBmcmFtZXM/OiBudW1iZXI7IC8vIFRvdGFsIGZyYW1lcyBmb3IgYSBzcHJpdGVzaGVldCAoaG9yaXpvbnRhbCBzdHJpcCBhc3N1bWVkKVxyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVBc3NldHMge1xyXG4gICAgaW1hZ2VzOiB7IFtrZXk6IHN0cmluZ106IEhUTUxJbWFnZUVsZW1lbnQgfTtcclxuICAgIHNvdW5kczogeyBba2V5OiBzdHJpbmddOiBIVE1MQXVkaW9FbGVtZW50IH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBFbmVteUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBhc3NldDogc3RyaW5nO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gbWlsbGlzZWNvbmRzIGJldHdlZW4gc2hvdHMgKDAgZm9yIG5vIHNob290aW5nKVxyXG4gICAgc2NvcmU6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGJ1bGxldFNwZWVkOiBudW1iZXI7XHJcbiAgICBidWxsZXREYW1hZ2U6IG51bWJlcjtcclxuICAgIGRyb3BzUG93ZXJ1cDogYm9vbGVhbjsgLy8gTm90IGltcGxlbWVudGVkLCBidXQgZ29vZCBmb3IgZnV0dXJlIGV4dGVuc2lvblxyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZURhdGEge1xyXG4gICAgZ2FtZVNldHRpbmdzOiB7XHJcbiAgICAgICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgICAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBnYW1lU3BlZWRNdWx0aXBsaWVyOiBudW1iZXI7XHJcbiAgICAgICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgdGl0bGVTY3JlZW5Qcm9tcHQ6IHN0cmluZztcclxuICAgICAgICBjb250cm9sc1NjcmVlblRleHQ6IHN0cmluZztcclxuICAgICAgICBnYW1lT3ZlclRleHQ6IHN0cmluZztcclxuICAgICAgICBnYW1lT3ZlclByb21wdDogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIHBsYXllcjoge1xyXG4gICAgICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gbWlsbGlzZWNvbmRzIGJldHdlZW4gc2hvdHNcclxuICAgICAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgZW5lbWllczogRW5lbXlDb25maWdbXTtcclxuICAgIGJ1bGxldHM6IHtcclxuICAgICAgICBwbGF5ZXI6IHsgYXNzZXQ6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH07XHJcbiAgICAgICAgZW5lbXk6IHsgYXNzZXQ6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH07XHJcbiAgICB9O1xyXG4gICAgYmFja2dyb3VuZDoge1xyXG4gICAgICAgIGFzc2V0OiBzdHJpbmc7XHJcbiAgICAgICAgc2Nyb2xsU3BlZWQ6IG51bWJlcjtcclxuICAgICAgICB3aWR0aDogbnVtYmVyOyAvLyBPcmlnaW5hbCBhc3NldCB3aWR0aFxyXG4gICAgICAgIGhlaWdodDogbnVtYmVyOyAvLyBPcmlnaW5hbCBhc3NldCBoZWlnaHRcclxuICAgIH07XHJcbiAgICBzcGF3bmVyOiB7XHJcbiAgICAgICAgZW5lbXlTcGF3bkludGVydmFsTXM6IG51bWJlcjtcclxuICAgICAgICBtYXhFbmVtaWVzT25TY3JlZW46IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgICAgICBzb3VuZHM6IFNvdW5kQXNzZXRbXTtcclxuICAgIH07XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLFxyXG4gICAgQ09OVFJPTFMsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSXHJcbn1cclxuXHJcbmNsYXNzIEFzc2V0TG9hZGVyIHtcclxuICAgIHByaXZhdGUgZ2FtZURhdGE6IEdhbWVEYXRhO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRJbWFnZXM6IHsgW2tleTogc3RyaW5nXTogSFRNTEltYWdlRWxlbWVudCB9ID0ge307XHJcbiAgICBwcml2YXRlIGxvYWRlZFNvdW5kczogeyBba2V5OiBzdHJpbmddOiBIVE1MQXVkaW9FbGVtZW50IH0gPSB7fTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihnYW1lRGF0YTogR2FtZURhdGEpIHtcclxuICAgICAgICB0aGlzLmdhbWVEYXRhID0gZ2FtZURhdGE7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgbG9hZCgpOiBQcm9taXNlPEdhbWVBc3NldHM+IHtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5nYW1lRGF0YS5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4gdGhpcy5sb2FkSW1hZ2UoaW1nKSk7XHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuZ2FtZURhdGEuYXNzZXRzLnNvdW5kcy5tYXAoc25kID0+IHRoaXMubG9hZFNvdW5kKHNuZCkpO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChzb3VuZFByb21pc2VzKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coXCJBbGwgYXNzZXRzIGxvYWRlZC5cIik7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgaW1hZ2VzOiB0aGlzLmxvYWRlZEltYWdlcyxcclxuICAgICAgICAgICAgc291bmRzOiB0aGlzLmxvYWRlZFNvdW5kc1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UoaW1hZ2VBc3NldDogSW1hZ2VBc3NldCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWcuc3JjID0gaW1hZ2VBc3NldC5wYXRoO1xyXG4gICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRJbWFnZXNbaW1hZ2VBc3NldC5uYW1lXSA9IGltZztcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWFnZUFzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWFnZUFzc2V0LnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgbG9hZFNvdW5kKHNvdW5kQXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICBhdWRpby5zcmMgPSBzb3VuZEFzc2V0LnBhdGg7XHJcbiAgICAgICAgICAgIGF1ZGlvLnByZWxvYWQgPSAnYXV0byc7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kQXNzZXQudm9sdW1lO1xyXG5cclxuICAgICAgICAgICAgLy8gV2FpdCBmb3IgZW5vdWdoIGRhdGEgdG8gcGxheSwgb3IgZnVsbCBsb2FkXHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZFNvdW5kc1tzb3VuZEFzc2V0Lm5hbWVdID0gYXVkaW87XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZEFzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZEFzc2V0LnBhdGh9YCkpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGFzc2V0TmFtZTogc3RyaW5nO1xyXG4gICAgaXNBbGl2ZTogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBhc3NldE5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5hc3NldE5hbWUgPSBhc3NldE5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBhc3NldHM6IEdhbWVBc3NldHMpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBpbWcgPSBhc3NldHMuaW1hZ2VzW3RoaXMuYXNzZXROYW1lXTtcclxuICAgICAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgQXNzZXQgbm90IGZvdW5kOiAke3RoaXMuYXNzZXROYW1lfWApO1xyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUGxheWVyIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBmaXJlUmF0ZTogbnVtYmVyOyAvLyBtaWxsaXNlY29uZHMgYmV0d2VlbiBzaG90c1xyXG4gICAgYnVsbGV0U3BlZWQ6IG51bWJlcjtcclxuICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgZmlyZUNvb2xkb3duOiBudW1iZXI7IC8vIGN1cnJlbnQgY29vbGRvd24gaW4gbWlsbGlzZWNvbmRzXHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbmZpZzogR2FtZURhdGEpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCBjb25maWcucGxheWVyLndpZHRoLCBjb25maWcucGxheWVyLmhlaWdodCwgXCJwbGF5ZXJfcGxhbmVcIik7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSBjb25maWcucGxheWVyLmhlYWx0aDtcclxuICAgICAgICB0aGlzLnNwZWVkID0gY29uZmlnLnBsYXllci5zcGVlZDtcclxuICAgICAgICB0aGlzLmZpcmVSYXRlID0gY29uZmlnLnBsYXllci5maXJlUmF0ZTtcclxuICAgICAgICB0aGlzLmJ1bGxldFNwZWVkID0gY29uZmlnLnBsYXllci5idWxsZXRTcGVlZDtcclxuICAgICAgICB0aGlzLmJ1bGxldERhbWFnZSA9IGNvbmZpZy5wbGF5ZXIuYnVsbGV0RGFtYWdlO1xyXG4gICAgICAgIHRoaXMuZmlyZUNvb2xkb3duID0gMDtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoa2V5czogU2V0PHN0cmluZz4sIGRlbHRhVGltZTogbnVtYmVyLCBjb25maWc6IEdhbWVEYXRhKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZ2FtZVNwZWVkID0gY29uZmlnLmdhbWVTZXR0aW5ncy5nYW1lU3BlZWRNdWx0aXBsaWVyO1xyXG5cclxuICAgICAgICBpZiAoa2V5cy5oYXMoJ0Fycm93VXAnKSB8fCBrZXlzLmhhcygnS2V5VycpKSB7XHJcbiAgICAgICAgICAgIHRoaXMueSAtPSB0aGlzLnNwZWVkICogZ2FtZVNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoa2V5cy5oYXMoJ0Fycm93RG93bicpIHx8IGtleXMuaGFzKCdLZXlTJykpIHtcclxuICAgICAgICAgICAgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBnYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChrZXlzLmhhcygnQXJyb3dMZWZ0JykgfHwga2V5cy5oYXMoJ0tleUEnKSkge1xyXG4gICAgICAgICAgICB0aGlzLnggLT0gdGhpcy5zcGVlZCAqIGdhbWVTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGtleXMuaGFzKCdBcnJvd1JpZ2h0JykgfHwga2V5cy5oYXMoJ0tleUQnKSkge1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gdGhpcy5zcGVlZCAqIGdhbWVTcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBjYW52YXMgYm91bmRhcmllc1xyXG4gICAgICAgIHRoaXMueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMueCwgY29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aCAtIHRoaXMud2lkdGgpKTtcclxuICAgICAgICB0aGlzLnkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLnksIGNvbmZpZy5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0IC0gdGhpcy5oZWlnaHQpKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZmlyZUNvb2xkb3duID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmZpcmVDb29sZG93biAtPSAoZGVsdGFUaW1lICogMTAwMCk7IC8vIERlY3JlbWVudCBpbiBtaWxsaXNlY29uZHNcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgc2hvb3QoYXNzZXRzOiBHYW1lQXNzZXRzLCBnYW1lOiBHYW1lKTogQnVsbGV0IHwgbnVsbCB7XHJcbiAgICAgICAgaWYgKHRoaXMuZmlyZUNvb2xkb3duIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5maXJlQ29vbGRvd24gPSB0aGlzLmZpcmVSYXRlO1xyXG4gICAgICAgICAgICBnYW1lLnBsYXlTRlgoXCJwbGF5ZXJfc2hvb3RcIik7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldENvbmZpZyA9IGdhbWUuZGF0YSEuYnVsbGV0cy5wbGF5ZXI7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgQnVsbGV0KFxyXG4gICAgICAgICAgICAgICAgdGhpcy54ICsgdGhpcy53aWR0aCAvIDIgLSBidWxsZXRDb25maWcud2lkdGggLyAyLFxyXG4gICAgICAgICAgICAgICAgdGhpcy55LFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0Q29uZmlnLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0Q29uZmlnLmhlaWdodCxcclxuICAgICAgICAgICAgICAgIGJ1bGxldENvbmZpZy5hc3NldCxcclxuICAgICAgICAgICAgICAgIDAsIC8vIFBsYXllciBidWxsZXRzIGhhdmUgbm8gWCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRTcGVlZCAqIC0xLCAvLyBQbGF5ZXIgYnVsbGV0cyBnbyB1cCAobmVnYXRpdmUgWSB2ZWxvY2l0eSlcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0RGFtYWdlLFxyXG4gICAgICAgICAgICAgICAgdHJ1ZSAvLyBpc1BsYXllckJ1bGxldFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGRhbWFnZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgIGlmICh0aGlzLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNBbGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQnVsbGV0IGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICB2ZWxYOiBudW1iZXI7IC8vIFZlbG9jaXR5IGluIFggZGlyZWN0aW9uXHJcbiAgICB2ZWxZOiBudW1iZXI7IC8vIFZlbG9jaXR5IGluIFkgZGlyZWN0aW9uXHJcbiAgICBkYW1hZ2U6IG51bWJlcjtcclxuICAgIGlzUGxheWVyQnVsbGV0OiBib29sZWFuO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgYXNzZXROYW1lOiBzdHJpbmcsIHZlbFg6IG51bWJlciwgdmVsWTogbnVtYmVyLCBkYW1hZ2U6IG51bWJlciwgaXNQbGF5ZXJCdWxsZXQ6IGJvb2xlYW4pIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBhc3NldE5hbWUpO1xyXG4gICAgICAgIHRoaXMudmVsWCA9IHZlbFg7XHJcbiAgICAgICAgdGhpcy52ZWxZID0gdmVsWTtcclxuICAgICAgICB0aGlzLmRhbWFnZSA9IGRhbWFnZTtcclxuICAgICAgICB0aGlzLmlzUGxheWVyQnVsbGV0ID0gaXNQbGF5ZXJCdWxsZXQ7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBjb25maWc6IEdhbWVEYXRhKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZ2FtZVNwZWVkID0gY29uZmlnLmdhbWVTZXR0aW5ncy5nYW1lU3BlZWRNdWx0aXBsaWVyO1xyXG4gICAgICAgIHRoaXMueCArPSB0aGlzLnZlbFggKiBnYW1lU3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMudmVsWSAqIGdhbWVTcGVlZCAqIGRlbHRhVGltZTtcclxuXHJcbiAgICAgICAgLy8gTWFyayBhcyBkZWFkIGlmIG9mZi1zY3JlZW4gKGNvbnNpZGVyIFgtYXhpcyB0b28gZm9yIGFpbWVkIGJ1bGxldHMpXHJcbiAgICAgICAgaWYgKHRoaXMueSArIHRoaXMuaGVpZ2h0IDwgMCB8fCB0aGlzLnkgPiBjb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodCB8fFxyXG4gICAgICAgICAgICB0aGlzLnggKyB0aGlzLndpZHRoIDwgMCB8fCB0aGlzLnggPiBjb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNBbGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRW5lbXkgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIHNjb3JlVmFsdWU6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7IC8vIG1pbGxpc2Vjb25kcyBiZXR3ZWVuIHNob3RzXHJcbiAgICBidWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgYnVsbGV0RGFtYWdlOiBudW1iZXI7XHJcbiAgICBmaXJlQ29vbGRvd246IG51bWJlcjsgLy8gY3VycmVudCBjb29sZG93biBpbiBtaWxsaXNlY29uZHNcclxuICAgIGVuZW15Q29uZmlnOiBFbmVteUNvbmZpZzsgLy8gU3RvcmUgb3JpZ2luYWwgY29uZmlnIGZvciBidWxsZXQgcHJvcGVydGllc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCBjb25maWc6IEVuZW15Q29uZmlnLCBnYW1lRGF0YTogR2FtZURhdGEpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCBjb25maWcud2lkdGgsIGNvbmZpZy5oZWlnaHQsIGNvbmZpZy5hc3NldCk7XHJcbiAgICAgICAgdGhpcy5lbmVteUNvbmZpZyA9IGNvbmZpZzsgLy8gS2VlcCBhIHJlZmVyZW5jZVxyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gY29uZmlnLmhlYWx0aDtcclxuICAgICAgICB0aGlzLnNwZWVkID0gY29uZmlnLnNwZWVkO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZSA9IGNvbmZpZy5zY29yZTtcclxuICAgICAgICB0aGlzLmZpcmVSYXRlID0gY29uZmlnLmZpcmVSYXRlO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0U3BlZWQgPSBjb25maWcuYnVsbGV0U3BlZWQ7XHJcbiAgICAgICAgdGhpcy5idWxsZXREYW1hZ2UgPSBjb25maWcuYnVsbGV0RGFtYWdlO1xyXG4gICAgICAgIHRoaXMuZmlyZUNvb2xkb3duID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5maXJlUmF0ZSk7IC8vIFJhbmRvbSBpbml0aWFsIGNvb2xkb3duXHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBjb25maWc6IEdhbWVEYXRhKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy55ICs9IHRoaXMuc3BlZWQgKiBjb25maWcuZ2FtZVNldHRpbmdzLmdhbWVTcGVlZE11bHRpcGxpZXIgKiBkZWx0YVRpbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmZpcmVDb29sZG93biA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5maXJlQ29vbGRvd24gLT0gKGRlbHRhVGltZSAqIDEwMDApOyAvLyBEZWNyZW1lbnQgaW4gbWlsbGlzZWNvbmRzXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNYXJrIGFzIGRlYWQgaWYgb2ZmLXNjcmVlblxyXG4gICAgICAgIGlmICh0aGlzLnkgPiBjb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodCkge1xyXG4gICAgICAgICAgICB0aGlzLmlzQWxpdmUgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCBhc3NldHM6IEdhbWVBc3NldHMpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBpbWcgPSBhc3NldHMuaW1hZ2VzW3RoaXMuYXNzZXROYW1lXTtcclxuICAgICAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgICAgIGN0eC5zYXZlKCk7IC8vIFNhdmUgdGhlIGN1cnJlbnQgc3RhdGVcclxuICAgICAgICAgICAgLy8gTW92ZSBvcmlnaW4gdG8gdGhlIGNlbnRlciBvZiB0aGUgZW5lbXlcclxuICAgICAgICAgICAgY3R4LnRyYW5zbGF0ZSh0aGlzLnggKyB0aGlzLndpZHRoIC8gMiwgdGhpcy55ICsgdGhpcy5oZWlnaHQgLyAyKTtcclxuICAgICAgICAgICAgLy8gUm90YXRlIDE4MCBkZWdyZWVzIChNYXRoLlBJIHJhZGlhbnMpIHRvIGZhY2UgZG93bndhcmRzXHJcbiAgICAgICAgICAgIGN0eC5yb3RhdGUoTWF0aC5QSSk7XHJcbiAgICAgICAgICAgIC8vIERyYXcgaW1hZ2UsIGFkanVzdGluZyBpdHMgcG9zaXRpb24gYmVjYXVzZSB0aGUgb3JpZ2luIGlzIG5vdyB0aGUgY2VudGVyXHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCAtdGhpcy53aWR0aCAvIDIsIC10aGlzLmhlaWdodCAvIDIsIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgY3R4LnJlc3RvcmUoKTsgLy8gUmVzdG9yZSB0aGUgb3JpZ2luYWwgc3RhdGVcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBzdXBlci5yZW5kZXIoY3R4LCBhc3NldHMpOyAvLyBGYWxsYmFjayB0byBiYXNpYyBvYmplY3QgcmVuZGVyaW5nXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNob290KGFzc2V0czogR2FtZUFzc2V0cywgZ2FtZTogR2FtZSwgdGFyZ2V0WDogbnVtYmVyLCB0YXJnZXRZOiBudW1iZXIpOiBCdWxsZXQgfCBudWxsIHtcclxuICAgICAgICBpZiAodGhpcy5maXJlUmF0ZSA+IDAgJiYgdGhpcy5maXJlQ29vbGRvd24gPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmZpcmVDb29sZG93biA9IHRoaXMuZmlyZVJhdGU7XHJcbiAgICAgICAgICAgIGdhbWUucGxheVNGWChcImVuZW15X3Nob290XCIpO1xyXG4gICAgICAgICAgICBjb25zdCBidWxsZXRDb25maWcgPSBnYW1lLmRhdGEhLmJ1bGxldHMuZW5lbXk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBidWxsZXRTdGFydFggPSB0aGlzLnggKyB0aGlzLndpZHRoIC8gMiAtIGJ1bGxldENvbmZpZy53aWR0aCAvIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldFN0YXJ0WSA9IHRoaXMueSArIHRoaXMuaGVpZ2h0OyAvLyBCdWxsZXQgc3RhcnRzIGF0IGJvdHRvbSBvZiBlbmVteVxyXG5cclxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGRpcmVjdGlvbiB2ZWN0b3IgZnJvbSBidWxsZXQgc3RhcnQgdG8gdGFyZ2V0XHJcbiAgICAgICAgICAgIGNvbnN0IGRlbHRhWCA9IHRhcmdldFggLSBidWxsZXRTdGFydFg7XHJcbiAgICAgICAgICAgIGNvbnN0IGRlbHRhWSA9IHRhcmdldFkgLSBidWxsZXRTdGFydFk7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5zcXJ0KGRlbHRhWCAqIGRlbHRhWCArIGRlbHRhWSAqIGRlbHRhWSk7XHJcblxyXG4gICAgICAgICAgICBsZXQgdmVsWCA9IDA7XHJcbiAgICAgICAgICAgIGxldCB2ZWxZID0gdGhpcy5idWxsZXRTcGVlZDsgLy8gRGVmYXVsdDogc3RyYWlnaHQgZG93biBpZiB0YXJnZXQgaXMgc2FtZSBzcG90IG9yIHZlcnkgY2xvc2VcclxuXHJcbiAgICAgICAgICAgIGlmIChkaXN0YW5jZSA+IDAuMDEpIHsgLy8gQXZvaWQgZGl2aXNpb24gYnkgemVybyBvciB2ZXJ5IHNtYWxsIG51bWJlcnNcclxuICAgICAgICAgICAgICAgIHZlbFggPSAoZGVsdGFYIC8gZGlzdGFuY2UpICogdGhpcy5idWxsZXRTcGVlZDtcclxuICAgICAgICAgICAgICAgIHZlbFkgPSAoZGVsdGFZIC8gZGlzdGFuY2UpICogdGhpcy5idWxsZXRTcGVlZDtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIElmIHRhcmdldCBpcyB0b28gY2xvc2Ugb3Igc2FtZSBhcyBidWxsZXQgc3RhcnQsIGp1c3QgZmlyZSBzdHJhaWdodCBkb3duXHJcbiAgICAgICAgICAgICAgICB2ZWxYID0gMDtcclxuICAgICAgICAgICAgICAgIHZlbFkgPSB0aGlzLmJ1bGxldFNwZWVkO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gbmV3IEJ1bGxldChcclxuICAgICAgICAgICAgICAgIGJ1bGxldFN0YXJ0WCxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFN0YXJ0WSxcclxuICAgICAgICAgICAgICAgIGJ1bGxldENvbmZpZy53aWR0aCxcclxuICAgICAgICAgICAgICAgIGJ1bGxldENvbmZpZy5oZWlnaHQsXHJcbiAgICAgICAgICAgICAgICBidWxsZXRDb25maWcuYXNzZXQsXHJcbiAgICAgICAgICAgICAgICB2ZWxYLFxyXG4gICAgICAgICAgICAgICAgdmVsWSxcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0RGFtYWdlLFxyXG4gICAgICAgICAgICAgICAgZmFsc2UgLy8gaXNQbGF5ZXJCdWxsZXRcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShkYW1hZ2U6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoIC09IGRhbWFnZTtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmlzQWxpdmUgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEV4cGxvc2lvbiBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgY3VycmVudEZyYW1lOiBudW1iZXI7XHJcbiAgICBtYXhGcmFtZXM6IG51bWJlcjtcclxuICAgIGZyYW1lV2lkdGg6IG51bWJlcjsgLy8gV2lkdGggb2YgYSBzaW5nbGUgZnJhbWUgaW4gdGhlIHNwcml0ZXNoZWV0IGFzc2V0XHJcbiAgICBmcmFtZUhlaWdodDogbnVtYmVyOyAvLyBIZWlnaHQgb2YgYSBzaW5nbGUgZnJhbWUgaW4gdGhlIHNwcml0ZXNoZWV0IGFzc2V0XHJcbiAgICBmcmFtZUR1cmF0aW9uOiBudW1iZXI7IC8vIG1pbGxpc2Vjb25kcyBwZXIgZnJhbWVcclxuICAgIGVsYXBzZWRUaW1lOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBhc3NldE5hbWU6IHN0cmluZywgdG90YWxGcmFtZXM6IG51bWJlciwgZnJhbWVEdXJhdGlvbk1zOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBhc3NldE5hbWUpO1xyXG4gICAgICAgIHRoaXMuY3VycmVudEZyYW1lID0gMDtcclxuICAgICAgICB0aGlzLm1heEZyYW1lcyA9IHRvdGFsRnJhbWVzO1xyXG4gICAgICAgIHRoaXMuZnJhbWVEdXJhdGlvbiA9IGZyYW1lRHVyYXRpb25NcztcclxuICAgICAgICB0aGlzLmVsYXBzZWRUaW1lID0gMDtcclxuICAgICAgICB0aGlzLmlzQWxpdmUgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBHZXQgYWN0dWFsIGRpbWVuc2lvbnMgb2YgYSBzaW5nbGUgZnJhbWUgZnJvbSBhc3NldCBkYXRhXHJcbiAgICAgICAgY29uc3QgYXNzZXRJbWFnZUluZm8gPSBnYW1lLmRhdGEhLmFzc2V0cy5pbWFnZXMuZmluZChpbWcgPT4gaW1nLm5hbWUgPT09IGFzc2V0TmFtZSk7XHJcbiAgICAgICAgaWYgKGFzc2V0SW1hZ2VJbmZvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZnJhbWVXaWR0aCA9IGFzc2V0SW1hZ2VJbmZvLndpZHRoOyAvLyBBc3NldCB3aWR0aCBpbiBkYXRhLmpzb24gaXMgYWxyZWFkeSBmcmFtZSB3aWR0aFxyXG4gICAgICAgICAgICB0aGlzLmZyYW1lSGVpZ2h0ID0gYXNzZXRJbWFnZUluZm8uaGVpZ2h0OyAvLyBBc3NldCBoZWlnaHQgaW4gZGF0YS5qc29uIGlzIGFscmVhZHkgZnJhbWUgaGVpZ2h0XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gRmFsbGJhY2sgaWYgYXNzZXQgaW5mbyBpcyBtaXNzaW5nXHJcbiAgICAgICAgICAgIHRoaXMuZnJhbWVXaWR0aCA9IHdpZHRoO1xyXG4gICAgICAgICAgICB0aGlzLmZyYW1lSGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmVsYXBzZWRUaW1lICs9IChkZWx0YVRpbWUgKiAxMDAwKTsgLy8gQWNjdW11bGF0ZSB0aW1lIGluIG1pbGxpc2Vjb25kc1xyXG4gICAgICAgIGlmICh0aGlzLmVsYXBzZWRUaW1lID49IHRoaXMuZnJhbWVEdXJhdGlvbikge1xyXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnRGcmFtZSsrO1xyXG4gICAgICAgICAgICB0aGlzLmVsYXBzZWRUaW1lID0gMDsgLy8gUmVzZXQgZm9yIHRoZSBuZXh0IGZyYW1lXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5jdXJyZW50RnJhbWUgPj0gdGhpcy5tYXhGcmFtZXMpIHtcclxuICAgICAgICAgICAgdGhpcy5pc0FsaXZlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgYXNzZXRzOiBHYW1lQXNzZXRzKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzQWxpdmUpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgaW1nID0gYXNzZXRzLmltYWdlc1t0aGlzLmFzc2V0TmFtZV07XHJcbiAgICAgICAgaWYgKGltZykge1xyXG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgc291cmNlIHgsIHksIHdpZHRoLCBoZWlnaHQgZnJvbSBzcHJpdGVzaGVldFxyXG4gICAgICAgICAgICBjb25zdCBzeCA9IHRoaXMuY3VycmVudEZyYW1lICogdGhpcy5mcmFtZVdpZHRoO1xyXG4gICAgICAgICAgICBjb25zdCBzeSA9IDA7IC8vIEFzc3VtaW5nIGhvcml6b250YWwgc3ByaXRlIHNoZWV0XHJcblxyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgc3gsIHN5LCB0aGlzLmZyYW1lV2lkdGgsIHRoaXMuZnJhbWVIZWlnaHQsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgc3VwZXIucmVuZGVyKGN0eCwgYXNzZXRzKTsgLy8gRmFsbGJhY2sgdG8gYmFzaWMgb2JqZWN0IHJlbmRlcmluZ1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQmFja2dyb3VuZCB7XHJcbiAgICBhc3NldE5hbWU6IHN0cmluZztcclxuICAgIHNjcm9sbFNwZWVkOiBudW1iZXI7XHJcbiAgICBhc3NldFdpZHRoOiBudW1iZXI7IC8vIE9yaWdpbmFsIGFzc2V0IHdpZHRoXHJcbiAgICBhc3NldEhlaWdodDogbnVtYmVyOyAvLyBPcmlnaW5hbCBhc3NldCBoZWlnaHRcclxuICAgIHlPZmZzZXQ6IG51bWJlcjtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihjb25maWc6IEdhbWVEYXRhKSB7XHJcbiAgICAgICAgY29uc3QgYmdDb25maWcgPSBjb25maWcuYmFja2dyb3VuZDtcclxuICAgICAgICB0aGlzLmFzc2V0TmFtZSA9IGJnQ29uZmlnLmFzc2V0O1xyXG4gICAgICAgIHRoaXMuc2Nyb2xsU3BlZWQgPSBiZ0NvbmZpZy5zY3JvbGxTcGVlZDtcclxuICAgICAgICB0aGlzLmFzc2V0V2lkdGggPSBiZ0NvbmZpZy53aWR0aDtcclxuICAgICAgICB0aGlzLmFzc2V0SGVpZ2h0ID0gYmdDb25maWcuaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMueU9mZnNldCA9IDA7XHJcbiAgICAgICAgdGhpcy5jYW52YXNXaWR0aCA9IGNvbmZpZy5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXNIZWlnaHQgPSBjb25maWcuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIGdhbWVTcGVlZE11bHRpcGxpZXI6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIC8vIFNjcm9sbCBzcGVlZCBpbiBwaXhlbHMgcGVyIHNlY29uZCwgY29udmVydGVkIHRvIHBpeGVscyBwZXIgZnJhbWVcclxuICAgICAgICB0aGlzLnlPZmZzZXQgPSAodGhpcy55T2Zmc2V0ICsgdGhpcy5zY3JvbGxTcGVlZCAqIGdhbWVTcGVlZE11bHRpcGxpZXIgKiBkZWx0YVRpbWUpICUgdGhpcy5hc3NldEhlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGFzc2V0czogR2FtZUFzc2V0cyk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGltZyA9IGFzc2V0cy5pbWFnZXNbdGhpcy5hc3NldE5hbWVdO1xyXG4gICAgICAgIGlmIChpbWcpIHtcclxuICAgICAgICAgICAgLy8gRHJhdyBmaXJzdCBpbnN0YW5jZVxyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltZywgMCwgdGhpcy55T2Zmc2V0LCB0aGlzLmNhbnZhc1dpZHRoLCB0aGlzLmFzc2V0SGVpZ2h0LCAwLCB0aGlzLnlPZmZzZXQsIHRoaXMuY2FudmFzV2lkdGgsIHRoaXMuYXNzZXRIZWlnaHQpO1xyXG4gICAgICAgICAgICAvLyBEcmF3IHNlY29uZCBpbnN0YW5jZSBhYm92ZSB0aGUgZmlyc3QgdG8gY3JlYXRlIGNvbnRpbnVvdXMgc2Nyb2xsXHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCAwLCB0aGlzLnlPZmZzZXQgLSB0aGlzLmFzc2V0SGVpZ2h0LCB0aGlzLmNhbnZhc1dpZHRoLCB0aGlzLmFzc2V0SGVpZ2h0LCAwLCB0aGlzLnlPZmZzZXQgLSB0aGlzLmFzc2V0SGVpZ2h0LCB0aGlzLmNhbnZhc1dpZHRoLCB0aGlzLmFzc2V0SGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYEJhY2tncm91bmQgYXNzZXQgbm90IGZvdW5kOiAke3RoaXMuYXNzZXROYW1lfWApO1xyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ2JsdWUnOyAvLyBGYWxsYmFjayBjb2xvclxyXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXNXaWR0aCwgdGhpcy5jYW52YXNIZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBkYXRhOiBHYW1lRGF0YSB8IG51bGwgPSBudWxsO1xyXG4gICAgYXNzZXRzOiBHYW1lQXNzZXRzIHwgbnVsbCA9IG51bGw7XHJcbiAgICBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgbGFzdEZyYW1lVGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcbiAgICBrZXlzUHJlc3NlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBhbmltYXRpb25GcmFtZUlkOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHBsYXllcjogUGxheWVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwbGF5ZXJCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZW5lbWllczogRW5lbXlbXSA9IFtdO1xyXG4gICAgZW5lbXlCdWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgZXhwbG9zaW9uczogRXhwbG9zaW9uW10gPSBbXTtcclxuICAgIGJhY2tncm91bmQ6IEJhY2tncm91bmQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIGxhc3RFbmVteVNwYXduVGltZTogbnVtYmVyID0gMDtcclxuICAgIGJnbVBsYXlpbmc6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIGF1ZGlvQ29udGV4dDogQXVkaW9Db250ZXh0O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIHdpdGggSUQgXCIke2NhbnZhc0lkfVwiIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyAod2luZG93LkF1ZGlvQ29udGV4dCB8fCAod2luZG93IGFzIGFueSkud2Via2l0QXVkaW9Db250ZXh0KSgpO1xyXG5cclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXJzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhZGRFdmVudExpc3RlbmVycygpOiB2b2lkIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMua2V5c1ByZXNzZWQuYWRkKGUuY29kZSk7XHJcbiAgICAgICAgICAgIC8vIFByZXZlbnQgZGVmYXVsdCBzY3JvbGwgYmVoYXZpb3IgZm9yIGFycm93IGtleXMgYW5kIHNwYWNlXHJcbiAgICAgICAgICAgIGlmIChbJ0Fycm93VXAnLCAnQXJyb3dEb3duJywgJ0Fycm93TGVmdCcsICdBcnJvd1JpZ2h0JywgJ1NwYWNlJywgJ0VudGVyJ10uaW5jbHVkZXMoZS5jb2RlKSkge1xyXG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlSW5wdXQoZSk7IC8vIEZvciBzdGF0ZSB0cmFuc2l0aW9ucyBhbmQgc2hvb3RpbmdcclxuICAgICAgICB9KTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLmtleXNQcmVzc2VkLmRlbGV0ZShlLmNvZGUpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgdG91Y2gvY2xpY2sgdG8gc3RhcnQgYXVkaW8gY29udGV4dCBvbiBtb2JpbGVcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSAnc3VzcGVuZGVkJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb0NvbnRleHQucmVzdW1lKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LCB7IG9uY2U6IHRydWUgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVJbnB1dChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGlmIChldmVudC5jb2RlID09PSAnRW50ZXInKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuQ09OVFJPTFM7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLkNPTlRST0xTKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFBsYXllciBzaG9vdGluZyBvbiBTUEFDRUJBUiBwcmVzcyAobm90IGhvbGQsIGR1ZSB0byBob3cgZmlyZUNvb2xkb3duIHdvcmtzKVxyXG4gICAgICAgIGlmIChldmVudC5jb2RlID09PSAnU3BhY2UnICYmIHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMucGxheWVyPy5pc0FsaXZlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5ld0J1bGxldCA9IHRoaXMucGxheWVyLnNob290KHRoaXMuYXNzZXRzISwgdGhpcyk7XHJcbiAgICAgICAgICAgIGlmIChuZXdCdWxsZXQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5wdXNoKG5ld0J1bGxldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgaW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkluaXRpYWxpemluZyBnYW1lLi4uXCIpO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHRoaXMuZGF0YSA9IGF3YWl0IHRoaXMubG9hZERhdGEoKTtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuICAgICAgICAgICAgdGhpcy5jdHguaW1hZ2VTbW9vdGhpbmdFbmFibGVkID0gZmFsc2U7IC8vIEZvciBwaXhlbCBhcnQgZmVlbFxyXG5cclxuICAgICAgICAgICAgY29uc3QgYXNzZXRMb2FkZXIgPSBuZXcgQXNzZXRMb2FkZXIodGhpcy5kYXRhKTtcclxuICAgICAgICAgICAgdGhpcy5hc3NldHMgPSBhd2FpdCBhc3NldExvYWRlci5sb2FkKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQXNzZXRzIGxvYWRlZDpcIiwgdGhpcy5hc3NldHMpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kID0gbmV3IEJhY2tncm91bmQodGhpcy5kYXRhKTtcclxuICAgICAgICAgICAgdGhpcy5yZXNldEdhbWUoKTsgLy8gSW5pdGlhbGl6ZSBnYW1lIG9iamVjdHNcclxuXHJcbiAgICAgICAgICAgIHRoaXMuYW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wLmJpbmQodGhpcykpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkdhbWUgaW5pdGlhbGl6ZWQuIEN1cnJlbnQgc3RhdGU6IFRJVExFXCIpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJHYW1lIGluaXRpYWxpemF0aW9uIGZhaWxlZDpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBEaXNwbGF5IGVycm9yIG9uIGNhbnZhcyBpZiBwb3NzaWJsZVxyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAncmVkJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyMHB4IEFyaWFsJztcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJGYWlsZWQgdG8gbG9hZCBnYW1lLiBDaGVjayBjb25zb2xlLlwiLCAxMCwgNTApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWREYXRhKCk6IFByb21pc2U8R2FtZURhdGE+IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGZldGNoIGRhdGEuanNvbjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfVxyXG5cclxuICAgIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSB8fCAhdGhpcy5hc3NldHMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkdhbWUgZGF0YSBvciBhc3NldHMgbm90IGxvYWRlZC5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIHRoaXMucGxheUJHTSgpO1xyXG4gICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7IC8vIFJlc2V0IHNwYXduIHRpbWVyIGZvciBuZXcgZ2FtZVxyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiR2FtZSBzdGFydGVkLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICByZXNldEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgICAgICB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoIC8gMiAtIHRoaXMuZGF0YS5wbGF5ZXIud2lkdGggLyAyLFxyXG4gICAgICAgICAgICB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodCAtIHRoaXMuZGF0YS5wbGF5ZXIuaGVpZ2h0IC0gMjAsXHJcbiAgICAgICAgICAgIHRoaXMuZGF0YVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvbnMgPSBbXTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmxhc3RFbmVteVNwYXduVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIHRoaXMuYmFja2dyb3VuZCA9IG5ldyBCYWNrZ3JvdW5kKHRoaXMuZGF0YSk7IC8vIFJlc2V0IGJhY2tncm91bmQgc2Nyb2xsXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRml4IGZvciBUUzI3Nzk6IEVuc3VyZSB0aGUgYXVkaW8gZWxlbWVudCBleGlzdHMgYmVmb3JlIHRyeWluZyB0byBhc3NpZ24gdG8gY3VycmVudFRpbWVcclxuICAgICAgICBjb25zdCBiZ20gPSB0aGlzLmFzc2V0cz8uc291bmRzW1wiYmdtX3d3MlwiXTtcclxuICAgICAgICBpZiAoYmdtKSB7XHJcbiAgICAgICAgICAgIGJnbS5wYXVzZSgpO1xyXG4gICAgICAgICAgICBiZ20uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmJnbVBsYXlpbmcgPSBmYWxzZTsgLy8gRW5zdXJlIEJHTSByZXN0YXJ0cyBjbGVhbmx5XHJcbiAgICB9XHJcblxyXG4gICAgZ2FtZUxvb3AoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSB8fCAhdGhpcy5hc3NldHMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkdhbWUgbG9vcCBjYWxsZWQgYmVmb3JlIGRhdGEvYXNzZXRzIGxvYWRlZC5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMubGFzdEZyYW1lVGltZSkgLyAxMDAwOyAvLyBEZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLnJlbmRlcigpO1xyXG5cclxuICAgICAgICB0aGlzLmFuaW1hdGlvbkZyYW1lSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcC5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGF0YSkgcmV0dXJuO1xyXG4gICAgICAgIGNvbnN0IGdhbWVTcGVlZCA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuZ2FtZVNwZWVkTXVsdGlwbGllcjtcclxuXHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kPy51cGRhdGUoZGVsdGFUaW1lLCBnYW1lU3BlZWQpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyICYmIHRoaXMucGxheWVyLmlzQWxpdmUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnVwZGF0ZSh0aGlzLmtleXNQcmVzc2VkLCBkZWx0YVRpbWUsIHRoaXMuZGF0YSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5wbGF5ZXIgJiYgIXRoaXMucGxheWVyLmlzQWxpdmUgJiYgdGhpcy5wbGF5ZXIuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U0ZYKFwiZ2FtZV9vdmVyX3NmeFwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzIS5zb3VuZHNbXCJiZ21fd3cyXCJdLnBhdXNlKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVBsYXlpbmcgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gVXBkYXRlIHBsYXllciBidWxsZXRzXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiBidWxsZXQudXBkYXRlKGRlbHRhVGltZSwgdGhpcy5kYXRhISkpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMgPSB0aGlzLnBsYXllckJ1bGxldHMuZmlsdGVyKGJ1bGxldCA9PiBidWxsZXQuaXNBbGl2ZSk7XHJcblxyXG4gICAgICAgICAgICAvLyBTcGF3biBlbmVtaWVzXHJcbiAgICAgICAgICAgIGNvbnN0IG5vdyA9IHBlcmZvcm1hbmNlLm5vdygpOyAvLyBDdXJyZW50IHRpbWUgaW4gbXNcclxuICAgICAgICAgICAgaWYgKHRoaXMuZW5lbWllcy5sZW5ndGggPCB0aGlzLmRhdGEuc3Bhd25lci5tYXhFbmVtaWVzT25TY3JlZW4gJiZcclxuICAgICAgICAgICAgICAgIG5vdyAtIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID4gdGhpcy5kYXRhLnNwYXduZXIuZW5lbXlTcGF3bkludGVydmFsTXMpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVuZW15Q29uZmlnID0gdGhpcy5kYXRhLmVuZW1pZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5kYXRhLmVuZW1pZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgICAgICBjb25zdCB4ID0gTWF0aC5yYW5kb20oKSAqICh0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc1dpZHRoIC0gZW5lbXlDb25maWcud2lkdGgpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeSA9IC1lbmVteUNvbmZpZy5oZWlnaHQ7IC8vIFNwYXduIHNsaWdodGx5IGFib3ZlIHNjcmVlblxyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmVtaWVzLnB1c2gobmV3IEVuZW15KHgsIHksIGVuZW15Q29uZmlnLCB0aGlzLmRhdGEpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gbm93O1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgZW5lbWllcyBhbmQgaGFuZGxlIGVuZW15IHNob290aW5nXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgICAgIGVuZW15LnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMuZGF0YSEpO1xyXG4gICAgICAgICAgICAgICAgLy8gT25seSBhdHRlbXB0IHRvIHNob290IGlmIGVuZW15IGlzIGFsaXZlLCBjYW4gc2hvb3QsIGFuZCBwbGF5ZXIgZXhpc3RzL2lzIGFsaXZlXHJcbiAgICAgICAgICAgICAgICBpZiAoZW5lbXkuaXNBbGl2ZSAmJiBlbmVteS5maXJlUmF0ZSA+IDAgJiYgdGhpcy5wbGF5ZXIgJiYgdGhpcy5wbGF5ZXIuaXNBbGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFBhc3MgcGxheWVyJ3MgY2VudGVyIGNvb3JkaW5hdGVzIGFzIHRhcmdldCBmb3IgZW5lbXkgYWltaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbmV3QnVsbGV0ID0gZW5lbXkuc2hvb3QodGhpcy5hc3NldHMhLCB0aGlzLCB0aGlzLnBsYXllci54ICsgdGhpcy5wbGF5ZXIud2lkdGggLyAyLCB0aGlzLnBsYXllci55ICsgdGhpcy5wbGF5ZXIuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5ld0J1bGxldCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5wdXNoKG5ld0J1bGxldCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzID0gdGhpcy5lbmVtaWVzLmZpbHRlcihlbmVteSA9PiBlbmVteS5pc0FsaXZlKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBlbmVteSBidWxsZXRzXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IGJ1bGxldC51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmRhdGEhKSk7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzID0gdGhpcy5lbmVteUJ1bGxldHMuZmlsdGVyKGJ1bGxldCA9PiBidWxsZXQuaXNBbGl2ZSk7XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgZXhwbG9zaW9uc1xyXG4gICAgICAgICAgICB0aGlzLmV4cGxvc2lvbnMuZm9yRWFjaChleHAgPT4gZXhwLnVwZGF0ZShkZWx0YVRpbWUpKTtcclxuICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zID0gdGhpcy5leHBsb3Npb25zLmZpbHRlcihleHAgPT4gZXhwLmlzQWxpdmUpO1xyXG5cclxuICAgICAgICAgICAgLy8gLS0tIENvbGxpc2lvbiBEZXRlY3Rpb24gLS0tXHJcbiAgICAgICAgICAgIC8vIFBsYXllciBidWxsZXRzIHZzLiBFbmVtaWVzXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQnVsbGV0cy5mb3JFYWNoKHBCdWxsZXQgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFwQnVsbGV0LmlzQWxpdmUpIHJldHVybjtcclxuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVuZW15LmlzQWxpdmUgJiYgY2hlY2tDb2xsaXNpb24ocEJ1bGxldCwgZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15LnRha2VEYW1hZ2UocEJ1bGxldC5kYW1hZ2UpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwQnVsbGV0LmlzQWxpdmUgPSBmYWxzZTsgLy8gQnVsbGV0IGlzIGRlc3Ryb3llZCBvbiBpbXBhY3RcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFlbmVteS5pc0FsaXZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IGVuZW15LnNjb3JlVmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTRlgoXCJleHBsb3Npb25fc2Z4XCIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQWRkIGV4cGxvc2lvblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwbG9zaW9uQ29uZmlnID0gdGhpcy5kYXRhIS5hc3NldHMuaW1hZ2VzLmZpbmQoaW1nID0+IGltZy5uYW1lID09PSBcImV4cGxvc2lvblwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChleHBsb3Npb25Db25maWcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmV4cGxvc2lvbnMucHVzaChuZXcgRXhwbG9zaW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmVteS54ICsgZW5lbXkud2lkdGggLyAyIC0gZXhwbG9zaW9uQ29uZmlnLndpZHRoLCAvLyBDZW50ZXIgZXhwbG9zaW9uXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15LnkgKyBlbmVteS5oZWlnaHQgLyAyIC0gZXhwbG9zaW9uQ29uZmlnLmhlaWdodCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwbG9zaW9uQ29uZmlnLndpZHRoICogMiwgLy8gTWFrZSBleHBsb3Npb24gbGFyZ2VyIHRoYW4gZnJhbWUgc2l6ZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBsb3Npb25Db25maWcuaGVpZ2h0ICogMixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJleHBsb3Npb25cIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwbG9zaW9uQ29uZmlnLmZyYW1lcyEsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDUwIC8vIDUwbXMgcGVyIGZyYW1lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBFbmVteSBidWxsZXRzIHZzLiBQbGF5ZXJcclxuICAgICAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMuZm9yRWFjaChlQnVsbGV0ID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICghZUJ1bGxldC5pc0FsaXZlIHx8ICF0aGlzLnBsYXllcj8uaXNBbGl2ZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjaGVja0NvbGxpc2lvbihlQnVsbGV0LCB0aGlzLnBsYXllcikpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci50YWtlRGFtYWdlKGVCdWxsZXQuZGFtYWdlKTtcclxuICAgICAgICAgICAgICAgICAgICBlQnVsbGV0LmlzQWxpdmUgPSBmYWxzZTsgLy8gQnVsbGV0IGlzIGRlc3Ryb3llZCBvbiBpbXBhY3RcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRoaXMucGxheWVyLmlzQWxpdmUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gR2FtZSBvdmVyIHdpbGwgYmUgdHJpZ2dlcmVkIGluIHRoZSBuZXh0IHVwZGF0ZSBjeWNsZSBkdWUgdG8gcGxheWVyLmlzQWxpdmUgY2hlY2tcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5U0ZYKFwiZXhwbG9zaW9uX3NmeFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwbG9zaW9uQ29uZmlnID0gdGhpcy5kYXRhIS5hc3NldHMuaW1hZ2VzLmZpbmQoaW1nID0+IGltZy5uYW1lID09PSBcImV4cGxvc2lvblwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV4cGxvc2lvbkNvbmZpZykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5leHBsb3Npb25zLnB1c2gobmV3IEV4cGxvc2lvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci54ICsgdGhpcy5wbGF5ZXIud2lkdGggLyAyIC0gZXhwbG9zaW9uQ29uZmlnLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnkgKyB0aGlzLnBsYXllci5oZWlnaHQgLyAyIC0gZXhwbG9zaW9uQ29uZmlnLmhlaWdodCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBsb3Npb25Db25maWcud2lkdGggKiAyLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGxvc2lvbkNvbmZpZy5oZWlnaHQgKiAyLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZXhwbG9zaW9uXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwbG9zaW9uQ29uZmlnLmZyYW1lcyEsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgNTBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIFBsYXllciB2cy4gRW5lbWllcyAoY29sbGlzaW9uIGRhbWFnZSlcclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyPy5pc0FsaXZlICYmIGVuZW15LmlzQWxpdmUgJiYgY2hlY2tDb2xsaXNpb24odGhpcy5wbGF5ZXIsIGVuZW15KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnRha2VEYW1hZ2UoMjApOyAvLyBEaXJlY3QgY29sbGlzaW9uIGRhbWFnZVxyXG4gICAgICAgICAgICAgICAgICAgIGVuZW15LnRha2VEYW1hZ2UoZW5lbXkuaGVhbHRoKTsgLy8gRW5lbXkgaXMgaW5zdGFudGx5IGRlc3Ryb3llZFxyXG4gICAgICAgICAgICAgICAgICAgIGVuZW15LmlzQWxpdmUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTRlgoXCJleHBsb3Npb25fc2Z4XCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIEFkZCBleHBsb3Npb24gZm9yIGVuZW15XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhwbG9zaW9uQ29uZmlnID0gdGhpcy5kYXRhIS5hc3NldHMuaW1hZ2VzLmZpbmQoaW1nID0+IGltZy5uYW1lID09PSBcImV4cGxvc2lvblwiKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZXhwbG9zaW9uQ29uZmlnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZXhwbG9zaW9ucy5wdXNoKG5ldyBFeHBsb3Npb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbmVteS54ICsgZW5lbXkud2lkdGggLyAyIC0gZXhwbG9zaW9uQ29uZmlnLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZW5lbXkueSArIGVuZW15LmhlaWdodCAvIDIgLSBleHBsb3Npb25Db25maWcuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwbG9zaW9uQ29uZmlnLndpZHRoICogMixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGxvc2lvbkNvbmZpZy5oZWlnaHQgKiAyLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJleHBsb3Npb25cIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGxvc2lvbkNvbmZpZy5mcmFtZXMhLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgNTBcclxuICAgICAgICAgICAgICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5wbGF5ZXIuaXNBbGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBQbGF5ZXIgZXhwbG9zaW9uIHdpbGwgYmUgaGFuZGxlZCBieSB0aGUgcGxheWVyLmlzQWxpdmUgY2hlY2sgYXQgdGhlIGJlZ2lubmluZyBvZiB1cGRhdGUoKVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRhdGEgfHwgIXRoaXMuYXNzZXRzKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFJlbmRlciBiYWNrZ3JvdW5kIGZpcnN0XHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kPy5yZW5kZXIodGhpcy5jdHgsIHRoaXMuYXNzZXRzKTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgJ3doaXRlJywgNDgsICdjZW50ZXInKTtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLnRpdGxlU2NyZWVuUHJvbXB0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCwgJ3doaXRlJywgMjQsICdjZW50ZXInKTtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5DT05UUk9MUykge1xyXG4gICAgICAgICAgICBjb25zdCBsaW5lcyA9IHRoaXMuZGF0YS5nYW1lU2V0dGluZ3MuY29udHJvbHNTY3JlZW5UZXh0LnNwbGl0KCdcXG4nKTtcclxuICAgICAgICAgICAgbGV0IHlQb3MgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gKGxpbmVzLmxlbmd0aCAvIDIpICogMzA7IC8vIEFkanVzdCBzdGFydGluZyBZIGZvciBtdWx0aWxpbmVcclxuICAgICAgICAgICAgbGluZXMuZm9yRWFjaChsaW5lID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RleHQobGluZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5UG9zLCAnd2hpdGUnLCAyNCwgJ2NlbnRlcicpO1xyXG4gICAgICAgICAgICAgICAgeVBvcyArPSAzMDtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd1RleHQoXCJFTlRFUiBcdUQwQTRcdUI5N0MgXHVCMjBDXHVCN0VDIFx1QUM4Q1x1Qzc4NCBcdUMyRENcdUM3OTFcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5UG9zICsgNTAsICd3aGl0ZScsIDI0LCAnY2VudGVyJyk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4gYnVsbGV0LnJlbmRlcih0aGlzLmN0eCwgdGhpcy5hc3NldHMhKSk7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IGJ1bGxldC5yZW5kZXIodGhpcy5jdHgsIHRoaXMuYXNzZXRzISkpO1xyXG4gICAgICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiBlbmVteS5yZW5kZXIodGhpcy5jdHgsIHRoaXMuYXNzZXRzISkpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIgJiYgdGhpcy5wbGF5ZXIuaXNBbGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIucmVuZGVyKHRoaXMuY3R4LCB0aGlzLmFzc2V0cyEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuZXhwbG9zaW9ucy5mb3JFYWNoKGV4cCA9PiBleHAucmVuZGVyKHRoaXMuY3R4LCB0aGlzLmFzc2V0cyEpKTtcclxuXHJcbiAgICAgICAgICAgIC8vIERyYXcgVUlcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChgU2NvcmU6ICR7dGhpcy5zY29yZX1gLCAxMCwgMzAsICd3aGl0ZScsIDIwLCAnbGVmdCcpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RleHQoYEhlYWx0aDogJHtNYXRoLm1heCgwLCB0aGlzLnBsYXllci5oZWFsdGgpfWAsIHRoaXMuY2FudmFzLndpZHRoIC0gMTAsIDMwLCAnd2hpdGUnLCAyMCwgJ3JpZ2h0Jyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmdhbWVPdmVyVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNTAsICdyZWQnLCA0OCwgJ2NlbnRlcicpO1xyXG4gICAgICAgICAgICBjb25zdCBwcm9tcHQgPSB0aGlzLmRhdGEuZ2FtZVNldHRpbmdzLmdhbWVPdmVyUHJvbXB0LnJlcGxhY2UoJ3tzY29yZX0nLCB0aGlzLnNjb3JlLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHByb21wdCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjAsICd3aGl0ZScsIDI0LCAnY2VudGVyJyk7XHJcblxyXG4gICAgICAgICAgICAvLyBSZW5kZXIgYW55IHJlbWFpbmluZyBlbnRpdGllcyAoZXhwbG9zaW9ucyB3aWxsIGZhZGUgb3V0KVxyXG4gICAgICAgICAgICB0aGlzLmV4cGxvc2lvbnMuZm9yRWFjaChleHAgPT4gZXhwLnJlbmRlcih0aGlzLmN0eCwgdGhpcy5hc3NldHMhKSk7XHJcblxyXG4gICAgICAgICAgICAgLy8gRHJhdyBmaW5hbCBzY29yZVxyXG4gICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGBTY29yZTogJHt0aGlzLnNjb3JlfWAsIDEwLCAzMCwgJ3doaXRlJywgMjAsICdsZWZ0Jyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXdUZXh0KHRleHQ6IHN0cmluZywgeDogbnVtYmVyLCB5OiBudW1iZXIsIGNvbG9yOiBzdHJpbmcsIHNpemU6IG51bWJlciwgYWxpZ246IENhbnZhc1RleHRBbGlnbik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IGNvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBgJHtzaXplfXB4ICdQcmVzcyBTdGFydCAyUCcsIEFyaWFsLCBzYW5zLXNlcmlmYDsgLy8gQWRkZWQgYSBwaXhlbC1hcnQgZm9udCBzdWdnZXN0aW9uXHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gYWxpZ247XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGV4dCwgeCwgeSk7XHJcbiAgICB9XHJcblxyXG4gICAgcGxheUJHTSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5hc3NldHMgJiYgIXRoaXMuYmdtUGxheWluZykge1xyXG4gICAgICAgICAgICBjb25zdCBiZ20gPSB0aGlzLmFzc2V0cy5zb3VuZHNbXCJiZ21fd3cyXCJdO1xyXG4gICAgICAgICAgICBpZiAoYmdtKSB7XHJcbiAgICAgICAgICAgICAgICBiZ20ubG9vcCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBiZ20ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheWJhY2sgYmxvY2tlZCBvciBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtUGxheWluZyA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcGxheVNGWChhc3NldE5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmFzc2V0cykge1xyXG4gICAgICAgICAgICBjb25zdCBzZnggPSB0aGlzLmFzc2V0cy5zb3VuZHNbYXNzZXROYW1lXTtcclxuICAgICAgICAgICAgaWYgKHNmeCkge1xyXG4gICAgICAgICAgICAgICAgLy8gVG8gYWxsb3cgbXVsdGlwbGUgc291bmRzIHRvIHBsYXkgY29uY3VycmVudGx5LCBjbG9uZSB0aGUgYXVkaW8gZWxlbWVudFxyXG4gICAgICAgICAgICAgICAgY29uc3QgY2xvbmVkU2Z4ID0gc2Z4LmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBjbG9uZWRTZngudm9sdW1lID0gc2Z4LnZvbHVtZTsgLy8gS2VlcCBvcmlnaW5hbCB2b2x1bWVcclxuICAgICAgICAgICAgICAgIGNsb25lZFNmeC5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhgU0ZYICR7YXNzZXROYW1lfSBwbGF5YmFjayBibG9ja2VkIG9yIGZhaWxlZDpgLCBlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEhlbHBlciBmdW5jdGlvbiBmb3IgQUFCQiBjb2xsaXNpb24gZGV0ZWN0aW9uXHJcbmZ1bmN0aW9uIGNoZWNrQ29sbGlzaW9uKG9iajE6IEdhbWVPYmplY3QsIG9iajI6IEdhbWVPYmplY3QpOiBib29sZWFuIHtcclxuICAgIHJldHVybiBvYmoxLnggPCBvYmoyLnggKyBvYmoyLndpZHRoICYmXHJcbiAgICAgICAgICAgb2JqMS54ICsgb2JqMS53aWR0aCA+IG9iajIueCAmJlxyXG4gICAgICAgICAgIG9iajEueSA8IG9iajIueSArIG9iajIuaGVpZ2h0ICYmXHJcbiAgICAgICAgICAgb2JqMS55ICsgb2JqMS5oZWlnaHQgPiBvYmoyLnk7XHJcbn1cclxuXHJcbi8vIEdsb2JhbCBnYW1lIGluc3RhbmNlXHJcbmxldCBnYW1lOiBHYW1lO1xyXG5cclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJyk7XHJcbiAgICBpZiAoY2FudmFzKSB7XHJcbiAgICAgICAgZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICAgICAgZ2FtZS5pbml0KCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJObyBjYW52YXMgZWxlbWVudCB3aXRoIGlkICdnYW1lQ2FudmFzJyBmb3VuZC5cIik7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5pbm5lckhUTUwgPSBcIjxwPkVycm9yOiBHYW1lIGNhbnZhcyBub3QgZm91bmQuIFBsZWFzZSBlbnN1cmUgYW4gZWxlbWVudCBsaWtlICZsdDtjYW52YXMgaWQ9XFxcImdhbWVDYW52YXNcXFwiJmd0OyZsdDsvY2FudmFzJmd0OyBleGlzdHMgaW4geW91ciBIVE1MLjwvcD5cIjtcclxuICAgIH1cclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQTJFQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUpDLFNBQUFBO0FBQUEsR0FBQTtBQU9MLE1BQU0sWUFBWTtBQUFBLEVBS2QsWUFBWSxVQUFvQjtBQUhoQyxTQUFRLGVBQW9ELENBQUM7QUFDN0QsU0FBUSxlQUFvRCxDQUFDO0FBR3pELFNBQUssV0FBVztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxNQUFNLE9BQTRCO0FBQzlCLFVBQU0sZ0JBQWdCLEtBQUssU0FBUyxPQUFPLE9BQU8sSUFBSSxTQUFPLEtBQUssVUFBVSxHQUFHLENBQUM7QUFDaEYsVUFBTSxnQkFBZ0IsS0FBSyxTQUFTLE9BQU8sT0FBTyxJQUFJLFNBQU8sS0FBSyxVQUFVLEdBQUcsQ0FBQztBQUVoRixVQUFNLFFBQVEsSUFBSSxhQUFhO0FBQy9CLFVB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
