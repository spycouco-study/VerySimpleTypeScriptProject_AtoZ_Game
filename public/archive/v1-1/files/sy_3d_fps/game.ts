import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

interface GameConfig {
    gameSettings: {
        title: string;
        playerSpeed: number;
        playerJumpForce: number;
        playerHealth: number;
        bulletSpeed: number;
        bulletDamage: number;
        bulletLifetime: number;
        enemyCount: number;
        enemySpeed: number;
        enemyHealth: number;
        enemyDamage: number;
        enemyAttackCooldown: number;
        gravity: number;
        floorSize: number;
        wallHeight: number;
        initialSpawnArea: number;
        musicVolume: number;
        effectVolume: number;
    };
    colors: {
        skyColor: string;
        floorColor: string;
        wallColor: string;
        playerColor: string; // Debug color for player body, not directly visible in FPS view
        enemyColor: string;
        bulletColor: string;
    };
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
}

interface GameAsset {
    [key: string]: THREE.Texture | AudioBuffer;
}

interface Bullet {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    lifetime: number;
    maxLifetime: number;
}

interface Enemy {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    health: number;
    lastAttackTime: number;
    attackCooldown: number;
}

class Game {
    private config: GameConfig;
    private canvas: HTMLCanvasElement;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: PointerLockControls; // PointerLockControls
    private world: CANNON.World;
    private playerBody: CANNON.Body;
    private playerMesh: THREE.Mesh | null = null; // Debug/placeholder mesh, typically invisible in FPS
    private canJump: boolean;
    private keys: { [key: string]: boolean };
    private lastTime: number = 0;
    private assets: GameAsset = {};
    private audioListener: THREE.AudioListener;
    private bgmSound: THREE.Audio | null = null;

    private bullets: Bullet[] = [];
    private enemies: Enemy[] = [];
    private score: number = 0;
    private playerHealth: number;
    private enemiesAlive: number = 0;

    private floorBody: CANNON.Body;

    // UI Elements - now guaranteed to exist after createUI
    private uiContainer: HTMLElement; // Main container for all UI elements
    private titleScreenElement: HTMLElement;
    private gameOverScreenElement: HTMLElement;
    private hudElement: HTMLElement;
    private healthFillElement: HTMLElement;
    private scoreValueElement: HTMLElement;
    private enemiesAliveValueElement: HTMLElement;
    private finalScoreElement: HTMLElement; // Added for game over screen score

    // Game State
    private gameState: 'TITLE_SCREEN' | 'PLAYING' | 'GAME_OVER';

    // Collision groups for Cannon.js
    private readonly COLLISION_GROUPS = {
        PLAYER: 1,
        GROUND: 2,
        ENEMY: 4,
        BULLET: 8,
        WALL: 16
    };

    constructor(canvasId: string, configData: GameConfig) {
        this.config = configData;
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas element with ID '${canvasId}' not found.`);
        }
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.playerHealth = this.config.gameSettings.playerHealth;
        this.canJump = true;
        this.keys = {};
        this.bullets = [];
        this.enemies = [];
        this.score = 0;
        this.enemiesAlive = 0;
        this.gameState = 'TITLE_SCREEN';

        // Create and set up UI elements dynamically
        this.createUI();

        // Event Listeners
        this.setupEventListeners();

        // Initial setup for Three.js and Cannon.js
        this.setupScene();
        this.setupPhysics();
    }

    async start(): Promise<void> {
        this.showTitleScreen();
        await this.preloadAssets();
        console.log("Assets loaded. Waiting for user input to start game.");
    }

    private createUI(): void {
        // Main UI container that holds all game-related UI overlays
        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'game-ui-container';
        this.uiContainer.style.position = 'absolute';
        this.uiContainer.style.top = '0';
        this.uiContainer.style.left = '0';
        this.uiContainer.style.width = '100%';
        this.uiContainer.style.height = '100%';
        this.uiContainer.style.pointerEvents = 'none'; // Allow mouse events to pass through to canvas by default
        this.uiContainer.style.fontFamily = 'Arial, sans-serif';
        this.uiContainer.style.color = '#fff';
        this.uiContainer.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        this.uiContainer.style.zIndex = '1000'; // Ensure UI is on top
        document.body.appendChild(this.uiContainer);

        // Title Screen
        this.titleScreenElement = document.createElement('div');
        this.titleScreenElement.id = 'titleScreen';
        this.titleScreenElement.style.position = 'absolute';
        this.titleScreenElement.style.top = '0';
        this.titleScreenElement.style.left = '0';
        this.titleScreenElement.style.width = '100%';
        this.titleScreenElement.style.height = '100%';
        this.titleScreenElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
        this.titleScreenElement.style.display = 'flex'; // Default to visible
        this.titleScreenElement.style.flexDirection = 'column';
        this.titleScreenElement.style.justifyContent = 'center';
        this.titleScreenElement.style.alignItems = 'center';
        this.titleScreenElement.style.cursor = 'pointer';
        this.titleScreenElement.style.pointerEvents = 'auto'; // Allow clicks on this specific overlay

        const titleText = document.createElement('h1');
        titleText.innerText = this.config.gameSettings.title;
        titleText.style.fontSize = '3em';
        titleText.style.marginBottom = '20px';

        const startText = document.createElement('p');
        startText.innerText = 'Click to Start';
        startText.style.fontSize = '1.5em';

        this.titleScreenElement.appendChild(titleText);
        this.titleScreenElement.appendChild(startText);
        this.uiContainer.appendChild(this.titleScreenElement);

        // Game Over Screen
        this.gameOverScreenElement = document.createElement('div');
        this.gameOverScreenElement.id = 'gameOverScreen';
        this.gameOverScreenElement.style.position = 'absolute';
        this.gameOverScreenElement.style.top = '0';
        this.gameOverScreenElement.style.left = '0';
        this.gameOverScreenElement.style.width = '100%';
        this.gameOverScreenElement.style.height = '100%';
        this.gameOverScreenElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
        this.gameOverScreenElement.style.display = 'none'; // Default to hidden
        this.gameOverScreenElement.style.flexDirection = 'column';
        this.gameOverScreenElement.style.justifyContent = 'center';
        this.gameOverScreenElement.style.alignItems = 'center';
        this.gameOverScreenElement.style.cursor = 'pointer';
        this.gameOverScreenElement.style.pointerEvents = 'auto';

        const gameOverText = document.createElement('h1');
        gameOverText.innerText = 'GAME OVER';
        gameOverText.style.fontSize = '3em';
        gameOverText.style.marginBottom = '20px';

        const scoreDisplay = document.createElement('p');
        scoreDisplay.innerText = 'Final Score: ';
        scoreDisplay.style.fontSize = '1.5em';
        this.finalScoreElement = document.createElement('span'); // Store reference for updating
        this.finalScoreElement.id = 'finalScore';
        this.finalScoreElement.innerText = '0';
        scoreDisplay.appendChild(this.finalScoreElement);

        const restartText = document.createElement('p');
        restartText.innerText = 'Click to Restart';
        restartText.style.fontSize = '1.2em';

        this.gameOverScreenElement.appendChild(gameOverText);
        this.gameOverScreenElement.appendChild(scoreDisplay);
        this.gameOverScreenElement.appendChild(restartText);
        this.uiContainer.appendChild(this.gameOverScreenElement);

        // HUD
        this.hudElement = document.createElement('div');
        this.hudElement.id = 'hud';
        this.hudElement.style.position = 'absolute';
        this.hudElement.style.top = '10px';
        this.hudElement.style.left = '10px';
        this.hudElement.style.width = 'calc(100% - 20px)';
        this.hudElement.style.display = 'none'; // Default to hidden
        this.hudElement.style.pointerEvents = 'none'; // Don't block game interaction

        // Health Bar
        const healthContainer = document.createElement('div');
        healthContainer.style.width = '200px';
        healthContainer.style.height = '20px';
        healthContainer.style.backgroundColor = 'rgba(255,0,0,0.3)';
        healthContainer.style.border = '1px solid #fff';
        healthContainer.style.position = 'absolute';
        healthContainer.style.bottom = '20px';
        healthContainer.style.left = '20px';
        this.healthFillElement = document.createElement('div');
        this.healthFillElement.id = 'healthFill';
        this.healthFillElement.style.width = '100%'; // Will be updated to player health
        this.healthFillElement.style.height = '100%';
        this.healthFillElement.style.backgroundColor = 'lime';
        healthContainer.appendChild(this.healthFillElement);
        this.hudElement.appendChild(healthContainer);

        // Score
        const scoreDisplayHUD = document.createElement('div');
        scoreDisplayHUD.style.position = 'absolute';
        scoreDisplayHUD.style.top = '20px';
        scoreDisplayHUD.style.right = '20px';
        scoreDisplayHUD.style.fontSize = '1.5em';
        scoreDisplayHUD.innerText = 'Score: ';
        this.scoreValueElement = document.createElement('span');
        this.scoreValueElement.id = 'scoreValue';
        this.scoreValueElement.innerText = '0';
        scoreDisplayHUD.appendChild(this.scoreValueElement);
        this.hudElement.appendChild(scoreDisplayHUD);

        // Enemies Alive
        const enemiesAliveDisplay = document.createElement('div');
        enemiesAliveDisplay.style.position = 'absolute';
        enemiesAliveDisplay.style.top = '60px';
        enemiesAliveDisplay.style.right = '20px';
        enemiesAliveDisplay.style.fontSize = '1.5em';
        enemiesAliveDisplay.innerText = 'Enemies: ';
        this.enemiesAliveValueElement = document.createElement('span');
        this.enemiesAliveValueElement.id = 'enemiesAliveValue';
        this.enemiesAliveValueElement.innerText = '0';
        enemiesAliveDisplay.appendChild(this.enemiesAliveValueElement);
        this.hudElement.appendChild(enemiesAliveDisplay);

        this.uiContainer.appendChild(this.hudElement);
    }

    private setupEventListeners(): void {
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
        document.addEventListener('keydown', this.onKeyDown.bind(this), false);
        document.addEventListener('keyup', this.onKeyUp.bind(this), false);
        document.addEventListener('mousedown', this.onMouseDown.bind(this), false);

        // Add listeners to dynamically created UI elements
        this.titleScreenElement.addEventListener('click', this.onTitleScreenClick.bind(this), false);
        this.gameOverScreenElement.addEventListener('click', this.onGameOverScreenClick.bind(this), false);

        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this), false);
        document.addEventListener('pointerlockerror', this.onPointerLockError.bind(this), false);
    }

    private showTitleScreen(): void {
        this.titleScreenElement.style.display = 'flex';
        this.hideHUD();
        this.hideGameOverScreen();
    }

    private hideTitleScreen(): void {
        this.titleScreenElement.style.display = 'none';
    }

    private showHUD(): void {
        this.hudElement.style.display = 'block';
    }

    private hideHUD(): void {
        this.hudElement.style.display = 'none';
    }

    private showGameOverScreen(): void {
        this.finalScoreElement.innerText = this.score.toString();
        this.gameOverScreenElement.style.display = 'flex';
        this.hideHUD();
        this.bgmSound?.stop();
        this.bgmSound?.disconnect(); // Disconnect BGM on game over
    }

    private hideGameOverScreen(): void {
        this.gameOverScreenElement.style.display = 'none';
    }

    private onTitleScreenClick(): void {
        if (this.gameState === 'TITLE_SCREEN') {
            this.hideTitleScreen();
            this.startGame();
        }
    }

    private onGameOverScreenClick(): void {
        if (this.gameState === 'GAME_OVER') {
            this.hideGameOverScreen();
            this.restartGame();
        }
    }

    private async preloadAssets(): Promise<void> {
        const textureLoader = new THREE.TextureLoader();
        const audioLoader = new THREE.AudioLoader();

        const imagePromises = this.config.assets.images.map(img => {
            return new Promise<void>((resolve, reject) => {
                textureLoader.load(img.path,
                    (texture: THREE.Texture) => {
                        this.assets[img.name] = texture;
                        resolve();
                    },
                    undefined, // onProgress
                    (err: Error) => {
                        console.error(`Error loading image ${img.name}:`, err);
                        reject(err);
                    }
                );
            });
        });

        const soundPromises = this.config.assets.sounds.map(snd => {
            return new Promise<void>((resolve, reject) => {
                audioLoader.load(snd.path,
                    (buffer: AudioBuffer) => {
                        this.assets[snd.name] = buffer;
                        resolve();
                    },
                    undefined, // onProgress
                    (err: Error) => {
                        console.error(`Error loading sound ${snd.name}:`, err);
                        reject(err);
                    }
                );
            });
        });

        await Promise.all([...imagePromises, ...soundPromises]);
        console.log("All assets loaded.");
    }

    private setupScene(): void {
        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 2, 0); // Player initial position slightly above ground

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(new THREE.Color(this.config.colors.skyColor));

        // Audio Listener
        this.audioListener = new THREE.AudioListener();
        this.camera.add(this.audioListener);

        // Lighting
        this.scene.add(new THREE.AmbientLight(0x666666));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        this.scene.add(dirLight);

        // Skybox
        const skyboxImageNames = ['skybox_px', 'skybox_nx', 'skybox_py', 'skybox_ny', 'skybox_pz', 'skybox_nz'];
        const materials = skyboxImageNames.map(name => {
            const asset = this.assets[name];
            if (asset instanceof THREE.Texture) {
                return new THREE.MeshBasicMaterial({ map: asset, side: THREE.BackSide });
            }
            // Fallback: use skyColor from config
            return new THREE.MeshBasicMaterial({ color: new THREE.Color(this.config.colors.skyColor), side: THREE.BackSide });
        });
        const skybox = new THREE.Mesh(new THREE.BoxGeometry(1000, 1000, 1000), materials);
        this.scene.add(skybox);
    }

    private setupPhysics(): void {
        this.world = new CANNON.World();
        this.world.gravity.set(0, this.config.gameSettings.gravity, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world); // Performance improvement
        this.world.allowSleep = true; // Objects can "sleep" when not moving

        // Physics materials
        const groundMaterial = new CANNON.Material("groundMaterial");
        const playerMaterial = new CANNON.Material("playerMaterial");
        const enemyMaterial = new CANNON.Material("enemyMaterial");
        const bulletMaterial = new CANNON.Material("bulletMaterial");

        this.world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, playerMaterial, { friction: 0.1, restitution: 0.0 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, enemyMaterial, { friction: 0.5, restitution: 0.0 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(playerMaterial, enemyMaterial, { friction: 0.0, restitution: 0.0 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(bulletMaterial, enemyMaterial, { friction: 0.0, restitution: 0.0 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(bulletMaterial, groundMaterial, { friction: 0.0, restitution: 0.5 }));
        this.world.addContactMaterial(new CANNON.ContactMaterial(bulletMaterial, bulletMaterial, { friction: 0.0, restitution: 0.5 }));
    }

    private startGame(): void {
        this.gameState = 'PLAYING';
        this.hideTitleScreen();
        this.showHUD();
        this.playerHealth = this.config.gameSettings.playerHealth;
        this.score = 0;
        this.enemiesAlive = 0;
        this.bullets = [];
        this.enemies = [];
        this.keys = {};
        this.canJump = true;

        // Clear existing objects from scene and world
        this.clearGameObjects();

        this.createFloor();
        this.createWalls();
        this.createPlayer();
        this.createEnemies(this.config.gameSettings.enemyCount);

        this.startBGM();
        this.updateUI();

        // Request pointer lock to start FPS controls
        this.requestPointerLock();
        this.lastTime = performance.now();
        requestAnimationFrame(this.animate.bind(this));
    }

    private restartGame(): void {
        this.startGame(); // Re-initialize and start a new game
    }

    private clearGameObjects(): void {
        // Remove old physics bodies
        this.world.bodies.forEach(body => this.world.removeBody(body));
        // Remove old meshes (except skybox, light, camera, etc.)
        const objectsToRemove = this.scene.children.filter(obj =>
            obj !== this.camera && obj !== this.audioListener &&
            obj instanceof THREE.Mesh && !(obj.geometry instanceof THREE.BoxGeometry && Array.isArray(obj.material) && obj.material.every(m => m instanceof THREE.MeshBasicMaterial && m.side === THREE.BackSide)) // Keep skybox
        );
        objectsToRemove.forEach(obj => this.scene.remove(obj));
    }


    private createPlayer(): void {
        // Player body (capsule for better ground contact)
        const playerShape = new CANNON.Cylinder(0.5, 0.5, 1.8, 16); // radiusTop, radiusBottom, height, segments
        this.playerBody = new CANNON.Body({ mass: 5, shape: playerShape, linearDamping: 0.9, angularDamping: 0.9 });
        this.playerBody.position.set(0, 10, 0); // Spawn slightly in air to fall onto ground
        this.playerBody.fixedRotation = true; // Prevent player from tipping over
        this.playerBody.updateMassProperties();
        this.playerBody.collisionFilterGroup = this.COLLISION_GROUPS.PLAYER;
        this.playerBody.collisionFilterMask = this.COLLISION_GROUPS.GROUND | this.COLLISION_GROUPS.ENEMY | this.COLLISION_GROUPS.WALL;
        this.world.addBody(this.playerBody);

        this.playerBody.addEventListener("collide", (event: any) => {
            if (event.body === this.floorBody) {
                this.canJump = true;
            }
        });

        // PointerLockControls
        this.controls = new PointerLockControls(this.camera, document.body);
        this.scene.add(this.controls.object); // The controls object is a THREE.Object3D containing the camera

        // Debug player mesh (invisible in actual game, but can be useful for dev)
        const playerGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16);
        const playerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.config.colors.playerColor), wireframe: true, transparent: true, opacity: 0 });
        this.playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
        this.scene.add(this.playerMesh);
    }

    private createFloor(): void {
        const floorSize = this.config.gameSettings.floorSize;
        const textureAsset = this.assets['floorTexture'];
        let floorTexture: THREE.Texture | undefined;

        if (textureAsset instanceof THREE.Texture) {
            floorTexture = textureAsset;
            floorTexture.wrapS = THREE.RepeatWrapping;
            floorTexture.wrapT = THREE.RepeatWrapping;
            floorTexture.repeat.set(floorSize / 5, floorSize / 5); // Repeat texture based on floor size
        }

        const floorGeometry = new THREE.BoxGeometry(floorSize, 1, floorSize);
        const floorMaterialOptions: THREE.MeshLambertMaterialParameters = {};
        if (floorTexture) {
            floorMaterialOptions.map = floorTexture;
        } else {
            floorMaterialOptions.color = new THREE.Color(this.config.colors.floorColor);
        }
        const floorMaterial = new THREE.MeshLambertMaterial(floorMaterialOptions);
        
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.position.y = -0.5; // Place floor bottom at y=0
        this.scene.add(floorMesh);

        this.floorBody = new CANNON.Body({ mass: 0 }); // Static body
        this.floorBody.addShape(new CANNON.Box(new CANNON.Vec3(floorSize / 2, 0.5, floorSize / 2)));
        this.floorBody.position.y = -0.5;
        this.floorBody.collisionFilterGroup = this.COLLISION_GROUPS.GROUND;
        this.world.addBody(this.floorBody);
    }

    private createWalls(): void {
        const floorSize = this.config.gameSettings.floorSize;
        const wallHeight = this.config.gameSettings.wallHeight;
        const wallThickness = 1;
        const textureAsset = this.assets['wallTexture'];
        let wallTexture: THREE.Texture | undefined;

        if (textureAsset instanceof THREE.Texture) {
            wallTexture = textureAsset;
            wallTexture.wrapS = THREE.RepeatWrapping;
            wallTexture.wrapT = THREE.RepeatWrapping;
            // Example: Adjust repeat based on wall dimensions
            // wallTexture.repeat.set(floorSize / 5, wallHeight / 5); 
        }

        const wallMaterialOptions: THREE.MeshLambertMaterialParameters = {};
        if (wallTexture) {
            wallMaterialOptions.map = wallTexture;
        } else {
            wallMaterialOptions.color = new THREE.Color(this.config.colors.wallColor);
        }
        const wallMaterial = new THREE.MeshLambertMaterial(wallMaterialOptions);

        const createWall = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
            const wallGeometry = new THREE.BoxGeometry(sx, sy, sz);
            const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
            wallMesh.position.set(x, y, z);
            this.scene.add(wallMesh);

            const wallBody = new CANNON.Body({ mass: 0 });
            wallBody.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
            wallBody.position.set(x, y, z);
            wallBody.collisionFilterGroup = this.COLLISION_GROUPS.WALL;
            this.world.addBody(wallBody);
        };

        // Front wall
        createWall(0, wallHeight / 2, -floorSize / 2, floorSize, wallHeight, wallThickness);
        // Back wall
        createWall(0, wallHeight / 2, floorSize / 2, floorSize, wallHeight, wallThickness);
        // Left wall
        createWall(-floorSize / 2, wallHeight / 2, 0, wallThickness, wallHeight, floorSize);
        // Right wall
        createWall(floorSize / 2, wallHeight / 2, 0, wallThickness, wallHeight, floorSize);
    }

    private createEnemies(count: number): void {
        const floorSize = this.config.gameSettings.floorSize;
        const spawnArea = this.config.gameSettings.initialSpawnArea;
        const textureAsset = this.assets['enemyTexture'];
        let enemyTexture: THREE.Texture | undefined;
        if (textureAsset instanceof THREE.Texture) {
            enemyTexture = textureAsset;
            enemyTexture.wrapS = THREE.RepeatWrapping;
            enemyTexture.wrapT = THREE.RepeatWrapping;
        }

        const enemyRadius = 0.8;
        const enemyHeight = 1.6;

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * spawnArea;
            const z = (Math.random() - 0.5) * spawnArea;
            const y = enemyHeight / 2; // Spawn enemies slightly above ground

            const enemyGeometry = new THREE.BoxGeometry(enemyRadius * 2, enemyHeight, enemyRadius * 2);
            const enemyMaterialOptions: THREE.MeshLambertMaterialParameters = {};
            if (enemyTexture) {
                enemyMaterialOptions.map = enemyTexture;
            } else {
                enemyMaterialOptions.color = new THREE.Color(this.config.colors.enemyColor);
            }
            const enemyMaterial = new THREE.MeshLambertMaterial(enemyMaterialOptions);
            
            const enemyMesh = new THREE.Mesh(enemyGeometry, enemyMaterial);
            enemyMesh.position.set(x, y, z);
            this.scene.add(enemyMesh);

            const enemyShape = new CANNON.Box(new CANNON.Vec3(enemyRadius, enemyHeight / 2, enemyRadius));
            const enemyBody = new CANNON.Body({ mass: 10, shape: enemyShape, linearDamping: 0.9, angularDamping: 0.9 });
            enemyBody.position.set(x, y, z);
            enemyBody.fixedRotation = true;
            enemyBody.collisionFilterGroup = this.COLLISION_GROUPS.ENEMY;
            enemyBody.collisionFilterMask = this.COLLISION_GROUPS.GROUND | this.COLLISION_GROUPS.PLAYER | this.COLLISION_GROUPS.BULLET | this.COLLISION_GROUPS.WALL;
            this.world.addBody(enemyBody);

            this.enemies.push({
                mesh: enemyMesh,
                body: enemyBody,
                health: this.config.gameSettings.enemyHealth,
                lastAttackTime: 0,
                attackCooldown: this.config.gameSettings.enemyAttackCooldown
            });
            this.enemiesAlive++;
        }
    }

    private animate(time: number): void {
        if (this.gameState !== 'PLAYING') {
            return;
        }

        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        if (dt > 1 / 30) { // Cap delta time to prevent physics glitches with very large dt
            this.world.step(1 / 60, dt, 3); // Fixed time step for physics
        } else {
            this.world.step(1 / 60, dt);
        }

        // Player movement
        this.handlePlayerMovement(dt);

        // Sync Three.js camera with Cannon.js player body
        this.camera.position.copy(this.playerBody.position as any);
        this.camera.position.y += 0.8; // Adjust camera to 'eye level'
        if (this.playerMesh) {
            this.playerMesh.position.copy(this.playerBody.position as any);
            this.playerMesh.quaternion.copy(this.playerBody.quaternion as any);
        }

        // Update enemies
        this.updateEnemies(dt);

        // Update bullets
        this.updateBullets(dt);

        // Render
        this.renderer.render(this.scene, this.camera);

        // Update UI
        this.updateUI();

        requestAnimationFrame(this.animate.bind(this));
    }

    private handlePlayerMovement(dt: number): void {
        if (!this.controls.isLocked) return;

        const inputVelocity = new THREE.Vector3();
        const playerSpeed = this.config.gameSettings.playerSpeed;

        if (this.keys['KeyW']) inputVelocity.z -= playerSpeed;
        if (this.keys['KeyS']) inputVelocity.z += playerSpeed;
        if (this.keys['KeyA']) inputVelocity.x -= playerSpeed;
        if (this.keys['KeyD']) inputVelocity.x += playerSpeed;

        // Apply input velocity in camera direction
        const playerDirection = new THREE.Vector3();
        this.camera.getWorldDirection(playerDirection); // Get forward direction of camera
        playerDirection.y = 0; // Don't move up/down from camera pitch
        playerDirection.normalize();

        const rightDirection = new THREE.Vector3();
        rightDirection.crossVectors(this.camera.up, playerDirection); // Get right direction

        const finalVelocity = new CANNON.Vec3();
        if (this.keys['KeyW'] || this.keys['KeyS']) {
            finalVelocity.x += playerDirection.x * inputVelocity.z;
            finalVelocity.z += playerDirection.z * inputVelocity.z;
        }
        if (this.keys['KeyA'] || this.keys['KeyD']) {
            finalVelocity.x += rightDirection.x * inputVelocity.x;
            finalVelocity.z += rightDirection.z * inputVelocity.x;
        }

        // Preserve current vertical velocity (gravity, jumps)
        const currentYVelocity = this.playerBody.velocity.y;
        this.playerBody.velocity.set(finalVelocity.x, currentYVelocity, finalVelocity.z);

        // Jump
        if (this.keys['Space'] && this.canJump) {
            this.playerBody.velocity.y = this.config.gameSettings.playerJumpForce;
            this.canJump = false; // Prevent multiple jumps
        }
    }

    private onKeyDown(event: KeyboardEvent): void {
        this.keys[event.code] = true;
    }

    private onKeyUp(event: KeyboardEvent): void {
        this.keys[event.code] = false;
    }

    private onMouseDown(event: MouseEvent): void {
        if (this.gameState === 'PLAYING' && this.controls.isLocked) {
            if (event.button === 0) { // Left click
                this.fireBullet();
            }
        }
    }

    private onPointerLockChange(): void {
        if (document.pointerLockElement === document.body) {
            this.controls.isLocked = true;
            console.log('PointerLockControls: Locked');
            if (this.gameState === 'PLAYING') {
                this.bgmSound?.play();
            }
        } else {
            this.controls.isLocked = false;
            console.log('PointerLockControls: Unlocked');
            if (this.gameState === 'PLAYING') {
                this.bgmSound?.pause();
            }
        }
    }

    private onPointerLockError(): void {
        console.error('PointerLockControls: Error');
    }

    private requestPointerLock(): void {
        document.body.requestPointerLock();
    }

    private fireBullet(): void {
        const bulletSpeed = this.config.gameSettings.bulletSpeed;
        const bulletLifetime = this.config.gameSettings.bulletLifetime;
        const textureAsset = this.assets['bulletTexture'];
        let bulletTexture: THREE.Texture | undefined;
        if (textureAsset instanceof THREE.Texture) {
            bulletTexture = textureAsset;
        }

        const bulletGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const bulletMaterialOptions: THREE.MeshLambertMaterialParameters = {};
        if (bulletTexture) {
            bulletMaterialOptions.map = bulletTexture;
        } else {
            bulletMaterialOptions.color = new THREE.Color(this.config.colors.bulletColor);
        }
        const bulletMaterial = new THREE.MeshLambertMaterial(bulletMaterialOptions);

        const bulletMesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
        this.scene.add(bulletMesh);

        const bulletShape = new CANNON.Sphere(0.2);
        const bulletBody = new CANNON.Body({ mass: 0.1, shape: bulletShape });
        bulletBody.collisionFilterGroup = this.COLLISION_GROUPS.BULLET;
        bulletBody.collisionFilterMask = this.COLLISION_GROUPS.ENEMY | this.COLLISION_GROUPS.GROUND | this.COLLISION_GROUPS.WALL;
        this.world.addBody(bulletBody);

        const raycaster = new THREE.Raycaster(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
        const bulletSpawnOffset = new THREE.Vector3();
        raycaster.ray.at(0.5, bulletSpawnOffset); // Spawn bullet slightly in front of camera

        bulletBody.position.copy(bulletSpawnOffset as any);

        const bulletDirection = new THREE.Vector3();
        this.camera.getWorldDirection(bulletDirection);
        bulletBody.velocity.copy(bulletDirection.multiplyScalar(bulletSpeed) as any);

        bulletBody.addEventListener("collide", (event: any) => {
            if (event.body.mass === 0 || event.body.collisionFilterGroup === this.COLLISION_GROUPS.GROUND || event.body.collisionFilterGroup === this.COLLISION_GROUPS.WALL) {
                // Hit ground or wall, just remove bullet
                this.removeBullet(bulletBody);
            } else if (event.body.collisionFilterGroup === this.COLLISION_GROUPS.ENEMY) {
                const hitEnemy = this.enemies.find(e => e.body === event.body);
                if (hitEnemy) {
                    this.enemyTakeDamage(hitEnemy, this.config.gameSettings.bulletDamage);
                }
                this.removeBullet(bulletBody);
            }
        });

        this.bullets.push({ mesh: bulletMesh, body: bulletBody, lifetime: 0, maxLifetime: bulletLifetime });
        this.playSound('shoot', bulletSpawnOffset);
    }

    private removeBullet(bodyToRemove: CANNON.Body): void {
        const index = this.bullets.findIndex(b => b.body === bodyToRemove);
        if (index !== -1) {
            const bullet = this.bullets[index];
            this.scene.remove(bullet.mesh);
            this.world.removeBody(bullet.body);
            this.bullets.splice(index, 1);
        }
    }

    private updateBullets(dt: number): void {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.lifetime += dt;

            if (bullet.lifetime > bullet.maxLifetime) {
                this.removeBullet(bullet.body);
            } else {
                bullet.mesh.position.copy(bullet.body.position as any);
                bullet.mesh.quaternion.copy(bullet.body.quaternion as any);
            }
        }
    }

    private updateEnemies(dt: number): void {
        const playerPosition = this.playerBody.position;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.health <= 0) {
                // Enemy already dead, remove it
                this.scene.remove(enemy.mesh);
                this.world.removeBody(enemy.body);
                this.enemies.splice(i, 1);
                this.enemiesAlive--;
                this.score += 100;
                this.playSound('enemyDie', enemy.body.position as any);
                continue;
            }

            // Simple AI: Move towards player
            const direction = new CANNON.Vec3();
            playerPosition.vsub(enemy.body.position, direction);
            direction.y = 0; // Only move on horizontal plane
            direction.normalize();

            enemy.body.velocity.x = direction.x * this.config.gameSettings.enemySpeed;
            enemy.body.velocity.z = direction.z * this.config.gameSettings.enemySpeed;

            // Look at player (visual only)
            enemy.mesh.lookAt(playerPosition.x, enemy.mesh.position.y, playerPosition.z);

            // Sync mesh with body
            enemy.mesh.position.copy(enemy.body.position as any);
            enemy.mesh.quaternion.copy(enemy.body.quaternion as any);

            // Check for player attack
            this.checkEnemyAttack(enemy, dt);
        }

        if (this.enemiesAlive === 0 && this.gameState === 'PLAYING') {
            console.log("All enemies defeated!");
            // Optionally spawn more enemies or end game
            // For now, let's just make it a win condition if all enemies are defeated.
            // Or, spawn more after a delay. For simple, let's just end the game.
            this.gameOver();
        }
    }

    private checkEnemyAttack(enemy: Enemy, dt: number): void {
        const distanceToPlayer = enemy.body.position.distanceTo(this.playerBody.position);
        const attackRange = 1.5; // Distance for enemy to attack

        if (distanceToPlayer < attackRange) {
            enemy.lastAttackTime += dt;
            if (enemy.lastAttackTime >= enemy.attackCooldown) {
                this.playerTakeDamage(this.config.gameSettings.enemyDamage);
                this.playSound('playerHurt', this.playerBody.position as any);
                enemy.lastAttackTime = 0; // Reset cooldown
            }
        } else {
            enemy.lastAttackTime = enemy.attackCooldown; // Ready to attack immediately when in range
        }
    }

    private playerTakeDamage(damage: number): void {
        this.playerHealth -= damage;
        if (this.playerHealth <= 0) {
            this.playerHealth = 0;
            this.gameOver();
        }
        this.updateUI();
    }

    private enemyTakeDamage(enemy: Enemy, damage: number): void {
        enemy.health -= damage;
        this.playSound('hit', enemy.body.position as any);
        if (enemy.health <= 0) {
            // Mark for removal in updateEnemies loop
            console.log("Enemy defeated!");
        }
        this.updateUI(); // To update enemy count
    }

    private playSound(name: string, position?: THREE.Vector3): void {
        const buffer = this.assets[name];
        if (buffer instanceof AudioBuffer) {
            const sound = new THREE.PositionalAudio(this.audioListener);
            sound.setBuffer(buffer);
            const soundConfig = this.config.assets.sounds.find(s => s.name === name);
            if (soundConfig) {
                sound.setVolume(this.config.gameSettings.effectVolume * soundConfig.volume);
            } else {
                console.warn(`Sound config for ${name} not found, using default effect volume.`);
                sound.setVolume(this.config.gameSettings.effectVolume);
            }
            sound.setRefDistance(5); // How far the sound can be heard
            sound.autoplay = true;
            sound.setLoop(false);

            if (position) {
                const object = new THREE.Object3D();
                object.position.copy(position);
                this.scene.add(object);
                object.add(sound);
                setTimeout(() => { // Remove sound object after a short delay
                    sound.disconnect(); // Disconnect sound source
                    object.remove(sound);
                    this.scene.remove(object);
                }, ((soundConfig?.duration_seconds || 1) * 1000) + 500); // Add 500ms safety
            } else {
                // If no position, play as non-positional audio (e.g., UI sounds)
                const globalSound = new THREE.Audio(this.audioListener);
                globalSound.setBuffer(buffer);
                if (soundConfig) {
                    globalSound.setVolume(this.config.gameSettings.effectVolume * soundConfig.volume);
                } else {
                    console.warn(`Sound config for ${name} not found, using default effect volume.`);
                    globalSound.setVolume(this.config.gameSettings.effectVolume);
                }
                globalSound.autoplay = true;
                globalSound.setLoop(false);
                globalSound.play();
                // For non-positional sounds, we should also manage their lifecycle if they are short-lived.
                // For simplicity, we assume they play and eventually get garbage collected.
            }
        }
    }

    private startBGM(): void {
        const bgmBuffer = this.assets['bgm'];
        if (bgmBuffer instanceof AudioBuffer) {
            if (this.bgmSound) {
                this.bgmSound.stop();
                this.bgmSound.disconnect(); // Disconnect previous sound source
            }
            this.bgmSound = new THREE.Audio(this.audioListener);
            this.bgmSound.setBuffer(bgmBuffer);
            this.bgmSound.setLoop(true);
            const bgmConfig = this.config.assets.sounds.find(s => s.name === 'bgm');
            if (bgmConfig) {
                this.bgmSound.setVolume(this.config.gameSettings.musicVolume * bgmConfig.volume);
            } else {
                console.warn(`BGM config not found, using default music volume.`);
                this.bgmSound.setVolume(this.config.gameSettings.musicVolume);
            }
            this.bgmSound.play();
        }
    }

    private updateUI(): void {
        this.healthFillElement.style.width = `${Math.max(0, this.playerHealth)}%`;
        this.scoreValueElement.innerText = this.score.toString();
        this.enemiesAliveValueElement.innerText = this.enemiesAlive.toString();
    }

    private gameOver(): void {
        this.gameState = 'GAME_OVER';
        this.showGameOverScreen();
        // Release pointer lock
        document.exitPointerLock();
    }

    private onWindowResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Global initializer function, called from HTML
async function initGameFromHTML() {
    const response = await fetch('data.json');
    if (!response.ok) {
        console.error('Failed to load data.json');
        return;
    }
    const config = await response.json();
    const game = new Game('gameCanvas', config);
    await game.start();
}

// Ensure the initGameFromHTML function is called when the DOM is ready
document.addEventListener('DOMContentLoaded', initGameFromHTML);