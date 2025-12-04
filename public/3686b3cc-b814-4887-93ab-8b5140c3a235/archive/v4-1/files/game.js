var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE_SCREEN"] = 0] = "TITLE_SCREEN";
  GameState2[GameState2["INSTRUCTIONS_SCREEN"] = 1] = "INSTRUCTIONS_SCREEN";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
class Game {
  // Flag to track if BGM finished playing naturally
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
    this.songEndedNaturally = false;
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
      this.bgmAudio.onended = null;
    }
    this.hitEffectParticles = [];
    this.songEndedNaturally = false;
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
      this.bgmAudio.onended = () => {
        this.songEndedNaturally = true;
      };
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
          this.bgmAudio.onended = null;
        }
      } else if (this.songEndedNaturally && this.beatmapCurrentNoteIndex >= this.beatmap.notes.length && this.notes.length === 0) {
        this.gameState = 3 /* GAME_OVER */;
        if (this.bgmAudio) {
          this.bgmAudio.pause();
          this.bgmAudio.onended = null;
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
    const treeAsset = this.assets.images["christmas_tree"];
    if (treeAsset) {
      this.ctx.drawImage(
        treeAsset.img,
        30,
        this.canvas.height - treeAsset.height - 20,
        treeAsset.width,
        treeAsset.height
      );
    }
    const santaAsset = this.assets.images["santa_claus"];
    if (santaAsset) {
      this.ctx.drawImage(
        santaAsset.img,
        this.canvas.width - santaAsset.width - 30,
        this.canvas.height - santaAsset.height - 20,
        santaAsset.width,
        santaAsset.height
      );
    }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEltYWdlQXNzZXRDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRDb25maWdbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldENvbmZpZ1tdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQmVhdG1hcENvbmZpZyB7XHJcbiAgICBzb25nTmFtZTogc3RyaW5nO1xyXG4gICAgYnBtOiBudW1iZXI7XHJcbiAgICBvZmZzZXQ6IG51bWJlcjsgLy8gR2xvYmFsIG9mZnNldCBmb3IgYmVhdG1hcCBpbiBtaWxsaXNlY29uZHNcclxuICAgIGJnbVNvdW5kOiBzdHJpbmc7IC8vIE5hbWUgb2YgdGhlIHNvdW5kIGFzc2V0IGZvciBCR01cclxuICAgIG5vdGVzOiBbbnVtYmVyLCBudW1iZXJdW107IC8vIEFycmF5IG9mIFt0aW1lX21zX2Zyb21fZ2FtZV9zdGFydF90b19oaXQsIGxhbmVfaW5kZXhdXHJcbn1cclxuXHJcbmludGVyZmFjZSBUaXRsZVNjcmVlbkNvbmZpZyB7XHJcbiAgICB0aXRsZTogc3RyaW5nO1xyXG4gICAgc3RhcnRCdXR0b25UZXh0OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBJbnN0cnVjdGlvblNjcmVlbkNvbmZpZyB7XHJcbiAgICB0aXRsZTogc3RyaW5nO1xyXG4gICAgaW5zdHJ1Y3Rpb25zOiBzdHJpbmdbXTtcclxuICAgIGNvbnRpbnVlQnV0dG9uVGV4dDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZU92ZXJTY3JlZW5Db25maWcge1xyXG4gICAgdGl0bGU6IHN0cmluZztcclxuICAgIHJlc3RhcnRCdXR0b25UZXh0OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnRGF0YSB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZztcclxuICAgIHRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgdGl0bGVTY3JlZW46IFRpdGxlU2NyZWVuQ29uZmlnO1xyXG4gICAgaW5zdHJ1Y3Rpb25TY3JlZW46IEluc3RydWN0aW9uU2NyZWVuQ29uZmlnO1xyXG4gICAgZ2FtZU92ZXJTY3JlZW46IEdhbWVPdmVyU2NyZWVuQ29uZmlnO1xyXG4gICAgbm90ZVNwZWVkOiBudW1iZXI7IC8vIE5vdCBkaXJlY3RseSB1c2VkIHdpdGggbm90ZUZhbGxEdXJhdGlvbk1zIGZvciBub3RlIHBvc2l0aW9uLCBidXQgZm9yIGNvbnRleHRcclxuICAgIGluaXRpYWxIZWFsdGg6IG51bWJlcjtcclxuICAgIGhlYWx0aFBlbmFsdHlPbk1pc3M6IG51bWJlcjsgLy8gTmVnYXRpdmUgdmFsdWUgZm9yIG1pc3Nlcy9hdXRvLW1pc3Nlc1xyXG4gICAgaGVhbHRoR2Fpbk9uSGl0OiBudW1iZXI7IC8vIFBvc2l0aXZlIHZhbHVlIGZvciBoaXRzXHJcbiAgICBoaXRab25lWTogbnVtYmVyOyAvLyBZLWNvb3JkaW5hdGUgb2YgdGhlIHRvcCBvZiB0aGUgaGl0IHpvbmVcclxuICAgIGhpdFpvbmVIZWlnaHQ6IG51bWJlcjtcclxuICAgIGhpdFpvbmVDb2xvcjogc3RyaW5nOyAvLyBDb2xvciBmb3IgaGl0IHpvbmUgZmFsbGJhY2tcclxuICAgIGhpdFRvbGVyYW5jZTogbnVtYmVyOyAvLyBNYXggcGl4ZWwgZGlzdGFuY2UgZnJvbSBub3RlIGNlbnRlciB0byBoaXQgem9uZSBjZW50ZXIgZm9yIGFueSBoaXRcclxuICAgIHBlcmZlY3RUaW1pbmdUaHJlc2hvbGQ6IG51bWJlcjsgLy8gTWF4IHBpeGVsIGRpc3RhbmNlIGZvciAnUEVSRkVDVCcgaGl0XHJcbiAgICBnb29kVGltaW5nVGhyZXNob2xkOiBudW1iZXI7IC8vIE1heCBwaXhlbCBkaXN0YW5jZSBmb3IgJ0dPT0QnIGhpdFxyXG4gICAgbm90ZU1pc3NPZmZzZXQ6IG51bWJlcjsgLy8gSG93IGZhciBiZWxvdyBoaXQgem9uZSBhIG5vdGUgY2FuIGdvIGJlZm9yZSBpdCdzIGFuIGF1dG8tbWlzc1xyXG4gICAgbnVtTGFuZXM6IG51bWJlcjtcclxuICAgIGxhbmVXaWR0aDogbnVtYmVyO1xyXG4gICAgbGFuZUdhcDogbnVtYmVyO1xyXG4gICAgbGFuZVN0YXJ0WDogbnVtYmVyOyAvLyBYLWNvb3JkaW5hdGUgb2YgdGhlIGZpcnN0IGxhbmVcclxuICAgIG5vdGVXaWR0aDogbnVtYmVyOyAvLyBDb25maWd1cmVkIHdpZHRoIGZvciBub3Rlcywgb3ZlcnJpZGluZyBpbWFnZSB3aWR0aFxyXG4gICAgbm90ZUhlaWdodDogbnVtYmVyOyAvLyBDb25maWd1cmVkIGhlaWdodCBmb3Igbm90ZXMsIG92ZXJyaWRpbmcgaW1hZ2UgaGVpZ2h0XHJcbiAgICBub3RlSW1hZ2VOYW1lczogc3RyaW5nW107IC8vIE5hbWVzIG9mIGltYWdlIGFzc2V0cyB0byB1c2UgZm9yIG5vdGVzXHJcbiAgICBrZXlCaW5kaW5nczogc3RyaW5nW107IC8vIEFycmF5IG9mIGtleWJvYXJkIGV2ZW50LmNvZGUgZm9yIGVhY2ggbGFuZVxyXG4gICAgc2NvcmVQZXJIaXQ6IG51bWJlcjtcclxuICAgIHBlcmZlY3RCb251czogbnVtYmVyO1xyXG4gICAgbm90ZUZhbGxEdXJhdGlvbk1zOiBudW1iZXI7IC8vIFRpbWUgaW4gbWlsbGlzZWNvbmRzIGZvciBhIG5vdGUgdG8gZmFsbCBmcm9tIHNwYXduIHBvaW50IHRvIGhpdCB6b25lIGNlbnRlclxyXG4gICAgcGVyZmVjdENvbG9yOiBzdHJpbmc7XHJcbiAgICBnb29kQ29sb3I6IHN0cmluZztcclxufVxyXG5cclxuLy8gU3RydWN0dXJlIGZvciBkYXRhLmpzb24gcm9vdFxyXG5pbnRlcmZhY2UgUmF3R2FtZURhdGEge1xyXG4gICAgY29uZmlnOiBHYW1lQ29uZmlnRGF0YTtcclxuICAgIGFzc2V0czogQXNzZXRzQ29uZmlnO1xyXG4gICAgYmVhdG1hcDogQmVhdG1hcENvbmZpZztcclxufVxyXG5cclxuaW50ZXJmYWNlIExvYWRlZEltYWdlQXNzZXQgZXh0ZW5kcyBJbWFnZUFzc2V0Q29uZmlnIHtcclxuICAgIGltZzogSFRNTEltYWdlRWxlbWVudDtcclxufVxyXG5cclxuaW50ZXJmYWNlIExvYWRlZFNvdW5kQXNzZXQgZXh0ZW5kcyBTb3VuZEFzc2V0Q29uZmlnIHtcclxuICAgIGF1ZGlvOiBIVE1MQXVkaW9FbGVtZW50O1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRV9TQ1JFRU4sXHJcbiAgICBJTlNUUlVDVElPTlNfU0NSRUVOLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUlxyXG59XHJcblxyXG5pbnRlcmZhY2UgTm90ZSB7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyOyAvLyBOb3cgY29tZXMgZnJvbSBjb25maWdcclxuICAgIGhlaWdodDogbnVtYmVyOyAvLyBOb3cgY29tZXMgZnJvbSBjb25maWdcclxuICAgIGxhbmU6IG51bWJlcjtcclxuICAgIHN0YXJ0VGltZTogbnVtYmVyOyAvLyBUaGUgZXhhY3QgdGltZSAobXMgZnJvbSBnYW1lIHN0YXJ0KSB0aGlzIG5vdGUgc2hvdWxkIGJlIGhpdFxyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICBoaXQ6IGJvb2xlYW47IC8vIFRydWUgaWYgcGxheWVyIGhhcyBzdWNjZXNzZnVsbHkgaGl0IHRoaXMgbm90ZVxyXG59XHJcblxyXG5pbnRlcmZhY2UgUGFydGljbGUge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgdng6IG51bWJlcjtcclxuICAgIHZ5OiBudW1iZXI7XHJcbiAgICBsaWZlOiBudW1iZXI7IC8vIGZyYW1lc1xyXG4gICAgY29sb3I6IHN0cmluZztcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgbnVsbDtcclxuICAgIHNpemU6IG51bWJlcjtcclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHJpdmF0ZSBjb25maWchOiBHYW1lQ29uZmlnRGF0YTtcclxuICAgIHByaXZhdGUgYmVhdG1hcCE6IEJlYXRtYXBDb25maWc7XHJcbiAgICBwcml2YXRlIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBba2V5OiBzdHJpbmddOiBMb2FkZWRJbWFnZUFzc2V0IH07XHJcbiAgICAgICAgc291bmRzOiB7IFtrZXk6IHN0cmluZ106IExvYWRlZFNvdW5kQXNzZXQgfTtcclxuICAgIH07XHJcbiAgICBwcml2YXRlIGFzc2V0Q29uZmlncyE6IEFzc2V0c0NvbmZpZzsgLy8gVGVtcG9yYXJ5IHN0b3JhZ2UgZm9yIGFzc2V0IGRlZmluaXRpb25zIGZyb20gSlNPTlxyXG5cclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOO1xyXG5cclxuICAgIC8vIEdhbWUgc3RhdGUgdmFyaWFibGVzXHJcbiAgICBwcml2YXRlIHNjb3JlOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjb21ibzogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgaGVhbHRoOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBub3RlczogTm90ZVtdID0gW107XHJcbiAgICBwcml2YXRlIHByZXNzZWRLZXlzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcclxuICAgIHByaXZhdGUgbGFzdEZyYW1lVGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcbiAgICBwcml2YXRlIGJlYXRtYXBDdXJyZW50Tm90ZUluZGV4OiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBnYW1lU3RhcnRUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgaGl0RWZmZWN0UGFydGljbGVzOiBQYXJ0aWNsZVtdID0gW107XHJcbiAgICBwcml2YXRlIHNvbmdFbmRlZE5hdHVyYWxseTogYm9vbGVhbiA9IGZhbHNlOyAvLyBGbGFnIHRvIHRyYWNrIGlmIEJHTSBmaW5pc2hlZCBwbGF5aW5nIG5hdHVyYWxseVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYENhbnZhcyB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICAgICAgdGhpcy5hc3NldHMgPSB7IGltYWdlczoge30sIHNvdW5kczoge30gfTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGluaXRpYWwgY2FudmFzIHNpemUsIHdpbGwgYmUgb3ZlcndyaXR0ZW4gYnkgY29uZmlnXHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSAxMjgwO1xyXG4gICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IDcyMDtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMuaGFuZGxlS2V5RG93bik7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLmhhbmRsZUtleVVwKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2xpY2spO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQ29uZmlnKCk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XHJcbiAgICAgICAgdGhpcy5yZXNldEdhbWUoKTtcclxuICAgICAgICB0aGlzLmxhc3RGcmFtZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5nYW1lTG9vcCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlnKCkge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgIGNvbnN0IHJhd0RhdGE6IFJhd0dhbWVEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgIHRoaXMuY29uZmlnID0gcmF3RGF0YS5jb25maWc7XHJcbiAgICAgICAgdGhpcy5iZWF0bWFwID0gcmF3RGF0YS5iZWF0bWFwO1xyXG4gICAgICAgIHRoaXMuYXNzZXRDb25maWdzID0gcmF3RGF0YS5hc3NldHM7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGNhbnZhcyBkaW1lbnNpb25zIGZyb20gY29uZmlnXHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB0aGlzLmNvbmZpZy5jYW52YXNIZWlnaHQ7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCkge1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmFzc2V0Q29uZmlncy5pbWFnZXMubWFwKGFzc2V0Q29uZmlnID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0Q29uZmlnLnBhdGg7XHJcbiAgICAgICAgICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxvYWRlZEFzc2V0OiBMb2FkZWRJbWFnZUFzc2V0ID0geyAuLi5hc3NldENvbmZpZywgaW1nOiBpbWcgfTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5pbWFnZXNbYXNzZXRDb25maWcubmFtZV0gPSBsb2FkZWRBc3NldDtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXRDb25maWcucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZWplY3QoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5hc3NldENvbmZpZ3Muc291bmRzLm1hcChhc3NldENvbmZpZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8uc3JjID0gYXNzZXRDb25maWcucGF0aDtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0Q29uZmlnLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9hZGVkQXNzZXQ6IExvYWRlZFNvdW5kQXNzZXQgPSB7IC4uLmFzc2V0Q29uZmlnLCBhdWRpbzogYXVkaW8gfTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0cy5zb3VuZHNbYXNzZXRDb25maWcubmFtZV0gPSBsb2FkZWRBc3NldDtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldENvbmZpZy5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlamVjdCgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNldEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5jb21ibyA9IDA7XHJcbiAgICAgICAgdGhpcy5oZWFsdGggPSB0aGlzLmNvbmZpZy5pbml0aWFsSGVhbHRoO1xyXG4gICAgICAgIHRoaXMubm90ZXMgPSBbXTtcclxuICAgICAgICB0aGlzLmJlYXRtYXBDdXJyZW50Tm90ZUluZGV4ID0gMDtcclxuICAgICAgICB0aGlzLnByZXNzZWRLZXlzLmNsZWFyKCk7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhcnRUaW1lID0gMDtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLm9uZW5kZWQgPSBudWxsOyAvLyBDbGVhciBldmVudCBsaXN0ZW5lclxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmhpdEVmZmVjdFBhcnRpY2xlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuc29uZ0VuZGVkTmF0dXJhbGx5ID0gZmFsc2U7IC8vIFJlc2V0IHRoaXMgZmxhZyBmb3IgYSBuZXcgZ2FtZVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMucmVzZXRHYW1lKCk7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICB0aGlzLmdhbWVTdGFydFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTsgLy8gUmVjb3JkIGFjdHVhbCBnYW1lIHN0YXJ0IHRpbWVcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBiZ21Bc3NldCA9IHRoaXMuYXNzZXRzLnNvdW5kc1t0aGlzLmJlYXRtYXAuYmdtU291bmRdO1xyXG4gICAgICAgIGlmIChiZ21Bc3NldCAmJiBiZ21Bc3NldC5hdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvID0gYmdtQXNzZXQuYXVkaW87XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ubG9vcCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmN1cnJlbnRUaW1lID0gMDsgLy8gRW5zdXJlIHN0YXJ0cyBmcm9tIGJlZ2lubmluZ1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoXCJCR00gcGxheWJhY2sgZmFpbGVkOlwiLCBlKSk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgdXAgZXZlbnQgbGlzdGVuZXIgZm9yIHdoZW4gdGhlIEJHTSBmaW5pc2hlcyBwbGF5aW5nIG5hdHVyYWxseVxyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLm9uZW5kZWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvbmdFbmRlZE5hdHVyYWxseSA9IHRydWU7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93biA9IChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4ge1xyXG4gICAgICAgIGlmICghdGhpcy5wcmVzc2VkS2V5cy5oYXMoZXZlbnQuY29kZSkpIHtcclxuICAgICAgICAgICAgdGhpcy5wcmVzc2VkS2V5cy5hZGQoZXZlbnQuY29kZSk7XHJcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlUGxheWVySW5wdXQoZXZlbnQuY29kZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAgPSAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IHtcclxuICAgICAgICB0aGlzLnByZXNzZWRLZXlzLmRlbGV0ZShldmVudC5jb2RlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUNsaWNrID0gKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9idXR0b24nKTtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU4pIHtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TX1NDUkVFTjtcclxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TX1NDUkVFTikge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEVfU0NSRUVOO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBzb3VuZEFzc2V0ID0gdGhpcy5hc3NldHMuc291bmRzW25hbWVdO1xyXG4gICAgICAgIGlmIChzb3VuZEFzc2V0ICYmIHNvdW5kQXNzZXQuYXVkaW8pIHtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBzb3VuZEFzc2V0LmF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kQXNzZXQuYXVkaW8udm9sdW1lO1xyXG4gICAgICAgICAgICBhdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYFNvdW5kIHBsYXliYWNrIGZhaWxlZCBmb3IgJHtuYW1lfTpgLCBlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlUGxheWVySW5wdXQoa2V5Q29kZTogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBsYW5lSW5kZXggPSB0aGlzLmNvbmZpZy5rZXlCaW5kaW5ncy5pbmRleE9mKGtleUNvZGUpO1xyXG4gICAgICAgIGlmIChsYW5lSW5kZXggPT09IC0xKSByZXR1cm47IC8vIE5vdCBhIGdhbWUga2V5XHJcblxyXG4gICAgICAgIGxldCBiZXN0Tm90ZUluZGV4ID0gLTE7XHJcbiAgICAgICAgbGV0IG1pbkRpc3RhbmNlID0gSW5maW5pdHk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgdGhlIGNsb3Nlc3Qgbm9uLWhpdCBub3RlIGluIHRoZSBjb3JyZWN0IGxhbmUgd2l0aGluIHRoZSBoaXQgem9uZSB0b2xlcmFuY2VcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubm90ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3Qgbm90ZSA9IHRoaXMubm90ZXNbaV07XHJcbiAgICAgICAgICAgIGlmIChub3RlLmxhbmUgPT09IGxhbmVJbmRleCAmJiAhbm90ZS5oaXQpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vdGVDZW50ZXJZID0gbm90ZS55ICsgbm90ZS5oZWlnaHQgLyAyO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaGl0Wm9uZUNlbnRlclkgPSB0aGlzLmNvbmZpZy5oaXRab25lWSArIHRoaXMuY29uZmlnLmhpdFpvbmVIZWlnaHQgLyAyO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZGlzdGFuY2UgPSBNYXRoLmFicyhub3RlQ2VudGVyWSAtIGhpdFpvbmVDZW50ZXJZKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZGlzdGFuY2UgPD0gdGhpcy5jb25maWcuaGl0VG9sZXJhbmNlICYmIGRpc3RhbmNlIDwgbWluRGlzdGFuY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICBiZXN0Tm90ZUluZGV4ID0gaTtcclxuICAgICAgICAgICAgICAgICAgICBtaW5EaXN0YW5jZSA9IGRpc3RhbmNlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYmVzdE5vdGVJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgY29uc3Qgbm90ZSA9IHRoaXMubm90ZXNbYmVzdE5vdGVJbmRleF07XHJcbiAgICAgICAgICAgIG5vdGUuaGl0ID0gdHJ1ZTsgLy8gTWFyayBhcyBoaXQgdG8gcHJldmVudCBkb3VibGUgaGl0dGluZ1xyXG4gICAgICAgICAgICB0aGlzLm5vdGVzLnNwbGljZShiZXN0Tm90ZUluZGV4LCAxKTsgLy8gUmVtb3ZlIGhpdCBub3RlXHJcblxyXG4gICAgICAgICAgICBsZXQgZmVlZGJhY2tDb2xvciA9ICcnO1xyXG4gICAgICAgICAgICBsZXQgc2NvcmVUb0FkZCA9IDA7XHJcbiAgICAgICAgICAgIGxldCBoZWFsdGhDaGFuZ2UgPSB0aGlzLmNvbmZpZy5oZWFsdGhHYWluT25IaXQ7XHJcblxyXG4gICAgICAgICAgICBpZiAobWluRGlzdGFuY2UgPD0gdGhpcy5jb25maWcucGVyZmVjdFRpbWluZ1RocmVzaG9sZCkge1xyXG4gICAgICAgICAgICAgICAgc2NvcmVUb0FkZCA9IHRoaXMuY29uZmlnLnNjb3JlUGVySGl0ICsgdGhpcy5jb25maWcucGVyZmVjdEJvbnVzO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb21ibysrO1xyXG4gICAgICAgICAgICAgICAgZmVlZGJhY2tDb2xvciA9IHRoaXMuY29uZmlnLnBlcmZlY3RDb2xvcjtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChtaW5EaXN0YW5jZSA8PSB0aGlzLmNvbmZpZy5nb29kVGltaW5nVGhyZXNob2xkKSB7XHJcbiAgICAgICAgICAgICAgICBzY29yZVRvQWRkID0gdGhpcy5jb25maWcuc2NvcmVQZXJIaXQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbWJvKys7XHJcbiAgICAgICAgICAgICAgICBmZWVkYmFja0NvbG9yID0gdGhpcy5jb25maWcuZ29vZENvbG9yO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gVGhpcyBjYXNlIHNob3VsZCBpZGVhbGx5IGJlIGNhdWdodCBieSBoaXRUb2xlcmFuY2UuIElmIGl0IG9jY3VycywgaXQncyBhIHdlYWsgaGl0LlxyXG4gICAgICAgICAgICAgICAgc2NvcmVUb0FkZCA9IE1hdGguZmxvb3IodGhpcy5jb25maWcuc2NvcmVQZXJIaXQgLyAyKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29tYm8rKztcclxuICAgICAgICAgICAgICAgIGZlZWRiYWNrQ29sb3IgPSB0aGlzLmNvbmZpZy5nb29kQ29sb3I7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gc2NvcmVUb0FkZDtcclxuICAgICAgICAgICAgdGhpcy5oZWFsdGggPSBNYXRoLm1pbih0aGlzLmNvbmZpZy5pbml0aWFsSGVhbHRoLCB0aGlzLmhlYWx0aCArIGhlYWx0aENoYW5nZSk7IC8vIENhcCBoZWFsdGhcclxuICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9oaXQnKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25QYXJ0aWNsZXMoJ3BlcmZlY3RfZWZmZWN0Jywgbm90ZS54ICsgbm90ZS53aWR0aCAvIDIsIG5vdGUueSArIG5vdGUuaGVpZ2h0IC8gMiwgZmVlZGJhY2tDb2xvcik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gS2V5IHByZXNzZWQgYnV0IG5vIG5vdGUgaW4gaGl0IHpvbmUgLT4gY29uc2lkZXIgaXQgYSBtaXNzXHJcbiAgICAgICAgICAgIHRoaXMuY29tYm8gPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmhlYWx0aCA9IE1hdGgubWF4KDAsIHRoaXMuaGVhbHRoICsgdGhpcy5jb25maWcuaGVhbHRoUGVuYWx0eU9uTWlzcyk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdzZnhfbWlzcycpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduUGFydGljbGVzKGltYWdlTmFtZTogc3RyaW5nLCB4OiBudW1iZXIsIHk6IG51bWJlciwgY29sb3I6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHBhcnRpY2xlQ291bnQgPSA1O1xyXG4gICAgICAgIGNvbnN0IHBhcnRpY2xlSW1hZ2UgPSB0aGlzLmFzc2V0cy5pbWFnZXNbaW1hZ2VOYW1lXT8uaW1nIHx8IG51bGw7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0aWNsZUNvdW50OyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgYW5nbGUgPSBNYXRoLnJhbmRvbSgpICogTWF0aC5QSSAqIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IHNwZWVkID0gTWF0aC5yYW5kb20oKSAqIDMgKyAxO1xyXG4gICAgICAgICAgICB0aGlzLmhpdEVmZmVjdFBhcnRpY2xlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIHg6IHgsXHJcbiAgICAgICAgICAgICAgICB5OiB5LFxyXG4gICAgICAgICAgICAgICAgdng6IE1hdGguY29zKGFuZ2xlKSAqIHNwZWVkLFxyXG4gICAgICAgICAgICAgICAgdnk6IE1hdGguc2luKGFuZ2xlKSAqIHNwZWVkIC0gTWF0aC5yYW5kb20oKSAqIDMgLSAxLCAvLyBVcHdhcmRzIGJpYXNcclxuICAgICAgICAgICAgICAgIGxpZmU6IDQ1ICsgTWF0aC5yYW5kb20oKSAqIDE1LCAvLyBmcmFtZXNcclxuICAgICAgICAgICAgICAgIGNvbG9yOiBjb2xvcixcclxuICAgICAgICAgICAgICAgIGltYWdlOiBwYXJ0aWNsZUltYWdlLFxyXG4gICAgICAgICAgICAgICAgc2l6ZTogTWF0aC5yYW5kb20oKSAqIDEwICsgMTUgLy8gTGFyZ2VyIHBhcnRpY2xlc1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCA9IChjdXJyZW50VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMubGFzdEZyYW1lVGltZSkgLyAxMDAwOyAvLyBpbiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0RnJhbWVUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5kcmF3KCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmdhbWVMb29wKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgY29uc3QgZWxhcHNlZFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKSAtIHRoaXMuZ2FtZVN0YXJ0VGltZTtcclxuXHJcbiAgICAgICAgICAgIC8vIEdlbmVyYXRlIG5vdGVzIGZyb20gYmVhdG1hcFxyXG4gICAgICAgICAgICB3aGlsZSAodGhpcy5iZWF0bWFwQ3VycmVudE5vdGVJbmRleCA8IHRoaXMuYmVhdG1hcC5ub3Rlcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vdGVEYXRhID0gdGhpcy5iZWF0bWFwLm5vdGVzW3RoaXMuYmVhdG1hcEN1cnJlbnROb3RlSW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgbm90ZUhpdFRpbWVNcyA9IG5vdGVEYXRhWzBdICsgdGhpcy5iZWF0bWFwLm9mZnNldDsgLy8gVGltZSBub3RlIHNob3VsZCBiZSBoaXRcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gU3Bhd24gdGhlIG5vdGUgaWYgY3VycmVudCB0aW1lIHJlYWNoZXMgaXRzIHNwYXduIHdpbmRvd1xyXG4gICAgICAgICAgICAgICAgaWYgKGVsYXBzZWRUaW1lID49IG5vdGVIaXRUaW1lTXMgLSB0aGlzLmNvbmZpZy5ub3RlRmFsbER1cmF0aW9uTXMpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBsYW5lSW5kZXggPSBub3RlRGF0YVsxXTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBub3RlSW1hZ2VOYW1lID0gdGhpcy5jb25maWcubm90ZUltYWdlTmFtZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdGhpcy5jb25maWcubm90ZUltYWdlTmFtZXMubGVuZ3RoKV07XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaW1hZ2VBc3NldCA9IHRoaXMuYXNzZXRzLmltYWdlc1tub3RlSW1hZ2VOYW1lXTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltYWdlQXNzZXQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbGFuZVggPSB0aGlzLmNvbmZpZy5sYW5lU3RhcnRYICsgbGFuZUluZGV4ICogKHRoaXMuY29uZmlnLmxhbmVXaWR0aCArIHRoaXMuY29uZmlnLmxhbmVHYXApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVXNlIGNvbmZpZ3VyZWQgbm90ZSBkaW1lbnNpb25zIGluc3RlYWQgb2YgaW1hZ2UgYXNzZXQgZGltZW5zaW9uc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBub3RlV2lkdGggPSB0aGlzLmNvbmZpZy5ub3RlV2lkdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5vdGVIZWlnaHQgPSB0aGlzLmNvbmZpZy5ub3RlSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5ub3Rlcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHg6IGxhbmVYICsgKHRoaXMuY29uZmlnLmxhbmVXaWR0aCAtIG5vdGVXaWR0aCkgLyAyLCAvLyBDZW50ZXIgbm90ZSBpbiBsYW5lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiAtbm90ZUhlaWdodCwgLy8gU3RhcnQgYWJvdmUgdGhlIHNjcmVlblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2lkdGg6IG5vdGVXaWR0aCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogbm90ZUhlaWdodCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhbmU6IGxhbmVJbmRleCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXJ0VGltZTogbm90ZUhpdFRpbWVNcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltYWdlOiBpbWFnZUFzc2V0LmltZyEsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBoaXQ6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJlYXRtYXBDdXJyZW50Tm90ZUluZGV4Kys7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBVcGRhdGUgbm90ZXMgcG9zaXRpb25zIGFuZCBjaGVjayBmb3IgYXV0by1taXNzZXNcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMubm90ZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vdGUgPSB0aGlzLm5vdGVzW2ldO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBDYWxjdWxhdGUgbm90ZSBZIHBvc2l0aW9uIGJhc2VkIG9uIHRhcmdldCBoaXQgdGltZSBhbmQgZmFsbCBkdXJhdGlvblxyXG4gICAgICAgICAgICAgICAgY29uc3QgdGltZVNpbmNlU3Bhd24gPSBlbGFwc2VkVGltZSAtIChub3RlLnN0YXJ0VGltZSAtIHRoaXMuY29uZmlnLm5vdGVGYWxsRHVyYXRpb25Ncyk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGltZVNpbmNlU3Bhd24gPCAwKSBjb250aW51ZTsgLy8gTm90ZSBub3QgeWV0IHNwYXduZWQgdmlzdWFsbHlcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBwcm9ncmVzcyA9IHRpbWVTaW5jZVNwYXduIC8gdGhpcy5jb25maWcubm90ZUZhbGxEdXJhdGlvbk1zO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGFyZ2V0Tm90ZVRvcFlBdEhpdCA9IHRoaXMuY29uZmlnLmhpdFpvbmVZICsgdGhpcy5jb25maWcuaGl0Wm9uZUhlaWdodCAvIDIgLSBub3RlLmhlaWdodCAvIDI7XHJcbiAgICAgICAgICAgICAgICBub3RlLnkgPSAtbm90ZS5oZWlnaHQgKyBwcm9ncmVzcyAqICh0YXJnZXROb3RlVG9wWUF0SGl0ICsgbm90ZS5oZWlnaHQpO1xyXG5cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBJZiBub3RlIHBhc3NlcyB0aGUgaGl0IHpvbmUgYm90dG9tIHdpdGhvdXQgYmVpbmcgaGl0XHJcbiAgICAgICAgICAgICAgICBpZiAoIW5vdGUuaGl0ICYmIChub3RlLnkgPiB0aGlzLmNvbmZpZy5oaXRab25lWSArIHRoaXMuY29uZmlnLmhpdFpvbmVIZWlnaHQgKyB0aGlzLmNvbmZpZy5ub3RlTWlzc09mZnNldCkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm5vdGVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbWJvID0gMDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmhlYWx0aCA9IE1hdGgubWF4KDAsIHRoaXMuaGVhbHRoICsgdGhpcy5jb25maWcuaGVhbHRoUGVuYWx0eU9uTWlzcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3NmeF9taXNzJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBwYXJ0aWNsZXNcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMuaGl0RWZmZWN0UGFydGljbGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwID0gdGhpcy5oaXRFZmZlY3RQYXJ0aWNsZXNbaV07XHJcbiAgICAgICAgICAgICAgICBwLnggKz0gcC52eDtcclxuICAgICAgICAgICAgICAgIHAueSArPSBwLnZ5O1xyXG4gICAgICAgICAgICAgICAgcC52eSArPSAwLjI7IC8vIEdyYXZpdHkgZWZmZWN0XHJcbiAgICAgICAgICAgICAgICBwLmxpZmUtLTtcclxuICAgICAgICAgICAgICAgIGlmIChwLmxpZmUgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaGl0RWZmZWN0UGFydGljbGVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIGdhbWUgb3ZlclxyXG4gICAgICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgLy8gR2FtZSBvdmVyIGlmIGhlYWx0aCBkcm9wcyB0byAwXHJcbiAgICAgICAgICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLm9uZW5kZWQgPSBudWxsOyAvLyBQcmV2ZW50IGZ1cnRoZXIgdHJpZ2dlclxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc29uZ0VuZGVkTmF0dXJhbGx5ICYmIHRoaXMuYmVhdG1hcEN1cnJlbnROb3RlSW5kZXggPj0gdGhpcy5iZWF0bWFwLm5vdGVzLmxlbmd0aCAmJiB0aGlzLm5vdGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgLy8gR2FtZSBvdmVyIGlmIEJHTSBoYXMgZmluaXNoZWQgQU5EIGFsbCBub3RlcyBoYXZlIGJlZW4gcHJvY2Vzc2VkIEFORCBubyBub3RlcyBhcmUgbGVmdCBvbiBzY3JlZW5cclxuICAgICAgICAgICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ub25lbmRlZCA9IG51bGw7IC8vIFByZXZlbnQgZnVydGhlciB0cmlnZ2VyXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhdygpIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgYmFja2dyb3VuZFxyXG4gICAgICAgIGNvbnN0IGJnSW1hZ2UgPSB0aGlzLmFzc2V0cy5pbWFnZXNbJ2JhY2tncm91bmQnXT8uaW1nO1xyXG4gICAgICAgIGlmIChiZ0ltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5iYWNrZ3JvdW5kQ29sb3I7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU46XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OU19TQ1JFRU46XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3UGxheWluZ1NjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnYm9sZCA0OHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLnRpdGxlU2NyZWVuLnRpdGxlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy50aXRsZVNjcmVlbi5zdGFydEJ1dHRvblRleHQsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gdGhpcy5jb25maWcudGV4dENvbG9yO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnYm9sZCAzNnB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLmluc3RydWN0aW9uU2NyZWVuLnRpdGxlLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDQpO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgY29uc3QgbGluZUhlaWdodCA9IDMwO1xyXG4gICAgICAgIGxldCB5ID0gdGhpcy5jYW52YXMuaGVpZ2h0IC8gMztcclxuICAgICAgICB0aGlzLmNvbmZpZy5pbnN0cnVjdGlvblNjcmVlbi5pbnN0cnVjdGlvbnMuZm9yRWFjaCgobGluZTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGxpbmUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgeSk7XHJcbiAgICAgICAgICAgIHkgKz0gbGluZUhlaWdodDtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHRoaXMuY29uZmlnLmluc3RydWN0aW9uU2NyZWVuLmNvbnRpbnVlQnV0dG9uVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLSAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1BsYXlpbmdTY3JlZW4oKSB7XHJcbiAgICAgICAgLy8gRHJhdyBDaHJpc3RtYXMgVHJlZVxyXG4gICAgICAgIGNvbnN0IHRyZWVBc3NldCA9IHRoaXMuYXNzZXRzLmltYWdlc1snY2hyaXN0bWFzX3RyZWUnXTtcclxuICAgICAgICBpZiAodHJlZUFzc2V0KSB7XHJcbiAgICAgICAgICAgIC8vIFBsYWNlIG9uIGJvdHRvbSBsZWZ0LCB3aXRoIHNvbWUgcGFkZGluZ1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoXHJcbiAgICAgICAgICAgICAgICB0cmVlQXNzZXQuaW1nLFxyXG4gICAgICAgICAgICAgICAgMzAsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgLSB0cmVlQXNzZXQuaGVpZ2h0IC0gMjAsXHJcbiAgICAgICAgICAgICAgICB0cmVlQXNzZXQud2lkdGgsXHJcbiAgICAgICAgICAgICAgICB0cmVlQXNzZXQuaGVpZ2h0XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IFNhbnRhIENsYXVzXHJcbiAgICAgICAgY29uc3Qgc2FudGFBc3NldCA9IHRoaXMuYXNzZXRzLmltYWdlc1snc2FudGFfY2xhdXMnXTtcclxuICAgICAgICBpZiAoc2FudGFBc3NldCkge1xyXG4gICAgICAgICAgICAvLyBQbGFjZSBvbiBib3R0b20gcmlnaHQsIHdpdGggc29tZSBwYWRkaW5nXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShcclxuICAgICAgICAgICAgICAgIHNhbnRhQXNzZXQuaW1nLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggLSBzYW50YUFzc2V0LndpZHRoIC0gMzAsXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgLSBzYW50YUFzc2V0LmhlaWdodCAtIDIwLFxyXG4gICAgICAgICAgICAgICAgc2FudGFBc3NldC53aWR0aCxcclxuICAgICAgICAgICAgICAgIHNhbnRhQXNzZXQuaGVpZ2h0XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IGhpdCB6b25lcyAoaW5kaWNhdG9ycylcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuY29uZmlnLm51bUxhbmVzOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgbGFuZVggPSB0aGlzLmNvbmZpZy5sYW5lU3RhcnRYICsgaSAqICh0aGlzLmNvbmZpZy5sYW5lV2lkdGggKyB0aGlzLmNvbmZpZy5sYW5lR2FwKTtcclxuICAgICAgICAgICAgY29uc3QgaW5kaWNhdG9ySW1hZ2UgPSB0aGlzLmFzc2V0cy5pbWFnZXNbJ2hpdF9pbmRpY2F0b3InXT8uaW1nO1xyXG5cclxuICAgICAgICAgICAgaWYgKGluZGljYXRvckltYWdlKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTY2FsZSBpbmRpY2F0b3IgaW1hZ2UgdG8gZmlsbCB0aGUgbGFuZSB3aWR0aCBhbmQgaGl0IHpvbmUgaGVpZ2h0XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoXHJcbiAgICAgICAgICAgICAgICAgICAgaW5kaWNhdG9ySW1hZ2UsXHJcbiAgICAgICAgICAgICAgICAgICAgbGFuZVgsXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuaGl0Wm9uZVksXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcubGFuZVdpZHRoLFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmhpdFpvbmVIZWlnaHRcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy5oaXRab25lQ29sb3I7IC8vIEZhbGxiYWNrIHRvIGNvbmZpZ3VyZWQgY29sb3JcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGxhbmVYLCB0aGlzLmNvbmZpZy5oaXRab25lWSwgdGhpcy5jb25maWcubGFuZVdpZHRoLCB0aGlzLmNvbmZpZy5oaXRab25lSGVpZ2h0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRHJhdyBsYW5lIGxpbmVzXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyM1NTU1NTUnO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5saW5lV2lkdGggPSAyO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5iZWdpblBhdGgoKTtcclxuICAgICAgICAgICAgdGhpcy5jdHgubW92ZVRvKGxhbmVYLCAwKTtcclxuICAgICAgICAgICAgdGhpcy5jdHgubGluZVRvKGxhbmVYLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5zdHJva2UoKTtcclxuICAgICAgICAgICAgdGhpcy5jdHguYmVnaW5QYXRoKCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4Lm1vdmVUbyhsYW5lWCArIHRoaXMuY29uZmlnLmxhbmVXaWR0aCwgMCk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmxpbmVUbyhsYW5lWCArIHRoaXMuY29uZmlnLmxhbmVXaWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICAgICAgdGhpcy5jdHguc3Ryb2tlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IG5vdGVzXHJcbiAgICAgICAgdGhpcy5ub3Rlcy5mb3JFYWNoKG5vdGUgPT4ge1xyXG4gICAgICAgICAgICBpZiAobm90ZS5pbWFnZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKG5vdGUuaW1hZ2UsIG5vdGUueCwgbm90ZS55LCBub3RlLndpZHRoLCBub3RlLmhlaWdodCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnI2YwMCc7IC8vIEZhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChub3RlLngsIG5vdGUueSwgbm90ZS53aWR0aCwgbm90ZS5oZWlnaHQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgcGFydGljbGVzXHJcbiAgICAgICAgdGhpcy5oaXRFZmZlY3RQYXJ0aWNsZXMuZm9yRWFjaChwID0+IHtcclxuICAgICAgICAgICAgaWYgKHAuaW1hZ2UpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4Lmdsb2JhbEFscGhhID0gcC5saWZlIC8gNjA7IC8vIEZhZGUgb3V0IGJhc2VkIG9uIGxpZmVcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShwLmltYWdlLCBwLnggLSBwLnNpemUgLyAyLCBwLnkgLSBwLnNpemUgLyAyLCBwLnNpemUsIHAuc2l6ZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5nbG9iYWxBbHBoYSA9IDE7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gcC5jb2xvcjtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4Lmdsb2JhbEFscGhhID0gcC5saWZlIC8gNjA7IC8vIEZhZGUgb3V0XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5iZWdpblBhdGgoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmFyYyhwLngsIHAueSwgcC5zaXplIC8gMiwgMCwgTWF0aC5QSSAqIDIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZ2xvYmFsQWxwaGEgPSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIERyYXcgVUlcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDODEwXHVDMjE4OiAke3RoaXMuc2NvcmV9YCwgMjAsIDQwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDRjY0XHVCQ0Y0OiAke3RoaXMuY29tYm99YCwgMjAsIDcwKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBIZWFsdGggQmFyXHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFyV2lkdGggPSAyMDA7XHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFySGVpZ2h0ID0gMjA7XHJcbiAgICAgICAgY29uc3QgaGVhbHRoQmFyWCA9IHRoaXMuY2FudmFzLndpZHRoIC0gaGVhbHRoQmFyV2lkdGggLSAyMDtcclxuICAgICAgICBjb25zdCBoZWFsdGhCYXJZID0gMzA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyM1NTUnOyAvLyBCYWNrZ3JvdW5kIG9mIGhlYWx0aCBiYXJcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBoZWFsdGhCYXJXaWR0aCwgaGVhbHRoQmFySGVpZ2h0KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBIZWFsdGggY29sb3IgZ3JhZGllbnQgZnJvbSByZWQgdG8gZ3JlZW5cclxuICAgICAgICBjb25zdCBoZWFsdGhSYXRpbyA9IHRoaXMuaGVhbHRoIC8gdGhpcy5jb25maWcuaW5pdGlhbEhlYWx0aDtcclxuICAgICAgICBjb25zdCBodWUgPSBoZWFsdGhSYXRpbyAqIDEyMDsgLy8gMCAocmVkKSB0byAxMjAgKGdyZWVuKVxyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IGBoc2woJHtodWV9LCAxMDAlLCA1MCUpYDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBoZWFsdGhSYXRpbyAqIGhlYWx0aEJhcldpZHRoLCBoZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuY3R4LnN0cm9rZVN0eWxlID0gJyNmZmYnO1xyXG4gICAgICAgIHRoaXMuY3R4LmxpbmVXaWR0aCA9IDE7XHJcbiAgICAgICAgdGhpcy5jdHguc3Ryb2tlUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBoZWFsdGhCYXJXaWR0aCwgaGVhbHRoQmFySGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlclNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSB0aGlzLmNvbmZpZy50ZXh0Q29sb3I7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9ICdib2xkIDQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQodGhpcy5jb25maWcuZ2FtZU92ZXJTY3JlZW4udGl0bGUsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDEwMCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMzZweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgXHVDRDVDXHVDODg1IFx1QzgxMFx1QzIxODogJHt0aGlzLnNjb3JlfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFx1Q0Q1Q1x1QUNFMCBcdUNGNjRcdUJDRjQ6ICR7dGhpcy5jb21ib31gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dCh0aGlzLmNvbmZpZy5nYW1lT3ZlclNjcmVlbi5yZXN0YXJ0QnV0dG9uVGV4dCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTUwKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gR2xvYmFsIHNjb3BlXHJcbndpbmRvdy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICBjb25zdCBnYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnKTtcclxuICAgIGdhbWUuaW5pdCgpO1xyXG59O1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUE0RkEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFKQyxTQUFBQTtBQUFBLEdBQUE7QUE2QkwsTUFBTSxLQUFLO0FBQUE7QUFBQSxFQTBCUCxZQUFZLFVBQWtCO0FBZjlCO0FBQUEsU0FBUSxZQUF1QjtBQUcvQjtBQUFBLFNBQVEsUUFBZ0I7QUFDeEIsU0FBUSxRQUFnQjtBQUN4QixTQUFRLFNBQWlCO0FBQ3pCLFNBQVEsUUFBZ0IsQ0FBQztBQUN6QixTQUFRLGNBQTJCLG9CQUFJLElBQUk7QUFDM0MsU0FBUSxnQkFBcUM7QUFDN0MsU0FBUSwwQkFBa0M7QUFDMUMsU0FBUSxnQkFBcUM7QUFDN0MsU0FBUSxXQUFvQztBQUM1QyxTQUFRLHFCQUFpQyxDQUFDO0FBQzFDLFNBQVEscUJBQThCO0FBaUh0QyxTQUFRLGdCQUFn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
