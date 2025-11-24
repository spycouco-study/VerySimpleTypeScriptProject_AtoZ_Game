// 3D Game Example with Three.js and Cannon.js
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

// Interface for game data structure
interface GameData {
  name: string;
  type: string;
  description: string;
  author: string;
  createdAt: string;
  playerSettings: {
    movementSpeed: number;
    jumpStrength: number;
  };
  assets: {
    images: { name: string; path: string; width: number; height: number; }[];
    sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
  };
}

// Global variable for game data, initialized with a default fallback
let gameData: GameData = {
  name: "Default Game",
  type: "3d",
  description: "Default game settings, data.json not loaded.",
  author: "System",
  createdAt: new Date().toISOString(),
  playerSettings: { movementSpeed: 5, jumpStrength: 8 }, // Default values
  assets: { images: [], sounds: [] }
};

// Function to load game data from data.json
async function loadGameData() {
  try {
    const response = await fetch('data.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    gameData = await response.json();
    console.log("Game data loaded:", gameData);
  } catch (error) {
    console.error("Failed to load game data, using default settings:", error);
    // gameData already has default values, so no further action needed here
  }
}

// Main game initialization function, runs after data is loaded
async function startGame() {
  await loadGameData(); // Ensure data is loaded before proceeding

  // Get the canvas element
  const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas element with ID 'gameCanvas' not found.");
    throw new Error("Canvas element with ID 'gameCanvas' not found.");
  }

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
  camera.position.set(0, 5, 10);

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); // Draw directly to the specified canvas
  renderer.setSize(canvas.clientWidth, canvas.clientHeight); // Use canvas dimensions
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // No need to append renderer.domElement as it's already using the provided canvas

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
  const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x3498db });
  const player = new THREE.Mesh(playerGeometry, playerMaterial);
  player.position.set(0, 1, 0);
  player.castShadow = true;
  scene.add(player);

  const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5));
  const playerBody = new CANNON.Body({
    mass: 5,
    shape: playerShape,
    position: new CANNON.Vec3(0, 1, 0),
    linearDamping: 0.9,
    angularDamping: 0.9,
  });
  world.addBody(playerBody);

  // Prevent player from rotating
  playerBody.fixedRotation = true;
  playerBody.updateMassProperties();

  // Collectible spheres
  const collectibles: {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    collected: boolean;
  }[] = [];
  for (let i = 0; i < 8; i++) {
    const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffaa00,
      emissiveIntensity: 0.5,
      metalness: 0.7,
      roughness: 0.3,
    });
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
  for (let i = 0; i < 5; i++) {
    const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
    const cubeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe74c3c,
      roughness: 0.7,
    });
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

  // Controls
  const keys: { [key: string]: boolean } = {};
  let canJump = false;

  document.addEventListener("keydown", (e) => {
    keys[e.key.toLowerCase()] = true;

    if (e.key === " " && canJump) {
      playerBody.velocity.y = gameData.playerSettings.jumpStrength; // Use jump strength from data.json
      canJump = false;
    }
  });

  document.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Check if player can jump
  playerBody.addEventListener("collide", (event: any) => {
    if (event.body === groundBody) {
      canJump = true;
    }
  });

  // Score
  let score = 0;
  // Assuming there will be a score element in the HTML, for now keep original logic.
  const scoreElement = document.getElementById("score")!;

  function checkCollectibles() {
    collectibles.forEach((item, index) => {
      if (!item.collected) {
        const dist = playerBody.position.distanceTo(item.body.position);
        if (dist < 1.5) {
          item.collected = true;
          scene.remove(item.mesh);
          world.removeBody(item.body);
          score += 100;
        }
      }
    });
  }

  function updatePlayer() {
    const speed = gameData.playerSettings.movementSpeed; // Use movement speed from data.json
    const direction = new CANNON.Vec3();

    if (keys["w"] || keys["arrowup"]) direction.z -= speed;
    if (keys["s"] || keys["arrowdown"]) direction.z += speed;
    if (keys["a"] || keys["arrowleft"]) direction.x -= speed;
    if (keys["d"] || keys["arrowright"]) direction.x += speed;

    playerBody.velocity.x = direction.x;
    playerBody.velocity.z = direction.z;

    // Update player mesh position
    player.position.copy(playerBody.position as any);
    player.quaternion.copy(playerBody.quaternion as any);

    // Camera follows player
    camera.position.x = player.position.x;
    camera.position.y = player.position.y + 5;
    camera.position.z = player.position.z + 10;
    camera.lookAt(player.position);

    // Update score
    if (scoreElement) { // Add a check in case scoreElement is not found in the HTML
      scoreElement.textContent = `Score: ${score}`;
    }

    // Win condition
    if (collectibles.every((c) => c.collected)) {
      if (scoreElement) {
        scoreElement.textContent = `Score: ${score} - YOU WIN! 🎉`;
      }
    }
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
    world.step(1 / 60, deltaTime, 3);

    // Update obstacles
    obstacles.forEach(({ mesh, body }) => {
      mesh.position.copy(body.position as any);
      mesh.quaternion.copy(body.quaternion as any);
    });

    updatePlayer();
    checkCollectibles();
    animateCollectibles();

    renderer.render(scene, camera);
  }

  // Handle window resize
  window.addEventListener("resize", () => {
    const currentCanvas = renderer.domElement; // This is the <canvas id="gameCanvas">
    const width = currentCanvas.clientWidth;
    const height = currentCanvas.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  animate();
}

// Start the game initialization process
startGame();