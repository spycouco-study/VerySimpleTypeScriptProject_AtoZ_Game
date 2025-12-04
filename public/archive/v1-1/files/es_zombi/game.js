var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class Vector2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}
class GameObject {
  constructor(x, y, width, height, imageName) {
    this.isAlive = true;
    this.position = new Vector2(x, y);
    this.width = width;
    this.height = height;
    this.imageName = imageName;
  }
  draw(ctx, loadedImages) {
    const image = loadedImages[this.imageName];
    if (image && this.isAlive) {
      ctx.drawImage(image, this.position.x - this.width / 2, this.position.y - this.height / 2, this.width, this.height);
    }
  }
  // AABB collision detection, assumes position is center
  collidesWith(other) {
    if (!this.isAlive || !other.isAlive) return false;
    const thisLeft = this.position.x - this.width / 2;
    const thisRight = this.position.x + this.width / 2;
    const thisTop = this.position.y - this.height / 2;
    const thisBottom = this.position.y + this.height / 2;
    const otherLeft = other.position.x - other.width / 2;
    const otherRight = other.position.x + other.width / 2;
    const otherTop = other.position.y - other.height / 2;
    const otherBottom = other.position.y + other.height / 2;
    return thisLeft < otherRight && thisRight > otherLeft && thisTop < otherBottom && thisBottom > otherTop;
  }
  // Check if any part of the object is outside the canvas
  isOffscreen(canvasWidth, canvasHeight) {
    return this.position.x + this.width / 2 < 0 || this.position.x - this.width / 2 > canvasWidth || this.position.y + this.height / 2 < 0 || this.position.y - this.height / 2 > canvasHeight;
  }
}
class Player extends GameObject {
  constructor(x, y, width, height, imageName, speed, health, fireRate) {
    super(x, y, width, height, imageName);
    this.lastShotTime = 0;
    this.movingLeft = false;
    this.movingRight = false;
    this.speed = speed;
    this.health = health;
    this.fireRate = fireRate;
  }
  update(deltaTime, canvasWidth) {
    if (this.movingLeft) {
      this.position.x -= this.speed * deltaTime;
    }
    if (this.movingRight) {
      this.position.x += this.speed * deltaTime;
    }
    this.position.x = Math.max(this.width / 2, Math.min(canvasWidth - this.width / 2, this.position.x));
  }
  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.isAlive = false;
    }
  }
  canShoot(currentTime) {
    return currentTime - this.lastShotTime >= this.fireRate;
  }
}
class Bullet extends GameObject {
  // Normalized direction vector
  constructor(x, y, width, height, imageName, speed, damage, direction) {
    super(x, y, width, height, imageName);
    this.speed = speed;
    this.damage = damage;
    this.direction = direction;
  }
  update(deltaTime) {
    this.position.x += this.direction.x * this.speed * deltaTime;
    this.position.y += this.direction.y * this.speed * deltaTime;
  }
}
class Enemy extends GameObject {
  constructor(x, y, width, height, imageName, speed, health, fireRate) {
    super(x, y, width, height, imageName);
    this.lastShotTime = 0;
    this.speed = speed;
    this.health = health;
    this.fireRate = fireRate;
  }
  update(deltaTime) {
    this.position.y += this.speed * deltaTime;
  }
  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.isAlive = false;
    }
  }
  canShoot(currentTime) {
    return currentTime - this.lastShotTime >= this.fireRate;
  }
}
class Game {
  constructor(canvasId) {
    this.loadedImages = {};
    this.loadedSounds = {};
    this.gameState = 0 /* LOADING */;
    this.lastFrameTime = 0;
    this.playerBullets = [];
    this.enemies = [];
    this.enemyBullets = [];
    this.score = 0;
    this.enemySpawnTimer = 0;
    this.backgroundMusic = null;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    this.handleInput = this.handleInput.bind(this);
    document.addEventListener("keydown", this.handleInput);
    document.addEventListener("keyup", this.handleInput);
    document.addEventListener("click", this.handleInput);
  }
  async init() {
    this.drawLoadingScreen();
    try {
      const response = await fetch("data.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.gameData = await response.json();
      this.canvas.width = this.gameData.canvas.width;
      this.canvas.height = this.gameData.canvas.height;
      await this.loadAssets();
      this.gameState = 1 /* TITLE */;
      this.lastFrameTime = performance.now();
      requestAnimationFrame(this.gameLoop.bind(this));
      if (this.loadedSounds["bgm"]) {
        this.backgroundMusic = this.loadedSounds["bgm"];
        this.backgroundMusic.loop = true;
        this.backgroundMusic.volume = this.gameData.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.5;
      }
    } catch (error) {
      console.error("Failed to load game data or assets:", error);
      this.drawErrorScreen("Error loading game. Check console for details.");
    }
  }
  async loadAssets() {
    const imagePromises = this.gameData.assets.images.map((img) => {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = img.path;
        image.onload = () => {
          this.loadedImages[img.name] = image;
          resolve();
        };
        image.onerror = () => reject(new Error(`Failed to load image: ${img.path}`));
      });
    });
    const soundPromises = this.gameData.assets.sounds.map((snd) => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = snd.path;
        audio.volume = snd.volume;
        audio.oncanplaythrough = () => {
          this.loadedSounds[snd.name] = audio;
          resolve();
        };
        audio.onerror = () => reject(new Error(`Failed to load sound: ${snd.path}`));
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  drawLoadingScreen() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "30px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.gameData?.text.loading || "Loading Game...", this.canvas.width / 2, this.canvas.height / 2);
  }
  drawErrorScreen(message) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "red";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "white";
    this.ctx.font = "30px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
  }
  gameLoop(currentTime) {
    const deltaTime = (currentTime - this.lastFrameTime) / 1e3;
    this.lastFrameTime = currentTime;
    this.update(deltaTime);
    this.draw();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    switch (this.gameState) {
      case 2 /* PLAYING */:
        this.updatePlaying(deltaTime);
        break;
    }
  }
  updatePlaying(deltaTime) {
    this.player.update(deltaTime, this.canvas.width);
    this.playerBullets = this.playerBullets.filter((bullet) => {
      bullet.update(deltaTime);
      return bullet.isAlive && !bullet.isOffscreen(this.canvas.width, this.canvas.height);
    });
    this.enemySpawnTimer -= deltaTime;
    if (this.enemySpawnTimer <= 0) {
      this.spawnEnemy();
      this.enemySpawnTimer = this.gameData.gameplay.enemy.spawnInterval;
    }
    const currentTime = performance.now() / 1e3;
    this.enemies = this.enemies.filter((enemy) => {
      enemy.update(deltaTime);
      if (enemy.isAlive) {
        if (enemy.canShoot(currentTime) && Math.random() < 0.2) {
          enemy.lastShotTime = currentTime;
          const bulletData = this.gameData.gameplay.enemyBullet;
          this.enemyBullets.push(new Bullet(
            enemy.position.x,
            enemy.position.y + enemy.height / 2,
            bulletData.width,
            bulletData.height,
            "enemyBullet",
            bulletData.speed,
            bulletData.damage,
            new Vector2(0, 1)
            // Downwards
          ));
        }
      }
      return enemy.isAlive && !enemy.isOffscreen(this.canvas.width, this.canvas.height);
    });
    this.enemyBullets = this.enemyBullets.filter((bullet) => {
      bullet.update(deltaTime);
      return bullet.isAlive && !bullet.isOffscreen(this.canvas.width, this.canvas.height);
    });
    this.checkCollisions();
    if (!this.player.isAlive) {
      this.gameState = 3 /* GAME_OVER */;
      this.backgroundMusic?.pause();
    }
  }
  checkCollisions() {
    this.playerBullets.forEach((pBullet) => {
      if (!pBullet.isAlive) return;
      this.enemies.forEach((enemy) => {
        if (!enemy.isAlive) return;
        if (pBullet.collidesWith(enemy)) {
          enemy.takeDamage(pBullet.damage);
          pBullet.isAlive = false;
          if (!enemy.isAlive) {
            this.score += 10;
            this.playSound("enemyHit");
          }
        }
      });
    });
    this.enemyBullets.forEach((eBullet) => {
      if (!eBullet.isAlive || !this.player.isAlive) return;
      if (eBullet.collidesWith(this.player)) {
        this.player.takeDamage(eBullet.damage);
        eBullet.isAlive = false;
        this.playSound("playerHit");
      }
    });
    this.enemies.forEach((enemy) => {
      if (!enemy.isAlive || !this.player.isAlive) return;
      if (this.player.collidesWith(enemy)) {
        this.player.takeDamage(1);
        enemy.isAlive = false;
        this.score += 5;
        this.playSound("enemyHit");
        this.playSound("playerHit");
      }
    });
  }
  spawnEnemy() {
    const enemyData = this.gameData.gameplay.enemy;
    const xPos = Math.random() * (this.canvas.width - enemyData.width) + enemyData.width / 2;
    const yPos = -enemyData.height / 2;
    this.enemies.push(new Enemy(
      xPos,
      yPos,
      enemyData.width,
      enemyData.height,
      "enemy",
      enemyData.speed,
      enemyData.health,
      enemyData.fireRate
    ));
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    switch (this.gameState) {
      case 0 /* LOADING */:
        this.drawLoadingScreen();
        break;
      case 1 /* TITLE */:
        this.drawTitleScreen();
        break;
      case 2 /* PLAYING */:
        this.drawPlaying();
        break;
      case 3 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawTitleScreen() {
    this.ctx.fillStyle = "white";
    this.ctx.font = "40px Arial";
    this.ctx.textAlign = "center";
    const lines = this.gameData.text.titleScreen.split("\n");
    lines.forEach((line, index) => {
      this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 + index * 50 - (lines.length - 1) * 25);
    });
  }
  drawPlaying() {
    this.player.draw(this.ctx, this.loadedImages);
    this.playerBullets.forEach((bullet) => bullet.draw(this.ctx, this.loadedImages));
    this.enemies.forEach((enemy) => enemy.draw(this.ctx, this.loadedImages));
    this.enemyBullets.forEach((bullet) => bullet.draw(this.ctx, this.loadedImages));
    this.ctx.fillStyle = "white";
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`Score: ${this.score}`, 10, 30);
    this.ctx.fillText(`Health: ${this.player.health}`, 10, 60);
  }
  drawGameOverScreen() {
    this.ctx.fillStyle = "white";
    this.ctx.font = "40px Arial";
    this.ctx.textAlign = "center";
    const gameOverText = this.gameData.text.gameOver + this.score + "\nPress any key to restart";
    const lines = gameOverText.split("\n");
    lines.forEach((line, index) => {
      this.ctx.fillText(line, this.canvas.width / 2, this.canvas.height / 2 + index * 50 - (lines.length - 1) * 25);
    });
  }
  handleInput(event) {
    if (this.gameState === 1 /* TITLE */ || this.gameState === 3 /* GAME_OVER */) {
      if (event.type === "keydown" || event.type === "click") {
        this.startGame();
      }
    } else if (this.gameState === 2 /* PLAYING */) {
      const keyboardEvent = event;
      if (keyboardEvent.type === "keydown") {
        if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "a") {
          this.player.movingLeft = true;
        } else if (keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "d") {
          this.player.movingRight = true;
        } else if (keyboardEvent.key === " " && this.player.isAlive) {
          const currentTime = performance.now() / 1e3;
          if (this.player.canShoot(currentTime)) {
            this.player.lastShotTime = currentTime;
            const bulletData = this.gameData.gameplay.playerBullet;
            this.playerBullets.push(new Bullet(
              this.player.position.x,
              this.player.position.y - this.player.height / 2,
              bulletData.width,
              bulletData.height,
              "playerBullet",
              bulletData.speed,
              bulletData.damage,
              new Vector2(0, -1)
              // Upwards
            ));
            this.playSound("playerShoot");
          }
        }
      } else if (keyboardEvent.type === "keyup") {
        if (keyboardEvent.key === "ArrowLeft" || keyboardEvent.key === "a") {
          this.player.movingLeft = false;
        } else if (keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "d") {
          this.player.movingRight = false;
        }
      }
    }
  }
  startGame() {
    this.score = 0;
    this.playerBullets = [];
    this.enemies = [];
    this.enemyBullets = [];
    this.enemySpawnTimer = this.gameData.gameplay.enemy.spawnInterval;
    const playerGameplayData = this.gameData.gameplay.player;
    this.player = new Player(
      this.canvas.width / 2,
      this.canvas.height - playerGameplayData.height / 2 - 20,
      // offset from bottom
      playerGameplayData.width,
      playerGameplayData.height,
      "player",
      playerGameplayData.speed,
      playerGameplayData.health,
      playerGameplayData.fireRate
    );
    this.gameState = 2 /* PLAYING */;
    this.backgroundMusic?.play().catch((e) => console.warn("Background music play failed (user gesture required?):", e));
  }
  playSound(name) {
    const audio = this.loadedSounds[name];
    if (audio) {
      const clone = audio.cloneNode();
      clone.volume = audio.volume;
      clone.play().catch((e) => console.warn(`Failed to play sound '${name}':`, e));
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const game = new Game("gameCanvas");
  game.init();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGNhbnZhczoge1xyXG4gICAgICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgZ2FtZXBsYXk6IHtcclxuICAgICAgICBwbGF5ZXI6IHtcclxuICAgICAgICAgICAgc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICAgICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gc2Vjb25kcyBiZXR3ZWVuIHNob3RzXHJcbiAgICAgICAgICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICB3aWR0aDogbnVtYmVyOyAvLyBEaXNwbGF5IHdpZHRoXHJcbiAgICAgICAgICAgIGhlaWdodDogbnVtYmVyOyAvLyBEaXNwbGF5IGhlaWdodFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgZW5lbXk6IHtcclxuICAgICAgICAgICAgc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICAgICAgZmlyZVJhdGU6IG51bWJlcjsgLy8gc2Vjb25kcyBiZXR3ZWVuIHNob3RzXHJcbiAgICAgICAgICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgICAgICAgICBzcGF3bkludGVydmFsOiBudW1iZXI7IC8vIHNlY29uZHMgYmV0d2VlbiBlbmVteSBzcGF3bnNcclxuICAgICAgICAgICAgd2lkdGg6IG51bWJlcjsgLy8gRGlzcGxheSB3aWR0aFxyXG4gICAgICAgICAgICBoZWlnaHQ6IG51bWJlcjsgLy8gRGlzcGxheSBoZWlnaHRcclxuICAgICAgICB9O1xyXG4gICAgICAgIHBsYXllckJ1bGxldDoge1xyXG4gICAgICAgICAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgICAgICAgICBkYW1hZ2U6IG51bWJlcjtcclxuICAgICAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgfTtcclxuICAgICAgICBlbmVteUJ1bGxldDoge1xyXG4gICAgICAgICAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgICAgICAgICBkYW1hZ2U6IG51bWJlcjtcclxuICAgICAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICAgICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgfTtcclxuICAgIH07XHJcbiAgICB0ZXh0OiB7XHJcbiAgICAgICAgdGl0bGVTY3JlZW46IHN0cmluZztcclxuICAgICAgICBnYW1lT3Zlcjogc3RyaW5nO1xyXG4gICAgICAgIGxvYWRpbmc6IHN0cmluZztcclxuICAgIH07XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyOyB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgTG9hZGVkSW1hZ2VzIHtcclxuICAgIFtrZXk6IHN0cmluZ106IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbn1cclxuXHJcbmludGVyZmFjZSBMb2FkZWRTb3VuZHMge1xyXG4gICAgW2tleTogc3RyaW5nXTogSFRNTEF1ZGlvRWxlbWVudDtcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUlxyXG59XHJcblxyXG5jbGFzcyBWZWN0b3IyIHtcclxuICAgIGNvbnN0cnVjdG9yKHB1YmxpYyB4OiBudW1iZXIsIHB1YmxpYyB5OiBudW1iZXIpIHt9XHJcbn1cclxuXHJcbmNsYXNzIEdhbWVPYmplY3Qge1xyXG4gICAgcG9zaXRpb246IFZlY3RvcjI7XHJcbiAgICB3aWR0aDogbnVtYmVyOyAvLyBEaXNwbGF5IHdpZHRoXHJcbiAgICBoZWlnaHQ6IG51bWJlcjsgLy8gRGlzcGxheSBoZWlnaHRcclxuICAgIGltYWdlTmFtZTogc3RyaW5nO1xyXG4gICAgaXNBbGl2ZTogYm9vbGVhbiA9IHRydWU7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMucG9zaXRpb24gPSBuZXcgVmVjdG9yMih4LCB5KTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbWFnZU5hbWUgPSBpbWFnZU5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgbG9hZGVkSW1hZ2VzOiBMb2FkZWRJbWFnZXMpIHtcclxuICAgICAgICBjb25zdCBpbWFnZSA9IGxvYWRlZEltYWdlc1t0aGlzLmltYWdlTmFtZV07XHJcbiAgICAgICAgaWYgKGltYWdlICYmIHRoaXMuaXNBbGl2ZSkge1xyXG4gICAgICAgICAgICAvLyBEcmF3IGltYWdlIHNjYWxlZCB0byBvYmplY3QncyB3aWR0aCBhbmQgaGVpZ2h0LCBjZW50ZXJlZCBvbiBwb3NpdGlvblxyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGltYWdlLCB0aGlzLnBvc2l0aW9uLnggLSB0aGlzLndpZHRoIC8gMiwgdGhpcy5wb3NpdGlvbi55IC0gdGhpcy5oZWlnaHQgLyAyLCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEFBQkIgY29sbGlzaW9uIGRldGVjdGlvbiwgYXNzdW1lcyBwb3NpdGlvbiBpcyBjZW50ZXJcclxuICAgIGNvbGxpZGVzV2l0aChvdGhlcjogR2FtZU9iamVjdCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICghdGhpcy5pc0FsaXZlIHx8ICFvdGhlci5pc0FsaXZlKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgIGNvbnN0IHRoaXNMZWZ0ID0gdGhpcy5wb3NpdGlvbi54IC0gdGhpcy53aWR0aCAvIDI7XHJcbiAgICAgICAgY29uc3QgdGhpc1JpZ2h0ID0gdGhpcy5wb3NpdGlvbi54ICsgdGhpcy53aWR0aCAvIDI7XHJcbiAgICAgICAgY29uc3QgdGhpc1RvcCA9IHRoaXMucG9zaXRpb24ueSAtIHRoaXMuaGVpZ2h0IC8gMjtcclxuICAgICAgICBjb25zdCB0aGlzQm90dG9tID0gdGhpcy5wb3NpdGlvbi55ICsgdGhpcy5oZWlnaHQgLyAyO1xyXG5cclxuICAgICAgICBjb25zdCBvdGhlckxlZnQgPSBvdGhlci5wb3NpdGlvbi54IC0gb3RoZXIud2lkdGggLyAyO1xyXG4gICAgICAgIGNvbnN0IG90aGVyUmlnaHQgPSBvdGhlci5wb3NpdGlvbi54ICsgb3RoZXIud2lkdGggLyAyO1xyXG4gICAgICAgIGNvbnN0IG90aGVyVG9wID0gb3RoZXIucG9zaXRpb24ueSAtIG90aGVyLmhlaWdodCAvIDI7XHJcbiAgICAgICAgY29uc3Qgb3RoZXJCb3R0b20gPSBvdGhlci5wb3NpdGlvbi55ICsgb3RoZXIuaGVpZ2h0IC8gMjtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXNMZWZ0IDwgb3RoZXJSaWdodCAmJlxyXG4gICAgICAgICAgICAgICB0aGlzUmlnaHQgPiBvdGhlckxlZnQgJiZcclxuICAgICAgICAgICAgICAgdGhpc1RvcCA8IG90aGVyQm90dG9tICYmXHJcbiAgICAgICAgICAgICAgIHRoaXNCb3R0b20gPiBvdGhlclRvcDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBpZiBhbnkgcGFydCBvZiB0aGUgb2JqZWN0IGlzIG91dHNpZGUgdGhlIGNhbnZhc1xyXG4gICAgaXNPZmZzY3JlZW4oY2FudmFzV2lkdGg6IG51bWJlciwgY2FudmFzSGVpZ2h0OiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wb3NpdGlvbi54ICsgdGhpcy53aWR0aCAvIDIgPCAwIHx8IHRoaXMucG9zaXRpb24ueCAtIHRoaXMud2lkdGggLyAyID4gY2FudmFzV2lkdGggfHxcclxuICAgICAgICAgICAgICAgdGhpcy5wb3NpdGlvbi55ICsgdGhpcy5oZWlnaHQgLyAyIDwgMCB8fCB0aGlzLnBvc2l0aW9uLnkgLSB0aGlzLmhlaWdodCAvIDIgPiBjYW52YXNIZWlnaHQ7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIFBsYXllciBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgZmlyZVJhdGU6IG51bWJlcjtcclxuICAgIGxhc3RTaG90VGltZTogbnVtYmVyID0gMDtcclxuICAgIG1vdmluZ0xlZnQ6IGJvb2xlYW4gPSBmYWxzZTtcclxuICAgIG1vdmluZ1JpZ2h0OiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgc3BlZWQ6IG51bWJlciwgaGVhbHRoOiBudW1iZXIsIGZpcmVSYXRlOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBzcGVlZDtcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IGhlYWx0aDtcclxuICAgICAgICB0aGlzLmZpcmVSYXRlID0gZmlyZVJhdGU7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBjYW52YXNXaWR0aDogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMubW92aW5nTGVmdCkge1xyXG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uLnggLT0gdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMubW92aW5nUmlnaHQpIHtcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbi54ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCBwbGF5ZXIgcG9zaXRpb24gd2l0aGluIGNhbnZhcyBib3VuZHNcclxuICAgICAgICB0aGlzLnBvc2l0aW9uLnggPSBNYXRoLm1heCh0aGlzLndpZHRoIC8gMiwgTWF0aC5taW4oY2FudmFzV2lkdGggLSB0aGlzLndpZHRoIC8gMiwgdGhpcy5wb3NpdGlvbi54KSk7XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShhbW91bnQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoIC09IGFtb3VudDtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmlzQWxpdmUgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY2FuU2hvb3QoY3VycmVudFRpbWU6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiBjdXJyZW50VGltZSAtIHRoaXMubGFzdFNob3RUaW1lID49IHRoaXMuZmlyZVJhdGU7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEJ1bGxldCBleHRlbmRzIEdhbWVPYmplY3Qge1xyXG4gICAgc3BlZWQ6IG51bWJlcjtcclxuICAgIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgZGlyZWN0aW9uOiBWZWN0b3IyOyAvLyBOb3JtYWxpemVkIGRpcmVjdGlvbiB2ZWN0b3JcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIGltYWdlTmFtZTogc3RyaW5nLCBzcGVlZDogbnVtYmVyLCBkYW1hZ2U6IG51bWJlciwgZGlyZWN0aW9uOiBWZWN0b3IyKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgd2lkdGgsIGhlaWdodCwgaW1hZ2VOYW1lKTtcclxuICAgICAgICB0aGlzLnNwZWVkID0gc3BlZWQ7XHJcbiAgICAgICAgdGhpcy5kYW1hZ2UgPSBkYW1hZ2U7XHJcbiAgICAgICAgdGhpcy5kaXJlY3Rpb24gPSBkaXJlY3Rpb247XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5wb3NpdGlvbi54ICs9IHRoaXMuZGlyZWN0aW9uLnggKiB0aGlzLnNwZWVkICogZGVsdGFUaW1lO1xyXG4gICAgICAgIHRoaXMucG9zaXRpb24ueSArPSB0aGlzLmRpcmVjdGlvbi55ICogdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgRW5lbXkgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgIGZpcmVSYXRlOiBudW1iZXI7XHJcbiAgICBsYXN0U2hvdFRpbWU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgc3BlZWQ6IG51bWJlciwgaGVhbHRoOiBudW1iZXIsIGZpcmVSYXRlOiBudW1iZXIpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCB3aWR0aCwgaGVpZ2h0LCBpbWFnZU5hbWUpO1xyXG4gICAgICAgIHRoaXMuc3BlZWQgPSBzcGVlZDtcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IGhlYWx0aDtcclxuICAgICAgICB0aGlzLmZpcmVSYXRlID0gZmlyZVJhdGU7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5wb3NpdGlvbi55ICs9IHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShhbW91bnQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoIC09IGFtb3VudDtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmlzQWxpdmUgPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY2FuU2hvb3QoY3VycmVudFRpbWU6IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiBjdXJyZW50VGltZSAtIHRoaXMubGFzdFNob3RUaW1lID49IHRoaXMuZmlyZVJhdGU7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgcHJpdmF0ZSBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgIHByaXZhdGUgZ2FtZURhdGEhOiBHYW1lRGF0YTtcclxuICAgIHByaXZhdGUgbG9hZGVkSW1hZ2VzOiBMb2FkZWRJbWFnZXMgPSB7fTtcclxuICAgIHByaXZhdGUgbG9hZGVkU291bmRzOiBMb2FkZWRTb3VuZHMgPSB7fTtcclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxuICAgIHByaXZhdGUgbGFzdEZyYW1lVGltZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIHBsYXllciE6IFBsYXllcjtcclxuICAgIHByaXZhdGUgcGxheWVyQnVsbGV0czogQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgZW5lbWllczogRW5lbXlbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBlbmVteUJ1bGxldHM6IEJ1bGxldFtdID0gW107XHJcblxyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgZW5lbXlTcGF3blRpbWVyOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBiYWNrZ3JvdW5kTXVzaWM6IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYW52YXNJZDogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbnZhcyB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgICAgICAvLyBCaW5kIGV2ZW50IGhhbmRsZXJzIHRvICd0aGlzJ1xyXG4gICAgICAgIHRoaXMuaGFuZGxlSW5wdXQgPSB0aGlzLmhhbmRsZUlucHV0LmJpbmQodGhpcyk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlSW5wdXQpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5oYW5kbGVJbnB1dCk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUlucHV0KTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIHRoaXMuZHJhd0xvYWRpbmdTY3JlZW4oKTsgLy8gRHJhdyBpbml0aWFsIGxvYWRpbmcgc2NyZWVuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmdhbWVEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG5cclxuICAgICAgICAgICAgLy8gU2V0IGNhbnZhcyBkaW1lbnNpb25zIGZyb20gbG9hZGVkIGRhdGFcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmdhbWVEYXRhLmNhbnZhcy53aWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5nYW1lRGF0YS5jYW52YXMuaGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7IC8vIFN0YXJ0IGdhbWUgbG9vcFxyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMubG9hZGVkU291bmRzWydiZ20nXSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWMgPSB0aGlzLmxvYWRlZFNvdW5kc1snYmdtJ107XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpYy5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZE11c2ljLnZvbHVtZSA9IHRoaXMuZ2FtZURhdGEuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnYmdtJyk/LnZvbHVtZSB8fCAwLjU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YSBvciBhc3NldHM6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgdGhpcy5kcmF3RXJyb3JTY3JlZW4oXCJFcnJvciBsb2FkaW5nIGdhbWUuIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuXCIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuZ2FtZURhdGEuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5zcmMgPSBpbWcucGF0aDtcclxuICAgICAgICAgICAgICAgIGltYWdlLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEltYWdlc1tpbWcubmFtZV0gPSBpbWFnZTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaW1hZ2Uub25lcnJvciA9ICgpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZy5wYXRofWApKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmdhbWVEYXRhLmFzc2V0cy5zb3VuZHMubWFwKHNuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8uc3JjID0gc25kLnBhdGg7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzbmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZFNvdW5kc1tzbmQubmFtZV0gPSBhdWRpbztcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NuZC5wYXRofWApKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3TG9hZGluZ1NjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ2JsYWNrJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5nYW1lRGF0YT8udGV4dC5sb2FkaW5nIHx8IFwiTG9hZGluZyBHYW1lLi4uXCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3RXJyb3JTY3JlZW4obWVzc2FnZTogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdyZWQnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICczMHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChtZXNzYWdlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZUxvb3AoY3VycmVudFRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMubGFzdEZyYW1lVGltZSkgLyAxMDAwOyAvLyBDb252ZXJ0IHRvIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLmRyYXcoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAvLyBObyB1cGRhdGVzIGZvciBMT0FESU5HLCBUSVRMRSwgR0FNRV9PVkVSIHN0YXRlcywganVzdCBkcmF3aW5nIHN0YXRpYyBzY3JlZW5zXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWluZyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIC8vIFBsYXllciB1cGRhdGVcclxuICAgICAgICB0aGlzLnBsYXllci51cGRhdGUoZGVsdGFUaW1lLCB0aGlzLmNhbnZhcy53aWR0aCk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBwbGF5ZXIgYnVsbGV0c1xyXG4gICAgICAgIHRoaXMucGxheWVyQnVsbGV0cyA9IHRoaXMucGxheWVyQnVsbGV0cy5maWx0ZXIoYnVsbGV0ID0+IHtcclxuICAgICAgICAgICAgYnVsbGV0LnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICByZXR1cm4gYnVsbGV0LmlzQWxpdmUgJiYgIWJ1bGxldC5pc09mZnNjcmVlbih0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGVuZW1pZXMgYW5kIGVuZW15IHNob290aW5nXHJcbiAgICAgICAgdGhpcy5lbmVteVNwYXduVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLmVuZW15U3Bhd25UaW1lciA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25FbmVteSgpO1xyXG4gICAgICAgICAgICB0aGlzLmVuZW15U3Bhd25UaW1lciA9IHRoaXMuZ2FtZURhdGEuZ2FtZXBsYXkuZW5lbXkuc3Bhd25JbnRlcnZhbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCkgLyAxMDAwO1xyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IHRoaXMuZW5lbWllcy5maWx0ZXIoZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICBlbmVteS51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgaWYgKGVuZW15LmlzQWxpdmUpIHtcclxuICAgICAgICAgICAgICAgIC8vIEVuZW15IHNob290aW5nXHJcbiAgICAgICAgICAgICAgICBpZiAoZW5lbXkuY2FuU2hvb3QoY3VycmVudFRpbWUpICYmIE1hdGgucmFuZG9tKCkgPCAwLjIpIHsgLy8gMjAlIGNoYW5jZSBwZXIgaW50ZXJ2YWxcclxuICAgICAgICAgICAgICAgICAgICBlbmVteS5sYXN0U2hvdFRpbWUgPSBjdXJyZW50VGltZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBidWxsZXREYXRhID0gdGhpcy5nYW1lRGF0YS5nYW1lcGxheS5lbmVteUJ1bGxldDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5wdXNoKG5ldyBCdWxsZXQoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15LnBvc2l0aW9uLngsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15LnBvc2l0aW9uLnkgKyBlbmVteS5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBidWxsZXREYXRhLndpZHRoLCBidWxsZXREYXRhLmhlaWdodCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ2VuZW15QnVsbGV0JywgYnVsbGV0RGF0YS5zcGVlZCwgYnVsbGV0RGF0YS5kYW1hZ2UsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBWZWN0b3IyKDAsIDEpIC8vIERvd253YXJkc1xyXG4gICAgICAgICAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBpZiBvZmZzY3JlZW4gb3Igbm90IGFsaXZlXHJcbiAgICAgICAgICAgIHJldHVybiBlbmVteS5pc0FsaXZlICYmICFlbmVteS5pc09mZnNjcmVlbih0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGVuZW15IGJ1bGxldHNcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cyA9IHRoaXMuZW5lbXlCdWxsZXRzLmZpbHRlcihidWxsZXQgPT4ge1xyXG4gICAgICAgICAgICBidWxsZXQudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgIHJldHVybiBidWxsZXQuaXNBbGl2ZSAmJiAhYnVsbGV0LmlzT2Zmc2NyZWVuKHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBDb2xsaXNpb24gZGV0ZWN0aW9uXHJcbiAgICAgICAgdGhpcy5jaGVja0NvbGxpc2lvbnMoKTtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllci5pc0FsaXZlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWM/LnBhdXNlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hlY2tDb2xsaXNpb25zKCkge1xyXG4gICAgICAgIC8vIFBsYXllciBidWxsZXRzIHZzIEVuZW1pZXNcclxuICAgICAgICB0aGlzLnBsYXllckJ1bGxldHMuZm9yRWFjaChwQnVsbGV0ID0+IHtcclxuICAgICAgICAgICAgaWYgKCFwQnVsbGV0LmlzQWxpdmUpIHJldHVybjtcclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFlbmVteS5pc0FsaXZlKSByZXR1cm47XHJcbiAgICAgICAgICAgICAgICBpZiAocEJ1bGxldC5jb2xsaWRlc1dpdGgoZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkudGFrZURhbWFnZShwQnVsbGV0LmRhbWFnZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcEJ1bGxldC5pc0FsaXZlID0gZmFsc2U7IC8vIEJ1bGxldCBkaXNhcHBlYXJzIG9uIGhpdFxyXG4gICAgICAgICAgICAgICAgICAgIGlmICghZW5lbXkuaXNBbGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IDEwOyAvLyBTY29yZSBmb3IgZGVzdHJveWluZyBlbmVteVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnZW5lbXlIaXQnKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBFbmVteSBidWxsZXRzIHZzIFBsYXllclxyXG4gICAgICAgIHRoaXMuZW5lbXlCdWxsZXRzLmZvckVhY2goZUJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIGlmICghZUJ1bGxldC5pc0FsaXZlIHx8ICF0aGlzLnBsYXllci5pc0FsaXZlKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmIChlQnVsbGV0LmNvbGxpZGVzV2l0aCh0aGlzLnBsYXllcikpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnRha2VEYW1hZ2UoZUJ1bGxldC5kYW1hZ2UpO1xyXG4gICAgICAgICAgICAgICAgZUJ1bGxldC5pc0FsaXZlID0gZmFsc2U7IC8vIEJ1bGxldCBkaXNhcHBlYXJzIG9uIGhpdFxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3BsYXllckhpdCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciB2cyBFbmVtaWVzIChkaXJlY3QgY29sbGlzaW9uKVxyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgaWYgKCFlbmVteS5pc0FsaXZlIHx8ICF0aGlzLnBsYXllci5pc0FsaXZlKSByZXR1cm47XHJcbiAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5jb2xsaWRlc1dpdGgoZW5lbXkpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci50YWtlRGFtYWdlKDEpOyAvLyBMb3NlIDEgaGVhbHRoIG9uIGNvbGxpc2lvblxyXG4gICAgICAgICAgICAgICAgZW5lbXkuaXNBbGl2ZSA9IGZhbHNlOyAvLyBFbmVteSBpcyBkZXN0cm95ZWRcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gNTsgLy8gU21hbGxlciBzY29yZSBmb3IgY29sbGlzaW9uIGtpbGxcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdlbmVteUhpdCcpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3BsYXllckhpdCcpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzcGF3bkVuZW15KCkge1xyXG4gICAgICAgIGNvbnN0IGVuZW15RGF0YSA9IHRoaXMuZ2FtZURhdGEuZ2FtZXBsYXkuZW5lbXk7XHJcbiAgICAgICAgY29uc3QgeFBvcyA9IE1hdGgucmFuZG9tKCkgKiAodGhpcy5jYW52YXMud2lkdGggLSBlbmVteURhdGEud2lkdGgpICsgZW5lbXlEYXRhLndpZHRoIC8gMjtcclxuICAgICAgICBjb25zdCB5UG9zID0gLWVuZW15RGF0YS5oZWlnaHQgLyAyOyAvLyBTdGFydCBqdXN0IGFib3ZlIHNjcmVlblxyXG4gICAgICAgIHRoaXMuZW5lbWllcy5wdXNoKG5ldyBFbmVteShcclxuICAgICAgICAgICAgeFBvcywgeVBvcyxcclxuICAgICAgICAgICAgZW5lbXlEYXRhLndpZHRoLCBlbmVteURhdGEuaGVpZ2h0LFxyXG4gICAgICAgICAgICAnZW5lbXknLCBlbmVteURhdGEuc3BlZWQsIGVuZW15RGF0YS5oZWFsdGgsIGVuZW15RGF0YS5maXJlUmF0ZVxyXG4gICAgICAgICkpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBwcml2YXRlIGRyYXcoKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICdibGFjayc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7IC8vIEdhbWUgYmFja2dyb3VuZFxyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMb2FkaW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdQbGF5aW5nKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnNDBweCBBcmlhbCc7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgY29uc3QgbGluZXMgPSB0aGlzLmdhbWVEYXRhLnRleHQudGl0bGVTY3JlZW4uc3BsaXQoJ1xcbicpO1xyXG4gICAgICAgIGxpbmVzLmZvckVhY2goKGxpbmUsIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGxpbmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIChpbmRleCAqIDUwKSAtIChsaW5lcy5sZW5ndGggLTEpKjI1KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdQbGF5aW5nKCkge1xyXG4gICAgICAgIC8vIERyYXcgcGxheWVyXHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuZHJhdyh0aGlzLmN0eCwgdGhpcy5sb2FkZWRJbWFnZXMpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IHBsYXllciBidWxsZXRzXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IGJ1bGxldC5kcmF3KHRoaXMuY3R4LCB0aGlzLmxvYWRlZEltYWdlcykpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IGVuZW1pZXNcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiBlbmVteS5kcmF3KHRoaXMuY3R4LCB0aGlzLmxvYWRlZEltYWdlcykpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IGVuZW15IGJ1bGxldHNcclxuICAgICAgICB0aGlzLmVuZW15QnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiBidWxsZXQuZHJhdyh0aGlzLmN0eCwgdGhpcy5sb2FkZWRJbWFnZXMpKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBVSVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyMHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnbGVmdCc7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNjb3JlOiAke3RoaXMuc2NvcmV9YCwgMTAsIDMwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgSGVhbHRoOiAke3RoaXMucGxheWVyLmhlYWx0aH1gLCAxMCwgNjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVPdmVyU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICc0MHB4IEFyaWFsJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICBjb25zdCBnYW1lT3ZlclRleHQgPSB0aGlzLmdhbWVEYXRhLnRleHQuZ2FtZU92ZXIgKyB0aGlzLnNjb3JlICsgJ1xcblByZXNzIGFueSBrZXkgdG8gcmVzdGFydCc7XHJcbiAgICAgICAgY29uc3QgbGluZXMgPSBnYW1lT3ZlclRleHQuc3BsaXQoJ1xcbicpO1xyXG4gICAgICAgIGxpbmVzLmZvckVhY2goKGxpbmUsIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGxpbmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIChpbmRleCAqIDUwKSAtIChsaW5lcy5sZW5ndGggLTEpKjI1KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUlucHV0KGV2ZW50OiBLZXlib2FyZEV2ZW50IHwgTW91c2VFdmVudCkge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC50eXBlID09PSAna2V5ZG93bicgfHwgZXZlbnQudHlwZSA9PT0gJ2NsaWNrJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGtleWJvYXJkRXZlbnQgPSBldmVudCBhcyBLZXlib2FyZEV2ZW50O1xyXG4gICAgICAgICAgICBpZiAoa2V5Ym9hcmRFdmVudC50eXBlID09PSAna2V5ZG93bicpIHtcclxuICAgICAgICAgICAgICAgIGlmIChrZXlib2FyZEV2ZW50LmtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5Ym9hcmRFdmVudC5rZXkgPT09ICdhJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLm1vdmluZ0xlZnQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlib2FyZEV2ZW50LmtleSA9PT0gJ0Fycm93UmlnaHQnIHx8IGtleWJvYXJkRXZlbnQua2V5ID09PSAnZCcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5tb3ZpbmdSaWdodCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGtleWJvYXJkRXZlbnQua2V5ID09PSAnICcgJiYgdGhpcy5wbGF5ZXIuaXNBbGl2ZSkgeyAvLyBTcGFjZWJhciB0byBzaG9vdFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCkgLyAxMDAwO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllci5jYW5TaG9vdChjdXJyZW50VGltZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIubGFzdFNob3RUaW1lID0gY3VycmVudFRpbWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGJ1bGxldERhdGEgPSB0aGlzLmdhbWVEYXRhLmdhbWVwbGF5LnBsYXllckJ1bGxldDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzLnB1c2gobmV3IEJ1bGxldChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLnBvc2l0aW9uLngsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5wb3NpdGlvbi55IC0gdGhpcy5wbGF5ZXIuaGVpZ2h0IC8gMixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJ1bGxldERhdGEud2lkdGgsIGJ1bGxldERhdGEuaGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ3BsYXllckJ1bGxldCcsIGJ1bGxldERhdGEuc3BlZWQsIGJ1bGxldERhdGEuZGFtYWdlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3IFZlY3RvcjIoMCwgLTEpIC8vIFVwd2FyZHNcclxuICAgICAgICAgICAgICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdwbGF5ZXJTaG9vdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlib2FyZEV2ZW50LnR5cGUgPT09ICdrZXl1cCcpIHtcclxuICAgICAgICAgICAgICAgIGlmIChrZXlib2FyZEV2ZW50LmtleSA9PT0gJ0Fycm93TGVmdCcgfHwga2V5Ym9hcmRFdmVudC5rZXkgPT09ICdhJykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLm1vdmluZ0xlZnQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5rZXkgPT09ICdBcnJvd1JpZ2h0JyB8fCBrZXlib2FyZEV2ZW50LmtleSA9PT0gJ2QnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIubW92aW5nUmlnaHQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpIHtcclxuICAgICAgICAvLyBSZXNldCBnYW1lIHN0YXRlXHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCdWxsZXRzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVteUJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmVuZW15U3Bhd25UaW1lciA9IHRoaXMuZ2FtZURhdGEuZ2FtZXBsYXkuZW5lbXkuc3Bhd25JbnRlcnZhbDtcclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyR2FtZXBsYXlEYXRhID0gdGhpcy5nYW1lRGF0YS5nYW1lcGxheS5wbGF5ZXI7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCAvIDIsXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCAtIHBsYXllckdhbWVwbGF5RGF0YS5oZWlnaHQgLyAyIC0gMjAsIC8vIG9mZnNldCBmcm9tIGJvdHRvbVxyXG4gICAgICAgICAgICBwbGF5ZXJHYW1lcGxheURhdGEud2lkdGgsIHBsYXllckdhbWVwbGF5RGF0YS5oZWlnaHQsXHJcbiAgICAgICAgICAgICdwbGF5ZXInLCBwbGF5ZXJHYW1lcGxheURhdGEuc3BlZWQsIHBsYXllckdhbWVwbGF5RGF0YS5oZWFsdGgsIHBsYXllckdhbWVwbGF5RGF0YS5maXJlUmF0ZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgLy8gQXR0ZW1wdCB0byBwbGF5IGJhY2tncm91bmQgbXVzaWMuIEl0IG1pZ2h0IGZhaWwgaWYgbm8gdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZCB5ZXQuXHJcbiAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWM/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkJhY2tncm91bmQgbXVzaWMgcGxheSBmYWlsZWQgKHVzZXIgZ2VzdHVyZSByZXF1aXJlZD8pOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5U291bmQobmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLmxvYWRlZFNvdW5kc1tuYW1lXTtcclxuICAgICAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICAgICAgLy8gQ2xvbmUgYXVkaW8gdG8gYWxsb3cgbXVsdGlwbGUgY29uY3VycmVudCBwbGF5cyB3aXRob3V0IGludGVycnVwdGluZyBwcmV2aW91cyBvbmVzXHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgY2xvbmUudm9sdW1lID0gYXVkaW8udm9sdW1lOyAvLyBSZXRhaW4gb3JpZ2luYWwgdm9sdW1lXHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgRmFpbGVkIHRvIHBsYXkgc291bmQgJyR7bmFtZX0nOmAsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEluaXRpYWxpemUgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGlzIGZ1bGx5IGxvYWRlZFxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgY29uc3QgZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICBnYW1lLmluaXQoKTtcclxufSk7Il0sCiAgIm1hcHBpbmdzIjogIkFBcURBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSkMsU0FBQUE7QUFBQSxHQUFBO0FBT0wsTUFBTSxRQUFRO0FBQUEsRUFDVixZQUFtQixHQUFrQixHQUFXO0FBQTdCO0FBQWtCO0FBQUEsRUFBWTtBQUNyRDtBQUVBLE1BQU0sV0FBVztBQUFBLEVBT2IsWUFBWSxHQUFXLEdBQVcsT0FBZSxRQUFnQixXQUFtQjtBQUZwRixtQkFBbUI7QUFHZixTQUFLLFdBQVcsSUFBSSxRQUFRLEdBQUcsQ0FBQztBQUNoQyxTQUFLLFFBQVE7QUFDYixTQUFLLFNBQVM7QUFDZCxTQUFLLFlBQVk7QUFBQSxFQUNyQjtBQUFBLEVBRUEsS0FBSyxLQUErQixjQUE0QjtBQUM1RCxVQUFNLFFBQVEsYUFBYSxLQUFLLFNBQVM7QUFDekMsUUFBSSxTQUFTLEtBQUssU0FBUztBQUV2QixVQUFJLFVBQVUsT0FBTyxLQUFLLFNBQVMsSUFBSSxLQUFLLFFBQVEsR0FBRyxLQUFLLFNBQVMsSUFBSSxLQUFLLFNBQVMsR0FBRyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsSUFDckg7QUFBQSxFQUNKO0FBQUE7QUFBQSxFQUdBLGFBQWEsT0FBNEI7QUFDckMsUUFBSSxDQUFDLEtBQUssV0FBVyxDQUFDLE1BQU0sUUFBUyxRQUFPO0FBRTVDLFVBQU0sV0FBVyxLQUFLLFNBQVMsSUFBSSxLQUFLLFFBQVE7QUFDaEQsVUFBTSxZQUFZLEtBQUssU0FBUyxJQUFJLEtB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
