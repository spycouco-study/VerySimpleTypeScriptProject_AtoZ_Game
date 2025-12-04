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
  // Reference to the main Game instance
  constructor(game, position) {
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
    this.health -= amount;
    this.game.sounds.get("enemy_hit_sound")?.play().catch((e) => {
    });
    if (this.health <= 0) {
      this.destroy();
    }
  }
  /**
   * Removes the enemy's visual mesh and physics body from the game.
   */
  destroy() {
    this.game.scene.remove(this.mesh);
    this.game.world.removeBody(this.body);
    this.game.removeEnemy(this);
    this.game.sounds.get("enemy_death_sound")?.play().catch((e) => {
    });
  }
}
class Bullet {
  // To ignore initial collision with shooter (CHANGED FROM private TO public)
  constructor(game, position, direction, speed, damage, shooterType, ownerBody) {
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
    this.lifetime -= deltaTime;
    if (this.lifetime <= 0) {
      this.destroy();
      return;
    }
    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);
  }
  /**
   * Removes the bullet's visual mesh and physics body from the game.
   */
  destroy() {
    this.game.scene.remove(this.mesh);
    this.game.world.removeBody(this.body);
    this.game.removeBullet(this);
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEVudW0gdG8gZGVmaW5lIHRoZSBwb3NzaWJsZSBzdGF0ZXMgb2YgdGhlIGdhbWVcclxuZW51bSBHYW1lU3RhdGUge1xyXG4gICAgVElUTEUsICAgLy8gVGl0bGUgc2NyZWVuLCB3YWl0aW5nIGZvciB1c2VyIGlucHV0XHJcbiAgICBQTEFZSU5HICAvLyBHYW1lIGlzIGFjdGl2ZSwgdXNlciBjYW4gbW92ZSBhbmQgbG9vayBhcm91bmRcclxufVxyXG5cclxuLy8gRW51bSB0byBkZWZpbmUgdHlwZXMgb2YgZ2FtZSBvYmplY3RzIGZvciBjb2xsaXNpb24gZmlsdGVyaW5nIGFuZCBsb2dpY1xyXG5lbnVtIEdhbWVPYmplY3RUeXBlIHtcclxuICAgIFBMQVlFUixcclxuICAgIEVORU1ZLFxyXG4gICAgQlVMTEVULFxyXG4gICAgU1RBVElDX09CSkVDVCwgLy8gR3JvdW5kLCBwbGFjZWQgb2JqZWN0c1xyXG59XHJcblxyXG4vLyBFeHRlbmQgQ0FOTk9OLkJvZHkgdG8gaW5jbHVkZSBhIGN1c3RvbSB1c2VyRGF0YSBwcm9wZXJ0eSBmb3IgaWRlbnRpZnlpbmcgZ2FtZSBvYmplY3RzXHJcbmludGVyZmFjZSBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhIGV4dGVuZHMgQ0FOTk9OLkJvZHkge1xyXG4gICAgdXNlckRhdGE/OiB7IHR5cGU6IEdhbWVPYmplY3RUeXBlLCBpbnN0YW5jZT86IGFueSwgb3duZXI/OiBDQU5OT04uQm9keSB9O1xyXG59XHJcblxyXG4vLyBJbnRlcmZhY2UgZm9yIG9iamVjdHMgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkT2JqZWN0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZzsgLy8gQSBkZXNjcmlwdGl2ZSBuYW1lIGZvciB0aGUgb2JqZWN0IGluc3RhbmNlXHJcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBOYW1lIG9mIHRoZSB0ZXh0dXJlIGZyb20gYXNzZXRzLmltYWdlc1xyXG4gICAgdHlwZTogJ2JveCc7IC8vIEN1cnJlbnRseSBvbmx5IHN1cHBvcnRzICdib3gnXHJcbiAgICBwb3NpdGlvbjogeyB4OiBudW1iZXI7IHk6IG51bWJlcjsgejogbnVtYmVyIH07XHJcbiAgICBkaW1lbnNpb25zOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBkZXB0aDogbnVtYmVyIH07XHJcbiAgICByb3RhdGlvblk/OiBudW1iZXI7IC8vIE9wdGlvbmFsIHJvdGF0aW9uIGFyb3VuZCBZLWF4aXMgKHJhZGlhbnMpXHJcbiAgICBtYXNzOiBudW1iZXI7IC8vIDAgZm9yIHN0YXRpYywgPjAgZm9yIGR5bmFtaWMgKHRob3VnaCBhbGwgcGxhY2VkIG9iamVjdHMgaGVyZSB3aWxsIGJlIHN0YXRpYylcclxufVxyXG5cclxuLy8gSW50ZXJmYWNlIHRvIHR5cGUtY2hlY2sgdGhlIGdhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBkYXRhLmpzb25cclxuaW50ZXJmYWNlIEdhbWVDb25maWcge1xyXG4gICAgZ2FtZVNldHRpbmdzOiB7XHJcbiAgICAgICAgdGl0bGVTY3JlZW5UZXh0OiBzdHJpbmc7XHJcbiAgICAgICAgc3RhcnRHYW1lUHJvbXB0OiBzdHJpbmc7XHJcbiAgICAgICAgcGxheWVyU3BlZWQ6IG51bWJlcjtcclxuICAgICAgICBtb3VzZVNlbnNpdGl2aXR5OiBudW1iZXI7XHJcbiAgICAgICAgY2FtZXJhSGVpZ2h0T2Zmc2V0OiBudW1iZXI7IC8vIFZlcnRpY2FsIG9mZnNldCBvZiB0aGUgY2FtZXJhIGZyb20gdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keSBjZW50ZXJcclxuICAgICAgICBjYW1lcmFOZWFyOiBudW1iZXI7ICAgICAgICAgLy8gTmVhciBjbGlwcGluZyBwbGFuZSBmb3IgdGhlIGNhbWVyYVxyXG4gICAgICAgIGNhbWVyYUZhcjogbnVtYmVyOyAgICAgICAgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBwbGF5ZXJNYXNzOiBudW1iZXI7ICAgICAgICAgLy8gTWFzcyBvZiB0aGUgcGxheWVyJ3MgcGh5c2ljcyBib2R5XHJcbiAgICAgICAgZ3JvdW5kU2l6ZTogbnVtYmVyOyAgICAgICAgIC8vIFNpemUgKHdpZHRoL2RlcHRoKSBvZiB0aGUgc3F1YXJlIGdyb3VuZCBwbGFuZVxyXG4gICAgICAgIG1heFBoeXNpY3NTdWJTdGVwczogbnVtYmVyOyAvLyBNYXhpbXVtIG51bWJlciBvZiBwaHlzaWNzIHN1YnN0ZXBzIHBlciBmcmFtZSB0byBtYWludGFpbiBzdGFiaWxpdHlcclxuICAgICAgICBmaXhlZEFzcGVjdFJhdGlvOiB7IHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyIH07IC8vIE5ldzogRml4ZWQgYXNwZWN0IHJhdGlvIGZvciB0aGUgZ2FtZSAod2lkdGggLyBoZWlnaHQpXHJcbiAgICAgICAganVtcEZvcmNlOiBudW1iZXI7ICAgICAgICAgIC8vIEFEREVEOiBGb3JjZSBhcHBsaWVkIHdoZW4ganVtcGluZ1xyXG4gICAgICAgIHBsYWNlZE9iamVjdHM6IFBsYWNlZE9iamVjdENvbmZpZ1tdOyAvLyBORVc6IEFycmF5IG9mIG9iamVjdHMgdG8gcGxhY2UgaW4gdGhlIHdvcmxkXHJcbiAgICAgICAgLy8gTkVXOiBDb25maWd1cmFibGUgcGh5c2ljcyBwcm9wZXJ0aWVzXHJcbiAgICAgICAgcGxheWVyR3JvdW5kRnJpY3Rpb246IG51bWJlcjsgICAgICAgIC8vIEZyaWN0aW9uIGNvZWZmaWNpZW50IGZvciBwbGF5ZXItZ3JvdW5kIGNvbnRhY3RcclxuICAgICAgICBwbGF5ZXJBaXJDb250cm9sRmFjdG9yOiBudW1iZXI7ICAgIC8vIE11bHRpcGxpZXIgZm9yIHBsYXllclNwZWVkIHdoZW4gYWlyYm9ybmVcclxuICAgICAgICBwbGF5ZXJBaXJEZWNlbGVyYXRpb246IG51bWJlcjsgICAgIC8vIERlY2F5IGZhY3RvciBmb3IgaG9yaXpvbnRhbCB2ZWxvY2l0eSB3aGVuIGFpcmJvcm5lIGFuZCBub3QgbW92aW5nXHJcbiAgICAgICAgLy8gTkVXOiBFbmVteSBhbmQgY29tYmF0IHNldHRpbmdzXHJcbiAgICAgICAgZW5lbXlTcGF3bkludGVydmFsOiBudW1iZXI7IC8vIFRpbWUgaW4gc2Vjb25kcyBiZXR3ZWVuIGVuZW15IHNwYXduc1xyXG4gICAgICAgIGVuZW15TWF4Q291bnQ6IG51bWJlcjsgICAgICAvLyBNYXhpbXVtIG51bWJlciBvZiBlbmVtaWVzIGFsbG93ZWQgYXQgb25jZVxyXG4gICAgICAgIGVuZW15SGVhbHRoOiBudW1iZXI7ICAgICAgICAvLyBIZWFsdGggZm9yIGVhY2ggZW5lbXlcclxuICAgICAgICBlbmVteVNwZWVkOiBudW1iZXI7ICAgICAgICAgLy8gRW5lbXkgbW92ZW1lbnQgc3BlZWRcclxuICAgICAgICBwbGF5ZXJCdWxsZXRTcGVlZDogbnVtYmVyOyAgLy8gU3BlZWQgb2YgcGxheWVyJ3MgYnVsbGV0c1xyXG4gICAgICAgIHBsYXllckZpcmVSYXRlOiBudW1iZXI7ICAgICAvLyBTZWNvbmRzIGJldHdlZW4gcGxheWVyIHNob3RzXHJcbiAgICAgICAgYnVsbGV0TGlmZXRpbWU6IG51bWJlcjsgICAgIC8vIEhvdyBsb25nIGEgYnVsbGV0IGV4aXN0cyBiZWZvcmUgYmVpbmcgcmVtb3ZlZFxyXG4gICAgICAgIHBsYXllckJ1bGxldERhbWFnZTogbnVtYmVyOyAvLyBEYW1hZ2UgYSBwbGF5ZXIgYnVsbGV0IGRlYWxzXHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXByZXNlbnRzIGFuIGVuZW15IGNoYXJhY3RlciBpbiB0aGUgZ2FtZS5cclxuICogTWFuYWdlcyBpdHMgdmlzdWFsIG1lc2gsIHBoeXNpY3MgYm9keSwgaGVhbHRoLCBhbmQgYmFzaWMgQUkuXHJcbiAqL1xyXG5jbGFzcyBFbmVteSB7XHJcbiAgICBtZXNoOiBUSFJFRS5NZXNoO1xyXG4gICAgYm9keTogQ2Fubm9uQm9keVdpdGhVc2VyRGF0YTtcclxuICAgIGhlYWx0aDogbnVtYmVyO1xyXG4gICAgcHJpdmF0ZSBnYW1lOiBHYW1lOyAvLyBSZWZlcmVuY2UgdG8gdGhlIG1haW4gR2FtZSBpbnN0YW5jZVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKGdhbWU6IEdhbWUsIHBvc2l0aW9uOiBUSFJFRS5WZWN0b3IzKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lID0gZ2FtZTtcclxuICAgICAgICB0aGlzLmhlYWx0aCA9IGdhbWUuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteUhlYWx0aDtcclxuXHJcbiAgICAgICAgY29uc3QgZW5lbXlUZXh0dXJlID0gZ2FtZS50ZXh0dXJlcy5nZXQoJ2VuZW15X3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBlbmVteU1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IGVuZW15VGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGVuZW15VGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhmZjAwMDAgLy8gUmVkIGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBlbmVteUdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KDEsIDIsIDEpOyAvLyBTdGFuZGFyZCBlbmVteSBzaXplXHJcbiAgICAgICAgdGhpcy5tZXNoID0gbmV3IFRIUkVFLk1lc2goZW5lbXlHZW9tZXRyeSwgZW5lbXlNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5tZXNoLnBvc2l0aW9uLmNvcHkocG9zaXRpb24pO1xyXG4gICAgICAgIHRoaXMubWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICBnYW1lLnNjZW5lLmFkZCh0aGlzLm1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCBlbmVteVNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKDAuNSwgMSwgMC41KSk7IC8vIEhhbGYgZXh0ZW50cyBmb3IgYm94XHJcbiAgICAgICAgdGhpcy5ib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogMTAsIC8vIEVuZW1pZXMgaGF2ZSBtYXNzLCBzbyB0aGV5IGludGVyYWN0IHdpdGggcGh5c2ljc1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHBvc2l0aW9uLngsIHBvc2l0aW9uLnksIHBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogZW5lbXlTaGFwZSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSwgLy8gUHJldmVudCBlbmVtaWVzIGZyb20gdG9wcGxpbmcgb3ZlclxyXG4gICAgICAgICAgICBtYXRlcmlhbDogZ2FtZS5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgLy8gVXNlIGRlZmF1bHQgbWF0ZXJpYWwgZm9yIGNvbGxpc2lvbnNcclxuICAgICAgICB9KTtcclxuICAgICAgICAvLyBBdHRhY2ggY3VzdG9tIHVzZXJEYXRhIHRvIGlkZW50aWZ5IHRoaXMgYm9keSBpbiBjb2xsaXNpb24gZXZlbnRzXHJcbiAgICAgICAgdGhpcy5ib2R5LnVzZXJEYXRhID0geyB0eXBlOiBHYW1lT2JqZWN0VHlwZS5FTkVNWSwgaW5zdGFuY2U6IHRoaXMgfTtcclxuICAgICAgICBnYW1lLndvcmxkLmFkZEJvZHkodGhpcy5ib2R5KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIGVuZW15J3Mgc3RhdGUsIGluY2x1ZGluZyBiYXNpYyBBSSBtb3ZlbWVudCBhbmQgdmlzdWFsIHN5bmNocm9uaXphdGlvbi5cclxuICAgICAqIEBwYXJhbSBkZWx0YVRpbWUgVGltZSBlbGFwc2VkIHNpbmNlIGxhc3QgZnJhbWUuXHJcbiAgICAgKiBAcGFyYW0gcGxheWVyQm9keSBUaGUgcGh5c2ljcyBib2R5IG9mIHRoZSBwbGF5ZXIgdG8gdGFyZ2V0LlxyXG4gICAgICovXHJcbiAgICB1cGRhdGUoZGVsdGFUaW1lOiBudW1iZXIsIHBsYXllckJvZHk6IENBTk5PTi5Cb2R5KSB7XHJcbiAgICAgICAgLy8gU2ltcGxlIEFJOiBNb3ZlIHRvd2FyZHMgdGhlIHBsYXllclxyXG4gICAgICAgIGNvbnN0IHBsYXllclBvcyA9IHBsYXllckJvZHkucG9zaXRpb247XHJcbiAgICAgICAgY29uc3QgZW5lbXlQb3MgPSB0aGlzLmJvZHkucG9zaXRpb247XHJcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uID0gbmV3IENBTk5PTi5WZWMzKCk7XHJcbiAgICAgICAgcGxheWVyUG9zLnZzdWIoZW5lbXlQb3MsIGRpcmVjdGlvbik7IC8vIFZlY3RvciBmcm9tIGVuZW15IHRvIHBsYXllclxyXG4gICAgICAgIGRpcmVjdGlvbi55ID0gMDsgLy8gT25seSBob3Jpem9udGFsIG1vdmVtZW50XHJcbiAgICAgICAgZGlyZWN0aW9uLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICAvLyBBcHBseSB2ZWxvY2l0eSB0b3dhcmRzIHRoZSBwbGF5ZXJcclxuICAgICAgICBjb25zdCBkZXNpcmVkVmVsb2NpdHkgPSBkaXJlY3Rpb24uc2NhbGUodGhpcy5nYW1lLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlTcGVlZCk7XHJcbiAgICAgICAgdGhpcy5ib2R5LnZlbG9jaXR5LnggPSBkZXNpcmVkVmVsb2NpdHkueDtcclxuICAgICAgICB0aGlzLmJvZHkudmVsb2NpdHkueiA9IGRlc2lyZWRWZWxvY2l0eS56O1xyXG5cclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSB2aXN1YWwgbWVzaCB3aXRoIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIHRoaXMubWVzaC5wb3NpdGlvbi5jb3B5KHRoaXMuYm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgICAgIC8vIE9yaWVudCBlbmVteSB0byBsb29rIGF0IHBsYXllciAob25seSBZIHJvdGF0aW9uKVxyXG4gICAgICAgIGNvbnN0IGxvb2tBdFZlYyA9IG5ldyBUSFJFRS5WZWN0b3IzKHBsYXllclBvcy54LCBlbmVteVBvcy55LCBwbGF5ZXJQb3Mueik7XHJcbiAgICAgICAgdGhpcy5tZXNoLmxvb2tBdChsb29rQXRWZWMpO1xyXG4gICAgICAgIHRoaXMubWVzaC5yb3RhdGlvbi54ID0gMDsgLy8gS2VlcCBob3Jpem9udGFsXHJcbiAgICAgICAgdGhpcy5tZXNoLnJvdGF0aW9uLnogPSAwOyAvLyBLZWVwIGhvcml6b250YWxcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlZHVjZXMgdGhlIGVuZW15J3MgaGVhbHRoIGJ5IHRoZSBnaXZlbiBhbW91bnQuIERlc3Ryb3lzIHRoZSBlbmVteSBpZiBoZWFsdGggZHJvcHMgdG8gMCBvciBiZWxvdy5cclxuICAgICAqIEBwYXJhbSBhbW91bnQgVGhlIGFtb3VudCBvZiBkYW1hZ2UgdG8gdGFrZS5cclxuICAgICAqL1xyXG4gICAgdGFrZURhbWFnZShhbW91bnQ6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMuaGVhbHRoIC09IGFtb3VudDtcclxuICAgICAgICB0aGlzLmdhbWUuc291bmRzLmdldCgnZW5lbXlfaGl0X3NvdW5kJyk/LnBsYXkoKS5jYXRjaChlID0+IHt9KTsgLy8gUGxheSBoaXQgc291bmRcclxuICAgICAgICBpZiAodGhpcy5oZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLmRlc3Ryb3koKTtcclxuICAgICAgICAgICAgLy8gVE9ETzogQWRkIHNjb3JlLCBwYXJ0aWNsZSBlZmZlY3RzLCBldGMuXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVtb3ZlcyB0aGUgZW5lbXkncyB2aXN1YWwgbWVzaCBhbmQgcGh5c2ljcyBib2R5IGZyb20gdGhlIGdhbWUuXHJcbiAgICAgKi9cclxuICAgIGRlc3Ryb3koKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lLnNjZW5lLnJlbW92ZSh0aGlzLm1lc2gpO1xyXG4gICAgICAgIHRoaXMuZ2FtZS53b3JsZC5yZW1vdmVCb2R5KHRoaXMuYm9keSk7XHJcbiAgICAgICAgdGhpcy5nYW1lLnJlbW92ZUVuZW15KHRoaXMpOyAvLyBOb3RpZnkgR2FtZSBjbGFzcyB0byByZW1vdmUgZnJvbSBpdHMgbGlzdFxyXG4gICAgICAgIHRoaXMuZ2FtZS5zb3VuZHMuZ2V0KCdlbmVteV9kZWF0aF9zb3VuZCcpPy5wbGF5KCkuY2F0Y2goZSA9PiB7fSk7IC8vIFBsYXkgZGVhdGggc291bmRcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlcHJlc2VudHMgYSBidWxsZXQgcHJvamVjdGlsZSBpbiB0aGUgZ2FtZS5cclxuICogTWFuYWdlcyBpdHMgdmlzdWFsIG1lc2gsIHBoeXNpY3MgYm9keSwgYW5kIGxpZmV0aW1lLlxyXG4gKi9cclxuY2xhc3MgQnVsbGV0IHtcclxuICAgIG1lc2g6IFRIUkVFLk1lc2g7XHJcbiAgICBib2R5OiBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhO1xyXG4gICAgZGFtYWdlOiBudW1iZXI7XHJcbiAgICBzaG9vdGVyVHlwZTogR2FtZU9iamVjdFR5cGU7XHJcbiAgICBwcml2YXRlIGdhbWU6IEdhbWU7XHJcbiAgICBwcml2YXRlIGxpZmV0aW1lOiBudW1iZXI7IC8vIFRpbWUgcmVtYWluaW5nIHVudGlsIHNlbGYtZGVzdHJ1Y3Rpb25cclxuICAgIHB1YmxpYyByZWFkb25seSBvd25lckJvZHk6IENhbm5vbkJvZHlXaXRoVXNlckRhdGE7IC8vIFRvIGlnbm9yZSBpbml0aWFsIGNvbGxpc2lvbiB3aXRoIHNob290ZXIgKENIQU5HRUQgRlJPTSBwcml2YXRlIFRPIHB1YmxpYylcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihnYW1lOiBHYW1lLCBwb3NpdGlvbjogVEhSRUUuVmVjdG9yMywgZGlyZWN0aW9uOiBUSFJFRS5WZWN0b3IzLCBzcGVlZDogbnVtYmVyLCBkYW1hZ2U6IG51bWJlciwgc2hvb3RlclR5cGU6IEdhbWVPYmplY3RUeXBlLCBvd25lckJvZHk6IENhbm5vbkJvZHlXaXRoVXNlckRhdGEpIHtcclxuICAgICAgICB0aGlzLmdhbWUgPSBnYW1lO1xyXG4gICAgICAgIHRoaXMuZGFtYWdlID0gZGFtYWdlO1xyXG4gICAgICAgIHRoaXMuc2hvb3RlclR5cGUgPSBzaG9vdGVyVHlwZTtcclxuICAgICAgICB0aGlzLmxpZmV0aW1lID0gZ2FtZS5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldExpZmV0aW1lO1xyXG4gICAgICAgIHRoaXMub3duZXJCb2R5ID0gb3duZXJCb2R5O1xyXG5cclxuICAgICAgICBjb25zdCBidWxsZXRUZXh0dXJlID0gZ2FtZS50ZXh0dXJlcy5nZXQoJ2J1bGxldF90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogYnVsbGV0VGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGJ1bGxldFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ZmZmZjAwIC8vIFllbGxvdyBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0R2VvbWV0cnkgPSBuZXcgVEhSRUUuU3BoZXJlR2VvbWV0cnkoMC4xLCA4LCA4KTsgLy8gU21hbGwgc3BoZXJlIGZvciBidWxsZXRcclxuICAgICAgICB0aGlzLm1lc2ggPSBuZXcgVEhSRUUuTWVzaChidWxsZXRHZW9tZXRyeSwgYnVsbGV0TWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMubWVzaC5wb3NpdGlvbi5jb3B5KHBvc2l0aW9uKTtcclxuICAgICAgICB0aGlzLm1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgZ2FtZS5zY2VuZS5hZGQodGhpcy5tZXNoKTtcclxuXHJcbiAgICAgICAgY29uc3QgYnVsbGV0U2hhcGUgPSBuZXcgQ0FOTk9OLlNwaGVyZSgwLjEpOyAvLyBTcGhlcmUgcGh5c2ljcyBzaGFwZVxyXG4gICAgICAgIHRoaXMuYm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDAuMSwgLy8gU21hbGwgbWFzcywgc28gaXQncyBhZmZlY3RlZCBieSBwaHlzaWNzIGJ1dCBtb3ZlcyBmYXN0XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMocG9zaXRpb24ueCwgcG9zaXRpb24ueSwgcG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBidWxsZXRTaGFwZSxcclxuICAgICAgICAgICAgaXNUcmlnZ2VyOiBmYWxzZSwgLy8gRm9yIGFjdHVhbCBjb2xsaXNpb24gcmVzcG9uc2VcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IGdhbWUuZGVmYXVsdE9iamVjdE1hdGVyaWFsIC8vIFVzZSBkZWZhdWx0IG1hdGVyaWFsXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gU2V0IGluaXRpYWwgdmVsb2NpdHkgYmFzZWQgb24gZGlyZWN0aW9uIGFuZCBzcGVlZFxyXG4gICAgICAgIHRoaXMuYm9keS52ZWxvY2l0eS5zZXQoZGlyZWN0aW9uLnggKiBzcGVlZCwgZGlyZWN0aW9uLnkgKiBzcGVlZCwgZGlyZWN0aW9uLnogKiBzcGVlZCk7XHJcbiAgICAgICAgdGhpcy5ib2R5LmFsbG93U2xlZXAgPSBmYWxzZTsgLy8gS2VlcCBidWxsZXQgYWN0aXZlIGZvciBwaHlzaWNzIHVwZGF0ZXNcclxuXHJcbiAgICAgICAgLy8gQXR0YWNoIGN1c3RvbSB1c2VyRGF0YSB0byBpZGVudGlmeSB0aGlzIGJvZHkgaW4gY29sbGlzaW9uIGV2ZW50c1xyXG4gICAgICAgIHRoaXMuYm9keS51c2VyRGF0YSA9IHsgdHlwZTogR2FtZU9iamVjdFR5cGUuQlVMTEVULCBpbnN0YW5jZTogdGhpcywgb3duZXI6IHRoaXMub3duZXJCb2R5IH07XHJcbiAgICAgICAgZ2FtZS53b3JsZC5hZGRCb2R5KHRoaXMuYm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBidWxsZXQncyBzdGF0ZSwgY2hlY2tpbmcgaXRzIGxpZmV0aW1lIGFuZCBzeW5jaHJvbml6aW5nIGl0cyB2aXN1YWwgbWVzaC5cclxuICAgICAqIEBwYXJhbSBkZWx0YVRpbWUgVGltZSBlbGFwc2VkIHNpbmNlIGxhc3QgZnJhbWUuXHJcbiAgICAgKi9cclxuICAgIHVwZGF0ZShkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIHRoaXMubGlmZXRpbWUgLT0gZGVsdGFUaW1lO1xyXG4gICAgICAgIGlmICh0aGlzLmxpZmV0aW1lIDw9IDApIHtcclxuICAgICAgICAgICAgdGhpcy5kZXN0cm95KCk7IC8vIFJlbW92ZSBidWxsZXQgaWYgaXRzIGxpZmV0aW1lIGV4cGlyZXNcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLm1lc2gucG9zaXRpb24uY29weSh0aGlzLmJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICB0aGlzLm1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMuYm9keS5xdWF0ZXJuaW9uIGFzIHVua25vd24gYXMgVEhSRUUuUXVhdGVybmlvbik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZW1vdmVzIHRoZSBidWxsZXQncyB2aXN1YWwgbWVzaCBhbmQgcGh5c2ljcyBib2R5IGZyb20gdGhlIGdhbWUuXHJcbiAgICAgKi9cclxuICAgIGRlc3Ryb3koKSB7XHJcbiAgICAgICAgdGhpcy5nYW1lLnNjZW5lLnJlbW92ZSh0aGlzLm1lc2gpO1xyXG4gICAgICAgIHRoaXMuZ2FtZS53b3JsZC5yZW1vdmVCb2R5KHRoaXMuYm9keSk7XHJcbiAgICAgICAgdGhpcy5nYW1lLnJlbW92ZUJ1bGxldCh0aGlzKTsgLy8gTm90aWZ5IEdhbWUgY2xhc3MgdG8gcmVtb3ZlIGZyb20gaXRzIGxpc3RcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIE1haW4gR2FtZSBjbGFzcyByZXNwb25zaWJsZSBmb3IgaW5pdGlhbGl6aW5nIGFuZCBydW5uaW5nIHRoZSAzRCBnYW1lLlxyXG4gKiBJdCBoYW5kbGVzIFRocmVlLmpzIHJlbmRlcmluZywgQ2Fubm9uLWVzIHBoeXNpY3MsIGlucHV0LCBhbmQgZ2FtZSBzdGF0ZS5cclxuICovXHJcbmNsYXNzIEdhbWUge1xyXG4gICAgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgc2NlbmUhOiBUSFJFRS5TY2VuZTtcclxuICAgIHByaXZhdGUgY2FtZXJhITogVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmE7XHJcbiAgICBwcml2YXRlIHJlbmRlcmVyITogVEhSRUUuV2ViR0xSZW5kZXJlcjtcclxuICAgIHByaXZhdGUgY2FudmFzITogSFRNTENhbnZhc0VsZW1lbnQ7IC8vIFRoZSBIVE1MIGNhbnZhcyBlbGVtZW50IGZvciByZW5kZXJpbmdcclxuICAgIHByaXZhdGUgY2FtZXJhQ29udGFpbmVyITogVEhSRUUuT2JqZWN0M0Q7IC8vIENvbnRhaW5lciBmb3IgY2FtZXJhIHRvIGhhbmRsZSB5YXcgc2VwYXJhdGVseVxyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgd29ybGQhOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwcml2YXRlIHBsYXllckJvZHkhOiBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhOyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENhbm5vbkJvZHlXaXRoVXNlckRhdGE7IC8vIFBoeXNpY3MgYm9keSBmb3IgdGhlIGdyb3VuZFxyXG5cclxuICAgIC8vIENhbm5vbi1lcyBtYXRlcmlhbHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgcGxheWVyTWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgZGVmYXVsdE9iamVjdE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsOyAvLyBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0cywgYWxzbyB1c2VkIGJ5IGVuZW1pZXMvYnVsbGV0c1xyXG5cclxuICAgIC8vIFZpc3VhbCBtZXNoZXMgKFRocmVlLmpzKSBmb3IgZ2FtZSBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYXllck1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgcHJpdmF0ZSBncm91bmRNZXNoITogVEhSRUUuTWVzaDtcclxuICAgIHByaXZhdGUgcGxhY2VkT2JqZWN0TWVzaGVzOiBUSFJFRS5NZXNoW10gPSBbXTtcclxuICAgIHByaXZhdGUgcGxhY2VkT2JqZWN0Qm9kaWVzOiBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhW10gPSBbXTtcclxuXHJcbiAgICAvLyBORVc6IEdhbWUgZW50aXRpZXMgKGVuZW1pZXMgYW5kIGJ1bGxldHMpXHJcbiAgICBlbmVtaWVzOiBFbmVteVtdID0gW107XHJcbiAgICBidWxsZXRzOiBCdWxsZXRbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBsYXN0RW5lbXlTcGF3blRpbWU6IG51bWJlciA9IDA7IC8vIFRpbWVyIGZvciBlbmVteSBzcGF3bmluZ1xyXG4gICAgcHJpdmF0ZSBsYXN0RmlyZVRpbWU6IG51bWJlciA9IDA7ICAgICAgIC8vIFRpbWVyIGZvciBwbGF5ZXIncyBmaXJlIHJhdGVcclxuXHJcbiAgICAvLyBJbnB1dCBoYW5kbGluZyBzdGF0ZVxyXG4gICAgcHJpdmF0ZSBrZXlzOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9OyAvLyBUcmFja3MgY3VycmVudGx5IHByZXNzZWQga2V5c1xyXG4gICAgcHJpdmF0ZSBpc1BvaW50ZXJMb2NrZWQ6IGJvb2xlYW4gPSBmYWxzZTsgLy8gVHJ1ZSBpZiBtb3VzZSBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgcHJpdmF0ZSBjYW1lcmFQaXRjaDogbnVtYmVyID0gMDsgLy8gVmVydGljYWwgcm90YXRpb24gKHBpdGNoKSBvZiB0aGUgY2FtZXJhXHJcblxyXG4gICAgLy8gQXNzZXQgbWFuYWdlbWVudFxyXG4gICAgdGV4dHVyZXM6IE1hcDxzdHJpbmcsIFRIUkVFLlRleHR1cmU+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIHRleHR1cmVzXHJcbiAgICBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIGF1ZGlvIGVsZW1lbnRzXHJcblxyXG4gICAgLy8gVUkgZWxlbWVudHMgKGR5bmFtaWNhbGx5IGNyZWF0ZWQgZm9yIHRoZSB0aXRsZSBzY3JlZW4pXHJcbiAgICBwcml2YXRlIHRpdGxlU2NyZWVuT3ZlcmxheSE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSB0aXRsZVRleHQhOiBIVE1MRGl2RWxlbWVudDtcclxuICAgIHByaXZhdGUgcHJvbXB0VGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG5cclxuICAgIC8vIEZvciBjYWxjdWxhdGluZyBkZWx0YSB0aW1lIGJldHdlZW4gZnJhbWVzXHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuXHJcbiAgICAvLyBUcmFja3MgcGxheWVyIGNvbnRhY3RzIHdpdGggQU5ZIHN0YXRpYyBzdXJmYWNlIChncm91bmQgb3IgcGxhY2VkIG9iamVjdHMpIGZvciBqdW1waW5nL21vdmVtZW50IGxvZ2ljXHJcbiAgICBwcml2YXRlIG51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIC8vIEdldCB0aGUgY2FudmFzIGVsZW1lbnQgZnJvbSBpbmRleC5odG1sXHJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ2FtZUNhbnZhcycpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xyXG4gICAgICAgIGlmICghdGhpcy5jYW52YXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignQ2FudmFzIGVsZW1lbnQgd2l0aCBJRCBcImdhbWVDYW52YXNcIiBub3QgZm91bmQhJyk7XHJcbiAgICAgICAgICAgIHJldHVybjsgLy8gQ2Fubm90IHByb2NlZWQgd2l0aG91dCBhIGNhbnZhc1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmluaXQoKTsgLy8gU3RhcnQgdGhlIGFzeW5jaHJvbm91cyBpbml0aWFsaXphdGlvbiBwcm9jZXNzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBc3luY2hyb25vdXNseSBpbml0aWFsaXplcyB0aGUgZ2FtZSwgbG9hZGluZyBjb25maWcsIGFzc2V0cywgYW5kIHNldHRpbmcgdXAgc3lzdGVtcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBpbml0KCkge1xyXG4gICAgICAgIC8vIDEuIExvYWQgZ2FtZSBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0dhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIElmIGNvbmZpZ3VyYXRpb24gZmFpbHMgdG8gbG9hZCwgZGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGFuZCBzdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRvcCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5sZWZ0ID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5mb250U2l6ZSA9ICcyNHB4JztcclxuICAgICAgICAgICAgZXJyb3JEaXYudGV4dENvbnRlbnQgPSAnRXJyb3I6IEZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMi4gSW5pdGlhbGl6ZSBUaHJlZS5qcyAoc2NlbmUsIGNhbWVyYSwgcmVuZGVyZXIpXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgICAgICA3NSwgLy8gRmllbGQgb2YgVmlldyAoRk9WKVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodCwgLy8gRml4ZWQgQXNwZWN0IHJhdGlvIGZyb20gY29uZmlnXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFOZWFyLCAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFGYXIgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmb3IgYmV0dGVyIHJlYWxpc21cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC50eXBlID0gVEhSRUUuUENGU29mdFNoYWRvd01hcDsgLy8gVXNlIHNvZnQgc2hhZG93c1xyXG5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lciA9IG5ldyBUSFJFRS5PYmplY3QzRCgpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuY2FtZXJhQ29udGFpbmVyKTtcclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5hZGQodGhpcy5jYW1lcmEpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnkgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhSGVpZ2h0T2Zmc2V0O1xyXG5cclxuXHJcbiAgICAgICAgLy8gMy4gSW5pdGlhbGl6ZSBDYW5ub24tZXMgKHBoeXNpY3Mgd29ybGQpXHJcbiAgICAgICAgdGhpcy53b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcclxuICAgICAgICB0aGlzLndvcmxkLmdyYXZpdHkuc2V0KDAsIC05LjgyLCAwKTsgLy8gU2V0IHN0YW5kYXJkIEVhcnRoIGdyYXZpdHkgKFktYXhpcyBkb3duKVxyXG4gICAgICAgIHRoaXMud29ybGQuYnJvYWRwaGFzZSA9IG5ldyBDQU5OT04uU0FQQnJvYWRwaGFzZSh0aGlzLndvcmxkKTsgLy8gVXNlIGFuIGVmZmljaWVudCBicm9hZHBoYXNlIGFsZ29yaXRobVxyXG4gICAgICAgICh0aGlzLndvcmxkLnNvbHZlciBhcyBDQU5OT04uR1NTb2x2ZXIpLml0ZXJhdGlvbnMgPSAxMDsgLy8gSW5jcmVhc2Ugc29sdmVyIGl0ZXJhdGlvbnMgZm9yIGJldHRlciBzdGFiaWxpdHlcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIENhbm5vbi5qcyBNYXRlcmlhbHMgYW5kIENvbnRhY3RNYXRlcmlhbCBmb3IgcGxheWVyLWdyb3VuZCBpbnRlcmFjdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdwbGF5ZXJNYXRlcmlhbCcpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdncm91bmRNYXRlcmlhbCcpO1xyXG4gICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZGVmYXVsdE9iamVjdE1hdGVyaWFsJyk7IC8vIE1hdGVyaWFsIGZvciBnZW5lcmljIHBsYWNlZCBvYmplY3RzLCBlbmVtaWVzLCBidWxsZXRzXHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7IGZyaWN0aW9uOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyR3JvdW5kRnJpY3Rpb24sIHJlc3RpdHV0aW9uOiAwLjAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyR3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyT2JqZWN0Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7IGZyaWN0aW9uOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyR3JvdW5kRnJpY3Rpb24sIHJlc3RpdHV0aW9uOiAwLjAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyT2JqZWN0Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgY29uc3Qgb2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7IGZyaWN0aW9uOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyR3JvdW5kRnJpY3Rpb24sIHJlc3RpdHV0aW9uOiAwLjAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwob2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gQURERUQ6IE9iamVjdC1PYmplY3QgY29udGFjdCBtYXRlcmlhbCAoZS5nLiwgZW5lbXktZW5lbXksIGVuZW15LXBsYWNlZCBvYmplY3QsIGJ1bGxldC1vYmplY3QpXHJcbiAgICAgICAgY29uc3Qgb2JqZWN0T2JqZWN0Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAgeyBmcmljdGlvbjogMC4xLCByZXN0aXR1dGlvbjogMC4xIH0gLy8gU21hbGwgZnJpY3Rpb24vcmVzdGl0dXRpb24gZm9yIGdlbmVyaWMgb2JqZWN0c1xyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwob2JqZWN0T2JqZWN0Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcblxyXG4gICAgICAgIC8vIDQuIExvYWQgYXNzZXRzICh0ZXh0dXJlcyBhbmQgc291bmRzKVxyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBDcmVhdGUgZ2FtZSBvYmplY3RzIChwbGF5ZXIsIGdyb3VuZCwgYW5kIG90aGVyIG9iamVjdHMpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTtcclxuICAgICAgICB0aGlzLmNyZWF0ZVBsYWNlZE9iamVjdHMoKTtcclxuICAgICAgICB0aGlzLnNldHVwTGlnaHRpbmcoKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBTZXR1cCBDYW5ub24tZXMgY29udGFjdCBsaXN0ZW5lcnMgZm9yIGNvbGxpc2lvbiBkZXRlY3Rpb25cclxuICAgICAgICB0aGlzLndvcmxkLmFkZEV2ZW50TGlzdGVuZXIoJ2JlZ2luQ29udGFjdCcsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBib2R5QSA9IGV2ZW50LmJvZHlBIGFzIENhbm5vbkJvZHlXaXRoVXNlckRhdGE7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHlCID0gZXZlbnQuYm9keUIgYXMgQ2Fubm9uQm9keVdpdGhVc2VyRGF0YTtcclxuXHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBwbGF5ZXItc3RhdGljIHN1cmZhY2UgY29udGFjdHMgKGZvciBqdW1waW5nL21vdmVtZW50IGxvZ2ljKVxyXG4gICAgICAgICAgICBpZiAoYm9keUEudXNlckRhdGE/LnR5cGUgPT09IEdhbWVPYmplY3RUeXBlLlBMQVlFUiB8fCBib2R5Qi51c2VyRGF0YT8udHlwZSA9PT0gR2FtZU9iamVjdFR5cGUuUExBWUVSKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBib2R5QS51c2VyRGF0YT8udHlwZSA9PT0gR2FtZU9iamVjdFR5cGUuUExBWUVSID8gYm9keUIgOiBib2R5QTtcclxuICAgICAgICAgICAgICAgIGlmIChvdGhlckJvZHkudXNlckRhdGEgJiYgb3RoZXJCb2R5LnVzZXJEYXRhLnR5cGUgPT09IEdhbWVPYmplY3RUeXBlLlNUQVRJQ19PQkpFQ1QpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzKys7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBidWxsZXQgY29sbGlzaW9uc1xyXG4gICAgICAgICAgICBsZXQgYnVsbGV0SW5zdGFuY2U6IEJ1bGxldCB8IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgbGV0IHRhcmdldEJvZHk6IENhbm5vbkJvZHlXaXRoVXNlckRhdGEgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgd2hpY2ggYm9keSBpcyB0aGUgYnVsbGV0IGFuZCB3aGljaCBpcyB0aGUgdGFyZ2V0XHJcbiAgICAgICAgICAgIGlmIChib2R5QS51c2VyRGF0YT8udHlwZSA9PT0gR2FtZU9iamVjdFR5cGUuQlVMTEVUKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXRJbnN0YW5jZSA9IGJvZHlBLnVzZXJEYXRhLmluc3RhbmNlIGFzIEJ1bGxldDtcclxuICAgICAgICAgICAgICAgIHRhcmdldEJvZHkgPSBib2R5QjtcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChib2R5Qi51c2VyRGF0YT8udHlwZSA9PT0gR2FtZU9iamVjdFR5cGUuQlVMTEVUKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXRJbnN0YW5jZSA9IGJvZHlCLnVzZXJEYXRhLmluc3RhbmNlIGFzIEJ1bGxldDtcclxuICAgICAgICAgICAgICAgIHRhcmdldEJvZHkgPSBib2R5QTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKGJ1bGxldEluc3RhbmNlICYmIHRhcmdldEJvZHkpIHtcclxuICAgICAgICAgICAgICAgIC8vIElnbm9yZSBjb2xsaXNpb24gd2l0aCB0aGUgb3duZXIgb2YgdGhlIGJ1bGxldCBpbW1lZGlhdGVseSBhZnRlciBmaXJpbmdcclxuICAgICAgICAgICAgICAgIC8vIFRoZSBvd25lckJvZHkgcHJvcGVydHkgd2FzIGNoYW5nZWQgZnJvbSBwcml2YXRlIHRvIHB1YmxpYyBmb3IgdGhpcyBhY2Nlc3MuXHJcbiAgICAgICAgICAgICAgICBpZiAoYnVsbGV0SW5zdGFuY2Uub3duZXJCb2R5ID09PSB0YXJnZXRCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHN3aXRjaCAodGFyZ2V0Qm9keS51c2VyRGF0YT8udHlwZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgR2FtZU9iamVjdFR5cGUuRU5FTVk6XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGVuZW15SW5zdGFuY2UgPSB0YXJnZXRCb2R5LnVzZXJEYXRhLmluc3RhbmNlIGFzIEVuZW15O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbmVteUluc3RhbmNlLnRha2VEYW1hZ2UoYnVsbGV0SW5zdGFuY2UuZGFtYWdlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnVsbGV0SW5zdGFuY2UuZGVzdHJveSgpOyAvLyBEZXN0cm95IGJ1bGxldCBhZnRlciBoaXR0aW5nIGVuZW15XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgR2FtZU9iamVjdFR5cGUuU1RBVElDX09CSkVDVDpcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnVsbGV0SW5zdGFuY2UuZGVzdHJveSgpOyAvLyBEZXN0cm95IGJ1bGxldCBhZnRlciBoaXR0aW5nIHN0YXRpYyBlbnZpcm9ubWVudFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBIYW5kbGUgYnVsbGV0LXBsYXllciBjb2xsaXNpb24gaWYgZW5lbXkgc2hvb3RpbmcgaXMgaW1wbGVtZW50ZWRcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLndvcmxkLmFkZEV2ZW50TGlzdGVuZXIoJ2VuZENvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYm9keUEgPSBldmVudC5ib2R5QSBhcyBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhO1xyXG4gICAgICAgICAgICBjb25zdCBib2R5QiA9IGV2ZW50LmJvZHlCIGFzIENhbm5vbkJvZHlXaXRoVXNlckRhdGE7XHJcblxyXG4gICAgICAgICAgICBpZiAoYm9keUEudXNlckRhdGE/LnR5cGUgPT09IEdhbWVPYmplY3RUeXBlLlBMQVlFUiB8fCBib2R5Qi51c2VyRGF0YT8udHlwZSA9PT0gR2FtZU9iamVjdFR5cGUuUExBWUVSKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBib2R5QS51c2VyRGF0YT8udHlwZSA9PT0gR2FtZU9iamVjdFR5cGUuUExBWUVSID8gYm9keUIgOiBib2R5QTtcclxuICAgICAgICAgICAgICAgIGlmIChvdGhlckJvZHkudXNlckRhdGEgJiYgb3RoZXJCb2R5LnVzZXJEYXRhLnR5cGUgPT09IEdhbWVPYmplY3RUeXBlLlNUQVRJQ19PQkpFQ1QpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzID0gTWF0aC5tYXgoMCwgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyAtIDEpOyAvLyBFbnN1cmUgaXQgZG9lc24ndCBnbyBiZWxvdyAwXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gNy4gU2V0dXAgZXZlbnQgbGlzdGVuZXJzIGZvciB1c2VyIGlucHV0IGFuZCB3aW5kb3cgcmVzaXppbmdcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5vbldpbmRvd1Jlc2l6ZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpKTsgLy8gRm9yIG1vdXNlIGxvb2tcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm9uTW91c2VEb3duLmJpbmQodGhpcykpOyAvLyBGb3IgbW91c2UgY2xpY2sgKHNob290aW5nKVxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLm9uTW91c2VVcC5iaW5kKHRoaXMpKTsgICAgIC8vIEZvciBtb3VzZSBjbGljayAoc2hvb3RpbmcpXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW96cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGluaXRpYWwgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIC8vIDguIFNldHVwIHRoZSB0aXRsZSBzY3JlZW4gVUlcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgdGhlIG1haW4gZ2FtZSBsb29wXHJcbiAgICAgICAgdGhpcy5hbmltYXRlKDApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTG9hZHMgYWxsIHRleHR1cmVzIGFuZCBzb3VuZHMgZGVmaW5lZCBpbiB0aGUgZ2FtZSBjb25maWd1cmF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZUxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiB0ZXh0dXJlTG9hZGVyLmxvYWRBc3luYyhpbWcucGF0aClcclxuICAgICAgICAgICAgICAgIC50aGVuKHRleHR1cmUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZXMuc2V0KGltZy5uYW1lLCB0ZXh0dXJlKTtcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbWcubmFtZSA9PT0gJ2dyb3VuZF90ZXh0dXJlJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS5yZXBlYXQuc2V0KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gNSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCB0ZXh0dXJlOiAke2ltZy5wYXRofWAsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc291bmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9vcCA9IChzb3VuZC5uYW1lID09PSAnYmFja2dyb3VuZF9tdXNpYycpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoc291bmQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYEFzc2V0cyBsb2FkZWQ6ICR7dGhpcy50ZXh0dXJlcy5zaXplfSB0ZXh0dXJlcywgJHt0aGlzLnNvdW5kcy5zaXplfSBzb3VuZHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBkaXNwbGF5cyB0aGUgdGl0bGUgc2NyZWVuIFVJIGR5bmFtaWNhbGx5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwVGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICdyZ2JhKDAsIDAsIDAsIDAuOCknLFxyXG4gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLFxyXG4gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsIGFsaWduSXRlbXM6ICdjZW50ZXInLFxyXG4gICAgICAgICAgICBjb2xvcjogJ3doaXRlJywgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICc0OHB4JywgdGV4dEFsaWduOiAnY2VudGVyJywgekluZGV4OiAnMTAwMCdcclxuICAgICAgICB9KTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuXHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTtcclxuXHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnRpdGxlVGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aXRsZVNjcmVlblRleHQ7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVRleHQpO1xyXG5cclxuICAgICAgICB0aGlzLnByb21wdFRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnByb21wdFRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhcnRHYW1lUHJvbXB0O1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5wcm9tcHRUZXh0LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIG1hcmdpblRvcDogJzIwcHgnLCBmb250U2l6ZTogJzI0cHgnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy5wcm9tcHRUZXh0KTtcclxuXHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLnN0YXJ0R2FtZSgpKTtcclxuXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZGVuaWVkIChyZXF1aXJlcyB1c2VyIGdlc3R1cmUpOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUcmFuc2l0aW9ucyB0aGUgZ2FtZSBmcm9tIHRoZSB0aXRsZSBzY3JlZW4gdG8gdGhlIHBsYXlpbmcgc3RhdGUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGZhaWxlZCBhZnRlciB1c2VyIGdlc3R1cmU6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgY2xpY2tzIG9uIHRoZSBjYW52YXMgdG8gcmUtbG9jayB0aGUgcG9pbnRlciBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCB1bmxvY2tlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiAhdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGF5ZXIoKSB7XHJcbiAgICAgICAgY29uc3QgcGxheWVyVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdwbGF5ZXJfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IHBsYXllclRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBwbGF5ZXJUZXh0dXJlID8gMHhmZmZmZmYgOiAweDAwNzdmZlxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KDEsIDIsIDEpO1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHBsYXllckdlb21ldHJ5LCBwbGF5ZXJNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnkgPSA1O1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLnBsYXllck1lc2gpO1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJTaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMygwLjUsIDEsIDAuNSkpO1xyXG4gICAgICAgIHRoaXMucGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJNYXNzLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi54LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSwgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogcGxheWVyU2hhcGUsXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUsXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLnBsYXllck1hdGVyaWFsXHJcbiAgICAgICAgfSkgYXMgQ2Fubm9uQm9keVdpdGhVc2VyRGF0YTsgLy8gQ2FzdCB0byBpbmNsdWRlIHVzZXJEYXRhXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnVzZXJEYXRhID0geyB0eXBlOiBHYW1lT2JqZWN0VHlwZS5QTEFZRVIsIGluc3RhbmNlOiB0aGlzLnBsYXllckJvZHkgfTsgLy8gSWRlbnRpZnkgcGxheWVyIGJvZHlcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5wbGF5ZXJCb2R5KTtcclxuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIGdyb3VuZCdzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlR3JvdW5kKCkge1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBncm91bmRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZ3JvdW5kVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4ODg4ODhcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBncm91bmRHZW9tZXRyeSA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoID0gbmV3IFRIUkVFLk1lc2goZ3JvdW5kR2VvbWV0cnksIGdyb3VuZE1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5ncm91bmRNZXNoKTtcclxuXHJcbiAgICAgICAgY29uc3QgZ3JvdW5kU2hhcGUgPSBuZXcgQ0FOTk9OLlBsYW5lKCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogMCxcclxuICAgICAgICAgICAgc2hhcGU6IGdyb3VuZFNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5ncm91bmRNYXRlcmlhbFxyXG4gICAgICAgIH0pIGFzIENhbm5vbkJvZHlXaXRoVXNlckRhdGE7XHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnVzZXJEYXRhID0geyB0eXBlOiBHYW1lT2JqZWN0VHlwZS5TVEFUSUNfT0JKRUNUIH07IC8vIElkZW50aWZ5IGdyb3VuZCBib2R5XHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMSwgMCwgMCksIC1NYXRoLlBJIC8gMik7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZ3JvdW5kQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIHZpc3VhbCBtZXNoZXMgYW5kIHBoeXNpY3MgYm9kaWVzIGZvciBhbGwgb2JqZWN0cyBkZWZpbmVkIGluIGNvbmZpZy5nYW1lU2V0dGluZ3MucGxhY2VkT2JqZWN0cy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGFjZWRPYmplY3RzKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYWNlZE9iamVjdHMpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiTm8gcGxhY2VkT2JqZWN0cyBkZWZpbmVkIGluIGdhbWVTZXR0aW5ncy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGFjZWRPYmplY3RzLmZvckVhY2gob2JqQ29uZmlnID0+IHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KG9iakNvbmZpZy50ZXh0dXJlTmFtZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICAgICAgbWFwOiB0ZXh0dXJlLFxyXG4gICAgICAgICAgICAgICAgY29sb3I6IHRleHR1cmUgPyAweGZmZmZmZiA6IDB4YWFhYWFhXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkob2JqQ29uZmlnLmRpbWVuc2lvbnMud2lkdGgsIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICAgICAgbWVzaC5wb3NpdGlvbi5zZXQob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueik7XHJcbiAgICAgICAgICAgIGlmIChvYmpDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIG1lc2gucm90YXRpb24ueSA9IG9iakNvbmZpZy5yb3RhdGlvblk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQobWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxhY2VkT2JqZWN0TWVzaGVzLnB1c2gobWVzaCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogb2JqQ29uZmlnLm1hc3MsXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKG9iakNvbmZpZy5wb3NpdGlvbi54LCBvYmpDb25maWcucG9zaXRpb24ueSwgb2JqQ29uZmlnLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICAgICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsXHJcbiAgICAgICAgICAgIH0pIGFzIENhbm5vbkJvZHlXaXRoVXNlckRhdGE7IC8vIENhc3QgdG8gaW5jbHVkZSB1c2VyRGF0YVxyXG4gICAgICAgICAgICBib2R5LnVzZXJEYXRhID0geyB0eXBlOiBHYW1lT2JqZWN0VHlwZS5TVEFUSUNfT0JKRUNUIH07IC8vIElkZW50aWZ5IHBsYWNlZCBvYmplY3QgYm9keVxyXG4gICAgICAgICAgICBpZiAob2JqQ29uZmlnLnJvdGF0aW9uWSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBib2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMCwgMSwgMCksIG9iakNvbmZpZy5yb3RhdGlvblkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keShib2R5KTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RCb2RpZXMucHVzaChib2R5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQ3JlYXRlZCAke3RoaXMucGxhY2VkT2JqZWN0TWVzaGVzLmxlbmd0aH0gcGxhY2VkIG9iamVjdHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIGFtYmllbnQgYW5kIGRpcmVjdGlvbmFsIGxpZ2h0aW5nIGluIHRoZSBzY2VuZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cExpZ2h0aW5nKCkge1xyXG4gICAgICAgIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDAsIDEuMCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYW1iaWVudExpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uYWxMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQucG9zaXRpb24uc2V0KDUsIDEwLCA1KTtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUud2lkdGggPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUuaGVpZ2h0ID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubmVhciA9IDAuNTtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuZmFyID0gNTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmxlZnQgPSAtMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnJpZ2h0ID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5ib3R0b20gPSAtMTA7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoZGlyZWN0aW9uYWxMaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIHdpbmRvdyByZXNpemluZyB0byBrZWVwIHRoZSBjYW1lcmEgYXNwZWN0IHJhdGlvIGFuZCByZW5kZXJlciBzaXplIGNvcnJlY3QuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25XaW5kb3dSZXNpemUoKSB7XHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFwcGxpZXMgdGhlIGNvbmZpZ3VyZWQgZml4ZWQgYXNwZWN0IHJhdGlvIHRvIHRoZSByZW5kZXJlciBhbmQgY2FtZXJhLFxyXG4gICAgICogcmVzaXppbmcgYW5kIGNlbnRlcmluZyB0aGUgY2FudmFzIHRvIGZpdCB3aXRoaW4gdGhlIHdpbmRvdy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhcHBseUZpeGVkQXNwZWN0UmF0aW8oKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0QXNwZWN0UmF0aW8gPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodDtcclxuXHJcbiAgICAgICAgbGV0IG5ld1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgbGV0IG5ld0hlaWdodDogbnVtYmVyO1xyXG5cclxuICAgICAgICBjb25zdCB3aW5kb3dXaWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoO1xyXG4gICAgICAgIGNvbnN0IHdpbmRvd0hlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICBjb25zdCBjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPSB3aW5kb3dXaWR0aCAvIHdpbmRvd0hlaWdodDtcclxuXHJcbiAgICAgICAgaWYgKGN1cnJlbnRXaW5kb3dBc3BlY3RSYXRpbyA+IHRhcmdldEFzcGVjdFJhdGlvKSB7XHJcbiAgICAgICAgICAgIG5ld0hlaWdodCA9IHdpbmRvd0hlaWdodDtcclxuICAgICAgICAgICAgbmV3V2lkdGggPSBuZXdIZWlnaHQgKiB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBuZXdXaWR0aCA9IHdpbmRvd1dpZHRoO1xyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSBuZXdXaWR0aCAvIHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKG5ld1dpZHRoLCBuZXdIZWlnaHQsIGZhbHNlKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcblxyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5jYW52YXMuc3R5bGUsIHtcclxuICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIG9iamVjdEZpdDogJ2NvbnRhaW4nXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgICAgIGhlaWdodDogYCR7bmV3SGVpZ2h0fXB4YCxcclxuICAgICAgICAgICAgICAgIHRvcDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgd2hpY2gga2V5cyBhcmUgY3VycmVudGx5IHByZXNzZWQgZG93bi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQua2V5LnRvTG93ZXJDYXNlKCldID0gdHJ1ZTtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpID09PSAnICcpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVySnVtcCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcmVsZWFzZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgbW91c2UgYnV0dG9uIHByZXNzIHN0YXRlLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uTW91c2VEb3duKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5idXR0b24gPT09IDApIHsgLy8gTGVmdCBtb3VzZSBidXR0b25cclxuICAgICAgICAgICAgICAgIHRoaXMua2V5c1snbW91c2UwJ10gPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyBtb3VzZSBidXR0b24gcmVsZWFzZSBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbk1vdXNlVXAoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICBpZiAoZXZlbnQuYnV0dG9uID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMua2V5c1snbW91c2UwJ10gPSBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIG1vdXNlIG1vdmVtZW50IGZvciBjYW1lcmEgcm90YXRpb24gKG1vdXNlIGxvb2spLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uTW91c2VNb3ZlKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WCA9IGV2ZW50Lm1vdmVtZW50WCB8fCAwO1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFkgPSBldmVudC5tb3ZlbWVudFkgfHwgMDtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnJvdGF0aW9uLnkgLT0gbW92ZW1lbnRYICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggLT0gbW92ZW1lbnRZICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggPSBNYXRoLm1heCgtTWF0aC5QSSAvIDIsIE1hdGgubWluKE1hdGguUEkgLyAyLCB0aGlzLmNhbWVyYVBpdGNoKSk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnJvdGF0aW9uLnggPSB0aGlzLmNhbWVyYVBpdGNoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBvaW50ZXIgbG9jayBzdGF0dXMgd2hlbiBpdCBjaGFuZ2VzIChlLmcuLCB1c2VyIHByZXNzZXMgRXNjKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrQ2hhbmdlKCkge1xyXG4gICAgICAgIGlmIChkb2N1bWVudC5wb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLm1velBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkud2Via2l0UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyIGxvY2tlZCcpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyIHVubG9ja2VkJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFuaW1hdGUodGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9ICh0aW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwO1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJBY3Rpb25zKGRlbHRhVGltZSk7IC8vIE5FVzogSGFuZGxlcyBwbGF5ZXIgbW92ZW1lbnQgYW5kIHNob290aW5nXHJcbiAgICAgICAgICAgIHRoaXMuc3Bhd25FbmVtaWVzKGRlbHRhVGltZSk7ICAgICAgICAvLyBORVc6IEhhbmRsZXMgZW5lbXkgc3Bhd25pbmdcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVFbnRpdGllcyhkZWx0YVRpbWUpOyAgICAgIC8vIE5FVzogVXBkYXRlcyBhbGwgZW5lbWllcyBhbmQgYnVsbGV0c1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lKTtcclxuICAgICAgICAgICAgdGhpcy5jbGFtcFBsYXllclBvc2l0aW9uKCk7XHJcbiAgICAgICAgICAgIHRoaXMuc3luY01lc2hlc1dpdGhCb2RpZXMoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN0ZXBzIHRoZSBDYW5ub24uanMgcGh5c2ljcyB3b3JsZCBmb3J3YXJkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICB0aGlzLndvcmxkLnN0ZXAoMSAvIDYwLCBkZWx0YVRpbWUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tYXhQaHlzaWNzU3ViU3RlcHMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBIYW5kbGVzIHBsYXllci1zcGVjaWZpYyBhY3Rpb25zIGxpa2UgbW92ZW1lbnQgYW5kIHNob290aW5nLlxyXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSBUaW1lIGVsYXBzZWQgc2luY2UgbGFzdCBmcmFtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJBY3Rpb25zKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBFeGlzdGluZyBtb3ZlbWVudCBsb2dpY1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgc2hvb3RpbmcgbG9naWNcclxuICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHBlcmZvcm1hbmNlLm5vdygpIC8gMTAwMDsgLy8gR2V0IGN1cnJlbnQgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgaWYgKHRoaXMuaXNQb2ludGVyTG9ja2VkICYmIHRoaXMua2V5c1snbW91c2UwJ10gJiYgY3VycmVudFRpbWUgLSB0aGlzLmxhc3RGaXJlVGltZSA+PSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyRmlyZVJhdGUpIHtcclxuICAgICAgICAgICAgdGhpcy5sYXN0RmlyZVRpbWUgPSBjdXJyZW50VGltZTsgLy8gUmVzZXQgZmlyZSB0aW1lclxyXG5cclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0U3RhcnRQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKGJ1bGxldFN0YXJ0UG9zKTsgLy8gQnVsbGV0IHN0YXJ0cyBhdCBjYW1lcmEgcG9zaXRpb25cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldERpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKGJ1bGxldERpcmVjdGlvbik7IC8vIEJ1bGxldCBmaXJlcyBpbiBjYW1lcmEncyBmb3J3YXJkIGRpcmVjdGlvblxyXG5cclxuICAgICAgICAgICAgdGhpcy5jcmVhdGVCdWxsZXQoXHJcbiAgICAgICAgICAgICAgICBidWxsZXRTdGFydFBvcyxcclxuICAgICAgICAgICAgICAgIGJ1bGxldERpcmVjdGlvbixcclxuICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJCdWxsZXRTcGVlZCxcclxuICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJCdWxsZXREYW1hZ2UsXHJcbiAgICAgICAgICAgICAgICBHYW1lT2JqZWN0VHlwZS5QTEFZRVIsXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVcGRhdGVzIHRoZSBwbGF5ZXIncyB2ZWxvY2l0eSBiYXNlZCBvbiBXQVNEIGlucHV0IGFuZCBjYW1lcmEgb3JpZW50YXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGxheWVyTW92ZW1lbnQoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVmZmVjdGl2ZVBsYXllclNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9PT0gMCkge1xyXG4gICAgICAgICAgICBlZmZlY3RpdmVQbGF5ZXJTcGVlZCAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyQ29udHJvbEZhY3RvcjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudFlWZWxvY2l0eSA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1vdmVEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAwKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FtZXJhRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi55ID0gMDtcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFVwID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICBjYW1lcmFSaWdodC5jcm9zc1ZlY3RvcnMoZ2xvYmFsVXAsIGNhbWVyYURpcmVjdGlvbikubm9ybWFsaXplKCk7IFxyXG5cclxuICAgICAgICBsZXQgbW92aW5nID0gZmFsc2U7XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sncyddKSB7XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3cnXSkge1xyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydhJ10pIHtcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snZCddKSB7XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYVJpZ2h0KTsgXHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAobW92aW5nKSB7XHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24ubm9ybWFsaXplKCkubXVsdGlwbHlTY2FsYXIoZWZmZWN0aXZlUGxheWVyU3BlZWQpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IG1vdmVEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBtb3ZlRGlyZWN0aW9uLno7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyRGVjZWxlcmF0aW9uO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gY3VycmVudFlWZWxvY2l0eTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFwcGxpZXMgYW4gdXB3YXJkIGltcHVsc2UgdG8gdGhlIHBsYXllciBib2R5IGZvciBqdW1waW5nLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHBsYXllckp1bXAoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gMDsgXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5hcHBseUltcHVsc2UoXHJcbiAgICAgICAgICAgICAgICBuZXcgQ0FOTk9OLlZlYzMoMCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmp1bXBGb3JjZSwgMCksXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb25cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IE1hbmFnZXMgc3Bhd25pbmcgb2YgZW5lbWllcyBpbnRvIHRoZSBnYW1lIHdvcmxkLlxyXG4gICAgICogQHBhcmFtIGRlbHRhVGltZSBUaW1lIGVsYXBzZWQgc2luY2UgbGFzdCBmcmFtZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzcGF3bkVuZW1pZXMoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBpZiAodGhpcy5lbmVtaWVzLmxlbmd0aCA8IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteU1heENvdW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lICs9IGRlbHRhVGltZTtcclxuICAgICAgICAgICAgaWYgKHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID49IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteVNwYXduSW50ZXJ2YWwpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubGFzdEVuZW15U3Bhd25UaW1lID0gMDsgLy8gUmVzZXQgdGltZXJcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBTcGF3biBlbmVteSBhdCBhIHJhbmRvbSBwb3NpdGlvbiB3aXRoaW4gdGhlIGdyb3VuZCBsaW1pdHMsIHNsaWdodGx5IGFib3ZlIGdyb3VuZFxyXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdW5kU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplO1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc3Bhd25YID0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogZ3JvdW5kU2l6ZSAqIDAuODsgLy8gODAlIG9mIGdyb3VuZCBzaXplIHRvIGF2b2lkIGVkZ2Ugc3Bhd25zXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzcGF3blogPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiBncm91bmRTaXplICogMC44O1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc3Bhd25ZID0gNTsgLy8gU3Bhd24gYSBiaXQgYWJvdmUgZ3JvdW5kIHRvIGZhbGwgbmF0dXJhbGx5XHJcblxyXG4gICAgICAgICAgICAgICAgdGhpcy5jcmVhdGVFbmVteShuZXcgVEhSRUUuVmVjdG9yMyhzcGF3blgsIHNwYXduWSwgc3Bhd25aKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFVwZGF0ZXMgYWxsIGR5bmFtaWMgZ2FtZSBlbnRpdGllcyAoZW5lbWllcyBhbmQgYnVsbGV0cykuXHJcbiAgICAgKiBAcGFyYW0gZGVsdGFUaW1lIFRpbWUgZWxhcHNlZCBzaW5jZSBsYXN0IGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZUVudGl0aWVzKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgLy8gVXBkYXRlIGVuZW1pZXMgKGUuZy4sIEFJIG1vdmVtZW50KVxyXG4gICAgICAgIGZvciAobGV0IGkgPSB0aGlzLmVuZW1pZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICAgICAgY29uc3QgZW5lbXkgPSB0aGlzLmVuZW1pZXNbaV07XHJcbiAgICAgICAgICAgIGVuZW15LnVwZGF0ZShkZWx0YVRpbWUsIHRoaXMucGxheWVyQm9keSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgYnVsbGV0cyAoZS5nLiwgY2hlY2sgbGlmZXRpbWUsIG1vdmUgdmlzdWFscylcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5idWxsZXRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IHRoaXMuYnVsbGV0c1tpXTtcclxuICAgICAgICAgICAgYnVsbGV0LnVwZGF0ZShkZWx0YVRpbWUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogQ3JlYXRlcyBhIG5ldyBFbmVteSBpbnN0YW5jZSBhbmQgYWRkcyBpdCB0byB0aGUgZ2FtZS5cclxuICAgICAqIEBwYXJhbSBwb3NpdGlvbiBJbml0aWFsIHBvc2l0aW9uIG9mIHRoZSBlbmVteS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVFbmVteShwb3NpdGlvbjogVEhSRUUuVmVjdG9yMykge1xyXG4gICAgICAgIGNvbnN0IGVuZW15ID0gbmV3IEVuZW15KHRoaXMsIHBvc2l0aW9uKTtcclxuICAgICAgICB0aGlzLmVuZW1pZXMucHVzaChlbmVteSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFJlbW92ZXMgYSBzcGVjaWZpYyBFbmVteSBpbnN0YW5jZSBmcm9tIHRoZSBnYW1lJ3MgYWN0aXZlIGxpc3QuXHJcbiAgICAgKiBDYWxsZWQgYnkgdGhlIEVuZW15IGl0c2VsZiB3aGVuIGl0J3MgZGVzdHJveWVkLlxyXG4gICAgICogQHBhcmFtIGVuZW15VG9SZW1vdmUgVGhlIEVuZW15IGluc3RhbmNlIHRvIHJlbW92ZS5cclxuICAgICAqL1xyXG4gICAgcmVtb3ZlRW5lbXkoZW5lbXlUb1JlbW92ZTogRW5lbXkpIHtcclxuICAgICAgICB0aGlzLmVuZW1pZXMgPSB0aGlzLmVuZW1pZXMuZmlsdGVyKGVuZW15ID0+IGVuZW15ICE9PSBlbmVteVRvUmVtb3ZlKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogQ3JlYXRlcyBhIG5ldyBCdWxsZXQgaW5zdGFuY2UgYW5kIGFkZHMgaXQgdG8gdGhlIGdhbWUuXHJcbiAgICAgKiBAcGFyYW0gcG9zaXRpb24gU3RhcnRpbmcgcG9zaXRpb24gb2YgdGhlIGJ1bGxldC5cclxuICAgICAqIEBwYXJhbSBkaXJlY3Rpb24gRmlyaW5nIGRpcmVjdGlvbiBvZiB0aGUgYnVsbGV0LlxyXG4gICAgICogQHBhcmFtIHNwZWVkIFNwZWVkIG9mIHRoZSBidWxsZXQuXHJcbiAgICAgKiBAcGFyYW0gZGFtYWdlIERhbWFnZSB0aGUgYnVsbGV0IGRlYWxzIG9uIGhpdC5cclxuICAgICAqIEBwYXJhbSBzaG9vdGVyVHlwZSBUeXBlIG9mIGVudGl0eSB0aGF0IGZpcmVkIHRoZSBidWxsZXQgKFBMQVlFUi9FTkVNWSkuXHJcbiAgICAgKiBAcGFyYW0gb3duZXJCb2R5IFRoZSBwaHlzaWNzIGJvZHkgb2YgdGhlIGVudGl0eSB0aGF0IGZpcmVkIHRoZSBidWxsZXQgKGZvciBjb2xsaXNpb24gZmlsdGVyaW5nKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVCdWxsZXQocG9zaXRpb246IFRIUkVFLlZlY3RvcjMsIGRpcmVjdGlvbjogVEhSRUUuVmVjdG9yMywgc3BlZWQ6IG51bWJlciwgZGFtYWdlOiBudW1iZXIsIHNob290ZXJUeXBlOiBHYW1lT2JqZWN0VHlwZSwgb3duZXJCb2R5OiBDYW5ub25Cb2R5V2l0aFVzZXJEYXRhKSB7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0ID0gbmV3IEJ1bGxldCh0aGlzLCBwb3NpdGlvbiwgZGlyZWN0aW9uLCBzcGVlZCwgZGFtYWdlLCBzaG9vdGVyVHlwZSwgb3duZXJCb2R5KTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMucHVzaChidWxsZXQpO1xyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnZ3Vuc2hvdF9zb3VuZCcpPy5wbGF5KCkuY2F0Y2goZSA9PiB7fSk7IC8vIFBsYXkgZ3Vuc2hvdCBzb3VuZFxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBSZW1vdmVzIGEgc3BlY2lmaWMgQnVsbGV0IGluc3RhbmNlIGZyb20gdGhlIGdhbWUncyBhY3RpdmUgbGlzdC5cclxuICAgICAqIENhbGxlZCBieSB0aGUgQnVsbGV0IGl0c2VsZiB3aGVuIGl0J3MgZGVzdHJveWVkLlxyXG4gICAgICogQHBhcmFtIGJ1bGxldFRvUmVtb3ZlIFRoZSBCdWxsZXQgaW5zdGFuY2UgdG8gcmVtb3ZlLlxyXG4gICAgICovXHJcbiAgICByZW1vdmVCdWxsZXQoYnVsbGV0VG9SZW1vdmU6IEJ1bGxldCkge1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cyA9IHRoaXMuYnVsbGV0cy5maWx0ZXIoYnVsbGV0ID0+IGJ1bGxldCAhPT0gYnVsbGV0VG9SZW1vdmUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xhbXBzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbiB3aXRoaW4gdGhlIGRlZmluZWQgZ3JvdW5kIGJvdW5kYXJpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY2xhbXBQbGF5ZXJQb3NpdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyQm9keSB8fCAhdGhpcy5jb25maWcpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcblxyXG4gICAgICAgIGxldCBwb3NYID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLng7XHJcbiAgICAgICAgbGV0IHBvc1ogPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24uejtcclxuICAgICAgICBsZXQgdmVsWCA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54O1xyXG4gICAgICAgIGxldCB2ZWxaID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lno7XHJcblxyXG4gICAgICAgIGlmIChwb3NYID4gaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZTtcclxuICAgICAgICAgICAgaWYgKHZlbFggPiAwKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ggPCAtaGFsZkdyb3VuZFNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYIDwgMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAocG9zWiA+IGhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gaGFsZkdyb3VuZFNpemU7XHJcbiAgICAgICAgICAgIGlmICh2ZWxaID4gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwb3NaIDwgLWhhbGZHcm91bmRTaXplKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gLWhhbGZHcm91bmRTaXplO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA8IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN5bmNocm9uaXplcyB0aGUgdmlzdWFsIG1lc2hlcyB3aXRoIHRoZWlyIGNvcnJlc3BvbmRpbmcgcGh5c2ljcyBib2RpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3luY01lc2hlc1dpdGhCb2RpZXMoKSB7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMuY2FtZXJhQ29udGFpbmVyLnF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAvLyBHcm91bmQgYW5kIHBsYWNlZCBvYmplY3RzIGFyZSBzdGF0aWMsIHNvIG5vIG5lZWQgdG8gc3luYyBhZnRlciBpbml0aWFsIHNldHVwLlxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSBET00gY29udGVudCBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIG5ldyBHYW1lKCk7XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFHeEIsSUFBSyxZQUFMLGtCQUFLQSxlQUFMO0FBQ0ksRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUZDLFNBQUFBO0FBQUEsR0FBQTtBQU1MLElBQUssaUJBQUwsa0JBQUtDLG9CQUFMO0FBQ0ksRUFBQUEsZ0NBQUE7QUFDQSxFQUFBQSxnQ0FBQTtBQUNBLEVBQUFBLGdDQUFBO0FBQ0EsRUFBQUEsZ0NBQUE7QUFKQyxTQUFBQTtBQUFBLEdBQUE7QUErREwsTUFBTSxNQUFNO0FBQUE7QUFBQSxFQU1SLFlBQVksTUFBWSxVQUF5QjtBQUM3QyxTQUFLLE9BQU87QUFDWixTQUFLLFNBQVMsS0FBSyxPQUFPLGFBQWE7QUFFdkMsVUFBTSxlQUFlLEtBQUssU0FBUyxJQUFJLGVBQWU7QUFDdEQsVUFBTSxnQkFBZ0IsSUFBSSxNQUFNLG9CQUFvQjtBQUFBLE1BQ2hELEtBQUs7QUFBQSxNQUNMLE9BQU8sZUFBZSxXQUFXO0FBQUE7QUFBQSxJQUNyQyxDQUFDO0FBQ0QsVUFBTSxnQkFBZ0IsSUFBSSxNQUFNLFlBQVksR0FBRyxHQUFHLENBQUM7QUFDbkQsU0FBSyxPQUFPLElBQUksTUFBTSxLQUFLLGVBQWUsYUFBYTtBQUN2RCxTQUFLLEtBQUssU0FBUyxLQUFLLFFBQVE7QUFDaEMsU0FBSyxLQUFLLGFBQWE7QUFDdkIsU0FBSyxNQUFNLElBQUksS0FBSyxJQUFJO0FBRXhCLFVBQU0sYUFBYSxJQUFJLE9BQU8sSUFBSSxJQUFJLE9BQU8sS0FBSyxLQUFLLEdBQUcsR0FBRyxDQUFDO0FBQzlELFNBQUssT0FBTyxJQUFJLE9BQU8sS0FBSztBQUFBLE1BQ3hCLE1BQU07QUFBQTtBQUFBLE1BQ04sVUFBVSxJQUFJLE9BQU8sS0FBSyxTQUFTLEdBQUcsU0FBUyxHQUFHLFNBQVMsQ0FBQztBQUFBLE1BQzVELE9BQU87QUFBQSxNQUNQLGVBQWU7QUFBQTtBQUFBLE1BQ2YsVUFBVSxLQUFLO0FBQUE7QUFBQSxJQUNuQixDQUFDO0FBRUQsU0FBSyxLQUFLLFdBQVcsRUFBRSxNQUFNLGVBQXNCLFVBQVUsS0FBSztBQUNsRSxTQUFLLE1BQU0sUUFBUSxLQUFLLElBQUk7QUFBQSxFQUNoQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE9BQU8sV0FBbUIsWUFBeUI7QUFFL0MsVUFBTSxZQUFZLFdBQVc7QUFDN0IsVUFBTSxXQUFXLEtBQUssS0FBSztBQUMzQixVQUFNLFlBQVksSUFBSSxPQUFPLEtBQUs7QUFDbEMsY0FBVSxLQUFLLFVBQVUsU0FBUztBQUNsQyxjQUFVLElBQUk7QUFDZCxjQUFVLFVBQVU7QUFHcEIsVUFBTSxrQkFBa0IsVUFBVSxNQUFNLEtBQUssS0FBSyxPQUFPLGFBQWEsVUFBVTtBQUNoRixTQUFLLEtBQUssU0FBUyxJQUFJLGdCQUFnQjtBQUN2QyxTQUFLLEtBQUssU0FBUyxJQUFJLGdCQUFnQjtBQUd2QyxTQUFLLEtBQUssU0FBUyxLQUFLLEtBQUssS0FBSyxRQUFvQztBQUV0RSxVQUFNLFlBQVksSUFBSSxNQUFNLFFBQVEsVUFBVSxHQUFHLFNBQVMsR0FBRyxVQUFVLENBQUM7QUFDeEUsU0FBSyxLQUFLLE9BQU8sU0FBUztBQUMxQixTQUFLLEtBQUssU0FBUyxJQUFJO0FBQ3ZCLFNBQUssS0FBSyxTQUFTLElBQUk7QUFBQSxFQUMzQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxXQUFXLFFBQWdCO0FBQ3ZCLFNBQUssVUFBVTtBQUNmLFNBQUssS0FBSyxPQUFPLElBQUksaUJBQWlCLEdBQUcsS0FBSyxFQUFFLE1BQU0sT0FBSztBQUFBLElBQUMsQ0FBQztBQUM3RCxRQUFJLEtBQUssVUFBVSxHQUFHO0FBQ2xCLFdBQUssUUFBUTtBQUFBLElBRWpCO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsVUFBVTtBQUNOLFNBQUssS0FBSyxNQUFNLE9BQU8sS0FBSyxJQUFJO0FBQ2hDLFNBQUssS0FBSyxNQUFNLFdBQVcsS0FBSyxJQUFJO0FBQ3BDLFNBQUssS0FBSyxZQUFZLElBQUk7QUFDMUIsU0FBSyxLQUFLLE9BQU8sSUFBSSxtQkFBbUIsR0FBRyxLQUFLLEVBQUUsTUFBTSxPQUFLO0FBQUEsSUFBQyxDQUFDO0FBQUEsRUFDbkU7QUFDSjtBQU1BLE1BQU0sT0FBTztBQUFBO0FBQUEsRUFTVCxZQUFZLE1BQVksVUFBeUIsV0FBMEIsT0FBZSxRQUFnQixhQUE2QixXQUFtQztBQUN0SyxTQUFLLE9BQU87QUFDWixTQUFLLFNBQVM7QUFDZCxTQUFLLGNBQWM7QUFDbkIsU0FBSyxXQUFXLEtBQUssT0FBTyxhQUFhO0FBQ3pDLFNBQUssWUFBWTtBQUVqQixVQUFNLGdCQUFnQixLQUFLLFNBQVMsSUFBSSxnQkFBZ0I7QUFDeEQsVUFBTSxpQkFBaUIsSUFBSSxNQUFNLG9CQUFvQjtBQUFBLE1BQ2pELEtBQUs7QUFBQSxNQUNMLE9BQU8sZ0JBQWdCLFdBQVc7QUFBQTtBQUFBLElBQ3RDLENBQUM7QUFDRCxVQUFNLGlCQUFpQixJQUFJLE1BQU0sZUFBZSxLQUFLLEdBQUcsQ0FBQztBQUN6RCxTQUFLLE9BQU8sSUFBSSxNQUFNLEtBQUssZ0JBQWdCLGNBQWM7QUFDekQsU0FBSyxLQUFLLFNBQVMsS0FBSyxRQUFRO0FBQ2hDLFNBQUssS0FBSyxhQUFhO0FBQ3ZCLFNBQUssTUFBTSxJQUFJLEtBQUssSUFBSTtBQUV4QixVQUFNLGNBQWMsSUFBSSxPQUFPLE9BQU8sR0FBRztBQUN6QyxTQUFLLE9BQU8sSUFBSSxPQUFPLEtBQUs7QUFBQSxNQUN4QixNQUFNO0FBQUE7QUFBQSxNQUNOLFVBQVUsSUFBSSxPQUFPLEtBQUssU0FBUyxHQUFHLFNBQVMsR0FBRyxTQUFTLENBQUM7QUFBQSxNQUM1RCxPQUFPO0FBQUEsTUFDUCxXQUFXO0FBQUE7QUFBQSxNQUNYLFVBQVUsS0FBSztBQUFBO0FBQUEsSUFDbkIsQ0FBQztBQUVELFNBQUssS0FBSyxTQUFTLElBQUksVUFBVSxJQUFJLE9BQU8sVUFBVSxJQUFJLE9BQU8sVUFBVSxJQUFJLEtBQUs7QUFDcEYsU0FBSyxLQUFLLGFBQWE7QUFHdkIsU0FBSyxLQUFLLFdBQVcsRUFBRSxNQUFNLGdCQUF1QixVQUFVLE1BQU0sT0FBTyxLQUFLLFVBQVU7QUFDMUYsU0FBSyxNQUFNLFFBQVEsS0FBSyxJQUFJO0FBQUEsRUFDaEM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsT0FBTyxXQUFtQjtBQUN0QixTQUFLLFlBQVk7QUFDakIsUUFBSSxLQUFLLFlBQVksR0FBRztBQUNwQixXQUFLLFFBQVE7QUFDYjtBQUFBLElBQ0o7QUFDQSxTQUFLLEtBQUssU0FBUyxLQUFLLEtBQUssS0FBSyxRQUFvQztBQUN0RSxTQUFLLEtBQUssV0FBVyxLQUFLLEtBQUssS0FBSyxVQUF5QztBQUFBLEVBQ2pGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxVQUFVO0FBQ04sU0FBSyxLQUFLLE1BQU0sT0FBTyxLQUFLLElBQUk7QUFDaEMsU0FBSyxLQUFLLE1BQU0sV0FBVyxLQUFLLElBQUk7QUFDcEMsU0FBSyxLQUFLLGFBQWEsSUFBSTtBQUFBLEVBQy9CO0FBQ0o7QUFNQSxNQUFNLEtBQUs7QUFBQSxFQXFEUCxjQUFjO0FBbkRkO0FBQUEsU0FBUSxRQUFtQjtBQXNCM0IsU0FBUSxxQkFBbUMsQ0FBQztBQUM1QyxTQUFRLHFCQUErQyxDQUFDO0FBR3hEO0FBQUEsbUJBQW1CLENBQUM7QUFDcEIsbUJBQW9CLENBQUM7QUFDckIsU0FBUSxxQkFBNkI7QUFDckM7QUFBQSxTQUFRLGVBQXVCO0FBRy9CO0FBQUE7QUFBQSxTQUFRLE9BQW1DLENBQUM7QUFDNUM7QUFBQSxTQUFRLGtCQUEyQjtBQUNuQztBQUFBLFNBQVEsY0FBc0I7QUFHOUI7QUFBQTtBQUFBLG9CQUF1QyxvQkFBSSxJQUFJO0FBQy9DO0FBQUEsa0JBQXdDLG9CQUFJLElBQUk7QUFRaEQ7QUFBQSxTQUFRLFdBQWdDO0FBR3hDO0FBQUEsU0FBUSxnQ0FBd0M7QUFJNUMsU0FBSyxTQUFTLFNBQVMsZUFBZSxZQUFZO0FBQ2xELFFBQUksQ0FBQyxLQUFLLFFBQVE7QUFDZCxjQUFRLE1BQU0sZ0RBQWdEO0FBQzlEO0FBQUEsSUFDSjtBQUNBLFNBQUssS0FBSztBQUFBLEVBQ2Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQWMsT0FBTztBQUVqQixRQUFJO0FBQ0EsWUFBTSxXQUFXLE1BQU0sTUFBTSxXQUFXO0FBQ3hDLFVBQUksQ0FBQyxTQUFTLElBQUk7QUFDZCxjQUFNLElBQUksTUFBTSx1QkFBdUIsU0FBUyxNQUFNLEVBQUU7QUFBQSxNQUM1RDtBQUNBLFdBQUssU0FBUyxNQUFNLFNBQVMsS0FBSztBQUNsQyxjQUFRLElBQUksOEJBQThCLEtBQUssTUFBTTtBQUFBLElBQ3pELFNBQVMsT0FBTztBQUNaLGNBQVEsTUFBTSxzQ0FBc0MsS0FBSztBQUV6RCxZQUFNLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDN0MsZUFBUyxNQUFNLFdBQVc7QUFDMUIsZUFBUyxNQUFNLE1BQU07QUFDckIsZUFBUyxNQUFNLE9BQU87QUFDdEIsZUFBUyxNQUFNLFlBQVk7QUFDM0IsZUFBUyxNQUFNLFFBQVE7QUFDdkIsZUFBUyxNQUFNLFdBQVc7QUFDMUIsZUFBUyxjQUFjO0FBQ3ZCLGVBQVMsS0FBSyxZQUFZLFFBQVE7QUFDbEM7QUFBQSxJQUNKO0FBR0EsU0FBSyxRQUFRLElBQUksTUFBTSxNQUFNO0FBQzdCLFNBQUssU0FBUyxJQUFJLE1BQU07QUFBQSxNQUNwQjtBQUFBO0FBQUEsTUFDQSxLQUFLLE9BQU8sYUFBYSxpQkFBaUIsUUFBUSxLQUFLLE9BQU8sYUFBYSxpQkFBaUI7QUFBQTtBQUFBLE1BQzVGLEtBQUssT0FBTyxhQUFhO0FBQUE7QUFBQSxNQUN6QixLQUFLLE9BQU8sYUFBYTtBQUFBO0FBQUEsSUFDN0I7QUFDQSxTQUFLLFdBQVcsSUFBSSxNQUFNLGNBQWMsRUFBRSxRQUFRLEtBQUssUUFBUSxXQUFXLEtBQUssQ0FBQztBQUNoRixTQUFLLFNBQVMsY0FBYyxPQUFPLGdCQUFnQjtBQUNuRCxTQUFLLFNBQVMsVUFBVSxVQUFVO0FBQ2xDLFNBQUssU0FBUyxVQUFVLE9BQU8sTUFBTTtBQUVyQyxTQUFLLGtCQUFrQixJQUFJLE1BQU0sU0FBUztBQUMxQyxTQUFLLE1BQU0sSUFBSSxLQUFLLGVBQWU7QUFDbkMsU0FBSyxnQkFBZ0IsSUFBSSxLQUFLLE1BQU07QUFDcEMsU0FBSyxPQUFPLFNBQVMsSUFBSSxLQUFLLE9BQU8sYUFBYTtBQUlsRCxTQUFLLFFBQVEsSUFBSSxPQUFPLE1BQU07QUFDOUIsU0FBSyxNQUFNLFFBQVEsSUFBSSxHQUFHLE9BQU8sQ0FBQztBQUNsQyxTQUFLLE1BQU0sYUFBYSxJQUFJLE9BQU8sY0FBYyxLQUFLLEtBQUs7QUFDM0QsSUFBQyxLQUFLLE1BQU0sT0FBMkIsYUFBYTtBQUdwRCxTQUFLLGlCQUFpQixJQUFJLE9BQU8sU0FBUyxnQkFBZ0I7QUFDMUQsU0FBSyxpQkFBaUIsSUFBSSxPQUFPLFNBQVMsZ0JBQWdCO0FBQzFELFNBQUssd0JBQXdCLElBQUksT0FBTyxTQUFTLHVCQUF1QjtBQUV4RSxVQUFNLDhCQUE4QixJQUFJLE9BQU87QUFBQSxNQUMzQyxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxFQUFFLFVBQVUsS0FBSyxPQUFPLGFBQWEsc0JBQXNCLGFBQWEsRUFBSTtBQUFBLElBQ2hGO0FBQ0EsU0FBSyxNQUFNLG1CQUFtQiwyQkFBMkI7QUFFekQsVUFBTSw4QkFBOEIsSUFBSSxPQUFPO0FBQUEsTUFDM0MsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsRUFBRSxVQUFVLEtBQUssT0FBTyxhQUFhLHNCQUFzQixhQUFhLEVBQUk7QUFBQSxJQUNoRjtBQUNBLFNBQUssTUFBTSxtQkFBbUIsMkJBQTJCO0FBRXpELFVBQU0sOEJBQThCLElBQUksT0FBTztBQUFBLE1BQzNDLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEVBQUUsVUFBVSxLQUFLLE9BQU8sYUFBYSxzQkFBc0IsYUFBYSxFQUFJO0FBQUEsSUFDaEY7QUFDQSxTQUFLLE1BQU0sbUJBQW1CLDJCQUEyQjtBQUd6RCxVQUFNLDhCQUE4QixJQUFJLE9BQU87QUFBQSxNQUMzQyxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxFQUFFLFVBQVUsS0FBSyxhQUFhLElBQUk7QUFBQTtBQUFBLElBQ3RDO0FBQ0EsU0FBSyxNQUFNLG1CQUFtQiwyQkFBMkI7QUFJekQsVUFBTSxLQUFLLFdBQVc7QUFHdEIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssYUFBYTtBQUNsQixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLGNBQWM7QUFHbkIsU0FBSyxNQUFNLGlCQUFpQixnQkFBZ0IsQ0FBQyxVQUFVO0FBQ25ELFlBQU0sUUFBUSxNQUFNO0FBQ3BCLFlBQU0sUUFBUSxNQUFNO0FBR3BCLFVBQUksTUFBTSxVQUFVLFNBQVMsa0JBQXlCLE1BQU0sVUFBVSxTQUFTLGdCQUF1QjtBQUNsRyxjQUFNLFlBQVksTUFBTSxVQUFVLFNBQVMsaUJBQXdCLFFBQVE7QUFDM0UsWUFBSSxVQUFVLFlBQVksVUFBVSxTQUFTLFNBQVMsdUJBQThCO0FBQ2hGLGVBQUs7QUFBQSxRQUNUO0FBQUEsTUFDSjtBQUdBLFVBQUk7QUFDSixVQUFJO0FBR0osVUFBSSxNQUFNLFVBQVUsU0FBUyxnQkFBdUI7QUFDaEQseUJBQWlCLE1BQU0sU0FBUztBQUNoQyxxQkFBYTtBQUFBLE1BQ2pCLFdBQVcsTUFBTSxVQUFVLFNBQVMsZ0JBQXVCO0FBQ3ZELHlCQUFpQixNQUFNLFNBQVM7QUFDaEMscUJBQWE7QUFBQSxNQUNqQjtBQUVBLFVBQUksa0JBQWtCLFlBQVk7QUFHOUIsWUFBSSxlQUFlLGNBQWMsWUFBWTtBQUN6QztBQUFBLFFBQ0o7QUFFQSxnQkFBUSxXQUFXLFVBQVUsTUFBTTtBQUFBLFVBQy9CLEtBQUs7QUFDRCxrQkFBTSxnQkFBZ0IsV0FBVyxTQUFTO0FBQzFDLDBCQUFjLFdBQVcsZUFBZSxNQUFNO0FBQzlDLDJCQUFlLFFBQVE7QUFDdkI7QUFBQSxVQUNKLEtBQUs7QUFDRCwyQkFBZSxRQUFRO0FBQ3ZCO0FBQUEsUUFFUjtBQUFBLE1BQ0o7QUFBQSxJQUNKLENBQUM7QUFFRCxTQUFLLE1BQU0saUJBQWlCLGNBQWMsQ0FBQyxVQUFVO0FBQ2pELFlBQU0sUUFBUSxNQUFNO0FBQ3BCLFlBQU0sUUFBUSxNQUFNO0FBRXBCLFVBQUksTUFBTSxVQUFVLFNBQVMsa0JBQXlCLE1BQU0sVUFBVSxTQUFTLGdCQUF1QjtBQUNsRyxjQUFNLFlBQVksTUFBTSxVQUFVLFNBQVMsaUJBQXdCLFFBQVE7QUFDM0UsWUFBSSxVQUFVLFlBQVksVUFBVSxTQUFTLFNBQVMsdUJBQThCO0FBQ2hGLGVBQUssZ0NBQWdDLEtBQUssSUFBSSxHQUFHLEtBQUssZ0NBQWdDLENBQUM7QUFBQSxRQUMzRjtBQUFBLE1BQ0o7QUFBQSxJQUNKLENBQUM7QUFHRCxXQUFPLGlCQUFpQixVQUFVLEtBQUssZUFBZSxLQUFLLElBQUksQ0FBQztBQUNoRSxhQUFTLGlCQUFpQixXQUFXLEtBQUssVUFBVSxLQUFLLElBQUksQ0FBQztBQUM5RCxhQUFTLGlCQUFpQixTQUFTLEtBQUssUUFBUSxLQUFLLElBQUksQ0FBQztBQUMxRCxhQUFTLGlCQUFpQixhQUFhLEtBQUssWUFBWSxLQUFLLElBQUksQ0FBQztBQUNsRSxhQUFTLGlCQUFpQixhQUFhLEtBQUssWUFBWSxLQUFLLElBQUksQ0FBQztBQUNsRSxhQUFTLGlCQUFpQixXQUFXLEtBQUssVUFBVSxLQUFLLElBQUksQ0FBQztBQUM5RCxhQUFTLGlCQUFpQixxQkFBcUIsS0FBSyxvQkFBb0IsS0FBSyxJQUFJLENBQUM7QUFDbEYsYUFBUyxpQkFBaUIsd0JBQXdCLEtBQUssb0JBQW9CLEtBQUssSUFBSSxDQUFDO0FBQ3JGLGFBQVMsaUJBQWlCLDJCQUEyQixLQUFLLG9CQUFvQixLQUFLLElBQUksQ0FBQztBQUd4RixTQUFLLHNCQUFzQjtBQUczQixTQUFLLGlCQUFpQjtBQUd0QixTQUFLLFFBQVEsQ0FBQztBQUFBLEVBQ2xCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxNQUFjLGFBQWE7QUFDdkIsVUFBTSxnQkFBZ0IsSUFBSSxNQUFNLGNBQWM7QUFDOUMsVUFBTSxnQkFBZ0IsS0FBSyxPQUFPLE9BQU8sT0FBTyxJQUFJLFNBQU87QUFDdkQsYUFBTyxjQUFjLFVBQVUsSUFBSSxJQUFJLEVBQ2xDLEtBQUssYUFBVztBQUNiLGFBQUssU0FBUyxJQUFJLElBQUksTUFBTSxPQUFPO0FBQ25DLGdCQUFRLFFBQVEsTUFBTTtBQUN0QixnQkFBUSxRQUFRLE1BQU07QUFDdEIsWUFBSSxJQUFJLFNBQVMsa0JBQWtCO0FBQzlCLGtCQUFRLE9BQU8sSUFBSSxLQUFLLE9BQU8sYUFBYSxhQUFhLEdBQUcsS0FBSyxPQUFPLGFBQWEsYUFBYSxDQUFDO0FBQUEsUUFDeEc7QUFBQSxNQUNKLENBQUMsRUFDQSxNQUFNLFdBQVM7QUFDWixnQkFBUSxNQUFNLDJCQUEyQixJQUFJLElBQUksSUFBSSxLQUFLO0FBQUEsTUFDOUQsQ0FBQztBQUFBLElBQ1QsQ0FBQztBQUVELFVBQU0sZ0JBQWdCLEtBQUssT0FBTyxPQUFPLE9BQU8sSUFBSSxXQUFTO0FBQ3pELGFBQU8sSUFBSSxRQUFjLENBQUMsWUFBWTtBQUNsQyxjQUFNLFFBQVEsSUFBSSxNQUFNLE1BQU0sSUFBSTtBQUNsQyxjQUFNLFNBQVMsTUFBTTtBQUNyQixjQUFNLE9BQVEsTUFBTSxTQUFTO0FBQzdCLGNBQU0sbUJBQW1CLE1BQU07QUFDM0IsZUFBSyxPQUFPLElBQUksTUFBTSxNQUFNLEtBQUs7QUFDakMsa0JBQVE7QUFBQSxRQUNaO0FBQ0EsY0FBTSxVQUFVLE1BQU07QUFDbEIsa0JBQVEsTUFBTSx5QkFBeUIsTUFBTSxJQUFJLEVBQUU7QUFDbkQsa0JBQVE7QUFBQSxRQUNaO0FBQUEsTUFDSixDQUFDO0FBQUEsSUFDTCxDQUFDO0FBRUQsVUFBTSxRQUFRLElBQUksQ0FBQyxHQUFHLGVBQWUsR0FBRyxhQUFhLENBQUM7QUFDdEQsWUFBUSxJQUFJLGtCQUFrQixLQUFLLFNBQVMsSUFBSSxjQUFjLEtBQUssT0FBTyxJQUFJLFVBQVU7QUFBQSxFQUM1RjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsbUJBQW1CO0FBQ3ZCLFNBQUsscUJBQXFCLFNBQVMsY0FBYyxLQUFLO0FBQ3RELFdBQU8sT0FBTyxLQUFLLG1CQUFtQixPQUFPO0FBQUEsTUFDekMsVUFBVTtBQUFBLE1BQ1YsaUJBQWlCO0FBQUEsTUFDakIsU0FBUztBQUFBLE1BQVEsZUFBZTtBQUFBLE1BQ2hDLGdCQUFnQjtBQUFBLE1BQVUsWUFBWTtBQUFBLE1BQ3RDLE9BQU87QUFBQSxNQUFTLFlBQVk7QUFBQSxNQUM1QixVQUFVO0FBQUEsTUFBUSxXQUFXO0FBQUEsTUFBVSxRQUFRO0FBQUEsSUFDbkQsQ0FBQztBQUNELGFBQVMsS0FBSyxZQUFZLEtBQUssa0JBQWtCO0FBRWpELFNBQUssc0JBQXNCO0FBRTNCLFNBQUssWUFBWSxTQUFTLGNBQWMsS0FBSztBQUM3QyxTQUFLLFVBQVUsY0FBYyxLQUFLLE9BQU8sYUFBYTtBQUN0RCxTQUFLLG1CQUFtQixZQUFZLEtBQUssU0FBUztBQUVsRCxTQUFLLGFBQWEsU0FBUyxjQUFjLEtBQUs7QUFDOUMsU0FBSyxXQUFXLGNBQWMsS0FBSyxPQUFPLGFBQWE7QUFDdkQsV0FBTyxPQUFPLEtBQUssV0FBVyxPQUFPO0FBQUEsTUFDakMsV0FBVztBQUFBLE1BQVEsVUFBVTtBQUFBLElBQ2pDLENBQUM7QUFDRCxTQUFLLG1CQUFtQixZQUFZLEtBQUssVUFBVTtBQUVuRCxTQUFLLG1CQUFtQixpQkFBaUIsU0FBUyxNQUFNLEtBQUssVUFBVSxDQUFDO0FBRXhFLFNBQUssT0FBTyxJQUFJLGtCQUFrQixHQUFHLEtBQUssRUFBRSxNQUFNLE9BQUssUUFBUSxJQUFJLDRDQUE0QyxDQUFDLENBQUM7QUFBQSxFQUNySDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsWUFBWTtBQUNoQixTQUFLLFFBQVE7QUFDYixRQUFJLEtBQUssc0JBQXNCLEtBQUssbUJBQW1CLFlBQVk7QUFDL0QsZUFBUyxLQUFLLFlBQVksS0FBSyxrQkFBa0I7QUFBQSxJQUNyRDtBQUNBLFNBQUssT0FBTyxpQkFBaUIsU0FBUyxLQUFLLDBCQUEwQixLQUFLLElBQUksQ0FBQztBQUUvRSxTQUFLLE9BQU8sbUJBQW1CO0FBQy9CLFNBQUssT0FBTyxJQUFJLGtCQUFrQixHQUFHLEtBQUssRUFBRSxNQUFNLE9BQUssUUFBUSxJQUFJLHVDQUF1QyxDQUFDLENBQUM7QUFBQSxFQUNoSDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsNEJBQTRCO0FBQ2hDLFFBQUksS0FBSyxVQUFVLG1CQUFxQixDQUFDLEtBQUssaUJBQWlCO0FBQzNELFdBQUssT0FBTyxtQkFBbUI7QUFBQSxJQUNuQztBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGVBQWU7QUFDbkIsVUFBTSxnQkFBZ0IsS0FBSyxTQUFTLElBQUksZ0JBQWdCO0FBQ3hELFVBQU0saUJBQWlCLElBQUksTUFBTSxvQkFBb0I7QUFBQSxNQUNqRCxLQUFLO0FBQUEsTUFDTCxPQUFPLGdCQUFnQixXQUFXO0FBQUEsSUFDdEMsQ0FBQztBQUNELFVBQU0saUJBQWlCLElBQUksTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDO0FBQ3BELFNBQUssYUFBYSxJQUFJLE1BQU0sS0FBSyxnQkFBZ0IsY0FBYztBQUMvRCxTQUFLLFdBQVcsU0FBUyxJQUFJO0FBQzdCLFNBQUssV0FBVyxhQUFhO0FBQzdCLFNBQUssTUFBTSxJQUFJLEtBQUssVUFBVTtBQUU5QixVQUFNLGNBQWMsSUFBSSxPQUFPLElBQUksSUFBSSxPQUFPLEtBQUssS0FBSyxHQUFHLEdBQUcsQ0FBQztBQUMvRCxTQUFLLGFBQWEsSUFBSSxPQUFPLEtBQUs7QUFBQSxNQUM5QixNQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsTUFDL0IsVUFBVSxJQUFJLE9BQU8sS0FBSyxLQUFLLFdBQVcsU0FBUyxHQUFHLEtBQUssV0FBVyxTQUFTLEdBQUcsS0FBSyxXQUFXLFNBQVMsQ0FBQztBQUFBLE1BQzVHLE9BQU87QUFBQSxNQUNQLGVBQWU7QUFBQSxNQUNmLFVBQVUsS0FBSztBQUFBLElBQ25CLENBQUM7QUFDRCxTQUFLLFdBQVcsV0FBVyxFQUFFLE1BQU0sZ0JBQXVCLFVBQVUsS0FBSyxXQUFXO0FBQ3BGLFNBQUssTUFBTSxRQUFRLEtBQUssVUFBVTtBQUVsQyxTQUFLLGdCQUFnQixTQUFTLEtBQUssS0FBSyxXQUFXLFFBQW9DO0FBQUEsRUFDM0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLGVBQWU7QUFDbkIsVUFBTSxnQkFBZ0IsS0FBSyxTQUFTLElBQUksZ0JBQWdCO0FBQ3hELFVBQU0saUJBQWlCLElBQUksTUFBTSxvQkFBb0I7QUFBQSxNQUNqRCxLQUFLO0FBQUEsTUFDTCxPQUFPLGdCQUFnQixXQUFXO0FBQUEsSUFDdEMsQ0FBQztBQUNELFVBQU0saUJBQWlCLElBQUksTUFBTSxjQUFjLEtBQUssT0FBTyxhQUFhLFlBQVksS0FBSyxPQUFPLGFBQWEsVUFBVTtBQUN2SCxTQUFLLGFBQWEsSUFBSSxNQUFNLEtBQUssZ0JBQWdCLGNBQWM7QUFDL0QsU0FBSyxXQUFXLFNBQVMsSUFBSSxDQUFDLEtBQUssS0FBSztBQUN4QyxTQUFLLFdBQVcsZ0JBQWdCO0FBQ2hDLFNBQUssTUFBTSxJQUFJLEtBQUssVUFBVTtBQUU5QixVQUFNLGNBQWMsSUFBSSxPQUFPLE1BQU07QUFDckMsU0FBSyxhQUFhLElBQUksT0FBTyxLQUFLO0FBQUEsTUFDOUIsTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLE1BQ1AsVUFBVSxLQUFLO0FBQUEsSUFDbkIsQ0FBQztBQUNELFNBQUssV0FBVyxXQUFXLEVBQUUsTUFBTSxzQkFBNkI7QUFDaEUsU0FBSyxXQUFXLFdBQVcsaUJBQWlCLElBQUksT0FBTyxLQUFLLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEtBQUssQ0FBQztBQUNsRixTQUFLLE1BQU0sUUFBUSxLQUFLLFVBQVU7QUFBQSxFQUN0QztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1Esc0JBQXNCO0FBQzFCLFFBQUksQ0FBQyxLQUFLLE9BQU8sYUFBYSxlQUFlO0FBQ3pDLGNBQVEsS0FBSywyQ0FBMkM7QUFDeEQ7QUFBQSxJQUNKO0FBRUEsU0FBSyxPQUFPLGFBQWEsY0FBYyxRQUFRLGVBQWE7QUFDeEQsWUFBTSxVQUFVLEtBQUssU0FBUyxJQUFJLFVBQVUsV0FBVztBQUN2RCxZQUFNLFdBQVcsSUFBSSxNQUFNLG9CQUFvQjtBQUFBLFFBQzNDLEtBQUs7QUFBQSxRQUNMLE9BQU8sVUFBVSxXQUFXO0FBQUEsTUFDaEMsQ0FBQztBQUVELFlBQU0sV0FBVyxJQUFJLE1BQU0sWUFBWSxVQUFVLFdBQVcsT0FBTyxVQUFVLFdBQVcsUUFBUSxVQUFVLFdBQVcsS0FBSztBQUMxSCxZQUFNLE9BQU8sSUFBSSxNQUFNLEtBQUssVUFBVSxRQUFRO0FBQzlDLFdBQUssU0FBUyxJQUFJLFVBQVUsU0FBUyxHQUFHLFVBQVUsU0FBUyxHQUFHLFVBQVUsU0FBUyxDQUFDO0FBQ2xGLFVBQUksVUFBVSxjQUFjLFFBQVc7QUFDbkMsYUFBSyxTQUFTLElBQUksVUFBVTtBQUFBLE1BQ2hDO0FBQ0EsV0FBSyxhQUFhO0FBQ2xCLFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssTUFBTSxJQUFJLElBQUk7QUFDbkIsV0FBSyxtQkFBbUIsS0FBSyxJQUFJO0FBRWpDLFlBQU0sUUFBUSxJQUFJLE9BQU8sSUFBSSxJQUFJLE9BQU87QUFBQSxRQUNwQyxVQUFVLFdBQVcsUUFBUTtBQUFBLFFBQzdCLFVBQVUsV0FBVyxTQUFTO0FBQUEsUUFDOUIsVUFBVSxXQUFXLFFBQVE7QUFBQSxNQUNqQyxDQUFDO0FBQ0QsWUFBTSxPQUFPLElBQUksT0FBTyxLQUFLO0FBQUEsUUFDekIsTUFBTSxVQUFVO0FBQUEsUUFDaEIsVUFBVSxJQUFJLE9BQU8sS0FBSyxVQUFVLFNBQVMsR0FBRyxVQUFVLFNBQVMsR0FBRyxVQUFVLFNBQVMsQ0FBQztBQUFBLFFBQzFGO0FBQUEsUUFDQSxVQUFVLEtBQUs7QUFBQSxNQUNuQixDQUFDO0FBQ0QsV0FBSyxXQUFXLEVBQUUsTUFBTSxzQkFBNkI7QUFDckQsVUFBSSxVQUFVLGNBQWMsUUFBVztBQUNuQyxhQUFLLFdBQVcsaUJBQWlCLElBQUksT0FBTyxLQUFLLEdBQUcsR0FBRyxDQUFDLEdBQUcsVUFBVSxTQUFTO0FBQUEsTUFDbEY7QUFDQSxXQUFLLE1BQU0sUUFBUSxJQUFJO0FBQ3ZCLFdBQUssbUJBQW1CLEtBQUssSUFBSTtBQUFBLElBQ3JDLENBQUM7QUFDRCxZQUFRLElBQUksV0FBVyxLQUFLLG1CQUFtQixNQUFNLGtCQUFrQjtBQUFBLEVBQzNFO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxnQkFBZ0I7QUFDcEIsVUFBTSxlQUFlLElBQUksTUFBTSxhQUFhLFNBQVUsQ0FBRztBQUN6RCxTQUFLLE1BQU0sSUFBSSxZQUFZO0FBRTNCLFVBQU0sbUJBQW1CLElBQUksTUFBTSxpQkFBaUIsVUFBVSxHQUFHO0FBQ2pFLHFCQUFpQixTQUFTLElBQUksR0FBRyxJQUFJLENBQUM7QUFDdEMscUJBQWlCLGFBQWE7QUFDOUIscUJBQWlCLE9BQU8sUUFBUSxRQUFRO0FBQ3hDLHFCQUFpQixPQUFPLFFBQVEsU0FBUztBQUN6QyxxQkFBaUIsT0FBTyxPQUFPLE9BQU87QUFDdEMscUJBQWlCLE9BQU8sT0FBTyxNQUFNO0FBQ3JDLHFCQUFpQixPQUFPLE9BQU8sT0FBTztBQUN0QyxxQkFBaUIsT0FBTyxPQUFPLFFBQVE7QUFDdkMscUJBQWlCLE9BQU8sT0FBTyxNQUFNO0FBQ3JDLHFCQUFpQixPQUFPLE9BQU8sU0FBUztBQUN4QyxTQUFLLE1BQU0sSUFBSSxnQkFBZ0I7QUFBQSxFQUNuQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsaUJBQWlCO0FBQ3JCLFNBQUssc0JBQXNCO0FBQUEsRUFDL0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsd0JBQXdCO0FBQzVCLFVBQU0sb0JBQW9CLEtBQUssT0FBTyxhQUFhLGlCQUFpQixRQUFRLEtBQUssT0FBTyxhQUFhLGlCQUFpQjtBQUV0SCxRQUFJO0FBQ0osUUFBSTtBQUVKLFVBQU0sY0FBYyxPQUFPO0FBQzNCLFVBQU0sZUFBZSxPQUFPO0FBQzVCLFVBQU0sMkJBQTJCLGNBQWM7QUFFL0MsUUFBSSwyQkFBMkIsbUJBQW1CO0FBQzlDLGtCQUFZO0FBQ1osaUJBQVcsWUFBWTtBQUFBLElBQzNCLE9BQU87QUFDSCxpQkFBVztBQUNYLGtCQUFZLFdBQVc7QUFBQSxJQUMzQjtBQUVBLFNBQUssU0FBUyxRQUFRLFVBQVUsV0FBVyxLQUFLO0FBQ2hELFNBQUssT0FBTyxTQUFTO0FBQ3JCLFNBQUssT0FBTyx1QkFBdUI7QUFFbkMsV0FBTyxPQUFPLEtBQUssT0FBTyxPQUFPO0FBQUEsTUFDN0IsT0FBTyxHQUFHLFFBQVE7QUFBQSxNQUNsQixRQUFRLEdBQUcsU0FBUztBQUFBLE1BQ3BCLFVBQVU7QUFBQSxNQUNWLEtBQUs7QUFBQSxNQUNMLE1BQU07QUFBQSxNQUNOLFdBQVc7QUFBQSxNQUNYLFdBQVc7QUFBQSxJQUNmLENBQUM7QUFFRCxRQUFJLEtBQUssVUFBVSxpQkFBbUIsS0FBSyxvQkFBb0I7QUFDM0QsYUFBTyxPQUFPLEtBQUssbUJBQW1CLE9BQU87QUFBQSxRQUN6QyxPQUFPLEdBQUcsUUFBUTtBQUFBLFFBQ2xCLFFBQVEsR0FBRyxTQUFTO0FBQUEsUUFDcEIsS0FBSztBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQ04sV0FBVztBQUFBLE1BQ2YsQ0FBQztBQUFBLElBQ0w7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxVQUFVLE9BQXNCO0FBQ3BDLFNBQUssS0FBSyxNQUFNLElBQUksWUFBWSxDQUFDLElBQUk7QUFDckMsUUFBSSxLQUFLLFVBQVUsbUJBQXFCLEtBQUssaUJBQWlCO0FBQzFELFVBQUksTUFBTSxJQUFJLFlBQVksTUFBTSxLQUFLO0FBQ2pDLGFBQUssV0FBVztBQUFBLE1BQ3BCO0FBQUEsSUFDSjtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLFFBQVEsT0FBc0I7QUFDbEMsU0FBSyxLQUFLLE1BQU0sSUFBSSxZQUFZLENBQUMsSUFBSTtBQUFBLEVBQ3pDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxZQUFZLE9BQW1CO0FBQ25DLFFBQUksS0FBSyxVQUFVLG1CQUFxQixLQUFLLGlCQUFpQjtBQUMxRCxVQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3BCLGFBQUssS0FBSyxRQUFRLElBQUk7QUFBQSxNQUMxQjtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxVQUFVLE9BQW1CO0FBQ2pDLFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDcEIsV0FBSyxLQUFLLFFBQVEsSUFBSTtBQUFBLElBQzFCO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsWUFBWSxPQUFtQjtBQUNuQyxRQUFJLEtBQUssVUFBVSxtQkFBcUIsS0FBSyxpQkFBaUI7QUFDMUQsWUFBTSxZQUFZLE1BQU0sYUFBYTtBQUNyQyxZQUFNLFlBQVksTUFBTSxhQUFhO0FBRXJDLFdBQUssZ0JBQWdCLFNBQVMsS0FBSyxZQUFZLEtBQUssT0FBTyxhQUFhO0FBQ3hFLFdBQUssZUFBZSxZQUFZLEtBQUssT0FBTyxhQUFhO0FBQ3pELFdBQUssY0FBYyxLQUFLLElBQUksQ0FBQyxLQUFLLEtBQUssR0FBRyxLQUFLLElBQUksS0FBSyxLQUFLLEdBQUcsS0FBSyxXQUFXLENBQUM7QUFDakYsV0FBSyxPQUFPLFNBQVMsSUFBSSxLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxzQkFBc0I7QUFDMUIsUUFBSSxTQUFTLHVCQUF1QixLQUFLLFVBQ3BDLFNBQWlCLDBCQUEwQixLQUFLLFVBQ2hELFNBQWlCLDZCQUE2QixLQUFLLFFBQVE7QUFDNUQsV0FBSyxrQkFBa0I7QUFDdkIsY0FBUSxJQUFJLGdCQUFnQjtBQUFBLElBQ2hDLE9BQU87QUFDSCxXQUFLLGtCQUFrQjtBQUN2QixjQUFRLElBQUksa0JBQWtCO0FBQUEsSUFDbEM7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxRQUFRLE1BQTJCO0FBQ3ZDLDBCQUFzQixLQUFLLFFBQVEsS0FBSyxJQUFJLENBQUM7QUFFN0MsVUFBTSxhQUFhLE9BQU8sS0FBSyxZQUFZO0FBQzNDLFNBQUssV0FBVztBQUVoQixRQUFJLEtBQUssVUFBVSxpQkFBbUI7QUFDbEMsV0FBSyxvQkFBb0IsU0FBUztBQUNsQyxXQUFLLGFBQWEsU0FBUztBQUMzQixXQUFLLGVBQWUsU0FBUztBQUM3QixXQUFLLGNBQWMsU0FBUztBQUM1QixXQUFLLG9CQUFvQjtBQUN6QixXQUFLLHFCQUFxQjtBQUFBLElBQzlCO0FBRUEsU0FBSyxTQUFTLE9BQU8sS0FBSyxPQUFPLEtBQUssTUFBTTtBQUFBLEVBQ2hEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxjQUFjLFdBQW1CO0FBQ3JDLFNBQUssTUFBTSxLQUFLLElBQUksSUFBSSxXQUFXLEtBQUssT0FBTyxhQUFhLGtCQUFrQjtBQUFBLEVBQ2xGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLG9CQUFvQixXQUFtQjtBQUMzQyxTQUFLLHFCQUFxQjtBQUcxQixVQUFNLGNBQWMsWUFBWSxJQUFJLElBQUk7QUFDeEMsUUFBSSxLQUFLLG1CQUFtQixLQUFLLEtBQUssUUFBUSxLQUFLLGNBQWMsS0FBSyxnQkFBZ0IsS0FBSyxPQUFPLGFBQWEsZ0JBQWdCO0FBQzNILFdBQUssZUFBZTtBQUVwQixZQUFNLGlCQUFpQixJQUFJLE1BQU0sUUFBUTtBQUN6QyxXQUFLLE9BQU8saUJBQWlCLGNBQWM7QUFFM0MsWUFBTSxrQkFBa0IsSUFBSSxNQUFNLFFBQVE7QUFDMUMsV0FBSyxPQUFPLGtCQUFrQixlQUFlO0FBRTdDLFdBQUs7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSyxPQUFPLGFBQWE7QUFBQSxRQUN6QixLQUFLLE9BQU8sYUFBYTtBQUFBLFFBQ3pCO0FBQUEsUUFDQSxLQUFLO0FBQUEsTUFDVDtBQUFBLElBQ0o7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSx1QkFBdUI7QUFDM0IsUUFBSSxDQUFDLEtBQUssaUJBQWlCO0FBQ3ZCLFdBQUssV0FBVyxTQUFTLElBQUk7QUFDN0IsV0FBSyxXQUFXLFNBQVMsSUFBSTtBQUM3QjtBQUFBLElBQ0o7QUFFQSxRQUFJLHVCQUF1QixLQUFLLE9BQU8sYUFBYTtBQUVwRCxRQUFJLEtBQUssa0NBQWtDLEdBQUc7QUFDMUMsOEJBQXdCLEtBQUssT0FBTyxhQUFhO0FBQUEsSUFDckQ7QUFFQSxVQUFNLG1CQUFtQixLQUFLLFdBQVcsU0FBUztBQUVsRCxVQUFNLGdCQUFnQixJQUFJLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQztBQUUvQyxVQUFNLGtCQUFrQixJQUFJLE1BQU0sUUFBUTtBQUMxQyxTQUFLLGdCQUFnQixrQkFBa0IsZUFBZTtBQUN0RCxvQkFBZ0IsSUFBSTtBQUNwQixvQkFBZ0IsVUFBVTtBQUUxQixVQUFNLFdBQVcsSUFBSSxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUM7QUFFMUMsVUFBTSxjQUFjLElBQUksTUFBTSxRQUFRO0FBQ3RDLGdCQUFZLGFBQWEsVUFBVSxlQUFlLEVBQUUsVUFBVTtBQUU5RCxRQUFJLFNBQVM7QUFDYixRQUFJLEtBQUssS0FBSyxHQUFHLEdBQUc7QUFDaEIsb0JBQWMsSUFBSSxlQUFlO0FBQ2pDLGVBQVM7QUFBQSxJQUNiO0FBQ0EsUUFBSSxLQUFLLEtBQUssR0FBRyxHQUFHO0FBQ2hCLG9CQUFjLElBQUksZUFBZTtBQUNqQyxlQUFTO0FBQUEsSUFDYjtBQUNBLFFBQUksS0FBSyxLQUFLLEdBQUcsR0FBRztBQUNoQixvQkFBYyxJQUFJLFdBQVc7QUFDN0IsZUFBUztBQUFBLElBQ2I7QUFDQSxRQUFJLEtBQUssS0FBSyxHQUFHLEdBQUc7QUFDaEIsb0JBQWMsSUFBSSxXQUFXO0FBQzdCLGVBQVM7QUFBQSxJQUNiO0FBRUEsUUFBSSxRQUFRO0FBQ1Isb0JBQWMsVUFBVSxFQUFFLGVBQWUsb0JBQW9CO0FBQzdELFdBQUssV0FBVyxTQUFTLElBQUksY0FBYztBQUMzQyxXQUFLLFdBQVcsU0FBUyxJQUFJLGNBQWM7QUFBQSxJQUMvQyxPQUFPO0FBQ0gsVUFBSSxLQUFLLGtDQUFrQyxHQUFHO0FBQzFDLGFBQUssV0FBVyxTQUFTLEtBQUssS0FBSyxPQUFPLGFBQWE7QUFDdkQsYUFBSyxXQUFXLFNBQVMsS0FBSyxLQUFLLE9BQU8sYUFBYTtBQUFBLE1BQzNEO0FBQUEsSUFDSjtBQUNBLFNBQUssV0FBVyxTQUFTLElBQUk7QUFBQSxFQUNqQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsYUFBYTtBQUNqQixRQUFJLEtBQUssZ0NBQWdDLEdBQUc7QUFDeEMsV0FBSyxXQUFXLFNBQVMsSUFBSTtBQUM3QixXQUFLLFdBQVc7QUFBQSxRQUNaLElBQUksT0FBTyxLQUFLLEdBQUcsS0FBSyxPQUFPLGFBQWEsV0FBVyxDQUFDO0FBQUEsUUFDeEQsS0FBSyxXQUFXO0FBQUEsTUFDcEI7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxhQUFhLFdBQW1CO0FBQ3BDLFFBQUksS0FBSyxRQUFRLFNBQVMsS0FBSyxPQUFPLGFBQWEsZUFBZTtBQUM5RCxXQUFLLHNCQUFzQjtBQUMzQixVQUFJLEtBQUssc0JBQXNCLEtBQUssT0FBTyxhQUFhLG9CQUFvQjtBQUN4RSxhQUFLLHFCQUFxQjtBQUcxQixjQUFNLGFBQWEsS0FBSyxPQUFPLGFBQWE7QUFDNUMsY0FBTSxVQUFVLEtBQUssT0FBTyxJQUFJLE9BQU8sYUFBYTtBQUNwRCxjQUFNLFVBQVUsS0FBSyxPQUFPLElBQUksT0FBTyxhQUFhO0FBQ3BELGNBQU0sU0FBUztBQUVmLGFBQUssWUFBWSxJQUFJLE1BQU0sUUFBUSxRQUFRLFFBQVEsTUFBTSxDQUFDO0FBQUEsTUFDOUQ7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxlQUFlLFdBQW1CO0FBRXRDLGFBQVMsSUFBSSxLQUFLLFFBQVEsU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQy9DLFlBQU0sUUFBUSxLQUFLLFFBQVEsQ0FBQztBQUM1QixZQUFNLE9BQU8sV0FBVyxLQUFLLFVBQVU7QUFBQSxJQUMzQztBQUdBLGFBQVMsSUFBSSxLQUFLLFFBQVEsU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQy9DLFlBQU0sU0FBUyxLQUFLLFFBQVEsQ0FBQztBQUM3QixhQUFPLE9BQU8sU0FBUztBQUFBLElBQzNCO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxZQUFZLFVBQXlCO0FBQ3pDLFVBQU0sUUFBUSxJQUFJLE1BQU0sTUFBTSxRQUFRO0FBQ3RDLFNBQUssUUFBUSxLQUFLLEtBQUs7QUFBQSxFQUMzQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLFlBQVksZUFBc0I7QUFDOUIsU0FBSyxVQUFVLEtBQUssUUFBUSxPQUFPLFdBQVMsVUFBVSxhQUFhO0FBQUEsRUFDdkU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVdRLGFBQWEsVUFBeUIsV0FBMEIsT0FBZSxRQUFnQixhQUE2QixXQUFtQztBQUNuSyxVQUFNLFNBQVMsSUFBSSxPQUFPLE1BQU0sVUFBVSxXQUFXLE9BQU8sUUFBUSxhQUFhLFNBQVM7QUFDMUYsU0FBSyxRQUFRLEtBQUssTUFBTTtBQUN4QixTQUFLLE9BQU8sSUFBSSxlQUFlLEdBQUcsS0FBSyxFQUFFLE1BQU0sT0FBSztBQUFBLElBQUMsQ0FBQztBQUFBLEVBQzFEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsYUFBYSxnQkFBd0I7QUFDakMsU0FBSyxVQUFVLEtBQUssUUFBUSxPQUFPLFlBQVUsV0FBVyxjQUFjO0FBQUEsRUFDMUU7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLHNCQUFzQjtBQUMxQixRQUFJLENBQUMsS0FBSyxjQUFjLENBQUMsS0FBSyxRQUFRO0FBQ2xDO0FBQUEsSUFDSjtBQUVBLFVBQU0saUJBQWlCLEtBQUssT0FBTyxhQUFhLGFBQWE7QUFFN0QsUUFBSSxPQUFPLEtBQUssV0FBVyxTQUFTO0FBQ3BDLFFBQUksT0FBTyxLQUFLLFdBQVcsU0FBUztBQUNwQyxRQUFJLE9BQU8sS0FBSyxXQUFXLFNBQVM7QUFDcEMsUUFBSSxPQUFPLEtBQUssV0FBVyxTQUFTO0FBRXBDLFFBQUksT0FBTyxnQkFBZ0I7QUFDdkIsV0FBSyxXQUFXLFNBQVMsSUFBSTtBQUM3QixVQUFJLE9BQU8sR0FBRztBQUNWLGFBQUssV0FBVyxTQUFTLElBQUk7QUFBQSxNQUNqQztBQUFBLElBQ0osV0FBVyxPQUFPLENBQUMsZ0JBQWdCO0FBQy9CLFdBQUssV0FBVyxTQUFTLElBQUksQ0FBQztBQUM5QixVQUFJLE9BQU8sR0FBRztBQUNWLGFBQUssV0FBVyxTQUFTLElBQUk7QUFBQSxNQUNqQztBQUFBLElBQ0o7QUFFQSxRQUFJLE9BQU8sZ0JBQWdCO0FBQ3ZCLFdBQUssV0FBVyxTQUFTLElBQUk7QUFDN0IsVUFBSSxPQUFPLEdBQUc7QUFDVixhQUFLLFdBQVcsU0FBUyxJQUFJO0FBQUEsTUFDakM7QUFBQSxJQUNKLFdBQVcsT0FBTyxDQUFDLGdCQUFnQjtBQUMvQixXQUFLLFdBQVcsU0FBUyxJQUFJLENBQUM7QUFDOUIsVUFBSSxPQUFPLEdBQUc7QUFDVixhQUFLLFdBQVcsU0FBUyxJQUFJO0FBQUEsTUFDakM7QUFBQSxJQUNKO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS1EsdUJBQXVCO0FBQzNCLFNBQUssV0FBVyxTQUFTLEtBQUssS0FBSyxXQUFXLFFBQW9DO0FBQ2xGLFNBQUssZ0JBQWdCLFNBQVMsS0FBSyxLQUFLLFdBQVcsUUFBb0M7QUFDdkYsU0FBSyxXQUFXLFdBQVcsS0FBSyxLQUFLLGdCQUFnQixVQUFVO0FBQUEsRUFHbkU7QUFDSjtBQUdBLFNBQVMsaUJBQWlCLG9CQUFvQixNQUFNO0FBQ2hELE1BQUksS0FBSztBQUNiLENBQUM7IiwKICAibmFtZXMiOiBbIkdhbWVTdGF0ZSIsICJHYW1lT2JqZWN0VHlwZSJdCn0K
