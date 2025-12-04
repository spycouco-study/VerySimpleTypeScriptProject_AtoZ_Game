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
    const handleOverlayClick = () => {
      if (this.gameState === 0 /* TITLE */ || this.gameState === 2 /* GAME_OVER */ || this.gameState === 3 /* WIN */) {
        this.audioManager.resumeContext();
        this.startGame();
      }
    };
    this.uiElements["titleScreen"].addEventListener("click", handleOverlayClick);
    this.uiElements["gameOverScreen"].addEventListener("click", handleOverlayClick);
    this.uiElements["winScreen"].addEventListener("click", handleOverlayClick);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuaW1wb3J0IHsgUG9pbnRlckxvY2tDb250cm9scyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS9jb250cm9scy9Qb2ludGVyTG9ja0NvbnRyb2xzLmpzJztcclxuXHJcbi8vIC0tLSBHbG9iYWwgVHlwZXMgLS0tXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWU6IHtcclxuICAgICAgICB0aXRsZVRleHQ6IHN0cmluZztcclxuICAgICAgICBjbGlja1RvU3RhcnRUZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZU92ZXJUZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgd2luVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHNjb3JlVG9XaW46IG51bWJlcjtcclxuICAgICAgICBlbmVteVNwYXduSW50ZXJ2YWw6IG51bWJlcjsgLy8gbXNcclxuICAgICAgICBtYXhFbmVtaWVzOiBudW1iZXI7XHJcbiAgICAgICAgZ2FtZUR1cmF0aW9uOiBudW1iZXI7IC8vIG1zLCBjdXJyZW50bHkgdW51c2VkIGZvciBzaW1wbGljaXR5XHJcbiAgICB9O1xyXG4gICAgcGxheWVyOiB7XHJcbiAgICAgICAgc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBqdW1wRm9yY2U6IG51bWJlcjtcclxuICAgICAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXREYW1hZ2U6IG51bWJlcjtcclxuICAgICAgICBmaXJlUmF0ZTogbnVtYmVyOyAvLyBtc1xyXG4gICAgICAgIGJvZHlXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGJvZHlIZWlnaHQ6IG51bWJlcjtcclxuICAgICAgICBib2R5RGVwdGg6IG51bWJlcjtcclxuICAgICAgICBpbml0aWFsU3Bhd25ZOiBudW1iZXI7IC8vIFBsYXllcidzIGluaXRpYWwgWSBwb3NpdGlvbiBmb3IgdGhlIHBoeXNpY3MgYm9keSdzIGNlbnRlclxyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBDYW1lcmEgaGVpZ2h0IGFib3ZlIHRoZSBwbGF5ZXIgYm9keSdzIGNlbnRlclxyXG4gICAgfTtcclxuICAgIGVuZW15OiB7XHJcbiAgICAgICAgc3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBtYXhIZWFsdGg6IG51bWJlcjtcclxuICAgICAgICBidWxsZXREYW1hZ2U6IG51bWJlcjtcclxuICAgICAgICBmaXJlUmF0ZTogbnVtYmVyOyAvLyBtc1xyXG4gICAgICAgIHNwYXduUmFkaXVzOiBudW1iZXI7XHJcbiAgICAgICAgYm9keVdpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgYm9keUhlaWdodDogbnVtYmVyO1xyXG4gICAgICAgIGJvZHlEZXB0aDogbnVtYmVyO1xyXG4gICAgICAgIHBvaW50czogbnVtYmVyO1xyXG4gICAgfTtcclxuICAgIGJ1bGxldDoge1xyXG4gICAgICAgIHBsYXllckJ1bGxldFNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgZW5lbXlCdWxsZXRTcGVlZDogbnVtYmVyO1xyXG4gICAgICAgIHNpemU6IG51bWJlcjtcclxuICAgICAgICBsaWZldGltZTogbnVtYmVyOyAvLyBtc1xyXG4gICAgfTtcclxuICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgZ3JvdW5kU2l6ZTogbnVtYmVyO1xyXG4gICAgICAgIGdyYXZpdHk6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTtcclxuICAgICAgICBncm91bmRUZXh0dXJlUGF0aDogc3RyaW5nO1xyXG4gICAgICAgIHdhbGxUZXh0dXJlUGF0aDogc3RyaW5nO1xyXG4gICAgfTtcclxuICAgIGFzc2V0czoge1xyXG4gICAgICAgIHBsYXllclRleHR1cmU6IHN0cmluZzsgLy8gQ3VycmVudGx5IHVudXNlZCBpbiBGUFMsIGJ1dCBhdmFpbGFibGVcclxuICAgICAgICBlbmVteVRleHR1cmU6IHN0cmluZztcclxuICAgICAgICBidWxsZXRUZXh0dXJlOiBzdHJpbmc7XHJcbiAgICAgICAgc2hvb3RTb3VuZDogc3RyaW5nO1xyXG4gICAgICAgIGhpdFNvdW5kOiBzdHJpbmc7XHJcbiAgICAgICAgZ2FtZU92ZXJTb3VuZDogc3RyaW5nO1xyXG4gICAgICAgIGJhY2tncm91bmRNdXNpYzogc3RyaW5nO1xyXG4gICAgfTtcclxufVxyXG5cclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsXHJcbiAgICBQTEFZSU5HLFxyXG4gICAgR0FNRV9PVkVSLFxyXG4gICAgV0lOXHJcbn1cclxuXHJcbmludGVyZmFjZSBHYW1lT2JqZWN0IHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDQU5OT04uQm9keTtcclxuICAgIG93bmVyPzogJ3BsYXllcicgfCAnZW5lbXknOyAvLyBGb3IgYnVsbGV0c1xyXG4gICAgY3JlYXRpb25UaW1lPzogbnVtYmVyOyAvLyBGb3IgYnVsbGV0cyBsaWZldGltZVxyXG4gICAgLy8gRm9yIGVudGl0aWVzIGxpa2UgcGxheWVyL2VuZW15XHJcbiAgICBjdXJyZW50SGVhbHRoPzogbnVtYmVyO1xyXG4gICAgaXNEZWFkPzogYm9vbGVhbjtcclxuICAgIGxhc3RTaG90VGltZT86IG51bWJlcjtcclxuICAgIHNjb3JlPzogbnVtYmVyOyAvLyBGb3IgcGxheWVyXHJcbn1cclxuXHJcbi8vIC0tLSBBdWRpbyBIZWxwZXIgLS0tXHJcbmNsYXNzIEF1ZGlvTWFuYWdlciB7XHJcbiAgICBwcml2YXRlIGF1ZGlvQ29udGV4dDogQXVkaW9Db250ZXh0O1xyXG4gICAgcHJpdmF0ZSBidWZmZXJzOiBNYXA8c3RyaW5nLCBBdWRpb0J1ZmZlcj47XHJcbiAgICBwcml2YXRlIGJhY2tncm91bmRNdXNpY1NvdXJjZTogQXVkaW9CdWZmZXJTb3VyY2VOb2RlIHwgbnVsbDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dCA9IG5ldyAod2luZG93LkF1ZGlvQ29udGV4dCB8fCAod2luZG93IGFzIGFueSkud2Via2l0QXVkaW9Db250ZXh0KSgpO1xyXG4gICAgICAgIHRoaXMuYnVmZmVycyA9IG5ldyBNYXAoKTtcclxuICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpY1NvdXJjZSA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgbG9hZFNvdW5kKG5hbWU6IHN0cmluZywgdXJsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHVybCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGFycmF5QnVmZmVyID0gYXdhaXQgcmVzcG9uc2UuYXJyYXlCdWZmZXIoKTtcclxuICAgICAgICAgICAgY29uc3QgYXVkaW9CdWZmZXIgPSBhd2FpdCB0aGlzLmF1ZGlvQ29udGV4dC5kZWNvZGVBdWRpb0RhdGEoYXJyYXlCdWZmZXIpO1xyXG4gICAgICAgICAgICB0aGlzLmJ1ZmZlcnMuc2V0KG5hbWUsIGF1ZGlvQnVmZmVyKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBsb2FkaW5nIHNvdW5kICR7dXJsfTpgLCBlcnJvcik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHBsYXlTb3VuZChuYW1lOiBzdHJpbmcsIGxvb3A6IGJvb2xlYW4gPSBmYWxzZSwgdm9sdW1lOiBudW1iZXIgPSAxKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgYnVmZmVyID0gdGhpcy5idWZmZXJzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAoYnVmZmVyKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUJ1ZmZlclNvdXJjZSgpO1xyXG4gICAgICAgICAgICBzb3VyY2UuYnVmZmVyID0gYnVmZmVyO1xyXG4gICAgICAgICAgICBzb3VyY2UubG9vcCA9IGxvb3A7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBnYWluTm9kZSA9IHRoaXMuYXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcclxuICAgICAgICAgICAgZ2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcclxuICAgICAgICAgICAgc291cmNlLmNvbm5lY3QoZ2Fpbk5vZGUpO1xyXG4gICAgICAgICAgICBnYWluTm9kZS5jb25uZWN0KHRoaXMuYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIHNvdXJjZS5zdGFydCgwKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChsb29wKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5iYWNrZ3JvdW5kTXVzaWNTb3VyY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmJhY2tncm91bmRNdXNpY1NvdXJjZS5zdG9wKCk7IC8vIFN0b3AgcHJldmlvdXMgQkdNIGlmIHBsYXlpbmdcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZE11c2ljU291cmNlID0gc291cmNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gY29uc29sZS53YXJuKGBTb3VuZCAke25hbWV9IG5vdCBsb2FkZWQuYCk7IC8vIFN1cHByZXNzIHdhcm5pbmcgZm9yIHBvdGVudGlhbGx5IG1pc3NpbmcgYXNzZXRzXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHN0b3BCYWNrZ3JvdW5kTXVzaWMoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuYmFja2dyb3VuZE11c2ljU291cmNlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuYmFja2dyb3VuZE11c2ljU291cmNlLnN0b3AoKTtcclxuICAgICAgICAgICAgdGhpcy5iYWNrZ3JvdW5kTXVzaWNTb3VyY2UgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBFbnN1cmUgY29udGV4dCBpcyByZXN1bWVkIGZvciBwbGF5YmFjayBpZiBpdCB3YXMgc3VzcGVuZGVkIChicm93c2VyIHBvbGljeSlcclxuICAgIHJlc3VtZUNvbnRleHQoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHRoaXMuYXVkaW9Db250ZXh0LnN0YXRlID09PSAnc3VzcGVuZGVkJykge1xyXG4gICAgICAgICAgICB0aGlzLmF1ZGlvQ29udGV4dC5yZXN1bWUoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG4vLyAtLS0gTWFpbiBHYW1lIENsYXNzIC0tLVxyXG5jbGFzcyBHYW1lIHtcclxuICAgIC8vIFRocmVlLmpzXHJcbiAgICBwcml2YXRlIHNjZW5lOiBUSFJFRS5TY2VuZTtcclxuICAgIHByaXZhdGUgY2FtZXJhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXI6IFRIUkVFLldlYkdMUmVuZGVyZXI7XHJcbiAgICBwcml2YXRlIGNvbnRyb2xzOiBQb2ludGVyTG9ja0NvbnRyb2xzO1xyXG4gICAgcHJpdmF0ZSBwcmV2VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG5cclxuICAgIC8vIENhbm5vbi5qc1xyXG4gICAgcHJpdmF0ZSB3b3JsZDogQ0FOTk9OLldvcmxkO1xyXG4gICAgcHJpdmF0ZSBncm91bmRCb2R5OiBDQU5OT04uQm9keTtcclxuXHJcbiAgICAvLyBHYW1lIE9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyOiBHYW1lT2JqZWN0ICYge1xyXG4gICAgICAgIGNhbkp1bXA6IGJvb2xlYW47XHJcbiAgICB9O1xyXG4gICAgcHJpdmF0ZSBlbmVtaWVzOiBHYW1lT2JqZWN0W10gPSBbXTtcclxuICAgIHByaXZhdGUgYnVsbGV0czogR2FtZU9iamVjdFtdID0gW107XHJcblxyXG4gICAgLy8gQ29uZmlndXJhdGlvbiAmIEFzc2V0c1xyXG4gICAgcHJpdmF0ZSBjb25maWc6IEdhbWVDb25maWcgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpO1xyXG4gICAgcHJpdmF0ZSBhdWRpb01hbmFnZXI6IEF1ZGlvTWFuYWdlcjtcclxuXHJcbiAgICAvLyBHYW1lIFN0YXRlXHJcbiAgICBwcml2YXRlIGdhbWVTdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFO1xyXG4gICAgcHJpdmF0ZSBpbnB1dFN0YXRlczogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gRm9yIGtleWJvYXJkIGlucHV0XHJcbiAgICBwcml2YXRlIGxhc3RQbGF5ZXJTaG9vdFRpbWU6IG51bWJlciA9IDA7XHJcbiAgICBwcml2YXRlIGxhc3RFbmVteVNwYXduVGltZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvLyBVSSBFbGVtZW50c1xyXG4gICAgcHJpdmF0ZSB1aUVsZW1lbnRzOiB7IFtrZXk6IHN0cmluZ106IEhUTUxFbGVtZW50IH0gPSB7fTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICAvLyBJbml0aWFsaXplIGJhc2ljIGNvbXBvbmVudHNcclxuICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoNzUsIHdpbmRvdy5pbm5lcldpZHRoIC8gd2luZG93LmlubmVySGVpZ2h0LCAwLjEsIDEwMDApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG4gICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyID0gbmV3IEF1ZGlvTWFuYWdlcigpO1xyXG5cclxuICAgICAgICAvLyBCaW5kIGV2ZW50IGxpc3RlbmVyc1xyXG4gICAgICAgIHRoaXMub25LZXlEb3duID0gdGhpcy5vbktleURvd24uYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLm9uS2V5VXAgPSB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKTtcclxuICAgICAgICB0aGlzLm9uTW91c2VEb3duID0gdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpO1xyXG4gICAgICAgIHRoaXMub25XaW5kb3dSZXNpemUgPSB0aGlzLm9uV2luZG93UmVzaXplLmJpbmQodGhpcyk7XHJcbiAgICAgICAgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlID0gdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICAvLyAxLiBMb2FkIGRhdGFcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRDb25maWcoKTtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24uXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyAyLiBTZXR1cCBSZW5kZXJlclxyXG4gICAgICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCFjYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkNhbnZhcyBlbGVtZW50ICdnYW1lQ2FudmFzJyBub3QgZm91bmQuXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZShjYW52YXMuY2xpZW50V2lkdGgsIGNhbnZhcy5jbGllbnRIZWlnaHQpO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XHJcbiAgICAgICAgLy8gUmVwbGFjZSBvcmlnaW5hbCBjYW52YXMgd2l0aCBUaHJlZS5qcydzIGNhbnZhcywgcmV0YWluaW5nIElEXHJcbiAgICAgICAgY2FudmFzLnBhcmVudE5vZGU/LnJlcGxhY2VDaGlsZCh0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQsIGNhbnZhcyk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5kb21FbGVtZW50LmlkID0gJ2dhbWVDYW52YXMnO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudC5zdHlsZS50b3VjaEFjdGlvbiA9ICdub25lJzsgLy8gUHJldmVudCBicm93c2VyIGdlc3R1cmVzIG9uIGNhbnZhc1xyXG5cclxuICAgICAgICAvLyAzLiBMb2FkIEFzc2V0c1xyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA0LiBTZXR1cCBTY2VuZSBhbmQgUGh5c2ljc1xyXG4gICAgICAgIHRoaXMuc2V0dXBTY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuc2V0dXBQaHlzaWNzKCk7XHJcblxyXG4gICAgICAgIC8vIDUuIFNldHVwIFBsYXllciBDb250cm9scyAod2lsbCBiZSBlbmFibGVkIG9uIGdhbWUgc3RhcnQpXHJcbiAgICAgICAgdGhpcy5jb250cm9scyA9IG5ldyBQb2ludGVyTG9ja0NvbnRyb2xzKHRoaXMuY2FtZXJhLCB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQpO1xyXG4gICAgICAgIHRoaXMuY29udHJvbHMuYWRkRXZlbnRMaXN0ZW5lcignbG9jaycsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZSk7XHJcbiAgICAgICAgdGhpcy5jb250cm9scy5hZGRFdmVudExpc3RlbmVyKCd1bmxvY2snLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UpO1xyXG5cclxuICAgICAgICAvLyA2LiBDcmVhdGUgVUlcclxuICAgICAgICB0aGlzLmNyZWF0ZVVJKCk7XHJcbiAgICAgICAgdGhpcy5zdGFydFRpdGxlU2NyZWVuKCk7XHJcblxyXG4gICAgICAgIC8vIDcuIEV2ZW50IExpc3RlbmVyc1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCB0aGlzLm9uV2luZG93UmVzaXplKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24pO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm9uTW91c2VEb3duKTtcclxuICAgICAgICAvLyBSZW1vdmVkIHRoZSBjbGljayBsaXN0ZW5lciBvbiByZW5kZXJlci5kb21FbGVtZW50IGZvciBnYW1lIHN0YXJ0L3Jlc3RhcnRcclxuICAgICAgICAvLyBhcyBVSSBvdmVybGF5IGVsZW1lbnRzIHdvdWxkIGJsb2NrIGl0LlxyXG5cclxuICAgICAgICAvLyBBZGQgY2xpY2sgbGlzdGVuZXJzIHRvIHRoZSBzcGVjaWZpYyBVSSBvdmVybGF5IGVsZW1lbnRzXHJcbiAgICAgICAgY29uc3QgaGFuZGxlT3ZlcmxheUNsaWNrID0gKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSB8fCB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLkdBTUVfT1ZFUiB8fCB0aGlzLmdhbWVTdGF0ZSA9PT0gR2FtZVN0YXRlLldJTikge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucmVzdW1lQ29udGV4dCgpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydEdhbWUoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWyd0aXRsZVNjcmVlbiddLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlT3ZlcmxheUNsaWNrKTtcclxuICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ2dhbWVPdmVyU2NyZWVuJ10uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVPdmVybGF5Q2xpY2spO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snd2luU2NyZWVuJ10uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBoYW5kbGVPdmVybGF5Q2xpY2spO1xyXG5cclxuICAgICAgICAvLyA4LiBTdGFydCBhbmltYXRpb24gbG9vcFxyXG4gICAgICAgIHRoaXMuYW5pbWF0ZSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBkYXRhLmpzb246JywgZXJyb3IpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcclxuXHJcbiAgICAgICAgLy8gTG9hZCB0ZXh0dXJlc1xyXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHRoaXMuY29uZmlnLmFzc2V0cykge1xyXG4gICAgICAgICAgICBpZiAoa2V5LmVuZHNXaXRoKCdUZXh0dXJlJykpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSAodGhpcy5jb25maWcuYXNzZXRzIGFzIGFueSlba2V5XTtcclxuICAgICAgICAgICAgICAgIHByb21pc2VzLnB1c2goXHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZUxvYWRlci5sb2FkQXN5bmMocGF0aClcclxuICAgICAgICAgICAgICAgICAgICAgICAgLnRoZW4odGV4dHVyZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVzLnNldChrZXksIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCB0ZXh0dXJlICR7cGF0aH06YCwgZSkpXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBMb2FkIHNvdW5kc1xyXG4gICAgICAgIGZvciAoY29uc3Qga2V5IGluIHRoaXMuY29uZmlnLmFzc2V0cykge1xyXG4gICAgICAgICAgICBpZiAoa2V5LmVuZHNXaXRoKCdTb3VuZCcpIHx8IGtleS5lbmRzV2l0aCgnTXVzaWMnKSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9ICh0aGlzLmNvbmZpZy5hc3NldHMgYXMgYW55KVtrZXldO1xyXG4gICAgICAgICAgICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLmF1ZGlvTWFuYWdlci5sb2FkU291bmQoa2V5LCBwYXRoKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwU2NlbmUoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLnNjZW5lLmJhY2tncm91bmQgPSBuZXcgVEhSRUUuQ29sb3IoMHg4N2NlZWIpOyAvLyBTa3kgYmx1ZVxyXG4gICAgICAgIHRoaXMuc2NlbmUuZm9nID0gbmV3IFRIUkVFLkZvZygweDg3Y2VlYiwgMC4xLCAxMDApO1xyXG5cclxuICAgICAgICAvLyBMaWdodGluZ1xyXG4gICAgICAgIGNvbnN0IGhlbWlMaWdodCA9IG5ldyBUSFJFRS5IZW1pc3BoZXJlTGlnaHQoMHhmZmZmZmYsIDB4NDQ0NDQ0KTtcclxuICAgICAgICBoZW1pTGlnaHQucG9zaXRpb24uc2V0KDAsIDIwLCAwKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChoZW1pTGlnaHQpO1xyXG5cclxuICAgICAgICBjb25zdCBkaXJMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmKTtcclxuICAgICAgICBkaXJMaWdodC5wb3NpdGlvbi5zZXQoLTMsIDEwLCAtNSk7XHJcbiAgICAgICAgZGlyTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgZGlyTGlnaHQuc2hhZG93LmNhbWVyYS50b3AgPSAxMDtcclxuICAgICAgICBkaXJMaWdodC5zaGFkb3cuY2FtZXJhLmJvdHRvbSA9IC0xMDtcclxuICAgICAgICBkaXJMaWdodC5zaGFkb3cuY2FtZXJhLmxlZnQgPSAtMTA7XHJcbiAgICAgICAgZGlyTGlnaHQuc2hhZG93LmNhbWVyYS5yaWdodCA9IDEwO1xyXG4gICAgICAgIGRpckxpZ2h0LnNoYWRvdy5jYW1lcmEubmVhciA9IDAuMTtcclxuICAgICAgICBkaXJMaWdodC5zaGFkb3cuY2FtZXJhLmZhciA9IDQwO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpckxpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kXHJcbiAgICAgICAgY29uc3QgZ3JvdW5kVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdncm91bmRUZXh0dXJlUGF0aCcpO1xyXG4gICAgICAgIGlmIChncm91bmRUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGdyb3VuZFRleHR1cmUucmVwZWF0LnNldCh0aGlzLmNvbmZpZy5lbnZpcm9ubWVudC5ncm91bmRTaXplIC8gMiwgdGhpcy5jb25maWcuZW52aXJvbm1lbnQuZ3JvdW5kU2l6ZSAvIDIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoUGhvbmdNYXRlcmlhbCgpO1xyXG4gICAgICAgIGlmIChncm91bmRUZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGdyb3VuZE1hdGVyaWFsLm1hcCA9IGdyb3VuZFRleHR1cmU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZ3JvdW5kTWF0ZXJpYWwuY29sb3IgPSBuZXcgVEhSRUUuQ29sb3IoMHg4MDgwODApOyAvLyBGYWxsYmFjayBjb2xvciBpZiB0ZXh0dXJlIG5vdCBsb2FkZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChcclxuICAgICAgICAgICAgbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkodGhpcy5jb25maWcuZW52aXJvbm1lbnQuZ3JvdW5kU2l6ZSwgdGhpcy5jb25maWcuZW52aXJvbm1lbnQuZ3JvdW5kU2l6ZSwgMSwgMSksXHJcbiAgICAgICAgICAgIGdyb3VuZE1hdGVyaWFsXHJcbiAgICAgICAgKTtcclxuICAgICAgICBncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7XHJcbiAgICAgICAgZ3JvdW5kTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChncm91bmRNZXNoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNldHVwUGh5c2ljcygpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcblxyXG4gICAgICAgIHRoaXMud29ybGQuZ3Jhdml0eS5zZXQodGhpcy5jb25maWcuZW52aXJvbm1lbnQuZ3Jhdml0eVswXSwgdGhpcy5jb25maWcuZW52aXJvbm1lbnQuZ3Jhdml0eVsxXSwgdGhpcy5jb25maWcuZW52aXJvbm1lbnQuZ3Jhdml0eVsyXSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5TQVBCcm9hZHBoYXNlKHRoaXMud29ybGQpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWxsb3dTbGVlcCA9IHRydWU7XHJcblxyXG4gICAgICAgIC8vIEdyb3VuZCBib2R5XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kU2hhcGUgPSBuZXcgQ0FOTk9OLlBsYW5lKCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMCB9KTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkuYWRkU2hhcGUoZ3JvdW5kU2hhcGUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21FdWxlcigtTWF0aC5QSSAvIDIsIDAsIDApOyAvLyBSb3RhdGUgZ3JvdW5kIHRvIGJlIGhvcml6b250YWxcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5ncm91bmRCb2R5KTtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGNvbnN0IHBsYXllckNvbmZpZyA9IHRoaXMuY29uZmlnLnBsYXllcjtcclxuICAgICAgICAvLyBVc2luZyBhIGJveCBzaGFwZSBmb3IgdGhlIHBsYXllciBib2R5XHJcbiAgICAgICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMocGxheWVyQ29uZmlnLmJvZHlXaWR0aCAvIDIsIHBsYXllckNvbmZpZy5ib2R5SGVpZ2h0IC8gMiwgcGxheWVyQ29uZmlnLmJvZHlEZXB0aCAvIDIpKTtcclxuICAgICAgICB0aGlzLnBsYXllciA9IHtcclxuICAgICAgICAgICAgbWVzaDogbmV3IFRIUkVFLk1lc2goKSwgLy8gUGxhY2Vob2xkZXIsIG5vdCB2aXN1YWxseSBhZGRlZCBkaXJlY3RseSBmb3IgdGhlIHBsYXllciBcImJvZHlcIlxyXG4gICAgICAgICAgICBib2R5OiBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogNzAsIC8vIFBsYXllciBtYXNzXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKDAsIHBsYXllckNvbmZpZy5pbml0aWFsU3Bhd25ZLCAwKSwgLy8gUG9zaXRpb24gaXMgY2VudGVyIG9mIGJveFxyXG4gICAgICAgICAgICAgICAgc2hhcGU6IHBsYXllclNoYXBlLFxyXG4gICAgICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSAvLyBQcmV2ZW50IHBsYXllciBmcm9tIHRvcHBsaW5nIG92ZXJcclxuICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgIGNhbkp1bXA6IGZhbHNlLFxyXG4gICAgICAgICAgICBjdXJyZW50SGVhbHRoOiBwbGF5ZXJDb25maWcubWF4SGVhbHRoLFxyXG4gICAgICAgICAgICBzY29yZTogMFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMucGxheWVyLmJvZHkpO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgY29sbGlzaW9uIGxpc3RlbmVyIHRvIGNoZWNrIGZvciBncm91bmQgY29udGFjdFxyXG4gICAgICAgIHRoaXMucGxheWVyLmJvZHkuYWRkRXZlbnRMaXN0ZW5lcignY29sbGlkZScsIChldmVudDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRhY3QgPSBldmVudC5jb250YWN0O1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBwbGF5ZXIncyBib2R5IGlzIG9uZSBvZiB0aGUgY29sbGlkaW5nIGJvZGllc1xyXG4gICAgICAgICAgICBpZiAoY29udGFjdC5iaS5pZCA9PT0gdGhpcy5wbGF5ZXIuYm9keS5pZCB8fCBjb250YWN0LmJqLmlkID09PSB0aGlzLnBsYXllci5ib2R5LmlkKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgbm9ybWFsIHZlY3RvcidzIFkgY29tcG9uZW50IGlzIHNpZ25pZmljYW50bHkgcG9zaXRpdmUgKHBvaW50aW5nIHVwd2FyZHMpLFxyXG4gICAgICAgICAgICAgICAgLy8gaXQgbWVhbnMgdGhlIGNvbnRhY3Qgc3VyZmFjZSBpcyBiZWxvdyB0aGUgcGxheWVyLCBpbmRpY2F0aW5nIGdyb3VuZCBjb250YWN0LlxyXG4gICAgICAgICAgICAgICAgY29uc3Qgbm9ybWFsID0gKGNvbnRhY3QuYmkuaWQgPT09IHRoaXMucGxheWVyLmJvZHkuaWQpID8gY29udGFjdC5uaSA6IGNvbnRhY3Qubmo7XHJcbiAgICAgICAgICAgICAgICBpZiAobm9ybWFsLnkgPiAwLjUpIHsgLy8gVGhyZXNob2xkIGZvciBjb25zaWRlcmluZyBpdCBncm91bmRcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5jYW5KdW1wID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCBjYW1lcmEgcG9zaXRpb24gcmVsYXRpdmUgdG8gcGxheWVyIGJvZHlcclxuICAgICAgICAvLyBjYW1lcmEucG9zaXRpb24ueSA9IHBsYXllci5ib2R5LnBvc2l0aW9uLnkgKGNlbnRlciBvZiBib2R5KSArIGNhbWVyYUhlaWdodE9mZnNldFxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnNldCgwLCBwbGF5ZXJDb25maWcuaW5pdGlhbFNwYXduWSArIHBsYXllckNvbmZpZy5jYW1lcmFIZWlnaHRPZmZzZXQsIDApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlVUkoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgY3JlYXRlRGl2ID0gKGlkOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nID0gJycsIGlubmVySFRNTDogc3RyaW5nID0gJycpOiBIVE1MRWxlbWVudCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBkaXYuaWQgPSBpZDtcclxuICAgICAgICAgICAgZGl2LmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcclxuICAgICAgICAgICAgZGl2LmlubmVySFRNTCA9IGlubmVySFRNTDtcclxuICAgICAgICAgICAgZGl2LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuICAgICAgICAgICAgZGl2LnN0eWxlLmNvbG9yID0gJ3doaXRlJztcclxuICAgICAgICAgICAgZGl2LnN0eWxlLmZvbnRGYW1pbHkgPSAnbW9ub3NwYWNlJztcclxuICAgICAgICAgICAgZGl2LnN0eWxlLnRleHRTaGFkb3cgPSAnMnB4IDJweCA0cHggcmdiYSgwLDAsMCwwLjgpJztcclxuICAgICAgICAgICAgZGl2LnN0eWxlLnpJbmRleCA9ICcxMDAnO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGRpdik7XHJcbiAgICAgICAgICAgIHJldHVybiBkaXY7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZykgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ3RpdGxlU2NyZWVuJ10gPSBjcmVhdGVEaXYoJ3RpdGxlU2NyZWVuJywgJycsIGBcclxuICAgICAgICAgICAgPGgxIHN0eWxlPVwidGV4dC1hbGlnbjogY2VudGVyOyBmb250LXNpemU6IDRlbTsgbWFyZ2luLXRvcDogMTUlO1wiPlNpbXBsZSAzRCBGUFM8L2gxPlxyXG4gICAgICAgICAgICA8cCBzdHlsZT1cInRleHQtYWxpZ246IGNlbnRlcjsgZm9udC1zaXplOiAyZW07XCI+JHt0aGlzLmNvbmZpZy5nYW1lLmNsaWNrVG9TdGFydFRleHR9PC9wPlxyXG4gICAgICAgICAgICA8cCBzdHlsZT1cInRleHQtYWxpZ246IGNlbnRlcjsgZm9udC1zaXplOiAxLjJlbTsgbWFyZ2luLXRvcDogNSU7XCI+XHJcbiAgICAgICAgICAgICAgICBXQVNEOiBNb3ZlIHwgU3BhY2U6IEp1bXAgfCBNb3VzZTogTG9vayB8IExlZnQgQ2xpY2s6IFNob290XHJcbiAgICAgICAgICAgIDwvcD5cclxuICAgICAgICBgKTtcclxuICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ3RpdGxlU2NyZWVuJ10uc3R5bGUuY3NzVGV4dCArPSAnd2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgYmFja2dyb3VuZC1jb2xvcjogcmdiYSgwLDAsMCwwLjcpOyBkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYWxpZ24taXRlbXM6IGNlbnRlcjsnO1xyXG5cclxuICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ2hlYWx0aEJhciddID0gY3JlYXRlRGl2KCdoZWFsdGhCYXInLCAnJywgYEhlYWx0aDogJHt0aGlzLmNvbmZpZy5wbGF5ZXIubWF4SGVhbHRofWApO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snaGVhbHRoQmFyJ10uc3R5bGUudG9wID0gJzEwcHgnO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snaGVhbHRoQmFyJ10uc3R5bGUubGVmdCA9ICcxMHB4JztcclxuXHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydzY29yZURpc3BsYXknXSA9IGNyZWF0ZURpdignc2NvcmVEaXNwbGF5JywgJycsICdTY29yZTogMCcpO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snc2NvcmVEaXNwbGF5J10uc3R5bGUudG9wID0gJzQwcHgnO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snc2NvcmVEaXNwbGF5J10uc3R5bGUubGVmdCA9ICcxMHB4JztcclxuXHJcbiAgICAgICAgdGhpcy51aUVsZW1lbnRzWydnYW1lT3ZlclNjcmVlbiddID0gY3JlYXRlRGl2KCdnYW1lT3ZlclNjcmVlbicsICcnLCBgXHJcbiAgICAgICAgICAgIDxoMSBzdHlsZT1cInRleHQtYWxpZ246IGNlbnRlcjsgZm9udC1zaXplOiA0ZW07IG1hcmdpbi10b3A6IDE1JTtcIj4ke3RoaXMuY29uZmlnLmdhbWUuZ2FtZU92ZXJUZXh0fTwvaDE+XHJcbiAgICAgICAgICAgIDxwIHN0eWxlPVwidGV4dC1hbGlnbjogY2VudGVyOyBmb250LXNpemU6IDJlbTtcIj5DbGljayB0byBSZXN0YXJ0PC9wPlxyXG4gICAgICAgIGApO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snZ2FtZU92ZXJTY3JlZW4nXS5zdHlsZS5jc3NUZXh0ICs9ICd3aWR0aDogMTAwJTsgaGVpZ2h0OiAxMDAlOyBiYWNrZ3JvdW5kLWNvbG9yOiByZ2JhKDAsMCwwLDAuNyk7IGRpc3BsYXk6IG5vbmU7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyOyc7XHJcblxyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snd2luU2NyZWVuJ10gPSBjcmVhdGVEaXYoJ3dpblNjcmVlbicsICcnLCBgXHJcbiAgICAgICAgICAgIDxoMSBzdHlsZT1cInRleHQtYWxpZ246IGNlbnRlcjsgZm9udC1zaXplOiA0ZW07IG1hcmdpbi10b3A6IDE1JTtcIj4ke3RoaXMuY29uZmlnLmdhbWUud2luVGV4dH08L2gxPlxyXG4gICAgICAgICAgICA8cCBzdHlsZT1cInRleHQtYWxpZ246IGNlbnRlcjsgZm9udC1zaXplOiAyZW07XCI+Q2xpY2sgdG8gUmVzdGFydDwvcD5cclxuICAgICAgICBgKTtcclxuICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ3dpblNjcmVlbiddLnN0eWxlLmNzc1RleHQgKz0gJ3dpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IGJhY2tncm91bmQtY29sb3I6IHJnYmEoMCwwLDAsMC43KTsgZGlzcGxheTogbm9uZTsgZmxleC1kaXJlY3Rpb246IGNvbHVtbjsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7JztcclxuXHJcblxyXG4gICAgICAgIC8vIENyb3NzaGFpclxyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snY3Jvc3NoYWlyJ10gPSBjcmVhdGVEaXYoJ2Nyb3NzaGFpcicsICcnLCAnKycpO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snY3Jvc3NoYWlyJ10uc3R5bGUuY3NzVGV4dCArPSBgXHJcbiAgICAgICAgICAgIGZvbnQtc2l6ZTogM2VtO1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XHJcbiAgICAgICAgICAgIHRvcDogNTAlO1xyXG4gICAgICAgICAgICBsZWZ0OiA1MCU7XHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsIC01MCUpO1xyXG4gICAgICAgICAgICBkaXNwbGF5OiBub25lO1xyXG4gICAgICAgIGA7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVVSSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnIHx8ICF0aGlzLnBsYXllcikgcmV0dXJuO1xyXG5cclxuICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ2hlYWx0aEJhciddLmlubmVyVGV4dCA9IGBIZWFsdGg6ICR7TWF0aC5tYXgoMCwgdGhpcy5wbGF5ZXIuY3VycmVudEhlYWx0aCB8fCAwKX1gO1xyXG4gICAgICAgIHRoaXMudWlFbGVtZW50c1snc2NvcmVEaXNwbGF5J10uaW5uZXJUZXh0ID0gYFNjb3JlOiAke3RoaXMucGxheWVyLnNjb3JlIHx8IDB9YDtcclxuXHJcbiAgICAgICAgLy8gQ29udHJvbCB2aXNpYmlsaXR5IG9mIFVJIGVsZW1lbnRzIGJhc2VkIG9uIGdhbWUgc3RhdGVcclxuICAgICAgICBjb25zdCBoaWRlQWxsID0gKGV4Y2VwdD86IHN0cmluZ1tdKSA9PiB7XHJcbiAgICAgICAgICAgIFsndGl0bGVTY3JlZW4nLCAnZ2FtZU92ZXJTY3JlZW4nLCAnd2luU2NyZWVuJywgJ2hlYWx0aEJhcicsICdzY29yZURpc3BsYXknLCAnY3Jvc3NoYWlyJ10uZm9yRWFjaChpZCA9PiB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWV4Y2VwdCB8fCAhZXhjZXB0LmluY2x1ZGVzKGlkKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudWlFbGVtZW50c1tpZF0uc3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLmdhbWVTdGF0ZSkge1xyXG4gICAgICAgICAgICBjYXNlIEdhbWVTdGF0ZS5USVRMRTpcclxuICAgICAgICAgICAgICAgIGhpZGVBbGwoWyd0aXRsZVNjcmVlbiddKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudWlFbGVtZW50c1sndGl0bGVTY3JlZW4nXS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgR2FtZVN0YXRlLlBMQVlJTkc6XHJcbiAgICAgICAgICAgICAgICBoaWRlQWxsKFsnaGVhbHRoQmFyJywgJ3Njb3JlRGlzcGxheScsICdjcm9zc2hhaXInXSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVpRWxlbWVudHNbJ2hlYWx0aEJhciddLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51aUVsZW1lbnRzWydzY29yZURpc3BsYXknXS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcclxuICAgICAgICAgICAgICAgIHRoaXMudWlFbGVtZW50c1snY3Jvc3NoYWlyJ10uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuR0FNRV9PVkVSOlxyXG4gICAgICAgICAgICAgICAgaGlkZUFsbChbJ2dhbWVPdmVyU2NyZWVuJ10pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy51aUVsZW1lbnRzWydnYW1lT3ZlclNjcmVlbiddLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBHYW1lU3RhdGUuV0lOOlxyXG4gICAgICAgICAgICAgICAgaGlkZUFsbChbJ3dpblNjcmVlbiddKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudWlFbGVtZW50c1snd2luU2NyZWVuJ10uc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIFJlc2V0IGdhbWUgc3RhdGVcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIHRoaXMucGxheWVyLmN1cnJlbnRIZWFsdGggPSB0aGlzLmNvbmZpZy5wbGF5ZXIubWF4SGVhbHRoO1xyXG4gICAgICAgIHRoaXMucGxheWVyLnNjb3JlID0gMDtcclxuICAgICAgICB0aGlzLnBsYXllci5sYXN0U2hvdFRpbWUgPSAwO1xyXG4gICAgICAgIHRoaXMucGxheWVyLmlzRGVhZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBDbGVhciBleGlzdGluZyBlbmVtaWVzIGFuZCBidWxsZXRzXHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLmZvckVhY2goZW5lbXkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoZW5lbXkuYm9keSk7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKGVuZW15Lm1lc2gpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuZW5lbWllcyA9IFtdO1xyXG5cclxuICAgICAgICB0aGlzLmJ1bGxldHMuZm9yRWFjaChidWxsZXQgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYnVsbGV0LmJvZHkpO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShidWxsZXQubWVzaCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5idWxsZXRzID0gW107XHJcblxyXG4gICAgICAgIC8vIFJlc2V0IHBsYXllciBwb3NpdGlvbiBhbmQgdmVsb2NpdHlcclxuICAgICAgICBjb25zdCBwbGF5ZXJDb25maWcgPSB0aGlzLmNvbmZpZy5wbGF5ZXI7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuYm9keS5wb3NpdGlvbi5zZXQoMCwgcGxheWVyQ29uZmlnLmluaXRpYWxTcGF3blksIDApO1xyXG4gICAgICAgIHRoaXMucGxheWVyLmJvZHkudmVsb2NpdHkuc2V0KDAsIDAsIDApO1xyXG4gICAgICAgIHRoaXMucGxheWVyLmJvZHkuYW5ndWxhclZlbG9jaXR5LnNldCgwLCAwLCAwKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi5zZXQoMCwgcGxheWVyQ29uZmlnLmluaXRpYWxTcGF3blkgKyBwbGF5ZXJDb25maWcuY2FtZXJhSGVpZ2h0T2Zmc2V0LCAwKTtcclxuXHJcbiAgICAgICAgLy8gTG9jayBwb2ludGVyXHJcbiAgICAgICAgdGhpcy5jb250cm9scy5sb2NrKCk7XHJcblxyXG4gICAgICAgIC8vIFN0YXJ0IGJhY2tncm91bmQgbXVzaWNcclxuICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5zdG9wQmFja2dyb3VuZE11c2ljKCk7IC8vIFN0b3AgYW55IHByZXZpb3VzIG11c2ljXHJcbiAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheVNvdW5kKCdiYWNrZ3JvdW5kTXVzaWMnLCB0cnVlLCAwLjUpOyAvLyBMb29wIEJHTSB3aXRoIGxvd2VyIHZvbHVtZVxyXG5cclxuICAgICAgICB0aGlzLmxhc3RFbmVteVNwYXduVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIHRoaXMudXBkYXRlVUkoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0VGl0bGVTY3JlZW4oKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5nYW1lU3RhdGUgPSBHYW1lU3RhdGUuVElUTEU7XHJcbiAgICAgICAgdGhpcy5jb250cm9scy51bmxvY2soKTtcclxuICAgICAgICB0aGlzLmF1ZGlvTWFuYWdlci5zdG9wQmFja2dyb3VuZE11c2ljKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVVSSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2FtZU92ZXIod2luOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmdhbWVTdGF0ZSA9IHdpbiA/IEdhbWVTdGF0ZS5XSU4gOiBHYW1lU3RhdGUuR0FNRV9PVkVSO1xyXG4gICAgICAgIHRoaXMuY29udHJvbHMudW5sb2NrKCk7XHJcbiAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIuc3RvcEJhY2tncm91bmRNdXNpYygpO1xyXG4gICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnBsYXlTb3VuZCgnZ2FtZU92ZXJTb3VuZCcpOyAvLyBQbGF5IGdhbWUgb3ZlciBzb3VuZFxyXG4gICAgICAgIHRoaXMudXBkYXRlVUkoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uUG9pbnRlckxvY2tDaGFuZ2UoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5yZW5kZXJlci5kb21FbGVtZW50KSB7XHJcbiAgICAgICAgICAgIC8vIFBvaW50ZXIgbG9ja2VkLiBJZiBpdCB3YXMgYWxyZWFkeSBwbGF5aW5nLCBjb250aW51ZS4gSWYgZnJvbSB0aXRsZS9nYW1lb3Zlciwgc3RhcnRHYW1lIHdpbGwgaGFuZGxlLlxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIFBvaW50ZXIgdW5sb2NrZWQuIElmIGdhbWUgd2FzIHBsYXlpbmcsIHVzZXIgcHJvYmFibHkgcHJlc3NlZCBFU0MuXHJcbiAgICAgICAgICAgIC8vIEZvciB0aGlzIHNpbXBsZSBnYW1lLCB3ZSBkb24ndCBpbXBsZW1lbnQgcGF1c2UsIGp1c3QgYWxsb3cgcmVzdGFydC5cclxuICAgICAgICAgICAgLy8gSWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgcG9pbnRlciBpcyB1bmxvY2tlZCwgaXQgaW1wbGllcyB1c2VyIGludGVudGlvbmFsbHkgbGVmdCB0aGUgZ2FtZS5cclxuICAgICAgICAgICAgaWYgKHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICAgICAgLy8gTm90IGEgZm9ybWFsIHBhdXNlLCBqdXN0IGFsbG93cyB1c2VyIHRvIGNsaWNrIFVJIGVsZW1lbnRzXHJcbiAgICAgICAgICAgICAgICAvLyBDYW4gYmUgaW1wcm92ZWQgdG8gYSBwcm9wZXIgcGF1c2Ugc3RhdGUgaWYgbmVlZGVkLlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5pbnB1dFN0YXRlc1tldmVudC5jb2RlXSA9IHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5pbnB1dFN0YXRlc1tldmVudC5jb2RlXSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgb25Nb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcclxuICAgICAgICBpZiAoZXZlbnQuYnV0dG9uID09PSAwICYmIHRoaXMuZ2FtZVN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiBkb2N1bWVudC5wb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudCkge1xyXG4gICAgICAgICAgICB0aGlzLnNob290QnVsbGV0KCdwbGF5ZXInKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbldpbmRvd1Jlc2l6ZSgpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB3aW5kb3cuaW5uZXJXaWR0aCAvIHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHdpbmRvdy5pbm5lcldpZHRoLCB3aW5kb3cuaW5uZXJIZWlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYW5pbWF0ZSgpOiB2b2lkIHtcclxuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5hbmltYXRlLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9IChjdXJyZW50VGltZSAtIHRoaXMucHJldlRpbWUpIC8gMTAwMDsgLy8gRGVsdGEgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5wcmV2VGltZSA9IGN1cnJlbnRUaW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5nYW1lU3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlKGRlbHRhVGltZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucmVuZGVyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIDEuIFBsYXllciBob3Jpem9udGFsIG1vdmVtZW50IGRpcmVjdGx5IG1vdmVzIHRoZSBjYW1lcmFcclxuICAgICAgICB0aGlzLnVwZGF0ZVBsYXllck1vdmVtZW50KGRlbHRhVGltZSk7XHJcblxyXG4gICAgICAgIC8vIDIuIFN5bmMgcGxheWVyIHBoeXNpY3MgYm9keSdzIFhaIHRvIGNhbWVyYSdzIFhaXHJcbiAgICAgICAgdGhpcy5wbGF5ZXIuYm9keS5wb3NpdGlvbi54ID0gdGhpcy5jYW1lcmEucG9zaXRpb24ueDtcclxuICAgICAgICB0aGlzLnBsYXllci5ib2R5LnBvc2l0aW9uLnogPSB0aGlzLmNhbWVyYS5wb3NpdGlvbi56O1xyXG5cclxuICAgICAgICAvLyAzLiBVcGRhdGUgZW5lbWllcyBBSSBhbmQgYWN0aW9uc1xyXG4gICAgICAgIHRoaXMudXBkYXRlRW5lbWllcyhkZWx0YVRpbWUpO1xyXG5cclxuICAgICAgICAvLyA0LiBVcGRhdGUgYnVsbGV0cyBsaWZldGltZSBhbmQgY2xlYW51cFxyXG4gICAgICAgIHRoaXMudXBkYXRlQnVsbGV0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBTdGVwIHBoeXNpY3Mgd29ybGRcclxuICAgICAgICB0aGlzLndvcmxkLnN0ZXAoMSAvIDYwLCBkZWx0YVRpbWUsIDMpOyAvLyBGaXhlZCB0aW1lIHN0ZXAgMS82MHMsIG1heCAzIGl0ZXJhdGlvbnNcclxuXHJcbiAgICAgICAgLy8gNi4gVXBkYXRlIGNhbWVyYSBZIHBvc2l0aW9uIGZyb20gcGxheWVyIGJvZHkgWSAoYWZ0ZXIgcGh5c2ljcyBoYXMgYXBwbGllZCBncmF2aXR5L2p1bXBzKVxyXG4gICAgICAgIC8vIGNhbWVyYS5wb3NpdGlvbi55ID0gcGxheWVyLmJvZHkucG9zaXRpb24ueSAoY2VudGVyIG9mIGJvZHkpICsgY2FtZXJhSGVpZ2h0T2Zmc2V0XHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSA9IHRoaXMucGxheWVyLmJvZHkucG9zaXRpb24ueSArIHRoaXMuY29uZmlnLnBsYXllci5jYW1lcmFIZWlnaHRPZmZzZXQ7XHJcblxyXG4gICAgICAgIC8vIDcuIFN5bmMgVGhyZWUuanMgbWVzaGVzIHdpdGggQ2Fubm9uLmpzIGJvZGllcyBmb3IgZW5lbWllcyBhbmQgYnVsbGV0c1xyXG4gICAgICAgIHRoaXMuZW5lbWllcy5mb3JFYWNoKGVuZW15ID0+IHtcclxuICAgICAgICAgICAgaWYgKGVuZW15LmlzRGVhZCkgcmV0dXJuO1xyXG4gICAgICAgICAgICBlbmVteS5tZXNoLnBvc2l0aW9uLnNldChlbmVteS5ib2R5LnBvc2l0aW9uLngsIGVuZW15LmJvZHkucG9zaXRpb24ueSwgZW5lbXkuYm9keS5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgZW5lbXkubWVzaC5xdWF0ZXJuaW9uLnNldChlbmVteS5ib2R5LnF1YXRlcm5pb24ueCwgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLnksIGVuZW15LmJvZHkucXVhdGVybmlvbi56LCBlbmVteS5ib2R5LnF1YXRlcm5pb24udyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMuYnVsbGV0cy5mb3JFYWNoKGJ1bGxldCA9PiB7XHJcbiAgICAgICAgICAgIGJ1bGxldC5tZXNoLnBvc2l0aW9uLnNldChidWxsZXQuYm9keS5wb3NpdGlvbi54LCBidWxsZXQuYm9keS5wb3NpdGlvbi55LCBidWxsZXQuYm9keS5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgYnVsbGV0Lm1lc2gucXVhdGVybmlvbi5zZXQoYnVsbGV0LmJvZHkucXVhdGVybmlvbi54LCBidWxsZXQuYm9keS5xdWF0ZXJuaW9uLnksIGJ1bGxldC5ib2R5LnF1YXRlcm5pb24ueiwgYnVsbGV0LmJvZHkucXVhdGVybmlvbi53KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gOC4gQ2hlY2sgZ2FtZSBvdmVyIC8gd2luIGNvbmRpdGlvbnNcclxuICAgICAgICBpZiAodGhpcy5wbGF5ZXIuY3VycmVudEhlYWx0aCAmJiB0aGlzLnBsYXllci5jdXJyZW50SGVhbHRoIDw9IDAgJiYgIXRoaXMucGxheWVyLmlzRGVhZCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllci5pc0RlYWQgPSB0cnVlOyAvLyBNYXJrIHBsYXllciBhcyBkZWFkIHRvIHByZXZlbnQgbXVsdGlwbGUgZ2FtZSBvdmVyIHRyaWdnZXJzXHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIoZmFsc2UpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wbGF5ZXIuc2NvcmUgJiYgdGhpcy5wbGF5ZXIuc2NvcmUgPj0gdGhpcy5jb25maWcuZ2FtZS5zY29yZVRvV2luKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZ2FtZU92ZXIodHJ1ZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnVwZGF0ZVVJKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJNb3ZlbWVudChkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcgfHwgIXRoaXMucGxheWVyIHx8IHRoaXMucGxheWVyLmlzRGVhZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJDb25maWcgPSB0aGlzLmNvbmZpZy5wbGF5ZXI7XHJcbiAgICAgICAgY29uc3Qgc3BlZWQgPSBwbGF5ZXJDb25maWcuc3BlZWQ7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGhvcml6b250YWwgbW92ZW1lbnQgdmlhIGNvbnRyb2xzIChtb2RpZmllcyB0aGlzLmNhbWVyYS5wb3NpdGlvbiBkaXJlY3RseSlcclxuICAgICAgICBsZXQgbW92ZUZvcndhcmQgPSAwO1xyXG4gICAgICAgIGxldCBtb3ZlUmlnaHQgPSAwO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5pbnB1dFN0YXRlc1snS2V5VyddKSBtb3ZlRm9yd2FyZCArPSAxO1xyXG4gICAgICAgIGlmICh0aGlzLmlucHV0U3RhdGVzWydLZXlTJ10pIG1vdmVGb3J3YXJkIC09IDE7XHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRTdGF0ZXNbJ0tleUEnXSkgbW92ZVJpZ2h0IC09IDE7XHJcbiAgICAgICAgaWYgKHRoaXMuaW5wdXRTdGF0ZXNbJ0tleUQnXSkgbW92ZVJpZ2h0ICs9IDE7XHJcblxyXG4gICAgICAgIC8vIE1vdmUgY29udHJvbHMgKGNhbWVyYSlcclxuICAgICAgICBpZiAobW92ZUZvcndhcmQgIT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy5jb250cm9scy5tb3ZlRm9yd2FyZChtb3ZlRm9yd2FyZCAqIHNwZWVkICogZGVsdGFUaW1lKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKG1vdmVSaWdodCAhPT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRyb2xzLm1vdmVSaWdodChtb3ZlUmlnaHQgKiBzcGVlZCAqIGRlbHRhVGltZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBIYW5kbGUgdmVydGljYWwgbW92ZW1lbnQgKGp1bXApIHdpdGggcGh5c2ljc1xyXG4gICAgICAgIGlmICh0aGlzLmlucHV0U3RhdGVzWydTcGFjZSddICYmIHRoaXMucGxheWVyLmNhbkp1bXApIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXIuYm9keS52ZWxvY2l0eS55ID0gcGxheWVyQ29uZmlnLmp1bXBGb3JjZTtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXIuY2FuSnVtcCA9IGZhbHNlOyAvLyBQcmV2ZW50IG11bHRpcGxlIGp1bXBzIHVudGlsIGxhbmRpbmdcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG5cclxuICAgIHByaXZhdGUgdXBkYXRlRW5lbWllcyhkZWx0YVRpbWU6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gU3Bhd24gZW5lbWllc1xyXG4gICAgICAgIGlmICh0aGlzLmVuZW1pZXMubGVuZ3RoIDwgdGhpcy5jb25maWcuZ2FtZS5tYXhFbmVtaWVzICYmIChwZXJmb3JtYW5jZS5ub3coKSAtIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID4gdGhpcy5jb25maWcuZ2FtZS5lbmVteVNwYXduSW50ZXJ2YWwpKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25FbmVteSgpO1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RFbmVteVNwYXduVGltZSA9IHBlcmZvcm1hbmNlLm5vdygpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIGVhY2ggZW5lbXlcclxuICAgICAgICB0aGlzLmVuZW1pZXMuZm9yRWFjaChlbmVteSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChlbmVteS5pc0RlYWQgfHwgIXRoaXMucGxheWVyIHx8IHRoaXMucGxheWVyLmlzRGVhZCkgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgLy8gU2ltcGxlIEFJOiBNb3ZlIHRvd2FyZHMgcGxheWVyXHJcbiAgICAgICAgICAgIGNvbnN0IHBsYXllclBvcyA9IHRoaXMucGxheWVyLmJvZHkucG9zaXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15UG9zID0gZW5lbXkuYm9keS5wb3NpdGlvbjtcclxuICAgICAgICAgICAgY29uc3QgZGlyZWN0aW9uID0gbmV3IENBTk5PTi5WZWMzKCk7XHJcbiAgICAgICAgICAgIHBsYXllclBvcy52c3ViKGVuZW15UG9zLCBkaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBkaXJlY3Rpb24ueSA9IDA7IC8vIE9ubHkgaG9yaXpvbnRhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICBkaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgdmVsb2NpdHksIG5vdCBhcHBseWluZyBmb3JjZSwgdG8ga2VlcCBtb3ZlbWVudCBzbW9vdGhcclxuICAgICAgICAgICAgZW5lbXkuYm9keS52ZWxvY2l0eS54ID0gZGlyZWN0aW9uLnggKiB0aGlzLmNvbmZpZy5lbmVteS5zcGVlZDtcclxuICAgICAgICAgICAgZW5lbXkuYm9keS52ZWxvY2l0eS56ID0gZGlyZWN0aW9uLnogKiB0aGlzLmNvbmZpZy5lbmVteS5zcGVlZDtcclxuICAgICAgICAgICAgLy8gS2VlcCBjdXJyZW50IFkgdmVsb2NpdHkgZm9yIGdyYXZpdHlcclxuICAgICAgICAgICAgZW5lbXkuYm9keS52ZWxvY2l0eS55ID0gZW5lbXkuYm9keS52ZWxvY2l0eS55O1xyXG5cclxuICAgICAgICAgICAgLy8gUm90YXRlIGVuZW15IG1lc2ggdG8gbG9vayBhdCBwbGF5ZXIgKG9ubHkgeWF3KVxyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRZUm90YXRpb24gPSBNYXRoLmF0YW4yKGRpcmVjdGlvbi54LCBkaXJlY3Rpb24ueik7IC8vIFlhdyByb3RhdGlvbiBmb3IgWi1heGlzIGZvcndhcmRcclxuICAgICAgICAgICAgZW5lbXkubWVzaC5yb3RhdGlvbi55ID0gdGFyZ2V0WVJvdGF0aW9uO1xyXG4gICAgICAgICAgICBlbmVteS5tZXNoLnJvdGF0aW9uLnggPSAwOyAvLyBQcmV2ZW50IHRpbHRpbmdcclxuICAgICAgICAgICAgZW5lbXkubWVzaC5yb3RhdGlvbi56ID0gMDsgLy8gUHJldmVudCB0aWx0aW5nXHJcblxyXG4gICAgICAgICAgICAvLyBFbmVteSBzaG9vdGluZ1xyXG4gICAgICAgICAgICBpZiAocGVyZm9ybWFuY2Uubm93KCkgLSAoZW5lbXkubGFzdFNob3RUaW1lIHx8IDApID4gdGhpcy5jb25maWcuZW5lbXkuZmlyZVJhdGUpIHtcclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHBsYXllciBpcyBzb21ld2hhdCBpbiByYW5nZVxyXG4gICAgICAgICAgICAgICAgY29uc3QgZGlzdGFuY2VUb1BsYXllciA9IGVuZW15UG9zLmRpc3RhbmNlVG8ocGxheWVyUG9zKTtcclxuICAgICAgICAgICAgICAgIGlmIChkaXN0YW5jZVRvUGxheWVyIDwgdGhpcy5jb25maWcuZW5lbXkuc3Bhd25SYWRpdXMgKiAxLjUpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNob290QnVsbGV0KCdlbmVteScsIGVuZW15LmJvZHkucG9zaXRpb24sIGRpcmVjdGlvbik7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkubGFzdFNob3RUaW1lID0gcGVyZm9ybWFuY2Uubm93KCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZUJ1bGxldHMoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5idWxsZXRzID0gdGhpcy5idWxsZXRzLmZpbHRlcihidWxsZXQgPT4ge1xyXG4gICAgICAgICAgICBpZiAoIXRoaXMuY29uZmlnKSByZXR1cm4gZmFsc2U7XHJcblxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgb2xkIGJ1bGxldHNcclxuICAgICAgICAgICAgaWYgKHBlcmZvcm1hbmNlLm5vdygpIC0gKGJ1bGxldC5jcmVhdGlvblRpbWUgfHwgMCkgPiB0aGlzLmNvbmZpZy5idWxsZXQubGlmZXRpbWUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShidWxsZXQuYm9keSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShidWxsZXQubWVzaCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7IC8vIEtlZXAgYnVsbGV0IGlmIG5vdCBleHBpcmVkXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzcGF3bkVuZW15KCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgZW5lbXlDb25maWcgPSB0aGlzLmNvbmZpZy5lbmVteTtcclxuICAgICAgICBjb25zdCBncm91bmRTaXplID0gdGhpcy5jb25maWcuZW52aXJvbm1lbnQuZ3JvdW5kU2l6ZTtcclxuICAgICAgICBjb25zdCBzcGF3blJhZGl1cyA9IGVuZW15Q29uZmlnLnNwYXduUmFkaXVzO1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZW5lbXlUZXh0dXJlJyk7XHJcbiAgICAgICAgaWYgKCF0ZXh0dXJlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIkVuZW15IHRleHR1cmUgbm90IGxvYWRlZCwgY2Fubm90IHNwYXduIGVuZW15LlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoZW5lbXlDb25maWcuYm9keVdpZHRoLCBlbmVteUNvbmZpZy5ib2R5SGVpZ2h0LCBlbmVteUNvbmZpZy5ib2R5RGVwdGgpO1xyXG4gICAgICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsKHsgbWFwOiB0ZXh0dXJlIH0pO1xyXG4gICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQobWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFJhbmRvbSBwb3NpdGlvbiwgZW5zdXJlIGl0J3Mgb24gdGhlIGdyb3VuZCBhbmQgbm90IHRvbyBjbG9zZSB0byBwbGF5ZXJcclxuICAgICAgICBsZXQgeCwgejtcclxuICAgICAgICBkbyB7XHJcbiAgICAgICAgICAgIHggPSAoTWF0aC5yYW5kb20oKSAqIGdyb3VuZFNpemUgLSBncm91bmRTaXplIC8gMik7XHJcbiAgICAgICAgICAgIHogPSAoTWF0aC5yYW5kb20oKSAqIGdyb3VuZFNpemUgLSBncm91bmRTaXplIC8gMik7XHJcbiAgICAgICAgfSB3aGlsZSAodGhpcy5wbGF5ZXIuYm9keS5wb3NpdGlvbi5kaXN0YW5jZVRvKG5ldyBDQU5OT04uVmVjMyh4LCAwLCB6KSkgPCBzcGF3blJhZGl1cyk7IC8vIEVuc3VyZSBub3QgdG9vIGNsb3NlIHRvIHBsYXllciBpbml0aWFsbHlcclxuXHJcbiAgICAgICAgY29uc3QgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDUwLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHgsIGVuZW15Q29uZmlnLmJvZHlIZWlnaHQgLyAyLCB6KSwgLy8gUG9zaXRpb24gaXMgY2VudGVyIG9mIGJveFxyXG4gICAgICAgICAgICBzaGFwZTogbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKGVuZW15Q29uZmlnLmJvZHlXaWR0aCAvIDIsIGVuZW15Q29uZmlnLmJvZHlIZWlnaHQgLyAyLCBlbmVteUNvbmZpZy5ib2R5RGVwdGggLyAyKSksXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUgLy8gUHJldmVudCBlbmVtaWVzIGZyb20gdG9wcGxpbmdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYm9keSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGVuZW15OiBHYW1lT2JqZWN0ID0ge1xyXG4gICAgICAgICAgICBtZXNoLCBib2R5LCBjdXJyZW50SGVhbHRoOiBlbmVteUNvbmZpZy5tYXhIZWFsdGgsIGxhc3RTaG90VGltZTogMFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzLnB1c2goZW5lbXkpO1xyXG5cclxuICAgICAgICAvLyBTZXR1cCBjb2xsaXNpb24gbGlzdGVuZXIgZm9yIGVuZW15XHJcbiAgICAgICAgYm9keS5hZGRFdmVudExpc3RlbmVyKCdjb2xsaWRlJywgKGV2ZW50OiBhbnkpID0+IHRoaXMuaGFuZGxlRW5lbXlDb2xsaXNpb24oZW5lbXksIGV2ZW50KSk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzaG9vdEJ1bGxldChvd25lcjogJ3BsYXllcicgfCAnZW5lbXknLCBwb3NpdGlvbj86IENBTk5PTi5WZWMzLCBkaXJlY3Rpb24/OiBDQU5OT04uVmVjMyk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcpIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIGZpcmUgcmF0ZSBjaGVja1xyXG4gICAgICAgIGlmIChvd25lciA9PT0gJ3BsYXllcicgJiYgcGVyZm9ybWFuY2Uubm93KCkgLSB0aGlzLmxhc3RQbGF5ZXJTaG9vdFRpbWUgPCB0aGlzLmNvbmZpZy5wbGF5ZXIuZmlyZVJhdGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBFbmVteSBzcGVjaWZpYyBwYXJhbWV0ZXJzIGNoZWNrXHJcbiAgICAgICAgaWYgKG93bmVyID09PSAnZW5lbXknICYmICghcG9zaXRpb24gfHwgIWRpcmVjdGlvbikpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVuZW15IGJ1bGxldCBuZWVkcyBleHBsaWNpdCBwb3NpdGlvbiBhbmQgZGlyZWN0aW9uLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheVNvdW5kKCdzaG9vdFNvdW5kJywgZmFsc2UsIDAuMik7IC8vIFBsYXkgc2hvb3Qgc291bmRcclxuXHJcbiAgICAgICAgY29uc3QgYnVsbGV0Q29uZmlnID0gdGhpcy5jb25maWcuYnVsbGV0O1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFNwZWVkID0gb3duZXIgPT09ICdwbGF5ZXInID8gYnVsbGV0Q29uZmlnLnBsYXllckJ1bGxldFNwZWVkIDogYnVsbGV0Q29uZmlnLmVuZW15QnVsbGV0U3BlZWQ7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0VGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdidWxsZXRUZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoKTtcclxuICAgICAgICBpZiAoYnVsbGV0VGV4dHVyZSkge1xyXG4gICAgICAgICAgICBidWxsZXRNYXRlcmlhbC5tYXAgPSBidWxsZXRUZXh0dXJlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGJ1bGxldE1hdGVyaWFsLmNvbG9yID0gbmV3IFRIUkVFLkNvbG9yKDB4ZmZmZjAwKTsgLy8gRmFsbGJhY2sgY29sb3IgaWYgdGV4dHVyZSBub3QgbG9hZGVkXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGJ1bGxldE1lc2ggPSBuZXcgVEhSRUUuTWVzaChuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoYnVsbGV0Q29uZmlnLnNpemUgLyAyLCA4LCA4KSwgYnVsbGV0TWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGJ1bGxldE1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCBidWxsZXRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogMC4xLCAvLyBTbWFsbCBtYXNzIHRvIGludGVyYWN0IHdpdGggb3RoZXIgb2JqZWN0cyBzbGlnaHRseVxyXG4gICAgICAgICAgICBzaGFwZTogbmV3IENBTk5PTi5TcGhlcmUoYnVsbGV0Q29uZmlnLnNpemUgLyAyKSxcclxuICAgICAgICAgICAgYWxsb3dTbGVlcDogZmFsc2UsXHJcbiAgICAgICAgICAgIGxpbmVhckRhbXBpbmc6IDAgLy8gS2VlcCBzcGVlZCBjb25zdGFudCwgbm8gYWlyIHJlc2lzdGFuY2VcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYnVsbGV0Qm9keSk7XHJcblxyXG4gICAgICAgIGxldCBidWxsZXRQb3NpdGlvbiA9IG5ldyBDQU5OT04uVmVjMygpO1xyXG4gICAgICAgIGxldCBidWxsZXREaXJlY3Rpb24gPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuXHJcbiAgICAgICAgaWYgKG93bmVyID09PSAncGxheWVyJykge1xyXG4gICAgICAgICAgICBjb25zdCBwbGF5ZXJDb25maWcgPSB0aGlzLmNvbmZpZy5wbGF5ZXI7XHJcbiAgICAgICAgICAgIC8vIEdldCBjYW1lcmEgcG9zaXRpb24gYW5kIGRpcmVjdGlvbiBmb3IgcGxheWVyIGJ1bGxldFxyXG4gICAgICAgICAgICBjb25zdCBjYW1lcmFQb3NpdGlvbiA9IHRoaXMuY2FtZXJhLnBvc2l0aW9uOyAvLyBUaGlzIGlzIGEgVEhSRUUuVmVjdG9yM1xyXG4gICAgICAgICAgICBidWxsZXRQb3NpdGlvbi5zZXQoY2FtZXJhUG9zaXRpb24ueCwgY2FtZXJhUG9zaXRpb24ueSwgY2FtZXJhUG9zaXRpb24ueik7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0ZW1wVGhyZWVWZWN0b3IgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZERpcmVjdGlvbih0ZW1wVGhyZWVWZWN0b3IpOyAvLyBQb3B1bGF0ZXMgdGVtcFRocmVlVmVjdG9yIHdpdGggY2FtZXJhIGRpcmVjdGlvblxyXG4gICAgICAgICAgICBidWxsZXREaXJlY3Rpb24uc2V0KHRlbXBUaHJlZVZlY3Rvci54LCB0ZW1wVGhyZWVWZWN0b3IueSwgdGVtcFRocmVlVmVjdG9yLnopO1xyXG4gICAgICAgICAgICBidWxsZXREaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBPZmZzZXQgYnVsbGV0IHNsaWdodGx5IGZvcndhcmQgZnJvbSBwbGF5ZXIncyB2aWV3IHRvIGF2b2lkIGltbWVkaWF0ZSBzZWxmLWNvbGxpc2lvblxyXG4gICAgICAgICAgICBidWxsZXRQb3NpdGlvbi52YWRkKGJ1bGxldERpcmVjdGlvbi5zY2FsZShwbGF5ZXJDb25maWcuYm9keVdpZHRoIC8gMiArIGJ1bGxldENvbmZpZy5zaXplKSwgYnVsbGV0UG9zaXRpb24pO1xyXG4gICAgICAgIH0gZWxzZSB7IC8vIEVuZW15IGJ1bGxldFxyXG4gICAgICAgICAgICBpZiAocG9zaXRpb24gJiYgZGlyZWN0aW9uKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXRQb3NpdGlvbi5jb3B5KHBvc2l0aW9uKTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldERpcmVjdGlvbi5jb3B5KGRpcmVjdGlvbik7XHJcbiAgICAgICAgICAgICAgICAvLyBPZmZzZXQgYnVsbGV0IHNsaWdodGx5IGZvcndhcmQgZnJvbSBlbmVteSdzIGJvZHlcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvc2l0aW9uLnZhZGQoYnVsbGV0RGlyZWN0aW9uLnNjYWxlKHRoaXMuY29uZmlnLmVuZW15LmJvZHlXaWR0aCAvIDIgKyBidWxsZXRDb25maWcuc2l6ZSksIGJ1bGxldFBvc2l0aW9uKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYnVsbGV0Qm9keS5wb3NpdGlvbi5jb3B5KGJ1bGxldFBvc2l0aW9uKTtcclxuICAgICAgICBidWxsZXRCb2R5LnZlbG9jaXR5LmNvcHkoYnVsbGV0RGlyZWN0aW9uLnNjYWxlKGJ1bGxldFNwZWVkKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1bGxldDogR2FtZU9iamVjdCA9IHtcclxuICAgICAgICAgICAgbWVzaDogYnVsbGV0TWVzaCxcclxuICAgICAgICAgICAgYm9keTogYnVsbGV0Qm9keSxcclxuICAgICAgICAgICAgb3duZXI6IG93bmVyLFxyXG4gICAgICAgICAgICBjcmVhdGlvblRpbWU6IHBlcmZvcm1hbmNlLm5vdygpXHJcbiAgICAgICAgfTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMucHVzaChidWxsZXQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgY29sbGlzaW9uIGxpc3RlbmVyIGZvciB0aGUgYnVsbGV0XHJcbiAgICAgICAgYnVsbGV0Qm9keS5hZGRFdmVudExpc3RlbmVyKCdjb2xsaWRlJywgKGV2ZW50OiBhbnkpID0+IHRoaXMuaGFuZGxlQnVsbGV0Q29sbGlzaW9uKGJ1bGxldCwgZXZlbnQpKTtcclxuXHJcbiAgICAgICAgaWYgKG93bmVyID09PSAncGxheWVyJykge1xyXG4gICAgICAgICAgICB0aGlzLmxhc3RQbGF5ZXJTaG9vdFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBoYW5kbGVCdWxsZXRDb2xsaXNpb24oYnVsbGV0OiBHYW1lT2JqZWN0LCBldmVudDogYW55KTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZyB8fCBidWxsZXQuaXNEZWFkKSByZXR1cm47IC8vIGJ1bGxldC5pc0RlYWQgYWN0cyBhcyBhIGZsYWcgZm9yIFwiYWxyZWFkeSBoaXQgYW5kIHJlbW92ZWRcIlxyXG5cclxuICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBldmVudC5ib2R5O1xyXG5cclxuICAgICAgICAvLyBQcmV2ZW50IGJ1bGxldCBmcm9tIGhpdHRpbmcgaXRzZWxmIG9yIGl0cyBvd25lciBpbW1lZGlhdGVseSBhZnRlciBzcGF3blxyXG4gICAgICAgIGlmIChidWxsZXQub3duZXIgPT09ICdwbGF5ZXInICYmIG90aGVyQm9keSA9PT0gdGhpcy5wbGF5ZXIuYm9keSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChidWxsZXQub3duZXIgPT09ICdlbmVteScgJiYgdGhpcy5lbmVtaWVzLnNvbWUoZSA9PiBlLmJvZHkgPT09IG90aGVyQm9keSkpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5idWxsZXRzLnNvbWUoYiA9PiBiLmJvZHkgPT09IG90aGVyQm9keSkpIHsgLy8gQnVsbGV0IGhpdHRpbmcgYW5vdGhlciBidWxsZXRcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGhpdFNvbWV0aGluZ0ltcG9ydGFudCA9IGZhbHNlO1xyXG5cclxuICAgICAgICBpZiAoYnVsbGV0Lm93bmVyID09PSAncGxheWVyJykge1xyXG4gICAgICAgICAgICAvLyBQbGF5ZXIgYnVsbGV0IGhpdHMgZW5lbXlcclxuICAgICAgICAgICAgY29uc3QgZW5lbXlIaXQgPSB0aGlzLmVuZW1pZXMuZmluZChlID0+IGUuYm9keSA9PT0gb3RoZXJCb2R5ICYmICFlLmlzRGVhZCk7XHJcbiAgICAgICAgICAgIGlmIChlbmVteUhpdCkge1xyXG4gICAgICAgICAgICAgICAgZW5lbXlIaXQuY3VycmVudEhlYWx0aCEgLT0gdGhpcy5jb25maWcucGxheWVyLmJ1bGxldERhbWFnZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW9NYW5hZ2VyLnBsYXlTb3VuZCgnaGl0U291bmQnLCBmYWxzZSwgMC40KTtcclxuICAgICAgICAgICAgICAgIGlmIChlbmVteUhpdC5jdXJyZW50SGVhbHRoISA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbmVteUtpbGxlZChlbmVteUhpdCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBoaXRTb21ldGhpbmdJbXBvcnRhbnQgPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChidWxsZXQub3duZXIgPT09ICdlbmVteScpIHtcclxuICAgICAgICAgICAgLy8gRW5lbXkgYnVsbGV0IGhpdHMgcGxheWVyXHJcbiAgICAgICAgICAgIGlmIChvdGhlckJvZHkgPT09IHRoaXMucGxheWVyLmJvZHkgJiYgIXRoaXMucGxheWVyLmlzRGVhZCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXIuY3VycmVudEhlYWx0aCEgLT0gdGhpcy5jb25maWcuZW5lbXkuYnVsbGV0RGFtYWdlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hdWRpb01hbmFnZXIucGxheVNvdW5kKCdoaXRTb3VuZCcsIGZhbHNlLCAwLjQpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucGxheWVyLmN1cnJlbnRIZWFsdGghIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsYXllci5pc0RlYWQgPSB0cnVlOyAvLyBNYXJrIHBsYXllciBhcyBkZWFkIGZvciBnYW1lIG92ZXIgY2hlY2tcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGhpdFNvbWV0aGluZ0ltcG9ydGFudCA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlbW92ZSBidWxsZXQgaWYgaXQgaGl0IHNvbWV0aGluZyBpbXBvcnRhbnQgb3IgdGhlIGdyb3VuZFxyXG4gICAgICAgIGlmIChoaXRTb21ldGhpbmdJbXBvcnRhbnQgfHwgb3RoZXJCb2R5ID09PSB0aGlzLmdyb3VuZEJvZHkpIHtcclxuICAgICAgICAgICAgYnVsbGV0LmlzRGVhZCA9IHRydWU7IC8vIE1hcmsgZm9yIHJlbW92YWxcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGJ1bGxldC5ib2R5KTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoYnVsbGV0Lm1lc2gpO1xyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldHMgPSB0aGlzLmJ1bGxldHMuZmlsdGVyKGIgPT4gYiAhPT0gYnVsbGV0KTsgLy8gUmVtb3ZlIGZyb20gYWN0aXZlIGJ1bGxldHMgbGlzdFxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGhhbmRsZUVuZW15Q29sbGlzaW9uKGVuZW15OiBHYW1lT2JqZWN0LCBldmVudDogYW55KTogdm9pZCB7XHJcbiAgICAgICAgLy8gVGhpcyBpcyBwcmltYXJpbHkgZm9yIGJ1bGxldCBjb2xsaXNpb25zLCB3aGljaCBhcmUgaGFuZGxlZCBpbiBoYW5kbGVCdWxsZXRDb2xsaXNpb25cclxuICAgICAgICAvLyBUaGlzIGZ1bmN0aW9uIGNvdWxkIGJlIGV4cGFuZGVkIGZvciBtZWxlZSBhdHRhY2tzIG9yIG90aGVyIGVuZW15LXNwZWNpZmljIGludGVyYWN0aW9ucy5cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGVuZW15S2lsbGVkKGVuZW15OiBHYW1lT2JqZWN0KTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZyB8fCBlbmVteS5pc0RlYWQpIHJldHVybjtcclxuXHJcbiAgICAgICAgZW5lbXkuaXNEZWFkID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnBsYXllci5zY29yZSEgKz0gdGhpcy5jb25maWcuZW5lbXkucG9pbnRzO1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgZW5lbXkgYWZ0ZXIgYSBzaG9ydCBkZWxheSBmb3IgdmlzdWFsIGVmZmVjdFxyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZW5lbXkuYm9keSkgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGVuZW15LmJvZHkpO1xyXG4gICAgICAgICAgICBpZiAoZW5lbXkubWVzaCkgdGhpcy5zY2VuZS5yZW1vdmUoZW5lbXkubWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcyA9IHRoaXMuZW5lbWllcy5maWx0ZXIoZSA9PiBlICE9PSBlbmVteSk7XHJcbiAgICAgICAgfSwgMTAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlbmRlcigpOiB2b2lkIHtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIEluc3RhbnRpYXRlIGFuZCBzdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSBET00gaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBjb25zdCBnYW1lID0gbmV3IEdhbWUoKTtcclxuICAgIGdhbWUuaW5pdCgpO1xyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsMkJBQTJCO0FBNERwQyxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUpDLFNBQUFBO0FBQUEsR0FBQTtBQW9CTCxNQUFNLGFBQWE7QUFBQSxFQUtmLGNBQWM7QUFDVixTQUFLLGVBQWUsS0FBSyxPQUFPLGdCQUFpQixPQUFlLG9CQUFvQjtBQUNwRixTQUFLLFVBQVUsb0JBQUksSUFBSTtBQUN2QixTQUFLLHdCQUF3QjtBQUFBLEVBQ2pDO0FBQUEsRUFFQSxNQUFNLFVBQVUsTUFBYyxLQUE0QjtBQUN0RCxRQUFJO0FBQ0EsWUFBTSxXQUFXLE1BQU0sTUFBTSxHQUFHO0FBQ2hDLFlBQU0sY0FBYyxNQUFNLFNBQVMsWUFBWTtBQUMvQyxZQUFNLGNBQWMsTUFBTSxLQUFLLGFBQWEsZ0JBQWdCLFdBQVc7QUFDdkUsV0FBSyxRQUFRLElBQUksTUFBTSxXQUFXO0FBQUEsSUFDdEMsU0FBUyxPQUFPO0FBQ1osY0FBUSxNQUFNLHVCQUF1QixHQUFHLEtBQUssS0FBSztBQUFBLElBQ3REO0FBQUEsRUFDSjtBQUFBLEVBRUEsVUFBVSxNQUFjLE9BQWdCLE9BQU8sU0FBaUIsR0FBUztBQUNyRSxVQUFNLFNBQVMsS0FBSyxRQUFRLElBQUksSUFBSTtBQUNwQyxRQUFJ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
