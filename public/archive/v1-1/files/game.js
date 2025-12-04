var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["INSTRUCTIONS"] = 1] = "INSTRUCTIONS";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var Choice = /* @__PURE__ */ ((Choice2) => {
  Choice2[Choice2["ROCK"] = 0] = "ROCK";
  Choice2[Choice2["PAPER"] = 1] = "PAPER";
  Choice2[Choice2["SCISSORS"] = 2] = "SCISSORS";
  return Choice2;
})(Choice || {});
let config;
let canvas;
let ctx;
let loadedImages = /* @__PURE__ */ new Map();
let loadedSounds = /* @__PURE__ */ new Map();
let currentBGM = null;
let bgmPlaying = false;
let gameState = 0 /* TITLE */;
let score = 0;
let lives = 0;
let timeRemaining = 0;
let computerChoice = 0 /* ROCK */;
let lastFrameTime = 0;
let gameOverReason = "";
const choiceNames = ["rock", "paper", "scissors"];
let playerChoiceButtons = [];
async function loadImage(asset) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = asset.path;
    img.onload = () => {
      loadedImages.set(asset.name, img);
      resolve();
    };
    img.onerror = (e) => {
      console.error(`Failed to load image: ${asset.path}`, e);
      reject(e);
    };
  });
}
async function loadSound(asset) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.src = asset.path;
    audio.volume = asset.volume;
    audio.oncanplaythrough = () => {
      loadedSounds.set(asset.name, audio);
      resolve();
    };
    audio.onerror = (e) => {
      console.error(`Failed to load sound: ${asset.path}`, e);
      reject(e);
    };
  });
}
async function loadAssets() {
  const imagePromises = config.assets.images.map(loadImage);
  const soundPromises = config.assets.sounds.map(loadSound);
  await Promise.all([...imagePromises, ...soundPromises]);
  console.log("All assets loaded!");
}
function playSound(name, loop = false, volume) {
  const audio = loadedSounds.get(name);
  if (audio) {
    if (!loop) {
      audio.currentTime = 0;
      audio.pause();
    }
    audio.loop = loop;
    if (volume !== void 0) {
      audio.volume = volume;
    } else {
      const soundConfig = config.assets.sounds.find((s) => s.name === name);
      if (soundConfig) audio.volume = soundConfig.volume;
    }
    audio.play().catch((e) => console.warn(`Failed to play sound ${name}:`, e));
    if (loop) {
      currentBGM = audio;
      bgmPlaying = true;
    }
  } else {
    console.warn(`Sound '${name}' not found.`);
  }
}
function stopSound(name) {
  const audio = loadedSounds.get(name);
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    if (audio === currentBGM) {
      currentBGM = null;
      bgmPlaying = false;
    }
  }
}
function stopAllSounds() {
  loadedSounds.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  currentBGM = null;
  bgmPlaying = false;
}
function determineWinner(player, computer) {
  if (player === computer) {
    return 0;
  }
  if (player === 0 /* ROCK */ && computer === 2 /* SCISSORS */ || player === 1 /* PAPER */ && computer === 0 /* ROCK */ || player === 2 /* SCISSORS */ && computer === 1 /* PAPER */) {
    return 1;
  }
  return -1;
}
function newRound() {
  computerChoice = Math.floor(Math.random() * 3);
  timeRemaining = config.gameSettings.roundTimeLimit;
}
function startGame() {
  score = 0;
  lives = config.gameSettings.initialLives;
  gameState = 2 /* PLAYING */;
  newRound();
  playSound("game_bgm", true);
}
function restartGame() {
  stopAllSounds();
  gameState = 0 /* TITLE */;
  score = 0;
  lives = 0;
  timeRemaining = 0;
  gameOverReason = "";
  bgmPlaying = false;
}
function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
function drawCenteredText(text, y, color, font) {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, y);
}
function drawIcon(choice, x, y, width, height) {
  const img = loadedImages.get(choiceNames[choice]);
  if (img) {
    ctx.drawImage(img, x, y, width, height);
  } else {
    ctx.fillStyle = "red";
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "20px Arial";
    ctx.fillText(choiceNames[choice], x + width / 2, y + height / 2);
  }
}
function drawTitleScreen() {
  const background = loadedImages.get("title_background");
  if (background) {
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawCenteredText("\uAC00\uC704 \uBC14\uC704 \uBCF4!", canvas.height / 2 - 50, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeTitle);
  drawCenteredText("\uD074\uB9AD\uD558\uC5EC \uC2DC\uC791", canvas.height / 2 + 50, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeLarge);
}
function drawInstructionsScreen() {
  const background = loadedImages.get("title_background");
  if (background) {
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawCenteredText("\uAC8C\uC784 \uBC29\uBC95", canvas.height / 4, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeTitle);
  drawCenteredText("\uD654\uBA74 \uC911\uC559\uC758 \uC544\uC774\uCF58\uC744 \uC774\uAE38 \uC218 \uC788\uB294", canvas.height / 2 - 60, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeInstructions);
  drawCenteredText("\uC544\uC774\uCF58\uC744 \uD558\uB2E8\uC5D0\uC11C 3\uCD08 \uC548\uC5D0 \uD074\uB9AD\uD558\uC138\uC694.", canvas.height / 2 - 20, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeInstructions);
  drawCenteredText("\uBAA9\uC228\uC740 3\uAC1C \uC8FC\uC5B4\uC9D1\uB2C8\uB2E4.", canvas.height / 2 + 40, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeInstructions);
  drawCenteredText("\uD074\uB9AD\uD558\uC5EC \uAC8C\uC784 \uC2DC\uC791", canvas.height / 2 + 120, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeLarge);
}
function drawGame() {
  const background = loadedImages.get("game_background");
  if (background) {
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = config.gameSettings.fontColorDefault;
  ctx.font = config.gameSettings.fontSizeUI;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`\uC810\uC218: ${score}`, 20, 20);
  ctx.textAlign = "right";
  ctx.fillText(`\uBAA9\uC228: ${lives}`, canvas.width - 20, 20);
  ctx.textAlign = "center";
  ctx.fillText(`\uB0A8\uC740 \uC2DC\uAC04: ${Math.max(0, timeRemaining).toFixed(1)}`, canvas.width / 2, 20);
  const iconSize = config.gameSettings.choiceIconSize;
  const compX = (canvas.width - iconSize) / 2;
  const compY = canvas.height / 4 - iconSize / 2;
  drawIcon(computerChoice, compX, compY, iconSize, iconSize);
  const btnWidth = config.gameSettings.playerButtonWidth;
  const btnHeight = config.gameSettings.playerButtonHeight;
  const btnSpacing = config.gameSettings.playerButtonSpacing;
  const totalBtnWidth = btnWidth * 3 + btnSpacing * 2;
  let startX = (canvas.width - totalBtnWidth) / 2;
  const btnY = canvas.height * 3 / 4 - btnHeight / 2;
  playerChoiceButtons = [];
  for (let i = 0; i < 3; i++) {
    const x = startX + i * (btnWidth + btnSpacing);
    ctx.strokeStyle = config.gameSettings.fontColorDefault;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, btnY, btnWidth, btnHeight);
    drawIcon(i, x, btnY, btnWidth, btnHeight);
    playerChoiceButtons.push({ choice: i, rect: { x, y: btnY, width: btnWidth, height: btnHeight } });
  }
}
function drawGameOverScreen() {
  const background = loadedImages.get("title_background");
  if (background) {
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawCenteredText("\uAC8C\uC784 \uC624\uBC84!", canvas.height / 2 - 80, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeTitle);
  drawCenteredText(`\uCD5C\uC885 \uC810\uC218: ${score}`, canvas.height / 2, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeLarge);
  if (gameOverReason) {
    drawCenteredText(`\uC774\uC720: ${gameOverReason}`, canvas.height / 2 + 60, config.gameSettings.fontColorDefault, config.gameSettings.fontSizeUI);
  }
  drawCenteredText("\uD074\uB9AD\uD558\uC5EC \uB2E4\uC2DC \uC2DC\uC791", canvas.height / 2 + 140, config.gameSettings.fontColorHighlight, config.gameSettings.fontSizeLarge);
}
function draw() {
  clearCanvas();
  switch (gameState) {
    case 0 /* TITLE */:
      drawTitleScreen();
      break;
    case 1 /* INSTRUCTIONS */:
      drawInstructionsScreen();
      break;
    case 2 /* PLAYING */:
      drawGame();
      break;
    case 3 /* GAME_OVER */:
      drawGameOverScreen();
      break;
  }
}
function handleMouseClick(event) {
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;
  playSound("button_click");
  switch (gameState) {
    case 0 /* TITLE */:
      gameState = 1 /* INSTRUCTIONS */;
      break;
    case 1 /* INSTRUCTIONS */:
      startGame();
      break;
    case 2 /* PLAYING */:
      for (const button of playerChoiceButtons) {
        if (mouseX >= button.rect.x && mouseX <= button.rect.x + button.rect.width && mouseY >= button.rect.y && mouseY <= button.rect.y + button.rect.height) {
          const result = determineWinner(button.choice, computerChoice);
          if (result === 1) {
            score++;
            playSound("win_sound");
          } else if (result === 0) {
          } else {
            lives--;
            playSound("lose_sound");
          }
          if (lives <= 0) {
            gameState = 3 /* GAME_OVER */;
            gameOverReason = result === -1 ? "\uC798\uBABB\uB41C \uC120\uD0DD" : "\uBAA9\uC228\uC774 \uBAA8\uB450 \uC18C\uC9C4\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";
            stopSound("game_bgm");
          } else {
            newRound();
          }
          return;
        }
      }
      break;
    case 3 /* GAME_OVER */:
      restartGame();
      break;
  }
}
function gameLoop(currentTime) {
  const deltaTime = (currentTime - lastFrameTime) / 1e3;
  lastFrameTime = currentTime;
  if (gameState === 2 /* PLAYING */) {
    timeRemaining -= deltaTime;
    if (timeRemaining <= 0) {
      lives--;
      playSound("lose_sound");
      if (lives <= 0) {
        gameState = 3 /* GAME_OVER */;
        gameOverReason = "\uC2DC\uAC04 \uCD08\uACFC";
        stopSound("game_bgm");
      } else {
        newRound();
      }
    }
  }
  if (gameState === 2 /* PLAYING */ && !bgmPlaying) {
    playSound("game_bgm", true);
  }
  if (gameState !== 2 /* PLAYING */ && bgmPlaying) {
    stopSound("game_bgm");
  }
  draw();
  requestAnimationFrame(gameLoop);
}
async function init() {
  canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("Canvas element with id 'gameCanvas' not found.");
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
  canvas.width = config.gameSettings.canvasWidth;
  canvas.height = config.gameSettings.canvasHeight;
  try {
    await loadAssets();
  } catch (error) {
    console.error("Failed to load assets:", error);
    return;
  }
  canvas.addEventListener("click", handleMouseClick);
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
}
document.addEventListener("DOMContentLoaded", init);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gRW51bXMgZm9yIGdhbWUgc3RhdGVzIGFuZCBjaG9pY2VzXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLFxyXG4gICAgSU5TVFJVQ1RJT05TLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUlxyXG59XHJcblxyXG5lbnVtIENob2ljZSB7XHJcbiAgICBST0NLID0gMCxcclxuICAgIFBBUEVSID0gMSxcclxuICAgIFNDSVNTT1JTID0gMlxyXG59XHJcblxyXG4vLyBIZWxwZXIgaW50ZXJmYWNlIGZvciBhc3NldCBjb25maWd1cmF0aW9uc1xyXG5pbnRlcmZhY2UgSW1hZ2VBc3NldENvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBTb3VuZEFzc2V0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQXNzZXRzQ29uZmlnIHtcclxuICAgIGltYWdlczogSW1hZ2VBc3NldENvbmZpZ1tdO1xyXG4gICAgc291bmRzOiBTb3VuZEFzc2V0Q29uZmlnW107XHJcbn1cclxuXHJcbi8vIEdhbWUgY29uZmlndXJhdGlvbiBpbnRlcmZhY2UsIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBnYW1lU2V0dGluZ3M6IHtcclxuICAgICAgICBpbml0aWFsTGl2ZXM6IG51bWJlcjtcclxuICAgICAgICByb3VuZFRpbWVMaW1pdDogbnVtYmVyO1xyXG4gICAgICAgIGNhbnZhc1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgY2FudmFzSGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgY2hvaWNlSWNvblNpemU6IG51bWJlcjtcclxuICAgICAgICBwbGF5ZXJCdXR0b25XaWR0aDogbnVtYmVyO1xyXG4gICAgICAgIHBsYXllckJ1dHRvbkhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIHBsYXllckJ1dHRvblNwYWNpbmc6IG51bWJlcjtcclxuICAgICAgICBmb250U2l6ZVRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgZm9udFNpemVJbnN0cnVjdGlvbnM6IHN0cmluZztcclxuICAgICAgICBmb250U2l6ZVVJOiBzdHJpbmc7XHJcbiAgICAgICAgZm9udFNpemVMYXJnZTogc3RyaW5nO1xyXG4gICAgICAgIGZvbnRDb2xvckRlZmF1bHQ6IHN0cmluZztcclxuICAgICAgICBmb250Q29sb3JIaWdobGlnaHQ6IHN0cmluZztcclxuICAgIH07XHJcbiAgICBhc3NldHM6IEFzc2V0c0NvbmZpZztcclxufVxyXG5cclxuLy8gR2xvYmFsIGdhbWUgdmFyaWFibGVzXHJcbmxldCBjb25maWc6IEdhbWVDb25maWc7XHJcbmxldCBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG5sZXQgY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcblxyXG5sZXQgbG9hZGVkSW1hZ2VzOiBNYXA8c3RyaW5nLCBIVE1MSW1hZ2VFbGVtZW50PiA9IG5ldyBNYXAoKTtcclxubGV0IGxvYWRlZFNvdW5kczogTWFwPHN0cmluZywgSFRNTEF1ZGlvRWxlbWVudD4gPSBuZXcgTWFwKCk7XHJcbmxldCBjdXJyZW50QkdNOiBIVE1MQXVkaW9FbGVtZW50IHwgbnVsbCA9IG51bGw7XHJcbmxldCBiZ21QbGF5aW5nOiBib29sZWFuID0gZmFsc2U7XHJcblxyXG4vLyBHYW1lIHN0YXRlIHZhcmlhYmxlc1xyXG5sZXQgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbmxldCBzY29yZTogbnVtYmVyID0gMDtcclxubGV0IGxpdmVzOiBudW1iZXIgPSAwO1xyXG5sZXQgdGltZVJlbWFpbmluZzogbnVtYmVyID0gMDtcclxubGV0IGNvbXB1dGVyQ2hvaWNlOiBDaG9pY2UgPSBDaG9pY2UuUk9DSztcclxubGV0IGxhc3RGcmFtZVRpbWU6IG51bWJlciA9IDA7XHJcbmxldCBnYW1lT3ZlclJlYXNvbjogc3RyaW5nID0gXCJcIjtcclxuXHJcbi8vIEFycmF5IHRvIG1hcCBDaG9pY2UgZW51bSB0byBhc3NldCBuYW1lc1xyXG5jb25zdCBjaG9pY2VOYW1lcyA9IFsncm9jaycsICdwYXBlcicsICdzY2lzc29ycyddO1xyXG5cclxuLy8gUGxheWVyIGNob2ljZSBidXR0b24gZGVmaW5pdGlvbnMgZm9yIGNsaWNrYWJsZSBhcmVhc1xyXG5pbnRlcmZhY2UgUGxheWVyQnV0dG9uIHtcclxuICAgIGNob2ljZTogQ2hvaWNlO1xyXG4gICAgcmVjdDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH07XHJcbn1cclxubGV0IHBsYXllckNob2ljZUJ1dHRvbnM6IFBsYXllckJ1dHRvbltdID0gW107XHJcblxyXG4vLyBIZWxwZXIgZnVuY3Rpb25zIGZvciBhc3NldCBsb2FkaW5nXHJcbmFzeW5jIGZ1bmN0aW9uIGxvYWRJbWFnZShhc3NldDogSW1hZ2VBc3NldENvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICBpbWcuc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICBpbWcub25sb2FkID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBsb2FkZWRJbWFnZXMuc2V0KGFzc2V0Lm5hbWUsIGltZyk7XHJcbiAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGltZy5vbmVycm9yID0gKGUpID0+IHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgaW1hZ2U6ICR7YXNzZXQucGF0aH1gLCBlKTtcclxuICAgICAgICAgICAgcmVqZWN0KGUpO1xyXG4gICAgICAgIH07XHJcbiAgICB9KTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbG9hZFNvdW5kKGFzc2V0OiBTb3VuZEFzc2V0Q29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKCk7XHJcbiAgICAgICAgYXVkaW8uc3JjID0gYXNzZXQucGF0aDtcclxuICAgICAgICBhdWRpby52b2x1bWUgPSBhc3NldC52b2x1bWU7XHJcbiAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgbG9hZGVkU291bmRzLnNldChhc3NldC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHthc3NldC5wYXRofWAsIGUpO1xyXG4gICAgICAgICAgICByZWplY3QoZSk7XHJcbiAgICAgICAgfTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkQXNzZXRzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IGNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChsb2FkSW1hZ2UpO1xyXG4gICAgY29uc3Qgc291bmRQcm9taXNlcyA9IGNvbmZpZy5hc3NldHMuc291bmRzLm1hcChsb2FkU291bmQpO1xyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQhXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UsIHZvbHVtZT86IG51bWJlcik6IHZvaWQge1xyXG4gICAgY29uc3QgYXVkaW8gPSBsb2FkZWRTb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgLy8gU3RvcCBwcmV2aW91cyBpbnN0YW5jZSBpZiBub3QgbG9vcGluZyBCR00gdG8gYWxsb3cgb3ZlcmxhcHBpbmcgZWZmZWN0c1xyXG4gICAgICAgIGlmICghbG9vcCkge1xyXG4gICAgICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7IC8vIFJlc2V0IHRvIHN0YXJ0XHJcbiAgICAgICAgICAgIGF1ZGlvLnBhdXNlKCk7IC8vIEVuc3VyZSBpdCdzIHN0b3BwZWQgaWYgYWxyZWFkeSBwbGF5aW5nXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGF1ZGlvLmxvb3AgPSBsb29wO1xyXG4gICAgICAgIGlmICh2b2x1bWUgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSB2b2x1bWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gUmVzdG9yZSBkZWZhdWx0IHZvbHVtZSBpZiBub3Qgc3BlY2lmaWVkLCBvciB1c2UgdGhlIG9uZSBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICBjb25zdCBzb3VuZENvbmZpZyA9IGNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09IG5hbWUpO1xyXG4gICAgICAgICAgICBpZiAoc291bmRDb25maWcpIGF1ZGlvLnZvbHVtZSA9IHNvdW5kQ29uZmlnLnZvbHVtZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgYXVkaW8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBGYWlsZWQgdG8gcGxheSBzb3VuZCAke25hbWV9OmAsIGUpKTtcclxuXHJcbiAgICAgICAgaWYgKGxvb3ApIHtcclxuICAgICAgICAgICAgY3VycmVudEJHTSA9IGF1ZGlvO1xyXG4gICAgICAgICAgICBiZ21QbGF5aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7bmFtZX0nIG5vdCBmb3VuZC5gKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc3RvcFNvdW5kKG5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgY29uc3QgYXVkaW8gPSBsb2FkZWRTb3VuZHMuZ2V0KG5hbWUpO1xyXG4gICAgaWYgKGF1ZGlvKSB7XHJcbiAgICAgICAgYXVkaW8ucGF1c2UoKTtcclxuICAgICAgICBhdWRpby5jdXJyZW50VGltZSA9IDA7XHJcbiAgICAgICAgaWYgKGF1ZGlvID09PSBjdXJyZW50QkdNKSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRCR00gPSBudWxsO1xyXG4gICAgICAgICAgICBiZ21QbGF5aW5nID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBzdG9wQWxsU291bmRzKCk6IHZvaWQge1xyXG4gICAgbG9hZGVkU291bmRzLmZvckVhY2goYXVkaW8gPT4ge1xyXG4gICAgICAgIGF1ZGlvLnBhdXNlKCk7XHJcbiAgICAgICAgYXVkaW8uY3VycmVudFRpbWUgPSAwO1xyXG4gICAgfSk7XHJcbiAgICBjdXJyZW50QkdNID0gbnVsbDtcclxuICAgIGJnbVBsYXlpbmcgPSBmYWxzZTtcclxufVxyXG5cclxuLy8gR2FtZSBsb2dpYyBmdW5jdGlvbnNcclxuZnVuY3Rpb24gZGV0ZXJtaW5lV2lubmVyKHBsYXllcjogQ2hvaWNlLCBjb21wdXRlcjogQ2hvaWNlKTogLTEgfCAwIHwgMSB7XHJcbiAgICAvLyAwOiBST0NLLCAxOiBQQVBFUiwgMjogU0NJU1NPUlNcclxuICAgIC8vIFdpbm5pbmcgY29uZGl0aW9uczpcclxuICAgIC8vIFJvY2sgKDApIGJlYXRzIFNjaXNzb3JzICgyKVxyXG4gICAgLy8gUGFwZXIgKDEpIGJlYXRzIFJvY2sgKDApXHJcbiAgICAvLyBTY2lzc29ycyAoMikgYmVhdHMgUGFwZXIgKDEpXHJcbiAgICBpZiAocGxheWVyID09PSBjb21wdXRlcikge1xyXG4gICAgICAgIHJldHVybiAwOyAvLyBEcmF3XHJcbiAgICB9XHJcbiAgICBpZiAoXHJcbiAgICAgICAgKHBsYXllciA9PT0gQ2hvaWNlLlJPQ0sgJiYgY29tcHV0ZXIgPT09IENob2ljZS5TQ0lTU09SUykgfHxcclxuICAgICAgICAocGxheWVyID09PSBDaG9pY2UuUEFQRVIgJiYgY29tcHV0ZXIgPT09IENob2ljZS5ST0NLKSB8fFxyXG4gICAgICAgIChwbGF5ZXIgPT09IENob2ljZS5TQ0lTU09SUyAmJiBjb21wdXRlciA9PT0gQ2hvaWNlLlBBUEVSKVxyXG4gICAgKSB7XHJcbiAgICAgICAgcmV0dXJuIDE7IC8vIFBsYXllciB3aW5zXHJcbiAgICB9XHJcbiAgICByZXR1cm4gLTE7IC8vIENvbXB1dGVyIHdpbnNcclxufVxyXG5cclxuZnVuY3Rpb24gbmV3Um91bmQoKTogdm9pZCB7XHJcbiAgICBjb21wdXRlckNob2ljZSA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDMpO1xyXG4gICAgdGltZVJlbWFpbmluZyA9IGNvbmZpZy5nYW1lU2V0dGluZ3Mucm91bmRUaW1lTGltaXQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgIHNjb3JlID0gMDtcclxuICAgIGxpdmVzID0gY29uZmlnLmdhbWVTZXR0aW5ncy5pbml0aWFsTGl2ZXM7XHJcbiAgICBnYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgIG5ld1JvdW5kKCk7XHJcbiAgICBwbGF5U291bmQoJ2dhbWVfYmdtJywgdHJ1ZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgc3RvcEFsbFNvdW5kcygpO1xyXG4gICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgc2NvcmUgPSAwO1xyXG4gICAgbGl2ZXMgPSAwO1xyXG4gICAgdGltZVJlbWFpbmluZyA9IDA7XHJcbiAgICBnYW1lT3ZlclJlYXNvbiA9IFwiXCI7XHJcbiAgICBiZ21QbGF5aW5nID0gZmFsc2U7IC8vIFJlc2V0IEJHTSBzdGF0ZVxyXG59XHJcblxyXG4vLyBEcmF3aW5nIGZ1bmN0aW9uc1xyXG5mdW5jdGlvbiBjbGVhckNhbnZhcygpOiB2b2lkIHtcclxuICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0NlbnRlcmVkVGV4dCh0ZXh0OiBzdHJpbmcsIHk6IG51bWJlciwgY29sb3I6IHN0cmluZywgZm9udDogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBjdHguZmlsbFN0eWxlID0gY29sb3I7XHJcbiAgICBjdHguZm9udCA9IGZvbnQ7XHJcbiAgICBjdHgudGV4dEFsaWduID0gJ2NlbnRlcic7XHJcbiAgICBjdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICBjdHguZmlsbFRleHQodGV4dCwgY2FudmFzLndpZHRoIC8gMiwgeSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdJY29uKGNob2ljZTogQ2hvaWNlLCB4OiBudW1iZXIsIHk6IG51bWJlciwgd2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcclxuICAgIGNvbnN0IGltZyA9IGxvYWRlZEltYWdlcy5nZXQoY2hvaWNlTmFtZXNbY2hvaWNlXSk7XHJcbiAgICBpZiAoaW1nKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZShpbWcsIHgsIHksIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gJ3JlZCc7XHJcbiAgICAgICAgY3R4LmZpbGxSZWN0KHgsIHksIHdpZHRoLCBoZWlnaHQpO1xyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSAnd2hpdGUnO1xyXG4gICAgICAgIGN0eC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICBjdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgY3R4LmZvbnQgPSAnMjBweCBBcmlhbCc7XHJcbiAgICAgICAgY3R4LmZpbGxUZXh0KGNob2ljZU5hbWVzW2Nob2ljZV0sIHggKyB3aWR0aCAvIDIsIHkgKyBoZWlnaHQgLyAyKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgY29uc3QgYmFja2dyb3VuZCA9IGxvYWRlZEltYWdlcy5nZXQoJ3RpdGxlX2JhY2tncm91bmQnKTtcclxuICAgIGlmIChiYWNrZ3JvdW5kKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZShiYWNrZ3JvdW5kLCAwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gJyMzMzMnO1xyXG4gICAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXdDZW50ZXJlZFRleHQoXCJcdUFDMDBcdUM3MDQgXHVCQzE0XHVDNzA0IFx1QkNGNCFcIiwgY2FudmFzLmhlaWdodCAvIDIgLSA1MCwgY29uZmlnLmdhbWVTZXR0aW5ncy5mb250Q29sb3JIaWdobGlnaHQsIGNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udFNpemVUaXRsZSk7XHJcbiAgICBkcmF3Q2VudGVyZWRUZXh0KFwiXHVEMDc0XHVCOUFEXHVENTU4XHVDNUVDIFx1QzJEQ1x1Qzc5MVwiLCBjYW52YXMuaGVpZ2h0IC8gMiArIDUwLCBjb25maWcuZ2FtZVNldHRpbmdzLmZvbnRDb2xvckRlZmF1bHQsIGNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udFNpemVMYXJnZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdJbnN0cnVjdGlvbnNTY3JlZW4oKTogdm9pZCB7XHJcbiAgICBjb25zdCBiYWNrZ3JvdW5kID0gbG9hZGVkSW1hZ2VzLmdldCgndGl0bGVfYmFja2dyb3VuZCcpOyAvLyBVc2luZyB0aXRsZSBiZyBmb3IgY29uc2lzdGVuY3lcclxuICAgIGlmIChiYWNrZ3JvdW5kKSB7XHJcbiAgICAgICAgY3R4LmRyYXdJbWFnZShiYWNrZ3JvdW5kLCAwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gJyMzMzMnO1xyXG4gICAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIGRyYXdDZW50ZXJlZFRleHQoXCJcdUFDOENcdUM3ODQgXHVCQzI5XHVCQzk1XCIsIGNhbnZhcy5oZWlnaHQgLyA0LCBjb25maWcuZ2FtZVNldHRpbmdzLmZvbnRDb2xvckhpZ2hsaWdodCwgY29uZmlnLmdhbWVTZXR0aW5ncy5mb250U2l6ZVRpdGxlKTtcclxuICAgIGRyYXdDZW50ZXJlZFRleHQoXCJcdUQ2NTRcdUJBNzQgXHVDOTExXHVDNTU5XHVDNzU4IFx1QzU0NFx1Qzc3NFx1Q0Y1OFx1Qzc0NCBcdUM3NzRcdUFFMzggXHVDMjE4IFx1Qzc4OFx1QjI5NFwiLCBjYW52YXMuaGVpZ2h0IC8gMiAtIDYwLCBjb25maWcuZ2FtZVNldHRpbmdzLmZvbnRDb2xvckRlZmF1bHQsIGNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udFNpemVJbnN0cnVjdGlvbnMpO1xyXG4gICAgZHJhd0NlbnRlcmVkVGV4dChcIlx1QzU0NFx1Qzc3NFx1Q0Y1OFx1Qzc0NCBcdUQ1NThcdUIyRThcdUM1RDBcdUMxMUMgM1x1Q0QwOCBcdUM1NDhcdUM1RDAgXHVEMDc0XHVCOUFEXHVENTU4XHVDMTM4XHVDNjk0LlwiLCBjYW52YXMuaGVpZ2h0IC8gMiAtIDIwLCBjb25maWcuZ2FtZVNldHRpbmdzLmZvbnRDb2xvckRlZmF1bHQsIGNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udFNpemVJbnN0cnVjdGlvbnMpO1xyXG4gICAgZHJhd0NlbnRlcmVkVGV4dChcIlx1QkFBOVx1QzIyOFx1Qzc0MCAzXHVBQzFDIFx1QzhGQ1x1QzVCNFx1QzlEMVx1QjJDOFx1QjJFNC5cIiwgY2FudmFzLmhlaWdodCAvIDIgKyA0MCwgY29uZmlnLmdhbWVTZXR0aW5ncy5mb250Q29sb3JEZWZhdWx0LCBjb25maWcuZ2FtZVNldHRpbmdzLmZvbnRTaXplSW5zdHJ1Y3Rpb25zKTtcclxuICAgIGRyYXdDZW50ZXJlZFRleHQoXCJcdUQwNzRcdUI5QURcdUQ1NThcdUM1RUMgXHVBQzhDXHVDNzg0IFx1QzJEQ1x1Qzc5MVwiLCBjYW52YXMuaGVpZ2h0IC8gMiArIDEyMCwgY29uZmlnLmdhbWVTZXR0aW5ncy5mb250Q29sb3JIaWdobGlnaHQsIGNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udFNpemVMYXJnZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRyYXdHYW1lKCk6IHZvaWQge1xyXG4gICAgY29uc3QgYmFja2dyb3VuZCA9IGxvYWRlZEltYWdlcy5nZXQoJ2dhbWVfYmFja2dyb3VuZCcpO1xyXG4gICAgaWYgKGJhY2tncm91bmQpIHtcclxuICAgICAgICBjdHguZHJhd0ltYWdlKGJhY2tncm91bmQsIDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSAnIzAwMCc7XHJcbiAgICAgICAgY3R4LmZpbGxSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRHJhdyBVSVxyXG4gICAgY3R4LmZpbGxTdHlsZSA9IGNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udENvbG9yRGVmYXVsdDtcclxuICAgIGN0eC5mb250ID0gY29uZmlnLmdhbWVTZXR0aW5ncy5mb250U2l6ZVVJO1xyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdsZWZ0JztcclxuICAgIGN0eC50ZXh0QmFzZWxpbmUgPSAndG9wJztcclxuICAgIGN0eC5maWxsVGV4dChgXHVDODEwXHVDMjE4OiAke3Njb3JlfWAsIDIwLCAyMCk7XHJcbiAgICBjdHgudGV4dEFsaWduID0gJ3JpZ2h0JztcclxuICAgIGN0eC5maWxsVGV4dChgXHVCQUE5XHVDMjI4OiAke2xpdmVzfWAsIGNhbnZhcy53aWR0aCAtIDIwLCAyMCk7XHJcblxyXG4gICAgLy8gRHJhdyB0aW1lclxyXG4gICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgY3R4LmZpbGxUZXh0KGBcdUIwQThcdUM3NDAgXHVDMkRDXHVBQzA0OiAke01hdGgubWF4KDAsIHRpbWVSZW1haW5pbmcpLnRvRml4ZWQoMSl9YCwgY2FudmFzLndpZHRoIC8gMiwgMjApO1xyXG5cclxuICAgIC8vIERyYXcgY29tcHV0ZXIncyBjaG9pY2VcclxuICAgIGNvbnN0IGljb25TaXplID0gY29uZmlnLmdhbWVTZXR0aW5ncy5jaG9pY2VJY29uU2l6ZTtcclxuICAgIGNvbnN0IGNvbXBYID0gKGNhbnZhcy53aWR0aCAtIGljb25TaXplKSAvIDI7XHJcbiAgICBjb25zdCBjb21wWSA9IGNhbnZhcy5oZWlnaHQgLyA0IC0gaWNvblNpemUgLyAyO1xyXG4gICAgZHJhd0ljb24oY29tcHV0ZXJDaG9pY2UsIGNvbXBYLCBjb21wWSwgaWNvblNpemUsIGljb25TaXplKTtcclxuXHJcbiAgICAvLyBEcmF3IHBsYXllciBjaG9pY2UgYnV0dG9uc1xyXG4gICAgY29uc3QgYnRuV2lkdGggPSBjb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckJ1dHRvbldpZHRoO1xyXG4gICAgY29uc3QgYnRuSGVpZ2h0ID0gY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJCdXR0b25IZWlnaHQ7XHJcbiAgICBjb25zdCBidG5TcGFjaW5nID0gY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJCdXR0b25TcGFjaW5nO1xyXG5cclxuICAgIGNvbnN0IHRvdGFsQnRuV2lkdGggPSAoYnRuV2lkdGggKiAzKSArIChidG5TcGFjaW5nICogMik7XHJcbiAgICBsZXQgc3RhcnRYID0gKGNhbnZhcy53aWR0aCAtIHRvdGFsQnRuV2lkdGgpIC8gMjtcclxuICAgIGNvbnN0IGJ0blkgPSBjYW52YXMuaGVpZ2h0ICogMyAvIDQgLSBidG5IZWlnaHQgLyAyO1xyXG5cclxuICAgIHBsYXllckNob2ljZUJ1dHRvbnMgPSBbXTsgLy8gQ2xlYXIgYW5kIHJlLXBvcHVsYXRlIGVhY2ggZnJhbWUgZm9yIHBvdGVudGlhbCBzY2FsaW5nXHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcclxuICAgICAgICBjb25zdCB4ID0gc3RhcnRYICsgKGkgKiAoYnRuV2lkdGggKyBidG5TcGFjaW5nKSk7XHJcbiAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gY29uZmlnLmdhbWVTZXR0aW5ncy5mb250Q29sb3JEZWZhdWx0O1xyXG4gICAgICAgIGN0eC5saW5lV2lkdGggPSAzO1xyXG4gICAgICAgIGN0eC5zdHJva2VSZWN0KHgsIGJ0blksIGJ0bldpZHRoLCBidG5IZWlnaHQpO1xyXG4gICAgICAgIGRyYXdJY29uKGkgYXMgQ2hvaWNlLCB4LCBidG5ZLCBidG5XaWR0aCwgYnRuSGVpZ2h0KTtcclxuICAgICAgICBwbGF5ZXJDaG9pY2VCdXR0b25zLnB1c2goeyBjaG9pY2U6IGkgYXMgQ2hvaWNlLCByZWN0OiB7IHgsIHk6IGJ0blksIHdpZHRoOiBidG5XaWR0aCwgaGVpZ2h0OiBidG5IZWlnaHQgfSB9KTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZHJhd0dhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgY29uc3QgYmFja2dyb3VuZCA9IGxvYWRlZEltYWdlcy5nZXQoJ3RpdGxlX2JhY2tncm91bmQnKTsgLy8gVXNpbmcgdGl0bGUgYmcgZm9yIGNvbnNpc3RlbmN5XHJcbiAgICBpZiAoYmFja2dyb3VuZCkge1xyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoYmFja2dyb3VuZCwgMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICcjMzMzJztcclxuICAgICAgICBjdHguZmlsbFJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3Q2VudGVyZWRUZXh0KFwiXHVBQzhDXHVDNzg0IFx1QzYyNFx1QkM4NCFcIiwgY2FudmFzLmhlaWdodCAvIDIgLSA4MCwgY29uZmlnLmdhbWVTZXR0aW5ncy5mb250Q29sb3JIaWdobGlnaHQsIGNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udFNpemVUaXRsZSk7XHJcbiAgICBkcmF3Q2VudGVyZWRUZXh0KGBcdUNENUNcdUM4ODUgXHVDODEwXHVDMjE4OiAke3Njb3JlfWAsIGNhbnZhcy5oZWlnaHQgLyAyLCBjb25maWcuZ2FtZVNldHRpbmdzLmZvbnRDb2xvckRlZmF1bHQsIGNvbmZpZy5nYW1lU2V0dGluZ3MuZm9udFNpemVMYXJnZSk7XHJcbiAgICBpZiAoZ2FtZU92ZXJSZWFzb24pIHtcclxuICAgICAgICBkcmF3Q2VudGVyZWRUZXh0KGBcdUM3NzRcdUM3MjA6ICR7Z2FtZU92ZXJSZWFzb259YCwgY2FudmFzLmhlaWdodCAvIDIgKyA2MCwgY29uZmlnLmdhbWVTZXR0aW5ncy5mb250Q29sb3JEZWZhdWx0LCBjb25maWcuZ2FtZVNldHRpbmdzLmZvbnRTaXplVUkpO1xyXG4gICAgfVxyXG4gICAgZHJhd0NlbnRlcmVkVGV4dChcIlx1RDA3NFx1QjlBRFx1RDU1OFx1QzVFQyBcdUIyRTRcdUMyREMgXHVDMkRDXHVDNzkxXCIsIGNhbnZhcy5oZWlnaHQgLyAyICsgMTQwLCBjb25maWcuZ2FtZVNldHRpbmdzLmZvbnRDb2xvckhpZ2hsaWdodCwgY29uZmlnLmdhbWVTZXR0aW5ncy5mb250U2l6ZUxhcmdlKTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGRyYXcoKTogdm9pZCB7XHJcbiAgICBjbGVhckNhbnZhcygpO1xyXG4gICAgc3dpdGNoIChnYW1lU3RhdGUpIHtcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgZHJhd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgZHJhd0luc3RydWN0aW9uc1NjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5QTEFZSU5HOlxyXG4gICAgICAgICAgICBkcmF3R2FtZSgpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgIGRyYXdHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgIH1cclxufVxyXG5cclxuLy8gRXZlbnQgbGlzdGVuZXJzXHJcbmZ1bmN0aW9uIGhhbmRsZU1vdXNlQ2xpY2soZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgIGNvbnN0IHJlY3QgPSBjYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBjb25zdCBtb3VzZVggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0O1xyXG4gICAgY29uc3QgbW91c2VZID0gZXZlbnQuY2xpZW50WSAtIHJlY3QudG9wO1xyXG5cclxuICAgIHBsYXlTb3VuZCgnYnV0dG9uX2NsaWNrJyk7IC8vIFBsYXkgY2xpY2sgc291bmQgZm9yIGFueSBpbnRlcmFjdGlvblxyXG5cclxuICAgIHN3aXRjaCAoZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgY2FzZSBHYW1lU3RhdGUuVElUTEU6XHJcbiAgICAgICAgICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5JTlNUUlVDVElPTlM7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLklOU1RSVUNUSU9OUzpcclxuICAgICAgICAgICAgc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHBsYXllciBjbGlja2VkIG9uIGEgY2hvaWNlIGJ1dHRvblxyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGJ1dHRvbiBvZiBwbGF5ZXJDaG9pY2VCdXR0b25zKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAobW91c2VYID49IGJ1dHRvbi5yZWN0LnggJiYgbW91c2VYIDw9IGJ1dHRvbi5yZWN0LnggKyBidXR0b24ucmVjdC53aWR0aCAmJlxyXG4gICAgICAgICAgICAgICAgICAgIG1vdXNlWSA+PSBidXR0b24ucmVjdC55ICYmIG1vdXNlWSA8PSBidXR0b24ucmVjdC55ICsgYnV0dG9uLnJlY3QuaGVpZ2h0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGV0ZXJtaW5lV2lubmVyKGJ1dHRvbi5jaG9pY2UsIGNvbXB1dGVyQ2hvaWNlKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0ID09PSAxKSB7IC8vIFBsYXllciB3aW5zXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3JlKys7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBsYXlTb3VuZCgnd2luX3NvdW5kJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQgPT09IDApIHsgLy8gRHJhd1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBObyBjaGFuZ2UgaW4gc2NvcmUvbGl2ZXMgZm9yIGRyYXcsIGNsaWNrIHNvdW5kIGFscmVhZHkgcGxheWVkXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgeyAvLyBQbGF5ZXIgbG9zZXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGl2ZXMtLTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGxheVNvdW5kKCdsb3NlX3NvdW5kJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChsaXZlcyA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdhbWVPdmVyUmVhc29uID0gcmVzdWx0ID09PSAtMSA/IFwiXHVDNzk4XHVCQUJCXHVCNDFDIFx1QzEyMFx1RDBERFwiIDogXCJcdUJBQTlcdUMyMjhcdUM3NzQgXHVCQUE4XHVCNDUwIFx1QzE4Q1x1QzlDNFx1QjQxOFx1QzVDOFx1QzJCNVx1QjJDOFx1QjJFNC5cIjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3RvcFNvdW5kKCdnYW1lX2JnbScpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld1JvdW5kKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjsgLy8gRXhpdCBhZnRlciBoYW5kbGluZyBjbGlja1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgR2FtZVN0YXRlLkdBTUVfT1ZFUjpcclxuICAgICAgICAgICAgcmVzdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIE1haW4gZ2FtZSBsb29wXHJcbmZ1bmN0aW9uIGdhbWVMb29wKGN1cnJlbnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIGxhc3RGcmFtZVRpbWUpIC8gMTAwMDsgLy8gaW4gc2Vjb25kc1xyXG4gICAgbGFzdEZyYW1lVGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgdGltZVJlbWFpbmluZyAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRpbWVSZW1haW5pbmcgPD0gMCkge1xyXG4gICAgICAgICAgICBsaXZlcy0tO1xyXG4gICAgICAgICAgICBwbGF5U291bmQoJ2xvc2Vfc291bmQnKTsgLy8gUGxheSBzb3VuZCBmb3IgdGltZW91dFxyXG4gICAgICAgICAgICBpZiAobGl2ZXMgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgICAgICAgICAgICAgIGdhbWVPdmVyUmVhc29uID0gXCJcdUMyRENcdUFDMDQgXHVDRDA4XHVBQ0ZDXCI7XHJcbiAgICAgICAgICAgICAgICBzdG9wU291bmQoJ2dhbWVfYmdtJyk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBuZXdSb3VuZCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBFbnN1cmUgQkdNIGlzIHBsYXlpbmcgaWYgaW4gUExBWUlORyBzdGF0ZSBhbmQgbm90IGFscmVhZHkgcGxheWluZ1xyXG4gICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgIWJnbVBsYXlpbmcpIHtcclxuICAgICAgICBwbGF5U291bmQoJ2dhbWVfYmdtJywgdHJ1ZSk7XHJcbiAgICB9XHJcbiAgICAvLyBTdG9wIEJHTSBpZiBub3QgaW4gUExBWUlORyBzdGF0ZSBhbmQgaXQncyBjdXJyZW50bHkgcGxheWluZ1xyXG4gICAgaWYgKGdhbWVTdGF0ZSAhPT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgYmdtUGxheWluZykge1xyXG4gICAgICAgIHN0b3BTb3VuZCgnZ2FtZV9iZ20nKTtcclxuICAgIH1cclxuXHJcbiAgICBkcmF3KCk7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xyXG59XHJcblxyXG4vLyBJbml0aWFsaXphdGlvblxyXG5hc3luYyBmdW5jdGlvbiBpbml0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggaWQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZC5cIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG5cclxuICAgIC8vIEZldGNoIGNvbmZpZ3VyYXRpb24gZnJvbSBkYXRhLmpzb25cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uOlwiLCBlcnJvcik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGNhbnZhcy53aWR0aCA9IGNvbmZpZy5nYW1lU2V0dGluZ3MuY2FudmFzV2lkdGg7XHJcbiAgICBjYW52YXMuaGVpZ2h0ID0gY29uZmlnLmdhbWVTZXR0aW5ncy5jYW52YXNIZWlnaHQ7XHJcblxyXG4gICAgLy8gTG9hZCBhc3NldHNcclxuICAgIHRyeSB7XHJcbiAgICAgICAgYXdhaXQgbG9hZEFzc2V0cygpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGxvYWQgYXNzZXRzOlwiLCBlcnJvcik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNldCB1cCBldmVudCBsaXN0ZW5lclxyXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlTW91c2VDbGljayk7XHJcblxyXG4gICAgLy8gU3RhcnQgdGhlIGdhbWUgbG9vcFxyXG4gICAgbGFzdEZyYW1lVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcclxufVxyXG5cclxuLy8gQ2FsbCBpbml0IHdoZW4gdGhlIERPTSBpcyByZWFkeVxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgaW5pdCk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICJBQUNBLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSkMsU0FBQUE7QUFBQSxHQUFBO0FBT0wsSUFBSyxTQUFMLGtCQUFLQyxZQUFMO0FBQ0ksRUFBQUEsZ0JBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsZ0JBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsZ0JBQUEsY0FBVyxLQUFYO0FBSEMsU0FBQUE7QUFBQSxHQUFBO0FBZ0RMLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUVKLElBQUksZUFBOEMsb0JBQUksSUFBSTtBQUMxRCxJQUFJLGVBQThDLG9CQUFJLElBQUk7QUFDMUQsSUFBSSxhQUFzQztBQUMxQyxJQUFJLGFBQXNCO0FBRzFCLElBQUks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
