import * as THREE from "three";
import * as CANNON from "cannon-es";
var GameState = /* @__PURE__ */ ((GameState2) => {
  GameState2[GameState2["TITLE"] = 0] = "TITLE";
  GameState2[GameState2["PLAYING"] = 1] = "PLAYING";
  return GameState2;
})(GameState || {});
class Game {
  constructor() {
    // Game configuration loaded from data.json
    this.state = 0 /* TITLE */;
    // NEW: Arrays to hold references to dynamically placed objects
    this.placedObjectMeshes = [];
    this.placedObjectBodies = [];
    // NEW: Active bullets
    this.bullets = [];
    this.bulletsToRemove = /* @__PURE__ */ new Set();
    // Reusable material for bullets (using Basic to prevent lighting issues for simple bullets)
    // NEW: Active enemies
    this.enemies = [];
    this.enemiesToRemove = /* @__PURE__ */ new Set();
    // List of enemies to remove after physics step
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
    // NEW: UI element for score
    // For calculating delta time between frames
    this.lastTime = 0;
    // MODIFIED: Tracks player contacts with ANY static surface (ground or placed objects) for jumping/movement logic
    this.numContactsWithStaticSurfaces = 0;
    // NEW: Game score
    this.score = 0;
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
      this.score = this.config.gameSettings.score;
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
    this.bulletMaterial = new CANNON.Material("bulletMaterial");
    this.enemyMaterial = new CANNON.Material("enemyMaterial");
    const playerGroundContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.groundMaterial,
      {
        friction: this.config.gameSettings.playerGroundFriction,
        // Use configurable ground friction
        restitution: 0
        // No bounce for ground
      }
    );
    this.world.addContactMaterial(playerGroundContactMaterial);
    const playerObjectContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.defaultObjectMaterial,
      {
        friction: this.config.gameSettings.playerGroundFriction,
        // Same friction as player-ground
        restitution: 0
      }
    );
    this.world.addContactMaterial(playerObjectContactMaterial);
    const objectGroundContactMaterial = new CANNON.ContactMaterial(
      this.defaultObjectMaterial,
      this.groundMaterial,
      {
        friction: 0,
        restitution: 0
      }
    );
    this.world.addContactMaterial(objectGroundContactMaterial);
    const bulletGroundContactMaterial = new CANNON.ContactMaterial(
      this.bulletMaterial,
      this.groundMaterial,
      {
        friction: 0,
        restitution: 0
      }
    );
    this.world.addContactMaterial(bulletGroundContactMaterial);
    const bulletObjectContactMaterial = new CANNON.ContactMaterial(
      this.bulletMaterial,
      this.defaultObjectMaterial,
      {
        friction: 0,
        restitution: 0
      }
    );
    this.world.addContactMaterial(bulletObjectContactMaterial);
    const bulletEnemyContactMaterial = new CANNON.ContactMaterial(
      this.bulletMaterial,
      this.enemyMaterial,
      {
        friction: 0,
        restitution: 0
      }
    );
    this.world.addContactMaterial(bulletEnemyContactMaterial);
    const playerEnemyContactMaterial = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.enemyMaterial,
      {
        friction: 0.5,
        restitution: 0
      }
    );
    this.world.addContactMaterial(playerEnemyContactMaterial);
    await this.loadAssets();
    this.createGround();
    this.createPlayer();
    this.createStaticObjects();
    this.createEnemies();
    this.setupLighting();
    this.bulletGeometry = new THREE.SphereGeometry(this.config.gameSettings.bullet.dimensions.radius, 8, 8);
    const bulletTexture = this.textures.get(this.config.gameSettings.bullet.textureName);
    this.bulletMaterialMesh = new THREE.MeshBasicMaterial({
      map: bulletTexture,
      color: bulletTexture ? 16777215 : 16776960
      // Yellow if no texture
    });
    this.world.addEventListener("beginContact", (event) => {
      let bodyA = event.bodyA;
      let bodyB = event.bodyB;
      if (bodyA === this.playerBody || bodyB === this.playerBody) {
        const otherBody = bodyA === this.playerBody ? bodyB : bodyA;
        if (otherBody.mass === 0) {
          this.numContactsWithStaticSurfaces++;
        }
      }
    });
    this.world.addEventListener("endContact", (event) => {
      let bodyA = event.bodyA;
      let bodyB = event.bodyB;
      if (bodyA === this.playerBody || bodyB === this.playerBody) {
        const otherBody = bodyA === this.playerBody ? bodyB : bodyA;
        if (otherBody.mass === 0) {
          this.numContactsWithStaticSurfaces = Math.max(0, this.numContactsWithStaticSurfaces - 1);
        }
      }
    });
    window.addEventListener("resize", this.onWindowResize.bind(this));
    document.addEventListener("keydown", this.onKeyDown.bind(this));
    document.addEventListener("keyup", this.onKeyUp.bind(this));
    document.addEventListener("mousemove", this.onMouseMove.bind(this));
    document.addEventListener("mousedown", this.onMouseDown.bind(this));
    document.addEventListener("pointerlockchange", this.onPointerLockChange.bind(this));
    document.addEventListener("mozpointerlockchange", this.onPointerLockChange.bind(this));
    document.addEventListener("webkitpointerlockchange", this.onPointerLockChange.bind(this));
    this.applyFixedAspectRatio();
    this.setupTitleScreen();
    this.setupGameUI();
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
        if (img.name.endsWith("_texture")) {
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
      // Position relative to body, will be centered and sized by applyFixedAspectRatio
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
   * NEW: Creates and displays the game score UI.
   */
  setupGameUI() {
    this.scoreText = document.createElement("div");
    Object.assign(this.scoreText.style, {
      position: "absolute",
      top: "10px",
      left: "10px",
      color: "white",
      fontFamily: "Arial, sans-serif",
      fontSize: "24px",
      zIndex: "1001"
      // Above title screen overlay but separate
    });
    this.scoreText.textContent = `Score: ${this.score}`;
    document.body.appendChild(this.scoreText);
  }
  /**
   * NEW: Updates the score display on the UI.
   */
  updateScoreDisplay() {
    if (this.scoreText) {
      this.scoreText.textContent = `Score: ${this.score}`;
    }
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
      // Use white with texture, or blue if no texture
    });
    const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
    this.playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    this.playerMesh.position.y = 5;
    this.playerMesh.castShadow = true;
    this.scene.add(this.playerMesh);
    const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5));
    this.playerBody = new CANNON.Body({
      mass: this.config.gameSettings.playerMass,
      // Player's mass
      position: new CANNON.Vec3(this.playerMesh.position.x, this.playerMesh.position.y, this.playerMesh.position.z),
      shape: playerShape,
      fixedRotation: true,
      // Prevent the player from falling over (simulates a capsule/cylinder character)
      material: this.playerMaterial
      // Assign the player material for contact resolution
    });
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
      // Use white with texture, or grey if no texture
    });
    const groundGeometry = new THREE.PlaneGeometry(this.config.gameSettings.groundSize, this.config.gameSettings.groundSize);
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      mass: 0,
      // A mass of 0 makes it a static (immovable) body
      shape: groundShape,
      material: this.groundMaterial
      // Assign the ground material for contact resolution
    });
    this.groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(this.groundBody);
  }
  /**
   * NEW: Creates visual meshes and physics bodies for all static objects (boxes) defined in config.gameSettings.staticObjects.
   */
  createStaticObjects() {
    if (!this.config.gameSettings.staticObjects) {
      console.warn("No staticObjects defined in gameSettings.");
      return;
    }
    this.config.gameSettings.staticObjects.forEach((objConfig) => {
      const texture = this.textures.get(objConfig.textureName);
      const material = new THREE.MeshLambertMaterial({
        map: texture,
        color: texture ? 16777215 : 11184810
        // Default grey if no texture
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
        // Use 0 for static objects
        position: new CANNON.Vec3(objConfig.position.x, objConfig.position.y, objConfig.position.z),
        shape,
        material: this.defaultObjectMaterial
        // Assign the default object material
      });
      if (objConfig.rotationY !== void 0) {
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), objConfig.rotationY);
      }
      this.world.addBody(body);
      this.placedObjectBodies.push(body);
    });
    console.log(`Created ${this.placedObjectMeshes.length} static objects.`);
  }
  /**
   * NEW: Creates visual meshes and physics bodies for all enemy instances defined in config.gameSettings.enemyInstances.
   */
  createEnemies() {
    if (!this.config.gameSettings.enemyInstances || !this.config.gameSettings.enemyTypes) {
      console.warn("No enemyInstances or enemyTypes defined in gameSettings.");
      return;
    }
    const enemyTypeMap = /* @__PURE__ */ new Map();
    this.config.gameSettings.enemyTypes.forEach((type) => enemyTypeMap.set(type.name, type));
    this.config.gameSettings.enemyInstances.forEach((instanceConfig) => {
      const typeConfig = enemyTypeMap.get(instanceConfig.enemyTypeName);
      if (!typeConfig) {
        console.error(`Enemy type '${instanceConfig.enemyTypeName}' not found for instance '${instanceConfig.name}'. Skipping.`);
        return;
      }
      const texture = this.textures.get(typeConfig.textureName);
      const material = new THREE.MeshLambertMaterial({
        map: texture,
        color: texture ? 16777215 : 16711680
        // Default red if no texture
      });
      const geometry = new THREE.BoxGeometry(typeConfig.dimensions.width, typeConfig.dimensions.height, typeConfig.dimensions.depth);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(instanceConfig.position.x, instanceConfig.position.y, instanceConfig.position.z);
      if (instanceConfig.rotationY !== void 0) {
        mesh.rotation.y = instanceConfig.rotationY;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      const shape = new CANNON.Box(new CANNON.Vec3(
        typeConfig.dimensions.width / 2,
        typeConfig.dimensions.height / 2,
        typeConfig.dimensions.depth / 2
      ));
      const body = new CANNON.Body({
        mass: typeConfig.mass,
        position: new CANNON.Vec3(instanceConfig.position.x, instanceConfig.position.y, instanceConfig.position.z),
        shape,
        material: this.enemyMaterial,
        fixedRotation: true
        // Prevent enemies from tumbling
      });
      if (instanceConfig.rotationY !== void 0) {
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), instanceConfig.rotationY);
      }
      this.world.addBody(body);
      const activeEnemy = {
        name: instanceConfig.name,
        mesh,
        body,
        typeConfig,
        currentHealth: typeConfig.health
      };
      body.userData = activeEnemy;
      this.enemies.push(activeEnemy);
    });
    console.log(`Created ${this.enemies.length} enemies.`);
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
      // Ensures content is scaled appropriately if there's any mismatch
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
   * NEW: Handles mouse click for firing bullets.
   */
  onMouseDown(event) {
    if (this.state === 1 /* PLAYING */ && this.isPointerLocked && event.button === 0) {
      this.fireBullet();
    }
  }
  /**
   * NEW: Fires a bullet from the player's camera position and direction.
   */
  fireBullet() {
    const bulletConfig = this.config.gameSettings.bullet;
    const cameraWorldPosition = new THREE.Vector3();
    this.camera.getWorldPosition(cameraWorldPosition);
    const cameraWorldDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraWorldDirection);
    const bulletMesh = new THREE.Mesh(this.bulletGeometry, this.bulletMaterialMesh);
    bulletMesh.position.copy(cameraWorldPosition);
    this.scene.add(bulletMesh);
    const bulletShape = new CANNON.Sphere(bulletConfig.dimensions.radius);
    const bulletBody = new CANNON.Body({
      mass: bulletConfig.mass,
      position: new CANNON.Vec3(cameraWorldPosition.x, cameraWorldPosition.y, cameraWorldPosition.z),
      shape: bulletShape,
      material: this.bulletMaterial,
      // Bullets should not be affected by player movement, but should have gravity
      linearDamping: 0.01,
      // Small damping to prevent infinite sliding
      angularDamping: 0.99
      // Allows some rotation, but stops quickly
    });
    bulletBody.velocity.set(
      cameraWorldDirection.x * bulletConfig.speed,
      cameraWorldDirection.y * bulletConfig.speed,
      cameraWorldDirection.z * bulletConfig.speed
    );
    const activeBullet = {
      mesh: bulletMesh,
      body: bulletBody,
      creationTime: this.lastTime / 1e3,
      // Store creation time in seconds
      firePosition: bulletBody.position.clone()
      // Store initial fire position for range check
    };
    activeBullet.collideHandler = (event) => this.onBulletCollide(event, activeBullet);
    bulletBody.userData = activeBullet;
    bulletBody.addEventListener("collide", activeBullet.collideHandler);
    this.world.addBody(bulletBody);
    this.bullets.push(activeBullet);
    this.sounds.get("shoot_sound")?.play().catch((e) => console.log("Shoot sound play denied:", e));
  }
  /**
   * NEW: Handles bullet collisions.
   * @param event The Cannon.js collision event.
   * @param bullet The ActiveBullet instance that collided.
   */
  onBulletCollide(event, bullet) {
    if (!this.bullets.includes(bullet) || bullet.shouldRemove) {
      return;
    }
    const collidedBody = event.body;
    const otherBodyUserData = collidedBody.userData;
    const isGround = collidedBody === this.groundBody;
    const isPlacedObject = this.placedObjectBodies.includes(collidedBody);
    const isEnemy = otherBodyUserData && otherBodyUserData.typeConfig !== void 0;
    if (isGround || isPlacedObject) {
      bullet.shouldRemove = true;
      this.bulletsToRemove.add(bullet);
    } else if (isEnemy) {
      const enemy = otherBodyUserData;
      if (!enemy.shouldRemove) {
        enemy.currentHealth--;
        this.sounds.get("hit_sound")?.play().catch((e) => console.log("Hit sound play denied:", e));
        console.log(`Enemy ${enemy.name} hit! Health: ${enemy.currentHealth}`);
        if (enemy.currentHealth <= 0) {
          enemy.shouldRemove = true;
          this.enemiesToRemove.add(enemy);
          this.score += enemy.typeConfig.scoreValue;
          this.updateScoreDisplay();
          this.sounds.get("enemy_death_sound")?.play().catch((e) => console.log("Enemy death sound play denied:", e));
          console.log(`Enemy ${enemy.name} defeated! Score: ${this.score}`);
        }
      }
      bullet.shouldRemove = true;
      this.bulletsToRemove.add(bullet);
    }
  }
  /**
   * NEW: Iterates through bullets to mark them for removal based on lifetime, range, or out-of-bounds.
   * Actual removal is deferred to `performBulletRemovals`.
   */
  updateBullets(deltaTime) {
    const currentTime = this.lastTime / 1e3;
    const halfGroundSize = this.config.gameSettings.groundSize / 2;
    const bulletConfig = this.config.gameSettings.bullet;
    for (let i = 0; i < this.bullets.length; i++) {
      const bullet = this.bullets[i];
      if (bullet.shouldRemove) {
        continue;
      }
      if (currentTime - bullet.creationTime > bulletConfig.lifetime) {
        bullet.shouldRemove = true;
        this.bulletsToRemove.add(bullet);
        continue;
      }
      const bulletPos = bullet.body.position;
      const distanceToFirePoint = bulletPos.distanceTo(bullet.firePosition);
      if (bulletPos.x > halfGroundSize || bulletPos.x < -halfGroundSize || bulletPos.z > halfGroundSize || bulletPos.z < -halfGroundSize || distanceToFirePoint > bulletConfig.maxRange || bulletPos.y < -10) {
        bullet.shouldRemove = true;
        this.bulletsToRemove.add(bullet);
      }
    }
  }
  /**
   * NEW: Performs the actual removal of bullets marked for removal.
   * This method is called after the physics step to avoid modifying the world during physics calculations.
   */
  performBulletRemovals() {
    for (const bulletToRemove of this.bulletsToRemove) {
      this.scene.remove(bulletToRemove.mesh);
      this.world.removeBody(bulletToRemove.body);
      if (bulletToRemove.collideHandler) {
        bulletToRemove.body.removeEventListener("collide", bulletToRemove.collideHandler);
      }
      const index = this.bullets.indexOf(bulletToRemove);
      if (index !== -1) {
        this.bullets.splice(index, 1);
      }
    }
    this.bulletsToRemove.clear();
  }
  /**
   * NEW: Updates enemy movement logic (calculates velocity and rotation).
   * The actual mesh synchronization happens in syncMeshesWithBodies.
   */
  updateEnemies(deltaTime) {
    if (!this.playerBody) return;
    const playerPos = this.playerBody.position;
    const halfGroundSize = this.config.gameSettings.groundSize / 2;
    for (const enemy of this.enemies) {
      if (enemy.shouldRemove) {
        continue;
      }
      const enemyPos = enemy.body.position;
      const halfWidth = enemy.typeConfig.dimensions.width / 2;
      const halfDepth = enemy.typeConfig.dimensions.depth / 2;
      if (enemyPos.x > halfGroundSize - halfWidth) {
        enemy.body.position.x = halfGroundSize - halfWidth;
        if (enemy.body.velocity.x > 0) enemy.body.velocity.x = 0;
      } else if (enemyPos.x < -halfGroundSize + halfWidth) {
        enemy.body.position.x = -halfGroundSize + halfWidth;
        if (enemy.body.velocity.x < 0) enemy.body.velocity.x = 0;
      }
      if (enemyPos.z > halfGroundSize - halfDepth) {
        enemy.body.position.z = halfGroundSize - halfDepth;
        if (enemy.body.velocity.z > 0) enemy.body.velocity.z = 0;
      } else if (enemyPos.z < -halfGroundSize + halfDepth) {
        enemy.body.position.z = -halfGroundSize + halfDepth;
        if (enemy.body.velocity.z < 0) enemy.body.velocity.z = 0;
      }
      const direction = new CANNON.Vec3();
      playerPos.vsub(enemyPos, direction);
      direction.y = 0;
      direction.normalize();
      enemy.body.velocity.x = direction.x * enemy.typeConfig.speed;
      enemy.body.velocity.z = direction.z * enemy.typeConfig.speed;
      const targetRotationY = Math.atan2(direction.x, direction.z);
      const currentQuaternion = new THREE.Quaternion(enemy.body.quaternion.x, enemy.body.quaternion.y, enemy.body.quaternion.z, enemy.body.quaternion.w);
      const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        targetRotationY
      );
      const slerpedQuaternion = new THREE.Quaternion();
      slerpedQuaternion.slerpQuaternions(currentQuaternion, targetQuaternion, 0.1);
      enemy.body.quaternion.copy(slerpedQuaternion);
    }
  }
  /**
   * NEW: Performs the actual removal of enemies marked for removal.
   * This method is called after the physics step.
   */
  performEnemyRemovals() {
    for (const enemyToRemove of this.enemiesToRemove) {
      this.scene.remove(enemyToRemove.mesh);
      this.world.removeBody(enemyToRemove.body);
      const index = this.enemies.indexOf(enemyToRemove);
      if (index !== -1) {
        this.enemies.splice(index, 1);
      }
    }
    this.enemiesToRemove.clear();
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
      this.updatePlayerMovement();
      this.updateBullets(deltaTime);
      this.updateEnemies(deltaTime);
      this.updatePhysics(deltaTime);
      this.performBulletRemovals();
      this.performEnemyRemovals();
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
      } else {
      }
    }
    this.playerBody.velocity.y = currentYVelocity;
  }
  /**
   * ADDED: Applies an upward impulse to the player body for jumping.
   */
  playerJump() {
    if (this.numContactsWithStaticSurfaces > 0) {
      this.playerBody.velocity.y = 0;
      this.playerBody.applyImpulse(
        new CANNON.Vec3(0, this.config.gameSettings.jumpForce, 0),
        this.playerBody.position
        // Apply impulse at the center of mass
      );
    }
  }
  /**
   * Clamps the player's position within the defined ground boundaries.
   * Prevents the player from moving beyond the 'end of the world'.
   */
  clampPlayerPosition() {
    if (!this.playerBody || !this.config) {
      return;
    }
    const halfGroundSize = this.config.gameSettings.groundSize / 2;
    const playerHalfWidth = 0.5;
    let posX = this.playerBody.position.x;
    let posZ = this.playerBody.position.z;
    let velX = this.playerBody.velocity.x;
    let velZ = this.playerBody.velocity.z;
    if (posX > halfGroundSize - playerHalfWidth) {
      this.playerBody.position.x = halfGroundSize - playerHalfWidth;
      if (velX > 0) {
        this.playerBody.velocity.x = 0;
      }
    } else if (posX < -halfGroundSize + playerHalfWidth) {
      this.playerBody.position.x = -halfGroundSize + playerHalfWidth;
      if (velX < 0) {
        this.playerBody.velocity.x = 0;
      }
    }
    if (posZ > halfGroundSize - playerHalfWidth) {
      this.playerBody.position.z = halfGroundSize - playerHalfWidth;
      if (velZ > 0) {
        this.playerBody.velocity.z = 0;
      }
    } else if (posZ < -halfGroundSize + playerHalfWidth) {
      this.playerBody.position.z = -halfGroundSize + playerHalfWidth;
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
    for (const bullet of this.bullets) {
      if (!bullet.shouldRemove) {
        bullet.mesh.position.copy(bullet.body.position);
        bullet.mesh.quaternion.copy(bullet.body.quaternion);
      }
    }
    for (const enemy of this.enemies) {
      if (!enemy.shouldRemove) {
        enemy.mesh.position.copy(enemy.body.position);
        enemy.mesh.quaternion.copy(enemy.body.quaternion);
      }
    }
  }
}
document.addEventListener("DOMContentLoaded", () => {
  new Game();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEFkZCBtb2R1bGUgYXVnbWVudGF0aW9uIGZvciBDQU5OT04uQm9keSB0byBpbmNsdWRlIHVzZXJEYXRhIGZvciBib3RoIGJ1bGxldHMgYW5kIGVuZW1pZXNcclxuZGVjbGFyZSBtb2R1bGUgJ2Nhbm5vbi1lcycge1xyXG4gICAgaW50ZXJmYWNlIEJvZHkge1xyXG4gICAgICAgIHVzZXJEYXRhPzogQWN0aXZlQnVsbGV0IHwgQWN0aXZlRW5lbXk7IC8vIEF0dGFjaCB0aGUgQWN0aXZlQnVsbGV0IG9yIEFjdGl2ZUVuZW15IGluc3RhbmNlXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIERlZmluZSBpbnRlcmZhY2UgZm9yIHRoZSBDYW5ub24tZXMgJ2NvbGxpZGUnIGV2ZW50XHJcbmludGVyZmFjZSBDb2xsaWRlRXZlbnQge1xyXG4gICAgLy8gVGhlIHR5cGUgcHJvcGVydHkgaXMgdXN1YWxseSBwcmVzZW50IG9uIGFsbCBDYW5ub24uanMgZXZlbnRzXHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICAvLyBUaGUgJ2NvbGxpZGUnIGV2ZW50IHNwZWNpZmljYWxseSBoYXMgdGhlc2UgcHJvcGVydGllczpcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5OyAvLyBUaGUgb3RoZXIgYm9keSBpbnZvbHZlZCBpbiB0aGUgY29sbGlzaW9uXHJcbiAgICB0YXJnZXQ6IENBTk5PTi5Cb2R5OyAvLyBUaGUgYm9keSB0aGF0IHRoZSBldmVudCBsaXN0ZW5lciBpcyBhdHRhY2hlZCB0byAoZS5nLiwgdGhlIGJ1bGxldEJvZHkpXHJcbiAgICBjb250YWN0OiBDQU5OT04uQ29udGFjdEVxdWF0aW9uOyAvLyBUaGUgY29udGFjdCBlcXVhdGlvbiBvYmplY3RcclxufVxyXG5cclxuLy8gRW51bSB0byBkZWZpbmUgdGhlIHBvc3NpYmxlIHN0YXRlcyBvZiB0aGUgZ2FtZVxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSwgICAvLyBUaXRsZSBzY3JlZW4sIHdhaXRpbmcgZm9yIHVzZXIgaW5wdXRcclxuICAgIFBMQVlJTkcgIC8vIEdhbWUgaXMgYWN0aXZlLCB1c2VyIGNhbiBtb3ZlIGFuZCBsb29rIGFyb3VuZFxyXG59XHJcblxyXG4vLyBJbnRlcmZhY2UgZm9yIHN0YXRpYyBvYmplY3RzIChib3hlcykgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkT2JqZWN0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZzsgLy8gQSBkZXNjcmlwdGl2ZSBuYW1lIGZvciB0aGUgb2JqZWN0IGluc3RhbmNlXHJcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBOYW1lIG9mIHRoZSB0ZXh0dXJlIGZyb20gYXNzZXRzLmltYWdlc1xyXG4gICAgdHlwZTogJ2JveCc7IC8vIEV4cGxpY2l0bHkgJ2JveCdcclxuICAgIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcclxuICAgIGRpbWVuc2lvbnM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGRlcHRoOiBudW1iZXIgfTtcclxuICAgIHJvdGF0aW9uWT86IG51bWJlcjsgLy8gT3B0aW9uYWwgcm90YXRpb24gYXJvdW5kIFktYXhpcyAocmFkaWFucylcclxuICAgIG1hc3M6IG51bWJlcjsgLy8gMCBmb3Igc3RhdGljXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBlbmVteSB0eXBlIGRlZmluaXRpb25zIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBFbmVteVR5cGVDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nOyAvLyBlLmcuLCBcImJhc2ljX2VuZW15XCJcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBkZXB0aDogbnVtYmVyIH07XHJcbiAgICBtYXNzOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBzcGVjaWZpYyBlbmVteSBpbnN0YW5jZXMgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkRW5lbXlJbnN0YW5jZUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7IC8vIFVuaXF1ZSBpbnN0YW5jZSBuYW1lLCBlLmcuLCBcImVuZW15MVwiXHJcbiAgICBlbmVteVR5cGVOYW1lOiBzdHJpbmc7IC8vIFJlZmVyZW5jZSB0byBFbmVteVR5cGVDb25maWcubmFtZVxyXG4gICAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgcm90YXRpb25ZPzogbnVtYmVyOyAvLyBPcHRpb25hbCBpbml0aWFsIHJvdGF0aW9uXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBidWxsZXQgY29uZmlndXJhdGlvblxyXG5pbnRlcmZhY2UgQnVsbGV0Q29uZmlnIHtcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHJhZGl1czogbnVtYmVyOyB9OyAvLyBGb3IgYSBzcGhlcmUgYnVsbGV0XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgbWFzczogbnVtYmVyO1xyXG4gICAgbGlmZXRpbWU6IG51bWJlcjsgLy8gTWF4IHRpbWUgaW4gc2Vjb25kcyBiZWZvcmUgaXQgZGVzcGF3bnNcclxuICAgIG1heFJhbmdlOiBudW1iZXI7IC8vIE1heCBkaXN0YW5jZSBmcm9tIGZpcmUgcG9pbnQgYmVmb3JlIGl0IGRlc3Bhd25zXHJcbiAgICB2b2x1bWU6IG51bWJlcjsgLy8gU291bmQgdm9sdW1lXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyOyAgICAgICAgICAvLyBBRERFRDogRm9yY2UgYXBwbGllZCB3aGVuIGp1bXBpbmdcclxuICAgICAgICBzY29yZTogbnVtYmVyOyAgICAgICAgICAgICAgLy8gTkVXOiBJbml0aWFsIHNjb3JlXHJcbiAgICAgICAgZW5lbXlUeXBlczogRW5lbXlUeXBlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2YgZGlmZmVyZW50IGVuZW15IHRlbXBsYXRlc1xyXG4gICAgICAgIHN0YXRpY09iamVjdHM6IFBsYWNlZE9iamVjdENvbmZpZ1tdOyAvLyBORVc6IFJlbmFtZWQgZnJvbSBwbGFjZWRPYmplY3RzLCBvbmx5IHN0YXRpYyBib3hlc1xyXG4gICAgICAgIGVuZW15SW5zdGFuY2VzOiBQbGFjZWRFbmVteUluc3RhbmNlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2Ygc3BlY2lmaWMgZW5lbXkgcGxhY2VtZW50c1xyXG4gICAgICAgIC8vIE5FVzogQ29uZmlndXJhYmxlIHBoeXNpY3MgcHJvcGVydGllc1xyXG4gICAgICAgIHBsYXllckdyb3VuZEZyaWN0aW9uOiBudW1iZXI7ICAgICAgICAvLyBGcmljdGlvbiBjb2VmZmljaWVudCBmb3IgcGxheWVyLWdyb3VuZCBjb250YWN0XHJcbiAgICAgICAgcGxheWVyQWlyQ29udHJvbEZhY3RvcjogbnVtYmVyOyAgICAvLyBNdWx0aXBsaWVyIGZvciBwbGF5ZXJTcGVlZCB3aGVuIGFpcmJvcm5lXHJcbiAgICAgICAgcGxheWVyQWlyRGVjZWxlcmF0aW9uOiBudW1iZXI7ICAgICAvLyBEZWNheSBmYWN0b3IgZm9yIGhvcml6b250YWwgdmVsb2NpdHkgd2hlbiBhaXJib3JuZSBhbmQgbm90IG1vdmluZ1xyXG4gICAgICAgIGJ1bGxldDogQnVsbGV0Q29uZmlnOyAvLyBORVc6IEJ1bGxldCBjb25maWd1cmF0aW9uXHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBhbiBhY3RpdmUgYnVsbGV0IGluc3RhbmNlXHJcbmludGVyZmFjZSBBY3RpdmVCdWxsZXQge1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgY3JlYXRpb25UaW1lOiBudW1iZXI7IC8vIFVzZWQgZm9yIGxpZmV0aW1lIGNoZWNrXHJcbiAgICBmaXJlUG9zaXRpb246IENBTk5PTi5WZWMzOyAvLyBVc2VkIGZvciBtYXhSYW5nZSBjaGVja1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gTkVXOiBGbGFnIHRvIG1hcmsgZm9yIHJlbW92YWxcclxuICAgIGNvbGxpZGVIYW5kbGVyPzogKGV2ZW50OiBDb2xsaWRlRXZlbnQpID0+IHZvaWQ7IC8vIE5FVzogU3RvcmUgdGhlIHNwZWNpZmljIGhhbmRsZXIgZnVuY3Rpb25cclxufVxyXG5cclxuLy8gTkVXOiBJbnRlcmZhY2UgZm9yIGFuIGFjdGl2ZSBlbmVteSBpbnN0YW5jZSAocnVudGltZSBkYXRhKVxyXG5pbnRlcmZhY2UgQWN0aXZlRW5lbXkge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgdHlwZUNvbmZpZzogRW5lbXlUeXBlQ29uZmlnOyAvLyBSZWZlcmVuY2UgdG8gaXRzIHR5cGUgZGVmaW5pdGlvblxyXG4gICAgY3VycmVudEhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gRmxhZyB0byBtYXJrIGZvciByZW1vdmFsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgcHJpdmF0ZSBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmEhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXIhOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDsgLy8gVGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZm9yIHJlbmRlcmluZ1xyXG5cclxuICAgIC8vIE5ldzogQSBjb250YWluZXIgb2JqZWN0IGZvciB0aGUgY2FtZXJhIHRvIGhhbmRsZSBob3Jpem9udGFsIHJvdGF0aW9uIHNlcGFyYXRlbHkgZnJvbSB2ZXJ0aWNhbCBwaXRjaC5cclxuICAgIHByaXZhdGUgY2FtZXJhQ29udGFpbmVyITogVEhSRUUuT2JqZWN0M0Q7IFxyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSB3b3JsZCE6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBORVc6IENhbm5vbi1lcyBtYXRlcmlhbHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgcGxheWVyTWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBkZWZhdWx0T2JqZWN0TWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7IC8vIEFEREVEOiBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDsgLy8gTkVXOiBNYXRlcmlhbCBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBlbmVteU1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsOyAvLyBORVc6IE1hdGVyaWFsIGZvciBlbmVtaWVzXHJcblxyXG4gICAgLy8gVmlzdWFsIG1lc2hlcyAoVGhyZWUuanMpIGZvciBnYW1lIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgLy8gTkVXOiBBcnJheXMgdG8gaG9sZCByZWZlcmVuY2VzIHRvIGR5bmFtaWNhbGx5IHBsYWNlZCBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdE1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdEJvZGllczogQ0FOTk9OLkJvZHlbXSA9IFtdO1xyXG5cclxuICAgIC8vIE5FVzogQWN0aXZlIGJ1bGxldHNcclxuICAgIHByaXZhdGUgYnVsbGV0czogQWN0aXZlQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgYnVsbGV0c1RvUmVtb3ZlOiBTZXQ8QWN0aXZlQnVsbGV0PiA9IG5ldyBTZXQoKTsgLy8gTkVXOiBMaXN0IG9mIGJ1bGxldHMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG4gICAgcHJpdmF0ZSBidWxsZXRHZW9tZXRyeSE6IFRIUkVFLlNwaGVyZUdlb21ldHJ5OyAvLyBSZXVzYWJsZSBnZW9tZXRyeSBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbE1lc2ghOiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbDsgLy8gUmV1c2FibGUgbWF0ZXJpYWwgZm9yIGJ1bGxldHMgKHVzaW5nIEJhc2ljIHRvIHByZXZlbnQgbGlnaHRpbmcgaXNzdWVzIGZvciBzaW1wbGUgYnVsbGV0cylcclxuXHJcbiAgICAvLyBORVc6IEFjdGl2ZSBlbmVtaWVzXHJcbiAgICBwcml2YXRlIGVuZW1pZXM6IEFjdGl2ZUVuZW15W10gPSBbXTtcclxuICAgIHByaXZhdGUgZW5lbWllc1RvUmVtb3ZlOiBTZXQ8QWN0aXZlRW5lbXk+ID0gbmV3IFNldCgpOyAvLyBMaXN0IG9mIGVuZW1pZXMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG5cclxuICAgIC8vIElucHV0IGhhbmRsaW5nIHN0YXRlXHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307IC8vIFRyYWNrcyBjdXJyZW50bHkgcHJlc3NlZCBrZXlzXHJcbiAgICBwcml2YXRlIGlzUG9pbnRlckxvY2tlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUcnVlIGlmIG1vdXNlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICBwcml2YXRlIGNhbWVyYVBpdGNoOiBudW1iZXIgPSAwOyAvLyBWZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIG9mIHRoZSBjYW1lcmFcclxuXHJcbiAgICAvLyBBc3NldCBtYW5hZ2VtZW50XHJcbiAgICBwcml2YXRlIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCB0ZXh0dXJlc1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIGF1ZGlvIGVsZW1lbnRzXHJcblxyXG4gICAgLy8gVUkgZWxlbWVudHMgKGR5bmFtaWNhbGx5IGNyZWF0ZWQgZm9yIHRoZSB0aXRsZSBzY3JlZW4gYW5kIGdhbWUgb3ZlcmxheSlcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHNjb3JlVGV4dCE6IEhUTUxEaXZFbGVtZW50OyAvLyBORVc6IFVJIGVsZW1lbnQgZm9yIHNjb3JlXHJcblxyXG4gICAgLy8gRm9yIGNhbGN1bGF0aW5nIGRlbHRhIHRpbWUgYmV0d2VlbiBmcmFtZXNcclxuICAgIHByaXZhdGUgbGFzdFRpbWU6IERPTUhpZ2hSZXNUaW1lU3RhbXAgPSAwO1xyXG5cclxuICAgIC8vIE1PRElGSUVEOiBUcmFja3MgcGxheWVyIGNvbnRhY3RzIHdpdGggQU5ZIHN0YXRpYyBzdXJmYWNlIChncm91bmQgb3IgcGxhY2VkIG9iamVjdHMpIGZvciBqdW1waW5nL21vdmVtZW50IGxvZ2ljXHJcbiAgICBwcml2YXRlIG51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzOiBudW1iZXIgPSAwO1xyXG5cclxuICAgIC8vIE5FVzogR2FtZSBzY29yZVxyXG4gICAgcHJpdmF0ZSBzY29yZTogbnVtYmVyID0gMDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcigpIHtcclxuICAgICAgICAvLyBHZXQgdGhlIGNhbnZhcyBlbGVtZW50IGZyb20gaW5kZXguaHRtbFxyXG4gICAgICAgIHRoaXMuY2FudmFzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2dhbWVDYW52YXMnKSBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgICBpZiAoIXRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0NhbnZhcyBlbGVtZW50IHdpdGggSUQgXCJnYW1lQ2FudmFzXCIgbm90IGZvdW5kIScpO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIENhbm5vdCBwcm9jZWVkIHdpdGhvdXQgYSBjYW52YXNcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5pbml0KCk7IC8vIFN0YXJ0IHRoZSBhc3luY2hyb25vdXMgaW5pdGlhbGl6YXRpb24gcHJvY2Vzc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXN5bmNocm9ub3VzbHkgaW5pdGlhbGl6ZXMgdGhlIGdhbWUsIGxvYWRpbmcgY29uZmlnLCBhc3NldHMsIGFuZCBzZXR0aW5nIHVwIHN5c3RlbXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICAvLyAxLiBMb2FkIGdhbWUgY29uZmlndXJhdGlvbiBmcm9tIGRhdGEuanNvblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2RhdGEuanNvbicpO1xyXG4gICAgICAgICAgICBpZiAoIXJlc3BvbnNlLm9rKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEhUVFAgZXJyb3IhIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb25maWcgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdHYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkOicsIHRoaXMuY29uZmlnKTtcclxuICAgICAgICAgICAgdGhpcy5zY29yZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zY29yZTsgLy8gSW5pdGlhbGl6ZSBzY29yZSBmcm9tIGNvbmZpZ1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIC8vIElmIGNvbmZpZ3VyYXRpb24gZmFpbHMgdG8gbG9hZCwgZGlzcGxheSBhbiBlcnJvciBtZXNzYWdlIGFuZCBzdG9wLlxyXG4gICAgICAgICAgICBjb25zdCBlcnJvckRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRvcCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5sZWZ0ID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnRyYW5zZm9ybSA9ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5jb2xvciA9ICdyZWQnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS5mb250U2l6ZSA9ICcyNHB4JztcclxuICAgICAgICAgICAgZXJyb3JEaXYudGV4dENvbnRlbnQgPSAnRXJyb3I6IEZhaWxlZCB0byBsb2FkIGdhbWUgY29uZmlndXJhdGlvbi4gQ2hlY2sgY29uc29sZSBmb3IgZGV0YWlscy4nO1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGVycm9yRGl2KTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gMi4gSW5pdGlhbGl6ZSBUaHJlZS5qcyAoc2NlbmUsIGNhbWVyYSwgcmVuZGVyZXIpXHJcbiAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLlBlcnNwZWN0aXZlQ2FtZXJhKFxyXG4gICAgICAgICAgICA3NSwgLy8gRmllbGQgb2YgVmlldyAoRk9WKVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodCwgLy8gRml4ZWQgQXNwZWN0IHJhdGlvIGZyb20gY29uZmlnXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFOZWFyLCAvLyBOZWFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFGYXIgICAvLyBGYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcih7IGNhbnZhczogdGhpcy5jYW52YXMsIGFudGlhbGlhczogdHJ1ZSB9KTtcclxuICAgICAgICAvLyBSZW5kZXJlciBzaXplIHdpbGwgYmUgc2V0IGJ5IGFwcGx5Rml4ZWRBc3BlY3RSYXRpbyB0byBmaXQgdGhlIHdpbmRvdyB3aGlsZSBtYWludGFpbmluZyBhc3BlY3QgcmF0aW9cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFBpeGVsUmF0aW8od2luZG93LmRldmljZVBpeGVsUmF0aW8pO1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hhZG93TWFwLmVuYWJsZWQgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmb3IgYmV0dGVyIHJlYWxpc21cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC50eXBlID0gVEhSRUUuUENGU29mdFNoYWRvd01hcDsgLy8gVXNlIHNvZnQgc2hhZG93c1xyXG5cclxuICAgICAgICAvLyBDYW1lcmEgc2V0dXAgZm9yIGRlY291cGxlZCB5YXcgYW5kIHBpdGNoOlxyXG4gICAgICAgIC8vIGNhbWVyYUNvbnRhaW5lciBoYW5kbGVzIHlhdyAoaG9yaXpvbnRhbCByb3RhdGlvbikgYW5kIGZvbGxvd3MgdGhlIHBsYXllcidzIHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYW5kbGVzIHBpdGNoICh2ZXJ0aWNhbCByb3RhdGlvbikuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmNhbWVyYUNvbnRhaW5lcik7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIuYWRkKHRoaXMuY2FtZXJhKTtcclxuICAgICAgICAvLyBQb3NpdGlvbiB0aGUgY2FtZXJhIHJlbGF0aXZlIHRvIHRoZSBjYW1lcmFDb250YWluZXIgKGF0IGV5ZSBsZXZlbClcclxuICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi55ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUhlaWdodE9mZnNldDtcclxuXHJcblxyXG4gICAgICAgIC8vIDMuIEluaXRpYWxpemUgQ2Fubm9uLWVzIChwaHlzaWNzIHdvcmxkKVxyXG4gICAgICAgIHRoaXMud29ybGQgPSBuZXcgQ0FOTk9OLldvcmxkKCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5ncmF2aXR5LnNldCgwLCAtOS44MiwgMCk7IC8vIFNldCBzdGFuZGFyZCBFYXJ0aCBncmF2aXR5IChZLWF4aXMgZG93bilcclxuICAgICAgICB0aGlzLndvcmxkLmJyb2FkcGhhc2UgPSBuZXcgQ0FOTk9OLlNBUEJyb2FkcGhhc2UodGhpcy53b3JsZCk7IC8vIFVzZSBhbiBlZmZpY2llbnQgYnJvYWRwaGFzZSBhbGdvcml0aG1cclxuICAgICAgICAvLyBGaXg6IENhc3QgdGhpcy53b3JsZC5zb2x2ZXIgdG8gQ0FOTk9OLkdTU29sdmVyIHRvIGFjY2VzcyB0aGUgJ2l0ZXJhdGlvbnMnIHByb3BlcnR5XHJcbiAgICAgICAgLy8gVGhlIGRlZmF1bHQgc29sdmVyIGluIENhbm5vbi5qcyAoYW5kIENhbm5vbi1lcykgaXMgR1NTb2x2ZXIsIHdoaWNoIGhhcyB0aGlzIHByb3BlcnR5LlxyXG4gICAgICAgICh0aGlzLndvcmxkLnNvbHZlciBhcyBDQU5OT04uR1NTb2x2ZXIpLml0ZXJhdGlvbnMgPSAxMDsgLy8gSW5jcmVhc2Ugc29sdmVyIGl0ZXJhdGlvbnMgZm9yIGJldHRlciBzdGFiaWxpdHlcclxuXHJcbiAgICAgICAgLy8gTkVXOiBDcmVhdGUgQ2Fubm9uLmpzIE1hdGVyaWFscyBhbmQgQ29udGFjdE1hdGVyaWFsIGZvciBwbGF5ZXItZ3JvdW5kIGludGVyYWN0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ3BsYXllck1hdGVyaWFsJyk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2dyb3VuZE1hdGVyaWFsJyk7XHJcbiAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdkZWZhdWx0T2JqZWN0TWF0ZXJpYWwnKTsgLy8gQURERUQ6IE1hdGVyaWFsIGZvciBnZW5lcmljIHBsYWNlZCBvYmplY3RzXHJcbiAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2J1bGxldE1hdGVyaWFsJyk7IC8vIE5FVzogQnVsbGV0IG1hdGVyaWFsXHJcbiAgICAgICAgdGhpcy5lbmVteU1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZW5lbXlNYXRlcmlhbCcpOyAvLyBORVc6IEVuZW15IG1hdGVyaWFsXHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCAvLyBVc2UgY29uZmlndXJhYmxlIGdyb3VuZCBmcmljdGlvblxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCwgLy8gTm8gYm91bmNlIGZvciBncm91bmRcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyR3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gQURERUQ6IFBsYXllci1PYmplY3QgY29udGFjdCBtYXRlcmlhbCAoZnJpY3Rpb24gYmV0d2VlbiBwbGF5ZXIgYW5kIHBsYWNlZCBvYmplY3RzKVxyXG4gICAgICAgIGNvbnN0IHBsYXllck9iamVjdENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJHcm91bmRGcmljdGlvbiwgLy8gU2FtZSBmcmljdGlvbiBhcyBwbGF5ZXItZ3JvdW5kXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChwbGF5ZXJPYmplY3RDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBBRERFRDogT2JqZWN0LUdyb3VuZCBjb250YWN0IG1hdGVyaWFsIChmcmljdGlvbiBiZXR3ZWVuIHBsYWNlZCBvYmplY3RzIGFuZCBncm91bmQpXHJcbiAgICAgICAgY29uc3Qgb2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwob2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBCdWxsZXQtR3JvdW5kIGNvbnRhY3QgbWF0ZXJpYWwgKG5vIGZyaWN0aW9uLCBubyByZXN0aXR1dGlvbilcclxuICAgICAgICBjb25zdCBidWxsZXRHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuMCxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKGJ1bGxldEdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQnVsbGV0LU9iamVjdCBjb250YWN0IG1hdGVyaWFsIChubyBmcmljdGlvbiwgbm8gcmVzdGl0dXRpb24pXHJcbiAgICAgICAgY29uc3QgYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBCdWxsZXQtRW5lbXkgY29udGFjdCBtYXRlcmlhbCAoYnVsbGV0IGRpc2FwcGVhcnMsIGVuZW15IHRha2VzIGRhbWFnZSlcclxuICAgICAgICBjb25zdCBidWxsZXRFbmVteUNvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmVuZW15TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChidWxsZXRFbmVteUNvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogUGxheWVyLUVuZW15IGNvbnRhY3QgbWF0ZXJpYWwgKHBsYXllciBtaWdodCBwdXNoIGVuZW15IHNsaWdodGx5KVxyXG4gICAgICAgIGNvbnN0IHBsYXllckVuZW15Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbXlNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuNSxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKHBsYXllckVuZW15Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcblxyXG4gICAgICAgIC8vIDQuIExvYWQgYXNzZXRzICh0ZXh0dXJlcyBhbmQgc291bmRzKVxyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBDcmVhdGUgZ2FtZSBvYmplY3RzIChwbGF5ZXIsIGdyb3VuZCwgc3RhdGljIG9iamVjdHMsIGVuZW1pZXMpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7IC8vIENyZWF0ZXMgdGhpcy5ncm91bmRCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTsgLy8gQ3JlYXRlcyB0aGlzLnBsYXllckJvZHlcclxuICAgICAgICB0aGlzLmNyZWF0ZVN0YXRpY09iamVjdHMoKTsgLy8gUmVuYW1lZCBmcm9tIGNyZWF0ZVBsYWNlZE9iamVjdHMsIGNyZWF0ZXMgc3RhdGljIGJveGVzXHJcbiAgICAgICAgdGhpcy5jcmVhdGVFbmVtaWVzKCk7IC8vIE5FVzogQ3JlYXRlcyBlbmVtaWVzXHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIHJldXNhYmxlIGJ1bGxldCBnZW9tZXRyeSBhbmQgbWF0ZXJpYWxcclxuICAgICAgICB0aGlzLmJ1bGxldEdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQuZGltZW5zaW9ucy5yYWRpdXMsIDgsIDgpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0LnRleHR1cmVOYW1lKTtcclxuICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsTWVzaCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogYnVsbGV0VGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGJ1bGxldFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ZmZmZjAwIC8vIFllbGxvdyBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIE1PRElGSUVEOiBTZXR1cCBDYW5ub24tZXMgY29udGFjdCBsaXN0ZW5lcnMgZm9yIGdlbmVyYWwgc3VyZmFjZSBjb250YWN0IGxvZ2ljXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdiZWdpbkNvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgbGV0IGJvZHlBID0gZXZlbnQuYm9keUE7XHJcbiAgICAgICAgICAgIGxldCBib2R5QiA9IGV2ZW50LmJvZHlCO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcGxheWVyQm9keSBpcyBpbnZvbHZlZCBpbiB0aGUgY29udGFjdFxyXG4gICAgICAgICAgICBpZiAoYm9keUEgPT09IHRoaXMucGxheWVyQm9keSB8fCBib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5ID8gYm9keUIgOiBib2R5QTtcclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBvdGhlciBib2R5IGlzIHN0YXRpYyAobWFzcyA9IDApLCB3aGljaCBpbmNsdWRlcyBncm91bmQgYW5kIHBsYWNlZCBvYmplY3RzXHJcbiAgICAgICAgICAgICAgICBpZiAob3RoZXJCb2R5Lm1hc3MgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzKys7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdlbmRDb250YWN0JywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBib2R5QSA9IGV2ZW50LmJvZHlBO1xyXG4gICAgICAgICAgICBsZXQgYm9keUIgPSBldmVudC5ib2R5QjtcclxuXHJcbiAgICAgICAgICAgIGlmIChib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5IHx8IGJvZHlCID09PSB0aGlzLnBsYXllckJvZHkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG90aGVyQm9keSA9IGJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgPyBib2R5QiA6IGJvZHlBO1xyXG4gICAgICAgICAgICAgICAgaWYgKG90aGVyQm9keS5tYXNzID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9IE1hdGgubWF4KDAsIHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgLSAxKTsgLy8gRW5zdXJlIGl0IGRvZXNuJ3QgZ28gYmVsb3cgMFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIDcuIFNldHVwIGV2ZW50IGxpc3RlbmVycyBmb3IgdXNlciBpbnB1dCBhbmQgd2luZG93IHJlc2l6aW5nXHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMub25XaW5kb3dSZXNpemUuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMub25Nb3VzZU1vdmUuYmluZCh0aGlzKSk7IC8vIEZvciBtb3VzZSBsb29rXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpKTsgLy8gTkVXOiBGb3IgZmlyaW5nIGJ1bGxldHNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRm9yIHBvaW50ZXIgbG9jayBzdGF0dXNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRmlyZWZveCBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIFdlYmtpdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGluaXRpYWwgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIC8vIDguIFNldHVwIHRoZSB0aXRsZSBzY3JlZW4gVUkgYW5kIEdhbWUgVUlcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICB0aGlzLnNldHVwR2FtZVVJKCk7IC8vIE5FVzogU2V0dXAgc2NvcmUgZGlzcGxheVxyXG5cclxuICAgICAgICAvLyBTdGFydCB0aGUgbWFpbiBnYW1lIGxvb3BcclxuICAgICAgICB0aGlzLmFuaW1hdGUoMCk7IC8vIFBhc3MgaW5pdGlhbCB0aW1lIDBcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIExvYWRzIGFsbCB0ZXh0dXJlcyBhbmQgc291bmRzIGRlZmluZWQgaW4gdGhlIGdhbWUgY29uZmlndXJhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCkge1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gdGV4dHVyZUxvYWRlci5sb2FkQXN5bmMoaW1nLnBhdGgpXHJcbiAgICAgICAgICAgICAgICAudGhlbih0ZXh0dXJlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVzLnNldChpbWcubmFtZSwgdGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSBob3Jpem9udGFsbHlcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7IC8vIFJlcGVhdCB0ZXh0dXJlIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgICAgICAvLyBBZGp1c3QgdGV4dHVyZSByZXBldGl0aW9uIGZvciB0aGUgZ3JvdW5kIHRvIGF2b2lkIHN0cmV0Y2hpbmdcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUgPT09ICdncm91bmRfdGV4dHVyZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgIHRleHR1cmUucmVwZWF0LnNldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gNSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEZvciBib3ggdGV4dHVyZXMsIGVuc3VyZSByZXBldGl0aW9uIGlmIGRlc2lyZWQsIG9yIHNldCB0byAxLDEgZm9yIHNpbmdsZSBhcHBsaWNhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbWcubmFtZS5lbmRzV2l0aCgnX3RleHR1cmUnKSkgeyAvLyBHZW5lcmljIGNoZWNrIGZvciBvdGhlciB0ZXh0dXJlc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3IgZ2VuZXJpYyBib3ggdGV4dHVyZXMsIHdlIG1pZ2h0IHdhbnQgdG8gcmVwZWF0IGJhc2VkIG9uIG9iamVjdCBkaW1lbnNpb25zXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBzaW1wbGljaXR5IG5vdywgbGV0J3Mga2VlcCBkZWZhdWx0IChubyByZXBlYXQgdW5sZXNzIGV4cGxpY2l0IGZvciBncm91bmQpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEEgbW9yZSByb2J1c3Qgc29sdXRpb24gd291bGQgaW52b2x2ZSBzZXR0aW5nIHJlcGVhdCBiYXNlZCBvbiBzY2FsZS9kaW1lbnNpb25zIGZvciBlYWNoIG9iamVjdFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmU6ICR7aW1nLnBhdGh9YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbnRpbnVlIGV2ZW4gaWYgYW4gYXNzZXQgZmFpbHMgdG8gbG9hZDsgZmFsbGJhY2tzIChzb2xpZCBjb2xvcnMpIGFyZSB1c2VkLlxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzb3VuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb29wID0gKHNvdW5kLm5hbWUgPT09ICdiYWNrZ3JvdW5kX211c2ljJyk7IC8vIExvb3AgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoc291bmQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIFByb21pc2UuYWxsXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQXNzZXRzIGxvYWRlZDogJHt0aGlzLnRleHR1cmVzLnNpemV9IHRleHR1cmVzLCAke3RoaXMuc291bmRzLnNpemV9IHNvdW5kcy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGRpc3BsYXlzIHRoZSB0aXRsZSBzY3JlZW4gVUkgZHluYW1pY2FsbHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIC8vIFBvc2l0aW9uIHJlbGF0aXZlIHRvIGJvZHksIHdpbGwgYmUgY2VudGVyZWQgYW5kIHNpemVkIGJ5IGFwcGx5Rml4ZWRBc3BlY3RSYXRpb1xyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICdyZ2JhKDAsIDAsIDAsIDAuOCknLFxyXG4gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLFxyXG4gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsIGFsaWduSXRlbXM6ICdjZW50ZXInLFxyXG4gICAgICAgICAgICBjb2xvcjogJ3doaXRlJywgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICc0OHB4JywgdGV4dEFsaWduOiAnY2VudGVyJywgekluZGV4OiAnMTAwMCdcclxuICAgICAgICB9KTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuXHJcbiAgICAgICAgLy8gQ3J1Y2lhbDogQ2FsbCBhcHBseUZpeGVkQXNwZWN0UmF0aW8gaGVyZSB0byBlbnN1cmUgdGhlIHRpdGxlIHNjcmVlbiBvdmVybGF5XHJcbiAgICAgICAgLy8gaXMgc2l6ZWQgYW5kIHBvc2l0aW9uZWQgY29ycmVjdGx5IHJlbGF0aXZlIHRvIHRoZSBjYW52YXMgZnJvbSB0aGUgc3RhcnQuXHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTtcclxuXHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnRpdGxlVGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aXRsZVNjcmVlblRleHQ7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVRleHQpO1xyXG5cclxuICAgICAgICB0aGlzLnByb21wdFRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnByb21wdFRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhcnRHYW1lUHJvbXB0O1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5wcm9tcHRUZXh0LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIG1hcmdpblRvcDogJzIwcHgnLCBmb250U2l6ZTogJzI0cHgnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy5wcm9tcHRUZXh0KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIGRpcmVjdGx5IHRvIHRoZSBvdmVybGF5IHRvIGNhcHR1cmUgY2xpY2tzIGFuZCBzdGFydCB0aGUgZ2FtZVxyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zdGFydEdhbWUoKSk7XHJcblxyXG4gICAgICAgIC8vIEF0dGVtcHQgdG8gcGxheSBiYWNrZ3JvdW5kIG11c2ljLiBJdCBtaWdodCBiZSBibG9ja2VkIGJ5IGJyb3dzZXJzIGlmIG5vIHVzZXIgZ2VzdHVyZSBoYXMgb2NjdXJyZWQgeWV0LlxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGRlbmllZCAocmVxdWlyZXMgdXNlciBnZXN0dXJlKTpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBDcmVhdGVzIGFuZCBkaXNwbGF5cyB0aGUgZ2FtZSBzY29yZSBVSS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cEdhbWVVSSgpIHtcclxuICAgICAgICB0aGlzLnNjb3JlVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5zY29yZVRleHQuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIHRvcDogJzEwcHgnLFxyXG4gICAgICAgICAgICBsZWZ0OiAnMTBweCcsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnd2hpdGUnLFxyXG4gICAgICAgICAgICBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzI0cHgnLFxyXG4gICAgICAgICAgICB6SW5kZXg6ICcxMDAxJyAvLyBBYm92ZSB0aXRsZSBzY3JlZW4gb3ZlcmxheSBidXQgc2VwYXJhdGVcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnNjb3JlVGV4dC50ZXh0Q29udGVudCA9IGBTY29yZTogJHt0aGlzLnNjb3JlfWA7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLnNjb3JlVGV4dCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFVwZGF0ZXMgdGhlIHNjb3JlIGRpc3BsYXkgb24gdGhlIFVJLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVNjb3JlRGlzcGxheSgpIHtcclxuICAgICAgICBpZiAodGhpcy5zY29yZVRleHQpIHtcclxuICAgICAgICAgICAgdGhpcy5zY29yZVRleHQudGV4dENvbnRlbnQgPSBgU2NvcmU6ICR7dGhpcy5zY29yZX1gO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyYW5zaXRpb25zIHRoZSBnYW1lIGZyb20gdGhlIHRpdGxlIHNjcmVlbiB0byB0aGUgcGxheWluZyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIHRvIGNhbnZhcyBmb3IgcmUtbG9ja2luZyBwb2ludGVyIGFmdGVyIHRpdGxlIHNjcmVlbiBpcyBnb25lXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIFJlcXVlc3QgcG9pbnRlciBsb2NrIGZvciBpbW1lcnNpdmUgbW91c2UgY29udHJvbFxyXG4gICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIC8vIEVuc3VyZSBiYWNrZ3JvdW5kIG11c2ljIHBsYXlzIG5vdyB0aGF0IGEgdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZFxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGZhaWxlZCBhZnRlciB1c2VyIGdlc3R1cmU6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgY2xpY2tzIG9uIHRoZSBjYW52YXMgdG8gcmUtbG9jayB0aGUgcG9pbnRlciBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCB1bmxvY2tlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiAhdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGF5ZXIoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIHZpc3VhbCBtZXNoIChhIHNpbXBsZSBib3gpXHJcbiAgICAgICAgY29uc3QgcGxheWVyVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdwbGF5ZXJfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IHBsYXllclRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBwbGF5ZXJUZXh0dXJlID8gMHhmZmZmZmYgOiAweDAwNzdmZiAvLyBVc2Ugd2hpdGUgd2l0aCB0ZXh0dXJlLCBvciBibHVlIGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxLCAyLCAxKTsgLy8gUGxheWVyIGRpbWVuc2lvbnNcclxuICAgICAgICB0aGlzLnBsYXllck1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGF5ZXJHZW9tZXRyeSwgcGxheWVyTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55ID0gNTsgLy8gU3RhcnQgcGxheWVyIHNsaWdodGx5IGFib3ZlIHRoZSBncm91bmRcclxuICAgICAgICB0aGlzLnBsYXllck1lc2guY2FzdFNoYWRvdyA9IHRydWU7IC8vIFBsYXllciBjYXN0cyBhIHNoYWRvd1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMucGxheWVyTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBib3ggc2hhcGUpXHJcbiAgICAgICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoMC41LCAxLCAwLjUpKTsgLy8gSGFsZiBleHRlbnRzIG9mIHRoZSBib3ggZm9yIGNvbGxpc2lvblxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJNYXNzLCAvLyBQbGF5ZXIncyBtYXNzXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzModGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLngsIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBwbGF5ZXJTaGFwZSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSwgLy8gUHJldmVudCB0aGUgcGxheWVyIGZyb20gZmFsbGluZyBvdmVyIChzaW11bGF0ZXMgYSBjYXBzdWxlL2N5bGluZGVyIGNoYXJhY3RlcilcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMucGxheWVyTWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBwbGF5ZXIgbWF0ZXJpYWwgZm9yIGNvbnRhY3QgcmVzb2x1dGlvblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCBjYW1lcmFDb250YWluZXIgcG9zaXRpb24gdG8gcGxheWVyJ3MgcGh5c2ljcyBib2R5IHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYXMgaXRzIG93biBsb2NhbCBZIG9mZnNldC5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgZ3JvdW5kJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVHcm91bmQoKSB7XHJcbiAgICAgICAgLy8gR3JvdW5kIHZpc3VhbCBtZXNoIChhIGxhcmdlIHBsYW5lKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBncm91bmRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZ3JvdW5kVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4ODg4ODggLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdyb3VuZEdlb21ldHJ5LCBncm91bmRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7IC8vIFJvdGF0ZSB0byBsYXkgZmxhdCBvbiB0aGUgWFogcGxhbmVcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7IC8vIEdyb3VuZCByZWNlaXZlcyBzaGFkb3dzXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5ncm91bmRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIHBsYW5lIHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDAsIC8vIEEgbWFzcyBvZiAwIG1ha2VzIGl0IGEgc3RhdGljIChpbW1vdmFibGUpIGJvZHlcclxuICAgICAgICAgICAgc2hhcGU6IGdyb3VuZFNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5ncm91bmRNYXRlcmlhbCAvLyBBc3NpZ24gdGhlIGdyb3VuZCBtYXRlcmlhbCBmb3IgY29udGFjdCByZXNvbHV0aW9uXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gUm90YXRlIHRoZSBDYW5ub24uanMgcGxhbmUgYm9keSB0byBtYXRjaCB0aGUgVGhyZWUuanMgcGxhbmUgb3JpZW50YXRpb24gKGZsYXQpXHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMSwgMCwgMCksIC1NYXRoLlBJIC8gMik7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZ3JvdW5kQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IENyZWF0ZXMgdmlzdWFsIG1lc2hlcyBhbmQgcGh5c2ljcyBib2RpZXMgZm9yIGFsbCBzdGF0aWMgb2JqZWN0cyAoYm94ZXMpIGRlZmluZWQgaW4gY29uZmlnLmdhbWVTZXR0aW5ncy5zdGF0aWNPYmplY3RzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVN0YXRpY09iamVjdHMoKSB7IC8vIFJlbmFtZWQgZnJvbSBjcmVhdGVQbGFjZWRPYmplY3RzXHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhdGljT2JqZWN0cykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBzdGF0aWNPYmplY3RzIGRlZmluZWQgaW4gZ2FtZVNldHRpbmdzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnN0YXRpY09iamVjdHMuZm9yRWFjaChvYmpDb25maWcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQob2JqQ29uZmlnLnRleHR1cmVOYW1lKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBtYXA6IHRleHR1cmUsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhhYWFhYWEgLy8gRGVmYXVsdCBncmV5IGlmIG5vIHRleHR1cmVcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgVGhyZWUuanMgTWVzaFxyXG4gICAgICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0LCBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICBtZXNoLnBvc2l0aW9uLnNldChvYmpDb25maWcucG9zaXRpb24ueCwgb2JqQ29uZmlnLnBvc2l0aW9uLnksIG9iakNvbmZpZy5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ID0gb2JqQ29uZmlnLnJvdGF0aW9uWTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RNZXNoZXMucHVzaChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBDYW5ub24uanMgQm9keVxyXG4gICAgICAgICAgICAvLyBDYW5ub24uQm94IHRha2VzIGhhbGYgZXh0ZW50c1xyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogb2JqQ29uZmlnLm1hc3MsIC8vIFVzZSAwIGZvciBzdGF0aWMgb2JqZWN0c1xyXG4gICAgICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyhvYmpDb25maWcucG9zaXRpb24ueCwgb2JqQ29uZmlnLnBvc2l0aW9uLnksIG9iakNvbmZpZy5wb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgICAgIHNoYXBlOiBzaGFwZSxcclxuICAgICAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCAvLyBBc3NpZ24gdGhlIGRlZmF1bHQgb2JqZWN0IG1hdGVyaWFsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpZiAob2JqQ29uZmlnLnJvdGF0aW9uWSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBib2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMCwgMSwgMCksIG9iakNvbmZpZy5yb3RhdGlvblkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keShib2R5KTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RCb2RpZXMucHVzaChib2R5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQ3JlYXRlZCAke3RoaXMucGxhY2VkT2JqZWN0TWVzaGVzLmxlbmd0aH0gc3RhdGljIG9iamVjdHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IENyZWF0ZXMgdmlzdWFsIG1lc2hlcyBhbmQgcGh5c2ljcyBib2RpZXMgZm9yIGFsbCBlbmVteSBpbnN0YW5jZXMgZGVmaW5lZCBpbiBjb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SW5zdGFuY2VzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZUVuZW1pZXMoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlJbnN0YW5jZXMgfHwgIXRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteVR5cGVzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIk5vIGVuZW15SW5zdGFuY2VzIG9yIGVuZW15VHlwZXMgZGVmaW5lZCBpbiBnYW1lU2V0dGluZ3MuXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBlbmVteVR5cGVNYXAgPSBuZXcgTWFwPHN0cmluZywgRW5lbXlUeXBlQ29uZmlnPigpO1xyXG4gICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteVR5cGVzLmZvckVhY2godHlwZSA9PiBlbmVteVR5cGVNYXAuc2V0KHR5cGUubmFtZSwgdHlwZSkpO1xyXG5cclxuICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlJbnN0YW5jZXMuZm9yRWFjaChpbnN0YW5jZUNvbmZpZyA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHR5cGVDb25maWcgPSBlbmVteVR5cGVNYXAuZ2V0KGluc3RhbmNlQ29uZmlnLmVuZW15VHlwZU5hbWUpO1xyXG4gICAgICAgICAgICBpZiAoIXR5cGVDb25maWcpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVuZW15IHR5cGUgJyR7aW5zdGFuY2VDb25maWcuZW5lbXlUeXBlTmFtZX0nIG5vdCBmb3VuZCBmb3IgaW5zdGFuY2UgJyR7aW5zdGFuY2VDb25maWcubmFtZX0nLiBTa2lwcGluZy5gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KHR5cGVDb25maWcudGV4dHVyZU5hbWUpO1xyXG4gICAgICAgICAgICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgICAgIG1hcDogdGV4dHVyZSxcclxuICAgICAgICAgICAgICAgIGNvbG9yOiB0ZXh0dXJlID8gMHhmZmZmZmYgOiAweGZmMDAwMCAvLyBEZWZhdWx0IHJlZCBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIFRocmVlLmpzIE1lc2hcclxuICAgICAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkodHlwZUNvbmZpZy5kaW1lbnNpb25zLndpZHRoLCB0eXBlQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0LCB0eXBlQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICAgICAgbWVzaC5wb3NpdGlvbi5zZXQoaW5zdGFuY2VDb25maWcucG9zaXRpb24ueCwgaW5zdGFuY2VDb25maWcucG9zaXRpb24ueSwgaW5zdGFuY2VDb25maWcucG9zaXRpb24ueik7XHJcbiAgICAgICAgICAgIGlmIChpbnN0YW5jZUNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ID0gaW5zdGFuY2VDb25maWcucm90YXRpb25ZO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKG1lc2gpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIENhbm5vbi5qcyBCb2R5XHJcbiAgICAgICAgICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKFxyXG4gICAgICAgICAgICAgICAgdHlwZUNvbmZpZy5kaW1lbnNpb25zLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIHR5cGVDb25maWcuZGltZW5zaW9ucy5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICAgICAgdHlwZUNvbmZpZy5kaW1lbnNpb25zLmRlcHRoIC8gMlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgY29uc3QgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgICAgICBtYXNzOiB0eXBlQ29uZmlnLm1hc3MsXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLngsIGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLnksIGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICAgICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuZW5lbXlNYXRlcmlhbCxcclxuICAgICAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUgLy8gUHJldmVudCBlbmVtaWVzIGZyb20gdHVtYmxpbmdcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGlmIChpbnN0YW5jZUNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgYm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDAsIDEsIDApLCBpbnN0YW5jZUNvbmZpZy5yb3RhdGlvblkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keShib2R5KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUVuZW15OiBBY3RpdmVFbmVteSA9IHtcclxuICAgICAgICAgICAgICAgIG5hbWU6IGluc3RhbmNlQ29uZmlnLm5hbWUsXHJcbiAgICAgICAgICAgICAgICBtZXNoOiBtZXNoLFxyXG4gICAgICAgICAgICAgICAgYm9keTogYm9keSxcclxuICAgICAgICAgICAgICAgIHR5cGVDb25maWc6IHR5cGVDb25maWcsXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50SGVhbHRoOiB0eXBlQ29uZmlnLmhlYWx0aCxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYm9keS51c2VyRGF0YSA9IGFjdGl2ZUVuZW15OyAvLyBBdHRhY2ggYWN0aXZlRW5lbXkgdG8gYm9keSBmb3IgY29sbGlzaW9uIGxvb2t1cFxyXG5cclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzLnB1c2goYWN0aXZlRW5lbXkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBDcmVhdGVkICR7dGhpcy5lbmVtaWVzLmxlbmd0aH0gZW5lbWllcy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgYW1iaWVudCBhbmQgZGlyZWN0aW9uYWwgbGlnaHRpbmcgaW4gdGhlIHNjZW5lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwTGlnaHRpbmcoKSB7XHJcbiAgICAgICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweDQwNDA0MCwgMS4wKTsgLy8gU29mdCB3aGl0ZSBhbWJpZW50IGxpZ2h0XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYW1iaWVudExpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uYWxMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpOyAvLyBCcmlnaHRlciBkaXJlY3Rpb25hbCBsaWdodFxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQucG9zaXRpb24uc2V0KDUsIDEwLCA1KTsgLy8gUG9zaXRpb24gdGhlIGxpZ2h0IHNvdXJjZVxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7IC8vIEVuYWJsZSBzaGFkb3dzIGZyb20gdGhpcyBsaWdodCBzb3VyY2VcclxuICAgICAgICAvLyBDb25maWd1cmUgc2hhZG93IHByb3BlcnRpZXMgZm9yIHRoZSBkaXJlY3Rpb25hbCBsaWdodFxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUud2lkdGggPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUuaGVpZ2h0ID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubmVhciA9IDAuNTtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuZmFyID0gNTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmxlZnQgPSAtMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnJpZ2h0ID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5ib3R0b20gPSAtMTA7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoZGlyZWN0aW9uYWxMaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIHdpbmRvdyByZXNpemluZyB0byBrZWVwIHRoZSBjYW1lcmEgYXNwZWN0IHJhdGlvIGFuZCByZW5kZXJlciBzaXplIGNvcnJlY3QuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25XaW5kb3dSZXNpemUoKSB7XHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTsgLy8gQXBwbHkgdGhlIGZpeGVkIGFzcGVjdCByYXRpbyBhbmQgY2VudGVyIHRoZSBjYW52YXNcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFwcGxpZXMgdGhlIGNvbmZpZ3VyZWQgZml4ZWQgYXNwZWN0IHJhdGlvIHRvIHRoZSByZW5kZXJlciBhbmQgY2FtZXJhLFxyXG4gICAgICogcmVzaXppbmcgYW5kIGNlbnRlcmluZyB0aGUgY2FudmFzIHRvIGZpdCB3aXRoaW4gdGhlIHdpbmRvdy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhcHBseUZpeGVkQXNwZWN0UmF0aW8oKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0QXNwZWN0UmF0aW8gPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodDtcclxuXHJcbiAgICAgICAgbGV0IG5ld1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgbGV0IG5ld0hlaWdodDogbnVtYmVyO1xyXG5cclxuICAgICAgICBjb25zdCB3aW5kb3dXaWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoO1xyXG4gICAgICAgIGNvbnN0IHdpbmRvd0hlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICBjb25zdCBjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPSB3aW5kb3dXaWR0aCAvIHdpbmRvd0hlaWdodDtcclxuXHJcbiAgICAgICAgaWYgKGN1cnJlbnRXaW5kb3dBc3BlY3RSYXRpbyA+IHRhcmdldEFzcGVjdFJhdGlvKSB7XHJcbiAgICAgICAgICAgIC8vIFdpbmRvdyBpcyB3aWRlciB0aGFuIHRhcmdldCBhc3BlY3QgcmF0aW8sIGhlaWdodCBpcyB0aGUgbGltaXRpbmcgZmFjdG9yXHJcbiAgICAgICAgICAgIG5ld0hlaWdodCA9IHdpbmRvd0hlaWdodDtcclxuICAgICAgICAgICAgbmV3V2lkdGggPSBuZXdIZWlnaHQgKiB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBXaW5kb3cgaXMgdGFsbGVyIChvciBleGFjdGx5KSB0aGUgdGFyZ2V0IGFzcGVjdCByYXRpbywgd2lkdGggaXMgdGhlIGxpbWl0aW5nIGZhY3RvclxyXG4gICAgICAgICAgICBuZXdXaWR0aCA9IHdpbmRvd1dpZHRoO1xyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSBuZXdXaWR0aCAvIHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHJlbmRlcmVyIHNpemUuIFRoZSB0aGlyZCBhcmd1bWVudCBgdXBkYXRlU3R5bGVgIGlzIGZhbHNlIGJlY2F1c2Ugd2UgbWFuYWdlIHN0eWxlIG1hbnVhbGx5LlxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZShuZXdXaWR0aCwgbmV3SGVpZ2h0LCBmYWxzZSk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG5cclxuICAgICAgICAvLyBQb3NpdGlvbiBhbmQgc2l6ZSB0aGUgY2FudmFzIGVsZW1lbnQgdXNpbmcgQ1NTXHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLmNhbnZhcy5zdHlsZSwge1xyXG4gICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgb2JqZWN0Rml0OiAnY29udGFpbicgLy8gRW5zdXJlcyBjb250ZW50IGlzIHNjYWxlZCBhcHByb3ByaWF0ZWx5IGlmIHRoZXJlJ3MgYW55IG1pc21hdGNoXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0aXRsZSBzY3JlZW4gaXMgYWN0aXZlLCB1cGRhdGUgaXRzIHNpemUgYW5kIHBvc2l0aW9uIGFzIHdlbGwgdG8gbWF0Y2ggdGhlIGNhbnZhc1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgICAgIGhlaWdodDogYCR7bmV3SGVpZ2h0fXB4YCxcclxuICAgICAgICAgICAgICAgIHRvcDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgd2hpY2gga2V5cyBhcmUgY3VycmVudGx5IHByZXNzZWQgZG93bi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQua2V5LnRvTG93ZXJDYXNlKCldID0gdHJ1ZTtcclxuICAgICAgICAvLyBBRERFRDogSGFuZGxlIGp1bXAgaW5wdXQgb25seSB3aGVuIHBsYXlpbmcgYW5kIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJyAnKSB7IC8vIFNwYWNlYmFyXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckp1bXAoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgd2hpY2gga2V5cyBhcmUgY3VycmVudGx5IHJlbGVhc2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQua2V5LnRvTG93ZXJDYXNlKCldID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIG1vdXNlIG1vdmVtZW50IGZvciBjYW1lcmEgcm90YXRpb24gKG1vdXNlIGxvb2spLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uTW91c2VNb3ZlKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgLy8gT25seSBwcm9jZXNzIG1vdXNlIG1vdmVtZW50IGlmIHRoZSBnYW1lIGlzIHBsYXlpbmcgYW5kIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WCA9IGV2ZW50Lm1vdmVtZW50WCB8fCAwO1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFkgPSBldmVudC5tb3ZlbWVudFkgfHwgMDtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGhvcml6b250YWwgcm90YXRpb24gKHlhdykgdG8gdGhlIGNhbWVyYUNvbnRhaW5lciBhcm91bmQgaXRzIGxvY2FsIFktYXhpcyAod2hpY2ggaXMgZ2xvYmFsIFkpXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnJvdGF0aW9uLnkgLT0gbW92ZW1lbnRYICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSB2ZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIHRvIHRoZSBjYW1lcmEgaXRzZWxmIGFuZCBjbGFtcCBpdFxyXG4gICAgICAgICAgICAvLyBNb3VzZSBVUCAobW92ZW1lbnRZIDwgMCkgbm93IGluY3JlYXNlcyBjYW1lcmFQaXRjaCAtPiBsb29rcyB1cC5cclxuICAgICAgICAgICAgLy8gTW91c2UgRE9XTiAobW92ZW1lbnRZID4gMCkgbm93IGRlY3JlYXNlcyBjYW1lcmFQaXRjaCAtPiBsb29rcyBkb3duLlxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVBpdGNoIC09IG1vdmVtZW50WSAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tb3VzZVNlbnNpdGl2aXR5OyBcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCA9IE1hdGgubWF4KC1NYXRoLlBJIC8gMiwgTWF0aC5taW4oTWF0aC5QSSAvIDIsIHRoaXMuY2FtZXJhUGl0Y2gpKTsgLy8gQ2xhbXAgdG8gLTkwIHRvICs5MCBkZWdyZWVzXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnJvdGF0aW9uLnggPSB0aGlzLmNhbWVyYVBpdGNoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogSGFuZGxlcyBtb3VzZSBjbGljayBmb3IgZmlyaW5nIGJ1bGxldHMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQgJiYgZXZlbnQuYnV0dG9uID09PSAwKSB7IC8vIExlZnQgbW91c2UgYnV0dG9uXHJcbiAgICAgICAgICAgIHRoaXMuZmlyZUJ1bGxldCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogRmlyZXMgYSBidWxsZXQgZnJvbSB0aGUgcGxheWVyJ3MgY2FtZXJhIHBvc2l0aW9uIGFuZCBkaXJlY3Rpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgZmlyZUJ1bGxldCgpIHtcclxuICAgICAgICBjb25zdCBidWxsZXRDb25maWcgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0O1xyXG5cclxuICAgICAgICAvLyAxLiBHZXQgYnVsbGV0IGluaXRpYWwgcG9zaXRpb24gYW5kIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVdvcmxkUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24oY2FtZXJhV29ybGRQb3NpdGlvbik7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVdvcmxkRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFXb3JsZERpcmVjdGlvbik7XHJcblxyXG4gICAgICAgIC8vIDIuIENyZWF0ZSBUaHJlZS5qcyBNZXNoIGZvciB0aGUgYnVsbGV0XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWVzaCA9IG5ldyBUSFJFRS5NZXNoKHRoaXMuYnVsbGV0R2VvbWV0cnksIHRoaXMuYnVsbGV0TWF0ZXJpYWxNZXNoKTtcclxuICAgICAgICBidWxsZXRNZXNoLnBvc2l0aW9uLmNvcHkoY2FtZXJhV29ybGRQb3NpdGlvbik7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYnVsbGV0TWVzaCk7XHJcblxyXG4gICAgICAgIC8vIDMuIENyZWF0ZSBDYW5ub24uanMgQm9keSBmb3IgdGhlIGJ1bGxldFxyXG4gICAgICAgIGNvbnN0IGJ1bGxldFNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoYnVsbGV0Q29uZmlnLmRpbWVuc2lvbnMucmFkaXVzKTtcclxuICAgICAgICBjb25zdCBidWxsZXRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogYnVsbGV0Q29uZmlnLm1hc3MsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMoY2FtZXJhV29ybGRQb3NpdGlvbi54LCBjYW1lcmFXb3JsZFBvc2l0aW9uLnksIGNhbWVyYVdvcmxkUG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBidWxsZXRTaGFwZSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIC8vIEJ1bGxldHMgc2hvdWxkIG5vdCBiZSBhZmZlY3RlZCBieSBwbGF5ZXIgbW92ZW1lbnQsIGJ1dCBzaG91bGQgaGF2ZSBncmF2aXR5XHJcbiAgICAgICAgICAgIGxpbmVhckRhbXBpbmc6IDAuMDEsIC8vIFNtYWxsIGRhbXBpbmcgdG8gcHJldmVudCBpbmZpbml0ZSBzbGlkaW5nXHJcbiAgICAgICAgICAgIGFuZ3VsYXJEYW1waW5nOiAwLjk5IC8vIEFsbG93cyBzb21lIHJvdGF0aW9uLCBidXQgc3RvcHMgcXVpY2tseVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBTZXQgYnVsbGV0IGluaXRpYWwgdmVsb2NpdHlcclxuICAgICAgICBidWxsZXRCb2R5LnZlbG9jaXR5LnNldChcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueCAqIGJ1bGxldENvbmZpZy5zcGVlZCxcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueSAqIGJ1bGxldENvbmZpZy5zcGVlZCxcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueiAqIGJ1bGxldENvbmZpZy5zcGVlZFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIFN0b3JlIGEgcmVmZXJlbmNlIHRvIHRoZSBhY3RpdmUgYnVsbGV0IG9iamVjdCBvbiB0aGUgYm9keSBmb3IgY29sbGlzaW9uIGNhbGxiYWNrXHJcbiAgICAgICAgY29uc3QgYWN0aXZlQnVsbGV0OiBBY3RpdmVCdWxsZXQgPSB7XHJcbiAgICAgICAgICAgIG1lc2g6IGJ1bGxldE1lc2gsXHJcbiAgICAgICAgICAgIGJvZHk6IGJ1bGxldEJvZHksXHJcbiAgICAgICAgICAgIGNyZWF0aW9uVGltZTogdGhpcy5sYXN0VGltZSAvIDEwMDAsIC8vIFN0b3JlIGNyZWF0aW9uIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgICAgICBmaXJlUG9zaXRpb246IGJ1bGxldEJvZHkucG9zaXRpb24uY2xvbmUoKSAvLyBTdG9yZSBpbml0aWFsIGZpcmUgcG9zaXRpb24gZm9yIHJhbmdlIGNoZWNrXHJcbiAgICAgICAgfTtcclxuICAgICAgICBhY3RpdmVCdWxsZXQuY29sbGlkZUhhbmRsZXIgPSAoZXZlbnQ6IENvbGxpZGVFdmVudCkgPT4gdGhpcy5vbkJ1bGxldENvbGxpZGUoZXZlbnQsIGFjdGl2ZUJ1bGxldCk7IC8vIFN0b3JlIHNwZWNpZmljIGhhbmRsZXJcclxuICAgICAgICBidWxsZXRCb2R5LnVzZXJEYXRhID0gYWN0aXZlQnVsbGV0OyAvLyBBdHRhY2ggdGhlIGFjdGl2ZUJ1bGxldCBvYmplY3QgdG8gdGhlIENhbm5vbi5Cb2R5XHJcblxyXG4gICAgICAgIGJ1bGxldEJvZHkuYWRkRXZlbnRMaXN0ZW5lcignY29sbGlkZScsIGFjdGl2ZUJ1bGxldC5jb2xsaWRlSGFuZGxlcik7IC8vIFVzZSB0aGUgc3RvcmVkIGhhbmRsZXJcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJ1bGxldEJvZHkpO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cy5wdXNoKGFjdGl2ZUJ1bGxldCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXkgc2hvb3Qgc291bmRcclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ3Nob290X3NvdW5kJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiU2hvb3Qgc291bmQgcGxheSBkZW5pZWQ6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogSGFuZGxlcyBidWxsZXQgY29sbGlzaW9ucy5cclxuICAgICAqIEBwYXJhbSBldmVudCBUaGUgQ2Fubm9uLmpzIGNvbGxpc2lvbiBldmVudC5cclxuICAgICAqIEBwYXJhbSBidWxsZXQgVGhlIEFjdGl2ZUJ1bGxldCBpbnN0YW5jZSB0aGF0IGNvbGxpZGVkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uQnVsbGV0Q29sbGlkZShldmVudDogQ29sbGlkZUV2ZW50LCBidWxsZXQ6IEFjdGl2ZUJ1bGxldCkge1xyXG4gICAgICAgIC8vIElmIHRoZSBidWxsZXQgaGFzIGFscmVhZHkgYmVlbiByZW1vdmVkIG9yIG1hcmtlZCBmb3IgcmVtb3ZhbCwgZG8gbm90aGluZy5cclxuICAgICAgICBpZiAoIXRoaXMuYnVsbGV0cy5pbmNsdWRlcyhidWxsZXQpIHx8IGJ1bGxldC5zaG91bGRSZW1vdmUpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY29sbGlkZWRCb2R5ID0gZXZlbnQuYm9keTsgLy8gVGhlIGJvZHkgdGhhdCB0aGUgYnVsbGV0IChldmVudC50YXJnZXQpIGNvbGxpZGVkIHdpdGhcclxuICAgICAgICBjb25zdCBvdGhlckJvZHlVc2VyRGF0YSA9IGNvbGxpZGVkQm9keS51c2VyRGF0YTsgLy8gUmV0cmlldmUgdXNlckRhdGEgZm9yIHRoZSBjb2xsaWRlZCBib2R5XHJcblxyXG4gICAgICAgIGNvbnN0IGlzR3JvdW5kID0gY29sbGlkZWRCb2R5ID09PSB0aGlzLmdyb3VuZEJvZHk7XHJcbiAgICAgICAgY29uc3QgaXNQbGFjZWRPYmplY3QgPSB0aGlzLnBsYWNlZE9iamVjdEJvZGllcy5pbmNsdWRlcyhjb2xsaWRlZEJvZHkpOyAvLyBTdGF0aWMgYm94ZXNcclxuXHJcbiAgICAgICAgLy8gTkVXOiBDaGVjayBpZiBjb2xsaWRlZCBib2R5IGlzIGFuIGVuZW15IGJ5IGNoZWNraW5nIGl0cyB1c2VyRGF0YSBhbmQgdHlwZUNvbmZpZ1xyXG4gICAgICAgIGNvbnN0IGlzRW5lbXkgPSBvdGhlckJvZHlVc2VyRGF0YSAmJiAob3RoZXJCb2R5VXNlckRhdGEgYXMgQWN0aXZlRW5lbXkpLnR5cGVDb25maWcgIT09IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKGlzR3JvdW5kIHx8IGlzUGxhY2VkT2JqZWN0KSB7XHJcbiAgICAgICAgICAgIC8vIE1hcmsgYnVsbGV0IGZvciByZW1vdmFsIGluc3RlYWQgb2YgcmVtb3ZpbmcgaW1tZWRpYXRlbHlcclxuICAgICAgICAgICAgYnVsbGV0LnNob3VsZFJlbW92ZSA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmFkZChidWxsZXQpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNFbmVteSkge1xyXG4gICAgICAgICAgICBjb25zdCBlbmVteSA9IG90aGVyQm9keVVzZXJEYXRhIGFzIEFjdGl2ZUVuZW15O1xyXG4gICAgICAgICAgICBpZiAoIWVuZW15LnNob3VsZFJlbW92ZSkgeyAvLyBEb24ndCBwcm9jZXNzIGhpdHMgb24gZW5lbWllcyBhbHJlYWR5IG1hcmtlZCBmb3IgcmVtb3ZhbFxyXG4gICAgICAgICAgICAgICAgZW5lbXkuY3VycmVudEhlYWx0aC0tO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdoaXRfc291bmQnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJIaXQgc291bmQgcGxheSBkZW5pZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBFbmVteSAke2VuZW15Lm5hbWV9IGhpdCEgSGVhbHRoOiAke2VuZW15LmN1cnJlbnRIZWFsdGh9YCk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGVuZW15LmN1cnJlbnRIZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGVuZW15LnNob3VsZFJlbW92ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbmVtaWVzVG9SZW1vdmUuYWRkKGVuZW15KTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IGVuZW15LnR5cGVDb25maWcuc2NvcmVWYWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVNjb3JlRGlzcGxheSgpOyAvLyBVcGRhdGUgc2NvcmUgVUlcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2VuZW15X2RlYXRoX3NvdW5kJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiRW5lbXkgZGVhdGggc291bmQgcGxheSBkZW5pZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRW5lbXkgJHtlbmVteS5uYW1lfSBkZWZlYXRlZCEgU2NvcmU6ICR7dGhpcy5zY29yZX1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBCdWxsZXQgYWx3YXlzIGRpc2FwcGVhcnMgb24gaGl0dGluZyBhbiBlbmVteVxyXG4gICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRzVG9SZW1vdmUuYWRkKGJ1bGxldCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBJdGVyYXRlcyB0aHJvdWdoIGJ1bGxldHMgdG8gbWFyayB0aGVtIGZvciByZW1vdmFsIGJhc2VkIG9uIGxpZmV0aW1lLCByYW5nZSwgb3Igb3V0LW9mLWJvdW5kcy5cclxuICAgICAqIEFjdHVhbCByZW1vdmFsIGlzIGRlZmVycmVkIHRvIGBwZXJmb3JtQnVsbGV0UmVtb3ZhbHNgLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZUJ1bGxldHMoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHRoaXMubGFzdFRpbWUgLyAxMDAwOyAvLyBDdXJyZW50IHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIGNvbnN0IGhhbGZHcm91bmRTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyAyO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldENvbmZpZyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQ7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5idWxsZXRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IHRoaXMuYnVsbGV0c1tpXTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIGFscmVhZHkgbWFya2VkIGZvciByZW1vdmFsIGJ5IGNvbGxpc2lvbiBvciBwcmV2aW91cyBjaGVjaywgc2tpcCBmdXJ0aGVyIHByb2Nlc3NpbmcgZm9yIHRoaXMgYnVsbGV0IHRoaXMgZnJhbWUuXHJcbiAgICAgICAgICAgIGlmIChidWxsZXQuc2hvdWxkUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgbGlmZXRpbWVcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRUaW1lIC0gYnVsbGV0LmNyZWF0aW9uVGltZSA+IGJ1bGxldENvbmZpZy5saWZldGltZSkge1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0LnNob3VsZFJlbW92ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5hZGQoYnVsbGV0KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBvdXRzaWRlIG1hcCBib3VuZGFyaWVzIG9yIGlmIGl0IHdlbnQgdG9vIGZhciBmcm9tIGl0cyBmaXJpbmcgcG9pbnRcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0UG9zID0gYnVsbGV0LmJvZHkucG9zaXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlVG9GaXJlUG9pbnQgPSBidWxsZXRQb3MuZGlzdGFuY2VUbyhidWxsZXQuZmlyZVBvc2l0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy54ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnggPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy56ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnogPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGRpc3RhbmNlVG9GaXJlUG9pbnQgPiBidWxsZXRDb25maWcubWF4UmFuZ2UgfHxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy55IDwgLTEwIC8vIElmIGl0IGZhbGxzIHZlcnkgZmFyIGJlbG93IHRoZSBncm91bmRcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmFkZChidWxsZXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBQZXJmb3JtcyB0aGUgYWN0dWFsIHJlbW92YWwgb2YgYnVsbGV0cyBtYXJrZWQgZm9yIHJlbW92YWwuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYWZ0ZXIgdGhlIHBoeXNpY3Mgc3RlcCB0byBhdm9pZCBtb2RpZnlpbmcgdGhlIHdvcmxkIGR1cmluZyBwaHlzaWNzIGNhbGN1bGF0aW9ucy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwZXJmb3JtQnVsbGV0UmVtb3ZhbHMoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBidWxsZXRUb1JlbW92ZSBvZiB0aGlzLmJ1bGxldHNUb1JlbW92ZSkge1xyXG4gICAgICAgICAgICAvLyBSZW1vdmUgZnJvbSBUaHJlZS5qcyBzY2VuZVxyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShidWxsZXRUb1JlbW92ZS5tZXNoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIENhbm5vbi5qcyB3b3JsZFxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYnVsbGV0VG9SZW1vdmUuYm9keSk7XHJcblxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgZXZlbnQgbGlzdGVuZXJcclxuICAgICAgICAgICAgaWYgKGJ1bGxldFRvUmVtb3ZlLmNvbGxpZGVIYW5kbGVyKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXRUb1JlbW92ZS5ib2R5LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NvbGxpZGUnLCBidWxsZXRUb1JlbW92ZS5jb2xsaWRlSGFuZGxlcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIHRoZSBhY3RpdmUgYnVsbGV0cyBhcnJheVxyXG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuYnVsbGV0cy5pbmRleE9mKGJ1bGxldFRvUmVtb3ZlKTtcclxuICAgICAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQ2xlYXIgdGhlIHNldCBmb3IgdGhlIG5leHQgZnJhbWVcclxuICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5jbGVhcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBVcGRhdGVzIGVuZW15IG1vdmVtZW50IGxvZ2ljIChjYWxjdWxhdGVzIHZlbG9jaXR5IGFuZCByb3RhdGlvbikuXHJcbiAgICAgKiBUaGUgYWN0dWFsIG1lc2ggc3luY2hyb25pemF0aW9uIGhhcHBlbnMgaW4gc3luY01lc2hlc1dpdGhCb2RpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlRW5lbWllcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICghdGhpcy5wbGF5ZXJCb2R5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllclBvcyA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbjtcclxuICAgICAgICBjb25zdCBoYWxmR3JvdW5kU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gMjtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBlbmVteSBvZiB0aGlzLmVuZW1pZXMpIHtcclxuICAgICAgICAgICAgaWYgKGVuZW15LnNob3VsZFJlbW92ZSkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15UG9zID0gZW5lbXkuYm9keS5wb3NpdGlvbjtcclxuXHJcbiAgICAgICAgICAgIC8vIENsYW1wIGVuZW15IHBvc2l0aW9uIHdpdGhpbiBncm91bmQgYm91bmRhcmllcyAqYmVmb3JlKiBtb3ZlbWVudCB0byBhdm9pZCBnZXR0aW5nIHN0dWNrIG91dHNpZGVcclxuICAgICAgICAgICAgLy8gVGhpcyBwcmV2ZW50cyBlbmVtaWVzIGZyb20gd2FuZGVyaW5nIG9mZiB0aGUgbWFwIG9yIGJlaW5nIHB1c2hlZCB0b28gZmFyLlxyXG4gICAgICAgICAgICBjb25zdCBoYWxmV2lkdGggPSBlbmVteS50eXBlQ29uZmlnLmRpbWVuc2lvbnMud2lkdGggLyAyO1xyXG4gICAgICAgICAgICBjb25zdCBoYWxmRGVwdGggPSBlbmVteS50eXBlQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGggLyAyO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGVuZW15UG9zLnggPiBoYWxmR3JvdW5kU2l6ZSAtIGhhbGZXaWR0aCkgeyBlbmVteS5ib2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZSAtIGhhbGZXaWR0aDsgaWYgKGVuZW15LmJvZHkudmVsb2NpdHkueCA+IDApIGVuZW15LmJvZHkudmVsb2NpdHkueCA9IDA7IH1cclxuICAgICAgICAgICAgZWxzZSBpZiAoZW5lbXlQb3MueCA8IC1oYWxmR3JvdW5kU2l6ZSArIGhhbGZXaWR0aCkgeyBlbmVteS5ib2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemUgKyBoYWxmV2lkdGg7IGlmIChlbmVteS5ib2R5LnZlbG9jaXR5LnggPCAwKSBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSAwOyB9XHJcblxyXG4gICAgICAgICAgICBpZiAoZW5lbXlQb3MueiA+IGhhbGZHcm91bmRTaXplIC0gaGFsZkRlcHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueiA9IGhhbGZHcm91bmRTaXplIC0gaGFsZkRlcHRoOyBpZiAoZW5lbXkuYm9keS52ZWxvY2l0eS56ID4gMCkgZW5lbXkuYm9keS52ZWxvY2l0eS56ID0gMDsgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChlbmVteVBvcy56IDwgLWhhbGZHcm91bmRTaXplICsgaGFsZkRlcHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueiA9IC1oYWxmR3JvdW5kU2l6ZSArIGhhbGZEZXB0aDsgaWYgKGVuZW15LmJvZHkudmVsb2NpdHkueiA8IDApIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IDA7IH1cclxuXHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBkaXJlY3Rpb24gdG93YXJkcyBwbGF5ZXIgKGZsYXR0ZW5lZCB0byBYWiBwbGFuZSlcclxuICAgICAgICAgICAgY29uc3QgZGlyZWN0aW9uID0gbmV3IENBTk5PTi5WZWMzKCk7XHJcbiAgICAgICAgICAgIHBsYXllclBvcy52c3ViKGVuZW15UG9zLCBkaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBkaXJlY3Rpb24ueSA9IDA7IC8vIE9ubHkgY29uc2lkZXIgaG9yaXpvbnRhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICBkaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgZW5lbXkgdmVsb2NpdHkgYmFzZWQgb24gZGlyZWN0aW9uIGFuZCBzcGVlZFxyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSBkaXJlY3Rpb24ueCAqIGVuZW15LnR5cGVDb25maWcuc3BlZWQ7XHJcbiAgICAgICAgICAgIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IGRpcmVjdGlvbi56ICogZW5lbXkudHlwZUNvbmZpZy5zcGVlZDtcclxuICAgICAgICAgICAgLy8gZW5lbXkuYm9keS52ZWxvY2l0eS55IGlzIG1hbmFnZWQgYnkgZ3Jhdml0eSwgc28gd2UgZG9uJ3QgbW9kaWZ5IGl0IGhlcmUuXHJcblxyXG4gICAgICAgICAgICAvLyBNYWtlIGVuZW15IGxvb2sgYXQgdGhlIHBsYXllciAoeWF3IG9ubHkpXHJcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFJvdGF0aW9uWSA9IE1hdGguYXRhbjIoZGlyZWN0aW9uLngsIGRpcmVjdGlvbi56KTsgLy8gQW5nbGUgaW4gcmFkaWFuc1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50UXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKGVuZW15LmJvZHkucXVhdGVybmlvbi54LCBlbmVteS5ib2R5LnF1YXRlcm5pb24ueSwgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLnosIGVuZW15LmJvZHkucXVhdGVybmlvbi53KTtcclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbUF4aXNBbmdsZShcclxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApLFxyXG4gICAgICAgICAgICAgICAgdGFyZ2V0Um90YXRpb25ZXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIC8vIFNtb290aCByb3RhdGlvbiBmb3IgcGh5c2ljcyBib2R5XHJcbiAgICAgICAgICAgIGNvbnN0IHNsZXJwZWRRdWF0ZXJuaW9uID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKTtcclxuICAgICAgICAgICAgc2xlcnBlZFF1YXRlcm5pb24uc2xlcnBRdWF0ZXJuaW9ucyhjdXJyZW50UXVhdGVybmlvbiwgdGFyZ2V0UXVhdGVybmlvbiwgMC4xKTsgLy8gU21vb3RoIGZhY3RvciAwLjFcclxuICAgICAgICAgICAgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLmNvcHkoc2xlcnBlZFF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBDQU5OT04uUXVhdGVybmlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBQZXJmb3JtcyB0aGUgYWN0dWFsIHJlbW92YWwgb2YgZW5lbWllcyBtYXJrZWQgZm9yIHJlbW92YWwuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYWZ0ZXIgdGhlIHBoeXNpY3Mgc3RlcC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwZXJmb3JtRW5lbXlSZW1vdmFscygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGVuZW15VG9SZW1vdmUgb2YgdGhpcy5lbmVtaWVzVG9SZW1vdmUpIHtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoZW5lbXlUb1JlbW92ZS5tZXNoKTtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGVuZW15VG9SZW1vdmUuYm9keSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuZW5lbWllcy5pbmRleE9mKGVuZW15VG9SZW1vdmUpO1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmVuZW1pZXNUb1JlbW92ZS5jbGVhcigpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBvaW50ZXIgbG9jayBzdGF0dXMgd2hlbiBpdCBjaGFuZ2VzIChlLmcuLCB1c2VyIHByZXNzZXMgRXNjKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrQ2hhbmdlKCkge1xyXG4gICAgICAgIGlmIChkb2N1bWVudC5wb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLm1velBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkud2Via2l0UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyIGxvY2tlZCcpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gZmFsc2U7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyIHVubG9ja2VkJyk7XHJcbiAgICAgICAgICAgIC8vIFdoZW4gcG9pbnRlciBpcyB1bmxvY2tlZCBieSB1c2VyIChlLmcuLCBwcmVzc2luZyBFc2MpLCBjdXJzb3IgYXBwZWFycyBhdXRvbWF0aWNhbGx5LlxyXG4gICAgICAgICAgICAvLyBNb3VzZSBsb29rIHN0b3BzIGR1ZSB0byBgaXNQb2ludGVyTG9ja2VkYCBjaGVjayBpbiBvbk1vdXNlTW92ZS5cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUaGUgbWFpbiBnYW1lIGxvb3AsIGNhbGxlZCBvbiBldmVyeSBhbmltYXRpb24gZnJhbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYW5pbWF0ZSh0aW1lOiBET01IaWdoUmVzVGltZVN0YW1wKSB7XHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpKTsgLy8gUmVxdWVzdCBuZXh0IGZyYW1lXHJcblxyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9ICh0aW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwOyAvLyBDYWxjdWxhdGUgZGVsdGEgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHRpbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXllck1vdmVtZW50KCk7IC8vIFVwZGF0ZSBwbGF5ZXIncyB2ZWxvY2l0eSBiYXNlZCBvbiBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUJ1bGxldHMoZGVsdGFUaW1lKTsgLy8gTkVXOiBNYXJrIGJ1bGxldHMgZm9yIHJlbW92YWxcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVFbmVtaWVzKGRlbHRhVGltZSk7IC8vIE5FVzogVXBkYXRlIGVuZW15IG1vdmVtZW50XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGh5c2ljcyhkZWx0YVRpbWUpOyAvLyBTdGVwIHRoZSBwaHlzaWNzIHdvcmxkXHJcbiAgICAgICAgICAgIHRoaXMucGVyZm9ybUJ1bGxldFJlbW92YWxzKCk7IC8vIE5FVzogUGVyZm9ybSBhY3R1YWwgYnVsbGV0IHJlbW92YWxzICphZnRlciogcGh5c2ljcyBzdGVwXHJcbiAgICAgICAgICAgIHRoaXMucGVyZm9ybUVuZW15UmVtb3ZhbHMoKTsgLy8gTkVXOiBQZXJmb3JtIGFjdHVhbCBlbmVteSByZW1vdmFscyAqYWZ0ZXIqIHBoeXNpY3Mgc3RlcFxyXG4gICAgICAgICAgICB0aGlzLmNsYW1wUGxheWVyUG9zaXRpb24oKTsgLy8gQ2xhbXAgcGxheWVyIHBvc2l0aW9uIHRvIHByZXZlbnQgZ29pbmcgYmV5b25kIGdyb3VuZCBlZGdlc1xyXG4gICAgICAgICAgICB0aGlzLnN5bmNNZXNoZXNXaXRoQm9kaWVzKCk7IC8vIFN5bmNocm9uaXplIHZpc3VhbCBtZXNoZXMgd2l0aCBwaHlzaWNzIGJvZGllc1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIodGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEpOyAvLyBSZW5kZXIgdGhlIHNjZW5lXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdGVwcyB0aGUgQ2Fubm9uLmpzIHBoeXNpY3Mgd29ybGQgZm9yd2FyZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQaHlzaWNzKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgLy8gd29ybGQuc3RlcChmaXhlZFRpbWVTdGVwLCBkZWx0YVRpbWUsIG1heFN1YlN0ZXBzKVxyXG4gICAgICAgIC8vIDEvNjA6IEEgZml4ZWQgdGltZSBzdGVwIG9mIDYwIHBoeXNpY3MgdXBkYXRlcyBwZXIgc2Vjb25kIChzdGFuZGFyZCkuXHJcbiAgICAgICAgLy8gZGVsdGFUaW1lOiBUaGUgYWN0dWFsIHRpbWUgZWxhcHNlZCBzaW5jZSB0aGUgbGFzdCByZW5kZXIgZnJhbWUuXHJcbiAgICAgICAgLy8gbWF4UGh5c2ljc1N1YlN0ZXBzOiBMaW1pdHMgdGhlIG51bWJlciBvZiBwaHlzaWNzIHN0ZXBzIGluIG9uZSByZW5kZXIgZnJhbWVcclxuICAgICAgICAvLyB0byBwcmV2ZW50IGluc3RhYmlsaXRpZXMgaWYgcmVuZGVyaW5nIHNsb3dzIGRvd24gc2lnbmlmaWNhbnRseS5cclxuICAgICAgICB0aGlzLndvcmxkLnN0ZXAoMSAvIDYwLCBkZWx0YVRpbWUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tYXhQaHlzaWNzU3ViU3RlcHMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gV0FTRCBpbnB1dCBhbmQgY2FtZXJhIG9yaWVudGF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBsYXllck1vdmVtZW50KCkge1xyXG4gICAgICAgIC8vIFBsYXllciBtb3ZlbWVudCBzaG91bGQgb25seSBoYXBwZW4gd2hlbiB0aGUgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAoIXRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIC8vIElmIHBvaW50ZXIgaXMgbm90IGxvY2tlZCwgc3RvcCBob3Jpem9udGFsIG1vdmVtZW50IGltbWVkaWF0ZWx5XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIEV4aXQgZWFybHkgYXMgbm8gbW92ZW1lbnQgaW5wdXQgc2hvdWxkIGJlIHByb2Nlc3NlZFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVmZmVjdGl2ZVBsYXllclNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkO1xyXG5cclxuICAgICAgICAvLyBNT0RJRklFRDogQXBwbHkgYWlyIGNvbnRyb2wgZmFjdG9yIGlmIHBsYXllciBpcyBpbiB0aGUgYWlyIChubyBjb250YWN0cyB3aXRoIGFueSBzdGF0aWMgc3VyZmFjZSlcclxuICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9PT0gMCkge1xyXG4gICAgICAgICAgICBlZmZlY3RpdmVQbGF5ZXJTcGVlZCAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyQ29udHJvbEZhY3RvcjsgLy8gVXNlIGNvbmZpZ3VyYWJsZSBhaXIgY29udHJvbCBmYWN0b3JcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudFlWZWxvY2l0eSA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55OyAvLyBQcmVzZXJ2ZSB2ZXJ0aWNhbCB2ZWxvY2l0eVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1vdmVEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAwKTsgLy8gVXNlIGEgVEhSRUUuVmVjdG9yMyBmb3IgY2FsY3VsYXRpb24gZWFzZVxyXG5cclxuICAgICAgICAvLyBHZXQgY2FtZXJhQ29udGFpbmVyJ3MgZm9yd2FyZCB2ZWN0b3IgKGhvcml6b250YWwgZGlyZWN0aW9uIHBsYXllciBpcyBsb29raW5nKVxyXG4gICAgICAgIGNvbnN0IGNhbWVyYURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIuZ2V0V29ybGREaXJlY3Rpb24oY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ueSA9IDA7IC8vIEZsYXR0ZW4gdGhlIHZlY3RvciB0byByZXN0cmljdCBtb3ZlbWVudCB0byB0aGUgaG9yaXpvbnRhbCBwbGFuZVxyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgY29uc3QgZ2xvYmFsVXAgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKTsgLy8gRGVmaW5lIGdsb2JhbCB1cCB2ZWN0b3IgZm9yIGNyb3NzIHByb2R1Y3RcclxuXHJcbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSAncmlnaHQnIHZlY3RvciByZWxhdGl2ZSB0byBjYW1lcmEncyBmb3J3YXJkIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICBjYW1lcmFSaWdodC5jcm9zc1ZlY3RvcnMoZ2xvYmFsVXAsIGNhbWVyYURpcmVjdGlvbikubm9ybWFsaXplKCk7IFxyXG5cclxuICAgICAgICBsZXQgbW92aW5nID0gZmFsc2U7XHJcbiAgICAgICAgLy8gVyA8LT4gUyBzd2FwIGZyb20gdXNlcidzIGNvbW1lbnRzIGluIG9yaWdpbmFsIGNvZGU6XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sncyddKSB7IC8vICdzJyBrZXkgbm93IG1vdmVzIGZvcndhcmRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5hZGQoY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sndyddKSB7IC8vICd3JyBrZXkgbm93IG1vdmVzIGJhY2t3YXJkXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uc3ViKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEEgYW5kIEQgY29udHJvbHMgYXMgc3RhbmRhcmQ6XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snYSddKSB7IC8vICdhJyBrZXkgbm93IHN0cmFmZXMgbGVmdFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFSaWdodCk7IFxyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydkJ10pIHsgLy8gJ2QnIGtleSBub3cgc3RyYWZlcyByaWdodFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLmFkZChjYW1lcmFSaWdodCk7IFxyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKG1vdmluZykge1xyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLm5vcm1hbGl6ZSgpLm11bHRpcGx5U2NhbGFyKGVmZmVjdGl2ZVBsYXllclNwZWVkKTtcclxuICAgICAgICAgICAgLy8gRGlyZWN0bHkgc2V0IHRoZSBob3Jpem9udGFsIHZlbG9jaXR5IGNvbXBvbmVudHMuXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gbW92ZURpcmVjdGlvbi54O1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IG1vdmVEaXJlY3Rpb24uejtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBJZiBubyBtb3ZlbWVudCBrZXlzIGFyZSBwcmVzc2VkOlxyXG4gICAgICAgICAgICAvLyBNT0RJRklFRDogQXBwbHkgYWlyIGRlY2VsZXJhdGlvbiBpZiBwbGF5ZXIgaXMgaW4gdGhlIGFpclxyXG4gICAgICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckFpckRlY2VsZXJhdGlvbjtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBQbGF5ZXIgaXMgb24gdGhlIGdyb3VuZCBvciBhIHN0YXRpYyBvYmplY3Q6IENhbm5vbi5qcyBDb250YWN0TWF0ZXJpYWwgZnJpY3Rpb24gd2lsbCBoYW5kbGUgZGVjZWxlcmF0aW9uLlxyXG4gICAgICAgICAgICAgICAgLy8gTm8gZXhwbGljaXQgdmVsb2NpdHkgZGVjYXkgaXMgYXBwbGllZCBoZXJlIGZvciBncm91bmQgbW92ZW1lbnQuXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSBjdXJyZW50WVZlbG9jaXR5OyAvLyBSZXN0b3JlIFkgdmVsb2NpdHkgKGdyYXZpdHkvanVtcHMpXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBRERFRDogQXBwbGllcyBhbiB1cHdhcmQgaW1wdWxzZSB0byB0aGUgcGxheWVyIGJvZHkgZm9yIGp1bXBpbmcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcGxheWVySnVtcCgpIHtcclxuICAgICAgICAvLyBNT0RJRklFRDogT25seSBhbGxvdyBqdW1wIGlmIHRoZSBwbGF5ZXIgaXMgY3VycmVudGx5IG9uIGFueSBzdGF0aWMgc3VyZmFjZSAoZ3JvdW5kIG9yIG9iamVjdClcclxuICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA+IDApIHtcclxuICAgICAgICAgICAgLy8gQ2xlYXIgYW55IGV4aXN0aW5nIHZlcnRpY2FsIHZlbG9jaXR5IHRvIGVuc3VyZSBhIGNvbnNpc3RlbnQganVtcCBoZWlnaHRcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSAwOyBcclxuICAgICAgICAgICAgLy8gQXBwbHkgYW4gdXB3YXJkIGltcHVsc2UgKG1hc3MgKiBjaGFuZ2VfaW5fdmVsb2NpdHkpXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5hcHBseUltcHVsc2UoXHJcbiAgICAgICAgICAgICAgICBuZXcgQ0FOTk9OLlZlYzMoMCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmp1bXBGb3JjZSwgMCksXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24gLy8gQXBwbHkgaW1wdWxzZSBhdCB0aGUgY2VudGVyIG9mIG1hc3NcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGFtcHMgdGhlIHBsYXllcidzIHBvc2l0aW9uIHdpdGhpbiB0aGUgZGVmaW5lZCBncm91bmQgYm91bmRhcmllcy5cclxuICAgICAqIFByZXZlbnRzIHRoZSBwbGF5ZXIgZnJvbSBtb3ZpbmcgYmV5b25kIHRoZSAnZW5kIG9mIHRoZSB3b3JsZCcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY2xhbXBQbGF5ZXJQb3NpdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyQm9keSB8fCAhdGhpcy5jb25maWcpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcbiAgICAgICAgY29uc3QgcGxheWVySGFsZldpZHRoID0gMC41OyAvLyBGcm9tIEJveEdlb21ldHJ5KDEsMiwxKSBoYWxmIGV4dGVudHMgZm9yIENhbm5vbi5qc1xyXG5cclxuICAgICAgICBsZXQgcG9zWCA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54O1xyXG4gICAgICAgIGxldCBwb3NaID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLno7XHJcbiAgICAgICAgbGV0IHZlbFggPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueDtcclxuICAgICAgICBsZXQgdmVsWiA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56O1xyXG5cclxuICAgICAgICAvLyBDbGFtcCBYIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKHBvc1ggPiBoYWxmR3JvdW5kU2l6ZSAtIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueCA9IGhhbGZHcm91bmRTaXplIC0gcGxheWVySGFsZldpZHRoO1xyXG4gICAgICAgICAgICBpZiAodmVsWCA+IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAocG9zWCA8IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueCA9IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aDtcclxuICAgICAgICAgICAgaWYgKHZlbFggPCAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIFogcG9zaXRpb25cclxuICAgICAgICBpZiAocG9zWiA+IGhhbGZHcm91bmRTaXplIC0gcGxheWVySGFsZldpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gaGFsZkdyb3VuZFNpemUgLSBwbGF5ZXJIYWxmV2lkdGg7XHJcbiAgICAgICAgICAgIGlmICh2ZWxaID4gMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwb3NaIDwgLWhhbGZHcm91bmRTaXplICsgcGxheWVySGFsZldpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gLWhhbGZHcm91bmRTaXplICsgcGxheWVySGFsZldpZHRoO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA8IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN5bmNocm9uaXplcyB0aGUgdmlzdWFsIG1lc2hlcyB3aXRoIHRoZWlyIGNvcnJlc3BvbmRpbmcgcGh5c2ljcyBib2RpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3luY01lc2hlc1dpdGhCb2RpZXMoKSB7XHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggcG9zaXRpb24gd2l0aCBpdHMgcGh5c2ljcyBib2R5J3MgcG9zaXRpb25cclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBjYW1lcmFDb250YWluZXIgcG9zaXRpb24gd2l0aCB0aGUgcGxheWVyJ3MgcGh5c2ljcyBib2R5J3MgcG9zaXRpb24uXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuXHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggaG9yaXpvbnRhbCByb3RhdGlvbiAoeWF3KSB3aXRoIGNhbWVyYUNvbnRhaW5lcidzIHlhdy5cclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMuY2FtZXJhQ29udGFpbmVyLnF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAvLyBUaGUgZ3JvdW5kIGFuZCBwbGFjZWQgb2JqZWN0cyBhcmUgY3VycmVudGx5IHN0YXRpYyAobWFzcyAwKSwgc28gdGhlaXIgdmlzdWFsIG1lc2hlc1xyXG4gICAgICAgIC8vIGRvIG5vdCBuZWVkIHRvIGJlIHN5bmNocm9uaXplZCB3aXRoIHRoZWlyIHBoeXNpY3MgYm9kaWVzIGFmdGVyIGluaXRpYWwgcGxhY2VtZW50LlxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIGJ1bGxldCBtZXNoZXMgd2l0aCB0aGVpciBwaHlzaWNzIGJvZGllc1xyXG4gICAgICAgIGZvciAoY29uc3QgYnVsbGV0IG9mIHRoaXMuYnVsbGV0cykge1xyXG4gICAgICAgICAgICBpZiAoIWJ1bGxldC5zaG91bGRSZW1vdmUpIHtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5tZXNoLnBvc2l0aW9uLmNvcHkoYnVsbGV0LmJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5tZXNoLnF1YXRlcm5pb24uY29weShidWxsZXQuYm9keS5xdWF0ZXJuaW9uIGFzIHVua25vd24gYXMgVEhSRUUuUXVhdGVybmlvbik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE5FVzogU3luY2hyb25pemUgZW5lbXkgbWVzaGVzIHdpdGggdGhlaXIgcGh5c2ljcyBib2RpZXNcclxuICAgICAgICBmb3IgKGNvbnN0IGVuZW15IG9mIHRoaXMuZW5lbWllcykge1xyXG4gICAgICAgICAgICBpZiAoIWVuZW15LnNob3VsZFJlbW92ZSkge1xyXG4gICAgICAgICAgICAgICAgZW5lbXkubWVzaC5wb3NpdGlvbi5jb3B5KGVuZW15LmJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICAgICAgICAgIGVuZW15Lm1lc2gucXVhdGVybmlvbi5jb3B5KGVuZW15LmJvZHkucXVhdGVybmlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlF1YXRlcm5pb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSBET00gY29udGVudCBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxuICAgIG5ldyBHYW1lKCk7XHJcbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUFBLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFvQnhCLElBQUssWUFBTCxrQkFBS0EsZUFBTDtBQUNJLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFGQyxTQUFBQTtBQUFBLEdBQUE7QUFxR0wsTUFBTSxLQUFLO0FBQUEsRUFrRVAsY0FBYztBQWhFZDtBQUFBLFNBQVEsUUFBbUI7QUEyQjNCO0FBQUEsU0FBUSxxQkFBbUMsQ0FBQztBQUM1QyxTQUFRLHFCQUFvQyxDQUFDO0FBRzdDO0FBQUEsU0FBUSxVQUEwQixDQUFDO0FBQ25DLFNBQVEsa0JBQXFDLG9CQUFJ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
