// 3D Game Example with Three.js and Cannon.js
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

// Get the canvas element
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
if (!canvas) {
  console.error("Canvas element with ID 'gameCanvas' not found.");
  throw new Error("Canvas element with ID 'gameCanvas' not found.");
}

// Global game configuration and state
let gameConfig: any;
let gameStarted: boolean = false;
let playerSpeed: number;
let jumpVelocity: number;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 0, 500);

// Camera setup
const camera = new THREE.PerspectiveCamera(
  75,
  canvas.clientWidth / canvas.clientHeight, // Use canvas dimensions
  0.1,
  1000
);
// Initial camera position will be set by PointerLockControls

// Renderer setup
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); // Draw directly to the specified canvas
renderer.setSize(canvas.clientWidth, canvas.clientHeight); // Use canvas dimensions
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Audio setup
const audioListener = new THREE.AudioListener();
camera.add(audioListener);
const audioLoader = new THREE.AudioLoader();
const textureLoader = new THREE.TextureLoader();

let loadedTextures: { [name: string]: THREE.Texture } = {};
let loadedAudioBuffers: { [name: string]: AudioBuffer } = {};
let backgroundMusic: THREE.Audio | null = null;
let collectSoundEffect: THREE.Audio | null = null;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 50, 50);
directionalLight.castShadow = true;
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// Physics world
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

// Ground
const groundGeometry = new THREE.PlaneGeometry(100, 100);
let groundTexture: THREE.Texture | null = null;
const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0x2ecc71,
  roughness: 0.8,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const groundBody = new CANNON.Body({
  mass: 0,
  shape: new CANNON.Plane(),
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// Player
const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
let playerTexture: THREE.Texture | null = null;
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.set(0, 1, 0); // Player mesh is centered at Y=1, so its base is at Y=0
player.castShadow = true;
scene.add(player);

const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5)); // Half-extents
const playerBody = new CANNON.Body({
  mass: 5,
  shape: playerShape,
  position: new CANNON.Vec3(0, 1, 0), // Body is centered at Y=1, so its base is at Y=0
  linearDamping: 0.9,
  angularDamping: 0.9,
});
world.addBody(playerBody);

// Prevent player from rotating
playerBody.fixedRotation = true;
playerBody.updateMassProperties();

// Controls
const controls = new PointerLockControls(camera, document.body);
// Set initial position of controls (player's eye level). Player is 2 units tall, center at 1, so eye level could be 1.5.
controls.object.position.set(0, 1.5, 0); // FIX: Changed getObject() to object
scene.add(controls.object); // FIX: Changed getObject() to object

const keys: { [key: string]: boolean } = {};
let canJump = false;

document.addEventListener("keydown", (e) => {
  if (!gameStarted) return; // Ignore input if game hasn't started
  keys[e.key.toLowerCase()] = true;

  if (e.key === " " && canJump) {
    playerBody.velocity.y = jumpVelocity; // Use configurable jump velocity
    canJump = false;
  }
});

document.addEventListener("keyup", (e) => {
  if (!gameStarted) return; // Ignore input if game hasn't started
  keys[e.key.toLowerCase()] = false;
});

// Check if player can jump
playerBody.addEventListener("collide", (event: any) => {
  // Check if player collided with the ground or another body below it
  const contactNormal = new CANNON.Vec3();
  const upAxis = new CANNON.Vec3(0, 1, 0);

  // Check contacts for a normal pointing roughly upwards
  for (let i = 0; i < event.contacts.length; i++) {
    const contact = event.contacts[i];
    if (contact.bi.id === playerBody.id) {
      contact.ni.negate(contactNormal); // Normal points from body B to A
    } else {
      contactNormal.copy(contact.ni); // Normal points from body A to B
    }

    // If the normal is pointing mostly upwards, we are on the ground
    if (contactNormal.dot(upAxis) > 0.5) { // Threshold for "mostly upwards"
      canJump = true;
      break;
    }
  }
});

// Collectible spheres
const collectibles: {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  collected: boolean;
}[] = [];
let collectibleTexture: THREE.Texture | null = null;
const sphereMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd700,
  emissive: 0xffaa00,
  emissiveIntensity: 0.5,
  metalness: 0.7,
  roughness: 0.3,
});
for (let i = 0; i < 8; i++) {
  const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.castShadow = true;

  const x = (Math.random() - 0.5) * 40;
  const z = (Math.random() - 0.5) * 40;
  sphere.position.set(x, 0.5, z);
  scene.add(sphere);

  const sphereShape = new CANNON.Sphere(0.5);
  const sphereBody = new CANNON.Body({
    mass: 0,
    shape: sphereShape,
    position: new CANNON.Vec3(x, 0.5, z),
  });
  world.addBody(sphereBody);

  collectibles.push({ mesh: sphere, body: sphereBody, collected: false });
}

// Some obstacle cubes
const obstacles: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
let obstacleTexture: THREE.Texture | null = null;
const cubeMaterial = new THREE.MeshStandardMaterial({
  color: 0xe74c3c,
  roughness: 0.7,
});
for (let i = 0; i < 5; i++) {
  const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  cube.castShadow = true;
  cube.receiveShadow = true;

  const x = (Math.random() - 0.5) * 30;
  const z = (Math.random() - 0.5) * 30;
  cube.position.set(x, 1, z);
  scene.add(cube);

  const cubeShape = new CANNON.Box(new CANNON.Vec3(1, 1, 1));
  const cubeBody = new CANNON.Body({
    mass: 0,
    shape: cubeShape,
    position: new CANNON.Vec3(x, 1, z),
  });
  world.addBody(cubeBody);

  obstacles.push({ mesh: cube, body: cubeBody });
}

// Score display (dynamically created)
let score = 0;
const scoreElement = document.createElement("div");
scoreElement.id = "score";
scoreElement.style.position = "absolute";
scoreElement.style.top = "10px";
scoreElement.style.left = "10px";
scoreElement.style.color = "white";
scoreElement.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
scoreElement.style.padding = "10px";
scoreElement.style.fontFamily = "Arial, sans-serif";
scoreElement.style.fontSize = "1.2em";
scoreElement.style.borderRadius = "5px";
scoreElement.style.zIndex = "100";
document.body.appendChild(scoreElement);
scoreElement.textContent = `Score: ${score}`;

function checkCollectibles() {
  collectibles.forEach((item) => {
    if (!item.collected) {
      const dist = playerBody.position.distanceTo(item.body.position);
      if (dist < 1.5) {
        item.collected = true;
        scene.remove(item.mesh);
        world.removeBody(item.body);
        score += 100;
        if (collectSoundEffect) {
          if (collectSoundEffect.isPlaying) {
            collectSoundEffect.stop();
          }
          collectSoundEffect.play();
        }
      }
    }
  });
}

function updatePlayer() {
  // Calculate desired movement direction based on controls orientation
  const forwardVector = new THREE.Vector3();
  const rightVector = new THREE.Vector3();

  controls.getDirection(forwardVector); // Gets forward vector of the camera
  forwardVector.y = 0; // Restrict movement to horizontal plane
  forwardVector.normalize();

  rightVector.crossVectors(forwardVector, new THREE.Vector3(0, 1, 0)); // Calculate right vector
  rightVector.normalize();

  // Desired horizontal velocity vector from input
  const desiredHorizontalVelocity = new THREE.Vector3(0, 0, 0);
  if (keys["w"] || keys["arrowup"]) desiredHorizontalVelocity.addScaledVector(forwardVector, playerSpeed);
  if (keys["s"] || keys["arrowdown"]) desiredHorizontalVelocity.addScaledVector(forwardVector, -playerSpeed);
  if (keys["a"] || keys["arrowleft"]) desiredHorizontalVelocity.addScaledVector(rightVector, -playerSpeed);
  if (keys["d"] || keys["arrowright"]) desiredHorizontalVelocity.addScaledVector(rightVector, playerSpeed);

  // Apply desired horizontal velocity to player body, preserving vertical velocity
  playerBody.velocity.x = desiredHorizontalVelocity.x;
  playerBody.velocity.z = desiredHorizontalVelocity.z;

  // Sync Three.js player mesh to Cannon.js player body
  player.position.copy(playerBody.position as any);
  // player.quaternion.copy(playerBody.quaternion as any); // Player body has fixed rotation

  // Sync controls (camera) position to player body position (at eye level)
  controls.object.position.copy(playerBody.position as any); // FIX: Changed getObject() to object
  controls.object.position.y += 0.5; // Offset by half player height + small amount for eye level // FIX: Changed getObject() to object
}

// Rotate collectibles
function animateCollectibles() {
  collectibles.forEach((item) => {
    if (!item.collected) {
      item.mesh.rotation.y += 0.02;
      item.mesh.position.y = 0.5 + Math.sin(Date.now() * 0.002) * 0.2;
    }
  });
}

// Animation loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();
  world.step(1 / 60, deltaTime, 3); // Physics step runs always for consistency

  if (gameStarted) {
    // Update obstacles
    obstacles.forEach(({ mesh, body }) => {
      mesh.position.copy(body.position as any);
      mesh.quaternion.copy(body.quaternion as any);
    });

    updatePlayer();
    checkCollectibles();
    animateCollectibles();

    // Update score
    scoreElement.textContent = `Score: ${score}`;

    // Win condition
    if (collectibles.every((c) => c.collected)) {
      scoreElement.textContent = `Score: ${score} - YOU WIN! 🎉`;
      // Optionally stop game or show end screen here
      // gameStarted = false;
      if (backgroundMusic && backgroundMusic.isPlaying) {
        backgroundMusic.stop();
      }
    }
  }

  renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener("resize", () => {
  const currentCanvas = renderer.domElement;
  const width = currentCanvas.clientWidth;
  const height = currentCanvas.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

// --- Asset Loading ---

async function loadAssets(assetsConfig: any) {
  const texturePromises = assetsConfig.images.map((img: any) => {
    return new Promise<void>((resolve, reject) => {
      textureLoader.load(img.path, (texture) => {
        loadedTextures[img.name] = texture;
        resolve();
      }, undefined, (err) => {
        console.error(`Failed to load texture: ${img.path}`, err);
        reject(err);
      });
    });
  });

  const soundPromises = assetsConfig.sounds.map((snd: any) => {
    return new Promise<void>((resolve, reject) => {
      audioLoader.load(snd.path, (buffer) => {
        loadedAudioBuffers[snd.name] = buffer;
        resolve();
      }, undefined, (err) => {
        console.error(`Failed to load sound: ${snd.path}`, err);
        reject(err);
      });
    });
  });

  await Promise.all([...texturePromises, ...soundPromises]);
  console.log("All assets loaded.");
}


// --- Game Data Loading and Title Screen ---

async function loadGameData() {
  try {
    const response = await fetch('data.json');
    gameConfig = await response.json();
    console.log("Game config loaded:", gameConfig);

    playerSpeed = gameConfig.playerSpeed !== undefined ? gameConfig.playerSpeed : 7; // Default speed
    jumpVelocity = gameConfig.jumpVelocity !== undefined ? gameConfig.jumpVelocity : 8; // Default jump strength

    // Load all assets specified in gameConfig
    if (gameConfig.assets) {
      await loadAssets(gameConfig.assets);

      // Apply textures to materials
      groundTexture = loadedTextures["ground_texture"];
      if (groundTexture) {
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(10, 10);
        groundMaterial.map = groundTexture;
        groundMaterial.needsUpdate = true;
        groundMaterial.color.set(0xffffff); // Set to white to fully show texture
      }

      playerTexture = loadedTextures["player_texture"];
      if (playerTexture) {
        playerMaterial.map = playerTexture;
        playerMaterial.needsUpdate = true;
        playerMaterial.color.set(0xffffff); // Set to white to fully show texture
      }

      collectibleTexture = loadedTextures["collectible_texture"];
      if (collectibleTexture) {
        sphereMaterial.map = collectibleTexture;
        sphereMaterial.needsUpdate = true;
        sphereMaterial.color.set(0xffffff); // Set to white to fully show texture
      }

      obstacleTexture = loadedTextures["obstacle_texture"];
      if (obstacleTexture) {
        cubeMaterial.map = obstacleTexture;
        cubeMaterial.needsUpdate = true;
        cubeMaterial.color.set(0xffffff); // Set to white to fully show texture
      }

      // Initialize audio objects
      if (loadedAudioBuffers["background_music"]) {
        backgroundMusic = new THREE.Audio(audioListener);
        backgroundMusic.setBuffer(loadedAudioBuffers["background_music"]);
        backgroundMusic.setLoop(true);
        backgroundMusic.setVolume(gameConfig.assets.sounds.find((s: any) => s.name === "background_music")?.volume || 0.5);
      }
      if (loadedAudioBuffers["collect_sound"]) {
        collectSoundEffect = new THREE.Audio(audioListener);
        collectSoundEffect.setBuffer(loadedAudioBuffers["collect_sound"]);
        collectSoundEffect.setVolume(gameConfig.assets.sounds.find((s: any) => s.name === "collect_sound")?.volume || 1.0);
      }
    }

    setupTitleScreen();
  } catch (error) {
    console.error("Failed to load game data or assets:", error);
    throw new Error("Failed to load game data or assets.");
  }
}

function setupTitleScreen() {
  const titleScreenDiv = document.createElement("div");
  titleScreenDiv.id = "titleScreen";
  titleScreenDiv.style.position = "absolute";
  titleScreenDiv.style.top = "0";
  titleScreenDiv.style.left = "0";
  titleScreenDiv.style.width = "100%";
  titleScreenDiv.style.height = "100%";
  titleScreenDiv.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  titleScreenDiv.style.color = "white";
  titleScreenDiv.style.display = "flex";
  titleScreenDiv.style.flexDirection = "column";
  titleScreenDiv.style.justifyContent = "center";
  titleScreenDiv.style.alignItems = "center";
  titleScreenDiv.style.fontSize = "2em";
  titleScreenDiv.style.textAlign = "center";
  titleScreenDiv.style.zIndex = "1000"; // Ensure it's on top

  const titleText = document.createElement("h1");
  titleText.textContent = gameConfig.gameTitle || "Sample 3D Game";
  titleText.style.marginBottom = "20px";
  titleScreenDiv.appendChild(titleText);

  const startButton = document.createElement("button");
  startButton.textContent = gameConfig.startButtonText || "Click to Start";
  startButton.style.padding = "15px 30px";
  startButton.style.fontSize = "1em";
  startButton.style.backgroundColor = "#4CAF50";
  startButton.style.color = "white";
  startButton.style.border = "none";
  startButton.style.borderRadius = "5px";
  startButton.style.cursor = "pointer";
  startButton.style.marginTop = "20px";
  startButton.onmouseover = () => startButton.style.backgroundColor = "#45a049";
  startButton.onmouseout = () => startButton.style.backgroundColor = "#4CAF50";
  titleScreenDiv.appendChild(startButton);

  document.body.appendChild(titleScreenDiv);

  startButton.addEventListener("click", () => {
    gameStarted = true;
    titleScreenDiv.remove();
    controls.lock(); // Request pointer lock after user interaction
    if (backgroundMusic) {
      backgroundMusic.play();
    }
    animate(); // Start the animation loop after dismissing title screen
  });
}

// Start by loading game data
loadGameData();