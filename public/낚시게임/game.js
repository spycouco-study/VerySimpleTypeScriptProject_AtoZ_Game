var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class Player {
  constructor(x, y, width, height, imageName, initialVelocityY) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.imageName = imageName;
    this.velocityY = initialVelocityY;
    this.isAlive = true;
  }
  flap(strength) {
    this.velocityY = strength;
  }
  update(gravity, maxFallSpeed, canvasHeight, bounceStrength) {
    this.velocityY += gravity;
    if (this.velocityY > maxFallSpeed) {
      this.velocityY = maxFallSpeed;
    }
    this.y += this.velocityY;
    if (this.y < 0) {
      this.y = 0;
      this.velocityY = 0;
    }
    if (this.y + this.height > canvasHeight) {
      this.y = canvasHeight - this.height;
      this.velocityY = bounceStrength;
    }
  }
}
class Obstacle {
  constructor(x, gapY, width, gapHeight, imageTopName, imageBottomName) {
    this.x = x;
    this.gapY = gapY;
    this.width = width;
    this.gapHeight = gapHeight;
    this.imageTopName = imageTopName;
    this.imageBottomName = imageBottomName;
    this.scored = false;
  }
  update(speed) {
    this.x -= speed;
  }
  // AABB collision detection
  collidesWith(player) {
    const horizontalOverlap = player.x < this.x + this.width && player.x + player.width > this.x;
    if (!horizontalOverlap) return false;
    const topObstacleBottomY = this.gapY;
    if (player.y < topObstacleBottomY) {
      return true;
    }
    const bottomObstacleTopY = this.gapY + this.gapHeight;
    if (player.y + player.height > bottomObstacleTopY) {
      return true;
    }
    return false;
  }
}
class Game {
  // Timer to delay game over screen
  constructor(canvasId) {
    this.config = null;
    this.images = /* @__PURE__ */ new Map();
    this.sounds = /* @__PURE__ */ new Map();
    this.gameState = 0 /* TITLE */;
    this.player = null;
    this.obstacles = [];
    this.score = 0;
    this.lastObstacleTime = 0;
    this.lastFrameTime = 0;
    this.backgroundX = 0;
    this.bgMusic = null;
    this.gameOverTimer = null;
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    if (!this.canvas) {
      console.error(`Canvas with ID '${canvasId}' not found.`);
      return;
    }
    this.ctx.imageSmoothingEnabled = false;
  }
  async init() {
    await this.loadConfig();
    if (!this.config) {
      console.error("Failed to load game configuration.");
      return;
    }
    this.canvas.width = this.config.canvas.width;
    this.canvas.height = this.config.canvas.height;
    await this.loadAssets();
    this.setupInput();
    this.bgMusic = this.sounds.get("bg_music")?.audio || null;
    if (this.bgMusic) {
      this.bgMusic.loop = true;
      this.bgMusic.volume = this.config.assets.sounds.find((s) => s.name === "bg_music")?.volume || 0.3;
    }
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  async loadConfig() {
    try {
      const response = await fetch("data.json");
      this.config = await response.json();
    } catch (error) {
      console.error("Error loading config:", error);
      this.config = null;
    }
  }
  async loadAssets() {
    if (!this.config) return;
    const imagePromises = this.config.assets.images.map((asset) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = asset.path;
        img.onload = () => {
          this.images.set(asset.name, { img, width: asset.width, height: asset.height });
          resolve();
        };
        img.onerror = () => {
          console.error(`Failed to load image: ${asset.path}`);
          reject();
        };
      });
    });
    const soundPromises = this.config.assets.sounds.map((asset) => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = asset.path;
        audio.volume = asset.volume;
        audio.oncanplaythrough = () => {
          this.sounds.set(asset.name, { audio, duration_seconds: asset.duration_seconds, volume: asset.volume });
          resolve();
        };
        audio.onerror = () => {
          console.error(`Failed to load sound: ${asset.path}`);
          reject();
        };
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
  }
  setupInput() {
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
  }
  handleKeyDown(event) {
    if (!this.config) return;
    if (event.code === "Space") {
      event.preventDefault();
      switch (this.gameState) {
        case 0 /* TITLE */:
          this.gameState = 1 /* INSTRUCTIONS */;
          break;
        case 1 /* INSTRUCTIONS */:
          this.resetGame();
          this.gameState = 2 /* PLAYING */;
          this.bgMusic?.play().catch((e) => console.error("BGM play failed:", e));
          break;
        case 2 /* PLAYING */:
          if (this.player && this.player.isAlive) {
            this.player.flap(this.config.game.player_flap_strength);
            this.playSound("flap_sound");
          }
          break;
        case 3 /* GAME_OVER */:
          if (this.gameOverTimer === null) {
            this.resetGame();
            this.gameState = 2 /* PLAYING */;
            this.bgMusic?.play().catch((e) => console.error("BGM play failed:", e));
          }
          break;
      }
    }
  }
  resetGame() {
    if (!this.config) return;
    this.player = new Player(
      this.config.player.start_x,
      this.config.player.start_y,
      this.config.player.width,
      this.config.player.height,
      this.config.player.image,
      this.config.game.initial_player_y_velocity
    );
    this.obstacles = [];
    this.score = 0;
    this.lastObstacleTime = performance.now();
    this.gameOverTimer = null;
  }
  gameLoop(currentTime) {
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = currentTime;
    }
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    if (this.config) {
      this.update(deltaTime);
      this.render();
    }
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  update(deltaTime) {
    if (!this.config) return;
    switch (this.gameState) {
      case 2 /* PLAYING */:
        if (!this.player || !this.player.isAlive) {
          if (this.gameOverTimer === null) {
            this.gameOverTimer = performance.now() + this.config.game.game_over_delay_ms;
          } else if (performance.now() >= this.gameOverTimer) {
            this.gameState = 3 /* GAME_OVER */;
            this.gameOverTimer = null;
            if (this.bgMusic) {
              this.bgMusic.pause();
              this.bgMusic.currentTime = 0;
            }
          }
          return;
        }
        const currentPlayer = this.player;
        currentPlayer.update(this.config.game.gravity, this.config.game.player_max_fall_speed, this.canvas.height, this.config.game.player_bounce_strength);
        for (let i = 0; i < this.obstacles.length; i++) {
          const obstacle = this.obstacles[i];
          obstacle.update(this.config.game.obstacle_speed);
          if (obstacle.collidesWith(currentPlayer)) {
            currentPlayer.isAlive = false;
            this.playSound("hit_sound");
            break;
          }
          if (!obstacle.scored && obstacle.x + obstacle.width < currentPlayer.x) {
            this.score++;
            obstacle.scored = true;
          }
        }
        this.obstacles = this.obstacles.filter((obstacle) => obstacle.x + obstacle.width > 0);
        const now = performance.now();
        if (now - this.lastObstacleTime > this.getRandomObstacleInterval()) {
          this.addObstacle();
          this.lastObstacleTime = now;
        }
        this.backgroundX = (this.backgroundX - this.config.game.background_scroll_speed) % this.config.canvas.width;
        if (this.backgroundX < -this.config.canvas.width) {
          this.backgroundX += this.config.canvas.width;
        }
        break;
      case 0 /* TITLE */:
      case 1 /* INSTRUCTIONS */:
      case 3 /* GAME_OVER */:
        break;
    }
  }
  getRandomObstacleInterval() {
    if (!this.config) return 0;
    return Math.random() * (this.config.game.obstacle_interval_max - this.config.game.obstacle_interval_min) + this.config.game.obstacle_interval_min;
  }
  addObstacle() {
    if (!this.config) return;
    const minGapY = 50;
    const maxGapY = this.canvas.height - this.config.game.obstacle_gap_height - 50;
    const gapY = Math.random() * (maxGapY - minGapY) + minGapY;
    const randomObstacleType = this.config.obstacles[Math.floor(Math.random() * this.config.obstacles.length)];
    this.obstacles.push(new Obstacle(
      this.canvas.width,
      gapY,
      // gapY is the Y coordinate of the top edge of the gap
      this.config.game.obstacle_width,
      this.config.game.obstacle_gap_height,
      randomObstacleType.image_top,
      randomObstacleType.image_bottom
    ));
  }
  render() {
    if (!this.config) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawObject("background_ocean", this.backgroundX, 0, this.canvas.width, this.canvas.height);
    this.drawObject("background_ocean", this.backgroundX + this.canvas.width, 0, this.canvas.width, this.canvas.height);
    switch (this.gameState) {
      case 0 /* TITLE */:
        this.drawText(this.config.text.title_main, this.canvas.width / 2, this.canvas.height / 2 - 50, "50px serif", "white");
        this.drawText(this.config.text.title_sub, this.canvas.width / 2, this.canvas.height / 2 + 20, "20px serif", "white");
        break;
      case 1 /* INSTRUCTIONS */:
        this.drawText(this.config.text.instructions_title, this.canvas.width / 2, this.canvas.height / 2 - 100, "40px serif", "white");
        this.drawText(this.config.text.instructions_line1, this.canvas.width / 2, this.canvas.height / 2 - 40, "25px serif", "white");
        this.drawText(this.config.text.instructions_line2, this.canvas.width / 2, this.canvas.height / 2, "25px serif", "white");
        this.drawText(this.config.text.instructions_line3, this.canvas.width / 2, this.canvas.height / 2 + 40, "25px serif", "white");
        this.drawText(this.config.text.instructions_continue, this.canvas.width / 2, this.canvas.height / 2 + 100, "20px serif", "white");
        break;
      case 2 /* PLAYING */:
      case 3 /* GAME_OVER */:
        if (this.player && this.player.isAlive) {
          this.drawObject(this.player.imageName, this.player.x, this.player.y, this.player.width, this.player.height);
        } else if (this.player && !this.player.isAlive && this.gameOverTimer !== null && performance.now() < this.gameOverTimer) {
          this.ctx.save();
          this.ctx.translate(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
          this.ctx.rotate(Math.PI / 4);
          this.drawObject(this.player.imageName, -this.player.width / 2, -this.player.height / 2, this.player.width, this.player.height);
          this.ctx.restore();
        }
        for (const obstacle of this.obstacles) {
          this.drawObject(obstacle.imageTopName, obstacle.x, 0, obstacle.width, obstacle.gapY);
          this.drawObject(obstacle.imageBottomName, obstacle.x, obstacle.gapY + obstacle.gapHeight, obstacle.width, this.canvas.height - (obstacle.gapY + obstacle.gapHeight));
        }
        this.drawText(`Score: ${this.score}`, this.canvas.width / 2, 50, "30px serif", "white");
        if (this.gameState === 3 /* GAME_OVER */) {
          this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          this.drawText(this.config.text.game_over_main, this.canvas.width / 2, this.canvas.height / 2 - 50, "50px serif", "red");
          this.drawText(`${this.config.text.game_over_score}${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 20, "30px serif", "white");
          this.drawText(this.config.text.game_over_restart, this.canvas.width / 2, this.canvas.height / 2 + 70, "20px serif", "white");
        }
        break;
    }
  }
  drawObject(imageName, x, y, width, height) {
    const asset = this.images.get(imageName);
    if (asset) {
      this.ctx.drawImage(asset.img, x, y, width, height);
    } else {
      console.warn(`Image asset '${imageName}' not found. Drawing placeholder.`);
      this.ctx.fillStyle = "magenta";
      this.ctx.fillRect(x, y, width, height);
    }
  }
  drawText(text, x, y, font, color) {
    this.ctx.font = font;
    this.ctx.fillStyle = color;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(text, x, y);
  }
  playSound(soundName) {
    const soundAsset = this.sounds.get(soundName);
    if (soundAsset) {
      const audio = new Audio(soundAsset.audio.src);
      audio.volume = soundAsset.volume;
      audio.play().catch((e) => console.error(`Sound play failed for ${soundName}:`, e));
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const game = new Game("gameCanvas");
  game.init();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzOiB7XHJcbiAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBnYW1lOiB7XHJcbiAgICAgICAgZ3Jhdml0eTogbnVtYmVyO1xyXG4gICAgICAgIHBsYXllcl9mbGFwX3N0cmVuZ3RoOiBudW1iZXI7XHJcbiAgICAgICAgcGxheWVyX21heF9mYWxsX3NwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgcGxheWVyX2JvdW5jZV9zdHJlbmd0aDogbnVtYmVyO1xyXG4gICAgICAgIG9ic3RhY2xlX3NwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgb2JzdGFjbGVfaW50ZXJ2YWxfbWluOiBudW1iZXI7XHJcbiAgICAgICAgb2JzdGFjbGVfaW50ZXJ2YWxfbWF4OiBudW1iZXI7XHJcbiAgICAgICAgb2JzdGFjbGVfZ2FwX2hlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIG9ic3RhY2xlX3dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgYmFja2dyb3VuZF9zY3JvbGxfc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBpbml0aWFsX3BsYXllcl95X3ZlbG9jaXR5OiBudW1iZXI7XHJcbiAgICAgICAgZ2FtZV9vdmVyX2RlbGF5X21zOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgcGxheWVyOiB7XHJcbiAgICAgICAgc3RhcnRfeDogbnVtYmVyO1xyXG4gICAgICAgIHN0YXJ0X3k6IG51bWJlcjtcclxuICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIGltYWdlOiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgb2JzdGFjbGVzOiBBcnJheTx7XHJcbiAgICAgICAgbmFtZTogc3RyaW5nO1xyXG4gICAgICAgIGltYWdlX3RvcDogc3RyaW5nO1xyXG4gICAgICAgIGltYWdlX2JvdHRvbTogc3RyaW5nO1xyXG4gICAgfT47XHJcbiAgICB0ZXh0OiB7XHJcbiAgICAgICAgdGl0bGVfbWFpbjogc3RyaW5nO1xyXG4gICAgICAgIHRpdGxlX3N1Yjogc3RyaW5nO1xyXG4gICAgICAgIGluc3RydWN0aW9uc190aXRsZTogc3RyaW5nO1xyXG4gICAgICAgIGluc3RydWN0aW9uc19saW5lMTogc3RyaW5nO1xyXG4gICAgICAgIGluc3RydWN0aW9uc19saW5lMjogc3RyaW5nO1xyXG4gICAgICAgIGluc3RydWN0aW9uc19saW5lMzogc3RyaW5nO1xyXG4gICAgICAgIGluc3RydWN0aW9uc19jb250aW51ZTogc3RyaW5nO1xyXG4gICAgICAgIGdhbWVfb3Zlcl9tYWluOiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZV9vdmVyX3Njb3JlOiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZV9vdmVyX3Jlc3RhcnQ6IHN0cmluZztcclxuICAgIH07XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0+O1xyXG4gICAgICAgIHNvdW5kczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyOyB2b2x1bWU6IG51bWJlciB9PjtcclxuICAgIH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBMb2FkZWRJbWFnZUFzc2V0IHtcclxuICAgIGltZzogSFRNTEltYWdlRWxlbWVudDtcclxuICAgIHdpZHRoOiBudW1iZXI7IC8vIE9yaWdpbmFsIHdpZHRoIGZyb20gY29uZmlnXHJcbiAgICBoZWlnaHQ6IG51bWJlcjsgLy8gT3JpZ2luYWwgaGVpZ2h0IGZyb20gY29uZmlnXHJcbn1cclxuXHJcbmludGVyZmFjZSBMb2FkZWRTb3VuZEFzc2V0IHtcclxuICAgIGF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xyXG4gICAgdm9sdW1lOiBudW1iZXI7XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLFxyXG4gICAgSU5TVFJVQ1RJT05TLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUlxyXG59XHJcblxyXG5jbGFzcyBQbGF5ZXIge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgdmVsb2NpdHlZOiBudW1iZXI7XHJcbiAgICBpbWFnZU5hbWU6IHN0cmluZztcclxuICAgIGlzQWxpdmU6IGJvb2xlYW47XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBpbWFnZU5hbWU6IHN0cmluZywgaW5pdGlhbFZlbG9jaXR5WTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy54ID0geDtcclxuICAgICAgICB0aGlzLnkgPSB5O1xyXG4gICAgICAgIHRoaXMud2lkdGggPSB3aWR0aDtcclxuICAgICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuICAgICAgICB0aGlzLmltYWdlTmFtZSA9IGltYWdlTmFtZTtcclxuICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IGluaXRpYWxWZWxvY2l0eVk7XHJcbiAgICAgICAgdGhpcy5pc0FsaXZlID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBmbGFwKHN0cmVuZ3RoOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IHN0cmVuZ3RoO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShncmF2aXR5OiBudW1iZXIsIG1heEZhbGxTcGVlZDogbnVtYmVyLCBjYW52YXNIZWlnaHQ6IG51bWJlciwgYm91bmNlU3RyZW5ndGg6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMudmVsb2NpdHlZICs9IGdyYXZpdHk7XHJcbiAgICAgICAgaWYgKHRoaXMudmVsb2NpdHlZID4gbWF4RmFsbFNwZWVkKSB7XHJcbiAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZID0gbWF4RmFsbFNwZWVkO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnkgKz0gdGhpcy52ZWxvY2l0eVk7XHJcblxyXG4gICAgICAgIC8vIEtlZXAgcGxheWVyIHdpdGhpbiBjYW52YXMgYm91bmRzIChmbG9vciBhbmQgY2VpbGluZylcclxuICAgICAgICBpZiAodGhpcy55IDwgMCkge1xyXG4gICAgICAgICAgICB0aGlzLnkgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLnZlbG9jaXR5WSA9IDA7IC8vIFN0b3AgbW92ZW1lbnQgdXB3YXJkc1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy55ICsgdGhpcy5oZWlnaHQgPiBjYW52YXNIZWlnaHQpIHtcclxuICAgICAgICAgICAgdGhpcy55ID0gY2FudmFzSGVpZ2h0IC0gdGhpcy5oZWlnaHQ7XHJcbiAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZID0gYm91bmNlU3RyZW5ndGg7IC8vIEJvdW5jZSBvZmYgdGhlIGJvdHRvbVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgT2JzdGFjbGUge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgZ2FwWTogbnVtYmVyOyAvLyBUb3Agb2YgdGhlIGdhcFxyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGdhcEhlaWdodDogbnVtYmVyO1xyXG4gICAgaW1hZ2VUb3BOYW1lOiBzdHJpbmc7XHJcbiAgICBpbWFnZUJvdHRvbU5hbWU6IHN0cmluZztcclxuICAgIHNjb3JlZDogYm9vbGVhbjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih4OiBudW1iZXIsIGdhcFk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgZ2FwSGVpZ2h0OiBudW1iZXIsIGltYWdlVG9wTmFtZTogc3RyaW5nLCBpbWFnZUJvdHRvbU5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy5nYXBZID0gZ2FwWTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5nYXBIZWlnaHQgPSBnYXBIZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5pbWFnZVRvcE5hbWUgPSBpbWFnZVRvcE5hbWU7XHJcbiAgICAgICAgdGhpcy5pbWFnZUJvdHRvbU5hbWUgPSBpbWFnZUJvdHRvbU5hbWU7XHJcbiAgICAgICAgdGhpcy5zY29yZWQgPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoc3BlZWQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMueCAtPSBzcGVlZDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBBQUJCIGNvbGxpc2lvbiBkZXRlY3Rpb25cclxuICAgIGNvbGxpZGVzV2l0aChwbGF5ZXI6IFBsYXllcik6IGJvb2xlYW4ge1xyXG4gICAgICAgIC8vIENoZWNrIGZvciBob3Jpem9udGFsIG92ZXJsYXBcclxuICAgICAgICBjb25zdCBob3Jpem9udGFsT3ZlcmxhcCA9IHBsYXllci54IDwgdGhpcy54ICsgdGhpcy53aWR0aCAmJiBwbGF5ZXIueCArIHBsYXllci53aWR0aCA+IHRoaXMueDtcclxuXHJcbiAgICAgICAgaWYgKCFob3Jpem9udGFsT3ZlcmxhcCkgcmV0dXJuIGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBDb2xsaXNpb24gd2l0aCB0b3AgcGFydCBvZiB0aGUgb2JzdGFjbGUgKGFib3ZlIHRoZSBnYXApXHJcbiAgICAgICAgY29uc3QgdG9wT2JzdGFjbGVCb3R0b21ZID0gdGhpcy5nYXBZO1xyXG4gICAgICAgIGlmIChwbGF5ZXIueSA8IHRvcE9ic3RhY2xlQm90dG9tWSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENvbGxpc2lvbiB3aXRoIGJvdHRvbSBwYXJ0IG9mIHRoZSBvYnN0YWNsZSAoYmVsb3cgdGhlIGdhcClcclxuICAgICAgICBjb25zdCBib3R0b21PYnN0YWNsZVRvcFkgPSB0aGlzLmdhcFkgKyB0aGlzLmdhcEhlaWdodDtcclxuICAgICAgICBpZiAocGxheWVyLnkgKyBwbGF5ZXIuaGVpZ2h0ID4gYm90dG9tT2JzdGFjbGVUb3BZKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwcml2YXRlIGNvbmZpZzogR2FtZUNvbmZpZyB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBpbWFnZXM6IE1hcDxzdHJpbmcsIExvYWRlZEltYWdlQXNzZXQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIExvYWRlZFNvdW5kQXNzZXQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIHByaXZhdGUgcGxheWVyOiBQbGF5ZXIgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgb2JzdGFjbGVzOiBPYnN0YWNsZVtdID0gW107XHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBsYXN0T2JzdGFjbGVUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBsYXN0RnJhbWVUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBiYWNrZ3JvdW5kWDogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgYmdNdXNpYzogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBnYW1lT3ZlclRpbWVyOiBudW1iZXIgfCBudWxsID0gbnVsbDsgLy8gVGltZXIgdG8gZGVsYXkgZ2FtZSBvdmVyIHNjcmVlblxyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYENhbnZhcyB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmN0eC5pbWFnZVNtb290aGluZ0VuYWJsZWQgPSBmYWxzZTsgLy8gRm9yIHBpeGVsIGFydCBmZWVsXHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgaW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRDb25maWcoKTtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24uXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmNhbnZhcy53aWR0aDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmNvbmZpZy5jYW52YXMuaGVpZ2h0O1xyXG5cclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuICAgICAgICB0aGlzLnNldHVwSW5wdXQoKTtcclxuICAgICAgICB0aGlzLmJnTXVzaWMgPSB0aGlzLnNvdW5kcy5nZXQoXCJiZ19tdXNpY1wiKT8uYXVkaW8gfHwgbnVsbDtcclxuICAgICAgICBpZiAodGhpcy5iZ011c2ljKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdNdXNpYy5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5iZ011c2ljLnZvbHVtZSA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gXCJiZ19tdXNpY1wiKT8udm9sdW1lIHx8IDAuMztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBjb25maWc6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoYXNzZXQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBpbWcuc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbWFnZXMuc2V0KGFzc2V0Lm5hbWUsIHsgaW1nLCB3aWR0aDogYXNzZXQud2lkdGgsIGhlaWdodDogYXNzZXQuaGVpZ2h0IH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdCgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChhc3NldCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8uc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KGFzc2V0Lm5hbWUsIHsgYXVkaW8sIGR1cmF0aW9uX3NlY29uZHM6IGFzc2V0LmR1cmF0aW9uX3NlY29uZHMsIHZvbHVtZTogYXNzZXQudm9sdW1lIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke2Fzc2V0LnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkFsbCBhc3NldHMgbG9hZGVkLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwSW5wdXQoKTogdm9pZCB7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bi5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcblxyXG4gICAgICAgIGlmIChldmVudC5jb2RlID09PSAnU3BhY2UnKSB7XHJcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgcGFnZSBzY3JvbGxpbmdcclxuICAgICAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJnTXVzaWM/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoXCJCR00gcGxheSBmYWlsZWQ6XCIsIGUpKTsgLy8gU3RhcnQgQkdNXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnBsYXllciAmJiB0aGlzLnBsYXllci5pc0FsaXZlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmZsYXAodGhpcy5jb25maWcuZ2FtZS5wbGF5ZXJfZmxhcF9zdHJlbmd0aCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKFwiZmxhcF9zb3VuZFwiKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gT25seSBhbGxvdyByZXN0YXJ0IGFmdGVyIHRoZSBnYW1lIG92ZXIgZGVsYXkgaGFzIHBhc3NlZFxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLmdhbWVPdmVyVGltZXIgPT09IG51bGwpIHsgLy8gVGhpcyBjb25kaXRpb24gaXMgdHJ1ZSB3aGVuIGdhbWUgb3ZlciBzY3JlZW4gaXMgZnVsbHkgc2hvd25cclxuICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5iZ011c2ljPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiQkdNIHBsYXkgZmFpbGVkOlwiLCBlKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzZXRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybjtcclxuICAgICAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIoXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnBsYXllci5zdGFydF94LFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wbGF5ZXIuc3RhcnRfeSxcclxuICAgICAgICAgICAgdGhpcy5jb25maWcucGxheWVyLndpZHRoLFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wbGF5ZXIuaGVpZ2h0LFxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wbGF5ZXIuaW1hZ2UsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWUuaW5pdGlhbF9wbGF5ZXJfeV92ZWxvY2l0eVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5vYnN0YWNsZXMgPSBbXTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmxhc3RPYnN0YWNsZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICB0aGlzLmdhbWVPdmVyVGltZXIgPSBudWxsOyAvLyBDbGVhciB0aGUgdGltZXIgb24gcmVzZXRcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wKGN1cnJlbnRUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wKTogdm9pZCB7XHJcbiAgICAgICAgLy8gUHJldmVudCBsYXJnZSBkZWx0YSB0aW1lIG9uIHRhYiBzd2l0Y2ggZXRjLlxyXG4gICAgICAgIGlmICh0aGlzLmxhc3RGcmFtZVRpbWUgPT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gY3VycmVudFRpbWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0RnJhbWVUaW1lO1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5jb25maWcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3AuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5nYW1lU3RhdGUpIHtcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5wbGF5ZXIgfHwgIXRoaXMucGxheWVyLmlzQWxpdmUpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBQbGF5ZXIgaXMgbm90IGFsaXZlLCB0cmFuc2l0aW9uIHRvIEdBTUVfT1ZFUiBhZnRlciBhIGRlbGF5XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuZ2FtZU92ZXJUaW1lciA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmdhbWVPdmVyVGltZXIgPSBwZXJmb3JtYW5jZS5ub3coKSArIHRoaXMuY29uZmlnLmdhbWUuZ2FtZV9vdmVyX2RlbGF5X21zO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocGVyZm9ybWFuY2Uubm93KCkgPj0gdGhpcy5nYW1lT3ZlclRpbWVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5nYW1lT3ZlclRpbWVyID0gbnVsbDsgLy8gUmVzZXQgdGltZXJcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuYmdNdXNpYykgeyAvLyBTYWZlbHkgYWNjZXNzIGJnTXVzaWNcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYmdNdXNpYy5wYXVzZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5iZ011c2ljLmN1cnJlbnRUaW1lID0gMDsgLy8gUmVzZXQgQkdNXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBTdG9wIHVwZGF0aW5nIGdhbWUgZWxlbWVudHMgaWYgcGxheWVyIGlzIG5vdCBhbGl2ZVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIElmIHdlIHJlYWNoIGhlcmUsIHRoaXMucGxheWVyIGlzIGd1YXJhbnRlZWQgdG8gYmUgYSBQbGF5ZXIgb2JqZWN0IGFuZCBpc0FsaXZlIGlzIHRydWUuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50UGxheWVyID0gdGhpcy5wbGF5ZXI7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIHBsYXllclxyXG4gICAgICAgICAgICAgICAgY3VycmVudFBsYXllci51cGRhdGUodGhpcy5jb25maWcuZ2FtZS5ncmF2aXR5LCB0aGlzLmNvbmZpZy5nYW1lLnBsYXllcl9tYXhfZmFsbF9zcGVlZCwgdGhpcy5jYW52YXMuaGVpZ2h0LCB0aGlzLmNvbmZpZy5nYW1lLnBsYXllcl9ib3VuY2Vfc3RyZW5ndGgpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBvYnN0YWNsZXNcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5vYnN0YWNsZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBvYnN0YWNsZSA9IHRoaXMub2JzdGFjbGVzW2ldO1xyXG4gICAgICAgICAgICAgICAgICAgIG9ic3RhY2xlLnVwZGF0ZSh0aGlzLmNvbmZpZy5nYW1lLm9ic3RhY2xlX3NwZWVkKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGNvbGxpc2lvblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChvYnN0YWNsZS5jb2xsaWRlc1dpdGgoY3VycmVudFBsYXllcikpIHsgLy8gRml4OiBjb2xsaWRlc1dpdGggaXMgb24gT2JzdGFjbGUsIG5vdCBQbGF5ZXJcclxuICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFBsYXllci5pc0FsaXZlID0gZmFsc2U7IC8vIEZpeDogcGxheWVyIGlzIGd1YXJhbnRlZWQgbm9uLW51bGwgaGVyZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZChcImhpdF9zb3VuZFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7IC8vIFN0b3AgY2hlY2tpbmcgY29sbGlzaW9ucyBpZiBwbGF5ZXIgaGl0XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3Igc2NvcmluZ1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghb2JzdGFjbGUuc2NvcmVkICYmIG9ic3RhY2xlLnggKyBvYnN0YWNsZS53aWR0aCA8IGN1cnJlbnRQbGF5ZXIueCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlKys7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG9ic3RhY2xlLnNjb3JlZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBvZmYtc2NyZWVuIG9ic3RhY2xlc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vYnN0YWNsZXMgPSB0aGlzLm9ic3RhY2xlcy5maWx0ZXIob2JzdGFjbGUgPT4gb2JzdGFjbGUueCArIG9ic3RhY2xlLndpZHRoID4gMCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gR2VuZXJhdGUgbmV3IG9ic3RhY2xlc1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgbm93ID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgICAgICBpZiAobm93IC0gdGhpcy5sYXN0T2JzdGFjbGVUaW1lID4gdGhpcy5nZXRSYW5kb21PYnN0YWNsZUludGVydmFsKCkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZE9ic3RhY2xlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXN0T2JzdGFjbGVUaW1lID0gbm93O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgYmFja2dyb3VuZCBzY3JvbGxcclxuICAgICAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZFggPSAodGhpcy5iYWNrZ3JvdW5kWCAtIHRoaXMuY29uZmlnLmdhbWUuYmFja2dyb3VuZF9zY3JvbGxfc3BlZWQpICUgdGhpcy5jb25maWcuY2FudmFzLndpZHRoO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYmFja2dyb3VuZFggPCAtdGhpcy5jb25maWcuY2FudmFzLndpZHRoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kWCArPSB0aGlzLmNvbmZpZy5jYW52YXMud2lkdGg7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgLy8gTm8gdXBkYXRlIGxvZ2ljIGZvciB0aGVzZSBzdGF0ZXMsIGp1c3Qgd2FpdGluZyBmb3IgaW5wdXRcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldFJhbmRvbU9ic3RhY2xlSW50ZXJ2YWwoKTogbnVtYmVyIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm4gMDtcclxuICAgICAgICByZXR1cm4gTWF0aC5yYW5kb20oKSAqICh0aGlzLmNvbmZpZy5nYW1lLm9ic3RhY2xlX2ludGVydmFsX21heCAtIHRoaXMuY29uZmlnLmdhbWUub2JzdGFjbGVfaW50ZXJ2YWxfbWluKSArIHRoaXMuY29uZmlnLmdhbWUub2JzdGFjbGVfaW50ZXJ2YWxfbWluO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYWRkT2JzdGFjbGUoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBtaW5HYXBZID0gNTA7IC8vIE1pbmltdW0gZGlzdGFuY2UgZnJvbSB0b3Agb2YgY2FudmFzXHJcbiAgICAgICAgY29uc3QgbWF4R2FwWSA9IHRoaXMuY2FudmFzLmhlaWdodCAtIHRoaXMuY29uZmlnLmdhbWUub2JzdGFjbGVfZ2FwX2hlaWdodCAtIDUwOyAvLyBNYXhpbXVtIGRpc3RhbmNlIGZyb20gYm90dG9tIG9mIGNhbnZhc1xyXG4gICAgICAgIGNvbnN0IGdhcFkgPSBNYXRoLnJhbmRvbSgpICogKG1heEdhcFkgLSBtaW5HYXBZKSArIG1pbkdhcFk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJhbmRvbU9ic3RhY2xlVHlwZSA9IHRoaXMuY29uZmlnLm9ic3RhY2xlc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5vYnN0YWNsZXMubGVuZ3RoKV07XHJcblxyXG4gICAgICAgIHRoaXMub2JzdGFjbGVzLnB1c2gobmV3IE9ic3RhY2xlKFxyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCxcclxuICAgICAgICAgICAgZ2FwWSwgLy8gZ2FwWSBpcyB0aGUgWSBjb29yZGluYXRlIG9mIHRoZSB0b3AgZWRnZSBvZiB0aGUgZ2FwXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWUub2JzdGFjbGVfd2lkdGgsXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWUub2JzdGFjbGVfZ2FwX2hlaWdodCxcclxuICAgICAgICAgICAgcmFuZG9tT2JzdGFjbGVUeXBlLmltYWdlX3RvcCxcclxuICAgICAgICAgICAgcmFuZG9tT2JzdGFjbGVUeXBlLmltYWdlX2JvdHRvbVxyXG4gICAgICAgICkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICAvLyBEcmF3IHNjcm9sbGluZyBiYWNrZ3JvdW5kXHJcbiAgICAgICAgdGhpcy5kcmF3T2JqZWN0KFwiYmFja2dyb3VuZF9vY2VhblwiLCB0aGlzLmJhY2tncm91bmRYLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB0aGlzLmRyYXdPYmplY3QoXCJiYWNrZ3JvdW5kX29jZWFuXCIsIHRoaXMuYmFja2dyb3VuZFggKyB0aGlzLmNhbnZhcy53aWR0aCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmNvbmZpZy50ZXh0LnRpdGxlX21haW4sIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwLCAnNTBweCBzZXJpZicsICd3aGl0ZScpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmNvbmZpZy50ZXh0LnRpdGxlX3N1YiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjAsICcyMHB4IHNlcmlmJywgJ3doaXRlJyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmNvbmZpZy50ZXh0Lmluc3RydWN0aW9uc190aXRsZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMTAwLCAnNDBweCBzZXJpZicsICd3aGl0ZScpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmNvbmZpZy50ZXh0Lmluc3RydWN0aW9uc19saW5lMSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gNDAsICcyNXB4IHNlcmlmJywgJ3doaXRlJyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuY29uZmlnLnRleHQuaW5zdHJ1Y3Rpb25zX2xpbmUyLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIsICcyNXB4IHNlcmlmJywgJ3doaXRlJyk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRoaXMuY29uZmlnLnRleHQuaW5zdHJ1Y3Rpb25zX2xpbmUzLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA0MCwgJzI1cHggc2VyaWYnLCAnd2hpdGUnKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RleHQodGhpcy5jb25maWcudGV4dC5pbnN0cnVjdGlvbnNfY29udGludWUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDEwMCwgJzIwcHggc2VyaWYnLCAnd2hpdGUnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6IC8vIFJlbmRlciBnYW1lIGVsZW1lbnRzIGV2ZW4gaWYgZ2FtZSBvdmVyXHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IHBsYXllclxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyICYmIHRoaXMucGxheWVyLmlzQWxpdmUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdPYmplY3QodGhpcy5wbGF5ZXIuaW1hZ2VOYW1lLCB0aGlzLnBsYXllci54LCB0aGlzLnBsYXllci55LCB0aGlzLnBsYXllci53aWR0aCwgdGhpcy5wbGF5ZXIuaGVpZ2h0KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5wbGF5ZXIgJiYgIXRoaXMucGxheWVyLmlzQWxpdmUgJiYgdGhpcy5nYW1lT3ZlclRpbWVyICE9PSBudWxsICYmIHBlcmZvcm1hbmNlLm5vdygpIDwgdGhpcy5nYW1lT3ZlclRpbWVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgcGxheWVyIGp1c3QgZGllZCwgZHJhdyB0aGVtIHNsaWdodGx5IHJvdGF0ZWQgYXMgaWYgZmFsbGluZ1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LnNhdmUoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN0eC50cmFuc2xhdGUodGhpcy5wbGF5ZXIueCArIHRoaXMucGxheWVyLndpZHRoIC8gMiwgdGhpcy5wbGF5ZXIueSArIHRoaXMucGxheWVyLmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LnJvdGF0ZShNYXRoLlBJIC8gNCk7IC8vIFJvdGF0ZSA0NSBkZWdyZWVzXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3T2JqZWN0KHRoaXMucGxheWVyLmltYWdlTmFtZSwgLXRoaXMucGxheWVyLndpZHRoIC8gMiwgLXRoaXMucGxheWVyLmhlaWdodCAvIDIsIHRoaXMucGxheWVyLndpZHRoLCB0aGlzLnBsYXllci5oZWlnaHQpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY3R4LnJlc3RvcmUoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IG9ic3RhY2xlc1xyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBvYnN0YWNsZSBvZiB0aGlzLm9ic3RhY2xlcykge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRvcCBwYXJ0IG9mIG9ic3RhY2xlOiBkcmF3biBmcm9tIHRvcCBvZiBjYW52YXMgdG8gZ2FwWVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhd09iamVjdChvYnN0YWNsZS5pbWFnZVRvcE5hbWUsIG9ic3RhY2xlLngsIDAsIG9ic3RhY2xlLndpZHRoLCBvYnN0YWNsZS5nYXBZKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBCb3R0b20gcGFydCBvZiBvYnN0YWNsZTogZHJhd24gZnJvbSBnYXBZICsgZ2FwSGVpZ2h0IHRvIGJvdHRvbSBvZiBjYW52YXNcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYXdPYmplY3Qob2JzdGFjbGUuaW1hZ2VCb3R0b21OYW1lLCBvYnN0YWNsZS54LCBvYnN0YWNsZS5nYXBZICsgb2JzdGFjbGUuZ2FwSGVpZ2h0LCBvYnN0YWNsZS53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0IC0gKG9ic3RhY2xlLmdhcFkgKyBvYnN0YWNsZS5nYXBIZWlnaHQpKTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBEcmF3IHNjb3JlXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KGBTY29yZTogJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgNTAsICczMHB4IHNlcmlmJywgJ3doaXRlJyk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ3JnYmEoMCwgMCwgMCwgMC41KSc7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmNvbmZpZy50ZXh0LmdhbWVfb3Zlcl9tYWluLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgJzUwcHggc2VyaWYnLCAncmVkJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChgJHt0aGlzLmNvbmZpZy50ZXh0LmdhbWVfb3Zlcl9zY29yZX0ke3RoaXMuc2NvcmV9YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjAsICczMHB4IHNlcmlmJywgJ3doaXRlJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kcmF3VGV4dCh0aGlzLmNvbmZpZy50ZXh0LmdhbWVfb3Zlcl9yZXN0YXJ0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA3MCwgJzIwcHggc2VyaWYnLCAnd2hpdGUnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdPYmplY3QoaW1hZ2VOYW1lOiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGFzc2V0ID0gdGhpcy5pbWFnZXMuZ2V0KGltYWdlTmFtZSk7XHJcbiAgICAgICAgaWYgKGFzc2V0KSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShhc3NldC5pbWcsIHgsIHksIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrIGZvciBtaXNzaW5nIGltYWdlcyAoZHJhdyBhIGNvbG9yZWQgcmVjdGFuZ2xlKVxyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYEltYWdlIGFzc2V0ICcke2ltYWdlTmFtZX0nIG5vdCBmb3VuZC4gRHJhd2luZyBwbGFjZWhvbGRlci5gKTtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJ21hZ2VudGEnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCh4LCB5LCB3aWR0aCwgaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGV4dCh0ZXh0OiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBmb250OiBzdHJpbmcsIGNvbG9yOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gZm9udDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0ZXh0LCB4LCB5KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChzb3VuZE5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHNvdW5kQXNzZXQgPSB0aGlzLnNvdW5kcy5nZXQoc291bmROYW1lKTtcclxuICAgICAgICBpZiAoc291bmRBc3NldCkge1xyXG4gICAgICAgICAgICAvLyBDcmVhdGUgYSBuZXcgQXVkaW8gb2JqZWN0IHRvIGFsbG93IG11bHRpcGxlIHNpbXVsdGFuZW91cyBwbGF5cyBmb3Igc291bmQgZWZmZWN0c1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhzb3VuZEFzc2V0LmF1ZGlvLnNyYyk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kQXNzZXQudm9sdW1lO1xyXG4gICAgICAgICAgICBhdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKGBTb3VuZCBwbGF5IGZhaWxlZCBmb3IgJHtzb3VuZE5hbWV9OmAsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEdsb2JhbCBpbnN0YW5jZSB0byBzdGFydCB0aGUgZ2FtZVxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xyXG4gICAgY29uc3QgZ2FtZSA9IG5ldyBHYW1lKCdnYW1lQ2FudmFzJyk7XHJcbiAgICBnYW1lLmluaXQoKTtcclxufSk7XHJcbiJdLAog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
