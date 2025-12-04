var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2["TITLE"] = "TITLE";
  GameState2["PLAYING"] = "PLAYING";
  GameState2["GAME_OVER"] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var NoteState = /* @__PURE__ */ ((NoteState2) => {
  NoteState2["FALLING"] = "FALLING";
  NoteState2["HIT"] = "HIT";
  NoteState2["MISSED"] = "MISSED";
  NoteState2["PASSED"] = "PASSED";
  return NoteState2;
})(NoteState || {});
class Note {
  constructor(lane, arrivalTime, game) {
    this.lane = lane;
    this.arrivalTime = arrivalTime;
    this.state = "FALLING" /* FALLING */;
    const settings = game.gameData.gameSettings;
    this.fallDuration = (settings.hitZoneY - settings.noteSpawnY) / settings.noteSpeed;
    this.spawnTime = this.arrivalTime - this.fallDuration;
    this.width = settings.noteWidth;
    this.height = settings.noteHeight;
    const totalLanesWidth = settings.laneCount * settings.laneWidth + (settings.laneCount - 1) * settings.laneSpacing;
    const startX = (settings.canvasWidth - totalLanesWidth) / 2;
    this.x = startX + lane * (settings.laneWidth + settings.laneSpacing) + (settings.laneWidth - this.width) / 2;
    this.y = settings.noteSpawnY;
  }
  update(currentTime, game) {
    if (this.state !== "FALLING" /* FALLING */) return;
    const settings = game.gameData.gameSettings;
    const progress = Math.max(0, Math.min(1, (currentTime - this.spawnTime) / this.fallDuration));
    this.y = settings.noteSpawnY + progress * (settings.hitZoneY - settings.noteSpawnY);
    if (currentTime > this.arrivalTime + settings.hitWindowGood && this.state === "FALLING" /* FALLING */) {
      this.state = "PASSED" /* PASSED */;
      game.handleMiss();
    }
  }
  draw(ctx, noteImage) {
    if (this.state === "FALLING" /* FALLING */ || this.state === "HIT" /* HIT */) {
      ctx.drawImage(noteImage, this.x, this.y, this.width, this.height);
    }
  }
}
class Game {
  // For single-press events
  constructor(canvasId) {
    // Changed from private to public readonly
    this.loadedImages = /* @__PURE__ */ new Map();
    this.loadedSounds = /* @__PURE__ */ new Map();
    this.gameState = "TITLE" /* TITLE */;
    this.lastTime = 0;
    this.currentAudioTime = 0;
    // The official game time, synced with BGM
    this.bgmAudio = null;
    this.bgmStartTime = 0;
    // performance.now() when BGM started playing
    this.activeNotes = [];
    this.beatmapIndex = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalHits = 0;
    this.perfectHits = 0;
    this.goodHits = 0;
    this.missHits = 0;
    this.pressedKeys = /* @__PURE__ */ new Set();
    this.justPressedKeys = /* @__PURE__ */ new Set();
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas element with ID '${canvasId}' not found.`);
    }
    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      throw new Error("Failed to get 2D rendering context.");
    }
    this.addEventListeners();
  }
  addEventListeners() {
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
    window.addEventListener("keyup", (e) => this.handleKeyUp(e));
    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
    });
  }
  handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (!this.pressedKeys.has(key)) {
      this.pressedKeys.add(key);
      this.justPressedKeys.add(key);
    }
  }
  handleKeyUp(event) {
    const key = event.key.toLowerCase();
    this.pressedKeys.delete(key);
  }
  async init() {
    console.log("Loading game data...");
    try {
      const response = await fetch("data.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.gameData = await response.json();
      console.log("Game data loaded:", this.gameData);
      this.canvas.width = this.gameData.gameSettings.canvasWidth;
      this.canvas.height = this.gameData.gameSettings.canvasHeight;
      await this.loadAssets();
      console.log("Assets loaded.");
      this.startTitleScreen();
      this.gameLoop(0);
    } catch (error) {
      console.error("Failed to initialize game:", error);
      this.ctx.font = "20px Arial";
      this.ctx.fillStyle = "red";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Failed to load game. Check console for details.", this.canvas.width / 2, this.canvas.height / 2);
    }
  }
  async loadAssets() {
    const imagePromises = this.gameData.assets.images.map((img) => {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = img.path;
        image.onload = () => {
          this.loadedImages.set(img.name, image);
          resolve();
        };
        image.onerror = () => reject(`Failed to load image: ${img.path}`);
      });
    });
    const soundPromises = this.gameData.assets.sounds.map((snd) => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.src = snd.path;
        audio.volume = snd.volume;
        audio.preload = "auto";
        audio.oncanplaythrough = () => {
          this.loadedSounds.set(snd.name, audio);
          resolve();
        };
        audio.onerror = () => reject(`Failed to load sound: ${snd.path}`);
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  startTitleScreen() {
    this.gameState = "TITLE" /* TITLE */;
    this.resetGameStats();
  }
  startGame() {
    this.gameState = "PLAYING" /* PLAYING */;
    this.activeNotes = [];
    this.beatmapIndex = 0;
    this.resetGameStats();
    this.bgmAudio = this.loadedSounds.get("bgm") || null;
    if (this.bgmAudio) {
      this.bgmAudio.currentTime = 0;
      this.bgmAudio.loop = true;
      this.bgmAudio.play().then(() => {
        this.bgmStartTime = performance.now();
        this.currentAudioTime = 0;
        console.log("BGM started.");
      }).catch((error) => {
        console.warn("BGM autoplay prevented:", error);
        this.bgmStartTime = performance.now();
        this.currentAudioTime = 0;
      });
    }
  }
  endGame() {
    this.gameState = "GAME_OVER" /* GAME_OVER */;
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
    }
  }
  resetGameStats() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalHits = 0;
    this.perfectHits = 0;
    this.goodHits = 0;
    this.missHits = 0;
  }
  gameLoop(time) {
    const deltaTime = (time - this.lastTime) / 1e3;
    this.lastTime = time;
    this.update(deltaTime);
    this.draw();
    this.justPressedKeys.clear();
    requestAnimationFrame((t) => this.gameLoop(t));
  }
  update(deltaTime) {
    switch (this.gameState) {
      case "TITLE" /* TITLE */:
        this.updateTitleScreen();
        break;
      case "PLAYING" /* PLAYING */:
        this.updatePlaying(deltaTime);
        break;
      case "GAME_OVER" /* GAME_OVER */:
        this.updateGameOver();
        break;
    }
  }
  updateTitleScreen() {
    if (this.justPressedKeys.size > 0) {
      this.startGame();
    }
  }
  updatePlaying(deltaTime) {
    if (this.bgmAudio && !this.bgmAudio.paused) {
      this.currentAudioTime = this.bgmAudio.currentTime;
    } else {
      this.currentAudioTime = (performance.now() - this.bgmStartTime) / 1e3;
    }
    while (this.beatmapIndex < this.gameData.beatmap.length) {
      const nextNoteData = this.gameData.beatmap[this.beatmapIndex];
      if (nextNoteData.time - this.activeNotes.length * 0.1 <= this.currentAudioTime + 2) {
        const note = new Note(nextNoteData.lane, nextNoteData.time, this);
        this.activeNotes.push(note);
        this.beatmapIndex++;
      } else {
        break;
      }
    }
    for (let i = this.activeNotes.length - 1; i >= 0; i--) {
      const note = this.activeNotes[i];
      note.update(this.currentAudioTime, this);
      if (note.state === "HIT" /* HIT */ || note.state === "PASSED" /* PASSED */) {
        this.activeNotes.splice(i, 1);
      }
    }
    const laneKeys = this.gameData.gameSettings.laneKeys;
    for (let i = 0; i < laneKeys.length; i++) {
      const key = laneKeys[i];
      if (this.justPressedKeys.has(key)) {
        this.handlePlayerInput(i, this.currentAudioTime);
      }
    }
    if (this.bgmAudio && this.bgmAudio.ended && this.activeNotes.length === 0) {
      this.endGame();
    } else if (this.currentAudioTime > (this.bgmAudio?.duration || this.gameData.assets.sounds.find((s) => s.name === "bgm")?.duration_seconds || 0) + 2 && this.activeNotes.length === 0) {
      this.endGame();
    }
  }
  updateGameOver() {
    if (this.justPressedKeys.size > 0) {
      this.startTitleScreen();
    }
  }
  handlePlayerInput(lane, inputTime) {
    const settings = this.gameData.gameSettings;
    let bestNoteIndex = -1;
    let smallestDelta = Infinity;
    for (let i = 0; i < this.activeNotes.length; i++) {
      const note = this.activeNotes[i];
      if (note.lane === lane && note.state === "FALLING" /* FALLING */) {
        const delta = Math.abs(inputTime - note.arrivalTime);
        if (delta < smallestDelta) {
          smallestDelta = delta;
          bestNoteIndex = i;
        }
      }
    }
    if (bestNoteIndex !== -1) {
      const note = this.activeNotes[bestNoteIndex];
      if (smallestDelta <= settings.hitWindowPerfect) {
        this.applyScore("perfect");
        note.state = "HIT" /* HIT */;
        this.perfectHits++;
        this.playEffect("hitEffect");
      } else if (smallestDelta <= settings.hitWindowGood) {
        this.applyScore("good");
        note.state = "HIT" /* HIT */;
        this.goodHits++;
        this.playEffect("hitEffect");
      } else {
        this.handleMiss();
        this.playEffect("missEffect");
      }
    } else {
      this.handleMiss();
      this.playEffect("missEffect");
    }
  }
  applyScore(type) {
    const settings = this.gameData.gameSettings;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.totalHits++;
    let scoreValue = 0;
    if (type === "perfect") {
      scoreValue = settings.scorePerPerfect;
    } else if (type === "good") {
      scoreValue = settings.scorePerGood;
    }
    let currentMultiplier = 1;
    if (this.combo >= settings.comboThreshold) {
      currentMultiplier += Math.floor(this.combo / settings.comboThreshold) * settings.multiplierPerCombo;
    }
    this.score += scoreValue * currentMultiplier;
  }
  handleMiss() {
    this.combo = 0;
    this.missHits++;
    this.totalHits++;
    this.score -= this.gameData.gameSettings.scorePenaltyPerMiss;
    if (this.score < 0) {
      this.endGame();
    }
    this.playEffect("missEffect");
  }
  playEffect(name) {
    const audio = this.loadedSounds.get(name);
    if (audio) {
      const clone = audio.cloneNode();
      clone.volume = audio.volume;
      clone.play().catch((e) => console.warn(`Sound effect playback blocked: ${name}`, e));
    }
  }
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawBackground();
    switch (this.gameState) {
      case "TITLE" /* TITLE */:
        this.drawTitleScreen();
        break;
      case "PLAYING" /* PLAYING */:
        this.drawPlaying();
        break;
      case "GAME_OVER" /* GAME_OVER */:
        this.drawGameOver();
        break;
    }
  }
  drawBackground() {
    const backgroundImage = this.loadedImages.get("background");
    if (backgroundImage) {
      this.ctx.drawImage(backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = "#1a1a1a";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
  drawTitleScreen() {
    this.ctx.fillStyle = "white";
    this.ctx.font = "bold 48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Rhythm Game", this.canvas.width / 2, this.canvas.height / 2 - 50);
    this.ctx.font = "24px Arial";
    this.ctx.fillText("Press Any Key to Start", this.canvas.width / 2, this.canvas.height / 2 + 20);
  }
  drawPlaying() {
    const settings = this.gameData.gameSettings;
    const noteImage = this.loadedImages.get("note");
    const hitZoneImage = this.loadedImages.get("hitZone");
    const totalLanesWidth = settings.laneCount * settings.laneWidth + (settings.laneCount - 1) * settings.laneSpacing;
    const startX = (settings.canvasWidth - totalLanesWidth) / 2;
    for (let i = 0; i < settings.laneCount; i++) {
      const laneX = startX + i * (settings.laneWidth + settings.laneSpacing);
      this.ctx.fillStyle = "#333333";
      this.ctx.fillRect(laneX, 0, settings.laneWidth, this.canvas.height);
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      this.ctx.font = "20px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText(settings.laneKeys[i].toUpperCase(), laneX + settings.laneWidth / 2, settings.hitZoneY + 50);
      if (hitZoneImage) {
        this.ctx.drawImage(hitZoneImage, laneX, settings.hitZoneY - hitZoneImage.height / 2, settings.laneWidth, hitZoneImage.height);
      } else {
        this.ctx.fillStyle = "#00ffff";
        this.ctx.fillRect(laneX, settings.hitZoneY, settings.laneWidth, 5);
      }
      if (this.pressedKeys.has(settings.laneKeys[i])) {
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        this.ctx.fillRect(laneX, settings.hitZoneY - 20, settings.laneWidth, 40);
      }
    }
    this.activeNotes.forEach((note) => {
      if (noteImage) {
        note.draw(this.ctx, noteImage);
      } else {
        this.ctx.fillStyle = "red";
        this.ctx.fillRect(note.x, note.y, note.width, note.height);
      }
    });
    this.ctx.fillStyle = "white";
    this.ctx.font = "30px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`Score: ${Math.floor(this.score)}`, 20, 40);
    this.ctx.textAlign = "right";
    this.ctx.fillText(`Combo: ${this.combo}`, this.canvas.width - 20, 40);
  }
  drawGameOver() {
    this.ctx.fillStyle = "white";
    this.ctx.font = "bold 48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Game Over!", this.canvas.width / 2, this.canvas.height / 2 - 100);
    this.ctx.font = "30px Arial";
    this.ctx.fillText(`Final Score: ${Math.floor(this.score)}`, this.canvas.width / 2, this.canvas.height / 2 - 20);
    this.ctx.fillText(`Max Combo: ${this.maxCombo}`, this.canvas.width / 2, this.canvas.height / 2 + 30);
    const totalNotesHit = this.perfectHits + this.goodHits;
    const accuracy = this.totalHits > 0 ? totalNotesHit / this.totalHits * 100 : 0;
    this.ctx.fillText(`Accuracy: ${accuracy.toFixed(2)}%`, this.canvas.width / 2, this.canvas.height / 2 + 80);
    this.ctx.font = "24px Arial";
    this.ctx.fillText("Press Any Key to Restart", this.canvas.width / 2, this.canvas.height / 2 + 150);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const game = new Game("gameCanvas");
  game.init();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gZ2FtZS50c1xyXG5cclxuaW50ZXJmYWNlIEFzc2V0SW1hZ2Uge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXNzZXRTb3VuZCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBub3RlU3BlZWQ6IG51bWJlcjsgLy8gcGl4ZWxzIHBlciBzZWNvbmRcclxuICAgIGhpdFpvbmVZOiBudW1iZXI7IC8vIFktY29vcmRpbmF0ZSBvZiB0aGUgaGl0IHpvbmVcclxuICAgIG5vdGVTcGF3blk6IG51bWJlcjsgLy8gWS1jb29yZGluYXRlIHdoZXJlIG5vdGVzIGFwcGVhclxyXG4gICAgbm90ZVdpZHRoOiBudW1iZXI7XHJcbiAgICBub3RlSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBsYW5lQ291bnQ6IG51bWJlcjtcclxuICAgIGxhbmVXaWR0aDogbnVtYmVyO1xyXG4gICAgbGFuZVNwYWNpbmc6IG51bWJlcjsgLy8gU3BhY2luZyBiZXR3ZWVuIGxhbmVzXHJcbiAgICBsYW5lS2V5czogc3RyaW5nW107IC8vIEtleXMgY29ycmVzcG9uZGluZyB0byBlYWNoIGxhbmVcclxuICAgIGhpdFdpbmRvd1BlcmZlY3Q6IG51bWJlcjsgLy8gVGltZSB3aW5kb3cgZm9yIHBlcmZlY3QgaGl0ICgrLy0gc2Vjb25kcylcclxuICAgIGhpdFdpbmRvd0dvb2Q6IG51bWJlcjsgLy8gVGltZSB3aW5kb3cgZm9yIGdvb2QgaGl0ICgrLy0gc2Vjb25kcylcclxuICAgIHNjb3JlUGVyUGVyZmVjdDogbnVtYmVyO1xyXG4gICAgc2NvcmVQZXJHb29kOiBudW1iZXI7XHJcbiAgICBjb21ib1RocmVzaG9sZDogbnVtYmVyOyAvLyBDb21ibyBzdGFydHMgY29udHJpYnV0aW5nIHNjb3JlIGFmdGVyIHRoaXMgbWFueSBoaXRzXHJcbiAgICBtdWx0aXBsaWVyUGVyQ29tYm86IG51bWJlcjsgLy8gU2NvcmUgbXVsdGlwbGllciBpbmNyZWFzZSBwZXIgY29tYm8gdGllclxyXG4gICAgc2NvcmVQZW5hbHR5UGVyTWlzczogbnVtYmVyOyAvLyBOZXc6IFNjb3JlIGRlZHVjdGVkIHdoZW4gYSBub3RlIGlzIG1pc3NlZCBvciBwYXNzZWRcclxufVxyXG5cclxuaW50ZXJmYWNlIEJlYXRtYXBOb3RlIHtcclxuICAgIHRpbWU6IG51bWJlcjsgLy8gVGltZSBpbiBzZWNvbmRzIHdoZW4gdGhlIG5vdGUgc2hvdWxkIGJlIGhpdFxyXG4gICAgbGFuZTogbnVtYmVyOyAvLyBMYW5lIGluZGV4ICgwIHRvIGxhbmVDb3VudC0xKVxyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZURhdGEge1xyXG4gICAgZ2FtZVNldHRpbmdzOiBHYW1lU2V0dGluZ3M7XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEFzc2V0SW1hZ2VbXTtcclxuICAgICAgICBzb3VuZHM6IEFzc2V0U291bmRbXTtcclxuICAgIH07XHJcbiAgICBiZWF0bWFwOiBCZWF0bWFwTm90ZVtdO1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSA9IFwiVElUTEVcIixcclxuICAgIFBMQVlJTkcgPSBcIlBMQVlJTkdcIixcclxuICAgIEdBTUVfT1ZFUiA9IFwiR0FNRV9PVkVSXCIsXHJcbn1cclxuXHJcbmVudW0gTm90ZVN0YXRlIHtcclxuICAgIEZBTExJTkcgPSBcIkZBTExJTkdcIixcclxuICAgIEhJVCA9IFwiSElUXCIsXHJcbiAgICBNSVNTRUQgPSBcIk1JU1NFRFwiLFxyXG4gICAgUEFTU0VEID0gXCJQQVNTRURcIiwgLy8gUGFzc2VkIGhpdCB6b25lIHdpdGhvdXQgaW5wdXRcclxufVxyXG5cclxuY2xhc3MgTm90ZSB7XHJcbiAgICBsYW5lOiBudW1iZXI7XHJcbiAgICBzcGF3blRpbWU6IG51bWJlcjsgLy8gVGltZSB3aGVuIG5vdGUgYXBwZWFycyBhdCBub3RlU3Bhd25ZXHJcbiAgICBhcnJpdmFsVGltZTogbnVtYmVyOyAvLyBUaW1lIHdoZW4gbm90ZSByZWFjaGVzIGhpdFpvbmVZXHJcbiAgICBzdGF0ZTogTm90ZVN0YXRlO1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgZmFsbER1cmF0aW9uOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IobGFuZTogbnVtYmVyLCBhcnJpdmFsVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgdGhpcy5sYW5lID0gbGFuZTtcclxuICAgICAgICB0aGlzLmFycml2YWxUaW1lID0gYXJyaXZhbFRpbWU7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IE5vdGVTdGF0ZS5GQUxMSU5HO1xyXG5cclxuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGdhbWUuZ2FtZURhdGEuZ2FtZVNldHRpbmdzOyAvLyBBY2Nlc3NpbmcgZ2FtZURhdGFcclxuICAgICAgICB0aGlzLmZhbGxEdXJhdGlvbiA9IChzZXR0aW5ncy5oaXRab25lWSAtIHNldHRpbmdzLm5vdGVTcGF3blkpIC8gc2V0dGluZ3Mubm90ZVNwZWVkO1xyXG4gICAgICAgIHRoaXMuc3Bhd25UaW1lID0gdGhpcy5hcnJpdmFsVGltZSAtIHRoaXMuZmFsbER1cmF0aW9uO1xyXG5cclxuICAgICAgICB0aGlzLndpZHRoID0gc2V0dGluZ3Mubm90ZVdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gc2V0dGluZ3Mubm90ZUhlaWdodDtcclxuXHJcbiAgICAgICAgY29uc3QgdG90YWxMYW5lc1dpZHRoID0gc2V0dGluZ3MubGFuZUNvdW50ICogc2V0dGluZ3MubGFuZVdpZHRoICsgKHNldHRpbmdzLmxhbmVDb3VudCAtIDEpICogc2V0dGluZ3MubGFuZVNwYWNpbmc7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRYID0gKHNldHRpbmdzLmNhbnZhc1dpZHRoIC0gdG90YWxMYW5lc1dpZHRoKSAvIDI7XHJcbiAgICAgICAgdGhpcy54ID0gc3RhcnRYICsgbGFuZSAqIChzZXR0aW5ncy5sYW5lV2lkdGggKyBzZXR0aW5ncy5sYW5lU3BhY2luZykgKyAoc2V0dGluZ3MubGFuZVdpZHRoIC0gdGhpcy53aWR0aCkgLyAyO1xyXG5cclxuICAgICAgICB0aGlzLnkgPSBzZXR0aW5ncy5ub3RlU3Bhd25ZOyAvLyBJbml0aWFsIFkgcG9zaXRpb25cclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoY3VycmVudFRpbWU6IG51bWJlciwgZ2FtZTogR2FtZSkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlICE9PSBOb3RlU3RhdGUuRkFMTElORykgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IGdhbWUuZ2FtZURhdGEuZ2FtZVNldHRpbmdzOyAvLyBBY2Nlc3NpbmcgZ2FtZURhdGFcclxuICAgICAgICBjb25zdCBwcm9ncmVzcyA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIChjdXJyZW50VGltZSAtIHRoaXMuc3Bhd25UaW1lKSAvIHRoaXMuZmFsbER1cmF0aW9uKSk7XHJcbiAgICAgICAgdGhpcy55ID0gc2V0dGluZ3Mubm90ZVNwYXduWSArIHByb2dyZXNzICogKHNldHRpbmdzLmhpdFpvbmVZIC0gc2V0dGluZ3Mubm90ZVNwYXduWSk7XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50VGltZSA+IHRoaXMuYXJyaXZhbFRpbWUgKyBzZXR0aW5ncy5oaXRXaW5kb3dHb29kICYmIHRoaXMuc3RhdGUgPT09IE5vdGVTdGF0ZS5GQUxMSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBOb3RlU3RhdGUuUEFTU0VEO1xyXG4gICAgICAgICAgICBnYW1lLmhhbmRsZU1pc3MoKTsgLy8gQ2FsbGluZyBoYW5kbGVNaXNzXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRyYXcoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIG5vdGVJbWFnZTogSFRNTEltYWdlRWxlbWVudCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBOb3RlU3RhdGUuRkFMTElORyB8fCB0aGlzLnN0YXRlID09PSBOb3RlU3RhdGUuSElUKSB7IC8vIERyYXcgSElUIG5vdGVzIGJyaWVmbHkgZm9yIGZlZWRiYWNrXHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2Uobm90ZUltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgcHVibGljIHJlYWRvbmx5IGdhbWVEYXRhITogR2FtZURhdGE7IC8vIENoYW5nZWQgZnJvbSBwcml2YXRlIHRvIHB1YmxpYyByZWFkb25seVxyXG4gICAgcHJpdmF0ZSBsb2FkZWRJbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRTb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBjdXJyZW50QXVkaW9UaW1lOiBudW1iZXIgPSAwOyAvLyBUaGUgb2ZmaWNpYWwgZ2FtZSB0aW1lLCBzeW5jZWQgd2l0aCBCR01cclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYmdtU3RhcnRUaW1lOiBudW1iZXIgPSAwOyAvLyBwZXJmb3JtYW5jZS5ub3coKSB3aGVuIEJHTSBzdGFydGVkIHBsYXlpbmdcclxuXHJcbiAgICBwcml2YXRlIGFjdGl2ZU5vdGVzOiBOb3RlW10gPSBbXTtcclxuICAgIHByaXZhdGUgYmVhdG1hcEluZGV4OiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGNvbWJvOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBtYXhDb21ibzogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgdG90YWxIaXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBwZXJmZWN0SGl0czogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgZ29vZEhpdHM6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1pc3NIaXRzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgcHJlc3NlZEtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xyXG4gICAgcHJpdmF0ZSBqdXN0UHJlc3NlZEtleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpOyAvLyBGb3Igc2luZ2xlLXByZXNzIGV2ZW50c1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGNhbnZhc0lkKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCAnJHtjYW52YXNJZH0nIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KFwiMmRcIikhO1xyXG4gICAgICAgIGlmICghdGhpcy5jdHgpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRmFpbGVkIHRvIGdldCAyRCByZW5kZXJpbmcgY29udGV4dC5cIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmFkZEV2ZW50TGlzdGVuZXJzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhZGRFdmVudExpc3RlbmVycygpIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHRoaXMuaGFuZGxlS2V5RG93bihlKSk7XHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCAoZSkgPT4gdGhpcy5oYW5kbGVLZXlVcChlKSk7XHJcbiAgICAgICAgLy8gUHJldmVudCBkZWZhdWx0IGJlaGF2aW9yIGZvciBhcnJvdyBrZXlzIGFuZCBzcGFjZWJhciwgY29tbW9ubHkgdXNlZCBpbiBnYW1lc1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoW1wiU3BhY2VcIiwgXCJBcnJvd1VwXCIsIFwiQXJyb3dEb3duXCIsIFwiQXJyb3dMZWZ0XCIsIFwiQXJyb3dSaWdodFwiXS5pbmNsdWRlcyhlLmNvZGUpKSB7XHJcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICBjb25zdCBrZXkgPSBldmVudC5rZXkudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICBpZiAoIXRoaXMucHJlc3NlZEtleXMuaGFzKGtleSkpIHtcclxuICAgICAgICAgICAgdGhpcy5wcmVzc2VkS2V5cy5hZGQoa2V5KTtcclxuICAgICAgICAgICAgdGhpcy5qdXN0UHJlc3NlZEtleXMuYWRkKGtleSk7IC8vIE1hcmsgYXMganVzdCBwcmVzc2VkXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICBjb25zdCBrZXkgPSBldmVudC5rZXkudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICB0aGlzLnByZXNzZWRLZXlzLmRlbGV0ZShrZXkpO1xyXG4gICAgICAgIC8vIERvIG5vdCByZW1vdmUgZnJvbSBqdXN0UHJlc3NlZEtleXMgaGVyZSwgaXQgd2lsbCBiZSBjbGVhcmVkIGF0IHRoZSBzdGFydCBvZiB1cGRhdGUgZnJhbWVcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiTG9hZGluZyBnYW1lIGRhdGEuLi5cIik7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChcImRhdGEuanNvblwiKTtcclxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vIGdhbWVEYXRhIGlzIGluaXRpYWxpemVkIGhlcmUsIHNvIHJlYWRvbmx5IGlzIGFwcHJvcHJpYXRlXHJcbiAgICAgICAgICAgICh0aGlzLmdhbWVEYXRhIGFzIEdhbWVEYXRhKSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBHYW1lRGF0YTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJHYW1lIGRhdGEgbG9hZGVkOlwiLCB0aGlzLmdhbWVEYXRhKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkFzc2V0cyBsb2FkZWQuXCIpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zdGFydFRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZUxvb3AoMCk7IC8vIFN0YXJ0IHRoZSBnYW1lIGxvb3BcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGluaXRpYWxpemUgZ2FtZTpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBEaXNwbGF5IGFuIGVycm9yIG1lc3NhZ2Ugb24gdGhlIGNhbnZhcyBpZiBpbml0aWFsaXphdGlvbiBmYWlsc1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIyMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwicmVkXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFwiRmFpbGVkIHRvIGxvYWQgZ2FtZS4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy5cIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCkge1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmdhbWVEYXRhLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgaW1hZ2Uuc3JjID0gaW1nLnBhdGg7XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRJbWFnZXMuc2V0KGltZy5uYW1lLCBpbWFnZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGltYWdlLm9uZXJyb3IgPSAoKSA9PiByZWplY3QoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZy5wYXRofWApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuZ2FtZURhdGEuYXNzZXRzLnNvdW5kcy5tYXAoc25kID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5zcmMgPSBzbmQucGF0aDtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5wcmVsb2FkID0gXCJhdXRvXCI7XHJcbiAgICAgICAgICAgICAgICAvLyBUbyBhdm9pZCBpc3N1ZXMgd2l0aCBhdXRvcGxheSBwb2xpY2llcywgd2Ugb25seSB0cnkgdG8gbG9hZCBhbmQgYXR0YWNoXHJcbiAgICAgICAgICAgICAgICAvLyBUaGUgYWN0dWFsIHBsYXliYWNrIHdpbGwgYmUgaW5pdGlhdGVkIGJ5IHVzZXIgaW50ZXJhY3Rpb24uXHJcbiAgICAgICAgICAgICAgICAvLyBGb3Igc291bmQgZWZmZWN0cywgdGhleSBhcmUgdHlwaWNhbGx5IHNob3J0IGFuZCBjYW4gYmUgcGxheWVkIG9uIGRlbWFuZC5cclxuICAgICAgICAgICAgICAgIC8vIEZvciBCR00sIGl0IG5lZWRzIHRvIGJlIHJlYWR5IHRvIHBsYXkgd2hlbiB0aGUgZ2FtZSBzdGFydHMuXHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkU291bmRzLnNldChzbmQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzbmQucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydFRpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgICAgIHRoaXMucmVzZXRHYW1lU3RhdHMoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIHRoaXMuYWN0aXZlTm90ZXMgPSBbXTtcclxuICAgICAgICB0aGlzLmJlYXRtYXBJbmRleCA9IDA7XHJcbiAgICAgICAgdGhpcy5yZXNldEdhbWVTdGF0cygpO1xyXG5cclxuICAgICAgICB0aGlzLmJnbUF1ZGlvID0gdGhpcy5sb2FkZWRTb3VuZHMuZ2V0KFwiYmdtXCIpIHx8IG51bGw7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ubG9vcCA9IHRydWU7IC8vIExvb3AgQkdNIGZvciBjb250aW51b3VzIHBsYXkgdW50aWwgZ2FtZSBlbmRzXHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGxheSgpLnRoZW4oKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21TdGFydFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEF1ZGlvVGltZSA9IDA7IC8vIEluaXRpYWxpemUgZ2FtZSB0aW1lXHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkJHTSBzdGFydGVkLlwiKTtcclxuICAgICAgICAgICAgfSkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwiQkdNIGF1dG9wbGF5IHByZXZlbnRlZDpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgLy8gSWYgYXV0b3BsYXkgaXMgYmxvY2tlZCwgZ2FtZSBtaWdodCBiZSBvdXQgb2Ygc3luYy5cclxuICAgICAgICAgICAgICAgIC8vIEZvciBzaW1wbGljaXR5LCB3ZSdsbCBwcm9jZWVkIGJ1dCB0aGlzIG1pZ2h0IGNhdXNlIGlzc3Vlcy5cclxuICAgICAgICAgICAgICAgIC8vIEEgY29tbW9uIHNvbHV0aW9uIGlzIHRvIHJlcXVpcmUgYW5vdGhlciB1c2VyIGludGVyYWN0aW9uIHRvIHBsYXkgYXVkaW8uXHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVN0YXJ0VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpOyAvLyBBc3N1bWUgaXQgd291bGQgaGF2ZSBwbGF5ZWRcclxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudEF1ZGlvVGltZSA9IDA7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGVuZEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8ucGF1c2UoKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZSA9IDA7IC8vIFJlc2V0IGZvciBuZXh0IHBsYXlcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXNldEdhbWVTdGF0cygpIHtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmNvbWJvID0gMDtcclxuICAgICAgICB0aGlzLm1heENvbWJvID0gMDtcclxuICAgICAgICB0aGlzLnRvdGFsSGl0cyA9IDA7XHJcbiAgICAgICAgdGhpcy5wZXJmZWN0SGl0cyA9IDA7XHJcbiAgICAgICAgdGhpcy5nb29kSGl0cyA9IDA7XHJcbiAgICAgICAgdGhpcy5taXNzSGl0cyA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCh0aW1lOiBET01IaWdoUmVzVGltZVN0YW1wKSB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIHRoaXMuZHJhdygpO1xyXG5cclxuICAgICAgICB0aGlzLmp1c3RQcmVzc2VkS2V5cy5jbGVhcigpOyAvLyBDbGVhciBqdXN0IHByZXNzZWQga2V5cyBhZnRlciB1cGRhdGUvZHJhd1xyXG5cclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKHQpID0+IHRoaXMuZ2FtZUxvb3AodCkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5aW5nKGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVHYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlVGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuanVzdFByZXNzZWRLZXlzLnNpemUgPiAwKSB7IC8vIEFueSBrZXkgcHJlc3MgdG8gc3RhcnRcclxuICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5aW5nKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8gJiYgIXRoaXMuYmdtQXVkaW8ucGF1c2VkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEF1ZGlvVGltZSA9IHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSWYgQkdNIGRpZG4ndCBwbGF5IChlLmcuLCBhdXRvcGxheSBibG9ja2VkKSwgdXNlIHBlcmZvcm1hbmNlLm5vdygpIGFzIGZhbGxiYWNrXHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEF1ZGlvVGltZSA9IChwZXJmb3JtYW5jZS5ub3coKSAtIHRoaXMuYmdtU3RhcnRUaW1lKSAvIDEwMDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTcGF3biBuZXcgbm90ZXNcclxuICAgICAgICB3aGlsZSAodGhpcy5iZWF0bWFwSW5kZXggPCB0aGlzLmdhbWVEYXRhLmJlYXRtYXAubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHROb3RlRGF0YSA9IHRoaXMuZ2FtZURhdGEuYmVhdG1hcFt0aGlzLmJlYXRtYXBJbmRleF07XHJcbiAgICAgICAgICAgIC8vIFNwYXduIG5vdGUgc2xpZ2h0bHkgYmVmb3JlIGl0cyBhcnJpdmFsIHRpbWUsIHNvIGl0J3MgdmlzaWJsZSBvbiBzY3JlZW5cclxuICAgICAgICAgICAgaWYgKG5leHROb3RlRGF0YS50aW1lIC0gdGhpcy5hY3RpdmVOb3Rlcy5sZW5ndGggKiAwLjEgPD0gdGhpcy5jdXJyZW50QXVkaW9UaW1lICsgMikgeyAvLyBQcmUtc3Bhd24gYnVmZmVyXHJcbiAgICAgICAgICAgICAgICBjb25zdCBub3RlID0gbmV3IE5vdGUobmV4dE5vdGVEYXRhLmxhbmUsIG5leHROb3RlRGF0YS50aW1lLCB0aGlzKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlTm90ZXMucHVzaChub3RlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmVhdG1hcEluZGV4Kys7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGV4aXN0aW5nIG5vdGVzIGFuZCByZW1vdmUgcGFzc2VkIG9uZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5hY3RpdmVOb3Rlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICBjb25zdCBub3RlID0gdGhpcy5hY3RpdmVOb3Rlc1tpXTtcclxuICAgICAgICAgICAgbm90ZS51cGRhdGUodGhpcy5jdXJyZW50QXVkaW9UaW1lLCB0aGlzKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBub3RlcyB0aGF0IGhhdmUgYmVlbiBoaXQgb3IgZnVsbHkgbWlzc2VkL3Bhc3NlZFxyXG4gICAgICAgICAgICBpZiAobm90ZS5zdGF0ZSA9PT0gTm90ZVN0YXRlLkhJVCB8fCBub3RlLnN0YXRlID09PSBOb3RlU3RhdGUuUEFTU0VEKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZU5vdGVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBsYXllciBpbnB1dFxyXG4gICAgICAgIGNvbnN0IGxhbmVLZXlzID0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MubGFuZUtleXM7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsYW5lS2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBrZXkgPSBsYW5lS2V5c1tpXTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuanVzdFByZXNzZWRLZXlzLmhhcyhrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZVBsYXllcklucHV0KGksIHRoaXMuY3VycmVudEF1ZGlvVGltZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGlmIHNvbmcgZW5kZWQgYW5kIGFsbCBub3RlcyBwcm9jZXNzZWRcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbyAmJiB0aGlzLmJnbUF1ZGlvLmVuZGVkICYmIHRoaXMuYWN0aXZlTm90ZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZW5kR2FtZSgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5jdXJyZW50QXVkaW9UaW1lID4gKHRoaXMuYmdtQXVkaW8/LmR1cmF0aW9uIHx8IHRoaXMuZ2FtZURhdGEuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSBcImJnbVwiKT8uZHVyYXRpb25fc2Vjb25kcyB8fCAwKSArIDIgJiYgdGhpcy5hY3RpdmVOb3Rlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgIC8vIEZhbGxiYWNrIGZvciB3aGVuIEJHTSBkb2VzIG5vdCByZXBvcnQgLmVuZGVkIHJlbGlhYmx5IG9yIGlmIG5vIEJHTVxyXG4gICAgICAgICAgICB0aGlzLmVuZEdhbWUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVHYW1lT3ZlcigpIHtcclxuICAgICAgICBpZiAodGhpcy5qdXN0UHJlc3NlZEtleXMuc2l6ZSA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFydFRpdGxlU2NyZWVuKCk7IC8vIEdvIGJhY2sgdG8gdGl0bGVcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5ZXJJbnB1dChsYW5lOiBudW1iZXIsIGlucHV0VGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLmdhbWVEYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBsZXQgYmVzdE5vdGVJbmRleCA9IC0xO1xyXG4gICAgICAgIGxldCBzbWFsbGVzdERlbHRhID0gSW5maW5pdHk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgdGhlIGNsb3Nlc3QgYWN0aXZlIG5vdGUgaW4gdGhlIGdpdmVuIGxhbmVcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYWN0aXZlTm90ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3Qgbm90ZSA9IHRoaXMuYWN0aXZlTm90ZXNbaV07XHJcbiAgICAgICAgICAgIGlmIChub3RlLmxhbmUgPT09IGxhbmUgJiYgbm90ZS5zdGF0ZSA9PT0gTm90ZVN0YXRlLkZBTExJTkcpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRlbHRhID0gTWF0aC5hYnMoaW5wdXRUaW1lIC0gbm90ZS5hcnJpdmFsVGltZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoZGVsdGEgPCBzbWFsbGVzdERlbHRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc21hbGxlc3REZWx0YSA9IGRlbHRhO1xyXG4gICAgICAgICAgICAgICAgICAgIGJlc3ROb3RlSW5kZXggPSBpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYmVzdE5vdGVJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgY29uc3Qgbm90ZSA9IHRoaXMuYWN0aXZlTm90ZXNbYmVzdE5vdGVJbmRleF07XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHdpdGhpbiBoaXQgd2luZG93XHJcbiAgICAgICAgICAgIGlmIChzbWFsbGVzdERlbHRhIDw9IHNldHRpbmdzLmhpdFdpbmRvd1BlcmZlY3QpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlTY29yZShcInBlcmZlY3RcIik7XHJcbiAgICAgICAgICAgICAgICBub3RlLnN0YXRlID0gTm90ZVN0YXRlLkhJVDsgLy8gTWFyayBhcyBoaXQgdG8gcmVtb3ZlIGl0XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBlcmZlY3RIaXRzKys7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlFZmZlY3QoXCJoaXRFZmZlY3RcIik7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc21hbGxlc3REZWx0YSA8PSBzZXR0aW5ncy5oaXRXaW5kb3dHb29kKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5U2NvcmUoXCJnb29kXCIpO1xyXG4gICAgICAgICAgICAgICAgbm90ZS5zdGF0ZSA9IE5vdGVTdGF0ZS5ISVQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmdvb2RIaXRzKys7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlFZmZlY3QoXCJoaXRFZmZlY3RcIik7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUb28gZWFybHkvbGF0ZSwgY291bnQgYXMgYSBtaXNzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZU1pc3MoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheUVmZmVjdChcIm1pc3NFZmZlY3RcIik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBObyBub3RlIHRvIGhpdCwgb3Igbm90ZSBhbHJlYWR5IHBhc3NlZC9taXNzZWRcclxuICAgICAgICAgICAgdGhpcy5oYW5kbGVNaXNzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheUVmZmVjdChcIm1pc3NFZmZlY3RcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXBwbHlTY29yZSh0eXBlOiBcInBlcmZlY3RcIiB8IFwiZ29vZFwiKSB7XHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLmdhbWVEYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICB0aGlzLmNvbWJvKys7XHJcbiAgICAgICAgdGhpcy5tYXhDb21ibyA9IE1hdGgubWF4KHRoaXMubWF4Q29tYm8sIHRoaXMuY29tYm8pO1xyXG4gICAgICAgIHRoaXMudG90YWxIaXRzKys7XHJcblxyXG4gICAgICAgIGxldCBzY29yZVZhbHVlID0gMDtcclxuICAgICAgICBpZiAodHlwZSA9PT0gXCJwZXJmZWN0XCIpIHtcclxuICAgICAgICAgICAgc2NvcmVWYWx1ZSA9IHNldHRpbmdzLnNjb3JlUGVyUGVyZmVjdDtcclxuICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09IFwiZ29vZFwiKSB7XHJcbiAgICAgICAgICAgIHNjb3JlVmFsdWUgPSBzZXR0aW5ncy5zY29yZVBlckdvb2Q7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBcHBseSBjb21ibyBtdWx0aXBsaWVyXHJcbiAgICAgICAgbGV0IGN1cnJlbnRNdWx0aXBsaWVyID0gMTtcclxuICAgICAgICBpZiAodGhpcy5jb21ibyA+PSBzZXR0aW5ncy5jb21ib1RocmVzaG9sZCkge1xyXG4gICAgICAgICAgICBjdXJyZW50TXVsdGlwbGllciArPSBNYXRoLmZsb29yKHRoaXMuY29tYm8gLyBzZXR0aW5ncy5jb21ib1RocmVzaG9sZCkgKiBzZXR0aW5ncy5tdWx0aXBsaWVyUGVyQ29tYm87XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc2NvcmUgKz0gc2NvcmVWYWx1ZSAqIGN1cnJlbnRNdWx0aXBsaWVyO1xyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBoYW5kbGVNaXNzKCkgeyAvLyBDaGFuZ2VkIGZyb20gcHJpdmF0ZSB0byBwdWJsaWNcclxuICAgICAgICB0aGlzLmNvbWJvID0gMDtcclxuICAgICAgICB0aGlzLm1pc3NIaXRzKys7XHJcbiAgICAgICAgdGhpcy50b3RhbEhpdHMrKztcclxuICAgICAgICB0aGlzLnNjb3JlIC09IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzLnNjb3JlUGVuYWx0eVBlck1pc3M7IC8vIERlZHVjdCBzY29yZVxyXG5cclxuICAgICAgICAvLyBFbmQgZ2FtZSBpZiBzY29yZSBkcm9wcyBiZWxvdyB6ZXJvXHJcbiAgICAgICAgaWYgKHRoaXMuc2NvcmUgPCAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZW5kR2FtZSgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5wbGF5RWZmZWN0KFwibWlzc0VmZmVjdFwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlFZmZlY3QobmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLmxvYWRlZFNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIC8vIENsb25lIHRoZSBhdWRpbyBlbGVtZW50IGZvciBzaW11bHRhbmVvdXMgcGxheWJhY2sgaWYgbmVlZGVkXHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgY2xvbmUudm9sdW1lID0gYXVkaW8udm9sdW1lOyAvLyBFbnN1cmUgY2xvbmVkIHZvbHVtZSBpcyBjb3JyZWN0XHJcbiAgICAgICAgICAgIGNsb25lLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihgU291bmQgZWZmZWN0IHBsYXliYWNrIGJsb2NrZWQ6ICR7bmFtZX1gLCBlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhdygpIHtcclxuICAgICAgICB0aGlzLmN0eC5jbGVhclJlY3QoMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5kcmF3QmFja2dyb3VuZCgpO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3UGxheWluZygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0dhbWVPdmVyKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3QmFja2dyb3VuZCgpIHtcclxuICAgICAgICBjb25zdCBiYWNrZ3JvdW5kSW1hZ2UgPSB0aGlzLmxvYWRlZEltYWdlcy5nZXQoXCJiYWNrZ3JvdW5kXCIpO1xyXG4gICAgICAgIGlmIChiYWNrZ3JvdW5kSW1hZ2UpIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGJhY2tncm91bmRJbWFnZSwgMCwgMCwgdGhpcy5jYW52YXMud2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCIjMWExYTFhXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiYm9sZCA0OHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcIlJoeXRobSBHYW1lXCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMjRweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFwiUHJlc3MgQW55IEtleSB0byBTdGFydFwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAyMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3UGxheWluZygpIHtcclxuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIGNvbnN0IG5vdGVJbWFnZSA9IHRoaXMubG9hZGVkSW1hZ2VzLmdldChcIm5vdGVcIik7XHJcbiAgICAgICAgY29uc3QgaGl0Wm9uZUltYWdlID0gdGhpcy5sb2FkZWRJbWFnZXMuZ2V0KFwiaGl0Wm9uZVwiKTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBsYW5lcyBhbmQgaGl0IHpvbmVcclxuICAgICAgICBjb25zdCB0b3RhbExhbmVzV2lkdGggPSBzZXR0aW5ncy5sYW5lQ291bnQgKiBzZXR0aW5ncy5sYW5lV2lkdGggKyAoc2V0dGluZ3MubGFuZUNvdW50IC0gMSkgKiBzZXR0aW5ncy5sYW5lU3BhY2luZztcclxuICAgICAgICBjb25zdCBzdGFydFggPSAoc2V0dGluZ3MuY2FudmFzV2lkdGggLSB0b3RhbExhbmVzV2lkdGgpIC8gMjtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzZXR0aW5ncy5sYW5lQ291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBsYW5lWCA9IHN0YXJ0WCArIGkgKiAoc2V0dGluZ3MubGFuZVdpZHRoICsgc2V0dGluZ3MubGFuZVNwYWNpbmcpO1xyXG4gICAgICAgICAgICAvLyBEcmF3IGxhbmUgYmFja2dyb3VuZFxyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIiMzMzMzMzNcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QobGFuZVgsIDAsIHNldHRpbmdzLmxhbmVXaWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICAgICAgICAgIC8vIERyYXcgbGFuZSBpbnB1dCBrZXlzXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgyNTUsIDI1NSwgMjU1LCAwLjIpXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjIwcHggQXJpYWxcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoc2V0dGluZ3MubGFuZUtleXNbaV0udG9VcHBlckNhc2UoKSwgbGFuZVggKyBzZXR0aW5ncy5sYW5lV2lkdGggLyAyLCBzZXR0aW5ncy5oaXRab25lWSArIDUwKTtcclxuXHJcbiAgICAgICAgICAgIC8vIERyYXcgaGl0IHpvbmUgZm9yIGVhY2ggbGFuZVxyXG4gICAgICAgICAgICBpZiAoaGl0Wm9uZUltYWdlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5kcmF3SW1hZ2UoaGl0Wm9uZUltYWdlLCBsYW5lWCwgc2V0dGluZ3MuaGl0Wm9uZVkgLSBoaXRab25lSW1hZ2UuaGVpZ2h0IC8gMiwgc2V0dGluZ3MubGFuZVdpZHRoLCBoaXRab25lSW1hZ2UuaGVpZ2h0KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiIzAwZmZmZlwiOyAvLyBDeWFuIGZvciBoaXQgem9uZVxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QobGFuZVgsIHNldHRpbmdzLmhpdFpvbmVZLCBzZXR0aW5ncy5sYW5lV2lkdGgsIDUpOyAvLyBTaW1wbGUgbGluZVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBIaWdobGlnaHQgcHJlc3NlZCBsYW5lc1xyXG4gICAgICAgICAgICBpZiAodGhpcy5wcmVzc2VkS2V5cy5oYXMoc2V0dGluZ3MubGFuZUtleXNbaV0pKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcInJnYmEoMjU1LCAyNTUsIDI1NSwgMC4zKVwiO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QobGFuZVgsIHNldHRpbmdzLmhpdFpvbmVZIC0gMjAsIHNldHRpbmdzLmxhbmVXaWR0aCwgNDApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IG5vdGVzXHJcbiAgICAgICAgdGhpcy5hY3RpdmVOb3Rlcy5mb3JFYWNoKG5vdGUgPT4ge1xyXG4gICAgICAgICAgICBpZiAobm90ZUltYWdlKSB7XHJcbiAgICAgICAgICAgICAgICBub3RlLmRyYXcodGhpcy5jdHgsIG5vdGVJbWFnZSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcInJlZFwiOyAvLyBGYWxsYmFjayBjb2xvclxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3Qobm90ZS54LCBub3RlLnksIG5vdGUud2lkdGgsIG5vdGUuaGVpZ2h0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBEcmF3IHNjb3JlIGFuZCBjb21ib1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJsZWZ0XCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYFNjb3JlOiAke01hdGguZmxvb3IodGhpcy5zY29yZSl9YCwgMjAsIDQwKTtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcInJpZ2h0XCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYENvbWJvOiAke3RoaXMuY29tYm99YCwgdGhpcy5jYW52YXMud2lkdGggLSAyMCwgNDApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0dhbWVPdmVyKCkge1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCJib2xkIDQ4cHggQXJpYWxcIjtcclxuICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFwiR2FtZSBPdmVyIVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSAxMDApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYEZpbmFsIFNjb3JlOiAke01hdGguZmxvb3IodGhpcy5zY29yZSl9YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMjApO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBNYXggQ29tYm86ICR7dGhpcy5tYXhDb21ib31gLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgKyAzMCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRvdGFsTm90ZXNIaXQgPSB0aGlzLnBlcmZlY3RIaXRzICsgdGhpcy5nb29kSGl0cztcclxuICAgICAgICBjb25zdCBhY2N1cmFjeSA9IHRoaXMudG90YWxIaXRzID4gMCA/ICh0b3RhbE5vdGVzSGl0IC8gdGhpcy50b3RhbEhpdHMpICogMTAwIDogMDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgQWNjdXJhY3k6ICR7YWNjdXJhY3kudG9GaXhlZCgyKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIyNHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJQcmVzcyBBbnkgS2V5IHRvIFJlc3RhcnRcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTUwKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gSW5pdGlhbGl6ZSB0aGUgZ2FtZSB3aGVuIHRoZSBET00gaXMgcmVhZHlcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgKCkgPT4ge1xyXG4gICAgY29uc3QgZ2FtZSA9IG5ldyBHYW1lKFwiZ2FtZUNhbnZhc1wiKTtcclxuICAgIGdhbWUuaW5pdCgpO1xyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFtREEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsV0FBQSxXQUFRO0FBQ1IsRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxlQUFZO0FBSFgsU0FBQUE7QUFBQSxHQUFBO0FBTUwsSUFBSyxZQUFMLGtCQUFLQyxlQUFMO0FBQ0ksRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxTQUFNO0FBQ04sRUFBQUEsV0FBQSxZQUFTO0FBQ1QsRUFBQUEsV0FBQSxZQUFTO0FBSlIsU0FBQUE7QUFBQSxHQUFBO0FBT0wsTUFBTSxLQUFLO0FBQUEsRUFXUCxZQUFZLE1BQWMsYUFBcUIsTUFBWTtBQUN2RCxTQUFLLE9BQU87QUFDWixTQUFLLGNBQWM7QUFDbkIsU0FBSyxRQUFRO0FBRWIsVUFBTSxXQUFXLEtBQUssU0FBUztBQUMvQixTQUFLLGdCQUFnQixTQUFTLFdBQVcsU0FBUyxjQUFjLFNBQVM7QUFDekUsU0FBSyxZQUFZLEtBQUssY0FBYyxLQUFLO0FBRXpDLFNBQUssUUFBUSxTQUFTO0FBQ3RCLFNBQUssU0FBUyxTQUFTO0FBRXZCLFVBQU0sa0JBQWtCLFNBQVMsWUFBWSxTQUFTLGFBQWEsU0FBUyxZQUFZLEtBQUssU0FBUztBQUN0RyxVQUFNLFVBQVUsU0FBUyxjQUFjLG1CQUFtQjtBQUMxRCxTQUFLLElBQUksU0FBUyxRQUFR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
