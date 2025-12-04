"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const OrbitControls_js_1 = require("https://esm.sh/three/examples/jsm/controls/OrbitControls.js");
const THREE = __importStar(require("three"));
const CANNON = __importStar(require("cannon-es"));
// Global game variables
let scene;
let camera;
let renderer;
let controls;
let world;
let ballBody;
let ballMesh;
let groundBody;
let groundMesh;
let audioListener;
let bgmSound;
let bounceSound;
let gameConfig;
let textures = new Map();
let audioBuffers = new Map();
let isGameStarted = false;
let keyState = {};
let titleScreenElement = null;
let gameCanvas = null;
async function main() {
    try {
        const response = await fetch("data.json");
        gameConfig = await response.json();
        // Setup canvas first to ensure it exists for renderer
        gameCanvas = document.createElement("canvas");
        gameCanvas.id = "gameCanvas";
        document.body.appendChild(gameCanvas);
        await loadAssets(gameConfig.assets);
        showTitleScreen();
    }
    catch (error) {
        console.error("Failed to load game config or assets:", error);
    }
}
async function loadAssets(assets) {
    const textureLoader = new THREE.TextureLoader();
    const audioLoader = new THREE.AudioLoader();
    const imagePromises = assets.images.map((img) => {
        return new Promise((resolve, reject) => {
            textureLoader.load(img.path, (texture) => {
                // Explicit type for 'texture'
                textures.set(img.name, texture);
                resolve();
            }, undefined, // Progress callback not used for simplicity
            (error) => {
                // Explicit type for 'error'
                console.error(`Failed to load image: ${img.path}`, error);
                reject(error);
            });
        });
    });
    const soundPromises = assets.sounds.map((snd) => {
        return new Promise((resolve, reject) => {
            audioLoader.load(snd.path, (buffer) => {
                // Explicit type for 'buffer'
                audioBuffers.set(snd.name, buffer);
                resolve();
            }, undefined, // Progress callback not used for simplicity
            (error) => {
                // Explicit type for 'error'
                console.error(`Failed to load sound: ${snd.path}`, error);
                reject(error);
            });
        });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
}
function showTitleScreen() {
    titleScreenElement = document.createElement("div");
    titleScreenElement.style.position = "fixed";
    titleScreenElement.style.top = "0";
    titleScreenElement.style.left = "0";
    titleScreenElement.style.width = "100%";
    titleScreenElement.style.height = "100%";
    titleScreenElement.style.backgroundColor = "rgba(0,0,0,0.8)";
    titleScreenElement.style.color = "white";
    titleScreenElement.style.display = "flex";
    titleScreenElement.style.flexDirection = "column";
    titleScreenElement.style.justifyContent = "center";
    titleScreenElement.style.alignItems = "center";
    titleScreenElement.style.fontSize = "3em";
    titleScreenElement.style.fontFamily = "Arial, sans-serif";
    titleScreenElement.style.cursor = "pointer";
    titleScreenElement.style.zIndex = "1000";
    const titleText = document.createElement("h1");
    titleText.textContent = gameConfig.gameSettings.gameTitle || "Ball Game";
    titleText.style.marginBottom = "20px";
    const instructionText = document.createElement("p");
    instructionText.textContent =
        gameConfig.gameSettings.titleText || "Click to Start";
    instructionText.style.fontSize = "0.5em";
    titleScreenElement.appendChild(titleText);
    titleScreenElement.appendChild(instructionText);
    document.body.appendChild(titleScreenElement);
    titleScreenElement.addEventListener("click", startGame);
}
function startGame() {
    if (isGameStarted)
        return; // Prevent multiple starts
    isGameStarted = true;
    if (titleScreenElement) {
        document.body.removeChild(titleScreenElement);
        titleScreenElement = null;
    }
    initGame();
    animate();
    // Key event listeners for ball control
    window.addEventListener("keydown", (event) => {
        keyState[event.key] = true;
    });
    window.addEventListener("keyup", (event) => {
        keyState[event.key] = false;
    });
    // Window resize listener
    window.addEventListener("resize", onWindowResize);
}
function initGame() {
    if (!gameCanvas) {
        console.error("Canvas element not found!");
        return;
    }
    // Three.js Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: gameCanvas });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable shadows for realistic lighting
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    // Camera setup
    camera = new THREE.PerspectiveCamera(75, // FOV
    window.innerWidth / window.innerHeight, // Aspect ratio
    0.1, // Near clipping plane
    1000 // Far clipping plane
    );
    const camPos = gameConfig.gameSettings.cameraPosition;
    camera.position.set(camPos[0], camPos[1], camPos[2]);
    camera.lookAt(new THREE.Vector3(gameConfig.gameSettings.cameraTarget[0], gameConfig.gameSettings.cameraTarget[1], gameConfig.gameSettings.cameraTarget[2]));
    // Audio Listener attached to camera
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Soft ambient light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Directional light for shadows
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    // Configure shadow map properties
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);
    // Cannon.js Physics World setup
    world = new CANNON.World();
    world.gravity.set(gameConfig.gameSettings.gravity[0], gameConfig.gameSettings.gravity[1], gameConfig.gameSettings.gravity[2]);
    world.broadphase = new CANNON.SAPBroadphase(world); // Optimized broadphase algorithm
    world.allowSleep = true; // Allow bodies to sleep when at rest to save CPU
    // Physics materials
    const ballMaterial = new CANNON.Material("ball");
    const groundMaterial = new CANNON.Material("ground");
    // Define contact behavior between ball and ground
    const ballGroundContactMaterial = new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
        friction: gameConfig.gameSettings.ballFriction,
        restitution: gameConfig.gameSettings.ballRestitution, // Bounciness/Elasticity
    });
    world.addContactMaterial(ballGroundContactMaterial);
    // Create game objects
    createGround(groundMaterial);
    createBall(ballMaterial);
    // OrbitControls for mouse-controlled camera
    controls = new OrbitControls_js_1.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth camera movement
    controls.dampingFactor = 0.05;
    controls.target.set(gameConfig.gameSettings.cameraTarget[0], gameConfig.gameSettings.cameraTarget[1], gameConfig.gameSettings.cameraTarget[2]);
    // Setup background music and sound effects
    setupSounds();
}
function createBall(material) {
    const ballRadius = gameConfig.gameSettings.ballRadius;
    const ballMass = gameConfig.gameSettings.ballMass;
    // Cannon.js physics body for the ball
    const ballShape = new CANNON.Sphere(ballRadius);
    ballBody = new CANNON.Body({ mass: ballMass, material: material });
    ballBody.addShape(ballShape);
    ballBody.position.set(0, ballRadius + 5, 0); // Start the ball slightly above the ground
    world.addBody(ballBody);
    // Three.js visual mesh for the ball
    const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32); // High poly sphere for smoothness
    const ballTexture = textures.get("ball");
    const ballMaterial = new THREE.MeshStandardMaterial({
        map: ballTexture || undefined, // Use texture if loaded, otherwise fallback color
        color: ballTexture ? 0xffffff : 0xff0000, // Red color if no texture
    });
    ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
    ballMesh.castShadow = true; // Ball casts a shadow
    scene.add(ballMesh);
    // Add event listener for ball collisions to play bounce sound
    ballBody.addEventListener("collide", (event) => {
        // Explicit type for 'event'
        // Calculate impact velocity along the contact normal
        const impact = event.contact.getImpactVelocityAlongNormal();
        if (impact > gameConfig.gameSettings.collisionSoundThreshold) {
            if (bounceSound && bounceSound.isPlaying) {
                bounceSound.stop(); // Stop previous sound before playing again
            }
            if (bounceSound) {
                bounceSound.play();
            }
        }
    });
}
function createGround(material) {
    const groundSize = gameConfig.gameSettings.groundSize;
    // Cannon.js physics body for the ground
    const groundShape = new CANNON.Plane();
    groundBody = new CANNON.Body({ mass: 0, material: material }); // Mass 0 makes it an immovable static body
    groundBody.addShape(groundShape);
    // Rotate the plane to be horizontal (Cannon.js planes are vertical by default)
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
    // Three.js visual mesh for the ground
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize, 10, 10);
    const groundTexture = textures.get("ground");
    if (groundTexture) {
        // Repeat texture to cover the large ground plane
        groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(groundSize / 5, groundSize / 5);
    }
    const groundMaterial = new THREE.MeshStandardMaterial({
        map: groundTexture || undefined, // Use texture if loaded
        color: groundTexture ? 0xffffff : 0x00ff00, // Green color if no texture
    });
    groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.receiveShadow = true; // Ground receives shadows
    // Rotate the Three.js mesh to be horizontal
    groundMesh.rotation.x = -Math.PI / 2;
    scene.add(groundMesh);
}
function setupSounds() {
    // Background Music (BGM)
    const bgmBuffer = audioBuffers.get("bgm");
    if (bgmBuffer) {
        bgmSound = new THREE.Audio(audioListener);
        bgmSound.setBuffer(bgmBuffer);
        bgmSound.setLoop(true); // Loop BGM
        bgmSound.setVolume(gameConfig.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.3);
        bgmSound.play();
    }
    // Bounce effect sound
    const bounceBuffer = audioBuffers.get("bounce");
    if (bounceBuffer) {
        bounceSound = new THREE.Audio(audioListener);
        bounceSound.setBuffer(bounceBuffer);
        bounceSound.setVolume(gameConfig.assets.sounds.find((s) => s.name === "bounce")?.volume ||
            0.8);
        bounceSound.playbackRate = 1.0; // Normal playback rate
    }
}
function animate() {
    requestAnimationFrame(animate);
    if (!isGameStarted)
        return; // Only animate if game has started
    // Update physics world
    world.step(1 / 60); // Fixed time step for physics simulation
    // Synchronize Three.js mesh position and rotation with Cannon.js body
    // Cannon.js Vec3 and Quaternion are compatible with Three.js Vector3 and Quaternion for copy operations
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);
    // Handle user input for ball actions (bounce/roll)
    handleBallInput();
    // Update camera controls
    controls.update();
    // Render the scene with the camera
    renderer.render(scene, camera);
}
function handleBallInput() {
    const bounceForce = gameConfig.gameSettings.bounceForce;
    const rollForce = gameConfig.gameSettings.rollForce;
    // Bounce action (applies an instant impulse)
    if (keyState["Space"]) {
        // Only allow bouncing when the ball is close to the ground and not already significantly airborne
        const threshold = gameConfig.gameSettings.ballRadius + 0.1; // Small margin above ground
        if (ballBody.position.y <= threshold &&
            Math.abs(ballBody.velocity.y) < 0.2) {
            ballBody.applyImpulse(new CANNON.Vec3(0, bounceForce, 0), ballBody.position);
        }
    }
    // Rolling action (applies continuous force)
    let forceVector = new CANNON.Vec3(0, 0, 0);
    // WASD and Arrow Keys for directional rolling
    if (keyState["ArrowUp"] || keyState["w"] || keyState["W"]) {
        // Roll forward (along -Z global)
        forceVector.z -= rollForce;
    }
    if (keyState["ArrowDown"] || keyState["s"] || keyState["S"]) {
        // Roll backward (along +Z global)
        forceVector.z += rollForce;
    }
    if (keyState["ArrowLeft"] || keyState["a"] || keyState["A"]) {
        // Roll left (along -X global)
        forceVector.x -= rollForce;
    }
    if (keyState["ArrowRight"] || keyState["d"] || keyState["D"]) {
        // Roll right (along +X global)
        forceVector.x += rollForce;
    }
    // Apply the accumulated force to the ball's center of mass
    if (!forceVector.equals(new CANNON.Vec3(0, 0, 0))) {
        ballBody.applyForce(forceVector, ballBody.position);
    }
}
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
// Ensure the main function runs once the document is fully loaded
document.addEventListener("DOMContentLoaded", main);
