import * as THREE from "three";
import * as CANNON from "cannon-es";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  GameState2[GameState2["GAME_OVER_WIN"] = 2] = "GAME_OVER_WIN";
  GameState2[GameState2["GAME_OVER_LOSE"] = 3] = "GAME_OVER_LOSE";
  return GameState2;
})(GameState || {});
let _gameState = 0 /* TITLE */;
let _data = null;
let _scene;
let _camera;
let _renderer;
let _canvas;
let _world;
const _textures = /* @__PURE__ */ new Map();
const _audioBuffers = /* @__PURE__ */ new Map();
const _audioContext = new (window.AudioContext || window.webkitAudioContext)();
let _bgmSource = null;
let _player = null;
const _bombs = [];
const _explosions = [];
const _powerUps = [];
const _blocks = [];
const _keysPressed = /* @__PURE__ */ new Set();
let _lastTime = 0;
let _titleTextMesh = null;
let _startButtonTextMesh = null;
let _gameOverTextMesh = null;
function playSound(name, loop = false, volume = 1) {
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
function stopSound(source) {
  if (source) {
    source.stop();
    source.disconnect();
  }
}
function getGridPosition(gridX, gridY) {
  if (!_data) throw new Error("Game data not loaded.");
  const tileSize = _data.gameConfig.tileSize;
  const mapWidth = _data.gameConfig.mapWidth;
  const mapHeight = _data.gameConfig.mapHeight;
  const x = (gridX - (mapWidth - 1) / 2) * tileSize;
  const y = (gridY - (mapHeight - 1) / 2) * tileSize;
  return [x, y, 0];
}
function getGridCell(worldX, worldY) {
  if (!_data) throw new Error("Game data not loaded.");
  const tileSize = _data.gameConfig.tileSize;
  const mapWidth = _data.gameConfig.mapWidth;
  const mapHeight = _data.gameConfig.mapHeight;
  const gridX = Math.round(worldX / tileSize + (mapWidth - 1) / 2);
  const gridY = Math.round(worldY / tileSize + (mapHeight - 1) / 2);
  return [gridX, gridY];
}
function getBlockAt(gridX, gridY) {
  return _blocks.find((b) => b.gridX === gridX && b.gridY === gridY);
}
function getBombAt(gridX, gridY) {
  return _bombs.find((b) => b.gridX === gridX && b.gridY === gridY);
}
function removeBlock(block) {
  _scene.remove(block.mesh);
  _world.removeBody(block.body);
  const index = _blocks.indexOf(block);
  if (index > -1) {
    _blocks.splice(index, 1);
  }
}
class Player {
  constructor(initialGridX, initialGridY, config, texture) {
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
    const z = zBase + playerSize / 2;
    const geometry = new THREE.BoxGeometry(playerSize, playerSize, playerSize);
    const material = new THREE.MeshLambertMaterial({ map: texture, color: new THREE.Color(config.colors.player || "#FF0000") });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, y, z);
    this.mesh.castShadow = true;
    _scene.add(this.mesh);
    const shape = new CANNON.Box(new CANNON.Vec3(playerSize / 2, playerSize / 2, playerSize / 2));
    this.body = new CANNON.Body({
      mass: 5,
      position: new CANNON.Vec3(x, y, z),
      shape,
      fixedRotation: true,
      // Prevent player from tipping over
      material: new CANNON.Material("playerMaterial")
    });
    _world.addBody(this.body);
    this.body.addEventListener("collide", (event) => {
      const otherBody = event.body;
      const powerUp = _powerUps.find((p) => p.body === otherBody);
      if (powerUp) {
        powerUp.applyEffect(this);
        powerUp.remove();
        playSound("powerup_sound", false, _data.assets.sounds.find((s) => s.name === "powerup_sound")?.volume || 1);
      }
    });
  }
  update(deltaTime) {
    if (!this.isAlive || !_data) return;
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
    let inputX = 0;
    let inputY = 0;
    if (_keysPressed.has("arrowup") || _keysPressed.has("w")) inputY++;
    if (_keysPressed.has("arrowdown") || _keysPressed.has("s")) inputY--;
    if (_keysPressed.has("arrowleft") || _keysPressed.has("a")) inputX--;
    if (_keysPressed.has("arrowright") || _keysPressed.has("d")) inputX++;
    const currentWorldPos = this.body.position;
    const [currentGridX, currentGridY] = getGridCell(currentWorldPos.x, currentWorldPos.y);
    if (inputX !== 0 || inputY !== 0) {
      if (this.targetGridX === currentGridX && this.targetGridY === currentGridY) {
        const newTargetX = currentGridX + inputX;
        const newTargetY = currentGridY + inputY;
        const isBlocked = _blocks.some((b) => b.gridX === newTargetX && b.gridY === newTargetY) || _bombs.some((b) => b.gridX === newTargetX && b.gridY === newTargetY);
        if (!isBlocked) {
          this.targetGridX = newTargetX;
          this.targetGridY = newTargetY;
        }
      }
    }
    const [targetWorldX, targetWorldY, targetZ] = getGridPosition(this.targetGridX, this.targetGridY);
    const targetWorldPos = new CANNON.Vec3(targetWorldX, targetWorldY, currentWorldPos.z);
    const distanceToTarget = currentWorldPos.distanceTo(targetWorldPos);
    if (distanceToTarget > 0.1) {
      const direction = new CANNON.Vec3();
      targetWorldPos.vsub(currentWorldPos, direction);
      direction.normalize();
      this.body.velocity.x = direction.x * this.speed;
      this.body.velocity.y = direction.y * this.speed;
    } else {
      this.body.position.x = targetWorldX;
      this.body.position.y = targetWorldY;
      this.body.velocity.x = 0;
      this.body.velocity.y = 0;
      this.gridX = this.targetGridX;
      this.gridY = this.targetGridY;
    }
    if (_keysPressed.has(" ")) {
      this.placeBomb();
      _keysPressed.delete(" ");
    }
  }
  placeBomb() {
    if (this.currentBombs < this.maxBombs && _data) {
      const [bombGridX, bombGridY] = getGridCell(this.mesh.position.x, this.mesh.position.y);
      if (getBombAt(bombGridX, bombGridY)) return;
      const bomb = new Bomb(bombGridX, bombGridY, _data.gameConfig, _textures.get("bomb"), this);
      _bombs.push(bomb);
      this.currentBombs++;
      playSound("bomb_plant_sound", false, _data.assets.sounds.find((s) => s.name === "bomb_plant_sound")?.volume || 1);
    }
  }
  takeDamage() {
    if (!this.isAlive) return;
    this.isAlive = false;
    _scene.remove(this.mesh);
    _world.removeBody(this.body);
    _player = null;
    _gameState = 3 /* GAME_OVER_LOSE */;
    playSound("player_death_sound", false, _data.assets.sounds.find((s) => s.name === "player_death_sound")?.volume || 1);
  }
}
class Bomb {
  constructor(gridX, gridY, config, texture, parentPlayer = null) {
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
    const geometry = new THREE.SphereGeometry(bombSize / 2, 16, 16);
    const material = new THREE.MeshLambertMaterial({ map: texture, color: new THREE.Color(config.colors.bomb || "#0000FF") });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, y, z);
    this.mesh.castShadow = true;
    _scene.add(this.mesh);
    const shape = new CANNON.Sphere(bombSize / 2);
    this.body = new CANNON.Body({
      mass: 0,
      // Static
      position: new CANNON.Vec3(x, y, z),
      shape,
      material: new CANNON.Material("bombMaterial")
    });
    _world.addBody(this.body);
  }
  update(deltaTime) {
    if (this.exploded) return;
    this.timer -= deltaTime;
    if (this.timer <= 0) {
      this.explode();
    }
  }
  explode() {
    if (this.exploded) return;
    this.exploded = true;
    _scene.remove(this.mesh);
    _world.removeBody(this.body);
    const index = _bombs.indexOf(this);
    if (index > -1) {
      _bombs.splice(index, 1);
    }
    if (this.parentPlayer) {
      this.parentPlayer.currentBombs = Math.max(0, this.parentPlayer.currentBombs - 1);
    }
    const explosion = new Explosion(this.gridX, this.gridY, this.explosionRange, _data.gameConfig, _textures.get("explosion"));
    _explosions.push(explosion);
    playSound("bomb_explosion_sound", false, _data.assets.sounds.find((s) => s.name === "bomb_explosion_sound")?.volume || 1);
  }
}
class Explosion {
  // Store grid coords as "x,y"
  constructor(centerX, centerY, range, config, texture) {
    this.meshes = [];
    this.duration = 0.5;
    // Visual duration of explosion
    this.affectedCells = /* @__PURE__ */ new Set();
    this.timer = this.duration;
    const explosionMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.8, color: new THREE.Color(config.colors.explosion || "#FF8C00") });
    const tileSize = config.tileSize;
    const propagateExplosion = (startX, startY, dx, dy) => {
      for (let i = 0; i <= range; i++) {
        const currentX = startX + dx * i;
        const currentY = startY + dy * i;
        const cellKey = `${currentX},${currentY}`;
        if (this.affectedCells.has(cellKey) && (dx !== 0 || dy !== 0)) {
          if (dx !== 0 || dy !== 0) break;
        }
        const [worldX, worldY, worldZBase] = getGridPosition(currentX, currentY);
        const block = getBlockAt(currentX, currentY);
        if (block) {
          if (!block.isDestructible) {
            this.affectedCells.add(cellKey);
            break;
          } else {
            removeBlock(block);
            this.affectedCells.add(cellKey);
            if (Math.random() < config.powerUpSpawnChance) {
              const powerUpType = Math.random() < 0.33 ? "speed" : Math.random() < 0.66 ? "bomb" : "range";
              _powerUps.push(new PowerUp(currentX, currentY, powerUpType, config, _textures.get(`powerup_${powerUpType}`)));
            }
          }
        }
        if (_player && _player.isAlive && _player.gridX === currentX && _player.gridY === currentY) {
          _player.takeDamage();
        }
        const bomb = getBombAt(currentX, currentY);
        if (bomb && !bomb.exploded) {
          bomb.explode();
        }
        const geometry = new THREE.BoxGeometry(tileSize * 0.9, tileSize * 0.9, tileSize * 0.9);
        const mesh = new THREE.Mesh(geometry, explosionMaterial);
        mesh.position.set(worldX, worldY, worldZBase + tileSize * 0.45);
        _scene.add(mesh);
        this.meshes.push(mesh);
        this.affectedCells.add(cellKey);
      }
    };
    propagateExplosion(centerX, centerY, 0, 0);
    propagateExplosion(centerX, centerY, 1, 0);
    propagateExplosion(centerX, centerY, -1, 0);
    propagateExplosion(centerX, centerY, 0, 1);
    propagateExplosion(centerX, centerY, 0, -1);
  }
  update(deltaTime) {
    this.timer -= deltaTime;
    if (this.timer <= 0) {
      this.remove();
    } else {
      const progress = this.timer / this.duration;
      this.meshes.forEach((mesh) => {
        if (mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.opacity = progress;
        }
      });
    }
  }
  remove() {
    this.meshes.forEach((mesh) => {
      _scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
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
  constructor(gridX, gridY, type, config, texture) {
    this.gridX = gridX;
    this.gridY = gridY;
    this.type = type;
    const [x, y, zBase] = getGridPosition(gridX, gridY);
    const powerUpSize = config.tileSize * 0.5;
    const z = zBase + powerUpSize / 2;
    const geometry = new THREE.BoxGeometry(powerUpSize, powerUpSize, powerUpSize);
    const material = new THREE.MeshLambertMaterial({ map: texture, color: new THREE.Color(config.colors[type] || "#FFFFFF") });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(x, y, z);
    this.mesh.castShadow = true;
    _scene.add(this.mesh);
    const shape = new CANNON.Box(new CANNON.Vec3(powerUpSize / 2, powerUpSize / 2, powerUpSize / 2));
    this.body = new CANNON.Body({
      mass: 0,
      // Static, no gravity
      position: new CANNON.Vec3(x, y, z),
      shape,
      isTrigger: true,
      // Mark as trigger for custom collision handling (handled in player collision)
      material: new CANNON.Material("powerUpMaterial")
    });
    _world.addBody(this.body);
  }
  applyEffect(player) {
    switch (this.type) {
      case "speed":
        player.speed *= 1.2;
        break;
      case "bomb":
        player.maxBombs += 1;
        break;
      case "range":
        player.bombRange += 1;
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
        this.mesh.material.forEach((m) => m.dispose());
      } else {
        this.mesh.material.dispose();
      }
    }
  }
}
async function initGame() {
  _canvas = document.getElementById("gameCanvas");
  if (!_canvas) {
    console.error("Canvas element not found!");
    return;
  }
  await loadGameData();
  if (!_data) return;
  _renderer = new THREE.WebGLRenderer({ canvas: _canvas, antialias: true });
  _renderer.setSize(window.innerWidth, window.innerHeight);
  _renderer.setClearColor(new THREE.Color(_data.gameConfig.colors.background || "#87CEEB"));
  _renderer.shadowMap.enabled = true;
  _renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  _scene = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1e3);
  const camPos = _data.gameConfig.camera.position;
  const camLook = _data.gameConfig.camera.lookAt;
  _camera.position.set(camPos[0], camPos[1], camPos[2]);
  _camera.lookAt(camLook[0], camLook[1], camLook[2]);
  const ambientLight = new THREE.AmbientLight(4210752, 2);
  _scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(16777215, 2);
  directionalLight.position.set(5, 10, 15);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -(_data.gameConfig.mapWidth * _data.gameConfig.tileSize) / 2;
  directionalLight.shadow.camera.right = _data.gameConfig.mapWidth * _data.gameConfig.tileSize / 2;
  directionalLight.shadow.camera.top = _data.gameConfig.mapHeight * _data.gameConfig.tileSize / 2;
  directionalLight.shadow.camera.bottom = -(_data.gameConfig.mapHeight * _data.gameConfig.tileSize) / 2;
  _scene.add(directionalLight);
  _world = new CANNON.World();
  _world.gravity.set(0, 0, -9.82);
  _world.broadphase = new CANNON.SAPBroadphase(_world);
  _world.solver.iterations = 10;
  const groundGeometry = new THREE.PlaneGeometry(_data.gameConfig.mapWidth * _data.gameConfig.tileSize, _data.gameConfig.mapHeight * _data.gameConfig.tileSize);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(_data.gameConfig.colors.ground || "#556B2F"), map: _textures.get("ground") });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.receiveShadow = true;
  groundMesh.rotation.x = -Math.PI / 2;
  _scene.add(groundMesh);
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ mass: 0, material: new CANNON.Material("groundMaterial") });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  _world.addBody(groundBody);
  window.addEventListener("resize", onWindowResize, false);
  document.addEventListener("keydown", onKeyDown, false);
  document.addEventListener("keyup", onKeyUp, false);
  showTitleScreen();
  animate(0);
}
async function loadGameData() {
  try {
    const response = await fetch("data.json");
    _data = await response.json();
    const textureLoader = new THREE.TextureLoader();
    const loadImagePromises = _data.assets.images.map((img) => {
      return new Promise((resolve, reject) => {
        textureLoader.load(
          img.path,
          (texture) => {
            _textures.set(img.name, texture);
            resolve();
          },
          void 0,
          // progress callback
          (err) => {
            console.error(`Error loading image: ${img.path}`, err);
            reject(err);
          }
        );
      });
    });
    const loadSoundPromises = _data.assets.sounds.map((sound) => {
      return fetch(sound.path).then((res) => res.arrayBuffer()).then((arrayBuffer) => _audioContext.decodeAudioData(arrayBuffer)).then((audioBuffer) => {
        _audioBuffers.set(sound.name, audioBuffer);
      }).catch((err) => console.error(`Error loading sound: ${sound.path}`, err));
    });
    await Promise.all([...loadImagePromises, ...loadSoundPromises]);
    console.log("All assets loaded.");
  } catch (error) {
    console.error("Failed to load game data or assets:", error);
    alert("Failed to load game data. See console for details.");
    _data = null;
  }
}
function createText(text, size, yOffset, color, font) {
  const textGeometry = new TextGeometry(text, {
    font,
    size,
    depth: 0.1,
    // Changed 'height' to 'depth'
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
  const bbox = textGeometry.boundingBox;
  const width = bbox.max.x - bbox.min.x;
  mesh.position.set(-width / 2, yOffset, 5);
  return mesh;
}
function showTitleScreen() {
  if (!_data) return;
  disposeUI(_titleTextMesh);
  disposeUI(_startButtonTextMesh);
  disposeUI(_gameOverTextMesh);
  _titleTextMesh = _startButtonTextMesh = _gameOverTextMesh = null;
  const fontLoader = new FontLoader();
  fontLoader.load("https://threejs.org/examples/fonts/helvetiker_regular.typeface.json", function(font) {
    _titleTextMesh = createText(_data.gameConfig.ui.titleText, 1, 2, _data.gameConfig.colors.uiText || "#FFFFFF", font);
    _startButtonTextMesh = createText(_data.gameConfig.ui.startButtonText, 0.5, 0, _data.gameConfig.colors.uiText || "#FFFFFF", font);
    _scene.add(_titleTextMesh);
    _scene.add(_startButtonTextMesh);
  });
  if (_bgmSource) {
    stopSound(_bgmSource);
    _bgmSource = null;
  }
  _bgmSource = playSound("bgm", true, _data.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.5);
}
function disposeUI(mesh) {
  if (mesh) {
    _scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
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
  _gameState = 1 /* PLAYING */;
}
function resetGame() {
  _blocks.forEach((b) => {
    _scene.remove(b.mesh);
    _world.removeBody(b.body);
  });
  _blocks.length = 0;
  _bombs.forEach((b) => {
    _scene.remove(b.mesh);
    _world.removeBody(b.body);
  });
  _bombs.length = 0;
  _explosions.forEach((e) => e.remove());
  _explosions.length = 0;
  _powerUps.forEach((p) => {
    _scene.remove(p.mesh);
    _world.removeBody(p.body);
  });
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
  const wallTexture = _textures.get("wall");
  const destructibleTexture = _textures.get("destructible_block");
  const playerTexture = _textures.get("player");
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const char = initialMap[y][x];
      const [worldX, worldY, worldZBase] = getGridPosition(x, y);
      let mesh;
      let body;
      if (char === "W") {
        const geometry = new THREE.BoxGeometry(tileSize, tileSize, tileSize);
        const material = new THREE.MeshLambertMaterial({ map: wallTexture, color: new THREE.Color(config.colors.wall || "#808080") });
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(worldX, worldY, worldZBase + tileSize / 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        _scene.add(mesh);
        const shape = new CANNON.Box(new CANNON.Vec3(tileSize / 2, tileSize / 2, tileSize / 2));
        body = new CANNON.Body({
          mass: 0,
          // Static
          position: new CANNON.Vec3(worldX, worldY, worldZBase + tileSize / 2),
          shape,
          material: new CANNON.Material("wallMaterial")
        });
        _world.addBody(body);
        _blocks.push({ mesh, body, isDestructible: false, gridX: x, gridY: y });
      } else if (char === "D") {
        const geometry = new THREE.BoxGeometry(tileSize, tileSize, tileSize);
        const material = new THREE.MeshLambertMaterial({ map: destructibleTexture, color: new THREE.Color(config.colors.destructible || "#A0522D") });
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(worldX, worldY, worldZBase + tileSize / 2);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        _scene.add(mesh);
        const shape = new CANNON.Box(new CANNON.Vec3(tileSize / 2, tileSize / 2, tileSize / 2));
        body = new CANNON.Body({
          mass: 0,
          // Static
          position: new CANNON.Vec3(worldX, worldY, worldZBase + tileSize / 2),
          shape,
          material: new CANNON.Material("destructibleMaterial")
        });
        _world.addBody(body);
        _blocks.push({ mesh, body, isDestructible: true, gridX: x, gridY: y });
      } else if (char === "P" && !_player) {
        _player = new Player(x, y, config, playerTexture);
      }
    }
  }
}
function onWindowResize() {
  _camera.aspect = window.innerWidth / window.innerHeight;
  _camera.updateProjectionMatrix();
  _renderer.setSize(window.innerWidth, window.innerHeight);
}
function onKeyDown(event) {
  _keysPressed.add(event.key.toLowerCase());
  if (_gameState === 0 /* TITLE */ && event.key.toLowerCase() === " ") {
    startGame();
    _keysPressed.delete(" ");
  }
  if ((_gameState === 3 /* GAME_OVER_LOSE */ || _gameState === 2 /* GAME_OVER_WIN */) && event.key.toLowerCase() === "r") {
    _gameState = 0 /* TITLE */;
    showTitleScreen();
    _keysPressed.delete("r");
  }
}
function onKeyUp(event) {
  _keysPressed.delete(event.key.toLowerCase());
}
function animate(currentTime) {
  requestAnimationFrame(animate);
  const deltaTime = (currentTime - _lastTime) / 1e3;
  _lastTime = currentTime;
  if (!_data) {
    _renderer.render(_scene, _camera);
    return;
  }
  _world.step(1 / 60, deltaTime, 3);
  if (_gameState === 1 /* PLAYING */) {
    if (_player) {
      _player.update(deltaTime);
    } else {
      _gameState = 3 /* GAME_OVER_LOSE */;
    }
    for (let i = _bombs.length - 1; i >= 0; i--) {
      _bombs[i].update(deltaTime);
    }
    for (let i = _explosions.length - 1; i >= 0; i--) {
      _explosions[i].update(deltaTime);
    }
    const remainingDestructibleBlocks = _blocks.filter((b) => b.isDestructible).length;
    if (remainingDestructibleBlocks === 0 && _gameState === 1 /* PLAYING */) {
      _gameState = 2 /* GAME_OVER_WIN */;
      playSound("game_win_sound", false, _data.assets.sounds.find((s) => s.name === "game_win_sound")?.volume || 1);
    }
  } else if (_gameState === 3 /* GAME_OVER_LOSE */ || _gameState === 2 /* GAME_OVER_WIN */) {
    if (!_gameOverTextMesh) {
      disposeUI(_titleTextMesh);
      disposeUI(_startButtonTextMesh);
      _titleTextMesh = _startButtonTextMesh = null;
      const fontLoader = new FontLoader();
      fontLoader.load("https://threejs.org/examples/fonts/helvetiker_regular.typeface.json", function(font) {
        const text = _gameState === 2 /* GAME_OVER_WIN */ ? _data.gameConfig.ui.winText : _data.gameConfig.ui.gameOverText;
        const color = _gameState === 2 /* GAME_OVER_WIN */ ? "#00FF00" : "#FF0000";
        _gameOverTextMesh = createText(text + "\nPress R to Restart", 1, 0, color, font);
        _scene.add(_gameOverTextMesh);
      });
      if (_bgmSource) {
        stopSound(_bgmSource);
        _bgmSource = null;
      }
    }
  }
  _renderer.render(_scene, _camera);
}
initGame();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuaW1wb3J0IHsgRm9udExvYWRlciB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS9sb2FkZXJzL0ZvbnRMb2FkZXIuanMnO1xyXG5pbXBvcnQgeyBUZXh0R2VvbWV0cnkgfSBmcm9tICd0aHJlZS9leGFtcGxlcy9qc20vZ2VvbWV0cmllcy9UZXh0R2VvbWV0cnkuanMnO1xyXG5cclxuLy8gLS0tIEdhbWUgQ29uZmlndXJhdGlvbiAmIERhdGEgU3RydWN0dXJlcyAoZnJvbSBkYXRhLmpzb24pIC0tLVxyXG5pbnRlcmZhY2UgQXNzZXRJbWFnZSB7XHJcbiAgICBuYW1lOiBzdHJpbmc7XHJcbiAgICBwYXRoOiBzdHJpbmc7XHJcbiAgICB3aWR0aDogbnVtYmVyO1xyXG4gICAgaGVpZ2h0OiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBBc3NldFNvdW5kIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhdGg6IHN0cmluZztcclxuICAgIGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjtcclxuICAgIHZvbHVtZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZUNvbmZpZyB7XHJcbiAgICB0aWxlU2l6ZTogbnVtYmVyO1xyXG4gICAgbWFwV2lkdGg6IG51bWJlcjsgLy8gaW4gdGlsZXNcclxuICAgIG1hcEhlaWdodDogbnVtYmVyOyAvLyBpbiB0aWxlc1xyXG4gICAgcGxheWVyU3BlZWQ6IG51bWJlcjsgLy8gdW5pdHMgcGVyIHNlY29uZFxyXG4gICAgYm9tYkZ1c2VUaW1lOiBudW1iZXI7IC8vIHNlY29uZHNcclxuICAgIGV4cGxvc2lvblJhbmdlOiBudW1iZXI7IC8vIHRpbGVzIChob3cgbWFueSB0aWxlcyBvdXQgZnJvbSBjZW50ZXIpXHJcbiAgICBtYXhCb21iczogbnVtYmVyOyAvLyBpbml0aWFsIG1heCBib21icyBwbGF5ZXIgY2FuIHBsYWNlXHJcbiAgICBwb3dlclVwU3Bhd25DaGFuY2U6IG51bWJlcjsgLy8gMC0xIGNoYW5jZSBmb3IgcG93ZXItdXAgZnJvbSBkZXN0cnVjdGlibGUgYmxvY2tcclxuICAgIGluaXRpYWxNYXA6IHN0cmluZ1tdOyAvLyAnVyc6IFdhbGwsICdEJzogRGVzdHJ1Y3RpYmxlLCAnRSc6IEVtcHR5LCAnUCc6IFBsYXllclxyXG4gICAgY29sb3JzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9OyAvLyBIZXggY29sb3JzIGZvciBtZXNoZXNcclxuICAgIGNhbWVyYToge1xyXG4gICAgICAgIHBvc2l0aW9uOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XHJcbiAgICAgICAgbG9va0F0OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07XHJcbiAgICB9O1xyXG4gICAgdWk6IHtcclxuICAgICAgICB0aXRsZVRleHQ6IHN0cmluZztcclxuICAgICAgICBzdGFydEJ1dHRvblRleHQ6IHN0cmluZztcclxuICAgICAgICBnYW1lT3ZlclRleHQ6IHN0cmluZztcclxuICAgICAgICB3aW5UZXh0OiBzdHJpbmc7XHJcbiAgICB9O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgR2FtZURhdGEge1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiBBc3NldEltYWdlW107XHJcbiAgICAgICAgc291bmRzOiBBc3NldFNvdW5kW107XHJcbiAgICB9O1xyXG4gICAgZ2FtZUNvbmZpZzogR2FtZUNvbmZpZztcclxufVxyXG5cclxuLy8gLS0tIEdsb2JhbCBHYW1lIFN0YXRlICYgUmVzb3VyY2VzIC0tLVxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVJfV0lOLFxyXG4gICAgR0FNRV9PVkVSX0xPU0UsXHJcbn1cclxuXHJcbmxldCBfZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbmxldCBfZGF0YTogR2FtZURhdGEgfCBudWxsID0gbnVsbDtcclxuXHJcbi8vIFRocmVlLmpzXHJcbmxldCBfc2NlbmU6IFRIUkVFLlNjZW5lO1xyXG5sZXQgX2NhbWVyYTogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbmxldCBfcmVuZGVyZXI6IFRIUkVFLldlYkdMUmVuZGVyZXI7XHJcbmxldCBfY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuXHJcbi8vIENhbm5vbi5qc1xyXG5sZXQgX3dvcmxkOiBDQU5OT04uV29ybGQ7XHJcblxyXG4vLyBBc3NldHNcclxuY29uc3QgX3RleHR1cmVzID0gbmV3IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+KCk7XHJcbmNvbnN0IF9hdWRpb0J1ZmZlcnMgPSBuZXcgTWFwPHN0cmluZywgQXVkaW9CdWZmZXI+KCk7XHJcbmNvbnN0IF9hdWRpb0NvbnRleHQgPSBuZXcgKHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgKHdpbmRvdyBhcyBhbnkpLndlYmtpdEF1ZGlvQ29udGV4dCkoKTtcclxubGV0IF9iZ21Tb3VyY2U6IEF1ZGlvQnVmZmVyU291cmNlTm9kZSB8IG51bGwgPSBudWxsO1xyXG5cclxuLy8gR2FtZSBPYmplY3RzXHJcbmxldCBfcGxheWVyOiBQbGF5ZXIgfCBudWxsID0gbnVsbDtcclxuY29uc3QgX2JvbWJzOiBCb21iW10gPSBbXTtcclxuY29uc3QgX2V4cGxvc2lvbnM6IEV4cGxvc2lvbltdID0gW107XHJcbmNvbnN0IF9wb3dlclVwczogUG93ZXJVcFtdID0gW107XHJcbmNvbnN0IF9ibG9ja3M6IHsgbWVzaDogVEhSRUUuTWVzaDsgYm9keTogQ0FOTk9OLkJvZHk7IGlzRGVzdHJ1Y3RpYmxlOiBib29sZWFuOyBncmlkWDogbnVtYmVyOyBncmlkWTogbnVtYmVyIH1bXSA9IFtdO1xyXG5cclxuLy8gSW5wdXRcclxuY29uc3QgX2tleXNQcmVzc2VkID0gbmV3IFNldDxzdHJpbmc+KCk7XHJcbmxldCBfbGFzdFRpbWUgPSAwO1xyXG5cclxuLy8gVUkgRWxlbWVudHMgKGZvciB0aXRsZS9nYW1lIG92ZXIgc2NyZWVuLCBUZXh0R2VvbWV0cnkgaXMgYXN5bmMgdG8gbG9hZCBmb250KVxyXG5sZXQgX3RpdGxlVGV4dE1lc2g6IFRIUkVFLk1lc2ggfCBudWxsID0gbnVsbDtcclxubGV0IF9zdGFydEJ1dHRvblRleHRNZXNoOiBUSFJFRS5NZXNoIHwgbnVsbCA9IG51bGw7XHJcbmxldCBfZ2FtZU92ZXJUZXh0TWVzaDogVEhSRUUuTWVzaCB8IG51bGwgPSBudWxsO1xyXG5cclxuXHJcbi8vIC0tLSBIZWxwZXIgRnVuY3Rpb25zIC0tLVxyXG5mdW5jdGlvbiBwbGF5U291bmQobmFtZTogc3RyaW5nLCBsb29wOiBib29sZWFuID0gZmFsc2UsIHZvbHVtZTogbnVtYmVyID0gMS4wKTogQXVkaW9CdWZmZXJTb3VyY2VOb2RlIHwgbnVsbCB7XHJcbiAgICBjb25zdCBidWZmZXIgPSBfYXVkaW9CdWZmZXJzLmdldChuYW1lKTtcclxuICAgIGlmIChidWZmZXIpIHtcclxuICAgICAgICBjb25zdCBzb3VyY2UgPSBfYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgIHNvdXJjZS5idWZmZXIgPSBidWZmZXI7XHJcbiAgICAgICAgY29uc3QgZ2Fpbk5vZGUgPSBfYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcclxuICAgICAgICBnYWluTm9kZS5nYWluLnZhbHVlID0gdm9sdW1lO1xyXG4gICAgICAgIHNvdXJjZS5jb25uZWN0KGdhaW5Ob2RlKTtcclxuICAgICAgICBnYWluTm9kZS5jb25uZWN0KF9hdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xyXG4gICAgICAgIHNvdXJjZS5sb29wID0gbG9vcDtcclxuICAgICAgICBzb3VyY2Uuc3RhcnQoMCk7XHJcbiAgICAgICAgcmV0dXJuIHNvdXJjZTtcclxuICAgIH1cclxuICAgIGNvbnNvbGUud2FybihgU291bmQgJyR7bmFtZX0nIG5vdCBmb3VuZC5gKTtcclxuICAgIHJldHVybiBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzdG9wU291bmQoc291cmNlOiBBdWRpb0J1ZmZlclNvdXJjZU5vZGUgfCBudWxsKSB7XHJcbiAgICBpZiAoc291cmNlKSB7XHJcbiAgICAgICAgc291cmNlLnN0b3AoKTtcclxuICAgICAgICBzb3VyY2UuZGlzY29ubmVjdCgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRHcmlkUG9zaXRpb24oZ3JpZFg6IG51bWJlciwgZ3JpZFk6IG51bWJlcik6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XHJcbiAgICBpZiAoIV9kYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJHYW1lIGRhdGEgbm90IGxvYWRlZC5cIik7XHJcbiAgICBjb25zdCB0aWxlU2l6ZSA9IF9kYXRhLmdhbWVDb25maWcudGlsZVNpemU7XHJcbiAgICBjb25zdCBtYXBXaWR0aCA9IF9kYXRhLmdhbWVDb25maWcubWFwV2lkdGg7XHJcbiAgICBjb25zdCBtYXBIZWlnaHQgPSBfZGF0YS5nYW1lQ29uZmlnLm1hcEhlaWdodDtcclxuXHJcbiAgICAvLyBDYWxjdWxhdGUgd29ybGQgWCwgWSwgWiBiYXNlZCBvbiBncmlkLCBjZW50ZXJlZCBvbiBtYXBcclxuICAgIC8vIEFzc3VtaW5nICgwLDAsMCkgaXMgY2VudGVyIG9mIHRoZSBtYXAsIGFuZCBYLVkgaXMgaG9yaXpvbnRhbCBwbGFuZSwgWiBpcyB2ZXJ0aWNhbC5cclxuICAgIGNvbnN0IHggPSAoZ3JpZFggLSAobWFwV2lkdGggLSAxKSAvIDIpICogdGlsZVNpemU7XHJcbiAgICBjb25zdCB5ID0gKGdyaWRZIC0gKG1hcEhlaWdodCAtIDEpIC8gMikgKiB0aWxlU2l6ZTtcclxuICAgIHJldHVybiBbeCwgeSwgMF07IC8vIHotY29vcmRpbmF0ZSBpcyBiYXNlIG9mIHRoZSBncmlkIGNlbGxcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0R3JpZENlbGwod29ybGRYOiBudW1iZXIsIHdvcmxkWTogbnVtYmVyKTogW251bWJlciwgbnVtYmVyXSB7XHJcbiAgICBpZiAoIV9kYXRhKSB0aHJvdyBuZXcgRXJyb3IoXCJHYW1lIGRhdGEgbm90IGxvYWRlZC5cIik7XHJcbiAgICBjb25zdCB0aWxlU2l6ZSA9IF9kYXRhLmdhbWVDb25maWcudGlsZVNpemU7XHJcbiAgICBjb25zdCBtYXBXaWR0aCA9IF9kYXRhLmdhbWVDb25maWcubWFwV2lkdGg7XHJcbiAgICBjb25zdCBtYXBIZWlnaHQgPSBfZGF0YS5nYW1lQ29uZmlnLm1hcEhlaWdodDtcclxuXHJcbiAgICBjb25zdCBncmlkWCA9IE1hdGgucm91bmQod29ybGRYIC8gdGlsZVNpemUgKyAobWFwV2lkdGggLSAxKSAvIDIpO1xyXG4gICAgY29uc3QgZ3JpZFkgPSBNYXRoLnJvdW5kKHdvcmxkWSAvIHRpbGVTaXplICsgKG1hcEhlaWdodCAtIDEpIC8gMik7XHJcbiAgICByZXR1cm4gW2dyaWRYLCBncmlkWV07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEJsb2NrQXQoZ3JpZFg6IG51bWJlciwgZ3JpZFk6IG51bWJlcikge1xyXG4gICAgcmV0dXJuIF9ibG9ja3MuZmluZChiID0+IGIuZ3JpZFggPT09IGdyaWRYICYmIGIuZ3JpZFkgPT09IGdyaWRZKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0Qm9tYkF0KGdyaWRYOiBudW1iZXIsIGdyaWRZOiBudW1iZXIpIHtcclxuICAgIHJldHVybiBfYm9tYnMuZmluZChiID0+IGIuZ3JpZFggPT09IGdyaWRYICYmIGIuZ3JpZFkgPT09IGdyaWRZKTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVtb3ZlQmxvY2soYmxvY2s6IHsgbWVzaDogVEhSRUUuTWVzaDsgYm9keTogQ0FOTk9OLkJvZHk7IGlzRGVzdHJ1Y3RpYmxlOiBib29sZWFuOyBncmlkWDogbnVtYmVyOyBncmlkWTogbnVtYmVyIH0pIHtcclxuICAgIF9zY2VuZS5yZW1vdmUoYmxvY2subWVzaCk7XHJcbiAgICBfd29ybGQucmVtb3ZlQm9keShibG9jay5ib2R5KTtcclxuICAgIGNvbnN0IGluZGV4ID0gX2Jsb2Nrcy5pbmRleE9mKGJsb2NrKTtcclxuICAgIGlmIChpbmRleCA+IC0xKSB7XHJcbiAgICAgICAgX2Jsb2Nrcy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyAtLS0gR2FtZSBPYmplY3QgQ2xhc3NlcyAtLS1cclxuXHJcbmNsYXNzIFBsYXllciB7XHJcbiAgICBtZXNoOiBUSFJFRS5NZXNoO1xyXG4gICAgYm9keTogQ0FOTk9OLkJvZHk7XHJcbiAgICBncmlkWDogbnVtYmVyO1xyXG4gICAgZ3JpZFk6IG51bWJlcjtcclxuICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICBtYXhCb21iczogbnVtYmVyO1xyXG4gICAgY3VycmVudEJvbWJzOiBudW1iZXI7XHJcbiAgICBib21iUmFuZ2U6IG51bWJlcjtcclxuICAgIGlzQWxpdmU6IGJvb2xlYW47XHJcbiAgICB0YXJnZXRHcmlkWDogbnVtYmVyO1xyXG4gICAgdGFyZ2V0R3JpZFk6IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihpbml0aWFsR3JpZFg6IG51bWJlciwgaW5pdGlhbEdyaWRZOiBudW1iZXIsIGNvbmZpZzogR2FtZUNvbmZpZywgdGV4dHVyZTogVEhSRUUuVGV4dHVyZSkge1xyXG4gICAgICAgIHRoaXMuZ3JpZFggPSBpbml0aWFsR3JpZFg7XHJcbiAgICAgICAgdGhpcy5ncmlkWSA9IGluaXRpYWxHcmlkWTtcclxuICAgICAgICB0aGlzLnNwZWVkID0gY29uZmlnLnBsYXllclNwZWVkO1xyXG4gICAgICAgIHRoaXMubWF4Qm9tYnMgPSBjb25maWcubWF4Qm9tYnM7XHJcbiAgICAgICAgdGhpcy5jdXJyZW50Qm9tYnMgPSAwO1xyXG4gICAgICAgIHRoaXMuYm9tYlJhbmdlID0gY29uZmlnLmV4cGxvc2lvblJhbmdlO1xyXG4gICAgICAgIHRoaXMuaXNBbGl2ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy50YXJnZXRHcmlkWCA9IGluaXRpYWxHcmlkWDtcclxuICAgICAgICB0aGlzLnRhcmdldEdyaWRZID0gaW5pdGlhbEdyaWRZO1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJTaXplID0gY29uZmlnLnRpbGVTaXplICogMC44O1xyXG4gICAgICAgIGNvbnN0IFt4LCB5LCB6QmFzZV0gPSBnZXRHcmlkUG9zaXRpb24oaW5pdGlhbEdyaWRYLCBpbml0aWFsR3JpZFkpO1xyXG4gICAgICAgIGNvbnN0IHogPSB6QmFzZSArIHBsYXllclNpemUgLyAyOyAvLyBQb3NpdGlvbiBwbGF5ZXIgYWJvdmUgdGhlIGdyb3VuZFxyXG5cclxuICAgICAgICAvLyBUaHJlZS5qcyBNZXNoXHJcbiAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkocGxheWVyU2l6ZSwgcGxheWVyU2l6ZSwgcGxheWVyU2l6ZSk7XHJcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSwgY29sb3I6IG5ldyBUSFJFRS5Db2xvcihjb25maWcuY29sb3JzLnBsYXllciB8fCAnI0ZGMDAwMCcpIH0pO1xyXG4gICAgICAgIHRoaXMubWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5tZXNoLnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcclxuICAgICAgICB0aGlzLm1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgX3NjZW5lLmFkZCh0aGlzLm1lc2gpO1xyXG5cclxuICAgICAgICAvLyBDYW5ub24uanMgQm9keVxyXG4gICAgICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKHBsYXllclNpemUgLyAyLCBwbGF5ZXJTaXplIC8gMiwgcGxheWVyU2l6ZSAvIDIpKTsgLy8gQ2Fubm9uIHVzZXMgaGFsZi1leHRlbnRzXHJcbiAgICAgICAgdGhpcy5ib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogNSxcclxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyh4LCB5LCB6KSxcclxuICAgICAgICAgICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgICAgICAgICBmaXhlZFJvdGF0aW9uOiB0cnVlLCAvLyBQcmV2ZW50IHBsYXllciBmcm9tIHRpcHBpbmcgb3ZlclxyXG4gICAgICAgICAgICBtYXRlcmlhbDogbmV3IENBTk5PTi5NYXRlcmlhbCgncGxheWVyTWF0ZXJpYWwnKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIF93b3JsZC5hZGRCb2R5KHRoaXMuYm9keSk7XHJcblxyXG4gICAgICAgIHRoaXMuYm9keS5hZGRFdmVudExpc3RlbmVyKCdjb2xsaWRlJywgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgb3RoZXJCb2R5ID0gZXZlbnQuYm9keTtcclxuICAgICAgICAgICAgY29uc3QgcG93ZXJVcCA9IF9wb3dlclVwcy5maW5kKHAgPT4gcC5ib2R5ID09PSBvdGhlckJvZHkpO1xyXG4gICAgICAgICAgICBpZiAocG93ZXJVcCkge1xyXG4gICAgICAgICAgICAgICAgcG93ZXJVcC5hcHBseUVmZmVjdCh0aGlzKTtcclxuICAgICAgICAgICAgICAgIHBvd2VyVXAucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICBwbGF5U291bmQoJ3Bvd2VydXBfc291bmQnLCBmYWxzZSwgX2RhdGEhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ3Bvd2VydXBfc291bmQnKT8udm9sdW1lIHx8IDEuMCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNBbGl2ZSB8fCAhX2RhdGEpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gU3luYyBtZXNoIHRvIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIHRoaXMubWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMuYm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgIHRoaXMubWVzaC5xdWF0ZXJuaW9uLmNvcHkodGhpcy5ib2R5LnF1YXRlcm5pb24gYXMgYW55KTtcclxuXHJcbiAgICAgICAgbGV0IGlucHV0WCA9IDA7XHJcbiAgICAgICAgbGV0IGlucHV0WSA9IDA7XHJcbiAgICAgICAgaWYgKF9rZXlzUHJlc3NlZC5oYXMoJ2Fycm93dXAnKSB8fCBfa2V5c1ByZXNzZWQuaGFzKCd3JykpIGlucHV0WSsrO1xyXG4gICAgICAgIGlmIChfa2V5c1ByZXNzZWQuaGFzKCdhcnJvd2Rvd24nKSB8fCBfa2V5c1ByZXNzZWQuaGFzKCdzJykpIGlucHV0WS0tO1xyXG4gICAgICAgIGlmIChfa2V5c1ByZXNzZWQuaGFzKCdhcnJvd2xlZnQnKSB8fCBfa2V5c1ByZXNzZWQuaGFzKCdhJykpIGlucHV0WC0tO1xyXG4gICAgICAgIGlmIChfa2V5c1ByZXNzZWQuaGFzKCdhcnJvd3JpZ2h0JykgfHwgX2tleXNQcmVzc2VkLmhhcygnZCcpKSBpbnB1dFgrKztcclxuXHJcbiAgICAgICAgY29uc3QgY3VycmVudFdvcmxkUG9zID0gdGhpcy5ib2R5LnBvc2l0aW9uO1xyXG4gICAgICAgIGNvbnN0IFtjdXJyZW50R3JpZFgsIGN1cnJlbnRHcmlkWV0gPSBnZXRHcmlkQ2VsbChjdXJyZW50V29ybGRQb3MueCwgY3VycmVudFdvcmxkUG9zLnkpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgdGFyZ2V0IGdyaWQgYmFzZWQgb24gaW5wdXQgaWYgbm90IGN1cnJlbnRseSBtb3ZpbmcgdG8gYSB0YXJnZXRcclxuICAgICAgICBpZiAoaW5wdXRYICE9PSAwIHx8IGlucHV0WSAhPT0gMCkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy50YXJnZXRHcmlkWCA9PT0gY3VycmVudEdyaWRYICYmIHRoaXMudGFyZ2V0R3JpZFkgPT09IGN1cnJlbnRHcmlkWSkgeyAvLyBPbmx5IHNldCBuZXcgdGFyZ2V0IGlmIGF0IGN1cnJlbnQgdGFyZ2V0XHJcbiAgICAgICAgICAgICAgICBjb25zdCBuZXdUYXJnZXRYID0gY3VycmVudEdyaWRYICsgaW5wdXRYO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbmV3VGFyZ2V0WSA9IGN1cnJlbnRHcmlkWSArIGlucHV0WTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBpc0Jsb2NrZWQgPSBfYmxvY2tzLnNvbWUoYiA9PiBiLmdyaWRYID09PSBuZXdUYXJnZXRYICYmIGIuZ3JpZFkgPT09IG5ld1RhcmdldFkpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF9ib21icy5zb21lKGIgPT4gYi5ncmlkWCA9PT0gbmV3VGFyZ2V0WCAmJiBiLmdyaWRZID09PSBuZXdUYXJnZXRZKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoIWlzQmxvY2tlZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFyZ2V0R3JpZFggPSBuZXdUYXJnZXRYO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGFyZ2V0R3JpZFkgPSBuZXdUYXJnZXRZO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNb3ZlIHRvd2FyZHMgdGFyZ2V0IGdyaWQgcG9zaXRpb25cclxuICAgICAgICBjb25zdCBbdGFyZ2V0V29ybGRYLCB0YXJnZXRXb3JsZFksIHRhcmdldFpdID0gZ2V0R3JpZFBvc2l0aW9uKHRoaXMudGFyZ2V0R3JpZFgsIHRoaXMudGFyZ2V0R3JpZFkpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldFdvcmxkUG9zID0gbmV3IENBTk5PTi5WZWMzKHRhcmdldFdvcmxkWCwgdGFyZ2V0V29ybGRZLCBjdXJyZW50V29ybGRQb3Mueik7XHJcbiAgICAgICAgY29uc3QgZGlzdGFuY2VUb1RhcmdldCA9IGN1cnJlbnRXb3JsZFBvcy5kaXN0YW5jZVRvKHRhcmdldFdvcmxkUG9zKTtcclxuXHJcbiAgICAgICAgaWYgKGRpc3RhbmNlVG9UYXJnZXQgPiAwLjEpIHsgLy8gU3RpbGwgbW92aW5nIHRvIHRhcmdldFxyXG4gICAgICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICAgICAgICAgICAgdGFyZ2V0V29ybGRQb3MudnN1YihjdXJyZW50V29ybGRQb3MsIGRpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIGRpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuICAgICAgICAgICAgdGhpcy5ib2R5LnZlbG9jaXR5LnggPSBkaXJlY3Rpb24ueCAqIHRoaXMuc3BlZWQ7XHJcbiAgICAgICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS55ID0gZGlyZWN0aW9uLnkgKiB0aGlzLnNwZWVkO1xyXG4gICAgICAgIH0gZWxzZSB7IC8vIFJlYWNoZWQgdGFyZ2V0LCBzbmFwIGFuZCBzdG9wIGhvcml6b250YWwgbW92ZW1lbnRcclxuICAgICAgICAgICAgdGhpcy5ib2R5LnBvc2l0aW9uLnggPSB0YXJnZXRXb3JsZFg7XHJcbiAgICAgICAgICAgIHRoaXMuYm9keS5wb3NpdGlvbi55ID0gdGFyZ2V0V29ybGRZO1xyXG4gICAgICAgICAgICB0aGlzLmJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS55ID0gMDtcclxuICAgICAgICAgICAgdGhpcy5ncmlkWCA9IHRoaXMudGFyZ2V0R3JpZFg7XHJcbiAgICAgICAgICAgIHRoaXMuZ3JpZFkgPSB0aGlzLnRhcmdldEdyaWRZO1xyXG4gICAgICAgIH1cclxuXHJcblxyXG4gICAgICAgIC8vIFBsYWNlIGJvbWJcclxuICAgICAgICBpZiAoX2tleXNQcmVzc2VkLmhhcygnICcpKSB7IC8vIFNwYWNlYmFyXHJcbiAgICAgICAgICAgIHRoaXMucGxhY2VCb21iKCk7XHJcbiAgICAgICAgICAgIF9rZXlzUHJlc3NlZC5kZWxldGUoJyAnKTsgLy8gQ29uc3VtZSB0aGUgaW5wdXRcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcGxhY2VCb21iKCkge1xyXG4gICAgICAgIGlmICh0aGlzLmN1cnJlbnRCb21icyA8IHRoaXMubWF4Qm9tYnMgJiYgX2RhdGEpIHtcclxuICAgICAgICAgICAgY29uc3QgW2JvbWJHcmlkWCwgYm9tYkdyaWRZXSA9IGdldEdyaWRDZWxsKHRoaXMubWVzaC5wb3NpdGlvbi54LCB0aGlzLm1lc2gucG9zaXRpb24ueSk7IC8vIFVzZSBwbGF5ZXIncyBjdXJyZW50IGdyaWQgY2VsbFxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gUHJldmVudCBwbGFjaW5nIGJvbWIgb24gZXhpc3RpbmcgYm9tYlxyXG4gICAgICAgICAgICBpZiAoZ2V0Qm9tYkF0KGJvbWJHcmlkWCwgYm9tYkdyaWRZKSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgYm9tYiA9IG5ldyBCb21iKGJvbWJHcmlkWCwgYm9tYkdyaWRZLCBfZGF0YS5nYW1lQ29uZmlnLCBfdGV4dHVyZXMuZ2V0KCdib21iJykhLCB0aGlzKTtcclxuICAgICAgICAgICAgX2JvbWJzLnB1c2goYm9tYik7XHJcbiAgICAgICAgICAgIHRoaXMuY3VycmVudEJvbWJzKys7XHJcbiAgICAgICAgICAgIHBsYXlTb3VuZCgnYm9tYl9wbGFudF9zb3VuZCcsIGZhbHNlLCBfZGF0YS5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdib21iX3BsYW50X3NvdW5kJyk/LnZvbHVtZSB8fCAxLjApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5pc0FsaXZlKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5pc0FsaXZlID0gZmFsc2U7XHJcbiAgICAgICAgX3NjZW5lLnJlbW92ZSh0aGlzLm1lc2gpO1xyXG4gICAgICAgIF93b3JsZC5yZW1vdmVCb2R5KHRoaXMuYm9keSk7XHJcbiAgICAgICAgX3BsYXllciA9IG51bGw7IC8vIFJlbW92ZSBwbGF5ZXIgcmVmZXJlbmNlXHJcbiAgICAgICAgX2dhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRTtcclxuICAgICAgICBwbGF5U291bmQoJ3BsYXllcl9kZWF0aF9zb3VuZCcsIGZhbHNlLCBfZGF0YSEuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAncGxheWVyX2RlYXRoX3NvdW5kJyk/LnZvbHVtZSB8fCAxLjApO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBCb21iIHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIGdyaWRYOiBudW1iZXI7XHJcbiAgICBncmlkWTogbnVtYmVyO1xyXG4gICAgZnVzZVRpbWU6IG51bWJlcjtcclxuICAgIHRpbWVyOiBudW1iZXI7XHJcbiAgICBleHBsb3Npb25SYW5nZTogbnVtYmVyO1xyXG4gICAgZXhwbG9kZWQ6IGJvb2xlYW47XHJcbiAgICBwYXJlbnRQbGF5ZXI6IFBsYXllciB8IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoZ3JpZFg6IG51bWJlciwgZ3JpZFk6IG51bWJlciwgY29uZmlnOiBHYW1lQ29uZmlnLCB0ZXh0dXJlOiBUSFJFRS5UZXh0dXJlLCBwYXJlbnRQbGF5ZXI6IFBsYXllciB8IG51bGwgPSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy5ncmlkWCA9IGdyaWRYO1xyXG4gICAgICAgIHRoaXMuZ3JpZFkgPSBncmlkWTtcclxuICAgICAgICB0aGlzLmZ1c2VUaW1lID0gY29uZmlnLmJvbWJGdXNlVGltZTtcclxuICAgICAgICB0aGlzLnRpbWVyID0gdGhpcy5mdXNlVGltZTtcclxuICAgICAgICB0aGlzLmV4cGxvc2lvblJhbmdlID0gY29uZmlnLmV4cGxvc2lvblJhbmdlO1xyXG4gICAgICAgIHRoaXMuZXhwbG9kZWQgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLnBhcmVudFBsYXllciA9IHBhcmVudFBsYXllcjtcclxuXHJcbiAgICAgICAgY29uc3QgW3gsIHksIHpCYXNlXSA9IGdldEdyaWRQb3NpdGlvbihncmlkWCwgZ3JpZFkpO1xyXG4gICAgICAgIGNvbnN0IGJvbWJTaXplID0gY29uZmlnLnRpbGVTaXplICogMC43O1xyXG4gICAgICAgIGNvbnN0IHogPSB6QmFzZSArIGJvbWJTaXplIC8gMjtcclxuXHJcbiAgICAgICAgLy8gVGhyZWUuanMgTWVzaFxyXG4gICAgICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KGJvbWJTaXplIC8gMiwgMTYsIDE2KTtcclxuICAgICAgICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgbWFwOiB0ZXh0dXJlLCBjb2xvcjogbmV3IFRIUkVFLkNvbG9yKGNvbmZpZy5jb2xvcnMuYm9tYiB8fCAnIzAwMDBGRicpIH0pO1xyXG4gICAgICAgIHRoaXMubWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5tZXNoLnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcclxuICAgICAgICB0aGlzLm1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgX3NjZW5lLmFkZCh0aGlzLm1lc2gpO1xyXG5cclxuICAgICAgICAvLyBDYW5ub24uanMgQm9keSAoU3RhdGljIHRvIGJsb2NrIG1vdmVtZW50KVxyXG4gICAgICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoYm9tYlNpemUgLyAyKTtcclxuICAgICAgICB0aGlzLmJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLCAvLyBTdGF0aWNcclxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyh4LCB5LCB6KSxcclxuICAgICAgICAgICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogbmV3IENBTk5PTi5NYXRlcmlhbCgnYm9tYk1hdGVyaWFsJylcclxuICAgICAgICB9KTtcclxuICAgICAgICBfd29ybGQuYWRkQm9keSh0aGlzLmJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICh0aGlzLmV4cGxvZGVkKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMudGltZXIgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLnRpbWVyIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5leHBsb2RlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGV4cGxvZGUoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuZXhwbG9kZWQpIHJldHVybjtcclxuICAgICAgICB0aGlzLmV4cGxvZGVkID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIGZyb20gc2NlbmUgYW5kIHdvcmxkXHJcbiAgICAgICAgX3NjZW5lLnJlbW92ZSh0aGlzLm1lc2gpO1xyXG4gICAgICAgIF93b3JsZC5yZW1vdmVCb2R5KHRoaXMuYm9keSk7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBmcm9tIGdsb2JhbCBib21icyBhcnJheVxyXG4gICAgICAgIGNvbnN0IGluZGV4ID0gX2JvbWJzLmluZGV4T2YodGhpcyk7XHJcbiAgICAgICAgaWYgKGluZGV4ID4gLTEpIHtcclxuICAgICAgICAgICAgX2JvbWJzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEZWNyZW1lbnQgcGFyZW50IHBsYXllcidzIGJvbWIgY291bnRcclxuICAgICAgICBpZiAodGhpcy5wYXJlbnRQbGF5ZXIpIHtcclxuICAgICAgICAgICAgdGhpcy5wYXJlbnRQbGF5ZXIuY3VycmVudEJvbWJzID0gTWF0aC5tYXgoMCwgdGhpcy5wYXJlbnRQbGF5ZXIuY3VycmVudEJvbWJzIC0gMSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDcmVhdGUgZXhwbG9zaW9uIGVmZmVjdFxyXG4gICAgICAgIGNvbnN0IGV4cGxvc2lvbiA9IG5ldyBFeHBsb3Npb24odGhpcy5ncmlkWCwgdGhpcy5ncmlkWSwgdGhpcy5leHBsb3Npb25SYW5nZSwgX2RhdGEhLmdhbWVDb25maWcsIF90ZXh0dXJlcy5nZXQoJ2V4cGxvc2lvbicpISk7XHJcbiAgICAgICAgX2V4cGxvc2lvbnMucHVzaChleHBsb3Npb24pO1xyXG4gICAgICAgIHBsYXlTb3VuZCgnYm9tYl9leHBsb3Npb25fc291bmQnLCBmYWxzZSwgX2RhdGEhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JvbWJfZXhwbG9zaW9uX3NvdW5kJyk/LnZvbHVtZSB8fCAxLjApO1xyXG4gICAgfVxyXG59XHJcblxyXG5jbGFzcyBFeHBsb3Npb24ge1xyXG4gICAgbWVzaGVzOiBUSFJFRS5NZXNoW10gPSBbXTtcclxuICAgIHRpbWVyOiBudW1iZXI7XHJcbiAgICBkdXJhdGlvbjogbnVtYmVyID0gMC41OyAvLyBWaXN1YWwgZHVyYXRpb24gb2YgZXhwbG9zaW9uXHJcbiAgICBhZmZlY3RlZENlbGxzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTsgLy8gU3RvcmUgZ3JpZCBjb29yZHMgYXMgXCJ4LHlcIlxyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNlbnRlclg6IG51bWJlciwgY2VudGVyWTogbnVtYmVyLCByYW5nZTogbnVtYmVyLCBjb25maWc6IEdhbWVDb25maWcsIHRleHR1cmU6IFRIUkVFLlRleHR1cmUpIHtcclxuICAgICAgICB0aGlzLnRpbWVyID0gdGhpcy5kdXJhdGlvbjtcclxuXHJcbiAgICAgICAgY29uc3QgZXhwbG9zaW9uTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRleHR1cmUsIHRyYW5zcGFyZW50OiB0cnVlLCBvcGFjaXR5OiAwLjgsIGNvbG9yOiBuZXcgVEhSRUUuQ29sb3IoY29uZmlnLmNvbG9ycy5leHBsb3Npb24gfHwgJyNGRjhDMDAnKSB9KTtcclxuICAgICAgICBjb25zdCB0aWxlU2l6ZSA9IGNvbmZpZy50aWxlU2l6ZTtcclxuXHJcbiAgICAgICAgY29uc3QgcHJvcGFnYXRlRXhwbG9zaW9uID0gKHN0YXJ0WDogbnVtYmVyLCBzdGFydFk6IG51bWJlciwgZHg6IG51bWJlciwgZHk6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8PSByYW5nZTsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBjdXJyZW50WCA9IHN0YXJ0WCArIGR4ICogaTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRZID0gc3RhcnRZICsgZHkgKiBpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgY2VsbEtleSA9IGAke2N1cnJlbnRYfSwke2N1cnJlbnRZfWA7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUHJldmVudCByZS1wcm9jZXNzaW5nIHNhbWUgY2VsbCBmcm9tIGRpZmZlcmVudCBwcm9wYWdhdGlvbiBwYXRoc1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYWZmZWN0ZWRDZWxscy5oYXMoY2VsbEtleSkgJiYgKGR4ICE9PSAwIHx8IGR5ICE9PSAwKSkgeyAvLyBDZW50ZXIgY2VsbCBjYW4gYmUgcHJvY2Vzc2VkIG9uY2VcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZHggIT09MCB8fCBkeSAhPT0wKSBicmVhazsgLy8gSWYgaXQncyBub3QgdGhlIGNlbnRlciwgYW5kIGFscmVhZHkgcHJvY2Vzc2VkLCBzdG9wIHByb3BhZ2F0aW9uXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGNvbnN0IFt3b3JsZFgsIHdvcmxkWSwgd29ybGRaQmFzZV0gPSBnZXRHcmlkUG9zaXRpb24oY3VycmVudFgsIGN1cnJlbnRZKTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBibG9jayA9IGdldEJsb2NrQXQoY3VycmVudFgsIGN1cnJlbnRZKTtcclxuICAgICAgICAgICAgICAgIGlmIChibG9jaykge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghYmxvY2suaXNEZXN0cnVjdGlibGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5kZXN0cnVjdGlibGUgd2FsbCwgc3RvcCBleHBsb3Npb24gcHJvcGFnYXRpb24gaW4gdGhpcyBkaXJlY3Rpb25cclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hZmZlY3RlZENlbGxzLmFkZChjZWxsS2V5KTsgLy8gTWFyayBldmVuIGluZGVzdHJ1Y3RpYmxlIHdhbGxzIGFzIGFmZmVjdGVkIGZvciB2aXN1YWwgcHVycG9zZXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRGVzdHJ1Y3RpYmxlIGJsb2NrLCBkZXN0cm95IGl0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZUJsb2NrKGJsb2NrKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hZmZlY3RlZENlbGxzLmFkZChjZWxsS2V5KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUG90ZW50aWFsbHkgc3Bhd24gcG93ZXItdXBcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKE1hdGgucmFuZG9tKCkgPCBjb25maWcucG93ZXJVcFNwYXduQ2hhbmNlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwb3dlclVwVHlwZSA9IE1hdGgucmFuZG9tKCkgPCAwLjMzID8gJ3NwZWVkJyA6IE1hdGgucmFuZG9tKCkgPCAwLjY2ID8gJ2JvbWInIDogJ3JhbmdlJztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIF9wb3dlclVwcy5wdXNoKG5ldyBQb3dlclVwKGN1cnJlbnRYLCBjdXJyZW50WSwgcG93ZXJVcFR5cGUsIGNvbmZpZywgX3RleHR1cmVzLmdldChgcG93ZXJ1cF8ke3Bvd2VyVXBUeXBlfWApISkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIEhpdCBwbGF5ZXJcclxuICAgICAgICAgICAgICAgIGlmIChfcGxheWVyICYmIF9wbGF5ZXIuaXNBbGl2ZSAmJiBfcGxheWVyLmdyaWRYID09PSBjdXJyZW50WCAmJiBfcGxheWVyLmdyaWRZID09PSBjdXJyZW50WSkge1xyXG4gICAgICAgICAgICAgICAgICAgIF9wbGF5ZXIudGFrZURhbWFnZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoYWluIHJlYWN0aW9uIHdpdGggb3RoZXIgYm9tYnNcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJvbWIgPSBnZXRCb21iQXQoY3VycmVudFgsIGN1cnJlbnRZKTtcclxuICAgICAgICAgICAgICAgIGlmIChib21iICYmICFib21iLmV4cGxvZGVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYm9tYi5leHBsb2RlKCk7IC8vIFRyaWdnZXIgaW1tZWRpYXRlIGV4cGxvc2lvblxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSB2aXN1YWwgZXhwbG9zaW9uIG1lc2ggZm9yIHRoaXMgY2VsbFxyXG4gICAgICAgICAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkodGlsZVNpemUgKiAwLjksIHRpbGVTaXplICogMC45LCB0aWxlU2l6ZSAqIDAuOSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIGV4cGxvc2lvbk1hdGVyaWFsKTtcclxuICAgICAgICAgICAgICAgIG1lc2gucG9zaXRpb24uc2V0KHdvcmxkWCwgd29ybGRZLCB3b3JsZFpCYXNlICsgdGlsZVNpemUgKiAwLjQ1KTsgLy8gQ2VudGVyIG9uIGdyaWQgY2VsbFxyXG4gICAgICAgICAgICAgICAgX3NjZW5lLmFkZChtZXNoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubWVzaGVzLnB1c2gobWVzaCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFmZmVjdGVkQ2VsbHMuYWRkKGNlbGxLZXkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gQ2VudGVyIGV4cGxvc2lvblxyXG4gICAgICAgIHByb3BhZ2F0ZUV4cGxvc2lvbihjZW50ZXJYLCBjZW50ZXJZLCAwLCAwKTtcclxuICAgICAgICAvLyBEaXJlY3Rpb25zXHJcbiAgICAgICAgcHJvcGFnYXRlRXhwbG9zaW9uKGNlbnRlclgsIGNlbnRlclksIDEsIDApOyAgLy8gUmlnaHRcclxuICAgICAgICBwcm9wYWdhdGVFeHBsb3Npb24oY2VudGVyWCwgY2VudGVyWSwgLTEsIDApOyAvLyBMZWZ0XHJcbiAgICAgICAgcHJvcGFnYXRlRXhwbG9zaW9uKGNlbnRlclgsIGNlbnRlclksIDAsIDEpOyAgLy8gVXBcclxuICAgICAgICBwcm9wYWdhdGVFeHBsb3Npb24oY2VudGVyWCwgY2VudGVyWSwgMCwgLTEpOyAvLyBEb3duXHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy50aW1lciAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKHRoaXMudGltZXIgPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnJlbW92ZSgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIEFuaW1hdGUgZXhwbG9zaW9uIG9wYWNpdHlcclxuICAgICAgICAgICAgY29uc3QgcHJvZ3Jlc3MgPSB0aGlzLnRpbWVyIC8gdGhpcy5kdXJhdGlvbjtcclxuICAgICAgICAgICAgdGhpcy5tZXNoZXMuZm9yRWFjaChtZXNoID0+IHtcclxuICAgICAgICAgICAgICAgIGlmIChtZXNoLm1hdGVyaWFsIGluc3RhbmNlb2YgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpIHtcclxuICAgICAgICAgICAgICAgICAgICBtZXNoLm1hdGVyaWFsLm9wYWNpdHkgPSBwcm9ncmVzcztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlbW92ZSgpIHtcclxuICAgICAgICB0aGlzLm1lc2hlcy5mb3JFYWNoKG1lc2ggPT4ge1xyXG4gICAgICAgICAgICBfc2NlbmUucmVtb3ZlKG1lc2gpO1xyXG4gICAgICAgICAgICBpZiAobWVzaC5nZW9tZXRyeSkgbWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgIGlmIChtZXNoLm1hdGVyaWFsKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShtZXNoLm1hdGVyaWFsKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1lc2gubWF0ZXJpYWwuZm9yRWFjaChtID0+IG0uZGlzcG9zZSgpKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgKG1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwpLmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGluZGV4ID0gX2V4cGxvc2lvbnMuaW5kZXhPZih0aGlzKTtcclxuICAgICAgICBpZiAoaW5kZXggPiAtMSkge1xyXG4gICAgICAgICAgICBfZXhwbG9zaW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuY2xhc3MgUG93ZXJVcCB7XHJcbiAgICBtZXNoOiBUSFJFRS5NZXNoO1xyXG4gICAgYm9keTogQ0FOTk9OLkJvZHk7XHJcbiAgICBncmlkWDogbnVtYmVyO1xyXG4gICAgZ3JpZFk6IG51bWJlcjtcclxuICAgIHR5cGU6ICdzcGVlZCcgfCAnYm9tYicgfCAncmFuZ2UnO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGdyaWRYOiBudW1iZXIsIGdyaWRZOiBudW1iZXIsIHR5cGU6ICdzcGVlZCcgfCAnYm9tYicgfCAncmFuZ2UnLCBjb25maWc6IEdhbWVDb25maWcsIHRleHR1cmU6IFRIUkVFLlRleHR1cmUpIHtcclxuICAgICAgICB0aGlzLmdyaWRYID0gZ3JpZFg7XHJcbiAgICAgICAgdGhpcy5ncmlkWSA9IGdyaWRZO1xyXG4gICAgICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcblxyXG4gICAgICAgIGNvbnN0IFt4LCB5LCB6QmFzZV0gPSBnZXRHcmlkUG9zaXRpb24oZ3JpZFgsIGdyaWRZKTtcclxuICAgICAgICBjb25zdCBwb3dlclVwU2l6ZSA9IGNvbmZpZy50aWxlU2l6ZSAqIDAuNTtcclxuICAgICAgICBjb25zdCB6ID0gekJhc2UgKyBwb3dlclVwU2l6ZSAvIDI7XHJcblxyXG4gICAgICAgIC8vIFRocmVlLmpzIE1lc2hcclxuICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShwb3dlclVwU2l6ZSwgcG93ZXJVcFNpemUsIHBvd2VyVXBTaXplKTsgLy8gU2ltcGxlIGJveCBmb3Igbm93XHJcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSwgY29sb3I6IG5ldyBUSFJFRS5Db2xvcihjb25maWcuY29sb3JzW3R5cGVdIHx8ICcjRkZGRkZGJykgfSk7XHJcbiAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLm1lc2gucG9zaXRpb24uc2V0KHgsIHksIHopO1xyXG4gICAgICAgIHRoaXMubWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICBfc2NlbmUuYWRkKHRoaXMubWVzaCk7XHJcblxyXG4gICAgICAgIC8vIENhbm5vbi5qcyBCb2R5IChzZW5zb3IsIG5vIGNvbGxpc2lvbiByZXNwb25zZSlcclxuICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhwb3dlclVwU2l6ZSAvIDIsIHBvd2VyVXBTaXplIC8gMiwgcG93ZXJVcFNpemUgLyAyKSk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogMCwgLy8gU3RhdGljLCBubyBncmF2aXR5XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMoeCwgeSwgeiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBzaGFwZSxcclxuICAgICAgICAgICAgaXNUcmlnZ2VyOiB0cnVlLCAvLyBNYXJrIGFzIHRyaWdnZXIgZm9yIGN1c3RvbSBjb2xsaXNpb24gaGFuZGxpbmcgKGhhbmRsZWQgaW4gcGxheWVyIGNvbGxpc2lvbilcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ3Bvd2VyVXBNYXRlcmlhbCcpXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgX3dvcmxkLmFkZEJvZHkodGhpcy5ib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICBhcHBseUVmZmVjdChwbGF5ZXI6IFBsYXllcikge1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy50eXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ3NwZWVkJzpcclxuICAgICAgICAgICAgICAgIHBsYXllci5zcGVlZCAqPSAxLjI7IC8vIEluY3JlYXNlIHNwZWVkIGJ5IDIwJVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ2JvbWInOlxyXG4gICAgICAgICAgICAgICAgcGxheWVyLm1heEJvbWJzICs9IDE7IC8vIEluY3JlYXNlIG1heCBib21ic1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgJ3JhbmdlJzpcclxuICAgICAgICAgICAgICAgIHBsYXllci5ib21iUmFuZ2UgKz0gMTsgLy8gSW5jcmVhc2UgYm9tYiByYW5nZVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlbW92ZSgpIHtcclxuICAgICAgICBfc2NlbmUucmVtb3ZlKHRoaXMubWVzaCk7XHJcbiAgICAgICAgX3dvcmxkLnJlbW92ZUJvZHkodGhpcy5ib2R5KTtcclxuICAgICAgICBjb25zdCBpbmRleCA9IF9wb3dlclVwcy5pbmRleE9mKHRoaXMpO1xyXG4gICAgICAgIGlmIChpbmRleCA+IC0xKSB7XHJcbiAgICAgICAgICAgIF9wb3dlclVwcy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5tZXNoLmdlb21ldHJ5KSB0aGlzLm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xyXG4gICAgICAgIGlmICh0aGlzLm1lc2gubWF0ZXJpYWwpIHtcclxuICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHRoaXMubWVzaC5tYXRlcmlhbCkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubWVzaC5tYXRlcmlhbC5mb3JFYWNoKG0gPT4gbS5kaXNwb3NlKCkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgKHRoaXMubWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuLy8gLS0tIEdhbWUgSW5pdGlhbGl6YXRpb24gLS0tXHJcbmFzeW5jIGZ1bmN0aW9uIGluaXRHYW1lKCkge1xyXG4gICAgX2NhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBpZiAoIV9jYW52YXMpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdDYW52YXMgZWxlbWVudCBub3QgZm91bmQhJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGF3YWl0IGxvYWRHYW1lRGF0YSgpO1xyXG4gICAgaWYgKCFfZGF0YSkgcmV0dXJuO1xyXG5cclxuICAgIC8vIFRocmVlLmpzIFJlbmRlcmVyIHNldHVwXHJcbiAgICBfcmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogX2NhbnZhcywgYW50aWFsaWFzOiB0cnVlIH0pO1xyXG4gICAgX3JlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICBfcmVuZGVyZXIuc2V0Q2xlYXJDb2xvcihuZXcgVEhSRUUuQ29sb3IoX2RhdGEuZ2FtZUNvbmZpZy5jb2xvcnMuYmFja2dyb3VuZCB8fCAnIzg3Q0VFQicpKTsgLy8gU2t5IGJsdWUgYmFja2dyb3VuZFxyXG4gICAgX3JlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTtcclxuICAgIF9yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7XHJcblxyXG4gICAgLy8gVGhyZWUuanMgU2NlbmUgYW5kIENhbWVyYSBzZXR1cFxyXG4gICAgX3NjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgICBfY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKDc1LCB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodCwgMC4xLCAxMDAwKTtcclxuICAgIGNvbnN0IGNhbVBvcyA9IF9kYXRhLmdhbWVDb25maWcuY2FtZXJhLnBvc2l0aW9uO1xyXG4gICAgY29uc3QgY2FtTG9vayA9IF9kYXRhLmdhbWVDb25maWcuY2FtZXJhLmxvb2tBdDtcclxuICAgIF9jYW1lcmEucG9zaXRpb24uc2V0KGNhbVBvc1swXSwgY2FtUG9zWzFdLCBjYW1Qb3NbMl0pO1xyXG4gICAgX2NhbWVyYS5sb29rQXQoY2FtTG9va1swXSwgY2FtTG9va1sxXSwgY2FtTG9va1syXSk7XHJcblxyXG4gICAgLy8gTGlnaHRpbmdcclxuICAgIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDAsIDIpOyAvLyBzb2Z0IHdoaXRlIGxpZ2h0XHJcbiAgICBfc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcblxyXG4gICAgY29uc3QgZGlyZWN0aW9uYWxMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAyKTtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHQucG9zaXRpb24uc2V0KDUsIDEwLCAxNSk7XHJcbiAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS53aWR0aCA9IDIwNDg7XHJcbiAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDIwNDg7XHJcbiAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubmVhciA9IDAuNTtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5mYXIgPSA1MDtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLSAoX2RhdGEuZ2FtZUNvbmZpZy5tYXBXaWR0aCAqIF9kYXRhLmdhbWVDb25maWcudGlsZVNpemUpIC8gMjtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5yaWdodCA9IChfZGF0YS5nYW1lQ29uZmlnLm1hcFdpZHRoICogX2RhdGEuZ2FtZUNvbmZpZy50aWxlU2l6ZSkgLyAyO1xyXG4gICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IChfZGF0YS5nYW1lQ29uZmlnLm1hcEhlaWdodCAqIF9kYXRhLmdhbWVDb25maWcudGlsZVNpemUpIC8gMjtcclxuICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5ib3R0b20gPSAtIChfZGF0YS5nYW1lQ29uZmlnLm1hcEhlaWdodCAqIF9kYXRhLmdhbWVDb25maWcudGlsZVNpemUpIC8gMjtcclxuICAgIF9zY2VuZS5hZGQoZGlyZWN0aW9uYWxMaWdodCk7XHJcbiAgICAvLyBjb25zdCBoZWxwZXIgPSBuZXcgVEhSRUUuQ2FtZXJhSGVscGVyKGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYSk7XHJcbiAgICAvLyBfc2NlbmUuYWRkKGhlbHBlcik7XHJcblxyXG4gICAgLy8gQ2Fubm9uLmpzIFdvcmxkIHNldHVwXHJcbiAgICBfd29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICBfd29ybGQuZ3Jhdml0eS5zZXQoMCwgMCwgLTkuODIpOyAvLyBaIGlzIHVwIGZvciB2ZXJ0aWNhbCBkaXJlY3Rpb25cclxuICAgIF93b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5TQVBCcm9hZHBoYXNlKF93b3JsZCk7IC8vIE9wdGltaXphdGlvbiBmb3IgYnJvYWRwaGFzZSBjb2xsaXNpb24gZGV0ZWN0aW9uXHJcbiAgICAoX3dvcmxkLnNvbHZlciBhcyBDQU5OT04uR1NTb2x2ZXIpLml0ZXJhdGlvbnMgPSAxMDsgLy8gSW5jcmVhc2Ugc29sdmVyIGl0ZXJhdGlvbnMgZm9yIHN0YWJpbGl0eVxyXG5cclxuICAgIC8vIEdyb3VuZCBQbGFuZSAoVGhyZWUuanMgYW5kIENhbm5vbi5qcylcclxuICAgIGNvbnN0IGdyb3VuZEdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoX2RhdGEuZ2FtZUNvbmZpZy5tYXBXaWR0aCAqIF9kYXRhLmdhbWVDb25maWcudGlsZVNpemUsIF9kYXRhLmdhbWVDb25maWcubWFwSGVpZ2h0ICogX2RhdGEuZ2FtZUNvbmZpZy50aWxlU2l6ZSk7XHJcbiAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHsgY29sb3I6IG5ldyBUSFJFRS5Db2xvcihfZGF0YS5nYW1lQ29uZmlnLmNvbG9ycy5ncm91bmQgfHwgJyM1NTZCMkYnKSwgbWFwOiBfdGV4dHVyZXMuZ2V0KCdncm91bmQnKSB9KTtcclxuICAgIGNvbnN0IGdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG4gICAgZ3JvdW5kTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgIGdyb3VuZE1lc2gucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjsgLy8gUm90YXRlIHRvIGxpZSBmbGF0IG9uIFgtWSBwbGFuZVxyXG4gICAgX3NjZW5lLmFkZChncm91bmRNZXNoKTtcclxuXHJcbiAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgIGNvbnN0IGdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwLCBtYXRlcmlhbDogbmV3IENBTk5PTi5NYXRlcmlhbCgnZ3JvdW5kTWF0ZXJpYWwnKSB9KTtcclxuICAgIGdyb3VuZEJvZHkuYWRkU2hhcGUoZ3JvdW5kU2hhcGUpO1xyXG4gICAgZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21FdWxlcigtTWF0aC5QSSAvIDIsIDAsIDApOyAvLyBSb3RhdGUgdG8gbGllIGZsYXQgb24gWC1ZIHBsYW5lXHJcbiAgICBfd29ybGQuYWRkQm9keShncm91bmRCb2R5KTtcclxuXHJcbiAgICAvLyBJbml0aWFsIGV2ZW50IGxpc3RlbmVyc1xyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIG9uV2luZG93UmVzaXplLCBmYWxzZSk7XHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25LZXlEb3duLCBmYWxzZSk7XHJcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIG9uS2V5VXAsIGZhbHNlKTtcclxuXHJcbiAgICBzaG93VGl0bGVTY3JlZW4oKTtcclxuICAgIGFuaW1hdGUoMCk7IC8vIFN0YXJ0IHRoZSBhbmltYXRpb24gbG9vcFxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkR2FtZURhdGEoKSB7XHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgIF9kYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIEdhbWVEYXRhO1xyXG5cclxuICAgICAgICAvLyBMb2FkIGltYWdlc1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIGNvbnN0IGxvYWRJbWFnZVByb21pc2VzID0gX2RhdGEuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIHRleHR1cmVMb2FkZXIubG9hZChcclxuICAgICAgICAgICAgICAgICAgICBpbWcucGF0aCxcclxuICAgICAgICAgICAgICAgICAgICAodGV4dHVyZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBfdGV4dHVyZXMuc2V0KGltZy5uYW1lLCB0ZXh0dXJlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLCAvLyBwcm9ncmVzcyBjYWxsYmFja1xyXG4gICAgICAgICAgICAgICAgICAgIChlcnIpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgbG9hZGluZyBpbWFnZTogJHtpbWcucGF0aH1gLCBlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gTG9hZCBzb3VuZHNcclxuICAgICAgICBjb25zdCBsb2FkU291bmRQcm9taXNlcyA9IF9kYXRhLmFzc2V0cy5zb3VuZHMubWFwKHNvdW5kID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIGZldGNoKHNvdW5kLnBhdGgpXHJcbiAgICAgICAgICAgICAgICAudGhlbihyZXMgPT4gcmVzLmFycmF5QnVmZmVyKCkpXHJcbiAgICAgICAgICAgICAgICAudGhlbihhcnJheUJ1ZmZlciA9PiBfYXVkaW9Db250ZXh0LmRlY29kZUF1ZGlvRGF0YShhcnJheUJ1ZmZlcikpXHJcbiAgICAgICAgICAgICAgICAudGhlbihhdWRpb0J1ZmZlciA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgX2F1ZGlvQnVmZmVycy5zZXQoc291bmQubmFtZSwgYXVkaW9CdWZmZXIpO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnIgPT4gY29uc29sZS5lcnJvcihgRXJyb3IgbG9hZGluZyBzb3VuZDogJHtzb3VuZC5wYXRofWAsIGVycikpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4ubG9hZEltYWdlUHJvbWlzZXMsIC4uLmxvYWRTb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0FsbCBhc3NldHMgbG9hZGVkLicpO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBkYXRhIG9yIGFzc2V0czonLCBlcnJvcik7XHJcbiAgICAgICAgYWxlcnQoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgZGF0YS4gU2VlIGNvbnNvbGUgZm9yIGRldGFpbHMuJyk7XHJcbiAgICAgICAgX2RhdGEgPSBudWxsO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVUZXh0KHRleHQ6IHN0cmluZywgc2l6ZTogbnVtYmVyLCB5T2Zmc2V0OiBudW1iZXIsIGNvbG9yOiBzdHJpbmcsIGZvbnQ6IGFueSk6IFRIUkVFLk1lc2gge1xyXG4gICAgY29uc3QgdGV4dEdlb21ldHJ5ID0gbmV3IFRleHRHZW9tZXRyeSh0ZXh0LCB7XHJcbiAgICAgICAgZm9udDogZm9udCxcclxuICAgICAgICBzaXplOiBzaXplLFxyXG4gICAgICAgIGRlcHRoOiAwLjEsIC8vIENoYW5nZWQgJ2hlaWdodCcgdG8gJ2RlcHRoJ1xyXG4gICAgICAgIGN1cnZlU2VnbWVudHM6IDEyLFxyXG4gICAgICAgIGJldmVsRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICBiZXZlbFRoaWNrbmVzczogMC4wNSxcclxuICAgICAgICBiZXZlbFNpemU6IDAuMDIsXHJcbiAgICAgICAgYmV2ZWxPZmZzZXQ6IDAsXHJcbiAgICAgICAgYmV2ZWxTZWdtZW50czogNVxyXG4gICAgfSk7XHJcbiAgICB0ZXh0R2VvbWV0cnkuY29tcHV0ZUJvdW5kaW5nQm94KCk7XHJcbiAgICBjb25zdCB0ZXh0TWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IGNvbG9yOiBuZXcgVEhSRUUuQ29sb3IoY29sb3IpIH0pO1xyXG4gICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKHRleHRHZW9tZXRyeSwgdGV4dE1hdGVyaWFsKTtcclxuICAgIGNvbnN0IGJib3ggPSB0ZXh0R2VvbWV0cnkuYm91bmRpbmdCb3ghO1xyXG4gICAgY29uc3Qgd2lkdGggPSBiYm94Lm1heC54IC0gYmJveC5taW4ueDtcclxuICAgIG1lc2gucG9zaXRpb24uc2V0KC13aWR0aCAvIDIsIHlPZmZzZXQsIDUpOyAvLyBQb3NpdGlvbiBpbiBmcm9udCBvZiBjYW1lcmEsIHNvbWV3aGF0IGNlbnRlcmVkXHJcbiAgICByZXR1cm4gbWVzaDtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHNob3dUaXRsZVNjcmVlbigpIHtcclxuICAgIGlmICghX2RhdGEpIHJldHVybjtcclxuXHJcbiAgICBkaXNwb3NlVUkoX3RpdGxlVGV4dE1lc2gpO1xyXG4gICAgZGlzcG9zZVVJKF9zdGFydEJ1dHRvblRleHRNZXNoKTtcclxuICAgIGRpc3Bvc2VVSShfZ2FtZU92ZXJUZXh0TWVzaCk7XHJcbiAgICBfdGl0bGVUZXh0TWVzaCA9IF9zdGFydEJ1dHRvblRleHRNZXNoID0gX2dhbWVPdmVyVGV4dE1lc2ggPSBudWxsO1xyXG5cclxuICAgIGNvbnN0IGZvbnRMb2FkZXIgPSBuZXcgRm9udExvYWRlcigpO1xyXG4gICAgZm9udExvYWRlci5sb2FkKCdodHRwczovL3RocmVlanMub3JnL2V4YW1wbGVzL2ZvbnRzL2hlbHZldGlrZXJfcmVndWxhci50eXBlZmFjZS5qc29uJywgZnVuY3Rpb24gKGZvbnQpIHtcclxuICAgICAgICBfdGl0bGVUZXh0TWVzaCA9IGNyZWF0ZVRleHQoX2RhdGEhLmdhbWVDb25maWcudWkudGl0bGVUZXh0LCAxLCAyLCBfZGF0YSEuZ2FtZUNvbmZpZy5jb2xvcnMudWlUZXh0IHx8ICcjRkZGRkZGJywgZm9udCk7XHJcbiAgICAgICAgX3N0YXJ0QnV0dG9uVGV4dE1lc2ggPSBjcmVhdGVUZXh0KF9kYXRhIS5nYW1lQ29uZmlnLnVpLnN0YXJ0QnV0dG9uVGV4dCwgMC41LCAwLCBfZGF0YSEuZ2FtZUNvbmZpZy5jb2xvcnMudWlUZXh0IHx8ICcjRkZGRkZGJywgZm9udCk7XHJcbiAgICAgICAgX3NjZW5lLmFkZChfdGl0bGVUZXh0TWVzaCk7XHJcbiAgICAgICAgX3NjZW5lLmFkZChfc3RhcnRCdXR0b25UZXh0TWVzaCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBpZiAoX2JnbVNvdXJjZSkge1xyXG4gICAgICAgIHN0b3BTb3VuZChfYmdtU291cmNlKTtcclxuICAgICAgICBfYmdtU291cmNlID0gbnVsbDtcclxuICAgIH1cclxuICAgIF9iZ21Tb3VyY2UgPSBwbGF5U291bmQoJ2JnbScsIHRydWUsIF9kYXRhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpPy52b2x1bWUgfHwgMC41KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZGlzcG9zZVVJKG1lc2g6IFRIUkVFLk1lc2ggfCBudWxsKSB7XHJcbiAgICBpZiAobWVzaCkge1xyXG4gICAgICAgIF9zY2VuZS5yZW1vdmUobWVzaCk7XHJcbiAgICAgICAgaWYgKG1lc2guZ2VvbWV0cnkpIG1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xyXG4gICAgICAgIGlmIChtZXNoLm1hdGVyaWFsKSB7XHJcbiAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShtZXNoLm1hdGVyaWFsKSkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5tYXRlcmlhbC5mb3JFYWNoKG0gPT4gbS5kaXNwb3NlKCkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgKG1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwpLmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHN0YXJ0R2FtZSgpIHtcclxuICAgIGlmICghX2RhdGEpIHJldHVybjtcclxuXHJcbiAgICBkaXNwb3NlVUkoX3RpdGxlVGV4dE1lc2gpO1xyXG4gICAgZGlzcG9zZVVJKF9zdGFydEJ1dHRvblRleHRNZXNoKTtcclxuICAgIGRpc3Bvc2VVSShfZ2FtZU92ZXJUZXh0TWVzaCk7XHJcbiAgICBfdGl0bGVUZXh0TWVzaCA9IF9zdGFydEJ1dHRvblRleHRNZXNoID0gX2dhbWVPdmVyVGV4dE1lc2ggPSBudWxsO1xyXG5cclxuXHJcbiAgICByZXNldEdhbWUoKTtcclxuICAgIGNyZWF0ZU1hcCgpO1xyXG4gICAgX2dhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG59XHJcblxyXG5mdW5jdGlvbiByZXNldEdhbWUoKSB7XHJcbiAgICAvLyBDbGVhciBhbGwgZ2FtZSBvYmplY3RzIGZyb20gcHJldmlvdXMgcm91bmRzXHJcbiAgICBfYmxvY2tzLmZvckVhY2goYiA9PiB7IF9zY2VuZS5yZW1vdmUoYi5tZXNoKTsgX3dvcmxkLnJlbW92ZUJvZHkoYi5ib2R5KTsgfSk7XHJcbiAgICBfYmxvY2tzLmxlbmd0aCA9IDA7XHJcblxyXG4gICAgX2JvbWJzLmZvckVhY2goYiA9PiB7IF9zY2VuZS5yZW1vdmUoYi5tZXNoKTsgX3dvcmxkLnJlbW92ZUJvZHkoYi5ib2R5KTsgfSk7XHJcbiAgICBfYm9tYnMubGVuZ3RoID0gMDtcclxuXHJcbiAgICBfZXhwbG9zaW9ucy5mb3JFYWNoKGUgPT4gZS5yZW1vdmUoKSk7IC8vIE1ha2Ugc3VyZSB0aGV5IGNsZWFuIHVwIHRoZWlyIG1lc2hlc1xyXG4gICAgX2V4cGxvc2lvbnMubGVuZ3RoID0gMDtcclxuXHJcbiAgICBfcG93ZXJVcHMuZm9yRWFjaChwID0+IHsgX3NjZW5lLnJlbW92ZShwLm1lc2gpOyBfd29ybGQucmVtb3ZlQm9keShwLmJvZHkpOyB9KTtcclxuICAgIF9wb3dlclVwcy5sZW5ndGggPSAwO1xyXG5cclxuICAgIGlmIChfcGxheWVyKSB7XHJcbiAgICAgICAgX3NjZW5lLnJlbW92ZShfcGxheWVyLm1lc2gpO1xyXG4gICAgICAgIF93b3JsZC5yZW1vdmVCb2R5KF9wbGF5ZXIuYm9keSk7XHJcbiAgICAgICAgX3BsYXllciA9IG51bGw7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZU1hcCgpIHtcclxuICAgIGlmICghX2RhdGEpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBjb25maWcgPSBfZGF0YS5nYW1lQ29uZmlnO1xyXG4gICAgY29uc3QgdGlsZVNpemUgPSBjb25maWcudGlsZVNpemU7XHJcbiAgICBjb25zdCBpbml0aWFsTWFwID0gY29uZmlnLmluaXRpYWxNYXA7XHJcbiAgICBjb25zdCBtYXBXaWR0aCA9IGNvbmZpZy5tYXBXaWR0aDtcclxuICAgIGNvbnN0IG1hcEhlaWdodCA9IGNvbmZpZy5tYXBIZWlnaHQ7XHJcblxyXG4gICAgY29uc3Qgd2FsbFRleHR1cmUgPSBfdGV4dHVyZXMuZ2V0KCd3YWxsJyk7XHJcbiAgICBjb25zdCBkZXN0cnVjdGlibGVUZXh0dXJlID0gX3RleHR1cmVzLmdldCgnZGVzdHJ1Y3RpYmxlX2Jsb2NrJyk7XHJcbiAgICBjb25zdCBwbGF5ZXJUZXh0dXJlID0gX3RleHR1cmVzLmdldCgncGxheWVyJyk7XHJcblxyXG4gICAgZm9yIChsZXQgeSA9IDA7IHkgPCBtYXBIZWlnaHQ7IHkrKykge1xyXG4gICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgbWFwV2lkdGg7IHgrKykge1xyXG4gICAgICAgICAgICBjb25zdCBjaGFyID0gaW5pdGlhbE1hcFt5XVt4XTtcclxuICAgICAgICAgICAgY29uc3QgW3dvcmxkWCwgd29ybGRZLCB3b3JsZFpCYXNlXSA9IGdldEdyaWRQb3NpdGlvbih4LCB5KTtcclxuXHJcbiAgICAgICAgICAgIGxldCBtZXNoOiBUSFJFRS5NZXNoO1xyXG4gICAgICAgICAgICBsZXQgYm9keTogQ0FOTk9OLkJvZHk7XHJcblxyXG4gICAgICAgICAgICBpZiAoY2hhciA9PT0gJ1cnKSB7IC8vIEluZGVzdHJ1Y3RpYmxlIFdhbGxcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHRpbGVTaXplLCB0aWxlU2l6ZSwgdGlsZVNpemUpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogd2FsbFRleHR1cmUsIGNvbG9yOiBuZXcgVEhSRUUuQ29sb3IoY29uZmlnLmNvbG9ycy53YWxsIHx8ICcjODA4MDgwJykgfSk7XHJcbiAgICAgICAgICAgICAgICBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICAgICAgICAgIG1lc2gucG9zaXRpb24uc2V0KHdvcmxkWCwgd29ybGRZLCB3b3JsZFpCYXNlICsgdGlsZVNpemUgLyAyKTtcclxuICAgICAgICAgICAgICAgIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgX3NjZW5lLmFkZChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyh0aWxlU2l6ZSAvIDIsIHRpbGVTaXplIC8gMiwgdGlsZVNpemUgLyAyKSk7XHJcbiAgICAgICAgICAgICAgICBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgICAgICAgICBtYXNzOiAwLCAvLyBTdGF0aWNcclxuICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHdvcmxkWCwgd29ybGRZLCB3b3JsZFpCYXNlICsgdGlsZVNpemUgLyAyKSxcclxuICAgICAgICAgICAgICAgICAgICBzaGFwZTogc2hhcGUsXHJcbiAgICAgICAgICAgICAgICAgICAgbWF0ZXJpYWw6IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ3dhbGxNYXRlcmlhbCcpXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIF93b3JsZC5hZGRCb2R5KGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgX2Jsb2Nrcy5wdXNoKHsgbWVzaCwgYm9keSwgaXNEZXN0cnVjdGlibGU6IGZhbHNlLCBncmlkWDogeCwgZ3JpZFk6IHkgfSk7XHJcblxyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoYXIgPT09ICdEJykgeyAvLyBEZXN0cnVjdGlibGUgQmxvY2tcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHRpbGVTaXplLCB0aWxlU2l6ZSwgdGlsZVNpemUpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7IG1hcDogZGVzdHJ1Y3RpYmxlVGV4dHVyZSwgY29sb3I6IG5ldyBUSFJFRS5Db2xvcihjb25maWcuY29sb3JzLmRlc3RydWN0aWJsZSB8fCAnI0EwNTIyRCcpIH0pO1xyXG4gICAgICAgICAgICAgICAgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcbiAgICAgICAgICAgICAgICBtZXNoLnBvc2l0aW9uLnNldCh3b3JsZFgsIHdvcmxkWSwgd29ybGRaQmFzZSArIHRpbGVTaXplIC8gMik7XHJcbiAgICAgICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIF9zY2VuZS5hZGQobWVzaCk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzModGlsZVNpemUgLyAyLCB0aWxlU2l6ZSAvIDIsIHRpbGVTaXplIC8gMikpO1xyXG4gICAgICAgICAgICAgICAgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFzczogMCwgLy8gU3RhdGljXHJcbiAgICAgICAgICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyh3b3JsZFgsIHdvcmxkWSwgd29ybGRaQmFzZSArIHRpbGVTaXplIC8gMiksXHJcbiAgICAgICAgICAgICAgICAgICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgICAgICAgICAgICAgICAgIG1hdGVyaWFsOiBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdkZXN0cnVjdGlibGVNYXRlcmlhbCcpXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIF93b3JsZC5hZGRCb2R5KGJvZHkpO1xyXG4gICAgICAgICAgICAgICAgX2Jsb2Nrcy5wdXNoKHsgbWVzaCwgYm9keSwgaXNEZXN0cnVjdGlibGU6IHRydWUsIGdyaWRYOiB4LCBncmlkWTogeSB9KTtcclxuXHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2hhciA9PT0gJ1AnICYmICFfcGxheWVyKSB7IC8vIFBsYXllciBTdGFydCBQb3NpdGlvblxyXG4gICAgICAgICAgICAgICAgX3BsYXllciA9IG5ldyBQbGF5ZXIoeCwgeSwgY29uZmlnLCBwbGF5ZXJUZXh0dXJlISk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9uV2luZG93UmVzaXplKCkge1xyXG4gICAgX2NhbWVyYS5hc3BlY3QgPSB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgIF9jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG4gICAgX3JlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgX2tleXNQcmVzc2VkLmFkZChldmVudC5rZXkudG9Mb3dlckNhc2UoKSk7XHJcblxyXG4gICAgaWYgKF9nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSAmJiBldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJyAnKSB7XHJcbiAgICAgICAgc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgX2tleXNQcmVzc2VkLmRlbGV0ZSgnICcpOyAvLyBDb25zdW1lIHNwYWNlYmFyXHJcbiAgICB9XHJcbiAgICAvLyBIYW5kbGUgZ2FtZSBvdmVyIHNjcmVlbiByZXN0YXJ0XHJcbiAgICBpZiAoKF9nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRSB8fCBfZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSX1dJTikgJiYgZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICdyJykge1xyXG4gICAgICAgIF9nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgc2hvd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgX2tleXNQcmVzc2VkLmRlbGV0ZSgncicpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICBfa2V5c1ByZXNzZWQuZGVsZXRlKGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpKTtcclxufVxyXG5cclxuLy8gLS0tIEdhbWUgTG9vcCAtLS1cclxuZnVuY3Rpb24gYW5pbWF0ZShjdXJyZW50VGltZTogbnVtYmVyKSB7XHJcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbWF0ZSk7XHJcblxyXG4gICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gX2xhc3RUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgX2xhc3RUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgaWYgKCFfZGF0YSkge1xyXG4gICAgICAgIF9yZW5kZXJlci5yZW5kZXIoX3NjZW5lLCBfY2FtZXJhKTsgLy8gUmVuZGVyIHRpdGxlIHNjcmVlbiBldmVuIGlmIGRhdGEgaXNuJ3QgZnVsbHkgcmVhZHlcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gVXBkYXRlIHBoeXNpY3Mgd29ybGRcclxuICAgIF93b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCAzKTsgLy8gRml4ZWQgdGltZSBzdGVwIGZvciBwaHlzaWNzXHJcblxyXG4gICAgaWYgKF9nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgaWYgKF9wbGF5ZXIpIHtcclxuICAgICAgICAgICAgX3BsYXllci51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB9IGVsc2UgeyAvLyBQbGF5ZXIgZGllZFxyXG4gICAgICAgICAgICBfZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9MT1NFO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IF9ib21icy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICBfYm9tYnNbaV0udXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gX2V4cGxvc2lvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgX2V4cGxvc2lvbnNbaV0udXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBXaW4gY29uZGl0aW9uOiBpZiBubyBkZXN0cnVjdGlibGUgYmxvY2tzIGxlZnQsIHBsYXllciB3aW5zLlxyXG4gICAgICAgIGNvbnN0IHJlbWFpbmluZ0Rlc3RydWN0aWJsZUJsb2NrcyA9IF9ibG9ja3MuZmlsdGVyKGIgPT4gYi5pc0Rlc3RydWN0aWJsZSkubGVuZ3RoO1xyXG4gICAgICAgIGlmIChyZW1haW5pbmdEZXN0cnVjdGlibGVCbG9ja3MgPT09IDAgJiYgX2dhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgX2dhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVJfV0lOO1xyXG4gICAgICAgICAgICBwbGF5U291bmQoJ2dhbWVfd2luX3NvdW5kJywgZmFsc2UsIF9kYXRhLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2dhbWVfd2luX3NvdW5kJyk/LnZvbHVtZSB8fCAxLjApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICB9IGVsc2UgaWYgKF9nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVJfTE9TRSB8fCBfZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSX1dJTikge1xyXG4gICAgICAgIC8vIFNob3cgR2FtZSBPdmVyIFVJXHJcbiAgICAgICAgaWYgKCFfZ2FtZU92ZXJUZXh0TWVzaCkge1xyXG4gICAgICAgICAgICBkaXNwb3NlVUkoX3RpdGxlVGV4dE1lc2gpO1xyXG4gICAgICAgICAgICBkaXNwb3NlVUkoX3N0YXJ0QnV0dG9uVGV4dE1lc2gpO1xyXG4gICAgICAgICAgICBfdGl0bGVUZXh0TWVzaCA9IF9zdGFydEJ1dHRvblRleHRNZXNoID0gbnVsbDtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvbnRMb2FkZXIgPSBuZXcgRm9udExvYWRlcigpO1xyXG4gICAgICAgICAgICBmb250TG9hZGVyLmxvYWQoJ2h0dHBzOi8vdGhyZWVqcy5vcmcvZXhhbXBsZXMvZm9udHMvaGVsdmV0aWtlcl9yZWd1bGFyLnR5cGVmYWNlLmpzb24nLCBmdW5jdGlvbiAoZm9udCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IF9nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVJfV0lOID8gX2RhdGEhLmdhbWVDb25maWcudWkud2luVGV4dCA6IF9kYXRhIS5nYW1lQ29uZmlnLnVpLmdhbWVPdmVyVGV4dDtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbG9yID0gX2dhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUl9XSU4gPyAnIzAwRkYwMCcgOiAnI0ZGMDAwMCc7XHJcbiAgICAgICAgICAgICAgICBfZ2FtZU92ZXJUZXh0TWVzaCA9IGNyZWF0ZVRleHQodGV4dCArICdcXG5QcmVzcyBSIHRvIFJlc3RhcnQnLCAxLCAwLCBjb2xvciwgZm9udCk7XHJcbiAgICAgICAgICAgICAgICBfc2NlbmUuYWRkKF9nYW1lT3ZlclRleHRNZXNoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIC8vIFN0b3AgQkdNIGlmIGl0J3Mgc3RpbGwgcGxheWluZ1xyXG4gICAgICAgICAgICBpZiAoX2JnbVNvdXJjZSkge1xyXG4gICAgICAgICAgICAgICAgc3RvcFNvdW5kKF9iZ21Tb3VyY2UpO1xyXG4gICAgICAgICAgICAgICAgX2JnbVNvdXJjZSA9IG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgX3JlbmRlcmVyLnJlbmRlcihfc2NlbmUsIF9jYW1lcmEpO1xyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZVxyXG5pbml0R2FtZSgpOyJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFpRDdCLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSkMsU0FBQUE7QUFBQSxHQUFBO0FBT0wsSUFBSSxhQUF3QjtBQUM1QixJQUFJLFFBQXlCO0FBRzdCLElBQUk7QUFDSixJQUFJO0FBQ0osSUFBSTtBQUNKLElBQUk7QUFHSixJQUFJO0FBR0osTUFBTSxZQUFZLG9CQUFJLElBQTJCO0FBQ2pELE1BQU0sZ0JBQWdCLG9CQUFJLElBQXlCO0FBQ25ELE1BQU0sZ0JBQWdCLEtBQUssT0FBTyxnQkFBaUIsT0FBZSxvQkFBb0I7QUFDdEYsSUFBSSxhQUEyQztBQUcvQyxJQUFJLFVBQXlCO0FBQzdCLE1BQU0sU0FBaUIsQ0FBQztBQUN4QixNQUFNLGNBQTJCLENBQUM7QUFDbEMsTUFBTSxZQUF1QixDQUFDO0FBQzlCLE1BQU0sVUFBNEcsQ0FBQztBQUduSCxNQUFNLGVBQWUsb0JBQUksSUFBWTtBQUNyQyxJQUFJLFlBQVk7QUFHaEIsSUFBSSxpQkFBb0M7QUFDeEMsSUFBSSx1QkFBMEM7QUFDOUMsSUFBSSxvQkFBdUM7QUFJM0MsU0FBUyxVQUFVLE1BQWMsT0FBZ0Is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
