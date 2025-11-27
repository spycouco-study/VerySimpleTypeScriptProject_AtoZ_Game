import * as THREE from "https://unpkg.com/three@0.158.0/build/three.module.js";
import * as CANNON from "https://unpkg.com/cannon-es@0.20.0/dist/cannon-es.js";
import { OrbitControls } from "https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js";
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
        <h1>3D \uBC40\uAC8C\uC784</h1>
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAnaHR0cHM6Ly91bnBrZy5jb20vdGhyZWVAMC4xNTguMC9idWlsZC90aHJlZS5tb2R1bGUuanMnO1xuaW1wb3J0ICogYXMgQ0FOTk9OIGZyb20gJ2h0dHBzOi8vdW5wa2cuY29tL2Nhbm5vbi1lc0AwLjIwLjAvZGlzdC9jYW5ub24tZXMuanMnO1xuaW1wb3J0IHsgT3JiaXRDb250cm9scyB9IGZyb20gJ2h0dHBzOi8vdW5wa2cuY29tL3RocmVlQDAuMTU4LjAvZXhhbXBsZXMvanNtL2NvbnRyb2xzL09yYml0Q29udHJvbHMuanMnOyAvLyBPcmJpdENvbnRyb2xzIFx1Qzc4NFx1RDNFQ1x1RDJCOFxuXG4vLyAtLS0gR2xvYmFsIEdhbWUgU3RhdGUgYW5kIENvbmZpZ3VyYXRpb24gLS0tXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XG4gICAgY2FudmFzV2lkdGg6IG51bWJlcjtcbiAgICBjYW52YXNIZWlnaHQ6IG51bWJlcjtcbiAgICBncmlkU2l6ZTogbnVtYmVyOyAvLyBTaXplIG9mIGVhY2ggZ3JpZCBjZWxsIGluIHdvcmxkIHVuaXRzXG4gICAgc25ha2VTcGVlZDogbnVtYmVyOyAvLyBIb3cgbWFueSBncmlkIGNlbGxzIHBlciBzZWNvbmQgdGhlIHNuYWtlIG1vdmVzXG4gICAgaW5pdGlhbFNuYWtlTGVuZ3RoOiBudW1iZXI7XG4gICAgd2FsbFRoaWNrbmVzczogbnVtYmVyOyAvLyBUaGlja25lc3Mgb2YgdGhlIHdhbGxzIGluIHdvcmxkIHVuaXRzXG4gICAgY2FtZXJhRk9WOiBudW1iZXI7XG4gICAgY2FtZXJhTmVhcjogbnVtYmVyO1xuICAgIGNhbWVyYUZhcjogbnVtYmVyO1xuICAgIGNhbWVyYVBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXI7IH07XG4gICAgbGlnaHRQb3NpdGlvbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB9O1xuICAgIGNvbG9yczoge1xuICAgICAgICBiYWNrZ3JvdW5kOiBudW1iZXI7XG4gICAgICAgIHRpdGxlVGV4dDogc3RyaW5nO1xuICAgICAgICBzY29yZVRleHQ6IHN0cmluZztcbiAgICAgICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XG4gICAgfVxuICAgIGFzc2V0czoge1xuICAgICAgICBpbWFnZXM6IEFycmF5PHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9PjtcbiAgICAgICAgc291bmRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyOyB9PjtcbiAgICB9O1xufVxuXG5pbnRlcmZhY2UgTG9hZGVkQXNzZXRzIHtcbiAgICB0ZXh0dXJlczogeyBba2V5OiBzdHJpbmddOiBUSFJFRS5UZXh0dXJlIHwgVEhSRUUuQ29sb3IgfTtcbiAgICBzb3VuZHM6IHsgW2tleTogc3RyaW5nXTogSFRNTEF1ZGlvRWxlbWVudCB9O1xufVxuXG5lbnVtIEdhbWVTdGF0ZSB7XG4gICAgVElUTEUsXG4gICAgUExBWUlORyxcbiAgICBHQU1FX09WRVIsXG59XG5cbmNvbnN0IGdhbWU6IHtcbiAgICBkYXRhOiBHYW1lQ29uZmlnIHwgbnVsbDtcbiAgICBhc3NldHM6IExvYWRlZEFzc2V0cztcbiAgICBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50IHwgbnVsbDtcbiAgICByZW5kZXJlcjogVEhSRUUuV2ViR0xSZW5kZXJlciB8IG51bGw7XG4gICAgc2NlbmU6IFRIUkVFLlNjZW5lIHwgbnVsbDtcbiAgICBjYW1lcmE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhIHwgbnVsbDtcbiAgICBjb250cm9sczogT3JiaXRDb250cm9scyB8IG51bGw7IC8vIE9yYml0Q29udHJvbHMgXHVDRDk0XHVBQzAwXG4gICAgY2Fubm9uV29ybGQ6IENBTk5PTi5Xb3JsZCB8IG51bGw7XG4gICAgc25ha2U6IHsgbWVzaDogVEhSRUUuTWVzaDsgYm9keTogQ0FOTk9OLkJvZHk7IH1bXTtcbiAgICBmb29kOiB7IG1lc2g6IFRIUkVFLk1lc2ggfCBudWxsOyBib2R5OiBDQU5OT04uQm9keSB8IG51bGw7IH07XG4gICAgZGlyZWN0aW9uOiBUSFJFRS5WZWN0b3IzO1xuICAgIG5leHREaXJlY3Rpb246IFRIUkVFLlZlY3RvcjM7XG4gICAgc2NvcmU6IG51bWJlcjtcbiAgICBnYW1lU3RhdGU6IEdhbWVTdGF0ZTtcbiAgICBsYXN0VXBkYXRlVGltZTogbnVtYmVyO1xuICAgIHRpbWVTaW5jZUxhc3RNb3ZlOiBudW1iZXI7XG4gICAgbW92ZUludGVydmFsOiBudW1iZXI7IC8vIFRpbWUgaW4gbXMgYmV0d2VlbiBzbmFrZSBtb3Zlc1xuICAgIHVpRWxlbWVudHM6IHtcbiAgICAgICAgdGl0bGVTY3JlZW46IEhUTUxEaXZFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgc2NvcmVEaXNwbGF5OiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XG4gICAgICAgIGdhbWVPdmVyU2NyZWVuOiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XG4gICAgfTtcbiAgICBiZ206IEhUTUxBdWRpb0VsZW1lbnQgfCBudWxsO1xuICAgIHdhbGxCb2RpZXM6IENBTk5PTi5Cb2R5W107IC8vIFRvIGhvbGQgcmVmZXJlbmNlcyB0byBjYW5ub24gd2FsbCBib2RpZXNcbn0gPSB7XG4gICAgZGF0YTogbnVsbCxcbiAgICBhc3NldHM6IHsgdGV4dHVyZXM6IHt9LCBzb3VuZHM6IHt9IH0sXG4gICAgY2FudmFzOiBudWxsLFxuICAgIHJlbmRlcmVyOiBudWxsLFxuICAgIHNjZW5lOiBudWxsLFxuICAgIGNhbWVyYTogbnVsbCxcbiAgICBjb250cm9sczogbnVsbCwgLy8gXHVDRDA4XHVBRTMwXHVENjU0XG4gICAgY2Fubm9uV29ybGQ6IG51bGwsXG4gICAgc25ha2U6IFtdLFxuICAgIGZvb2Q6IHsgbWVzaDogbnVsbCwgYm9keTogbnVsbCB9LFxuICAgIGRpcmVjdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoMSwgMCwgMCksIC8vIEluaXRpYWwgZGlyZWN0aW9uOiBFYXN0IChwb3NpdGl2ZSBYKVxuICAgIG5leHREaXJlY3Rpb246IG5ldyBUSFJFRS5WZWN0b3IzKDEsIDAsIDApLFxuICAgIHNjb3JlOiAwLFxuICAgIGdhbWVTdGF0ZTogR2FtZVN0YXRlLlRJVExFLFxuICAgIGxhc3RVcGRhdGVUaW1lOiAwLFxuICAgIHRpbWVTaW5jZUxhc3RNb3ZlOiAwLFxuICAgIG1vdmVJbnRlcnZhbDogMCwgLy8gV2lsbCBiZSBjYWxjdWxhdGVkIGZyb20gc25ha2VTcGVlZFxuICAgIHVpRWxlbWVudHM6IHtcbiAgICAgICAgdGl0bGVTY3JlZW46IG51bGwsXG4gICAgICAgIHNjb3JlRGlzcGxheTogbnVsbCxcbiAgICAgICAgZ2FtZU92ZXJTY3JlZW46IG51bGwsXG4gICAgfSxcbiAgICBiZ206IG51bGwsXG4gICAgd2FsbEJvZGllczogW10sXG59O1xuXG4vLyAtLS0gR2FtZSBJbml0aWFsaXphdGlvbiAtLS1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZEdhbWVEYXRhKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xuICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGRhdGEuanNvbjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgICAgICB9XG4gICAgICAgIGdhbWUuZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBHYW1lQ29uZmlnO1xuICAgICAgICBjb25zb2xlLmxvZyhcIkdhbWUgZGF0YSBsb2FkZWQ6XCIsIGdhbWUuZGF0YSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGxvYWRpbmcgZ2FtZSBkYXRhOlwiLCBlcnJvcik7XG4gICAgICAgIGFsZXJ0KFwiRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uLiBQbGVhc2UgY2hlY2sgZGF0YS5qc29uLlwiKTtcbiAgICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByZWxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFnYW1lLmRhdGEpIHJldHVybjtcblxuICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xuICAgIGNvbnN0IGF1ZGlvUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuICAgIGNvbnN0IHRleHR1cmVQcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cbiAgICAvLyBBZGQgcGxhY2Vob2xkZXIgdGV4dHVyZXMgaWYgYWN0dWFsIGFzc2V0cyBhcmUgbm90IGZvdW5kIGluIGRhdGEuanNvblxuICAgIC8vIFRoaXMgYWxsb3dzIHRoZSBnYW1lIHRvIHJ1biBldmVuIGlmIHNvbWUgYXNzZXRzIGFyZSBtaXNzaW5nLlxuICAgIC8vIEVuc3VyZSBhbGwgY3JpdGljYWwgdGV4dHVyZSBuYW1lcyBhcmUgcHJlc2VudCBpbiBhc3NldHMudGV4dHVyZXNcbiAgICBjb25zdCByZXF1aXJlZFRleHR1cmVzID0gWydzbmFrZV9oZWFkJywgJ3NuYWtlX2JvZHknLCAnZm9vZCcsICd3YWxsX3RleHR1cmUnXTtcbiAgICBmb3IoY29uc3QgbmFtZSBvZiByZXF1aXJlZFRleHR1cmVzKSB7XG4gICAgICAgIGlmICghZ2FtZS5kYXRhLmFzc2V0cy5pbWFnZXMuc29tZShpbWcgPT4gaW1nLm5hbWUgPT09IG5hbWUpKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYFRleHR1cmUgJyR7bmFtZX0nIG5vdCBmb3VuZCBpbiBkYXRhLmpzb24uIFVzaW5nIGEgcGxhY2Vob2xkZXIuYCk7XG4gICAgICAgICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tuYW1lXSA9IG5ldyBUSFJFRS5Db2xvcigweDg4ODg4OCk7IC8vIERlZmF1bHQgY29sb3JcbiAgICAgICAgfVxuICAgIH1cblxuXG4gICAgZm9yIChjb25zdCBpbWcgb2YgZ2FtZS5kYXRhLmFzc2V0cy5pbWFnZXMpIHtcbiAgICAgICAgdGV4dHVyZVByb21pc2VzLnB1c2gobmV3IFByb21pc2UoKHJlc29sdmUpID0+IHsgLy8gQ2hhbmdlZCB0byByZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIGdhbWVcbiAgICAgICAgICAgIHRleHR1cmVMb2FkZXIubG9hZChcbiAgICAgICAgICAgICAgICBpbWcucGF0aCxcbiAgICAgICAgICAgICAgICAodGV4dHVyZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tpbWcubmFtZV0gPSB0ZXh0dXJlO1xuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgKGVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIGxvYWRpbmcgdGV4dHVyZSAke2ltZy5uYW1lfSBmcm9tICR7aW1nLnBhdGh9OmAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgZ2FtZS5hc3NldHMudGV4dHVyZXNbaW1nLm5hbWVdID0gbmV3IFRIUkVFLkNvbG9yKDB4ODg4ODg4KTsgLy8gRmFsbGJhY2sgdG8gY29sb3JcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gYWxsb3cgZ2FtZSB0byBjb250aW51ZVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICAvLyBFbnN1cmUgYWxsIGNyaXRpY2FsIHNvdW5kIG5hbWVzIGFyZSBwcmVzZW50IGluIGFzc2V0cy5zb3VuZHNcbiAgICBjb25zdCByZXF1aXJlZFNvdW5kcyA9IFsnZWF0X2Zvb2QnLCAnZ2FtZV9vdmVyJywgJ2JnbScsICdzdGFydF9nYW1lJ107XG4gICAgZm9yKGNvbnN0IG5hbWUgb2YgcmVxdWlyZWRTb3VuZHMpIHtcbiAgICAgICAgaWYgKCFnYW1lLmRhdGEuYXNzZXRzLnNvdW5kcy5zb21lKHMgPT4gcy5uYW1lID09PSBuYW1lKSkge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtuYW1lfScgbm90IGZvdW5kIGluIGRhdGEuanNvbi4gV2lsbCBub3QgcGxheS5gKTtcbiAgICAgICAgICAgIC8vIE5vIGRlZmF1bHQgc291bmQsIGp1c3Qgd29uJ3QgYmUgaW4gZ2FtZS5hc3NldHMuc291bmRzXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHNvdW5kIG9mIGdhbWUuZGF0YS5hc3NldHMuc291bmRzKSB7XG4gICAgICAgIGF1ZGlvUHJvbWlzZXMucHVzaChuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4geyAvLyBDaGFuZ2VkIHRvIHJlc29sdmUgZXZlbiBvbiBlcnJvclxuICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XG4gICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XG4gICAgICAgICAgICBhdWRpby5sb2FkKCk7IC8vIFByZWxvYWQgdGhlIGF1ZGlvXG4gICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xuICAgICAgICAgICAgICAgIGdhbWUuYXNzZXRzLnNvdW5kc1tzb3VuZC5uYW1lXSA9IGF1ZGlvO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKGUpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIHNvdW5kICR7c291bmQubmFtZX0gZnJvbSAke3NvdW5kLnBhdGh9OmAsIGUpO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIGFsbG93IGdhbWUgdG8gY29udGludWVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pKTtcbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4udGV4dHVyZVByb21pc2VzLCAuLi5hdWRpb1Byb21pc2VzXSk7XG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBwcmVsb2FkZWQgKG9yIGZhbGxlbiBiYWNrIHRvIHBsYWNlaG9sZGVycykuXCIpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJVbmV4cGVjdGVkIGVycm9yIGR1cmluZyBhc3NldCBwcmVsb2FkaW5nOlwiLCBlcnJvcik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzZXR1cFVJKCk6IHZvaWQge1xuICAgIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLmNhbnZhcykgcmV0dXJuO1xuXG4gICAgY29uc3QgYm9keSA9IGRvY3VtZW50LmJvZHk7XG4gICAgYm9keS5zdHlsZS5tYXJnaW4gPSAnMCc7XG4gICAgYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXG4gICAgLy8gVGl0bGUgU2NyZWVuXG4gICAgY29uc3QgdGl0bGVTY3JlZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB0aXRsZVNjcmVlbi5pZCA9ICd0aXRsZVNjcmVlbic7XG4gICAgT2JqZWN0LmFzc2lnbih0aXRsZVNjcmVlbi5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgICAgdG9wOiAnMCcsXG4gICAgICAgIGxlZnQ6ICcwJyxcbiAgICAgICAgd2lkdGg6ICcxMDAlJyxcbiAgICAgICAgaGVpZ2h0OiAnMTAwJScsXG4gICAgICAgIGJhY2tncm91bmRDb2xvcjogYHJnYmEoMCwgMCwgMCwgMC43KWAsXG4gICAgICAgIGNvbG9yOiBnYW1lLmRhdGEuY29sb3JzLnRpdGxlVGV4dCxcbiAgICAgICAgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcbiAgICAgICAgZGlzcGxheTogJ2ZsZXgnLFxuICAgICAgICBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcbiAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuICAgICAgICBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcbiAgICAgICAgekluZGV4OiAnMTAwJyxcbiAgICAgICAgZm9udFNpemU6ICc0OHB4JyxcbiAgICAgICAgdGV4dEFsaWduOiAnY2VudGVyJyxcbiAgICB9KTtcbiAgICB0aXRsZVNjcmVlbi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxoMT4zRCBcdUJDNDBcdUFDOENcdUM3ODQ8L2gxPlxuICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMjRweDtcIj5QcmVzcyBTUEFDRSB0byBTdGFydDwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDE4cHg7XCI+VXNlIEFycm93IEtleXMgdG8gTW92ZTwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDE4cHg7XCI+VXNlIE1vdXNlIHRvIFJvdGF0ZSBDYW1lcmE8L3A+IDwhLS0gXHVCOUM4XHVDNkIwXHVDMkE0IFx1QzEyNFx1QkE4NSBcdUNEOTRcdUFDMDAgLS0+XG4gICAgYDtcbiAgICBib2R5LmFwcGVuZENoaWxkKHRpdGxlU2NyZWVuKTtcbiAgICBnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4gPSB0aXRsZVNjcmVlbjtcblxuICAgIC8vIFNjb3JlIERpc3BsYXlcbiAgICBjb25zdCBzY29yZURpc3BsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBzY29yZURpc3BsYXkuaWQgPSAnc2NvcmVEaXNwbGF5JztcbiAgICBPYmplY3QuYXNzaWduKHNjb3JlRGlzcGxheS5zdHlsZSwge1xuICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcbiAgICAgICAgdG9wOiAnMTBweCcsXG4gICAgICAgIGxlZnQ6ICcxMHB4JyxcbiAgICAgICAgY29sb3I6IGdhbWUuZGF0YS5jb2xvcnMuc2NvcmVUZXh0LFxuICAgICAgICBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxuICAgICAgICBmb250U2l6ZTogJzI0cHgnLFxuICAgICAgICB6SW5kZXg6ICcxMDEnLFxuICAgICAgICBkaXNwbGF5OiAnbm9uZScsIC8vIEhpZGRlbiBpbml0aWFsbHlcbiAgICB9KTtcbiAgICBzY29yZURpc3BsYXkuaW5uZXJUZXh0ID0gYFNjb3JlOiAwYDtcbiAgICBib2R5LmFwcGVuZENoaWxkKHNjb3JlRGlzcGxheSk7XG4gICAgZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSA9IHNjb3JlRGlzcGxheTtcblxuICAgIC8vIEdhbWUgT3ZlciBTY3JlZW5cbiAgICBjb25zdCBnYW1lT3ZlclNjcmVlbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGdhbWVPdmVyU2NyZWVuLmlkID0gJ2dhbWVPdmVyU2NyZWVuJztcbiAgICBPYmplY3QuYXNzaWduKGdhbWVPdmVyU2NyZWVuLnN0eWxlLCB7XG4gICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuICAgICAgICB0b3A6ICcwJyxcbiAgICAgICAgbGVmdDogJzAnLFxuICAgICAgICB3aWR0aDogJzEwMCUnLFxuICAgICAgICBoZWlnaHQ6ICcxMDAlJyxcbiAgICAgICAgYmFja2dyb3VuZENvbG9yOiBgcmdiYSgwLCAwLCAwLCAwLjcpYCxcbiAgICAgICAgY29sb3I6IGdhbWUuZGF0YS5jb2xvcnMuZ2FtZU92ZXJUZXh0LFxuICAgICAgICBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxuICAgICAgICBkaXNwbGF5OiAnbm9uZScsIC8vIEhpZGRlbiBpbml0aWFsbHlcbiAgICAgICAgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXG4gICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyxcbiAgICAgICAgYWxpZ25JdGVtczogJ2NlbnRlcicsXG4gICAgICAgIHpJbmRleDogJzEwMicsXG4gICAgICAgIGZvbnRTaXplOiAnNDhweCcsXG4gICAgICAgIHRleHRBbGlnbjogJ2NlbnRlcicsXG4gICAgfSk7XG4gICAgZ2FtZU92ZXJTY3JlZW4uaW5uZXJIVE1MID0gYFxuICAgICAgICA8aDE+R0FNRSBPVkVSITwvaDE+XG4gICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAzNnB4O1wiIGlkPVwiZmluYWxTY29yZVwiPlNjb3JlOiAwPC9wPlxuICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMjRweDtcIj5QcmVzcyBTUEFDRSB0byBSZXN0YXJ0PC9wPlxuICAgIGA7XG4gICAgYm9keS5hcHBlbmRDaGlsZChnYW1lT3ZlclNjcmVlbik7XG4gICAgZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuID0gZ2FtZU92ZXJTY3JlZW47XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUdhbWVXb3JsZCgpOiB2b2lkIHtcbiAgICBpZiAoIWdhbWUuZGF0YSB8fCAhZ2FtZS5jYW52YXMpIHJldHVybjtcblxuICAgIC8vIFRocmVlLmpzIHNldHVwXG4gICAgZ2FtZS5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xuICAgIGdhbWUuc2NlbmUuYmFja2dyb3VuZCA9IG5ldyBUSFJFRS5Db2xvcihnYW1lLmRhdGEuY29sb3JzLmJhY2tncm91bmQpO1xuXG4gICAgZ2FtZS5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFGT1YsXG4gICAgICAgIGdhbWUuZGF0YS5jYW52YXNXaWR0aCAvIGdhbWUuZGF0YS5jYW52YXNIZWlnaHQsXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFOZWFyLFxuICAgICAgICBnYW1lLmRhdGEuY2FtZXJhRmFyXG4gICAgKTtcbiAgICBnYW1lLmNhbWVyYS5wb3NpdGlvbi5zZXQoXG4gICAgICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi54LFxuICAgICAgICBnYW1lLmRhdGEuY2FtZXJhUG9zaXRpb24ueSxcbiAgICAgICAgZ2FtZS5kYXRhLmNhbWVyYVBvc2l0aW9uLnpcbiAgICApO1xuICAgIC8vIGdhbWUuY2FtZXJhLmxvb2tBdCgwLCAwLCAwKTsgLy8gT3JiaXRDb250cm9sc1x1QUMwMCBcdUNFNzRcdUJBNTRcdUI3N0MgXHVCQzI5XHVENUE1XHVDNzQ0IFx1QzgxQ1x1QzVCNFx1RDU1OFx1QkJDMFx1Qjg1QyBcdUM4RkNcdUMxMUQgXHVDQzk4XHVCOUFDXG5cbiAgICBnYW1lLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IGdhbWUuY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XG4gICAgZ2FtZS5yZW5kZXJlci5zZXRTaXplKGdhbWUuZGF0YS5jYW52YXNXaWR0aCwgZ2FtZS5kYXRhLmNhbnZhc0hlaWdodCk7XG4gICAgZ2FtZS5yZW5kZXJlci5zaGFkb3dNYXAuZW5hYmxlZCA9IHRydWU7IC8vIEVuYWJsZSBzaGFkb3dzIGlmIGRlc2lyZWRcblxuICAgIC8vIE9yYml0Q29udHJvbHMgXHVDMTI0XHVDODE1XG4gICAgZ2FtZS5jb250cm9scyA9IG5ldyBPcmJpdENvbnRyb2xzKGdhbWUuY2FtZXJhLCBnYW1lLnJlbmRlcmVyLmRvbUVsZW1lbnQpO1xuICAgIGdhbWUuY29udHJvbHMuZW5hYmxlRERhbXBpbmcgPSB0cnVlOyAvLyBcdUNFNzRcdUJBNTRcdUI3N0MgXHVDNkMwXHVDOUMxXHVDNzg0XHVDNzQ0IFx1QkQ4MFx1QjREQ1x1QjdGRFx1QUM4Q1xuICAgIGdhbWUuY29udHJvbHMuZGFtcGluZ0ZhY3RvciA9IDAuMDU7XG4gICAgZ2FtZS5jb250cm9scy5zY3JlZW5TcGFjZVBhbm5pbmcgPSBmYWxzZTsgLy8gXHVEMzJDIFx1QUUzMFx1QjJBNSBcdUMyREMgXHVDRTc0XHVCQTU0XHVCNzdDXHVBQzAwIFx1QkMxNFx1QjJFNVx1Qzc0NCBcdUI2QUJcdUFDRTAgXHVCMEI0XHVCODI0XHVBQzAwXHVDOUMwIFx1QzU0QVx1QjNDNFx1Qjg1RFxuICAgIGdhbWUuY29udHJvbHMubWluRGlzdGFuY2UgPSA1OyAvLyBcdUNENUNcdUMxOEMgXHVDOTBDIFx1QzU0NFx1QzZDMyBcdUFDNzBcdUI5QUNcbiAgICBnYW1lLmNvbnRyb2xzLm1heERpc3RhbmNlID0gNTA7IC8vIFx1Q0Q1Q1x1QjMwMCBcdUM5MEMgXHVDNzc4IFx1QUM3MFx1QjlBQ1xuICAgIGdhbWUuY29udHJvbHMudGFyZ2V0LnNldCgwLCAwLCAwKTsgLy8gXHVDRTc0XHVCQTU0XHVCNzdDXHVBQzAwIFx1QUM4Q1x1Qzc4NCBcdUMxMzhcdUFDQzRcdUM3NTggXHVDOTExXHVDNTU5XHVDNzQ0IFx1QkMxNFx1Qjc3Q1x1QkNGNFx1QjNDNFx1Qjg1RCBcdUMxMjRcdUM4MTVcbiAgICBnYW1lLmNvbnRyb2xzLmVuYWJsZWQgPSBmYWxzZTsgLy8gXHVBQzhDXHVDNzg0IFx1QzJEQ1x1Qzc5MSBcdUM4MDRcdUM1RDBcdUIyOTQgXHVDRUU4XHVEMkI4XHVCODY0IFx1QkU0NFx1RDY1Q1x1QzEzMVx1RDY1NFxuICAgIGdhbWUuY29udHJvbHMudXBkYXRlKCk7IC8vIFx1Q0QwOFx1QUUzMCBcdUMxMjRcdUM4MTUgXHVDODAxXHVDNkE5XG5cbiAgICAvLyBMaWdodHNcbiAgICBjb25zdCBhbWJpZW50TGlnaHQgPSBuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4NDA0MDQwKTsgLy8gc29mdCB3aGl0ZSBsaWdodFxuICAgIGdhbWUuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XG4gICAgY29uc3QgZGlyZWN0aW9uYWxMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAxKTtcbiAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldChnYW1lLmRhdGEubGlnaHRQb3NpdGlvbi54LCBnYW1lLmRhdGEubGlnaHRQb3NpdGlvbi55LCBnYW1lLmRhdGEubGlnaHRQb3NpdGlvbi56KTtcbiAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlO1xuICAgIGdhbWUuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xuXG4gICAgLy8gQ2Fubm9uLmpzIHNldHVwXG4gICAgZ2FtZS5jYW5ub25Xb3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcbiAgICBnYW1lLmNhbm5vbldvcmxkLmdyYXZpdHkuc2V0KDAsIDAsIDApOyAvLyBObyBncmF2aXR5IGZvciBhIHNuYWtlIGdhbWVcbiAgICBnYW1lLmNhbm5vbldvcmxkLmRlZmF1bHRDb250YWN0TWF0ZXJpYWwuZnJpY3Rpb24gPSAwO1xuICAgIGdhbWUuY2Fubm9uV29ybGQuZGVmYXVsdENvbnRhY3RNYXRlcmlhbC5yZXN0aXR1dGlvbiA9IDA7XG5cbiAgICAvLyBDcmVhdGUgd2FsbHMgKGJvdW5kYXJpZXMpXG4gICAgY29uc3Qgd29ybGRTaXplID0gZ2FtZS5kYXRhLmdyaWRTaXplICogMjA7IC8vIEFzc3VtaW5nIGEgMjB4MjAgcGxheWFibGUgZ3JpZFxuICAgIGNvbnN0IGhhbGZXb3JsZFNpemUgPSB3b3JsZFNpemUgLyAyO1xuICAgIGNvbnN0IHdhbGxUaGlja25lc3MgPSBnYW1lLmRhdGEud2FsbFRoaWNrbmVzcztcbiAgICBjb25zdCB3YWxsSGVpZ2h0ID0gZ2FtZS5kYXRhLmdyaWRTaXplOyAvLyBXYWxscyBhcmUgYXMgdGFsbCBhcyBhIHNuYWtlIHNlZ21lbnRcblxuICAgIC8vIE1hdGVyaWFsIGZvciB3YWxsc1xuICAgIGNvbnN0IHdhbGxUZXh0dXJlID0gZ2FtZS5hc3NldHMudGV4dHVyZXNbJ3dhbGxfdGV4dHVyZSddO1xuICAgIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgbWFwOiB3YWxsVGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUgPyB3YWxsVGV4dHVyZSA6IHVuZGVmaW5lZCwgY29sb3I6IHdhbGxUZXh0dXJlIGluc3RhbmNlb2YgVEhSRUUuQ29sb3IgPyB3YWxsVGV4dHVyZSA6IHVuZGVmaW5lZCB9KTtcbiAgICBcbiAgICAvLyBGcm9udCB3YWxsICgrWilcbiAgICBjcmVhdGVXYWxsKDAsIDAsIC1oYWxmV29ybGRTaXplIC0gd2FsbFRoaWNrbmVzcyAvIDIsIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLCB3YWxsSGVpZ2h0LCB3YWxsVGhpY2tuZXNzLCB3YWxsTWF0ZXJpYWwsIFwid2FsbF96X25lZ1wiKTtcbiAgICAvLyBCYWNrIHdhbGwgKC1aKVxuICAgIGNyZWF0ZVdhbGwoMCwgMCwgaGFsZldvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgLyAyLCB3b3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzICogMiwgd2FsbEhlaWdodCwgd2FsbFRoaWNrbmVzcywgd2FsbE1hdGVyaWFsLCBcIndhbGxfel9wb3NcIik7XG4gICAgLy8gTGVmdCB3YWxsICgtWClcbiAgICBjcmVhdGVXYWxsKC1oYWxmV29ybGRTaXplIC0gd2FsbFRoaWNrbmVzcyAvIDIsIDAsIDAsIHdhbGxUaGlja25lc3MsIHdhbGxIZWlnaHQsIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLCB3YWxsTWF0ZXJpYWwsIFwid2FsbF94X25lZ1wiKTtcbiAgICAvLyBSaWdodCB3YWxsICgrWClcbiAgICBjcmVhdGVXYWxsKGhhbGZXb3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzIC8gMiwgMCwgMCwgd2FsbFRoaWNrbmVzcywgd2FsbEhlaWdodCwgd29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAqIDIsIHdhbGxNYXRlcmlhbCwgXCJ3YWxsX3hfcG9zXCIpO1xuXG4gICAgLy8gSW5pdGlhbCBzZXR1cCBmb3IgdGhlIGdhbWUgc3RhdGUgKGJlZm9yZSBzdGFydGluZylcbiAgICBnYW1lLm1vdmVJbnRlcnZhbCA9IDEwMDAgLyBnYW1lLmRhdGEuc25ha2VTcGVlZDtcbiAgICBnYW1lLmRpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKDEsIDAsIDApO1xuICAgIGdhbWUubmV4dERpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKDEsIDAsIDApO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVXYWxsKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBkZXB0aDogbnVtYmVyLCBtYXRlcmlhbDogVEhSRUUuTWF0ZXJpYWwsIG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGlmICghZ2FtZS5zY2VuZSB8fCAhZ2FtZS5jYW5ub25Xb3JsZCkgcmV0dXJuO1xuXG4gICAgY29uc3Qgd2FsbEdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHdpZHRoLCBoZWlnaHQsIGRlcHRoKTtcbiAgICBjb25zdCB3YWxsTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHdhbGxHZW9tZXRyeSwgbWF0ZXJpYWwpO1xuICAgIHdhbGxNZXNoLnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcbiAgICB3YWxsTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgICBnYW1lLnNjZW5lLmFkZCh3YWxsTWVzaCk7XG5cbiAgICBjb25zdCB3YWxsU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMod2lkdGggLyAyLCBoZWlnaHQgLyAyLCBkZXB0aCAvIDIpKTtcbiAgICBjb25zdCB3YWxsQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAgfSk7IC8vIE1hc3MgMCBtYWtlcyBpdCBzdGF0aWNcbiAgICB3YWxsQm9keS5hZGRTaGFwZSh3YWxsU2hhcGUpO1xuICAgIHdhbGxCb2R5LnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcbiAgICBnYW1lLmNhbm5vbldvcmxkLmFkZEJvZHkod2FsbEJvZHkpO1xuICAgIGdhbWUud2FsbEJvZGllcy5wdXNoKHdhbGxCb2R5KTtcbn1cblxuXG5mdW5jdGlvbiBjcmVhdGVTbmFrZVNlZ21lbnQocG9zaXRpb246IFRIUkVFLlZlY3RvcjMsIGlzSGVhZDogYm9vbGVhbik6IHsgbWVzaDogVEhSRUUuTWVzaDsgYm9keTogQ0FOTk9OLkJvZHk7IH0ge1xuICAgIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkdhbWUgbm90IGluaXRpYWxpemVkIGZvciBjcmVhdGluZyBzbmFrZSBzZWdtZW50cy5cIik7XG4gICAgfVxuXG4gICAgY29uc3Qgc2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZTtcbiAgICBjb25zdCB0ZXh0dXJlID0gaXNIZWFkID8gZ2FtZS5hc3NldHMudGV4dHVyZXNbJ3NuYWtlX2hlYWQnXSA6IGdhbWUuYXNzZXRzLnRleHR1cmVzWydzbmFrZV9ib2R5J107XG4gICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUgPyB0ZXh0dXJlIDogdW5kZWZpbmVkLCBjb2xvcjogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gdGV4dHVyZSA6IHVuZGVmaW5lZCB9KTtcbiAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShzaXplLCBzaXplLCBzaXplKTtcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgICBtZXNoLnBvc2l0aW9uLmNvcHkocG9zaXRpb24pO1xuICAgIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XG4gICAgZ2FtZS5zY2VuZS5hZGQobWVzaCk7XG5cbiAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhzaXplIC8gMiwgc2l6ZSAvIDIsIHNpemUgLyAyKSk7XG4gICAgY29uc3QgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDEgfSk7IC8vIEdpdmUgaXQgYSBtYXNzLCBidXQgd2UnbGwgY29udHJvbCBpdHMgcG9zaXRpb25cbiAgICBib2R5LmFkZFNoYXBlKHNoYXBlKTtcbiAgICBib2R5LnBvc2l0aW9uLmNvcHkobmV3IENBTk5PTi5WZWMzKHBvc2l0aW9uLngsIHBvc2l0aW9uLnksIHBvc2l0aW9uLnopKTtcbiAgICBnYW1lLmNhbm5vbldvcmxkLmFkZEJvZHkoYm9keSk7XG5cbiAgICByZXR1cm4geyBtZXNoLCBib2R5IH07XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRm9vZCgpOiB2b2lkIHtcbiAgICBpZiAoIWdhbWUuZGF0YSB8fCAhZ2FtZS5zY2VuZSB8fCAhZ2FtZS5jYW5ub25Xb3JsZCkgcmV0dXJuO1xuXG4gICAgLy8gUmVtb3ZlIG9sZCBmb29kIGlmIGl0IGV4aXN0c1xuICAgIGlmIChnYW1lLmZvb2QubWVzaCkge1xuICAgICAgICBnYW1lLnNjZW5lLnJlbW92ZShnYW1lLmZvb2QubWVzaCk7XG4gICAgICAgIGdhbWUuZm9vZC5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgICAgKGdhbWUuZm9vZC5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XG4gICAgICAgIGdhbWUuZm9vZC5tZXNoID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGdhbWUuZm9vZC5ib2R5KSB7XG4gICAgICAgIGdhbWUuY2Fubm9uV29ybGQucmVtb3ZlQm9keShnYW1lLmZvb2QuYm9keSk7XG4gICAgICAgIGdhbWUuZm9vZC5ib2R5ID0gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCB3b3JsZFNpemUgPSBnYW1lLmRhdGEuZ3JpZFNpemUgKiAyMDtcbiAgICBjb25zdCBoYWxmV29ybGRTaXplID0gd29ybGRTaXplIC8gMjtcbiAgICBjb25zdCBzaXplID0gZ2FtZS5kYXRhLmdyaWRTaXplO1xuICAgIGxldCBmb29kUG9zaXRpb246IFRIUkVFLlZlY3RvcjM7XG4gICAgbGV0IGNvbGxpc2lvbldpdGhTbmFrZTogYm9vbGVhbjtcblxuICAgIGRvIHtcbiAgICAgICAgY29sbGlzaW9uV2l0aFNuYWtlID0gZmFsc2U7XG4gICAgICAgIC8vIEdlbmVyYXRlIHJhbmRvbSBncmlkIHBvc2l0aW9uIHdpdGhpbiBib3VuZHMgKGV4Y2x1ZGluZyB3YWxsIHRoaWNrbmVzcyBhcmVhKVxuICAgICAgICBjb25zdCBudW1DZWxscyA9IDIwOyAvLyBBc3N1bWluZyAyMHgyMCBncmlkXG4gICAgICAgIGNvbnN0IHJhbmRYID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbnVtQ2VsbHMpIC0gbnVtQ2VsbHMgLyAyOyAvLyAtMTAgdG8gOVxuICAgICAgICBjb25zdCByYW5kWiA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG51bUNlbGxzKSAtIG51bUNlbGxzIC8gMjsgLy8gLTEwIHRvIDlcblxuICAgICAgICBmb29kUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMyhcbiAgICAgICAgICAgIHJhbmRYICogc2l6ZSArIHNpemUgLyAyLCAvLyBDZW50ZXIgb2YgdGhlIGdyaWQgY2VsbFxuICAgICAgICAgICAgMCwgLy8gRm9vZCBhdCB5PTAsIHNhbWUgbGV2ZWwgYXMgc25ha2VcbiAgICAgICAgICAgIHJhbmRaICogc2l6ZSArIHNpemUgLyAyXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQ2hlY2sgZm9yIGNvbGxpc2lvbiB3aXRoIHNuYWtlXG4gICAgICAgIGZvciAoY29uc3Qgc2VnbWVudCBvZiBnYW1lLnNuYWtlKSB7XG4gICAgICAgICAgICBpZiAoc2VnbWVudC5tZXNoLnBvc2l0aW9uLmRpc3RhbmNlVG8oZm9vZFBvc2l0aW9uKSA8IHNpemUgKiAwLjkpIHsgLy8gQ2hlY2sgaWYgcG9zaXRpb25zIGFyZSB2ZXJ5IGNsb3NlXG4gICAgICAgICAgICAgICAgY29sbGlzaW9uV2l0aFNuYWtlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0gd2hpbGUgKGNvbGxpc2lvbldpdGhTbmFrZSk7XG5cblxuICAgIGNvbnN0IHRleHR1cmUgPSBnYW1lLmFzc2V0cy50ZXh0dXJlc1snZm9vZCddO1xuICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoeyBtYXA6IHRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlID8gdGV4dHVyZSA6IHVuZGVmaW5lZCwgY29sb3I6IHRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5Db2xvciA/IHRleHR1cmUgOiB1bmRlZmluZWQgfSk7XG4gICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoc2l6ZSAvIDIsIDE2LCAxNik7IC8vIEZvb2QgaXMgYSBzcGhlcmVcbiAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgICBtZXNoLnBvc2l0aW9uLmNvcHkoZm9vZFBvc2l0aW9uKTtcbiAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xuICAgIGdhbWUuc2NlbmUuYWRkKG1lc2gpO1xuICAgIGdhbWUuZm9vZC5tZXNoID0gbWVzaDtcblxuICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoc2l6ZSAvIDIpO1xuICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwLjEgfSk7IC8vIFNtYWxsIG1hc3Mgc28gaXQgY2FuIGJlICdlYXRlbidcbiAgICBib2R5LmFkZFNoYXBlKHNoYXBlKTtcbiAgICBib2R5LnBvc2l0aW9uLmNvcHkobmV3IENBTk5PTi5WZWMzKGZvb2RQb3NpdGlvbi54LCBmb29kUG9zaXRpb24ueSwgZm9vZFBvc2l0aW9uLnopKTtcbiAgICBnYW1lLmNhbm5vbldvcmxkLmFkZEJvZHkoYm9keSk7XG4gICAgZ2FtZS5mb29kLmJvZHkgPSBib2R5O1xufVxuXG5mdW5jdGlvbiBwbGF5U291bmQobmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3Qgc291bmQgPSBnYW1lLmFzc2V0cy5zb3VuZHNbbmFtZV07XG4gICAgaWYgKHNvdW5kKSB7XG4gICAgICAgIHNvdW5kLmN1cnJlbnRUaW1lID0gMDsgLy8gUmV3aW5kIHRvIHN0YXJ0IGlmIGFscmVhZHkgcGxheWluZ1xuICAgICAgICBzb3VuZC5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBwbGF5IHNvdW5kICR7bmFtZX06YCwgZSkpOyAvLyBDYXRjaCBwcm9taXNlIHJlamVjdGlvblxuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7bmFtZX0nIG5vdCBmb3VuZC5gKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVNjb3JlVUkoKTogdm9pZCB7XG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkpIHtcbiAgICAgICAgZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheS5pbm5lclRleHQgPSBgU2NvcmU6ICR7Z2FtZS5zY29yZX1gO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gcmVzZXRHYW1lKCk6IHZvaWQge1xuICAgIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSByZXR1cm47XG5cbiAgICAvLyBDbGVhciBleGlzdGluZyBzbmFrZSBhbmQgZm9vZFxuICAgIGdhbWUuc25ha2UuZm9yRWFjaChzZWdtZW50ID0+IHtcbiAgICAgICAgZ2FtZS5zY2VuZT8ucmVtb3ZlKHNlZ21lbnQubWVzaCk7XG4gICAgICAgIHNlZ21lbnQubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgICAgIChzZWdtZW50Lm1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwpLmRpc3Bvc2UoKTtcbiAgICAgICAgZ2FtZS5jYW5ub25Xb3JsZD8ucmVtb3ZlQm9keShzZWdtZW50LmJvZHkpO1xuICAgIH0pO1xuICAgIGdhbWUuc25ha2UgPSBbXTtcblxuICAgIGlmIChnYW1lLmZvb2QubWVzaCkge1xuICAgICAgICBnYW1lLnNjZW5lLnJlbW92ZShnYW1lLmZvb2QubWVzaCk7XG4gICAgICAgIGdhbWUuZm9vZC5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgICAgKGdhbWUuZm9vZC5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XG4gICAgICAgIGdhbWUuZm9vZC5tZXNoID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKGdhbWUuZm9vZC5ib2R5KSB7XG4gICAgICAgIGdhbWUuY2Fubm9uV29ybGQucmVtb3ZlQm9keShnYW1lLmZvb2QuYm9keSk7XG4gICAgICAgIGdhbWUuZm9vZC5ib2R5ID0gbnVsbDtcbiAgICB9XG5cbiAgICAvLyBJbml0aWFsIHNuYWtlIHBvc2l0aW9uIChlLmcuLCBjZW50ZXIgb2YgdGhlIHBsYXlhYmxlIGFyZWEpXG4gICAgY29uc3QgaW5pdGlhbFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDApO1xuXG4gICAgLy8gQ3JlYXRlIGluaXRpYWwgc25ha2Ugc2VnbWVudHNcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGdhbWUuZGF0YS5pbml0aWFsU25ha2VMZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBzZWdtZW50UG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoXG4gICAgICAgICAgICBpbml0aWFsUG9zLnggLSBpICogZ2FtZS5kYXRhLmdyaWRTaXplLFxuICAgICAgICAgICAgaW5pdGlhbFBvcy55LFxuICAgICAgICAgICAgaW5pdGlhbFBvcy56XG4gICAgICAgICk7XG4gICAgICAgIGdhbWUuc25ha2UucHVzaChjcmVhdGVTbmFrZVNlZ21lbnQoc2VnbWVudFBvcywgaSA9PT0gMCkpO1xuICAgIH1cblxuICAgIGdhbWUuZGlyZWN0aW9uLnNldCgxLCAwLCAwKTsgLy8gUmVzZXQgdG8gbW92aW5nIHJpZ2h0IChFYXN0KVxuICAgIGdhbWUubmV4dERpcmVjdGlvbi5zZXQoMSwgMCwgMCk7XG4gICAgZ2FtZS5zY29yZSA9IDA7XG4gICAgdXBkYXRlU2NvcmVVSSgpO1xuICAgIGdlbmVyYXRlRm9vZCgpO1xufVxuXG5mdW5jdGlvbiBzdGFydEdhbWUoKTogdm9pZCB7XG4gICAgaWYgKCFnYW1lLmRhdGEpIHJldHVybjtcblxuICAgIGdhbWUuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbikgZ2FtZS51aUVsZW1lbnRzLnRpdGxlU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbikgZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkpIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cbiAgICByZXNldEdhbWUoKTtcbiAgICBpZiAoZ2FtZS5hc3NldHMuc291bmRzWydiZ20nXSAmJiAhZ2FtZS5iZ20pIHtcbiAgICAgICAgZ2FtZS5iZ20gPSBnYW1lLmFzc2V0cy5zb3VuZHNbJ2JnbSddO1xuICAgICAgICBnYW1lLmJnbS5sb29wID0gdHJ1ZTtcbiAgICAgICAgZ2FtZS5iZ20ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHBsYXkgQkdNOlwiLCBlKSk7XG4gICAgfSBlbHNlIGlmIChnYW1lLmJnbSkge1xuICAgICAgICBnYW1lLmJnbS5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gcGxheSBCR006XCIsIGUpKTtcbiAgICB9XG5cbiAgICBwbGF5U291bmQoJ3N0YXJ0X2dhbWUnKTtcbiAgICBpZiAoZ2FtZS5jb250cm9scykge1xuICAgICAgICBnYW1lLmNvbnRyb2xzLmVuYWJsZWQgPSB0cnVlOyAvLyBcdUFDOENcdUM3ODQgXHVDMkRDXHVDNzkxIFx1QzJEQyBPcmJpdENvbnRyb2xzIFx1RDY1Q1x1QzEzMVx1RDY1NFxuICAgIH1cbn1cblxuZnVuY3Rpb24gZ2FtZU92ZXIoKTogdm9pZCB7XG4gICAgZ2FtZS5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xuICAgIGlmIChnYW1lLmJnbSkge1xuICAgICAgICBnYW1lLmJnbS5wYXVzZSgpO1xuICAgIH1cbiAgICBwbGF5U291bmQoJ2dhbWVfb3ZlcicpO1xuXG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkpIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICBpZiAoZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuKSBnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4uc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcbiAgICBjb25zdCBmaW5hbFNjb3JlRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaW5hbFNjb3JlJyk7XG4gICAgaWYgKGZpbmFsU2NvcmVFbGVtZW50KSB7XG4gICAgICAgIGZpbmFsU2NvcmVFbGVtZW50LmlubmVyVGV4dCA9IGBTY29yZTogJHtnYW1lLnNjb3JlfWA7XG4gICAgfVxuICAgIGlmIChnYW1lLmNvbnRyb2xzKSB7XG4gICAgICAgIGdhbWUuY29udHJvbHMuZW5hYmxlZCA9IGZhbHNlOyAvLyBcdUFDOENcdUM3ODQgXHVDNjI0XHVCQzg0IFx1QzJEQyBPcmJpdENvbnRyb2xzIFx1QkU0NFx1RDY1Q1x1QzEzMVx1RDY1NFxuICAgIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlSW5wdXQoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcbiAgICBpZiAoIWdhbWUuZGF0YSkgcmV0dXJuO1xuXG4gICAgY29uc3QgY3VycmVudERpciA9IGdhbWUuZGlyZWN0aW9uO1xuICAgIGxldCBuZXdEaXIgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xuXG4gICAgc3dpdGNoIChldmVudC5rZXkpIHtcbiAgICAgICAgY2FzZSAnQXJyb3dVcCc6XG4gICAgICAgICAgICBuZXdEaXIuc2V0KDAsIDAsIC0xKTsgLy8gTW92ZSBOb3J0aCAobmVnYXRpdmUgWilcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJvd0Rvd24nOlxuICAgICAgICAgICAgbmV3RGlyLnNldCgwLCAwLCAxKTsgLy8gTW92ZSBTb3V0aCAocG9zaXRpdmUgWilcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJvd0xlZnQnOlxuICAgICAgICAgICAgbmV3RGlyLnNldCgtMSwgMCwgMCk7IC8vIE1vdmUgV2VzdCAobmVnYXRpdmUgWClcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBcnJvd1JpZ2h0JzpcbiAgICAgICAgICAgIG5ld0Rpci5zZXQoMSwgMCwgMCk7IC8vIE1vdmUgRWFzdCAocG9zaXRpdmUgWClcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICcgJzogLy8gU3BhY2Uga2V5XG4gICAgICAgICAgICBpZiAoZ2FtZS5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSB8fCBnYW1lLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgc2Nyb2xsaW5nXG4gICAgICAgICAgICAgICAgc3RhcnRHYW1lKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm47IC8vIERvbid0IHByb2Nlc3Mgc3BhY2UgYXMgYSBkaXJlY3Rpb24gY2hhbmdlXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUHJldmVudCBpbW1lZGlhdGUgcmV2ZXJzZSAoZS5nLiwgdHJ5aW5nIHRvIGdvIGxlZnQgd2hlbiBjdXJyZW50bHkgZ29pbmcgcmlnaHQpXG4gICAgLy8gQ2hlY2sgaWYgbmV3RGlyIGlzIG5vdCBvcHBvc2l0ZSB0byBjdXJyZW50RGlyXG4gICAgaWYgKCFuZXdEaXIuZXF1YWxzKGN1cnJlbnREaXIuY2xvbmUoKS5uZWdhdGUoKSkpIHtcbiAgICAgICAgZ2FtZS5uZXh0RGlyZWN0aW9uLmNvcHkobmV3RGlyKTtcbiAgICB9XG59XG5cbi8vIC0tLSBHYW1lIExvb3AgLS0tXG5cbmZ1bmN0aW9uIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICghZ2FtZS5kYXRhIHx8IGdhbWUuZ2FtZVN0YXRlICE9PSBHYW1lU3RhdGUuUExBWUlORykgcmV0dXJuO1xuXG4gICAgZ2FtZS50aW1lU2luY2VMYXN0TW92ZSArPSBkZWx0YVRpbWU7XG5cbiAgICBpZiAoZ2FtZS50aW1lU2luY2VMYXN0TW92ZSA+PSBnYW1lLm1vdmVJbnRlcnZhbCAvIDEwMDApIHsgLy8gQ29udmVydCBtb3ZlSW50ZXJ2YWwgdG8gc2Vjb25kc1xuICAgICAgICBnYW1lLnRpbWVTaW5jZUxhc3RNb3ZlIC09IGdhbWUubW92ZUludGVydmFsIC8gMTAwMDtcblxuICAgICAgICBnYW1lLmRpcmVjdGlvbi5jb3B5KGdhbWUubmV4dERpcmVjdGlvbik7IC8vIEFwcGx5IGJ1ZmZlcmVkIGRpcmVjdGlvblxuXG4gICAgICAgIC8vIFN0b3JlIGN1cnJlbnQgaGVhZCBwb3NpdGlvbiBiZWZvcmUgbW92aW5nXG4gICAgICAgIGNvbnN0IG9sZEhlYWRQb3NpdGlvbiA9IGdhbWUuc25ha2VbMF0ubWVzaC5wb3NpdGlvbi5jbG9uZSgpO1xuXG4gICAgICAgIC8vIENhbGN1bGF0ZSBuZXcgaGVhZCBwb3NpdGlvblxuICAgICAgICBjb25zdCBoZWFkID0gZ2FtZS5zbmFrZVswXTtcbiAgICAgICAgY29uc3QgbmV3SGVhZFBvc2l0aW9uID0gaGVhZC5tZXNoLnBvc2l0aW9uLmNsb25lKCkuYWRkKGdhbWUuZGlyZWN0aW9uLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoZ2FtZS5kYXRhLmdyaWRTaXplKSk7XG5cbiAgICAgICAgLy8gLS0tIENvbGxpc2lvbiBEZXRlY3Rpb24gLS0tXG4gICAgICAgIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwO1xuICAgICAgICBjb25zdCBoYWxmV29ybGRTaXplID0gd29ybGRTaXplIC8gMjtcbiAgICAgICAgY29uc3QgbWF4Q29vcmQgPSBoYWxmV29ybGRTaXplIC0gZ2FtZS5kYXRhLmdyaWRTaXplIC8gMjtcbiAgICAgICAgY29uc3QgbWluQ29vcmQgPSAtaGFsZldvcmxkU2l6ZSArIGdhbWUuZGF0YS5ncmlkU2l6ZSAvIDI7XG5cbiAgICAgICAgLy8gV2FsbCBjb2xsaXNpb25cbiAgICAgICAgLy8gQ2hlY2sgaWYgbmV3SGVhZFBvc2l0aW9uIGlzIG91dHNpZGUgdGhlIHBsYXkgYXJlYSBkZWZpbmVkIGJ5IG1pbi9tYXhDb29yZFxuICAgICAgICBpZiAobmV3SGVhZFBvc2l0aW9uLnggPiBtYXhDb29yZCB8fCBuZXdIZWFkUG9zaXRpb24ueCA8IG1pbkNvb3JkIHx8XG4gICAgICAgICAgICBuZXdIZWFkUG9zaXRpb24ueiA+IG1heENvb3JkIHx8IG5ld0hlYWRQb3NpdGlvbi56IDwgbWluQ29vcmQpIHtcbiAgICAgICAgICAgIGdhbWVPdmVyKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTZWxmLWNvbGxpc2lvbiAoY2hlY2sgbmV3IGhlYWQgcG9zaXRpb24gYWdhaW5zdCBhbGwgYm9keSBzZWdtZW50cyBleGNlcHQgdGhlIGN1cnJlbnQgaGVhZClcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBnYW1lLnNuYWtlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAobmV3SGVhZFBvc2l0aW9uLmRpc3RhbmNlVG8oZ2FtZS5zbmFrZVtpXS5tZXNoLnBvc2l0aW9uKSA8IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDAuOSkgeyAvLyBDaGVjayBpZiBwb3NpdGlvbnMgYXJlIHZlcnkgY2xvc2VcbiAgICAgICAgICAgICAgICBnYW1lT3ZlcigpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1vdmUgc25ha2U6IEhlYWQgbW92ZXMgdG8gbmV3IHBvc2l0aW9uLCBib2R5IHNlZ21lbnRzIGZvbGxvd1xuICAgICAgICBmb3IgKGxldCBpID0gZ2FtZS5zbmFrZS5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICAgICAgICBnYW1lLnNuYWtlW2ldLm1lc2gucG9zaXRpb24uY29weShnYW1lLnNuYWtlW2kgLSAxXS5tZXNoLnBvc2l0aW9uKTtcbiAgICAgICAgICAgIGdhbWUuc25ha2VbaV0uYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhnYW1lLnNuYWtlW2kgLSAxXS5tZXNoLnBvc2l0aW9uLngsIGdhbWUuc25ha2VbaSAtIDFdLm1lc2gucG9zaXRpb24ueSwgZ2FtZS5zbmFrZVtpIC0gMV0ubWVzaC5wb3NpdGlvbi56KSk7XG4gICAgICAgIH1cbiAgICAgICAgaGVhZC5tZXNoLnBvc2l0aW9uLmNvcHkobmV3SGVhZFBvc2l0aW9uKTtcbiAgICAgICAgaGVhZC5ib2R5LnBvc2l0aW9uLmNvcHkobmV3IENBTk5PTi5WZWMzKG5ld0hlYWRQb3NpdGlvbi54LCBuZXdIZWFkUG9zaXRpb24ueSwgbmV3SGVhZFBvc2l0aW9uLnopKTtcblxuXG4gICAgICAgIC8vIEZvb2QgY29sbGlzaW9uXG4gICAgICAgIGlmIChnYW1lLmZvb2QubWVzaCAmJiBuZXdIZWFkUG9zaXRpb24uZGlzdGFuY2VUbyhnYW1lLmZvb2QubWVzaC5wb3NpdGlvbikgPCBnYW1lLmRhdGEuZ3JpZFNpemUgKiAwLjkpIHtcbiAgICAgICAgICAgIHBsYXlTb3VuZCgnZWF0X2Zvb2QnKTtcbiAgICAgICAgICAgIGdhbWUuc2NvcmUrKztcbiAgICAgICAgICAgIHVwZGF0ZVNjb3JlVUkoKTtcblxuICAgICAgICAgICAgLy8gQWRkIG5ldyBzZWdtZW50IGF0IHRoZSBvbGQgdGFpbCdzIHBvc2l0aW9uICh0aGUgcG9zaXRpb24gb2YgdGhlIHNlZ21lbnQgdGhhdCB3YXMgbW92ZWQgZnJvbSBieSB0aGUgbGFzdCBzZWdtZW50KVxuICAgICAgICAgICAgLy8gVGhlIHNlZ21lbnQgdGhhdCB3YXMgYXQgZ2FtZS5zbmFrZVtnYW1lLnNuYWtlLmxlbmd0aCAtIDFdIGJlZm9yZSB0aGUgbW92ZSBub3cgbmVlZHMgYSBuZXcgb25lIGJlaGluZCBpdC5cbiAgICAgICAgICAgIC8vIFRoZSBvbGRIZWFkUG9zaXRpb24gKHdoaWNoIGlzIG5vdyBlZmZlY3RpdmVseSB0aGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IGJvZHkgc2VnbWVudClcbiAgICAgICAgICAgIC8vIGlzIG5vdCBzdWl0YWJsZSBmb3IgdGhlIG5ldyBzZWdtZW50LiBJbnN0ZWFkLCB0aGUgbGFzdCBzZWdtZW50J3MgKnByZXZpb3VzKiBwb3NpdGlvblxuICAgICAgICAgICAgLy8gKGJlZm9yZSBpdCBtb3ZlZCkgaXMgdGhlIGNvcnJlY3Qgc3BvdC4gQnV0IHNpbmNlIHdlIGp1c3QgbW92ZWQgZXZlcnl0aGluZyxcbiAgICAgICAgICAgIC8vIHRoZSBuZXcgc2VnbWVudCBzaG91bGQgYWN0dWFsbHkgb2NjdXB5IHRoZSBgb2xkSGVhZFBvc2l0aW9uYCdzIGxhc3QgcG9zaXRpb24uXG4gICAgICAgICAgICAvLyBBIHNpbXBsZXIgYXBwcm9hY2g6IGNyZWF0ZSB0aGUgbmV3IHNlZ21lbnQgYXQgdGhlIHBvc2l0aW9uIG9mIHRoZSBsYXN0IHNlZ21lbnQgKmFmdGVyKiB0aGUgbW92ZS5cbiAgICAgICAgICAgIC8vIFRoaXMgbWFrZXMgdGhlIHNuYWtlIGdyb3cgZnJvbSBpdHMgdGFpbCBpbiB0aGUgZGlyZWN0aW9uIGl0IHdhcyBtb3ZpbmcuXG4gICAgICAgICAgICBjb25zdCBsYXN0U2VnbWVudEN1cnJlbnRQb3MgPSBnYW1lLnNuYWtlW2dhbWUuc25ha2UubGVuZ3RoIC0gMV0ubWVzaC5wb3NpdGlvbi5jbG9uZSgpO1xuICAgICAgICAgICAgZ2FtZS5zbmFrZS5wdXNoKGNyZWF0ZVNuYWtlU2VnbWVudChsYXN0U2VnbWVudEN1cnJlbnRQb3MsIGZhbHNlKSk7IFxuXG4gICAgICAgICAgICBnZW5lcmF0ZUZvb2QoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBDYW5ub24uanMgd29ybGQgKGV2ZW4gaWYgcG9zaXRpb25zIGFyZSBtYW51YWxseSBzZXQsIHRoaXMgcHJvY2Vzc2VzIHBvdGVudGlhbCBjb250YWN0IGNhbGxiYWNrcyBpZiBhbnkgd2VyZSBzZXQgdXApXG4gICAgaWYgKGdhbWUuY2Fubm9uV29ybGQpIHtcbiAgICAgICAgLy8gVXNlIGEgZml4ZWQgdGltZSBzdGVwIGZvciBwaHlzaWNzIHNpbXVsYXRpb24gZm9yIHN0YWJpbGl0eVxuICAgICAgICBjb25zdCBmaXhlZFRpbWVTdGVwID0gMSAvIDYwOyAvLyA2MCBIelxuICAgICAgICBnYW1lLmNhbm5vbldvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCAzKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbmRlcigpOiB2b2lkIHtcbiAgICBpZiAoZ2FtZS5yZW5kZXJlciAmJiBnYW1lLnNjZW5lICYmIGdhbWUuY2FtZXJhKSB7XG4gICAgICAgIGdhbWUucmVuZGVyZXIucmVuZGVyKGdhbWUuc2NlbmUsIGdhbWUuY2FtZXJhKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdhbWVMb29wKGN1cnJlbnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcbiAgICAvLyBDb252ZXJ0IGRlbHRhVGltZSB0byBzZWNvbmRzIGZvciBjb25zaXN0ZW5jeSB3aXRoIENhbm5vbi5qcyBzdGVwXG4gICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gZ2FtZS5sYXN0VXBkYXRlVGltZSkgLyAxMDAwOyBcbiAgICBnYW1lLmxhc3RVcGRhdGVUaW1lID0gY3VycmVudFRpbWU7XG5cbiAgICAvLyBPcmJpdENvbnRyb2xzIFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOFxuICAgIGlmIChnYW1lLmNvbnRyb2xzKSB7XG4gICAgICAgIGdhbWUuY29udHJvbHMudXBkYXRlKCk7XG4gICAgfVxuXG4gICAgdXBkYXRlKGRlbHRhVGltZSk7XG4gICAgcmVuZGVyKCk7XG5cbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xufVxuXG4vLyAtLS0gTWFpbiBFbnRyeSBQb2ludCAtLS1cbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBhc3luYyAoKSA9PiB7XG4gICAgZ2FtZS5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xuICAgIGlmICghZ2FtZS5jYW52YXMpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZC5cIik7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBhd2FpdCBsb2FkR2FtZURhdGEoKTtcbiAgICBpZiAoIWdhbWUuZGF0YSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc2V0dXBVSSgpOyAvLyBTZXQgdXAgVUkgZWxlbWVudHNcblxuICAgIGF3YWl0IHByZWxvYWRBc3NldHMoKTtcbiAgICBjcmVhdGVHYW1lV29ybGQoKTtcblxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgaGFuZGxlSW5wdXQpO1xuXG4gICAgLy8gSW5pdGlhbCByZW5kZXIgb2YgdGhlIHRpdGxlIHNjcmVlblxuICAgIGdhbWUuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4pIGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuICAgIGlmIChnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5KSBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbikgZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cbiAgICBnYW1lLmxhc3RVcGRhdGVUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7IC8vIEluaXRpYWxpemUgbGFzdFVwZGF0ZVRpbWVcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xufSk7Il0sCiAgIm1hcHBpbmdzIjogIkFBQUEsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQUN4QixTQUFTLHFCQUFxQjtBQWdDOUIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSEMsU0FBQUE7QUFBQSxHQUFBO0FBTUwsTUFBTSxPQXlCRjtBQUFBLEVBQ0EsTUFBTTtBQUFBLEVBQ04sUUFBUSxFQUFFLFVBQVUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxFQUFFO0FBQUEsRUFDbkMsUUFBUTtBQUFBLEVBQ1IsVUFBVTtBQUFBLEVBQ1YsT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsVUFBVTtBQUFBO0FBQUEsRUFDVixhQUFhO0FBQUEsRUFDYixPQUFPLENBQUM7QUFBQSxFQUNSLE1BQU0sRUFBRSxNQUFNLE1BQU0sTUFBTSxLQUFLO0FBQUEsRUFDL0IsV0FBVyxJQUFJLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztBQUFBO0FBQUEsRUFDcEMsZUFBZSxJQUFJLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztBQUFBLEVBQ3hDLE9BQU87QUFBQSxFQUNQLFdBQVc7QUFBQSxFQUNYLGdCQUFnQjtBQUFBLEVBQ2hCLG1CQUFtQjtBQUFBLEVBQ25CLGNBQWM7QUFBQTtBQUFBLEVBQ2QsWUFBWTtBQUFBLElBQ1IsYUFBYTtBQUFBLElBQ2IsY0FBYztBQUFBLElBQ2QsZ0JBQWdCO0FBQUEsRUFDcEI7QUFB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
