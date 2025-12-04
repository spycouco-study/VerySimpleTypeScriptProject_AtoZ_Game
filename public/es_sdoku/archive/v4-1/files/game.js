var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["SOLVED"] = 3] = "SOLVED";
  return GameState2;
})(GameState || {});
var InputKey = /* @__PURE__ */ ((InputKey2) => {
  InputKey2["ARROW_LEFT"] = "ArrowLeft";
  InputKey2["ARROW_RIGHT"] = "ArrowRight";
  InputKey2["ARROW_UP"] = "ArrowUp";
  InputKey2["ARROW_DOWN"] = "ArrowDown";
  InputKey2["SPACE"] = " ";
  InputKey2["ENTER"] = "Enter";
  InputKey2["KEY_1"] = "1";
  InputKey2["KEY_2"] = "2";
  InputKey2["KEY_3"] = "3";
  InputKey2["KEY_4"] = "4";
  InputKey2["KEY_5"] = "5";
  InputKey2["KEY_6"] = "6";
  InputKey2["KEY_7"] = "7";
  InputKey2["KEY_8"] = "8";
  InputKey2["KEY_9"] = "9";
  InputKey2["BACKSPACE"] = "Backspace";
  InputKey2["DELETE"] = "Delete";
  return InputKey2;
})(InputKey || {});
let canvas;
let ctx;
let gameConfig;
let loadedImages = /* @__PURE__ */ new Map();
let loadedSounds = /* @__PURE__ */ new Map();
let inputState = /* @__PURE__ */ new Set();
let currentState = 0 /* TITLE */;
let lastFrameTime = 0;
let sudokuBoard = [];
let initialBoard = [];
let selectedRow = -1;
let selectedCol = -1;
let currentDifficulty = "easy";
let backgroundMusic;
let startSound;
let cellSelectSound;
let placeNumberSound;
let clearNumberSound;
let winSound;
async function loadGameData() {
  const response = await fetch("data.json");
  if (!response.ok) {
    throw new Error(`Failed to load data.json: ${response.statusText}`);
  }
  return response.json();
}
async function loadAssets(config) {
  const imagePromises = [];
  const soundPromises = [];
  for (const imgConfig of config.images) {
    const img = new Image();
    img.src = imgConfig.path;
    const promise = new Promise((resolve, reject) => {
      img.onload = () => {
        loadedImages.set(imgConfig.name, img);
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${imgConfig.path}`));
    });
    imagePromises.push(promise);
  }
  for (const soundConfig of config.sounds) {
    const audio = new Audio(soundConfig.path);
    audio.volume = soundConfig.volume;
    const promise = new Promise((resolve, reject) => {
      audio.oncanplaythrough = () => {
        loadedSounds.set(soundConfig.name, audio);
        resolve();
      };
      audio.onerror = () => reject(new Error(`Failed to load sound: ${soundConfig.path}`));
      audio.load();
    });
    soundPromises.push(promise);
  }
  await Promise.all([...imagePromises, ...soundPromises]);
}
function createEmptyBoard() {
  return Array(gameConfig.sudokuSettings.boardSize).fill(0).map(() => Array(gameConfig.sudokuSettings.boardSize).fill(0));
}
function isValid(board, row, col, num) {
  const N = gameConfig.sudokuSettings.boardSize;
  for (let x = 0; x < N; x++) {
    if (board[row][x] === num) return false;
  }
  for (let x = 0; x < N; x++) {
    if (board[x][col] === num) return false;
  }
  const blockSize = Math.sqrt(N);
  const startRow = row - row % blockSize;
  const startCol = col - col % blockSize;
  for (let i = 0; i < blockSize; i++) {
    for (let j = 0; j < blockSize; j++) {
      if (board[i + startRow][j + startCol] === num) return false;
    }
  }
  return true;
}
function fillBlock(board, row, col) {
  const N = gameConfig.sudokuSettings.boardSize;
  const blockSize = Math.sqrt(N);
  let numbers = Array.from({ length: N }, (_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  let numIdx = 0;
  for (let i = 0; i < blockSize; i++) {
    for (let j = 0; j < blockSize; j++) {
      board[row + i][col + j] = numbers[numIdx++];
    }
  }
}
function fillDiagonalBlocks(board) {
  const N = gameConfig.sudokuSettings.boardSize;
  const blockSize = Math.sqrt(N);
  for (let i = 0; i < N; i += blockSize) {
    fillBlock(board, i, i);
  }
}
function solveSudoku(board) {
  const N = gameConfig.sudokuSettings.boardSize;
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      if (board[row][col] === 0) {
        let numbersToTry = Array.from({ length: N }, (_, i) => i + 1);
        for (let i = numbersToTry.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [numbersToTry[i], numbersToTry[j]] = [numbersToTry[j], numbersToTry[i]];
        }
        for (const num of numbersToTry) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            if (solveSudoku(board)) {
              return true;
            } else {
              board[row][col] = 0;
            }
          }
        }
        return false;
      }
    }
  }
  return true;
}
function generateSudokuBoard() {
  const N = gameConfig.sudokuSettings.boardSize;
  const newBoard = createEmptyBoard();
  fillDiagonalBlocks(newBoard);
  solveSudoku(newBoard);
  const puzzleBoard = newBoard.map((row) => [...row]);
  const cellsToRemove = gameConfig.sudokuSettings.difficultyLevels[currentDifficulty] || 40;
  let count = cellsToRemove;
  let attempts = 0;
  while (count > 0 && attempts < N * N * 2) {
    let row = Math.floor(Math.random() * N);
    let col = Math.floor(Math.random() * N);
    if (puzzleBoard[row][col] !== 0) {
      puzzleBoard[row][col] = 0;
      count--;
    }
    attempts++;
  }
  return { initial: puzzleBoard, current: puzzleBoard.map((row) => [...row]) };
}
function isBoardComplete(board) {
  const N = gameConfig.sudokuSettings.boardSize;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r][c] === 0) {
        return false;
      }
    }
  }
  return true;
}
function checkWinCondition() {
  const N = gameConfig.sudokuSettings.boardSize;
  if (!isBoardComplete(sudokuBoard)) {
    return false;
  }
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const num = sudokuBoard[r][c];
      if (num === 0) return false;
      const originalValue = sudokuBoard[r][c];
      sudokuBoard[r][c] = 0;
      const valid = isValid(sudokuBoard, r, c, originalValue);
      sudokuBoard[r][c] = originalValue;
      if (!valid) return false;
    }
  }
  return true;
}
function resetGame() {
  const { initial, current } = generateSudokuBoard();
  initialBoard = initial;
  sudokuBoard = current;
  selectedRow = 0;
  selectedCol = 0;
}
function update(deltaTime) {
  switch (currentState) {
    case 0 /* TITLE */:
      if (inputState.has(" " /* SPACE */)) {
        currentState = 1 /* INSTRUCTIONS */;
        inputState.delete(" " /* SPACE */);
      }
      break;
    case 1 /* INSTRUCTIONS */:
      if (inputState.has("Enter" /* ENTER */)) {
        currentState = 2 /* PLAYING */;
        inputState.delete("Enter" /* ENTER */);
        resetGame();
        if (backgroundMusic) {
          backgroundMusic.loop = true;
          backgroundMusic.currentTime = 0;
          backgroundMusic.play().catch((e) => console.error("Background music playback failed:", e));
        }
        if (startSound) {
          startSound.currentTime = 0;
          startSound.play().catch((e) => console.error("Start sound playback failed:", e));
        }
      }
      break;
    case 2 /* PLAYING */:
      const N = gameConfig.sudokuSettings.boardSize;
      let movedSelection = false;
      if (inputState.has("ArrowLeft" /* ARROW_LEFT */)) {
        selectedCol = Math.max(0, selectedCol - 1);
        inputState.delete("ArrowLeft" /* ARROW_LEFT */);
        movedSelection = true;
      }
      if (inputState.has("ArrowRight" /* ARROW_RIGHT */)) {
        selectedCol = Math.min(N - 1, selectedCol + 1);
        inputState.delete("ArrowRight" /* ARROW_RIGHT */);
        movedSelection = true;
      }
      if (inputState.has("ArrowUp" /* ARROW_UP */)) {
        selectedRow = Math.max(0, selectedRow - 1);
        inputState.delete("ArrowUp" /* ARROW_UP */);
        movedSelection = true;
      }
      if (inputState.has("ArrowDown" /* ARROW_DOWN */)) {
        selectedRow = Math.min(N - 1, selectedRow + 1);
        inputState.delete("ArrowDown" /* ARROW_DOWN */);
        movedSelection = true;
      }
      if (movedSelection && cellSelectSound) {
        const clonedSound = cellSelectSound.cloneNode();
        clonedSound.volume = cellSelectSound.volume;
        clonedSound.currentTime = 0;
        clonedSound.play().catch((e) => console.error("Cell select sound playback failed:", e));
      }
      for (let i = 1; i <= 9; i++) {
        const key = i.toString();
        if (inputState.has(key)) {
          if (selectedRow !== -1 && selectedCol !== -1 && initialBoard[selectedRow][selectedCol] === 0) {
            sudokuBoard[selectedRow][selectedCol] = i;
            if (placeNumberSound) {
              const clonedSound = placeNumberSound.cloneNode();
              clonedSound.volume = placeNumberSound.volume;
              clonedSound.currentTime = 0;
              clonedSound.play().catch((e) => console.error("Place number sound playback failed:", e));
            }
            if (checkWinCondition()) {
              currentState = 3 /* SOLVED */;
              if (backgroundMusic) backgroundMusic.pause();
              if (winSound) {
                const clonedSound = winSound.cloneNode();
                clonedSound.volume = winSound.volume;
                clonedSound.currentTime = 0;
                clonedSound.play().catch((e) => console.error("Win sound playback failed:", e));
              }
            }
          }
          inputState.delete(key);
          break;
        }
      }
      if (inputState.has("Backspace" /* BACKSPACE */) || inputState.has("Delete" /* DELETE */)) {
        if (selectedRow !== -1 && selectedCol !== -1 && initialBoard[selectedRow][selectedCol] === 0) {
          sudokuBoard[selectedRow][selectedCol] = 0;
          if (clearNumberSound) {
            const clonedSound = clearNumberSound.cloneNode();
            clonedSound.volume = clearNumberSound.volume;
            clonedSound.currentTime = 0;
            clonedSound.play().catch((e) => console.error("Clear number sound playback failed:", e));
          }
        }
        inputState.delete("Backspace" /* BACKSPACE */);
        inputState.delete("Delete" /* DELETE */);
      }
      break;
    case 3 /* SOLVED */:
      if (inputState.has("Enter" /* ENTER */)) {
        currentState = 0 /* TITLE */;
        inputState.delete("Enter" /* ENTER */);
      }
      break;
  }
}
function draw() {
  ctx.fillStyle = gameConfig.gameSettings.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `48px ${gameConfig.gameSettings.fontFamily}`;
  ctx.fillStyle = gameConfig.gameSettings.titleTextColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  switch (currentState) {
    case 0 /* TITLE */:
      ctx.fillText(gameConfig.gameSettings.titleText, canvas.width / 2, canvas.height / 2 - 50);
      ctx.font = `24px ${gameConfig.gameSettings.fontFamily}`;
      ctx.fillText(gameConfig.gameSettings.startInstruction, canvas.width / 2, canvas.height / 2 + 20);
      break;
    case 1 /* INSTRUCTIONS */:
      ctx.fillText(gameConfig.gameSettings.instructionTitle, canvas.width / 2, canvas.height / 2 - 150);
      ctx.font = `20px ${gameConfig.gameSettings.fontFamily}`;
      gameConfig.gameSettings.instructionLines.forEach((line, index) => {
        ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 90 + index * 30);
      });
      ctx.font = `24px ${gameConfig.gameSettings.fontFamily}`;
      ctx.fillText(gameConfig.gameSettings.instructionStartGame, canvas.width / 2, canvas.height - 80);
      break;
    case 2 /* PLAYING */:
      drawSudokuBoard();
      break;
    case 3 /* SOLVED */:
      ctx.fillText(gameConfig.gameSettings.solvedText, canvas.width / 2, canvas.height / 2);
      ctx.font = `24px ${gameConfig.gameSettings.fontFamily}`;
      ctx.fillText(gameConfig.gameSettings.restartInstruction, canvas.width / 2, canvas.height / 2 + 50);
      break;
  }
}
function drawSudokuBoard() {
  const s = gameConfig.sudokuSettings;
  const N = s.boardSize;
  const cellSize = s.cellSize;
  const boardWidth = N * cellSize;
  const boardHeight = N * cellSize;
  const boardX = (canvas.width - boardWidth) / 2;
  const boardY = (canvas.height - boardHeight) / 2;
  if (selectedRow !== -1 && selectedCol !== -1) {
    ctx.fillStyle = s.highlightColor;
    ctx.fillRect(boardX, boardY + selectedRow * cellSize, boardWidth, cellSize);
    ctx.fillRect(boardX + selectedCol * cellSize, boardY, cellSize, boardHeight);
    const blockSize2 = Math.sqrt(N);
    const blockStartRow = Math.floor(selectedRow / blockSize2) * blockSize2;
    const blockStartCol = Math.floor(selectedCol / blockSize2) * blockSize2;
    ctx.fillRect(
      boardX + blockStartCol * cellSize,
      boardY + blockStartRow * cellSize,
      blockSize2 * cellSize,
      blockSize2 * cellSize
    );
  }
  if (selectedRow !== -1 && selectedCol !== -1) {
    ctx.fillStyle = s.selectedCellColor;
    ctx.fillRect(boardX + selectedCol * cellSize, boardY + selectedRow * cellSize, cellSize, cellSize);
  }
  ctx.font = `${s.numberFontSize}px ${s.numberFontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const num = sudokuBoard[r][c];
      if (num !== 0) {
        const x = boardX + c * cellSize + cellSize / 2;
        const y = boardY + r * cellSize + cellSize / 2;
        if (initialBoard[r][c] !== 0) {
          ctx.fillStyle = s.fixedNumberColor;
        } else {
          ctx.fillStyle = s.playerNumberColor;
        }
        ctx.fillText(num.toString(), x, y);
      }
    }
  }
  ctx.strokeStyle = s.gridLineColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= N; i++) {
    ctx.beginPath();
    ctx.moveTo(boardX, boardY + i * cellSize);
    ctx.lineTo(boardX + boardWidth, boardY + i * cellSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(boardX + i * cellSize, boardY);
    ctx.lineTo(boardX + i * cellSize, boardY + boardHeight);
    ctx.stroke();
  }
  ctx.strokeStyle = s.majorGridLineColor;
  ctx.lineWidth = 3;
  const blockSize = Math.sqrt(N);
  for (let i = 0; i <= N; i += blockSize) {
    ctx.beginPath();
    ctx.moveTo(boardX, boardY + i * cellSize);
    ctx.lineTo(boardX + boardWidth, boardY + i * cellSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(boardX + i * cellSize, boardY);
    ctx.lineTo(boardX + i * cellSize, boardY + boardHeight);
    ctx.stroke();
  }
}
function gameLoop(currentTime) {
  const deltaTime = (currentTime - lastFrameTime) / 1e3;
  lastFrameTime = currentTime;
  update(deltaTime);
  draw();
  requestAnimationFrame(gameLoop);
}
async function init() {
  canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error('Canvas element with ID "gameCanvas" not found.');
    return;
  }
  ctx = canvas.getContext("2d");
  try {
    gameConfig = await loadGameData();
    console.log("Game data loaded:", gameConfig);
    canvas.width = gameConfig.gameSettings.canvasWidth;
    canvas.height = gameConfig.gameSettings.canvasHeight;
    await loadAssets(gameConfig.assets);
    console.log("Assets loaded:", loadedImages.size, "images,", loadedSounds.size, "sounds");
    backgroundMusic = loadedSounds.get("bgm");
    startSound = loadedSounds.get("start_sound");
    cellSelectSound = loadedSounds.get("cell_select_sound");
    placeNumberSound = loadedSounds.get("place_number_sound");
    clearNumberSound = loadedSounds.get("clear_number_sound");
    winSound = loadedSounds.get("win_sound");
    selectedRow = 0;
    selectedCol = 0;
    window.addEventListener("keydown", (e) => {
      const key = e.key;
      if (key >= "1" && key <= "9") {
        inputState.add(key);
      } else if (key === "Backspace") {
        inputState.add("Backspace" /* BACKSPACE */);
      } else if (key === "Delete") {
        inputState.add("Delete" /* DELETE */);
      } else {
        const inputKey = key;
        if (Object.values(InputKey).includes(inputKey)) {
          inputState.add(inputKey);
        }
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Enter", "Backspace", "Delete"].includes(key)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      const key = e.key;
      if (key >= "1" && key <= "9") {
        inputState.delete(key);
      } else if (key === "Backspace") {
        inputState.delete("Backspace" /* BACKSPACE */);
      } else if (key === "Delete") {
        inputState.delete("Delete" /* DELETE */);
      } else {
        const inputKey = key;
        if (Object.values(InputKey).includes(inputKey)) {
          inputState.delete(inputKey);
        }
      }
    });
    lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
  } catch (error) {
    console.error("Failed to initialize game:", error);
  }
}
window.onload = init;
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gRW51bXMgZm9yIGdhbWUgc3RhdGVzIGFuZCBpbnB1dCBrZXlzXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLFxyXG4gICAgSU5TVFJVQ1RJT05TLFxyXG4gICAgUExBWUlORyxcclxuICAgIFNPTFZFRFxyXG59XHJcblxyXG5lbnVtIElucHV0S2V5IHtcclxuICAgIEFSUk9XX0xFRlQgPSBcIkFycm93TGVmdFwiLFxyXG4gICAgQVJST1dfUklHSFQgPSBcIkFycm93UmlnaHRcIixcclxuICAgIEFSUk9XX1VQID0gXCJBcnJvd1VwXCIsXHJcbiAgICBBUlJPV19ET1dOID0gXCJBcnJvd0Rvd25cIixcclxuICAgIFNQQUNFID0gXCIgXCIsXHJcbiAgICBFTlRFUiA9IFwiRW50ZXJcIixcclxuICAgIEtFWV8xID0gXCIxXCIsIEtFWV8yID0gXCIyXCIsIEtFWV8zID0gXCIzXCIsIEtFWV80ID0gXCI0XCIsIEtFWV81ID0gXCI1XCIsXHJcbiAgICBLRVlfNiA9IFwiNlwiLCBLRVlfNyA9IFwiN1wiLCBLRVlfOCA9IFwiOFwiLCBLRVlfOSA9IFwiOVwiLFxyXG4gICAgQkFDS1NQQUNFID0gXCJCYWNrc3BhY2VcIixcclxuICAgIERFTEVURSA9IFwiRGVsZXRlXCIgLy8gRm9yIGNsZWFyaW5nIGEgY2VsbFxyXG59XHJcblxyXG4vLyBJbnRlcmZhY2VzIGZvciBkYXRhLmpzb24gc3RydWN0dXJlXHJcbmludGVyZmFjZSBJbWFnZUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7XHJcbiAgICB2b2x1bWU6IG51bWJlcjtcclxufVxyXG5cclxuaW50ZXJmYWNlIEFzc2V0c0NvbmZpZyB7XHJcbiAgICBpbWFnZXM6IEltYWdlQ29uZmlnW107XHJcbiAgICBzb3VuZHM6IFNvdW5kQ29uZmlnW107XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lU2V0dGluZ3Mge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgdGl0bGVUZXh0OiBzdHJpbmc7XHJcbiAgICBzdGFydEluc3RydWN0aW9uOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvblRpdGxlOiBzdHJpbmc7XHJcbiAgICBpbnN0cnVjdGlvbkxpbmVzOiBzdHJpbmdbXTsgLy8gQWRkZWQgZm9yIGluc3RydWN0aW9ucyBzY3JlZW5cclxuICAgIGluc3RydWN0aW9uU3RhcnRHYW1lOiBzdHJpbmc7IC8vIEFkZGVkIGZvciBpbnN0cnVjdGlvbnMgc2NyZWVuXHJcbiAgICBzb2x2ZWRUZXh0OiBzdHJpbmc7IC8vIFJlbmFtZWQgZnJvbSBnYW1lT3ZlclRleHQgdG8gc29sdmVkVGV4dFxyXG4gICAgcmVzdGFydEluc3RydWN0aW9uOiBzdHJpbmc7XHJcbiAgICB0aXRsZVRleHRDb2xvcjogc3RyaW5nO1xyXG4gICAgYmFja2dyb3VuZENvbG9yOiBzdHJpbmc7XHJcbiAgICBmb250RmFtaWx5OiBzdHJpbmc7IC8vIEZvciBnZW5lcmFsIFVJIHRleHRcclxufVxyXG5cclxuaW50ZXJmYWNlIFN1ZG9rdVNldHRpbmdzIHtcclxuICAgIGJvYXJkU2l6ZTogbnVtYmVyOyAvLyBlLmcuLCA5IGZvciA5eDkgU3Vkb2t1XHJcbiAgICBjZWxsU2l6ZTogbnVtYmVyO1xyXG4gICAgYm9hcmRQYWRkaW5nOiBudW1iZXI7IC8vIE5vdCBjdXJyZW50bHkgdXNlZCBpbiBkcmF3aW5nLCBidXQga2VwdCBmb3IgZnV0dXJlIGV4cGFuc2lvblxyXG4gICAgZ3JpZExpbmVDb2xvcjogc3RyaW5nO1xyXG4gICAgbWFqb3JHcmlkTGluZUNvbG9yOiBzdHJpbmc7XHJcbiAgICBzZWxlY3RlZENlbGxDb2xvcjogc3RyaW5nO1xyXG4gICAgaGlnaGxpZ2h0Q29sb3I6IHN0cmluZzsgLy8gRm9yIHNlbGVjdGVkIHJvdy9jb2wvYmxvY2tcclxuICAgIGZpeGVkTnVtYmVyQ29sb3I6IHN0cmluZztcclxuICAgIHBsYXllck51bWJlckNvbG9yOiBzdHJpbmc7XHJcbiAgICBlcnJvck51bWJlckNvbG9yOiBzdHJpbmc7IC8vIE9wdGlvbmFsOiBmb3IgaW5jb3JyZWN0IG51bWJlcnMsIG5vdCBjdXJyZW50bHkgaW1wbGVtZW50ZWQgZm9yIHJlYWwtdGltZSB2YWxpZGF0aW9uXHJcbiAgICBudW1iZXJGb250RmFtaWx5OiBzdHJpbmc7XHJcbiAgICBudW1iZXJGb250U2l6ZTogbnVtYmVyO1xyXG4gICAgZGlmZmljdWx0eUxldmVsczogeyBba2V5OiBzdHJpbmddOiBudW1iZXIgfTsgLy8gZS5nLiwgeyBcImVhc3lcIjogNDAsIFwibWVkaXVtXCI6IDUwLCBcImhhcmRcIjogNjAgfSAoY2VsbHMgdG8gcmVtb3ZlKVxyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBnYW1lU2V0dGluZ3M6IEdhbWVTZXR0aW5ncztcclxuICAgIHN1ZG9rdVNldHRpbmdzOiBTdWRva3VTZXR0aW5ncztcclxuICAgIGFzc2V0czogQXNzZXRzQ29uZmlnO1xyXG59XHJcblxyXG4vLyBHbG9iYWwgZ2FtZSB2YXJpYWJsZXNcclxubGV0IGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbmxldCBjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxubGV0IGdhbWVDb25maWc6IEdhbWVDb25maWc7XHJcbmxldCBsb2FkZWRJbWFnZXM6IE1hcDxzdHJpbmcsIEhUTUxJbWFnZUVsZW1lbnQ+ID0gbmV3IE1hcCgpOyAvLyBJbWFnZXMgYXJlIG5vdCB1c2VkIGluIFN1ZG9rdSBidXQgZnJhbWV3b3JrIGlzIGtlcHRcclxubGV0IGxvYWRlZFNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbmxldCBpbnB1dFN0YXRlOiBTZXQ8SW5wdXRLZXk+ID0gbmV3IFNldCgpO1xyXG5sZXQgY3VycmVudFN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbmxldCBsYXN0RnJhbWVUaW1lOiBudW1iZXIgPSAwO1xyXG5cclxubGV0IHN1ZG9rdUJvYXJkOiBudW1iZXJbXVtdID0gW107IC8vIEN1cnJlbnQgc3RhdGUgb2YgdGhlIGJvYXJkXHJcbmxldCBpbml0aWFsQm9hcmQ6IG51bWJlcltdW10gPSBbXTsgLy8gRml4ZWQgbnVtYmVycyBmcm9tIHRoZSBwdXp6bGVcclxubGV0IHNlbGVjdGVkUm93OiBudW1iZXIgPSAtMTtcclxubGV0IHNlbGVjdGVkQ29sOiBudW1iZXIgPSAtMTtcclxubGV0IGN1cnJlbnREaWZmaWN1bHR5OiBzdHJpbmcgPSBcImVhc3lcIjsgLy8gRGVmYXVsdCBkaWZmaWN1bHR5LCBjYW4gYmUgbWFkZSBzZWxlY3RhYmxlIGxhdGVyXHJcblxyXG5sZXQgYmFja2dyb3VuZE11c2ljOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkO1xyXG5sZXQgc3RhcnRTb3VuZDogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZDtcclxubGV0IGNlbGxTZWxlY3RTb3VuZDogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZDtcclxubGV0IHBsYWNlTnVtYmVyU291bmQ6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XHJcbmxldCBjbGVhck51bWJlclNvdW5kOiBIVE1MQXVkaW9FbGVtZW50IHwgdW5kZWZpbmVkO1xyXG5sZXQgd2luU291bmQ6IEhUTUxBdWRpb0VsZW1lbnQgfCB1bmRlZmluZWQ7XHJcblxyXG4vLyBGZXRjaGVzIGdhbWUgY29uZmlndXJhdGlvbiBmcm9tIGRhdGEuanNvblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTxHYW1lQ29uZmlnPiB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGRhdGEuanNvbjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxufVxyXG5cclxuLy8gTG9hZHMgYWxsIGltYWdlIGFuZCBzb3VuZCBhc3NldHNcclxuYXN5bmMgZnVuY3Rpb24gbG9hZEFzc2V0cyhjb25maWc6IEFzc2V0c0NvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgaW1hZ2VQcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XHJcbiAgICBjb25zdCBzb3VuZFByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcclxuXHJcbiAgICAvLyBMb2FkIGltYWdlcyAobm9uZSBjdXJyZW50bHkgdXNlZCBmb3IgU3Vkb2t1IGJvYXJkLCBidXQgZnJhbWV3b3JrIGV4aXN0cylcclxuICAgIGZvciAoY29uc3QgaW1nQ29uZmlnIG9mIGNvbmZpZy5pbWFnZXMpIHtcclxuICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICBpbWcuc3JjID0gaW1nQ29uZmlnLnBhdGg7XHJcbiAgICAgICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIGxvYWRlZEltYWdlcy5zZXQoaW1nQ29uZmlnLm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGltZy5vbmVycm9yID0gKCkgPT4gcmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7aW1nQ29uZmlnLnBhdGh9YCkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGltYWdlUHJvbWlzZXMucHVzaChwcm9taXNlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBMb2FkIHNvdW5kc1xyXG4gICAgZm9yIChjb25zdCBzb3VuZENvbmZpZyBvZiBjb25maWcuc291bmRzKSB7XHJcbiAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmRDb25maWcucGF0aCk7XHJcbiAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmRDb25maWcudm9sdW1lO1xyXG4gICAgICAgIGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBsb2FkZWRTb3VuZHMuc2V0KHNvdW5kQ29uZmlnLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHJlamVjdChuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kQ29uZmlnLnBhdGh9YCkpO1xyXG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgc291bmRQcm9taXNlcy5wdXNoKHByb21pc2UpO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbn1cclxuXHJcbi8vIC0tLSBTdWRva3UgTG9naWMgLS0tXHJcbmZ1bmN0aW9uIGNyZWF0ZUVtcHR5Qm9hcmQoKTogbnVtYmVyW11bXSB7XHJcbiAgICByZXR1cm4gQXJyYXkoZ2FtZUNvbmZpZy5zdWRva3VTZXR0aW5ncy5ib2FyZFNpemUpLmZpbGwoMCkubWFwKCgpID0+IEFycmF5KGdhbWVDb25maWcuc3Vkb2t1U2V0dGluZ3MuYm9hcmRTaXplKS5maWxsKDApKTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNWYWxpZChib2FyZDogbnVtYmVyW11bXSwgcm93OiBudW1iZXIsIGNvbDogbnVtYmVyLCBudW06IG51bWJlcik6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgTiA9IGdhbWVDb25maWcuc3Vkb2t1U2V0dGluZ3MuYm9hcmRTaXplO1xyXG5cclxuICAgIC8vIENoZWNrIHJvd1xyXG4gICAgZm9yIChsZXQgeCA9IDA7IHggPCBOOyB4KyspIHtcclxuICAgICAgICBpZiAoYm9hcmRbcm93XVt4XSA9PT0gbnVtKSByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgY29sdW1uXHJcbiAgICBmb3IgKGxldCB4ID0gMDsgeCA8IE47IHgrKykge1xyXG4gICAgICAgIGlmIChib2FyZFt4XVtjb2xdID09PSBudW0pIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayAzeDMgYm94XHJcbiAgICBjb25zdCBibG9ja1NpemUgPSBNYXRoLnNxcnQoTik7XHJcbiAgICBjb25zdCBzdGFydFJvdyA9IHJvdyAtIChyb3cgJSBibG9ja1NpemUpO1xyXG4gICAgY29uc3Qgc3RhcnRDb2wgPSBjb2wgLSAoY29sICUgYmxvY2tTaXplKTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYmxvY2tTaXplOyBpKyspIHtcclxuICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGJsb2NrU2l6ZTsgaisrKSB7XHJcbiAgICAgICAgICAgIGlmIChib2FyZFtpICsgc3RhcnRSb3ddW2ogKyBzdGFydENvbF0gPT09IG51bSkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxufVxyXG5cclxuLy8gRmlsbHMgYSAzeDMgYmxvY2sgd2l0aCByYW5kb20gdmFsaWQgbnVtYmVyc1xyXG5mdW5jdGlvbiBmaWxsQmxvY2soYm9hcmQ6IG51bWJlcltdW10sIHJvdzogbnVtYmVyLCBjb2w6IG51bWJlcik6IHZvaWQge1xyXG4gICAgY29uc3QgTiA9IGdhbWVDb25maWcuc3Vkb2t1U2V0dGluZ3MuYm9hcmRTaXplO1xyXG4gICAgY29uc3QgYmxvY2tTaXplID0gTWF0aC5zcXJ0KE4pO1xyXG4gICAgbGV0IG51bWJlcnMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBOIH0sIChfLCBpKSA9PiBpICsgMSk7IC8vIFsxLCAyLCAuLi4sIE5dXHJcbiAgICBcclxuICAgIC8vIFNpbXBsZSBzaHVmZmxlIChGaXNoZXItWWF0ZXMpXHJcbiAgICBmb3IgKGxldCBpID0gbnVtYmVycy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XHJcbiAgICAgICAgY29uc3QgaiA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChpICsgMSkpO1xyXG4gICAgICAgIFtudW1iZXJzW2ldLCBudW1iZXJzW2pdXSA9IFtudW1iZXJzW2pdLCBudW1iZXJzW2ldXTtcclxuICAgIH1cclxuXHJcbiAgICBsZXQgbnVtSWR4ID0gMDtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYmxvY2tTaXplOyBpKyspIHtcclxuICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGJsb2NrU2l6ZTsgaisrKSB7XHJcbiAgICAgICAgICAgIGJvYXJkW3JvdyArIGldW2NvbCArIGpdID0gbnVtYmVyc1tudW1JZHgrK107XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBGaWxscyB0aGUgZGlhZ29uYWwgM3gzIGJsb2NrcyB0byBzaW1wbGlmeSB0aGUgYmFja3RyYWNraW5nXHJcbmZ1bmN0aW9uIGZpbGxEaWFnb25hbEJsb2Nrcyhib2FyZDogbnVtYmVyW11bXSk6IHZvaWQge1xyXG4gICAgY29uc3QgTiA9IGdhbWVDb25maWcuc3Vkb2t1U2V0dGluZ3MuYm9hcmRTaXplO1xyXG4gICAgY29uc3QgYmxvY2tTaXplID0gTWF0aC5zcXJ0KE4pOyAvLyBTaG91bGQgYmUgMyBmb3IgOXg5XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE47IGkgKz0gYmxvY2tTaXplKSB7XHJcbiAgICAgICAgZmlsbEJsb2NrKGJvYXJkLCBpLCBpKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHNvbHZlU3Vkb2t1KGJvYXJkOiBudW1iZXJbXVtdKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBOID0gZ2FtZUNvbmZpZy5zdWRva3VTZXR0aW5ncy5ib2FyZFNpemU7XHJcbiAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCBOOyByb3crKykge1xyXG4gICAgICAgIGZvciAobGV0IGNvbCA9IDA7IGNvbCA8IE47IGNvbCsrKSB7XHJcbiAgICAgICAgICAgIGlmIChib2FyZFtyb3ddW2NvbF0gPT09IDApIHtcclxuICAgICAgICAgICAgICAgIC8vIFRvIHJhbmRvbWl6ZSBwdXp6bGUgZ2VuZXJhdGlvbiwgc2h1ZmZsZSBudW1iZXJzIDEtTlxyXG4gICAgICAgICAgICAgICAgbGV0IG51bWJlcnNUb1RyeSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IE4gfSwgKF8sIGkpID0+IGkgKyAxKTtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBudW1iZXJzVG9UcnkubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGogPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAoaSArIDEpKTtcclxuICAgICAgICAgICAgICAgICAgICBbbnVtYmVyc1RvVHJ5W2ldLCBudW1iZXJzVG9Ucnlbal1dID0gW251bWJlcnNUb1RyeVtqXSwgbnVtYmVyc1RvVHJ5W2ldXTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IG51bSBvZiBudW1iZXJzVG9UcnkpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNWYWxpZChib2FyZCwgcm93LCBjb2wsIG51bSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYm9hcmRbcm93XVtjb2xdID0gbnVtO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc29sdmVTdWRva3UoYm9hcmQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJvYXJkW3Jvd11bY29sXSA9IDA7IC8vIEJhY2t0cmFja1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyAvLyBObyBudW1iZXIgZml0c1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRydWU7IC8vIEJvYXJkIGlzIHNvbHZlZFxyXG59XHJcblxyXG5mdW5jdGlvbiBnZW5lcmF0ZVN1ZG9rdUJvYXJkKCk6IHsgaW5pdGlhbDogbnVtYmVyW11bXSwgY3VycmVudDogbnVtYmVyW11bXSB9IHtcclxuICAgIGNvbnN0IE4gPSBnYW1lQ29uZmlnLnN1ZG9rdVNldHRpbmdzLmJvYXJkU2l6ZTtcclxuICAgIGNvbnN0IG5ld0JvYXJkOiBudW1iZXJbXVtdID0gY3JlYXRlRW1wdHlCb2FyZCgpO1xyXG5cclxuICAgIC8vIFN0ZXAgMTogRmlsbCBkaWFnb25hbCAzeDMgYmxvY2tzXHJcbiAgICBmaWxsRGlhZ29uYWxCbG9ja3MobmV3Qm9hcmQpO1xyXG5cclxuICAgIC8vIFN0ZXAgMjogU29sdmUgdGhlIHJlc3Qgb2YgdGhlIGJvYXJkIHVzaW5nIGJhY2t0cmFja2luZ1xyXG4gICAgc29sdmVTdWRva3UobmV3Qm9hcmQpO1xyXG5cclxuICAgIGNvbnN0IHB1enpsZUJvYXJkOiBudW1iZXJbXVtdID0gbmV3Qm9hcmQubWFwKHJvdyA9PiBbLi4ucm93XSk7IC8vIFRoaXMgd2lsbCBiZSB0aGUgaW5pdGlhbCBwdXp6bGVcclxuXHJcbiAgICAvLyBTdGVwIDM6IFJlbW92ZSBudW1iZXJzIHRvIGNyZWF0ZSB0aGUgcHV6emxlXHJcbiAgICBjb25zdCBjZWxsc1RvUmVtb3ZlID0gZ2FtZUNvbmZpZy5zdWRva3VTZXR0aW5ncy5kaWZmaWN1bHR5TGV2ZWxzW2N1cnJlbnREaWZmaWN1bHR5XSB8fCA0MDsgLy8gRGVmYXVsdCB0byA0MCBpZiBub3QgZm91bmRcclxuICAgIGxldCBjb3VudCA9IGNlbGxzVG9SZW1vdmU7XHJcbiAgICBsZXQgYXR0ZW1wdHMgPSAwOyAvLyBQcmV2ZW50IGluZmluaXRlIGxvb3BzIGluIGNhc2UgcmVtb3ZpbmcgJ2NvdW50JyBjZWxscyBpcyBoYXJkXHJcblxyXG4gICAgd2hpbGUgKGNvdW50ID4gMCAmJiBhdHRlbXB0cyA8IE4gKiBOICogMikgeyAvLyBBZGQgYXR0ZW1wdHMgbGltaXRcclxuICAgICAgICBsZXQgcm93ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogTik7XHJcbiAgICAgICAgbGV0IGNvbCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIE4pO1xyXG5cclxuICAgICAgICBpZiAocHV6emxlQm9hcmRbcm93XVtjb2xdICE9PSAwKSB7XHJcbiAgICAgICAgICAgIC8vIEZvciBzaW1wbGljaXR5LCB3ZSBqdXN0IHJlbW92ZSB0aGUgbnVtYmVyLiBBIG1vcmUgcm9idXN0IGdlbmVyYXRvclxyXG4gICAgICAgICAgICAvLyB3b3VsZCBjaGVjayBmb3IgdW5pcXVlIHNvbHZhYmlsaXR5IGFmdGVyIGVhY2ggcmVtb3ZhbC5cclxuICAgICAgICAgICAgcHV6emxlQm9hcmRbcm93XVtjb2xdID0gMDsgXHJcbiAgICAgICAgICAgIGNvdW50LS07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF0dGVtcHRzKys7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHsgaW5pdGlhbDogcHV6emxlQm9hcmQsIGN1cnJlbnQ6IHB1enpsZUJvYXJkLm1hcChyb3cgPT4gWy4uLnJvd10pIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzQm9hcmRDb21wbGV0ZShib2FyZDogbnVtYmVyW11bXSk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgTiA9IGdhbWVDb25maWcuc3Vkb2t1U2V0dGluZ3MuYm9hcmRTaXplO1xyXG4gICAgZm9yIChsZXQgciA9IDA7IHIgPCBOOyByKyspIHtcclxuICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IE47IGMrKykge1xyXG4gICAgICAgICAgICBpZiAoYm9hcmRbcl1bY10gPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiB0cnVlO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjaGVja1dpbkNvbmRpdGlvbigpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IE4gPSBnYW1lQ29uZmlnLnN1ZG9rdVNldHRpbmdzLmJvYXJkU2l6ZTtcclxuICAgIGlmICghaXNCb2FyZENvbXBsZXRlKHN1ZG9rdUJvYXJkKSkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDaGVjayBhbGwgY2VsbHMgZm9yIHZhbGlkaXR5XHJcbiAgICBmb3IgKGxldCByID0gMDsgciA8IE47IHIrKykge1xyXG4gICAgICAgIGZvciAobGV0IGMgPSAwOyBjIDwgTjsgYysrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG51bSA9IHN1ZG9rdUJvYXJkW3JdW2NdO1xyXG4gICAgICAgICAgICBpZiAobnVtID09PSAwKSByZXR1cm4gZmFsc2U7IC8vIFNob3VsZCBub3QgaGFwcGVuIGlmIGlzQm9hcmRDb21wbGV0ZSBpcyB0cnVlXHJcblxyXG4gICAgICAgICAgICAvLyBUZW1wb3JhcmlseSByZW1vdmUgbnVtYmVyIHRvIGNoZWNrIGl0cyB2YWxpZGl0eSBhZ2FpbnN0IG90aGVyc1xyXG4gICAgICAgICAgICBjb25zdCBvcmlnaW5hbFZhbHVlID0gc3Vkb2t1Qm9hcmRbcl1bY107XHJcbiAgICAgICAgICAgIHN1ZG9rdUJvYXJkW3JdW2NdID0gMDtcclxuICAgICAgICAgICAgY29uc3QgdmFsaWQgPSBpc1ZhbGlkKHN1ZG9rdUJvYXJkLCByLCBjLCBvcmlnaW5hbFZhbHVlKTtcclxuICAgICAgICAgICAgc3Vkb2t1Qm9hcmRbcl1bY10gPSBvcmlnaW5hbFZhbHVlOyAvLyBQdXQgaXQgYmFja1xyXG5cclxuICAgICAgICAgICAgaWYgKCF2YWxpZCkgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdHJ1ZTsgLy8gQWxsIGNoZWNrcyBwYXNzZWRcclxufVxyXG5cclxuXHJcbi8vIFJlc2V0cyBnYW1lIGVsZW1lbnRzIHRvIHRoZWlyIGluaXRpYWwgc3RhdGUgZm9yIGEgbmV3IGdhbWVcclxuZnVuY3Rpb24gcmVzZXRHYW1lKCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBpbml0aWFsLCBjdXJyZW50IH0gPSBnZW5lcmF0ZVN1ZG9rdUJvYXJkKCk7XHJcbiAgICBpbml0aWFsQm9hcmQgPSBpbml0aWFsO1xyXG4gICAgc3Vkb2t1Qm9hcmQgPSBjdXJyZW50O1xyXG4gICAgc2VsZWN0ZWRSb3cgPSAwO1xyXG4gICAgc2VsZWN0ZWRDb2wgPSAwO1xyXG59XHJcblxyXG4vLyBHYW1lIGxvb3AgZnVuY3Rpb25zXHJcbmZ1bmN0aW9uIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgc3dpdGNoIChjdXJyZW50U3RhdGUpIHtcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgaWYgKGlucHV0U3RhdGUuaGFzKElucHV0S2V5LlNQQUNFKSkge1xyXG4gICAgICAgICAgICAgICAgY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLklOU1RSVUNUSU9OUztcclxuICAgICAgICAgICAgICAgIGlucHV0U3RhdGUuZGVsZXRlKElucHV0S2V5LlNQQUNFKTsgLy8gQ29uc3VtZSB0aGUgaW5wdXRcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM6XHJcbiAgICAgICAgICAgIGlmIChpbnB1dFN0YXRlLmhhcyhJbnB1dEtleS5FTlRFUikpIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgICAgICAgICAgaW5wdXRTdGF0ZS5kZWxldGUoSW5wdXRLZXkuRU5URVIpOyAvLyBDb25zdW1lIHRoZSBpbnB1dFxyXG5cclxuICAgICAgICAgICAgICAgIHJlc2V0R2FtZSgpOyAvLyBSZXNldCBnYW1lIHN0YXRlIGZvciBhIGZyZXNoIHN0YXJ0XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUGxheSBCR00gd2hlbiBnYW1lIHN0YXJ0c1xyXG4gICAgICAgICAgICAgICAgaWYgKGJhY2tncm91bmRNdXNpYykge1xyXG4gICAgICAgICAgICAgICAgICAgIGJhY2tncm91bmRNdXNpYy5sb29wID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICBiYWNrZ3JvdW5kTXVzaWMuY3VycmVudFRpbWUgPSAwOyAvLyBSZXdpbmQgQkdNXHJcbiAgICAgICAgICAgICAgICAgICAgYmFja2dyb3VuZE11c2ljLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoXCJCYWNrZ3JvdW5kIG11c2ljIHBsYXliYWNrIGZhaWxlZDpcIiwgZSkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0U291bmQpIHtcclxuICAgICAgICAgICAgICAgICAgICBzdGFydFNvdW5kLmN1cnJlbnRUaW1lID0gMDsgLy8gUmV3aW5kIHRvIHN0YXJ0XHJcbiAgICAgICAgICAgICAgICAgICAgc3RhcnRTb3VuZC5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiU3RhcnQgc291bmQgcGxheWJhY2sgZmFpbGVkOlwiLCBlKSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgY29uc3QgTiA9IGdhbWVDb25maWcuc3Vkb2t1U2V0dGluZ3MuYm9hcmRTaXplO1xyXG4gICAgICAgICAgICBsZXQgbW92ZWRTZWxlY3Rpb24gPSBmYWxzZTtcclxuICAgICAgICAgICAgaWYgKGlucHV0U3RhdGUuaGFzKElucHV0S2V5LkFSUk9XX0xFRlQpKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxlY3RlZENvbCA9IE1hdGgubWF4KDAsIHNlbGVjdGVkQ29sIC0gMSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dFN0YXRlLmRlbGV0ZShJbnB1dEtleS5BUlJPV19MRUZUKTtcclxuICAgICAgICAgICAgICAgIG1vdmVkU2VsZWN0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaW5wdXRTdGF0ZS5oYXMoSW5wdXRLZXkuQVJST1dfUklHSFQpKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxlY3RlZENvbCA9IE1hdGgubWluKE4gLSAxLCBzZWxlY3RlZENvbCArIDEpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXRTdGF0ZS5kZWxldGUoSW5wdXRLZXkuQVJST1dfUklHSFQpO1xyXG4gICAgICAgICAgICAgICAgbW92ZWRTZWxlY3Rpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChpbnB1dFN0YXRlLmhhcyhJbnB1dEtleS5BUlJPV19VUCkpIHtcclxuICAgICAgICAgICAgICAgIHNlbGVjdGVkUm93ID0gTWF0aC5tYXgoMCwgc2VsZWN0ZWRSb3cgLSAxKTtcclxuICAgICAgICAgICAgICAgIGlucHV0U3RhdGUuZGVsZXRlKElucHV0S2V5LkFSUk9XX1VQKTtcclxuICAgICAgICAgICAgICAgIG1vdmVkU2VsZWN0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoaW5wdXRTdGF0ZS5oYXMoSW5wdXRLZXkuQVJST1dfRE9XTikpIHtcclxuICAgICAgICAgICAgICAgIHNlbGVjdGVkUm93ID0gTWF0aC5taW4oTiAtIDEsIHNlbGVjdGVkUm93ICsgMSk7XHJcbiAgICAgICAgICAgICAgICBpbnB1dFN0YXRlLmRlbGV0ZShJbnB1dEtleS5BUlJPV19ET1dOKTtcclxuICAgICAgICAgICAgICAgIG1vdmVkU2VsZWN0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKG1vdmVkU2VsZWN0aW9uICYmIGNlbGxTZWxlY3RTb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY2xvbmVkU291bmQgPSBjZWxsU2VsZWN0U291bmQuY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgICAgIGNsb25lZFNvdW5kLnZvbHVtZSA9IGNlbGxTZWxlY3RTb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBjbG9uZWRTb3VuZC5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgICAgICAgICBjbG9uZWRTb3VuZC5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKFwiQ2VsbCBzZWxlY3Qgc291bmQgcGxheWJhY2sgZmFpbGVkOlwiLCBlKSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIE51bWJlciBpbnB1dCAoMS05KVxyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8PSA5OyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGtleSA9IGkudG9TdHJpbmcoKSBhcyBJbnB1dEtleTtcclxuICAgICAgICAgICAgICAgIGlmIChpbnB1dFN0YXRlLmhhcyhrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHNlbGVjdGVkUm93ICE9PSAtMSAmJiBzZWxlY3RlZENvbCAhPT0gLTEgJiYgaW5pdGlhbEJvYXJkW3NlbGVjdGVkUm93XVtzZWxlY3RlZENvbF0gPT09IDApIHsgLy8gT25seSBpZiBub3QgYSBmaXhlZCBudW1iZXJcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3Vkb2t1Qm9hcmRbc2VsZWN0ZWRSb3ddW3NlbGVjdGVkQ29sXSA9IGk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwbGFjZU51bWJlclNvdW5kKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbG9uZWRTb3VuZCA9IHBsYWNlTnVtYmVyU291bmQuY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsb25lZFNvdW5kLnZvbHVtZSA9IHBsYWNlTnVtYmVyU291bmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmVkU291bmQuY3VycmVudFRpbWUgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmVkU291bmQucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIlBsYWNlIG51bWJlciBzb3VuZCBwbGF5YmFjayBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2hlY2tXaW5Db25kaXRpb24oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VycmVudFN0YXRlID0gR2FtZVN0YXRlLlNPTFZFRDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiYWNrZ3JvdW5kTXVzaWMpIGJhY2tncm91bmRNdXNpYy5wYXVzZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHdpblNvdW5kKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xvbmVkU291bmQgPSB3aW5Tb3VuZC5jbG9uZU5vZGUoKSBhcyBIVE1MQXVkaW9FbGVtZW50O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsb25lZFNvdW5kLnZvbHVtZSA9IHdpblNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbG9uZWRTb3VuZC5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmVkU291bmQucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIldpbiBzb3VuZCBwbGF5YmFjayBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBpbnB1dFN0YXRlLmRlbGV0ZShrZXkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrOyAvLyBPbmx5IHByb2Nlc3Mgb25lIG51bWJlciBhdCBhIHRpbWVcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ2xlYXIgaW5wdXRcclxuICAgICAgICAgICAgaWYgKGlucHV0U3RhdGUuaGFzKElucHV0S2V5LkJBQ0tTUEFDRSkgfHwgaW5wdXRTdGF0ZS5oYXMoSW5wdXRLZXkuREVMRVRFKSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHNlbGVjdGVkUm93ICE9PSAtMSAmJiBzZWxlY3RlZENvbCAhPT0gLTEgJiYgaW5pdGlhbEJvYXJkW3NlbGVjdGVkUm93XVtzZWxlY3RlZENvbF0gPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBzdWRva3VCb2FyZFtzZWxlY3RlZFJvd11bc2VsZWN0ZWRDb2xdID0gMDtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY2xlYXJOdW1iZXJTb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbG9uZWRTb3VuZCA9IGNsZWFyTnVtYmVyU291bmQuY2xvbmVOb2RlKCkgYXMgSFRNTEF1ZGlvRWxlbWVudDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmVkU291bmQudm9sdW1lID0gY2xlYXJOdW1iZXJTb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsb25lZFNvdW5kLmN1cnJlbnRUaW1lID0gMDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2xvbmVkU291bmQucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihcIkNsZWFyIG51bWJlciBzb3VuZCBwbGF5YmFjayBmYWlsZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpbnB1dFN0YXRlLmRlbGV0ZShJbnB1dEtleS5CQUNLU1BBQ0UpO1xyXG4gICAgICAgICAgICAgICAgaW5wdXRTdGF0ZS5kZWxldGUoSW5wdXRLZXkuREVMRVRFKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5TT0xWRUQ6XHJcbiAgICAgICAgICAgIGlmIChpbnB1dFN0YXRlLmhhcyhJbnB1dEtleS5FTlRFUikpIHtcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTsgLy8gVHJhbnNpdGlvbiBiYWNrIHRvIHRpdGxlIHNjcmVlblxyXG4gICAgICAgICAgICAgICAgaW5wdXRTdGF0ZS5kZWxldGUoSW5wdXRLZXkuRU5URVIpOyAvLyBDb25zdW1lIHRoZSBpbnB1dFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBkcmF3KCk6IHZvaWQge1xyXG4gICAgLy8gQ2xlYXIgY2FudmFzXHJcbiAgICBjdHguZmlsbFN0eWxlID0gZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MuYmFja2dyb3VuZENvbG9yO1xyXG4gICAgY3R4LmZpbGxSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcblxyXG4gICAgY3R4LmZvbnQgPSBgNDhweCAke2dhbWVDb25maWcuZ2FtZVNldHRpbmdzLmZvbnRGYW1pbHl9YDtcclxuICAgIGN0eC5maWxsU3R5bGUgPSBnYW1lQ29uZmlnLmdhbWVTZXR0aW5ncy50aXRsZVRleHRDb2xvcjtcclxuICAgIGN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgIGN0eC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJzsgLy8gQ2VudGVyIHRleHQgdmVydGljYWxseVxyXG5cclxuICAgIHN3aXRjaCAoY3VycmVudFN0YXRlKSB7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIGN0eC5maWxsVGV4dChnYW1lQ29uZmlnLmdhbWVTZXR0aW5ncy50aXRsZVRleHQsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyIC0gNTApO1xyXG4gICAgICAgICAgICBjdHguZm9udCA9IGAyNHB4ICR7Z2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udEZhbWlseX1gO1xyXG4gICAgICAgICAgICBjdHguZmlsbFRleHQoZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhcnRJbnN0cnVjdGlvbiwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIgKyAyMCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgY3R4LmZpbGxUZXh0KGdhbWVDb25maWcuZ2FtZVNldHRpbmdzLmluc3RydWN0aW9uVGl0bGUsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyIC0gMTUwKTtcclxuICAgICAgICAgICAgY3R4LmZvbnQgPSBgMjBweCAke2dhbWVDb25maWcuZ2FtZVNldHRpbmdzLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICAgICAgZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MuaW5zdHJ1Y3Rpb25MaW5lcy5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY3R4LmZpbGxUZXh0KGxpbmUsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyIC0gOTAgKyAoaW5kZXggKiAzMCkpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgY3R4LmZvbnQgPSBgMjRweCAke2dhbWVDb25maWcuZ2FtZVNldHRpbmdzLmZvbnRGYW1pbHl9YDtcclxuICAgICAgICAgICAgY3R4LmZpbGxUZXh0KGdhbWVDb25maWcuZ2FtZVNldHRpbmdzLmluc3RydWN0aW9uU3RhcnRHYW1lLCBjYW52YXMud2lkdGggLyAyLCBjYW52YXMuaGVpZ2h0IC0gODApO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICBkcmF3U3Vkb2t1Qm9hcmQoKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuU09MVkVEOlxyXG4gICAgICAgICAgICBjdHguZmlsbFRleHQoZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3Muc29sdmVkVGV4dCwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG4gICAgICAgICAgICBjdHguZm9udCA9IGAyNHB4ICR7Z2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udEZhbWlseX1gO1xyXG4gICAgICAgICAgICBjdHguZmlsbFRleHQoZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MucmVzdGFydEluc3RydWN0aW9uLCBjYW52YXMud2lkdGggLyAyLCBjYW52YXMuaGVpZ2h0IC8gMiArIDUwKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdTdWRva3VCb2FyZCgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHMgPSBnYW1lQ29uZmlnLnN1ZG9rdVNldHRpbmdzO1xyXG4gICAgY29uc3QgTiA9IHMuYm9hcmRTaXplO1xyXG4gICAgY29uc3QgY2VsbFNpemUgPSBzLmNlbGxTaXplO1xyXG4gICAgY29uc3QgYm9hcmRXaWR0aCA9IE4gKiBjZWxsU2l6ZTtcclxuICAgIGNvbnN0IGJvYXJkSGVpZ2h0ID0gTiAqIGNlbGxTaXplO1xyXG4gICAgLy8gQ2VudGVyIHRoZSBib2FyZCBvbiB0aGUgY2FudmFzXHJcbiAgICBjb25zdCBib2FyZFggPSAoY2FudmFzLndpZHRoIC0gYm9hcmRXaWR0aCkgLyAyO1xyXG4gICAgY29uc3QgYm9hcmRZID0gKGNhbnZhcy5oZWlnaHQgLSBib2FyZEhlaWdodCkgLyAyO1xyXG5cclxuICAgIC8vIERyYXcgYmFja2dyb3VuZCBmb3Igc2VsZWN0ZWQgY2VsbCdzIHJvdywgY29sdW1uLCBhbmQgYmxvY2tcclxuICAgIGlmIChzZWxlY3RlZFJvdyAhPT0gLTEgJiYgc2VsZWN0ZWRDb2wgIT09IC0xKSB7XHJcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHMuaGlnaGxpZ2h0Q29sb3I7XHJcbiAgICAgICAgLy8gSGlnaGxpZ2h0IHJvd1xyXG4gICAgICAgIGN0eC5maWxsUmVjdChib2FyZFgsIGJvYXJkWSArIHNlbGVjdGVkUm93ICogY2VsbFNpemUsIGJvYXJkV2lkdGgsIGNlbGxTaXplKTtcclxuICAgICAgICAvLyBIaWdobGlnaHQgY29sdW1uXHJcbiAgICAgICAgY3R4LmZpbGxSZWN0KGJvYXJkWCArIHNlbGVjdGVkQ29sICogY2VsbFNpemUsIGJvYXJkWSwgY2VsbFNpemUsIGJvYXJkSGVpZ2h0KTtcclxuICAgICAgICAvLyBIaWdobGlnaHQgM3gzIGJsb2NrXHJcbiAgICAgICAgY29uc3QgYmxvY2tTaXplID0gTWF0aC5zcXJ0KE4pO1xyXG4gICAgICAgIGNvbnN0IGJsb2NrU3RhcnRSb3cgPSBNYXRoLmZsb29yKHNlbGVjdGVkUm93IC8gYmxvY2tTaXplKSAqIGJsb2NrU2l6ZTtcclxuICAgICAgICBjb25zdCBibG9ja1N0YXJ0Q29sID0gTWF0aC5mbG9vcihzZWxlY3RlZENvbCAvIGJsb2NrU2l6ZSkgKiBibG9ja1NpemU7XHJcbiAgICAgICAgY3R4LmZpbGxSZWN0KFxyXG4gICAgICAgICAgICBib2FyZFggKyBibG9ja1N0YXJ0Q29sICogY2VsbFNpemUsXHJcbiAgICAgICAgICAgIGJvYXJkWSArIGJsb2NrU3RhcnRSb3cgKiBjZWxsU2l6ZSxcclxuICAgICAgICAgICAgYmxvY2tTaXplICogY2VsbFNpemUsXHJcbiAgICAgICAgICAgIGJsb2NrU2l6ZSAqIGNlbGxTaXplXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEcmF3IHNlbGVjdGVkIGNlbGwgYmFja2dyb3VuZFxyXG4gICAgaWYgKHNlbGVjdGVkUm93ICE9PSAtMSAmJiBzZWxlY3RlZENvbCAhPT0gLTEpIHtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gcy5zZWxlY3RlZENlbGxDb2xvcjtcclxuICAgICAgICBjdHguZmlsbFJlY3QoYm9hcmRYICsgc2VsZWN0ZWRDb2wgKiBjZWxsU2l6ZSwgYm9hcmRZICsgc2VsZWN0ZWRSb3cgKiBjZWxsU2l6ZSwgY2VsbFNpemUsIGNlbGxTaXplKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEcmF3IG51bWJlcnNcclxuICAgIGN0eC5mb250ID0gYCR7cy5udW1iZXJGb250U2l6ZX1weCAke3MubnVtYmVyRm9udEZhbWlseX1gO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgY3R4LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xyXG4gICAgZm9yIChsZXQgciA9IDA7IHIgPCBOOyByKyspIHtcclxuICAgICAgICBmb3IgKGxldCBjID0gMDsgYyA8IE47IGMrKykge1xyXG4gICAgICAgICAgICBjb25zdCBudW0gPSBzdWRva3VCb2FyZFtyXVtjXTtcclxuICAgICAgICAgICAgaWYgKG51bSAhPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgeCA9IGJvYXJkWCArIGMgKiBjZWxsU2l6ZSArIGNlbGxTaXplIC8gMjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHkgPSBib2FyZFkgKyByICogY2VsbFNpemUgKyBjZWxsU2l6ZSAvIDI7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGluaXRpYWxCb2FyZFtyXVtjXSAhPT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGN0eC5maWxsU3R5bGUgPSBzLmZpeGVkTnVtYmVyQ29sb3I7IC8vIEZpeGVkIG51bWJlcnNcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IHMucGxheWVyTnVtYmVyQ29sb3I7IC8vIFBsYXllciBlbnRlcmVkIG51bWJlcnNcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGN0eC5maWxsVGV4dChudW0udG9TdHJpbmcoKSwgeCwgeSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhdyBncmlkIGxpbmVzXHJcbiAgICBjdHguc3Ryb2tlU3R5bGUgPSBzLmdyaWRMaW5lQ29sb3I7XHJcbiAgICBjdHgubGluZVdpZHRoID0gMTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IE47IGkrKykge1xyXG4gICAgICAgIC8vIEhvcml6b250YWwgbGluZXNcclxuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XHJcbiAgICAgICAgY3R4Lm1vdmVUbyhib2FyZFgsIGJvYXJkWSArIGkgKiBjZWxsU2l6ZSk7XHJcbiAgICAgICAgY3R4LmxpbmVUbyhib2FyZFggKyBib2FyZFdpZHRoLCBib2FyZFkgKyBpICogY2VsbFNpemUpO1xyXG4gICAgICAgIGN0eC5zdHJva2UoKTtcclxuXHJcbiAgICAgICAgLy8gVmVydGljYWwgbGluZXNcclxuICAgICAgICBjdHguYmVnaW5QYXRoKCk7XHJcbiAgICAgICAgY3R4Lm1vdmVUbyhib2FyZFggKyBpICogY2VsbFNpemUsIGJvYXJkWSk7XHJcbiAgICAgICAgY3R4LmxpbmVUbyhib2FyZFggKyBpICogY2VsbFNpemUsIGJvYXJkWSArIGJvYXJkSGVpZ2h0KTtcclxuICAgICAgICBjdHguc3Ryb2tlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhdyBtYWpvciBncmlkIGxpbmVzICgzeDMgYmxvY2tzKVxyXG4gICAgY3R4LnN0cm9rZVN0eWxlID0gcy5tYWpvckdyaWRMaW5lQ29sb3I7XHJcbiAgICBjdHgubGluZVdpZHRoID0gMztcclxuICAgIGNvbnN0IGJsb2NrU2l6ZSA9IE1hdGguc3FydChOKTsgLy8gU2hvdWxkIGJlIDMgZm9yIDl4OVxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gTjsgaSArPSBibG9ja1NpemUpIHtcclxuICAgICAgICAvLyBIb3Jpem9udGFsIG1ham9yIGxpbmVzXHJcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xyXG4gICAgICAgIGN0eC5tb3ZlVG8oYm9hcmRYLCBib2FyZFkgKyBpICogY2VsbFNpemUpO1xyXG4gICAgICAgIGN0eC5saW5lVG8oYm9hcmRYICsgYm9hcmRXaWR0aCwgYm9hcmRZICsgaSAqIGNlbGxTaXplKTtcclxuICAgICAgICBjdHguc3Ryb2tlKCk7XHJcblxyXG4gICAgICAgIC8vIFZlcnRpY2FsIG1ham9yIGxpbmVzXHJcbiAgICAgICAgY3R4LmJlZ2luUGF0aCgpO1xyXG4gICAgICAgIGN0eC5tb3ZlVG8oYm9hcmRYICsgaSAqIGNlbGxTaXplLCBib2FyZFkpO1xyXG4gICAgICAgIGN0eC5saW5lVG8oYm9hcmRYICsgaSAqIGNlbGxTaXplLCBib2FyZFkgKyBib2FyZEhlaWdodCk7XHJcbiAgICAgICAgY3R4LnN0cm9rZSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnYW1lTG9vcChjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSBsYXN0RnJhbWVUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgbXMgdG8gc2Vjb25kc1xyXG4gICAgbGFzdEZyYW1lVGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgZHJhdygpO1xyXG5cclxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShnYW1lTG9vcCk7XHJcbn1cclxuXHJcbi8vIEluaXRpYWxpemUgZ2FtZVxyXG5hc3luYyBmdW5jdGlvbiBpbml0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQuJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJykgYXMgQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgZ2FtZUNvbmZpZyA9IGF3YWl0IGxvYWRHYW1lRGF0YSgpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGRhdGEgbG9hZGVkOicsIGdhbWVDb25maWcpO1xyXG5cclxuICAgICAgICBjYW52YXMud2lkdGggPSBnYW1lQ29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNXaWR0aDtcclxuICAgICAgICBjYW52YXMuaGVpZ2h0ID0gZ2FtZUNvbmZpZy5nYW1lU2V0dGluZ3MuY2FudmFzSGVpZ2h0O1xyXG5cclxuICAgICAgICBhd2FpdCBsb2FkQXNzZXRzKGdhbWVDb25maWcuYXNzZXRzKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnQXNzZXRzIGxvYWRlZDonLCBsb2FkZWRJbWFnZXMuc2l6ZSwgJ2ltYWdlcywnLCBsb2FkZWRTb3VuZHMuc2l6ZSwgJ3NvdW5kcycpO1xyXG5cclxuICAgICAgICBiYWNrZ3JvdW5kTXVzaWMgPSBsb2FkZWRTb3VuZHMuZ2V0KFwiYmdtXCIpO1xyXG4gICAgICAgIHN0YXJ0U291bmQgPSBsb2FkZWRTb3VuZHMuZ2V0KFwic3RhcnRfc291bmRcIik7XHJcbiAgICAgICAgY2VsbFNlbGVjdFNvdW5kID0gbG9hZGVkU291bmRzLmdldChcImNlbGxfc2VsZWN0X3NvdW5kXCIpO1xyXG4gICAgICAgIHBsYWNlTnVtYmVyU291bmQgPSBsb2FkZWRTb3VuZHMuZ2V0KFwicGxhY2VfbnVtYmVyX3NvdW5kXCIpO1xyXG4gICAgICAgIGNsZWFyTnVtYmVyU291bmQgPSBsb2FkZWRTb3VuZHMuZ2V0KFwiY2xlYXJfbnVtYmVyX3NvdW5kXCIpO1xyXG4gICAgICAgIHdpblNvdW5kID0gbG9hZGVkU291bmRzLmdldChcIndpbl9zb3VuZFwiKTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGluaXRpYWwgc2VsZWN0ZWQgY2VsbFxyXG4gICAgICAgIHNlbGVjdGVkUm93ID0gMDtcclxuICAgICAgICBzZWxlY3RlZENvbCA9IDA7XHJcblxyXG4gICAgICAgIC8vIElucHV0IGxpc3RlbmVyc1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qga2V5ID0gZS5rZXk7XHJcbiAgICAgICAgICAgIC8vIE1hcCBudW1iZXIga2V5cyB0byBJbnB1dEtleSBlbnVtXHJcbiAgICAgICAgICAgIGlmIChrZXkgPj0gJzEnICYmIGtleSA8PSAnOScpIHtcclxuICAgICAgICAgICAgICAgIGlucHV0U3RhdGUuYWRkKGtleSBhcyBJbnB1dEtleSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSAnQmFja3NwYWNlJykge1xyXG4gICAgICAgICAgICAgICAgaW5wdXRTdGF0ZS5hZGQoSW5wdXRLZXkuQkFDS1NQQUNFKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChrZXkgPT09ICdEZWxldGUnKSB7XHJcbiAgICAgICAgICAgICAgICBpbnB1dFN0YXRlLmFkZChJbnB1dEtleS5ERUxFVEUpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW5wdXRLZXkgPSBrZXkgYXMgSW5wdXRLZXk7XHJcbiAgICAgICAgICAgICAgICAvLyBPbmx5IGFkZCBrZXlzIHRoYXQgYXJlIGV4cGxpY2l0bHkgZGVmaW5lZCBpbiBJbnB1dEtleSBlbnVtXHJcbiAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LnZhbHVlcyhJbnB1dEtleSkuaW5jbHVkZXMoaW5wdXRLZXkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaW5wdXRTdGF0ZS5hZGQoaW5wdXRLZXkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vIFByZXZlbnQgZGVmYXVsdCBicm93c2VyIGFjdGlvbnMgZm9yIGNvbW1vbiBnYW1lIGtleXNcclxuICAgICAgICAgICAgaWYgKFsnQXJyb3dVcCcsICdBcnJvd0Rvd24nLCAnQXJyb3dMZWZ0JywgJ0Fycm93UmlnaHQnLCAnICcsICdFbnRlcicsICdCYWNrc3BhY2UnLCAnRGVsZXRlJ10uaW5jbHVkZXMoa2V5KSkge1xyXG4gICAgICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGUua2V5O1xyXG4gICAgICAgICAgICBpZiAoa2V5ID49ICcxJyAmJiBrZXkgPD0gJzknKSB7XHJcbiAgICAgICAgICAgICAgICBpbnB1dFN0YXRlLmRlbGV0ZShrZXkgYXMgSW5wdXRLZXkpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGtleSA9PT0gJ0JhY2tzcGFjZScpIHtcclxuICAgICAgICAgICAgICAgIGlucHV0U3RhdGUuZGVsZXRlKElucHV0S2V5LkJBQ0tTUEFDRSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoa2V5ID09PSAnRGVsZXRlJykge1xyXG4gICAgICAgICAgICAgICAgaW5wdXRTdGF0ZS5kZWxldGUoSW5wdXRLZXkuREVMRVRFKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlucHV0S2V5ID0ga2V5IGFzIElucHV0S2V5O1xyXG4gICAgICAgICAgICAgICAgaWYgKE9iamVjdC52YWx1ZXMoSW5wdXRLZXkpLmluY2x1ZGVzKGlucHV0S2V5KSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlucHV0U3RhdGUuZGVsZXRlKGlucHV0S2V5KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBTdGFydCB0aGUgZ2FtZSBsb29wXHJcbiAgICAgICAgbGFzdEZyYW1lVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShnYW1lTG9vcCk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gaW5pdGlhbGl6ZSBnYW1lOicsIGVycm9yKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gU3RhcnQgdGhlIGdhbWUgaW5pdGlhbGl6YXRpb24gd2hlbiB0aGUgd2luZG93IGxvYWRzXHJc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
