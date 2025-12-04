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
    audio.play().catch((e) => console.error(`Error playing audio ${name}:`, e));
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
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
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
    resetGame();
    generateBoard(c, r);
    firstClick = false;
    startTime = performance.now();
    playAudio("bgm", true);
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
  const { boardOffsetX, boardOffsetY } = config.gameSettings;
  const { textColor } = config.colors;
  ctx.font = "24px Arial";
  ctx.fillStyle = textColor;
  ctx.textAlign = "left";
  ctx.fillText(`${mineCounterPrefix}${remainingMines}`, boardOffsetX, boardOffsetY - 30);
  if (gameState === "PLAYING" /* PLAYING */ && startTime > 0) {
    elapsedTime = Math.floor((performance.now() - startTime) / 1e3);
  }
  ctx.textAlign = "right";
  ctx.fillText(`${timerPrefix}${elapsedTime}`, config.uiSettings.canvasWidth - boardOffsetX, boardOffsetY - 30);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIFBvaW50IHtcclxuICAgIHg6IG51bWJlcjtcclxuICAgIHk6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIENlbGwge1xyXG4gICAgaXNNaW5lOiBib29sZWFuO1xyXG4gICAgaXNSZXZlYWxlZDogYm9vbGVhbjtcclxuICAgIGlzRmxhZ2dlZDogYm9vbGVhbjtcclxuICAgIGFkamFjZW50TWluZXM6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEltYWdlQXNzZXQge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgcGF0aDogc3RyaW5nO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU291bmRBc3NldCB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcclxuICAgIHNvdW5kczogU291bmRBc3NldFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZVNldHRpbmdzIHtcclxuICAgIGJvYXJkV2lkdGg6IG51bWJlcjtcclxuICAgIGJvYXJkSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBudW1NaW5lczogbnVtYmVyO1xyXG4gICAgY2VsbFNpemU6IG51bWJlcjtcclxuICAgIGJvYXJkT2Zmc2V0WDogbnVtYmVyO1xyXG4gICAgYm9hcmRPZmZzZXRZOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBVSVNldHRpbmdzIHtcclxuICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcclxuICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgdGl0bGVTY3JlZW5JbnN0cnVjdGlvbnM6IHN0cmluZztcclxuICAgIGluc3RydWN0aW9uc1RleHQ6IHN0cmluZ1tdO1xyXG4gICAgd2luTWVzc2FnZTogc3RyaW5nO1xyXG4gICAgbG9zZU1lc3NhZ2U6IHN0cmluZztcclxuICAgIG1pbmVDb3VudGVyUHJlZml4OiBzdHJpbmc7XHJcbiAgICB0aW1lclByZWZpeDogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ29sb3JzIHtcclxuICAgIGJhY2tncm91bmRDb2xvcjogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yOiBzdHJpbmc7XHJcbiAgICBjb3ZlcmVkQ2VsbENvbG9yOiBzdHJpbmc7XHJcbiAgICByZXZlYWxlZENlbGxDb2xvcjogc3RyaW5nO1xyXG4gICAgbWluZVRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgbnVtYmVyQ29sb3JzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBnYW1lU2V0dGluZ3M6IEdhbWVTZXR0aW5ncztcclxuICAgIHVpU2V0dGluZ3M6IFVJU2V0dGluZ3M7XHJcbiAgICBjb2xvcnM6IENvbG9ycztcclxuICAgIGFzc2V0czogQXNzZXRzQ29uZmlnO1xyXG59XHJcblxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBMT0FESU5HID0gJ0xPQURJTkcnLFxyXG4gICAgVElUTEUgPSAnVElUTEUnLFxyXG4gICAgSU5TVFJVQ1RJT05TID0gJ0lOU1RSVUNUSU9OUycsXHJcbiAgICBQTEFZSU5HID0gJ1BMQVlJTkcnLFxyXG4gICAgR0FNRV9PVkVSX1dJTiA9ICdHQU1FX09WRVJfV0lOJyxcclxuICAgIEdBTUVfT1ZFUl9MT1NFID0gJ0dBTUVfT1ZFUl9MT1NFJ1xyXG59XHJcblxyXG5sZXQgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxubGV0IGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG5sZXQgY29uZmlnOiBHYW1lQ29uZmlnO1xyXG5sZXQgaW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxubGV0IHNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcblxyXG5sZXQgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxubGV0IGJvYXJkOiBDZWxsW11bXTtcclxubGV0IHJlbWFpbmluZ01pbmVzOiBudW1iZXI7XHJcbmxldCBmaXJzdENsaWNrOiBib29sZWFuID0gdHJ1ZTtcclxubGV0IHJldmVhbGVkQ2VsbHNDb3VudDogbnVtYmVyID0gMDtcclxubGV0IGZsYWdzUGxhY2VkQ291bnQ6IG51bWJlciA9IDA7XHJcbmxldCBzdGFydFRpbWU6IG51bWJlciA9IDA7XHJcbmxldCBlbGFwc2VkVGltZTogbnVtYmVyID0gMDtcclxubGV0IGlzTW91c2VEb3duOiBib29sZWFuID0gZmFsc2U7IC8vIFRvIHRyYWNrIG1vdXNlIGhvbGQgZm9yIGNsaWNrIGRldGVjdGlvblxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbG9hZEltYWdlKGFzc2V0OiBJbWFnZUFzc2V0KTogUHJvbWlzZTxbc3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50XT4ge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICBpbWcuc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICBpbWcub25sb2FkID0gKCkgPT4gcmVzb2x2ZShbYXNzZXQubmFtZSwgaW1nXSk7XHJcbiAgICAgICAgaW1nLm9uZXJyb3IgPSAoKSA9PiByZWplY3QobmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBpbWFnZTogJHthc3NldC5wYXRofWApKTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkU291bmQoYXNzZXQ6IFNvdW5kQXNzZXQpOiBQcm9taXNlPFtzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnRdPiB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgYXVkaW8uc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICBhdWRpby5wcmVsb2FkID0gJ2F1dG8nO1xyXG4gICAgICAgIGF1ZGlvLnZvbHVtZSA9IGFzc2V0LnZvbHVtZTtcclxuICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4gcmVzb2x2ZShbYXNzZXQubmFtZSwgYXVkaW9dKTtcclxuICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4gcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7YXNzZXQucGF0aH1gKSk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gcGxheUF1ZGlvKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlKSB7XHJcbiAgICBjb25zdCBhdWRpbyA9IHNvdW5kcy5nZXQobmFtZSk7XHJcbiAgICBpZiAoYXVkaW8pIHtcclxuICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgYXVkaW8ubG9vcCA9IGxvb3A7XHJcbiAgICAgICAgYXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihgRXJyb3IgcGxheWluZyBhdWRpbyAke25hbWV9OmAsIGUpKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc3RvcEF1ZGlvKG5hbWU6IHN0cmluZykge1xyXG4gICAgY29uc3QgYXVkaW8gPSBzb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgYXVkaW8ucGF1c2UoKTtcclxuICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdDZW50ZXJlZFRleHQodGV4dDogc3RyaW5nLCB5OiBudW1iZXIsIGZvbnQ6IHN0cmluZywgY29sb3I6IHN0cmluZykge1xyXG4gICAgaWYgKCFjdHggfHwgIWNvbmZpZykgcmV0dXJuO1xyXG4gICAgY3R4LmZvbnQgPSBmb250O1xyXG4gICAgY3R4LmZpbGxTdHlsZSA9IGNvbG9yO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgY3R4LmZpbGxUZXh0KHRleHQsIGNvbmZpZy51aVNldHRpbmdzLmNhbnZhc1dpZHRoIC8gMiwgeSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldE1vdXNlUG9zKGV2ZW50OiBNb3VzZUV2ZW50KTogUG9pbnQge1xyXG4gICAgY29uc3QgcmVjdCA9IGNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgeDogZXZlbnQuY2xpZW50WCAtIHJlY3QubGVmdCxcclxuICAgICAgICB5OiBldmVudC5jbGllbnRZIC0gcmVjdC50b3BcclxuICAgIH07XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGluaXRHYW1lKCkge1xyXG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZC5cIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uOlwiLCBlcnJvcik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNhbnZhcy53aWR0aCA9IGNvbmZpZy51aVNldHRpbmdzLmNhbnZhc1dpZHRoO1xyXG4gICAgY2FudmFzLmhlaWdodCA9IGNvbmZpZy51aVNldHRpbmdzLmNhbnZhc0hlaWdodDtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBjb25maWcuYXNzZXRzLmltYWdlcy5tYXAobG9hZEltYWdlKTtcclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKGxvYWRTb3VuZCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGxvYWRlZEltYWdlcyA9IGF3YWl0IFByb21pc2UuYWxsKGltYWdlUHJvbWlzZXMpO1xyXG4gICAgICAgIGxvYWRlZEltYWdlcy5mb3JFYWNoKChbbmFtZSwgaW1nXSkgPT4gaW1hZ2VzLnNldChuYW1lLCBpbWcpKTtcclxuXHJcbiAgICAgICAgY29uc3QgbG9hZGVkU291bmRzID0gYXdhaXQgUHJvbWlzZS5hbGwoc291bmRQcm9taXNlcyk7XHJcbiAgICAgICAgbG9hZGVkU291bmRzLmZvckVhY2goKFtuYW1lLCBhdWRpb10pID0+IHNvdW5kcy5zZXQobmFtZSwgYXVkaW8pKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coXCJBc3NldHMgbG9hZGVkIHN1Y2Nlc3NmdWxseS5cIik7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBhc3NldHM6XCIsIGVycm9yKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgYWRkRXZlbnRMaXN0ZW5lcnMoKTtcclxuICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIGdhbWVMb29wKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZEV2ZW50TGlzdGVuZXJzKCkge1xyXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGhhbmRsZU1vdXNlRG93bik7XHJcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIGhhbmRsZU1vdXNlVXApO1xyXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NvbnRleHRtZW51JywgaGFuZGxlQ29udGV4dE1lbnUpO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZXNldEdhbWUoKSB7XHJcbiAgICBjb25zdCB7IGJvYXJkV2lkdGgsIGJvYXJkSGVpZ2h0IH0gPSBjb25maWcuZ2FtZVNldHRpbmdzO1xyXG4gICAgYm9hcmQgPSBBcnJheShib2FyZEhlaWdodCkuZmlsbChudWxsKS5tYXAoKCkgPT5cclxuICAgICAgICBBcnJheShib2FyZFdpZHRoKS5maWxsKG51bGwpLm1hcCgoKSA9PiAoe1xyXG4gICAgICAgICAgICBpc01pbmU6IGZhbHNlLFxyXG4gICAgICAgICAgICBpc1JldmVhbGVkOiBmYWxzZSxcclxuICAgICAgICAgICAgaXNGbGFnZ2VkOiBmYWxzZSxcclxuICAgICAgICAgICAgYWRqYWNlbnRNaW5lczogMFxyXG4gICAgICAgIH0pKVxyXG4gICAgKTtcclxuICAgIHJlbWFpbmluZ01pbmVzID0gY29uZmlnLmdhbWVTZXR0aW5ncy5udW1NaW5lcztcclxuICAgIGZpcnN0Q2xpY2sgPSB0cnVlO1xyXG4gICAgcmV2ZWFsZWRDZWxsc0NvdW50ID0gMDtcclxuICAgIGZsYWdzUGxhY2VkQ291bnQgPSAwO1xyXG4gICAgc3RhcnRUaW1lID0gMDtcclxuICAgIGVsYXBzZWRUaW1lID0gMDtcclxuICAgIHN0b3BBdWRpbygnYmdtJyk7XHJcbiAgICBnYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuZXJhdGVCb2FyZChpbml0aWFsQ2xpY2tYOiBudW1iZXIsIGluaXRpYWxDbGlja1k6IG51bWJlcikge1xyXG4gICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCwgbnVtTWluZXMgfSA9IGNvbmZpZy5nYW1lU2V0dGluZ3M7XHJcbiAgICBsZXQgbWluZXNUb1BsYWNlID0gbnVtTWluZXM7XHJcblxyXG4gICAgd2hpbGUgKG1pbmVzVG9QbGFjZSA+IDApIHtcclxuICAgICAgICBjb25zdCByID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYm9hcmRIZWlnaHQpO1xyXG4gICAgICAgIGNvbnN0IGMgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBib2FyZFdpZHRoKTtcclxuXHJcbiAgICAgICAgY29uc3QgaXNTYWZlWm9uZSA9ICh4OiBudW1iZXIsIHk6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAgICAgTWF0aC5hYnMoeCAtIGluaXRpYWxDbGlja1gpIDw9IDEgJiZcclxuICAgICAgICAgICAgICAgIE1hdGguYWJzKHkgLSBpbml0aWFsQ2xpY2tZKSA8PSAxXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgaWYgKCFib2FyZFtyXVtjXS5pc01pbmUgJiYgIWlzU2FmZVpvbmUoYywgcikpIHtcclxuICAgICAgICAgICAgYm9hcmRbcl1bY10uaXNNaW5lID0gdHJ1ZTtcclxuICAgICAgICAgICAgbWluZXNUb1BsYWNlLS07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZvciAobGV0IHIgPSAwOyByIDwgYm9hcmRIZWlnaHQ7IHIrKykge1xyXG4gICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgYm9hcmRXaWR0aDsgYysrKSB7XHJcbiAgICAgICAgICAgIGlmICghYm9hcmRbcl1bY10uaXNNaW5lKSB7XHJcbiAgICAgICAgICAgICAgICBib2FyZFtyXVtjXS5hZGphY2VudE1pbmVzID0gY291bnRBZGphY2VudE1pbmVzKHIsIGMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjb3VudEFkamFjZW50TWluZXMocjogbnVtYmVyLCBjOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCB9ID0gY29uZmlnLmdhbWVTZXR0aW5ncztcclxuICAgIGxldCBjb3VudCA9IDA7XHJcbiAgICBmb3IgKGxldCBkciA9IC0xOyBkciA8PSAxOyBkcisrKSB7XHJcbiAgICAgICAgZm9yIChsZXQgZGMgPSAtMTsgZGMgPD0gMTsgZGMrKykge1xyXG4gICAgICAgICAgICBpZiAoZHIgPT09IDAgJiYgZGMgPT09IDApIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbnIgPSByICsgZHI7XHJcbiAgICAgICAgICAgIGNvbnN0IG5jID0gYyArIGRjO1xyXG5cclxuICAgICAgICAgICAgaWYgKG5yID49IDAgJiYgbnIgPCBib2FyZEhlaWdodCAmJiBuYyA+PSAwICYmIG5jIDwgYm9hcmRXaWR0aCAmJiBib2FyZFtucl1bbmNdLmlzTWluZSkge1xyXG4gICAgICAgICAgICAgICAgY291bnQrKztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBjb3VudDtcclxufVxyXG5cclxuZnVuY3Rpb24gcmV2ZWFsQ2VsbChyOiBudW1iZXIsIGM6IG51bWJlcikge1xyXG4gICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCwgbnVtTWluZXMgfSA9IGNvbmZpZy5nYW1lU2V0dGluZ3M7XHJcblxyXG4gICAgaWYgKHIgPCAwIHx8IHIgPj0gYm9hcmRIZWlnaHQgfHwgYyA8IDAgfHwgYyA+PSBib2FyZFdpZHRoIHx8IGJvYXJkW3JdW2NdLmlzUmV2ZWFsZWQgfHwgYm9hcmRbcl1bY10uaXNGbGFnZ2VkKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChmaXJzdENsaWNrKSB7XHJcbiAgICAgICAgcmVzZXRHYW1lKCk7IC8vIENsZWFycyBib2FyZCBhbmQgcmVzZXRzIHN0YXRlIHZhcmlhYmxlc1xyXG4gICAgICAgIGdlbmVyYXRlQm9hcmQoYywgcik7XHJcbiAgICAgICAgZmlyc3RDbGljayA9IGZhbHNlO1xyXG4gICAgICAgIHN0YXJ0VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIHBsYXlBdWRpbygnYmdtJywgdHJ1ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgYm9hcmRbcl1bY10uaXNSZXZlYWxlZCA9IHRydWU7XHJcbiAgICByZXZlYWxlZENlbGxzQ291bnQrKztcclxuICAgIHBsYXlBdWRpbygnY2xpY2tfcmV2ZWFsJyk7XHJcblxyXG4gICAgaWYgKGJvYXJkW3JdW2NdLmlzTWluZSkge1xyXG4gICAgICAgIGdhbWVPdmVyKEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChib2FyZFtyXVtjXS5hZGphY2VudE1pbmVzID09PSAwKSB7XHJcbiAgICAgICAgZm9yIChsZXQgZHIgPSAtMTsgZHIgPD0gMTsgZHIrKykge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBkYyA9IC0xOyBkYyA8PSAxOyBkYysrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZHIgPT09IDAgJiYgZGMgPT09IDApIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgcmV2ZWFsQ2VsbChyICsgZHIsIGMgKyBkYyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY2hlY2tXaW5Db25kaXRpb24oKTtcclxufVxyXG5cclxuZnVuY3Rpb24gdG9nZ2xlRmxhZyhyOiBudW1iZXIsIGM6IG51bWJlcikge1xyXG4gICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCB9ID0gY29uZmlnLmdhbWVTZXR0aW5ncztcclxuXHJcbiAgICBpZiAociA8IDAgfHwgciA+PSBib2FyZEhlaWdodCB8fCBjIDwgMCB8fCBjID49IGJvYXJkV2lkdGggfHwgYm9hcmRbcl1bY10uaXNSZXZlYWxlZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZmlyc3RDbGljaykgcmV0dXJuO1xyXG5cclxuICAgIGJvYXJkW3JdW2NdLmlzRmxhZ2dlZCA9ICFib2FyZFtyXVtjXS5pc0ZsYWdnZWQ7XHJcbiAgICBwbGF5QXVkaW8oJ2NsaWNrX2ZsYWcnKTtcclxuXHJcbiAgICBpZiAoYm9hcmRbcl1bY10uaXNGbGFnZ2VkKSB7XHJcbiAgICAgICAgZmxhZ3NQbGFjZWRDb3VudCsrO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBmbGFnc1BsYWNlZENvdW50LS07XHJcbiAgICB9XHJcbiAgICByZW1haW5pbmdNaW5lcyA9IGNvbmZpZy5nYW1lU2V0dGluZ3MubnVtTWluZXMgLSBmbGFnc1BsYWNlZENvdW50O1xyXG4gICAgY2hlY2tXaW5Db25kaXRpb24oKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2hlY2tXaW5Db25kaXRpb24oKSB7XHJcbiAgICBjb25zdCB7IGJvYXJkV2lkdGgsIGJvYXJkSGVpZ2h0LCBudW1NaW5lcyB9ID0gY29uZmlnLmdhbWVTZXR0aW5ncztcclxuICAgIGNvbnN0IHRvdGFsQ2VsbHMgPSBib2FyZFdpZHRoICogYm9hcmRIZWlnaHQ7XHJcblxyXG4gICAgaWYgKHJldmVhbGVkQ2VsbHNDb3VudCA9PT0gKHRvdGFsQ2VsbHMgLSBudW1NaW5lcykpIHtcclxuICAgICAgICBnYW1lT3ZlcihHYW1lU3RhdGUuR0FNRV9PVkVSX1dJTik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdhbWVPdmVyKHJlYXNvbjogR2FtZVN0YXRlKSB7XHJcbiAgICBnYW1lU3RhdGUgPSByZWFzb247XHJcbiAgICBzdG9wQXVkaW8oJ2JnbScpO1xyXG4gICAgaWYgKHJlYXNvbiA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9MT1NFKSB7XHJcbiAgICAgICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCB9ID0gY29uZmlnLmdhbWVTZXR0aW5ncztcclxuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IGJvYXJkSGVpZ2h0OyByKyspIHtcclxuICAgICAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBib2FyZFdpZHRoOyBjKyspIHtcclxuICAgICAgICAgICAgICAgIGlmIChib2FyZFtyXVtjXS5pc01pbmUgJiYgIWJvYXJkW3JdW2NdLmlzRmxhZ2dlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGJvYXJkW3JdW2NdLmlzUmV2ZWFsZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHBsYXlBdWRpbygnZXhwbG9zaW9uJyk7XHJcbiAgICB9IGVsc2UgaWYgKHJlYXNvbiA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU4pIHtcclxuICAgICAgICBwbGF5QXVkaW8oJ3dpbl9zb3VuZCcpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3KCkge1xyXG4gICAgaWYgKCFjdHggfHwgIWNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgIGN0eC5maWxsU3R5bGUgPSBjb25maWcuY29sb3JzLmJhY2tncm91bmRDb2xvcjtcclxuICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG5cclxuICAgIHN3aXRjaCAoZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuTE9BRElORzpcclxuICAgICAgICAgICAgZHJhd0NlbnRlcmVkVGV4dCgnXHVCODVDXHVCNTI5IFx1QzkxMS4uLicsIGNhbnZhcy5oZWlnaHQgLyAyLCAnMzBweCBBcmlhbCcsIGNvbmZpZy5jb2xvcnMudGV4dENvbG9yKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIGRyYXdUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVJfV0lOOlxyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUl9MT1NFOlxyXG4gICAgICAgICAgICBkcmF3R2FtZVNjcmVlbigpO1xyXG4gICAgICAgICAgICBkcmF3VUlTY3JlZW4oKTtcclxuICAgICAgICAgICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU4gfHwgZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSX0xPU0UpIHtcclxuICAgICAgICAgICAgICAgIGRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3VGl0bGVTY3JlZW4oKSB7XHJcbiAgICBpZiAoIWNvbmZpZykgcmV0dXJuO1xyXG4gICAgZHJhd0NlbnRlcmVkVGV4dChjb25maWcudWlTZXR0aW5ncy50aXRsZVNjcmVlblRleHQsIGNhbnZhcy5oZWlnaHQgLyAyIC0gNTAsICc1MHB4IEFyaWFsJywgY29uZmlnLmNvbG9ycy50ZXh0Q29sb3IpO1xyXG4gICAgZHJhd0NlbnRlcmVkVGV4dChjb25maWcudWlTZXR0aW5ncy50aXRsZVNjcmVlbkluc3RydWN0aW9ucywgY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJzIwcHggQXJpYWwnLCBjb25maWcuY29sb3JzLnRleHRDb2xvcik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKSB7XHJcbiAgICBpZiAoIWNvbmZpZykgcmV0dXJuO1xyXG4gICAgbGV0IHlPZmZzZXQgPSBjYW52YXMuaGVpZ2h0IC8gMiAtIGNvbmZpZy51aVNldHRpbmdzLmluc3RydWN0aW9uc1RleHQubGVuZ3RoICogMjAgLyAyO1xyXG4gICAgZm9yIChjb25zdCBsaW5lIG9mIGNvbmZpZy51aVNldHRpbmdzLmluc3RydWN0aW9uc1RleHQpIHtcclxuICAgICAgICBkcmF3Q2VudGVyZWRUZXh0KGxpbmUsIHlPZmZzZXQsICcyMHB4IEFyaWFsJywgY29uZmlnLmNvbG9ycy50ZXh0Q29sb3IpO1xyXG4gICAgICAgIHlPZmZzZXQgKz0gMzA7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdHYW1lU2NyZWVuKCkge1xyXG4gICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCwgY2VsbFNpemUsIGJvYXJkT2Zmc2V0WCwgYm9hcmRPZmZzZXRZIH0gPSBjb25maWcuZ2FtZVNldHRpbmdzO1xyXG5cclxuICAgIGZvciAobGV0IHIgPSAwOyByIDwgYm9hcmRIZWlnaHQ7IHIrKykge1xyXG4gICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgYm9hcmRXaWR0aDsgYysrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGwgPSBib2FyZFtyXVtjXTtcclxuICAgICAgICAgICAgY29uc3QgeCA9IGJvYXJkT2Zmc2V0WCArIGMgKiBjZWxsU2l6ZTtcclxuICAgICAgICAgICAgY29uc3QgeSA9IGJvYXJkT2Zmc2V0WSArIHIgKiBjZWxsU2l6ZTtcclxuXHJcbiAgICAgICAgICAgIGxldCBpbWc6IEhUTUxJbWFnZUVsZW1lbnQgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgICAgICBpZiAoY2VsbC5pc1JldmVhbGVkKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoY2VsbC5pc01pbmUpIHtcclxuICAgICAgICAgICAgICAgICAgICBpbWcgPSBpbWFnZXMuZ2V0KCdtaW5lJyk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNlbGwuYWRqYWNlbnRNaW5lcyA+IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBpbWcgPSBpbWFnZXMuZ2V0KGBudW1iZXJfJHtjZWxsLmFkamFjZW50TWluZXN9YCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGltZyA9IGltYWdlcy5nZXQoJ3JldmVhbGVkX2VtcHR5Jyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2VsbC5pc0ZsYWdnZWQpIHtcclxuICAgICAgICAgICAgICAgIGltZyA9IGltYWdlcy5nZXQoJ2ZsYWcnKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGltZyA9IGltYWdlcy5nZXQoJ2NvdmVyZWQnKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGltZykge1xyXG4gICAgICAgICAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHgsIHksIGNlbGxTaXplLCBjZWxsU2l6ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdVSVNjcmVlbigpIHtcclxuICAgIGNvbnN0IHsgbWluZUNvdW50ZXJQcmVmaXgsIHRpbWVyUHJlZml4IH0gPSBjb25maWcudWlTZXR0aW5ncztcclxuICAgIGNvbnN0IHsgYm9hcmRPZmZzZXRYLCBib2FyZE9mZnNldFkgfSA9IGNvbmZpZy5nYW1lU2V0dGluZ3M7XHJcbiAgICBjb25zdCB7IHRleHRDb2xvciB9ID0gY29uZmlnLmNvbG9ycztcclxuXHJcbiAgICBjdHguZm9udCA9ICcyNHB4IEFyaWFsJztcclxuICAgIGN0eC5maWxsU3R5bGUgPSB0ZXh0Q29sb3I7XHJcbiAgICBjdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgY3R4LmZpbGxUZXh0KGAke21pbmVDb3VudGVyUHJlZml4fSR7cmVtYWluaW5nTWluZXN9YCwgYm9hcmRPZmZzZXRYLCBib2FyZE9mZnNldFkgLSAzMCk7XHJcblxyXG4gICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgc3RhcnRUaW1lID4gMCkge1xyXG4gICAgICAgIGVsYXBzZWRUaW1lID0gTWF0aC5mbG9vcigocGVyZm9ybWFuY2Uubm93KCkgLSBzdGFydFRpbWUpIC8gMTAwMCk7XHJcbiAgICB9XHJcbiAgICBjdHgudGV4dEFsaWduID0gJ3JpZ2h0JztcclxuICAgIGN0eC5maWxsVGV4dChgJHt0aW1lclByZWZpeH0ke2VsYXBzZWRUaW1lfWAsIGNvbmZpZy51aVNldHRpbmdzLmNhbnZhc1dpZHRoIC0gYm9hcmRPZmZzZXRYLCBib2FyZE9mZnNldFkgLSAzMCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdHYW1lT3ZlclNjcmVlbigpIHtcclxuICAgIGNvbnN0IHsgd2luTWVzc2FnZSwgbG9zZU1lc3NhZ2UgfSA9IGNvbmZpZy51aVNldHRpbmdzO1xyXG4gICAgY29uc3QgeyB0ZXh0Q29sb3IgfSA9IGNvbmZpZy5jb2xvcnM7XHJcblxyXG4gICAgY3R4LmZpbGxTdHlsZSA9ICdyZ2JhKDAsIDAsIDAsIDAuNyknO1xyXG4gICAgY3R4LmZpbGxSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgY29uc3QgbWVzc2FnZSA9IChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVJfV0lOKSA/IHdpbk1lc3NhZ2UgOiBsb3NlTWVzc2FnZTtcclxuICAgIGRyYXdDZW50ZXJlZFRleHQobWVzc2FnZSwgY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgJzQwcHggQXJpYWwnLCB0ZXh0Q29sb3IpO1xyXG4gICAgZHJhd0NlbnRlcmVkVGV4dCgnXHVCMkU0XHVDMkRDIFx1QzJEQ1x1Qzc5MVx1RDU1OFx1QjgyNFx1QkE3NCBcdUQwNzRcdUI5QURcdUQ1NThcdUMxMzhcdUM2OTQuJywgY2FudmFzLmhlaWdodCAvIDIgKyA1MCwgJzIwcHggQXJpYWwnLCB0ZXh0Q29sb3IpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBoYW5kbGVNb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgIGlzTW91c2VEb3duID0gdHJ1ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gaGFuZGxlTW91c2VVcChldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgaWYgKCFpc01vdXNlRG93bikgcmV0dXJuO1xyXG4gICAgaXNNb3VzZURvd24gPSBmYWxzZTtcclxuXHJcbiAgICBjb25zdCBtb3VzZVBvcyA9IGdldE1vdXNlUG9zKGV2ZW50KTtcclxuICAgIGNvbnN0IHsgYm9hcmRPZmZzZXRYLCBib2FyZE9mZnNldFksIGNlbGxTaXplLCBib2FyZFdpZHRoLCBib2FyZEhlaWdodCB9ID0gY29uZmlnLmdhbWVTZXR0aW5ncztcclxuXHJcbiAgICBjb25zdCBjb2wgPSBNYXRoLmZsb29yKChtb3VzZVBvcy54IC0gYm9hcmRPZmZzZXRYKSAvIGNlbGxTaXplKTtcclxuICAgIGNvbnN0IHJvdyA9IE1hdGguZmxvb3IoKG1vdXNlUG9zLnkgLSBib2FyZE9mZnNldFkpIC8gY2VsbFNpemUpO1xyXG5cclxuICAgIGNvbnN0IGlzSW5zaWRlQm9hcmQgPSBjb2wgPj0gMCAmJiBjb2wgPCBib2FyZFdpZHRoICYmIHJvdyA+PSAwICYmIHJvdyA8IGJvYXJkSGVpZ2h0O1xyXG5cclxuICAgIHN3aXRjaCAoZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgcmVzZXRHYW1lKCk7IC8vIFByZXBhcmVzIGJvYXJkIHN0cnVjdHVyZSwgYWN0dWFsIGdhbWUgc3RhcnRzIG9uIGZpcnN0IHJldmVhbENlbGxcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgaWYgKGlzSW5zaWRlQm9hcmQpIHtcclxuICAgICAgICAgICAgICAgIGlmIChldmVudC5idXR0b24gPT09IDApIHsgLy8gTGVmdCBjbGlja1xyXG4gICAgICAgICAgICAgICAgICAgIHJldmVhbENlbGwocm93LCBjb2wpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU46XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSX0xPU0U6XHJcbiAgICAgICAgICAgIHJlc2V0R2FtZSgpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaGFuZGxlQ29udGV4dE1lbnUoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblxyXG4gICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICBjb25zdCBtb3VzZVBvcyA9IGdldE1vdXNlUG9zKGV2ZW50KTtcclxuICAgICAgICBjb25zdCB7IGJvYXJkT2Zmc2V0WCwgYm9hcmRPZmZzZXRZLCBjZWxsU2l6ZSwgYm9hcmRXaWR0aCwgYm9hcmRIZWlnaHQgfSA9IGNvbmZpZy5nYW1lU2V0dGluZ3M7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbCA9IE1hdGguZmxvb3IoKG1vdXNlUG9zLnggLSBib2FyZE9mZnNldFgpIC8gY2VsbFNpemUpO1xyXG4gICAgICAgIGNvbnN0IHJvdyA9IE1hdGguZmxvb3IoKG1vdXNlUG9zLnkgLSBib2FyZE9mZnNldFkpIC8gY2VsbFNpemUpO1xyXG5cclxuICAgICAgICBjb25zdCBpc0luc2lkZUJvYXJkID0gY29sID49IDAgJiYgY29sIDwgYm9hcmRXaWR0aCAmJiByb3cgPj0gMCAmJiByb3cgPCBib2FyZEhlaWdodDtcclxuXHJcbiAgICAgICAgaWYgKGlzSW5zaWRlQm9hcmQgJiYgZXZlbnQuYnV0dG9uID09PSAyKSB7IC8vIFJpZ2h0IGNsaWNrXHJcbiAgICAgICAgICAgIHRvZ2dsZUZsYWcocm93LCBjb2wpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2FtZUxvb3AoKSB7XHJcbiAgICBkcmF3KCk7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xyXG59XHJcblxyXG5pbml0R2FtZSgpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiQUFvRUEsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsV0FBQSxhQUFVO0FBQ1YsRUFBQUEsV0FBQSxXQUFRO0FBQ1IsRUFBQUEsV0FBQSxrQkFBZTtBQUNmLEVBQUFBLFdBQUEsYUFBVTtBQUNWLEVBQUFBLFdBQUEsbUJBQWdCO0FBQ2hCLEVBQUFBLFdBQUEsb0JBQWlCO0FBTmhCLFNBQUFBO0FBQUEsR0FBQTtBQVNMLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUksU0FBd0Msb0JBQUksSUFBSTtBQUNwRCxJQUFJLFNBQXdDLG9CQUFJLElBQUk7QUFFcEQsSUFBSSxZQUF1QjtBQUMzQixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUksYUFBc0I7QUFDMUIsSUFBSSxxQkFBNkI7QUFDakMsSUFBSSxtQkFBMkI7QUFDL0IsSUFBSSxZQUFvQjtBQUN4QixJQUFJLGNBQXNCO0FBQzFCLElBQUksY0FBdUI7QUFFM0IsZUFBZSxVQUFVLE9BQXdEO0FBQzdFLFNBQU8sSUFBSSxRQUFRLENBQUMs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
