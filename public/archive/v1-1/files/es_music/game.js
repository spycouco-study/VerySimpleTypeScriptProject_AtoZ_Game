var NoteType = /* @__PURE__ */ ((NoteType2) => {
  NoteType2["TAP"] = "TAP";
  NoteType2["HOLD"] = "HOLD";
  NoteType2["SLIDE"] = "SLIDE";
  return NoteType2;
})(NoteType || {});
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2["TITLE"] = "TITLE";
  GameState2["PLAYING"] = "PLAYING";
  GameState2["GAME_OVER"] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var NoteState = /* @__PURE__ */ ((NoteState2) => {
  NoteState2["FALLING"] = "FALLING";
  NoteState2["HIT"] = "HIT";
  NoteState2["HOLDING"] = "HOLDING";
  NoteState2["MISSED"] = "MISSED";
  NoteState2["PASSED"] = "PASSED";
  return NoteState2;
})(NoteState || {});
class Note {
  // True if the initial hit for a HOLD note was successful
  constructor(lane, arrivalTime, game, type = "TAP" /* TAP */, duration, endLane) {
    this.lane = lane;
    this.arrivalTime = arrivalTime;
    this.state = "FALLING" /* FALLING */;
    const settings = game.gameData.gameSettings;
    this.spawnTime = this.arrivalTime - settings.fallDuration;
    this.width = settings.noteWidth;
    this.height = settings.noteHeight;
    const totalLanesWidth = settings.laneCount * settings.laneWidth + (settings.laneCount - 1) * settings.laneSpacing;
    const startX = (settings.canvasWidth - totalLanesWidth) / 2;
    this.x = startX + lane * (settings.laneWidth + settings.laneSpacing) + (settings.laneWidth - this.width) / 2;
    this.y = settings.noteSpawnY;
    this.type = type;
    this.duration = duration;
    this.endLane = endLane;
    this.isHolding = false;
  }
  update(currentTime, game) {
    if (this.state !== "FALLING" /* FALLING */ && this.state !== "HOLDING" /* HOLDING */) return;
    const settings = game.gameData.gameSettings;
    const travelDistanceForTop = settings.hitZoneY - settings.noteHeight - settings.noteSpawnY;
    const progress = Math.max(0, Math.min(1, (currentTime - this.spawnTime) / settings.fallDuration));
    this.y = settings.noteSpawnY + progress * travelDistanceForTop;
    if (this.state === "FALLING" /* FALLING */ && currentTime > this.arrivalTime + settings.hitWindowGood) {
      this.state = "PASSED" /* PASSED */;
      game.handleMiss(this);
    }
    if (this.state === "HOLDING" /* HOLDING */ && this.type === "HOLD" /* HOLD */ && this.duration) {
      if (currentTime >= this.arrivalTime + this.duration) {
        this.state = "HIT" /* HIT */;
      }
    }
  }
  draw(ctx, noteImage, game) {
    if (this.state === "HIT" /* HIT */ && this.type !== "HOLD" /* HOLD */) return;
    if (this.state === "MISSED" /* MISSED */ || this.state === "PASSED" /* PASSED */) return;
    const settings = game.gameData.gameSettings;
    let totalVisualHeight = this.height;
    let fillColor = "#FF0000";
    if (this.type === "HOLD" /* HOLD */ && this.duration) {
      const holdPixelLength = this.duration * settings.noteSpeed;
      const holdTrailY = this.y - holdPixelLength;
      totalVisualHeight = this.height + holdPixelLength;
      fillColor = "#0000FF";
      ctx.fillStyle = fillColor;
      ctx.fillRect(this.x, holdTrailY, this.width, holdPixelLength);
    } else if (this.type === "SLIDE" /* SLIDE */) {
      fillColor = "#00FF00";
    }
    if (noteImage) {
      ctx.drawImage(noteImage, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = fillColor;
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
    if (this.type === "SLIDE" /* SLIDE */) {
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.height / 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.state === "HOLDING" /* HOLDING */) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      const overlayY = this.type === "HOLD" /* HOLD */ && this.duration ? this.y - this.duration * settings.noteSpeed : this.y;
      const overlayHeight = totalVisualHeight;
      ctx.fillRect(this.x, overlayY, this.width, overlayHeight);
    }
  }
}
class Game {
  constructor(canvasId) {
    this.loadedImages = /* @__PURE__ */ new Map();
    this.loadedSounds = /* @__PURE__ */ new Map();
    this.gameState = "TITLE" /* TITLE */;
    this.lastTime = 0;
    this.currentAudioTime = 0;
    this.bgmAudio = null;
    this.bgmStartTime = 0;
    this.activeNotes = [];
    this.beatmapIndex = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.totalHits = 0;
    this.perfectHits = 0;
    this.greatHits = 0;
    // New
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
      const settings = this.gameData.gameSettings;
      settings.fallDuration = (settings.hitZoneY - settings.noteSpawnY - settings.noteHeight) / settings.noteSpeed;
      if (settings.fallDuration < 0) {
        console.warn("Calculated fallDuration is negative. Adjusting to 0. Check noteSpawnY, hitZoneY, and noteHeight.");
        settings.fallDuration = 0;
      }
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
      this.bgmAudio.loop = false;
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
    this.greatHits = 0;
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
      const noteSpawnTime = nextNoteData.time - this.gameData.gameSettings.fallDuration;
      let effectiveSpawnTime = noteSpawnTime;
      if (nextNoteData.type === "HOLD" /* HOLD */ && nextNoteData.duration) {
      }
      if (this.currentAudioTime >= effectiveSpawnTime) {
        const note = new Note(nextNoteData.lane, nextNoteData.time, this, nextNoteData.type, nextNoteData.duration, nextNoteData.endLane);
        this.activeNotes.push(note);
        this.beatmapIndex++;
      } else {
        break;
      }
    }
    for (let i = this.activeNotes.length - 1; i >= 0; i--) {
      const note = this.activeNotes[i];
      note.update(this.currentAudioTime, this);
      if (note.state === "HIT" /* HIT */ || note.state === "MISSED" /* MISSED */ || note.state === "PASSED" /* PASSED */) {
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
    const bgmDuration = this.gameData.assets.sounds.find((s) => s.name === "bgm")?.duration_seconds || 0;
    if (this.bgmAudio && this.bgmAudio.ended || this.currentAudioTime > bgmDuration + 2) {
      if (this.activeNotes.length === 0) {
        this.endGame();
      }
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
    let targetNote = null;
    for (let i = 0; i < this.activeNotes.length; i++) {
      const note = this.activeNotes[i];
      if (note.lane === lane && note.state === "FALLING" /* FALLING */) {
        const delta = Math.abs(inputTime - note.arrivalTime);
        if (delta < smallestDelta) {
          smallestDelta = delta;
          bestNoteIndex = i;
          targetNote = note;
        }
      }
    }
    if (targetNote) {
      if (smallestDelta <= settings.hitWindowPerfect) {
        this.applyJudgment("perfect", targetNote);
      } else if (smallestDelta <= settings.hitWindowGreat) {
        this.applyJudgment("great", targetNote);
      } else if (smallestDelta <= settings.hitWindowGood) {
        this.applyJudgment("good", targetNote);
      } else {
        this.handleMiss(targetNote);
      }
    } else {
      this.handleMiss(null);
    }
  }
  applyJudgment(type, note) {
    const settings = this.gameData.gameSettings;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.totalHits++;
    let scoreValue = 0;
    if (type === "perfect") {
      scoreValue = settings.scorePerPerfect;
      this.perfectHits++;
    } else if (type === "great") {
      scoreValue = settings.scorePerGreat;
      this.greatHits++;
    } else if (type === "good") {
      scoreValue = settings.scorePerGood;
      this.goodHits++;
    }
    let currentMultiplier = 1;
    if (this.combo >= settings.comboThreshold) {
      currentMultiplier += Math.floor(this.combo / settings.comboThreshold) * settings.multiplierPerCombo;
    }
    this.score += scoreValue * currentMultiplier;
    if (note.type === "HOLD" /* HOLD */) {
      note.state = "HOLDING" /* HOLDING */;
      note.isHolding = true;
    } else {
      note.state = "HIT" /* HIT */;
    }
    this.playEffect("hitEffect");
  }
  handleMiss(note) {
    this.combo = 0;
    this.missHits++;
    this.totalHits++;
    this.score -= this.gameData.gameSettings.scorePenaltyPerMiss;
    if (note && (note.state === "FALLING" /* FALLING */ || note.state === "HOLDING" /* HOLDING */)) {
      note.state = "MISSED" /* MISSED */;
    }
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
      note.draw(this.ctx, noteImage, this);
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
    const totalNotesHit = this.perfectHits + this.greatHits + this.goodHits;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gZ2FtZS50c1xyXG5cclxuaW50ZXJmYWNlIEFzc2V0SW1hZ2Uge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXNzZXRTb3VuZCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuZW51bSBOb3RlVHlwZSB7XHJcbiAgICBUQVAgPSBcIlRBUFwiLFxyXG4gICAgSE9MRCA9IFwiSE9MRFwiLFxyXG4gICAgU0xJREUgPSBcIlNMSURFXCIsXHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lU2V0dGluZ3Mge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgbm90ZVNwZWVkOiBudW1iZXI7IC8vIHBpeGVscyBwZXIgc2Vjb25kXHJcbiAgICBoaXRab25lWTogbnVtYmVyOyAvLyBZLWNvb3JkaW5hdGUgb2YgdGhlIGhpdCB6b25lIChib3R0b20gb2YgdGhlIG5vdGUpXHJcbiAgICBub3RlU3Bhd25ZOiBudW1iZXI7IC8vIFktY29vcmRpbmF0ZSB3aGVyZSBub3RlcyBhcHBlYXIgKHRvcCBvZiB0aGUgbm90ZSlcclxuICAgIG5vdGVXaWR0aDogbnVtYmVyO1xyXG4gICAgbm90ZUhlaWdodDogbnVtYmVyO1xyXG4gICAgbGFuZUNvdW50OiBudW1iZXI7XHJcbiAgICBsYW5lV2lkdGg6IG51bWJlcjtcclxuICAgIGxhbmVTcGFjaW5nOiBudW1iZXI7IC8vIFNwYWNpbmcgYmV0d2VlbiBsYW5lc1xyXG4gICAgbGFuZUtleXM6IHN0cmluZ1tdOyAvLyBLZXlzIGNvcnJlc3BvbmRpbmcgdG8gZWFjaCBsYW5lXHJcbiAgICBoaXRXaW5kb3dQZXJmZWN0OiBudW1iZXI7IC8vIFRpbWUgd2luZG93IGZvciBwZXJmZWN0IGhpdCAoKy8tIHNlY29uZHMpXHJcbiAgICBoaXRXaW5kb3dHcmVhdDogbnVtYmVyOyAvLyBOZXc6IFRpbWUgd2luZG93IGZvciBncmVhdCBoaXQgKCsvLSBzZWNvbmRzKVxyXG4gICAgaGl0V2luZG93R29vZDogbnVtYmVyOyAvLyBUaW1lIHdpbmRvdyBmb3IgZ29vZCBoaXQgKCsvLSBzZWNvbmRzKVxyXG4gICAgc2NvcmVQZXJQZXJmZWN0OiBudW1iZXI7XHJcbiAgICBzY29yZVBlckdyZWF0OiBudW1iZXI7IC8vIE5ldzogU2NvcmUgZm9yIGEgZ3JlYXQgaGl0XHJcbiAgICBzY29yZVBlckdvb2Q6IG51bWJlcjtcclxuICAgIGNvbWJvVGhyZXNob2xkOiBudW1iZXI7IC8vIENvbWJvIHN0YXJ0cyBjb250cmlidXRpbmcgc2NvcmUgYWZ0ZXIgdGhpcyBtYW55IGhpdHNcclxuICAgIG11bHRpcGxpZXJQZXJDb21ibzogbnVtYmVyOyAvLyBTY29yZSBtdWx0aXBsaWVyIGluY3JlYXNlIHBlciBjb21ibyB0aWVyXHJcbiAgICBzY29yZVBlbmFsdHlQZXJNaXNzOiBudW1iZXI7IC8vIFNjb3JlIGRlZHVjdGVkIHdoZW4gYSBub3RlIGlzIG1pc3NlZCBvciBwYXNzZWRcclxuICAgIGJwbTogbnVtYmVyOyAvLyBOZXc6IEJlYXRzIHBlciBtaW51dGVcclxuICAgIHRpbWVTaWduYXR1cmU6IHN0cmluZzsgLy8gTmV3OiBUaW1lIHNpZ25hdHVyZSAoZS5nLiwgXCI0LzRcIilcclxuICAgIGJlYXRPZmZzZXQ6IG51bWJlcjsgLy8gTmV3OiBPZmZzZXQgZm9yIHRoZSBmaXJzdCBkb3duYmVhdCBpbiBtaWxsaXNlY29uZHNcclxuICAgIGZhbGxEdXJhdGlvbjogbnVtYmVyOyAvLyBBZGRlZDogQ2FsY3VsYXRlZCBwcm9wZXJ0eSBmb3IgdGltZSBhIG5vdGUgdGFrZXMgdG8gZmFsbFxyXG59XHJcblxyXG5pbnRlcmZhY2UgQmVhdG1hcE5vdGUge1xyXG4gICAgdGltZTogbnVtYmVyOyAvLyBUaW1lIGluIHNlY29uZHMgd2hlbiB0aGUgbm90ZSBzaG91bGQgYmUgaGl0IChvciBzdGFydCBmb3IgSG9sZC9TbGlkZSlcclxuICAgIGxhbmU6IG51bWJlcjsgLy8gTGFuZSBpbmRleCAoMCB0byBsYW5lQ291bnQtMSlcclxuICAgIHR5cGU/OiBOb3RlVHlwZTsgLy8gT3B0aW9uYWwsIGRlZmF1bHRzIHRvIFRBUFxyXG4gICAgZHVyYXRpb24/OiBudW1iZXI7IC8vIEZvciBIT0xEIG5vdGVzLCBob3cgbG9uZyB0byBob2xkIChzZWNvbmRzKVxyXG4gICAgZW5kTGFuZT86IG51bWJlcjsgLy8gRm9yIFNMSURFIG5vdGVzLCB0aGUgZW5kaW5nIGxhbmUgKGZvciB2aXN1YWwgb3IgaW5wdXQgcGF0aClcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBBc3NldEltYWdlW107XHJcbiAgICAgICAgc291bmRzOiBBc3NldFNvdW5kW107XHJcbiAgICB9O1xyXG4gICAgYmVhdG1hcDogQmVhdG1hcE5vdGVbXTtcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUgPSBcIlRJVExFXCIsXHJcbiAgICBQTEFZSU5HID0gXCJQTEFZSU5HXCIsXHJcbiAgICBHQU1FX09WRVIgPSBcIkdBTUVfT1ZFUlwiLFxyXG59XHJcblxyXG5lbnVtIE5vdGVTdGF0ZSB7XHJcbiAgICBGQUxMSU5HID0gXCJGQUxMSU5HXCIsXHJcbiAgICBISVQgPSBcIkhJVFwiLCAgICAgICAgICAvLyBTdWNjZXNzZnVsbHkgaGl0ICh0YXAvc2xpZGUsIG9yIGluaXRpYWwgcHJlc3Mgb2YgaG9sZClcclxuICAgIEhPTERJTkcgPSBcIkhPTERJTkdcIiwgIC8vIEFjdGl2ZWx5IGhvbGRpbmcgYSBob2xkIG5vdGUgKHNpbXBsaWZpZWQ6IG1lYW5zIGluaXRpYWwgaGl0IHdhcyBzdWNjZXNzZnVsKVxyXG4gICAgTUlTU0VEID0gXCJNSVNTRURcIiwgICAgLy8gQ29tcGxldGVseSBtaXNzZWQgYnkgaW5wdXQgdGltaW5nIG9yIHdyb25nIGlucHV0XHJcbiAgICBQQVNTRUQgPSBcIlBBU1NFRFwiLCAgICAvLyBOb3RlIHBhc3NlZCBoaXQgem9uZSB3aXRob3V0IGlucHV0XHJcbn1cclxuXHJcbmNsYXNzIE5vdGUge1xyXG4gICAgbGFuZTogbnVtYmVyO1xyXG4gICAgc3Bhd25UaW1lOiBudW1iZXI7IC8vIFRpbWUgd2hlbiBub3RlIGFwcGVhcnMgYXQgbm90ZVNwYXduWVxyXG4gICAgYXJyaXZhbFRpbWU6IG51bWJlcjsgLy8gVGltZSBpbiBzZWNvbmRzIHdoZW4gdGhlICpib3R0b20qIG9mIHRoZSBub3RlIHNob3VsZCByZWFjaCBoaXRab25lWVxyXG4gICAgc3RhdGU6IE5vdGVTdGF0ZTtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjsgLy8gWS1jb29yZGluYXRlIG9mIHRoZSAqdG9wKiBvZiB0aGUgbm90ZVxyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyOyAvLyBTdGFuZGFyZCBoZWlnaHQgb2YgdGhlIG5vdGUgZ3JhcGhpY1xyXG4gICAgLy8gUmVtb3ZlZCBmYWxsRHVyYXRpb24gZnJvbSBOb3RlIGNsYXNzLCBhcyBpdCdzIG5vdyBhIGdsb2JhbCBnYW1lIHNldHRpbmcuXHJcblxyXG4gICAgdHlwZTogTm90ZVR5cGU7XHJcbiAgICBkdXJhdGlvbj86IG51bWJlcjsgLy8gRm9yIEhPTEQgbm90ZXNcclxuICAgIGVuZExhbmU/OiBudW1iZXI7IC8vIEZvciBTTElERSBub3Rlc1xyXG4gICAgXHJcbiAgICAvLyBGb3Igc2ltcGxpZmllZCBIT0xEIG5vdGUgcHJvY2Vzc2luZzpcclxuICAgIGlzSG9sZGluZzogYm9vbGVhbjsgLy8gVHJ1ZSBpZiB0aGUgaW5pdGlhbCBoaXQgZm9yIGEgSE9MRCBub3RlIHdhcyBzdWNjZXNzZnVsXHJcblxyXG4gICAgY29uc3RydWN0b3IobGFuZTogbnVtYmVyLCBhcnJpdmFsVGltZTogbnVtYmVyLCBnYW1lOiBHYW1lLCB0eXBlOiBOb3RlVHlwZSA9IE5vdGVUeXBlLlRBUCwgZHVyYXRpb24/OiBudW1iZXIsIGVuZExhbmU/OiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLmxhbmUgPSBsYW5lO1xyXG4gICAgICAgIHRoaXMuYXJyaXZhbFRpbWUgPSBhcnJpdmFsVGltZTtcclxuICAgICAgICB0aGlzLnN0YXRlID0gTm90ZVN0YXRlLkZBTExJTkc7XHJcblxyXG4gICAgICAgIGNvbnN0IHNldHRpbmdzID0gZ2FtZS5nYW1lRGF0YS5nYW1lU2V0dGluZ3M7XHJcbiAgICAgICAgLy8gVXNlIHRoZSBwcmUtY2FsY3VsYXRlZCBmYWxsRHVyYXRpb24gZnJvbSBnYW1lIHNldHRpbmdzXHJcbiAgICAgICAgdGhpcy5zcGF3blRpbWUgPSB0aGlzLmFycml2YWxUaW1lIC0gc2V0dGluZ3MuZmFsbER1cmF0aW9uOyAvLyBOb3RlJ3MgVE9QIHNwYXducyBhdCBub3RlU3Bhd25ZXHJcblxyXG4gICAgICAgIHRoaXMud2lkdGggPSBzZXR0aW5ncy5ub3RlV2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBzZXR0aW5ncy5ub3RlSGVpZ2h0O1xyXG5cclxuICAgICAgICBjb25zdCB0b3RhbExhbmVzV2lkdGggPSBzZXR0aW5ncy5sYW5lQ291bnQgKiBzZXR0aW5ncy5sYW5lV2lkdGggKyAoc2V0dGluZ3MubGFuZUNvdW50IC0gMSkgKiBzZXR0aW5ncy5sYW5lU3BhY2luZztcclxuICAgICAgICBjb25zdCBzdGFydFggPSAoc2V0dGluZ3MuY2FudmFzV2lkdGggLSB0b3RhbExhbmVzV2lkdGgpIC8gMjtcclxuICAgICAgICB0aGlzLnggPSBzdGFydFggKyBsYW5lICogKHNldHRpbmdzLmxhbmVXaWR0aCArIHNldHRpbmdzLmxhbmVTcGFjaW5nKSArIChzZXR0aW5ncy5sYW5lV2lkdGggLSB0aGlzLndpZHRoKSAvIDI7XHJcblxyXG4gICAgICAgIHRoaXMueSA9IHNldHRpbmdzLm5vdGVTcGF3blk7IC8vIEluaXRpYWwgWSBwb3NpdGlvbiAodG9wIG9mIHRoZSBub3RlKVxyXG5cclxuICAgICAgICB0aGlzLnR5cGUgPSB0eXBlO1xyXG4gICAgICAgIHRoaXMuZHVyYXRpb24gPSBkdXJhdGlvbjtcclxuICAgICAgICB0aGlzLmVuZExhbmUgPSBlbmRMYW5lO1xyXG4gICAgICAgIHRoaXMuaXNIb2xkaW5nID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGN1cnJlbnRUaW1lOiBudW1iZXIsIGdhbWU6IEdhbWUpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSAhPT0gTm90ZVN0YXRlLkZBTExJTkcgJiYgdGhpcy5zdGF0ZSAhPT0gTm90ZVN0YXRlLkhPTERJTkcpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBnYW1lLmdhbWVEYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIHRvdGFsIGRpc3RhbmNlIHRoZSAqdG9wKiBvZiB0aGUgbm90ZSB0cmF2ZWxzXHJcbiAgICAgICAgY29uc3QgdHJhdmVsRGlzdGFuY2VGb3JUb3AgPSBzZXR0aW5ncy5oaXRab25lWSAtIHNldHRpbmdzLm5vdGVIZWlnaHQgLSBzZXR0aW5ncy5ub3RlU3Bhd25ZO1xyXG4gICAgICAgIC8vIENhbGN1bGF0ZSBwcm9ncmVzcyBiYXNlZCBvbiB0aGUgZ2xvYmFsIGZhbGxEdXJhdGlvblxyXG4gICAgICAgIGNvbnN0IHByb2dyZXNzID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgKGN1cnJlbnRUaW1lIC0gdGhpcy5zcGF3blRpbWUpIC8gc2V0dGluZ3MuZmFsbER1cmF0aW9uKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gdGhpcy55IGlzIHRoZSBZLWNvb3JkaW5hdGUgb2YgdGhlICp0b3AqIG9mIHRoZSBub3RlXHJcbiAgICAgICAgdGhpcy55ID0gc2V0dGluZ3Mubm90ZVNwYXduWSArIHByb2dyZXNzICogdHJhdmVsRGlzdGFuY2VGb3JUb3A7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRm9yIEhPTEQgbm90ZXMsIHRoZSB2aXN1YWwgbGVuZ3RoIHdpbGwgYmUgZHJhd24gYWJvdmUgdGhpcy55XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciBtaXNzZWQgbm90ZXMgKHBhc3NlZCBoaXQgem9uZSB3aXRob3V0IGlucHV0KVxyXG4gICAgICAgIC8vIElmIGN1cnJlbnRUaW1lIHBhc3NlcyB0aGUgYXJyaXZhbFRpbWUgKyBnb29kIGhpdCB3aW5kb3csIGFuZCBpdCdzIHN0aWxsIGZhbGxpbmdcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gTm90ZVN0YXRlLkZBTExJTkcgJiYgY3VycmVudFRpbWUgPiB0aGlzLmFycml2YWxUaW1lICsgc2V0dGluZ3MuaGl0V2luZG93R29vZCkge1xyXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gTm90ZVN0YXRlLlBBU1NFRDtcclxuICAgICAgICAgICAgZ2FtZS5oYW5kbGVNaXNzKHRoaXMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBGb3Igc2ltcGxpZmllZCBIT0xEIG5vdGVzLCBpZiBzdWNjZXNzZnVsbHkgXCJoaXRcIiAoc3RhdGUgaXMgSE9MRElORykgYW5kIGl0cyBkdXJhdGlvbiBwYXNzZXNcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gTm90ZVN0YXRlLkhPTERJTkcgJiYgdGhpcy50eXBlID09PSBOb3RlVHlwZS5IT0xEICYmIHRoaXMuZHVyYXRpb24pIHtcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRUaW1lID49IHRoaXMuYXJyaXZhbFRpbWUgKyB0aGlzLmR1cmF0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUaGUgaG9sZCBkdXJhdGlvbiBoYXMgZmluaXNoZWQuIE1hcmsgYXMgSElUIChzdWNjZXNzZnVsbHkgY29tcGxldGVkKS5cclxuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBzaW1wbGlmaWNhdGlvbjsgYSBmdWxsIGltcGxlbWVudGF0aW9uIHdvdWxkIHRyYWNrIGtleXVwLlxyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IE5vdGVTdGF0ZS5ISVQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgbm90ZUltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LCBnYW1lOiBHYW1lKSB7XHJcbiAgICAgICAgLy8gRG8gbm90IGRyYXcgbm90ZXMgdGhhdCBhcmUgYWxyZWFkeSBwcm9jZXNzZWQgb3IgYXJlIG1lcmVseSBpbiBhIHRyYW5zaXRpb25hbCAnSElUJyBzdGF0ZVxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBOb3RlU3RhdGUuSElUICYmIHRoaXMudHlwZSAhPT0gTm90ZVR5cGUuSE9MRCkgcmV0dXJuOyAvLyBUYXAvU2xpZGUgZGlzYXBwZWFyIGluc3RhbnRseVxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBOb3RlU3RhdGUuTUlTU0VEIHx8IHRoaXMuc3RhdGUgPT09IE5vdGVTdGF0ZS5QQVNTRUQpIHJldHVybjsgLy8gTWlzc2VkL1Bhc3NlZCBkaXNhcHBlYXJcclxuXHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBnYW1lLmdhbWVEYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBsZXQgdG90YWxWaXN1YWxIZWlnaHQgPSB0aGlzLmhlaWdodDsgLy8gRGVmYXVsdCB0b3RhbCBoZWlnaHQgZm9yIFRBUC9TTElERSBub3Rlc1xyXG4gICAgICAgIGxldCBmaWxsQ29sb3IgPSBcIiNGRjAwMDBcIjsgLy8gRGVmYXVsdDogUmVkIGZvciBUQVBcclxuXHJcbiAgICAgICAgaWYgKHRoaXMudHlwZSA9PT0gTm90ZVR5cGUuSE9MRCAmJiB0aGlzLmR1cmF0aW9uKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhvbGRQaXhlbExlbmd0aCA9IHRoaXMuZHVyYXRpb24gKiBzZXR0aW5ncy5ub3RlU3BlZWQ7IC8vIFBpeGVscyByZXByZXNlbnRpbmcgdGhlIGhvbGQgZHVyYXRpb25cclxuICAgICAgICAgICAgY29uc3QgaG9sZFRyYWlsWSA9IHRoaXMueSAtIGhvbGRQaXhlbExlbmd0aDsgLy8gVHJhaWwgc3RhcnRzIGFib3ZlIHRoZSBtYWluIG5vdGUgaW1hZ2VcclxuICAgICAgICAgICAgdG90YWxWaXN1YWxIZWlnaHQgPSB0aGlzLmhlaWdodCArIGhvbGRQaXhlbExlbmd0aDsgLy8gVG90YWwgdmlzdWFsIGhlaWdodCBvZiB0aGUgZW50aXJlIGhvbGQgbm90ZVxyXG4gICAgICAgICAgICBmaWxsQ29sb3IgPSBcIiMwMDAwRkZcIjsgLy8gQmx1ZSBmb3IgSE9MRFxyXG5cclxuICAgICAgICAgICAgLy8gRHJhdyB0aGUgaG9sZCB0cmFpbCBwYXJ0IChhYm92ZSB0aGUgbWFpbiBub3RlIGltYWdlKVxyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gZmlsbENvbG9yO1xyXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCBob2xkVHJhaWxZLCB0aGlzLndpZHRoLCBob2xkUGl4ZWxMZW5ndGgpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy50eXBlID09PSBOb3RlVHlwZS5TTElERSkge1xyXG4gICAgICAgICAgICBmaWxsQ29sb3IgPSBcIiMwMEZGMDBcIjsgLy8gR3JlZW4gZm9yIFNMSURFXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEcmF3IHRoZSBtYWluIG5vdGUgaW1hZ2UgKG9yIGEgZmFsbGJhY2sgcmVjdGFuZ2xlKVxyXG4gICAgICAgIGlmIChub3RlSW1hZ2UpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShub3RlSW1hZ2UsIHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gRmFsbGJhY2sgcmVjdGFuZ2xlIGZvciB0aGUgbWFpbiBub3RlIHBhcnRcclxuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGZpbGxDb2xvcjtcclxuICAgICAgICAgICAgY3R4LmZpbGxSZWN0KHRoaXMueCwgdGhpcy55LCB0aGlzLndpZHRoLCB0aGlzLmhlaWdodCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBZGQgYSB2aXN1YWwgaW5kaWNhdG9yIGZvciBTTElERSBub3Rlc1xyXG4gICAgICAgIGlmICh0aGlzLnR5cGUgPT09IE5vdGVUeXBlLlNMSURFKSB7XHJcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7IC8vIFNtYWxsIGRvdCBvciBhcnJvd1xyXG4gICAgICAgICAgICBjdHguYmVnaW5QYXRoKCk7XHJcbiAgICAgICAgICAgIGN0eC5hcmModGhpcy54ICsgdGhpcy53aWR0aCAvIDIsIHRoaXMueSArIHRoaXMuaGVpZ2h0IC8gMiwgdGhpcy5oZWlnaHQgLyA0LCAwLCBNYXRoLlBJICogMik7XHJcbiAgICAgICAgICAgIGN0eC5maWxsKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFZpc3VhbCBmZWVkYmFjayBmb3Igbm90ZXMgYmVpbmcgaGVsZCAoZS5nLiwgYnJpZ2h0ZXIgY29sb3IpXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IE5vdGVTdGF0ZS5IT0xESU5HKSB7XHJcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMjU1LCAyNTUsIDI1NSwgMC40KVwiOyAvLyBTZW1pLXRyYW5zcGFyZW50IHdoaXRlIG92ZXJsYXlcclxuICAgICAgICAgICAgLy8gT3ZlcmxheSBzaG91bGQgY292ZXIgdGhlIGVudGlyZSB2aXNpYmxlIHBhcnQgb2YgdGhlIG5vdGUsIGluY2x1ZGluZyBob2xkIHRyYWlsXHJcbiAgICAgICAgICAgIGNvbnN0IG92ZXJsYXlZID0gKHRoaXMudHlwZSA9PT0gTm90ZVR5cGUuSE9MRCAmJiB0aGlzLmR1cmF0aW9uKSA/ICh0aGlzLnkgLSAodGhpcy5kdXJhdGlvbiAqIHNldHRpbmdzLm5vdGVTcGVlZCkpIDogdGhpcy55O1xyXG4gICAgICAgICAgICBjb25zdCBvdmVybGF5SGVpZ2h0ID0gdG90YWxWaXN1YWxIZWlnaHQ7IC8vIFVzZSB0aGUgY2FsY3VsYXRlZCB0b3RhbFZpc3VhbEhlaWdodFxyXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCBvdmVybGF5WSwgdGhpcy53aWR0aCwgb3ZlcmxheUhlaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICBwdWJsaWMgcmVhZG9ubHkgZ2FtZURhdGEhOiBHYW1lRGF0YTtcclxuICAgIHByaXZhdGUgbG9hZGVkSW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuICAgIHByaXZhdGUgbG9hZGVkU291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuXHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgcHJpdmF0ZSBsYXN0VGltZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY3VycmVudEF1ZGlvVGltZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYmdtU3RhcnRUaW1lOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIHByaXZhdGUgYWN0aXZlTm90ZXM6IE5vdGVbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBiZWF0bWFwSW5kZXg6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgY29tYm86IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIG1heENvbWJvOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSB0b3RhbEhpdHM6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHBlcmZlY3RIaXRzOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBncmVhdEhpdHM6IG51bWJlciA9IDA7IC8vIE5ld1xyXG4gICAgcHJpdmF0ZSBnb29kSGl0czogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgbWlzc0hpdHM6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBwcmVzc2VkS2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcbiAgICBwcml2YXRlIGp1c3RQcmVzc2VkS2V5czogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FudmFzSWQ6IHN0cmluZykge1xyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoY2FudmFzSWQpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW52YXMgZWxlbWVudCB3aXRoIElEICcke2NhbnZhc0lkfScgbm90IGZvdW5kLmApO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoXCIyZFwiKSE7XHJcbiAgICAgICAgaWYgKCF0aGlzLmN0eCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJGYWlsZWQgdG8gZ2V0IDJEIHJlbmRlcmluZyBjb250ZXh0LlwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFkZEV2ZW50TGlzdGVuZXJzKCkge1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCAoZSkgPT4gdGhpcy5oYW5kbGVLZXlEb3duKGUpKTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleXVwXCIsIChlKSA9PiB0aGlzLmhhbmRsZUtleVVwKGUpKTtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKFtcIlNwYWNlXCIsIFwiQXJyb3dVcFwiLCBcIkFycm93RG93blwiLCBcIkFycm93TGVmdFwiLCBcIkFycm93UmlnaHRcIl0uaW5jbHVkZXMoZS5jb2RlKSkge1xyXG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgY29uc3Qga2V5ID0gZXZlbnQua2V5LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgaWYgKCF0aGlzLnByZXNzZWRLZXlzLmhhcyhrZXkpKSB7XHJcbiAgICAgICAgICAgIHRoaXMucHJlc3NlZEtleXMuYWRkKGtleSk7XHJcbiAgICAgICAgICAgIHRoaXMuanVzdFByZXNzZWRLZXlzLmFkZChrZXkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUtleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgY29uc3Qga2V5ID0gZXZlbnQua2V5LnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgdGhpcy5wcmVzc2VkS2V5cy5kZWxldGUoa2V5KTtcclxuICAgICAgICAvLyBJZiBhIGhvbGQgbm90ZSB3YXMgYmVpbmcgaGVsZCwgdGhpcyBrZXl1cCBtaWdodCBlbmQgaXQuXHJcbiAgICAgICAgLy8gRm9yIHRoZSBjdXJyZW50IHNpbXBsaWZpZWQgaG9sZCBsb2dpYywgdGhpcyBpcyBub3QgYWN0aXZlbHkgdHJhY2tlZCBoZXJlLlxyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJMb2FkaW5nIGdhbWUgZGF0YS4uLlwiKTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKFwiZGF0YS5qc29uXCIpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKHRoaXMuZ2FtZURhdGEgYXMgR2FtZURhdGEpID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIEdhbWVEYXRhO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGZhbGxEdXJhdGlvbiBiYXNlZCBvbiBsb2FkZWQgc2V0dGluZ3MgYW5kIGFkZCBpdCB0byBnYW1lU2V0dGluZ3NcclxuICAgICAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLmdhbWVEYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICAgICAgLy8gZmFsbER1cmF0aW9uIGlzIHRoZSB0aW1lIGl0IHRha2VzIGZvciB0aGUgKmJvdHRvbSogb2YgdGhlIG5vdGUgdG8gcmVhY2ggaGl0Wm9uZVlcclxuICAgICAgICAgICAgc2V0dGluZ3MuZmFsbER1cmF0aW9uID0gKHNldHRpbmdzLmhpdFpvbmVZIC0gc2V0dGluZ3Mubm90ZVNwYXduWSAtIHNldHRpbmdzLm5vdGVIZWlnaHQpIC8gc2V0dGluZ3Mubm90ZVNwZWVkO1xyXG4gICAgICAgICAgICBpZiAoc2V0dGluZ3MuZmFsbER1cmF0aW9uIDwgMCkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwiQ2FsY3VsYXRlZCBmYWxsRHVyYXRpb24gaXMgbmVnYXRpdmUuIEFkanVzdGluZyB0byAwLiBDaGVjayBub3RlU3Bhd25ZLCBoaXRab25lWSwgYW5kIG5vdGVIZWlnaHQuXCIpO1xyXG4gICAgICAgICAgICAgICAgc2V0dGluZ3MuZmFsbER1cmF0aW9uID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJHYW1lIGRhdGEgbG9hZGVkOlwiLCB0aGlzLmdhbWVEYXRhKTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLmhlaWdodCA9IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkFzc2V0cyBsb2FkZWQuXCIpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5zdGFydFRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZUxvb3AoMCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBpbml0aWFsaXplIGdhbWU6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMjBweCBBcmlhbFwiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcInJlZFwiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcIkZhaWxlZCB0byBsb2FkIGdhbWUuIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuXCIsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpIHtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5nYW1lRGF0YS5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW1hZ2UgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgICAgIGltYWdlLnNyYyA9IGltZy5wYXRoO1xyXG4gICAgICAgICAgICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkSW1hZ2VzLnNldChpbWcubmFtZSwgaW1hZ2UpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBpbWFnZS5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHtpbWcucGF0aH1gKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmdhbWVEYXRhLmFzc2V0cy5zb3VuZHMubWFwKHNuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbygpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8uc3JjID0gc25kLnBhdGg7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzbmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ucHJlbG9hZCA9IFwiYXV0b1wiO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxvYWRlZFNvdW5kcy5zZXQoc25kLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c25kLnBhdGh9YCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICB0aGlzLnJlc2V0R2FtZVN0YXRzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICB0aGlzLmFjdGl2ZU5vdGVzID0gW107XHJcbiAgICAgICAgdGhpcy5iZWF0bWFwSW5kZXggPSAwO1xyXG4gICAgICAgIHRoaXMucmVzZXRHYW1lU3RhdHMoKTtcclxuXHJcbiAgICAgICAgdGhpcy5iZ21BdWRpbyA9IHRoaXMubG9hZGVkU291bmRzLmdldChcImJnbVwiKSB8fCBudWxsO1xyXG4gICAgICAgIGlmICh0aGlzLmJnbUF1ZGlvKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLmxvb3AgPSBmYWxzZTsgLy8gQkdNIHNob3VsZCBub3QgbG9vcCBpbiBhIHJoeXRobSBnYW1lLCBpdCBlbmRzLlxyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBsYXkoKS50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtU3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRBdWRpb1RpbWUgPSAwO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJCR00gc3RhcnRlZC5cIik7XHJcbiAgICAgICAgICAgIH0pLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcIkJHTSBhdXRvcGxheSBwcmV2ZW50ZWQ6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtU3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRBdWRpb1RpbWUgPSAwO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBlbmRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICBpZiAodGhpcy5iZ21BdWRpbykge1xyXG4gICAgICAgICAgICB0aGlzLmJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc2V0R2FtZVN0YXRzKCkge1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuY29tYm8gPSAwO1xyXG4gICAgICAgIHRoaXMubWF4Q29tYm8gPSAwO1xyXG4gICAgICAgIHRoaXMudG90YWxIaXRzID0gMDtcclxuICAgICAgICB0aGlzLnBlcmZlY3RIaXRzID0gMDtcclxuICAgICAgICB0aGlzLmdyZWF0SGl0cyA9IDA7XHJcbiAgICAgICAgdGhpcy5nb29kSGl0cyA9IDA7XHJcbiAgICAgICAgdGhpcy5taXNzSGl0cyA9IDA7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lTG9vcCh0aW1lOiBET01IaWdoUmVzVGltZVN0YW1wKSB7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7XHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHRpbWU7XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgdGhpcy5kcmF3KCk7XHJcblxyXG4gICAgICAgIHRoaXMuanVzdFByZXNzZWRLZXlzLmNsZWFyKCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgodCkgPT4gdGhpcy5nYW1lTG9vcCh0KSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgdGhpcy51cGRhdGVUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXlpbmcoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZUdhbWVPdmVyKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICBpZiAodGhpcy5qdXN0UHJlc3NlZEtleXMuc2l6ZSA+IDApIHtcclxuICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5aW5nKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuYmdtQXVkaW8gJiYgIXRoaXMuYmdtQXVkaW8ucGF1c2VkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEF1ZGlvVGltZSA9IHRoaXMuYmdtQXVkaW8uY3VycmVudFRpbWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5jdXJyZW50QXVkaW9UaW1lID0gKHBlcmZvcm1hbmNlLm5vdygpIC0gdGhpcy5iZ21TdGFydFRpbWUpIC8gMTAwMDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNwYXduIG5ldyBub3Rlc1xyXG4gICAgICAgIHdoaWxlICh0aGlzLmJlYXRtYXBJbmRleCA8IHRoaXMuZ2FtZURhdGEuYmVhdG1hcC5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc3QgbmV4dE5vdGVEYXRhID0gdGhpcy5nYW1lRGF0YS5iZWF0bWFwW3RoaXMuYmVhdG1hcEluZGV4XTtcclxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIHdoZW4gdGhlIG5vdGUncyAqdG9wKiBzaG91bGQgYXBwZWFyIGF0IG5vdGVTcGF3bllcclxuICAgICAgICAgICAgY29uc3Qgbm90ZVNwYXduVGltZSA9IG5leHROb3RlRGF0YS50aW1lIC0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MuZmFsbER1cmF0aW9uO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRm9yIGhvbGQgbm90ZXMsIHRoZXkgc2hvdWxkIGFwcGVhciBlYXJsaWVyIHRvIHNob3cgdGhlaXIgZnVsbCBsZW5ndGhcclxuICAgICAgICAgICAgbGV0IGVmZmVjdGl2ZVNwYXduVGltZSA9IG5vdGVTcGF3blRpbWU7XHJcbiAgICAgICAgICAgIGlmIChuZXh0Tm90ZURhdGEudHlwZSA9PT0gTm90ZVR5cGUuSE9MRCAmJiBuZXh0Tm90ZURhdGEuZHVyYXRpb24pIHtcclxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBlbnRpcmUgaG9sZCBub3RlIChsZW5ndGggKyBncmFwaGljKSBzaG91bGQgYmUgdmlzaWJsZSBhcyBpdCBmYWxscy5cclxuICAgICAgICAgICAgICAgIC8vIEZvciBzaW1wbGlmaWVkIHZpc3VhbCwgc3Bhd24gYmFzZWQgb24gYXJyaXZhbFRpbWUsIGFuZCB0aGUgdmlzdWFsIGV4dGVuZHMgJ3Vwd2FyZHMnLlxyXG4gICAgICAgICAgICAgICAgLy8gSWYgaXQgc2hvdWxkIGFwcGVhciBmb3IgdGhlIGZ1bGwgZHVyYXRpb24sIGl0IG5lZWRzIHRvIHNwYXduIGV2ZW4gZWFybGllci5cclxuICAgICAgICAgICAgICAgIC8vIEZvciBjdXJyZW50IHNpbXBsaWZpZWQgbG9naWMsIGp1c3Qgc3Bhd24gYmFzZWQgb24gdGhlIGFycml2YWwgdGltZS5cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudEF1ZGlvVGltZSA+PSBlZmZlY3RpdmVTcGF3blRpbWUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vdGUgPSBuZXcgTm90ZShuZXh0Tm90ZURhdGEubGFuZSwgbmV4dE5vdGVEYXRhLnRpbWUsIHRoaXMsIG5leHROb3RlRGF0YS50eXBlLCBuZXh0Tm90ZURhdGEuZHVyYXRpb24sIG5leHROb3RlRGF0YS5lbmRMYW5lKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYWN0aXZlTm90ZXMucHVzaChub3RlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmVhdG1hcEluZGV4Kys7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGV4aXN0aW5nIG5vdGVzIGFuZCByZW1vdmUgcHJvY2Vzc2VkIG9uZXNcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5hY3RpdmVOb3Rlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICBjb25zdCBub3RlID0gdGhpcy5hY3RpdmVOb3Rlc1tpXTtcclxuICAgICAgICAgICAgbm90ZS51cGRhdGUodGhpcy5jdXJyZW50QXVkaW9UaW1lLCB0aGlzKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBub3RlcyB0aGF0IGhhdmUgYmVlbiBleHBsaWNpdGx5IGhpdCBvciBjb21wbGV0ZWx5IHByb2Nlc3NlZCAobWlzc2VkL3Bhc3NlZCwgaW5jbHVkaW5nIGNvbXBsZXRlZCBob2xkcylcclxuICAgICAgICAgICAgaWYgKG5vdGUuc3RhdGUgPT09IE5vdGVTdGF0ZS5ISVQgfHwgbm90ZS5zdGF0ZSA9PT0gTm90ZVN0YXRlLk1JU1NFRCB8fCBub3RlLnN0YXRlID09PSBOb3RlU3RhdGUuUEFTU0VEKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFjdGl2ZU5vdGVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIHBsYXllciBpbnB1dCAoa2V5IGRvd24gZm9yIFRBUC9TTElERS9IT0xEIHN0YXJ0KVxyXG4gICAgICAgIGNvbnN0IGxhbmVLZXlzID0gdGhpcy5nYW1lRGF0YS5nYW1lU2V0dGluZ3MubGFuZUtleXM7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsYW5lS2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBrZXkgPSBsYW5lS2V5c1tpXTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuanVzdFByZXNzZWRLZXlzLmhhcyhrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhhbmRsZVBsYXllcklucHV0KGksIHRoaXMuY3VycmVudEF1ZGlvVGltZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGlmIHNvbmcgZW5kZWQgYW5kIGFsbCBub3RlcyBwcm9jZXNzZWRcclxuICAgICAgICBjb25zdCBiZ21EdXJhdGlvbiA9IHRoaXMuZ2FtZURhdGEuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSBcImJnbVwiKT8uZHVyYXRpb25fc2Vjb25kcyB8fCAwO1xyXG4gICAgICAgIGlmICgodGhpcy5iZ21BdWRpbyAmJiB0aGlzLmJnbUF1ZGlvLmVuZGVkKSB8fCB0aGlzLmN1cnJlbnRBdWRpb1RpbWUgPiBiZ21EdXJhdGlvbiArIDIpIHsgLy8gQWRkIGJ1ZmZlclxyXG4gICAgICAgICAgICBpZiAodGhpcy5hY3RpdmVOb3Rlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW5kR2FtZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlR2FtZU92ZXIoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuanVzdFByZXNzZWRLZXlzLnNpemUgPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhcnRUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZVBsYXllcklucHV0KGxhbmU6IG51bWJlciwgaW5wdXRUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIGxldCBiZXN0Tm90ZUluZGV4ID0gLTE7XHJcbiAgICAgICAgbGV0IHNtYWxsZXN0RGVsdGEgPSBJbmZpbml0eTtcclxuICAgICAgICBsZXQgdGFyZ2V0Tm90ZTogTm90ZSB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgICAgICAvLyBGaW5kIHRoZSBjbG9zZXN0IGFjdGl2ZSBGQUxMSU5HIG5vdGUgaW4gdGhlIGdpdmVuIGxhbmVcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYWN0aXZlTm90ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3Qgbm90ZSA9IHRoaXMuYWN0aXZlTm90ZXNbaV07XHJcbiAgICAgICAgICAgIC8vIE9ubHkgY29uc2lkZXIgZmFsbGluZyBub3RlcyBmb3IgaW5pdGlhbCBpbnB1dCBkZXRlY3Rpb25cclxuICAgICAgICAgICAgaWYgKG5vdGUubGFuZSA9PT0gbGFuZSAmJiBub3RlLnN0YXRlID09PSBOb3RlU3RhdGUuRkFMTElORykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZGVsdGEgPSBNYXRoLmFicyhpbnB1dFRpbWUgLSBub3RlLmFycml2YWxUaW1lKTtcclxuICAgICAgICAgICAgICAgIGlmIChkZWx0YSA8IHNtYWxsZXN0RGVsdGEpIHtcclxuICAgICAgICAgICAgICAgICAgICBzbWFsbGVzdERlbHRhID0gZGVsdGE7XHJcbiAgICAgICAgICAgICAgICAgICAgYmVzdE5vdGVJbmRleCA9IGk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Tm90ZSA9IG5vdGU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0YXJnZXROb3RlKSB7XHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGp1ZGdtZW50IGJhc2VkIG9uIGhpdCB3aW5kb3dzXHJcbiAgICAgICAgICAgIGlmIChzbWFsbGVzdERlbHRhIDw9IHNldHRpbmdzLmhpdFdpbmRvd1BlcmZlY3QpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlKdWRnbWVudChcInBlcmZlY3RcIiwgdGFyZ2V0Tm90ZSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc21hbGxlc3REZWx0YSA8PSBzZXR0aW5ncy5oaXRXaW5kb3dHcmVhdCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseUp1ZGdtZW50KFwiZ3JlYXRcIiwgdGFyZ2V0Tm90ZSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc21hbGxlc3REZWx0YSA8PSBzZXR0aW5ncy5oaXRXaW5kb3dHb29kKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5SnVkZ21lbnQoXCJnb29kXCIsIHRhcmdldE5vdGUpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gVG9vIGVhcmx5L2xhdGUsIGNvdW50IGFzIGEgbWlzc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5oYW5kbGVNaXNzKHRhcmdldE5vdGUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gTm8gbm90ZSB0byBoaXQsIG9yIG5vdGUgYWxyZWFkeSBwYXNzZWQvbWlzc2VkIG9yIGlzIGEgSE9MRCBub3RlIHRoYXQgZmluaXNoZWQuXHJcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBcInBoYW50b21cIiBoaXQsIHdoaWNoIGNvdW50cyBhcyBhIG1pc3MuXHJcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlTWlzcyhudWxsKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhcHBseUp1ZGdtZW50KHR5cGU6IFwicGVyZmVjdFwiIHwgXCJncmVhdFwiIHwgXCJnb29kXCIsIG5vdGU6IE5vdGUpIHtcclxuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xyXG4gICAgICAgIHRoaXMuY29tYm8rKztcclxuICAgICAgICB0aGlzLm1heENvbWJvID0gTWF0aC5tYXgodGhpcy5tYXhDb21ibywgdGhpcy5jb21ibyk7XHJcbiAgICAgICAgdGhpcy50b3RhbEhpdHMrKztcclxuXHJcbiAgICAgICAgbGV0IHNjb3JlVmFsdWUgPSAwO1xyXG4gICAgICAgIGlmICh0eXBlID09PSBcInBlcmZlY3RcIikge1xyXG4gICAgICAgICAgICBzY29yZVZhbHVlID0gc2V0dGluZ3Muc2NvcmVQZXJQZXJmZWN0O1xyXG4gICAgICAgICAgICB0aGlzLnBlcmZlY3RIaXRzKys7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBcImdyZWF0XCIpIHtcclxuICAgICAgICAgICAgc2NvcmVWYWx1ZSA9IHNldHRpbmdzLnNjb3JlUGVyR3JlYXQ7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JlYXRIaXRzKys7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSBcImdvb2RcIikge1xyXG4gICAgICAgICAgICBzY29yZVZhbHVlID0gc2V0dGluZ3Muc2NvcmVQZXJHb29kO1xyXG4gICAgICAgICAgICB0aGlzLmdvb2RIaXRzKys7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBcHBseSBjb21ibyBtdWx0aXBsaWVyXHJcbiAgICAgICAgbGV0IGN1cnJlbnRNdWx0aXBsaWVyID0gMTtcclxuICAgICAgICBpZiAodGhpcy5jb21ibyA+PSBzZXR0aW5ncy5jb21ib1RocmVzaG9sZCkge1xyXG4gICAgICAgICAgICBjdXJyZW50TXVsdGlwbGllciArPSBNYXRoLmZsb29yKHRoaXMuY29tYm8gLyBzZXR0aW5ncy5jb21ib1RocmVzaG9sZCkgKiBzZXR0aW5ncy5tdWx0aXBsaWVyUGVyQ29tYm87XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc2NvcmUgKz0gc2NvcmVWYWx1ZSAqIGN1cnJlbnRNdWx0aXBsaWVyO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgbm90ZSBzdGF0ZSBiYXNlZCBvbiB0eXBlXHJcbiAgICAgICAgaWYgKG5vdGUudHlwZSA9PT0gTm90ZVR5cGUuSE9MRCkge1xyXG4gICAgICAgICAgICBub3RlLnN0YXRlID0gTm90ZVN0YXRlLkhPTERJTkc7IC8vIE1hcmsgYXMgaG9sZGluZ1xyXG4gICAgICAgICAgICBub3RlLmlzSG9sZGluZyA9IHRydWU7IC8vIEZvciB2aXN1YWwgZmVlZGJhY2tcclxuICAgICAgICAgICAgLy8gRm9yIGEgZnVsbCBpbXBsZW1lbnRhdGlvbiwgeW91J2QgdHJhY2sgaG9sZCBzdGFydCB0aW1lIGFuZCByZXF1aXJlIGEga2V5dXAgYXQgJ2Fycml2YWxUaW1lICsgZHVyYXRpb24nXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgbm90ZS5zdGF0ZSA9IE5vdGVTdGF0ZS5ISVQ7IC8vIEZvciBUQVAgYW5kIFNMSURFLCBpdCdzIGp1c3QgYSBzaW5nbGUgaGl0XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucGxheUVmZmVjdChcImhpdEVmZmVjdFwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgaGFuZGxlTWlzcyhub3RlOiBOb3RlIHwgbnVsbCkge1xyXG4gICAgICAgIHRoaXMuY29tYm8gPSAwOyAvLyBDb21ibyBicmVha3Mgb24gYW55IG1pc3NcclxuICAgICAgICB0aGlzLm1pc3NIaXRzKys7XHJcbiAgICAgICAgdGhpcy50b3RhbEhpdHMrKztcclxuICAgICAgICB0aGlzLnNjb3JlIC09IHRoaXMuZ2FtZURhdGEuZ2FtZVNldHRpbmdzLnNjb3JlUGVuYWx0eVBlck1pc3M7XHJcblxyXG4gICAgICAgIC8vIE1hcmsgdGhlIHNwZWNpZmljIG5vdGUgYXMgbWlzc2VkIGlmIHByb3ZpZGVkXHJcbiAgICAgICAgaWYgKG5vdGUgJiYgKG5vdGUuc3RhdGUgPT09IE5vdGVTdGF0ZS5GQUxMSU5HIHx8IG5vdGUuc3RhdGUgPT09IE5vdGVTdGF0ZS5IT0xESU5HKSkge1xyXG4gICAgICAgICAgICBub3RlLnN0YXRlID0gTm90ZVN0YXRlLk1JU1NFRDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnNjb3JlIDwgMCkge1xyXG4gICAgICAgICAgICB0aGlzLmVuZEdhbWUoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wbGF5RWZmZWN0KFwibWlzc0VmZmVjdFwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlFZmZlY3QobmFtZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSB0aGlzLmxvYWRlZFNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNsb25lID0gYXVkaW8uY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgY2xvbmUudm9sdW1lID0gYXVkaW8udm9sdW1lO1xyXG4gICAgICAgICAgICBjbG9uZS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYFNvdW5kIGVmZmVjdCBwbGF5YmFjayBibG9ja2VkOiAke25hbWV9YCwgZSkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXcoKSB7XHJcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIHRoaXMuZHJhd0JhY2tncm91bmQoKTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd1BsYXlpbmcoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdHYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd0JhY2tncm91bmQoKSB7XHJcbiAgICAgICAgY29uc3QgYmFja2dyb3VuZEltYWdlID0gdGhpcy5sb2FkZWRJbWFnZXMuZ2V0KFwiYmFja2dyb3VuZFwiKTtcclxuICAgICAgICBpZiAoYmFja2dyb3VuZEltYWdlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmRyYXdJbWFnZShiYWNrZ3JvdW5kSW1hZ2UsIDAsIDAsIHRoaXMuY2FudmFzLndpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiIzFhMWExYVwiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdCgwLCAwLCB0aGlzLmNhbnZhcy53aWR0aCwgdGhpcy5jYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcImJvbGQgNDhweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJSaHl0aG0gR2FtZVwiLCB0aGlzLmNhbnZhcy53aWR0aCAvIDIsIHRoaXMuY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3R4LmZvbnQgPSBcIjI0cHggQXJpYWxcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcIlByZXNzIEFueSBLZXkgdG8gU3RhcnRcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMjApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZHJhd1BsYXlpbmcoKSB7XHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSB0aGlzLmdhbWVEYXRhLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBjb25zdCBub3RlSW1hZ2UgPSB0aGlzLmxvYWRlZEltYWdlcy5nZXQoXCJub3RlXCIpO1xyXG4gICAgICAgIGNvbnN0IGhpdFpvbmVJbWFnZSA9IHRoaXMubG9hZGVkSW1hZ2VzLmdldChcImhpdFpvbmVcIik7XHJcblxyXG4gICAgICAgIGNvbnN0IHRvdGFsTGFuZXNXaWR0aCA9IHNldHRpbmdzLmxhbmVDb3VudCAqIHNldHRpbmdzLmxhbmVXaWR0aCArIChzZXR0aW5ncy5sYW5lQ291bnQgLSAxKSAqIHNldHRpbmdzLmxhbmVTcGFjaW5nO1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0WCA9IChzZXR0aW5ncy5jYW52YXNXaWR0aCAtIHRvdGFsTGFuZXNXaWR0aCkgLyAyO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNldHRpbmdzLmxhbmVDb3VudDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGxhbmVYID0gc3RhcnRYICsgaSAqIChzZXR0aW5ncy5sYW5lV2lkdGggKyBzZXR0aW5ncy5sYW5lU3BhY2luZyk7XHJcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IFwiIzMzMzMzM1wiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChsYW5lWCwgMCwgc2V0dGluZ3MubGFuZVdpZHRoLCB0aGlzLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMilcIjtcclxuICAgICAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMjBweCBBcmlhbFwiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChzZXR0aW5ncy5sYW5lS2V5c1tpXS50b1VwcGVyQ2FzZSgpLCBsYW5lWCArIHNldHRpbmdzLmxhbmVXaWR0aCAvIDIsIHNldHRpbmdzLmhpdFpvbmVZICsgNTApO1xyXG5cclxuICAgICAgICAgICAgaWYgKGhpdFpvbmVJbWFnZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd0ltYWdlKGhpdFpvbmVJbWFnZSwgbGFuZVgsIHNldHRpbmdzLmhpdFpvbmVZIC0gaGl0Wm9uZUltYWdlLmhlaWdodCAvIDIsIHNldHRpbmdzLmxhbmVXaWR0aCwgaGl0Wm9uZUltYWdlLmhlaWdodCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIiMwMGZmZmZcIjtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGxhbmVYLCBzZXR0aW5ncy5oaXRab25lWSwgc2V0dGluZ3MubGFuZVdpZHRoLCA1KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKHRoaXMucHJlc3NlZEtleXMuaGFzKHNldHRpbmdzLmxhbmVLZXlzW2ldKSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gXCJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMylcIjtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGxhbmVYLCBzZXR0aW5ncy5oaXRab25lWSAtIDIwLCBzZXR0aW5ncy5sYW5lV2lkdGgsIDQwKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5hY3RpdmVOb3Rlcy5mb3JFYWNoKG5vdGUgPT4ge1xyXG4gICAgICAgICAgICBub3RlLmRyYXcodGhpcy5jdHgsIG5vdGVJbWFnZSEsIHRoaXMpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMzBweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LnRleHRBbGlnbiA9IFwibGVmdFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBTY29yZTogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmUpfWAsIDIwLCA0MCk7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJyaWdodFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBDb21ibzogJHt0aGlzLmNvbWJvfWAsIHRoaXMuY2FudmFzLndpZHRoIC0gMjAsIDQwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGRyYXdHYW1lT3ZlcigpIHtcclxuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSBcIndoaXRlXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiYm9sZCA0OHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChcIkdhbWUgT3ZlciFcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyIC0gMTAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jdHguZm9udCA9IFwiMzBweCBBcmlhbFwiO1xyXG4gICAgICAgIHRoaXMuY3R4LmZpbGxUZXh0KGBGaW5hbCBTY29yZTogJHtNYXRoLmZsb29yKHRoaXMuc2NvcmUpfWAsIHRoaXMuY2FudmFzLndpZHRoIC8gMiwgdGhpcy5jYW52YXMuaGVpZ2h0IC8gMiAtIDIwKTtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgTWF4IENvbWJvOiAke3RoaXMubWF4Q29tYm99YCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMzApO1xyXG5cclxuICAgICAgICBjb25zdCB0b3RhbE5vdGVzSGl0ID0gdGhpcy5wZXJmZWN0SGl0cyArIHRoaXMuZ3JlYXRIaXRzICsgdGhpcy5nb29kSGl0cztcclxuICAgICAgICBjb25zdCBhY2N1cmFjeSA9IHRoaXMudG90YWxIaXRzID4gMCA/ICh0b3RhbE5vdGVzSGl0IC8gdGhpcy50b3RhbEhpdHMpICogMTAwIDogMDtcclxuICAgICAgICB0aGlzLmN0eC5maWxsVGV4dChgQWNjdXJhY3k6ICR7YWNjdXJhY3kudG9GaXhlZCgyKX0lYCwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgODApO1xyXG5cclxuICAgICAgICB0aGlzLmN0eC5mb250ID0gXCIyNHB4IEFyaWFsXCI7XHJcbiAgICAgICAgdGhpcy5jdHguZmlsbFRleHQoXCJQcmVzcyBBbnkgS2V5IHRvIFJlc3RhcnRcIiwgdGhpcy5jYW52YXMud2lkdGggLyAyLCB0aGlzLmNhbnZhcy5oZWlnaHQgLyAyICsgMTUwKTtcclxuICAgIH1cclxufVxyXG5cclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihcIkRPTUNvbnRlbnRMb2FkZWRcIiwgKCkgPT4ge1xyXG4gICAgY29uc3QgZ2FtZSA9IG5ldyBHYW1lKFwiZ2FtZUNhbnZhc1wiKTtcclxuICAgIGdhbWUuaW5pdCgpO1xyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFnQkEsSUFBSyxXQUFMLGtCQUFLQSxjQUFMO0FBQ0ksRUFBQUEsVUFBQSxTQUFNO0FBQ04sRUFBQUEsVUFBQSxVQUFPO0FBQ1AsRUFBQUEsVUFBQSxXQUFRO0FBSFAsU0FBQUE7QUFBQSxHQUFBO0FBa0RMLElBQUssWUFBTCxrQkFBS0MsZUFBTDtBQUNJLEVBQUFBLFdBQUEsV0FBUTtBQUNSLEVBQUFBLFdBQUEsYUFBVTtBQUNWLEVBQUFBLFdBQUEsZUFBWTtBQUhYLFNBQUFBO0FBQUEsR0FBQTtBQU1MLElBQUssWUFBTCxrQkFBS0MsZUFBTDtBQUNJLEVBQUFBLFdBQUEs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
