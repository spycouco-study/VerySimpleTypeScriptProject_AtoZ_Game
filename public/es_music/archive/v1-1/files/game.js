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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gZ2FtZS50c1xyXG5cclxuaW50ZXJmYWNlIEFzc2V0SW1hZ2Uge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXNzZXRTb3VuZCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBub3RlU3BlZWQ6IG51bWJlcjsgLy8gcGl4ZWxzIHBlciBzZWNvbmRcclxuICAgIGhpdFpvbmVZOiBudW1iZXI7IC8vIFktY29vcmRpbmF0ZSBvZiB0aGUgaGl0IHpvbmVcclxuICAgIG5vdGVTcGF3blk6IG51bWJlcjsgLy8gWS1jb29yZGluYXRlIHdoZXJlIG5vdGVzIGFwcGVhclxyXG4gICAgbm90ZVdpZHRoOiBudW1iZXI7XHJcbiAgICBub3RlSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBsYW5lQ291bnQ6IG51bWJlcjtcclxuICAgIGxhbmVXaWR0aDogbnVtYmVyO1xyXG4gICAgbGFuZVNwYWNpbmc6IG51bWJlcjsgLy8gU3BhY2luZyBiZXR3ZWVuIGxhbmVzXHJcbiAgICBsYW5lS2V5czogc3RyaW5nW107IC8vIEtleXMgY29ycmVzcG9uZGluZyB0byBlYWNoIGxhbmVcclxuICAgIGhpdFdpbmRvd1BlcmZlY3Q6IG51bWJlcjsgLy8gVGltZSB3aW5kb3cgZm9yIHBlcmZlY3QgaGl0ICgrLy0gc2Vjb25kcylcclxuICAgIGhpdFdpbmRvd0dvb2Q6IG51bWJlcjsgLy8gVGltZSB3aW5kb3cgZm9yIGdvb2QgaGl0ICgrLy0gc2Vjb25kcylcclxuICAgIHNjb3JlUGVyUGVyZmVjdDogbnVtYmVyO1xyXG4gICAgc2NvcmVQZXJHb29kOiBudW1iZXI7XHJcbiAgICBjb21ib1RocmVzaG9sZDogbnVtYmVyOyAvLyBDb21ibyBzdGFydHMgY29udHJpYnV0aW5nIHNjb3JlIGFmdGVyIHRoaXMgbWFueSBoaXRzXHJcbiAgICBtdWx0aXBsaWVyUGVyQ29tYm86IG51bWJlcjsgLy8gU2NvcmUgbXVsdGlwbGllciBpbmNyZWFzZSBwZXIgY29tYm8gdGllclxyXG59XHJcblxyXG5pbnRlcmZhY2UgQmVhdG1hcE5vdGUge1xyXG4gICAgdGltZTogbnVtYmVyOyAvLyBUaW1lIGluIHNlY29uZHMgd2hlbiB0aGUgbm90ZSBzaG91bGQgYmUgaGl0XHJcbiAgICBsYW5lOiBudW1iZXI7IC8vIExhbmUgaW5kZXggKDAgdG8gbGFuZUNvdW50LTEpXHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lRGF0YSB7XHJcbiAgICBnYW1lU2V0dGluZ3M6IEdhbWVTZXR0aW5ncztcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogQXNzZXRJbWFnZVtdO1xyXG4gICAgICAgIHNvdW5kczogQXNzZXRTb3VuZFtdO1xyXG4gICAgfTtcclxuICAgIGJlYXRtYXA6IEJlYXRtYXBOb3RlW107XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFID0gXCJUSVRMRVwiLFxyXG4gICAgUExBWUlORyA9IFwiUExBWUlOR1wiLFxyXG4gICAgR0FNRV9PVkVSID0gXCJHQU1FX09WRVJcIixcclxufVxyXG5cclxuZW51bSBOb3RlU3RhdGUge1xyXG4gICAgRkFMTElORyA9IFwiRkFMTElOR1wiLFxyXG4gICAgSElUID0gXCJISVRcIixcclxuICAgIE1JU1NFRCA9IFwiTUlTU0VEXCIsXHJcbiAgICBQQVNTRUQgPSBcIlBBU1NFRFwiLCAvLyBQYXNzZWQgaGl0IHpvbmUgd2l0aG91dCBpbnB1dFxyXG59XHJcblxyXG5jbGFzcyBOb3RlIHtcclxuICAgIGxhbmU6IG51bWJlcjtcclxuICAgIHNwYXduVGltZTogbnVtYmVyOyAvLyBUaW1lIHdoZW4gbm90ZSBhcHBlYXJzIGF0IG5vdGVTcGF3bllcclxuICAgIGFycml2YWxUaW1lOiBudW1iZXI7IC8vIFRpbWUgd2hlbiBub3RlIHJlYWNoZXMgaGl0Wm9uZVlcclxuICAgIHN0YXRlOiBOb3RlU3RhdGU7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBmYWxsRHVyYXRpb246IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihsYW5lOiBudW1iZXIsIGFycml2YWxUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpIHtcclxuICAgICAgICB0aGlzLmxhbmUgPSBsYW5lO1xyXG4gICAgICAgIHRoaXMuYXJyaXZhbFRpbWUgPSBhcnJpdmFsVGltZTtcclxuICAgICAgICB0aGlzLnN0YXRlID0gTm90ZVN0YXRlLkZBTExJTkc7XHJcblxyXG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2FtZS5nYW1lRGF0YS5nYW1lU2V0dGluZ3M7IC8vIEFjY2Vzc2luZyBnYW1lRGF0YVxyXG4gICAgICAgIHRoaXMuZmFsbER1cmF0aW9uID0gKHNldHRpbmdzLmhpdFpvbmVZIC0gc2V0dGluZ3Mubm90ZVNwYXduWSkgLyBzZXR0aW5ncy5ub3RlU3BlZWQ7XHJcbiAgICAgICAgdGhpcy5zcGF3blRpbWUgPSB0aGlzLmFycml2YWxUaW1lIC0gdGhpcy5mYWxsRHVyYXRpb247XHJcblxyXG4gICAgICAgIHRoaXMud2lkdGggPSBzZXR0aW5ncy5ub3RlV2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBzZXR0aW5ncy5ub3RlSGVpZ2h0O1xyXG5cclxuICAgICAgICBjb25zdCB0b3RhbExhbmVzV2lkdGggPSBzZXR0aW5ncy5sYW5lQ291bnQgKiBzZXR0aW5ncy5sYW5lV2lkdGggKyAoc2V0dGluZ3MubGFuZUNvdW50IC0gMSkgKiBzZXR0aW5ncy5sYW5lU3BhY2luZztcclxuICAgICAgICBjb25zdCBzdGFydFggPSAoc2V0dGluZ3MuY2FudmFzV2lkdGggLSB0b3RhbExhbmVzV2lkdGgpIC8gMjtcclxuICAgICAgICB0aGlzLnggPSBzdGFydFggKyBsYW5lICogKHNldHRpbmdzLmxhbmVXaWR0aCArIHNldHRpbmdzLmxhbmVTcGFjaW5nKSArIChzZXR0aW5ncy5sYW5lV2lkdGggLSB0aGlzLndpZHRoKSAvIDI7XHJcblxyXG4gICAgICAgIHRoaXMueSA9IHNldHRpbmdzLm5vdGVTcGF3blk7IC8vIEluaXRpYWwgWSBwb3NpdGlvblxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShjdXJyZW50VGltZTogbnVtYmVyLCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgIT09IE5vdGVTdGF0ZS5GQUxMSU5HKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2FtZS5nYW1lRGF0YS5nYW1lU2V0dGluZ3M7IC8vIEFjY2Vzc2luZyBnYW1lRGF0YVxyXG4gICAgICAgIGNvbnN0IHByb2dyZXNzID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgKGN1cnJlbnRUaW1lIC0gdGhpcy5zcGF3blRpbWUpIC8gdGhpcy5mYWxsRHVyYXRpb24pKTtcclxuICAgICAgICB0aGlzLnkgPSBzZXR0aW5ncy5ub3RlU3Bhd25ZICsgcHJvZ3Jlc3MgKiAoc2V0dGluZ3MuaGl0Wm9uZVkgLSBzZXR0aW5ncy5ub3RlU3Bhd25ZKTtcclxuXHJcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lID4gdGhpcy5hcnJpdmFsVGltZSArIHNldHRpbmdzLmhpdFdpbmRvd0dvb2QgJiYgdGhpcy5zdGF0ZSA9PT0gTm90ZVN0YXRlLkZBTExJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IE5vdGVTdGF0ZS5QQVNTRUQ7XHJcbiAgICAgICAgICAgIGdhbWUuaGFuZGxlTWlzcygpOyAvLyBDYWxsaW5nIGhhbmRsZU1pc3NcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgbm90ZUltYWdlOiBIVE1MSW1hZ2VFbGVtZW50KSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IE5vdGVTdGF0ZS5GQUxMSU5HIHx8IHRoaXMuc3RhdGUgPT09IE5vdGVTdGF0ZS5ISVQpIHsgLy8gRHJhdyBISVQgbm90ZXMgYnJpZWZseSBmb3IgZmVlZGJhY2tcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShub3RlSW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZ2FtZURhdGEhOiBHYW1lRGF0YTsgLy8gQ2hhbmdlZCBmcm9tIHByaXZhdGUgdG8gcHVibGljIHJlYWRvbmx5XHJcbiAgICBwcml2YXRlIGxvYWRlZEltYWdlczogTWFwPHN0cmluZywgSFRNTEltYWdlRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbiAgICBwcml2YXRlIGxvYWRlZFNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGN1cnJlbnRBdWRpb1RpbWU6IG51bWJlciA9IDA7IC8vIFRoZSBvZmZpY2lhbCBnYW1lIHRpbWUsIHN5bmNlZCB3aXRoIEJHTVxyXG4gICAgcHJpdmF0ZSBiZ21BdWRpbzogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBiZ21TdGFydFRpbWU6IG51bWJlciA9IDA7IC8vIHBlcmZvcm1hbmNlLm5vdygpIHdoZW4gQkdNIHN0YXJ0ZWQgcGxheWluZ1xyXG5cclxuICAgIHByaXZhdGUgYWN0aXZlTm90ZXM6IE5vdGVbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBiZWF0bWFwSW5kZXg6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY29tYm86IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1heENvbWJvOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEhpdHM6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHBlcmZlY3RIaXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBnb29kSGl0czogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbWlzc0hpdHM6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBwcmVzc2VkS2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIGp1c3RQcmVzc2VkS2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7IC8vIEZvciBzaW5nbGUtcHJlc3MgZXZlbnRzXHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgZWxlbWVudCB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoXCIyZFwiKSE7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gZ2V0IDJEIHJlbmRlcmluZyBjb250ZXh0LlwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFkZEV2ZW50TGlzdGVuZXJzKCkge1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4gdGhpcy5oYW5kbGVLZXlEb3duKGUpKTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleXVwXCIsIChlKSA9PiB0aGlzLmhhbmRsZUtleVVwKGUpKTtcclxuICAgICAgICAvLyBQcmV2ZW50IGRlZmF1bHQgYmVoYXZpb3IgZm9yIGFycm93IGtleXMgYW5kIHNwYWNlYmFyLCBjb21tb25seSB1c2VkIGluIGdhbWVzXHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChbXCJTcGFjZVwiLCBcIkFycm93VXBcIiwgXCJBcnJvd0Rvd25cIiwgXCJBcnJvd0xlZnRcIiwgXCJBcnJvd1JpZ2h0XCJdLmluY2x1ZGVzKGUuY29kZSkpIHtcclxuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIGNvbnN0IGtleSA9IGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIGlmICghdGhpcy5wcmVzc2VkS2V5cy5oYXMoa2V5KSkge1xyXG4gICAgICAgICAgICB0aGlzLnByZXNzZWRLZXlzLmFkZChrZXkpO1xyXG4gICAgICAgICAgICB0aGlzLmp1c3RQcmVzc2VkS2V5cy5hZGQoa2V5KTsgLy8gTWFyayBhcyBqdXN0IHByZXNzZWRcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIGNvbnN0IGtleSA9IGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIHRoaXMucHJlc3NlZEtleXMuZGVsZXRlKGtleSk7XHJcbiAgICAgICAgLy8gRG8gbm90IHJlbW92ZSBmcm9tIGp1c3RQcmVzc2VkS2V5cyBoZXJlLCBpdCB3aWxsIGJlIGNsZWFyZWQgYXQgdGhlIHN0YXJ0IG9mIHVwZGF0ZSBmcmFtZVxyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJMb2FkaW5nIGdhbWUgZGF0YS4uLlwiKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFwiZGF0YS5qc29uXCIpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy8gZ2FtZURhdGEgaXMgaW5pdGlhbGl6ZWQgaGVyZSwgc28gcmVhZG9ubHkgaXMgYXBwcm9wcmlhdGVcclxuICAgICAgICAgICAgKHRoaXMuZ2FtZURhdGEgYXMgR2FtZURhdGEpID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIEdhbWVEYXRhO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkdhbWUgZGF0YSBsb2FkZWQ6XCIsIHRoaXMuZ2FtZURhdGEpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmdhbWVEYXRhLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5sb2FkQXNzZXRzKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQXNzZXRzIGxvYWRlZC5cIik7XHJcblxyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lTG9vcCgwKTsgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gaW5pdGlhbGl6ZSBnYW1lOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIERpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBvbiB0aGUgY2FudmFzIGlmIGluaXRpYWxpemF0aW9uIGZhaWxzXHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjIwcHggQXJpYWxcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJyZWRcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJGYWlsZWQgdG8gbG9hZCBnYW1lLiBDaGVjayBjb25zb2xlIGZvciBkZXRhaWxzLlwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuZ2FtZURhdGEuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGltYWdlID0gbmV3IEltYWdlKCk7XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5zcmMgPSBpbWcucGF0aDtcclxuICAgICAgICAgICAgICAgIGltYWdlLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZEltYWdlcy5zZXQoaW1nLm5hbWUsIGltYWdlKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgaW1hZ2Uub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7aW1nLnBhdGh9YCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5nYW1lRGF0YS5hc3NldHMuc291bmRzLm1hcChzbmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnNyYyA9IHNuZC5wYXRoO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc25kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnByZWxvYWQgPSBcImF1dG9cIjtcclxuICAgICAgICAgICAgICAgIC8vIFRvIGF2b2lkIGlzc3VlcyB3aXRoIGF1dG9wbGF5IHBvbGljaWVzLCB3ZSBvbmx5IHRyeSB0byBsb2FkIGFuZCBhdHRhY2hcclxuICAgICAgICAgICAgICAgIC8vIFRoZSBhY3R1YWwgcGxheWJhY2sgd2lsbCBiZSBpbml0aWF0ZWQgYnkgdXNlciBpbnRlcmFjdGlvbi5cclxuICAgICAgICAgICAgICAgIC8vIEZvciBzb3VuZCBlZmZlY3RzLCB0aGV5IGFyZSB0eXBpY2FsbHkgc2hvcnQgYW5kIGNhbiBiZSBwbGF5ZWQgb24gZGVtYW5kLlxyXG4gICAgICAgICAgICAgICAgLy8gRm9yIEJHTSwgaXQgbmVlZHMgdG8gYmUgcmVhZHkgdG8gcGxheSB3aGVuIHRoZSBnYW1lIHN0YXJ0cy5cclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2FkZWRTb3VuZHMuc2V0KHNuZC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiByZWplY3QoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NuZC5wYXRofWApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0VGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgdGhpcy5yZXNldEdhbWVTdGF0cygpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgdGhpcy5hY3RpdmVOb3RlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuYmVhdG1hcEluZGV4ID0gMDtcclxuICAgICAgICB0aGlzLnJlc2V0R2FtZVN0YXRzKCk7XHJcblxyXG4gICAgICAgIHRoaXMuYmdtQXVkaW8gPSB0aGlzLmxvYWRlZFNvdW5kcy5nZXQoXCJiZ21cIikgfHwgbnVsbDtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5sb29wID0gdHJ1ZTsgLy8gTG9vcCBCR00gZm9yIGNvbnRpbnVvdXMgcGxheSB1bnRpbCBnYW1lIGVuZHNcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wbGF5KCkudGhlbigoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVN0YXJ0VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50QXVkaW9UaW1lID0gMDsgLy8gSW5pdGlhbGl6ZSBnYW1lIHRpbWVcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQkdNIHN0YXJ0ZWQuXCIpO1xyXG4gICAgICAgICAgICB9KS5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJCR00gYXV0b3BsYXkgcHJldmVudGVkOlwiLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAvLyBJZiBhdXRvcGxheSBpcyBibG9ja2VkLCBnYW1lIG1pZ2h0IGJlIG91dCBvZiBzeW5jLlxyXG4gICAgICAgICAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHksIHdlJ2xsIHByb2NlZWQgYnV0IHRoaXMgbWlnaHQgY2F1c2UgaXNzdWVzLlxyXG4gICAgICAgICAgICAgICAgLy8gQSBjb21tb24gc29sdXRpb24gaXMgdG8gcmVxdWlyZSBhbm90aGVyIHVzZXIgaW50ZXJhY3Rpb24gdG8gcGxheSBhdWRpby5cclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtU3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7IC8vIEFzc3VtZSBpdCB3b3VsZCBoYXZlIHBsYXllZFxyXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50QXVkaW9UaW1lID0gMDtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZW5kR2FtZSgpIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8pIHtcclxuICAgICAgICAgICAgdGhpcy5iZ21BdWRpby5wYXVzZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmN1cnJlbnRUaW1lID0gMDsgLy8gUmVzZXQgZm9yIG5leHQgcGxheVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZVN0YXRzKCkge1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuY29tYm8gPSAwO1xyXG4gICAgICAgIHRoaXMubWF4Q29tYm8gPSAwO1xyXG4gICAgICAgIHRoaXMudG90YWxIaXRzID0gMDtcclxuICAgICAgICB0aGlzLnBlcmZlY3RIaXRzID0gMDtcclxuICAgICAgICB0aGlzLmdvb2RIaXRzID0gMDtcclxuICAgICAgICB0aGlzLm1pc3NIaXRzID0gMDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVMb29wKHRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ29udmVydCB0byBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHRpbWU7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5kcmF3KCk7XHJcblxyXG4gICAgICAgIHRoaXMuanVzdFByZXNzZWRLZXlzLmNsZWFyKCk7IC8vIENsZWFyIGp1c3QgcHJlc3NlZCBrZXlzIGFmdGVyIHVwZGF0ZS9kcmF3XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgodCkgPT4gdGhpcy5nYW1lTG9vcCh0KSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZUdhbWVPdmVyKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICBpZiAodGhpcy5qdXN0UHJlc3NlZEtleXMuc2l6ZSA+IDApIHsgLy8gQW55IGtleSBwcmVzcyB0byBzdGFydFxyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbyAmJiAhdGhpcy5iZ21BdWRpby5wYXVzZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QXVkaW9UaW1lID0gdGhpcy5iZ21BdWRpby5jdXJyZW50VGltZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBJZiBCR00gZGlkbid0IHBsYXkgKGUuZy4sIGF1dG9wbGF5IGJsb2NrZWQpLCB1c2UgcGVyZm9ybWFuY2Uubm93KCkgYXMgZmFsbGJhY2tcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QXVkaW9UaW1lID0gKHBlcmZvcm1hbmNlLm5vdygpIC0gdGhpcy5iZ21TdGFydFRpbWUpIC8gMTAwMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNwYXduIG5ldyBub3Rlc1xyXG4gICAgICAgIHdoaWxlICh0aGlzLmJlYXRtYXBJbmRleCA8IHRoaXMuZ2FtZURhdGEuYmVhdG1hcC5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc3QgbmV4dE5vdGVEYXRhID0gdGhpcy5nYW1lRGF0YS5iZWF0bWFwW3RoaXMuYmVhdG1hcEluZGV4XTtcclxuICAgICAgICAgICAgLy8gU3Bhd24gbm90ZSBzbGlnaHRseSBiZWZvcmUgaXRzIGFycml2YWwgdGltZSwgc28gaXQncyB2aXNpYmxlIG9uIHNjcmVlblxyXG4gICAgICAgICAgICBpZiAobmV4dE5vdGVEYXRhLnRpbWUgLSB0aGlzLmFjdGl2ZU5vdGVzLmxlbmd0aCAqIDAuMSA8PSB0aGlzLmN1cnJlbnRBdWRpb1RpbWUgKyAyKSB7IC8vIFByZS1zcGF3biBidWZmZXJcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vdGUgPSBuZXcgTm90ZShuZXh0Tm90ZURhdGEubGFuZSwgbmV4dE5vdGVEYXRhLnRpbWUsIHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVOb3Rlcy5wdXNoKG5vdGUpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZWF0bWFwSW5kZXgrKztcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgZXhpc3Rpbmcgbm90ZXMgYW5kIHJlbW92ZSBwYXNzZWQgb25lc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLmFjdGl2ZU5vdGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vdGUgPSB0aGlzLmFjdGl2ZU5vdGVzW2ldO1xyXG4gICAgICAgICAgICBub3RlLnVwZGF0ZSh0aGlzLmN1cnJlbnRBdWRpb1RpbWUsIHRoaXMpO1xyXG5cclxuICAgICAgICAgICAgLy8gUmVtb3ZlIG5vdGVzIHRoYXQgaGF2ZSBiZWVuIGhpdCBvciBmdWxseSBtaXNzZWQvcGFzc2VkXHJcbiAgICAgICAgICAgIGlmIChub3RlLnN0YXRlID09PSBOb3RlU3RhdGUuSElUIHx8IG5vdGUuc3RhdGUgPT09IE5vdGVTdGF0ZS5QQVNTRUQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlTm90ZXMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgcGxheWVyIGlucHV0XHJcbiAgICAgICAgY29uc3QgbGFuZUtleXMgPSB0aGlzLmdhbWVEYXRhLmdhbWVTZXR0aW5ncy5sYW5lS2V5cztcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxhbmVLZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGxhbmVLZXlzW2ldO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5qdXN0UHJlc3NlZEtleXMuaGFzKGtleSkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlUGxheWVySW5wdXQoaSwgdGhpcy5jdXJyZW50QXVkaW9UaW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgc29uZyBlbmRlZCBhbmQgYWxsIG5vdGVzIHByb2Nlc3NlZFxyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvICYmIHRoaXMuYmdtQXVkaW8uZW5kZWQgJiYgdGhpcy5hY3RpdmVOb3Rlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy5lbmRHYW1lKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnRBdWRpb1RpbWUgPiAodGhpcy5iZ21BdWRpbz8uZHVyYXRpb24gfHwgdGhpcy5nYW1lRGF0YS5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09IFwiYmdtXCIpPy5kdXJhdGlvbl9zZWNvbmRzIHx8IDApICsgMiAmJiB0aGlzLmFjdGl2ZU5vdGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgLy8gRmFsbGJhY2sgZm9yIHdoZW4gQkdNIGRvZXMgbm90IHJlcG9ydCAuZW5kZWQgcmVsaWFibHkgb3IgaWYgbm8gQkdNXHJcbiAgICAgICAgICAgIHRoaXMuZW5kR2FtZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUdhbWVPdmVyKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmp1c3RQcmVzc2VkS2V5cy5zaXplID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0VGl0bGVTY3JlZW4oKTsgLy8gR28gYmFjayB0byB0aXRsZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZVBsYXllcklucHV0KGxhbmU6IG51bWJlciwgaW5wdXRUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIGxldCBiZXN0Tm90ZUluZGV4ID0gLTE7XHJcbiAgICAgICAgbGV0IHNtYWxsZXN0RGVsdGEgPSBJbmZpbml0eTtcclxuXHJcbiAgICAgICAgLy8gRmluZCB0aGUgY2xvc2VzdCBhY3RpdmUgbm90ZSBpbiB0aGUgZ2l2ZW4gbGFuZVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5hY3RpdmVOb3Rlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBub3RlID0gdGhpcy5hY3RpdmVOb3Rlc1tpXTtcclxuICAgICAgICAgICAgaWYgKG5vdGUubGFuZSA9PT0gbGFuZSAmJiBub3RlLnN0YXRlID09PSBOb3RlU3RhdGUuRkFMTElORykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZGVsdGEgPSBNYXRoLmFicyhpbnB1dFRpbWUgLSBub3RlLmFycml2YWxUaW1lKTtcclxuICAgICAgICAgICAgICAgIGlmIChkZWx0YSA8IHNtYWxsZXN0RGVsdGEpIHtcclxuICAgICAgICAgICAgICAgICAgICBzbWFsbGVzdERlbHRhID0gZGVsdGE7XHJcbiAgICAgICAgICAgICAgICAgICAgYmVzdE5vdGVJbmRleCA9IGk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChiZXN0Tm90ZUluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICBjb25zdCBub3RlID0gdGhpcy5hY3RpdmVOb3Rlc1tiZXN0Tm90ZUluZGV4XTtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgd2l0aGluIGhpdCB3aW5kb3dcclxuICAgICAgICAgICAgaWYgKHNtYWxsZXN0RGVsdGEgPD0gc2V0dGluZ3MuaGl0V2luZG93UGVyZmVjdCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseVNjb3JlKFwicGVyZmVjdFwiKTtcclxuICAgICAgICAgICAgICAgIG5vdGUuc3RhdGUgPSBOb3RlU3RhdGUuSElUOyAvLyBNYXJrIGFzIGhpdCB0byByZW1vdmUgaXRcclxuICAgICAgICAgICAgICAgIHRoaXMucGVyZmVjdEhpdHMrKztcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheUVmZmVjdChcImhpdEVmZmVjdFwiKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChzbWFsbGVzdERlbHRhIDw9IHNldHRpbmdzLmhpdFdpbmRvd0dvb2QpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlTY29yZShcImdvb2RcIik7XHJcbiAgICAgICAgICAgICAgICBub3RlLnN0YXRlID0gTm90ZVN0YXRlLkhJVDtcclxuICAgICAgICAgICAgICAgIHRoaXMuZ29vZEhpdHMrKztcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheUVmZmVjdChcImhpdEVmZmVjdFwiKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIFRvbyBlYXJseS9sYXRlLCBjb3VudCBhcyBhIG1pc3NcclxuICAgICAgICAgICAgICAgIHRoaXMuaGFuZGxlTWlzcygpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5RWZmZWN0KFwibWlzc0VmZmVjdFwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIE5vIG5vdGUgdG8gaGl0LCBvciBub3RlIGFscmVhZHkgcGFzc2VkL21pc3NlZFxyXG4gICAgICAgICAgICB0aGlzLmhhbmRsZU1pc3MoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5RWZmZWN0KFwibWlzc0VmZmVjdFwiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhcHBseVNjb3JlKHR5cGU6IFwicGVyZmVjdFwiIHwgXCJnb29kXCIpIHtcclxuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIHRoaXMuY29tYm8rKztcclxuICAgICAgICB0aGlzLm1heENvbWJvID0gTWF0aC5tYXgodGhpcy5tYXhDb21ibywgdGhpcy5jb21ibyk7XHJcbiAgICAgICAgdGhpcy50b3RhbEhpdHMrKztcclxuXHJcbiAgICAgICAgbGV0IHNjb3JlVmFsdWUgPSAwO1xyXG4gICAgICAgIGlmICh0eXBlID09PSBcInBlcmZlY3RcIikge1xyXG4gICAgICAgICAgICBzY29yZVZhbHVlID0gc2V0dGluZ3Muc2NvcmVQZXJQZXJmZWN0O1xyXG4gICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gXCJnb29kXCIpIHtcclxuICAgICAgICAgICAgc2NvcmVWYWx1ZSA9IHNldHRpbmdzLnNjb3JlUGVyR29vZDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGNvbWJvIG11bHRpcGxpZXJcclxuICAgICAgICBsZXQgY3VycmVudE11bHRpcGxpZXIgPSAxO1xyXG4gICAgICAgIGlmICh0aGlzLmNvbWJvID49IHNldHRpbmdzLmNvbWJvVGhyZXNob2xkKSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRNdWx0aXBsaWVyICs9IE1hdGguZmxvb3IodGhpcy5jb21ibyAvIHNldHRpbmdzLmNvbWJvVGhyZXNob2xkKSAqIHNldHRpbmdzLm11bHRpcGxpZXJQZXJDb21ibztcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zY29yZSArPSBzY29yZVZhbHVlICogY3VycmVudE11bHRpcGxpZXI7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIGhhbmRsZU1pc3MoKSB7IC8vIENoYW5nZWQgZnJvbSBwcml2YXRlIHRvIHB1YmxpY1xyXG4gICAgICAgIHRoaXMuY29tYm8gPSAwO1xyXG4gICAgICAgIHRoaXMubWlzc0hpdHMrKztcclxuICAgICAgICB0aGlzLnRvdGFsSGl0cysrO1xyXG4gICAgICAgIHRoaXMucGxheUVmZmVjdChcIm1pc3NFZmZlY3RcIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5RWZmZWN0KG5hbWU6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gdGhpcy5sb2FkZWRTb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgICAgICAvLyBDbG9uZSB0aGUgYXVkaW8gZWxlbWVudCBmb3Igc2ltdWx0YW5lb3VzIHBsYXliYWNrIGlmIG5lZWRlZFxyXG4gICAgICAgICAgICBjb25zdCBjbG9uZSA9IGF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XHJcbiAgICAgICAgICAgIGNsb25lLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTsgLy8gRW5zdXJlIGNsb25lZCB2b2x1bWUgaXMgY29ycmVjdFxyXG4gICAgICAgICAgICBjbG9uZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYFNvdW5kIGVmZmVjdCBwbGF5YmFjayBibG9ja2VkOiAke25hbWV9YCwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXcoKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuZHJhd0JhY2tncm91bmQoKTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1BsYXlpbmcoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0JhY2tncm91bmQoKSB7XHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZEltYWdlID0gdGhpcy5sb2FkZWRJbWFnZXMuZ2V0KFwiYmFja2dyb3VuZFwiKTtcclxuICAgICAgICBpZiAoYmFja2dyb3VuZEltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiYWNrZ3JvdW5kSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiIzFhMWExYVwiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcImJvbGQgNDhweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJSaHl0aG0gR2FtZVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjI0cHggQXJpYWxcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcIlByZXNzIEFueSBLZXkgdG8gU3RhcnRcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1BsYXlpbmcoKSB7XHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLmdhbWVEYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBjb25zdCBub3RlSW1hZ2UgPSB0aGlzLmxvYWRlZEltYWdlcy5nZXQoXCJub3RlXCIpO1xyXG4gICAgICAgIGNvbnN0IGhpdFpvbmVJbWFnZSA9IHRoaXMubG9hZGVkSW1hZ2VzLmdldChcImhpdFpvbmVcIik7XHJcblxyXG4gICAgICAgIC8vIERyYXcgbGFuZXMgYW5kIGhpdCB6b25lXHJcbiAgICAgICAgY29uc3QgdG90YWxMYW5lc1dpZHRoID0gc2V0dGluZ3MubGFuZUNvdW50ICogc2V0dGluZ3MubGFuZVdpZHRoICsgKHNldHRpbmdzLmxhbmVDb3VudCAtIDEpICogc2V0dGluZ3MubGFuZVNwYWNpbmc7XHJcbiAgICAgICAgY29uc3Qgc3RhcnRYID0gKHNldHRpbmdzLmNhbnZhc1dpZHRoIC0gdG90YWxMYW5lc1dpZHRoKSAvIDI7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2V0dGluZ3MubGFuZUNvdW50OyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgbGFuZVggPSBzdGFydFggKyBpICogKHNldHRpbmdzLmxhbmVXaWR0aCArIHNldHRpbmdzLmxhbmVTcGFjaW5nKTtcclxuICAgICAgICAgICAgLy8gRHJhdyBsYW5lIGJhY2tncm91bmRcclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCIjMzMzMzMzXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGxhbmVYLCAwLCBzZXR0aW5ncy5sYW5lV2lkdGgsIHRoaXMuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgICAgICAgICAvLyBEcmF3IGxhbmUgaW5wdXQga2V5c1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcInJnYmEoMjU1LCAyNTUsIDI1NSwgMC4yKVwiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIyMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KHNldHRpbmdzLmxhbmVLZXlzW2ldLnRvVXBwZXJDYXNlKCksIGxhbmVYICsgc2V0dGluZ3MubGFuZVdpZHRoIC8gMiwgc2V0dGluZ3MuaGl0Wm9uZVkgKyA1MCk7XHJcblxyXG4gICAgICAgICAgICAvLyBEcmF3IGhpdCB6b25lIGZvciBlYWNoIGxhbmVcclxuICAgICAgICAgICAgaWYgKGhpdFpvbmVJbWFnZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGhpdFpvbmVJbWFnZSwgbGFuZVgsIHNldHRpbmdzLmhpdFpvbmVZIC0gaGl0Wm9uZUltYWdlLmhlaWdodCAvIDIsIHNldHRpbmdzLmxhbmVXaWR0aCwgaGl0Wm9uZUltYWdlLmhlaWdodCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIiMwMGZmZmZcIjsgLy8gQ3lhbiBmb3IgaGl0IHpvbmVcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGxhbmVYLCBzZXR0aW5ncy5oaXRab25lWSwgc2V0dGluZ3MubGFuZVdpZHRoLCA1KTsgLy8gU2ltcGxlIGxpbmVcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gSGlnaGxpZ2h0IHByZXNzZWQgbGFuZXNcclxuICAgICAgICAgICAgaWYgKHRoaXMucHJlc3NlZEtleXMuaGFzKHNldHRpbmdzLmxhbmVLZXlzW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMylcIjtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGxhbmVYLCBzZXR0aW5ncy5oaXRab25lWSAtIDIwLCBzZXR0aW5ncy5sYW5lV2lkdGgsIDQwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRHJhdyBub3Rlc1xyXG4gICAgICAgIHRoaXMuYWN0aXZlTm90ZXMuZm9yRWFjaChub3RlID0+IHtcclxuICAgICAgICAgICAgaWYgKG5vdGVJbWFnZSkge1xyXG4gICAgICAgICAgICAgICAgbm90ZS5kcmF3KHRoaXMuY3R4LCBub3RlSW1hZ2UpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJyZWRcIjsgLy8gRmFsbGJhY2sgY29sb3JcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KG5vdGUueCwgbm90ZS55LCBub3RlLndpZHRoLCBub3RlLmhlaWdodCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gRHJhdyBzY29yZSBhbmQgY29tYm9cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMzBweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwibGVmdFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBTY29yZTogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmUpfWAsIDIwLCA0MCk7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJyaWdodFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBDb21ibzogJHt0aGlzLmNvbWJvfWAsIHRoaXMuY2FudmFzLndpZHRoIC0gMjAsIDQwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlcigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiYm9sZCA0OHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcIkdhbWUgT3ZlciFcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMTAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMzBweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBGaW5hbCBTY29yZTogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmUpfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDIwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgTWF4IENvbWJvOiAke3RoaXMubWF4Q29tYm99YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMzApO1xyXG5cclxuICAgICAgICBjb25zdCB0b3RhbE5vdGVzSGl0ID0gdGhpcy5wZXJmZWN0SGl0cyArIHRoaXMuZ29vZEhpdHM7XHJcbiAgICAgICAgY29uc3QgYWNjdXJhY3kgPSB0aGlzLnRvdGFsSGl0cyA+IDAgPyAodG90YWxOb3Rlc0hpdCAvIHRoaXMudG90YWxIaXRzKSAqIDEwMCA6IDA7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoYEFjY3VyYWN5OiAke2FjY3VyYWN5LnRvRml4ZWQoMil9JWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDgwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMjRweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KFwiUHJlc3MgQW55IEtleSB0byBSZXN0YXJ0XCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiArIDE1MCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEluaXRpYWxpemUgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGlzIHJlYWR5XHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsICgpID0+IHtcclxuICAgIGNvbnN0IGdhbWUgPSBuZXcgR2FtZShcImdhbWVDYW52YXNcIik7XHJcbiAgICBnYW1lLmluaXQoKTtcclxufSk7Il0sCiAgIm1hcHBpbmdzIjogIkFBa0RBLElB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SyxJQUFJLFlBQVk7QUFDckIsYUFBSyxJQUFJLFNBQVMsS0FBSyxHQUFHLEtBQUssR0FBRyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsTUFDN0Q7QUFBQSxJQUNKLENBQUM7QUFHRCxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxVQUFVLEtBQUssTUFBTSxLQUFLLEtBQUssQ0FBQyxJQUFJLElBQUksRUFBRTtBQUM1RCxTQUFLLElBQUksWUFBWTtBQUNyQixTQUFLLElBQUksU0FBUyxVQUFVLEtBQUssS0FBSyxJQUFJLEtBQUssT0FBTyxRQUFRLElBQUksRUFBRTtBQUFBLEVBQ3hFO0FBQUEsRUFFUSxlQUFlO0FBQ25CLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxPQUFPO0FBQ2hCLFNBQUssSUFBSSxZQUFZO0FBQ3JCLFNBQUssSUFBSSxTQUFTLGNBQWMsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEdBQUc7QUFFbkYsU0FBSyxJQUFJLE9BQU87QUFDaEIsU0FBSyxJQUFJLFNBQVMsZ0JBQWdCLEtBQUssTUFBTSxLQUFLLEtBQUssQ0FBQyxJQUFJLEtBQUssT0FBTyxRQUFRLEdBQUcsS0FBSyxPQUFPLFNBQVMsSUFBSSxFQUFFO0FBQzlHLFNBQUssSUFBSSxTQUFTLGNBQWMsS0FBSyxRQUFRLElBQUksS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEVBQUU7QUFFbkcsVUFBTSxnQkFBZ0IsS0FBSyxjQUFjLEtBQUs7QUFDOUMsVUFBTSxXQUFXLEtBQUssWUFBWSxJQUFLLGdCQUFnQixLQUFLLFlBQWEsTUFBTTtBQUMvRSxTQUFLLElBQUksU0FBUyxhQUFhLFNBQVMsUUFBUSxDQUFDLENBQUMsS0FBSyxLQUFLLE9BQU8sUUFBUSxHQUFHLEtBQUssT0FBTyxTQUFTLElBQUksRUFBRTtBQUV6RyxTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLElBQUksU0FBUyw0QkFBNEIsS0FBSyxPQUFPLFFBQVEsR0FBRyxLQUFLLE9BQU8sU0FBUyxJQUFJLEdBQUc7QUFBQSxFQUNyRztBQUNKO0FBR0EsU0FBUyxpQkFBaUIsb0JBQW9CLE1BQU07QUFDaEQsUUFBTSxPQUFPLElBQUksS0FBSyxZQUFZO0FBQ2xDLE9BQUssS0FBSztBQUNkLENBQUM7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSIsICJOb3RlU3RhdGUiXQp9Cg==
