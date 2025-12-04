import * as THREE from "three";
import * as CANNON from "cannon-es";
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  return GameState2;
})(GameState || {});
var GameObjectType = /* @__PURE__ */ ((GameObjectType2) => {
  GameObjectType2[GameObjectType2["PLAYER"] = 0] = "PLAYER";
  GameObjectType2[GameObjectType2["ENEMY"] = 1] = "ENEMY";
  GameObjectType2[GameObjectType2["BULLET"] = 2] = "BULLET";
  GameObjectType2[GameObjectType2["STATIC_OBJECT"] = 3] = "STATIC_OBJECT";
  return GameObjectType2;
})(GameObjectType || {});
class Enemy {
  // Flag to prevent multiple destroy calls
  constructor(game, position) {
    // Reference to the main Game instance
    this.isPendingDestroy = false;
    this.game = game;
    this.health = game.config.gameSettings.enemyHealth;
    const enemyTexture = game.textures.get("enemy_texture");
    const enemyMaterial = new THREE.MeshLambertMaterial({
      map: enemyTexture,
      color: enemyTexture ? 16777215 : 16711680
      // Red if no texture
    });
    const enemyGeometry = new THREE.BoxGeometry(1, 2, 1);
    this.mesh = new THREE.Mesh(enemyGeometry, enemyMaterial);
    this.mesh.position.copy(position);
    this.mesh.castShadow = true;
    game.scene.add(this.mesh);
    const enemyShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5));
    this.body = new CANNON.Body({
      mass: 10,
      // Enemies have mass, so they interact with physics
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape: enemyShape,
      fixedRotation: true,
      // Prevent enemies from toppling over
      material: game.defaultObjectMaterial
      // Use default material for collisions
    });
    this.body.userData = { type: 1 /* ENEMY */, instance: this };
    game.world.addBody(this.body);
  }
  /**
   * Updates the enemy's state, including basic AI movement and visual synchronization.
   * @param deltaTime Time elapsed since last frame.
   * @param playerBody The physics body of the player to target.
   */
  update(deltaTime, playerBody) {
    if (this.isPendingDestroy) return;
    const playerPos = playerBody.position;
    const enemyPos = this.body.position;
    const direction = new CANNON.Vec3();
    playerPos.vsub(enemyPos, direction);
    direction.y = 0;
    direction.normalize();
    const desiredVelocity = direction.scale(this.game.config.gameSettings.enemySpeed);
    this.body.velocity.x = desiredVelocity.x;
    this.body.velocity.z = desiredVelocity.z;
    this.mesh.position.copy(this.body.position);
    const lookAtVec = new THREE.Vector3(playerPos.x, enemyPos.y, playerPos.z);
    this.mesh.lookAt(lookAtVec);
    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = 0;
  }
  /**
   * Reduces the enemy's health by the given amount. Destroys the enemy if health drops to 0 or below.
   * @param amount The amount of damage to take.
   */
  takeDamage(amount) {
    if (this.isPendingDestroy) return;
    this.health -= amount;
    this.game.sounds.get("enemy_hit_sound")?.play().catch((e) => {
    });
    if (this.health <= 0) {
      this.destroy();
    }
  }
  /**
   * Schedules the enemy for removal from the game. Actual removal happens after the physics step.
   */
  destroy() {
    if (this.isPendingDestroy) return;
    this.isPendingDestroy = true;
    this.game.enemiesToDestroy.push(this);
    this.game.removeEnemy(this);
    this.game.sounds.get("enemy_death_sound")?.play().catch((e) => {
    });
  }
  /**
   * Performs the actual removal of the enemy's visual mesh and physics body from the game.
   * This method is called by the Game class after the physics step.
   */
  performDestroy() {
    if (!this.isPendingDestroy) return;
    this.game.scene.remove(this.mesh);
    this.game.world.removeBody(this.body);
  }
}
class Bullet {
  // Flag to prevent multiple destroy calls
  constructor(game, position, direction, speed, damage, shooterType, ownerBody) {
    // To ignore initial collision with shooter
    this.isPendingDestroy = false;
    this.game = game;
    this.damage = damage;
    this.shooterType = shooterType;
    this.lifetime = game.config.gameSettings.bulletLifetime;
    this.ownerBody = ownerBody;
    const bulletTexture = game.textures.get("bullet_texture");
    const bulletMaterial = new THREE.MeshLambertMaterial({
      map: bulletTexture,
      color: bulletTexture ? 16777215 : 16776960
      // Yellow if no texture
    });
    const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    this.mesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
    this.mesh.position.copy(position);
    this.mesh.castShadow = true;
    game.scene.add(this.mesh);
    const bulletShape = new CANNON.Sphere(0.1);
    this.body = new CANNON.Body({
      mass: 0.1,
      // Small mass, so it's affected by physics but moves fast
      position: new CANNON.Vec3(position.x, position.y, position.z),
      shape: bulletShape,
      isTrigger: false,
      // For actual collision response
      material: game.defaultObjectMaterial
      // Use default material
    });
    this.body.velocity.set(direction.x * speed, direction.y * speed, direction.z * speed);
    this.body.allowSleep = false;
    this.body.userData = { type: 2 /* BULLET */, instance: this, owner: this.ownerBody };
    game.world.addBody(this.body);
  }
  /**
   * Updates the bullet's state, checking its lifetime and synchronizing its visual mesh.
   * @param deltaTime Time elapsed since last frame.
   */
  update(deltaTime) {
    if (this.isPendingDestroy) return;
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.destroy();
      return;
    }
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }
  /**
   * Schedules the bullet for removal from the game. Actual removal happens after the physics step.
   */
  destroy() {
    if (this.isPendingDestroy) return;
    this.isPendingDestroy = true;
    this.game.bulletsToDestroy.push(this);
    this.game.removeBullet(this);
  }
  /**
   * Performs the actual removal of the bullet's visual mesh and physics body from the game.
   * This method is called by the Game class after the physics step.
   */
  performDestroy() {
    if (!this.isPendingDestroy) return;
    this.game.scene.remove(this.mesh);
    this.game.world.removeBody(this.body);
  }
}
class Game {
  constructor() {
    // Game configuration loaded from data.json
    this.state = 0 /* TITLE */;
    this.placedObjectMeshes = [];
    this.placedObjectBodies = [];
    // NEW: Game entities (enemies and bullets)
    this.enemies = [];
    this.bullets = [];
    this.lastEnemySpawnTime = 0;
    // Timer for enemy spawning
    this.lastFireTime = 0;
    // Timer for player's fire rate
    // Deferred destruction queues
    this.bulletsToDestroy = [];
    // Bullets to be destroyed after physics step
    this.enemiesToDestroy = [];
    // Enemies to be destroyed after physics step
    // Input handling state
    this.keys = {};
    // Tracks currently pressed keys
    this.isPointerLocked = false;
    // True if mouse pointer is locked
    this.cameraPitch = 0;
    // Vertical rotation (pitch) of the camera
    // Asset management
    this.textures = /* @__PURE__ */ new Map();
    // Stores loaded textures
    this.sounds = /* @__PURE__ */ new Map();
    // For calculating delta time between frames
    this.lastTime = 0;
    // Tracks player contacts with ANY static surface (ground or placed objects) for jumping/movement logic
    this.numContactsWithStaticSurfaces = 0;
    this.canvas = document.getElementById("gameCanvas");
    if (!this.canvas) {
      console.error('Canvas element with ID "gameCanvas" not found!');
      return;
    }
    this.init();
  }
  /**
   * Asynchronously initializes the game, loading config, assets, and setting up systems.
   */
  async init() {
    try {
      const response = await fetch("data.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.config = await response.json();
      console.log("Game configuration loaded:", this.config);
    } catch (error) {
      console.error("Failed to load game configuration:", error);
      const errorDiv = document.createElement("div");
      errorDiv.style.position = "absolute";
      errorDiv.style.top = "50%";
      errorDiv.style.left = "50%";
      errorDiv.style.transform = "translate(-50%, -50%)";
      errorDiv.style.color = "red";
      errorDiv.style.fontSize = "24px";
      errorDiv.textContent = "Error: Failed to load game configuration. Check console for details.";
      document.body.appendChild(errorDiv);
      return;
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      // Field of View (FOV)
      this.config.gameSettings.fixedAspectRatio.width / this.config.gameSettings.fixedAspectRatio.height,
      // Fixed Aspect ratio from config
      this.config.gameSettings.cameraNear,
      // Near clipping plane
      this.config.gameSettings.cameraFar
      // Far clipping plane
    );
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.cameraContainer = new THREE.Object3D();
    this.scene.add(this.cameraContainer);
    this.cameraContainer.add(this.camera);
    this.camera.position.y = this.config.gameSettings.cameraHeightOffset;
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 10;
    this.playerMaterial = new CANNON.Material("playerMaterial");
    this.groundMaterial = new CANNON.Material("groundMaterial");
    this.defaultObjectMaterial = new CANNON.Material("defaultObjectMaterial");
    const playerGroundContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.groundMaterial,
      { friction: this.config.gameSettings.playerGroundFriction, restitution: 0 }
    );
    this.world.addContactMaterial(playerGroundContactMaterial);
    const playerObjectContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.defaultObjectMaterial,
      { friction: this.config.gameSettings.playerGroundFriction, restitution: 0 }
    );
    this.world.addContactMaterial(playerObjectContactMaterial);
    const objectGroundContactMaterial = new CANNON.ContactMaterial(
      this.defaultObjectMaterial,
      this.groundMaterial,
      { friction: this.config.gameSettings.playerGroundFriction, restitution: 0 }
    );
    this.world.addContactMaterial(objectGroundContactMaterial);
    const objectObjectContactMaterial = new CANNON.ContactMaterial(
      this.defaultObjectMaterial,
      this.defaultObjectMaterial,
      { friction: 0.1, restitution: 0.1 }
      // Small friction/restitution for generic objects
    );
    this.world.addContactMaterial(objectObjectContactMaterial);
    await this.loadAssets();
    this.createGround();
    this.createPlayer();
    this.createPlacedObjects();
    this.setupLighting();
    this.world.addEventListener("beginContact", (event) => {
      const bodyA = event.bodyA;
      const bodyB = event.bodyB;
      if (bodyA.userData?.type === 0 /* PLAYER */ || bodyB.userData?.type === 0 /* PLAYER */) {
        const otherBody = bodyA.userData?.type === 0 /* PLAYER */ ? bodyB : bodyA;
        if (otherBody.userData && otherBody.userData.type === 3 /* STATIC_OBJECT */) {
          this.numContactsWithStaticSurfaces++;
        }
      }
      let bulletInstance;
      let targetBody;
      if (bodyA.userData?.type === 2 /* BULLET */) {
        bulletInstance = bodyA.userData.instance;
        targetBody = bodyB;
      } else if (bodyB.userData?.type === 2 /* BULLET */) {
        bulletInstance = bodyB.userData.instance;
        targetBody = bodyA;
      }
      if (bulletInstance && targetBody) {
        if (bulletInstance.ownerBody === targetBody) {
          return;
        }
        switch (targetBody.userData?.type) {
          case 1 /* ENEMY */:
            const enemyInstance = targetBody.userData.instance;
            enemyInstance.takeDamage(bulletInstance.damage);
            bulletInstance.destroy();
            break;
          case 3 /* STATIC_OBJECT */:
            bulletInstance.destroy();
            break;
        }
      }
    });
    this.world.addEventListener("endContact", (event) => {
      const bodyA = event.bodyA;
      const bodyB = event.bodyB;
      if (bodyA.userData?.type === 0 /* PLAYER */ || bodyB.userData?.type === 0 /* PLAYER */) {
        const otherBody = bodyA.userData?.type === 0 /* PLAYER */ ? bodyB : bodyA;
        if (otherBody.userData && otherBody.userData.type === 3 /* STATIC_OBJECT */) {
          this.numContactsWithStaticSurfaces = Math.max(0, this.numContactsWithStaticSurfaces - 1);
        }
      }
    });
    window.addEventListener("resize", this.onWindowResize.bind(this));
    document.addEventListener("keydown", this.onKeyDown.bind(this));
    document.addEventListener("keyup", this.onKeyUp.bind(this));
    document.addEventListener("mousemove", this.onMouseMove.bind(this));
    document.addEventListener("mousedown", this.onMouseDown.bind(this));
    document.addEventListener("mouseup", this.onMouseUp.bind(this));
    document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this));
    document.addEventListener("mozpointerlockchange", this.onPointerLockChange.bind(this));
    document.addEventListener("webkitpointerlockchange", this.onPointerLockChange.bind(this));
    this.applyFixedAspectRatio();
    this.setupTitleScreen();
    this.animate(0);
  }
  /**
   * Loads all textures and sounds defined in the game configuration.
   */
  async loadAssets() {
    const textureLoader = new THREE.TextureLoader();
    const imagePromises = this.config.assets.images.map((img) => {
      return textureLoader.loadAsync(img.path).then((texture) => {
        this.textures.set(img.name, texture);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        if (img.name === "ground_texture") {
          texture.repeat.set(this.config.gameSettings.groundSize / 5, this.config.gameSettings.groundSize / 5);
        }
      }).catch((error) => {
        console.error(`Failed to load texture: ${img.path}`, error);
      });
    });
    const soundPromises = this.config.assets.sounds.map((sound) => {
      return new Promise((resolve) => {
        const audio = new Audio(sound.path);
        audio.volume = sound.volume;
        audio.loop = sound.name === "background_music";
        audio.oncanplaythrough = () => {
          this.sounds.set(sound.name, audio);
          resolve();
        };
        audio.onerror = () => {
          console.error(`Failed to load sound: ${sound.path}`);
          resolve();
        };
      });
    });
    await Promise.all([...imagePromises, ...soundPromises]);
    console.log(`Assets loaded: ${this.textures.size} textures, ${this.sounds.size} sounds.`);
  }
  /**
   * Creates and displays the title screen UI dynamically.
   */
  setupTitleScreen() {
    this.titleScreenOverlay = document.createElement("div");
    Object.assign(this.titleScreenOverlay.style, {
      position: "absolute",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      color: "white",
      fontFamily: "Arial, sans-serif",
      fontSize: "48px",
      textAlign: "center",
      zIndex: "1000"
    });
    document.body.appendChild(this.titleScreenOverlay);
    this.applyFixedAspectRatio();
    this.titleText = document.createElement("div");
    this.titleText.textContent = this.config.gameSettings.titleScreenText;
    this.titleScreenOverlay.appendChild(this.titleText);
    this.promptText = document.createElement("div");
    this.promptText.textContent = this.config.gameSettings.startGamePrompt;
    Object.assign(this.promptText.style, {
      marginTop: "20px",
      fontSize: "24px"
    });
    this.titleScreenOverlay.appendChild(this.promptText);
    this.titleScreenOverlay.addEventListener("click", () => this.startGame());
    this.sounds.get("background_music")?.play().catch((e) => console.log("BGM play denied (requires user gesture):", e));
  }
  /**
   * Transitions the game from the title screen to the playing state.
   */
  startGame() {
    this.state = 1 /* PLAYING */;
    if (this.titleScreenOverlay && this.titleScreenOverlay.parentNode) {
      document.body.removeChild(this.titleScreenOverlay);
    }
    this.canvas.addEventListener("click", this.handleCanvasReLockPointer.bind(this));
    this.canvas.requestPointerLock();
    this.sounds.get("background_music")?.play().catch((e) => console.log("BGM play failed after user gesture:", e));
  }
  /**
   * Handles clicks on the canvas to re-lock the pointer if the game is playing and unlocked.
   */
  handleCanvasReLockPointer() {
    if (this.state === 1 /* PLAYING */ && !this.isPointerLocked) {
      this.canvas.requestPointerLock();
    }
  }
  /**
   * Creates the player's visual mesh and physics body.
   */
  createPlayer() {
    const playerTexture = this.textures.get("player_texture");
    const playerMaterial = new THREE.MeshLambertMaterial({
      map: playerTexture,
      color: playerTexture ? 16777215 : 30719
    });
    const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
    this.playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    this.playerMesh.position.y = 5;
    this.playerMesh.castShadow = true;
    this.scene.add(this.playerMesh);
    const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5));
    this.playerBody = new CANNON.Body({
      mass: this.config.gameSettings.playerMass,
      position: new CANNON.Vec3(this.playerMesh.position.x, this.playerMesh.position.y, this.playerMesh.position.z),
      shape: playerShape,
      fixedRotation: true,
      material: this.playerMaterial
    });
    this.playerBody.userData = { type: 0 /* PLAYER */, instance: this.playerBody };
    this.world.addBody(this.playerBody);
    this.cameraContainer.position.copy(this.playerBody.position);
  }
  /**
   * Creates the ground's visual mesh and physics body.
   */
  createGround() {
    const groundTexture = this.textures.get("ground_texture");
    const groundMaterial = new THREE.MeshLambertMaterial({
      map: groundTexture,
      color: groundTexture ? 16777215 : 8947848
    });
    const groundGeometry = new THREE.PlaneGeometry(this.config.gameSettings.groundSize, this.config.gameSettings.groundSize);
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      mass: 0,
      shape: groundShape,
      material: this.groundMaterial
    });
    this.groundBody.userData = { type: 3 /* STATIC_OBJECT */ };
    this.groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(this.groundBody);
  }
  /**
   * Creates visual meshes and physics bodies for all objects defined in config.gameSettings.placedObjects.
   */
  createPlacedObjects() {
    if (!this.config.gameSettings.placedObjects) {
      console.warn("No placedObjects defined in gameSettings.");
      return;
    }
    this.config.gameSettings.placedObjects.forEach((objConfig) => {
      const texture = this.textures.get(objConfig.textureName);
      const material = new THREE.MeshLambertMaterial({
        map: texture,
        color: texture ? 16777215 : 11184810
      });
      const geometry = new THREE.BoxGeometry(objConfig.dimensions.width, objConfig.dimensions.height, objConfig.dimensions.depth);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(objConfig.position.x, objConfig.position.y, objConfig.position.z);
      if (objConfig.rotationY !== void 0) {
        mesh.rotation.y = objConfig.rotationY;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.placedObjectMeshes.push(mesh);
      const shape = new CANNON.Box(new CANNON.Vec3(
        objConfig.dimensions.width / 2,
        objConfig.dimensions.height / 2,
        objConfig.dimensions.depth / 2
      ));
      const body = new CANNON.Body({
        mass: objConfig.mass,
        position: new CANNON.Vec3(objConfig.position.x, objConfig.position.y, objConfig.position.z),
        shape,
        material: this.defaultObjectMaterial
      });
      body.userData = { type: 3 /* STATIC_OBJECT */ };
      if (objConfig.rotationY !== void 0) {
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), objConfig.rotationY);
      }
      this.world.addBody(body);
      this.placedObjectBodies.push(body);
    });
    console.log(`Created ${this.placedObjectMeshes.length} placed objects.`);
  }
  /**
   * Sets up ambient and directional lighting in the scene.
   */
  setupLighting() {
    const ambientLight = new THREE.AmbientLight(4210752, 1);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(16777215, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    this.scene.add(directionalLight);
  }
  /**
   * Handles window resizing to keep the camera aspect ratio and renderer size correct.
   */
  onWindowResize() {
    this.applyFixedAspectRatio();
  }
  /**
   * Applies the configured fixed aspect ratio to the renderer and camera,
   * resizing and centering the canvas to fit within the window.
   */
  applyFixedAspectRatio() {
    const targetAspectRatio = this.config.gameSettings.fixedAspectRatio.width / this.config.gameSettings.fixedAspectRatio.height;
    let newWidth;
    let newHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const currentWindowAspectRatio = windowWidth / windowHeight;
    if (currentWindowAspectRatio > targetAspectRatio) {
      newHeight = windowHeight;
      newWidth = newHeight * targetAspectRatio;
    } else {
      newWidth = windowWidth;
      newHeight = newWidth / targetAspectRatio;
    }
    this.renderer.setSize(newWidth, newHeight, false);
    this.camera.aspect = targetAspectRatio;
    this.camera.updateProjectionMatrix();
    Object.assign(this.canvas.style, {
      width: `${newWidth}px`,
      height: `${newHeight}px`,
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      objectFit: "contain"
    });
    if (this.state === 0 /* TITLE */ && this.titleScreenOverlay) {
      Object.assign(this.titleScreenOverlay.style, {
        width: `${newWidth}px`,
        height: `${newHeight}px`,
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)"
      });
    }
  }
  /**
   * Records which keys are currently pressed down.
   */
  onKeyDown(event) {
    this.keys[event.key.toLowerCase()] = true;
    if (this.state === 1 /* PLAYING */ && this.isPointerLocked) {
      if (event.key.toLowerCase() === " ") {
        this.playerJump();
      }
    }
  }
  /**
   * Records which keys are currently released.
   */
  onKeyUp(event) {
    this.keys[event.key.toLowerCase()] = false;
  }
  /**
   * Records mouse button press state.
   */
  onMouseDown(event) {
    if (this.state === 1 /* PLAYING */ && this.isPointerLocked) {
      if (event.button === 0) {
        this.keys["mouse0"] = true;
      }
    }
  }
  /**
   * Records mouse button release state.
   */
  onMouseUp(event) {
    if (event.button === 0) {
      this.keys["mouse0"] = false;
    }
  }
  /**
   * Handles mouse movement for camera rotation (mouse look).
   */
  onMouseMove(event) {
    if (this.state === 1 /* PLAYING */ && this.isPointerLocked) {
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;
      this.cameraContainer.rotation.y -= movementX * this.config.gameSettings.mouseSensitivity;
      this.cameraPitch -= movementY * this.config.gameSettings.mouseSensitivity;
      this.cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.cameraPitch));
      this.camera.rotation.x = this.cameraPitch;
    }
  }
  /**
   * Updates the pointer lock status when it changes (e.g., user presses Esc).
   */
  onPointerLockChange() {
    if (document.pointerLockElement === this.canvas || document.mozPointerLockElement === this.canvas || document.webkitPointerLockElement === this.canvas) {
      this.isPointerLocked = true;
      console.log("Pointer locked");
    } else {
      this.isPointerLocked = false;
      console.log("Pointer unlocked");
    }
  }
  /**
   * The main game loop, called on every animation frame.
   */
  animate(time) {
    requestAnimationFrame(this.animate.bind(this));
    const deltaTime = (time - this.lastTime) / 1e3;
    this.lastTime = time;
    if (this.state === 1 /* PLAYING */) {
      this.updatePlayerActions(deltaTime);
      this.spawnEnemies(deltaTime);
      this.updateEntities(deltaTime);
      this.updatePhysics(deltaTime);
      this.processDestroyQueue();
      this.clampPlayerPosition();
      this.syncMeshesWithBodies();
    }
    this.renderer.render(this.scene, this.camera);
  }
  /**
   * Steps the Cannon.js physics world forward.
   */
  updatePhysics(deltaTime) {
    this.world.step(1 / 60, deltaTime, this.config.gameSettings.maxPhysicsSubSteps);
  }
  /**
   * Processes any game objects (bullets, enemies) that have been marked for destruction.
   * This is done after the physics step to avoid modifying the physics world during iteration.
   */
  processDestroyQueue() {
    for (const bullet of this.bulletsToDestroy) {
      bullet.performDestroy();
    }
    this.bulletsToDestroy.length = 0;
    for (const enemy of this.enemiesToDestroy) {
      enemy.performDestroy();
    }
    this.enemiesToDestroy.length = 0;
  }
  /**
   * NEW: Handles player-specific actions like movement and shooting.
   * @param deltaTime Time elapsed since last frame.
   */
  updatePlayerActions(deltaTime) {
    this.updatePlayerMovement();
    const currentTime = performance.now() / 1e3;
    if (this.isPointerLocked && this.keys["mouse0"] && currentTime - this.lastFireTime >= this.config.gameSettings.playerFireRate) {
      this.lastFireTime = currentTime;
      const bulletStartPos = new THREE.Vector3();
      this.camera.getWorldPosition(bulletStartPos);
      const bulletDirection = new THREE.Vector3();
      this.camera.getWorldDirection(bulletDirection);
      this.createBullet(
        bulletStartPos,
        bulletDirection,
        this.config.gameSettings.playerBulletSpeed,
        this.config.gameSettings.playerBulletDamage,
        0 /* PLAYER */,
        this.playerBody
      );
    }
  }
  /**
   * Updates the player's velocity based on WASD input and camera orientation.
   */
  updatePlayerMovement() {
    if (!this.isPointerLocked) {
      this.playerBody.velocity.x = 0;
      this.playerBody.velocity.z = 0;
      return;
    }
    let effectivePlayerSpeed = this.config.gameSettings.playerSpeed;
    if (this.numContactsWithStaticSurfaces === 0) {
      effectivePlayerSpeed *= this.config.gameSettings.playerAirControlFactor;
    }
    const currentYVelocity = this.playerBody.velocity.y;
    const moveDirection = new THREE.Vector3(0, 0, 0);
    const cameraDirection = new THREE.Vector3();
    this.cameraContainer.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    const globalUp = new THREE.Vector3(0, 1, 0);
    const cameraRight = new THREE.Vector3();
    cameraRight.crossVectors(globalUp, cameraDirection).normalize();
    let moving = false;
    if (this.keys["s"]) {
      moveDirection.add(cameraDirection);
      moving = true;
    }
    if (this.keys["w"]) {
      moveDirection.sub(cameraDirection);
      moving = true;
    }
    if (this.keys["a"]) {
      moveDirection.sub(cameraRight);
      moving = true;
    }
    if (this.keys["d"]) {
      moveDirection.add(cameraRight);
      moving = true;
    }
    if (moving) {
      moveDirection.normalize().multiplyScalar(effectivePlayerSpeed);
      this.playerBody.velocity.x = moveDirection.x;
      this.playerBody.velocity.z = moveDirection.z;
    } else {
      if (this.numContactsWithStaticSurfaces === 0) {
        this.playerBody.velocity.x *= this.config.gameSettings.playerAirDeceleration;
        this.playerBody.velocity.z *= this.config.gameSettings.playerAirDeceleration;
      }
    }
    this.playerBody.velocity.y = currentYVelocity;
  }
  /**
   * Applies an upward impulse to the player body for jumping.
   */
  playerJump() {
    if (this.numContactsWithStaticSurfaces > 0) {
      this.playerBody.velocity.y = 0;
      this.playerBody.applyImpulse(
        new CANNON.Vec3(0, this.config.gameSettings.jumpForce, 0),
        this.playerBody.position
      );
    }
  }
  /**
   * NEW: Manages spawning of enemies into the game world.
   * @param deltaTime Time elapsed since last frame.
   */
  spawnEnemies(deltaTime) {
    if (this.enemies.length < this.config.gameSettings.enemyMaxCount) {
      this.lastEnemySpawnTime += deltaTime;
      if (this.lastEnemySpawnTime >= this.config.gameSettings.enemySpawnInterval) {
        this.lastEnemySpawnTime = 0;
        const groundSize = this.config.gameSettings.groundSize;
        const spawnX = (Math.random() - 0.5) * groundSize * 0.8;
        const spawnZ = (Math.random() - 0.5) * groundSize * 0.8;
        const spawnY = 5;
        this.createEnemy(new THREE.Vector3(spawnX, spawnY, spawnZ));
      }
    }
  }
  /**
   * NEW: Updates all dynamic game entities (enemies and bullets).
   * @param deltaTime Time elapsed since last frame.
   */
  updateEntities(deltaTime) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(deltaTime, this.playerBody);
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.update(deltaTime);
    }
  }
  /**
   * NEW: Creates a new Enemy instance and adds it to the game.
   * @param position Initial position of the enemy.
   */
  createEnemy(position) {
    const enemy = new Enemy(this, position);
    this.enemies.push(enemy);
  }
  /**
   * NEW: Removes a specific Enemy instance from the game's active list.
   * Called by the Enemy itself when it's destroyed.
   * @param enemyToRemove The Enemy instance to remove.
   */
  removeEnemy(enemyToRemove) {
    this.enemies = this.enemies.filter((enemy) => enemy !== enemyToRemove);
  }
  /**
   * NEW: Creates a new Bullet instance and adds it to the game.
   * @param position Starting position of the bullet.
   * @param direction Firing direction of the bullet.
   * @param speed Speed of the bullet.
   * @param damage Damage the bullet deals on hit.
   * @param shooterType Type of entity that fired the bullet (PLAYER/ENEMY).
   * @param ownerBody The physics body of the entity that fired the bullet (for collision filtering).
   */
  createBullet(position, direction, speed, damage, shooterType, ownerBody) {
    const bullet = new Bullet(this, position, direction, speed, damage, shooterType, ownerBody);
    this.bullets.push(bullet);
    this.sounds.get("gunshot_sound")?.play().catch((e) => {
    });
  }
  /**
   * NEW: Removes a specific Bullet instance from the game's active list.
   * Called by the Bullet itself when it's destroyed.
   * @param bulletToRemove The Bullet instance to remove.
   */
  removeBullet(bulletToRemove) {
    this.bullets = this.bullets.filter((bullet) => bullet !== bulletToRemove);
  }
  /**
   * Clamps the player's position within the defined ground boundaries.
   */
  clampPlayerPosition() {
    if (!this.playerBody || !this.config) {
      return;
    }
    const halfGroundSize = this.config.gameSettings.groundSize / 2;
    let posX = this.playerBody.position.x;
    let posZ = this.playerBody.position.z;
    let velX = this.playerBody.velocity.x;
    let velZ = this.playerBody.velocity.z;
    if (posX > halfGroundSize) {
      this.playerBody.position.x = halfGroundSize;
      if (velX > 0) {
        this.playerBody.velocity.x = 0;
      }
    } else if (posX < -halfGroundSize) {
      this.playerBody.position.x = -halfGroundSize;
      if (velX < 0) {
        this.playerBody.velocity.x = 0;
      }
    }
    if (posZ > halfGroundSize) {
      this.playerBody.position.z = halfGroundSize;
      if (velZ > 0) {
        this.playerBody.velocity.z = 0;
      }
    } else if (posZ < -halfGroundSize) {
      this.playerBody.position.z = -halfGroundSize;
      if (velZ < 0) {
        this.playerBody.velocity.z = 0;
      }
    }
  }
  /**
   * Synchronizes the visual meshes with their corresponding physics bodies.
   */
  syncMeshesWithBodies() {
    this.playerMesh.position.copy(this.playerBody.position);
    this.cameraContainer.position.copy(this.playerBody.position);
    this.playerMesh.quaternion.copy(this.cameraContainer.quaternion);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  new Game();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEVudW0gdG8gZGVmaW5lIHRoZSBwb3NzaWJsZSBzdGF0ZXMgb2YgdGhlIGdhbWVcclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsICAgLy8gVGl0bGUgc2NyZWVuLCB3YWl0aW5nIGZvciB1c2VyIGlucHV0XHJcbiAgICBQTEFZSU5HICAvLyBHYW1lIGlzIGFjdGl2ZSwgdXNlciBjYW4gbW92ZSBhbmQgbG9vayBhcm91bmRcclxufVxyXG5cclxuLy8gRW51bSB0byBkZWZpbmUgdHlwZXMgb2YgZ2FtZSBvYmplY3RzIGZvciBjb2xsaXNpb24gZmlsdGVyaW5nIGFuZCBsb2dpY1xyXG5lbnVtIEdhbWVPYmplY3RUeXBlIHtcclxuICAgIFBMQVlFUixcclxuICAgIEVORU1ZLFxyXG4gICAgQlVMTEVULFxyXG4gICAgU1RBVElDX09CSkVDVCwgLy8gR3JvdW5kLCBwbGFjZWQgb2JqZWN0c1xyXG59XHJcblxyXG4vLyBFeHRlbmQgQ0FOTk9OLkJvZHkgdG8gaW5jbHVkZSBhIGN1c3RvbSB1c2VyRGF0YSBwcm9wZXJ0eSBmb3IgaWRlbnRpZnlpbmcgZ2FtZSBvYmplY3RzXHJcbmludGVyZmFjZSBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhIGV4dGVuZHMgQ0FOTk9OLkJvZHkge1xyXG4gICAgdXNlckRhdGE/OiB7IHR5cGU6IEdhbWVPYmplY3RUeXBlLCBpbnN0YW5jZT86IGFueSwgb3duZXI/OiBDQU5OT04uQm9keSB9O1xyXG59XHJcblxyXG4vLyBJbnRlcmZhY2UgZm9yIG9iamVjdHMgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkT2JqZWN0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZzsgLy8gQSBkZXNjcmlwdGl2ZSBuYW1lIGZvciB0aGUgb2JqZWN0IGluc3RhbmNlXHJcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBOYW1lIG9mIHRoZSB0ZXh0dXJlIGZyb20gYXNzZXRzLmltYWdlc1xyXG4gICAgdHlwZTogJ2JveCc7IC8vIEN1cnJlbnRseSBvbmx5IHN1cHBvcnRzICdib3gnXHJcbiAgICBwb3NpdGlvbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyIH07XHJcbiAgICBkaW1lbnNpb25zOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBkZXB0aDogbnVtYmVyIH07XHJcbiAgICByb3RhdGlvblk/OiBudW1iZXI7IC8vIE9wdGlvbmFsIHJvdGF0aW9uIGFyb3VuZCBZLWF4aXMgKHJhZGlhbnMpXHJcbiAgICBtYXNzOiBudW1iZXI7IC8vIDAgZm9yIHN0YXRpYywgPjAgZm9yIGR5bmFtaWMgKHRob3VnaCBhbGwgcGxhY2VkIG9iamVjdHMgaGVyZSB3aWxsIGJlIHN0YXRpYylcclxufVxyXG5cclxuLy8gSW50ZXJmYWNlIHRvIHR5cGUtY2hlY2sgdGhlIGdhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgZ2FtZVNldHRpbmdzOiB7XHJcbiAgICAgICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgc3RhcnRHYW1lUHJvbXB0OiBzdHJpbmc7XHJcbiAgICAgICAgcGxheWVyU3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBtb3VzZVNlbnNpdGl2aXR5OiBudW1iZXI7XHJcbiAgICAgICAgY2FtZXJhSGVpZ2h0T2Zmc2V0OiBudW1iZXI7IC8vIFZlcnRpY2FsIG9mZnNldCBvZiB0aGUgY2FtZXJhIGZyb20gdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keSBjZW50ZXJcclxuICAgICAgICBjYW1lcmFOZWFyOiBudW1iZXI7ICAgICAgICAgLy8gTmVhciBjbGlwcGluZyBwbGFuZSBmb3IgdGhlIGNhbWVyYVxyXG4gICAgICAgIGNhbWVyYUZhcjogbnVtYmVyOyAgICAgICAgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBwbGF5ZXJNYXNzOiBudW1iZXI7ICAgICAgICAgLy8gTWFzcyBvZiB0aGUgcGxheWVyJ3MgcGh5c2ljcyBib2R5XHJcbiAgICAgICAgZ3JvdW5kU2l6ZTogbnVtYmVyOyAgICAgICAgIC8vIFNpemUgKHdpZHRoL2RlcHRoKSBvZiB0aGUgc3F1YXJlIGdyb3VuZCBwbGFuZVxyXG4gICAgICAgIG1heFBoeXNpY3NTdWJTdGVwczogbnVtYmVyOyAvLyBNYXhpbXVtIG51bWJlciBvZiBwaHlzaWNzIHN1YnN0ZXBzIHBlciBmcmFtZSB0byBtYWludGFpbiBzdGFiaWxpdHlcclxuICAgICAgICBmaXhlZEFzcGVjdFJhdGlvOiB7IHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyIH07IC8vIE5ldzogRml4ZWQgYXNwZWN0IHJhdGlvIGZvciB0aGUgZ2FtZSAod2lkdGggLyBoZWlnaHQpXHJcbiAgICAgICAganVtcEZvcmNlOiBudW1iZXI7ICAgICAgICAgIC8vIEFEREVEOiBGb3JjZSBhcHBsaWVkIHdoZW4ganVtcGluZ1xyXG4gICAgICAgIHBsYWNlZE9iamVjdHM6IFBsYWNlZE9iamVjdENvbmZpZ1tdOyAvLyBORVc6IEFycmF5IG9mIG9iamVjdHMgdG8gcGxhY2UgaW4gdGhlIHdvcmxkXHJcbiAgICAgICAgLy8gTkVXOiBDb25maWd1cmFibGUgcGh5c2ljcyBwcm9wZXJ0aWVzXHJcbiAgICAgICAgcGxheWVyR3JvdW5kRnJpY3Rpb246IG51bWJlcjsgICAgICAgIC8vIEZyaWN0aW9uIGNvZWZmaWNpZW50IGZvciBwbGF5ZXItZ3JvdW5kIGNvbnRhY3RcclxuICAgICAgICBwbGF5ZXJBaXJDb250cm9sRmFjdG9yOiBudW1iZXI7ICAgIC8vIE11bHRpcGxpZXIgZm9yIHBsYXllclNwZWVkIHdoZW4gYWlyYm9ybmVcclxuICAgICAgICBwbGF5ZXJBaXJEZWNlbGVyYXRpb246IG51bWJlcjsgICAgIC8vIERlY2F5IGZhY3RvciBmb3IgaG9yaXpvbnRhbCB2ZWxvY2l0eSB3aGVuIGFpcmJvcm5lIGFuZCBub3QgbW92aW5nXHJcbiAgICAgICAgLy8gTkVXOiBFbmVteSBhbmQgY29tYmF0IHNldHRpbmdzXHJcbiAgICAgICAgZW5lbXlTcGF3bkludGVydmFsOiBudW1iZXI7IC8vIFRpbWUgaW4gc2Vjb25kcyBiZXR3ZWVuIGVuZW15IHNwYXduc1xyXG4gICAgICAgIGVuZW15TWF4Q291bnQ6IG51bWJlcjsgICAgICAvLyBNYXhpbXVtIG51bWJlciBvZiBlbmVtaWVzIGFsbG93ZWQgYXQgb25jZVxyXG4gICAgICAgIGVuZW15SGVhbHRoOiBudW1iZXI7ICAgICAgICAvLyBIZWFsdGggZm9yIGVhY2ggZW5lbXlcclxuICAgICAgICBlbmVteVNwZWVkOiBudW1iZXI7ICAgICAgICAgLy8gRW5lbXkgbW92ZW1lbnQgc3BlZWRcclxuICAgICAgICBwbGF5ZXJCdWxsZXRTcGVlZDogbnVtYmVyOyAgLy8gU3BlZWQgb2YgcGxheWVyJ3MgYnVsbGV0c1xyXG4gICAgICAgIHBsYXllckZpcmVSYXRlOiBudW1iZXI7ICAgICAvLyBTZWNvbmRzIGJldHdlZW4gcGxheWVyIHNob3RzXHJcbiAgICAgICAgYnVsbGV0TGlmZXRpbWU6IG51bWJlcjsgICAgIC8vIEhvdyBsb25nIGEgYnVsbGV0IGV4aXN0cyBiZWZvcmUgYmVpbmcgcmVtb3ZlZFxyXG4gICAgICAgIHBsYXllckJ1bGxldERhbWFnZTogbnVtYmVyOyAvLyBEYW1hZ2UgYSBwbGF5ZXIgYnVsbGV0IGRlYWxzXHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXByZXNlbnRzIGFuIGVuZW15IGNoYXJhY3RlciBpbiB0aGUgZ2FtZS5cclxuICogTWFuYWdlcyBpdHMgdmlzdWFsIG1lc2gsIHBoeXNpY3MgYm9keSwgaGVhbHRoLCBhbmQgYmFzaWMgQUkuXHJcbiAqL1xyXG5jbGFzcyBFbmVteSB7XHJcbiAgICBtZXNoOiBUSFJFRS5NZXNoO1xyXG4gICAgYm9keTogQ2Fubm9uQm9keVdpdGhVc2VyRGF0YTtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBnYW1lOiBHYW1lOyAvLyBSZWZlcmVuY2UgdG8gdGhlIG1haW4gR2FtZSBpbnN0YW5jZVxyXG4gICAgcHJpdmF0ZSBpc1BlbmRpbmdEZXN0cm95OiBib29sZWFuID0gZmFsc2U7IC8vIEZsYWcgdG8gcHJldmVudCBtdWx0aXBsZSBkZXN0cm95IGNhbGxzXHJcblxyXG4gICAgY29uc3RydWN0b3IoZ2FtZTogR2FtZSwgcG9zaXRpb246IFRIUkVFLlZlY3RvcjMpIHtcclxuICAgICAgICB0aGlzLmdhbWUgPSBnYW1lO1xyXG4gICAgICAgIHRoaXMuaGVhbHRoID0gZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SGVhbHRoO1xyXG5cclxuICAgICAgICBjb25zdCBlbmVteVRleHR1cmUgPSBnYW1lLnRleHR1cmVzLmdldCgnZW5lbXlfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IGVuZW15TWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogZW5lbXlUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZW5lbXlUZXh0dXJlID8gMHhmZmZmZmYgOiAweGZmMDAwMCAvLyBSZWQgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGVuZW15R2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSwgMiwgMSk7IC8vIFN0YW5kYXJkIGVuZW15IHNpemVcclxuICAgICAgICB0aGlzLm1lc2ggPSBuZXcgVEhSRUUuTWVzaChlbmVteUdlb21ldHJ5LCBlbmVteU1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLm1lc2gucG9zaXRpb24uY29weShwb3NpdGlvbik7XHJcbiAgICAgICAgdGhpcy5tZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgIGdhbWUuc2NlbmUuYWRkKHRoaXMubWVzaCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGVuZW15U2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoMC41LCAxLCAwLjUpKTsgLy8gSGFsZiBleHRlbnRzIGZvciBib3hcclxuICAgICAgICB0aGlzLmJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAxMCwgLy8gRW5lbWllcyBoYXZlIG1hc3MsIHNvIHRoZXkgaW50ZXJhY3Qgd2l0aCBwaHlzaWNzXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMocG9zaXRpb24ueCwgcG9zaXRpb24ueSwgcG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBlbmVteVNoYXBlLFxyXG4gICAgICAgICAgICBmaXhlZFJvdGF0aW9uOiB0cnVlLCAvLyBQcmV2ZW50IGVuZW1pZXMgZnJvbSB0b3BwbGluZyBvdmVyXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiBnYW1lLmRlZmF1bHRPYmplY3RNYXRlcmlhbCAvLyBVc2UgZGVmYXVsdCBtYXRlcmlhbCBmb3IgY29sbGlzaW9uc1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vIEF0dGFjaCBjdXN0b20gdXNlckRhdGEgdG8gaWRlbnRpZnkgdGhpcyBib2R5IGluIGNvbGxpc2lvbiBldmVudHNcclxuICAgICAgICB0aGlzLmJvZHkudXNlckRhdGEgPSB7IHR5cGU6IEdhbWVPYmplY3RUeXBlLkVORU1ZLCBpbnN0YW5jZTogdGhpcyB9O1xyXG4gICAgICAgIGdhbWUud29ybGQuYWRkQm9keSh0aGlzLmJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgZW5lbXkncyBzdGF0ZSwgaW5jbHVkaW5nIGJhc2ljIEFJIG1vdmVtZW50IGFuZCB2aXN1YWwgc3luY2hyb25pemF0aW9uLlxyXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSBUaW1lIGVsYXBzZWQgc2luY2UgbGFzdCBmcmFtZS5cclxuICAgICAqIEBwYXJhbSBwbGF5ZXJCb2R5IFRoZSBwaHlzaWNzIGJvZHkgb2YgdGhlIHBsYXllciB0byB0YXJnZXQuXHJcbiAgICAgKi9cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlciwgcGxheWVyQm9keTogQ0FOTk9OLkJvZHkpIHtcclxuICAgICAgICBpZiAodGhpcy5pc1BlbmRpbmdEZXN0cm95KSByZXR1cm47IC8vIERvbid0IHVwZGF0ZSBpZiBzY2hlZHVsZWQgZm9yIGRlc3RydWN0aW9uXHJcblxyXG4gICAgICAgIC8vIFNpbXBsZSBBSTogTW92ZSB0b3dhcmRzIHRoZSBwbGF5ZXJcclxuICAgICAgICBjb25zdCBwbGF5ZXJQb3MgPSBwbGF5ZXJCb2R5LnBvc2l0aW9uO1xyXG4gICAgICAgIGNvbnN0IGVuZW15UG9zID0gdGhpcy5ib2R5LnBvc2l0aW9uO1xyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbiA9IG5ldyBDQU5OT04uVmVjMygpO1xyXG4gICAgICAgIHBsYXllclBvcy52c3ViKGVuZW15UG9zLCBkaXJlY3Rpb24pOyAvLyBWZWN0b3IgZnJvbSBlbmVteSB0byBwbGF5ZXJcclxuICAgICAgICBkaXJlY3Rpb24ueSA9IDA7IC8vIE9ubHkgaG9yaXpvbnRhbCBtb3ZlbWVudFxyXG4gICAgICAgIGRpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgdmVsb2NpdHkgdG93YXJkcyB0aGUgcGxheWVyXHJcbiAgICAgICAgY29uc3QgZGVzaXJlZFZlbG9jaXR5ID0gZGlyZWN0aW9uLnNjYWxlKHRoaXMuZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15U3BlZWQpO1xyXG4gICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS54ID0gZGVzaXJlZFZlbG9jaXR5Lng7XHJcbiAgICAgICAgdGhpcy5ib2R5LnZlbG9jaXR5LnogPSBkZXNpcmVkVmVsb2NpdHkuejtcclxuXHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgdmlzdWFsIG1lc2ggd2l0aCBwaHlzaWNzIGJvZHlcclxuICAgICAgICB0aGlzLm1lc2gucG9zaXRpb24uY29weSh0aGlzLmJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICAvLyBPcmllbnQgZW5lbXkgdG8gbG9vayBhdCBwbGF5ZXIgKG9ubHkgWSByb3RhdGlvbilcclxuICAgICAgICBjb25zdCBsb29rQXRWZWMgPSBuZXcgVEhSRUUuVmVjdG9yMyhwbGF5ZXJQb3MueCwgZW5lbXlQb3MueSwgcGxheWVyUG9zLnopO1xyXG4gICAgICAgIHRoaXMubWVzaC5sb29rQXQobG9va0F0VmVjKTtcclxuICAgICAgICB0aGlzLm1lc2gucm90YXRpb24ueCA9IDA7IC8vIEtlZXAgaG9yaXpvbnRhbFxyXG4gICAgICAgIHRoaXMubWVzaC5yb3RhdGlvbi56ID0gMDsgLy8gS2VlcCBob3Jpem9udGFsXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWR1Y2VzIHRoZSBlbmVteSdzIGhlYWx0aCBieSB0aGUgZ2l2ZW4gYW1vdW50LiBEZXN0cm95cyB0aGUgZW5lbXkgaWYgaGVhbHRoIGRyb3BzIHRvIDAgb3IgYmVsb3cuXHJcbiAgICAgKiBAcGFyYW0gYW1vdW50IFRoZSBhbW91bnQgb2YgZGFtYWdlIHRvIHRha2UuXHJcbiAgICAgKi9cclxuICAgIHRha2VEYW1hZ2UoYW1vdW50OiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5pc1BlbmRpbmdEZXN0cm95KSByZXR1cm47IC8vIENhbm5vdCB0YWtlIGRhbWFnZSBpZiBhbHJlYWR5IGJlaW5nIGRlc3Ryb3llZFxyXG5cclxuICAgICAgICB0aGlzLmhlYWx0aCAtPSBhbW91bnQ7XHJcbiAgICAgICAgdGhpcy5nYW1lLnNvdW5kcy5nZXQoJ2VuZW15X2hpdF9zb3VuZCcpPy5wbGF5KCkuY2F0Y2goZSA9PiB7fSk7IC8vIFBsYXkgaGl0IHNvdW5kXHJcbiAgICAgICAgaWYgKHRoaXMuaGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5kZXN0cm95KCk7XHJcbiAgICAgICAgICAgIC8vIFRPRE86IEFkZCBzY29yZSwgcGFydGljbGUgZWZmZWN0cywgZXRjLlxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNjaGVkdWxlcyB0aGUgZW5lbXkgZm9yIHJlbW92YWwgZnJvbSB0aGUgZ2FtZS4gQWN0dWFsIHJlbW92YWwgaGFwcGVucyBhZnRlciB0aGUgcGh5c2ljcyBzdGVwLlxyXG4gICAgICovXHJcbiAgICBkZXN0cm95KCkge1xyXG4gICAgICAgIGlmICh0aGlzLmlzUGVuZGluZ0Rlc3Ryb3kpIHJldHVybjsgLy8gUHJldmVudCBtdWx0aXBsZSBhZGRpdGlvbnMgdG8gZGVzdHJveSBsaXN0XHJcbiAgICAgICAgdGhpcy5pc1BlbmRpbmdEZXN0cm95ID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmdhbWUuZW5lbWllc1RvRGVzdHJveS5wdXNoKHRoaXMpOyAvLyBBZGQgdG8gZ2FtZSdzIGRlc3RydWN0aW9uIHF1ZXVlXHJcbiAgICAgICAgdGhpcy5nYW1lLnJlbW92ZUVuZW15KHRoaXMpOyAvLyBSZW1vdmUgZnJvbSBhY3RpdmUgZW5lbWllcyBsaXN0IGltbWVkaWF0ZWx5XHJcbiAgICAgICAgdGhpcy5nYW1lLnNvdW5kcy5nZXQoJ2VuZW15X2RlYXRoX3NvdW5kJyk/LnBsYXkoKS5jYXRjaChlID0+IHt9KTsgLy8gUGxheSBkZWF0aCBzb3VuZFxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGVyZm9ybXMgdGhlIGFjdHVhbCByZW1vdmFsIG9mIHRoZSBlbmVteSdzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkgZnJvbSB0aGUgZ2FtZS5cclxuICAgICAqIFRoaXMgbWV0aG9kIGlzIGNhbGxlZCBieSB0aGUgR2FtZSBjbGFzcyBhZnRlciB0aGUgcGh5c2ljcyBzdGVwLlxyXG4gICAgICovXHJcbiAgICBwZXJmb3JtRGVzdHJveSgpIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNQZW5kaW5nRGVzdHJveSkgcmV0dXJuOyAvLyBTaG91bGQgb25seSBiZSBjYWxsZWQgZm9yIHBlbmRpbmcgZGVzdHJ1Y3Rpb25cclxuICAgICAgICB0aGlzLmdhbWUuc2NlbmUucmVtb3ZlKHRoaXMubWVzaCk7XHJcbiAgICAgICAgdGhpcy5nYW1lLndvcmxkLnJlbW92ZUJvZHkodGhpcy5ib2R5KTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlcHJlc2VudHMgYSBidWxsZXQgcHJvamVjdGlsZSBpbiB0aGUgZ2FtZS5cclxuICogTWFuYWdlcyBpdHMgdmlzdWFsIG1lc2gsIHBoeXNpY3MgYm9keSwgYW5kIGxpZmV0aW1lLlxyXG4gKi9cclxuY2xhc3MgQnVsbGV0IHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhO1xyXG4gICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICBzaG9vdGVyVHlwZTogR2FtZU9iamVjdFR5cGU7XHJcbiAgICBwcml2YXRlIGdhbWU6IEdhbWU7XHJcbiAgICBwcml2YXRlIGxpZmV0aW1lOiBudW1iZXI7IC8vIFRpbWUgcmVtYWluaW5nIHVudGlsIHNlbGYtZGVzdHJ1Y3Rpb25cclxuICAgIHB1YmxpYyByZWFkb25seSBvd25lckJvZHk6IENhbm5vbkJvZHlXaXRoVXNlckRhdGE7IC8vIFRvIGlnbm9yZSBpbml0aWFsIGNvbGxpc2lvbiB3aXRoIHNob290ZXJcclxuICAgIHByaXZhdGUgaXNQZW5kaW5nRGVzdHJveTogYm9vbGVhbiA9IGZhbHNlOyAvLyBGbGFnIHRvIHByZXZlbnQgbXVsdGlwbGUgZGVzdHJveSBjYWxsc1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGdhbWU6IEdhbWUsIHBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzLCBkaXJlY3Rpb246IFRIUkVFLlZlY3RvcjMsIHNwZWVkOiBudW1iZXIsIGRhbWFnZTogbnVtYmVyLCBzaG9vdGVyVHlwZTogR2FtZU9iamVjdFR5cGUsIG93bmVyQm9keTogQ2Fubm9uQm9keVdpdGhVc2VyRGF0YSkge1xyXG4gICAgICAgIHRoaXMuZ2FtZSA9IGdhbWU7XHJcbiAgICAgICAgdGhpcy5kYW1hZ2UgPSBkYW1hZ2U7XHJcbiAgICAgICAgdGhpcy5zaG9vdGVyVHlwZSA9IHNob290ZXJUeXBlO1xyXG4gICAgICAgIHRoaXMubGlmZXRpbWUgPSBnYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0TGlmZXRpbWU7XHJcbiAgICAgICAgdGhpcy5vd25lckJvZHkgPSBvd25lckJvZHk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJ1bGxldFRleHR1cmUgPSBnYW1lLnRleHR1cmVzLmdldCgnYnVsbGV0X3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBidWxsZXRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBidWxsZXRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogYnVsbGV0VGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhmZmZmMDAgLy8gWWVsbG93IGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBidWxsZXRHZW9tZXRyeSA9IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeSgwLjEsIDgsIDgpOyAvLyBTbWFsbCBzcGhlcmUgZm9yIGJ1bGxldFxyXG4gICAgICAgIHRoaXMubWVzaCA9IG5ldyBUSFJFRS5NZXNoKGJ1bGxldEdlb21ldHJ5LCBidWxsZXRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5tZXNoLnBvc2l0aW9uLmNvcHkocG9zaXRpb24pO1xyXG4gICAgICAgIHRoaXMubWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICBnYW1lLnNjZW5lLmFkZCh0aGlzLm1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCBidWxsZXRTaGFwZSA9IG5ldyBDQU5OT04uU3BoZXJlKDAuMSk7IC8vIFNwaGVyZSBwaHlzaWNzIHNoYXBlXHJcbiAgICAgICAgdGhpcy5ib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogMC4xLCAvLyBTbWFsbCBtYXNzLCBzbyBpdCdzIGFmZmVjdGVkIGJ5IHBoeXNpY3MgYnV0IG1vdmVzIGZhc3RcclxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyhwb3NpdGlvbi54LCBwb3NpdGlvbi55LCBwb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgc2hhcGU6IGJ1bGxldFNoYXBlLFxyXG4gICAgICAgICAgICBpc1RyaWdnZXI6IGZhbHNlLCAvLyBGb3IgYWN0dWFsIGNvbGxpc2lvbiByZXNwb25zZVxyXG4gICAgICAgICAgICBtYXRlcmlhbDogZ2FtZS5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgLy8gVXNlIGRlZmF1bHQgbWF0ZXJpYWxcclxuICAgICAgICB9KTtcclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCB2ZWxvY2l0eSBiYXNlZCBvbiBkaXJlY3Rpb24gYW5kIHNwZWVkXHJcbiAgICAgICAgdGhpcy5ib2R5LnZlbG9jaXR5LnNldChkaXJlY3Rpb24ueCAqIHNwZWVkLCBkaXJlY3Rpb24ueSAqIHNwZWVkLCBkaXJlY3Rpb24ueiAqIHNwZWVkKTtcclxuICAgICAgICB0aGlzLmJvZHkuYWxsb3dTbGVlcCA9IGZhbHNlOyAvLyBLZWVwIGJ1bGxldCBhY3RpdmUgZm9yIHBoeXNpY3MgdXBkYXRlc1xyXG5cclxuICAgICAgICAvLyBBdHRhY2ggY3VzdG9tIHVzZXJEYXRhIHRvIGlkZW50aWZ5IHRoaXMgYm9keSBpbiBjb2xsaXNpb24gZXZlbnRzXHJcbiAgICAgICAgdGhpcy5ib2R5LnVzZXJEYXRhID0geyB0eXBlOiBHYW1lT2JqZWN0VHlwZS5CVUxMRVQsIGluc3RhbmNlOiB0aGlzLCBvd25lcjogdGhpcy5vd25lckJvZHkgfTtcclxuICAgICAgICBnYW1lLndvcmxkLmFkZEJvZHkodGhpcy5ib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIGJ1bGxldCdzIHN0YXRlLCBjaGVja2luZyBpdHMgbGlmZXRpbWUgYW5kIHN5bmNocm9uaXppbmcgaXRzIHZpc3VhbCBtZXNoLlxyXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSBUaW1lIGVsYXBzZWQgc2luY2UgbGFzdCBmcmFtZS5cclxuICAgICAqL1xyXG4gICAgdXBkYXRlKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNQZW5kaW5nRGVzdHJveSkgcmV0dXJuOyAvLyBEb24ndCB1cGRhdGUgaWYgc2NoZWR1bGVkIGZvciBkZXN0cnVjdGlvblxyXG5cclxuICAgICAgICB0aGlzLmxpZmV0aW1lIC09IGRlbHRhVGltZTtcclxuICAgICAgICBpZiAodGhpcy5saWZldGltZSA8PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZGVzdHJveSgpOyAvLyBSZW1vdmUgYnVsbGV0IGlmIGl0cyBsaWZldGltZSBleHBpcmVzXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5tZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5ib2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgdGhpcy5tZXNoLnF1YXRlcm5pb24uY29weSh0aGlzLmJvZHkucXVhdGVybmlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlF1YXRlcm5pb24pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2NoZWR1bGVzIHRoZSBidWxsZXQgZm9yIHJlbW92YWwgZnJvbSB0aGUgZ2FtZS4gQWN0dWFsIHJlbW92YWwgaGFwcGVucyBhZnRlciB0aGUgcGh5c2ljcyBzdGVwLlxyXG4gICAgICovXHJcbiAgICBkZXN0cm95KCkge1xyXG4gICAgICAgIGlmICh0aGlzLmlzUGVuZGluZ0Rlc3Ryb3kpIHJldHVybjsgLy8gUHJldmVudCBtdWx0aXBsZSBhZGRpdGlvbnMgdG8gZGVzdHJveSBsaXN0XHJcbiAgICAgICAgdGhpcy5pc1BlbmRpbmdEZXN0cm95ID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmdhbWUuYnVsbGV0c1RvRGVzdHJveS5wdXNoKHRoaXMpOyAvLyBBZGQgdG8gZ2FtZSdzIGRlc3RydWN0aW9uIHF1ZXVlXHJcbiAgICAgICAgdGhpcy5nYW1lLnJlbW92ZUJ1bGxldCh0aGlzKTsgLy8gTm90aWZ5IEdhbWUgY2xhc3MgdG8gcmVtb3ZlIGZyb20gaXRzIGxpc3QgKGZyb20gYWN0aXZlIGFycmF5KVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUGVyZm9ybXMgdGhlIGFjdHVhbCByZW1vdmFsIG9mIHRoZSBidWxsZXQncyB2aXN1YWwgbWVzaCBhbmQgcGh5c2ljcyBib2R5IGZyb20gdGhlIGdhbWUuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYnkgdGhlIEdhbWUgY2xhc3MgYWZ0ZXIgdGhlIHBoeXNpY3Mgc3RlcC5cclxuICAgICAqL1xyXG4gICAgcGVyZm9ybURlc3Ryb3koKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUGVuZGluZ0Rlc3Ryb3kpIHJldHVybjsgLy8gU2hvdWxkIG9ubHkgYmUgY2FsbGVkIGZvciBwZW5kaW5nIGRlc3RydWN0aW9uXHJcbiAgICAgICAgdGhpcy5nYW1lLnNjZW5lLnJlbW92ZSh0aGlzLm1lc2gpO1xyXG4gICAgICAgIHRoaXMuZ2FtZS53b3JsZC5yZW1vdmVCb2R5KHRoaXMuYm9keSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIGNvbmZpZyE6IEdhbWVDb25maWc7IC8vIEdhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuICAgIHByaXZhdGUgc3RhdGU6IEdhbWVTdGF0ZSA9IEdhbWVTdGF0ZS5USVRMRTsgLy8gQ3VycmVudCBzdGF0ZSBvZiB0aGUgZ2FtZVxyXG5cclxuICAgIC8vIFRocmVlLmpzIGVsZW1lbnRzIGZvciByZW5kZXJpbmdcclxuICAgIHNjZW5lITogVEhSRUUuU2NlbmU7XHJcbiAgICBwcml2YXRlIGNhbWVyYSE6IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhO1xyXG4gICAgcHJpdmF0ZSByZW5kZXJlciE6IFRIUkVFLldlYkdMUmVuZGVyZXI7XHJcbiAgICBwcml2YXRlIGNhbnZhcyE6IEhUTUxDYW52YXNFbGVtZW50OyAvLyBUaGUgSFRNTCBjYW52YXMgZWxlbWVudCBmb3IgcmVuZGVyaW5nXHJcbiAgICBwcml2YXRlIGNhbWVyYUNvbnRhaW5lciE6IFRIUkVFLk9iamVjdDNEOyAvLyBDb250YWluZXIgZm9yIGNhbWVyYSB0byBoYW5kbGUgeWF3IHNlcGFyYXRlbHlcclxuXHJcbiAgICAvLyBDYW5ub24tZXMgZWxlbWVudHMgZm9yIHBoeXNpY3NcclxuICAgIHdvcmxkITogQ0FOTk9OLldvcmxkO1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJCb2R5ITogQ2Fubm9uQm9keVdpdGhVc2VyRGF0YTsgLy8gUGh5c2ljcyBib2R5IGZvciB0aGUgcGxheWVyXHJcbiAgICBwcml2YXRlIGdyb3VuZEJvZHkhOiBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhOyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBDYW5ub24tZXMgbWF0ZXJpYWxzIGZvciBwaHlzaWNzXHJcbiAgICBwcml2YXRlIHBsYXllck1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBncm91bmRNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDtcclxuICAgIGRlZmF1bHRPYmplY3RNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDsgLy8gTWF0ZXJpYWwgZm9yIGdlbmVyaWMgcGxhY2VkIG9iamVjdHMsIGFsc28gdXNlZCBieSBlbmVtaWVzL2J1bGxldHNcclxuXHJcbiAgICAvLyBWaXN1YWwgbWVzaGVzIChUaHJlZS5qcykgZm9yIGdhbWUgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBwbGF5ZXJNZXNoITogVEhSRUUuTWVzaDtcclxuICAgIHByaXZhdGUgZ3JvdW5kTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdE1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdEJvZGllczogQ2Fubm9uQm9keVdpdGhVc2VyRGF0YVtdID0gW107XHJcblxyXG4gICAgLy8gTkVXOiBHYW1lIGVudGl0aWVzIChlbmVtaWVzIGFuZCBidWxsZXRzKVxyXG4gICAgZW5lbWllczogRW5lbXlbXSA9IFtdO1xyXG4gICAgYnVsbGV0czogQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgbGFzdEVuZW15U3Bhd25UaW1lOiBudW1iZXIgPSAwOyAvLyBUaW1lciBmb3IgZW5lbXkgc3Bhd25pbmdcclxuICAgIHByaXZhdGUgbGFzdEZpcmVUaW1lOiBudW1iZXIgPSAwOyAgICAgICAvLyBUaW1lciBmb3IgcGxheWVyJ3MgZmlyZSByYXRlXHJcblxyXG4gICAgLy8gRGVmZXJyZWQgZGVzdHJ1Y3Rpb24gcXVldWVzXHJcbiAgICBidWxsZXRzVG9EZXN0cm95OiBCdWxsZXRbXSA9IFtdOyAvLyBCdWxsZXRzIHRvIGJlIGRlc3Ryb3llZCBhZnRlciBwaHlzaWNzIHN0ZXBcclxuICAgIGVuZW1pZXNUb0Rlc3Ryb3k6IEVuZW15W10gPSBbXTsgLy8gRW5lbWllcyB0byBiZSBkZXN0cm95ZWQgYWZ0ZXIgcGh5c2ljcyBzdGVwXHJcblxyXG4gICAgLy8gSW5wdXQgaGFuZGxpbmcgc3RhdGVcclxuICAgIHByaXZhdGUga2V5czogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSB7fTsgLy8gVHJhY2tzIGN1cnJlbnRseSBwcmVzc2VkIGtleXNcclxuICAgIHByaXZhdGUgaXNQb2ludGVyTG9ja2VkOiBib29sZWFuID0gZmFsc2U7IC8vIFRydWUgaWYgbW91c2UgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgIHByaXZhdGUgY2FtZXJhUGl0Y2g6IG51bWJlciA9IDA7IC8vIFZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgb2YgdGhlIGNhbWVyYVxyXG5cclxuICAgIC8vIEFzc2V0IG1hbmFnZW1lbnRcclxuICAgIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCB0ZXh0dXJlc1xyXG4gICAgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50PiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCBhdWRpbyBlbGVtZW50c1xyXG5cclxuICAgIC8vIFVJIGVsZW1lbnRzIChkeW5hbWljYWxseSBjcmVhdGVkIGZvciB0aGUgdGl0bGUgc2NyZWVuKVxyXG4gICAgcHJpdmF0ZSB0aXRsZVNjcmVlbk92ZXJsYXkhOiBIVE1MRGl2RWxlbWVudDtcclxuICAgIHByaXZhdGUgdGl0bGVUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHByb21wdFRleHQhOiBIVE1MRGl2RWxlbWVudDtcclxuXHJcbiAgICAvLyBGb3IgY2FsY3VsYXRpbmcgZGVsdGEgdGltZSBiZXR3ZWVuIGZyYW1lc1xyXG4gICAgcHJpdmF0ZSBsYXN0VGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCA9IDA7XHJcblxyXG4gICAgLy8gVHJhY2tzIHBsYXllciBjb250YWN0cyB3aXRoIEFOWSBzdGF0aWMgc3VyZmFjZSAoZ3JvdW5kIG9yIHBsYWNlZCBvYmplY3RzKSBmb3IganVtcGluZy9tb3ZlbWVudCBsb2dpY1xyXG4gICAgcHJpdmF0ZSBudW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlczogbnVtYmVyID0gMDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICAvLyBHZXQgdGhlIGNhbnZhcyBlbGVtZW50IGZyb20gaW5kZXguaHRtbFxyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbnZhcyBlbGVtZW50IHdpdGggSUQgXCJnYW1lQ2FudmFzXCIgbm90IGZvdW5kIScpO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIENhbm5vdCBwcm9jZWVkIHdpdGhvdXQgYSBjYW52YXNcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pbml0KCk7IC8vIFN0YXJ0IHRoZSBhc3luY2hyb25vdXMgaW5pdGlhbGl6YXRpb24gcHJvY2Vzc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXN5bmNocm9ub3VzbHkgaW5pdGlhbGl6ZXMgdGhlIGdhbWUsIGxvYWRpbmcgY29uZmlnLCBhc3NldHMsIGFuZCBzZXR0aW5nIHVwIHN5c3RlbXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICAvLyAxLiBMb2FkIGdhbWUgY29uZmlndXJhdGlvbiBmcm9tIGRhdGEuanNvblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkOicsIHRoaXMuY29uZmlnKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb246JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBJZiBjb25maWd1cmF0aW9uIGZhaWxzIHRvIGxvYWQsIGRpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBhbmQgc3RvcC5cclxuICAgICAgICAgICAgY29uc3QgZXJyb3JEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50b3AgPSAnNTAlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUubGVmdCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50cmFuc2Zvcm0gPSAndHJhbnNsYXRlKC01MCUsIC01MCUpJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuY29sb3IgPSAncmVkJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuZm9udFNpemUgPSAnMjRweCc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnRleHRDb250ZW50ID0gJ0Vycm9yOiBGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24uIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuJztcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIDIuIEluaXRpYWxpemUgVGhyZWUuanMgKHNjZW5lLCBjYW1lcmEsIHJlbmRlcmVyKVxyXG4gICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcclxuICAgICAgICAgICAgNzUsIC8vIEZpZWxkIG9mIFZpZXcgKEZPVilcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQsIC8vIEZpeGVkIEFzcGVjdCByYXRpbyBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhTmVhciwgLy8gTmVhciBjbGlwcGluZyBwbGFuZVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhRmFyICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IHRoaXMuY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZm9yIGJldHRlciByZWFsaXNtXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7IC8vIFVzZSBzb2Z0IHNoYWRvd3NcclxuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmNhbWVyYUNvbnRhaW5lcik7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIuYWRkKHRoaXMuY2FtZXJhKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi55ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUhlaWdodE9mZnNldDtcclxuXHJcblxyXG4gICAgICAgIC8vIDMuIEluaXRpYWxpemUgQ2Fubm9uLWVzIChwaHlzaWNzIHdvcmxkKVxyXG4gICAgICAgIHRoaXMud29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5ncmF2aXR5LnNldCgwLCAtOS44MiwgMCk7IC8vIFNldCBzdGFuZGFyZCBFYXJ0aCBncmF2aXR5IChZLWF4aXMgZG93bilcclxuICAgICAgICB0aGlzLndvcmxkLmJyb2FkcGhhc2UgPSBuZXcgQ0FOTk9OLlNBUEJyb2FkcGhhc2UodGhpcy53b3JsZCk7IC8vIFVzZSBhbiBlZmZpY2llbnQgYnJvYWRwaGFzZSBhbGdvcml0aG1cclxuICAgICAgICAodGhpcy53b3JsZC5zb2x2ZXIgYXMgQ0FOTk9OLkdTU29sdmVyKS5pdGVyYXRpb25zID0gMTA7IC8vIEluY3JlYXNlIHNvbHZlciBpdGVyYXRpb25zIGZvciBiZXR0ZXIgc3RhYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBDYW5ub24uanMgTWF0ZXJpYWxzIGFuZCBDb250YWN0TWF0ZXJpYWwgZm9yIHBsYXllci1ncm91bmQgaW50ZXJhY3Rpb25cclxuICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgncGxheWVyTWF0ZXJpYWwnKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZ3JvdW5kTWF0ZXJpYWwnKTtcclxuICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2RlZmF1bHRPYmplY3RNYXRlcmlhbCcpOyAvLyBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0cywgZW5lbWllcywgYnVsbGV0c1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAgeyBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCByZXN0aXR1dGlvbjogMC4wIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKHBsYXllckdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllck9iamVjdENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAgeyBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCByZXN0aXR1dGlvbjogMC4wIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKHBsYXllck9iamVjdENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIGNvbnN0IG9iamVjdEdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAgeyBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCByZXN0aXR1dGlvbjogMC4wIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKG9iamVjdEdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIEFEREVEOiBPYmplY3QtT2JqZWN0IGNvbnRhY3QgbWF0ZXJpYWwgKGUuZy4sIGVuZW15LWVuZW15LCBlbmVteS1wbGFjZWQgb2JqZWN0LCBidWxsZXQtb2JqZWN0KVxyXG4gICAgICAgIGNvbnN0IG9iamVjdE9iamVjdENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHsgZnJpY3Rpb246IDAuMSwgcmVzdGl0dXRpb246IDAuMSB9IC8vIFNtYWxsIGZyaWN0aW9uL3Jlc3RpdHV0aW9uIGZvciBnZW5lcmljIG9iamVjdHNcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKG9iamVjdE9iamVjdENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG5cclxuICAgICAgICAvLyA0LiBMb2FkIGFzc2V0cyAodGV4dHVyZXMgYW5kIHNvdW5kcylcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgLy8gNS4gQ3JlYXRlIGdhbWUgb2JqZWN0cyAocGxheWVyLCBncm91bmQsIGFuZCBvdGhlciBvYmplY3RzKSBhbmQgbGlnaHRpbmdcclxuICAgICAgICB0aGlzLmNyZWF0ZUdyb3VuZCgpO1xyXG4gICAgICAgIHRoaXMuY3JlYXRlUGxheWVyKCk7XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGFjZWRPYmplY3RzKCk7XHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogU2V0dXAgQ2Fubm9uLWVzIGNvbnRhY3QgbGlzdGVuZXJzIGZvciBjb2xsaXNpb24gZGV0ZWN0aW9uXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdiZWdpbkNvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYm9keUEgPSBldmVudC5ib2R5QSBhcyBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhO1xyXG4gICAgICAgICAgICBjb25zdCBib2R5QiA9IGV2ZW50LmJvZHlCIGFzIENhbm5vbkJvZHlXaXRoVXNlckRhdGE7XHJcblxyXG4gICAgICAgICAgICAvLyBIYW5kbGUgcGxheWVyLXN0YXRpYyBzdXJmYWNlIGNvbnRhY3RzIChmb3IganVtcGluZy9tb3ZlbWVudCBsb2dpYylcclxuICAgICAgICAgICAgaWYgKGJvZHlBLnVzZXJEYXRhPy50eXBlID09PSBHYW1lT2JqZWN0VHlwZS5QTEFZRVIgfHwgYm9keUIudXNlckRhdGE/LnR5cGUgPT09IEdhbWVPYmplY3RUeXBlLlBMQVlFUikge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3RoZXJCb2R5ID0gYm9keUEudXNlckRhdGE/LnR5cGUgPT09IEdhbWVPYmplY3RUeXBlLlBMQVlFUiA/IGJvZHlCIDogYm9keUE7XHJcbiAgICAgICAgICAgICAgICBpZiAob3RoZXJCb2R5LnVzZXJEYXRhICYmIG90aGVyQm9keS51c2VyRGF0YS50eXBlID09PSBHYW1lT2JqZWN0VHlwZS5TVEFUSUNfT0JKRUNUKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcysrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBIYW5kbGUgYnVsbGV0IGNvbGxpc2lvbnNcclxuICAgICAgICAgICAgbGV0IGJ1bGxldEluc3RhbmNlOiBCdWxsZXQgfCB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIGxldCB0YXJnZXRCb2R5OiBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhIHwgdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIHdoaWNoIGJvZHkgaXMgdGhlIGJ1bGxldCBhbmQgd2hpY2ggaXMgdGhlIHRhcmdldFxyXG4gICAgICAgICAgICBpZiAoYm9keUEudXNlckRhdGE/LnR5cGUgPT09IEdhbWVPYmplY3RUeXBlLkJVTExFVCkge1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0SW5zdGFuY2UgPSBib2R5QS51c2VyRGF0YS5pbnN0YW5jZSBhcyBCdWxsZXQ7XHJcbiAgICAgICAgICAgICAgICB0YXJnZXRCb2R5ID0gYm9keUI7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYm9keUIudXNlckRhdGE/LnR5cGUgPT09IEdhbWVPYmplY3RUeXBlLkJVTExFVCkge1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0SW5zdGFuY2UgPSBib2R5Qi51c2VyRGF0YS5pbnN0YW5jZSBhcyBCdWxsZXQ7XHJcbiAgICAgICAgICAgICAgICB0YXJnZXRCb2R5ID0gYm9keUE7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChidWxsZXRJbnN0YW5jZSAmJiB0YXJnZXRCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBJZ25vcmUgY29sbGlzaW9uIHdpdGggdGhlIG93bmVyIG9mIHRoZSBidWxsZXQgaW1tZWRpYXRlbHkgYWZ0ZXIgZmlyaW5nXHJcbiAgICAgICAgICAgICAgICAvLyBUaGUgb3duZXJCb2R5IHByb3BlcnR5IHdhcyBjaGFuZ2VkIGZyb20gcHJpdmF0ZSB0byBwdWJsaWMgZm9yIHRoaXMgYWNjZXNzLlxyXG4gICAgICAgICAgICAgICAgaWYgKGJ1bGxldEluc3RhbmNlLm93bmVyQm9keSA9PT0gdGFyZ2V0Qm9keSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKHRhcmdldEJvZHkudXNlckRhdGE/LnR5cGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjYXNlIEdhbWVPYmplY3RUeXBlLkVORU1ZOlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBlbmVteUluc3RhbmNlID0gdGFyZ2V0Qm9keS51c2VyRGF0YS5pbnN0YW5jZSBhcyBFbmVteTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZW5lbXlJbnN0YW5jZS50YWtlRGFtYWdlKGJ1bGxldEluc3RhbmNlLmRhbWFnZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJ1bGxldEluc3RhbmNlLmRlc3Ryb3koKTsgLy8gU2NoZWR1bGUgYnVsbGV0IGZvciBkZXN0cnVjdGlvbiBhZnRlciBoaXR0aW5nIGVuZW15XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgR2FtZU9iamVjdFR5cGUuU1RBVElDX09CSkVDVDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnVsbGV0SW5zdGFuY2UuZGVzdHJveSgpOyAvLyBTY2hlZHVsZSBidWxsZXQgZm9yIGRlc3RydWN0aW9uIGFmdGVyIGhpdHRpbmcgc3RhdGljIGVudmlyb25tZW50XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IEhhbmRsZSBidWxsZXQtcGxheWVyIGNvbGxpc2lvbiBpZiBlbmVteSBzaG9vdGluZyBpcyBpbXBsZW1lbnRlZFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMud29ybGQuYWRkRXZlbnRMaXN0ZW5lcignZW5kQ29udGFjdCcsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBib2R5QSA9IGV2ZW50LmJvZHlBIGFzIENhbm5vbkJvZHlXaXRoVXNlckRhdGE7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHlCID0gZXZlbnQuYm9keUIgYXMgQ2Fubm9uQm9keVdpdGhVc2VyRGF0YTtcclxuXHJcbiAgICAgICAgICAgIGlmIChib2R5QS51c2VyRGF0YT8udHlwZSA9PT0gR2FtZU9iamVjdFR5cGUuUExBWUVSIHx8IGJvZHlCLnVzZXJEYXRhPy50eXBlID09PSBHYW1lT2JqZWN0VHlwZS5QTEFZRVIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG90aGVyQm9keSA9IGJvZHlBLnVzZXJEYXRhPy50eXBlID09PSBHYW1lT2JqZWN0VHlwZS5QTEFZRVIgPyBib2R5QiA6IGJvZHlBO1xyXG4gICAgICAgICAgICAgICAgaWYgKG90aGVyQm9keS51c2VyRGF0YSAmJiBvdGhlckJvZHkudXNlckRhdGEudHlwZSA9PT0gR2FtZU9iamVjdFR5cGUuU1RBVElDX09CSkVDVCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPSBNYXRoLm1heCgwLCB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzIC0gMSk7IC8vIEVuc3VyZSBpdCBkb2Vzbid0IGdvIGJlbG93IDBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyA3LiBTZXR1cCBldmVudCBsaXN0ZW5lcnMgZm9yIHVzZXIgaW5wdXQgYW5kIHdpbmRvdyByZXNpemluZ1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCB0aGlzLm9uV2luZG93UmVzaXplLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLm9uS2V5RG93bi5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMub25LZXlVcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm9uTW91c2VNb3ZlLmJpbmQodGhpcykpOyAvLyBGb3IgbW91c2UgbG9va1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMub25Nb3VzZURvd24uYmluZCh0aGlzKSk7IC8vIEZvciBtb3VzZSBjbGljayAoc2hvb3RpbmcpXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHRoaXMub25Nb3VzZVVwLmJpbmQodGhpcykpOyAgICAgLy8gRm9yIG1vdXNlIGNsaWNrIChzaG9vdGluZylcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaW5pdGlhbCBmaXhlZCBhc3BlY3QgcmF0aW8gYW5kIGNlbnRlciB0aGUgY2FudmFzXHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTtcclxuXHJcbiAgICAgICAgLy8gOC4gU2V0dXAgdGhlIHRpdGxlIHNjcmVlbiBVSVxyXG4gICAgICAgIHRoaXMuc2V0dXBUaXRsZVNjcmVlbigpO1xyXG5cclxuICAgICAgICAvLyBTdGFydCB0aGUgbWFpbiBnYW1lIGxvb3BcclxuICAgICAgICB0aGlzLmFuaW1hdGUoMCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMb2FkcyBhbGwgdGV4dHVyZXMgYW5kIHNvdW5kcyBkZWZpbmVkIGluIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpIHtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4odGV4dHVyZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlcy5zZXQoaW1nLm5hbWUsIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lID09PSAnZ3JvdW5kX3RleHR1cmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLnJlcGVhdC5zZXQodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1LCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmU6ICR7aW1nLnBhdGh9YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzb3VuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb29wID0gKHNvdW5kLm5hbWUgPT09ICdiYWNrZ3JvdW5kX211c2ljJyk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChzb3VuZC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c291bmQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQXNzZXRzIGxvYWRlZDogJHt0aGlzLnRleHR1cmVzLnNpemV9IHRleHR1cmVzLCAke3RoaXMuc291bmRzLnNpemV9IHNvdW5kcy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGRpc3BsYXlzIHRoZSB0aXRsZSBzY3JlZW4gVUkgZHluYW1pY2FsbHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJ3JnYmEoMCwgMCwgMCwgMC44KScsXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JywgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXHJcbiAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgYWxpZ25JdGVtczogJ2NlbnRlcicsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnd2hpdGUnLCBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzQ4cHgnLCB0ZXh0QWxpZ246ICdjZW50ZXInLCB6SW5kZXg6ICcxMDAwJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG5cclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpO1xyXG5cclxuICAgICAgICB0aGlzLnRpdGxlVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnRpdGxlU2NyZWVuVGV4dDtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlVGV4dCk7XHJcblxyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zdGFydEdhbWVQcm9tcHQ7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnByb21wdFRleHQuc3R5bGUsIHtcclxuICAgICAgICAgICAgbWFyZ2luVG9wOiAnMjBweCcsIGZvbnRTaXplOiAnMjRweCdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnByb21wdFRleHQpO1xyXG5cclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuc3RhcnRHYW1lKCkpO1xyXG5cclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBkZW5pZWQgKHJlcXVpcmVzIHVzZXIgZ2VzdHVyZSk6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyYW5zaXRpb25zIHRoZSBnYW1lIGZyb20gdGhlIHRpdGxlIHNjcmVlbiB0byB0aGUgcGxheWluZyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIGlmICh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSAmJiB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5wYXJlbnROb2RlKSB7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlci5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZmFpbGVkIGFmdGVyIHVzZXIgZ2VzdHVyZTpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBjbGlja3Mgb24gdGhlIGNhbnZhcyB0byByZS1sb2NrIHRoZSBwb2ludGVyIGlmIHRoZSBnYW1lIGlzIHBsYXlpbmcgYW5kIHVubG9ja2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmICF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIHRoZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBhbmQgcGh5c2ljcyBib2R5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYXllcigpIHtcclxuICAgICAgICBjb25zdCBwbGF5ZXJUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ3BsYXllcl90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogcGxheWVyVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IHBsYXllclRleHR1cmUgPyAweGZmZmZmZiA6IDB4MDA3N2ZmXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSwgMiwgMSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSA9IDU7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMucGxheWVyTWVzaCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllclNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKDAuNSwgMSwgMC41KSk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllck1hc3MsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzModGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLngsIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBwbGF5ZXJTaGFwZSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMucGxheWVyTWF0ZXJpYWxcclxuICAgICAgICB9KSBhcyBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhOyAvLyBDYXN0IHRvIGluY2x1ZGUgdXNlckRhdGFcclxuICAgICAgICB0aGlzLnBsYXllckJvZHkudXNlckRhdGEgPSB7IHR5cGU6IEdhbWVPYmplY3RUeXBlLlBMQVlFUiwgaW5zdGFuY2U6IHRoaXMucGxheWVyQm9keSB9OyAvLyBJZGVudGlmeSBwbGF5ZXIgYm9keVxyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgZ3JvdW5kJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVHcm91bmQoKSB7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdncm91bmRfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZE1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IGdyb3VuZFRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBncm91bmRUZXh0dXJlID8gMHhmZmZmZmYgOiAweDg4ODg4OFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZEdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmdyb3VuZE1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLFxyXG4gICAgICAgICAgICBzaGFwZTogZ3JvdW5kU2hhcGUsXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLmdyb3VuZE1hdGVyaWFsXHJcbiAgICAgICAgfSkgYXMgQ2Fubm9uQm9keVdpdGhVc2VyRGF0YTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkudXNlckRhdGEgPSB7IHR5cGU6IEdhbWVPYmplY3RUeXBlLlNUQVRJQ19PQkpFQ1QgfTsgLy8gSWRlbnRpZnkgZ3JvdW5kIGJvZHlcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygxLCAwLCAwKSwgLU1hdGguUEkgLyAyKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5ncm91bmRCb2R5KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdmlzdWFsIG1lc2hlcyBhbmQgcGh5c2ljcyBib2RpZXMgZm9yIGFsbCBvYmplY3RzIGRlZmluZWQgaW4gY29uZmlnLmdhbWVTZXR0aW5ncy5wbGFjZWRPYmplY3RzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYWNlZE9iamVjdHMoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxhY2VkT2JqZWN0cykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBwbGFjZWRPYmplY3RzIGRlZmluZWQgaW4gZ2FtZVNldHRpbmdzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYWNlZE9iamVjdHMuZm9yRWFjaChvYmpDb25maWcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQob2JqQ29uZmlnLnRleHR1cmVOYW1lKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBtYXA6IHRleHR1cmUsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhhYWFhYWFcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0LCBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICBtZXNoLnBvc2l0aW9uLnNldChvYmpDb25maWcucG9zaXRpb24ueCwgb2JqQ29uZmlnLnBvc2l0aW9uLnksIG9iakNvbmZpZy5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ID0gb2JqQ29uZmlnLnJvdGF0aW9uWTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RNZXNoZXMucHVzaChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKFxyXG4gICAgICAgICAgICAgICAgb2JqQ29uZmlnLmRpbWVuc2lvbnMud2lkdGggLyAyLFxyXG4gICAgICAgICAgICAgICAgb2JqQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0IC8gMixcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLmRlcHRoIC8gMlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgY29uc3QgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgICAgICBtYXNzOiBvYmpDb25maWcubWFzcyxcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgICAgICBzaGFwZTogc2hhcGUsXHJcbiAgICAgICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWxcclxuICAgICAgICAgICAgfSkgYXMgQ2Fubm9uQm9keVdpdGhVc2VyRGF0YTsgLy8gQ2FzdCB0byBpbmNsdWRlIHVzZXJEYXRhXHJcbiAgICAgICAgICAgIGJvZHkudXNlckRhdGEgPSB7IHR5cGU6IEdhbWVPYmplY3RUeXBlLlNUQVRJQ19PQkpFQ1QgfTsgLy8gSWRlbnRpZnkgcGxhY2VkIG9iamVjdCBib2R5XHJcbiAgICAgICAgICAgIGlmIChvYmpDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygwLCAxLCAwKSwgb2JqQ29uZmlnLnJvdGF0aW9uWSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJvZHkpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYWNlZE9iamVjdEJvZGllcy5wdXNoKGJvZHkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBDcmVhdGVkICR7dGhpcy5wbGFjZWRPYmplY3RNZXNoZXMubGVuZ3RofSBwbGFjZWQgb2JqZWN0cy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgYW1iaWVudCBhbmQgZGlyZWN0aW9uYWwgbGlnaHRpbmcgaW4gdGhlIHNjZW5lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwTGlnaHRpbmcoKSB7XHJcbiAgICAgICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweDQwNDA0MCwgMS4wKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChhbWJpZW50TGlnaHQpO1xyXG5cclxuICAgICAgICBjb25zdCBkaXJlY3Rpb25hbExpZ2h0ID0gbmV3IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQoMHhmZmZmZmYsIDAuOCk7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5wb3NpdGlvbi5zZXQoNSwgMTAsIDUpO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS53aWR0aCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS5oZWlnaHQgPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5uZWFyID0gMC41O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5mYXIgPSA1MDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubGVmdCA9IC0xMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEudG9wID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmJvdHRvbSA9IC0xMDtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChkaXJlY3Rpb25hbExpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgd2luZG93IHJlc2l6aW5nIHRvIGtlZXAgdGhlIGNhbWVyYSBhc3BlY3QgcmF0aW8gYW5kIHJlbmRlcmVyIHNpemUgY29ycmVjdC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbldpbmRvd1Jlc2l6ZSgpIHtcclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXBwbGllcyB0aGUgY29uZmlndXJlZCBmaXhlZCBhc3BlY3QgcmF0aW8gdG8gdGhlIHJlbmRlcmVyIGFuZCBjYW1lcmEsXHJcbiAgICAgKiByZXNpemluZyBhbmQgY2VudGVyaW5nIHRoZSBjYW52YXMgdG8gZml0IHdpdGhpbiB0aGUgd2luZG93LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXRBc3BlY3RSYXRpbyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLndpZHRoIC8gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8uaGVpZ2h0O1xyXG5cclxuICAgICAgICBsZXQgbmV3V2lkdGg6IG51bWJlcjtcclxuICAgICAgICBsZXQgbmV3SGVpZ2h0OiBudW1iZXI7XHJcblxyXG4gICAgICAgIGNvbnN0IHdpbmRvd1dpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICAgICAgY29uc3Qgd2luZG93SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRXaW5kb3dBc3BlY3RSYXRpbyA9IHdpbmRvd1dpZHRoIC8gd2luZG93SGVpZ2h0O1xyXG5cclxuICAgICAgICBpZiAoY3VycmVudFdpbmRvd0FzcGVjdFJhdGlvID4gdGFyZ2V0QXNwZWN0UmF0aW8pIHtcclxuICAgICAgICAgICAgbmV3SGVpZ2h0ID0gd2luZG93SGVpZ2h0O1xyXG4gICAgICAgICAgICBuZXdXaWR0aCA9IG5ld0hlaWdodCAqIHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIG5ld1dpZHRoID0gd2luZG93V2lkdGg7XHJcbiAgICAgICAgICAgIG5ld0hlaWdodCA9IG5ld1dpZHRoIC8gdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUobmV3V2lkdGgsIG5ld0hlaWdodCwgZmFsc2UpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuXHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLmNhbnZhcy5zdHlsZSwge1xyXG4gICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgb2JqZWN0Rml0OiAnY29udGFpbidcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSAmJiB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSkge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIGxlZnQ6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcHJlc3NlZCBkb3duLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSB0cnVlO1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICcgJykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJKdW1wKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSByZWxlYXNlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyBtb3VzZSBidXR0b24gcHJlc3Mgc3RhdGUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmJ1dHRvbiA9PT0gMCkgeyAvLyBMZWZ0IG1vdXNlIGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgdGhpcy5rZXlzWydtb3VzZTAnXSA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIG1vdXNlIGJ1dHRvbiByZWxlYXNlIHN0YXRlLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uTW91c2VVcChldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIGlmIChldmVudC5idXR0b24gPT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy5rZXlzWydtb3VzZTAnXSA9IGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgbW91c2UgbW92ZW1lbnQgZm9yIGNhbWVyYSByb3RhdGlvbiAobW91c2UgbG9vaykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZU1vdmUoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRYID0gZXZlbnQubW92ZW1lbnRYIHx8IDA7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WSA9IGV2ZW50Lm1vdmVtZW50WSB8fCAwO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucm90YXRpb24ueSAtPSBtb3ZlbWVudFggKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTtcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCAtPSBtb3ZlbWVudFkgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTtcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCA9IE1hdGgubWF4KC1NYXRoLlBJIC8gMiwgTWF0aC5taW4oTWF0aC5QSSAvIDIsIHRoaXMuY2FtZXJhUGl0Y2gpKTtcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEucm90YXRpb24ueCA9IHRoaXMuY2FtZXJhUGl0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcG9pbnRlciBsb2NrIHN0YXR1cyB3aGVuIGl0IGNoYW5nZXMgKGUuZy4sIHVzZXIgcHJlc3NlcyBFc2MpLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uUG9pbnRlckxvY2tDaGFuZ2UoKSB7XHJcbiAgICAgICAgaWYgKGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkubW96UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS53ZWJraXRQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgbG9ja2VkJyk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgdW5sb2NrZWQnKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUaGUgbWFpbiBnYW1lIGxvb3AsIGNhbGxlZCBvbiBldmVyeSBhbmltYXRpb24gZnJhbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYW5pbWF0ZSh0aW1lOiBET01IaWdoUmVzVGltZVN0YW1wKSB7XHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gKHRpbWUgLSB0aGlzLmxhc3RUaW1lKSAvIDEwMDA7XHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHRpbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXllckFjdGlvbnMoZGVsdGFUaW1lKTsgLy8gTkVXOiBIYW5kbGVzIHBsYXllciBtb3ZlbWVudCBhbmQgc2hvb3RpbmdcclxuICAgICAgICAgICAgdGhpcy5zcGF3bkVuZW1pZXMoZGVsdGFUaW1lKTsgICAgICAgIC8vIE5FVzogSGFuZGxlcyBlbmVteSBzcGF3bmluZ1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUVudGl0aWVzKGRlbHRhVGltZSk7ICAgICAgLy8gTkVXOiBVcGRhdGVzIGFsbCBlbmVtaWVzIGFuZCBidWxsZXRzXHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGh5c2ljcyhkZWx0YVRpbWUpO1xyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NEZXN0cm95UXVldWUoKTsgICAgICAgICAgLy8gTkVXOiBQcm9jZXNzIGRlZmVycmVkIGRlc3RydWN0aW9ucyBhZnRlciBwaHlzaWNzXHJcbiAgICAgICAgICAgIHRoaXMuY2xhbXBQbGF5ZXJQb3NpdGlvbigpO1xyXG4gICAgICAgICAgICB0aGlzLnN5bmNNZXNoZXNXaXRoQm9kaWVzKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCB0aGlzLmNhbWVyYSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdGVwcyB0aGUgQ2Fubm9uLmpzIHBoeXNpY3Mgd29ybGQgZm9yd2FyZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQaHlzaWNzKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubWF4UGh5c2ljc1N1YlN0ZXBzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFByb2Nlc3NlcyBhbnkgZ2FtZSBvYmplY3RzIChidWxsZXRzLCBlbmVtaWVzKSB0aGF0IGhhdmUgYmVlbiBtYXJrZWQgZm9yIGRlc3RydWN0aW9uLlxyXG4gICAgICogVGhpcyBpcyBkb25lIGFmdGVyIHRoZSBwaHlzaWNzIHN0ZXAgdG8gYXZvaWQgbW9kaWZ5aW5nIHRoZSBwaHlzaWNzIHdvcmxkIGR1cmluZyBpdGVyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcHJvY2Vzc0Rlc3Ryb3lRdWV1ZSgpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGJ1bGxldCBvZiB0aGlzLmJ1bGxldHNUb0Rlc3Ryb3kpIHtcclxuICAgICAgICAgICAgYnVsbGV0LnBlcmZvcm1EZXN0cm95KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuYnVsbGV0c1RvRGVzdHJveS5sZW5ndGggPSAwOyAvLyBDbGVhciB0aGUgcXVldWVcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBlbmVteSBvZiB0aGlzLmVuZW1pZXNUb0Rlc3Ryb3kpIHtcclxuICAgICAgICAgICAgZW5lbXkucGVyZm9ybURlc3Ryb3koKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5lbmVtaWVzVG9EZXN0cm95Lmxlbmd0aCA9IDA7IC8vIENsZWFyIHRoZSBxdWV1ZVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBIYW5kbGVzIHBsYXllci1zcGVjaWZpYyBhY3Rpb25zIGxpa2UgbW92ZW1lbnQgYW5kIHNob290aW5nLlxyXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSBUaW1lIGVsYXBzZWQgc2luY2UgbGFzdCBmcmFtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJBY3Rpb25zKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBFeGlzdGluZyBtb3ZlbWVudCBsb2dpY1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgc2hvb3RpbmcgbG9naWNcclxuICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpIC8gMTAwMDsgLy8gR2V0IGN1cnJlbnQgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgaWYgKHRoaXMuaXNQb2ludGVyTG9ja2VkICYmIHRoaXMua2V5c1snbW91c2UwJ10gJiYgY3VycmVudFRpbWUgLSB0aGlzLmxhc3RGaXJlVGltZSA+PSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyRmlyZVJhdGUpIHtcclxuICAgICAgICAgICAgdGhpcy5sYXN0RmlyZVRpbWUgPSBjdXJyZW50VGltZTsgLy8gUmVzZXQgZmlyZSB0aW1lclxyXG5cclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0U3RhcnRQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKGJ1bGxldFN0YXJ0UG9zKTsgLy8gQnVsbGV0IHN0YXJ0cyBhdCBjYW1lcmEgcG9zaXRpb25cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldERpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKGJ1bGxldERpcmVjdGlvbik7IC8vIEJ1bGxldCBmaXJlcyBpbiBjYW1lcmEncyBmb3J3YXJkIGRpcmVjdGlvblxyXG5cclxuICAgICAgICAgICAgdGhpcy5jcmVhdGVCdWxsZXQoXHJcbiAgICAgICAgICAgICAgICBidWxsZXRTdGFydFBvcyxcclxuICAgICAgICAgICAgICAgIGJ1bGxldERpcmVjdGlvbixcclxuICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJCdWxsZXRTcGVlZCxcclxuICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJCdWxsZXREYW1hZ2UsXHJcbiAgICAgICAgICAgICAgICBHYW1lT2JqZWN0VHlwZS5QTEFZRVIsXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwbGF5ZXIncyB2ZWxvY2l0eSBiYXNlZCBvbiBXQVNEIGlucHV0IGFuZCBjYW1lcmEgb3JpZW50YXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWVyTW92ZW1lbnQoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVmZmVjdGl2ZVBsYXllclNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9PT0gMCkge1xyXG4gICAgICAgICAgICBlZmZlY3RpdmVQbGF5ZXJTcGVlZCAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyQ29udHJvbEZhY3RvcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudFlWZWxvY2l0eSA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1vdmVEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAwKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FtZXJhRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi55ID0gMDtcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFVwID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICBjYW1lcmFSaWdodC5jcm9zc1ZlY3RvcnMoZ2xvYmFsVXAsIGNhbWVyYURpcmVjdGlvbikubm9ybWFsaXplKCk7IFxyXG5cclxuICAgICAgICBsZXQgbW92aW5nID0gZmFsc2U7XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sncyddKSB7XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3cnXSkge1xyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydhJ10pIHtcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snZCddKSB7XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYVJpZ2h0KTsgXHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAobW92aW5nKSB7XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24ubm9ybWFsaXplKCkubXVsdGlwbHlTY2FsYXIoZWZmZWN0aXZlUGxheWVyU3BlZWQpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IG1vdmVEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBtb3ZlRGlyZWN0aW9uLno7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyRGVjZWxlcmF0aW9uO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gY3VycmVudFlWZWxvY2l0eTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFwcGxpZXMgYW4gdXB3YXJkIGltcHVsc2UgdG8gdGhlIHBsYXllciBib2R5IGZvciBqdW1waW5nLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHBsYXllckp1bXAoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gMDsgXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5hcHBseUltcHVsc2UoXHJcbiAgICAgICAgICAgICAgICBuZXcgQ0FOTk9OLlZlYzMoMCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmp1bXBGb3JjZSwgMCksXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb25cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IE1hbmFnZXMgc3Bhd25pbmcgb2YgZW5lbWllcyBpbnRvIHRoZSBnYW1lIHdvcmxkLlxyXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSBUaW1lIGVsYXBzZWQgc2luY2UgbGFzdCBmcmFtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGF3bkVuZW1pZXMoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5lbmVtaWVzLmxlbmd0aCA8IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteU1heENvdW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lICs9IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID49IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteVNwYXduSW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gMDsgLy8gUmVzZXQgdGltZXJcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBTcGF3biBlbmVteSBhdCBhIHJhbmRvbSBwb3NpdGlvbiB3aXRoaW4gdGhlIGdyb3VuZCBsaW1pdHMsIHNsaWdodGx5IGFib3ZlIGdyb3VuZFxyXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdW5kU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc3Bhd25YID0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogZ3JvdW5kU2l6ZSAqIDAuODsgLy8gODAlIG9mIGdyb3VuZCBzaXplIHRvIGF2b2lkIGVkZ2Ugc3Bhd25zXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzcGF3blogPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiBncm91bmRTaXplICogMC44O1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc3Bhd25ZID0gNTsgLy8gU3Bhd24gYSBiaXQgYWJvdmUgZ3JvdW5kIHRvIGZhbGwgbmF0dXJhbGx5XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5jcmVhdGVFbmVteShuZXcgVEhSRUUuVmVjdG9yMyhzcGF3blgsIHNwYXduWSwgc3Bhd25aKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFVwZGF0ZXMgYWxsIGR5bmFtaWMgZ2FtZSBlbnRpdGllcyAoZW5lbWllcyBhbmQgYnVsbGV0cykuXHJcbiAgICAgKiBAcGFyYW0gZGVsdGFUaW1lIFRpbWUgZWxhcHNlZCBzaW5jZSBsYXN0IGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZUVudGl0aWVzKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgLy8gVXBkYXRlIGVuZW1pZXMgKGUuZy4sIEFJIG1vdmVtZW50KVxyXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLmVuZW1pZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgZW5lbXkgPSB0aGlzLmVuZW1pZXNbaV07XHJcbiAgICAgICAgICAgIGVuZW15LnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMucGxheWVyQm9keSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgYnVsbGV0cyAoZS5nLiwgY2hlY2sgbGlmZXRpbWUsIG1vdmUgdmlzdWFscylcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5idWxsZXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IHRoaXMuYnVsbGV0c1tpXTtcclxuICAgICAgICAgICAgYnVsbGV0LnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogQ3JlYXRlcyBhIG5ldyBFbmVteSBpbnN0YW5jZSBhbmQgYWRkcyBpdCB0byB0aGUgZ2FtZS5cclxuICAgICAqIEBwYXJhbSBwb3NpdGlvbiBJbml0aWFsIHBvc2l0aW9uIG9mIHRoZSBlbmVteS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVFbmVteShwb3NpdGlvbjogVEhSRUUuVmVjdG9yMykge1xyXG4gICAgICAgIGNvbnN0IGVuZW15ID0gbmV3IEVuZW15KHRoaXMsIHBvc2l0aW9uKTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMucHVzaChlbmVteSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFJlbW92ZXMgYSBzcGVjaWZpYyBFbmVteSBpbnN0YW5jZSBmcm9tIHRoZSBnYW1lJ3MgYWN0aXZlIGxpc3QuXHJcbiAgICAgKiBDYWxsZWQgYnkgdGhlIEVuZW15IGl0c2VsZiB3aGVuIGl0J3MgZGVzdHJveWVkLlxyXG4gICAgICogQHBhcmFtIGVuZW15VG9SZW1vdmUgVGhlIEVuZW15IGluc3RhbmNlIHRvIHJlbW92ZS5cclxuICAgICAqL1xyXG4gICAgcmVtb3ZlRW5lbXkoZW5lbXlUb1JlbW92ZTogRW5lbXkpIHtcclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSB0aGlzLmVuZW1pZXMuZmlsdGVyKGVuZW15ID0+IGVuZW15ICE9PSBlbmVteVRvUmVtb3ZlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogQ3JlYXRlcyBhIG5ldyBCdWxsZXQgaW5zdGFuY2UgYW5kIGFkZHMgaXQgdG8gdGhlIGdhbWUuXHJcbiAgICAgKiBAcGFyYW0gcG9zaXRpb24gU3RhcnRpbmcgcG9zaXRpb24gb2YgdGhlIGJ1bGxldC5cclxuICAgICAqIEBwYXJhbSBkaXJlY3Rpb24gRmlyaW5nIGRpcmVjdGlvbiBvZiB0aGUgYnVsbGV0LlxyXG4gICAgICogQHBhcmFtIHNwZWVkIFNwZWVkIG9mIHRoZSBidWxsZXQuXHJcbiAgICAgKiBAcGFyYW0gZGFtYWdlIERhbWFnZSB0aGUgYnVsbGV0IGRlYWxzIG9uIGhpdC5cclxuICAgICAqIEBwYXJhbSBzaG9vdGVyVHlwZSBUeXBlIG9mIGVudGl0eSB0aGF0IGZpcmVkIHRoZSBidWxsZXQgKFBMQVlFUi9FTkVNWSkuXHJcbiAgICAgKiBAcGFyYW0gb3duZXJCb2R5IFRoZSBwaHlzaWNzIGJvZHkgb2YgdGhlIGVudGl0eSB0aGF0IGZpcmVkIHRoZSBidWxsZXQgKGZvciBjb2xsaXNpb24gZmlsdGVyaW5nKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVCdWxsZXQocG9zaXRpb246IFRIUkVFLlZlY3RvcjMsIGRpcmVjdGlvbjogVEhSRUUuVmVjdG9yMywgc3BlZWQ6IG51bWJlciwgZGFtYWdlOiBudW1iZXIsIHNob290ZXJUeXBlOiBHYW1lT2JqZWN0VHlwZSwgb3duZXJCb2R5OiBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhKSB7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0ID0gbmV3IEJ1bGxldCh0aGlzLCBwb3NpdGlvbiwgZGlyZWN0aW9uLCBzcGVlZCwgZGFtYWdlLCBzaG9vdGVyVHlwZSwgb3duZXJCb2R5KTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMucHVzaChidWxsZXQpO1xyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnZ3Vuc2hvdF9zb3VuZCcpPy5wbGF5KCkuY2F0Y2goZSA9PiB7fSk7IC8vIFBsYXkgZ3Vuc2hvdCBzb3VuZFxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBSZW1vdmVzIGEgc3BlY2lmaWMgQnVsbGV0IGluc3RhbmNlIGZyb20gdGhlIGdhbWUncyBhY3RpdmUgbGlzdC5cclxuICAgICAqIENhbGxlZCBieSB0aGUgQnVsbGV0IGl0c2VsZiB3aGVuIGl0J3MgZGVzdHJveWVkLlxyXG4gICAgICogQHBhcmFtIGJ1bGxldFRvUmVtb3ZlIFRoZSBCdWxsZXQgaW5zdGFuY2UgdG8gcmVtb3ZlLlxyXG4gICAgICovXHJcbiAgICByZW1vdmVCdWxsZXQoYnVsbGV0VG9SZW1vdmU6IEJ1bGxldCkge1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cyA9IHRoaXMuYnVsbGV0cy5maWx0ZXIoYnVsbGV0ID0+IGJ1bGxldCAhPT0gYnVsbGV0VG9SZW1vdmUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xhbXBzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbiB3aXRoaW4gdGhlIGRlZmluZWQgZ3JvdW5kIGJvdW5kYXJpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY2xhbXBQbGF5ZXJQb3NpdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyQm9keSB8fCAhdGhpcy5jb25maWcpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcblxyXG4gICAgICAgIGxldCBwb3NYID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLng7XHJcbiAgICAgICAgbGV0IHBvc1ogPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24uejtcclxuICAgICAgICBsZXQgdmVsWCA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54O1xyXG4gICAgICAgIGxldCB2ZWxaID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lno7XHJcblxyXG4gICAgICAgIGlmIChwb3NYID4gaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ggPCAtaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYIDwgMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAocG9zWiA+IGhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxaID4gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwb3NaIDwgLWhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gLWhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA8IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN5bmNocm9uaXplcyB0aGUgdmlzdWFsIG1lc2hlcyB3aXRoIHRoZWlyIGNvcnJlc3BvbmRpbmcgcGh5c2ljcyBib2RpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3luY01lc2hlc1dpdGhCb2RpZXMoKSB7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMuY2FtZXJhQ29udGFpbmVyLnF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAvLyBHcm91bmQgYW5kIHBsYWNlZCBvYmplY3RzIGFyZSBzdGF0aWMsIHNvIG5vIG5lZWQgdG8gc3luYyBhZnRlciBpbml0aWFsIHNldHVwLlxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSBET00gY29udGVudCBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIG5ldyBHYW1lKCk7XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFHeEIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUZDLFNBQUFBO0FBQUEsR0FBQTtBQU1MLElBQUssaUJBQUwsa0JBQUtDLG9CQUFMO0FBQ0ksRUFBQUEsZ0NBQUE7QUFDQSxFQUFBQSxnQ0FBQTtBQUNBLEVBQUFBLGdDQUFBO0FBQ0EsRUFBQUEsZ0NBQUE7QUFKQyxTQUFBQTtBQUFBLEdBQUE7QUErREwsTUFBTSxNQUFNO0FBQUE7QUFBQSxFQU9SLFlBQVksTUFBWSxVQUF5QjtBQUZqRDtBQUFBLFNBQVEsbUJBQTRCO0FBR2hDLFNBQUssT0FBTztBQUNaLFNBQUssU0FBUyxLQUFLLE9BQU8sYUFBYTtBQUV2QyxVQUFNLGVBQWUsS0FBSyxTQUFTLElBQUksZUFBZTtBQUN0RCxVQUFNLGdCQUFnQixJQUFJLE1BQU0sb0JBQW9CO0FBQUEsTUFDaEQsS0FBSztBQUFBLE1BQ0wsT0FBTyxlQUFlLFdBQVc7QUFBQTtBQUFBLElBQ3JDLENBQUM7QUFDRCxVQUFNLGdCQUFnQixJQUFJLE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQztBQUNuRCxTQUFLLE9BQU8sSUFBSSxNQUFNLEtBQUssZUFBZSxhQUFhO0FBQ3ZELFNBQUssS0FBSyxTQUFTLEtBQUssUUFBUTtBQUNoQyxTQUFLLEtBQUssYUFBYTtBQUN2QixTQUFLLE1BQU0sSUFBSSxLQUFLLElBQUk7QUFFeEIsVUFBTSxhQUFhLElBQUksT0FBTyxJQUFJLElBQUksT0FBTyxL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
