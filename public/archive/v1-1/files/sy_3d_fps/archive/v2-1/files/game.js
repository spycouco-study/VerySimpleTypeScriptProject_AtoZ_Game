import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
class Game {
  constructor(canvasId, configData) {
    this.playerMesh = null;
    this.lastTime = 0;
    this.assets = {};
    this.bgmSound = null;
    // Fix: Removed AudioBuffer generic type
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
    this.titleScreenElement = document.getElementById("titleScreen");
    this.gameOverScreenElement = document.getElementById("gameOverScreen");
    this.hudElement = document.getElementById("hud");
    this.healthFillElement = document.getElementById("healthFill");
    this.scoreValueElement = document.getElementById("scoreValue");
    this.enemiesAliveValueElement = document.getElementById("enemiesAliveValue");
    window.addEventListener("resize", this.onWindowResize.bind(this), false);
    document.addEventListener("keydown", this.onKeyDown.bind(this), false);
    document.addEventListener("keyup", this.onKeyUp.bind(this), false);
    document.addEventListener("mousedown", this.onMouseDown.bind(this), false);
    if (this.titleScreenElement) {
      this.titleScreenElement.addEventListener("click", this.onTitleScreenClick.bind(this), false);
    } else {
      console.warn("UI element #titleScreen not found. Title screen functionality may be impaired.");
    }
    if (this.gameOverScreenElement) {
      this.gameOverScreenElement.addEventListener("click", this.onGameOverScreenClick.bind(this), false);
    } else {
      console.warn("UI element #gameOverScreen not found. Game Over screen functionality may be impaired.");
    }
    this.setupScene();
    this.setupPhysics();
  }
  async start() {
    this.showTitleScreen();
    await this.preloadAssets();
    console.log("Assets loaded. Waiting for user input to start game.");
  }
  showTitleScreen() {
    if (this.titleScreenElement) {
      this.titleScreenElement.style.display = "flex";
    }
    this.hideHUD();
    this.hideGameOverScreen();
  }
  hideTitleScreen() {
    if (this.titleScreenElement) {
      this.titleScreenElement.style.display = "none";
    }
  }
  showHUD() {
    if (this.hudElement) {
      this.hudElement.style.display = "block";
    }
  }
  hideHUD() {
    if (this.hudElement) {
      this.hudElement.style.display = "none";
    }
  }
  showGameOverScreen() {
    const finalScoreElement = document.getElementById("finalScore");
    if (finalScoreElement) {
      finalScoreElement.innerText = this.score.toString();
    } else {
      console.warn("UI element #finalScore not found. Final score will not be displayed.");
    }
    if (this.gameOverScreenElement) {
      this.gameOverScreenElement.style.display = "flex";
    }
    this.hideHUD();
    this.bgmSound?.stop();
    this.bgmSound?.disconnect();
  }
  hideGameOverScreen() {
    if (this.gameOverScreenElement) {
      this.gameOverScreenElement.style.display = "none";
    }
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
    document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this), false);
    document.addEventListener("pointerlockerror", this.onPointerLockError.bind(this), false);
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
    if (this.healthFillElement) {
      this.healthFillElement.style.width = `${Math.max(0, this.playerHealth)}%`;
    }
    if (this.scoreValueElement) {
      this.scoreValueElement.innerText = this.score.toString();
    }
    if (this.enemiesAliveValueElement) {
      this.enemiesAliveValueElement.innerText = this.enemiesAlive.toString();
    }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuaW1wb3J0IHsgUG9pbnRlckxvY2tDb250cm9scyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS9jb250cm9scy9Qb2ludGVyTG9ja0NvbnRyb2xzLmpzJztcclxuXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgcGxheWVyU3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBwbGF5ZXJKdW1wRm9yY2U6IG51bWJlcjtcclxuICAgICAgICBwbGF5ZXJIZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgICAgIGJ1bGxldExpZmV0aW1lOiBudW1iZXI7XHJcbiAgICAgICAgZW5lbXlDb3VudDogbnVtYmVyO1xyXG4gICAgICAgIGVuZW15U3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBlbmVteUhlYWx0aDogbnVtYmVyO1xyXG4gICAgICAgIGVuZW15RGFtYWdlOiBudW1iZXI7XHJcbiAgICAgICAgZW5lbXlBdHRhY2tDb29sZG93bjogbnVtYmVyO1xyXG4gICAgICAgIGdyYXZpdHk6IG51bWJlcjtcclxuICAgICAgICBmbG9vclNpemU6IG51bWJlcjtcclxuICAgICAgICB3YWxsSGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgaW5pdGlhbFNwYXduQXJlYTogbnVtYmVyO1xyXG4gICAgICAgIG11c2ljVm9sdW1lOiBudW1iZXI7XHJcbiAgICAgICAgZWZmZWN0Vm9sdW1lOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgY29sb3JzOiB7XHJcbiAgICAgICAgc2t5Q29sb3I6IHN0cmluZztcclxuICAgICAgICBmbG9vckNvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgd2FsbENvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgcGxheWVyQ29sb3I6IHN0cmluZzsgLy8gRGVidWcgY29sb3IgZm9yIHBsYXllciBib2R5LCBub3QgZGlyZWN0bHkgdmlzaWJsZSBpbiBGUFMgdmlld1xyXG4gICAgICAgIGVuZW15Q29sb3I6IHN0cmluZztcclxuICAgICAgICBidWxsZXRDb2xvcjogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1bXTtcclxuICAgICAgICBzb3VuZHM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjsgdm9sdW1lOiBudW1iZXI7IH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lQXNzZXQge1xyXG4gICAgW2tleTogc3RyaW5nXTogVEhSRUUuVGV4dHVyZSB8IEF1ZGlvQnVmZmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQnVsbGV0IHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIGxpZmV0aW1lOiBudW1iZXI7XHJcbiAgICBtYXhMaWZldGltZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRW5lbXkge1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBsYXN0QXR0YWNrVGltZTogbnVtYmVyO1xyXG4gICAgYXR0YWNrQ29vbGRvd246IG51bWJlcjtcclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNvbmZpZzogR2FtZUNvbmZpZztcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgc2NlbmU6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG4gICAgcHJpdmF0ZSByZW5kZXJlcjogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICAgIHByaXZhdGUgY29udHJvbHM6IFBvaW50ZXJMb2NrQ29udHJvbHM7IC8vIFBvaW50ZXJMb2NrQ29udHJvbHNcclxuICAgIHByaXZhdGUgd29ybGQ6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keTogQ0FOTk9OLkJvZHk7XHJcbiAgICBwcml2YXRlIHBsYXllck1lc2g6IFRIUkVFLk1lc2ggfCBudWxsID0gbnVsbDsgLy8gRGVidWcvcGxhY2Vob2xkZXIgbWVzaCwgdHlwaWNhbGx5IGludmlzaWJsZSBpbiBGUFNcclxuICAgIHByaXZhdGUgY2FuSnVtcDogYm9vbGVhbjtcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH07XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBhc3NldHM6IEdhbWVBc3NldCA9IHt9O1xyXG4gICAgcHJpdmF0ZSBhdWRpb0xpc3RlbmVyOiBUSFJFRS5BdWRpb0xpc3RlbmVyO1xyXG4gICAgcHJpdmF0ZSBiZ21Tb3VuZDogVEhSRUUuQXVkaW8gfCBudWxsID0gbnVsbDsgLy8gRml4OiBSZW1vdmVkIEF1ZGlvQnVmZmVyIGdlbmVyaWMgdHlwZVxyXG5cclxuICAgIHByaXZhdGUgYnVsbGV0czogQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgZW5lbWllczogRW5lbXlbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgcGxheWVySGVhbHRoOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIGVuZW1pZXNBbGl2ZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIGZsb29yQm9keTogQ0FOTk9OLkJvZHk7XHJcblxyXG4gICAgLy8gVUkgRWxlbWVudHNcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5FbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGw7IC8vIE1hZGUgbnVsbGFibGVcclxuICAgIHByaXZhdGUgZ2FtZU92ZXJTY3JlZW5FbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGw7IC8vIE1hZGUgbnVsbGFibGVcclxuICAgIHByaXZhdGUgaHVkRWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsOyAvLyBNYWRlIG51bGxhYmxlXHJcbiAgICBwcml2YXRlIGhlYWx0aEZpbGxFbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGw7IC8vIE1hZGUgbnVsbGFibGVcclxuICAgIHByaXZhdGUgc2NvcmVWYWx1ZUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbDsgLy8gTWFkZSBudWxsYWJsZVxyXG4gICAgcHJpdmF0ZSBlbmVtaWVzQWxpdmVWYWx1ZUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbDsgLy8gTWFkZSBudWxsYWJsZVxyXG5cclxuICAgIC8vIEdhbWUgU3RhdGVcclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiAnVElUTEVfU0NSRUVOJyB8ICdQTEFZSU5HJyB8ICdHQU1FX09WRVInO1xyXG5cclxuICAgIC8vIENvbGxpc2lvbiBncm91cHMgZm9yIENhbm5vbi5qc1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBDT0xMSVNJT05fR1JPVVBTID0ge1xyXG4gICAgICAgIFBMQVlFUjogMSxcclxuICAgICAgICBHUk9VTkQ6IDIsXHJcbiAgICAgICAgRU5FTVk6IDQsXHJcbiAgICAgICAgQlVMTEVUOiA4LFxyXG4gICAgICAgIFdBTEw6IDE2XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcsIGNvbmZpZ0RhdGE6IEdhbWVDb25maWcpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZ0RhdGE7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcblxyXG4gICAgICAgIHRoaXMucGxheWVySGVhbHRoID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckhlYWx0aDtcclxuICAgICAgICB0aGlzLmNhbkp1bXAgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMua2V5cyA9IHt9O1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cyA9IFtdO1xyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuZW5lbWllc0FsaXZlID0gMDtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9ICdUSVRMRV9TQ1JFRU4nO1xyXG5cclxuICAgICAgICAvLyBVSSBFbGVtZW50IFJlZmVyZW5jZXMgLSBSZW1vdmVkICchJyBmb3Igcm9idXN0bmVzc1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RpdGxlU2NyZWVuJyk7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZU92ZXJTY3JlZW4nKTtcclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaHVkJyk7XHJcbiAgICAgICAgdGhpcy5oZWFsdGhGaWxsRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdoZWFsdGhGaWxsJyk7XHJcbiAgICAgICAgdGhpcy5zY29yZVZhbHVlRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzY29yZVZhbHVlJyk7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzQWxpdmVWYWx1ZUVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZW5lbWllc0FsaXZlVmFsdWUnKTtcclxuXHJcbiAgICAgICAgLy8gRXZlbnQgTGlzdGVuZXJzXHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMub25XaW5kb3dSZXNpemUuYmluZCh0aGlzKSwgZmFsc2UpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLm9uS2V5RG93bi5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKSwgZmFsc2UpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMub25Nb3VzZURvd24uYmluZCh0aGlzKSwgZmFsc2UpO1xyXG5cclxuICAgICAgICAvLyBBZGQgbnVsbCBjaGVja3MgZm9yIFVJIGVsZW1lbnRzIGJlZm9yZSBhZGRpbmcgbGlzdGVuZXJzXHJcbiAgICAgICAgaWYgKHRoaXMudGl0bGVTY3JlZW5FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5vblRpdGxlU2NyZWVuQ2xpY2suYmluZCh0aGlzKSwgZmFsc2UpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIlVJIGVsZW1lbnQgI3RpdGxlU2NyZWVuIG5vdCBmb3VuZC4gVGl0bGUgc2NyZWVuIGZ1bmN0aW9uYWxpdHkgbWF5IGJlIGltcGFpcmVkLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZU92ZXJTY3JlZW5FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXJTY3JlZW5FbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5vbkdhbWVPdmVyU2NyZWVuQ2xpY2suYmluZCh0aGlzKSwgZmFsc2UpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIlVJIGVsZW1lbnQgI2dhbWVPdmVyU2NyZWVuIG5vdCBmb3VuZC4gR2FtZSBPdmVyIHNjcmVlbiBmdW5jdGlvbmFsaXR5IG1heSBiZSBpbXBhaXJlZC5cIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBJbml0aWFsIHNldHVwIGZvciBUaHJlZS5qcyBhbmQgQ2Fubm9uLmpzXHJcbiAgICAgICAgdGhpcy5zZXR1cFNjZW5lKCk7XHJcbiAgICAgICAgdGhpcy5zZXR1cFBoeXNpY3MoKTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0aGlzLnNob3dUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgIGF3YWl0IHRoaXMucHJlbG9hZEFzc2V0cygpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQXNzZXRzIGxvYWRlZC4gV2FpdGluZyBmb3IgdXNlciBpbnB1dCB0byBzdGFydCBnYW1lLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbkVsZW1lbnQpIHsgLy8gQWRkZWQgbnVsbCBjaGVja1xyXG4gICAgICAgICAgICB0aGlzLnRpdGxlU2NyZWVuRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmhpZGVIVUQoKTtcclxuICAgICAgICB0aGlzLmhpZGVHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGlkZVRpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLnRpdGxlU2NyZWVuRWxlbWVudCkgeyAvLyBBZGRlZCBudWxsIGNoZWNrXHJcbiAgICAgICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2hvd0hVRCgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5odWRFbGVtZW50KSB7IC8vIEFkZGVkIG51bGwgY2hlY2tcclxuICAgICAgICAgICAgdGhpcy5odWRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhpZGVIVUQoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuaHVkRWxlbWVudCkgeyAvLyBBZGRlZCBudWxsIGNoZWNrXHJcbiAgICAgICAgICAgIHRoaXMuaHVkRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob3dHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmaW5hbFNjb3JlRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaW5hbFNjb3JlJyk7IC8vIEZldGNoZWQgZGlyZWN0bHksIHdpdGhvdXQgJyEnXHJcbiAgICAgICAgaWYgKGZpbmFsU2NvcmVFbGVtZW50KSB7IC8vIEFkZGVkIG51bGwgY2hlY2tcclxuICAgICAgICAgICAgZmluYWxTY29yZUVsZW1lbnQuaW5uZXJUZXh0ID0gdGhpcy5zY29yZS50b1N0cmluZygpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIlVJIGVsZW1lbnQgI2ZpbmFsU2NvcmUgbm90IGZvdW5kLiBGaW5hbCBzY29yZSB3aWxsIG5vdCBiZSBkaXNwbGF5ZWQuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQpIHsgLy8gQWRkZWQgbnVsbCBjaGVja1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmhpZGVIVUQoKTtcclxuICAgICAgICB0aGlzLmJnbVNvdW5kPy5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5iZ21Tb3VuZD8uZGlzY29ubmVjdCgpOyAvLyBEaXNjb25uZWN0IEJHTSBvbiBnYW1lIG92ZXJcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhpZGVHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQpIHsgLy8gQWRkZWQgbnVsbCBjaGVja1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uVGl0bGVTY3JlZW5DbGljaygpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09ICdUSVRMRV9TQ1JFRU4nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaGlkZVRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgICAgIHRoaXMuc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25HYW1lT3ZlclNjcmVlbkNsaWNrKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gJ0dBTUVfT1ZFUicpIHtcclxuICAgICAgICAgICAgdGhpcy5oaWRlR2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAgICAgdGhpcy5yZXN0YXJ0R2FtZSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIHByZWxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZUxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcbiAgICAgICAgY29uc3QgYXVkaW9Mb2FkZXIgPSBuZXcgVEhSRUUuQXVkaW9Mb2FkZXIoKTtcclxuXHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0dXJlTG9hZGVyLmxvYWQoaW1nLnBhdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgKHRleHR1cmU6IFRIUkVFLlRleHR1cmUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHNbaW1nLm5hbWVdID0gdGV4dHVyZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLCAvLyBvblByb2dyZXNzXHJcbiAgICAgICAgICAgICAgICAgICAgKGVycjogRXJyb3IpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgbG9hZGluZyBpbWFnZSAke2ltZy5uYW1lfTpgLCBlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKHNuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBhdWRpb0xvYWRlci5sb2FkKHNuZC5wYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgIChidWZmZXI6IEF1ZGlvQnVmZmVyKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuYXNzZXRzW3NuZC5uYW1lXSA9IGJ1ZmZlcjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLCAvLyBvblByb2dyZXNzXHJcbiAgICAgICAgICAgICAgICAgICAgKGVycjogRXJyb3IpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgbG9hZGluZyBzb3VuZCAke3NuZC5uYW1lfTpgLCBlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIkFsbCBhc3NldHMgbG9hZGVkLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwU2NlbmUoKTogdm9pZCB7XHJcbiAgICAgICAgLy8gU2NlbmVcclxuICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcblxyXG4gICAgICAgIC8vIENhbWVyYVxyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKDc1LCB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodCwgMC4xLCAxMDAwKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi5zZXQoMCwgMiwgMCk7IC8vIFBsYXllciBpbml0aWFsIHBvc2l0aW9uIHNsaWdodGx5IGFib3ZlIGdyb3VuZFxyXG5cclxuICAgICAgICAvLyBSZW5kZXJlclxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRDbGVhckNvbG9yKG5ldyBUSFJFRS5Db2xvcih0aGlzLmNvbmZpZy5jb2xvcnMuc2t5Q29sb3IpKTtcclxuXHJcbiAgICAgICAgLy8gQXVkaW8gTGlzdGVuZXJcclxuICAgICAgICB0aGlzLmF1ZGlvTGlzdGVuZXIgPSBuZXcgVEhSRUUuQXVkaW9MaXN0ZW5lcigpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFkZCh0aGlzLmF1ZGlvTGlzdGVuZXIpO1xyXG5cclxuICAgICAgICAvLyBMaWdodGluZ1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg2NjY2NjYpKTtcclxuICAgICAgICBjb25zdCBkaXJMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpO1xyXG4gICAgICAgIGRpckxpZ2h0LnBvc2l0aW9uLnNldCgxMCwgMjAsIDEwKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChkaXJMaWdodCk7XHJcblxyXG4gICAgICAgIC8vIFNreWJveFxyXG4gICAgICAgIGNvbnN0IHNreWJveEltYWdlTmFtZXMgPSBbJ3NreWJveF9weCcsICdza3lib3hfbngnLCAnc2t5Ym94X3B5JywgJ3NreWJveF9ueScsICdza3lib3hfcHonLCAnc2t5Ym94X256J107XHJcbiAgICAgICAgY29uc3QgbWF0ZXJpYWxzID0gc2t5Ym94SW1hZ2VOYW1lcy5tYXAobmFtZSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFzc2V0ID0gdGhpcy5hc3NldHNbbmFtZV07XHJcbiAgICAgICAgICAgIGlmIChhc3NldCBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBtYXA6IGFzc2V0LCBzaWRlOiBUSFJFRS5CYWNrU2lkZSB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBGYWxsYmFjazogdXNlIHNreUNvbG9yIGZyb20gY29uZmlnXHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBjb2xvcjogbmV3IFRIUkVFLkNvbG9yKHRoaXMuY29uZmlnLmNvbG9ycy5za3lDb2xvciksIHNpZGU6IFRIUkVFLkJhY2tTaWRlIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IHNreWJveCA9IG5ldyBUSFJFRS5NZXNoKG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxMDAwLCAxMDAwLCAxMDAwKSwgbWF0ZXJpYWxzKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChza3lib3gpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBQaHlzaWNzKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMud29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5ncmF2aXR5LnNldCgwLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3Jhdml0eSwgMCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5TQVBCcm9hZHBoYXNlKHRoaXMud29ybGQpOyAvLyBQZXJmb3JtYW5jZSBpbXByb3ZlbWVudFxyXG4gICAgICAgIHRoaXMud29ybGQuYWxsb3dTbGVlcCA9IHRydWU7IC8vIE9iamVjdHMgY2FuIFwic2xlZXBcIiB3aGVuIG5vdCBtb3ZpbmdcclxuXHJcbiAgICAgICAgLy8gUGh5c2ljcyBtYXRlcmlhbHNcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoXCJncm91bmRNYXRlcmlhbFwiKTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoXCJwbGF5ZXJNYXRlcmlhbFwiKTtcclxuICAgICAgICBjb25zdCBlbmVteU1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbChcImVuZW15TWF0ZXJpYWxcIik7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKFwiYnVsbGV0TWF0ZXJpYWxcIik7XHJcblxyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKGdyb3VuZE1hdGVyaWFsLCBwbGF5ZXJNYXRlcmlhbCwgeyBmcmljdGlvbjogMC4xLCByZXN0aXR1dGlvbjogMC4wIH0pKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChncm91bmRNYXRlcmlhbCwgZW5lbXlNYXRlcmlhbCwgeyBmcmljdGlvbjogMC41LCByZXN0aXR1dGlvbjogMC4wIH0pKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChwbGF5ZXJNYXRlcmlhbCwgZW5lbXlNYXRlcmlhbCwgeyBmcmljdGlvbjogMC4wLCByZXN0aXR1dGlvbjogMC4wIH0pKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChidWxsZXRNYXRlcmlhbCwgZW5lbXlNYXRlcmlhbCwgeyBmcmljdGlvbjogMC4wLCByZXN0aXR1dGlvbjogMC4wIH0pKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChidWxsZXRNYXRlcmlhbCwgZ3JvdW5kTWF0ZXJpYWwsIHsgZnJpY3Rpb246IDAuMCwgcmVzdGl0dXRpb246IDAuNSB9KSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwobmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoYnVsbGV0TWF0ZXJpYWwsIGJ1bGxldE1hdGVyaWFsLCB7IGZyaWN0aW9uOiAwLjAsIHJlc3RpdHV0aW9uOiAwLjUgfSkpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gJ1BMQVlJTkcnO1xyXG4gICAgICAgIHRoaXMuaGlkZVRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgdGhpcy5zaG93SFVEKCk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJIZWFsdGggPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVySGVhbHRoO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuZW5lbWllc0FsaXZlID0gMDtcclxuICAgICAgICB0aGlzLmJ1bGxldHMgPSBbXTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSBbXTtcclxuICAgICAgICB0aGlzLmtleXMgPSB7fTtcclxuICAgICAgICB0aGlzLmNhbkp1bXAgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBDbGVhciBleGlzdGluZyBvYmplY3RzIGZyb20gc2NlbmUgYW5kIHdvcmxkXHJcbiAgICAgICAgdGhpcy5jbGVhckdhbWVPYmplY3RzKCk7XHJcblxyXG4gICAgICAgIHRoaXMuY3JlYXRlRmxvb3IoKTtcclxuICAgICAgICB0aGlzLmNyZWF0ZVdhbGxzKCk7XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTtcclxuICAgICAgICB0aGlzLmNyZWF0ZUVuZW1pZXModGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15Q291bnQpO1xyXG5cclxuICAgICAgICB0aGlzLnN0YXJ0QkdNKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVVSSgpO1xyXG5cclxuICAgICAgICAvLyBSZXF1ZXN0IHBvaW50ZXIgbG9jayB0byBzdGFydCBGUFMgY29udHJvbHNcclxuICAgICAgICB0aGlzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5hbmltYXRlLmJpbmQodGhpcykpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVzdGFydEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5zdGFydEdhbWUoKTsgLy8gUmUtaW5pdGlhbGl6ZSBhbmQgc3RhcnQgYSBuZXcgZ2FtZVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2xlYXJHYW1lT2JqZWN0cygpOiB2b2lkIHtcclxuICAgICAgICAvLyBSZW1vdmUgb2xkIHBoeXNpY3MgYm9kaWVzXHJcbiAgICAgICAgdGhpcy53b3JsZC5ib2RpZXMuZm9yRWFjaChib2R5ID0+IHRoaXMud29ybGQucmVtb3ZlQm9keShib2R5KSk7XHJcbiAgICAgICAgLy8gUmVtb3ZlIG9sZCBtZXNoZXMgKGV4Y2VwdCBza3lib3gsIGxpZ2h0LCBjYW1lcmEsIGV0Yy4pXHJcbiAgICAgICAgY29uc3Qgb2JqZWN0c1RvUmVtb3ZlID0gdGhpcy5zY2VuZS5jaGlsZHJlbi5maWx0ZXIob2JqID0+XHJcbiAgICAgICAgICAgIG9iaiAhPT0gdGhpcy5jYW1lcmEgJiYgb2JqICE9PSB0aGlzLmF1ZGlvTGlzdGVuZXIgJiZcclxuICAgICAgICAgICAgb2JqIGluc3RhbmNlb2YgVEhSRUUuTWVzaCAmJiAhKG9iai5nZW9tZXRyeSBpbnN0YW5jZW9mIFRIUkVFLkJveEdlb21ldHJ5ICYmIEFycmF5LmlzQXJyYXkob2JqLm1hdGVyaWFsKSAmJiBvYmoubWF0ZXJpYWwuZXZlcnkobSA9PiBtIGluc3RhbmNlb2YgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwgJiYgbS5zaWRlID09PSBUSFJFRS5CYWNrU2lkZSkpIC8vIEtlZXAgc2t5Ym94XHJcbiAgICAgICAgKTtcclxuICAgICAgICBvYmplY3RzVG9SZW1vdmUuZm9yRWFjaChvYmogPT4gdGhpcy5zY2VuZS5yZW1vdmUob2JqKSk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlUGxheWVyKCk6IHZvaWQge1xyXG4gICAgICAgIC8vIFBsYXllciBib2R5IChjYXBzdWxlIGZvciBiZXR0ZXIgZ3JvdW5kIGNvbnRhY3QpXHJcbiAgICAgICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkN5bGluZGVyKDAuNSwgMC41LCAxLjgsIDE2KTsgLy8gcmFkaXVzVG9wLCByYWRpdXNCb3R0b20sIGhlaWdodCwgc2VnbWVudHNcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiA1LCBzaGFwZTogcGxheWVyU2hhcGUsIGxpbmVhckRhbXBpbmc6IDAuOSwgYW5ndWxhckRhbXBpbmc6IDAuOSB9KTtcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24uc2V0KDAsIDEwLCAwKTsgLy8gU3Bhd24gc2xpZ2h0bHkgaW4gYWlyIHRvIGZhbGwgb250byBncm91bmRcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkuZml4ZWRSb3RhdGlvbiA9IHRydWU7IC8vIFByZXZlbnQgcGxheWVyIGZyb20gdGlwcGluZyBvdmVyXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnVwZGF0ZU1hc3NQcm9wZXJ0aWVzKCk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LmNvbGxpc2lvbkZpbHRlckdyb3VwID0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLlBMQVlFUjtcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkuY29sbGlzaW9uRmlsdGVyTWFzayA9IHRoaXMuQ09MTElTSU9OX0dST1VQUy5HUk9VTkQgfCB0aGlzLkNPTExJU0lPTl9HUk9VUFMuRU5FTVkgfCB0aGlzLkNPTExJU0lPTl9HUk9VUFMuV0FMTDtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5wbGF5ZXJCb2R5KTtcclxuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LmFkZEV2ZW50TGlzdGVuZXIoXCJjb2xsaWRlXCIsIChldmVudDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5ib2R5ID09PSB0aGlzLmZsb29yQm9keSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYW5KdW1wID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBQb2ludGVyTG9ja0NvbnRyb2xzXHJcbiAgICAgICAgdGhpcy5jb250cm9scyA9IG5ldyBQb2ludGVyTG9ja0NvbnRyb2xzKHRoaXMuY2FtZXJhLCBkb2N1bWVudC5ib2R5KTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmNvbnRyb2xzLm9iamVjdCk7IC8vIFRoZSBjb250cm9scyBvYmplY3QgaXMgYSBUSFJFRS5PYmplY3QzRCBjb250YWluaW5nIHRoZSBjYW1lcmFcclxuXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSwgZmFsc2UpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJsb2NrZXJyb3InLCB0aGlzLm9uUG9pbnRlckxvY2tFcnJvci5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcblxyXG4gICAgICAgIC8vIERlYnVnIHBsYXllciBtZXNoIChpbnZpc2libGUgaW4gYWN0dWFsIGdhbWUsIGJ1dCBjYW4gYmUgdXNlZnVsIGZvciBkZXYpXHJcbiAgICAgICAgY29uc3QgcGxheWVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQ3lsaW5kZXJHZW9tZXRyeSgwLjUsIDAuNSwgMS44LCAxNik7XHJcbiAgICAgICAgY29uc3QgcGxheWVyTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoeyBjb2xvcjogbmV3IFRIUkVFLkNvbG9yKHRoaXMuY29uZmlnLmNvbG9ycy5wbGF5ZXJDb2xvciksIHdpcmVmcmFtZTogdHJ1ZSwgdHJhbnNwYXJlbnQ6IHRydWUsIG9wYWNpdHk6IDAgfSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLnBsYXllck1lc2gpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlRmxvb3IoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZmxvb3JTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZsb29yU2l6ZTtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlQXNzZXQgPSB0aGlzLmFzc2V0c1snZmxvb3JUZXh0dXJlJ107XHJcbiAgICAgICAgbGV0IGZsb29yVGV4dHVyZTogVEhSRUUuVGV4dHVyZSB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKHRleHR1cmVBc3NldCBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUpIHtcclxuICAgICAgICAgICAgZmxvb3JUZXh0dXJlID0gdGV4dHVyZUFzc2V0O1xyXG4gICAgICAgICAgICBmbG9vclRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgZmxvb3JUZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgIGZsb29yVGV4dHVyZS5yZXBlYXQuc2V0KGZsb29yU2l6ZSAvIDUsIGZsb29yU2l6ZSAvIDUpOyAvLyBSZXBlYXQgdGV4dHVyZSBiYXNlZCBvbiBmbG9vciBzaXplXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBmbG9vckdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KGZsb29yU2l6ZSwgMSwgZmxvb3JTaXplKTtcclxuICAgICAgICBjb25zdCBmbG9vck1hdGVyaWFsT3B0aW9uczogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbFBhcmFtZXRlcnMgPSB7fTtcclxuICAgICAgICBpZiAoZmxvb3JUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGZsb29yTWF0ZXJpYWxPcHRpb25zLm1hcCA9IGZsb29yVGV4dHVyZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmbG9vck1hdGVyaWFsT3B0aW9ucy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcih0aGlzLmNvbmZpZy5jb2xvcnMuZmxvb3JDb2xvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGZsb29yTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbChmbG9vck1hdGVyaWFsT3B0aW9ucyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgZmxvb3JNZXNoID0gbmV3IFRIUkVFLk1lc2goZmxvb3JHZW9tZXRyeSwgZmxvb3JNYXRlcmlhbCk7XHJcbiAgICAgICAgZmxvb3JNZXNoLnBvc2l0aW9uLnkgPSAtMC41OyAvLyBQbGFjZSBmbG9vciBib3R0b20gYXQgeT0wXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoZmxvb3JNZXNoKTtcclxuXHJcbiAgICAgICAgdGhpcy5mbG9vckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwIH0pOyAvLyBTdGF0aWMgYm9keVxyXG4gICAgICAgIHRoaXMuZmxvb3JCb2R5LmFkZFNoYXBlKG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhmbG9vclNpemUgLyAyLCAwLjUsIGZsb29yU2l6ZSAvIDIpKSk7XHJcbiAgICAgICAgdGhpcy5mbG9vckJvZHkucG9zaXRpb24ueSA9IC0wLjU7XHJcbiAgICAgICAgdGhpcy5mbG9vckJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuR1JPVU5EO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmZsb29yQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVXYWxscygpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmbG9vclNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZmxvb3JTaXplO1xyXG4gICAgICAgIGNvbnN0IHdhbGxIZWlnaHQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Mud2FsbEhlaWdodDtcclxuICAgICAgICBjb25zdCB3YWxsVGhpY2tuZXNzID0gMTtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlQXNzZXQgPSB0aGlzLmFzc2V0c1snd2FsbFRleHR1cmUnXTtcclxuICAgICAgICBsZXQgd2FsbFRleHR1cmU6IFRIUkVFLlRleHR1cmUgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmICh0ZXh0dXJlQXNzZXQgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIHdhbGxUZXh0dXJlID0gdGV4dHVyZUFzc2V0O1xyXG4gICAgICAgICAgICB3YWxsVGV4dHVyZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgICAgICB3YWxsVGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgICAgICAvLyBFeGFtcGxlOiBBZGp1c3QgcmVwZWF0IGJhc2VkIG9uIHdhbGwgZGltZW5zaW9uc1xyXG4gICAgICAgICAgICAvLyB3YWxsVGV4dHVyZS5yZXBlYXQuc2V0KGZsb29yU2l6ZSAvIDUsIHdhbGxIZWlnaHQgLyA1KTsgXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCB3YWxsTWF0ZXJpYWxPcHRpb25zOiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsUGFyYW1ldGVycyA9IHt9O1xyXG4gICAgICAgIGlmICh3YWxsVGV4dHVyZSkge1xyXG4gICAgICAgICAgICB3YWxsTWF0ZXJpYWxPcHRpb25zLm1hcCA9IHdhbGxUZXh0dXJlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHdhbGxNYXRlcmlhbE9wdGlvbnMuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IodGhpcy5jb25maWcuY29sb3JzLndhbGxDb2xvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHdhbGxNYXRlcmlhbE9wdGlvbnMpO1xyXG5cclxuICAgICAgICBjb25zdCBjcmVhdGVXYWxsID0gKHg6IG51bWJlciwgeTogbnVtYmVyLCB6OiBudW1iZXIsIHN4OiBudW1iZXIsIHN5OiBudW1iZXIsIHN6OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgd2FsbEdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHN4LCBzeSwgc3opO1xyXG4gICAgICAgICAgICBjb25zdCB3YWxsTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHdhbGxHZW9tZXRyeSwgd2FsbE1hdGVyaWFsKTtcclxuICAgICAgICAgICAgd2FsbE1lc2gucG9zaXRpb24uc2V0KHgsIHksIHopO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZCh3YWxsTWVzaCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB3YWxsQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAgfSk7XHJcbiAgICAgICAgICAgIHdhbGxCb2R5LmFkZFNoYXBlKG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhzeCAvIDIsIHN5IC8gMiwgc3ogLyAyKSkpO1xyXG4gICAgICAgICAgICB3YWxsQm9keS5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XHJcbiAgICAgICAgICAgIHdhbGxCb2R5LmNvbGxpc2lvbkZpbHRlckdyb3VwID0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLldBTEw7XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh3YWxsQm9keSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gRnJvbnQgd2FsbFxyXG4gICAgICAgIGNyZWF0ZVdhbGwoMCwgd2FsbEhlaWdodCAvIDIsIC1mbG9vclNpemUgLyAyLCBmbG9vclNpemUsIHdhbGxIZWlnaHQsIHdhbGxUaGlja25lc3MpO1xyXG4gICAgICAgIC8vIEJhY2sgd2FsbFxyXG4gICAgICAgIGNyZWF0ZVdhbGwoMCwgd2FsbEhlaWdodCAvIDIsIGZsb29yU2l6ZSAvIDIsIGZsb29yU2l6ZSwgd2FsbEhlaWdodCwgd2FsbFRoaWNrbmVzcyk7XHJcbiAgICAgICAgLy8gTGVmdCB3YWxsXHJcbiAgICAgICAgY3JlYXRlV2FsbCgtZmxvb3JTaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDAsIHdhbGxUaGlja25lc3MsIHdhbGxIZWlnaHQsIGZsb29yU2l6ZSk7XHJcbiAgICAgICAgLy8gUmlnaHQgd2FsbFxyXG4gICAgICAgIGNyZWF0ZVdhbGwoZmxvb3JTaXplIC8gMiwgd2FsbEhlaWdodCAvIDIsIDAsIHdhbGxUaGlja25lc3MsIHdhbGxIZWlnaHQsIGZsb29yU2l6ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVFbmVtaWVzKGNvdW50OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmbG9vclNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZmxvb3JTaXplO1xyXG4gICAgICAgIGNvbnN0IHNwYXduQXJlYSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5pbml0aWFsU3Bhd25BcmVhO1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVBc3NldCA9IHRoaXMuYXNzZXRzWydlbmVteVRleHR1cmUnXTtcclxuICAgICAgICBsZXQgZW5lbXlUZXh0dXJlOiBUSFJFRS5UZXh0dXJlIHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIGlmICh0ZXh0dXJlQXNzZXQgaW5zdGFuY2VvZiBUSFJFRS5UZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGVuZW15VGV4dHVyZSA9IHRleHR1cmVBc3NldDtcclxuICAgICAgICAgICAgZW5lbXlUZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgIGVuZW15VGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZW5lbXlSYWRpdXMgPSAwLjg7XHJcbiAgICAgICAgY29uc3QgZW5lbXlIZWlnaHQgPSAxLjY7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCB4ID0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogc3Bhd25BcmVhO1xyXG4gICAgICAgICAgICBjb25zdCB6ID0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogc3Bhd25BcmVhO1xyXG4gICAgICAgICAgICBjb25zdCB5ID0gZW5lbXlIZWlnaHQgLyAyOyAvLyBTcGF3biBlbmVtaWVzIHNsaWdodGx5IGFib3ZlIGdyb3VuZFxyXG5cclxuICAgICAgICAgICAgY29uc3QgZW5lbXlHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShlbmVteVJhZGl1cyAqIDIsIGVuZW15SGVpZ2h0LCBlbmVteVJhZGl1cyAqIDIpO1xyXG4gICAgICAgICAgICBjb25zdCBlbmVteU1hdGVyaWFsT3B0aW9uczogVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbFBhcmFtZXRlcnMgPSB7fTtcclxuICAgICAgICAgICAgaWYgKGVuZW15VGV4dHVyZSkge1xyXG4gICAgICAgICAgICAgICAgZW5lbXlNYXRlcmlhbE9wdGlvbnMubWFwID0gZW5lbXlUZXh0dXJlO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZW5lbXlNYXRlcmlhbE9wdGlvbnMuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IodGhpcy5jb25maWcuY29sb3JzLmVuZW15Q29sb3IpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15TWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbChlbmVteU1hdGVyaWFsT3B0aW9ucyk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBlbmVteU1lc2ggPSBuZXcgVEhSRUUuTWVzaChlbmVteUdlb21ldHJ5LCBlbmVteU1hdGVyaWFsKTtcclxuICAgICAgICAgICAgZW5lbXlNZXNoLnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQoZW5lbXlNZXNoKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15U2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoZW5lbXlSYWRpdXMsIGVuZW15SGVpZ2h0IC8gMiwgZW5lbXlSYWRpdXMpKTtcclxuICAgICAgICAgICAgY29uc3QgZW5lbXlCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMTAsIHNoYXBlOiBlbmVteVNoYXBlLCBsaW5lYXJEYW1waW5nOiAwLjksIGFuZ3VsYXJEYW1waW5nOiAwLjkgfSk7XHJcbiAgICAgICAgICAgIGVuZW15Qm9keS5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XHJcbiAgICAgICAgICAgIGVuZW15Qm9keS5maXhlZFJvdGF0aW9uID0gdHJ1ZTtcclxuICAgICAgICAgICAgZW5lbXlCb2R5LmNvbGxpc2lvbkZpbHRlckdyb3VwID0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLkVORU1ZO1xyXG4gICAgICAgICAgICBlbmVteUJvZHkuY29sbGlzaW9uRmlsdGVyTWFzayA9IHRoaXMuQ09MTElTSU9OX0dST1VQUy5HUk9VTkQgfCB0aGlzLkNPTExJU0lPTl9HUk9VUFMuUExBWUVSIHwgdGhpcy5DT0xMSVNJT05fR1JPVVBTLkJVTExFVCB8IHRoaXMuQ09MTElTSU9OX0dST1VQUy5XQUxMO1xyXG4gICAgICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoZW5lbXlCb2R5KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIG1lc2g6IGVuZW15TWVzaCxcclxuICAgICAgICAgICAgICAgIGJvZHk6IGVuZW15Qm9keSxcclxuICAgICAgICAgICAgICAgIGhlYWx0aDogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SGVhbHRoLFxyXG4gICAgICAgICAgICAgICAgbGFzdEF0dGFja1RpbWU6IDAsXHJcbiAgICAgICAgICAgICAgICBhdHRhY2tDb29sZG93bjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15QXR0YWNrQ29vbGRvd25cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllc0FsaXZlKys7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYW5pbWF0ZSh0aW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgIT09ICdQTEFZSU5HJykge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBkdCA9ICh0aW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwO1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAoZHQgPiAxIC8gMzApIHsgLy8gQ2FwIGRlbHRhIHRpbWUgdG8gcHJldmVudCBwaHlzaWNzIGdsaXRjaGVzIHdpdGggdmVyeSBsYXJnZSBkdFxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnN0ZXAoMSAvIDYwLCBkdCwgMyk7IC8vIEZpeGVkIHRpbWUgc3RlcCBmb3IgcGh5c2ljc1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuc3RlcCgxIC8gNjAsIGR0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBtb3ZlbWVudFxyXG4gICAgICAgIHRoaXMuaGFuZGxlUGxheWVyTW92ZW1lbnQoZHQpO1xyXG5cclxuICAgICAgICAvLyBTeW5jIFRocmVlLmpzIGNhbWVyYSB3aXRoIENhbm5vbi5qcyBwbGF5ZXIgYm9keVxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSArPSAwLjg7IC8vIEFkanVzdCBjYW1lcmEgdG8gJ2V5ZSBsZXZlbCdcclxuICAgICAgICBpZiAodGhpcy5wbGF5ZXJNZXNoKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5xdWF0ZXJuaW9uIGFzIGFueSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgZW5lbWllc1xyXG4gICAgICAgIHRoaXMudXBkYXRlRW5lbWllcyhkdCk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBidWxsZXRzXHJcbiAgICAgICAgdGhpcy51cGRhdGVCdWxsZXRzKGR0KTtcclxuXHJcbiAgICAgICAgLy8gUmVuZGVyXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIodGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgVUlcclxuICAgICAgICB0aGlzLnVwZGF0ZVVJKCk7XHJcblxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVQbGF5ZXJNb3ZlbWVudChkdDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbnRyb2xzLmlzTG9ja2VkKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGlucHV0VmVsb2NpdHkgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllclNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlXJ10pIGlucHV0VmVsb2NpdHkueiAtPSBwbGF5ZXJTcGVlZDtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlTJ10pIGlucHV0VmVsb2NpdHkueiArPSBwbGF5ZXJTcGVlZDtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlBJ10pIGlucHV0VmVsb2NpdHkueCAtPSBwbGF5ZXJTcGVlZDtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlEJ10pIGlucHV0VmVsb2NpdHkueCArPSBwbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaW5wdXQgdmVsb2NpdHkgaW4gY2FtZXJhIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IHBsYXllckRpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24ocGxheWVyRGlyZWN0aW9uKTsgLy8gR2V0IGZvcndhcmQgZGlyZWN0aW9uIG9mIGNhbWVyYVxyXG4gICAgICAgIHBsYXllckRpcmVjdGlvbi55ID0gMDsgLy8gRG9uJ3QgbW92ZSB1cC9kb3duIGZyb20gY2FtZXJhIHBpdGNoXHJcbiAgICAgICAgcGxheWVyRGlyZWN0aW9uLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICBjb25zdCByaWdodERpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgcmlnaHREaXJlY3Rpb24uY3Jvc3NWZWN0b3JzKHRoaXMuY2FtZXJhLnVwLCBwbGF5ZXJEaXJlY3Rpb24pOyAvLyBHZXQgcmlnaHQgZGlyZWN0aW9uXHJcblxyXG4gICAgICAgIGNvbnN0IGZpbmFsVmVsb2NpdHkgPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydLZXlXJ10gfHwgdGhpcy5rZXlzWydLZXlTJ10pIHtcclxuICAgICAgICAgICAgZmluYWxWZWxvY2l0eS54ICs9IHBsYXllckRpcmVjdGlvbi54ICogaW5wdXRWZWxvY2l0eS56O1xyXG4gICAgICAgICAgICBmaW5hbFZlbG9jaXR5LnogKz0gcGxheWVyRGlyZWN0aW9uLnogKiBpbnB1dFZlbG9jaXR5Lno7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ0tleUEnXSB8fCB0aGlzLmtleXNbJ0tleUQnXSkge1xyXG4gICAgICAgICAgICBmaW5hbFZlbG9jaXR5LnggKz0gcmlnaHREaXJlY3Rpb24ueCAqIGlucHV0VmVsb2NpdHkueDtcclxuICAgICAgICAgICAgZmluYWxWZWxvY2l0eS56ICs9IHJpZ2h0RGlyZWN0aW9uLnogKiBpbnB1dFZlbG9jaXR5Lng7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQcmVzZXJ2ZSBjdXJyZW50IHZlcnRpY2FsIHZlbG9jaXR5IChncmF2aXR5LCBqdW1wcylcclxuICAgICAgICBjb25zdCBjdXJyZW50WVZlbG9jaXR5ID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lnk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnNldChmaW5hbFZlbG9jaXR5LngsIGN1cnJlbnRZVmVsb2NpdHksIGZpbmFsVmVsb2NpdHkueik7XHJcblxyXG4gICAgICAgIC8vIEp1bXBcclxuICAgICAgICBpZiAodGhpcy5rZXlzWydTcGFjZSddICYmIHRoaXMuY2FuSnVtcCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJKdW1wRm9yY2U7XHJcbiAgICAgICAgICAgIHRoaXMuY2FuSnVtcCA9IGZhbHNlOyAvLyBQcmV2ZW50IG11bHRpcGxlIGp1bXBzXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmNvZGVdID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQuY29kZV0gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTW91c2VEb3duKGV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSAnUExBWUlORycgJiYgdGhpcy5jb250cm9scy5pc0xvY2tlZCkge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQuYnV0dG9uID09PSAwKSB7IC8vIExlZnQgY2xpY2tcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlyZUJ1bGxldCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Qb2ludGVyTG9ja0NoYW5nZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSBkb2N1bWVudC5ib2R5KSB7IC8vIFJlbW92ZWQgbW96UG9pbnRlckxvY2tFbGVtZW50XHJcbiAgICAgICAgICAgIHRoaXMuY29udHJvbHMuaXNMb2NrZWQgPSB0cnVlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlckxvY2tDb250cm9sczogTG9ja2VkJyk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gJ1BMQVlJTkcnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVNvdW5kPy5wbGF5KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRyb2xzLmlzTG9ja2VkID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyTG9ja0NvbnRyb2xzOiBVbmxvY2tlZCcpO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09ICdQTEFZSU5HJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZD8ucGF1c2UoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBJZiB1bmxvY2tlZCBkdXJpbmcgZ2FtZSwgcGF1c2UgdGhlIGdhbWUgb3Igc2hvdyBhIG1lbnVcclxuICAgICAgICAgICAgLy8gRm9yIHRoaXMgc2ltcGxlIGdhbWUsIHdlJ2xsIGp1c3Qga2VlcCBwbGF5aW5nIGJ1dCB3aXRob3V0IGNvbnRyb2xzXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Qb2ludGVyTG9ja0Vycm9yKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1BvaW50ZXJMb2NrQ29udHJvbHM6IEVycm9yJyk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXF1ZXN0UG9pbnRlckxvY2soKTogdm9pZCB7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5yZXF1ZXN0UG9pbnRlckxvY2soKTsgLy8gU2ltcGxpZmllZCB0byB1c2Ugc3RhbmRhcmQgcmVxdWVzdFBvaW50ZXJMb2NrXHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBmaXJlQnVsbGV0KCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldFNwZWVkO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldExpZmV0aW1lID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldExpZmV0aW1lO1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVBc3NldCA9IHRoaXMuYXNzZXRzWydidWxsZXRUZXh0dXJlJ107XHJcbiAgICAgICAgbGV0IGJ1bGxldFRleHR1cmU6IFRIUkVFLlRleHR1cmUgfCB1bmRlZmluZWQ7XHJcbiAgICAgICAgaWYgKHRleHR1cmVBc3NldCBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUpIHtcclxuICAgICAgICAgICAgYnVsbGV0VGV4dHVyZSA9IHRleHR1cmVBc3NldDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1bGxldEdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KDAuMiwgOCwgOCk7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWF0ZXJpYWxPcHRpb25zOiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsUGFyYW1ldGVycyA9IHt9O1xyXG4gICAgICAgIGlmIChidWxsZXRUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGJ1bGxldE1hdGVyaWFsT3B0aW9ucy5tYXAgPSBidWxsZXRUZXh0dXJlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGJ1bGxldE1hdGVyaWFsT3B0aW9ucy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcih0aGlzLmNvbmZpZy5jb2xvcnMuYnVsbGV0Q29sb3IpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBidWxsZXRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKGJ1bGxldE1hdGVyaWFsT3B0aW9ucyk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1bGxldE1lc2ggPSBuZXcgVEhSRUUuTWVzaChidWxsZXRHZW9tZXRyeSwgYnVsbGV0TWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGJ1bGxldE1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCBidWxsZXRTaGFwZSA9IG5ldyBDQU5OT04uU3BoZXJlKDAuMik7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0Qm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAuMSwgc2hhcGU6IGJ1bGxldFNoYXBlIH0pO1xyXG4gICAgICAgIGJ1bGxldEJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuQlVMTEVUO1xyXG4gICAgICAgIGJ1bGxldEJvZHkuY29sbGlzaW9uRmlsdGVyTWFzayA9IHRoaXMuQ09MTElTSU9OX0dST1VQUy5FTkVNWSB8IHRoaXMuQ09MTElTSU9OX0dST1VQUy5HUk9VTkQgfCB0aGlzLkNPTExJU0lPTl9HUk9VUFMuV0FMTDtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYnVsbGV0Qm9keSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJheWNhc3RlciA9IG5ldyBUSFJFRS5SYXljYXN0ZXIodGhpcy5jYW1lcmEucG9zaXRpb24sIHRoaXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKG5ldyBUSFJFRS5WZWN0b3IzKCkpKTtcclxuICAgICAgICBjb25zdCBidWxsZXRTcGF3bk9mZnNldCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgcmF5Y2FzdGVyLnJheS5hdCgwLjUsIGJ1bGxldFNwYXduT2Zmc2V0KTsgLy8gU3Bhd24gYnVsbGV0IHNsaWdodGx5IGluIGZyb250IG9mIGNhbWVyYVxyXG5cclxuICAgICAgICBidWxsZXRCb2R5LnBvc2l0aW9uLmNvcHkoYnVsbGV0U3Bhd25PZmZzZXQgYXMgYW55KTtcclxuXHJcbiAgICAgICAgY29uc3QgYnVsbGV0RGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZERpcmVjdGlvbihidWxsZXREaXJlY3Rpb24pO1xyXG4gICAgICAgIGJ1bGxldEJvZHkudmVsb2NpdHkuY29weShidWxsZXREaXJlY3Rpb24ubXVsdGlwbHlTY2FsYXIoYnVsbGV0U3BlZWQpIGFzIGFueSk7XHJcblxyXG4gICAgICAgIGJ1bGxldEJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcImNvbGxpZGVcIiwgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgZXZlbnQuYm9keS50eXBlIGlzIHZhbGlkLCBvciByZWx5IG9uIG1hc3MgdG8gZGlzdGluZ3Vpc2ggc3RhdGljL2tpbmVtYXRpY1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQuYm9keS5tYXNzID09PSAwIHx8IGV2ZW50LmJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPT09IHRoaXMuQ09MTElTSU9OX0dST1VQUy5HUk9VTkQgfHwgZXZlbnQuYm9keS5jb2xsaXNpb25GaWx0ZXJHcm91cCA9PT0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLldBTEwpIHtcclxuICAgICAgICAgICAgICAgIC8vIEhpdCBncm91bmQgb3Igd2FsbCwganVzdCByZW1vdmUgYnVsbGV0XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUJ1bGxldChidWxsZXRCb2R5KTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChldmVudC5ib2R5LmNvbGxpc2lvbkZpbHRlckdyb3VwID09PSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuRU5FTVkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGhpdEVuZW15ID0gdGhpcy5lbmVtaWVzLmZpbmQoZSA9PiBlLmJvZHkgPT09IGV2ZW50LmJvZHkpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGhpdEVuZW15KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbmVteVRha2VEYW1hZ2UoaGl0RW5lbXksIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXREYW1hZ2UpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVCdWxsZXQoYnVsbGV0Qm9keSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5idWxsZXRzLnB1c2goeyBtZXNoOiBidWxsZXRNZXNoLCBib2R5OiBidWxsZXRCb2R5LCBsaWZldGltZTogMCwgbWF4TGlmZXRpbWU6IGJ1bGxldExpZmV0aW1lIH0pO1xyXG4gICAgICAgIHRoaXMucGxheVNvdW5kKCdzaG9vdCcsIGJ1bGxldFNwYXduT2Zmc2V0KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbW92ZUJ1bGxldChib2R5VG9SZW1vdmU6IENBTk5PTi5Cb2R5KTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgaW5kZXggPSB0aGlzLmJ1bGxldHMuZmluZEluZGV4KGIgPT4gYi5ib2R5ID09PSBib2R5VG9SZW1vdmUpO1xyXG4gICAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0ID0gdGhpcy5idWxsZXRzW2luZGV4XTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoYnVsbGV0Lm1lc2gpO1xyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYnVsbGV0LmJvZHkpO1xyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldHMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVCdWxsZXRzKGR0OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5idWxsZXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IHRoaXMuYnVsbGV0c1tpXTtcclxuICAgICAgICAgICAgYnVsbGV0LmxpZmV0aW1lICs9IGR0O1xyXG5cclxuICAgICAgICAgICAgaWYgKGJ1bGxldC5saWZldGltZSA+IGJ1bGxldC5tYXhMaWZldGltZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVCdWxsZXQoYnVsbGV0LmJvZHkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0Lm1lc2gucG9zaXRpb24uY29weShidWxsZXQuYm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0Lm1lc2gucXVhdGVybmlvbi5jb3B5KGJ1bGxldC5ib2R5LnF1YXRlcm5pb24gYXMgYW55KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUVuZW1pZXMoZHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IHBsYXllclBvc2l0aW9uID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLmVuZW1pZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgZW5lbXkgPSB0aGlzLmVuZW1pZXNbaV07XHJcbiAgICAgICAgICAgIGlmIChlbmVteS5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgLy8gRW5lbXkgYWxyZWFkeSBkZWFkLCByZW1vdmUgaXRcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKGVuZW15Lm1lc2gpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGVuZW15LmJvZHkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmVtaWVzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllc0FsaXZlLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IDEwMDtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdlbmVteURpZScsIGVuZW15LmJvZHkucG9zaXRpb24gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBTaW1wbGUgQUk6IE1vdmUgdG93YXJkcyBwbGF5ZXJcclxuICAgICAgICAgICAgY29uc3QgZGlyZWN0aW9uID0gbmV3IENBTk5PTi5WZWMzKCk7XHJcbiAgICAgICAgICAgIHBsYXllclBvc2l0aW9uLnZzdWIoZW5lbXkuYm9keS5wb3NpdGlvbiwgZGlyZWN0aW9uKTtcclxuICAgICAgICAgICAgZGlyZWN0aW9uLnkgPSAwOyAvLyBPbmx5IG1vdmUgb24gaG9yaXpvbnRhbCBwbGFuZVxyXG4gICAgICAgICAgICBkaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSBkaXJlY3Rpb24ueCAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteVNwZWVkO1xyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnZlbG9jaXR5LnogPSBkaXJlY3Rpb24ueiAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteVNwZWVkO1xyXG5cclxuICAgICAgICAgICAgLy8gTG9vayBhdCBwbGF5ZXIgKHZpc3VhbCBvbmx5KVxyXG4gICAgICAgICAgICBlbmVteS5tZXNoLmxvb2tBdChwbGF5ZXJQb3NpdGlvbi54LCBlbmVteS5tZXNoLnBvc2l0aW9uLnksIHBsYXllclBvc2l0aW9uLnopO1xyXG5cclxuICAgICAgICAgICAgLy8gU3luYyBtZXNoIHdpdGggYm9keVxyXG4gICAgICAgICAgICBlbmVteS5tZXNoLnBvc2l0aW9uLmNvcHkoZW5lbXkuYm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgICAgICBlbmVteS5tZXNoLnF1YXRlcm5pb24uY29weShlbmVteS5ib2R5LnF1YXRlcm5pb24gYXMgYW55KTtcclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGZvciBwbGF5ZXIgYXR0YWNrXHJcbiAgICAgICAgICAgIHRoaXMuY2hlY2tFbmVteUF0dGFjayhlbmVteSwgZHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMuZW5lbWllc0FsaXZlID09PSAwICYmIHRoaXMuZ2FtZVN0YXRlID09PSAnUExBWUlORycpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJBbGwgZW5lbWllcyBkZWZlYXRlZCFcIik7XHJcbiAgICAgICAgICAgIC8vIE9wdGlvbmFsbHkgc3Bhd24gbW9yZSBlbmVtaWVzIG9yIGVuZCBnYW1lXHJcbiAgICAgICAgICAgIC8vIEZvciBub3csIGxldCdzIGp1c3QgbWFrZSBpdCBhIHdpbiBjb25kaXRpb24gaWYgYWxsIGVuZW1pZXMgYXJlIGRlZmVhdGVkLlxyXG4gICAgICAgICAgICAvLyBPciwgc3Bhd24gbW9yZSBhZnRlciBhIGRlbGF5LiBGb3Igc2ltcGxlLCBsZXQncyBqdXN0IGVuZCB0aGUgZ2FtZS5cclxuICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrRW5lbXlBdHRhY2soZW5lbXk6IEVuZW15LCBkdDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgZGlzdGFuY2VUb1BsYXllciA9IGVuZW15LmJvZHkucG9zaXRpb24uZGlzdGFuY2VUbyh0aGlzLnBsYXllckJvZHkucG9zaXRpb24pO1xyXG4gICAgICAgIGNvbnN0IGF0dGFja1JhbmdlID0gMS41OyAvLyBEaXN0YW5jZSBmb3IgZW5lbXkgdG8gYXR0YWNrXHJcblxyXG4gICAgICAgIGlmIChkaXN0YW5jZVRvUGxheWVyIDwgYXR0YWNrUmFuZ2UpIHtcclxuICAgICAgICAgICAgZW5lbXkubGFzdEF0dGFja1RpbWUgKz0gZHQ7XHJcbiAgICAgICAgICAgIGlmIChlbmVteS5sYXN0QXR0YWNrVGltZSA+PSBlbmVteS5hdHRhY2tDb29sZG93bikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJUYWtlRGFtYWdlKHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteURhbWFnZSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXlTb3VuZCgncGxheWVySHVydCcsIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgZW5lbXkubGFzdEF0dGFja1RpbWUgPSAwOyAvLyBSZXNldCBjb29sZG93blxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZW5lbXkubGFzdEF0dGFja1RpbWUgPSBlbmVteS5hdHRhY2tDb29sZG93bjsgLy8gUmVhZHkgdG8gYXR0YWNrIGltbWVkaWF0ZWx5IHdoZW4gaW4gcmFuZ2VcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5ZXJUYWtlRGFtYWdlKGRhbWFnZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJIZWFsdGggLT0gZGFtYWdlO1xyXG4gICAgICAgIGlmICh0aGlzLnBsYXllckhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVySGVhbHRoID0gMDtcclxuICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnVwZGF0ZVVJKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBlbmVteVRha2VEYW1hZ2UoZW5lbXk6IEVuZW15LCBkYW1hZ2U6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGVuZW15LmhlYWx0aCAtPSBkYW1hZ2U7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ2hpdCcsIGVuZW15LmJvZHkucG9zaXRpb24gYXMgYW55KTtcclxuICAgICAgICBpZiAoZW5lbXkuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgLy8gTWFyayBmb3IgcmVtb3ZhbCBpbiB1cGRhdGVFbmVtaWVzIGxvb3BcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCJFbmVteSBkZWZlYXRlZCFcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudXBkYXRlVUkoKTsgLy8gVG8gdXBkYXRlIGVuZW15IGNvdW50XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBwbGF5U291bmQobmFtZTogc3RyaW5nLCBwb3NpdGlvbj86IFRIUkVFLlZlY3RvcjMpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBidWZmZXIgPSB0aGlzLmFzc2V0c1tuYW1lXTtcclxuICAgICAgICBpZiAoYnVmZmVyIGluc3RhbmNlb2YgQXVkaW9CdWZmZXIpIHtcclxuICAgICAgICAgICAgY29uc3Qgc291bmQgPSBuZXcgVEhSRUUuUG9zaXRpb25hbEF1ZGlvKHRoaXMuYXVkaW9MaXN0ZW5lcik7XHJcbiAgICAgICAgICAgIHNvdW5kLnNldEJ1ZmZlcihidWZmZXIpO1xyXG4gICAgICAgICAgICBjb25zdCBzb3VuZENvbmZpZyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gbmFtZSk7XHJcbiAgICAgICAgICAgIGlmIChzb3VuZENvbmZpZykge1xyXG4gICAgICAgICAgICAgICAgc291bmQuc2V0Vm9sdW1lKHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lZmZlY3RWb2x1bWUgKiBzb3VuZENvbmZpZy52b2x1bWUpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCBjb25maWcgZm9yICR7bmFtZX0gbm90IGZvdW5kLCB1c2luZyBkZWZhdWx0IGVmZmVjdCB2b2x1bWUuYCk7XHJcbiAgICAgICAgICAgICAgICBzb3VuZC5zZXRWb2x1bWUodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVmZmVjdFZvbHVtZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgc291bmQuc2V0UmVmRGlzdGFuY2UoNSk7IC8vIEhvdyBmYXIgdGhlIHNvdW5kIGNhbiBiZSBoZWFyZFxyXG4gICAgICAgICAgICBzb3VuZC5hdXRvcGxheSA9IHRydWU7XHJcbiAgICAgICAgICAgIHNvdW5kLnNldExvb3AoZmFsc2UpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHBvc2l0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvYmplY3QgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuICAgICAgICAgICAgICAgIG9iamVjdC5wb3NpdGlvbi5jb3B5KHBvc2l0aW9uKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKG9iamVjdCk7XHJcbiAgICAgICAgICAgICAgICBvYmplY3QuYWRkKHNvdW5kKTtcclxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4geyAvLyBSZW1vdmUgc291bmQgb2JqZWN0IGFmdGVyIGEgc2hvcnQgZGVsYXlcclxuICAgICAgICAgICAgICAgICAgICBzb3VuZC5kaXNjb25uZWN0KCk7IC8vIERpc2Nvbm5lY3Qgc291bmQgc291cmNlXHJcbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0LnJlbW92ZShzb3VuZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUob2JqZWN0KTtcclxuICAgICAgICAgICAgICAgIH0sICgoc291bmRDb25maWc/LmR1cmF0aW9uX3NlY29uZHMgfHwgMSkgKiAxMDAwKSArIDUwMCk7IC8vIEFkZCA1MDBtcyBzYWZldHlcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIElmIG5vIHBvc2l0aW9uLCBwbGF5IGFzIG5vbi1wb3NpdGlvbmFsIGF1ZGlvIChlLmcuLCBVSSBzb3VuZHMpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBnbG9iYWxTb3VuZCA9IG5ldyBUSFJFRS5BdWRpbyh0aGlzLmF1ZGlvTGlzdGVuZXIpO1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsU291bmQuc2V0QnVmZmVyKGJ1ZmZlcik7XHJcbiAgICAgICAgICAgICAgICBpZiAoc291bmRDb25maWcpIHtcclxuICAgICAgICAgICAgICAgICAgICBnbG9iYWxTb3VuZC5zZXRWb2x1bWUodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVmZmVjdFZvbHVtZSAqIHNvdW5kQ29uZmlnLnZvbHVtZSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgU291bmQgY29uZmlnIGZvciAke25hbWV9IG5vdCBmb3VuZCwgdXNpbmcgZGVmYXVsdCBlZmZlY3Qgdm9sdW1lLmApO1xyXG4gICAgICAgICAgICAgICAgICAgIGdsb2JhbFNvdW5kLnNldFZvbHVtZSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZWZmZWN0Vm9sdW1lKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGdsb2JhbFNvdW5kLmF1dG9wbGF5ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGdsb2JhbFNvdW5kLnNldExvb3AoZmFsc2UpO1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsU291bmQucGxheSgpO1xyXG4gICAgICAgICAgICAgICAgLy8gRm9yIG5vbi1wb3NpdGlvbmFsIHNvdW5kcywgd2Ugc2hvdWxkIGFsc28gbWFuYWdlIHRoZWlyIGxpZmVjeWNsZSBpZiB0aGV5IGFyZSBzaG9ydC1saXZlZC5cclxuICAgICAgICAgICAgICAgIC8vIEZvciBzaW1wbGljaXR5LCB3ZSBhc3N1bWUgdGhleSBwbGF5IGFuZCBldmVudHVhbGx5IGdldCBnYXJiYWdlIGNvbGxlY3RlZC5cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0QkdNKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGJnbUJ1ZmZlciA9IHRoaXMuYXNzZXRzWydiZ20nXTtcclxuICAgICAgICBpZiAoYmdtQnVmZmVyIGluc3RhbmNlb2YgQXVkaW9CdWZmZXIpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuYmdtU291bmQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtU291bmQuc3RvcCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZC5kaXNjb25uZWN0KCk7IC8vIERpc2Nvbm5lY3QgcHJldmlvdXMgc291bmQgc291cmNlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZCA9IG5ldyBUSFJFRS5BdWRpbyh0aGlzLmF1ZGlvTGlzdGVuZXIpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdW5kLnNldEJ1ZmZlcihiZ21CdWZmZXIpO1xyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdW5kLnNldExvb3AodHJ1ZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJnbUNvbmZpZyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMuZmluZChzID0+IHMubmFtZSA9PT0gJ2JnbScpO1xyXG4gICAgICAgICAgICBpZiAoYmdtQ29uZmlnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVNvdW5kLnNldFZvbHVtZSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubXVzaWNWb2x1bWUgKiBiZ21Db25maWcudm9sdW1lKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgQkdNIGNvbmZpZyBub3QgZm91bmQsIHVzaW5nIGRlZmF1bHQgbXVzaWMgdm9sdW1lLmApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZC5zZXRWb2x1bWUodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm11c2ljVm9sdW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdW5kLnBsYXkoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVVSSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGhGaWxsRWxlbWVudCkgeyAvLyBBZGRlZCBudWxsIGNoZWNrXHJcbiAgICAgICAgICAgIHRoaXMuaGVhbHRoRmlsbEVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHtNYXRoLm1heCgwLCB0aGlzLnBsYXllckhlYWx0aCl9JWA7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLnNjb3JlVmFsdWVFbGVtZW50KSB7IC8vIEFkZGVkIG51bGwgY2hlY2tcclxuICAgICAgICAgICAgdGhpcy5zY29yZVZhbHVlRWxlbWVudC5pbm5lclRleHQgPSB0aGlzLnNjb3JlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmVuZW1pZXNBbGl2ZVZhbHVlRWxlbWVudCkgeyAvLyBBZGRlZCBudWxsIGNoZWNrXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllc0FsaXZlVmFsdWVFbGVtZW50LmlubmVyVGV4dCA9IHRoaXMuZW5lbWllc0FsaXZlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSAnR0FNRV9PVkVSJztcclxuICAgICAgICB0aGlzLnNob3dHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgIC8vIFJlbGVhc2UgcG9pbnRlciBsb2NrXHJcbiAgICAgICAgZG9jdW1lbnQuZXhpdFBvaW50ZXJMb2NrKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbldpbmRvd1Jlc2l6ZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHdpbmRvdy5pbm5lcldpZHRoLCB3aW5kb3cuaW5uZXJIZWlnaHQpO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBHbG9iYWwgaW5pdGlhbGl6ZXIgZnVuY3Rpb24sIGNhbGxlZCBmcm9tIEhUTUxcclxuYXN5bmMgZnVuY3Rpb24gaW5pdEdhbWVGcm9tSFRNTCgpIHtcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGRhdGEuanNvbicpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgIGNvbnN0IGdhbWUgPSBuZXcgR2FtZSgnZ2FtZUNhbnZhcycsIGNvbmZpZyk7XHJcbiAgICBhd2FpdCBnYW1lLnN0YXJ0KCk7XHJcbn1cclxuXHJcbi8vIEVuc3VyZSB0aGUgaW5pdEdhbWVGcm9tSFRNTCBmdW5jdGlvbiBpcyBjYWxsZWQgd2hlbiB0aGUgRE9NIGlzIHJlYWR5XHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBpbml0R2FtZUZyb21IVE1MKTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsMkJBQTJCO0FBd0RwQyxNQUFNLEtBQUs7QUFBQSxFQTZDUCxZQUFZLFVBQWtCLFlBQXdCO0FBcEN0RCxTQUFRLGFBQWdDO0FBR3hDLFNBQVEsV0FBbUI7QUFDM0IsU0FBUSxTQUFvQixDQUFDO0FBRTdCLFNBQVEsV0FBK0I7QUFFdkM7QUFBQSxTQUFRLFVBQW9CLENBQUM7QUFDN0IsU0FBUSxVQUFtQixDQUFDO0FBQzVCLFNBQVEsUUFBZ0I7QUFFeEIsU0FBUSxlQUF1QjtBQWdCL0I7QUFBQSxTQUFpQixtQkFBbUI7QUFBQSxNQUNoQyxRQUFRO0FBQUEsTUFDUixRQUFRO0FBQUEsTUFDUixPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsTUFDUixNQUFNO0FBQUEsSUFDVjtBQUdJLFNBQUssU0FBUztBQUNkLFNBQUss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
