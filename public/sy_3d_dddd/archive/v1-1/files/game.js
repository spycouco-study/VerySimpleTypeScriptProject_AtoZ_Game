import * as THREE from "three";
import * as CANNON from "cannon-es";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  GameState2[GameState2["GAME_OVER"] = 2] = "GAME_OVER";
  GameState2[GameState2["WIN"] = 3] = "WIN";
  return GameState2;
})(GameState || {});
class AudioManager {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.buffers = /* @__PURE__ */ new Map();
    this.backgroundMusicSource = null;
  }
  async loadSound(name, url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.buffers.set(name, audioBuffer);
    } catch (error) {
      console.error(`Error loading sound ${url}:`, error);
    }
  }
  playSound(name, loop = false, volume = 1) {
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
          this.backgroundMusicSource.stop();
        }
        this.backgroundMusicSource = source;
      }
    } else {
    }
  }
  stopBackgroundMusic() {
    if (this.backgroundMusicSource) {
      this.backgroundMusicSource.stop();
      this.backgroundMusicSource = null;
    }
  }
  // Ensure context is resumed for playback if it was suspended (browser policy)
  resumeContext() {
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
  }
}
class Game {
  constructor() {
    this.prevTime = performance.now();
    this.enemies = [];
    this.bullets = [];
    // Configuration & Assets
    this.config = null;
    this.textures = /* @__PURE__ */ new Map();
    // Game State
    this.gameState = 0 /* TITLE */;
    this.inputStates = {};
    // For keyboard input
    this.lastPlayerShootTime = 0;
    this.lastEnemySpawnTime = 0;
    // UI Elements
    this.uiElements = {};
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1e3);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.world = new CANNON.World();
    this.audioManager = new AudioManager();
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);
    this.onPointerLockChange = this.onPointerLockChange.bind(this);
  }
  async init() {
    await this.loadConfig();
    if (!this.config) {
      console.error("Failed to load game configuration.");
      return;
    }
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) {
      console.error("Canvas element 'gameCanvas' not found.");
      return;
    }
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    canvas.parentNode?.replaceChild(this.renderer.domElement, canvas);
    this.renderer.domElement.id = "gameCanvas";
    this.renderer.domElement.style.touchAction = "none";
    await this.loadAssets();
    this.setupScene();
    this.setupPhysics();
    this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("lock", this.onPointerLockChange);
    this.controls.addEventListener("unlock", this.onPointerLockChange);
    this.createUI();
    this.startTitleScreen();
    window.addEventListener("resize", this.onWindowResize);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousedown", this.onMouseDown);
    this.renderer.domElement.addEventListener("click", () => {
      if (this.gameState === 0 /* TITLE */ || this.gameState === 2 /* GAME_OVER */ || this.gameState === 3 /* WIN */) {
        this.audioManager.resumeContext();
        this.startGame();
      }
    });
    this.animate();
  }
  async loadConfig() {
    try {
      const response = await fetch("data.json");
      this.config = await response.json();
    } catch (error) {
      console.error("Error loading data.json:", error);
    }
  }
  async loadAssets() {
    if (!this.config) return;
    const textureLoader = new THREE.TextureLoader();
    const promises = [];
    for (const key in this.config.assets) {
      if (key.endsWith("Texture")) {
        const path = this.config.assets[key];
        promises.push(
          textureLoader.loadAsync(path).then((texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            this.textures.set(key, texture);
          }).catch((e) => console.error(`Failed to load texture ${path}:`, e))
        );
      }
    }
    for (const key in this.config.assets) {
      if (key.endsWith("Sound") || key.endsWith("Music")) {
        const path = this.config.assets[key];
        promises.push(this.audioManager.loadSound(key, path));
      }
    }
    await Promise.all(promises);
  }
  setupScene() {
    if (!this.config) return;
    this.scene.background = new THREE.Color(8900331);
    this.scene.fog = new THREE.Fog(8900331, 0.1, 100);
    const hemiLight = new THREE.HemisphereLight(16777215, 4473924);
    hemiLight.position.set(0, 20, 0);
    this.scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(16777215);
    dirLight.position.set(-3, 10, -5);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 40;
    this.scene.add(dirLight);
    const groundTexture = this.textures.get("groundTexturePath");
    if (groundTexture) {
      groundTexture.repeat.set(this.config.environment.groundSize / 2, this.config.environment.groundSize / 2);
    }
    const groundMaterial = new THREE.MeshPhongMaterial();
    if (groundTexture) {
      groundMaterial.map = groundTexture;
    } else {
      groundMaterial.color = new THREE.Color(8421504);
    }
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.config.environment.groundSize, this.config.environment.groundSize, 1, 1),
      groundMaterial
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);
  }
  setupPhysics() {
    if (!this.config) return;
    this.world.gravity.set(this.config.environment.gravity[0], this.config.environment.gravity[1], this.config.environment.gravity[2]);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({ mass: 0 });
    this.groundBody.addShape(groundShape);
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.groundBody);
    const playerConfig = this.config.player;
    const playerShape = new CANNON.Box(new CANNON.Vec3(playerConfig.bodyWidth / 2, playerConfig.bodyHeight / 2, playerConfig.bodyDepth / 2));
    this.player = {
      mesh: new THREE.Mesh(),
      // Placeholder, not visually added directly for the player "body"
      body: new CANNON.Body({
        mass: 70,
        // Player mass
        position: new CANNON.Vec3(0, playerConfig.initialSpawnY, 0),
        // Position is center of box
        shape: playerShape,
        fixedRotation: true
        // Prevent player from toppling over
      }),
      canJump: false,
      currentHealth: playerConfig.maxHealth,
      score: 0
    };
    this.world.addBody(this.player.body);
    this.player.body.addEventListener("collide", (event) => {
      const contact = event.contact;
      if (contact.bi.id === this.player.body.id || contact.bj.id === this.player.body.id) {
        const normal = contact.bi.id === this.player.body.id ? contact.ni : contact.nj;
        if (normal.y > 0.5) {
          this.player.canJump = true;
        }
      }
    });
    this.camera.position.set(0, playerConfig.initialSpawnY + playerConfig.cameraHeightOffset, 0);
  }
  createUI() {
    const createDiv = (id, className = "", innerHTML = "") => {
      const div = document.createElement("div");
      div.id = id;
      div.className = className;
      div.innerHTML = innerHTML;
      div.style.position = "absolute";
      div.style.color = "white";
      div.style.fontFamily = "monospace";
      div.style.textShadow = "2px 2px 4px rgba(0,0,0,0.8)";
      div.style.zIndex = "100";
      document.body.appendChild(div);
      return div;
    };
    if (!this.config) return;
    this.uiElements["titleScreen"] = createDiv("titleScreen", "", `
            <h1 style="text-align: center; font-size: 4em; margin-top: 15%;">Simple 3D FPS</h1>
            <p style="text-align: center; font-size: 2em;">${this.config.game.clickToStartText}</p>
            <p style="text-align: center; font-size: 1.2em; margin-top: 5%;">
                WASD: Move | Space: Jump | Mouse: Look | Left Click: Shoot
            </p>
        `);
    this.uiElements["titleScreen"].style.cssText += "width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); display: flex; flex-direction: column; justify-content: center; align-items: center;";
    this.uiElements["healthBar"] = createDiv("healthBar", "", `Health: ${this.config.player.maxHealth}`);
    this.uiElements["healthBar"].style.top = "10px";
    this.uiElements["healthBar"].style.left = "10px";
    this.uiElements["scoreDisplay"] = createDiv("scoreDisplay", "", "Score: 0");
    this.uiElements["scoreDisplay"].style.top = "40px";
    this.uiElements["scoreDisplay"].style.left = "10px";
    this.uiElements["gameOverScreen"] = createDiv("gameOverScreen", "", `
            <h1 style="text-align: center; font-size: 4em; margin-top: 15%;">${this.config.game.gameOverText}</h1>
            <p style="text-align: center; font-size: 2em;">Click to Restart</p>
        `);
    this.uiElements["gameOverScreen"].style.cssText += "width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); display: none; flex-direction: column; justify-content: center; align-items: center;";
    this.uiElements["winScreen"] = createDiv("winScreen", "", `
            <h1 style="text-align: center; font-size: 4em; margin-top: 15%;">${this.config.game.winText}</h1>
            <p style="text-align: center; font-size: 2em;">Click to Restart</p>
        `);
    this.uiElements["winScreen"].style.cssText += "width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); display: none; flex-direction: column; justify-content: center; align-items: center;";
    this.uiElements["crosshair"] = createDiv("crosshair", "", "+");
    this.uiElements["crosshair"].style.cssText += `
            font-size: 3em;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            display: none;
        `;
  }
  updateUI() {
    if (!this.config || !this.player) return;
    this.uiElements["healthBar"].innerText = `Health: ${Math.max(0, this.player.currentHealth || 0)}`;
    this.uiElements["scoreDisplay"].innerText = `Score: ${this.player.score || 0}`;
    const hideAll = (except) => {
      ["titleScreen", "gameOverScreen", "winScreen", "healthBar", "scoreDisplay", "crosshair"].forEach((id) => {
        if (!except || !except.includes(id)) {
          this.uiElements[id].style.display = "none";
        }
      });
    };
    switch (this.gameState) {
      case 0 /* TITLE */:
        hideAll(["titleScreen"]);
        this.uiElements["titleScreen"].style.display = "flex";
        break;
      case 1 /* PLAYING */:
        hideAll(["healthBar", "scoreDisplay", "crosshair"]);
        this.uiElements["healthBar"].style.display = "block";
        this.uiElements["scoreDisplay"].style.display = "block";
        this.uiElements["crosshair"].style.display = "block";
        break;
      case 2 /* GAME_OVER */:
        hideAll(["gameOverScreen"]);
        this.uiElements["gameOverScreen"].style.display = "flex";
        break;
      case 3 /* WIN */:
        hideAll(["winScreen"]);
        this.uiElements["winScreen"].style.display = "flex";
        break;
    }
  }
  startGame() {
    if (!this.config) return;
    this.gameState = 1 /* PLAYING */;
    this.player.currentHealth = this.config.player.maxHealth;
    this.player.score = 0;
    this.player.lastShotTime = 0;
    this.player.isDead = false;
    this.enemies.forEach((enemy) => {
      this.world.removeBody(enemy.body);
      this.scene.remove(enemy.mesh);
    });
    this.enemies = [];
    this.bullets.forEach((bullet) => {
      this.world.removeBody(bullet.body);
      this.scene.remove(bullet.mesh);
    });
    this.bullets = [];
    const playerConfig = this.config.player;
    this.player.body.position.set(0, playerConfig.initialSpawnY, 0);
    this.player.body.velocity.set(0, 0, 0);
    this.player.body.angularVelocity.set(0, 0, 0);
    this.camera.position.set(0, playerConfig.initialSpawnY + playerConfig.cameraHeightOffset, 0);
    this.controls.lock();
    this.audioManager.stopBackgroundMusic();
    this.audioManager.playSound("backgroundMusic", true, 0.5);
    this.lastEnemySpawnTime = performance.now();
    this.updateUI();
  }
  startTitleScreen() {
    this.gameState = 0 /* TITLE */;
    this.controls.unlock();
    this.audioManager.stopBackgroundMusic();
    this.updateUI();
  }
  gameOver(win = false) {
    this.gameState = win ? 3 /* WIN */ : 2 /* GAME_OVER */;
    this.controls.unlock();
    this.audioManager.stopBackgroundMusic();
    this.audioManager.playSound("gameOverSound");
    this.updateUI();
  }
  onPointerLockChange() {
    if (document.pointerLockElement === this.renderer.domElement) {
    } else {
      if (this.gameState === 1 /* PLAYING */) {
      }
    }
  }
  onKeyDown(event) {
    this.inputStates[event.code] = true;
  }
  onKeyUp(event) {
    this.inputStates[event.code] = false;
  }
  onMouseDown(event) {
    if (event.button === 0 && this.gameState === 1 /* PLAYING */ && document.pointerLockElement === this.renderer.domElement) {
      this.shootBullet("player");
    }
  }
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.prevTime) / 1e3;
    this.prevTime = currentTime;
    if (this.gameState === 1 /* PLAYING */) {
      this.update(deltaTime);
    }
    this.render();
  }
  update(deltaTime) {
    if (!this.config) return;
    this.updatePlayerMovement(deltaTime);
    this.player.body.position.x = this.camera.position.x;
    this.player.body.position.z = this.camera.position.z;
    this.updateEnemies(deltaTime);
    this.updateBullets();
    this.world.step(1 / 60, deltaTime, 3);
    this.camera.position.y = this.player.body.position.y + this.config.player.cameraHeightOffset;
    this.enemies.forEach((enemy) => {
      if (enemy.isDead) return;
      enemy.mesh.position.set(enemy.body.position.x, enemy.body.position.y, enemy.body.position.z);
      enemy.mesh.quaternion.set(enemy.body.quaternion.x, enemy.body.quaternion.y, enemy.body.quaternion.z, enemy.body.quaternion.w);
    });
    this.bullets.forEach((bullet) => {
      bullet.mesh.position.set(bullet.body.position.x, bullet.body.position.y, bullet.body.position.z);
      bullet.mesh.quaternion.set(bullet.body.quaternion.x, bullet.body.quaternion.y, bullet.body.quaternion.z, bullet.body.quaternion.w);
    });
    if (this.player.currentHealth && this.player.currentHealth <= 0 && !this.player.isDead) {
      this.player.isDead = true;
      this.gameOver(false);
    } else if (this.player.score && this.player.score >= this.config.game.scoreToWin) {
      this.gameOver(true);
    }
    this.updateUI();
  }
  updatePlayerMovement(deltaTime) {
    if (!this.config || !this.player || this.player.isDead) return;
    const playerConfig = this.config.player;
    const speed = playerConfig.speed;
    let moveForward = 0;
    let moveRight = 0;
    if (this.inputStates["KeyW"]) moveForward += 1;
    if (this.inputStates["KeyS"]) moveForward -= 1;
    if (this.inputStates["KeyA"]) moveRight -= 1;
    if (this.inputStates["KeyD"]) moveRight += 1;
    if (moveForward !== 0) {
      this.controls.moveForward(moveForward * speed * deltaTime);
    }
    if (moveRight !== 0) {
      this.controls.moveRight(moveRight * speed * deltaTime);
    }
    if (this.inputStates["Space"] && this.player.canJump) {
      this.player.body.velocity.y = playerConfig.jumpForce;
      this.player.canJump = false;
    }
  }
  updateEnemies(deltaTime) {
    if (!this.config) return;
    if (this.enemies.length < this.config.game.maxEnemies && performance.now() - this.lastEnemySpawnTime > this.config.game.enemySpawnInterval) {
      this.spawnEnemy();
      this.lastEnemySpawnTime = performance.now();
    }
    this.enemies.forEach((enemy) => {
      if (enemy.isDead || !this.player || this.player.isDead) return;
      const playerPos = this.player.body.position;
      const enemyPos = enemy.body.position;
      const direction = new CANNON.Vec3();
      playerPos.vsub(enemyPos, direction);
      direction.y = 0;
      direction.normalize();
      enemy.body.velocity.x = direction.x * this.config.enemy.speed;
      enemy.body.velocity.z = direction.z * this.config.enemy.speed;
      enemy.body.velocity.y = enemy.body.velocity.y;
      const targetYRotation = Math.atan2(direction.x, direction.z);
      enemy.mesh.rotation.y = targetYRotation;
      enemy.mesh.rotation.x = 0;
      enemy.mesh.rotation.z = 0;
      if (performance.now() - (enemy.lastShotTime || 0) > this.config.enemy.fireRate) {
        const distanceToPlayer = enemyPos.distanceTo(playerPos);
        if (distanceToPlayer < this.config.enemy.spawnRadius * 1.5) {
          this.shootBullet("enemy", enemy.body.position, direction);
          enemy.lastShotTime = performance.now();
        }
      }
    });
  }
  updateBullets() {
    this.bullets = this.bullets.filter((bullet) => {
      if (!this.config) return false;
      if (performance.now() - (bullet.creationTime || 0) > this.config.bullet.lifetime) {
        this.world.removeBody(bullet.body);
        this.scene.remove(bullet.mesh);
        return false;
      }
      return true;
    });
  }
  spawnEnemy() {
    if (!this.config) return;
    const enemyConfig = this.config.enemy;
    const groundSize = this.config.environment.groundSize;
    const spawnRadius = enemyConfig.spawnRadius;
    const texture = this.textures.get("enemyTexture");
    if (!texture) {
      console.warn("Enemy texture not loaded, cannot spawn enemy.");
      return;
    }
    const geometry = new THREE.BoxGeometry(enemyConfig.bodyWidth, enemyConfig.bodyHeight, enemyConfig.bodyDepth);
    const material = new THREE.MeshPhongMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    this.scene.add(mesh);
    let x, z;
    do {
      x = Math.random() * groundSize - groundSize / 2;
      z = Math.random() * groundSize - groundSize / 2;
    } while (this.player.body.position.distanceTo(new CANNON.Vec3(x, 0, z)) < spawnRadius);
    const body = new CANNON.Body({
      mass: 50,
      position: new CANNON.Vec3(x, enemyConfig.bodyHeight / 2, z),
      // Position is center of box
      shape: new CANNON.Box(new CANNON.Vec3(enemyConfig.bodyWidth / 2, enemyConfig.bodyHeight / 2, enemyConfig.bodyDepth / 2)),
      fixedRotation: true
      // Prevent enemies from toppling
    });
    this.world.addBody(body);
    const enemy = {
      mesh,
      body,
      currentHealth: enemyConfig.maxHealth,
      lastShotTime: 0
    };
    this.enemies.push(enemy);
    body.addEventListener("collide", (event) => this.handleEnemyCollision(enemy, event));
  }
  shootBullet(owner, position, direction) {
    if (!this.config) return;
    if (owner === "player" && performance.now() - this.lastPlayerShootTime < this.config.player.fireRate) {
      return;
    }
    if (owner === "enemy" && (!position || !direction)) {
      console.error("Enemy bullet needs explicit position and direction.");
      return;
    }
    this.audioManager.playSound("shootSound", false, 0.2);
    const bulletConfig = this.config.bullet;
    const bulletSpeed = owner === "player" ? bulletConfig.playerBulletSpeed : bulletConfig.enemyBulletSpeed;
    const bulletTexture = this.textures.get("bulletTexture");
    const bulletMaterial = new THREE.MeshBasicMaterial();
    if (bulletTexture) {
      bulletMaterial.map = bulletTexture;
    } else {
      bulletMaterial.color = new THREE.Color(16776960);
    }
    const bulletMesh = new THREE.Mesh(new THREE.SphereGeometry(bulletConfig.size / 2, 8, 8), bulletMaterial);
    this.scene.add(bulletMesh);
    const bulletBody = new CANNON.Body({
      mass: 0.1,
      // Small mass to interact with other objects slightly
      shape: new CANNON.Sphere(bulletConfig.size / 2),
      allowSleep: false,
      linearDamping: 0
      // Keep speed constant, no air resistance
    });
    this.world.addBody(bulletBody);
    let bulletPosition = new CANNON.Vec3();
    let bulletDirection = new CANNON.Vec3();
    if (owner === "player") {
      const playerConfig = this.config.player;
      const cameraPosition = this.camera.position;
      bulletPosition.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
      const tempThreeVector = new THREE.Vector3();
      this.camera.getWorldDirection(tempThreeVector);
      bulletDirection.set(tempThreeVector.x, tempThreeVector.y, tempThreeVector.z);
      bulletDirection.normalize();
      bulletPosition.vadd(bulletDirection.scale(playerConfig.bodyWidth / 2 + bulletConfig.size), bulletPosition);
    } else {
      if (position && direction) {
        bulletPosition.copy(position);
        bulletDirection.copy(direction);
        bulletPosition.vadd(bulletDirection.scale(this.config.enemy.bodyWidth / 2 + bulletConfig.size), bulletPosition);
      }
    }
    bulletBody.position.copy(bulletPosition);
    bulletBody.velocity.copy(bulletDirection.scale(bulletSpeed));
    const bullet = {
      mesh: bulletMesh,
      body: bulletBody,
      owner,
      creationTime: performance.now()
    };
    this.bullets.push(bullet);
    bulletBody.addEventListener("collide", (event) => this.handleBulletCollision(bullet, event));
    if (owner === "player") {
      this.lastPlayerShootTime = performance.now();
    }
  }
  handleBulletCollision(bullet, event) {
    if (!this.config || bullet.isDead) return;
    const otherBody = event.body;
    if (bullet.owner === "player" && otherBody === this.player.body) {
      return;
    }
    if (bullet.owner === "enemy" && this.enemies.some((e) => e.body === otherBody)) {
      return;
    }
    if (this.bullets.some((b) => b.body === otherBody)) {
      return;
    }
    let hitSomethingImportant = false;
    if (bullet.owner === "player") {
      const enemyHit = this.enemies.find((e) => e.body === otherBody && !e.isDead);
      if (enemyHit) {
        enemyHit.currentHealth -= this.config.player.bulletDamage;
        this.audioManager.playSound("hitSound", false, 0.4);
        if (enemyHit.currentHealth <= 0) {
          this.enemyKilled(enemyHit);
        }
        hitSomethingImportant = true;
      }
    } else if (bullet.owner === "enemy") {
      if (otherBody === this.player.body && !this.player.isDead) {
        this.player.currentHealth -= this.config.enemy.bulletDamage;
        this.audioManager.playSound("hitSound", false, 0.4);
        if (this.player.currentHealth <= 0) {
          this.player.isDead = true;
        }
        hitSomethingImportant = true;
      }
    }
    if (hitSomethingImportant || otherBody === this.groundBody) {
      bullet.isDead = true;
      this.world.removeBody(bullet.body);
      this.scene.remove(bullet.mesh);
      this.bullets = this.bullets.filter((b) => b !== bullet);
    }
  }
  handleEnemyCollision(enemy, event) {
  }
  enemyKilled(enemy) {
    if (!this.config || enemy.isDead) return;
    enemy.isDead = true;
    this.player.score += this.config.enemy.points;
    setTimeout(() => {
      if (enemy.body) this.world.removeBody(enemy.body);
      if (enemy.mesh) this.scene.remove(enemy.mesh);
      this.enemies = this.enemies.filter((e) => e !== enemy);
    }, 100);
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const game = new Game();
  game.init();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuaW1wb3J0IHsgUG9pbnRlckxvY2tDb250cm9scyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS9jb250cm9scy9Qb2ludGVyTG9ja0NvbnRyb2xzLmpzJztcclxuXHJcbi8vIC0tLSBHbG9iYWwgVHlwZXMgLS0tXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWU6IHtcclxuICAgICAgICB0aXRsZVRleHQ6IHN0cmluZztcclxuICAgICAgICBjbGlja1RvU3RhcnRUZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgd2luVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHNjb3JlVG9XaW46IG51bWJlcjtcclxuICAgICAgICBlbmVteVNwYXduSW50ZXJ2YWw6IG51bWJlcjsgLy8gbXNcclxuICAgICAgICBtYXhFbmVtaWVzOiBudW1iZXI7XHJcbiAgICAgICAgZ2FtZUR1cmF0aW9uOiBudW1iZXI7IC8vIG1zLCBjdXJyZW50bHkgdW51c2VkIGZvciBzaW1wbGljaXR5XHJcbiAgICB9O1xyXG4gICAgcGxheWVyOiB7XHJcbiAgICAgICAgc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBqdW1wRm9yY2U6IG51bWJlcjtcclxuICAgICAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXREYW1hZ2U6IG51bWJlcjtcclxuICAgICAgICBmaXJlUmF0ZTogbnVtYmVyOyAvLyBtc1xyXG4gICAgICAgIGJvZHlXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGJvZHlIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBib2R5RGVwdGg6IG51bWJlcjtcclxuICAgICAgICBpbml0aWFsU3Bhd25ZOiBudW1iZXI7IC8vIFBsYXllcidzIGluaXRpYWwgWSBwb3NpdGlvbiBmb3IgdGhlIHBoeXNpY3MgYm9keSdzIGNlbnRlclxyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBDYW1lcmEgaGVpZ2h0IGFib3ZlIHRoZSBwbGF5ZXIgYm9keSdzIGNlbnRlclxyXG4gICAgfTtcclxuICAgIGVuZW15OiB7XHJcbiAgICAgICAgc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXREYW1hZ2U6IG51bWJlcjtcclxuICAgICAgICBmaXJlUmF0ZTogbnVtYmVyOyAvLyBtc1xyXG4gICAgICAgIHNwYXduUmFkaXVzOiBudW1iZXI7XHJcbiAgICAgICAgYm9keVdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgYm9keUhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIGJvZHlEZXB0aDogbnVtYmVyO1xyXG4gICAgICAgIHBvaW50czogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIGJ1bGxldDoge1xyXG4gICAgICAgIHBsYXllckJ1bGxldFNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgZW5lbXlCdWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIHNpemU6IG51bWJlcjtcclxuICAgICAgICBsaWZldGltZTogbnVtYmVyOyAvLyBtc1xyXG4gICAgfTtcclxuICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgZ3JvdW5kU2l6ZTogbnVtYmVyO1xyXG4gICAgICAgIGdyYXZpdHk6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTtcclxuICAgICAgICBncm91bmRUZXh0dXJlUGF0aDogc3RyaW5nO1xyXG4gICAgICAgIHdhbGxUZXh0dXJlUGF0aDogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIHBsYXllclRleHR1cmU6IHN0cmluZzsgLy8gQ3VycmVudGx5IHVudXNlZCBpbiBGUFMsIGJ1dCBhdmFpbGFibGVcclxuICAgICAgICBlbmVteVRleHR1cmU6IHN0cmluZztcclxuICAgICAgICBidWxsZXRUZXh0dXJlOiBzdHJpbmc7XHJcbiAgICAgICAgc2hvb3RTb3VuZDogc3RyaW5nO1xyXG4gICAgICAgIGhpdFNvdW5kOiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZU92ZXJTb3VuZDogc3RyaW5nO1xyXG4gICAgICAgIGJhY2tncm91bmRNdXNpYzogc3RyaW5nO1xyXG4gICAgfTtcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSLFxyXG4gICAgV0lOXHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lT2JqZWN0IHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIG93bmVyPzogJ3BsYXllcicgfCAnZW5lbXknOyAvLyBGb3IgYnVsbGV0c1xyXG4gICAgY3JlYXRpb25UaW1lPzogbnVtYmVyOyAvLyBGb3IgYnVsbGV0cyBsaWZldGltZVxyXG4gICAgLy8gRm9yIGVudGl0aWVzIGxpa2UgcGxheWVyL2VuZW15XHJcbiAgICBjdXJyZW50SGVhbHRoPzogbnVtYmVyO1xyXG4gICAgaXNEZWFkPzogYm9vbGVhbjtcclxuICAgIGxhc3RTaG90VGltZT86IG51bWJlcjtcclxuICAgIHNjb3JlPzogbnVtYmVyOyAvLyBGb3IgcGxheWVyXHJcbn1cclxuXHJcbi8vIC0tLSBBdWRpbyBIZWxwZXIgLS0tXHJcbmNsYXNzIEF1ZGlvTWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGF1ZGlvQ29udGV4dDogQXVkaW9Db250ZXh0O1xyXG4gICAgcHJpdmF0ZSBidWZmZXJzOiBNYXA8c3RyaW5nLCBBdWRpb0J1ZmZlcj47XHJcbiAgICBwcml2YXRlIGJhY2tncm91bmRNdXNpY1NvdXJjZTogQXVkaW9CdWZmZXJTb3VyY2VOb2RlIHwgbnVsbDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyAod2luZG93LkF1ZGlvQ29udGV4dCB8fCAod2luZG93IGFzIGFueSkud2Via2l0QXVkaW9Db250ZXh0KSgpO1xyXG4gICAgICAgIHRoaXMuYnVmZmVycyA9IG5ldyBNYXAoKTtcclxuICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpY1NvdXJjZSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgbG9hZFNvdW5kKG5hbWU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgcmVzcG9uc2UuYXJyYXlCdWZmZXIoKTtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW9CdWZmZXIgPSBhd2FpdCB0aGlzLmF1ZGlvQ29udGV4dC5kZWNvZGVBdWRpb0RhdGEoYXJyYXlCdWZmZXIpO1xyXG4gICAgICAgICAgICB0aGlzLmJ1ZmZlcnMuc2V0KG5hbWUsIGF1ZGlvQnVmZmVyKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIHNvdW5kICR7dXJsfTpgLCBlcnJvcik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSwgdm9sdW1lOiBudW1iZXIgPSAxKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYnVmZmVyID0gdGhpcy5idWZmZXJzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYnVmZmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgICAgICBzb3VyY2UuYnVmZmVyID0gYnVmZmVyO1xyXG4gICAgICAgICAgICBzb3VyY2UubG9vcCA9IGxvb3A7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBnYWluTm9kZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcclxuICAgICAgICAgICAgZ2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcclxuICAgICAgICAgICAgc291cmNlLmNvbm5lY3QoZ2Fpbk5vZGUpO1xyXG4gICAgICAgICAgICBnYWluTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIHNvdXJjZS5zdGFydCgwKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChsb29wKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5iYWNrZ3JvdW5kTXVzaWNTb3VyY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpY1NvdXJjZS5zdG9wKCk7IC8vIFN0b3AgcHJldmlvdXMgQkdNIGlmIHBsYXlpbmdcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZE11c2ljU291cmNlID0gc291cmNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gY29uc29sZS53YXJuKGBTb3VuZCAke25hbWV9IG5vdCBsb2FkZWQuYCk7IC8vIFN1cHByZXNzIHdhcm5pbmcgZm9yIHBvdGVudGlhbGx5IG1pc3NpbmcgYXNzZXRzXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0b3BCYWNrZ3JvdW5kTXVzaWMoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuYmFja2dyb3VuZE11c2ljU291cmNlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZE11c2ljU291cmNlLnN0b3AoKTtcclxuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWNTb3VyY2UgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBFbnN1cmUgY29udGV4dCBpcyByZXN1bWVkIGZvciBwbGF5YmFjayBpZiBpdCB3YXMgc3VzcGVuZGVkIChicm93c2VyIHBvbGljeSlcclxuICAgIHJlc3VtZUNvbnRleHQoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSAnc3VzcGVuZGVkJykge1xyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vLyAtLS0gTWFpbiBHYW1lIENsYXNzIC0tLVxyXG5jbGFzcyBHYW1lIHtcclxuICAgIC8vIFRocmVlLmpzXHJcbiAgICBwcml2YXRlIHNjZW5lOiBUSFJFRS5TY2VuZTtcclxuICAgIHByaXZhdGUgY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXI6IFRIUkVFLldlYkdMUmVuZGVyZXI7XHJcbiAgICBwcml2YXRlIGNvbnRyb2xzOiBQb2ludGVyTG9ja0NvbnRyb2xzO1xyXG4gICAgcHJpdmF0ZSBwcmV2VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG5cclxuICAgIC8vIENhbm5vbi5qc1xyXG4gICAgcHJpdmF0ZSB3b3JsZDogQ0FOTk9OLldvcmxkO1xyXG4gICAgcHJpdmF0ZSBncm91bmRCb2R5OiBDQU5OT04uQm9keTtcclxuXHJcbiAgICAvLyBHYW1lIE9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyOiBHYW1lT2JqZWN0ICYge1xyXG4gICAgICAgIGNhbkp1bXA6IGJvb2xlYW47XHJcbiAgICB9O1xyXG4gICAgcHJpdmF0ZSBlbmVtaWVzOiBHYW1lT2JqZWN0W10gPSBbXTtcclxuICAgIHByaXZhdGUgYnVsbGV0czogR2FtZU9iamVjdFtdID0gW107XHJcblxyXG4gICAgLy8gQ29uZmlndXJhdGlvbiAmIEFzc2V0c1xyXG4gICAgcHJpdmF0ZSBjb25maWc6IEdhbWVDb25maWcgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBhdWRpb01hbmFnZXI6IEF1ZGlvTWFuYWdlcjtcclxuXHJcbiAgICAvLyBHYW1lIFN0YXRlXHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgcHJpdmF0ZSBpbnB1dFN0YXRlczogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gRm9yIGtleWJvYXJkIGlucHV0XHJcbiAgICBwcml2YXRlIGxhc3RQbGF5ZXJTaG9vdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGxhc3RFbmVteVNwYXduVGltZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvLyBVSSBFbGVtZW50c1xyXG4gICAgcHJpdmF0ZSB1aUVsZW1lbnRzOiB7IFtrZXk6IHN0cmluZ106IEhUTUxFbGVtZW50IH0gPSB7fTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICAvLyBJbml0aWFsaXplIGJhc2ljIGNvbXBvbmVudHNcclxuICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoNzUsIHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0LCAwLjEsIDEwMDApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG4gICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyID0gbmV3IEF1ZGlvTWFuYWdlcigpO1xyXG5cclxuICAgICAgICAvLyBCaW5kIGV2ZW50IGxpc3RlbmVyc1xyXG4gICAgICAgIHRoaXMub25LZXlEb3duID0gdGhpcy5vbktleURvd24uYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLm9uS2V5VXAgPSB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLm9uTW91c2VEb3duID0gdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMub25XaW5kb3dSZXNpemUgPSB0aGlzLm9uV2luZG93UmVzaXplLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlID0gdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICAvLyAxLiBMb2FkIGRhdGFcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRDb25maWcoKTtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24uXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyAyLiBTZXR1cCBSZW5kZXJlclxyXG4gICAgICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCFjYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50ICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZShjYW52YXMuY2xpZW50V2lkdGgsIGNhbnZhcy5jbGllbnRIZWlnaHQpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XHJcbiAgICAgICAgLy8gUmVwbGFjZSBvcmlnaW5hbCBjYW52YXMgd2l0aCBUaHJlZS5qcydzIGNhbnZhcywgcmV0YWluaW5nIElEXHJcbiAgICAgICAgY2FudmFzLnBhcmVudE5vZGU/LnJlcGxhY2VDaGlsZCh0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQsIGNhbnZhcyk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5kb21FbGVtZW50LmlkID0gJ2dhbWVDYW52YXMnO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudC5zdHlsZS50b3VjaEFjdGlvbiA9ICdub25lJzsgLy8gUHJldmVudCBicm93c2VyIGdlc3R1cmVzIG9uIGNhbnZhc1xyXG5cclxuICAgICAgICAvLyAzLiBMb2FkIEFzc2V0c1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA0LiBTZXR1cCBTY2VuZSBhbmQgUGh5c2ljc1xyXG4gICAgICAgIHRoaXMuc2V0dXBTY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuc2V0dXBQaHlzaWNzKCk7XHJcblxyXG4gICAgICAgIC8vIDUuIFNldHVwIFBsYXllciBDb250cm9scyAod2lsbCBiZSBlbmFibGVkIG9uIGdhbWUgc3RhcnQpXHJcbiAgICAgICAgdGhpcy5jb250cm9scyA9IG5ldyBQb2ludGVyTG9ja0NvbnRyb2xzKHRoaXMuY2FtZXJhLCB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQpO1xyXG4gICAgICAgIHRoaXMuY29udHJvbHMuYWRkRXZlbnRMaXN0ZW5lcignbG9jaycsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZSk7XHJcbiAgICAgICAgdGhpcy5jb250cm9scy5hZGRFdmVudExpc3RlbmVyKCd1bmxvY2snLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UpO1xyXG5cclxuICAgICAgICAvLyA2LiBDcmVhdGUgVUlcclxuICAgICAgICB0aGlzLmNyZWF0ZVVJKCk7XHJcbiAgICAgICAgdGhpcy5zdGFydFRpdGxlU2NyZWVuKCk7XHJcblxyXG4gICAgICAgIC8vIDcuIEV2ZW50IExpc3RlbmVyc1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCB0aGlzLm9uV2luZG93UmVzaXplKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24pO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm9uTW91c2VEb3duKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFIHx8IHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuR0FNRV9PVkVSIHx8IHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuV0lOKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5yZXN1bWVDb250ZXh0KCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0R2FtZSgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIDguIFN0YXJ0IGFuaW1hdGlvbiBsb29wXHJcbiAgICAgICAgdGhpcy5hbmltYXRlKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQ29uZmlnKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIGRhdGEuanNvbjonLCBlcnJvcik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xyXG5cclxuICAgICAgICAvLyBMb2FkIHRleHR1cmVzXHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5jb25maWcuYXNzZXRzKSB7XHJcbiAgICAgICAgICAgIGlmIChrZXkuZW5kc1dpdGgoJ1RleHR1cmUnKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9ICh0aGlzLmNvbmZpZy5hc3NldHMgYXMgYW55KVtrZXldO1xyXG4gICAgICAgICAgICAgICAgcHJvbWlzZXMucHVzaChcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlTG9hZGVyLmxvYWRBc3luYyhwYXRoKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAudGhlbih0ZXh0dXJlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZXMuc2V0KGtleSwgdGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmUgJHtwYXRofTpgLCBlKSlcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIExvYWQgc291bmRzXHJcbiAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5jb25maWcuYXNzZXRzKSB7XHJcbiAgICAgICAgICAgIGlmIChrZXkuZW5kc1dpdGgoJ1NvdW5kJykgfHwga2V5LmVuZHNXaXRoKCdNdXNpYycpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gKHRoaXMuY29uZmlnLmFzc2V0cyBhcyBhbnkpW2tleV07XHJcbiAgICAgICAgICAgICAgICBwcm9taXNlcy5wdXNoKHRoaXMuYXVkaW9NYW5hZ2VyLmxvYWRTb3VuZChrZXksIHBhdGgpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBTY2VuZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMuc2NlbmUuYmFja2dyb3VuZCA9IG5ldyBUSFJFRS5Db2xvcigweDg3Y2VlYik7IC8vIFNreSBibHVlXHJcbiAgICAgICAgdGhpcy5zY2VuZS5mb2cgPSBuZXcgVEhSRUUuRm9nKDB4ODdjZWViLCAwLjEsIDEwMCk7XHJcblxyXG4gICAgICAgIC8vIExpZ2h0aW5nXHJcbiAgICAgICAgY29uc3QgaGVtaUxpZ2h0ID0gbmV3IFRIUkVFLkhlbWlzcGhlcmVMaWdodCgweGZmZmZmZiwgMHg0NDQ0NDQpO1xyXG4gICAgICAgIGhlbWlMaWdodC5wb3NpdGlvbi5zZXQoMCwgMjAsIDApO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGhlbWlMaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpckxpZ2h0ID0gbmV3IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQoMHhmZmZmZmYpO1xyXG4gICAgICAgIGRpckxpZ2h0LnBvc2l0aW9uLnNldCgtMywgMTAsIC01KTtcclxuICAgICAgICBkaXJMaWdodC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICBkaXJMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDEwO1xyXG4gICAgICAgIGRpckxpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTEwO1xyXG4gICAgICAgIGRpckxpZ2h0LnNoYWRvdy5jYW1lcmEubGVmdCA9IC0xMDtcclxuICAgICAgICBkaXJMaWdodC5zaGFkb3cuY2FtZXJhLnJpZ2h0ID0gMTA7XHJcbiAgICAgICAgZGlyTGlnaHQuc2hhZG93LmNhbWVyYS5uZWFyID0gMC4xO1xyXG4gICAgICAgIGRpckxpZ2h0LnNoYWRvdy5jYW1lcmEuZmFyID0gNDA7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoZGlyTGlnaHQpO1xyXG5cclxuICAgICAgICAvLyBHcm91bmRcclxuICAgICAgICBjb25zdCBncm91bmRUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ2dyb3VuZFRleHR1cmVQYXRoJyk7XHJcbiAgICAgICAgaWYgKGdyb3VuZFRleHR1cmUpIHtcclxuICAgICAgICAgICAgZ3JvdW5kVGV4dHVyZS5yZXBlYXQuc2V0KHRoaXMuY29uZmlnLmVudmlyb25tZW50Lmdyb3VuZFNpemUgLyAyLCB0aGlzLmNvbmZpZy5lbnZpcm9ubWVudC5ncm91bmRTaXplIC8gMik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZE1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsKCk7XHJcbiAgICAgICAgaWYgKGdyb3VuZFRleHR1cmUpIHtcclxuICAgICAgICAgICAgZ3JvdW5kTWF0ZXJpYWwubWFwID0gZ3JvdW5kVGV4dHVyZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBncm91bmRNYXRlcmlhbC5jb2xvciA9IG5ldyBUSFJFRS5Db2xvcigweDgwODA4MCk7IC8vIEZhbGxiYWNrIGNvbG9yIGlmIHRleHR1cmUgbm90IGxvYWRlZFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKFxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5lbnZpcm9ubWVudC5ncm91bmRTaXplLCB0aGlzLmNvbmZpZy5lbnZpcm9ubWVudC5ncm91bmRTaXplLCAxLCAxKSxcclxuICAgICAgICAgICAgZ3JvdW5kTWF0ZXJpYWxcclxuICAgICAgICApO1xyXG4gICAgICAgIGdyb3VuZE1lc2gucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjtcclxuICAgICAgICBncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGdyb3VuZE1lc2gpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc2V0dXBQaHlzaWNzKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybjtcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5ncmF2aXR5LnNldCh0aGlzLmNvbmZpZy5lbnZpcm9ubWVudC5ncmF2aXR5WzBdLCB0aGlzLmNvbmZpZy5lbnZpcm9ubWVudC5ncmF2aXR5WzFdLCB0aGlzLmNvbmZpZy5lbnZpcm9ubWVudC5ncmF2aXR5WzJdKTtcclxuICAgICAgICB0aGlzLndvcmxkLmJyb2FkcGhhc2UgPSBuZXcgQ0FOTk9OLlNBUEJyb2FkcGhhc2UodGhpcy53b3JsZCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hbGxvd1NsZWVwID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIGJvZHlcclxuICAgICAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwIH0pO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keS5hZGRTaGFwZShncm91bmRTaGFwZSk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUV1bGVyKC1NYXRoLlBJIC8gMiwgMCwgMCk7IC8vIFJvdGF0ZSBncm91bmQgdG8gYmUgaG9yaXpvbnRhbFxyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmdyb3VuZEJvZHkpO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgcGh5c2ljcyBib2R5XHJcbiAgICAgICAgY29uc3QgcGxheWVyQ29uZmlnID0gdGhpcy5jb25maWcucGxheWVyO1xyXG4gICAgICAgIC8vIFVzaW5nIGEgYm94IHNoYXBlIGZvciB0aGUgcGxheWVyIGJvZHlcclxuICAgICAgICBjb25zdCBwbGF5ZXJTaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhwbGF5ZXJDb25maWcuYm9keVdpZHRoIC8gMiwgcGxheWVyQ29uZmlnLmJvZHlIZWlnaHQgLyAyLCBwbGF5ZXJDb25maWcuYm9keURlcHRoIC8gMikpO1xyXG4gICAgICAgIHRoaXMucGxheWVyID0ge1xyXG4gICAgICAgICAgICBtZXNoOiBuZXcgVEhSRUUuTWVzaCgpLCAvLyBQbGFjZWhvbGRlciwgbm90IHZpc3VhbGx5IGFkZGVkIGRpcmVjdGx5IGZvciB0aGUgcGxheWVyIFwiYm9keVwiXHJcbiAgICAgICAgICAgIGJvZHk6IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgICAgICBtYXNzOiA3MCwgLy8gUGxheWVyIG1hc3NcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMoMCwgcGxheWVyQ29uZmlnLmluaXRpYWxTcGF3blksIDApLCAvLyBQb3NpdGlvbiBpcyBjZW50ZXIgb2YgYm94XHJcbiAgICAgICAgICAgICAgICBzaGFwZTogcGxheWVyU2hhcGUsXHJcbiAgICAgICAgICAgICAgICBmaXhlZFJvdGF0aW9uOiB0cnVlIC8vIFByZXZlbnQgcGxheWVyIGZyb20gdG9wcGxpbmcgb3ZlclxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgY2FuSnVtcDogZmFsc2UsXHJcbiAgICAgICAgICAgIGN1cnJlbnRIZWFsdGg6IHBsYXllckNvbmZpZy5tYXhIZWFsdGgsXHJcbiAgICAgICAgICAgIHNjb3JlOiAwXHJcbiAgICAgICAgfTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5wbGF5ZXIuYm9keSk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBjb2xsaXNpb24gbGlzdGVuZXIgdG8gY2hlY2sgZm9yIGdyb3VuZCBjb250YWN0XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuYm9keS5hZGRFdmVudExpc3RlbmVyKCdjb2xsaWRlJywgKGV2ZW50OiBhbnkpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29udGFjdCA9IGV2ZW50LmNvbnRhY3Q7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHBsYXllcidzIGJvZHkgaXMgb25lIG9mIHRoZSBjb2xsaWRpbmcgYm9kaWVzXHJcbiAgICAgICAgICAgIGlmIChjb250YWN0LmJpLmlkID09PSB0aGlzLnBsYXllci5ib2R5LmlkIHx8IGNvbnRhY3QuYmouaWQgPT09IHRoaXMucGxheWVyLmJvZHkuaWQpIHtcclxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBub3JtYWwgdmVjdG9yJ3MgWSBjb21wb25lbnQgaXMgc2lnbmlmaWNhbnRseSBwb3NpdGl2ZSAocG9pbnRpbmcgdXB3YXJkcyksXHJcbiAgICAgICAgICAgICAgICAvLyBpdCBtZWFucyB0aGUgY29udGFjdCBzdXJmYWNlIGlzIGJlbG93IHRoZSBwbGF5ZXIsIGluZGljYXRpbmcgZ3JvdW5kIGNvbnRhY3QuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBub3JtYWwgPSAoY29udGFjdC5iaS5pZCA9PT0gdGhpcy5wbGF5ZXIuYm9keS5pZCkgPyBjb250YWN0Lm5pIDogY29udGFjdC5uajtcclxuICAgICAgICAgICAgICAgIGlmIChub3JtYWwueSA+IDAuNSkgeyAvLyBUaHJlc2hvbGQgZm9yIGNvbnNpZGVyaW5nIGl0IGdyb3VuZFxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmNhbkp1bXAgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFNldCBpbml0aWFsIGNhbWVyYSBwb3NpdGlvbiByZWxhdGl2ZSB0byBwbGF5ZXIgYm9keVxyXG4gICAgICAgIC8vIGNhbWVyYS5wb3NpdGlvbi55ID0gcGxheWVyLmJvZHkucG9zaXRpb24ueSAoY2VudGVyIG9mIGJvZHkpICsgY2FtZXJhSGVpZ2h0T2Zmc2V0XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24uc2V0KDAsIHBsYXllckNvbmZpZy5pbml0aWFsU3Bhd25ZICsgcGxheWVyQ29uZmlnLmNhbWVyYUhlaWdodE9mZnNldCwgMCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVVSSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBjcmVhdGVEaXYgPSAoaWQ6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcgPSAnJywgaW5uZXJIVE1MOiBzdHJpbmcgPSAnJyk6IEhUTUxFbGVtZW50ID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgICAgIGRpdi5pZCA9IGlkO1xyXG4gICAgICAgICAgICBkaXYuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xyXG4gICAgICAgICAgICBkaXYuaW5uZXJIVE1MID0gaW5uZXJIVE1MO1xyXG4gICAgICAgICAgICBkaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgICAgICBkaXYuc3R5bGUuY29sb3IgPSAnd2hpdGUnO1xyXG4gICAgICAgICAgICBkaXYuc3R5bGUuZm9udEZhbWlseSA9ICdtb25vc3BhY2UnO1xyXG4gICAgICAgICAgICBkaXYuc3R5bGUudGV4dFNoYWRvdyA9ICcycHggMnB4IDRweCByZ2JhKDAsMCwwLDAuOCknO1xyXG4gICAgICAgICAgICBkaXYuc3R5bGUuekluZGV4ID0gJzEwMCc7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuIGRpdjtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1sndGl0bGVTY3JlZW4nXSA9IGNyZWF0ZURpdigndGl0bGVTY3JlZW4nLCAnJywgYFxyXG4gICAgICAgICAgICA8aDEgc3R5bGU9XCJ0ZXh0LWFsaWduOiBjZW50ZXI7IGZvbnQtc2l6ZTogNGVtOyBtYXJnaW4tdG9wOiAxNSU7XCI+U2ltcGxlIDNEIEZQUzwvaDE+XHJcbiAgICAgICAgICAgIDxwIHN0eWxlPVwidGV4dC1hbGlnbjogY2VudGVyOyBmb250LXNpemU6IDJlbTtcIj4ke3RoaXMuY29uZmlnLmdhbWUuY2xpY2tUb1N0YXJ0VGV4dH08L3A+XHJcbiAgICAgICAgICAgIDxwIHN0eWxlPVwidGV4dC1hbGlnbjogY2VudGVyOyBmb250LXNpemU6IDEuMmVtOyBtYXJnaW4tdG9wOiA1JTtcIj5cclxuICAgICAgICAgICAgICAgIFdBU0Q6IE1vdmUgfCBTcGFjZTogSnVtcCB8IE1vdXNlOiBMb29rIHwgTGVmdCBDbGljazogU2hvb3RcclxuICAgICAgICAgICAgPC9wPlxyXG4gICAgICAgIGApO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1sndGl0bGVTY3JlZW4nXS5zdHlsZS5jc3NUZXh0ICs9ICd3aWR0aDogMTAwJTsgaGVpZ2h0OiAxMDAlOyBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDAsMCwwLDAuNyk7IGRpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyOyc7XHJcblxyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snaGVhbHRoQmFyJ10gPSBjcmVhdGVEaXYoJ2hlYWx0aEJhcicsICcnLCBgSGVhbHRoOiAke3RoaXMuY29uZmlnLnBsYXllci5tYXhIZWFsdGh9YCk7XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydoZWFsdGhCYXInXS5zdHlsZS50b3AgPSAnMTBweCc7XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydoZWFsdGhCYXInXS5zdHlsZS5sZWZ0ID0gJzEwcHgnO1xyXG5cclxuICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ3Njb3JlRGlzcGxheSddID0gY3JlYXRlRGl2KCdzY29yZURpc3BsYXknLCAnJywgJ1Njb3JlOiAwJyk7XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydzY29yZURpc3BsYXknXS5zdHlsZS50b3AgPSAnNDBweCc7XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydzY29yZURpc3BsYXknXS5zdHlsZS5sZWZ0ID0gJzEwcHgnO1xyXG5cclxuICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ2dhbWVPdmVyU2NyZWVuJ10gPSBjcmVhdGVEaXYoJ2dhbWVPdmVyU2NyZWVuJywgJycsIGBcclxuICAgICAgICAgICAgPGgxIHN0eWxlPVwidGV4dC1hbGlnbjogY2VudGVyOyBmb250LXNpemU6IDRlbTsgbWFyZ2luLXRvcDogMTUlO1wiPiR7dGhpcy5jb25maWcuZ2FtZS5nYW1lT3ZlclRleHR9PC9oMT5cclxuICAgICAgICAgICAgPHAgc3R5bGU9XCJ0ZXh0LWFsaWduOiBjZW50ZXI7IGZvbnQtc2l6ZTogMmVtO1wiPkNsaWNrIHRvIFJlc3RhcnQ8L3A+XHJcbiAgICAgICAgYCk7XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydnYW1lT3ZlclNjcmVlbiddLnN0eWxlLmNzc1RleHQgKz0gJ3dpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IGJhY2tncm91bmQtY29sb3I6IHJnYmEoMCwwLDAsMC43KTsgZGlzcGxheTogbm9uZTsgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7JztcclxuXHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWyd3aW5TY3JlZW4nXSA9IGNyZWF0ZURpdignd2luU2NyZWVuJywgJycsIGBcclxuICAgICAgICAgICAgPGgxIHN0eWxlPVwidGV4dC1hbGlnbjogY2VudGVyOyBmb250LXNpemU6IDRlbTsgbWFyZ2luLXRvcDogMTUlO1wiPiR7dGhpcy5jb25maWcuZ2FtZS53aW5UZXh0fTwvaDE+XHJcbiAgICAgICAgICAgIDxwIHN0eWxlPVwidGV4dC1hbGlnbjogY2VudGVyOyBmb250LXNpemU6IDJlbTtcIj5DbGljayB0byBSZXN0YXJ0PC9wPlxyXG4gICAgICAgIGApO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snd2luU2NyZWVuJ10uc3R5bGUuY3NzVGV4dCArPSAnd2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgYmFja2dyb3VuZC1jb2xvcjogcmdiYSgwLDAsMCwwLjcpOyBkaXNwbGF5OiBub25lOyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYWxpZ24taXRlbXM6IGNlbnRlcjsnO1xyXG5cclxuXHJcbiAgICAgICAgLy8gQ3Jvc3NoYWlyXHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydjcm9zc2hhaXInXSA9IGNyZWF0ZURpdignY3Jvc3NoYWlyJywgJycsICcrJyk7XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydjcm9zc2hhaXInXS5zdHlsZS5jc3NUZXh0ICs9IGBcclxuICAgICAgICAgICAgZm9udC1zaXplOiAzZW07XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgICAgICAgICAgdG9wOiA1MCU7XHJcbiAgICAgICAgICAgIGxlZnQ6IDUwJTtcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoLTUwJSwgLTUwJSk7XHJcbiAgICAgICAgICAgIGRpc3BsYXk6IG5vbmU7XHJcbiAgICAgICAgYDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZVVJKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcgfHwgIXRoaXMucGxheWVyKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snaGVhbHRoQmFyJ10uaW5uZXJUZXh0ID0gYEhlYWx0aDogJHtNYXRoLm1heCgwLCB0aGlzLnBsYXllci5jdXJyZW50SGVhbHRoIHx8IDApfWA7XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydzY29yZURpc3BsYXknXS5pbm5lclRleHQgPSBgU2NvcmU6ICR7dGhpcy5wbGF5ZXIuc2NvcmUgfHwgMH1gO1xyXG5cclxuICAgICAgICAvLyBDb250cm9sIHZpc2liaWxpdHkgb2YgVUkgZWxlbWVudHMgYmFzZWQgb24gZ2FtZSBzdGF0ZVxyXG4gICAgICAgIGNvbnN0IGhpZGVBbGwgPSAoZXhjZXB0Pzogc3RyaW5nW10pID0+IHtcclxuICAgICAgICAgICAgWyd0aXRsZVNjcmVlbicsICdnYW1lT3ZlclNjcmVlbicsICd3aW5TY3JlZW4nLCAnaGVhbHRoQmFyJywgJ3Njb3JlRGlzcGxheScsICdjcm9zc2hhaXInXS5mb3JFYWNoKGlkID0+IHtcclxuICAgICAgICAgICAgICAgIGlmICghZXhjZXB0IHx8ICFleGNlcHQuaW5jbHVkZXMoaWQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51aUVsZW1lbnRzW2lkXS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMuZ2FtZVN0YXRlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlRJVExFOlxyXG4gICAgICAgICAgICAgICAgaGlkZUFsbChbJ3RpdGxlU2NyZWVuJ10pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51aUVsZW1lbnRzWyd0aXRsZVNjcmVlbiddLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuUExBWUlORzpcclxuICAgICAgICAgICAgICAgIGhpZGVBbGwoWydoZWFsdGhCYXInLCAnc2NvcmVEaXNwbGF5JywgJ2Nyb3NzaGFpciddKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudWlFbGVtZW50c1snaGVhbHRoQmFyJ10uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ3Njb3JlRGlzcGxheSddLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51aUVsZW1lbnRzWydjcm9zc2hhaXInXS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5HQU1FX09WRVI6XHJcbiAgICAgICAgICAgICAgICBoaWRlQWxsKFsnZ2FtZU92ZXJTY3JlZW4nXSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ2dhbWVPdmVyU2NyZWVuJ10uc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5XSU46XHJcbiAgICAgICAgICAgICAgICBoaWRlQWxsKFsnd2luU2NyZWVuJ10pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51aUVsZW1lbnRzWyd3aW5TY3JlZW4nXS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gUmVzZXQgZ2FtZSBzdGF0ZVxyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuY3VycmVudEhlYWx0aCA9IHRoaXMuY29uZmlnLnBsYXllci5tYXhIZWFsdGg7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuc2NvcmUgPSAwO1xyXG4gICAgICAgIHRoaXMucGxheWVyLmxhc3RTaG90VGltZSA9IDA7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuaXNEZWFkID0gZmFsc2U7XHJcblxyXG4gICAgICAgIC8vIENsZWFyIGV4aXN0aW5nIGVuZW1pZXMgYW5kIGJ1bGxldHNcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShlbmVteS5ib2R5KTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoZW5lbXkubWVzaCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzID0gW107XHJcblxyXG4gICAgICAgIHRoaXMuYnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShidWxsZXQuYm9keSk7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKGJ1bGxldC5tZXNoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMgPSBbXTtcclxuXHJcbiAgICAgICAgLy8gUmVzZXQgcGxheWVyIHBvc2l0aW9uIGFuZCB2ZWxvY2l0eVxyXG4gICAgICAgIGNvbnN0IHBsYXllckNvbmZpZyA9IHRoaXMuY29uZmlnLnBsYXllcjtcclxuICAgICAgICB0aGlzLnBsYXllci5ib2R5LnBvc2l0aW9uLnNldCgwLCBwbGF5ZXJDb25maWcuaW5pdGlhbFNwYXduWSwgMCk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuYm9keS52ZWxvY2l0eS5zZXQoMCwgMCwgMCk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuYm9keS5hbmd1bGFyVmVsb2NpdHkuc2V0KDAsIDAsIDApO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnNldCgwLCBwbGF5ZXJDb25maWcuaW5pdGlhbFNwYXduWSArIHBsYXllckNvbmZpZy5jYW1lcmFIZWlnaHRPZmZzZXQsIDApO1xyXG5cclxuICAgICAgICAvLyBMb2NrIHBvaW50ZXJcclxuICAgICAgICB0aGlzLmNvbnRyb2xzLmxvY2soKTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnN0b3BCYWNrZ3JvdW5kTXVzaWMoKTsgLy8gU3RvcCBhbnkgcHJldmlvdXMgbXVzaWNcclxuICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5wbGF5U291bmQoJ2JhY2tncm91bmRNdXNpYycsIHRydWUsIDAuNSk7IC8vIExvb3AgQkdNIHdpdGggbG93ZXIgdm9sdW1lXHJcblxyXG4gICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVVSSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRUaXRsZVNjcmVlbigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTtcclxuICAgICAgICB0aGlzLmNvbnRyb2xzLnVubG9jaygpO1xyXG4gICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnN0b3BCYWNrZ3JvdW5kTXVzaWMoKTtcclxuICAgICAgICB0aGlzLnVwZGF0ZVVJKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnYW1lT3Zlcih3aW46IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuZ2FtZVN0YXRlID0gd2luID8gR2FtZVN0YXRlLldJTiA6IEdhbWVTdGF0ZS5HQU1FX09WRVI7XHJcbiAgICAgICAgdGhpcy5jb250cm9scy51bmxvY2soKTtcclxuICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5zdG9wQmFja2dyb3VuZE11c2ljKCk7XHJcbiAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheVNvdW5kKCdnYW1lT3ZlclNvdW5kJyk7IC8vIFBsYXkgZ2FtZSBvdmVyIHNvdW5kXHJcbiAgICAgICAgdGhpcy51cGRhdGVVSSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Qb2ludGVyTG9ja0NoYW5nZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoZG9jdW1lbnQucG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQpIHtcclxuICAgICAgICAgICAgLy8gUG9pbnRlciBsb2NrZWQuIElmIGl0IHdhcyBhbHJlYWR5IHBsYXlpbmcsIGNvbnRpbnVlLiBJZiBmcm9tIHRpdGxlL2dhbWVvdmVyLCBzdGFydEdhbWUgd2lsbCBoYW5kbGUuXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gUG9pbnRlciB1bmxvY2tlZC4gSWYgZ2FtZSB3YXMgcGxheWluZywgdXNlciBwcm9iYWJseSBwcmVzc2VkIEVTQy5cclxuICAgICAgICAgICAgLy8gRm9yIHRoaXMgc2ltcGxlIGdhbWUsIHdlIGRvbid0IGltcGxlbWVudCBwYXVzZSwganVzdCBhbGxvdyByZXN0YXJ0LlxyXG4gICAgICAgICAgICAvLyBJZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIHVubG9ja2VkLCBpdCBpbXBsaWVzIHVzZXIgaW50ZW50aW9uYWxseSBsZWZ0IHRoZSBnYW1lLlxyXG4gICAgICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBOb3QgYSBmb3JtYWwgcGF1c2UsIGp1c3QgYWxsb3dzIHVzZXIgdG8gY2xpY2sgVUkgZWxlbWVudHNcclxuICAgICAgICAgICAgICAgIC8vIENhbiBiZSBpbXByb3ZlZCB0byBhIHByb3BlciBwYXVzZSBzdGF0ZSBpZiBuZWVkZWQuXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbktleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmlucHV0U3RhdGVzW2V2ZW50LmNvZGVdID0gdHJ1ZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmlucHV0U3RhdGVzW2V2ZW50LmNvZGVdID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlRG93bihldmVudDogTW91c2VFdmVudCk6IHZvaWQge1xyXG4gICAgICAgIGlmIChldmVudC5idXR0b24gPT09IDAgJiYgdGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5yZW5kZXJlci5kb21FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2hvb3RCdWxsZXQoJ3BsYXllcicpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uV2luZG93UmVzaXplKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUod2luZG93LmlubmVyV2lkdGgsIHdpbmRvdy5pbm5lckhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhbmltYXRlKCk6IHZvaWQge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKGN1cnJlbnRUaW1lIC0gdGhpcy5wcmV2VGltZSkgLyAxMDAwOyAvLyBEZWx0YSB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICB0aGlzLnByZXZUaW1lID0gY3VycmVudFRpbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGUoZGVsdGFUaW1lKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5yZW5kZXIoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gMS4gUGxheWVyIGhvcml6b250YWwgbW92ZW1lbnQgZGlyZWN0bHkgbW92ZXMgdGhlIGNhbWVyYVxyXG4gICAgICAgIHRoaXMudXBkYXRlUGxheWVyTW92ZW1lbnQoZGVsdGFUaW1lKTtcclxuXHJcbiAgICAgICAgLy8gMi4gU3luYyBwbGF5ZXIgcGh5c2ljcyBib2R5J3MgWFogdG8gY2FtZXJhJ3MgWFpcclxuICAgICAgICB0aGlzLnBsYXllci5ib2R5LnBvc2l0aW9uLnggPSB0aGlzLmNhbWVyYS5wb3NpdGlvbi54O1xyXG4gICAgICAgIHRoaXMucGxheWVyLmJvZHkucG9zaXRpb24ueiA9IHRoaXMuY2FtZXJhLnBvc2l0aW9uLno7XHJcblxyXG4gICAgICAgIC8vIDMuIFVwZGF0ZSBlbmVtaWVzIEFJIGFuZCBhY3Rpb25zXHJcbiAgICAgICAgdGhpcy51cGRhdGVFbmVtaWVzKGRlbHRhVGltZSk7XHJcblxyXG4gICAgICAgIC8vIDQuIFVwZGF0ZSBidWxsZXRzIGxpZmV0aW1lIGFuZCBjbGVhbnVwXHJcbiAgICAgICAgdGhpcy51cGRhdGVCdWxsZXRzKCk7XHJcblxyXG4gICAgICAgIC8vIDUuIFN0ZXAgcGh5c2ljcyB3b3JsZFxyXG4gICAgICAgIHRoaXMud29ybGQuc3RlcCgxIC8gNjAsIGRlbHRhVGltZSwgMyk7IC8vIEZpeGVkIHRpbWUgc3RlcCAxLzYwcywgbWF4IDMgaXRlcmF0aW9uc1xyXG5cclxuICAgICAgICAvLyA2LiBVcGRhdGUgY2FtZXJhIFkgcG9zaXRpb24gZnJvbSBwbGF5ZXIgYm9keSBZIChhZnRlciBwaHlzaWNzIGhhcyBhcHBsaWVkIGdyYXZpdHkvanVtcHMpXHJcbiAgICAgICAgLy8gY2FtZXJhLnBvc2l0aW9uLnkgPSBwbGF5ZXIuYm9keS5wb3NpdGlvbi55IChjZW50ZXIgb2YgYm9keSkgKyBjYW1lcmFIZWlnaHRPZmZzZXRcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi55ID0gdGhpcy5wbGF5ZXIuYm9keS5wb3NpdGlvbi55ICsgdGhpcy5jb25maWcucGxheWVyLmNhbWVyYUhlaWdodE9mZnNldDtcclxuXHJcbiAgICAgICAgLy8gNy4gU3luYyBUaHJlZS5qcyBtZXNoZXMgd2l0aCBDYW5ub24uanMgYm9kaWVzIGZvciBlbmVtaWVzIGFuZCBidWxsZXRzXHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZW5lbXkuaXNEZWFkKSByZXR1cm47XHJcbiAgICAgICAgICAgIGVuZW15Lm1lc2gucG9zaXRpb24uc2V0KGVuZW15LmJvZHkucG9zaXRpb24ueCwgZW5lbXkuYm9keS5wb3NpdGlvbi55LCBlbmVteS5ib2R5LnBvc2l0aW9uLnopO1xyXG4gICAgICAgICAgICBlbmVteS5tZXNoLnF1YXRlcm5pb24uc2V0KGVuZW15LmJvZHkucXVhdGVybmlvbi54LCBlbmVteS5ib2R5LnF1YXRlcm5pb24ueSwgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLnosIGVuZW15LmJvZHkucXVhdGVybmlvbi53KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5idWxsZXRzLmZvckVhY2goYnVsbGV0ID0+IHtcclxuICAgICAgICAgICAgYnVsbGV0Lm1lc2gucG9zaXRpb24uc2V0KGJ1bGxldC5ib2R5LnBvc2l0aW9uLngsIGJ1bGxldC5ib2R5LnBvc2l0aW9uLnksIGJ1bGxldC5ib2R5LnBvc2l0aW9uLnopO1xyXG4gICAgICAgICAgICBidWxsZXQubWVzaC5xdWF0ZXJuaW9uLnNldChidWxsZXQuYm9keS5xdWF0ZXJuaW9uLngsIGJ1bGxldC5ib2R5LnF1YXRlcm5pb24ueSwgYnVsbGV0LmJvZHkucXVhdGVybmlvbi56LCBidWxsZXQuYm9keS5xdWF0ZXJuaW9uLncpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyA4LiBDaGVjayBnYW1lIG92ZXIgLyB3aW4gY29uZGl0aW9uc1xyXG4gICAgICAgIGlmICh0aGlzLnBsYXllci5jdXJyZW50SGVhbHRoICYmIHRoaXMucGxheWVyLmN1cnJlbnRIZWFsdGggPD0gMCAmJiAhdGhpcy5wbGF5ZXIuaXNEZWFkKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyLmlzRGVhZCA9IHRydWU7IC8vIE1hcmsgcGxheWVyIGFzIGRlYWQgdG8gcHJldmVudCBtdWx0aXBsZSBnYW1lIG92ZXIgdHJpZ2dlcnNcclxuICAgICAgICAgICAgdGhpcy5nYW1lT3ZlcihmYWxzZSk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBsYXllci5zY29yZSAmJiB0aGlzLnBsYXllci5zY29yZSA+PSB0aGlzLmNvbmZpZy5nYW1lLnNjb3JlVG9XaW4pIHtcclxuICAgICAgICAgICAgdGhpcy5nYW1lT3Zlcih0cnVlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMudXBkYXRlVUkoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBsYXllck1vdmVtZW50KGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZyB8fCAhdGhpcy5wbGF5ZXIgfHwgdGhpcy5wbGF5ZXIuaXNEZWFkKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckNvbmZpZyA9IHRoaXMuY29uZmlnLnBsYXllcjtcclxuICAgICAgICBjb25zdCBzcGVlZCA9IHBsYXllckNvbmZpZy5zcGVlZDtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaG9yaXpvbnRhbCBtb3ZlbWVudCB2aWEgY29udHJvbHMgKG1vZGlmaWVzIHRoaXMuY2FtZXJhLnBvc2l0aW9uIGRpcmVjdGx5KVxyXG4gICAgICAgIGxldCBtb3ZlRm9yd2FyZCA9IDA7XHJcbiAgICAgICAgbGV0IG1vdmVSaWdodCA9IDA7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmlucHV0U3RhdGVzWydLZXlXJ10pIG1vdmVGb3J3YXJkICs9IDE7XHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRTdGF0ZXNbJ0tleVMnXSkgbW92ZUZvcndhcmQgLT0gMTtcclxuICAgICAgICBpZiAodGhpcy5pbnB1dFN0YXRlc1snS2V5QSddKSBtb3ZlUmlnaHQgLT0gMTtcclxuICAgICAgICBpZiAodGhpcy5pbnB1dFN0YXRlc1snS2V5RCddKSBtb3ZlUmlnaHQgKz0gMTtcclxuXHJcbiAgICAgICAgLy8gTW92ZSBjb250cm9scyAoY2FtZXJhKVxyXG4gICAgICAgIGlmIChtb3ZlRm9yd2FyZCAhPT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRyb2xzLm1vdmVGb3J3YXJkKG1vdmVGb3J3YXJkICogc3BlZWQgKiBkZWx0YVRpbWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobW92ZVJpZ2h0ICE9PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29udHJvbHMubW92ZVJpZ2h0KG1vdmVSaWdodCAqIHNwZWVkICogZGVsdGFUaW1lKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEhhbmRsZSB2ZXJ0aWNhbCBtb3ZlbWVudCAoanVtcCkgd2l0aCBwaHlzaWNzXHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRTdGF0ZXNbJ1NwYWNlJ10gJiYgdGhpcy5wbGF5ZXIuY2FuSnVtcCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllci5ib2R5LnZlbG9jaXR5LnkgPSBwbGF5ZXJDb25maWcuanVtcEZvcmNlO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllci5jYW5KdW1wID0gZmFsc2U7IC8vIFByZXZlbnQgbXVsdGlwbGUganVtcHMgdW50aWwgbGFuZGluZ1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVFbmVtaWVzKGRlbHRhVGltZTogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBTcGF3biBlbmVtaWVzXHJcbiAgICAgICAgaWYgKHRoaXMuZW5lbWllcy5sZW5ndGggPCB0aGlzLmNvbmZpZy5nYW1lLm1heEVuZW1pZXMgJiYgKHBlcmZvcm1hbmNlLm5vdygpIC0gdGhpcy5sYXN0RW5lbXlTcGF3blRpbWUgPiB0aGlzLmNvbmZpZy5nYW1lLmVuZW15U3Bhd25JbnRlcnZhbCkpIHtcclxuICAgICAgICAgICAgdGhpcy5zcGF3bkVuZW15KCk7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgZWFjaCBlbmVteVxyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgaWYgKGVuZW15LmlzRGVhZCB8fCAhdGhpcy5wbGF5ZXIgfHwgdGhpcy5wbGF5ZXIuaXNEZWFkKSByZXR1cm47XHJcblxyXG4gICAgICAgICAgICAvLyBTaW1wbGUgQUk6IE1vdmUgdG93YXJkcyBwbGF5ZXJcclxuICAgICAgICAgICAgY29uc3QgcGxheWVyUG9zID0gdGhpcy5wbGF5ZXIuYm9keS5wb3NpdGlvbjtcclxuICAgICAgICAgICAgY29uc3QgZW5lbXlQb3MgPSBlbmVteS5ib2R5LnBvc2l0aW9uO1xyXG4gICAgICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICAgICAgICAgICAgcGxheWVyUG9zLnZzdWIoZW5lbXlQb3MsIGRpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIGRpcmVjdGlvbi55ID0gMDsgLy8gT25seSBob3Jpem9udGFsIG1vdmVtZW50XHJcbiAgICAgICAgICAgIGRpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFNldCB2ZWxvY2l0eSwgbm90IGFwcGx5aW5nIGZvcmNlLCB0byBrZWVwIG1vdmVtZW50IHNtb290aFxyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSBkaXJlY3Rpb24ueCAqIHRoaXMuY29uZmlnLmVuZW15LnNwZWVkO1xyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnZlbG9jaXR5LnogPSBkaXJlY3Rpb24ueiAqIHRoaXMuY29uZmlnLmVuZW15LnNwZWVkO1xyXG4gICAgICAgICAgICAvLyBLZWVwIGN1cnJlbnQgWSB2ZWxvY2l0eSBmb3IgZ3Jhdml0eVxyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnZlbG9jaXR5LnkgPSBlbmVteS5ib2R5LnZlbG9jaXR5Lnk7XHJcblxyXG4gICAgICAgICAgICAvLyBSb3RhdGUgZW5lbXkgbWVzaCB0byBsb29rIGF0IHBsYXllciAob25seSB5YXcpXHJcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFlSb3RhdGlvbiA9IE1hdGguYXRhbjIoZGlyZWN0aW9uLngsIGRpcmVjdGlvbi56KTsgLy8gWWF3IHJvdGF0aW9uIGZvciBaLWF4aXMgZm9yd2FyZFxyXG4gICAgICAgICAgICBlbmVteS5tZXNoLnJvdGF0aW9uLnkgPSB0YXJnZXRZUm90YXRpb247XHJcbiAgICAgICAgICAgIGVuZW15Lm1lc2gucm90YXRpb24ueCA9IDA7IC8vIFByZXZlbnQgdGlsdGluZ1xyXG4gICAgICAgICAgICBlbmVteS5tZXNoLnJvdGF0aW9uLnogPSAwOyAvLyBQcmV2ZW50IHRpbHRpbmdcclxuXHJcbiAgICAgICAgICAgIC8vIEVuZW15IHNob290aW5nXHJcbiAgICAgICAgICAgIGlmIChwZXJmb3JtYW5jZS5ub3coKSAtIChlbmVteS5sYXN0U2hvdFRpbWUgfHwgMCkgPiB0aGlzLmNvbmZpZy5lbmVteS5maXJlUmF0ZSkge1xyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcGxheWVyIGlzIHNvbWV3aGF0IGluIHJhbmdlXHJcbiAgICAgICAgICAgICAgICBjb25zdCBkaXN0YW5jZVRvUGxheWVyID0gZW5lbXlQb3MuZGlzdGFuY2VUbyhwbGF5ZXJQb3MpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGRpc3RhbmNlVG9QbGF5ZXIgPCB0aGlzLmNvbmZpZy5lbmVteS5zcGF3blJhZGl1cyAqIDEuNSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2hvb3RCdWxsZXQoJ2VuZW15JywgZW5lbXkuYm9keS5wb3NpdGlvbiwgZGlyZWN0aW9uKTtcclxuICAgICAgICAgICAgICAgICAgICBlbmVteS5sYXN0U2hvdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlQnVsbGV0cygpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmJ1bGxldHMgPSB0aGlzLmJ1bGxldHMuZmlsdGVyKGJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBvbGQgYnVsbGV0c1xyXG4gICAgICAgICAgICBpZiAocGVyZm9ybWFuY2Uubm93KCkgLSAoYnVsbGV0LmNyZWF0aW9uVGltZSB8fCAwKSA+IHRoaXMuY29uZmlnLmJ1bGxldC5saWZldGltZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGJ1bGxldC5ib2R5KTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKGJ1bGxldC5tZXNoKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gS2VlcCBidWxsZXQgaWYgbm90IGV4cGlyZWRcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNwYXduRW5lbXkoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBlbmVteUNvbmZpZyA9IHRoaXMuY29uZmlnLmVuZW15O1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5lbnZpcm9ubWVudC5ncm91bmRTaXplO1xyXG4gICAgICAgIGNvbnN0IHNwYXduUmFkaXVzID0gZW5lbXlDb25maWcuc3Bhd25SYWRpdXM7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdlbmVteVRleHR1cmUnKTtcclxuICAgICAgICBpZiAoIXRleHR1cmUpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiRW5lbXkgdGV4dHVyZSBub3QgbG9hZGVkLCBjYW5ub3Qgc3Bhd24gZW5lbXkuXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShlbmVteUNvbmZpZy5ib2R5V2lkdGgsIGVuZW15Q29uZmlnLmJvZHlIZWlnaHQsIGVuZW15Q29uZmlnLmJvZHlEZXB0aCk7XHJcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwoeyBtYXA6IHRleHR1cmUgfSk7XHJcbiAgICAgICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcbiAgICAgICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuXHJcbiAgICAgICAgLy8gUmFuZG9tIHBvc2l0aW9uLCBlbnN1cmUgaXQncyBvbiB0aGUgZ3JvdW5kIGFuZCBub3QgdG9vIGNsb3NlIHRvIHBsYXllclxyXG4gICAgICAgIGxldCB4LCB6O1xyXG4gICAgICAgIGRvIHtcclxuICAgICAgICAgICAgeCA9IChNYXRoLnJhbmRvbSgpICogZ3JvdW5kU2l6ZSAtIGdyb3VuZFNpemUgLyAyKTtcclxuICAgICAgICAgICAgeiA9IChNYXRoLnJhbmRvbSgpICogZ3JvdW5kU2l6ZSAtIGdyb3VuZFNpemUgLyAyKTtcclxuICAgICAgICB9IHdoaWxlICh0aGlzLnBsYXllci5ib2R5LnBvc2l0aW9uLmRpc3RhbmNlVG8obmV3IENBTk5PTi5WZWMzKHgsIDAsIHopKSA8IHNwYXduUmFkaXVzKTsgLy8gRW5zdXJlIG5vdCB0b28gY2xvc2UgdG8gcGxheWVyIGluaXRpYWxseVxyXG5cclxuICAgICAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogNTAsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMoeCwgZW5lbXlDb25maWcuYm9keUhlaWdodCAvIDIsIHopLCAvLyBQb3NpdGlvbiBpcyBjZW50ZXIgb2YgYm94XHJcbiAgICAgICAgICAgIHNoYXBlOiBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoZW5lbXlDb25maWcuYm9keVdpZHRoIC8gMiwgZW5lbXlDb25maWcuYm9keUhlaWdodCAvIDIsIGVuZW15Q29uZmlnLmJvZHlEZXB0aCAvIDIpKSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSAvLyBQcmV2ZW50IGVuZW1pZXMgZnJvbSB0b3BwbGluZ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keShib2R5KTtcclxuXHJcbiAgICAgICAgY29uc3QgZW5lbXk6IEdhbWVPYmplY3QgPSB7XHJcbiAgICAgICAgICAgIG1lc2gsIGJvZHksIGN1cnJlbnRIZWFsdGg6IGVuZW15Q29uZmlnLm1heEhlYWx0aCwgbGFzdFNob3RUaW1lOiAwXHJcbiAgICAgICAgfTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMucHVzaChlbmVteSk7XHJcblxyXG4gICAgICAgIC8vIFNldHVwIGNvbGxpc2lvbiBsaXN0ZW5lciBmb3IgZW5lbXlcclxuICAgICAgICBib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbGxpZGUnLCAoZXZlbnQ6IGFueSkgPT4gdGhpcy5oYW5kbGVFbmVteUNvbGxpc2lvbihlbmVteSwgZXZlbnQpKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNob290QnVsbGV0KG93bmVyOiAncGxheWVyJyB8ICdlbmVteScsIHBvc2l0aW9uPzogQ0FOTk9OLlZlYzMsIGRpcmVjdGlvbj86IENBTk5PTi5WZWMzKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgZmlyZSByYXRlIGNoZWNrXHJcbiAgICAgICAgaWYgKG93bmVyID09PSAncGxheWVyJyAmJiBwZXJmb3JtYW5jZS5ub3coKSAtIHRoaXMubGFzdFBsYXllclNob290VGltZSA8IHRoaXMuY29uZmlnLnBsYXllci5maXJlUmF0ZSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEVuZW15IHNwZWNpZmljIHBhcmFtZXRlcnMgY2hlY2tcclxuICAgICAgICBpZiAob3duZXIgPT09ICdlbmVteScgJiYgKCFwb3NpdGlvbiB8fCAhZGlyZWN0aW9uKSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRW5lbXkgYnVsbGV0IG5lZWRzIGV4cGxpY2l0IHBvc2l0aW9uIGFuZCBkaXJlY3Rpb24uXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5wbGF5U291bmQoJ3Nob290U291bmQnLCBmYWxzZSwgMC4yKTsgLy8gUGxheSBzaG9vdCBzb3VuZFxyXG5cclxuICAgICAgICBjb25zdCBidWxsZXRDb25maWcgPSB0aGlzLmNvbmZpZy5idWxsZXQ7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0U3BlZWQgPSBvd25lciA9PT0gJ3BsYXllcicgPyBidWxsZXRDb25maWcucGxheWVyQnVsbGV0U3BlZWQgOiBidWxsZXRDb25maWcuZW5lbXlCdWxsZXRTcGVlZDtcclxuICAgICAgICBjb25zdCBidWxsZXRUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ2J1bGxldFRleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBidWxsZXRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCgpO1xyXG4gICAgICAgIGlmIChidWxsZXRUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGJ1bGxldE1hdGVyaWFsLm1hcCA9IGJ1bGxldFRleHR1cmU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgYnVsbGV0TWF0ZXJpYWwuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IoMHhmZmZmMDApOyAvLyBGYWxsYmFjayBjb2xvciBpZiB0ZXh0dXJlIG5vdCBsb2FkZWRcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWVzaCA9IG5ldyBUSFJFRS5NZXNoKG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeShidWxsZXRDb25maWcuc2l6ZSAvIDIsIDgsIDgpLCBidWxsZXRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYnVsbGV0TWVzaCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1bGxldEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLjEsIC8vIFNtYWxsIG1hc3MgdG8gaW50ZXJhY3Qgd2l0aCBvdGhlciBvYmplY3RzIHNsaWdodGx5XHJcbiAgICAgICAgICAgIHNoYXBlOiBuZXcgQ0FOTk9OLlNwaGVyZShidWxsZXRDb25maWcuc2l6ZSAvIDIpLFxyXG4gICAgICAgICAgICBhbGxvd1NsZWVwOiBmYWxzZSxcclxuICAgICAgICAgICAgbGluZWFyRGFtcGluZzogMCAvLyBLZWVwIHNwZWVkIGNvbnN0YW50LCBubyBhaXIgcmVzaXN0YW5jZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keShidWxsZXRCb2R5KTtcclxuXHJcbiAgICAgICAgbGV0IGJ1bGxldFBvc2l0aW9uID0gbmV3IENBTk5PTi5WZWMzKCk7XHJcbiAgICAgICAgbGV0IGJ1bGxldERpcmVjdGlvbiA9IG5ldyBDQU5OT04uVmVjMygpO1xyXG5cclxuICAgICAgICBpZiAob3duZXIgPT09ICdwbGF5ZXInKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBsYXllckNvbmZpZyA9IHRoaXMuY29uZmlnLnBsYXllcjtcclxuICAgICAgICAgICAgLy8gR2V0IGNhbWVyYSBwb3NpdGlvbiBhbmQgZGlyZWN0aW9uIGZvciBwbGF5ZXIgYnVsbGV0XHJcbiAgICAgICAgICAgIGNvbnN0IGNhbWVyYVBvc2l0aW9uID0gdGhpcy5jYW1lcmEucG9zaXRpb247IC8vIFRoaXMgaXMgYSBUSFJFRS5WZWN0b3IzXHJcbiAgICAgICAgICAgIGJ1bGxldFBvc2l0aW9uLnNldChjYW1lcmFQb3NpdGlvbi54LCBjYW1lcmFQb3NpdGlvbi55LCBjYW1lcmFQb3NpdGlvbi56KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRlbXBUaHJlZVZlY3RvciA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKHRlbXBUaHJlZVZlY3Rvcik7IC8vIFBvcHVsYXRlcyB0ZW1wVGhyZWVWZWN0b3Igd2l0aCBjYW1lcmEgZGlyZWN0aW9uXHJcbiAgICAgICAgICAgIGJ1bGxldERpcmVjdGlvbi5zZXQodGVtcFRocmVlVmVjdG9yLngsIHRlbXBUaHJlZVZlY3Rvci55LCB0ZW1wVGhyZWVWZWN0b3Iueik7XHJcbiAgICAgICAgICAgIGJ1bGxldERpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIE9mZnNldCBidWxsZXQgc2xpZ2h0bHkgZm9yd2FyZCBmcm9tIHBsYXllcidzIHZpZXcgdG8gYXZvaWQgaW1tZWRpYXRlIHNlbGYtY29sbGlzaW9uXHJcbiAgICAgICAgICAgIGJ1bGxldFBvc2l0aW9uLnZhZGQoYnVsbGV0RGlyZWN0aW9uLnNjYWxlKHBsYXllckNvbmZpZy5ib2R5V2lkdGggLyAyICsgYnVsbGV0Q29uZmlnLnNpemUpLCBidWxsZXRQb3NpdGlvbik7XHJcbiAgICAgICAgfSBlbHNlIHsgLy8gRW5lbXkgYnVsbGV0XHJcbiAgICAgICAgICAgIGlmIChwb3NpdGlvbiAmJiBkaXJlY3Rpb24pIHtcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvc2l0aW9uLmNvcHkocG9zaXRpb24pO1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0RGlyZWN0aW9uLmNvcHkoZGlyZWN0aW9uKTtcclxuICAgICAgICAgICAgICAgIC8vIE9mZnNldCBidWxsZXQgc2xpZ2h0bHkgZm9yd2FyZCBmcm9tIGVuZW15J3MgYm9keVxyXG4gICAgICAgICAgICAgICAgYnVsbGV0UG9zaXRpb24udmFkZChidWxsZXREaXJlY3Rpb24uc2NhbGUodGhpcy5jb25maWcuZW5lbXkuYm9keVdpZHRoIC8gMiArIGJ1bGxldENvbmZpZy5zaXplKSwgYnVsbGV0UG9zaXRpb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBidWxsZXRCb2R5LnBvc2l0aW9uLmNvcHkoYnVsbGV0UG9zaXRpb24pO1xyXG4gICAgICAgIGJ1bGxldEJvZHkudmVsb2NpdHkuY29weShidWxsZXREaXJlY3Rpb24uc2NhbGUoYnVsbGV0U3BlZWQpKTtcclxuXHJcbiAgICAgICAgY29uc3QgYnVsbGV0OiBHYW1lT2JqZWN0ID0ge1xyXG4gICAgICAgICAgICBtZXNoOiBidWxsZXRNZXNoLFxyXG4gICAgICAgICAgICBib2R5OiBidWxsZXRCb2R5LFxyXG4gICAgICAgICAgICBvd25lcjogb3duZXIsXHJcbiAgICAgICAgICAgIGNyZWF0aW9uVGltZTogcGVyZm9ybWFuY2Uubm93KClcclxuICAgICAgICB9O1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cy5wdXNoKGJ1bGxldCk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBjb2xsaXNpb24gbGlzdGVuZXIgZm9yIHRoZSBidWxsZXRcclxuICAgICAgICBidWxsZXRCb2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbGxpZGUnLCAoZXZlbnQ6IGFueSkgPT4gdGhpcy5oYW5kbGVCdWxsZXRDb2xsaXNpb24oYnVsbGV0LCBldmVudCkpO1xyXG5cclxuICAgICAgICBpZiAob3duZXIgPT09ICdwbGF5ZXInKSB7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdFBsYXllclNob290VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUJ1bGxldENvbGxpc2lvbihidWxsZXQ6IEdhbWVPYmplY3QsIGV2ZW50OiBhbnkpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnIHx8IGJ1bGxldC5pc0RlYWQpIHJldHVybjsgLy8gYnVsbGV0LmlzRGVhZCBhY3RzIGFzIGEgZmxhZyBmb3IgXCJhbHJlYWR5IGhpdCBhbmQgcmVtb3ZlZFwiXHJcblxyXG4gICAgICAgIGNvbnN0IG90aGVyQm9keSA9IGV2ZW50LmJvZHk7XHJcblxyXG4gICAgICAgIC8vIFByZXZlbnQgYnVsbGV0IGZyb20gaGl0dGluZyBpdHNlbGYgb3IgaXRzIG93bmVyIGltbWVkaWF0ZWx5IGFmdGVyIHNwYXduXHJcbiAgICAgICAgaWYgKGJ1bGxldC5vd25lciA9PT0gJ3BsYXllcicgJiYgb3RoZXJCb2R5ID09PSB0aGlzLnBsYXllci5ib2R5KSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGJ1bGxldC5vd25lciA9PT0gJ2VuZW15JyAmJiB0aGlzLmVuZW1pZXMuc29tZShlID0+IGUuYm9keSA9PT0gb3RoZXJCb2R5KSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmJ1bGxldHMuc29tZShiID0+IGIuYm9keSA9PT0gb3RoZXJCb2R5KSkgeyAvLyBCdWxsZXQgaGl0dGluZyBhbm90aGVyIGJ1bGxldFxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgaGl0U29tZXRoaW5nSW1wb3J0YW50ID0gZmFsc2U7XHJcblxyXG4gICAgICAgIGlmIChidWxsZXQub3duZXIgPT09ICdwbGF5ZXInKSB7XHJcbiAgICAgICAgICAgIC8vIFBsYXllciBidWxsZXQgaGl0cyBlbmVteVxyXG4gICAgICAgICAgICBjb25zdCBlbmVteUhpdCA9IHRoaXMuZW5lbWllcy5maW5kKGUgPT4gZS5ib2R5ID09PSBvdGhlckJvZHkgJiYgIWUuaXNEZWFkKTtcclxuICAgICAgICAgICAgaWYgKGVuZW15SGl0KSB7XHJcbiAgICAgICAgICAgICAgICBlbmVteUhpdC5jdXJyZW50SGVhbHRoISAtPSB0aGlzLmNvbmZpZy5wbGF5ZXIuYnVsbGV0RGFtYWdlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheVNvdW5kKCdoaXRTb3VuZCcsIGZhbHNlLCAwLjQpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGVuZW15SGl0LmN1cnJlbnRIZWFsdGghIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZW15S2lsbGVkKGVuZW15SGl0KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGhpdFNvbWV0aGluZ0ltcG9ydGFudCA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKGJ1bGxldC5vd25lciA9PT0gJ2VuZW15Jykge1xyXG4gICAgICAgICAgICAvLyBFbmVteSBidWxsZXQgaGl0cyBwbGF5ZXJcclxuICAgICAgICAgICAgaWYgKG90aGVyQm9keSA9PT0gdGhpcy5wbGF5ZXIuYm9keSAmJiAhdGhpcy5wbGF5ZXIuaXNEZWFkKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5jdXJyZW50SGVhbHRoISAtPSB0aGlzLmNvbmZpZy5lbmVteS5idWxsZXREYW1hZ2U7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5wbGF5U291bmQoJ2hpdFNvdW5kJywgZmFsc2UsIDAuNCk7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wbGF5ZXIuY3VycmVudEhlYWx0aCEgPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGxheWVyLmlzRGVhZCA9IHRydWU7IC8vIE1hcmsgcGxheWVyIGFzIGRlYWQgZm9yIGdhbWUgb3ZlciBjaGVja1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaGl0U29tZXRoaW5nSW1wb3J0YW50ID0gdHJ1ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIGJ1bGxldCBpZiBpdCBoaXQgc29tZXRoaW5nIGltcG9ydGFudCBvciB0aGUgZ3JvdW5kXHJcbiAgICAgICAgaWYgKGhpdFNvbWV0aGluZ0ltcG9ydGFudCB8fCBvdGhlckJvZHkgPT09IHRoaXMuZ3JvdW5kQm9keSkge1xyXG4gICAgICAgICAgICBidWxsZXQuaXNEZWFkID0gdHJ1ZTsgLy8gTWFyayBmb3IgcmVtb3ZhbFxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYnVsbGV0LmJvZHkpO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShidWxsZXQubWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0cyA9IHRoaXMuYnVsbGV0cy5maWx0ZXIoYiA9PiBiICE9PSBidWxsZXQpOyAvLyBSZW1vdmUgZnJvbSBhY3RpdmUgYnVsbGV0cyBsaXN0XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaGFuZGxlRW5lbXlDb2xsaXNpb24oZW5lbXk6IEdhbWVPYmplY3QsIGV2ZW50OiBhbnkpOiB2b2lkIHtcclxuICAgICAgICAvLyBUaGlzIGlzIHByaW1hcmlseSBmb3IgYnVsbGV0IGNvbGxpc2lvbnMsIHdoaWNoIGFyZSBoYW5kbGVkIGluIGhhbmRsZUJ1bGxldENvbGxpc2lvblxyXG4gICAgICAgIC8vIFRoaXMgZnVuY3Rpb24gY291bGQgYmUgZXhwYW5kZWQgZm9yIG1lbGVlIGF0dGFja3Mgb3Igb3RoZXIgZW5lbXktc3BlY2lmaWMgaW50ZXJhY3Rpb25zLlxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZW5lbXlLaWxsZWQoZW5lbXk6IEdhbWVPYmplY3QpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnIHx8IGVuZW15LmlzRGVhZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBlbmVteS5pc0RlYWQgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMucGxheWVyLnNjb3JlISArPSB0aGlzLmNvbmZpZy5lbmVteS5wb2ludHM7XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBlbmVteSBhZnRlciBhIHNob3J0IGRlbGF5IGZvciB2aXN1YWwgZWZmZWN0XHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlbmVteS5ib2R5KSB0aGlzLndvcmxkLnJlbW92ZUJvZHkoZW5lbXkuYm9keSk7XHJcbiAgICAgICAgICAgIGlmIChlbmVteS5tZXNoKSB0aGlzLnNjZW5lLnJlbW92ZShlbmVteS5tZXNoKTtcclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzID0gdGhpcy5lbmVtaWVzLmZpbHRlcihlID0+IGUgIT09IGVuZW15KTtcclxuICAgICAgICB9LCAxMDApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgcmVuZGVyKCk6IHZvaWQge1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gSW5zdGFudGlhdGUgYW5kIHN0YXJ0IHRoZSBnYW1lIHdoZW4gdGhlIERPTSBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIGNvbnN0IGdhbWUgPSBuZXcgR2FtZSgpO1xyXG4gICAgZ2FtZS5pbml0KCk7XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFDeEIsU0FBUywyQkFBMkI7QUE0RHBDLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBSkMsU0FBQUE7QUFBQSxHQUFBO0FBb0JMLE1BQU0sYUFBYTtBQUFBLEVBS2YsY0FBYztB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
