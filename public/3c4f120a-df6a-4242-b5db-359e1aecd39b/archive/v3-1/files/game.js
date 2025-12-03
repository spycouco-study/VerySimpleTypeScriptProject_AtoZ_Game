var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2["LOADING"] = "LOADING";
  GameState2["TITLE"] = "TITLE";
  GameState2["INSTRUCTIONS"] = "INSTRUCTIONS";
  GameState2["PLAYING"] = "PLAYING";
  GameState2["GAME_OVER_WIN"] = "GAME_OVER_WIN";
  GameState2["GAME_OVER_LOSE"] = "GAME_OVER_LOSE";
  return GameState2;
})(GameState || {});
let canvas;
let ctx;
let config;
let images = /* @__PURE__ */ new Map();
let sounds = /* @__PURE__ */ new Map();
let gameState = "LOADING" /* LOADING */;
let board;
let remainingMines;
let firstClick = true;
let revealedCellsCount = 0;
let flagsPlacedCount = 0;
let startTime = 0;
let elapsedTime = 0;
let isMouseDown = false;
async function loadImage(asset) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = asset.path;
    img.onload = () => resolve([asset.name, img]);
    img.onerror = () => reject(new Error(`Failed to load image: ${asset.path}`));
  });
}
async function loadSound(asset) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.src = asset.path;
    audio.preload = "auto";
    audio.volume = asset.volume;
    audio.oncanplaythrough = () => resolve([asset.name, audio]);
    audio.onerror = () => reject(new Error(`Failed to load sound: ${asset.path}`));
  });
}
function playAudio(name, loop = false) {
  const audio = sounds.get(name);
  if (audio) {
    audio.currentTime = 0;
    audio.loop = loop;
    audio.play().catch((e) => {
      console.error(`Error playing audio ${name}:`, e);
    });
  }
}
function stopAudio(name) {
  const audio = sounds.get(name);
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}
function drawCenteredText(text, y, font, color) {
  if (!ctx || !config) return;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, config.uiSettings.canvasWidth / 2, y);
}
function getMousePos(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    // Scale the mouse coordinates to the canvas drawing buffer size
    y: (event.clientY - rect.top) * scaleY
  };
}
async function initGame() {
  canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("Canvas element with ID 'gameCanvas' not found.");
    return;
  }
  ctx = canvas.getContext("2d");
  try {
    const response = await fetch("data.json");
    config = await response.json();
  } catch (error) {
    console.error("Failed to load game configuration:", error);
    return;
  }
  canvas.width = config.uiSettings.canvasWidth;
  canvas.height = config.uiSettings.canvasHeight;
  const { boardWidth, boardHeight, cellSize } = config.gameSettings;
  const { canvasWidth, canvasHeight } = config.uiSettings;
  const totalBoardWidth = boardWidth * cellSize;
  const totalBoardHeight = boardHeight * cellSize;
  config.gameSettings.boardOffsetX = (canvasWidth - totalBoardWidth) / 2;
  const minBoardTopY = 60;
  const potentialBoardOffsetY = (canvasHeight - totalBoardHeight) / 2;
  config.gameSettings.boardOffsetY = Math.max(potentialBoardOffsetY, minBoardTopY);
  try {
    const imagePromises = config.assets.images.map(loadImage);
    const soundPromises = config.assets.sounds.map(loadSound);
    const loadedImages = await Promise.all(imagePromises);
    loadedImages.forEach(([name, img]) => images.set(name, img));
    const loadedSounds = await Promise.all(soundPromises);
    loadedSounds.forEach(([name, audio]) => sounds.set(name, audio));
    console.log("Assets loaded successfully.");
  } catch (error) {
    console.error("Failed to load assets:", error);
    return;
  }
  addEventListeners();
  gameState = "TITLE" /* TITLE */;
  gameLoop();
}
function addEventListeners() {
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("contextmenu", handleContextMenu);
}
function resetGame() {
  const { boardWidth, boardHeight } = config.gameSettings;
  board = Array(boardHeight).fill(null).map(
    () => Array(boardWidth).fill(null).map(() => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0
    }))
  );
  remainingMines = config.gameSettings.numMines;
  firstClick = true;
  revealedCellsCount = 0;
  flagsPlacedCount = 0;
  startTime = 0;
  elapsedTime = 0;
  stopAudio("bgm");
  gameState = "PLAYING" /* PLAYING */;
  playAudio("bgm", true);
}
function generateBoard(initialClickX, initialClickY) {
  const { boardWidth, boardHeight, numMines } = config.gameSettings;
  let minesToPlace = numMines;
  while (minesToPlace > 0) {
    const r = Math.floor(Math.random() * boardHeight);
    const c = Math.floor(Math.random() * boardWidth);
    const isSafeZone = (x, y) => {
      return Math.abs(x - initialClickX) <= 1 && Math.abs(y - initialClickY) <= 1;
    };
    if (!board[r][c].isMine && !isSafeZone(c, r)) {
      board[r][c].isMine = true;
      minesToPlace--;
    }
  }
  for (let r = 0; r < boardHeight; r++) {
    for (let c = 0; c < boardWidth; c++) {
      if (!board[r][c].isMine) {
        board[r][c].adjacentMines = countAdjacentMines(r, c);
      }
    }
  }
}
function countAdjacentMines(r, c) {
  const { boardWidth, boardHeight } = config.gameSettings;
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < boardHeight && nc >= 0 && nc < boardWidth && board[nr][nc].isMine) {
        count++;
      }
    }
  }
  return count;
}
function revealCell(r, c) {
  const { boardWidth, boardHeight, numMines } = config.gameSettings;
  if (r < 0 || r >= boardHeight || c < 0 || c >= boardWidth || board[r][c].isRevealed || board[r][c].isFlagged) {
    return;
  }
  if (firstClick) {
    generateBoard(c, r);
    firstClick = false;
    startTime = performance.now();
  }
  board[r][c].isRevealed = true;
  revealedCellsCount++;
  playAudio("click_reveal");
  if (board[r][c].isMine) {
    gameOver("GAME_OVER_LOSE" /* GAME_OVER_LOSE */);
    return;
  }
  if (board[r][c].adjacentMines === 0) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        revealCell(r + dr, c + dc);
      }
    }
  }
  checkWinCondition();
}
function toggleFlag(r, c) {
  const { boardWidth, boardHeight } = config.gameSettings;
  if (r < 0 || r >= boardHeight || c < 0 || c >= boardWidth || board[r][c].isRevealed) {
    return;
  }
  if (firstClick) return;
  board[r][c].isFlagged = !board[r][c].isFlagged;
  playAudio("click_flag");
  if (board[r][c].isFlagged) {
    flagsPlacedCount++;
  } else {
    flagsPlacedCount--;
  }
  remainingMines = config.gameSettings.numMines - flagsPlacedCount;
  checkWinCondition();
}
function checkWinCondition() {
  const { boardWidth, boardHeight, numMines } = config.gameSettings;
  const totalCells = boardWidth * boardHeight;
  if (revealedCellsCount === totalCells - numMines) {
    gameOver("GAME_OVER_WIN" /* GAME_OVER_WIN */);
  }
}
function gameOver(reason) {
  gameState = reason;
  stopAudio("bgm");
  if (reason === "GAME_OVER_LOSE" /* GAME_OVER_LOSE */) {
    const { boardWidth, boardHeight } = config.gameSettings;
    for (let r = 0; r < boardHeight; r++) {
      for (let c = 0; c < boardWidth; c++) {
        if (board[r][c].isMine && !board[r][c].isFlagged) {
          board[r][c].isRevealed = true;
        }
      }
    }
    playAudio("explosion");
  } else if (reason === "GAME_OVER_WIN" /* GAME_OVER_WIN */) {
    playAudio("win_sound");
  }
}
function draw() {
  if (!ctx || !config) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = config.colors.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  switch (gameState) {
    case "LOADING" /* LOADING */:
      drawCenteredText("\uB85C\uB529 \uC911...", canvas.height / 2, "30px Arial", config.colors.textColor);
      break;
    case "TITLE" /* TITLE */:
      drawTitleScreen();
      break;
    case "INSTRUCTIONS" /* INSTRUCTIONS */:
      drawInstructionsScreen();
      break;
    case "PLAYING" /* PLAYING */:
    case "GAME_OVER_WIN" /* GAME_OVER_WIN */:
    case "GAME_OVER_LOSE" /* GAME_OVER_LOSE */:
      drawGameScreen();
      drawUIScreen();
      if (gameState === "GAME_OVER_WIN" /* GAME_OVER_WIN */ || gameState === "GAME_OVER_LOSE" /* GAME_OVER_LOSE */) {
        drawGameOverScreen();
      }
      break;
  }
}
function drawTitleScreen() {
  if (!config) return;
  drawCenteredText(config.uiSettings.titleScreenText, canvas.height / 2 - 50, "50px Arial", config.colors.textColor);
  drawCenteredText(config.uiSettings.titleScreenInstructions, canvas.height / 2 + 50, "20px Arial", config.colors.textColor);
}
function drawInstructionsScreen() {
  if (!config) return;
  let yOffset = canvas.height / 2 - config.uiSettings.instructionsText.length * 20 / 2;
  for (const line of config.uiSettings.instructionsText) {
    drawCenteredText(line, yOffset, "20px Arial", config.colors.textColor);
    yOffset += 30;
  }
}
function drawGameScreen() {
  const { boardWidth, boardHeight, cellSize, boardOffsetX, boardOffsetY } = config.gameSettings;
  for (let r = 0; r < boardHeight; r++) {
    for (let c = 0; c < boardWidth; c++) {
      const cell = board[r][c];
      const x = boardOffsetX + c * cellSize;
      const y = boardOffsetY + r * cellSize;
      let img;
      if (cell.isRevealed) {
        if (cell.isMine) {
          img = images.get("mine");
        } else if (cell.adjacentMines > 0) {
          img = images.get(`number_${cell.adjacentMines}`);
        } else {
          img = images.get("revealed_empty");
        }
      } else if (cell.isFlagged) {
        img = images.get("flag");
      } else {
        img = images.get("covered");
      }
      if (img) {
        ctx.drawImage(img, x, y, cellSize, cellSize);
      }
    }
  }
}
function drawUIScreen() {
  const { mineCounterPrefix, timerPrefix } = config.uiSettings;
  const { boardOffsetX } = config.gameSettings;
  const { textColor } = config.colors;
  const uiTextY = 30;
  ctx.font = "24px Arial";
  ctx.fillStyle = textColor;
  ctx.textAlign = "left";
  ctx.fillText(`${mineCounterPrefix}${remainingMines}`, boardOffsetX, uiTextY);
  if (gameState === "PLAYING" /* PLAYING */ && startTime > 0) {
    elapsedTime = Math.floor((performance.now() - startTime) / 1e3);
  }
  ctx.textAlign = "right";
  ctx.fillText(`${timerPrefix}${elapsedTime}`, config.uiSettings.canvasWidth - boardOffsetX, uiTextY);
}
function drawGameOverScreen() {
  const { winMessage, loseMessage } = config.uiSettings;
  const { textColor } = config.colors;
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const message = gameState === "GAME_OVER_WIN" /* GAME_OVER_WIN */ ? winMessage : loseMessage;
  drawCenteredText(message, canvas.height / 2 - 50, "40px Arial", textColor);
  drawCenteredText("\uB2E4\uC2DC \uC2DC\uC791\uD558\uB824\uBA74 \uD074\uB9AD\uD558\uC138\uC694.", canvas.height / 2 + 50, "20px Arial", textColor);
}
function handleMouseDown(event) {
  isMouseDown = true;
}
function handleMouseUp(event) {
  if (!isMouseDown) return;
  isMouseDown = false;
  const mousePos = getMousePos(event);
  const { boardOffsetX, boardOffsetY, cellSize, boardWidth, boardHeight } = config.gameSettings;
  const col = Math.floor((mousePos.x - boardOffsetX) / cellSize);
  const row = Math.floor((mousePos.y - boardOffsetY) / cellSize);
  const isInsideBoard = col >= 0 && col < boardWidth && row >= 0 && row < boardHeight;
  switch (gameState) {
    case "TITLE" /* TITLE */:
      gameState = "INSTRUCTIONS" /* INSTRUCTIONS */;
      break;
    case "INSTRUCTIONS" /* INSTRUCTIONS */:
      resetGame();
      break;
    case "PLAYING" /* PLAYING */:
      if (isInsideBoard) {
        if (event.button === 0) {
          revealCell(row, col);
        }
      }
      break;
    case "GAME_OVER_WIN" /* GAME_OVER_WIN */:
    case "GAME_OVER_LOSE" /* GAME_OVER_LOSE */:
      resetGame();
      break;
  }
}
function handleContextMenu(event) {
  event.preventDefault();
  if (gameState === "PLAYING" /* PLAYING */) {
    const mousePos = getMousePos(event);
    const { boardOffsetX, boardOffsetY, cellSize, boardWidth, boardHeight } = config.gameSettings;
    const col = Math.floor((mousePos.x - boardOffsetX) / cellSize);
    const row = Math.floor((mousePos.y - boardOffsetY) / cellSize);
    const isInsideBoard = col >= 0 && col < boardWidth && row >= 0 && row < boardHeight;
    if (isInsideBoard && event.button === 2) {
      toggleFlag(row, col);
    }
  }
}
function gameLoop() {
  draw();
  requestAnimationFrame(gameLoop);
}
initGame();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIFBvaW50IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIENlbGwge1xyXG4gICAgaXNNaW5lOiBib29sZWFuO1xyXG4gICAgaXNSZXZlYWxlZDogYm9vbGVhbjtcclxuICAgIGlzRmxhZ2dlZDogYm9vbGVhbjtcclxuICAgIGFkamFjZW50TWluZXM6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVNldHRpbmdzIHtcclxuICAgIGJvYXJkV2lkdGg6IG51bWJlcjtcclxuICAgIGJvYXJkSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBudW1NaW5lczogbnVtYmVyO1xyXG4gICAgY2VsbFNpemU6IG51bWJlcjtcclxuICAgIGJvYXJkT2Zmc2V0WDogbnVtYmVyOyAvLyBXaWxsIGJlIGR5bmFtaWNhbGx5IGNhbGN1bGF0ZWRcclxuICAgIGJvYXJkT2Zmc2V0WTogbnVtYmVyOyAvLyBXaWxsIGJlIGR5bmFtaWNhbGx5IGNhbGN1bGF0ZWRcclxufVxyXG5cclxuaW50ZXJmYWNlIFVJU2V0dGluZ3Mge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICB0aXRsZVNjcmVlbkluc3RydWN0aW9uczogc3RyaW5nO1xyXG4gICAgaW5zdHJ1Y3Rpb25zVGV4dDogc3RyaW5nW107XHJcbiAgICB3aW5NZXNzYWdlOiBzdHJpbmc7XHJcbiAgICBsb3NlTWVzc2FnZTogc3RyaW5nO1xyXG4gICAgbWluZUNvdW50ZXJQcmVmaXg6IHN0cmluZztcclxuICAgIHRpbWVyUHJlZml4OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb2xvcnMge1xyXG4gICAgYmFja2dyb3VuZENvbG9yOiBzdHJpbmc7XHJcbiAgICB0ZXh0Q29sb3I6IHN0cmluZztcclxuICAgIGNvdmVyZWRDZWxsQ29sb3I6IHN0cmluZztcclxuICAgIHJldmVhbGVkQ2VsbENvbG9yOiBzdHJpbmc7XHJcbiAgICBtaW5lVGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBudW1iZXJDb2xvcnM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczogR2FtZVNldHRpbmdzO1xyXG4gICAgdWlTZXR0aW5nczogVUlTZXR0aW5ncztcclxuICAgIGNvbG9yczogQ29sb3JzO1xyXG4gICAgYXNzZXRzOiBBc3NldHNDb25maWc7XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcgPSAnTE9BRElORycsXHJcbiAgICBUSVRMRSA9ICdUSVRMRScsXHJcbiAgICBJTlNUUlVDVElPTlMgPSAnSU5TVFJVQ1RJT05TJyxcclxuICAgIFBMQVlJTkcgPSAnUExBWUlORycsXHJcbiAgICBHQU1FX09WRVJfV0lOID0gJ0dBTUVfT1ZFUl9XSU4nLFxyXG4gICAgR0FNRV9PVkVSX0xPU0UgPSAnR0FNRV9PVkVSX0xPU0UnXHJcbn1cclxuXHJcbmxldCBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG5sZXQgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbmxldCBjb25maWc6IEdhbWVDb25maWc7XHJcbmxldCBpbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xyXG5sZXQgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcclxuXHJcbmxldCBnYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5MT0FESU5HO1xyXG5sZXQgYm9hcmQ6IENlbGxbXVtdO1xyXG5sZXQgcmVtYWluaW5nTWluZXM6IG51bWJlcjtcclxubGV0IGZpcnN0Q2xpY2s6IGJvb2xlYW4gPSB0cnVlO1xyXG5sZXQgcmV2ZWFsZWRDZWxsc0NvdW50OiBudW1iZXIgPSAwO1xyXG5sZXQgZmxhZ3NQbGFjZWRDb3VudDogbnVtYmVyID0gMDtcclxubGV0IHN0YXJ0VGltZTogbnVtYmVyID0gMDtcclxubGV0IGVsYXBzZWRUaW1lOiBudW1iZXIgPSAwO1xyXG5sZXQgaXNNb3VzZURvd246IGJvb2xlYW4gPSBmYWxzZTsgLy8gVG8gdHJhY2sgbW91c2UgaG9sZCBmb3IgY2xpY2sgZGV0ZWN0aW9uXHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkSW1hZ2UoYXNzZXQ6IEltYWdlQXNzZXQpOiBQcm9taXNlPFtzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnRdPiB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xyXG4gICAgICAgIGltZy5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiByZXNvbHZlKFthc3NldC5uYW1lLCBpbWddKTtcclxuICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGltYWdlOiAke2Fzc2V0LnBhdGh9YCkpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRTb3VuZChhc3NldDogU291bmRBc3NldCk6IFByb21pc2U8W3N0cmluZywgSFRNTEF1ZGlvRWxlbWVudF0+IHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oKTtcclxuICAgICAgICBhdWRpby5zcmMgPSBhc3NldC5wYXRoO1xyXG4gICAgICAgIGF1ZGlvLnByZWxvYWQgPSAnYXV0byc7XHJcbiAgICAgICAgYXVkaW8udm9sdW1lID0gYXNzZXQudm9sdW1lO1xyXG4gICAgICAgIC8vIEVuc3VyZSBhdWRpbyBjYW4gYmUgcGxheWVkIHRocm91Z2ggYmVmb3JlIHJlc29sdmluZ1xyXG4gICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiByZXNvbHZlKFthc3NldC5uYW1lLCBhdWRpb10pO1xyXG4gICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldC5wYXRofWApKTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwbGF5QXVkaW8obmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UpIHtcclxuICAgIGNvbnN0IGF1ZGlvID0gc291bmRzLmdldChuYW1lKTtcclxuICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgIGF1ZGlvLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICBhdWRpby5sb29wID0gbG9vcDtcclxuICAgICAgICAvLyBQbGF5aW5nIGF1ZGlvIG1pZ2h0IHJlcXVpcmUgdXNlciBpbnRlcmFjdGlvbiwgd3JhcCBpbiB0cnkvY2F0Y2ggZm9yIHNhZmV0eVxyXG4gICAgICAgIGF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgcGxheWluZyBhdWRpbyAke25hbWV9OmAsIGUpO1xyXG4gICAgICAgICAgICAvLyBPbiBzb21lIGJyb3dzZXJzLCBhdXRvcGxheSB3aXRob3V0IHVzZXIgZ2VzdHVyZSBtaWdodCBiZSBibG9ja2VkLlxyXG4gICAgICAgICAgICAvLyBBIGNvbW1vbiB3b3JrYXJvdW5kIGlzIHRvIGhhdmUgdGhlIHVzZXIgaW50ZXJhY3QgZmlyc3QuXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0b3BBdWRpbyhuYW1lOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IGF1ZGlvID0gc291bmRzLmdldChuYW1lKTtcclxuICAgIGlmIChhdWRpbykge1xyXG4gICAgICAgIGF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3Q2VudGVyZWRUZXh0KHRleHQ6IHN0cmluZywgeTogbnVtYmVyLCBmb250OiBzdHJpbmcsIGNvbG9yOiBzdHJpbmcpIHtcclxuICAgIGlmICghY3R4IHx8ICFjb25maWcpIHJldHVybjtcclxuICAgIGN0eC5mb250ID0gZm9udDtcclxuICAgIGN0eC5maWxsU3R5bGUgPSBjb2xvcjtcclxuICAgIGN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgIGN0eC5maWxsVGV4dCh0ZXh0LCBjb25maWcudWlTZXR0aW5ncy5jYW52YXNXaWR0aCAvIDIsIHkpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRNb3VzZVBvcyhldmVudDogTW91c2VFdmVudCk6IFBvaW50IHtcclxuICAgIGNvbnN0IHJlY3QgPSBjYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBjb25zdCBzY2FsZVggPSBjYW52YXMud2lkdGggLyByZWN0LndpZHRoOyAgICAvLyBHZXQgdGhlIHJhdGlvIG9mIGNhbnZhcyBpbnRlcm5hbCB3aWR0aCB0byBpdHMgQ1NTIHdpZHRoXHJcbiAgICBjb25zdCBzY2FsZVkgPSBjYW52YXMuaGVpZ2h0IC8gcmVjdC5oZWlnaHQ7ICAvLyBHZXQgdGhlIHJhdGlvIG9mIGNhbnZhcyBpbnRlcm5hbCBoZWlnaHQgdG8gaXRzIENTUyBoZWlnaHRcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHg6IChldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0KSAqIHNjYWxlWCwgLy8gU2NhbGUgdGhlIG1vdXNlIGNvb3JkaW5hdGVzIHRvIHRoZSBjYW52YXMgZHJhd2luZyBidWZmZXIgc2l6ZVxyXG4gICAgICAgIHk6IChldmVudC5jbGllbnRZIC0gcmVjdC50b3ApICogc2NhbGVZXHJcbiAgICB9O1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBpbml0R2FtZSgpIHtcclxuICAgIGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBpZiAoIWNhbnZhcykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDYW52YXMgZWxlbWVudCB3aXRoIElEICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgIGNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjpcIiwgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBjYW52YXMud2lkdGggPSBjb25maWcudWlTZXR0aW5ncy5jYW52YXNXaWR0aDtcclxuICAgIGNhbnZhcy5oZWlnaHQgPSBjb25maWcudWlTZXR0aW5ncy5jYW52YXNIZWlnaHQ7XHJcblxyXG4gICAgLy8gQ2FsY3VsYXRlIGR5bmFtaWMgYm9hcmQgb2Zmc2V0cyBmb3IgY2VudGVyaW5nXHJcbiAgICBjb25zdCB7IGJvYXJkV2lkdGgsIGJvYXJkSGVpZ2h0LCBjZWxsU2l6ZSB9ID0gY29uZmlnLmdhbWVTZXR0aW5ncztcclxuICAgIGNvbnN0IHsgY2FudmFzV2lkdGgsIGNhbnZhc0hlaWdodCB9ID0gY29uZmlnLnVpU2V0dGluZ3M7XHJcblxyXG4gICAgY29uc3QgdG90YWxCb2FyZFdpZHRoID0gYm9hcmRXaWR0aCAqIGNlbGxTaXplO1xyXG4gICAgY29uc3QgdG90YWxCb2FyZEhlaWdodCA9IGJvYXJkSGVpZ2h0ICogY2VsbFNpemU7XHJcblxyXG4gICAgLy8gQ2FsY3VsYXRlIGhvcml6b250YWwgb2Zmc2V0IGZvciB0cnVlIGNlbnRlcmluZ1xyXG4gICAgY29uZmlnLmdhbWVTZXR0aW5ncy5ib2FyZE9mZnNldFggPSAoY2FudmFzV2lkdGggLSB0b3RhbEJvYXJkV2lkdGgpIC8gMjtcclxuXHJcbiAgICAvLyBDYWxjdWxhdGUgdmVydGljYWwgb2Zmc2V0LCBlbnN1cmluZyBlbm91Z2ggc3BhY2UgZm9yIFVJIGF0IHRoZSB0b3BcclxuICAgIC8vIFVJIHRleHQgKG1pbmUgY291bnRlciwgdGltZXIpIHdpbGwgYmUgZHJhd24gYXQgYSBmaXhlZCBZPTMwLlxyXG4gICAgLy8gVGhlIGJvYXJkIHNob3VsZCBzdGFydCBiZWxvdyBhIGNlcnRhaW4gbWluaW11bSBZIHRvIGF2b2lkIG92ZXJsYXAuXHJcbiAgICBjb25zdCBtaW5Cb2FyZFRvcFkgPSA2MDsgLy8gQWxsb3cgZm9yIFVJIHRleHQgKGFwcHJveCAyNHB4IGZvbnQpIHBsdXMgcGFkZGluZ1xyXG4gICAgY29uc3QgcG90ZW50aWFsQm9hcmRPZmZzZXRZID0gKGNhbnZhc0hlaWdodCAtIHRvdGFsQm9hcmRIZWlnaHQpIC8gMjtcclxuICAgIGNvbmZpZy5nYW1lU2V0dGluZ3MuYm9hcmRPZmZzZXRZID0gTWF0aC5tYXgocG90ZW50aWFsQm9hcmRPZmZzZXRZLCBtaW5Cb2FyZFRvcFkpO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChsb2FkSW1hZ2UpO1xyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSBjb25maWcuYXNzZXRzLnNvdW5kcy5tYXAobG9hZFNvdW5kKTtcclxuXHJcbiAgICAgICAgY29uc3QgbG9hZGVkSW1hZ2VzID0gYXdhaXQgUHJvbWlzZS5hbGwoaW1hZ2VQcm9taXNlcyk7XHJcbiAgICAgICAgbG9hZGVkSW1hZ2VzLmZvckVhY2goKFtuYW1lLCBpbWddKSA9PiBpbWFnZXMuc2V0KG5hbWUsIGltZykpO1xyXG5cclxuICAgICAgICBjb25zdCBsb2FkZWRTb3VuZHMgPSBhd2FpdCBQcm9taXNlLmFsbChzb3VuZFByb21pc2VzKTtcclxuICAgICAgICBsb2FkZWRTb3VuZHMuZm9yRWFjaCgoW25hbWUsIGF1ZGlvXSkgPT4gc291bmRzLnNldChuYW1lLCBhdWRpbykpO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhcIkFzc2V0cyBsb2FkZWQgc3VjY2Vzc2Z1bGx5LlwiKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBsb2FkIGFzc2V0czpcIiwgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBhZGRFdmVudExpc3RlbmVycygpO1xyXG4gICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgZ2FtZUxvb3AoKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWRkRXZlbnRMaXN0ZW5lcnMoKSB7XHJcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgaGFuZGxlTW91c2VEb3duKTtcclxuICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgaGFuZGxlTW91c2VVcCk7XHJcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCBoYW5kbGVDb250ZXh0TWVudSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlc2V0R2FtZSgpIHtcclxuICAgIGNvbnN0IHsgYm9hcmRXaWR0aCwgYm9hcmRIZWlnaHQgfSA9IGNvbmZpZy5nYW1lU2V0dGluZ3M7XHJcbiAgICBib2FyZCA9IEFycmF5KGJvYXJkSGVpZ2h0KS5maWxsKG51bGwpLm1hcCgoKSA9PlxyXG4gICAgICAgIEFycmF5KGJvYXJkV2lkdGgpLmZpbGwobnVsbCkubWFwKCgpID0+ICh7XHJcbiAgICAgICAgICAgIGlzTWluZTogZmFsc2UsXHJcbiAgICAgICAgICAgIGlzUmV2ZWFsZWQ6IGZhbHNlLFxyXG4gICAgICAgICAgICBpc0ZsYWdnZWQ6IGZhbHNlLFxyXG4gICAgICAgICAgICBhZGphY2VudE1pbmVzOiAwXHJcbiAgICAgICAgfSkpXHJcbiAgICApO1xyXG4gICAgcmVtYWluaW5nTWluZXMgPSBjb25maWcuZ2FtZVNldHRpbmdzLm51bU1pbmVzO1xyXG4gICAgZmlyc3RDbGljayA9IHRydWU7XHJcbiAgICByZXZlYWxlZENlbGxzQ291bnQgPSAwO1xyXG4gICAgZmxhZ3NQbGFjZWRDb3VudCA9IDA7XHJcbiAgICBzdGFydFRpbWUgPSAwO1xyXG4gICAgZWxhcHNlZFRpbWUgPSAwO1xyXG4gICAgc3RvcEF1ZGlvKCdiZ20nKTtcclxuICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgcGxheUF1ZGlvKCdiZ20nLCB0cnVlKTsgLy8gQXV0b21hdGljYWxseSBzdGFydCBCR00gd2hlbiBnYW1lIGVudGVycyBQTEFZSU5HIHN0YXRlXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdlbmVyYXRlQm9hcmQoaW5pdGlhbENsaWNrWDogbnVtYmVyLCBpbml0aWFsQ2xpY2tZOiBudW1iZXIpIHtcclxuICAgIGNvbnN0IHsgYm9hcmRXaWR0aCwgYm9hcmRIZWlnaHQsIG51bU1pbmVzIH0gPSBjb25maWcuZ2FtZVNldHRpbmdzO1xyXG4gICAgbGV0IG1pbmVzVG9QbGFjZSA9IG51bU1pbmVzO1xyXG5cclxuICAgIHdoaWxlIChtaW5lc1RvUGxhY2UgPiAwKSB7XHJcbiAgICAgICAgY29uc3QgciA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGJvYXJkSGVpZ2h0KTtcclxuICAgICAgICBjb25zdCBjID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYm9hcmRXaWR0aCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGlzU2FmZVpvbmUgPSAoeDogbnVtYmVyLCB5OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgIE1hdGguYWJzKHggLSBpbml0aWFsQ2xpY2tYKSA8PSAxICYmXHJcbiAgICAgICAgICAgICAgICBNYXRoLmFicyh5IC0gaW5pdGlhbENsaWNrWSkgPD0gMVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGlmICghYm9hcmRbcl1bY10uaXNNaW5lICYmICFpc1NhZmVab25lKGMsIHIpKSB7XHJcbiAgICAgICAgICAgIGJvYXJkW3JdW2NdLmlzTWluZSA9IHRydWU7XHJcbiAgICAgICAgICAgIG1pbmVzVG9QbGFjZS0tO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmb3IgKGxldCByID0gMDsgciA8IGJvYXJkSGVpZ2h0OyByKyspIHtcclxuICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IGJvYXJkV2lkdGg7IGMrKykge1xyXG4gICAgICAgICAgICBpZiAoIWJvYXJkW3JdW2NdLmlzTWluZSkge1xyXG4gICAgICAgICAgICAgICAgYm9hcmRbcl1bY10uYWRqYWNlbnRNaW5lcyA9IGNvdW50QWRqYWNlbnRNaW5lcyhyLCBjKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY291bnRBZGphY2VudE1pbmVzKHI6IG51bWJlciwgYzogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGNvbnN0IHsgYm9hcmRXaWR0aCwgYm9hcmRIZWlnaHQgfSA9IGNvbmZpZy5nYW1lU2V0dGluZ3M7XHJcbiAgICBsZXQgY291bnQgPSAwO1xyXG4gICAgZm9yIChsZXQgZHIgPSAtMTsgZHIgPD0gMTsgZHIrKykge1xyXG4gICAgICAgIGZvciAobGV0IGRjID0gLTE7IGRjIDw9IDE7IGRjKyspIHtcclxuICAgICAgICAgICAgaWYgKGRyID09PSAwICYmIGRjID09PSAwKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG5yID0gciArIGRyO1xyXG4gICAgICAgICAgICBjb25zdCBuYyA9IGMgKyBkYztcclxuXHJcbiAgICAgICAgICAgIGlmIChuciA+PSAwICYmIG5yIDwgYm9hcmRIZWlnaHQgJiYgbmMgPj0gMCAmJiBuYyA8IGJvYXJkV2lkdGggJiYgYm9hcmRbbnJdW25jXS5pc01pbmUpIHtcclxuICAgICAgICAgICAgICAgIGNvdW50Kys7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gY291bnQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJldmVhbENlbGwocjogbnVtYmVyLCBjOiBudW1iZXIpIHtcclxuICAgIGNvbnN0IHsgYm9hcmRXaWR0aCwgYm9hcmRIZWlnaHQsIG51bU1pbmVzIH0gPSBjb25maWcuZ2FtZVNldHRpbmdzO1xyXG5cclxuICAgIGlmIChyIDwgMCB8fCByID49IGJvYXJkSGVpZ2h0IHx8IGMgPCAwIHx8IGMgPj0gYm9hcmRXaWR0aCB8fCBib2FyZFtyXVtjXS5pc1JldmVhbGVkIHx8IGJvYXJkW3JdW2NdLmlzRmxhZ2dlZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZmlyc3RDbGljaykge1xyXG4gICAgICAgIC8vIEJHTSBpcyBub3cgc3RhcnRlZCBpbiByZXNldEdhbWUoKSB3aGVuIHRyYW5zaXRpb25pbmcgdG8gUExBWUlOR1xyXG4gICAgICAgIC8vIE9ubHkgZ2VuZXJhdGUgYm9hcmQgYW5kIHNldCBzdGFydCB0aW1lIGhlcmUgZm9yIHRoZSB2ZXJ5IGZpcnN0IGNsaWNrXHJcbiAgICAgICAgZ2VuZXJhdGVCb2FyZChjLCByKTtcclxuICAgICAgICBmaXJzdENsaWNrID0gZmFsc2U7XHJcbiAgICAgICAgc3RhcnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICB9XHJcblxyXG4gICAgYm9hcmRbcl1bY10uaXNSZXZlYWxlZCA9IHRydWU7XHJcbiAgICByZXZlYWxlZENlbGxzQ291bnQrKztcclxuICAgIHBsYXlBdWRpbygnY2xpY2tfcmV2ZWFsJyk7XHJcblxyXG4gICAgaWYgKGJvYXJkW3JdW2NdLmlzTWluZSkge1xyXG4gICAgICAgIGdhbWVPdmVyKEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChib2FyZFtyXVtjXS5hZGphY2VudE1pbmVzID09PSAwKSB7XHJcbiAgICAgICAgZm9yIChsZXQgZHIgPSAtMTsgZHIgPD0gMTsgZHIrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBkYyA9IC0xOyBkYyA8PSAxOyBkYysrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZHIgPT09IDAgJiYgZGMgPT09IDApIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgcmV2ZWFsQ2VsbChyICsgZHIsIGMgKyBkYyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY2hlY2tXaW5Db25kaXRpb24oKTtcclxufVxyXG5cclxuZnVuY3Rpb24gdG9nZ2xlRmxhZyhyOiBudW1iZXIsIGM6IG51bWJlcikge1xyXG4gICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCB9ID0gY29uZmlnLmdhbWVTZXR0aW5ncztcclxuXHJcbiAgICBpZiAociA8IDAgfHwgciA+PSBib2FyZEhlaWdodCB8fCBjIDwgMCB8fCBjID49IGJvYXJkV2lkdGggfHwgYm9hcmRbcl1bY10uaXNSZXZlYWxlZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZmlyc3RDbGljaykgcmV0dXJuO1xyXG5cclxuICAgIGJvYXJkW3JdW2NdLmlzRmxhZ2dlZCA9ICFib2FyZFtyXVtjXS5pc0ZsYWdnZWQ7XHJcbiAgICBwbGF5QXVkaW8oJ2NsaWNrX2ZsYWcnKTtcclxuXHJcbiAgICBpZiAoYm9hcmRbcl1bY10uaXNGbGFnZ2VkKSB7XHJcbiAgICAgICAgZmxhZ3NQbGFjZWRDb3VudCsrO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBmbGFnc1BsYWNlZENvdW50LS07XHJcbiAgICB9XHJcbiAgICByZW1haW5pbmdNaW5lcyA9IGNvbmZpZy5nYW1lU2V0dGluZ3MubnVtTWluZXMgLSBmbGFnc1BsYWNlZENvdW50O1xyXG4gICAgY2hlY2tXaW5Db25kaXRpb24oKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tXaW5Db25kaXRpb24oKSB7XHJcbiAgICBjb25zdCB7IGJvYXJkV2lkdGgsIGJvYXJkSGVpZ2h0LCBudW1NaW5lcyB9ID0gY29uZmlnLmdhbWVTZXR0aW5ncztcclxuICAgIGNvbnN0IHRvdGFsQ2VsbHMgPSBib2FyZFdpZHRoICogYm9hcmRIZWlnaHQ7XHJcblxyXG4gICAgaWYgKHJldmVhbGVkQ2VsbHNDb3VudCA9PT0gKHRvdGFsQ2VsbHMgLSBudW1NaW5lcykpIHtcclxuICAgICAgICBnYW1lT3ZlcihHYW1lU3RhdGUuR0FNRV9PVkVSX1dJTik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdhbWVPdmVyKHJlYXNvbjogR2FtZVN0YXRlKSB7XHJcbiAgICBnYW1lU3RhdGUgPSByZWFzb247XHJcbiAgICBzdG9wQXVkaW8oJ2JnbScpO1xyXG4gICAgaWYgKHJlYXNvbiA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9MT1NFKSB7XHJcbiAgICAgICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCB9ID0gY29uZmlnLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IGJvYXJkSGVpZ2h0OyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBib2FyZFdpZHRoOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGlmIChib2FyZFtyXVtjXS5pc01pbmUgJiYgIWJvYXJkW3JdW2NdLmlzRmxhZ2dlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGJvYXJkW3JdW2NdLmlzUmV2ZWFsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHBsYXlBdWRpbygnZXhwbG9zaW9uJyk7XHJcbiAgICB9IGVsc2UgaWYgKHJlYXNvbiA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU4pIHtcclxuICAgICAgICBwbGF5QXVkaW8oJ3dpbl9zb3VuZCcpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3KCkge1xyXG4gICAgaWYgKCFjdHggfHwgIWNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgIGN0eC5maWxsU3R5bGUgPSBjb25maWcuY29sb3JzLmJhY2tncm91bmRDb2xvcjtcclxuICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgIHN3aXRjaCAoZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuTE9BRElORzpcclxuICAgICAgICAgICAgZHJhd0NlbnRlcmVkVGV4dCgnXHVCODVDXHVCNTI5IFx1QzkxMS4uLicsIGNhbnZhcy5oZWlnaHQgLyAyLCAnMzBweCBBcmlhbCcsIGNvbmZpZy5jb2xvcnMudGV4dENvbG9yKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIGRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVJfV0lOOlxyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUl9MT1NFOlxyXG4gICAgICAgICAgICBkcmF3R2FtZVNjcmVlbigpO1xyXG4gICAgICAgICAgICBkcmF3VUlTY3JlZW4oKTtcclxuICAgICAgICAgICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU4gfHwgZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSX0xPU0UpIHtcclxuICAgICAgICAgICAgICAgIGRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICBpZiAoIWNvbmZpZykgcmV0dXJuO1xyXG4gICAgZHJhd0NlbnRlcmVkVGV4dChjb25maWcudWlTZXR0aW5ncy50aXRsZVNjcmVlblRleHQsIGNhbnZhcy5oZWlnaHQgLyAyIC0gNTAsICc1MHB4IEFyaWFsJywgY29uZmlnLmNvbG9ycy50ZXh0Q29sb3IpO1xyXG4gICAgZHJhd0NlbnRlcmVkVGV4dChjb25maWcudWlTZXR0aW5ncy50aXRsZVNjcmVlbkluc3RydWN0aW9ucywgY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJzIwcHggQXJpYWwnLCBjb25maWcuY29sb3JzLnRleHRDb2xvcik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKSB7XHJcbiAgICBpZiAoIWNvbmZpZykgcmV0dXJuO1xyXG4gICAgbGV0IHlPZmZzZXQgPSBjYW52YXMuaGVpZ2h0IC8gMiAtIGNvbmZpZy51aVNldHRpbmdzLmluc3RydWN0aW9uc1RleHQubGVuZ3RoICogMjAgLyAyO1xyXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGNvbmZpZy51aVNldHRpbmdzLmluc3RydWN0aW9uc1RleHQpIHtcclxuICAgICAgICBkcmF3Q2VudGVyZWRUZXh0KGxpbmUsIHlPZmZzZXQsICcyMHB4IEFyaWFsJywgY29uZmlnLmNvbG9ycy50ZXh0Q29sb3IpO1xyXG4gICAgICAgIHlPZmZzZXQgKz0gMzA7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdHYW1lU2NyZWVuKCkge1xyXG4gICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCwgY2VsbFNpemUsIGJvYXJkT2Zmc2V0WCwgYm9hcmRPZmZzZXRZIH0gPSBjb25maWcuZ2FtZVNldHRpbmdzO1xyXG5cclxuICAgIGZvciAobGV0IHIgPSAwOyByIDwgYm9hcmRIZWlnaHQ7IHIrKykge1xyXG4gICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgYm9hcmRXaWR0aDsgYysrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBib2FyZFtyXVtjXTtcclxuICAgICAgICAgICAgY29uc3QgeCA9IGJvYXJkT2Zmc2V0WCArIGMgKiBjZWxsU2l6ZTtcclxuICAgICAgICAgICAgY29uc3QgeSA9IGJvYXJkT2Zmc2V0WSArIHIgKiBjZWxsU2l6ZTtcclxuXHJcbiAgICAgICAgICAgIGxldCBpbWc6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgICAgICBpZiAoY2VsbC5pc1JldmVhbGVkKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoY2VsbC5pc01pbmUpIHtcclxuICAgICAgICAgICAgICAgICAgICBpbWcgPSBpbWFnZXMuZ2V0KCdtaW5lJyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNlbGwuYWRqYWNlbnRNaW5lcyA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBpbWcgPSBpbWFnZXMuZ2V0KGBudW1iZXJfJHtjZWxsLmFkamFjZW50TWluZXN9YCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGltZyA9IGltYWdlcy5nZXQoJ3JldmVhbGVkX2VtcHR5Jyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2VsbC5pc0ZsYWdnZWQpIHtcclxuICAgICAgICAgICAgICAgIGltZyA9IGltYWdlcy5nZXQoJ2ZsYWcnKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGltZyA9IGltYWdlcy5nZXQoJ2NvdmVyZWQnKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGltZykge1xyXG4gICAgICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHgsIHksIGNlbGxTaXplLCBjZWxsU2l6ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdVSVNjcmVlbigpIHtcclxuICAgIGNvbnN0IHsgbWluZUNvdW50ZXJQcmVmaXgsIHRpbWVyUHJlZml4IH0gPSBjb25maWcudWlTZXR0aW5ncztcclxuICAgIGNvbnN0IHsgYm9hcmRPZmZzZXRYIH0gPSBjb25maWcuZ2FtZVNldHRpbmdzOyAvLyBPbmx5IG5lZWQgYm9hcmRPZmZzZXRYIGZvciBob3Jpem9udGFsIHBvc2l0aW9uaW5nXHJcbiAgICBjb25zdCB7IHRleHRDb2xvciB9ID0gY29uZmlnLmNvbG9ycztcclxuXHJcbiAgICBjb25zdCB1aVRleHRZID0gMzA7IC8vIEZpeGVkIFkgcG9zaXRpb24gZm9yIFVJIHRleHQgZWxlbWVudHNcclxuXHJcbiAgICBjdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgIGN0eC5maWxsU3R5bGUgPSB0ZXh0Q29sb3I7XHJcbiAgICBjdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgY3R4LmZpbGxUZXh0KGAke21pbmVDb3VudGVyUHJlZml4fSR7cmVtYWluaW5nTWluZXN9YCwgYm9hcmRPZmZzZXRYLCB1aVRleHRZKTsgLy8gVXNlIGZpeGVkIFlcclxuXHJcbiAgICBpZiAoZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiBzdGFydFRpbWUgPiAwKSB7XHJcbiAgICAgICAgZWxhcHNlZFRpbWUgPSBNYXRoLmZsb29yKChwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0VGltZSkgLyAxMDAwKTtcclxuICAgIH1cclxuICAgIGN0eC50ZXh0QWxpZ24gPSAncmlnaHQnO1xyXG4gICAgY3R4LmZpbGxUZXh0KGAke3RpbWVyUHJlZml4fSR7ZWxhcHNlZFRpbWV9YCwgY29uZmlnLnVpU2V0dGluZ3MuY2FudmFzV2lkdGggLSBib2FyZE9mZnNldFgsIHVpVGV4dFkpOyAvLyBVc2UgZml4ZWQgWVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3R2FtZU92ZXJTY3JlZW4oKSB7XHJcbiAgICBjb25zdCB7IHdpbk1lc3NhZ2UsIGxvc2VNZXNzYWdlIH0gPSBjb25maWcudWlTZXR0aW5ncztcclxuICAgIGNvbnN0IHsgdGV4dENvbG9yIH0gPSBjb25maWcuY29sb3JzO1xyXG5cclxuICAgIGN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJztcclxuICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgIGNvbnN0IG1lc3NhZ2UgPSAoZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSX1dJTikgPyB3aW5NZXNzYWdlIDogbG9zZU1lc3NhZ2U7XHJcbiAgICBkcmF3Q2VudGVyZWRUZXh0KG1lc3NhZ2UsIGNhbnZhcy5oZWlnaHQgLyAyIC0gNTAsICc0MHB4IEFyaWFsJywgdGV4dENvbG9yKTtcclxuICAgIGRyYXdDZW50ZXJlZFRleHQoJ1x1QjJFNFx1QzJEQyBcdUMyRENcdUM3OTFcdUQ1NThcdUI4MjRcdUJBNzQgXHVEMDc0XHVCOUFEXHVENTU4XHVDMTM4XHVDNjk0LicsIGNhbnZhcy5oZWlnaHQgLyAyICsgNTAsICcyMHB4IEFyaWFsJywgdGV4dENvbG9yKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaGFuZGxlTW91c2VEb3duKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICBpc01vdXNlRG93biA9IHRydWU7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGhhbmRsZU1vdXNlVXAoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgIGlmICghaXNNb3VzZURvd24pIHJldHVybjtcclxuICAgIGlzTW91c2VEb3duID0gZmFsc2U7XHJcblxyXG4gICAgY29uc3QgbW91c2VQb3MgPSBnZXRNb3VzZVBvcyhldmVudCk7XHJcbiAgICBjb25zdCB7IGJvYXJkT2Zmc2V0WCwgYm9hcmRPZmZzZXRZLCBjZWxsU2l6ZSwgYm9hcmRXaWR0aCwgYm9hcmRIZWlnaHQgfSA9IGNvbmZpZy5nYW1lU2V0dGluZ3M7XHJcblxyXG4gICAgY29uc3QgY29sID0gTWF0aC5mbG9vcigobW91c2VQb3MueCAtIGJvYXJkT2Zmc2V0WCkgLyBjZWxsU2l6ZSk7XHJcbiAgICBjb25zdCByb3cgPSBNYXRoLmZsb29yKChtb3VzZVBvcy55IC0gYm9hcmRPZmZzZXRZKSAvIGNlbGxTaXplKTtcclxuXHJcbiAgICBjb25zdCBpc0luc2lkZUJvYXJkID0gY29sID49IDAgJiYgY29sIDwgYm9hcmRXaWR0aCAmJiByb3cgPj0gMCAmJiByb3cgPCBib2FyZEhlaWdodDtcclxuXHJcbiAgICBzd2l0Y2ggKGdhbWVTdGF0ZSkge1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICBnYW1lU3RhdGUgPSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgIHJlc2V0R2FtZSgpOyAvLyBQcmVwYXJlcyBib2FyZCBzdHJ1Y3R1cmUgYW5kIHN0YXJ0cyBCR01cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgaWYgKGlzSW5zaWRlQm9hcmQpIHtcclxuICAgICAgICAgICAgICAgIGlmIChldmVudC5idXR0b24gPT09IDApIHsgLy8gTGVmdCBjbGlja1xyXG4gICAgICAgICAgICAgICAgICAgIHJldmVhbENlbGwocm93LCBjb2wpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU46XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSX0xPU0U6XHJcbiAgICAgICAgICAgIHJlc2V0R2FtZSgpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaGFuZGxlQ29udGV4dE1lbnUoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblxyXG4gICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICBjb25zdCBtb3VzZVBvcyA9IGdldE1vdXNlUG9zKGV2ZW50KTtcclxuICAgICAgICBjb25zdCB7IGJvYXJkT2Zmc2V0WCwgYm9hcmRPZmZzZXRZLCBjZWxsU2l6ZSwgYm9hcmRXaWR0aCwgYm9hcmRIZWlnaHQgfSA9IGNvbmZpZy5nYW1lU2V0dGluZ3M7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbCA9IE1hdGguZmxvb3IoKG1vdXNlUG9zLnggLSBib2FyZE9mZnNldFgpIC8gY2VsbFNpemUpO1xyXG4gICAgICAgIGNvbnN0IHJvdyA9IE1hdGguZmxvb3IoKG1vdXNlUG9zLnkgLSBib2FyZE9mZnNldFkpIC8gY2VsbFNpemUpO1xyXG5cclxuICAgICAgICBjb25zdCBpc0luc2lkZUJvYXJkID0gY29sID49IDAgJiYgY29sIDwgYm9hcmRXaWR0aCAmJiByb3cgPj0gMCAmJiByb3cgPCBib2FyZEhlaWdodDtcclxuXHJcbiAgICAgICAgaWYgKGlzSW5zaWRlQm9hcmQgJiYgZXZlbnQuYnV0dG9uID09PSAyKSB7IC8vIFJpZ2h0IGNsaWNrXHJcbiAgICAgICAgICAgIHRvZ2dsZUZsYWcocm93LCBjb2wpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2FtZUxvb3AoKSB7XHJcbiAgICBkcmF3KCk7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xyXG59XHJcblxyXG5pbml0R2FtZSgpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUFvRUEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxXQUFRO0FBQ1IsRUFBQUEsV0FBQSxrQkFBZTtBQUNmLEVBQUFBLFdBQUEsYUFBVTtBQUNWLEVBQUFBLFdBQUEsbUJBQWdCO0FBQ2hCLEVBQUFBLFdBQUEsb0JBQWlCO0FBTmhCLFNBQUFBO0FBQUEsR0FBQTtBQVNMLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUksU0FBd0Msb0JBQUksSUFBSTtBQUNwRCxJQUFJLFNBQXdDLG9CQUFJLElBQUk7QUFFcEQsSUFBSSxZQUF1QjtBQUMzQixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUksYUFBc0I7QUFDMUIsSUFBSSxxQkFBNkI7QUFDakMsSUFBSSxtQkFB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
