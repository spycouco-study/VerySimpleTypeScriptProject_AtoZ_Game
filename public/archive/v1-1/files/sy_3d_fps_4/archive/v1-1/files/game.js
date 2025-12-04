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
    scene2.add(this.mesh);
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
  scene.add(controls.object);
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
  controls.object.position.copy(player.body.position);
  controls.object.position.y += config.player.cameraOffset.y;
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
    controls.object.position.copy(player.body.position);
    controls.object.position.y += config.player.cameraOffset.y;
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
  const spawnOffset = new THREE.Vector3().copy(cameraDirection).multiplyScalar(0.5);
  const startPosition = new THREE.Vector3().copy(controls.object.position).add(spawnOffset);
  startPosition.y += config.player.cameraOffset.y;
  const velocity = cameraDirection.multiplyScalar(config.bullet.speed);
  const bullet = new Bullet(scene, world, config.bullet, assetManager, startPosition, velocity, bulletMaterial);
  bullets.push(bullet);
}
initGame();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuaW1wb3J0IHsgUG9pbnRlckxvY2tDb250cm9scyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS9jb250cm9scy9Qb2ludGVyTG9ja0NvbnRyb2xzLmpzJztcclxuXHJcbi8vIENvbmZpZ3VyYXRpb24gSW50ZXJmYWNlIGZvciBkYXRhLmpzb25cclxuaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgcGxheWVyOiB7XHJcbiAgICAgICAgc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBqdW1wRm9yY2U6IG51bWJlcjtcclxuICAgICAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgICAgICByYWRpdXM6IG51bWJlcjtcclxuICAgICAgICBoZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBtYXNzOiBudW1iZXI7XHJcbiAgICAgICAgZnJpY3Rpb246IG51bWJlcjtcclxuICAgICAgICBhbmd1bGFyRGFtcGluZzogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYU9mZnNldDogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyOyB9O1xyXG4gICAgfTtcclxuICAgIGJ1bGxldDoge1xyXG4gICAgICAgIHNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgcmFkaXVzOiBudW1iZXI7XHJcbiAgICAgICAgbWFzczogbnVtYmVyO1xyXG4gICAgICAgIGxpZmV0aW1lOiBudW1iZXI7XHJcbiAgICAgICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgZW5lbXk6IHtcclxuICAgICAgICBjb3VudDogbnVtYmVyO1xyXG4gICAgICAgIHJhZGl1czogbnVtYmVyO1xyXG4gICAgICAgIGhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIG1hc3M6IG51bWJlcjtcclxuICAgICAgICBoZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIHNwYXduUmFkaXVzOiBudW1iZXI7XHJcbiAgICAgICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICAgICAgYXR0YWNrSW50ZXJ2YWw6IG51bWJlcjtcclxuICAgIH07XHJcbiAgICBnYW1lOiB7XHJcbiAgICAgICAgZ3Jhdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGZsb29yU2l6ZTogbnVtYmVyO1xyXG4gICAgICAgIHdhbGxIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBtYXhTY29yZTogbnVtYmVyO1xyXG4gICAgICAgIHRhcmdldEZQUzogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIHVpOiB7XHJcbiAgICAgICAgZm9udFNpemU6IG51bWJlcjtcclxuICAgICAgICBmb250RmFtaWx5OiBzdHJpbmc7XHJcbiAgICAgICAgZm9udENvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgY3Jvc3NoYWlyU2l6ZTogbnVtYmVyO1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIGdhbWVPdmVyVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHByZXNzVG9TdGFydFRleHQ6IHN0cmluZztcclxuICAgIH07XHJcbiAgICBhc3NldHM6IHtcclxuICAgICAgICBpbWFnZXM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyOyB9W107XHJcbiAgICB9O1xyXG59XHJcblxyXG4vLyAtLS0gQXNzZXRNYW5hZ2VyIC0tLVxyXG5jbGFzcyBBc3NldE1hbmFnZXIge1xyXG4gICAgcHJpdmF0ZSB0ZXh0dXJlTG9hZGVyOiBUSFJFRS5UZXh0dXJlTG9hZGVyO1xyXG4gICAgcHJpdmF0ZSBhdWRpb0xvYWRlcjogVEhSRUUuQXVkaW9Mb2FkZXI7XHJcbiAgICBwcml2YXRlIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPjtcclxuICAgIHByaXZhdGUgYXVkaW9CdWZmZXJzOiBNYXA8c3RyaW5nLCBBdWRpb0J1ZmZlcj47XHJcbiAgICBwcml2YXRlIGNvbmZpZzogR2FtZUNvbmZpZztcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihjb25maWc6IEdhbWVDb25maWcpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLnRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIHRoaXMuYXVkaW9Mb2FkZXIgPSBuZXcgVEhSRUUuQXVkaW9Mb2FkZXIoKTtcclxuICAgICAgICB0aGlzLnRleHR1cmVzID0gbmV3IE1hcCgpO1xyXG4gICAgICAgIHRoaXMuYXVkaW9CdWZmZXJzID0gbmV3IE1hcCgpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoYXNzZXQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlTG9hZGVyLmxvYWQoYXNzZXQucGF0aCxcclxuICAgICAgICAgICAgICAgICAgICAodGV4dHVyZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVzLnNldChhc3NldC5uYW1lLCB0ZXh0dXJlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLCAvLyBvblByb2dyZXNzIGNhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICAgICAgKGVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmUgJHthc3NldC5wYXRofTpgLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGF1ZGlvUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChhc3NldCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvTG9hZGVyLmxvYWQoYXNzZXQucGF0aCxcclxuICAgICAgICAgICAgICAgICAgICAoYnVmZmVyKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9CdWZmZXJzLnNldChhc3NldC5uYW1lLCBidWZmZXIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsIC8vIG9uUHJvZ3Jlc3MgY2FsbGJhY2tcclxuICAgICAgICAgICAgICAgICAgICAoZXJyb3IpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgYXVkaW8gJHthc3NldC5wYXRofTpgLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi50ZXh0dXJlUHJvbWlzZXMsIC4uLmF1ZGlvUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZygnQWxsIGFzc2V0cyBsb2FkZWQuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0VGV4dHVyZShuYW1lOiBzdHJpbmcpOiBUSFJFRS5UZXh0dXJlIHwgdW5kZWZpbmVkIHtcclxuICAgICAgICByZXR1cm4gdGhpcy50ZXh0dXJlcy5nZXQobmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0QXVkaW9CdWZmZXIobmFtZTogc3RyaW5nKTogQXVkaW9CdWZmZXIgfCB1bmRlZmluZWQge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmF1ZGlvQnVmZmVycy5nZXQobmFtZSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBJbnB1dEhhbmRsZXIgLS0tXHJcbmNsYXNzIElucHV0SGFuZGxlciB7XHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9O1xyXG4gICAgcHJpdmF0ZSBtb3VzZUJ1dHRvbnM6IHsgW2J1dHRvbjogbnVtYmVyXTogYm9vbGVhbiB9O1xyXG4gICAgcHVibGljIG1vdXNlRGVsdGFYOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgbW91c2VEZWx0YVk6IG51bWJlcjtcclxuICAgIHB1YmxpYyBpc1BvaW50ZXJMb2NrZWQ6IGJvb2xlYW47XHJcbiAgICBwdWJsaWMgc2hvb3RSZXF1ZXN0ZWQ6IGJvb2xlYW47XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5rZXlzID0ge307XHJcbiAgICAgICAgdGhpcy5tb3VzZUJ1dHRvbnMgPSB7fTtcclxuICAgICAgICB0aGlzLm1vdXNlRGVsdGFYID0gMDtcclxuICAgICAgICB0aGlzLm1vdXNlRGVsdGFZID0gMDtcclxuICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuc2hvb3RSZXF1ZXN0ZWQgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMub25LZXlVcC5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHRoaXMub25Nb3VzZVVwLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSwgZmFsc2UpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21venBvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5jb2RlXSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmNvZGVdID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICB0aGlzLm1vdXNlRGVsdGFYICs9IGV2ZW50Lm1vdmVtZW50WCB8fCAwO1xyXG4gICAgICAgICAgICB0aGlzLm1vdXNlRGVsdGFZICs9IGV2ZW50Lm1vdmVtZW50WSB8fCAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTW91c2VEb3duKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5tb3VzZUJ1dHRvbnNbZXZlbnQuYnV0dG9uXSA9IHRydWU7XHJcbiAgICAgICAgaWYgKGV2ZW50LmJ1dHRvbiA9PT0gMCAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkgeyAvLyBMZWZ0IG1vdXNlIGJ1dHRvblxyXG4gICAgICAgICAgICB0aGlzLnNob290UmVxdWVzdGVkID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlVXAoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm1vdXNlQnV0dG9uc1tldmVudC5idXR0b25dID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrQ2hhbmdlKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGdhbWVDYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpO1xyXG4gICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSBnYW1lQ2FudmFzO1xyXG4gICAgfVxyXG5cclxuICAgIGlzS2V5UHJlc3NlZChjb2RlOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gISF0aGlzLmtleXNbY29kZV07XHJcbiAgICB9XHJcblxyXG4gICAgaXNNb3VzZUJ1dHRvblByZXNzZWQoYnV0dG9uOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICByZXR1cm4gISF0aGlzLm1vdXNlQnV0dG9uc1tidXR0b25dO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN1bWVTaG9vdFJlcXVlc3QoKTogYm9vbGVhbiB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2hvb3RSZXF1ZXN0ZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5zaG9vdFJlcXVlc3RlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHJlc2V0TW91c2VEZWx0YSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLm1vdXNlRGVsdGFYID0gMDtcclxuICAgICAgICB0aGlzLm1vdXNlRGVsdGFZID0gMDtcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIFBsYXllciBDbGFzcyAtLS1cclxuY2xhc3MgUGxheWVyIHtcclxuICAgIHB1YmxpYyBtZXNoOiBUSFJFRS5NZXNoOyAvLyBJbnZpc2libGUgbWVzaCB0byBrZWVwIHRyYWNrIG9mIHBsYXllciBwb3NpdGlvbi9yb3RhdGlvbiBmb3IgcGh5c2ljc1xyXG4gICAgcHVibGljIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgcHVibGljIGNhbWVyYTogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbiAgICBwdWJsaWMgY29uZmlnOiBHYW1lQ29uZmlnWydwbGF5ZXInXTsgLy8gTWFrZSBjb25maWcgcHVibGljIGZvciBlbmVteSBpbnRlcmFjdGlvblxyXG4gICAgcHJpdmF0ZSBwaHlzaWNzTWF0ZXJpYWw6IENBTk5PTi5NYXRlcmlhbDtcclxuICAgIHByaXZhdGUganVtcFRpbWVvdXQ6IG51bWJlcjtcclxuICAgIHB1YmxpYyBoZWFsdGg6IG51bWJlcjtcclxuICAgIHByaXZhdGUgbGFzdERhbWFnZVRpbWU6IG51bWJlcjtcclxuICAgIHByaXZhdGUgZGFtYWdlQ29vbGRvd246IG51bWJlciA9IDAuNTsgLy8gc2Vjb25kc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKHNjZW5lOiBUSFJFRS5TY2VuZSwgd29ybGQ6IENBTk5PTi5Xb3JsZCwgY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSwgY29uZmlnOiBHYW1lQ29uZmlnWydwbGF5ZXInXSwgcGh5c2ljc01hdGVyaWFsOiBDQU5OT04uTWF0ZXJpYWwpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IGNhbWVyYTtcclxuICAgICAgICB0aGlzLnBoeXNpY3NNYXRlcmlhbCA9IHBoeXNpY3NNYXRlcmlhbDtcclxuICAgICAgICB0aGlzLmp1bXBUaW1lb3V0ID0gMDtcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IHRoaXMuY29uZmlnLmhlYWx0aDtcclxuICAgICAgICB0aGlzLmxhc3REYW1hZ2VUaW1lID0gMDtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHBoeXNpY3MgYm9keSAoQ2Fwc3VsZSBmb3IgYmV0dGVyIGNvbGxpc2lvbiB3aXRoIGZsb29ycy93YWxscylcclxuICAgICAgICBjb25zdCBjYXBzdWxlU2hhcGUgPSBuZXcgQ0FOTk9OLkN5bGluZGVyKHRoaXMuY29uZmlnLnJhZGl1cywgdGhpcy5jb25maWcucmFkaXVzLCB0aGlzLmNvbmZpZy5oZWlnaHQsIDgpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiB0aGlzLmNvbmZpZy5tYXNzLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKDAsIHRoaXMuY29uZmlnLmhlaWdodCAvIDIgKyAxLCAwKSwgLy8gU3RhcnQgc2xpZ2h0bHkgYWJvdmUgZ3JvdW5kXHJcbiAgICAgICAgICAgIHNoYXBlOiBjYXBzdWxlU2hhcGUsXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiBwaHlzaWNzTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUsIC8vIFByZXZlbnQgcGxheWVyIGZyb20gdGlwcGluZyBvdmVyXHJcbiAgICAgICAgICAgIGFuZ3VsYXJEYW1waW5nOiB0aGlzLmNvbmZpZy5hbmd1bGFyRGFtcGluZyxcclxuICAgICAgICAgICAgbGluZWFyRGFtcGluZzogMC45LCAvLyBBZGQgc29tZSBsaW5lYXIgZGFtcGluZyBmb3Igc21vb3RoZXIgc3RvcHBpbmdcclxuICAgICAgICAgICAgY29sbGlzaW9uRmlsdGVyR3JvdXA6IENvbGxpc2lvbkdyb3Vwcy5QTEFZRVIsXHJcbiAgICAgICAgICAgIGNvbGxpc2lvbkZpbHRlck1hc2s6IENvbGxpc2lvbkdyb3Vwcy5HUk9VTkQgfCBDb2xsaXNpb25Hcm91cHMuRU5FTVkgfCBDb2xsaXNpb25Hcm91cHMuV0FMTFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHBsYXllckJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygxLCAwLCAwKSwgLU1hdGguUEkgLyAyKTsgLy8gT3JpZW50IGN5bGluZGVyIHZlcnRpY2FsbHlcclxuICAgICAgICB3b3JsZC5hZGRCb2R5KHBsYXllckJvZHkpO1xyXG4gICAgICAgIHRoaXMuYm9keSA9IHBsYXllckJvZHk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciB2aXN1YWwgbWVzaCAoc2ltcGxlIGN5bGluZGVyIGZvciByZXByZXNlbnRhdGlvbiwgY2FtZXJhIGlzIG1haW4gdmlldylcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5DeWxpbmRlckdlb21ldHJ5KHRoaXMuY29uZmlnLnJhZGl1cywgdGhpcy5jb25maWcucmFkaXVzLCB0aGlzLmNvbmZpZy5oZWlnaHQsIDMyKTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJNYXRlcmlhbE1lc2ggPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBjb2xvcjogMHgwMGZmMDAsIHRyYW5zcGFyZW50OiB0cnVlLCBvcGFjaXR5OiAwIH0pOyAvLyBJbnZpc2libGUgcGxheWVyXHJcbiAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsTWVzaCk7XHJcbiAgICAgICAgc2NlbmUuYWRkKHRoaXMubWVzaCk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyLCBpbnB1dDogSW5wdXRIYW5kbGVyLCBjb250cm9sczogUG9pbnRlckxvY2tDb250cm9scyk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYm9keS5zbGVlcCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYm9keS53YWtlVXAoKTtcclxuXHJcbiAgICAgICAgLy8gQ2FtZXJhIHJvdGF0aW9uIGZyb20gbW91c2UgaW5wdXQgaXMgaGFuZGxlZCBieSBQb2ludGVyTG9ja0NvbnRyb2xzIGRpcmVjdGx5XHJcbiAgICAgICAgLy8gUGxheWVyIGJvZHkgcG9zaXRpb24gaXMgdXBkYXRlZCB0byBjYW1lcmEgcG9zaXRpb24gaW4gdGhlIG1haW4gbG9vcFxyXG4gICAgICAgIGlmIChpbnB1dC5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbW91c2VTZW5zaXRpdml0eSA9IDAuMDAyO1xyXG4gICAgICAgICAgICBjb250cm9scy5vYmplY3Qucm90YXRpb24ueSAtPSBpbnB1dC5tb3VzZURlbHRhWCAqIG1vdXNlU2Vuc2l0aXZpdHk7XHJcbiAgICAgICAgICAgIGNvbnRyb2xzLm9iamVjdC5jaGlsZHJlblswXS5yb3RhdGlvbi54IC09IGlucHV0Lm1vdXNlRGVsdGFZICogbW91c2VTZW5zaXRpdml0eTtcclxuICAgICAgICAgICAgY29udHJvbHMub2JqZWN0LmNoaWxkcmVuWzBdLnJvdGF0aW9uLnggPSBNYXRoLm1heCgtTWF0aC5QSSAvIDIsIE1hdGgubWluKE1hdGguUEkgLyAyLCBjb250cm9scy5vYmplY3QuY2hpbGRyZW5bMF0ucm90YXRpb24ueCkpO1xyXG4gICAgICAgICAgICBpbnB1dC5yZXNldE1vdXNlRGVsdGEoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IG1vdmVtZW50IGZvcmNlcyBiYXNlZCBvbiBjYW1lcmEgZGlyZWN0aW9uXHJcbiAgICAgICAgY29uc3QgbW92ZURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgY29uc3QgY2FtZXJhRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi55ID0gMDsgLy8gT25seSBob3Jpem9udGFsIG1vdmVtZW50IGZvciBwbGF5ZXJcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJpZ2h0RGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMobmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCksIGNhbWVyYURpcmVjdGlvbikubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGlmIChpbnB1dC5pc0tleVByZXNzZWQoJ0tleVcnKSkgbW92ZURpcmVjdGlvbi5hZGQoY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICBpZiAoaW5wdXQuaXNLZXlQcmVzc2VkKCdLZXlTJykpIG1vdmVEaXJlY3Rpb24uc3ViKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgaWYgKGlucHV0LmlzS2V5UHJlc3NlZCgnS2V5QScpKSBtb3ZlRGlyZWN0aW9uLnN1YihyaWdodERpcmVjdGlvbik7XHJcbiAgICAgICAgaWYgKGlucHV0LmlzS2V5UHJlc3NlZCgnS2V5RCcpKSBtb3ZlRGlyZWN0aW9uLmFkZChyaWdodERpcmVjdGlvbik7XHJcblxyXG4gICAgICAgIG1vdmVEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IHRoZSB0YXJnZXQgdmVsb2NpdHkgZGlyZWN0bHksIHByZXNlcnZpbmcgY3VycmVudCBZIHZlbG9jaXR5IGZvciBncmF2aXR5L2p1bXBcclxuICAgICAgICBjb25zdCB0YXJnZXRWZWxvY2l0eVggPSBtb3ZlRGlyZWN0aW9uLnggKiB0aGlzLmNvbmZpZy5zcGVlZDtcclxuICAgICAgICBjb25zdCB0YXJnZXRWZWxvY2l0eVogPSBtb3ZlRGlyZWN0aW9uLnogKiB0aGlzLmNvbmZpZy5zcGVlZDtcclxuXHJcbiAgICAgICAgdGhpcy5ib2R5LnZlbG9jaXR5LnggPSB0YXJnZXRWZWxvY2l0eVg7XHJcbiAgICAgICAgdGhpcy5ib2R5LnZlbG9jaXR5LnogPSB0YXJnZXRWZWxvY2l0eVo7XHJcblxyXG4gICAgICAgIC8vIEp1bXBcclxuICAgICAgICB0aGlzLmp1bXBUaW1lb3V0IC09IGRlbHRhVGltZTtcclxuICAgICAgICBpZiAoaW5wdXQuaXNLZXlQcmVzc2VkKCdTcGFjZScpICYmIHRoaXMuanVtcFRpbWVvdXQgPD0gMCkge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBwbGF5ZXIgaXMgb24gZ3JvdW5kLiBBIHNpbXBsZSBhcHByb3hpbWF0aW9uOlxyXG4gICAgICAgICAgICAvLyBpZiBwbGF5ZXIncyB5IHZlbG9jaXR5IGlzIGNsb3NlIHRvIHplcm8gYW5kIGl0cyBib3R0b20gaXMgbmVhciB0aGUgZ3JvdW5kIHBsYW5lLlxyXG4gICAgICAgICAgICBpZiAoTWF0aC5hYnModGhpcy5ib2R5LnZlbG9jaXR5LnkpIDwgMC4xICYmIHRoaXMuYm9keS5wb3NpdGlvbi55IC0gdGhpcy5jb25maWcuaGVpZ2h0IC8gMiA8PSAwLjEpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS55ID0gdGhpcy5jb25maWcuanVtcEZvcmNlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5qdW1wVGltZW91dCA9IDAuNTsgLy8gQ29vbGRvd24gZm9yIGp1bXBpbmdcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0YWtlRGFtYWdlKGFtb3VudDogbnVtYmVyLCBjdXJyZW50VGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0RGFtYWdlVGltZSA+IHRoaXMuZGFtYWdlQ29vbGRvd24pIHtcclxuICAgICAgICAgICAgdGhpcy5oZWFsdGggLT0gYW1vdW50O1xyXG4gICAgICAgICAgICB0aGlzLmxhc3REYW1hZ2VUaW1lID0gY3VycmVudFRpbWU7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBQbGF5ZXIgdG9vayAke2Ftb3VudH0gZGFtYWdlLCBoZWFsdGg6ICR7dGhpcy5oZWFsdGh9YCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJlc2V0KCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gdGhpcy5jb25maWcuaGVhbHRoO1xyXG4gICAgICAgIHRoaXMuYm9keS5wb3NpdGlvbi5zZXQoMCwgdGhpcy5jb25maWcuaGVpZ2h0IC8gMiArIDEsIDApOyAvLyBSZXNldCB0byBzcGF3biBwb3NpdGlvblxyXG4gICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS5zZXQoMCwgMCwgMCk7XHJcbiAgICAgICAgdGhpcy5ib2R5LmFuZ3VsYXJWZWxvY2l0eS5zZXQoMCwgMCwgMCk7XHJcbiAgICAgICAgdGhpcy5ib2R5Lndha2VVcCgpOyAvLyBFbnN1cmUgYm9keSBpcyBhY3RpdmVcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIEJ1bGxldCBDbGFzcyAtLS1cclxuY2xhc3MgQnVsbGV0IHtcclxuICAgIHB1YmxpYyBtZXNoOiBUSFJFRS5NZXNoO1xyXG4gICAgcHVibGljIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgcHVibGljIGNvbmZpZzogR2FtZUNvbmZpZ1snYnVsbGV0J107IC8vIE1hZGUgcHVibGljIGZvciBhY2Nlc3NcclxuICAgIHByaXZhdGUgd29ybGQ6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgaW5pdGlhbExpZmV0aW1lOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIGRhbWFnZTogbnVtYmVyO1xyXG4gICAgcHVibGljIGlzSGl0OiBib29sZWFuID0gZmFsc2U7IC8vIEZsYWcgdG8gbWFyayBpZiBidWxsZXQgaGFzIGhpdCBzb21ldGhpbmdcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihzY2VuZTogVEhSRUUuU2NlbmUsIHdvcmxkOiBDQU5OT04uV29ybGQsIGNvbmZpZzogR2FtZUNvbmZpZ1snYnVsbGV0J10sIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyLCBzdGFydFBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzLCB2ZWxvY2l0eTogVEhSRUUuVmVjdG9yMywgYnVsbGV0TWF0ZXJpYWw6IENBTk5PTi5NYXRlcmlhbCkge1xyXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xyXG4gICAgICAgIHRoaXMud29ybGQgPSB3b3JsZDtcclxuICAgICAgICB0aGlzLmluaXRpYWxMaWZldGltZSA9IGNvbmZpZy5saWZldGltZTtcclxuICAgICAgICB0aGlzLmRhbWFnZSA9IGNvbmZpZy5kYW1hZ2U7XHJcblxyXG4gICAgICAgIC8vIFZpc3VhbCBtZXNoXHJcbiAgICAgICAgY29uc3QgYnVsbGV0VGV4dHVyZSA9IGFzc2V0TWFuYWdlci5nZXRUZXh0dXJlKCdwbGF5ZXJfYnVsbGV0Jyk7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWF0ZXJpYWxNZXNoID0gYnVsbGV0VGV4dHVyZSA/IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogYnVsbGV0VGV4dHVyZSB9KSA6IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IGNvbG9yOiAweGZmZmYwMCB9KTtcclxuICAgICAgICBjb25zdCBidWxsZXRHZW9tZXRyeSA9IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeShjb25maWcucmFkaXVzLCA4LCA4KTtcclxuICAgICAgICB0aGlzLm1lc2ggPSBuZXcgVEhSRUUuTWVzaChidWxsZXRHZW9tZXRyeSwgYnVsbGV0TWF0ZXJpYWxNZXNoKTtcclxuICAgICAgICB0aGlzLm1lc2gucG9zaXRpb24uY29weShzdGFydFBvc2l0aW9uKTtcclxuICAgICAgICBzY2VuZS5hZGQodGhpcy5tZXNoKTtcclxuXHJcbiAgICAgICAgLy8gUGh5c2ljcyBib2R5XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogY29uZmlnLm1hc3MsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMoc3RhcnRQb3NpdGlvbi54LCBzdGFydFBvc2l0aW9uLnksIHN0YXJ0UG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBuZXcgQ0FOTk9OLlNwaGVyZShjb25maWcucmFkaXVzKSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IGJ1bGxldE1hdGVyaWFsLFxyXG4gICAgICAgICAgICBjb2xsaXNpb25GaWx0ZXJHcm91cDogQ29sbGlzaW9uR3JvdXBzLkJVTExFVCxcclxuICAgICAgICAgICAgY29sbGlzaW9uRmlsdGVyTWFzazogQ29sbGlzaW9uR3JvdXBzLkVORU1ZIHwgQ29sbGlzaW9uR3JvdXBzLkdST1VORCB8IENvbGxpc2lvbkdyb3Vwcy5XQUxMLFxyXG4gICAgICAgICAgICBsaW5lYXJEYW1waW5nOiAwIC8vIE5vIGRhbXBpbmcgZm9yIGJ1bGxldHNcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLmJvZHkudmVsb2NpdHkuc2V0KHZlbG9jaXR5LngsIHZlbG9jaXR5LnksIHZlbG9jaXR5LnopO1xyXG4gICAgICAgIHdvcmxkLmFkZEJvZHkodGhpcy5ib2R5KTtcclxuXHJcbiAgICAgICAgdGhpcy5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbGxpZGUnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5pc0hpdCA9IHRydWU7IC8vIE1hcmsgYnVsbGV0IGFzIGhpdFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IGJvb2xlYW4geyAvLyBSZXR1cm5zIHRydWUgaWYgYnVsbGV0IHNob3VsZCBiZSByZW1vdmVkXHJcbiAgICAgICAgdGhpcy5tZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5ib2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgdGhpcy5pbml0aWFsTGlmZXRpbWUgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIHJldHVybiB0aGlzLmluaXRpYWxMaWZldGltZSA8PSAwIHx8IHRoaXMuaXNIaXQ7IC8vIFJlbW92ZSBpZiBsaWZldGltZSBleHBpcmVkIG9yIGhpdCBzb21ldGhpbmdcclxuICAgIH1cclxuXHJcbiAgICBnZXREYW1hZ2UoKTogbnVtYmVyIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5kYW1hZ2U7XHJcbiAgICB9XHJcblxyXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkodGhpcy5ib2R5KTtcclxuICAgICAgICB0aGlzLm1lc2gucGFyZW50Py5yZW1vdmUodGhpcy5tZXNoKTtcclxuICAgICAgICB0aGlzLm1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xyXG4gICAgICAgICh0aGlzLm1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWF0ZXJpYWwpLmRpc3Bvc2UoKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gLS0tIEVuZW15IENsYXNzIC0tLVxyXG5jbGFzcyBFbmVteSB7XHJcbiAgICBwdWJsaWMgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIHB1YmxpYyBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIHB1YmxpYyBjb25maWc6IEdhbWVDb25maWdbJ2VuZW15J107XHJcbiAgICBwcml2YXRlIHdvcmxkOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwdWJsaWMgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBwdWJsaWMgaXNBY3RpdmU6IGJvb2xlYW47XHJcbiAgICBwcml2YXRlIGxhc3RBdHRhY2tUaW1lOiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3Ioc2NlbmU6IFRIUkVFLlNjZW5lLCB3b3JsZDogQ0FOTk9OLldvcmxkLCBjb25maWc6IEdhbWVDb25maWdbJ2VuZW15J10sIGFzc2V0TWFuYWdlcjogQXNzZXRNYW5hZ2VyLCBwb3NpdGlvbjogVEhSRUUuVmVjdG9yMywgZW5lbXlNYXRlcmlhbDogQ0FOTk9OLk1hdGVyaWFsKSB7XHJcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XHJcbiAgICAgICAgdGhpcy53b3JsZCA9IHdvcmxkO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gY29uZmlnLmhlYWx0aDtcclxuICAgICAgICB0aGlzLmlzQWN0aXZlID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmxhc3RBdHRhY2tUaW1lID0gMDtcclxuXHJcbiAgICAgICAgLy8gVmlzdWFsIG1lc2hcclxuICAgICAgICBjb25zdCBlbmVteVRleHR1cmUgPSBhc3NldE1hbmFnZXIuZ2V0VGV4dHVyZSgnZW5lbXknKTtcclxuICAgICAgICBjb25zdCBlbmVteU1hdGVyaWFsTWVzaCA9IGVuZW15VGV4dHVyZSA/IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogZW5lbXlUZXh0dXJlIH0pIDogbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgY29sb3I6IDB4ZmYwMDAwIH0pO1xyXG4gICAgICAgIGNvbnN0IGVuZW15R2VvbWV0cnkgPSBuZXcgVEhSRUUuQ3lsaW5kZXJHZW9tZXRyeShjb25maWcucmFkaXVzLCBjb25maWcucmFkaXVzLCBjb25maWcuaGVpZ2h0LCAxNik7XHJcbiAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2goZW5lbXlHZW9tZXRyeSwgZW5lbXlNYXRlcmlhbE1lc2gpO1xyXG4gICAgICAgIHRoaXMubWVzaC5wb3NpdGlvbi5jb3B5KHBvc2l0aW9uKTtcclxuICAgICAgICBzY2VuZS5hZGQodGhpcy5tZXNoKTtcclxuXHJcbiAgICAgICAgLy8gUGh5c2ljcyBib2R5XHJcbiAgICAgICAgY29uc3QgY3lsaW5kZXJTaGFwZSA9IG5ldyBDQU5OT04uQ3lsaW5kZXIoY29uZmlnLnJhZGl1cywgY29uZmlnLnJhZGl1cywgY29uZmlnLmhlaWdodCwgOCk7XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogY29uZmlnLm1hc3MsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMocG9zaXRpb24ueCwgcG9zaXRpb24ueSwgcG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBjeWxpbmRlclNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogZW5lbXlNYXRlcmlhbCxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSwgLy8gUHJldmVudCBlbmVtaWVzIGZyb20gdGlwcGluZyBvdmVyIGVhc2lseVxyXG4gICAgICAgICAgICBjb2xsaXNpb25GaWx0ZXJHcm91cDogQ29sbGlzaW9uR3JvdXBzLkVORU1ZLFxyXG4gICAgICAgICAgICBjb2xsaXNpb25GaWx0ZXJNYXNrOiBDb2xsaXNpb25Hcm91cHMuUExBWUVSIHwgQ29sbGlzaW9uR3JvdXBzLkJVTExFVCB8IENvbGxpc2lvbkdyb3Vwcy5HUk9VTkQgfCBDb2xsaXNpb25Hcm91cHMuV0FMTCB8IENvbGxpc2lvbkdyb3Vwcy5FTkVNWSxcclxuICAgICAgICAgICAgbGluZWFyRGFtcGluZzogMC45IC8vIFNvbWUgZGFtcGluZ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuYm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDEsIDAsIDApLCAtTWF0aC5QSSAvIDIpOyAvLyBPcmllbnQgY3lsaW5kZXIgdmVydGljYWxseVxyXG4gICAgICAgIHdvcmxkLmFkZEJvZHkodGhpcy5ib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIHBsYXllclBvc2l0aW9uOiBDQU5OT04uVmVjMywgcGxheWVyOiBQbGF5ZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNBY3RpdmUgfHwgdGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmJvZHkuc2xlZXAoKTtcclxuICAgICAgICAgICAgdGhpcy5tZXNoLnZpc2libGUgPSBmYWxzZTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5ib2R5Lndha2VVcCgpO1xyXG4gICAgICAgIHRoaXMubWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMuYm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG5cclxuICAgICAgICAvLyBTaW1wbGUgQUk6IE1vdmUgdG93YXJkcyBwbGF5ZXJcclxuICAgICAgICBjb25zdCB0b1BsYXllciA9IG5ldyBDQU5OT04uVmVjMygpO1xyXG4gICAgICAgIHBsYXllclBvc2l0aW9uLnZzdWIodGhpcy5ib2R5LnBvc2l0aW9uLCB0b1BsYXllcik7XHJcbiAgICAgICAgdG9QbGF5ZXIueSA9IDA7IC8vIE9ubHkgaG9yaXpvbnRhbCBtb3ZlbWVudFxyXG4gICAgICAgIHRvUGxheWVyLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICBjb25zdCB0YXJnZXRWZWxvY2l0eSA9IHRvUGxheWVyLnNjYWxlKHRoaXMuY29uZmlnLnNwZWVkKTtcclxuICAgICAgICAvLyBBcHBseSB0YXJnZXQgdmVsb2NpdHkgZGlyZWN0bHkgdG8gaG9yaXpvbnRhbCBjb21wb25lbnRzXHJcbiAgICAgICAgdGhpcy5ib2R5LnZlbG9jaXR5LnggPSB0YXJnZXRWZWxvY2l0eS54O1xyXG4gICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS56ID0gdGFyZ2V0VmVsb2NpdHkuejtcclxuXHJcblxyXG4gICAgICAgIC8vIEF0dGFjayBwbGF5ZXIgaWYgY2xvc2UgZW5vdWdoXHJcbiAgICAgICAgY29uc3QgZGlzdGFuY2VUb1BsYXllciA9IHRoaXMuYm9keS5wb3NpdGlvbi5kaXN0YW5jZVRvKHBsYXllclBvc2l0aW9uKTtcclxuICAgICAgICBpZiAoZGlzdGFuY2VUb1BsYXllciA8IHRoaXMuY29uZmlnLnJhZGl1cyArIHBsYXllci5jb25maWcucmFkaXVzICsgMC4xKSB7IC8vIFNpbXBsZSBvdmVybGFwIGNoZWNrXHJcbiAgICAgICAgICAgIGlmIChEYXRlLm5vdygpIC8gMTAwMCAtIHRoaXMubGFzdEF0dGFja1RpbWUgPiB0aGlzLmNvbmZpZy5hdHRhY2tJbnRlcnZhbCkge1xyXG4gICAgICAgICAgICAgICAgcGxheWVyLnRha2VEYW1hZ2UodGhpcy5jb25maWcuZGFtYWdlLCBEYXRlLm5vdygpIC8gMTAwMCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RBdHRhY2tUaW1lID0gRGF0ZS5ub3coKSAvIDEwMDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGFrZURhbWFnZShhbW91bnQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoIC09IGFtb3VudDtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmlzQWN0aXZlID0gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGRlc3Ryb3koKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KHRoaXMuYm9keSk7XHJcbiAgICAgICAgdGhpcy5tZXNoLnBhcmVudD8ucmVtb3ZlKHRoaXMubWVzaCk7XHJcbiAgICAgICAgdGhpcy5tZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcclxuICAgICAgICAodGhpcy5tZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIC0tLSBVSSBSZW5kZXJpbmcgKG9uIENhbnZhc1RleHR1cmUpIC0tLVxyXG5jbGFzcyBVSSB7XHJcbiAgICBwcml2YXRlIGNhbWVyYTogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbiAgICBwcml2YXRlIGNvbmZpZzogR2FtZUNvbmZpZ1sndWknXTtcclxuICAgIHByaXZhdGUgaGVhbHRoTWVzaDogVEhSRUUuTWVzaDtcclxuICAgIHByaXZhdGUgc2NvcmVNZXNoOiBUSFJFRS5NZXNoO1xyXG4gICAgcHJpdmF0ZSB0aXRsZVNjcmVlbk1lc2g6IFRIUkVFLk1lc2ggfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgZ2FtZU92ZXJTY3JlZW5NZXNoOiBUSFJFRS5NZXNoIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIGNyb3NzaGFpck1lc2g6IFRIUkVFLlNwcml0ZTtcclxuICAgIHByaXZhdGUgYXNzZXRNYW5hZ2VyOiBBc3NldE1hbmFnZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSwgY29uZmlnOiBHYW1lQ29uZmlnWyd1aSddLCBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlcikge1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gY2FtZXJhO1xyXG4gICAgICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xyXG4gICAgICAgIHRoaXMuYXNzZXRNYW5hZ2VyID0gYXNzZXRNYW5hZ2VyO1xyXG5cclxuICAgICAgICAvLyBIZWFsdGggYW5kIFNjb3JlXHJcbiAgICAgICAgdGhpcy5oZWFsdGhNZXNoID0gdGhpcy5jcmVhdGVUZXh0UGxhbmUoXCJIZWFsdGg6IDEwMFwiLCAweDAwRkYwMCk7XHJcbiAgICAgICAgdGhpcy5zY29yZU1lc2ggPSB0aGlzLmNyZWF0ZVRleHRQbGFuZShcIlNjb3JlOiAwXCIsIDB4MDBGRkZGKTtcclxuICAgICAgICB0aGlzLmhlYWx0aE1lc2gucG9zaXRpb24uc2V0KC0wLjcsIDAuNywgLTEuNSk7IC8vIFBvc2l0aW9uIGluIGNhbWVyYSBzcGFjZVxyXG4gICAgICAgIHRoaXMuc2NvcmVNZXNoLnBvc2l0aW9uLnNldCgwLjcsIDAuNywgLTEuNSk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYWRkKHRoaXMuaGVhbHRoTWVzaCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYWRkKHRoaXMuc2NvcmVNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gQ3Jvc3NoYWlyXHJcbiAgICAgICAgY29uc3QgY3Jvc3NoYWlyVGV4dHVyZSA9IHRoaXMuYXNzZXRNYW5hZ2VyLmdldFRleHR1cmUoJ3BsYXllcl9jcm9zc2hhaXInKTtcclxuICAgICAgICBjb25zdCBjcm9zc2hhaXJNYXRlcmlhbCA9IGNyb3NzaGFpclRleHR1cmUgPyBuZXcgVEhSRUUuU3ByaXRlTWF0ZXJpYWwoeyBtYXA6IGNyb3NzaGFpclRleHR1cmUsIGNvbG9yOiAweGZmZmZmZiwgdHJhbnNwYXJlbnQ6IHRydWUgfSkgOiBuZXcgVEhSRUUuU3ByaXRlTWF0ZXJpYWwoeyBjb2xvcjogMHhmZmZmZmYsIHRyYW5zcGFyZW50OiB0cnVlLCBvcGFjaXR5OiAwLjUgfSk7XHJcbiAgICAgICAgdGhpcy5jcm9zc2hhaXJNZXNoID0gbmV3IFRIUkVFLlNwcml0ZShjcm9zc2hhaXJNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5jcm9zc2hhaXJNZXNoLnNjYWxlLnNldCh0aGlzLmNvbmZpZy5jcm9zc2hhaXJTaXplLCB0aGlzLmNvbmZpZy5jcm9zc2hhaXJTaXplLCAxKTtcclxuICAgICAgICB0aGlzLmNyb3NzaGFpck1lc2gucG9zaXRpb24uc2V0KDAsIDAsIC0xKTsgLy8gQ2VudGVyIG9mIHNjcmVlbiwgc2xpZ2h0bHkgaW4gZnJvbnQgb2YgY2FtZXJhXHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYWRkKHRoaXMuY3Jvc3NoYWlyTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIEVuc3VyZSB0aXRsZS9nYW1lIG92ZXIgc2NyZWVucyBhcmUgbm90IGluaXRpYWxseSBwcmVzZW50XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk1lc2ggPSBudWxsO1xyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5NZXNoID0gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZVRleHRDYW52YXModGV4dDogc3RyaW5nLCBjb2xvcjogc3RyaW5nID0gJyNGRkZGRkYnLCBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZyA9ICdyZ2JhKDAsMCwwLDApJyk6IEhUTUxDYW52YXNFbGVtZW50IHtcclxuICAgICAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgICAgICBjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJykhO1xyXG4gICAgICAgIGNvbnN0IGZvbnRTaXplID0gdGhpcy5jb25maWcuZm9udFNpemU7XHJcbiAgICAgICAgY29uc3QgZm9udEZhbWlseSA9IHRoaXMuY29uZmlnLmZvbnRGYW1pbHk7XHJcblxyXG4gICAgICAgIGNvbnRleHQuZm9udCA9IGAke2ZvbnRTaXplfXB4ICR7Zm9udEZhbWlseX1gO1xyXG4gICAgICAgIGNvbnN0IG1ldHJpY3MgPSBjb250ZXh0Lm1lYXN1cmVUZXh0KHRleHQpO1xyXG4gICAgICAgIGNvbnN0IHRleHRXaWR0aCA9IG1ldHJpY3Mud2lkdGg7XHJcbiAgICAgICAgY29uc3QgdGV4dEhlaWdodCA9IGZvbnRTaXplICogMS41OyAvLyBBcHByb3hpbWF0ZSBoZWlnaHQgd2l0aCBzb21lIHBhZGRpbmdcclxuXHJcbiAgICAgICAgY2FudmFzLndpZHRoID0gdGV4dFdpZHRoICsgNDA7IC8vIEFkZCBwYWRkaW5nXHJcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IHRleHRIZWlnaHQgKyA0MDtcclxuXHJcbiAgICAgICAgY29udGV4dC5mb250ID0gYCR7Zm9udFNpemV9cHggJHtmb250RmFtaWx5fWA7IC8vIFJlc2V0IGZvbnQgYWZ0ZXIgY2FudmFzIHJlc2l6ZVxyXG4gICAgICAgIGNvbnRleHQuZmlsbFN0eWxlID0gYmFja2dyb3VuZENvbG9yO1xyXG4gICAgICAgIGNvbnRleHQuZmlsbFJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcclxuICAgICAgICBjb250ZXh0LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgIGNvbnRleHQudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgY29udGV4dC5maWxsU3R5bGUgPSBjb2xvcjtcclxuICAgICAgICAvLyBTcGxpdCB0ZXh0IGJ5IG5ld2xpbmVzIGFuZCByZW5kZXIgZWFjaCBsaW5lXHJcbiAgICAgICAgY29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcclxuICAgICAgICBsaW5lcy5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB5T2Zmc2V0ID0gKGluZGV4IC0gKGxpbmVzLmxlbmd0aCAtIDEpIC8gMikgKiBmb250U2l6ZSAqIDEuMjtcclxuICAgICAgICAgICAgY29udGV4dC5maWxsVGV4dChsaW5lLCBjYW52YXMud2lkdGggLyAyLCBjYW52YXMuaGVpZ2h0IC8gMiArIHlPZmZzZXQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gY2FudmFzO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlVGV4dFBsYW5lKHRleHQ6IHN0cmluZywgY29sb3I6IG51bWJlcik6IFRIUkVFLk1lc2gge1xyXG4gICAgICAgIGNvbnN0IGNhbnZhcyA9IHRoaXMuY3JlYXRlVGV4dENhbnZhcyh0ZXh0LCBgIyR7Y29sb3IudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDYsICcwJyl9YCk7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZSA9IG5ldyBUSFJFRS5DYW52YXNUZXh0dXJlKGNhbnZhcyk7XHJcbiAgICAgICAgdGV4dHVyZS5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7IC8vIEVuc3VyZSBjcmlzcCB0ZXh0XHJcbiAgICAgICAgdGV4dHVyZS5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcblxyXG4gICAgICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiB0ZXh0dXJlLCB0cmFuc3BhcmVudDogdHJ1ZSB9KTtcclxuICAgICAgICBjb25zdCBhc3BlY3RSYXRpbyA9IGNhbnZhcy53aWR0aCAvIGNhbnZhcy5oZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgcGxhbmVHZW9tZXRyeSA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KDAuNSAqIGFzcGVjdFJhdGlvLCAwLjUpOyAvLyBBZGp1c3Qgc2l6ZSBpbiAzRCBzcGFjZSByZWxhdGl2ZSB0byBkaXN0YW5jZVxyXG4gICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGFuZUdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcbiAgICAgICAgcmV0dXJuIG1lc2g7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlSGVhbHRoKGhlYWx0aDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgaGVhbHRoQ29sb3IgPSBoZWFsdGggPiA1MCA/IDB4MDBGRjAwIDogKGhlYWx0aCA+IDIwID8gMHhGRkE1MDAgOiAweEZGMDAwMCk7XHJcbiAgICAgICAgY29uc3QgbmV3TWVzaCA9IHRoaXMuY3JlYXRlVGV4dFBsYW5lKGBIZWFsdGg6ICR7TWF0aC5tYXgoMCwgaGVhbHRoKX1gLCBoZWFsdGhDb2xvcik7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucmVtb3ZlKHRoaXMuaGVhbHRoTWVzaCk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGhNZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcclxuICAgICAgICBpZiAoKHRoaXMuaGVhbHRoTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkubWFwKSB7XHJcbiAgICAgICAgICAgICh0aGlzLmhlYWx0aE1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLm1hcD8uZGlzcG9zZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAodGhpcy5oZWFsdGhNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5kaXNwb3NlKCk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGhNZXNoID0gbmV3TWVzaDtcclxuICAgICAgICB0aGlzLmhlYWx0aE1lc2gucG9zaXRpb24uc2V0KC0wLjcsIDAuNywgLTEuNSk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYWRkKHRoaXMuaGVhbHRoTWVzaCk7XHJcbiAgICB9XHJcblxyXG4gICAgdXBkYXRlU2NvcmUoc2NvcmU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IG5ld01lc2ggPSB0aGlzLmNyZWF0ZVRleHRQbGFuZShgU2NvcmU6ICR7c2NvcmV9YCwgMHgwMEZGRkYpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnJlbW92ZSh0aGlzLnNjb3JlTWVzaCk7XHJcbiAgICAgICAgdGhpcy5zY29yZU1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xyXG4gICAgICAgIGlmICgodGhpcy5zY29yZU1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLm1hcCkge1xyXG4gICAgICAgICAgICAodGhpcy5zY29yZU1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLm1hcD8uZGlzcG9zZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAodGhpcy5zY29yZU1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLmRpc3Bvc2UoKTtcclxuICAgICAgICB0aGlzLnNjb3JlTWVzaCA9IG5ld01lc2g7XHJcbiAgICAgICAgdGhpcy5zY29yZU1lc2gucG9zaXRpb24uc2V0KDAuNywgMC43LCAtMS41KTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hZGQodGhpcy5zY29yZU1lc2gpO1xyXG4gICAgfVxyXG5cclxuICAgIHNob3dUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk1lc2gpIHJldHVybjtcclxuICAgICAgICB0aGlzLmhpZGVIVUQoKTtcclxuICAgICAgICB0aGlzLmhpZGVHYW1lT3ZlclNjcmVlbigpO1xyXG5cclxuICAgICAgICBjb25zdCBjYW52YXMgPSB0aGlzLmNyZWF0ZVRleHRDYW52YXMoYCR7dGhpcy5jb25maWcudGl0bGVTY3JlZW5UZXh0fVxcblxcbiR7dGhpcy5jb25maWcucHJlc3NUb1N0YXJ0VGV4dH1gLCB0aGlzLmNvbmZpZy5mb250Q29sb3IsICdyZ2JhKDAsMCwwLDAuNyknKTtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlID0gbmV3IFRIUkVFLkNhbnZhc1RleHR1cmUoY2FudmFzKTtcclxuICAgICAgICB0ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuICAgICAgICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSwgdHJhbnNwYXJlbnQ6IHRydWUgfSk7XHJcbiAgICAgICAgY29uc3QgYXNwZWN0UmF0aW8gPSBjYW52YXMud2lkdGggLyBjYW52YXMuaGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IHBsYW5lR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSgzICogYXNwZWN0UmF0aW8sIDMpO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5NZXNoID0gbmV3IFRIUkVFLk1lc2gocGxhbmVHZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5NZXNoLnBvc2l0aW9uLnNldCgwLCAwLCAtMyk7IC8vIFBsYWNlIGluIGZyb250IG9mIHRoZSBjYW1lcmFcclxuICAgICAgICB0aGlzLmNhbWVyYS5hZGQodGhpcy50aXRsZVNjcmVlbk1lc2gpO1xyXG4gICAgfVxyXG5cclxuICAgIGhpZGVUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk1lc2gpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEucmVtb3ZlKHRoaXMudGl0bGVTY3JlZW5NZXNoKTtcclxuICAgICAgICAgICAgdGhpcy50aXRsZVNjcmVlbk1lc2guZ2VvbWV0cnkuZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICBpZiAoKHRoaXMudGl0bGVTY3JlZW5NZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5tYXApIHtcclxuICAgICAgICAgICAgICAgICh0aGlzLnRpdGxlU2NyZWVuTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkubWFwPy5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKHRoaXMudGl0bGVTY3JlZW5NZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgIHRoaXMudGl0bGVTY3JlZW5NZXNoID0gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5zaG93SFVEKCk7XHJcbiAgICB9XHJcblxyXG4gICAgc2hvd0dhbWVPdmVyU2NyZWVuKHNjb3JlOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lT3ZlclNjcmVlbk1lc2gpIHJldHVybjtcclxuICAgICAgICB0aGlzLmhpZGVIVUQoKTtcclxuICAgICAgICB0aGlzLmhpZGVUaXRsZVNjcmVlbigpO1xyXG5cclxuICAgICAgICBjb25zdCBjYW52YXMgPSB0aGlzLmNyZWF0ZVRleHRDYW52YXMoYCR7dGhpcy5jb25maWcuZ2FtZU92ZXJUZXh0fVxcblNjb3JlOiAke3Njb3JlfVxcblxcbiR7dGhpcy5jb25maWcucHJlc3NUb1N0YXJ0VGV4dH1gLCB0aGlzLmNvbmZpZy5mb250Q29sb3IsICdyZ2JhKDAsMCwwLDAuNyknKTtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlID0gbmV3IFRIUkVFLkNhbnZhc1RleHR1cmUoY2FudmFzKTtcclxuICAgICAgICB0ZXh0dXJlLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuICAgICAgICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogdGV4dHVyZSwgdHJhbnNwYXJlbnQ6IHRydWUgfSk7XHJcbiAgICAgICAgY29uc3QgYXNwZWN0UmF0aW8gPSBjYW52YXMud2lkdGggLyBjYW52YXMuaGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IHBsYW5lR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSgzICogYXNwZWN0UmF0aW8sIDMpO1xyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5NZXNoID0gbmV3IFRIUkVFLk1lc2gocGxhbmVHZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5NZXNoLnBvc2l0aW9uLnNldCgwLCAwLCAtMyk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYWRkKHRoaXMuZ2FtZU92ZXJTY3JlZW5NZXNoKTtcclxuICAgIH1cclxuXHJcbiAgICBoaWRlR2FtZU92ZXJTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZU92ZXJTY3JlZW5NZXNoKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnJlbW92ZSh0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5NZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgaWYgKCh0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkubWFwKSB7XHJcbiAgICAgICAgICAgICAgICAodGhpcy5nYW1lT3ZlclNjcmVlbk1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLm1hcD8uZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICh0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuTWVzaCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNob3dIVUQoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5oZWFsdGhNZXNoLnZpc2libGUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuc2NvcmVNZXNoLnZpc2libGUgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuY3Jvc3NoYWlyTWVzaC52aXNpYmxlID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBoaWRlSFVEKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoTWVzaC52aXNpYmxlID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5zY29yZU1lc2gudmlzaWJsZSA9IGZhbHNlO1xyXG4gICAgICAgIHRoaXMuY3Jvc3NoYWlyTWVzaC52aXNpYmxlID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgZGlzcG9zZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmhpZGVUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgIHRoaXMuaGlkZUdhbWVPdmVyU2NyZWVuKCk7XHJcblxyXG4gICAgICAgIC8vIERpc3Bvc2UgcGVybWFuZW50IEhVRCBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnJlbW92ZSh0aGlzLmhlYWx0aE1lc2gpO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoTWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgaWYgKCh0aGlzLmhlYWx0aE1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwpLm1hcCkge1xyXG4gICAgICAgICAgICAodGhpcy5oZWFsdGhNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5tYXA/LmRpc3Bvc2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgKHRoaXMuaGVhbHRoTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG5cclxuICAgICAgICB0aGlzLmNhbWVyYS5yZW1vdmUodGhpcy5zY29yZU1lc2gpO1xyXG4gICAgICAgIHRoaXMuc2NvcmVNZXNoLmdlb21ldHJ5LmRpc3Bvc2UoKTtcclxuICAgICAgICBpZiAoKHRoaXMuc2NvcmVNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5tYXApIHtcclxuICAgICAgICAgICAgKHRoaXMuc2NvcmVNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5tYXA/LmRpc3Bvc2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgKHRoaXMuc2NvcmVNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKS5kaXNwb3NlKCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5jYW1lcmEucmVtb3ZlKHRoaXMuY3Jvc3NoYWlyTWVzaCk7XHJcbiAgICAgICAgaWYgKCh0aGlzLmNyb3NzaGFpck1lc2gubWF0ZXJpYWwgYXMgVEhSRUUuU3ByaXRlTWF0ZXJpYWwpLm1hcCkge1xyXG4gICAgICAgICAgICAodGhpcy5jcm9zc2hhaXJNZXNoLm1hdGVyaWFsIGFzIFRIUkVFLlNwcml0ZU1hdGVyaWFsKS5tYXA/LmRpc3Bvc2UoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgKHRoaXMuY3Jvc3NoYWlyTWVzaC5tYXRlcmlhbCBhcyBUSFJFRS5TcHJpdGVNYXRlcmlhbCkuZGlzcG9zZSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyAtLS0gR2FtZSBTdGF0ZSBhbmQgTWFpbiBMb2dpYyAtLS1cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgTE9BRElORyxcclxuICAgIFRJVExFLFxyXG4gICAgUExBWUlORyxcclxuICAgIEdBTUVfT1ZFUixcclxufVxyXG5cclxuZW51bSBDb2xsaXNpb25Hcm91cHMge1xyXG4gICAgUExBWUVSID0gMSxcclxuICAgIEdST1VORCA9IDIsXHJcbiAgICBFTkVNWSA9IDQsXHJcbiAgICBCVUxMRVQgPSA4LFxyXG4gICAgV0FMTCA9IDE2XHJcbn1cclxuXHJcbmxldCBjb25maWc6IEdhbWVDb25maWc7XHJcbmxldCBhc3NldE1hbmFnZXI6IEFzc2V0TWFuYWdlcjtcclxubGV0IGlucHV0SGFuZGxlcjogSW5wdXRIYW5kbGVyO1xyXG5cclxubGV0IHNjZW5lOiBUSFJFRS5TY2VuZTtcclxubGV0IGNhbWVyYTogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbmxldCByZW5kZXJlcjogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxubGV0IGNvbnRyb2xzOiBQb2ludGVyTG9ja0NvbnRyb2xzO1xyXG5sZXQgdWk6IFVJO1xyXG5cclxubGV0IHdvcmxkOiBDQU5OT04uV29ybGQ7XHJcbmxldCBwbGF5ZXI6IFBsYXllcjtcclxubGV0IGVuZW1pZXM6IEVuZW15W10gPSBbXTtcclxubGV0IGJ1bGxldHM6IEJ1bGxldFtdID0gW107XHJcblxyXG5sZXQgZ2FtZVN0YXRlOiBHYW1lU3RhdGUgPSBHYW1lU3RhdGUuTE9BRElORztcclxubGV0IHNjb3JlOiBudW1iZXIgPSAwO1xyXG5sZXQgbGFzdEZyYW1lVGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcbmxldCBjYW52YXM6IEhUTUxDYW52YXNFbGVtZW50O1xyXG5cclxuLy8gUGh5c2ljcyBNYXRlcmlhbHNcclxubGV0IGdyb3VuZE1hdGVyaWFsOiBDQU5OT04uTWF0ZXJpYWw7XHJcbmxldCBwbGF5ZXJNYXRlcmlhbDogQ0FOTk9OLk1hdGVyaWFsO1xyXG5sZXQgZW5lbXlNYXRlcmlhbDogQ0FOTk9OLk1hdGVyaWFsO1xyXG5sZXQgYnVsbGV0TWF0ZXJpYWw6IENBTk5PTi5NYXRlcmlhbDtcclxuXHJcbi8vIEF1ZGlvXHJcbmxldCBhdWRpb0xpc3RlbmVyOiBUSFJFRS5BdWRpb0xpc3RlbmVyO1xyXG5sZXQgYmdtOiBUSFJFRS5BdWRpbztcclxubGV0IHNvdW5kRWZmZWN0TWFwOiBNYXA8c3RyaW5nLCBUSFJFRS5BdWRpbz47XHJcblxyXG5hc3luYyBmdW5jdGlvbiBpbml0R2FtZSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdJbml0aWFsaXppbmcgZ2FtZS4uLicpO1xyXG4gICAgY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIGlmICghY2FudmFzKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQuJyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIExvYWQgY29uZmlnXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgIGNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyBHYW1lQ29uZmlnO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdDb25maWcgbG9hZGVkOicsIGNvbmZpZyk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGRhdGEuanNvbjonLCBlcnJvcik7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGFzc2V0TWFuYWdlciA9IG5ldyBBc3NldE1hbmFnZXIoY29uZmlnKTtcclxuICAgIGF3YWl0IGFzc2V0TWFuYWdlci5sb2FkQXNzZXRzKCk7XHJcblxyXG4gICAgc2V0dXBTY2VuZSgpO1xyXG4gICAgc2V0dXBQaHlzaWNzKCk7XHJcbiAgICBzZXR1cFBsYXllcigpO1xyXG4gICAgc2V0dXBFbmVtaWVzKCk7XHJcbiAgICBzZXR1cElucHV0KCk7XHJcbiAgICBzZXR1cEF1ZGlvKCk7XHJcbiAgICBzZXR1cFVJKCk7XHJcblxyXG4gICAgLy8gUmVzaXplIGxpc3RlbmVyXHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgb25XaW5kb3dSZXNpemUsIGZhbHNlKTtcclxuICAgIG9uV2luZG93UmVzaXplKCk7IC8vIEluaXRpYWwgcmVzaXplXHJcblxyXG4gICAgZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgdWkuc2hvd1RpdGxlU2NyZWVuKCk7XHJcbiAgICBhbmltYXRlKDApOyAvLyBTdGFydCB0aGUgYW5pbWF0aW9uIGxvb3BcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBTY2VuZSgpOiB2b2lkIHtcclxuICAgIHNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgICBzY2VuZS5iYWNrZ3JvdW5kID0gbmV3IFRIUkVFLkNvbG9yKDB4ODdjZWViKTsgLy8gU2t5IGJsdWUgYmFja2dyb3VuZFxyXG5cclxuICAgIGNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSg3NSwgd2luZG93LmlubmVyV2lkdGggLyB3aW5kb3cuaW5uZXJIZWlnaHQsIDAuMSwgMTAwMCk7XHJcbiAgICByZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHsgY2FudmFzOiBjYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgIHJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICByZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBQaHlzaWNzKCk6IHZvaWQge1xyXG4gICAgd29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICB3b3JsZC5ncmF2aXR5LnNldCgwLCAtY29uZmlnLmdhbWUuZ3Jhdml0eSwgMCk7XHJcbiAgICB3b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5TQVBCcm9hZHBoYXNlKHdvcmxkKTtcclxuICAgIHdvcmxkLmFsbG93U2xlZXAgPSB0cnVlO1xyXG4gICAgXHJcbiAgICAvLyBGaXggZm9yIFRTMjMzOTogUHJvcGVydHkgJ21heEl0ZXJhdGlvbnMnIGRvZXMgbm90IGV4aXN0IG9uIHR5cGUgJ1NvbHZlcicuXHJcbiAgICAvLyBUaGUgJ2l0ZXJhdGlvbnMnIHByb3BlcnR5IGV4aXN0cyBvbiBHU1NvbHZlciwgd2hpY2ggaXMgYSBjb21tb24gc29sdmVyIHVzZWQgaW4gY2Fubm9uLWVzLlxyXG4gICAgY29uc3Qgc29sdmVyID0gbmV3IENBTk5PTi5HU1NvbHZlcigpO1xyXG4gICAgc29sdmVyLml0ZXJhdGlvbnMgPSAxMDsgLy8gVXNlICdpdGVyYXRpb25zJyBpbnN0ZWFkIG9mICdtYXhJdGVyYXRpb25zJ1xyXG4gICAgd29ybGQuc29sdmVyID0gc29sdmVyO1xyXG5cclxuICAgIC8vIE1hdGVyaWFsc1xyXG4gICAgZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdncm91bmRNYXRlcmlhbCcpO1xyXG4gICAgcGxheWVyTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdwbGF5ZXJNYXRlcmlhbCcpO1xyXG4gICAgZW5lbXlNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2VuZW15TWF0ZXJpYWwnKTtcclxuICAgIGJ1bGxldE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnYnVsbGV0TWF0ZXJpYWwnKTtcclxuXHJcbiAgICBjb25zdCBncm91bmRQbGF5ZXJDTSA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgIGdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgIHBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgIHsgZnJpY3Rpb246IGNvbmZpZy5wbGF5ZXIuZnJpY3Rpb24sIHJlc3RpdHV0aW9uOiAwLjEgfVxyXG4gICAgKTtcclxuICAgIHdvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChncm91bmRQbGF5ZXJDTSk7XHJcblxyXG4gICAgY29uc3QgZW5lbXlQbGF5ZXJDTSA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgIGVuZW15TWF0ZXJpYWwsXHJcbiAgICAgICAgcGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgeyBmcmljdGlvbjogMC4xLCByZXN0aXR1dGlvbjogMC4xIH1cclxuICAgICk7XHJcbiAgICB3b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoZW5lbXlQbGF5ZXJDTSk7XHJcblxyXG4gICAgY29uc3QgYnVsbGV0RW5lbXlDTSA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgIGJ1bGxldE1hdGVyaWFsLFxyXG4gICAgICAgIGVuZW15TWF0ZXJpYWwsXHJcbiAgICAgICAgeyBmcmljdGlvbjogMC4xLCByZXN0aXR1dGlvbjogMC45IH1cclxuICAgICk7XHJcbiAgICB3b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoYnVsbGV0RW5lbXlDTSk7XHJcblxyXG4gICAgY29uc3Qgd2FsbFBsYXllckNNID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgZ3JvdW5kTWF0ZXJpYWwsIC8vIFdhbGxzIHVzZSBncm91bmQgbWF0ZXJpYWxcclxuICAgICAgICBwbGF5ZXJNYXRlcmlhbCxcclxuICAgICAgICB7IGZyaWN0aW9uOiAwLjEsIHJlc3RpdHV0aW9uOiAwLjEgfVxyXG4gICAgKTtcclxuICAgIHdvcmxkLmFkZENvbnRhY3RNYXRlcmlhbCh3YWxsUGxheWVyQ00pO1xyXG5cclxuICAgIC8vIEdyb3VuZFxyXG4gICAgY29uc3QgZ3JvdW5kU2hhcGUgPSBuZXcgQ0FOTk9OLlBsYW5lKCk7XHJcbiAgICBjb25zdCBncm91bmRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMCwgbWF0ZXJpYWw6IGdyb3VuZE1hdGVyaWFsLCBjb2xsaXNpb25GaWx0ZXJHcm91cDogQ29sbGlzaW9uR3JvdXBzLkdST1VORCB9KTtcclxuICAgIGdyb3VuZEJvZHkuYWRkU2hhcGUoZ3JvdW5kU2hhcGUpO1xyXG4gICAgZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21FdWxlcigtTWF0aC5QSSAvIDIsIDAsIDApOyAvLyBSb3RhdGUgZ3JvdW5kIHRvIGJlIGhvcml6b250YWxcclxuICAgIHdvcmxkLmFkZEJvZHkoZ3JvdW5kQm9keSk7XHJcblxyXG4gICAgY29uc3QgZ3JvdW5kVGV4dHVyZSA9IGFzc2V0TWFuYWdlci5nZXRUZXh0dXJlKCdmbG9vcl90ZXh0dXJlJyk7XHJcbiAgICBpZiAoZ3JvdW5kVGV4dHVyZSkge1xyXG4gICAgICAgIGdyb3VuZFRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICBncm91bmRUZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgZ3JvdW5kVGV4dHVyZS5yZXBlYXQuc2V0KGNvbmZpZy5nYW1lLmZsb29yU2l6ZSAvIDIsIGNvbmZpZy5nYW1lLmZsb29yU2l6ZSAvIDIpOyAvLyBSZXBlYXQgdGV4dHVyZVxyXG4gICAgfVxyXG4gICAgY29uc3QgZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxyXG4gICAgICAgIG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KGNvbmZpZy5nYW1lLmZsb29yU2l6ZSwgY29uZmlnLmdhbWUuZmxvb3JTaXplLCAxMCwgMTApLFxyXG4gICAgICAgIG5ldyBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCh7IG1hcDogZ3JvdW5kVGV4dHVyZSwgc2lkZTogVEhSRUUuRG91YmxlU2lkZSB9KVxyXG4gICAgKTtcclxuICAgIGdyb3VuZE1lc2gucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjtcclxuICAgIGdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcbiAgICBzY2VuZS5hZGQoZ3JvdW5kTWVzaCk7XHJcblxyXG4gICAgLy8gV2FsbHNcclxuICAgIGNvbnN0IHdhbGxUZXh0dXJlID0gYXNzZXRNYW5hZ2VyLmdldFRleHR1cmUoJ3dhbGxfdGV4dHVyZScpO1xyXG4gICAgaWYgKHdhbGxUZXh0dXJlKSB7XHJcbiAgICAgICAgd2FsbFRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICB3YWxsVGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgIHdhbGxUZXh0dXJlLnJlcGVhdC5zZXQoY29uZmlnLmdhbWUuZmxvb3JTaXplIC8gNSwgY29uZmlnLmdhbWUud2FsbEhlaWdodCAvIDUpO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgd2FsbE1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKHsgbWFwOiB3YWxsVGV4dHVyZSwgc2lkZTogVEhSRUUuRG91YmxlU2lkZSB9KTtcclxuICAgIGNvbnN0IHdhbGxHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShjb25maWcuZ2FtZS5mbG9vclNpemUsIGNvbmZpZy5nYW1lLndhbGxIZWlnaHQsIDAuNSk7IC8vIFRoaW4gd2FsbFxyXG5cclxuICAgIGZ1bmN0aW9uIGNyZWF0ZVdhbGwoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgcm90WTogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3Qgd2FsbE1lc2ggPSBuZXcgVEhSRUUuTWVzaCh3YWxsR2VvbWV0cnksIHdhbGxNYXRlcmlhbCk7XHJcbiAgICAgICAgd2FsbE1lc2gucG9zaXRpb24uc2V0KHgsIHksIHopO1xyXG4gICAgICAgIHdhbGxNZXNoLnJvdGF0aW9uLnkgPSByb3RZO1xyXG4gICAgICAgIHNjZW5lLmFkZCh3YWxsTWVzaCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHdhbGxCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMCwgbWF0ZXJpYWw6IGdyb3VuZE1hdGVyaWFsLCBjb2xsaXNpb25GaWx0ZXJHcm91cDogQ29sbGlzaW9uR3JvdXBzLldBTEwgfSk7XHJcbiAgICAgICAgY29uc3QgYm94U2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoY29uZmlnLmdhbWUuZmxvb3JTaXplIC8gMiwgY29uZmlnLmdhbWUud2FsbEhlaWdodCAvIDIsIDAuMjUpKTtcclxuICAgICAgICB3YWxsQm9keS5hZGRTaGFwZShib3hTaGFwZSk7XHJcbiAgICAgICAgd2FsbEJvZHkucG9zaXRpb24uc2V0KHgsIHksIHopO1xyXG4gICAgICAgIHdhbGxCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUV1bGVyKDAsIHJvdFksIDApO1xyXG4gICAgICAgIHdvcmxkLmFkZEJvZHkod2FsbEJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGhhbGZGbG9vciA9IGNvbmZpZy5nYW1lLmZsb29yU2l6ZSAvIDI7XHJcbiAgICBjb25zdCBoYWxmV2FsbEhlaWdodCA9IGNvbmZpZy5nYW1lLndhbGxIZWlnaHQgLyAyO1xyXG4gICAgY3JlYXRlV2FsbCgwLCBoYWxmV2FsbEhlaWdodCwgLWhhbGZGbG9vciwgMCk7IC8vIEJhY2sgd2FsbFxyXG4gICAgY3JlYXRlV2FsbCgwLCBoYWxmV2FsbEhlaWdodCwgaGFsZkZsb29yLCBNYXRoLlBJKTsgLy8gRnJvbnQgd2FsbFxyXG4gICAgY3JlYXRlV2FsbCgtaGFsZkZsb29yLCBoYWxmV2FsbEhlaWdodCwgMCwgTWF0aC5QSSAvIDIpOyAvLyBMZWZ0IHdhbGxcclxuICAgIGNyZWF0ZVdhbGwoaGFsZkZsb29yLCBoYWxmV2FsbEhlaWdodCwgMCwgLU1hdGguUEkgLyAyKTsgLy8gUmlnaHQgd2FsbFxyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFBsYXllcigpOiB2b2lkIHtcclxuICAgIHBsYXllciA9IG5ldyBQbGF5ZXIoc2NlbmUsIHdvcmxkLCBjYW1lcmEsIGNvbmZpZy5wbGF5ZXIsIHBsYXllck1hdGVyaWFsKTtcclxuICAgIGNvbnRyb2xzID0gbmV3IFBvaW50ZXJMb2NrQ29udHJvbHMoY2FtZXJhLCBjYW52YXMpOyAvLyBDb250cm9scyBhdHRhY2ggdG8gY2FtZXJhXHJcbiAgICBzY2VuZS5hZGQoY29udHJvbHMub2JqZWN0KTsgLy8gY29udHJvbHMub2JqZWN0IGlzIGFuIE9iamVjdDNEIGNvbnRhaW5pbmcgdGhlIGNhbWVyYS5cclxufVxyXG5cclxuZnVuY3Rpb24gc2V0dXBFbmVtaWVzKCk6IHZvaWQge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb25maWcuZW5lbXkuY291bnQ7IGkrKykge1xyXG4gICAgICAgIGNvbnN0IGFuZ2xlID0gKGkgLyBjb25maWcuZW5lbXkuY291bnQpICogTWF0aC5QSSAqIDIgKyBNYXRoLnJhbmRvbSgpICogMC41OyAvLyBTbGlnaHRseSByYW5kb21pemUgYW5nbGVcclxuICAgICAgICBjb25zdCByYWRpdXNPZmZzZXQgPSBNYXRoLnJhbmRvbSgpICogKGNvbmZpZy5lbmVteS5zcGF3blJhZGl1cyAvIDIpOyAvLyBSYW5kb21pemUgcmFkaXVzXHJcbiAgICAgICAgY29uc3QgeCA9IE1hdGguY29zKGFuZ2xlKSAqIChjb25maWcuZW5lbXkuc3Bhd25SYWRpdXMgLSByYWRpdXNPZmZzZXQpO1xyXG4gICAgICAgIGNvbnN0IHogPSBNYXRoLnNpbihhbmdsZSkgKiAoY29uZmlnLmVuZW15LnNwYXduUmFkaXVzIC0gcmFkaXVzT2Zmc2V0KTtcclxuICAgICAgICBjb25zdCBlbmVteVBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoeCwgY29uZmlnLmVuZW15LmhlaWdodCAvIDIsIHopO1xyXG4gICAgICAgIGNvbnN0IGVuZW15ID0gbmV3IEVuZW15KHNjZW5lLCB3b3JsZCwgY29uZmlnLmVuZW15LCBhc3NldE1hbmFnZXIsIGVuZW15UG9zaXRpb24sIGVuZW15TWF0ZXJpYWwpO1xyXG4gICAgICAgIGVuZW1pZXMucHVzaChlbmVteSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNldHVwSW5wdXQoKTogdm9pZCB7XHJcbiAgICBpbnB1dEhhbmRsZXIgPSBuZXcgSW5wdXRIYW5kbGVyKCk7XHJcbiAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgaWYgKGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IGdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUikge1xyXG4gICAgICAgICAgICBjYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgICAgIHN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cEF1ZGlvKCk6IHZvaWQge1xyXG4gICAgYXVkaW9MaXN0ZW5lciA9IG5ldyBUSFJFRS5BdWRpb0xpc3RlbmVyKCk7XHJcbiAgICBjYW1lcmEuYWRkKGF1ZGlvTGlzdGVuZXIpOyAvLyBBZGQgbGlzdGVuZXIgdG8gdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEJhY2tncm91bmQgTXVzaWNcclxuICAgIGNvbnN0IGJnbUJ1ZmZlciA9IGFzc2V0TWFuYWdlci5nZXRBdWRpb0J1ZmZlcignYmdtJyk7XHJcbiAgICBpZiAoYmdtQnVmZmVyKSB7XHJcbiAgICAgICAgYmdtID0gbmV3IFRIUkVFLkF1ZGlvKGF1ZGlvTGlzdGVuZXIpO1xyXG4gICAgICAgIGJnbS5zZXRCdWZmZXIoYmdtQnVmZmVyKTtcclxuICAgICAgICBiZ20uc2V0TG9vcCh0cnVlKTtcclxuICAgICAgICBiZ20uc2V0Vm9sdW1lKGNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKT8udm9sdW1lIHx8IDAuMyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU291bmQgRWZmZWN0c1xyXG4gICAgc291bmRFZmZlY3RNYXAgPSBuZXcgTWFwKCk7XHJcbiAgICBjb25maWcuYXNzZXRzLnNvdW5kcy5maWx0ZXIocyA9PiBzLm5hbWUgIT09ICdiZ20nKS5mb3JFYWNoKHNvdW5kQ29uZmlnID0+IHtcclxuICAgICAgICBjb25zdCBidWZmZXIgPSBhc3NldE1hbmFnZXIuZ2V0QXVkaW9CdWZmZXIoc291bmRDb25maWcubmFtZSk7XHJcbiAgICAgICAgaWYgKGJ1ZmZlcikge1xyXG4gICAgICAgICAgICBjb25zdCBzb3VuZCA9IG5ldyBUSFJFRS5BdWRpbyhhdWRpb0xpc3RlbmVyKTtcclxuICAgICAgICAgICAgc291bmQuc2V0QnVmZmVyKGJ1ZmZlcik7XHJcbiAgICAgICAgICAgIHNvdW5kLnNldFZvbHVtZShzb3VuZENvbmZpZy52b2x1bWUpO1xyXG4gICAgICAgICAgICBzb3VuZEVmZmVjdE1hcC5zZXQoc291bmRDb25maWcubmFtZSwgc291bmQpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZXR1cFVJKCk6IHZvaWQge1xyXG4gICAgdWkgPSBuZXcgVUkoY2FtZXJhLCBjb25maWcudWksIGFzc2V0TWFuYWdlcik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG9uV2luZG93UmVzaXplKCk6IHZvaWQge1xyXG4gICAgY2FtZXJhLmFzcGVjdCA9IHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgIHJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSByZXR1cm47XHJcblxyXG4gICAgY29uc29sZS5sb2coJ1N0YXJ0aW5nIGdhbWUuLi4nKTtcclxuICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgc2NvcmUgPSAwO1xyXG5cclxuICAgIC8vIFJlc2V0IHBsYXllclxyXG4gICAgcGxheWVyLnJlc2V0KCk7XHJcbiAgICBjb250cm9scy5vYmplY3QucG9zaXRpb24uY29weShwbGF5ZXIuYm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgY29udHJvbHMub2JqZWN0LnBvc2l0aW9uLnkgKz0gY29uZmlnLnBsYXllci5jYW1lcmFPZmZzZXQueTtcclxuICAgIGNvbnRyb2xzLm9iamVjdC5yb3RhdGlvbi55ID0gMDsgLy8gUmVzZXQgaG9yaXpvbnRhbCByb3RhdGlvblxyXG4gICAgY29udHJvbHMub2JqZWN0LmNoaWxkcmVuWzBdLnJvdGF0aW9uLnggPSAwOyAvLyBSZXNldCB2ZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpXHJcblxyXG4gICAgLy8gQ2xlYXIgYW5kIHJlc3Bhd24gZW5lbWllc1xyXG4gICAgZW5lbWllcy5mb3JFYWNoKGUgPT4gZS5kZXN0cm95KCkpO1xyXG4gICAgZW5lbWllcyA9IFtdO1xyXG4gICAgc2V0dXBFbmVtaWVzKCk7XHJcblxyXG4gICAgLy8gQ2xlYXIgYnVsbGV0c1xyXG4gICAgYnVsbGV0cy5mb3JFYWNoKGIgPT4gYi5kZXN0cm95KCkpO1xyXG4gICAgYnVsbGV0cyA9IFtdO1xyXG5cclxuICAgIHVpLmhpZGVUaXRsZVNjcmVlbigpO1xyXG4gICAgdWkuaGlkZUdhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICB1aS51cGRhdGVIZWFsdGgocGxheWVyLmhlYWx0aCk7XHJcbiAgICB1aS51cGRhdGVTY29yZShzY29yZSk7XHJcbiAgICBpZiAoYmdtICYmICFiZ20uaXNQbGF5aW5nKSB7XHJcbiAgICAgICAgYmdtLnBsYXkoKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2FtZU92ZXIoKTogdm9pZCB7XHJcbiAgICBpZiAoZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSKSByZXR1cm47XHJcblxyXG4gICAgY29uc29sZS5sb2coJ0dhbWUgT3ZlciEnKTtcclxuICAgIGdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICB1aS5zaG93R2FtZU92ZXJTY3JlZW4oc2NvcmUpO1xyXG4gICAgaWYgKGJnbSAmJiBiZ20uaXNQbGF5aW5nKSB7XHJcbiAgICAgICAgYmdtLnN0b3AoKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGdhbWVPdmVyU291bmQgPSBzb3VuZEVmZmVjdE1hcC5nZXQoJ2dhbWVfb3ZlcicpO1xyXG4gICAgaWYgKGdhbWVPdmVyU291bmQpIHtcclxuICAgICAgICBnYW1lT3ZlclNvdW5kLnN0b3AoKTsgLy8gRW5zdXJlIGl0IGNhbiBwbGF5XHJcbiAgICAgICAgZ2FtZU92ZXJTb3VuZC5wbGF5KCk7XHJcbiAgICB9XHJcbiAgICBkb2N1bWVudC5leGl0UG9pbnRlckxvY2soKTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGFuaW1hdGUoY3VycmVudFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXApOiB2b2lkIHtcclxuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltYXRlKTtcclxuXHJcbiAgICBjb25zdCBkZWx0YVRpbWUgPSAoY3VycmVudFRpbWUgLSBsYXN0RnJhbWVUaW1lKSAvIDEwMDA7IC8vIENvbnZlcnQgdG8gc2Vjb25kc1xyXG4gICAgbGFzdEZyYW1lVGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgIGlmIChnYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgLy8gUGh5c2ljcyB1cGRhdGUgKGZpeGVkIHRpbWUgc3RlcClcclxuICAgICAgICB3b3JsZC5zdGVwKDEgLyBjb25maWcuZ2FtZS50YXJnZXRGUFMsIGRlbHRhVGltZSwgMyk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciB1cGRhdGVcclxuICAgICAgICBwbGF5ZXIudXBkYXRlKGRlbHRhVGltZSwgaW5wdXRIYW5kbGVyLCBjb250cm9scyk7XHJcblxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIGNhbWVyYS9jb250cm9scyBwb3NpdGlvbiB3aXRoIHBsYXllciBwaHlzaWNzIGJvZHlcclxuICAgICAgICBjb250cm9scy5vYmplY3QucG9zaXRpb24uY29weShwbGF5ZXIuYm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIGNvbnRyb2xzLm9iamVjdC5wb3NpdGlvbi55ICs9IGNvbmZpZy5wbGF5ZXIuY2FtZXJhT2Zmc2V0Lnk7IC8vIEFkanVzdCBmb3IgY2FtZXJhIGhlaWdodFxyXG5cclxuICAgICAgICAvLyBFbmVtaWVzIHVwZGF0ZVxyXG4gICAgICAgIGVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgIGVuZW15LnVwZGF0ZShkZWx0YVRpbWUsIHBsYXllci5ib2R5LnBvc2l0aW9uLCBwbGF5ZXIpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBCdWxsZXRzIHVwZGF0ZSBhbmQgcmVtb3ZhbFxyXG4gICAgICAgIGZvciAobGV0IGkgPSBidWxsZXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IGJ1bGxldHNbaV07XHJcbiAgICAgICAgICAgIGlmIChidWxsZXQudXBkYXRlKGRlbHRhVGltZSkpIHtcclxuICAgICAgICAgICAgICAgIC8vIElmIGJ1bGxldCBsaWZldGltZSBleHBpcmVkIG9yIGl0IGhpdCBzb21ldGhpbmcsIHJlbW92ZSBpdFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0LmRlc3Ryb3koKTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldHMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgc2hvb3RpbmdcclxuICAgICAgICBpZiAoaW5wdXRIYW5kbGVyLmNvbnN1bWVTaG9vdFJlcXVlc3QoKSkge1xyXG4gICAgICAgICAgICBzaG9vdEJ1bGxldCgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUHJvY2VzcyBoaXRzIChlbmVteSBoZWFsdGgsIHNjb3JlLCBzb3VuZCkgYWZ0ZXIgYnVsbGV0IHBoeXNpY3MgdXBkYXRlXHJcbiAgICAgICAgLy8gVGhpcyBsb29wIHByb2Nlc3NlcyBidWxsZXRzIHRoYXQgaGF2ZSByZWdpc3RlcmVkIGEgY29sbGlzaW9uXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IGJ1bGxldHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0ID0gYnVsbGV0c1tpXTtcclxuICAgICAgICAgICAgaWYgKGJ1bGxldC5pc0hpdCkgeyAvLyBJZiBidWxsZXQgcmVnaXN0ZXJlZCBhIGNvbGxpc2lvblxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaiA9IGVuZW1pZXMubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBlbmVteSA9IGVuZW1pZXNbal07XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFlbmVteS5pc0FjdGl2ZSkgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlLWNoZWNrIGZvciBjb2xsaXNpb24gdG8gaWRlbnRpZnkgdGhlIHNwZWNpZmljIGVuZW15IGhpdFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gYnVsbGV0LmJvZHkucG9zaXRpb24uZGlzdGFuY2VUbyhlbmVteS5ib2R5LnBvc2l0aW9uKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZGlzdGFuY2UgPCBidWxsZXQuY29uZmlnLnJhZGl1cyArIGVuZW15LmNvbmZpZy5yYWRpdXMgKyAwLjEpIHsgLy8gQSBiaXQgb2YgYnVmZmVyXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGVuZW15LnRha2VEYW1hZ2UoYnVsbGV0LmdldERhbWFnZSgpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcmUgKz0gMTA7IC8vIEF3YXJkIHNjb3JlIGZvciBoaXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgdWkudXBkYXRlU2NvcmUoc2NvcmUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGl0U291bmQgPSBzb3VuZEVmZmVjdE1hcC5nZXQoJ2hpdCcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaGl0U291bmQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhpdFNvdW5kLnN0b3AoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhpdFNvdW5kLnBsYXkoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFlbmVteS5pc0FjdGl2ZSkgeyAvLyBFbmVteSBkaWVkIGZyb20gdGhpcyBoaXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNjb3JlICs9IDUwOyAvLyBCb251cyBzY29yZSBmb3Iga2lsbGluZ1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdWkudXBkYXRlU2NvcmUoc2NvcmUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRW5lbXkgd2lsbCBiZSByZW1vdmVkIGZyb20gYGVuZW1pZXNgIGFycmF5IGluIHRoZSBuZXh0IGl0ZXJhdGlvbiBvZiBpdHMgbG9vcFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEJ1bGxldCBpcyByZW1vdmVkIGJ5IGBidWxsZXQudXBkYXRlKClgIGNoZWNraW5nIGBpc0hpdGBcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7IC8vIEJ1bGxldCBhbHJlYWR5IGhpdCwgbm8gbmVlZCB0byBjaGVjayBvdGhlciBlbmVtaWVzXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZW1vdmUgaW5hY3RpdmUgZW5lbWllc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSBlbmVtaWVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGlmICghZW5lbWllc1tpXS5pc0FjdGl2ZSkge1xyXG4gICAgICAgICAgICAgICAgZW5lbWllc1tpXS5kZXN0cm95KCk7XHJcbiAgICAgICAgICAgICAgICBlbmVtaWVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgZ2FtZSBvdmVyIGNvbmRpdGlvbnNcclxuICAgICAgICBpZiAocGxheWVyLmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIGdhbWVPdmVyKCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChlbmVtaWVzLmxlbmd0aCA9PT0gMCAmJiBzY29yZSA+PSBjb25maWcuZ2FtZS5tYXhTY29yZSkge1xyXG4gICAgICAgICAgICAvLyBBbGwgZW5lbWllcyBkZWZlYXRlZCBhbmQgbWF4IHNjb3JlIGFjaGlldmVkIC0gd2luIGNvbmRpdGlvblxyXG4gICAgICAgICAgICBnYW1lT3ZlcigpOyAvLyBDYW4gYmUgY2hhbmdlZCB0byBhICdXaW4nIHNjcmVlblxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBSZW5kZXIgc2NlbmVcclxuICAgIHJlbmRlcmVyLnJlbmRlcihzY2VuZSwgY2FtZXJhKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2hvb3RCdWxsZXQoKTogdm9pZCB7XHJcbiAgICBjb25zdCBzaG9vdFNvdW5kID0gc291bmRFZmZlY3RNYXAuZ2V0KCdzaG9vdCcpO1xyXG4gICAgaWYgKHNob290U291bmQpIHtcclxuICAgICAgICBzaG9vdFNvdW5kLnN0b3AoKTsgLy8gU3RvcCBpZiBhbHJlYWR5IHBsYXlpbmcgdG8gcmVwbGF5IHF1aWNrbHlcclxuICAgICAgICBzaG9vdFNvdW5kLnBsYXkoKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBHZXQgY2FtZXJhJ3MgZm9yd2FyZCBkaXJlY3Rpb25cclxuICAgIGNvbnN0IGNhbWVyYURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICBjYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24oY2FtZXJhRGlyZWN0aW9uKTtcclxuXHJcbiAgICAvLyBCdWxsZXQgc3Bhd24gcG9zaXRpb24gKHNsaWdodGx5IGluIGZyb250IG9mIGNhbWVyYSlcclxuICAgIGNvbnN0IHNwYXduT2Zmc2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jb3B5KGNhbWVyYURpcmVjdGlvbikubXVsdGlwbHlTY2FsYXIoMC41KTtcclxuICAgIGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNvcHkoY29udHJvbHMub2JqZWN0LnBvc2l0aW9uKS5hZGQoc3Bhd25PZmZzZXQpO1xyXG4gICAgc3RhcnRQb3NpdGlvbi55ICs9IGNvbmZpZy5wbGF5ZXIuY2FtZXJhT2Zmc2V0Lnk7IC8vIEFkanVzdCBmb3IgY2FtZXJhIGhlaWdodFxyXG5cclxuICAgIC8vIEJ1bGxldCBpbml0aWFsIHZlbG9jaXR5XHJcbiAgICBjb25zdCB2ZWxvY2l0eSA9IGNhbWVyYURpcmVjdGlvbi5tdWx0aXBseVNjYWxhcihjb25maWcuYnVsbGV0LnNwZWVkKTtcclxuXHJcbiAgICBjb25zdCBidWxsZXQgPSBuZXcgQnVsbGV0KHNjZW5lLCB3b3JsZCwgY29uZmlnLmJ1bGxldCwgYXNzZXRNYW5hZ2VyLCBzdGFydFBvc2l0aW9uLCB2ZWxvY2l0eSwgYnVsbGV0TWF0ZXJpYWwpO1xyXG4gICAgYnVsbGV0cy5wdXNoKGJ1bGxldCk7XHJcbn1cclxuXHJcbi8vIEluaXRpYWwgY2FsbCB0byBzdGFydCB0aGUgZ2FtZVxyXG5pbml0R2FtZSgpOyJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFDeEIsU0FBUywyQkFBMkI7QUF3RHBDLE1BQU0sYUFBYTtBQUFBLEVBT2YsWUFBWUEsU0FBb0I7QUFDNUIsU0FBSyxTQUFTQTtBQUNkLFNBQUssZ0JBQWdCLElBQUksTUFBTSxjQUFjO0FBQzdDLFNBQUssY0FBYyxJQUFJLE1BQU0sWUFBWTtBQUN6QyxTQUFLLFdBQVcsb0JBQUksSUFBSTtBQUN4QixTQUFLLGVBQWUsb0JBQUksSUFBSTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFNLGFBQTRCO0FBQzlCLFVBQU0sa0JBQWtCLEtBQUssT0FBTyxPQUFPLE9BQU8sSUFBSSxXQUFTO0FBQzNELGFBQU8sSUFBSSxRQUFjLENBQUMsU0FBUyxXQUFXO0FBQzFDLGFBQUssY0FBYztBQUFBLFVBQUssTUFBTTtBQUFBLFVBQzFCLENBQUMsWUFBWTtBQUNULGlCQUFLLFNBQVMsSUFBSSxNQUFNLE1BQU0sT0FBTztBQUNyQyxvQkFBUTtBQUFBLFVBQ1o7QUFBQSxVQUNBO0FBQUE7QUFBQSxVQUNBLENBQUMsVUFBVTtBQUNQLG9CQUFRLE1BQU0sMEJBQTBCLE1BQU0sSUFBSSxLQUFLLEtBQUs7QUFDNUQsbUJBQU8sS0FBSztBQUFBLFVBQ2hCO0FBQUEsUUFDSjtBQUFBLE1BQ0osQ0FBQztBQUFBLElBQ0wsQ0FBQztBQUVELFVBQU0sZ0JBQWdCLEtBQUssT0FBTyxPQUFPLE9BQU8sSUFBSSxXQUFTO0FBQ3pELGFBQU8sSUFBSSxRQUFjLENBQUMsU0FBUyxXQUFXO0FBQzFDLGFBQUss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YUFBYSxlQUFlLElBQUksT0FBTztBQUM3QyxNQUFJLFlBQVk7QUFDWixlQUFXLEtBQUs7QUFDaEIsZUFBVyxLQUFLO0FBQUEsRUFDcEI7QUFHQSxRQUFNLGtCQUFrQixJQUFJLE1BQU0sUUFBUTtBQUMxQyxTQUFPLGtCQUFrQixlQUFlO0FBR3hDLFFBQU0sY0FBYyxJQUFJLE1BQU0sUUFBUSxFQUFFLEtBQUssZUFBZSxFQUFFLGVBQWUsR0FBRztBQUNoRixRQUFNLGdCQUFnQixJQUFJLE1BQU0sUUFBUSxFQUFFLEtBQUssU0FBUyxPQUFPLFFBQVEsRUFBRSxJQUFJLFdBQVc7QUFDeEYsZ0JBQWMsS0FBSyxPQUFPLE9BQU8sYUFBYTtBQUc5QyxRQUFNLFdBQVcsZ0JBQWdCLGVBQWUsT0FBTyxPQUFPLEtBQUs7QUFFbkUsUUFBTSxTQUFTLElBQUksT0FBTyxPQUFPLE9BQU8sT0FBTyxRQUFRLGNBQWMsZUFBZSxVQUFVLGNBQWM7QUFDNUcsVUFBUSxLQUFLLE1BQU07QUFDdkI7QUFHQSxTQUFTOyIsCiAgIm5hbWVzIjogWyJjb25maWciLCAic2NlbmUiLCAid29ybGQiLCAiY2FtZXJhIiwgImNvbnRyb2xzIiwgImFzc2V0TWFuYWdlciIsICJidWxsZXRNYXRlcmlhbCIsICJlbmVteU1hdGVyaWFsIiwgInBsYXllciIsICJjYW52YXMiLCAic2NvcmUiLCAiR2FtZVN0YXRlIiwgIkNvbGxpc2lvbkdyb3VwcyJdCn0K
