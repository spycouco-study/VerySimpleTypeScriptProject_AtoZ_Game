import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Add module augmentation for CANNON.Body to include userData for both bullets and enemies
declare module 'cannon-es' {
    interface Body {
        userData?: ActiveBullet | ActiveEnemy; // Attach the ActiveBullet or ActiveEnemy instance
    }
}

// Define interface for the Cannon-es 'collide' event
interface CollideEvent {
    // The type property is usually present on all Cannon.js events
    type: string;
    // The 'collide' event specifically has these properties:
    body: CANNON.Body; // The other body involved in the collision
    target: CANNON.Body; // The body that the event listener is attached to (e.g., the bulletBody)
    contact: CANNON.ContactEquation; // The contact equation object
}

// Enum to define the possible states of the game
enum GameState {
    TITLE,   // Title screen, waiting for user input
    PLAYING  // Game is active, user can move and look around
}

// Interface for static objects (boxes) placed in the scene
interface PlacedObjectConfig {
    name: string; // A descriptive name for the object instance
    textureName: string; // Name of the texture from assets.images
    type: 'box'; // Explicitly 'box'
    position: { x: number; y: number; z: number };
    dimensions: { width: number; height: number; depth: number };
    rotationY?: number; // Optional rotation around Y-axis (radians)
    mass: number; // 0 for static
}

// NEW: Interface for enemy type definitions from data.json
interface EnemyTypeConfig {
    name: string; // e.g., "basic_enemy"
    textureName: string;
    dimensions: { width: number; height: number; depth: number };
    mass: number;
    speed: number;
    health: number;
    scoreValue: number;
}

// NEW: Interface for specific enemy instances placed in the scene
interface PlacedEnemyInstanceConfig {
    name: string; // Unique instance name, e.g., "enemy1"
    enemyTypeName: string; // Reference to EnemyTypeConfig.name
    position: { x: number; y: number; z: number };
    rotationY?: number; // Optional initial rotation
}

// NEW: Interface for bullet configuration
interface BulletConfig {
    textureName: string;
    dimensions: { radius: number; }; // For a sphere bullet
    speed: number;
    mass: number;
    lifetime: number; // Max time in seconds before it despawns
    maxRange: number; // Max distance from fire point before it despawns
    volume: number; // Sound volume
}

// Interface to type-check the game configuration loaded from data.json
interface GameConfig {
    gameSettings: {
        titleScreenText: string;
        startGamePrompt: string;
        playerSpeed: number;
        mouseSensitivity: number;
        cameraHeightOffset: number; // Vertical offset of the camera from the player's physics body center
        cameraNear: number;         // Near clipping plane for the camera
        cameraFar: number;          // Far clipping plane for the camera
        playerMass: number;         // Mass of the player's physics body
        groundSize: number;         // Size (width/depth) of the square ground plane
        maxPhysicsSubSteps: number; // Maximum number of physics substeps per frame to maintain stability
        fixedAspectRatio: { width: number, height: number }; // New: Fixed aspect ratio for the game (width / height)
        jumpForce: number;          // ADDED: Force applied when jumping
        score: number;              // NEW: Initial score
        enemyTypes: EnemyTypeConfig[]; // NEW: Array of different enemy templates
        staticObjects: PlacedObjectConfig[]; // NEW: Renamed from placedObjects, only static boxes
        enemyInstances: PlacedEnemyInstanceConfig[]; // NEW: Array of specific enemy placements
        // NEW: Configurable physics properties
        playerGroundFriction: number;        // Friction coefficient for player-ground contact
        playerAirControlFactor: number;    // Multiplier for playerSpeed when airborne
        playerAirDeceleration: number;     // Decay factor for horizontal velocity when airborne and not moving
        bullet: BulletConfig; // NEW: Bullet configuration
    };
    assets: {
        images: { name: string; path: string; width: number; height: number }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number }[];
    };
}

// NEW: Interface for an active bullet instance
interface ActiveBullet {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    creationTime: number; // Used for lifetime check
    firePosition: CANNON.Vec3; // Used for maxRange check
    shouldRemove?: boolean; // NEW: Flag to mark for removal
    collideHandler?: (event: CollideEvent) => void; // NEW: Store the specific handler function
}

// NEW: Interface for an active enemy instance (runtime data)
interface ActiveEnemy {
    name: string;
    mesh: THREE.Mesh;
    body: CANNON.Body;
    typeConfig: EnemyTypeConfig; // Reference to its type definition
    currentHealth: number;
    shouldRemove?: boolean; // Flag to mark for removal
}

/**
 * Main Game class responsible for initializing and running the 3D game.
 * It handles Three.js rendering, Cannon-es physics, input, and game state.
 */
class Game {
    private config!: GameConfig; // Game configuration loaded from data.json
    private state: GameState = GameState.TITLE; // Current state of the game

    // Three.js elements for rendering
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private canvas!: HTMLCanvasElement; // The HTML canvas element for rendering

    // New: A container object for the camera to handle horizontal rotation separately from vertical pitch.
    private cameraContainer!: THREE.Object3D; 

    // Cannon-es elements for physics
    private world!: CANNON.World;
    private playerBody!: CANNON.Body; // Physics body for the player
    private groundBody!: CANNON.Body; // Physics body for the ground

    // NEW: Cannon-es materials for physics
    private playerMaterial!: CANNON.Material;
    private groundMaterial!: CANNON.Material;
    private defaultObjectMaterial!: CANNON.Material; // ADDED: Material for generic placed objects
    private bulletMaterial!: CANNON.Material; // NEW: Material for bullets
    private enemyMaterial!: CANNON.Material; // NEW: Material for enemies

    // Visual meshes (Three.js) for game objects
    private playerMesh!: THREE.Mesh;
    private groundMesh!: THREE.Mesh;
    // NEW: Arrays to hold references to dynamically placed objects
    private placedObjectMeshes: THREE.Mesh[] = [];
    private placedObjectBodies: CANNON.Body[] = [];

    // NEW: Active bullets
    private bullets: ActiveBullet[] = [];
    private bulletsToRemove: Set<ActiveBullet> = new Set(); // NEW: List of bullets to remove after physics step
    private bulletGeometry!: THREE.SphereGeometry; // Reusable geometry for bullets
    private bulletMaterialMesh!: THREE.MeshBasicMaterial; // Reusable material for bullets (using Basic to prevent lighting issues for simple bullets)

    // NEW: Active enemies
    private enemies: ActiveEnemy[] = [];
    private enemiesToRemove: Set<ActiveEnemy> = new Set(); // List of enemies to remove after physics step

    // Input handling state
    private keys: { [key: string]: boolean } = {}; // Tracks currently pressed keys
    private isPointerLocked: boolean = false; // True if mouse pointer is locked
    private cameraPitch: number = 0; // Vertical rotation (pitch) of the camera

    // Asset management
    private textures: Map<string, THREE.Texture> = new Map(); // Stores loaded textures
    private sounds: Map<string, HTMLAudioElement> = new Map(); // Stores loaded audio elements

    // UI elements (dynamically created for the title screen and game overlay)
    private titleScreenOverlay!: HTMLDivElement;
    private titleText!: HTMLDivElement;
    private promptText!: HTMLDivElement;
    private scoreText!: HTMLDivElement; // NEW: UI element for score
    private crosshairElement!: HTMLDivElement; // NEW: Crosshair UI element

    // For calculating delta time between frames
    private lastTime: DOMHighResTimeStamp = 0;

    // MODIFIED: Tracks player contacts with ANY static surface (ground or placed objects) for jumping/movement logic
    private numContactsWithStaticSurfaces: number = 0;

    // NEW: Game score
    private score: number = 0;

    constructor() {
        // Get the canvas element from index.html
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!this.canvas) {
            console.error('Canvas element with ID "gameCanvas" not found!');
            return; // Cannot proceed without a canvas
        }
        this.init(); // Start the asynchronous initialization process
    }

    /**
     * Asynchronously initializes the game, loading config, assets, and setting up systems.
     */
    private async init() {
        // 1. Load game configuration from data.json
        try {
            const response = await fetch('data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.config = await response.json();
            console.log('Game configuration loaded:', this.config);
            this.score = this.config.gameSettings.score; // Initialize score from config
        } catch (error) {
            console.error('Failed to load game configuration:', error);
            // If configuration fails to load, display an error message and stop.
            const errorDiv = document.createElement('div');
            errorDiv.style.position = 'absolute';
            errorDiv.style.top = '50%';
            errorDiv.style.left = '50%';
            errorDiv.style.transform = 'translate(-50%, -50%)';
            errorDiv.style.color = 'red';
            errorDiv.style.fontSize = '24px';
            errorDiv.textContent = 'Error: Failed to load game configuration. Check console for details.';
            document.body.appendChild(errorDiv);
            return;
        }

        // 2. Initialize Three.js (scene, camera, renderer)
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75, // Field of View (FOV)
            this.config.gameSettings.fixedAspectRatio.width / this.config.gameSettings.fixedAspectRatio.height, // Fixed Aspect ratio from config
            this.config.gameSettings.cameraNear, // Near clipping plane
            this.config.gameSettings.cameraFar   // Far clipping plane
        );
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        // Renderer size will be set by applyFixedAspectRatio to fit the window while maintaining aspect ratio
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true; // Enable shadows for better realism
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Use soft shadows

        // Camera setup for decoupled yaw and pitch:
        // cameraContainer handles yaw (horizontal rotation) and follows the player's position.
        // The camera itself is a child of cameraContainer and handles pitch (vertical rotation).
        this.cameraContainer = new THREE.Object3D();
        this.scene.add(this.cameraContainer);
        this.cameraContainer.add(this.camera);
        // Position the camera relative to the cameraContainer (at eye level)
        this.camera.position.y = this.config.gameSettings.cameraHeightOffset;


        // 3. Initialize Cannon-es (physics world)
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0); // Set standard Earth gravity (Y-axis down)
        this.world.broadphase = new CANNON.SAPBroadphase(this.world); // Use an efficient broadphase algorithm
        // Fix: Cast this.world.solver to CANNON.GSSolver to access the 'iterations' property
        // The default solver in Cannon.js (and Cannon-es) is GSSolver, which has this property.
        (this.world.solver as CANNON.GSSolver).iterations = 10; // Increase solver iterations for better stability

        // NEW: Create Cannon.js Materials and ContactMaterial for player-ground interaction
        this.playerMaterial = new CANNON.Material('playerMaterial');
        this.groundMaterial = new CANNON.Material('groundMaterial');
        this.defaultObjectMaterial = new CANNON.Material('defaultObjectMaterial'); // ADDED: Material for generic placed objects
        this.bulletMaterial = new CANNON.Material('bulletMaterial'); // NEW: Material for bullets
        this.enemyMaterial = new CANNON.Material('enemyMaterial'); // NEW: Material for enemies

        const playerGroundContactMaterial = new CANNON.ContactMaterial(
            this.playerMaterial,
            this.groundMaterial,
            {
                friction: this.config.gameSettings.playerGroundFriction, // Use configurable ground friction
                restitution: 0.0, // No bounce for ground
            }
        );
        this.world.addContactMaterial(playerGroundContactMaterial);

        // ADDED: Player-Object contact material (friction between player and placed objects)
        const playerObjectContactMaterial = new CANNON.ContactMaterial(
            this.playerMaterial,
            this.defaultObjectMaterial,
            {
                friction: this.config.gameSettings.playerGroundFriction, // Same friction as player-ground
                restitution: 0.0,
            }
        );
        this.world.addContactMaterial(playerObjectContactMaterial);

        // ADDED: Object-Ground contact material (friction between placed objects and ground)
        const objectGroundContactMaterial = new CANNON.ContactMaterial(
            this.defaultObjectMaterial,
            this.groundMaterial,
            {
                friction: 0.0,
                restitution: 0.0,
            }
        );
        this.world.addContactMaterial(objectGroundContactMaterial);

        // NEW: Bullet-Ground contact material (no friction, no restitution)
        const bulletGroundContactMaterial = new CANNON.ContactMaterial(
            this.bulletMaterial,
            this.groundMaterial,
            {
                friction: 0.0,
                restitution: 0.0,
            }
        );
        this.world.addContactMaterial(bulletGroundContactMaterial);

        // NEW: Bullet-Object contact material (no friction, no restitution)
        const bulletObjectContactMaterial = new CANNON.ContactMaterial(
            this.bulletMaterial,
            this.defaultObjectMaterial,
            {
                friction: 0.0,
                restitution: 0.0,
            }
        );
        this.world.addContactMaterial(bulletObjectContactMaterial);

        // NEW: Bullet-Enemy contact material (bullet disappears, enemy takes damage)
        const bulletEnemyContactMaterial = new CANNON.ContactMaterial(
            this.bulletMaterial,
            this.enemyMaterial,
            {
                friction: 0.0,
                restitution: 0.0,
            }
        );
        this.world.addContactMaterial(bulletEnemyContactMaterial);

        // NEW: Player-Enemy contact material (player might push enemy slightly)
        const playerEnemyContactMaterial = new CANNON.ContactMaterial(
            this.playerMaterial,
            this.enemyMaterial,
            {
                friction: 0.5,
                restitution: 0.0,
            }
        );
        this.world.addContactMaterial(playerEnemyContactMaterial);


        // 4. Load assets (textures and sounds)
        await this.loadAssets();

        // 5. Create game objects (player, ground, static objects, enemies) and lighting
        this.createGround(); // Creates this.groundBody
        this.createPlayer(); // Creates this.playerBody
        this.createStaticObjects(); // Renamed from createPlacedObjects, creates static boxes
        this.createEnemies(); // NEW: Creates enemies
        this.setupLighting();

        // NEW: Create reusable bullet geometry and material
        this.bulletGeometry = new THREE.SphereGeometry(this.config.gameSettings.bullet.dimensions.radius, 8, 8);
        const bulletTexture = this.textures.get(this.config.gameSettings.bullet.textureName);
        this.bulletMaterialMesh = new THREE.MeshBasicMaterial({
            map: bulletTexture,
            color: bulletTexture ? 0xffffff : 0xffff00 // Yellow if no texture
        });

        // MODIFIED: Setup Cannon-es contact listeners for general surface contact logic
        this.world.addEventListener('beginContact', (event) => {
            let bodyA = event.bodyA;
            let bodyB = event.bodyB;

            // Check if playerBody is involved in the contact
            if (bodyA === this.playerBody || bodyB === this.playerBody) {
                const otherBody = bodyA === this.playerBody ? bodyB : bodyA;
                // Check if the other body is static (mass = 0), which includes ground and placed objects
                if (otherBody.mass === 0) {
                    this.numContactsWithStaticSurfaces++;
                }
            }
        });

        this.world.addEventListener('endContact', (event) => {
            let bodyA = event.bodyA;
            let bodyB = event.bodyB;

            if (bodyA === this.playerBody || bodyB === this.playerBody) {
                const otherBody = bodyA === this.playerBody ? bodyB : bodyA;
                if (otherBody.mass === 0) {
                    this.numContactsWithStaticSurfaces = Math.max(0, this.numContactsWithStaticSurfaces - 1); // Ensure it doesn't go below 0
                }
            }
        });

        // 7. Setup event listeners for user input and window resizing
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this)); // For mouse look
        document.addEventListener('mousedown', this.onMouseDown.bind(this)); // NEW: For firing bullets
        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this)); // For pointer lock status
        document.addEventListener('mozpointerlockchange', this.onPointerLockChange.bind(this)); // Firefox compatibility
        document.addEventListener('webkitpointerlockchange', this.onPointerLockChange.bind(this)); // Webkit compatibility

        // Apply initial fixed aspect ratio and center the canvas
        this.applyFixedAspectRatio();

        // 8. Setup the title screen UI and Game UI
        this.setupTitleScreen();
        this.setupGameUI(); // NEW: Setup score display and crosshair

        // Start the main game loop
        this.animate(0); // Pass initial time 0
    }

    /**
     * Loads all textures and sounds defined in the game configuration.
     */
    private async loadAssets() {
        const textureLoader = new THREE.TextureLoader();
        const imagePromises = this.config.assets.images.map(img => {
            return textureLoader.loadAsync(img.path)
                .then(texture => {
                    this.textures.set(img.name, texture);
                    texture.wrapS = THREE.RepeatWrapping; // Repeat texture horizontally
                    texture.wrapT = THREE.RepeatWrapping; // Repeat texture vertically
                    // Adjust texture repetition for the ground to avoid stretching
                    if (img.name === 'ground_texture') {
                         texture.repeat.set(this.config.gameSettings.groundSize / 5, this.config.gameSettings.groundSize / 5);
                    }
                    // For box textures, ensure repetition if desired, or set to 1,1 for single application
                    if (img.name.endsWith('_texture')) { // Generic check for other textures
                        // For generic box textures, we might want to repeat based on object dimensions
                        // For simplicity now, let's keep default (no repeat unless explicit for ground)
                        // A more robust solution would involve setting repeat based on scale/dimensions for each object
                    }
                })
                .catch(error => {
                    console.error(`Failed to load texture: ${img.path}`, error);
                    // Continue even if an asset fails to load; fallbacks (solid colors) are used.
                });
        });

        const soundPromises = this.config.assets.sounds.map(sound => {
            return new Promise<void>((resolve) => {
                const audio = new Audio(sound.path);
                audio.volume = sound.volume;
                audio.loop = (sound.name === 'background_music'); // Loop background music
                audio.oncanplaythrough = () => {
                    this.sounds.set(sound.name, audio);
                    resolve();
                };
                audio.onerror = () => {
                    console.error(`Failed to load sound: ${sound.path}`);
                    resolve(); // Resolve even on error to not block Promise.all
                };
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log(`Assets loaded: ${this.textures.size} textures, ${this.sounds.size} sounds.`);
    }

    /**
     * Creates and displays the title screen UI dynamically.
     */
    private setupTitleScreen() {
        this.titleScreenOverlay = document.createElement('div');
        Object.assign(this.titleScreenOverlay.style, {
            position: 'absolute', // Position relative to body, will be centered and sized by applyFixedAspectRatio
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            color: 'white', fontFamily: 'Arial, sans-serif',
            fontSize: '48px', textAlign: 'center', zIndex: '1000'
        });
        document.body.appendChild(this.titleScreenOverlay);

        // Crucial: Call applyFixedAspectRatio here to ensure the title screen overlay
        // is sized and positioned correctly relative to the canvas from the start.
        this.applyFixedAspectRatio();

        this.titleText = document.createElement('div');
        this.titleText.textContent = this.config.gameSettings.titleScreenText;
        this.titleScreenOverlay.appendChild(this.titleText);

        this.promptText = document.createElement('div');
        this.promptText.textContent = this.config.gameSettings.startGamePrompt;
        Object.assign(this.promptText.style, {
            marginTop: '20px', fontSize: '24px'
        });
        this.titleScreenOverlay.appendChild(this.promptText);

        // Add event listener directly to the overlay to capture clicks and start the game
        this.titleScreenOverlay.addEventListener('click', () => this.startGame());

        // Attempt to play background music. It might be blocked by browsers if no user gesture has occurred yet.
        this.sounds.get('background_music')?.play().catch(e => console.log("BGM play denied (requires user gesture):", e));
    }

    /**
     * NEW: Creates and displays the game score UI and crosshair.
     */
    private setupGameUI() {
        this.scoreText = document.createElement('div');
        Object.assign(this.scoreText.style, {
            position: 'absolute',
            top: '10px',
            left: '10px',
            color: 'white',
            fontFamily: 'Arial, sans-serif',
            fontSize: '24px',
            zIndex: '1001' // Above title screen overlay but separate
        });
        this.scoreText.textContent = `Score: ${this.score}`;
        document.body.appendChild(this.scoreText);

        // NEW: Create and setup crosshair
        this.crosshairElement = document.createElement('div');
        Object.assign(this.crosshairElement.style, {
            position: 'absolute',
            width: '2px',  // Central dot size
            height: '2px',
            backgroundColor: 'white', // Central white dot
            // Use box-shadows for outlines and potential cross-like appearance
            boxShadow: '0 0 0 1px white, 0 0 0 3px rgba(0,0,0,0.8), 0 0 0 4px white',
            borderRadius: '50%', // Make it circular
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: '1002', // Above title screen and score
            display: 'none' // Initially hidden
        });
        document.body.appendChild(this.crosshairElement);
    }

    /**
     * NEW: Updates the score display on the UI.
     */
    private updateScoreDisplay() {
        if (this.scoreText) {
            this.scoreText.textContent = `Score: ${this.score}`;
        }
    }

    /**
     * Transitions the game from the title screen to the playing state.
     */
    private startGame() {
        this.state = GameState.PLAYING;
        // Remove the title screen overlay
        if (this.titleScreenOverlay && this.titleScreenOverlay.parentNode) {
            document.body.removeChild(this.titleScreenOverlay);
        }
        // Add event listener to canvas for re-locking pointer after title screen is gone
        this.canvas.addEventListener('click', this.handleCanvasReLockPointer.bind(this));

        // Request pointer lock for immersive mouse control
        this.canvas.requestPointerLock();
        // Ensure background music plays now that a user gesture has occurred
        this.sounds.get('background_music')?.play().catch(e => console.log("BGM play failed after user gesture:", e));

        // NEW: Show crosshair when game starts
        if (this.crosshairElement) {
            this.crosshairElement.style.display = 'block';
        }
    }

    /**
     * Handles clicks on the canvas to re-lock the pointer if the game is playing and unlocked.
     */
    private handleCanvasReLockPointer() {
        if (this.state === GameState.PLAYING && !this.isPointerLocked) {
            this.canvas.requestPointerLock();
        }
    }

    /**
     * Creates the player's visual mesh and physics body.
     */
    private createPlayer() {
        // Player visual mesh (a simple box)
        const playerTexture = this.textures.get('player_texture');
        const playerMaterial = new THREE.MeshLambertMaterial({
            map: playerTexture,
            color: playerTexture ? 0xffffff : 0x0077ff // Use white with texture, or blue if no texture
        });
        const playerGeometry = new THREE.BoxGeometry(1, 2, 1); // Player dimensions
        this.playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
        this.playerMesh.position.y = 5; // Start player slightly above the ground
        this.playerMesh.castShadow = true; // Player casts a shadow
        this.scene.add(this.playerMesh);

        // Player physics body (Cannon.js box shape)
        const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5)); // Half extents of the box for collision
        this.playerBody = new CANNON.Body({
            mass: this.config.gameSettings.playerMass, // Player's mass
            position: new CANNON.Vec3(this.playerMesh.position.x, this.playerMesh.position.y, this.playerMesh.position.z),
            shape: playerShape,
            fixedRotation: true, // Prevent the player from falling over (simulates a capsule/cylinder character)
            material: this.playerMaterial // Assign the player material for contact resolution
        });
        this.world.addBody(this.playerBody);

        // Set initial cameraContainer position to player's physics body position.
        // The camera itself is a child of cameraContainer and has its own local Y offset.
        this.cameraContainer.position.copy(this.playerBody.position as unknown as THREE.Vector3);
    }

    /**
     * Creates the ground's visual mesh and physics body.
     */
    private createGround() {
        // Ground visual mesh (a large plane)
        const groundTexture = this.textures.get('ground_texture');
        const groundMaterial = new THREE.MeshLambertMaterial({
            map: groundTexture,
            color: groundTexture ? 0xffffff : 0x888888 // Use white with texture, or grey if no texture
        });
        const groundGeometry = new THREE.PlaneGeometry(this.config.gameSettings.groundSize, this.config.gameSettings.groundSize);
        this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2; // Rotate to lay flat on the XZ plane
        this.groundMesh.receiveShadow = true; // Ground receives shadows
        this.scene.add(this.groundMesh);

        // Ground physics body (Cannon.js plane shape)
        const groundShape = new CANNON.Plane();
        this.groundBody = new CANNON.Body({
            mass: 0, // A mass of 0 makes it a static (immovable) body
            shape: groundShape,
            material: this.groundMaterial // Assign the ground material for contact resolution
        });
        // Rotate the Cannon.js plane body to match the Three.js plane orientation (flat)
        this.groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(this.groundBody);
    }

    /**
     * NEW: Creates visual meshes and physics bodies for all static objects (boxes) defined in config.gameSettings.staticObjects.
     */
    private createStaticObjects() { // Renamed from createPlacedObjects
        if (!this.config.gameSettings.staticObjects) {
            console.warn("No staticObjects defined in gameSettings.");
            return;
        }

        this.config.gameSettings.staticObjects.forEach(objConfig => {
            const texture = this.textures.get(objConfig.textureName);
            const material = new THREE.MeshLambertMaterial({
                map: texture,
                color: texture ? 0xffffff : 0xaaaaaa // Default grey if no texture
            });

            // Create Three.js Mesh
            const geometry = new THREE.BoxGeometry(objConfig.dimensions.width, objConfig.dimensions.height, objConfig.dimensions.depth);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(objConfig.position.x, objConfig.position.y, objConfig.position.z);
            if (objConfig.rotationY !== undefined) {
                mesh.rotation.y = objConfig.rotationY;
            }
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.placedObjectMeshes.push(mesh);

            // Create Cannon.js Body
            // Cannon.Box takes half extents
            const shape = new CANNON.Box(new CANNON.Vec3(
                objConfig.dimensions.width / 2,
                objConfig.dimensions.height / 2,
                objConfig.dimensions.depth / 2
            ));
            const body = new CANNON.Body({
                mass: objConfig.mass, // Use 0 for static objects
                position: new CANNON.Vec3(objConfig.position.x, objConfig.position.y, objConfig.position.z),
                shape: shape,
                material: this.defaultObjectMaterial // Assign the default object material
            });
            if (objConfig.rotationY !== undefined) {
                body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), objConfig.rotationY);
            }
            this.world.addBody(body);
            this.placedObjectBodies.push(body);
        });
        console.log(`Created ${this.placedObjectMeshes.length} static objects.`);
    }

    /**
     * NEW: Creates visual meshes and physics bodies for all enemy instances defined in config.gameSettings.enemyInstances.
     */
    private createEnemies() {
        if (!this.config.gameSettings.enemyInstances || !this.config.gameSettings.enemyTypes) {
            console.warn("No enemyInstances or enemyTypes defined in gameSettings.");
            return;
        }

        const enemyTypeMap = new Map<string, EnemyTypeConfig>();
        this.config.gameSettings.enemyTypes.forEach(type => enemyTypeMap.set(type.name, type));

        this.config.gameSettings.enemyInstances.forEach(instanceConfig => {
            const typeConfig = enemyTypeMap.get(instanceConfig.enemyTypeName);
            if (!typeConfig) {
                console.error(`Enemy type '${instanceConfig.enemyTypeName}' not found for instance '${instanceConfig.name}'. Skipping.`);
                return;
            }

            const texture = this.textures.get(typeConfig.textureName);
            const material = new THREE.MeshLambertMaterial({
                map: texture,
                color: texture ? 0xffffff : 0xff0000 // Default red if no texture
            });

            // Create Three.js Mesh
            const geometry = new THREE.BoxGeometry(typeConfig.dimensions.width, typeConfig.dimensions.height, typeConfig.dimensions.depth);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(instanceConfig.position.x, instanceConfig.position.y, instanceConfig.position.z);
            if (instanceConfig.rotationY !== undefined) {
                mesh.rotation.y = instanceConfig.rotationY;
            }
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);

            // Create Cannon.js Body
            const shape = new CANNON.Box(new CANNON.Vec3(
                typeConfig.dimensions.width / 2,
                typeConfig.dimensions.height / 2,
                typeConfig.dimensions.depth / 2
            ));
            const body = new CANNON.Body({
                mass: typeConfig.mass,
                position: new CANNON.Vec3(instanceConfig.position.x, instanceConfig.position.y, instanceConfig.position.z),
                shape: shape,
                material: this.enemyMaterial,
                fixedRotation: true // Prevent enemies from tumbling
            });
            if (instanceConfig.rotationY !== undefined) {
                body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), instanceConfig.rotationY);
            }
            this.world.addBody(body);

            const activeEnemy: ActiveEnemy = {
                name: instanceConfig.name,
                mesh: mesh,
                body: body,
                typeConfig: typeConfig,
                currentHealth: typeConfig.health,
            };
            body.userData = activeEnemy; // Attach activeEnemy to body for collision lookup

            this.enemies.push(activeEnemy);
        });
        console.log(`Created ${this.enemies.length} enemies.`);
    }

    /**
     * Sets up ambient and directional lighting in the scene.
     */
    private setupLighting() {
        const ambientLight = new THREE.AmbientLight(0x404040, 1.0); // Soft white ambient light
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Brighter directional light
        directionalLight.position.set(5, 10, 5); // Position the light source
        directionalLight.castShadow = true; // Enable shadows from this light source
        // Configure shadow properties for the directional light
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.camera.left = -10;
        directionalLight.shadow.camera.right = 10;
        directionalLight.shadow.camera.top = 10;
        directionalLight.shadow.camera.bottom = -10;
        this.scene.add(directionalLight);
    }

    /**
     * Handles window resizing to keep the camera aspect ratio and renderer size correct.
     */
    private onWindowResize() {
        this.applyFixedAspectRatio(); // Apply the fixed aspect ratio and center the canvas
    }

    /**
     * Applies the configured fixed aspect ratio to the renderer and camera,
     * resizing and centering the canvas to fit within the window.
     */
    private applyFixedAspectRatio() {
        const targetAspectRatio = this.config.gameSettings.fixedAspectRatio.width / this.config.gameSettings.fixedAspectRatio.height;

        let newWidth: number;
        let newHeight: number;

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const currentWindowAspectRatio = windowWidth / windowHeight;

        if (currentWindowAspectRatio > targetAspectRatio) {
            // Window is wider than target aspect ratio, height is the limiting factor
            newHeight = windowHeight;
            newWidth = newHeight * targetAspectRatio;
        } else {
            // Window is taller (or exactly) the target aspect ratio, width is the limiting factor
            newWidth = windowWidth;
            newHeight = newWidth / targetAspectRatio;
        }

        // Set renderer size. The third argument `updateStyle` is false because we manage style manually.
        this.renderer.setSize(newWidth, newHeight, false);
        this.camera.aspect = targetAspectRatio;
        this.camera.updateProjectionMatrix();

        // Position and size the canvas element using CSS
        Object.assign(this.canvas.style, {
            width: `${newWidth}px`,
            height: `${newHeight}px`,
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            objectFit: 'contain' // Ensures content is scaled appropriately if there's any mismatch
        });

        // If the title screen is active, update its size and position as well to match the canvas
        if (this.state === GameState.TITLE && this.titleScreenOverlay) {
            Object.assign(this.titleScreenOverlay.style, {
                width: `${newWidth}px`,
                height: `${newHeight}px`,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
            });
        }
        // The crosshair and score text will automatically re-center due to their 'absolute' positioning
        // and 'translate(-50%, -50%)' relative to the canvas's new position.
    }

    /**
     * Records which keys are currently pressed down.
     */
    private onKeyDown(event: KeyboardEvent) {
        this.keys[event.key.toLowerCase()] = true;
        // ADDED: Handle jump input only when playing and pointer is locked
        if (this.state === GameState.PLAYING && this.isPointerLocked) {
            if (event.key.toLowerCase() === ' ') { // Spacebar
                this.playerJump();
            }
        }
    }

    /**
     * Records which keys are currently released.
     */
    private onKeyUp(event: KeyboardEvent) {
        this.keys[event.key.toLowerCase()] = false;
    }

    /**
     * Handles mouse movement for camera rotation (mouse look).
     */
    private onMouseMove(event: MouseEvent) {
        // Only process mouse movement if the game is playing and pointer is locked
        if (this.state === GameState.PLAYING && this.isPointerLocked) {
            const movementX = event.movementX || 0;
            const movementY = event.movementY || 0;

            // Apply horizontal rotation (yaw) to the cameraContainer around its local Y-axis (which is global Y)
            this.cameraContainer.rotation.y -= movementX * this.config.gameSettings.mouseSensitivity;

            // Apply vertical rotation (pitch) to the camera itself and clamp it
            // Mouse UP (movementY < 0) now increases cameraPitch -> looks up.
            // Mouse DOWN (movementY > 0) now decreases cameraPitch -> looks down.
            this.cameraPitch -= movementY * this.config.gameSettings.mouseSensitivity; 
            this.cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPitch)); // Clamp to -90 to +90 degrees
            this.camera.rotation.x = this.cameraPitch;
        }
    }

    /**
     * NEW: Handles mouse click for firing bullets.
     */
    private onMouseDown(event: MouseEvent) {
        if (this.state === GameState.PLAYING && this.isPointerLocked && event.button === 0) { // Left mouse button
            this.fireBullet();
        }
    }

    /**
     * NEW: Fires a bullet from the player's camera position and direction.
     */
    private fireBullet() {
        const bulletConfig = this.config.gameSettings.bullet;

        // 1. Get bullet initial position and direction
        const cameraWorldPosition = new THREE.Vector3();
        this.camera.getWorldPosition(cameraWorldPosition);

        const cameraWorldDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraWorldDirection);

        // 2. Create Three.js Mesh for the bullet
        const bulletMesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterialMesh);
        bulletMesh.position.copy(cameraWorldPosition);
        this.scene.add(bulletMesh);

        // 3. Create Cannon.js Body for the bullet
        const bulletShape = new CANNON.Sphere(bulletConfig.dimensions.radius);
        const bulletBody = new CANNON.Body({
            mass: bulletConfig.mass,
            position: new CANNON.Vec3(cameraWorldPosition.x, cameraWorldPosition.y, cameraWorldPosition.z),
            shape: bulletShape,
            material: this.bulletMaterial,
            // Bullets should not be affected by player movement, but should have gravity
            linearDamping: 0.01, // Small damping to prevent infinite sliding
            angularDamping: 0.99 // Allows some rotation, but stops quickly
        });

        // Set bullet initial velocity
        bulletBody.velocity.set(
            cameraWorldDirection.x * bulletConfig.speed,
            cameraWorldDirection.y * bulletConfig.speed,
            cameraWorldDirection.z * bulletConfig.speed
        );

        // Store a reference to the active bullet object on the body for collision callback
        const activeBullet: ActiveBullet = {
            mesh: bulletMesh,
            body: bulletBody,
            creationTime: this.lastTime / 1000, // Store creation time in seconds
            firePosition: bulletBody.position.clone() // Store initial fire position for range check
        };
        activeBullet.collideHandler = (event: CollideEvent) => this.onBulletCollide(event, activeBullet); // Store specific handler
        bulletBody.userData = activeBullet; // Attach the activeBullet object to the Cannon.Body

        bulletBody.addEventListener('collide', activeBullet.collideHandler); // Use the stored handler

        this.world.addBody(bulletBody);
        this.bullets.push(activeBullet);

        // Play shoot sound
        this.sounds.get('shoot_sound')?.play().catch(e => console.log("Shoot sound play denied:", e));
    }

    /**
     * NEW: Handles bullet collisions.
     * @param event The Cannon.js collision event.
     * @param bullet The ActiveBullet instance that collided.
     */
    private onBulletCollide(event: CollideEvent, bullet: ActiveBullet) {
        // If the bullet has already been removed or marked for removal, do nothing.
        if (!this.bullets.includes(bullet) || bullet.shouldRemove) {
            return;
        }

        const collidedBody = event.body; // The body that the bullet (event.target) collided with
        const otherBodyUserData = collidedBody.userData; // Retrieve userData for the collided body

        const isGround = collidedBody === this.groundBody;
        const isPlacedObject = this.placedObjectBodies.includes(collidedBody); // Static boxes

        // NEW: Check if collided body is an enemy by checking its userData and typeConfig
        const isEnemy = otherBodyUserData && (otherBodyUserData as ActiveEnemy).typeConfig !== undefined;

        if (isGround || isPlacedObject) {
            // Mark bullet for removal instead of removing immediately
            bullet.shouldRemove = true;
            this.bulletsToRemove.add(bullet);
        } else if (isEnemy) {
            const enemy = otherBodyUserData as ActiveEnemy;
            if (!enemy.shouldRemove) { // Don't process hits on enemies already marked for removal
                enemy.currentHealth--;
                this.sounds.get('hit_sound')?.play().catch(e => console.log("Hit sound play denied:", e));
                console.log(`Enemy ${enemy.name} hit! Health: ${enemy.currentHealth}`);

                if (enemy.currentHealth <= 0) {
                    enemy.shouldRemove = true;
                    this.enemiesToRemove.add(enemy);
                    this.score += enemy.typeConfig.scoreValue;
                    this.updateScoreDisplay(); // Update score UI
                    this.sounds.get('enemy_death_sound')?.play().catch(e => console.log("Enemy death sound play denied:", e));
                    console.log(`Enemy ${enemy.name} defeated! Score: ${this.score}`);
                    // MODIFICATION: Deactivate enemy physics body immediately upon death
                    // This prevents further physics interactions (like player-enemy contact)
                    // for a body that is about to be removed, reducing potential runtime errors.
                    enemy.body.sleep();
                }
            }
            // Bullet always disappears on hitting an enemy
            bullet.shouldRemove = true;
            this.bulletsToRemove.add(bullet);
        }
    }

    /**
     * NEW: Iterates through bullets to mark them for removal based on lifetime, range, or out-of-bounds.
     * Actual removal is deferred to `performBulletRemovals`.
     */
    private updateBullets(deltaTime: number) {
        const currentTime = this.lastTime / 1000; // Current time in seconds
        const halfGroundSize = this.config.gameSettings.groundSize / 2;
        const bulletConfig = this.config.gameSettings.bullet;

        for (let i = 0; i < this.bullets.length; i++) {
            const bullet = this.bullets[i];

            // If already marked for removal by collision or previous check, skip further processing for this bullet this frame.
            if (bullet.shouldRemove) {
                continue;
            }

            // Check lifetime
            if (currentTime - bullet.creationTime > bulletConfig.lifetime) {
                bullet.shouldRemove = true;
                this.bulletsToRemove.add(bullet);
                continue;
            }

            // Check if outside map boundaries or if it went too far from its firing point
            const bulletPos = bullet.body.position;
            const distanceToFirePoint = bulletPos.distanceTo(bullet.firePosition);

            if (
                bulletPos.x > halfGroundSize || bulletPos.x < -halfGroundSize ||
                bulletPos.z > halfGroundSize || bulletPos.z < -halfGroundSize ||
                distanceToFirePoint > bulletConfig.maxRange ||
                bulletPos.y < -10 // If it falls very far below the ground
            ) {
                bullet.shouldRemove = true;
                this.bulletsToRemove.add(bullet);
            }
        }
    }

    /**
     * NEW: Performs the actual removal of bullets marked for removal.
     * This method is called after the physics step to avoid modifying the world during physics calculations.
     */
    private performBulletRemovals() {
        for (const bulletToRemove of this.bulletsToRemove) {
            // Remove from Three.js scene
            this.scene.remove(bulletToRemove.mesh);
            
            // Remove from Cannon.js world
            this.world.removeBody(bulletToRemove.body);

            // Remove event listener
            if (bulletToRemove.collideHandler) {
                bulletToRemove.body.removeEventListener('collide', bulletToRemove.collideHandler);
            }
            
            // Remove from the active bullets array
            const index = this.bullets.indexOf(bulletToRemove);
            if (index !== -1) {
                this.bullets.splice(index, 1);
            }
        }
        // Clear the set for the next frame
        this.bulletsToRemove.clear();
    }

    /**
     * NEW: Updates enemy movement logic (calculates velocity and rotation).
     * The actual mesh synchronization happens in syncMeshesWithBodies.
     */
    private updateEnemies(deltaTime: number) {
        if (!this.playerBody) return;

        const playerPos = this.playerBody.position;
        const halfGroundSize = this.config.gameSettings.groundSize / 2;

        for (const enemy of this.enemies) {
            if (enemy.shouldRemove) {
                continue;
            }

            const enemyPos = enemy.body.position;

            // Clamp enemy position within ground boundaries *before* movement to avoid getting stuck outside
            // This prevents enemies from wandering off the map or being pushed too far.
            const halfWidth = enemy.typeConfig.dimensions.width / 2;
            const halfDepth = enemy.typeConfig.dimensions.depth / 2;
            
            if (enemyPos.x > halfGroundSize - halfWidth) { enemy.body.position.x = halfGroundSize - halfWidth; if (enemy.body.velocity.x > 0) enemy.body.velocity.x = 0; }
            else if (enemyPos.x < -halfGroundSize + halfWidth) { enemy.body.position.x = -halfGroundSize + halfWidth; if (enemy.body.velocity.x < 0) enemy.body.velocity.x = 0; }

            if (enemyPos.z > halfGroundSize - halfDepth) { enemy.body.position.z = halfGroundSize - halfDepth; if (enemy.body.velocity.z > 0) enemy.body.velocity.z = 0; }
            else if (enemyPos.z < -halfGroundSize + halfDepth) { enemy.body.position.z = -halfGroundSize + halfDepth; if (enemy.body.velocity.z < 0) enemy.body.velocity.z = 0; }

            // Calculate direction towards player (flattened to XZ plane)
            const direction = new CANNON.Vec3();
            playerPos.vsub(enemyPos, direction);
            direction.y = 0; // Only consider horizontal movement
            direction.normalize();

            // Set enemy velocity based on direction and speed
            enemy.body.velocity.x = direction.x * enemy.typeConfig.speed;
            enemy.body.velocity.z = direction.z * enemy.typeConfig.speed;
            // enemy.body.velocity.y is managed by gravity, so we don't modify it here.

            // Make enemy look at the player (yaw only)
            const targetRotationY = Math.atan2(direction.x, direction.z); // Angle in radians
            const currentQuaternion = new THREE.Quaternion(enemy.body.quaternion.x, enemy.body.quaternion.y, enemy.body.quaternion.z, enemy.body.quaternion.w);
            const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                targetRotationY
            );
            // Smooth rotation for physics body
            const slerpedQuaternion = new THREE.Quaternion();
            slerpedQuaternion.slerpQuaternions(currentQuaternion, targetQuaternion, 0.1); // Smooth factor 0.1
            enemy.body.quaternion.copy(slerpedQuaternion as unknown as CANNON.Quaternion);
        }
    }

    /**
     * NEW: Performs the actual removal of enemies marked for removal.
     * This method is called after the physics step.
     */
    private performEnemyRemovals() {
        for (const enemyToRemove of this.enemiesToRemove) {
            this.scene.remove(enemyToRemove.mesh);
            this.world.removeBody(enemyToRemove.body);
            
            const index = this.enemies.indexOf(enemyToRemove);
            if (index !== -1) {
                this.enemies.splice(index, 1);
            }
        }
        this.enemiesToRemove.clear();
    }


    /**
     * Updates the pointer lock status when it changes (e.g., user presses Esc).
     */
    private onPointerLockChange() {
        if (document.pointerLockElement === this.canvas ||
            (document as any).mozPointerLockElement === this.canvas ||
            (document as any).webkitPointerLockElement === this.canvas) {
            this.isPointerLocked = true;
            console.log('Pointer locked');
            // Show crosshair only if game is playing AND pointer is locked
            if (this.crosshairElement && this.state === GameState.PLAYING) {
                this.crosshairElement.style.display = 'block';
            }
        } else {
            this.isPointerLocked = false;
            console.log('Pointer unlocked');
            // Hide crosshair when pointer is unlocked
            if (this.crosshairElement) {
                this.crosshairElement.style.display = 'none';
            }
        }
    }

    /**
     * The main game loop, called on every animation frame.
     */
    private animate(time: DOMHighResTimeStamp) {
        requestAnimationFrame(this.animate.bind(this)); // Request next frame

        const deltaTime = (time - this.lastTime) / 1000; // Calculate delta time in seconds
        this.lastTime = time;

        if (this.state === GameState.PLAYING) {
            this.updatePlayerMovement(); // Update player's velocity based on input
            this.updateBullets(deltaTime); // NEW: Mark bullets for removal
            this.updateEnemies(deltaTime); // NEW: Update enemy movement
            this.updatePhysics(deltaTime); // Step the physics world
            this.performBulletRemovals(); // NEW: Perform actual bullet removals *after* physics step
            this.performEnemyRemovals(); // NEW: Perform actual enemy removals *after* physics step
            this.clampPlayerPosition(); // Clamp player position to prevent going beyond ground edges
            this.syncMeshesWithBodies(); // Synchronize visual meshes with physics bodies
        }

        this.renderer.render(this.scene, this.camera); // Render the scene
    }

    /**
     * Steps the Cannon.js physics world forward.
     */
    private updatePhysics(deltaTime: number) {
        // world.step(fixedTimeStep, deltaTime, maxSubSteps)
        // 1/60: A fixed time step of 60 physics updates per second (standard).
        // deltaTime: The actual time elapsed since the last render frame.
        // maxPhysicsSubSteps: Limits the number of physics steps in one render frame
        // to prevent instabilities if rendering slows down significantly.
        this.world.step(1 / 60, deltaTime, this.config.gameSettings.maxPhysicsSubSteps);
    }

    /**
     * Updates the player's velocity based on WASD input and camera orientation.
     */
    private updatePlayerMovement() {
        // Player movement should only happen when the pointer is locked
        if (!this.isPointerLocked) {
            // If pointer is not locked, stop horizontal movement immediately
            this.playerBody.velocity.x = 0;
            this.playerBody.velocity.z = 0;
            return; // Exit early as no movement input should be processed
        }

        let effectivePlayerSpeed = this.config.gameSettings.playerSpeed;

        // MODIFIED: Apply air control factor if player is in the air (no contacts with any static surface)
        if (this.numContactsWithStaticSurfaces === 0) {
            effectivePlayerSpeed *= this.config.gameSettings.playerAirControlFactor; // Use configurable air control factor
        }
        
        const currentYVelocity = this.playerBody.velocity.y; // Preserve vertical velocity
        
        const moveDirection = new THREE.Vector3(0, 0, 0); // Use a THREE.Vector3 for calculation ease

        // Get cameraContainer's forward vector (horizontal direction player is looking)
        const cameraDirection = new THREE.Vector3();
        this.cameraContainer.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Flatten the vector to restrict movement to the horizontal plane
        cameraDirection.normalize();

        const globalUp = new THREE.Vector3(0, 1, 0); // Define global up vector for cross product

        // Calculate the 'right' vector relative to camera's forward direction
        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(globalUp, cameraDirection).normalize(); 

        let moving = false;
        // W <-> S swap from user's comments in original code:
        if (this.keys['s']) { // 's' key now moves forward
            moveDirection.add(cameraDirection);
            moving = true;
        }
        if (this.keys['w']) { // 'w' key now moves backward
            moveDirection.sub(cameraDirection);
            moving = true;
        }
        // A and D controls as standard:
        if (this.keys['a']) { // 'a' key now strafes left
            moveDirection.sub(cameraRight); 
            moving = true;
        }
        if (this.keys['d']) { // 'd' key now strafes right
            moveDirection.add(cameraRight); 
            moving = true;
        }

        if (moving) {
            moveDirection.normalize().multiplyScalar(effectivePlayerSpeed);
            // Directly set the horizontal velocity components.
            this.playerBody.velocity.x = moveDirection.x;
            this.playerBody.velocity.z = moveDirection.z;
        } else {
            // If no movement keys are pressed:
            // MODIFIED: Apply air deceleration if player is in the air
            if (this.numContactsWithStaticSurfaces === 0) {
                this.playerBody.velocity.x *= this.config.gameSettings.playerAirDeceleration;
                this.playerBody.velocity.z *= this.config.gameSettings.playerAirDeceleration;
            } else {
                // Player is on the ground or a static object: Cannon.js ContactMaterial friction will handle deceleration.
                // No explicit velocity decay is applied here for ground movement.
            }
        }
        this.playerBody.velocity.y = currentYVelocity; // Restore Y velocity (gravity/jumps)
    }

    /**
     * ADDED: Applies an upward impulse to the player body for jumping.
     */
    private playerJump() {
        // MODIFIED: Only allow jump if the player is currently on any static surface (ground or object)
        if (this.numContactsWithStaticSurfaces > 0) {
            // Clear any existing vertical velocity to ensure a consistent jump height
            this.playerBody.velocity.y = 0; 
            // Apply an upward impulse (mass * change_in_velocity)
            this.playerBody.applyImpulse(
                new CANNON.Vec3(0, this.config.gameSettings.jumpForce, 0),
                this.playerBody.position // Apply impulse at the center of mass
            );
        }
    }

    /**
     * Clamps the player's position within the defined ground boundaries.
     * Prevents the player from moving beyond the 'end of the world'.
     */
    private clampPlayerPosition() {
        if (!this.playerBody || !this.config) {
            return;
        }

        const halfGroundSize = this.config.gameSettings.groundSize / 2;
        const playerHalfWidth = 0.5; // From BoxGeometry(1,2,1) half extents for Cannon.js

        let posX = this.playerBody.position.x;
        let posZ = this.playerBody.position.z;
        let velX = this.playerBody.velocity.x;
        let velZ = this.playerBody.velocity.z;

        // Clamp X position
        if (posX > halfGroundSize - playerHalfWidth) {
            this.playerBody.position.x = halfGroundSize - playerHalfWidth;
            if (velX > 0) { // If moving outwards, stop horizontal velocity
                this.playerBody.velocity.x = 0;
            }
        } else if (posX < -halfGroundSize + playerHalfWidth) {
            this.playerBody.position.x = -halfGroundSize + playerHalfWidth;
            if (velX < 0) { // If moving outwards, stop horizontal velocity
                this.playerBody.velocity.x = 0;
            }
        }

        // Clamp Z position
        if (posZ > halfGroundSize - playerHalfWidth) {
            this.playerBody.position.z = halfGroundSize - playerHalfWidth;
            if (velZ > 0) { // If moving outwards, stop horizontal velocity
                this.playerBody.velocity.z = 0;
            }
        } else if (posZ < -halfGroundSize + playerHalfWidth) {
            this.playerBody.position.z = -halfGroundSize + playerHalfWidth;
            if (velZ < 0) { // If moving outwards, stop horizontal velocity
                this.playerBody.velocity.z = 0;
            }
        }
    }

    /**
     * Synchronizes the visual meshes with their corresponding physics bodies.
     */
    private syncMeshesWithBodies() {
        // Synchronize player's visual mesh position with its physics body's position
        this.playerMesh.position.copy(this.playerBody.position as unknown as THREE.Vector3);
        
        // Synchronize cameraContainer position with the player's physics body's position.
        this.cameraContainer.position.copy(this.playerBody.position as unknown as THREE.Vector3);

        // Synchronize player's visual mesh horizontal rotation (yaw) with cameraContainer's yaw.
        this.playerMesh.quaternion.copy(this.cameraContainer.quaternion);

        // The ground and placed objects are currently static (mass 0), so their visual meshes
        // do not need to be synchronized with their physics bodies after initial placement.
        
        // Synchronize bullet meshes with their physics bodies
        for (const bullet of this.bullets) {
            if (!bullet.shouldRemove) {
                bullet.mesh.position.copy(bullet.body.position as unknown as THREE.Vector3);
                bullet.mesh.quaternion.copy(bullet.body.quaternion as unknown as THREE.Quaternion);
            }
        }

        // NEW: Synchronize enemy meshes with their physics bodies
        for (const enemy of this.enemies) {
            if (!enemy.shouldRemove) {
                enemy.mesh.position.copy(enemy.body.position as unknown as THREE.Vector3);
                enemy.mesh.quaternion.copy(enemy.body.quaternion as unknown as THREE.Quaternion);
            }
        }
    }
}

// Start the game when the DOM content is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new Game();
});