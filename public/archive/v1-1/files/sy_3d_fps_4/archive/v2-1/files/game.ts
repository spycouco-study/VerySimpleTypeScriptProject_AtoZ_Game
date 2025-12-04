import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// Configuration Interface for data.json
interface GameConfig {
    player: {
        speed: number;
        jumpForce: number;
        health: number;
        radius: number;
        height: number;
        mass: number;
        friction: number;
        angularDamping: number;
        cameraOffset: { x: number; y: number; z: number; };
    };
    bullet: {
        speed: number;
        radius: number;
        mass: number;
        lifetime: number;
        damage: number;
    };
    enemy: {
        count: number;
        radius: number;
        height: number;
        mass: number;
        health: number;
        speed: number;
        spawnRadius: number;
        damage: number;
        attackInterval: number;
    };
    game: {
        gravity: number;
        floorSize: number;
        wallHeight: number;
        maxScore: number;
        targetFPS: number;
    };
    ui: {
        fontSize: number;
        fontFamily: string;
        fontColor: string;
        crosshairSize: number;
        titleScreenText: string;
        gameOverText: string;
        pressToStartText: string;
    };
    assets: {
        images: { name: string; path: string; width: number; height: number; }[];
        sounds: { name: string; path: string; duration_seconds: number; volume: number; }[];
    };
}

// --- AssetManager ---
class AssetManager {
    private textureLoader: THREE.TextureLoader;
    private audioLoader: THREE.AudioLoader;
    private textures: Map<string, THREE.Texture>;
    private audioBuffers: Map<string, AudioBuffer>;
    private config: GameConfig;

    constructor(config: GameConfig) {
        this.config = config;
        this.textureLoader = new THREE.TextureLoader();
        this.audioLoader = new THREE.AudioLoader();
        this.textures = new Map();
        this.audioBuffers = new Map();
    }

    async loadAssets(): Promise<void> {
        const texturePromises = this.config.assets.images.map(asset => {
            return new Promise<void>((resolve, reject) => {
                this.textureLoader.load(asset.path,
                    (texture) => {
                        this.textures.set(asset.name, texture);
                        resolve();
                    },
                    undefined, // onProgress callback
                    (error) => {
                        console.error(`Failed to load texture ${asset.path}:`, error);
                        reject(error);
                    }
                );
            });
        });

        const audioPromises = this.config.assets.sounds.map(asset => {
            return new Promise<void>((resolve, reject) => {
                this.audioLoader.load(asset.path,
                    (buffer) => {
                        this.audioBuffers.set(asset.name, buffer);
                        resolve();
                    },
                    undefined, // onProgress callback
                    (error) => {
                        console.error(`Failed to load audio ${asset.path}:`, error);
                        reject(error);
                    }
                );
            });
        });

        await Promise.all([...texturePromises, ...audioPromises]);
        console.log('All assets loaded.');
    }

    getTexture(name: string): THREE.Texture | undefined {
        return this.textures.get(name);
    }

    getAudioBuffer(name: string): AudioBuffer | undefined {
        return this.audioBuffers.get(name);
    }
}

// --- InputHandler ---
class InputHandler {
    private keys: { [key: string]: boolean };
    private mouseButtons: { [button: number]: boolean };
    public mouseDeltaX: number;
    public mouseDeltaY: number;
    public isPointerLocked: boolean;
    public shootRequested: boolean;

    constructor() {
        this.keys = {};
        this.mouseButtons = {};
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.isPointerLocked = false;
        this.shootRequested = false;

        document.addEventListener('keydown', this.onKeyDown.bind(this), false);
        document.addEventListener('keyup', this.onKeyUp.bind(this), false);
        document.addEventListener('mousemove', this.onMouseMove.bind(this), false);
        document.addEventListener('mousedown', this.onMouseDown.bind(this), false);
        document.addEventListener('mouseup', this.onMouseUp.bind(this), false);
        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this), false);
        document.addEventListener('webkitpointerlockchange', this.onPointerLockChange.bind(this), false);
        document.addEventListener('mozpointerlockchange', this.onPointerLockChange.bind(this), false);
    }

    private onKeyDown(event: KeyboardEvent): void {
        this.keys[event.code] = true;
    }

    private onKeyUp(event: KeyboardEvent): void {
        this.keys[event.code] = false;
    }

    private onMouseMove(event: MouseEvent): void {
        if (this.isPointerLocked) {
            this.mouseDeltaX += event.movementX || 0;
            this.mouseDeltaY += event.movementY || 0;
        }
    }

    private onMouseDown(event: MouseEvent): void {
        this.mouseButtons[event.button] = true;
        if (event.button === 0 && this.isPointerLocked) { // Left mouse button
            this.shootRequested = true;
        }
    }

    private onMouseUp(event: MouseEvent): void {
        this.mouseButtons[event.button] = false;
    }

    private onPointerLockChange(): void {
        const gameCanvas = document.getElementById('gameCanvas');
        this.isPointerLocked = document.pointerLockElement === gameCanvas;
    }

    isKeyPressed(code: string): boolean {
        return !!this.keys[code];
    }

    isMouseButtonPressed(button: number): boolean {
        return !!this.mouseButtons[button];
    }

    consumeShootRequest(): boolean {
        if (this.shootRequested) {
            this.shootRequested = false;
            return true;
        }
        return false;
    }

    resetMouseDelta(): void {
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
    }
}

// --- Player Class ---
class Player {
    public mesh: THREE.Mesh; // Invisible mesh to keep track of player position/rotation for physics
    public body: CANNON.Body;
    public camera: THREE.PerspectiveCamera;
    public config: GameConfig['player']; // Make config public for enemy interaction
    private physicsMaterial: CANNON.Material;
    private jumpTimeout: number;
    public health: number;
    private lastDamageTime: number;
    private damageCooldown: number = 0.5; // seconds

    constructor(scene: THREE.Scene, world: CANNON.World, camera: THREE.PerspectiveCamera, config: GameConfig['player'], physicsMaterial: CANNON.Material) {
        this.config = config;
        this.camera = camera;
        this.physicsMaterial = physicsMaterial;
        this.jumpTimeout = 0;
        this.health = this.config.health;
        this.lastDamageTime = 0;

        // Player physics body (Capsule for better collision with floors/walls)
        const capsuleShape = new CANNON.Cylinder(this.config.radius, this.config.radius, this.config.height, 8);
        const playerBody = new CANNON.Body({
            mass: this.config.mass,
            position: new CANNON.Vec3(0, this.config.height / 2 + 1, 0), // Start slightly above ground
            shape: capsuleShape,
            material: physicsMaterial,
            fixedRotation: true, // Prevent player from tipping over
            angularDamping: this.config.angularDamping,
            linearDamping: 0.9, // Add some linear damping for smoother stopping
            collisionFilterGroup: CollisionGroups.PLAYER,
            collisionFilterMask: CollisionGroups.GROUND | CollisionGroups.ENEMY | CollisionGroups.WALL
        });
        playerBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); // Orient cylinder vertically
        world.addBody(playerBody);
        this.body = playerBody;

        // Player visual mesh (simple cylinder for representation, camera is main view)
        const playerGeometry = new THREE.CylinderGeometry(this.config.radius, this.config.radius, this.config.height, 32);
        const playerMaterialMesh = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0 }); // Invisible player
        this.mesh = new THREE.Mesh(playerGeometry, playerMaterialMesh);
        // scene.add(this.mesh); // REMOVED: player.mesh will be added to the scene in setupPlayer() after controls.object is parented to it.
    }

    update(deltaTime: number, input: InputHandler, controls: PointerLockControls): void {
        if (this.health <= 0) {
            this.body.sleep();
            return;
        }
        this.body.wakeUp();

        // Camera rotation from mouse input is handled by PointerLockControls directly
        // Player body position is updated to camera position in the main loop
        if (input.isPointerLocked) {
            const mouseSensitivity = 0.002;
            controls.object.rotation.y -= input.mouseDeltaX * mouseSensitivity;
            controls.object.children[0].rotation.x -= input.mouseDeltaY * mouseSensitivity;
            controls.object.children[0].rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, controls.object.children[0].rotation.x));
            input.resetMouseDelta();
        }

        // Apply movement forces based on camera direction
        const moveDirection = new THREE.Vector3();
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Only horizontal movement for player
        cameraDirection.normalize();

        const rightDirection = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();

        if (input.isKeyPressed('KeyW')) moveDirection.add(cameraDirection);
        if (input.isKeyPressed('KeyS')) moveDirection.sub(cameraDirection);
        if (input.isKeyPressed('KeyA')) moveDirection.sub(rightDirection);
        if (input.isKeyPressed('KeyD')) moveDirection.add(rightDirection);

        moveDirection.normalize();

        // Apply the target velocity directly, preserving current Y velocity for gravity/jump
        const targetVelocityX = moveDirection.x * this.config.speed;
        const targetVelocityZ = moveDirection.z * this.config.speed;

        this.body.velocity.x = targetVelocityX;
        this.body.velocity.z = targetVelocityZ;

        // Jump
        this.jumpTimeout -= deltaTime;
        if (input.isKeyPressed('Space') && this.jumpTimeout <= 0) {
            // Check if player is on ground. A simple approximation:
            // if player's y velocity is close to zero and its bottom is near the ground plane.
            if (Math.abs(this.body.velocity.y) < 0.1 && this.body.position.y - this.config.height / 2 <= 0.1) {
                this.body.velocity.y = this.config.jumpForce;
                this.jumpTimeout = 0.5; // Cooldown for jumping
            }
        }
    }

    takeDamage(amount: number, currentTime: number): void {
        if (currentTime - this.lastDamageTime > this.damageCooldown) {
            this.health -= amount;
            this.lastDamageTime = currentTime;
            console.log(`Player took ${amount} damage, health: ${this.health}`);
        }
    }

    reset(): void {
        this.health = this.config.health;
        this.body.position.set(0, this.config.height / 2 + 1, 0); // Reset to spawn position
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
        this.body.wakeUp(); // Ensure body is active
    }
}

// --- Bullet Class ---
class Bullet {
    public mesh: THREE.Mesh;
    public body: CANNON.Body;
    public config: GameConfig['bullet']; // Made public for access
    private world: CANNON.World;
    private initialLifetime: number;
    private damage: number;
    public isHit: boolean = false; // Flag to mark if bullet has hit something

    constructor(scene: THREE.Scene, world: CANNON.World, config: GameConfig['bullet'], assetManager: AssetManager, startPosition: THREE.Vector3, velocity: THREE.Vector3, bulletMaterial: CANNON.Material) {
        this.config = config;
        this.world = world;
        this.initialLifetime = config.lifetime;
        this.damage = config.damage;

        // Visual mesh
        const bulletTexture = assetManager.getTexture('player_bullet');
        const bulletMaterialMesh = bulletTexture ? new THREE.MeshBasicMaterial({ map: bulletTexture }) : new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const bulletGeometry = new THREE.SphereGeometry(config.radius, 8, 8);
        this.mesh = new THREE.Mesh(bulletGeometry, bulletMaterialMesh);
        this.mesh.position.copy(startPosition);
        scene.add(this.mesh);

        // Physics body
        this.body = new CANNON.Body({
            mass: config.mass,
            position: new CANNON.Vec3(startPosition.x, startPosition.y, startPosition.z),
            shape: new CANNON.Sphere(config.radius),
            material: bulletMaterial,
            collisionFilterGroup: CollisionGroups.BULLET,
            collisionFilterMask: CollisionGroups.ENEMY | CollisionGroups.GROUND | CollisionGroups.WALL,
            linearDamping: 0 // No damping for bullets
        });
        this.body.velocity.set(velocity.x, velocity.y, velocity.z);
        world.addBody(this.body);

        this.body.addEventListener('collide', (event) => {
            this.isHit = true; // Mark bullet as hit
        });
    }

    update(deltaTime: number): boolean { // Returns true if bullet should be removed
        this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
        this.initialLifetime -= deltaTime;
        return this.initialLifetime <= 0 || this.isHit; // Remove if lifetime expired or hit something
    }

    getDamage(): number {
        return this.damage;
    }

    destroy(): void {
        this.world.removeBody(this.body);
        this.mesh.parent?.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}

// --- Enemy Class ---
class Enemy {
    public mesh: THREE.Mesh;
    public body: CANNON.Body;
    public config: GameConfig['enemy'];
    private world: CANNON.World;
    public health: number;
    public isActive: boolean;
    private lastAttackTime: number;

    constructor(scene: THREE.Scene, world: CANNON.World, config: GameConfig['enemy'], assetManager: AssetManager, position: THREE.Vector3, enemyMaterial: CANNON.Material) {
        this.config = config;
        this.world = world;
        this.health = config.health;
        this.isActive = true;
        this.lastAttackTime = 0;

        // Visual mesh
        const enemyTexture = assetManager.getTexture('enemy');
        const enemyMaterialMesh = enemyTexture ? new THREE.MeshBasicMaterial({ map: enemyTexture }) : new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const enemyGeometry = new THREE.CylinderGeometry(config.radius, config.radius, config.height, 16);
        this.mesh = new THREE.Mesh(enemyGeometry, enemyMaterialMesh);
        this.mesh.position.copy(position);
        scene.add(this.mesh);

        // Physics body
        const cylinderShape = new CANNON.Cylinder(config.radius, config.radius, config.height, 8);
        this.body = new CANNON.Body({
            mass: config.mass,
            position: new CANNON.Vec3(position.x, position.y, position.z),
            shape: cylinderShape,
            material: enemyMaterial,
            fixedRotation: true, // Prevent enemies from tipping over easily
            collisionFilterGroup: CollisionGroups.ENEMY,
            collisionFilterMask: CollisionGroups.PLAYER | CollisionGroups.BULLET | CollisionGroups.GROUND | CollisionGroups.WALL | CollisionGroups.ENEMY,
            linearDamping: 0.9 // Some damping
        });
        this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); // Orient cylinder vertically
        world.addBody(this.body);
    }

    update(deltaTime: number, playerPosition: CANNON.Vec3, player: Player): void {
        if (!this.isActive || this.health <= 0) {
            this.body.sleep();
            this.mesh.visible = false;
            return;
        }

        this.body.wakeUp();
        this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);

        // Simple AI: Move towards player
        const toPlayer = new CANNON.Vec3();
        playerPosition.vsub(this.body.position, toPlayer);
        toPlayer.y = 0; // Only horizontal movement
        toPlayer.normalize();

        const targetVelocity = toPlayer.scale(this.config.speed);
        // Apply target velocity directly to horizontal components
        this.body.velocity.x = targetVelocity.x;
        this.body.velocity.z = targetVelocity.z;


        // Attack player if close enough
        const distanceToPlayer = this.body.position.distanceTo(playerPosition);
        if (distanceToPlayer < this.config.radius + player.config.radius + 0.1) { // Simple overlap check
            if (Date.now() / 1000 - this.lastAttackTime > this.config.attackInterval) {
                player.takeDamage(this.config.damage, Date.now() / 1000);
                this.lastAttackTime = Date.now() / 1000;
            }
        }
    }

    takeDamage(amount: number): void {
        this.health -= amount;
        if (this.health <= 0) {
            this.isActive = false;
        }
    }

    destroy(): void {
        this.world.removeBody(this.body);
        this.mesh.parent?.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}

// --- UI Rendering (on CanvasTexture) ---
class UI {
    private camera: THREE.PerspectiveCamera;
    private config: GameConfig['ui'];
    private healthMesh: THREE.Mesh;
    private scoreMesh: THREE.Mesh;
    private titleScreenMesh: THREE.Mesh | null = null;
    private gameOverScreenMesh: THREE.Mesh | null = null;
    private crosshairMesh: THREE.Sprite;
    private assetManager: AssetManager;

    constructor(camera: THREE.PerspectiveCamera, config: GameConfig['ui'], assetManager: AssetManager) {
        this.camera = camera;
        this.config = config;
        this.assetManager = assetManager;

        // Health and Score
        this.healthMesh = this.createTextPlane("Health: 100", 0x00FF00);
        this.scoreMesh = this.createTextPlane("Score: 0", 0x00FFFF);
        this.healthMesh.position.set(-0.7, 0.7, -1.5); // Position in camera space
        this.scoreMesh.position.set(0.7, 0.7, -1.5);
        this.camera.add(this.healthMesh);
        this.camera.add(this.scoreMesh);

        // Crosshair
        const crosshairTexture = this.assetManager.getTexture('player_crosshair');
        const crosshairMaterial = crosshairTexture ? new THREE.SpriteMaterial({ map: crosshairTexture, color: 0xffffff, transparent: true }) : new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
        this.crosshairMesh = new THREE.Sprite(crosshairMaterial);
        this.crosshairMesh.scale.set(this.config.crosshairSize, this.config.crosshairSize, 1);
        this.crosshairMesh.position.set(0, 0, -1); // Center of screen, slightly in front of camera
        this.camera.add(this.crosshairMesh);

        // Ensure title/game over screens are not initially present
        this.titleScreenMesh = null;
        this.gameOverScreenMesh = null;
    }

    private createTextCanvas(text: string, color: string = '#FFFFFF', backgroundColor: string = 'rgba(0,0,0,0)'): HTMLCanvasElement {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        const fontSize = this.config.fontSize;
        const fontFamily = this.config.fontFamily;

        context.font = `${fontSize}px ${fontFamily}`;
        const metrics = context.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize * 1.5; // Approximate height with some padding

        canvas.width = textWidth + 40; // Add padding
        canvas.height = textHeight + 40;

        context.font = `${fontSize}px ${fontFamily}`; // Reset font after canvas resize
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = color;
        // Split text by newlines and render each line
        const lines = text.split('\n');
        lines.forEach((line, index) => {
            const yOffset = (index - (lines.length - 1) / 2) * fontSize * 1.2;
            context.fillText(line, canvas.width / 2, canvas.height / 2 + yOffset);
        });

        return canvas;
    }

    private createTextPlane(text: string, color: number): THREE.Mesh {
        const canvas = this.createTextCanvas(text, `#${color.toString(16).padStart(6, '0')}`);
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter; // Ensure crisp text
        texture.needsUpdate = true;

        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        const aspectRatio = canvas.width / canvas.height;
        const planeGeometry = new THREE.PlaneGeometry(0.5 * aspectRatio, 0.5); // Adjust size in 3D space relative to distance
        const mesh = new THREE.Mesh(planeGeometry, material);
        return mesh;
    }

    updateHealth(health: number): void {
        const healthColor = health > 50 ? 0x00FF00 : (health > 20 ? 0xFFA500 : 0xFF0000);
        const newMesh = this.createTextPlane(`Health: ${Math.max(0, health)}`, healthColor);
        this.camera.remove(this.healthMesh);
        this.healthMesh.geometry.dispose();
        if ((this.healthMesh.material as THREE.MeshBasicMaterial).map) {
            (this.healthMesh.material as THREE.MeshBasicMaterial).map?.dispose();
        }
        (this.healthMesh.material as THREE.MeshBasicMaterial).dispose();
        this.healthMesh = newMesh;
        this.healthMesh.position.set(-0.7, 0.7, -1.5);
        this.camera.add(this.healthMesh);
    }

    updateScore(score: number): void {
        const newMesh = this.createTextPlane(`Score: ${score}`, 0x00FFFF);
        this.camera.remove(this.scoreMesh);
        this.scoreMesh.geometry.dispose();
        if ((this.scoreMesh.material as THREE.MeshBasicMaterial).map) {
            (this.scoreMesh.material as THREE.MeshBasicMaterial).map?.dispose();
        }
        (this.scoreMesh.material as THREE.MeshBasicMaterial).dispose();
        this.scoreMesh = newMesh;
        this.scoreMesh.position.set(0.7, 0.7, -1.5);
        this.camera.add(this.scoreMesh);
    }

    showTitleScreen(): void {
        if (this.titleScreenMesh) return;
        this.hideHUD();
        this.hideGameOverScreen();

        const canvas = this.createTextCanvas(`${this.config.titleScreenText}\n\n${this.config.pressToStartText}`, this.config.fontColor, 'rgba(0,0,0,0.7)');
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        const aspectRatio = canvas.width / canvas.height;
        const planeGeometry = new THREE.PlaneGeometry(3 * aspectRatio, 3);
        this.titleScreenMesh = new THREE.Mesh(planeGeometry, material);
        this.titleScreenMesh.position.set(0, 0, -3); // Place in front of the camera
        this.camera.add(this.titleScreenMesh);
    }

    hideTitleScreen(): void {
        if (this.titleScreenMesh) {
            this.camera.remove(this.titleScreenMesh);
            this.titleScreenMesh.geometry.dispose();
            if ((this.titleScreenMesh.material as THREE.MeshBasicMaterial).map) {
                (this.titleScreenMesh.material as THREE.MeshBasicMaterial).map?.dispose();
            }
            (this.titleScreenMesh.material as THREE.MeshBasicMaterial).dispose();
            this.titleScreenMesh = null;
        }
        this.showHUD();
    }

    showGameOverScreen(score: number): void {
        if (this.gameOverScreenMesh) return;
        this.hideHUD();
        this.hideTitleScreen();

        const canvas = this.createTextCanvas(`${this.config.gameOverText}\nScore: ${score}\n\n${this.config.pressToStartText}`, this.config.fontColor, 'rgba(0,0,0,0.7)');
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        const aspectRatio = canvas.width / canvas.height;
        const planeGeometry = new THREE.PlaneGeometry(3 * aspectRatio, 3);
        this.gameOverScreenMesh = new THREE.Mesh(planeGeometry, material);
        this.gameOverScreenMesh.position.set(0, 0, -3);
        this.camera.add(this.gameOverScreenMesh);
    }

    hideGameOverScreen(): void {
        if (this.gameOverScreenMesh) {
            this.camera.remove(this.gameOverScreenMesh);
            this.gameOverScreenMesh.geometry.dispose();
            if ((this.gameOverScreenMesh.material as THREE.MeshBasicMaterial).map) {
                (this.gameOverScreenMesh.material as THREE.MeshBasicMaterial).map?.dispose();
            }
            (this.gameOverScreenMesh.material as THREE.MeshBasicMaterial).dispose();
            this.gameOverScreenMesh = null;
        }
    }

    showHUD(): void {
        this.healthMesh.visible = true;
        this.scoreMesh.visible = true;
        this.crosshairMesh.visible = true;
    }

    hideHUD(): void {
        this.healthMesh.visible = false;
        this.scoreMesh.visible = false;
        this.crosshairMesh.visible = false;
    }

    dispose(): void {
        this.hideTitleScreen();
        this.hideGameOverScreen();

        // Dispose permanent HUD elements
        this.camera.remove(this.healthMesh);
        this.healthMesh.geometry.dispose();
        if ((this.healthMesh.material as THREE.MeshBasicMaterial).map) {
            (this.healthMesh.material as THREE.MeshBasicMaterial).map?.dispose();
        }
        (this.healthMesh.material as THREE.MeshBasicMaterial).dispose();

        this.camera.remove(this.scoreMesh);
        this.scoreMesh.geometry.dispose();
        if ((this.scoreMesh.material as THREE.MeshBasicMaterial).map) {
            (this.scoreMesh.material as THREE.MeshBasicMaterial).map?.dispose();
        }
        (this.scoreMesh.material as THREE.MeshBasicMaterial).dispose();
        
        this.camera.remove(this.crosshairMesh);
        if ((this.crosshairMesh.material as THREE.SpriteMaterial).map) {
            (this.crosshairMesh.material as THREE.SpriteMaterial).map?.dispose();
        }
        (this.crosshairMesh.material as THREE.SpriteMaterial).dispose();
    }
}

// --- Game State and Main Logic ---
enum GameState {
    LOADING,
    TITLE,
    PLAYING,
    GAME_OVER,
}

enum CollisionGroups {
    PLAYER = 1,
    GROUND = 2,
    ENEMY = 4,
    BULLET = 8,
    WALL = 16
}

let config: GameConfig;
let assetManager: AssetManager;
let inputHandler: InputHandler;

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: PointerLockControls;
let ui: UI;

let world: CANNON.World;
let player: Player;
let enemies: Enemy[] = [];
let bullets: Bullet[] = [];

let gameState: GameState = GameState.LOADING;
let score: number = 0;
let lastFrameTime: DOMHighResTimeStamp = 0;
let canvas: HTMLCanvasElement;

// Physics Materials
let groundMaterial: CANNON.Material;
let playerMaterial: CANNON.Material;
let enemyMaterial: CANNON.Material;
let bulletMaterial: CANNON.Material;

// Audio
let audioListener: THREE.AudioListener;
let bgm: THREE.Audio;
let soundEffectMap: Map<string, THREE.Audio>;

async function initGame(): Promise<void> {
    console.log('Initializing game...');
    canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error('Canvas element with ID "gameCanvas" not found.');
        return;
    }

    // Load config
    try {
        const response = await fetch('data.json');
        config = await response.json() as GameConfig;
        console.log('Config loaded:', config);
    } catch (error) {
        console.error('Failed to load data.json:', error);
        return;
    }

    assetManager = new AssetManager(config);
    await assetManager.loadAssets();

    setupScene();
    setupPhysics();
    setupPlayer();
    setupEnemies();
    setupInput();
    setupAudio();
    setupUI();

    // Resize listener
    window.addEventListener('resize', onWindowResize, false);
    onWindowResize(); // Initial resize

    gameState = GameState.TITLE;
    ui.showTitleScreen();
    animate(0); // Start the animation loop
}

function setupScene(): void {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
}

function setupPhysics(): void {
    world = new CANNON.World();
    world.gravity.set(0, -config.game.gravity, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    
    // Fix for TS2339: Property 'maxIterations' does not exist on type 'Solver'.
    // The 'iterations' property exists on GSSolver, which is a common solver used in cannon-es.
    const solver = new CANNON.GSSolver();
    solver.iterations = 10; // Use 'iterations' instead of 'maxIterations'
    world.solver = solver;

    // Materials
    groundMaterial = new CANNON.Material('groundMaterial');
    playerMaterial = new CANNON.Material('playerMaterial');
    enemyMaterial = new CANNON.Material('enemyMaterial');
    bulletMaterial = new CANNON.Material('bulletMaterial');

    const groundPlayerCM = new CANNON.ContactMaterial(
        groundMaterial,
        playerMaterial,
        { friction: config.player.friction, restitution: 0.1 }
    );
    world.addContactMaterial(groundPlayerCM);

    const enemyPlayerCM = new CANNON.ContactMaterial(
        enemyMaterial,
        playerMaterial,
        { friction: 0.1, restitution: 0.1 }
    );
    world.addContactMaterial(enemyPlayerCM);

    const bulletEnemyCM = new CANNON.ContactMaterial(
        bulletMaterial,
        enemyMaterial,
        { friction: 0.1, restitution: 0.9 }
    );
    world.addContactMaterial(bulletEnemyCM);

    const wallPlayerCM = new CANNON.ContactMaterial(
        groundMaterial, // Walls use ground material
        playerMaterial,
        { friction: 0.1, restitution: 0.1 }
    );
    world.addContactMaterial(wallPlayerCM);

    // Ground
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial, collisionFilterGroup: CollisionGroups.GROUND });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate ground to be horizontal
    world.addBody(groundBody);

    const groundTexture = assetManager.getTexture('floor_texture');
    if (groundTexture) {
        groundTexture.wrapS = THREE.RepeatWrapping;
        groundTexture.wrapT = THREE.RepeatWrapping;
        groundTexture.repeat.set(config.game.floorSize / 2, config.game.floorSize / 2); // Repeat texture
    }
    const groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(config.game.floorSize, config.game.floorSize, 10, 10),
        new THREE.MeshStandardMaterial({ map: groundTexture, side: THREE.DoubleSide })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Walls
    const wallTexture = assetManager.getTexture('wall_texture');
    if (wallTexture) {
        wallTexture.wrapS = THREE.RepeatWrapping;
        wallTexture.wrapT = THREE.RepeatWrapping;
        wallTexture.repeat.set(config.game.floorSize / 5, config.game.wallHeight / 5);
    }
    const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, side: THREE.DoubleSide });
    const wallGeometry = new THREE.BoxGeometry(config.game.floorSize, config.game.wallHeight, 0.5); // Thin wall

    function createWall(x: number, y: number, z: number, rotY: number) {
        const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
        wallMesh.position.set(x, y, z);
        wallMesh.rotation.y = rotY;
        scene.add(wallMesh);

        const wallBody = new CANNON.Body({ mass: 0, material: groundMaterial, collisionFilterGroup: CollisionGroups.WALL });
        const boxShape = new CANNON.Box(new CANNON.Vec3(config.game.floorSize / 2, config.game.wallHeight / 2, 0.25));
        wallBody.addShape(boxShape);
        wallBody.position.set(x, y, z);
        wallBody.quaternion.setFromEuler(0, rotY, 0);
        world.addBody(wallBody);
    }

    const halfFloor = config.game.floorSize / 2;
    const halfWallHeight = config.game.wallHeight / 2;
    createWall(0, halfWallHeight, -halfFloor, 0); // Back wall
    createWall(0, halfWallHeight, halfFloor, Math.PI); // Front wall
    createWall(-halfFloor, halfWallHeight, 0, Math.PI / 2); // Left wall
    createWall(halfFloor, halfWallHeight, 0, -Math.PI / 2); // Right wall
}

function setupPlayer(): void {
    player = new Player(scene, world, camera, config.player, playerMaterial);
    controls = new PointerLockControls(camera, canvas);
    
    // Parent the controls' object (which contains the camera) to the player's mesh.
    // This establishes a clear hierarchy: player.mesh -> controls.object -> camera
    player.mesh.add(controls.object); 
    scene.add(player.mesh); // Add the player's root mesh to the scene

    // Position the controls.object (and thus the camera) relative to the player's mesh.
    // This uses the cameraOffset from the config.
    controls.object.position.set(
        config.player.cameraOffset.x,
        config.player.cameraOffset.y,
        config.player.cameraOffset.z
    );
}

function setupEnemies(): void {
    for (let i = 0; i < config.enemy.count; i++) {
        const angle = (i / config.enemy.count) * Math.PI * 2 + Math.random() * 0.5; // Slightly randomize angle
        const radiusOffset = Math.random() * (config.enemy.spawnRadius / 2); // Randomize radius
        const x = Math.cos(angle) * (config.enemy.spawnRadius - radiusOffset);
        const z = Math.sin(angle) * (config.enemy.spawnRadius - radiusOffset);
        const enemyPosition = new THREE.Vector3(x, config.enemy.height / 2, z);
        const enemy = new Enemy(scene, world, config.enemy, assetManager, enemyPosition, enemyMaterial);
        enemies.push(enemy);
    }
}

function setupInput(): void {
    inputHandler = new InputHandler();
    canvas.addEventListener('click', () => {
        if (gameState === GameState.TITLE || gameState === GameState.GAME_OVER) {
            canvas.requestPointerLock();
            startGame();
        }
    });
}

function setupAudio(): void {
    audioListener = new THREE.AudioListener();
    camera.add(audioListener); // Add listener to the camera

    // Background Music
    const bgmBuffer = assetManager.getAudioBuffer('bgm');
    if (bgmBuffer) {
        bgm = new THREE.Audio(audioListener);
        bgm.setBuffer(bgmBuffer);
        bgm.setLoop(true);
        bgm.setVolume(config.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.3);
    }

    // Sound Effects
    soundEffectMap = new Map();
    config.assets.sounds.filter(s => s.name !== 'bgm').forEach(soundConfig => {
        const buffer = assetManager.getAudioBuffer(soundConfig.name);
        if (buffer) {
            const sound = new THREE.Audio(audioListener);
            sound.setBuffer(buffer);
            sound.setVolume(soundConfig.volume);
            soundEffectMap.set(soundConfig.name, sound);
        }
    });
}

function setupUI(): void {
    ui = new UI(camera, config.ui, assetManager);
}

function onWindowResize(): void {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function startGame(): void {
    if (gameState === GameState.PLAYING) return;

    console.log('Starting game...');
    gameState = GameState.PLAYING;
    score = 0;

    // Reset player
    player.reset();
    // Synchronize player mesh position with its physics body
    player.mesh.position.copy(player.body.position as unknown as THREE.Vector3);
    
    // Reset rotations. controls.object handles horizontal, its child (camera) handles vertical.
    controls.object.rotation.y = 0;
    controls.object.children[0].rotation.x = 0;

    // Clear and respawn enemies
    enemies.forEach(e => e.destroy());
    enemies = [];
    setupEnemies();

    // Clear bullets
    bullets.forEach(b => b.destroy());
    bullets = [];

    ui.hideTitleScreen();
    ui.hideGameOverScreen();
    ui.updateHealth(player.health);
    ui.updateScore(score);
    if (bgm && !bgm.isPlaying) {
        bgm.play();
    }
}

function gameOver(): void {
    if (gameState === GameState.GAME_OVER) return;

    console.log('Game Over!');
    gameState = GameState.GAME_OVER;
    ui.showGameOverScreen(score);
    if (bgm && bgm.isPlaying) {
        bgm.stop();
    }
    const gameOverSound = soundEffectMap.get('game_over');
    if (gameOverSound) {
        gameOverSound.stop(); // Ensure it can play
        gameOverSound.play();
    }
    document.exitPointerLock();
}


function animate(currentTime: DOMHighResTimeStamp): void {
    requestAnimationFrame(animate);

    const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
    lastFrameTime = currentTime;

    if (gameState === GameState.PLAYING) {
        // Physics update (fixed time step)
        world.step(1 / config.game.targetFPS, deltaTime, 3);

        // Player update
        player.update(deltaTime, inputHandler, controls);

        // Synchronize player's visual mesh with its physics body
        player.mesh.position.copy(player.body.position as unknown as THREE.Vector3);

        // Enemies update
        enemies.forEach(enemy => {
            enemy.update(deltaTime, player.body.position, player);
        });

        // Bullets update and removal
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            if (bullet.update(deltaTime)) {
                // If bullet lifetime expired or it hit something, remove it
                bullet.destroy();
                bullets.splice(i, 1);
            }
        }

        // Player shooting
        if (inputHandler.consumeShootRequest()) {
            shootBullet();
        }

        // Process hits (enemy health, score, sound) after bullet physics update
        // This loop processes bullets that have registered a collision
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            if (bullet.isHit) { // If bullet registered a collision
                for (let j = enemies.length - 1; j >= 0; j--) {
                    const enemy = enemies[j];
                    if (!enemy.isActive) continue;

                    // Re-check for collision to identify the specific enemy hit
                    const distance = bullet.body.position.distanceTo(enemy.body.position);
                    if (distance < bullet.config.radius + enemy.config.radius + 0.1) { // A bit of buffer
                        enemy.takeDamage(bullet.getDamage());
                        score += 10; // Award score for hit
                        ui.updateScore(score);
                        
                        const hitSound = soundEffectMap.get('hit');
                        if (hitSound) {
                            hitSound.stop();
                            hitSound.play();
                        }

                        if (!enemy.isActive) { // Enemy died from this hit
                            score += 50; // Bonus score for killing
                            ui.updateScore(score);
                            // Enemy will be removed from `enemies` array in the next iteration of its loop
                        }
                        // Bullet is removed by `bullet.update()` checking `isHit`
                        break; // Bullet already hit, no need to check other enemies
                    }
                }
            }
        }

        // Remove inactive enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (!enemies[i].isActive) {
                enemies[i].destroy();
                enemies.splice(i, 1);
            }
        }

        // Check game over conditions
        if (player.health <= 0) {
            gameOver();
        } else if (enemies.length === 0 && score >= config.game.maxScore) {
            // All enemies defeated and max score achieved - win condition
            gameOver(); // Can be changed to a 'Win' screen
        }
    }

    // Render scene
    renderer.render(scene, camera);
}

function shootBullet(): void {
    const shootSound = soundEffectMap.get('shoot');
    if (shootSound) {
        shootSound.stop(); // Stop if already playing to replay quickly
        shootSound.play();
    }

    // Get camera's forward direction
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Bullet spawn position: get the camera's absolute world position
    const absoluteCameraPosition = new THREE.Vector3();
    camera.getWorldPosition(absoluteCameraPosition);

    // Spawn bullet slightly in front of the camera
    const spawnOffset = new THREE.Vector3().copy(cameraDirection).multiplyScalar(0.5);
    const startPosition = absoluteCameraPosition.add(spawnOffset);

    // Bullet initial velocity
    const velocity = cameraDirection.multiplyScalar(config.bullet.speed);

    const bullet = new Bullet(scene, world, config.bullet, assetManager, startPosition, velocity, bulletMaterial);
    bullets.push(bullet);
}

// Initial call to start the game
initGame();