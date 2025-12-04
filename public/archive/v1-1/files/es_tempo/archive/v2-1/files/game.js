var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2["LOADING"] = "LOADING";
  GameState2["TITLE"] = "TITLE";
  GameState2["GAMEPLAY"] = "GAMEPLAY";
  GameState2["GAME_OVER"] = "GAME_OVER";
  return GameState2;
})(GameState || {});
let canvas;
let ctx;
let audioContext;
let gameData;
const assetCache = {
  images: /* @__PURE__ */ new Map(),
  sounds: /* @__PURE__ */ new Map()
};
let currentState = "LOADING" /* LOADING */;
let lastUpdateTime = 0;
let animationFrameId = null;
let currentSong = null;
let currentBGM = null;
let currentSongTimeOffset = 0;
let gameElapsedTime = 0;
let score = 0;
let combo = 0;
let maxCombo = 0;
let health = 0;
let activeNotes = [];
let noteSpawnQueue = [];
let hitEffects = [];
let judgeTexts = [];
let backgroundScrollY = 0;
class Note {
  // Flag to prevent multiple hits/misses
  constructor(lane, spawnTime, image, defaultNoteHeight) {
    // Song time in seconds when this note should be hit
    this.hit = false;
    this.lane = lane;
    this.spawnTime = spawnTime;
    this.image = image;
    const laneConfig = gameData.gameConfig;
    this.width = laneConfig.laneWidth;
    this.height = defaultNoteHeight;
    this.x = laneConfig.laneStartX + lane * (laneConfig.laneWidth + laneConfig.laneSpacing);
    this.y = 0;
  }
  update(deltaTime, gameElapsedTimeMs) {
    const laneConfig = gameData.gameConfig;
    const perfectHitGameTimeMs = this.spawnTime * 1e3 + laneConfig.perfectHitOffsetMs;
    const timeRemainingForPerfectHit = perfectHitGameTimeMs - gameElapsedTimeMs;
    const distanceAboveHitLine = timeRemainingForPerfectHit * laneConfig.noteFallSpeedPxPerMs;
    this.y = laneConfig.hitLineY - distanceAboveHitLine - this.height;
  }
  render(ctx2) {
    ctx2.drawImage(this.image, this.x, this.y, this.width, this.height);
  }
}
class HitEffect {
  constructor(x, y, image, durationMs, width, height) {
    this.image = image;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.lifeTime = 0;
    this.maxLifeTime = durationMs;
  }
  update(deltaTime) {
    this.lifeTime += deltaTime;
    return this.lifeTime >= this.maxLifeTime;
  }
  render(ctx2) {
    const alpha = 1 - this.lifeTime / this.maxLifeTime;
    ctx2.save();
    ctx2.globalAlpha = alpha;
    ctx2.drawImage(this.image, this.x, this.y, this.width, this.height);
    ctx2.restore();
  }
}
class JudgeText {
  constructor(text, color, x, y, durationMs) {
    this.text = text;
    this.color = color;
    this.x = x;
    this.y = y;
    this.initialY = y;
    this.lifeTime = 0;
    this.maxLifeTime = durationMs;
  }
  update(deltaTime) {
    this.lifeTime += deltaTime;
    this.y = this.initialY - this.lifeTime / this.maxLifeTime * 20;
    return this.lifeTime >= this.maxLifeTime;
  }
  render(ctx2) {
    const alpha = 1 - this.lifeTime / this.maxLifeTime;
    ctx2.save();
    ctx2.globalAlpha = alpha;
    ctx2.font = gameData.gameplayUI.judgeTextFont;
    ctx2.fillStyle = this.color;
    ctx2.textAlign = "center";
    ctx2.fillText(this.text, this.x, this.y);
    ctx2.restore();
  }
}
async function initGame() {
  canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("Canvas element with ID 'gameCanvas' not found.");
    return;
  }
  ctx = canvas.getContext("2d");
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  try {
    await loadGameData();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    await loadAssets();
    transitionToState("TITLE" /* TITLE */);
    addInputListeners();
    gameLoop(0);
  } catch (error) {
    console.error("Failed to initialize game:", error);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "red";
    ctx.font = "30px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Error: " + error.message, canvas.width / 2, canvas.height / 2);
  }
}
function resizeCanvas() {
  if (!gameData) return;
  canvas.width = gameData.gameConfig.canvasWidth;
  canvas.height = gameData.gameConfig.canvasHeight;
}
async function loadGameData() {
  const response = await fetch("data.json");
  if (!response.ok) {
    throw new Error(`Failed to load data.json: ${response.statusText}`);
  }
  gameData = await response.json();
  console.log("Game data loaded:", gameData);
}
async function loadAssets() {
  const imagePromises = gameData.assets.images.map((img) => {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.src = img.path;
      image.onload = () => {
        assetCache.images.set(img.name, image);
        resolve();
      };
      image.onerror = () => {
        console.warn(`Failed to load image: ${img.path}`);
        assetCache.images.set(img.name, new Image());
        resolve();
      };
    });
  });
  const soundPromises = gameData.assets.sounds.map((sound) => {
    return fetch(sound.path).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.arrayBuffer();
    }).then((arrayBuffer) => audioContext.decodeAudioData(arrayBuffer)).then((audioBuffer) => {
      assetCache.sounds.set(sound.name, audioBuffer);
    }).catch((error) => {
      console.warn(`Failed to load sound: ${sound.path}`, error);
      assetCache.sounds.set(sound.name, audioContext.createBuffer(1, 1, 44100));
    });
  });
  await Promise.all([...imagePromises, ...soundPromises]);
  console.log("All assets loaded.");
}
function transitionToState(newState) {
  console.log(`Transitioning from ${currentState} to ${newState}`);
  currentState = newState;
  switch (newState) {
    case "TITLE" /* TITLE */:
      if (currentBGM) {
        currentBGM.stop();
        currentBGM = null;
      }
      break;
    case "GAMEPLAY" /* GAMEPLAY */:
      startGameplay();
      break;
    case "GAME_OVER" /* GAME_OVER */:
      if (currentBGM) {
        currentBGM.stop();
        currentBGM = null;
      }
      break;
  }
}
function startGameplay() {
  if (!gameData.songs || gameData.songs.length === 0) {
    console.error("No songs defined in data.json!");
    transitionToState("TITLE" /* TITLE */);
    return;
  }
  currentSong = gameData.songs[0];
  score = 0;
  combo = 0;
  maxCombo = 0;
  health = gameData.gameConfig.initialHealth;
  gameElapsedTime = 0;
  activeNotes = [];
  hitEffects = [];
  judgeTexts = [];
  backgroundScrollY = 0;
  noteSpawnQueue = [...currentSong.notes].sort((a, b) => a.time - b.time);
  const bgmBuffer = assetCache.sounds.get(currentSong.bgmAssetName);
  if (bgmBuffer) {
    const soundInfo = gameData.assets.sounds.find((s) => s.name === currentSong.bgmAssetName);
    playBGM(bgmBuffer, soundInfo?.volume || 1, false);
    if (currentBGM) {
      currentBGM.onended = () => {
        console.log("Song ended.");
        if (currentState === "GAMEPLAY" /* GAMEPLAY */) {
          transitionToState("GAME_OVER" /* GAME_OVER */);
        }
      };
    }
  } else {
    console.warn(`BGM asset ${currentSong.bgmAssetName} not found.`);
  }
  currentSongTimeOffset = audioContext.currentTime;
}
function playBGM(buffer, volume, loop = false) {
  if (currentBGM) {
    currentBGM.stop();
    currentBGM = null;
  }
  currentBGM = audioContext.createBufferSource();
  currentBGM.buffer = buffer;
  const gainNode = audioContext.createGain();
  gainNode.gain.value = volume;
  currentBGM.connect(gainNode);
  gainNode.connect(audioContext.destination);
  currentBGM.loop = loop;
  currentBGM.start(0);
}
function playEffect(assetName) {
  const effectBuffer = assetCache.sounds.get(assetName);
  if (effectBuffer) {
    const source = audioContext.createBufferSource();
    source.buffer = effectBuffer;
    const soundData = gameData.assets.sounds.find((s) => s.name === assetName);
    const volume = soundData ? soundData.volume : 1;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
  } else {
    console.warn(`Effect asset ${assetName} not found.`);
  }
}
function gameLoop(timestamp) {
  if (!lastUpdateTime) {
    lastUpdateTime = timestamp;
  }
  const deltaTime = timestamp - lastUpdateTime;
  lastUpdateTime = timestamp;
  update(deltaTime);
  render();
  animationFrameId = requestAnimationFrame(gameLoop);
}
function update(deltaTime) {
  switch (currentState) {
    case "LOADING" /* LOADING */:
      break;
    case "TITLE" /* TITLE */:
      break;
    case "GAMEPLAY" /* GAMEPLAY */:
      updateGameplay(deltaTime);
      break;
    case "GAME_OVER" /* GAME_OVER */:
      break;
  }
}
function updateGameplay(deltaTime) {
  if (!currentSong || !gameData) return;
  gameElapsedTime += deltaTime;
  const config = gameData.gameConfig;
  const songTimeSeconds = gameElapsedTime / 1e3;
  const timeToFallFromTopToHitLineMs = canvas.height / config.noteFallSpeedPxPerMs;
  const earliestSpawnTimeForVisibleNote = songTimeSeconds - timeToFallFromTopToHitLineMs / 1e3;
  while (noteSpawnQueue.length > 0 && noteSpawnQueue[0].time <= earliestSpawnTimeForVisibleNote + 0.1) {
    const noteData = noteSpawnQueue.shift();
    const noteType = gameData.noteTypes[noteData.type];
    if (!noteType) {
      console.warn(`Note type ${noteData.type} not found in noteTypes.`);
      continue;
    }
    const noteImage = assetCache.images.get(noteType.imageAssetName);
    if (noteImage) {
      activeNotes.push(new Note(noteData.lane, noteData.time, noteImage, config.defaultNoteHeight));
    } else {
      console.warn(`Note image for asset ${noteType.imageAssetName} not found.`);
    }
  }
  for (let i = activeNotes.length - 1; i >= 0; i--) {
    const note = activeNotes[i];
    if (note.hit) continue;
    note.update(deltaTime, gameElapsedTime);
    const perfectHitGameTimeMs = note.spawnTime * 1e3 + config.perfectHitOffsetMs;
    const timeDiffFromPerfectMs = gameElapsedTime - perfectHitGameTimeMs;
    const missSetting = gameData.judgeSettings.find((j) => j.judgment === "Miss");
    const missWindowEnd = missSetting ? missSetting.timeWindowMs : Infinity;
    if (timeDiffFromPerfectMs > missWindowEnd && !note.hit) {
      processHit(note, timeDiffFromPerfectMs, true);
      activeNotes.splice(i, 1);
    }
  }
  activeNotes = activeNotes.filter((note) => !note.hit);
  for (let i = hitEffects.length - 1; i >= 0; i--) {
    if (hitEffects[i].update(deltaTime)) {
      hitEffects.splice(i, 1);
    }
  }
  for (let i = judgeTexts.length - 1; i >= 0; i--) {
    if (judgeTexts[i].update(deltaTime)) {
      judgeTexts.splice(i, 1);
    }
  }
  const bgImage = assetCache.images.get(gameData.titleScreen.backgroundImageName);
  if (bgImage) {
    backgroundScrollY = (backgroundScrollY + config.backgroundScrollSpeedY * deltaTime) % bgImage.height;
  }
  if (health <= 0) {
    transitionToState("GAME_OVER" /* GAME_OVER */);
  } else if (!currentBGM && currentSong && noteSpawnQueue.length === 0 && activeNotes.length === 0 && gameElapsedTime / 1e3 > (currentSong.notes[currentSong.notes.length - 1]?.time || 0) + 3) {
    transitionToState("GAME_OVER" /* GAME_OVER */);
  }
}
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  switch (currentState) {
    case "LOADING" /* LOADING */:
      drawLoadingScreen();
      break;
    case "TITLE" /* TITLE */:
      drawTitleScreen();
      break;
    case "GAMEPLAY" /* GAMEPLAY */:
      drawGameplay();
      break;
    case "GAME_OVER" /* GAME_OVER */:
      drawGameOverScreen();
      break;
  }
}
function drawLoadingScreen() {
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "30px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("Loading Assets...", canvas.width / 2, canvas.height / 2);
}
function drawTitleScreen() {
  const titleConfig = gameData.titleScreen;
  const background = assetCache.images.get(titleConfig.backgroundImageName);
  if (background) {
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.font = titleConfig.titleFont;
  ctx.fillStyle = titleConfig.titleColor;
  ctx.textAlign = "center";
  ctx.fillText(titleConfig.titleText, canvas.width / 2, canvas.height / 2 - 50);
  ctx.font = titleConfig.startFont;
  ctx.fillStyle = titleConfig.startColor;
  ctx.fillText(titleConfig.startButtonText, canvas.width / 2, canvas.height / 2 + 50);
}
function drawGameplay() {
  const config = gameData.gameConfig;
  const bgImage = assetCache.images.get(gameData.titleScreen.backgroundImageName);
  if (bgImage) {
    const imgHeight = bgImage.height;
    let currentY = backgroundScrollY;
    while (currentY < canvas.height) {
      ctx.drawImage(bgImage, 0, currentY, canvas.width, imgHeight);
      currentY += imgHeight;
    }
    currentY = backgroundScrollY - imgHeight;
    while (currentY < canvas.height) {
      ctx.drawImage(bgImage, 0, currentY, canvas.width, imgHeight);
      currentY += imgHeight;
    }
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (let i = 0; i < config.laneCount; i++) {
    const laneX = config.laneStartX + i * (config.laneWidth + config.laneSpacing);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(laneX, 0, config.laneWidth, canvas.height);
  }
  for (const note of activeNotes) {
    note.render(ctx);
  }
  for (const effect of hitEffects) {
    effect.render(ctx);
  }
  ctx.strokeStyle = "rgba(255, 255, 0, 0.8)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, config.hitLineY);
  ctx.lineTo(canvas.width, config.hitLineY);
  ctx.stroke();
  for (const text of judgeTexts) {
    text.render(ctx);
  }
  ctx.fillStyle = "white";
  ctx.textAlign = "left";
  ctx.font = gameData.gameplayUI.scoreFont;
  ctx.fillText(`Score: ${score}`, 20, 40);
  ctx.textAlign = "center";
  ctx.font = gameData.gameplayUI.comboFont;
  if (combo > 0) {
    ctx.fillText(`Combo: ${combo}`, canvas.width / 2, 80);
  }
  const healthBarWidth = 200;
  const healthBarHeight = 20;
  const healthBarX = canvas.width - healthBarWidth - 20;
  const healthBarY = 20;
  ctx.fillStyle = "gray";
  ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
  ctx.fillStyle = gameData.gameplayUI.healthBarColor;
  const currentHealthWidth = health / gameData.gameConfig.maxHealth * healthBarWidth;
  ctx.fillRect(healthBarX, healthBarY, Math.max(0, currentHealthWidth), healthBarHeight);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;
  ctx.strokeRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
}
function drawGameOverScreen() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "60px Arial";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 100);
  ctx.font = "30px Arial";
  ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height / 2);
  ctx.fillText(`Max Combo: ${maxCombo}`, canvas.width / 2, canvas.height / 2 + 50);
  ctx.fillText("Press R to Restart or Esc for Title", canvas.width / 2, canvas.height / 2 + 150);
}
function addInputListeners() {
  window.addEventListener("keydown", handleKeyDown);
}
function handleKeyDown(event) {
  if (event.repeat) return;
  switch (currentState) {
    case "TITLE" /* TITLE */:
      transitionToState("GAMEPLAY" /* GAMEPLAY */);
      break;
    case "GAMEPLAY" /* GAMEPLAY */:
      handleGameplayInput(event.key);
      break;
    case "GAME_OVER" /* GAME_OVER */:
      if (event.key.toLowerCase() === "r") {
        transitionToState("GAMEPLAY" /* GAMEPLAY */);
      } else if (event.key === "Escape") {
        transitionToState("TITLE" /* TITLE */);
      }
      break;
  }
}
function handleGameplayInput(key) {
  const config = gameData.gameConfig;
  const laneIndex = config.laneKeys[key.toLowerCase()];
  if (laneIndex === void 0) {
    return;
  }
  let hitNote = null;
  let closestTimeDiffAbsolute = Infinity;
  let perfectHitGameTimeMs = 0;
  const missSetting = gameData.judgeSettings.find((j) => j.judgment === "Miss");
  const maxJudgeWindow = missSetting ? missSetting.timeWindowMs : 0;
  for (const note of activeNotes) {
    if (note.lane === laneIndex && !note.hit) {
      const notePerfectHitGameTimeMs = note.spawnTime * 1e3 + config.perfectHitOffsetMs;
      const timeDiff = gameElapsedTime - notePerfectHitGameTimeMs;
      const absoluteTimeDiff = Math.abs(timeDiff);
      if (absoluteTimeDiff <= maxJudgeWindow && absoluteTimeDiff < closestTimeDiffAbsolute) {
        closestTimeDiffAbsolute = absoluteTimeDiff;
        hitNote = note;
        perfectHitGameTimeMs = notePerfectHitGameTimeMs;
      }
    }
  }
  if (hitNote) {
    processHit(hitNote, gameElapsedTime - perfectHitGameTimeMs, false);
    hitNote.hit = true;
  } else {
    const missPenalty = gameData.judgeSettings.find((j) => j.judgment === "Miss")?.healthChange || -10;
    health += missPenalty;
    health = Math.max(0, health);
    combo = 0;
    playEffect("miss_effect");
    const laneX = config.laneStartX + laneIndex * (config.laneWidth + config.laneSpacing);
    judgeTexts.push(new JudgeText("Bad Press", "grey", laneX + config.laneWidth / 2, config.hitLineY - 50, gameData.gameConfig.judgeTextDurationMs));
  }
}
function processHit(note, timeDifference, isAutoMiss) {
  const config = gameData.gameConfig;
  let judgment;
  let absoluteTimeDiff = Math.abs(timeDifference);
  const sortedJudgeSettings = [...gameData.judgeSettings].sort((a, b) => a.timeWindowMs - b.timeWindowMs);
  for (const setting of sortedJudgeSettings) {
    if (absoluteTimeDiff <= setting.timeWindowMs) {
      judgment = setting;
      break;
    }
  }
  if (isAutoMiss) {
    judgment = gameData.judgeSettings.find((j) => j.judgment === "Miss");
    if (!judgment) {
      judgment = { judgment: "Miss", color: "red", timeWindowMs: Infinity, scoreMultiplier: 0, healthChange: -20 };
    }
  }
  if (judgment) {
    score += Math.floor(judgment.scoreMultiplier * (1 + combo / 10));
    if (judgment.judgment === "Miss" || isAutoMiss) {
      combo = 0;
      playEffect("miss_effect");
    } else {
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      playEffect("hit_effect");
    }
    health += judgment.healthChange;
    health = Math.max(0, Math.min(health, config.maxHealth));
    const laneX = config.laneStartX + note.lane * (config.laneWidth + config.laneSpacing);
    judgeTexts.push(new JudgeText(judgment.judgment, judgment.color, laneX + config.laneWidth / 2, config.hitLineY - 50, config.judgeTextDurationMs));
    const hitEffectImage = assetCache.images.get("hit_effect");
    if (hitEffectImage) {
      hitEffects.push(new HitEffect(
        laneX + (config.laneWidth - note.width) / 2,
        // Centered horizontally
        config.hitLineY - note.height / 2,
        // Centered vertically on the hit line
        hitEffectImage,
        config.hitEffectDurationMs,
        note.width,
        note.height
      ));
    }
  } else {
    console.warn("No judgment found for time difference:", timeDifference, " (This should not happen)");
    health -= 10;
    combo = 0;
    health = Math.max(0, health);
    playEffect("miss_effect");
  }
}
document.addEventListener("DOMContentLoaded", initGame);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gZ2FtZS50c1xyXG5cclxuLy8gLS0tIEludGVyZmFjZXMgZm9yIGRhdGEuanNvbiBzdHJ1Y3R1cmUgLS0tXHJcbmludGVyZmFjZSBJQXNzZXREYXRhIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIElJbWFnZURhdGEgZXh0ZW5kcyBJQXNzZXREYXRhIHtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIElTb3VuZERhdGEgZXh0ZW5kcyBJQXNzZXREYXRhIHtcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSUp1ZGdlVGV4dFNldHRpbmcge1xyXG4gICAganVkZ21lbnQ6IHN0cmluZztcclxuICAgIGNvbG9yOiBzdHJpbmc7XHJcbiAgICB0aW1lV2luZG93TXM6IG51bWJlcjsgLy8gTWlsbGlzZWNvbmRzIGZyb20gcGVyZmVjdCBoaXRcclxuICAgIHNjb3JlTXVsdGlwbGllcjogbnVtYmVyO1xyXG4gICAgaGVhbHRoQ2hhbmdlOiBudW1iZXI7IC8vIFBvc2l0aXZlIGZvciBoaXQsIG5lZ2F0aXZlIGZvciBtaXNzXHJcbn1cclxuXHJcbmludGVyZmFjZSBJR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoaXRMaW5lWTogbnVtYmVyOyAvLyBZLWNvb3JkaW5hdGUgd2hlcmUgbm90ZXMgYXJlIGhpdCAoYm90dG9tIG9mIHRoZSBub3RlKVxyXG4gICAgbm90ZUZhbGxTcGVlZFB4UGVyTXM6IG51bWJlcjsgLy8gUGl4ZWxzIHBlciBtaWxsaXNlY29uZFxyXG4gICAgbGFuZUNvdW50OiBudW1iZXI7XHJcbiAgICBsYW5lV2lkdGg6IG51bWJlcjtcclxuICAgIGxhbmVTcGFjaW5nOiBudW1iZXI7IC8vIEdhcCBiZXR3ZWVuIGxhbmVzXHJcbiAgICBsYW5lU3RhcnRYOiBudW1iZXI7IC8vIFggcG9zaXRpb24gb2YgdGhlIGZpcnN0IGxhbmVcclxuICAgIGxhbmVLZXlzOiB7IFtrZXk6IHN0cmluZ106IG51bWJlciB9OyAvLyBNYXBzIGtleSBuYW1lIHRvIGxhbmUgaW5kZXhcclxuICAgIGRlZmF1bHROb3RlSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoaXRFZmZlY3REdXJhdGlvbk1zOiBudW1iZXI7XHJcbiAgICBqdWRnZVRleHREdXJhdGlvbk1zOiBudW1iZXI7XHJcbiAgICBpbml0aWFsSGVhbHRoOiBudW1iZXI7XHJcbiAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgIGJhY2tncm91bmRTY3JvbGxTcGVlZFk6IG51bWJlcjtcclxuICAgIHBlcmZlY3RIaXRPZmZzZXRNczogbnVtYmVyOyAvLyBPZmZzZXQgZm9yIHBlcmZlY3QgaGl0OiBwb3NpdGl2ZSBtZWFucyBoaXQgc2xpZ2h0bHkgQUZURVIgbm90ZSBhbGlnbnMgYXQgaGl0TGluZVlcclxufVxyXG5cclxuaW50ZXJmYWNlIElUaXRsZVNjcmVlbkNvbmZpZyB7XHJcbiAgICB0aXRsZVRleHQ6IHN0cmluZztcclxuICAgIHN0YXJ0QnV0dG9uVGV4dDogc3RyaW5nO1xyXG4gICAgdGl0bGVGb250OiBzdHJpbmc7XHJcbiAgICBzdGFydEZvbnQ6IHN0cmluZztcclxuICAgIHRpdGxlQ29sb3I6IHN0cmluZztcclxuICAgIHN0YXJ0Q29sb3I6IHN0cmluZztcclxuICAgIGJhY2tncm91bmRJbWFnZU5hbWU6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIElHYW1lcGxheVVJQ29uZmlnIHtcclxuICAgIHNjb3JlRm9udDogc3RyaW5nO1xyXG4gICAgY29tYm9Gb250OiBzdHJpbmc7XHJcbiAgICBoZWFsdGhCYXJDb2xvcjogc3RyaW5nO1xyXG4gICAganVkZ2VUZXh0Rm9udDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSU5vdGVTcGF3bkRhdGEge1xyXG4gICAgdGltZTogbnVtYmVyOyAvLyBUaW1lIGluIHNlY29uZHMgZnJvbSBzb25nIHN0YXJ0IHdoZW4gbm90ZSBzaG91bGQgYmUgaGl0XHJcbiAgICBsYW5lOiBudW1iZXI7IC8vIExhbmUgaW5kZXhcclxuICAgIHR5cGU6IHN0cmluZzsgLy8gZS5nLiwgXCJub3JtYWxcIlxyXG59XHJcblxyXG5pbnRlcmZhY2UgSVNvbmdEYXRhIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGFydGlzdDogc3RyaW5nO1xyXG4gICAgYmdtQXNzZXROYW1lOiBzdHJpbmc7XHJcbiAgICBicG06IG51bWJlcjsgLy8gQmVhdHMgcGVyIG1pbnV0ZVxyXG4gICAgbm90ZXM6IElOb3RlU3Bhd25EYXRhW107XHJcbn1cclxuXHJcbmludGVyZmFjZSBJR2FtZURhdGEge1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJSW1hZ2VEYXRhW107XHJcbiAgICAgICAgc291bmRzOiBJU291bmREYXRhW107XHJcbiAgICB9O1xyXG4gICAgZ2FtZUNvbmZpZzogSUdhbWVDb25maWc7XHJcbiAgICB0aXRsZVNjcmVlbjogSVRpdGxlU2NyZWVuQ29uZmlnO1xyXG4gICAgZ2FtZXBsYXlVSTogSUdhbWVwbGF5VUlDb25maWc7XHJcbiAgICBqdWRnZVNldHRpbmdzOiBJSnVkZ2VUZXh0U2V0dGluZ1tdO1xyXG4gICAgbm90ZVR5cGVzOiB7IFtrZXk6IHN0cmluZ106IHsgaW1hZ2VBc3NldE5hbWU6IHN0cmluZyB9IH07IC8vIGUuZy4sIFwibm9ybWFsXCI6IHsgaW1hZ2VBc3NldE5hbWU6IFwibm90ZV9ibHVlXCIgfVxyXG4gICAgc29uZ3M6IElTb25nRGF0YVtdO1xyXG59XHJcblxyXG4vLyAtLS0gRW51bXMgLS0tXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcgPSBcIkxPQURJTkdcIixcclxuICAgIFRJVExFID0gXCJUSVRMRVwiLFxyXG4gICAgR0FNRVBMQVkgPSBcIkdBTUVQTEFZXCIsXHJcbiAgICBHQU1FX09WRVIgPSBcIkdBTUVfT1ZFUlwiLFxyXG59XHJcblxyXG4vLyAtLS0gR2xvYmFsIEdhbWUgVmFyaWFibGVzIC0tLVxyXG5sZXQgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxubGV0IGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG5sZXQgYXVkaW9Db250ZXh0OiBBdWRpb0NvbnRleHQ7XHJcblxyXG5sZXQgZ2FtZURhdGE6IElHYW1lRGF0YTtcclxuY29uc3QgYXNzZXRDYWNoZSA9IHtcclxuICAgIGltYWdlczogbmV3IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+KCksXHJcbiAgICBzb3VuZHM6IG5ldyBNYXA8c3RyaW5nLCBBdWRpb0J1ZmZlcj4oKSxcclxufTtcclxuXHJcbmxldCBjdXJyZW50U3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG5sZXQgbGFzdFVwZGF0ZVRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5sZXQgYW5pbWF0aW9uRnJhbWVJZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XHJcblxyXG4vLyBHYW1lcGxheSBzcGVjaWZpYyB2YXJpYWJsZXNcclxubGV0IGN1cnJlbnRTb25nOiBJU29uZ0RhdGEgfCBudWxsID0gbnVsbDtcclxubGV0IGN1cnJlbnRCR006IEF1ZGlvQnVmZmVyU291cmNlTm9kZSB8IG51bGwgPSBudWxsO1xyXG5sZXQgY3VycmVudFNvbmdUaW1lT2Zmc2V0OiBudW1iZXIgPSAwOyAvLyBBdWRpb0NvbnRleHQuY3VycmVudFRpbWUgd2hlbiBzb25nIHN0YXJ0ZWQgcGxheWluZ1xyXG5sZXQgZ2FtZUVsYXBzZWRUaW1lOiBudW1iZXIgPSAwOyAvLyBFbGFwc2VkIHRpbWUgc2luY2UgZ2FtZXBsYXkgc3RhcnRlZCAoaW4gbXMpLCB1c2VkIGZvciBsb2dpY1xyXG5sZXQgc2NvcmU6IG51bWJlciA9IDA7XHJcbmxldCBjb21ibzogbnVtYmVyID0gMDtcclxubGV0IG1heENvbWJvOiBudW1iZXIgPSAwO1xyXG5sZXQgaGVhbHRoOiBudW1iZXIgPSAwO1xyXG5cclxubGV0IGFjdGl2ZU5vdGVzOiBOb3RlW10gPSBbXTtcclxubGV0IG5vdGVTcGF3blF1ZXVlOiBJTm90ZVNwYXduRGF0YVtdID0gW107XHJcbmxldCBoaXRFZmZlY3RzOiBIaXRFZmZlY3RbXSA9IFtdO1xyXG5sZXQganVkZ2VUZXh0czogSnVkZ2VUZXh0W10gPSBbXTtcclxuXHJcbmxldCBiYWNrZ3JvdW5kU2Nyb2xsWTogbnVtYmVyID0gMDsgLy8gRm9yIHNjcm9sbGluZyBiYWNrZ3JvdW5kIGltYWdlXHJcblxyXG4vLyAtLS0gR2FtZSBPYmplY3QgQ2xhc3NlcyAtLS1cclxuXHJcbmNsYXNzIE5vdGUge1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7IC8vIFRvcC1sZWZ0IGNvcm5lclxyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgbGFuZTogbnVtYmVyO1xyXG4gICAgc3Bhd25UaW1lOiBudW1iZXI7IC8vIFNvbmcgdGltZSBpbiBzZWNvbmRzIHdoZW4gdGhpcyBub3RlIHNob3VsZCBiZSBoaXRcclxuICAgIGhpdDogYm9vbGVhbiA9IGZhbHNlOyAvLyBGbGFnIHRvIHByZXZlbnQgbXVsdGlwbGUgaGl0cy9taXNzZXNcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihsYW5lOiBudW1iZXIsIHNwYXduVGltZTogbnVtYmVyLCBpbWFnZTogSFRNTEltYWdlRWxlbWVudCwgZGVmYXVsdE5vdGVIZWlnaHQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMubGFuZSA9IGxhbmU7XHJcbiAgICAgICAgdGhpcy5zcGF3blRpbWUgPSBzcGF3blRpbWU7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IGltYWdlO1xyXG5cclxuICAgICAgICBjb25zdCBsYW5lQ29uZmlnID0gZ2FtZURhdGEuZ2FtZUNvbmZpZztcclxuICAgICAgICB0aGlzLndpZHRoID0gbGFuZUNvbmZpZy5sYW5lV2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBkZWZhdWx0Tm90ZUhlaWdodDtcclxuXHJcbiAgICAgICAgdGhpcy54ID0gbGFuZUNvbmZpZy5sYW5lU3RhcnRYICsgbGFuZSAqIChsYW5lQ29uZmlnLmxhbmVXaWR0aCArIGxhbmVDb25maWcubGFuZVNwYWNpbmcpO1xyXG4gICAgICAgIHRoaXMueSA9IDA7IC8vIFdpbGwgYmUgc2V0IGluIHVwZGF0ZVxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZUVsYXBzZWRUaW1lTXM6IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IGxhbmVDb25maWcgPSBnYW1lRGF0YS5nYW1lQ29uZmlnO1xyXG4gICAgICAgIGNvbnN0IHBlcmZlY3RIaXRHYW1lVGltZU1zID0gKHRoaXMuc3Bhd25UaW1lICogMTAwMCkgKyBsYW5lQ29uZmlnLnBlcmZlY3RIaXRPZmZzZXRNcztcclxuICAgICAgICBjb25zdCB0aW1lUmVtYWluaW5nRm9yUGVyZmVjdEhpdCA9IHBlcmZlY3RIaXRHYW1lVGltZU1zIC0gZ2FtZUVsYXBzZWRUaW1lTXM7XHJcbiAgICAgICAgY29uc3QgZGlzdGFuY2VBYm92ZUhpdExpbmUgPSB0aW1lUmVtYWluaW5nRm9yUGVyZmVjdEhpdCAqIGxhbmVDb25maWcubm90ZUZhbGxTcGVlZFB4UGVyTXM7XHJcbiAgICAgICAgdGhpcy55ID0gbGFuZUNvbmZpZy5oaXRMaW5lWSAtIGRpc3RhbmNlQWJvdmVIaXRMaW5lIC0gdGhpcy5oZWlnaHQ7IC8vIFRvcC1sZWZ0IG9mIHRoZSBub3RlXHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBIaXRFZmZlY3Qge1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBsaWZlVGltZTogbnVtYmVyOyAvLyBtaWxsaXNlY29uZHNcclxuICAgIG1heExpZmVUaW1lOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LCBkdXJhdGlvbk1zOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IGltYWdlO1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5saWZlVGltZSA9IDA7XHJcbiAgICAgICAgdGhpcy5tYXhMaWZlVGltZSA9IGR1cmF0aW9uTXM7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgdGhpcy5saWZlVGltZSArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubGlmZVRpbWUgPj0gdGhpcy5tYXhMaWZlVGltZTsgLy8gdHJ1ZSBpZiBlZmZlY3QgaXMgZmluaXNoZWRcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBjb25zdCBhbHBoYSA9IDEgLSAodGhpcy5saWZlVGltZSAvIHRoaXMubWF4TGlmZVRpbWUpO1xyXG4gICAgICAgIGN0eC5zYXZlKCk7XHJcbiAgICAgICAgY3R4Lmdsb2JhbEFscGhhID0gYWxwaGE7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIGN0eC5yZXN0b3JlKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEp1ZGdlVGV4dCB7XHJcbiAgICB0ZXh0OiBzdHJpbmc7XHJcbiAgICBjb2xvcjogc3RyaW5nO1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgbGlmZVRpbWU6IG51bWJlcjsgLy8gbWlsbGlzZWNvbmRzXHJcbiAgICBtYXhMaWZlVGltZTogbnVtYmVyO1xyXG4gICAgaW5pdGlhbFk6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih0ZXh0OiBzdHJpbmcsIGNvbG9yOiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBkdXJhdGlvbk1zOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnRleHQgPSB0ZXh0O1xyXG4gICAgICAgIHRoaXMuY29sb3IgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy5pbml0aWFsWSA9IHk7XHJcbiAgICAgICAgdGhpcy5saWZlVGltZSA9IDA7XHJcbiAgICAgICAgdGhpcy5tYXhMaWZlVGltZSA9IGR1cmF0aW9uTXM7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgdGhpcy5saWZlVGltZSArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgLy8gRmxvYXQgdXAgYW5pbWF0aW9uXHJcbiAgICAgICAgdGhpcy55ID0gdGhpcy5pbml0aWFsWSAtICh0aGlzLmxpZmVUaW1lIC8gdGhpcy5tYXhMaWZlVGltZSkgKiAyMDsgLy8gRmxvYXQgdXAgMjBweFxyXG4gICAgICAgIHJldHVybiB0aGlzLmxpZmVUaW1lID49IHRoaXMubWF4TGlmZVRpbWU7IC8vIHRydWUgaWYgdGV4dCBpcyBmaW5pc2hlZFxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGNvbnN0IGFscGhhID0gMSAtICh0aGlzLmxpZmVUaW1lIC8gdGhpcy5tYXhMaWZlVGltZSk7XHJcbiAgICAgICAgY3R4LnNhdmUoKTtcclxuICAgICAgICBjdHguZ2xvYmFsQWxwaGEgPSBhbHBoYTtcclxuICAgICAgICBjdHguZm9udCA9IGdhbWVEYXRhLmdhbWVwbGF5VUkuanVkZ2VUZXh0Rm9udDtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gdGhpcy5jb2xvcjtcclxuICAgICAgICBjdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICBjdHguZmlsbFRleHQodGhpcy50ZXh0LCB0aGlzLngsIHRoaXMueSk7XHJcbiAgICAgICAgY3R4LnJlc3RvcmUoKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIENvcmUgR2FtZSBGdW5jdGlvbnMgLS0tXHJcblxyXG5hc3luYyBmdW5jdGlvbiBpbml0R2FtZSgpIHtcclxuICAgIGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBpZiAoIWNhbnZhcykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDYW52YXMgZWxlbWVudCB3aXRoIElEICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuXHJcbiAgICBhdWRpb0NvbnRleHQgPSBuZXcgKHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgKHdpbmRvdyBhcyBhbnkpLndlYmtpdEF1ZGlvQ29udGV4dCkoKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IGxvYWRHYW1lRGF0YSgpO1xyXG4gICAgICAgIHJlc2l6ZUNhbnZhcygpO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemVDYW52YXMpO1xyXG4gICAgICAgIGF3YWl0IGxvYWRBc3NldHMoKTtcclxuICAgICAgICB0cmFuc2l0aW9uVG9TdGF0ZShHYW1lU3RhdGUuVElUTEUpO1xyXG4gICAgICAgIGFkZElucHV0TGlzdGVuZXJzKCk7XHJcbiAgICAgICAgZ2FtZUxvb3AoMCk7IC8vIFN0YXJ0IHRoZSBnYW1lIGxvb3BcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBpbml0aWFsaXplIGdhbWU6XCIsIGVycm9yKTtcclxuICAgICAgICAvLyBPcHRpb25hbGx5LCBkaXNwbGF5IGFuIGVycm9yIG1lc3NhZ2Ugb24gdGhlIGNhbnZhc1xyXG4gICAgICAgIGN0eC5jbGVhclJlY3QoMCwwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJlZFwiO1xyXG4gICAgICAgIGN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgY3R4LmZpbGxUZXh0KFwiRXJyb3I6IFwiICsgKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlLCBjYW52YXMud2lkdGgvMiwgY2FudmFzLmhlaWdodC8yKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcmVzaXplQ2FudmFzKCkge1xyXG4gICAgaWYgKCFnYW1lRGF0YSkgcmV0dXJuO1xyXG4gICAgY2FudmFzLndpZHRoID0gZ2FtZURhdGEuZ2FtZUNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgIGNhbnZhcy5oZWlnaHQgPSBnYW1lRGF0YS5nYW1lQ29uZmlnLmNhbnZhc0hlaWdodDtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbG9hZEdhbWVEYXRhKCkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBkYXRhLmpzb246ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgIH1cclxuICAgIGdhbWVEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgY29uc29sZS5sb2coXCJHYW1lIGRhdGEgbG9hZGVkOlwiLCBnYW1lRGF0YSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRBc3NldHMoKSB7XHJcbiAgICBjb25zdCBpbWFnZVByb21pc2VzID0gZ2FtZURhdGEuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWFnZS5zcmMgPSBpbWcucGF0aDtcclxuICAgICAgICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgYXNzZXRDYWNoZS5pbWFnZXMuc2V0KGltZy5uYW1lLCBpbWFnZSk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltYWdlLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZy5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgYXNzZXRDYWNoZS5pbWFnZXMuc2V0KGltZy5uYW1lLCBuZXcgSW1hZ2UoKSk7IC8vIFN0b3JlIGEgZHVtbXkgaW1hZ2UgdG8gcHJldmVudCBlcnJvcnMgbGF0ZXJcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gU3RpbGwgcmVzb2x2ZSB0byBsZXQgb3RoZXIgYXNzZXRzIGxvYWRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSBnYW1lRGF0YS5hc3NldHMuc291bmRzLm1hcChzb3VuZCA9PiB7XHJcbiAgICAgICAgcmV0dXJuIGZldGNoKHNvdW5kLnBhdGgpXHJcbiAgICAgICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UuYXJyYXlCdWZmZXIoKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLnRoZW4oYXJyYXlCdWZmZXIgPT4gYXVkaW9Db250ZXh0LmRlY29kZUF1ZGlvRGF0YShhcnJheUJ1ZmZlcikpXHJcbiAgICAgICAgICAgIC50aGVuKGF1ZGlvQnVmZmVyID0+IHtcclxuICAgICAgICAgICAgICAgIGFzc2V0Q2FjaGUuc291bmRzLnNldChzb3VuZC5uYW1lLCBhdWRpb0J1ZmZlcik7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kLnBhdGh9YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgYXNzZXRDYWNoZS5zb3VuZHMuc2V0KHNvdW5kLm5hbWUsIGF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXIoMSwgMSwgNDQxMDApKTsgLy8gU3RvcmUgYSBzaWxlbnQgZHVtbXkgYnVmZmVyXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0cmFuc2l0aW9uVG9TdGF0ZShuZXdTdGF0ZTogR2FtZVN0YXRlKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgVHJhbnNpdGlvbmluZyBmcm9tICR7Y3VycmVudFN0YXRlfSB0byAke25ld1N0YXRlfWApO1xyXG4gICAgY3VycmVudFN0YXRlID0gbmV3U3RhdGU7XHJcblxyXG4gICAgLy8gU3RhdGUtc3BlY2lmaWMgc2V0dXBcclxuICAgIHN3aXRjaCAobmV3U3RhdGUpIHtcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRCR00pIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRCR00uc3RvcCgpO1xyXG4gICAgICAgICAgICAgICAgY3VycmVudEJHTSA9IG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRVBMQVk6XHJcbiAgICAgICAgICAgIHN0YXJ0R2FtZXBsYXkoKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICBpZiAoY3VycmVudEJHTSkge1xyXG4gICAgICAgICAgICAgICAgY3VycmVudEJHTS5zdG9wKCk7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50QkdNID0gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc3RhcnRHYW1lcGxheSgpIHtcclxuICAgIGlmICghZ2FtZURhdGEuc29uZ3MgfHwgZ2FtZURhdGEuc29uZ3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIk5vIHNvbmdzIGRlZmluZWQgaW4gZGF0YS5qc29uIVwiKTtcclxuICAgICAgICB0cmFuc2l0aW9uVG9TdGF0ZShHYW1lU3RhdGUuVElUTEUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjdXJyZW50U29uZyA9IGdhbWVEYXRhLnNvbmdzWzBdOyAvLyBGb3IgdGhpcyBleGFtcGxlLCBhbHdheXMgcGlja3MgdGhlIGZpcnN0IHNvbmdcclxuICAgIHNjb3JlID0gMDtcclxuICAgIGNvbWJvID0gMDtcclxuICAgIG1heENvbWJvID0gMDtcclxuICAgIGhlYWx0aCA9IGdhbWVEYXRhLmdhbWVDb25maWcuaW5pdGlhbEhlYWx0aDtcclxuICAgIGdhbWVFbGFwc2VkVGltZSA9IDA7XHJcbiAgICBhY3RpdmVOb3RlcyA9IFtdO1xyXG4gICAgaGl0RWZmZWN0cyA9IFtdO1xyXG4gICAganVkZ2VUZXh0cyA9IFtdO1xyXG4gICAgYmFja2dyb3VuZFNjcm9sbFkgPSAwO1xyXG5cclxuICAgIC8vIFBvcHVsYXRlIG5vdGUgc3Bhd24gcXVldWUsIHNvcnRlZCBieSB0aW1lXHJcbiAgICBub3RlU3Bhd25RdWV1ZSA9IFsuLi5jdXJyZW50U29uZy5ub3Rlc10uc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcclxuXHJcbiAgICBjb25zdCBiZ21CdWZmZXIgPSBhc3NldENhY2hlLnNvdW5kcy5nZXQoY3VycmVudFNvbmcuYmdtQXNzZXROYW1lKTtcclxuICAgIGlmIChiZ21CdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBzb3VuZEluZm8gPSBnYW1lRGF0YS5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09IGN1cnJlbnRTb25nIS5iZ21Bc3NldE5hbWUpO1xyXG4gICAgICAgIHBsYXlCR00oYmdtQnVmZmVyLCBzb3VuZEluZm8/LnZvbHVtZSB8fCAxLjAsIGZhbHNlKTsgLy8gUGxheSBCR00gb25jZSAobm90IGxvb3BpbmcpXHJcbiAgICAgICAgaWYgKGN1cnJlbnRCR00pIHtcclxuICAgICAgICAgICAgY3VycmVudEJHTS5vbmVuZGVkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJTb25nIGVuZGVkLlwiKTtcclxuICAgICAgICAgICAgICAgIC8vIEVuc3VyZSB3ZSBvbmx5IHRyYW5zaXRpb24gaWYgc3RpbGwgaW4gZ2FtZXBsYXkgKGUuZy4sIG5vdCBhbHJlYWR5IEdhbWUgT3ZlciBieSBoZWFsdGgpXHJcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudFN0YXRlID09PSBHYW1lU3RhdGUuR0FNRVBMQVkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0cmFuc2l0aW9uVG9TdGF0ZShHYW1lU3RhdGUuR0FNRV9PVkVSKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUud2FybihgQkdNIGFzc2V0ICR7Y3VycmVudFNvbmcuYmdtQXNzZXROYW1lfSBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgLy8gR2FtZSB3aWxsIGNvbnRpbnVlIHdpdGhvdXQgbXVzaWM7IGZhbGxiYWNrIGdhbWUgb3ZlciBjb25kaXRpb24gYmFzZWQgb24gbm90ZXMgd2lsbCBhcHBseS5cclxuICAgIH1cclxuXHJcbiAgICBjdXJyZW50U29uZ1RpbWVPZmZzZXQgPSBhdWRpb0NvbnRleHQuY3VycmVudFRpbWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHBsYXlCR00oYnVmZmVyOiBBdWRpb0J1ZmZlciwgdm9sdW1lOiBudW1iZXIsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSkgeyAvLyBBZGRlZCAnbG9vcCcgcGFyYW1ldGVyXHJcbiAgICBpZiAoY3VycmVudEJHTSkge1xyXG4gICAgICAgIGN1cnJlbnRCR00uc3RvcCgpO1xyXG4gICAgICAgIGN1cnJlbnRCR00gPSBudWxsO1xyXG4gICAgfVxyXG4gICAgY3VycmVudEJHTSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXJTb3VyY2UoKTtcclxuICAgIGN1cnJlbnRCR00uYnVmZmVyID0gYnVmZmVyO1xyXG5cclxuICAgIGNvbnN0IGdhaW5Ob2RlID0gYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcclxuICAgIGdhaW5Ob2RlLmdhaW4udmFsdWUgPSB2b2x1bWU7XHJcbiAgICBjdXJyZW50QkdNLmNvbm5lY3QoZ2Fpbk5vZGUpO1xyXG4gICAgZ2Fpbk5vZGUuY29ubmVjdChhdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG5cclxuICAgIGN1cnJlbnRCR00ubG9vcCA9IGxvb3A7IC8vIFVzZSB0aGUgJ2xvb3AnIHBhcmFtZXRlclxyXG4gICAgY3VycmVudEJHTS5zdGFydCgwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcGxheUVmZmVjdChhc3NldE5hbWU6IHN0cmluZykge1xyXG4gICAgY29uc3QgZWZmZWN0QnVmZmVyID0gYXNzZXRDYWNoZS5zb3VuZHMuZ2V0KGFzc2V0TmFtZSk7XHJcbiAgICBpZiAoZWZmZWN0QnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3Qgc291cmNlID0gYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgIHNvdXJjZS5idWZmZXIgPSBlZmZlY3RCdWZmZXI7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kRGF0YSA9IGdhbWVEYXRhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gYXNzZXROYW1lKTtcclxuICAgICAgICBjb25zdCB2b2x1bWUgPSBzb3VuZERhdGEgPyBzb3VuZERhdGEudm9sdW1lIDogMS4wO1xyXG5cclxuICAgICAgICBjb25zdCBnYWluTm9kZSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XHJcbiAgICAgICAgZ2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcclxuICAgICAgICBzb3VyY2UuY29ubmVjdChnYWluTm9kZSk7XHJcbiAgICAgICAgZ2Fpbk5vZGUuY29ubmVjdChhdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG5cclxuICAgICAgICBzb3VyY2Uuc3RhcnQoMCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUud2FybihgRWZmZWN0IGFzc2V0ICR7YXNzZXROYW1lfSBub3QgZm91bmQuYCk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBnYW1lTG9vcCh0aW1lc3RhbXA6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcclxuICAgIGlmICghbGFzdFVwZGF0ZVRpbWUpIHtcclxuICAgICAgICBsYXN0VXBkYXRlVGltZSA9IHRpbWVzdGFtcDtcclxuICAgIH1cclxuICAgIGNvbnN0IGRlbHRhVGltZSA9IHRpbWVzdGFtcCAtIGxhc3RVcGRhdGVUaW1lOyAvLyBpbiBtaWxsaXNlY29uZHNcclxuICAgIGxhc3RVcGRhdGVUaW1lID0gdGltZXN0YW1wO1xyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgcmVuZGVyKCk7XHJcblxyXG4gICAgYW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShnYW1lTG9vcCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5MT0FESU5HOlxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRVBMQVk6XHJcbiAgICAgICAgICAgIHVwZGF0ZUdhbWVwbGF5KGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZUdhbWVwbGF5KGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICBpZiAoIWN1cnJlbnRTb25nIHx8ICFnYW1lRGF0YSkgcmV0dXJuO1xyXG5cclxuICAgIGdhbWVFbGFwc2VkVGltZSArPSBkZWx0YVRpbWU7XHJcblxyXG4gICAgY29uc3QgY29uZmlnID0gZ2FtZURhdGEuZ2FtZUNvbmZpZztcclxuICAgIGNvbnN0IHNvbmdUaW1lU2Vjb25kcyA9IGdhbWVFbGFwc2VkVGltZSAvIDEwMDA7XHJcblxyXG4gICAgLy8gLS0tIFNwYXduIE5vdGVzIC0tLVxyXG4gICAgY29uc3QgdGltZVRvRmFsbEZyb21Ub3BUb0hpdExpbmVNcyA9IChjYW52YXMuaGVpZ2h0IC8gY29uZmlnLm5vdGVGYWxsU3BlZWRQeFBlck1zKTtcclxuICAgIGNvbnN0IGVhcmxpZXN0U3Bhd25UaW1lRm9yVmlzaWJsZU5vdGUgPSBzb25nVGltZVNlY29uZHMgLSAodGltZVRvRmFsbEZyb21Ub3BUb0hpdExpbmVNcyAvIDEwMDApO1xyXG5cclxuICAgIHdoaWxlIChub3RlU3Bhd25RdWV1ZS5sZW5ndGggPiAwICYmIG5vdGVTcGF3blF1ZXVlWzBdLnRpbWUgPD0gZWFybGllc3RTcGF3blRpbWVGb3JWaXNpYmxlTm90ZSArIDAuMSkgeyAvLyBBZGQgYSBzbWFsbCBidWZmZXIgZm9yIHNwYXduXHJcbiAgICAgICAgY29uc3Qgbm90ZURhdGEgPSBub3RlU3Bhd25RdWV1ZS5zaGlmdCgpITtcclxuICAgICAgICBjb25zdCBub3RlVHlwZSA9IGdhbWVEYXRhLm5vdGVUeXBlc1tub3RlRGF0YS50eXBlXTtcclxuICAgICAgICBpZiAoIW5vdGVUeXBlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgTm90ZSB0eXBlICR7bm90ZURhdGEudHlwZX0gbm90IGZvdW5kIGluIG5vdGVUeXBlcy5gKTtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IG5vdGVJbWFnZSA9IGFzc2V0Q2FjaGUuaW1hZ2VzLmdldChub3RlVHlwZS5pbWFnZUFzc2V0TmFtZSk7XHJcbiAgICAgICAgaWYgKG5vdGVJbWFnZSkge1xyXG4gICAgICAgICAgICBhY3RpdmVOb3Rlcy5wdXNoKG5ldyBOb3RlKG5vdGVEYXRhLmxhbmUsIG5vdGVEYXRhLnRpbWUsIG5vdGVJbWFnZSwgY29uZmlnLmRlZmF1bHROb3RlSGVpZ2h0KSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBOb3RlIGltYWdlIGZvciBhc3NldCAke25vdGVUeXBlLmltYWdlQXNzZXROYW1lfSBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLSBVcGRhdGUgTm90ZXMgJiBDaGVjayBmb3IgTWlzc2VzIC0tLVxyXG4gICAgZm9yIChsZXQgaSA9IGFjdGl2ZU5vdGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgY29uc3Qgbm90ZSA9IGFjdGl2ZU5vdGVzW2ldO1xyXG4gICAgICAgIGlmIChub3RlLmhpdCkgY29udGludWU7XHJcblxyXG4gICAgICAgIG5vdGUudXBkYXRlKGRlbHRhVGltZSwgZ2FtZUVsYXBzZWRUaW1lKTtcclxuXHJcbiAgICAgICAgY29uc3QgcGVyZmVjdEhpdEdhbWVUaW1lTXMgPSAobm90ZS5zcGF3blRpbWUgKiAxMDAwKSArIGNvbmZpZy5wZXJmZWN0SGl0T2Zmc2V0TXM7XHJcbiAgICAgICAgY29uc3QgdGltZURpZmZGcm9tUGVyZmVjdE1zID0gZ2FtZUVsYXBzZWRUaW1lIC0gcGVyZmVjdEhpdEdhbWVUaW1lTXM7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgdGhlIHdpZGVzdCAnTWlzcycgd2luZG93IHRvIGRldGVybWluZSB3aGVuIGEgbm90ZSBpcyBmdWxseSBwYXN0IGl0cyBoaXQgb3Bwb3J0dW5pdHlcclxuICAgICAgICBjb25zdCBtaXNzU2V0dGluZyA9IGdhbWVEYXRhLmp1ZGdlU2V0dGluZ3MuZmluZChqID0+IGouanVkZ21lbnQgPT09IFwiTWlzc1wiKTtcclxuICAgICAgICBjb25zdCBtaXNzV2luZG93RW5kID0gbWlzc1NldHRpbmcgPyBtaXNzU2V0dGluZy50aW1lV2luZG93TXMgOiBJbmZpbml0eTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIG5vdGUgaGFzIHBhc3NlZCBpdHMgcGVyZmVjdCBoaXQgdGltZSArIG1pc3Mgd2luZG93LCBpdCdzIGFuIGF1dG8tbWlzc1xyXG4gICAgICAgIGlmICh0aW1lRGlmZkZyb21QZXJmZWN0TXMgPiBtaXNzV2luZG93RW5kICYmICFub3RlLmhpdCkge1xyXG4gICAgICAgICAgICBwcm9jZXNzSGl0KG5vdGUsIHRpbWVEaWZmRnJvbVBlcmZlY3RNcywgdHJ1ZSk7IC8vIHRydWUgZm9yIGF1dG8tbWlzc1xyXG4gICAgICAgICAgICBhY3RpdmVOb3Rlcy5zcGxpY2UoaSwgMSk7IC8vIFJlbW92ZSB0aGUgbm90ZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIFJlbW92ZSBub3RlcyB0aGF0IGhhdmUgYmVlbiBoaXRcclxuICAgIGFjdGl2ZU5vdGVzID0gYWN0aXZlTm90ZXMuZmlsdGVyKG5vdGUgPT4gIW5vdGUuaGl0KTtcclxuXHJcbiAgICAvLyAtLS0gVXBkYXRlIEhpdCBFZmZlY3RzIC0tLVxyXG4gICAgZm9yIChsZXQgaSA9IGhpdEVmZmVjdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICBpZiAoaGl0RWZmZWN0c1tpXS51cGRhdGUoZGVsdGFUaW1lKSkge1xyXG4gICAgICAgICAgICBoaXRFZmZlY3RzLnNwbGljZShpLCAxKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gLS0tIFVwZGF0ZSBKdWRnZSBUZXh0cyAtLS1cclxuICAgIGZvciAobGV0IGkgPSBqdWRnZVRleHRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgaWYgKGp1ZGdlVGV4dHNbaV0udXBkYXRlKGRlbHRhVGltZSkpIHtcclxuICAgICAgICAgICAganVkZ2VUZXh0cy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLSBVcGRhdGUgQmFja2dyb3VuZCBTY3JvbGwgLS0tXHJcbiAgICBjb25zdCBiZ0ltYWdlID0gYXNzZXRDYWNoZS5pbWFnZXMuZ2V0KGdhbWVEYXRhLnRpdGxlU2NyZWVuLmJhY2tncm91bmRJbWFnZU5hbWUpO1xyXG4gICAgaWYgKGJnSW1hZ2UpIHtcclxuICAgICAgICBiYWNrZ3JvdW5kU2Nyb2xsWSA9IChiYWNrZ3JvdW5kU2Nyb2xsWSArIGNvbmZpZy5iYWNrZ3JvdW5kU2Nyb2xsU3BlZWRZICogZGVsdGFUaW1lKSAlIGJnSW1hZ2UuaGVpZ2h0O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLSBDaGVjayBHYW1lIE92ZXIgQ29uZGl0aW9uIC0tLVxyXG4gICAgaWYgKGhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgdHJhbnNpdGlvblRvU3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUik7XHJcbiAgICB9IGVsc2UgaWYgKCFjdXJyZW50QkdNICYmIGN1cnJlbnRTb25nICYmIG5vdGVTcGF3blF1ZXVlLmxlbmd0aCA9PT0gMCAmJiBhY3RpdmVOb3Rlcy5sZW5ndGggPT09IDAgJiYgZ2FtZUVsYXBzZWRUaW1lIC8gMTAwMCA+IChjdXJyZW50U29uZy5ub3Rlc1tjdXJyZW50U29uZy5ub3Rlcy5sZW5ndGggLSAxXT8udGltZSB8fCAwKSArIDMpIHtcclxuICAgICAgICAvLyBGYWxsYmFjazogSWYgbm8gQkdNIGlzIHBsYXlpbmcgKGUuZy4sIGZhaWxlZCB0byBsb2FkKSxcclxuICAgICAgICAvLyB0cmFuc2l0aW9uIHRvIEdhbWUgT3ZlciB3aGVuIGFsbCBub3RlcyBwcm9jZXNzZWQgYW5kIGEgYnVmZmVyIHRpbWUgcGFzc2VkIGFmdGVyIHRoZSBsYXN0IG5vdGUuXHJcbiAgICAgICAgLy8gY3VycmVudFNvbmcubm90ZXNbY3VycmVudFNvbmcubm90ZXMubGVuZ3RoIC0gMV0/LnRpbWUgaGFuZGxlcyBjYXNlIG9mIGVtcHR5IG5vdGVzIGFycmF5LlxyXG4gICAgICAgIHRyYW5zaXRpb25Ub1N0YXRlKEdhbWVTdGF0ZS5HQU1FX09WRVIpO1xyXG4gICAgfVxyXG4gICAgLy8gUHJpbWFyeSBHYW1lIE92ZXIgY29uZGl0aW9uIGZvciBzb25nIGNvbXBsZXRpb24gaXMgaGFuZGxlZCBieSBjdXJyZW50QkdNLm9uZW5kZWQgaW4gc3RhcnRHYW1lcGxheS5cclxufVxyXG5cclxuZnVuY3Rpb24gcmVuZGVyKCkge1xyXG4gICAgY3R4LmNsZWFyUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgIHN3aXRjaCAoY3VycmVudFN0YXRlKSB7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuTE9BRElORzpcclxuICAgICAgICAgICAgZHJhd0xvYWRpbmdTY3JlZW4oKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIGRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FUExBWTpcclxuICAgICAgICAgICAgZHJhd0dhbWVwbGF5KCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgZHJhd0dhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3TG9hZGluZ1NjcmVlbigpIHtcclxuICAgIGN0eC5maWxsU3R5bGUgPSBcIiMxYTFhMWFcIjtcclxuICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgY3R4LmZvbnQgPSBcIjMwcHggQXJpYWxcIjtcclxuICAgIGN0eC5maWxsU3R5bGUgPSBcIiNmZmZmZmZcIjtcclxuICAgIGN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgY3R4LmZpbGxUZXh0KFwiTG9hZGluZyBBc3NldHMuLi5cIiwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICBjb25zdCB0aXRsZUNvbmZpZyA9IGdhbWVEYXRhLnRpdGxlU2NyZWVuO1xyXG4gICAgY29uc3QgYmFja2dyb3VuZCA9IGFzc2V0Q2FjaGUuaW1hZ2VzLmdldCh0aXRsZUNvbmZpZy5iYWNrZ3JvdW5kSW1hZ2VOYW1lKTtcclxuICAgIGlmIChiYWNrZ3JvdW5kKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZShiYWNrZ3JvdW5kLCAwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCIjMzMzXCI7XHJcbiAgICAgICAgY3R4LmZpbGxSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgY3R4LmZvbnQgPSB0aXRsZUNvbmZpZy50aXRsZUZvbnQ7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gdGl0bGVDb25maWcudGl0bGVDb2xvcjtcclxuICAgIGN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgY3R4LmZpbGxUZXh0KHRpdGxlQ29uZmlnLnRpdGxlVGV4dCwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIgLSA1MCk7XHJcblxyXG4gICAgY3R4LmZvbnQgPSB0aXRsZUNvbmZpZy5zdGFydEZvbnQ7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gdGl0bGVDb25maWcuc3RhcnRDb2xvcjtcclxuICAgIGN0eC5maWxsVGV4dCh0aXRsZUNvbmZpZy5zdGFydEJ1dHRvblRleHQsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3R2FtZXBsYXkoKSB7XHJcbiAgICBjb25zdCBjb25maWcgPSBnYW1lRGF0YS5nYW1lQ29uZmlnO1xyXG5cclxuICAgIC8vIERyYXcgc2Nyb2xsaW5nIGJhY2tncm91bmRcclxuICAgIGNvbnN0IGJnSW1hZ2UgPSBhc3NldENhY2hlLmltYWdlcy5nZXQoZ2FtZURhdGEudGl0bGVTY3JlZW4uYmFja2dyb3VuZEltYWdlTmFtZSk7XHJcbiAgICBpZiAoYmdJbWFnZSkge1xyXG4gICAgICAgIGNvbnN0IGltZ0hlaWdodCA9IGJnSW1hZ2UuaGVpZ2h0O1xyXG4gICAgICAgIGxldCBjdXJyZW50WSA9IGJhY2tncm91bmRTY3JvbGxZO1xyXG4gICAgICAgIHdoaWxlIChjdXJyZW50WSA8IGNhbnZhcy5oZWlnaHQpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCBjdXJyZW50WSwgY2FudmFzLndpZHRoLCBpbWdIZWlnaHQpO1xyXG4gICAgICAgICAgICBjdXJyZW50WSArPSBpbWdIZWlnaHQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGN1cnJlbnRZID0gYmFja2dyb3VuZFNjcm9sbFkgLSBpbWdIZWlnaHQ7XHJcbiAgICAgICAgd2hpbGUgKGN1cnJlbnRZIDwgY2FudmFzLmhlaWdodCkge1xyXG4gICAgICAgICAgICBjdHguZHJhd0ltYWdlKGJnSW1hZ2UsIDAsIGN1cnJlbnRZLCBjYW52YXMud2lkdGgsIGltZ0hlaWdodCk7XHJcbiAgICAgICAgICAgIGN1cnJlbnRZICs9IGltZ0hlaWdodDtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcIiMwMDBcIjtcclxuICAgICAgICBjdHguZmlsbFJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEcmF3IExhbmVzXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbmZpZy5sYW5lQ291bnQ7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGxhbmVYID0gY29uZmlnLmxhbmVTdGFydFggKyBpICogKGNvbmZpZy5sYW5lV2lkdGggKyBjb25maWcubGFuZVNwYWNpbmcpO1xyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xKVwiO1xyXG4gICAgICAgIGN0eC5maWxsUmVjdChsYW5lWCwgMCwgY29uZmlnLmxhbmVXaWR0aCwgY2FudmFzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhdyBOb3Rlc1xyXG4gICAgZm9yIChjb25zdCBub3RlIG9mIGFjdGl2ZU5vdGVzKSB7XHJcbiAgICAgICAgbm90ZS5yZW5kZXIoY3R4KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEcmF3IEhpdCBFZmZlY3RzXHJcbiAgICBmb3IgKGNvbnN0IGVmZmVjdCBvZiBoaXRFZmZlY3RzKSB7XHJcbiAgICAgICAgZWZmZWN0LnJlbmRlcihjdHgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERyYXcgSGl0IExpbmVcclxuICAgIGN0eC5zdHJva2VTdHlsZSA9IFwicmdiYSgyNTUsIDI1NSwgMCwgMC44KVwiO1xyXG4gICAgY3R4LmxpbmVXaWR0aCA9IDM7XHJcbiAgICBjdHguYmVnaW5QYXRoKCk7XHJcbiAgICBjdHgubW92ZVRvKDAsIGNvbmZpZy5oaXRMaW5lWSk7XHJcbiAgICBjdHgubGluZVRvKGNhbnZhcy53aWR0aCwgY29uZmlnLmhpdExpbmVZKTtcclxuICAgIGN0eC5zdHJva2UoKTtcclxuXHJcbiAgICAvLyBEcmF3IEp1ZGdlIFRleHRzXHJcbiAgICBmb3IgKGNvbnN0IHRleHQgb2YganVkZ2VUZXh0cykge1xyXG4gICAgICAgIHRleHQucmVuZGVyKGN0eCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhdyBVSSAoU2NvcmUsIENvbWJvLCBIZWFsdGgpXHJcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9IFwibGVmdFwiO1xyXG4gICAgY3R4LmZvbnQgPSBnYW1lRGF0YS5nYW1lcGxheVVJLnNjb3JlRm9udDtcclxuICAgIGN0eC5maWxsVGV4dChgU2NvcmU6ICR7c2NvcmV9YCwgMjAsIDQwKTtcclxuXHJcbiAgICBjdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgIGN0eC5mb250ID0gZ2FtZURhdGEuZ2FtZXBsYXlVSS5jb21ib0ZvbnQ7XHJcbiAgICBpZiAoY29tYm8gPiAwKSB7XHJcbiAgICAgICAgY3R4LmZpbGxUZXh0KGBDb21ibzogJHtjb21ib31gLCBjYW52YXMud2lkdGggLyAyLCA4MCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSGVhbHRoIEJhclxyXG4gICAgY29uc3QgaGVhbHRoQmFyV2lkdGggPSAyMDA7XHJcbiAgICBjb25zdCBoZWFsdGhCYXJIZWlnaHQgPSAyMDtcclxuICAgIGNvbnN0IGhlYWx0aEJhclggPSBjYW52YXMud2lkdGggLSBoZWFsdGhCYXJXaWR0aCAtIDIwO1xyXG4gICAgY29uc3QgaGVhbHRoQmFyWSA9IDIwO1xyXG5cclxuICAgIGN0eC5maWxsU3R5bGUgPSBcImdyYXlcIjtcclxuICAgIGN0eC5maWxsUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBoZWFsdGhCYXJXaWR0aCwgaGVhbHRoQmFySGVpZ2h0KTtcclxuICAgIGN0eC5maWxsU3R5bGUgPSBnYW1lRGF0YS5nYW1lcGxheVVJLmhlYWx0aEJhckNvbG9yO1xyXG4gICAgY29uc3QgY3VycmVudEhlYWx0aFdpZHRoID0gKGhlYWx0aCAvIGdhbWVEYXRhLmdhbWVDb25maWcubWF4SGVhbHRoKSAqIGhlYWx0aEJhcldpZHRoO1xyXG4gICAgY3R4LmZpbGxSZWN0KGhlYWx0aEJhclgsIGhlYWx0aEJhclksIE1hdGgubWF4KDAsIGN1cnJlbnRIZWFsdGhXaWR0aCksIGhlYWx0aEJhckhlaWdodCk7XHJcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcIndoaXRlXCI7XHJcbiAgICBjdHgubGluZVdpZHRoID0gMTtcclxuICAgIGN0eC5zdHJva2VSZWN0KGhlYWx0aEJhclgsIGhlYWx0aEJhclksIGhlYWx0aEJhcldpZHRoLCBoZWFsdGhCYXJIZWlnaHQpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3R2FtZU92ZXJTY3JlZW4oKSB7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gXCJyZ2JhKDAsIDAsIDAsIDAuNylcIjtcclxuICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgIGN0eC5mb250ID0gXCI2MHB4IEFyaWFsXCI7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gXCJ3aGl0ZVwiO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICBjdHguZmlsbFRleHQoXCJHYW1lIE92ZXJcIiwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIgLSAxMDApO1xyXG5cclxuICAgIGN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICBjdHguZmlsbFRleHQoYEZpbmFsIFNjb3JlOiAke3Njb3JlfWAsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgIGN0eC5maWxsVGV4dChgTWF4IENvbWJvOiAke21heENvbWJvfWAsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyICsgNTApO1xyXG4gICAgY3R4LmZpbGxUZXh0KFwiUHJlc3MgUiB0byBSZXN0YXJ0IG9yIEVzYyBmb3IgVGl0bGVcIiwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIgKyAxNTApO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gYWRkSW5wdXRMaXN0ZW5lcnMoKSB7XHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZUtleURvd24pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBoYW5kbGVLZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICBpZiAoZXZlbnQucmVwZWF0KSByZXR1cm47IC8vIElnbm9yZSBrZXkgcmVwZWF0XHJcblxyXG4gICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgdHJhbnNpdGlvblRvU3RhdGUoR2FtZVN0YXRlLkdBTUVQTEFZKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRVBMQVk6XHJcbiAgICAgICAgICAgIGhhbmRsZUdhbWVwbGF5SW5wdXQoZXZlbnQua2V5KTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdyJykge1xyXG4gICAgICAgICAgICAgICAgdHJhbnNpdGlvblRvU3RhdGUoR2FtZVN0YXRlLkdBTUVQTEFZKTsgLy8gUmVzdGFydCBjdXJyZW50IHNvbmdcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5rZXkgPT09ICdFc2NhcGUnKSB7XHJcbiAgICAgICAgICAgICAgICB0cmFuc2l0aW9uVG9TdGF0ZShHYW1lU3RhdGUuVElUTEUpOyAvLyBHbyB0byB0aXRsZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBoYW5kbGVHYW1lcGxheUlucHV0KGtleTogc3RyaW5nKSB7XHJcbiAgICBjb25zdCBjb25maWcgPSBnYW1lRGF0YS5nYW1lQ29uZmlnO1xyXG4gICAgY29uc3QgbGFuZUluZGV4ID0gY29uZmlnLmxhbmVLZXlzW2tleS50b0xvd2VyQ2FzZSgpXTtcclxuXHJcbiAgICBpZiAobGFuZUluZGV4ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAvLyBOb3QgYSByZWNvZ25pemVkIGdhbWUga2V5XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGxldCBoaXROb3RlOiBOb3RlIHwgbnVsbCA9IG51bGw7XHJcbiAgICBsZXQgY2xvc2VzdFRpbWVEaWZmQWJzb2x1dGUgPSBJbmZpbml0eTsgLy8gQWJzb2x1dGUgdGltZSBkaWZmZXJlbmNlIGZyb20gcGVyZmVjdCBoaXQgKG1zKVxyXG4gICAgbGV0IHBlcmZlY3RIaXRHYW1lVGltZU1zID0gMDtcclxuXHJcbiAgICAvLyBTb3J0IGp1ZGdlIHNldHRpbmdzIGJ5IHRpbWVXaW5kb3dNcyBpbiBhc2NlbmRpbmcgb3JkZXIgdG8gZmluZCB0aGUgd2lkZXN0IG1pc3Mgd2luZG93XHJcbiAgICBjb25zdCBtaXNzU2V0dGluZyA9IGdhbWVEYXRhLmp1ZGdlU2V0dGluZ3MuZmluZChqID0+IGouanVkZ21lbnQgPT09IFwiTWlzc1wiKTtcclxuICAgIGNvbnN0IG1heEp1ZGdlV2luZG93ID0gbWlzc1NldHRpbmcgPyBtaXNzU2V0dGluZy50aW1lV2luZG93TXMgOiAwOyAvLyBUaGUgd2lkZXN0IHdpbmRvdyBmb3IgYW55IGp1ZGdtZW50XHJcblxyXG4gICAgZm9yIChjb25zdCBub3RlIG9mIGFjdGl2ZU5vdGVzKSB7XHJcbiAgICAgICAgaWYgKG5vdGUubGFuZSA9PT0gbGFuZUluZGV4ICYmICFub3RlLmhpdCkge1xyXG4gICAgICAgICAgICBjb25zdCBub3RlUGVyZmVjdEhpdEdhbWVUaW1lTXMgPSAobm90ZS5zcGF3blRpbWUgKiAxMDAwKSArIGNvbmZpZy5wZXJmZWN0SGl0T2Zmc2V0TXM7XHJcbiAgICAgICAgICAgIGNvbnN0IHRpbWVEaWZmID0gZ2FtZUVsYXBzZWRUaW1lIC0gbm90ZVBlcmZlY3RIaXRHYW1lVGltZU1zO1xyXG4gICAgICAgICAgICBjb25zdCBhYnNvbHV0ZVRpbWVEaWZmID0gTWF0aC5hYnModGltZURpZmYpO1xyXG5cclxuICAgICAgICAgICAgLy8gT25seSBjb25zaWRlciBub3RlcyB3aXRoaW4gdGhlIG1heGltdW0ganVkZ21lbnQgd2luZG93XHJcbiAgICAgICAgICAgIGlmIChhYnNvbHV0ZVRpbWVEaWZmIDw9IG1heEp1ZGdlV2luZG93ICYmIGFic29sdXRlVGltZURpZmYgPCBjbG9zZXN0VGltZURpZmZBYnNvbHV0ZSkge1xyXG4gICAgICAgICAgICAgICAgY2xvc2VzdFRpbWVEaWZmQWJzb2x1dGUgPSBhYnNvbHV0ZVRpbWVEaWZmO1xyXG4gICAgICAgICAgICAgICAgaGl0Tm90ZSA9IG5vdGU7XHJcbiAgICAgICAgICAgICAgICBwZXJmZWN0SGl0R2FtZVRpbWVNcyA9IG5vdGVQZXJmZWN0SGl0R2FtZVRpbWVNcztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoaGl0Tm90ZSkge1xyXG4gICAgICAgIHByb2Nlc3NIaXQoaGl0Tm90ZSwgZ2FtZUVsYXBzZWRUaW1lIC0gcGVyZmVjdEhpdEdhbWVUaW1lTXMsIGZhbHNlKTsgLy8gZmFsc2UgZm9yIHBsYXllciBoaXRcclxuICAgICAgICBoaXROb3RlLmhpdCA9IHRydWU7IC8vIE1hcmsgYXMgaGl0IGZvciByZW1vdmFsXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIE5vIG5vdGUgaGl0IGluIHRoaXMgbGFuZSB3aXRoaW4gdGhlIHdpbmRvdyBvciBubyBub3RlIGF0IGFsbFxyXG4gICAgICAgIC8vIFRyZWF0IGFzIGEgXCJCYWQgUHJlc3NcIlxyXG4gICAgICAgIGNvbnN0IG1pc3NQZW5hbHR5ID0gZ2FtZURhdGEuanVkZ2VTZXR0aW5ncy5maW5kKGogPT4gai5qdWRnbWVudCA9PT0gXCJNaXNzXCIpPy5oZWFsdGhDaGFuZ2UgfHwgLTEwO1xyXG4gICAgICAgIGhlYWx0aCArPSBtaXNzUGVuYWx0eTtcclxuICAgICAgICBoZWFsdGggPSBNYXRoLm1heCgwLCBoZWFsdGgpO1xyXG4gICAgICAgIGNvbWJvID0gMDtcclxuICAgICAgICBwbGF5RWZmZWN0KFwibWlzc19lZmZlY3RcIik7IC8vIFBsYXkgbWlzcyBzb3VuZCBmb3IgYmFkIHByZXNzXHJcblxyXG4gICAgICAgIGNvbnN0IGxhbmVYID0gY29uZmlnLmxhbmVTdGFydFggKyBsYW5lSW5kZXggKiAoY29uZmlnLmxhbmVXaWR0aCArIGNvbmZpZy5sYW5lU3BhY2luZyk7XHJcbiAgICAgICAganVkZ2VUZXh0cy5wdXNoKG5ldyBKdWRnZVRleHQoXCJCYWQgUHJlc3NcIiwgXCJncmV5XCIsIGxhbmVYICsgY29uZmlnLmxhbmVXaWR0aCAvIDIsIGNvbmZpZy5oaXRMaW5lWSAtIDUwLCBnYW1lRGF0YS5nYW1lQ29uZmlnLmp1ZGdlVGV4dER1cmF0aW9uTXMpKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcHJvY2Vzc0hpdChub3RlOiBOb3RlLCB0aW1lRGlmZmVyZW5jZTogbnVtYmVyLCBpc0F1dG9NaXNzOiBib29sZWFuKSB7XHJcbiAgICBjb25zdCBjb25maWcgPSBnYW1lRGF0YS5nYW1lQ29uZmlnO1xyXG4gICAgbGV0IGp1ZGdtZW50OiBJSnVkZ2VUZXh0U2V0dGluZyB8IHVuZGVmaW5lZDtcclxuICAgIGxldCBhYnNvbHV0ZVRpbWVEaWZmID0gTWF0aC5hYnModGltZURpZmZlcmVuY2UpO1xyXG5cclxuICAgIC8vIEZpbmQgdGhlIGp1ZGdtZW50IGJhc2VkIG9uIHRpbWUgZGlmZmVyZW5jZSwgZnJvbSBuYXJyb3dlc3QgdG8gd2lkZXN0IHdpbmRvd1xyXG4gICAgY29uc3Qgc29ydGVkSnVkZ2VTZXR0aW5ncyA9IFsuLi5nYW1lRGF0YS5qdWRnZVNldHRpbmdzXS5zb3J0KChhLCBiKSA9PiBhLnRpbWVXaW5kb3dNcyAtIGIudGltZVdpbmRvd01zKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc29ydGVkSnVkZ2VTZXR0aW5ncykge1xyXG4gICAgICAgIGlmIChhYnNvbHV0ZVRpbWVEaWZmIDw9IHNldHRpbmcudGltZVdpbmRvd01zKSB7XHJcbiAgICAgICAgICAgIGp1ZGdtZW50ID0gc2V0dGluZztcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChpc0F1dG9NaXNzKSB7XHJcbiAgICAgICAganVkZ21lbnQgPSBnYW1lRGF0YS5qdWRnZVNldHRpbmdzLmZpbmQoaiA9PiBqLmp1ZGdtZW50ID09PSBcIk1pc3NcIik7XHJcbiAgICAgICAgaWYgKCFqdWRnbWVudCkgeyAvLyBGYWxsYmFjayBpZiBcIk1pc3NcIiBpc24ndCBleHBsaWNpdGx5IGRlZmluZWRcclxuICAgICAgICAgICAganVkZ21lbnQgPSB7IGp1ZGdtZW50OiBcIk1pc3NcIiwgY29sb3I6IFwicmVkXCIsIHRpbWVXaW5kb3dNczogSW5maW5pdHksIHNjb3JlTXVsdGlwbGllcjogMCwgaGVhbHRoQ2hhbmdlOiAtMjAgfTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGp1ZGdtZW50KSB7XHJcbiAgICAgICAgc2NvcmUgKz0gTWF0aC5mbG9vcihqdWRnbWVudC5zY29yZU11bHRpcGxpZXIgKiAoMSArIGNvbWJvIC8gMTApKTsgLy8gRXhhbXBsZSBzY29yaW5nIGxvZ2ljIHdpdGggY29tYm8gbXVsdGlwbGllclxyXG5cclxuICAgICAgICBpZiAoanVkZ21lbnQuanVkZ21lbnQgPT09IFwiTWlzc1wiIHx8IGlzQXV0b01pc3MpIHtcclxuICAgICAgICAgICAgY29tYm8gPSAwO1xyXG4gICAgICAgICAgICBwbGF5RWZmZWN0KFwibWlzc19lZmZlY3RcIik7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29tYm8rKztcclxuICAgICAgICAgICAgbWF4Q29tYm8gPSBNYXRoLm1heChtYXhDb21ibywgY29tYm8pO1xyXG4gICAgICAgICAgICBwbGF5RWZmZWN0KFwiaGl0X2VmZmVjdFwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGhlYWx0aCArPSBqdWRnbWVudC5oZWFsdGhDaGFuZ2U7XHJcbiAgICAgICAgaGVhbHRoID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oaGVhbHRoLCBjb25maWcubWF4SGVhbHRoKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGxhbmVYID0gY29uZmlnLmxhbmVTdGFydFggKyBub3RlLmxhbmUgKiAoY29uZmlnLmxhbmVXaWR0aCArIGNvbmZpZy5sYW5lU3BhY2luZyk7XHJcbiAgICAgICAganVkZ2VUZXh0cy5wdXNoKG5ldyBKdWRnZVRleHQoanVkZ21lbnQuanVkZ21lbnQsIGp1ZGdtZW50LmNvbG9yLCBsYW5lWCArIGNvbmZpZy5sYW5lV2lkdGggLyAyLCBjb25maWcuaGl0TGluZVkgLSA1MCwgY29uZmlnLmp1ZGdlVGV4dER1cmF0aW9uTXMpKTtcclxuXHJcbiAgICAgICAgY29uc3QgaGl0RWZmZWN0SW1hZ2UgPSBhc3NldENhY2hlLmltYWdlcy5nZXQoXCJoaXRfZWZmZWN0XCIpO1xyXG4gICAgICAgIGlmIChoaXRFZmZlY3RJbWFnZSkge1xyXG4gICAgICAgICAgICBoaXRFZmZlY3RzLnB1c2gobmV3IEhpdEVmZmVjdChcclxuICAgICAgICAgICAgICAgIGxhbmVYICsgKGNvbmZpZy5sYW5lV2lkdGggLSBub3RlLndpZHRoKSAvIDIsIC8vIENlbnRlcmVkIGhvcml6b250YWxseVxyXG4gICAgICAgICAgICAgICAgY29uZmlnLmhpdExpbmVZIC0gbm90ZS5oZWlnaHQgLyAyLCAvLyBDZW50ZXJlZCB2ZXJ0aWNhbGx5IG9uIHRoZSBoaXQgbGluZVxyXG4gICAgICAgICAgICAgICAgaGl0RWZmZWN0SW1hZ2UsXHJcbiAgICAgICAgICAgICAgICBjb25maWcuaGl0RWZmZWN0RHVyYXRpb25NcyxcclxuICAgICAgICAgICAgICAgIG5vdGUud2lkdGgsXHJcbiAgICAgICAgICAgICAgICBub3RlLmhlaWdodFxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUud2FybihcIk5vIGp1ZGdtZW50IGZvdW5kIGZvciB0aW1lIGRpZmZlcmVuY2U6XCIsIHRpbWVEaWZmZXJlbmNlLCBcIiAoVGhpcyBzaG91bGQgbm90IGhhcHBlbilcIik7XHJcbiAgICAgICAgLy8gRGVmYXVsdCBtaXNzIGxvZ2ljIGlmIG5vIGp1ZGdtZW50IHNldHRpbmcgbWF0Y2hlcyAoYXMgYSBmYWxsYmFjaylcclxuICAgICAgICBoZWFsdGggLT0gMTA7XHJcbiAgICAgICAgY29tYm8gPSAwO1xyXG4gICAgICAgIGhlYWx0aCA9IE1hdGgubWF4KDAsIGhlYWx0aCk7XHJcbiAgICAgICAgcGxheUVmZmVjdChcIm1pc3NfZWZmZWN0XCIpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBJbml0aWFsaXplIHRoZSBnYW1lIHdoZW4gdGhlIERPTSBpcyByZWFkeVxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgaW5pdEdhbWUpOyJdLAogICJtYXBwaW5ncyI6ICJBQTBGQSxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxXQUFBLGFBQVU7QUFDVixFQUFBQSxXQUFBLFdBQVE7QUFDUixFQUFBQSxXQUFBLGNBQVc7QUFDWCxFQUFBQSxXQUFBLGVBQVk7QUFKWCxTQUFBQTtBQUFBLEdBQUE7QUFRTCxJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFFSixJQUFJO0FBQ0osTUFBTSxhQUFhO0FBQUEsRUFDZixRQUFRLG9CQUFJLElBQThCO0FBQUEsRUFDMUMsUUFBUSxvQkFBSSxJQUF5QjtBQUN6QztBQUVBLElBQUksZUFBMEI7QUFDOUIsSUFBSSxpQkFBc0M7QUFDMUMsSUFBSSxtQkFBa0M7QUFHdEMsSUFBSSxjQUFnQztBQUNwQyxJQUFJLGFBQTJDO0FBQy9DLElBQUksd0JBQWdDO0FBQ3BDLElBQUks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
