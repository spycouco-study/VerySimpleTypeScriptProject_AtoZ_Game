var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE_SCREEN"] = 0] = "TITLE_SCREEN";
  GameState2[GameState2["INSTRUCTIONS_SCREEN"] = 1] = "INSTRUCTIONS_SCREEN";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class Game {
  constructor(canvasId) {
    // Temporary storage for asset definitions from JSON
    this.gameState = 0 /* TITLE_SCREEN */;
    // Game state variables
    this.score = 0;
    this.combo = 0;
    this.health = 0;
    this.notes = [];
    this.pressedKeys = /* @__PURE__ */ new Set();
    this.lastFrameTime = 0;
    this.beatmapCurrentNoteIndex = 0;
    this.gameStartTime = 0;
    this.bgmAudio = null;
    this.hitEffectParticles = [];
    this.handleKeyDown = (event) => {
      if (!this.pressedKeys.has(event.code)) {
        this.pressedKeys.add(event.code);
        this.handlePlayerInput(event.code);
      }
    };
    this.handleKeyUp = (event) => {
      this.pressedKeys.delete(event.code);
    };
    this.handleClick = (event) => {
      this.playSound("sfx_button");
      if (this.gameState === 0 /* TITLE_SCREEN */) {
        this.gameState = 1 /* INSTRUCTIONS_SCREEN */;
      } else if (this.gameState === 1 /* INSTRUCTIONS_SCREEN */) {
        this.startGame();
      } else if (this.gameState === 3 /* GAME_OVER */) {
        this.gameState = 0 /* TITLE_SCREEN */;
      }
    };
    this.gameLoop = (currentTime) => {
      const deltaTime = (currentTime - this.lastFrameTime) / 1e3;
      this.lastFrameTime = currentTime;
      this.update(deltaTime);
      this.draw();
      requestAnimationFrame(this.gameLoop);
    };
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas with ID '${canvasId}' not found.`);
      return;
    }
    this.ctx = this.canvas.getContext("2d");
    this.assets = { images: {}, sounds: {} };
    this.canvas.width = 1280;
    this.canvas.height = 720;
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("click", this.handleClick);
  }
  async init() {
    await this.loadConfig();
    await this.loadAssets();
    this.resetGame();
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.gameLoop);
  }
  async loadConfig() {
    const response = await fetch("data.json");
    const rawData = await response.json();
    this.config = rawData.config;
    this.beatmap = rawData.beatmap;
    this.assetConfigs = rawData.assets;
    this.canvas.width = this.config.canvasWidth;
    this.canvas.height = this.config.canvasHeight;
  }
  async loadAssets() {
    const imagePromises = this.assetConfigs.images.map((assetConfig) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = assetConfig.path;
        img.onload = () => {
          const loadedAsset = { ...assetConfig, img };
          this.assets.images[assetConfig.name] = loadedAsset;
          resolve();
        };
        img.onerror = () => {
          console.error(`Failed to load image: ${assetConfig.path}`);
          reject();
        };
      });
    });
    const soundPromises = this.assetConfigs.sounds.map((assetConfig) => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = assetConfig.path;
        audio.volume = assetConfig.volume;
        audio.oncanplaythrough = () => {
          const loadedAsset = { ...assetConfig, audio };
          this.assets.sounds[assetConfig.name] = loadedAsset;
          resolve();
        };
        audio.onerror = () => {
          console.error(`Failed to load sound: ${assetConfig.path}`);
          reject();
        };
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  resetGame() {
    this.score = 0;
    this.combo = 0;
    this.health = this.config.initialHealth;
    this.notes = [];
    this.beatmapCurrentNoteIndex = 0;
    this.pressedKeys.clear();
    this.gameStartTime = 0;
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
    this.hitEffectParticles = [];
  }
  startGame() {
    this.resetGame();
    this.gameState = 2 /* PLAYING */;
    this.gameStartTime = performance.now();
    const bgmAsset = this.assets.sounds[this.beatmap.bgmSound];
    if (bgmAsset && bgmAsset.audio) {
      this.bgmAudio = bgmAsset.audio;
      this.bgmAudio.loop = false;
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.play().catch((e) => console.error("BGM playback failed:", e));
    }
  }
  playSound(name) {
    const soundAsset = this.assets.sounds[name];
    if (soundAsset && soundAsset.audio) {
      const audio = soundAsset.audio.cloneNode();
      audio.volume = soundAsset.audio.volume;
      audio.play().catch((e) => console.warn(`Sound playback failed for ${name}:`, e));
    }
  }
  handlePlayerInput(keyCode) {
    if (this.gameState !== 2 /* PLAYING */) return;
    const laneIndex = this.config.keyBindings.indexOf(keyCode);
    if (laneIndex === -1) return;
    let bestNoteIndex = -1;
    let minDistance = Infinity;
    for (let i = 0; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.lane === laneIndex && !note.hit) {
        const noteCenterY = note.y + note.height / 2;
        const hitZoneCenterY = this.config.hitZoneY + this.config.hitZoneHeight / 2;
        const distance = Math.abs(noteCenterY - hitZoneCenterY);
        if (distance <= this.config.hitTolerance && distance < minDistance) {
          bestNoteIndex = i;
          minDistance = distance;
        }
      }
    }
    if (bestNoteIndex !== -1) {
      const note = this.notes[bestNoteIndex];
      note.hit = true;
      this.notes.splice(bestNoteIndex, 1);
      let feedbackColor = "";
      let scoreToAdd = 0;
      let healthChange = this.config.healthGainOnHit;
      if (minDistance <= this.config.perfectTimingThreshold) {
        scoreToAdd = this.config.scorePerHit + this.config.perfectBonus;
        this.combo++;
        feedbackColor = this.config.perfectColor;
      } else if (minDistance <= this.config.goodTimingThreshold) {
        scoreToAdd = this.config.scorePerHit;
        this.combo++;
        feedbackColor = this.config.goodColor;
      } else {
        scoreToAdd = Math.floor(this.config.scorePerHit / 2);
        this.combo++;
        feedbackColor = this.config.goodColor;
      }
      this.score += scoreToAdd;
      this.health = Math.min(this.config.initialHealth, this.health + healthChange);
      this.playSound("sfx_hit");
      this.spawnParticles("perfect_effect", note.x + note.width / 2, note.y + note.height / 2, feedbackColor);
    } else {
      this.combo = 0;
      this.health = Math.max(0, this.health + this.config.healthPenaltyOnMiss);
      this.playSound("sfx_miss");
    }
  }
  spawnParticles(imageName, x, y, color) {
    const particleCount = 5;
    const particleImage = this.assets.images[imageName]?.img || null;
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.hitEffectParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 3 - 1,
        // Upwards bias
        life: 45 + Math.random() * 15,
        // frames
        color,
        image: particleImage,
        size: Math.random() * 10 + 15
        // Larger particles
      });
    }
  }
  update(deltaTime) {
    if (this.gameState === 2 /* PLAYING */) {
      const elapsedTime = performance.now() - this.gameStartTime;
      while (this.beatmapCurrentNoteIndex < this.beatmap.notes.length) {
        const noteData = this.beatmap.notes[this.beatmapCurrentNoteIndex];
        const noteHitTimeMs = noteData[0] + this.beatmap.offset;
        if (elapsedTime >= noteHitTimeMs - this.config.noteFallDurationMs) {
          const laneIndex = noteData[1];
          const noteImageName = this.config.noteImageNames[Math.floor(Math.random() * this.config.noteImageNames.length)];
          const imageAsset = this.assets.images[noteImageName];
          if (imageAsset) {
            const laneX = this.config.laneStartX + laneIndex * (this.config.laneWidth + this.config.laneGap);
            const noteWidth = this.config.noteWidth;
            const noteHeight = this.config.noteHeight;
            this.notes.push({
              x: laneX + (this.config.laneWidth - noteWidth) / 2,
              // Center note in lane
              y: -noteHeight,
              // Start above the screen
              width: noteWidth,
              height: noteHeight,
              lane: laneIndex,
              startTime: noteHitTimeMs,
              image: imageAsset.img,
              hit: false
            });
          }
          this.beatmapCurrentNoteIndex++;
        } else {
          break;
        }
      }
      for (let i = this.notes.length - 1; i >= 0; i--) {
        const note = this.notes[i];
        const timeSinceSpawn = elapsedTime - (note.startTime - this.config.noteFallDurationMs);
        if (timeSinceSpawn < 0) continue;
        const progress = timeSinceSpawn / this.config.noteFallDurationMs;
        const targetNoteTopYAtHit = this.config.hitZoneY + this.config.hitZoneHeight / 2 - note.height / 2;
        note.y = -note.height + progress * (targetNoteTopYAtHit + note.height);
        if (!note.hit && note.y > this.config.hitZoneY + this.config.hitZoneHeight + this.config.noteMissOffset) {
          this.notes.splice(i, 1);
          this.combo = 0;
          this.health = Math.max(0, this.health + this.config.healthPenaltyOnMiss);
          this.playSound("sfx_miss");
        }
      }
      for (let i = this.hitEffectParticles.length - 1; i >= 0; i--) {
        const p = this.hitEffectParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life--;
        if (p.life <= 0) {
          this.hitEffectParticles.splice(i, 1);
        }
      }
      if (this.health <= 0) {
        this.gameState = 3 /* GAME_OVER */;
        if (this.bgmAudio) {
          this.bgmAudio.pause();
        }
      } else if (this.beatmapCurrentNoteIndex >= this.beatmap.notes.length && this.notes.length === 0) {
        this.gameState = 3 /* GAME_OVER */;
        if (this.bgmAudio) {
          this.bgmAudio.pause();
        }
      }
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const bgImage = this.assets.images["background"]?.img;
    if (bgImage) {
      this.ctx.drawImage(bgImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = this.config.backgroundColor;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    switch (this.gameState) {
      case 0 /* TITLE_SCREEN */:
        this.drawTitleScreen();
        break;
      case 1 /* INSTRUCTIONS_SCREEN */:
        this.drawInstructionsScreen();
        break;
      case 2 /* PLAYING */:
        this.drawPlayingScreen();
        break;
      case 3 /* GAME_OVER */:
        this.drawGameOverScreen();
        break;
    }
  }
  drawTitleScreen() {
    this.ctx.fillStyle = this.config.textColor;
    this.ctx.font = "bold 48px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.titleScreen.title, this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.config.titleScreen.startButtonText, this.canvas.width / 2, this.canvas.height / 2 + 50);
  }
  drawInstructionsScreen() {
    this.ctx.fillStyle = this.config.textColor;
    this.ctx.font = "bold 36px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.instructionScreen.title, this.canvas.width / 2, this.canvas.height / 4);
    this.ctx.font = "24px sans-serif";
    const lineHeight = 30;
    let y = this.canvas.height / 3;
    this.config.instructionScreen.instructions.forEach((line) => {
      this.ctx.fillText(line, this.canvas.width / 2, y);
      y += lineHeight;
    });
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.config.instructionScreen.continueButtonText, this.canvas.width / 2, this.canvas.height - 100);
  }
  drawPlayingScreen() {
    for (let i = 0; i < this.config.numLanes; i++) {
      const laneX = this.config.laneStartX + i * (this.config.laneWidth + this.config.laneGap);
      const indicatorImage = this.assets.images["hit_indicator"]?.img;
      if (indicatorImage) {
        this.ctx.drawImage(
          indicatorImage,
          laneX,
          this.config.hitZoneY,
          this.config.laneWidth,
          this.config.hitZoneHeight
        );
      } else {
        this.ctx.fillStyle = this.config.hitZoneColor;
        this.ctx.fillRect(laneX, this.config.hitZoneY, this.config.laneWidth, this.config.hitZoneHeight);
      }
      this.ctx.strokeStyle = "#555555";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(laneX, 0);
      this.ctx.lineTo(laneX, this.canvas.height);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(laneX + this.config.laneWidth, 0);
      this.ctx.lineTo(laneX + this.config.laneWidth, this.canvas.height);
      this.ctx.stroke();
    }
    this.notes.forEach((note) => {
      if (note.image) {
        this.ctx.drawImage(note.image, note.x, note.y, note.width, note.height);
      } else {
        this.ctx.fillStyle = "#f00";
        this.ctx.fillRect(note.x, note.y, note.width, note.height);
      }
    });
    this.hitEffectParticles.forEach((p) => {
      if (p.image) {
        this.ctx.globalAlpha = p.life / 60;
        this.ctx.drawImage(p.image, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        this.ctx.globalAlpha = 1;
      } else {
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = p.life / 60;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      }
    });
    this.ctx.fillStyle = this.config.textColor;
    this.ctx.font = "24px sans-serif";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`\uC810\uC218: ${this.score}`, 20, 40);
    this.ctx.fillText(`\uCF64\uBCF4: ${this.combo}`, 20, 70);
    const healthBarWidth = 200;
    const healthBarHeight = 20;
    const healthBarX = this.canvas.width - healthBarWidth - 20;
    const healthBarY = 30;
    this.ctx.fillStyle = "#555";
    this.ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
    const healthRatio = this.health / this.config.initialHealth;
    const hue = healthRatio * 120;
    this.ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    this.ctx.fillRect(healthBarX, healthBarY, healthRatio * healthBarWidth, healthBarHeight);
    this.ctx.strokeStyle = "#fff";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
  }
  drawGameOverScreen() {
    this.ctx.fillStyle = this.config.textColor;
    this.ctx.font = "bold 48px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.config.gameOverScreen.title, this.canvas.width / 2, this.canvas.height / 2 - 100);
    this.ctx.font = "36px sans-serif";
    this.ctx.fillText(`\uCD5C\uC885 \uC810\uC218: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2);
    this.ctx.fillText(`\uCD5C\uACE0 \uCF64\uBCF4: ${this.combo}`, this.canvas.width / 2, this.canvas.height / 2 + 50);
    this.ctx.font = "24px sans-serif";
    this.ctx.fillText(this.config.gameOverScreen.restartButtonText, this.canvas.width / 2, this.canvas.height / 2 + 150);
  }
}
window.onload = () => {
  const game = new Game("gameCanvas");
  game.init();
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlQXNzZXRDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRDb25maWdbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldENvbmZpZ1tdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQmVhdG1hcENvbmZpZyB7XHJcbiAgICBzb25nTmFtZTogc3RyaW5nO1xyXG4gICAgYnBtOiBudW1iZXI7XHJcbiAgICBvZmZzZXQ6IG51bWJlcjsgLy8gR2xvYmFsIG9mZnNldCBmb3IgYmVhdG1hcCBpbiBtaWxsaXNlY29uZHNcclxuICAgIGJnbVNvdW5kOiBzdHJpbmc7IC8vIE5hbWUgb2YgdGhlIHNvdW5kIGFzc2V0IGZvciBCR01cclxuICAgIG5vdGVzOiBbbnVtYmVyLCBudW1iZXJdW107IC8vIEFycmF5IG9mIFt0aW1lX21zX2Zyb21fZ2FtZV9zdGFydF90b19oaXQsIGxhbmVfaW5kZXhdXHJcbn1cclxuXHJcbmludGVyZmFjZSBUaXRsZVNjcmVlbkNvbmZpZyB7XHJcbiAgICB0aXRsZTogc3RyaW5nO1xyXG4gICAgc3RhcnRCdXR0b25UZXh0OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBJbnN0cnVjdGlvblNjcmVlbkNvbmZpZyB7XHJcbiAgICB0aXRsZTogc3RyaW5nO1xyXG4gICAgaW5zdHJ1Y3Rpb25zOiBzdHJpbmdbXTtcclxuICAgIGNvbnRpbnVlQnV0dG9uVGV4dDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZU92ZXJTY3JlZW5Db25maWcge1xyXG4gICAgdGl0bGU6IHN0cmluZztcclxuICAgIHJlc3RhcnRCdXR0b25UZXh0OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnRGF0YSB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZztcclxuICAgIHRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgdGl0bGVTY3JlZW46IFRpdGxlU2NyZWVuQ29uZmlnO1xyXG4gICAgaW5zdHJ1Y3Rpb25TY3JlZW46IEluc3RydWN0aW9uU2NyZWVuQ29uZmlnO1xyXG4gICAgZ2FtZU92ZXJTY3JlZW46IEdhbWVPdmVyU2NyZWVuQ29uZmlnO1xyXG4gICAgbm90ZVNwZWVkOiBudW1iZXI7IC8vIE5vdCBkaXJlY3RseSB1c2VkIHdpdGggbm90ZUZhbGxEdXJhdGlvbk1zIGZvciBub3RlIHBvc2l0aW9uLCBidXQgZm9yIGNvbnRleHRcclxuICAgIGluaXRpYWxIZWFsdGg6IG51bWJlcjtcclxuICAgIGhlYWx0aFBlbmFsdHlPbk1pc3M6IG51bWJlcjsgLy8gTmVnYXRpdmUgdmFsdWUgZm9yIG1pc3Nlcy9hdXRvLW1pc3Nlc1xyXG4gICAgaGVhbHRoR2Fpbk9uSGl0OiBudW1iZXI7IC8vIFBvc2l0aXZlIHZhbHVlIGZvciBoaXRzXHJcbiAgICBoaXRab25lWTogbnVtYmVyOyAvLyBZLWNvb3JkaW5hdGUgb2YgdGhlIHRvcCBvZiB0aGUgaGl0IHpvbmVcclxuICAgIGhpdFpvbmVIZWlnaHQ6IG51bWJlcjtcclxuICAgIGhpdFpvbmVDb2xvcjogc3RyaW5nOyAvLyBDb2xvciBmb3IgaGl0IHpvbmUgZmFsbGJhY2tcclxuICAgIGhpdFRvbGVyYW5jZTogbnVtYmVyOyAvLyBNYXggcGl4ZWwgZGlzdGFuY2UgZnJvbSBub3RlIGNlbnRlciB0byBoaXQgem9uZSBjZW50ZXIgZm9yIGFueSBoaXRcclxuICAgIHBlcmZlY3RUaW1pbmdUaHJlc2hvbGQ6IG51bWJlcjsgLy8gTWF4IHBpeGVsIGRpc3RhbmNlIGZvciAnUEVSRkVDVCcgaGl0XHJcbiAgICBnb29kVGltaW5nVGhyZXNob2xkOiBudW1iZXI7IC8vIE1heCBwaXhlbCBkaXN0YW5jZSBmb3IgJ0dPT0QnIGhpdFxyXG4gICAgbm90ZU1pc3NPZmZzZXQ6IG51bWJlcjsgLy8gSG93IGZhciBiZWxvdyBoaXQgem9uZSBhIG5vdGUgY2FuIGdvIGJlZm9yZSBpdCdzIGFuIGF1dG8tbWlzc1xyXG4gICAgbnVtTGFuZXM6IG51bWJlcjtcclxuICAgIGxhbmVXaWR0aDogbnVtYmVyO1xyXG4gICAgbGFuZUdhcDogbnVtYmVyO1xyXG4gICAgbGFuZVN0YXJ0WDogbnVtYmVyOyAvLyBYLWNvb3JkaW5hdGUgb2YgdGhlIGZpcnN0IGxhbmVcclxuICAgIG5vdGVXaWR0aDogbnVtYmVyOyAvLyBDb25maWd1cmVkIHdpZHRoIGZvciBub3Rlcywgb3ZlcnJpZGluZyBpbWFnZSB3aWR0aFxyXG4gICAgbm90ZUhlaWdodDogbnVtYmVyOyAvLyBDb25maWd1cmVkIGhlaWdodCBmb3Igbm90ZXMsIG92ZXJyaWRpbmcgaW1hZ2UgaGVpZ2h0XHJcbiAgICBub3RlSW1hZ2VOYW1lczogc3RyaW5nW107IC8vIE5hbWVzIG9mIGltYWdlIGFzc2V0cyB0byB1c2UgZm9yIG5vdGVzXHJcbiAgICBrZXlCaW5kaW5nczogc3RyaW5nW107IC8vIEFycmF5IG9mIGtleWJvYXJkIGV2ZW50LmNvZGUgZm9yIGVhY2ggbGFuZVxyXG4gICAgc2NvcmVQZXJIaXQ6IG51bWJlcjtcclxuICAgIHBlcmZlY3RCb251czogbnVtYmVyO1xyXG4gICAgbm90ZUZhbGxEdXJhdGlvbk1zOiBudW1iZXI7IC8vIFRpbWUgaW4gbWlsbGlzZWNvbmRzIGZvciBhIG5vdGUgdG8gZmFsbCBmcm9tIHNwYXduIHBvaW50IHRvIGhpdCB6b25lIGNlbnRlclxyXG4gICAgcGVyZmVjdENvbG9yOiBzdHJpbmc7XHJcbiAgICBnb29kQ29sb3I6IHN0cmluZztcclxufVxyXG5cclxuLy8gU3RydWN0dXJlIGZvciBkYXRhLmpzb24gcm9vdFxyXG5pbnRlcmZhY2UgUmF3R2FtZURhdGEge1xyXG4gICAgY29uZmlnOiBHYW1lQ29uZmlnRGF0YTtcclxuICAgIGFzc2V0czogQXNzZXRzQ29uZmlnO1xyXG4gICAgYmVhdG1hcDogQmVhdG1hcENvbmZpZztcclxufVxyXG5cclxuaW50ZXJmYWNlIExvYWRlZEltYWdlQXNzZXQgZXh0ZW5kcyBJbWFnZUFzc2V0Q29uZmlnIHtcclxuICAgIGltZzogSFRNTEltYWdlRWxlbWVudDtcclxufVxyXG5cclxuaW50ZXJmYWNlIExvYWRlZFNvdW5kQXNzZXQgZXh0ZW5kcyBTb3VuZEFzc2V0Q29uZmlnIHtcclxuICAgIGF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRV9TQ1JFRU4sXHJcbiAgICBJTlNUUlVDVElPTlNfU0NSRUVOLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUlxyXG59XHJcblxyXG5pbnRlcmZhY2UgTm90ZSB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyOyAvLyBOb3cgY29tZXMgZnJvbSBjb25maWdcclxuICAgIGhlaWdodDogbnVtYmVyOyAvLyBOb3cgY29tZXMgZnJvbSBjb25maWdcclxuICAgIGxhbmU6IG51bWJlcjtcclxuICAgIHN0YXJ0VGltZTogbnVtYmVyOyAvLyBUaGUgZXhhY3QgdGltZSAobXMgZnJvbSBnYW1lIHN0YXJ0KSB0aGlzIG5vdGUgc2hvdWxkIGJlIGhpdFxyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBoaXQ6IGJvb2xlYW47IC8vIFRydWUgaWYgcGxheWVyIGhhcyBzdWNjZXNzZnVsbHkgaGl0IHRoaXMgbm90ZVxyXG59XHJcblxyXG5pbnRlcmZhY2UgUGFydGljbGUge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgdng6IG51bWJlcjtcclxuICAgIHZ5OiBudW1iZXI7XHJcbiAgICBsaWZlOiBudW1iZXI7IC8vIGZyYW1lc1xyXG4gICAgY29sb3I6IHN0cmluZztcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbDtcclxuICAgIHNpemU6IG51bWJlcjtcclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnRGF0YTtcclxuICAgIHByaXZhdGUgYmVhdG1hcCE6IEJlYXRtYXBDb25maWc7XHJcbiAgICBwcml2YXRlIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBba2V5OiBzdHJpbmddOiBMb2FkZWRJbWFnZUFzc2V0IH07XHJcbiAgICAgICAgc291bmRzOiB7IFtrZXk6IHN0cmluZ106IExvYWRlZFNvdW5kQXNzZXQgfTtcclxuICAgIH07XHJcbiAgICBwcml2YXRlIGFzc2V0Q29uZmlncyE6IEFzc2V0c0NvbmZpZzsgLy8gVGVtcG9yYXJ5IHN0b3JhZ2UgZm9yIGFzc2V0IGRlZmluaXRpb25zIGZyb20gSlNPTlxyXG5cclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOO1xyXG5cclxuICAgIC8vIEdhbWUgc3RhdGUgdmFyaWFibGVzXHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjb21ibzogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgaGVhbHRoOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBub3RlczogTm90ZVtdID0gW107XHJcbiAgICBwcml2YXRlIHByZXNzZWRLZXlzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcclxuICAgIHByaXZhdGUgbGFzdEZyYW1lVGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcbiAgICBwcml2YXRlIGJlYXRtYXBDdXJyZW50Tm90ZUluZGV4OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhcnRUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgaGl0RWZmZWN0UGFydGljbGVzOiBQYXJ0aWNsZVtdID0gW107XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgQ2FudmFzIHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICB0aGlzLmFzc2V0cyA9IHsgaW1hZ2VzOiB7fSwgc291bmRzOiB7fSB9O1xyXG5cclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCBjYW52YXMgc2l6ZSwgd2lsbCBiZSBvdmVyd3JpdHRlbiBieSBjb25maWdcclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IDEyODA7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gNzIwO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5oYW5kbGVLZXlEb3duKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMuaGFuZGxlS2V5VXApO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDbGljayk7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRDb25maWcoKTtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuICAgICAgICB0aGlzLnJlc2V0R2FtZSgpO1xyXG4gICAgICAgIHRoaXMubGFzdEZyYW1lVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRDb25maWcoKSB7XHJcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgY29uc3QgcmF3RGF0YTogUmF3R2FtZURhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgdGhpcy5jb25maWcgPSByYXdEYXRhLmNvbmZpZztcclxuICAgICAgICB0aGlzLmJlYXRtYXAgPSByYXdEYXRhLmJlYXRtYXA7XHJcbiAgICAgICAgdGhpcy5hc3NldENvbmZpZ3MgPSByYXdEYXRhLmFzc2V0cztcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgY2FudmFzIGRpbWVuc2lvbnMgZnJvbSBjb25maWdcclxuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY29uZmlnLmNhbnZhc1dpZHRoO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuY29uZmlnLmNhbnZhc0hlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuYXNzZXRDb25maWdzLmltYWdlcy5tYXAoYXNzZXRDb25maWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBpbWcuc3JjID0gYXNzZXRDb25maWcucGF0aDtcclxuICAgICAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9hZGVkQXNzZXQ6IExvYWRlZEltYWdlQXNzZXQgPSB7IC4uLmFzc2V0Q29uZmlnLCBpbWc6IGltZyB9O1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLmltYWdlc1thc3NldENvbmZpZy5uYW1lXSA9IGxvYWRlZEFzc2V0O1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldENvbmZpZy5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdCgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmFzc2V0Q29uZmlncy5zb3VuZHMubWFwKGFzc2V0Q29uZmlnID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5zcmMgPSBhc3NldENvbmZpZy5wYXRoO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gYXNzZXRDb25maWcudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsb2FkZWRBc3NldDogTG9hZGVkU291bmRBc3NldCA9IHsgLi4uYXNzZXRDb25maWcsIGF1ZGlvOiBhdWRpbyB9O1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzLnNvdW5kc1thc3NldENvbmZpZy5uYW1lXSA9IGxvYWRlZEFzc2V0O1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke2Fzc2V0Q29uZmlnLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVqZWN0KCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmNvbWJvID0gMDtcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IHRoaXMuY29uZmlnLmluaXRpYWxIZWFsdGg7XHJcbiAgICAgICAgdGhpcy5ub3RlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuYmVhdG1hcEN1cnJlbnROb3RlSW5kZXggPSAwO1xyXG4gICAgICAgIHRoaXMucHJlc3NlZEtleXMuY2xlYXIoKTtcclxuICAgICAgICB0aGlzLmdhbWVTdGFydFRpbWUgPSAwO1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaGl0RWZmZWN0UGFydGljbGVzID0gW107XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXJ0VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpOyAvLyBSZWNvcmQgYWN0dWFsIGdhbWUgc3RhcnQgdGltZVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGJnbUFzc2V0ID0gdGhpcy5hc3NldHMuc291bmRzW3RoaXMuYmVhdG1hcC5iZ21Tb3VuZF07XHJcbiAgICAgICAgaWYgKGJnbUFzc2V0ICYmIGJnbUFzc2V0LmF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8gPSBiZ21Bc3NldC5hdWRpbztcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5sb29wID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwOyAvLyBFbnN1cmUgc3RhcnRzIGZyb20gYmVnaW5uaW5nXHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIkJHTSBwbGF5YmFjayBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlEb3duID0gKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnByZXNzZWRLZXlzLmhhcyhldmVudC5jb2RlKSkge1xyXG4gICAgICAgICAgICB0aGlzLnByZXNzZWRLZXlzLmFkZChldmVudC5jb2RlKTtcclxuICAgICAgICAgICAgdGhpcy5oYW5kbGVQbGF5ZXJJbnB1dChldmVudC5jb2RlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlVcCA9IChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJlc3NlZEtleXMuZGVsZXRlKGV2ZW50LmNvZGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlQ2xpY2sgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcclxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2J1dHRvbicpO1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFX1NDUkVFTikge1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlNfU0NSRUVOO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlNfU0NSRUVOKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU47XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGxheVNvdW5kKG5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHNvdW5kQXNzZXQgPSB0aGlzLmFzc2V0cy5zb3VuZHNbbmFtZV07XHJcbiAgICAgICAgaWYgKHNvdW5kQXNzZXQgJiYgc291bmRBc3NldC5hdWRpbykge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IHNvdW5kQXNzZXQuYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmRBc3NldC5hdWRpby52b2x1bWU7XHJcbiAgICAgICAgICAgIGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgU291bmQgcGxheWJhY2sgZmFpbGVkIGZvciAke25hbWV9OmAsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5ZXJJbnB1dChrZXlDb2RlOiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgIT09IEdhbWVTdGF0ZS5QTEFZSU5HKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGxhbmVJbmRleCA9IHRoaXMuY29uZmlnLmtleUJpbmRpbmdzLmluZGV4T2Yoa2V5Q29kZSk7XHJcbiAgICAgICAgaWYgKGxhbmVJbmRleCA9PT0gLTEpIHJldHVybjsgLy8gTm90IGEgZ2FtZSBrZXlcclxuXHJcbiAgICAgICAgbGV0IGJlc3ROb3RlSW5kZXggPSAtMTtcclxuICAgICAgICBsZXQgbWluRGlzdGFuY2UgPSBJbmZpbml0eTtcclxuXHJcbiAgICAgICAgLy8gRmluZCB0aGUgY2xvc2VzdCBub24taGl0IG5vdGUgaW4gdGhlIGNvcnJlY3QgbGFuZSB3aXRoaW4gdGhlIGhpdCB6b25lIHRvbGVyYW5jZVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5ub3Rlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBub3RlID0gdGhpcy5ub3Rlc1tpXTtcclxuICAgICAgICAgICAgaWYgKG5vdGUubGFuZSA9PT0gbGFuZUluZGV4ICYmICFub3RlLmhpdCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgbm90ZUNlbnRlclkgPSBub3RlLnkgKyBub3RlLmhlaWdodCAvIDI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoaXRab25lQ2VudGVyWSA9IHRoaXMuY29uZmlnLmhpdFpvbmVZICsgdGhpcy5jb25maWcuaGl0Wm9uZUhlaWdodCAvIDI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBkaXN0YW5jZSA9IE1hdGguYWJzKG5vdGVDZW50ZXJZIC0gaGl0Wm9uZUNlbnRlclkpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZSA8PSB0aGlzLmNvbmZpZy5oaXRUb2xlcmFuY2UgJiYgZGlzdGFuY2UgPCBtaW5EaXN0YW5jZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGJlc3ROb3RlSW5kZXggPSBpO1xyXG4gICAgICAgICAgICAgICAgICAgIG1pbkRpc3RhbmNlID0gZGlzdGFuY2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChiZXN0Tm90ZUluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICBjb25zdCBub3RlID0gdGhpcy5ub3Rlc1tiZXN0Tm90ZUluZGV4XTtcclxuICAgICAgICAgICAgbm90ZS5oaXQgPSB0cnVlOyAvLyBNYXJrIGFzIGhpdCB0byBwcmV2ZW50IGRvdWJsZSBoaXR0aW5nXHJcbiAgICAgICAgICAgIHRoaXMubm90ZXMuc3BsaWNlKGJlc3ROb3RlSW5kZXgsIDEpOyAvLyBSZW1vdmUgaGl0IG5vdGVcclxuXHJcbiAgICAgICAgICAgIGxldCBmZWVkYmFja0NvbG9yID0gJyc7XHJcbiAgICAgICAgICAgIGxldCBzY29yZVRvQWRkID0gMDtcclxuICAgICAgICAgICAgbGV0IGhlYWx0aENoYW5nZSA9IHRoaXMuY29uZmlnLmhlYWx0aEdhaW5PbkhpdDtcclxuXHJcbiAgICAgICAgICAgIGlmIChtaW5EaXN0YW5jZSA8PSB0aGlzLmNvbmZpZy5wZXJmZWN0VGltaW5nVGhyZXNob2xkKSB7XHJcbiAgICAgICAgICAgICAgICBzY29yZVRvQWRkID0gdGhpcy5jb25maWcuc2NvcmVQZXJIaXQgKyB0aGlzLmNvbmZpZy5wZXJmZWN0Qm9udXM7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbWJvKys7XHJcbiAgICAgICAgICAgICAgICBmZWVkYmFja0NvbG9yID0gdGhpcy5jb25maWcucGVyZmVjdENvbG9yO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1pbkRpc3RhbmNlIDw9IHRoaXMuY29uZmlnLmdvb2RUaW1pbmdUaHJlc2hvbGQpIHtcclxuICAgICAgICAgICAgICAgIHNjb3JlVG9BZGQgPSB0aGlzLmNvbmZpZy5zY29yZVBlckhpdDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29tYm8rKztcclxuICAgICAgICAgICAgICAgIGZlZWRiYWNrQ29sb3IgPSB0aGlzLmNvbmZpZy5nb29kQ29sb3I7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGNhc2Ugc2hvdWxkIGlkZWFsbHkgYmUgY2F1Z2h0IGJ5IGhpdFRvbGVyYW5jZS4gSWYgaXQgb2NjdXJzLCBpdCdzIGEgd2VhayBoaXQuXHJcbiAgICAgICAgICAgICAgICBzY29yZVRvQWRkID0gTWF0aC5mbG9vcih0aGlzLmNvbmZpZy5zY29yZVBlckhpdCAvIDIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb21ibysrO1xyXG4gICAgICAgICAgICAgICAgZmVlZGJhY2tDb2xvciA9IHRoaXMuY29uZmlnLmdvb2RDb2xvcjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5zY29yZSArPSBzY29yZVRvQWRkO1xyXG4gICAgICAgICAgICB0aGlzLmhlYWx0aCA9IE1hdGgubWluKHRoaXMuY29uZmlnLmluaXRpYWxIZWFsdGgsIHRoaXMuaGVhbHRoICsgaGVhbHRoQ2hhbmdlKTsgLy8gQ2FwIGhlYWx0aFxyXG4gICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X2hpdCcpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgdGhpcy5zcGF3blBhcnRpY2xlcygncGVyZmVjdF9lZmZlY3QnLCBub3RlLnggKyBub3RlLndpZHRoIC8gMiwgbm90ZS55ICsgbm90ZS5oZWlnaHQgLyAyLCBmZWVkYmFja0NvbG9yKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBLZXkgcHJlc3NlZCBidXQgbm8gbm90ZSBpbiBoaXQgem9uZSAtPiBjb25zaWRlciBpdCBhIG1pc3NcclxuICAgICAgICAgICAgdGhpcy5jb21ibyA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuaGVhbHRoID0gTWF0aC5tYXgoMCwgdGhpcy5oZWFsdGggKyB0aGlzLmNvbmZpZy5oZWFsdGhQZW5hbHR5T25NaXNzKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9taXNzJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3Bhd25QYXJ0aWNsZXMoaW1hZ2VOYW1lOiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBjb2xvcjogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcGFydGljbGVDb3VudCA9IDU7XHJcbiAgICAgICAgY29uc3QgcGFydGljbGVJbWFnZSA9IHRoaXMuYXNzZXRzLmltYWdlc1tpbWFnZU5hbWVdPy5pbWcgfHwgbnVsbDtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBhcnRpY2xlQ291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBhbmdsZSA9IE1hdGgucmFuZG9tKCkgKiBNYXRoLlBJICogMjtcclxuICAgICAgICAgICAgY29uc3Qgc3BlZWQgPSBNYXRoLnJhbmRvbSgpICogMyArIDE7XHJcbiAgICAgICAgICAgIHRoaXMuaGl0RWZmZWN0UGFydGljbGVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgeDogeCxcclxuICAgICAgICAgICAgICAgIHk6IHksXHJcbiAgICAgICAgICAgICAgICB2eDogTWF0aC5jb3MoYW5nbGUpICogc3BlZWQsXHJcbiAgICAgICAgICAgICAgICB2eTogTWF0aC5zaW4oYW5nbGUpICogc3BlZWQgLSBNYXRoLnJhbmRvbSgpICogMyAtIDEsIC8vIFVwd2FyZHMgYmlhc1xyXG4gICAgICAgICAgICAgICAgbGlmZTogNDUgKyBNYXRoLnJhbmRvbSgpICogMTUsIC8vIGZyYW1lc1xyXG4gICAgICAgICAgICAgICAgY29sb3I6IGNvbG9yLFxyXG4gICAgICAgICAgICAgICAgaW1hZ2U6IHBhcnRpY2xlSW1hZ2UsXHJcbiAgICAgICAgICAgICAgICBzaXplOiBNYXRoLnJhbmRvbSgpICogMTAgKyAxNSAvLyBMYXJnZXIgcGFydGljbGVzXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wID0gKGN1cnJlbnRUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0RnJhbWVUaW1lKSAvIDEwMDA7IC8vIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSBjdXJyZW50VGltZTtcclxuXHJcbiAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB0aGlzLmRyYXcoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuZ2FtZUxvb3ApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICBjb25zdCBlbGFwc2VkVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpIC0gdGhpcy5nYW1lU3RhcnRUaW1lO1xyXG5cclxuICAgICAgICAgICAgLy8gR2VuZXJhdGUgbm90ZXMgZnJvbSBiZWF0bWFwXHJcbiAgICAgICAgICAgIHdoaWxlICh0aGlzLmJlYXRtYXBDdXJyZW50Tm90ZUluZGV4IDwgdGhpcy5iZWF0bWFwLm5vdGVzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgbm90ZURhdGEgPSB0aGlzLmJlYXRtYXAubm90ZXNbdGhpcy5iZWF0bWFwQ3VycmVudE5vdGVJbmRleF07XHJcbiAgICAgICAgICAgICAgICBjb25zdCBub3RlSGl0VGltZU1zID0gbm90ZURhdGFbMF0gKyB0aGlzLmJlYXRtYXAub2Zmc2V0OyAvLyBUaW1lIG5vdGUgc2hvdWxkIGJlIGhpdFxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBTcGF3biB0aGUgbm90ZSBpZiBjdXJyZW50IHRpbWUgcmVhY2hlcyBpdHMgc3Bhd24gd2luZG93XHJcbiAgICAgICAgICAgICAgICBpZiAoZWxhcHNlZFRpbWUgPj0gbm90ZUhpdFRpbWVNcyAtIHRoaXMuY29uZmlnLm5vdGVGYWxsRHVyYXRpb25Ncykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhbmVJbmRleCA9IG5vdGVEYXRhWzFdO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vdGVJbWFnZU5hbWUgPSB0aGlzLmNvbmZpZy5ub3RlSW1hZ2VOYW1lc1tNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLmNvbmZpZy5ub3RlSW1hZ2VOYW1lcy5sZW5ndGgpXTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBpbWFnZUFzc2V0ID0gdGhpcy5hc3NldHMuaW1hZ2VzW25vdGVJbWFnZU5hbWVdO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1hZ2VBc3NldCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsYW5lWCA9IHRoaXMuY29uZmlnLmxhbmVTdGFydFggKyBsYW5lSW5kZXggKiAodGhpcy5jb25maWcubGFuZVdpZHRoICsgdGhpcy5jb25maWcubGFuZUdhcCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBVc2UgY29uZmlndXJlZCBub3RlIGRpbWVuc2lvbnMgaW5zdGVhZCBvZiBpbWFnZSBhc3NldCBkaW1lbnNpb25zXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vdGVXaWR0aCA9IHRoaXMuY29uZmlnLm5vdGVXaWR0aDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgbm90ZUhlaWdodCA9IHRoaXMuY29uZmlnLm5vdGVIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm5vdGVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeDogbGFuZVggKyAodGhpcy5jb25maWcubGFuZVdpZHRoIC0gbm90ZVdpZHRoKSAvIDIsIC8vIENlbnRlciBub3RlIGluIGxhbmVcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHk6IC1ub3RlSGVpZ2h0LCAvLyBTdGFydCBhYm92ZSB0aGUgc2NyZWVuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aWR0aDogbm90ZVdpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBub3RlSGVpZ2h0LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFuZTogbGFuZUluZGV4LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhcnRUaW1lOiBub3RlSGl0VGltZU1zLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW1hZ2U6IGltYWdlQXNzZXQuaW1nISxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhpdDogZmFsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmVhdG1hcEN1cnJlbnROb3RlSW5kZXgrKztcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBub3RlcyBwb3NpdGlvbnMgYW5kIGNoZWNrIGZvciBhdXRvLW1pc3Nlc1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5ub3Rlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgbm90ZSA9IHRoaXMubm90ZXNbaV07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBub3RlIFkgcG9zaXRpb24gYmFzZWQgb24gdGFyZ2V0IGhpdCB0aW1lIGFuZCBmYWxsIGR1cmF0aW9uXHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aW1lU2luY2VTcGF3biA9IGVsYXBzZWRUaW1lIC0gKG5vdGUuc3RhcnRUaW1lIC0gdGhpcy5jb25maWcubm90ZUZhbGxEdXJhdGlvbk1zKTtcclxuICAgICAgICAgICAgICAgIGlmICh0aW1lU2luY2VTcGF3biA8IDApIGNvbnRpbnVlOyAvLyBOb3RlIG5vdCB5ZXQgc3Bhd25lZCB2aXN1YWxseVxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHByb2dyZXNzID0gdGltZVNpbmNlU3Bhd24gLyB0aGlzLmNvbmZpZy5ub3RlRmFsbER1cmF0aW9uTXM7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXROb3RlVG9wWUF0SGl0ID0gdGhpcy5jb25maWcuaGl0Wm9uZVkgKyB0aGlzLmNvbmZpZy5oaXRab25lSGVpZ2h0IC8gMiAtIG5vdGUuaGVpZ2h0IC8gMjtcclxuICAgICAgICAgICAgICAgIG5vdGUueSA9IC1ub3RlLmhlaWdodCArIHByb2dyZXNzICogKHRhcmdldE5vdGVUb3BZQXRIaXQgKyBub3RlLmhlaWdodCk7XHJcblxyXG5cclxuICAgICAgICAgICAgICAgIC8vIElmIG5vdGUgcGFzc2VzIHRoZSBoaXQgem9uZSBib3R0b20gd2l0aG91dCBiZWluZyBoaXRcclxuICAgICAgICAgICAgICAgIGlmICghbm90ZS5oaXQgJiYgKG5vdGUueSA+IHRoaXMuY29uZmlnLmhpdFpvbmVZICsgdGhpcy5jb25maWcuaGl0Wm9uZUhlaWdodCArIHRoaXMuY29uZmlnLm5vdGVNaXNzT2Zmc2V0KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubm90ZXMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29tYm8gPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGVhbHRoID0gTWF0aC5tYXgoMCwgdGhpcy5oZWFsdGggKyB0aGlzLmNvbmZpZy5oZWFsdGhQZW5hbHR5T25NaXNzKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2Z4X21pc3MnKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gVXBkYXRlIHBhcnRpY2xlc1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5oaXRFZmZlY3RQYXJ0aWNsZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHAgPSB0aGlzLmhpdEVmZmVjdFBhcnRpY2xlc1tpXTtcclxuICAgICAgICAgICAgICAgIHAueCArPSBwLnZ4O1xyXG4gICAgICAgICAgICAgICAgcC55ICs9IHAudnk7XHJcbiAgICAgICAgICAgICAgICBwLnZ5ICs9IDAuMjsgLy8gR3Jhdml0eSBlZmZlY3RcclxuICAgICAgICAgICAgICAgIHAubGlmZS0tO1xyXG4gICAgICAgICAgICAgICAgaWYgKHAubGlmZSA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5oaXRFZmZlY3RQYXJ0aWNsZXMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgZ2FtZSBvdmVyIChoZWFsdGggb3Igc29uZyBlbmQpXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmJlYXRtYXBDdXJyZW50Tm90ZUluZGV4ID49IHRoaXMuYmVhdG1hcC5ub3Rlcy5sZW5ndGggJiYgdGhpcy5ub3Rlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIC8vIEFsbCBub3RlcyBwcm9jZXNzZWQgYW5kIGZhbGxlbiBvZmYgc2NyZWVuXHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3KCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBiYWNrZ3JvdW5kXHJcbiAgICAgICAgY29uc3QgYmdJbWFnZSA9IHRoaXMuYXNzZXRzLmltYWdlc1snYmFja2dyb3VuZCddPy5pbWc7XHJcbiAgICAgICAgaWYgKGJnSW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJnSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMuY29uZmlnLmJhY2tncm91bmRDb2xvcjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TX1NDUkVFTjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0luc3RydWN0aW9uc1NjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdQbGF5aW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICdib2xkIDQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcudGl0bGVTY3JlZW4udGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRpdGxlU2NyZWVuLnN0YXJ0QnV0dG9uVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0luc3RydWN0aW9uc1NjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICdib2xkIDM2cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcuaW5zdHJ1Y3Rpb25TY3JlZW4udGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gNCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICBjb25zdCBsaW5lSGVpZ2h0ID0gMzA7XHJcbiAgICAgICAgbGV0IHkgPSB0aGlzLmNhbnZhcy5oZWlnaHQgLyAzO1xyXG4gICAgICAgIHRoaXMuY29uZmlnLmluc3RydWN0aW9uU2NyZWVuLmluc3RydWN0aW9ucy5mb3JFYWNoKChsaW5lOiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQobGluZSwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB5KTtcclxuICAgICAgICAgICAgeSArPSBsaW5lSGVpZ2h0O1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcuaW5zdHJ1Y3Rpb25TY3JlZW4uY29udGludWVCdXR0b25UZXh0LCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAtIDEwMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3UGxheWluZ1NjcmVlbigpIHtcclxuICAgICAgICAvLyBEcmF3IGhpdCB6b25lcyAoaW5kaWNhdG9ycylcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuY29uZmlnLm51bUxhbmVzOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgbGFuZVggPSB0aGlzLmNvbmZpZy5sYW5lU3RhcnRYICsgaSAqICh0aGlzLmNvbmZpZy5sYW5lV2lkdGggKyB0aGlzLmNvbmZpZy5sYW5lR2FwKTtcclxuICAgICAgICAgICAgY29uc3QgaW5kaWNhdG9ySW1hZ2UgPSB0aGlzLmFzc2V0cy5pbWFnZXNbJ2hpdF9pbmRpY2F0b3InXT8uaW1nO1xyXG5cclxuICAgICAgICAgICAgaWYgKGluZGljYXRvckltYWdlKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTY2FsZSBpbmRpY2F0b3IgaW1hZ2UgdG8gZmlsbCB0aGUgbGFuZSB3aWR0aCBhbmQgaGl0IHpvbmUgaGVpZ2h0XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoXHJcbiAgICAgICAgICAgICAgICAgICAgaW5kaWNhdG9ySW1hZ2UsXHJcbiAgICAgICAgICAgICAgICAgICAgbGFuZVgsXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuaGl0Wm9uZVksXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcubGFuZVdpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmhpdFpvbmVIZWlnaHRcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5oaXRab25lQ29sb3I7IC8vIEZhbGxiYWNrIHRvIGNvbmZpZ3VyZWQgY29sb3JcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGxhbmVYLCB0aGlzLmNvbmZpZy5oaXRab25lWSwgdGhpcy5jb25maWcubGFuZVdpZHRoLCB0aGlzLmNvbmZpZy5oaXRab25lSGVpZ2h0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRHJhdyBsYW5lIGxpbmVzXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyM1NTU1NTUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5iZWdpblBhdGgoKTtcclxuICAgICAgICAgICAgdGhpcy5jdHgubW92ZVRvKGxhbmVYLCAwKTtcclxuICAgICAgICAgICAgdGhpcy5jdHgubGluZVRvKGxhbmVYLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2UoKTtcclxuICAgICAgICAgICAgdGhpcy5jdHguYmVnaW5QYXRoKCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4Lm1vdmVUbyhsYW5lWCArIHRoaXMuY29uZmlnLmxhbmVXaWR0aCwgMCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmxpbmVUbyhsYW5lWCArIHRoaXMuY29uZmlnLmxhbmVXaWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IG5vdGVzXHJcbiAgICAgICAgdGhpcy5ub3Rlcy5mb3JFYWNoKG5vdGUgPT4ge1xyXG4gICAgICAgICAgICBpZiAobm90ZS5pbWFnZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKG5vdGUuaW1hZ2UsIG5vdGUueCwgbm90ZS55LCBub3RlLndpZHRoLCBub3RlLmhlaWdodCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnI2YwMCc7IC8vIEZhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChub3RlLngsIG5vdGUueSwgbm90ZS53aWR0aCwgbm90ZS5oZWlnaHQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgcGFydGljbGVzXHJcbiAgICAgICAgdGhpcy5oaXRFZmZlY3RQYXJ0aWNsZXMuZm9yRWFjaChwID0+IHtcclxuICAgICAgICAgICAgaWYgKHAuaW1hZ2UpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4Lmdsb2JhbEFscGhhID0gcC5saWZlIC8gNjA7IC8vIEZhZGUgb3V0IGJhc2VkIG9uIGxpZmVcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShwLmltYWdlLCBwLnggLSBwLnNpemUgLyAyLCBwLnkgLSBwLnNpemUgLyAyLCBwLnNpemUsIHAuc2l6ZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5nbG9iYWxBbHBoYSA9IDE7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gcC5jb2xvcjtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4Lmdsb2JhbEFscGhhID0gcC5saWZlIC8gNjA7IC8vIEZhZGUgb3V0XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5iZWdpblBhdGgoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmFyYyhwLngsIHAueSwgcC5zaXplIC8gMiwgMCwgTWF0aC5QSSAqIDIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZ2xvYmFsQWxwaGEgPSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUlcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDODEwXHVDMjE4OiAke3RoaXMuc2NvcmV9YCwgMjAsIDQwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDRjY0XHVCQ0Y0OiAke3RoaXMuY29tYm99YCwgMjAsIDcwKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBIZWFsdGggQmFyXHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFyV2lkdGggPSAyMDA7XHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFySGVpZ2h0ID0gMjA7XHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFyWCA9IHRoaXMuY2FudmFzLndpZHRoIC0gaGVhbHRoQmFyV2lkdGggLSAyMDtcclxuICAgICAgICBjb25zdCBoZWFsdGhCYXJZID0gMzA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyM1NTUnOyAvLyBCYWNrZ3JvdW5kIG9mIGhlYWx0aCBiYXJcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBoZWFsdGhCYXJXaWR0aCwgaGVhbHRoQmFySGVpZ2h0KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBIZWFsdGggY29sb3IgZ3JhZGllbnQgZnJvbSByZWQgdG8gZ3JlZW5cclxuICAgICAgICBjb25zdCBoZWFsdGhSYXRpbyA9IHRoaXMuaGVhbHRoIC8gdGhpcy5jb25maWcuaW5pdGlhbEhlYWx0aDtcclxuICAgICAgICBjb25zdCBodWUgPSBoZWFsdGhSYXRpbyAqIDEyMDsgLy8gMCAocmVkKSB0byAxMjAgKGdyZWVuKVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IGBoc2woJHtodWV9LCAxMDAlLCA1MCUpYDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBoZWFsdGhSYXRpbyAqIGhlYWx0aEJhcldpZHRoLCBoZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyNmZmYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmxpbmVXaWR0aCA9IDE7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBoZWFsdGhCYXJXaWR0aCwgaGVhbHRoQmFySGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICdib2xkIDQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcuZ2FtZU92ZXJTY3JlZW4udGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDEwMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzZweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDRDVDXHVDODg1IFx1QzgxMFx1QzIxODogJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1Q0Q1Q1x1QUNFMCBcdUNGNjRcdUJDRjQ6ICR7dGhpcy5jb21ib31gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy5nYW1lT3ZlclNjcmVlbi5yZXN0YXJ0QnV0dG9uVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTUwKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gR2xvYmFsIHNjb3BlXHJcbndpbmRvdy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICBjb25zdCBnYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgIGdhbWUuaW5pdCgpO1xyXG59O1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUE0RkEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFKQyxTQUFBQTtBQUFBLEdBQUE7QUE2QkwsTUFBTSxLQUFLO0FBQUEsRUF5QlAsWUFBWSxVQUFrQjtBQWQ5QjtBQUFBLFNBQVEsWUFBdUI7QUFHL0I7QUFBQSxTQUFRLFFBQWdCO0FBQ3hCLFNBQVEsUUFBZ0I7QUFDeEIsU0FBUSxTQUFpQjtBQUN6QixTQUFRLFFBQWdCLENBQUM7QUFDekIsU0FBUSxjQUEyQixvQkFBSSxJQUFJ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
