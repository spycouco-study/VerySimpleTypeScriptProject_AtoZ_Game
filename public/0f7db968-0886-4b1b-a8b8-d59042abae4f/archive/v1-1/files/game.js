var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["CONTROLS"] = 1] = "CONTROLS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2[Direction2["UP"] = 0] = "UP";
  Direction2[Direction2["DOWN"] = 1] = "DOWN";
  Direction2[Direction2["LEFT"] = 2] = "LEFT";
  Direction2[Direction2["RIGHT"] = 3] = "RIGHT";
  return Direction2;
})(Direction || {});
let canvas;
let ctx;
let gameConfig;
let assets;
let currentGameState = 0 /* TITLE */;
let snake = [];
let food;
let direction;
let nextDirection;
let score = 0;
let lastUpdateTime = 0;
let updateInterval;
let animationFrameId;
let bgmAudio = null;
async function initGame() {
  canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("Canvas with ID 'gameCanvas' not found.");
    return;
  }
  ctx = canvas.getContext("2d");
  await loadData();
  canvas.width = gameConfig.canvas.width;
  canvas.height = gameConfig.canvas.height;
  ctx.imageSmoothingEnabled = false;
  await loadAssets();
  setupInput();
  animationFrameId = requestAnimationFrame(gameLoop);
}
async function loadData() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    gameConfig = await response.json();
    updateInterval = gameConfig.game.initialSpeed;
  } catch (error) {
    console.error("Failed to load game data:", error);
    gameConfig = {
      canvas: { width: 600, height: 400 },
      grid: { size: 20 },
      game: { initialSnakeLength: 3, initialSpeed: 200, speedIncreaseInterval: 5, foodScoreValue: 10 },
      colors: { background: "#ADD8E6", wallOutline: "#8B4513", uiText: "#000000" },
      uiText: {
        title: "\uADC0\uC5EC\uC6B4 \uBC40 \uAC8C\uC784",
        startPrompt: "\uC544\uBB34 \uD0A4\uB098 \uB20C\uB7EC \uC2DC\uC791",
        controlsTitle: "\uC870\uC791\uBC95",
        controlsInstructions: ["WASD \uB610\uB294 \uD654\uC0B4\uD45C \uD0A4\uB85C \uBC40 \uC774\uB3D9", "\uBA39\uC774\uB97C \uBA39\uACE0 \uC810\uC218\uB97C \uC5BB\uACE0 \uBAB8\uC9D1\uC744 \uD0A4\uC6B0\uC138\uC694!", "\uBCBD\uC774\uB098 \uC790\uC2E0\uC758 \uBAB8\uC5D0 \uBD80\uB52A\uD788\uBA74 \uAC8C\uC784 \uB05D!", "\uC990\uAC70\uC6B4 \uAC8C\uC784 \uB418\uC138\uC694!"],
        gameOverTitle: "\uAC8C\uC784 \uC624\uBC84!",
        scorePrefix: "\uC810\uC218: ",
        restartPrompt: "R \uD0A4\uB97C \uB20C\uB7EC \uB2E4\uC2DC \uC2DC\uC791"
      },
      assets: { images: [], sounds: [] }
    };
  }
}
async function loadAssets() {
  assets = { images: {}, sounds: {} };
  const imagePromises = gameConfig.assets.images.map((asset) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = asset.path;
      img.onload = () => {
        asset.img = img;
        assets.images[asset.name] = asset;
        resolve();
      };
      img.onerror = () => {
        console.error(`Failed to load image: ${asset.path}`);
        reject();
      };
    });
  });
  const soundPromises = gameConfig.assets.sounds.map((asset) => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = asset.path;
      audio.oncanplaythrough = () => {
        asset.audio = audio;
        assets.sounds[asset.name] = asset;
        resolve();
      };
      audio.onerror = () => {
        console.error(`Failed to load sound: ${asset.path}`);
        reject();
      };
    });
  });
  try {
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
  } catch (error) {
    console.error("Error loading some assets:", error);
  }
}
function drawImage(imageName, x, y, width = gameConfig.grid.size, height = gameConfig.grid.size) {
  const asset = assets.images[imageName];
  if (asset && asset.img) {
    ctx.drawImage(asset.img, x, y, width, height);
  } else {
    ctx.fillStyle = "#FF00FF";
    ctx.fillRect(x, y, width, height);
    console.warn(`Image '${imageName}' not loaded or found.`);
  }
}
function playAudio(name, loop = false) {
  const asset = assets.sounds[name];
  if (asset && asset.audio) {
    const soundInstance = new Audio(asset.path);
    soundInstance.volume = asset.volume;
    soundInstance.loop = loop;
    soundInstance.play().catch((e) => console.warn(`Failed to play sound '${name}':`, e));
    if (loop) {
      bgmAudio = soundInstance;
    }
  } else {
    console.warn(`Sound '${name}' not loaded or found.`);
  }
}
function stopAudio(name) {
  if (name === "bgm_cute" && bgmAudio) {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
    bgmAudio = null;
  }
}
function setupInput() {
  document.addEventListener("keydown", (e) => {
    switch (currentGameState) {
      case 0 /* TITLE */:
        currentGameState = 1 /* CONTROLS */;
        break;
      case 1 /* CONTROLS */:
        currentGameState = 2 /* PLAYING */;
        startGame();
        break;
      case 2 /* PLAYING */:
        if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
          if (direction !== 1 /* DOWN */) nextDirection = 0 /* UP */;
        } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
          if (direction !== 0 /* UP */) nextDirection = 1 /* DOWN */;
        } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
          if (direction !== 3 /* RIGHT */) nextDirection = 2 /* LEFT */;
        } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
          if (direction !== 2 /* LEFT */) nextDirection = 3 /* RIGHT */;
        }
        break;
      case 3 /* GAME_OVER */:
        if (e.key === "r" || e.key === "R") {
          currentGameState = 0 /* TITLE */;
          stopAudio("bgm_cute");
        }
        break;
    }
  });
}
function resetGame() {
  snake = [];
  const gridSize = gameConfig.grid.size;
  const initialX = Math.floor(gameConfig.canvas.width / 2 / gridSize) * gridSize;
  const initialY = Math.floor(gameConfig.canvas.height / 2 / gridSize) * gridSize;
  for (let i = 0; i < gameConfig.game.initialSnakeLength; i++) {
    snake.push({ x: initialX - i * gridSize, y: initialY });
  }
  direction = 3 /* RIGHT */;
  nextDirection = 3 /* RIGHT */;
  score = 0;
  updateInterval = gameConfig.game.initialSpeed;
  spawnFood();
}
function startGame() {
  resetGame();
  lastUpdateTime = performance.now();
  playAudio("bgm_cute", true);
}
function gameOver() {
  currentGameState = 3 /* GAME_OVER */;
  playAudio("game_over_sound");
  stopAudio("bgm_cute");
}
function gameLoop(timestamp) {
  animationFrameId = requestAnimationFrame(gameLoop);
  draw();
  if (currentGameState === 2 /* PLAYING */) {
    const elapsed = timestamp - lastUpdateTime;
    if (elapsed > updateInterval) {
      lastUpdateTime = timestamp - elapsed % updateInterval;
      update();
    }
  }
}
function update() {
  direction = nextDirection;
  const head = { ...snake[0] };
  const gridSize = gameConfig.grid.size;
  switch (direction) {
    case 0 /* UP */:
      head.y -= gridSize;
      break;
    case 1 /* DOWN */:
      head.y += gridSize;
      break;
    case 2 /* LEFT */:
      head.x -= gridSize;
      break;
    case 3 /* RIGHT */:
      head.x += gridSize;
      break;
  }
  if (checkCollision(head)) {
    gameOver();
    return;
  }
  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score += gameConfig.game.foodScoreValue;
    playAudio("eat_sound");
    spawnFood();
    if (score % gameConfig.game.speedIncreaseInterval === 0 && updateInterval > 50) {
      updateInterval -= 10;
    }
  } else {
    snake.pop();
  }
}
function checkCollision(head) {
  const canvasWidth = gameConfig.canvas.width;
  const canvasHeight = gameConfig.canvas.height;
  const gridSize = gameConfig.grid.size;
  if (head.x < 0 || head.x >= canvasWidth || head.y < 0 || head.y >= canvasHeight) {
    return true;
  }
  for (let i = 1; i < snake.length; i++) {
    if (head.x === snake[i].x && head.y === snake[i].y) {
      return true;
    }
  }
  return false;
}
function spawnFood() {
  const gridSize = gameConfig.grid.size;
  const maxX = gameConfig.canvas.width / gridSize - 1;
  const maxY = gameConfig.canvas.height / gridSize - 1;
  let newFood;
  let collisionWithSnake;
  do {
    newFood = {
      x: Math.floor(Math.random() * (maxX + 1)) * gridSize,
      y: Math.floor(Math.random() * (maxY + 1)) * gridSize
    };
    collisionWithSnake = snake.some((segment) => segment.x === newFood.x && segment.y === newFood.y);
  } while (collisionWithSnake);
  food = newFood;
}
function draw() {
  ctx.clearRect(0, 0, gameConfig.canvas.width, gameConfig.canvas.height);
  ctx.fillStyle = gameConfig.colors.background;
  ctx.fillRect(0, 0, gameConfig.canvas.width, gameConfig.canvas.height);
  drawWallBorder();
  switch (currentGameState) {
    case 0 /* TITLE */:
      drawTitleScreen();
      break;
    case 1 /* CONTROLS */:
      drawControlsScreen();
      break;
    case 2 /* PLAYING */:
      drawPlayingScreen();
      break;
    case 3 /* GAME_OVER */:
      drawGameOverScreen();
      break;
  }
}
function drawTitleScreen() {
  ctx.fillStyle = gameConfig.colors.uiText;
  ctx.font = "48px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(gameConfig.uiText.title, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 - 50);
  ctx.font = "24px sans-serif";
  ctx.fillText(gameConfig.uiText.startPrompt, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 + 20);
}
function drawControlsScreen() {
  ctx.fillStyle = gameConfig.colors.uiText;
  ctx.font = "36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(gameConfig.uiText.controlsTitle, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 - 100);
  ctx.font = "20px sans-serif";
  gameConfig.uiText.controlsInstructions.forEach((instruction, index) => {
    ctx.fillText(instruction, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 - 40 + index * 30);
  });
  ctx.font = "20px sans-serif";
  ctx.fillText(gameConfig.uiText.startPrompt.replace("\uC2DC\uC791", "\uACC4\uC18D"), gameConfig.canvas.width / 2, gameConfig.canvas.height - 50);
}
function drawPlayingScreen() {
  const gridSize = gameConfig.grid.size;
  drawImage("food_apple", food.x, food.y);
  for (let i = 0; i < snake.length; i++) {
    const segment = snake[i];
    if (i === 0) {
      drawImage("snake_head", segment.x, segment.y);
    } else {
      drawImage("snake_body", segment.x, segment.y);
    }
  }
  ctx.fillStyle = gameConfig.colors.uiText;
  ctx.font = "24px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${gameConfig.uiText.scorePrefix}${score}`, 10, 30);
}
function drawGameOverScreen() {
  drawPlayingScreen();
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, gameConfig.canvas.width, gameConfig.canvas.height);
  ctx.fillStyle = gameConfig.colors.uiText;
  ctx.font = "48px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(gameConfig.uiText.gameOverTitle, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 - 50);
  ctx.font = "32px sans-serif";
  ctx.fillText(`${gameConfig.uiText.scorePrefix}${score}`, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 + 10);
  ctx.font = "24px sans-serif";
  ctx.fillText(gameConfig.uiText.restartPrompt, gameConfig.canvas.width / 2, gameConfig.canvas.height / 2 + 70);
}
function drawWallBorder() {
  const gridSize = gameConfig.grid.size;
  const canvasWidth = gameConfig.canvas.width;
  const canvasHeight = gameConfig.canvas.height;
  for (let x = 0; x < canvasWidth; x += gridSize) {
    drawImage("wall_tile", x, 0);
    drawImage("wall_tile", x, canvasHeight - gridSize);
  }
  for (let y = gridSize; y < canvasHeight - gridSize; y += gridSize) {
    drawImage("wall_tile", 0, y);
    drawImage("wall_tile", canvasWidth - gridSize, y);
  }
}
document.addEventListener("DOMContentLoaded", initGame);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIFBvaW50IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzOiB7XHJcbiAgICAgICAgd2lkdGg6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBncmlkOiB7XHJcbiAgICAgICAgc2l6ZTogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIGdhbWU6IHtcclxuICAgICAgICBpbml0aWFsU25ha2VMZW5ndGg6IG51bWJlcjtcclxuICAgICAgICBpbml0aWFsU3BlZWQ6IG51bWJlcjsgLy8gTG93ZXIgdmFsdWUgPSBmYXN0ZXJcclxuICAgICAgICBzcGVlZEluY3JlYXNlSW50ZXJ2YWw6IG51bWJlcjsgLy8gU2NvcmUgcG9pbnRzIHRvIGluY3JlYXNlIHNwZWVkXHJcbiAgICAgICAgZm9vZFNjb3JlVmFsdWU6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBjb2xvcnM6IHtcclxuICAgICAgICBiYWNrZ3JvdW5kOiBzdHJpbmc7XHJcbiAgICAgICAgd2FsbE91dGxpbmU6IHN0cmluZztcclxuICAgICAgICB1aVRleHQ6IHN0cmluZztcclxuICAgIH07XHJcbiAgICB1aVRleHQ6IHtcclxuICAgICAgICB0aXRsZTogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0UHJvbXB0OiBzdHJpbmc7XHJcbiAgICAgICAgY29udHJvbHNUaXRsZTogc3RyaW5nO1xyXG4gICAgICAgIGNvbnRyb2xzSW5zdHJ1Y3Rpb25zOiBzdHJpbmdbXTtcclxuICAgICAgICBnYW1lT3ZlclRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgc2NvcmVQcmVmaXg6IHN0cmluZztcclxuICAgICAgICByZXN0YXJ0UHJvbXB0OiBzdHJpbmc7XHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBJbWFnZUFzc2V0W107XHJcbiAgICAgICAgc291bmRzOiBTb3VuZEFzc2V0W107XHJcbiAgICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbiAgICBpbWc/OiBIVE1MSW1hZ2VFbGVtZW50OyAvLyBMb2FkZWQgaW1hZ2Ugb2JqZWN0XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG4gICAgYXVkaW8/OiBIVE1MQXVkaW9FbGVtZW50OyAvLyBMb2FkZWQgYXVkaW8gb2JqZWN0XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLFxyXG4gICAgQ09OVFJPTFMsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSXHJcbn1cclxuXHJcbmVudW0gRGlyZWN0aW9uIHtcclxuICAgIFVQLFxyXG4gICAgRE9XTixcclxuICAgIExFRlQsXHJcbiAgICBSSUdIVFxyXG59XHJcblxyXG4vLyBHbG9iYWwgZ2FtZSB2YXJpYWJsZXNcclxubGV0IGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbmxldCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxubGV0IGdhbWVDb25maWc6IEdhbWVDb25maWc7XHJcbmxldCBhc3NldHM6IHsgaW1hZ2VzOiBSZWNvcmQ8c3RyaW5nLCBJbWFnZUFzc2V0Pjsgc291bmRzOiBSZWNvcmQ8c3RyaW5nLCBTb3VuZEFzc2V0PjsgfTtcclxuXHJcbmxldCBjdXJyZW50R2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbmxldCBzbmFrZTogUG9pbnRbXSA9IFtdO1xyXG5sZXQgZm9vZDogUG9pbnQ7XHJcbmxldCBkaXJlY3Rpb246IERpcmVjdGlvbjtcclxubGV0IG5leHREaXJlY3Rpb246IERpcmVjdGlvbjsgLy8gVG8gcHJldmVudCBpbW1lZGlhdGUgcmV2ZXJzYWwgYW5kIHF1ZXVlIGlucHV0XHJcbmxldCBzY29yZTogbnVtYmVyID0gMDtcclxubGV0IGxhc3RVcGRhdGVUaW1lOiBudW1iZXIgPSAwO1xyXG5sZXQgdXBkYXRlSW50ZXJ2YWw6IG51bWJlcjsgLy8gTWlsbGlzZWNvbmRzIHBlciBzbmFrZSBtb3ZlbWVudFxyXG5sZXQgYW5pbWF0aW9uRnJhbWVJZDogbnVtYmVyOyAvLyBGb3IgcmVxdWVzdEFuaW1hdGlvbkZyYW1lXHJcblxyXG4vLyBTb3VuZCBpbnN0YW5jZXMgZm9yIGNvbnRyb2wgKHRvIHN0b3Avc3RhcnQgQkdNKVxyXG5sZXQgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuXHJcbi8vIEluaXRpYWxpemF0aW9uIGZ1bmN0aW9uLCBjYWxsZWQgd2hlbiB0aGUgRE9NIGlzIHJlYWR5XHJcbmFzeW5jIGZ1bmN0aW9uIGluaXRHYW1lKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyB3aXRoIElEICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuXHJcbiAgICBhd2FpdCBsb2FkRGF0YSgpO1xyXG4gICAgY2FudmFzLndpZHRoID0gZ2FtZUNvbmZpZy5jYW52YXMud2lkdGg7XHJcbiAgICBjYW52YXMuaGVpZ2h0ID0gZ2FtZUNvbmZpZy5jYW52YXMuaGVpZ2h0O1xyXG4gICAgY3R4LmltYWdlU21vb3RoaW5nRW5hYmxlZCA9IGZhbHNlOyAvLyBGb3IgcGl4ZWwgYXJ0XHJcblxyXG4gICAgYXdhaXQgbG9hZEFzc2V0cygpO1xyXG4gICAgc2V0dXBJbnB1dCgpO1xyXG5cclxuICAgIC8vIFN0YXJ0IHRoZSBnYW1lIGxvb3AgZm9yIHJlbmRlcmluZyB0aXRsZSBzY3JlZW5cclxuICAgIGFuaW1hdGlvbkZyYW1lSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xyXG59XHJcblxyXG4vLyBMb2FkcyBnYW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBkYXRhLmpzb25cclxuYXN5bmMgZnVuY3Rpb24gbG9hZERhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBnYW1lQ29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIEdhbWVDb25maWc7XHJcbiAgICAgICAgdXBkYXRlSW50ZXJ2YWwgPSBnYW1lQ29uZmlnLmdhbWUuaW5pdGlhbFNwZWVkO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhOlwiLCBlcnJvcik7XHJcbiAgICAgICAgLy8gUHJvdmlkZSBhIG1pbmltYWwgZGVmYXVsdCBjb25maWcgdG8gcHJldmVudCB0b3RhbCBmYWlsdXJlXHJcbiAgICAgICAgZ2FtZUNvbmZpZyA9IHtcclxuICAgICAgICAgICAgY2FudmFzOiB7IHdpZHRoOiA2MDAsIGhlaWdodDogNDAwIH0sXHJcbiAgICAgICAgICAgIGdyaWQ6IHsgc2l6ZTogMjAgfSxcclxuICAgICAgICAgICAgZ2FtZTogeyBpbml0aWFsU25ha2VMZW5ndGg6IDMsIGluaXRpYWxTcGVlZDogMjAwLCBzcGVlZEluY3JlYXNlSW50ZXJ2YWw6IDUsIGZvb2RTY29yZVZhbHVlOiAxMCB9LFxyXG4gICAgICAgICAgICBjb2xvcnM6IHsgYmFja2dyb3VuZDogJyNBREQ4RTYnLCB3YWxsT3V0bGluZTogJyM4QjQ1MTMnLCB1aVRleHQ6ICcjMDAwMDAwJyB9LFxyXG4gICAgICAgICAgICB1aVRleHQ6IHtcclxuICAgICAgICAgICAgICAgIHRpdGxlOiAnXHVBREMwXHVDNUVDXHVDNkI0IFx1QkM0MCBcdUFDOENcdUM3ODQnLFxyXG4gICAgICAgICAgICAgICAgc3RhcnRQcm9tcHQ6ICdcdUM1NDRcdUJCMzQgXHVEMEE0XHVCMDk4IFx1QjIwQ1x1QjdFQyBcdUMyRENcdUM3OTEnLFxyXG4gICAgICAgICAgICAgICAgY29udHJvbHNUaXRsZTogJ1x1Qzg3MFx1Qzc5MVx1QkM5NScsXHJcbiAgICAgICAgICAgICAgICBjb250cm9sc0luc3RydWN0aW9uczogWydXQVNEIFx1QjYxMFx1QjI5NCBcdUQ2NTRcdUMwQjRcdUQ0NUMgXHVEMEE0XHVCODVDIFx1QkM0MCBcdUM3NzRcdUIzRDknLCAnXHVCQTM5XHVDNzc0XHVCOTdDIFx1QkEzOVx1QUNFMCBcdUM4MTBcdUMyMThcdUI5N0MgXHVDNUJCXHVBQ0UwIFx1QkFCOFx1QzlEMVx1Qzc0NCBcdUQwQTRcdUM2QjBcdUMxMzhcdUM2OTQhJywgJ1x1QkNCRFx1Qzc3NFx1QjA5OCBcdUM3OTBcdUMyRTBcdUM3NTggXHVCQUI4XHVDNUQwIFx1QkQ4MFx1QjUyQVx1RDc4OFx1QkE3NCBcdUFDOENcdUM3ODQgXHVCMDVEIScsICdcdUM5OTBcdUFDNzBcdUM2QjQgXHVBQzhDXHVDNzg0IFx1QjQxOFx1QzEzOFx1QzY5NCEnXSxcclxuICAgICAgICAgICAgICAgIGdhbWVPdmVyVGl0bGU6ICdcdUFDOENcdUM3ODQgXHVDNjI0XHVCQzg0IScsXHJcbiAgICAgICAgICAgICAgICBzY29yZVByZWZpeDogJ1x1QzgxMFx1QzIxODogJyxcclxuICAgICAgICAgICAgICAgIHJlc3RhcnRQcm9tcHQ6ICdSIFx1RDBBNFx1Qjk3QyBcdUIyMENcdUI3RUMgXHVCMkU0XHVDMkRDIFx1QzJEQ1x1Qzc5MSdcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgYXNzZXRzOiB7IGltYWdlczogW10sIHNvdW5kczogW10gfVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIExvYWRzIGFsbCBpbWFnZSBhbmQgc291bmQgYXNzZXRzXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBhc3NldHMgPSB7IGltYWdlczoge30sIHNvdW5kczoge30gfSBhcyBhbnk7IC8vIEluaXRpYWxpemUgYXNzZXRzIG9iamVjdFxyXG5cclxuICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBnYW1lQ29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGFzc2V0ID0+IHtcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgaW1nLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBhc3NldC5pbWcgPSBpbWc7XHJcbiAgICAgICAgICAgICAgICBhc3NldHMuaW1hZ2VzW2Fzc2V0Lm5hbWVdID0gYXNzZXQ7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdCgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3Qgc291bmRQcm9taXNlcyA9IGdhbWVDb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoYXNzZXQgPT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnNyYyA9IGFzc2V0LnBhdGg7XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7IC8vIEVuc3VyZSBzb3VuZCBpcyByZWFkeSB0byBwbGF5XHJcbiAgICAgICAgICAgICAgICBhc3NldC5hdWRpbyA9IGF1ZGlvO1xyXG4gICAgICAgICAgICAgICAgYXNzZXRzLnNvdW5kc1thc3NldC5uYW1lXSA9IGFzc2V0O1xyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7YXNzZXQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdCgpO1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBzb21lIGFzc2V0czpcIiwgZXJyb3IpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBEcmF3cyBhbiBpbWFnZSBhc3NldCwgc2NhbGluZyBpdCB0byB0aGUgZ3JpZCBzaXplXHJcbmZ1bmN0aW9uIGRyYXdJbWFnZShpbWFnZU5hbWU6IHN0cmluZywgeDogbnVtYmVyLCB5OiBudW1iZXIsIHdpZHRoOiBudW1iZXIgPSBnYW1lQ29uZmlnLmdyaWQuc2l6ZSwgaGVpZ2h0OiBudW1iZXIgPSBnYW1lQ29uZmlnLmdyaWQuc2l6ZSk6IHZvaWQge1xyXG4gICAgY29uc3QgYXNzZXQgPSBhc3NldHMuaW1hZ2VzW2ltYWdlTmFtZV07XHJcbiAgICBpZiAoYXNzZXQgJiYgYXNzZXQuaW1nKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZShhc3NldC5pbWcsIHgsIHksIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGYWxsYmFjayBmb3IgbWlzc2luZyBpbWFnZXMgKGRyYXcgYSBjb2xvcmVkIHNxdWFyZSlcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gJyNGRjAwRkYnOyAvLyBNYWdlbnRhIGZvciBtaXNzaW5nIHRleHR1cmVzXHJcbiAgICAgICAgY3R4LmZpbGxSZWN0KHgsIHksIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgICAgIGNvbnNvbGUud2FybihgSW1hZ2UgJyR7aW1hZ2VOYW1lfScgbm90IGxvYWRlZCBvciBmb3VuZC5gKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gUGxheXMgYSBzb3VuZCBlZmZlY3RcclxuZnVuY3Rpb24gcGxheUF1ZGlvKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XHJcbiAgICBjb25zdCBhc3NldCA9IGFzc2V0cy5zb3VuZHNbbmFtZV07XHJcbiAgICBpZiAoYXNzZXQgJiYgYXNzZXQuYXVkaW8pIHtcclxuICAgICAgICAvLyBDcmVhdGUgYSBuZXcgQXVkaW8gaW5zdGFuY2UgdG8gYWxsb3cgbXVsdGlwbGUgc2ltdWx0YW5lb3VzIHBsYXlzIGZvciBlZmZlY3RzXHJcbiAgICAgICAgY29uc3Qgc291bmRJbnN0YW5jZSA9IG5ldyBBdWRpbyhhc3NldC5wYXRoKTtcclxuICAgICAgICBzb3VuZEluc3RhbmNlLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICBzb3VuZEluc3RhbmNlLmxvb3AgPSBsb29wO1xyXG4gICAgICAgIHNvdW5kSW5zdGFuY2UucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBGYWlsZWQgdG8gcGxheSBzb3VuZCAnJHtuYW1lfSc6YCwgZSkpO1xyXG5cclxuICAgICAgICBpZiAobG9vcCkgeyAvLyBLZWVwIHRyYWNrIG9mIEJHTSBpbnN0YW5jZVxyXG4gICAgICAgICAgICBiZ21BdWRpbyA9IHNvdW5kSW5zdGFuY2U7XHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kICcke25hbWV9JyBub3QgbG9hZGVkIG9yIGZvdW5kLmApO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdG9wcyBhIGxvb3BpbmcgYXVkaW8gKGxpa2UgQkdNKVxyXG5mdW5jdGlvbiBzdG9wQXVkaW8obmFtZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBpZiAobmFtZSA9PT0gJ2JnbV9jdXRlJyAmJiBiZ21BdWRpbykge1xyXG4gICAgICAgIGJnbUF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgYmdtQXVkaW8uY3VycmVudFRpbWUgPSAwOyAvLyBSZXNldCB0byBzdGFydFxyXG4gICAgICAgIGJnbUF1ZGlvID0gbnVsbDtcclxuICAgIH1cclxufVxyXG5cclxuLy8gU2V0cyB1cCBrZXlib2FyZCBldmVudCBsaXN0ZW5lclxyXG5mdW5jdGlvbiBzZXR1cElucHV0KCk6IHZvaWQge1xyXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgc3dpdGNoIChjdXJyZW50R2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgLy8gQW55IGtleSBzdGFydHMgdGhlIGdhbWUgZmxvd1xyXG4gICAgICAgICAgICAgICAgY3VycmVudEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5DT05UUk9MUztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5DT05UUk9MUzpcclxuICAgICAgICAgICAgICAgIC8vIEFueSBrZXkgbW92ZXMgZnJvbSBjb250cm9scyB0byBwbGF5aW5nXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50R2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgICAgICAgICBzdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICAgICAgLy8gT25seSBhbGxvdyBkaXJlY3Rpb24gY2hhbmdlcyB0aGF0IGFyZW4ndCBpbW1lZGlhdGUgcmV2ZXJzYWxzXHJcbiAgICAgICAgICAgICAgICBpZiAoZS5rZXkgPT09ICdBcnJvd1VwJyB8fCBlLmtleSA9PT0gJ3cnIHx8IGUua2V5ID09PSAnVycpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZGlyZWN0aW9uICE9PSBEaXJlY3Rpb24uRE9XTikgbmV4dERpcmVjdGlvbiA9IERpcmVjdGlvbi5VUDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoZS5rZXkgPT09ICdBcnJvd0Rvd24nIHx8IGUua2V5ID09PSAncycgfHwgZS5rZXkgPT09ICdTJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChkaXJlY3Rpb24gIT09IERpcmVjdGlvbi5VUCkgbmV4dERpcmVjdGlvbiA9IERpcmVjdGlvbi5ET1dOO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93TGVmdCcgfHwgZS5rZXkgPT09ICdhJyB8fCBlLmtleSA9PT0gJ0EnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRpcmVjdGlvbiAhPT0gRGlyZWN0aW9uLlJJR0hUKSBuZXh0RGlyZWN0aW9uID0gRGlyZWN0aW9uLkxFRlQ7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dSaWdodCcgfHwgZS5rZXkgPT09ICdkJyB8fCBlLmtleSA9PT0gJ0QnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRpcmVjdGlvbiAhPT0gRGlyZWN0aW9uLkxFRlQpIG5leHREaXJlY3Rpb24gPSBEaXJlY3Rpb24uUklHSFQ7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgaWYgKGUua2V5ID09PSAncicgfHwgZS5rZXkgPT09ICdSJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7IC8vIEdvIGJhY2sgdG8gdGl0bGUgdG8gcmVzdGFydCBmdWxsIGN5Y2xlXHJcbiAgICAgICAgICAgICAgICAgICAgc3RvcEF1ZGlvKCdiZ21fY3V0ZScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbn1cclxuXHJcbi8vIFJlc2V0cyBnYW1lIHN0YXRlIGZvciBhIG5ldyByb3VuZFxyXG5mdW5jdGlvbiByZXNldEdhbWUoKTogdm9pZCB7XHJcbiAgICBzbmFrZSA9IFtdO1xyXG4gICAgY29uc3QgZ3JpZFNpemUgPSBnYW1lQ29uZmlnLmdyaWQuc2l6ZTtcclxuICAgIGNvbnN0IGluaXRpYWxYID0gTWF0aC5mbG9vcihnYW1lQ29uZmlnLmNhbnZhcy53aWR0aCAvIDIgLyBncmlkU2l6ZSkgKiBncmlkU2l6ZTtcclxuICAgIGNvbnN0IGluaXRpYWxZID0gTWF0aC5mbG9vcihnYW1lQ29uZmlnLmNhbnZhcy5oZWlnaHQgLyAyIC8gZ3JpZFNpemUpICogZ3JpZFNpemU7XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZSBzbmFrZSBpbiB0aGUgY2VudGVyLCBtb3ZpbmcgcmlnaHRcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2FtZUNvbmZpZy5nYW1lLmluaXRpYWxTbmFrZUxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgc25ha2UucHVzaCh7IHg6IGluaXRpYWxYIC0gaSAqIGdyaWRTaXplLCB5OiBpbml0aWFsWSB9KTtcclxuICAgIH1cclxuXHJcbiAgICBkaXJlY3Rpb24gPSBEaXJlY3Rpb24uUklHSFQ7XHJcbiAgICBuZXh0RGlyZWN0aW9uID0gRGlyZWN0aW9uLlJJR0hUOyAvLyBSZXNldCBwZW5kaW5nIGRpcmVjdGlvblxyXG4gICAgc2NvcmUgPSAwO1xyXG4gICAgdXBkYXRlSW50ZXJ2YWwgPSBnYW1lQ29uZmlnLmdhbWUuaW5pdGlhbFNwZWVkOyAvLyBSZXNldCBzcGVlZFxyXG4gICAgc3Bhd25Gb29kKCk7XHJcbn1cclxuXHJcbi8vIFN0YXJ0cyB0aGUgZ2FtZSBwcm9wZXJcclxuZnVuY3Rpb24gc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgcmVzZXRHYW1lKCk7XHJcbiAgICBsYXN0VXBkYXRlVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpOyAvLyBSZXNldCB0aW1lc3RhbXAgZm9yIGdhbWUgdXBkYXRlc1xyXG4gICAgcGxheUF1ZGlvKCdiZ21fY3V0ZScsIHRydWUpOyAvLyBTdGFydCBiYWNrZ3JvdW5kIG11c2ljXHJcbn1cclxuXHJcbi8vIEVuZHMgdGhlIGdhbWVcclxuZnVuY3Rpb24gZ2FtZU92ZXIoKTogdm9pZCB7XHJcbiAgICBjdXJyZW50R2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgIHBsYXlBdWRpbygnZ2FtZV9vdmVyX3NvdW5kJyk7IC8vIFBsYXkgZ2FtZSBvdmVyIHNvdW5kXHJcbiAgICBzdG9wQXVkaW8oJ2JnbV9jdXRlJyk7IC8vIFN0b3AgYmFja2dyb3VuZCBtdXNpY1xyXG59XHJcblxyXG4vLyBNYWluIGdhbWUgbG9vcCB1c2luZyByZXF1ZXN0QW5pbWF0aW9uRnJhbWVcclxuZnVuY3Rpb24gZ2FtZUxvb3AodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcclxuICAgIGFuaW1hdGlvbkZyYW1lSWQgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApOyAvLyBTY2hlZHVsZSBuZXh0IGZyYW1lXHJcblxyXG4gICAgZHJhdygpOyAvLyBBbHdheXMgZHJhdywgcmVnYXJkbGVzcyBvZiBnYW1lIHN0YXRlXHJcblxyXG4gICAgaWYgKGN1cnJlbnRHYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgY29uc3QgZWxhcHNlZCA9IHRpbWVzdGFtcCAtIGxhc3RVcGRhdGVUaW1lO1xyXG4gICAgICAgIGlmIChlbGFwc2VkID4gdXBkYXRlSW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgLy8gQWRqdXN0IGxhc3RVcGRhdGVUaW1lIHRvIGFjY291bnQgZm9yIHBvdGVudGlhbCBmcmFtZSBkcm9wcyxcclxuICAgICAgICAgICAgLy8gZW5zdXJpbmcgY29uc2lzdGVudCB1cGRhdGUgdGltaW5nLlxyXG4gICAgICAgICAgICBsYXN0VXBkYXRlVGltZSA9IHRpbWVzdGFtcCAtIChlbGFwc2VkICUgdXBkYXRlSW50ZXJ2YWwpO1xyXG4gICAgICAgICAgICB1cGRhdGUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFVwZGF0ZXMgZ2FtZSBsb2dpYyAobW92ZW1lbnQsIGNvbGxpc2lvbnMsIGV0Yy4pXHJcbmZ1bmN0aW9uIHVwZGF0ZSgpOiB2b2lkIHtcclxuICAgIGRpcmVjdGlvbiA9IG5leHREaXJlY3Rpb247IC8vIEFwcGx5IHRoZSBuZXh0IGRlc2lyZWQgZGlyZWN0aW9uXHJcbiAgICBjb25zdCBoZWFkID0geyAuLi5zbmFrZVswXSB9OyAvLyBDb3B5IGhlYWQgdG8gY2FsY3VsYXRlIG5ldyBwb3NpdGlvblxyXG4gICAgY29uc3QgZ3JpZFNpemUgPSBnYW1lQ29uZmlnLmdyaWQuc2l6ZTtcclxuXHJcbiAgICAvLyBNb3ZlIGhlYWQgYmFzZWQgb24gY3VycmVudCBkaXJlY3Rpb25cclxuICAgIHN3aXRjaCAoZGlyZWN0aW9uKSB7XHJcbiAgICAgICAgY2FzZSBEaXJlY3Rpb24uVVA6XHJcbiAgICAgICAgICAgIGhlYWQueSAtPSBncmlkU2l6ZTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBEaXJlY3Rpb24uRE9XTjpcclxuICAgICAgICAgICAgaGVhZC55ICs9IGdyaWRTaXplO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIERpcmVjdGlvbi5MRUZUOlxyXG4gICAgICAgICAgICBoZWFkLnggLT0gZ3JpZFNpemU7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgRGlyZWN0aW9uLlJJR0hUOlxyXG4gICAgICAgICAgICBoZWFkLnggKz0gZ3JpZFNpemU7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGZvciBjb2xsaXNpb25zXHJcbiAgICBpZiAoY2hlY2tDb2xsaXNpb24oaGVhZCkpIHtcclxuICAgICAgICBnYW1lT3ZlcigpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBBZGQgbmV3IGhlYWQgdG8gdGhlIHNuYWtlXHJcbiAgICBzbmFrZS51bnNoaWZ0KGhlYWQpO1xyXG5cclxuICAgIC8vIENoZWNrIGlmIGZvb2Qgd2FzIGVhdGVuXHJcbiAgICBpZiAoaGVhZC54ID09PSBmb29kLnggJiYgaGVhZC55ID09PSBmb29kLnkpIHtcclxuICAgICAgICBzY29yZSArPSBnYW1lQ29uZmlnLmdhbWUuZm9vZFNjb3JlVmFsdWU7XHJcbiAgICAgICAgcGxheUF1ZGlvKCdlYXRfc291bmQnKTtcclxuICAgICAgICBzcGF3bkZvb2QoKTsgLy8gUGxhY2UgbmV3IGZvb2RcclxuXHJcbiAgICAgICAgLy8gSW5jcmVhc2Ugc3BlZWQgZXZlcnkgTiBwb2ludHNcclxuICAgICAgICBpZiAoc2NvcmUgJSBnYW1lQ29uZmlnLmdhbWUuc3BlZWRJbmNyZWFzZUludGVydmFsID09PSAwICYmIHVwZGF0ZUludGVydmFsID4gNTApIHtcclxuICAgICAgICAgICAgdXBkYXRlSW50ZXJ2YWwgLT0gMTA7IC8vIE1ha2UgaXQgZmFzdGVyXHJcbiAgICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBJZiBubyBmb29kIGVhdGVuLCByZW1vdmUgdGFpbCB0byBzaW11bGF0ZSBtb3ZlbWVudFxyXG4gICAgICAgIHNuYWtlLnBvcCgpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBDaGVja3MgZm9yIGNvbGxpc2lvbnMgKHdhbGxzIG9yIHNlbGYpXHJcbmZ1bmN0aW9uIGNoZWNrQ29sbGlzaW9uKGhlYWQ6IFBvaW50KTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBjYW52YXNXaWR0aCA9IGdhbWVDb25maWcuY2FudmFzLndpZHRoO1xyXG4gICAgY29uc3QgY2FudmFzSGVpZ2h0ID0gZ2FtZUNvbmZpZy5jYW52YXMuaGVpZ2h0O1xyXG4gICAgY29uc3QgZ3JpZFNpemUgPSBnYW1lQ29uZmlnLmdyaWQuc2l6ZTtcclxuXHJcbiAgICAvLyBXYWxsIGNvbGxpc2lvblxyXG4gICAgaWYgKGhlYWQueCA8IDAgfHwgaGVhZC54ID49IGNhbnZhc1dpZHRoIHx8IGhlYWQueSA8IDAgfHwgaGVhZC55ID49IGNhbnZhc0hlaWdodCkge1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlbGYgY29sbGlzaW9uIChzdGFydCBjaGVja2luZyBmcm9tIDR0aCBzZWdtZW50IHRvIGF2b2lkIGltbWVkaWF0ZSBzZWxmLWNvbGxpc2lvbiBkdWUgdG8gaGVhZC1ib2R5IG92ZXJsYXApXHJcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IHNuYWtlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgaWYgKGhlYWQueCA9PT0gc25ha2VbaV0ueCAmJiBoZWFkLnkgPT09IHNuYWtlW2ldLnkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuLy8gUGxhY2VzIGZvb2QgYXQgYSByYW5kb20gdmFsaWQgbG9jYXRpb25cclxuZnVuY3Rpb24gc3Bhd25Gb29kKCk6IHZvaWQge1xyXG4gICAgY29uc3QgZ3JpZFNpemUgPSBnYW1lQ29uZmlnLmdyaWQuc2l6ZTtcclxuICAgIGNvbnN0IG1heFggPSAoZ2FtZUNvbmZpZy5jYW52YXMud2lkdGggLyBncmlkU2l6ZSkgLSAxO1xyXG4gICAgY29uc3QgbWF4WSA9IChnYW1lQ29uZmlnLmNhbnZhcy5oZWlnaHQgLyBncmlkU2l6ZSkgLSAxO1xyXG5cclxuICAgIGxldCBuZXdGb29kOiBQb2ludDtcclxuICAgIGxldCBjb2xsaXNpb25XaXRoU25ha2U6IGJvb2xlYW47XHJcblxyXG4gICAgZG8ge1xyXG4gICAgICAgIG5ld0Zvb2QgPSB7XHJcbiAgICAgICAgICAgIHg6IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXhYICsgMSkpICogZ3JpZFNpemUsXHJcbiAgICAgICAgICAgIHk6IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXhZICsgMSkpICogZ3JpZFNpemVcclxuICAgICAgICB9O1xyXG4gICAgICAgIGNvbGxpc2lvbldpdGhTbmFrZSA9IHNuYWtlLnNvbWUoc2VnbWVudCA9PiBzZWdtZW50LnggPT09IG5ld0Zvb2QueCAmJiBzZWdtZW50LnkgPT09IG5ld0Zvb2QueSk7XHJcbiAgICB9IHdoaWxlIChjb2xsaXNpb25XaXRoU25ha2UpO1xyXG5cclxuICAgIGZvb2QgPSBuZXdGb29kO1xyXG59XHJcblxyXG4vLyBEcmF3cyBhbGwgZ2FtZSBlbGVtZW50cyBiYXNlZCBvbiBjdXJyZW50IHN0YXRlXHJcbmZ1bmN0aW9uIGRyYXcoKTogdm9pZCB7XHJcbiAgICBjdHguY2xlYXJSZWN0KDAsIDAsIGdhbWVDb25maWcuY2FudmFzLndpZHRoLCBnYW1lQ29uZmlnLmNhbnZhcy5oZWlnaHQpO1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVDb25maWcuY29sb3JzLmJhY2tncm91bmQ7XHJcbiAgICBjdHguZmlsbFJlY3QoMCwgMCwgZ2FtZUNvbmZpZy5jYW52YXMud2lkdGgsIGdhbWVDb25maWcuY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgLy8gRHJhdyB3YWxsIGJvcmRlclxyXG4gICAgZHJhd1dhbGxCb3JkZXIoKTtcclxuXHJcbiAgICBzd2l0Y2ggKGN1cnJlbnRHYW1lU3RhdGUpIHtcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkNPTlRST0xTOlxyXG4gICAgICAgICAgICBkcmF3Q29udHJvbHNTY3JlZW4oKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgZHJhd1BsYXlpbmdTY3JlZW4oKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICBkcmF3R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIERyYXdzIHRoZSB0aXRsZSBzY3JlZW5cclxuZnVuY3Rpb24gZHJhd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVDb25maWcuY29sb3JzLnVpVGV4dDtcclxuICAgIGN0eC5mb250ID0gJzQ4cHggc2Fucy1zZXJpZic7XHJcbiAgICBjdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICBjdHguZmlsbFRleHQoZ2FtZUNvbmZpZy51aVRleHQudGl0bGUsIGdhbWVDb25maWcuY2FudmFzLndpZHRoIC8gMiwgZ2FtZUNvbmZpZy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICBjdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgY3R4LmZpbGxUZXh0KGdhbWVDb25maWcudWlUZXh0LnN0YXJ0UHJvbXB0LCBnYW1lQ29uZmlnLmNhbnZhcy53aWR0aCAvIDIsIGdhbWVDb25maWcuY2FudmFzLmhlaWdodCAvIDIgKyAyMCk7XHJcbn1cclxuXHJcbi8vIERyYXdzIHRoZSBjb250cm9scyBzY3JlZW5cclxuZnVuY3Rpb24gZHJhd0NvbnRyb2xzU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVDb25maWcuY29sb3JzLnVpVGV4dDtcclxuICAgIGN0eC5mb250ID0gJzM2cHggc2Fucy1zZXJpZic7XHJcbiAgICBjdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICBjdHguZmlsbFRleHQoZ2FtZUNvbmZpZy51aVRleHQuY29udHJvbHNUaXRsZSwgZ2FtZUNvbmZpZy5jYW52YXMud2lkdGggLyAyLCBnYW1lQ29uZmlnLmNhbnZhcy5oZWlnaHQgLyAyIC0gMTAwKTtcclxuXHJcbiAgICBjdHguZm9udCA9ICcyMHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgZ2FtZUNvbmZpZy51aVRleHQuY29udHJvbHNJbnN0cnVjdGlvbnMuZm9yRWFjaCgoaW5zdHJ1Y3Rpb24sIGluZGV4KSA9PiB7XHJcbiAgICAgICAgY3R4LmZpbGxUZXh0KGluc3RydWN0aW9uLCBnYW1lQ29uZmlnLmNhbnZhcy53aWR0aCAvIDIsIGdhbWVDb25maWcuY2FudmFzLmhlaWdodCAvIDIgLSA0MCArIGluZGV4ICogMzApO1xyXG4gICAgfSk7XHJcblxyXG4gICAgY3R4LmZvbnQgPSAnMjBweCBzYW5zLXNlcmlmJztcclxuICAgIGN0eC5maWxsVGV4dChnYW1lQ29uZmlnLnVpVGV4dC5zdGFydFByb21wdC5yZXBsYWNlKCdcdUMyRENcdUM3OTEnLCAnXHVBQ0M0XHVDMThEJyksIGdhbWVDb25maWcuY2FudmFzLndpZHRoIC8gMiwgZ2FtZUNvbmZpZy5jYW52YXMuaGVpZ2h0IC0gNTApO1xyXG59XHJcblxyXG4vLyBEcmF3cyB0aGUgbWFpbiBnYW1lIGVsZW1lbnRzIChzbmFrZSwgZm9vZCwgc2NvcmUpXHJcbmZ1bmN0aW9uIGRyYXdQbGF5aW5nU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgY29uc3QgZ3JpZFNpemUgPSBnYW1lQ29uZmlnLmdyaWQuc2l6ZTtcclxuXHJcbiAgICAvLyBEcmF3IGZvb2RcclxuICAgIGRyYXdJbWFnZSgnZm9vZF9hcHBsZScsIGZvb2QueCwgZm9vZC55KTtcclxuXHJcbiAgICAvLyBEcmF3IHNuYWtlXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNuYWtlLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3Qgc2VnbWVudCA9IHNuYWtlW2ldO1xyXG4gICAgICAgIGlmIChpID09PSAwKSB7XHJcbiAgICAgICAgICAgIGRyYXdJbWFnZSgnc25ha2VfaGVhZCcsIHNlZ21lbnQueCwgc2VnbWVudC55KTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBkcmF3SW1hZ2UoJ3NuYWtlX2JvZHknLCBzZWdtZW50LngsIHNlZ21lbnQueSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIERyYXcgc2NvcmVcclxuICAgIGN0eC5maWxsU3R5bGUgPSBnYW1lQ29uZmlnLmNvbG9ycy51aVRleHQ7XHJcbiAgICBjdHguZm9udCA9ICcyNHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgIGN0eC5maWxsVGV4dChgJHtnYW1lQ29uZmlnLnVpVGV4dC5zY29yZVByZWZpeH0ke3Njb3JlfWAsIDEwLCAzMCk7XHJcbn1cclxuXHJcbi8vIERyYXdzIHRoZSBnYW1lIG92ZXIgc2NyZWVuXHJcbmZ1bmN0aW9uIGRyYXdHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgIGRyYXdQbGF5aW5nU2NyZWVuKCk7IC8vIFNob3cgdGhlIGZpbmFsIGdhbWUgc3RhdGUgd2l0aCBzbmFrZSBhbmQgZm9vZFxyXG4gICAgY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNyknOyAvLyBEaW0gYmFja2dyb3VuZFxyXG4gICAgY3R4LmZpbGxSZWN0KDAsIDAsIGdhbWVDb25maWcuY2FudmFzLndpZHRoLCBnYW1lQ29uZmlnLmNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgIGN0eC5maWxsU3R5bGUgPSBnYW1lQ29uZmlnLmNvbG9ycy51aVRleHQ7XHJcbiAgICBjdHguZm9udCA9ICc0OHB4IHNhbnMtc2VyaWYnO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgY3R4LmZpbGxUZXh0KGdhbWVDb25maWcudWlUZXh0LmdhbWVPdmVyVGl0bGUsIGdhbWVDb25maWcuY2FudmFzLndpZHRoIC8gMiwgZ2FtZUNvbmZpZy5jYW52YXMuaGVpZ2h0IC8gMiAtIDUwKTtcclxuXHJcbiAgICBjdHguZm9udCA9ICczMnB4IHNhbnMtc2VyaWYnO1xyXG4gICAgY3R4LmZpbGxUZXh0KGAke2dhbWVDb25maWcudWlUZXh0LnNjb3JlUHJlZml4fSR7c2NvcmV9YCwgZ2FtZUNvbmZpZy5jYW52YXMud2lkdGggLyAyLCBnYW1lQ29uZmlnLmNhbnZhcy5oZWlnaHQgLyAyICsgMTApO1xyXG5cclxuICAgIGN0eC5mb250ID0gJzI0cHggc2Fucy1zZXJpZic7XHJcbiAgICBjdHguZmlsbFRleHQoZ2FtZUNvbmZpZy51aVRleHQucmVzdGFydFByb21wdCwgZ2FtZUNvbmZpZy5jYW52YXMud2lkdGggLyAyLCBnYW1lQ29uZmlnLmNhbnZhcy5oZWlnaHQgLyAyICsgNzApO1xyXG59XHJcblxyXG4vLyBEcmF3cyB0aGUgZGVjb3JhdGl2ZSB3YWxsIGJvcmRlciB1c2luZyB3YWxsX3RpbGUgYXNzZXRcclxuZnVuY3Rpb24gZHJhd1dhbGxCb3JkZXIoKTogdm9pZCB7XHJcbiAgICBjb25zdCBncmlkU2l6ZSA9IGdhbWVDb25maWcuZ3JpZC5zaXplO1xyXG4gICAgY29uc3QgY2FudmFzV2lkdGggPSBnYW1lQ29uZmlnLmNhbnZhcy53aWR0aDtcclxuICAgIGNvbnN0IGNhbnZhc0hlaWdodCA9IGdhbWVDb25maWcuY2FudmFzLmhlaWdodDtcclxuXHJcbiAgICAvLyBUb3AgYW5kIEJvdHRvbSB3YWxsc1xyXG4gICAgZm9yIChsZXQgeCA9IDA7IHggPCBjYW52YXNXaWR0aDsgeCArPSBncmlkU2l6ZSkge1xyXG4gICAgICAgIGRyYXdJbWFnZSgnd2FsbF90aWxlJywgeCwgMCk7IC8vIFRvcFxyXG4gICAgICAgIGRyYXdJbWFnZSgnd2FsbF90aWxlJywgeCwgY2FudmFzSGVpZ2h0IC0gZ3JpZFNpemUpOyAvLyBCb3R0b21cclxuICAgIH1cclxuXHJcbiAgICAvLyBMZWZ0IGFuZCBSaWdodCB3YWxscyAoZXhjbHVkaW5nIGNvcm5lcnMgYWxyZWFkeSBkcmF3bilcclxuICAgIGZvciAobGV0IHkgPSBncmlkU2l6ZTsgeSA8IGNhbnZhc0hlaWdodCAtIGdyaWRTaXplOyB5ICs9IGdyaWRTaXplKSB7XHJcbiAgICAgICAgZHJhd0ltYWdlKCd3YWxsX3RpbGUnLCAwLCB5KTsgLy8gTGVmdFxyXG4gICAgICAgIGRyYXdJbWFnZSgnd2FsbF90aWxlJywgY2FudmFzV2lkdGggLSBncmlkU2l6ZSwgeSk7IC8vIFJpZ2h0XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vLyBFbnN1cmUgdGhlIGdhbWUgc3RhcnRzIHdoZW4gdGhlIERPTSBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5l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
