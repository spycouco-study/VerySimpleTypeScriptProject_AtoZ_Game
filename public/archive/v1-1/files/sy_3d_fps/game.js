import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
class Game {
  constructor(canvasId, configData) {
    this.playerMesh = null;
    this.lastTime = 0;
    this.assets = {};
    this.bgmSound = null;
    this.bullets = [];
    this.enemies = [];
    this.score = 0;
    this.enemiesAlive = 0;
    // Collision groups for Cannon.js
    this.COLLISION_GROUPS = {
      PLAYER: 1,
      GROUND: 2,
      ENEMY: 4,
      BULLET: 8,
      WALL: 16
    };
    this.config = configData;
    this.canvas = document.getElementById(canvasId);
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
    this.gameState = "TITLE_SCREEN";
    this.createUI();
    this.setupEventListeners();
    this.setupScene();
    this.setupPhysics();
  }
  async start() {
    this.showTitleScreen();
    await this.preloadAssets();
    console.log("Assets loaded. Waiting for user input to start game.");
  }
  createUI() {
    this.uiContainer = document.createElement("div");
    this.uiContainer.id = "game-ui-container";
    this.uiContainer.style.position = "absolute";
    this.uiContainer.style.top = "0";
    this.uiContainer.style.left = "0";
    this.uiContainer.style.width = "100%";
    this.uiContainer.style.height = "100%";
    this.uiContainer.style.pointerEvents = "none";
    this.uiContainer.style.fontFamily = "Arial, sans-serif";
    this.uiContainer.style.color = "#fff";
    this.uiContainer.style.textShadow = "2px 2px 4px rgba(0,0,0,0.8)";
    this.uiContainer.style.zIndex = "1000";
    document.body.appendChild(this.uiContainer);
    this.titleScreenElement = document.createElement("div");
    this.titleScreenElement.id = "titleScreen";
    this.titleScreenElement.style.position = "absolute";
    this.titleScreenElement.style.top = "0";
    this.titleScreenElement.style.left = "0";
    this.titleScreenElement.style.width = "100%";
    this.titleScreenElement.style.height = "100%";
    this.titleScreenElement.style.backgroundColor = "rgba(0,0,0,0.7)";
    this.titleScreenElement.style.display = "flex";
    this.titleScreenElement.style.flexDirection = "column";
    this.titleScreenElement.style.justifyContent = "center";
    this.titleScreenElement.style.alignItems = "center";
    this.titleScreenElement.style.cursor = "pointer";
    this.titleScreenElement.style.pointerEvents = "auto";
    const titleText = document.createElement("h1");
    titleText.innerText = this.config.gameSettings.title;
    titleText.style.fontSize = "3em";
    titleText.style.marginBottom = "20px";
    const startText = document.createElement("p");
    startText.innerText = "Click to Start";
    startText.style.fontSize = "1.5em";
    this.titleScreenElement.appendChild(titleText);
    this.titleScreenElement.appendChild(startText);
    this.uiContainer.appendChild(this.titleScreenElement);
    this.gameOverScreenElement = document.createElement("div");
    this.gameOverScreenElement.id = "gameOverScreen";
    this.gameOverScreenElement.style.position = "absolute";
    this.gameOverScreenElement.style.top = "0";
    this.gameOverScreenElement.style.left = "0";
    this.gameOverScreenElement.style.width = "100%";
    this.gameOverScreenElement.style.height = "100%";
    this.gameOverScreenElement.style.backgroundColor = "rgba(0,0,0,0.7)";
    this.gameOverScreenElement.style.display = "none";
    this.gameOverScreenElement.style.flexDirection = "column";
    this.gameOverScreenElement.style.justifyContent = "center";
    this.gameOverScreenElement.style.alignItems = "center";
    this.gameOverScreenElement.style.cursor = "pointer";
    this.gameOverScreenElement.style.pointerEvents = "auto";
    const gameOverText = document.createElement("h1");
    gameOverText.innerText = "GAME OVER";
    gameOverText.style.fontSize = "3em";
    gameOverText.style.marginBottom = "20px";
    const scoreDisplay = document.createElement("p");
    scoreDisplay.innerText = "Final Score: ";
    scoreDisplay.style.fontSize = "1.5em";
    this.finalScoreElement = document.createElement("span");
    this.finalScoreElement.id = "finalScore";
    this.finalScoreElement.innerText = "0";
    scoreDisplay.appendChild(this.finalScoreElement);
    const restartText = document.createElement("p");
    restartText.innerText = "Click to Restart";
    restartText.style.fontSize = "1.2em";
    this.gameOverScreenElement.appendChild(gameOverText);
    this.gameOverScreenElement.appendChild(scoreDisplay);
    this.gameOverScreenElement.appendChild(restartText);
    this.uiContainer.appendChild(this.gameOverScreenElement);
    this.hudElement = document.createElement("div");
    this.hudElement.id = "hud";
    this.hudElement.style.position = "absolute";
    this.hudElement.style.top = "10px";
    this.hudElement.style.left = "10px";
    this.hudElement.style.width = "calc(100% - 20px)";
    this.hudElement.style.display = "none";
    this.hudElement.style.pointerEvents = "none";
    const healthContainer = document.createElement("div");
    healthContainer.style.width = "200px";
    healthContainer.style.height = "20px";
    healthContainer.style.backgroundColor = "rgba(255,0,0,0.3)";
    healthContainer.style.border = "1px solid #fff";
    healthContainer.style.position = "absolute";
    healthContainer.style.bottom = "20px";
    healthContainer.style.left = "20px";
    this.healthFillElement = document.createElement("div");
    this.healthFillElement.id = "healthFill";
    this.healthFillElement.style.width = "100%";
    this.healthFillElement.style.height = "100%";
    this.healthFillElement.style.backgroundColor = "lime";
    healthContainer.appendChild(this.healthFillElement);
    this.hudElement.appendChild(healthContainer);
    const scoreDisplayHUD = document.createElement("div");
    scoreDisplayHUD.style.position = "absolute";
    scoreDisplayHUD.style.top = "20px";
    scoreDisplayHUD.style.right = "20px";
    scoreDisplayHUD.style.fontSize = "1.5em";
    scoreDisplayHUD.innerText = "Score: ";
    this.scoreValueElement = document.createElement("span");
    this.scoreValueElement.id = "scoreValue";
    this.scoreValueElement.innerText = "0";
    scoreDisplayHUD.appendChild(this.scoreValueElement);
    this.hudElement.appendChild(scoreDisplayHUD);
    const enemiesAliveDisplay = document.createElement("div");
    enemiesAliveDisplay.style.position = "absolute";
    enemiesAliveDisplay.style.top = "60px";
    enemiesAliveDisplay.style.right = "20px";
    enemiesAliveDisplay.style.fontSize = "1.5em";
    enemiesAliveDisplay.innerText = "Enemies: ";
    this.enemiesAliveValueElement = document.createElement("span");
    this.enemiesAliveValueElement.id = "enemiesAliveValue";
    this.enemiesAliveValueElement.innerText = "0";
    enemiesAliveDisplay.appendChild(this.enemiesAliveValueElement);
    this.hudElement.appendChild(enemiesAliveDisplay);
    this.uiContainer.appendChild(this.hudElement);
  }
  setupEventListeners() {
    window.addEventListener("resize", this.onWindowResize.bind(this), false);
    document.addEventListener("keydown", this.onKeyDown.bind(this), false);
    document.addEventListener("keyup", this.onKeyUp.bind(this), false);
    document.addEventListener("mousedown", this.onMouseDown.bind(this), false);
    this.titleScreenElement.addEventListener("click", this.onTitleScreenClick.bind(this), false);
    this.gameOverScreenElement.addEventListener("click", this.onGameOverScreenClick.bind(this), false);
    document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this), false);
    document.addEventListener("pointerlockerror", this.onPointerLockError.bind(this), false);
  }
  showTitleScreen() {
    this.titleScreenElement.style.display = "flex";
    this.hideHUD();
    this.hideGameOverScreen();
  }
  hideTitleScreen() {
    this.titleScreenElement.style.display = "none";
  }
  showHUD() {
    this.hudElement.style.display = "block";
  }
  hideHUD() {
    this.hudElement.style.display = "none";
  }
  showGameOverScreen() {
    this.finalScoreElement.innerText = this.score.toString();
    this.gameOverScreenElement.style.display = "flex";
    this.hideHUD();
    this.bgmSound?.stop();
    this.bgmSound?.disconnect();
  }
  hideGameOverScreen() {
    this.gameOverScreenElement.style.display = "none";
  }
  onTitleScreenClick() {
    if (this.gameState === "TITLE_SCREEN") {
      this.hideTitleScreen();
      this.startGame();
    }
  }
  onGameOverScreenClick() {
    if (this.gameState === "GAME_OVER") {
      this.hideGameOverScreen();
      this.restartGame();
    }
  }
  async preloadAssets() {
    const textureLoader = new THREE.TextureLoader();
    const audioLoader = new THREE.AudioLoader();
    const imagePromises = this.config.assets.images.map((img) => {
      return new Promise((resolve, reject) => {
        textureLoader.load(
          img.path,
          (texture) => {
            this.assets[img.name] = texture;
            resolve();
          },
          void 0,
          // onProgress
          (err) => {
            console.error(`Error loading image ${img.name}:`, err);
            reject(err);
          }
        );
      });
    });
    const soundPromises = this.config.assets.sounds.map((snd) => {
      return new Promise((resolve, reject) => {
        audioLoader.load(
          snd.path,
          (buffer) => {
            this.assets[snd.name] = buffer;
            resolve();
          },
          void 0,
          // onProgress
          (err) => {
            console.error(`Error loading sound ${snd.name}:`, err);
            reject(err);
          }
        );
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log("All assets loaded.");
  }
  setupScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1e3);
    this.camera.position.set(0, 2, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(new THREE.Color(this.config.colors.skyColor));
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);
    this.scene.add(new THREE.AmbientLight(6710886));
    const dirLight = new THREE.DirectionalLight(16777215, 0.8);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);
    const skyboxImageNames = ["skybox_px", "skybox_nx", "skybox_py", "skybox_ny", "skybox_pz", "skybox_nz"];
    const materials = skyboxImageNames.map((name) => {
      const asset = this.assets[name];
      if (asset instanceof THREE.Texture) {
        return new THREE.MeshBasicMaterial({ map: asset, side: THREE.BackSide });
      }
      return new THREE.MeshBasicMaterial({ color: new THREE.Color(this.config.colors.skyColor), side: THREE.BackSide });
    });
    const skybox = new THREE.Mesh(new THREE.BoxGeometry(1e3, 1e3, 1e3), materials);
    this.scene.add(skybox);
  }
  setupPhysics() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, this.config.gameSettings.gravity, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    const groundMaterial = new CANNON.Material("groundMaterial");
    const playerMaterial = new CANNON.Material("playerMaterial");
    const enemyMaterial = new CANNON.Material("enemyMaterial");
    const bulletMaterial = new CANNON.Material("bulletMaterial");
    this.world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, playerMaterial, { friction: 0.1, restitution: 0 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, enemyMaterial, { friction: 0.5, restitution: 0 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(playerMaterial, enemyMaterial, { friction: 0, restitution: 0 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(bulletMaterial, enemyMaterial, { friction: 0, restitution: 0 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(bulletMaterial, groundMaterial, { friction: 0, restitution: 0.5 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(bulletMaterial, bulletMaterial, { friction: 0, restitution: 0.5 }));
  }
  startGame() {
    this.gameState = "PLAYING";
    this.hideTitleScreen();
    this.showHUD();
    this.playerHealth = this.config.gameSettings.playerHealth;
    this.score = 0;
    this.enemiesAlive = 0;
    this.bullets = [];
    this.enemies = [];
    this.keys = {};
    this.canJump = true;
    this.clearGameObjects();
    this.createFloor();
    this.createWalls();
    this.createPlayer();
    this.createEnemies(this.config.gameSettings.enemyCount);
    this.startBGM();
    this.updateUI();
    this.requestPointerLock();
    this.lastTime = performance.now();
    requestAnimationFrame(this.animate.bind(this));
  }
  restartGame() {
    this.startGame();
  }
  clearGameObjects() {
    this.world.bodies.forEach((body) => this.world.removeBody(body));
    const objectsToRemove = this.scene.children.filter(
      (obj) => obj !== this.camera && obj !== this.audioListener && obj instanceof THREE.Mesh && !(obj.geometry instanceof THREE.BoxGeometry && Array.isArray(obj.material) && obj.material.every((m) => m instanceof THREE.MeshBasicMaterial && m.side === THREE.BackSide))
      // Keep skybox
    );
    objectsToRemove.forEach((obj) => this.scene.remove(obj));
  }
  createPlayer() {
    const playerShape = new CANNON.Cylinder(0.5, 0.5, 1.8, 16);
    this.playerBody = new CANNON.Body({ mass: 5, shape: playerShape, linearDamping: 0.9, angularDamping: 0.9 });
    this.playerBody.position.set(0, 10, 0);
    this.playerBody.fixedRotation = true;
    this.playerBody.updateMassProperties();
    this.playerBody.collisionFilterGroup = this.COLLISION_GROUPS.PLAYER;
    this.playerBody.collisionFilterMask = this.COLLISION_GROUPS.GROUND | this.COLLISION_GROUPS.ENEMY | this.COLLISION_GROUPS.WALL;
    this.world.addBody(this.playerBody);
    this.playerBody.addEventListener("collide", (event) => {
      if (event.body === this.floorBody) {
        this.canJump = true;
      }
    });
    this.controls = new PointerLockControls(this.camera, document.body);
    this.scene.add(this.controls.object);
    const playerGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16);
    const playerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.config.colors.playerColor), wireframe: true, transparent: true, opacity: 0 });
    this.playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    this.scene.add(this.playerMesh);
  }
  createFloor() {
    const floorSize = this.config.gameSettings.floorSize;
    const textureAsset = this.assets["floorTexture"];
    let floorTexture;
    if (textureAsset instanceof THREE.Texture) {
      floorTexture = textureAsset;
      floorTexture.wrapS = THREE.RepeatWrapping;
      floorTexture.wrapT = THREE.RepeatWrapping;
      floorTexture.repeat.set(floorSize / 5, floorSize / 5);
    }
    const floorGeometry = new THREE.BoxGeometry(floorSize, 1, floorSize);
    const floorMaterialOptions = {};
    if (floorTexture) {
      floorMaterialOptions.map = floorTexture;
    } else {
      floorMaterialOptions.color = new THREE.Color(this.config.colors.floorColor);
    }
    const floorMaterial = new THREE.MeshLambertMaterial(floorMaterialOptions);
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.position.y = -0.5;
    this.scene.add(floorMesh);
    this.floorBody = new CANNON.Body({ mass: 0 });
    this.floorBody.addShape(new CANNON.Box(new CANNON.Vec3(floorSize / 2, 0.5, floorSize / 2)));
    this.floorBody.position.y = -0.5;
    this.floorBody.collisionFilterGroup = this.COLLISION_GROUPS.GROUND;
    this.world.addBody(this.floorBody);
  }
  createWalls() {
    const floorSize = this.config.gameSettings.floorSize;
    const wallHeight = this.config.gameSettings.wallHeight;
    const wallThickness = 1;
    const textureAsset = this.assets["wallTexture"];
    let wallTexture;
    if (textureAsset instanceof THREE.Texture) {
      wallTexture = textureAsset;
      wallTexture.wrapS = THREE.RepeatWrapping;
      wallTexture.wrapT = THREE.RepeatWrapping;
    }
    const wallMaterialOptions = {};
    if (wallTexture) {
      wallMaterialOptions.map = wallTexture;
    } else {
      wallMaterialOptions.color = new THREE.Color(this.config.colors.wallColor);
    }
    const wallMaterial = new THREE.MeshLambertMaterial(wallMaterialOptions);
    const createWall = (x, y, z, sx, sy, sz) => {
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
    createWall(0, wallHeight / 2, -floorSize / 2, floorSize, wallHeight, wallThickness);
    createWall(0, wallHeight / 2, floorSize / 2, floorSize, wallHeight, wallThickness);
    createWall(-floorSize / 2, wallHeight / 2, 0, wallThickness, wallHeight, floorSize);
    createWall(floorSize / 2, wallHeight / 2, 0, wallThickness, wallHeight, floorSize);
  }
  createEnemies(count) {
    const floorSize = this.config.gameSettings.floorSize;
    const spawnArea = this.config.gameSettings.initialSpawnArea;
    const textureAsset = this.assets["enemyTexture"];
    let enemyTexture;
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
      const y = enemyHeight / 2;
      const enemyGeometry = new THREE.BoxGeometry(enemyRadius * 2, enemyHeight, enemyRadius * 2);
      const enemyMaterialOptions = {};
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
  animate(time) {
    if (this.gameState !== "PLAYING") {
      return;
    }
    const dt = (time - this.lastTime) / 1e3;
    this.lastTime = time;
    if (dt > 1 / 30) {
      this.world.step(1 / 60, dt, 3);
    } else {
      this.world.step(1 / 60, dt);
    }
    this.handlePlayerMovement(dt);
    this.camera.position.copy(this.playerBody.position);
    this.camera.position.y += 0.8;
    if (this.playerMesh) {
      this.playerMesh.position.copy(this.playerBody.position);
      this.playerMesh.quaternion.copy(this.playerBody.quaternion);
    }
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.renderer.render(this.scene, this.camera);
    this.updateUI();
    requestAnimationFrame(this.animate.bind(this));
  }
  handlePlayerMovement(dt) {
    if (!this.controls.isLocked) return;
    const inputVelocity = new THREE.Vector3();
    const playerSpeed = this.config.gameSettings.playerSpeed;
    if (this.keys["KeyW"]) inputVelocity.z -= playerSpeed;
    if (this.keys["KeyS"]) inputVelocity.z += playerSpeed;
    if (this.keys["KeyA"]) inputVelocity.x -= playerSpeed;
    if (this.keys["KeyD"]) inputVelocity.x += playerSpeed;
    const playerDirection = new THREE.Vector3();
    this.camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    const rightDirection = new THREE.Vector3();
    rightDirection.crossVectors(this.camera.up, playerDirection);
    const finalVelocity = new CANNON.Vec3();
    if (this.keys["KeyW"] || this.keys["KeyS"]) {
      finalVelocity.x += playerDirection.x * inputVelocity.z;
      finalVelocity.z += playerDirection.z * inputVelocity.z;
    }
    if (this.keys["KeyA"] || this.keys["KeyD"]) {
      finalVelocity.x += rightDirection.x * inputVelocity.x;
      finalVelocity.z += rightDirection.z * inputVelocity.x;
    }
    const currentYVelocity = this.playerBody.velocity.y;
    this.playerBody.velocity.set(finalVelocity.x, currentYVelocity, finalVelocity.z);
    if (this.keys["Space"] && this.canJump) {
      this.playerBody.velocity.y = this.config.gameSettings.playerJumpForce;
      this.canJump = false;
    }
  }
  onKeyDown(event) {
    this.keys[event.code] = true;
  }
  onKeyUp(event) {
    this.keys[event.code] = false;
  }
  onMouseDown(event) {
    if (this.gameState === "PLAYING" && this.controls.isLocked) {
      if (event.button === 0) {
        this.fireBullet();
      }
    }
  }
  onPointerLockChange() {
    if (document.pointerLockElement === document.body) {
      this.controls.isLocked = true;
      console.log("PointerLockControls: Locked");
      if (this.gameState === "PLAYING") {
        this.bgmSound?.play();
      }
    } else {
      this.controls.isLocked = false;
      console.log("PointerLockControls: Unlocked");
      if (this.gameState === "PLAYING") {
        this.bgmSound?.pause();
      }
    }
  }
  onPointerLockError() {
    console.error("PointerLockControls: Error");
  }
  requestPointerLock() {
    document.body.requestPointerLock();
  }
  fireBullet() {
    const bulletSpeed = this.config.gameSettings.bulletSpeed;
    const bulletLifetime = this.config.gameSettings.bulletLifetime;
    const textureAsset = this.assets["bulletTexture"];
    let bulletTexture;
    if (textureAsset instanceof THREE.Texture) {
      bulletTexture = textureAsset;
    }
    const bulletGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const bulletMaterialOptions = {};
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
    raycaster.ray.at(0.5, bulletSpawnOffset);
    bulletBody.position.copy(bulletSpawnOffset);
    const bulletDirection = new THREE.Vector3();
    this.camera.getWorldDirection(bulletDirection);
    bulletBody.velocity.copy(bulletDirection.multiplyScalar(bulletSpeed));
    bulletBody.addEventListener("collide", (event) => {
      if (event.body.mass === 0 || event.body.collisionFilterGroup === this.COLLISION_GROUPS.GROUND || event.body.collisionFilterGroup === this.COLLISION_GROUPS.WALL) {
        this.removeBullet(bulletBody);
      } else if (event.body.collisionFilterGroup === this.COLLISION_GROUPS.ENEMY) {
        const hitEnemy = this.enemies.find((e) => e.body === event.body);
        if (hitEnemy) {
          this.enemyTakeDamage(hitEnemy, this.config.gameSettings.bulletDamage);
        }
        this.removeBullet(bulletBody);
      }
    });
    this.bullets.push({ mesh: bulletMesh, body: bulletBody, lifetime: 0, maxLifetime: bulletLifetime });
    this.playSound("shoot", bulletSpawnOffset);
  }
  removeBullet(bodyToRemove) {
    const index = this.bullets.findIndex((b) => b.body === bodyToRemove);
    if (index !== -1) {
      const bullet = this.bullets[index];
      this.scene.remove(bullet.mesh);
      this.world.removeBody(bullet.body);
      this.bullets.splice(index, 1);
    }
  }
  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.lifetime += dt;
      if (bullet.lifetime > bullet.maxLifetime) {
        this.removeBullet(bullet.body);
      } else {
        bullet.mesh.position.copy(bullet.body.position);
        bullet.mesh.quaternion.copy(bullet.body.quaternion);
      }
    }
  }
  updateEnemies(dt) {
    const playerPosition = this.playerBody.position;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.health <= 0) {
        this.scene.remove(enemy.mesh);
        this.world.removeBody(enemy.body);
        this.enemies.splice(i, 1);
        this.enemiesAlive--;
        this.score += 100;
        this.playSound("enemyDie", enemy.body.position);
        continue;
      }
      const direction = new CANNON.Vec3();
      playerPosition.vsub(enemy.body.position, direction);
      direction.y = 0;
      direction.normalize();
      enemy.body.velocity.x = direction.x * this.config.gameSettings.enemySpeed;
      enemy.body.velocity.z = direction.z * this.config.gameSettings.enemySpeed;
      enemy.mesh.lookAt(playerPosition.x, enemy.mesh.position.y, playerPosition.z);
      enemy.mesh.position.copy(enemy.body.position);
      enemy.mesh.quaternion.copy(enemy.body.quaternion);
      this.checkEnemyAttack(enemy, dt);
    }
    if (this.enemiesAlive === 0 && this.gameState === "PLAYING") {
      console.log("All enemies defeated!");
      this.gameOver();
    }
  }
  checkEnemyAttack(enemy, dt) {
    const distanceToPlayer = enemy.body.position.distanceTo(this.playerBody.position);
    const attackRange = 1.5;
    if (distanceToPlayer < attackRange) {
      enemy.lastAttackTime += dt;
      if (enemy.lastAttackTime >= enemy.attackCooldown) {
        this.playerTakeDamage(this.config.gameSettings.enemyDamage);
        this.playSound("playerHurt", this.playerBody.position);
        enemy.lastAttackTime = 0;
      }
    } else {
      enemy.lastAttackTime = enemy.attackCooldown;
    }
  }
  playerTakeDamage(damage) {
    this.playerHealth -= damage;
    if (this.playerHealth <= 0) {
      this.playerHealth = 0;
      this.gameOver();
    }
    this.updateUI();
  }
  enemyTakeDamage(enemy, damage) {
    enemy.health -= damage;
    this.playSound("hit", enemy.body.position);
    if (enemy.health <= 0) {
      console.log("Enemy defeated!");
    }
    this.updateUI();
  }
  playSound(name, position) {
    const buffer = this.assets[name];
    if (buffer instanceof AudioBuffer) {
      const sound = new THREE.PositionalAudio(this.audioListener);
      sound.setBuffer(buffer);
      const soundConfig = this.config.assets.sounds.find((s) => s.name === name);
      if (soundConfig) {
        sound.setVolume(this.config.gameSettings.effectVolume * soundConfig.volume);
      } else {
        console.warn(`Sound config for ${name} not found, using default effect volume.`);
        sound.setVolume(this.config.gameSettings.effectVolume);
      }
      sound.setRefDistance(5);
      sound.autoplay = true;
      sound.setLoop(false);
      if (position) {
        const object = new THREE.Object3D();
        object.position.copy(position);
        this.scene.add(object);
        object.add(sound);
        setTimeout(() => {
          sound.disconnect();
          object.remove(sound);
          this.scene.remove(object);
        }, (soundConfig?.duration_seconds || 1) * 1e3 + 500);
      } else {
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
      }
    }
  }
  startBGM() {
    const bgmBuffer = this.assets["bgm"];
    if (bgmBuffer instanceof AudioBuffer) {
      if (this.bgmSound) {
        this.bgmSound.stop();
        this.bgmSound.disconnect();
      }
      this.bgmSound = new THREE.Audio(this.audioListener);
      this.bgmSound.setBuffer(bgmBuffer);
      this.bgmSound.setLoop(true);
      const bgmConfig = this.config.assets.sounds.find((s) => s.name === "bgm");
      if (bgmConfig) {
        this.bgmSound.setVolume(this.config.gameSettings.musicVolume * bgmConfig.volume);
      } else {
        console.warn(`BGM config not found, using default music volume.`);
        this.bgmSound.setVolume(this.config.gameSettings.musicVolume);
      }
      this.bgmSound.play();
    }
  }
  updateUI() {
    this.healthFillElement.style.width = `${Math.max(0, this.playerHealth)}%`;
    this.scoreValueElement.innerText = this.score.toString();
    this.enemiesAliveValueElement.innerText = this.enemiesAlive.toString();
  }
  gameOver() {
    this.gameState = "GAME_OVER";
    this.showGameOverScreen();
    document.exitPointerLock();
  }
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
async function initGameFromHTML() {
  const response = await fetch("data.json");
  if (!response.ok) {
    console.error("Failed to load data.json");
    return;
  }
  const config = await response.json();
  const game = new Game("gameCanvas", config);
  await game.start();
}
document.addEventListener("DOMContentLoaded", initGameFromHTML);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuaW1wb3J0IHsgUG9pbnRlckxvY2tDb250cm9scyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS9jb250cm9scy9Qb2ludGVyTG9ja0NvbnRyb2xzLmpzJztcclxuXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgcGxheWVyU3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBwbGF5ZXJKdW1wRm9yY2U6IG51bWJlcjtcclxuICAgICAgICBwbGF5ZXJIZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgICAgIGJ1bGxldExpZmV0aW1lOiBudW1iZXI7XHJcbiAgICAgICAgZW5lbXlDb3VudDogbnVtYmVyO1xyXG4gICAgICAgIGVuZW15U3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBlbmVteUhlYWx0aDogbnVtYmVyO1xyXG4gICAgICAgIGVuZW15RGFtYWdlOiBudW1iZXI7XHJcbiAgICAgICAgZW5lbXlBdHRhY2tDb29sZG93bjogbnVtYmVyO1xyXG4gICAgICAgIGdyYXZpdHk6IG51bWJlcjtcclxuICAgICAgICBmbG9vclNpemU6IG51bWJlcjtcclxuICAgICAgICB3YWxsSGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgaW5pdGlhbFNwYXduQXJlYTogbnVtYmVyO1xyXG4gICAgICAgIG11c2ljVm9sdW1lOiBudW1iZXI7XHJcbiAgICAgICAgZWZmZWN0Vm9sdW1lOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgY29sb3JzOiB7XHJcbiAgICAgICAgc2t5Q29sb3I6IHN0cmluZztcclxuICAgICAgICBmbG9vckNvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgd2FsbENvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgcGxheWVyQ29sb3I6IHN0cmluZzsgLy8gRGVidWcgY29sb3IgZm9yIHBsYXllciBib2R5LCBub3QgZGlyZWN0bHkgdmlzaWJsZSBpbiBGUFMgdmlld1xyXG4gICAgICAgIGVuZW15Q29sb3I6IHN0cmluZztcclxuICAgICAgICBidWxsZXRDb2xvcjogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1bXTtcclxuICAgICAgICBzb3VuZHM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjsgdm9sdW1lOiBudW1iZXI7IH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lQXNzZXQge1xyXG4gICAgW2tleTogc3RyaW5nXTogVEhSRUUuVGV4dHVyZSB8IEF1ZGlvQnVmZmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQnVsbGV0IHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIGxpZmV0aW1lOiBudW1iZXI7XHJcbiAgICBtYXhMaWZldGltZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRW5lbXkge1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBsYXN0QXR0YWNrVGltZTogbnVtYmVyO1xyXG4gICAgYXR0YWNrQ29vbGRvd246IG51bWJlcjtcclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNvbmZpZzogR2FtZUNvbmZpZztcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgc2NlbmU6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG4gICAgcHJpdmF0ZSByZW5kZXJlcjogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICAgIHByaXZhdGUgY29udHJvbHM6IFBvaW50ZXJMb2NrQ29udHJvbHM7IC8vIFBvaW50ZXJMb2NrQ29udHJvbHNcclxuICAgIHByaXZhdGUgd29ybGQ6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keTogQ0FOTk9OLkJvZHk7XHJcbiAgICBwcml2YXRlIHBsYXllck1lc2g6IFRIUkVFLk1lc2ggfCBudWxsID0gbnVsbDsgLy8gRGVidWcvcGxhY2Vob2xkZXIgbWVzaCwgdHlwaWNhbGx5IGludmlzaWJsZSBpbiBGUFNcclxuICAgIHByaXZhdGUgY2FuSnVtcDogYm9vbGVhbjtcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH07XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBhc3NldHM6IEdhbWVBc3NldCA9IHt9O1xyXG4gICAgcHJpdmF0ZSBhdWRpb0xpc3RlbmVyOiBUSFJFRS5BdWRpb0xpc3RlbmVyO1xyXG4gICAgcHJpdmF0ZSBiZ21Tb3VuZDogVEhSRUUuQXVkaW8gfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBwcml2YXRlIGJ1bGxldHM6IEJ1bGxldFtdID0gW107XHJcbiAgICBwcml2YXRlIGVuZW1pZXM6IEVuZW15W10gPSBbXTtcclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIHBsYXllckhlYWx0aDogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBlbmVtaWVzQWxpdmU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgcHJpdmF0ZSBmbG9vckJvZHk6IENBTk5PTi5Cb2R5O1xyXG5cclxuICAgIC8vIFVJIEVsZW1lbnRzIC0gbm93IGd1YXJhbnRlZWQgdG8gZXhpc3QgYWZ0ZXIgY3JlYXRlVUlcclxuICAgIHByaXZhdGUgdWlDb250YWluZXI6IEhUTUxFbGVtZW50OyAvLyBNYWluIGNvbnRhaW5lciBmb3IgYWxsIFVJIGVsZW1lbnRzXHJcbiAgICBwcml2YXRlIHRpdGxlU2NyZWVuRWxlbWVudDogSFRNTEVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGdhbWVPdmVyU2NyZWVuRWxlbWVudDogSFRNTEVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGh1ZEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBoZWFsdGhGaWxsRWxlbWVudDogSFRNTEVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHNjb3JlVmFsdWVFbGVtZW50OiBIVE1MRWxlbWVudDtcclxuICAgIHByaXZhdGUgZW5lbWllc0FsaXZlVmFsdWVFbGVtZW50OiBIVE1MRWxlbWVudDtcclxuICAgIHByaXZhdGUgZmluYWxTY29yZUVsZW1lbnQ6IEhUTUxFbGVtZW50OyAvLyBBZGRlZCBmb3IgZ2FtZSBvdmVyIHNjcmVlbiBzY29yZVxyXG5cclxuICAgIC8vIEdhbWUgU3RhdGVcclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiAnVElUTEVfU0NSRUVOJyB8ICdQTEFZSU5HJyB8ICdHQU1FX09WRVInO1xyXG5cclxuICAgIC8vIENvbGxpc2lvbiBncm91cHMgZm9yIENhbm5vbi5qc1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBDT0xMSVNJT05fR1JPVVBTID0ge1xyXG4gICAgICAgIFBMQVlFUjogMSxcclxuICAgICAgICBHUk9VTkQ6IDIsXHJcbiAgICAgICAgRU5FTVk6IDQsXHJcbiAgICAgICAgQlVMTEVUOiA4LFxyXG4gICAgICAgIFdBTEw6IDE2XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcsIGNvbmZpZ0RhdGE6IEdhbWVDb25maWcpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZ0RhdGE7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENhbnZhcyBlbGVtZW50IHdpdGggSUQgJyR7Y2FudmFzSWR9JyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICAgICAgdGhpcy5jYW52YXMuaGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xyXG5cclxuICAgICAgICB0aGlzLnBsYXllckhlYWx0aCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJIZWFsdGg7XHJcbiAgICAgICAgdGhpcy5jYW5KdW1wID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmtleXMgPSB7fTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSBbXTtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmVuZW1pZXNBbGl2ZSA9IDA7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSAnVElUTEVfU0NSRUVOJztcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGFuZCBzZXQgdXAgVUkgZWxlbWVudHMgZHluYW1pY2FsbHlcclxuICAgICAgICB0aGlzLmNyZWF0ZVVJKCk7XHJcblxyXG4gICAgICAgIC8vIEV2ZW50IExpc3RlbmVyc1xyXG4gICAgICAgIHRoaXMuc2V0dXBFdmVudExpc3RlbmVycygpO1xyXG5cclxuICAgICAgICAvLyBJbml0aWFsIHNldHVwIGZvciBUaHJlZS5qcyBhbmQgQ2Fubm9uLmpzXHJcbiAgICAgICAgdGhpcy5zZXR1cFNjZW5lKCk7XHJcbiAgICAgICAgdGhpcy5zZXR1cFBoeXNpY3MoKTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLnNob3dUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMucHJlbG9hZEFzc2V0cygpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQXNzZXRzIGxvYWRlZC4gV2FpdGluZyBmb3IgdXNlciBpbnB1dCB0byBzdGFydCBnYW1lLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZVVJKCk6IHZvaWQge1xyXG4gICAgICAgIC8vIE1haW4gVUkgY29udGFpbmVyIHRoYXQgaG9sZHMgYWxsIGdhbWUtcmVsYXRlZCBVSSBvdmVybGF5c1xyXG4gICAgICAgIHRoaXMudWlDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLmlkID0gJ2dhbWUtdWktY29udGFpbmVyJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLnRvcCA9ICcwJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLmxlZnQgPSAnMCc7XHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICcxMDAlJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7IC8vIEFsbG93IG1vdXNlIGV2ZW50cyB0byBwYXNzIHRocm91Z2ggdG8gY2FudmFzIGJ5IGRlZmF1bHRcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLnN0eWxlLmZvbnRGYW1pbHkgPSAnQXJpYWwsIHNhbnMtc2VyaWYnO1xyXG4gICAgICAgIHRoaXMudWlDb250YWluZXIuc3R5bGUuY29sb3IgPSAnI2ZmZic7XHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5zdHlsZS50ZXh0U2hhZG93ID0gJzJweCAycHggNHB4IHJnYmEoMCwwLDAsMC44KSc7XHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5zdHlsZS56SW5kZXggPSAnMTAwMCc7IC8vIEVuc3VyZSBVSSBpcyBvbiB0b3BcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMudWlDb250YWluZXIpO1xyXG5cclxuICAgICAgICAvLyBUaXRsZSBTY3JlZW5cclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LmlkID0gJ3RpdGxlU2NyZWVuJztcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuRWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbkVsZW1lbnQuc3R5bGUudG9wID0gJzAnO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LnN0eWxlLmxlZnQgPSAnMCc7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbkVsZW1lbnQuc3R5bGUud2lkdGggPSAnMTAwJSc7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbkVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICdyZ2JhKDAsMCwwLDAuNyknO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7IC8vIERlZmF1bHQgdG8gdmlzaWJsZVxyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LnN0eWxlLmZsZXhEaXJlY3Rpb24gPSAnY29sdW1uJztcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuRWxlbWVudC5zdHlsZS5qdXN0aWZ5Q29udGVudCA9ICdjZW50ZXInO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LnN0eWxlLmFsaWduSXRlbXMgPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuRWxlbWVudC5zdHlsZS5jdXJzb3IgPSAncG9pbnRlcic7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbkVsZW1lbnQuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdhdXRvJzsgLy8gQWxsb3cgY2xpY2tzIG9uIHRoaXMgc3BlY2lmaWMgb3ZlcmxheVxyXG5cclxuICAgICAgICBjb25zdCB0aXRsZVRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdoMScpO1xyXG4gICAgICAgIHRpdGxlVGV4dC5pbm5lclRleHQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGl0bGU7XHJcbiAgICAgICAgdGl0bGVUZXh0LnN0eWxlLmZvbnRTaXplID0gJzNlbSc7XHJcbiAgICAgICAgdGl0bGVUZXh0LnN0eWxlLm1hcmdpbkJvdHRvbSA9ICcyMHB4JztcclxuXHJcbiAgICAgICAgY29uc3Qgc3RhcnRUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xyXG4gICAgICAgIHN0YXJ0VGV4dC5pbm5lclRleHQgPSAnQ2xpY2sgdG8gU3RhcnQnO1xyXG4gICAgICAgIHN0YXJ0VGV4dC5zdHlsZS5mb250U2l6ZSA9ICcxLjVlbSc7XHJcblxyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LmFwcGVuZENoaWxkKHRpdGxlVGV4dCk7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbkVsZW1lbnQuYXBwZW5kQ2hpbGQoc3RhcnRUZXh0KTtcclxuICAgICAgICB0aGlzLnVpQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMudGl0bGVTY3JlZW5FbGVtZW50KTtcclxuXHJcbiAgICAgICAgLy8gR2FtZSBPdmVyIFNjcmVlblxyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5FbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQuaWQgPSAnZ2FtZU92ZXJTY3JlZW4nO1xyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5FbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5zdHlsZS50b3AgPSAnMCc7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQuc3R5bGUubGVmdCA9ICcwJztcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5zdHlsZS53aWR0aCA9ICcxMDAlJztcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ3JnYmEoMCwwLDAsMC43KSc7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJzsgLy8gRGVmYXVsdCB0byBoaWRkZW5cclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5zdHlsZS5mbGV4RGlyZWN0aW9uID0gJ2NvbHVtbic7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSAnY2VudGVyJztcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5zdHlsZS5hbGlnbkl0ZW1zID0gJ2NlbnRlcic7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5FbGVtZW50LnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnYXV0byc7XHJcblxyXG4gICAgICAgIGNvbnN0IGdhbWVPdmVyVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2gxJyk7XHJcbiAgICAgICAgZ2FtZU92ZXJUZXh0LmlubmVyVGV4dCA9ICdHQU1FIE9WRVInO1xyXG4gICAgICAgIGdhbWVPdmVyVGV4dC5zdHlsZS5mb250U2l6ZSA9ICczZW0nO1xyXG4gICAgICAgIGdhbWVPdmVyVGV4dC5zdHlsZS5tYXJnaW5Cb3R0b20gPSAnMjBweCc7XHJcblxyXG4gICAgICAgIGNvbnN0IHNjb3JlRGlzcGxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuICAgICAgICBzY29yZURpc3BsYXkuaW5uZXJUZXh0ID0gJ0ZpbmFsIFNjb3JlOiAnO1xyXG4gICAgICAgIHNjb3JlRGlzcGxheS5zdHlsZS5mb250U2l6ZSA9ICcxLjVlbSc7XHJcbiAgICAgICAgdGhpcy5maW5hbFNjb3JlRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTsgLy8gU3RvcmUgcmVmZXJlbmNlIGZvciB1cGRhdGluZ1xyXG4gICAgICAgIHRoaXMuZmluYWxTY29yZUVsZW1lbnQuaWQgPSAnZmluYWxTY29yZSc7XHJcbiAgICAgICAgdGhpcy5maW5hbFNjb3JlRWxlbWVudC5pbm5lclRleHQgPSAnMCc7XHJcbiAgICAgICAgc2NvcmVEaXNwbGF5LmFwcGVuZENoaWxkKHRoaXMuZmluYWxTY29yZUVsZW1lbnQpO1xyXG5cclxuICAgICAgICBjb25zdCByZXN0YXJ0VGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuICAgICAgICByZXN0YXJ0VGV4dC5pbm5lclRleHQgPSAnQ2xpY2sgdG8gUmVzdGFydCc7XHJcbiAgICAgICAgcmVzdGFydFRleHQuc3R5bGUuZm9udFNpemUgPSAnMS4yZW0nO1xyXG5cclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5hcHBlbmRDaGlsZChnYW1lT3ZlclRleHQpO1xyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5FbGVtZW50LmFwcGVuZENoaWxkKHNjb3JlRGlzcGxheSk7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQuYXBwZW5kQ2hpbGQocmVzdGFydFRleHQpO1xyXG4gICAgICAgIHRoaXMudWlDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQpO1xyXG5cclxuICAgICAgICAvLyBIVURcclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQuaWQgPSAnaHVkJztcclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgIHRoaXMuaHVkRWxlbWVudC5zdHlsZS50b3AgPSAnMTBweCc7XHJcbiAgICAgICAgdGhpcy5odWRFbGVtZW50LnN0eWxlLmxlZnQgPSAnMTBweCc7XHJcbiAgICAgICAgdGhpcy5odWRFbGVtZW50LnN0eWxlLndpZHRoID0gJ2NhbGMoMTAwJSAtIDIwcHgpJztcclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJzsgLy8gRGVmYXVsdCB0byBoaWRkZW5cclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJzsgLy8gRG9uJ3QgYmxvY2sgZ2FtZSBpbnRlcmFjdGlvblxyXG5cclxuICAgICAgICAvLyBIZWFsdGggQmFyXHJcbiAgICAgICAgY29uc3QgaGVhbHRoQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgaGVhbHRoQ29udGFpbmVyLnN0eWxlLndpZHRoID0gJzIwMHB4JztcclxuICAgICAgICBoZWFsdGhDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzIwcHgnO1xyXG4gICAgICAgIGhlYWx0aENvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAncmdiYSgyNTUsMCwwLDAuMyknO1xyXG4gICAgICAgIGhlYWx0aENvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkICNmZmYnO1xyXG4gICAgICAgIGhlYWx0aENvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgaGVhbHRoQ29udGFpbmVyLnN0eWxlLmJvdHRvbSA9ICcyMHB4JztcclxuICAgICAgICBoZWFsdGhDb250YWluZXIuc3R5bGUubGVmdCA9ICcyMHB4JztcclxuICAgICAgICB0aGlzLmhlYWx0aEZpbGxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGhGaWxsRWxlbWVudC5pZCA9ICdoZWFsdGhGaWxsJztcclxuICAgICAgICB0aGlzLmhlYWx0aEZpbGxFbGVtZW50LnN0eWxlLndpZHRoID0gJzEwMCUnOyAvLyBXaWxsIGJlIHVwZGF0ZWQgdG8gcGxheWVyIGhlYWx0aFxyXG4gICAgICAgIHRoaXMuaGVhbHRoRmlsbEVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoRmlsbEVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJ2xpbWUnO1xyXG4gICAgICAgIGhlYWx0aENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmhlYWx0aEZpbGxFbGVtZW50KTtcclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQuYXBwZW5kQ2hpbGQoaGVhbHRoQ29udGFpbmVyKTtcclxuXHJcbiAgICAgICAgLy8gU2NvcmVcclxuICAgICAgICBjb25zdCBzY29yZURpc3BsYXlIVUQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBzY29yZURpc3BsYXlIVUQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgIHNjb3JlRGlzcGxheUhVRC5zdHlsZS50b3AgPSAnMjBweCc7XHJcbiAgICAgICAgc2NvcmVEaXNwbGF5SFVELnN0eWxlLnJpZ2h0ID0gJzIwcHgnO1xyXG4gICAgICAgIHNjb3JlRGlzcGxheUhVRC5zdHlsZS5mb250U2l6ZSA9ICcxLjVlbSc7XHJcbiAgICAgICAgc2NvcmVEaXNwbGF5SFVELmlubmVyVGV4dCA9ICdTY29yZTogJztcclxuICAgICAgICB0aGlzLnNjb3JlVmFsdWVFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xyXG4gICAgICAgIHRoaXMuc2NvcmVWYWx1ZUVsZW1lbnQuaWQgPSAnc2NvcmVWYWx1ZSc7XHJcbiAgICAgICAgdGhpcy5zY29yZVZhbHVlRWxlbWVudC5pbm5lclRleHQgPSAnMCc7XHJcbiAgICAgICAgc2NvcmVEaXNwbGF5SFVELmFwcGVuZENoaWxkKHRoaXMuc2NvcmVWYWx1ZUVsZW1lbnQpO1xyXG4gICAgICAgIHRoaXMuaHVkRWxlbWVudC5hcHBlbmRDaGlsZChzY29yZURpc3BsYXlIVUQpO1xyXG5cclxuICAgICAgICAvLyBFbmVtaWVzIEFsaXZlXHJcbiAgICAgICAgY29uc3QgZW5lbWllc0FsaXZlRGlzcGxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIGVuZW1pZXNBbGl2ZURpc3BsYXkuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgIGVuZW1pZXNBbGl2ZURpc3BsYXkuc3R5bGUudG9wID0gJzYwcHgnO1xyXG4gICAgICAgIGVuZW1pZXNBbGl2ZURpc3BsYXkuc3R5bGUucmlnaHQgPSAnMjBweCc7XHJcbiAgICAgICAgZW5lbWllc0FsaXZlRGlzcGxheS5zdHlsZS5mb250U2l6ZSA9ICcxLjVlbSc7XHJcbiAgICAgICAgZW5lbWllc0FsaXZlRGlzcGxheS5pbm5lclRleHQgPSAnRW5lbWllczogJztcclxuICAgICAgICB0aGlzLmVuZW1pZXNBbGl2ZVZhbHVlRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcclxuICAgICAgICB0aGlzLmVuZW1pZXNBbGl2ZVZhbHVlRWxlbWVudC5pZCA9ICdlbmVtaWVzQWxpdmVWYWx1ZSc7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzQWxpdmVWYWx1ZUVsZW1lbnQuaW5uZXJUZXh0ID0gJzAnO1xyXG4gICAgICAgIGVuZW1pZXNBbGl2ZURpc3BsYXkuYXBwZW5kQ2hpbGQodGhpcy5lbmVtaWVzQWxpdmVWYWx1ZUVsZW1lbnQpO1xyXG4gICAgICAgIHRoaXMuaHVkRWxlbWVudC5hcHBlbmRDaGlsZChlbmVtaWVzQWxpdmVEaXNwbGF5KTtcclxuXHJcbiAgICAgICAgdGhpcy51aUNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmh1ZEVsZW1lbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBFdmVudExpc3RlbmVycygpOiB2b2lkIHtcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5vbldpbmRvd1Jlc2l6ZS5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMub25LZXlVcC5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBsaXN0ZW5lcnMgdG8gZHluYW1pY2FsbHkgY3JlYXRlZCBVSSBlbGVtZW50c1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5vblRpdGxlU2NyZWVuQ2xpY2suYmluZCh0aGlzKSwgZmFsc2UpO1xyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5vbkdhbWVPdmVyU2NyZWVuQ2xpY2suYmluZCh0aGlzKSwgZmFsc2UpO1xyXG5cclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxvY2tlcnJvcicsIHRoaXMub25Qb2ludGVyTG9ja0Vycm9yLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgICAgIHRoaXMuaGlkZUhVRCgpO1xyXG4gICAgICAgIHRoaXMuaGlkZUdhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoaWRlVGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dIVUQoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5odWRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGlkZUhVRCgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmZpbmFsU2NvcmVFbGVtZW50LmlubmVyVGV4dCA9IHRoaXMuc2NvcmUudG9TdHJpbmcoKTtcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgICAgIHRoaXMuaGlkZUhVRCgpO1xyXG4gICAgICAgIHRoaXMuYmdtU291bmQ/LnN0b3AoKTtcclxuICAgICAgICB0aGlzLmJnbVNvdW5kPy5kaXNjb25uZWN0KCk7IC8vIERpc2Nvbm5lY3QgQkdNIG9uIGdhbWUgb3ZlclxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGlkZUdhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvblRpdGxlU2NyZWVuQ2xpY2soKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSAnVElUTEVfU0NSRUVOJykge1xyXG4gICAgICAgICAgICB0aGlzLmhpZGVUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uR2FtZU92ZXJTY3JlZW5DbGljaygpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09ICdHQU1FX09WRVInKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGlkZUdhbWVPdmVyU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIHRoaXMucmVzdGFydEdhbWUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBwcmVsb2FkQXNzZXRzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIGNvbnN0IGF1ZGlvTG9hZGVyID0gbmV3IFRIUkVFLkF1ZGlvTG9hZGVyKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgdGV4dHVyZUxvYWRlci5sb2FkKGltZy5wYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgICh0ZXh0dXJlOiBUSFJFRS5UZXh0dXJlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzW2ltZy5uYW1lXSA9IHRleHR1cmU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCwgLy8gb25Qcm9ncmVzc1xyXG4gICAgICAgICAgICAgICAgICAgIChlcnI6IEVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIGxvYWRpbmcgaW1hZ2UgJHtpbWcubmFtZX06YCwgZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzbmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgYXVkaW9Mb2FkZXIubG9hZChzbmQucGF0aCxcclxuICAgICAgICAgICAgICAgICAgICAoYnVmZmVyOiBBdWRpb0J1ZmZlcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0c1tzbmQubmFtZV0gPSBidWZmZXI7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgICAgIHVuZGVmaW5lZCwgLy8gb25Qcm9ncmVzc1xyXG4gICAgICAgICAgICAgICAgICAgIChlcnI6IEVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIGxvYWRpbmcgc291bmQgJHtzbmQubmFtZX06YCwgZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJBbGwgYXNzZXRzIGxvYWRlZC5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cFNjZW5lKCk6IHZvaWQge1xyXG4gICAgICAgIC8vIFNjZW5lXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG5cclxuICAgICAgICAvLyBDYW1lcmFcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYSg3NSwgd2luZG93LmlubmVyV2lkdGggLyB3aW5kb3cuaW5uZXJIZWlnaHQsIDAuMSwgMTAwMCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24uc2V0KDAsIDIsIDApOyAvLyBQbGF5ZXIgaW5pdGlhbCBwb3NpdGlvbiBzbGlnaHRseSBhYm92ZSBncm91bmRcclxuXHJcbiAgICAgICAgLy8gUmVuZGVyZXJcclxuICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IHRoaXMuY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHdpbmRvdy5pbm5lcldpZHRoLCB3aW5kb3cuaW5uZXJIZWlnaHQpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Q2xlYXJDb2xvcihuZXcgVEhSRUUuQ29sb3IodGhpcy5jb25maWcuY29sb3JzLnNreUNvbG9yKSk7XHJcblxyXG4gICAgICAgIC8vIEF1ZGlvIExpc3RlbmVyXHJcbiAgICAgICAgdGhpcy5hdWRpb0xpc3RlbmVyID0gbmV3IFRIUkVFLkF1ZGlvTGlzdGVuZXIoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hZGQodGhpcy5hdWRpb0xpc3RlbmVyKTtcclxuXHJcbiAgICAgICAgLy8gTGlnaHRpbmdcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4NjY2NjY2KSk7XHJcbiAgICAgICAgY29uc3QgZGlyTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC44KTtcclxuICAgICAgICBkaXJMaWdodC5wb3NpdGlvbi5zZXQoMTAsIDIwLCAxMCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoZGlyTGlnaHQpO1xyXG5cclxuICAgICAgICAvLyBTa3lib3hcclxuICAgICAgICBjb25zdCBza3lib3hJbWFnZU5hbWVzID0gWydza3lib3hfcHgnLCAnc2t5Ym94X254JywgJ3NreWJveF9weScsICdza3lib3hfbnknLCAnc2t5Ym94X3B6JywgJ3NreWJveF9ueiddO1xyXG4gICAgICAgIGNvbnN0IG1hdGVyaWFscyA9IHNreWJveEltYWdlTmFtZXMubWFwKG5hbWUgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBhc3NldCA9IHRoaXMuYXNzZXRzW25hbWVdO1xyXG4gICAgICAgICAgICBpZiAoYXNzZXQgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgbWFwOiBhc3NldCwgc2lkZTogVEhSRUUuQmFja1NpZGUgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy8gRmFsbGJhY2s6IHVzZSBza3lDb2xvciBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHsgY29sb3I6IG5ldyBUSFJFRS5Db2xvcih0aGlzLmNvbmZpZy5jb2xvcnMuc2t5Q29sb3IpLCBzaWRlOiBUSFJFRS5CYWNrU2lkZSB9KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBza3lib3ggPSBuZXcgVEhSRUUuTWVzaChuZXcgVEhSRUUuQm94R2VvbWV0cnkoMTAwMCwgMTAwMCwgMTAwMCksIG1hdGVyaWFscyk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoc2t5Ym94KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwUGh5c2ljcygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG4gICAgICAgIHRoaXMud29ybGQuZ3Jhdml0eS5zZXQoMCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyYXZpdHksIDApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYnJvYWRwaGFzZSA9IG5ldyBDQU5OT04uU0FQQnJvYWRwaGFzZSh0aGlzLndvcmxkKTsgLy8gUGVyZm9ybWFuY2UgaW1wcm92ZW1lbnRcclxuICAgICAgICB0aGlzLndvcmxkLmFsbG93U2xlZXAgPSB0cnVlOyAvLyBPYmplY3RzIGNhbiBcInNsZWVwXCIgd2hlbiBub3QgbW92aW5nXHJcblxyXG4gICAgICAgIC8vIFBoeXNpY3MgbWF0ZXJpYWxzXHJcbiAgICAgICAgY29uc3QgZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKFwiZ3JvdW5kTWF0ZXJpYWxcIik7XHJcbiAgICAgICAgY29uc3QgcGxheWVyTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKFwicGxheWVyTWF0ZXJpYWxcIik7XHJcbiAgICAgICAgY29uc3QgZW5lbXlNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoXCJlbmVteU1hdGVyaWFsXCIpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbChcImJ1bGxldE1hdGVyaWFsXCIpO1xyXG5cclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChncm91bmRNYXRlcmlhbCwgcGxheWVyTWF0ZXJpYWwsIHsgZnJpY3Rpb246IDAuMSwgcmVzdGl0dXRpb246IDAuMCB9KSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwobmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoZ3JvdW5kTWF0ZXJpYWwsIGVuZW15TWF0ZXJpYWwsIHsgZnJpY3Rpb246IDAuNSwgcmVzdGl0dXRpb246IDAuMCB9KSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwobmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwocGxheWVyTWF0ZXJpYWwsIGVuZW15TWF0ZXJpYWwsIHsgZnJpY3Rpb246IDAuMCwgcmVzdGl0dXRpb246IDAuMCB9KSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwobmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoYnVsbGV0TWF0ZXJpYWwsIGVuZW15TWF0ZXJpYWwsIHsgZnJpY3Rpb246IDAuMCwgcmVzdGl0dXRpb246IDAuMCB9KSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwobmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoYnVsbGV0TWF0ZXJpYWwsIGdyb3VuZE1hdGVyaWFsLCB7IGZyaWN0aW9uOiAwLjAsIHJlc3RpdHV0aW9uOiAwLjUgfSkpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKGJ1bGxldE1hdGVyaWFsLCBidWxsZXRNYXRlcmlhbCwgeyBmcmljdGlvbjogMC4wLCByZXN0aXR1dGlvbjogMC41IH0pKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9ICdQTEFZSU5HJztcclxuICAgICAgICB0aGlzLmhpZGVUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgIHRoaXMuc2hvd0hVRCgpO1xyXG4gICAgICAgIHRoaXMucGxheWVySGVhbHRoID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckhlYWx0aDtcclxuICAgICAgICB0aGlzLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLmVuZW1pZXNBbGl2ZSA9IDA7XHJcbiAgICAgICAgdGhpcy5idWxsZXRzID0gW107XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gW107XHJcbiAgICAgICAgdGhpcy5rZXlzID0ge307XHJcbiAgICAgICAgdGhpcy5jYW5KdW1wID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gQ2xlYXIgZXhpc3Rpbmcgb2JqZWN0cyBmcm9tIHNjZW5lIGFuZCB3b3JsZFxyXG4gICAgICAgIHRoaXMuY2xlYXJHYW1lT2JqZWN0cygpO1xyXG5cclxuICAgICAgICB0aGlzLmNyZWF0ZUZsb29yKCk7XHJcbiAgICAgICAgdGhpcy5jcmVhdGVXYWxscygpO1xyXG4gICAgICAgIHRoaXMuY3JlYXRlUGxheWVyKCk7XHJcbiAgICAgICAgdGhpcy5jcmVhdGVFbmVtaWVzKHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteUNvdW50KTtcclxuXHJcbiAgICAgICAgdGhpcy5zdGFydEJHTSgpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlVUkoKTtcclxuXHJcbiAgICAgICAgLy8gUmVxdWVzdCBwb2ludGVyIGxvY2sgdG8gc3RhcnQgRlBTIGNvbnRyb2xzXHJcbiAgICAgICAgdGhpcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgICB0aGlzLmxhc3RUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuc3RhcnRHYW1lKCk7IC8vIFJlLWluaXRpYWxpemUgYW5kIHN0YXJ0IGEgbmV3IGdhbWVcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNsZWFyR2FtZU9iamVjdHMoKTogdm9pZCB7XHJcbiAgICAgICAgLy8gUmVtb3ZlIG9sZCBwaHlzaWNzIGJvZGllc1xyXG4gICAgICAgIHRoaXMud29ybGQuYm9kaWVzLmZvckVhY2goYm9keSA9PiB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYm9keSkpO1xyXG4gICAgICAgIC8vIFJlbW92ZSBvbGQgbWVzaGVzIChleGNlcHQgc2t5Ym94LCBsaWdodCwgY2FtZXJhLCBldGMuKVxyXG4gICAgICAgIGNvbnN0IG9iamVjdHNUb1JlbW92ZSA9IHRoaXMuc2NlbmUuY2hpbGRyZW4uZmlsdGVyKG9iaiA9PlxyXG4gICAgICAgICAgICBvYmogIT09IHRoaXMuY2FtZXJhICYmIG9iaiAhPT0gdGhpcy5hdWRpb0xpc3RlbmVyICYmXHJcbiAgICAgICAgICAgIG9iaiBpbnN0YW5jZW9mIFRIUkVFLk1lc2ggJiYgIShvYmouZ2VvbWV0cnkgaW5zdGFuY2VvZiBUSFJFRS5Cb3hHZW9tZXRyeSAmJiBBcnJheS5pc0FycmF5KG9iai5tYXRlcmlhbCkgJiYgb2JqLm1hdGVyaWFsLmV2ZXJ5KG0gPT4gbSBpbnN0YW5jZW9mIFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsICYmIG0uc2lkZSA9PT0gVEhSRUUuQmFja1NpZGUpKSAvLyBLZWVwIHNreWJveFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgb2JqZWN0c1RvUmVtb3ZlLmZvckVhY2gob2JqID0+IHRoaXMuc2NlbmUucmVtb3ZlKG9iaikpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYXllcigpOiB2b2lkIHtcclxuICAgICAgICAvLyBQbGF5ZXIgYm9keSAoY2Fwc3VsZSBmb3IgYmV0dGVyIGdyb3VuZCBjb250YWN0KVxyXG4gICAgICAgIGNvbnN0IHBsYXllclNoYXBlID0gbmV3IENBTk5PTi5DeWxpbmRlcigwLjUsIDAuNSwgMS44LCAxNik7IC8vIHJhZGl1c1RvcCwgcmFkaXVzQm90dG9tLCBoZWlnaHQsIHNlZ21lbnRzXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogNSwgc2hhcGU6IHBsYXllclNoYXBlLCBsaW5lYXJEYW1waW5nOiAwLjksIGFuZ3VsYXJEYW1waW5nOiAwLjkgfSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnNldCgwLCAxMCwgMCk7IC8vIFNwYXduIHNsaWdodGx5IGluIGFpciB0byBmYWxsIG9udG8gZ3JvdW5kXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LmZpeGVkUm90YXRpb24gPSB0cnVlOyAvLyBQcmV2ZW50IHBsYXllciBmcm9tIHRpcHBpbmcgb3ZlclxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS51cGRhdGVNYXNzUHJvcGVydGllcygpO1xyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS5jb2xsaXNpb25GaWx0ZXJHcm91cCA9IHRoaXMuQ09MTElTSU9OX0dST1VQUy5QTEFZRVI7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LmNvbGxpc2lvbkZpbHRlck1hc2sgPSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuR1JPVU5EIHwgdGhpcy5DT0xMSVNJT05fR1JPVVBTLkVORU1ZIHwgdGhpcy5DT0xMSVNJT05fR1JPVVBTLldBTEw7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMucGxheWVyQm9keSk7XHJcblxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS5hZGRFdmVudExpc3RlbmVyKFwiY29sbGlkZVwiLCAoZXZlbnQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQuYm9keSA9PT0gdGhpcy5mbG9vckJvZHkpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FuSnVtcCA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gUG9pbnRlckxvY2tDb250cm9sc1xyXG4gICAgICAgIHRoaXMuY29udHJvbHMgPSBuZXcgUG9pbnRlckxvY2tDb250cm9scyh0aGlzLmNhbWVyYSwgZG9jdW1lbnQuYm9keSk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5jb250cm9scy5vYmplY3QpOyAvLyBUaGUgY29udHJvbHMgb2JqZWN0IGlzIGEgVEhSRUUuT2JqZWN0M0QgY29udGFpbmluZyB0aGUgY2FtZXJhXHJcblxyXG4gICAgICAgIC8vIERlYnVnIHBsYXllciBtZXNoIChpbnZpc2libGUgaW4gYWN0dWFsIGdhbWUsIGJ1dCBjYW4gYmUgdXNlZnVsIGZvciBkZXYpXHJcbiAgICAgICAgY29uc3QgcGxheWVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQ3lsaW5kZXJHZW9tZXRyeSgwLjUsIDAuNSwgMS44LCAxNik7XHJcbiAgICAgICAgY29uc3QgcGxheWVyTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBjb2xvcjogbmV3IFRIUkVFLkNvbG9yKHRoaXMuY29uZmlnLmNvbG9ycy5wbGF5ZXJDb2xvciksIHdpcmVmcmFtZTogdHJ1ZSwgdHJhbnNwYXJlbnQ6IHRydWUsIG9wYWNpdHk6IDAgfSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLnBsYXllck1lc2gpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlRmxvb3IoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZmxvb3JTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZsb29yU2l6ZTtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlQXNzZXQgPSB0aGlzLmFzc2V0c1snZmxvb3JUZXh0dXJlJ107XHJcbiAgICAgICAgbGV0IGZsb29yVGV4dHVyZTogVEhSRUUuVGV4dHVyZSB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKHRleHR1cmVBc3NldCBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUpIHtcclxuICAgICAgICAgICAgZmxvb3JUZXh0dXJlID0gdGV4dHVyZUFzc2V0O1xyXG4gICAgICAgICAgICBmbG9vclRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgZmxvb3JUZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgIGZsb29yVGV4dHVyZS5yZXBlYXQuc2V0KGZsb29yU2l6ZSAvIDUsIGZsb29yU2l6ZSAvIDUpOyAvLyBSZXBlYXQgdGV4dHVyZSBiYXNlZCBvbiBmbG9vciBzaXplXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBmbG9vckdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KGZsb29yU2l6ZSwgMSwgZmxvb3JTaXplKTtcclxuICAgICAgICBjb25zdCBmbG9vck1hdGVyaWFsT3B0aW9uczogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbFBhcmFtZXRlcnMgPSB7fTtcclxuICAgICAgICBpZiAoZmxvb3JUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGZsb29yTWF0ZXJpYWxPcHRpb25zLm1hcCA9IGZsb29yVGV4dHVyZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmbG9vck1hdGVyaWFsT3B0aW9ucy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcih0aGlzLmNvbmZpZy5jb2xvcnMuZmxvb3JDb2xvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGZsb29yTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbChmbG9vck1hdGVyaWFsT3B0aW9ucyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZmxvb3JNZXNoID0gbmV3IFRIUkVFLk1lc2goZmxvb3JHZW9tZXRyeSwgZmxvb3JNYXRlcmlhbCk7XHJcbiAgICAgICAgZmxvb3JNZXNoLnBvc2l0aW9uLnkgPSAtMC41OyAvLyBQbGFjZSBmbG9vciBib3R0b20gYXQgeT0wXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoZmxvb3JNZXNoKTtcclxuXHJcbiAgICAgICAgdGhpcy5mbG9vckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwIH0pOyAvLyBTdGF0aWMgYm9keVxyXG4gICAgICAgIHRoaXMuZmxvb3JCb2R5LmFkZFNoYXBlKG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhmbG9vclNpemUgLyAyLCAwLjUsIGZsb29yU2l6ZSAvIDIpKSk7XHJcbiAgICAgICAgdGhpcy5mbG9vckJvZHkucG9zaXRpb24ueSA9IC0wLjU7XHJcbiAgICAgICAgdGhpcy5mbG9vckJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuR1JPVU5EO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmZsb29yQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVXYWxscygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmbG9vclNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZmxvb3JTaXplO1xyXG4gICAgICAgIGNvbnN0IHdhbGxIZWlnaHQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Mud2FsbEhlaWdodDtcclxuICAgICAgICBjb25zdCB3YWxsVGhpY2tuZXNzID0gMTtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlQXNzZXQgPSB0aGlzLmFzc2V0c1snd2FsbFRleHR1cmUnXTtcclxuICAgICAgICBsZXQgd2FsbFRleHR1cmU6IFRIUkVFLlRleHR1cmUgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmICh0ZXh0dXJlQXNzZXQgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIHdhbGxUZXh0dXJlID0gdGV4dHVyZUFzc2V0O1xyXG4gICAgICAgICAgICB3YWxsVGV4dHVyZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgICAgICB3YWxsVGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgICAgICAvLyBFeGFtcGxlOiBBZGp1c3QgcmVwZWF0IGJhc2VkIG9uIHdhbGwgZGltZW5zaW9uc1xyXG4gICAgICAgICAgICAvLyB3YWxsVGV4dHVyZS5yZXBlYXQuc2V0KGZsb29yU2l6ZSAvIDUsIHdhbGxIZWlnaHQgLyA1KTsgXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCB3YWxsTWF0ZXJpYWxPcHRpb25zOiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsUGFyYW1ldGVycyA9IHt9O1xyXG4gICAgICAgIGlmICh3YWxsVGV4dHVyZSkge1xyXG4gICAgICAgICAgICB3YWxsTWF0ZXJpYWxPcHRpb25zLm1hcCA9IHdhbGxUZXh0dXJlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHdhbGxNYXRlcmlhbE9wdGlvbnMuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IodGhpcy5jb25maWcuY29sb3JzLndhbGxDb2xvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHdhbGxNYXRlcmlhbE9wdGlvbnMpO1xyXG5cclxuICAgICAgICBjb25zdCBjcmVhdGVXYWxsID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHN4OiBudW1iZXIsIHN5OiBudW1iZXIsIHN6OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgd2FsbEdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHN4LCBzeSwgc3opO1xyXG4gICAgICAgICAgICBjb25zdCB3YWxsTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHdhbGxHZW9tZXRyeSwgd2FsbE1hdGVyaWFsKTtcclxuICAgICAgICAgICAgd2FsbE1lc2gucG9zaXRpb24uc2V0KHgsIHksIHopO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZCh3YWxsTWVzaCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB3YWxsQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAgfSk7XHJcbiAgICAgICAgICAgIHdhbGxCb2R5LmFkZFNoYXBlKG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhzeCAvIDIsIHN5IC8gMiwgc3ogLyAyKSkpO1xyXG4gICAgICAgICAgICB3YWxsQm9keS5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XHJcbiAgICAgICAgICAgIHdhbGxCb2R5LmNvbGxpc2lvbkZpbHRlckdyb3VwID0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLldBTEw7XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh3YWxsQm9keSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gRnJvbnQgd2FsbFxyXG4gICAgICAgIGNyZWF0ZVdhbGwoMCwgd2FsbEhlaWdodCAvIDIsIC1mbG9vclNpemUgLyAyLCBmbG9vclNpemUsIHdhbGxIZWlnaHQsIHdhbGxUaGlja25lc3MpO1xyXG4gICAgICAgIC8vIEJhY2sgd2FsbFxyXG4gICAgICAgIGNyZWF0ZVdhbGwoMCwgd2FsbEhlaWdodCAvIDIsIGZsb29yU2l6ZSAvIDIsIGZsb29yU2l6ZSwgd2FsbEhlaWdodCwgd2FsbFRoaWNrbmVzcyk7XHJcbiAgICAgICAgLy8gTGVmdCB3YWxsXHJcbiAgICAgICAgY3JlYXRlV2FsbCgtZmxvb3JTaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDAsIHdhbGxUaGlja25lc3MsIHdhbGxIZWlnaHQsIGZsb29yU2l6ZSk7XHJcbiAgICAgICAgLy8gUmlnaHQgd2FsbFxyXG4gICAgICAgIGNyZWF0ZVdhbGwoZmxvb3JTaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDAsIHdhbGxUaGlja25lc3MsIHdhbGxIZWlnaHQsIGZsb29yU2l6ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVFbmVtaWVzKGNvdW50OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmbG9vclNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZmxvb3JTaXplO1xyXG4gICAgICAgIGNvbnN0IHNwYXduQXJlYSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5pbml0aWFsU3Bhd25BcmVhO1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVBc3NldCA9IHRoaXMuYXNzZXRzWydlbmVteVRleHR1cmUnXTtcclxuICAgICAgICBsZXQgZW5lbXlUZXh0dXJlOiBUSFJFRS5UZXh0dXJlIHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIGlmICh0ZXh0dXJlQXNzZXQgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGVuZW15VGV4dHVyZSA9IHRleHR1cmVBc3NldDtcclxuICAgICAgICAgICAgZW5lbXlUZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgIGVuZW15VGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZW5lbXlSYWRpdXMgPSAwLjg7XHJcbiAgICAgICAgY29uc3QgZW5lbXlIZWlnaHQgPSAxLjY7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCB4ID0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogc3Bhd25BcmVhO1xyXG4gICAgICAgICAgICBjb25zdCB6ID0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogc3Bhd25BcmVhO1xyXG4gICAgICAgICAgICBjb25zdCB5ID0gZW5lbXlIZWlnaHQgLyAyOyAvLyBTcGF3biBlbmVtaWVzIHNsaWdodGx5IGFib3ZlIGdyb3VuZFxyXG5cclxuICAgICAgICAgICAgY29uc3QgZW5lbXlHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShlbmVteVJhZGl1cyAqIDIsIGVuZW15SGVpZ2h0LCBlbmVteVJhZGl1cyAqIDIpO1xyXG4gICAgICAgICAgICBjb25zdCBlbmVteU1hdGVyaWFsT3B0aW9uczogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbFBhcmFtZXRlcnMgPSB7fTtcclxuICAgICAgICAgICAgaWYgKGVuZW15VGV4dHVyZSkge1xyXG4gICAgICAgICAgICAgICAgZW5lbXlNYXRlcmlhbE9wdGlvbnMubWFwID0gZW5lbXlUZXh0dXJlO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZW5lbXlNYXRlcmlhbE9wdGlvbnMuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IodGhpcy5jb25maWcuY29sb3JzLmVuZW15Q29sb3IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15TWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbChlbmVteU1hdGVyaWFsT3B0aW9ucyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBlbmVteU1lc2ggPSBuZXcgVEhSRUUuTWVzaChlbmVteUdlb21ldHJ5LCBlbmVteU1hdGVyaWFsKTtcclxuICAgICAgICAgICAgZW5lbXlNZXNoLnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQoZW5lbXlNZXNoKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15U2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoZW5lbXlSYWRpdXMsIGVuZW15SGVpZ2h0IC8gMiwgZW5lbXlSYWRpdXMpKTtcclxuICAgICAgICAgICAgY29uc3QgZW5lbXlCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMTAsIHNoYXBlOiBlbmVteVNoYXBlLCBsaW5lYXJEYW1waW5nOiAwLjksIGFuZ3VsYXJEYW1waW5nOiAwLjkgfSk7XHJcbiAgICAgICAgICAgIGVuZW15Qm9keS5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XHJcbiAgICAgICAgICAgIGVuZW15Qm9keS5maXhlZFJvdGF0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgZW5lbXlCb2R5LmNvbGxpc2lvbkZpbHRlckdyb3VwID0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLkVORU1ZO1xyXG4gICAgICAgICAgICBlbmVteUJvZHkuY29sbGlzaW9uRmlsdGVyTWFzayA9IHRoaXMuQ09MTElTSU9OX0dST1VQUy5HUk9VTkQgfCB0aGlzLkNPTExJU0lPTl9HUk9VUFMuUExBWUVSIHwgdGhpcy5DT0xMSVNJT05fR1JPVVBTLkJVTExFVCB8IHRoaXMuQ09MTElTSU9OX0dST1VQUy5XQUxMO1xyXG4gICAgICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoZW5lbXlCb2R5KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIG1lc2g6IGVuZW15TWVzaCxcclxuICAgICAgICAgICAgICAgIGJvZHk6IGVuZW15Qm9keSxcclxuICAgICAgICAgICAgICAgIGhlYWx0aDogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SGVhbHRoLFxyXG4gICAgICAgICAgICAgICAgbGFzdEF0dGFja1RpbWU6IDAsXHJcbiAgICAgICAgICAgICAgICBhdHRhY2tDb29sZG93bjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15QXR0YWNrQ29vbGRvd25cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllc0FsaXZlKys7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYW5pbWF0ZSh0aW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgIT09ICdQTEFZSU5HJykge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBkdCA9ICh0aW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwO1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAoZHQgPiAxIC8gMzApIHsgLy8gQ2FwIGRlbHRhIHRpbWUgdG8gcHJldmVudCBwaHlzaWNzIGdsaXRjaGVzIHdpdGggdmVyeSBsYXJnZSBkdFxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnN0ZXAoMSAvIDYwLCBkdCwgMyk7IC8vIEZpeGVkIHRpbWUgc3RlcCBmb3IgcGh5c2ljc1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuc3RlcCgxIC8gNjAsIGR0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBtb3ZlbWVudFxyXG4gICAgICAgIHRoaXMuaGFuZGxlUGxheWVyTW92ZW1lbnQoZHQpO1xyXG5cclxuICAgICAgICAvLyBTeW5jIFRocmVlLmpzIGNhbWVyYSB3aXRoIENhbm5vbi5qcyBwbGF5ZXIgYm9keVxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSArPSAwLjg7IC8vIEFkanVzdCBjYW1lcmEgdG8gJ2V5ZSBsZXZlbCdcclxuICAgICAgICBpZiAodGhpcy5wbGF5ZXJNZXNoKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5xdWF0ZXJuaW9uIGFzIGFueSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgZW5lbWllc1xyXG4gICAgICAgIHRoaXMudXBkYXRlRW5lbWllcyhkdCk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBidWxsZXRzXHJcbiAgICAgICAgdGhpcy51cGRhdGVCdWxsZXRzKGR0KTtcclxuXHJcbiAgICAgICAgLy8gUmVuZGVyXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIodGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgVUlcclxuICAgICAgICB0aGlzLnVwZGF0ZVVJKCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5ZXJNb3ZlbWVudChkdDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbnRyb2xzLmlzTG9ja2VkKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGlucHV0VmVsb2NpdHkgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllclNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlXJ10pIGlucHV0VmVsb2NpdHkueiAtPSBwbGF5ZXJTcGVlZDtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlTJ10pIGlucHV0VmVsb2NpdHkueiArPSBwbGF5ZXJTcGVlZDtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlBJ10pIGlucHV0VmVsb2NpdHkueCAtPSBwbGF5ZXJTcGVlZDtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlEJ10pIGlucHV0VmVsb2NpdHkueCArPSBwbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaW5wdXQgdmVsb2NpdHkgaW4gY2FtZXJhIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IHBsYXllckRpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24ocGxheWVyRGlyZWN0aW9uKTsgLy8gR2V0IGZvcndhcmQgZGlyZWN0aW9uIG9mIGNhbWVyYVxyXG4gICAgICAgIHBsYXllckRpcmVjdGlvbi55ID0gMDsgLy8gRG9uJ3QgbW92ZSB1cC9kb3duIGZyb20gY2FtZXJhIHBpdGNoXHJcbiAgICAgICAgcGxheWVyRGlyZWN0aW9uLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICBjb25zdCByaWdodERpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgcmlnaHREaXJlY3Rpb24uY3Jvc3NWZWN0b3JzKHRoaXMuY2FtZXJhLnVwLCBwbGF5ZXJEaXJlY3Rpb24pOyAvLyBHZXQgcmlnaHQgZGlyZWN0aW9uXHJcblxyXG4gICAgICAgIGNvbnN0IGZpbmFsVmVsb2NpdHkgPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlXJ10gfHwgdGhpcy5rZXlzWydLZXlTJ10pIHtcclxuICAgICAgICAgICAgZmluYWxWZWxvY2l0eS54ICs9IHBsYXllckRpcmVjdGlvbi54ICogaW5wdXRWZWxvY2l0eS56O1xyXG4gICAgICAgICAgICBmaW5hbFZlbG9jaXR5LnogKz0gcGxheWVyRGlyZWN0aW9uLnogKiBpbnB1dFZlbG9jaXR5Lno7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ0tleUEnXSB8fCB0aGlzLmtleXNbJ0tleUQnXSkge1xyXG4gICAgICAgICAgICBmaW5hbFZlbG9jaXR5LnggKz0gcmlnaHREaXJlY3Rpb24ueCAqIGlucHV0VmVsb2NpdHkueDtcclxuICAgICAgICAgICAgZmluYWxWZWxvY2l0eS56ICs9IHJpZ2h0RGlyZWN0aW9uLnogKiBpbnB1dFZlbG9jaXR5Lng7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQcmVzZXJ2ZSBjdXJyZW50IHZlcnRpY2FsIHZlbG9jaXR5IChncmF2aXR5LCBqdW1wcylcclxuICAgICAgICBjb25zdCBjdXJyZW50WVZlbG9jaXR5ID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lnk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnNldChmaW5hbFZlbG9jaXR5LngsIGN1cnJlbnRZVmVsb2NpdHksIGZpbmFsVmVsb2NpdHkueik7XHJcblxyXG4gICAgICAgIC8vIEp1bXBcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydTcGFjZSddICYmIHRoaXMuY2FuSnVtcCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJKdW1wRm9yY2U7XHJcbiAgICAgICAgICAgIHRoaXMuY2FuSnVtcCA9IGZhbHNlOyAvLyBQcmV2ZW50IG11bHRpcGxlIGp1bXBzXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmNvZGVdID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQuY29kZV0gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTW91c2VEb3duKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSAnUExBWUlORycgJiYgdGhpcy5jb250cm9scy5pc0xvY2tlZCkge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQuYnV0dG9uID09PSAwKSB7IC8vIExlZnQgY2xpY2tcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlyZUJ1bGxldCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Qb2ludGVyTG9ja0NoYW5nZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29udHJvbHMuaXNMb2NrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlckxvY2tDb250cm9sczogTG9ja2VkJyk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gJ1BMQVlJTkcnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVNvdW5kPy5wbGF5KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRyb2xzLmlzTG9ja2VkID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyTG9ja0NvbnRyb2xzOiBVbmxvY2tlZCcpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09ICdQTEFZSU5HJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZD8ucGF1c2UoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uUG9pbnRlckxvY2tFcnJvcigpOiB2b2lkIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdQb2ludGVyTG9ja0NvbnRyb2xzOiBFcnJvcicpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVxdWVzdFBvaW50ZXJMb2NrKCk6IHZvaWQge1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBmaXJlQnVsbGV0KCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldFNwZWVkO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldExpZmV0aW1lID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldExpZmV0aW1lO1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVBc3NldCA9IHRoaXMuYXNzZXRzWydidWxsZXRUZXh0dXJlJ107XHJcbiAgICAgICAgbGV0IGJ1bGxldFRleHR1cmU6IFRIUkVFLlRleHR1cmUgfCB1bmRlZmluZWQ7XHJcbiAgICAgICAgaWYgKHRleHR1cmVBc3NldCBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUpIHtcclxuICAgICAgICAgICAgYnVsbGV0VGV4dHVyZSA9IHRleHR1cmVBc3NldDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1bGxldEdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KDAuMiwgOCwgOCk7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWF0ZXJpYWxPcHRpb25zOiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsUGFyYW1ldGVycyA9IHt9O1xyXG4gICAgICAgIGlmIChidWxsZXRUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGJ1bGxldE1hdGVyaWFsT3B0aW9ucy5tYXAgPSBidWxsZXRUZXh0dXJlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGJ1bGxldE1hdGVyaWFsT3B0aW9ucy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcih0aGlzLmNvbmZpZy5jb2xvcnMuYnVsbGV0Q29sb3IpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBidWxsZXRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKGJ1bGxldE1hdGVyaWFsT3B0aW9ucyk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1bGxldE1lc2ggPSBuZXcgVEhSRUUuTWVzaChidWxsZXRHZW9tZXRyeSwgYnVsbGV0TWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGJ1bGxldE1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCBidWxsZXRTaGFwZSA9IG5ldyBDQU5OT04uU3BoZXJlKDAuMik7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0Qm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAuMSwgc2hhcGU6IGJ1bGxldFNoYXBlIH0pO1xyXG4gICAgICAgIGJ1bGxldEJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuQlVMTEVUO1xyXG4gICAgICAgIGJ1bGxldEJvZHkuY29sbGlzaW9uRmlsdGVyTWFzayA9IHRoaXMuQ09MTElTSU9OX0dST1VQUy5FTkVNWSB8IHRoaXMuQ09MTElTSU9OX0dST1VQUy5HUk9VTkQgfCB0aGlzLkNPTExJU0lPTl9HUk9VUFMuV0FMTDtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYnVsbGV0Qm9keSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJheWNhc3RlciA9IG5ldyBUSFJFRS5SYXljYXN0ZXIodGhpcy5jYW1lcmEucG9zaXRpb24sIHRoaXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpKTtcclxuICAgICAgICBjb25zdCBidWxsZXRTcGF3bk9mZnNldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgcmF5Y2FzdGVyLnJheS5hdCgwLjUsIGJ1bGxldFNwYXduT2Zmc2V0KTsgLy8gU3Bhd24gYnVsbGV0IHNsaWdodGx5IGluIGZyb250IG9mIGNhbWVyYVxyXG5cclxuICAgICAgICBidWxsZXRCb2R5LnBvc2l0aW9uLmNvcHkoYnVsbGV0U3Bhd25PZmZzZXQgYXMgYW55KTtcclxuXHJcbiAgICAgICAgY29uc3QgYnVsbGV0RGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZERpcmVjdGlvbihidWxsZXREaXJlY3Rpb24pO1xyXG4gICAgICAgIGJ1bGxldEJvZHkudmVsb2NpdHkuY29weShidWxsZXREaXJlY3Rpb24ubXVsdGlwbHlTY2FsYXIoYnVsbGV0U3BlZWQpIGFzIGFueSk7XHJcblxyXG4gICAgICAgIGJ1bGxldEJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcImNvbGxpZGVcIiwgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmJvZHkubWFzcyA9PT0gMCB8fCBldmVudC5ib2R5LmNvbGxpc2lvbkZpbHRlckdyb3VwID09PSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuR1JPVU5EIHx8IGV2ZW50LmJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPT09IHRoaXMuQ09MTElTSU9OX0dST1VQUy5XQUxMKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBIaXQgZ3JvdW5kIG9yIHdhbGwsIGp1c3QgcmVtb3ZlIGJ1bGxldFxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVCdWxsZXQoYnVsbGV0Qm9keSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQuYm9keS5jb2xsaXNpb25GaWx0ZXJHcm91cCA9PT0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLkVORU1ZKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBoaXRFbmVteSA9IHRoaXMuZW5lbWllcy5maW5kKGUgPT4gZS5ib2R5ID09PSBldmVudC5ib2R5KTtcclxuICAgICAgICAgICAgICAgIGlmIChoaXRFbmVteSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW5lbXlUYWtlRGFtYWdlKGhpdEVuZW15LCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0RGFtYWdlKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQnVsbGV0KGJ1bGxldEJvZHkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuYnVsbGV0cy5wdXNoKHsgbWVzaDogYnVsbGV0TWVzaCwgYm9keTogYnVsbGV0Qm9keSwgbGlmZXRpbWU6IDAsIG1heExpZmV0aW1lOiBidWxsZXRMaWZldGltZSB9KTtcclxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnc2hvb3QnLCBidWxsZXRTcGF3bk9mZnNldCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW1vdmVCdWxsZXQoYm9keVRvUmVtb3ZlOiBDQU5OT04uQm9keSk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5idWxsZXRzLmZpbmRJbmRleChiID0+IGIuYm9keSA9PT0gYm9keVRvUmVtb3ZlKTtcclxuICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IHRoaXMuYnVsbGV0c1tpbmRleF07XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKGJ1bGxldC5tZXNoKTtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGJ1bGxldC5ib2R5KTtcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlQnVsbGV0cyhkdDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMuYnVsbGV0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICBjb25zdCBidWxsZXQgPSB0aGlzLmJ1bGxldHNbaV07XHJcbiAgICAgICAgICAgIGJ1bGxldC5saWZldGltZSArPSBkdDtcclxuXHJcbiAgICAgICAgICAgIGlmIChidWxsZXQubGlmZXRpbWUgPiBidWxsZXQubWF4TGlmZXRpbWUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQnVsbGV0KGJ1bGxldC5ib2R5KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5tZXNoLnBvc2l0aW9uLmNvcHkoYnVsbGV0LmJvZHkucG9zaXRpb24gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5tZXNoLnF1YXRlcm5pb24uY29weShidWxsZXQuYm9keS5xdWF0ZXJuaW9uIGFzIGFueSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVFbmVtaWVzKGR0OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBwbGF5ZXJQb3NpdGlvbiA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbjtcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5lbmVtaWVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15ID0gdGhpcy5lbmVtaWVzW2ldO1xyXG4gICAgICAgICAgICBpZiAoZW5lbXkuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgIC8vIEVuZW15IGFscmVhZHkgZGVhZCwgcmVtb3ZlIGl0XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShlbmVteS5tZXNoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShlbmVteS5ib2R5KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllcy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXNBbGl2ZS0tO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSAxMDA7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgnZW5lbXlEaWUnLCBlbmVteS5ib2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gU2ltcGxlIEFJOiBNb3ZlIHRvd2FyZHMgcGxheWVyXHJcbiAgICAgICAgICAgIGNvbnN0IGRpcmVjdGlvbiA9IG5ldyBDQU5OT04uVmVjMygpO1xyXG4gICAgICAgICAgICBwbGF5ZXJQb3NpdGlvbi52c3ViKGVuZW15LmJvZHkucG9zaXRpb24sIGRpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIGRpcmVjdGlvbi55ID0gMDsgLy8gT25seSBtb3ZlIG9uIGhvcml6b250YWwgcGxhbmVcclxuICAgICAgICAgICAgZGlyZWN0aW9uLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICAgICAgZW5lbXkuYm9keS52ZWxvY2l0eS54ID0gZGlyZWN0aW9uLnggKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlTcGVlZDtcclxuICAgICAgICAgICAgZW5lbXkuYm9keS52ZWxvY2l0eS56ID0gZGlyZWN0aW9uLnogKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlTcGVlZDtcclxuXHJcbiAgICAgICAgICAgIC8vIExvb2sgYXQgcGxheWVyICh2aXN1YWwgb25seSlcclxuICAgICAgICAgICAgZW5lbXkubWVzaC5sb29rQXQocGxheWVyUG9zaXRpb24ueCwgZW5lbXkubWVzaC5wb3NpdGlvbi55LCBwbGF5ZXJQb3NpdGlvbi56KTtcclxuXHJcbiAgICAgICAgICAgIC8vIFN5bmMgbWVzaCB3aXRoIGJvZHlcclxuICAgICAgICAgICAgZW5lbXkubWVzaC5wb3NpdGlvbi5jb3B5KGVuZW15LmJvZHkucG9zaXRpb24gYXMgYW55KTtcclxuICAgICAgICAgICAgZW5lbXkubWVzaC5xdWF0ZXJuaW9uLmNvcHkoZW5lbXkuYm9keS5xdWF0ZXJuaW9uIGFzIGFueSk7XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBmb3IgcGxheWVyIGF0dGFja1xyXG4gICAgICAgICAgICB0aGlzLmNoZWNrRW5lbXlBdHRhY2soZW5lbXksIGR0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmVuZW1pZXNBbGl2ZSA9PT0gMCAmJiB0aGlzLmdhbWVTdGF0ZSA9PT0gJ1BMQVlJTkcnKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGVuZW1pZXMgZGVmZWF0ZWQhXCIpO1xyXG4gICAgICAgICAgICAvLyBPcHRpb25hbGx5IHNwYXduIG1vcmUgZW5lbWllcyBvciBlbmQgZ2FtZVxyXG4gICAgICAgICAgICAvLyBGb3Igbm93LCBsZXQncyBqdXN0IG1ha2UgaXQgYSB3aW4gY29uZGl0aW9uIGlmIGFsbCBlbmVtaWVzIGFyZSBkZWZlYXRlZC5cclxuICAgICAgICAgICAgLy8gT3IsIHNwYXduIG1vcmUgYWZ0ZXIgYSBkZWxheS4gRm9yIHNpbXBsZSwgbGV0J3MganVzdCBlbmQgdGhlIGdhbWUuXHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjaGVja0VuZW15QXR0YWNrKGVuZW15OiBFbmVteSwgZHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGRpc3RhbmNlVG9QbGF5ZXIgPSBlbmVteS5ib2R5LnBvc2l0aW9uLmRpc3RhbmNlVG8odGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uKTtcclxuICAgICAgICBjb25zdCBhdHRhY2tSYW5nZSA9IDEuNTsgLy8gRGlzdGFuY2UgZm9yIGVuZW15IHRvIGF0dGFja1xyXG5cclxuICAgICAgICBpZiAoZGlzdGFuY2VUb1BsYXllciA8IGF0dGFja1JhbmdlKSB7XHJcbiAgICAgICAgICAgIGVuZW15Lmxhc3RBdHRhY2tUaW1lICs9IGR0O1xyXG4gICAgICAgICAgICBpZiAoZW5lbXkubGFzdEF0dGFja1RpbWUgPj0gZW5lbXkuYXR0YWNrQ29vbGRvd24pIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyVGFrZURhbWFnZSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlEYW1hZ2UpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ3BsYXllckh1cnQnLCB0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIGVuZW15Lmxhc3RBdHRhY2tUaW1lID0gMDsgLy8gUmVzZXQgY29vbGRvd25cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGVuZW15Lmxhc3RBdHRhY2tUaW1lID0gZW5lbXkuYXR0YWNrQ29vbGRvd247IC8vIFJlYWR5IHRvIGF0dGFjayBpbW1lZGlhdGVseSB3aGVuIGluIHJhbmdlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGxheWVyVGFrZURhbWFnZShkYW1hZ2U6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMucGxheWVySGVhbHRoIC09IGRhbWFnZTtcclxuICAgICAgICBpZiAodGhpcy5wbGF5ZXJIZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckhlYWx0aCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy51cGRhdGVVSSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZW5lbXlUYWtlRGFtYWdlKGVuZW15OiBFbmVteSwgZGFtYWdlOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBlbmVteS5oZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgIHRoaXMucGxheVNvdW5kKCdoaXQnLCBlbmVteS5ib2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgaWYgKGVuZW15LmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIC8vIE1hcmsgZm9yIHJlbW92YWwgaW4gdXBkYXRlRW5lbWllcyBsb29wXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRW5lbXkgZGVmZWF0ZWQhXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnVwZGF0ZVVJKCk7IC8vIFRvIHVwZGF0ZSBlbmVteSBjb3VudFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcGxheVNvdW5kKG5hbWU6IHN0cmluZywgcG9zaXRpb24/OiBUSFJFRS5WZWN0b3IzKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYnVmZmVyID0gdGhpcy5hc3NldHNbbmFtZV07XHJcbiAgICAgICAgaWYgKGJ1ZmZlciBpbnN0YW5jZW9mIEF1ZGlvQnVmZmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNvdW5kID0gbmV3IFRIUkVFLlBvc2l0aW9uYWxBdWRpbyh0aGlzLmF1ZGlvTGlzdGVuZXIpO1xyXG4gICAgICAgICAgICBzb3VuZC5zZXRCdWZmZXIoYnVmZmVyKTtcclxuICAgICAgICAgICAgY29uc3Qgc291bmRDb25maWcgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09IG5hbWUpO1xyXG4gICAgICAgICAgICBpZiAoc291bmRDb25maWcpIHtcclxuICAgICAgICAgICAgICAgIHNvdW5kLnNldFZvbHVtZSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZWZmZWN0Vm9sdW1lICogc291bmRDb25maWcudm9sdW1lKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgU291bmQgY29uZmlnIGZvciAke25hbWV9IG5vdCBmb3VuZCwgdXNpbmcgZGVmYXVsdCBlZmZlY3Qgdm9sdW1lLmApO1xyXG4gICAgICAgICAgICAgICAgc291bmQuc2V0Vm9sdW1lKHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lZmZlY3RWb2x1bWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHNvdW5kLnNldFJlZkRpc3RhbmNlKDUpOyAvLyBIb3cgZmFyIHRoZSBzb3VuZCBjYW4gYmUgaGVhcmRcclxuICAgICAgICAgICAgc291bmQuYXV0b3BsYXkgPSB0cnVlO1xyXG4gICAgICAgICAgICBzb3VuZC5zZXRMb29wKGZhbHNlKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbikge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb2JqZWN0ID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XHJcbiAgICAgICAgICAgICAgICBvYmplY3QucG9zaXRpb24uY29weShwb3NpdGlvbik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChvYmplY3QpO1xyXG4gICAgICAgICAgICAgICAgb2JqZWN0LmFkZChzb3VuZCk7XHJcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHsgLy8gUmVtb3ZlIHNvdW5kIG9iamVjdCBhZnRlciBhIHNob3J0IGRlbGF5XHJcbiAgICAgICAgICAgICAgICAgICAgc291bmQuZGlzY29ubmVjdCgpOyAvLyBEaXNjb25uZWN0IHNvdW5kIHNvdXJjZVxyXG4gICAgICAgICAgICAgICAgICAgIG9iamVjdC5yZW1vdmUoc291bmQpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKG9iamVjdCk7XHJcbiAgICAgICAgICAgICAgICB9LCAoKHNvdW5kQ29uZmlnPy5kdXJhdGlvbl9zZWNvbmRzIHx8IDEpICogMTAwMCkgKyA1MDApOyAvLyBBZGQgNTAwbXMgc2FmZXR5XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBJZiBubyBwb3NpdGlvbiwgcGxheSBhcyBub24tcG9zaXRpb25hbCBhdWRpbyAoZS5nLiwgVUkgc291bmRzKVxyXG4gICAgICAgICAgICAgICAgY29uc3QgZ2xvYmFsU291bmQgPSBuZXcgVEhSRUUuQXVkaW8odGhpcy5hdWRpb0xpc3RlbmVyKTtcclxuICAgICAgICAgICAgICAgIGdsb2JhbFNvdW5kLnNldEJ1ZmZlcihidWZmZXIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHNvdW5kQ29uZmlnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZ2xvYmFsU291bmQuc2V0Vm9sdW1lKHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lZmZlY3RWb2x1bWUgKiBzb3VuZENvbmZpZy52b2x1bWUpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kIGNvbmZpZyBmb3IgJHtuYW1lfSBub3QgZm91bmQsIHVzaW5nIGRlZmF1bHQgZWZmZWN0IHZvbHVtZS5gKTtcclxuICAgICAgICAgICAgICAgICAgICBnbG9iYWxTb3VuZC5zZXRWb2x1bWUodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVmZmVjdFZvbHVtZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBnbG9iYWxTb3VuZC5hdXRvcGxheSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBnbG9iYWxTb3VuZC5zZXRMb29wKGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIGdsb2JhbFNvdW5kLnBsYXkoKTtcclxuICAgICAgICAgICAgICAgIC8vIEZvciBub24tcG9zaXRpb25hbCBzb3VuZHMsIHdlIHNob3VsZCBhbHNvIG1hbmFnZSB0aGVpciBsaWZlY3ljbGUgaWYgdGhleSBhcmUgc2hvcnQtbGl2ZWQuXHJcbiAgICAgICAgICAgICAgICAvLyBGb3Igc2ltcGxpY2l0eSwgd2UgYXNzdW1lIHRoZXkgcGxheSBhbmQgZXZlbnR1YWxseSBnZXQgZ2FyYmFnZSBjb2xsZWN0ZWQuXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEJHTSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBiZ21CdWZmZXIgPSB0aGlzLmFzc2V0c1snYmdtJ107XHJcbiAgICAgICAgaWYgKGJnbUJ1ZmZlciBpbnN0YW5jZW9mIEF1ZGlvQnVmZmVyKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmJnbVNvdW5kKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVNvdW5kLnN0b3AoKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtU291bmQuZGlzY29ubmVjdCgpOyAvLyBEaXNjb25uZWN0IHByZXZpb3VzIHNvdW5kIHNvdXJjZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291bmQgPSBuZXcgVEhSRUUuQXVkaW8odGhpcy5hdWRpb0xpc3RlbmVyKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZC5zZXRCdWZmZXIoYmdtQnVmZmVyKTtcclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZC5zZXRMb29wKHRydWUpO1xyXG4gICAgICAgICAgICBjb25zdCBiZ21Db25maWcgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLmZpbmQocyA9PiBzLm5hbWUgPT09ICdiZ20nKTtcclxuICAgICAgICAgICAgaWYgKGJnbUNvbmZpZykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZC5zZXRWb2x1bWUodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm11c2ljVm9sdW1lICogYmdtQ29uZmlnLnZvbHVtZSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYEJHTSBjb25maWcgbm90IGZvdW5kLCB1c2luZyBkZWZhdWx0IG11c2ljIHZvbHVtZS5gKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtU291bmQuc2V0Vm9sdW1lKHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tdXNpY1ZvbHVtZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZC5wbGF5KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlVUkoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5oZWFsdGhGaWxsRWxlbWVudC5zdHlsZS53aWR0aCA9IGAke01hdGgubWF4KDAsIHRoaXMucGxheWVySGVhbHRoKX0lYDtcclxuICAgICAgICB0aGlzLnNjb3JlVmFsdWVFbGVtZW50LmlubmVyVGV4dCA9IHRoaXMuc2NvcmUudG9TdHJpbmcoKTtcclxuICAgICAgICB0aGlzLmVuZW1pZXNBbGl2ZVZhbHVlRWxlbWVudC5pbm5lclRleHQgPSB0aGlzLmVuZW1pZXNBbGl2ZS50b1N0cmluZygpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSAnR0FNRV9PVkVSJztcclxuICAgICAgICB0aGlzLnNob3dHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgIC8vIFJlbGVhc2UgcG9pbnRlciBsb2NrXHJcbiAgICAgICAgZG9jdW1lbnQuZXhpdFBvaW50ZXJMb2NrKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbldpbmRvd1Jlc2l6ZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHdpbmRvdy5pbm5lcldpZHRoLCB3aW5kb3cuaW5uZXJIZWlnaHQpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBHbG9iYWwgaW5pdGlhbGl6ZXIgZnVuY3Rpb24sIGNhbGxlZCBmcm9tIEhUTUxcclxuYXN5bmMgZnVuY3Rpb24gaW5pdEdhbWVGcm9tSFRNTCgpIHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGRhdGEuanNvbicpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgIGNvbnN0IGdhbWUgPSBuZXcgR2FtZSgnZ2FtZUNhbnZhcycsIGNvbmZpZyk7XHJcbiAgICBhd2FpdCBnYW1lLnN0YXJ0KCk7XHJcbn1cclxuXHJcbi8vIEVuc3VyZSB0aGUgaW5pdEdhbWVGcm9tSFRNTCBmdW5jdGlvbiBpcyBjYWxsZWQgd2hlbiB0aGUgRE9NIGlzIHJlYWR5XHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBpbml0R2FtZUZyb21IVE1MKTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsMkJBQTJCO0FBd0RwQyxNQUFNLEtBQUs7QUFBQSxFQStDUCxZQUFZLFVBQWtCLFlBQXdCO0FBdEN0RCxTQUFRLGFBQWdDO0FBR3hDLFNBQVEsV0FBbUI7QUFDM0IsU0FBUSxTQUFvQixDQUFDO0FBRTdCLFNBQVEsV0FBK0I7QUFFdkMsU0FBUSxVQUFvQixDQUFDO0FBQzdCLFNBQVEsVUFBbUIsQ0FBQztBQUM1QixTQUFRLFFBQWdCO0FBRXhCLFNBQVEsZUFBdUI7QUFrQi9CO0FBQUEsU0FBaUIsbUJBQW1CO0FBQUEsTUFDaEMsUUFBUTtBQUFBLE1BQ1IsUUFBUTtBQUFBLE1BQ1IsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsTUFBTTtBQUFBLElBQ1Y7QUFHSSxTQUFLLFNBQVM7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
