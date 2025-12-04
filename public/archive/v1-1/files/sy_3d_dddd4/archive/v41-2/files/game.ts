import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Add module augmentation for CANNON.Body to include userData
declare module 'cannon-es' {
    interface Body {
        userData?: ActiveBullet; // Attach the ActiveBullet instance
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

// Interface for objects placed in the scene
interface PlacedObjectConfig {
    name: string; // A descriptive name for the object instance
    textureName: string; // Name of the texture from assets.images
    type: 'box'; // Currently only supports 'box'
    position: { x: number; y: number; z: number };
    dimensions: { width: number; height: number; depth: number };
    rotationY?: number; // Optional rotation around Y-axis (radians)
    mass: number; // 0 for static, >0 for dynamic (though all placed objects here will be static)
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
        placedObjects: PlacedObjectConfig[]; // NEW: Array of objects to place in the world
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

    // Visual meshes (Three.js) for game objects
    private playerMesh!: THREE.Mesh;
    private groundMesh!: THREE.Mesh;
    // NEW: Arrays to hold references to dynamically placed objects
    private placedObjectMeshes: THREE.Mesh[] = [];
    private placedObjectBodies: CANNON.Body[] = [];

    // NEW: Active bullets
    private bullets: ActiveBullet[] = [];
    private bulletGeometry!: THREE.SphereGeometry; // Reusable geometry for bullets
    private bulletMaterialMesh!: THREE.MeshBasicMaterial; // Reusable material for bullets (using Basic to prevent lighting issues for simple bullets)

    // Input handling state
    private keys: { [key: string]: boolean } = {}; // Tracks currently pressed keys
    private isPointerLocked: boolean = false; // True if mouse pointer is locked
    private cameraPitch: number = 0; // Vertical rotation (pitch) of the camera

    // Asset management
    private textures: Map<string, THREE.Texture> = new Map(); // Stores loaded textures
    private sounds: Map<string, HTMLAudioElement> = new Map(); // Stores loaded audio elements

    // UI elements (dynamically created for the title screen)
    private titleScreenOverlay!: HTMLDivElement;
    private titleText!: HTMLDivElement;
    private promptText!: HTMLDivElement;

    // For calculating delta time between frames
    private lastTime: DOMHighResTimeStamp = 0;

    // MODIFIED: Tracks player contacts with ANY static surface (ground or placed objects) for jumping/movement logic
    private numContactsWithStaticSurfaces: number = 0;

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
        this.bulletMaterial = new CANNON.Material('bulletMaterial'); // NEW: Bullet material

        const playerGroundContactMaterial = new CANNON.ContactMaterial(
            this.playerMaterial,
            this.groundMaterial,
            {
                friction: this.config.gameSettings.playerGroundFriction, // Use configurable ground friction
                restitution: 0.0, // No bounce for ground
                // Optionally tune contactEquationRelaxation and frictionEquationRelaxation for stability/feel
                // contactEquationRelaxation: 3, 
                // frictionEquationRelaxation: 3
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
        // This is primarily for consistency and if placed objects might become dynamic later.
        const objectGroundContactMaterial = new CANNON.ContactMaterial(
            this.defaultObjectMaterial,
            this.groundMaterial,
            {
                friction: 0.0, // Use configurable player-ground friction from config
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


        // 4. Load assets (textures and sounds)
        await this.loadAssets();

        // 5. Create game objects (player, ground, and other objects) and lighting
        this.createGround(); // Creates this.groundBody
        this.createPlayer(); // Creates this.playerBody
        this.createPlacedObjects(); // NEW: Creates other objects in the scene
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

        // 8. Setup the title screen UI
        this.setupTitleScreen();

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
     * NEW: Creates visual meshes and physics bodies for all objects defined in config.gameSettings.placedObjects.
     */
    private createPlacedObjects() {
        if (!this.config.gameSettings.placedObjects) {
            console.warn("No placedObjects defined in gameSettings.");
            return;
        }

        this.config.gameSettings.placedObjects.forEach(objConfig => {
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
                mass: objConfig.mass, // Use 0 for static objects, >0 for dynamic
                position: new CANNON.Vec3(objConfig.position.x, objConfig.position.y, objConfig.position.z),
                shape: shape,
                material: this.defaultObjectMaterial // ADDED: Assign the default object material
            });
            if (objConfig.rotationY !== undefined) {
                body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), objConfig.rotationY);
            }
            this.world.addBody(body);
            this.placedObjectBodies.push(body);
        });
        console.log(`Created ${this.placedObjectMeshes.length} placed objects.`);
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
        bulletBody.userData = activeBullet; // Attach the activeBullet object to the Cannon.Body

        bulletBody.addEventListener('collide', (event: CollideEvent) => this.onBulletCollide(event, activeBullet));

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
        // If the bullet has already been removed (e.g., by lifetime/range check), do nothing.
        if (!this.bullets.includes(bullet)) {
            return;
        }

        const collidedBody = event.body; // The body that the bullet (event.target) collided with

        // Check if the collided body is the ground or a placed object
        const isGround = collidedBody === this.groundBody;
        const isPlacedObject = this.placedObjectBodies.includes(collidedBody);

        if (isGround || isPlacedObject) {
            this.removeBullet(bullet);
        }
    }

    /**
     * NEW: Removes a bullet from the scene, physics world, and active bullets array.
     * @param bulletToRemove The ActiveBullet instance to remove.
     */
    private removeBullet(bulletToRemove: ActiveBullet) {
        // Remove from Three.js scene
        this.scene.remove(bulletToRemove.mesh);
        // Remove from Cannon.js world
        this.world.removeBody(bulletToRemove.body);

        // Dispose of resources (optional, but good for performance with many bullets)
        // If geometry/material are shared (as `this.bulletGeometry` and `this.bulletMaterialMesh` are),
        // we should NOT dispose them here, as other bullets might still be using them.
        // For shared resources, they would be disposed once when the game shuts down, if ever.

        // Remove from the active bullets array
        const index = this.bullets.indexOf(bulletToRemove);
        if (index !== -1) {
            this.bullets.splice(index, 1);
        }
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
        } else {
            this.isPointerLocked = false;
            console.log('Pointer unlocked');
            // When pointer is unlocked by user (e.g., pressing Esc), cursor appears automatically.
            // Mouse look stops due to `isPointerLocked` check in onMouseMove.
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
            this.updateBullets(deltaTime); // NEW: Update bullet positions and check for despawn conditions
            this.updatePhysics(deltaTime); // Step the physics world
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

        let posX = this.playerBody.position.x;
        let posZ = this.playerBody.position.z;
        let velX = this.playerBody.velocity.x;
        let velZ = this.playerBody.velocity.z;

        // Clamp X position
        if (posX > halfGroundSize) {
            this.playerBody.position.x = halfGroundSize;
            if (velX > 0) { // If moving outwards, stop horizontal velocity
                this.playerBody.velocity.x = 0;
            }
        } else if (posX < -halfGroundSize) {
            this.playerBody.position.x = -halfGroundSize;
            if (velX < 0) { // If moving outwards, stop horizontal velocity
                this.playerBody.velocity.x = 0;
            }
        }

        // Clamp Z position
        if (posZ > halfGroundSize) {
            this.playerBody.position.z = halfGroundSize;
            if (velZ > 0) { // If moving outwards, stop horizontal velocity
                this.playerBody.velocity.z = 0;
            }
        } else if (posZ < -halfGroundSize) {
            this.playerBody.position.z = -halfGroundSize;
            if (velZ < 0) { // If moving outwards, stop horizontal velocity
                this.playerBody.velocity.z = 0;
            }
        }
    }

    /**
     * NEW: Updates active bullets, syncing meshes, checking lifetime, and range.
     */
    private updateBullets(deltaTime: number) {
        const currentTime = this.lastTime / 1000; // Current time in seconds
        const halfGroundSize = this.config.gameSettings.groundSize / 2;
        const bulletConfig = this.config.gameSettings.bullet;

        // Iterate backwards to safely remove elements
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];

            // Sync mesh with physics body
            bullet.mesh.position.copy(bullet.body.position as unknown as THREE.Vector3);
            bullet.mesh.quaternion.copy(bullet.body.quaternion as unknown as THREE.Quaternion);

            // Check lifetime
            if (currentTime - bullet.creationTime > bulletConfig.lifetime) {
                this.removeBullet(bullet);
                continue; // Move to the next bullet
            }

            // Check if outside map boundaries (similar to player clamp, but for bullets)
            // Or if it went too far from its firing point (for air shots)
            const bulletPos = bullet.body.position;
            const distanceToFirePoint = bulletPos.distanceTo(bullet.firePosition);

            if (
                bulletPos.x > halfGroundSize || bulletPos.x < -halfGroundSize ||
                bulletPos.z > halfGroundSize || bulletPos.z < -halfGroundSize ||
                distanceToFirePoint > bulletConfig.maxRange // Check max range for "공중으로 발사되었을 때 특정 범위를 벗어나면"
            ) {
                this.removeBullet(bullet);
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
        
        // Bullets are updated in updateBullets method.
    }
}

// Start the game when the DOM content is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new Game();
});