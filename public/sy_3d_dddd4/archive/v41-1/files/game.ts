import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Enum to define the possible states of the game
enum GameState {
    TITLE,   // Title screen, waiting for user input
    PLAYING  // Game is active, user can move and look around
}

// Enum to define types of game objects for collision filtering and logic
enum GameObjectType {
    PLAYER,
    ENEMY,
    BULLET,
    STATIC_OBJECT, // Ground, placed objects
}

// Extend CANNON.Body to include a custom userData property for identifying game objects
interface CannonBodyWithUserData extends CANNON.Body {
    userData?: { type: GameObjectType, instance?: any, owner?: CANNON.Body };
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
        // NEW: Enemy and combat settings
        enemySpawnInterval: number; // Time in seconds between enemy spawns
        enemyMaxCount: number;      // Maximum number of enemies allowed at once
        enemyHealth: number;        // Health for each enemy
        enemySpeed: number;         // Enemy movement speed
        playerBulletSpeed: number;  // Speed of player's bullets
        playerFireRate: number;     // Seconds between player shots
        bulletLifetime: number;     // How long a bullet exists before being removed
        playerBulletDamage: number; // Damage a player bullet deals
    };
    assets: {
        images: { name: string; path: string; width: number; height: number }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number }[];
    };
}

/**
 * Represents an enemy character in the game.
 * Manages its visual mesh, physics body, health, and basic AI.
 */
class Enemy {
    mesh: THREE.Mesh;
    body: CannonBodyWithUserData;
    health: number;
    private game: Game; // Reference to the main Game instance

    constructor(game: Game, position: THREE.Vector3) {
        this.game = game;
        this.health = game.config.gameSettings.enemyHealth;

        const enemyTexture = game.textures.get('enemy_texture');
        const enemyMaterial = new THREE.MeshLambertMaterial({
            map: enemyTexture,
            color: enemyTexture ? 0xffffff : 0xff0000 // Red if no texture
        });
        const enemyGeometry = new THREE.BoxGeometry(1, 2, 1); // Standard enemy size
        this.mesh = new THREE.Mesh(enemyGeometry, enemyMaterial);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        game.scene.add(this.mesh);

        const enemyShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5)); // Half extents for box
        this.body = new CANNON.Body({
            mass: 10, // Enemies have mass, so they interact with physics
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: enemyShape,
            fixedRotation: true, // Prevent enemies from toppling over
            material: game.defaultObjectMaterial // Use default material for collisions
        });
        // Attach custom userData to identify this body in collision events
        this.body.userData = { type: GameObjectType.ENEMY, instance: this };
        game.world.addBody(this.body);
    }

    /**
     * Updates the enemy's state, including basic AI movement and visual synchronization.
     * @param deltaTime Time elapsed since last frame.
     * @param playerBody The physics body of the player to target.
     */
    update(deltaTime: number, playerBody: CANNON.Body) {
        // Simple AI: Move towards the player
        const playerPos = playerBody.position;
        const enemyPos = this.body.position;
        const direction = new CANNON.Vec3();
        playerPos.vsub(enemyPos, direction); // Vector from enemy to player
        direction.y = 0; // Only horizontal movement
        direction.normalize();

        // Apply velocity towards the player
        const desiredVelocity = direction.scale(this.game.config.gameSettings.enemySpeed);
        this.body.velocity.x = desiredVelocity.x;
        this.body.velocity.z = desiredVelocity.z;

        // Synchronize visual mesh with physics body
        this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
        // Orient enemy to look at player (only Y rotation)
        const lookAtVec = new THREE.Vector3(playerPos.x, enemyPos.y, playerPos.z);
        this.mesh.lookAt(lookAtVec);
        this.mesh.rotation.x = 0; // Keep horizontal
        this.mesh.rotation.z = 0; // Keep horizontal
    }

    /**
     * Reduces the enemy's health by the given amount. Destroys the enemy if health drops to 0 or below.
     * @param amount The amount of damage to take.
     */
    takeDamage(amount: number) {
        this.health -= amount;
        this.game.sounds.get('enemy_hit_sound')?.play().catch(e => {}); // Play hit sound
        if (this.health <= 0) {
            this.destroy();
            // TODO: Add score, particle effects, etc.
        }
    }

    /**
     * Removes the enemy's visual mesh and physics body from the game.
     */
    destroy() {
        this.game.scene.remove(this.mesh);
        this.game.world.removeBody(this.body);
        this.game.removeEnemy(this); // Notify Game class to remove from its list
        this.game.sounds.get('enemy_death_sound')?.play().catch(e => {}); // Play death sound
    }
}

/**
 * Represents a bullet projectile in the game.
 * Manages its visual mesh, physics body, and lifetime.
 */
class Bullet {
    mesh: THREE.Mesh;
    body: CannonBodyWithUserData;
    damage: number;
    shooterType: GameObjectType;
    private game: Game;
    private lifetime: number; // Time remaining until self-destruction
    public readonly ownerBody: CannonBodyWithUserData; // To ignore initial collision with shooter (CHANGED FROM private TO public)

    constructor(game: Game, position: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, shooterType: GameObjectType, ownerBody: CannonBodyWithUserData) {
        this.game = game;
        this.damage = damage;
        this.shooterType = shooterType;
        this.lifetime = game.config.gameSettings.bulletLifetime;
        this.ownerBody = ownerBody;

        const bulletTexture = game.textures.get('bullet_texture');
        const bulletMaterial = new THREE.MeshLambertMaterial({
            map: bulletTexture,
            color: bulletTexture ? 0xffffff : 0xffff00 // Yellow if no texture
        });
        const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8); // Small sphere for bullet
        this.mesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        game.scene.add(this.mesh);

        const bulletShape = new CANNON.Sphere(0.1); // Sphere physics shape
        this.body = new CANNON.Body({
            mass: 0.1, // Small mass, so it's affected by physics but moves fast
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: bulletShape,
            isTrigger: false, // For actual collision response
            material: game.defaultObjectMaterial // Use default material
        });
        // Set initial velocity based on direction and speed
        this.body.velocity.set(direction.x * speed, direction.y * speed, direction.z * speed);
        this.body.allowSleep = false; // Keep bullet active for physics updates

        // Attach custom userData to identify this body in collision events
        this.body.userData = { type: GameObjectType.BULLET, instance: this, owner: this.ownerBody };
        game.world.addBody(this.body);
    }

    /**
     * Updates the bullet's state, checking its lifetime and synchronizing its visual mesh.
     * @param deltaTime Time elapsed since last frame.
     */
    update(deltaTime: number) {
        this.lifetime -= deltaTime;
        if (this.lifetime <= 0) {
            this.destroy(); // Remove bullet if its lifetime expires
            return;
        }
        this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
        this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);
    }

    /**
     * Removes the bullet's visual mesh and physics body from the game.
     */
    destroy() {
        this.game.scene.remove(this.mesh);
        this.game.world.removeBody(this.body);
        this.game.removeBullet(this); // Notify Game class to remove from its list
    }
}

/**
 * Main Game class responsible for initializing and running the 3D game.
 * It handles Three.js rendering, Cannon-es physics, input, and game state.
 */
class Game {
    config!: GameConfig; // Game configuration loaded from data.json
    private state: GameState = GameState.TITLE; // Current state of the game

    // Three.js elements for rendering
    scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private renderer!: THREE.WebGLRenderer;
    private canvas!: HTMLCanvasElement; // The HTML canvas element for rendering
    private cameraContainer!: THREE.Object3D; // Container for camera to handle yaw separately

    // Cannon-es elements for physics
    world!: CANNON.World;
    private playerBody!: CannonBodyWithUserData; // Physics body for the player
    private groundBody!: CannonBodyWithUserData; // Physics body for the ground

    // Cannon-es materials for physics
    private playerMaterial!: CANNON.Material;
    private groundMaterial!: CANNON.Material;
    defaultObjectMaterial!: CANNON.Material; // Material for generic placed objects, also used by enemies/bullets

    // Visual meshes (Three.js) for game objects
    private playerMesh!: THREE.Mesh;
    private groundMesh!: THREE.Mesh;
    private placedObjectMeshes: THREE.Mesh[] = [];
    private placedObjectBodies: CannonBodyWithUserData[] = [];

    // NEW: Game entities (enemies and bullets)
    enemies: Enemy[] = [];
    bullets: Bullet[] = [];
    private lastEnemySpawnTime: number = 0; // Timer for enemy spawning
    private lastFireTime: number = 0;       // Timer for player's fire rate

    // Input handling state
    private keys: { [key: string]: boolean } = {}; // Tracks currently pressed keys
    private isPointerLocked: boolean = false; // True if mouse pointer is locked
    private cameraPitch: number = 0; // Vertical rotation (pitch) of the camera

    // Asset management
    textures: Map<string, THREE.Texture> = new Map(); // Stores loaded textures
    sounds: Map<string, HTMLAudioElement> = new Map(); // Stores loaded audio elements

    // UI elements (dynamically created for the title screen)
    private titleScreenOverlay!: HTMLDivElement;
    private titleText!: HTMLDivElement;
    private promptText!: HTMLDivElement;

    // For calculating delta time between frames
    private lastTime: DOMHighResTimeStamp = 0;

    // Tracks player contacts with ANY static surface (ground or placed objects) for jumping/movement logic
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
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true; // Enable shadows for better realism
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Use soft shadows

        this.cameraContainer = new THREE.Object3D();
        this.scene.add(this.cameraContainer);
        this.cameraContainer.add(this.camera);
        this.camera.position.y = this.config.gameSettings.cameraHeightOffset;


        // 3. Initialize Cannon-es (physics world)
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0); // Set standard Earth gravity (Y-axis down)
        this.world.broadphase = new CANNON.SAPBroadphase(this.world); // Use an efficient broadphase algorithm
        (this.world.solver as CANNON.GSSolver).iterations = 10; // Increase solver iterations for better stability

        // Create Cannon.js Materials and ContactMaterial for player-ground interaction
        this.playerMaterial = new CANNON.Material('playerMaterial');
        this.groundMaterial = new CANNON.Material('groundMaterial');
        this.defaultObjectMaterial = new CANNON.Material('defaultObjectMaterial'); // Material for generic placed objects, enemies, bullets

        const playerGroundContactMaterial = new CANNON.ContactMaterial(
            this.playerMaterial,
            this.groundMaterial,
            { friction: this.config.gameSettings.playerGroundFriction, restitution: 0.0 }
        );
        this.world.addContactMaterial(playerGroundContactMaterial);

        const playerObjectContactMaterial = new CANNON.ContactMaterial(
            this.playerMaterial,
            this.defaultObjectMaterial,
            { friction: this.config.gameSettings.playerGroundFriction, restitution: 0.0 }
        );
        this.world.addContactMaterial(playerObjectContactMaterial);

        const objectGroundContactMaterial = new CANNON.ContactMaterial(
            this.defaultObjectMaterial,
            this.groundMaterial,
            { friction: this.config.gameSettings.playerGroundFriction, restitution: 0.0 }
        );
        this.world.addContactMaterial(objectGroundContactMaterial);

        // ADDED: Object-Object contact material (e.g., enemy-enemy, enemy-placed object, bullet-object)
        const objectObjectContactMaterial = new CANNON.ContactMaterial(
            this.defaultObjectMaterial,
            this.defaultObjectMaterial,
            { friction: 0.1, restitution: 0.1 } // Small friction/restitution for generic objects
        );
        this.world.addContactMaterial(objectObjectContactMaterial);


        // 4. Load assets (textures and sounds)
        await this.loadAssets();

        // 5. Create game objects (player, ground, and other objects) and lighting
        this.createGround();
        this.createPlayer();
        this.createPlacedObjects();
        this.setupLighting();

        // NEW: Setup Cannon-es contact listeners for collision detection
        this.world.addEventListener('beginContact', (event) => {
            const bodyA = event.bodyA as CannonBodyWithUserData;
            const bodyB = event.bodyB as CannonBodyWithUserData;

            // Handle player-static surface contacts (for jumping/movement logic)
            if (bodyA.userData?.type === GameObjectType.PLAYER || bodyB.userData?.type === GameObjectType.PLAYER) {
                const otherBody = bodyA.userData?.type === GameObjectType.PLAYER ? bodyB : bodyA;
                if (otherBody.userData && otherBody.userData.type === GameObjectType.STATIC_OBJECT) {
                    this.numContactsWithStaticSurfaces++;
                }
            }

            // Handle bullet collisions
            let bulletInstance: Bullet | undefined;
            let targetBody: CannonBodyWithUserData | undefined;

            // Determine which body is the bullet and which is the target
            if (bodyA.userData?.type === GameObjectType.BULLET) {
                bulletInstance = bodyA.userData.instance as Bullet;
                targetBody = bodyB;
            } else if (bodyB.userData?.type === GameObjectType.BULLET) {
                bulletInstance = bodyB.userData.instance as Bullet;
                targetBody = bodyA;
            }

            if (bulletInstance && targetBody) {
                // Ignore collision with the owner of the bullet immediately after firing
                // The ownerBody property was changed from private to public for this access.
                if (bulletInstance.ownerBody === targetBody) {
                    return;
                }

                switch (targetBody.userData?.type) {
                    case GameObjectType.ENEMY:
                        const enemyInstance = targetBody.userData.instance as Enemy;
                        enemyInstance.takeDamage(bulletInstance.damage);
                        bulletInstance.destroy(); // Destroy bullet after hitting enemy
                        break;
                    case GameObjectType.STATIC_OBJECT:
                        bulletInstance.destroy(); // Destroy bullet after hitting static environment
                        break;
                    // TODO: Handle bullet-player collision if enemy shooting is implemented
                }
            }
        });

        this.world.addEventListener('endContact', (event) => {
            const bodyA = event.bodyA as CannonBodyWithUserData;
            const bodyB = event.bodyB as CannonBodyWithUserData;

            if (bodyA.userData?.type === GameObjectType.PLAYER || bodyB.userData?.type === GameObjectType.PLAYER) {
                const otherBody = bodyA.userData?.type === GameObjectType.PLAYER ? bodyB : bodyA;
                if (otherBody.userData && otherBody.userData.type === GameObjectType.STATIC_OBJECT) {
                    this.numContactsWithStaticSurfaces = Math.max(0, this.numContactsWithStaticSurfaces - 1); // Ensure it doesn't go below 0
                }
            }
        });

        // 7. Setup event listeners for user input and window resizing
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this)); // For mouse look
        document.addEventListener('mousedown', this.onMouseDown.bind(this)); // For mouse click (shooting)
        document.addEventListener('mouseup', this.onMouseUp.bind(this));     // For mouse click (shooting)
        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
        document.addEventListener('mozpointerlockchange', this.onPointerLockChange.bind(this));
        document.addEventListener('webkitpointerlockchange', this.onPointerLockChange.bind(this));

        // Apply initial fixed aspect ratio and center the canvas
        this.applyFixedAspectRatio();

        // 8. Setup the title screen UI
        this.setupTitleScreen();

        // Start the main game loop
        this.animate(0);
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
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    if (img.name === 'ground_texture') {
                         texture.repeat.set(this.config.gameSettings.groundSize / 5, this.config.gameSettings.groundSize / 5);
                    }
                })
                .catch(error => {
                    console.error(`Failed to load texture: ${img.path}`, error);
                });
        });

        const soundPromises = this.config.assets.sounds.map(sound => {
            return new Promise<void>((resolve) => {
                const audio = new Audio(sound.path);
                audio.volume = sound.volume;
                audio.loop = (sound.name === 'background_music');
                audio.oncanplaythrough = () => {
                    this.sounds.set(sound.name, audio);
                    resolve();
                };
                audio.onerror = () => {
                    console.error(`Failed to load sound: ${sound.path}`);
                    resolve();
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
            position: 'absolute',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center', alignItems: 'center',
            color: 'white', fontFamily: 'Arial, sans-serif',
            fontSize: '48px', textAlign: 'center', zIndex: '1000'
        });
        document.body.appendChild(this.titleScreenOverlay);

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

        this.titleScreenOverlay.addEventListener('click', () => this.startGame());

        this.sounds.get('background_music')?.play().catch(e => console.log("BGM play denied (requires user gesture):", e));
    }

    /**
     * Transitions the game from the title screen to the playing state.
     */
    private startGame() {
        this.state = GameState.PLAYING;
        if (this.titleScreenOverlay && this.titleScreenOverlay.parentNode) {
            document.body.removeChild(this.titleScreenOverlay);
        }
        this.canvas.addEventListener('click', this.handleCanvasReLockPointer.bind(this));

        this.canvas.requestPointerLock();
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
        const playerTexture = this.textures.get('player_texture');
        const playerMaterial = new THREE.MeshLambertMaterial({
            map: playerTexture,
            color: playerTexture ? 0xffffff : 0x0077ff
        });
        const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
        this.playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
        this.playerMesh.position.y = 5;
        this.playerMesh.castShadow = true;
        this.scene.add(this.playerMesh);

        const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5));
        this.playerBody = new CANNON.Body({
            mass: this.config.gameSettings.playerMass,
            position: new CANNON.Vec3(this.playerMesh.position.x, this.playerMesh.position.y, this.playerMesh.position.z),
            shape: playerShape,
            fixedRotation: true,
            material: this.playerMaterial
        }) as CannonBodyWithUserData; // Cast to include userData
        this.playerBody.userData = { type: GameObjectType.PLAYER, instance: this.playerBody }; // Identify player body
        this.world.addBody(this.playerBody);

        this.cameraContainer.position.copy(this.playerBody.position as unknown as THREE.Vector3);
    }

    /**
     * Creates the ground's visual mesh and physics body.
     */
    private createGround() {
        const groundTexture = this.textures.get('ground_texture');
        const groundMaterial = new THREE.MeshLambertMaterial({
            map: groundTexture,
            color: groundTexture ? 0xffffff : 0x888888
        });
        const groundGeometry = new THREE.PlaneGeometry(this.config.gameSettings.groundSize, this.config.gameSettings.groundSize);
        this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
        this.groundMesh.rotation.x = -Math.PI / 2;
        this.groundMesh.receiveShadow = true;
        this.scene.add(this.groundMesh);

        const groundShape = new CANNON.Plane();
        this.groundBody = new CANNON.Body({
            mass: 0,
            shape: groundShape,
            material: this.groundMaterial
        }) as CannonBodyWithUserData;
        this.groundBody.userData = { type: GameObjectType.STATIC_OBJECT }; // Identify ground body
        this.groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(this.groundBody);
    }

    /**
     * Creates visual meshes and physics bodies for all objects defined in config.gameSettings.placedObjects.
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
                color: texture ? 0xffffff : 0xaaaaaa
            });

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

            const shape = new CANNON.Box(new CANNON.Vec3(
                objConfig.dimensions.width / 2,
                objConfig.dimensions.height / 2,
                objConfig.dimensions.depth / 2
            ));
            const body = new CANNON.Body({
                mass: objConfig.mass,
                position: new CANNON.Vec3(objConfig.position.x, objConfig.position.y, objConfig.position.z),
                shape: shape,
                material: this.defaultObjectMaterial
            }) as CannonBodyWithUserData; // Cast to include userData
            body.userData = { type: GameObjectType.STATIC_OBJECT }; // Identify placed object body
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
        const ambientLight = new THREE.AmbientLight(0x404040, 1.0);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
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
        this.applyFixedAspectRatio();
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
            newHeight = windowHeight;
            newWidth = newHeight * targetAspectRatio;
        } else {
            newWidth = windowWidth;
            newHeight = newWidth / targetAspectRatio;
        }

        this.renderer.setSize(newWidth, newHeight, false);
        this.camera.aspect = targetAspectRatio;
        this.camera.updateProjectionMatrix();

        Object.assign(this.canvas.style, {
            width: `${newWidth}px`,
            height: `${newHeight}px`,
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            objectFit: 'contain'
        });

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
        if (this.state === GameState.PLAYING && this.isPointerLocked) {
            if (event.key.toLowerCase() === ' ') {
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
     * Records mouse button press state.
     */
    private onMouseDown(event: MouseEvent) {
        if (this.state === GameState.PLAYING && this.isPointerLocked) {
            if (event.button === 0) { // Left mouse button
                this.keys['mouse0'] = true;
            }
        }
    }

    /**
     * Records mouse button release state.
     */
    private onMouseUp(event: MouseEvent) {
        if (event.button === 0) {
            this.keys['mouse0'] = false;
        }
    }

    /**
     * Handles mouse movement for camera rotation (mouse look).
     */
    private onMouseMove(event: MouseEvent) {
        if (this.state === GameState.PLAYING && this.isPointerLocked) {
            const movementX = event.movementX || 0;
            const movementY = event.movementY || 0;

            this.cameraContainer.rotation.y -= movementX * this.config.gameSettings.mouseSensitivity;
            this.cameraPitch -= movementY * this.config.gameSettings.mouseSensitivity;
            this.cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPitch));
            this.camera.rotation.x = this.cameraPitch;
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
        }
    }

    /**
     * The main game loop, called on every animation frame.
     */
    private animate(time: DOMHighResTimeStamp) {
        requestAnimationFrame(this.animate.bind(this));

        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        if (this.state === GameState.PLAYING) {
            this.updatePlayerActions(deltaTime); // NEW: Handles player movement and shooting
            this.spawnEnemies(deltaTime);        // NEW: Handles enemy spawning
            this.updateEntities(deltaTime);      // NEW: Updates all enemies and bullets
            this.updatePhysics(deltaTime);
            this.clampPlayerPosition();
            this.syncMeshesWithBodies();
        }

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Steps the Cannon.js physics world forward.
     */
    private updatePhysics(deltaTime: number) {
        this.world.step(1 / 60, deltaTime, this.config.gameSettings.maxPhysicsSubSteps);
    }

    /**
     * NEW: Handles player-specific actions like movement and shooting.
     * @param deltaTime Time elapsed since last frame.
     */
    private updatePlayerActions(deltaTime: number) {
        this.updatePlayerMovement(); // Existing movement logic

        // Player shooting logic
        const currentTime = performance.now() / 1000; // Get current time in seconds
        if (this.isPointerLocked && this.keys['mouse0'] && currentTime - this.lastFireTime >= this.config.gameSettings.playerFireRate) {
            this.lastFireTime = currentTime; // Reset fire timer

            const bulletStartPos = new THREE.Vector3();
            this.camera.getWorldPosition(bulletStartPos); // Bullet starts at camera position

            const bulletDirection = new THREE.Vector3();
            this.camera.getWorldDirection(bulletDirection); // Bullet fires in camera's forward direction

            this.createBullet(
                bulletStartPos,
                bulletDirection,
                this.config.gameSettings.playerBulletSpeed,
                this.config.gameSettings.playerBulletDamage,
                GameObjectType.PLAYER,
                this.playerBody
            );
        }
    }

    /**
     * Updates the player's velocity based on WASD input and camera orientation.
     */
    private updatePlayerMovement() {
        if (!this.isPointerLocked) {
            this.playerBody.velocity.x = 0;
            this.playerBody.velocity.z = 0;
            return;
        }

        let effectivePlayerSpeed = this.config.gameSettings.playerSpeed;

        if (this.numContactsWithStaticSurfaces === 0) {
            effectivePlayerSpeed *= this.config.gameSettings.playerAirControlFactor;
        }
        
        const currentYVelocity = this.playerBody.velocity.y;
        
        const moveDirection = new THREE.Vector3(0, 0, 0);

        const cameraDirection = new THREE.Vector3();
        this.cameraContainer.getWorldDirection(cameraDirection);
        cameraDirection.y = 0;
        cameraDirection.normalize();

        const globalUp = new THREE.Vector3(0, 1, 0);

        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(globalUp, cameraDirection).normalize(); 

        let moving = false;
        if (this.keys['s']) {
            moveDirection.add(cameraDirection);
            moving = true;
        }
        if (this.keys['w']) {
            moveDirection.sub(cameraDirection);
            moving = true;
        }
        if (this.keys['a']) {
            moveDirection.sub(cameraRight); 
            moving = true;
        }
        if (this.keys['d']) {
            moveDirection.add(cameraRight); 
            moving = true;
        }

        if (moving) {
            moveDirection.normalize().multiplyScalar(effectivePlayerSpeed);
            this.playerBody.velocity.x = moveDirection.x;
            this.playerBody.velocity.z = moveDirection.z;
        } else {
            if (this.numContactsWithStaticSurfaces === 0) {
                this.playerBody.velocity.x *= this.config.gameSettings.playerAirDeceleration;
                this.playerBody.velocity.z *= this.config.gameSettings.playerAirDeceleration;
            }
        }
        this.playerBody.velocity.y = currentYVelocity;
    }

    /**
     * Applies an upward impulse to the player body for jumping.
     */
    private playerJump() {
        if (this.numContactsWithStaticSurfaces > 0) {
            this.playerBody.velocity.y = 0; 
            this.playerBody.applyImpulse(
                new CANNON.Vec3(0, this.config.gameSettings.jumpForce, 0),
                this.playerBody.position
            );
        }
    }

    /**
     * NEW: Manages spawning of enemies into the game world.
     * @param deltaTime Time elapsed since last frame.
     */
    private spawnEnemies(deltaTime: number) {
        if (this.enemies.length < this.config.gameSettings.enemyMaxCount) {
            this.lastEnemySpawnTime += deltaTime;
            if (this.lastEnemySpawnTime >= this.config.gameSettings.enemySpawnInterval) {
                this.lastEnemySpawnTime = 0; // Reset timer

                // Spawn enemy at a random position within the ground limits, slightly above ground
                const groundSize = this.config.gameSettings.groundSize;
                const spawnX = (Math.random() - 0.5) * groundSize * 0.8; // 80% of ground size to avoid edge spawns
                const spawnZ = (Math.random() - 0.5) * groundSize * 0.8;
                const spawnY = 5; // Spawn a bit above ground to fall naturally

                this.createEnemy(new THREE.Vector3(spawnX, spawnY, spawnZ));
            }
        }
    }

    /**
     * NEW: Updates all dynamic game entities (enemies and bullets).
     * @param deltaTime Time elapsed since last frame.
     */
    private updateEntities(deltaTime: number) {
        // Update enemies (e.g., AI movement)
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(deltaTime, this.playerBody);
        }

        // Update bullets (e.g., check lifetime, move visuals)
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.update(deltaTime);
        }
    }

    /**
     * NEW: Creates a new Enemy instance and adds it to the game.
     * @param position Initial position of the enemy.
     */
    private createEnemy(position: THREE.Vector3) {
        const enemy = new Enemy(this, position);
        this.enemies.push(enemy);
    }

    /**
     * NEW: Removes a specific Enemy instance from the game's active list.
     * Called by the Enemy itself when it's destroyed.
     * @param enemyToRemove The Enemy instance to remove.
     */
    removeEnemy(enemyToRemove: Enemy) {
        this.enemies = this.enemies.filter(enemy => enemy !== enemyToRemove);
    }

    /**
     * NEW: Creates a new Bullet instance and adds it to the game.
     * @param position Starting position of the bullet.
     * @param direction Firing direction of the bullet.
     * @param speed Speed of the bullet.
     * @param damage Damage the bullet deals on hit.
     * @param shooterType Type of entity that fired the bullet (PLAYER/ENEMY).
     * @param ownerBody The physics body of the entity that fired the bullet (for collision filtering).
     */
    private createBullet(position: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number, shooterType: GameObjectType, ownerBody: CannonBodyWithUserData) {
        const bullet = new Bullet(this, position, direction, speed, damage, shooterType, ownerBody);
        this.bullets.push(bullet);
        this.sounds.get('gunshot_sound')?.play().catch(e => {}); // Play gunshot sound
    }

    /**
     * NEW: Removes a specific Bullet instance from the game's active list.
     * Called by the Bullet itself when it's destroyed.
     * @param bulletToRemove The Bullet instance to remove.
     */
    removeBullet(bulletToRemove: Bullet) {
        this.bullets = this.bullets.filter(bullet => bullet !== bulletToRemove);
    }

    /**
     * Clamps the player's position within the defined ground boundaries.
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

        if (posX > halfGroundSize) {
            this.playerBody.position.x = halfGroundSize;
            if (velX > 0) {
                this.playerBody.velocity.x = 0;
            }
        } else if (posX < -halfGroundSize) {
            this.playerBody.position.x = -halfGroundSize;
            if (velX < 0) {
                this.playerBody.velocity.x = 0;
            }
        }

        if (posZ > halfGroundSize) {
            this.playerBody.position.z = halfGroundSize;
            if (velZ > 0) {
                this.playerBody.velocity.z = 0;
            }
        } else if (posZ < -halfGroundSize) {
            this.playerBody.position.z = -halfGroundSize;
            if (velZ < 0) {
                this.playerBody.velocity.z = 0;
            }
        }
    }

    /**
     * Synchronizes the visual meshes with their corresponding physics bodies.
     */
    private syncMeshesWithBodies() {
        this.playerMesh.position.copy(this.playerBody.position as unknown as THREE.Vector3);
        this.cameraContainer.position.copy(this.playerBody.position as unknown as THREE.Vector3);
        this.playerMesh.quaternion.copy(this.cameraContainer.quaternion);

        // Ground and placed objects are static, so no need to sync after initial setup.
    }
}

// Start the game when the DOM content is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    new Game();
});