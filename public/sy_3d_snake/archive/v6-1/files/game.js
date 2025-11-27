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
  food: [],
  // 초기화: 빈 배열로 시작
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
function addFoodItem() {
  if (!game.data || !game.scene || !game.cannonWorld) {
    throw new Error("Game not initialized for adding food.");
  }
  const size = game.data.gridSize;
  let foodPosition;
  let collisionDetected;
  do {
    collisionDetected = false;
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
        collisionDetected = true;
        break;
      }
    }
    if (collisionDetected) continue;
    for (const existingFood of game.food) {
      if (existingFood.mesh.position.distanceTo(foodPosition) < size * 0.9) {
        collisionDetected = true;
        break;
      }
    }
  } while (collisionDetected);
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
  const shape = new CANNON.Sphere(size / 2);
  const body = new CANNON.Body({ mass: 0.1 });
  body.addShape(shape);
  body.position.copy(
    new CANNON.Vec3(foodPosition.x, foodPosition.y, foodPosition.z)
  );
  game.cannonWorld.addBody(body);
  game.food.push({ mesh, body });
}
function clearAllFood() {
  game.food.forEach((f) => {
    game.scene?.remove(f.mesh);
    f.mesh.geometry.dispose();
    f.mesh.material.dispose();
    game.cannonWorld?.removeBody(f.body);
  });
  game.food = [];
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
  clearAllFood();
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
  for (let i = 0; i < game.data.numberOfFoodItems; i++) {
    addFoodItem();
  }
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
    const tailPreviousPosition = game.snake[game.snake.length - 1].mesh.position.clone();
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
    let foodEatenIndex = null;
    for (let i = 0; i < game.food.length; i++) {
      const foodItem = game.food[i];
      if (newHeadPosition.distanceTo(foodItem.mesh.position) < game.data.gridSize * 0.9) {
        foodEatenIndex = i;
        break;
      }
    }
    if (foodEatenIndex !== null) {
      playSound("eat_food");
      game.score++;
      updateScoreUI();
      const eatenFood = game.food[foodEatenIndex];
      game.scene?.remove(eatenFood.mesh);
      eatenFood.mesh.geometry.dispose();
      eatenFood.mesh.material.dispose();
      game.cannonWorld?.removeBody(eatenFood.body);
      game.food.splice(foodEatenIndex, 1);
      game.snake.push(createSnakeSegment(tailPreviousPosition, false));
      addFoodItem();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSBcInRocmVlXCI7XG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSBcImNhbm5vbi1lc1wiO1xuaW1wb3J0IHsgT3JiaXRDb250cm9scyB9IGZyb20gXCJ0aHJlZS9leGFtcGxlcy9qc20vY29udHJvbHMvT3JiaXRDb250cm9scy5qc1wiO1xuXG4vLyAtLS0gR2xvYmFsIEdhbWUgU3RhdGUgYW5kIENvbmZpZ3VyYXRpb24gLS0tXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XG4gIGNhbnZhc1dpZHRoOiBudW1iZXI7XG4gIGNhbnZhc0hlaWdodDogbnVtYmVyO1xuICBncmlkU2l6ZTogbnVtYmVyOyAvLyBTaXplIG9mIGVhY2ggZ3JpZCBjZWxsIGluIHdvcmxkIHVuaXRzXG4gIHNuYWtlU3BlZWQ6IG51bWJlcjsgLy8gSG93IG1hbnkgZ3JpZCBjZWxscyBwZXIgc2Vjb25kIHRoZSBzbmFrZSBtb3Zlc1xuICBpbml0aWFsU25ha2VMZW5ndGg6IG51bWJlcjtcbiAgbnVtYmVyT2ZGb29kSXRlbXM6IG51bWJlcjsgLy8gXHVDRDk0XHVBQzAwOiBcdUFDOENcdUM3ODQgXHVCMEI0IFx1QkEzOVx1Qzc3NFx1Qzc1OCBcdUFDMUNcdUMyMThcbiAgd2FsbFRoaWNrbmVzczogbnVtYmVyOyAvLyBUaGlja25lc3Mgb2YgdGhlIHdhbGxzIGluIHdvcmxkIHVuaXRzXG4gIGNhbWVyYUZPVjogbnVtYmVyO1xuICBjYW1lcmFOZWFyOiBudW1iZXI7XG4gIGNhbWVyYUZhcjogbnVtYmVyO1xuICBjYW1lcmFQb3NpdGlvbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyIH07XG4gIGxpZ2h0UG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xuICBjb2xvcnM6IHtcbiAgICBiYWNrZ3JvdW5kOiBudW1iZXI7XG4gICAgdGl0bGVUZXh0OiBzdHJpbmc7XG4gICAgc2NvcmVUZXh0OiBzdHJpbmc7XG4gICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XG4gIH07XG4gIGFzc2V0czoge1xuICAgIGltYWdlczogQXJyYXk8e1xuICAgICAgbmFtZTogc3RyaW5nO1xuICAgICAgcGF0aDogc3RyaW5nO1xuICAgICAgd2lkdGg6IG51bWJlcjtcbiAgICAgIGhlaWdodDogbnVtYmVyO1xuICAgIH0+O1xuICAgIHNvdW5kczogQXJyYXk8e1xuICAgICAgbmFtZTogc3RyaW5nO1xuICAgICAgcGF0aDogc3RyaW5nO1xuICAgICAgZHVyYXRpb25fc2Vjb25kczogbnVtYmVyO1xuICAgICAgdm9sdW1lOiBudW1iZXI7XG4gICAgfT47XG4gIH07XG59XG5cbmludGVyZmFjZSBMb2FkZWRBc3NldHMge1xuICB0ZXh0dXJlczogeyBba2V5OiBzdHJpbmddOiBUSFJFRS5UZXh0dXJlIHwgVEhSRUUuQ29sb3IgfTtcbiAgc291bmRzOiB7IFtrZXk6IHN0cmluZ106IEhUTUxBdWRpb0VsZW1lbnQgfTtcbn1cblxuZW51bSBHYW1lU3RhdGUge1xuICBUSVRMRSxcbiAgUExBWUlORyxcbiAgR0FNRV9PVkVSLFxufVxuXG5jb25zdCBnYW1lOiB7XG4gIGRhdGE6IEdhbWVDb25maWcgfCBudWxsO1xuICBhc3NldHM6IExvYWRlZEFzc2V0cztcbiAgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudCB8IG51bGw7XG4gIHJlbmRlcmVyOiBUSFJFRS5XZWJHTFJlbmRlcmVyIHwgbnVsbDtcbiAgc2NlbmU6IFRIUkVFLlNjZW5lIHwgbnVsbDtcbiAgY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSB8IG51bGw7XG4gIGNvbnRyb2xzOiBPcmJpdENvbnRyb2xzIHwgbnVsbDsgLy8gT3JiaXRDb250cm9scyBcdUNEOTRcdUFDMDBcbiAgY2Fubm9uV29ybGQ6IENBTk5PTi5Xb3JsZCB8IG51bGw7XG4gIHNuYWtlOiB7IG1lc2g6IFRIUkVFLk1lc2g7IGJvZHk6IENBTk5PTi5Cb2R5IH1bXTtcbiAgZm9vZDogeyBtZXNoOiBUSFJFRS5NZXNoOyBib2R5OiBDQU5OT04uQm9keSB9W107IC8vIFx1QkNDMFx1QUNCRDogXHVCMkU4XHVDNzdDIFx1QkEzOVx1Qzc3NFx1QzVEMFx1QzExQyBcdUJBMzlcdUM3NzQgXHVCQzMwXHVDNUY0XHVCODVDIFx1QkNDMFx1QUNCRFxuICBkaXJlY3Rpb246IFRIUkVFLlZlY3RvcjM7XG4gIG5leHREaXJlY3Rpb246IFRIUkVFLlZlY3RvcjM7XG4gIHNjb3JlOiBudW1iZXI7XG4gIGdhbWVTdGF0ZTogR2FtZVN0YXRlO1xuICBsYXN0VXBkYXRlVGltZTogbnVtYmVyO1xuICB0aW1lU2luY2VMYXN0TW92ZTogbnVtYmVyO1xuICBtb3ZlSW50ZXJ2YWw6IG51bWJlcjsgLy8gVGltZSBpbiBtcyBiZXR3ZWVuIHNuYWtlIG1vdmVzXG4gIHVpRWxlbWVudHM6IHtcbiAgICB0aXRsZVNjcmVlbjogSFRNTERpdkVsZW1lbnQgfCBudWxsO1xuICAgIHNjb3JlRGlzcGxheTogSFRNTERpdkVsZW1lbnQgfCBudWxsO1xuICAgIGdhbWVPdmVyU2NyZWVuOiBIVE1MRGl2RWxlbWVudCB8IG51bGw7XG4gIH07XG4gIGJnbTogSFRNTEF1ZGlvRWxlbWVudCB8IG51bGw7XG4gIHdhbGxCb2RpZXM6IENBTk5PTi5Cb2R5W107IC8vIFRvIGhvbGQgcmVmZXJlbmNlcyB0byBjYW5ub24gd2FsbCBib2RpZXNcbn0gPSB7XG4gIGRhdGE6IG51bGwsXG4gIGFzc2V0czogeyB0ZXh0dXJlczoge30sIHNvdW5kczoge30gfSxcbiAgY2FudmFzOiBudWxsLFxuICByZW5kZXJlcjogbnVsbCxcbiAgc2NlbmU6IG51bGwsXG4gIGNhbWVyYTogbnVsbCxcbiAgY29udHJvbHM6IG51bGwsIC8vIFx1Q0QwOFx1QUUzMFx1RDY1NFxuICBjYW5ub25Xb3JsZDogbnVsbCxcbiAgc25ha2U6IFtdLFxuICBmb29kOiBbXSwgLy8gXHVDRDA4XHVBRTMwXHVENjU0OiBcdUJFNDggXHVCQzMwXHVDNUY0XHVCODVDIFx1QzJEQ1x1Qzc5MVxuICBkaXJlY3Rpb246IG5ldyBUSFJFRS5WZWN0b3IzKDEsIDAsIDApLCAvLyBJbml0aWFsIGRpcmVjdGlvbjogRWFzdCAocG9zaXRpdmUgWClcbiAgbmV4dERpcmVjdGlvbjogbmV3IFRIUkVFLlZlY3RvcjMoMSwgMCwgMCksXG4gIHNjb3JlOiAwLFxuICBnYW1lU3RhdGU6IEdhbWVTdGF0ZS5USVRMRSxcbiAgbGFzdFVwZGF0ZVRpbWU6IDAsXG4gIHRpbWVTaW5jZUxhc3RNb3ZlOiAwLFxuICBtb3ZlSW50ZXJ2YWw6IDAsIC8vIFdpbGwgYmUgY2FsY3VsYXRlZCBmcm9tIHNuYWtlU3BlZWRcbiAgdWlFbGVtZW50czoge1xuICAgIHRpdGxlU2NyZWVuOiBudWxsLFxuICAgIHNjb3JlRGlzcGxheTogbnVsbCxcbiAgICBnYW1lT3ZlclNjcmVlbjogbnVsbCxcbiAgfSxcbiAgYmdtOiBudWxsLFxuICB3YWxsQm9kaWVzOiBbXSxcbn07XG5cbi8vIC0tLSBHYW1lIEluaXRpYWxpemF0aW9uIC0tLVxuXG5hc3luYyBmdW5jdGlvbiBsb2FkR2FtZURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChcImRhdGEuanNvblwiKTtcbiAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGRhdGEuanNvbjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xuICAgIH1cbiAgICBnYW1lLmRhdGEgPSAoYXdhaXQgcmVzcG9uc2UuanNvbigpKSBhcyBHYW1lQ29uZmlnO1xuICAgIGNvbnNvbGUubG9nKFwiR2FtZSBkYXRhIGxvYWRlZDpcIiwgZ2FtZS5kYXRhKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBnYW1lIGRhdGE6XCIsIGVycm9yKTtcbiAgICBhbGVydChcIkZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gUGxlYXNlIGNoZWNrIGRhdGEuanNvbi5cIik7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gcHJlbG9hZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKCFnYW1lLmRhdGEpIHJldHVybjtcblxuICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcbiAgY29uc3QgYXVkaW9Qcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG4gIGNvbnN0IHRleHR1cmVQcm9taXNlczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cbiAgLy8gQWRkIHBsYWNlaG9sZGVyIHRleHR1cmVzIGlmIGFjdHVhbCBhc3NldHMgYXJlIG5vdCBmb3VuZCBpbiBkYXRhLmpzb25cbiAgLy8gVGhpcyBhbGxvd3MgdGhlIGdhbWUgdG8gcnVuIGV2ZW4gaWYgc29tZSBhc3NldHMgYXJlIG1pc3NpbmcuXG4gIC8vIEVuc3VyZSBhbGwgY3JpdGljYWwgdGV4dHVyZSBuYW1lcyBhcmUgcHJlc2VudCBpbiBhc3NldHMudGV4dHVyZXNcbiAgY29uc3QgcmVxdWlyZWRUZXh0dXJlcyA9IFtcInNuYWtlX2hlYWRcIiwgXCJzbmFrZV9ib2R5XCIsIFwiZm9vZFwiLCBcIndhbGxfdGV4dHVyZVwiXTtcbiAgZm9yIChjb25zdCBuYW1lIG9mIHJlcXVpcmVkVGV4dHVyZXMpIHtcbiAgICBpZiAoIWdhbWUuZGF0YS5hc3NldHMuaW1hZ2VzLnNvbWUoKGltZykgPT4gaW1nLm5hbWUgPT09IG5hbWUpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBUZXh0dXJlICcke25hbWV9JyBub3QgZm91bmQgaW4gZGF0YS5qc29uLiBVc2luZyBhIHBsYWNlaG9sZGVyLmBcbiAgICAgICk7XG4gICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tuYW1lXSA9IG5ldyBUSFJFRS5Db2xvcigweDg4ODg4OCk7IC8vIERlZmF1bHQgY29sb3JcbiAgICB9XG4gIH1cblxuICBmb3IgKGNvbnN0IGltZyBvZiBnYW1lLmRhdGEuYXNzZXRzLmltYWdlcykge1xuICAgIHRleHR1cmVQcm9taXNlcy5wdXNoKFxuICAgICAgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICAgICAgLy8gQ2hhbmdlZCB0byByZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIGdhbWVcbiAgICAgICAgdGV4dHVyZUxvYWRlci5sb2FkKFxuICAgICAgICAgIGltZy5wYXRoLFxuICAgICAgICAgICh0ZXh0dXJlKSA9PiB7XG4gICAgICAgICAgICBnYW1lLmFzc2V0cy50ZXh0dXJlc1tpbWcubmFtZV0gPSB0ZXh0dXJlO1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIChlcnJvcikgPT4ge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgICAgYEVycm9yIGxvYWRpbmcgdGV4dHVyZSAke2ltZy5uYW1lfSBmcm9tICR7aW1nLnBhdGh9OmAsXG4gICAgICAgICAgICAgIGVycm9yXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgZ2FtZS5hc3NldHMudGV4dHVyZXNbaW1nLm5hbWVdID0gbmV3IFRIUkVFLkNvbG9yKDB4ODg4ODg4KTsgLy8gRmFsbGJhY2sgdG8gY29sb3JcbiAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIGFsbG93IGdhbWUgdG8gY29udGludWVcbiAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICAvLyBFbnN1cmUgYWxsIGNyaXRpY2FsIHNvdW5kIG5hbWVzIGFyZSBwcmVzZW50IGluIGFzc2V0cy5zb3VuZHNcbiAgY29uc3QgcmVxdWlyZWRTb3VuZHMgPSBbXCJlYXRfZm9vZFwiLCBcImdhbWVfb3ZlclwiLCBcImJnbVwiLCBcInN0YXJ0X2dhbWVcIl07XG4gIGZvciAoY29uc3QgbmFtZSBvZiByZXF1aXJlZFNvdW5kcykge1xuICAgIGlmICghZ2FtZS5kYXRhLmFzc2V0cy5zb3VuZHMuc29tZSgocykgPT4gcy5uYW1lID09PSBuYW1lKSkge1xuICAgICAgY29uc29sZS53YXJuKGBTb3VuZCAnJHtuYW1lfScgbm90IGZvdW5kIGluIGRhdGEuanNvbi4gV2lsbCBub3QgcGxheS5gKTtcbiAgICAgIC8vIE5vIGRlZmF1bHQgc291bmQsIGp1c3Qgd29uJ3QgYmUgaW4gZ2FtZS5hc3NldHMuc291bmRzXG4gICAgfVxuICB9XG5cbiAgZm9yIChjb25zdCBzb3VuZCBvZiBnYW1lLmRhdGEuYXNzZXRzLnNvdW5kcykge1xuICAgIGF1ZGlvUHJvbWlzZXMucHVzaChcbiAgICAgIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIC8vIENoYW5nZWQgdG8gcmVzb2x2ZSBldmVuIG9uIGVycm9yXG4gICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kLnBhdGgpO1xuICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XG4gICAgICAgIGF1ZGlvLmxvYWQoKTsgLy8gUHJlbG9hZCB0aGUgYXVkaW9cbiAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcbiAgICAgICAgICBnYW1lLmFzc2V0cy5zb3VuZHNbc291bmQubmFtZV0gPSBhdWRpbztcbiAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH07XG4gICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoZSkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICBgRXJyb3IgbG9hZGluZyBzb3VuZCAke3NvdW5kLm5hbWV9IGZyb20gJHtzb3VuZC5wYXRofTpgLFxuICAgICAgICAgICAgZVxuICAgICAgICAgICk7XG4gICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gYWxsb3cgZ2FtZSB0byBjb250aW51ZVxuICAgICAgICB9O1xuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4udGV4dHVyZVByb21pc2VzLCAuLi5hdWRpb1Byb21pc2VzXSk7XG4gICAgY29uc29sZS5sb2coXCJBbGwgYXNzZXRzIHByZWxvYWRlZCAob3IgZmFsbGVuIGJhY2sgdG8gcGxhY2Vob2xkZXJzKS5cIik7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcIlVuZXhwZWN0ZWQgZXJyb3IgZHVyaW5nIGFzc2V0IHByZWxvYWRpbmc6XCIsIGVycm9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZXR1cFVJKCk6IHZvaWQge1xuICBpZiAoIWdhbWUuZGF0YSB8fCAhZ2FtZS5jYW52YXMpIHJldHVybjtcblxuICBjb25zdCBib2R5ID0gZG9jdW1lbnQuYm9keTtcbiAgYm9keS5zdHlsZS5tYXJnaW4gPSBcIjBcIjtcbiAgYm9keS5zdHlsZS5vdmVyZmxvdyA9IFwiaGlkZGVuXCI7XG5cbiAgLy8gVGl0bGUgU2NyZWVuXG4gIGNvbnN0IHRpdGxlU2NyZWVuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgdGl0bGVTY3JlZW4uaWQgPSBcInRpdGxlU2NyZWVuXCI7XG4gIE9iamVjdC5hc3NpZ24odGl0bGVTY3JlZW4uc3R5bGUsIHtcbiAgICBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiLFxuICAgIHRvcDogXCIwXCIsXG4gICAgbGVmdDogXCIwXCIsXG4gICAgd2lkdGg6IFwiMTAwJVwiLFxuICAgIGhlaWdodDogXCIxMDAlXCIsXG4gICAgYmFja2dyb3VuZENvbG9yOiBgcmdiYSgwLCAwLCAwLCAwLjcpYCxcbiAgICBjb2xvcjogZ2FtZS5kYXRhLmNvbG9ycy50aXRsZVRleHQsXG4gICAgZm9udEZhbWlseTogXCJBcmlhbCwgc2Fucy1zZXJpZlwiLFxuICAgIGRpc3BsYXk6IFwiZmxleFwiLFxuICAgIGZsZXhEaXJlY3Rpb246IFwiY29sdW1uXCIsXG4gICAganVzdGlmeUNvbnRlbnQ6IFwiY2VudGVyXCIsXG4gICAgYWxpZ25JdGVtczogXCJjZW50ZXJcIixcbiAgICB6SW5kZXg6IFwiMTAwXCIsXG4gICAgZm9udFNpemU6IFwiNDhweFwiLFxuICAgIHRleHRBbGlnbjogXCJjZW50ZXJcIixcbiAgfSk7XG4gIHRpdGxlU2NyZWVuLmlubmVySFRNTCA9IGBcbiAgICAgICAgPGgxPjNEIFx1QkM0MCBcdUFDOUM8L2gxPlxuICAgICAgICA8cCBzdHlsZT1cImZvbnQtc2l6ZTogMjRweDtcIj5QcmVzcyBTUEFDRSB0byBTdGFydDwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDE4cHg7XCI+VXNlIEFycm93IEtleXMgdG8gTW92ZTwvcD5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDE4cHg7XCI+VXNlIE1vdXNlIHRvIFJvdGF0ZSBDYW1lcmE8L3A+IDwhLS0gXHVCOUM4XHVDNkIwXHVDMkE0IFx1QzEyNFx1QkE4NSBcdUNEOTRcdUFDMDAgLS0+XG4gICAgYDtcbiAgYm9keS5hcHBlbmRDaGlsZCh0aXRsZVNjcmVlbik7XG4gIGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbiA9IHRpdGxlU2NyZWVuO1xuXG4gIC8vIFNjb3JlIERpc3BsYXlcbiAgY29uc3Qgc2NvcmVEaXNwbGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgc2NvcmVEaXNwbGF5LmlkID0gXCJzY29yZURpc3BsYXlcIjtcbiAgT2JqZWN0LmFzc2lnbihzY29yZURpc3BsYXkuc3R5bGUsIHtcbiAgICBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiLFxuICAgIHRvcDogXCIxMHB4XCIsXG4gICAgbGVmdDogXCIxMHB4XCIsXG4gICAgY29sb3I6IGdhbWUuZGF0YS5jb2xvcnMuc2NvcmVUZXh0LFxuICAgIGZvbnRGYW1pbHk6IFwiQXJpYWwsIHNhbnMtc2VyaWZcIixcbiAgICBmb250U2l6ZTogXCIyNHB4XCIsXG4gICAgekluZGV4OiBcIjEwMVwiLFxuICAgIGRpc3BsYXk6IFwibm9uZVwiLCAvLyBIaWRkZW4gaW5pdGlhbGx5XG4gIH0pO1xuICBzY29yZURpc3BsYXkuaW5uZXJUZXh0ID0gYFNjb3JlOiAwYDtcbiAgYm9keS5hcHBlbmRDaGlsZChzY29yZURpc3BsYXkpO1xuICBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5ID0gc2NvcmVEaXNwbGF5O1xuXG4gIC8vIEdhbWUgT3ZlciBTY3JlZW5cbiAgY29uc3QgZ2FtZU92ZXJTY3JlZW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICBnYW1lT3ZlclNjcmVlbi5pZCA9IFwiZ2FtZU92ZXJTY3JlZW5cIjtcbiAgT2JqZWN0LmFzc2lnbihnYW1lT3ZlclNjcmVlbi5zdHlsZSwge1xuICAgIHBvc2l0aW9uOiBcImFic29sdXRlXCIsXG4gICAgdG9wOiBcIjBcIixcbiAgICBsZWZ0OiBcIjBcIixcbiAgICB3aWR0aDogXCIxMDAlXCIsXG4gICAgaGVpZ2h0OiBcIjEwMCVcIixcbiAgICBiYWNrZ3JvdW5kQ29sb3I6IGByZ2JhKDAsIDAsIDAsIDAuNylgLFxuICAgIGNvbG9yOiBnYW1lLmRhdGEuY29sb3JzLmdhbWVPdmVyVGV4dCxcbiAgICBmb250RmFtaWx5OiBcIkFyaWFsLCBzYW5zLXNlcmlmXCIsXG4gICAgZGlzcGxheTogXCJub25lXCIsIC8vIEhpZGRlbiBpbml0aWFsbHlcbiAgICBmbGV4RGlyZWN0aW9uOiBcImNvbHVtblwiLFxuICAgIGp1c3RpZnlDb250ZW50OiBcImNlbnRlclwiLFxuICAgIGFsaWduSXRlbXM6IFwiY2VudGVyXCIsXG4gICAgekluZGV4OiBcIjEwMlwiLFxuICAgIGZvbnRTaXplOiBcIjQ4cHhcIixcbiAgICB0ZXh0QWxpZ246IFwiY2VudGVyXCIsXG4gIH0pO1xuICBnYW1lT3ZlclNjcmVlbi5pbm5lckhUTUwgPSBgXG4gICAgICAgIDxoMT5HQU1FIE9WRVIhPC9oMT5cbiAgICAgICAgPHAgc3R5bGU9XCJmb250LXNpemU6IDM2cHg7XCIgaWQ9XCJmaW5hbFNjb3JlXCI+U2NvcmU6IDA8L3A+XG4gICAgICAgIDxwIHN0eWxlPVwiZm9udC1zaXplOiAyNHB4O1wiPlByZXNzIFNQQUNFIHRvIFJlc3RhcnQ8L3A+XG4gICAgYDtcbiAgYm9keS5hcHBlbmRDaGlsZChnYW1lT3ZlclNjcmVlbik7XG4gIGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbiA9IGdhbWVPdmVyU2NyZWVuO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVHYW1lV29ybGQoKTogdm9pZCB7XG4gIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLmNhbnZhcykgcmV0dXJuO1xuXG4gIC8vIFRocmVlLmpzIHNldHVwXG4gIGdhbWUuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcbiAgZ2FtZS5zY2VuZS5iYWNrZ3JvdW5kID0gbmV3IFRIUkVFLkNvbG9yKGdhbWUuZGF0YS5jb2xvcnMuYmFja2dyb3VuZCk7XG5cbiAgZ2FtZS5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoXG4gICAgZ2FtZS5kYXRhLmNhbWVyYUZPVixcbiAgICBnYW1lLmRhdGEuY2FudmFzV2lkdGggLyBnYW1lLmRhdGEuY2FudmFzSGVpZ2h0LFxuICAgIGdhbWUuZGF0YS5jYW1lcmFOZWFyLFxuICAgIGdhbWUuZGF0YS5jYW1lcmFGYXJcbiAgKTtcbiAgZ2FtZS5jYW1lcmEucG9zaXRpb24uc2V0KFxuICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi54LFxuICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi55LFxuICAgIGdhbWUuZGF0YS5jYW1lcmFQb3NpdGlvbi56XG4gICk7XG4gIC8vIGdhbWUuY2FtZXJhLmxvb2tBdCgwLCAwLCAwKTsgLy8gT3JiaXRDb250cm9sc1x1QUMwMCBcdUNFNzRcdUJBNTRcdUI3N0MgXHVCQzI5XHVENUE1XHVDNzQ0IFx1QzgxQ1x1QzVCNFx1RDU1OFx1QkJDMFx1Qjg1QyBcdUM4RkNcdUMxMUQgXHVDQzk4XHVCOUFDXG5cbiAgZ2FtZS5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHtcbiAgICBjYW52YXM6IGdhbWUuY2FudmFzLFxuICAgIGFudGlhbGlhczogdHJ1ZSxcbiAgfSk7XG4gIGdhbWUucmVuZGVyZXIuc2V0U2l6ZShnYW1lLmRhdGEuY2FudmFzV2lkdGgsIGdhbWUuZGF0YS5jYW52YXNIZWlnaHQpO1xuICBnYW1lLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgaWYgZGVzaXJlZFxuXG4gIC8vIE9yYml0Q29udHJvbHMgXHVDMTI0XHVDODE1XG4gIGdhbWUuY29udHJvbHMgPSBuZXcgT3JiaXRDb250cm9scyhnYW1lLmNhbWVyYSwgZ2FtZS5yZW5kZXJlci5kb21FbGVtZW50KTtcbiAgZ2FtZS5jb250cm9scy5lbmFibGVEYW1waW5nID0gdHJ1ZTsgLy8gXHVDRTc0XHVCQTU0XHVCNzdDIFx1QzZDMFx1QzlDMVx1Qzc4NFx1Qzc0NCBcdUJEODBcdUI0RENcdUI3RkRcdUFDOEMgKFx1QzYyNFx1RDBDMCBcdUMyMThcdUM4MTU6IGVuYWJsZUREYW1waW5nIC0+IGVuYWJsZURhbXBpbmcpXG4gIGdhbWUuY29udHJvbHMuZGFtcGluZ0ZhY3RvciA9IDAuMDU7XG4gIGdhbWUuY29udHJvbHMuc2NyZWVuU3BhY2VQYW5uaW5nID0gZmFsc2U7IC8vIFx1RDMyQyBcdUFFMzBcdUIyQTUgXHVDMkRDIFx1Q0U3NFx1QkE1NFx1Qjc3Q1x1QUMwMCBcdUJDMTRcdUIyRTVcdUM3NDQgXHVCNkFCXHVBQ0UwIFx1QjBCNFx1QjgyNFx1QUMwMFx1QzlDMCBcdUM1NEFcdUIzQzRcdUI4NURcbiAgZ2FtZS5jb250cm9scy5taW5EaXN0YW5jZSA9IDU7IC8vIFx1Q0Q1Q1x1QzE4QyBcdUM5MEMgXHVDNTQ0XHVDNkMzIFx1QUM3MFx1QjlBQ1xuICBnYW1lLmNvbnRyb2xzLm1heERpc3RhbmNlID0gNTA7IC8vIFx1Q0Q1Q1x1QjMwMCBcdUM5MEMgXHVDNzc4IFx1QUM3MFx1QjlBQ1xuICBnYW1lLmNvbnRyb2xzLnRhcmdldC5zZXQoMCwgMCwgMCk7IC8vIFx1Q0U3NFx1QkE1NFx1Qjc3Q1x1QUMwMCBcdUFDOENcdUM3ODQgXHVDMTM4XHVBQ0M0XHVDNzU4IFx1QzkxMVx1QzU1OVx1Qzc0NCBcdUJDMTRcdUI3N0NcdUJDRjRcdUIzQzRcdUI4NUQgXHVDMTI0XHVDODE1XG4gIGdhbWUuY29udHJvbHMuZW5hYmxlZCA9IGZhbHNlOyAvLyBcdUFDOENcdUM3ODQgXHVDMkRDXHVDNzkxIFx1QzgwNFx1QzVEMFx1QjI5NCBcdUNFRThcdUQyQjhcdUI4NjQgXHVCRTQ0XHVENjVDXHVDMTMxXHVENjU0XG4gIGdhbWUuY29udHJvbHMudXBkYXRlKCk7IC8vIFx1Q0QwOFx1QUUzMCBcdUMxMjRcdUM4MTUgXHVDODAxXHVDNkE5XG5cbiAgLy8gTGlnaHRzXG4gIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDApOyAvLyBzb2Z0IHdoaXRlIGxpZ2h0XG4gIGdhbWUuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XG4gIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMSk7XG4gIGRpcmVjdGlvbmFsTGlnaHQucG9zaXRpb24uc2V0KFxuICAgIGdhbWUuZGF0YS5saWdodFBvc2l0aW9uLngsXG4gICAgZ2FtZS5kYXRhLmxpZ2h0UG9zaXRpb24ueSxcbiAgICBnYW1lLmRhdGEubGlnaHRQb3NpdGlvbi56XG4gICk7XG4gIGRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7XG4gIGdhbWUuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xuXG4gIC8vIENhbm5vbi5qcyBzZXR1cFxuICBnYW1lLmNhbm5vbldvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xuICBnYW1lLmNhbm5vbldvcmxkLmdyYXZpdHkuc2V0KDAsIDAsIDApOyAvLyBObyBncmF2aXR5IGZvciBhIHNuYWtlIGdhbWVcbiAgZ2FtZS5jYW5ub25Xb3JsZC5kZWZhdWx0Q29udGFjdE1hdGVyaWFsLmZyaWN0aW9uID0gMDtcbiAgZ2FtZS5jYW5ub25Xb3JsZC5kZWZhdWx0Q29udGFjdE1hdGVyaWFsLnJlc3RpdHV0aW9uID0gMDtcblxuICAvLyBDcmVhdGUgd2FsbHMgKGJvdW5kYXJpZXMpXG4gIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwOyAvLyBBc3N1bWluZyBhIDIweDIwIHBsYXlhYmxlIGdyaWRcbiAgY29uc3QgaGFsZldvcmxkU2l6ZSA9IHdvcmxkU2l6ZSAvIDI7XG4gIGNvbnN0IHdhbGxUaGlja25lc3MgPSBnYW1lLmRhdGEud2FsbFRoaWNrbmVzcztcbiAgY29uc3Qgd2FsbEhlaWdodCA9IGdhbWUuZGF0YS5ncmlkU2l6ZTsgLy8gV2FsbHMgYXJlIGFzIHRhbGwgYXMgYSBzbmFrZSBzZWdtZW50XG5cbiAgLy8gTWF0ZXJpYWwgZm9yIHdhbGxzXG4gIGNvbnN0IHdhbGxUZXh0dXJlID0gZ2FtZS5hc3NldHMudGV4dHVyZXNbXCJ3YWxsX3RleHR1cmVcIl07XG4gIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICBtYXA6IHdhbGxUZXh0dXJlIGluc3RhbmNlb2YgVEhSRUUuVGV4dHVyZSA/IHdhbGxUZXh0dXJlIDogdW5kZWZpbmVkLFxuICAgIGNvbG9yOiB3YWxsVGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gd2FsbFRleHR1cmUgOiB1bmRlZmluZWQsXG4gIH0pO1xuXG4gIC8vIEZyb250IHdhbGwgKCtaKVxuICBjcmVhdGVXYWxsKFxuICAgIDAsXG4gICAgMCxcbiAgICAtaGFsZldvcmxkU2l6ZSAtIHdhbGxUaGlja25lc3MgLyAyLFxuICAgIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLFxuICAgIHdhbGxIZWlnaHQsXG4gICAgd2FsbFRoaWNrbmVzcyxcbiAgICB3YWxsTWF0ZXJpYWwsXG4gICAgXCJ3YWxsX3pfbmVnXCJcbiAgKTtcbiAgLy8gQmFjayB3YWxsICgtWilcbiAgY3JlYXRlV2FsbChcbiAgICAwLFxuICAgIDAsXG4gICAgaGFsZldvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgLyAyLFxuICAgIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLFxuICAgIHdhbGxIZWlnaHQsXG4gICAgd2FsbFRoaWNrbmVzcyxcbiAgICB3YWxsTWF0ZXJpYWwsXG4gICAgXCJ3YWxsX3pfcG9zXCJcbiAgKTtcbiAgLy8gTGVmdCB3YWxsICgtWClcbiAgY3JlYXRlV2FsbChcbiAgICAtaGFsZldvcmxkU2l6ZSAtIHdhbGxUaGlja25lc3MgLyAyLFxuICAgIDAsXG4gICAgMCxcbiAgICB3YWxsVGhpY2tuZXNzLFxuICAgIHdhbGxIZWlnaHQsXG4gICAgd29ybGRTaXplICsgd2FsbFRoaWNrbmVzcyAqIDIsXG4gICAgd2FsbE1hdGVyaWFsLFxuICAgIFwid2FsbF94X25lZ1wiXG4gICk7XG4gIC8vIFJpZ2h0IHdhbGwgKCtYKVxuICBjcmVhdGVXYWxsKFxuICAgIGhhbGZXb3JsZFNpemUgKyB3YWxsVGhpY2tuZXNzIC8gMixcbiAgICAwLFxuICAgIDAsXG4gICAgd2FsbFRoaWNrbmVzcyxcbiAgICB3YWxsSGVpZ2h0LFxuICAgIHdvcmxkU2l6ZSArIHdhbGxUaGlja25lc3MgKiAyLFxuICAgIHdhbGxNYXRlcmlhbCxcbiAgICBcIndhbGxfeF9wb3NcIlxuICApO1xuXG4gIC8vIEluaXRpYWwgc2V0dXAgZm9yIHRoZSBnYW1lIHN0YXRlIChiZWZvcmUgc3RhcnRpbmcpXG4gIGdhbWUubW92ZUludGVydmFsID0gMTAwMCAvIGdhbWUuZGF0YS5zbmFrZVNwZWVkO1xuICBnYW1lLmRpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKDEsIDAsIDApO1xuICBnYW1lLm5leHREaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlV2FsbChcbiAgeDogbnVtYmVyLFxuICB5OiBudW1iZXIsXG4gIHo6IG51bWJlcixcbiAgd2lkdGg6IG51bWJlcixcbiAgaGVpZ2h0OiBudW1iZXIsXG4gIGRlcHRoOiBudW1iZXIsXG4gIG1hdGVyaWFsOiBUSFJFRS5NYXRlcmlhbCxcbiAgbmFtZTogc3RyaW5nXG4pOiB2b2lkIHtcbiAgaWYgKCFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSByZXR1cm47XG5cbiAgY29uc3Qgd2FsbEdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHdpZHRoLCBoZWlnaHQsIGRlcHRoKTtcbiAgY29uc3Qgd2FsbE1lc2ggPSBuZXcgVEhSRUUuTWVzaCh3YWxsR2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgd2FsbE1lc2gucG9zaXRpb24uc2V0KHgsIHksIHopO1xuICB3YWxsTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcbiAgZ2FtZS5zY2VuZS5hZGQod2FsbE1lc2gpO1xuXG4gIGNvbnN0IHdhbGxTaGFwZSA9IG5ldyBDQU5OT04uQm94KFxuICAgIG5ldyBDQU5OT04uVmVjMyh3aWR0aCAvIDIsIGhlaWdodCAvIDIsIGRlcHRoIC8gMilcbiAgKTtcbiAgY29uc3Qgd2FsbEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwIH0pOyAvLyBNYXNzIDAgbWFrZXMgaXQgc3RhdGljXG4gIHdhbGxCb2R5LmFkZFNoYXBlKHdhbGxTaGFwZSk7XG4gIHdhbGxCb2R5LnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcbiAgZ2FtZS5jYW5ub25Xb3JsZC5hZGRCb2R5KHdhbGxCb2R5KTtcbiAgZ2FtZS53YWxsQm9kaWVzLnB1c2god2FsbEJvZHkpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTbmFrZVNlZ21lbnQoXG4gIHBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzLFxuICBpc0hlYWQ6IGJvb2xlYW5cbik6IHsgbWVzaDogVEhSRUUuTWVzaDsgYm9keTogQ0FOTk9OLkJvZHkgfSB7XG4gIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiR2FtZSBub3QgaW5pdGlhbGl6ZWQgZm9yIGNyZWF0aW5nIHNuYWtlIHNlZ21lbnRzLlwiKTtcbiAgfVxuXG4gIGNvbnN0IHNpemUgPSBnYW1lLmRhdGEuZ3JpZFNpemU7XG4gIGNvbnN0IHRleHR1cmUgPSBpc0hlYWRcbiAgICA/IGdhbWUuYXNzZXRzLnRleHR1cmVzW1wic25ha2VfaGVhZFwiXVxuICAgIDogZ2FtZS5hc3NldHMudGV4dHVyZXNbXCJzbmFrZV9ib2R5XCJdO1xuICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcbiAgICBtYXA6IHRleHR1cmUgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlID8gdGV4dHVyZSA6IHVuZGVmaW5lZCxcbiAgICBjb2xvcjogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLkNvbG9yID8gdGV4dHVyZSA6IHVuZGVmaW5lZCxcbiAgfSk7XG4gIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHNpemUsIHNpemUsIHNpemUpO1xuICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcbiAgbWVzaC5wb3NpdGlvbi5jb3B5KHBvc2l0aW9uKTtcbiAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcbiAgZ2FtZS5zY2VuZS5hZGQobWVzaCk7XG5cbiAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoc2l6ZSAvIDIsIHNpemUgLyAyLCBzaXplIC8gMikpO1xuICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMSB9KTsgLy8gR2l2ZSBpdCBhIG1hc3MsIGJ1dCB3ZSdsbCBjb250cm9sIGl0cyBwb3NpdGlvblxuICBib2R5LmFkZFNoYXBlKHNoYXBlKTtcbiAgYm9keS5wb3NpdGlvbi5jb3B5KG5ldyBDQU5OT04uVmVjMyhwb3NpdGlvbi54LCBwb3NpdGlvbi55LCBwb3NpdGlvbi56KSk7XG4gIGdhbWUuY2Fubm9uV29ybGQuYWRkQm9keShib2R5KTtcblxuICByZXR1cm4geyBtZXNoLCBib2R5IH07XG59XG5cbi8vIFx1QjJFOFx1Qzc3QyBcdUJBMzlcdUM3NzRcdUI5N0MgXHVDMEREXHVDMTMxXHVENTU4XHVBQ0UwIGdhbWUuZm9vZCBcdUJDMzBcdUM1RjRcdUM1RDAgXHVDRDk0XHVBQzAwXHVENTU4XHVCMjk0IFx1RDU2OFx1QzIxOFxuZnVuY3Rpb24gYWRkRm9vZEl0ZW0oKTogdm9pZCB7XG4gIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiR2FtZSBub3QgaW5pdGlhbGl6ZWQgZm9yIGFkZGluZyBmb29kLlwiKTtcbiAgfVxuXG4gIGNvbnN0IHNpemUgPSBnYW1lLmRhdGEuZ3JpZFNpemU7XG4gIGxldCBmb29kUG9zaXRpb246IFRIUkVFLlZlY3RvcjM7XG4gIGxldCBjb2xsaXNpb25EZXRlY3RlZDogYm9vbGVhbjtcblxuICBkbyB7XG4gICAgY29sbGlzaW9uRGV0ZWN0ZWQgPSBmYWxzZTtcbiAgICAvLyBHZW5lcmF0ZSByYW5kb20gZ3JpZCBwb3NpdGlvbiB3aXRoaW4gYm91bmRzXG4gICAgY29uc3QgbnVtQ2VsbHMgPSAyMDsgLy8gQXNzdW1pbmcgMjB4MjAgZ3JpZFxuICAgIGNvbnN0IHJhbmRYID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbnVtQ2VsbHMpIC0gbnVtQ2VsbHMgLyAyO1xuICAgIGNvbnN0IHJhbmRaID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogbnVtQ2VsbHMpIC0gbnVtQ2VsbHMgLyAyO1xuXG4gICAgZm9vZFBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoXG4gICAgICByYW5kWCAqIHNpemUgKyBzaXplIC8gMiwgLy8gQ2VudGVyIG9mIHRoZSBncmlkIGNlbGxcbiAgICAgIDAsIC8vIEZvb2QgYXQgeT0wLCBzYW1lIGxldmVsIGFzIHNuYWtlXG4gICAgICByYW5kWiAqIHNpemUgKyBzaXplIC8gMlxuICAgICk7XG5cbiAgICAvLyBDaGVjayBmb3IgY29sbGlzaW9uIHdpdGggc25ha2VcbiAgICBmb3IgKGNvbnN0IHNlZ21lbnQgb2YgZ2FtZS5zbmFrZSkge1xuICAgICAgaWYgKHNlZ21lbnQubWVzaC5wb3NpdGlvbi5kaXN0YW5jZVRvKGZvb2RQb3NpdGlvbikgPCBzaXplICogMC45KSB7XG4gICAgICAgIGNvbGxpc2lvbkRldGVjdGVkID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChjb2xsaXNpb25EZXRlY3RlZCkgY29udGludWU7XG5cbiAgICAvLyBDaGVjayBmb3IgY29sbGlzaW9uIHdpdGggb3RoZXIgZXhpc3RpbmcgZm9vZCBpdGVtc1xuICAgIGZvciAoY29uc3QgZXhpc3RpbmdGb29kIG9mIGdhbWUuZm9vZCkge1xuICAgICAgICBpZiAoZXhpc3RpbmdGb29kLm1lc2gucG9zaXRpb24uZGlzdGFuY2VUbyhmb29kUG9zaXRpb24pIDwgc2l6ZSAqIDAuOSkge1xuICAgICAgICAgICAgY29sbGlzaW9uRGV0ZWN0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgfSB3aGlsZSAoY29sbGlzaW9uRGV0ZWN0ZWQpO1xuXG4gIGNvbnN0IHRleHR1cmUgPSBnYW1lLmFzc2V0cy50ZXh0dXJlc1tcImZvb2RcIl07XG4gIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xuICAgIG1hcDogdGV4dHVyZSBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUgPyB0ZXh0dXJlIDogdW5kZWZpbmVkLFxuICAgIGNvbG9yOiB0ZXh0dXJlIGluc3RhbmNlb2YgVEhSRUUuQ29sb3IgPyB0ZXh0dXJlIDogdW5kZWZpbmVkLFxuICB9KTtcbiAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoc2l6ZSAvIDIsIDE2LCAxNik7IC8vIEZvb2QgaXMgYSBzcGhlcmVcbiAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XG4gIG1lc2gucG9zaXRpb24uY29weShmb29kUG9zaXRpb24pO1xuICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xuICBnYW1lLnNjZW5lLmFkZChtZXNoKTtcblxuICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uU3BoZXJlKHNpemUgLyAyKTtcbiAgY29uc3QgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAuMSB9KTsgLy8gU21hbGwgbWFzcyBzbyBpdCBjYW4gYmUgJ2VhdGVuJ1xuICBib2R5LmFkZFNoYXBlKHNoYXBlKTtcbiAgYm9keS5wb3NpdGlvbi5jb3B5KFxuICAgIG5ldyBDQU5OT04uVmVjMyhmb29kUG9zaXRpb24ueCwgZm9vZFBvc2l0aW9uLnksIGZvb2RQb3NpdGlvbi56KVxuICApO1xuICBnYW1lLmNhbm5vbldvcmxkLmFkZEJvZHkoYm9keSk7XG5cbiAgZ2FtZS5mb29kLnB1c2goeyBtZXNoLCBib2R5IH0pOyAvLyBcdUJDMzBcdUM1RjRcdUM1RDAgXHVDRDk0XHVBQzAwXG59XG5cbi8vIFx1QkFBOFx1QjRFMCBcdUJBMzlcdUM3NzQgXHVDNTQ0XHVDNzc0XHVEMTVDXHVDNzQ0IFx1QzgxQ1x1QUM3MFx1RDU1OFx1QjI5NCBcdUQ1NjhcdUMyMThcbmZ1bmN0aW9uIGNsZWFyQWxsRm9vZCgpOiB2b2lkIHtcbiAgZ2FtZS5mb29kLmZvckVhY2goZiA9PiB7XG4gICAgZ2FtZS5zY2VuZT8ucmVtb3ZlKGYubWVzaCk7XG4gICAgZi5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAoZi5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZD8ucmVtb3ZlQm9keShmLmJvZHkpO1xuICB9KTtcbiAgZ2FtZS5mb29kID0gW107IC8vIFx1QkMzMFx1QzVGNCBcdUNEMDhcdUFFMzBcdUQ2NTRcbn1cblxuZnVuY3Rpb24gcGxheVNvdW5kKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICBjb25zdCBzb3VuZCA9IGdhbWUuYXNzZXRzLnNvdW5kc1tuYW1lXTtcbiAgaWYgKHNvdW5kKSB7XG4gICAgc291bmQuY3VycmVudFRpbWUgPSAwOyAvLyBSZXdpbmQgdG8gc3RhcnQgaWYgYWxyZWFkeSBwbGF5aW5nXG4gICAgc291bmQucGxheSgpLmNhdGNoKChlKSA9PiBjb25zb2xlLndhcm4oYEZhaWxlZCB0byBwbGF5IHNvdW5kICR7bmFtZX06YCwgZSkpOyAvLyBDYXRjaCBwcm9taXNlIHJlamVjdGlvblxuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7bmFtZX0nIG5vdCBmb3VuZC5gKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVTY29yZVVJKCk6IHZvaWQge1xuICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSkge1xuICAgIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuaW5uZXJUZXh0ID0gYFNjb3JlOiAke2dhbWUuc2NvcmV9YDtcbiAgfVxufVxuXG5mdW5jdGlvbiByZXNldEdhbWUoKTogdm9pZCB7XG4gIGlmICghZ2FtZS5kYXRhIHx8ICFnYW1lLnNjZW5lIHx8ICFnYW1lLmNhbm5vbldvcmxkKSByZXR1cm47XG5cbiAgLy8gQ2xlYXIgZXhpc3Rpbmcgc25ha2UgYW5kIGZvb2RcbiAgZ2FtZS5zbmFrZS5mb3JFYWNoKChzZWdtZW50KSA9PiB7XG4gICAgZ2FtZS5zY2VuZT8ucmVtb3ZlKHNlZ21lbnQubWVzaCk7XG4gICAgc2VnbWVudC5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAoc2VnbWVudC5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XG4gICAgZ2FtZS5jYW5ub25Xb3JsZD8ucmVtb3ZlQm9keShzZWdtZW50LmJvZHkpO1xuICB9KTtcbiAgZ2FtZS5zbmFrZSA9IFtdO1xuXG4gIGNsZWFyQWxsRm9vZCgpOyAvLyBcdUJBQThcdUI0RTAgXHVCQTM5XHVDNzc0IFx1QzgxQ1x1QUM3MFxuXG4gIC8vIEluaXRpYWwgc25ha2UgcG9zaXRpb24gKGUuZy4sIGNlbnRlciBvZiB0aGUgcGxheWFibGUgYXJlYSlcbiAgY29uc3QgaW5pdGlhbFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIDApO1xuXG4gIC8vIENyZWF0ZSBpbml0aWFsIHNuYWtlIHNlZ21lbnRzXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZ2FtZS5kYXRhLmluaXRpYWxTbmFrZUxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3Qgc2VnbWVudFBvcyA9IG5ldyBUSFJFRS5WZWN0b3IzKFxuICAgICAgaW5pdGlhbFBvcy54IC0gaSAqIGdhbWUuZGF0YS5ncmlkU2l6ZSxcbiAgICAgIGluaXRpYWxQb3MueSxcbiAgICAgIGluaXRpYWxQb3MuelxuICAgICk7XG4gICAgZ2FtZS5zbmFrZS5wdXNoKGNyZWF0ZVNuYWtlU2VnbWVudChzZWdtZW50UG9zLCBpID09PSAwKSk7XG4gIH1cblxuICBnYW1lLmRpcmVjdGlvbi5zZXQoMSwgMCwgMCk7IC8vIFJlc2V0IHRvIG1vdmluZyByaWdodCAoRWFzdClcbiAgZ2FtZS5uZXh0RGlyZWN0aW9uLnNldCgxLCAwLCAwKTtcbiAgZ2FtZS5zY29yZSA9IDA7XG4gIHVwZGF0ZVNjb3JlVUkoKTtcbiAgXG4gIC8vIFx1QjM3MFx1Qzc3NFx1RDEzMFx1QzVEMCBcdUMxMjRcdUM4MTVcdUI0MUMgXHVBQzFDXHVDMjE4XHVCOUNDXHVEMDdDIFx1QkEzOVx1Qzc3NCBcdUMwRERcdUMxMzFcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBnYW1lLmRhdGEubnVtYmVyT2ZGb29kSXRlbXM7IGkrKykge1xuICAgICAgYWRkRm9vZEl0ZW0oKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydEdhbWUoKTogdm9pZCB7XG4gIGlmICghZ2FtZS5kYXRhKSByZXR1cm47XG5cbiAgZ2FtZS5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcbiAgaWYgKGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbilcbiAgICBnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICBpZiAoZ2FtZS51aUVsZW1lbnRzLmdhbWVPdmVyU2NyZWVuKVxuICAgIGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIGlmIChnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5KVxuICAgIGdhbWUudWlFbGVtZW50cy5zY29yZURpc3BsYXkuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcblxuICByZXNldEdhbWUoKTtcbiAgaWYgKGdhbWUuYXNzZXRzLnNvdW5kc1tcImJnbVwiXSAmJiAhZ2FtZS5iZ20pIHtcbiAgICBnYW1lLmJnbSA9IGdhbWUuYXNzZXRzLnNvdW5kc1tcImJnbVwiXTtcbiAgICBnYW1lLmJnbS5sb29wID0gdHJ1ZTtcbiAgICBnYW1lLmJnbS5wbGF5KCkuY2F0Y2goKGUpID0+IGNvbnNvbGUud2FybihcIkZhaWxlZCB0byBwbGF5IEJHTTpcIiwgZSkpO1xuICB9IGVsc2UgaWYgKGdhbWUuYmdtKSB7XG4gICAgZ2FtZS5iZ20ucGxheSgpLmNhdGNoKChlKSA9PiBjb25zb2xlLndhcm4oXCJGYWlsZWQgdG8gcGxheSBCR006XCIsIGUpKTtcbiAgfVxuXG4gIHBsYXlTb3VuZChcInN0YXJ0X2dhbWVcIik7XG4gIGlmIChnYW1lLmNvbnRyb2xzKSB7XG4gICAgZ2FtZS5jb250cm9scy5lbmFibGVkID0gdHJ1ZTsgLy8gXHVBQzhDXHVDNzg0IFx1QzJEQ1x1Qzc5MSBcdUMyREMgT3JiaXRDb250cm9scyBcdUQ2NUNcdUMxMzFcdUQ2NTRcbiAgfVxufVxuXG5mdW5jdGlvbiBnYW1lT3ZlcigpOiB2b2lkIHtcbiAgZ2FtZS5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuR0FNRV9PVkVSO1xuICBpZiAoZ2FtZS5iZ20pIHtcbiAgICBnYW1lLmJnbS5wYXVzZSgpO1xuICB9XG4gIHBsYXlTb3VuZChcImdhbWVfb3ZlclwiKTtcblxuICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSlcbiAgICBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbilcbiAgICBnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4uc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICBjb25zdCBmaW5hbFNjb3JlRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZmluYWxTY29yZVwiKTtcbiAgaWYgKGZpbmFsU2NvcmVFbGVtZW50KSB7XG4gICAgZmluYWxTY29yZUVsZW1lbnQuaW5uZXJUZXh0ID0gYFNjb3JlOiAke2dhbWUuc2NvcmV9YDtcbiAgfVxuICBpZiAoZ2FtZS5jb250cm9scykge1xuICAgIGdhbWUuY29udHJvbHMuZW5hYmxlZCA9IGZhbHNlOyAvLyBcdUFDOENcdUM3ODQgXHVDNjI0XHVCQzg0IFx1QzJEQyBPcmJpdENvbnRyb2xzIFx1QkU0NFx1RDY1Q1x1QzEzMVx1RDY1NFxuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZUlucHV0KGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG4gIGlmICghZ2FtZS5kYXRhKSByZXR1cm47XG5cbiAgY29uc3QgY3VycmVudERpciA9IGdhbWUuZGlyZWN0aW9uO1xuICBsZXQgbmV3RGlyID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcblxuICBzd2l0Y2ggKGV2ZW50LmtleSkge1xuICAgIGNhc2UgXCJBcnJvd1VwXCI6XG4gICAgICBuZXdEaXIuc2V0KDAsIDAsIC0xKTsgLy8gTW92ZSBOb3J0aCAobmVnYXRpdmUgWilcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCJBcnJvd0Rvd25cIjpcbiAgICAgIG5ld0Rpci5zZXQoMCwgMCwgMSk7IC8vIE1vdmUgU291dGggKHBvc2l0aXZlIFopXG4gICAgICBicmVhaztcbiAgICBjYXNlIFwiQXJyb3dMZWZ0XCI6XG4gICAgICBuZXdEaXIuc2V0KC0xLCAwLCAwKTsgLy8gTW92ZSBXZXN0IChuZWdhdGl2ZSBYKVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBcIkFycm93UmlnaHRcIjpcbiAgICAgIG5ld0Rpci5zZXQoMSwgMCwgMCk7IC8vIE1vdmUgRWFzdCAocG9zaXRpdmUgWClcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgXCIgXCI6IC8vIFNwYWNlIGtleVxuICAgICAgaWYgKFxuICAgICAgICBnYW1lLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8XG4gICAgICAgIGdhbWUuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSXG4gICAgICApIHtcbiAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTsgLy8gUHJldmVudCBzY3JvbGxpbmdcbiAgICAgICAgc3RhcnRHYW1lKCk7XG4gICAgICB9XG4gICAgICByZXR1cm47IC8vIERvbid0IHByb2Nlc3Mgc3BhY2UgYXMgYSBkaXJlY3Rpb24gY2hhbmdlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFByZXZlbnQgaW1tZWRpYXRlIHJldmVyc2UgKGUuZy4sIHRyeWluZyB0byBnbyBsZWZ0IHdoZW4gY3VycmVudGx5IGdvaW5nIHJpZ2h0KVxuICAvLyBDaGVjayBpZiBuZXdEaXIgaXMgbm90IG9wcG9zaXRlIHRvIGN1cnJlbnREaXJcbiAgaWYgKCFuZXdEaXIuZXF1YWxzKGN1cnJlbnREaXIuY2xvbmUoKS5uZWdhdGUoKSkpIHtcbiAgICBnYW1lLm5leHREaXJlY3Rpb24uY29weShuZXdEaXIpO1xuICB9XG59XG5cbi8vIC0tLSBHYW1lIExvb3AgLS0tXG5cbmZ1bmN0aW9uIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xuICBpZiAoIWdhbWUuZGF0YSB8fCBnYW1lLmdhbWVTdGF0ZSAhPT0gR2FtZVN0YXRlLlBMQVlJTkcpIHJldHVybjtcblxuICBnYW1lLnRpbWVTaW5jZUxhc3RNb3ZlICs9IGRlbHRhVGltZTtcblxuICBpZiAoZ2FtZS50aW1lU2luY2VMYXN0TW92ZSA+PSBnYW1lLm1vdmVJbnRlcnZhbCAvIDEwMDApIHtcbiAgICAvLyBDb252ZXJ0IG1vdmVJbnRlcnZhbCB0byBzZWNvbmRzXG4gICAgZ2FtZS50aW1lU2luY2VMYXN0TW92ZSAtPSBnYW1lLm1vdmVJbnRlcnZhbCAvIDEwMDA7XG5cbiAgICBnYW1lLmRpcmVjdGlvbi5jb3B5KGdhbWUubmV4dERpcmVjdGlvbik7IC8vIEFwcGx5IGJ1ZmZlcmVkIGRpcmVjdGlvblxuXG4gICAgLy8gXHVDNzc0XHVCM0Q5XHVENTU4XHVBRTMwIFx1QzgwNCBcdUFGMkNcdUI5QUMgXHVDNzA0XHVDRTU4IFx1QzgwMFx1QzdBNSAoXHVDMEM4XHVCODVDXHVDNkI0IFx1QzEzOFx1QURGOFx1QkEzQ1x1RDJCOFx1Qjk3QyBcdUNEOTRcdUFDMDBcdUQ1NjAgXHVDNzA0XHVDRTU4KVxuICAgIGNvbnN0IHRhaWxQcmV2aW91c1Bvc2l0aW9uID0gZ2FtZS5zbmFrZVtnYW1lLnNuYWtlLmxlbmd0aCAtIDFdLm1lc2gucG9zaXRpb24uY2xvbmUoKTtcblxuICAgIC8vIENhbGN1bGF0ZSBuZXcgaGVhZCBwb3NpdGlvblxuICAgIGNvbnN0IGhlYWQgPSBnYW1lLnNuYWtlWzBdO1xuICAgIGNvbnN0IG5ld0hlYWRQb3NpdGlvbiA9IGhlYWQubWVzaC5wb3NpdGlvblxuICAgICAgLmNsb25lKClcbiAgICAgIC5hZGQoZ2FtZS5kaXJlY3Rpb24uY2xvbmUoKS5tdWx0aXBseVNjYWxhcihnYW1lLmRhdGEuZ3JpZFNpemUpKTtcblxuICAgIC8vIC0tLSBDb2xsaXNpb24gRGV0ZWN0aW9uIC0tLVxuICAgIGNvbnN0IHdvcmxkU2l6ZSA9IGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDIwO1xuICAgIGNvbnN0IGhhbGZXb3JsZFNpemUgPSB3b3JsZFNpemUgLyAyO1xuICAgIGNvbnN0IG1heENvb3JkID0gaGFsZldvcmxkU2l6ZSAtIGdhbWUuZGF0YS5ncmlkU2l6ZSAvIDI7XG4gICAgY29uc3QgbWluQ29vcmQgPSAtaGFsZldvcmxkU2l6ZSArIGdhbWUuZGF0YS5ncmlkU2l6ZSAvIDI7XG5cbiAgICAvLyBXYWxsIGNvbGxpc2lvblxuICAgIC8vIENoZWNrIGlmIG5ld0hlYWRQb3NpdGlvbiBpcyBvdXRzaWRlIHRoZSBwbGF5IGFyZWEgZGVmaW5lZCBieSBtaW4vbWF4Q29vcmRcbiAgICBpZiAoXG4gICAgICBuZXdIZWFkUG9zaXRpb24ueCA+IG1heENvb3JkIHx8XG4gICAgICBuZXdIZWFkUG9zaXRpb24ueCA8IG1pbkNvb3JkIHx8XG4gICAgICBuZXdIZWFkUG9zaXRpb24ueiA+IG1heENvb3JkIHx8XG4gICAgICBuZXdIZWFkUG9zaXRpb24ueiA8IG1pbkNvb3JkXG4gICAgKSB7XG4gICAgICBnYW1lT3ZlcigpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNlbGYtY29sbGlzaW9uIChjaGVjayBuZXcgaGVhZCBwb3NpdGlvbiBhZ2FpbnN0IGFsbCBib2R5IHNlZ21lbnRzIGV4Y2VwdCB0aGUgY3VycmVudCBoZWFkKVxuICAgIGZvciAobGV0IGkgPSAxOyBpIDwgZ2FtZS5zbmFrZS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKFxuICAgICAgICBuZXdIZWFkUG9zaXRpb24uZGlzdGFuY2VUbyhnYW1lLnNuYWtlW2ldLm1lc2gucG9zaXRpb24pIDxcbiAgICAgICAgZ2FtZS5kYXRhLmdyaWRTaXplICogMC45XG4gICAgICApIHtcbiAgICAgICAgLy8gQ2hlY2sgaWYgcG9zaXRpb25zIGFyZSB2ZXJ5IGNsb3NlXG4gICAgICAgIGdhbWVPdmVyKCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBNb3ZlIHNuYWtlOiBIZWFkIG1vdmVzIHRvIG5ldyBwb3NpdGlvbiwgYm9keSBzZWdtZW50cyBmb2xsb3dcbiAgICBmb3IgKGxldCBpID0gZ2FtZS5zbmFrZS5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICBnYW1lLnNuYWtlW2ldLm1lc2gucG9zaXRpb24uY29weShnYW1lLnNuYWtlW2kgLSAxXS5tZXNoLnBvc2l0aW9uKTtcbiAgICAgIGdhbWUuc25ha2VbaV0uYm9keS5wb3NpdGlvbi5jb3B5KFxuICAgICAgICBuZXcgQ0FOTk9OLlZlYzMoXG4gICAgICAgICAgZ2FtZS5zbmFrZVtpIC0gMV0ubWVzaC5wb3NpdGlvbi54LFxuICAgICAgICAgIGdhbWUuc25ha2VbaSAtIDFdLm1lc2gucG9zaXRpb24ueSxcbiAgICAgICAgICBnYW1lLnNuYWtlW2kgLSAxXS5tZXNoLnBvc2l0aW9uLnpcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICB9XG4gICAgaGVhZC5tZXNoLnBvc2l0aW9uLmNvcHkobmV3SGVhZFBvc2l0aW9uKTtcbiAgICBoZWFkLmJvZHkucG9zaXRpb24uY29weShcbiAgICAgIG5ldyBDQU5OT04uVmVjMyhuZXdIZWFkUG9zaXRpb24ueCwgbmV3SGVhZFBvc2l0aW9uLnksIG5ld0hlYWRQb3NpdGlvbi56KVxuICAgICk7XG5cbiAgICAvLyBGb29kIGNvbGxpc2lvbiAtIGl0ZXJhdGUgdGhyb3VnaCBhbGwgZm9vZCBpdGVtc1xuICAgIGxldCBmb29kRWF0ZW5JbmRleDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnYW1lLmZvb2QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29uc3QgZm9vZEl0ZW0gPSBnYW1lLmZvb2RbaV07XG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIG5ld0hlYWRQb3NpdGlvbi5kaXN0YW5jZVRvKGZvb2RJdGVtLm1lc2gucG9zaXRpb24pIDxcbiAgICAgICAgICAgIGdhbWUuZGF0YS5ncmlkU2l6ZSAqIDAuOVxuICAgICAgICApIHtcbiAgICAgICAgICAgIGZvb2RFYXRlbkluZGV4ID0gaTsgLy8gXHVCQTM5XHVENzhDIFx1QkEzOVx1Qzc3NFx1Qzc1OCBcdUM3NzhcdUIzNzFcdUMyQTQgXHVDODAwXHVDN0E1XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmb29kRWF0ZW5JbmRleCAhPT0gbnVsbCkge1xuICAgICAgcGxheVNvdW5kKFwiZWF0X2Zvb2RcIik7XG4gICAgICBnYW1lLnNjb3JlKys7XG4gICAgICB1cGRhdGVTY29yZVVJKCk7XG5cbiAgICAgIC8vIFx1QkEzOVx1RDc4QyBcdUJBMzlcdUM3NzQgXHVDODFDXHVBQzcwXG4gICAgICBjb25zdCBlYXRlbkZvb2QgPSBnYW1lLmZvb2RbZm9vZEVhdGVuSW5kZXhdO1xuICAgICAgZ2FtZS5zY2VuZT8ucmVtb3ZlKGVhdGVuRm9vZC5tZXNoKTtcbiAgICAgIGVhdGVuRm9vZC5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcbiAgICAgIChlYXRlbkZvb2QubWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCkuZGlzcG9zZSgpO1xuICAgICAgZ2FtZS5jYW5ub25Xb3JsZD8ucmVtb3ZlQm9keShlYXRlbkZvb2QuYm9keSk7XG4gICAgICBnYW1lLmZvb2Quc3BsaWNlKGZvb2RFYXRlbkluZGV4LCAxKTsgLy8gXHVCQzMwXHVDNUY0XHVDNUQwXHVDMTFDIFx1QzgxQ1x1QUM3MFxuXG4gICAgICAvLyBBZGQgbmV3IHNlZ21lbnQgYXQgdGhlIHByZXZpb3VzIHRhaWwgcG9zaXRpb25cbiAgICAgIGdhbWUuc25ha2UucHVzaChjcmVhdGVTbmFrZVNlZ21lbnQodGFpbFByZXZpb3VzUG9zaXRpb24sIGZhbHNlKSk7XG5cbiAgICAgIC8vIFx1QkEzOVx1RDc4QyBcdUJBMzlcdUM3NzRcdUI5N0MgXHVCMzAwXHVDQ0I0XHVENTYwIFx1QzBDOCBcdUJBMzlcdUM3NzQgXHVDMEREXHVDMTMxXG4gICAgICBhZGRGb29kSXRlbSgpO1xuICAgIH1cbiAgfVxuXG4gIC8vIFVwZGF0ZSBDYW5ub24uanMgd29ybGQgKGV2ZW4gaWYgcG9zaXRpb25zIGFyZSBtYW51YWxseSBzZXQsIHRoaXMgcHJvY2Vzc2VzIHBvdGVudGlhbCBjb250YWN0IGNhbGxiYWNrcyBpZiBhbnkgd2VyZSBzZXQgdXApXG4gIGlmIChnYW1lLmNhbm5vbldvcmxkKSB7XG4gICAgLy8gVXNlIGEgZml4ZWQgdGltZSBzdGVwIGZvciBwaHlzaWNzIHNpbXVsYXRpb24gZm9yIHN0YWJpbGl0eVxuICAgIGNvbnN0IGZpeGVkVGltZVN0ZXAgPSAxIC8gNjA7IC8vIDYwIEh6XG4gICAgZ2FtZS5jYW5ub25Xb3JsZC5zdGVwKGZpeGVkVGltZVN0ZXAsIGRlbHRhVGltZSwgMyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyKCk6IHZvaWQge1xuICBpZiAoZ2FtZS5yZW5kZXJlciAmJiBnYW1lLnNjZW5lICYmIGdhbWUuY2FtZXJhKSB7XG4gICAgZ2FtZS5yZW5kZXJlci5yZW5kZXIoZ2FtZS5zY2VuZSwgZ2FtZS5jYW1lcmEpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdhbWVMb29wKGN1cnJlbnRUaW1lOiBudW1iZXIpOiB2b2lkIHtcbiAgLy8gQ29udmVydCBkZWx0YVRpbWUgdG8gc2Vjb25kcyBmb3IgY29uc2lzdGVuY3kgd2l0aCBDYW5ub24uanMgc3RlcFxuICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSBnYW1lLmxhc3RVcGRhdGVUaW1lKSAvIDEwMDA7XG4gIGdhbWUubGFzdFVwZGF0ZVRpbWUgPSBjdXJyZW50VGltZTtcblxuICAvLyBPcmJpdENvbnRyb2xzIFx1QzVDNVx1QjM3MFx1Qzc3NFx1RDJCOFxuICBpZiAoZ2FtZS5jb250cm9scykge1xuICAgIGdhbWUuY29udHJvbHMudXBkYXRlKCk7XG4gIH1cblxuICB1cGRhdGUoZGVsdGFUaW1lKTtcbiAgcmVuZGVyKCk7XG5cbiAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGdhbWVMb29wKTtcbn1cblxuLy8gLS0tIE1haW4gRW50cnkgUG9pbnQgLS0tXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwiRE9NQ29udGVudExvYWRlZFwiLCBhc3luYyAoKSA9PiB7XG4gIGdhbWUuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJnYW1lQ2FudmFzXCIpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xuICBpZiAoIWdhbWUuY2FudmFzKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50IHdpdGggSUQgJ2dhbWVDYW52YXMnIG5vdCBmb3VuZC5cIik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXdhaXQgbG9hZEdhbWVEYXRhKCk7XG4gIGlmICghZ2FtZS5kYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgc2V0dXBVSSgpOyAvLyBTZXQgdXAgVUkgZWxlbWVudHNcblxuICBhd2FpdCBwcmVsb2FkQXNzZXRzKCk7XG4gIGNyZWF0ZUdhbWVXb3JsZCgpO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBoYW5kbGVJbnB1dCk7XG5cbiAgLy8gSW5pdGlhbCByZW5kZXIgb2YgdGhlIHRpdGxlIHNjcmVlblxuICBnYW1lLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcbiAgaWYgKGdhbWUudWlFbGVtZW50cy50aXRsZVNjcmVlbilcbiAgICBnYW1lLnVpRWxlbWVudHMudGl0bGVTY3JlZW4uc3R5bGUuZGlzcGxheSA9IFwiZmxleFwiO1xuICBpZiAoZ2FtZS51aUVsZW1lbnRzLnNjb3JlRGlzcGxheSlcbiAgICBnYW1lLnVpRWxlbWVudHMuc2NvcmVEaXNwbGF5LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgaWYgKGdhbWUudWlFbGVtZW50cy5nYW1lT3ZlclNjcmVlbilcbiAgICBnYW1lLnVpRWxlbWVudHMuZ2FtZU92ZXJTY3JlZW4uc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXG4gIGdhbWUubGFzdFVwZGF0ZVRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTsgLy8gSW5pdGlhbGl6ZSBsYXN0VXBkYXRlVGltZVxuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZ2Ft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ZCxZQUFNLFlBQVksS0FBSyxLQUFLLGNBQWM7QUFDMUMsV0FBSyxPQUFPLE9BQU8sVUFBVSxJQUFJO0FBQ2pDLGdCQUFVLEtBQUssU0FBUyxRQUFRO0FBQ2hDLE1BQUMsVUFBVSxLQUFLLFNBQTRCLFFBQVE7QUFDcEQsV0FBSyxhQUFhLFdBQVcsVUFBVSxJQUFJO0FBQzNDLFdBQUssS0FBSyxPQUFPLGdCQUFnQixDQUFDO0FBR2xDLFdBQUssTUFBTSxLQUFLLG1CQUFtQixzQkFBc0IsS0FBSyxDQUFDO0FBRy9ELGtCQUFZO0FBQUEsSUFDZDtBQUFBLEVBQ0Y7QUFHQSxNQUFJLEtBQUssYUFBYTtBQUVwQixVQUFNLGdCQUFnQixJQUFJO0FBQzFCLFNBQUssWUFBWSxLQUFLLGVBQWUsV0FBVyxDQUFDO0FBQUEsRUFDbkQ7QUFDRjtBQUVBLFNBQVMsU0FBZTtBQUN0QixNQUFJLEtBQUssWUFBWSxLQUFLLFNBQVMsS0FBSyxRQUFRO0FBQzlDLFNBQUssU0FBUyxPQUFPLEtBQUssT0FBTyxLQUFLLE1BQU07QUFBQSxFQUM5QztBQUNGO0FBRUEsU0FBUyxTQUFTLGFBQTJCO0FBRTNDLFFBQU0sYUFBYSxjQUFjLEtBQUssa0JBQWtCO0FBQ3hELE9BQUssaUJBQWlCO0FBR3RCLE1BQUksS0FBSyxVQUFVO0FBQ2pCLFNBQUssU0FBUyxPQUFPO0FBQUEsRUFDdkI7QUFFQSxTQUFPLFNBQVM7QUFDaEIsU0FBTztBQUVQLHdCQUFzQixRQUFRO0FBQ2hDO0FBR0EsU0FBUyxpQkFBaUIsb0JBQW9CLFlBQVk7QUFDeEQsT0FBSyxTQUFTLFNBQVMsZUFBZSxZQUFZO0FBQ2xELE1BQUksQ0FBQyxLQUFLLFFBQVE7QUFDaEIsWUFBUSxNQUFNLGdEQUFnRDtBQUM5RDtBQUFBLEVBQ0Y7QUFFQSxRQUFNLGFBQWE7QUFDbkIsTUFBSSxDQUFDLEtBQUssTUFBTTtBQUNkO0FBQUEsRUFDRjtBQUVBLFVBQVE7QUFFUixRQUFNLGNBQWM7QUFDcEIsa0JBQWdCO0FBRWhCLFNBQU8saUJBQWlCLFdBQVcsV0FBVztBQUc5QyxPQUFLLFlBQVk7QUFDakIsTUFBSSxLQUFLLFdBQVc7QUFDbEIsU0FBSyxXQUFXLFlBQVksTUFBTSxVQUFVO0FBQzlDLE1BQUksS0FBSyxXQUFXO0FBQ2xCLFNBQUssV0FBVyxhQUFhLE1BQU0sVUFBVTtBQUMvQyxNQUFJLEtBQUssV0FBVztBQUNsQixTQUFLLFdBQVcsZUFBZSxNQUFNLFVBQVU7QUFFakQsT0FBSyxpQkFBaUIsWUFBWSxJQUFJO0FBQ3RDLHdCQUFzQixRQUFRO0FBQ2hDLENBQUM7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSJdCn0K
