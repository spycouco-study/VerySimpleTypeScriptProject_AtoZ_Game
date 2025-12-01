import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- Interfaces for data.json ---
interface GameSettings {
    gridWidth: number;
    gridHeight: number;
    tileSize: number;
    playerSpeed: number;
    bombFuseTime: number;
    initialBombRange: number;
    initialBombCount: number;
    explosionDuration: number;
    powerUpSpawnChance: number;
    playerRespawnDelay: number;
    titleScreenText: string;
    gameOverText: string;
    victoryText: string;
}

interface TileTypes {
    [key: string]: string;
}

interface PlayerControls {
    up: string;
    down: string;
    left: string;
    right: string;
    bomb: string;
}

interface PlayerConfig {
    name: string;
    color: string;
    controls: PlayerControls;
}

interface ImageAsset {
    name: string;
    path: string;
    width: number;
    height: number;
}

interface SoundAsset {
    name: string;
    path: string;
    duration_seconds: number;
    volume: number;
}

interface AssetsConfig {
    images: ImageAsset[];
    sounds: SoundAsset[];
}

interface GameConfig {
    gameSettings: GameSettings;
    mapLayout: string[];
    tileTypes: TileTypes;
    playerSettings: PlayerConfig[];
    assets: AssetsConfig;
}

// --- Game State Enums ---
enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER,
    VICTORY
}

enum PowerUpType {
    RANGE,
    BOMB,
    SPEED
}

// --- Asset Loader Class ---
class AssetLoader {
    private textureLoader = new THREE.TextureLoader();
    private audioContext: AudioContext;
    private audioBuffers: Map<string, AudioBuffer> = new Map();
    private textures: Map<string, THREE.Texture> = new Map();

    constructor() {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    async loadImages(images: ImageAsset[]): Promise<void> {
        const promises = images.map(async (img) => {
            const texture = await this.textureLoader.loadAsync(img.path);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            this.textures.set(img.name, texture);
        });
        await Promise.all(promises);
        console.log("All textures loaded.");
    }

    async loadSounds(sounds: SoundAsset[]): Promise<void> {
        const promises = sounds.map(async (sound) => {
            const response = await fetch(sound.path);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.audioBuffers.set(sound.name, audioBuffer);
        });
        await Promise.all(promises);
        console.log("All sounds loaded.");
    }

    getTexture(name: string): THREE.Texture {
        const texture = this.textures.get(name);
        if (!texture) throw new Error(`Texture ${name} not found!`);
        return texture;
    }

    playSFX(name: string, volume: number = 1.0, loop: boolean = false): AudioBufferSourceNode | null {
        const buffer = this.audioBuffers.get(name);
        if (!buffer) {
            console.warn(`Sound ${name} not found!`);
            return null;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        source.loop = loop;
        source.start(0);
        return source;
    }
}

// --- Game Classes (Player, Bomb, Block, etc.) ---

// Base for all grid objects
abstract class GridObject {
    mesh: THREE.Mesh | null = null;
    body: CANNON.Body | null = null;
    gridX: number;
    gridY: number;
    protected tileSize: number;

    constructor(gridX: number, gridY: number, tileSize: number) {
        this.gridX = gridX;
        this.gridY = gridY;
        this.tileSize = tileSize;
    }

    abstract createMesh(assetLoader: AssetLoader): THREE.Mesh;
    abstract createBody(): CANNON.Body;

    updatePosition(): void {
        if (this.mesh && this.body) {
            this.mesh.position.copy(this.body.position as unknown as THREE.Vector3);
            this.mesh.quaternion.copy(this.body.quaternion as unknown as THREE.Quaternion);
        }
    }

    dispose(scene: THREE.Scene, world: CANNON.World): void {
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            if (Array.isArray(this.mesh.material)) {
                this.mesh.material.forEach(m => m.dispose());
            } else {
                (this.mesh.material as THREE.Material).dispose();
            }
        }
        if (this.body) {
            world.removeBody(this.body);
        }
    }

    getCenterWorldPosition(): THREE.Vector3 {
        return new THREE.Vector3(
            (this.gridX - (game.config.gameSettings.gridWidth / 2) + 0.5) * this.tileSize,
            0,
            (this.gridY - (game.config.gameSettings.gridHeight / 2) + 0.5) * this.tileSize
        );
    }
}

class Wall extends GridObject {
    constructor(gridX: number, gridY: number, tileSize: number) {
        super(gridX, gridY, tileSize);
    }

    createMesh(assetLoader: AssetLoader): THREE.Mesh {
        const geometry = new THREE.BoxGeometry(this.tileSize, this.tileSize, this.tileSize);
        const texture = assetLoader.getTexture("wall_texture");
        texture.repeat.set(1, 1);
        const material = new THREE.MeshPhongMaterial({ map: texture });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.getCenterWorldPosition());
        this.mesh.position.y = this.tileSize / 2; // Lift to sit on floor
        this.mesh.name = `Wall_${this.gridX}_${this.gridY}`;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        return this.mesh;
    }

    createBody(): CANNON.Body {
        const shape = new CANNON.Box(new CANNON.Vec3(this.tileSize / 2, this.tileSize / 2, this.tileSize / 2));
        this.body = new CANNON.Body({
            mass: 0, // Static body
            position: new CANNON.Vec3(this.getCenterWorldPosition().x, this.tileSize / 2, this.getCenterWorldPosition().z),
            shape: shape
        });
        this.body.userData = { type: 'wall' };
        return this.body;
    }
}

class DestructibleBlock extends GridObject {
    constructor(gridX: number, gridY: number, tileSize: number) {
        super(gridX, gridY, tileSize);
    }

    createMesh(assetLoader: AssetLoader): THREE.Mesh {
        const geometry = new THREE.BoxGeometry(this.tileSize * 0.9, this.tileSize * 0.9, this.tileSize * 0.9);
        const texture = assetLoader.getTexture("block_texture");
        texture.repeat.set(1, 1);
        const material = new THREE.MeshPhongMaterial({ map: texture });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.getCenterWorldPosition());
        this.mesh.position.y = this.tileSize / 2 * 0.9; // Lift to sit on floor
        this.mesh.name = `DestructibleBlock_${this.gridX}_${this.gridY}`;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        return this.mesh;
    }

    createBody(): CANNON.Body {
        const shape = new CANNON.Box(new CANNON.Vec3(this.tileSize * 0.9 / 2, this.tileSize * 0.9 / 2, this.tileSize * 0.9 / 2));
        this.body = new CANNON.Body({
            mass: 0, // Static body
            position: new CANNON.Vec3(this.getCenterWorldPosition().x, this.tileSize * 0.9 / 2, this.getCenterWorldPosition().z),
            shape: shape
        });
        this.body.userData = { type: 'destructibleBlock', gridX: this.gridX, gridY: this.gridY };
        return this.body;
    }
}

class Player extends GridObject {
    id: number;
    config: PlayerConfig;
    bombCount: number;
    bombRange: number;
    speed: number;
    isBurst: boolean = false;
    burstTimer: number = 0;
    isMoving: { up: boolean, down: boolean, left: boolean, right: boolean } = { up: false, down: false, left: false, right: false };
    canPlaceBomb: boolean = true;
    placedBombs: Bomb[] = [];
    currentTexture: THREE.Texture;
    meshMaterial: THREE.MeshPhongMaterial;

    constructor(id: number, config: PlayerConfig, gridX: number, gridY: number, tileSize: number, initialBombCount: number, initialBombRange: number, speed: number) {
        super(gridX, gridY, tileSize);
        this.id = id;
        this.config = config;
        this.bombCount = initialBombCount;
        this.bombRange = initialBombRange;
        this.speed = speed;
    }

    createMesh(assetLoader: AssetLoader): THREE.Mesh {
        const geometry = new THREE.CylinderGeometry(this.tileSize * 0.4, this.tileSize * 0.4, this.tileSize * 0.8, 16);
        this.currentTexture = assetLoader.getTexture(`player${this.id + 1}_texture`);
        this.currentTexture.repeat.set(1, 1);
        this.meshMaterial = new THREE.MeshPhongMaterial({ map: this.currentTexture });
        this.mesh = new THREE.Mesh(geometry, this.meshMaterial);
        this.mesh.position.copy(this.getCenterWorldPosition());
        this.mesh.position.y = this.tileSize * 0.4; // Lift to sit on floor
        this.mesh.name = `Player_${this.id}`;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        return this.mesh;
    }

    createBody(): CANNON.Body {
        const shape = new CANNON.Cylinder(this.tileSize * 0.4, this.tileSize * 0.4, this.tileSize * 0.8, 16);
        this.body = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(this.getCenterWorldPosition().x, this.tileSize * 0.4, this.getCenterWorldPosition().z),
            shape: shape,
            fixedRotation: true, // Prevent rolling
            material: new CANNON.Material("playerMaterial")
        });
        // Adjust body orientation for cylinder: Rotate 90 degrees around X axis
        const quaternion = new CANNON.Quaternion();
        quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); // Rotate to stand upright
        this.body.quaternion = quaternion;
        this.body.userData = { type: 'player', id: this.id };
        return this.body;
    }

    update(deltaTime: number, game: Game): void {
        if (this.isBurst) {
            this.burstTimer -= deltaTime;
            if (this.burstTimer <= 0) {
                this.respawn(game);
            }
            return;
        }

        if (!this.body) return;

        const velocity = new CANNON.Vec3(0, 0, 0);
        if (this.isMoving.up) velocity.z -= 1;
        if (this.isMoving.down) velocity.z += 1;
        if (this.isMoving.left) velocity.x -= 1;
        if (this.isMoving.right) velocity.x += 1;

        if (velocity.length() > 0) {
            velocity.normalize().scale(this.speed, velocity);
            this.body.velocity.x = velocity.x;
            this.body.velocity.z = velocity.z;
        } else {
            this.body.velocity.x = 0;
            this.body.velocity.z = 0;
        }

        // Update grid position based on world position (for bomb placement logic)
        this.gridX = Math.round(this.body.position.x / this.tileSize + (game.config.gameSettings.gridWidth / 2) - 0.5);
        this.gridY = Math.round(this.body.position.z / this.tileSize + (game.config.gameSettings.gridHeight / 2) - 0.5);
    }

    burst(game: Game): void {
        if (this.isBurst) return;
        this.isBurst = true;
        this.burstTimer = game.config.gameSettings.playerRespawnDelay;
        game.assetLoader.playSFX("player_burst", game.config.assets.sounds.find(s => s.name === "player_burst")?.volume);
        if(this.mesh) this.mesh.visible = false;
        if(this.body) {
            this.body.collisionResponse = 0; // Disable collisions when burst
            this.body.velocity.set(0,0,0);
        }
        console.log(`Player ${this.id + 1} burst!`);
        game.checkGameOver(); // Re-check game over conditions after a player bursts
    }

    respawn(game: Game): void {
        this.isBurst = false;
        this.bombCount = game.config.gameSettings.initialBombCount;
        this.bombRange = game.config.gameSettings.initialBombRange;
        this.speed = game.config.gameSettings.playerSpeed;

        const startPos = game.playerStartPositions[this.id];
        if (startPos) {
            this.gridX = startPos.x;
            this.gridY = startPos.y;
            this.body!.position.set(this.getCenterWorldPosition().x, this.tileSize * 0.4, this.getCenterWorldPosition().z);
            this.mesh?.position.copy(this.body!.position as unknown as THREE.Vector3);
            this.mesh?.visible = true;
            this.body!.collisionResponse = 1; // Re-enable collisions
            console.log(`Player ${this.id + 1} respawned at (${this.gridX}, ${this.gridY})`);
        } else {
            // No start position for this player, remove them from active players
            if(this.mesh) this.mesh.visible = false;
            if(this.body) this.body.collisionResponse = 0;
            // Mark player as permanently out if no respawn spot or it's last player standing
            console.log(`Player ${this.id + 1} is out of game (no respawn spot).`);
            game.checkGameOver();
        }
    }

    addBomb() { this.bombCount++; }
    addRange() { this.bombRange++; }
    addSpeed() { this.speed += 1.0; } // Increase speed by a fixed amount
}

class Bomb extends GridObject {
    owner: Player;
    range: number;
    timer: number;
    isExploded: boolean = false;

    constructor(owner: Player, gridX: number, gridY: number, tileSize: number, fuseTime: number, range: number) {
        super(gridX, gridY, tileSize);
        this.owner = owner;
        this.timer = fuseTime;
        this.range = range;
    }

    createMesh(assetLoader: AssetLoader): THREE.Mesh {
        const geometry = new THREE.SphereGeometry(this.tileSize * 0.4, 16, 16);
        const texture = assetLoader.getTexture("bomb_texture");
        texture.repeat.set(1, 1);
        const material = new THREE.MeshPhongMaterial({ map: texture });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.getCenterWorldPosition());
        this.mesh.position.y = this.tileSize * 0.4;
        this.mesh.name = `Bomb_${this.gridX}_${this.gridY}`;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        return this.mesh;
    }

    createBody(): CANNON.Body {
        const shape = new CANNON.Sphere(this.tileSize * 0.4);
        this.body = new CANNON.Body({
            mass: 0, // Static
            position: new CANNON.Vec3(this.getCenterWorldPosition().x, this.tileSize * 0.4, this.getCenterWorldPosition().z),
            shape: shape,
            material: new CANNON.Material("bombMaterial")
        });
        this.body.userData = { type: 'bomb', gridX: this.gridX, gridY: this.gridY };
        return this.body;
    }

    update(deltaTime: number, game: Game): void {
        if (this.isExploded) return;

        this.timer -= deltaTime;
        if (this.timer <= 0) {
            this.explode(game);
        }
    }

    explode(game: Game): void {
        if (this.isExploded) return;
        this.isExploded = true;
        game.assetLoader.playSFX("explosion", game.config.assets.sounds.find(s => s.name === "explosion")?.volume);

        // Remove bomb mesh and body
        this.dispose(game.scene, game.world);
        this.owner.placedBombs = this.owner.placedBombs.filter(b => b !== this);
        this.owner.bombCount++; // Return bomb to owner

        const explosionTiles: { x: number, y: number, type: 'center' | 'h' | 'v' | 'end_up' | 'end_down' | 'end_left' | 'end_right' }[] = [];
        
        // Define cardinal directions for explosion spreading
        const directions = [
            { dx: 0, dy: 0, type: 'center' as const, endTexture: 'center' }, // Center itself
            { dx: 1, dy: 0, type: 'h' as const, endTexture: 'end_right' as const },  // Right
            { dx: -1, dy: 0, type: 'h' as const, endTexture: 'end_left' as const }, // Left
            { dx: 0, dy: 1, type: 'v' as const, endTexture: 'end_down' as const },   // Down (positive Y on grid is generally down)
            { dx: 0, dy: -1, type: 'v' as const, endTexture: 'end_up' as const }     // Up (negative Y on grid is generally up)
        ];

        for (const dir of directions) {
            if (dir.type === 'center') {
                explosionTiles.push({ x: this.gridX, y: this.gridY, type: 'center' });
                continue;
            }

            for (let i = 1; i <= this.range; i++) {
                const targetX = this.gridX + dir.dx * i;
                const targetY = this.gridY + dir.dy * i;

                if (!game.isGridValid(targetX, targetY)) break; // Out of bounds

                const tileObject = game.getGridObject(targetX, targetY);
                let stopExplosion = false;
                let addTile = true;

                if (tileObject instanceof Wall) {
                    stopExplosion = true; // Stop at walls
                    addTile = false; // Wall doesn't show explosion visual
                } else if (tileObject instanceof DestructibleBlock) {
                    game.destroyBlock(tileObject);
                    stopExplosion = true; // Stop after destroying a block
                } else if (tileObject instanceof Bomb && tileObject !== this) {
                    // Chain reaction!
                    tileObject.explode(game);
                    stopExplosion = true; // Keep spreading for now, but stop current chain (depends on game rules)
                } else if (tileObject instanceof PowerUp) {
                    game.destroyPowerUp(tileObject.gridX, tileObject.gridY);
                }

                if (addTile) {
                    const explosionType = (i === this.range || stopExplosion) ? dir.endTexture : dir.type;
                    explosionTiles.push({ x: targetX, y: targetY, type: explosionType });
                }

                if (stopExplosion) break;
            }
        }

        // Create visual explosion effects and check for player hits
        for (const expTile of explosionTiles) {
            game.createExplosionVisual(expTile.x, expTile.y, expTile.type);
            game.checkPlayerHit(expTile.x, expTile.y);
        }

        // Remove this bomb from the game's active bombs list
        game.activeBombs = game.activeBombs.filter(b => b !== this);
    }
}

class ExplosionVisual {
    mesh: THREE.Mesh;
    timer: number;
    maxDuration: number;
    gridX: number;
    gridY: number;

    constructor(gridX: number, gridY: number, tileSize: number, duration: number, texture: THREE.Texture) {
        this.gridX = gridX;
        this.gridY = gridY;
        this.maxDuration = duration;
        this.timer = duration;

        const geometry = new THREE.PlaneGeometry(tileSize * 0.9, tileSize * 0.9); // Slightly smaller than tile
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide
        });
        this.mesh = new THREE.Mesh(geometry, material);

        const worldPos = new THREE.Vector3(
            (gridX - (game.config.gameSettings.gridWidth / 2) + 0.5) * tileSize,
            0.1, // Slightly above floor
            (gridY - (game.config.gameSettings.gridHeight / 2) + 0.5) * tileSize
        );
        this.mesh.position.copy(worldPos);
        this.mesh.rotation.x = -Math.PI / 2; // Lay flat on the floor
        this.mesh.name = `Explosion_${gridX}_${gridY}_${Date.now()}`;
    }

    update(deltaTime: number): boolean {
        this.timer -= deltaTime;
        const opacity = this.timer / this.maxDuration;
        (this.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
        return this.timer <= 0; // Return true if it's time to remove
    }

    dispose(scene: THREE.Scene): void {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}

class PowerUp extends GridObject {
    type: PowerUpType;
    isActive: boolean = true;
    size: number;

    constructor(gridX: number, gridY: number, tileSize: number, type: PowerUpType, size: number) {
        super(gridX, gridY, tileSize);
        this.type = type;
        this.size = size;
    }

    createMesh(assetLoader: AssetLoader): THREE.Mesh {
        const geometry = new THREE.BoxGeometry(this.size, this.size, this.size);
        let textureName: string;
        switch (this.type) {
            case PowerUpType.RANGE: textureName = "powerup_range_texture"; break;
            case PowerUpType.BOMB: textureName = "powerup_bomb_texture"; break;
            case PowerUpType.SPEED: textureName = "powerup_speed_texture"; break;
            default: textureName = "powerup_range_texture"; // Fallback
        }
        const texture = assetLoader.getTexture(textureName);
        texture.repeat.set(1, 1);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5 }); // alphaTest helps with transparency sorting issues
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.getCenterWorldPosition());
        this.mesh.position.y = this.size / 2;
        this.mesh.name = `PowerUp_${this.gridX}_${this.gridY}`;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        return this.mesh;
    }

    createBody(): CANNON.Body {
        // Power-ups don't need a physics body for collision, we'll use a manual check for overlap with players
        const shape = new CANNON.Box(new CANNON.Vec3(this.size / 2, this.size / 2, this.size / 2));
        this.body = new CANNON.Body({
            mass: 0,
            position: new CANNON.Vec3(this.getCenterWorldPosition().x, this.size / 2, this.getCenterWorldPosition().z),
            shape: shape,
            isTrigger: true // Act as a trigger, not a solid object
        });
        this.body.userData = { type: 'powerup', gridX: this.gridX, gridY: this.gridY, powerUpType: this.type };
        return this.body;
    }

    applyToPlayer(player: Player): void {
        switch (this.type) {
            case PowerUpType.RANGE:
                player.addRange();
                break;
            case PowerUpType.BOMB:
                player.addBomb();
                break;
            case PowerUpType.SPEED:
                player.addSpeed();
                break;
        }
        game.assetLoader.playSFX("powerup_collect", game.config.assets.sounds.find(s => s.name === "powerup_collect")?.volume);
        this.isActive = false; // Mark for removal
        console.log(`Player ${player.id + 1} collected power-up: ${PowerUpType[this.type]}`);
    }
}

// --- Main Game Class ---
class Game {
    config!: GameConfig;
    assetLoader = new AssetLoader();
    gameState: GameState = GameState.TITLE;

    // Three.js
    scene!: THREE.Scene;
    camera!: THREE.OrthographicCamera;
    renderer!: THREE.WebGLRenderer;
    ambientLight!: THREE.AmbientLight;
    directionalLight!: THREE.DirectionalLight;

    // Cannon.js
    world!: CANNON.World;
    groundBody!: CANNON.Body;

    // Game Objects
    players: Player[] = [];
    activeBombs: Bomb[] = [];
    grid: (GridObject | null)[][] = []; // Stores walls, blocks, power-ups, players
    explosionVisuals: ExplosionVisual[] = [];
    powerUps: PowerUp[] = [];
    playerStartPositions: { x: number, y: number }[] = [];

    // Timing
    lastFrameTime: number = 0;
    bgmSource: AudioBufferSourceNode | null = null;

    // UI Elements
    titleScreenDiv!: HTMLDivElement;
    gameOverlayDiv!: HTMLDivElement;
    statusTextDiv!: HTMLDivElement;
    playerInfoDivs: HTMLDivElement[] = [];

    constructor() {
        this.initDOM();
        this.loadGameData().then(() => this.init());
    }

    private initDOM(): void {
        const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!canvas) {
            console.error('Canvas with ID "gameCanvas" not found.');
            return;
        }

        // Create overlay div for UI text
        this.gameOverlayDiv = document.createElement('div');
        this.gameOverlayDiv.id = 'gameOverlay';
        Object.assign(this.gameOverlayDiv.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontFamily: 'monospace',
            fontSize: '24px',
            textAlign: 'center',
            pointerEvents: 'none', // Allows clicks/events to pass through to canvas
            zIndex: '10'
        });
        document.body.appendChild(this.gameOverlayDiv);

        this.titleScreenDiv = document.createElement('div');
        this.titleScreenDiv.id = 'titleScreen';
        Object.assign(this.titleScreenDiv.style, {
            display: 'block',
            fontSize: '48px',
            lineHeight: '1.5',
            fontWeight: 'bold',
            textShadow: '2px 2px 4px black'
        });
        this.gameOverlayDiv.appendChild(this.titleScreenDiv);

        this.statusTextDiv = document.createElement('div');
        this.statusTextDiv.id = 'statusText';
        Object.assign(this.statusTextDiv.style, {
            display: 'none', // Hidden initially
            marginTop: '20px',
            fontSize: '36px',
            fontWeight: 'bold',
            textShadow: '2px 2px 4px black'
        });
        this.gameOverlayDiv.appendChild(this.statusTextDiv);
    }

    private async loadGameData(): Promise<void> {
        try {
            const response = await fetch('data.json');
            this.config = await response.json();
            console.log('Game configuration loaded:', this.config);
            await this.assetLoader.loadImages(this.config.assets.images);
            await this.assetLoader.loadSounds(this.config.assets.sounds);
        } catch (error) {
            console.error('Failed to load game data:', error);
        }
    }

    private init(): void {
        const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        if (!canvas) {
            console.error('Canvas element not found.');
            return;
        }

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87CEEB); // Sky blue
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = Math.max(this.config.gameSettings.gridWidth, this.config.gameSettings.gridHeight) * this.config.gameSettings.tileSize * 1.5; // Adjusted for a good view
        this.camera = new THREE.OrthographicCamera(
            -frustumSize * aspect / 2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            -frustumSize / 2,
            0.1,
            1000
        );
        this.camera.position.set(0, frustumSize * 0.7, frustumSize * 0.7); // Top-down isometric
        this.camera.lookAt(0, 0, 0);

        // Lighting
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(10, 20, 10);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 1024;
        this.directionalLight.shadow.mapSize.height = 1024;
        this.directionalLight.shadow.camera.near = 0.5;
        this.directionalLight.shadow.camera.far = 50;
        this.directionalLight.shadow.camera.left = -frustumSize / 2;
        this.directionalLight.shadow.camera.right = frustumSize / 2;
        this.directionalLight.shadow.camera.top = frustumSize / 2;
        this.directionalLight.shadow.camera.bottom = -frustumSize / 2;
        this.scene.add(this.directionalLight);

        // Cannon.js World
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0); // Standard gravity
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.allowSleep = true; // Improve performance by putting inactive bodies to sleep

        // Create contact materials for better physics interactions
        const groundPlayerCm = new CANNON.ContactMaterial(
            new CANNON.Material("groundMaterial"),
            new CANNON.Material("playerMaterial"),
            { friction: 0.0, restitution: 0.0 }
        );
        this.world.addContactMaterial(groundPlayerCm);

        const playerBombCm = new CANNON.ContactMaterial(
            new CANNON.Material("playerMaterial"),
            new CANNON.Material("bombMaterial"),
            { friction: 0.0, restitution: 0.0, contactEquationStiffness: 1e8, contactEquationRelaxation: 3 }
        );
        this.world.addContactMaterial(playerBombCm);

        // Ground plane for Cannon.js
        const groundShape = new CANNON.Plane();
        this.groundBody = new CANNON.Body({ mass: 0, material: new CANNON.Material("groundMaterial") });
        this.groundBody.addShape(groundShape);
        this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to lie flat
        this.world.addBody(this.groundBody);

        window.addEventListener('resize', () => this.onWindowResize());
        window.addEventListener('keydown', (event) => this.handleKeyDown(event));
        window.addEventListener('keyup', (event) => this.handleKeyUp(event));

        this.setupTitleScreen();
        this.animate(0); // Start the animation loop
    }

    private setupTitleScreen(): void {
        this.titleScreenDiv.innerText = this.config.gameSettings.titleScreenText;
        this.statusTextDiv.style.display = 'none';
        this.titleScreenDiv.style.display = 'block';

        // Clear player score divs
        this.playerInfoDivs.forEach(div => div.remove());
        this.playerInfoDivs = [];
    }

    private startGame(): void {
        console.log("Game Starting!");
        this.gameState = GameState.PLAYING;
        this.titleScreenDiv.style.display = 'none';
        this.statusTextDiv.style.display = 'none';

        this.resetGame();
        this.generateMap();
        this.createPlayers();
        this.createPlayerInfoUI();
        this.playBGM();
    }

    private resetGame(): void {
        // Stop BGM if playing
        if (this.bgmSource) {
            this.bgmSource.stop();
            this.bgmSource = null;
        }

        // Clear existing objects from scene and world
        this.players.forEach(p => p.dispose(this.scene, this.world));
        this.activeBombs.forEach(b => b.dispose(this.scene, this.world));
        this.explosionVisuals.forEach(e => e.dispose(this.scene));
        this.powerUps.forEach(p => p.dispose(this.scene, this.world));

        // Clear grid objects (walls, blocks)
        for (let y = 0; y < this.config.gameSettings.gridHeight; y++) {
            for (let x = 0; x < this.config.gameSettings.gridWidth; x++) {
                const obj = this.grid[y][x];
                if (obj) {
                    obj.dispose(this.scene, this.world);
                }
            }
        }
        
        // Remove floor mesh if exists
        const floorMesh = this.scene.getObjectByName('floor');
        if (floorMesh) {
            this.scene.remove(floorMesh);
            (floorMesh as THREE.Mesh).geometry.dispose();
            if (Array.isArray((floorMesh as THREE.Mesh).material)) {
                ((floorMesh as THREE.Mesh).material as THREE.Material[]).forEach(m => m.dispose());
            } else {
                ((floorMesh as THREE.Mesh).material as THREE.Material).dispose();
            }
        }

        this.players = [];
        this.activeBombs = [];
        this.grid = [];
        this.explosionVisuals = [];
        this.powerUps = [];
        this.playerStartPositions = [];

        // Clear UI info divs
        this.playerInfoDivs.forEach(div => div.remove());
        this.playerInfoDivs = [];
    }

    private generateMap(): void {
        const { gridWidth, gridHeight, tileSize } = this.config.gameSettings;
        this.grid = Array(gridHeight).fill(null).map(() => Array(gridWidth).fill(null));

        // Floor
        const floorGeometry = new THREE.PlaneGeometry(gridWidth * tileSize, gridHeight * tileSize);
        const floorTexture = this.assetLoader.getTexture("floor_texture");
        floorTexture.repeat.set(gridWidth, gridHeight); // Repeat texture over the floor
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        const floorMaterial = new THREE.MeshPhongMaterial({ map: floorTexture, side: THREE.DoubleSide });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2; // Lay flat
        floorMesh.position.set(0, -0.01, 0); // Slightly below grid to avoid Z-fighting
        floorMesh.receiveShadow = true;
        floorMesh.name = 'floor';
        this.scene.add(floorMesh);

        // Map layout
        const mapLayout = this.config.mapLayout;
        for (let y = 0; y < gridHeight; y++) {
            const row = mapLayout[y];
            for (let x = 0; x < gridWidth; x++) {
                const tileChar = row[x];
                let obj: GridObject | null = null;
                switch (this.config.tileTypes[tileChar]) {
                    case 'wall':
                        obj = new Wall(x, y, tileSize);
                        break;
                    case 'destructibleBlock':
                        obj = new DestructibleBlock(x, y, tileSize);
                        break;
                    case 'playerStart':
                        this.playerStartPositions.push({ x: x, y: y });
                        // Add floor or empty space for player start
                        break;
                    case 'floor':
                        // Empty space, no object needed for grid
                        break;
                    default:
                        console.warn(`Unknown tile character: ${tileChar}`);
                }
                if (obj) {
                    this.scene.add(obj.createMesh(this.assetLoader));
                    this.world.addBody(obj.createBody());
                    this.grid[y][x] = obj;
                }
            }
        }
    }

    private createPlayers(): void {
        const { tileSize, initialBombCount, initialBombRange, playerSpeed } = this.config.gameSettings;
        this.players = [];
        for (let i = 0; i < this.config.playerSettings.length; i++) {
            const playerConfig = this.config.playerSettings[i];
            const startPos = this.playerStartPositions[i];
            if (startPos) {
                const player = new Player(i, playerConfig, startPos.x, startPos.y, tileSize, initialBombCount, initialBombRange, playerSpeed);
                this.scene.add(player.createMesh(this.assetLoader));
                this.world.addBody(player.createBody());
                this.players.push(player);
                // No need to set player in grid as they move. Grid is for static/semi-static objects.
            } else {
                console.warn(`No start position for player ${i + 1}. Skipping.`);
            }
        }
    }

    private createPlayerInfoUI(): void {
        this.playerInfoDivs.forEach(div => div.remove()); // Clear previous
        this.playerInfoDivs = [];

        const infoContainer = document.createElement('div');
        Object.assign(infoContainer.style, {
            position: 'absolute',
            top: '10px',
            left: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            zIndex: '11',
            pointerEvents: 'none',
            fontFamily: 'monospace',
            color: 'white',
            textShadow: '1px 1px 2px black'
        });
        document.body.appendChild(infoContainer);

        this.players.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.id = `playerInfo-${player.id}`;
            Object.assign(playerDiv.style, {
                fontSize: '18px',
                padding: '5px',
                border: `1px solid ${player.config.color}`,
                backgroundColor: 'rgba(0,0,0,0.5)'
            });
            playerDiv.innerText = `${player.config.name}: Bombs: ${player.bombCount}, Range: ${player.bombRange}, Speed: ${player.speed.toFixed(1)}`;
            infoContainer.appendChild(playerDiv);
            this.playerInfoDivs.push(playerDiv);
        });
    }

    private updatePlayerInfoUI(): void {
        this.players.forEach(player => {
            const playerDiv = this.playerInfoDivs[player.id];
            if (playerDiv) {
                playerDiv.innerText = `${player.config.name}: ${player.isBurst ? 'BURST!' : `Bombs: ${player.bombCount}, Range: ${player.bombRange}, Speed: ${player.speed.toFixed(1)}`}`;
                playerDiv.style.opacity = player.isBurst ? '0.5' : '1.0';
                playerDiv.style.textDecoration = player.isBurst ? 'line-through' : 'none';
            }
        });
    }

    private playBGM(): void {
        const bgmConfig = this.config.assets.sounds.find(s => s.name === "bgm");
        if (bgmConfig) {
            if (this.bgmSource) {
                this.bgmSource.stop();
            }
            this.bgmSource = this.assetLoader.playSFX("bgm", bgmConfig.volume, true);
        }
    }

    private animate(time: DOMHighResTimeStamp): void {
        requestAnimationFrame((t) => this.animate(t));

        const deltaTime = (time - this.lastFrameTime) / 1000; // seconds
        this.lastFrameTime = time;

        if (this.gameState === GameState.PLAYING) {
            this.update(deltaTime);
            this.updatePlayerInfoUI();
        }
        this.render();
    }

    private update(deltaTime: number): void {
        // Cannon.js world step
        this.world.step(1 / 60, deltaTime, 3); // 60 FPS, dt, maxSubSteps

        // Update players
        this.players.forEach(player => {
            player.update(deltaTime, this);
            player.updatePosition(); // Sync Three.js mesh with Cannon.js body
        });

        // Update bombs
        this.activeBombs.forEach(bomb => bomb.update(deltaTime, this));

        // Update explosion visuals
        this.explosionVisuals = this.explosionVisuals.filter(exp => {
            const finished = exp.update(deltaTime);
            if (finished) {
                exp.dispose(this.scene);
            }
            return !finished;
        });

        // Check for player-powerup collisions
        this.powerUps = this.powerUps.filter(powerUp => {
            if (!powerUp.isActive) {
                // Clear powerup from grid before disposal
                if (this.isGridValid(powerUp.gridX, powerUp.gridY) && this.grid[powerUp.gridY][powerUp.gridX] === powerUp) {
                    this.grid[powerUp.gridY][powerUp.gridX] = null;
                }
                powerUp.dispose(this.scene, this.world);
                return false;
            }
            this.players.forEach(player => {
                if (!player.isBurst && player.body && powerUp.body) {
                    // Manual overlap check between player and power-up bounding boxes
                    const pMin = new THREE.Vector3().copy(player.mesh!.position).add(new THREE.Vector3(-player.tileSize * 0.4, -player.tileSize * 0.4, -player.tileSize * 0.4));
                    const pMax = new THREE.Vector3().copy(player.mesh!.position).add(new THREE.Vector3(player.tileSize * 0.4, player.tileSize * 0.4, player.tileSize * 0.4));
                    const puMin = new THREE.Vector3().copy(powerUp.mesh!.position).add(new THREE.Vector3(-powerUp.size / 2, -powerUp.size / 2, -powerUp.size / 2));
                    const puMax = new THREE.Vector3().copy(powerUp.mesh!.position).add(new THREE.Vector3(powerUp.size / 2, powerUp.size / 2, powerUp.size / 2));
                    
                    if (pMax.x > puMin.x && pMin.x < puMax.x &&
                        pMax.y > puMin.y && pMin.y < puMax.y &&
                        pMax.z > puMin.z && pMin.z < puMax.z) {
                        powerUp.applyToPlayer(player);
                    }
                }
            });
            return powerUp.isActive;
        });
    }

    private render(): void {
        this.renderer.render(this.scene, this.camera);
    }

    private onWindowResize(): void {
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = Math.max(this.config.gameSettings.gridWidth, this.config.gameSettings.gridHeight) * this.config.gameSettings.tileSize * 1.5;
        this.camera.left = -frustumSize * aspect / 2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (this.gameState === GameState.TITLE || this.gameState === GameState.GAME_OVER || this.gameState === GameState.VICTORY) {
            if (event.code === 'Space' || event.code === 'Enter') {
                this.startGame();
            }
            return;
        }

        this.players.forEach(player => {
            if (player.isBurst) return;

            const controls = player.config.controls;
            switch (event.code) {
                case controls.up: player.isMoving.up = true; break;
                case controls.down: player.isMoving.down = true; break;
                case controls.left: player.isMoving.left = true; break;
                case controls.right: player.isMoving.right = true; break;
                case controls.bomb:
                    if (player.canPlaceBomb && player.bombCount > 0) {
                        this.placeBomb(player);
                        player.canPlaceBomb = false; // Prevent rapid placement
                    }
                    break;
            }
        });
    }

    private handleKeyUp(event: KeyboardEvent): void {
        if (this.gameState !== GameState.PLAYING) return;

        this.players.forEach(player => {
            if (player.isBurst) return;

            const controls = player.config.controls;
            switch (event.code) {
                case controls.up: player.isMoving.up = false; break;
                case controls.down: player.isMoving.down = false; break;
                case controls.left: player.isMoving.left = false; break;
                case controls.right: player.isMoving.right = false; break;
                case controls.bomb:
                    player.canPlaceBomb = true; // Allow placing bomb again
                    break;
            }
        });
    }

    private placeBomb(player: Player): void {
        const { tileSize, bombFuseTime } = this.config.gameSettings;

        // Ensure bomb is placed on a valid grid cell, snapped to center
        const bombGridX = player.gridX;
        const bombGridY = player.gridY;

        // Check if there's already a bomb or solid object at this location
        if (!this.isGridValid(bombGridX, bombGridY)) return;
        const existingObj = this.getGridObject(bombGridX, bombGridY);
        if (existingObj instanceof Bomb || existingObj instanceof Wall || existingObj instanceof DestructibleBlock) {
            return;
        }

        player.bombCount--;
        const bomb = new Bomb(player, bombGridX, bombGridY, tileSize, bombFuseTime, player.bombRange);
        this.scene.add(bomb.createMesh(this.assetLoader));
        this.world.addBody(bomb.createBody());
        this.activeBombs.push(bomb);
        player.placedBombs.push(bomb);
        this.grid[bombGridY][bombGridX] = bomb; // Mark grid with bomb
        this.assetLoader.playSFX("place_bomb", this.config.assets.sounds.find(s => s.name === "place_bomb")?.volume);
        console.log(`Player ${player.id + 1} placed bomb at (${bombGridX}, ${bombGridY}). Remaining bombs: ${player.bombCount}`);
    }

    isGridValid(x: number, y: number): boolean {
        const { gridWidth, gridHeight } = this.config.gameSettings;
        return x >= 0 && x < gridWidth && y >= 0 && y < gridHeight;
    }

    getGridObject(x: number, y: number): GridObject | null {
        if (!this.isGridValid(x, y)) return null;
        return this.grid[y][x];
    }

    destroyBlock(block: DestructibleBlock): void {
        const { gridX, gridY } = block;
        if (!this.isGridValid(gridX, gridY)) return;

        this.grid[gridY][gridX] = null; // Clear from grid
        block.dispose(this.scene, this.world);

        // Potentially spawn a power-up
        if (Math.random() < this.config.gameSettings.powerUpSpawnChance) {
            this.spawnPowerUp(gridX, gridY);
        }
    }

    spawnPowerUp(gridX: number, gridY: number): void {
        if (this.getGridObject(gridX, gridY) !== null) {
            // Something already there (e.g., another power-up from chain reaction), don't spawn
            return;
        }

        const powerUpTypes = [PowerUpType.RANGE, PowerUpType.BOMB, PowerUpType.SPEED];
        const randomType = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
        const powerUpSize = this.config.gameSettings.tileSize * 0.5; // Half tile size for power-up

        const powerUp = new PowerUp(gridX, gridY, this.config.gameSettings.tileSize, randomType, powerUpSize);
        this.scene.add(powerUp.createMesh(this.assetLoader));
        this.world.addBody(powerUp.createBody());
        this.powerUps.push(powerUp);
        this.grid[gridY][gridX] = powerUp; // Occupy grid for detection
        console.log(`Power-up ${PowerUpType[randomType]} spawned at (${gridX}, ${gridY})`);
    }

    destroyPowerUp(gridX: number, gridY: number): void {
        const powerUp = this.powerUps.find(p => p.gridX === gridX && p.gridY === gridY);
        if (powerUp) {
            powerUp.isActive = false; // Mark for removal in next update loop
            // No need to clear from grid immediately; filter in update loop will handle.
            // If cleared immediately, another powerup could spawn there.
            console.log(`Power-up at (${gridX}, ${gridY}) destroyed by explosion.`);
        }
    }

    createExplosionVisual(gridX: number, gridY: number, type: ExplosionVisual['type']): void {
        let textureName: string;
        switch(type) {
            case 'center': textureName = 'explosion_center_texture'; break;
            case 'h': textureName = 'explosion_horizontal_texture'; break;
            case 'v': textureName = 'explosion_vertical_texture'; break;
            case 'end_up': textureName = 'explosion_end_up_texture'; break;
            case 'end_down': textureName = 'explosion_end_down_texture'; break;
            case 'end_left': textureName = 'explosion_end_left_texture'; break;
            case 'end_right': textureName = 'explosion_end_right_texture'; break;
            default: textureName = 'explosion_center_texture'; // Fallback
        }

        const texture = this.assetLoader.getTexture(textureName);
        const explosion = new ExplosionVisual(gridX, gridY, this.config.gameSettings.tileSize, this.config.gameSettings.explosionDuration, texture);
        this.scene.add(explosion.mesh);
        this.explosionVisuals.push(explosion);

        // If a bomb was at this position, remove it from grid now that it has exploded
        if (this.isGridValid(gridX, gridY) && this.grid[gridY][gridX] instanceof Bomb) {
            this.grid[gridY][gridX] = null;
        }
    }

    checkPlayerHit(explosionGridX: number, explosionGridY: number): void {
        this.players.forEach(player => {
            if (!player.isBurst && player.gridX === explosionGridX && player.gridY === explosionGridY) {
                player.burst(this);
            }
        });
    }

    checkGameOver(): void {
        const alivePlayers = this.players.filter(p => !p.isBurst);
        if (alivePlayers.length === 1 && this.players.length > 1) {
            this.gameState = GameState.VICTORY;
            this.statusTextDiv.innerText = this.config.gameSettings.victoryText.replace('{PLAYER_NUMBER}', (alivePlayers[0].id + 1).toString());
            this.statusTextDiv.style.display = 'block';
            if (this.bgmSource) {
                this.bgmSource.stop();
            }
        } else if (alivePlayers.length === 0 && this.players.length > 0) { // All players burst
            this.gameState = GameState.GAME_OVER;
            this.statusTextDiv.innerText = this.config.gameSettings.gameOverText;
            this.statusTextDiv.style.display = 'block';
            if (this.bgmSource) {
                this.bgmSource.stop();
            }
        }
    }
}

// Global game instance
const game = new Game();