let canvas;
let ctx;
let gameData;
const loadedImages = /* @__PURE__ */ new Map();
const loadedSounds = /* @__PURE__ */ new Map();
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["PAUSED"] = 3] = "PAUSED";
  GameState2[GameState2["GAME_OVER"] = 4] = "GAME_OVER";
  return GameState2;
})(GameState || {});
let currentGameState = 0 /* TITLE */;
let isSoundOn = true;
let bgmAudio = null;
let board;
let currentPiece = null;
let nextPiece = null;
let score = 0;
let level = 1;
let linesCleared = 0;
let lastFrameTime = 0;
let fallAccumulator = 0;
let currentFallSpeed;
let lastHorizontalMoveTime = 0;
const horizontalMoveDelay = 100;
const initialHorizontalMoveDelay = 200;
let keyPressStatus = {};
let lastHardDropTime = 0;
const hardDropCooldown = 200;
class Tetromino {
  // Array of possible shapes for rotation
  constructor(data) {
    this.colorKey = data.color;
    this.rotations = this.generateRotations(data.shape);
    this.shape = this.rotations[0];
    this.x = Math.floor(gameData.gameSettings.boardWidth / 2) - Math.floor(this.shape[0].length / 2);
    this.y = 0;
  }
  // Generates all 4 rotation states for a given shape
  generateRotations(initialShape) {
    const rotations = [initialShape];
    let currentShape = initialShape;
    for (let i = 0; i < 3; i++) {
      currentShape = this.rotateMatrix(currentShape);
      rotations.push(currentShape);
    }
    return rotations;
  }
  rotateMatrix(matrix) {
    const N = matrix.length;
    const M = matrix[0].length;
    const rotated = Array(M).fill(0).map(() => Array(N).fill(0));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        rotated[j][N - 1 - i] = matrix[i][j];
      }
    }
    return rotated;
  }
  // Attempts to move the piece, returns true if successful
  move(dx, dy) {
    if (!checkCollision(this, dx, dy, this.shape)) {
      this.x += dx;
      this.y += dy;
      return true;
    }
    return false;
  }
  // Attempts to rotate the piece, returns true if successful
  rotate() {
    const currentRotationIndex = this.rotations.indexOf(this.shape);
    const nextRotationIndex = (currentRotationIndex + 1) % this.rotations.length;
    const nextShape = this.rotations[nextRotationIndex];
    const offsets = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [ox, oy] of offsets) {
      if (!checkCollision(this, ox, oy, nextShape)) {
        this.x += ox;
        this.y += oy;
        this.shape = nextShape;
        playSound("rotate");
        return true;
      }
    }
    return false;
  }
  // Draws the tetromino on the canvas
  draw(offsetX = 0, offsetY = 0) {
    const { blockSize } = gameData.gameSettings;
    const color = gameData.colors[this.colorKey];
    const blockImage = loadedImages.get("block");
    for (let r = 0; r < this.shape.length; r++) {
      for (let c = 0; c < this.shape[r].length; c++) {
        if (this.shape[r][c] === 1) {
          const drawX = (this.x + c + offsetX) * blockSize + gameData.gameSettings.boardOffsetX;
          const drawY = (this.y + r + offsetY) * blockSize + gameData.gameSettings.boardOffsetY;
          if (blockImage) {
            ctx.drawImage(blockImage, drawX, drawY, blockSize, blockSize);
          } else {
            ctx.fillStyle = color;
            ctx.fillRect(drawX, drawY, blockSize, blockSize);
            ctx.strokeStyle = gameData.colors.outline;
            ctx.strokeRect(drawX, drawY, blockSize, blockSize);
          }
        }
      }
    }
  }
}
async function loadAssets() {
  const imagePromises = gameData.assets.images.map((asset) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = asset.path;
      img.onload = () => {
        loadedImages.set(asset.name, img);
        resolve();
      };
      img.onerror = () => reject(`Failed to load image: ${asset.path}`);
    });
  });
  const soundPromises = gameData.assets.sounds.map((asset) => {
    return new Promise((resolve, reject) => {
      const audio = new Audio(asset.path);
      audio.volume = asset.volume;
      audio.oncanplaythrough = () => {
        loadedSounds.set(asset.name, audio);
        resolve();
      };
      audio.onerror = () => reject(`Failed to load sound: ${asset.path}`);
    });
  });
  await Promise.all([...imagePromises, ...soundPromises]);
}
async function loadGameData() {
  const response = await fetch("data.json");
  if (!response.ok) {
    throw new Error(`Failed to load data.json: ${response.statusText}`);
  }
  return response.json();
}
async function initGame() {
  canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("Canvas element not found!");
    return;
  }
  ctx = canvas.getContext("2d");
  try {
    gameData = await loadGameData();
    canvas.width = gameData.gameSettings.canvasWidth;
    canvas.height = gameData.gameSettings.canvasHeight;
    await loadAssets();
    console.log("Game data and assets loaded successfully!");
  } catch (error) {
    console.error("Error during initialization:", error);
    return;
  }
  bgmAudio = loadedSounds.get("bgm") || null;
  if (bgmAudio) {
    bgmAudio.loop = true;
    bgmAudio.volume = isSoundOn ? gameData.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.3 : 0;
    bgmAudio.play().catch((e) => console.log("BGM auto-play blocked, will play on user interaction.", e));
  }
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  canvas.addEventListener("mousedown", handleMouseDown);
  resetGameVariables();
  currentFallSpeed = gameData.gameSettings.initialFallSpeed;
  requestAnimationFrame(gameLoop);
}
function resetGameVariables() {
  const { boardWidth, boardHeight } = gameData.gameSettings;
  board = Array(boardHeight).fill(null).map(() => Array(boardWidth).fill(null));
  score = 0;
  level = 1;
  linesCleared = 0;
  currentPiece = null;
  nextPiece = null;
  spawnNewPiece();
  spawnNextPiece();
  fallAccumulator = 0;
  currentFallSpeed = gameData.gameSettings.initialFallSpeed;
}
function gameLoop(currentTime) {
  const deltaTime = currentTime - lastFrameTime;
  lastFrameTime = currentTime;
  update(deltaTime);
  draw();
  requestAnimationFrame(gameLoop);
}
function update(deltaTime) {
  if (currentGameState === 2 /* PLAYING */) {
    fallAccumulator += deltaTime;
    if (fallAccumulator >= currentFallSpeed) {
      if (currentPiece && !currentPiece.move(0, 1)) {
        mergePieceIntoBoard();
        clearLines();
        if (!spawnNewPiece()) {
          currentGameState = 4 /* GAME_OVER */;
          playSound("game_over");
          if (bgmAudio) bgmAudio.pause();
        }
      }
      fallAccumulator = 0;
    }
    if (keyPressStatus["ArrowLeft"] || keyPressStatus["ArrowRight"]) {
      const now = performance.now();
      if (now - lastHorizontalMoveTime > (lastHorizontalMoveTime === 0 ? initialHorizontalMoveDelay : horizontalMoveDelay)) {
        if (keyPressStatus["ArrowLeft"] && currentPiece && currentPiece.move(-1, 0)) {
          playSound("move");
        } else if (keyPressStatus["ArrowRight"] && currentPiece && currentPiece.move(1, 0)) {
          playSound("move");
        }
        lastHorizontalMoveTime = now;
      }
    } else {
      lastHorizontalMoveTime = 0;
    }
  }
}
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  switch (currentGameState) {
    case 0 /* TITLE */:
      drawTitleScreen();
      break;
    case 1 /* INSTRUCTIONS */:
      drawInstructionsScreen();
      break;
    case 2 /* PLAYING */:
      drawPlayingScreen();
      break;
    case 4 /* GAME_OVER */:
      drawPlayingScreen();
      drawGameOverScreen();
      break;
  }
  drawSoundToggleButton();
}
function drawTitleScreen() {
  const { canvasWidth, canvasHeight } = gameData.gameSettings;
  const backgroundImage = loadedImages.get("title_screen_bg");
  if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = gameData.colors.boardBackground;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  ctx.fillStyle = gameData.colors.textPrimary;
  ctx.textAlign = "center";
  ctx.font = "bold 48px Arial";
  ctx.fillText("\uD14C\uD2B8\uB9AC\uC2A4", canvasWidth / 2, canvasHeight / 2 - 50);
  ctx.font = "24px Arial";
  ctx.fillText("\uC2DC\uC791\uD558\uB824\uBA74 Enter \uD0A4\uB97C \uB204\uB974\uC138\uC694", canvasWidth / 2, canvasHeight / 2 + 50);
}
function drawInstructionsScreen() {
  const { canvasWidth, canvasHeight } = gameData.gameSettings;
  ctx.fillStyle = gameData.colors.boardBackground;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = gameData.colors.textPrimary;
  ctx.textAlign = "center";
  ctx.font = "bold 36px Arial";
  ctx.fillText("\uC870\uC791\uBC95", canvasWidth / 2, 100);
  ctx.font = "24px Arial";
  ctx.fillText("\u2190 \u2192 : \uBE14\uB85D \uC774\uB3D9", canvasWidth / 2, 200);
  ctx.fillText("\u2191 \uB610\uB294 X : \uBE14\uB85D \uD68C\uC804", canvasWidth / 2, 250);
  ctx.fillText("\u2193 : \uC18C\uD504\uD2B8 \uB4DC\uB86D (\uCC9C\uCC9C\uD788 \uB0B4\uB9AC\uAE30)", canvasWidth / 2, 300);
  ctx.fillText("Space : \uD558\uB4DC \uB4DC\uB86D (\uBC14\uB85C \uB0B4\uB9AC\uAE30)", canvasWidth / 2, 350);
  ctx.fillText("Enter : \uAC8C\uC784 \uC2DC\uC791", canvasWidth / 2, 450);
}
function drawPlayingScreen() {
  const { boardWidth, boardHeight, blockSize, boardOffsetX, boardOffsetY, canvasWidth, canvasHeight } = gameData.gameSettings;
  const gameBackground = loadedImages.get("background");
  if (gameBackground) {
    ctx.drawImage(gameBackground, 0, 0, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = gameData.colors.boardBackground;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  ctx.fillStyle = "#111";
  ctx.fillRect(boardOffsetX, boardOffsetY, boardWidth * blockSize, boardHeight * blockSize);
  const blockImage = loadedImages.get("block");
  for (let r = 0; r < boardHeight; r++) {
    for (let c = 0; c < boardWidth; c++) {
      const colorKey = board[r][c];
      if (colorKey) {
        const drawX = c * blockSize + boardOffsetX;
        const drawY = r * blockSize + boardOffsetY;
        if (blockImage) {
          ctx.drawImage(blockImage, drawX, drawY, blockSize, blockSize);
        } else {
          ctx.fillStyle = gameData.colors[colorKey];
          ctx.fillRect(drawX, drawY, blockSize, blockSize);
          ctx.strokeStyle = gameData.colors.outline;
          ctx.strokeRect(drawX, drawY, blockSize, blockSize);
        }
      }
    }
  }
  if (currentPiece) {
    currentPiece.draw();
  }
  ctx.strokeStyle = gameData.colors.gridLine;
  for (let i = 0; i <= boardWidth; i++) {
    ctx.beginPath();
    ctx.moveTo(i * blockSize + boardOffsetX, boardOffsetY);
    ctx.lineTo(i * blockSize + boardOffsetX, boardHeight * blockSize + boardOffsetY);
    ctx.stroke();
  }
  for (let i = 0; i <= boardHeight; i++) {
    ctx.beginPath();
    ctx.moveTo(boardOffsetX, i * blockSize + boardOffsetY);
    ctx.lineTo(boardWidth * blockSize + boardOffsetX, i * blockSize + boardOffsetY);
    ctx.stroke();
  }
  ctx.fillStyle = gameData.colors.textPrimary;
  ctx.textAlign = "left";
  ctx.font = "24px Arial";
  ctx.fillText(`\uC810\uC218: ${score}`, gameData.gameSettings.scoreTextOffsetX, gameData.gameSettings.scoreTextOffsetY);
  ctx.fillText(`\uB808\uBCA8: ${level}`, gameData.gameSettings.levelTextOffsetX, gameData.gameSettings.levelTextOffsetY);
  ctx.fillText(`\uB77C\uC778: ${linesCleared}`, gameData.gameSettings.linesTextOffsetX, gameData.gameSettings.linesTextOffsetY);
  ctx.fillText("\uB2E4\uC74C \uBE14\uB85D:", gameData.gameSettings.nextPieceOffsetX, gameData.gameSettings.nextPieceOffsetY - 30);
  if (nextPiece) {
    const nextPieceDrawX = gameData.gameSettings.nextPieceOffsetX / blockSize;
    const nextPieceDrawY = gameData.gameSettings.nextPieceOffsetY / blockSize;
    nextPiece.draw(nextPieceDrawX - nextPiece.x, nextPieceDrawY - nextPiece.y);
  }
}
function drawGameOverScreen() {
  const { canvasWidth, canvasHeight } = gameData.gameSettings;
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = gameData.colors.textPrimary;
  ctx.textAlign = "center";
  ctx.font = "bold 60px Arial";
  ctx.fillText("\uAC8C\uC784 \uC624\uBC84!", canvasWidth / 2, canvasHeight / 2 - 50);
  ctx.font = "30px Arial";
  ctx.fillText(`\uCD5C\uC885 \uC810\uC218: ${score}`, canvasWidth / 2, canvasHeight / 2 + 20);
  ctx.fillText("\uB2E4\uC2DC \uC2DC\uC791\uD558\uB824\uBA74 Enter \uD0A4\uB97C \uB204\uB974\uC138\uC694", canvasWidth / 2, canvasHeight / 2 + 80);
}
function drawSoundToggleButton() {
  const iconSize = 32;
  const padding = 10;
  const drawX = canvas.width - iconSize - padding;
  const drawY = padding;
  const icon = isSoundOn ? loadedImages.get("sound_on_icon") : loadedImages.get("sound_off_icon");
  if (icon) {
    ctx.drawImage(icon, drawX, drawY, iconSize, iconSize);
  } else {
    ctx.fillStyle = isSoundOn ? "green" : "red";
    ctx.fillRect(drawX, drawY, iconSize, iconSize);
    ctx.strokeStyle = "white";
    ctx.strokeRect(drawX, drawY, iconSize, iconSize);
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(isSoundOn ? "ON" : "OFF", drawX + iconSize / 2, drawY + iconSize / 2 + 4);
  }
}
function spawnNewPiece() {
  if (nextPiece) {
    currentPiece = nextPiece;
    spawnNextPiece();
  } else {
    const randomData = gameData.tetrominoes[Math.floor(Math.random() * gameData.tetrominoes.length)];
    currentPiece = new Tetromino(randomData);
    spawnNextPiece();
  }
  if (currentPiece && checkCollision(currentPiece, 0, 0, currentPiece.shape)) {
    return false;
  }
  return true;
}
function spawnNextPiece() {
  const randomData = gameData.tetrominoes[Math.floor(Math.random() * gameData.tetrominoes.length)];
  nextPiece = new Tetromino(randomData);
  nextPiece.x = 0;
  nextPiece.y = 0;
}
function checkCollision(piece, dx, dy, newShape) {
  const { boardWidth, boardHeight } = gameData.gameSettings;
  for (let r = 0; r < newShape.length; r++) {
    for (let c = 0; c < newShape[r].length; c++) {
      if (newShape[r][c] === 1) {
        const boardX = piece.x + c + dx;
        const boardY = piece.y + r + dy;
        if (boardX < 0 || boardX >= boardWidth || boardY >= boardHeight) {
          return true;
        }
        if (boardY < 0) {
          continue;
        }
        if (board[boardY][boardX] !== null) {
          return true;
        }
      }
    }
  }
  return false;
}
function mergePieceIntoBoard() {
  if (!currentPiece) return;
  playSound("land");
  const color = currentPiece.colorKey;
  for (let r = 0; r < currentPiece.shape.length; r++) {
    for (let c = 0; c < currentPiece.shape[r].length; c++) {
      if (currentPiece.shape[r][c] === 1) {
        const boardX = currentPiece.x + c;
        const boardY = currentPiece.y + r;
        if (boardY >= 0 && boardY < gameData.gameSettings.boardHeight && boardX >= 0 && boardX < gameData.gameSettings.boardWidth) {
          board[boardY][boardX] = color;
        }
      }
    }
  }
  currentPiece = null;
}
function clearLines() {
  const { boardHeight, boardWidth, levelUpLines, scorePerLine, scorePerTetris } = gameData.gameSettings;
  let linesClearedThisTurn = 0;
  let newBoard = Array(boardHeight).fill(null).map(() => Array(boardWidth).fill(null));
  let currentRow = boardHeight - 1;
  for (let r = boardHeight - 1; r >= 0; r--) {
    if (board[r].every((cell) => cell !== null)) {
      linesClearedThisTurn++;
    } else {
      newBoard[currentRow] = board[r];
      currentRow--;
    }
  }
  board = newBoard;
  if (linesClearedThisTurn > 0) {
    linesCleared += linesClearedThisTurn;
    playSound("line_clear");
    switch (linesClearedThisTurn) {
      case 1:
        score += scorePerLine;
        break;
      case 2:
        score += scorePerLine * 2.5;
        break;
      // Example: double line bonus
      case 3:
        score += scorePerLine * 5;
        break;
      // Example: triple line bonus
      case 4:
        score += scorePerTetris;
        break;
    }
    const oldLevel = level;
    level = Math.floor(linesCleared / levelUpLines) + 1;
    if (level > oldLevel) {
      currentFallSpeed = gameData.gameSettings.initialFallSpeed * Math.pow(gameData.gameSettings.speedIncreaseRate, level - 1);
      if (currentFallSpeed < 50) currentFallSpeed = 50;
    }
  }
}
function playSound(name, loop = false) {
  if (!isSoundOn) return;
  const audio = loadedSounds.get(name);
  if (audio) {
    const clonedAudio = audio.cloneNode();
    clonedAudio.volume = audio.volume;
    clonedAudio.loop = loop;
    clonedAudio.play().catch((e) => console.error(`Error playing sound ${name}:`, e));
  }
}
function toggleSound() {
  isSoundOn = !isSoundOn;
  if (bgmAudio) {
    bgmAudio.volume = isSoundOn ? gameData.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.3 : 0;
    if (isSoundOn && bgmAudio.paused) {
      bgmAudio.play().catch((e) => console.error("Error playing BGM:", e));
    }
  }
  loadedSounds.forEach((audio) => {
    if (audio !== bgmAudio) {
      audio.muted = !isSoundOn;
    }
  });
}
function handleKeyDown(event) {
  keyPressStatus[event.code] = true;
  if (currentGameState === 0 /* TITLE */) {
    if (event.code === "Enter") {
      currentGameState = 1 /* INSTRUCTIONS */;
    }
  } else if (currentGameState === 1 /* INSTRUCTIONS */) {
    if (event.code === "Enter") {
      currentGameState = 2 /* PLAYING */;
      if (bgmAudio && bgmAudio.paused && isSoundOn) {
        bgmAudio.play().catch((e) => console.error("Error playing BGM:", e));
      }
      resetGameVariables();
    }
  } else if (currentGameState === 4 /* GAME_OVER */) {
    if (event.code === "Enter") {
      currentGameState = 0 /* TITLE */;
      resetGameVariables();
    }
  } else if (currentGameState === 2 /* PLAYING */) {
    if (!currentPiece) return;
    switch (event.code) {
      case "ArrowLeft":
      case "ArrowRight":
        break;
      case "ArrowDown":
        if (currentPiece.move(0, 1)) {
          playSound("move");
          score += 1;
        }
        fallAccumulator = 0;
        break;
      case "ArrowUp":
      case "KeyX":
        currentPiece.rotate();
        break;
      case "Space":
        const now = performance.now();
        if (now - lastHardDropTime < hardDropCooldown) return;
        lastHardDropTime = now;
        let linesDropped = 0;
        while (currentPiece.move(0, 1)) {
          linesDropped++;
        }
        score += linesDropped * 2;
        mergePieceIntoBoard();
        clearLines();
        if (!spawnNewPiece()) {
          currentGameState = 4 /* GAME_OVER */;
          playSound("game_over");
          if (bgmAudio) bgmAudio.pause();
        }
        playSound("land");
        fallAccumulator = 0;
        break;
    }
    event.preventDefault();
  }
}
function handleKeyUp(event) {
  keyPressStatus[event.code] = false;
  if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
    lastHorizontalMoveTime = 0;
  }
}
function handleMouseDown(event) {
  const iconSize = 32;
  const padding = 10;
  const drawX = canvas.width - iconSize - padding;
  const drawY = padding;
  if (event.offsetX >= drawX && event.offsetX <= drawX + iconSize && event.offsetY >= drawY && event.offsetY <= drawY + iconSize) {
    toggleSound();
  }
}
initGame();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW50ZXJmYWNlIEdhbWVTZXR0aW5ncyB7XG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcbiAgICBib2FyZFdpZHRoOiBudW1iZXI7XG4gICAgYm9hcmRIZWlnaHQ6IG51bWJlcjtcbiAgICBibG9ja1NpemU6IG51bWJlcjtcbiAgICBpbml0aWFsRmFsbFNwZWVkOiBudW1iZXI7IC8vIG1zXG4gICAgc3BlZWRJbmNyZWFzZVJhdGU6IG51bWJlcjsgLy8gbXVsdGlwbGllciBmb3IgZmFsbCBzcGVlZCBwZXIgbGV2ZWxcbiAgICBsZXZlbFVwTGluZXM6IG51bWJlcjtcbiAgICBzY29yZVBlckxpbmU6IG51bWJlcjtcbiAgICBzY29yZVBlclRldHJpczogbnVtYmVyO1xuICAgIGJvYXJkT2Zmc2V0WDogbnVtYmVyO1xuICAgIGJvYXJkT2Zmc2V0WTogbnVtYmVyO1xuICAgIG5leHRQaWVjZU9mZnNldFg6IG51bWJlcjtcbiAgICBuZXh0UGllY2VPZmZzZXRZOiBudW1iZXI7XG4gICAgc2NvcmVUZXh0T2Zmc2V0WDogbnVtYmVyO1xuICAgIHNjb3JlVGV4dE9mZnNldFk6IG51bWJlcjtcbiAgICBsZXZlbFRleHRPZmZzZXRYOiBudW1iZXI7XG4gICAgbGV2ZWxUZXh0T2Zmc2V0WTogbnVtYmVyO1xuICAgIGxpbmVzVGV4dE9mZnNldFg6IG51bWJlcjtcbiAgICBsaW5lc1RleHRPZmZzZXRZOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBDb2xvcnMge1xuICAgIGJvYXJkQmFja2dyb3VuZDogc3RyaW5nO1xuICAgIGdyaWRMaW5lOiBzdHJpbmc7XG4gICAgdGV4dFByaW1hcnk6IHN0cmluZztcbiAgICB0ZXh0U2Vjb25kYXJ5OiBzdHJpbmc7XG4gICAgaV9waWVjZTogc3RyaW5nO1xuICAgIG9fcGllY2U6IHN0cmluZztcbiAgICB0X3BpZWNlOiBzdHJpbmc7XG4gICAgc19waWVjZTogc3RyaW5nO1xuICAgIHpfcGllY2U6IHN0cmluZztcbiAgICBqX3BpZWNlOiBzdHJpbmc7XG4gICAgbF9waWVjZTogc3RyaW5nO1xuICAgIG91dGxpbmU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFRldHJvbWlub0RhdGEge1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBjb2xvcjoga2V5b2YgQ29sb3JzOyAvLyBVc2Uga2V5b2YgQ29sb3JzIHRvIHJlZmVyZW5jZSBjb2xvciBuYW1lc1xuICAgIHNoYXBlOiBudW1iZXJbXVtdOyAvLyBJbml0aWFsIHNoYXBlXG59XG5cbmludGVyZmFjZSBJbWFnZUFzc2V0IHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIHdpZHRoOiBudW1iZXI7XG4gICAgaGVpZ2h0OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBTb3VuZEFzc2V0IHtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcbiAgICB2b2x1bWU6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEdhbWVEYXRhIHtcbiAgICBnYW1lU2V0dGluZ3M6IEdhbWVTZXR0aW5ncztcbiAgICBjb2xvcnM6IENvbG9ycztcbiAgICB0ZXRyb21pbm9lczogVGV0cm9taW5vRGF0YVtdO1xuICAgIGFzc2V0czoge1xuICAgICAgICBpbWFnZXM6IEltYWdlQXNzZXRbXTtcbiAgICAgICAgc291bmRzOiBTb3VuZEFzc2V0W107XG4gICAgfTtcbn1cblxuLy8gR2xvYmFsIGdhbWUgdmFyaWFibGVzXG5sZXQgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcbmxldCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcbmxldCBnYW1lRGF0YTogR2FtZURhdGE7XG5jb25zdCBsb2FkZWRJbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpO1xuY29uc3QgbG9hZGVkU291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTtcblxuLy8gR2FtZSBTdGF0ZSBNYW5hZ2VtZW50XG5lbnVtIEdhbWVTdGF0ZSB7XG4gICAgVElUTEUsXG4gICAgSU5TVFJVQ1RJT05TLFxuICAgIFBMQVlJTkcsXG4gICAgUEFVU0VELCAvLyBBZGRlZCBmb3IgcG90ZW50aWFsIHBhdXNlIHNjcmVlbiwgdGhvdWdoIG5vdCBleHBsaWNpdGx5IHJlcXVlc3RlZCwgaXQncyBnb29kIHByYWN0aWNlLlxuICAgIEdBTUVfT1ZFUlxufVxubGV0IGN1cnJlbnRHYW1lU3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcblxuLy8gU291bmQgQ29udHJvbFxubGV0IGlzU291bmRPbjogYm9vbGVhbiA9IHRydWU7XG5sZXQgYmdtQXVkaW86IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuLy8gR2FtZSBMb2dpYyBWYXJpYWJsZXNcbmxldCBib2FyZDogKHN0cmluZyB8IG51bGwpW11bXTsgLy8gU3RvcmVzIGNvbG9yIGtleXMgb3IgbnVsbCBmb3IgZW1wdHkgY2VsbHNcbmxldCBjdXJyZW50UGllY2U6IFRldHJvbWlubyB8IG51bGwgPSBudWxsO1xubGV0IG5leHRQaWVjZTogVGV0cm9taW5vIHwgbnVsbCA9IG51bGw7XG5sZXQgc2NvcmU6IG51bWJlciA9IDA7XG5sZXQgbGV2ZWw6IG51bWJlciA9IDE7XG5sZXQgbGluZXNDbGVhcmVkOiBudW1iZXIgPSAwO1xuXG4vLyBHYW1lIExvb3AgVGltaW5nXG5sZXQgbGFzdEZyYW1lVGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XG5sZXQgZmFsbEFjY3VtdWxhdG9yOiBudW1iZXIgPSAwOyAvLyBUaW1lIHNpbmNlIGxhc3QgYXV0by1mYWxsXG5sZXQgY3VycmVudEZhbGxTcGVlZDogbnVtYmVyOyAvLyBNaWxsaXNlY29uZHMgcGVyIGZhbGwgc3RlcFxuXG4vLyBJbnB1dCBoYW5kbGluZ1xubGV0IGxhc3RIb3Jpem9udGFsTW92ZVRpbWU6IG51bWJlciA9IDA7XG5jb25zdCBob3Jpem9udGFsTW92ZURlbGF5OiBudW1iZXIgPSAxMDA7IC8vIG1zIGJldHdlZW4gaG9yaXpvbnRhbCBtb3ZlcyB3aGVuIGtleSBpcyBoZWxkXG5jb25zdCBpbml0aWFsSG9yaXpvbnRhbE1vdmVEZWxheTogbnVtYmVyID0gMjAwOyAvLyBtcyBmb3IgdGhlIGZpcnN0IGhvcml6b250YWwgbW92ZSBhZnRlciBwcmVzc1xubGV0IGtleVByZXNzU3RhdHVzOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9OyAvLyBUbyB0cmFjayBpZiBhIGtleSBpcyBjdXJyZW50bHkgcHJlc3NlZFxubGV0IGxhc3RIYXJkRHJvcFRpbWU6IG51bWJlciA9IDA7XG5jb25zdCBoYXJkRHJvcENvb2xkb3duOiBudW1iZXIgPSAyMDA7IC8vIENvb2xkb3duIGZvciBoYXJkIGRyb3AgdG8gcHJldmVudCBhY2NpZGVudGFsIG11bHRpcGxlIGRyb3BzXG5cbi8vIFRldHJvbWlubyBDbGFzc1xuY2xhc3MgVGV0cm9taW5vIHtcbiAgICB4OiBudW1iZXI7XG4gICAgeTogbnVtYmVyO1xuICAgIHNoYXBlOiBudW1iZXJbXVtdO1xuICAgIGNvbG9yS2V5OiBrZXlvZiBDb2xvcnM7XG4gICAgcm90YXRpb25zOiBudW1iZXJbXVtdW107IC8vIEFycmF5IG9mIHBvc3NpYmxlIHNoYXBlcyBmb3Igcm90YXRpb25cblxuICAgIGNvbnN0cnVjdG9yKGRhdGE6IFRldHJvbWlub0RhdGEpIHtcbiAgICAgICAgdGhpcy5jb2xvcktleSA9IGRhdGEuY29sb3I7XG4gICAgICAgIHRoaXMucm90YXRpb25zID0gdGhpcy5nZW5lcmF0ZVJvdGF0aW9ucyhkYXRhLnNoYXBlKTtcbiAgICAgICAgdGhpcy5zaGFwZSA9IHRoaXMucm90YXRpb25zWzBdOyAvLyBTdGFydCB3aXRoIHRoZSBmaXJzdCByb3RhdGlvbiBzdGF0ZVxuICAgICAgICB0aGlzLnggPSBNYXRoLmZsb29yKGdhbWVEYXRhLmdhbWVTZXR0aW5ncy5ib2FyZFdpZHRoIC8gMikgLSBNYXRoLmZsb29yKHRoaXMuc2hhcGVbMF0ubGVuZ3RoIC8gMik7XG4gICAgICAgIHRoaXMueSA9IDA7IC8vIFN0YXJ0IGF0IHRoZSB0b3Agb2YgdGhlIGJvYXJkXG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGVzIGFsbCA0IHJvdGF0aW9uIHN0YXRlcyBmb3IgYSBnaXZlbiBzaGFwZVxuICAgIHByaXZhdGUgZ2VuZXJhdGVSb3RhdGlvbnMoaW5pdGlhbFNoYXBlOiBudW1iZXJbXVtdKTogbnVtYmVyW11bXVtdIHtcbiAgICAgICAgY29uc3Qgcm90YXRpb25zOiBudW1iZXJbXVtdW10gPSBbaW5pdGlhbFNoYXBlXTtcbiAgICAgICAgbGV0IGN1cnJlbnRTaGFwZSA9IGluaXRpYWxTaGFwZTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykgeyAvLyBHZW5lcmF0ZSAzIG1vcmUgcm90YXRpb25zXG4gICAgICAgICAgICBjdXJyZW50U2hhcGUgPSB0aGlzLnJvdGF0ZU1hdHJpeChjdXJyZW50U2hhcGUpO1xuICAgICAgICAgICAgcm90YXRpb25zLnB1c2goY3VycmVudFNoYXBlKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcm90YXRpb25zO1xuICAgIH1cblxuICAgIHByaXZhdGUgcm90YXRlTWF0cml4KG1hdHJpeDogbnVtYmVyW11bXSk6IG51bWJlcltdW10ge1xuICAgICAgICBjb25zdCBOID0gbWF0cml4Lmxlbmd0aDtcbiAgICAgICAgY29uc3QgTSA9IG1hdHJpeFswXS5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHJvdGF0ZWQ6IG51bWJlcltdW10gPSBBcnJheShNKS5maWxsKDApLm1hcCgoKSA9PiBBcnJheShOKS5maWxsKDApKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkrKykge1xuICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBNOyBqKyspIHtcbiAgICAgICAgICAgICAgICByb3RhdGVkW2pdW04gLSAxIC0gaV0gPSBtYXRyaXhbaV1bal07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJvdGF0ZWQ7XG4gICAgfVxuXG4gICAgLy8gQXR0ZW1wdHMgdG8gbW92ZSB0aGUgcGllY2UsIHJldHVybnMgdHJ1ZSBpZiBzdWNjZXNzZnVsXG4gICAgbW92ZShkeDogbnVtYmVyLCBkeTogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIGlmICghY2hlY2tDb2xsaXNpb24odGhpcywgZHgsIGR5LCB0aGlzLnNoYXBlKSkge1xuICAgICAgICAgICAgdGhpcy54ICs9IGR4O1xuICAgICAgICAgICAgdGhpcy55ICs9IGR5O1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIEF0dGVtcHRzIHRvIHJvdGF0ZSB0aGUgcGllY2UsIHJldHVybnMgdHJ1ZSBpZiBzdWNjZXNzZnVsXG4gICAgcm90YXRlKCk6IGJvb2xlYW4ge1xuICAgICAgICBjb25zdCBjdXJyZW50Um90YXRpb25JbmRleCA9IHRoaXMucm90YXRpb25zLmluZGV4T2YodGhpcy5zaGFwZSk7XG4gICAgICAgIGNvbnN0IG5leHRSb3RhdGlvbkluZGV4ID0gKGN1cnJlbnRSb3RhdGlvbkluZGV4ICsgMSkgJSB0aGlzLnJvdGF0aW9ucy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IG5leHRTaGFwZSA9IHRoaXMucm90YXRpb25zW25leHRSb3RhdGlvbkluZGV4XTtcblxuICAgICAgICAvLyBTaW1wbGUgd2FsbCBraWNrIG1lY2hhbmlzbTogdHJ5IHRvIHNoaWZ0IGlmIGNvbGxpc2lvblxuICAgICAgICBjb25zdCBvZmZzZXRzID0gW1swLCAwXSwgWy0xLCAwXSwgWzEsIDBdLCBbMCwgLTFdLCBbMCwgMV1dOyAvLyBUcnkgb3JpZ2luYWwsIGxlZnQsIHJpZ2h0LCB1cCwgZG93blxuICAgICAgICBmb3IgKGNvbnN0IFtveCwgb3ldIG9mIG9mZnNldHMpIHtcbiAgICAgICAgICAgIGlmICghY2hlY2tDb2xsaXNpb24odGhpcywgb3gsIG95LCBuZXh0U2hhcGUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy54ICs9IG94O1xuICAgICAgICAgICAgICAgIHRoaXMueSArPSBveTtcbiAgICAgICAgICAgICAgICB0aGlzLnNoYXBlID0gbmV4dFNoYXBlO1xuICAgICAgICAgICAgICAgIHBsYXlTb3VuZCgncm90YXRlJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIERyYXdzIHRoZSB0ZXRyb21pbm8gb24gdGhlIGNhbnZhc1xuICAgIGRyYXcob2Zmc2V0WDogbnVtYmVyID0gMCwgb2Zmc2V0WTogbnVtYmVyID0gMCk6IHZvaWQge1xuICAgICAgICBjb25zdCB7IGJsb2NrU2l6ZSB9ID0gZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xuICAgICAgICBjb25zdCBjb2xvciA9IGdhbWVEYXRhLmNvbG9yc1t0aGlzLmNvbG9yS2V5XTtcbiAgICAgICAgY29uc3QgYmxvY2tJbWFnZSA9IGxvYWRlZEltYWdlcy5nZXQoJ2Jsb2NrJyk7XG5cbiAgICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCB0aGlzLnNoYXBlLmxlbmd0aDsgcisrKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IHRoaXMuc2hhcGVbcl0ubGVuZ3RoOyBjKyspIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zaGFwZVtyXVtjXSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkcmF3WCA9ICh0aGlzLnggKyBjICsgb2Zmc2V0WCkgKiBibG9ja1NpemUgKyBnYW1lRGF0YS5nYW1lU2V0dGluZ3MuYm9hcmRPZmZzZXRYO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBkcmF3WSA9ICh0aGlzLnkgKyByICsgb2Zmc2V0WSkgKiBibG9ja1NpemUgKyBnYW1lRGF0YS5nYW1lU2V0dGluZ3MuYm9hcmRPZmZzZXRZO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChibG9ja0ltYWdlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdHguZHJhd0ltYWdlKGJsb2NrSW1hZ2UsIGRyYXdYLCBkcmF3WSwgYmxvY2tTaXplLCBibG9ja1NpemUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGNvbG9yO1xuICAgICAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxSZWN0KGRyYXdYLCBkcmF3WSwgYmxvY2tTaXplLCBibG9ja1NpemUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gZ2FtZURhdGEuY29sb3JzLm91dGxpbmU7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdHguc3Ryb2tlUmVjdChkcmF3WCwgZHJhd1ksIGJsb2NrU2l6ZSwgYmxvY2tTaXplKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gQXNzZXQgTG9hZGluZ1xuYXN5bmMgZnVuY3Rpb24gbG9hZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBpbWFnZVByb21pc2VzID0gZ2FtZURhdGEuYXNzZXRzLmltYWdlcy5tYXAoYXNzZXQgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaW1nID0gbmV3IEltYWdlKCk7XG4gICAgICAgICAgICBpbWcuc3JjID0gYXNzZXQucGF0aDtcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XG4gICAgICAgICAgICAgICAgbG9hZGVkSW1hZ2VzLnNldChhc3NldC5uYW1lLCBpbWcpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpbWcub25lcnJvciA9ICgpID0+IHJlamVjdChgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBzb3VuZFByb21pc2VzID0gZ2FtZURhdGEuYXNzZXRzLnNvdW5kcy5tYXAoYXNzZXQgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oYXNzZXQucGF0aCk7XG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBhc3NldC52b2x1bWU7XG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxvYWRlZFNvdW5kcy5zZXQoYXNzZXQubmFtZSwgYXVkaW8pO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4gcmVqZWN0KGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldC5wYXRofWApO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XG59XG5cbi8vIEdhbWUgRGF0YSBMb2FkaW5nXG5hc3luYyBmdW5jdGlvbiBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTxHYW1lRGF0YT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBkYXRhLmpzb246ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcbn1cblxuLy8gR2FtZSBJbml0aWFsaXphdGlvblxuYXN5bmMgZnVuY3Rpb24gaW5pdEdhbWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICBpZiAoIWNhbnZhcykge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdDYW52YXMgZWxlbWVudCBub3QgZm91bmQhJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xuXG4gICAgLy8gTG9hZCBnYW1lIGRhdGEgYW5kIGFzc2V0c1xuICAgIHRyeSB7XG4gICAgICAgIGdhbWVEYXRhID0gYXdhaXQgbG9hZEdhbWVEYXRhKCk7XG4gICAgICAgIGNhbnZhcy53aWR0aCA9IGdhbWVEYXRhLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IGdhbWVEYXRhLmdhbWVTZXR0aW5ncy5jYW52YXNIZWlnaHQ7XG4gICAgICAgIGF3YWl0IGxvYWRBc3NldHMoKTtcbiAgICAgICAgY29uc29sZS5sb2coJ0dhbWUgZGF0YSBhbmQgYXNzZXRzIGxvYWRlZCBzdWNjZXNzZnVsbHkhJyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZHVyaW5nIGluaXRpYWxpemF0aW9uOicsIGVycm9yKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEluaXRpYWxpemUgc291bmRcbiAgICBiZ21BdWRpbyA9IGxvYWRlZFNvdW5kcy5nZXQoJ2JnbScpIHx8IG51bGw7XG4gICAgaWYgKGJnbUF1ZGlvKSB7XG4gICAgICAgIGJnbUF1ZGlvLmxvb3AgPSB0cnVlO1xuICAgICAgICBiZ21BdWRpby52b2x1bWUgPSBpc1NvdW5kT24gPyBnYW1lRGF0YS5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lIHx8IDAuMyA6IDA7XG4gICAgICAgIGJnbUF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIGF1dG8tcGxheSBibG9ja2VkLCB3aWxsIHBsYXkgb24gdXNlciBpbnRlcmFjdGlvbi5cIiwgZSkpO1xuICAgIH1cblxuICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lcnNcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlS2V5RG93bik7XG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBoYW5kbGVLZXlVcCk7XG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGhhbmRsZU1vdXNlRG93bik7XG5cbiAgICByZXNldEdhbWVWYXJpYWJsZXMoKTtcbiAgICBjdXJyZW50RmFsbFNwZWVkID0gZ2FtZURhdGEuZ2FtZVNldHRpbmdzLmluaXRpYWxGYWxsU3BlZWQ7XG5cbiAgICAvLyBTdGFydCB0aGUgZ2FtZSBsb29wXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcbn1cblxuLy8gUmVzZXQgZ2FtZSB2YXJpYWJsZXMgZm9yIG5ldyBnYW1lXG5mdW5jdGlvbiByZXNldEdhbWVWYXJpYWJsZXMoKTogdm9pZCB7XG4gICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCB9ID0gZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xuICAgIGJvYXJkID0gQXJyYXkoYm9hcmRIZWlnaHQpLmZpbGwobnVsbCkubWFwKCgpID0+IEFycmF5KGJvYXJkV2lkdGgpLmZpbGwobnVsbCkpO1xuICAgIHNjb3JlID0gMDtcbiAgICBsZXZlbCA9IDE7XG4gICAgbGluZXNDbGVhcmVkID0gMDtcbiAgICBjdXJyZW50UGllY2UgPSBudWxsO1xuICAgIG5leHRQaWVjZSA9IG51bGw7XG4gICAgc3Bhd25OZXdQaWVjZSgpOyAvLyBTcGF3biBmaXJzdCBwaWVjZVxuICAgIHNwYXduTmV4dFBpZWNlKCk7IC8vIFNwYXduIHBpZWNlIGZvciAnbmV4dCcgZGlzcGxheVxuICAgIGZhbGxBY2N1bXVsYXRvciA9IDA7XG4gICAgY3VycmVudEZhbGxTcGVlZCA9IGdhbWVEYXRhLmdhbWVTZXR0aW5ncy5pbml0aWFsRmFsbFNwZWVkO1xufVxuXG4vLyBHYW1lIExvb3BcbmZ1bmN0aW9uIGdhbWVMb29wKGN1cnJlbnRUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wKTogdm9pZCB7XG4gICAgY29uc3QgZGVsdGFUaW1lID0gY3VycmVudFRpbWUgLSBsYXN0RnJhbWVUaW1lO1xuICAgIGxhc3RGcmFtZVRpbWUgPSBjdXJyZW50VGltZTtcblxuICAgIHVwZGF0ZShkZWx0YVRpbWUpO1xuICAgIGRyYXcoKTtcblxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShnYW1lTG9vcCk7XG59XG5cbi8vIFVwZGF0ZSBnYW1lIHN0YXRlXG5mdW5jdGlvbiB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoY3VycmVudEdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcbiAgICAgICAgZmFsbEFjY3VtdWxhdG9yICs9IGRlbHRhVGltZTtcblxuICAgICAgICAvLyBBdXRvIGZhbGwgbG9naWNcbiAgICAgICAgaWYgKGZhbGxBY2N1bXVsYXRvciA+PSBjdXJyZW50RmFsbFNwZWVkKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFBpZWNlICYmICFjdXJyZW50UGllY2UubW92ZSgwLCAxKSkge1xuICAgICAgICAgICAgICAgIC8vIFBpZWNlIGxhbmRlZFxuICAgICAgICAgICAgICAgIG1lcmdlUGllY2VJbnRvQm9hcmQoKTtcbiAgICAgICAgICAgICAgICBjbGVhckxpbmVzKCk7XG4gICAgICAgICAgICAgICAgaWYgKCFzcGF3bk5ld1BpZWNlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XG4gICAgICAgICAgICAgICAgICAgIHBsYXlTb3VuZCgnZ2FtZV9vdmVyJyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChiZ21BdWRpbykgYmdtQXVkaW8ucGF1c2UoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmYWxsQWNjdW11bGF0b3IgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSGFuZGxlIGNvbnRpbnVvdXMgaG9yaXpvbnRhbCBtb3ZlbWVudFxuICAgICAgICBpZiAoa2V5UHJlc3NTdGF0dXNbJ0Fycm93TGVmdCddIHx8IGtleVByZXNzU3RhdHVzWydBcnJvd1JpZ2h0J10pIHtcbiAgICAgICAgICAgIGNvbnN0IG5vdyA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgICAgICAgICAgaWYgKG5vdyAtIGxhc3RIb3Jpem9udGFsTW92ZVRpbWUgPiAobGFzdEhvcml6b250YWxNb3ZlVGltZSA9PT0gMCA/IGluaXRpYWxIb3Jpem9udGFsTW92ZURlbGF5IDogaG9yaXpvbnRhbE1vdmVEZWxheSkpIHtcbiAgICAgICAgICAgICAgICBpZiAoa2V5UHJlc3NTdGF0dXNbJ0Fycm93TGVmdCddICYmIGN1cnJlbnRQaWVjZSAmJiBjdXJyZW50UGllY2UubW92ZSgtMSwgMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcGxheVNvdW5kKCdtb3ZlJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChrZXlQcmVzc1N0YXR1c1snQXJyb3dSaWdodCddICYmIGN1cnJlbnRQaWVjZSAmJiBjdXJyZW50UGllY2UubW92ZSgxLCAwKSkge1xuICAgICAgICAgICAgICAgICAgICBwbGF5U291bmQoJ21vdmUnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFzdEhvcml6b250YWxNb3ZlVGltZSA9IG5vdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxhc3RIb3Jpem9udGFsTW92ZVRpbWUgPSAwOyAvLyBSZXNldCB0aW1lciB3aGVuIG5vIGhvcml6b250YWwga2V5IGlzIHByZXNzZWRcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gRHJhdyBldmVyeXRoaW5nIG9uIHRoZSBjYW52YXNcbmZ1bmN0aW9uIGRyYXcoKTogdm9pZCB7XG4gICAgY3R4LmNsZWFyUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xuXG4gICAgc3dpdGNoIChjdXJyZW50R2FtZVN0YXRlKSB7XG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxuICAgICAgICAgICAgZHJhd1RpdGxlU2NyZWVuKCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuSU5TVFJVQ1RJT05TOlxuICAgICAgICAgICAgZHJhd0luc3RydWN0aW9uc1NjcmVlbigpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XG4gICAgICAgICAgICBkcmF3UGxheWluZ1NjcmVlbigpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcbiAgICAgICAgICAgIGRyYXdQbGF5aW5nU2NyZWVuKCk7IC8vIERyYXcgZ2FtZSBib2FyZCBmb3IgZ2FtZSBvdmVyIHNjcmVlblxuICAgICAgICAgICAgZHJhd0dhbWVPdmVyU2NyZWVuKCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICBkcmF3U291bmRUb2dnbGVCdXR0b24oKTtcbn1cblxuLy8gVUkgRHJhd2luZyBGdW5jdGlvbnNcbmZ1bmN0aW9uIGRyYXdUaXRsZVNjcmVlbigpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNhbnZhc1dpZHRoLCBjYW52YXNIZWlnaHQgfSA9IGdhbWVEYXRhLmdhbWVTZXR0aW5ncztcbiAgICBjb25zdCBiYWNrZ3JvdW5kSW1hZ2UgPSBsb2FkZWRJbWFnZXMuZ2V0KCd0aXRsZV9zY3JlZW5fYmcnKTtcbiAgICBpZiAoYmFja2dyb3VuZEltYWdlKSB7XG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoYmFja2dyb3VuZEltYWdlLCAwLCAwLCBjYW52YXNXaWR0aCwgY2FudmFzSGVpZ2h0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gZ2FtZURhdGEuY29sb3JzLmJvYXJkQmFja2dyb3VuZDtcbiAgICAgICAgY3R4LmZpbGxSZWN0KDAsIDAsIGNhbnZhc1dpZHRoLCBjYW52YXNIZWlnaHQpO1xuICAgIH1cblxuICAgIGN0eC5maWxsU3R5bGUgPSBnYW1lRGF0YS5jb2xvcnMudGV4dFByaW1hcnk7XG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICAgIGN0eC5mb250ID0gJ2JvbGQgNDhweCBBcmlhbCc7XG4gICAgY3R4LmZpbGxUZXh0KCdcdUQxNENcdUQyQjhcdUI5QUNcdUMyQTQnLCBjYW52YXNXaWR0aCAvIDIsIGNhbnZhc0hlaWdodCAvIDIgLSA1MCk7XG5cbiAgICBjdHguZm9udCA9ICcyNHB4IEFyaWFsJztcbiAgICBjdHguZmlsbFRleHQoJ1x1QzJEQ1x1Qzc5MVx1RDU1OFx1QjgyNFx1QkE3NCBFbnRlciBcdUQwQTRcdUI5N0MgXHVCMjA0XHVCOTc0XHVDMTM4XHVDNjk0JywgY2FudmFzV2lkdGggLyAyLCBjYW52YXNIZWlnaHQgLyAyICsgNTApO1xufVxuXG5mdW5jdGlvbiBkcmF3SW5zdHJ1Y3Rpb25zU2NyZWVuKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY2FudmFzV2lkdGgsIGNhbnZhc0hlaWdodCB9ID0gZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xuICAgIGN0eC5maWxsU3R5bGUgPSBnYW1lRGF0YS5jb2xvcnMuYm9hcmRCYWNrZ3JvdW5kO1xuICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXNXaWR0aCwgY2FudmFzSGVpZ2h0KTtcblxuICAgIGN0eC5maWxsU3R5bGUgPSBnYW1lRGF0YS5jb2xvcnMudGV4dFByaW1hcnk7XG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xuICAgIGN0eC5mb250ID0gJ2JvbGQgMzZweCBBcmlhbCc7XG4gICAgY3R4LmZpbGxUZXh0KCdcdUM4NzBcdUM3OTFcdUJDOTUnLCBjYW52YXNXaWR0aCAvIDIsIDEwMCk7XG5cbiAgICBjdHguZm9udCA9ICcyNHB4IEFyaWFsJztcbiAgICBjdHguZmlsbFRleHQoJ1x1MjE5MCBcdTIxOTIgOiBcdUJFMTRcdUI4NUQgXHVDNzc0XHVCM0Q5JywgY2FudmFzV2lkdGggLyAyLCAyMDApO1xuICAgIGN0eC5maWxsVGV4dCgnXHUyMTkxIFx1QjYxMFx1QjI5NCBYIDogXHVCRTE0XHVCODVEIFx1RDY4Q1x1QzgwNCcsIGNhbnZhc1dpZHRoIC8gMiwgMjUwKTtcbiAgICBjdHguZmlsbFRleHQoJ1x1MjE5MyA6IFx1QzE4Q1x1RDUwNFx1RDJCOCBcdUI0RENcdUI4NkQgKFx1Q0M5Q1x1Q0M5Q1x1RDc4OCBcdUIwQjRcdUI5QUNcdUFFMzApJywgY2FudmFzV2lkdGggLyAyLCAzMDApO1xuICAgIGN0eC5maWxsVGV4dCgnU3BhY2UgOiBcdUQ1NThcdUI0REMgXHVCNERDXHVCODZEIChcdUJDMTRcdUI4NUMgXHVCMEI0XHVCOUFDXHVBRTMwKScsIGNhbnZhc1dpZHRoIC8gMiwgMzUwKTtcbiAgICBjdHguZmlsbFRleHQoJ0VudGVyIDogXHVBQzhDXHVDNzg0IFx1QzJEQ1x1Qzc5MScsIGNhbnZhc1dpZHRoIC8gMiwgNDUwKTtcbn1cblxuZnVuY3Rpb24gZHJhd1BsYXlpbmdTY3JlZW4oKTogdm9pZCB7XG4gICAgY29uc3QgeyBib2FyZFdpZHRoLCBib2FyZEhlaWdodCwgYmxvY2tTaXplLCBib2FyZE9mZnNldFgsIGJvYXJkT2Zmc2V0WSwgY2FudmFzV2lkdGgsIGNhbnZhc0hlaWdodCB9ID0gZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xuXG4gICAgLy8gRHJhdyBiYWNrZ3JvdW5kIGZvciB0aGUgZW50aXJlIGNhbnZhcyAob3B0aW9uYWwsIGlmIHVzaW5nIGltYWdlcylcbiAgICBjb25zdCBnYW1lQmFja2dyb3VuZCA9IGxvYWRlZEltYWdlcy5nZXQoJ2JhY2tncm91bmQnKTtcbiAgICBpZiAoZ2FtZUJhY2tncm91bmQpIHtcbiAgICAgICAgY3R4LmRyYXdJbWFnZShnYW1lQmFja2dyb3VuZCwgMCwgMCwgY2FudmFzV2lkdGgsIGNhbnZhc0hlaWdodCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVEYXRhLmNvbG9ycy5ib2FyZEJhY2tncm91bmQ7XG4gICAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXNXaWR0aCwgY2FudmFzSGVpZ2h0KTtcbiAgICB9XG5cblxuICAgIC8vIERyYXcgZ2FtZSBib2FyZCBiYWNrZ3JvdW5kXG4gICAgY3R4LmZpbGxTdHlsZSA9ICcjMTExJzsgLy8gRGFya2VyIGJhY2tncm91bmQgZm9yIHRoZSBib2FyZCBhcmVhXG4gICAgY3R4LmZpbGxSZWN0KGJvYXJkT2Zmc2V0WCwgYm9hcmRPZmZzZXRZLCBib2FyZFdpZHRoICogYmxvY2tTaXplLCBib2FyZEhlaWdodCAqIGJsb2NrU2l6ZSk7XG5cbiAgICAvLyBEcmF3IGV4aXN0aW5nIGJsb2NrcyBvbiB0aGUgYm9hcmRcbiAgICBjb25zdCBibG9ja0ltYWdlID0gbG9hZGVkSW1hZ2VzLmdldCgnYmxvY2snKTtcbiAgICBmb3IgKGxldCByID0gMDsgciA8IGJvYXJkSGVpZ2h0OyByKyspIHtcbiAgICAgICAgZm9yIChsZXQgYyA9IDA7IGMgPCBib2FyZFdpZHRoOyBjKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbG9yS2V5ID0gYm9hcmRbcl1bY107XG4gICAgICAgICAgICBpZiAoY29sb3JLZXkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBkcmF3WCA9IGMgKiBibG9ja1NpemUgKyBib2FyZE9mZnNldFg7XG4gICAgICAgICAgICAgICAgY29uc3QgZHJhd1kgPSByICogYmxvY2tTaXplICsgYm9hcmRPZmZzZXRZO1xuICAgICAgICAgICAgICAgIGlmIChibG9ja0ltYWdlKSB7XG4gICAgICAgICAgICAgICAgICAgIGN0eC5kcmF3SW1hZ2UoYmxvY2tJbWFnZSwgZHJhd1gsIGRyYXdZLCBibG9ja1NpemUsIGJsb2NrU2l6ZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVEYXRhLmNvbG9yc1tjb2xvcktleV07XG4gICAgICAgICAgICAgICAgICAgIGN0eC5maWxsUmVjdChkcmF3WCwgZHJhd1ksIGJsb2NrU2l6ZSwgYmxvY2tTaXplKTtcbiAgICAgICAgICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gZ2FtZURhdGEuY29sb3JzLm91dGxpbmU7XG4gICAgICAgICAgICAgICAgICAgIGN0eC5zdHJva2VSZWN0KGRyYXdYLCBkcmF3WSwgYmxvY2tTaXplLCBibG9ja1NpemUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIERyYXcgY3VycmVudCBmYWxsaW5nIHBpZWNlXG4gICAgaWYgKGN1cnJlbnRQaWVjZSkge1xuICAgICAgICBjdXJyZW50UGllY2UuZHJhdygpO1xuICAgIH1cblxuICAgIC8vIERyYXcgYm9hcmQgZ3JpZCBsaW5lc1xuICAgIGN0eC5zdHJva2VTdHlsZSA9IGdhbWVEYXRhLmNvbG9ycy5ncmlkTGluZTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSBib2FyZFdpZHRoOyBpKyspIHtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBjdHgubW92ZVRvKGkgKiBibG9ja1NpemUgKyBib2FyZE9mZnNldFgsIGJvYXJkT2Zmc2V0WSk7XG4gICAgICAgIGN0eC5saW5lVG8oaSAqIGJsb2NrU2l6ZSArIGJvYXJkT2Zmc2V0WCwgYm9hcmRIZWlnaHQgKiBibG9ja1NpemUgKyBib2FyZE9mZnNldFkpO1xuICAgICAgICBjdHguc3Ryb2tlKCk7XG4gICAgfVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IGJvYXJkSGVpZ2h0OyBpKyspIHtcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xuICAgICAgICBjdHgubW92ZVRvKGJvYXJkT2Zmc2V0WCwgaSAqIGJsb2NrU2l6ZSArIGJvYXJkT2Zmc2V0WSk7XG4gICAgICAgIGN0eC5saW5lVG8oYm9hcmRXaWR0aCAqIGJsb2NrU2l6ZSArIGJvYXJkT2Zmc2V0WCwgaSAqIGJsb2NrU2l6ZSArIGJvYXJkT2Zmc2V0WSk7XG4gICAgICAgIGN0eC5zdHJva2UoKTtcbiAgICB9XG5cbiAgICAvLyBEcmF3IFVJOiBTY29yZSwgTGV2ZWwsIExpbmVzXG4gICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVEYXRhLmNvbG9ycy50ZXh0UHJpbWFyeTtcbiAgICBjdHgudGV4dEFsaWduID0gJ2xlZnQnO1xuICAgIGN0eC5mb250ID0gJzI0cHggQXJpYWwnO1xuICAgIGN0eC5maWxsVGV4dChgXHVDODEwXHVDMjE4OiAke3Njb3JlfWAsIGdhbWVEYXRhLmdhbWVTZXR0aW5ncy5zY29yZVRleHRPZmZzZXRYLCBnYW1lRGF0YS5nYW1lU2V0dGluZ3Muc2NvcmVUZXh0T2Zmc2V0WSk7XG4gICAgY3R4LmZpbGxUZXh0KGBcdUI4MDhcdUJDQTg6ICR7bGV2ZWx9YCwgZ2FtZURhdGEuZ2FtZVNldHRpbmdzLmxldmVsVGV4dE9mZnNldFgsIGdhbWVEYXRhLmdhbWVTZXR0aW5ncy5sZXZlbFRleHRPZmZzZXRZKTtcbiAgICBjdHguZmlsbFRleHQoYFx1Qjc3Q1x1Qzc3ODogJHtsaW5lc0NsZWFyZWR9YCwgZ2FtZURhdGEuZ2FtZVNldHRpbmdzLmxpbmVzVGV4dE9mZnNldFgsIGdhbWVEYXRhLmdhbWVTZXR0aW5ncy5saW5lc1RleHRPZmZzZXRZKTtcblxuICAgIC8vIERyYXcgJ05leHQnIHBpZWNlXG4gICAgY3R4LmZpbGxUZXh0KCdcdUIyRTRcdUM3NEMgXHVCRTE0XHVCODVEOicsIGdhbWVEYXRhLmdhbWVTZXR0aW5ncy5uZXh0UGllY2VPZmZzZXRYLCBnYW1lRGF0YS5nYW1lU2V0dGluZ3MubmV4dFBpZWNlT2Zmc2V0WSAtIDMwKTtcbiAgICBpZiAobmV4dFBpZWNlKSB7XG4gICAgICAgIC8vIEFkanVzdCBkcmF3IHBvc2l0aW9uIGZvciAnbmV4dCcgcGllY2UgZGlzcGxheSBhcmVhXG4gICAgICAgIGNvbnN0IG5leHRQaWVjZURyYXdYID0gZ2FtZURhdGEuZ2FtZVNldHRpbmdzLm5leHRQaWVjZU9mZnNldFggLyBibG9ja1NpemU7XG4gICAgICAgIGNvbnN0IG5leHRQaWVjZURyYXdZID0gZ2FtZURhdGEuZ2FtZVNldHRpbmdzLm5leHRQaWVjZU9mZnNldFkgLyBibG9ja1NpemU7XG4gICAgICAgIG5leHRQaWVjZS5kcmF3KG5leHRQaWVjZURyYXdYIC0gbmV4dFBpZWNlLngsIG5leHRQaWVjZURyYXdZIC0gbmV4dFBpZWNlLnkpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhd0dhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY2FudmFzV2lkdGgsIGNhbnZhc0hlaWdodCB9ID0gZ2FtZURhdGEuZ2FtZVNldHRpbmdzO1xuICAgIGN0eC5maWxsU3R5bGUgPSAncmdiYSgwLCAwLCAwLCAwLjcpJzsgLy8gU2VtaS10cmFuc3BhcmVudCBvdmVybGF5XG4gICAgY3R4LmZpbGxSZWN0KDAsIDAsIGNhbnZhc1dpZHRoLCBjYW52YXNIZWlnaHQpO1xuXG4gICAgY3R4LmZpbGxTdHlsZSA9IGdhbWVEYXRhLmNvbG9ycy50ZXh0UHJpbWFyeTtcbiAgICBjdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XG4gICAgY3R4LmZvbnQgPSAnYm9sZCA2MHB4IEFyaWFsJztcbiAgICBjdHguZmlsbFRleHQoJ1x1QUM4Q1x1Qzc4NCBcdUM2MjRcdUJDODQhJywgY2FudmFzV2lkdGggLyAyLCBjYW52YXNIZWlnaHQgLyAyIC0gNTApO1xuXG4gICAgY3R4LmZvbnQgPSAnMzBweCBBcmlhbCc7XG4gICAgY3R4LmZpbGxUZXh0KGBcdUNENUNcdUM4ODUgXHVDODEwXHVDMjE4OiAke3Njb3JlfWAsIGNhbnZhc1dpZHRoIC8gMiwgY2FudmFzSGVpZ2h0IC8gMiArIDIwKTtcbiAgICBjdHguZmlsbFRleHQoJ1x1QjJFNFx1QzJEQyBcdUMyRENcdUM3OTFcdUQ1NThcdUI4MjRcdUJBNzQgRW50ZXIgXHVEMEE0XHVCOTdDIFx1QjIwNFx1Qjk3NFx1QzEzOFx1QzY5NCcsIGNhbnZhc1dpZHRoIC8gMiwgY2FudmFzSGVpZ2h0IC8gMiArIDgwKTtcbn1cblxuZnVuY3Rpb24gZHJhd1NvdW5kVG9nZ2xlQnV0dG9uKCk6IHZvaWQge1xuICAgIGNvbnN0IGljb25TaXplID0gMzI7XG4gICAgY29uc3QgcGFkZGluZyA9IDEwO1xuICAgIGNvbnN0IGRyYXdYID0gY2FudmFzLndpZHRoIC0gaWNvblNpemUgLSBwYWRkaW5nO1xuICAgIGNvbnN0IGRyYXdZID0gcGFkZGluZztcblxuICAgIGNvbnN0IGljb24gPSBpc1NvdW5kT24gPyBsb2FkZWRJbWFnZXMuZ2V0KCdzb3VuZF9vbl9pY29uJykgOiBsb2FkZWRJbWFnZXMuZ2V0KCdzb3VuZF9vZmZfaWNvbicpO1xuICAgIGlmIChpY29uKSB7XG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoaWNvbiwgZHJhd1gsIGRyYXdZLCBpY29uU2l6ZSwgaWNvblNpemUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEZhbGxiYWNrIGZvciBtaXNzaW5nIGljb24gaW1hZ2VcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGlzU291bmRPbiA/ICdncmVlbicgOiAncmVkJztcbiAgICAgICAgY3R4LmZpbGxSZWN0KGRyYXdYLCBkcmF3WSwgaWNvblNpemUsIGljb25TaXplKTtcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gJ3doaXRlJztcbiAgICAgICAgY3R4LnN0cm9rZVJlY3QoZHJhd1gsIGRyYXdZLCBpY29uU2l6ZSwgaWNvblNpemUpO1xuICAgICAgICBjdHguZmlsbFN0eWxlID0gJ3doaXRlJztcbiAgICAgICAgY3R4LmZvbnQgPSAnMTJweCBBcmlhbCc7XG4gICAgICAgIGN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcbiAgICAgICAgY3R4LmZpbGxUZXh0KGlzU291bmRPbiA/ICdPTicgOiAnT0ZGJywgZHJhd1ggKyBpY29uU2l6ZSAvIDIsIGRyYXdZICsgaWNvblNpemUgLyAyICsgNCk7XG4gICAgfVxufVxuXG4vLyBHYW1lIENvbnRyb2wgRnVuY3Rpb25zXG5mdW5jdGlvbiBzcGF3bk5ld1BpZWNlKCk6IGJvb2xlYW4ge1xuICAgIGlmIChuZXh0UGllY2UpIHtcbiAgICAgICAgY3VycmVudFBpZWNlID0gbmV4dFBpZWNlO1xuICAgICAgICBzcGF3bk5leHRQaWVjZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFRoaXMgY2FzZSBzaG91bGQgaWRlYWxseSBub3QgaGFwcGVuIGlmIG5leHRQaWVjZSBpcyBhbHdheXMgcHJlLWdlbmVyYXRlZFxuICAgICAgICBjb25zdCByYW5kb21EYXRhID0gZ2FtZURhdGEudGV0cm9taW5vZXNbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZ2FtZURhdGEudGV0cm9taW5vZXMubGVuZ3RoKV07XG4gICAgICAgIGN1cnJlbnRQaWVjZSA9IG5ldyBUZXRyb21pbm8ocmFuZG9tRGF0YSk7XG4gICAgICAgIHNwYXduTmV4dFBpZWNlKCk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgZm9yIGltbWVkaWF0ZSBnYW1lIG92ZXJcbiAgICBpZiAoY3VycmVudFBpZWNlICYmIGNoZWNrQ29sbGlzaW9uKGN1cnJlbnRQaWVjZSwgMCwgMCwgY3VycmVudFBpZWNlLnNoYXBlKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7IC8vIENhbm5vdCBzcGF3biBuZXcgcGllY2UsIGdhbWUgb3ZlclxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gc3Bhd25OZXh0UGllY2UoKTogdm9pZCB7XG4gICAgY29uc3QgcmFuZG9tRGF0YSA9IGdhbWVEYXRhLnRldHJvbWlub2VzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGdhbWVEYXRhLnRldHJvbWlub2VzLmxlbmd0aCldO1xuICAgIG5leHRQaWVjZSA9IG5ldyBUZXRyb21pbm8ocmFuZG9tRGF0YSk7XG4gICAgLy8gUmVzZXQgbmV4dCBwaWVjZSBwb3NpdGlvbiB0byBkaXNwbGF5IGl0IGNsZWFybHkgaW4gdGhlICduZXh0JyBib3hcbiAgICBuZXh0UGllY2UueCA9IDA7IC8vIFJlbGF0aXZlIHRvIGl0cyBvd24gc21hbGwgZ3JpZCBmb3IgZHJhd2luZ1xuICAgIG5leHRQaWVjZS55ID0gMDtcbn1cblxuXG4vLyBDb2xsaXNpb24gZGV0ZWN0aW9uIGZ1bmN0aW9uXG5mdW5jdGlvbiBjaGVja0NvbGxpc2lvbihwaWVjZTogVGV0cm9taW5vLCBkeDogbnVtYmVyLCBkeTogbnVtYmVyLCBuZXdTaGFwZTogbnVtYmVyW11bXSk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHsgYm9hcmRXaWR0aCwgYm9hcmRIZWlnaHQgfSA9IGdhbWVEYXRhLmdhbWVTZXR0aW5ncztcbiAgICBmb3IgKGxldCByID0gMDsgciA8IG5ld1NoYXBlLmxlbmd0aDsgcisrKSB7XG4gICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgbmV3U2hhcGVbcl0ubGVuZ3RoOyBjKyspIHtcbiAgICAgICAgICAgIGlmIChuZXdTaGFwZVtyXVtjXSA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJvYXJkWCA9IHBpZWNlLnggKyBjICsgZHg7XG4gICAgICAgICAgICAgICAgY29uc3QgYm9hcmRZID0gcGllY2UueSArIHIgKyBkeTtcblxuICAgICAgICAgICAgICAgIC8vIENoZWNrIHdhbGwgYW5kIGZsb29yIGNvbGxpc2lvblxuICAgICAgICAgICAgICAgIGlmIChib2FyZFggPCAwIHx8IGJvYXJkWCA+PSBib2FyZFdpZHRoIHx8IGJvYXJkWSA+PSBib2FyZEhlaWdodCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgY2VpbGluZyBjb2xsaXNpb24gKGFsbG93IHBpZWNlcyB0byBzdGFydCBhYm92ZSBib2FyZCBidXQgbm90IGdldCBzdHVjaylcbiAgICAgICAgICAgICAgICBpZiAoYm9hcmRZIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiBtb3ZpbmcgZG93biBpbnRvIG5lZ2F0aXZlIFksIGFsbG93LiBJZiBjb2xsaWRpbmcgd2l0aCBleGlzdGluZyBibG9jayBhdCBZPTAsIGRpc2FsbG93LlxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIHNwZWNpZmljIGNoZWNrIGF2b2lkcyBmYWxzZSBwb3NpdGl2ZXMgd2hlbiBwaWVjZSBzcGF3bnMgYXQgWT0wIGFuZCBoYXMgYmxvY2tzIGFib3ZlIGl0IGluIGl0cyBzaGFwZVxuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgcGllY2UncyBibG9jayBhdCBib2FyZFkgaXMgPCAwLCBpdCBtZWFucyBpdCdzIGFib3ZlIHRoZSB2aXNpYmxlIGJvYXJkLCB3aGljaCBpcyBmaW5lIGZvciBzcGF3bmluZy5cbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgY29sbGlzaW9uIHdpdGggZXhpc3RpbmcgYmxvY2tzIG9uIHRoZSBib2FyZFxuICAgICAgICAgICAgICAgIGlmIChib2FyZFtib2FyZFldW2JvYXJkWF0gIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLy8gTWVyZ2UgdGhlIGN1cnJlbnQgcGllY2UgaW50byB0aGUgYm9hcmRcbmZ1bmN0aW9uIG1lcmdlUGllY2VJbnRvQm9hcmQoKTogdm9pZCB7XG4gICAgaWYgKCFjdXJyZW50UGllY2UpIHJldHVybjtcbiAgICBwbGF5U291bmQoJ2xhbmQnKTtcbiAgICBjb25zdCBjb2xvciA9IGN1cnJlbnRQaWVjZS5jb2xvcktleTtcbiAgICBmb3IgKGxldCByID0gMDsgciA8IGN1cnJlbnRQaWVjZS5zaGFwZS5sZW5ndGg7IHIrKykge1xuICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IGN1cnJlbnRQaWVjZS5zaGFwZVtyXS5sZW5ndGg7IGMrKykge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRQaWVjZS5zaGFwZVtyXVtjXSA9PT0gMSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGJvYXJkWCA9IGN1cnJlbnRQaWVjZS54ICsgYztcbiAgICAgICAgICAgICAgICBjb25zdCBib2FyZFkgPSBjdXJyZW50UGllY2UueSArIHI7XG4gICAgICAgICAgICAgICAgaWYgKGJvYXJkWSA+PSAwICYmIGJvYXJkWSA8IGdhbWVEYXRhLmdhbWVTZXR0aW5ncy5ib2FyZEhlaWdodCAmJlxuICAgICAgICAgICAgICAgICAgICBib2FyZFggPj0gMCAmJiBib2FyZFggPCBnYW1lRGF0YS5nYW1lU2V0dGluZ3MuYm9hcmRXaWR0aCkge1xuICAgICAgICAgICAgICAgICAgICBib2FyZFtib2FyZFldW2JvYXJkWF0gPSBjb2xvcjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgY3VycmVudFBpZWNlID0gbnVsbDsgLy8gUGllY2UgaGFzIGxhbmRlZFxufVxuXG4vLyBDbGVhciBmdWxsIGxpbmVzIGFuZCB1cGRhdGUgc2NvcmUvbGV2ZWxcbmZ1bmN0aW9uIGNsZWFyTGluZXMoKTogdm9pZCB7XG4gICAgY29uc3QgeyBib2FyZEhlaWdodCwgYm9hcmRXaWR0aCwgbGV2ZWxVcExpbmVzLCBzY29yZVBlckxpbmUsIHNjb3JlUGVyVGV0cmlzIH0gPSBnYW1lRGF0YS5nYW1lU2V0dGluZ3M7XG4gICAgbGV0IGxpbmVzQ2xlYXJlZFRoaXNUdXJuID0gMDtcbiAgICBsZXQgbmV3Qm9hcmQ6IChzdHJpbmcgfCBudWxsKVtdW10gPSBBcnJheShib2FyZEhlaWdodCkuZmlsbChudWxsKS5tYXAoKCkgPT4gQXJyYXkoYm9hcmRXaWR0aCkuZmlsbChudWxsKSk7XG4gICAgbGV0IGN1cnJlbnRSb3cgPSBib2FyZEhlaWdodCAtIDE7XG5cbiAgICBmb3IgKGxldCByID0gYm9hcmRIZWlnaHQgLSAxOyByID49IDA7IHItLSkge1xuICAgICAgICBpZiAoYm9hcmRbcl0uZXZlcnkoY2VsbCA9PiBjZWxsICE9PSBudWxsKSkge1xuICAgICAgICAgICAgbGluZXNDbGVhcmVkVGhpc1R1cm4rKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5ld0JvYXJkW2N1cnJlbnRSb3ddID0gYm9hcmRbcl07XG4gICAgICAgICAgICBjdXJyZW50Um93LS07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBib2FyZCA9IG5ld0JvYXJkO1xuXG4gICAgaWYgKGxpbmVzQ2xlYXJlZFRoaXNUdXJuID4gMCkge1xuICAgICAgICBsaW5lc0NsZWFyZWQgKz0gbGluZXNDbGVhcmVkVGhpc1R1cm47XG4gICAgICAgIHBsYXlTb3VuZCgnbGluZV9jbGVhcicpO1xuXG4gICAgICAgIC8vIFNjb3JpbmcgbG9naWNcbiAgICAgICAgc3dpdGNoIChsaW5lc0NsZWFyZWRUaGlzVHVybikge1xuICAgICAgICAgICAgY2FzZSAxOiBzY29yZSArPSBzY29yZVBlckxpbmU7IGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAyOiBzY29yZSArPSBzY29yZVBlckxpbmUgKiAyLjU7IGJyZWFrOyAvLyBFeGFtcGxlOiBkb3VibGUgbGluZSBib251c1xuICAgICAgICAgICAgY2FzZSAzOiBzY29yZSArPSBzY29yZVBlckxpbmUgKiA1OyBicmVhazsgIC8vIEV4YW1wbGU6IHRyaXBsZSBsaW5lIGJvbnVzXG4gICAgICAgICAgICBjYXNlIDQ6IHNjb3JlICs9IHNjb3JlUGVyVGV0cmlzOyBicmVhazsgICAgLy8gVGV0cmlzIGJvbnVzXG4gICAgICAgIH1cblxuICAgICAgICAvLyBMZXZlbCB1cCBsb2dpY1xuICAgICAgICBjb25zdCBvbGRMZXZlbCA9IGxldmVsO1xuICAgICAgICBsZXZlbCA9IE1hdGguZmxvb3IobGluZXNDbGVhcmVkIC8gbGV2ZWxVcExpbmVzKSArIDE7XG4gICAgICAgIGlmIChsZXZlbCA+IG9sZExldmVsKSB7XG4gICAgICAgICAgICBjdXJyZW50RmFsbFNwZWVkID0gZ2FtZURhdGEuZ2FtZVNldHRpbmdzLmluaXRpYWxGYWxsU3BlZWQgKiBNYXRoLnBvdyhnYW1lRGF0YS5nYW1lU2V0dGluZ3Muc3BlZWRJbmNyZWFzZVJhdGUsIGxldmVsIC0gMSk7XG4gICAgICAgICAgICBpZiAoY3VycmVudEZhbGxTcGVlZCA8IDUwKSBjdXJyZW50RmFsbFNwZWVkID0gNTA7IC8vIE1pbmltdW0gZmFsbCBzcGVlZFxuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBTb3VuZCBDb250cm9sIEZ1bmN0aW9uc1xuZnVuY3Rpb24gcGxheVNvdW5kKG5hbWU6IHN0cmluZywgbG9vcDogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG4gICAgaWYgKCFpc1NvdW5kT24pIHJldHVybjtcbiAgICBjb25zdCBhdWRpbyA9IGxvYWRlZFNvdW5kcy5nZXQobmFtZSk7XG4gICAgaWYgKGF1ZGlvKSB7XG4gICAgICAgIC8vIENsb25lIGF1ZGlvIHRvIGFsbG93IG11bHRpcGxlIGNvbmN1cnJlbnQgcGxheXMgKGUuZy4gZm9yIG11bHRpcGxlIG1vdmVzKVxuICAgICAgICBjb25zdCBjbG9uZWRBdWRpbyA9IGF1ZGlvLmNsb25lTm9kZSgpIGFzIEhUTUxBdWRpb0VsZW1lbnQ7XG4gICAgICAgIGNsb25lZEF1ZGlvLnZvbHVtZSA9IGF1ZGlvLnZvbHVtZTsgLy8gUmV0YWluIG9yaWdpbmFsIHZvbHVtZVxuICAgICAgICBjbG9uZWRBdWRpby5sb29wID0gbG9vcDtcbiAgICAgICAgY2xvbmVkQXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihgRXJyb3IgcGxheWluZyBzb3VuZCAke25hbWV9OmAsIGUpKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHRvZ2dsZVNvdW5kKCk6IHZvaWQge1xuICAgIGlzU291bmRPbiA9ICFpc1NvdW5kT247XG4gICAgaWYgKGJnbUF1ZGlvKSB7XG4gICAgICAgIGJnbUF1ZGlvLnZvbHVtZSA9IGlzU291bmRPbiA/IGdhbWVEYXRhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpPy52b2x1bWUgfHwgMC4zIDogMDtcbiAgICAgICAgaWYgKGlzU291bmRPbiAmJiBiZ21BdWRpby5wYXVzZWQpIHtcbiAgICAgICAgICAgIGJnbUF1ZGlvLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoXCJFcnJvciBwbGF5aW5nIEJHTTpcIiwgZSkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIC8vIFVwZGF0ZSBhbGwgb3RoZXIgbG9hZGVkIHNvdW5kcyAob3IganVzdCByZWx5IG9uIHBsYXlTb3VuZCBjaGVja2luZyBpc1NvdW5kT24pXG4gICAgbG9hZGVkU291bmRzLmZvckVhY2goYXVkaW8gPT4ge1xuICAgICAgICBpZiAoYXVkaW8gIT09IGJnbUF1ZGlvKSB7IC8vIERvbid0IHRvdWNoIEJHTSwgaXQncyBoYW5kbGVkIHNlcGFyYXRlbHlcbiAgICAgICAgICAgIGF1ZGlvLm11dGVkID0gIWlzU291bmRPbjtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG4vLyBFdmVudCBMaXN0ZW5lcnNcbmZ1bmN0aW9uIGhhbmRsZUtleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICBrZXlQcmVzc1N0YXR1c1tldmVudC5jb2RlXSA9IHRydWU7XG5cbiAgICBpZiAoY3VycmVudEdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFKSB7XG4gICAgICAgIGlmIChldmVudC5jb2RlID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICBjdXJyZW50R2FtZVN0YXRlID0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUztcbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoY3VycmVudEdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUykge1xuICAgICAgICBpZiAoZXZlbnQuY29kZSA9PT0gJ0VudGVyJykge1xuICAgICAgICAgICAgY3VycmVudEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xuICAgICAgICAgICAgaWYgKGJnbUF1ZGlvICYmIGJnbUF1ZGlvLnBhdXNlZCAmJiBpc1NvdW5kT24pIHtcbiAgICAgICAgICAgICAgICBiZ21BdWRpby5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiRXJyb3IgcGxheWluZyBCR006XCIsIGUpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlc2V0R2FtZVZhcmlhYmxlcygpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChjdXJyZW50R2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSB7XG4gICAgICAgIGlmIChldmVudC5jb2RlID09PSAnRW50ZXInKSB7XG4gICAgICAgICAgICBjdXJyZW50R2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBHbyBiYWNrIHRvIHRpdGxlIG9yIGluc3RydWN0aW9uc1xuICAgICAgICAgICAgcmVzZXRHYW1lVmFyaWFibGVzKCk7XG4gICAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGN1cnJlbnRHYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XG4gICAgICAgIGlmICghY3VycmVudFBpZWNlKSByZXR1cm47IC8vIE5vIHBpZWNlIHRvIGNvbnRyb2xcblxuICAgICAgICBzd2l0Y2ggKGV2ZW50LmNvZGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ0Fycm93TGVmdCc6XG4gICAgICAgICAgICBjYXNlICdBcnJvd1JpZ2h0JzpcbiAgICAgICAgICAgICAgICAvLyBJbml0aWFsIG1vdmUgaGFuZGxlZCBieSB1cGRhdGUgbG9vcCBmb3IgY29udGludW91cyBtb3ZlbWVudFxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnQXJyb3dEb3duJzpcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudFBpZWNlLm1vdmUoMCwgMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgcGxheVNvdW5kKCdtb3ZlJyk7XG4gICAgICAgICAgICAgICAgICAgIHNjb3JlICs9IDE7IC8vIFNvZnQgZHJvcCBwb2ludHNcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZmFsbEFjY3VtdWxhdG9yID0gMDsgLy8gUmVzZXQgZmFsbCB0aW1lciBmb3IgZmFzdGVyIGRlc2NlbnRcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0Fycm93VXAnOlxuICAgICAgICAgICAgY2FzZSAnS2V5WCc6XG4gICAgICAgICAgICAgICAgY3VycmVudFBpZWNlLnJvdGF0ZSgpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnU3BhY2UnOlxuICAgICAgICAgICAgICAgIGNvbnN0IG5vdyA9IHBlcmZvcm1hbmNlLm5vdygpO1xuICAgICAgICAgICAgICAgIGlmIChub3cgLSBsYXN0SGFyZERyb3BUaW1lIDwgaGFyZERyb3BDb29sZG93bikgcmV0dXJuOyAvLyBQcmV2ZW50IHJhcGlkIGhhcmQgZHJvcHNcbiAgICAgICAgICAgICAgICBsYXN0SGFyZERyb3BUaW1lID0gbm93O1xuXG4gICAgICAgICAgICAgICAgbGV0IGxpbmVzRHJvcHBlZCA9IDA7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGN1cnJlbnRQaWVjZS5tb3ZlKDAsIDEpKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzRHJvcHBlZCsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzY29yZSArPSBsaW5lc0Ryb3BwZWQgKiAyOyAvLyBIYXJkIGRyb3AgcG9pbnRzXG5cbiAgICAgICAgICAgICAgICBtZXJnZVBpZWNlSW50b0JvYXJkKCk7XG4gICAgICAgICAgICAgICAgY2xlYXJMaW5lcygpO1xuICAgICAgICAgICAgICAgIGlmICghc3Bhd25OZXdQaWVjZSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRHYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xuICAgICAgICAgICAgICAgICAgICBwbGF5U291bmQoJ2dhbWVfb3ZlcicpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYmdtQXVkaW8pIGJnbUF1ZGlvLnBhdXNlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBsYXlTb3VuZCgnbGFuZCcpOyAvLyBQbGF5IGxhbmQgc291bmQgYWZ0ZXIgaGFyZCBkcm9wXG4gICAgICAgICAgICAgICAgZmFsbEFjY3VtdWxhdG9yID0gMDsgLy8gUmVzZXQgZmFsbCB0aW1lclxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgZGVmYXVsdCBicm93c2VyIGFjdGlvbnMgZm9yIGFycm93IGtleXMsIHNwYWNlXG4gICAgfVxufVxuXG5mdW5jdGlvbiBoYW5kbGVLZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICAgIGtleVByZXNzU3RhdHVzW2V2ZW50LmNvZGVdID0gZmFsc2U7XG4gICAgaWYgKGV2ZW50LmNvZGUgPT09ICdBcnJvd0xlZnQnIHx8IGV2ZW50LmNvZGUgPT09ICdBcnJvd1JpZ2h0Jykge1xuICAgICAgICBsYXN0SG9yaXpvbnRhbE1vdmVUaW1lID0gMDsgLy8gUmVzZXQgZm9yIG5leHQgcHJlc3NcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1vdXNlRG93bihldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xuICAgIGNvbnN0IGljb25TaXplID0gMzI7XG4gICAgY29uc3QgcGFkZGluZyA9IDEwO1xuICAgIGNvbnN0IGRyYXdYID0gY2FudmFzLndpZHRoIC0gaWNvblNpemUgLSBwYWRkaW5nO1xuICAgIGNvbnN0IGRyYXdZID0gcGFkZGluZztcblxuICAgIC8vIENoZWNrIGlmIGNsaWNrIGlzIHdpdGhpbiB0aGUgc291bmQgYnV0dG9uIGJvdW5kc1xuICAgIGlmIChldmVudC5vZmZzZXRYID49IGRyYXdYICYmIGV2ZW50Lm9mZnNldFggPD0gZHJhd1ggKyBpY29uU2l6ZSAmJlxuICAgICAgICBldmVudC5vZmZzZXRZID49IGRyYXdZICYmIGV2ZW50Lm9mZnNldFkgPD0gZHJhd1kgKyBpY29uU2l6ZSkge1xuICAgICAgICB0b2dnbGVTb3VuZCgpO1xuICAgIH1cbn1cblxuLy8gRW50cnkgcG9pbnRcbmluaXRHYW1lKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFxRUEsSUFBSTtBQUNKLElBQUk7QUFDSixJQUFJO0FBQ0osTUFBTSxlQUE4QyxvQkFBSSxJQUFJO0FBQzVELE1BQU0sZUFBOEMsb0JBQUksSUFBSTtBQUc1RCxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBTEMsU0FBQUE7QUFBQSxHQUFBO0FBT0wsSUFBSSxtQkFBOEI7QUFHbEMsSUFBSSxZQUFxQjtBQUN6QixJQUFJLFdBQW9DO0FBR3hDLElBQUk7QUFDSixJQUFJLGVBQWlDO0FBQ3JDLElBQUksWUFBOEI7QUFDbEMsSUFBSSxRQUFnQjtBQUNwQixJQUFJLFFBQWdCO0FBQ3BCLElBQUksZUFBdUI7QUFHM0IsSUFBSSxnQkFBcUM7QUFDekMsSUFBSSxrQkFBMEI7QUFDOUIsSUFBSTtBQUdKLElBQUkseUJBQWlDO0FBQ3JDLE1BQU0sc0JBQThCO0FBQ3BDLE1BQU0sNkJBQXFDO0FBQzNDLElBQUksaUJBQTZDLENBQUM7QUFDbEQsSUFBSSxtQkFBMkI7QUFDL0IsTUFBTSxtQkFBMkI7QUFH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
