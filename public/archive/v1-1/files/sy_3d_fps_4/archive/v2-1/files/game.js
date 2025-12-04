import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
class AssetManager {
  constructor(config2) {
    this.config = config2;
    this.textureLoader = new THREE.TextureLoader();
    this.audioLoader = new THREE.AudioLoader();
    this.textures = /* @__PURE__ */ new Map();
    this.audioBuffers = /* @__PURE__ */ new Map();
  }
  async loadAssets() {
    const texturePromises = this.config.assets.images.map((asset) => {
      return new Promise((resolve, reject) => {
        this.textureLoader.load(
          asset.path,
          (texture) => {
            this.textures.set(asset.name, texture);
            resolve();
          },
          void 0,
          // onProgress callback
          (error) => {
            console.error(`Failed to load texture ${asset.path}:`, error);
            reject(error);
          }
        );
      });
    });
    const audioPromises = this.config.assets.sounds.map((asset) => {
      return new Promise((resolve, reject) => {
        this.audioLoader.load(
          asset.path,
          (buffer) => {
            this.audioBuffers.set(asset.name, buffer);
            resolve();
          },
          void 0,
          // onProgress callback
          (error) => {
            console.error(`Failed to load audio ${asset.path}:`, error);
            reject(error);
          }
        );
      });
    });
    await Promise.all([...texturePromises, ...audioPromises]);
    console.log("All assets loaded.");
  }
  getTexture(name) {
    return this.textures.get(name);
  }
  getAudioBuffer(name) {
    return this.audioBuffers.get(name);
  }
}
class InputHandler {
  constructor() {
    this.keys = {};
    this.mouseButtons = {};
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.isPointerLocked = false;
    this.shootRequested = false;
    document.addEventListener("keydown", this.onKeyDown.bind(this), false);
    document.addEventListener("keyup", this.onKeyUp.bind(this), false);
    document.addEventListener("mousemove", this.onMouseMove.bind(this), false);
    document.addEventListener("mousedown", this.onMouseDown.bind(this), false);
    document.addEventListener("mouseup", this.onMouseUp.bind(this), false);
    document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this), false);
    document.addEventListener("webkitpointerlockchange", this.onPointerLockChange.bind(this), false);
    document.addEventListener("mozpointerlockchange", this.onPointerLockChange.bind(this), false);
  }
  onKeyDown(event) {
    this.keys[event.code] = true;
  }
  onKeyUp(event) {
    this.keys[event.code] = false;
  }
  onMouseMove(event) {
    if (this.isPointerLocked) {
      this.mouseDeltaX += event.movementX || 0;
      this.mouseDeltaY += event.movementY || 0;
    }
  }
  onMouseDown(event) {
    this.mouseButtons[event.button] = true;
    if (event.button === 0 && this.isPointerLocked) {
      this.shootRequested = true;
    }
  }
  onMouseUp(event) {
    this.mouseButtons[event.button] = false;
  }
  onPointerLockChange() {
    const gameCanvas = document.getElementById("gameCanvas");
    this.isPointerLocked = document.pointerLockElement === gameCanvas;
  }
  isKeyPressed(code) {
    return !!this.keys[code];
  }
  isMouseButtonPressed(button) {
    return !!this.mouseButtons[button];
  }
  consumeShootRequest() {
    if (this.shootRequested) {
      this.shootRequested = false;
      return true;
    }
    return false;
  }
  resetMouseDelta() {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }
}
class Player {
  // seconds
  constructor(scene2, world2, camera2, config2, physicsMaterial) {
    this.damageCooldown = 0.5;
    this.config = config2;
    this.camera = camera2;
    this.physicsMaterial = physicsMaterial;
    this.jumpTimeout = 0;
    this.health = this.config.health;
    this.lastDamageTime = 0;
    const capsuleShape = new CANNON.Cylinder(this.config.radius, this.config.radius, this.config.height, 8);
    const playerBody = new CANNON.Body({
      mass: this.config.mass,
      position: new CANNON.Vec3(0, this.config.height / 2 + 1, 0),
      // Start slightly above ground
      shape: capsuleShape,
      material: physicsMaterial,
      fixedRotation: true,
      // Prevent player from tipping over
      angularDamping: this.config.angularDamping,
      linearDamping: 0.9,
      // Add some linear damping for smoother stopping
      collisionFilterGroup: 1 /* PLAYER */,
      collisionFilterMask: 2 /* GROUND */ | 4 /* ENEMY */ | 16 /* WALL */
    });
    playerBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world2.addBody(playerBody);
    this.body = playerBody;
    const playerGeometry = new THREE.CylinderGeometry(this.config.radius, this.config.radius, this.config.height, 32);
    const playerMaterialMesh = new THREE.MeshBasicMaterial({ color: 65280, transparent: true, opacity: 0 });
    this.mesh = new THREE.Mesh(playerGeometry, playerMaterialMesh);
  }
  update(deltaTime, input, controls2) {
    if (this.health <= 0) {
      this.body.sleep();
      return;
    }
    this.body.wakeUp();
    if (input.isPointerLocked) {
      const mouseSensitivity = 2e-3;
      controls2.object.rotation.y -= input.mouseDeltaX * mouseSensitivity;
      controls2.object.children[0].rotation.x -= input.mouseDeltaY * mouseSensitivity;
      controls2.object.children[0].rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, controls2.object.children[0].rotation.x));
      input.resetMouseDelta();
    }
    const moveDirection = new THREE.Vector3();
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    const rightDirection = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();
    if (input.isKeyPressed("KeyW")) moveDirection.add(cameraDirection);
    if (input.isKeyPressed("KeyS")) moveDirection.sub(cameraDirection);
    if (input.isKeyPressed("KeyA")) moveDirection.sub(rightDirection);
    if (input.isKeyPressed("KeyD")) moveDirection.add(rightDirection);
    moveDirection.normalize();
    const targetVelocityX = moveDirection.x * this.config.speed;
    const targetVelocityZ = moveDirection.z * this.config.speed;
    this.body.velocity.x = targetVelocityX;
    this.body.velocity.z = targetVelocityZ;
    this.jumpTimeout -= deltaTime;
    if (input.isKeyPressed("Space") && this.jumpTimeout <= 0) {
      if (Math.abs(this.body.velocity.y) < 0.1 && this.body.position.y - this.config.height / 2 <= 0.1) {
        this.body.velocity.y = this.config.jumpForce;
        this.jumpTimeout = 0.5;
      }
    }
  }
  takeDamage(amount, currentTime) {
    if (currentTime - this.lastDamageTime > this.damageCooldown) {
      this.health -= amount;
      this.lastDamageTime = currentTime;
      console.log(`Player took ${amount} damage, health: ${this.health}`);
    }
  }
  reset() {
    this.health = this.config.health;
    this.body.position.set(0, this.config.height / 2 + 1, 0);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.wakeUp();
  }
}
class Bullet {
  // Flag to mark if bullet has hit something
  constructor(scene2, world2, config2, assetManager2, startPosition, velocity, bulletMaterial2) {
    this.isHit = false;
    this.config = config2;
    this.world = world2;
    this.initialLifetime = config2.lifetime;
    this.damage = config2.damage;
    const bulletTexture = assetManager2.getTexture("player_bullet");
    const bulletMaterialMesh = bulletTexture ? new THREE.MeshBasicMaterial({ map: bulletTexture }) : new THREE.MeshBasicMaterial({ color: 16776960 });
    const bulletGeometry = new THREE.SphereGeometry(config2.radius, 8, 8);
    this.mesh = new THREE.Mesh(bulletGeometry, bulletMaterialMesh);
    this.mesh.position.copy(startPosition);
    scene2.add(this.mesh);
    this.body = new CANNON.Body({
      mass: config2.mass,
      position: new CANNON.Vec3(startPosition.x, startPosition.y, startPosition.z),
      shape: new CANNON.Sphere(config2.radius),
      material: bulletMaterial2,
      collisionFilterGroup: 8 /* BULLET */,
      collisionFilterMask: 4 /* ENEMY */ | 2 /* GROUND */ | 16 /* WALL */,
      linearDamping: 0
      // No damping for bullets
    });
    this.body.velocity.set(velocity.x, velocity.y, velocity.z);
    world2.addBody(this.body);
    this.body.addEventListener("collide", (event) => {
      this.isHit = true;
    });
  }
  update(deltaTime) {
    this.mesh.position.copy(this.body.position);
    this.initialLifetime -= deltaTime;
    return this.initialLifetime <= 0 || this.isHit;
  }
  getDamage() {
    return this.damage;
  }
  destroy() {
    this.world.removeBody(this.body);
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
class Enemy {
  constructor(scene2, world2, config2, assetManager2, position, enemyMaterial2) {
    this.config = config2;
    this.world = world2;
    this.health = config2.health;
    this.isActive = true;
    this.lastAttackTime = 0;
    const enemyTexture = assetManager2.getTexture("enemy");
    const enemyMaterialMesh = enemyTexture ? new THREE.MeshBasicMaterial({ map: enemyTexture }) : new THREE.MeshBasicMaterial({ color: 16711680 });
    const enemyGeometry = new THREE.CylinderGeometry(config2.radius, config2.radius, config2.height, 16);
    this.mesh = new THREE.Mesh(enemyGeometry, enemyMaterialMesh);
    this.mesh.position.copy(position);
    scene2.add(this.mesh);
    const cylinderShape = new CANNON.Cylinder(config2.radius, config2.radius, config2.height, 8);
    this.body = new CANNON.Body({
      mass: config2.mass,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape: cylinderShape,
      material: enemyMaterial2,
      fixedRotation: true,
      // Prevent enemies from tipping over easily
      collisionFilterGroup: 4 /* ENEMY */,
      collisionFilterMask: 1 /* PLAYER */ | 8 /* BULLET */ | 2 /* GROUND */ | 16 /* WALL */ | 4 /* ENEMY */,
      linearDamping: 0.9
      // Some damping
    });
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world2.addBody(this.body);
  }
  update(deltaTime, playerPosition, player2) {
    if (!this.isActive || this.health <= 0) {
      this.body.sleep();
      this.mesh.visible = false;
      return;
    }
    this.body.wakeUp();
    this.mesh.position.copy(this.body.position);
    const toPlayer = new CANNON.Vec3();
    playerPosition.vsub(this.body.position, toPlayer);
    toPlayer.y = 0;
    toPlayer.normalize();
    const targetVelocity = toPlayer.scale(this.config.speed);
    this.body.velocity.x = targetVelocity.x;
    this.body.velocity.z = targetVelocity.z;
    const distanceToPlayer = this.body.position.distanceTo(playerPosition);
    if (distanceToPlayer < this.config.radius + player2.config.radius + 0.1) {
      if (Date.now() / 1e3 - this.lastAttackTime > this.config.attackInterval) {
        player2.takeDamage(this.config.damage, Date.now() / 1e3);
        this.lastAttackTime = Date.now() / 1e3;
      }
    }
  }
  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.isActive = false;
    }
  }
  destroy() {
    this.world.removeBody(this.body);
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
class UI {
  constructor(camera2, config2, assetManager2) {
    this.titleScreenMesh = null;
    this.gameOverScreenMesh = null;
    this.camera = camera2;
    this.config = config2;
    this.assetManager = assetManager2;
    this.healthMesh = this.createTextPlane("Health: 100", 65280);
    this.scoreMesh = this.createTextPlane("Score: 0", 65535);
    this.healthMesh.position.set(-0.7, 0.7, -1.5);
    this.scoreMesh.position.set(0.7, 0.7, -1.5);
    this.camera.add(this.healthMesh);
    this.camera.add(this.scoreMesh);
    const crosshairTexture = this.assetManager.getTexture("player_crosshair");
    const crosshairMaterial = crosshairTexture ? new THREE.SpriteMaterial({ map: crosshairTexture, color: 16777215, transparent: true }) : new THREE.SpriteMaterial({ color: 16777215, transparent: true, opacity: 0.5 });
    this.crosshairMesh = new THREE.Sprite(crosshairMaterial);
    this.crosshairMesh.scale.set(this.config.crosshairSize, this.config.crosshairSize, 1);
    this.crosshairMesh.position.set(0, 0, -1);
    this.camera.add(this.crosshairMesh);
    this.titleScreenMesh = null;
    this.gameOverScreenMesh = null;
  }
  createTextCanvas(text, color = "#FFFFFF", backgroundColor = "rgba(0,0,0,0)") {
    const canvas2 = document.createElement("canvas");
    const context = canvas2.getContext("2d");
    const fontSize = this.config.fontSize;
    const fontFamily = this.config.fontFamily;
    context.font = `${fontSize}px ${fontFamily}`;
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.5;
    canvas2.width = textWidth + 40;
    canvas2.height = textHeight + 40;
    context.font = `${fontSize}px ${fontFamily}`;
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas2.width, canvas2.height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      const yOffset = (index - (lines.length - 1) / 2) * fontSize * 1.2;
      context.fillText(line, canvas2.width / 2, canvas2.height / 2 + yOffset);
    });
    return canvas2;
  }
  createTextPlane(text, color) {
    const canvas2 = this.createTextCanvas(text, `#${color.toString(16).padStart(6, "0")}`);
    const texture = new THREE.CanvasTexture(canvas2);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const aspectRatio = canvas2.width / canvas2.height;
    const planeGeometry = new THREE.PlaneGeometry(0.5 * aspectRatio, 0.5);
    const mesh = new THREE.Mesh(planeGeometry, material);
    return mesh;
  }
  updateHealth(health) {
    const healthColor = health > 50 ? 65280 : health > 20 ? 16753920 : 16711680;
    const newMesh = this.createTextPlane(`Health: ${Math.max(0, health)}`, healthColor);
    this.camera.remove(this.healthMesh);
    this.healthMesh.geometry.dispose();
    if (this.healthMesh.material.map) {
      this.healthMesh.material.map?.dispose();
    }
    this.healthMesh.material.dispose();
    this.healthMesh = newMesh;
    this.healthMesh.position.set(-0.7, 0.7, -1.5);
    this.camera.add(this.healthMesh);
  }
  updateScore(score2) {
    const newMesh = this.createTextPlane(`Score: ${score2}`, 65535);
    this.camera.remove(this.scoreMesh);
    this.scoreMesh.geometry.dispose();
    if (this.scoreMesh.material.map) {
      this.scoreMesh.material.map?.dispose();
    }
    this.scoreMesh.material.dispose();
    this.scoreMesh = newMesh;
    this.scoreMesh.position.set(0.7, 0.7, -1.5);
    this.camera.add(this.scoreMesh);
  }
  showTitleScreen() {
    if (this.titleScreenMesh) return;
    this.hideHUD();
    this.hideGameOverScreen();
    const canvas2 = this.createTextCanvas(`${this.config.titleScreenText}

${this.config.pressToStartText}`, this.config.fontColor, "rgba(0,0,0,0.7)");
    const texture = new THREE.CanvasTexture(canvas2);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const aspectRatio = canvas2.width / canvas2.height;
    const planeGeometry = new THREE.PlaneGeometry(3 * aspectRatio, 3);
    this.titleScreenMesh = new THREE.Mesh(planeGeometry, material);
    this.titleScreenMesh.position.set(0, 0, -3);
    this.camera.add(this.titleScreenMesh);
  }
  hideTitleScreen() {
    if (this.titleScreenMesh) {
      this.camera.remove(this.titleScreenMesh);
      this.titleScreenMesh.geometry.dispose();
      if (this.titleScreenMesh.material.map) {
        this.titleScreenMesh.material.map?.dispose();
      }
      this.titleScreenMesh.material.dispose();
      this.titleScreenMesh = null;
    }
    this.showHUD();
  }
  showGameOverScreen(score2) {
    if (this.gameOverScreenMesh) return;
    this.hideHUD();
    this.hideTitleScreen();
    const canvas2 = this.createTextCanvas(`${this.config.gameOverText}
Score: ${score2}

${this.config.pressToStartText}`, this.config.fontColor, "rgba(0,0,0,0.7)");
    const texture = new THREE.CanvasTexture(canvas2);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const aspectRatio = canvas2.width / canvas2.height;
    const planeGeometry = new THREE.PlaneGeometry(3 * aspectRatio, 3);
    this.gameOverScreenMesh = new THREE.Mesh(planeGeometry, material);
    this.gameOverScreenMesh.position.set(0, 0, -3);
    this.camera.add(this.gameOverScreenMesh);
  }
  hideGameOverScreen() {
    if (this.gameOverScreenMesh) {
      this.camera.remove(this.gameOverScreenMesh);
      this.gameOverScreenMesh.geometry.dispose();
      if (this.gameOverScreenMesh.material.map) {
        this.gameOverScreenMesh.material.map?.dispose();
      }
      this.gameOverScreenMesh.material.dispose();
      this.gameOverScreenMesh = null;
    }
  }
  showHUD() {
    this.healthMesh.visible = true;
    this.scoreMesh.visible = true;
    this.crosshairMesh.visible = true;
  }
  hideHUD() {
    this.healthMesh.visible = false;
    this.scoreMesh.visible = false;
    this.crosshairMesh.visible = false;
  }
  dispose() {
    this.hideTitleScreen();
    this.hideGameOverScreen();
    this.camera.remove(this.healthMesh);
    this.healthMesh.geometry.dispose();
    if (this.healthMesh.material.map) {
      this.healthMesh.material.map?.dispose();
    }
    this.healthMesh.material.dispose();
    this.camera.remove(this.scoreMesh);
    this.scoreMesh.geometry.dispose();
    if (this.scoreMesh.material.map) {
      this.scoreMesh.material.map?.dispose();
    }
    this.scoreMesh.material.dispose();
    this.camera.remove(this.crosshairMesh);
    if (this.crosshairMesh.material.map) {
      this.crosshairMesh.material.map?.dispose();
    }
    this.crosshairMesh.material.dispose();
  }
}
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["LOADING"] = 0] = "LOADING";
  GameState2[GameState2["TITLE"] = 1] = "TITLE";
  GameState2[GameState2["PLAYING"] = 2] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 3] = "GAME_OVER";
  return GameState2;
})(GameState || {});
var CollisionGroups = /* @__PURE__ */ ((CollisionGroups2) => {
  CollisionGroups2[CollisionGroups2["PLAYER"] = 1] = "PLAYER";
  CollisionGroups2[CollisionGroups2["GROUND"] = 2] = "GROUND";
  CollisionGroups2[CollisionGroups2["ENEMY"] = 4] = "ENEMY";
  CollisionGroups2[CollisionGroups2["BULLET"] = 8] = "BULLET";
  CollisionGroups2[CollisionGroups2["WALL"] = 16] = "WALL";
  return CollisionGroups2;
})(CollisionGroups || {});
let config;
let assetManager;
let inputHandler;
let scene;
let camera;
let renderer;
let controls;
let ui;
let world;
let player;
let enemies = [];
let bullets = [];
let gameState = 0 /* LOADING */;
let score = 0;
let lastFrameTime = 0;
let canvas;
let groundMaterial;
let playerMaterial;
let enemyMaterial;
let bulletMaterial;
let audioListener;
let bgm;
let soundEffectMap;
async function initGame() {
  console.log("Initializing game...");
  canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error('Canvas element with ID "gameCanvas" not found.');
    return;
  }
  try {
    const response = await fetch("data.json");
    config = await response.json();
    console.log("Config loaded:", config);
  } catch (error) {
    console.error("Failed to load data.json:", error);
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
  window.addEventListener("resize", onWindowResize, false);
  onWindowResize();
  gameState = 1 /* TITLE */;
  ui.showTitleScreen();
  animate(0);
}
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(8900331);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1e3);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
}
function setupPhysics() {
  world = new CANNON.World();
  world.gravity.set(0, -config.game.gravity, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  const solver = new CANNON.GSSolver();
  solver.iterations = 10;
  world.solver = solver;
  groundMaterial = new CANNON.Material("groundMaterial");
  playerMaterial = new CANNON.Material("playerMaterial");
  enemyMaterial = new CANNON.Material("enemyMaterial");
  bulletMaterial = new CANNON.Material("bulletMaterial");
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
    groundMaterial,
    // Walls use ground material
    playerMaterial,
    { friction: 0.1, restitution: 0.1 }
  );
  world.addContactMaterial(wallPlayerCM);
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial, collisionFilterGroup: 2 /* GROUND */ });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);
  const groundTexture = assetManager.getTexture("floor_texture");
  if (groundTexture) {
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(config.game.floorSize / 2, config.game.floorSize / 2);
  }
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(config.game.floorSize, config.game.floorSize, 10, 10),
    new THREE.MeshStandardMaterial({ map: groundTexture, side: THREE.DoubleSide })
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  const wallTexture = assetManager.getTexture("wall_texture");
  if (wallTexture) {
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(config.game.floorSize / 5, config.game.wallHeight / 5);
  }
  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, side: THREE.DoubleSide });
  const wallGeometry = new THREE.BoxGeometry(config.game.floorSize, config.game.wallHeight, 0.5);
  function createWall(x, y, z, rotY) {
    const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    wallMesh.position.set(x, y, z);
    wallMesh.rotation.y = rotY;
    scene.add(wallMesh);
    const wallBody = new CANNON.Body({ mass: 0, material: groundMaterial, collisionFilterGroup: 16 /* WALL */ });
    const boxShape = new CANNON.Box(new CANNON.Vec3(config.game.floorSize / 2, config.game.wallHeight / 2, 0.25));
    wallBody.addShape(boxShape);
    wallBody.position.set(x, y, z);
    wallBody.quaternion.setFromEuler(0, rotY, 0);
    world.addBody(wallBody);
  }
  const halfFloor = config.game.floorSize / 2;
  const halfWallHeight = config.game.wallHeight / 2;
  createWall(0, halfWallHeight, -halfFloor, 0);
  createWall(0, halfWallHeight, halfFloor, Math.PI);
  createWall(-halfFloor, halfWallHeight, 0, Math.PI / 2);
  createWall(halfFloor, halfWallHeight, 0, -Math.PI / 2);
}
function setupPlayer() {
  player = new Player(scene, world, camera, config.player, playerMaterial);
  controls = new PointerLockControls(camera, canvas);
  player.mesh.add(controls.object);
  scene.add(player.mesh);
  controls.object.position.set(
    config.player.cameraOffset.x,
    config.player.cameraOffset.y,
    config.player.cameraOffset.z
  );
}
function setupEnemies() {
  for (let i = 0; i < config.enemy.count; i++) {
    const angle = i / config.enemy.count * Math.PI * 2 + Math.random() * 0.5;
    const radiusOffset = Math.random() * (config.enemy.spawnRadius / 2);
    const x = Math.cos(angle) * (config.enemy.spawnRadius - radiusOffset);
    const z = Math.sin(angle) * (config.enemy.spawnRadius - radiusOffset);
    const enemyPosition = new THREE.Vector3(x, config.enemy.height / 2, z);
    const enemy = new Enemy(scene, world, config.enemy, assetManager, enemyPosition, enemyMaterial);
    enemies.push(enemy);
  }
}
function setupInput() {
  inputHandler = new InputHandler();
  canvas.addEventListener("click", () => {
    if (gameState === 1 /* TITLE */ || gameState === 3 /* GAME_OVER */) {
      canvas.requestPointerLock();
      startGame();
    }
  });
}
function setupAudio() {
  audioListener = new THREE.AudioListener();
  camera.add(audioListener);
  const bgmBuffer = assetManager.getAudioBuffer("bgm");
  if (bgmBuffer) {
    bgm = new THREE.Audio(audioListener);
    bgm.setBuffer(bgmBuffer);
    bgm.setLoop(true);
    bgm.setVolume(config.assets.sounds.find((s) => s.name === "bgm")?.volume || 0.3);
  }
  soundEffectMap = /* @__PURE__ */ new Map();
  config.assets.sounds.filter((s) => s.name !== "bgm").forEach((soundConfig) => {
    const buffer = assetManager.getAudioBuffer(soundConfig.name);
    if (buffer) {
      const sound = new THREE.Audio(audioListener);
      sound.setBuffer(buffer);
      sound.setVolume(soundConfig.volume);
      soundEffectMap.set(soundConfig.name, sound);
    }
  });
}
function setupUI() {
  ui = new UI(camera, config.ui, assetManager);
}
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
function startGame() {
  if (gameState === 2 /* PLAYING */) return;
  console.log("Starting game...");
  gameState = 2 /* PLAYING */;
  score = 0;
  player.reset();
  player.mesh.position.copy(player.body.position);
  controls.object.rotation.y = 0;
  controls.object.children[0].rotation.x = 0;
  enemies.forEach((e) => e.destroy());
  enemies = [];
  setupEnemies();
  bullets.forEach((b) => b.destroy());
  bullets = [];
  ui.hideTitleScreen();
  ui.hideGameOverScreen();
  ui.updateHealth(player.health);
  ui.updateScore(score);
  if (bgm && !bgm.isPlaying) {
    bgm.play();
  }
}
function gameOver() {
  if (gameState === 3 /* GAME_OVER */) return;
  console.log("Game Over!");
  gameState = 3 /* GAME_OVER */;
  ui.showGameOverScreen(score);
  if (bgm && bgm.isPlaying) {
    bgm.stop();
  }
  const gameOverSound = soundEffectMap.get("game_over");
  if (gameOverSound) {
    gameOverSound.stop();
    gameOverSound.play();
  }
  document.exitPointerLock();
}
function animate(currentTime) {
  requestAnimationFrame(animate);
  const deltaTime = (currentTime - lastFrameTime) / 1e3;
  lastFrameTime = currentTime;
  if (gameState === 2 /* PLAYING */) {
    world.step(1 / config.game.targetFPS, deltaTime, 3);
    player.update(deltaTime, inputHandler, controls);
    player.mesh.position.copy(player.body.position);
    enemies.forEach((enemy) => {
      enemy.update(deltaTime, player.body.position, player);
    });
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (bullet.update(deltaTime)) {
        bullet.destroy();
        bullets.splice(i, 1);
      }
    }
    if (inputHandler.consumeShootRequest()) {
      shootBullet();
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (bullet.isHit) {
        for (let j = enemies.length - 1; j >= 0; j--) {
          const enemy = enemies[j];
          if (!enemy.isActive) continue;
          const distance = bullet.body.position.distanceTo(enemy.body.position);
          if (distance < bullet.config.radius + enemy.config.radius + 0.1) {
            enemy.takeDamage(bullet.getDamage());
            score += 10;
            ui.updateScore(score);
            const hitSound = soundEffectMap.get("hit");
            if (hitSound) {
              hitSound.stop();
              hitSound.play();
            }
            if (!enemy.isActive) {
              score += 50;
              ui.updateScore(score);
            }
            break;
          }
        }
      }
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (!enemies[i].isActive) {
        enemies[i].destroy();
        enemies.splice(i, 1);
      }
    }
    if (player.health <= 0) {
      gameOver();
    } else if (enemies.length === 0 && score >= config.game.maxScore) {
      gameOver();
    }
  }
  renderer.render(scene, camera);
}
function shootBullet() {
  const shootSound = soundEffectMap.get("shoot");
  if (shootSound) {
    shootSound.stop();
    shootSound.play();
  }
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  const absoluteCameraPosition = new THREE.Vector3();
  camera.getWorldPosition(absoluteCameraPosition);
  const spawnOffset = new THREE.Vector3().copy(cameraDirection).multiplyScalar(0.5);
  const startPosition = absoluteCameraPosition.add(spawnOffset);
  const velocity = cameraDirection.multiplyScalar(config.bullet.speed);
  const bullet = new Bullet(scene, world, config.bullet, assetManager, startPosition, velocity, bulletMaterial);
  bullets.push(bullet);
}
initGame();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuaW1wb3J0IHsgUG9pbnRlckxvY2tDb250cm9scyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS9jb250cm9scy9Qb2ludGVyTG9ja0NvbnRyb2xzLmpzJztcclxuXHJcbi8vIENvbmZpZ3VyYXRpb24gSW50ZXJmYWNlIGZvciBkYXRhLmpzb25cclxuaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgcGxheWVyOiB7XHJcbiAgICAgICAgc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBqdW1wRm9yY2U6IG51bWJlcjtcclxuICAgICAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgICAgICByYWRpdXM6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBtYXNzOiBudW1iZXI7XHJcbiAgICAgICAgZnJpY3Rpb246IG51bWJlcjtcclxuICAgICAgICBhbmd1bGFyRGFtcGluZzogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYU9mZnNldDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB9O1xyXG4gICAgfTtcclxuICAgIGJ1bGxldDoge1xyXG4gICAgICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgcmFkaXVzOiBudW1iZXI7XHJcbiAgICAgICAgbWFzczogbnVtYmVyO1xyXG4gICAgICAgIGxpZmV0aW1lOiBudW1iZXI7XHJcbiAgICAgICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgZW5lbXk6IHtcclxuICAgICAgICBjb3VudDogbnVtYmVyO1xyXG4gICAgICAgIHJhZGl1czogbnVtYmVyO1xyXG4gICAgICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIG1hc3M6IG51bWJlcjtcclxuICAgICAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIHNwYXduUmFkaXVzOiBudW1iZXI7XHJcbiAgICAgICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICAgICAgYXR0YWNrSW50ZXJ2YWw6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBnYW1lOiB7XHJcbiAgICAgICAgZ3Jhdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGZsb29yU2l6ZTogbnVtYmVyO1xyXG4gICAgICAgIHdhbGxIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBtYXhTY29yZTogbnVtYmVyO1xyXG4gICAgICAgIHRhcmdldEZQUzogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIHVpOiB7XHJcbiAgICAgICAgZm9udFNpemU6IG51bWJlcjtcclxuICAgICAgICBmb250RmFtaWx5OiBzdHJpbmc7XHJcbiAgICAgICAgZm9udENvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgY3Jvc3NoYWlyU2l6ZTogbnVtYmVyO1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHByZXNzVG9TdGFydFRleHQ6IHN0cmluZztcclxuICAgIH07XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyOyB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG4vLyAtLS0gQXNzZXRNYW5hZ2VyIC0tLVxyXG5jbGFzcyBBc3NldE1hbmFnZXIge1xyXG4gICAgcHJpdmF0ZSB0ZXh0dXJlTG9hZGVyOiBUSFJFRS5UZXh0dXJlTG9hZGVyO1xyXG4gICAgcHJpdmF0ZSBhdWRpb0xvYWRlcjogVEhSRUUuQXVkaW9Mb2FkZXI7XHJcbiAgICBwcml2YXRlIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPjtcclxuICAgIHByaXZhdGUgYXVkaW9CdWZmZXJzOiBNYXA8c3RyaW5nLCBBdWRpb0J1ZmZlcj47XHJcbiAgICBwcml2YXRlIGNvbmZpZzogR2FtZUNvbmZpZztcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihjb25maWc6IEdhbWVDb25maWcpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLnRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIHRoaXMuYXVkaW9Mb2FkZXIgPSBuZXcgVEhSRUUuQXVkaW9Mb2FkZXIoKTtcclxuICAgICAgICB0aGlzLnRleHR1cmVzID0gbmV3IE1hcCgpO1xyXG4gICAgICAgIHRoaXMuYXVkaW9CdWZmZXJzID0gbmV3IE1hcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoYXNzZXQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlTG9hZGVyLmxvYWQoYXNzZXQucGF0aCxcclxuICAgICAgICAgICAgICAgICAgICAodGV4dHVyZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVzLnNldChhc3NldC5uYW1lLCB0ZXh0dXJlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLCAvLyBvblByb2dyZXNzIGNhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICAgICAgKGVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmUgJHthc3NldC5wYXRofTpgLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGF1ZGlvUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChhc3NldCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvTG9hZGVyLmxvYWQoYXNzZXQucGF0aCxcclxuICAgICAgICAgICAgICAgICAgICAoYnVmZmVyKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9CdWZmZXJzLnNldChhc3NldC5uYW1lLCBidWZmZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsIC8vIG9uUHJvZ3Jlc3MgY2FsbGJhY2tcclxuICAgICAgICAgICAgICAgICAgICAoZXJyb3IpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgYXVkaW8gJHthc3NldC5wYXRofTpgLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi50ZXh0dXJlUHJvbWlzZXMsIC4uLmF1ZGlvUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnQWxsIGFzc2V0cyBsb2FkZWQuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0VGV4dHVyZShuYW1lOiBzdHJpbmcpOiBUSFJFRS5UZXh0dXJlIHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50ZXh0dXJlcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0QXVkaW9CdWZmZXIobmFtZTogc3RyaW5nKTogQXVkaW9CdWZmZXIgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmF1ZGlvQnVmZmVycy5nZXQobmFtZSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBJbnB1dEhhbmRsZXIgLS0tXHJcbmNsYXNzIElucHV0SGFuZGxlciB7XHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9O1xyXG4gICAgcHJpdmF0ZSBtb3VzZUJ1dHRvbnM6IHsgW2J1dHRvbjogbnVtYmVyXTogYm9vbGVhbiB9O1xyXG4gICAgcHVibGljIG1vdXNlRGVsdGFYOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgbW91c2VEZWx0YVk6IG51bWJlcjtcclxuICAgIHB1YmxpYyBpc1BvaW50ZXJMb2NrZWQ6IGJvb2xlYW47XHJcbiAgICBwdWJsaWMgc2hvb3RSZXF1ZXN0ZWQ6IGJvb2xlYW47XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5rZXlzID0ge307XHJcbiAgICAgICAgdGhpcy5tb3VzZUJ1dHRvbnMgPSB7fTtcclxuICAgICAgICB0aGlzLm1vdXNlRGVsdGFYID0gMDtcclxuICAgICAgICB0aGlzLm1vdXNlRGVsdGFZID0gMDtcclxuICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuc2hvb3RSZXF1ZXN0ZWQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMub25LZXlVcC5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHRoaXMub25Nb3VzZVVwLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSwgZmFsc2UpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21venBvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5jb2RlXSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmNvZGVdID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICB0aGlzLm1vdXNlRGVsdGFYICs9IGV2ZW50Lm1vdmVtZW50WCB8fCAwO1xyXG4gICAgICAgICAgICB0aGlzLm1vdXNlRGVsdGFZICs9IGV2ZW50Lm1vdmVtZW50WSB8fCAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTW91c2VEb3duKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5tb3VzZUJ1dHRvbnNbZXZlbnQuYnV0dG9uXSA9IHRydWU7XHJcbiAgICAgICAgaWYgKGV2ZW50LmJ1dHRvbiA9PT0gMCAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkgeyAvLyBMZWZ0IG1vdXNlIGJ1dHRvblxyXG4gICAgICAgICAgICB0aGlzLnNob290UmVxdWVzdGVkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlVXAoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm1vdXNlQnV0dG9uc1tldmVudC5idXR0b25dID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrQ2hhbmdlKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGdhbWVDYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpO1xyXG4gICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSBnYW1lQ2FudmFzO1xyXG4gICAgfVxyXG5cclxuICAgIGlzS2V5UHJlc3NlZChjb2RlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gISF0aGlzLmtleXNbY29kZV07XHJcbiAgICB9XHJcblxyXG4gICAgaXNNb3VzZUJ1dHRvblByZXNzZWQoYnV0dG9uOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gISF0aGlzLm1vdXNlQnV0dG9uc1tidXR0b25dO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN1bWVTaG9vdFJlcXVlc3QoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2hvb3RSZXF1ZXN0ZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5zaG9vdFJlcXVlc3RlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHJlc2V0TW91c2VEZWx0YSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm1vdXNlRGVsdGFYID0gMDtcclxuICAgICAgICB0aGlzLm1vdXNlRGVsdGFZID0gMDtcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIFBsYXllciBDbGFzcyAtLS1cclxuY2xhc3MgUGxheWVyIHtcclxuICAgIHB1YmxpYyBtZXNoOiBUSFJFRS5NZXNoOyAvLyBJbnZpc2libGUgbWVzaCB0byBrZWVwIHRyYWNrIG9mIHBsYXllciBwb3NpdGlvbi9yb3RhdGlvbiBmb3IgcGh5c2ljc1xyXG4gICAgcHVibGljIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgcHVibGljIGNhbWVyYTogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbiAgICBwdWJsaWMgY29uZmlnOiBHYW1lQ29uZmlnWydwbGF5ZXInXTsgLy8gTWFrZSBjb25maWcgcHVibGljIGZvciBlbmVteSBpbnRlcmFjdGlvblxyXG4gICAgcHJpdmF0ZSBwaHlzaWNzTWF0ZXJpYWw6IENBTk5PTi5NYXRlcmlhbDtcclxuICAgIHByaXZhdGUganVtcFRpbWVvdXQ6IG51bWJlcjtcclxuICAgIHB1YmxpYyBoZWFsdGg6IG51bWJlcjtcclxuICAgIHByaXZhdGUgbGFzdERhbWFnZVRpbWU6IG51bWJlcjtcclxuICAgIHByaXZhdGUgZGFtYWdlQ29vbGRvd246IG51bWJlciA9IDAuNTsgLy8gc2Vjb25kc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBUSFJFRS5TY2VuZSwgd29ybGQ6IENBTk5PTi5Xb3JsZCwgY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSwgY29uZmlnOiBHYW1lQ29uZmlnWydwbGF5ZXInXSwgcGh5c2ljc01hdGVyaWFsOiBDQU5OT04uTWF0ZXJpYWwpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IGNhbWVyYTtcclxuICAgICAgICB0aGlzLnBoeXNpY3NNYXRlcmlhbCA9IHBoeXNpY3NNYXRlcmlhbDtcclxuICAgICAgICB0aGlzLmp1bXBUaW1lb3V0ID0gMDtcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IHRoaXMuY29uZmlnLmhlYWx0aDtcclxuICAgICAgICB0aGlzLmxhc3REYW1hZ2VUaW1lID0gMDtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHBoeXNpY3MgYm9keSAoQ2Fwc3VsZSBmb3IgYmV0dGVyIGNvbGxpc2lvbiB3aXRoIGZsb29ycy93YWxscylcclxuICAgICAgICBjb25zdCBjYXBzdWxlU2hhcGUgPSBuZXcgQ0FOTk9OLkN5bGluZGVyKHRoaXMuY29uZmlnLnJhZGl1cywgdGhpcy5jb25maWcucmFkaXVzLCB0aGlzLmNvbmZpZy5oZWlnaHQsIDgpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiB0aGlzLmNvbmZpZy5tYXNzLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKDAsIHRoaXMuY29uZmlnLmhlaWdodCAvIDIgKyAxLCAwKSwgLy8gU3RhcnQgc2xpZ2h0bHkgYWJvdmUgZ3JvdW5kXHJcbiAgICAgICAgICAgIHNoYXBlOiBjYXBzdWxlU2hhcGUsXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiBwaHlzaWNzTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUsIC8vIFByZXZlbnQgcGxheWVyIGZyb20gdGlwcGluZyBvdmVyXHJcbiAgICAgICAgICAgIGFuZ3VsYXJEYW1waW5nOiB0aGlzLmNvbmZpZy5hbmd1bGFyRGFtcGluZyxcclxuICAgICAgICAgICAgbGluZWFyRGFtcGluZzogMC45LCAvLyBBZGQgc29tZSBsaW5lYXIgZGFtcGluZyBmb3Igc21vb3RoZXIgc3RvcHBpbmdcclxuICAgICAgICAgICAgY29sbGlzaW9uRmlsdGVyR3JvdXA6IENvbGxpc2lvbkdyb3Vwcy5QTEFZRVIsXHJcbiAgICAgICAgICAgIGNvbGxpc2lvbkZpbHRlck1hc2s6IENvbGxpc2lvbkdyb3Vwcy5HUk9VTkQgfCBDb2xsaXNpb25Hcm91cHMuRU5FTVkgfCBDb2xsaXNpb25Hcm91cHMuV0FMTFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHBsYXllckJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygxLCAwLCAwKSwgLU1hdGguUEkgLyAyKTsgLy8gT3JpZW50IGN5bGluZGVyIHZlcnRpY2FsbHlcclxuICAgICAgICB3b3JsZC5hZGRCb2R5KHBsYXllckJvZHkpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IHBsYXllckJvZHk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciB2aXN1YWwgbWVzaCAoc2ltcGxlIGN5bGluZGVyIGZvciByZXByZXNlbnRhdGlvbiwgY2FtZXJhIGlzIG1haW4gdmlldylcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5DeWxpbmRlckdlb21ldHJ5KHRoaXMuY29uZmlnLnJhZGl1cywgdGhpcy5jb25maWcucmFkaXVzLCB0aGlzLmNvbmZpZy5oZWlnaHQsIDMyKTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJNYXRlcmlhbE1lc2ggPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBjb2xvcjogMHgwMGZmMDAsIHRyYW5zcGFyZW50OiB0cnVlLCBvcGFjaXR5OiAwIH0pOyAvLyBJbnZpc2libGUgcGxheWVyXHJcbiAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsTWVzaCk7XHJcbiAgICAgICAgLy8gc2NlbmUuYWRkKHRoaXMubWVzaCk7IC8vIFJFTU9WRUQ6IHBsYXllci5tZXNoIHdpbGwgYmUgYWRkZWQgdG8gdGhlIHNjZW5lIGluIHNldHVwUGxheWVyKCkgYWZ0ZXIgY29udHJvbHMub2JqZWN0IGlzIHBhcmVudGVkIHRvIGl0LlxyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgaW5wdXQ6IElucHV0SGFuZGxlciwgY29udHJvbHM6IFBvaW50ZXJMb2NrQ29udHJvbHMpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmJvZHkuc2xlZXAoKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmJvZHkud2FrZVVwKCk7XHJcblxyXG4gICAgICAgIC8vIENhbWVyYSByb3RhdGlvbiBmcm9tIG1vdXNlIGlucHV0IGlzIGhhbmRsZWQgYnkgUG9pbnRlckxvY2tDb250cm9scyBkaXJlY3RseVxyXG4gICAgICAgIC8vIFBsYXllciBib2R5IHBvc2l0aW9uIGlzIHVwZGF0ZWQgdG8gY2FtZXJhIHBvc2l0aW9uIGluIHRoZSBtYWluIGxvb3BcclxuICAgICAgICBpZiAoaW5wdXQuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdXNlU2Vuc2l0aXZpdHkgPSAwLjAwMjtcclxuICAgICAgICAgICAgY29udHJvbHMub2JqZWN0LnJvdGF0aW9uLnkgLT0gaW5wdXQubW91c2VEZWx0YVggKiBtb3VzZVNlbnNpdGl2aXR5O1xyXG4gICAgICAgICAgICBjb250cm9scy5vYmplY3QuY2hpbGRyZW5bMF0ucm90YXRpb24ueCAtPSBpbnB1dC5tb3VzZURlbHRhWSAqIG1vdXNlU2Vuc2l0aXZpdHk7XHJcbiAgICAgICAgICAgIGNvbnRyb2xzLm9iamVjdC5jaGlsZHJlblswXS5yb3RhdGlvbi54ID0gTWF0aC5tYXgoLU1hdGguUEkgLyAyLCBNYXRoLm1pbihNYXRoLlBJIC8gMiwgY29udHJvbHMub2JqZWN0LmNoaWxkcmVuWzBdLnJvdGF0aW9uLngpKTtcclxuICAgICAgICAgICAgaW5wdXQucmVzZXRNb3VzZURlbHRhKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBcHBseSBtb3ZlbWVudCBmb3JjZXMgYmFzZWQgb24gY2FtZXJhIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IG1vdmVEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIGNvbnN0IGNhbWVyYURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24oY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ueSA9IDA7IC8vIE9ubHkgaG9yaXpvbnRhbCBtb3ZlbWVudCBmb3IgcGxheWVyXHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICBjb25zdCByaWdodERpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApLCBjYW1lcmFEaXJlY3Rpb24pLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICBpZiAoaW5wdXQuaXNLZXlQcmVzc2VkKCdLZXlXJykpIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgaWYgKGlucHV0LmlzS2V5UHJlc3NlZCgnS2V5UycpKSBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgIGlmIChpbnB1dC5pc0tleVByZXNzZWQoJ0tleUEnKSkgbW92ZURpcmVjdGlvbi5zdWIocmlnaHREaXJlY3Rpb24pO1xyXG4gICAgICAgIGlmIChpbnB1dC5pc0tleVByZXNzZWQoJ0tleUQnKSkgbW92ZURpcmVjdGlvbi5hZGQocmlnaHREaXJlY3Rpb24pO1xyXG5cclxuICAgICAgICBtb3ZlRGlyZWN0aW9uLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICAvLyBBcHBseSB0aGUgdGFyZ2V0IHZlbG9jaXR5IGRpcmVjdGx5LCBwcmVzZXJ2aW5nIGN1cnJlbnQgWSB2ZWxvY2l0eSBmb3IgZ3Jhdml0eS9qdW1wXHJcbiAgICAgICAgY29uc3QgdGFyZ2V0VmVsb2NpdHlYID0gbW92ZURpcmVjdGlvbi54ICogdGhpcy5jb25maWcuc3BlZWQ7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0VmVsb2NpdHlaID0gbW92ZURpcmVjdGlvbi56ICogdGhpcy5jb25maWcuc3BlZWQ7XHJcblxyXG4gICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS54ID0gdGFyZ2V0VmVsb2NpdHlYO1xyXG4gICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS56ID0gdGFyZ2V0VmVsb2NpdHlaO1xyXG5cclxuICAgICAgICAvLyBKdW1wXHJcbiAgICAgICAgdGhpcy5qdW1wVGltZW91dCAtPSBkZWx0YVRpbWU7XHJcbiAgICAgICAgaWYgKGlucHV0LmlzS2V5UHJlc3NlZCgnU3BhY2UnKSAmJiB0aGlzLmp1bXBUaW1lb3V0IDw9IDApIHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcGxheWVyIGlzIG9uIGdyb3VuZC4gQSBzaW1wbGUgYXBwcm94aW1hdGlvbjpcclxuICAgICAgICAgICAgLy8gaWYgcGxheWVyJ3MgeSB2ZWxvY2l0eSBpcyBjbG9zZSB0byB6ZXJvIGFuZCBpdHMgYm90dG9tIGlzIG5lYXIgdGhlIGdyb3VuZCBwbGFuZS5cclxuICAgICAgICAgICAgaWYgKE1hdGguYWJzKHRoaXMuYm9keS52ZWxvY2l0eS55KSA8IDAuMSAmJiB0aGlzLmJvZHkucG9zaXRpb24ueSAtIHRoaXMuY29uZmlnLmhlaWdodCAvIDIgPD0gMC4xKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJvZHkudmVsb2NpdHkueSA9IHRoaXMuY29uZmlnLmp1bXBGb3JjZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuanVtcFRpbWVvdXQgPSAwLjU7IC8vIENvb2xkb3duIGZvciBqdW1waW5nXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShhbW91bnQ6IG51bWJlciwgY3VycmVudFRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmIChjdXJyZW50VGltZSAtIHRoaXMubGFzdERhbWFnZVRpbWUgPiB0aGlzLmRhbWFnZUNvb2xkb3duKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGVhbHRoIC09IGFtb3VudDtcclxuICAgICAgICAgICAgdGhpcy5sYXN0RGFtYWdlVGltZSA9IGN1cnJlbnRUaW1lO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgUGxheWVyIHRvb2sgJHthbW91bnR9IGRhbWFnZSwgaGVhbHRoOiAke3RoaXMuaGVhbHRofWApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXNldCgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IHRoaXMuY29uZmlnLmhlYWx0aDtcclxuICAgICAgICB0aGlzLmJvZHkucG9zaXRpb24uc2V0KDAsIHRoaXMuY29uZmlnLmhlaWdodCAvIDIgKyAxLCAwKTsgLy8gUmVzZXQgdG8gc3Bhd24gcG9zaXRpb25cclxuICAgICAgICB0aGlzLmJvZHkudmVsb2NpdHkuc2V0KDAsIDAsIDApO1xyXG4gICAgICAgIHRoaXMuYm9keS5hbmd1bGFyVmVsb2NpdHkuc2V0KDAsIDAsIDApO1xyXG4gICAgICAgIHRoaXMuYm9keS53YWtlVXAoKTsgLy8gRW5zdXJlIGJvZHkgaXMgYWN0aXZlXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBCdWxsZXQgQ2xhc3MgLS0tXHJcbmNsYXNzIEJ1bGxldCB7XHJcbiAgICBwdWJsaWMgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIHB1YmxpYyBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIHB1YmxpYyBjb25maWc6IEdhbWVDb25maWdbJ2J1bGxldCddOyAvLyBNYWRlIHB1YmxpYyBmb3IgYWNjZXNzXHJcbiAgICBwcml2YXRlIHdvcmxkOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwcml2YXRlIGluaXRpYWxMaWZldGltZTogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBkYW1hZ2U6IG51bWJlcjtcclxuICAgIHB1YmxpYyBpc0hpdDogYm9vbGVhbiA9IGZhbHNlOyAvLyBGbGFnIHRvIG1hcmsgaWYgYnVsbGV0IGhhcyBoaXQgc29tZXRoaW5nXHJcblxyXG4gICAgY29uc3RydWN0b3Ioc2NlbmU6IFRIUkVFLlNjZW5lLCB3b3JsZDogQ0FOTk9OLldvcmxkLCBjb25maWc6IEdhbWVDb25maWdbJ2J1bGxldCddLCBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlciwgc3RhcnRQb3NpdGlvbjogVEhSRUUuVmVjdG9yMywgdmVsb2NpdHk6IFRIUkVFLlZlY3RvcjMsIGJ1bGxldE1hdGVyaWFsOiBDQU5OT04uTWF0ZXJpYWwpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLndvcmxkID0gd29ybGQ7XHJcbiAgICAgICAgdGhpcy5pbml0aWFsTGlmZXRpbWUgPSBjb25maWcubGlmZXRpbWU7XHJcbiAgICAgICAgdGhpcy5kYW1hZ2UgPSBjb25maWcuZGFtYWdlO1xyXG5cclxuICAgICAgICAvLyBWaXN1YWwgbWVzaFxyXG4gICAgICAgIGNvbnN0IGJ1bGxldFRleHR1cmUgPSBhc3NldE1hbmFnZXIuZ2V0VGV4dHVyZSgncGxheWVyX2J1bGxldCcpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldE1hdGVyaWFsTWVzaCA9IGJ1bGxldFRleHR1cmUgPyBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IGJ1bGxldFRleHR1cmUgfSkgOiBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBjb2xvcjogMHhmZmZmMDAgfSk7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0R2VvbWV0cnkgPSBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoY29uZmlnLnJhZGl1cywgOCwgOCk7XHJcbiAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2goYnVsbGV0R2VvbWV0cnksIGJ1bGxldE1hdGVyaWFsTWVzaCk7XHJcbiAgICAgICAgdGhpcy5tZXNoLnBvc2l0aW9uLmNvcHkoc3RhcnRQb3NpdGlvbik7XHJcbiAgICAgICAgc2NlbmUuYWRkKHRoaXMubWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFBoeXNpY3MgYm9keVxyXG4gICAgICAgIHRoaXMuYm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IGNvbmZpZy5tYXNzLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHN0YXJ0UG9zaXRpb24ueCwgc3RhcnRQb3NpdGlvbi55LCBzdGFydFBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogbmV3IENBTk5PTi5TcGhlcmUoY29uZmlnLnJhZGl1cyksXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiBidWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgY29sbGlzaW9uRmlsdGVyR3JvdXA6IENvbGxpc2lvbkdyb3Vwcy5CVUxMRVQsXHJcbiAgICAgICAgICAgIGNvbGxpc2lvbkZpbHRlck1hc2s6IENvbGxpc2lvbkdyb3Vwcy5FTkVNWSB8IENvbGxpc2lvbkdyb3Vwcy5HUk9VTkQgfCBDb2xsaXNpb25Hcm91cHMuV0FMTCxcclxuICAgICAgICAgICAgbGluZWFyRGFtcGluZzogMCAvLyBObyBkYW1waW5nIGZvciBidWxsZXRzXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5ib2R5LnZlbG9jaXR5LnNldCh2ZWxvY2l0eS54LCB2ZWxvY2l0eS55LCB2ZWxvY2l0eS56KTtcclxuICAgICAgICB3b3JsZC5hZGRCb2R5KHRoaXMuYm9keSk7XHJcblxyXG4gICAgICAgIHRoaXMuYm9keS5hZGRFdmVudExpc3RlbmVyKCdjb2xsaWRlJywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNIaXQgPSB0cnVlOyAvLyBNYXJrIGJ1bGxldCBhcyBoaXRcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiBib29sZWFuIHsgLy8gUmV0dXJucyB0cnVlIGlmIGJ1bGxldCBzaG91bGQgYmUgcmVtb3ZlZFxyXG4gICAgICAgIHRoaXMubWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMuYm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIHRoaXMuaW5pdGlhbExpZmV0aW1lIC09IGRlbHRhVGltZTtcclxuICAgICAgICByZXR1cm4gdGhpcy5pbml0aWFsTGlmZXRpbWUgPD0gMCB8fCB0aGlzLmlzSGl0OyAvLyBSZW1vdmUgaWYgbGlmZXRpbWUgZXhwaXJlZCBvciBoaXQgc29tZXRoaW5nXHJcbiAgICB9XHJcblxyXG4gICAgZ2V0RGFtYWdlKCk6IG51bWJlciB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGFtYWdlO1xyXG4gICAgfVxyXG5cclxuICAgIGRlc3Ryb3koKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KHRoaXMuYm9keSk7XHJcbiAgICAgICAgdGhpcy5tZXNoLnBhcmVudD8ucmVtb3ZlKHRoaXMubWVzaCk7XHJcbiAgICAgICAgdGhpcy5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcclxuICAgICAgICAodGhpcy5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBFbmVteSBDbGFzcyAtLS1cclxuY2xhc3MgRW5lbXkge1xyXG4gICAgcHVibGljIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBwdWJsaWMgYm9keTogQ0FOTk9OLkJvZHk7XHJcbiAgICBwdWJsaWMgY29uZmlnOiBHYW1lQ29uZmlnWydlbmVteSddO1xyXG4gICAgcHJpdmF0ZSB3b3JsZDogQ0FOTk9OLldvcmxkO1xyXG4gICAgcHVibGljIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgcHVibGljIGlzQWN0aXZlOiBib29sZWFuO1xyXG4gICAgcHJpdmF0ZSBsYXN0QXR0YWNrVGltZTogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBUSFJFRS5TY2VuZSwgd29ybGQ6IENBTk5PTi5Xb3JsZCwgY29uZmlnOiBHYW1lQ29uZmlnWydlbmVteSddLCBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlciwgcG9zaXRpb246IFRIUkVFLlZlY3RvcjMsIGVuZW15TWF0ZXJpYWw6IENBTk5PTi5NYXRlcmlhbCkge1xyXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xyXG4gICAgICAgIHRoaXMud29ybGQgPSB3b3JsZDtcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IGNvbmZpZy5oZWFsdGg7XHJcbiAgICAgICAgdGhpcy5pc0FjdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5sYXN0QXR0YWNrVGltZSA9IDA7XHJcblxyXG4gICAgICAgIC8vIFZpc3VhbCBtZXNoXHJcbiAgICAgICAgY29uc3QgZW5lbXlUZXh0dXJlID0gYXNzZXRNYW5hZ2VyLmdldFRleHR1cmUoJ2VuZW15Jyk7XHJcbiAgICAgICAgY29uc3QgZW5lbXlNYXRlcmlhbE1lc2ggPSBlbmVteVRleHR1cmUgPyBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IGVuZW15VGV4dHVyZSB9KSA6IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IGNvbG9yOiAweGZmMDAwMCB9KTtcclxuICAgICAgICBjb25zdCBlbmVteUdlb21ldHJ5ID0gbmV3IFRIUkVFLkN5bGluZGVyR2VvbWV0cnkoY29uZmlnLnJhZGl1cywgY29uZmlnLnJhZGl1cywgY29uZmlnLmhlaWdodCwgMTYpO1xyXG4gICAgICAgIHRoaXMubWVzaCA9IG5ldyBUSFJFRS5NZXNoKGVuZW15R2VvbWV0cnksIGVuZW15TWF0ZXJpYWxNZXNoKTtcclxuICAgICAgICB0aGlzLm1lc2gucG9zaXRpb24uY29weShwb3NpdGlvbik7XHJcbiAgICAgICAgc2NlbmUuYWRkKHRoaXMubWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFBoeXNpY3MgYm9keVxyXG4gICAgICAgIGNvbnN0IGN5bGluZGVyU2hhcGUgPSBuZXcgQ0FOTk9OLkN5bGluZGVyKGNvbmZpZy5yYWRpdXMsIGNvbmZpZy5yYWRpdXMsIGNvbmZpZy5oZWlnaHQsIDgpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IGNvbmZpZy5tYXNzLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHBvc2l0aW9uLngsIHBvc2l0aW9uLnksIHBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogY3lsaW5kZXJTaGFwZSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IGVuZW15TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUsIC8vIFByZXZlbnQgZW5lbWllcyBmcm9tIHRpcHBpbmcgb3ZlciBlYXNpbHlcclxuICAgICAgICAgICAgY29sbGlzaW9uRmlsdGVyR3JvdXA6IENvbGxpc2lvbkdyb3Vwcy5FTkVNWSxcclxuICAgICAgICAgICAgY29sbGlzaW9uRmlsdGVyTWFzazogQ29sbGlzaW9uR3JvdXBzLlBMQVlFUiB8IENvbGxpc2lvbkdyb3Vwcy5CVUxMRVQgfCBDb2xsaXNpb25Hcm91cHMuR1JPVU5EIHwgQ29sbGlzaW9uR3JvdXBzLldBTEwgfCBDb2xsaXNpb25Hcm91cHMuRU5FTVksXHJcbiAgICAgICAgICAgIGxpbmVhckRhbXBpbmc6IDAuOSAvLyBTb21lIGRhbXBpbmdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLmJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygxLCAwLCAwKSwgLU1hdGguUEkgLyAyKTsgLy8gT3JpZW50IGN5bGluZGVyIHZlcnRpY2FsbHlcclxuICAgICAgICB3b3JsZC5hZGRCb2R5KHRoaXMuYm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBwbGF5ZXJQb3NpdGlvbjogQ0FOTk9OLlZlYzMsIHBsYXllcjogUGxheWVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzQWN0aXZlIHx8IHRoaXMuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5ib2R5LnNsZWVwKCk7XHJcbiAgICAgICAgICAgIHRoaXMubWVzaC52aXNpYmxlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuYm9keS53YWtlVXAoKTtcclxuICAgICAgICB0aGlzLm1lc2gucG9zaXRpb24uY29weSh0aGlzLmJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuXHJcbiAgICAgICAgLy8gU2ltcGxlIEFJOiBNb3ZlIHRvd2FyZHMgcGxheWVyXHJcbiAgICAgICAgY29uc3QgdG9QbGF5ZXIgPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICAgICAgICBwbGF5ZXJQb3NpdGlvbi52c3ViKHRoaXMuYm9keS5wb3NpdGlvbiwgdG9QbGF5ZXIpO1xyXG4gICAgICAgIHRvUGxheWVyLnkgPSAwOyAvLyBPbmx5IGhvcml6b250YWwgbW92ZW1lbnRcclxuICAgICAgICB0b1BsYXllci5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgY29uc3QgdGFyZ2V0VmVsb2NpdHkgPSB0b1BsYXllci5zY2FsZSh0aGlzLmNvbmZpZy5zcGVlZCk7XHJcbiAgICAgICAgLy8gQXBwbHkgdGFyZ2V0IHZlbG9jaXR5IGRpcmVjdGx5IHRvIGhvcml6b250YWwgY29tcG9uZW50c1xyXG4gICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS54ID0gdGFyZ2V0VmVsb2NpdHkueDtcclxuICAgICAgICB0aGlzLmJvZHkudmVsb2NpdHkueiA9IHRhcmdldFZlbG9jaXR5Lno7XHJcblxyXG5cclxuICAgICAgICAvLyBBdHRhY2sgcGxheWVyIGlmIGNsb3NlIGVub3VnaFxyXG4gICAgICAgIGNvbnN0IGRpc3RhbmNlVG9QbGF5ZXIgPSB0aGlzLmJvZHkucG9zaXRpb24uZGlzdGFuY2VUbyhwbGF5ZXJQb3NpdGlvbik7XHJcbiAgICAgICAgaWYgKGRpc3RhbmNlVG9QbGF5ZXIgPCB0aGlzLmNvbmZpZy5yYWRpdXMgKyBwbGF5ZXIuY29uZmlnLnJhZGl1cyArIDAuMSkgeyAvLyBTaW1wbGUgb3ZlcmxhcCBjaGVja1xyXG4gICAgICAgICAgICBpZiAoRGF0ZS5ub3coKSAvIDEwMDAgLSB0aGlzLmxhc3RBdHRhY2tUaW1lID4gdGhpcy5jb25maWcuYXR0YWNrSW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgICAgIHBsYXllci50YWtlRGFtYWdlKHRoaXMuY29uZmlnLmRhbWFnZSwgRGF0ZS5ub3coKSAvIDEwMDApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0QXR0YWNrVGltZSA9IERhdGUubm93KCkgLyAxMDAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRha2VEYW1hZ2UoYW1vdW50OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmhlYWx0aCAtPSBhbW91bnQ7XHJcbiAgICAgICAgaWYgKHRoaXMuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5pc0FjdGl2ZSA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBkZXN0cm95KCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keSh0aGlzLmJvZHkpO1xyXG4gICAgICAgIHRoaXMubWVzaC5wYXJlbnQ/LnJlbW92ZSh0aGlzLm1lc2gpO1xyXG4gICAgICAgIHRoaXMubWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgKHRoaXMubWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyAtLS0gVUkgUmVuZGVyaW5nIChvbiBDYW52YXNUZXh0dXJlKSAtLS1cclxuY2xhc3MgVUkge1xyXG4gICAgcHJpdmF0ZSBjYW1lcmE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG4gICAgcHJpdmF0ZSBjb25maWc6IEdhbWVDb25maWdbJ3VpJ107XHJcbiAgICBwcml2YXRlIGhlYWx0aE1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIHNjb3JlTWVzaDogVEhSRUUuTWVzaDtcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5NZXNoOiBUSFJFRS5NZXNoIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGdhbWVPdmVyU2NyZWVuTWVzaDogVEhSRUUuTWVzaCB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBjcm9zc2hhaXJNZXNoOiBUSFJFRS5TcHJpdGU7XHJcbiAgICBwcml2YXRlIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbWVyYTogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEsIGNvbmZpZzogR2FtZUNvbmZpZ1sndWknXSwgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXIpIHtcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IGNhbWVyYTtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLmFzc2V0TWFuYWdlciA9IGFzc2V0TWFuYWdlcjtcclxuXHJcbiAgICAgICAgLy8gSGVhbHRoIGFuZCBTY29yZVxyXG4gICAgICAgIHRoaXMuaGVhbHRoTWVzaCA9IHRoaXMuY3JlYXRlVGV4dFBsYW5lKFwiSGVhbHRoOiAxMDBcIiwgMHgwMEZGMDApO1xyXG4gICAgICAgIHRoaXMuc2NvcmVNZXNoID0gdGhpcy5jcmVhdGVUZXh0UGxhbmUoXCJTY29yZTogMFwiLCAweDAwRkZGRik7XHJcbiAgICAgICAgdGhpcy5oZWFsdGhNZXNoLnBvc2l0aW9uLnNldCgtMC43LCAwLjcsIC0xLjUpOyAvLyBQb3NpdGlvbiBpbiBjYW1lcmEgc3BhY2VcclxuICAgICAgICB0aGlzLnNjb3JlTWVzaC5wb3NpdGlvbi5zZXQoMC43LCAwLjcsIC0xLjUpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFkZCh0aGlzLmhlYWx0aE1lc2gpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFkZCh0aGlzLnNjb3JlTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIENyb3NzaGFpclxyXG4gICAgICAgIGNvbnN0IGNyb3NzaGFpclRleHR1cmUgPSB0aGlzLmFzc2V0TWFuYWdlci5nZXRUZXh0dXJlKCdwbGF5ZXJfY3Jvc3NoYWlyJyk7XHJcbiAgICAgICAgY29uc3QgY3Jvc3NoYWlyTWF0ZXJpYWwgPSBjcm9zc2hhaXJUZXh0dXJlID8gbmV3IFRIUkVFLlNwcml0ZU1hdGVyaWFsKHsgbWFwOiBjcm9zc2hhaXJUZXh0dXJlLCBjb2xvcjogMHhmZmZmZmYsIHRyYW5zcGFyZW50OiB0cnVlIH0pIDogbmV3IFRIUkVFLlNwcml0ZU1hdGVyaWFsKHsgY29sb3I6IDB4ZmZmZmZmLCB0cmFuc3BhcmVudDogdHJ1ZSwgb3BhY2l0eTogMC41IH0pO1xyXG4gICAgICAgIHRoaXMuY3Jvc3NoYWlyTWVzaCA9IG5ldyBUSFJFRS5TcHJpdGUoY3Jvc3NoYWlyTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuY3Jvc3NoYWlyTWVzaC5zY2FsZS5zZXQodGhpcy5jb25maWcuY3Jvc3NoYWlyU2l6ZSwgdGhpcy5jb25maWcuY3Jvc3NoYWlyU2l6ZSwgMSk7XHJcbiAgICAgICAgdGhpcy5jcm9zc2hhaXJNZXNoLnBvc2l0aW9uLnNldCgwLCAwLCAtMSk7IC8vIENlbnRlciBvZiBzY3JlZW4sIHNsaWdodGx5IGluIGZyb250IG9mIGNhbWVyYVxyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFkZCh0aGlzLmNyb3NzaGFpck1lc2gpO1xyXG5cclxuICAgICAgICAvLyBFbnN1cmUgdGl0bGUvZ2FtZSBvdmVyIHNjcmVlbnMgYXJlIG5vdCBpbml0aWFsbHkgcHJlc2VudFxyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5NZXNoID0gbnVsbDtcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaCA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVUZXh0Q2FudmFzKHRleHQ6IHN0cmluZywgY29sb3I6IHN0cmluZyA9ICcjRkZGRkZGJywgYmFja2dyb3VuZENvbG9yOiBzdHJpbmcgPSAncmdiYSgwLDAsMCwwKScpOiBIVE1MQ2FudmFzRWxlbWVudCB7XHJcbiAgICAgICAgY29uc3QgY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XHJcbiAgICAgICAgY29uc3QgY29udGV4dCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcclxuICAgICAgICBjb25zdCBmb250U2l6ZSA9IHRoaXMuY29uZmlnLmZvbnRTaXplO1xyXG4gICAgICAgIGNvbnN0IGZvbnRGYW1pbHkgPSB0aGlzLmNvbmZpZy5mb250RmFtaWx5O1xyXG5cclxuICAgICAgICBjb250ZXh0LmZvbnQgPSBgJHtmb250U2l6ZX1weCAke2ZvbnRGYW1pbHl9YDtcclxuICAgICAgICBjb25zdCBtZXRyaWNzID0gY29udGV4dC5tZWFzdXJlVGV4dCh0ZXh0KTtcclxuICAgICAgICBjb25zdCB0ZXh0V2lkdGggPSBtZXRyaWNzLndpZHRoO1xyXG4gICAgICAgIGNvbnN0IHRleHRIZWlnaHQgPSBmb250U2l6ZSAqIDEuNTsgLy8gQXBwcm94aW1hdGUgaGVpZ2h0IHdpdGggc29tZSBwYWRkaW5nXHJcblxyXG4gICAgICAgIGNhbnZhcy53aWR0aCA9IHRleHRXaWR0aCArIDQwOyAvLyBBZGQgcGFkZGluZ1xyXG4gICAgICAgIGNhbnZhcy5oZWlnaHQgPSB0ZXh0SGVpZ2h0ICsgNDA7XHJcblxyXG4gICAgICAgIGNvbnRleHQuZm9udCA9IGAke2ZvbnRTaXplfXB4ICR7Zm9udEZhbWlseX1gOyAvLyBSZXNldCBmb250IGFmdGVyIGNhbnZhcyByZXNpemVcclxuICAgICAgICBjb250ZXh0LmZpbGxTdHlsZSA9IGJhY2tncm91bmRDb2xvcjtcclxuICAgICAgICBjb250ZXh0LmZpbGxSZWN0KDAsIDAsIGNhbnZhcy53aWR0aCwgY2FudmFzLmhlaWdodCk7XHJcbiAgICAgICAgY29udGV4dC50ZXh0QWxpZ24gPSAnY2VudGVyJztcclxuICAgICAgICBjb250ZXh0LnRleHRCYXNlbGluZSA9ICdtaWRkbGUnO1xyXG4gICAgICAgIGNvbnRleHQuZmlsbFN0eWxlID0gY29sb3I7XHJcbiAgICAgICAgLy8gU3BsaXQgdGV4dCBieSBuZXdsaW5lcyBhbmQgcmVuZGVyIGVhY2ggbGluZVxyXG4gICAgICAgIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XHJcbiAgICAgICAgbGluZXMuZm9yRWFjaCgobGluZSwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeU9mZnNldCA9IChpbmRleCAtIChsaW5lcy5sZW5ndGggLSAxKSAvIDIpICogZm9udFNpemUgKiAxLjI7XHJcbiAgICAgICAgICAgIGNvbnRleHQuZmlsbFRleHQobGluZSwgY2FudmFzLndpZHRoIC8gMiwgY2FudmFzLmhlaWdodCAvIDIgKyB5T2Zmc2V0KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGNhbnZhcztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZVRleHRQbGFuZSh0ZXh0OiBzdHJpbmcsIGNvbG9yOiBudW1iZXIpOiBUSFJFRS5NZXNoIHtcclxuICAgICAgICBjb25zdCBjYW52YXMgPSB0aGlzLmNyZWF0ZVRleHRDYW52YXModGV4dCwgYCMke2NvbG9yLnRvU3RyaW5nKDE2KS5wYWRTdGFydCg2LCAnMCcpfWApO1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmUgPSBuZXcgVEhSRUUuQ2FudmFzVGV4dHVyZShjYW52YXMpO1xyXG4gICAgICAgIHRleHR1cmUubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyOyAvLyBFbnN1cmUgY3Jpc3AgdGV4dFxyXG4gICAgICAgIHRleHR1cmUubmVlZHNVcGRhdGUgPSB0cnVlO1xyXG5cclxuICAgICAgICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSwgdHJhbnNwYXJlbnQ6IHRydWUgfSk7XHJcbiAgICAgICAgY29uc3QgYXNwZWN0UmF0aW8gPSBjYW52YXMud2lkdGggLyBjYW52YXMuaGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IHBsYW5lR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSgwLjUgKiBhc3BlY3RSYXRpbywgMC41KTsgLy8gQWRqdXN0IHNpemUgaW4gM0Qgc3BhY2UgcmVsYXRpdmUgdG8gZGlzdGFuY2VcclxuICAgICAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2gocGxhbmVHZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgIHJldHVybiBtZXNoO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZUhlYWx0aChoZWFsdGg6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGhlYWx0aENvbG9yID0gaGVhbHRoID4gNTAgPyAweDAwRkYwMCA6IChoZWFsdGggPiAyMCA/IDB4RkZBNTAwIDogMHhGRjAwMDApO1xyXG4gICAgICAgIGNvbnN0IG5ld01lc2ggPSB0aGlzLmNyZWF0ZVRleHRQbGFuZShgSGVhbHRoOiAke01hdGgubWF4KDAsIGhlYWx0aCl9YCwgaGVhbHRoQ29sb3IpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnJlbW92ZSh0aGlzLmhlYWx0aE1lc2gpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoTWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgaWYgKCh0aGlzLmhlYWx0aE1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLm1hcCkge1xyXG4gICAgICAgICAgICAodGhpcy5oZWFsdGhNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5tYXA/LmRpc3Bvc2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgKHRoaXMuaGVhbHRoTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoTWVzaCA9IG5ld01lc2g7XHJcbiAgICAgICAgdGhpcy5oZWFsdGhNZXNoLnBvc2l0aW9uLnNldCgtMC43LCAwLjcsIC0xLjUpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFkZCh0aGlzLmhlYWx0aE1lc2gpO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZVNjb3JlKHNjb3JlOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBuZXdNZXNoID0gdGhpcy5jcmVhdGVUZXh0UGxhbmUoYFNjb3JlOiAke3Njb3JlfWAsIDB4MDBGRkZGKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5yZW1vdmUodGhpcy5zY29yZU1lc2gpO1xyXG4gICAgICAgIHRoaXMuc2NvcmVNZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcclxuICAgICAgICBpZiAoKHRoaXMuc2NvcmVNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5tYXApIHtcclxuICAgICAgICAgICAgKHRoaXMuc2NvcmVNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5tYXA/LmRpc3Bvc2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgKHRoaXMuc2NvcmVNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5kaXNwb3NlKCk7XHJcbiAgICAgICAgdGhpcy5zY29yZU1lc2ggPSBuZXdNZXNoO1xyXG4gICAgICAgIHRoaXMuc2NvcmVNZXNoLnBvc2l0aW9uLnNldCgwLjcsIDAuNywgLTEuNSk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYWRkKHRoaXMuc2NvcmVNZXNoKTtcclxuICAgIH1cclxuXHJcbiAgICBzaG93VGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMudGl0bGVTY3JlZW5NZXNoKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5oaWRlSFVEKCk7XHJcbiAgICAgICAgdGhpcy5oaWRlR2FtZU92ZXJTY3JlZW4oKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FudmFzID0gdGhpcy5jcmVhdGVUZXh0Q2FudmFzKGAke3RoaXMuY29uZmlnLnRpdGxlU2NyZWVuVGV4dH1cXG5cXG4ke3RoaXMuY29uZmlnLnByZXNzVG9TdGFydFRleHR9YCwgdGhpcy5jb25maWcuZm9udENvbG9yLCAncmdiYSgwLDAsMCwwLjcpJyk7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBUSFJFRS5DYW52YXNUZXh0dXJlKGNhbnZhcyk7XHJcbiAgICAgICAgdGV4dHVyZS5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XHJcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRleHR1cmUsIHRyYW5zcGFyZW50OiB0cnVlIH0pO1xyXG4gICAgICAgIGNvbnN0IGFzcGVjdFJhdGlvID0gY2FudmFzLndpZHRoIC8gY2FudmFzLmhlaWdodDtcclxuICAgICAgICBjb25zdCBwbGFuZUdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoMyAqIGFzcGVjdFJhdGlvLCAzKTtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHBsYW5lR2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuTWVzaC5wb3NpdGlvbi5zZXQoMCwgMCwgLTMpOyAvLyBQbGFjZSBpbiBmcm9udCBvZiB0aGUgY2FtZXJhXHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYWRkKHRoaXMudGl0bGVTY3JlZW5NZXNoKTtcclxuICAgIH1cclxuXHJcbiAgICBoaWRlVGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMudGl0bGVTY3JlZW5NZXNoKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnJlbW92ZSh0aGlzLnRpdGxlU2NyZWVuTWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMudGl0bGVTY3JlZW5NZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgaWYgKCh0aGlzLnRpdGxlU2NyZWVuTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkubWFwKSB7XHJcbiAgICAgICAgICAgICAgICAodGhpcy50aXRsZVNjcmVlbk1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLm1hcD8uZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICh0aGlzLnRpdGxlU2NyZWVuTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICB0aGlzLnRpdGxlU2NyZWVuTWVzaCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuc2hvd0hVRCgpO1xyXG4gICAgfVxyXG5cclxuICAgIHNob3dHYW1lT3ZlclNjcmVlbihzY29yZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZU92ZXJTY3JlZW5NZXNoKSByZXR1cm47XHJcbiAgICAgICAgdGhpcy5oaWRlSFVEKCk7XHJcbiAgICAgICAgdGhpcy5oaWRlVGl0bGVTY3JlZW4oKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FudmFzID0gdGhpcy5jcmVhdGVUZXh0Q2FudmFzKGAke3RoaXMuY29uZmlnLmdhbWVPdmVyVGV4dH1cXG5TY29yZTogJHtzY29yZX1cXG5cXG4ke3RoaXMuY29uZmlnLnByZXNzVG9TdGFydFRleHR9YCwgdGhpcy5jb25maWcuZm9udENvbG9yLCAncmdiYSgwLDAsMCwwLjcpJyk7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBUSFJFRS5DYW52YXNUZXh0dXJlKGNhbnZhcyk7XHJcbiAgICAgICAgdGV4dHVyZS5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XHJcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IHRleHR1cmUsIHRyYW5zcGFyZW50OiB0cnVlIH0pO1xyXG4gICAgICAgIGNvbnN0IGFzcGVjdFJhdGlvID0gY2FudmFzLndpZHRoIC8gY2FudmFzLmhlaWdodDtcclxuICAgICAgICBjb25zdCBwbGFuZUdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoMyAqIGFzcGVjdFJhdGlvLCAzKTtcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHBsYW5lR2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaC5wb3NpdGlvbi5zZXQoMCwgMCwgLTMpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFkZCh0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaCk7XHJcbiAgICB9XHJcblxyXG4gICAgaGlkZUdhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaCkge1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5yZW1vdmUodGhpcy5nYW1lT3ZlclNjcmVlbk1lc2gpO1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgIGlmICgodGhpcy5nYW1lT3ZlclNjcmVlbk1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLm1hcCkge1xyXG4gICAgICAgICAgICAgICAgKHRoaXMuZ2FtZU92ZXJTY3JlZW5NZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5tYXA/LmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAodGhpcy5nYW1lT3ZlclNjcmVlbk1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbk1lc2ggPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBzaG93SFVEKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoTWVzaC52aXNpYmxlID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnNjb3JlTWVzaC52aXNpYmxlID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmNyb3NzaGFpck1lc2gudmlzaWJsZSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgaGlkZUhVRCgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmhlYWx0aE1lc2gudmlzaWJsZSA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuc2NvcmVNZXNoLnZpc2libGUgPSBmYWxzZTtcclxuICAgICAgICB0aGlzLmNyb3NzaGFpck1lc2gudmlzaWJsZSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGRpc3Bvc2UoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5oaWRlVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICB0aGlzLmhpZGVHYW1lT3ZlclNjcmVlbigpO1xyXG5cclxuICAgICAgICAvLyBEaXNwb3NlIHBlcm1hbmVudCBIVUQgZWxlbWVudHNcclxuICAgICAgICB0aGlzLmNhbWVyYS5yZW1vdmUodGhpcy5oZWFsdGhNZXNoKTtcclxuICAgICAgICB0aGlzLmhlYWx0aE1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xyXG4gICAgICAgIGlmICgodGhpcy5oZWFsdGhNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5tYXApIHtcclxuICAgICAgICAgICAgKHRoaXMuaGVhbHRoTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkubWFwPy5kaXNwb3NlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgICh0aGlzLmhlYWx0aE1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLmRpc3Bvc2UoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jYW1lcmEucmVtb3ZlKHRoaXMuc2NvcmVNZXNoKTtcclxuICAgICAgICB0aGlzLnNjb3JlTWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgaWYgKCh0aGlzLnNjb3JlTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkubWFwKSB7XHJcbiAgICAgICAgICAgICh0aGlzLnNjb3JlTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkubWFwPy5kaXNwb3NlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgICh0aGlzLnNjb3JlTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnJlbW92ZSh0aGlzLmNyb3NzaGFpck1lc2gpO1xyXG4gICAgICAgIGlmICgodGhpcy5jcm9zc2hhaXJNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLlNwcml0ZU1hdGVyaWFsKS5tYXApIHtcclxuICAgICAgICAgICAgKHRoaXMuY3Jvc3NoYWlyTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5TcHJpdGVNYXRlcmlhbCkubWFwPy5kaXNwb3NlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgICh0aGlzLmNyb3NzaGFpck1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuU3ByaXRlTWF0ZXJpYWwpLmRpc3Bvc2UoKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIEdhbWUgU3RhdGUgYW5kIE1haW4gTG9naWMgLS0tXHJcbmVudW0gR2FtZVN0YXRlIHtcclxuICAgIExPQURJTkcsXHJcbiAgICBUSVRMRSxcclxuICAgIFBMQVlJTkcsXHJcbiAgICBHQU1FX09WRVIsXHJcbn1cclxuXHJcbmVudW0gQ29sbGlzaW9uR3JvdXBzIHtcclxuICAgIFBMQVlFUiA9IDEsXHJcbiAgICBHUk9VTkQgPSAyLFxyXG4gICAgRU5FTVkgPSA0LFxyXG4gICAgQlVMTEVUID0gOCxcclxuICAgIFdBTEwgPSAxNlxyXG59XHJcblxyXG5sZXQgY29uZmlnOiBHYW1lQ29uZmlnO1xyXG5sZXQgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXI7XHJcbmxldCBpbnB1dEhhbmRsZXI6IElucHV0SGFuZGxlcjtcclxuXHJcbmxldCBzY2VuZTogVEhSRUUuU2NlbmU7XHJcbmxldCBjYW1lcmE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG5sZXQgcmVuZGVyZXI6IFRIUkVFLldlYkdMUmVuZGVyZXI7XHJcbmxldCBjb250cm9sczogUG9pbnRlckxvY2tDb250cm9scztcclxubGV0IHVpOiBVSTtcclxuXHJcbmxldCB3b3JsZDogQ0FOTk9OLldvcmxkO1xyXG5sZXQgcGxheWVyOiBQbGF5ZXI7XHJcbmxldCBlbmVtaWVzOiBFbmVteVtdID0gW107XHJcbmxldCBidWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG5cclxubGV0IGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLkxPQURJTkc7XHJcbmxldCBzY29yZTogbnVtYmVyID0gMDtcclxubGV0IGxhc3RGcmFtZVRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5sZXQgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuXHJcbi8vIFBoeXNpY3MgTWF0ZXJpYWxzXHJcbmxldCBncm91bmRNYXRlcmlhbDogQ0FOTk9OLk1hdGVyaWFsO1xyXG5sZXQgcGxheWVyTWF0ZXJpYWw6IENBTk5PTi5NYXRlcmlhbDtcclxubGV0IGVuZW15TWF0ZXJpYWw6IENBTk5PTi5NYXRlcmlhbDtcclxubGV0IGJ1bGxldE1hdGVyaWFsOiBDQU5OT04uTWF0ZXJpYWw7XHJcblxyXG4vLyBBdWRpb1xyXG5sZXQgYXVkaW9MaXN0ZW5lcjogVEhSRUUuQXVkaW9MaXN0ZW5lcjtcclxubGV0IGJnbTogVEhSRUUuQXVkaW87XHJcbmxldCBzb3VuZEVmZmVjdE1hcDogTWFwPHN0cmluZywgVEhSRUUuQXVkaW8+O1xyXG5cclxuYXN5bmMgZnVuY3Rpb24gaW5pdEdhbWUoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygnSW5pdGlhbGl6aW5nIGdhbWUuLi4nKTtcclxuICAgIGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBpZiAoIWNhbnZhcykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbnZhcyBlbGVtZW50IHdpdGggSUQgXCJnYW1lQ2FudmFzXCIgbm90IGZvdW5kLicpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAvLyBMb2FkIGNvbmZpZ1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICBjb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgR2FtZUNvbmZpZztcclxuICAgICAgICBjb25zb2xlLmxvZygnQ29uZmlnIGxvYWRlZDonLCBjb25maWcpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBkYXRhLmpzb246JywgZXJyb3IpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBhc3NldE1hbmFnZXIgPSBuZXcgQXNzZXRNYW5hZ2VyKGNvbmZpZyk7XHJcbiAgICBhd2FpdCBhc3NldE1hbmFnZXIubG9hZEFzc2V0cygpO1xyXG5cclxuICAgIHNldHVwU2NlbmUoKTtcclxuICAgIHNldHVwUGh5c2ljcygpO1xyXG4gICAgc2V0dXBQbGF5ZXIoKTtcclxuICAgIHNldHVwRW5lbWllcygpO1xyXG4gICAgc2V0dXBJbnB1dCgpO1xyXG4gICAgc2V0dXBBdWRpbygpO1xyXG4gICAgc2V0dXBVSSgpO1xyXG5cclxuICAgIC8vIFJlc2l6ZSBsaXN0ZW5lclxyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIG9uV2luZG93UmVzaXplLCBmYWxzZSk7XHJcbiAgICBvbldpbmRvd1Jlc2l6ZSgpOyAvLyBJbml0aWFsIHJlc2l6ZVxyXG5cclxuICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgIHVpLnNob3dUaXRsZVNjcmVlbigpO1xyXG4gICAgYW5pbWF0ZSgwKTsgLy8gU3RhcnQgdGhlIGFuaW1hdGlvbiBsb29wXHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwU2NlbmUoKTogdm9pZCB7XHJcbiAgICBzY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgc2NlbmUuYmFja2dyb3VuZCA9IG5ldyBUSFJFRS5Db2xvcigweDg3Y2VlYik7IC8vIFNreSBibHVlIGJhY2tncm91bmRcclxuXHJcbiAgICBjYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoNzUsIHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0LCAwLjEsIDEwMDApO1xyXG4gICAgcmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XHJcbiAgICByZW5kZXJlci5zZXRTaXplKHdpbmRvdy5pbm5lcldpZHRoLCB3aW5kb3cuaW5uZXJIZWlnaHQpO1xyXG4gICAgcmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwUGh5c2ljcygpOiB2b2lkIHtcclxuICAgIHdvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG4gICAgd29ybGQuZ3Jhdml0eS5zZXQoMCwgLWNvbmZpZy5nYW1lLmdyYXZpdHksIDApO1xyXG4gICAgd29ybGQuYnJvYWRwaGFzZSA9IG5ldyBDQU5OT04uU0FQQnJvYWRwaGFzZSh3b3JsZCk7XHJcbiAgICB3b3JsZC5hbGxvd1NsZWVwID0gdHJ1ZTtcclxuICAgIFxyXG4gICAgLy8gRml4IGZvciBUUzIzMzk6IFByb3BlcnR5ICdtYXhJdGVyYXRpb25zJyBkb2VzIG5vdCBleGlzdCBvbiB0eXBlICdTb2x2ZXInLlxyXG4gICAgLy8gVGhlICdpdGVyYXRpb25zJyBwcm9wZXJ0eSBleGlzdHMgb24gR1NTb2x2ZXIsIHdoaWNoIGlzIGEgY29tbW9uIHNvbHZlciB1c2VkIGluIGNhbm5vbi1lcy5cclxuICAgIGNvbnN0IHNvbHZlciA9IG5ldyBDQU5OT04uR1NTb2x2ZXIoKTtcclxuICAgIHNvbHZlci5pdGVyYXRpb25zID0gMTA7IC8vIFVzZSAnaXRlcmF0aW9ucycgaW5zdGVhZCBvZiAnbWF4SXRlcmF0aW9ucydcclxuICAgIHdvcmxkLnNvbHZlciA9IHNvbHZlcjtcclxuXHJcbiAgICAvLyBNYXRlcmlhbHNcclxuICAgIGdyb3VuZE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZ3JvdW5kTWF0ZXJpYWwnKTtcclxuICAgIHBsYXllck1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgncGxheWVyTWF0ZXJpYWwnKTtcclxuICAgIGVuZW15TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdlbmVteU1hdGVyaWFsJyk7XHJcbiAgICBidWxsZXRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2J1bGxldE1hdGVyaWFsJyk7XHJcblxyXG4gICAgY29uc3QgZ3JvdW5kUGxheWVyQ00gPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICBncm91bmRNYXRlcmlhbCxcclxuICAgICAgICBwbGF5ZXJNYXRlcmlhbCxcclxuICAgICAgICB7IGZyaWN0aW9uOiBjb25maWcucGxheWVyLmZyaWN0aW9uLCByZXN0aXR1dGlvbjogMC4xIH1cclxuICAgICk7XHJcbiAgICB3b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoZ3JvdW5kUGxheWVyQ00pO1xyXG5cclxuICAgIGNvbnN0IGVuZW15UGxheWVyQ00gPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICBlbmVteU1hdGVyaWFsLFxyXG4gICAgICAgIHBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgIHsgZnJpY3Rpb246IDAuMSwgcmVzdGl0dXRpb246IDAuMSB9XHJcbiAgICApO1xyXG4gICAgd29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKGVuZW15UGxheWVyQ00pO1xyXG5cclxuICAgIGNvbnN0IGJ1bGxldEVuZW15Q00gPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICBidWxsZXRNYXRlcmlhbCxcclxuICAgICAgICBlbmVteU1hdGVyaWFsLFxyXG4gICAgICAgIHsgZnJpY3Rpb246IDAuMSwgcmVzdGl0dXRpb246IDAuOSB9XHJcbiAgICApO1xyXG4gICAgd29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKGJ1bGxldEVuZW15Q00pO1xyXG5cclxuICAgIGNvbnN0IHdhbGxQbGF5ZXJDTSA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgIGdyb3VuZE1hdGVyaWFsLCAvLyBXYWxscyB1c2UgZ3JvdW5kIG1hdGVyaWFsXHJcbiAgICAgICAgcGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgeyBmcmljdGlvbjogMC4xLCByZXN0aXR1dGlvbjogMC4xIH1cclxuICAgICk7XHJcbiAgICB3b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwod2FsbFBsYXllckNNKTtcclxuXHJcbiAgICAvLyBHcm91bmRcclxuICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgY29uc3QgZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAsIG1hdGVyaWFsOiBncm91bmRNYXRlcmlhbCwgY29sbGlzaW9uRmlsdGVyR3JvdXA6IENvbGxpc2lvbkdyb3Vwcy5HUk9VTkQgfSk7XHJcbiAgICBncm91bmRCb2R5LmFkZFNoYXBlKGdyb3VuZFNoYXBlKTtcclxuICAgIGdyb3VuZEJvZHkucXVhdGVybmlvbi5zZXRGcm9tRXVsZXIoLU1hdGguUEkgLyAyLCAwLCAwKTsgLy8gUm90YXRlIGdyb3VuZCB0byBiZSBob3Jpem9udGFsXHJcbiAgICB3b3JsZC5hZGRCb2R5KGdyb3VuZEJvZHkpO1xyXG5cclxuICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSBhc3NldE1hbmFnZXIuZ2V0VGV4dHVyZSgnZmxvb3JfdGV4dHVyZScpO1xyXG4gICAgaWYgKGdyb3VuZFRleHR1cmUpIHtcclxuICAgICAgICBncm91bmRUZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgZ3JvdW5kVGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgIGdyb3VuZFRleHR1cmUucmVwZWF0LnNldChjb25maWcuZ2FtZS5mbG9vclNpemUgLyAyLCBjb25maWcuZ2FtZS5mbG9vclNpemUgLyAyKTsgLy8gUmVwZWF0IHRleHR1cmVcclxuICAgIH1cclxuICAgIGNvbnN0IGdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChcclxuICAgICAgICBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeShjb25maWcuZ2FtZS5mbG9vclNpemUsIGNvbmZpZy5nYW1lLmZsb29yU2l6ZSwgMTAsIDEwKSxcclxuICAgICAgICBuZXcgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwoeyBtYXA6IGdyb3VuZFRleHR1cmUsIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUgfSlcclxuICAgICk7XHJcbiAgICBncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7XHJcbiAgICBncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgc2NlbmUuYWRkKGdyb3VuZE1lc2gpO1xyXG5cclxuICAgIC8vIFdhbGxzXHJcbiAgICBjb25zdCB3YWxsVGV4dHVyZSA9IGFzc2V0TWFuYWdlci5nZXRUZXh0dXJlKCd3YWxsX3RleHR1cmUnKTtcclxuICAgIGlmICh3YWxsVGV4dHVyZSkge1xyXG4gICAgICAgIHdhbGxUZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgd2FsbFRleHR1cmUud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICB3YWxsVGV4dHVyZS5yZXBlYXQuc2V0KGNvbmZpZy5nYW1lLmZsb29yU2l6ZSAvIDUsIGNvbmZpZy5nYW1lLndhbGxIZWlnaHQgLyA1KTtcclxuICAgIH1cclxuICAgIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7IG1hcDogd2FsbFRleHR1cmUsIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGUgfSk7XHJcbiAgICBjb25zdCB3YWxsR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoY29uZmlnLmdhbWUuZmxvb3JTaXplLCBjb25maWcuZ2FtZS53YWxsSGVpZ2h0LCAwLjUpOyAvLyBUaGluIHdhbGxcclxuXHJcbiAgICBmdW5jdGlvbiBjcmVhdGVXYWxsKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHJvdFk6IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IHdhbGxNZXNoID0gbmV3IFRIUkVFLk1lc2god2FsbEdlb21ldHJ5LCB3YWxsTWF0ZXJpYWwpO1xyXG4gICAgICAgIHdhbGxNZXNoLnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcclxuICAgICAgICB3YWxsTWVzaC5yb3RhdGlvbi55ID0gcm90WTtcclxuICAgICAgICBzY2VuZS5hZGQod2FsbE1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCB3YWxsQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAsIG1hdGVyaWFsOiBncm91bmRNYXRlcmlhbCwgY29sbGlzaW9uRmlsdGVyR3JvdXA6IENvbGxpc2lvbkdyb3Vwcy5XQUxMIH0pO1xyXG4gICAgICAgIGNvbnN0IGJveFNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKGNvbmZpZy5nYW1lLmZsb29yU2l6ZSAvIDIsIGNvbmZpZy5nYW1lLndhbGxIZWlnaHQgLyAyLCAwLjI1KSk7XHJcbiAgICAgICAgd2FsbEJvZHkuYWRkU2hhcGUoYm94U2hhcGUpO1xyXG4gICAgICAgIHdhbGxCb2R5LnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcclxuICAgICAgICB3YWxsQm9keS5xdWF0ZXJuaW9uLnNldEZyb21FdWxlcigwLCByb3RZLCAwKTtcclxuICAgICAgICB3b3JsZC5hZGRCb2R5KHdhbGxCb2R5KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBoYWxmRmxvb3IgPSBjb25maWcuZ2FtZS5mbG9vclNpemUgLyAyO1xyXG4gICAgY29uc3QgaGFsZldhbGxIZWlnaHQgPSBjb25maWcuZ2FtZS53YWxsSGVpZ2h0IC8gMjtcclxuICAgIGNyZWF0ZVdhbGwoMCwgaGFsZldhbGxIZWlnaHQsIC1oYWxmRmxvb3IsIDApOyAvLyBCYWNrIHdhbGxcclxuICAgIGNyZWF0ZVdhbGwoMCwgaGFsZldhbGxIZWlnaHQsIGhhbGZGbG9vciwgTWF0aC5QSSk7IC8vIEZyb250IHdhbGxcclxuICAgIGNyZWF0ZVdhbGwoLWhhbGZGbG9vciwgaGFsZldhbGxIZWlnaHQsIDAsIE1hdGguUEkgLyAyKTsgLy8gTGVmdCB3YWxsXHJcbiAgICBjcmVhdGVXYWxsKGhhbGZGbG9vciwgaGFsZldhbGxIZWlnaHQsIDAsIC1NYXRoLlBJIC8gMik7IC8vIFJpZ2h0IHdhbGxcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBQbGF5ZXIoKTogdm9pZCB7XHJcbiAgICBwbGF5ZXIgPSBuZXcgUGxheWVyKHNjZW5lLCB3b3JsZCwgY2FtZXJhLCBjb25maWcucGxheWVyLCBwbGF5ZXJNYXRlcmlhbCk7XHJcbiAgICBjb250cm9scyA9IG5ldyBQb2ludGVyTG9ja0NvbnRyb2xzKGNhbWVyYSwgY2FudmFzKTtcclxuICAgIFxyXG4gICAgLy8gUGFyZW50IHRoZSBjb250cm9scycgb2JqZWN0ICh3aGljaCBjb250YWlucyB0aGUgY2FtZXJhKSB0byB0aGUgcGxheWVyJ3MgbWVzaC5cclxuICAgIC8vIFRoaXMgZXN0YWJsaXNoZXMgYSBjbGVhciBoaWVyYXJjaHk6IHBsYXllci5tZXNoIC0+IGNvbnRyb2xzLm9iamVjdCAtPiBjYW1lcmFcclxuICAgIHBsYXllci5tZXNoLmFkZChjb250cm9scy5vYmplY3QpOyBcclxuICAgIHNjZW5lLmFkZChwbGF5ZXIubWVzaCk7IC8vIEFkZCB0aGUgcGxheWVyJ3Mgcm9vdCBtZXNoIHRvIHRoZSBzY2VuZVxyXG5cclxuICAgIC8vIFBvc2l0aW9uIHRoZSBjb250cm9scy5vYmplY3QgKGFuZCB0aHVzIHRoZSBjYW1lcmEpIHJlbGF0aXZlIHRvIHRoZSBwbGF5ZXIncyBtZXNoLlxyXG4gICAgLy8gVGhpcyB1c2VzIHRoZSBjYW1lcmFPZmZzZXQgZnJvbSB0aGUgY29uZmlnLlxyXG4gICAgY29udHJvbHMub2JqZWN0LnBvc2l0aW9uLnNldChcclxuICAgICAgICBjb25maWcucGxheWVyLmNhbWVyYU9mZnNldC54LFxyXG4gICAgICAgIGNvbmZpZy5wbGF5ZXIuY2FtZXJhT2Zmc2V0LnksXHJcbiAgICAgICAgY29uZmlnLnBsYXllci5jYW1lcmFPZmZzZXQuelxyXG4gICAgKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBFbmVtaWVzKCk6IHZvaWQge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb25maWcuZW5lbXkuY291bnQ7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGFuZ2xlID0gKGkgLyBjb25maWcuZW5lbXkuY291bnQpICogTWF0aC5QSSAqIDIgKyBNYXRoLnJhbmRvbSgpICogMC41OyAvLyBTbGlnaHRseSByYW5kb21pemUgYW5nbGVcclxuICAgICAgICBjb25zdCByYWRpdXNPZmZzZXQgPSBNYXRoLnJhbmRvbSgpICogKGNvbmZpZy5lbmVteS5zcGF3blJhZGl1cyAvIDIpOyAvLyBSYW5kb21pemUgcmFkaXVzXHJcbiAgICAgICAgY29uc3QgeCA9IE1hdGguY29zKGFuZ2xlKSAqIChjb25maWcuZW5lbXkuc3Bhd25SYWRpdXMgLSByYWRpdXNPZmZzZXQpO1xyXG4gICAgICAgIGNvbnN0IHogPSBNYXRoLnNpbihhbmdsZSkgKiAoY29uZmlnLmVuZW15LnNwYXduUmFkaXVzIC0gcmFkaXVzT2Zmc2V0KTtcclxuICAgICAgICBjb25zdCBlbmVteVBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoeCwgY29uZmlnLmVuZW15LmhlaWdodCAvIDIsIHopO1xyXG4gICAgICAgIGNvbnN0IGVuZW15ID0gbmV3IEVuZW15KHNjZW5lLCB3b3JsZCwgY29uZmlnLmVuZW15LCBhc3NldE1hbmFnZXIsIGVuZW15UG9zaXRpb24sIGVuZW15TWF0ZXJpYWwpO1xyXG4gICAgICAgIGVuZW1pZXMucHVzaChlbmVteSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwSW5wdXQoKTogdm9pZCB7XHJcbiAgICBpbnB1dEhhbmRsZXIgPSBuZXcgSW5wdXRIYW5kbGVyKCk7XHJcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICBjYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgICAgIHN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cEF1ZGlvKCk6IHZvaWQge1xyXG4gICAgYXVkaW9MaXN0ZW5lciA9IG5ldyBUSFJFRS5BdWRpb0xpc3RlbmVyKCk7XHJcbiAgICBjYW1lcmEuYWRkKGF1ZGlvTGlzdGVuZXIpOyAvLyBBZGQgbGlzdGVuZXIgdG8gdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEJhY2tncm91bmQgTXVzaWNcclxuICAgIGNvbnN0IGJnbUJ1ZmZlciA9IGFzc2V0TWFuYWdlci5nZXRBdWRpb0J1ZmZlcignYmdtJyk7XHJcbiAgICBpZiAoYmdtQnVmZmVyKSB7XHJcbiAgICAgICAgYmdtID0gbmV3IFRIUkVFLkF1ZGlvKGF1ZGlvTGlzdGVuZXIpO1xyXG4gICAgICAgIGJnbS5zZXRCdWZmZXIoYmdtQnVmZmVyKTtcclxuICAgICAgICBiZ20uc2V0TG9vcCh0cnVlKTtcclxuICAgICAgICBiZ20uc2V0Vm9sdW1lKGNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lIHx8IDAuMyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU291bmQgRWZmZWN0c1xyXG4gICAgc291bmRFZmZlY3RNYXAgPSBuZXcgTWFwKCk7XHJcbiAgICBjb25maWcuYXNzZXRzLnNvdW5kcy5maWx0ZXIocyA9PiBzLm5hbWUgIT09ICdiZ20nKS5mb3JFYWNoKHNvdW5kQ29uZmlnID0+IHtcclxuICAgICAgICBjb25zdCBidWZmZXIgPSBhc3NldE1hbmFnZXIuZ2V0QXVkaW9CdWZmZXIoc291bmRDb25maWcubmFtZSk7XHJcbiAgICAgICAgaWYgKGJ1ZmZlcikge1xyXG4gICAgICAgICAgICBjb25zdCBzb3VuZCA9IG5ldyBUSFJFRS5BdWRpbyhhdWRpb0xpc3RlbmVyKTtcclxuICAgICAgICAgICAgc291bmQuc2V0QnVmZmVyKGJ1ZmZlcik7XHJcbiAgICAgICAgICAgIHNvdW5kLnNldFZvbHVtZShzb3VuZENvbmZpZy52b2x1bWUpO1xyXG4gICAgICAgICAgICBzb3VuZEVmZmVjdE1hcC5zZXQoc291bmRDb25maWcubmFtZSwgc291bmQpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFVJKCk6IHZvaWQge1xyXG4gICAgdWkgPSBuZXcgVUkoY2FtZXJhLCBjb25maWcudWksIGFzc2V0TWFuYWdlcik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9uV2luZG93UmVzaXplKCk6IHZvaWQge1xyXG4gICAgY2FtZXJhLmFzcGVjdCA9IHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgIHJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSByZXR1cm47XHJcblxyXG4gICAgY29uc29sZS5sb2coJ1N0YXJ0aW5nIGdhbWUuLi4nKTtcclxuICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgc2NvcmUgPSAwO1xyXG5cclxuICAgIC8vIFJlc2V0IHBsYXllclxyXG4gICAgcGxheWVyLnJlc2V0KCk7XHJcbiAgICAvLyBTeW5jaHJvbml6ZSBwbGF5ZXIgbWVzaCBwb3NpdGlvbiB3aXRoIGl0cyBwaHlzaWNzIGJvZHlcclxuICAgIHBsYXllci5tZXNoLnBvc2l0aW9uLmNvcHkocGxheWVyLmJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgIFxyXG4gICAgLy8gUmVzZXQgcm90YXRpb25zLiBjb250cm9scy5vYmplY3QgaGFuZGxlcyBob3Jpem9udGFsLCBpdHMgY2hpbGQgKGNhbWVyYSkgaGFuZGxlcyB2ZXJ0aWNhbC5cclxuICAgIGNvbnRyb2xzLm9iamVjdC5yb3RhdGlvbi55ID0gMDtcclxuICAgIGNvbnRyb2xzLm9iamVjdC5jaGlsZHJlblswXS5yb3RhdGlvbi54ID0gMDtcclxuXHJcbiAgICAvLyBDbGVhciBhbmQgcmVzcGF3biBlbmVtaWVzXHJcbiAgICBlbmVtaWVzLmZvckVhY2goZSA9PiBlLmRlc3Ryb3koKSk7XHJcbiAgICBlbmVtaWVzID0gW107XHJcbiAgICBzZXR1cEVuZW1pZXMoKTtcclxuXHJcbiAgICAvLyBDbGVhciBidWxsZXRzXHJcbiAgICBidWxsZXRzLmZvckVhY2goYiA9PiBiLmRlc3Ryb3koKSk7XHJcbiAgICBidWxsZXRzID0gW107XHJcblxyXG4gICAgdWkuaGlkZVRpdGxlU2NyZWVuKCk7XHJcbiAgICB1aS5oaWRlR2FtZU92ZXJTY3JlZW4oKTtcclxuICAgIHVpLnVwZGF0ZUhlYWx0aChwbGF5ZXIuaGVhbHRoKTtcclxuICAgIHVpLnVwZGF0ZVNjb3JlKHNjb3JlKTtcclxuICAgIGlmIChiZ20gJiYgIWJnbS5pc1BsYXlpbmcpIHtcclxuICAgICAgICBiZ20ucGxheSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnYW1lT3ZlcigpOiB2b2lkIHtcclxuICAgIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5HQU1FX09WRVIpIHJldHVybjtcclxuXHJcbiAgICBjb25zb2xlLmxvZygnR2FtZSBPdmVyIScpO1xyXG4gICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLkdBTUVfT1ZFUjtcclxuICAgIHVpLnNob3dHYW1lT3ZlclNjcmVlbihzY29yZSk7XHJcbiAgICBpZiAoYmdtICYmIGJnbS5pc1BsYXlpbmcpIHtcclxuICAgICAgICBiZ20uc3RvcCgpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgZ2FtZU92ZXJTb3VuZCA9IHNvdW5kRWZmZWN0TWFwLmdldCgnZ2FtZV9vdmVyJyk7XHJcbiAgICBpZiAoZ2FtZU92ZXJTb3VuZCkge1xyXG4gICAgICAgIGdhbWVPdmVyU291bmQuc3RvcCgpOyAvLyBFbnN1cmUgaXQgY2FuIHBsYXlcclxuICAgICAgICBnYW1lT3ZlclNvdW5kLnBsYXkoKTtcclxuICAgIH1cclxuICAgIGRvY3VtZW50LmV4aXRQb2ludGVyTG9jaygpO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gYW5pbWF0ZShjdXJyZW50VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCk6IHZvaWQge1xyXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xyXG5cclxuICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIGxhc3RGcmFtZVRpbWUpIC8gMTAwMDsgLy8gQ29udmVydCB0byBzZWNvbmRzXHJcbiAgICBsYXN0RnJhbWVUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAvLyBQaHlzaWNzIHVwZGF0ZSAoZml4ZWQgdGltZSBzdGVwKVxyXG4gICAgICAgIHdvcmxkLnN0ZXAoMSAvIGNvbmZpZy5nYW1lLnRhcmdldEZQUywgZGVsdGFUaW1lLCAzKTtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHVwZGF0ZVxyXG4gICAgICAgIHBsYXllci51cGRhdGUoZGVsdGFUaW1lLCBpbnB1dEhhbmRsZXIsIGNvbnRyb2xzKTtcclxuXHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggd2l0aCBpdHMgcGh5c2ljcyBib2R5XHJcbiAgICAgICAgcGxheWVyLm1lc2gucG9zaXRpb24uY29weShwbGF5ZXIuYm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG5cclxuICAgICAgICAvLyBFbmVtaWVzIHVwZGF0ZVxyXG4gICAgICAgIGVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgIGVuZW15LnVwZGF0ZShkZWx0YVRpbWUsIHBsYXllci5ib2R5LnBvc2l0aW9uLCBwbGF5ZXIpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBCdWxsZXRzIHVwZGF0ZSBhbmQgcmVtb3ZhbFxyXG4gICAgICAgIGZvciAobGV0IGkgPSBidWxsZXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IGJ1bGxldHNbaV07XHJcbiAgICAgICAgICAgIGlmIChidWxsZXQudXBkYXRlKGRlbHRhVGltZSkpIHtcclxuICAgICAgICAgICAgICAgIC8vIElmIGJ1bGxldCBsaWZldGltZSBleHBpcmVkIG9yIGl0IGhpdCBzb21ldGhpbmcsIHJlbW92ZSBpdFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0LmRlc3Ryb3koKTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldHMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgc2hvb3RpbmdcclxuICAgICAgICBpZiAoaW5wdXRIYW5kbGVyLmNvbnN1bWVTaG9vdFJlcXVlc3QoKSkge1xyXG4gICAgICAgICAgICBzaG9vdEJ1bGxldCgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUHJvY2VzcyBoaXRzIChlbmVteSBoZWFsdGgsIHNjb3JlLCBzb3VuZCkgYWZ0ZXIgYnVsbGV0IHBoeXNpY3MgdXBkYXRlXHJcbiAgICAgICAgLy8gVGhpcyBsb29wIHByb2Nlc3NlcyBidWxsZXRzIHRoYXQgaGF2ZSByZWdpc3RlcmVkIGEgY29sbGlzaW9uXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IGJ1bGxldHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0ID0gYnVsbGV0c1tpXTtcclxuICAgICAgICAgICAgaWYgKGJ1bGxldC5pc0hpdCkgeyAvLyBJZiBidWxsZXQgcmVnaXN0ZXJlZCBhIGNvbGxpc2lvblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IGVuZW1pZXMubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbmVteSA9IGVuZW1pZXNbal07XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFlbmVteS5pc0FjdGl2ZSkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlLWNoZWNrIGZvciBjb2xsaXNpb24gdG8gaWRlbnRpZnkgdGhlIHNwZWNpZmljIGVuZW15IGhpdFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gYnVsbGV0LmJvZHkucG9zaXRpb24uZGlzdGFuY2VUbyhlbmVteS5ib2R5LnBvc2l0aW9uKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZGlzdGFuY2UgPCBidWxsZXQuY29uZmlnLnJhZGl1cyArIGVuZW15LmNvbmZpZy5yYWRpdXMgKyAwLjEpIHsgLy8gQSBiaXQgb2YgYnVmZmVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15LnRha2VEYW1hZ2UoYnVsbGV0LmdldERhbWFnZSgpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcmUgKz0gMTA7IC8vIEF3YXJkIHNjb3JlIGZvciBoaXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgdWkudXBkYXRlU2NvcmUoc2NvcmUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGl0U291bmQgPSBzb3VuZEVmZmVjdE1hcC5nZXQoJ2hpdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGl0U291bmQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhpdFNvdW5kLnN0b3AoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhpdFNvdW5kLnBsYXkoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFlbmVteS5pc0FjdGl2ZSkgeyAvLyBFbmVteSBkaWVkIGZyb20gdGhpcyBoaXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3JlICs9IDUwOyAvLyBCb251cyBzY29yZSBmb3Iga2lsbGluZ1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdWkudXBkYXRlU2NvcmUoc2NvcmUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRW5lbXkgd2lsbCBiZSByZW1vdmVkIGZyb20gYGVuZW1pZXNgIGFycmF5IGluIHRoZSBuZXh0IGl0ZXJhdGlvbiBvZiBpdHMgbG9vcFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEJ1bGxldCBpcyByZW1vdmVkIGJ5IGBidWxsZXQudXBkYXRlKClgIGNoZWNraW5nIGBpc0hpdGBcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7IC8vIEJ1bGxldCBhbHJlYWR5IGhpdCwgbm8gbmVlZCB0byBjaGVjayBvdGhlciBlbmVtaWVzXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZW1vdmUgaW5hY3RpdmUgZW5lbWllc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSBlbmVtaWVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGlmICghZW5lbWllc1tpXS5pc0FjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgZW5lbWllc1tpXS5kZXN0cm95KCk7XHJcbiAgICAgICAgICAgICAgICBlbmVtaWVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgZ2FtZSBvdmVyIGNvbmRpdGlvbnNcclxuICAgICAgICBpZiAocGxheWVyLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIGdhbWVPdmVyKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChlbmVtaWVzLmxlbmd0aCA9PT0gMCAmJiBzY29yZSA+PSBjb25maWcuZ2FtZS5tYXhTY29yZSkge1xyXG4gICAgICAgICAgICAvLyBBbGwgZW5lbWllcyBkZWZlYXRlZCBhbmQgbWF4IHNjb3JlIGFjaGlldmVkIC0gd2luIGNvbmRpdGlvblxyXG4gICAgICAgICAgICBnYW1lT3ZlcigpOyAvLyBDYW4gYmUgY2hhbmdlZCB0byBhICdXaW4nIHNjcmVlblxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBSZW5kZXIgc2NlbmVcclxuICAgIHJlbmRlcmVyLnJlbmRlcihzY2VuZSwgY2FtZXJhKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvb3RCdWxsZXQoKTogdm9pZCB7XHJcbiAgICBjb25zdCBzaG9vdFNvdW5kID0gc291bmRFZmZlY3RNYXAuZ2V0KCdzaG9vdCcpO1xyXG4gICAgaWYgKHNob290U291bmQpIHtcclxuICAgICAgICBzaG9vdFNvdW5kLnN0b3AoKTsgLy8gU3RvcCBpZiBhbHJlYWR5IHBsYXlpbmcgdG8gcmVwbGF5IHF1aWNrbHlcclxuICAgICAgICBzaG9vdFNvdW5kLnBsYXkoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgY2FtZXJhJ3MgZm9yd2FyZCBkaXJlY3Rpb25cclxuICAgIGNvbnN0IGNhbWVyYURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICBjYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24oY2FtZXJhRGlyZWN0aW9uKTtcclxuXHJcbiAgICAvLyBCdWxsZXQgc3Bhd24gcG9zaXRpb246IGdldCB0aGUgY2FtZXJhJ3MgYWJzb2x1dGUgd29ybGQgcG9zaXRpb25cclxuICAgIGNvbnN0IGFic29sdXRlQ2FtZXJhUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgY2FtZXJhLmdldFdvcmxkUG9zaXRpb24oYWJzb2x1dGVDYW1lcmFQb3NpdGlvbik7XHJcblxyXG4gICAgLy8gU3Bhd24gYnVsbGV0IHNsaWdodGx5IGluIGZyb250IG9mIHRoZSBjYW1lcmFcclxuICAgIGNvbnN0IHNwYXduT2Zmc2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jb3B5KGNhbWVyYURpcmVjdGlvbikubXVsdGlwbHlTY2FsYXIoMC41KTtcclxuICAgIGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBhYnNvbHV0ZUNhbWVyYVBvc2l0aW9uLmFkZChzcGF3bk9mZnNldCk7XHJcblxyXG4gICAgLy8gQnVsbGV0IGluaXRpYWwgdmVsb2NpdHlcclxuICAgIGNvbnN0IHZlbG9jaXR5ID0gY2FtZXJhRGlyZWN0aW9uLm11bHRpcGx5U2NhbGFyKGNvbmZpZy5idWxsZXQuc3BlZWQpO1xyXG5cclxuICAgIGNvbnN0IGJ1bGxldCA9IG5ldyBCdWxsZXQoc2NlbmUsIHdvcmxkLCBjb25maWcuYnVsbGV0LCBhc3NldE1hbmFnZXIsIHN0YXJ0UG9zaXRpb24sIHZlbG9jaXR5LCBidWxsZXRNYXRlcmlhbCk7XHJcbiAgICBidWxsZXRzLnB1c2goYnVsbGV0KTtcclxufVxyXG5cclxuLy8gSW5pdGlhbCBjYWxsIHRvIHN0YXJ0IHRoZSBnYW1lXHJcbmluaXRHYW1lKCk7Il0sCiAgIm1hcHBpbmdzIjogIkFBQUEsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQUN4QixTQUFTLDJCQUEyQjtBQXdEcEMsTUFBTSxhQUFhO0FBQUEsRUFPZixZ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T0FBTyxPQUFPLFNBQVMsTUFBTSxPQUFPLFNBQVMsS0FBSztBQUM3RCxrQkFBTSxXQUFXLE9BQU8sVUFBVSxDQUFDO0FBQ25DLHFCQUFTO0FBQ1QsZUFBRyxZQUFZLEtBQUs7QUFFcEIsa0JBQU0sV0FBVyxlQUFlLElBQUksS0FBSztBQUN6QyxnQkFBSSxVQUFVO0FBQ1YsdUJBQVMsS0FBSztBQUNkLHVCQUFTLEtBQUs7QUFBQSxZQUNsQjtBQUVBLGdCQUFJLENBQUMsTUFBTSxVQUFVO0FBQ2pCLHVCQUFTO0FBQ1QsaUJBQUcsWUFBWSxLQUFLO0FBQUEsWUFFeEI7QUFFQTtBQUFBLFVBQ0o7QUFBQSxRQUNKO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFHQSxhQUFTLElBQUksUUFBUSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDMUMsVUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVU7QUFDdEIsZ0JBQVEsQ0FBQyxFQUFFLFFBQVE7QUFDbkIsZ0JBQVEsT0FBTyxHQUFHLENBQUM7QUFBQSxNQUN2QjtBQUFBLElBQ0o7QUFHQSxRQUFJLE9BQU8sVUFBVSxHQUFHO0FBQ3BCLGVBQVM7QUFBQSxJQUNiLFdBQVcsUUFBUSxXQUFXLEtBQUssU0FBUyxPQUFPLEtBQUssVUFBVTtBQUU5RCxlQUFTO0FBQUEsSUFDYjtBQUFBLEVBQ0o7QUFHQSxXQUFTLE9BQU8sT0FBTyxNQUFNO0FBQ2pDO0FBRUEsU0FBUyxjQUFvQjtBQUN6QixRQUFNLGFBQWEsZUFBZSxJQUFJLE9BQU87QUFDN0MsTUFBSSxZQUFZO0FBQ1osZUFBVyxLQUFLO0FBQ2hCLGVBQVcsS0FBSztBQUFBLEVBQ3BCO0FBR0EsUUFBTSxrQkFBa0IsSUFBSSxNQUFNLFFBQVE7QUFDMUMsU0FBTyxrQkFBa0IsZUFBZTtBQUd4QyxRQUFNLHlCQUF5QixJQUFJLE1BQU0sUUFBUTtBQUNqRCxTQUFPLGlCQUFpQixzQkFBc0I7QUFHOUMsUUFBTSxjQUFjLElBQUksTUFBTSxRQUFRLEVBQUUsS0FBSyxlQUFlLEVBQUUsZUFBZSxHQUFHO0FBQ2hGLFFBQU0sZ0JBQWdCLHVCQUF1QixJQUFJLFdBQVc7QUFHNUQsUUFBTSxXQUFXLGdCQUFnQixlQUFlLE9BQU8sT0FBTyxLQUFLO0FBRW5FLFFBQU0sU0FBUyxJQUFJLE9BQU8sT0FBTyxPQUFPLE9BQU8sUUFBUSxjQUFjLGVBQWUsVUFBVSxjQUFjO0FBQzVHLFVBQVEsS0FBSyxNQUFNO0FBQ3ZCO0FBR0EsU0FBUzsiLAogICJuYW1lcyI6IFsiY29uZmlnIiwgInNjZW5lIiwgIndvcmxkIiwgImNhbWVyYSIsICJjb250cm9scyIsICJhc3NldE1hbmFnZXIiLCAiYnVsbGV0TWF0ZXJpYWwiLCAiZW5lbXlNYXRlcmlhbCIsICJwbGF5ZXIiLCAiY2FudmFzIiwgInNjb3JlIiwgIkdhbWVTdGF0ZSIsICJDb2xsaXNpb25Hcm91cHMiXQp9Cg==
