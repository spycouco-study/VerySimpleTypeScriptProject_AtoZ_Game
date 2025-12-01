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
        <h1>3D \uBC40\uAC8C\uC784</h1>
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0ICogYXMgQ0FOTk9OIGZyb20gJ2Nhbm5vbi1lcyc7XG5cbi8vIC0tLSBHbG9iYWwgR2FtZSBTdGF0ZSBhbmQgQ29uZmlndXJhdGlvbiAtLS1cbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcbiAgICBjYW52YXNXaWR0aDogbnVtYmVyO1xuICAgIGNhbnZhc0hlaWdodDogbnVtYmVyO1xuICAgIGdyaWRTaXplOiBudW1iZXI7IC8vIFNpemUgb2YgZWFjaCBncmlkIGNlbGwgaW4gd29ybGQgdW5pdHNcbiAgICBzbmFrZVNwZWVkOiBudW1iZXI7IC8vIEhvdyBtYW55IGdyaWQgY2VsbHMgcGVyIHNlY29uZCB0aGUgc25ha2UgbW92ZXNcbiAgICBpbml0aWFsU25ha2VMZW5ndGg6IG51bWJlcjtcbiAgICB3YWxsVGhpY2tuZXNzOiBudW1iZXI7IC8vIFRoaWNrbmVzcyBvZiB0aGUgd2FsbHMgaW4gd29ybGQgdW5pdHNcbiAgICBjYW1lcmFGT1Y6IG51bWJlcjtcbiAgICBjYW1lcmFOZWFyOiBudW1iZXI7XG4gICAgY2FtZXJhRmFyOiBudW1iZXI7XG4gICAgY2FtZXJhUG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlcjsgfTtcbiAgICBsaWdodFBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IH07XG4gICAgY29sb3JzOiB7XG4gICAgICAgIGJhY2tncm91bmQ6IG51bWJlcjtcbiAgICAgICAgdGl0bGVUZXh0OiBzdHJpbmc7XG4gICAgICAgIHNjb3JlVGV4dDogc3RyaW5nO1xuICAgICAgICBnYW1lT3ZlclRleHQ6IHN0cmluZztcbiAgICB9XG4gICAgYXNzZXRzOiB7XG4gICAgICAgIGltYWdlczogQXJyYXk8eyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH0+O1xuICAgICAgICBzb3VuZHM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjsgdm9sdW1lOiBudW1iZXI7IH0+O1xuICAgIH07XG59XG5cbmludGVyZmFjZSBMb2FkZWRBc3NldHMge1xuICAgIHRleHR1cmVzOiB7IFtrZXk6IHN0cmluZ106IFRIUkVFLlRleHR1cmUgfCBUSFJFRS5Db2xvciB9O1xuICAgIHNvdW5kczogeyBba2V5OiBzdHJpbmddOiBIVE1MQXVkaW9FbGVtZW50IH07XG59XG5cbmVudW0gR2FtZVN0YXRlIHtcbiAgICBUSVRMRSxcbiAgICBQTEFZSU5HLFxuICAgIEdBTUVfT1ZFUixcbn1cblxuY29uc3QgZ2FtZToge1xuICAgIGRhdGE6IEdhbWVDb25maWcgfCBudWxsO1xuICAgIGFzc2V0czogTG9hZGVkQXNzZXRzO1xuICAgIGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQgfCBudWxsO1xuICAgIHJlbmRlcmVyOiBUSFJFRS5XZWJHTFJlbmRlcmVyIHwgbnVsbDtcbiAgICBzY2VuZTogVEhSRUUuU2NlbmUgfCBudWxsO1xuICAgIGNhbWVyYTogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEgfCBudWxsO1xuICAgIGNhbm5vbldvcmxkOiBDQU5OT04uV29ybGQgfCBudWxsO1xuICAgIHNuYWtlOiB7IG1lc2g6IFRIUkVFLk1lc2g7IGJvZHk6IENBTk5PTi5Cb2R5OyB9W107XG4gICAgZm9vZDogeyBtZXNoOiBUSFJFRS5NZXNoIHwgbnVsbDsgYm9keTogQ0FOTk9OLkJvZHkgfCBudWxsOyB9O1xuICAgIGRpcmVjdGlvbjogVEhSRUUuVmVjdG9yMztcbiAgICBuZXh0RGlyZWN0aW9uOiBUSFJFRS5WZWN0b3IzO1xuICAgIHNjb3JlOiBudW1iZXI7XG4gICAgZ2FtZVN0YXRlOiBHYW1lU3RhdGU7XG4gICAgbGFzdFVwZGF0ZVRpbWU6IG51bWJlcjtcbiAgICB0aW1lU2luY2VMYXN0TW92ZTogbnVtYmVyO1xuICAgIG1vdmVJbnRlcnZhbDogbnVtYmVyOyAvLyBUaW1lIGluIG1zIGJldHdlZW4gc25ha2UgbW92ZXNcbiAgICB1aUVsZW1lbnRzOiB7XG4gICAgICAgIHRpdGxlU2NyZWVuOiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XG4gICAgICAgIHNjb3JlRGlzcGxheTogSFRNTERpdkVsZW1lbnQgfCBudWxsO1xuICAgICAgICBnYW1lT3ZlclNjcmVlbjogSFRNTERpdkVsZW1lbnQgfCBudWxsO1xuICAgIH07XG4gICAgYmdtOiBIVE1MQXVkaW9FbGVtZW50IHwgbnVsbDtcbiAgICB3YWxsQm9kaWVzOiBDQU5OT04uQm9keVtdOyAvLyBUbyBob2xkIHJlZmVyZW5jZXMgdG8gY2Fubm9uIHdhbGwgYm9kaWVzXG59ID0ge1xuICAgIGRhdGE6IG51bGwsXG4gICAgYXNzZXRzOiB7IHRleHR1cmVzOiB7fSwgc291bmRzOiB7fSB9LFxuICAgIGNhbnZhczogbnVsbCxcbiAgICByZW5kZXJlcjogbnVsbCxcbiAgICBzY2VuZTogbnVsbCxcbiAgICBjYW1lcmE6IG51bGwsXG4gICAgY2Fubm9uV29ybGQ6IG51bGwsXG4gICAgc25ha2U6IFtdLFxuICAgIGZvb2Q6IHsgbWVzaDogbnVsbCwgYm9keTogbnVsbCB9LFxuICAgIGRpcmVjdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoMSwgMCwgMCksIC8vIEluaXRpYWwgZGlyZWN0aW9uOiBFYXN0IChwb3NpdGl2ZSBYKVxuICAgIG5leHREaXJlY3Rpb246IG5ldyBUSFJFRS5WZWN0b3IzKDEsIDAsIDApLFxuICAgIHNjb3JlOiAwLFxuICAgIGdhbWVTdGF0ZTogR2FtZVN0YXRlLlRJVExFLFxuICAgIGxhc3RVcGRhdGVUaW1lOiAwLFxuICAgIHRpbWVTaW5jZUxhc3RNb3ZlOiAwLFxuICAgIG1vdmVJbnRlcnZhbDogMCwgLy8gV2lsbCBiZSBjYWxjdWxhdGVkIGZyb20gc25ha2VTcGVlZFxuICAgIHVpRWxlbWVudHM6IHtcbiAgICAgICAgdGl0bGVTY3JlZW46IG51bGwsXG4gICAgICAgIHNjb3JlRGlzcGxheTogbnVsbCxcbiAgICAgICAgZ2FtZU92ZXJTY3JlZW46IG51bGwsXG4gICAgfSxcbiAgICBiZ206IG51bGwsXG4gICAgd2FsbEJvZGllczogW10sXG59O1xuXG4vLyAtLS0gR2FtZSBJbml0aWFsaXphdGlvbiAtLS1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZEdhbWVEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGRhdGEuanNvbjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgICB9XG4gICAgICAgIGdhbWUuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBHYW1lQ29uZmlnO1xuICAgICAgICBjb25zb2xlLmxvZyhcIkdhbWUgZGF0YSBsb2FkZWQ6XCIsIGdhbWUuZGF0YSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGxvYWRpbmcgZ2FtZSBkYXRhOlwiLCBlcnJvcik7XG4gICAgICAgIGFsZXJ0KFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uLiBQbGVhc2UgY2hlY2sgZGF0YS5qc29uLlwiKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByZWxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFnYW1lLmRhdGEpIHJldHVybjtcblxuICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xuICAgIGNvbnN0IGF1ZGlvUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuICAgIGNvbnN0IHRleHR1cmVQcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cbiAgICAvLyBBZGQgcGxhY2Vob2xkZXIgdGV4dHVyZXMgaWYgYWN0dWFsIGFzc2V0cyBhcmUgbm90IGZvdW5kIGluIGRhdGEuanNvblxuICAgIC8vIFRoaXMgYWxsb3dzIHRoZSBnYW1lIHRvIHJ1biBldmVuIGlmIHNvbWUgYXNzZXRzIGFyZSBtaXNzaW5nLlxuICAgIC8vIEVuc3VyZSBhbGwgY3JpdGljYWwgdGV4dHVyZSBuYW1lcyBhcmUgcHJlc2VudCBpbiBhc3NldHMudGV4dHVyZXNcbiAgICBjb25zdCByZXF1aXJlZFRleHR1cmVzID0gWydzbmFrZV9oZWFkJywgJ3NuYWtlX2JvZHknLCAnZm9vZCcsICd3YWxsX3RleHR1cmUnXTtcbiAgICBmb3IoY29uc3QgbmFtZSBvZiByZXF1aXJlZFRleHR1cmVzKSB7XG4gICAgICAgIGlmICghZ2FtZS5kYXRhLmFzc2V0cy5pbWFnZXMuc29tZShpbWcgPT4gaW1nLm5hbWUgPT09IG5hbWUpKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFRleHR1cmUgJyR7bmFtZX0nIG5vdCBmb3VuZCBpbiBkYXRhLmpzb24uIFVzaW5nIGEgcGxhY2Vob2xkZXIuYCk7XG4gICAgICAgICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tuYW1lXSA9IG5ldyBUSFJFRS5Db2xvcigweDg4ODg4OCk7IC8vIERlZmF1bHQgY29sb3JcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZm9yIChjb25zdCBpbWcgb2YgZ2FtZS5kYXRhLmFzc2V0cy5pbWFnZXMpIHtcbiAgICAgICAgdGV4dHVyZVByb21pc2VzLnB1c2gobmV3IFByb21pc2UoKHJlc29sdmUpID0+IHsgLy8gQ2hhbmdlZCB0byByZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIGdhbWVcbiAgICAgICAgICAgIHRleHR1cmVMb2FkZXIubG9hZChcbiAgICAgICAgICAgICAgICBpbWcucGF0aCxcbiAgICAgICAgICAgICAgICAodGV4dHVyZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tpbWcubmFtZV0gPSB0ZXh0dXJlO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgKGVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIGxvYWRpbmcgdGV4dHVyZSAke2ltZy5uYW1lfSBmcm9tICR7aW1nLnBhdGh9OmAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgZ2FtZS5hc3NldHMudGV4dHVyZXNbaW1nLm5hbWVdID0gbmV3IFRIUkVFLkNvbG9yKDB4ODg4ODg4KTsgLy8gRmFsbGJhY2sgdG8gY29sb3JcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gYWxsb3cgZ2FtZSB0byBjb250aW51ZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICAvLyBFbnN1cmUgYWxsIGNyaXRpY2FsIHNvdW5kIG5hbWVzIGFyZSBwcmVzZW50IGluIGFzc2V0cy5zb3VuZHNcbiAgICBjb25zdCByZXF1aXJlZFNvdW5kcyA9IFsnZWF0X2Zvb2QnLCAnZ2FtZV9vdmVyJywgJ2JnbScsICdzdGFydF9nYW1lJ107XG4gICAgZm9yKGNvbnN0IG5hbWUgb2YgcmVxdWlyZWRTb3VuZHMpIHtcbiAgICAgICAgaWYgKCFnYW1lLmRhdGEuYXNzZXRzLnNvdW5kcy5zb21lKHMgPT4gcy5uYW1lID09PSBuYW1lKSkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtuYW1lfScgbm90IGZvdW5kIGluIGRhdGEuanNvbi4gV2lsbCBub3QgcGxheS5gKTtcbiAgICAgICAgICAgIC8vIE5vIGRlZmF1bHQgc291bmQsIGp1c3Qgd29uJ3QgYmUgaW4gZ2FtZS5hc3NldHMuc291bmRzXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHNvdW5kIG9mIGdhbWUuZGF0YS5hc3NldHMuc291bmRzKSB7XG4gICAgICAgIGF1ZGlvUHJvbWlzZXMucHVzaChuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4geyAvLyBDaGFuZ2VkIHRvIHJlc29sdmUgZXZlbiBvbiBlcnJvclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIFByZWxvYWQgdGhlIGF1ZGlvXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGdhbWUuYXNzZXRzLnNvdW5kc1tzb3VuZC5uYW1lXSA9IGF1ZGlvO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIHNvdW5kICR7c291bmQubmFtZX0gZnJvbSAke3NvdW5kLnBhdGh9OmAsIGUpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIGFsbG93IGdhbWUgdG8gY29udGludWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4udGV4dHVyZVByb21pc2VzLCAuLi5hdWRpb1Byb21pc2VzXSk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBwcmVsb2FkZWQgKG9yIGZhbGxlbiBiYWNrIHRvIHBsYWNlaG9sZGVycykuXCIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJVbmV4cGVjdGVkIGVycm9yIGR1cmluZyBhc3NldCBwcmVsb2FkaW5nOlwiLCBlcnJvcik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzZXR1cFVJKCk6IHZvaWQge1xuICAgIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLmNhbnZhcykgcmV0dXJuO1xuXG4gICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmJvZHk7XG4gICAgYm9keS5zdHlsZS5tYXJnaW4gPSAnMCc7XG4gICAgYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXG4gICAgLy8gVGl0bGUgU2NyZWVuXG4gICAgY29uc3QgdGl0bGVTY3JlZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB0aXRsZVNjcmVlbi5pZCA9ICd0aXRsZVNjcmVlbic7XG4gICAgT2JqZWN0LmFzc2lnbih0aXRsZVNjcmVlbi5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgICAgdG9wOiAnMCcsXG4gICAgICAgIGxlZnQ6ICcwJyxcbiAgICAgICAgd2lkdGg6ICcxMDAlJyxcbiAgICAgICAgaGVpZ2h0OiAnMTAwJScsXG4gICAgICAgIGJhY2tncm91bmRDb2xvcjogYHJnYmEoMCwgMCwgMCwgMC43KWAsXG4gICAgICAgIGNvbG9yOiBnYW1lLmRhdGEuY29sb3JzLnRpdGxlVGV4dCxcbiAgICAgICAgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcbiAgICAgICAgZGlzcGxheTogJ2ZsZXgnLFxuICAgICAgICBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcbiAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiAgICAgICAgekluZGV4OiAnMTAwJyxcbiAgICAgICAgZm9udFNpemU6ICc0OHB4JyxcbiAgICAgICAgdGV4dEFsaWduOiAnY2VudGVyJyxcbiAgICB9KTtcbiAgICB0aXRsZVNjcmVlbi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxoMT4zRCBcdUJDNDBcdUFDOENcdUM3ODQ8L2gxPlxuICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMjRweDtcIj5QcmVzcyBTUEFDRSB0byBTdGFydDwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDE4cHg7XCI+VXNlIEFycm93IEtleXMgdG8gTW92ZTwvcD5cbiAgICBgO1xuICAgIGJvZHkuYXBwZW5kQ2hpbGQodGl0bGVTY3JlZW4pO1xuICAgIGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbiA9IHRpdGxlU2NyZWVuO1xuXG4gICAgLy8gU2NvcmUgRGlzcGxheVxuICAgIGNvbnN0IHNjb3JlRGlzcGxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIHNjb3JlRGlzcGxheS5pZCA9ICdzY29yZURpc3BsYXknO1xuICAgIE9iamVjdC5hc3NpZ24oc2NvcmVEaXNwbGF5LnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuICAgICAgICB0b3A6ICcxMHB4JyxcbiAgICAgICAgbGVmdDogJzEwcHgnLFxuICAgICAgICBjb2xvcjogZ2FtZS5kYXRhLmNvbG9ycy5zY29yZVRleHQsXG4gICAgICAgIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXG4gICAgICAgIGZvbnRTaXplOiAnMjRweCcsXG4gICAgICAgIHpJbmRleDogJzEwMScsXG4gICAgICAgIGRpc3BsYXk6ICdub25lJywgLy8gSGlkZGVuIGluaXRpYWxseVxuICAgIH0pO1xuICAgIHNjb3JlRGlzcGxheS5pbm5lclRleHQgPSBgU2NvcmU6IDBgO1xuICAgIGJvZHkuYXBwZW5kQ2hpbGQoc2NvcmVEaXNwbGF5KTtcbiAgICBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5ID0gc2NvcmVEaXNwbGF5O1xuXG4gICAgLy8gR2FtZSBPdmVyIFNjcmVlblxuICAgIGNvbnN0IGdhbWVPdmVyU2NyZWVuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgZ2FtZU92ZXJTY3JlZW4uaWQgPSAnZ2FtZU92ZXJTY3JlZW4nO1xuICAgIE9iamVjdC5hc3NpZ24oZ2FtZU92ZXJTY3JlZW4uc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4gICAgICAgIHRvcDogJzAnLFxuICAgICAgICBsZWZ0OiAnMCcsXG4gICAgICAgIHdpZHRoOiAnMTAwJScsXG4gICAgICAgIGhlaWdodDogJzEwMCUnLFxuICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6IGByZ2JhKDAsIDAsIDAsIDAuNylgLFxuICAgICAgICBjb2xvcjogZ2FtZS5kYXRhLmNvbG9ycy5nYW1lT3ZlclRleHQsXG4gICAgICAgIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXG4gICAgICAgIGRpc3BsYXk6ICdub25lJywgLy8gSGlkZGVuIGluaXRpYWxseVxuICAgICAgICBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcbiAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiAgICAgICAgekluZGV4OiAnMTAyJyxcbiAgICAgICAgZm9udFNpemU6ICc0OHB4JyxcbiAgICAgICAgdGV4dEFsaWduOiAnY2VudGVyJyxcbiAgICB9KTtcbiAgICBnYW1lT3ZlclNjcmVlbi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxoMT5HQU1FIE9WRVIhPC9oMT5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDM2cHg7XCIgaWQ9XCJmaW5hbFNjb3JlXCI+U2NvcmU6IDA8L3A+XG4gICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAyNHB4O1wiPlByZXNzIFNQQUNFIHRvIFJlc3RhcnQ8L3A+XG4gICAgYDtcbiAgICBib2R5LmFwcGVuZENoaWxkKGdhbWVPdmVyU2NyZWVuKTtcbiAgICBnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4gPSBnYW1lT3ZlclNjcmVlbjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlR2FtZVdvcmxkKCk6IHZvaWQge1xuICAgIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLmNhbnZhcykgcmV0dXJuO1xuXG4gICAgLy8gVGhyZWUuanMgc2V0dXBcbiAgICBnYW1lLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG4gICAgZ2FtZS5zY2VuZS5iYWNrZ3JvdW5kID0gbmV3IFRIUkVFLkNvbG9yKGdhbWUuZGF0YS5jb2xvcnMuYmFja2dyb3VuZCk7XG5cbiAgICBnYW1lLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcbiAgICAgICAgZ2FtZS5kYXRhLmNhbWVyYUZPVixcbiAgICAgICAgZ2FtZS5kYXRhLmNhbnZhc1dpZHRoIC8gZ2FtZS5kYXRhLmNhbnZhc0hlaWdodCxcbiAgICAgICAgZ2FtZS5kYXRhLmNhbWVyYU5lYXIsXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFGYXJcbiAgICApO1xuICAgIGdhbWUuY2FtZXJhLnBvc2l0aW9uLnNldChcbiAgICAgICAgZ2FtZS5kYXRhLmNhbWVyYVBvc2l0aW9uLngsXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi55LFxuICAgICAgICBnYW1lLmRhdGEuY2FtZXJhUG9zaXRpb24uelxuICAgICk7XG4gICAgZ2FtZS5jYW1lcmEubG9va0F0KDAsIDAsIDApOyAvLyBMb29rIGF0IHRoZSBjZW50ZXIgb2YgdGhlIGdhbWUgcGxhbmVcblxuICAgIGdhbWUucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogZ2FtZS5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcbiAgICBnYW1lLnJlbmRlcmVyLnNldFNpemUoZ2FtZS5kYXRhLmNhbnZhc1dpZHRoLCBnYW1lLmRhdGEuY2FudmFzSGVpZ2h0KTtcbiAgICBnYW1lLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgaWYgZGVzaXJlZFxuXG4gICAgLy8gTGlnaHRzXG4gICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweDQwNDA0MCk7IC8vIHNvZnQgd2hpdGUgbGlnaHRcbiAgICBnYW1lLnNjZW5lLmFkZChhbWJpZW50TGlnaHQpO1xuICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMSk7XG4gICAgZGlyZWN0aW9uYWxMaWdodC5wb3NpdGlvbi5zZXQoZ2FtZS5kYXRhLmxpZ2h0UG9zaXRpb24ueCwgZ2FtZS5kYXRhLmxpZ2h0UG9zaXRpb24ueSwgZ2FtZS5kYXRhLmxpZ2h0UG9zaXRpb24ueik7XG4gICAgZGlyZWN0aW9uYWxMaWdodC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgICBnYW1lLnNjZW5lLmFkZChkaXJlY3Rpb25hbExpZ2h0KTtcblxuICAgIC8vIENhbm5vbi5qcyBzZXR1cFxuICAgIGdhbWUuY2Fubm9uV29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5ncmF2aXR5LnNldCgwLCAwLCAwKTsgLy8gTm8gZ3Jhdml0eSBmb3IgYSBzbmFrZSBnYW1lXG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5kZWZhdWx0Q29udGFjdE1hdGVyaWFsLmZyaWN0aW9uID0gMDtcbiAgICBnYW1lLmNhbm5vbldvcmxkLmRlZmF1bHRDb250YWN0TWF0ZXJpYWwucmVzdGl0dXRpb24gPSAwO1xuXG4gICAgLy8gQ3JlYXRlIHdhbGxzIChib3VuZGFyaWVzKVxuICAgIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwOyAvLyBBc3N1bWluZyBhIDIweDIwIHBsYXlhYmxlIGdyaWRcbiAgICBjb25zdCBoYWxmV29ybGRTaXplID0gd29ybGRTaXplIC8gMjtcbiAgICBjb25zdCB3YWxsVGhpY2tuZXNzID0gZ2FtZS5kYXRhLndhbGxUaGlja25lc3M7XG4gICAgY29uc3Qgd2FsbEhlaWdodCA9IGdhbWUuZGF0YS5ncmlkU2l6ZTsgLy8gV2FsbHMgYXJlIGFzIHRhbGwgYXMgYSBzbmFrZSBzZWdtZW50XG5cbiAgICAvLyBNYXRlcmlhbCBmb3Igd2FsbHNcbiAgICBjb25zdCB3YWxsVGV4dHVyZSA9IGdhbWUuYXNzZXRzLnRleHR1cmVzWyd3YWxsX3RleHR1cmUnXTtcbiAgICBjb25zdCB3YWxsTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogd2FsbFRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlID8gd2FsbFRleHR1cmUgOiB1bmRlZmluZWQsIGNvbG9yOiB3YWxsVGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gd2FsbFRleHR1cmUgOiB1bmRlZmluZWQgfSk7XG4gICAgXG4gICAgLy8gRnJvbnQgd2FsbCAoK1opXG4gICAgY3JlYXRlV2FsbCgwLCAwLCAtaGFsZldvcmxkU2l6ZSAtIHdhbGxUaGlja25lc3MgLyAyLCB3b3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzICogMiwgd2FsbEhlaWdodCwgd2FsbFRoaWNrbmVzcywgd2FsbE1hdGVyaWFsLCBcIndhbGxfel9uZWdcIik7XG4gICAgLy8gQmFjayB3YWxsICgtWilcbiAgICBjcmVhdGVXYWxsKDAsIDAsIGhhbGZXb3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzIC8gMiwgd29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAqIDIsIHdhbGxIZWlnaHQsIHdhbGxUaGlja25lc3MsIHdhbGxNYXRlcmlhbCwgXCJ3YWxsX3pfcG9zXCIpO1xuICAgIC8vIExlZnQgd2FsbCAoLVgpXG4gICAgY3JlYXRlV2FsbCgtaGFsZldvcmxkU2l6ZSAtIHdhbGxUaGlja25lc3MgLyAyLCAwLCAwLCB3YWxsVGhpY2tuZXNzLCB3YWxsSGVpZ2h0LCB3b3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzICogMiwgd2FsbE1hdGVyaWFsLCBcIndhbGxfeF9uZWdcIik7XG4gICAgLy8gUmlnaHQgd2FsbCAoK1gpXG4gICAgY3JlYXRlV2FsbChoYWxmV29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAvIDIsIDAsIDAsIHdhbGxUaGlja25lc3MsIHdhbGxIZWlnaHQsIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLCB3YWxsTWF0ZXJpYWwsIFwid2FsbF94X3Bvc1wiKTtcblxuICAgIC8vIEluaXRpYWwgc2V0dXAgZm9yIHRoZSBnYW1lIHN0YXRlIChiZWZvcmUgc3RhcnRpbmcpXG4gICAgZ2FtZS5tb3ZlSW50ZXJ2YWwgPSAxMDAwIC8gZ2FtZS5kYXRhLnNuYWtlU3BlZWQ7XG4gICAgZ2FtZS5kaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKTtcbiAgICBnYW1lLm5leHREaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlV2FsbCh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZGVwdGg6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsLCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoIWdhbWUuc2NlbmUgfHwgIWdhbWUuY2Fubm9uV29ybGQpIHJldHVybjtcblxuICAgIGNvbnN0IHdhbGxHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSh3aWR0aCwgaGVpZ2h0LCBkZXB0aCk7XG4gICAgY29uc3Qgd2FsbE1lc2ggPSBuZXcgVEhSRUUuTWVzaCh3YWxsR2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgICB3YWxsTWVzaC5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XG4gICAgd2FsbE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gICAgZ2FtZS5zY2VuZS5hZGQod2FsbE1lc2gpO1xuXG4gICAgY29uc3Qgd2FsbFNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKHdpZHRoIC8gMiwgaGVpZ2h0IC8gMiwgZGVwdGggLyAyKSk7XG4gICAgY29uc3Qgd2FsbEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwIH0pOyAvLyBNYXNzIDAgbWFrZXMgaXQgc3RhdGljXG4gICAgd2FsbEJvZHkuYWRkU2hhcGUod2FsbFNoYXBlKTtcbiAgICB3YWxsQm9keS5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5hZGRCb2R5KHdhbGxCb2R5KTtcbiAgICBnYW1lLndhbGxCb2RpZXMucHVzaCh3YWxsQm9keSk7XG59XG5cblxuZnVuY3Rpb24gY3JlYXRlU25ha2VTZWdtZW50KHBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzLCBpc0hlYWQ6IGJvb2xlYW4pOiB7IG1lc2g6IFRIUkVFLk1lc2g7IGJvZHk6IENBTk5PTi5Cb2R5OyB9IHtcbiAgICBpZiAoIWdhbWUuZGF0YSB8fCAhZ2FtZS5zY2VuZSB8fCAhZ2FtZS5jYW5ub25Xb3JsZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJHYW1lIG5vdCBpbml0aWFsaXplZCBmb3IgY3JlYXRpbmcgc25ha2Ugc2VnbWVudHMuXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHNpemUgPSBnYW1lLmRhdGEuZ3JpZFNpemU7XG4gICAgY29uc3QgdGV4dHVyZSA9IGlzSGVhZCA/IGdhbWUuYXNzZXRzLnRleHR1cmVzWydzbmFrZV9oZWFkJ10gOiBnYW1lLmFzc2V0cy50ZXh0dXJlc1snc25ha2VfYm9keSddO1xuICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoeyBtYXA6IHRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlID8gdGV4dHVyZSA6IHVuZGVmaW5lZCwgY29sb3I6IHRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5Db2xvciA/IHRleHR1cmUgOiB1bmRlZmluZWQgfSk7XG4gICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoc2l6ZSwgc2l6ZSwgc2l6ZSk7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XG4gICAgbWVzaC5wb3NpdGlvbi5jb3B5KHBvc2l0aW9uKTtcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xuICAgIGdhbWUuc2NlbmUuYWRkKG1lc2gpO1xuXG4gICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoc2l6ZSAvIDIsIHNpemUgLyAyLCBzaXplIC8gMikpO1xuICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAxIH0pOyAvLyBHaXZlIGl0IGEgbWFzcywgYnV0IHdlJ2xsIGNvbnRyb2wgaXRzIHBvc2l0aW9uXG4gICAgYm9keS5hZGRTaGFwZShzaGFwZSk7XG4gICAgYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhwb3NpdGlvbi54LCBwb3NpdGlvbi55LCBwb3NpdGlvbi56KSk7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5hZGRCb2R5KGJvZHkpO1xuXG4gICAgcmV0dXJuIHsgbWVzaCwgYm9keSB9O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUZvb2QoKTogdm9pZCB7XG4gICAgaWYgKCFnYW1lLmRhdGEgfHwgIWdhbWUuc2NlbmUgfHwgIWdhbWUuY2Fubm9uV29ybGQpIHJldHVybjtcblxuICAgIC8vIFJlbW92ZSBvbGQgZm9vZCBpZiBpdCBleGlzdHNcbiAgICBpZiAoZ2FtZS5mb29kLm1lc2gpIHtcbiAgICAgICAgZ2FtZS5zY2VuZS5yZW1vdmUoZ2FtZS5mb29kLm1lc2gpO1xuICAgICAgICBnYW1lLmZvb2QubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICAgIChnYW1lLmZvb2QubWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCkuZGlzcG9zZSgpO1xuICAgICAgICBnYW1lLmZvb2QubWVzaCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChnYW1lLmZvb2QuYm9keSkge1xuICAgICAgICBnYW1lLmNhbm5vbldvcmxkLnJlbW92ZUJvZHkoZ2FtZS5mb29kLmJvZHkpO1xuICAgICAgICBnYW1lLmZvb2QuYm9keSA9IG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgd29ybGRTaXplID0gZ2FtZS5kYXRhLmdyaWRTaXplICogMjA7XG4gICAgY29uc3QgaGFsZldvcmxkU2l6ZSA9IHdvcmxkU2l6ZSAvIDI7XG4gICAgY29uc3Qgc2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZTtcbiAgICBsZXQgZm9vZFBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzO1xuICAgIGxldCBjb2xsaXNpb25XaXRoU25ha2U6IGJvb2xlYW47XG5cbiAgICBkbyB7XG4gICAgICAgIGNvbGxpc2lvbldpdGhTbmFrZSA9IGZhbHNlO1xuICAgICAgICAvLyBHZW5lcmF0ZSByYW5kb20gZ3JpZCBwb3NpdGlvbiB3aXRoaW4gYm91bmRzIChleGNsdWRpbmcgd2FsbCB0aGlja25lc3MgYXJlYSlcbiAgICAgICAgY29uc3QgbnVtQ2VsbHMgPSAyMDsgLy8gQXNzdW1pbmcgMjB4MjAgZ3JpZFxuICAgICAgICBjb25zdCByYW5kWCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG51bUNlbGxzKSAtIG51bUNlbGxzIC8gMjsgLy8gLTEwIHRvIDlcbiAgICAgICAgY29uc3QgcmFuZFogPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBudW1DZWxscykgLSBudW1DZWxscyAvIDI7IC8vIC0xMCB0byA5XG5cbiAgICAgICAgZm9vZFBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoXG4gICAgICAgICAgICByYW5kWCAqIHNpemUgKyBzaXplIC8gMiwgLy8gQ2VudGVyIG9mIHRoZSBncmlkIGNlbGxcbiAgICAgICAgICAgIDAsIC8vIEZvb2QgYXQgeT0wLCBzYW1lIGxldmVsIGFzIHNuYWtlXG4gICAgICAgICAgICByYW5kWiAqIHNpemUgKyBzaXplIC8gMlxuICAgICAgICApO1xuXG4gICAgICAgIC8vIENoZWNrIGZvciBjb2xsaXNpb24gd2l0aCBzbmFrZVxuICAgICAgICBmb3IgKGNvbnN0IHNlZ21lbnQgb2YgZ2FtZS5zbmFrZSkge1xuICAgICAgICAgICAgaWYgKHNlZ21lbnQubWVzaC5wb3NpdGlvbi5kaXN0YW5jZVRvKGZvb2RQb3NpdGlvbikgPCBzaXplICogMC45KSB7IC8vIENoZWNrIGlmIHBvc2l0aW9ucyBhcmUgdmVyeSBjbG9zZVxuICAgICAgICAgICAgICAgIGNvbGxpc2lvbldpdGhTbmFrZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IHdoaWxlIChjb2xsaXNpb25XaXRoU25ha2UpO1xuXG5cbiAgICBjb25zdCB0ZXh0dXJlID0gZ2FtZS5hc3NldHMudGV4dHVyZXNbJ2Zvb2QnXTtcbiAgICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgbWFwOiB0ZXh0dXJlIGluc3RhbmNlb2YgVEhSRUUuVGV4dHVyZSA/IHRleHR1cmUgOiB1bmRlZmluZWQsIGNvbG9yOiB0ZXh0dXJlIGluc3RhbmNlb2YgVEhSRUUuQ29sb3IgPyB0ZXh0dXJlIDogdW5kZWZpbmVkIH0pO1xuICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KHNpemUgLyAyLCAxNiwgMTYpOyAvLyBGb29kIGlzIGEgc3BoZXJlXG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XG4gICAgbWVzaC5wb3NpdGlvbi5jb3B5KGZvb2RQb3NpdGlvbik7XG4gICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgICBnYW1lLnNjZW5lLmFkZChtZXNoKTtcbiAgICBnYW1lLmZvb2QubWVzaCA9IG1lc2g7XG5cbiAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uU3BoZXJlKHNpemUgLyAyKTtcbiAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMC4xIH0pOyAvLyBTbWFsbCBtYXNzIHNvIGl0IGNhbiBiZSAnZWF0ZW4nXG4gICAgYm9keS5hZGRTaGFwZShzaGFwZSk7XG4gICAgYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhmb29kUG9zaXRpb24ueCwgZm9vZFBvc2l0aW9uLnksIGZvb2RQb3NpdGlvbi56KSk7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5hZGRCb2R5KGJvZHkpO1xuICAgIGdhbWUuZm9vZC5ib2R5ID0gYm9keTtcbn1cblxuZnVuY3Rpb24gcGxheVNvdW5kKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHNvdW5kID0gZ2FtZS5hc3NldHMuc291bmRzW25hbWVdO1xuICAgIGlmIChzb3VuZCkge1xuICAgICAgICBzb3VuZC5jdXJyZW50VGltZSA9IDA7IC8vIFJld2luZCB0byBzdGFydCBpZiBhbHJlYWR5IHBsYXlpbmdcbiAgICAgICAgc291bmQucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBGYWlsZWQgdG8gcGxheSBzb3VuZCAke25hbWV9OmAsIGUpKTsgLy8gQ2F0Y2ggcHJvbWlzZSByZWplY3Rpb25cbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kICcke25hbWV9JyBub3QgZm91bmQuYCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVTY29yZVVJKCk6IHZvaWQge1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5KSB7XG4gICAgICAgIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuaW5uZXJUZXh0ID0gYFNjb3JlOiAke2dhbWUuc2NvcmV9YDtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlc2V0R2FtZSgpOiB2b2lkIHtcbiAgICBpZiAoIWdhbWUuZGF0YSB8fCAhZ2FtZS5zY2VuZSB8fCAhZ2FtZS5jYW5ub25Xb3JsZCkgcmV0dXJuO1xuXG4gICAgLy8gQ2xlYXIgZXhpc3Rpbmcgc25ha2UgYW5kIGZvb2RcbiAgICBnYW1lLnNuYWtlLmZvckVhY2goc2VnbWVudCA9PiB7XG4gICAgICAgIGdhbWUuc2NlbmU/LnJlbW92ZShzZWdtZW50Lm1lc2gpO1xuICAgICAgICBzZWdtZW50Lm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgICAgICAoc2VnbWVudC5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XG4gICAgICAgIGdhbWUuY2Fubm9uV29ybGQ/LnJlbW92ZUJvZHkoc2VnbWVudC5ib2R5KTtcbiAgICB9KTtcbiAgICBnYW1lLnNuYWtlID0gW107XG5cbiAgICBpZiAoZ2FtZS5mb29kLm1lc2gpIHtcbiAgICAgICAgZ2FtZS5zY2VuZS5yZW1vdmUoZ2FtZS5mb29kLm1lc2gpO1xuICAgICAgICBnYW1lLmZvb2QubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICAgIChnYW1lLmZvb2QubWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCkuZGlzcG9zZSgpO1xuICAgICAgICBnYW1lLmZvb2QubWVzaCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChnYW1lLmZvb2QuYm9keSkge1xuICAgICAgICBnYW1lLmNhbm5vbldvcmxkLnJlbW92ZUJvZHkoZ2FtZS5mb29kLmJvZHkpO1xuICAgICAgICBnYW1lLmZvb2QuYm9keSA9IG51bGw7XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbCBzbmFrZSBwb3NpdGlvbiAoZS5nLiwgY2VudGVyIG9mIHRoZSBwbGF5YWJsZSBhcmVhKVxuICAgIGNvbnN0IGluaXRpYWxQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAwKTtcblxuICAgIC8vIENyZWF0ZSBpbml0aWFsIHNuYWtlIHNlZ21lbnRzXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnYW1lLmRhdGEuaW5pdGlhbFNuYWtlTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qgc2VnbWVudFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKFxuICAgICAgICAgICAgaW5pdGlhbFBvcy54IC0gaSAqIGdhbWUuZGF0YS5ncmlkU2l6ZSxcbiAgICAgICAgICAgIGluaXRpYWxQb3MueSxcbiAgICAgICAgICAgIGluaXRpYWxQb3MuelxuICAgICAgICApO1xuICAgICAgICBnYW1lLnNuYWtlLnB1c2goY3JlYXRlU25ha2VTZWdtZW50KHNlZ21lbnRQb3MsIGkgPT09IDApKTtcbiAgICB9XG5cbiAgICBnYW1lLmRpcmVjdGlvbi5zZXQoMSwgMCwgMCk7IC8vIFJlc2V0IHRvIG1vdmluZyByaWdodCAoRWFzdClcbiAgICBnYW1lLm5leHREaXJlY3Rpb24uc2V0KDEsIDAsIDApO1xuICAgIGdhbWUuc2NvcmUgPSAwO1xuICAgIHVwZGF0ZVNjb3JlVUkoKTtcbiAgICBnZW5lcmF0ZUZvb2QoKTtcbn1cblxuZnVuY3Rpb24gc3RhcnRHYW1lKCk6IHZvaWQge1xuICAgIGlmICghZ2FtZS5kYXRhKSByZXR1cm47XG5cbiAgICBnYW1lLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4pIGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4pIGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5KSBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXG4gICAgcmVzZXRHYW1lKCk7XG4gICAgaWYgKGdhbWUuYXNzZXRzLnNvdW5kc1snYmdtJ10gJiYgIWdhbWUuYmdtKSB7XG4gICAgICAgIGdhbWUuYmdtID0gZ2FtZS5hc3NldHMuc291bmRzWydiZ20nXTtcbiAgICAgICAgZ2FtZS5iZ20ubG9vcCA9IHRydWU7XG4gICAgICAgIGdhbWUuYmdtLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkZhaWxlZCB0byBwbGF5IEJHTTpcIiwgZSkpO1xuICAgIH0gZWxzZSBpZiAoZ2FtZS5iZ20pIHtcbiAgICAgICAgZ2FtZS5iZ20ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHBsYXkgQkdNOlwiLCBlKSk7XG4gICAgfVxuXG4gICAgcGxheVNvdW5kKCdzdGFydF9nYW1lJyk7XG59XG5cbmZ1bmN0aW9uIGdhbWVPdmVyKCk6IHZvaWQge1xuICAgIGdhbWUuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcbiAgICBpZiAoZ2FtZS5iZ20pIHtcbiAgICAgICAgZ2FtZS5iZ20ucGF1c2UoKTtcbiAgICB9XG4gICAgcGxheVNvdW5kKCdnYW1lX292ZXInKTtcblxuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5KSBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbikgZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgY29uc3QgZmluYWxTY29yZUVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmluYWxTY29yZScpO1xuICAgIGlmIChmaW5hbFNjb3JlRWxlbWVudCkge1xuICAgICAgICBmaW5hbFNjb3JlRWxlbWVudC5pbm5lclRleHQgPSBgU2NvcmU6ICR7Z2FtZS5zY29yZX1gO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlSW5wdXQoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIWdhbWUuZGF0YSkgcmV0dXJuO1xuXG4gICAgY29uc3QgY3VycmVudERpciA9IGdhbWUuZGlyZWN0aW9uO1xuICAgIGxldCBuZXdEaXIgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuXG4gICAgc3dpdGNoIChldmVudC5rZXkpIHtcbiAgICAgICAgY2FzZSAnQXJyb3dVcCc6XG4gICAgICAgICAgICBuZXdEaXIuc2V0KDAsIDAsIC0xKTsgLy8gTW92ZSBOb3J0aCAobmVnYXRpdmUgWilcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJvd0Rvd24nOlxuICAgICAgICAgICAgbmV3RGlyLnNldCgwLCAwLCAxKTsgLy8gTW92ZSBTb3V0aCAocG9zaXRpdmUgWilcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJvd0xlZnQnOlxuICAgICAgICAgICAgbmV3RGlyLnNldCgtMSwgMCwgMCk7IC8vIE1vdmUgV2VzdCAobmVnYXRpdmUgWClcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJvd1JpZ2h0JzpcbiAgICAgICAgICAgIG5ld0Rpci5zZXQoMSwgMCwgMCk7IC8vIE1vdmUgRWFzdCAocG9zaXRpdmUgWClcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICcgJzogLy8gU3BhY2Uga2V5XG4gICAgICAgICAgICBpZiAoZ2FtZS5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSB8fCBnYW1lLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgc2Nyb2xsaW5nXG4gICAgICAgICAgICAgICAgc3RhcnRHYW1lKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47IC8vIERvbid0IHByb2Nlc3Mgc3BhY2UgYXMgYSBkaXJlY3Rpb24gY2hhbmdlXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUHJldmVudCBpbW1lZGlhdGUgcmV2ZXJzZSAoZS5nLiwgdHJ5aW5nIHRvIGdvIGxlZnQgd2hlbiBjdXJyZW50bHkgZ29pbmcgcmlnaHQpXG4gICAgLy8gQ2hlY2sgaWYgbmV3RGlyIGlzIG5vdCBvcHBvc2l0ZSB0byBjdXJyZW50RGlyXG4gICAgaWYgKCFuZXdEaXIuZXF1YWxzKGN1cnJlbnREaXIuY2xvbmUoKS5uZWdhdGUoKSkpIHtcbiAgICAgICAgZ2FtZS5uZXh0RGlyZWN0aW9uLmNvcHkobmV3RGlyKTtcbiAgICB9XG59XG5cbi8vIC0tLSBHYW1lIExvb3AgLS0tXG5cbmZ1bmN0aW9uIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghZ2FtZS5kYXRhIHx8IGdhbWUuZ2FtZVN0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykgcmV0dXJuO1xuXG4gICAgZ2FtZS50aW1lU2luY2VMYXN0TW92ZSArPSBkZWx0YVRpbWU7XG5cbiAgICBpZiAoZ2FtZS50aW1lU2luY2VMYXN0TW92ZSA+PSBnYW1lLm1vdmVJbnRlcnZhbCAvIDEwMDApIHsgLy8gQ29udmVydCBtb3ZlSW50ZXJ2YWwgdG8gc2Vjb25kc1xuICAgICAgICBnYW1lLnRpbWVTaW5jZUxhc3RNb3ZlIC09IGdhbWUubW92ZUludGVydmFsIC8gMTAwMDtcblxuICAgICAgICBnYW1lLmRpcmVjdGlvbi5jb3B5KGdhbWUubmV4dERpcmVjdGlvbik7IC8vIEFwcGx5IGJ1ZmZlcmVkIGRpcmVjdGlvblxuXG4gICAgICAgIC8vIFN0b3JlIGN1cnJlbnQgaGVhZCBwb3NpdGlvbiBiZWZvcmUgbW92aW5nXG4gICAgICAgIGNvbnN0IG9sZEhlYWRQb3NpdGlvbiA9IGdhbWUuc25ha2VbMF0ubWVzaC5wb3NpdGlvbi5jbG9uZSgpO1xuXG4gICAgICAgIC8vIENhbGN1bGF0ZSBuZXcgaGVhZCBwb3NpdGlvblxuICAgICAgICBjb25zdCBoZWFkID0gZ2FtZS5zbmFrZVswXTtcbiAgICAgICAgY29uc3QgbmV3SGVhZFBvc2l0aW9uID0gaGVhZC5tZXNoLnBvc2l0aW9uLmNsb25lKCkuYWRkKGdhbWUuZGlyZWN0aW9uLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoZ2FtZS5kYXRhLmdyaWRTaXplKSk7XG5cbiAgICAgICAgLy8gLS0tIENvbGxpc2lvbiBEZXRlY3Rpb24gLS0tXG4gICAgICAgIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwO1xuICAgICAgICBjb25zdCBoYWxmV29ybGRTaXplID0gd29ybGRTaXplIC8gMjtcbiAgICAgICAgY29uc3QgbWF4Q29vcmQgPSBoYWxmV29ybGRTaXplIC0gZ2FtZS5kYXRhLmdyaWRTaXplIC8gMjtcbiAgICAgICAgY29uc3QgbWluQ29vcmQgPSAtaGFsZldvcmxkU2l6ZSArIGdhbWUuZGF0YS5ncmlkU2l6ZSAvIDI7XG5cbiAgICAgICAgLy8gV2FsbCBjb2xsaXNpb25cbiAgICAgICAgLy8gQ2hlY2sgaWYgbmV3SGVhZFBvc2l0aW9uIGlzIG91dHNpZGUgdGhlIHBsYXkgYXJlYSBkZWZpbmVkIGJ5IG1pbi9tYXhDb29yZFxuICAgICAgICBpZiAobmV3SGVhZFBvc2l0aW9uLnggPiBtYXhDb29yZCB8fCBuZXdIZWFkUG9zaXRpb24ueCA8IG1pbkNvb3JkIHx8XG4gICAgICAgICAgICBuZXdIZWFkUG9zaXRpb24ueiA+IG1heENvb3JkIHx8IG5ld0hlYWRQb3NpdGlvbi56IDwgbWluQ29vcmQpIHtcbiAgICAgICAgICAgIGdhbWVPdmVyKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTZWxmLWNvbGxpc2lvbiAoY2hlY2sgbmV3IGhlYWQgcG9zaXRpb24gYWdhaW5zdCBhbGwgYm9keSBzZWdtZW50cyBleGNlcHQgdGhlIGN1cnJlbnQgaGVhZClcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBnYW1lLnNuYWtlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAobmV3SGVhZFBvc2l0aW9uLmRpc3RhbmNlVG8oZ2FtZS5zbmFrZVtpXS5tZXNoLnBvc2l0aW9uKSA8IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDAuOSkgeyAvLyBDaGVjayBpZiBwb3NpdGlvbnMgYXJlIHZlcnkgY2xvc2VcbiAgICAgICAgICAgICAgICBnYW1lT3ZlcigpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1vdmUgc25ha2U6IEhlYWQgbW92ZXMgdG8gbmV3IHBvc2l0aW9uLCBib2R5IHNlZ21lbnRzIGZvbGxvd1xuICAgICAgICBmb3IgKGxldCBpID0gZ2FtZS5zbmFrZS5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICAgICAgICBnYW1lLnNuYWtlW2ldLm1lc2gucG9zaXRpb24uY29weShnYW1lLnNuYWtlW2kgLSAxXS5tZXNoLnBvc2l0aW9uKTtcbiAgICAgICAgICAgIGdhbWUuc25ha2VbaV0uYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhnYW1lLnNuYWtlW2kgLSAxXS5tZXNoLnBvc2l0aW9uLngsIGdhbWUuc25ha2VbaSAtIDFdLm1lc2gucG9zaXRpb24ueSwgZ2FtZS5zbmFrZVtpIC0gMV0ubWVzaC5wb3NpdGlvbi56KSk7XG4gICAgICAgIH1cbiAgICAgICAgaGVhZC5tZXNoLnBvc2l0aW9uLmNvcHkobmV3SGVhZFBvc2l0aW9uKTtcbiAgICAgICAgaGVhZC5ib2R5LnBvc2l0aW9uLmNvcHkobmV3IENBTk5PTi5WZWMzKG5ld0hlYWRQb3NpdGlvbi54LCBuZXdIZWFkUG9zaXRpb24ueSwgbmV3SGVhZFBvc2l0aW9uLnopKTtcblxuXG4gICAgICAgIC8vIEZvb2QgY29sbGlzaW9uXG4gICAgICAgIGlmIChnYW1lLmZvb2QubWVzaCAmJiBuZXdIZWFkUG9zaXRpb24uZGlzdGFuY2VUbyhnYW1lLmZvb2QubWVzaC5wb3NpdGlvbikgPCBnYW1lLmRhdGEuZ3JpZFNpemUgKiAwLjkpIHtcbiAgICAgICAgICAgIHBsYXlTb3VuZCgnZWF0X2Zvb2QnKTtcbiAgICAgICAgICAgIGdhbWUuc2NvcmUrKztcbiAgICAgICAgICAgIHVwZGF0ZVNjb3JlVUkoKTtcblxuICAgICAgICAgICAgLy8gQWRkIG5ldyBzZWdtZW50IGF0IHRoZSBvbGQgdGFpbCdzIHBvc2l0aW9uICh0aGUgcG9zaXRpb24gb2YgdGhlIHNlZ21lbnQgdGhhdCB3YXMgbW92ZWQgZnJvbSBieSB0aGUgbGFzdCBzZWdtZW50KVxuICAgICAgICAgICAgLy8gVGhlIHNlZ21lbnQgdGhhdCB3YXMgYXQgZ2FtZS5zbmFrZVtnYW1lLnNuYWtlLmxlbmd0aCAtIDFdIGJlZm9yZSB0aGUgbW92ZSBub3cgbmVlZHMgYSBuZXcgb25lIGJlaGluZCBpdC5cbiAgICAgICAgICAgIC8vIFRoZSBvbGRIZWFkUG9zaXRpb24gKHdoaWNoIGlzIG5vdyBlZmZlY3RpdmVseSB0aGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IGJvZHkgc2VnbWVudClcbiAgICAgICAgICAgIC8vIGlzIG5vdCBzdWl0YWJsZSBmb3IgdGhlIG5ldyBzZWdtZW50LiBJbnN0ZWFkLCB0aGUgbGFzdCBzZWdtZW50J3MgKnByZXZpb3VzKiBwb3NpdGlvblxuICAgICAgICAgICAgLy8gKGJlZm9yZSBpdCBtb3ZlZCkgaXMgdGhlIGNvcnJlY3Qgc3BvdC4gQnV0IHNpbmNlIHdlIGp1c3QgbW92ZWQgZXZlcnl0aGluZyxcbiAgICAgICAgICAgIC8vIHRoZSBuZXcgc2VnbWVudCBzaG91bGQgYWN0dWFsbHkgb2NjdXB5IHRoZSBgb2xkSGVhZFBvc2l0aW9uYCdzIGxhc3QgcG9zaXRpb24uXG4gICAgICAgICAgICAvLyBBIHNpbXBsZXIgYXBwcm9hY2g6IGNyZWF0ZSB0aGUgbmV3IHNlZ21lbnQgYXQgdGhlIHBvc2l0aW9uIG9mIHRoZSBsYXN0IHNlZ21lbnQgKmFmdGVyKiB0aGUgbW92ZS5cbiAgICAgICAgICAgIC8vIFRoaXMgbWFrZXMgdGhlIHNuYWtlIGdyb3cgZnJvbSBpdHMgdGFpbCBpbiB0aGUgZGlyZWN0aW9uIGl0IHdhcyBtb3ZpbmcuXG4gICAgICAgICAgICBjb25zdCBsYXN0U2VnbWVudEN1cnJlbnRQb3MgPSBnYW1lLnNuYWtlW2dhbWUuc25ha2UubGVuZ3RoIC0gMV0ubWVzaC5wb3NpdGlvbi5jbG9uZSgpO1xuICAgICAgICAgICAgZ2FtZS5zbmFrZS5wdXNoKGNyZWF0ZVNuYWtlU2VnbWVudChsYXN0U2VnbWVudEN1cnJlbnRQb3MsIGZhbHNlKSk7IFxuXG4gICAgICAgICAgICBnZW5lcmF0ZUZvb2QoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBDYW5ub24uanMgd29ybGQgKGV2ZW4gaWYgcG9zaXRpb25zIGFyZSBtYW51YWxseSBzZXQsIHRoaXMgcHJvY2Vzc2VzIHBvdGVudGlhbCBjb250YWN0IGNhbGxiYWNrcyBpZiBhbnkgd2VyZSBzZXQgdXApXG4gICAgaWYgKGdhbWUuY2Fubm9uV29ybGQpIHtcbiAgICAgICAgLy8gVXNlIGEgZml4ZWQgdGltZSBzdGVwIGZvciBwaHlzaWNzIHNpbXVsYXRpb24gZm9yIHN0YWJpbGl0eVxuICAgICAgICBjb25zdCBmaXhlZFRpbWVTdGVwID0gMSAvIDYwOyAvLyA2MCBIelxuICAgICAgICBnYW1lLmNhbm5vbldvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCAzKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlcigpOiB2b2lkIHtcbiAgICBpZiAoZ2FtZS5yZW5kZXJlciAmJiBnYW1lLnNjZW5lICYmIGdhbWUuY2FtZXJhKSB7XG4gICAgICAgIGdhbWUucmVuZGVyZXIucmVuZGVyKGdhbWUuc2NlbmUsIGdhbWUuY2FtZXJhKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdhbWVMb29wKGN1cnJlbnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcbiAgICAvLyBDb252ZXJ0IGRlbHRhVGltZSB0byBzZWNvbmRzIGZvciBjb25zaXN0ZW5jeSB3aXRoIENhbm5vbi5qcyBzdGVwXG4gICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gZ2FtZS5sYXN0VXBkYXRlVGltZSkgLyAxMDAwOyBcbiAgICBnYW1lLmxhc3RVcGRhdGVUaW1lID0gY3VycmVudFRpbWU7XG5cbiAgICB1cGRhdGUoZGVsdGFUaW1lKTtcbiAgICByZW5kZXIoKTtcblxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShnYW1lTG9vcCk7XG59XG5cbi8vIC0tLSBNYWluIEVudHJ5IFBvaW50IC0tLVxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGFzeW5jICgpID0+IHtcbiAgICBnYW1lLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XG4gICAgaWYgKCFnYW1lLmNhbnZhcykge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCAnZ2FtZUNhbnZhcycgbm90IGZvdW5kLlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IGxvYWRHYW1lRGF0YSgpO1xuICAgIGlmICghZ2FtZS5kYXRhKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBzZXR1cFVJKCk7IC8vIFNldCB1cCBVSSBlbGVtZW50c1xuXG4gICAgYXdhaXQgcHJlbG9hZEFzc2V0cygpO1xuICAgIGNyZWF0ZUdhbWVXb3JsZCgpO1xuXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBoYW5kbGVJbnB1dCk7XG5cbiAgICAvLyBJbml0aWFsIHJlbmRlciBvZiB0aGUgdGl0bGUgc2NyZWVuXG4gICAgZ2FtZS5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbikgZ2FtZS51aUVsZW1lbnRzLnRpdGxlU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkpIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICBpZiAoZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuKSBnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuICAgIGdhbWUubGFzdFVwZGF0ZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTsgLy8gSW5pdGlhbGl6ZSBsYXN0VXBkYXRlVGltZVxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShnYW1lTG9vcCk7XG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBZ0N4QixJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFIQyxTQUFBQTtBQUFBLEdBQUE7QUFNTCxNQUFNLE9Bd0JGO0FBQUEsRUFDQSxNQUFNO0FBQUEsRUFDTixRQUFRLEVBQUUsVUFBVSxDQUFDLEdBQUcsUUFBUSxDQUFDLEVBQUU7QUFBQSxFQUNuQyxRQUFRO0FBQUEsRUFDUixVQUFVO0FBQUEsRUFDVixPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixhQUFhO0FBQUEsRUFDYixPQUFPLENBQUM7QUFBQSxFQUNSLE1BQU0sRUFBRSxNQUFNLE1BQU0sTUFBTSxLQUFLO0FBQUEsRUFDL0IsV0FBVyxJQUFJLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztBQUFBO0FBQUEsRUFDcEMsZUFBZSxJQUFJLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztBQUFBLEVBQ3hDLE9BQU87QUFBQSxFQUNQLFdBQVc7QUFBQSxFQUNYLGdCQUFnQjtBQUFBLEVBQ2hCLG1CQUFtQjtBQUFBLEVBQ25CLGNBQWM7QUFBQTtBQUFBLEVBQ2QsWUFBWTtBQUFBLElBQ1IsYUFBYTtBQUFBLElBQ2IsY0FBYztBQUFBLElBQ2QsZ0JBQWdCO0FBQUEsRUFDcEI7QUFBQSxFQUNBLEtBQUs7QUFBQSxFQUNMLFlBQVksQ0FBQztBQUNqQjtBQUlBLGVBQWUsZUFBOEI7QUFDekMsTUFBSTtBQUNBLFVBQU0sV0FBVyxNQUFNLE1BQU0sV0FBVztBQUN4QyxRQUFJLENBQUMsU0FBUyxJQUFJO0FBQ2QsWUFBTSxJQUFJLE1BQU0sNkJBQTZCLFNBQVMsVUFBVSxFQUFFO0FB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QVMsS0FBSyxJQUFJLE9BQU8sS0FBSyxnQkFBZ0IsR0FBRyxnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDO0FBSWhHLFFBQUksS0FBSyxLQUFLLFFBQVEsZ0JBQWdCLFdBQVcsS0FBSyxLQUFLLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSyxXQUFXLEtBQUs7QUFDbEcsZ0JBQVUsVUFBVTtBQUNwQixXQUFLO0FBQ0wsb0JBQWM7QUFVZCxZQUFNLHdCQUF3QixLQUFLLE1BQU0sS0FBSyxNQUFNLFNBQVMsQ0FBQyxFQUFFLEtBQUssU0FBUyxNQUFNO0FBQ3BGLFdBQUssTUFBTSxLQUFLLG1CQUFtQix1QkFBdUIsS0FBSyxDQUFDO0FBRWhFLG1CQUFhO0FBQUEsSUFDakI7QUFBQSxFQUNKO0FBR0EsTUFBSSxLQUFLLGFBQWE7QUFFbEIsVUFBTSxnQkFBZ0IsSUFBSTtBQUMxQixTQUFLLFlBQVksS0FBSyxlQUFlLFdBQVcsQ0FBQztBQUFBLEVBQ3JEO0FBQ0o7QUFFQSxTQUFTLFNBQWU7QUFDcEIsTUFBSSxLQUFLLFlBQVksS0FBSyxTQUFTLEtBQUssUUFBUTtBQUM1QyxTQUFLLFNBQVMsT0FBTyxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQUEsRUFDaEQ7QUFDSjtBQUVBLFNBQVMsU0FBUyxhQUEyQjtBQUV6QyxRQUFNLGFBQWEsY0FBYyxLQUFLLGtCQUFrQjtBQUN4RCxPQUFLLGlCQUFpQjtBQUV0QixTQUFPLFNBQVM7QUFDaEIsU0FBTztBQUVQLHdCQUFzQixRQUFRO0FBQ2xDO0FBR0EsU0FBUyxpQkFBaUIsb0JBQW9CLFlBQVk7QUFDdEQsT0FBSyxTQUFTLFNBQVMsZUFBZSxZQUFZO0FBQ2xELE1BQUksQ0FBQyxLQUFLLFFBQVE7QUFDZCxZQUFRLE1BQU0sZ0RBQWdEO0FBQzlEO0FBQUEsRUFDSjtBQUVBLFFBQU0sYUFBYTtBQUNuQixNQUFJLENBQUMsS0FBSyxNQUFNO0FBQ1o7QUFBQSxFQUNKO0FBRUEsVUFBUTtBQUVSLFFBQU0sY0FBYztBQUNwQixrQkFBZ0I7QUFFaEIsU0FBTyxpQkFBaUIsV0FBVyxXQUFXO0FBRzlDLE9BQUssWUFBWTtBQUNqQixNQUFJLEtBQUssV0FBVyxZQUFhLE1BQUssV0FBVyxZQUFZLE1BQU0sVUFBVTtBQUM3RSxNQUFJLEtBQUssV0FBVyxhQUFjLE1BQUssV0FBVyxhQUFhLE1BQU0sVUFBVTtBQUMvRSxNQUFJLEtBQUssV0FBVyxlQUFnQixNQUFLLFdBQVcsZUFBZSxNQUFNLFVBQVU7QUFFbkYsT0FBSyxpQkFBaUIsWUFBWSxJQUFJO0FBQ3RDLHdCQUFzQixRQUFRO0FBQ2xDLENBQUM7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSJdCn0K
