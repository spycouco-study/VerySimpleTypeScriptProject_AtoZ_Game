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
    playBGM(bgmBuffer, soundInfo?.volume || 1);
  } else {
    console.warn(`BGM asset ${currentSong.bgmAssetName} not found.`);
  }
  currentSongTimeOffset = audioContext.currentTime;
}
function playBGM(buffer, volume) {
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
  currentBGM.loop = true;
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
  } else if (noteSpawnQueue.length === 0 && activeNotes.length === 0 && gameElapsedTime / 1e3 > currentSong.notes[currentSong.notes.length - 1].time + 3) {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gZ2FtZS50c1xyXG5cclxuLy8gLS0tIEludGVyZmFjZXMgZm9yIGRhdGEuanNvbiBzdHJ1Y3R1cmUgLS0tXHJcbmludGVyZmFjZSBJQXNzZXREYXRhIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIElJbWFnZURhdGEgZXh0ZW5kcyBJQXNzZXREYXRhIHtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIElTb3VuZERhdGEgZXh0ZW5kcyBJQXNzZXREYXRhIHtcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSUp1ZGdlVGV4dFNldHRpbmcge1xyXG4gICAganVkZ21lbnQ6IHN0cmluZztcclxuICAgIGNvbG9yOiBzdHJpbmc7XHJcbiAgICB0aW1lV2luZG93TXM6IG51bWJlcjsgLy8gTWlsbGlzZWNvbmRzIGZyb20gcGVyZmVjdCBoaXRcclxuICAgIHNjb3JlTXVsdGlwbGllcjogbnVtYmVyO1xyXG4gICAgaGVhbHRoQ2hhbmdlOiBudW1iZXI7IC8vIFBvc2l0aXZlIGZvciBoaXQsIG5lZ2F0aXZlIGZvciBtaXNzXHJcbn1cclxuXHJcbmludGVyZmFjZSBJR2FtZUNvbmZpZyB7XHJcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xyXG4gICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoaXRMaW5lWTogbnVtYmVyOyAvLyBZLWNvb3JkaW5hdGUgd2hlcmUgbm90ZXMgYXJlIGhpdCAoYm90dG9tIG9mIHRoZSBub3RlKVxyXG4gICAgbm90ZUZhbGxTcGVlZFB4UGVyTXM6IG51bWJlcjsgLy8gUGl4ZWxzIHBlciBtaWxsaXNlY29uZFxyXG4gICAgbGFuZUNvdW50OiBudW1iZXI7XHJcbiAgICBsYW5lV2lkdGg6IG51bWJlcjtcclxuICAgIGxhbmVTcGFjaW5nOiBudW1iZXI7IC8vIEdhcCBiZXR3ZWVuIGxhbmVzXHJcbiAgICBsYW5lU3RhcnRYOiBudW1iZXI7IC8vIFggcG9zaXRpb24gb2YgdGhlIGZpcnN0IGxhbmVcclxuICAgIGxhbmVLZXlzOiB7IFtrZXk6IHN0cmluZ106IG51bWJlciB9OyAvLyBNYXBzIGtleSBuYW1lIHRvIGxhbmUgaW5kZXhcclxuICAgIGRlZmF1bHROb3RlSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBoaXRFZmZlY3REdXJhdGlvbk1zOiBudW1iZXI7XHJcbiAgICBqdWRnZVRleHREdXJhdGlvbk1zOiBudW1iZXI7XHJcbiAgICBpbml0aWFsSGVhbHRoOiBudW1iZXI7XHJcbiAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgIGJhY2tncm91bmRTY3JvbGxTcGVlZFk6IG51bWJlcjtcclxuICAgIHBlcmZlY3RIaXRPZmZzZXRNczogbnVtYmVyOyAvLyBPZmZzZXQgZm9yIHBlcmZlY3QgaGl0OiBwb3NpdGl2ZSBtZWFucyBoaXQgc2xpZ2h0bHkgQUZURVIgbm90ZSBhbGlnbnMgYXQgaGl0TGluZVlcclxufVxyXG5cclxuaW50ZXJmYWNlIElUaXRsZVNjcmVlbkNvbmZpZyB7XHJcbiAgICB0aXRsZVRleHQ6IHN0cmluZztcclxuICAgIHN0YXJ0QnV0dG9uVGV4dDogc3RyaW5nO1xyXG4gICAgdGl0bGVGb250OiBzdHJpbmc7XHJcbiAgICBzdGFydEZvbnQ6IHN0cmluZztcclxuICAgIHRpdGxlQ29sb3I6IHN0cmluZztcclxuICAgIHN0YXJ0Q29sb3I6IHN0cmluZztcclxuICAgIGJhY2tncm91bmRJbWFnZU5hbWU6IHN0cmluZztcclxufVxyXG5cclxuaW50ZXJmYWNlIElHYW1lcGxheVVJQ29uZmlnIHtcclxuICAgIHNjb3JlRm9udDogc3RyaW5nO1xyXG4gICAgY29tYm9Gb250OiBzdHJpbmc7XHJcbiAgICBoZWFsdGhCYXJDb2xvcjogc3RyaW5nO1xyXG4gICAganVkZ2VUZXh0Rm9udDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSU5vdGVTcGF3bkRhdGEge1xyXG4gICAgdGltZTogbnVtYmVyOyAvLyBUaW1lIGluIHNlY29uZHMgZnJvbSBzb25nIHN0YXJ0IHdoZW4gbm90ZSBzaG91bGQgYmUgaGl0XHJcbiAgICBsYW5lOiBudW1iZXI7IC8vIExhbmUgaW5kZXhcclxuICAgIHR5cGU6IHN0cmluZzsgLy8gZS5nLiwgXCJub3JtYWxcIlxyXG59XHJcblxyXG5pbnRlcmZhY2UgSVNvbmdEYXRhIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGFydGlzdDogc3RyaW5nO1xyXG4gICAgYmdtQXNzZXROYW1lOiBzdHJpbmc7XHJcbiAgICBicG06IG51bWJlcjsgLy8gQmVhdHMgcGVyIG1pbnV0ZVxyXG4gICAgbm90ZXM6IElOb3RlU3Bhd25EYXRhW107XHJcbn1cclxuXHJcbmludGVyZmFjZSBJR2FtZURhdGEge1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJSW1hZ2VEYXRhW107XHJcbiAgICAgICAgc291bmRzOiBJU291bmREYXRhW107XHJcbiAgICB9O1xyXG4gICAgZ2FtZUNvbmZpZzogSUdhbWVDb25maWc7XHJcbiAgICB0aXRsZVNjcmVlbjogSVRpdGxlU2NyZWVuQ29uZmlnO1xyXG4gICAgZ2FtZXBsYXlVSTogSUdhbWVwbGF5VUlDb25maWc7XHJcbiAgICBqdWRnZVNldHRpbmdzOiBJSnVkZ2VUZXh0U2V0dGluZ1tdO1xyXG4gICAgbm90ZVR5cGVzOiB7IFtrZXk6IHN0cmluZ106IHsgaW1hZ2VBc3NldE5hbWU6IHN0cmluZyB9IH07IC8vIGUuZy4sIFwibm9ybWFsXCI6IHsgaW1hZ2VBc3NldE5hbWU6IFwibm90ZV9ibHVlXCIgfVxyXG4gICAgc29uZ3M6IElTb25nRGF0YVtdO1xyXG59XHJcblxyXG4vLyAtLS0gRW51bXMgLS0tXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcgPSBcIkxPQURJTkdcIixcclxuICAgIFRJVExFID0gXCJUSVRMRVwiLFxyXG4gICAgR0FNRVBMQVkgPSBcIkdBTUVQTEFZXCIsXHJcbiAgICBHQU1FX09WRVIgPSBcIkdBTUVfT1ZFUlwiLFxyXG59XHJcblxyXG4vLyAtLS0gR2xvYmFsIEdhbWUgVmFyaWFibGVzIC0tLVxyXG5sZXQgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxubGV0IGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG5sZXQgYXVkaW9Db250ZXh0OiBBdWRpb0NvbnRleHQ7XHJcblxyXG5sZXQgZ2FtZURhdGE6IElHYW1lRGF0YTtcclxuY29uc3QgYXNzZXRDYWNoZSA9IHtcclxuICAgIGltYWdlczogbmV3IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+KCksXHJcbiAgICBzb3VuZHM6IG5ldyBNYXA8c3RyaW5nLCBBdWRpb0J1ZmZlcj4oKSxcclxufTtcclxuXHJcbmxldCBjdXJyZW50U3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG5sZXQgbGFzdFVwZGF0ZVRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5sZXQgYW5pbWF0aW9uRnJhbWVJZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XHJcblxyXG4vLyBHYW1lcGxheSBzcGVjaWZpYyB2YXJpYWJsZXNcclxubGV0IGN1cnJlbnRTb25nOiBJU29uZ0RhdGEgfCBudWxsID0gbnVsbDtcclxubGV0IGN1cnJlbnRCR006IEF1ZGlvQnVmZmVyU291cmNlTm9kZSB8IG51bGwgPSBudWxsO1xyXG5sZXQgY3VycmVudFNvbmdUaW1lT2Zmc2V0OiBudW1iZXIgPSAwOyAvLyBBdWRpb0NvbnRleHQuY3VycmVudFRpbWUgd2hlbiBzb25nIHN0YXJ0ZWQgcGxheWluZ1xyXG5sZXQgZ2FtZUVsYXBzZWRUaW1lOiBudW1iZXIgPSAwOyAvLyBFbGFwc2VkIHRpbWUgc2luY2UgZ2FtZXBsYXkgc3RhcnRlZCAoaW4gbXMpLCB1c2VkIGZvciBsb2dpY1xyXG5sZXQgc2NvcmU6IG51bWJlciA9IDA7XHJcbmxldCBjb21ibzogbnVtYmVyID0gMDtcclxubGV0IG1heENvbWJvOiBudW1iZXIgPSAwO1xyXG5sZXQgaGVhbHRoOiBudW1iZXIgPSAwO1xyXG5cclxubGV0IGFjdGl2ZU5vdGVzOiBOb3RlW10gPSBbXTtcclxubGV0IG5vdGVTcGF3blF1ZXVlOiBJTm90ZVNwYXduRGF0YVtdID0gW107XHJcbmxldCBoaXRFZmZlY3RzOiBIaXRFZmZlY3RbXSA9IFtdO1xyXG5sZXQganVkZ2VUZXh0czogSnVkZ2VUZXh0W10gPSBbXTtcclxuXHJcbmxldCBiYWNrZ3JvdW5kU2Nyb2xsWTogbnVtYmVyID0gMDsgLy8gRm9yIHNjcm9sbGluZyBiYWNrZ3JvdW5kIGltYWdlXHJcblxyXG4vLyAtLS0gR2FtZSBPYmplY3QgQ2xhc3NlcyAtLS1cclxuXHJcbmNsYXNzIE5vdGUge1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7IC8vIFRvcC1sZWZ0IGNvcm5lclxyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgbGFuZTogbnVtYmVyO1xyXG4gICAgc3Bhd25UaW1lOiBudW1iZXI7IC8vIFNvbmcgdGltZSBpbiBzZWNvbmRzIHdoZW4gdGhpcyBub3RlIHNob3VsZCBiZSBoaXRcclxuICAgIGhpdDogYm9vbGVhbiA9IGZhbHNlOyAvLyBGbGFnIHRvIHByZXZlbnQgbXVsdGlwbGUgaGl0cy9taXNzZXNcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihsYW5lOiBudW1iZXIsIHNwYXduVGltZTogbnVtYmVyLCBpbWFnZTogSFRNTEltYWdlRWxlbWVudCwgZGVmYXVsdE5vdGVIZWlnaHQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMubGFuZSA9IGxhbmU7XHJcbiAgICAgICAgdGhpcy5zcGF3blRpbWUgPSBzcGF3blRpbWU7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IGltYWdlO1xyXG5cclxuICAgICAgICBjb25zdCBsYW5lQ29uZmlnID0gZ2FtZURhdGEuZ2FtZUNvbmZpZztcclxuICAgICAgICB0aGlzLndpZHRoID0gbGFuZUNvbmZpZy5sYW5lV2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBkZWZhdWx0Tm90ZUhlaWdodDtcclxuXHJcbiAgICAgICAgdGhpcy54ID0gbGFuZUNvbmZpZy5sYW5lU3RhcnRYICsgbGFuZSAqIChsYW5lQ29uZmlnLmxhbmVXaWR0aCArIGxhbmVDb25maWcubGFuZVNwYWNpbmcpO1xyXG4gICAgICAgIHRoaXMueSA9IDA7IC8vIFdpbGwgYmUgc2V0IGluIHVwZGF0ZVxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgZ2FtZUVsYXBzZWRUaW1lTXM6IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IGxhbmVDb25maWcgPSBnYW1lRGF0YS5nYW1lQ29uZmlnO1xyXG4gICAgICAgIGNvbnN0IHBlcmZlY3RIaXRHYW1lVGltZU1zID0gKHRoaXMuc3Bhd25UaW1lICogMTAwMCkgKyBsYW5lQ29uZmlnLnBlcmZlY3RIaXRPZmZzZXRNcztcclxuICAgICAgICBjb25zdCB0aW1lUmVtYWluaW5nRm9yUGVyZmVjdEhpdCA9IHBlcmZlY3RIaXRHYW1lVGltZU1zIC0gZ2FtZUVsYXBzZWRUaW1lTXM7XHJcbiAgICAgICAgY29uc3QgZGlzdGFuY2VBYm92ZUhpdExpbmUgPSB0aW1lUmVtYWluaW5nRm9yUGVyZmVjdEhpdCAqIGxhbmVDb25maWcubm90ZUZhbGxTcGVlZFB4UGVyTXM7XHJcbiAgICAgICAgdGhpcy55ID0gbGFuZUNvbmZpZy5oaXRMaW5lWSAtIGRpc3RhbmNlQWJvdmVIaXRMaW5lIC0gdGhpcy5oZWlnaHQ7IC8vIFRvcC1sZWZ0IG9mIHRoZSBub3RlXHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBIaXRFZmZlY3Qge1xyXG4gICAgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbiAgICB4OiBudW1iZXI7XHJcbiAgICB5OiBudW1iZXI7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBsaWZlVGltZTogbnVtYmVyOyAvLyBtaWxsaXNlY29uZHNcclxuICAgIG1heExpZmVUaW1lOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50LCBkdXJhdGlvbk1zOiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5pbWFnZSA9IGltYWdlO1xyXG4gICAgICAgIHRoaXMueCA9IHg7XHJcbiAgICAgICAgdGhpcy55ID0geTtcclxuICAgICAgICB0aGlzLndpZHRoID0gd2lkdGg7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5saWZlVGltZSA9IDA7XHJcbiAgICAgICAgdGhpcy5tYXhMaWZlVGltZSA9IGR1cmF0aW9uTXM7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgdGhpcy5saWZlVGltZSArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubGlmZVRpbWUgPj0gdGhpcy5tYXhMaWZlVGltZTsgLy8gdHJ1ZSBpZiBlZmZlY3QgaXMgZmluaXNoZWRcclxuICAgIH1cclxuXHJcbiAgICByZW5kZXIoY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQpIHtcclxuICAgICAgICBjb25zdCBhbHBoYSA9IDEgLSAodGhpcy5saWZlVGltZSAvIHRoaXMubWF4TGlmZVRpbWUpO1xyXG4gICAgICAgIGN0eC5zYXZlKCk7XHJcbiAgICAgICAgY3R4Lmdsb2JhbEFscGhhID0gYWxwaGE7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIGN0eC5yZXN0b3JlKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmNsYXNzIEp1ZGdlVGV4dCB7XHJcbiAgICB0ZXh0OiBzdHJpbmc7XHJcbiAgICBjb2xvcjogc3RyaW5nO1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgbGlmZVRpbWU6IG51bWJlcjsgLy8gbWlsbGlzZWNvbmRzXHJcbiAgICBtYXhMaWZlVGltZTogbnVtYmVyO1xyXG4gICAgaW5pdGlhbFk6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcih0ZXh0OiBzdHJpbmcsIGNvbG9yOiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyLCBkdXJhdGlvbk1zOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLnRleHQgPSB0ZXh0O1xyXG4gICAgICAgIHRoaXMuY29sb3IgPSBjb2xvcjtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy5pbml0aWFsWSA9IHk7XHJcbiAgICAgICAgdGhpcy5saWZlVGltZSA9IDA7XHJcbiAgICAgICAgdGhpcy5tYXhMaWZlVGltZSA9IGR1cmF0aW9uTXM7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICAgICAgdGhpcy5saWZlVGltZSArPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgLy8gRmxvYXQgdXAgYW5pbWF0aW9uXHJcbiAgICAgICAgdGhpcy55ID0gdGhpcy5pbml0aWFsWSAtICh0aGlzLmxpZmVUaW1lIC8gdGhpcy5tYXhMaWZlVGltZSkgKiAyMDsgLy8gRmxvYXQgdXAgMjBweFxyXG4gICAgICAgIHJldHVybiB0aGlzLmxpZmVUaW1lID49IHRoaXMubWF4TGlmZVRpbWU7IC8vIHRydWUgaWYgdGV4dCBpcyBmaW5pc2hlZFxyXG4gICAgfVxyXG5cclxuICAgIHJlbmRlcihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCkge1xyXG4gICAgICAgIGNvbnN0IGFscGhhID0gMSAtICh0aGlzLmxpZmVUaW1lIC8gdGhpcy5tYXhMaWZlVGltZSk7XHJcbiAgICAgICAgY3R4LnNhdmUoKTtcclxuICAgICAgICBjdHguZ2xvYmFsQWxwaGEgPSBhbHBoYTtcclxuICAgICAgICBjdHguZm9udCA9IGdhbWVEYXRhLmdhbWVwbGF5VUkuanVkZ2VUZXh0Rm9udDtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gdGhpcy5jb2xvcjtcclxuICAgICAgICBjdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgICAgICBjdHguZmlsbFRleHQodGhpcy50ZXh0LCB0aGlzLngsIHRoaXMueSk7XHJcbiAgICAgICAgY3R4LnJlc3RvcmUoKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIENvcmUgR2FtZSBGdW5jdGlvbnMgLS0tXHJcblxyXG5hc3luYyBmdW5jdGlvbiBpbml0R2FtZSgpIHtcclxuICAgIGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBpZiAoIWNhbnZhcykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDYW52YXMgZWxlbWVudCB3aXRoIElEICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuXHJcbiAgICBhdWRpb0NvbnRleHQgPSBuZXcgKHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgKHdpbmRvdyBhcyBhbnkpLndlYmtpdEF1ZGlvQ29udGV4dCkoKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IGxvYWRHYW1lRGF0YSgpO1xyXG4gICAgICAgIHJlc2l6ZUNhbnZhcygpO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCByZXNpemVDYW52YXMpO1xyXG4gICAgICAgIGF3YWl0IGxvYWRBc3NldHMoKTtcclxuICAgICAgICB0cmFuc2l0aW9uVG9TdGF0ZShHYW1lU3RhdGUuVElUTEUpO1xyXG4gICAgICAgIGFkZElucHV0TGlzdGVuZXJzKCk7XHJcbiAgICAgICAgZ2FtZUxvb3AoMCk7IC8vIFN0YXJ0IHRoZSBnYW1lIGxvb3BcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBpbml0aWFsaXplIGdhbWU6XCIsIGVycm9yKTtcclxuICAgICAgICAvLyBPcHRpb25hbGx5LCBkaXNwbGF5IGFuIGVycm9yIG1lc3NhZ2Ugb24gdGhlIGNhbnZhc1xyXG4gICAgICAgIGN0eC5jbGVhclJlY3QoMCwwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSBcInJlZFwiO1xyXG4gICAgICAgIGN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICAgICAgY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICAgICAgY3R4LmZpbGxUZXh0KFwiRXJyb3I6IFwiICsgKGVycm9yIGFzIEVycm9yKS5tZXNzYWdlLCBjYW52YXMud2lkdGgvMiwgY2FudmFzLmhlaWdodC8yKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcmVzaXplQ2FudmFzKCkge1xyXG4gICAgaWYgKCFnYW1lRGF0YSkgcmV0dXJuO1xyXG4gICAgY2FudmFzLndpZHRoID0gZ2FtZURhdGEuZ2FtZUNvbmZpZy5jYW52YXNXaWR0aDtcclxuICAgIGNhbnZhcy5oZWlnaHQgPSBnYW1lRGF0YS5nYW1lQ29uZmlnLmNhbnZhc0hlaWdodDtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbG9hZEdhbWVEYXRhKCkge1xyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBkYXRhLmpzb246ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgIH1cclxuICAgIGdhbWVEYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgY29uc29sZS5sb2coXCJHYW1lIGRhdGEgbG9hZGVkOlwiLCBnYW1lRGF0YSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRBc3NldHMoKSB7XHJcbiAgICBjb25zdCBpbWFnZVByb21pc2VzID0gZ2FtZURhdGEuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWFnZSA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgICAgICBpbWFnZS5zcmMgPSBpbWcucGF0aDtcclxuICAgICAgICAgICAgaW1hZ2Uub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgYXNzZXRDYWNoZS5pbWFnZXMuc2V0KGltZy5uYW1lLCBpbWFnZSk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltYWdlLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2ltZy5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgYXNzZXRDYWNoZS5pbWFnZXMuc2V0KGltZy5uYW1lLCBuZXcgSW1hZ2UoKSk7IC8vIFN0b3JlIGEgZHVtbXkgaW1hZ2UgdG8gcHJldmVudCBlcnJvcnMgbGF0ZXJcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gU3RpbGwgcmVzb2x2ZSB0byBsZXQgb3RoZXIgYXNzZXRzIGxvYWRcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSBnYW1lRGF0YS5hc3NldHMuc291bmRzLm1hcChzb3VuZCA9PiB7XHJcbiAgICAgICAgcmV0dXJuIGZldGNoKHNvdW5kLnBhdGgpXHJcbiAgICAgICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2UuYXJyYXlCdWZmZXIoKTtcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLnRoZW4oYXJyYXlCdWZmZXIgPT4gYXVkaW9Db250ZXh0LmRlY29kZUF1ZGlvRGF0YShhcnJheUJ1ZmZlcikpXHJcbiAgICAgICAgICAgIC50aGVuKGF1ZGlvQnVmZmVyID0+IHtcclxuICAgICAgICAgICAgICAgIGFzc2V0Q2FjaGUuc291bmRzLnNldChzb3VuZC5uYW1lLCBhdWRpb0J1ZmZlcik7XHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kLnBhdGh9YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgYXNzZXRDYWNoZS5zb3VuZHMuc2V0KHNvdW5kLm5hbWUsIGF1ZGlvQ29udGV4dC5jcmVhdGVCdWZmZXIoMSwgMSwgNDQxMDApKTsgLy8gU3RvcmUgYSBzaWxlbnQgZHVtbXkgYnVmZmVyXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0cmFuc2l0aW9uVG9TdGF0ZShuZXdTdGF0ZTogR2FtZVN0YXRlKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgVHJhbnNpdGlvbmluZyBmcm9tICR7Y3VycmVudFN0YXRlfSB0byAke25ld1N0YXRlfWApO1xyXG4gICAgY3VycmVudFN0YXRlID0gbmV3U3RhdGU7XHJcblxyXG4gICAgLy8gU3RhdGUtc3BlY2lmaWMgc2V0dXBcclxuICAgIHN3aXRjaCAobmV3U3RhdGUpIHtcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRCR00pIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRCR00uc3RvcCgpO1xyXG4gICAgICAgICAgICAgICAgY3VycmVudEJHTSA9IG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRVBMQVk6XHJcbiAgICAgICAgICAgIHN0YXJ0R2FtZXBsYXkoKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICBpZiAoY3VycmVudEJHTSkge1xyXG4gICAgICAgICAgICAgICAgY3VycmVudEJHTS5zdG9wKCk7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50QkdNID0gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc3RhcnRHYW1lcGxheSgpIHtcclxuICAgIGlmICghZ2FtZURhdGEuc29uZ3MgfHwgZ2FtZURhdGEuc29uZ3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIk5vIHNvbmdzIGRlZmluZWQgaW4gZGF0YS5qc29uIVwiKTtcclxuICAgICAgICB0cmFuc2l0aW9uVG9TdGF0ZShHYW1lU3RhdGUuVElUTEUpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjdXJyZW50U29uZyA9IGdhbWVEYXRhLnNvbmdzWzBdOyAvLyBGb3IgdGhpcyBleGFtcGxlLCBhbHdheXMgcGlja3MgdGhlIGZpcnN0IHNvbmdcclxuICAgIHNjb3JlID0gMDtcclxuICAgIGNvbWJvID0gMDtcclxuICAgIG1heENvbWJvID0gMDtcclxuICAgIGhlYWx0aCA9IGdhbWVEYXRhLmdhbWVDb25maWcuaW5pdGlhbEhlYWx0aDtcclxuICAgIGdhbWVFbGFwc2VkVGltZSA9IDA7XHJcbiAgICBhY3RpdmVOb3RlcyA9IFtdO1xyXG4gICAgaGl0RWZmZWN0cyA9IFtdO1xyXG4gICAganVkZ2VUZXh0cyA9IFtdO1xyXG4gICAgYmFja2dyb3VuZFNjcm9sbFkgPSAwO1xyXG5cclxuICAgIC8vIFBvcHVsYXRlIG5vdGUgc3Bhd24gcXVldWUsIHNvcnRlZCBieSB0aW1lXHJcbiAgICBub3RlU3Bhd25RdWV1ZSA9IFsuLi5jdXJyZW50U29uZy5ub3Rlc10uc29ydCgoYSwgYikgPT4gYS50aW1lIC0gYi50aW1lKTtcclxuXHJcbiAgICBjb25zdCBiZ21CdWZmZXIgPSBhc3NldENhY2hlLnNvdW5kcy5nZXQoY3VycmVudFNvbmcuYmdtQXNzZXROYW1lKTtcclxuICAgIGlmIChiZ21CdWZmZXIpIHtcclxuICAgICAgICBjb25zdCBzb3VuZEluZm8gPSBnYW1lRGF0YS5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09IGN1cnJlbnRTb25nIS5iZ21Bc3NldE5hbWUpO1xyXG4gICAgICAgIHBsYXlCR00oYmdtQnVmZmVyLCBzb3VuZEluZm8/LnZvbHVtZSB8fCAxLjApO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYEJHTSBhc3NldCAke2N1cnJlbnRTb25nLmJnbUFzc2V0TmFtZX0gbm90IGZvdW5kLmApO1xyXG4gICAgfVxyXG5cclxuICAgIGN1cnJlbnRTb25nVGltZU9mZnNldCA9IGF1ZGlvQ29udGV4dC5jdXJyZW50VGltZTtcclxufVxyXG5cclxuZnVuY3Rpb24gcGxheUJHTShidWZmZXI6IEF1ZGlvQnVmZmVyLCB2b2x1bWU6IG51bWJlcikge1xyXG4gICAgaWYgKGN1cnJlbnRCR00pIHtcclxuICAgICAgICBjdXJyZW50QkdNLnN0b3AoKTtcclxuICAgICAgICBjdXJyZW50QkdNID0gbnVsbDtcclxuICAgIH1cclxuICAgIGN1cnJlbnRCR00gPSBhdWRpb0NvbnRleHQuY3JlYXRlQnVmZmVyU291cmNlKCk7XHJcbiAgICBjdXJyZW50QkdNLmJ1ZmZlciA9IGJ1ZmZlcjtcclxuXHJcbiAgICBjb25zdCBnYWluTm9kZSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XHJcbiAgICBnYWluTm9kZS5nYWluLnZhbHVlID0gdm9sdW1lO1xyXG4gICAgY3VycmVudEJHTS5jb25uZWN0KGdhaW5Ob2RlKTtcclxuICAgIGdhaW5Ob2RlLmNvbm5lY3QoYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuXHJcbiAgICBjdXJyZW50QkdNLmxvb3AgPSB0cnVlO1xyXG4gICAgY3VycmVudEJHTS5zdGFydCgwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcGxheUVmZmVjdChhc3NldE5hbWU6IHN0cmluZykge1xyXG4gICAgY29uc3QgZWZmZWN0QnVmZmVyID0gYXNzZXRDYWNoZS5zb3VuZHMuZ2V0KGFzc2V0TmFtZSk7XHJcbiAgICBpZiAoZWZmZWN0QnVmZmVyKSB7XHJcbiAgICAgICAgY29uc3Qgc291cmNlID0gYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgIHNvdXJjZS5idWZmZXIgPSBlZmZlY3RCdWZmZXI7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kRGF0YSA9IGdhbWVEYXRhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gYXNzZXROYW1lKTtcclxuICAgICAgICBjb25zdCB2b2x1bWUgPSBzb3VuZERhdGEgPyBzb3VuZERhdGEudm9sdW1lIDogMS4wO1xyXG5cclxuICAgICAgICBjb25zdCBnYWluTm9kZSA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XHJcbiAgICAgICAgZ2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcclxuICAgICAgICBzb3VyY2UuY29ubmVjdChnYWluTm9kZSk7XHJcbiAgICAgICAgZ2Fpbk5vZGUuY29ubmVjdChhdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG5cclxuICAgICAgICBzb3VyY2Uuc3RhcnQoMCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUud2FybihgRWZmZWN0IGFzc2V0ICR7YXNzZXROYW1lfSBub3QgZm91bmQuYCk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBnYW1lTG9vcCh0aW1lc3RhbXA6IERPTUhpZ2hSZXNUaW1lU3RhbXApIHtcclxuICAgIGlmICghbGFzdFVwZGF0ZVRpbWUpIHtcclxuICAgICAgICBsYXN0VXBkYXRlVGltZSA9IHRpbWVzdGFtcDtcclxuICAgIH1cclxuICAgIGNvbnN0IGRlbHRhVGltZSA9IHRpbWVzdGFtcCAtIGxhc3RVcGRhdGVUaW1lOyAvLyBpbiBtaWxsaXNlY29uZHNcclxuICAgIGxhc3RVcGRhdGVUaW1lID0gdGltZXN0YW1wO1xyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgcmVuZGVyKCk7XHJcblxyXG4gICAgYW5pbWF0aW9uRnJhbWVJZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShnYW1lTG9vcCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5MT0FESU5HOlxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRVBMQVk6XHJcbiAgICAgICAgICAgIHVwZGF0ZUdhbWVwbGF5KGRlbHRhVGltZSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZUdhbWVwbGF5KGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICBpZiAoIWN1cnJlbnRTb25nIHx8ICFnYW1lRGF0YSkgcmV0dXJuO1xyXG5cclxuICAgIGdhbWVFbGFwc2VkVGltZSArPSBkZWx0YVRpbWU7XHJcblxyXG4gICAgY29uc3QgY29uZmlnID0gZ2FtZURhdGEuZ2FtZUNvbmZpZztcclxuICAgIGNvbnN0IHNvbmdUaW1lU2Vjb25kcyA9IGdhbWVFbGFwc2VkVGltZSAvIDEwMDA7XHJcblxyXG4gICAgLy8gLS0tIFNwYXduIE5vdGVzIC0tLVxyXG4gICAgY29uc3QgdGltZVRvRmFsbEZyb21Ub3BUb0hpdExpbmVNcyA9IChjYW52YXMuaGVpZ2h0IC8gY29uZmlnLm5vdGVGYWxsU3BlZWRQeFBlck1zKTtcclxuICAgIGNvbnN0IGVhcmxpZXN0U3Bhd25UaW1lRm9yVmlzaWJsZU5vdGUgPSBzb25nVGltZVNlY29uZHMgLSAodGltZVRvRmFsbEZyb21Ub3BUb0hpdExpbmVNcyAvIDEwMDApO1xyXG5cclxuICAgIHdoaWxlIChub3RlU3Bhd25RdWV1ZS5sZW5ndGggPiAwICYmIG5vdGVTcGF3blF1ZXVlWzBdLnRpbWUgPD0gZWFybGllc3RTcGF3blRpbWVGb3JWaXNpYmxlTm90ZSArIDAuMSkgeyAvLyBBZGQgYSBzbWFsbCBidWZmZXIgZm9yIHNwYXduXHJcbiAgICAgICAgY29uc3Qgbm90ZURhdGEgPSBub3RlU3Bhd25RdWV1ZS5zaGlmdCgpITtcclxuICAgICAgICBjb25zdCBub3RlVHlwZSA9IGdhbWVEYXRhLm5vdGVUeXBlc1tub3RlRGF0YS50eXBlXTtcclxuICAgICAgICBpZiAoIW5vdGVUeXBlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgTm90ZSB0eXBlICR7bm90ZURhdGEudHlwZX0gbm90IGZvdW5kIGluIG5vdGVUeXBlcy5gKTtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IG5vdGVJbWFnZSA9IGFzc2V0Q2FjaGUuaW1hZ2VzLmdldChub3RlVHlwZS5pbWFnZUFzc2V0TmFtZSk7XHJcbiAgICAgICAgaWYgKG5vdGVJbWFnZSkge1xyXG4gICAgICAgICAgICBhY3RpdmVOb3Rlcy5wdXNoKG5ldyBOb3RlKG5vdGVEYXRhLmxhbmUsIG5vdGVEYXRhLnRpbWUsIG5vdGVJbWFnZSwgY29uZmlnLmRlZmF1bHROb3RlSGVpZ2h0KSk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBOb3RlIGltYWdlIGZvciBhc3NldCAke25vdGVUeXBlLmltYWdlQXNzZXROYW1lfSBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLSBVcGRhdGUgTm90ZXMgJiBDaGVjayBmb3IgTWlzc2VzIC0tLVxyXG4gICAgZm9yIChsZXQgaSA9IGFjdGl2ZU5vdGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgY29uc3Qgbm90ZSA9IGFjdGl2ZU5vdGVzW2ldO1xyXG4gICAgICAgIGlmIChub3RlLmhpdCkgY29udGludWU7XHJcblxyXG4gICAgICAgIG5vdGUudXBkYXRlKGRlbHRhVGltZSwgZ2FtZUVsYXBzZWRUaW1lKTtcclxuXHJcbiAgICAgICAgY29uc3QgcGVyZmVjdEhpdEdhbWVUaW1lTXMgPSAobm90ZS5zcGF3blRpbWUgKiAxMDAwKSArIGNvbmZpZy5wZXJmZWN0SGl0T2Zmc2V0TXM7XHJcbiAgICAgICAgY29uc3QgdGltZURpZmZGcm9tUGVyZmVjdE1zID0gZ2FtZUVsYXBzZWRUaW1lIC0gcGVyZmVjdEhpdEdhbWVUaW1lTXM7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgdGhlIHdpZGVzdCAnTWlzcycgd2luZG93IHRvIGRldGVybWluZSB3aGVuIGEgbm90ZSBpcyBmdWxseSBwYXN0IGl0cyBoaXQgb3Bwb3J0dW5pdHlcclxuICAgICAgICBjb25zdCBtaXNzU2V0dGluZyA9IGdhbWVEYXRhLmp1ZGdlU2V0dGluZ3MuZmluZChqID0+IGouanVkZ21lbnQgPT09IFwiTWlzc1wiKTtcclxuICAgICAgICBjb25zdCBtaXNzV2luZG93RW5kID0gbWlzc1NldHRpbmcgPyBtaXNzU2V0dGluZy50aW1lV2luZG93TXMgOiBJbmZpbml0eTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIG5vdGUgaGFzIHBhc3NlZCBpdHMgcGVyZmVjdCBoaXQgdGltZSArIG1pc3Mgd2luZG93LCBpdCdzIGFuIGF1dG8tbWlzc1xyXG4gICAgICAgIGlmICh0aW1lRGlmZkZyb21QZXJmZWN0TXMgPiBtaXNzV2luZG93RW5kICYmICFub3RlLmhpdCkge1xyXG4gICAgICAgICAgICBwcm9jZXNzSGl0KG5vdGUsIHRpbWVEaWZmRnJvbVBlcmZlY3RNcywgdHJ1ZSk7IC8vIHRydWUgZm9yIGF1dG8tbWlzc1xyXG4gICAgICAgICAgICBhY3RpdmVOb3Rlcy5zcGxpY2UoaSwgMSk7IC8vIFJlbW92ZSB0aGUgbm90ZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIFJlbW92ZSBub3RlcyB0aGF0IGhhdmUgYmVlbiBoaXRcclxuICAgIGFjdGl2ZU5vdGVzID0gYWN0aXZlTm90ZXMuZmlsdGVyKG5vdGUgPT4gIW5vdGUuaGl0KTtcclxuXHJcbiAgICAvLyAtLS0gVXBkYXRlIEhpdCBFZmZlY3RzIC0tLVxyXG4gICAgZm9yIChsZXQgaSA9IGhpdEVmZmVjdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICBpZiAoaGl0RWZmZWN0c1tpXS51cGRhdGUoZGVsdGFUaW1lKSkge1xyXG4gICAgICAgICAgICBoaXRFZmZlY3RzLnNwbGljZShpLCAxKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gLS0tIFVwZGF0ZSBKdWRnZSBUZXh0cyAtLS1cclxuICAgIGZvciAobGV0IGkgPSBqdWRnZVRleHRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgaWYgKGp1ZGdlVGV4dHNbaV0udXBkYXRlKGRlbHRhVGltZSkpIHtcclxuICAgICAgICAgICAganVkZ2VUZXh0cy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLSBVcGRhdGUgQmFja2dyb3VuZCBTY3JvbGwgLS0tXHJcbiAgICBjb25zdCBiZ0ltYWdlID0gYXNzZXRDYWNoZS5pbWFnZXMuZ2V0KGdhbWVEYXRhLnRpdGxlU2NyZWVuLmJhY2tncm91bmRJbWFnZU5hbWUpO1xyXG4gICAgaWYgKGJnSW1hZ2UpIHtcclxuICAgICAgICBiYWNrZ3JvdW5kU2Nyb2xsWSA9IChiYWNrZ3JvdW5kU2Nyb2xsWSArIGNvbmZpZy5iYWNrZ3JvdW5kU2Nyb2xsU3BlZWRZICogZGVsdGFUaW1lKSAlIGJnSW1hZ2UuaGVpZ2h0O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLSBDaGVjayBHYW1lIE92ZXIgQ29uZGl0aW9uIC0tLVxyXG4gICAgaWYgKGhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgdHJhbnNpdGlvblRvU3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUik7XHJcbiAgICB9IGVsc2UgaWYgKG5vdGVTcGF3blF1ZXVlLmxlbmd0aCA9PT0gMCAmJiBhY3RpdmVOb3Rlcy5sZW5ndGggPT09IDAgJiYgZ2FtZUVsYXBzZWRUaW1lIC8gMTAwMCA+IGN1cnJlbnRTb25nLm5vdGVzW2N1cnJlbnRTb25nLm5vdGVzLmxlbmd0aCAtIDFdLnRpbWUgKyAzKSB7XHJcbiAgICAgICAgLy8gQWxsIG5vdGVzIHNwYXduZWQgYW5kIHByb2Nlc3NlZCwgYW5kIGEgYnVmZmVyIHRpbWUgaGFzIHBhc3NlZCBhZnRlciB0aGUgbGFzdCBub3RlXHJcbiAgICAgICAgdHJhbnNpdGlvblRvU3RhdGUoR2FtZVN0YXRlLkdBTUVfT1ZFUik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlcigpIHtcclxuICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICBzd2l0Y2ggKGN1cnJlbnRTdGF0ZSkge1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkxPQURJTkc6XHJcbiAgICAgICAgICAgIGRyYXdMb2FkaW5nU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICBkcmF3VGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRVBMQVk6XHJcbiAgICAgICAgICAgIGRyYXdHYW1lcGxheSgpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgIGRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0xvYWRpbmdTY3JlZW4oKSB7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gXCIjMWExYTFhXCI7XHJcbiAgICBjdHguZmlsbFJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgIGN0eC5mb250ID0gXCIzMHB4IEFyaWFsXCI7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gXCIjZmZmZmZmXCI7XHJcbiAgICBjdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgIGN0eC5maWxsVGV4dChcIkxvYWRpbmcgQXNzZXRzLi4uXCIsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd1RpdGxlU2NyZWVuKCkge1xyXG4gICAgY29uc3QgdGl0bGVDb25maWcgPSBnYW1lRGF0YS50aXRsZVNjcmVlbjtcclxuICAgIGNvbnN0IGJhY2tncm91bmQgPSBhc3NldENhY2hlLmltYWdlcy5nZXQodGl0bGVDb25maWcuYmFja2dyb3VuZEltYWdlTmFtZSk7XHJcbiAgICBpZiAoYmFja2dyb3VuZCkge1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoYmFja2dyb3VuZCwgMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IFwiIzMzM1wiO1xyXG4gICAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIGN0eC5mb250ID0gdGl0bGVDb25maWcudGl0bGVGb250O1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9IHRpdGxlQ29uZmlnLnRpdGxlQ29sb3I7XHJcbiAgICBjdHgudGV4dEFsaWduID0gXCJjZW50ZXJcIjtcclxuICAgIGN0eC5maWxsVGV4dCh0aXRsZUNvbmZpZy50aXRsZVRleHQsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG5cclxuICAgIGN0eC5mb250ID0gdGl0bGVDb25maWcuc3RhcnRGb250O1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9IHRpdGxlQ29uZmlnLnN0YXJ0Q29sb3I7XHJcbiAgICBjdHguZmlsbFRleHQodGl0bGVDb25maWcuc3RhcnRCdXR0b25UZXh0LCBjYW52YXMud2lkdGggLyAyLCBjYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0dhbWVwbGF5KCkge1xyXG4gICAgY29uc3QgY29uZmlnID0gZ2FtZURhdGEuZ2FtZUNvbmZpZztcclxuXHJcbiAgICAvLyBEcmF3IHNjcm9sbGluZyBiYWNrZ3JvdW5kXHJcbiAgICBjb25zdCBiZ0ltYWdlID0gYXNzZXRDYWNoZS5pbWFnZXMuZ2V0KGdhbWVEYXRhLnRpdGxlU2NyZWVuLmJhY2tncm91bmRJbWFnZU5hbWUpO1xyXG4gICAgaWYgKGJnSW1hZ2UpIHtcclxuICAgICAgICBjb25zdCBpbWdIZWlnaHQgPSBiZ0ltYWdlLmhlaWdodDtcclxuICAgICAgICBsZXQgY3VycmVudFkgPSBiYWNrZ3JvdW5kU2Nyb2xsWTtcclxuICAgICAgICB3aGlsZSAoY3VycmVudFkgPCBjYW52YXMuaGVpZ2h0KSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoYmdJbWFnZSwgMCwgY3VycmVudFksIGNhbnZhcy53aWR0aCwgaW1nSGVpZ2h0KTtcclxuICAgICAgICAgICAgY3VycmVudFkgKz0gaW1nSGVpZ2h0O1xyXG4gICAgICAgIH1cclxuICAgICAgICBjdXJyZW50WSA9IGJhY2tncm91bmRTY3JvbGxZIC0gaW1nSGVpZ2h0O1xyXG4gICAgICAgIHdoaWxlIChjdXJyZW50WSA8IGNhbnZhcy5oZWlnaHQpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShiZ0ltYWdlLCAwLCBjdXJyZW50WSwgY2FudmFzLndpZHRoLCBpbWdIZWlnaHQpO1xyXG4gICAgICAgICAgICBjdXJyZW50WSArPSBpbWdIZWlnaHQ7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCIjMDAwXCI7XHJcbiAgICAgICAgY3R4LmZpbGxSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhdyBMYW5lc1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb25maWcubGFuZUNvdW50OyBpKyspIHtcclxuICAgICAgICBjb25zdCBsYW5lWCA9IGNvbmZpZy5sYW5lU3RhcnRYICsgaSAqIChjb25maWcubGFuZVdpZHRoICsgY29uZmlnLmxhbmVTcGFjaW5nKTtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gXCJyZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMSlcIjtcclxuICAgICAgICBjdHguZmlsbFJlY3QobGFuZVgsIDAsIGNvbmZpZy5sYW5lV2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERyYXcgTm90ZXNcclxuICAgIGZvciAoY29uc3Qgbm90ZSBvZiBhY3RpdmVOb3Rlcykge1xyXG4gICAgICAgIG5vdGUucmVuZGVyKGN0eCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhdyBIaXQgRWZmZWN0c1xyXG4gICAgZm9yIChjb25zdCBlZmZlY3Qgb2YgaGl0RWZmZWN0cykge1xyXG4gICAgICAgIGVmZmVjdC5yZW5kZXIoY3R4KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEcmF3IEhpdCBMaW5lXHJcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBcInJnYmEoMjU1LCAyNTUsIDAsIDAuOClcIjtcclxuICAgIGN0eC5saW5lV2lkdGggPSAzO1xyXG4gICAgY3R4LmJlZ2luUGF0aCgpO1xyXG4gICAgY3R4Lm1vdmVUbygwLCBjb25maWcuaGl0TGluZVkpO1xyXG4gICAgY3R4LmxpbmVUbyhjYW52YXMud2lkdGgsIGNvbmZpZy5oaXRMaW5lWSk7XHJcbiAgICBjdHguc3Ryb2tlKCk7XHJcblxyXG4gICAgLy8gRHJhdyBKdWRnZSBUZXh0c1xyXG4gICAgZm9yIChjb25zdCB0ZXh0IG9mIGp1ZGdlVGV4dHMpIHtcclxuICAgICAgICB0ZXh0LnJlbmRlcihjdHgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERyYXcgVUkgKFNjb3JlLCBDb21ibywgSGVhbHRoKVxyXG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcclxuICAgIGN0eC50ZXh0QWxpZ24gPSBcImxlZnRcIjtcclxuICAgIGN0eC5mb250ID0gZ2FtZURhdGEuZ2FtZXBsYXlVSS5zY29yZUZvbnQ7XHJcbiAgICBjdHguZmlsbFRleHQoYFNjb3JlOiAke3Njb3JlfWAsIDIwLCA0MCk7XHJcblxyXG4gICAgY3R4LnRleHRBbGlnbiA9IFwiY2VudGVyXCI7XHJcbiAgICBjdHguZm9udCA9IGdhbWVEYXRhLmdhbWVwbGF5VUkuY29tYm9Gb250O1xyXG4gICAgaWYgKGNvbWJvID4gMCkge1xyXG4gICAgICAgIGN0eC5maWxsVGV4dChgQ29tYm86ICR7Y29tYm99YCwgY2FudmFzLndpZHRoIC8gMiwgODApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEhlYWx0aCBCYXJcclxuICAgIGNvbnN0IGhlYWx0aEJhcldpZHRoID0gMjAwO1xyXG4gICAgY29uc3QgaGVhbHRoQmFySGVpZ2h0ID0gMjA7XHJcbiAgICBjb25zdCBoZWFsdGhCYXJYID0gY2FudmFzLndpZHRoIC0gaGVhbHRoQmFyV2lkdGggLSAyMDtcclxuICAgIGNvbnN0IGhlYWx0aEJhclkgPSAyMDtcclxuXHJcbiAgICBjdHguZmlsbFN0eWxlID0gXCJncmF5XCI7XHJcbiAgICBjdHguZmlsbFJlY3QoaGVhbHRoQmFyWCwgaGVhbHRoQmFyWSwgaGVhbHRoQmFyV2lkdGgsIGhlYWx0aEJhckhlaWdodCk7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gZ2FtZURhdGEuZ2FtZXBsYXlVSS5oZWFsdGhCYXJDb2xvcjtcclxuICAgIGNvbnN0IGN1cnJlbnRIZWFsdGhXaWR0aCA9IChoZWFsdGggLyBnYW1lRGF0YS5nYW1lQ29uZmlnLm1heEhlYWx0aCkgKiBoZWFsdGhCYXJXaWR0aDtcclxuICAgIGN0eC5maWxsUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBNYXRoLm1heCgwLCBjdXJyZW50SGVhbHRoV2lkdGgpLCBoZWFsdGhCYXJIZWlnaHQpO1xyXG4gICAgY3R4LnN0cm9rZVN0eWxlID0gXCJ3aGl0ZVwiO1xyXG4gICAgY3R4LmxpbmVXaWR0aCA9IDE7XHJcbiAgICBjdHguc3Ryb2tlUmVjdChoZWFsdGhCYXJYLCBoZWFsdGhCYXJZLCBoZWFsdGhCYXJXaWR0aCwgaGVhbHRoQmFySGVpZ2h0KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0dhbWVPdmVyU2NyZWVuKCkge1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9IFwicmdiYSgwLCAwLCAwLCAwLjcpXCI7XHJcbiAgICBjdHguZmlsbFJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuXHJcbiAgICBjdHguZm9udCA9IFwiNjBweCBBcmlhbFwiO1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9IFwid2hpdGVcIjtcclxuICAgIGN0eC50ZXh0QWxpZ24gPSBcImNlbnRlclwiO1xyXG4gICAgY3R4LmZpbGxUZXh0KFwiR2FtZSBPdmVyXCIsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyIC0gMTAwKTtcclxuXHJcbiAgICBjdHguZm9udCA9IFwiMzBweCBBcmlhbFwiO1xyXG4gICAgY3R4LmZpbGxUZXh0KGBGaW5hbCBTY29yZTogJHtzY29yZX1gLCBjYW52YXMud2lkdGggLyAyLCBjYW52YXMuaGVpZ2h0IC8gMik7XHJcbiAgICBjdHguZmlsbFRleHQoYE1heCBDb21ibzogJHttYXhDb21ib31gLCBjYW52YXMud2lkdGggLyAyLCBjYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgIGN0eC5maWxsVGV4dChcIlByZXNzIFIgdG8gUmVzdGFydCBvciBFc2MgZm9yIFRpdGxlXCIsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyICsgMTUwKTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGFkZElucHV0TGlzdGVuZXJzKCkge1xyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVLZXlEb3duKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaGFuZGxlS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgaWYgKGV2ZW50LnJlcGVhdCkgcmV0dXJuOyAvLyBJZ25vcmUga2V5IHJlcGVhdFxyXG5cclxuICAgIHN3aXRjaCAoY3VycmVudFN0YXRlKSB7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIHRyYW5zaXRpb25Ub1N0YXRlKEdhbWVTdGF0ZS5HQU1FUExBWSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVQTEFZOlxyXG4gICAgICAgICAgICBoYW5kbGVHYW1lcGxheUlucHV0KGV2ZW50LmtleSk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpID09PSAncicpIHtcclxuICAgICAgICAgICAgICAgIHRyYW5zaXRpb25Ub1N0YXRlKEdhbWVTdGF0ZS5HQU1FUExBWSk7IC8vIFJlc3RhcnQgY3VycmVudCBzb25nXHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5ID09PSAnRXNjYXBlJykge1xyXG4gICAgICAgICAgICAgICAgdHJhbnNpdGlvblRvU3RhdGUoR2FtZVN0YXRlLlRJVExFKTsgLy8gR28gdG8gdGl0bGVcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaGFuZGxlR2FtZXBsYXlJbnB1dChrZXk6IHN0cmluZykge1xyXG4gICAgY29uc3QgY29uZmlnID0gZ2FtZURhdGEuZ2FtZUNvbmZpZztcclxuICAgIGNvbnN0IGxhbmVJbmRleCA9IGNvbmZpZy5sYW5lS2V5c1trZXkudG9Mb3dlckNhc2UoKV07XHJcblxyXG4gICAgaWYgKGxhbmVJbmRleCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgLy8gTm90IGEgcmVjb2duaXplZCBnYW1lIGtleVxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgaGl0Tm90ZTogTm90ZSB8IG51bGwgPSBudWxsO1xyXG4gICAgbGV0IGNsb3Nlc3RUaW1lRGlmZkFic29sdXRlID0gSW5maW5pdHk7IC8vIEFic29sdXRlIHRpbWUgZGlmZmVyZW5jZSBmcm9tIHBlcmZlY3QgaGl0IChtcylcclxuICAgIGxldCBwZXJmZWN0SGl0R2FtZVRpbWVNcyA9IDA7XHJcblxyXG4gICAgLy8gU29ydCBqdWRnZSBzZXR0aW5ncyBieSB0aW1lV2luZG93TXMgaW4gYXNjZW5kaW5nIG9yZGVyIHRvIGZpbmQgdGhlIHdpZGVzdCBtaXNzIHdpbmRvd1xyXG4gICAgY29uc3QgbWlzc1NldHRpbmcgPSBnYW1lRGF0YS5qdWRnZVNldHRpbmdzLmZpbmQoaiA9PiBqLmp1ZGdtZW50ID09PSBcIk1pc3NcIik7XHJcbiAgICBjb25zdCBtYXhKdWRnZVdpbmRvdyA9IG1pc3NTZXR0aW5nID8gbWlzc1NldHRpbmcudGltZVdpbmRvd01zIDogMDsgLy8gVGhlIHdpZGVzdCB3aW5kb3cgZm9yIGFueSBqdWRnbWVudFxyXG5cclxuICAgIGZvciAoY29uc3Qgbm90ZSBvZiBhY3RpdmVOb3Rlcykge1xyXG4gICAgICAgIGlmIChub3RlLmxhbmUgPT09IGxhbmVJbmRleCAmJiAhbm90ZS5oaXQpIHtcclxuICAgICAgICAgICAgY29uc3Qgbm90ZVBlcmZlY3RIaXRHYW1lVGltZU1zID0gKG5vdGUuc3Bhd25UaW1lICogMTAwMCkgKyBjb25maWcucGVyZmVjdEhpdE9mZnNldE1zO1xyXG4gICAgICAgICAgICBjb25zdCB0aW1lRGlmZiA9IGdhbWVFbGFwc2VkVGltZSAtIG5vdGVQZXJmZWN0SGl0R2FtZVRpbWVNcztcclxuICAgICAgICAgICAgY29uc3QgYWJzb2x1dGVUaW1lRGlmZiA9IE1hdGguYWJzKHRpbWVEaWZmKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE9ubHkgY29uc2lkZXIgbm90ZXMgd2l0aGluIHRoZSBtYXhpbXVtIGp1ZGdtZW50IHdpbmRvd1xyXG4gICAgICAgICAgICBpZiAoYWJzb2x1dGVUaW1lRGlmZiA8PSBtYXhKdWRnZVdpbmRvdyAmJiBhYnNvbHV0ZVRpbWVEaWZmIDwgY2xvc2VzdFRpbWVEaWZmQWJzb2x1dGUpIHtcclxuICAgICAgICAgICAgICAgIGNsb3Nlc3RUaW1lRGlmZkFic29sdXRlID0gYWJzb2x1dGVUaW1lRGlmZjtcclxuICAgICAgICAgICAgICAgIGhpdE5vdGUgPSBub3RlO1xyXG4gICAgICAgICAgICAgICAgcGVyZmVjdEhpdEdhbWVUaW1lTXMgPSBub3RlUGVyZmVjdEhpdEdhbWVUaW1lTXM7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGhpdE5vdGUpIHtcclxuICAgICAgICBwcm9jZXNzSGl0KGhpdE5vdGUsIGdhbWVFbGFwc2VkVGltZSAtIHBlcmZlY3RIaXRHYW1lVGltZU1zLCBmYWxzZSk7IC8vIGZhbHNlIGZvciBwbGF5ZXIgaGl0XHJcbiAgICAgICAgaGl0Tm90ZS5oaXQgPSB0cnVlOyAvLyBNYXJrIGFzIGhpdCBmb3IgcmVtb3ZhbFxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBObyBub3RlIGhpdCBpbiB0aGlzIGxhbmUgd2l0aGluIHRoZSB3aW5kb3cgb3Igbm8gbm90ZSBhdCBhbGxcclxuICAgICAgICAvLyBUcmVhdCBhcyBhIFwiQmFkIFByZXNzXCJcclxuICAgICAgICBjb25zdCBtaXNzUGVuYWx0eSA9IGdhbWVEYXRhLmp1ZGdlU2V0dGluZ3MuZmluZChqID0+IGouanVkZ21lbnQgPT09IFwiTWlzc1wiKT8uaGVhbHRoQ2hhbmdlIHx8IC0xMDtcclxuICAgICAgICBoZWFsdGggKz0gbWlzc1BlbmFsdHk7XHJcbiAgICAgICAgaGVhbHRoID0gTWF0aC5tYXgoMCwgaGVhbHRoKTtcclxuICAgICAgICBjb21ibyA9IDA7XHJcbiAgICAgICAgcGxheUVmZmVjdChcIm1pc3NfZWZmZWN0XCIpOyAvLyBQbGF5IG1pc3Mgc291bmQgZm9yIGJhZCBwcmVzc1xyXG5cclxuICAgICAgICBjb25zdCBsYW5lWCA9IGNvbmZpZy5sYW5lU3RhcnRYICsgbGFuZUluZGV4ICogKGNvbmZpZy5sYW5lV2lkdGggKyBjb25maWcubGFuZVNwYWNpbmcpO1xyXG4gICAgICAgIGp1ZGdlVGV4dHMucHVzaChuZXcgSnVkZ2VUZXh0KFwiQmFkIFByZXNzXCIsIFwiZ3JleVwiLCBsYW5lWCArIGNvbmZpZy5sYW5lV2lkdGggLyAyLCBjb25maWcuaGl0TGluZVkgLSA1MCwgZ2FtZURhdGEuZ2FtZUNvbmZpZy5qdWRnZVRleHREdXJhdGlvbk1zKSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHByb2Nlc3NIaXQobm90ZTogTm90ZSwgdGltZURpZmZlcmVuY2U6IG51bWJlciwgaXNBdXRvTWlzczogYm9vbGVhbikge1xyXG4gICAgY29uc3QgY29uZmlnID0gZ2FtZURhdGEuZ2FtZUNvbmZpZztcclxuICAgIGxldCBqdWRnbWVudDogSUp1ZGdlVGV4dFNldHRpbmcgfCB1bmRlZmluZWQ7XHJcbiAgICBsZXQgYWJzb2x1dGVUaW1lRGlmZiA9IE1hdGguYWJzKHRpbWVEaWZmZXJlbmNlKTtcclxuXHJcbiAgICAvLyBGaW5kIHRoZSBqdWRnbWVudCBiYXNlZCBvbiB0aW1lIGRpZmZlcmVuY2UsIGZyb20gbmFycm93ZXN0IHRvIHdpZGVzdCB3aW5kb3dcclxuICAgIGNvbnN0IHNvcnRlZEp1ZGdlU2V0dGluZ3MgPSBbLi4uZ2FtZURhdGEuanVkZ2VTZXR0aW5nc10uc29ydCgoYSwgYikgPT4gYS50aW1lV2luZG93TXMgLSBiLnRpbWVXaW5kb3dNcyk7XHJcblxyXG4gICAgZm9yIChjb25zdCBzZXR0aW5nIG9mIHNvcnRlZEp1ZGdlU2V0dGluZ3MpIHtcclxuICAgICAgICBpZiAoYWJzb2x1dGVUaW1lRGlmZiA8PSBzZXR0aW5nLnRpbWVXaW5kb3dNcykge1xyXG4gICAgICAgICAgICBqdWRnbWVudCA9IHNldHRpbmc7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoaXNBdXRvTWlzcykge1xyXG4gICAgICAgIGp1ZGdtZW50ID0gZ2FtZURhdGEuanVkZ2VTZXR0aW5ncy5maW5kKGogPT4gai5qdWRnbWVudCA9PT0gXCJNaXNzXCIpO1xyXG4gICAgICAgIGlmICghanVkZ21lbnQpIHsgLy8gRmFsbGJhY2sgaWYgXCJNaXNzXCIgaXNuJ3QgZXhwbGljaXRseSBkZWZpbmVkXHJcbiAgICAgICAgICAgIGp1ZGdtZW50ID0geyBqdWRnbWVudDogXCJNaXNzXCIsIGNvbG9yOiBcInJlZFwiLCB0aW1lV2luZG93TXM6IEluZmluaXR5LCBzY29yZU11bHRpcGxpZXI6IDAsIGhlYWx0aENoYW5nZTogLTIwIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChqdWRnbWVudCkge1xyXG4gICAgICAgIHNjb3JlICs9IE1hdGguZmxvb3IoanVkZ21lbnQuc2NvcmVNdWx0aXBsaWVyICogKDEgKyBjb21ibyAvIDEwKSk7IC8vIEV4YW1wbGUgc2NvcmluZyBsb2dpYyB3aXRoIGNvbWJvIG11bHRpcGxpZXJcclxuXHJcbiAgICAgICAgaWYgKGp1ZGdtZW50Lmp1ZGdtZW50ID09PSBcIk1pc3NcIiB8fCBpc0F1dG9NaXNzKSB7XHJcbiAgICAgICAgICAgIGNvbWJvID0gMDtcclxuICAgICAgICAgICAgcGxheUVmZmVjdChcIm1pc3NfZWZmZWN0XCIpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbWJvKys7XHJcbiAgICAgICAgICAgIG1heENvbWJvID0gTWF0aC5tYXgobWF4Q29tYm8sIGNvbWJvKTtcclxuICAgICAgICAgICAgcGxheUVmZmVjdChcImhpdF9lZmZlY3RcIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBoZWFsdGggKz0ganVkZ21lbnQuaGVhbHRoQ2hhbmdlO1xyXG4gICAgICAgIGhlYWx0aCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGhlYWx0aCwgY29uZmlnLm1heEhlYWx0aCkpO1xyXG5cclxuICAgICAgICBjb25zdCBsYW5lWCA9IGNvbmZpZy5sYW5lU3RhcnRYICsgbm90ZS5sYW5lICogKGNvbmZpZy5sYW5lV2lkdGggKyBjb25maWcubGFuZVNwYWNpbmcpO1xyXG4gICAgICAgIGp1ZGdlVGV4dHMucHVzaChuZXcgSnVkZ2VUZXh0KGp1ZGdtZW50Lmp1ZGdtZW50LCBqdWRnbWVudC5jb2xvciwgbGFuZVggKyBjb25maWcubGFuZVdpZHRoIC8gMiwgY29uZmlnLmhpdExpbmVZIC0gNTAsIGNvbmZpZy5qdWRnZVRleHREdXJhdGlvbk1zKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGhpdEVmZmVjdEltYWdlID0gYXNzZXRDYWNoZS5pbWFnZXMuZ2V0KFwiaGl0X2VmZmVjdFwiKTtcclxuICAgICAgICBpZiAoaGl0RWZmZWN0SW1hZ2UpIHtcclxuICAgICAgICAgICAgaGl0RWZmZWN0cy5wdXNoKG5ldyBIaXRFZmZlY3QoXHJcbiAgICAgICAgICAgICAgICBsYW5lWCArIChjb25maWcubGFuZVdpZHRoIC0gbm90ZS53aWR0aCkgLyAyLCAvLyBDZW50ZXJlZCBob3Jpem9udGFsbHlcclxuICAgICAgICAgICAgICAgIGNvbmZpZy5oaXRMaW5lWSAtIG5vdGUuaGVpZ2h0IC8gMiwgLy8gQ2VudGVyZWQgdmVydGljYWxseSBvbiB0aGUgaGl0IGxpbmVcclxuICAgICAgICAgICAgICAgIGhpdEVmZmVjdEltYWdlLFxyXG4gICAgICAgICAgICAgICAgY29uZmlnLmhpdEVmZmVjdER1cmF0aW9uTXMsXHJcbiAgICAgICAgICAgICAgICBub3RlLndpZHRoLFxyXG4gICAgICAgICAgICAgICAgbm90ZS5oZWlnaHRcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oXCJObyBqdWRnbWVudCBmb3VuZCBmb3IgdGltZSBkaWZmZXJlbmNlOlwiLCB0aW1lRGlmZmVyZW5jZSwgXCIgKFRoaXMgc2hvdWxkIG5vdCBoYXBwZW4pXCIpO1xyXG4gICAgICAgIC8vIERlZmF1bHQgbWlzcyBsb2dpYyBpZiBubyBqdWRnbWVudCBzZXR0aW5nIG1hdGNoZXMgKGFzIGEgZmFsbGJhY2spXHJcbiAgICAgICAgaGVhbHRoIC09IDEwO1xyXG4gICAgICAgIGNvbWJvID0gMDtcclxuICAgICAgICBoZWFsdGggPSBNYXRoLm1heCgwLCBoZWFsdGgpO1xyXG4gICAgICAgIHBsYXlFZmZlY3QoXCJtaXNzX2VmZmVjdFwiKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gSW5pdGlhbGl6ZSB0aGUgZ2FtZSB3aGVuIHRoZSBET00gaXMgcmVhZHlcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGluaXRHYW1lKTsiXSwKICAibWFwcGluZ3MiOiAiQUEwRkEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxXQUFRO0FBQ1IsRUFBQUEsV0FBQSxjQUFXO0FBQ1gsRUFBQUEsV0FBQSxlQUFZO0FBSlgsU0FBQUE7QUFBQSxHQUFBO0FBUUwsSUFBSTtBQUNKLElBQUk7QUFDSixJQUFJO0FBRUosSUFBSTtBQUNKLE1BQU0sYUFBYTtBQUFBLEVBQ2YsUUFBUSxvQkFBSSxJQUE4QjtBQUFBLEVBQzFDLFFBQVEsb0JBQUksSUFBeUI7QUFDekM7QUFFQSxJQUFJLGVBQTBCO0FBQzlCLElBQUksaUJBQXNDO0FBQzFDLElBQUksbUJBQWtDO0FBR3RDLElBQUksY0FBZ0M7QUFDcEMsSUFBSSxhQUEyQztBQUMvQyxJQUFJLHdCQUFnQztBQUNwQyxJQUFJLGtCQUEwQjtBQUM5QixJQUFJLFFBQWdCO0FBQ3BCLElBQUksUUFBZ0I7QUFDcEIsSUFBSSxXQUFtQjtB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LFFBQU0sc0JBQXNCLENBQUMsR0FBRyxTQUFTLGFBQWEsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsZUFBZSxFQUFFLFlBQVk7QUFFdEcsYUFBVyxXQUFXLHFCQUFxQjtBQUN2QyxRQUFJLG9CQUFvQixRQUFRLGNBQWM7QUFDMUMsaUJBQVc7QUFDWDtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBRUEsTUFBSSxZQUFZO0FBQ1osZUFBVyxTQUFTLGNBQWMsS0FBSyxPQUFLLEVBQUUsYUFBYSxNQUFNO0FBQ2pFLFFBQUksQ0FBQyxVQUFVO0FBQ1gsaUJBQVcsRUFBRSxVQUFVLFFBQVEsT0FBTyxPQUFPLGNBQWMsVUFBVSxpQkFBaUIsR0FBRyxjQUFjLElBQUk7QUFBQSxJQUMvRztBQUFBLEVBQ0o7QUFFQSxNQUFJLFVBQVU7QUFDVixhQUFTLEtBQUssTUFBTSxTQUFTLG1CQUFtQixJQUFJLFFBQVEsR0FBRztBQUUvRCxRQUFJLFNBQVMsYUFBYSxVQUFVLFlBQVk7QUFDNUMsY0FBUTtBQUNSLGlCQUFXLGFBQWE7QUFBQSxJQUM1QixPQUFPO0FBQ0g7QUFDQSxpQkFBVyxLQUFLLElBQUksVUFBVSxLQUFLO0FBQ25DLGlCQUFXLFlBQVk7QUFBQSxJQUMzQjtBQUVBLGNBQVUsU0FBUztBQUNuQixhQUFTLEtBQUssSUFBSSxHQUFHLEtBQUssSUFBSSxRQUFRLE9BQU8sU0FBUyxDQUFDO0FBRXZELFVBQU0sUUFBUSxPQUFPLGFBQWEsS0FBSyxRQUFRLE9BQU8sWUFBWSxPQUFPO0FBQ3pFLGVBQVcsS0FBSyxJQUFJLFVBQVUsU0FBUyxVQUFVLFNBQVMsT0FBTyxRQUFRLE9BQU8sWUFBWSxHQUFHLE9BQU8sV0FBVyxJQUFJLE9BQU8sbUJBQW1CLENBQUM7QUFFaEosVUFBTSxpQkFBaUIsV0FBVyxPQUFPLElBQUksWUFBWTtBQUN6RCxRQUFJLGdCQUFnQjtBQUNoQixpQkFBVyxLQUFLLElBQUk7QUFBQSxRQUNoQixTQUFTLE9BQU8sWUFBWSxLQUFLLFNBQVM7QUFBQTtBQUFBLFFBQzFDLE9BQU8sV0FBVyxLQUFLLFNBQVM7QUFBQTtBQUFBLFFBQ2hDO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsTUFDVCxDQUFDO0FBQUEsSUFDTDtBQUFBLEVBQ0osT0FBTztBQUNILFlBQVEsS0FBSywwQ0FBMEMsZ0JBQWdCLDJCQUEyQjtBQUVsRyxjQUFVO0FBQ1YsWUFBUTtBQUNSLGFBQVMsS0FBSyxJQUFJLEdBQUcsTUFBTTtBQUMzQixlQUFXLGFBQWE7QUFBQSxFQUM1QjtBQUNKO0FBR0EsU0FBUyxpQkFBaUIsb0JBQW9CLFFBQVE7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSIsICJjdHgiXQp9Cg==
