import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'; // OrbitControls 임포트

// --- Global Game State and Configuration ---
interface GameConfig {
    canvasWidth: number;
    canvasHeight: number;
    gridSize: number; // Size of each grid cell in world units
    snakeSpeed: number; // How many grid cells per second the snake moves
    initialSnakeLength: number;
    wallThickness: number; // Thickness of the walls in world units
    cameraFOV: number;
    cameraNear: number;
    cameraFar: number;
    cameraPosition: { x: number; y: number; z: number; };
    lightPosition: { x: number; y: number; z: number; };
    colors: {
        background: number;
        titleText: string;
        scoreText: string;
        gameOverText: string;
    }
    assets: {
        images: Array<{ name: string; path: string; width: number; height: number; }>;
        sounds: Array<{ name: string; path: string; duration_seconds: number; volume: number; }>;
    };
}

interface LoadedAssets {
    textures: { [key: string]: THREE.Texture | THREE.Color };
    sounds: { [key: string]: HTMLAudioElement };
}

enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
}

const game: {
    data: GameConfig | null;
    assets: LoadedAssets;
    canvas: HTMLCanvasElement | null;
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    controls: OrbitControls | null; // OrbitControls 추가
    cannonWorld: CANNON.World | null;
    snake: { mesh: THREE.Mesh; body: CANNON.Body; }[];
    food: { mesh: THREE.Mesh | null; body: CANNON.Body | null; };
    direction: THREE.Vector3;
    nextDirection: THREE.Vector3;
    score: number;
    gameState: GameState;
    lastUpdateTime: number;
    timeSinceLastMove: number;
    moveInterval: number; // Time in ms between snake moves
    uiElements: {
        titleScreen: HTMLDivElement | null;
        scoreDisplay: HTMLDivElement | null;
        gameOverScreen: HTMLDivElement | null;
    };
    bgm: HTMLAudioElement | null;
    wallBodies: CANNON.Body[]; // To hold references to cannon wall bodies
} = {
    data: null,
    assets: { textures: {}, sounds: {} },
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    controls: null, // 초기화
    cannonWorld: null,
    snake: [],
    food: { mesh: null, body: null },
    direction: new THREE.Vector3(1, 0, 0), // Initial direction: East (positive X)
    nextDirection: new THREE.Vector3(1, 0, 0),
    score: 0,
    gameState: GameState.TITLE,
    lastUpdateTime: 0,
    timeSinceLastMove: 0,
    moveInterval: 0, // Will be calculated from snakeSpeed
    uiElements: {
        titleScreen: null,
        scoreDisplay: null,
        gameOverScreen: null,
    },
    bgm: null,
    wallBodies: [],
};

// --- Game Initialization ---

async function loadGameData(): Promise<void> {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`Failed to load data.json: ${response.statusText}`);
        }
        game.data = await response.json() as GameConfig;
        console.log("Game data loaded:", game.data);
    } catch (error) {
        console.error("Error loading game data:", error);
        alert("Failed to load game configuration. Please check data.json.");
    }
}

async function preloadAssets(): Promise<void> {
    if (!game.data) return;

    const textureLoader = new THREE.TextureLoader();
    const audioPromises: Promise<void>[] = [];
    const texturePromises: Promise<void>[] = [];

    // Add placeholder textures if actual assets are not found in data.json
    // This allows the game to run even if some assets are missing.
    // Ensure all critical texture names are present in assets.textures
    const requiredTextures = ['snake_head', 'snake_body', 'food', 'wall_texture'];
    for(const name of requiredTextures) {
        if (!game.data.assets.images.some(img => img.name === name)) {
            console.warn(`Texture '${name}' not found in data.json. Using a placeholder.`);
            game.assets.textures[name] = new THREE.Color(0x888888); // Default color
        }
    }


    for (const img of game.data.assets.images) {
        texturePromises.push(new Promise((resolve) => { // Changed to resolve even on error to not block game
            textureLoader.load(
                img.path,
                (texture) => {
                    game.assets.textures[img.name] = texture;
                    resolve();
                },
                undefined,
                (error) => {
                    console.error(`Error loading texture ${img.name} from ${img.path}:`, error);
                    game.assets.textures[img.name] = new THREE.Color(0x888888); // Fallback to color
                    resolve(); // Resolve even on error to allow game to continue
                }
            );
        }));
    }

    // Ensure all critical sound names are present in assets.sounds
    const requiredSounds = ['eat_food', 'game_over', 'bgm', 'start_game'];
    for(const name of requiredSounds) {
        if (!game.data.assets.sounds.some(s => s.name === name)) {
            console.warn(`Sound '${name}' not found in data.json. Will not play.`);
            // No default sound, just won't be in game.assets.sounds
        }
    }

    for (const sound of game.data.assets.sounds) {
        audioPromises.push(new Promise((resolve) => { // Changed to resolve even on error
            const audio = new Audio(sound.path);
            audio.volume = sound.volume;
            audio.load(); // Preload the audio
            audio.oncanplaythrough = () => {
                game.assets.sounds[sound.name] = audio;
                resolve();
            };
            audio.onerror = (e) => {
                console.error(`Error loading sound ${sound.name} from ${sound.path}:`, e);
                resolve(); // Resolve even on error to allow game to continue
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

function setupUI(): void {
    if (!game.data || !game.canvas) return;

    const body = document.body;
    body.style.margin = '0';
    body.style.overflow = 'hidden';

    // Title Screen
    const titleScreen = document.createElement('div');
    titleScreen.id = 'titleScreen';
    Object.assign(titleScreen.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: `rgba(0, 0, 0, 0.7)`,
        color: game.data.colors.titleText,
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '100',
        fontSize: '48px',
        textAlign: 'center',
    });
    titleScreen.innerHTML = `
        <h1>3D 뱀게임</h1>
        <p style="font-size: 24px;">Press SPACE to Start</p>
        <p style="font-size: 18px;">Use Arrow Keys to Move</p>
        <p style="font-size: 18px;">Use Mouse to Rotate Camera</p> <!-- 마우스 설명 추가 -->
    `;
    body.appendChild(titleScreen);
    game.uiElements.titleScreen = titleScreen;

    // Score Display
    const scoreDisplay = document.createElement('div');
    scoreDisplay.id = 'scoreDisplay';
    Object.assign(scoreDisplay.style, {
        position: 'absolute',
        top: '10px',
        left: '10px',
        color: game.data.colors.scoreText,
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        zIndex: '101',
        display: 'none', // Hidden initially
    });
    scoreDisplay.innerText = `Score: 0`;
    body.appendChild(scoreDisplay);
    game.uiElements.scoreDisplay = scoreDisplay;

    // Game Over Screen
    const gameOverScreen = document.createElement('div');
    gameOverScreen.id = 'gameOverScreen';
    Object.assign(gameOverScreen.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: `rgba(0, 0, 0, 0.7)`,
        color: game.data.colors.gameOverText,
        fontFamily: 'Arial, sans-serif',
        display: 'none', // Hidden initially
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: '102',
        fontSize: '48px',
        textAlign: 'center',
    });
    gameOverScreen.innerHTML = `
        <h1>GAME OVER!</h1>
        <p style="font-size: 36px;" id="finalScore">Score: 0</p>
        <p style="font-size: 24px;">Press SPACE to Restart</p>
    `;
    body.appendChild(gameOverScreen);
    game.uiElements.gameOverScreen = gameOverScreen;
}

function createGameWorld(): void {
    if (!game.data || !game.canvas) return;

    // Three.js setup
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
    // game.camera.lookAt(0, 0, 0); // OrbitControls가 카메라 방향을 제어하므로 주석 처리

    game.renderer = new THREE.WebGLRenderer({ canvas: game.canvas, antialias: true });
    game.renderer.setSize(game.data.canvasWidth, game.data.canvasHeight);
    game.renderer.shadowMap.enabled = true; // Enable shadows if desired

    // OrbitControls 설정
    game.controls = new OrbitControls(game.camera, game.renderer.domElement);
    game.controls.enableDDamping = true; // 카메라 움직임을 부드럽게
    game.controls.dampingFactor = 0.05;
    game.controls.screenSpacePanning = false; // 팬 기능 시 카메라가 바닥을 뚫고 내려가지 않도록
    game.controls.minDistance = 5; // 최소 줌 아웃 거리
    game.controls.maxDistance = 50; // 최대 줌 인 거리
    game.controls.target.set(0, 0, 0); // 카메라가 게임 세계의 중앙을 바라보도록 설정
    game.controls.enabled = false; // 게임 시작 전에는 컨트롤 비활성화
    game.controls.update(); // 초기 설정 적용

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
    game.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(game.data.lightPosition.x, game.data.lightPosition.y, game.data.lightPosition.z);
    directionalLight.castShadow = true;
    game.scene.add(directionalLight);

    // Cannon.js setup
    game.cannonWorld = new CANNON.World();
    game.cannonWorld.gravity.set(0, 0, 0); // No gravity for a snake game
    game.cannonWorld.defaultContactMaterial.friction = 0;
    game.cannonWorld.defaultContactMaterial.restitution = 0;

    // Create walls (boundaries)
    const worldSize = game.data.gridSize * 20; // Assuming a 20x20 playable grid
    const halfWorldSize = worldSize / 2;
    const wallThickness = game.data.wallThickness;
    const wallHeight = game.data.gridSize; // Walls are as tall as a snake segment

    // Material for walls
    const wallTexture = game.assets.textures['wall_texture'];
    const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture instanceof THREE.Texture ? wallTexture : undefined, color: wallTexture instanceof THREE.Color ? wallTexture : undefined });
    
    // Front wall (+Z)
    createWall(0, 0, -halfWorldSize - wallThickness / 2, worldSize + wallThickness * 2, wallHeight, wallThickness, wallMaterial, "wall_z_neg");
    // Back wall (-Z)
    createWall(0, 0, halfWorldSize + wallThickness / 2, worldSize + wallThickness * 2, wallHeight, wallThickness, wallMaterial, "wall_z_pos");
    // Left wall (-X)
    createWall(-halfWorldSize - wallThickness / 2, 0, 0, wallThickness, wallHeight, worldSize + wallThickness * 2, wallMaterial, "wall_x_neg");
    // Right wall (+X)
    createWall(halfWorldSize + wallThickness / 2, 0, 0, wallThickness, wallHeight, worldSize + wallThickness * 2, wallMaterial, "wall_x_pos");

    // Initial setup for the game state (before starting)
    game.moveInterval = 1000 / game.data.snakeSpeed;
    game.direction = new THREE.Vector3(1, 0, 0);
    game.nextDirection = new THREE.Vector3(1, 0, 0);
}

function createWall(x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material, name: string): void {
    if (!game.scene || !game.cannonWorld) return;

    const wallGeometry = new THREE.BoxGeometry(width, height, depth);
    const wallMesh = new THREE.Mesh(wallGeometry, material);
    wallMesh.position.set(x, y, z);
    wallMesh.receiveShadow = true;
    game.scene.add(wallMesh);

    const wallShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const wallBody = new CANNON.Body({ mass: 0 }); // Mass 0 makes it static
    wallBody.addShape(wallShape);
    wallBody.position.set(x, y, z);
    game.cannonWorld.addBody(wallBody);
    game.wallBodies.push(wallBody);
}


function createSnakeSegment(position: THREE.Vector3, isHead: boolean): { mesh: THREE.Mesh; body: CANNON.Body; } {
    if (!game.data || !game.scene || !game.cannonWorld) {
        throw new Error("Game not initialized for creating snake segments.");
    }

    const size = game.data.gridSize;
    const texture = isHead ? game.assets.textures['snake_head'] : game.assets.textures['snake_body'];
    const material = new THREE.MeshLambertMaterial({ map: texture instanceof THREE.Texture ? texture : undefined, color: texture instanceof THREE.Color ? texture : undefined });
    const geometry = new THREE.BoxGeometry(size, size, size);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    game.scene.add(mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
    const body = new CANNON.Body({ mass: 1 }); // Give it a mass, but we'll control its position
    body.addShape(shape);
    body.position.copy(new CANNON.Vec3(position.x, position.y, position.z));
    game.cannonWorld.addBody(body);

    return { mesh, body };
}

function generateFood(): void {
    if (!game.data || !game.scene || !game.cannonWorld) return;

    // Remove old food if it exists
    if (game.food.mesh) {
        game.scene.remove(game.food.mesh);
        game.food.mesh.geometry.dispose();
        (game.food.mesh.material as THREE.Material).dispose();
        game.food.mesh = null;
    }
    if (game.food.body) {
        game.cannonWorld.removeBody(game.food.body);
        game.food.body = null;
    }

    const worldSize = game.data.gridSize * 20;
    const halfWorldSize = worldSize / 2;
    const size = game.data.gridSize;
    let foodPosition: THREE.Vector3;
    let collisionWithSnake: boolean;

    do {
        collisionWithSnake = false;
        // Generate random grid position within bounds (excluding wall thickness area)
        const numCells = 20; // Assuming 20x20 grid
        const randX = Math.floor(Math.random() * numCells) - numCells / 2; // -10 to 9
        const randZ = Math.floor(Math.random() * numCells) - numCells / 2; // -10 to 9

        foodPosition = new THREE.Vector3(
            randX * size + size / 2, // Center of the grid cell
            0, // Food at y=0, same level as snake
            randZ * size + size / 2
        );

        // Check for collision with snake
        for (const segment of game.snake) {
            if (segment.mesh.position.distanceTo(foodPosition) < size * 0.9) { // Check if positions are very close
                collisionWithSnake = true;
                break;
            }
        }
    } while (collisionWithSnake);


    const texture = game.assets.textures['food'];
    const material = new THREE.MeshLambertMaterial({ map: texture instanceof THREE.Texture ? texture : undefined, color: texture instanceof THREE.Color ? texture : undefined });
    const geometry = new THREE.SphereGeometry(size / 2, 16, 16); // Food is a sphere
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(foodPosition);
    mesh.castShadow = true;
    game.scene.add(mesh);
    game.food.mesh = mesh;

    const shape = new CANNON.Sphere(size / 2);
    const body = new CANNON.Body({ mass: 0.1 }); // Small mass so it can be 'eaten'
    body.addShape(shape);
    body.position.copy(new CANNON.Vec3(foodPosition.x, foodPosition.y, foodPosition.z));
    game.cannonWorld.addBody(body);
    game.food.body = body;
}

function playSound(name: string): void {
    const sound = game.assets.sounds[name];
    if (sound) {
        sound.currentTime = 0; // Rewind to start if already playing
        sound.play().catch(e => console.warn(`Failed to play sound ${name}:`, e)); // Catch promise rejection
    } else {
        console.warn(`Sound '${name}' not found.`);
    }
}

function updateScoreUI(): void {
    if (game.uiElements.scoreDisplay) {
        game.uiElements.scoreDisplay.innerText = `Score: ${game.score}`;
    }
}

function resetGame(): void {
    if (!game.data || !game.scene || !game.cannonWorld) return;

    // Clear existing snake and food
    game.snake.forEach(segment => {
        game.scene?.remove(segment.mesh);
        segment.mesh.geometry.dispose();
        (segment.mesh.material as THREE.Material).dispose();
        game.cannonWorld?.removeBody(segment.body);
    });
    game.snake = [];

    if (game.food.mesh) {
        game.scene.remove(game.food.mesh);
        game.food.mesh.geometry.dispose();
        (game.food.mesh.material as THREE.Material).dispose();
        game.food.mesh = null;
    }
    if (game.food.body) {
        game.cannonWorld.removeBody(game.food.body);
        game.food.body = null;
    }

    // Initial snake position (e.g., center of the playable area)
    const initialPos = new THREE.Vector3(0, 0, 0);

    // Create initial snake segments
    for (let i = 0; i < game.data.initialSnakeLength; i++) {
        const segmentPos = new THREE.Vector3(
            initialPos.x - i * game.data.gridSize,
            initialPos.y,
            initialPos.z
        );
        game.snake.push(createSnakeSegment(segmentPos, i === 0));
    }

    game.direction.set(1, 0, 0); // Reset to moving right (East)
    game.nextDirection.set(1, 0, 0);
    game.score = 0;
    updateScoreUI();
    generateFood();
}

function startGame(): void {
    if (!game.data) return;

    game.gameState = GameState.PLAYING;
    if (game.uiElements.titleScreen) game.uiElements.titleScreen.style.display = 'none';
    if (game.uiElements.gameOverScreen) game.uiElements.gameOverScreen.style.display = 'none';
    if (game.uiElements.scoreDisplay) game.uiElements.scoreDisplay.style.display = 'block';

    resetGame();
    if (game.assets.sounds['bgm'] && !game.bgm) {
        game.bgm = game.assets.sounds['bgm'];
        game.bgm.loop = true;
        game.bgm.play().catch(e => console.warn("Failed to play BGM:", e));
    } else if (game.bgm) {
        game.bgm.play().catch(e => console.warn("Failed to play BGM:", e));
    }

    playSound('start_game');
    if (game.controls) {
        game.controls.enabled = true; // 게임 시작 시 OrbitControls 활성화
    }
}

function gameOver(): void {
    game.gameState = GameState.GAME_OVER;
    if (game.bgm) {
        game.bgm.pause();
    }
    playSound('game_over');

    if (game.uiElements.scoreDisplay) game.uiElements.scoreDisplay.style.display = 'none';
    if (game.uiElements.gameOverScreen) game.uiElements.gameOverScreen.style.display = 'flex';
    const finalScoreElement = document.getElementById('finalScore');
    if (finalScoreElement) {
        finalScoreElement.innerText = `Score: ${game.score}`;
    }
    if (game.controls) {
        game.controls.enabled = false; // 게임 오버 시 OrbitControls 비활성화
    }
}

function handleInput(event: KeyboardEvent): void {
    if (!game.data) return;

    const currentDir = game.direction;
    let newDir = new THREE.Vector3();

    switch (event.key) {
        case 'ArrowUp':
            newDir.set(0, 0, -1); // Move North (negative Z)
            break;
        case 'ArrowDown':
            newDir.set(0, 0, 1); // Move South (positive Z)
            break;
        case 'ArrowLeft':
            newDir.set(-1, 0, 0); // Move West (negative X)
            break;
        case 'ArrowRight':
            newDir.set(1, 0, 0); // Move East (positive X)
            break;
        case ' ': // Space key
            if (game.gameState === GameState.TITLE || game.gameState === GameState.GAME_OVER) {
                event.preventDefault(); // Prevent scrolling
                startGame();
            }
            return; // Don't process space as a direction change
        default:
            return;
    }

    // Prevent immediate reverse (e.g., trying to go left when currently going right)
    // Check if newDir is not opposite to currentDir
    if (!newDir.equals(currentDir.clone().negate())) {
        game.nextDirection.copy(newDir);
    }
}

// --- Game Loop ---

function update(deltaTime: number): void {
    if (!game.data || game.gameState !== GameState.PLAYING) return;

    game.timeSinceLastMove += deltaTime;

    if (game.timeSinceLastMove >= game.moveInterval / 1000) { // Convert moveInterval to seconds
        game.timeSinceLastMove -= game.moveInterval / 1000;

        game.direction.copy(game.nextDirection); // Apply buffered direction

        // Store current head position before moving
        const oldHeadPosition = game.snake[0].mesh.position.clone();

        // Calculate new head position
        const head = game.snake[0];
        const newHeadPosition = head.mesh.position.clone().add(game.direction.clone().multiplyScalar(game.data.gridSize));

        // --- Collision Detection ---
        const worldSize = game.data.gridSize * 20;
        const halfWorldSize = worldSize / 2;
        const maxCoord = halfWorldSize - game.data.gridSize / 2;
        const minCoord = -halfWorldSize + game.data.gridSize / 2;

        // Wall collision
        // Check if newHeadPosition is outside the play area defined by min/maxCoord
        if (newHeadPosition.x > maxCoord || newHeadPosition.x < minCoord ||
            newHeadPosition.z > maxCoord || newHeadPosition.z < minCoord) {
            gameOver();
            return;
        }

        // Self-collision (check new head position against all body segments except the current head)
        for (let i = 1; i < game.snake.length; i++) {
            if (newHeadPosition.distanceTo(game.snake[i].mesh.position) < game.data.gridSize * 0.9) { // Check if positions are very close
                gameOver();
                return;
            }
        }

        // Move snake: Head moves to new position, body segments follow
        for (let i = game.snake.length - 1; i > 0; i--) {
            game.snake[i].mesh.position.copy(game.snake[i - 1].mesh.position);
            game.snake[i].body.position.copy(new CANNON.Vec3(game.snake[i - 1].mesh.position.x, game.snake[i - 1].mesh.position.y, game.snake[i - 1].mesh.position.z));
        }
        head.mesh.position.copy(newHeadPosition);
        head.body.position.copy(new CANNON.Vec3(newHeadPosition.x, newHeadPosition.y, newHeadPosition.z));


        // Food collision
        if (game.food.mesh && newHeadPosition.distanceTo(game.food.mesh.position) < game.data.gridSize * 0.9) {
            playSound('eat_food');
            game.score++;
            updateScoreUI();

            // Add new segment at the old tail's position (the position of the segment that was moved from by the last segment)
            // The segment that was at game.snake[game.snake.length - 1] before the move now needs a new one behind it.
            // The oldHeadPosition (which is now effectively the position of the first body segment)
            // is not suitable for the new segment. Instead, the last segment's *previous* position
            // (before it moved) is the correct spot. But since we just moved everything,
            // the new segment should actually occupy the `oldHeadPosition`'s last position.
            // A simpler approach: create the new segment at the position of the last segment *after* the move.
            // This makes the snake grow from its tail in the direction it was moving.
            const lastSegmentCurrentPos = game.snake[game.snake.length - 1].mesh.position.clone();
            game.snake.push(createSnakeSegment(lastSegmentCurrentPos, false)); 

            generateFood();
        }
    }

    // Update Cannon.js world (even if positions are manually set, this processes potential contact callbacks if any were set up)
    if (game.cannonWorld) {
        // Use a fixed time step for physics simulation for stability
        const fixedTimeStep = 1 / 60; // 60 Hz
        game.cannonWorld.step(fixedTimeStep, deltaTime, 3);
    }
}

function render(): void {
    if (game.renderer && game.scene && game.camera) {
        game.renderer.render(game.scene, game.camera);
    }
}

function gameLoop(currentTime: number): void {
    // Convert deltaTime to seconds for consistency with Cannon.js step
    const deltaTime = (currentTime - game.lastUpdateTime) / 1000; 
    game.lastUpdateTime = currentTime;

    // OrbitControls 업데이트
    if (game.controls) {
        game.controls.update();
    }

    update(deltaTime);
    render();

    requestAnimationFrame(gameLoop);
}

// --- Main Entry Point ---
document.addEventListener('DOMContentLoaded', async () => {
    game.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!game.canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found.");
        return;
    }

    await loadGameData();
    if (!game.data) {
        return;
    }

    setupUI(); // Set up UI elements

    await preloadAssets();
    createGameWorld();

    window.addEventListener('keydown', handleInput);

    // Initial render of the title screen
    game.gameState = GameState.TITLE;
    if (game.uiElements.titleScreen) game.uiElements.titleScreen.style.display = 'flex';
    if (game.uiElements.scoreDisplay) game.uiElements.scoreDisplay.style.display = 'none';
    if (game.uiElements.gameOverScreen) game.uiElements.gameOverScreen.style.display = 'none';

    game.lastUpdateTime = performance.now(); // Initialize lastUpdateTime
    requestAnimationFrame(gameLoop);
});