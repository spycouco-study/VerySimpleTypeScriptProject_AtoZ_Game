import * as THREE from "three";
import * as CANNON from "cannon-es";
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 2] = "GAME_OVER";
  return GameState2;
})(GameState || {});
const game = {
  data: null,
  assets: { textures: {}, sounds: {} },
  canvas: null,
  renderer: null,
  scene: null,
  camera: null,
  cannonWorld: null,
  snake: [],
  food: { mesh: null, body: null },
  direction: new THREE.Vector3(1, 0, 0),
  // Initial direction: East (positive X)
  nextDirection: new THREE.Vector3(1, 0, 0),
  score: 0,
  gameState: 0 /* TITLE */,
  lastUpdateTime: 0,
  timeSinceLastMove: 0,
  moveInterval: 0,
  // Will be calculated from snakeSpeed
  uiElements: {
    titleScreen: null,
    scoreDisplay: null,
    gameOverScreen: null
  },
  bgm: null,
  wallBodies: []
};
async function loadGameData() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`Failed to load data.json: ${response.statusText}`);
    }
    game.data = await response.json();
    console.log("Game data loaded:", game.data);
  } catch (error) {
    console.error("Error loading game data:", error);
    alert("Failed to load game configuration. Please check data.json.");
  }
}
async function preloadAssets() {
  if (!game.data) return;
  const textureLoader = new THREE.TextureLoader();
  const audioPromises = [];
  const texturePromises = [];
  const requiredTextures = ["snake_head", "snake_body", "food", "wall_texture"];
  for (const name of requiredTextures) {
    if (!game.data.assets.images.some((img) => img.name === name)) {
      console.warn(`Texture '${name}' not found in data.json. Using a placeholder.`);
      game.assets.textures[name] = new THREE.Color(8947848);
    }
  }
  for (const img of game.data.assets.images) {
    texturePromises.push(new Promise((resolve) => {
      textureLoader.load(
        img.path,
        (texture) => {
          game.assets.textures[img.name] = texture;
          resolve();
        },
        void 0,
        (error) => {
          console.error(`Error loading texture ${img.name} from ${img.path}:`, error);
          game.assets.textures[img.name] = new THREE.Color(8947848);
          resolve();
        }
      );
    }));
  }
  const requiredSounds = ["eat_food", "game_over", "bgm", "start_game"];
  for (const name of requiredSounds) {
    if (!game.data.assets.sounds.some((s) => s.name === name)) {
      console.warn(`Sound '${name}' not found in data.json. Will not play.`);
    }
  }
  for (const sound of game.data.assets.sounds) {
    audioPromises.push(new Promise((resolve) => {
      const audio = new Audio(sound.path);
      audio.volume = sound.volume;
      audio.load();
      audio.oncanplaythrough = () => {
        game.assets.sounds[sound.name] = audio;
        resolve();
      };
      audio.onerror = (e) => {
        console.error(`Error loading sound ${sound.name} from ${sound.path}:`, e);
        resolve();
      };
    }));
  }
  try {
    await Promise.all([...texturePromises, ...audioPromises]);
    console.log("All assets preloaded (or fallen back to placeholders).");
  } catch (error) {
    console.error("Unexpected error during asset preloading:", error);
  }
}
function setupUI() {
  if (!game.data || !game.canvas) return;
  const body = document.body;
  body.style.margin = "0";
  body.style.overflow = "hidden";
  const titleScreen = document.createElement("div");
  titleScreen.id = "titleScreen";
  Object.assign(titleScreen.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    backgroundColor: `rgba(0, 0, 0, 0.7)`,
    color: game.data.colors.titleText,
    fontFamily: "Arial, sans-serif",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    zIndex: "100",
    fontSize: "48px",
    textAlign: "center"
  });
  titleScreen.innerHTML = `
        <h1>3D Snake Game</h1>
        <p style="font-size: 24px;">Press SPACE to Start</p>
        <p style="font-size: 18px;">Use Arrow Keys to Move</p>
    `;
  body.appendChild(titleScreen);
  game.uiElements.titleScreen = titleScreen;
  const scoreDisplay = document.createElement("div");
  scoreDisplay.id = "scoreDisplay";
  Object.assign(scoreDisplay.style, {
    position: "absolute",
    top: "10px",
    left: "10px",
    color: game.data.colors.scoreText,
    fontFamily: "Arial, sans-serif",
    fontSize: "24px",
    zIndex: "101",
    display: "none"
    // Hidden initially
  });
  scoreDisplay.innerText = `Score: 0`;
  body.appendChild(scoreDisplay);
  game.uiElements.scoreDisplay = scoreDisplay;
  const gameOverScreen = document.createElement("div");
  gameOverScreen.id = "gameOverScreen";
  Object.assign(gameOverScreen.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    backgroundColor: `rgba(0, 0, 0, 0.7)`,
    color: game.data.colors.gameOverText,
    fontFamily: "Arial, sans-serif",
    display: "none",
    // Hidden initially
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    zIndex: "102",
    fontSize: "48px",
    textAlign: "center"
  });
  gameOverScreen.innerHTML = `
        <h1>GAME OVER!</h1>
        <p style="font-size: 36px;" id="finalScore">Score: 0</p>
        <p style="font-size: 24px;">Press SPACE to Restart</p>
    `;
  body.appendChild(gameOverScreen);
  game.uiElements.gameOverScreen = gameOverScreen;
}
function createGameWorld() {
  if (!game.data || !game.canvas) return;
  game.scene = new THREE.Scene();
  game.scene.background = new THREE.Color(game.data.colors.background);
  game.camera = new THREE.PerspectiveCamera(
    game.data.cameraFOV,
    game.data.canvasWidth / game.data.canvasHeight,
    game.data.cameraNear,
    game.data.cameraFar
  );
  game.camera.position.set(
    game.data.cameraPosition.x,
    game.data.cameraPosition.y,
    game.data.cameraPosition.z
  );
  game.camera.lookAt(0, 0, 0);
  game.renderer = new THREE.WebGLRenderer({ canvas: game.canvas, antialias: true });
  game.renderer.setSize(game.data.canvasWidth, game.data.canvasHeight);
  game.renderer.shadowMap.enabled = true;
  const ambientLight = new THREE.AmbientLight(4210752);
  game.scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(16777215, 1);
  directionalLight.position.set(game.data.lightPosition.x, game.data.lightPosition.y, game.data.lightPosition.z);
  directionalLight.castShadow = true;
  game.scene.add(directionalLight);
  game.cannonWorld = new CANNON.World();
  game.cannonWorld.gravity.set(0, 0, 0);
  game.cannonWorld.defaultContactMaterial.friction = 0;
  game.cannonWorld.defaultContactMaterial.restitution = 0;
  const worldSize = game.data.gridSize * 20;
  const halfWorldSize = worldSize / 2;
  const wallThickness = game.data.wallThickness;
  const wallHeight = game.data.gridSize;
  const wallTexture = game.assets.textures["wall_texture"];
  const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture instanceof THREE.Texture ? wallTexture : void 0, color: wallTexture instanceof THREE.Color ? wallTexture : void 0 });
  createWall(0, 0, -halfWorldSize - wallThickness / 2, worldSize + wallThickness * 2, wallHeight, wallThickness, wallMaterial, "wall_z_neg");
  createWall(0, 0, halfWorldSize + wallThickness / 2, worldSize + wallThickness * 2, wallHeight, wallThickness, wallMaterial, "wall_z_pos");
  createWall(-halfWorldSize - wallThickness / 2, 0, 0, wallThickness, wallHeight, worldSize + wallThickness * 2, wallMaterial, "wall_x_neg");
  createWall(halfWorldSize + wallThickness / 2, 0, 0, wallThickness, wallHeight, worldSize + wallThickness * 2, wallMaterial, "wall_x_pos");
  game.moveInterval = 1e3 / game.data.snakeSpeed;
  game.direction = new THREE.Vector3(1, 0, 0);
  game.nextDirection = new THREE.Vector3(1, 0, 0);
}
function createWall(x, y, z, width, height, depth, material, name) {
  if (!game.scene || !game.cannonWorld) return;
  const wallGeometry = new THREE.BoxGeometry(width, height, depth);
  const wallMesh = new THREE.Mesh(wallGeometry, material);
  wallMesh.position.set(x, y, z);
  wallMesh.receiveShadow = true;
  game.scene.add(wallMesh);
  const wallShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
  const wallBody = new CANNON.Body({ mass: 0 });
  wallBody.addShape(wallShape);
  wallBody.position.set(x, y, z);
  game.cannonWorld.addBody(wallBody);
  game.wallBodies.push(wallBody);
}
function createSnakeSegment(position, isHead) {
  if (!game.data || !game.scene || !game.cannonWorld) {
    throw new Error("Game not initialized for creating snake segments.");
  }
  const size = game.data.gridSize;
  const texture = isHead ? game.assets.textures["snake_head"] : game.assets.textures["snake_body"];
  const material = new THREE.MeshLambertMaterial({ map: texture instanceof THREE.Texture ? texture : void 0, color: texture instanceof THREE.Color ? texture : void 0 });
  const geometry = new THREE.BoxGeometry(size, size, size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  game.scene.add(mesh);
  const shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
  const body = new CANNON.Body({ mass: 1 });
  body.addShape(shape);
  body.position.copy(new CANNON.Vec3(position.x, position.y, position.z));
  game.cannonWorld.addBody(body);
  return { mesh, body };
}
function generateFood() {
  if (!game.data || !game.scene || !game.cannonWorld) return;
  if (game.food.mesh) {
    game.scene.remove(game.food.mesh);
    game.food.mesh.geometry.dispose();
    game.food.mesh.material.dispose();
    game.food.mesh = null;
  }
  if (game.food.body) {
    game.cannonWorld.removeBody(game.food.body);
    game.food.body = null;
  }
  const worldSize = game.data.gridSize * 20;
  const halfWorldSize = worldSize / 2;
  const size = game.data.gridSize;
  let foodPosition;
  let collisionWithSnake;
  do {
    collisionWithSnake = false;
    const numCells = 20;
    const randX = Math.floor(Math.random() * numCells) - numCells / 2;
    const randZ = Math.floor(Math.random() * numCells) - numCells / 2;
    foodPosition = new THREE.Vector3(
      randX * size + size / 2,
      // Center of the grid cell
      0,
      // Food at y=0, same level as snake
      randZ * size + size / 2
    );
    for (const segment of game.snake) {
      if (segment.mesh.position.distanceTo(foodPosition) < size * 0.9) {
        collisionWithSnake = true;
        break;
      }
    }
  } while (collisionWithSnake);
  const texture = game.assets.textures["food"];
  const material = new THREE.MeshLambertMaterial({ map: texture instanceof THREE.Texture ? texture : void 0, color: texture instanceof THREE.Color ? texture : void 0 });
  const geometry = new THREE.SphereGeometry(size / 2, 16, 16);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(foodPosition);
  mesh.castShadow = true;
  game.scene.add(mesh);
  game.food.mesh = mesh;
  const shape = new CANNON.Sphere(size / 2);
  const body = new CANNON.Body({ mass: 0.1 });
  body.addShape(shape);
  body.position.copy(new CANNON.Vec3(foodPosition.x, foodPosition.y, foodPosition.z));
  game.cannonWorld.addBody(body);
  game.food.body = body;
}
function playSound(name) {
  const sound = game.assets.sounds[name];
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch((e) => console.warn(`Failed to play sound ${name}:`, e));
  } else {
    console.warn(`Sound '${name}' not found.`);
  }
}
function updateScoreUI() {
  if (game.uiElements.scoreDisplay) {
    game.uiElements.scoreDisplay.innerText = `Score: ${game.score}`;
  }
}
function resetGame() {
  if (!game.data || !game.scene || !game.cannonWorld) return;
  game.snake.forEach((segment) => {
    game.scene?.remove(segment.mesh);
    segment.mesh.geometry.dispose();
    segment.mesh.material.dispose();
    game.cannonWorld?.removeBody(segment.body);
  });
  game.snake = [];
  if (game.food.mesh) {
    game.scene.remove(game.food.mesh);
    game.food.mesh.geometry.dispose();
    game.food.mesh.material.dispose();
    game.food.mesh = null;
  }
  if (game.food.body) {
    game.cannonWorld.removeBody(game.food.body);
    game.food.body = null;
  }
  const initialPos = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < game.data.initialSnakeLength; i++) {
    const segmentPos = new THREE.Vector3(
      initialPos.x - i * game.data.gridSize,
      initialPos.y,
      initialPos.z
    );
    game.snake.push(createSnakeSegment(segmentPos, i === 0));
  }
  game.direction.set(1, 0, 0);
  game.nextDirection.set(1, 0, 0);
  game.score = 0;
  updateScoreUI();
  generateFood();
}
function startGame() {
  if (!game.data) return;
  game.gameState = 1 /* PLAYING */;
  if (game.uiElements.titleScreen) game.uiElements.titleScreen.style.display = "none";
  if (game.uiElements.gameOverScreen) game.uiElements.gameOverScreen.style.display = "none";
  if (game.uiElements.scoreDisplay) game.uiElements.scoreDisplay.style.display = "block";
  resetGame();
  if (game.assets.sounds["bgm"] && !game.bgm) {
    game.bgm = game.assets.sounds["bgm"];
    game.bgm.loop = true;
    game.bgm.play().catch((e) => console.warn("Failed to play BGM:", e));
  } else if (game.bgm) {
    game.bgm.play().catch((e) => console.warn("Failed to play BGM:", e));
  }
  playSound("start_game");
}
function gameOver() {
  game.gameState = 2 /* GAME_OVER */;
  if (game.bgm) {
    game.bgm.pause();
  }
  playSound("game_over");
  if (game.uiElements.scoreDisplay) game.uiElements.scoreDisplay.style.display = "none";
  if (game.uiElements.gameOverScreen) game.uiElements.gameOverScreen.style.display = "flex";
  const finalScoreElement = document.getElementById("finalScore");
  if (finalScoreElement) {
    finalScoreElement.innerText = `Score: ${game.score}`;
  }
}
function handleInput(event) {
  if (!game.data) return;
  const currentDir = game.direction;
  let newDir = new THREE.Vector3();
  switch (event.key) {
    case "ArrowUp":
      newDir.set(0, 0, -1);
      break;
    case "ArrowDown":
      newDir.set(0, 0, 1);
      break;
    case "ArrowLeft":
      newDir.set(-1, 0, 0);
      break;
    case "ArrowRight":
      newDir.set(1, 0, 0);
      break;
    case " ":
      if (game.gameState === 0 /* TITLE */ || game.gameState === 2 /* GAME_OVER */) {
        event.preventDefault();
        startGame();
      }
      return;
    // Don't process space as a direction change
    default:
      return;
  }
  if (!newDir.equals(currentDir.clone().negate())) {
    game.nextDirection.copy(newDir);
  }
}
function update(deltaTime) {
  if (!game.data || game.gameState !== 1 /* PLAYING */) return;
  game.timeSinceLastMove += deltaTime;
  if (game.timeSinceLastMove >= game.moveInterval / 1e3) {
    game.timeSinceLastMove -= game.moveInterval / 1e3;
    game.direction.copy(game.nextDirection);
    const oldHeadPosition = game.snake[0].mesh.position.clone();
    const head = game.snake[0];
    const newHeadPosition = head.mesh.position.clone().add(game.direction.clone().multiplyScalar(game.data.gridSize));
    const worldSize = game.data.gridSize * 20;
    const halfWorldSize = worldSize / 2;
    const maxCoord = halfWorldSize - game.data.gridSize / 2;
    const minCoord = -halfWorldSize + game.data.gridSize / 2;
    if (newHeadPosition.x > maxCoord || newHeadPosition.x < minCoord || newHeadPosition.z > maxCoord || newHeadPosition.z < minCoord) {
      gameOver();
      return;
    }
    for (let i = 1; i < game.snake.length; i++) {
      if (newHeadPosition.distanceTo(game.snake[i].mesh.position) < game.data.gridSize * 0.9) {
        gameOver();
        return;
      }
    }
    for (let i = game.snake.length - 1; i > 0; i--) {
      game.snake[i].mesh.position.copy(game.snake[i - 1].mesh.position);
      game.snake[i].body.position.copy(new CANNON.Vec3(game.snake[i - 1].mesh.position.x, game.snake[i - 1].mesh.position.y, game.snake[i - 1].mesh.position.z));
    }
    head.mesh.position.copy(newHeadPosition);
    head.body.position.copy(new CANNON.Vec3(newHeadPosition.x, newHeadPosition.y, newHeadPosition.z));
    if (game.food.mesh && newHeadPosition.distanceTo(game.food.mesh.position) < game.data.gridSize * 0.9) {
      playSound("eat_food");
      game.score++;
      updateScoreUI();
      const lastSegmentCurrentPos = game.snake[game.snake.length - 1].mesh.position.clone();
      game.snake.push(createSnakeSegment(lastSegmentCurrentPos, false));
      generateFood();
    }
  }
  if (game.cannonWorld) {
    const fixedTimeStep = 1 / 60;
    game.cannonWorld.step(fixedTimeStep, deltaTime, 3);
  }
}
function render() {
  if (game.renderer && game.scene && game.camera) {
    game.renderer.render(game.scene, game.camera);
  }
}
function gameLoop(currentTime) {
  const deltaTime = (currentTime - game.lastUpdateTime) / 1e3;
  game.lastUpdateTime = currentTime;
  update(deltaTime);
  render();
  requestAnimationFrame(gameLoop);
}
document.addEventListener("DOMContentLoaded", async () => {
  game.canvas = document.getElementById("gameCanvas");
  if (!game.canvas) {
    console.error("Canvas element with ID 'gameCanvas' not found.");
    return;
  }
  await loadGameData();
  if (!game.data) {
    return;
  }
  setupUI();
  await preloadAssets();
  createGameWorld();
  window.addEventListener("keydown", handleInput);
  game.gameState = 0 /* TITLE */;
  if (game.uiElements.titleScreen) game.uiElements.titleScreen.style.display = "flex";
  if (game.uiElements.scoreDisplay) game.uiElements.scoreDisplay.style.display = "none";
  if (game.uiElements.gameOverScreen) game.uiElements.gameOverScreen.style.display = "none";
  game.lastUpdateTime = performance.now();
  requestAnimationFrame(gameLoop);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIC0tLSBHbG9iYWwgR2FtZSBTdGF0ZSBhbmQgQ29uZmlndXJhdGlvbiAtLS1cclxuaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcclxuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xyXG4gICAgZ3JpZFNpemU6IG51bWJlcjsgLy8gU2l6ZSBvZiBlYWNoIGdyaWQgY2VsbCBpbiB3b3JsZCB1bml0c1xyXG4gICAgc25ha2VTcGVlZDogbnVtYmVyOyAvLyBIb3cgbWFueSBncmlkIGNlbGxzIHBlciBzZWNvbmQgdGhlIHNuYWtlIG1vdmVzXHJcbiAgICBpbml0aWFsU25ha2VMZW5ndGg6IG51bWJlcjtcclxuICAgIHdhbGxUaGlja25lc3M6IG51bWJlcjsgLy8gVGhpY2tuZXNzIG9mIHRoZSB3YWxscyBpbiB3b3JsZCB1bml0c1xyXG4gICAgY2FtZXJhRk9WOiBudW1iZXI7XHJcbiAgICBjYW1lcmFOZWFyOiBudW1iZXI7XHJcbiAgICBjYW1lcmFGYXI6IG51bWJlcjtcclxuICAgIGNhbWVyYVBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IH07XHJcbiAgICBsaWdodFBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IH07XHJcbiAgICBjb2xvcnM6IHtcclxuICAgICAgICBiYWNrZ3JvdW5kOiBudW1iZXI7XHJcbiAgICAgICAgdGl0bGVUZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgc2NvcmVUZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XHJcbiAgICB9XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9PjtcclxuICAgICAgICBzb3VuZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjsgdm9sdW1lOiBudW1iZXI7IH0+O1xyXG4gICAgfTtcclxufVxyXG5cclxuaW50ZXJmYWNlIExvYWRlZEFzc2V0cyB7XHJcbiAgICB0ZXh0dXJlczogeyBba2V5OiBzdHJpbmddOiBUSFJFRS5UZXh0dXJlIHwgVEhSRUUuQ29sb3IgfTtcclxuICAgIHNvdW5kczogeyBba2V5OiBzdHJpbmddOiBIVE1MQXVkaW9FbGVtZW50IH07XHJcbn1cclxuXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUixcclxufVxyXG5cclxuY29uc3QgZ2FtZToge1xyXG4gICAgZGF0YTogR2FtZUNvbmZpZyB8IG51bGw7XHJcbiAgICBhc3NldHM6IExvYWRlZEFzc2V0cztcclxuICAgIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xyXG4gICAgcmVuZGVyZXI6IFRIUkVFLldlYkdMUmVuZGVyZXIgfCBudWxsO1xyXG4gICAgc2NlbmU6IFRIUkVFLlNjZW5lIHwgbnVsbDtcclxuICAgIGNhbWVyYTogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEgfCBudWxsO1xyXG4gICAgY2Fubm9uV29ybGQ6IENBTk5PTi5Xb3JsZCB8IG51bGw7XHJcbiAgICBzbmFrZTogeyBtZXNoOiBUSFJFRS5NZXNoOyBib2R5OiBDQU5OT04uQm9keTsgfVtdO1xyXG4gICAgZm9vZDogeyBtZXNoOiBUSFJFRS5NZXNoIHwgbnVsbDsgYm9keTogQ0FOTk9OLkJvZHkgfCBudWxsOyB9O1xyXG4gICAgZGlyZWN0aW9uOiBUSFJFRS5WZWN0b3IzO1xyXG4gICAgbmV4dERpcmVjdGlvbjogVEhSRUUuVmVjdG9yMztcclxuICAgIHNjb3JlOiBudW1iZXI7XHJcbiAgICBnYW1lU3RhdGU6IEdhbWVTdGF0ZTtcclxuICAgIGxhc3RVcGRhdGVUaW1lOiBudW1iZXI7XHJcbiAgICB0aW1lU2luY2VMYXN0TW92ZTogbnVtYmVyO1xyXG4gICAgbW92ZUludGVydmFsOiBudW1iZXI7IC8vIFRpbWUgaW4gbXMgYmV0d2VlbiBzbmFrZSBtb3Zlc1xyXG4gICAgdWlFbGVtZW50czoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuOiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XHJcbiAgICAgICAgc2NvcmVEaXNwbGF5OiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XHJcbiAgICAgICAgZ2FtZU92ZXJTY3JlZW46IEhUTUxEaXZFbGVtZW50IHwgbnVsbDtcclxuICAgIH07XHJcbiAgICBiZ206IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsO1xyXG4gICAgd2FsbEJvZGllczogQ0FOTk9OLkJvZHlbXTsgLy8gVG8gaG9sZCByZWZlcmVuY2VzIHRvIGNhbm5vbiB3YWxsIGJvZGllc1xyXG59ID0ge1xyXG4gICAgZGF0YTogbnVsbCxcclxuICAgIGFzc2V0czogeyB0ZXh0dXJlczoge30sIHNvdW5kczoge30gfSxcclxuICAgIGNhbnZhczogbnVsbCxcclxuICAgIHJlbmRlcmVyOiBudWxsLFxyXG4gICAgc2NlbmU6IG51bGwsXHJcbiAgICBjYW1lcmE6IG51bGwsXHJcbiAgICBjYW5ub25Xb3JsZDogbnVsbCxcclxuICAgIHNuYWtlOiBbXSxcclxuICAgIGZvb2Q6IHsgbWVzaDogbnVsbCwgYm9keTogbnVsbCB9LFxyXG4gICAgZGlyZWN0aW9uOiBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKSwgLy8gSW5pdGlhbCBkaXJlY3Rpb246IEVhc3QgKHBvc2l0aXZlIFgpXHJcbiAgICBuZXh0RGlyZWN0aW9uOiBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKSxcclxuICAgIHNjb3JlOiAwLFxyXG4gICAgZ2FtZVN0YXRlOiBHYW1lU3RhdGUuVElUTEUsXHJcbiAgICBsYXN0VXBkYXRlVGltZTogMCxcclxuICAgIHRpbWVTaW5jZUxhc3RNb3ZlOiAwLFxyXG4gICAgbW92ZUludGVydmFsOiAwLCAvLyBXaWxsIGJlIGNhbGN1bGF0ZWQgZnJvbSBzbmFrZVNwZWVkXHJcbiAgICB1aUVsZW1lbnRzOiB7XHJcbiAgICAgICAgdGl0bGVTY3JlZW46IG51bGwsXHJcbiAgICAgICAgc2NvcmVEaXNwbGF5OiBudWxsLFxyXG4gICAgICAgIGdhbWVPdmVyU2NyZWVuOiBudWxsLFxyXG4gICAgfSxcclxuICAgIGJnbTogbnVsbCxcclxuICAgIHdhbGxCb2RpZXM6IFtdLFxyXG59O1xyXG5cclxuLy8gLS0tIEdhbWUgSW5pdGlhbGl6YXRpb24gLS0tXHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gbG9hZCBkYXRhLmpzb246ICR7cmVzcG9uc2Uuc3RhdHVzVGV4dH1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZ2FtZS5kYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIEdhbWVDb25maWc7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJHYW1lIGRhdGEgbG9hZGVkOlwiLCBnYW1lLmRhdGEpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBnYW1lIGRhdGE6XCIsIGVycm9yKTtcclxuICAgICAgICBhbGVydChcIkZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gUGxlYXNlIGNoZWNrIGRhdGEuanNvbi5cIik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHByZWxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAoIWdhbWUuZGF0YSkgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgY29uc3QgYXVkaW9Qcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XHJcbiAgICBjb25zdCB0ZXh0dXJlUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xyXG5cclxuICAgIC8vIEFkZCBwbGFjZWhvbGRlciB0ZXh0dXJlcyBpZiBhY3R1YWwgYXNzZXRzIGFyZSBub3QgZm91bmQgaW4gZGF0YS5qc29uXHJcbiAgICAvLyBUaGlzIGFsbG93cyB0aGUgZ2FtZSB0byBydW4gZXZlbiBpZiBzb21lIGFzc2V0cyBhcmUgbWlzc2luZy5cclxuICAgIC8vIEVuc3VyZSBhbGwgY3JpdGljYWwgdGV4dHVyZSBuYW1lcyBhcmUgcHJlc2VudCBpbiBhc3NldHMudGV4dHVyZXNcclxuICAgIGNvbnN0IHJlcXVpcmVkVGV4dHVyZXMgPSBbJ3NuYWtlX2hlYWQnLCAnc25ha2VfYm9keScsICdmb29kJywgJ3dhbGxfdGV4dHVyZSddO1xyXG4gICAgZm9yKGNvbnN0IG5hbWUgb2YgcmVxdWlyZWRUZXh0dXJlcykge1xyXG4gICAgICAgIGlmICghZ2FtZS5kYXRhLmFzc2V0cy5pbWFnZXMuc29tZShpbWcgPT4gaW1nLm5hbWUgPT09IG5hbWUpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgVGV4dHVyZSAnJHtuYW1lfScgbm90IGZvdW5kIGluIGRhdGEuanNvbi4gVXNpbmcgYSBwbGFjZWhvbGRlci5gKTtcclxuICAgICAgICAgICAgZ2FtZS5hc3NldHMudGV4dHVyZXNbbmFtZV0gPSBuZXcgVEhSRUUuQ29sb3IoMHg4ODg4ODgpOyAvLyBEZWZhdWx0IGNvbG9yXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBmb3IgKGNvbnN0IGltZyBvZiBnYW1lLmRhdGEuYXNzZXRzLmltYWdlcykge1xyXG4gICAgICAgIHRleHR1cmVQcm9taXNlcy5wdXNoKG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7IC8vIENoYW5nZWQgdG8gcmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIG5vdCBibG9jayBnYW1lXHJcbiAgICAgICAgICAgIHRleHR1cmVMb2FkZXIubG9hZChcclxuICAgICAgICAgICAgICAgIGltZy5wYXRoLFxyXG4gICAgICAgICAgICAgICAgKHRleHR1cmUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tpbWcubmFtZV0gPSB0ZXh0dXJlO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgICAgICAoZXJyb3IpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIHRleHR1cmUgJHtpbWcubmFtZX0gZnJvbSAke2ltZy5wYXRofTpgLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgZ2FtZS5hc3NldHMudGV4dHVyZXNbaW1nLm5hbWVdID0gbmV3IFRIUkVFLkNvbG9yKDB4ODg4ODg4KTsgLy8gRmFsbGJhY2sgdG8gY29sb3JcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgZXZlbiBvbiBlcnJvciB0byBhbGxvdyBnYW1lIHRvIGNvbnRpbnVlXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEVuc3VyZSBhbGwgY3JpdGljYWwgc291bmQgbmFtZXMgYXJlIHByZXNlbnQgaW4gYXNzZXRzLnNvdW5kc1xyXG4gICAgY29uc3QgcmVxdWlyZWRTb3VuZHMgPSBbJ2VhdF9mb29kJywgJ2dhbWVfb3ZlcicsICdiZ20nLCAnc3RhcnRfZ2FtZSddO1xyXG4gICAgZm9yKGNvbnN0IG5hbWUgb2YgcmVxdWlyZWRTb3VuZHMpIHtcclxuICAgICAgICBpZiAoIWdhbWUuZGF0YS5hc3NldHMuc291bmRzLnNvbWUocyA9PiBzLm5hbWUgPT09IG5hbWUpKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7bmFtZX0nIG5vdCBmb3VuZCBpbiBkYXRhLmpzb24uIFdpbGwgbm90IHBsYXkuYCk7XHJcbiAgICAgICAgICAgIC8vIE5vIGRlZmF1bHQgc291bmQsIGp1c3Qgd29uJ3QgYmUgaW4gZ2FtZS5hc3NldHMuc291bmRzXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZvciAoY29uc3Qgc291bmQgb2YgZ2FtZS5kYXRhLmFzc2V0cy5zb3VuZHMpIHtcclxuICAgICAgICBhdWRpb1Byb21pc2VzLnB1c2gobmV3IFByb21pc2UoKHJlc29sdmUpID0+IHsgLy8gQ2hhbmdlZCB0byByZXNvbHZlIGV2ZW4gb24gZXJyb3JcclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XHJcbiAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgYXVkaW8ubG9hZCgpOyAvLyBQcmVsb2FkIHRoZSBhdWRpb1xyXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgZ2FtZS5hc3NldHMuc291bmRzW3NvdW5kLm5hbWVdID0gYXVkaW87XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgbG9hZGluZyBzb3VuZCAke3NvdW5kLm5hbWV9IGZyb20gJHtzb3VuZC5wYXRofTpgLCBlKTtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIGFsbG93IGdhbWUgdG8gY29udGludWVcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4udGV4dHVyZVByb21pc2VzLCAuLi5hdWRpb1Byb21pc2VzXSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJBbGwgYXNzZXRzIHByZWxvYWRlZCAob3IgZmFsbGVuIGJhY2sgdG8gcGxhY2Vob2xkZXJzKS5cIik7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJVbmV4cGVjdGVkIGVycm9yIGR1cmluZyBhc3NldCBwcmVsb2FkaW5nOlwiLCBlcnJvcik7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwVUkoKTogdm9pZCB7XHJcbiAgICBpZiAoIWdhbWUuZGF0YSB8fCAhZ2FtZS5jYW52YXMpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBib2R5ID0gZG9jdW1lbnQuYm9keTtcclxuICAgIGJvZHkuc3R5bGUubWFyZ2luID0gJzAnO1xyXG4gICAgYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xyXG5cclxuICAgIC8vIFRpdGxlIFNjcmVlblxyXG4gICAgY29uc3QgdGl0bGVTY3JlZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgIHRpdGxlU2NyZWVuLmlkID0gJ3RpdGxlU2NyZWVuJztcclxuICAgIE9iamVjdC5hc3NpZ24odGl0bGVTY3JlZW4uc3R5bGUsIHtcclxuICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICB0b3A6ICcwJyxcclxuICAgICAgICBsZWZ0OiAnMCcsXHJcbiAgICAgICAgd2lkdGg6ICcxMDAlJyxcclxuICAgICAgICBoZWlnaHQ6ICcxMDAlJyxcclxuICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6IGByZ2JhKDAsIDAsIDAsIDAuNylgLFxyXG4gICAgICAgIGNvbG9yOiBnYW1lLmRhdGEuY29sb3JzLnRpdGxlVGV4dCxcclxuICAgICAgICBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxyXG4gICAgICAgIGRpc3BsYXk6ICdmbGV4JyxcclxuICAgICAgICBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcclxuICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsXHJcbiAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXHJcbiAgICAgICAgekluZGV4OiAnMTAwJyxcclxuICAgICAgICBmb250U2l6ZTogJzQ4cHgnLFxyXG4gICAgICAgIHRleHRBbGlnbjogJ2NlbnRlcicsXHJcbiAgICB9KTtcclxuICAgIHRpdGxlU2NyZWVuLmlubmVySFRNTCA9IGBcclxuICAgICAgICA8aDE+M0QgU25ha2UgR2FtZTwvaDE+XHJcbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDI0cHg7XCI+UHJlc3MgU1BBQ0UgdG8gU3RhcnQ8L3A+XHJcbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDE4cHg7XCI+VXNlIEFycm93IEtleXMgdG8gTW92ZTwvcD5cclxuICAgIGA7XHJcbiAgICBib2R5LmFwcGVuZENoaWxkKHRpdGxlU2NyZWVuKTtcclxuICAgIGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbiA9IHRpdGxlU2NyZWVuO1xyXG5cclxuICAgIC8vIFNjb3JlIERpc3BsYXlcclxuICAgIGNvbnN0IHNjb3JlRGlzcGxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgc2NvcmVEaXNwbGF5LmlkID0gJ3Njb3JlRGlzcGxheSc7XHJcbiAgICBPYmplY3QuYXNzaWduKHNjb3JlRGlzcGxheS5zdHlsZSwge1xyXG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgIHRvcDogJzEwcHgnLFxyXG4gICAgICAgIGxlZnQ6ICcxMHB4JyxcclxuICAgICAgICBjb2xvcjogZ2FtZS5kYXRhLmNvbG9ycy5zY29yZVRleHQsXHJcbiAgICAgICAgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcclxuICAgICAgICBmb250U2l6ZTogJzI0cHgnLFxyXG4gICAgICAgIHpJbmRleDogJzEwMScsXHJcbiAgICAgICAgZGlzcGxheTogJ25vbmUnLCAvLyBIaWRkZW4gaW5pdGlhbGx5XHJcbiAgICB9KTtcclxuICAgIHNjb3JlRGlzcGxheS5pbm5lclRleHQgPSBgU2NvcmU6IDBgO1xyXG4gICAgYm9keS5hcHBlbmRDaGlsZChzY29yZURpc3BsYXkpO1xyXG4gICAgZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSA9IHNjb3JlRGlzcGxheTtcclxuXHJcbiAgICAvLyBHYW1lIE92ZXIgU2NyZWVuXHJcbiAgICBjb25zdCBnYW1lT3ZlclNjcmVlbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgZ2FtZU92ZXJTY3JlZW4uaWQgPSAnZ2FtZU92ZXJTY3JlZW4nO1xyXG4gICAgT2JqZWN0LmFzc2lnbihnYW1lT3ZlclNjcmVlbi5zdHlsZSwge1xyXG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgIHRvcDogJzAnLFxyXG4gICAgICAgIGxlZnQ6ICcwJyxcclxuICAgICAgICB3aWR0aDogJzEwMCUnLFxyXG4gICAgICAgIGhlaWdodDogJzEwMCUnLFxyXG4gICAgICAgIGJhY2tncm91bmRDb2xvcjogYHJnYmEoMCwgMCwgMCwgMC43KWAsXHJcbiAgICAgICAgY29sb3I6IGdhbWUuZGF0YS5jb2xvcnMuZ2FtZU92ZXJUZXh0LFxyXG4gICAgICAgIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXHJcbiAgICAgICAgZGlzcGxheTogJ25vbmUnLCAvLyBIaWRkZW4gaW5pdGlhbGx5XHJcbiAgICAgICAgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXHJcbiAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxyXG4gICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxyXG4gICAgICAgIHpJbmRleDogJzEwMicsXHJcbiAgICAgICAgZm9udFNpemU6ICc0OHB4JyxcclxuICAgICAgICB0ZXh0QWxpZ246ICdjZW50ZXInLFxyXG4gICAgfSk7XHJcbiAgICBnYW1lT3ZlclNjcmVlbi5pbm5lckhUTUwgPSBgXHJcbiAgICAgICAgPGgxPkdBTUUgT1ZFUiE8L2gxPlxyXG4gICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAzNnB4O1wiIGlkPVwiZmluYWxTY29yZVwiPlNjb3JlOiAwPC9wPlxyXG4gICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAyNHB4O1wiPlByZXNzIFNQQUNFIHRvIFJlc3RhcnQ8L3A+XHJcbiAgICBgO1xyXG4gICAgYm9keS5hcHBlbmRDaGlsZChnYW1lT3ZlclNjcmVlbik7XHJcbiAgICBnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4gPSBnYW1lT3ZlclNjcmVlbjtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlR2FtZVdvcmxkKCk6IHZvaWQge1xyXG4gICAgaWYgKCFnYW1lLmRhdGEgfHwgIWdhbWUuY2FudmFzKSByZXR1cm47XHJcblxyXG4gICAgLy8gVGhyZWUuanMgc2V0dXBcclxuICAgIGdhbWUuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuICAgIGdhbWUuc2NlbmUuYmFja2dyb3VuZCA9IG5ldyBUSFJFRS5Db2xvcihnYW1lLmRhdGEuY29sb3JzLmJhY2tncm91bmQpO1xyXG5cclxuICAgIGdhbWUuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFGT1YsXHJcbiAgICAgICAgZ2FtZS5kYXRhLmNhbnZhc1dpZHRoIC8gZ2FtZS5kYXRhLmNhbnZhc0hlaWdodCxcclxuICAgICAgICBnYW1lLmRhdGEuY2FtZXJhTmVhcixcclxuICAgICAgICBnYW1lLmRhdGEuY2FtZXJhRmFyXHJcbiAgICApO1xyXG4gICAgZ2FtZS5jYW1lcmEucG9zaXRpb24uc2V0KFxyXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi54LFxyXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi55LFxyXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi56XHJcbiAgICApO1xyXG4gICAgZ2FtZS5jYW1lcmEubG9va0F0KDAsIDAsIDApOyAvLyBMb29rIGF0IHRoZSBjZW50ZXIgb2YgdGhlIGdhbWUgcGxhbmVcclxuXHJcbiAgICBnYW1lLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IGdhbWUuY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XHJcbiAgICBnYW1lLnJlbmRlcmVyLnNldFNpemUoZ2FtZS5kYXRhLmNhbnZhc1dpZHRoLCBnYW1lLmRhdGEuY2FudmFzSGVpZ2h0KTtcclxuICAgIGdhbWUucmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBpZiBkZXNpcmVkXHJcblxyXG4gICAgLy8gTGlnaHRzXHJcbiAgICBjb25zdCBhbWJpZW50TGlnaHQgPSBuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4NDA0MDQwKTsgLy8gc29mdCB3aGl0ZSBsaWdodFxyXG4gICAgZ2FtZS5zY2VuZS5hZGQoYW1iaWVudExpZ2h0KTtcclxuICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMSk7XHJcbiAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldChnYW1lLmRhdGEubGlnaHRQb3NpdGlvbi54LCBnYW1lLmRhdGEubGlnaHRQb3NpdGlvbi55LCBnYW1lLmRhdGEubGlnaHRQb3NpdGlvbi56KTtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICBnYW1lLnNjZW5lLmFkZChkaXJlY3Rpb25hbExpZ2h0KTtcclxuXHJcbiAgICAvLyBDYW5ub24uanMgc2V0dXBcclxuICAgIGdhbWUuY2Fubm9uV29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICBnYW1lLmNhbm5vbldvcmxkLmdyYXZpdHkuc2V0KDAsIDAsIDApOyAvLyBObyBncmF2aXR5IGZvciBhIHNuYWtlIGdhbWVcclxuICAgIGdhbWUuY2Fubm9uV29ybGQuZGVmYXVsdENvbnRhY3RNYXRlcmlhbC5mcmljdGlvbiA9IDA7XHJcbiAgICBnYW1lLmNhbm5vbldvcmxkLmRlZmF1bHRDb250YWN0TWF0ZXJpYWwucmVzdGl0dXRpb24gPSAwO1xyXG5cclxuICAgIC8vIENyZWF0ZSB3YWxscyAoYm91bmRhcmllcylcclxuICAgIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwOyAvLyBBc3N1bWluZyBhIDIweDIwIHBsYXlhYmxlIGdyaWRcclxuICAgIGNvbnN0IGhhbGZXb3JsZFNpemUgPSB3b3JsZFNpemUgLyAyO1xyXG4gICAgY29uc3Qgd2FsbFRoaWNrbmVzcyA9IGdhbWUuZGF0YS53YWxsVGhpY2tuZXNzO1xyXG4gICAgY29uc3Qgd2FsbEhlaWdodCA9IGdhbWUuZGF0YS5ncmlkU2l6ZTsgLy8gV2FsbHMgYXJlIGFzIHRhbGwgYXMgYSBzbmFrZSBzZWdtZW50XHJcblxyXG4gICAgLy8gTWF0ZXJpYWwgZm9yIHdhbGxzXHJcbiAgICBjb25zdCB3YWxsVGV4dHVyZSA9IGdhbWUuYXNzZXRzLnRleHR1cmVzWyd3YWxsX3RleHR1cmUnXTtcclxuICAgIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgbWFwOiB3YWxsVGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUgPyB3YWxsVGV4dHVyZSA6IHVuZGVmaW5lZCwgY29sb3I6IHdhbGxUZXh0dXJlIGluc3RhbmNlb2YgVEhSRUUuQ29sb3IgPyB3YWxsVGV4dHVyZSA6IHVuZGVmaW5lZCB9KTtcclxuICAgIFxyXG4gICAgLy8gRnJvbnQgd2FsbCAoK1opXHJcbiAgICBjcmVhdGVXYWxsKDAsIDAsIC1oYWxmV29ybGRTaXplIC0gd2FsbFRoaWNrbmVzcyAvIDIsIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLCB3YWxsSGVpZ2h0LCB3YWxsVGhpY2tuZXNzLCB3YWxsTWF0ZXJpYWwsIFwid2FsbF96X25lZ1wiKTtcclxuICAgIC8vIEJhY2sgd2FsbCAoLVopXHJcbiAgICBjcmVhdGVXYWxsKDAsIDAsIGhhbGZXb3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzIC8gMiwgd29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAqIDIsIHdhbGxIZWlnaHQsIHdhbGxUaGlja25lc3MsIHdhbGxNYXRlcmlhbCwgXCJ3YWxsX3pfcG9zXCIpO1xyXG4gICAgLy8gTGVmdCB3YWxsICgtWClcclxuICAgIGNyZWF0ZVdhbGwoLWhhbGZXb3JsZFNpemUgLSB3YWxsVGhpY2tuZXNzIC8gMiwgMCwgMCwgd2FsbFRoaWNrbmVzcywgd2FsbEhlaWdodCwgd29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAqIDIsIHdhbGxNYXRlcmlhbCwgXCJ3YWxsX3hfbmVnXCIpO1xyXG4gICAgLy8gUmlnaHQgd2FsbCAoK1gpXHJcbiAgICBjcmVhdGVXYWxsKGhhbGZXb3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzIC8gMiwgMCwgMCwgd2FsbFRoaWNrbmVzcywgd2FsbEhlaWdodCwgd29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAqIDIsIHdhbGxNYXRlcmlhbCwgXCJ3YWxsX3hfcG9zXCIpO1xyXG5cclxuICAgIC8vIEluaXRpYWwgc2V0dXAgZm9yIHRoZSBnYW1lIHN0YXRlIChiZWZvcmUgc3RhcnRpbmcpXHJcbiAgICBnYW1lLm1vdmVJbnRlcnZhbCA9IDEwMDAgLyBnYW1lLmRhdGEuc25ha2VTcGVlZDtcclxuICAgIGdhbWUuZGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoMSwgMCwgMCk7XHJcbiAgICBnYW1lLm5leHREaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlV2FsbCh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZGVwdGg6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsLCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIGlmICghZ2FtZS5zY2VuZSB8fCAhZ2FtZS5jYW5ub25Xb3JsZCkgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IHdhbGxHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSh3aWR0aCwgaGVpZ2h0LCBkZXB0aCk7XHJcbiAgICBjb25zdCB3YWxsTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHdhbGxHZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgd2FsbE1lc2gucG9zaXRpb24uc2V0KHgsIHksIHopO1xyXG4gICAgd2FsbE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcbiAgICBnYW1lLnNjZW5lLmFkZCh3YWxsTWVzaCk7XHJcblxyXG4gICAgY29uc3Qgd2FsbFNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKHdpZHRoIC8gMiwgaGVpZ2h0IC8gMiwgZGVwdGggLyAyKSk7XHJcbiAgICBjb25zdCB3YWxsQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAgfSk7IC8vIE1hc3MgMCBtYWtlcyBpdCBzdGF0aWNcclxuICAgIHdhbGxCb2R5LmFkZFNoYXBlKHdhbGxTaGFwZSk7XHJcbiAgICB3YWxsQm9keS5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XHJcbiAgICBnYW1lLmNhbm5vbldvcmxkLmFkZEJvZHkod2FsbEJvZHkpO1xyXG4gICAgZ2FtZS53YWxsQm9kaWVzLnB1c2god2FsbEJvZHkpO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gY3JlYXRlU25ha2VTZWdtZW50KHBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzLCBpc0hlYWQ6IGJvb2xlYW4pOiB7IG1lc2g6IFRIUkVFLk1lc2g7IGJvZHk6IENBTk5PTi5Cb2R5OyB9IHtcclxuICAgIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiR2FtZSBub3QgaW5pdGlhbGl6ZWQgZm9yIGNyZWF0aW5nIHNuYWtlIHNlZ21lbnRzLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzaXplID0gZ2FtZS5kYXRhLmdyaWRTaXplO1xyXG4gICAgY29uc3QgdGV4dHVyZSA9IGlzSGVhZCA/IGdhbWUuYXNzZXRzLnRleHR1cmVzWydzbmFrZV9oZWFkJ10gOiBnYW1lLmFzc2V0cy50ZXh0dXJlc1snc25ha2VfYm9keSddO1xyXG4gICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUgPyB0ZXh0dXJlIDogdW5kZWZpbmVkLCBjb2xvcjogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gdGV4dHVyZSA6IHVuZGVmaW5lZCB9KTtcclxuICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHNpemUsIHNpemUsIHNpemUpO1xyXG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcbiAgICBtZXNoLnBvc2l0aW9uLmNvcHkocG9zaXRpb24pO1xyXG4gICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgIGdhbWUuc2NlbmUuYWRkKG1lc2gpO1xyXG5cclxuICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKHNpemUgLyAyLCBzaXplIC8gMiwgc2l6ZSAvIDIpKTtcclxuICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAxIH0pOyAvLyBHaXZlIGl0IGEgbWFzcywgYnV0IHdlJ2xsIGNvbnRyb2wgaXRzIHBvc2l0aW9uXHJcbiAgICBib2R5LmFkZFNoYXBlKHNoYXBlKTtcclxuICAgIGJvZHkucG9zaXRpb24uY29weShuZXcgQ0FOTk9OLlZlYzMocG9zaXRpb24ueCwgcG9zaXRpb24ueSwgcG9zaXRpb24ueikpO1xyXG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5hZGRCb2R5KGJvZHkpO1xyXG5cclxuICAgIHJldHVybiB7IG1lc2gsIGJvZHkgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuZXJhdGVGb29kKCk6IHZvaWQge1xyXG4gICAgaWYgKCFnYW1lLmRhdGEgfHwgIWdhbWUuc2NlbmUgfHwgIWdhbWUuY2Fubm9uV29ybGQpIHJldHVybjtcclxuXHJcbiAgICAvLyBSZW1vdmUgb2xkIGZvb2QgaWYgaXQgZXhpc3RzXHJcbiAgICBpZiAoZ2FtZS5mb29kLm1lc2gpIHtcclxuICAgICAgICBnYW1lLnNjZW5lLnJlbW92ZShnYW1lLmZvb2QubWVzaCk7XHJcbiAgICAgICAgZ2FtZS5mb29kLm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xyXG4gICAgICAgIChnYW1lLmZvb2QubWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG4gICAgICAgIGdhbWUuZm9vZC5tZXNoID0gbnVsbDtcclxuICAgIH1cclxuICAgIGlmIChnYW1lLmZvb2QuYm9keSkge1xyXG4gICAgICAgIGdhbWUuY2Fubm9uV29ybGQucmVtb3ZlQm9keShnYW1lLmZvb2QuYm9keSk7XHJcbiAgICAgICAgZ2FtZS5mb29kLmJvZHkgPSBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwO1xyXG4gICAgY29uc3QgaGFsZldvcmxkU2l6ZSA9IHdvcmxkU2l6ZSAvIDI7XHJcbiAgICBjb25zdCBzaXplID0gZ2FtZS5kYXRhLmdyaWRTaXplO1xyXG4gICAgbGV0IGZvb2RQb3NpdGlvbjogVEhSRUUuVmVjdG9yMztcclxuICAgIGxldCBjb2xsaXNpb25XaXRoU25ha2U6IGJvb2xlYW47XHJcblxyXG4gICAgZG8ge1xyXG4gICAgICAgIGNvbGxpc2lvbldpdGhTbmFrZSA9IGZhbHNlO1xyXG4gICAgICAgIC8vIEdlbmVyYXRlIHJhbmRvbSBncmlkIHBvc2l0aW9uIHdpdGhpbiBib3VuZHMgKGV4Y2x1ZGluZyB3YWxsIHRoaWNrbmVzcyBhcmVhKVxyXG4gICAgICAgIGNvbnN0IG51bUNlbGxzID0gMjA7IC8vIEFzc3VtaW5nIDIweDIwIGdyaWRcclxuICAgICAgICBjb25zdCByYW5kWCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG51bUNlbGxzKSAtIG51bUNlbGxzIC8gMjsgLy8gLTEwIHRvIDlcclxuICAgICAgICBjb25zdCByYW5kWiA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG51bUNlbGxzKSAtIG51bUNlbGxzIC8gMjsgLy8gLTEwIHRvIDlcclxuXHJcbiAgICAgICAgZm9vZFBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoXHJcbiAgICAgICAgICAgIHJhbmRYICogc2l6ZSArIHNpemUgLyAyLCAvLyBDZW50ZXIgb2YgdGhlIGdyaWQgY2VsbFxyXG4gICAgICAgICAgICAwLCAvLyBGb29kIGF0IHk9MCwgc2FtZSBsZXZlbCBhcyBzbmFrZVxyXG4gICAgICAgICAgICByYW5kWiAqIHNpemUgKyBzaXplIC8gMlxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciBjb2xsaXNpb24gd2l0aCBzbmFrZVxyXG4gICAgICAgIGZvciAoY29uc3Qgc2VnbWVudCBvZiBnYW1lLnNuYWtlKSB7XHJcbiAgICAgICAgICAgIGlmIChzZWdtZW50Lm1lc2gucG9zaXRpb24uZGlzdGFuY2VUbyhmb29kUG9zaXRpb24pIDwgc2l6ZSAqIDAuOSkgeyAvLyBDaGVjayBpZiBwb3NpdGlvbnMgYXJlIHZlcnkgY2xvc2VcclxuICAgICAgICAgICAgICAgIGNvbGxpc2lvbldpdGhTbmFrZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0gd2hpbGUgKGNvbGxpc2lvbldpdGhTbmFrZSk7XHJcblxyXG5cclxuICAgIGNvbnN0IHRleHR1cmUgPSBnYW1lLmFzc2V0cy50ZXh0dXJlc1snZm9vZCddO1xyXG4gICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUgPyB0ZXh0dXJlIDogdW5kZWZpbmVkLCBjb2xvcjogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gdGV4dHVyZSA6IHVuZGVmaW5lZCB9KTtcclxuICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KHNpemUgLyAyLCAxNiwgMTYpOyAvLyBGb29kIGlzIGEgc3BoZXJlXHJcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgIG1lc2gucG9zaXRpb24uY29weShmb29kUG9zaXRpb24pO1xyXG4gICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgIGdhbWUuc2NlbmUuYWRkKG1lc2gpO1xyXG4gICAgZ2FtZS5mb29kLm1lc2ggPSBtZXNoO1xyXG5cclxuICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoc2l6ZSAvIDIpO1xyXG4gICAgY29uc3QgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAuMSB9KTsgLy8gU21hbGwgbWFzcyBzbyBpdCBjYW4gYmUgJ2VhdGVuJ1xyXG4gICAgYm9keS5hZGRTaGFwZShzaGFwZSk7XHJcbiAgICBib2R5LnBvc2l0aW9uLmNvcHkobmV3IENBTk5PTi5WZWMzKGZvb2RQb3NpdGlvbi54LCBmb29kUG9zaXRpb24ueSwgZm9vZFBvc2l0aW9uLnopKTtcclxuICAgIGdhbWUuY2Fubm9uV29ybGQuYWRkQm9keShib2R5KTtcclxuICAgIGdhbWUuZm9vZC5ib2R5ID0gYm9keTtcclxufVxyXG5cclxuZnVuY3Rpb24gcGxheVNvdW5kKG5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgY29uc3Qgc291bmQgPSBnYW1lLmFzc2V0cy5zb3VuZHNbbmFtZV07XHJcbiAgICBpZiAoc291bmQpIHtcclxuICAgICAgICBzb3VuZC5jdXJyZW50VGltZSA9IDA7IC8vIFJld2luZCB0byBzdGFydCBpZiBhbHJlYWR5IHBsYXlpbmdcclxuICAgICAgICBzb3VuZC5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBwbGF5IHNvdW5kICR7bmFtZX06YCwgZSkpOyAvLyBDYXRjaCBwcm9taXNlIHJlamVjdGlvblxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kICcke25hbWV9JyBub3QgZm91bmQuYCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZVNjb3JlVUkoKTogdm9pZCB7XHJcbiAgICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSkge1xyXG4gICAgICAgIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuaW5uZXJUZXh0ID0gYFNjb3JlOiAke2dhbWUuc2NvcmV9YDtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcmVzZXRHYW1lKCk6IHZvaWQge1xyXG4gICAgaWYgKCFnYW1lLmRhdGEgfHwgIWdhbWUuc2NlbmUgfHwgIWdhbWUuY2Fubm9uV29ybGQpIHJldHVybjtcclxuXHJcbiAgICAvLyBDbGVhciBleGlzdGluZyBzbmFrZSBhbmQgZm9vZFxyXG4gICAgZ2FtZS5zbmFrZS5mb3JFYWNoKHNlZ21lbnQgPT4ge1xyXG4gICAgICAgIGdhbWUuc2NlbmU/LnJlbW92ZShzZWdtZW50Lm1lc2gpO1xyXG4gICAgICAgIHNlZ21lbnQubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgKHNlZ21lbnQubWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG4gICAgICAgIGdhbWUuY2Fubm9uV29ybGQ/LnJlbW92ZUJvZHkoc2VnbWVudC5ib2R5KTtcclxuICAgIH0pO1xyXG4gICAgZ2FtZS5zbmFrZSA9IFtdO1xyXG5cclxuICAgIGlmIChnYW1lLmZvb2QubWVzaCkge1xyXG4gICAgICAgIGdhbWUuc2NlbmUucmVtb3ZlKGdhbWUuZm9vZC5tZXNoKTtcclxuICAgICAgICBnYW1lLmZvb2QubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgKGdhbWUuZm9vZC5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XHJcbiAgICAgICAgZ2FtZS5mb29kLm1lc2ggPSBudWxsO1xyXG4gICAgfVxyXG4gICAgaWYgKGdhbWUuZm9vZC5ib2R5KSB7XHJcbiAgICAgICAgZ2FtZS5jYW5ub25Xb3JsZC5yZW1vdmVCb2R5KGdhbWUuZm9vZC5ib2R5KTtcclxuICAgICAgICBnYW1lLmZvb2QuYm9keSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSW5pdGlhbCBzbmFrZSBwb3NpdGlvbiAoZS5nLiwgY2VudGVyIG9mIHRoZSBwbGF5YWJsZSBhcmVhKVxyXG4gICAgY29uc3QgaW5pdGlhbFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDApO1xyXG5cclxuICAgIC8vIENyZWF0ZSBpbml0aWFsIHNuYWtlIHNlZ21lbnRzXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGdhbWUuZGF0YS5pbml0aWFsU25ha2VMZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IHNlZ21lbnRQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMyhcclxuICAgICAgICAgICAgaW5pdGlhbFBvcy54IC0gaSAqIGdhbWUuZGF0YS5ncmlkU2l6ZSxcclxuICAgICAgICAgICAgaW5pdGlhbFBvcy55LFxyXG4gICAgICAgICAgICBpbml0aWFsUG9zLnpcclxuICAgICAgICApO1xyXG4gICAgICAgIGdhbWUuc25ha2UucHVzaChjcmVhdGVTbmFrZVNlZ21lbnQoc2VnbWVudFBvcywgaSA9PT0gMCkpO1xyXG4gICAgfVxyXG5cclxuICAgIGdhbWUuZGlyZWN0aW9uLnNldCgxLCAwLCAwKTsgLy8gUmVzZXQgdG8gbW92aW5nIHJpZ2h0IChFYXN0KVxyXG4gICAgZ2FtZS5uZXh0RGlyZWN0aW9uLnNldCgxLCAwLCAwKTtcclxuICAgIGdhbWUuc2NvcmUgPSAwO1xyXG4gICAgdXBkYXRlU2NvcmVVSSgpO1xyXG4gICAgZ2VuZXJhdGVGb29kKCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgIGlmICghZ2FtZS5kYXRhKSByZXR1cm47XHJcblxyXG4gICAgZ2FtZS5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgIGlmIChnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4pIGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbikgZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcbiAgICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSkgZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcclxuXHJcbiAgICByZXNldEdhbWUoKTtcclxuICAgIGlmIChnYW1lLmFzc2V0cy5zb3VuZHNbJ2JnbSddICYmICFnYW1lLmJnbSkge1xyXG4gICAgICAgIGdhbWUuYmdtID0gZ2FtZS5hc3NldHMuc291bmRzWydiZ20nXTtcclxuICAgICAgICBnYW1lLmJnbS5sb29wID0gdHJ1ZTtcclxuICAgICAgICBnYW1lLmJnbS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gcGxheSBCR006XCIsIGUpKTtcclxuICAgIH0gZWxzZSBpZiAoZ2FtZS5iZ20pIHtcclxuICAgICAgICBnYW1lLmJnbS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gcGxheSBCR006XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICBwbGF5U291bmQoJ3N0YXJ0X2dhbWUnKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2FtZU92ZXIoKTogdm9pZCB7XHJcbiAgICBnYW1lLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICBpZiAoZ2FtZS5iZ20pIHtcclxuICAgICAgICBnYW1lLmJnbS5wYXVzZSgpO1xyXG4gICAgfVxyXG4gICAgcGxheVNvdW5kKCdnYW1lX292ZXInKTtcclxuXHJcbiAgICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSkgZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbikgZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XHJcbiAgICBjb25zdCBmaW5hbFNjb3JlRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaW5hbFNjb3JlJyk7XHJcbiAgICBpZiAoZmluYWxTY29yZUVsZW1lbnQpIHtcclxuICAgICAgICBmaW5hbFNjb3JlRWxlbWVudC5pbm5lclRleHQgPSBgU2NvcmU6ICR7Z2FtZS5zY29yZX1gO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBoYW5kbGVJbnB1dChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgaWYgKCFnYW1lLmRhdGEpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBjdXJyZW50RGlyID0gZ2FtZS5kaXJlY3Rpb247XHJcbiAgICBsZXQgbmV3RGlyID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuXHJcbiAgICBzd2l0Y2ggKGV2ZW50LmtleSkge1xyXG4gICAgICAgIGNhc2UgJ0Fycm93VXAnOlxyXG4gICAgICAgICAgICBuZXdEaXIuc2V0KDAsIDAsIC0xKTsgLy8gTW92ZSBOb3J0aCAobmVnYXRpdmUgWilcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnQXJyb3dEb3duJzpcclxuICAgICAgICAgICAgbmV3RGlyLnNldCgwLCAwLCAxKTsgLy8gTW92ZSBTb3V0aCAocG9zaXRpdmUgWilcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnQXJyb3dMZWZ0JzpcclxuICAgICAgICAgICAgbmV3RGlyLnNldCgtMSwgMCwgMCk7IC8vIE1vdmUgV2VzdCAobmVnYXRpdmUgWClcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnQXJyb3dSaWdodCc6XHJcbiAgICAgICAgICAgIG5ld0Rpci5zZXQoMSwgMCwgMCk7IC8vIE1vdmUgRWFzdCAocG9zaXRpdmUgWClcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAnICc6IC8vIFNwYWNlIGtleVxyXG4gICAgICAgICAgICBpZiAoZ2FtZS5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSB8fCBnYW1lLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBzY3JvbGxpbmdcclxuICAgICAgICAgICAgICAgIHN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gRG9uJ3QgcHJvY2VzcyBzcGFjZSBhcyBhIGRpcmVjdGlvbiBjaGFuZ2VcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUHJldmVudCBpbW1lZGlhdGUgcmV2ZXJzZSAoZS5nLiwgdHJ5aW5nIHRvIGdvIGxlZnQgd2hlbiBjdXJyZW50bHkgZ29pbmcgcmlnaHQpXHJcbiAgICAvLyBDaGVjayBpZiBuZXdEaXIgaXMgbm90IG9wcG9zaXRlIHRvIGN1cnJlbnREaXJcclxuICAgIGlmICghbmV3RGlyLmVxdWFscyhjdXJyZW50RGlyLmNsb25lKCkubmVnYXRlKCkpKSB7XHJcbiAgICAgICAgZ2FtZS5uZXh0RGlyZWN0aW9uLmNvcHkobmV3RGlyKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIEdhbWUgTG9vcCAtLS1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgaWYgKCFnYW1lLmRhdGEgfHwgZ2FtZS5nYW1lU3RhdGUgIT09IEdhbWVTdGF0ZS5QTEFZSU5HKSByZXR1cm47XHJcblxyXG4gICAgZ2FtZS50aW1lU2luY2VMYXN0TW92ZSArPSBkZWx0YVRpbWU7XHJcblxyXG4gICAgaWYgKGdhbWUudGltZVNpbmNlTGFzdE1vdmUgPj0gZ2FtZS5tb3ZlSW50ZXJ2YWwgLyAxMDAwKSB7IC8vIENvbnZlcnQgbW92ZUludGVydmFsIHRvIHNlY29uZHNcclxuICAgICAgICBnYW1lLnRpbWVTaW5jZUxhc3RNb3ZlIC09IGdhbWUubW92ZUludGVydmFsIC8gMTAwMDtcclxuXHJcbiAgICAgICAgZ2FtZS5kaXJlY3Rpb24uY29weShnYW1lLm5leHREaXJlY3Rpb24pOyAvLyBBcHBseSBidWZmZXJlZCBkaXJlY3Rpb25cclxuXHJcbiAgICAgICAgLy8gU3RvcmUgY3VycmVudCBoZWFkIHBvc2l0aW9uIGJlZm9yZSBtb3ZpbmdcclxuICAgICAgICBjb25zdCBvbGRIZWFkUG9zaXRpb24gPSBnYW1lLnNuYWtlWzBdLm1lc2gucG9zaXRpb24uY2xvbmUoKTtcclxuXHJcbiAgICAgICAgLy8gQ2FsY3VsYXRlIG5ldyBoZWFkIHBvc2l0aW9uXHJcbiAgICAgICAgY29uc3QgaGVhZCA9IGdhbWUuc25ha2VbMF07XHJcbiAgICAgICAgY29uc3QgbmV3SGVhZFBvc2l0aW9uID0gaGVhZC5tZXNoLnBvc2l0aW9uLmNsb25lKCkuYWRkKGdhbWUuZGlyZWN0aW9uLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoZ2FtZS5kYXRhLmdyaWRTaXplKSk7XHJcblxyXG4gICAgICAgIC8vIC0tLSBDb2xsaXNpb24gRGV0ZWN0aW9uIC0tLVxyXG4gICAgICAgIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwO1xyXG4gICAgICAgIGNvbnN0IGhhbGZXb3JsZFNpemUgPSB3b3JsZFNpemUgLyAyO1xyXG4gICAgICAgIGNvbnN0IG1heENvb3JkID0gaGFsZldvcmxkU2l6ZSAtIGdhbWUuZGF0YS5ncmlkU2l6ZSAvIDI7XHJcbiAgICAgICAgY29uc3QgbWluQ29vcmQgPSAtaGFsZldvcmxkU2l6ZSArIGdhbWUuZGF0YS5ncmlkU2l6ZSAvIDI7XHJcblxyXG4gICAgICAgIC8vIFdhbGwgY29sbGlzaW9uXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgbmV3SGVhZFBvc2l0aW9uIGlzIG91dHNpZGUgdGhlIHBsYXkgYXJlYSBkZWZpbmVkIGJ5IG1pbi9tYXhDb29yZFxyXG4gICAgICAgIGlmIChuZXdIZWFkUG9zaXRpb24ueCA+IG1heENvb3JkIHx8IG5ld0hlYWRQb3NpdGlvbi54IDwgbWluQ29vcmQgfHxcclxuICAgICAgICAgICAgbmV3SGVhZFBvc2l0aW9uLnogPiBtYXhDb29yZCB8fCBuZXdIZWFkUG9zaXRpb24ueiA8IG1pbkNvb3JkKSB7XHJcbiAgICAgICAgICAgIGdhbWVPdmVyKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNlbGYtY29sbGlzaW9uIChjaGVjayBuZXcgaGVhZCBwb3NpdGlvbiBhZ2FpbnN0IGFsbCBib2R5IHNlZ21lbnRzIGV4Y2VwdCB0aGUgY3VycmVudCBoZWFkKVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgZ2FtZS5zbmFrZS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAobmV3SGVhZFBvc2l0aW9uLmRpc3RhbmNlVG8oZ2FtZS5zbmFrZVtpXS5tZXNoLnBvc2l0aW9uKSA8IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDAuOSkgeyAvLyBDaGVjayBpZiBwb3NpdGlvbnMgYXJlIHZlcnkgY2xvc2VcclxuICAgICAgICAgICAgICAgIGdhbWVPdmVyKCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE1vdmUgc25ha2U6IEhlYWQgbW92ZXMgdG8gbmV3IHBvc2l0aW9uLCBib2R5IHNlZ21lbnRzIGZvbGxvd1xyXG4gICAgICAgIGZvciAobGV0IGkgPSBnYW1lLnNuYWtlLmxlbmd0aCAtIDE7IGkgPiAwOyBpLS0pIHtcclxuICAgICAgICAgICAgZ2FtZS5zbmFrZVtpXS5tZXNoLnBvc2l0aW9uLmNvcHkoZ2FtZS5zbmFrZVtpIC0gMV0ubWVzaC5wb3NpdGlvbik7XHJcbiAgICAgICAgICAgIGdhbWUuc25ha2VbaV0uYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhnYW1lLnNuYWtlW2kgLSAxXS5tZXNoLnBvc2l0aW9uLngsIGdhbWUuc25ha2VbaSAtIDFdLm1lc2gucG9zaXRpb24ueSwgZ2FtZS5zbmFrZVtpIC0gMV0ubWVzaC5wb3NpdGlvbi56KSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGhlYWQubWVzaC5wb3NpdGlvbi5jb3B5KG5ld0hlYWRQb3NpdGlvbik7XHJcbiAgICAgICAgaGVhZC5ib2R5LnBvc2l0aW9uLmNvcHkobmV3IENBTk5PTi5WZWMzKG5ld0hlYWRQb3NpdGlvbi54LCBuZXdIZWFkUG9zaXRpb24ueSwgbmV3SGVhZFBvc2l0aW9uLnopKTtcclxuXHJcblxyXG4gICAgICAgIC8vIEZvb2QgY29sbGlzaW9uXHJcbiAgICAgICAgaWYgKGdhbWUuZm9vZC5tZXNoICYmIG5ld0hlYWRQb3NpdGlvbi5kaXN0YW5jZVRvKGdhbWUuZm9vZC5tZXNoLnBvc2l0aW9uKSA8IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDAuOSkge1xyXG4gICAgICAgICAgICBwbGF5U291bmQoJ2VhdF9mb29kJyk7XHJcbiAgICAgICAgICAgIGdhbWUuc2NvcmUrKztcclxuICAgICAgICAgICAgdXBkYXRlU2NvcmVVSSgpO1xyXG5cclxuICAgICAgICAgICAgLy8gQWRkIG5ldyBzZWdtZW50IGF0IHRoZSBvbGQgdGFpbCdzIHBvc2l0aW9uICh0aGUgcG9zaXRpb24gb2YgdGhlIHNlZ21lbnQgdGhhdCB3YXMgbW92ZWQgZnJvbSBieSB0aGUgbGFzdCBzZWdtZW50KVxyXG4gICAgICAgICAgICAvLyBUaGUgc2VnbWVudCB0aGF0IHdhcyBhdCBnYW1lLnNuYWtlW2dhbWUuc25ha2UubGVuZ3RoIC0gMV0gYmVmb3JlIHRoZSBtb3ZlIG5vdyBuZWVkcyBhIG5ldyBvbmUgYmVoaW5kIGl0LlxyXG4gICAgICAgICAgICAvLyBUaGUgb2xkSGVhZFBvc2l0aW9uICh3aGljaCBpcyBub3cgZWZmZWN0aXZlbHkgdGhlIHBvc2l0aW9uIG9mIHRoZSBmaXJzdCBib2R5IHNlZ21lbnQpXHJcbiAgICAgICAgICAgIC8vIGlzIG5vdCBzdWl0YWJsZSBmb3IgdGhlIG5ldyBzZWdtZW50LiBJbnN0ZWFkLCB0aGUgbGFzdCBzZWdtZW50J3MgKnByZXZpb3VzKiBwb3NpdGlvblxyXG4gICAgICAgICAgICAvLyAoYmVmb3JlIGl0IG1vdmVkKSBpcyB0aGUgY29ycmVjdCBzcG90LiBCdXQgc2luY2Ugd2UganVzdCBtb3ZlZCBldmVyeXRoaW5nLFxyXG4gICAgICAgICAgICAvLyB0aGUgbmV3IHNlZ21lbnQgc2hvdWxkIGFjdHVhbGx5IG9jY3VweSB0aGUgYG9sZEhlYWRQb3NpdGlvbmAncyBsYXN0IHBvc2l0aW9uLlxyXG4gICAgICAgICAgICAvLyBBIHNpbXBsZXIgYXBwcm9hY2g6IGNyZWF0ZSB0aGUgbmV3IHNlZ21lbnQgYXQgdGhlIHBvc2l0aW9uIG9mIHRoZSBsYXN0IHNlZ21lbnQgKmFmdGVyKiB0aGUgbW92ZS5cclxuICAgICAgICAgICAgLy8gVGhpcyBtYWtlcyB0aGUgc25ha2UgZ3JvdyBmcm9tIGl0cyB0YWlsIGluIHRoZSBkaXJlY3Rpb24gaXQgd2FzIG1vdmluZy5cclxuICAgICAgICAgICAgY29uc3QgbGFzdFNlZ21lbnRDdXJyZW50UG9zID0gZ2FtZS5zbmFrZVtnYW1lLnNuYWtlLmxlbmd0aCAtIDFdLm1lc2gucG9zaXRpb24uY2xvbmUoKTtcclxuICAgICAgICAgICAgZ2FtZS5zbmFrZS5wdXNoKGNyZWF0ZVNuYWtlU2VnbWVudChsYXN0U2VnbWVudEN1cnJlbnRQb3MsIGZhbHNlKSk7IFxyXG5cclxuICAgICAgICAgICAgZ2VuZXJhdGVGb29kKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFVwZGF0ZSBDYW5ub24uanMgd29ybGQgKGV2ZW4gaWYgcG9zaXRpb25zIGFyZSBtYW51YWxseSBzZXQsIHRoaXMgcHJvY2Vzc2VzIHBvdGVudGlhbCBjb250YWN0IGNhbGxiYWNrcyBpZiBhbnkgd2VyZSBzZXQgdXApXHJcbiAgICBpZiAoZ2FtZS5jYW5ub25Xb3JsZCkge1xyXG4gICAgICAgIC8vIFVzZSBhIGZpeGVkIHRpbWUgc3RlcCBmb3IgcGh5c2ljcyBzaW11bGF0aW9uIGZvciBzdGFiaWxpdHlcclxuICAgICAgICBjb25zdCBmaXhlZFRpbWVTdGVwID0gMSAvIDYwOyAvLyA2MCBIelxyXG4gICAgICAgIGdhbWUuY2Fubm9uV29ybGQuc3RlcChmaXhlZFRpbWVTdGVwLCBkZWx0YVRpbWUsIDMpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiByZW5kZXIoKTogdm9pZCB7XHJcbiAgICBpZiAoZ2FtZS5yZW5kZXJlciAmJiBnYW1lLnNjZW5lICYmIGdhbWUuY2FtZXJhKSB7XHJcbiAgICAgICAgZ2FtZS5yZW5kZXJlci5yZW5kZXIoZ2FtZS5zY2VuZSwgZ2FtZS5jYW1lcmEpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnYW1lTG9vcChjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAvLyBDb252ZXJ0IGRlbHRhVGltZSB0byBzZWNvbmRzIGZvciBjb25zaXN0ZW5jeSB3aXRoIENhbm5vbi5qcyBzdGVwXHJcbiAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSBnYW1lLmxhc3RVcGRhdGVUaW1lKSAvIDEwMDA7IFxyXG4gICAgZ2FtZS5sYXN0VXBkYXRlVGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgcmVuZGVyKCk7XHJcblxyXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcclxufVxyXG5cclxuLy8gLS0tIE1haW4gRW50cnkgUG9pbnQgLS0tXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBhc3luYyAoKSA9PiB7XHJcbiAgICBnYW1lLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBpZiAoIWdhbWUuY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZC5cIik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IGxvYWRHYW1lRGF0YSgpO1xyXG4gICAgaWYgKCFnYW1lLmRhdGEpIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgc2V0dXBVSSgpOyAvLyBTZXQgdXAgVUkgZWxlbWVudHNcclxuXHJcbiAgICBhd2FpdCBwcmVsb2FkQXNzZXRzKCk7XHJcbiAgICBjcmVhdGVHYW1lV29ybGQoKTtcclxuXHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZUlucHV0KTtcclxuXHJcbiAgICAvLyBJbml0aWFsIHJlbmRlciBvZiB0aGUgdGl0bGUgc2NyZWVuXHJcbiAgICBnYW1lLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIGlmIChnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4pIGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkpIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuc3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4pIGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG5cclxuICAgIGdhbWUubGFzdFVwZGF0ZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTsgLy8gSW5pdGlhbGl6ZSBsYXN0VXBkYXRlVGltZVxyXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcclxufSk7Il0sCiAgIm1hcHBpbmdzIjogIkFBQUEsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQWdDeEIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSEMsU0FBQUE7QUFBQSxHQUFBO0FBTUwsTUFBTSxPQXdCRjtBQUFBLEVBQ0EsTUFBTTtBQUFBLEVBQ04sUUFBUSxFQUFFLFVBQVUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxFQUFFO0FBQUEsRUFDbkMsUUFBUTtBQUFBLEVBQ1IsVUFBVTtBQUFBLEVBQ1YsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsYUFBYTtBQUFBLEVBQ2IsT0FBTyxDQUFDO0FBQUEsRUFDUixNQUFNLEVBQUUsTUFB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
