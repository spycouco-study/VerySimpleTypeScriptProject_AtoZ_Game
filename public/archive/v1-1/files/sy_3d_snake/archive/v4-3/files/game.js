import * as THREE from "three";
import * as CANNON from "cannon-es";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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
  controls: null,
  // 초기화
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
        <h1>3D \uBC40 \uAC9C</h1>
        <p style="font-size: 24px;">Press SPACE to Start</p>
        <p style="font-size: 18px;">Use Arrow Keys to Move</p>
        <p style="font-size: 18px;">Use Mouse to Rotate Camera</p> <!-- \uB9C8\uC6B0\uC2A4 \uC124\uBA85 \uCD94\uAC00 -->
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
  game.renderer = new THREE.WebGLRenderer({ canvas: game.canvas, antialias: true });
  game.renderer.setSize(game.data.canvasWidth, game.data.canvasHeight);
  game.renderer.shadowMap.enabled = true;
  game.controls = new OrbitControls(game.camera, game.renderer.domElement);
  game.controls.enableDDamping = true;
  game.controls.dampingFactor = 0.05;
  game.controls.screenSpacePanning = false;
  game.controls.minDistance = 5;
  game.controls.maxDistance = 50;
  game.controls.target.set(0, 0, 0);
  game.controls.enabled = false;
  game.controls.update();
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
  if (game.controls) {
    game.controls.enabled = true;
  }
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
  if (game.controls) {
    game.controls.enabled = false;
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
  if (game.controls) {
    game.controls.update();
  }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xuaW1wb3J0ICogYXMgQ0FOTk9OIGZyb20gJ2Nhbm5vbi1lcyc7XG5pbXBvcnQgeyBPcmJpdENvbnRyb2xzIH0gZnJvbSAndGhyZWUvZXhhbXBsZXMvanNtL2NvbnRyb2xzL09yYml0Q29udHJvbHMuanMnO1xuXG4vLyAtLS0gR2xvYmFsIEdhbWUgU3RhdGUgYW5kIENvbmZpZ3VyYXRpb24gLS0tXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcbiAgICBncmlkU2l6ZTogbnVtYmVyOyAvLyBTaXplIG9mIGVhY2ggZ3JpZCBjZWxsIGluIHdvcmxkIHVuaXRzXG4gICAgc25ha2VTcGVlZDogbnVtYmVyOyAvLyBIb3cgbWFueSBncmlkIGNlbGxzIHBlciBzZWNvbmQgdGhlIHNuYWtlIG1vdmVzXG4gICAgaW5pdGlhbFNuYWtlTGVuZ3RoOiBudW1iZXI7XG4gICAgd2FsbFRoaWNrbmVzczogbnVtYmVyOyAvLyBUaGlja25lc3Mgb2YgdGhlIHdhbGxzIGluIHdvcmxkIHVuaXRzXG4gICAgY2FtZXJhRk9WOiBudW1iZXI7XG4gICAgY2FtZXJhTmVhcjogbnVtYmVyO1xuICAgIGNhbWVyYUZhcjogbnVtYmVyO1xuICAgIGNhbWVyYVBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IH07XG4gICAgbGlnaHRQb3NpdGlvbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB9O1xuICAgIGNvbG9yczoge1xuICAgICAgICBiYWNrZ3JvdW5kOiBudW1iZXI7XG4gICAgICAgIHRpdGxlVGV4dDogc3RyaW5nO1xuICAgICAgICBzY29yZVRleHQ6IHN0cmluZztcbiAgICAgICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XG4gICAgfVxuICAgIGFzc2V0czoge1xuICAgICAgICBpbWFnZXM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9PjtcbiAgICAgICAgc291bmRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyOyB9PjtcbiAgICB9O1xufVxuXG5pbnRlcmZhY2UgTG9hZGVkQXNzZXRzIHtcbiAgICB0ZXh0dXJlczogeyBba2V5OiBzdHJpbmddOiBUSFJFRS5UZXh0dXJlIHwgVEhSRUUuQ29sb3IgfTtcbiAgICBzb3VuZHM6IHsgW2tleTogc3RyaW5nXTogSFRNTEF1ZGlvRWxlbWVudCB9O1xufVxuXG5lbnVtIEdhbWVTdGF0ZSB7XG4gICAgVElUTEUsXG4gICAgUExBWUlORyxcbiAgICBHQU1FX09WRVIsXG59XG5cbmNvbnN0IGdhbWU6IHtcbiAgICBkYXRhOiBHYW1lQ29uZmlnIHwgbnVsbDtcbiAgICBhc3NldHM6IExvYWRlZEFzc2V0cztcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbDtcbiAgICByZW5kZXJlcjogVEhSRUUuV2ViR0xSZW5kZXJlciB8IG51bGw7XG4gICAgc2NlbmU6IFRIUkVFLlNjZW5lIHwgbnVsbDtcbiAgICBjYW1lcmE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhIHwgbnVsbDtcbiAgICBjb250cm9sczogT3JiaXRDb250cm9scyB8IG51bGw7IC8vIE9yYml0Q29udHJvbHMgXHVDRDk0XHVBQzAwXG4gICAgY2Fubm9uV29ybGQ6IENBTk5PTi5Xb3JsZCB8IG51bGw7XG4gICAgc25ha2U6IHsgbWVzaDogVEhSRUUuTWVzaDsgYm9keTogQ0FOTk9OLkJvZHk7IH1bXTtcbiAgICBmb29kOiB7IG1lc2g6IFRIUkVFLk1lc2ggfCBudWxsOyBib2R5OiBDQU5OT04uQm9keSB8IG51bGw7IH07XG4gICAgZGlyZWN0aW9uOiBUSFJFRS5WZWN0b3IzO1xuICAgIG5leHREaXJlY3Rpb246IFRIUkVFLlZlY3RvcjM7XG4gICAgc2NvcmU6IG51bWJlcjtcbiAgICBnYW1lU3RhdGU6IEdhbWVTdGF0ZTtcbiAgICBsYXN0VXBkYXRlVGltZTogbnVtYmVyO1xuICAgIHRpbWVTaW5jZUxhc3RNb3ZlOiBudW1iZXI7XG4gICAgbW92ZUludGVydmFsOiBudW1iZXI7IC8vIFRpbWUgaW4gbXMgYmV0d2VlbiBzbmFrZSBtb3Zlc1xuICAgIHVpRWxlbWVudHM6IHtcbiAgICAgICAgdGl0bGVTY3JlZW46IEhUTUxEaXZFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgc2NvcmVEaXNwbGF5OiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XG4gICAgICAgIGdhbWVPdmVyU2NyZWVuOiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XG4gICAgfTtcbiAgICBiZ206IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsO1xuICAgIHdhbGxCb2RpZXM6IENBTk5PTi5Cb2R5W107IC8vIFRvIGhvbGQgcmVmZXJlbmNlcyB0byBjYW5ub24gd2FsbCBib2RpZXNcbn0gPSB7XG4gICAgZGF0YTogbnVsbCxcbiAgICBhc3NldHM6IHsgdGV4dHVyZXM6IHt9LCBzb3VuZHM6IHt9IH0sXG4gICAgY2FudmFzOiBudWxsLFxuICAgIHJlbmRlcmVyOiBudWxsLFxuICAgIHNjZW5lOiBudWxsLFxuICAgIGNhbWVyYTogbnVsbCxcbiAgICBjb250cm9sczogbnVsbCwgLy8gXHVDRDA4XHVBRTMwXHVENjU0XG4gICAgY2Fubm9uV29ybGQ6IG51bGwsXG4gICAgc25ha2U6IFtdLFxuICAgIGZvb2Q6IHsgbWVzaDogbnVsbCwgYm9keTogbnVsbCB9LFxuICAgIGRpcmVjdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoMSwgMCwgMCksIC8vIEluaXRpYWwgZGlyZWN0aW9uOiBFYXN0IChwb3NpdGl2ZSBYKVxuICAgIG5leHREaXJlY3Rpb246IG5ldyBUSFJFRS5WZWN0b3IzKDEsIDAsIDApLFxuICAgIHNjb3JlOiAwLFxuICAgIGdhbWVTdGF0ZTogR2FtZVN0YXRlLlRJVExFLFxuICAgIGxhc3RVcGRhdGVUaW1lOiAwLFxuICAgIHRpbWVTaW5jZUxhc3RNb3ZlOiAwLFxuICAgIG1vdmVJbnRlcnZhbDogMCwgLy8gV2lsbCBiZSBjYWxjdWxhdGVkIGZyb20gc25ha2VTcGVlZFxuICAgIHVpRWxlbWVudHM6IHtcbiAgICAgICAgdGl0bGVTY3JlZW46IG51bGwsXG4gICAgICAgIHNjb3JlRGlzcGxheTogbnVsbCxcbiAgICAgICAgZ2FtZU92ZXJTY3JlZW46IG51bGwsXG4gICAgfSxcbiAgICBiZ206IG51bGwsXG4gICAgd2FsbEJvZGllczogW10sXG59O1xuXG4vLyAtLS0gR2FtZSBJbml0aWFsaXphdGlvbiAtLS1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZEdhbWVEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGRhdGEuanNvbjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgICB9XG4gICAgICAgIGdhbWUuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBHYW1lQ29uZmlnO1xuICAgICAgICBjb25zb2xlLmxvZyhcIkdhbWUgZGF0YSBsb2FkZWQ6XCIsIGdhbWUuZGF0YSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGxvYWRpbmcgZ2FtZSBkYXRhOlwiLCBlcnJvcik7XG4gICAgICAgIGFsZXJ0KFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uLiBQbGVhc2UgY2hlY2sgZGF0YS5qc29uLlwiKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByZWxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFnYW1lLmRhdGEpIHJldHVybjtcblxuICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xuICAgIGNvbnN0IGF1ZGlvUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuICAgIGNvbnN0IHRleHR1cmVQcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cbiAgICAvLyBBZGQgcGxhY2Vob2xkZXIgdGV4dHVyZXMgaWYgYWN0dWFsIGFzc2V0cyBhcmUgbm90IGZvdW5kIGluIGRhdGEuanNvblxuICAgIC8vIFRoaXMgYWxsb3dzIHRoZSBnYW1lIHRvIHJ1biBldmVuIGlmIHNvbWUgYXNzZXRzIGFyZSBtaXNzaW5nLlxuICAgIC8vIEVuc3VyZSBhbGwgY3JpdGljYWwgdGV4dHVyZSBuYW1lcyBhcmUgcHJlc2VudCBpbiBhc3NldHMudGV4dHVyZXNcbiAgICBjb25zdCByZXF1aXJlZFRleHR1cmVzID0gWydzbmFrZV9oZWFkJywgJ3NuYWtlX2JvZHknLCAnZm9vZCcsICd3YWxsX3RleHR1cmUnXTtcbiAgICBmb3IoY29uc3QgbmFtZSBvZiByZXF1aXJlZFRleHR1cmVzKSB7XG4gICAgICAgIGlmICghZ2FtZS5kYXRhLmFzc2V0cy5pbWFnZXMuc29tZShpbWcgPT4gaW1nLm5hbWUgPT09IG5hbWUpKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFRleHR1cmUgJyR7bmFtZX0nIG5vdCBmb3VuZCBpbiBkYXRhLmpzb24uIFVzaW5nIGEgcGxhY2Vob2xkZXIuYCk7XG4gICAgICAgICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tuYW1lXSA9IG5ldyBUSFJFRS5Db2xvcigweDg4ODg4OCk7IC8vIERlZmF1bHQgY29sb3JcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZm9yIChjb25zdCBpbWcgb2YgZ2FtZS5kYXRhLmFzc2V0cy5pbWFnZXMpIHtcbiAgICAgICAgdGV4dHVyZVByb21pc2VzLnB1c2gobmV3IFByb21pc2UoKHJlc29sdmUpID0+IHsgLy8gQ2hhbmdlZCB0byByZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIGdhbWVcbiAgICAgICAgICAgIHRleHR1cmVMb2FkZXIubG9hZChcbiAgICAgICAgICAgICAgICBpbWcucGF0aCxcbiAgICAgICAgICAgICAgICAodGV4dHVyZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tpbWcubmFtZV0gPSB0ZXh0dXJlO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgKGVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIGxvYWRpbmcgdGV4dHVyZSAke2ltZy5uYW1lfSBmcm9tICR7aW1nLnBhdGh9OmAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgZ2FtZS5hc3NldHMudGV4dHVyZXNbaW1nLm5hbWVdID0gbmV3IFRIUkVFLkNvbG9yKDB4ODg4ODg4KTsgLy8gRmFsbGJhY2sgdG8gY29sb3JcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gYWxsb3cgZ2FtZSB0byBjb250aW51ZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICAvLyBFbnN1cmUgYWxsIGNyaXRpY2FsIHNvdW5kIG5hbWVzIGFyZSBwcmVzZW50IGluIGFzc2V0cy5zb3VuZHNcbiAgICBjb25zdCByZXF1aXJlZFNvdW5kcyA9IFsnZWF0X2Zvb2QnLCAnZ2FtZV9vdmVyJywgJ2JnbScsICdzdGFydF9nYW1lJ107XG4gICAgZm9yKGNvbnN0IG5hbWUgb2YgcmVxdWlyZWRTb3VuZHMpIHtcbiAgICAgICAgaWYgKCFnYW1lLmRhdGEuYXNzZXRzLnNvdW5kcy5zb21lKHMgPT4gcy5uYW1lID09PSBuYW1lKSkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtuYW1lfScgbm90IGZvdW5kIGluIGRhdGEuanNvbi4gV2lsbCBub3QgcGxheS5gKTtcbiAgICAgICAgICAgIC8vIE5vIGRlZmF1bHQgc291bmQsIGp1c3Qgd29uJ3QgYmUgaW4gZ2FtZS5hc3NldHMuc291bmRzXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHNvdW5kIG9mIGdhbWUuZGF0YS5hc3NldHMuc291bmRzKSB7XG4gICAgICAgIGF1ZGlvUHJvbWlzZXMucHVzaChuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4geyAvLyBDaGFuZ2VkIHRvIHJlc29sdmUgZXZlbiBvbiBlcnJvclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIFByZWxvYWQgdGhlIGF1ZGlvXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGdhbWUuYXNzZXRzLnNvdW5kc1tzb3VuZC5uYW1lXSA9IGF1ZGlvO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIHNvdW5kICR7c291bmQubmFtZX0gZnJvbSAke3NvdW5kLnBhdGh9OmAsIGUpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIGFsbG93IGdhbWUgdG8gY29udGludWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4udGV4dHVyZVByb21pc2VzLCAuLi5hdWRpb1Byb21pc2VzXSk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBwcmVsb2FkZWQgKG9yIGZhbGxlbiBiYWNrIHRvIHBsYWNlaG9sZGVycykuXCIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJVbmV4cGVjdGVkIGVycm9yIGR1cmluZyBhc3NldCBwcmVsb2FkaW5nOlwiLCBlcnJvcik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzZXR1cFVJKCk6IHZvaWQge1xuICAgIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLmNhbnZhcykgcmV0dXJuO1xuXG4gICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmJvZHk7XG4gICAgYm9keS5zdHlsZS5tYXJnaW4gPSAnMCc7XG4gICAgYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXG4gICAgLy8gVGl0bGUgU2NyZWVuXG4gICAgY29uc3QgdGl0bGVTY3JlZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB0aXRsZVNjcmVlbi5pZCA9ICd0aXRsZVNjcmVlbic7XG4gICAgT2JqZWN0LmFzc2lnbih0aXRsZVNjcmVlbi5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgICAgdG9wOiAnMCcsXG4gICAgICAgIGxlZnQ6ICcwJyxcbiAgICAgICAgd2lkdGg6ICcxMDAlJyxcbiAgICAgICAgaGVpZ2h0OiAnMTAwJScsXG4gICAgICAgIGJhY2tncm91bmRDb2xvcjogYHJnYmEoMCwgMCwgMCwgMC43KWAsXG4gICAgICAgIGNvbG9yOiBnYW1lLmRhdGEuY29sb3JzLnRpdGxlVGV4dCxcbiAgICAgICAgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcbiAgICAgICAgZGlzcGxheTogJ2ZsZXgnLFxuICAgICAgICBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcbiAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiAgICAgICAgekluZGV4OiAnMTAwJyxcbiAgICAgICAgZm9udFNpemU6ICc0OHB4JyxcbiAgICAgICAgdGV4dEFsaWduOiAnY2VudGVyJyxcbiAgICB9KTtcbiAgICB0aXRsZVNjcmVlbi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxoMT4zRCBcdUJDNDAgXHVBQzlDPC9oMT5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDI0cHg7XCI+UHJlc3MgU1BBQ0UgdG8gU3RhcnQ8L3A+XG4gICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAxOHB4O1wiPlVzZSBBcnJvdyBLZXlzIHRvIE1vdmU8L3A+XG4gICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAxOHB4O1wiPlVzZSBNb3VzZSB0byBSb3RhdGUgQ2FtZXJhPC9wPiA8IS0tIFx1QjlDOFx1QzZCMFx1QzJBNCBcdUMxMjRcdUJBODUgXHVDRDk0XHVBQzAwIC0tPlxuICAgIGA7XG4gICAgYm9keS5hcHBlbmRDaGlsZCh0aXRsZVNjcmVlbik7XG4gICAgZ2FtZS51aUVsZW1lbnRzLnRpdGxlU2NyZWVuID0gdGl0bGVTY3JlZW47XG5cbiAgICAvLyBTY29yZSBEaXNwbGF5XG4gICAgY29uc3Qgc2NvcmVEaXNwbGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgc2NvcmVEaXNwbGF5LmlkID0gJ3Njb3JlRGlzcGxheSc7XG4gICAgT2JqZWN0LmFzc2lnbihzY29yZURpc3BsYXkuc3R5bGUsIHtcbiAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXG4gICAgICAgIHRvcDogJzEwcHgnLFxuICAgICAgICBsZWZ0OiAnMTBweCcsXG4gICAgICAgIGNvbG9yOiBnYW1lLmRhdGEuY29sb3JzLnNjb3JlVGV4dCxcbiAgICAgICAgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcbiAgICAgICAgZm9udFNpemU6ICcyNHB4JyxcbiAgICAgICAgekluZGV4OiAnMTAxJyxcbiAgICAgICAgZGlzcGxheTogJ25vbmUnLCAvLyBIaWRkZW4gaW5pdGlhbGx5XG4gICAgfSk7XG4gICAgc2NvcmVEaXNwbGF5LmlubmVyVGV4dCA9IGBTY29yZTogMGA7XG4gICAgYm9keS5hcHBlbmRDaGlsZChzY29yZURpc3BsYXkpO1xuICAgIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkgPSBzY29yZURpc3BsYXk7XG5cbiAgICAvLyBHYW1lIE92ZXIgU2NyZWVuXG4gICAgY29uc3QgZ2FtZU92ZXJTY3JlZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBnYW1lT3ZlclNjcmVlbi5pZCA9ICdnYW1lT3ZlclNjcmVlbic7XG4gICAgT2JqZWN0LmFzc2lnbihnYW1lT3ZlclNjcmVlbi5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgICAgdG9wOiAnMCcsXG4gICAgICAgIGxlZnQ6ICcwJyxcbiAgICAgICAgd2lkdGg6ICcxMDAlJyxcbiAgICAgICAgaGVpZ2h0OiAnMTAwJScsXG4gICAgICAgIGJhY2tncm91bmRDb2xvcjogYHJnYmEoMCwgMCwgMCwgMC43KWAsXG4gICAgICAgIGNvbG9yOiBnYW1lLmRhdGEuY29sb3JzLmdhbWVPdmVyVGV4dCxcbiAgICAgICAgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcbiAgICAgICAgZGlzcGxheTogJ25vbmUnLCAvLyBIaWRkZW4gaW5pdGlhbGx5XG4gICAgICAgIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLFxuICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsXG4gICAgICAgIGFsaWduSXRlbXM6ICdjZW50ZXInLFxuICAgICAgICB6SW5kZXg6ICcxMDInLFxuICAgICAgICBmb250U2l6ZTogJzQ4cHgnLFxuICAgICAgICB0ZXh0QWxpZ246ICdjZW50ZXInLFxuICAgIH0pO1xuICAgIGdhbWVPdmVyU2NyZWVuLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGgxPkdBTUUgT1ZFUiE8L2gxPlxuICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMzZweDtcIiBpZD1cImZpbmFsU2NvcmVcIj5TY29yZTogMDwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDI0cHg7XCI+UHJlc3MgU1BBQ0UgdG8gUmVzdGFydDwvcD5cbiAgICBgO1xuICAgIGJvZHkuYXBwZW5kQ2hpbGQoZ2FtZU92ZXJTY3JlZW4pO1xuICAgIGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbiA9IGdhbWVPdmVyU2NyZWVuO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVHYW1lV29ybGQoKTogdm9pZCB7XG4gICAgaWYgKCFnYW1lLmRhdGEgfHwgIWdhbWUuY2FudmFzKSByZXR1cm47XG5cbiAgICAvLyBUaHJlZS5qcyBzZXR1cFxuICAgIGdhbWUuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgICBnYW1lLnNjZW5lLmJhY2tncm91bmQgPSBuZXcgVEhSRUUuQ29sb3IoZ2FtZS5kYXRhLmNvbG9ycy5iYWNrZ3JvdW5kKTtcblxuICAgIGdhbWUuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxuICAgICAgICBnYW1lLmRhdGEuY2FtZXJhRk9WLFxuICAgICAgICBnYW1lLmRhdGEuY2FudmFzV2lkdGggLyBnYW1lLmRhdGEuY2FudmFzSGVpZ2h0LFxuICAgICAgICBnYW1lLmRhdGEuY2FtZXJhTmVhcixcbiAgICAgICAgZ2FtZS5kYXRhLmNhbWVyYUZhclxuICAgICk7XG4gICAgZ2FtZS5jYW1lcmEucG9zaXRpb24uc2V0KFxuICAgICAgICBnYW1lLmRhdGEuY2FtZXJhUG9zaXRpb24ueCxcbiAgICAgICAgZ2FtZS5kYXRhLmNhbWVyYVBvc2l0aW9uLnksXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi56XG4gICAgKTtcbiAgICAvLyBnYW1lLmNhbWVyYS5sb29rQXQoMCwgMCwgMCk7IC8vIE9yYml0Q29udHJvbHNcdUFDMDAgXHVDRTc0XHVCQTU0XHVCNzdDIFx1QkMyOVx1RDVBNVx1Qzc0NCBcdUM4MUNcdUM1QjRcdUQ1NThcdUJCQzBcdUI4NUMgXHVDOEZDXHVDMTFEIFx1Q0M5OFx1QjlBQ1xuXG4gICAgZ2FtZS5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHsgY2FudmFzOiBnYW1lLmNhbnZhcywgYW50aWFsaWFzOiB0cnVlIH0pO1xuICAgIGdhbWUucmVuZGVyZXIuc2V0U2l6ZShnYW1lLmRhdGEuY2FudmFzV2lkdGgsIGdhbWUuZGF0YS5jYW52YXNIZWlnaHQpO1xuICAgIGdhbWUucmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBpZiBkZXNpcmVkXG5cbiAgICAvLyBPcmJpdENvbnRyb2xzIFx1QzEyNFx1QzgxNVxuICAgIGdhbWUuY29udHJvbHMgPSBuZXcgT3JiaXRDb250cm9scyhnYW1lLmNhbWVyYSwgZ2FtZS5yZW5kZXJlci5kb21FbGVtZW50KTtcbiAgICBnYW1lLmNvbnRyb2xzLmVuYWJsZUREYW1waW5nID0gdHJ1ZTsgLy8gXHVDRTc0XHVCQTU0XHVCNzdDIFx1QzZDMFx1QzlDMVx1Qzc4NFx1Qzc0NCBcdUJEODBcdUI0RENcdUI3RkRcdUFDOENcbiAgICBnYW1lLmNvbnRyb2xzLmRhbXBpbmdGYWN0b3IgPSAwLjA1O1xuICAgIGdhbWUuY29udHJvbHMuc2NyZWVuU3BhY2VQYW5uaW5nID0gZmFsc2U7IC8vIFx1RDMyQyBcdUFFMzBcdUIyQTUgXHVDMkRDIFx1Q0U3NFx1QkE1NFx1Qjc3Q1x1QUMwMCBcdUJDMTRcdUIyRTVcdUM3NDQgXHVCNkFCXHVBQ0UwIFx1QjBCNFx1QjgyNFx1QUMwMFx1QzlDMCBcdUM1NEFcdUIzQzRcdUI4NURcbiAgICBnYW1lLmNvbnRyb2xzLm1pbkRpc3RhbmNlID0gNTsgLy8gXHVDRDVDXHVDMThDIFx1QzkwQyBcdUM1NDRcdUM2QzMgXHVBQzcwXHVCOUFDXG4gICAgZ2FtZS5jb250cm9scy5tYXhEaXN0YW5jZSA9IDUwOyAvLyBcdUNENUNcdUIzMDAgXHVDOTBDIFx1Qzc3OCBcdUFDNzBcdUI5QUNcbiAgICBnYW1lLmNvbnRyb2xzLnRhcmdldC5zZXQoMCwgMCwgMCk7IC8vIFx1Q0U3NFx1QkE1NFx1Qjc3Q1x1QUMwMCBcdUFDOENcdUM3ODQgXHVDMTM4XHVBQ0M0XHVDNzU4IFx1QzkxMVx1QzU1OVx1Qzc0NCBcdUJDMTRcdUI3N0NcdUJDRjRcdUIzQzRcdUI4NUQgXHVDMTI0XHVDODE1XG4gICAgZ2FtZS5jb250cm9scy5lbmFibGVkID0gZmFsc2U7IC8vIFx1QUM4Q1x1Qzc4NCBcdUMyRENcdUM3OTEgXHVDODA0XHVDNUQwXHVCMjk0IFx1Q0VFOFx1RDJCOFx1Qjg2NCBcdUJFNDRcdUQ2NUNcdUMxMzFcdUQ2NTRcbiAgICBnYW1lLmNvbnRyb2xzLnVwZGF0ZSgpOyAvLyBcdUNEMDhcdUFFMzAgXHVDMTI0XHVDODE1IFx1QzgwMVx1QzZBOVxuXG4gICAgLy8gTGlnaHRzXG4gICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweDQwNDA0MCk7IC8vIHNvZnQgd2hpdGUgbGlnaHRcbiAgICBnYW1lLnNjZW5lLmFkZChhbWJpZW50TGlnaHQpO1xuICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMSk7XG4gICAgZGlyZWN0aW9uYWxMaWdodC5wb3NpdGlvbi5zZXQoZ2FtZS5kYXRhLmxpZ2h0UG9zaXRpb24ueCwgZ2FtZS5kYXRhLmxpZ2h0UG9zaXRpb24ueSwgZ2FtZS5kYXRhLmxpZ2h0UG9zaXRpb24ueik7XG4gICAgZGlyZWN0aW9uYWxMaWdodC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgICBnYW1lLnNjZW5lLmFkZChkaXJlY3Rpb25hbExpZ2h0KTtcblxuICAgIC8vIENhbm5vbi5qcyBzZXR1cFxuICAgIGdhbWUuY2Fubm9uV29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5ncmF2aXR5LnNldCgwLCAwLCAwKTsgLy8gTm8gZ3Jhdml0eSBmb3IgYSBzbmFrZSBnYW1lXG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5kZWZhdWx0Q29udGFjdE1hdGVyaWFsLmZyaWN0aW9uID0gMDtcbiAgICBnYW1lLmNhbm5vbldvcmxkLmRlZmF1bHRDb250YWN0TWF0ZXJpYWwucmVzdGl0dXRpb24gPSAwO1xuXG4gICAgLy8gQ3JlYXRlIHdhbGxzIChib3VuZGFyaWVzKVxuICAgIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwOyAvLyBBc3N1bWluZyBhIDIweDIwIHBsYXlhYmxlIGdyaWRcbiAgICBjb25zdCBoYWxmV29ybGRTaXplID0gd29ybGRTaXplIC8gMjtcbiAgICBjb25zdCB3YWxsVGhpY2tuZXNzID0gZ2FtZS5kYXRhLndhbGxUaGlja25lc3M7XG4gICAgY29uc3Qgd2FsbEhlaWdodCA9IGdhbWUuZGF0YS5ncmlkU2l6ZTsgLy8gV2FsbHMgYXJlIGFzIHRhbGwgYXMgYSBzbmFrZSBzZWdtZW50XG5cbiAgICAvLyBNYXRlcmlhbCBmb3Igd2FsbHNcbiAgICBjb25zdCB3YWxsVGV4dHVyZSA9IGdhbWUuYXNzZXRzLnRleHR1cmVzWyd3YWxsX3RleHR1cmUnXTtcbiAgICBjb25zdCB3YWxsTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogd2FsbFRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlID8gd2FsbFRleHR1cmUgOiB1bmRlZmluZWQsIGNvbG9yOiB3YWxsVGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gd2FsbFRleHR1cmUgOiB1bmRlZmluZWQgfSk7XG4gICAgXG4gICAgLy8gRnJvbnQgd2FsbCAoK1opXG4gICAgY3JlYXRlV2FsbCgwLCAwLCAtaGFsZldvcmxkU2l6ZSAtIHdhbGxUaGlja25lc3MgLyAyLCB3b3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzICogMiwgd2FsbEhlaWdodCwgd2FsbFRoaWNrbmVzcywgd2FsbE1hdGVyaWFsLCBcIndhbGxfel9uZWdcIik7XG4gICAgLy8gQmFjayB3YWxsICgtWilcbiAgICBjcmVhdGVXYWxsKDAsIDAsIGhhbGZXb3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzIC8gMiwgd29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAqIDIsIHdhbGxIZWlnaHQsIHdhbGxUaGlja25lc3MsIHdhbGxNYXRlcmlhbCwgXCJ3YWxsX3pfcG9zXCIpO1xuICAgIC8vIExlZnQgd2FsbCAoLVgpXG4gICAgY3JlYXRlV2FsbCgtaGFsZldvcmxkU2l6ZSAtIHdhbGxUaGlja25lc3MgLyAyLCAwLCAwLCB3YWxsVGhpY2tuZXNzLCB3YWxsSGVpZ2h0LCB3b3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzICogMiwgd2FsbE1hdGVyaWFsLCBcIndhbGxfeF9uZWdcIik7XG4gICAgLy8gUmlnaHQgd2FsbCAoK1gpXG4gICAgY3JlYXRlV2FsbChoYWxmV29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAvIDIsIDAsIDAsIHdhbGxUaGlja25lc3MsIHdhbGxIZWlnaHQsIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLCB3YWxsTWF0ZXJpYWwsIFwid2FsbF94X3Bvc1wiKTtcblxuICAgIC8vIEluaXRpYWwgc2V0dXAgZm9yIHRoZSBnYW1lIHN0YXRlIChiZWZvcmUgc3RhcnRpbmcpXG4gICAgZ2FtZS5tb3ZlSW50ZXJ2YWwgPSAxMDAwIC8gZ2FtZS5kYXRhLnNuYWtlU3BlZWQ7XG4gICAgZ2FtZS5kaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKTtcbiAgICBnYW1lLm5leHREaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlV2FsbCh4OiBudW1iZXIsIHk6IG51bWJlciwgejogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgZGVwdGg6IG51bWJlciwgbWF0ZXJpYWw6IFRIUkVFLk1hdGVyaWFsLCBuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoIWdhbWUuc2NlbmUgfHwgIWdhbWUuY2Fubm9uV29ybGQpIHJldHVybjtcblxuICAgIGNvbnN0IHdhbGxHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSh3aWR0aCwgaGVpZ2h0LCBkZXB0aCk7XG4gICAgY29uc3Qgd2FsbE1lc2ggPSBuZXcgVEhSRUUuTWVzaCh3YWxsR2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgICB3YWxsTWVzaC5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XG4gICAgd2FsbE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XG4gICAgZ2FtZS5zY2VuZS5hZGQod2FsbE1lc2gpO1xuXG4gICAgY29uc3Qgd2FsbFNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKHdpZHRoIC8gMiwgaGVpZ2h0IC8gMiwgZGVwdGggLyAyKSk7XG4gICAgY29uc3Qgd2FsbEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwIH0pOyAvLyBNYXNzIDAgbWFrZXMgaXQgc3RhdGljXG4gICAgd2FsbEJvZHkuYWRkU2hhcGUod2FsbFNoYXBlKTtcbiAgICB3YWxsQm9keS5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5hZGRCb2R5KHdhbGxCb2R5KTtcbiAgICBnYW1lLndhbGxCb2RpZXMucHVzaCh3YWxsQm9keSk7XG59XG5cblxuZnVuY3Rpb24gY3JlYXRlU25ha2VTZWdtZW50KHBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzLCBpc0hlYWQ6IGJvb2xlYW4pOiB7IG1lc2g6IFRIUkVFLk1lc2g7IGJvZHk6IENBTk5PTi5Cb2R5OyB9IHtcbiAgICBpZiAoIWdhbWUuZGF0YSB8fCAhZ2FtZS5zY2VuZSB8fCAhZ2FtZS5jYW5ub25Xb3JsZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJHYW1lIG5vdCBpbml0aWFsaXplZCBmb3IgY3JlYXRpbmcgc25ha2Ugc2VnbWVudHMuXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IHNpemUgPSBnYW1lLmRhdGEuZ3JpZFNpemU7XG4gICAgY29uc3QgdGV4dHVyZSA9IGlzSGVhZCA/IGdhbWUuYXNzZXRzLnRleHR1cmVzWydzbmFrZV9oZWFkJ10gOiBnYW1lLmFzc2V0cy50ZXh0dXJlc1snc25ha2VfYm9keSddO1xuICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoeyBtYXA6IHRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlID8gdGV4dHVyZSA6IHVuZGVmaW5lZCwgY29sb3I6IHRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5Db2xvciA/IHRleHR1cmUgOiB1bmRlZmluZWQgfSk7XG4gICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoc2l6ZSwgc2l6ZSwgc2l6ZSk7XG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XG4gICAgbWVzaC5wb3NpdGlvbi5jb3B5KHBvc2l0aW9uKTtcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xuICAgIGdhbWUuc2NlbmUuYWRkKG1lc2gpO1xuXG4gICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoc2l6ZSAvIDIsIHNpemUgLyAyLCBzaXplIC8gMikpO1xuICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAxIH0pOyAvLyBHaXZlIGl0IGEgbWFzcywgYnV0IHdlJ2xsIGNvbnRyb2wgaXRzIHBvc2l0aW9uXG4gICAgYm9keS5hZGRTaGFwZShzaGFwZSk7XG4gICAgYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhwb3NpdGlvbi54LCBwb3NpdGlvbi55LCBwb3NpdGlvbi56KSk7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5hZGRCb2R5KGJvZHkpO1xuXG4gICAgcmV0dXJuIHsgbWVzaCwgYm9keSB9O1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUZvb2QoKTogdm9pZCB7XG4gICAgaWYgKCFnYW1lLmRhdGEgfHwgIWdhbWUuc2NlbmUgfHwgIWdhbWUuY2Fubm9uV29ybGQpIHJldHVybjtcblxuICAgIC8vIFJlbW92ZSBvbGQgZm9vZCBpZiBpdCBleGlzdHNcbiAgICBpZiAoZ2FtZS5mb29kLm1lc2gpIHtcbiAgICAgICAgZ2FtZS5zY2VuZS5yZW1vdmUoZ2FtZS5mb29kLm1lc2gpO1xuICAgICAgICBnYW1lLmZvb2QubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICAgIChnYW1lLmZvb2QubWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCkuZGlzcG9zZSgpO1xuICAgICAgICBnYW1lLmZvb2QubWVzaCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChnYW1lLmZvb2QuYm9keSkge1xuICAgICAgICBnYW1lLmNhbm5vbldvcmxkLnJlbW92ZUJvZHkoZ2FtZS5mb29kLmJvZHkpO1xuICAgICAgICBnYW1lLmZvb2QuYm9keSA9IG51bGw7XG4gICAgfVxuXG4gICAgY29uc3Qgd29ybGRTaXplID0gZ2FtZS5kYXRhLmdyaWRTaXplICogMjA7XG4gICAgY29uc3QgaGFsZldvcmxkU2l6ZSA9IHdvcmxkU2l6ZSAvIDI7XG4gICAgY29uc3Qgc2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZTtcbiAgICBsZXQgZm9vZFBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzO1xuICAgIGxldCBjb2xsaXNpb25XaXRoU25ha2U6IGJvb2xlYW47XG5cbiAgICBkbyB7XG4gICAgICAgIGNvbGxpc2lvbldpdGhTbmFrZSA9IGZhbHNlO1xuICAgICAgICAvLyBHZW5lcmF0ZSByYW5kb20gZ3JpZCBwb3NpdGlvbiB3aXRoaW4gYm91bmRzIChleGNsdWRpbmcgd2FsbCB0aGlja25lc3MgYXJlYSlcbiAgICAgICAgY29uc3QgbnVtQ2VsbHMgPSAyMDsgLy8gQXNzdW1pbmcgMjB4MjAgZ3JpZFxuICAgICAgICBjb25zdCByYW5kWCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG51bUNlbGxzKSAtIG51bUNlbGxzIC8gMjsgLy8gLTEwIHRvIDlcbiAgICAgICAgY29uc3QgcmFuZFogPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBudW1DZWxscykgLSBudW1DZWxscyAvIDI7IC8vIC0xMCB0byA5XG5cbiAgICAgICAgZm9vZFBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoXG4gICAgICAgICAgICByYW5kWCAqIHNpemUgKyBzaXplIC8gMiwgLy8gQ2VudGVyIG9mIHRoZSBncmlkIGNlbGxcbiAgICAgICAgICAgIDAsIC8vIEZvb2QgYXQgeT0wLCBzYW1lIGxldmVsIGFzIHNuYWtlXG4gICAgICAgICAgICByYW5kWiAqIHNpemUgKyBzaXplIC8gMlxuICAgICAgICApO1xuXG4gICAgICAgIC8vIENoZWNrIGZvciBjb2xsaXNpb24gd2l0aCBzbmFrZVxuICAgICAgICBmb3IgKGNvbnN0IHNlZ21lbnQgb2YgZ2FtZS5zbmFrZSkge1xuICAgICAgICAgICAgaWYgKHNlZ21lbnQubWVzaC5wb3NpdGlvbi5kaXN0YW5jZVRvKGZvb2RQb3NpdGlvbikgPCBzaXplICogMC45KSB7IC8vIENoZWNrIGlmIHBvc2l0aW9ucyBhcmUgdmVyeSBjbG9zZVxuICAgICAgICAgICAgICAgIGNvbGxpc2lvbldpdGhTbmFrZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9IHdoaWxlIChjb2xsaXNpb25XaXRoU25ha2UpO1xuXG5cbiAgICBjb25zdCB0ZXh0dXJlID0gZ2FtZS5hc3NldHMudGV4dHVyZXNbJ2Zvb2QnXTtcbiAgICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgbWFwOiB0ZXh0dXJlIGluc3RhbmNlb2YgVEhSRUUuVGV4dHVyZSA/IHRleHR1cmUgOiB1bmRlZmluZWQsIGNvbG9yOiB0ZXh0dXJlIGluc3RhbmNlb2YgVEhSRUUuQ29sb3IgPyB0ZXh0dXJlIDogdW5kZWZpbmVkIH0pO1xuICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KHNpemUgLyAyLCAxNiwgMTYpOyAvLyBGb29kIGlzIGEgc3BoZXJlXG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XG4gICAgbWVzaC5wb3NpdGlvbi5jb3B5KGZvb2RQb3NpdGlvbik7XG4gICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgICBnYW1lLnNjZW5lLmFkZChtZXNoKTtcbiAgICBnYW1lLmZvb2QubWVzaCA9IG1lc2g7XG5cbiAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uU3BoZXJlKHNpemUgLyAyKTtcbiAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMC4xIH0pOyAvLyBTbWFsbCBtYXNzIHNvIGl0IGNhbiBiZSAnZWF0ZW4nXG4gICAgYm9keS5hZGRTaGFwZShzaGFwZSk7XG4gICAgYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhmb29kUG9zaXRpb24ueCwgZm9vZFBvc2l0aW9uLnksIGZvb2RQb3NpdGlvbi56KSk7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5hZGRCb2R5KGJvZHkpO1xuICAgIGdhbWUuZm9vZC5ib2R5ID0gYm9keTtcbn1cblxuZnVuY3Rpb24gcGxheVNvdW5kKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHNvdW5kID0gZ2FtZS5hc3NldHMuc291bmRzW25hbWVdO1xuICAgIGlmIChzb3VuZCkge1xuICAgICAgICBzb3VuZC5jdXJyZW50VGltZSA9IDA7IC8vIFJld2luZCB0byBzdGFydCBpZiBhbHJlYWR5IHBsYXlpbmdcbiAgICAgICAgc291bmQucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKGBGYWlsZWQgdG8gcGxheSBzb3VuZCAke25hbWV9OmAsIGUpKTsgLy8gQ2F0Y2ggcHJvbWlzZSByZWplY3Rpb25cbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kICcke25hbWV9JyBub3QgZm91bmQuYCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVTY29yZVVJKCk6IHZvaWQge1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5KSB7XG4gICAgICAgIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuaW5uZXJUZXh0ID0gYFNjb3JlOiAke2dhbWUuc2NvcmV9YDtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlc2V0R2FtZSgpOiB2b2lkIHtcbiAgICBpZiAoIWdhbWUuZGF0YSB8fCAhZ2FtZS5zY2VuZSB8fCAhZ2FtZS5jYW5ub25Xb3JsZCkgcmV0dXJuO1xuXG4gICAgLy8gQ2xlYXIgZXhpc3Rpbmcgc25ha2UgYW5kIGZvb2RcbiAgICBnYW1lLnNuYWtlLmZvckVhY2goc2VnbWVudCA9PiB7XG4gICAgICAgIGdhbWUuc2NlbmU/LnJlbW92ZShzZWdtZW50Lm1lc2gpO1xuICAgICAgICBzZWdtZW50Lm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xuICAgICAgICAoc2VnbWVudC5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XG4gICAgICAgIGdhbWUuY2Fubm9uV29ybGQ/LnJlbW92ZUJvZHkoc2VnbWVudC5ib2R5KTtcbiAgICB9KTtcbiAgICBnYW1lLnNuYWtlID0gW107XG5cbiAgICBpZiAoZ2FtZS5mb29kLm1lc2gpIHtcbiAgICAgICAgZ2FtZS5zY2VuZS5yZW1vdmUoZ2FtZS5mb29kLm1lc2gpO1xuICAgICAgICBnYW1lLmZvb2QubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICAgIChnYW1lLmZvb2QubWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCkuZGlzcG9zZSgpO1xuICAgICAgICBnYW1lLmZvb2QubWVzaCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChnYW1lLmZvb2QuYm9keSkge1xuICAgICAgICBnYW1lLmNhbm5vbldvcmxkLnJlbW92ZUJvZHkoZ2FtZS5mb29kLmJvZHkpO1xuICAgICAgICBnYW1lLmZvb2QuYm9keSA9IG51bGw7XG4gICAgfVxuXG4gICAgLy8gSW5pdGlhbCBzbmFrZSBwb3NpdGlvbiAoZS5nLiwgY2VudGVyIG9mIHRoZSBwbGF5YWJsZSBhcmVhKVxuICAgIGNvbnN0IGluaXRpYWxQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAwKTtcblxuICAgIC8vIENyZWF0ZSBpbml0aWFsIHNuYWtlIHNlZ21lbnRzXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnYW1lLmRhdGEuaW5pdGlhbFNuYWtlTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3Qgc2VnbWVudFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKFxuICAgICAgICAgICAgaW5pdGlhbFBvcy54IC0gaSAqIGdhbWUuZGF0YS5ncmlkU2l6ZSxcbiAgICAgICAgICAgIGluaXRpYWxQb3MueSxcbiAgICAgICAgICAgIGluaXRpYWxQb3MuelxuICAgICAgICApO1xuICAgICAgICBnYW1lLnNuYWtlLnB1c2goY3JlYXRlU25ha2VTZWdtZW50KHNlZ21lbnRQb3MsIGkgPT09IDApKTtcbiAgICB9XG5cbiAgICBnYW1lLmRpcmVjdGlvbi5zZXQoMSwgMCwgMCk7IC8vIFJlc2V0IHRvIG1vdmluZyByaWdodCAoRWFzdClcbiAgICBnYW1lLm5leHREaXJlY3Rpb24uc2V0KDEsIDAsIDApO1xuICAgIGdhbWUuc2NvcmUgPSAwO1xuICAgIHVwZGF0ZVNjb3JlVUkoKTtcbiAgICBnZW5lcmF0ZUZvb2QoKTtcbn1cblxuZnVuY3Rpb24gc3RhcnRHYW1lKCk6IHZvaWQge1xuICAgIGlmICghZ2FtZS5kYXRhKSByZXR1cm47XG5cbiAgICBnYW1lLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4pIGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4pIGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5KSBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXG4gICAgcmVzZXRHYW1lKCk7XG4gICAgaWYgKGdhbWUuYXNzZXRzLnNvdW5kc1snYmdtJ10gJiYgIWdhbWUuYmdtKSB7XG4gICAgICAgIGdhbWUuYmdtID0gZ2FtZS5hc3NldHMuc291bmRzWydiZ20nXTtcbiAgICAgICAgZ2FtZS5iZ20ubG9vcCA9IHRydWU7XG4gICAgICAgIGdhbWUuYmdtLnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUud2FybihcIkZhaWxlZCB0byBwbGF5IEJHTTpcIiwgZSkpO1xuICAgIH0gZWxzZSBpZiAoZ2FtZS5iZ20pIHtcbiAgICAgICAgZ2FtZS5iZ20ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHBsYXkgQkdNOlwiLCBlKSk7XG4gICAgfVxuXG4gICAgcGxheVNvdW5kKCdzdGFydF9nYW1lJyk7XG4gICAgaWYgKGdhbWUuY29udHJvbHMpIHtcbiAgICAgICAgZ2FtZS5jb250cm9scy5lbmFibGVkID0gdHJ1ZTsgLy8gXHVBQzhDXHVDNzg0IFx1QzJEQ1x1Qzc5MSBcdUMyREMgT3JiaXRDb250cm9scyBcdUQ2NUNcdUMxMzFcdUQ2NTRcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdhbWVPdmVyKCk6IHZvaWQge1xuICAgIGdhbWUuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcbiAgICBpZiAoZ2FtZS5iZ20pIHtcbiAgICAgICAgZ2FtZS5iZ20ucGF1c2UoKTtcbiAgICB9XG4gICAgcGxheVNvdW5kKCdnYW1lX292ZXInKTtcblxuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5KSBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbikgZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG4gICAgY29uc3QgZmluYWxTY29yZUVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmluYWxTY29yZScpO1xuICAgIGlmIChmaW5hbFNjb3JlRWxlbWVudCkge1xuICAgICAgICBmaW5hbFNjb3JlRWxlbWVudC5pbm5lclRleHQgPSBgU2NvcmU6ICR7Z2FtZS5zY29yZX1gO1xuICAgIH1cbiAgICBpZiAoZ2FtZS5jb250cm9scykge1xuICAgICAgICBnYW1lLmNvbnRyb2xzLmVuYWJsZWQgPSBmYWxzZTsgLy8gXHVBQzhDXHVDNzg0IFx1QzYyNFx1QkM4NCBcdUMyREMgT3JiaXRDb250cm9scyBcdUJFNDRcdUQ2NUNcdUMxMzFcdUQ2NTRcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZUlucHV0KGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gICAgaWYgKCFnYW1lLmRhdGEpIHJldHVybjtcblxuICAgIGNvbnN0IGN1cnJlbnREaXIgPSBnYW1lLmRpcmVjdGlvbjtcbiAgICBsZXQgbmV3RGlyID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcblxuICAgIHN3aXRjaCAoZXZlbnQua2V5KSB7XG4gICAgICAgIGNhc2UgJ0Fycm93VXAnOlxuICAgICAgICAgICAgbmV3RGlyLnNldCgwLCAwLCAtMSk7IC8vIE1vdmUgTm9ydGggKG5lZ2F0aXZlIFopXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyb3dEb3duJzpcbiAgICAgICAgICAgIG5ld0Rpci5zZXQoMCwgMCwgMSk7IC8vIE1vdmUgU291dGggKHBvc2l0aXZlIFopXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyb3dMZWZ0JzpcbiAgICAgICAgICAgIG5ld0Rpci5zZXQoLTEsIDAsIDApOyAvLyBNb3ZlIFdlc3QgKG5lZ2F0aXZlIFgpXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQXJyb3dSaWdodCc6XG4gICAgICAgICAgICBuZXdEaXIuc2V0KDEsIDAsIDApOyAvLyBNb3ZlIEVhc3QgKHBvc2l0aXZlIFgpXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnICc6IC8vIFNwYWNlIGtleVxuICAgICAgICAgICAgaWYgKGdhbWUuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgfHwgZ2FtZS5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcbiAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyAvLyBQcmV2ZW50IHNjcm9sbGluZ1xuICAgICAgICAgICAgICAgIHN0YXJ0R2FtZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuOyAvLyBEb24ndCBwcm9jZXNzIHNwYWNlIGFzIGEgZGlyZWN0aW9uIGNoYW5nZVxuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFByZXZlbnQgaW1tZWRpYXRlIHJldmVyc2UgKGUuZy4sIHRyeWluZyB0byBnbyBsZWZ0IHdoZW4gY3VycmVudGx5IGdvaW5nIHJpZ2h0KVxuICAgIC8vIENoZWNrIGlmIG5ld0RpciBpcyBub3Qgb3Bwb3NpdGUgdG8gY3VycmVudERpclxuICAgIGlmICghbmV3RGlyLmVxdWFscyhjdXJyZW50RGlyLmNsb25lKCkubmVnYXRlKCkpKSB7XG4gICAgICAgIGdhbWUubmV4dERpcmVjdGlvbi5jb3B5KG5ld0Rpcik7XG4gICAgfVxufVxuXG4vLyAtLS0gR2FtZSBMb29wIC0tLVxuXG5mdW5jdGlvbiB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIWdhbWUuZGF0YSB8fCBnYW1lLmdhbWVTdGF0ZSAhPT0gR2FtZVN0YXRlLlBMQVlJTkcpIHJldHVybjtcblxuICAgIGdhbWUudGltZVNpbmNlTGFzdE1vdmUgKz0gZGVsdGFUaW1lO1xuXG4gICAgaWYgKGdhbWUudGltZVNpbmNlTGFzdE1vdmUgPj0gZ2FtZS5tb3ZlSW50ZXJ2YWwgLyAxMDAwKSB7IC8vIENvbnZlcnQgbW92ZUludGVydmFsIHRvIHNlY29uZHNcbiAgICAgICAgZ2FtZS50aW1lU2luY2VMYXN0TW92ZSAtPSBnYW1lLm1vdmVJbnRlcnZhbCAvIDEwMDA7XG5cbiAgICAgICAgZ2FtZS5kaXJlY3Rpb24uY29weShnYW1lLm5leHREaXJlY3Rpb24pOyAvLyBBcHBseSBidWZmZXJlZCBkaXJlY3Rpb25cblxuICAgICAgICAvLyBTdG9yZSBjdXJyZW50IGhlYWQgcG9zaXRpb24gYmVmb3JlIG1vdmluZ1xuICAgICAgICBjb25zdCBvbGRIZWFkUG9zaXRpb24gPSBnYW1lLnNuYWtlWzBdLm1lc2gucG9zaXRpb24uY2xvbmUoKTtcblxuICAgICAgICAvLyBDYWxjdWxhdGUgbmV3IGhlYWQgcG9zaXRpb25cbiAgICAgICAgY29uc3QgaGVhZCA9IGdhbWUuc25ha2VbMF07XG4gICAgICAgIGNvbnN0IG5ld0hlYWRQb3NpdGlvbiA9IGhlYWQubWVzaC5wb3NpdGlvbi5jbG9uZSgpLmFkZChnYW1lLmRpcmVjdGlvbi5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKGdhbWUuZGF0YS5ncmlkU2l6ZSkpO1xuXG4gICAgICAgIC8vIC0tLSBDb2xsaXNpb24gRGV0ZWN0aW9uIC0tLVxuICAgICAgICBjb25zdCB3b3JsZFNpemUgPSBnYW1lLmRhdGEuZ3JpZFNpemUgKiAyMDtcbiAgICAgICAgY29uc3QgaGFsZldvcmxkU2l6ZSA9IHdvcmxkU2l6ZSAvIDI7XG4gICAgICAgIGNvbnN0IG1heENvb3JkID0gaGFsZldvcmxkU2l6ZSAtIGdhbWUuZGF0YS5ncmlkU2l6ZSAvIDI7XG4gICAgICAgIGNvbnN0IG1pbkNvb3JkID0gLWhhbGZXb3JsZFNpemUgKyBnYW1lLmRhdGEuZ3JpZFNpemUgLyAyO1xuXG4gICAgICAgIC8vIFdhbGwgY29sbGlzaW9uXG4gICAgICAgIC8vIENoZWNrIGlmIG5ld0hlYWRQb3NpdGlvbiBpcyBvdXRzaWRlIHRoZSBwbGF5IGFyZWEgZGVmaW5lZCBieSBtaW4vbWF4Q29vcmRcbiAgICAgICAgaWYgKG5ld0hlYWRQb3NpdGlvbi54ID4gbWF4Q29vcmQgfHwgbmV3SGVhZFBvc2l0aW9uLnggPCBtaW5Db29yZCB8fFxuICAgICAgICAgICAgbmV3SGVhZFBvc2l0aW9uLnogPiBtYXhDb29yZCB8fCBuZXdIZWFkUG9zaXRpb24ueiA8IG1pbkNvb3JkKSB7XG4gICAgICAgICAgICBnYW1lT3ZlcigpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2VsZi1jb2xsaXNpb24gKGNoZWNrIG5ldyBoZWFkIHBvc2l0aW9uIGFnYWluc3QgYWxsIGJvZHkgc2VnbWVudHMgZXhjZXB0IHRoZSBjdXJyZW50IGhlYWQpXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgZ2FtZS5zbmFrZS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKG5ld0hlYWRQb3NpdGlvbi5kaXN0YW5jZVRvKGdhbWUuc25ha2VbaV0ubWVzaC5wb3NpdGlvbikgPCBnYW1lLmRhdGEuZ3JpZFNpemUgKiAwLjkpIHsgLy8gQ2hlY2sgaWYgcG9zaXRpb25zIGFyZSB2ZXJ5IGNsb3NlXG4gICAgICAgICAgICAgICAgZ2FtZU92ZXIoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBNb3ZlIHNuYWtlOiBIZWFkIG1vdmVzIHRvIG5ldyBwb3NpdGlvbiwgYm9keSBzZWdtZW50cyBmb2xsb3dcbiAgICAgICAgZm9yIChsZXQgaSA9IGdhbWUuc25ha2UubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xuICAgICAgICAgICAgZ2FtZS5zbmFrZVtpXS5tZXNoLnBvc2l0aW9uLmNvcHkoZ2FtZS5zbmFrZVtpIC0gMV0ubWVzaC5wb3NpdGlvbik7XG4gICAgICAgICAgICBnYW1lLnNuYWtlW2ldLmJvZHkucG9zaXRpb24uY29weShuZXcgQ0FOTk9OLlZlYzMoZ2FtZS5zbmFrZVtpIC0gMV0ubWVzaC5wb3NpdGlvbi54LCBnYW1lLnNuYWtlW2kgLSAxXS5tZXNoLnBvc2l0aW9uLnksIGdhbWUuc25ha2VbaSAtIDFdLm1lc2gucG9zaXRpb24ueikpO1xuICAgICAgICB9XG4gICAgICAgIGhlYWQubWVzaC5wb3NpdGlvbi5jb3B5KG5ld0hlYWRQb3NpdGlvbik7XG4gICAgICAgIGhlYWQuYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhuZXdIZWFkUG9zaXRpb24ueCwgbmV3SGVhZFBvc2l0aW9uLnksIG5ld0hlYWRQb3NpdGlvbi56KSk7XG5cblxuICAgICAgICAvLyBGb29kIGNvbGxpc2lvblxuICAgICAgICBpZiAoZ2FtZS5mb29kLm1lc2ggJiYgbmV3SGVhZFBvc2l0aW9uLmRpc3RhbmNlVG8oZ2FtZS5mb29kLm1lc2gucG9zaXRpb24pIDwgZ2FtZS5kYXRhLmdyaWRTaXplICogMC45KSB7XG4gICAgICAgICAgICBwbGF5U291bmQoJ2VhdF9mb29kJyk7XG4gICAgICAgICAgICBnYW1lLnNjb3JlKys7XG4gICAgICAgICAgICB1cGRhdGVTY29yZVVJKCk7XG5cbiAgICAgICAgICAgIC8vIEFkZCBuZXcgc2VnbWVudCBhdCB0aGUgb2xkIHRhaWwncyBwb3NpdGlvbiAodGhlIHBvc2l0aW9uIG9mIHRoZSBzZWdtZW50IHRoYXQgd2FzIG1vdmVkIGZyb20gYnkgdGhlIGxhc3Qgc2VnbWVudClcbiAgICAgICAgICAgIC8vIFRoZSBzZWdtZW50IHRoYXQgd2FzIGF0IGdhbWUuc25ha2VbZ2FtZS5zbmFrZS5sZW5ndGggLSAxXSBiZWZvcmUgdGhlIG1vdmUgbm93IG5lZWRzIGEgbmV3IG9uZSBiZWhpbmQgaXQuXG4gICAgICAgICAgICAvLyBUaGUgb2xkSGVhZFBvc2l0aW9uICh3aGljaCBpcyBub3cgZWZmZWN0aXZlbHkgdGhlIHBvc2l0aW9uIG9mIHRoZSBmaXJzdCBib2R5IHNlZ21lbnQpXG4gICAgICAgICAgICAvLyBpcyBub3Qgc3VpdGFibGUgZm9yIHRoZSBuZXcgc2VnbWVudC4gSW5zdGVhZCwgdGhlIGxhc3Qgc2VnbWVudCdzICpwcmV2aW91cyogcG9zaXRpb25cbiAgICAgICAgICAgIC8vIChiZWZvcmUgaXQgbW92ZWQpIGlzIHRoZSBjb3JyZWN0IHNwb3QuIEJ1dCBzaW5jZSB3ZSBqdXN0IG1vdmVkIGV2ZXJ5dGhpbmcsXG4gICAgICAgICAgICAvLyB0aGUgbmV3IHNlZ21lbnQgc2hvdWxkIGFjdHVhbGx5IG9jY3VweSB0aGUgYG9sZEhlYWRQb3NpdGlvbmAncyBsYXN0IHBvc2l0aW9uLlxuICAgICAgICAgICAgLy8gQSBzaW1wbGVyIGFwcHJvYWNoOiBjcmVhdGUgdGhlIG5ldyBzZWdtZW50IGF0IHRoZSBwb3NpdGlvbiBvZiB0aGUgbGFzdCBzZWdtZW50ICphZnRlciogdGhlIG1vdmUuXG4gICAgICAgICAgICAvLyBUaGlzIG1ha2VzIHRoZSBzbmFrZSBncm93IGZyb20gaXRzIHRhaWwgaW4gdGhlIGRpcmVjdGlvbiBpdCB3YXMgbW92aW5nLlxuICAgICAgICAgICAgY29uc3QgbGFzdFNlZ21lbnRDdXJyZW50UG9zID0gZ2FtZS5zbmFrZVtnYW1lLnNuYWtlLmxlbmd0aCAtIDFdLm1lc2gucG9zaXRpb24uY2xvbmUoKTtcbiAgICAgICAgICAgIGdhbWUuc25ha2UucHVzaChjcmVhdGVTbmFrZVNlZ21lbnQobGFzdFNlZ21lbnRDdXJyZW50UG9zLCBmYWxzZSkpOyBcblxuICAgICAgICAgICAgZ2VuZXJhdGVGb29kKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgQ2Fubm9uLmpzIHdvcmxkIChldmVuIGlmIHBvc2l0aW9ucyBhcmUgbWFudWFsbHkgc2V0LCB0aGlzIHByb2Nlc3NlcyBwb3RlbnRpYWwgY29udGFjdCBjYWxsYmFja3MgaWYgYW55IHdlcmUgc2V0IHVwKVxuICAgIGlmIChnYW1lLmNhbm5vbldvcmxkKSB7XG4gICAgICAgIC8vIFVzZSBhIGZpeGVkIHRpbWUgc3RlcCBmb3IgcGh5c2ljcyBzaW11bGF0aW9uIGZvciBzdGFiaWxpdHlcbiAgICAgICAgY29uc3QgZml4ZWRUaW1lU3RlcCA9IDEgLyA2MDsgLy8gNjAgSHpcbiAgICAgICAgZ2FtZS5jYW5ub25Xb3JsZC5zdGVwKGZpeGVkVGltZVN0ZXAsIGRlbHRhVGltZSwgMyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiByZW5kZXIoKTogdm9pZCB7XG4gICAgaWYgKGdhbWUucmVuZGVyZXIgJiYgZ2FtZS5zY2VuZSAmJiBnYW1lLmNhbWVyYSkge1xuICAgICAgICBnYW1lLnJlbmRlcmVyLnJlbmRlcihnYW1lLnNjZW5lLCBnYW1lLmNhbWVyYSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBnYW1lTG9vcChjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XG4gICAgLy8gQ29udmVydCBkZWx0YVRpbWUgdG8gc2Vjb25kcyBmb3IgY29uc2lzdGVuY3kgd2l0aCBDYW5ub24uanMgc3RlcFxuICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIGdhbWUubGFzdFVwZGF0ZVRpbWUpIC8gMTAwMDsgXG4gICAgZ2FtZS5sYXN0VXBkYXRlVGltZSA9IGN1cnJlbnRUaW1lO1xuXG4gICAgLy8gT3JiaXRDb250cm9scyBcdUM1QzVcdUIzNzBcdUM3NzRcdUQyQjhcbiAgICBpZiAoZ2FtZS5jb250cm9scykge1xuICAgICAgICBnYW1lLmNvbnRyb2xzLnVwZGF0ZSgpO1xuICAgIH1cblxuICAgIHVwZGF0ZShkZWx0YVRpbWUpO1xuICAgIHJlbmRlcigpO1xuXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcbn1cblxuLy8gLS0tIE1haW4gRW50cnkgUG9pbnQgLS0tXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgYXN5bmMgKCkgPT4ge1xuICAgIGdhbWUuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcbiAgICBpZiAoIWdhbWUuY2FudmFzKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDYW52YXMgZWxlbWVudCB3aXRoIElEICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgbG9hZEdhbWVEYXRhKCk7XG4gICAgaWYgKCFnYW1lLmRhdGEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNldHVwVUkoKTsgLy8gU2V0IHVwIFVJIGVsZW1lbnRzXG5cbiAgICBhd2FpdCBwcmVsb2FkQXNzZXRzKCk7XG4gICAgY3JlYXRlR2FtZVdvcmxkKCk7XG5cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGhhbmRsZUlucHV0KTtcblxuICAgIC8vIEluaXRpYWwgcmVuZGVyIG9mIHRoZSB0aXRsZSBzY3JlZW5cbiAgICBnYW1lLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcbiAgICBpZiAoZ2FtZS51aUVsZW1lbnRzLnRpdGxlU2NyZWVuKSBnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4uc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSkgZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4pIGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG4gICAgZ2FtZS5sYXN0VXBkYXRlVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpOyAvLyBJbml0aWFsaXplIGxhc3RVcGRhdGVUaW1lXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBQUEsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQUN4QixTQUFTLHFCQUFxQjtBQWdDOUIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSEMsU0FBQUE7QUFBQSxHQUFBO0FBTUwsTUFBTSxPQXlCRjtBQUFBLEVBQ0EsTUFBTTtBQUFBLEVBQ04sUUFBUSxFQUFFLFVBQVUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxFQUFFO0FBQUEsRUFDbkMsUUFBUTtBQUFBLEVBQ1IsVUFBVTtBQUFBLEVBQ1YsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsVUFBVTtBQUFBO0FBQUEsRUFDVixhQUFhO0FBQUEsRUFDYixPQUFPLENBQUM7QUFBQSxFQUNSLE1BQU0sRUFBRSxNQUFNLE1BQU0sTUFBTSxLQUFLO0FBQUEsRUFDL0IsV0FBVyxJQUFJLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztBQUFBO0FBQUEsRUFDcEMsZUFBZSxJQUFJLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztBQUFBLEVBQ3hDLE9BQU87QUFBQSxFQUNQLFdBQVc7QUFBQSxFQUNYLGdCQUFnQjtBQUFBLEVBQ2hCLG1CQUFtQjtBQUFBLEVBQ25CLGNBQWM7QUFBQTtBQUFBLEVBQ2QsWUFBWTtBQUFBLElBQ1IsYUFBYTtBQUFBLElBQ2IsY0FBYztBQUFBLElBQ2QsZ0JBQWdCO0FBQUEsRUFDcEI7QUFBQSxFQUNBLEtBQUs7QUFBQSxFQUNMLFlBQVksQ0FBQztBQUNqQjtBQUlBLGVBQWUsZUFBOEI7QUFDekMsTUFBSTtBQUNBLFVBQU0sV0FBVyxNQUFNLE1BQU0sV0FBVztBQUN4QyxRQUFJLENBQUMsU0FBUyxJQUFJO0FBQ2QsWUFBTSxJQUFJLE1BQU0sNkJBQTZCLFNBQVMsVUFB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
