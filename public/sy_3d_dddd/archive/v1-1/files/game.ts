import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// --- Global Types ---
interface GameConfig {
    game: {
        titleText: string;
        clickToStartText: string;
        gameOverText: string;
        winText: string;
        scoreToWin: number;
        enemySpawnInterval: number; // ms
        maxEnemies: number;
        gameDuration: number; // ms, currently unused for simplicity
    };
    player: {
        speed: number;
        jumpForce: number;
        maxHealth: number;
        bulletDamage: number;
        fireRate: number; // ms
        bodyWidth: number;
        bodyHeight: number;
        bodyDepth: number;
        initialSpawnY: number; // Player's initial Y position for the physics body's center
        cameraHeightOffset: number; // Camera height above the player body's center
    };
    enemy: {
        speed: number;
        maxHealth: number;
        bulletDamage: number;
        fireRate: number; // ms
        spawnRadius: number;
        bodyWidth: number;
        bodyHeight: number;
        bodyDepth: number;
        points: number;
    };
    bullet: {
        playerBulletSpeed: number;
        enemyBulletSpeed: number;
        size: number;
        lifetime: number; // ms
    };
    environment: {
        groundSize: number;
        gravity: [number, number, number];
        groundTexturePath: string;
        wallTexturePath: string;
    };
    assets: {
        playerTexture: string; // Currently unused in FPS, but available
        enemyTexture: string;
        bulletTexture: string;
        shootSound: string;
        hitSound: string;
        gameOverSound: string;
        backgroundMusic: string;
    };
}

enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
    WIN
}

interface GameObject {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    owner?: 'player' | 'enemy'; // For bullets
    creationTime?: number; // For bullets lifetime
    // For entities like player/enemy
    currentHealth?: number;
    isDead?: boolean;
    lastShotTime?: number;
    score?: number; // For player
}

// --- Audio Helper ---
class AudioManager {
    private audioContext: AudioContext;
    private buffers: Map<string, AudioBuffer>;
    private backgroundMusicSource: AudioBufferSourceNode | null;

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.buffers = new Map();
        this.backgroundMusicSource = null;
    }

    async loadSound(name: string, url: string): Promise<void> {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.buffers.set(name, audioBuffer);
        } catch (error) {
            console.error(`Error loading sound ${url}:`, error);
        }
    }

    playSound(name: string, loop: boolean = false, volume: number = 1): void {
        const buffer = this.buffers.get(name);
        if (buffer) {
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.loop = loop;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = volume;
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            source.start(0);

            if (loop) {
                if (this.backgroundMusicSource) {
                    this.backgroundMusicSource.stop(); // Stop previous BGM if playing
                }
                this.backgroundMusicSource = source;
            }
        } else {
            // console.warn(`Sound ${name} not loaded.`); // Suppress warning for potentially missing assets
        }
    }

    stopBackgroundMusic(): void {
        if (this.backgroundMusicSource) {
            this.backgroundMusicSource.stop();
            this.backgroundMusicSource = null;
        }
    }

    // Ensure context is resumed for playback if it was suspended (browser policy)
    resumeContext(): void {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
}


// --- Main Game Class ---
class Game {
    // Three.js
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: PointerLockControls;
    private prevTime: DOMHighResTimeStamp = performance.now();

    // Cannon.js
    private world: CANNON.World;
    private groundBody: CANNON.Body;

    // Game Objects
    private player: GameObject & {
        canJump: boolean;
    };
    private enemies: GameObject[] = [];
    private bullets: GameObject[] = [];

    // Configuration & Assets
    private config: GameConfig | null = null;
    private textures: Map<string, THREE.Texture> = new Map();
    private audioManager: AudioManager;

    // Game State
    private gameState: GameState = GameState.TITLE;
    private inputStates: { [key: string]: boolean } = {}; // For keyboard input
    private lastPlayerShootTime: number = 0;
    private lastEnemySpawnTime: number = 0;

    // UI Elements
    private uiElements: { [key: string]: HTMLElement } = {};

    constructor() {
        // Initialize basic components
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.world = new CANNON.World();
        this.audioManager = new AudioManager();

        // Bind event listeners
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
        this.onPointerLockChange = this.onPointerLockChange.bind(this);
    }

    async init() {
        // 1. Load data
        await this.loadConfig();
        if (!this.config) {
            console.error("Failed to load game configuration.");
            return;
        }

        // 2. Setup Renderer
        const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!canvas) {
            console.error("Canvas element 'gameCanvas' not found.");
            return;
        }
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        // Replace original canvas with Three.js's canvas, retaining ID
        canvas.parentNode?.replaceChild(this.renderer.domElement, canvas);
        this.renderer.domElement.id = 'gameCanvas';
        this.renderer.domElement.style.touchAction = 'none'; // Prevent browser gestures on canvas

        // 3. Load Assets
        await this.loadAssets();

        // 4. Setup Scene and Physics
        this.setupScene();
        this.setupPhysics();

        // 5. Setup Player Controls (will be enabled on game start)
        this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
        this.controls.addEventListener('lock', this.onPointerLockChange);
        this.controls.addEventListener('unlock', this.onPointerLockChange);

        // 6. Create UI
        this.createUI();
        this.startTitleScreen();

        // 7. Event Listeners
        window.addEventListener('resize', this.onWindowResize);
        document.addEventListener('keydown', this.onKeyDown);
        document.addEventListener('keyup', this.onKeyUp);
        document.addEventListener('mousedown', this.onMouseDown);
        this.renderer.domElement.addEventListener('click', () => {
            if (this.gameState === GameState.TITLE || this.gameState === GameState.GAME_OVER || this.gameState === GameState.WIN) {
                this.audioManager.resumeContext();
                this.startGame();
            }
        });

        // 8. Start animation loop
        this.animate();
    }

    private async loadConfig(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();
        } catch (error) {
            console.error('Error loading data.json:', error);
        }
    }

    private async loadAssets(): Promise<void> {
        if (!this.config) return;

        const textureLoader = new THREE.TextureLoader();
        const promises: Promise<any>[] = [];

        // Load textures
        for (const key in this.config.assets) {
            if (key.endsWith('Texture')) {
                const path = (this.config.assets as any)[key];
                promises.push(
                    textureLoader.loadAsync(path)
                        .then(texture => {
                            texture.wrapS = THREE.RepeatWrapping;
                            texture.wrapT = THREE.RepeatWrapping;
                            this.textures.set(key, texture);
                        })
                        .catch(e => console.error(`Failed to load texture ${path}:`, e))
                );
            }
        }

        // Load sounds
        for (const key in this.config.assets) {
            if (key.endsWith('Sound') || key.endsWith('Music')) {
                const path = (this.config.assets as any)[key];
                promises.push(this.audioManager.loadSound(key, path));
            }
        }

        await Promise.all(promises);
    }

    private setupScene(): void {
        if (!this.config) return;

        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        this.scene.fog = new THREE.Fog(0x87ceeb, 0.1, 100);

        // Lighting
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff);
        dirLight.position.set(-3, 10, -5);
        dirLight.castShadow = true;
        dirLight.shadow.camera.top = 10;
        dirLight.shadow.camera.bottom = -10;
        dirLight.shadow.camera.left = -10;
        dirLight.shadow.camera.right = 10;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 40;
        this.scene.add(dirLight);

        // Ground
        const groundTexture = this.textures.get('groundTexturePath');
        if (groundTexture) {
            groundTexture.repeat.set(this.config.environment.groundSize / 2, this.config.environment.groundSize / 2);
        }
        const groundMaterial = new THREE.MeshPhongMaterial();
        if (groundTexture) {
            groundMaterial.map = groundTexture;
        } else {
            groundMaterial.color = new THREE.Color(0x808080); // Fallback color if texture not loaded
        }

        const groundMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(this.config.environment.groundSize, this.config.environment.groundSize, 1, 1),
            groundMaterial
        );
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);
    }

    private setupPhysics(): void {
        if (!this.config) return;

        this.world.gravity.set(this.config.environment.gravity[0], this.config.environment.gravity[1], this.config.environment.gravity[2]);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.allowSleep = true;

        // Ground body
        const groundShape = new CANNON.Plane();
        this.groundBody = new CANNON.Body({ mass: 0 });
        this.groundBody.addShape(groundShape);
        this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate ground to be horizontal
        this.world.addBody(this.groundBody);

        // Player physics body
        const playerConfig = this.config.player;
        // Using a box shape for the player body
        const playerShape = new CANNON.Box(new CANNON.Vec3(playerConfig.bodyWidth / 2, playerConfig.bodyHeight / 2, playerConfig.bodyDepth / 2));
        this.player = {
            mesh: new THREE.Mesh(), // Placeholder, not visually added directly for the player "body"
            body: new CANNON.Body({
                mass: 70, // Player mass
                position: new CANNON.Vec3(0, playerConfig.initialSpawnY, 0), // Position is center of box
                shape: playerShape,
                fixedRotation: true // Prevent player from toppling over
            }),
            canJump: false,
            currentHealth: playerConfig.maxHealth,
            score: 0
        };
        this.world.addBody(this.player.body);

        // Player collision listener to check for ground contact
        this.player.body.addEventListener('collide', (event: any) => {
            const contact = event.contact;
            // Check if player's body is one of the colliding bodies
            if (contact.bi.id === this.player.body.id || contact.bj.id === this.player.body.id) {
                // If the normal vector's Y component is significantly positive (pointing upwards),
                // it means the contact surface is below the player, indicating ground contact.
                const normal = (contact.bi.id === this.player.body.id) ? contact.ni : contact.nj;
                if (normal.y > 0.5) { // Threshold for considering it ground
                    this.player.canJump = true;
                }
            }
        });

        // Set initial camera position relative to player body
        // camera.position.y = player.body.position.y (center of body) + cameraHeightOffset
        this.camera.position.set(0, playerConfig.initialSpawnY + playerConfig.cameraHeightOffset, 0);
    }

    private createUI(): void {
        const createDiv = (id: string, className: string = '', innerHTML: string = ''): HTMLElement => {
            const div = document.createElement('div');
            div.id = id;
            div.className = className;
            div.innerHTML = innerHTML;
            div.style.position = 'absolute';
            div.style.color = 'white';
            div.style.fontFamily = 'monospace';
            div.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
            div.style.zIndex = '100';
            document.body.appendChild(div);
            return div;
        };

        if (!this.config) return;

        this.uiElements['titleScreen'] = createDiv('titleScreen', '', `
            <h1 style="text-align: center; font-size: 4em; margin-top: 15%;">Simple 3D FPS</h1>
            <p style="text-align: center; font-size: 2em;">${this.config.game.clickToStartText}</p>
            <p style="text-align: center; font-size: 1.2em; margin-top: 5%;">
                WASD: Move | Space: Jump | Mouse: Look | Left Click: Shoot
            </p>
        `);
        this.uiElements['titleScreen'].style.cssText += 'width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); display: flex; flex-direction: column; justify-content: center; align-items: center;';

        this.uiElements['healthBar'] = createDiv('healthBar', '', `Health: ${this.config.player.maxHealth}`);
        this.uiElements['healthBar'].style.top = '10px';
        this.uiElements['healthBar'].style.left = '10px';

        this.uiElements['scoreDisplay'] = createDiv('scoreDisplay', '', 'Score: 0');
        this.uiElements['scoreDisplay'].style.top = '40px';
        this.uiElements['scoreDisplay'].style.left = '10px';

        this.uiElements['gameOverScreen'] = createDiv('gameOverScreen', '', `
            <h1 style="text-align: center; font-size: 4em; margin-top: 15%;">${this.config.game.gameOverText}</h1>
            <p style="text-align: center; font-size: 2em;">Click to Restart</p>
        `);
        this.uiElements['gameOverScreen'].style.cssText += 'width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); display: none; flex-direction: column; justify-content: center; align-items: center;';

        this.uiElements['winScreen'] = createDiv('winScreen', '', `
            <h1 style="text-align: center; font-size: 4em; margin-top: 15%;">${this.config.game.winText}</h1>
            <p style="text-align: center; font-size: 2em;">Click to Restart</p>
        `);
        this.uiElements['winScreen'].style.cssText += 'width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); display: none; flex-direction: column; justify-content: center; align-items: center;';


        // Crosshair
        this.uiElements['crosshair'] = createDiv('crosshair', '', '+');
        this.uiElements['crosshair'].style.cssText += `
            font-size: 3em;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: none;
        `;
    }

    private updateUI(): void {
        if (!this.config || !this.player) return;

        this.uiElements['healthBar'].innerText = `Health: ${Math.max(0, this.player.currentHealth || 0)}`;
        this.uiElements['scoreDisplay'].innerText = `Score: ${this.player.score || 0}`;

        // Control visibility of UI elements based on game state
        const hideAll = (except?: string[]) => {
            ['titleScreen', 'gameOverScreen', 'winScreen', 'healthBar', 'scoreDisplay', 'crosshair'].forEach(id => {
                if (!except || !except.includes(id)) {
                    this.uiElements[id].style.display = 'none';
                }
            });
        };

        switch (this.gameState) {
            case GameState.TITLE:
                hideAll(['titleScreen']);
                this.uiElements['titleScreen'].style.display = 'flex';
                break;
            case GameState.PLAYING:
                hideAll(['healthBar', 'scoreDisplay', 'crosshair']);
                this.uiElements['healthBar'].style.display = 'block';
                this.uiElements['scoreDisplay'].style.display = 'block';
                this.uiElements['crosshair'].style.display = 'block';
                break;
            case GameState.GAME_OVER:
                hideAll(['gameOverScreen']);
                this.uiElements['gameOverScreen'].style.display = 'flex';
                break;
            case GameState.WIN:
                hideAll(['winScreen']);
                this.uiElements['winScreen'].style.display = 'flex';
                break;
        }
    }

    private startGame(): void {
        if (!this.config) return;

        // Reset game state
        this.gameState = GameState.PLAYING;
        this.player.currentHealth = this.config.player.maxHealth;
        this.player.score = 0;
        this.player.lastShotTime = 0;
        this.player.isDead = false;

        // Clear existing enemies and bullets
        this.enemies.forEach(enemy => {
            this.world.removeBody(enemy.body);
            this.scene.remove(enemy.mesh);
        });
        this.enemies = [];

        this.bullets.forEach(bullet => {
            this.world.removeBody(bullet.body);
            this.scene.remove(bullet.mesh);
        });
        this.bullets = [];

        // Reset player position and velocity
        const playerConfig = this.config.player;
        this.player.body.position.set(0, playerConfig.initialSpawnY, 0);
        this.player.body.velocity.set(0, 0, 0);
        this.player.body.angularVelocity.set(0, 0, 0);
        this.camera.position.set(0, playerConfig.initialSpawnY + playerConfig.cameraHeightOffset, 0);

        // Lock pointer
        this.controls.lock();

        // Start background music
        this.audioManager.stopBackgroundMusic(); // Stop any previous music
        this.audioManager.playSound('backgroundMusic', true, 0.5); // Loop BGM with lower volume

        this.lastEnemySpawnTime = performance.now();
        this.updateUI();
    }

    private startTitleScreen(): void {
        this.gameState = GameState.TITLE;
        this.controls.unlock();
        this.audioManager.stopBackgroundMusic();
        this.updateUI();
    }

    private gameOver(win: boolean = false): void {
        this.gameState = win ? GameState.WIN : GameState.GAME_OVER;
        this.controls.unlock();
        this.audioManager.stopBackgroundMusic();
        this.audioManager.playSound('gameOverSound'); // Play game over sound
        this.updateUI();
    }

    private onPointerLockChange(): void {
        if (document.pointerLockElement === this.renderer.domElement) {
            // Pointer locked. If it was already playing, continue. If from title/gameover, startGame will handle.
        } else {
            // Pointer unlocked. If game was playing, user probably pressed ESC.
            // For this simple game, we don't implement pause, just allow restart.
            // If the game is playing and pointer is unlocked, it implies user intentionally left the game.
            if (this.gameState === GameState.PLAYING) {
                // Not a formal pause, just allows user to click UI elements
                // Can be improved to a proper pause state if needed.
            }
        }
    }

    private onKeyDown(event: KeyboardEvent): void {
        this.inputStates[event.code] = true;
    }

    private onKeyUp(event: KeyboardEvent): void {
        this.inputStates[event.code] = false;
    }

    private onMouseDown(event: MouseEvent): void {
        if (event.button === 0 && this.gameState === GameState.PLAYING && document.pointerLockElement === this.renderer.domElement) {
            this.shootBullet('player');
        }
    }

    private onWindowResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private animate(): void {
        requestAnimationFrame(this.animate.bind(this));

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.prevTime) / 1000; // Delta time in seconds
        this.prevTime = currentTime;

        if (this.gameState === GameState.PLAYING) {
            this.update(deltaTime);
        }
        this.render();
    }

    private update(deltaTime: number): void {
        if (!this.config) return;

        // 1. Player horizontal movement directly moves the camera
        this.updatePlayerMovement(deltaTime);

        // 2. Sync player physics body's XZ to camera's XZ
        this.player.body.position.x = this.camera.position.x;
        this.player.body.position.z = this.camera.position.z;

        // 3. Update enemies AI and actions
        this.updateEnemies(deltaTime);

        // 4. Update bullets lifetime and cleanup
        this.updateBullets();

        // 5. Step physics world
        this.world.step(1 / 60, deltaTime, 3); // Fixed time step 1/60s, max 3 iterations

        // 6. Update camera Y position from player body Y (after physics has applied gravity/jumps)
        // camera.position.y = player.body.position.y (center of body) + cameraHeightOffset
        this.camera.position.y = this.player.body.position.y + this.config.player.cameraHeightOffset;

        // 7. Sync Three.js meshes with Cannon.js bodies for enemies and bullets
        this.enemies.forEach(enemy => {
            if (enemy.isDead) return;
            enemy.mesh.position.set(enemy.body.position.x, enemy.body.position.y, enemy.body.position.z);
            enemy.mesh.quaternion.set(enemy.body.quaternion.x, enemy.body.quaternion.y, enemy.body.quaternion.z, enemy.body.quaternion.w);
        });

        this.bullets.forEach(bullet => {
            bullet.mesh.position.set(bullet.body.position.x, bullet.body.position.y, bullet.body.position.z);
            bullet.mesh.quaternion.set(bullet.body.quaternion.x, bullet.body.quaternion.y, bullet.body.quaternion.z, bullet.body.quaternion.w);
        });

        // 8. Check game over / win conditions
        if (this.player.currentHealth && this.player.currentHealth <= 0 && !this.player.isDead) {
            this.player.isDead = true; // Mark player as dead to prevent multiple game over triggers
            this.gameOver(false);
        } else if (this.player.score && this.player.score >= this.config.game.scoreToWin) {
            this.gameOver(true);
        }

        this.updateUI();
    }

    private updatePlayerMovement(deltaTime: number): void {
        if (!this.config || !this.player || this.player.isDead) return;

        const playerConfig = this.config.player;
        const speed = playerConfig.speed;

        // Apply horizontal movement via controls (modifies this.camera.position directly)
        let moveForward = 0;
        let moveRight = 0;

        if (this.inputStates['KeyW']) moveForward += 1;
        if (this.inputStates['KeyS']) moveForward -= 1;
        if (this.inputStates['KeyA']) moveRight -= 1;
        if (this.inputStates['KeyD']) moveRight += 1;

        // Move controls (camera)
        if (moveForward !== 0) {
            this.controls.moveForward(moveForward * speed * deltaTime);
        }
        if (moveRight !== 0) {
            this.controls.moveRight(moveRight * speed * deltaTime);
        }

        // Handle vertical movement (jump) with physics
        if (this.inputStates['Space'] && this.player.canJump) {
            this.player.body.velocity.y = playerConfig.jumpForce;
            this.player.canJump = false; // Prevent multiple jumps until landing
        }
    }


    private updateEnemies(deltaTime: number): void {
        if (!this.config) return;

        // Spawn enemies
        if (this.enemies.length < this.config.game.maxEnemies && (performance.now() - this.lastEnemySpawnTime > this.config.game.enemySpawnInterval)) {
            this.spawnEnemy();
            this.lastEnemySpawnTime = performance.now();
        }

        // Update each enemy
        this.enemies.forEach(enemy => {
            if (enemy.isDead || !this.player || this.player.isDead) return;

            // Simple AI: Move towards player
            const playerPos = this.player.body.position;
            const enemyPos = enemy.body.position;
            const direction = new CANNON.Vec3();
            playerPos.vsub(enemyPos, direction);
            direction.y = 0; // Only horizontal movement
            direction.normalize();

            // Set velocity, not applying force, to keep movement smooth
            enemy.body.velocity.x = direction.x * this.config.enemy.speed;
            enemy.body.velocity.z = direction.z * this.config.enemy.speed;
            // Keep current Y velocity for gravity
            enemy.body.velocity.y = enemy.body.velocity.y;

            // Rotate enemy mesh to look at player (only yaw)
            const targetYRotation = Math.atan2(direction.x, direction.z); // Yaw rotation for Z-axis forward
            enemy.mesh.rotation.y = targetYRotation;
            enemy.mesh.rotation.x = 0; // Prevent tilting
            enemy.mesh.rotation.z = 0; // Prevent tilting

            // Enemy shooting
            if (performance.now() - (enemy.lastShotTime || 0) > this.config.enemy.fireRate) {
                // Check if player is somewhat in range
                const distanceToPlayer = enemyPos.distanceTo(playerPos);
                if (distanceToPlayer < this.config.enemy.spawnRadius * 1.5) {
                    this.shootBullet('enemy', enemy.body.position, direction);
                    enemy.lastShotTime = performance.now();
                }
            }
        });
    }

    private updateBullets(): void {
        this.bullets = this.bullets.filter(bullet => {
            if (!this.config) return false;

            // Remove old bullets
            if (performance.now() - (bullet.creationTime || 0) > this.config.bullet.lifetime) {
                this.world.removeBody(bullet.body);
                this.scene.remove(bullet.mesh);
                return false;
            }
            return true; // Keep bullet if not expired
        });
    }

    private spawnEnemy(): void {
        if (!this.config) return;

        const enemyConfig = this.config.enemy;
        const groundSize = this.config.environment.groundSize;
        const spawnRadius = enemyConfig.spawnRadius;
        const texture = this.textures.get('enemyTexture');
        if (!texture) {
            console.warn("Enemy texture not loaded, cannot spawn enemy.");
            return;
        }

        const geometry = new THREE.BoxGeometry(enemyConfig.bodyWidth, enemyConfig.bodyHeight, enemyConfig.bodyDepth);
        const material = new THREE.MeshPhongMaterial({ map: texture });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        this.scene.add(mesh);

        // Random position, ensure it's on the ground and not too close to player
        let x, z;
        do {
            x = (Math.random() * groundSize - groundSize / 2);
            z = (Math.random() * groundSize - groundSize / 2);
        } while (this.player.body.position.distanceTo(new CANNON.Vec3(x, 0, z)) < spawnRadius); // Ensure not too close to player initially

        const body = new CANNON.Body({
            mass: 50,
            position: new CANNON.Vec3(x, enemyConfig.bodyHeight / 2, z), // Position is center of box
            shape: new CANNON.Box(new CANNON.Vec3(enemyConfig.bodyWidth / 2, enemyConfig.bodyHeight / 2, enemyConfig.bodyDepth / 2)),
            fixedRotation: true // Prevent enemies from toppling
        });
        this.world.addBody(body);

        const enemy: GameObject = {
            mesh, body, currentHealth: enemyConfig.maxHealth, lastShotTime: 0
        };
        this.enemies.push(enemy);

        // Setup collision listener for enemy
        body.addEventListener('collide', (event: any) => this.handleEnemyCollision(enemy, event));
    }

    private shootBullet(owner: 'player' | 'enemy', position?: CANNON.Vec3, direction?: CANNON.Vec3): void {
        if (!this.config) return;

        // Player fire rate check
        if (owner === 'player' && performance.now() - this.lastPlayerShootTime < this.config.player.fireRate) {
            return;
        }
        // Enemy specific parameters check
        if (owner === 'enemy' && (!position || !direction)) {
            console.error("Enemy bullet needs explicit position and direction.");
            return;
        }

        this.audioManager.playSound('shootSound', false, 0.2); // Play shoot sound

        const bulletConfig = this.config.bullet;
        const bulletSpeed = owner === 'player' ? bulletConfig.playerBulletSpeed : bulletConfig.enemyBulletSpeed;
        const bulletTexture = this.textures.get('bulletTexture');
        const bulletMaterial = new THREE.MeshBasicMaterial();
        if (bulletTexture) {
            bulletMaterial.map = bulletTexture;
        } else {
            bulletMaterial.color = new THREE.Color(0xffff00); // Fallback color if texture not loaded
        }
        const bulletMesh = new THREE.Mesh(new THREE.SphereGeometry(bulletConfig.size / 2, 8, 8), bulletMaterial);
        this.scene.add(bulletMesh);

        const bulletBody = new CANNON.Body({
            mass: 0.1, // Small mass to interact with other objects slightly
            shape: new CANNON.Sphere(bulletConfig.size / 2),
            allowSleep: false,
            linearDamping: 0 // Keep speed constant, no air resistance
        });
        this.world.addBody(bulletBody);

        let bulletPosition = new CANNON.Vec3();
        let bulletDirection = new CANNON.Vec3();

        if (owner === 'player') {
            const playerConfig = this.config.player;
            // Get camera position and direction for player bullet
            const cameraPosition = this.camera.position; // This is a THREE.Vector3
            bulletPosition.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);

            const tempThreeVector = new THREE.Vector3();
            this.camera.getWorldDirection(tempThreeVector); // Populates tempThreeVector with camera direction
            bulletDirection.set(tempThreeVector.x, tempThreeVector.y, tempThreeVector.z);
            bulletDirection.normalize();

            // Offset bullet slightly forward from player's view to avoid immediate self-collision
            bulletPosition.vadd(bulletDirection.scale(playerConfig.bodyWidth / 2 + bulletConfig.size), bulletPosition);
        } else { // Enemy bullet
            if (position && direction) {
                bulletPosition.copy(position);
                bulletDirection.copy(direction);
                // Offset bullet slightly forward from enemy's body
                bulletPosition.vadd(bulletDirection.scale(this.config.enemy.bodyWidth / 2 + bulletConfig.size), bulletPosition);
            }
        }

        bulletBody.position.copy(bulletPosition);
        bulletBody.velocity.copy(bulletDirection.scale(bulletSpeed));

        const bullet: GameObject = {
            mesh: bulletMesh,
            body: bulletBody,
            owner: owner,
            creationTime: performance.now()
        };
        this.bullets.push(bullet);

        // Add collision listener for the bullet
        bulletBody.addEventListener('collide', (event: any) => this.handleBulletCollision(bullet, event));

        if (owner === 'player') {
            this.lastPlayerShootTime = performance.now();
        }
    }

    private handleBulletCollision(bullet: GameObject, event: any): void {
        if (!this.config || bullet.isDead) return; // bullet.isDead acts as a flag for "already hit and removed"

        const otherBody = event.body;

        // Prevent bullet from hitting itself or its owner immediately after spawn
        if (bullet.owner === 'player' && otherBody === this.player.body) {
            return;
        }
        if (bullet.owner === 'enemy' && this.enemies.some(e => e.body === otherBody)) {
            return;
        }
        if (this.bullets.some(b => b.body === otherBody)) { // Bullet hitting another bullet
            return;
        }

        let hitSomethingImportant = false;

        if (bullet.owner === 'player') {
            // Player bullet hits enemy
            const enemyHit = this.enemies.find(e => e.body === otherBody && !e.isDead);
            if (enemyHit) {
                enemyHit.currentHealth! -= this.config.player.bulletDamage;
                this.audioManager.playSound('hitSound', false, 0.4);
                if (enemyHit.currentHealth! <= 0) {
                    this.enemyKilled(enemyHit);
                }
                hitSomethingImportant = true;
            }
        } else if (bullet.owner === 'enemy') {
            // Enemy bullet hits player
            if (otherBody === this.player.body && !this.player.isDead) {
                this.player.currentHealth! -= this.config.enemy.bulletDamage;
                this.audioManager.playSound('hitSound', false, 0.4);
                if (this.player.currentHealth! <= 0) {
                    this.player.isDead = true; // Mark player as dead for game over check
                }
                hitSomethingImportant = true;
            }
        }

        // Remove bullet if it hit something important or the ground
        if (hitSomethingImportant || otherBody === this.groundBody) {
            bullet.isDead = true; // Mark for removal
            this.world.removeBody(bullet.body);
            this.scene.remove(bullet.mesh);
            this.bullets = this.bullets.filter(b => b !== bullet); // Remove from active bullets list
        }
    }

    private handleEnemyCollision(enemy: GameObject, event: any): void {
        // This is primarily for bullet collisions, which are handled in handleBulletCollision
        // This function could be expanded for melee attacks or other enemy-specific interactions.
    }

    private enemyKilled(enemy: GameObject): void {
        if (!this.config || enemy.isDead) return;

        enemy.isDead = true;
        this.player.score! += this.config.enemy.points;

        // Remove enemy after a short delay for visual effect
        setTimeout(() => {
            if (enemy.body) this.world.removeBody(enemy.body);
            if (enemy.mesh) this.scene.remove(enemy.mesh);
            this.enemies = this.enemies.filter(e => e !== enemy);
        }, 100);
    }

    private render(): void {
        this.renderer.render(this.scene, this.camera);
    }
}

// Instantiate and start the game when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
});