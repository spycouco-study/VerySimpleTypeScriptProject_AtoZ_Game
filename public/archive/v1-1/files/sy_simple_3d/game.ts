import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- Data Interfaces (for data.json) ---
interface AssetImage {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface AssetSound {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface GameAssets {
    images: AssetImage[];
    sounds: AssetSound[];
}

interface GameConfig {
    player: {
        radius: number;
        speed: number;
        jumpForce: number;
        maxJumps: number;
    };
    camera: {
        distance: number;
        height: number;
    };
    ground: {
        width: number;
        depth: number;
    };
    collectibles: {
        count: number;
        radius: number;
        spawnArea: number;
    };
    obstacles: {
        count: number;
        minSize: number;
        maxSize: number;
        spawnArea: number;
    };
    gravity: number;
    colors: {
        background: string;
        text: string;
    };
    assets: GameAssets;
}

// --- Global Variables ---
let config: GameConfig;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let physicsWorld: CANNON.World;
let playerMesh: THREE.Mesh;
let playerBody: CANNON.Body;
let collectibles: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
let obstacles: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];
let groundMesh: THREE.Mesh;
let groundBody: CANNON.Body;

let keyboard: { [key: string]: boolean } = {};
let gamepads: Gamepad[] = [];

let score: number = 0;
let remainingCollectibles: number = 0;

// --- ENUM (Moved here to fix TS2450: Enum 'GameState' used before its declaration) ---
enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER
}

let gameState: GameState = GameState.TITLE; // Now GameState is declared before its use
let lastTimestamp: DOMHighResTimeStamp = 0;

let audioListener: THREE.AudioListener;
let backgroundMusic: THREE.Audio<AudioNode>;
let collectSound: THREE.Audio<AudioNode>;
let loadedTextures: Map<string, THREE.Texture> = new Map();
let loadedSounds: Map<string, AudioBuffer> = new Map();

let titleTextSprite: THREE.Sprite;
let scoreTextSprite: THREE.Sprite;
let instructionsTextSprite: THREE.Sprite;
let gameOverTextSprite: THREE.Sprite;

// Player state for jumping
let canJump = true;
let jumpCount = 0;

// --- Utility Functions ---
async function loadGameConfig(): Promise<GameConfig> {
    const response = await fetch('data.json');
    if (!response.ok) {
        throw new Error(`Failed to load data.json: ${response.statusText}`);
    }
    return response.json();
}

async function loadAssets(assetsConfig: GameAssets): Promise<void> {
    const textureLoader = new THREE.TextureLoader();
    const audioLoader = new THREE.AudioLoader();

    const imagePromises = assetsConfig.images.map(async (img) => {
        return new Promise<void>((resolve, reject) => {
            textureLoader.load(img.path, (texture) => {
                loadedTextures.set(img.name, texture);
                resolve();
            }, undefined, (error) => {
                console.error(`Error loading texture ${img.path}:`, error);
                reject(error);
            });
        });
    });

    const soundPromises = assetsConfig.sounds.map(async (snd) => {
        return new Promise<void>((resolve, reject) => {
            audioLoader.load(snd.path, (buffer) => {
                loadedSounds.set(snd.name, buffer);
                resolve();
            }, undefined, (error) => {
                console.error(`Error loading sound ${snd.path}:`, error);
                reject(error);
            });
        });
    });

    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
}

function createTextSprite(message: string, fontSize: number, color: string = '#FFFFFF'): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    const font = `${fontSize}px Arial`;

    context.font = font;
    const metrics = context.measureText(message);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.5; // Approximate line height

    canvas.width = textWidth + 20; // Add padding
    canvas.height = textHeight + 20; // Add padding
    context.font = font; // Reset font after canvas resize
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(message, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);

    // Scale sprite based on canvas size, assuming a certain visual scale
    sprite.scale.set(canvas.width / 10, canvas.height / 10, 1);
    return sprite;
}

function updateTextSprite(sprite: THREE.Sprite, message: string, fontSize: number, color: string = '#FFFFFF') {
    if (!sprite || !sprite.material || !(sprite.material as THREE.SpriteMaterial).map) {
        return; // Handle case where sprite is not yet initialized
    }
    const texture = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const canvas = texture.image as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;

    const font = `${fontSize}px Arial`;
    context.font = font;
    const metrics = context.measureText(message);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.5;

    // Adjust canvas size if necessary
    const newWidth = textWidth + 20;
    const newHeight = textHeight + 20;
    if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = font;
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(message, canvas.width / 2, canvas.height / 2);

    texture.needsUpdate = true;
    sprite.scale.set(canvas.width / 10, canvas.height / 10, 1); // Rescale sprite
}


// --- Game Initialization ---
async function initGame() {
    config = await loadGameConfig();
    await loadAssets(config.assets);

    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(config.colors.background);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, config.camera.height, config.camera.distance);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Physics World
    physicsWorld = new CANNON.World();
    physicsWorld.gravity.set(0, config.gravity, 0); // Negative Y-axis for gravity
    physicsWorld.defaultContactMaterial.friction = 0.5;
    physicsWorld.defaultContactMaterial.restitution = 0.3;

    // Audio Listener
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
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

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(config.ground.width, config.ground.depth);
    const groundTexture = loadedTextures.get('ground_texture');
    const groundMaterial = new THREE.MeshStandardMaterial({
        map: groundTexture, // If groundTexture is undefined, map will be null.
        color: groundTexture ? 0xffffff : 0x888888, // Default color if no texture is loaded.
        side: THREE.DoubleSide
    });
    groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const groundShape = new CANNON.Plane();
    groundBody = new CANNON.Body({ mass: 0 }); // Mass 0 makes it static
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to match mesh
    physicsWorld.addBody(groundBody);

    // Player
    const playerGeometry = new THREE.SphereGeometry(config.player.radius, 32, 32);
    const playerTexture = loadedTextures.get('player_texture');
    const playerMaterial = new THREE.MeshStandardMaterial({
        map: playerTexture, // If playerTexture is undefined, map will be null.
        color: playerTexture ? 0xffffff : 0x0077ff, // Default color if no texture is loaded.
        metalness: 0.1,
        roughness: 0.6
    });
    playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    playerMesh.position.set(0, config.player.radius + 0.1, 0); // Slightly above ground
    playerMesh.castShadow = true;
    scene.add(playerMesh);

    const playerShape = new CANNON.Sphere(config.player.radius);
    playerBody = new CANNON.Body({ mass: 5, shape: playerShape });
    playerBody.position.copy(playerMesh.position as any);
    physicsWorld.addBody(playerBody);
    playerBody.linearDamping = 0.9; // Reduce horizontal slide
    playerBody.angularDamping = 0.9; // Reduce spinning

    playerBody.addEventListener('collide', (event: any) => {
        // Check if player is touching the ground to allow jumping
        const contactNormal = new CANNON.Vec3();
        const upAxis = new CANNON.Vec3(0, 1, 0);
        for (const contact of event.detail.contacts) {
            if (contact.bi.id === playerBody.id || contact.bj.id === playerBody.id) {
                if (contact.bi.id === playerBody.id) {
                    contact.ni.negate(contactNormal);
                } else {
                    contactNormal.copy(contact.ni);
                }
                // Check if the contact normal is pointing upwards enough
                if (contactNormal.dot(upAxis) > 0.5) { // Threshold for considering it ground
                    canJump = true;
                    jumpCount = 0;
                }
            }
        }
    });

    // Collectibles
    spawnCollectibles();

    // Obstacles
    spawnObstacles();

    // UI Sprites (attached to camera for fixed screen position)
    titleTextSprite = createTextSprite("3D Sphere Collector", 60, config.colors.text);
    titleTextSprite.position.set(0, 2, -5); // Relative to camera
    camera.add(titleTextSprite);

    instructionsTextSprite = createTextSprite("Press any key to Start", 30, config.colors.text);
    instructionsTextSprite.position.set(0, 0, -5); // Relative to camera, below title
    camera.add(instructionsTextSprite);

    scoreTextSprite = createTextSprite(`Score: 0 / ${config.collectibles.count}`, 30, config.colors.text);
    scoreTextSprite.position.set(2, 2.5, -5); // Top-right relative to camera
    scoreTextSprite.visible = false;
    camera.add(scoreTextSprite);

    gameOverTextSprite = createTextSprite("Game Over!", 60, config.colors.text);
    gameOverTextSprite.position.set(0, 2, -5);
    gameOverTextSprite.visible = false;
    camera.add(gameOverTextSprite);

    // Audio setup
    const bgmBuffer = loadedSounds.get('bgm');
    if (bgmBuffer) {
        backgroundMusic = new THREE.Audio(audioListener);
        backgroundMusic.setBuffer(bgmBuffer);
        backgroundMusic.setLoop(true);
        backgroundMusic.setVolume(config.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.5);
    }
    const collectBuffer = loadedSounds.get('collect_sfx');
    if (collectBuffer) {
        collectSound = new THREE.Audio(audioListener);
        collectSound.setBuffer(collectBuffer);
        collectSound.setLoop(false);
        collectSound.setVolume(config.assets.sounds.find(s => s.name === 'collect_sfx')?.volume || 1.0);
    }

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);

    // Start render loop
    requestAnimationFrame(animate);
}

function spawnCollectibles() {
    const collectibleTexture = loadedTextures.get('collectible_texture');
    remainingCollectibles = config.collectibles.count;
    for (let i = 0; i < config.collectibles.count; i++) {
        const radius = config.collectibles.radius;
        const collectibleGeometry = new THREE.SphereGeometry(radius, 16, 16);
        const collectibleMaterial = new THREE.MeshStandardMaterial({
            map: collectibleTexture, // If collectibleTexture is undefined, map will be null.
            color: collectibleTexture ? 0xffffff : 0xffd700, // Default color if no texture is loaded.
            emissive: new THREE.Color(0xffd700), // Emissive color remains
            emissiveIntensity: 0.5
        });
        const collectibleMesh = new THREE.Mesh(collectibleGeometry, collectibleMaterial);
        collectibleMesh.castShadow = true;
        collectibleMesh.receiveShadow = true;

        let x, z;
        // Ensure collectibles are not too close to player start or obstacles
        do {
            x = (Math.random() * 2 - 1) * config.collectibles.spawnArea;
            z = (Math.random() * 2 - 1) * config.collectibles.spawnArea;
        } while (
            // Avoid player start area
            (Math.abs(x) < config.player.radius * 3 && Math.abs(z) < config.player.radius * 3) ||
            // Avoid existing obstacles
            obstacles.some(o => o.body.position.distanceTo(new CANNON.Vec3(x, radius + 0.1, z)) < (o.body.shapes[0] as CANNON.Box).halfExtents.x * 2 + radius * 2) // Approximate collision check
        );

        collectibleMesh.position.set(x, radius + 0.1, z);
        scene.add(collectibleMesh);

        const collectibleShape = new CANNON.Sphere(radius);
        // Using KINEMATIC to allow removing without physics world issues
        const collectibleBody = new CANNON.Body({ mass: 0, shape: collectibleShape, type: CANNON.Body.KINEMATIC });
        collectibleBody.position.copy(collectibleMesh.position as any);
        physicsWorld.addBody(collectibleBody);

        // Removed userData assignments as they are not used and cause TS errors.
        // collectibleBody.userData = { isCollectible: true, meshId: collectibleMesh.uuid };
        // collectibleMesh.userData = { isCollectible: true, bodyId: collectibleBody.id };

        collectibles.push({ mesh: collectibleMesh, body: collectibleBody });
    }
}

function spawnObstacles() {
    const obstacleTexture = loadedTextures.get('obstacle_texture');
    for (let i = 0; i < config.obstacles.count; i++) {
        const size = Math.random() * (config.obstacles.maxSize - config.obstacles.minSize) + config.obstacles.minSize;
        const obstacleGeometry = new THREE.BoxGeometry(size, size, size);
        const obstacleMaterial = new THREE.MeshStandardMaterial({
            map: obstacleTexture, // If obstacleTexture is undefined, map will be null.
            color: obstacleTexture ? 0xffffff : 0x8b0000, // Default color if no texture is loaded.
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
            (Math.abs(x) < config.player.radius * 3 && Math.abs(z) < config.player.radius * 3) ||
            // Avoid other obstacles
            obstacles.some(o => o.body.position.distanceTo(new CANNON.Vec3(x, size / 2 + 0.1, z)) < (o.body.shapes[0] as CANNON.Box).halfExtents.x * 2 + size)
        );

        obstacleMesh.position.set(x, size / 2 + 0.1, z);
        scene.add(obstacleMesh);

        const obstacleShape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
        const obstacleBody = new CANNON.Body({ mass: 0, shape: obstacleShape, type: CANNON.Body.STATIC });
        obstacleBody.position.copy(obstacleMesh.position as any);
        physicsWorld.addBody(obstacleBody);

        obstacles.push({ mesh: obstacleMesh, body: obstacleBody });
    }
}


// --- Event Handlers ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event: KeyboardEvent) {
    keyboard[event.code] = true;

    if (gameState === GameState.TITLE) {
        startGame();
    } else if (gameState === GameState.GAME_OVER) {
        resetGame();
    }
}

function onKeyUp(event: KeyboardEvent) {
    keyboard[event.code] = false;
}

function onGamepadConnected(event: GamepadEvent) {
    console.log("Gamepad connected:", event.gamepad);
    gamepads[event.gamepad.index] = event.gamepad;
    if (gameState === GameState.TITLE) {
        startGame();
    }
}

function onGamepadDisconnected(event: GamepadEvent) {
    console.log("Gamepad disconnected:", event.gamepad);
    delete gamepads[event.gamepad.index];
}

function startGame() {
    if (gameState !== GameState.TITLE) return;

    gameState = GameState.PLAYING;
    console.log("Game Started!");

    titleTextSprite.visible = false;
    instructionsTextSprite.visible = false;

    scoreTextSprite.visible = true;
    updateTextSprite(scoreTextSprite, `Score: ${score} / ${config.collectibles.count}`, 30, config.colors.text);

    if (backgroundMusic && !backgroundMusic.isPlaying) {
        backgroundMusic.play();
    }
}

function gameOver(won: boolean) {
    gameState = GameState.GAME_OVER;
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
    collectibles.forEach(item => {
        scene.remove(item.mesh);
        physicsWorld.removeBody(item.body);
    });
    obstacles.forEach(item => {
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

    gameState = GameState.TITLE;
    titleTextSprite.visible = true;
    instructionsTextSprite.visible = true;
    updateTextSprite(instructionsTextSprite, "Press any key to Start", 30, config.colors.text);
}

// --- Game Loop ---
function animate(timestamp: DOMHighResTimeStamp) {
    requestAnimationFrame(animate);

    const deltaTime = (timestamp - lastTimestamp) / 1000; // Convert to seconds
    lastTimestamp = timestamp;

    if (gameState === GameState.PLAYING) {
        update(deltaTime);
        render();
    } else if (gameState === GameState.TITLE || gameState === GameState.GAME_OVER) {
        render(); // Render UI only
    }
}

function update(deltaTime: number) {
    const inputVelocity = new THREE.Vector3();
    const playerSpeed = config.player.speed;

    // Keyboard input
    if (keyboard['KeyW']) inputVelocity.z -= playerSpeed;
    if (keyboard['KeyS']) inputVelocity.z += playerSpeed;
    if (keyboard['KeyA']) inputVelocity.x -= playerSpeed;
    if (keyboard['KeyD']) inputVelocity.x += playerSpeed;

    // Gamepad input
    const gamepad = navigator.getGamepads()[0]; // Use the first connected gamepad
    if (gamepad) {
        // Left stick for movement (axes 0 and 1)
        const axes = gamepad.axes;
        // Apply deadzone to prevent drift
        const deadzone = 0.15;
        if (Math.abs(axes[0]) > deadzone) inputVelocity.x += axes[0] * playerSpeed;
        if (Math.abs(axes[1]) > deadzone) inputVelocity.z += axes[1] * playerSpeed;

        // A button (button 0) for jump
        if (gamepad.buttons[0]?.pressed && canJump && jumpCount < config.player.maxJumps) {
            playerBody.velocity.y = config.player.jumpForce;
            canJump = false; // Prevent continuous jump by holding
            jumpCount++;
        } else if (!gamepad.buttons[0]?.pressed) {
            canJump = true; // Allow jump again if button released
        }
    } else {
        // Keyboard jump
        if (keyboard['Space'] && canJump && jumpCount < config.player.maxJumps) {
            playerBody.velocity.y = config.player.jumpForce;
            canJump = false;
            jumpCount++;
        } else if (!keyboard['Space']) {
            canJump = true;
        }
    }

    if (inputVelocity.lengthSq() > 0) {
        inputVelocity.normalize().multiplyScalar(playerSpeed);
        // Directly set horizontal velocity
        playerBody.velocity.x = inputVelocity.x;
        playerBody.velocity.z = inputVelocity.z;
    } else {
        // Gently slow down horizontal velocity when no input
        playerBody.velocity.x *= 0.9;
        playerBody.velocity.z *= 0.9;
    }

    // Physics step
    physicsWorld.step(1 / 60, deltaTime, 3); // Fixed time step for physics

    // Sync Three.js meshes with Cannon.js bodies
    playerMesh.position.copy(playerBody.position as any);
    playerMesh.quaternion.copy(playerBody.quaternion as any);

    collectibles.forEach(item => {
        item.mesh.position.copy(item.body.position as any);
        item.mesh.quaternion.copy(item.body.quaternion as any);
        // Simple rotation for collectibles
        item.mesh.rotation.y += deltaTime * 2;
    });

    obstacles.forEach(item => {
        item.mesh.position.copy(item.body.position as any);
        item.mesh.quaternion.copy(item.body.quaternion as any);
    });

    // Camera follow player
    camera.position.x = playerMesh.position.x;
    camera.position.y = playerMesh.position.y + config.camera.height;
    camera.position.z = playerMesh.position.z + config.camera.distance;
    camera.lookAt(playerMesh.position);


    // Check for collectible collisions
    for (let i = 0; i < collectibles.length; i++) {
        const collectible = collectibles[i];
        if (collectible.body.position.distanceTo(playerBody.position) < config.player.radius + config.collectibles.radius) {
            scene.remove(collectible.mesh);
            physicsWorld.removeBody(collectible.body);
            collectibles.splice(i, 1);
            i--; // Adjust index after removal

            score++;
            remainingCollectibles--;
            updateTextSprite(scoreTextSprite, `Score: ${score} / ${config.collectibles.count}`, 30, config.colors.text);

            if (collectSound && !collectSound.isPlaying) {
                collectSound.play();
            }

            if (remainingCollectibles <= 0) {
                gameOver(true); // Player won!
            }
        }
    }

    // Check for player falling off the platform
    if (playerMesh.position.y < -15) { // arbitrary fall detection
        gameOver(false); // Player lost!
    }
}

function render() {
    renderer.render(scene, camera);
}

// Start the game initialization
initGame().catch(console.error);