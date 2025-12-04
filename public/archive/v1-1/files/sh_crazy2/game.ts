import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

// --- Game Configuration & Data Structures (from data.json) ---
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

interface GameConfig {
    tileSize: number;
    mapWidth: number; // in tiles
    mapHeight: number; // in tiles
    playerSpeed: number; // units per second
    bombFuseTime: number; // seconds
    explosionRange: number; // tiles (how many tiles out from center)
    maxBombs: number; // initial max bombs player can place
    powerUpSpawnChance: number; // 0-1 chance for power-up from destructible block
    initialMap: string[]; // 'W': Wall, 'D': Destructible, 'E': Empty, 'P': Player
    colors: { [key: string]: string }; // Hex colors for meshes
    camera: {
        position: [number, number, number];
        lookAt: [number, number, number];
    };
    ui: {
        titleText: string;
        startButtonText: string;
        gameOverText: string;
        winText: string;
    };
}

interface GameData {
    assets: {
        images: AssetImage[];
        sounds: AssetSound[];
    };
    gameConfig: GameConfig;
}

// --- Global Game State & Resources ---
enum GameState {
    TITLE,
    PLAYING,
    GAME_OVER_WIN,
    GAME_OVER_LOSE,
}

let _gameState: GameState = GameState.TITLE;
let _data: GameData | null = null;

// Three.js
let _scene: THREE.Scene;
let _camera: THREE.PerspectiveCamera;
let _renderer: THREE.WebGLRenderer;
let _canvas: HTMLCanvasElement;

// Cannon.js
let _world: CANNON.World;

// Assets
const _textures = new Map<string, THREE.Texture>();
const _audioBuffers = new Map<string, AudioBuffer>();
const _audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
let _bgmSource: AudioBufferSourceNode | null = null;

// Game Objects
let _player: Player | null = null;
const _bombs: Bomb[] = [];
const _explosions: Explosion[] = [];
const _powerUps: PowerUp[] = [];
const _blocks: { mesh: THREE.Mesh; body: CANNON.Body; isDestructible: boolean; gridX: number; gridY: number }[] = [];

// Input
const _keysPressed = new Set<string>();
let _lastTime = 0;

// UI Elements (for title/game over screen, TextGeometry is async to load font)
let _titleTextMesh: THREE.Mesh | null = null;
let _startButtonTextMesh: THREE.Mesh | null = null;
let _gameOverTextMesh: THREE.Mesh | null = null;


// --- Helper Functions ---
function playSound(name: string, loop: boolean = false, volume: number = 1.0): AudioBufferSourceNode | null {
    const buffer = _audioBuffers.get(name);
    if (buffer) {
        const source = _audioContext.createBufferSource();
        source.buffer = buffer;
        const gainNode = _audioContext.createGain();
        gainNode.gain.value = volume;
        source.connect(gainNode);
        gainNode.connect(_audioContext.destination);
        source.loop = loop;
        source.start(0);
        return source;
    }
    console.warn(`Sound '${name}' not found.`);
    return null;
}

function stopSound(source: AudioBufferSourceNode | null) {
    if (source) {
        source.stop();
        source.disconnect();
    }
}

function getGridPosition(gridX: number, gridY: number): [number, number, number] {
    if (!_data) throw new Error("Game data not loaded.");
    const tileSize = _data.gameConfig.tileSize;
    const mapWidth = _data.gameConfig.mapWidth;
    const mapHeight = _data.gameConfig.mapHeight;

    // Calculate world X, Y, Z based on grid, centered on map
    // Assuming (0,0,0) is center of the map, and X-Y is horizontal plane, Z is vertical.
    const x = (gridX - (mapWidth - 1) / 2) * tileSize;
    const y = (gridY - (mapHeight - 1) / 2) * tileSize;
    return [x, y, 0]; // z-coordinate is base of the grid cell
}

function getGridCell(worldX: number, worldY: number): [number, number] {
    if (!_data) throw new Error("Game data not loaded.");
    const tileSize = _data.gameConfig.tileSize;
    const mapWidth = _data.gameConfig.mapWidth;
    const mapHeight = _data.gameConfig.mapHeight;

    const gridX = Math.round(worldX / tileSize + (mapWidth - 1) / 2);
    const gridY = Math.round(worldY / tileSize + (mapHeight - 1) / 2);
    return [gridX, gridY];
}

function getBlockAt(gridX: number, gridY: number) {
    return _blocks.find(b => b.gridX === gridX && b.gridY === gridY);
}

function getBombAt(gridX: number, gridY: number) {
    return _bombs.find(b => b.gridX === gridX && b.gridY === gridY);
}

function removeBlock(block: { mesh: THREE.Mesh; body: CANNON.Body; isDestructible: boolean; gridX: number; gridY: number }) {
    _scene.remove(block.mesh);
    _world.removeBody(block.body);
    const index = _blocks.indexOf(block);
    if (index > -1) {
        _blocks.splice(index, 1);
    }
}

// --- Game Object Classes ---

class Player {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    gridX: number;
    gridY: number;
    speed: number;
    maxBombs: number;
    currentBombs: number;
    bombRange: number;
    isAlive: boolean;
    targetGridX: number;
    targetGridY: number;

    constructor(initialGridX: number, initialGridY: number, config: GameConfig, texture: THREE.Texture) {
        this.gridX = initialGridX;
        this.gridY = initialGridY;
        this.speed = config.playerSpeed;
        this.maxBombs = config.maxBombs;
        this.currentBombs = 0;
        this.bombRange = config.explosionRange;
        this.isAlive = true;
        this.targetGridX = initialGridX;
        this.targetGridY = initialGridY;

        const playerSize = config.tileSize * 0.8;
        const [x, y, zBase] = getGridPosition(initialGridX, initialGridY);
        const z = zBase + playerSize / 2; // Position player above the ground

        // Three.js Mesh
        const geometry = new THREE.BoxGeometry(playerSize, playerSize, playerSize);
        const material = new THREE.MeshLambertMaterial({ map: texture, color: new THREE.Color(config.colors.player || '#FF0000') });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, y, z);
        this.mesh.castShadow = true;
        _scene.add(this.mesh);

        // Cannon.js Body
        const shape = new CANNON.Box(new CANNON.Vec3(playerSize / 2, playerSize / 2, playerSize / 2)); // Cannon uses half-extents
        this.body = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(x, y, z),
            shape: shape,
            fixedRotation: true, // Prevent player from tipping over
            material: new CANNON.Material('playerMaterial')
        });
        _world.addBody(this.body);

        this.body.addEventListener('collide', (event: any) => {
            const otherBody = event.body;
            const powerUp = _powerUps.find(p => p.body === otherBody);
            if (powerUp) {
                powerUp.applyEffect(this);
                powerUp.remove();
                playSound('powerup_sound', false, _data!.assets.sounds.find(s => s.name === 'powerup_sound')?.volume || 1.0);
            }
        });
    }

    update(deltaTime: number) {
        if (!this.isAlive || !_data) return;

        // Sync mesh to physics body
        this.mesh.position.copy(this.body.position as any);
        this.mesh.quaternion.copy(this.body.quaternion as any);

        let inputX = 0;
        let inputY = 0;
        if (_keysPressed.has('arrowup') || _keysPressed.has('w')) inputY++;
        if (_keysPressed.has('arrowdown') || _keysPressed.has('s')) inputY--;
        if (_keysPressed.has('arrowleft') || _keysPressed.has('a')) inputX--;
        if (_keysPressed.has('arrowright') || _keysPressed.has('d')) inputX++;

        const currentWorldPos = this.body.position;
        const [currentGridX, currentGridY] = getGridCell(currentWorldPos.x, currentWorldPos.y);

        // Update target grid based on input if not currently moving to a target
        if (inputX !== 0 || inputY !== 0) {
            if (this.targetGridX === currentGridX && this.targetGridY === currentGridY) { // Only set new target if at current target
                const newTargetX = currentGridX + inputX;
                const newTargetY = currentGridY + inputY;

                const isBlocked = _blocks.some(b => b.gridX === newTargetX && b.gridY === newTargetY) ||
                                 _bombs.some(b => b.gridX === newTargetX && b.gridY === newTargetY);

                if (!isBlocked) {
                    this.targetGridX = newTargetX;
                    this.targetGridY = newTargetY;
                }
            }
        }

        // Move towards target grid position
        const [targetWorldX, targetWorldY, targetZ] = getGridPosition(this.targetGridX, this.targetGridY);
        const targetWorldPos = new CANNON.Vec3(targetWorldX, targetWorldY, currentWorldPos.z);
        const distanceToTarget = currentWorldPos.distanceTo(targetWorldPos);

        if (distanceToTarget > 0.1) { // Still moving to target
            const direction = new CANNON.Vec3();
            targetWorldPos.vsub(currentWorldPos, direction);
            direction.normalize();
            this.body.velocity.x = direction.x * this.speed;
            this.body.velocity.y = direction.y * this.speed;
        } else { // Reached target, snap and stop horizontal movement
            this.body.position.x = targetWorldX;
            this.body.position.y = targetWorldY;
            this.body.velocity.x = 0;
            this.body.velocity.y = 0;
            this.gridX = this.targetGridX;
            this.gridY = this.targetGridY;
        }


        // Place bomb
        if (_keysPressed.has(' ')) { // Spacebar
            this.placeBomb();
            _keysPressed.delete(' '); // Consume the input
        }
    }

    placeBomb() {
        if (this.currentBombs < this.maxBombs && _data) {
            const [bombGridX, bombGridY] = getGridCell(this.mesh.position.x, this.mesh.position.y); // Use player's current grid cell
            
            // Prevent placing bomb on existing bomb
            if (getBombAt(bombGridX, bombGridY)) return;

            const bomb = new Bomb(bombGridX, bombGridY, _data.gameConfig, _textures.get('bomb')!, this);
            _bombs.push(bomb);
            this.currentBombs++;
            playSound('bomb_plant_sound', false, _data.assets.sounds.find(s => s.name === 'bomb_plant_sound')?.volume || 1.0);
        }
    }

    takeDamage() {
        if (!this.isAlive) return;
        this.isAlive = false;
        _scene.remove(this.mesh);
        _world.removeBody(this.body);
        _player = null; // Remove player reference
        _gameState = GameState.GAME_OVER_LOSE;
        playSound('player_death_sound', false, _data!.assets.sounds.find(s => s.name === 'player_death_sound')?.volume || 1.0);
    }
}

class Bomb {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    gridX: number;
    gridY: number;
    fuseTime: number;
    timer: number;
    explosionRange: number;
    exploded: boolean;
    parentPlayer: Player | null;

    constructor(gridX: number, gridY: number, config: GameConfig, texture: THREE.Texture, parentPlayer: Player | null = null) {
        this.gridX = gridX;
        this.gridY = gridY;
        this.fuseTime = config.bombFuseTime;
        this.timer = this.fuseTime;
        this.explosionRange = config.explosionRange;
        this.exploded = false;
        this.parentPlayer = parentPlayer;

        const [x, y, zBase] = getGridPosition(gridX, gridY);
        const bombSize = config.tileSize * 0.7;
        const z = zBase + bombSize / 2;

        // Three.js Mesh
        const geometry = new THREE.SphereGeometry(bombSize / 2, 16, 16);
        const material = new THREE.MeshLambertMaterial({ map: texture, color: new THREE.Color(config.colors.bomb || '#0000FF') });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, y, z);
        this.mesh.castShadow = true;
        _scene.add(this.mesh);

        // Cannon.js Body (Static to block movement)
        const shape = new CANNON.Sphere(bombSize / 2);
        this.body = new CANNON.Body({
            mass: 0, // Static
            position: new CANNON.Vec3(x, y, z),
            shape: shape,
            material: new CANNON.Material('bombMaterial')
        });
        _world.addBody(this.body);
    }

    update(deltaTime: number) {
        if (this.exploded) return;

        this.timer -= deltaTime;
        if (this.timer <= 0) {
            this.explode();
        }
    }

    explode() {
        if (this.exploded) return;
        this.exploded = true;

        // Remove from scene and world
        _scene.remove(this.mesh);
        _world.removeBody(this.body);

        // Remove from global bombs array
        const index = _bombs.indexOf(this);
        if (index > -1) {
            _bombs.splice(index, 1);
        }

        // Decrement parent player's bomb count
        if (this.parentPlayer) {
            this.parentPlayer.currentBombs = Math.max(0, this.parentPlayer.currentBombs - 1);
        }

        // Create explosion effect
        const explosion = new Explosion(this.gridX, this.gridY, this.explosionRange, _data!.gameConfig, _textures.get('explosion')!);
        _explosions.push(explosion);
        playSound('bomb_explosion_sound', false, _data!.assets.sounds.find(s => s.name === 'bomb_explosion_sound')?.volume || 1.0);
    }
}

class Explosion {
    meshes: THREE.Mesh[] = [];
    timer: number;
    duration: number = 0.5; // Visual duration of explosion
    affectedCells: Set<string> = new Set(); // Store grid coords as "x,y"

    constructor(centerX: number, centerY: number, range: number, config: GameConfig, texture: THREE.Texture) {
        this.timer = this.duration;

        const explosionMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.8, color: new THREE.Color(config.colors.explosion || '#FF8C00') });
        const tileSize = config.tileSize;

        const propagateExplosion = (startX: number, startY: number, dx: number, dy: number) => {
            for (let i = 0; i <= range; i++) {
                const currentX = startX + dx * i;
                const currentY = startY + dy * i;
                const cellKey = `${currentX},${currentY}`;

                // Prevent re-processing same cell from different propagation paths
                if (this.affectedCells.has(cellKey) && (dx !== 0 || dy !== 0)) { // Center cell can be processed once
                    if (dx !==0 || dy !==0) break; // If it's not the center, and already processed, stop propagation
                }
                
                const [worldX, worldY, worldZBase] = getGridPosition(currentX, currentY);

                const block = getBlockAt(currentX, currentY);
                if (block) {
                    if (!block.isDestructible) {
                        // Indestructible wall, stop explosion propagation in this direction
                        this.affectedCells.add(cellKey); // Mark even indestructible walls as affected for visual purposes
                        break;
                    } else {
                        // Destructible block, destroy it
                        removeBlock(block);
                        this.affectedCells.add(cellKey);
                        // Potentially spawn power-up
                        if (Math.random() < config.powerUpSpawnChance) {
                            const powerUpType = Math.random() < 0.33 ? 'speed' : Math.random() < 0.66 ? 'bomb' : 'range';
                            _powerUps.push(new PowerUp(currentX, currentY, powerUpType, config, _textures.get(`powerup_${powerUpType}`)!));
                        }
                    }
                }

                // Hit player
                if (_player && _player.isAlive && _player.gridX === currentX && _player.gridY === currentY) {
                    _player.takeDamage();
                }

                // Chain reaction with other bombs
                const bomb = getBombAt(currentX, currentY);
                if (bomb && !bomb.exploded) {
                    bomb.explode(); // Trigger immediate explosion
                }

                // Create visual explosion mesh for this cell
                const geometry = new THREE.BoxGeometry(tileSize * 0.9, tileSize * 0.9, tileSize * 0.9);
                const mesh = new THREE.Mesh(geometry, explosionMaterial);
                mesh.position.set(worldX, worldY, worldZBase + tileSize * 0.45); // Center on grid cell
                _scene.add(mesh);
                this.meshes.push(mesh);
                this.affectedCells.add(cellKey);
            }
        };

        // Center explosion
        propagateExplosion(centerX, centerY, 0, 0);
        // Directions
        propagateExplosion(centerX, centerY, 1, 0);  // Right
        propagateExplosion(centerX, centerY, -1, 0); // Left
        propagateExplosion(centerX, centerY, 0, 1);  // Up
        propagateExplosion(centerX, centerY, 0, -1); // Down
    }

    update(deltaTime: number) {
        this.timer -= deltaTime;
        if (this.timer <= 0) {
            this.remove();
        } else {
            // Animate explosion opacity
            const progress = this.timer / this.duration;
            this.meshes.forEach(mesh => {
                if (mesh.material instanceof THREE.MeshBasicMaterial) {
                    mesh.material.opacity = progress;
                }
            });
        }
    }

    remove() {
        this.meshes.forEach(mesh => {
            _scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    (mesh.material as THREE.Material).dispose();
                }
            }
        });
        const index = _explosions.indexOf(this);
        if (index > -1) {
            _explosions.splice(index, 1);
        }
    }
}

class PowerUp {
    mesh: THREE.Mesh;
    body: CANNON.Body;
    gridX: number;
    gridY: number;
    type: 'speed' | 'bomb' | 'range';

    constructor(gridX: number, gridY: number, type: 'speed' | 'bomb' | 'range', config: GameConfig, texture: THREE.Texture) {
        this.gridX = gridX;
        this.gridY = gridY;
        this.type = type;

        const [x, y, zBase] = getGridPosition(gridX, gridY);
        const powerUpSize = config.tileSize * 0.5;
        const z = zBase + powerUpSize / 2;

        // Three.js Mesh
        const geometry = new THREE.BoxGeometry(powerUpSize, powerUpSize, powerUpSize); // Simple box for now
        const material = new THREE.MeshLambertMaterial({ map: texture, color: new THREE.Color(config.colors[type] || '#FFFFFF') });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(x, y, z);
        this.mesh.castShadow = true;
        _scene.add(this.mesh);

        // Cannon.js Body (sensor, no collision response)
        const shape = new CANNON.Box(new CANNON.Vec3(powerUpSize / 2, powerUpSize / 2, powerUpSize / 2));
        this.body = new CANNON.Body({
            mass: 0, // Static, no gravity
            position: new CANNON.Vec3(x, y, z),
            shape: shape,
            isTrigger: true, // Mark as trigger for custom collision handling (handled in player collision)
            material: new CANNON.Material('powerUpMaterial')
        });
        _world.addBody(this.body);
    }

    applyEffect(player: Player) {
        switch (this.type) {
            case 'speed':
                player.speed *= 1.2; // Increase speed by 20%
                break;
            case 'bomb':
                player.maxBombs += 1; // Increase max bombs
                break;
            case 'range':
                player.bombRange += 1; // Increase bomb range
                break;
        }
    }

    remove() {
        _scene.remove(this.mesh);
        _world.removeBody(this.body);
        const index = _powerUps.indexOf(this);
        if (index > -1) {
            _powerUps.splice(index, 1);
        }
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh.material) {
             if (Array.isArray(this.mesh.material)) {
                this.mesh.material.forEach(m => m.dispose());
            } else {
                (this.mesh.material as THREE.Material).dispose();
            }
        }
    }
}


// --- Game Initialization ---
async function initGame() {
    _canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    if (!_canvas) {
        console.error('Canvas element not found!');
        return;
    }

    await loadGameData();
    if (!_data) return;

    // Three.js Renderer setup
    _renderer = new THREE.WebGLRenderer({ canvas: _canvas, antialias: true });
    _renderer.setSize(window.innerWidth, window.innerHeight);
    _renderer.setClearColor(new THREE.Color(_data.gameConfig.colors.background || '#87CEEB')); // Sky blue background
    _renderer.shadowMap.enabled = true;
    _renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Three.js Scene and Camera setup
    _scene = new THREE.Scene();
    _camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const camPos = _data.gameConfig.camera.position;
    const camLook = _data.gameConfig.camera.lookAt;
    _camera.position.set(camPos[0], camPos[1], camPos[2]);
    _camera.lookAt(camLook[0], camLook[1], camLook[2]);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // soft white light
    _scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(5, 10, 15);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = - (_data.gameConfig.mapWidth * _data.gameConfig.tileSize) / 2;
    directionalLight.shadow.camera.right = (_data.gameConfig.mapWidth * _data.gameConfig.tileSize) / 2;
    directionalLight.shadow.camera.top = (_data.gameConfig.mapHeight * _data.gameConfig.tileSize) / 2;
    directionalLight.shadow.camera.bottom = - (_data.gameConfig.mapHeight * _data.gameConfig.tileSize) / 2;
    _scene.add(directionalLight);
    // const helper = new THREE.CameraHelper(directionalLight.shadow.camera);
    // _scene.add(helper);

    // Cannon.js World setup
    _world = new CANNON.World();
    _world.gravity.set(0, 0, -9.82); // Z is up for vertical direction
    _world.broadphase = new CANNON.SAPBroadphase(_world); // Optimization for broadphase collision detection
    (_world.solver as CANNON.GSSolver).iterations = 10; // Increase solver iterations for stability

    // Ground Plane (Three.js and Cannon.js)
    const groundGeometry = new THREE.PlaneGeometry(_data.gameConfig.mapWidth * _data.gameConfig.tileSize, _data.gameConfig.mapHeight * _data.gameConfig.tileSize);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(_data.gameConfig.colors.ground || '#556B2F'), map: _textures.get('ground') });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.receiveShadow = true;
    groundMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat on X-Y plane
    _scene.add(groundMesh);

    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, material: new CANNON.Material('groundMaterial') });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to lie flat on X-Y plane
    _world.addBody(groundBody);

    // Initial event listeners
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);

    showTitleScreen();
    animate(0); // Start the animation loop
}

async function loadGameData() {
    try {
        const response = await fetch('data.json');
        _data = await response.json() as GameData;

        // Load images
        const textureLoader = new THREE.TextureLoader();
        const loadImagePromises = _data.assets.images.map(img => {
            return new Promise<void>((resolve, reject) => {
                textureLoader.load(
                    img.path,
                    (texture) => {
                        _textures.set(img.name, texture);
                        resolve();
                    },
                    undefined, // progress callback
                    (err) => {
                        console.error(`Error loading image: ${img.path}`, err);
                        reject(err);
                    }
                );
            });
        });

        // Load sounds
        const loadSoundPromises = _data.assets.sounds.map(sound => {
            return fetch(sound.path)
                .then(res => res.arrayBuffer())
                .then(arrayBuffer => _audioContext.decodeAudioData(arrayBuffer))
                .then(audioBuffer => {
                    _audioBuffers.set(sound.name, audioBuffer);
                })
                .catch(err => console.error(`Error loading sound: ${sound.path}`, err));
        });

        await Promise.all([...loadImagePromises, ...loadSoundPromises]);
        console.log('All assets loaded.');

    } catch (error) {
        console.error('Failed to load game data or assets:', error);
        alert('Failed to load game data. See console for details.');
        _data = null;
    }
}

function createText(text: string, size: number, yOffset: number, color: string, font: any): THREE.Mesh {
    const textGeometry = new TextGeometry(text, {
        font: font,
        size: size,
        depth: 0.1, // Changed 'height' to 'depth'
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.02,
        bevelOffset: 0,
        bevelSegments: 5
    });
    textGeometry.computeBoundingBox();
    const textMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
    const mesh = new THREE.Mesh(textGeometry, textMaterial);
    const bbox = textGeometry.boundingBox!;
    const width = bbox.max.x - bbox.min.x;
    mesh.position.set(-width / 2, yOffset, 5); // Position in front of camera, somewhat centered
    return mesh;
}


function showTitleScreen() {
    if (!_data) return;

    disposeUI(_titleTextMesh);
    disposeUI(_startButtonTextMesh);
    disposeUI(_gameOverTextMesh);
    _titleTextMesh = _startButtonTextMesh = _gameOverTextMesh = null;

    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
        _titleTextMesh = createText(_data!.gameConfig.ui.titleText, 1, 2, _data!.gameConfig.colors.uiText || '#FFFFFF', font);
        _startButtonTextMesh = createText(_data!.gameConfig.ui.startButtonText, 0.5, 0, _data!.gameConfig.colors.uiText || '#FFFFFF', font);
        _scene.add(_titleTextMesh);
        _scene.add(_startButtonTextMesh);
    });

    if (_bgmSource) {
        stopSound(_bgmSource);
        _bgmSource = null;
    }
    _bgmSource = playSound('bgm', true, _data.assets.sounds.find(s => s.name === 'bgm')?.volume || 0.5);
}

function disposeUI(mesh: THREE.Mesh | null) {
    if (mesh) {
        _scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
             if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m.dispose());
            } else {
                (mesh.material as THREE.Material).dispose();
            }
        }
    }
}


function startGame() {
    if (!_data) return;

    disposeUI(_titleTextMesh);
    disposeUI(_startButtonTextMesh);
    disposeUI(_gameOverTextMesh);
    _titleTextMesh = _startButtonTextMesh = _gameOverTextMesh = null;


    resetGame();
    createMap();
    _gameState = GameState.PLAYING;
}

function resetGame() {
    // Clear all game objects from previous rounds
    _blocks.forEach(b => { _scene.remove(b.mesh); _world.removeBody(b.body); });
    _blocks.length = 0;

    _bombs.forEach(b => { _scene.remove(b.mesh); _world.removeBody(b.body); });
    _bombs.length = 0;

    _explosions.forEach(e => e.remove()); // Make sure they clean up their meshes
    _explosions.length = 0;

    _powerUps.forEach(p => { _scene.remove(p.mesh); _world.removeBody(p.body); });
    _powerUps.length = 0;

    if (_player) {
        _scene.remove(_player.mesh);
        _world.removeBody(_player.body);
        _player = null;
    }
}

function createMap() {
    if (!_data) return;

    const config = _data.gameConfig;
    const tileSize = config.tileSize;
    const initialMap = config.initialMap;
    const mapWidth = config.mapWidth;
    const mapHeight = config.mapHeight;

    const wallTexture = _textures.get('wall');
    const destructibleTexture = _textures.get('destructible_block');
    const playerTexture = _textures.get('player');

    for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
            const char = initialMap[y][x];
            const [worldX, worldY, worldZBase] = getGridPosition(x, y);

            let mesh: THREE.Mesh;
            let body: CANNON.Body;

            if (char === 'W') { // Indestructible Wall
                const geometry = new THREE.BoxGeometry(tileSize, tileSize, tileSize);
                const material = new THREE.MeshLambertMaterial({ map: wallTexture, color: new THREE.Color(config.colors.wall || '#808080') });
                mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(worldX, worldY, worldZBase + tileSize / 2);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                _scene.add(mesh);

                const shape = new CANNON.Box(new CANNON.Vec3(tileSize / 2, tileSize / 2, tileSize / 2));
                body = new CANNON.Body({
                    mass: 0, // Static
                    position: new CANNON.Vec3(worldX, worldY, worldZBase + tileSize / 2),
                    shape: shape,
                    material: new CANNON.Material('wallMaterial')
                });
                _world.addBody(body);
                _blocks.push({ mesh, body, isDestructible: false, gridX: x, gridY: y });

            } else if (char === 'D') { // Destructible Block
                const geometry = new THREE.BoxGeometry(tileSize, tileSize, tileSize);
                const material = new THREE.MeshLambertMaterial({ map: destructibleTexture, color: new THREE.Color(config.colors.destructible || '#A0522D') });
                mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(worldX, worldY, worldZBase + tileSize / 2);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                _scene.add(mesh);

                const shape = new CANNON.Box(new CANNON.Vec3(tileSize / 2, tileSize / 2, tileSize / 2));
                body = new CANNON.Body({
                    mass: 0, // Static
                    position: new CANNON.Vec3(worldX, worldY, worldZBase + tileSize / 2),
                    shape: shape,
                    material: new CANNON.Material('destructibleMaterial')
                });
                _world.addBody(body);
                _blocks.push({ mesh, body, isDestructible: true, gridX: x, gridY: y });

            } else if (char === 'P' && !_player) { // Player Start Position
                _player = new Player(x, y, config, playerTexture!);
            }
        }
    }
}

function onWindowResize() {
    _camera.aspect = window.innerWidth / window.innerHeight;
    _camera.updateProjectionMatrix();
    _renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(event: KeyboardEvent) {
    _keysPressed.add(event.key.toLowerCase());

    if (_gameState === GameState.TITLE && event.key.toLowerCase() === ' ') {
        startGame();
        _keysPressed.delete(' '); // Consume spacebar
    }
    // Handle game over screen restart
    if ((_gameState === GameState.GAME_OVER_LOSE || _gameState === GameState.GAME_OVER_WIN) && event.key.toLowerCase() === 'r') {
        _gameState = GameState.TITLE;
        showTitleScreen();
        _keysPressed.delete('r');
    }
}

function onKeyUp(event: KeyboardEvent) {
    _keysPressed.delete(event.key.toLowerCase());
}

// --- Game Loop ---
function animate(currentTime: number) {
    requestAnimationFrame(animate);

    const deltaTime = (currentTime - _lastTime) / 1000; // Convert to seconds
    _lastTime = currentTime;

    if (!_data) {
        _renderer.render(_scene, _camera); // Render title screen even if data isn't fully ready
        return;
    }

    // Update physics world
    _world.step(1 / 60, deltaTime, 3); // Fixed time step for physics

    if (_gameState === GameState.PLAYING) {
        if (_player) {
            _player.update(deltaTime);
        } else { // Player died
            _gameState = GameState.GAME_OVER_LOSE;
        }

        for (let i = _bombs.length - 1; i >= 0; i--) {
            _bombs[i].update(deltaTime);
        }

        for (let i = _explosions.length - 1; i >= 0; i--) {
            _explosions[i].update(deltaTime);
        }

        // Win condition: if no destructible blocks left, player wins.
        const remainingDestructibleBlocks = _blocks.filter(b => b.isDestructible).length;
        if (remainingDestructibleBlocks === 0 && _gameState === GameState.PLAYING) {
            _gameState = GameState.GAME_OVER_WIN;
            playSound('game_win_sound', false, _data.assets.sounds.find(s => s.name === 'game_win_sound')?.volume || 1.0);
        }

    } else if (_gameState === GameState.GAME_OVER_LOSE || _gameState === GameState.GAME_OVER_WIN) {
        // Show Game Over UI
        if (!_gameOverTextMesh) {
            disposeUI(_titleTextMesh);
            disposeUI(_startButtonTextMesh);
            _titleTextMesh = _startButtonTextMesh = null;

            const fontLoader = new FontLoader();
            fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
                const text = _gameState === GameState.GAME_OVER_WIN ? _data!.gameConfig.ui.winText : _data!.gameConfig.ui.gameOverText;
                const color = _gameState === GameState.GAME_OVER_WIN ? '#00FF00' : '#FF0000';
                _gameOverTextMesh = createText(text + '\nPress R to Restart', 1, 0, color, font);
                _scene.add(_gameOverTextMesh);
            });
            // Stop BGM if it's still playing
            if (_bgmSource) {
                stopSound(_bgmSource);
                _bgmSource = null;
            }
        }
    }

    _renderer.render(_scene, _camera);
}

// Start the game
initGame();