import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- Global Variables & Enums ---
enum GameState {
    TITLE,
    PLAYING
}

let gameState: GameState = GameState.TITLE;
let gameConfig: any;

// Three.js elements
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let canvas: HTMLCanvasElement;

// Cannon.js elements
let world: CANNON.World;
let playerBody: CANNON.Body;
let playerMesh: THREE.Mesh;
let cannonGroundMaterial: CANNON.Material; // Declared globally or within initializeGame scope
let cannonPlayerMaterial: CANNON.Material; // Declared globally or within initializeGame scope

// Input state
interface KeyState {
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
}
let keys: KeyState = { w: false, a: false, s: false, d: false };
let mouseSensitivity: number;
let mousePitch = 0; // Up/down rotation
let mouseYaw = 0;   // Left/right rotation
let minPitch: number;
let maxPitch: number;

// Game Loop management
let animationFrameId: number;
let lastTime: number; // For delta time calculation

// UI Elements (Title Screen)
let titleScreenDiv: HTMLDivElement | null = null;

// Audio
let audioListener: THREE.AudioListener;
let audioLoader: THREE.AudioLoader;
let bgMusic: THREE.Audio;

// --- Initialization Functions ---

/**
 * Fetches game configuration from data.json and initializes the game.
 */
async function fetchConfigAndInit() {
    try {
        const response = await fetch('data.json');
        gameConfig = await response.json();
        initializeGame();
    } catch (error) {
        console.error("Failed to load game config:", error);
    }
}

/**
 * Sets up Three.js scene, camera, renderer, Cannon.js world, and game objects.
 */
function initializeGame() {
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas with ID 'gameCanvas' not found.");
        return;
    }

    // 1. Renderer Setup
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

    // 2. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background

    // 3. Camera Setup
    camera = new THREE.PerspectiveCamera(
        gameConfig.camera.fov,
        window.innerWidth / window.innerHeight,
        gameConfig.camera.near,
        gameConfig.camera.far
    );
    // Camera's initial position will be set relative to the player later.

    // 4. Cannon.js World Setup
    world = new CANNON.World();
    world.gravity.set(0, gameConfig.world.gravityY, 0);
    world.broadphase = new CANNON.SAPBroadphase(world); // Optimize collision detection
    (world.solver as CANNON.GSSolver).iterations = 10; // Fix: Cast solver to GSSolver to access iterations

    // 5. Loaders and Audio Listener
    const textureLoader = new THREE.TextureLoader();
    audioListener = new THREE.AudioListener();
    camera.add(audioListener); // Add listener to camera
    audioLoader = new THREE.AudioLoader();

    // 6. Ground Creation (Visual and Physical)
    const groundTexture = textureLoader.load(gameConfig.world.ground.assetPath,
        (texture) => {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(gameConfig.world.ground.size / 4, gameConfig.world.ground.size / 4);
        },
        undefined,
        (err) => console.warn('Error loading ground texture:', err, 'Using default material.')
    );
    const groundMaterial = new THREE.MeshPhongMaterial({ map: groundTexture, side: THREE.DoubleSide });
    const groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(gameConfig.world.ground.size, gameConfig.world.ground.size),
        new THREE.MeshPhongMaterial({ color: 0x808080, map: groundTexture }) // Fallback color
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Fix: Store CANNON.Material instances in variables
    cannonGroundMaterial = new CANNON.Material('groundMaterial');
    const groundBody = new CANNON.Body({
        mass: 0, // Static body
        shape: new CANNON.Plane(),
        material: cannonGroundMaterial // Use the stored material
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to lie flat
    world.addBody(groundBody);

    // 7. Player Creation (Visual and Physical)
    const playerRadius = gameConfig.player.radius;
    const playerTotalHeight = gameConfig.player.height;
    const playerCylinderLength = playerTotalHeight - 2 * playerRadius; // Length of the straight part

    const playerGeo = new THREE.CapsuleGeometry(playerRadius, playerCylinderLength, 16, 32);
    const playerTexture = textureLoader.load(gameConfig.player.assetPath,
        (texture) => {
            (playerMesh.material as THREE.MeshPhongMaterial).map = texture;
            (playerMesh.material as THREE.MeshPhongMaterial).needsUpdate = true;
        },
        undefined,
        (err) => console.warn('Error loading player texture:', err, 'Using default color.')
    );
    const playerMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00, map: playerTexture }); // Default color + texture
    playerMesh = new THREE.Mesh(playerGeo, playerMaterial);
    playerMesh.position.y = playerTotalHeight / 2 + 1; // Start slightly above ground
    playerMesh.castShadow = true;
    scene.add(playerMesh);

    // Fix: Store CANNON.Material instances in variables
    cannonPlayerMaterial = new CANNON.Material('playerMaterial');
    playerBody = new CANNON.Body({
        mass: gameConfig.player.mass,
        shape: new CANNON.Cylinder(playerRadius, playerRadius, playerTotalHeight, 16), // Cannon.js cylinder height is total height
        position: new CANNON.Vec3(0, playerTotalHeight / 2 + 1, 0),
        material: cannonPlayerMaterial // Use the stored material
    });
    playerBody.fixedRotation = true; // Prevent player from toppling
    playerBody.angularFactor.set(0, 0, 0); // Disable angular rotation entirely
    world.addBody(playerBody);

    // 8. Contact Materials (for physics friction/restitution)
    // Fix: Use the stored CANNON.Material instances directly
    const playerGroundCm = new CANNON.ContactMaterial(
        cannonPlayerMaterial,
        cannonGroundMaterial,
        {
            friction: 0.5,
            restitution: 0.1
        }
    );
    world.addContactMaterial(playerGroundCm);

    // 9. Lighting Setup
    const ambientLight = new THREE.AmbientLight(gameConfig.lighting.ambientColor);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(gameConfig.lighting.directionalColor, gameConfig.lighting.directionalIntensity);
    // Fix: Pass individual arguments to set, not a spread array
    directionalLight.position.set(gameConfig.lighting.directionalPosition[0], gameConfig.lighting.directionalPosition[1], gameConfig.lighting.directionalPosition[2]);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    // 10. Event Listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('click', onClick); // For title screen interaction and pointer lock

    mouseSensitivity = gameConfig.camera.sensitivity;
    minPitch = gameConfig.camera.minPitch * Math.PI / 180;
    maxPitch = gameConfig.camera.maxPitch * Math.PI / 180;

    showTitleScreen();
}

/**
 * Displays the title screen overlay.
 */
function showTitleScreen() {
    gameState = GameState.TITLE;
    if (!titleScreenDiv) {
        titleScreenDiv = document.createElement('div');
        titleScreenDiv.id = 'titleScreen';
        titleScreenDiv.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background-color: ${gameConfig.titleScreen.backgroundColor};
            color: ${gameConfig.titleScreen.fontColor};
            font-family: 'Arial', sans-serif;
            font-size: ${gameConfig.titleScreen.fontSize};
            z-index: 100;
        `;

        const titleText = document.createElement('h1');
        titleText.textContent = gameConfig.gameTitle;
        titleText.style.marginBottom = '20px';
        titleScreenDiv.appendChild(titleText);

        const clickToStartText = document.createElement('p');
        clickToStartText.textContent = gameConfig.titleScreen.message;
        titleScreenDiv.appendChild(clickToStartText);

        document.body.appendChild(titleScreenDiv);
    } else {
        titleScreenDiv.style.display = 'flex';
    }
}

/**
 * Hides the title screen and starts the game.
 */
function hideTitleScreen() {
    if (titleScreenDiv) {
        titleScreenDiv.style.display = 'none';
    }
    gameState = GameState.PLAYING;
    // Request pointer lock for continuous mouse input
    canvas.requestPointerLock = canvas.requestPointerLock || (canvas as any).mozRequestPointerLock;
    canvas.requestPointerLock();
    startAudio(); // Start background music
    lastTime = performance.now(); // Initialize lastTime for the game loop
    animate(); // Start the game loop
}

/**
 * Starts background audio playback.
 */
function startAudio() {
    if (bgMusic && bgMusic.isPlaying) {
        return; // Already playing
    }

    audioLoader.load(gameConfig.audio.backgroundMusic, function(buffer) {
        bgMusic = new THREE.Audio(audioListener);
        bgMusic.setBuffer(buffer);
        bgMusic.setLoop(true);
        bgMusic.setVolume(gameConfig.audio.volume);
        bgMusic.play();
    }, undefined, (err) => console.warn('Error loading background music:', err, 'Audio will not play.'));
}

// --- Event Handlers ---

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event: KeyboardEvent) {
    if (gameState !== GameState.PLAYING) return;
    switch (event.code) {
        case 'KeyW': keys.w = true; break;
        case 'KeyA': keys.a = true; break;
        case 'KeyS': keys.s = true; break;
        case 'KeyD': keys.d = true; break;
    }
}

function onKeyUp(event: KeyboardEvent) {
    if (gameState !== GameState.PLAYING) return;
    switch (event.code) {
        case 'KeyW': keys.w = false; break;
        case 'KeyA': keys.a = false; break;
        case 'KeyS': keys.s = false; break;
        case 'KeyD': keys.d = false; break;
    }
}

function onMouseMove(event: MouseEvent) {
    // Only process mouse movement if game is playing and pointer is locked
    if (gameState !== GameState.PLAYING || document.pointerLockElement !== canvas) return;

    mouseYaw -= event.movementX * mouseSensitivity; // Horizontal rotation
    mousePitch -= event.movementY * mouseSensitivity; // Vertical rotation

    // Clamp pitch to prevent camera from flipping over
    mousePitch = Math.max(minPitch, Math.min(maxPitch, mousePitch));
}

function onClick() {
    if (gameState === GameState.TITLE) {
        hideTitleScreen();
    }
}

// --- Game Loop ---

/**
 * Main animation loop for updating game state and rendering.
 */
function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000; // Delta time in seconds
    lastTime = currentTime;

    if (gameState === GameState.PLAYING) {
        // Update physics world
        world.step(1 / 60, deltaTime, 3); // Fixed time step, delta for interpolation

        // 1. Player Movement Logic
        const playerSpeed = gameConfig.player.speed;
        const playerMass = gameConfig.player.mass;
        const inputVector = new THREE.Vector3(0, 0, 0);

        // Determine input direction
        if (keys.w) inputVector.z -= 1;
        if (keys.s) inputVector.z += 1;
        if (keys.a) inputVector.x -= 1;
        if (keys.d) inputVector.x += 1;

        if (inputVector.lengthSq() > 0) {
            inputVector.normalize(); // Normalize for consistent speed when moving diagonally
        }

        // Calculate movement direction relative to camera's yaw
        const forwardVector = new THREE.Vector3(0, 0, -1);
        forwardVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), mouseYaw);

        const rightVector = new THREE.Vector3(1, 0, 0);
        rightVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), mouseYaw);

        const moveDirection = new THREE.Vector3();
        moveDirection.addScaledVector(forwardVector, inputVector.z);
        moveDirection.addScaledVector(rightVector, inputVector.x);

        // Apply impulse to player body (ignoring Y for horizontal movement)
        const currentVelocity = playerBody.velocity;
        const desiredVelocity = new CANNON.Vec3(moveDirection.x * playerSpeed, currentVelocity.y, moveDirection.z * playerSpeed);
        
        // Impulse = (target_velocity - current_velocity) * mass
        const impulse = desiredVelocity.vsub(currentVelocity).scale(playerMass);
        playerBody.applyImpulse(impulse);
        
        // Dampen horizontal velocity to prevent indefinite sliding/speed buildup
        const maxHorizontalSpeed = playerSpeed * 1.5; // Allow slight overshoot for more responsive feel
        const currentHorizontalSpeedSq = currentVelocity.x * currentVelocity.x + currentVelocity.z * currentVelocity.z;
        if (currentHorizontalSpeedSq > maxHorizontalSpeed * maxHorizontalSpeed) {
            const scale = maxHorizontalSpeed / Math.sqrt(currentHorizontalSpeedSq);
            playerBody.velocity.x *= scale;
            playerBody.velocity.z *= scale;
        }

        // Update player mesh position and rotation
        playerMesh.position.copy(playerBody.position as any);
        // Player mesh should visually turn with the camera's yaw
        playerMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), mouseYaw);

        // 2. Camera Positioning and Rotation
        const playerWorldPosition = new THREE.Vector3(playerBody.position.x, playerBody.position.y, playerBody.position.z);
        
        // Calculate camera's relative offset from player
        const cameraRelativeOffset = new THREE.Vector3(
            gameConfig.camera.offsetX,
            gameConfig.camera.offsetY,
            gameConfig.camera.offsetZ
        ); // This is the base offset (e.g., -Z means behind)

        // Rotate the offset by the yaw to keep it behind the player
        cameraRelativeOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), mouseYaw);

        // Set camera position by adding the rotated offset to player's position
        camera.position.copy(playerWorldPosition).add(cameraRelativeOffset);

        // Set camera rotation based on mouse yaw and pitch
        const tempQuaternion = new THREE.Quaternion();
        const tempVector = new THREE.Vector3();

        // First apply Yaw rotation
        tempQuaternion.setFromAxisAngle(tempVector.set(0, 1, 0), mouseYaw);
        camera.quaternion.copy(tempQuaternion);

        // Then apply Pitch rotation (relative to the yaw)
        tempQuaternion.setFromAxisAngle(tempVector.set(1, 0, 0), mousePitch);
        camera.quaternion.multiplyQuaternions(camera.quaternion, tempQuaternion);
    }

    // Render the scene with the camera
    renderer.render(scene, camera);
}

// Start the game by fetching configuration
fetchConfigAndInit();

// Listen for pointer lock change events to pause/unpause mouse input
document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
        // Pointer is locked, game is active
    } else {
        // Pointer is unlocked, user probably pressed ESC. Optionally pause the game or show a menu.
        // For this simple game, we just stop processing mouse move.
    }
});