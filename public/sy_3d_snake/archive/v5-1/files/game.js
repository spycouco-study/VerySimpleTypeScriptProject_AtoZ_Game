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
      console.warn(
        `Texture '${name}' not found in data.json. Using a placeholder.`
      );
      game.assets.textures[name] = new THREE.Color(8947848);
    }
  }
  for (const img of game.data.assets.images) {
    texturePromises.push(
      new Promise((resolve) => {
        textureLoader.load(
          img.path,
          (texture) => {
            game.assets.textures[img.name] = texture;
            resolve();
          },
          void 0,
          (error) => {
            console.error(
              `Error loading texture ${img.name} from ${img.path}:`,
              error
            );
            game.assets.textures[img.name] = new THREE.Color(8947848);
            resolve();
          }
        );
      })
    );
  }
  const requiredSounds = ["eat_food", "game_over", "bgm", "start_game"];
  for (const name of requiredSounds) {
    if (!game.data.assets.sounds.some((s) => s.name === name)) {
      console.warn(`Sound '${name}' not found in data.json. Will not play.`);
    }
  }
  for (const sound of game.data.assets.sounds) {
    audioPromises.push(
      new Promise((resolve) => {
        const audio = new Audio(sound.path);
        audio.volume = sound.volume;
        audio.load();
        audio.oncanplaythrough = () => {
          game.assets.sounds[sound.name] = audio;
          resolve();
        };
        audio.onerror = (e) => {
          console.error(
            `Error loading sound ${sound.name} from ${sound.path}:`,
            e
          );
          resolve();
        };
      })
    );
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
  game.renderer = new THREE.WebGLRenderer({
    canvas: game.canvas,
    antialias: true
  });
  game.renderer.setSize(game.data.canvasWidth, game.data.canvasHeight);
  game.renderer.shadowMap.enabled = true;
  game.controls = new OrbitControls(game.camera, game.renderer.domElement);
  game.controls.enableDamping = true;
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
  directionalLight.position.set(
    game.data.lightPosition.x,
    game.data.lightPosition.y,
    game.data.lightPosition.z
  );
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
  const wallMaterial = new THREE.MeshLambertMaterial({
    map: wallTexture instanceof THREE.Texture ? wallTexture : void 0,
    color: wallTexture instanceof THREE.Color ? wallTexture : void 0
  });
  createWall(
    0,
    0,
    -halfWorldSize - wallThickness / 2,
    worldSize + wallThickness * 2,
    wallHeight,
    wallThickness,
    wallMaterial,
    "wall_z_neg"
  );
  createWall(
    0,
    0,
    halfWorldSize + wallThickness / 2,
    worldSize + wallThickness * 2,
    wallHeight,
    wallThickness,
    wallMaterial,
    "wall_z_pos"
  );
  createWall(
    -halfWorldSize - wallThickness / 2,
    0,
    0,
    wallThickness,
    wallHeight,
    worldSize + wallThickness * 2,
    wallMaterial,
    "wall_x_neg"
  );
  createWall(
    halfWorldSize + wallThickness / 2,
    0,
    0,
    wallThickness,
    wallHeight,
    worldSize + wallThickness * 2,
    wallMaterial,
    "wall_x_pos"
  );
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
  const wallShape = new CANNON.Box(
    new CANNON.Vec3(width / 2, height / 2, depth / 2)
  );
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
  const material = new THREE.MeshLambertMaterial({
    map: texture instanceof THREE.Texture ? texture : void 0,
    color: texture instanceof THREE.Color ? texture : void 0
  });
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
  const material = new THREE.MeshLambertMaterial({
    map: texture instanceof THREE.Texture ? texture : void 0,
    color: texture instanceof THREE.Color ? texture : void 0
  });
  const geometry = new THREE.SphereGeometry(size / 2, 16, 16);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(foodPosition);
  mesh.castShadow = true;
  game.scene.add(mesh);
  game.food.mesh = mesh;
  const shape = new CANNON.Sphere(size / 2);
  const body = new CANNON.Body({ mass: 0.1 });
  body.addShape(shape);
  body.position.copy(
    new CANNON.Vec3(foodPosition.x, foodPosition.y, foodPosition.z)
  );
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
  if (game.uiElements.titleScreen)
    game.uiElements.titleScreen.style.display = "none";
  if (game.uiElements.gameOverScreen)
    game.uiElements.gameOverScreen.style.display = "none";
  if (game.uiElements.scoreDisplay)
    game.uiElements.scoreDisplay.style.display = "block";
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
  if (game.uiElements.scoreDisplay)
    game.uiElements.scoreDisplay.style.display = "none";
  if (game.uiElements.gameOverScreen)
    game.uiElements.gameOverScreen.style.display = "flex";
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
      game.snake[i].body.position.copy(
        new CANNON.Vec3(
          game.snake[i - 1].mesh.position.x,
          game.snake[i - 1].mesh.position.y,
          game.snake[i - 1].mesh.position.z
        )
      );
    }
    head.mesh.position.copy(newHeadPosition);
    head.body.position.copy(
      new CANNON.Vec3(newHeadPosition.x, newHeadPosition.y, newHeadPosition.z)
    );
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
  if (game.uiElements.titleScreen)
    game.uiElements.titleScreen.style.display = "flex";
  if (game.uiElements.scoreDisplay)
    game.uiElements.scoreDisplay.style.display = "none";
  if (game.uiElements.gameOverScreen)
    game.uiElements.gameOverScreen.style.display = "none";
  game.lastUpdateTime = performance.now();
  requestAnimationFrame(gameLoop);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSBcInRocmVlXCI7XG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSBcImNhbm5vbi1lc1wiO1xuaW1wb3J0IHsgT3JiaXRDb250cm9scyB9IGZyb20gXCJ0aHJlZS9leGFtcGxlcy9qc20vY29udHJvbHMvT3JiaXRDb250cm9scy5qc1wiO1xuXG4vLyAtLS0gR2xvYmFsIEdhbWUgU3RhdGUgYW5kIENvbmZpZ3VyYXRpb24gLS0tXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XG4gIGNhbnZhc1dpZHRoOiBudW1iZXI7XG4gIGNhbnZhc0hlaWdodDogbnVtYmVyO1xuICBncmlkU2l6ZTogbnVtYmVyOyAvLyBTaXplIG9mIGVhY2ggZ3JpZCBjZWxsIGluIHdvcmxkIHVuaXRzXG4gIHNuYWtlU3BlZWQ6IG51bWJlcjsgLy8gSG93IG1hbnkgZ3JpZCBjZWxscyBwZXIgc2Vjb25kIHRoZSBzbmFrZSBtb3Zlc1xuICBpbml0aWFsU25ha2VMZW5ndGg6IG51bWJlcjtcbiAgd2FsbFRoaWNrbmVzczogbnVtYmVyOyAvLyBUaGlja25lc3Mgb2YgdGhlIHdhbGxzIGluIHdvcmxkIHVuaXRzXG4gIGNhbWVyYUZPVjogbnVtYmVyO1xuICBjYW1lcmFOZWFyOiBudW1iZXI7XG4gIGNhbWVyYUZhcjogbnVtYmVyO1xuICBjYW1lcmFQb3NpdGlvbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGxpZ2h0UG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBjb2xvcnM6IHtcbiAgICBiYWNrZ3JvdW5kOiBudW1iZXI7XG4gICAgdGl0bGVUZXh0OiBzdHJpbmc7XG4gICAgc2NvcmVUZXh0OiBzdHJpbmc7XG4gICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XG4gIH07XG4gIGFzc2V0czoge1xuICAgIGltYWdlczogQXJyYXk8e1xuICAgICAgbmFtZTogc3RyaW5nO1xuICAgICAgcGF0aDogc3RyaW5nO1xuICAgICAgd2lkdGg6IG51bWJlcjtcbiAgICAgIGhlaWdodDogbnVtYmVyO1xuICAgIH0+O1xuICAgIHNvdW5kczogQXJyYXk8e1xuICAgICAgbmFtZTogc3RyaW5nO1xuICAgICAgcGF0aDogc3RyaW5nO1xuICAgICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xuICAgICAgdm9sdW1lOiBudW1iZXI7XG4gICAgfT47XG4gIH07XG59XG5cbmludGVyZmFjZSBMb2FkZWRBc3NldHMge1xuICB0ZXh0dXJlczogeyBba2V5OiBzdHJpbmddOiBUSFJFRS5UZXh0dXJlIHwgVEhSRUUuQ29sb3IgfTtcbiAgc291bmRzOiB7IFtrZXk6IHN0cmluZ106IEhUTUxBdWRpb0VsZW1lbnQgfTtcbn1cblxuZW51bSBHYW1lU3RhdGUge1xuICBUSVRMRSxcbiAgUExBWUlORyxcbiAgR0FNRV9PVkVSLFxufVxuXG5jb25zdCBnYW1lOiB7XG4gIGRhdGE6IEdhbWVDb25maWcgfCBudWxsO1xuICBhc3NldHM6IExvYWRlZEFzc2V0cztcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gIHJlbmRlcmVyOiBUSFJFRS5XZWJHTFJlbmRlcmVyIHwgbnVsbDtcbiAgc2NlbmU6IFRIUkVFLlNjZW5lIHwgbnVsbDtcbiAgY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSB8IG51bGw7XG4gIGNvbnRyb2xzOiBPcmJpdENvbnRyb2xzIHwgbnVsbDsgLy8gT3JiaXRDb250cm9scyBcdUNEOTRcdUFDMDBcbiAgY2Fubm9uV29ybGQ6IENBTk5PTi5Xb3JsZCB8IG51bGw7XG4gIHNuYWtlOiB7IG1lc2g6IFRIUkVFLk1lc2g7IGJvZHk6IENBTk5PTi5Cb2R5IH1bXTtcbiAgZm9vZDogeyBtZXNoOiBUSFJFRS5NZXNoIHwgbnVsbDsgYm9keTogQ0FOTk9OLkJvZHkgfCBudWxsIH07XG4gIGRpcmVjdGlvbjogVEhSRUUuVmVjdG9yMztcbiAgbmV4dERpcmVjdGlvbjogVEhSRUUuVmVjdG9yMztcbiAgc2NvcmU6IG51bWJlcjtcbiAgZ2FtZVN0YXRlOiBHYW1lU3RhdGU7XG4gIGxhc3RVcGRhdGVUaW1lOiBudW1iZXI7XG4gIHRpbWVTaW5jZUxhc3RNb3ZlOiBudW1iZXI7XG4gIG1vdmVJbnRlcnZhbDogbnVtYmVyOyAvLyBUaW1lIGluIG1zIGJldHdlZW4gc25ha2UgbW92ZXNcbiAgdWlFbGVtZW50czoge1xuICAgIHRpdGxlU2NyZWVuOiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XG4gICAgc2NvcmVEaXNwbGF5OiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XG4gICAgZ2FtZU92ZXJTY3JlZW46IEhUTUxEaXZFbGVtZW50IHwgbnVsbDtcbiAgfTtcbiAgYmdtOiBIVE1MQXVkaW9FbGVtZW50IHwgbnVsbDtcbiAgd2FsbEJvZGllczogQ0FOTk9OLkJvZHlbXTsgLy8gVG8gaG9sZCByZWZlcmVuY2VzIHRvIGNhbm5vbiB3YWxsIGJvZGllc1xufSA9IHtcbiAgZGF0YTogbnVsbCxcbiAgYXNzZXRzOiB7IHRleHR1cmVzOiB7fSwgc291bmRzOiB7fSB9LFxuICBjYW52YXM6IG51bGwsXG4gIHJlbmRlcmVyOiBudWxsLFxuICBzY2VuZTogbnVsbCxcbiAgY2FtZXJhOiBudWxsLFxuICBjb250cm9sczogbnVsbCwgLy8gXHVDRDA4XHVBRTMwXHVENjU0XG4gIGNhbm5vbldvcmxkOiBudWxsLFxuICBzbmFrZTogW10sXG4gIGZvb2Q6IHsgbWVzaDogbnVsbCwgYm9keTogbnVsbCB9LFxuICBkaXJlY3Rpb246IG5ldyBUSFJFRS5WZWN0b3IzKDEsIDAsIDApLCAvLyBJbml0aWFsIGRpcmVjdGlvbjogRWFzdCAocG9zaXRpdmUgWClcbiAgbmV4dERpcmVjdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoMSwgMCwgMCksXG4gIHNjb3JlOiAwLFxuICBnYW1lU3RhdGU6IEdhbWVTdGF0ZS5USVRMRSxcbiAgbGFzdFVwZGF0ZVRpbWU6IDAsXG4gIHRpbWVTaW5jZUxhc3RNb3ZlOiAwLFxuICBtb3ZlSW50ZXJ2YWw6IDAsIC8vIFdpbGwgYmUgY2FsY3VsYXRlZCBmcm9tIHNuYWtlU3BlZWRcbiAgdWlFbGVtZW50czoge1xuICAgIHRpdGxlU2NyZWVuOiBudWxsLFxuICAgIHNjb3JlRGlzcGxheTogbnVsbCxcbiAgICBnYW1lT3ZlclNjcmVlbjogbnVsbCxcbiAgfSxcbiAgYmdtOiBudWxsLFxuICB3YWxsQm9kaWVzOiBbXSxcbn07XG5cbi8vIC0tLSBHYW1lIEluaXRpYWxpemF0aW9uIC0tLVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChcImRhdGEuanNvblwiKTtcbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGRhdGEuanNvbjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgIH1cbiAgICBnYW1lLmRhdGEgPSAoYXdhaXQgcmVzcG9uc2UuanNvbigpKSBhcyBHYW1lQ29uZmlnO1xuICAgIGNvbnNvbGUubG9nKFwiR2FtZSBkYXRhIGxvYWRlZDpcIiwgZ2FtZS5kYXRhKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBnYW1lIGRhdGE6XCIsIGVycm9yKTtcbiAgICBhbGVydChcIkZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gUGxlYXNlIGNoZWNrIGRhdGEuanNvbi5cIik7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcHJlbG9hZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKCFnYW1lLmRhdGEpIHJldHVybjtcblxuICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcbiAgY29uc3QgYXVkaW9Qcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG4gIGNvbnN0IHRleHR1cmVQcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cbiAgLy8gQWRkIHBsYWNlaG9sZGVyIHRleHR1cmVzIGlmIGFjdHVhbCBhc3NldHMgYXJlIG5vdCBmb3VuZCBpbiBkYXRhLmpzb25cbiAgLy8gVGhpcyBhbGxvd3MgdGhlIGdhbWUgdG8gcnVuIGV2ZW4gaWYgc29tZSBhc3NldHMgYXJlIG1pc3NpbmcuXG4gIC8vIEVuc3VyZSBhbGwgY3JpdGljYWwgdGV4dHVyZSBuYW1lcyBhcmUgcHJlc2VudCBpbiBhc3NldHMudGV4dHVyZXNcbiAgY29uc3QgcmVxdWlyZWRUZXh0dXJlcyA9IFtcInNuYWtlX2hlYWRcIiwgXCJzbmFrZV9ib2R5XCIsIFwiZm9vZFwiLCBcIndhbGxfdGV4dHVyZVwiXTtcbiAgZm9yIChjb25zdCBuYW1lIG9mIHJlcXVpcmVkVGV4dHVyZXMpIHtcbiAgICBpZiAoIWdhbWUuZGF0YS5hc3NldHMuaW1hZ2VzLnNvbWUoKGltZykgPT4gaW1nLm5hbWUgPT09IG5hbWUpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBUZXh0dXJlICcke25hbWV9JyBub3QgZm91bmQgaW4gZGF0YS5qc29uLiBVc2luZyBhIHBsYWNlaG9sZGVyLmBcbiAgICAgICk7XG4gICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tuYW1lXSA9IG5ldyBUSFJFRS5Db2xvcigweDg4ODg4OCk7IC8vIERlZmF1bHQgY29sb3JcbiAgICB9XG4gIH1cblxuICBmb3IgKGNvbnN0IGltZyBvZiBnYW1lLmRhdGEuYXNzZXRzLmltYWdlcykge1xuICAgIHRleHR1cmVQcm9taXNlcy5wdXNoKFxuICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgLy8gQ2hhbmdlZCB0byByZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIGdhbWVcbiAgICAgICAgdGV4dHVyZUxvYWRlci5sb2FkKFxuICAgICAgICAgIGltZy5wYXRoLFxuICAgICAgICAgICh0ZXh0dXJlKSA9PiB7XG4gICAgICAgICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tpbWcubmFtZV0gPSB0ZXh0dXJlO1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIChlcnJvcikgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgICAgYEVycm9yIGxvYWRpbmcgdGV4dHVyZSAke2ltZy5uYW1lfSBmcm9tICR7aW1nLnBhdGh9OmAsXG4gICAgICAgICAgICAgIGVycm9yXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgZ2FtZS5hc3NldHMudGV4dHVyZXNbaW1nLm5hbWVdID0gbmV3IFRIUkVFLkNvbG9yKDB4ODg4ODg4KTsgLy8gRmFsbGJhY2sgdG8gY29sb3JcbiAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIGFsbG93IGdhbWUgdG8gY29udGludWVcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICAvLyBFbnN1cmUgYWxsIGNyaXRpY2FsIHNvdW5kIG5hbWVzIGFyZSBwcmVzZW50IGluIGFzc2V0cy5zb3VuZHNcbiAgY29uc3QgcmVxdWlyZWRTb3VuZHMgPSBbXCJlYXRfZm9vZFwiLCBcImdhbWVfb3ZlclwiLCBcImJnbVwiLCBcInN0YXJ0X2dhbWVcIl07XG4gIGZvciAoY29uc3QgbmFtZSBvZiByZXF1aXJlZFNvdW5kcykge1xuICAgIGlmICghZ2FtZS5kYXRhLmFzc2V0cy5zb3VuZHMuc29tZSgocykgPT4gcy5uYW1lID09PSBuYW1lKSkge1xuICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtuYW1lfScgbm90IGZvdW5kIGluIGRhdGEuanNvbi4gV2lsbCBub3QgcGxheS5gKTtcbiAgICAgIC8vIE5vIGRlZmF1bHQgc291bmQsIGp1c3Qgd29uJ3QgYmUgaW4gZ2FtZS5hc3NldHMuc291bmRzXG4gICAgfVxuICB9XG5cbiAgZm9yIChjb25zdCBzb3VuZCBvZiBnYW1lLmRhdGEuYXNzZXRzLnNvdW5kcykge1xuICAgIGF1ZGlvUHJvbWlzZXMucHVzaChcbiAgICAgIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIC8vIENoYW5nZWQgdG8gcmVzb2x2ZSBldmVuIG9uIGVycm9yXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kLnBhdGgpO1xuICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XG4gICAgICAgIGF1ZGlvLmxvYWQoKTsgLy8gUHJlbG9hZCB0aGUgYXVkaW9cbiAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcbiAgICAgICAgICBnYW1lLmFzc2V0cy5zb3VuZHNbc291bmQubmFtZV0gPSBhdWRpbztcbiAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH07XG4gICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICBgRXJyb3IgbG9hZGluZyBzb3VuZCAke3NvdW5kLm5hbWV9IGZyb20gJHtzb3VuZC5wYXRofTpgLFxuICAgICAgICAgICAgZVxuICAgICAgICAgICk7XG4gICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gYWxsb3cgZ2FtZSB0byBjb250aW51ZVxuICAgICAgICB9O1xuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4udGV4dHVyZVByb21pc2VzLCAuLi5hdWRpb1Byb21pc2VzXSk7XG4gICAgY29uc29sZS5sb2coXCJBbGwgYXNzZXRzIHByZWxvYWRlZCAob3IgZmFsbGVuIGJhY2sgdG8gcGxhY2Vob2xkZXJzKS5cIik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcIlVuZXhwZWN0ZWQgZXJyb3IgZHVyaW5nIGFzc2V0IHByZWxvYWRpbmc6XCIsIGVycm9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXR1cFVJKCk6IHZvaWQge1xuICBpZiAoIWdhbWUuZGF0YSB8fCAhZ2FtZS5jYW52YXMpIHJldHVybjtcblxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuYm9keTtcbiAgYm9keS5zdHlsZS5tYXJnaW4gPSBcIjBcIjtcbiAgYm9keS5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgLy8gVGl0bGUgU2NyZWVuXG4gIGNvbnN0IHRpdGxlU2NyZWVuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVTY3JlZW4uaWQgPSBcInRpdGxlU2NyZWVuXCI7XG4gIE9iamVjdC5hc3NpZ24odGl0bGVTY3JlZW4uc3R5bGUsIHtcbiAgICBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiLFxuICAgIHRvcDogXCIwXCIsXG4gICAgbGVmdDogXCIwXCIsXG4gICAgd2lkdGg6IFwiMTAwJVwiLFxuICAgIGhlaWdodDogXCIxMDAlXCIsXG4gICAgYmFja2dyb3VuZENvbG9yOiBgcmdiYSgwLCAwLCAwLCAwLjcpYCxcbiAgICBjb2xvcjogZ2FtZS5kYXRhLmNvbG9ycy50aXRsZVRleHQsXG4gICAgZm9udEZhbWlseTogXCJBcmlhbCwgc2Fucy1zZXJpZlwiLFxuICAgIGRpc3BsYXk6IFwiZmxleFwiLFxuICAgIGZsZXhEaXJlY3Rpb246IFwiY29sdW1uXCIsXG4gICAganVzdGlmeUNvbnRlbnQ6IFwiY2VudGVyXCIsXG4gICAgYWxpZ25JdGVtczogXCJjZW50ZXJcIixcbiAgICB6SW5kZXg6IFwiMTAwXCIsXG4gICAgZm9udFNpemU6IFwiNDhweFwiLFxuICAgIHRleHRBbGlnbjogXCJjZW50ZXJcIixcbiAgfSk7XG4gIHRpdGxlU2NyZWVuLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGgxPjNEIFx1QkM0MCBcdUFDOUM8L2gxPlxuICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMjRweDtcIj5QcmVzcyBTUEFDRSB0byBTdGFydDwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDE4cHg7XCI+VXNlIEFycm93IEtleXMgdG8gTW92ZTwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDE4cHg7XCI+VXNlIE1vdXNlIHRvIFJvdGF0ZSBDYW1lcmE8L3A+IDwhLS0gXHVCOUM4XHVDNkIwXHVDMkE0IFx1QzEyNFx1QkE4NSBcdUNEOTRcdUFDMDAgLS0+XG4gICAgYDtcbiAgYm9keS5hcHBlbmRDaGlsZCh0aXRsZVNjcmVlbik7XG4gIGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbiA9IHRpdGxlU2NyZWVuO1xuXG4gIC8vIFNjb3JlIERpc3BsYXlcbiAgY29uc3Qgc2NvcmVEaXNwbGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc2NvcmVEaXNwbGF5LmlkID0gXCJzY29yZURpc3BsYXlcIjtcbiAgT2JqZWN0LmFzc2lnbihzY29yZURpc3BsYXkuc3R5bGUsIHtcbiAgICBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiLFxuICAgIHRvcDogXCIxMHB4XCIsXG4gICAgbGVmdDogXCIxMHB4XCIsXG4gICAgY29sb3I6IGdhbWUuZGF0YS5jb2xvcnMuc2NvcmVUZXh0LFxuICAgIGZvbnRGYW1pbHk6IFwiQXJpYWwsIHNhbnMtc2VyaWZcIixcbiAgICBmb250U2l6ZTogXCIyNHB4XCIsXG4gICAgekluZGV4OiBcIjEwMVwiLFxuICAgIGRpc3BsYXk6IFwibm9uZVwiLCAvLyBIaWRkZW4gaW5pdGlhbGx5XG4gIH0pO1xuICBzY29yZURpc3BsYXkuaW5uZXJUZXh0ID0gYFNjb3JlOiAwYDtcbiAgYm9keS5hcHBlbmRDaGlsZChzY29yZURpc3BsYXkpO1xuICBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5ID0gc2NvcmVEaXNwbGF5O1xuXG4gIC8vIEdhbWUgT3ZlciBTY3JlZW5cbiAgY29uc3QgZ2FtZU92ZXJTY3JlZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBnYW1lT3ZlclNjcmVlbi5pZCA9IFwiZ2FtZU92ZXJTY3JlZW5cIjtcbiAgT2JqZWN0LmFzc2lnbihnYW1lT3ZlclNjcmVlbi5zdHlsZSwge1xuICAgIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXG4gICAgdG9wOiBcIjBcIixcbiAgICBsZWZ0OiBcIjBcIixcbiAgICB3aWR0aDogXCIxMDAlXCIsXG4gICAgaGVpZ2h0OiBcIjEwMCVcIixcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IGByZ2JhKDAsIDAsIDAsIDAuNylgLFxuICAgIGNvbG9yOiBnYW1lLmRhdGEuY29sb3JzLmdhbWVPdmVyVGV4dCxcbiAgICBmb250RmFtaWx5OiBcIkFyaWFsLCBzYW5zLXNlcmlmXCIsXG4gICAgZGlzcGxheTogXCJub25lXCIsIC8vIEhpZGRlbiBpbml0aWFsbHlcbiAgICBmbGV4RGlyZWN0aW9uOiBcImNvbHVtblwiLFxuICAgIGp1c3RpZnlDb250ZW50OiBcImNlbnRlclwiLFxuICAgIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsXG4gICAgekluZGV4OiBcIjEwMlwiLFxuICAgIGZvbnRTaXplOiBcIjQ4cHhcIixcbiAgICB0ZXh0QWxpZ246IFwiY2VudGVyXCIsXG4gIH0pO1xuICBnYW1lT3ZlclNjcmVlbi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxoMT5HQU1FIE9WRVIhPC9oMT5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDM2cHg7XCIgaWQ9XCJmaW5hbFNjb3JlXCI+U2NvcmU6IDA8L3A+XG4gICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAyNHB4O1wiPlByZXNzIFNQQUNFIHRvIFJlc3RhcnQ8L3A+XG4gICAgYDtcbiAgYm9keS5hcHBlbmRDaGlsZChnYW1lT3ZlclNjcmVlbik7XG4gIGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbiA9IGdhbWVPdmVyU2NyZWVuO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVHYW1lV29ybGQoKTogdm9pZCB7XG4gIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLmNhbnZhcykgcmV0dXJuO1xuXG4gIC8vIFRocmVlLmpzIHNldHVwXG4gIGdhbWUuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgZ2FtZS5zY2VuZS5iYWNrZ3JvdW5kID0gbmV3IFRIUkVFLkNvbG9yKGdhbWUuZGF0YS5jb2xvcnMuYmFja2dyb3VuZCk7XG5cbiAgZ2FtZS5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoXG4gICAgZ2FtZS5kYXRhLmNhbWVyYUZPVixcbiAgICBnYW1lLmRhdGEuY2FudmFzV2lkdGggLyBnYW1lLmRhdGEuY2FudmFzSGVpZ2h0LFxuICAgIGdhbWUuZGF0YS5jYW1lcmFOZWFyLFxuICAgIGdhbWUuZGF0YS5jYW1lcmFGYXJcbiAgKTtcbiAgZ2FtZS5jYW1lcmEucG9zaXRpb24uc2V0KFxuICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi54LFxuICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi55LFxuICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi56XG4gICk7XG4gIC8vIGdhbWUuY2FtZXJhLmxvb2tBdCgwLCAwLCAwKTsgLy8gT3JiaXRDb250cm9sc1x1QUMwMCBcdUNFNzRcdUJBNTRcdUI3N0MgXHVCQzI5XHVENUE1XHVDNzQ0IFx1QzgxQ1x1QzVCNFx1RDU1OFx1QkJDMFx1Qjg1QyBcdUM4RkNcdUMxMUQgXHVDQzk4XHVCOUFDXG5cbiAgZ2FtZS5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHtcbiAgICBjYW52YXM6IGdhbWUuY2FudmFzLFxuICAgIGFudGlhbGlhczogdHJ1ZSxcbiAgfSk7XG4gIGdhbWUucmVuZGVyZXIuc2V0U2l6ZShnYW1lLmRhdGEuY2FudmFzV2lkdGgsIGdhbWUuZGF0YS5jYW52YXNIZWlnaHQpO1xuICBnYW1lLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgaWYgZGVzaXJlZFxuXG4gIC8vIE9yYml0Q29udHJvbHMgXHVDMTI0XHVDODE1XG4gIGdhbWUuY29udHJvbHMgPSBuZXcgT3JiaXRDb250cm9scyhnYW1lLmNhbWVyYSwgZ2FtZS5yZW5kZXJlci5kb21FbGVtZW50KTtcbiAgZ2FtZS5jb250cm9scy5lbmFibGVEYW1waW5nID0gdHJ1ZTsgLy8gXHVDRTc0XHVCQTU0XHVCNzdDIFx1QzZDMFx1QzlDMVx1Qzc4NFx1Qzc0NCBcdUJEODBcdUI0RENcdUI3RkRcdUFDOEMgKFx1QzYyNFx1RDBDMCBcdUMyMThcdUM4MTU6IGVuYWJsZUREYW1waW5nIC0+IGVuYWJsZURhbXBpbmcpXG4gIGdhbWUuY29udHJvbHMuZGFtcGluZ0ZhY3RvciA9IDAuMDU7XG4gIGdhbWUuY29udHJvbHMuc2NyZWVuU3BhY2VQYW5uaW5nID0gZmFsc2U7IC8vIFx1RDMyQyBcdUFFMzBcdUIyQTUgXHVDMkRDIFx1Q0U3NFx1QkE1NFx1Qjc3Q1x1QUMwMCBcdUJDMTRcdUIyRTVcdUM3NDQgXHVCNkFCXHVBQ0UwIFx1QjBCNFx1QjgyNFx1QUMwMFx1QzlDMCBcdUM1NEFcdUIzQzRcdUI4NURcbiAgZ2FtZS5jb250cm9scy5taW5EaXN0YW5jZSA9IDU7IC8vIFx1Q0Q1Q1x1QzE4QyBcdUM5MEMgXHVDNTQ0XHVDNkMzIFx1QUM3MFx1QjlBQ1xuICBnYW1lLmNvbnRyb2xzLm1heERpc3RhbmNlID0gNTA7IC8vIFx1Q0Q1Q1x1QjMwMCBcdUM5MEMgXHVDNzc4IFx1QUM3MFx1QjlBQ1xuICBnYW1lLmNvbnRyb2xzLnRhcmdldC5zZXQoMCwgMCwgMCk7IC8vIFx1Q0U3NFx1QkE1NFx1Qjc3Q1x1QUMwMCBcdUFDOENcdUM3ODQgXHVDMTM4XHVBQ0M0XHVDNzU4IFx1QzkxMVx1QzU1OVx1Qzc0NCBcdUJDMTRcdUI3N0NcdUJDRjRcdUIzQzRcdUI4NUQgXHVDMTI0XHVDODE1XG4gIGdhbWUuY29udHJvbHMuZW5hYmxlZCA9IGZhbHNlOyAvLyBcdUFDOENcdUM3ODQgXHVDMkRDXHVDNzkxIFx1QzgwNFx1QzVEMFx1QjI5NCBcdUNFRThcdUQyQjhcdUI4NjQgXHVCRTQ0XHVENjVDXHVDMTMxXHVENjU0XG4gIGdhbWUuY29udHJvbHMudXBkYXRlKCk7IC8vIFx1Q0QwOFx1QUUzMCBcdUMxMjRcdUM4MTUgXHVDODAxXHVDNkE5XG5cbiAgLy8gTGlnaHRzXG4gIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDApOyAvLyBzb2Z0IHdoaXRlIGxpZ2h0XG4gIGdhbWUuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XG4gIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMSk7XG4gIGRpcmVjdGlvbmFsTGlnaHQucG9zaXRpb24uc2V0KFxuICAgIGdhbWUuZGF0YS5saWdodFBvc2l0aW9uLngsXG4gICAgZ2FtZS5kYXRhLmxpZ2h0UG9zaXRpb24ueSxcbiAgICBnYW1lLmRhdGEubGlnaHRQb3NpdGlvbi56XG4gICk7XG4gIGRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7XG4gIGdhbWUuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xuXG4gIC8vIENhbm5vbi5qcyBzZXR1cFxuICBnYW1lLmNhbm5vbldvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xuICBnYW1lLmNhbm5vbldvcmxkLmdyYXZpdHkuc2V0KDAsIDAsIDApOyAvLyBObyBncmF2aXR5IGZvciBhIHNuYWtlIGdhbWVcbiAgZ2FtZS5jYW5ub25Xb3JsZC5kZWZhdWx0Q29udGFjdE1hdGVyaWFsLmZyaWN0aW9uID0gMDtcbiAgZ2FtZS5jYW5ub25Xb3JsZC5kZWZhdWx0Q29udGFjdE1hdGVyaWFsLnJlc3RpdHV0aW9uID0gMDtcblxuICAvLyBDcmVhdGUgd2FsbHMgKGJvdW5kYXJpZXMpXG4gIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwOyAvLyBBc3N1bWluZyBhIDIweDIwIHBsYXlhYmxlIGdyaWRcbiAgY29uc3QgaGFsZldvcmxkU2l6ZSA9IHdvcmxkU2l6ZSAvIDI7XG4gIGNvbnN0IHdhbGxUaGlja25lc3MgPSBnYW1lLmRhdGEud2FsbFRoaWNrbmVzcztcbiAgY29uc3Qgd2FsbEhlaWdodCA9IGdhbWUuZGF0YS5ncmlkU2l6ZTsgLy8gV2FsbHMgYXJlIGFzIHRhbGwgYXMgYSBzbmFrZSBzZWdtZW50XG5cbiAgLy8gTWF0ZXJpYWwgZm9yIHdhbGxzXG4gIGNvbnN0IHdhbGxUZXh0dXJlID0gZ2FtZS5hc3NldHMudGV4dHVyZXNbXCJ3YWxsX3RleHR1cmVcIl07XG4gIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICBtYXA6IHdhbGxUZXh0dXJlIGluc3RhbmNlb2YgVEhSRUUuVGV4dHVyZSA/IHdhbGxUZXh0dXJlIDogdW5kZWZpbmVkLFxuICAgIGNvbG9yOiB3YWxsVGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gd2FsbFRleHR1cmUgOiB1bmRlZmluZWQsXG4gIH0pO1xuXG4gIC8vIEZyb250IHdhbGwgKCtaKVxuICBjcmVhdGVXYWxsKFxuICAgIDAsXG4gICAgMCxcbiAgICAtaGFsZldvcmxkU2l6ZSAtIHdhbGxUaGlja25lc3MgLyAyLFxuICAgIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLFxuICAgIHdhbGxIZWlnaHQsXG4gICAgd2FsbFRoaWNrbmVzcyxcbiAgICB3YWxsTWF0ZXJpYWwsXG4gICAgXCJ3YWxsX3pfbmVnXCJcbiAgKTtcbiAgLy8gQmFjayB3YWxsICgtWilcbiAgY3JlYXRlV2FsbChcbiAgICAwLFxuICAgIDAsXG4gICAgaGFsZldvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgLyAyLFxuICAgIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLFxuICAgIHdhbGxIZWlnaHQsXG4gICAgd2FsbFRoaWNrbmVzcyxcbiAgICB3YWxsTWF0ZXJpYWwsXG4gICAgXCJ3YWxsX3pfcG9zXCJcbiAgKTtcbiAgLy8gTGVmdCB3YWxsICgtWClcbiAgY3JlYXRlV2FsbChcbiAgICAtaGFsZldvcmxkU2l6ZSAtIHdhbGxUaGlja25lc3MgLyAyLFxuICAgIDAsXG4gICAgMCxcbiAgICB3YWxsVGhpY2tuZXNzLFxuICAgIHdhbGxIZWlnaHQsXG4gICAgd29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAqIDIsXG4gICAgd2FsbE1hdGVyaWFsLFxuICAgIFwid2FsbF94X25lZ1wiXG4gICk7XG4gIC8vIFJpZ2h0IHdhbGwgKCtYKVxuICBjcmVhdGVXYWxsKFxuICAgIGhhbGZXb3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzIC8gMixcbiAgICAwLFxuICAgIDAsXG4gICAgd2FsbFRoaWNrbmVzcyxcbiAgICB3YWxsSGVpZ2h0LFxuICAgIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLFxuICAgIHdhbGxNYXRlcmlhbCxcbiAgICBcIndhbGxfeF9wb3NcIlxuICApO1xuXG4gIC8vIEluaXRpYWwgc2V0dXAgZm9yIHRoZSBnYW1lIHN0YXRlIChiZWZvcmUgc3RhcnRpbmcpXG4gIGdhbWUubW92ZUludGVydmFsID0gMTAwMCAvIGdhbWUuZGF0YS5zbmFrZVNwZWVkO1xuICBnYW1lLmRpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKDEsIDAsIDApO1xuICBnYW1lLm5leHREaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlV2FsbChcbiAgeDogbnVtYmVyLFxuICB5OiBudW1iZXIsXG4gIHo6IG51bWJlcixcbiAgd2lkdGg6IG51bWJlcixcbiAgaGVpZ2h0OiBudW1iZXIsXG4gIGRlcHRoOiBudW1iZXIsXG4gIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCxcbiAgbmFtZTogc3RyaW5nXG4pOiB2b2lkIHtcbiAgaWYgKCFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSByZXR1cm47XG5cbiAgY29uc3Qgd2FsbEdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHdpZHRoLCBoZWlnaHQsIGRlcHRoKTtcbiAgY29uc3Qgd2FsbE1lc2ggPSBuZXcgVEhSRUUuTWVzaCh3YWxsR2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgd2FsbE1lc2gucG9zaXRpb24uc2V0KHgsIHksIHopO1xuICB3YWxsTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgZ2FtZS5zY2VuZS5hZGQod2FsbE1lc2gpO1xuXG4gIGNvbnN0IHdhbGxTaGFwZSA9IG5ldyBDQU5OT04uQm94KFxuICAgIG5ldyBDQU5OT04uVmVjMyh3aWR0aCAvIDIsIGhlaWdodCAvIDIsIGRlcHRoIC8gMilcbiAgKTtcbiAgY29uc3Qgd2FsbEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwIH0pOyAvLyBNYXNzIDAgbWFrZXMgaXQgc3RhdGljXG4gIHdhbGxCb2R5LmFkZFNoYXBlKHdhbGxTaGFwZSk7XG4gIHdhbGxCb2R5LnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcbiAgZ2FtZS5jYW5ub25Xb3JsZC5hZGRCb2R5KHdhbGxCb2R5KTtcbiAgZ2FtZS53YWxsQm9kaWVzLnB1c2god2FsbEJvZHkpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTbmFrZVNlZ21lbnQoXG4gIHBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzLFxuICBpc0hlYWQ6IGJvb2xlYW5cbik6IHsgbWVzaDogVEhSRUUuTWVzaDsgYm9keTogQ0FOTk9OLkJvZHkgfSB7XG4gIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiR2FtZSBub3QgaW5pdGlhbGl6ZWQgZm9yIGNyZWF0aW5nIHNuYWtlIHNlZ21lbnRzLlwiKTtcbiAgfVxuXG4gIGNvbnN0IHNpemUgPSBnYW1lLmRhdGEuZ3JpZFNpemU7XG4gIGNvbnN0IHRleHR1cmUgPSBpc0hlYWRcbiAgICA/IGdhbWUuYXNzZXRzLnRleHR1cmVzW1wic25ha2VfaGVhZFwiXVxuICAgIDogZ2FtZS5hc3NldHMudGV4dHVyZXNbXCJzbmFrZV9ib2R5XCJdO1xuICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICBtYXA6IHRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlID8gdGV4dHVyZSA6IHVuZGVmaW5lZCxcbiAgICBjb2xvcjogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gdGV4dHVyZSA6IHVuZGVmaW5lZCxcbiAgfSk7XG4gIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHNpemUsIHNpemUsIHNpemUpO1xuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgbWVzaC5wb3NpdGlvbi5jb3B5KHBvc2l0aW9uKTtcbiAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgZ2FtZS5zY2VuZS5hZGQobWVzaCk7XG5cbiAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoc2l6ZSAvIDIsIHNpemUgLyAyLCBzaXplIC8gMikpO1xuICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMSB9KTsgLy8gR2l2ZSBpdCBhIG1hc3MsIGJ1dCB3ZSdsbCBjb250cm9sIGl0cyBwb3NpdGlvblxuICBib2R5LmFkZFNoYXBlKHNoYXBlKTtcbiAgYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhwb3NpdGlvbi54LCBwb3NpdGlvbi55LCBwb3NpdGlvbi56KSk7XG4gIGdhbWUuY2Fubm9uV29ybGQuYWRkQm9keShib2R5KTtcblxuICByZXR1cm4geyBtZXNoLCBib2R5IH07XG59XG5cbmZ1bmN0aW9uIGdlbmVyYXRlRm9vZCgpOiB2b2lkIHtcbiAgaWYgKCFnYW1lLmRhdGEgfHwgIWdhbWUuc2NlbmUgfHwgIWdhbWUuY2Fubm9uV29ybGQpIHJldHVybjtcblxuICAvLyBSZW1vdmUgb2xkIGZvb2QgaWYgaXQgZXhpc3RzXG4gIGlmIChnYW1lLmZvb2QubWVzaCkge1xuICAgIGdhbWUuc2NlbmUucmVtb3ZlKGdhbWUuZm9vZC5tZXNoKTtcbiAgICBnYW1lLmZvb2QubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgKGdhbWUuZm9vZC5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XG4gICAgZ2FtZS5mb29kLm1lc2ggPSBudWxsO1xuICB9XG4gIGlmIChnYW1lLmZvb2QuYm9keSkge1xuICAgIGdhbWUuY2Fubm9uV29ybGQucmVtb3ZlQm9keShnYW1lLmZvb2QuYm9keSk7XG4gICAgZ2FtZS5mb29kLmJvZHkgPSBudWxsO1xuICB9XG5cbiAgY29uc3Qgd29ybGRTaXplID0gZ2FtZS5kYXRhLmdyaWRTaXplICogMjA7XG4gIGNvbnN0IGhhbGZXb3JsZFNpemUgPSB3b3JsZFNpemUgLyAyO1xuICBjb25zdCBzaXplID0gZ2FtZS5kYXRhLmdyaWRTaXplO1xuICBsZXQgZm9vZFBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzO1xuICBsZXQgY29sbGlzaW9uV2l0aFNuYWtlOiBib29sZWFuO1xuXG4gIGRvIHtcbiAgICBjb2xsaXNpb25XaXRoU25ha2UgPSBmYWxzZTtcbiAgICAvLyBHZW5lcmF0ZSByYW5kb20gZ3JpZCBwb3NpdGlvbiB3aXRoaW4gYm91bmRzIChleGNsdWRpbmcgd2FsbCB0aGlja25lc3MgYXJlYSlcbiAgICBjb25zdCBudW1DZWxscyA9IDIwOyAvLyBBc3N1bWluZyAyMHgyMCBncmlkXG4gICAgY29uc3QgcmFuZFggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBudW1DZWxscykgLSBudW1DZWxscyAvIDI7IC8vIC0xMCB0byA5XG4gICAgY29uc3QgcmFuZFogPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBudW1DZWxscykgLSBudW1DZWxscyAvIDI7IC8vIC0xMCB0byA5XG5cbiAgICBmb29kUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMyhcbiAgICAgIHJhbmRYICogc2l6ZSArIHNpemUgLyAyLCAvLyBDZW50ZXIgb2YgdGhlIGdyaWQgY2VsbFxuICAgICAgMCwgLy8gRm9vZCBhdCB5PTAsIHNhbWUgbGV2ZWwgYXMgc25ha2VcbiAgICAgIHJhbmRaICogc2l6ZSArIHNpemUgLyAyXG4gICAgKTtcblxuICAgIC8vIENoZWNrIGZvciBjb2xsaXNpb24gd2l0aCBzbmFrZVxuICAgIGZvciAoY29uc3Qgc2VnbWVudCBvZiBnYW1lLnNuYWtlKSB7XG4gICAgICBpZiAoc2VnbWVudC5tZXNoLnBvc2l0aW9uLmRpc3RhbmNlVG8oZm9vZFBvc2l0aW9uKSA8IHNpemUgKiAwLjkpIHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgcG9zaXRpb25zIGFyZSB2ZXJ5IGNsb3NlXG4gICAgICAgIGNvbGxpc2lvbldpdGhTbmFrZSA9IHRydWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfSB3aGlsZSAoY29sbGlzaW9uV2l0aFNuYWtlKTtcblxuICBjb25zdCB0ZXh0dXJlID0gZ2FtZS5hc3NldHMudGV4dHVyZXNbXCJmb29kXCJdO1xuICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICBtYXA6IHRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlID8gdGV4dHVyZSA6IHVuZGVmaW5lZCxcbiAgICBjb2xvcjogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gdGV4dHVyZSA6IHVuZGVmaW5lZCxcbiAgfSk7XG4gIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KHNpemUgLyAyLCAxNiwgMTYpOyAvLyBGb29kIGlzIGEgc3BoZXJlXG4gIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xuICBtZXNoLnBvc2l0aW9uLmNvcHkoZm9vZFBvc2l0aW9uKTtcbiAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgZ2FtZS5zY2VuZS5hZGQobWVzaCk7XG4gIGdhbWUuZm9vZC5tZXNoID0gbWVzaDtcblxuICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uU3BoZXJlKHNpemUgLyAyKTtcbiAgY29uc3QgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAuMSB9KTsgLy8gU21hbGwgbWFzcyBzbyBpdCBjYW4gYmUgJ2VhdGVuJ1xuICBib2R5LmFkZFNoYXBlKHNoYXBlKTtcbiAgYm9keS5wb3NpdGlvbi5jb3B5KFxuICAgIG5ldyBDQU5OT04uVmVjMyhmb29kUG9zaXRpb24ueCwgZm9vZFBvc2l0aW9uLnksIGZvb2RQb3NpdGlvbi56KVxuICApO1xuICBnYW1lLmNhbm5vbldvcmxkLmFkZEJvZHkoYm9keSk7XG4gIGdhbWUuZm9vZC5ib2R5ID0gYm9keTtcbn1cblxuZnVuY3Rpb24gcGxheVNvdW5kKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBzb3VuZCA9IGdhbWUuYXNzZXRzLnNvdW5kc1tuYW1lXTtcbiAgaWYgKHNvdW5kKSB7XG4gICAgc291bmQuY3VycmVudFRpbWUgPSAwOyAvLyBSZXdpbmQgdG8gc3RhcnQgaWYgYWxyZWFkeSBwbGF5aW5nXG4gICAgc291bmQucGxheSgpLmNhdGNoKChlKSA9PiBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBwbGF5IHNvdW5kICR7bmFtZX06YCwgZSkpOyAvLyBDYXRjaCBwcm9taXNlIHJlamVjdGlvblxuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7bmFtZX0nIG5vdCBmb3VuZC5gKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVTY29yZVVJKCk6IHZvaWQge1xuICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSkge1xuICAgIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuaW5uZXJUZXh0ID0gYFNjb3JlOiAke2dhbWUuc2NvcmV9YDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZXNldEdhbWUoKTogdm9pZCB7XG4gIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSByZXR1cm47XG5cbiAgLy8gQ2xlYXIgZXhpc3Rpbmcgc25ha2UgYW5kIGZvb2RcbiAgZ2FtZS5zbmFrZS5mb3JFYWNoKChzZWdtZW50KSA9PiB7XG4gICAgZ2FtZS5zY2VuZT8ucmVtb3ZlKHNlZ21lbnQubWVzaCk7XG4gICAgc2VnbWVudC5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAoc2VnbWVudC5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZD8ucmVtb3ZlQm9keShzZWdtZW50LmJvZHkpO1xuICB9KTtcbiAgZ2FtZS5zbmFrZSA9IFtdO1xuXG4gIGlmIChnYW1lLmZvb2QubWVzaCkge1xuICAgIGdhbWUuc2NlbmUucmVtb3ZlKGdhbWUuZm9vZC5tZXNoKTtcbiAgICBnYW1lLmZvb2QubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XG4gICAgKGdhbWUuZm9vZC5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XG4gICAgZ2FtZS5mb29kLm1lc2ggPSBudWxsO1xuICB9XG4gIGlmIChnYW1lLmZvb2QuYm9keSkge1xuICAgIGdhbWUuY2Fubm9uV29ybGQucmVtb3ZlQm9keShnYW1lLmZvb2QuYm9keSk7XG4gICAgZ2FtZS5mb29kLmJvZHkgPSBudWxsO1xuICB9XG5cbiAgLy8gSW5pdGlhbCBzbmFrZSBwb3NpdGlvbiAoZS5nLiwgY2VudGVyIG9mIHRoZSBwbGF5YWJsZSBhcmVhKVxuICBjb25zdCBpbml0aWFsUG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMCk7XG5cbiAgLy8gQ3JlYXRlIGluaXRpYWwgc25ha2Ugc2VnbWVudHNcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBnYW1lLmRhdGEuaW5pdGlhbFNuYWtlTGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBzZWdtZW50UG9zID0gbmV3IFRIUkVFLlZlY3RvcjMoXG4gICAgICBpbml0aWFsUG9zLnggLSBpICogZ2FtZS5kYXRhLmdyaWRTaXplLFxuICAgICAgaW5pdGlhbFBvcy55LFxuICAgICAgaW5pdGlhbFBvcy56XG4gICAgKTtcbiAgICBnYW1lLnNuYWtlLnB1c2goY3JlYXRlU25ha2VTZWdtZW50KHNlZ21lbnRQb3MsIGkgPT09IDApKTtcbiAgfVxuXG4gIGdhbWUuZGlyZWN0aW9uLnNldCgxLCAwLCAwKTsgLy8gUmVzZXQgdG8gbW92aW5nIHJpZ2h0IChFYXN0KVxuICBnYW1lLm5leHREaXJlY3Rpb24uc2V0KDEsIDAsIDApO1xuICBnYW1lLnNjb3JlID0gMDtcbiAgdXBkYXRlU2NvcmVVSSgpO1xuICBnZW5lcmF0ZUZvb2QoKTtcbn1cblxuZnVuY3Rpb24gc3RhcnRHYW1lKCk6IHZvaWQge1xuICBpZiAoIWdhbWUuZGF0YSkgcmV0dXJuO1xuXG4gIGdhbWUuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XG4gIGlmIChnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4pXG4gICAgZ2FtZS51aUVsZW1lbnRzLnRpdGxlU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbilcbiAgICBnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSlcbiAgICBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5LnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG5cbiAgcmVzZXRHYW1lKCk7XG4gIGlmIChnYW1lLmFzc2V0cy5zb3VuZHNbXCJiZ21cIl0gJiYgIWdhbWUuYmdtKSB7XG4gICAgZ2FtZS5iZ20gPSBnYW1lLmFzc2V0cy5zb3VuZHNbXCJiZ21cIl07XG4gICAgZ2FtZS5iZ20ubG9vcCA9IHRydWU7XG4gICAgZ2FtZS5iZ20ucGxheSgpLmNhdGNoKChlKSA9PiBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gcGxheSBCR006XCIsIGUpKTtcbiAgfSBlbHNlIGlmIChnYW1lLmJnbSkge1xuICAgIGdhbWUuYmdtLnBsYXkoKS5jYXRjaCgoZSkgPT4gY29uc29sZS53YXJuKFwiRmFpbGVkIHRvIHBsYXkgQkdNOlwiLCBlKSk7XG4gIH1cblxuICBwbGF5U291bmQoXCJzdGFydF9nYW1lXCIpO1xuICBpZiAoZ2FtZS5jb250cm9scykge1xuICAgIGdhbWUuY29udHJvbHMuZW5hYmxlZCA9IHRydWU7IC8vIFx1QUM4Q1x1Qzc4NCBcdUMyRENcdUM3OTEgXHVDMkRDIE9yYml0Q29udHJvbHMgXHVENjVDXHVDMTMxXHVENjU0XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2FtZU92ZXIoKTogdm9pZCB7XG4gIGdhbWUuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcbiAgaWYgKGdhbWUuYmdtKSB7XG4gICAgZ2FtZS5iZ20ucGF1c2UoKTtcbiAgfVxuICBwbGF5U291bmQoXCJnYW1lX292ZXJcIik7XG5cbiAgaWYgKGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkpXG4gICAgZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4pXG4gICAgZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuLnN0eWxlLmRpc3BsYXkgPSBcImZsZXhcIjtcbiAgY29uc3QgZmluYWxTY29yZUVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZpbmFsU2NvcmVcIik7XG4gIGlmIChmaW5hbFNjb3JlRWxlbWVudCkge1xuICAgIGZpbmFsU2NvcmVFbGVtZW50LmlubmVyVGV4dCA9IGBTY29yZTogJHtnYW1lLnNjb3JlfWA7XG4gIH1cbiAgaWYgKGdhbWUuY29udHJvbHMpIHtcbiAgICBnYW1lLmNvbnRyb2xzLmVuYWJsZWQgPSBmYWxzZTsgLy8gXHVBQzhDXHVDNzg0IFx1QzYyNFx1QkM4NCBcdUMyREMgT3JiaXRDb250cm9scyBcdUJFNDRcdUQ2NUNcdUMxMzFcdUQ2NTRcbiAgfVxufVxuXG5mdW5jdGlvbiBoYW5kbGVJbnB1dChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuICBpZiAoIWdhbWUuZGF0YSkgcmV0dXJuO1xuXG4gIGNvbnN0IGN1cnJlbnREaXIgPSBnYW1lLmRpcmVjdGlvbjtcbiAgbGV0IG5ld0RpciA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cbiAgc3dpdGNoIChldmVudC5rZXkpIHtcbiAgICBjYXNlIFwiQXJyb3dVcFwiOlxuICAgICAgbmV3RGlyLnNldCgwLCAwLCAtMSk7IC8vIE1vdmUgTm9ydGggKG5lZ2F0aXZlIFopXG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiQXJyb3dEb3duXCI6XG4gICAgICBuZXdEaXIuc2V0KDAsIDAsIDEpOyAvLyBNb3ZlIFNvdXRoIChwb3NpdGl2ZSBaKVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIkFycm93TGVmdFwiOlxuICAgICAgbmV3RGlyLnNldCgtMSwgMCwgMCk7IC8vIE1vdmUgV2VzdCAobmVnYXRpdmUgWClcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJBcnJvd1JpZ2h0XCI6XG4gICAgICBuZXdEaXIuc2V0KDEsIDAsIDApOyAvLyBNb3ZlIEVhc3QgKHBvc2l0aXZlIFgpXG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiIFwiOiAvLyBTcGFjZSBrZXlcbiAgICAgIGlmIChcbiAgICAgICAgZ2FtZS5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSB8fFxuICAgICAgICBnYW1lLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUlxuICAgICAgKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIFByZXZlbnQgc2Nyb2xsaW5nXG4gICAgICAgIHN0YXJ0R2FtZSgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuOyAvLyBEb24ndCBwcm9jZXNzIHNwYWNlIGFzIGEgZGlyZWN0aW9uIGNoYW5nZVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm47XG4gIH1cblxuICAvLyBQcmV2ZW50IGltbWVkaWF0ZSByZXZlcnNlIChlLmcuLCB0cnlpbmcgdG8gZ28gbGVmdCB3aGVuIGN1cnJlbnRseSBnb2luZyByaWdodClcbiAgLy8gQ2hlY2sgaWYgbmV3RGlyIGlzIG5vdCBvcHBvc2l0ZSB0byBjdXJyZW50RGlyXG4gIGlmICghbmV3RGlyLmVxdWFscyhjdXJyZW50RGlyLmNsb25lKCkubmVnYXRlKCkpKSB7XG4gICAgZ2FtZS5uZXh0RGlyZWN0aW9uLmNvcHkobmV3RGlyKTtcbiAgfVxufVxuXG4vLyAtLS0gR2FtZSBMb29wIC0tLVxuXG5mdW5jdGlvbiB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcbiAgaWYgKCFnYW1lLmRhdGEgfHwgZ2FtZS5nYW1lU3RhdGUgIT09IEdhbWVTdGF0ZS5QTEFZSU5HKSByZXR1cm47XG5cbiAgZ2FtZS50aW1lU2luY2VMYXN0TW92ZSArPSBkZWx0YVRpbWU7XG5cbiAgaWYgKGdhbWUudGltZVNpbmNlTGFzdE1vdmUgPj0gZ2FtZS5tb3ZlSW50ZXJ2YWwgLyAxMDAwKSB7XG4gICAgLy8gQ29udmVydCBtb3ZlSW50ZXJ2YWwgdG8gc2Vjb25kc1xuICAgIGdhbWUudGltZVNpbmNlTGFzdE1vdmUgLT0gZ2FtZS5tb3ZlSW50ZXJ2YWwgLyAxMDAwO1xuXG4gICAgZ2FtZS5kaXJlY3Rpb24uY29weShnYW1lLm5leHREaXJlY3Rpb24pOyAvLyBBcHBseSBidWZmZXJlZCBkaXJlY3Rpb25cblxuICAgIC8vIFN0b3JlIGN1cnJlbnQgaGVhZCBwb3NpdGlvbiBiZWZvcmUgbW92aW5nXG4gICAgY29uc3Qgb2xkSGVhZFBvc2l0aW9uID0gZ2FtZS5zbmFrZVswXS5tZXNoLnBvc2l0aW9uLmNsb25lKCk7XG5cbiAgICAvLyBDYWxjdWxhdGUgbmV3IGhlYWQgcG9zaXRpb25cbiAgICBjb25zdCBoZWFkID0gZ2FtZS5zbmFrZVswXTtcbiAgICBjb25zdCBuZXdIZWFkUG9zaXRpb24gPSBoZWFkLm1lc2gucG9zaXRpb25cbiAgICAgIC5jbG9uZSgpXG4gICAgICAuYWRkKGdhbWUuZGlyZWN0aW9uLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoZ2FtZS5kYXRhLmdyaWRTaXplKSk7XG5cbiAgICAvLyAtLS0gQ29sbGlzaW9uIERldGVjdGlvbiAtLS1cbiAgICBjb25zdCB3b3JsZFNpemUgPSBnYW1lLmRhdGEuZ3JpZFNpemUgKiAyMDtcbiAgICBjb25zdCBoYWxmV29ybGRTaXplID0gd29ybGRTaXplIC8gMjtcbiAgICBjb25zdCBtYXhDb29yZCA9IGhhbGZXb3JsZFNpemUgLSBnYW1lLmRhdGEuZ3JpZFNpemUgLyAyO1xuICAgIGNvbnN0IG1pbkNvb3JkID0gLWhhbGZXb3JsZFNpemUgKyBnYW1lLmRhdGEuZ3JpZFNpemUgLyAyO1xuXG4gICAgLy8gV2FsbCBjb2xsaXNpb25cbiAgICAvLyBDaGVjayBpZiBuZXdIZWFkUG9zaXRpb24gaXMgb3V0c2lkZSB0aGUgcGxheSBhcmVhIGRlZmluZWQgYnkgbWluL21heENvb3JkXG4gICAgaWYgKFxuICAgICAgbmV3SGVhZFBvc2l0aW9uLnggPiBtYXhDb29yZCB8fFxuICAgICAgbmV3SGVhZFBvc2l0aW9uLnggPCBtaW5Db29yZCB8fFxuICAgICAgbmV3SGVhZFBvc2l0aW9uLnogPiBtYXhDb29yZCB8fFxuICAgICAgbmV3SGVhZFBvc2l0aW9uLnogPCBtaW5Db29yZFxuICAgICkge1xuICAgICAgZ2FtZU92ZXIoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBTZWxmLWNvbGxpc2lvbiAoY2hlY2sgbmV3IGhlYWQgcG9zaXRpb24gYWdhaW5zdCBhbGwgYm9keSBzZWdtZW50cyBleGNlcHQgdGhlIGN1cnJlbnQgaGVhZClcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IGdhbWUuc25ha2UubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChcbiAgICAgICAgbmV3SGVhZFBvc2l0aW9uLmRpc3RhbmNlVG8oZ2FtZS5zbmFrZVtpXS5tZXNoLnBvc2l0aW9uKSA8XG4gICAgICAgIGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDAuOVxuICAgICAgKSB7XG4gICAgICAgIC8vIENoZWNrIGlmIHBvc2l0aW9ucyBhcmUgdmVyeSBjbG9zZVxuICAgICAgICBnYW1lT3ZlcigpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gTW92ZSBzbmFrZTogSGVhZCBtb3ZlcyB0byBuZXcgcG9zaXRpb24sIGJvZHkgc2VnbWVudHMgZm9sbG93XG4gICAgZm9yIChsZXQgaSA9IGdhbWUuc25ha2UubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xuICAgICAgZ2FtZS5zbmFrZVtpXS5tZXNoLnBvc2l0aW9uLmNvcHkoZ2FtZS5zbmFrZVtpIC0gMV0ubWVzaC5wb3NpdGlvbik7XG4gICAgICBnYW1lLnNuYWtlW2ldLmJvZHkucG9zaXRpb24uY29weShcbiAgICAgICAgbmV3IENBTk5PTi5WZWMzKFxuICAgICAgICAgIGdhbWUuc25ha2VbaSAtIDFdLm1lc2gucG9zaXRpb24ueCxcbiAgICAgICAgICBnYW1lLnNuYWtlW2kgLSAxXS5tZXNoLnBvc2l0aW9uLnksXG4gICAgICAgICAgZ2FtZS5zbmFrZVtpIC0gMV0ubWVzaC5wb3NpdGlvbi56XG4gICAgICAgIClcbiAgICAgICk7XG4gICAgfVxuICAgIGhlYWQubWVzaC5wb3NpdGlvbi5jb3B5KG5ld0hlYWRQb3NpdGlvbik7XG4gICAgaGVhZC5ib2R5LnBvc2l0aW9uLmNvcHkoXG4gICAgICBuZXcgQ0FOTk9OLlZlYzMobmV3SGVhZFBvc2l0aW9uLngsIG5ld0hlYWRQb3NpdGlvbi55LCBuZXdIZWFkUG9zaXRpb24ueilcbiAgICApO1xuXG4gICAgLy8gRm9vZCBjb2xsaXNpb25cbiAgICBpZiAoXG4gICAgICBnYW1lLmZvb2QubWVzaCAmJlxuICAgICAgbmV3SGVhZFBvc2l0aW9uLmRpc3RhbmNlVG8oZ2FtZS5mb29kLm1lc2gucG9zaXRpb24pIDxcbiAgICAgICAgZ2FtZS5kYXRhLmdyaWRTaXplICogMC45XG4gICAgKSB7XG4gICAgICBwbGF5U291bmQoXCJlYXRfZm9vZFwiKTtcbiAgICAgIGdhbWUuc2NvcmUrKztcbiAgICAgIHVwZGF0ZVNjb3JlVUkoKTtcblxuICAgICAgLy8gQWRkIG5ldyBzZWdtZW50IGF0IHRoZSBvbGQgdGFpbCdzIHBvc2l0aW9uICh0aGUgcG9zaXRpb24gb2YgdGhlIHNlZ21lbnQgdGhhdCB3YXMgbW92ZWQgZnJvbSBieSB0aGUgbGFzdCBzZWdtZW50KVxuICAgICAgLy8gVGhlIHNlZ21lbnQgdGhhdCB3YXMgYXQgZ2FtZS5zbmFrZVtnYW1lLnNuYWtlLmxlbmd0aCAtIDFdIGJlZm9yZSB0aGUgbW92ZSBub3cgbmVlZHMgYSBuZXcgb25lIGJlaGluZCBpdC5cbiAgICAgIC8vIFRoZSBvbGRIZWFkUG9zaXRpb24gKHdoaWNoIGlzIG5vdyBlZmZlY3RpdmVseSB0aGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IGJvZHkgc2VnbWVudClcbiAgICAgIC8vIGlzIG5vdCBzdWl0YWJsZSBmb3IgdGhlIG5ldyBzZWdtZW50LiBJbnN0ZWFkLCB0aGUgbGFzdCBzZWdtZW50J3MgKnByZXZpb3VzKiBwb3NpdGlvblxuICAgICAgLy8gKGJlZm9yZSBpdCBtb3ZlZCkgaXMgdGhlIGNvcnJlY3Qgc3BvdC4gQnV0IHNpbmNlIHdlIGp1c3QgbW92ZWQgZXZlcnl0aGluZyxcbiAgICAgIC8vIHRoZSBuZXcgc2VnbWVudCBzaG91bGQgYWN0dWFsbHkgb2NjdXB5IHRoZSBgb2xkSGVhZFBvc2l0aW9uYCdzIGxhc3QgcG9zaXRpb24uXG4gICAgICAvLyBBIHNpbXBsZXIgYXBwcm9hY2g6IGNyZWF0ZSB0aGUgbmV3IHNlZ21lbnQgYXQgdGhlIHBvc2l0aW9uIG9mIHRoZSBsYXN0IHNlZ21lbnQgKmFmdGVyKiB0aGUgbW92ZS5cbiAgICAgIC8vIFRoaXMgbWFrZXMgdGhlIHNuYWtlIGdyb3cgZnJvbSBpdHMgdGFpbCBpbiB0aGUgZGlyZWN0aW9uIGl0IHdhcyBtb3ZpbmcuXG4gICAgICBjb25zdCBsYXN0U2VnbWVudEN1cnJlbnRQb3MgPVxuICAgICAgICBnYW1lLnNuYWtlW2dhbWUuc25ha2UubGVuZ3RoIC0gMV0ubWVzaC5wb3NpdGlvbi5jbG9uZSgpO1xuICAgICAgZ2FtZS5zbmFrZS5wdXNoKGNyZWF0ZVNuYWtlU2VnbWVudChsYXN0U2VnbWVudEN1cnJlbnRQb3MsIGZhbHNlKSk7XG5cbiAgICAgIGdlbmVyYXRlRm9vZCgpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVwZGF0ZSBDYW5ub24uanMgd29ybGQgKGV2ZW4gaWYgcG9zaXRpb25zIGFyZSBtYW51YWxseSBzZXQsIHRoaXMgcHJvY2Vzc2VzIHBvdGVudGlhbCBjb250YWN0IGNhbGxiYWNrcyBpZiBhbnkgd2VyZSBzZXQgdXApXG4gIGlmIChnYW1lLmNhbm5vbldvcmxkKSB7XG4gICAgLy8gVXNlIGEgZml4ZWQgdGltZSBzdGVwIGZvciBwaHlzaWNzIHNpbXVsYXRpb24gZm9yIHN0YWJpbGl0eVxuICAgIGNvbnN0IGZpeGVkVGltZVN0ZXAgPSAxIC8gNjA7IC8vIDYwIEh6XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5zdGVwKGZpeGVkVGltZVN0ZXAsIGRlbHRhVGltZSwgMyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyKCk6IHZvaWQge1xuICBpZiAoZ2FtZS5yZW5kZXJlciAmJiBnYW1lLnNjZW5lICYmIGdhbWUuY2FtZXJhKSB7XG4gICAgZ2FtZS5yZW5kZXJlci5yZW5kZXIoZ2FtZS5zY2VuZSwgZ2FtZS5jYW1lcmEpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdhbWVMb29wKGN1cnJlbnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcbiAgLy8gQ29udmVydCBkZWx0YVRpbWUgdG8gc2Vjb25kcyBmb3IgY29uc2lzdGVuY3kgd2l0aCBDYW5ub24uanMgc3RlcFxuICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSBnYW1lLmxhc3RVcGRhdGVUaW1lKSAvIDEwMDA7XG4gIGdhbWUubGFzdFVwZGF0ZVRpbWUgPSBjdXJyZW50VGltZTtcblxuICAvLyBPcmJpdENvbnRyb2xzIFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOFxuICBpZiAoZ2FtZS5jb250cm9scykge1xuICAgIGdhbWUuY29udHJvbHMudXBkYXRlKCk7XG4gIH1cblxuICB1cGRhdGUoZGVsdGFUaW1lKTtcbiAgcmVuZGVyKCk7XG5cbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcbn1cblxuLy8gLS0tIE1haW4gRW50cnkgUG9pbnQgLS0tXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCBhc3luYyAoKSA9PiB7XG4gIGdhbWUuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJnYW1lQ2FudmFzXCIpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xuICBpZiAoIWdhbWUuY2FudmFzKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZC5cIik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXdhaXQgbG9hZEdhbWVEYXRhKCk7XG4gIGlmICghZ2FtZS5kYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc2V0dXBVSSgpOyAvLyBTZXQgdXAgVUkgZWxlbWVudHNcblxuICBhd2FpdCBwcmVsb2FkQXNzZXRzKCk7XG4gIGNyZWF0ZUdhbWVXb3JsZCgpO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVJbnB1dCk7XG5cbiAgLy8gSW5pdGlhbCByZW5kZXIgb2YgdGhlIHRpdGxlIHNjcmVlblxuICBnYW1lLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcbiAgaWYgKGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbilcbiAgICBnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4uc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSlcbiAgICBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbilcbiAgICBnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXG4gIGdhbWUubGFzdFVwZGF0ZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTsgLy8gSW5pdGlhbGl6ZSBsYXN0VXBkYXRlVGltZVxuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2FtZUxvb3ApO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMscUJBQXFCO0FBMEM5QixJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDRSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFIRyxTQUFBQTtBQUFBLEdBQUE7QUFNTCxNQUFNLE9BeUJGO0FBQUEsRUFDRixNQUFNO0FBQUEsRUFDTixRQUFRLEVBQUUsVUFBVSxDQUFDLEdBQUcsUUFBUSxDQUFDLEVBQUU7QUFBQSxFQUNuQyxRQUFRO0FBQUEsRUFDUixVQUFVO0FBQUEsRUFDVixPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixVQUFVO0FBQUE7QUFBQSxFQUNWLGFBQWE7QUFBQSxFQUNiLE9BQU8sQ0FBQztBQUFBLEVBQ1IsTUFBTSxFQUFFLE1BQU0sTUFBTSxNQUFNLEtBQUs7QUFBQSxFQUMvQixXQUFXLElBQUksTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDO0FBQUE7QUFBQSxFQUNwQyxlQUFlLElBQUksTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDO0FBQUEsRUFDeEMsT0FBTztBQUFBLEVBQ1AsV0FBVztBQUFBLEVBQ1gsZ0JBQWdCO0FBQUEsRUFDaEIsbUJBQW1CO0FBQUEsRUFDbkIsY0FBYztBQUFBO0FBQUEsRUFDZCxZQUFZO0FBQUEsSUFDVixh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
