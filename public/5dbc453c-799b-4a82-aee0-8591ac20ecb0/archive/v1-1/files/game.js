var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE_SCREEN"] = 0] = "TITLE_SCREEN";
  GameState2[GameState2["INSTRUCTIONS_SCREEN"] = 1] = "INSTRUCTIONS_SCREEN";
  GameState2[GameState2["GAME_PLAYING"] = 2] = "GAME_PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  GameState2[GameState2["RANKING_SCREEN"] = 4] = "RANKING_SCREEN";
  return GameState2;
})(GameState || {});
class AssetLoader {
  constructor() {
    this.loadedImages = /* @__PURE__ */ new Map();
    this.loadedSounds = /* @__PURE__ */ new Map();
  }
  async loadAssets(imageAssets, soundAssets) {
    const imagePromises = imageAssets.map((asset) => this.loadImage(asset));
    const soundPromises = soundAssets.map((asset) => this.loadSound(asset));
    await Promise.all([...imagePromises, ...soundPromises]);
  }
  loadImage(asset) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.loadedImages.set(asset.name, img);
        asset.image = img;
        resolve();
      };
      img.onerror = (e) => {
        console.error(`Failed to load image: ${asset.path}`, e);
        reject(new Error(`Failed to load image: ${asset.path}`));
      };
      img.src = asset.path;
    });
  }
  loadSound(asset) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(asset.path);
      audio.volume = asset.volume;
      this.loadedSounds.set(asset.name, audio);
      asset.audio = audio;
      resolve();
    });
  }
  getImage(name) {
    return this.loadedImages.get(name);
  }
  getSound(name) {
    return this.loadedSounds.get(name);
  }
}
class GameObject {
  constructor(x, y, width, height, image) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.image = image;
  }
  collidesWith(other) {
    return this.x < other.x + other.width && this.x + this.width > other.x && this.y < other.y + other.height && this.y + this.height > other.y;
  }
}
class Player extends GameObject {
  constructor(x, y, size, speed, image) {
    super(x, y, size, size, image);
    this.score = 0;
    this.keys = {};
    this.speed = speed;
    this.setupInput();
  }
  setupInput() {
    window.addEventListener("keydown", (e) => {
      this.keys[e.key] = true;
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.key] = false;
    });
  }
  update(deltaTime) {
    let dx = 0;
    let dy = 0;
    if (this.keys["ArrowUp"] || this.keys["w"] || this.keys["W"]) dy -= 1;
    if (this.keys["ArrowDown"] || this.keys["s"] || this.keys["S"]) dy += 1;
    if (this.keys["ArrowLeft"] || this.keys["a"] || this.keys["A"]) dx -= 1;
    if (this.keys["ArrowRight"] || this.keys["d"] || this.keys["D"]) dx += 1;
    if (dx !== 0 || dy !== 0) {
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      this.x += dx / magnitude * this.speed * deltaTime;
      this.y += dy / magnitude * this.speed * deltaTime;
    }
    this.x = Math.max(0, Math.min(this.x, gameCanvas.width - this.width));
    this.y = Math.max(0, Math.min(this.y, gameCanvas.height - this.height));
  }
  draw(ctx2) {
    if (this.image) {
      ctx2.drawImage(this.image, this.x, this.y, this.width, this.height);
    } else {
      ctx2.fillStyle = "blue";
      ctx2.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}
class Collectible extends GameObject {
  constructor(x, y, size, image) {
    super(x, y, size, size, image);
  }
  update(deltaTime) {
  }
  draw(ctx2) {
    if (this.image) {
      ctx2.drawImage(this.image, this.x, this.y, this.width, this.height);
    } else {
      ctx2.fillStyle = "gold";
      ctx2.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}
let gameCanvas;
let ctx;
let gameConfig;
let assetLoader = new AssetLoader();
let gameState = 0 /* TITLE_SCREEN */;
let player;
let collectibles = [];
let lastTime = 0;
let gameTimer = 0;
let collectibleSpawnTimer = 0;
let rankings = [];
const RANKING_STORAGE_KEY = "collector_challenge_rankings";
async function initGame() {
  gameCanvas = document.getElementById("gameCanvas");
  if (!gameCanvas) {
    console.error("Canvas element not found!");
    return;
  }
  ctx = gameCanvas.getContext("2d");
  gameCanvas.width = 800;
  gameCanvas.height = 600;
  try {
    const response = await fetch("data.json");
    gameConfig = await response.json();
  } catch (error) {
    console.error("Failed to load game config:", error);
    return;
  }
  try {
    await assetLoader.loadAssets(gameConfig.assets.images, gameConfig.assets.sounds);
    console.log("Assets loaded successfully!");
  } catch (error) {
    console.error("Failed to load assets:", error);
    return;
  }
  loadRankings();
  window.addEventListener("keydown", handleInput);
  window.addEventListener("click", handleInput);
  requestAnimationFrame(gameLoop);
}
function handleInput(event) {
  if (gameState === 0 /* TITLE_SCREEN */) {
    gameState = 1 /* INSTRUCTIONS_SCREEN */;
    const bgm = gameConfig.assets.sounds.find((s) => s.name === "bgm")?.audio;
    if (bgm) {
      bgm.loop = true;
      bgm.play().catch((e) => console.log("BGM auto-play blocked:", e));
    }
  } else if (gameState === 1 /* INSTRUCTIONS_SCREEN */) {
    startGame();
  } else if (gameState === 3 /* GAME_OVER */) {
    gameState = 4 /* RANKING_SCREEN */;
  } else if (gameState === 4 /* RANKING_SCREEN */) {
    resetGame();
    gameState = 0 /* TITLE_SCREEN */;
  }
}
function startGame() {
  gameState = 2 /* GAME_PLAYING */;
  player = new Player(
    gameCanvas.width / 2 - gameConfig.gameSettings.playerSize / 2,
    gameCanvas.height / 2 - gameConfig.gameSettings.playerSize / 2,
    gameConfig.gameSettings.playerSize,
    gameConfig.gameSettings.playerSpeed,
    assetLoader.getImage("player")
  );
  collectibles = [];
  player.score = 0;
  gameTimer = gameConfig.gameSettings.gameDurationSeconds;
  collectibleSpawnTimer = 0;
}
function resetGame() {
  player = null;
  collectibles = [];
  gameTimer = 0;
  collectibleSpawnTimer = 0;
  const bgm = gameConfig.assets.sounds.find((s) => s.name === "bgm")?.audio;
  if (bgm) {
    bgm.pause();
    bgm.currentTime = 0;
  }
}
function gameLoop(timestamp) {
  const deltaTime = (timestamp - lastTime) / 1e3;
  lastTime = timestamp;
  update(deltaTime);
  draw();
  requestAnimationFrame(gameLoop);
}
function update(deltaTime) {
  switch (gameState) {
    case 2 /* GAME_PLAYING */:
      gameTimer -= deltaTime;
      if (gameTimer <= 0) {
        gameTimer = 0;
        handleGameOver();
        return;
      }
      player.update(deltaTime);
      collectibleSpawnTimer -= deltaTime;
      if (collectibleSpawnTimer <= 0 && collectibles.length < gameConfig.gameSettings.maxCollectibles) {
        spawnCollectible();
        collectibleSpawnTimer = gameConfig.gameSettings.collectibleSpawnInterval;
      }
      for (let i = collectibles.length - 1; i >= 0; i--) {
        const collectible = collectibles[i];
        if (player.collidesWith(collectible)) {
          player.score += gameConfig.gameSettings.collectibleScore;
          const collectSound = gameConfig.assets.sounds.find((s) => s.name === "collect")?.audio;
          if (collectSound) {
            collectSound.currentTime = 0;
            collectSound.play().catch((e) => console.log("Collect sound play blocked:", e));
          }
          collectibles.splice(i, 1);
          if (collectibles.length < gameConfig.gameSettings.maxCollectibles) {
            spawnCollectible();
          }
        }
      }
      break;
  }
}
function draw() {
  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  const bgImage = assetLoader.getImage("background");
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, gameCanvas.width, gameCanvas.height);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
  }
  switch (gameState) {
    case 0 /* TITLE_SCREEN */:
      drawTitleScreen();
      break;
    case 1 /* INSTRUCTIONS_SCREEN */:
      drawInstructionsScreen();
      break;
    case 2 /* GAME_PLAYING */:
      player.draw(ctx);
      collectibles.forEach((collectible) => collectible.draw(ctx));
      drawGameUI();
      break;
    case 3 /* GAME_OVER */:
      drawGameOverScreen();
      break;
    case 4 /* RANKING_SCREEN */:
      drawRankingScreen();
      break;
  }
}
function drawTitleScreen() {
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.font = "48px sans-serif";
  ctx.fillText(gameConfig.titleScreenText, gameCanvas.width / 2, gameCanvas.height / 2 - 50);
  ctx.font = "24px sans-serif";
  ctx.fillText("\uC544\uBB34 \uD0A4\uB098 \uB20C\uB7EC \uC2DC\uC791", gameCanvas.width / 2, gameCanvas.height / 2 + 50);
}
function drawInstructionsScreen() {
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.font = "36px sans-serif";
  ctx.fillText("\uAC8C\uC784 \uBC29\uBC95", gameCanvas.width / 2, gameCanvas.height / 2 - 100);
  ctx.font = "20px sans-serif";
  const lines = gameConfig.instructionsText.split("\n");
  lines.forEach((line, index) => {
    ctx.fillText(line, gameCanvas.width / 2, gameCanvas.height / 2 - 30 + index * 30);
  });
  ctx.font = "24px sans-serif";
  ctx.fillText("\uACC4\uC18D\uD558\uB824\uBA74 \uC544\uBB34 \uD0A4\uB098 \uB20C\uB7EC\uC8FC\uC138\uC694.", gameCanvas.width / 2, gameCanvas.height / 2 + 100);
}
function drawGameUI() {
  ctx.fillStyle = "white";
  ctx.font = "24px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`\uC810\uC218: ${player.score}`, 10, 30);
  ctx.textAlign = "right";
  ctx.fillText(`\uC2DC\uAC04: ${gameTimer.toFixed(1)}s`, gameCanvas.width - 10, 30);
}
function handleGameOver() {
  gameState = 3 /* GAME_OVER */;
  const bgm = gameConfig.assets.sounds.find((s) => s.name === "bgm")?.audio;
  if (bgm) {
    bgm.pause();
    bgm.currentTime = 0;
  }
  addScoreToRanking(player.score);
}
function drawGameOverScreen() {
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.font = "48px sans-serif";
  ctx.fillText(gameConfig.gameOverText, gameCanvas.width / 2, gameCanvas.height / 2 - 50);
  ctx.font = "36px sans-serif";
  ctx.fillText(`${player.score} \uC810`, gameCanvas.width / 2, gameCanvas.height / 2 + 10);
  ctx.font = "24px sans-serif";
  ctx.fillText("\uC544\uBB34 \uD0A4\uB098 \uB20C\uB7EC \uB7AD\uD0B9 \uBCF4\uAE30", gameCanvas.width / 2, gameCanvas.height / 2 + 100);
}
function spawnCollectible() {
  const x = Math.random() * (gameCanvas.width - gameConfig.gameSettings.collectibleSize);
  const y = Math.random() * (gameCanvas.height - gameConfig.gameSettings.collectibleSize);
  collectibles.push(new Collectible(x, y, gameConfig.gameSettings.collectibleSize, assetLoader.getImage("collectible")));
}
function loadRankings() {
  const storedRankings = localStorage.getItem(RANKING_STORAGE_KEY);
  if (storedRankings) {
    rankings = JSON.parse(storedRankings);
  } else {
    rankings = [];
  }
}
function saveRankings() {
  localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(rankings));
}
function addScoreToRanking(score) {
  if (rankings.length < gameConfig.gameSettings.rankingSize || score > (rankings.length > 0 ? rankings[rankings.length - 1].score : -1)) {
    let playerName = prompt(`\uCD95\uD558\uD569\uB2C8\uB2E4! \uCD5C\uACE0 \uC810\uC218 ${score}\uC810\uC744 \uAE30\uB85D\uD588\uC2B5\uB2C8\uB2E4! \uB2F9\uC2E0\uC758 \uC774\uB984\uC744 \uC785\uB825\uD558\uC138\uC694 (3\uAE00\uC790 \uC774\uB0B4):`);
    playerName = playerName ? playerName.substring(0, 3).toUpperCase() : "AAA";
    rankings.push({ name: playerName, score });
    rankings.sort((a, b) => b.score - a.score);
    rankings = rankings.slice(0, gameConfig.gameSettings.rankingSize);
    saveRankings();
  }
}
function drawRankingScreen() {
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.font = "48px sans-serif";
  ctx.fillText(gameConfig.rankingScreenText, gameCanvas.width / 2, 80);
  ctx.font = "30px sans-serif";
  if (rankings.length === 0) {
    ctx.fillText("\uC544\uC9C1 \uB7AD\uD0B9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4!", gameCanvas.width / 2, gameCanvas.height / 2);
  } else {
    rankings.forEach((entry, index) => {
      const y = 150 + index * 40;
      ctx.fillText(`${index + 1}. ${entry.name} - ${entry.score} \uC810`, gameCanvas.width / 2, y);
    });
  }
  ctx.font = "24px sans-serif";
  ctx.fillText("\uC544\uBB34 \uD0A4\uB098 \uB20C\uB7EC \uD0C0\uC774\uD2C0\uB85C \uB3CC\uC544\uAC00\uAE30", gameCanvas.width / 2, gameCanvas.height - 80);
}
document.addEventListener("DOMContentLoaded", initGame);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgZ2FtZVNldHRpbmdzOiB7XHJcbiAgICAgICAgZ2FtZUR1cmF0aW9uU2Vjb25kczogbnVtYmVyO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgY29sbGVjdGlibGVTY29yZTogbnVtYmVyO1xyXG4gICAgICAgIGNvbGxlY3RpYmxlU3Bhd25JbnRlcnZhbDogbnVtYmVyO1xyXG4gICAgICAgIG1heENvbGxlY3RpYmxlczogbnVtYmVyO1xyXG4gICAgICAgIHJhbmtpbmdTaXplOiBudW1iZXI7XHJcbiAgICAgICAgcGxheWVyU2l6ZTogbnVtYmVyO1xyXG4gICAgICAgIGNvbGxlY3RpYmxlU2l6ZTogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgaW5zdHJ1Y3Rpb25zVGV4dDogc3RyaW5nO1xyXG4gICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XHJcbiAgICByYW5raW5nU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJbWFnZUFzc2V0W107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZEFzc2V0W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBpbWFnZT86IEhUTUxJbWFnZUVsZW1lbnQ7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG4gICAgYXVkaW8/OiBIVE1MQXVkaW9FbGVtZW50O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUmFua0VudHJ5IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHNjb3JlOiBudW1iZXI7XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFX1NDUkVFTixcclxuICAgIElOU1RSVUNUSU9OU19TQ1JFRU4sXHJcbiAgICBHQU1FX1BMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbiAgICBSQU5LSU5HX1NDUkVFTixcclxufVxyXG5cclxuY2xhc3MgQXNzZXRMb2FkZXIge1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRJbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBsb2FkZWRTb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG5cclxuICAgIGFzeW5jIGxvYWRBc3NldHMoaW1hZ2VBc3NldHM6IEltYWdlQXNzZXRbXSwgc291bmRBc3NldHM6IFNvdW5kQXNzZXRbXSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBpbWFnZUFzc2V0cy5tYXAoYXNzZXQgPT4gdGhpcy5sb2FkSW1hZ2UoYXNzZXQpKTtcclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gc291bmRBc3NldHMubWFwKGFzc2V0ID0+IHRoaXMubG9hZFNvdW5kKGFzc2V0KSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkSW1hZ2UoYXNzZXQ6IEltYWdlQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMubG9hZGVkSW1hZ2VzLnNldChhc3NldC5uYW1lLCBpbWcpO1xyXG4gICAgICAgICAgICAgICAgYXNzZXQuaW1hZ2UgPSBpbWc7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKGUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2Fzc2V0LnBhdGh9YCwgZSk7XHJcbiAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldC5wYXRofWApKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkU291bmQoYXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhhc3NldC5wYXRoKTtcclxuICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gYXNzZXQudm9sdW1lO1xyXG4gICAgICAgICAgICAvLyBSZXNvbHZlIGltbWVkaWF0ZWx5IGFmdGVyIHNldHRpbmcgYXR0cmlidXRlcywgYWN0dWFsIHBsYXliYWNrIHdpbGwgaGFuZGxlIHJlYWRpbmVzc1xyXG4gICAgICAgICAgICB0aGlzLmxvYWRlZFNvdW5kcy5zZXQoYXNzZXQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICBhc3NldC5hdWRpbyA9IGF1ZGlvO1xyXG4gICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0SW1hZ2UobmFtZTogc3RyaW5nKTogSFRNTEltYWdlRWxlbWVudCB8IHVuZGVmaW5lZCB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMubG9hZGVkSW1hZ2VzLmdldChuYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRTb3VuZChuYW1lOiBzdHJpbmcpOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5sb2FkZWRTb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgfVxyXG59XHJcblxyXG5hYnN0cmFjdCBjbGFzcyBHYW1lT2JqZWN0IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxuICAgIHdpZHRoOiBudW1iZXI7XHJcbiAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQpIHtcclxuICAgICAgICB0aGlzLnggPSB4O1xyXG4gICAgICAgIHRoaXMueSA9IHk7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICAgIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuaW1hZ2UgPSBpbWFnZTtcclxuICAgIH1cclxuXHJcbiAgICBhYnN0cmFjdCB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkO1xyXG4gICAgYWJzdHJhY3QgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCk6IHZvaWQ7XHJcblxyXG4gICAgY29sbGlkZXNXaXRoKG90aGVyOiBHYW1lT2JqZWN0KTogYm9vbGVhbiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMueCA8IG90aGVyLnggKyBvdGhlci53aWR0aCAmJlxyXG4gICAgICAgICAgICAgICB0aGlzLnggKyB0aGlzLndpZHRoID4gb3RoZXIueCAmJlxyXG4gICAgICAgICAgICAgICB0aGlzLnkgPCBvdGhlci55ICsgb3RoZXIuaGVpZ2h0ICYmXHJcbiAgICAgICAgICAgICAgIHRoaXMueSArIHRoaXMuaGVpZ2h0ID4gb3RoZXIueTtcclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUGxheWVyIGV4dGVuZHMgR2FtZU9iamVjdCB7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XHJcblxyXG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIsIHNpemU6IG51bWJlciwgc3BlZWQ6IG51bWJlciwgaW1hZ2U6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQpIHtcclxuICAgICAgICBzdXBlcih4LCB5LCBzaXplLCBzaXplLCBpbWFnZSk7XHJcbiAgICAgICAgdGhpcy5zcGVlZCA9IHNwZWVkO1xyXG4gICAgICAgIHRoaXMuc2V0dXBJbnB1dCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBJbnB1dCgpOiB2b2lkIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMua2V5c1tlLmtleV0gPSB0cnVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChlKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMua2V5c1tlLmtleV0gPSBmYWxzZTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBsZXQgZHggPSAwO1xyXG4gICAgICAgIGxldCBkeSA9IDA7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ0Fycm93VXAnXSB8fCB0aGlzLmtleXNbJ3cnXSB8fCB0aGlzLmtleXNbJ1cnXSkgZHkgLT0gMTtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydBcnJvd0Rvd24nXSB8fCB0aGlzLmtleXNbJ3MnXSB8fCB0aGlzLmtleXNbJ1MnXSkgZHkgKz0gMTtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydBcnJvd0xlZnQnXSB8fCB0aGlzLmtleXNbJ2EnXSB8fCB0aGlzLmtleXNbJ0EnXSkgZHggLT0gMTtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydBcnJvd1JpZ2h0J10gfHwgdGhpcy5rZXlzWydkJ10gfHwgdGhpcy5rZXlzWydEJ10pIGR4ICs9IDE7XHJcblxyXG4gICAgICAgIGlmIChkeCAhPT0gMCB8fCBkeSAhPT0gMCkge1xyXG4gICAgICAgICAgICBjb25zdCBtYWduaXR1ZGUgPSBNYXRoLnNxcnQoZHggKiBkeCArIGR5ICogZHkpO1xyXG4gICAgICAgICAgICB0aGlzLnggKz0gKGR4IC8gbWFnbml0dWRlKSAqIHRoaXMuc3BlZWQgKiBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIHRoaXMueSArPSAoZHkgLyBtYWduaXR1ZGUpICogdGhpcy5zcGVlZCAqIGRlbHRhVGltZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMueCA9IE1hdGgubWF4KDAsIE1hdGgubWluKHRoaXMueCwgZ2FtZUNhbnZhcy53aWR0aCAtIHRoaXMud2lkdGgpKTtcclxuICAgICAgICB0aGlzLnkgPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLnksIGdhbWVDYW52YXMuaGVpZ2h0IC0gdGhpcy5oZWlnaHQpKTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaW1hZ2UpIHtcclxuICAgICAgICAgICAgY3R4LmRyYXdJbWFnZSh0aGlzLmltYWdlLCB0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSAnYmx1ZSc7XHJcbiAgICAgICAgICAgIGN0eC5maWxsUmVjdCh0aGlzLngsIHRoaXMueSwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgQ29sbGVjdGlibGUgZXh0ZW5kcyBHYW1lT2JqZWN0IHtcclxuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyLCBzaXplOiBudW1iZXIsIGltYWdlOiBIVE1MSW1hZ2VFbGVtZW50IHwgdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgc3VwZXIoeCwgeSwgc2l6ZSwgc2l6ZSwgaW1hZ2UpO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIC8vIENvbGxlY3RpYmxlcyBkb24ndCBtb3ZlXHJcbiAgICB9XHJcblxyXG4gICAgZHJhdyhjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmltYWdlKSB7XHJcbiAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UodGhpcy5pbWFnZSwgdGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjdHguZmlsbFN0eWxlID0gJ2dvbGQnO1xyXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QodGhpcy54LCB0aGlzLnksIHRoaXMud2lkdGgsIHRoaXMuaGVpZ2h0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmxldCBnYW1lQ2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxubGV0IGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG5sZXQgZ2FtZUNvbmZpZzogR2FtZUNvbmZpZztcclxubGV0IGFzc2V0TG9hZGVyID0gbmV3IEFzc2V0TG9hZGVyKCk7XHJcbmxldCBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU47XHJcblxyXG5sZXQgcGxheWVyOiBQbGF5ZXI7XHJcbmxldCBjb2xsZWN0aWJsZXM6IENvbGxlY3RpYmxlW10gPSBbXTtcclxuXHJcbmxldCBsYXN0VGltZTogbnVtYmVyID0gMDtcclxubGV0IGdhbWVUaW1lcjogbnVtYmVyID0gMDtcclxubGV0IGNvbGxlY3RpYmxlU3Bhd25UaW1lcjogbnVtYmVyID0gMDtcclxuXHJcbmxldCByYW5raW5nczogUmFua0VudHJ5W10gPSBbXTtcclxuY29uc3QgUkFOS0lOR19TVE9SQUdFX0tFWSA9ICdjb2xsZWN0b3JfY2hhbGxlbmdlX3JhbmtpbmdzJztcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGluaXRHYW1lKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgZ2FtZUNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBpZiAoIWdhbWVDYW52YXMpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdDYW52YXMgZWxlbWVudCBub3QgZm91bmQhJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY3R4ID0gZ2FtZUNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuXHJcbiAgICBnYW1lQ2FudmFzLndpZHRoID0gODAwO1xyXG4gICAgZ2FtZUNhbnZhcy5oZWlnaHQgPSA2MDA7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICBnYW1lQ29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZzonLCBlcnJvcik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgYXdhaXQgYXNzZXRMb2FkZXIubG9hZEFzc2V0cyhnYW1lQ29uZmlnLmFzc2V0cy5pbWFnZXMsIGdhbWVDb25maWcuYXNzZXRzLnNvdW5kcyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0Fzc2V0cyBsb2FkZWQgc3VjY2Vzc2Z1bGx5IScpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBhc3NldHM6JywgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBsb2FkUmFua2luZ3MoKTtcclxuXHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZUlucHV0KTtcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGhhbmRsZUlucHV0KTtcclxuXHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBoYW5kbGVJbnB1dChldmVudDogS2V5Ym9hcmRFdmVudCB8IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU4pIHtcclxuICAgICAgICBnYW1lU3RhdGUgPSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TX1NDUkVFTjtcclxuICAgICAgICBjb25zdCBiZ20gPSBnYW1lQ29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gXCJiZ21cIik/LmF1ZGlvO1xyXG4gICAgICAgIGlmIChiZ20pIHtcclxuICAgICAgICAgICAgYmdtLmxvb3AgPSB0cnVlO1xyXG4gICAgICAgICAgICBiZ20ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gYXV0by1wbGF5IGJsb2NrZWQ6XCIsIGUpKTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLklOU1RSVUNUSU9OU19TQ1JFRU4pIHtcclxuICAgICAgICBzdGFydEdhbWUoKTtcclxuICAgIH0gZWxzZSBpZiAoZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XHJcbiAgICAgICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlJBTktJTkdfU0NSRUVOO1xyXG4gICAgfSBlbHNlIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5SQU5LSU5HX1NDUkVFTikge1xyXG4gICAgICAgIHJlc2V0R2FtZSgpO1xyXG4gICAgICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU47XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX1BMQVlJTkc7XHJcbiAgICBwbGF5ZXIgPSBuZXcgUGxheWVyKFxyXG4gICAgICAgIGdhbWVDYW52YXMud2lkdGggLyAyIC0gZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyU2l6ZSAvIDIsXHJcbiAgICAgICAgZ2FtZUNhbnZhcy5oZWlnaHQgLyAyIC0gZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyU2l6ZSAvIDIsXHJcbiAgICAgICAgZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyU2l6ZSxcclxuICAgICAgICBnYW1lQ29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJTcGVlZCxcclxuICAgICAgICBhc3NldExvYWRlci5nZXRJbWFnZSgncGxheWVyJylcclxuICAgICk7XHJcbiAgICBjb2xsZWN0aWJsZXMgPSBbXTtcclxuICAgIHBsYXllci5zY29yZSA9IDA7XHJcbiAgICBnYW1lVGltZXIgPSBnYW1lQ29uZmlnLmdhbWVTZXR0aW5ncy5nYW1lRHVyYXRpb25TZWNvbmRzO1xyXG4gICAgY29sbGVjdGlibGVTcGF3blRpbWVyID0gMDtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVzZXRHYW1lKCk6IHZvaWQge1xyXG4gICAgcGxheWVyID0gbnVsbCBhcyBhbnk7XHJcbiAgICBjb2xsZWN0aWJsZXMgPSBbXTtcclxuICAgIGdhbWVUaW1lciA9IDA7XHJcbiAgICBjb2xsZWN0aWJsZVNwYXduVGltZXIgPSAwO1xyXG4gICAgY29uc3QgYmdtID0gZ2FtZUNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09IFwiYmdtXCIpPy5hdWRpbztcclxuICAgIGlmIChiZ20pIHtcclxuICAgICAgICBiZ20ucGF1c2UoKTtcclxuICAgICAgICBiZ20uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnYW1lTG9vcCh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xyXG4gICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWVzdGFtcCAtIGxhc3RUaW1lKSAvIDEwMDA7XHJcbiAgICBsYXN0VGltZSA9IHRpbWVzdGFtcDtcclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgIGRyYXcoKTtcclxuXHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xyXG59XHJcblxyXG5mdW5jdGlvbiB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgIHN3aXRjaCAoZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9QTEFZSU5HOlxyXG4gICAgICAgICAgICBnYW1lVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAoZ2FtZVRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIGdhbWVUaW1lciA9IDA7XHJcbiAgICAgICAgICAgICAgICBoYW5kbGVHYW1lT3ZlcigpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBwbGF5ZXIudXBkYXRlKGRlbHRhVGltZSk7XHJcblxyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZVNwYXduVGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgICAgICBpZiAoY29sbGVjdGlibGVTcGF3blRpbWVyIDw9IDAgJiYgY29sbGVjdGlibGVzLmxlbmd0aCA8IGdhbWVDb25maWcuZ2FtZVNldHRpbmdzLm1heENvbGxlY3RpYmxlcykge1xyXG4gICAgICAgICAgICAgICAgc3Bhd25Db2xsZWN0aWJsZSgpO1xyXG4gICAgICAgICAgICAgICAgY29sbGVjdGlibGVTcGF3blRpbWVyID0gZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MuY29sbGVjdGlibGVTcGF3bkludGVydmFsO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gY29sbGVjdGlibGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjb2xsZWN0aWJsZSA9IGNvbGxlY3RpYmxlc1tpXTtcclxuICAgICAgICAgICAgICAgIGlmIChwbGF5ZXIuY29sbGlkZXNXaXRoKGNvbGxlY3RpYmxlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHBsYXllci5zY29yZSArPSBnYW1lQ29uZmlnLmdhbWVTZXR0aW5ncy5jb2xsZWN0aWJsZVNjb3JlO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbGxlY3RTb3VuZCA9IGdhbWVDb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSBcImNvbGxlY3RcIik/LmF1ZGlvO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjb2xsZWN0U291bmQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29sbGVjdFNvdW5kLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29sbGVjdFNvdW5kLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQ29sbGVjdCBzb3VuZCBwbGF5IGJsb2NrZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY29sbGVjdGlibGVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY29sbGVjdGlibGVzLmxlbmd0aCA8IGdhbWVDb25maWcuZ2FtZVNldHRpbmdzLm1heENvbGxlY3RpYmxlcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzcGF3bkNvbGxlY3RpYmxlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3KCk6IHZvaWQge1xyXG4gICAgY3R4LmNsZWFyUmVjdCgwLCAwLCBnYW1lQ2FudmFzLndpZHRoLCBnYW1lQ2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgY29uc3QgYmdJbWFnZSA9IGFzc2V0TG9hZGVyLmdldEltYWdlKCdiYWNrZ3JvdW5kJyk7XHJcbiAgICBpZiAoYmdJbWFnZSkge1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoYmdJbWFnZSwgMCwgMCwgZ2FtZUNhbnZhcy53aWR0aCwgZ2FtZUNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gJyMzMzMnO1xyXG4gICAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCBnYW1lQ2FudmFzLndpZHRoLCBnYW1lQ2FudmFzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgc3dpdGNoIChnYW1lU3RhdGUpIHtcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRV9TQ1JFRU46XHJcbiAgICAgICAgICAgIGRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlNfU0NSRUVOOlxyXG4gICAgICAgICAgICBkcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfUExBWUlORzpcclxuICAgICAgICAgICAgcGxheWVyLmRyYXcoY3R4KTtcclxuICAgICAgICAgICAgY29sbGVjdGlibGVzLmZvckVhY2goY29sbGVjdGlibGUgPT4gY29sbGVjdGlibGUuZHJhdyhjdHgpKTtcclxuICAgICAgICAgICAgZHJhd0dhbWVVSSgpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgIGRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5SQU5LSU5HX1NDUkVFTjpcclxuICAgICAgICAgICAgZHJhd1JhbmtpbmdTY3JlZW4oKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgIGN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgY3R4LmZvbnQgPSAnNDhweCBzYW5zLXNlcmlmJztcclxuICAgIGN0eC5maWxsVGV4dChnYW1lQ29uZmlnLnRpdGxlU2NyZWVuVGV4dCwgZ2FtZUNhbnZhcy53aWR0aCAvIDIsIGdhbWVDYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgIGN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICBjdHguZmlsbFRleHQoJ1x1QzU0NFx1QkIzNCBcdUQwQTRcdUIwOTggXHVCMjBDXHVCN0VDIFx1QzJEQ1x1Qzc5MScsIGdhbWVDYW52YXMud2lkdGggLyAyLCBnYW1lQ2FudmFzLmhlaWdodCAvIDIgKyA1MCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTogdm9pZCB7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gJ3doaXRlJztcclxuICAgIGN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgIGN0eC5mb250ID0gJzM2cHggc2Fucy1zZXJpZic7XHJcbiAgICBjdHguZmlsbFRleHQoJ1x1QUM4Q1x1Qzc4NCBcdUJDMjlcdUJDOTUnLCBnYW1lQ2FudmFzLndpZHRoIC8gMiwgZ2FtZUNhbnZhcy5oZWlnaHQgLyAyIC0gMTAwKTtcclxuICAgIGN0eC5mb250ID0gJzIwcHggc2Fucy1zZXJpZic7XHJcbiAgICBjb25zdCBsaW5lcyA9IGdhbWVDb25maWcuaW5zdHJ1Y3Rpb25zVGV4dC5zcGxpdCgnXFxuJyk7XHJcbiAgICBsaW5lcy5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgIGN0eC5maWxsVGV4dChsaW5lLCBnYW1lQ2FudmFzLndpZHRoIC8gMiwgZ2FtZUNhbnZhcy5oZWlnaHQgLyAyIC0gMzAgKyBpbmRleCAqIDMwKTtcclxuICAgIH0pO1xyXG4gICAgY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgIGN0eC5maWxsVGV4dCgnXHVBQ0M0XHVDMThEXHVENTU4XHVCODI0XHVCQTc0IFx1QzU0NFx1QkIzNCBcdUQwQTRcdUIwOTggXHVCMjBDXHVCN0VDXHVDOEZDXHVDMTM4XHVDNjk0LicsIGdhbWVDYW52YXMud2lkdGggLyAyLCBnYW1lQ2FudmFzLmhlaWdodCAvIDIgKyAxMDApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3R2FtZVVJKCk6IHZvaWQge1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9ICd3aGl0ZSc7XHJcbiAgICBjdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgIGN0eC5maWxsVGV4dChgXHVDODEwXHVDMjE4OiAke3BsYXllci5zY29yZX1gLCAxMCwgMzApO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdyaWdodCc7XHJcbiAgICBjdHguZmlsbFRleHQoYFx1QzJEQ1x1QUMwNDogJHtnYW1lVGltZXIudG9GaXhlZCgxKX1zYCwgZ2FtZUNhbnZhcy53aWR0aCAtIDEwLCAzMCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGhhbmRsZUdhbWVPdmVyKCk6IHZvaWQge1xyXG4gICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgIGNvbnN0IGJnbSA9IGdhbWVDb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSBcImJnbVwiKT8uYXVkaW87XHJcbiAgICBpZiAoYmdtKSB7XHJcbiAgICAgICAgYmdtLnBhdXNlKCk7XHJcbiAgICAgICAgYmdtLmN1cnJlbnRUaW1lID0gMDtcclxuICAgIH1cclxuICAgIGFkZFNjb3JlVG9SYW5raW5nKHBsYXllci5zY29yZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgIGN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgY3R4LmZvbnQgPSAnNDhweCBzYW5zLXNlcmlmJztcclxuICAgIGN0eC5maWxsVGV4dChnYW1lQ29uZmlnLmdhbWVPdmVyVGV4dCwgZ2FtZUNhbnZhcy53aWR0aCAvIDIsIGdhbWVDYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuICAgIGN0eC5mb250ID0gJzM2cHggc2Fucy1zZXJpZic7XHJcbiAgICBjdHguZmlsbFRleHQoYCR7cGxheWVyLnNjb3JlfSBcdUM4MTBgLCBnYW1lQ2FudmFzLndpZHRoIC8gMiwgZ2FtZUNhbnZhcy5oZWlnaHQgLyAyICsgMTApO1xyXG4gICAgY3R4LmZvbnQgPSAnMjRweCBzYW5zLXNlcmlmJztcclxuICAgIGN0eC5maWxsVGV4dCgnXHVDNTQ0XHVCQjM0IFx1RDBBNFx1QjA5OCBcdUIyMENcdUI3RUMgXHVCN0FEXHVEMEI5IFx1QkNGNFx1QUUzMCcsIGdhbWVDYW52YXMud2lkdGggLyAyLCBnYW1lQ2FudmFzLmhlaWdodCAvIDIgKyAxMDApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzcGF3bkNvbGxlY3RpYmxlKCk6IHZvaWQge1xyXG4gICAgY29uc3QgeCA9IE1hdGgucmFuZG9tKCkgKiAoZ2FtZUNhbnZhcy53aWR0aCAtIGdhbWVDb25maWcuZ2FtZVNldHRpbmdzLmNvbGxlY3RpYmxlU2l6ZSk7XHJcbiAgICBjb25zdCB5ID0gTWF0aC5yYW5kb20oKSAqIChnYW1lQ2FudmFzLmhlaWdodCAtIGdhbWVDb25maWcuZ2FtZVNldHRpbmdzLmNvbGxlY3RpYmxlU2l6ZSk7XHJcbiAgICBjb2xsZWN0aWJsZXMucHVzaChuZXcgQ29sbGVjdGlibGUoeCwgeSwgZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MuY29sbGVjdGlibGVTaXplLCBhc3NldExvYWRlci5nZXRJbWFnZSgnY29sbGVjdGlibGUnKSkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBsb2FkUmFua2luZ3MoKTogdm9pZCB7XHJcbiAgICBjb25zdCBzdG9yZWRSYW5raW5ncyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKFJBTktJTkdfU1RPUkFHRV9LRVkpO1xyXG4gICAgaWYgKHN0b3JlZFJhbmtpbmdzKSB7XHJcbiAgICAgICAgcmFua2luZ3MgPSBKU09OLnBhcnNlKHN0b3JlZFJhbmtpbmdzKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmFua2luZ3MgPSBbXTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc2F2ZVJhbmtpbmdzKCk6IHZvaWQge1xyXG4gICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oUkFOS0lOR19TVE9SQUdFX0tFWSwgSlNPTi5zdHJpbmdpZnkocmFua2luZ3MpKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWRkU2NvcmVUb1Jhbmtpbmcoc2NvcmU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgaWYgKHJhbmtpbmdzLmxlbmd0aCA8IGdhbWVDb25maWcuZ2FtZVNldHRpbmdzLnJhbmtpbmdTaXplIHx8IHNjb3JlID4gKHJhbmtpbmdzLmxlbmd0aCA+IDAgPyByYW5raW5nc1tyYW5raW5ncy5sZW5ndGggLSAxXS5zY29yZSA6IC0xKSkge1xyXG4gICAgICAgIGxldCBwbGF5ZXJOYW1lID0gcHJvbXB0KGBcdUNEOTVcdUQ1NThcdUQ1NjlcdUIyQzhcdUIyRTQhIFx1Q0Q1Q1x1QUNFMCBcdUM4MTBcdUMyMTggJHtzY29yZX1cdUM4MTBcdUM3NDQgXHVBRTMwXHVCODVEXHVENTg4XHVDMkI1XHVCMkM4XHVCMkU0ISBcdUIyRjlcdUMyRTBcdUM3NTggXHVDNzc0XHVCOTg0XHVDNzQ0IFx1Qzc4NVx1QjgyNVx1RDU1OFx1QzEzOFx1QzY5NCAoM1x1QUUwMFx1Qzc5MCBcdUM3NzRcdUIwQjQpOmApO1xyXG4gICAgICAgIHBsYXllck5hbWUgPSBwbGF5ZXJOYW1lID8gcGxheWVyTmFtZS5zdWJzdHJpbmcoMCwgMykudG9VcHBlckNhc2UoKSA6ICdBQUEnO1xyXG4gICAgICAgIHJhbmtpbmdzLnB1c2goeyBuYW1lOiBwbGF5ZXJOYW1lLCBzY29yZTogc2NvcmUgfSk7XHJcbiAgICAgICAgcmFua2luZ3Muc29ydCgoYSwgYikgPT4gYi5zY29yZSAtIGEuc2NvcmUpO1xyXG4gICAgICAgIHJhbmtpbmdzID0gcmFua2luZ3Muc2xpY2UoMCwgZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MucmFua2luZ1NpemUpO1xyXG4gICAgICAgIHNhdmVSYW5raW5ncygpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3UmFua2luZ1NjcmVlbigpOiB2b2lkIHtcclxuICAgIGN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgY3R4LmZvbnQgPSAnNDhweCBzYW5zLXNlcmlmJztcclxuICAgIGN0eC5maWxsVGV4dChnYW1lQ29uZmlnLnJhbmtpbmdTY3JlZW5UZXh0LCBnYW1lQ2FudmFzLndpZHRoIC8gMiwgODApO1xyXG5cclxuICAgIGN0eC5mb250ID0gJzMwcHggc2Fucy1zZXJpZic7XHJcbiAgICBpZiAocmFua2luZ3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgY3R4LmZpbGxUZXh0KCdcdUM1NDRcdUM5QzEgXHVCN0FEXHVEMEI5XHVDNzc0IFx1QzVDNlx1QzJCNVx1QjJDOFx1QjJFNCEnLCBnYW1lQ2FudmFzLndpZHRoIC8gMiwgZ2FtZUNhbnZhcy5oZWlnaHQgLyAyKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgcmFua2luZ3MuZm9yRWFjaCgoZW50cnksIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHkgPSAxNTAgKyBpbmRleCAqIDQwO1xyXG4gICAgICAgICAgICBjdHguZmlsbFRleHQoYCR7aW5kZXggKyAxfS4gJHtlbnRyeS5uYW1lfSAtICR7ZW50cnkuc2NvcmV9IFx1QzgxMGAsIGdhbWVDYW52YXMud2lkdGggLyAyLCB5KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgY3R4LmZpbGxUZXh0KCdcdUM1NDRcdUJCMzQgXHVEMEE0XHVCMDk4IFx1QjIwQ1x1QjdFQyBcdUQwQzBcdUM3NzRcdUQyQzBcdUI4NUMgXHVCM0NDXHVDNTQ0XHVBQzAwXHVBRTMwJywgZ2FtZUNhbnZhcy53aWR0aCAvIDIsIGdhbWVDYW52YXMuaGVpZ2h0IC0gODApO1xyXG59XHJcblxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgaW5pdEdhbWUpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUEwQ0EsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7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QUFZLFNBQVMsYUFBYSxDQUFDLENBQUM7QUFDekg7QUFFQSxTQUFTLGVBQXFCO0FBQzFCLFFBQU0saUJBQWlCLGFBQWEsUUFBUSxtQkFBbUI7QUFDL0QsTUFBSSxnQkFBZ0I7QUFDaEIsZUFBVyxLQUFLLE1BQU0sY0FBYztBQUFBLEVBQ3hDLE9BQU87QUFDSCxlQUFXLENBQUM7QUFBQSxFQUNoQjtBQUNKO0FBRUEsU0FBUyxlQUFxQjtBQUMxQixlQUFhLFFBQVEscUJBQXFCLEtBQUssVUFBVSxRQUFRLENBQUM7QUFDdEU7QUFFQSxTQUFTLGtCQUFrQixPQUFxQjtBQUM1QyxNQUFJLFNBQVMsU0FBUyxXQUFXLGFBQWEsZUFBZSxTQUFTLFNBQVMsU0FBUyxJQUFJLFNBQVMsU0FBUyxTQUFTLENBQUMsRUFBRSxRQUFRLEtBQUs7QUFDbkksUUFBSSxhQUFhLE9BQU8sNkRBQWdCLEtBQUssdUpBQW9DO0FBQ2pGLGlCQUFhLGFBQWEsV0FBVyxVQUFVLEdBQUcsQ0FBQyxFQUFFLFlBQVksSUFBSTtBQUNyRSxhQUFTLEtBQUssRUFBRSxNQUFNLFlBQVksTUFBYSxDQUFDO0FBQ2hELGFBQVMsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLFFBQVEsRUFBRSxLQUFLO0FBQ3pDLGVBQVcsU0FBUyxNQUFNLEdBQUcsV0FBVyxhQUFhLFdBQVc7QUFDaEUsaUJBQWE7QUFBQSxFQUNqQjtBQUNKO0FBRUEsU0FBUyxvQkFBMEI7QUFDL0IsTUFBSSxZQUFZO0FBQ2hCLE1BQUksWUFBWTtBQUNoQixNQUFJLE9BQU87QUFDWCxNQUFJLFNBQVMsV0FBVyxtQkFBbUIsV0FBVyxRQUFRLEdBQUcsRUFBRTtBQUVuRSxNQUFJLE9BQU87QUFDWCxNQUFJLFNBQVMsV0FBVyxHQUFHO0FBQ3ZCLFFBQUksU0FBUyw2REFBZ0IsV0FBVyxRQUFRLEdBQUcsV0FBVyxTQUFTLENBQUM7QUFBQSxFQUM1RSxPQUFPO0FBQ0gsYUFBUyxRQUFRLENBQUMsT0FBTyxVQUFVO0FBQy9CLFlBQU0sSUFBSSxNQUFNLFFBQVE7QUFDeEIsVUFBSSxTQUFTLEdBQUcsUUFBUSxDQUFDLEtBQUssTUFBTSxJQUFJLE1BQU0sTUFBTSxLQUFLLFdBQU0sV0FBVyxRQUFRLEdBQUcsQ0FBQztBQUFBLElBQzFGLENBQUM7QUFBQSxFQUNMO0FBRUEsTUFBSSxPQUFPO0FBQ1gsTUFBSSxTQUFTLDRGQUFzQixXQUFXLFFBQVEsR0FBRyxXQUFXLFNBQVMsRUFBRTtBQUNuRjtBQUVBLFNBQVMsaUJBQWlCLG9CQUFvQixRQUFROyIsCiAgIm5hbWVzIjogWyJHYW1lU3RhdGUiLCAiY3R4Il0KfQo=
