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
    this.titleScreenElement.addEventListener("click", this.onTitleScreenClick.bind(this), false);
    this.gameOverScreenElement.addEventListener("click", this.onGameOverScreenClick.bind(this), false);
    this.setupScene();
    this.setupPhysics();
  }
  async start() {
    this.showTitleScreen();
    await this.preloadAssets();
    console.log("Assets loaded. Waiting for user input to start game.");
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
    document.getElementById("finalScore").innerText = this.score.toString();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuaW1wb3J0IHsgUG9pbnRlckxvY2tDb250cm9scyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS9jb250cm9scy9Qb2ludGVyTG9ja0NvbnRyb2xzLmpzJztcclxuXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlOiBzdHJpbmc7XHJcbiAgICAgICAgcGxheWVyU3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBwbGF5ZXJKdW1wRm9yY2U6IG51bWJlcjtcclxuICAgICAgICBwbGF5ZXJIZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIGJ1bGxldERhbWFnZTogbnVtYmVyO1xyXG4gICAgICAgIGJ1bGxldExpZmV0aW1lOiBudW1iZXI7XHJcbiAgICAgICAgZW5lbXlDb3VudDogbnVtYmVyO1xyXG4gICAgICAgIGVuZW15U3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBlbmVteUhlYWx0aDogbnVtYmVyO1xyXG4gICAgICAgIGVuZW15RGFtYWdlOiBudW1iZXI7XHJcbiAgICAgICAgZW5lbXlBdHRhY2tDb29sZG93bjogbnVtYmVyO1xyXG4gICAgICAgIGdyYXZpdHk6IG51bWJlcjtcclxuICAgICAgICBmbG9vclNpemU6IG51bWJlcjtcclxuICAgICAgICB3YWxsSGVpZ2h0OiBudW1iZXI7XHJcbiAgICAgICAgaW5pdGlhbFNwYXduQXJlYTogbnVtYmVyO1xyXG4gICAgICAgIG11c2ljVm9sdW1lOiBudW1iZXI7XHJcbiAgICAgICAgZWZmZWN0Vm9sdW1lOiBudW1iZXI7XHJcbiAgICB9O1xyXG4gICAgY29sb3JzOiB7XHJcbiAgICAgICAgc2t5Q29sb3I6IHN0cmluZztcclxuICAgICAgICBmbG9vckNvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgd2FsbENvbG9yOiBzdHJpbmc7XHJcbiAgICAgICAgcGxheWVyQ29sb3I6IHN0cmluZzsgLy8gRGVidWcgY29sb3IgZm9yIHBsYXllciBib2R5LCBub3QgZGlyZWN0bHkgdmlzaWJsZSBpbiBGUFMgdmlld1xyXG4gICAgICAgIGVuZW15Q29sb3I6IHN0cmluZztcclxuICAgICAgICBidWxsZXRDb2xvcjogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIGltYWdlczogeyBuYW1lOiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IH1bXTtcclxuICAgICAgICBzb3VuZHM6IHsgbmFtZTogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGR1cmF0aW9uX3NlY29uZHM6IG51bWJlcjsgdm9sdW1lOiBudW1iZXI7IH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lQXNzZXQge1xyXG4gICAgW2tleTogc3RyaW5nXTogVEhSRUUuVGV4dHVyZSB8IEF1ZGlvQnVmZmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQnVsbGV0IHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIGxpZmV0aW1lOiBudW1iZXI7XHJcbiAgICBtYXhMaWZldGltZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgRW5lbXkge1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBsYXN0QXR0YWNrVGltZTogbnVtYmVyO1xyXG4gICAgYXR0YWNrQ29vbGRvd246IG51bWJlcjtcclxufVxyXG5cclxuY2xhc3MgR2FtZSB7XHJcbiAgICBwcml2YXRlIGNvbmZpZzogR2FtZUNvbmZpZztcclxuICAgIHByaXZhdGUgY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgIHByaXZhdGUgc2NlbmU6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG4gICAgcHJpdmF0ZSByZW5kZXJlcjogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICAgIHByaXZhdGUgY29udHJvbHM6IFBvaW50ZXJMb2NrQ29udHJvbHM7IC8vIFBvaW50ZXJMb2NrQ29udHJvbHNcclxuICAgIHByaXZhdGUgd29ybGQ6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keTogQ0FOTk9OLkJvZHk7XHJcbiAgICBwcml2YXRlIHBsYXllck1lc2g6IFRIUkVFLk1lc2ggfCBudWxsID0gbnVsbDsgLy8gRGVidWcvcGxhY2Vob2xkZXIgbWVzaCwgdHlwaWNhbGx5IGludmlzaWJsZSBpbiBGUFNcclxuICAgIHByaXZhdGUgY2FuSnVtcDogYm9vbGVhbjtcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH07XHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBudW1iZXIgPSAwO1xyXG4gICAgcHJpdmF0ZSBhc3NldHM6IEdhbWVBc3NldCA9IHt9O1xyXG4gICAgcHJpdmF0ZSBhdWRpb0xpc3RlbmVyOiBUSFJFRS5BdWRpb0xpc3RlbmVyO1xyXG4gICAgcHJpdmF0ZSBiZ21Tb3VuZDogVEhSRUUuQXVkaW8gfCBudWxsID0gbnVsbDsgLy8gRml4OiBSZW1vdmVkIEF1ZGlvQnVmZmVyIGdlbmVyaWMgdHlwZVxyXG5cclxuICAgIHByaXZhdGUgYnVsbGV0czogQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgZW5lbWllczogRW5lbXlbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuICAgIHByaXZhdGUgcGxheWVySGVhbHRoOiBudW1iZXI7XHJcbiAgICBwcml2YXRlIGVuZW1pZXNBbGl2ZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBwcml2YXRlIGZsb29yQm9keTogQ0FOTk9OLkJvZHk7XHJcblxyXG4gICAgLy8gVUkgRWxlbWVudHNcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5FbGVtZW50OiBIVE1MRWxlbWVudDtcclxuICAgIHByaXZhdGUgZ2FtZU92ZXJTY3JlZW5FbGVtZW50OiBIVE1MRWxlbWVudDtcclxuICAgIHByaXZhdGUgaHVkRWxlbWVudDogSFRNTEVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIGhlYWx0aEZpbGxFbGVtZW50OiBIVE1MRWxlbWVudDtcclxuICAgIHByaXZhdGUgc2NvcmVWYWx1ZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBlbmVtaWVzQWxpdmVWYWx1ZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xyXG5cclxuICAgIC8vIEdhbWUgU3RhdGVcclxuICAgIHByaXZhdGUgZ2FtZVN0YXRlOiAnVElUTEVfU0NSRUVOJyB8ICdQTEFZSU5HJyB8ICdHQU1FX09WRVInO1xyXG5cclxuICAgIC8vIENvbGxpc2lvbiBncm91cHMgZm9yIENhbm5vbi5qc1xyXG4gICAgcHJpdmF0ZSByZWFkb25seSBDT0xMSVNJT05fR1JPVVBTID0ge1xyXG4gICAgICAgIFBMQVlFUjogMSxcclxuICAgICAgICBHUk9VTkQ6IDIsXHJcbiAgICAgICAgRU5FTVk6IDQsXHJcbiAgICAgICAgQlVMTEVUOiA4LFxyXG4gICAgICAgIFdBTEw6IDE2XHJcbiAgICB9O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhbnZhc0lkOiBzdHJpbmcsIGNvbmZpZ0RhdGE6IEdhbWVDb25maWcpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZyA9IGNvbmZpZ0RhdGE7XHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChjYW52YXNJZCkgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aDtcclxuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcblxyXG4gICAgICAgIHRoaXMucGxheWVySGVhbHRoID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckhlYWx0aDtcclxuICAgICAgICB0aGlzLmNhbkp1bXAgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMua2V5cyA9IHt9O1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cyA9IFtdO1xyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMuZW5lbWllc0FsaXZlID0gMDtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9ICdUSVRMRV9TQ1JFRU4nO1xyXG5cclxuICAgICAgICAvLyBVSSBFbGVtZW50IFJlZmVyZW5jZXNcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0aXRsZVNjcmVlbicpITtcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lT3ZlclNjcmVlbicpITtcclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaHVkJykhO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoRmlsbEVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaGVhbHRoRmlsbCcpITtcclxuICAgICAgICB0aGlzLnNjb3JlVmFsdWVFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Njb3JlVmFsdWUnKSE7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzQWxpdmVWYWx1ZUVsZW1lbnQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZW5lbWllc0FsaXZlVmFsdWUnKSE7XHJcblxyXG4gICAgICAgIC8vIEV2ZW50IExpc3RlbmVyc1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCB0aGlzLm9uV2luZG93UmVzaXplLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24uYmluZCh0aGlzKSwgZmFsc2UpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwLmJpbmQodGhpcyksIGZhbHNlKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm9uTW91c2VEb3duLmJpbmQodGhpcyksIGZhbHNlKTtcclxuXHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbkVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLm9uVGl0bGVTY3JlZW5DbGljay5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLm9uR2FtZU92ZXJTY3JlZW5DbGljay5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcblxyXG4gICAgICAgIC8vIEluaXRpYWwgc2V0dXAgZm9yIFRocmVlLmpzIGFuZCBDYW5ub24uanNcclxuICAgICAgICB0aGlzLnNldHVwU2NlbmUoKTtcclxuICAgICAgICB0aGlzLnNldHVwUGh5c2ljcygpO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRoaXMuc2hvd1RpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgYXdhaXQgdGhpcy5wcmVsb2FkQXNzZXRzKCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCJBc3NldHMgbG9hZGVkLiBXYWl0aW5nIGZvciB1c2VyIGlucHV0IHRvIHN0YXJ0IGdhbWUuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2hvd1RpdGxlU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XHJcbiAgICAgICAgdGhpcy5oaWRlSFVEKCk7XHJcbiAgICAgICAgdGhpcy5oaWRlR2FtZU92ZXJTY3JlZW4oKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhpZGVUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2hvd0hVRCgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmh1ZEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoaWRlSFVEKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaHVkRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2hvd0dhbWVPdmVyU2NyZWVuKCk6IHZvaWQge1xyXG4gICAgICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmluYWxTY29yZScpIGFzIEhUTUxFbGVtZW50KS5pbm5lclRleHQgPSB0aGlzLnNjb3JlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgdGhpcy5nYW1lT3ZlclNjcmVlbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcclxuICAgICAgICB0aGlzLmhpZGVIVUQoKTtcclxuICAgICAgICB0aGlzLmJnbVNvdW5kPy5zdG9wKCk7XHJcbiAgICAgICAgdGhpcy5iZ21Tb3VuZD8uZGlzY29ubmVjdCgpOyAvLyBEaXNjb25uZWN0IEJHTSBvbiBnYW1lIG92ZXJcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhpZGVHYW1lT3ZlclNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVPdmVyU2NyZWVuRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25UaXRsZVNjcmVlbkNsaWNrKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gJ1RJVExFX1NDUkVFTicpIHtcclxuICAgICAgICAgICAgdGhpcy5oaWRlVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbkdhbWVPdmVyU2NyZWVuQ2xpY2soKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSAnR0FNRV9PVkVSJykge1xyXG4gICAgICAgICAgICB0aGlzLmhpZGVHYW1lT3ZlclNjcmVlbigpO1xyXG4gICAgICAgICAgICB0aGlzLnJlc3RhcnRHYW1lKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgcHJlbG9hZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBhdWRpb0xvYWRlciA9IG5ldyBUSFJFRS5BdWRpb0xvYWRlcigpO1xyXG5cclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIHRleHR1cmVMb2FkZXIubG9hZChpbWcucGF0aCxcclxuICAgICAgICAgICAgICAgICAgICAodGV4dHVyZTogVEhSRUUuVGV4dHVyZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFzc2V0c1tpbWcubmFtZV0gPSB0ZXh0dXJlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsIC8vIG9uUHJvZ3Jlc3NcclxuICAgICAgICAgICAgICAgICAgICAoZXJyOiBFcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIGltYWdlICR7aW1nLm5hbWV9OmAsIGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc25kID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgICAgIGF1ZGlvTG9hZGVyLmxvYWQoc25kLnBhdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgKGJ1ZmZlcjogQXVkaW9CdWZmZXIpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5hc3NldHNbc25kLm5hbWVdID0gYnVmZmVyO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgICAgICB1bmRlZmluZWQsIC8vIG9uUHJvZ3Jlc3NcclxuICAgICAgICAgICAgICAgICAgICAoZXJyOiBFcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIHNvdW5kICR7c25kLm5hbWV9OmAsIGVycik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdChlcnIpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwiQWxsIGFzc2V0cyBsb2FkZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBTY2VuZSgpOiB2b2lkIHtcclxuICAgICAgICAvLyBTY2VuZVxyXG4gICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuXHJcbiAgICAgICAgLy8gQ2FtZXJhXHJcbiAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoNzUsIHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0LCAwLjEsIDEwMDApO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnNldCgwLCAyLCAwKTsgLy8gUGxheWVyIGluaXRpYWwgcG9zaXRpb24gc2xpZ2h0bHkgYWJvdmUgZ3JvdW5kXHJcblxyXG4gICAgICAgIC8vIFJlbmRlcmVyXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHsgY2FudmFzOiB0aGlzLmNhbnZhcywgYW50aWFsaWFzOiB0cnVlIH0pO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0KTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldENsZWFyQ29sb3IobmV3IFRIUkVFLkNvbG9yKHRoaXMuY29uZmlnLmNvbG9ycy5za3lDb2xvcikpO1xyXG5cclxuICAgICAgICAvLyBBdWRpbyBMaXN0ZW5lclxyXG4gICAgICAgIHRoaXMuYXVkaW9MaXN0ZW5lciA9IG5ldyBUSFJFRS5BdWRpb0xpc3RlbmVyKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYWRkKHRoaXMuYXVkaW9MaXN0ZW5lcik7XHJcblxyXG4gICAgICAgIC8vIExpZ2h0aW5nXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQobmV3IFRIUkVFLkFtYmllbnRMaWdodCgweDY2NjY2NikpO1xyXG4gICAgICAgIGNvbnN0IGRpckxpZ2h0ID0gbmV3IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQoMHhmZmZmZmYsIDAuOCk7XHJcbiAgICAgICAgZGlyTGlnaHQucG9zaXRpb24uc2V0KDEwLCAyMCwgMTApO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpckxpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gU2t5Ym94XHJcbiAgICAgICAgY29uc3Qgc2t5Ym94SW1hZ2VOYW1lcyA9IFsnc2t5Ym94X3B4JywgJ3NreWJveF9ueCcsICdza3lib3hfcHknLCAnc2t5Ym94X255JywgJ3NreWJveF9weicsICdza3lib3hfbnonXTtcclxuICAgICAgICBjb25zdCBtYXRlcmlhbHMgPSBza3lib3hJbWFnZU5hbWVzLm1hcChuYW1lID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYXNzZXQgPSB0aGlzLmFzc2V0c1tuYW1lXTtcclxuICAgICAgICAgICAgaWYgKGFzc2V0IGluc3RhbmNlb2YgVEhSRUUuVGV4dHVyZSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IG1hcDogYXNzZXQsIHNpZGU6IFRIUkVFLkJhY2tTaWRlIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiB1c2Ugc2t5Q29sb3IgZnJvbSBjb25maWdcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IGNvbG9yOiBuZXcgVEhSRUUuQ29sb3IodGhpcy5jb25maWcuY29sb3JzLnNreUNvbG9yKSwgc2lkZTogVEhSRUUuQmFja1NpZGUgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3Qgc2t5Ym94ID0gbmV3IFRIUkVFLk1lc2gobmV3IFRIUkVFLkJveEdlb21ldHJ5KDEwMDAsIDEwMDAsIDEwMDApLCBtYXRlcmlhbHMpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHNreWJveCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cFBoeXNpY3MoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy53b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcclxuICAgICAgICB0aGlzLndvcmxkLmdyYXZpdHkuc2V0KDAsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncmF2aXR5LCAwKTtcclxuICAgICAgICB0aGlzLndvcmxkLmJyb2FkcGhhc2UgPSBuZXcgQ0FOTk9OLlNBUEJyb2FkcGhhc2UodGhpcy53b3JsZCk7IC8vIFBlcmZvcm1hbmNlIGltcHJvdmVtZW50XHJcbiAgICAgICAgdGhpcy53b3JsZC5hbGxvd1NsZWVwID0gdHJ1ZTsgLy8gT2JqZWN0cyBjYW4gXCJzbGVlcFwiIHdoZW4gbm90IG1vdmluZ1xyXG5cclxuICAgICAgICAvLyBQaHlzaWNzIG1hdGVyaWFsc1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbChcImdyb3VuZE1hdGVyaWFsXCIpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllck1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbChcInBsYXllck1hdGVyaWFsXCIpO1xyXG4gICAgICAgIGNvbnN0IGVuZW15TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKFwiZW5lbXlNYXRlcmlhbFwiKTtcclxuICAgICAgICBjb25zdCBidWxsZXRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoXCJidWxsZXRNYXRlcmlhbFwiKTtcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwobmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoZ3JvdW5kTWF0ZXJpYWwsIHBsYXllck1hdGVyaWFsLCB7IGZyaWN0aW9uOiAwLjEsIHJlc3RpdHV0aW9uOiAwLjAgfSkpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKGdyb3VuZE1hdGVyaWFsLCBlbmVteU1hdGVyaWFsLCB7IGZyaWN0aW9uOiAwLjUsIHJlc3RpdHV0aW9uOiAwLjAgfSkpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKHBsYXllck1hdGVyaWFsLCBlbmVteU1hdGVyaWFsLCB7IGZyaWN0aW9uOiAwLjAsIHJlc3RpdHV0aW9uOiAwLjAgfSkpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKGJ1bGxldE1hdGVyaWFsLCBlbmVteU1hdGVyaWFsLCB7IGZyaWN0aW9uOiAwLjAsIHJlc3RpdHV0aW9uOiAwLjAgfSkpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKGJ1bGxldE1hdGVyaWFsLCBncm91bmRNYXRlcmlhbCwgeyBmcmljdGlvbjogMC4wLCByZXN0aXR1dGlvbjogMC41IH0pKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChidWxsZXRNYXRlcmlhbCwgYnVsbGV0TWF0ZXJpYWwsIHsgZnJpY3Rpb246IDAuMCwgcmVzdGl0dXRpb246IDAuNSB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSAnUExBWUlORyc7XHJcbiAgICAgICAgdGhpcy5oaWRlVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICB0aGlzLnNob3dIVUQoKTtcclxuICAgICAgICB0aGlzLnBsYXllckhlYWx0aCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJIZWFsdGg7XHJcbiAgICAgICAgdGhpcy5zY29yZSA9IDA7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzQWxpdmUgPSAwO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cyA9IFtdO1xyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IFtdO1xyXG4gICAgICAgIHRoaXMua2V5cyA9IHt9O1xyXG4gICAgICAgIHRoaXMuY2FuSnVtcCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIENsZWFyIGV4aXN0aW5nIG9iamVjdHMgZnJvbSBzY2VuZSBhbmQgd29ybGRcclxuICAgICAgICB0aGlzLmNsZWFyR2FtZU9iamVjdHMoKTtcclxuXHJcbiAgICAgICAgdGhpcy5jcmVhdGVGbG9vcigpO1xyXG4gICAgICAgIHRoaXMuY3JlYXRlV2FsbHMoKTtcclxuICAgICAgICB0aGlzLmNyZWF0ZVBsYXllcigpO1xyXG4gICAgICAgIHRoaXMuY3JlYXRlRW5lbWllcyh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlDb3VudCk7XHJcblxyXG4gICAgICAgIHRoaXMuc3RhcnRCR00oKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZVVJKCk7XHJcblxyXG4gICAgICAgIC8vIFJlcXVlc3QgcG9pbnRlciBsb2NrIHRvIHN0YXJ0IEZQUyBjb250cm9sc1xyXG4gICAgICAgIHRoaXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZXN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpOyAvLyBSZS1pbml0aWFsaXplIGFuZCBzdGFydCBhIG5ldyBnYW1lXHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjbGVhckdhbWVPYmplY3RzKCk6IHZvaWQge1xyXG4gICAgICAgIC8vIFJlbW92ZSBvbGQgcGh5c2ljcyBib2RpZXNcclxuICAgICAgICB0aGlzLndvcmxkLmJvZGllcy5mb3JFYWNoKGJvZHkgPT4gdGhpcy53b3JsZC5yZW1vdmVCb2R5KGJvZHkpKTtcclxuICAgICAgICAvLyBSZW1vdmUgb2xkIG1lc2hlcyAoZXhjZXB0IHNreWJveCwgbGlnaHQsIGNhbWVyYSwgZXRjLilcclxuICAgICAgICBjb25zdCBvYmplY3RzVG9SZW1vdmUgPSB0aGlzLnNjZW5lLmNoaWxkcmVuLmZpbHRlcihvYmogPT5cclxuICAgICAgICAgICAgb2JqICE9PSB0aGlzLmNhbWVyYSAmJiBvYmogIT09IHRoaXMuYXVkaW9MaXN0ZW5lciAmJlxyXG4gICAgICAgICAgICBvYmogaW5zdGFuY2VvZiBUSFJFRS5NZXNoICYmICEob2JqLmdlb21ldHJ5IGluc3RhbmNlb2YgVEhSRUUuQm94R2VvbWV0cnkgJiYgQXJyYXkuaXNBcnJheShvYmoubWF0ZXJpYWwpICYmIG9iai5tYXRlcmlhbC5ldmVyeShtID0+IG0gaW5zdGFuY2VvZiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCAmJiBtLnNpZGUgPT09IFRIUkVFLkJhY2tTaWRlKSkgLy8gS2VlcCBza3lib3hcclxuICAgICAgICApO1xyXG4gICAgICAgIG9iamVjdHNUb1JlbW92ZS5mb3JFYWNoKG9iaiA9PiB0aGlzLnNjZW5lLnJlbW92ZShvYmopKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGF5ZXIoKTogdm9pZCB7XHJcbiAgICAgICAgLy8gUGxheWVyIGJvZHkgKGNhcHN1bGUgZm9yIGJldHRlciBncm91bmQgY29udGFjdClcclxuICAgICAgICBjb25zdCBwbGF5ZXJTaGFwZSA9IG5ldyBDQU5OT04uQ3lsaW5kZXIoMC41LCAwLjUsIDEuOCwgMTYpOyAvLyByYWRpdXNUb3AsIHJhZGl1c0JvdHRvbSwgaGVpZ2h0LCBzZWdtZW50c1xyXG4gICAgICAgIHRoaXMucGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDUsIHNoYXBlOiBwbGF5ZXJTaGFwZSwgbGluZWFyRGFtcGluZzogMC45LCBhbmd1bGFyRGFtcGluZzogMC45IH0pO1xyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi5zZXQoMCwgMTAsIDApOyAvLyBTcGF3biBzbGlnaHRseSBpbiBhaXIgdG8gZmFsbCBvbnRvIGdyb3VuZFxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS5maXhlZFJvdGF0aW9uID0gdHJ1ZTsgLy8gUHJldmVudCBwbGF5ZXIgZnJvbSB0aXBwaW5nIG92ZXJcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkudXBkYXRlTWFzc1Byb3BlcnRpZXMoKTtcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuUExBWUVSO1xyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS5jb2xsaXNpb25GaWx0ZXJNYXNrID0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLkdST1VORCB8IHRoaXMuQ09MTElTSU9OX0dST1VQUy5FTkVNWSB8IHRoaXMuQ09MTElTSU9OX0dST1VQUy5XQUxMO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcImNvbGxpZGVcIiwgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmJvZHkgPT09IHRoaXMuZmxvb3JCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhbkp1bXAgPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFBvaW50ZXJMb2NrQ29udHJvbHNcclxuICAgICAgICB0aGlzLmNvbnRyb2xzID0gbmV3IFBvaW50ZXJMb2NrQ29udHJvbHModGhpcy5jYW1lcmEsIGRvY3VtZW50LmJvZHkpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuY29udHJvbHMub2JqZWN0KTsgLy8gVGhlIGNvbnRyb2xzIG9iamVjdCBpcyBhIFRIUkVFLk9iamVjdDNEIGNvbnRhaW5pbmcgdGhlIGNhbWVyYVxyXG5cclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpLCBmYWxzZSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxvY2tlcnJvcicsIHRoaXMub25Qb2ludGVyTG9ja0Vycm9yLmJpbmQodGhpcyksIGZhbHNlKTtcclxuXHJcbiAgICAgICAgLy8gRGVidWcgcGxheWVyIG1lc2ggKGludmlzaWJsZSBpbiBhY3R1YWwgZ2FtZSwgYnV0IGNhbiBiZSB1c2VmdWwgZm9yIGRldilcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5DeWxpbmRlckdlb21ldHJ5KDAuNSwgMC41LCAxLjgsIDE2KTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7IGNvbG9yOiBuZXcgVEhSRUUuQ29sb3IodGhpcy5jb25maWcuY29sb3JzLnBsYXllckNvbG9yKSwgd2lyZWZyYW1lOiB0cnVlLCB0cmFuc3BhcmVudDogdHJ1ZSwgb3BhY2l0eTogMCB9KTtcclxuICAgICAgICB0aGlzLnBsYXllck1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGF5ZXJHZW9tZXRyeSwgcGxheWVyTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMucGxheWVyTWVzaCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVGbG9vcigpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmbG9vclNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZmxvb3JTaXplO1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVBc3NldCA9IHRoaXMuYXNzZXRzWydmbG9vclRleHR1cmUnXTtcclxuICAgICAgICBsZXQgZmxvb3JUZXh0dXJlOiBUSFJFRS5UZXh0dXJlIHwgdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICBpZiAodGV4dHVyZUFzc2V0IGluc3RhbmNlb2YgVEhSRUUuVGV4dHVyZSkge1xyXG4gICAgICAgICAgICBmbG9vclRleHR1cmUgPSB0ZXh0dXJlQXNzZXQ7XHJcbiAgICAgICAgICAgIGZsb29yVGV4dHVyZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgICAgICBmbG9vclRleHR1cmUud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgZmxvb3JUZXh0dXJlLnJlcGVhdC5zZXQoZmxvb3JTaXplIC8gNSwgZmxvb3JTaXplIC8gNSk7IC8vIFJlcGVhdCB0ZXh0dXJlIGJhc2VkIG9uIGZsb29yIHNpemVcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGZsb29yR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoZmxvb3JTaXplLCAxLCBmbG9vclNpemUpO1xyXG4gICAgICAgIGNvbnN0IGZsb29yTWF0ZXJpYWxPcHRpb25zOiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsUGFyYW1ldGVycyA9IHt9O1xyXG4gICAgICAgIGlmIChmbG9vclRleHR1cmUpIHtcclxuICAgICAgICAgICAgZmxvb3JNYXRlcmlhbE9wdGlvbnMubWFwID0gZmxvb3JUZXh0dXJlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGZsb29yTWF0ZXJpYWxPcHRpb25zLmNvbG9yID0gbmV3IFRIUkVFLkNvbG9yKHRoaXMuY29uZmlnLmNvbG9ycy5mbG9vckNvbG9yKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZmxvb3JNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKGZsb29yTWF0ZXJpYWxPcHRpb25zKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBmbG9vck1lc2ggPSBuZXcgVEhSRUUuTWVzaChmbG9vckdlb21ldHJ5LCBmbG9vck1hdGVyaWFsKTtcclxuICAgICAgICBmbG9vck1lc2gucG9zaXRpb24ueSA9IC0wLjU7IC8vIFBsYWNlIGZsb29yIGJvdHRvbSBhdCB5PTBcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChmbG9vck1lc2gpO1xyXG5cclxuICAgICAgICB0aGlzLmZsb29yQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAgfSk7IC8vIFN0YXRpYyBib2R5XHJcbiAgICAgICAgdGhpcy5mbG9vckJvZHkuYWRkU2hhcGUobmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKGZsb29yU2l6ZSAvIDIsIDAuNSwgZmxvb3JTaXplIC8gMikpKTtcclxuICAgICAgICB0aGlzLmZsb29yQm9keS5wb3NpdGlvbi55ID0gLTAuNTtcclxuICAgICAgICB0aGlzLmZsb29yQm9keS5jb2xsaXNpb25GaWx0ZXJHcm91cCA9IHRoaXMuQ09MTElTSU9OX0dST1VQUy5HUk9VTkQ7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZmxvb3JCb2R5KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZVdhbGxzKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGZsb29yU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5mbG9vclNpemU7XHJcbiAgICAgICAgY29uc3Qgd2FsbEhlaWdodCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy53YWxsSGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IHdhbGxUaGlja25lc3MgPSAxO1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVBc3NldCA9IHRoaXMuYXNzZXRzWyd3YWxsVGV4dHVyZSddO1xyXG4gICAgICAgIGxldCB3YWxsVGV4dHVyZTogVEhSRUUuVGV4dHVyZSB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKHRleHR1cmVBc3NldCBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUpIHtcclxuICAgICAgICAgICAgd2FsbFRleHR1cmUgPSB0ZXh0dXJlQXNzZXQ7XHJcbiAgICAgICAgICAgIHdhbGxUZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgIHdhbGxUZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgIC8vIEV4YW1wbGU6IEFkanVzdCByZXBlYXQgYmFzZWQgb24gd2FsbCBkaW1lbnNpb25zXHJcbiAgICAgICAgICAgIC8vIHdhbGxUZXh0dXJlLnJlcGVhdC5zZXQoZmxvb3JTaXplIC8gNSwgd2FsbEhlaWdodCAvIDUpOyBcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHdhbGxNYXRlcmlhbE9wdGlvbnM6IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWxQYXJhbWV0ZXJzID0ge307XHJcbiAgICAgICAgaWYgKHdhbGxUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIHdhbGxNYXRlcmlhbE9wdGlvbnMubWFwID0gd2FsbFRleHR1cmU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgd2FsbE1hdGVyaWFsT3B0aW9ucy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcih0aGlzLmNvbmZpZy5jb2xvcnMud2FsbENvbG9yKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3Qgd2FsbE1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwod2FsbE1hdGVyaWFsT3B0aW9ucyk7XHJcblxyXG4gICAgICAgIGNvbnN0IGNyZWF0ZVdhbGwgPSAoeDogbnVtYmVyLCB5OiBudW1iZXIsIHo6IG51bWJlciwgc3g6IG51bWJlciwgc3k6IG51bWJlciwgc3o6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB3YWxsR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoc3gsIHN5LCBzeik7XHJcbiAgICAgICAgICAgIGNvbnN0IHdhbGxNZXNoID0gbmV3IFRIUkVFLk1lc2god2FsbEdlb21ldHJ5LCB3YWxsTWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICB3YWxsTWVzaC5wb3NpdGlvbi5zZXQoeCwgeSwgeik7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKHdhbGxNZXNoKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHdhbGxCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMCB9KTtcclxuICAgICAgICAgICAgd2FsbEJvZHkuYWRkU2hhcGUobmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKHN4IC8gMiwgc3kgLyAyLCBzeiAvIDIpKSk7XHJcbiAgICAgICAgICAgIHdhbGxCb2R5LnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcclxuICAgICAgICAgICAgd2FsbEJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuV0FMTDtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHdhbGxCb2R5KTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBGcm9udCB3YWxsXHJcbiAgICAgICAgY3JlYXRlV2FsbCgwLCB3YWxsSGVpZ2h0IC8gMiwgLWZsb29yU2l6ZSAvIDIsIGZsb29yU2l6ZSwgd2FsbEhlaWdodCwgd2FsbFRoaWNrbmVzcyk7XHJcbiAgICAgICAgLy8gQmFjayB3YWxsXHJcbiAgICAgICAgY3JlYXRlV2FsbCgwLCB3YWxsSGVpZ2h0IC8gMiwgZmxvb3JTaXplIC8gMiwgZmxvb3JTaXplLCB3YWxsSGVpZ2h0LCB3YWxsVGhpY2tuZXNzKTtcclxuICAgICAgICAvLyBMZWZ0IHdhbGxcclxuICAgICAgICBjcmVhdGVXYWxsKC1mbG9vclNpemUgLyAyLCB3YWxsSGVpZ2h0IC8gMiwgMCwgd2FsbFRoaWNrbmVzcywgd2FsbEhlaWdodCwgZmxvb3JTaXplKTtcclxuICAgICAgICAvLyBSaWdodCB3YWxsXHJcbiAgICAgICAgY3JlYXRlV2FsbChmbG9vclNpemUgLyAyLCB3YWxsSGVpZ2h0IC8gMiwgMCwgd2FsbFRoaWNrbmVzcywgd2FsbEhlaWdodCwgZmxvb3JTaXplKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZUVuZW1pZXMoY291bnQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGZsb29yU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5mbG9vclNpemU7XHJcbiAgICAgICAgY29uc3Qgc3Bhd25BcmVhID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmluaXRpYWxTcGF3bkFyZWE7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZUFzc2V0ID0gdGhpcy5hc3NldHNbJ2VuZW15VGV4dHVyZSddO1xyXG4gICAgICAgIGxldCBlbmVteVRleHR1cmU6IFRIUkVFLlRleHR1cmUgfCB1bmRlZmluZWQ7XHJcbiAgICAgICAgaWYgKHRleHR1cmVBc3NldCBpbnN0YW5jZW9mIFRIUkVFLlRleHR1cmUpIHtcclxuICAgICAgICAgICAgZW5lbXlUZXh0dXJlID0gdGV4dHVyZUFzc2V0O1xyXG4gICAgICAgICAgICBlbmVteVRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgZW5lbXlUZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBlbmVteVJhZGl1cyA9IDAuODtcclxuICAgICAgICBjb25zdCBlbmVteUhlaWdodCA9IDEuNjtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHggPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiBzcGF3bkFyZWE7XHJcbiAgICAgICAgICAgIGNvbnN0IHogPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiBzcGF3bkFyZWE7XHJcbiAgICAgICAgICAgIGNvbnN0IHkgPSBlbmVteUhlaWdodCAvIDI7IC8vIFNwYXduIGVuZW1pZXMgc2xpZ2h0bHkgYWJvdmUgZ3JvdW5kXHJcblxyXG4gICAgICAgICAgICBjb25zdCBlbmVteUdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KGVuZW15UmFkaXVzICogMiwgZW5lbXlIZWlnaHQsIGVuZW15UmFkaXVzICogMik7XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15TWF0ZXJpYWxPcHRpb25zOiBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsUGFyYW1ldGVycyA9IHt9O1xyXG4gICAgICAgICAgICBpZiAoZW5lbXlUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgICAgICBlbmVteU1hdGVyaWFsT3B0aW9ucy5tYXAgPSBlbmVteVRleHR1cmU7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBlbmVteU1hdGVyaWFsT3B0aW9ucy5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcih0aGlzLmNvbmZpZy5jb2xvcnMuZW5lbXlDb2xvcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgZW5lbXlNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKGVuZW15TWF0ZXJpYWxPcHRpb25zKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15TWVzaCA9IG5ldyBUSFJFRS5NZXNoKGVuZW15R2VvbWV0cnksIGVuZW15TWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICBlbmVteU1lc2gucG9zaXRpb24uc2V0KHgsIHksIHopO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChlbmVteU1lc2gpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZW5lbXlTaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhlbmVteVJhZGl1cywgZW5lbXlIZWlnaHQgLyAyLCBlbmVteVJhZGl1cykpO1xyXG4gICAgICAgICAgICBjb25zdCBlbmVteUJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAxMCwgc2hhcGU6IGVuZW15U2hhcGUsIGxpbmVhckRhbXBpbmc6IDAuOSwgYW5ndWxhckRhbXBpbmc6IDAuOSB9KTtcclxuICAgICAgICAgICAgZW5lbXlCb2R5LnBvc2l0aW9uLnNldCh4LCB5LCB6KTtcclxuICAgICAgICAgICAgZW5lbXlCb2R5LmZpeGVkUm90YXRpb24gPSB0cnVlO1xyXG4gICAgICAgICAgICBlbmVteUJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuRU5FTVk7XHJcbiAgICAgICAgICAgIGVuZW15Qm9keS5jb2xsaXNpb25GaWx0ZXJNYXNrID0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLkdST1VORCB8IHRoaXMuQ09MTElTSU9OX0dST1VQUy5QTEFZRVIgfCB0aGlzLkNPTExJU0lPTl9HUk9VUFMuQlVMTEVUIHwgdGhpcy5DT0xMSVNJT05fR1JPVVBTLldBTEw7XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keShlbmVteUJvZHkpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgbWVzaDogZW5lbXlNZXNoLFxyXG4gICAgICAgICAgICAgICAgYm9keTogZW5lbXlCb2R5LFxyXG4gICAgICAgICAgICAgICAgaGVhbHRoOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlIZWFsdGgsXHJcbiAgICAgICAgICAgICAgICBsYXN0QXR0YWNrVGltZTogMCxcclxuICAgICAgICAgICAgICAgIGF0dGFja0Nvb2xkb3duOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlBdHRhY2tDb29sZG93blxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzQWxpdmUrKztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhbmltYXRlKHRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSAhPT0gJ1BMQVlJTkcnKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGR0ID0gKHRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7XHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHRpbWU7XHJcblxyXG4gICAgICAgIGlmIChkdCA+IDEgLyAzMCkgeyAvLyBDYXAgZGVsdGEgdGltZSB0byBwcmV2ZW50IHBoeXNpY3MgZ2xpdGNoZXMgd2l0aCB2ZXJ5IGxhcmdlIGR0XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuc3RlcCgxIC8gNjAsIGR0LCAzKTsgLy8gRml4ZWQgdGltZSBzdGVwIGZvciBwaHlzaWNzXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZHQpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUGxheWVyIG1vdmVtZW50XHJcbiAgICAgICAgdGhpcy5oYW5kbGVQbGF5ZXJNb3ZlbWVudChkdCk7XHJcblxyXG4gICAgICAgIC8vIFN5bmMgVGhyZWUuanMgY2FtZXJhIHdpdGggQ2Fubm9uLmpzIHBsYXllciBib2R5XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgYW55KTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi55ICs9IDAuODsgLy8gQWRqdXN0IGNhbWVyYSB0byAnZXllIGxldmVsJ1xyXG4gICAgICAgIGlmICh0aGlzLnBsYXllck1lc2gpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWVzaC5xdWF0ZXJuaW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnF1YXRlcm5pb24gYXMgYW55KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBlbmVtaWVzXHJcbiAgICAgICAgdGhpcy51cGRhdGVFbmVtaWVzKGR0KTtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGJ1bGxldHNcclxuICAgICAgICB0aGlzLnVwZGF0ZUJ1bGxldHMoZHQpO1xyXG5cclxuICAgICAgICAvLyBSZW5kZXJcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSBVSVxyXG4gICAgICAgIHRoaXMudXBkYXRlVUkoKTtcclxuXHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZVBsYXllck1vdmVtZW50KGR0OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29udHJvbHMuaXNMb2NrZWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgaW5wdXRWZWxvY2l0eSA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyU3BlZWQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyU3BlZWQ7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ0tleVcnXSkgaW5wdXRWZWxvY2l0eS56IC09IHBsYXllclNwZWVkO1xyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ0tleVMnXSkgaW5wdXRWZWxvY2l0eS56ICs9IHBsYXllclNwZWVkO1xyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ0tleUEnXSkgaW5wdXRWZWxvY2l0eS54IC09IHBsYXllclNwZWVkO1xyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ0tleUQnXSkgaW5wdXRWZWxvY2l0eS54ICs9IHBsYXllclNwZWVkO1xyXG5cclxuICAgICAgICAvLyBBcHBseSBpbnB1dCB2ZWxvY2l0eSBpbiBjYW1lcmEgZGlyZWN0aW9uXHJcbiAgICAgICAgY29uc3QgcGxheWVyRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZERpcmVjdGlvbihwbGF5ZXJEaXJlY3Rpb24pOyAvLyBHZXQgZm9yd2FyZCBkaXJlY3Rpb24gb2YgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyRGlyZWN0aW9uLnkgPSAwOyAvLyBEb24ndCBtb3ZlIHVwL2Rvd24gZnJvbSBjYW1lcmEgcGl0Y2hcclxuICAgICAgICBwbGF5ZXJEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJpZ2h0RGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICByaWdodERpcmVjdGlvbi5jcm9zc1ZlY3RvcnModGhpcy5jYW1lcmEudXAsIHBsYXllckRpcmVjdGlvbik7IC8vIEdldCByaWdodCBkaXJlY3Rpb25cclxuXHJcbiAgICAgICAgY29uc3QgZmluYWxWZWxvY2l0eSA9IG5ldyBDQU5OT04uVmVjMygpO1xyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ0tleVcnXSB8fCB0aGlzLmtleXNbJ0tleVMnXSkge1xyXG4gICAgICAgICAgICBmaW5hbFZlbG9jaXR5LnggKz0gcGxheWVyRGlyZWN0aW9uLnggKiBpbnB1dFZlbG9jaXR5Lno7XHJcbiAgICAgICAgICAgIGZpbmFsVmVsb2NpdHkueiArPSBwbGF5ZXJEaXJlY3Rpb24ueiAqIGlucHV0VmVsb2NpdHkuejtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snS2V5QSddIHx8IHRoaXMua2V5c1snS2V5RCddKSB7XHJcbiAgICAgICAgICAgIGZpbmFsVmVsb2NpdHkueCArPSByaWdodERpcmVjdGlvbi54ICogaW5wdXRWZWxvY2l0eS54O1xyXG4gICAgICAgICAgICBmaW5hbFZlbG9jaXR5LnogKz0gcmlnaHREaXJlY3Rpb24ueiAqIGlucHV0VmVsb2NpdHkueDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFByZXNlcnZlIGN1cnJlbnQgdmVydGljYWwgdmVsb2NpdHkgKGdyYXZpdHksIGp1bXBzKVxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRZVmVsb2NpdHkgPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueTtcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkuc2V0KGZpbmFsVmVsb2NpdHkueCwgY3VycmVudFlWZWxvY2l0eSwgZmluYWxWZWxvY2l0eS56KTtcclxuXHJcbiAgICAgICAgLy8gSnVtcFxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ1NwYWNlJ10gJiYgdGhpcy5jYW5KdW1wKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckp1bXBGb3JjZTtcclxuICAgICAgICAgICAgdGhpcy5jYW5KdW1wID0gZmFsc2U7IC8vIFByZXZlbnQgbXVsdGlwbGUganVtcHNcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbktleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQuY29kZV0gPSB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25LZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5jb2RlXSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09ICdQTEFZSU5HJyAmJiB0aGlzLmNvbnRyb2xzLmlzTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5idXR0b24gPT09IDApIHsgLy8gTGVmdCBjbGlja1xyXG4gICAgICAgICAgICAgICAgdGhpcy5maXJlQnVsbGV0KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrQ2hhbmdlKCk6IHZvaWQge1xyXG4gICAgICAgIGlmIChkb2N1bWVudC5wb2ludGVyTG9ja0VsZW1lbnQgPT09IGRvY3VtZW50LmJvZHkpIHsgLy8gUmVtb3ZlZCBtb3pQb2ludGVyTG9ja0VsZW1lbnRcclxuICAgICAgICAgICAgdGhpcy5jb250cm9scy5pc0xvY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyTG9ja0NvbnRyb2xzOiBMb2NrZWQnKTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSAnUExBWUlORycpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtU291bmQ/LnBsYXkoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29udHJvbHMuaXNMb2NrZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXJMb2NrQ29udHJvbHM6IFVubG9ja2VkJyk7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gJ1BMQVlJTkcnKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVNvdW5kPy5wYXVzZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vIElmIHVubG9ja2VkIGR1cmluZyBnYW1lLCBwYXVzZSB0aGUgZ2FtZSBvciBzaG93IGEgbWVudVxyXG4gICAgICAgICAgICAvLyBGb3IgdGhpcyBzaW1wbGUgZ2FtZSwgd2UnbGwganVzdCBrZWVwIHBsYXlpbmcgYnV0IHdpdGhvdXQgY29udHJvbHNcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrRXJyb3IoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcignUG9pbnRlckxvY2tDb250cm9sczogRXJyb3InKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlcXVlc3RQb2ludGVyTG9jaygpOiB2b2lkIHtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LnJlcXVlc3RQb2ludGVyTG9jaygpOyAvLyBTaW1wbGlmaWVkIHRvIHVzZSBzdGFuZGFyZCByZXF1ZXN0UG9pbnRlckxvY2tcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZpcmVCdWxsZXQoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0U3BlZWQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0U3BlZWQ7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TGlmZXRpbWUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0TGlmZXRpbWU7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZUFzc2V0ID0gdGhpcy5hc3NldHNbJ2J1bGxldFRleHR1cmUnXTtcclxuICAgICAgICBsZXQgYnVsbGV0VGV4dHVyZTogVEhSRUUuVGV4dHVyZSB8IHVuZGVmaW5lZDtcclxuICAgICAgICBpZiAodGV4dHVyZUFzc2V0IGluc3RhbmNlb2YgVEhSRUUuVGV4dHVyZSkge1xyXG4gICAgICAgICAgICBidWxsZXRUZXh0dXJlID0gdGV4dHVyZUFzc2V0O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgYnVsbGV0R2VvbWV0cnkgPSBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoMC4yLCA4LCA4KTtcclxuICAgICAgICBjb25zdCBidWxsZXRNYXRlcmlhbE9wdGlvbnM6IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWxQYXJhbWV0ZXJzID0ge307XHJcbiAgICAgICAgaWYgKGJ1bGxldFRleHR1cmUpIHtcclxuICAgICAgICAgICAgYnVsbGV0TWF0ZXJpYWxPcHRpb25zLm1hcCA9IGJ1bGxldFRleHR1cmU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgYnVsbGV0TWF0ZXJpYWxPcHRpb25zLmNvbG9yID0gbmV3IFRIUkVFLkNvbG9yKHRoaXMuY29uZmlnLmNvbG9ycy5idWxsZXRDb2xvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGJ1bGxldE1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoYnVsbGV0TWF0ZXJpYWxPcHRpb25zKTtcclxuXHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWVzaCA9IG5ldyBUSFJFRS5NZXNoKGJ1bGxldEdlb21ldHJ5LCBidWxsZXRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYnVsbGV0TWVzaCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1bGxldFNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoMC4yKTtcclxuICAgICAgICBjb25zdCBidWxsZXRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMC4xLCBzaGFwZTogYnVsbGV0U2hhcGUgfSk7XHJcbiAgICAgICAgYnVsbGV0Qm9keS5jb2xsaXNpb25GaWx0ZXJHcm91cCA9IHRoaXMuQ09MTElTSU9OX0dST1VQUy5CVUxMRVQ7XHJcbiAgICAgICAgYnVsbGV0Qm9keS5jb2xsaXNpb25GaWx0ZXJNYXNrID0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLkVORU1ZIHwgdGhpcy5DT0xMSVNJT05fR1JPVVBTLkdST1VORCB8IHRoaXMuQ09MTElTSU9OX0dST1VQUy5XQUxMO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keShidWxsZXRCb2R5KTtcclxuXHJcbiAgICAgICAgY29uc3QgcmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3Rlcih0aGlzLmNhbWVyYS5wb3NpdGlvbiwgdGhpcy5jYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24obmV3IFRIUkVFLlZlY3RvcjMoKSkpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFNwYXduT2Zmc2V0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICByYXljYXN0ZXIucmF5LmF0KDAuNSwgYnVsbGV0U3Bhd25PZmZzZXQpOyAvLyBTcGF3biBidWxsZXQgc2xpZ2h0bHkgaW4gZnJvbnQgb2YgY2FtZXJhXHJcblxyXG4gICAgICAgIGJ1bGxldEJvZHkucG9zaXRpb24uY29weShidWxsZXRTcGF3bk9mZnNldCBhcyBhbnkpO1xyXG5cclxuICAgICAgICBjb25zdCBidWxsZXREaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKGJ1bGxldERpcmVjdGlvbik7XHJcbiAgICAgICAgYnVsbGV0Qm9keS52ZWxvY2l0eS5jb3B5KGJ1bGxldERpcmVjdGlvbi5tdWx0aXBseVNjYWxhcihidWxsZXRTcGVlZCkgYXMgYW55KTtcclxuXHJcbiAgICAgICAgYnVsbGV0Qm9keS5hZGRFdmVudExpc3RlbmVyKFwiY29sbGlkZVwiLCAoZXZlbnQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBldmVudC5ib2R5LnR5cGUgaXMgdmFsaWQsIG9yIHJlbHkgb24gbWFzcyB0byBkaXN0aW5ndWlzaCBzdGF0aWMva2luZW1hdGljXHJcbiAgICAgICAgICAgIGlmIChldmVudC5ib2R5Lm1hc3MgPT09IDAgfHwgZXZlbnQuYm9keS5jb2xsaXNpb25GaWx0ZXJHcm91cCA9PT0gdGhpcy5DT0xMSVNJT05fR1JPVVBTLkdST1VORCB8fCBldmVudC5ib2R5LmNvbGxpc2lvbkZpbHRlckdyb3VwID09PSB0aGlzLkNPTExJU0lPTl9HUk9VUFMuV0FMTCkge1xyXG4gICAgICAgICAgICAgICAgLy8gSGl0IGdyb3VuZCBvciB3YWxsLCBqdXN0IHJlbW92ZSBidWxsZXRcclxuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlQnVsbGV0KGJ1bGxldEJvZHkpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmJvZHkuY29sbGlzaW9uRmlsdGVyR3JvdXAgPT09IHRoaXMuQ09MTElTSU9OX0dST1VQUy5FTkVNWSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaGl0RW5lbXkgPSB0aGlzLmVuZW1pZXMuZmluZChlID0+IGUuYm9keSA9PT0gZXZlbnQuYm9keSk7XHJcbiAgICAgICAgICAgICAgICBpZiAoaGl0RW5lbXkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZW15VGFrZURhbWFnZShoaXRFbmVteSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldERhbWFnZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUJ1bGxldChidWxsZXRCb2R5KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLmJ1bGxldHMucHVzaCh7IG1lc2g6IGJ1bGxldE1lc2gsIGJvZHk6IGJ1bGxldEJvZHksIGxpZmV0aW1lOiAwLCBtYXhMaWZldGltZTogYnVsbGV0TGlmZXRpbWUgfSk7XHJcbiAgICAgICAgdGhpcy5wbGF5U291bmQoJ3Nob290JywgYnVsbGV0U3Bhd25PZmZzZXQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVtb3ZlQnVsbGV0KGJvZHlUb1JlbW92ZTogQ0FOTk9OLkJvZHkpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuYnVsbGV0cy5maW5kSW5kZXgoYiA9PiBiLmJvZHkgPT09IGJvZHlUb1JlbW92ZSk7XHJcbiAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICBjb25zdCBidWxsZXQgPSB0aGlzLmJ1bGxldHNbaW5kZXhdO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShidWxsZXQubWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShidWxsZXQuYm9keSk7XHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0cy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUJ1bGxldHMoZHQ6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLmJ1bGxldHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0ID0gdGhpcy5idWxsZXRzW2ldO1xyXG4gICAgICAgICAgICBidWxsZXQubGlmZXRpbWUgKz0gZHQ7XHJcblxyXG4gICAgICAgICAgICBpZiAoYnVsbGV0LmxpZmV0aW1lID4gYnVsbGV0Lm1heExpZmV0aW1lKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUJ1bGxldChidWxsZXQuYm9keSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQubWVzaC5wb3NpdGlvbi5jb3B5KGJ1bGxldC5ib2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQubWVzaC5xdWF0ZXJuaW9uLmNvcHkoYnVsbGV0LmJvZHkucXVhdGVybmlvbiBhcyBhbnkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlRW5lbWllcyhkdDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyUG9zaXRpb24gPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb247XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IHRoaXMuZW5lbWllcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgICAgICBjb25zdCBlbmVteSA9IHRoaXMuZW5lbWllc1tpXTtcclxuICAgICAgICAgICAgaWYgKGVuZW15LmhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBFbmVteSBhbHJlYWR5IGRlYWQsIHJlbW92ZSBpdFxyXG4gICAgICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoZW5lbXkubWVzaCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoZW5lbXkuYm9keSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5lbmVtaWVzQWxpdmUtLTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gMTAwO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5U291bmQoJ2VuZW15RGllJywgZW5lbXkuYm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIFNpbXBsZSBBSTogTW92ZSB0b3dhcmRzIHBsYXllclxyXG4gICAgICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICAgICAgICAgICAgcGxheWVyUG9zaXRpb24udnN1YihlbmVteS5ib2R5LnBvc2l0aW9uLCBkaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBkaXJlY3Rpb24ueSA9IDA7IC8vIE9ubHkgbW92ZSBvbiBob3Jpem9udGFsIHBsYW5lXHJcbiAgICAgICAgICAgIGRpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgICAgIGVuZW15LmJvZHkudmVsb2NpdHkueCA9IGRpcmVjdGlvbi54ICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15U3BlZWQ7XHJcbiAgICAgICAgICAgIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IGRpcmVjdGlvbi56ICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15U3BlZWQ7XHJcblxyXG4gICAgICAgICAgICAvLyBMb29rIGF0IHBsYXllciAodmlzdWFsIG9ubHkpXHJcbiAgICAgICAgICAgIGVuZW15Lm1lc2gubG9va0F0KHBsYXllclBvc2l0aW9uLngsIGVuZW15Lm1lc2gucG9zaXRpb24ueSwgcGxheWVyUG9zaXRpb24ueik7XHJcblxyXG4gICAgICAgICAgICAvLyBTeW5jIG1lc2ggd2l0aCBib2R5XHJcbiAgICAgICAgICAgIGVuZW15Lm1lc2gucG9zaXRpb24uY29weShlbmVteS5ib2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgICAgIGVuZW15Lm1lc2gucXVhdGVybmlvbi5jb3B5KGVuZW15LmJvZHkucXVhdGVybmlvbiBhcyBhbnkpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHBsYXllciBhdHRhY2tcclxuICAgICAgICAgICAgdGhpcy5jaGVja0VuZW15QXR0YWNrKGVuZW15LCBkdCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5lbmVtaWVzQWxpdmUgPT09IDAgJiYgdGhpcy5nYW1lU3RhdGUgPT09ICdQTEFZSU5HJykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkFsbCBlbmVtaWVzIGRlZmVhdGVkIVwiKTtcclxuICAgICAgICAgICAgLy8gT3B0aW9uYWxseSBzcGF3biBtb3JlIGVuZW1pZXMgb3IgZW5kIGdhbWVcclxuICAgICAgICAgICAgLy8gRm9yIG5vdywgbGV0J3MganVzdCBtYWtlIGl0IGEgd2luIGNvbmRpdGlvbiBpZiBhbGwgZW5lbWllcyBhcmUgZGVmZWF0ZWQuXHJcbiAgICAgICAgICAgIC8vIE9yLCBzcGF3biBtb3JlIGFmdGVyIGEgZGVsYXkuIEZvciBzaW1wbGUsIGxldCdzIGp1c3QgZW5kIHRoZSBnYW1lLlxyXG4gICAgICAgICAgICB0aGlzLmdhbWVPdmVyKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hlY2tFbmVteUF0dGFjayhlbmVteTogRW5lbXksIGR0OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBkaXN0YW5jZVRvUGxheWVyID0gZW5lbXkuYm9keS5wb3NpdGlvbi5kaXN0YW5jZVRvKHRoaXMucGxheWVyQm9keS5wb3NpdGlvbik7XHJcbiAgICAgICAgY29uc3QgYXR0YWNrUmFuZ2UgPSAxLjU7IC8vIERpc3RhbmNlIGZvciBlbmVteSB0byBhdHRhY2tcclxuXHJcbiAgICAgICAgaWYgKGRpc3RhbmNlVG9QbGF5ZXIgPCBhdHRhY2tSYW5nZSkge1xyXG4gICAgICAgICAgICBlbmVteS5sYXN0QXR0YWNrVGltZSArPSBkdDtcclxuICAgICAgICAgICAgaWYgKGVuZW15Lmxhc3RBdHRhY2tUaW1lID49IGVuZW15LmF0dGFja0Nvb2xkb3duKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllclRha2VEYW1hZ2UodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15RGFtYWdlKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheVNvdW5kKCdwbGF5ZXJIdXJ0JywgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIGFueSk7XHJcbiAgICAgICAgICAgICAgICBlbmVteS5sYXN0QXR0YWNrVGltZSA9IDA7IC8vIFJlc2V0IGNvb2xkb3duXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBlbmVteS5sYXN0QXR0YWNrVGltZSA9IGVuZW15LmF0dGFja0Nvb2xkb3duOyAvLyBSZWFkeSB0byBhdHRhY2sgaW1tZWRpYXRlbHkgd2hlbiBpbiByYW5nZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXllclRha2VEYW1hZ2UoZGFtYWdlOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnBsYXllckhlYWx0aCAtPSBkYW1hZ2U7XHJcbiAgICAgICAgaWYgKHRoaXMucGxheWVySGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJIZWFsdGggPSAwO1xyXG4gICAgICAgICAgICB0aGlzLmdhbWVPdmVyKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMudXBkYXRlVUkoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGVuZW15VGFrZURhbWFnZShlbmVteTogRW5lbXksIGRhbWFnZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgZW5lbXkuaGVhbHRoIC09IGRhbWFnZTtcclxuICAgICAgICB0aGlzLnBsYXlTb3VuZCgnaGl0JywgZW5lbXkuYm9keS5wb3NpdGlvbiBhcyBhbnkpO1xyXG4gICAgICAgIGlmIChlbmVteS5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAvLyBNYXJrIGZvciByZW1vdmFsIGluIHVwZGF0ZUVuZW1pZXMgbG9vcFxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIkVuZW15IGRlZmVhdGVkIVwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy51cGRhdGVVSSgpOyAvLyBUbyB1cGRhdGUgZW5lbXkgY291bnRcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIHBvc2l0aW9uPzogVEhSRUUuVmVjdG9yMyk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGJ1ZmZlciA9IHRoaXMuYXNzZXRzW25hbWVdO1xyXG4gICAgICAgIGlmIChidWZmZXIgaW5zdGFuY2VvZiBBdWRpb0J1ZmZlcikge1xyXG4gICAgICAgICAgICBjb25zdCBzb3VuZCA9IG5ldyBUSFJFRS5Qb3NpdGlvbmFsQXVkaW8odGhpcy5hdWRpb0xpc3RlbmVyKTtcclxuICAgICAgICAgICAgc291bmQuc2V0QnVmZmVyKGJ1ZmZlcik7XHJcbiAgICAgICAgICAgIGNvbnN0IHNvdW5kQ29uZmlnID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSBuYW1lKTtcclxuICAgICAgICAgICAgaWYgKHNvdW5kQ29uZmlnKSB7XHJcbiAgICAgICAgICAgICAgICBzb3VuZC5zZXRWb2x1bWUodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVmZmVjdFZvbHVtZSAqIHNvdW5kQ29uZmlnLnZvbHVtZSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFNvdW5kIGNvbmZpZyBmb3IgJHtuYW1lfSBub3QgZm91bmQsIHVzaW5nIGRlZmF1bHQgZWZmZWN0IHZvbHVtZS5gKTtcclxuICAgICAgICAgICAgICAgIHNvdW5kLnNldFZvbHVtZSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZWZmZWN0Vm9sdW1lKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzb3VuZC5zZXRSZWZEaXN0YW5jZSg1KTsgLy8gSG93IGZhciB0aGUgc291bmQgY2FuIGJlIGhlYXJkXHJcbiAgICAgICAgICAgIHNvdW5kLmF1dG9wbGF5ID0gdHJ1ZTtcclxuICAgICAgICAgICAgc291bmQuc2V0TG9vcChmYWxzZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAocG9zaXRpb24pIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG9iamVjdCA9IG5ldyBUSFJFRS5PYmplY3QzRCgpO1xyXG4gICAgICAgICAgICAgICAgb2JqZWN0LnBvc2l0aW9uLmNvcHkocG9zaXRpb24pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQob2JqZWN0KTtcclxuICAgICAgICAgICAgICAgIG9iamVjdC5hZGQoc291bmQpO1xyXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7IC8vIFJlbW92ZSBzb3VuZCBvYmplY3QgYWZ0ZXIgYSBzaG9ydCBkZWxheVxyXG4gICAgICAgICAgICAgICAgICAgIHNvdW5kLmRpc2Nvbm5lY3QoKTsgLy8gRGlzY29ubmVjdCBzb3VuZCBzb3VyY2VcclxuICAgICAgICAgICAgICAgICAgICBvYmplY3QucmVtb3ZlKHNvdW5kKTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShvYmplY3QpO1xyXG4gICAgICAgICAgICAgICAgfSwgKChzb3VuZENvbmZpZz8uZHVyYXRpb25fc2Vjb25kcyB8fCAxKSAqIDEwMDApICsgNTAwKTsgLy8gQWRkIDUwMG1zIHNhZmV0eVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gSWYgbm8gcG9zaXRpb24sIHBsYXkgYXMgbm9uLXBvc2l0aW9uYWwgYXVkaW8gKGUuZy4sIFVJIHNvdW5kcylcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdsb2JhbFNvdW5kID0gbmV3IFRIUkVFLkF1ZGlvKHRoaXMuYXVkaW9MaXN0ZW5lcik7XHJcbiAgICAgICAgICAgICAgICBnbG9iYWxTb3VuZC5zZXRCdWZmZXIoYnVmZmVyKTtcclxuICAgICAgICAgICAgICAgIGlmIChzb3VuZENvbmZpZykge1xyXG4gICAgICAgICAgICAgICAgICAgIGdsb2JhbFNvdW5kLnNldFZvbHVtZSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZWZmZWN0Vm9sdW1lICogc291bmRDb25maWcudm9sdW1lKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBTb3VuZCBjb25maWcgZm9yICR7bmFtZX0gbm90IGZvdW5kLCB1c2luZyBkZWZhdWx0IGVmZmVjdCB2b2x1bWUuYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgZ2xvYmFsU291bmQuc2V0Vm9sdW1lKHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lZmZlY3RWb2x1bWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZ2xvYmFsU291bmQuYXV0b3BsYXkgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgZ2xvYmFsU291bmQuc2V0TG9vcChmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICBnbG9iYWxTb3VuZC5wbGF5KCk7XHJcbiAgICAgICAgICAgICAgICAvLyBGb3Igbm9uLXBvc2l0aW9uYWwgc291bmRzLCB3ZSBzaG91bGQgYWxzbyBtYW5hZ2UgdGhlaXIgbGlmZWN5Y2xlIGlmIHRoZXkgYXJlIHNob3J0LWxpdmVkLlxyXG4gICAgICAgICAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHksIHdlIGFzc3VtZSB0aGV5IHBsYXkgYW5kIGV2ZW50dWFsbHkgZ2V0IGdhcmJhZ2UgY29sbGVjdGVkLlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRCR00oKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYmdtQnVmZmVyID0gdGhpcy5hc3NldHNbJ2JnbSddO1xyXG4gICAgICAgIGlmIChiZ21CdWZmZXIgaW5zdGFuY2VvZiBBdWRpb0J1ZmZlcikge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5iZ21Tb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5iZ21Tb3VuZC5zdG9wKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVNvdW5kLmRpc2Nvbm5lY3QoKTsgLy8gRGlzY29ubmVjdCBwcmV2aW91cyBzb3VuZCBzb3VyY2VcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmJnbVNvdW5kID0gbmV3IFRIUkVFLkF1ZGlvKHRoaXMuYXVkaW9MaXN0ZW5lcik7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291bmQuc2V0QnVmZmVyKGJnbUJ1ZmZlcik7XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291bmQuc2V0TG9vcCh0cnVlKTtcclxuICAgICAgICAgICAgY29uc3QgYmdtQ29uZmlnID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5maW5kKHMgPT4gcy5uYW1lID09PSAnYmdtJyk7XHJcbiAgICAgICAgICAgIGlmIChiZ21Db25maWcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuYmdtU291bmQuc2V0Vm9sdW1lKHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tdXNpY1ZvbHVtZSAqIGJnbUNvbmZpZy52b2x1bWUpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBCR00gY29uZmlnIG5vdCBmb3VuZCwgdXNpbmcgZGVmYXVsdCBtdXNpYyB2b2x1bWUuYCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJnbVNvdW5kLnNldFZvbHVtZSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubXVzaWNWb2x1bWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuYmdtU291bmQucGxheSgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZVVJKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoRmlsbEVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHtNYXRoLm1heCgwLCB0aGlzLnBsYXllckhlYWx0aCl9JWA7XHJcbiAgICAgICAgdGhpcy5zY29yZVZhbHVlRWxlbWVudC5pbm5lclRleHQgPSB0aGlzLnNjb3JlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzQWxpdmVWYWx1ZUVsZW1lbnQuaW5uZXJUZXh0ID0gdGhpcy5lbmVtaWVzQWxpdmUudG9TdHJpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdhbWVPdmVyKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gJ0dBTUVfT1ZFUic7XHJcbiAgICAgICAgdGhpcy5zaG93R2FtZU92ZXJTY3JlZW4oKTtcclxuICAgICAgICAvLyBSZWxlYXNlIHBvaW50ZXIgbG9ja1xyXG4gICAgICAgIGRvY3VtZW50LmV4aXRQb2ludGVyTG9jaygpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25XaW5kb3dSZXNpemUoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gd2luZG93LmlubmVyV2lkdGggLyB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh3aW5kb3cuaW5uZXJXaWR0aCwgd2luZG93LmlubmVySGVpZ2h0KTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gR2xvYmFsIGluaXRpYWxpemVyIGZ1bmN0aW9uLCBjYWxsZWQgZnJvbSBIVE1MXHJcbmFzeW5jIGZ1bmN0aW9uIGluaXRHYW1lRnJvbUhUTUwoKSB7XHJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBkYXRhLmpzb24nKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCBjb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICBjb25zdCBnYW1lID0gbmV3IEdhbWUoJ2dhbWVDYW52YXMnLCBjb25maWcpO1xyXG4gICAgYXdhaXQgZ2FtZS5zdGFydCgpO1xyXG59XHJcblxyXG4vLyBFbnN1cmUgdGhlIGluaXRHYW1lRnJvbUhUTUwgZnVuY3Rpb24gaXMgY2FsbGVkIHdoZW4gdGhlIERPTSBpcyByZWFkeVxyXG5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgaW5pdEdhbWVGcm9tSFRNTCk7Il0sCiAgIm1hcHBpbmdzIjogIkFBQUEsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksWUFBWTtBQUN4QixTQUFTLDJCQUEyQjtBQXdEcEMsTUFBTSxLQUFLO0FBQUEsRUE2Q1AsWUFBWSxVQUFrQixZQUF3QjtBQXBDdEQsU0FBUSxhQUFnQztBQUd4QyxTQUFRLFdBQW1CO0FBQzNCLFNBQVEsU0FBb0IsQ0FBQztBQUU3QixTQUFRLFdBQStCO0FBRXZDO0FBQUEsU0FBUSxVQUFvQixD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
