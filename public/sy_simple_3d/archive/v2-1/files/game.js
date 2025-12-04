import * as THREE from "three";
import * as CANNON from "cannon-es";
let config;
let scene;
let camera;
let renderer;
let physicsWorld;
let playerMesh;
let playerBody;
let collectibles = [];
let obstacles = [];
let groundMesh;
let groundBody;
let keyboard = {};
let gamepads = [];
let score = 0;
let remainingCollectibles = 0;
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 2] = "GAME_OVER";
  return GameState2;
})(GameState || {});
let gameState = 0 /* TITLE */;
let lastTimestamp = 0;
let audioListener;
let backgroundMusic;
let collectSound;
let loadedTextures = /* @__PURE__ */ new Map();
let loadedSounds = /* @__PURE__ */ new Map();
let titleTextSprite;
let scoreTextSprite;
let instructionsTextSprite;
let gameOverTextSprite;
let canJump = true;
let jumpCount = 0;
async function loadGameConfig() {
  const response = await fetch("data.json");
  if (!response.ok) {
    throw new Error(`Failed to load data.json: ${response.statusText}`);
  }
  return response.json();
}
async function loadAssets(assetsConfig) {
  const textureLoader = new THREE.TextureLoader();
  const audioLoader = new THREE.AudioLoader();
  const imagePromises = assetsConfig.images.map(async (img) => {
    return new Promise((resolve, reject) => {
      textureLoader.load(img.path, (texture) => {
        loadedTextures.set(img.name, texture);
        resolve();
      }, void 0, (error) => {
        console.error(`Error loading texture ${img.path}:`, error);
        reject(error);
      });
    });
  });
  const soundPromises = assetsConfig.sounds.map(async (snd) => {
    return new Promise((resolve, reject) => {
      audioLoader.load(snd.path, (buffer) => {
        loadedSounds.set(snd.name, buffer);
        resolve();
      }, void 0, (error) => {
        console.error(`Error loading sound ${snd.path}:`, error);
        reject(error);
      });
    });
  });
  await Promise.all([...imagePromises, ...soundPromises]);
  console.log("All assets loaded.");
}
function createTextSprite(message, fontSize, color = "#FFFFFF") {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const font = `${fontSize}px Arial`;
  context.font = font;
  const metrics = context.measureText(message);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.5;
  canvas.width = textWidth + 20;
  canvas.height = textHeight + 20;
  context.font = font;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
  return sprite;
}
function updateTextSprite(sprite, message, fontSize, color = "#FFFFFF") {
  if (!sprite || !sprite.material || !sprite.material.map) {
    return;
  }
  const texture = sprite.material.map;
  const canvas = texture.image;
  const context = canvas.getContext("2d");
  const font = `${fontSize}px Arial`;
  context.font = font;
  const metrics = context.measureText(message);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.5;
  const newWidth = textWidth + 20;
  const newHeight = textHeight + 20;
  if (canvas.width !== newWidth || canvas.height !== newHeight) {
    canvas.width = newWidth;
    canvas.height = newHeight;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = font;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
  sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
}
async function initGame() {
  config = await loadGameConfig();
  await loadAssets(config.assets);
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("Canvas element with ID 'gameCanvas' not found.");
    return;
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(config.colors.background);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1e3);
  camera.position.set(0, config.camera.height, config.camera.distance);
  camera.lookAt(0, 0, 0);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  physicsWorld = new CANNON.World();
  physicsWorld.gravity.set(0, config.gravity, 0);
  physicsWorld.defaultContactMaterial.friction = 0.5;
  physicsWorld.defaultContactMaterial.restitution = 0.3;
  audioListener = new THREE.AudioListener();
  camera.add(audioListener);
  const ambientLight = new THREE.AmbientLight(16777215, 0.6);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(16777215, 0.8);
  directionalLight.position.set(50, 100, 70);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 200;
  directionalLight.shadow.camera.left = -50;
  directionalLight.shadow.camera.right = 50;
  directionalLight.shadow.camera.top = 50;
  directionalLight.shadow.camera.bottom = -50;
  scene.add(directionalLight);
  const groundGeometry = new THREE.PlaneGeometry(config.ground.width, config.ground.depth);
  const groundTexture = loadedTextures.get("ground_texture");
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: groundTexture,
    // If groundTexture is undefined, map will be null.
    color: groundTexture ? 16777215 : 8947848,
    // Default color if no texture is loaded.
    side: THREE.DoubleSide
  });
  groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  const groundShape = new CANNON.Plane();
  groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physicsWorld.addBody(groundBody);
  const playerGeometry = new THREE.SphereGeometry(config.player.radius, 32, 32);
  const playerTexture = loadedTextures.get("player_texture");
  const playerMaterial = new THREE.MeshStandardMaterial({
    map: playerTexture,
    // If playerTexture is undefined, map will be null.
    color: playerTexture ? 16777215 : 30719,
    // Default color if no texture is loaded.
    metalness: 0.1,
    roughness: 0.6
  });
  playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
  playerMesh.position.set(0, config.player.radius + 0.1, 0);
  playerMesh.castShadow = true;
  scene.add(playerMesh);
  const playerShape = new CANNON.Sphere(config.player.radius);
  playerBody = new CANNON.Body({ mass: 5, shape: playerShape });
  playerBody.position.copy(playerMesh.position);
  physicsWorld.addBody(playerBody);
  playerBody.linearDamping = 0.9;
  playerBody.angularDamping = 0.9;
  playerBody.addEventListener("collide", (event) => {
    const contactNormal = new CANNON.Vec3();
    const upAxis = new CANNON.Vec3(0, 1, 0);
    for (const contact of event.detail.contacts) {
      if (contact.bi.id === playerBody.id || contact.bj.id === playerBody.id) {
        if (contact.bi.id === playerBody.id) {
          contact.ni.negate(contactNormal);
        } else {
          contactNormal.copy(contact.ni);
        }
        if (contactNormal.dot(upAxis) > 0.5) {
          canJump = true;
          jumpCount = 0;
        }
      }
    }
  });
  spawnCollectibles();
  spawnObstacles();
  titleTextSprite = createTextSprite("3D Sphere Collector", 60, config.colors.text);
  titleTextSprite.position.set(0, 2, -5);
  camera.add(titleTextSprite);
  instructionsTextSprite = createTextSprite("Press any key to Start", 30, config.colors.text);
  instructionsTextSprite.position.set(0, 0, -5);
  camera.add(instructionsTextSprite);
  scoreTextSprite = createTextSprite(`Score: 0 / ${config.collectibles.count}`, 30, config.colors.text);
  scoreTextSprite.position.set(2, 2.5, -5);
  scoreTextSprite.visible = false;
  camera.add(scoreTextSprite);
  gameOverTextSprite = createTextSprite("Game Over!", 60, config.colors.text);
  gameOverTextSprite.position.set(0, 2, -5);
  gameOverTextSprite.visible = false;
  camera.add(gameOverTextSprite);
  const bgmBuffer = loadedSounds.get("bgm");
  if (bgmBuffer) {
    backgroundMusic = new THREE.Audio(audioListener);
    backgroundMusic.setBuffer(bgmBuffer);
    backgroundMusic.setLoop(true);
    backgroundMusic.setVolume(config.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.5);
  }
  const collectBuffer = loadedSounds.get("collect_sfx");
  if (collectBuffer) {
    collectSound = new THREE.Audio(audioListener);
    collectSound.setBuffer(collectBuffer);
    collectSound.setLoop(false);
    collectSound.setVolume(config.assets.sounds.find((s) => s.name === "collect_sfx")?.volume || 1);
  }
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("gamepadconnected", onGamepadConnected);
  window.addEventListener("gamepaddisconnected", onGamepadDisconnected);
  requestAnimationFrame(animate);
}
function spawnCollectibles() {
  const collectibleTexture = loadedTextures.get("collectible_texture");
  remainingCollectibles = config.collectibles.count;
  for (let i = 0; i < config.collectibles.count; i++) {
    const radius = config.collectibles.radius;
    const collectibleGeometry = new THREE.SphereGeometry(radius, 16, 16);
    const collectibleMaterial = new THREE.MeshStandardMaterial({
      map: collectibleTexture,
      // If collectibleTexture is undefined, map will be null.
      color: collectibleTexture ? 16777215 : 16766720,
      // Default color if no texture is loaded.
      emissive: new THREE.Color(16766720),
      // Emissive color remains
      emissiveIntensity: 0.5
    });
    const collectibleMesh = new THREE.Mesh(collectibleGeometry, collectibleMaterial);
    collectibleMesh.castShadow = true;
    collectibleMesh.receiveShadow = true;
    let x, z;
    do {
      x = (Math.random() * 2 - 1) * config.collectibles.spawnArea;
      z = (Math.random() * 2 - 1) * config.collectibles.spawnArea;
    } while (
      // Avoid player start area
      Math.abs(x) < config.player.radius * 3 && Math.abs(z) < config.player.radius * 3 || // Avoid existing obstacles
      obstacles.some((o) => o.body.position.distanceTo(new CANNON.Vec3(x, radius + 0.1, z)) < o.body.shapes[0].halfExtents.x * 2 + radius * 2)
    );
    collectibleMesh.position.set(x, radius + 0.1, z);
    scene.add(collectibleMesh);
    const collectibleShape = new CANNON.Sphere(radius);
    const collectibleBody = new CANNON.Body({ mass: 0, shape: collectibleShape, type: CANNON.Body.KINEMATIC });
    collectibleBody.position.copy(collectibleMesh.position);
    physicsWorld.addBody(collectibleBody);
    collectibles.push({ mesh: collectibleMesh, body: collectibleBody });
  }
}
function spawnObstacles() {
  const obstacleTexture = loadedTextures.get("obstacle_texture");
  for (let i = 0; i < config.obstacles.count; i++) {
    const size = Math.random() * (config.obstacles.maxSize - config.obstacles.minSize) + config.obstacles.minSize;
    const obstacleGeometry = new THREE.BoxGeometry(size, size, size);
    const obstacleMaterial = new THREE.MeshStandardMaterial({
      map: obstacleTexture,
      // If obstacleTexture is undefined, map will be null.
      color: obstacleTexture ? 16777215 : 9109504,
      // Default color if no texture is loaded.
      metalness: 0.1,
      roughness: 0.8
    });
    const obstacleMesh = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
    obstacleMesh.castShadow = true;
    obstacleMesh.receiveShadow = true;
    let x, z;
    do {
      x = (Math.random() * 2 - 1) * config.obstacles.spawnArea;
      z = (Math.random() * 2 - 1) * config.obstacles.spawnArea;
    } while (
      // Avoid player start area
      Math.abs(x) < config.player.radius * 3 && Math.abs(z) < config.player.radius * 3 || // Avoid other obstacles
      obstacles.some((o) => o.body.position.distanceTo(new CANNON.Vec3(x, size / 2 + 0.1, z)) < o.body.shapes[0].halfExtents.x * 2 + size)
    );
    obstacleMesh.position.set(x, size / 2 + 0.1, z);
    scene.add(obstacleMesh);
    const obstacleShape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
    const obstacleBody = new CANNON.Body({ mass: 0, shape: obstacleShape, type: CANNON.Body.STATIC });
    obstacleBody.position.copy(obstacleMesh.position);
    physicsWorld.addBody(obstacleBody);
    obstacles.push({ mesh: obstacleMesh, body: obstacleBody });
  }
}
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
function onKeyDown(event) {
  keyboard[event.code] = true;
  if (gameState === 0 /* TITLE */) {
    startGame();
  } else if (gameState === 2 /* GAME_OVER */) {
    resetGame();
  }
}
function onKeyUp(event) {
  keyboard[event.code] = false;
}
function onGamepadConnected(event) {
  console.log("Gamepad connected:", event.gamepad);
  gamepads[event.gamepad.index] = event.gamepad;
  if (gameState === 0 /* TITLE */) {
    startGame();
  }
}
function onGamepadDisconnected(event) {
  console.log("Gamepad disconnected:", event.gamepad);
  delete gamepads[event.gamepad.index];
}
function startGame() {
  if (gameState !== 0 /* TITLE */) return;
  gameState = 1 /* PLAYING */;
  console.log("Game Started!");
  titleTextSprite.visible = false;
  instructionsTextSprite.visible = false;
  scoreTextSprite.visible = true;
  updateTextSprite(scoreTextSprite, `Score: ${score} / ${config.collectibles.count}`, 30, config.colors.text);
  if (backgroundMusic && !backgroundMusic.isPlaying) {
    backgroundMusic.play();
  }
}
function gameOver(won) {
  gameState = 2 /* GAME_OVER */;
  console.log("Game Over!");
  scoreTextSprite.visible = false;
  gameOverTextSprite.visible = true;
  updateTextSprite(gameOverTextSprite, won ? "You Won!" : "Game Over!", 60, config.colors.text);
  instructionsTextSprite.visible = true;
  updateTextSprite(instructionsTextSprite, "Press any key to restart", 30, config.colors.text);
  if (backgroundMusic && backgroundMusic.isPlaying) {
    backgroundMusic.stop();
  }
}
function resetGame() {
  collectibles.forEach((item) => {
    scene.remove(item.mesh);
    physicsWorld.removeBody(item.body);
  });
  obstacles.forEach((item) => {
    scene.remove(item.mesh);
    physicsWorld.removeBody(item.body);
  });
  collectibles = [];
  obstacles = [];
  playerBody.position.set(0, config.player.radius + 0.1, 0);
  playerBody.velocity.set(0, 0, 0);
  playerBody.angularVelocity.set(0, 0, 0);
  canJump = true;
  jumpCount = 0;
  score = 0;
  spawnCollectibles();
  spawnObstacles();
  remainingCollectibles = config.collectibles.count;
  gameOverTextSprite.visible = false;
  scoreTextSprite.visible = false;
  instructionsTextSprite.visible = false;
  gameState = 0 /* TITLE */;
  titleTextSprite.visible = true;
  instructionsTextSprite.visible = true;
  updateTextSprite(instructionsTextSprite, "Press any key to Start", 30, config.colors.text);
}
function animate(timestamp) {
  requestAnimationFrame(animate);
  const deltaTime = (timestamp - lastTimestamp) / 1e3;
  lastTimestamp = timestamp;
  if (gameState === 1 /* PLAYING */) {
    update(deltaTime);
    render();
  } else if (gameState === 0 /* TITLE */ || gameState === 2 /* GAME_OVER */) {
    render();
  }
}
function update(deltaTime) {
  const inputVelocity = new THREE.Vector3();
  const playerSpeed = config.player.speed;
  if (keyboard["KeyW"]) inputVelocity.z -= playerSpeed;
  if (keyboard["KeyS"]) inputVelocity.z += playerSpeed;
  if (keyboard["KeyA"]) inputVelocity.x -= playerSpeed;
  if (keyboard["KeyD"]) inputVelocity.x += playerSpeed;
  const gamepad = navigator.getGamepads()[0];
  if (gamepad) {
    const axes = gamepad.axes;
    const deadzone = 0.15;
    if (Math.abs(axes[0]) > deadzone) inputVelocity.x += axes[0] * playerSpeed;
    if (Math.abs(axes[1]) > deadzone) inputVelocity.z += axes[1] * playerSpeed;
    if (gamepad.buttons[0]?.pressed && canJump && jumpCount < config.player.maxJumps) {
      playerBody.velocity.y = config.player.jumpForce;
      canJump = false;
      jumpCount++;
    } else if (!gamepad.buttons[0]?.pressed) {
      canJump = true;
    }
  } else {
    if (keyboard["Space"] && canJump && jumpCount < config.player.maxJumps) {
      playerBody.velocity.y = config.player.jumpForce;
      canJump = false;
      jumpCount++;
    } else if (!keyboard["Space"]) {
      canJump = true;
    }
  }
  if (inputVelocity.lengthSq() > 0) {
    inputVelocity.normalize().multiplyScalar(playerSpeed);
    playerBody.velocity.x = inputVelocity.x;
    playerBody.velocity.z = inputVelocity.z;
  } else {
    playerBody.velocity.x *= 0.9;
    playerBody.velocity.z *= 0.9;
  }
  physicsWorld.step(1 / 60, deltaTime, 3);
  playerMesh.position.copy(playerBody.position);
  playerMesh.quaternion.copy(playerBody.quaternion);
  collectibles.forEach((item) => {
    item.mesh.position.copy(item.body.position);
    item.mesh.quaternion.copy(item.body.quaternion);
    item.mesh.rotation.y += deltaTime * 2;
  });
  obstacles.forEach((item) => {
    item.mesh.position.copy(item.body.position);
    item.mesh.quaternion.copy(item.body.quaternion);
  });
  camera.position.x = playerMesh.position.x;
  camera.position.y = playerMesh.position.y + config.camera.height;
  camera.position.z = playerMesh.position.z + config.camera.distance;
  camera.lookAt(playerMesh.position);
  for (let i = 0; i < collectibles.length; i++) {
    const collectible = collectibles[i];
    if (collectible.body.position.distanceTo(playerBody.position) < config.player.radius + config.collectibles.radius) {
      scene.remove(collectible.mesh);
      physicsWorld.removeBody(collectible.body);
      collectibles.splice(i, 1);
      i--;
      score++;
      remainingCollectibles--;
      updateTextSprite(scoreTextSprite, `Score: ${score} / ${config.collectibles.count}`, 30, config.colors.text);
      if (collectSound && !collectSound.isPlaying) {
        collectSound.play();
      }
      if (remainingCollectibles <= 0) {
        gameOver(true);
      }
    }
  }
  if (playerMesh.position.y < -15) {
    gameOver(false);
  }
}
function render() {
  renderer.render(scene, camera);
}
initGame().catch(console.error);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIC0tLSBEYXRhIEludGVyZmFjZXMgKGZvciBkYXRhLmpzb24pIC0tLVxyXG5pbnRlcmZhY2UgQXNzZXRJbWFnZSB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBc3NldFNvdW5kIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUFzc2V0cyB7XHJcbiAgICBpbWFnZXM6IEFzc2V0SW1hZ2VbXTtcclxuICAgIHNvdW5kczogQXNzZXRTb3VuZFtdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICBwbGF5ZXI6IHtcclxuICAgICAgICByYWRpdXM6IG51bWJlcjtcclxuICAgICAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyO1xyXG4gICAgICAgIG1heEp1bXBzOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgY2FtZXJhOiB7XHJcbiAgICAgICAgZGlzdGFuY2U6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBncm91bmQ6IHtcclxuICAgICAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGRlcHRoOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgY29sbGVjdGlibGVzOiB7XHJcbiAgICAgICAgY291bnQ6IG51bWJlcjtcclxuICAgICAgICByYWRpdXM6IG51bWJlcjtcclxuICAgICAgICBzcGF3bkFyZWE6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBvYnN0YWNsZXM6IHtcclxuICAgICAgICBjb3VudDogbnVtYmVyO1xyXG4gICAgICAgIG1pblNpemU6IG51bWJlcjtcclxuICAgICAgICBtYXhTaXplOiBudW1iZXI7XHJcbiAgICAgICAgc3Bhd25BcmVhOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgZ3Jhdml0eTogbnVtYmVyO1xyXG4gICAgY29sb3JzOiB7XHJcbiAgICAgICAgYmFja2dyb3VuZDogc3RyaW5nO1xyXG4gICAgICAgIHRleHQ6IHN0cmluZztcclxuICAgIH07XHJcbiAgICBhc3NldHM6IEdhbWVBc3NldHM7XHJcbn1cclxuXHJcbi8vIC0tLSBHbG9iYWwgVmFyaWFibGVzIC0tLVxyXG5sZXQgY29uZmlnOiBHYW1lQ29uZmlnO1xyXG5sZXQgc2NlbmU6IFRIUkVFLlNjZW5lO1xyXG5sZXQgY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxubGV0IHJlbmRlcmVyOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG5sZXQgcGh5c2ljc1dvcmxkOiBDQU5OT04uV29ybGQ7XHJcbmxldCBwbGF5ZXJNZXNoOiBUSFJFRS5NZXNoO1xyXG5sZXQgcGxheWVyQm9keTogQ0FOTk9OLkJvZHk7XHJcbmxldCBjb2xsZWN0aWJsZXM6IHsgbWVzaDogVEhSRUUuTWVzaDsgYm9keTogQ0FOTk9OLkJvZHkgfVtdID0gW107XHJcbmxldCBvYnN0YWNsZXM6IHsgbWVzaDogVEhSRUUuTWVzaDsgYm9keTogQ0FOTk9OLkJvZHkgfVtdID0gW107XHJcbmxldCBncm91bmRNZXNoOiBUSFJFRS5NZXNoO1xyXG5sZXQgZ3JvdW5kQm9keTogQ0FOTk9OLkJvZHk7XHJcblxyXG5sZXQga2V5Ym9hcmQ6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XHJcbmxldCBnYW1lcGFkczogR2FtZXBhZFtdID0gW107XHJcblxyXG5sZXQgc2NvcmU6IG51bWJlciA9IDA7XHJcbmxldCByZW1haW5pbmdDb2xsZWN0aWJsZXM6IG51bWJlciA9IDA7XHJcblxyXG4vLyAtLS0gRU5VTSAoTW92ZWQgaGVyZSB0byBmaXggVFMyNDUwOiBFbnVtICdHYW1lU3RhdGUnIHVzZWQgYmVmb3JlIGl0cyBkZWNsYXJhdGlvbikgLS0tXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIFRJVExFLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUlxyXG59XHJcblxyXG5sZXQgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7IC8vIE5vdyBHYW1lU3RhdGUgaXMgZGVjbGFyZWQgYmVmb3JlIGl0cyB1c2VcclxubGV0IGxhc3RUaW1lc3RhbXA6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxubGV0IGF1ZGlvTGlzdGVuZXI6IFRIUkVFLkF1ZGlvTGlzdGVuZXI7XHJcbmxldCBiYWNrZ3JvdW5kTXVzaWM6IFRIUkVFLkF1ZGlvPEF1ZGlvTm9kZT47XHJcbmxldCBjb2xsZWN0U291bmQ6IFRIUkVFLkF1ZGlvPEF1ZGlvTm9kZT47XHJcbmxldCBsb2FkZWRUZXh0dXJlczogTWFwPHN0cmluZywgVEhSRUUuVGV4dHVyZT4gPSBuZXcgTWFwKCk7XHJcbmxldCBsb2FkZWRTb3VuZHM6IE1hcDxzdHJpbmcsIEF1ZGlvQnVmZmVyPiA9IG5ldyBNYXAoKTtcclxuXHJcbmxldCB0aXRsZVRleHRTcHJpdGU6IFRIUkVFLlNwcml0ZTtcclxubGV0IHNjb3JlVGV4dFNwcml0ZTogVEhSRUUuU3ByaXRlO1xyXG5sZXQgaW5zdHJ1Y3Rpb25zVGV4dFNwcml0ZTogVEhSRUUuU3ByaXRlO1xyXG5sZXQgZ2FtZU92ZXJUZXh0U3ByaXRlOiBUSFJFRS5TcHJpdGU7XHJcblxyXG4vLyBQbGF5ZXIgc3RhdGUgZm9yIGp1bXBpbmdcclxubGV0IGNhbkp1bXAgPSB0cnVlO1xyXG5sZXQganVtcENvdW50ID0gMDtcclxuXHJcbi8vIC0tLSBVdGlsaXR5IEZ1bmN0aW9ucyAtLS1cclxuYXN5bmMgZnVuY3Rpb24gbG9hZEdhbWVDb25maWcoKTogUHJvbWlzZTxHYW1lQ29uZmlnPiB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBsb2FkIGRhdGEuanNvbjogJHtyZXNwb25zZS5zdGF0dXNUZXh0fWApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3BvbnNlLmpzb24oKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbG9hZEFzc2V0cyhhc3NldHNDb25maWc6IEdhbWVBc3NldHMpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgY29uc3QgYXVkaW9Mb2FkZXIgPSBuZXcgVEhSRUUuQXVkaW9Mb2FkZXIoKTtcclxuXHJcbiAgICBjb25zdCBpbWFnZVByb21pc2VzID0gYXNzZXRzQ29uZmlnLmltYWdlcy5tYXAoYXN5bmMgKGltZykgPT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIHRleHR1cmVMb2FkZXIubG9hZChpbWcucGF0aCwgKHRleHR1cmUpID0+IHtcclxuICAgICAgICAgICAgICAgIGxvYWRlZFRleHR1cmVzLnNldChpbWcubmFtZSwgdGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH0sIHVuZGVmaW5lZCwgKGVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIHRleHR1cmUgJHtpbWcucGF0aH06YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBzb3VuZFByb21pc2VzID0gYXNzZXRzQ29uZmlnLnNvdW5kcy5tYXAoYXN5bmMgKHNuZCkgPT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgIGF1ZGlvTG9hZGVyLmxvYWQoc25kLnBhdGgsIChidWZmZXIpID0+IHtcclxuICAgICAgICAgICAgICAgIGxvYWRlZFNvdW5kcy5zZXQoc25kLm5hbWUsIGJ1ZmZlcik7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgIH0sIHVuZGVmaW5lZCwgKGVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIHNvdW5kICR7c25kLnBhdGh9OmAsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcblxyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVUZXh0U3ByaXRlKG1lc3NhZ2U6IHN0cmluZywgZm9udFNpemU6IG51bWJlciwgY29sb3I6IHN0cmluZyA9ICcjRkZGRkZGJyk6IFRIUkVFLlNwcml0ZSB7XHJcbiAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgIGNvbnN0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKSE7XHJcbiAgICBjb25zdCBmb250ID0gYCR7Zm9udFNpemV9cHggQXJpYWxgO1xyXG5cclxuICAgIGNvbnRleHQuZm9udCA9IGZvbnQ7XHJcbiAgICBjb25zdCBtZXRyaWNzID0gY29udGV4dC5tZWFzdXJlVGV4dChtZXNzYWdlKTtcclxuICAgIGNvbnN0IHRleHRXaWR0aCA9IG1ldHJpY3Mud2lkdGg7XHJcbiAgICBjb25zdCB0ZXh0SGVpZ2h0ID0gZm9udFNpemUgKiAxLjU7IC8vIEFwcHJveGltYXRlIGxpbmUgaGVpZ2h0XHJcblxyXG4gICAgY2FudmFzLndpZHRoID0gdGV4dFdpZHRoICsgMjA7IC8vIEFkZCBwYWRkaW5nXHJcbiAgICBjYW52YXMuaGVpZ2h0ID0gdGV4dEhlaWdodCArIDIwOyAvLyBBZGQgcGFkZGluZ1xyXG4gICAgY29udGV4dC5mb250ID0gZm9udDsgLy8gUmVzZXQgZm9udCBhZnRlciBjYW52YXMgcmVzaXplXHJcbiAgICBjb250ZXh0LmZpbGxTdHlsZSA9IGNvbG9yO1xyXG4gICAgY29udGV4dC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgIGNvbnRleHQudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICBjb250ZXh0LmZpbGxUZXh0KG1lc3NhZ2UsIGNhbnZhcy53aWR0aCAvIDIsIGNhbnZhcy5oZWlnaHQgLyAyKTtcclxuXHJcbiAgICBjb25zdCB0ZXh0dXJlID0gbmV3IFRIUkVFLkNhbnZhc1RleHR1cmUoY2FudmFzKTtcclxuICAgIHRleHR1cmUubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xyXG4gICAgdGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcblxyXG4gICAgY29uc3Qgc3ByaXRlTWF0ZXJpYWwgPSBuZXcgVEhSRUUuU3ByaXRlTWF0ZXJpYWwoeyBtYXA6IHRleHR1cmUsIHRyYW5zcGFyZW50OiB0cnVlIH0pO1xyXG4gICAgY29uc3Qgc3ByaXRlID0gbmV3IFRIUkVFLlNwcml0ZShzcHJpdGVNYXRlcmlhbCk7XHJcblxyXG4gICAgLy8gU2NhbGUgc3ByaXRlIGJhc2VkIG9uIGNhbnZhcyBzaXplLCBhc3N1bWluZyBhIGNlcnRhaW4gdmlzdWFsIHNjYWxlXHJcbiAgICBzcHJpdGUuc2NhbGUuc2V0KGNhbnZhcy53aWR0aCAvIDEwLCBjYW52YXMuaGVpZ2h0IC8gMTAsIDEpO1xyXG4gICAgcmV0dXJuIHNwcml0ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gdXBkYXRlVGV4dFNwcml0ZShzcHJpdGU6IFRIUkVFLlNwcml0ZSwgbWVzc2FnZTogc3RyaW5nLCBmb250U2l6ZTogbnVtYmVyLCBjb2xvcjogc3RyaW5nID0gJyNGRkZGRkYnKSB7XHJcbiAgICBpZiAoIXNwcml0ZSB8fCAhc3ByaXRlLm1hdGVyaWFsIHx8ICEoc3ByaXRlLm1hdGVyaWFsIGFzIFRIUkVFLlNwcml0ZU1hdGVyaWFsKS5tYXApIHtcclxuICAgICAgICByZXR1cm47IC8vIEhhbmRsZSBjYXNlIHdoZXJlIHNwcml0ZSBpcyBub3QgeWV0IGluaXRpYWxpemVkXHJcbiAgICB9XHJcbiAgICBjb25zdCB0ZXh0dXJlID0gKHNwcml0ZS5tYXRlcmlhbCBhcyBUSFJFRS5TcHJpdGVNYXRlcmlhbCkubWFwIGFzIFRIUkVFLkNhbnZhc1RleHR1cmU7XHJcbiAgICBjb25zdCBjYW52YXMgPSB0ZXh0dXJlLmltYWdlIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgY29uc3QgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuXHJcbiAgICBjb25zdCBmb250ID0gYCR7Zm9udFNpemV9cHggQXJpYWxgO1xyXG4gICAgY29udGV4dC5mb250ID0gZm9udDtcclxuICAgIGNvbnN0IG1ldHJpY3MgPSBjb250ZXh0Lm1lYXN1cmVUZXh0KG1lc3NhZ2UpO1xyXG4gICAgY29uc3QgdGV4dFdpZHRoID0gbWV0cmljcy53aWR0aDtcclxuICAgIGNvbnN0IHRleHRIZWlnaHQgPSBmb250U2l6ZSAqIDEuNTtcclxuXHJcbiAgICAvLyBBZGp1c3QgY2FudmFzIHNpemUgaWYgbmVjZXNzYXJ5XHJcbiAgICBjb25zdCBuZXdXaWR0aCA9IHRleHRXaWR0aCArIDIwO1xyXG4gICAgY29uc3QgbmV3SGVpZ2h0ID0gdGV4dEhlaWdodCArIDIwO1xyXG4gICAgaWYgKGNhbnZhcy53aWR0aCAhPT0gbmV3V2lkdGggfHwgY2FudmFzLmhlaWdodCAhPT0gbmV3SGVpZ2h0KSB7XHJcbiAgICAgICAgY2FudmFzLndpZHRoID0gbmV3V2lkdGg7XHJcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IG5ld0hlaWdodDtcclxuICAgIH1cclxuXHJcbiAgICBjb250ZXh0LmNsZWFyUmVjdCgwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xyXG4gICAgY29udGV4dC5mb250ID0gZm9udDtcclxuICAgIGNvbnRleHQuZmlsbFN0eWxlID0gY29sb3I7XHJcbiAgICBjb250ZXh0LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgY29udGV4dC50ZXh0QmFzZWxpbmUgPSAnbWlkZGxlJztcclxuICAgIGNvbnRleHQuZmlsbFRleHQobWVzc2FnZSwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIpO1xyXG5cclxuICAgIHRleHR1cmUubmVlZHNVcGRhdGUgPSB0cnVlO1xyXG4gICAgc3ByaXRlLnNjYWxlLnNldChjYW52YXMud2lkdGggLyAxMCwgY2FudmFzLmhlaWdodCAvIDEwLCAxKTsgLy8gUmVzY2FsZSBzcHJpdGVcclxufVxyXG5cclxuXHJcbi8vIC0tLSBHYW1lIEluaXRpYWxpemF0aW9uIC0tLVxyXG5hc3luYyBmdW5jdGlvbiBpbml0R2FtZSgpIHtcclxuICAgIGNvbmZpZyA9IGF3YWl0IGxvYWRHYW1lQ29uZmlnKCk7XHJcbiAgICBhd2FpdCBsb2FkQXNzZXRzKGNvbmZpZy5hc3NldHMpO1xyXG5cclxuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBpZiAoIWNhbnZhcykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJDYW52YXMgZWxlbWVudCB3aXRoIElEICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBTY2VuZVxyXG4gICAgc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuICAgIHNjZW5lLmJhY2tncm91bmQgPSBuZXcgVEhSRUUuQ29sb3IoY29uZmlnLmNvbG9ycy5iYWNrZ3JvdW5kKTtcclxuXHJcbiAgICAvLyBDYW1lcmFcclxuICAgIGNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSg3NSwgd2luZG93LmlubmVyV2lkdGggLyB3aW5kb3cuaW5uZXJIZWlnaHQsIDAuMSwgMTAwMCk7XHJcbiAgICBjYW1lcmEucG9zaXRpb24uc2V0KDAsIGNvbmZpZy5jYW1lcmEuaGVpZ2h0LCBjb25maWcuY2FtZXJhLmRpc3RhbmNlKTtcclxuICAgIGNhbWVyYS5sb29rQXQoMCwgMCwgMCk7XHJcblxyXG4gICAgLy8gUmVuZGVyZXJcclxuICAgIHJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IGNhbnZhcywgYW50aWFsaWFzOiB0cnVlIH0pO1xyXG4gICAgcmVuZGVyZXIuc2V0U2l6ZSh3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0KTtcclxuICAgIHJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xyXG4gICAgcmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlO1xyXG4gICAgcmVuZGVyZXIuc2hhZG93TWFwLnR5cGUgPSBUSFJFRS5QQ0ZTb2Z0U2hhZG93TWFwO1xyXG5cclxuICAgIC8vIFBoeXNpY3MgV29ybGRcclxuICAgIHBoeXNpY3NXb3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcclxuICAgIHBoeXNpY3NXb3JsZC5ncmF2aXR5LnNldCgwLCBjb25maWcuZ3Jhdml0eSwgMCk7IC8vIE5lZ2F0aXZlIFktYXhpcyBmb3IgZ3Jhdml0eVxyXG4gICAgcGh5c2ljc1dvcmxkLmRlZmF1bHRDb250YWN0TWF0ZXJpYWwuZnJpY3Rpb24gPSAwLjU7XHJcbiAgICBwaHlzaWNzV29ybGQuZGVmYXVsdENvbnRhY3RNYXRlcmlhbC5yZXN0aXR1dGlvbiA9IDAuMztcclxuXHJcbiAgICAvLyBBdWRpbyBMaXN0ZW5lclxyXG4gICAgYXVkaW9MaXN0ZW5lciA9IG5ldyBUSFJFRS5BdWRpb0xpc3RlbmVyKCk7XHJcbiAgICBjYW1lcmEuYWRkKGF1ZGlvTGlzdGVuZXIpO1xyXG5cclxuICAgIC8vIExpZ2h0c1xyXG4gICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweGZmZmZmZiwgMC42KTtcclxuICAgIHNjZW5lLmFkZChhbWJpZW50TGlnaHQpO1xyXG4gICAgY29uc3QgZGlyZWN0aW9uYWxMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpO1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodC5wb3NpdGlvbi5zZXQoNTAsIDEwMCwgNzApO1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUud2lkdGggPSAxMDI0O1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS5oZWlnaHQgPSAxMDI0O1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLm5lYXIgPSAwLjU7XHJcbiAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuZmFyID0gMjAwO1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmxlZnQgPSAtNTA7XHJcbiAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSA1MDtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS50b3AgPSA1MDtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5ib3R0b20gPSAtNTA7XHJcbiAgICBzY2VuZS5hZGQoZGlyZWN0aW9uYWxMaWdodCk7XHJcblxyXG4gICAgLy8gR3JvdW5kXHJcbiAgICBjb25zdCBncm91bmRHZW9tZXRyeSA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KGNvbmZpZy5ncm91bmQud2lkdGgsIGNvbmZpZy5ncm91bmQuZGVwdGgpO1xyXG4gICAgY29uc3QgZ3JvdW5kVGV4dHVyZSA9IGxvYWRlZFRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgIGNvbnN0IGdyb3VuZE1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHtcclxuICAgICAgICBtYXA6IGdyb3VuZFRleHR1cmUsIC8vIElmIGdyb3VuZFRleHR1cmUgaXMgdW5kZWZpbmVkLCBtYXAgd2lsbCBiZSBudWxsLlxyXG4gICAgICAgIGNvbG9yOiBncm91bmRUZXh0dXJlID8gMHhmZmZmZmYgOiAweDg4ODg4OCwgLy8gRGVmYXVsdCBjb2xvciBpZiBubyB0ZXh0dXJlIGlzIGxvYWRlZC5cclxuICAgICAgICBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlXHJcbiAgICB9KTtcclxuICAgIGdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG4gICAgZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyOyAvLyBSb3RhdGUgdG8gYmUgaG9yaXpvbnRhbFxyXG4gICAgZ3JvdW5kTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgIHNjZW5lLmFkZChncm91bmRNZXNoKTtcclxuXHJcbiAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgIGdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwIH0pOyAvLyBNYXNzIDAgbWFrZXMgaXQgc3RhdGljXHJcbiAgICBncm91bmRCb2R5LmFkZFNoYXBlKGdyb3VuZFNoYXBlKTtcclxuICAgIGdyb3VuZEJvZHkucXVhdGVybmlvbi5zZXRGcm9tRXVsZXIoLU1hdGguUEkgLyAyLCAwLCAwKTsgLy8gUm90YXRlIHRvIG1hdGNoIG1lc2hcclxuICAgIHBoeXNpY3NXb3JsZC5hZGRCb2R5KGdyb3VuZEJvZHkpO1xyXG5cclxuICAgIC8vIFBsYXllclxyXG4gICAgY29uc3QgcGxheWVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoY29uZmlnLnBsYXllci5yYWRpdXMsIDMyLCAzMik7XHJcbiAgICBjb25zdCBwbGF5ZXJUZXh0dXJlID0gbG9hZGVkVGV4dHVyZXMuZ2V0KCdwbGF5ZXJfdGV4dHVyZScpO1xyXG4gICAgY29uc3QgcGxheWVyTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xyXG4gICAgICAgIG1hcDogcGxheWVyVGV4dHVyZSwgLy8gSWYgcGxheWVyVGV4dHVyZSBpcyB1bmRlZmluZWQsIG1hcCB3aWxsIGJlIG51bGwuXHJcbiAgICAgICAgY29sb3I6IHBsYXllclRleHR1cmUgPyAweGZmZmZmZiA6IDB4MDA3N2ZmLCAvLyBEZWZhdWx0IGNvbG9yIGlmIG5vIHRleHR1cmUgaXMgbG9hZGVkLlxyXG4gICAgICAgIG1ldGFsbmVzczogMC4xLFxyXG4gICAgICAgIHJvdWdobmVzczogMC42XHJcbiAgICB9KTtcclxuICAgIHBsYXllck1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGF5ZXJHZW9tZXRyeSwgcGxheWVyTWF0ZXJpYWwpO1xyXG4gICAgcGxheWVyTWVzaC5wb3NpdGlvbi5zZXQoMCwgY29uZmlnLnBsYXllci5yYWRpdXMgKyAwLjEsIDApOyAvLyBTbGlnaHRseSBhYm92ZSBncm91bmRcclxuICAgIHBsYXllck1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICBzY2VuZS5hZGQocGxheWVyTWVzaCk7XHJcblxyXG4gICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLlNwaGVyZShjb25maWcucGxheWVyLnJhZGl1cyk7XHJcbiAgICBwbGF5ZXJCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogNSwgc2hhcGU6IHBsYXllclNoYXBlIH0pO1xyXG4gICAgcGxheWVyQm9keS5wb3NpdGlvbi5jb3B5KHBsYXllck1lc2gucG9zaXRpb24gYXMgYW55KTtcclxuICAgIHBoeXNpY3NXb3JsZC5hZGRCb2R5KHBsYXllckJvZHkpO1xyXG4gICAgcGxheWVyQm9keS5saW5lYXJEYW1waW5nID0gMC45OyAvLyBSZWR1Y2UgaG9yaXpvbnRhbCBzbGlkZVxyXG4gICAgcGxheWVyQm9keS5hbmd1bGFyRGFtcGluZyA9IDAuOTsgLy8gUmVkdWNlIHNwaW5uaW5nXHJcblxyXG4gICAgcGxheWVyQm9keS5hZGRFdmVudExpc3RlbmVyKCdjb2xsaWRlJywgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgICAgICAvLyBDaGVjayBpZiBwbGF5ZXIgaXMgdG91Y2hpbmcgdGhlIGdyb3VuZCB0byBhbGxvdyBqdW1waW5nXHJcbiAgICAgICAgY29uc3QgY29udGFjdE5vcm1hbCA9IG5ldyBDQU5OT04uVmVjMygpO1xyXG4gICAgICAgIGNvbnN0IHVwQXhpcyA9IG5ldyBDQU5OT04uVmVjMygwLCAxLCAwKTtcclxuICAgICAgICBmb3IgKGNvbnN0IGNvbnRhY3Qgb2YgZXZlbnQuZGV0YWlsLmNvbnRhY3RzKSB7XHJcbiAgICAgICAgICAgIGlmIChjb250YWN0LmJpLmlkID09PSBwbGF5ZXJCb2R5LmlkIHx8IGNvbnRhY3QuYmouaWQgPT09IHBsYXllckJvZHkuaWQpIHtcclxuICAgICAgICAgICAgICAgIGlmIChjb250YWN0LmJpLmlkID09PSBwbGF5ZXJCb2R5LmlkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGFjdC5uaS5uZWdhdGUoY29udGFjdE5vcm1hbCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRhY3ROb3JtYWwuY29weShjb250YWN0Lm5pKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBjb250YWN0IG5vcm1hbCBpcyBwb2ludGluZyB1cHdhcmRzIGVub3VnaFxyXG4gICAgICAgICAgICAgICAgaWYgKGNvbnRhY3ROb3JtYWwuZG90KHVwQXhpcykgPiAwLjUpIHsgLy8gVGhyZXNob2xkIGZvciBjb25zaWRlcmluZyBpdCBncm91bmRcclxuICAgICAgICAgICAgICAgICAgICBjYW5KdW1wID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICBqdW1wQ291bnQgPSAwO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ29sbGVjdGlibGVzXHJcbiAgICBzcGF3bkNvbGxlY3RpYmxlcygpO1xyXG5cclxuICAgIC8vIE9ic3RhY2xlc1xyXG4gICAgc3Bhd25PYnN0YWNsZXMoKTtcclxuXHJcbiAgICAvLyBVSSBTcHJpdGVzIChhdHRhY2hlZCB0byBjYW1lcmEgZm9yIGZpeGVkIHNjcmVlbiBwb3NpdGlvbilcclxuICAgIHRpdGxlVGV4dFNwcml0ZSA9IGNyZWF0ZVRleHRTcHJpdGUoXCIzRCBTcGhlcmUgQ29sbGVjdG9yXCIsIDYwLCBjb25maWcuY29sb3JzLnRleHQpO1xyXG4gICAgdGl0bGVUZXh0U3ByaXRlLnBvc2l0aW9uLnNldCgwLCAyLCAtNSk7IC8vIFJlbGF0aXZlIHRvIGNhbWVyYVxyXG4gICAgY2FtZXJhLmFkZCh0aXRsZVRleHRTcHJpdGUpO1xyXG5cclxuICAgIGluc3RydWN0aW9uc1RleHRTcHJpdGUgPSBjcmVhdGVUZXh0U3ByaXRlKFwiUHJlc3MgYW55IGtleSB0byBTdGFydFwiLCAzMCwgY29uZmlnLmNvbG9ycy50ZXh0KTtcclxuICAgIGluc3RydWN0aW9uc1RleHRTcHJpdGUucG9zaXRpb24uc2V0KDAsIDAsIC01KTsgLy8gUmVsYXRpdmUgdG8gY2FtZXJhLCBiZWxvdyB0aXRsZVxyXG4gICAgY2FtZXJhLmFkZChpbnN0cnVjdGlvbnNUZXh0U3ByaXRlKTtcclxuXHJcbiAgICBzY29yZVRleHRTcHJpdGUgPSBjcmVhdGVUZXh0U3ByaXRlKGBTY29yZTogMCAvICR7Y29uZmlnLmNvbGxlY3RpYmxlcy5jb3VudH1gLCAzMCwgY29uZmlnLmNvbG9ycy50ZXh0KTtcclxuICAgIHNjb3JlVGV4dFNwcml0ZS5wb3NpdGlvbi5zZXQoMiwgMi41LCAtNSk7IC8vIFRvcC1yaWdodCByZWxhdGl2ZSB0byBjYW1lcmFcclxuICAgIHNjb3JlVGV4dFNwcml0ZS52aXNpYmxlID0gZmFsc2U7XHJcbiAgICBjYW1lcmEuYWRkKHNjb3JlVGV4dFNwcml0ZSk7XHJcblxyXG4gICAgZ2FtZU92ZXJUZXh0U3ByaXRlID0gY3JlYXRlVGV4dFNwcml0ZShcIkdhbWUgT3ZlciFcIiwgNjAsIGNvbmZpZy5jb2xvcnMudGV4dCk7XHJcbiAgICBnYW1lT3ZlclRleHRTcHJpdGUucG9zaXRpb24uc2V0KDAsIDIsIC01KTtcclxuICAgIGdhbWVPdmVyVGV4dFNwcml0ZS52aXNpYmxlID0gZmFsc2U7XHJcbiAgICBjYW1lcmEuYWRkKGdhbWVPdmVyVGV4dFNwcml0ZSk7XHJcblxyXG4gICAgLy8gQXVkaW8gc2V0dXBcclxuICAgIGNvbnN0IGJnbUJ1ZmZlciA9IGxvYWRlZFNvdW5kcy5nZXQoJ2JnbScpO1xyXG4gICAgaWYgKGJnbUJ1ZmZlcikge1xyXG4gICAgICAgIGJhY2tncm91bmRNdXNpYyA9IG5ldyBUSFJFRS5BdWRpbyhhdWRpb0xpc3RlbmVyKTtcclxuICAgICAgICBiYWNrZ3JvdW5kTXVzaWMuc2V0QnVmZmVyKGJnbUJ1ZmZlcik7XHJcbiAgICAgICAgYmFja2dyb3VuZE11c2ljLnNldExvb3AodHJ1ZSk7XHJcbiAgICAgICAgYmFja2dyb3VuZE11c2ljLnNldFZvbHVtZShjb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnYmdtJyk/LnZvbHVtZSB8fCAwLjUpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29sbGVjdEJ1ZmZlciA9IGxvYWRlZFNvdW5kcy5nZXQoJ2NvbGxlY3Rfc2Z4Jyk7XHJcbiAgICBpZiAoY29sbGVjdEJ1ZmZlcikge1xyXG4gICAgICAgIGNvbGxlY3RTb3VuZCA9IG5ldyBUSFJFRS5BdWRpbyhhdWRpb0xpc3RlbmVyKTtcclxuICAgICAgICBjb2xsZWN0U291bmQuc2V0QnVmZmVyKGNvbGxlY3RCdWZmZXIpO1xyXG4gICAgICAgIGNvbGxlY3RTb3VuZC5zZXRMb29wKGZhbHNlKTtcclxuICAgICAgICBjb2xsZWN0U291bmQuc2V0Vm9sdW1lKGNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdjb2xsZWN0X3NmeCcpPy52b2x1bWUgfHwgMS4wKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBFdmVudCBMaXN0ZW5lcnNcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBvbldpbmRvd1Jlc2l6ZSk7XHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIG9uS2V5RG93bik7XHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBvbktleVVwKTtcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdnYW1lcGFkY29ubmVjdGVkJywgb25HYW1lcGFkQ29ubmVjdGVkKTtcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdnYW1lcGFkZGlzY29ubmVjdGVkJywgb25HYW1lcGFkRGlzY29ubmVjdGVkKTtcclxuXHJcbiAgICAvLyBTdGFydCByZW5kZXIgbG9vcFxyXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzcGF3bkNvbGxlY3RpYmxlcygpIHtcclxuICAgIGNvbnN0IGNvbGxlY3RpYmxlVGV4dHVyZSA9IGxvYWRlZFRleHR1cmVzLmdldCgnY29sbGVjdGlibGVfdGV4dHVyZScpO1xyXG4gICAgcmVtYWluaW5nQ29sbGVjdGlibGVzID0gY29uZmlnLmNvbGxlY3RpYmxlcy5jb3VudDtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29uZmlnLmNvbGxlY3RpYmxlcy5jb3VudDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgcmFkaXVzID0gY29uZmlnLmNvbGxlY3RpYmxlcy5yYWRpdXM7XHJcbiAgICAgICAgY29uc3QgY29sbGVjdGlibGVHZW9tZXRyeSA9IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeShyYWRpdXMsIDE2LCAxNik7XHJcbiAgICAgICAgY29uc3QgY29sbGVjdGlibGVNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogY29sbGVjdGlibGVUZXh0dXJlLCAvLyBJZiBjb2xsZWN0aWJsZVRleHR1cmUgaXMgdW5kZWZpbmVkLCBtYXAgd2lsbCBiZSBudWxsLlxyXG4gICAgICAgICAgICBjb2xvcjogY29sbGVjdGlibGVUZXh0dXJlID8gMHhmZmZmZmYgOiAweGZmZDcwMCwgLy8gRGVmYXVsdCBjb2xvciBpZiBubyB0ZXh0dXJlIGlzIGxvYWRlZC5cclxuICAgICAgICAgICAgZW1pc3NpdmU6IG5ldyBUSFJFRS5Db2xvcigweGZmZDcwMCksIC8vIEVtaXNzaXZlIGNvbG9yIHJlbWFpbnNcclxuICAgICAgICAgICAgZW1pc3NpdmVJbnRlbnNpdHk6IDAuNVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGNvbGxlY3RpYmxlTWVzaCA9IG5ldyBUSFJFRS5NZXNoKGNvbGxlY3RpYmxlR2VvbWV0cnksIGNvbGxlY3RpYmxlTWF0ZXJpYWwpO1xyXG4gICAgICAgIGNvbGxlY3RpYmxlTWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICBjb2xsZWN0aWJsZU1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcblxyXG4gICAgICAgIGxldCB4LCB6O1xyXG4gICAgICAgIC8vIEVuc3VyZSBjb2xsZWN0aWJsZXMgYXJlIG5vdCB0b28gY2xvc2UgdG8gcGxheWVyIHN0YXJ0IG9yIG9ic3RhY2xlc1xyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgeCA9IChNYXRoLnJhbmRvbSgpICogMiAtIDEpICogY29uZmlnLmNvbGxlY3RpYmxlcy5zcGF3bkFyZWE7XHJcbiAgICAgICAgICAgIHogPSAoTWF0aC5yYW5kb20oKSAqIDIgLSAxKSAqIGNvbmZpZy5jb2xsZWN0aWJsZXMuc3Bhd25BcmVhO1xyXG4gICAgICAgIH0gd2hpbGUgKFxyXG4gICAgICAgICAgICAvLyBBdm9pZCBwbGF5ZXIgc3RhcnQgYXJlYVxyXG4gICAgICAgICAgICAoTWF0aC5hYnMoeCkgPCBjb25maWcucGxheWVyLnJhZGl1cyAqIDMgJiYgTWF0aC5hYnMoeikgPCBjb25maWcucGxheWVyLnJhZGl1cyAqIDMpIHx8XHJcbiAgICAgICAgICAgIC8vIEF2b2lkIGV4aXN0aW5nIG9ic3RhY2xlc1xyXG4gICAgICAgICAgICBvYnN0YWNsZXMuc29tZShvID0+IG8uYm9keS5wb3NpdGlvbi5kaXN0YW5jZVRvKG5ldyBDQU5OT04uVmVjMyh4LCByYWRpdXMgKyAwLjEsIHopKSA8IChvLmJvZHkuc2hhcGVzWzBdIGFzIENBTk5PTi5Cb3gpLmhhbGZFeHRlbnRzLnggKiAyICsgcmFkaXVzICogMikgLy8gQXBwcm94aW1hdGUgY29sbGlzaW9uIGNoZWNrXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgY29sbGVjdGlibGVNZXNoLnBvc2l0aW9uLnNldCh4LCByYWRpdXMgKyAwLjEsIHopO1xyXG4gICAgICAgIHNjZW5lLmFkZChjb2xsZWN0aWJsZU1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCBjb2xsZWN0aWJsZVNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUocmFkaXVzKTtcclxuICAgICAgICAvLyBVc2luZyBLSU5FTUFUSUMgdG8gYWxsb3cgcmVtb3Zpbmcgd2l0aG91dCBwaHlzaWNzIHdvcmxkIGlzc3Vlc1xyXG4gICAgICAgIGNvbnN0IGNvbGxlY3RpYmxlQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAsIHNoYXBlOiBjb2xsZWN0aWJsZVNoYXBlLCB0eXBlOiBDQU5OT04uQm9keS5LSU5FTUFUSUMgfSk7XHJcbiAgICAgICAgY29sbGVjdGlibGVCb2R5LnBvc2l0aW9uLmNvcHkoY29sbGVjdGlibGVNZXNoLnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgcGh5c2ljc1dvcmxkLmFkZEJvZHkoY29sbGVjdGlibGVCb2R5KTtcclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlZCB1c2VyRGF0YSBhc3NpZ25tZW50cyBhcyB0aGV5IGFyZSBub3QgdXNlZCBhbmQgY2F1c2UgVFMgZXJyb3JzLlxyXG4gICAgICAgIC8vIGNvbGxlY3RpYmxlQm9keS51c2VyRGF0YSA9IHsgaXNDb2xsZWN0aWJsZTogdHJ1ZSwgbWVzaElkOiBjb2xsZWN0aWJsZU1lc2gudXVpZCB9O1xyXG4gICAgICAgIC8vIGNvbGxlY3RpYmxlTWVzaC51c2VyRGF0YSA9IHsgaXNDb2xsZWN0aWJsZTogdHJ1ZSwgYm9keUlkOiBjb2xsZWN0aWJsZUJvZHkuaWQgfTtcclxuXHJcbiAgICAgICAgY29sbGVjdGlibGVzLnB1c2goeyBtZXNoOiBjb2xsZWN0aWJsZU1lc2gsIGJvZHk6IGNvbGxlY3RpYmxlQm9keSB9KTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gc3Bhd25PYnN0YWNsZXMoKSB7XHJcbiAgICBjb25zdCBvYnN0YWNsZVRleHR1cmUgPSBsb2FkZWRUZXh0dXJlcy5nZXQoJ29ic3RhY2xlX3RleHR1cmUnKTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29uZmlnLm9ic3RhY2xlcy5jb3VudDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3Qgc2l6ZSA9IE1hdGgucmFuZG9tKCkgKiAoY29uZmlnLm9ic3RhY2xlcy5tYXhTaXplIC0gY29uZmlnLm9ic3RhY2xlcy5taW5TaXplKSArIGNvbmZpZy5vYnN0YWNsZXMubWluU2l6ZTtcclxuICAgICAgICBjb25zdCBvYnN0YWNsZUdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHNpemUsIHNpemUsIHNpemUpO1xyXG4gICAgICAgIGNvbnN0IG9ic3RhY2xlTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IG9ic3RhY2xlVGV4dHVyZSwgLy8gSWYgb2JzdGFjbGVUZXh0dXJlIGlzIHVuZGVmaW5lZCwgbWFwIHdpbGwgYmUgbnVsbC5cclxuICAgICAgICAgICAgY29sb3I6IG9ic3RhY2xlVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4YjAwMDAsIC8vIERlZmF1bHQgY29sb3IgaWYgbm8gdGV4dHVyZSBpcyBsb2FkZWQuXHJcbiAgICAgICAgICAgIG1ldGFsbmVzczogMC4xLFxyXG4gICAgICAgICAgICByb3VnaG5lc3M6IDAuOFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IG9ic3RhY2xlTWVzaCA9IG5ldyBUSFJFRS5NZXNoKG9ic3RhY2xlR2VvbWV0cnksIG9ic3RhY2xlTWF0ZXJpYWwpO1xyXG4gICAgICAgIG9ic3RhY2xlTWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICBvYnN0YWNsZU1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcblxyXG4gICAgICAgIGxldCB4LCB6O1xyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgeCA9IChNYXRoLnJhbmRvbSgpICogMiAtIDEpICogY29uZmlnLm9ic3RhY2xlcy5zcGF3bkFyZWE7XHJcbiAgICAgICAgICAgIHogPSAoTWF0aC5yYW5kb20oKSAqIDIgLSAxKSAqIGNvbmZpZy5vYnN0YWNsZXMuc3Bhd25BcmVhO1xyXG4gICAgICAgIH0gd2hpbGUgKFxyXG4gICAgICAgICAgICAvLyBBdm9pZCBwbGF5ZXIgc3RhcnQgYXJlYVxyXG4gICAgICAgICAgICAoTWF0aC5hYnMoeCkgPCBjb25maWcucGxheWVyLnJhZGl1cyAqIDMgJiYgTWF0aC5hYnMoeikgPCBjb25maWcucGxheWVyLnJhZGl1cyAqIDMpIHx8XHJcbiAgICAgICAgICAgIC8vIEF2b2lkIG90aGVyIG9ic3RhY2xlc1xyXG4gICAgICAgICAgICBvYnN0YWNsZXMuc29tZShvID0+IG8uYm9keS5wb3NpdGlvbi5kaXN0YW5jZVRvKG5ldyBDQU5OT04uVmVjMyh4LCBzaXplIC8gMiArIDAuMSwgeikpIDwgKG8uYm9keS5zaGFwZXNbMF0gYXMgQ0FOTk9OLkJveCkuaGFsZkV4dGVudHMueCAqIDIgKyBzaXplKVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIG9ic3RhY2xlTWVzaC5wb3NpdGlvbi5zZXQoeCwgc2l6ZSAvIDIgKyAwLjEsIHopO1xyXG4gICAgICAgIHNjZW5lLmFkZChvYnN0YWNsZU1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCBvYnN0YWNsZVNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKHNpemUgLyAyLCBzaXplIC8gMiwgc2l6ZSAvIDIpKTtcclxuICAgICAgICBjb25zdCBvYnN0YWNsZUJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwLCBzaGFwZTogb2JzdGFjbGVTaGFwZSwgdHlwZTogQ0FOTk9OLkJvZHkuU1RBVElDIH0pO1xyXG4gICAgICAgIG9ic3RhY2xlQm9keS5wb3NpdGlvbi5jb3B5KG9ic3RhY2xlTWVzaC5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgIHBoeXNpY3NXb3JsZC5hZGRCb2R5KG9ic3RhY2xlQm9keSk7XHJcblxyXG4gICAgICAgIG9ic3RhY2xlcy5wdXNoKHsgbWVzaDogb2JzdGFjbGVNZXNoLCBib2R5OiBvYnN0YWNsZUJvZHkgfSk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vLyAtLS0gRXZlbnQgSGFuZGxlcnMgLS0tXHJcbmZ1bmN0aW9uIG9uV2luZG93UmVzaXplKCkge1xyXG4gICAgY2FtZXJhLmFzcGVjdCA9IHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgIHJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAga2V5Ym9hcmRbZXZlbnQuY29kZV0gPSB0cnVlO1xyXG5cclxuICAgIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSkge1xyXG4gICAgICAgIHN0YXJ0R2FtZSgpO1xyXG4gICAgfSBlbHNlIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHtcclxuICAgICAgICByZXNldEdhbWUoKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gb25LZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAga2V5Ym9hcmRbZXZlbnQuY29kZV0gPSBmYWxzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gb25HYW1lcGFkQ29ubmVjdGVkKGV2ZW50OiBHYW1lcGFkRXZlbnQpIHtcclxuICAgIGNvbnNvbGUubG9nKFwiR2FtZXBhZCBjb25uZWN0ZWQ6XCIsIGV2ZW50LmdhbWVwYWQpO1xyXG4gICAgZ2FtZXBhZHNbZXZlbnQuZ2FtZXBhZC5pbmRleF0gPSBldmVudC5nYW1lcGFkO1xyXG4gICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFKSB7XHJcbiAgICAgICAgc3RhcnRHYW1lKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9uR2FtZXBhZERpc2Nvbm5lY3RlZChldmVudDogR2FtZXBhZEV2ZW50KSB7XHJcbiAgICBjb25zb2xlLmxvZyhcIkdhbWVwYWQgZGlzY29ubmVjdGVkOlwiLCBldmVudC5nYW1lcGFkKTtcclxuICAgIGRlbGV0ZSBnYW1lcGFkc1tldmVudC5nYW1lcGFkLmluZGV4XTtcclxufVxyXG5cclxuZnVuY3Rpb24gc3RhcnRHYW1lKCkge1xyXG4gICAgaWYgKGdhbWVTdGF0ZSAhPT0gR2FtZVN0YXRlLlRJVExFKSByZXR1cm47XHJcblxyXG4gICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICBjb25zb2xlLmxvZyhcIkdhbWUgU3RhcnRlZCFcIik7XHJcblxyXG4gICAgdGl0bGVUZXh0U3ByaXRlLnZpc2libGUgPSBmYWxzZTtcclxuICAgIGluc3RydWN0aW9uc1RleHRTcHJpdGUudmlzaWJsZSA9IGZhbHNlO1xyXG5cclxuICAgIHNjb3JlVGV4dFNwcml0ZS52aXNpYmxlID0gdHJ1ZTtcclxuICAgIHVwZGF0ZVRleHRTcHJpdGUoc2NvcmVUZXh0U3ByaXRlLCBgU2NvcmU6ICR7c2NvcmV9IC8gJHtjb25maWcuY29sbGVjdGlibGVzLmNvdW50fWAsIDMwLCBjb25maWcuY29sb3JzLnRleHQpO1xyXG5cclxuICAgIGlmIChiYWNrZ3JvdW5kTXVzaWMgJiYgIWJhY2tncm91bmRNdXNpYy5pc1BsYXlpbmcpIHtcclxuICAgICAgICBiYWNrZ3JvdW5kTXVzaWMucGxheSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnYW1lT3Zlcih3b246IGJvb2xlYW4pIHtcclxuICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICBjb25zb2xlLmxvZyhcIkdhbWUgT3ZlciFcIik7XHJcblxyXG4gICAgc2NvcmVUZXh0U3ByaXRlLnZpc2libGUgPSBmYWxzZTtcclxuXHJcbiAgICBnYW1lT3ZlclRleHRTcHJpdGUudmlzaWJsZSA9IHRydWU7XHJcbiAgICB1cGRhdGVUZXh0U3ByaXRlKGdhbWVPdmVyVGV4dFNwcml0ZSwgd29uID8gXCJZb3UgV29uIVwiIDogXCJHYW1lIE92ZXIhXCIsIDYwLCBjb25maWcuY29sb3JzLnRleHQpO1xyXG4gICAgaW5zdHJ1Y3Rpb25zVGV4dFNwcml0ZS52aXNpYmxlID0gdHJ1ZTtcclxuICAgIHVwZGF0ZVRleHRTcHJpdGUoaW5zdHJ1Y3Rpb25zVGV4dFNwcml0ZSwgXCJQcmVzcyBhbnkga2V5IHRvIHJlc3RhcnRcIiwgMzAsIGNvbmZpZy5jb2xvcnMudGV4dCk7XHJcblxyXG4gICAgaWYgKGJhY2tncm91bmRNdXNpYyAmJiBiYWNrZ3JvdW5kTXVzaWMuaXNQbGF5aW5nKSB7XHJcbiAgICAgICAgYmFja2dyb3VuZE11c2ljLnN0b3AoKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcmVzZXRHYW1lKCkge1xyXG4gICAgY29sbGVjdGlibGVzLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgc2NlbmUucmVtb3ZlKGl0ZW0ubWVzaCk7XHJcbiAgICAgICAgcGh5c2ljc1dvcmxkLnJlbW92ZUJvZHkoaXRlbS5ib2R5KTtcclxuICAgIH0pO1xyXG4gICAgb2JzdGFjbGVzLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgc2NlbmUucmVtb3ZlKGl0ZW0ubWVzaCk7XHJcbiAgICAgICAgcGh5c2ljc1dvcmxkLnJlbW92ZUJvZHkoaXRlbS5ib2R5KTtcclxuICAgIH0pO1xyXG4gICAgY29sbGVjdGlibGVzID0gW107XHJcbiAgICBvYnN0YWNsZXMgPSBbXTtcclxuXHJcbiAgICBwbGF5ZXJCb2R5LnBvc2l0aW9uLnNldCgwLCBjb25maWcucGxheWVyLnJhZGl1cyArIDAuMSwgMCk7XHJcbiAgICBwbGF5ZXJCb2R5LnZlbG9jaXR5LnNldCgwLCAwLCAwKTtcclxuICAgIHBsYXllckJvZHkuYW5ndWxhclZlbG9jaXR5LnNldCgwLCAwLCAwKTtcclxuICAgIGNhbkp1bXAgPSB0cnVlO1xyXG4gICAganVtcENvdW50ID0gMDtcclxuICAgIHNjb3JlID0gMDtcclxuXHJcbiAgICBzcGF3bkNvbGxlY3RpYmxlcygpO1xyXG4gICAgc3Bhd25PYnN0YWNsZXMoKTtcclxuICAgIHJlbWFpbmluZ0NvbGxlY3RpYmxlcyA9IGNvbmZpZy5jb2xsZWN0aWJsZXMuY291bnQ7XHJcblxyXG4gICAgZ2FtZU92ZXJUZXh0U3ByaXRlLnZpc2libGUgPSBmYWxzZTtcclxuICAgIHNjb3JlVGV4dFNwcml0ZS52aXNpYmxlID0gZmFsc2U7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0U3ByaXRlLnZpc2libGUgPSBmYWxzZTtcclxuXHJcbiAgICBnYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICB0aXRsZVRleHRTcHJpdGUudmlzaWJsZSA9IHRydWU7XHJcbiAgICBpbnN0cnVjdGlvbnNUZXh0U3ByaXRlLnZpc2libGUgPSB0cnVlO1xyXG4gICAgdXBkYXRlVGV4dFNwcml0ZShpbnN0cnVjdGlvbnNUZXh0U3ByaXRlLCBcIlByZXNzIGFueSBrZXkgdG8gU3RhcnRcIiwgMzAsIGNvbmZpZy5jb2xvcnMudGV4dCk7XHJcbn1cclxuXHJcbi8vIC0tLSBHYW1lIExvb3AgLS0tXHJcbmZ1bmN0aW9uIGFuaW1hdGUodGltZXN0YW1wOiBET01IaWdoUmVzVGltZVN0YW1wKSB7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbWF0ZSk7XHJcblxyXG4gICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWVzdGFtcCAtIGxhc3RUaW1lc3RhbXApIC8gMTAwMDsgLy8gQ29udmVydCB0byBzZWNvbmRzXHJcbiAgICBsYXN0VGltZXN0YW1wID0gdGltZXN0YW1wO1xyXG5cclxuICAgIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgdXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgcmVuZGVyKCk7XHJcbiAgICB9IGVsc2UgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgIHJlbmRlcigpOyAvLyBSZW5kZXIgVUkgb25seVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgIGNvbnN0IGlucHV0VmVsb2NpdHkgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgY29uc3QgcGxheWVyU3BlZWQgPSBjb25maWcucGxheWVyLnNwZWVkO1xyXG5cclxuICAgIC8vIEtleWJvYXJkIGlucHV0XHJcbiAgICBpZiAoa2V5Ym9hcmRbJ0tleVcnXSkgaW5wdXRWZWxvY2l0eS56IC09IHBsYXllclNwZWVkO1xyXG4gICAgaWYgKGtleWJvYXJkWydLZXlTJ10pIGlucHV0VmVsb2NpdHkueiArPSBwbGF5ZXJTcGVlZDtcclxuICAgIGlmIChrZXlib2FyZFsnS2V5QSddKSBpbnB1dFZlbG9jaXR5LnggLT0gcGxheWVyU3BlZWQ7XHJcbiAgICBpZiAoa2V5Ym9hcmRbJ0tleUQnXSkgaW5wdXRWZWxvY2l0eS54ICs9IHBsYXllclNwZWVkO1xyXG5cclxuICAgIC8vIEdhbWVwYWQgaW5wdXRcclxuICAgIGNvbnN0IGdhbWVwYWQgPSBuYXZpZ2F0b3IuZ2V0R2FtZXBhZHMoKVswXTsgLy8gVXNlIHRoZSBmaXJzdCBjb25uZWN0ZWQgZ2FtZXBhZFxyXG4gICAgaWYgKGdhbWVwYWQpIHtcclxuICAgICAgICAvLyBMZWZ0IHN0aWNrIGZvciBtb3ZlbWVudCAoYXhlcyAwIGFuZCAxKVxyXG4gICAgICAgIGNvbnN0IGF4ZXMgPSBnYW1lcGFkLmF4ZXM7XHJcbiAgICAgICAgLy8gQXBwbHkgZGVhZHpvbmUgdG8gcHJldmVudCBkcmlmdFxyXG4gICAgICAgIGNvbnN0IGRlYWR6b25lID0gMC4xNTtcclxuICAgICAgICBpZiAoTWF0aC5hYnMoYXhlc1swXSkgPiBkZWFkem9uZSkgaW5wdXRWZWxvY2l0eS54ICs9IGF4ZXNbMF0gKiBwbGF5ZXJTcGVlZDtcclxuICAgICAgICBpZiAoTWF0aC5hYnMoYXhlc1sxXSkgPiBkZWFkem9uZSkgaW5wdXRWZWxvY2l0eS56ICs9IGF4ZXNbMV0gKiBwbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgLy8gQSBidXR0b24gKGJ1dHRvbiAwKSBmb3IganVtcFxyXG4gICAgICAgIGlmIChnYW1lcGFkLmJ1dHRvbnNbMF0/LnByZXNzZWQgJiYgY2FuSnVtcCAmJiBqdW1wQ291bnQgPCBjb25maWcucGxheWVyLm1heEp1bXBzKSB7XHJcbiAgICAgICAgICAgIHBsYXllckJvZHkudmVsb2NpdHkueSA9IGNvbmZpZy5wbGF5ZXIuanVtcEZvcmNlO1xyXG4gICAgICAgICAgICBjYW5KdW1wID0gZmFsc2U7IC8vIFByZXZlbnQgY29udGludW91cyBqdW1wIGJ5IGhvbGRpbmdcclxuICAgICAgICAgICAganVtcENvdW50Kys7XHJcbiAgICAgICAgfSBlbHNlIGlmICghZ2FtZXBhZC5idXR0b25zWzBdPy5wcmVzc2VkKSB7XHJcbiAgICAgICAgICAgIGNhbkp1bXAgPSB0cnVlOyAvLyBBbGxvdyBqdW1wIGFnYWluIGlmIGJ1dHRvbiByZWxlYXNlZFxyXG4gICAgICAgIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gS2V5Ym9hcmQganVtcFxyXG4gICAgICAgIGlmIChrZXlib2FyZFsnU3BhY2UnXSAmJiBjYW5KdW1wICYmIGp1bXBDb3VudCA8IGNvbmZpZy5wbGF5ZXIubWF4SnVtcHMpIHtcclxuICAgICAgICAgICAgcGxheWVyQm9keS52ZWxvY2l0eS55ID0gY29uZmlnLnBsYXllci5qdW1wRm9yY2U7XHJcbiAgICAgICAgICAgIGNhbkp1bXAgPSBmYWxzZTtcclxuICAgICAgICAgICAganVtcENvdW50Kys7XHJcbiAgICAgICAgfSBlbHNlIGlmICgha2V5Ym9hcmRbJ1NwYWNlJ10pIHtcclxuICAgICAgICAgICAgY2FuSnVtcCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChpbnB1dFZlbG9jaXR5Lmxlbmd0aFNxKCkgPiAwKSB7XHJcbiAgICAgICAgaW5wdXRWZWxvY2l0eS5ub3JtYWxpemUoKS5tdWx0aXBseVNjYWxhcihwbGF5ZXJTcGVlZCk7XHJcbiAgICAgICAgLy8gRGlyZWN0bHkgc2V0IGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICBwbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSBpbnB1dFZlbG9jaXR5Lng7XHJcbiAgICAgICAgcGxheWVyQm9keS52ZWxvY2l0eS56ID0gaW5wdXRWZWxvY2l0eS56O1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBHZW50bHkgc2xvdyBkb3duIGhvcml6b250YWwgdmVsb2NpdHkgd2hlbiBubyBpbnB1dFxyXG4gICAgICAgIHBsYXllckJvZHkudmVsb2NpdHkueCAqPSAwLjk7XHJcbiAgICAgICAgcGxheWVyQm9keS52ZWxvY2l0eS56ICo9IDAuOTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBQaHlzaWNzIHN0ZXBcclxuICAgIHBoeXNpY3NXb3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCAzKTsgLy8gRml4ZWQgdGltZSBzdGVwIGZvciBwaHlzaWNzXHJcblxyXG4gICAgLy8gU3luYyBUaHJlZS5qcyBtZXNoZXMgd2l0aCBDYW5ub24uanMgYm9kaWVzXHJcbiAgICBwbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkocGxheWVyQm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgcGxheWVyTWVzaC5xdWF0ZXJuaW9uLmNvcHkocGxheWVyQm9keS5xdWF0ZXJuaW9uIGFzIGFueSk7XHJcblxyXG4gICAgY29sbGVjdGlibGVzLmZvckVhY2goaXRlbSA9PiB7XHJcbiAgICAgICAgaXRlbS5tZXNoLnBvc2l0aW9uLmNvcHkoaXRlbS5ib2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgaXRlbS5tZXNoLnF1YXRlcm5pb24uY29weShpdGVtLmJvZHkucXVhdGVybmlvbiBhcyBhbnkpO1xyXG4gICAgICAgIC8vIFNpbXBsZSByb3RhdGlvbiBmb3IgY29sbGVjdGlibGVzXHJcbiAgICAgICAgaXRlbS5tZXNoLnJvdGF0aW9uLnkgKz0gZGVsdGFUaW1lICogMjtcclxuICAgIH0pO1xyXG5cclxuICAgIG9ic3RhY2xlcy5mb3JFYWNoKGl0ZW0gPT4ge1xyXG4gICAgICAgIGl0ZW0ubWVzaC5wb3NpdGlvbi5jb3B5KGl0ZW0uYm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgIGl0ZW0ubWVzaC5xdWF0ZXJuaW9uLmNvcHkoaXRlbS5ib2R5LnF1YXRlcm5pb24gYXMgYW55KTtcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENhbWVyYSBmb2xsb3cgcGxheWVyXHJcbiAgICBjYW1lcmEucG9zaXRpb24ueCA9IHBsYXllck1lc2gucG9zaXRpb24ueDtcclxuICAgIGNhbWVyYS5wb3NpdGlvbi55ID0gcGxheWVyTWVzaC5wb3NpdGlvbi55ICsgY29uZmlnLmNhbWVyYS5oZWlnaHQ7XHJcbiAgICBjYW1lcmEucG9zaXRpb24ueiA9IHBsYXllck1lc2gucG9zaXRpb24ueiArIGNvbmZpZy5jYW1lcmEuZGlzdGFuY2U7XHJcbiAgICBjYW1lcmEubG9va0F0KHBsYXllck1lc2gucG9zaXRpb24pO1xyXG5cclxuXHJcbiAgICAvLyBDaGVjayBmb3IgY29sbGVjdGlibGUgY29sbGlzaW9uc1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb2xsZWN0aWJsZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBjb25zdCBjb2xsZWN0aWJsZSA9IGNvbGxlY3RpYmxlc1tpXTtcclxuICAgICAgICBpZiAoY29sbGVjdGlibGUuYm9keS5wb3NpdGlvbi5kaXN0YW5jZVRvKHBsYXllckJvZHkucG9zaXRpb24pIDwgY29uZmlnLnBsYXllci5yYWRpdXMgKyBjb25maWcuY29sbGVjdGlibGVzLnJhZGl1cykge1xyXG4gICAgICAgICAgICBzY2VuZS5yZW1vdmUoY29sbGVjdGlibGUubWVzaCk7XHJcbiAgICAgICAgICAgIHBoeXNpY3NXb3JsZC5yZW1vdmVCb2R5KGNvbGxlY3RpYmxlLmJvZHkpO1xyXG4gICAgICAgICAgICBjb2xsZWN0aWJsZXMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICBpLS07IC8vIEFkanVzdCBpbmRleCBhZnRlciByZW1vdmFsXHJcblxyXG4gICAgICAgICAgICBzY29yZSsrO1xyXG4gICAgICAgICAgICByZW1haW5pbmdDb2xsZWN0aWJsZXMtLTtcclxuICAgICAgICAgICAgdXBkYXRlVGV4dFNwcml0ZShzY29yZVRleHRTcHJpdGUsIGBTY29yZTogJHtzY29yZX0gLyAke2NvbmZpZy5jb2xsZWN0aWJsZXMuY291bnR9YCwgMzAsIGNvbmZpZy5jb2xvcnMudGV4dCk7XHJcblxyXG4gICAgICAgICAgICBpZiAoY29sbGVjdFNvdW5kICYmICFjb2xsZWN0U291bmQuaXNQbGF5aW5nKSB7XHJcbiAgICAgICAgICAgICAgICBjb2xsZWN0U291bmQucGxheSgpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAocmVtYWluaW5nQ29sbGVjdGlibGVzIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIGdhbWVPdmVyKHRydWUpOyAvLyBQbGF5ZXIgd29uIVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGZvciBwbGF5ZXIgZmFsbGluZyBvZmYgdGhlIHBsYXRmb3JtXHJcbiAgICBpZiAocGxheWVyTWVzaC5wb3NpdGlvbi55IDwgLTE1KSB7IC8vIGFyYml0cmFyeSBmYWxsIGRldGVjdGlvblxyXG4gICAgICAgIGdhbWVPdmVyKGZhbHNlKTsgLy8gUGxheWVyIGxvc3QhXHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlbmRlcigpIHtcclxuICAgIHJlbmRlcmVyLnJlbmRlcihzY2VuZSwgY2FtZXJhKTtcclxufVxyXG5cclxuLy8gU3RhcnQgdGhlIGdhbWUgaW5pdGlhbGl6YXRpb25cclxuaW5pdEdhbWUoKS5jYXRjaChjb25zb2xlLmVycm9yKTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBeUR4QixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSSxlQUEwRCxDQUFDO0FBQy9ELElBQUksWUFBdUQsQ0FBQztBQUM1RCxJQUFJO0FBQ0os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
