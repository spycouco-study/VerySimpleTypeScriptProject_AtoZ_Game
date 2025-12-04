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
    // NEW: Crosshair UI element
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
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
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
   * NEW: Creates and displays the game score UI and crosshair.
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
    this.crosshairElement = document.createElement("div");
    Object.assign(this.crosshairElement.style, {
      position: "absolute",
      width: "2px",
      // Central dot size
      height: "2px",
      backgroundColor: "white",
      // Central white dot
      // Use box-shadows for outlines and potential cross-like appearance
      boxShadow: "0 0 0 1px white, 0 0 0 3px rgba(0,0,0,0.8), 0 0 0 4px white",
      borderRadius: "50%",
      // Make it circular
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "1002",
      // Above title screen and score
      display: "none"
      // Initially hidden
    });
    document.body.appendChild(this.crosshairElement);
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
    if (this.crosshairElement) {
      this.crosshairElement.style.display = "block";
    }
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
      if (this.crosshairElement && this.state === 1 /* PLAYING */) {
        this.crosshairElement.style.display = "block";
      }
    } else {
      this.isPointerLocked = false;
      console.log("Pointer unlocked");
      if (this.crosshairElement) {
        this.crosshairElement.style.display = "none";
      }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEFkZCBtb2R1bGUgYXVnbWVudGF0aW9uIGZvciBDQU5OT04uQm9keSB0byBpbmNsdWRlIHVzZXJEYXRhIGZvciBib3RoIGJ1bGxldHMgYW5kIGVuZW1pZXNcclxuZGVjbGFyZSBtb2R1bGUgJ2Nhbm5vbi1lcycge1xyXG4gICAgaW50ZXJmYWNlIEJvZHkge1xyXG4gICAgICAgIHVzZXJEYXRhPzogQWN0aXZlQnVsbGV0IHwgQWN0aXZlRW5lbXk7IC8vIEF0dGFjaCB0aGUgQWN0aXZlQnVsbGV0IG9yIEFjdGl2ZUVuZW15IGluc3RhbmNlXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIERlZmluZSBpbnRlcmZhY2UgZm9yIHRoZSBDYW5ub24tZXMgJ2NvbGxpZGUnIGV2ZW50XHJcbmludGVyZmFjZSBDb2xsaWRlRXZlbnQge1xyXG4gICAgLy8gVGhlIHR5cGUgcHJvcGVydHkgaXMgdXN1YWxseSBwcmVzZW50IG9uIGFsbCBDYW5ub24uanMgZXZlbnRzXHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICAvLyBUaGUgJ2NvbGxpZGUnIGV2ZW50IHNwZWNpZmljYWxseSBoYXMgdGhlc2UgcHJvcGVydGllczpcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5OyAvLyBUaGUgb3RoZXIgYm9keSBpbnZvbHZlZCBpbiB0aGUgY29sbGlzaW9uXHJcbiAgICB0YXJnZXQ6IENBTk5PTi5Cb2R5OyAvLyBUaGUgYm9keSB0aGF0IHRoZSBldmVudCBsaXN0ZW5lciBpcyBhdHRhY2hlZCB0byAoZS5nLiwgdGhlIGJ1bGxldEJvZHkpXHJcbiAgICBjb250YWN0OiBDQU5OT04uQ29udGFjdEVxdWF0aW9uOyAvLyBUaGUgY29udGFjdCBlcXVhdGlvbiBvYmplY3RcclxufVxyXG5cclxuLy8gRW51bSB0byBkZWZpbmUgdGhlIHBvc3NpYmxlIHN0YXRlcyBvZiB0aGUgZ2FtZVxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSwgICAvLyBUaXRsZSBzY3JlZW4sIHdhaXRpbmcgZm9yIHVzZXIgaW5wdXRcclxuICAgIFBMQVlJTkcgIC8vIEdhbWUgaXMgYWN0aXZlLCB1c2VyIGNhbiBtb3ZlIGFuZCBsb29rIGFyb3VuZFxyXG59XHJcblxyXG4vLyBJbnRlcmZhY2UgZm9yIHN0YXRpYyBvYmplY3RzIChib3hlcykgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkT2JqZWN0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZzsgLy8gQSBkZXNjcmlwdGl2ZSBuYW1lIGZvciB0aGUgb2JqZWN0IGluc3RhbmNlXHJcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBOYW1lIG9mIHRoZSB0ZXh0dXJlIGZyb20gYXNzZXRzLmltYWdlc1xyXG4gICAgdHlwZTogJ2JveCc7IC8vIEV4cGxpY2l0bHkgJ2JveCdcclxuICAgIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcclxuICAgIGRpbWVuc2lvbnM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGRlcHRoOiBudW1iZXIgfTtcclxuICAgIHJvdGF0aW9uWT86IG51bWJlcjsgLy8gT3B0aW9uYWwgcm90YXRpb24gYXJvdW5kIFktYXhpcyAocmFkaWFucylcclxuICAgIG1hc3M6IG51bWJlcjsgLy8gMCBmb3Igc3RhdGljXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBlbmVteSB0eXBlIGRlZmluaXRpb25zIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBFbmVteVR5cGVDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nOyAvLyBlLmcuLCBcImJhc2ljX2VuZW15XCJcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBkZXB0aDogbnVtYmVyIH07XHJcbiAgICBtYXNzOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBzcGVjaWZpYyBlbmVteSBpbnN0YW5jZXMgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkRW5lbXlJbnN0YW5jZUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7IC8vIFVuaXF1ZSBpbnN0YW5jZSBuYW1lLCBlLmcuLCBcImVuZW15MVwiXHJcbiAgICBlbmVteVR5cGVOYW1lOiBzdHJpbmc7IC8vIFJlZmVyZW5jZSB0byBFbmVteVR5cGVDb25maWcubmFtZVxyXG4gICAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgcm90YXRpb25ZPzogbnVtYmVyOyAvLyBPcHRpb25hbCBpbml0aWFsIHJvdGF0aW9uXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBidWxsZXQgY29uZmlndXJhdGlvblxyXG5pbnRlcmZhY2UgQnVsbGV0Q29uZmlnIHtcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHJhZGl1czogbnVtYmVyOyB9OyAvLyBGb3IgYSBzcGhlcmUgYnVsbGV0XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgbWFzczogbnVtYmVyO1xyXG4gICAgbGlmZXRpbWU6IG51bWJlcjsgLy8gTWF4IHRpbWUgaW4gc2Vjb25kcyBiZWZvcmUgaXQgZGVzcGF3bnNcclxuICAgIG1heFJhbmdlOiBudW1iZXI7IC8vIE1heCBkaXN0YW5jZSBmcm9tIGZpcmUgcG9pbnQgYmVmb3JlIGl0IGRlc3Bhd25zXHJcbiAgICB2b2x1bWU6IG51bWJlcjsgLy8gU291bmQgdm9sdW1lXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyOyAgICAgICAgICAvLyBBRERFRDogRm9yY2UgYXBwbGllZCB3aGVuIGp1bXBpbmdcclxuICAgICAgICBzY29yZTogbnVtYmVyOyAgICAgICAgICAgICAgLy8gTkVXOiBJbml0aWFsIHNjb3JlXHJcbiAgICAgICAgZW5lbXlUeXBlczogRW5lbXlUeXBlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2YgZGlmZmVyZW50IGVuZW15IHRlbXBsYXRlc1xyXG4gICAgICAgIHN0YXRpY09iamVjdHM6IFBsYWNlZE9iamVjdENvbmZpZ1tdOyAvLyBORVc6IFJlbmFtZWQgZnJvbSBwbGFjZWRPYmplY3RzLCBvbmx5IHN0YXRpYyBib3hlc1xyXG4gICAgICAgIGVuZW15SW5zdGFuY2VzOiBQbGFjZWRFbmVteUluc3RhbmNlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2Ygc3BlY2lmaWMgZW5lbXkgcGxhY2VtZW50c1xyXG4gICAgICAgIC8vIE5FVzogQ29uZmlndXJhYmxlIHBoeXNpY3MgcHJvcGVydGllc1xyXG4gICAgICAgIHBsYXllckdyb3VuZEZyaWN0aW9uOiBudW1iZXI7ICAgICAgICAvLyBGcmljdGlvbiBjb2VmZmljaWVudCBmb3IgcGxheWVyLWdyb3VuZCBjb250YWN0XHJcbiAgICAgICAgcGxheWVyQWlyQ29udHJvbEZhY3RvcjogbnVtYmVyOyAgICAvLyBNdWx0aXBsaWVyIGZvciBwbGF5ZXJTcGVlZCB3aGVuIGFpcmJvcm5lXHJcbiAgICAgICAgcGxheWVyQWlyRGVjZWxlcmF0aW9uOiBudW1iZXI7ICAgICAvLyBEZWNheSBmYWN0b3IgZm9yIGhvcml6b250YWwgdmVsb2NpdHkgd2hlbiBhaXJib3JuZSBhbmQgbm90IG1vdmluZ1xyXG4gICAgICAgIGJ1bGxldDogQnVsbGV0Q29uZmlnOyAvLyBORVc6IEJ1bGxldCBjb25maWd1cmF0aW9uXHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBhbiBhY3RpdmUgYnVsbGV0IGluc3RhbmNlXHJcbmludGVyZmFjZSBBY3RpdmVCdWxsZXQge1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgY3JlYXRpb25UaW1lOiBudW1iZXI7IC8vIFVzZWQgZm9yIGxpZmV0aW1lIGNoZWNrXHJcbiAgICBmaXJlUG9zaXRpb246IENBTk5PTi5WZWMzOyAvLyBVc2VkIGZvciBtYXhSYW5nZSBjaGVja1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gTkVXOiBGbGFnIHRvIG1hcmsgZm9yIHJlbW92YWxcclxuICAgIGNvbGxpZGVIYW5kbGVyPzogKGV2ZW50OiBDb2xsaWRlRXZlbnQpID0+IHZvaWQ7IC8vIE5FVzogU3RvcmUgdGhlIHNwZWNpZmljIGhhbmRsZXIgZnVuY3Rpb25cclxufVxyXG5cclxuLy8gTkVXOiBJbnRlcmZhY2UgZm9yIGFuIGFjdGl2ZSBlbmVteSBpbnN0YW5jZSAocnVudGltZSBkYXRhKVxyXG5pbnRlcmZhY2UgQWN0aXZlRW5lbXkge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgdHlwZUNvbmZpZzogRW5lbXlUeXBlQ29uZmlnOyAvLyBSZWZlcmVuY2UgdG8gaXRzIHR5cGUgZGVmaW5pdGlvblxyXG4gICAgY3VycmVudEhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gRmxhZyB0byBtYXJrIGZvciByZW1vdmFsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgcHJpdmF0ZSBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmEhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXIhOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDsgLy8gVGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZm9yIHJlbmRlcmluZ1xyXG5cclxuICAgIC8vIE5ldzogQSBjb250YWluZXIgb2JqZWN0IGZvciB0aGUgY2FtZXJhIHRvIGhhbmRsZSBob3Jpem9udGFsIHJvdGF0aW9uIHNlcGFyYXRlbHkgZnJvbSB2ZXJ0aWNhbCBwaXRjaC5cclxuICAgIHByaXZhdGUgY2FtZXJhQ29udGFpbmVyITogVEhSRUUuT2JqZWN0M0Q7IFxyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSB3b3JsZCE6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBORVc6IENhbm5vbi1lcyBtYXRlcmlhbHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgcGxheWVyTWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBkZWZhdWx0T2JqZWN0TWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7IC8vIEFEREVEOiBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDsgLy8gTkVXOiBNYXRlcmlhbCBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBlbmVteU1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsOyAvLyBORVc6IE1hdGVyaWFsIGZvciBlbmVtaWVzXHJcblxyXG4gICAgLy8gVmlzdWFsIG1lc2hlcyAoVGhyZWUuanMpIGZvciBnYW1lIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgLy8gTkVXOiBBcnJheXMgdG8gaG9sZCByZWZlcmVuY2VzIHRvIGR5bmFtaWNhbGx5IHBsYWNlZCBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdE1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdEJvZGllczogQ0FOTk9OLkJvZHlbXSA9IFtdO1xyXG5cclxuICAgIC8vIE5FVzogQWN0aXZlIGJ1bGxldHNcclxuICAgIHByaXZhdGUgYnVsbGV0czogQWN0aXZlQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgYnVsbGV0c1RvUmVtb3ZlOiBTZXQ8QWN0aXZlQnVsbGV0PiA9IG5ldyBTZXQoKTsgLy8gTkVXOiBMaXN0IG9mIGJ1bGxldHMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG4gICAgcHJpdmF0ZSBidWxsZXRHZW9tZXRyeSE6IFRIUkVFLlNwaGVyZUdlb21ldHJ5OyAvLyBSZXVzYWJsZSBnZW9tZXRyeSBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbE1lc2ghOiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbDsgLy8gUmV1c2FibGUgbWF0ZXJpYWwgZm9yIGJ1bGxldHMgKHVzaW5nIEJhc2ljIHRvIHByZXZlbnQgbGlnaHRpbmcgaXNzdWVzIGZvciBzaW1wbGUgYnVsbGV0cylcclxuXHJcbiAgICAvLyBORVc6IEFjdGl2ZSBlbmVtaWVzXHJcbiAgICBwcml2YXRlIGVuZW1pZXM6IEFjdGl2ZUVuZW15W10gPSBbXTtcclxuICAgIHByaXZhdGUgZW5lbWllc1RvUmVtb3ZlOiBTZXQ8QWN0aXZlRW5lbXk+ID0gbmV3IFNldCgpOyAvLyBMaXN0IG9mIGVuZW1pZXMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG5cclxuICAgIC8vIElucHV0IGhhbmRsaW5nIHN0YXRlXHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307IC8vIFRyYWNrcyBjdXJyZW50bHkgcHJlc3NlZCBrZXlzXHJcbiAgICBwcml2YXRlIGlzUG9pbnRlckxvY2tlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUcnVlIGlmIG1vdXNlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICBwcml2YXRlIGNhbWVyYVBpdGNoOiBudW1iZXIgPSAwOyAvLyBWZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIG9mIHRoZSBjYW1lcmFcclxuXHJcbiAgICAvLyBBc3NldCBtYW5hZ2VtZW50XHJcbiAgICBwcml2YXRlIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCB0ZXh0dXJlc1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIGF1ZGlvIGVsZW1lbnRzXHJcblxyXG4gICAgLy8gVUkgZWxlbWVudHMgKGR5bmFtaWNhbGx5IGNyZWF0ZWQgZm9yIHRoZSB0aXRsZSBzY3JlZW4gYW5kIGdhbWUgb3ZlcmxheSlcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHNjb3JlVGV4dCE6IEhUTUxEaXZFbGVtZW50OyAvLyBORVc6IFVJIGVsZW1lbnQgZm9yIHNjb3JlXHJcbiAgICBwcml2YXRlIGNyb3NzaGFpckVsZW1lbnQhOiBIVE1MRGl2RWxlbWVudDsgLy8gTkVXOiBDcm9zc2hhaXIgVUkgZWxlbWVudFxyXG5cclxuICAgIC8vIEZvciBjYWxjdWxhdGluZyBkZWx0YSB0aW1lIGJldHdlZW4gZnJhbWVzXHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuXHJcbiAgICAvLyBNT0RJRklFRDogVHJhY2tzIHBsYXllciBjb250YWN0cyB3aXRoIEFOWSBzdGF0aWMgc3VyZmFjZSAoZ3JvdW5kIG9yIHBsYWNlZCBvYmplY3RzKSBmb3IganVtcGluZy9tb3ZlbWVudCBsb2dpY1xyXG4gICAgcHJpdmF0ZSBudW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlczogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvLyBORVc6IEdhbWUgc2NvcmVcclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgLy8gR2V0IHRoZSBjYW52YXMgZWxlbWVudCBmcm9tIGluZGV4Lmh0bWxcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdDYW52YXMgZWxlbWVudCB3aXRoIElEIFwiZ2FtZUNhbnZhc1wiIG5vdCBmb3VuZCEnKTtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBDYW5ub3QgcHJvY2VlZCB3aXRob3V0IGEgY2FudmFzXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaW5pdCgpOyAvLyBTdGFydCB0aGUgYXN5bmNocm9ub3VzIGluaXRpYWxpemF0aW9uIHByb2Nlc3NcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFzeW5jaHJvbm91c2x5IGluaXRpYWxpemVzIHRoZSBnYW1lLCBsb2FkaW5nIGNvbmZpZywgYXNzZXRzLCBhbmQgc2V0dGluZyB1cCBzeXN0ZW1zLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgLy8gTkVXOiBEeW5hbWljYWxseSByZW1vdmUgZGVmYXVsdCBib2R5IG1hcmdpbnMgYW5kIGhpZGUgb3ZlcmZsb3dcclxuICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLm1hcmdpbiA9ICcwJztcclxuICAgICAgICBkb2N1bWVudC5ib2R5LnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XHJcblxyXG4gICAgICAgIC8vIDEuIExvYWQgZ2FtZSBjb25maWd1cmF0aW9uIGZyb20gZGF0YS5qc29uXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnZGF0YS5qc29uJyk7XHJcbiAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSFRUUCBlcnJvciEgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZyA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0dhbWUgY29uZmlndXJhdGlvbiBsb2FkZWQ6JywgdGhpcy5jb25maWcpO1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnNjb3JlOyAvLyBJbml0aWFsaXplIHNjb3JlIGZyb20gY29uZmlnXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uOicsIGVycm9yKTtcclxuICAgICAgICAgICAgLy8gSWYgY29uZmlndXJhdGlvbiBmYWlscyB0byBsb2FkLCBkaXNwbGF5IGFuIGVycm9yIG1lc3NhZ2UgYW5kIHN0b3AuXHJcbiAgICAgICAgICAgIGNvbnN0IGVycm9yRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUudG9wID0gJzUwJSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLmxlZnQgPSAnNTAlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUudHJhbnNmb3JtID0gJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKSc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLmNvbG9yID0gJ3JlZCc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnN0eWxlLmZvbnRTaXplID0gJzI0cHgnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi50ZXh0Q29udGVudCA9ICdFcnJvcjogRmFpbGVkIHRvIGxvYWQgZ2FtZSBjb25maWd1cmF0aW9uLiBDaGVjayBjb25zb2xlIGZvciBkZXRhaWxzLic7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZXJyb3JEaXYpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyAyLiBJbml0aWFsaXplIFRocmVlLmpzIChzY2VuZSwgY2FtZXJhLCByZW5kZXJlcilcclxuICAgICAgICB0aGlzLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEgPSBuZXcgVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoXHJcbiAgICAgICAgICAgIDc1LCAvLyBGaWVsZCBvZiBWaWV3IChGT1YpXHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLndpZHRoIC8gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8uaGVpZ2h0LCAvLyBGaXhlZCBBc3BlY3QgcmF0aW8gZnJvbSBjb25maWdcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYU5lYXIsIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmVcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmNhbWVyYUZhciAgIC8vIEZhciBjbGlwcGluZyBwbGFuZVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHsgY2FudmFzOiB0aGlzLmNhbnZhcywgYW50aWFsaWFzOiB0cnVlIH0pO1xyXG4gICAgICAgIC8vIFJlbmRlcmVyIHNpemUgd2lsbCBiZSBzZXQgYnkgYXBwbHlGaXhlZEFzcGVjdFJhdGlvIHRvIGZpdCB0aGUgd2luZG93IHdoaWxlIG1haW50YWluaW5nIGFzcGVjdCByYXRpb1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAuZW5hYmxlZCA9IHRydWU7IC8vIEVuYWJsZSBzaGFkb3dzIGZvciBiZXR0ZXIgcmVhbGlzbVxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hhZG93TWFwLnR5cGUgPSBUSFJFRS5QQ0ZTb2Z0U2hhZG93TWFwOyAvLyBVc2Ugc29mdCBzaGFkb3dzXHJcblxyXG4gICAgICAgIC8vIENhbWVyYSBzZXR1cCBmb3IgZGVjb3VwbGVkIHlhdyBhbmQgcGl0Y2g6XHJcbiAgICAgICAgLy8gY2FtZXJhQ29udGFpbmVyIGhhbmRsZXMgeWF3IChob3Jpem9udGFsIHJvdGF0aW9uKSBhbmQgZm9sbG93cyB0aGUgcGxheWVyJ3MgcG9zaXRpb24uXHJcbiAgICAgICAgLy8gVGhlIGNhbWVyYSBpdHNlbGYgaXMgYSBjaGlsZCBvZiBjYW1lcmFDb250YWluZXIgYW5kIGhhbmRsZXMgcGl0Y2ggKHZlcnRpY2FsIHJvdGF0aW9uKS5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lciA9IG5ldyBUSFJFRS5PYmplY3QzRCgpO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuY2FtZXJhQ29udGFpbmVyKTtcclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5hZGQodGhpcy5jYW1lcmEpO1xyXG4gICAgICAgIC8vIFBvc2l0aW9uIHRoZSBjYW1lcmEgcmVsYXRpdmUgdG8gdGhlIGNhbWVyYUNvbnRhaW5lciAoYXQgZXllIGxldmVsKVxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnBvc2l0aW9uLnkgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhSGVpZ2h0T2Zmc2V0O1xyXG5cclxuXHJcbiAgICAgICAgLy8gMy4gSW5pdGlhbGl6ZSBDYW5ub24tZXMgKHBoeXNpY3Mgd29ybGQpXHJcbiAgICAgICAgdGhpcy53b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcclxuICAgICAgICB0aGlzLndvcmxkLmdyYXZpdHkuc2V0KDAsIC05LjgyLCAwKTsgLy8gU2V0IHN0YW5kYXJkIEVhcnRoIGdyYXZpdHkgKFktYXhpcyBkb3duKVxyXG4gICAgICAgIHRoaXMud29ybGQuYnJvYWRwaGFzZSA9IG5ldyBDQU5OT04uU0FQQnJvYWRwaGFzZSh0aGlzLndvcmxkKTsgLy8gVXNlIGFuIGVmZmljaWVudCBicm9hZHBoYXNlIGFsZ29yaXRobVxyXG4gICAgICAgIC8vIEZpeDogQ2FzdCB0aGlzLndvcmxkLnNvbHZlciB0byBDQU5OT04uR1NTb2x2ZXIgdG8gYWNjZXNzIHRoZSAnaXRlcmF0aW9ucycgcHJvcGVydHlcclxuICAgICAgICAvLyBUaGUgZGVmYXVsdCBzb2x2ZXIgaW4gQ2Fubm9uLmpzIChhbmQgQ2Fubm9uLWVzKSBpcyBHU1NvbHZlciwgd2hpY2ggaGFzIHRoaXMgcHJvcGVydHkuXHJcbiAgICAgICAgKHRoaXMud29ybGQuc29sdmVyIGFzIENBTk5PTi5HU1NvbHZlcikuaXRlcmF0aW9ucyA9IDEwOyAvLyBJbmNyZWFzZSBzb2x2ZXIgaXRlcmF0aW9ucyBmb3IgYmV0dGVyIHN0YWJpbGl0eVxyXG5cclxuICAgICAgICAvLyBORVc6IENyZWF0ZSBDYW5ub24uanMgTWF0ZXJpYWxzIGFuZCBDb250YWN0TWF0ZXJpYWwgZm9yIHBsYXllci1ncm91bmQgaW50ZXJhY3Rpb25cclxuICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgncGxheWVyTWF0ZXJpYWwnKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZ3JvdW5kTWF0ZXJpYWwnKTtcclxuICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2RlZmF1bHRPYmplY3RNYXRlcmlhbCcpOyAvLyBBRERFRDogTWF0ZXJpYWwgZm9yIGdlbmVyaWMgcGxhY2VkIG9iamVjdHNcclxuICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnYnVsbGV0TWF0ZXJpYWwnKTsgLy8gTkVXOiBNYXRlcmlhbCBmb3IgYnVsbGV0c1xyXG4gICAgICAgIHRoaXMuZW5lbXlNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2VuZW15TWF0ZXJpYWwnKTsgLy8gTkVXOiBNYXRlcmlhbCBmb3IgZW5lbWllc1xyXG5cclxuICAgICAgICBjb25zdCBwbGF5ZXJHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJHcm91bmRGcmljdGlvbiwgLy8gVXNlIGNvbmZpZ3VyYWJsZSBncm91bmQgZnJpY3Rpb25cclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsIC8vIE5vIGJvdW5jZSBmb3IgZ3JvdW5kXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKHBsYXllckdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIEFEREVEOiBQbGF5ZXItT2JqZWN0IGNvbnRhY3QgbWF0ZXJpYWwgKGZyaWN0aW9uIGJldHdlZW4gcGxheWVyIGFuZCBwbGFjZWQgb2JqZWN0cylcclxuICAgICAgICBjb25zdCBwbGF5ZXJPYmplY3RDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyR3JvdW5kRnJpY3Rpb24sIC8vIFNhbWUgZnJpY3Rpb24gYXMgcGxheWVyLWdyb3VuZFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyT2JqZWN0Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gQURERUQ6IE9iamVjdC1Hcm91bmQgY29udGFjdCBtYXRlcmlhbCAoZnJpY3Rpb24gYmV0d2VlbiBwbGFjZWQgb2JqZWN0cyBhbmQgZ3JvdW5kKVxyXG4gICAgICAgIGNvbnN0IG9iamVjdEdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuMCxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKG9iamVjdEdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQnVsbGV0LUdyb3VuZCBjb250YWN0IG1hdGVyaWFsIChubyBmcmljdGlvbiwgbm8gcmVzdGl0dXRpb24pXHJcbiAgICAgICAgY29uc3QgYnVsbGV0R3JvdW5kQ29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChidWxsZXRHcm91bmRDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBORVc6IEJ1bGxldC1PYmplY3QgY29udGFjdCBtYXRlcmlhbCAobm8gZnJpY3Rpb24sIG5vIHJlc3RpdHV0aW9uKVxyXG4gICAgICAgIGNvbnN0IGJ1bGxldE9iamVjdENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuMCxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKGJ1bGxldE9iamVjdENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQnVsbGV0LUVuZW15IGNvbnRhY3QgbWF0ZXJpYWwgKGJ1bGxldCBkaXNhcHBlYXJzLCBlbmVteSB0YWtlcyBkYW1hZ2UpXHJcbiAgICAgICAgY29uc3QgYnVsbGV0RW5lbXlDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5lbmVteU1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoYnVsbGV0RW5lbXlDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBORVc6IFBsYXllci1FbmVteSBjb250YWN0IG1hdGVyaWFsIChwbGF5ZXIgbWlnaHQgcHVzaCBlbmVteSBzbGlnaHRseSlcclxuICAgICAgICBjb25zdCBwbGF5ZXJFbmVteUNvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmVuZW15TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjUsXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChwbGF5ZXJFbmVteUNvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG5cclxuICAgICAgICAvLyA0LiBMb2FkIGFzc2V0cyAodGV4dHVyZXMgYW5kIHNvdW5kcylcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRBc3NldHMoKTtcclxuXHJcbiAgICAgICAgLy8gNS4gQ3JlYXRlIGdhbWUgb2JqZWN0cyAocGxheWVyLCBncm91bmQsIHN0YXRpYyBvYmplY3RzLCBlbmVtaWVzKSBhbmQgbGlnaHRpbmdcclxuICAgICAgICB0aGlzLmNyZWF0ZUdyb3VuZCgpOyAvLyBDcmVhdGVzIHRoaXMuZ3JvdW5kQm9keVxyXG4gICAgICAgIHRoaXMuY3JlYXRlUGxheWVyKCk7IC8vIENyZWF0ZXMgdGhpcy5wbGF5ZXJCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVTdGF0aWNPYmplY3RzKCk7IC8vIFJlbmFtZWQgZnJvbSBjcmVhdGVQbGFjZWRPYmplY3RzLCBjcmVhdGVzIHN0YXRpYyBib3hlc1xyXG4gICAgICAgIHRoaXMuY3JlYXRlRW5lbWllcygpOyAvLyBORVc6IENyZWF0ZXMgZW5lbWllc1xyXG4gICAgICAgIHRoaXMuc2V0dXBMaWdodGluZygpO1xyXG5cclxuICAgICAgICAvLyBORVc6IENyZWF0ZSByZXVzYWJsZSBidWxsZXQgZ2VvbWV0cnkgYW5kIG1hdGVyaWFsXHJcbiAgICAgICAgdGhpcy5idWxsZXRHZW9tZXRyeSA9IG5ldyBUSFJFRS5TcGhlcmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0LmRpbWVuc2lvbnMucmFkaXVzLCA4LCA4KTtcclxuICAgICAgICBjb25zdCBidWxsZXRUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldC50ZXh0dXJlTmFtZSk7XHJcbiAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbE1lc2ggPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IGJ1bGxldFRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBidWxsZXRUZXh0dXJlID8gMHhmZmZmZmYgOiAweGZmZmYwMCAvLyBZZWxsb3cgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBNT0RJRklFRDogU2V0dXAgQ2Fubm9uLWVzIGNvbnRhY3QgbGlzdGVuZXJzIGZvciBnZW5lcmFsIHN1cmZhY2UgY29udGFjdCBsb2dpY1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkRXZlbnRMaXN0ZW5lcignYmVnaW5Db250YWN0JywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBib2R5QSA9IGV2ZW50LmJvZHlBO1xyXG4gICAgICAgICAgICBsZXQgYm9keUIgPSBldmVudC5ib2R5QjtcclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIHBsYXllckJvZHkgaXMgaW52b2x2ZWQgaW4gdGhlIGNvbnRhY3RcclxuICAgICAgICAgICAgaWYgKGJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgfHwgYm9keUIgPT09IHRoaXMucGxheWVyQm9keSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3RoZXJCb2R5ID0gYm9keUEgPT09IHRoaXMucGxheWVyQm9keSA/IGJvZHlCIDogYm9keUE7XHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgb3RoZXIgYm9keSBpcyBzdGF0aWMgKG1hc3MgPSAwKSwgd2hpY2ggaW5jbHVkZXMgZ3JvdW5kIGFuZCBwbGFjZWQgb2JqZWN0c1xyXG4gICAgICAgICAgICAgICAgaWYgKG90aGVyQm9keS5tYXNzID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcysrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMud29ybGQuYWRkRXZlbnRMaXN0ZW5lcignZW5kQ29udGFjdCcsIChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgYm9keUEgPSBldmVudC5ib2R5QTtcclxuICAgICAgICAgICAgbGV0IGJvZHlCID0gZXZlbnQuYm9keUI7XHJcblxyXG4gICAgICAgICAgICBpZiAoYm9keUEgPT09IHRoaXMucGxheWVyQm9keSB8fCBib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5ID8gYm9keUIgOiBib2R5QTtcclxuICAgICAgICAgICAgICAgIGlmIChvdGhlckJvZHkubWFzcyA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPSBNYXRoLm1heCgwLCB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzIC0gMSk7IC8vIEVuc3VyZSBpdCBkb2Vzbid0IGdvIGJlbG93IDBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyA3LiBTZXR1cCBldmVudCBsaXN0ZW5lcnMgZm9yIHVzZXIgaW5wdXQgYW5kIHdpbmRvdyByZXNpemluZ1xyXG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCB0aGlzLm9uV2luZG93UmVzaXplLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLm9uS2V5RG93bi5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIHRoaXMub25LZXlVcC5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm9uTW91c2VNb3ZlLmJpbmQodGhpcykpOyAvLyBGb3IgbW91c2UgbG9va1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMub25Nb3VzZURvd24uYmluZCh0aGlzKSk7IC8vIE5FVzogRm9yIGZpcmluZyBidWxsZXRzXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIEZvciBwb2ludGVyIGxvY2sgc3RhdHVzXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW96cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIEZpcmVmb3ggY29tcGF0aWJpbGl0eVxyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmtpdHBvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcykpOyAvLyBXZWJraXQgY29tcGF0aWJpbGl0eVxyXG5cclxuICAgICAgICAvLyBBcHBseSBpbml0aWFsIGZpeGVkIGFzcGVjdCByYXRpbyBhbmQgY2VudGVyIHRoZSBjYW52YXNcclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpO1xyXG5cclxuICAgICAgICAvLyA4LiBTZXR1cCB0aGUgdGl0bGUgc2NyZWVuIFVJIGFuZCBHYW1lIFVJXHJcbiAgICAgICAgdGhpcy5zZXR1cFRpdGxlU2NyZWVuKCk7XHJcbiAgICAgICAgdGhpcy5zZXR1cEdhbWVVSSgpOyAvLyBORVc6IFNldHVwIHNjb3JlIGRpc3BsYXkgYW5kIGNyb3NzaGFpclxyXG5cclxuICAgICAgICAvLyBTdGFydCB0aGUgbWFpbiBnYW1lIGxvb3BcclxuICAgICAgICB0aGlzLmFuaW1hdGUoMCk7IC8vIFBhc3MgaW5pdGlhbCB0aW1lIDBcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIExvYWRzIGFsbCB0ZXh0dXJlcyBhbmQgc291bmRzIGRlZmluZWQgaW4gdGhlIGdhbWUgY29uZmlndXJhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhc3luYyBsb2FkQXNzZXRzKCkge1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVMb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuaW1hZ2VzLm1hcChpbWcgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gdGV4dHVyZUxvYWRlci5sb2FkQXN5bmMoaW1nLnBhdGgpXHJcbiAgICAgICAgICAgICAgICAudGhlbih0ZXh0dXJlID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRleHR1cmVzLnNldChpbWcubmFtZSwgdGV4dHVyZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwUyA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSBob3Jpem9udGFsbHlcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7IC8vIFJlcGVhdCB0ZXh0dXJlIHZlcnRpY2FsbHlcclxuICAgICAgICAgICAgICAgICAgICAvLyBBZGp1c3QgdGV4dHVyZSByZXBldGl0aW9uIGZvciB0aGUgZ3JvdW5kIHRvIGF2b2lkIHN0cmV0Y2hpbmdcclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUgPT09ICdncm91bmRfdGV4dHVyZScpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgIHRleHR1cmUucmVwZWF0LnNldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gNSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEZvciBib3ggdGV4dHVyZXMsIGVuc3VyZSByZXBldGl0aW9uIGlmIGRlc2lyZWQsIG9yIHNldCB0byAxLDEgZm9yIHNpbmdsZSBhcHBsaWNhdGlvblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbWcubmFtZS5lbmRzV2l0aCgnX3RleHR1cmUnKSkgeyAvLyBHZW5lcmljIGNoZWNrIGZvciBvdGhlciB0ZXh0dXJlc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3IgZ2VuZXJpYyBib3ggdGV4dHVyZXMsIHdlIG1pZ2h0IHdhbnQgdG8gcmVwZWF0IGJhc2VkIG9uIG9iamVjdCBkaW1lbnNpb25zXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBzaW1wbGljaXR5IG5vdywgbGV0J3Mga2VlcCBkZWZhdWx0IChubyByZXBlYXQgdW5sZXNzIGV4cGxpY2l0IGZvciBncm91bmQpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEEgbW9yZSByb2J1c3Qgc29sdXRpb24gd291bGQgaW52b2x2ZSBzZXR0aW5nIHJlcGVhdCBiYXNlZCBvbiBzY2FsZS9kaW1lbnNpb25zIGZvciBlYWNoIG9iamVjdFxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHRleHR1cmU6ICR7aW1nLnBhdGh9YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIENvbnRpbnVlIGV2ZW4gaWYgYW4gYXNzZXQgZmFpbHMgdG8gbG9hZDsgZmFsbGJhY2tzIChzb2xpZCBjb2xvcnMpIGFyZSB1c2VkLlxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNvdW5kUHJvbWlzZXMgPSB0aGlzLmNvbmZpZy5hc3NldHMuc291bmRzLm1hcChzb3VuZCA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXVkaW8gPSBuZXcgQXVkaW8oc291bmQucGF0aCk7XHJcbiAgICAgICAgICAgICAgICBhdWRpby52b2x1bWUgPSBzb3VuZC52b2x1bWU7XHJcbiAgICAgICAgICAgICAgICBhdWRpby5sb29wID0gKHNvdW5kLm5hbWUgPT09ICdiYWNrZ3JvdW5kX211c2ljJyk7IC8vIExvb3AgYmFja2dyb3VuZCBtdXNpY1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25jYW5wbGF5dGhyb3VnaCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5zZXQoc291bmQubmFtZSwgYXVkaW8pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmVycm9yID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBsb2FkIHNvdW5kOiAke3NvdW5kLnBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpOyAvLyBSZXNvbHZlIGV2ZW4gb24gZXJyb3IgdG8gbm90IGJsb2NrIFByb21pc2UuYWxsXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoWy4uLmltYWdlUHJvbWlzZXMsIC4uLnNvdW5kUHJvbWlzZXNdKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQXNzZXRzIGxvYWRlZDogJHt0aGlzLnRleHR1cmVzLnNpemV9IHRleHR1cmVzLCAke3RoaXMuc291bmRzLnNpemV9IHNvdW5kcy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgYW5kIGRpc3BsYXlzIHRoZSB0aXRsZSBzY3JlZW4gVUkgZHluYW1pY2FsbHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBUaXRsZVNjcmVlbigpIHtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsIC8vIFBvc2l0aW9uIHJlbGF0aXZlIHRvIGJvZHksIHdpbGwgYmUgY2VudGVyZWQgYW5kIHNpemVkIGJ5IGFwcGx5Rml4ZWRBc3BlY3RSYXRpb1xyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICdyZ2JhKDAsIDAsIDAsIDAuOCknLFxyXG4gICAgICAgICAgICBkaXNwbGF5OiAnZmxleCcsIGZsZXhEaXJlY3Rpb246ICdjb2x1bW4nLFxyXG4gICAgICAgICAgICBqdXN0aWZ5Q29udGVudDogJ2NlbnRlcicsIGFsaWduSXRlbXM6ICdjZW50ZXInLFxyXG4gICAgICAgICAgICBjb2xvcjogJ3doaXRlJywgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICc0OHB4JywgdGV4dEFsaWduOiAnY2VudGVyJywgekluZGV4OiAnMTAwMCdcclxuICAgICAgICB9KTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuXHJcbiAgICAgICAgLy8gQ3J1Y2lhbDogQ2FsbCBhcHBseUZpeGVkQXNwZWN0UmF0aW8gaGVyZSB0byBlbnN1cmUgdGhlIHRpdGxlIHNjcmVlbiBvdmVybGF5XHJcbiAgICAgICAgLy8gaXMgc2l6ZWQgYW5kIHBvc2l0aW9uZWQgY29ycmVjdGx5IHJlbGF0aXZlIHRvIHRoZSBjYW52YXMgZnJvbSB0aGUgc3RhcnQuXHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTtcclxuXHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnRpdGxlVGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy50aXRsZVNjcmVlblRleHQ7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVRleHQpO1xyXG5cclxuICAgICAgICB0aGlzLnByb21wdFRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICB0aGlzLnByb21wdFRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhcnRHYW1lUHJvbXB0O1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5wcm9tcHRUZXh0LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIG1hcmdpblRvcDogJzIwcHgnLCBmb250U2l6ZTogJzI0cHgnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYXBwZW5kQ2hpbGQodGhpcy5wcm9tcHRUZXh0KTtcclxuXHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIGRpcmVjdGx5IHRvIHRoZSBvdmVybGF5IHRvIGNhcHR1cmUgY2xpY2tzIGFuZCBzdGFydCB0aGUgZ2FtZVxyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5zdGFydEdhbWUoKSk7XHJcblxyXG4gICAgICAgIC8vIEF0dGVtcHQgdG8gcGxheSBiYWNrZ3JvdW5kIG11c2ljLiBJdCBtaWdodCBiZSBibG9ja2VkIGJ5IGJyb3dzZXJzIGlmIG5vIHVzZXIgZ2VzdHVyZSBoYXMgb2NjdXJyZWQgeWV0LlxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGRlbmllZCAocmVxdWlyZXMgdXNlciBnZXN0dXJlKTpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBDcmVhdGVzIGFuZCBkaXNwbGF5cyB0aGUgZ2FtZSBzY29yZSBVSSBhbmQgY3Jvc3NoYWlyLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwR2FtZVVJKCkge1xyXG4gICAgICAgIHRoaXMuc2NvcmVUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnNjb3JlVGV4dC5zdHlsZSwge1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgdG9wOiAnMTBweCcsXHJcbiAgICAgICAgICAgIGxlZnQ6ICcxMHB4JyxcclxuICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsXHJcbiAgICAgICAgICAgIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnMjRweCcsXHJcbiAgICAgICAgICAgIHpJbmRleDogJzEwMDEnIC8vIEFib3ZlIHRpdGxlIHNjcmVlbiBvdmVybGF5IGJ1dCBzZXBhcmF0ZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuc2NvcmVUZXh0LnRleHRDb250ZW50ID0gYFNjb3JlOiAke3RoaXMuc2NvcmV9YDtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMuc2NvcmVUZXh0KTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBDcmVhdGUgYW5kIHNldHVwIGNyb3NzaGFpclxyXG4gICAgICAgIHRoaXMuY3Jvc3NoYWlyRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5jcm9zc2hhaXJFbGVtZW50LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgICAgICB3aWR0aDogJzJweCcsICAvLyBDZW50cmFsIGRvdCBzaXplXHJcbiAgICAgICAgICAgIGhlaWdodDogJzJweCcsXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJ3doaXRlJywgLy8gQ2VudHJhbCB3aGl0ZSBkb3RcclxuICAgICAgICAgICAgLy8gVXNlIGJveC1zaGFkb3dzIGZvciBvdXRsaW5lcyBhbmQgcG90ZW50aWFsIGNyb3NzLWxpa2UgYXBwZWFyYW5jZVxyXG4gICAgICAgICAgICBib3hTaGFkb3c6ICcwIDAgMCAxcHggd2hpdGUsIDAgMCAwIDNweCByZ2JhKDAsMCwwLDAuOCksIDAgMCAwIDRweCB3aGl0ZScsXHJcbiAgICAgICAgICAgIGJvcmRlclJhZGl1czogJzUwJScsIC8vIE1ha2UgaXQgY2lyY3VsYXJcclxuICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIHpJbmRleDogJzEwMDInLCAvLyBBYm92ZSB0aXRsZSBzY3JlZW4gYW5kIHNjb3JlXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdub25lJyAvLyBJbml0aWFsbHkgaGlkZGVuXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLmNyb3NzaGFpckVsZW1lbnQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBVcGRhdGVzIHRoZSBzY29yZSBkaXNwbGF5IG9uIHRoZSBVSS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVTY29yZURpc3BsYXkoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2NvcmVUZXh0KSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2NvcmVUZXh0LnRleHRDb250ZW50ID0gYFNjb3JlOiAke3RoaXMuc2NvcmV9YDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUcmFuc2l0aW9ucyB0aGUgZ2FtZSBmcm9tIHRoZSB0aXRsZSBzY3JlZW4gdG8gdGhlIHBsYXlpbmcgc3RhdGUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3RhcnRHYW1lKCkge1xyXG4gICAgICAgIHRoaXMuc3RhdGUgPSBHYW1lU3RhdGUuUExBWUlORztcclxuICAgICAgICAvLyBSZW1vdmUgdGhlIHRpdGxlIHNjcmVlbiBvdmVybGF5XHJcbiAgICAgICAgaWYgKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5ICYmIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnBhcmVudE5vZGUpIHtcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5yZW1vdmVDaGlsZCh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lciB0byBjYW52YXMgZm9yIHJlLWxvY2tpbmcgcG9pbnRlciBhZnRlciB0aXRsZSBzY3JlZW4gaXMgZ29uZVxyXG4gICAgICAgIHRoaXMuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5oYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyLmJpbmQodGhpcykpO1xyXG5cclxuICAgICAgICAvLyBSZXF1ZXN0IHBvaW50ZXIgbG9jayBmb3IgaW1tZXJzaXZlIG1vdXNlIGNvbnRyb2xcclxuICAgICAgICB0aGlzLmNhbnZhcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgICAvLyBFbnN1cmUgYmFja2dyb3VuZCBtdXNpYyBwbGF5cyBub3cgdGhhdCBhIHVzZXIgZ2VzdHVyZSBoYXMgb2NjdXJyZWRcclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBmYWlsZWQgYWZ0ZXIgdXNlciBnZXN0dXJlOlwiLCBlKSk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogU2hvdyBjcm9zc2hhaXIgd2hlbiBnYW1lIHN0YXJ0c1xyXG4gICAgICAgIGlmICh0aGlzLmNyb3NzaGFpckVsZW1lbnQpIHtcclxuICAgICAgICAgICAgdGhpcy5jcm9zc2hhaXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgY2xpY2tzIG9uIHRoZSBjYW52YXMgdG8gcmUtbG9jayB0aGUgcG9pbnRlciBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCB1bmxvY2tlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBoYW5kbGVDYW52YXNSZUxvY2tQb2ludGVyKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiAhdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVQbGF5ZXIoKSB7XHJcbiAgICAgICAgLy8gUGxheWVyIHZpc3VhbCBtZXNoIChhIHNpbXBsZSBib3gpXHJcbiAgICAgICAgY29uc3QgcGxheWVyVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdwbGF5ZXJfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IHBsYXllck1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IHBsYXllclRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBwbGF5ZXJUZXh0dXJlID8gMHhmZmZmZmYgOiAweDAwNzdmZiAvLyBVc2Ugd2hpdGUgd2l0aCB0ZXh0dXJlLCBvciBibHVlIGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSgxLCAyLCAxKTsgLy8gUGxheWVyIGRpbWVuc2lvbnNcclxuICAgICAgICB0aGlzLnBsYXllck1lc2ggPSBuZXcgVEhSRUUuTWVzaChwbGF5ZXJHZW9tZXRyeSwgcGxheWVyTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55ID0gNTsgLy8gU3RhcnQgcGxheWVyIHNsaWdodGx5IGFib3ZlIHRoZSBncm91bmRcclxuICAgICAgICB0aGlzLnBsYXllck1lc2guY2FzdFNoYWRvdyA9IHRydWU7IC8vIFBsYXllciBjYXN0cyBhIHNoYWRvd1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMucGxheWVyTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXllciBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBib3ggc2hhcGUpXHJcbiAgICAgICAgY29uc3QgcGxheWVyU2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoMC41LCAxLCAwLjUpKTsgLy8gSGFsZiBleHRlbnRzIG9mIHRoZSBib3ggZm9yIGNvbGxpc2lvblxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJNYXNzLCAvLyBQbGF5ZXIncyBtYXNzXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzModGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLngsIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi55LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBwbGF5ZXJTaGFwZSxcclxuICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSwgLy8gUHJldmVudCB0aGUgcGxheWVyIGZyb20gZmFsbGluZyBvdmVyIChzaW11bGF0ZXMgYSBjYXBzdWxlL2N5bGluZGVyIGNoYXJhY3RlcilcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMucGxheWVyTWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBwbGF5ZXIgbWF0ZXJpYWwgZm9yIGNvbnRhY3QgcmVzb2x1dGlvblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLnBsYXllckJvZHkpO1xyXG5cclxuICAgICAgICAvLyBTZXQgaW5pdGlhbCBjYW1lcmFDb250YWluZXIgcG9zaXRpb24gdG8gcGxheWVyJ3MgcGh5c2ljcyBib2R5IHBvc2l0aW9uLlxyXG4gICAgICAgIC8vIFRoZSBjYW1lcmEgaXRzZWxmIGlzIGEgY2hpbGQgb2YgY2FtZXJhQ29udGFpbmVyIGFuZCBoYXMgaXRzIG93biBsb2NhbCBZIG9mZnNldC5cclxuICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5wb3NpdGlvbi5jb3B5KHRoaXMucGxheWVyQm9keS5wb3NpdGlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlZlY3RvcjMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyB0aGUgZ3JvdW5kJ3MgdmlzdWFsIG1lc2ggYW5kIHBoeXNpY3MgYm9keS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVHcm91bmQoKSB7XHJcbiAgICAgICAgLy8gR3JvdW5kIHZpc3VhbCBtZXNoIChhIGxhcmdlIHBsYW5lKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgnZ3JvdW5kX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBncm91bmRNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBncm91bmRUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogZ3JvdW5kVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHg4ODg4ODggLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kR2VvbWV0cnkgPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdyb3VuZEdlb21ldHJ5LCBncm91bmRNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJvdGF0aW9uLnggPSAtTWF0aC5QSSAvIDI7IC8vIFJvdGF0ZSB0byBsYXkgZmxhdCBvbiB0aGUgWFogcGxhbmVcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7IC8vIEdyb3VuZCByZWNlaXZlcyBzaGFkb3dzXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5ncm91bmRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gR3JvdW5kIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIHBsYW5lIHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IGdyb3VuZFNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IDAsIC8vIEEgbWFzcyBvZiAwIG1ha2VzIGl0IGEgc3RhdGljIChpbW1vdmFibGUpIGJvZHlcclxuICAgICAgICAgICAgc2hhcGU6IGdyb3VuZFNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5ncm91bmRNYXRlcmlhbCAvLyBBc3NpZ24gdGhlIGdyb3VuZCBtYXRlcmlhbCBmb3IgY29udGFjdCByZXNvbHV0aW9uXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgLy8gUm90YXRlIHRoZSBDYW5ub24uanMgcGxhbmUgYm9keSB0byBtYXRjaCB0aGUgVGhyZWUuanMgcGxhbmUgb3JpZW50YXRpb24gKGZsYXQpXHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMSwgMCwgMCksIC1NYXRoLlBJIC8gMik7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMuZ3JvdW5kQm9keSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IENyZWF0ZXMgdmlzdWFsIG1lc2hlcyBhbmQgcGh5c2ljcyBib2RpZXMgZm9yIGFsbCBzdGF0aWMgb2JqZWN0cyAoYm94ZXMpIGRlZmluZWQgaW4gY29uZmlnLmdhbWVTZXR0aW5ncy5zdGF0aWNPYmplY3RzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVN0YXRpY09iamVjdHMoKSB7IC8vIFJlbmFtZWQgZnJvbSBjcmVhdGVQbGFjZWRPYmplY3RzXHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhdGljT2JqZWN0cykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBzdGF0aWNPYmplY3RzIGRlZmluZWQgaW4gZ2FtZVNldHRpbmdzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnN0YXRpY09iamVjdHMuZm9yRWFjaChvYmpDb25maWcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQob2JqQ29uZmlnLnRleHR1cmVOYW1lKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBtYXA6IHRleHR1cmUsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhhYWFhYWEgLy8gRGVmYXVsdCBncmV5IGlmIG5vIHRleHR1cmVcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgVGhyZWUuanMgTWVzaFxyXG4gICAgICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeShvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0LCBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICBtZXNoLnBvc2l0aW9uLnNldChvYmpDb25maWcucG9zaXRpb24ueCwgb2JqQ29uZmlnLnBvc2l0aW9uLnksIG9iakNvbmZpZy5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ID0gb2JqQ29uZmlnLnJvdGF0aW9uWTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RNZXNoZXMucHVzaChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBDYW5ub24uanMgQm9keVxyXG4gICAgICAgICAgICAvLyBDYW5ub24uQm94IHRha2VzIGhhbGYgZXh0ZW50c1xyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogb2JqQ29uZmlnLm1hc3MsIC8vIFVzZSAwIGZvciBzdGF0aWMgb2JqZWN0c1xyXG4gICAgICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyhvYmpDb25maWcucG9zaXRpb24ueCwgb2JqQ29uZmlnLnBvc2l0aW9uLnksIG9iakNvbmZpZy5wb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgICAgIHNoYXBlOiBzaGFwZSxcclxuICAgICAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCAvLyBBc3NpZ24gdGhlIGRlZmF1bHQgb2JqZWN0IG1hdGVyaWFsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpZiAob2JqQ29uZmlnLnJvdGF0aW9uWSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBib2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMCwgMSwgMCksIG9iakNvbmZpZy5yb3RhdGlvblkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keShib2R5KTtcclxuICAgICAgICAgICAgdGhpcy5wbGFjZWRPYmplY3RCb2RpZXMucHVzaChib2R5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQ3JlYXRlZCAke3RoaXMucGxhY2VkT2JqZWN0TWVzaGVzLmxlbmd0aH0gc3RhdGljIG9iamVjdHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IENyZWF0ZXMgdmlzdWFsIG1lc2hlcyBhbmQgcGh5c2ljcyBib2RpZXMgZm9yIGFsbCBlbmVteSBpbnN0YW5jZXMgZGVmaW5lZCBpbiBjb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SW5zdGFuY2VzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZUVuZW1pZXMoKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlJbnN0YW5jZXMgfHwgIXRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteVR5cGVzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIk5vIGVuZW15SW5zdGFuY2VzIG9yIGVuZW15VHlwZXMgZGVmaW5lZCBpbiBnYW1lU2V0dGluZ3MuXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBlbmVteVR5cGVNYXAgPSBuZXcgTWFwPHN0cmluZywgRW5lbXlUeXBlQ29uZmlnPigpO1xyXG4gICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteVR5cGVzLmZvckVhY2godHlwZSA9PiBlbmVteVR5cGVNYXAuc2V0KHR5cGUubmFtZSwgdHlwZSkpO1xyXG5cclxuICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlJbnN0YW5jZXMuZm9yRWFjaChpbnN0YW5jZUNvbmZpZyA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHR5cGVDb25maWcgPSBlbmVteVR5cGVNYXAuZ2V0KGluc3RhbmNlQ29uZmlnLmVuZW15VHlwZU5hbWUpO1xyXG4gICAgICAgICAgICBpZiAoIXR5cGVDb25maWcpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVuZW15IHR5cGUgJyR7aW5zdGFuY2VDb25maWcuZW5lbXlUeXBlTmFtZX0nIG5vdCBmb3VuZCBmb3IgaW5zdGFuY2UgJyR7aW5zdGFuY2VDb25maWcubmFtZX0nLiBTa2lwcGluZy5gKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KHR5cGVDb25maWcudGV4dHVyZU5hbWUpO1xyXG4gICAgICAgICAgICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgICAgIG1hcDogdGV4dHVyZSxcclxuICAgICAgICAgICAgICAgIGNvbG9yOiB0ZXh0dXJlID8gMHhmZmZmZmYgOiAweGZmMDAwMCAvLyBEZWZhdWx0IHJlZCBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIFRocmVlLmpzIE1lc2hcclxuICAgICAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkodHlwZUNvbmZpZy5kaW1lbnNpb25zLndpZHRoLCB0eXBlQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0LCB0eXBlQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICAgICAgbWVzaC5wb3NpdGlvbi5zZXQoaW5zdGFuY2VDb25maWcucG9zaXRpb24ueCwgaW5zdGFuY2VDb25maWcucG9zaXRpb24ueSwgaW5zdGFuY2VDb25maWcucG9zaXRpb24ueik7XHJcbiAgICAgICAgICAgIGlmIChpbnN0YW5jZUNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ID0gaW5zdGFuY2VDb25maWcucm90YXRpb25ZO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKG1lc2gpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIENhbm5vbi5qcyBCb2R5XHJcbiAgICAgICAgICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKFxyXG4gICAgICAgICAgICAgICAgdHlwZUNvbmZpZy5kaW1lbnNpb25zLndpZHRoIC8gMixcclxuICAgICAgICAgICAgICAgIHR5cGVDb25maWcuZGltZW5zaW9ucy5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICAgICAgdHlwZUNvbmZpZy5kaW1lbnNpb25zLmRlcHRoIC8gMlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgY29uc3QgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgICAgICBtYXNzOiB0eXBlQ29uZmlnLm1hc3MsXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLngsIGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLnksIGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICAgICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuZW5lbXlNYXRlcmlhbCxcclxuICAgICAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUgLy8gUHJldmVudCBlbmVtaWVzIGZyb20gdHVtYmxpbmdcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGlmIChpbnN0YW5jZUNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgYm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDAsIDEsIDApLCBpbnN0YW5jZUNvbmZpZy5yb3RhdGlvblkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMud29ybGQuYWRkQm9keShib2R5KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZUVuZW15OiBBY3RpdmVFbmVteSA9IHtcclxuICAgICAgICAgICAgICAgIG5hbWU6IGluc3RhbmNlQ29uZmlnLm5hbWUsXHJcbiAgICAgICAgICAgICAgICBtZXNoOiBtZXNoLFxyXG4gICAgICAgICAgICAgICAgYm9keTogYm9keSxcclxuICAgICAgICAgICAgICAgIHR5cGVDb25maWc6IHR5cGVDb25maWcsXHJcbiAgICAgICAgICAgICAgICBjdXJyZW50SGVhbHRoOiB0eXBlQ29uZmlnLmhlYWx0aCxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgYm9keS51c2VyRGF0YSA9IGFjdGl2ZUVuZW15OyAvLyBBdHRhY2ggYWN0aXZlRW5lbXkgdG8gYm9keSBmb3IgY29sbGlzaW9uIGxvb2t1cFxyXG5cclxuICAgICAgICAgICAgdGhpcy5lbmVtaWVzLnB1c2goYWN0aXZlRW5lbXkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBDcmVhdGVkICR7dGhpcy5lbmVtaWVzLmxlbmd0aH0gZW5lbWllcy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFNldHMgdXAgYW1iaWVudCBhbmQgZGlyZWN0aW9uYWwgbGlnaHRpbmcgaW4gdGhlIHNjZW5lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwTGlnaHRpbmcoKSB7XHJcbiAgICAgICAgY29uc3QgYW1iaWVudExpZ2h0ID0gbmV3IFRIUkVFLkFtYmllbnRMaWdodCgweDQwNDA0MCwgMS4wKTsgLy8gU29mdCB3aGl0ZSBhbWJpZW50IGxpZ2h0XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYW1iaWVudExpZ2h0KTtcclxuXHJcbiAgICAgICAgY29uc3QgZGlyZWN0aW9uYWxMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KDB4ZmZmZmZmLCAwLjgpOyAvLyBCcmlnaHRlciBkaXJlY3Rpb25hbCBsaWdodFxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQucG9zaXRpb24uc2V0KDUsIDEwLCA1KTsgLy8gUG9zaXRpb24gdGhlIGxpZ2h0IHNvdXJjZVxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRydWU7IC8vIEVuYWJsZSBzaGFkb3dzIGZyb20gdGhpcyBsaWdodCBzb3VyY2VcclxuICAgICAgICAvLyBDb25maWd1cmUgc2hhZG93IHByb3BlcnRpZXMgZm9yIHRoZSBkaXJlY3Rpb25hbCBsaWdodFxyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUud2lkdGggPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93Lm1hcFNpemUuaGVpZ2h0ID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubmVhciA9IDAuNTtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuZmFyID0gNTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmxlZnQgPSAtMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnJpZ2h0ID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5ib3R0b20gPSAtMTA7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoZGlyZWN0aW9uYWxMaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIHdpbmRvdyByZXNpemluZyB0byBrZWVwIHRoZSBjYW1lcmEgYXNwZWN0IHJhdGlvIGFuZCByZW5kZXJlciBzaXplIGNvcnJlY3QuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25XaW5kb3dSZXNpemUoKSB7XHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTsgLy8gQXBwbHkgdGhlIGZpeGVkIGFzcGVjdCByYXRpbyBhbmQgY2VudGVyIHRoZSBjYW52YXNcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFwcGxpZXMgdGhlIGNvbmZpZ3VyZWQgZml4ZWQgYXNwZWN0IHJhdGlvIHRvIHRoZSByZW5kZXJlciBhbmQgY2FtZXJhLFxyXG4gICAgICogcmVzaXppbmcgYW5kIGNlbnRlcmluZyB0aGUgY2FudmFzIHRvIGZpdCB3aXRoaW4gdGhlIHdpbmRvdy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBhcHBseUZpeGVkQXNwZWN0UmF0aW8oKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0QXNwZWN0UmF0aW8gPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby53aWR0aCAvIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLmhlaWdodDtcclxuXHJcbiAgICAgICAgbGV0IG5ld1dpZHRoOiBudW1iZXI7XHJcbiAgICAgICAgbGV0IG5ld0hlaWdodDogbnVtYmVyO1xyXG5cclxuICAgICAgICBjb25zdCB3aW5kb3dXaWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoO1xyXG4gICAgICAgIGNvbnN0IHdpbmRvd0hlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodDtcclxuICAgICAgICBjb25zdCBjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPSB3aW5kb3dXaWR0aCAvIHdpbmRvd0hlaWdodDtcclxuXHJcbiAgICAgICAgaWYgKGN1cnJlbnRXaW5kb3dBc3BlY3RSYXRpbyA+IHRhcmdldEFzcGVjdFJhdGlvKSB7XHJcbiAgICAgICAgICAgIC8vIFdpbmRvdyBpcyB3aWRlciB0aGFuIHRhcmdldCBhc3BlY3QgcmF0aW8sIGhlaWdodCBpcyB0aGUgbGltaXRpbmcgZmFjdG9yXHJcbiAgICAgICAgICAgIG5ld0hlaWdodCA9IHdpbmRvd0hlaWdodDtcclxuICAgICAgICAgICAgbmV3V2lkdGggPSBuZXdIZWlnaHQgKiB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBXaW5kb3cgaXMgdGFsbGVyIChvciBleGFjdGx5KSB0aGUgdGFyZ2V0IGFzcGVjdCByYXRpbywgd2lkdGggaXMgdGhlIGxpbWl0aW5nIGZhY3RvclxyXG4gICAgICAgICAgICBuZXdXaWR0aCA9IHdpbmRvd1dpZHRoO1xyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSBuZXdXaWR0aCAvIHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2V0IHJlbmRlcmVyIHNpemUuIFRoZSB0aGlyZCBhcmd1bWVudCBgdXBkYXRlU3R5bGVgIGlzIGZhbHNlIGJlY2F1c2Ugd2UgbWFuYWdlIHN0eWxlIG1hbnVhbGx5LlxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2l6ZShuZXdXaWR0aCwgbmV3SGVpZ2h0LCBmYWxzZSk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuYXNwZWN0ID0gdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgdGhpcy5jYW1lcmEudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG5cclxuICAgICAgICAvLyBQb3NpdGlvbiBhbmQgc2l6ZSB0aGUgY2FudmFzIGVsZW1lbnQgdXNpbmcgQ1NTXHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLmNhbnZhcy5zdHlsZSwge1xyXG4gICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgb2JqZWN0Rml0OiAnY29udGFpbicgLy8gRW5zdXJlcyBjb250ZW50IGlzIHNjYWxlZCBhcHByb3ByaWF0ZWx5IGlmIHRoZXJlJ3MgYW55IG1pc21hdGNoXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIElmIHRoZSB0aXRsZSBzY3JlZW4gaXMgYWN0aXZlLCB1cGRhdGUgaXRzIHNpemUgYW5kIHBvc2l0aW9uIGFzIHdlbGwgdG8gbWF0Y2ggdGhlIGNhbnZhc1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuVElUTEUgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgICAgIGhlaWdodDogYCR7bmV3SGVpZ2h0fXB4YCxcclxuICAgICAgICAgICAgICAgIHRvcDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBUaGUgY3Jvc3NoYWlyIGFuZCBzY29yZSB0ZXh0IHdpbGwgYXV0b21hdGljYWxseSByZS1jZW50ZXIgZHVlIHRvIHRoZWlyICdhYnNvbHV0ZScgcG9zaXRpb25pbmdcclxuICAgICAgICAvLyBhbmQgJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScgcmVsYXRpdmUgdG8gdGhlIGNhbnZhcydzIG5ldyBwb3NpdGlvbi5cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgd2hpY2gga2V5cyBhcmUgY3VycmVudGx5IHByZXNzZWQgZG93bi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleURvd24oZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQua2V5LnRvTG93ZXJDYXNlKCldID0gdHJ1ZTtcclxuICAgICAgICAvLyBBRERFRDogSGFuZGxlIGp1bXAgaW5wdXQgb25seSB3aGVuIHBsYXlpbmcgYW5kIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGlmIChldmVudC5rZXkudG9Mb3dlckNhc2UoKSA9PT0gJyAnKSB7IC8vIFNwYWNlYmFyXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckp1bXAoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJlY29yZHMgd2hpY2gga2V5cyBhcmUgY3VycmVudGx5IHJlbGVhc2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpIHtcclxuICAgICAgICB0aGlzLmtleXNbZXZlbnQua2V5LnRvTG93ZXJDYXNlKCldID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIG1vdXNlIG1vdmVtZW50IGZvciBjYW1lcmEgcm90YXRpb24gKG1vdXNlIGxvb2spLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uTW91c2VNb3ZlKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgLy8gT25seSBwcm9jZXNzIG1vdXNlIG1vdmVtZW50IGlmIHRoZSBnYW1lIGlzIHBsYXlpbmcgYW5kIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WCA9IGV2ZW50Lm1vdmVtZW50WCB8fCAwO1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFkgPSBldmVudC5tb3ZlbWVudFkgfHwgMDtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGhvcml6b250YWwgcm90YXRpb24gKHlhdykgdG8gdGhlIGNhbWVyYUNvbnRhaW5lciBhcm91bmQgaXRzIGxvY2FsIFktYXhpcyAod2hpY2ggaXMgZ2xvYmFsIFkpXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnJvdGF0aW9uLnkgLT0gbW92ZW1lbnRYICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSB2ZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIHRvIHRoZSBjYW1lcmEgaXRzZWxmIGFuZCBjbGFtcCBpdFxyXG4gICAgICAgICAgICAvLyBNb3VzZSBVUCAobW92ZW1lbnRZIDwgMCkgbm93IGluY3JlYXNlcyBjYW1lcmFQaXRjaCAtPiBsb29rcyB1cC5cclxuICAgICAgICAgICAgLy8gTW91c2UgRE9XTiAobW92ZW1lbnRZID4gMCkgbm93IGRlY3JlYXNlcyBjYW1lcmFQaXRjaCAtPiBsb29rcyBkb3duLlxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVBpdGNoIC09IG1vdmVtZW50WSAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tb3VzZVNlbnNpdGl2aXR5OyBcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCA9IE1hdGgubWF4KC1NYXRoLlBJIC8gMiwgTWF0aC5taW4oTWF0aC5QSSAvIDIsIHRoaXMuY2FtZXJhUGl0Y2gpKTsgLy8gQ2xhbXAgdG8gLTkwIHRvICs5MCBkZWdyZWVzXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhLnJvdGF0aW9uLnggPSB0aGlzLmNhbWVyYVBpdGNoO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogSGFuZGxlcyBtb3VzZSBjbGljayBmb3IgZmlyaW5nIGJ1bGxldHMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZURvd24oZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQgJiYgZXZlbnQuYnV0dG9uID09PSAwKSB7IC8vIExlZnQgbW91c2UgYnV0dG9uXHJcbiAgICAgICAgICAgIHRoaXMuZmlyZUJ1bGxldCgpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogRmlyZXMgYSBidWxsZXQgZnJvbSB0aGUgcGxheWVyJ3MgY2FtZXJhIHBvc2l0aW9uIGFuZCBkaXJlY3Rpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgZmlyZUJ1bGxldCgpIHtcclxuICAgICAgICBjb25zdCBidWxsZXRDb25maWcgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0O1xyXG5cclxuICAgICAgICAvLyAxLiBHZXQgYnVsbGV0IGluaXRpYWwgcG9zaXRpb24gYW5kIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVdvcmxkUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkUG9zaXRpb24oY2FtZXJhV29ybGRQb3NpdGlvbik7XHJcblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVdvcmxkRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZERpcmVjdGlvbihjYW1lcmFXb3JsZERpcmVjdGlvbik7XHJcblxyXG4gICAgICAgIC8vIDIuIENyZWF0ZSBUaHJlZS5qcyBNZXNoIGZvciB0aGUgYnVsbGV0XHJcbiAgICAgICAgY29uc3QgYnVsbGV0TWVzaCA9IG5ldyBUSFJFRS5NZXNoKHRoaXMuYnVsbGV0R2VvbWV0cnksIHRoaXMuYnVsbGV0TWF0ZXJpYWxNZXNoKTtcclxuICAgICAgICBidWxsZXRNZXNoLnBvc2l0aW9uLmNvcHkoY2FtZXJhV29ybGRQb3NpdGlvbik7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQoYnVsbGV0TWVzaCk7XHJcblxyXG4gICAgICAgIC8vIDMuIENyZWF0ZSBDYW5ub24uanMgQm9keSBmb3IgdGhlIGJ1bGxldFxyXG4gICAgICAgIGNvbnN0IGJ1bGxldFNoYXBlID0gbmV3IENBTk5PTi5TcGhlcmUoYnVsbGV0Q29uZmlnLmRpbWVuc2lvbnMucmFkaXVzKTtcclxuICAgICAgICBjb25zdCBidWxsZXRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogYnVsbGV0Q29uZmlnLm1hc3MsXHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMoY2FtZXJhV29ybGRQb3NpdGlvbi54LCBjYW1lcmFXb3JsZFBvc2l0aW9uLnksIGNhbWVyYVdvcmxkUG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgIHNoYXBlOiBidWxsZXRTaGFwZSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIC8vIEJ1bGxldHMgc2hvdWxkIG5vdCBiZSBhZmZlY3RlZCBieSBwbGF5ZXIgbW92ZW1lbnQsIGJ1dCBzaG91bGQgaGF2ZSBncmF2aXR5XHJcbiAgICAgICAgICAgIGxpbmVhckRhbXBpbmc6IDAuMDEsIC8vIFNtYWxsIGRhbXBpbmcgdG8gcHJldmVudCBpbmZpbml0ZSBzbGlkaW5nXHJcbiAgICAgICAgICAgIGFuZ3VsYXJEYW1waW5nOiAwLjk5IC8vIEFsbG93cyBzb21lIHJvdGF0aW9uLCBidXQgc3RvcHMgcXVpY2tseVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBTZXQgYnVsbGV0IGluaXRpYWwgdmVsb2NpdHlcclxuICAgICAgICBidWxsZXRCb2R5LnZlbG9jaXR5LnNldChcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueCAqIGJ1bGxldENvbmZpZy5zcGVlZCxcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueSAqIGJ1bGxldENvbmZpZy5zcGVlZCxcclxuICAgICAgICAgICAgY2FtZXJhV29ybGREaXJlY3Rpb24ueiAqIGJ1bGxldENvbmZpZy5zcGVlZFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIFN0b3JlIGEgcmVmZXJlbmNlIHRvIHRoZSBhY3RpdmUgYnVsbGV0IG9iamVjdCBvbiB0aGUgYm9keSBmb3IgY29sbGlzaW9uIGNhbGxiYWNrXHJcbiAgICAgICAgY29uc3QgYWN0aXZlQnVsbGV0OiBBY3RpdmVCdWxsZXQgPSB7XHJcbiAgICAgICAgICAgIG1lc2g6IGJ1bGxldE1lc2gsXHJcbiAgICAgICAgICAgIGJvZHk6IGJ1bGxldEJvZHksXHJcbiAgICAgICAgICAgIGNyZWF0aW9uVGltZTogdGhpcy5sYXN0VGltZSAvIDEwMDAsIC8vIFN0b3JlIGNyZWF0aW9uIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgICAgICBmaXJlUG9zaXRpb246IGJ1bGxldEJvZHkucG9zaXRpb24uY2xvbmUoKSAvLyBTdG9yZSBpbml0aWFsIGZpcmUgcG9zaXRpb24gZm9yIHJhbmdlIGNoZWNrXHJcbiAgICAgICAgfTtcclxuICAgICAgICBhY3RpdmVCdWxsZXQuY29sbGlkZUhhbmRsZXIgPSAoZXZlbnQ6IENvbGxpZGVFdmVudCkgPT4gdGhpcy5vbkJ1bGxldENvbGxpZGUoZXZlbnQsIGFjdGl2ZUJ1bGxldCk7IC8vIFN0b3JlIHNwZWNpZmljIGhhbmRsZXJcclxuICAgICAgICBidWxsZXRCb2R5LnVzZXJEYXRhID0gYWN0aXZlQnVsbGV0OyAvLyBBdHRhY2ggdGhlIGFjdGl2ZUJ1bGxldCBvYmplY3QgdG8gdGhlIENhbm5vbi5Cb2R5XHJcblxyXG4gICAgICAgIGJ1bGxldEJvZHkuYWRkRXZlbnRMaXN0ZW5lcignY29sbGlkZScsIGFjdGl2ZUJ1bGxldC5jb2xsaWRlSGFuZGxlcik7IC8vIFVzZSB0aGUgc3RvcmVkIGhhbmRsZXJcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJ1bGxldEJvZHkpO1xyXG4gICAgICAgIHRoaXMuYnVsbGV0cy5wdXNoKGFjdGl2ZUJ1bGxldCk7XHJcblxyXG4gICAgICAgIC8vIFBsYXkgc2hvb3Qgc291bmRcclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ3Nob290X3NvdW5kJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiU2hvb3Qgc291bmQgcGxheSBkZW5pZWQ6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogSGFuZGxlcyBidWxsZXQgY29sbGlzaW9ucy5cclxuICAgICAqIEBwYXJhbSBldmVudCBUaGUgQ2Fubm9uLmpzIGNvbGxpc2lvbiBldmVudC5cclxuICAgICAqIEBwYXJhbSBidWxsZXQgVGhlIEFjdGl2ZUJ1bGxldCBpbnN0YW5jZSB0aGF0IGNvbGxpZGVkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uQnVsbGV0Q29sbGlkZShldmVudDogQ29sbGlkZUV2ZW50LCBidWxsZXQ6IEFjdGl2ZUJ1bGxldCkge1xyXG4gICAgICAgIC8vIElmIHRoZSBidWxsZXQgaGFzIGFscmVhZHkgYmVlbiByZW1vdmVkIG9yIG1hcmtlZCBmb3IgcmVtb3ZhbCwgZG8gbm90aGluZy5cclxuICAgICAgICBpZiAoIXRoaXMuYnVsbGV0cy5pbmNsdWRlcyhidWxsZXQpIHx8IGJ1bGxldC5zaG91bGRSZW1vdmUpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgY29sbGlkZWRCb2R5ID0gZXZlbnQuYm9keTsgLy8gVGhlIGJvZHkgdGhhdCB0aGUgYnVsbGV0IChldmVudC50YXJnZXQpIGNvbGxpZGVkIHdpdGhcclxuICAgICAgICBjb25zdCBvdGhlckJvZHlVc2VyRGF0YSA9IGNvbGxpZGVkQm9keS51c2VyRGF0YTsgLy8gUmV0cmlldmUgdXNlckRhdGEgZm9yIHRoZSBjb2xsaWRlZCBib2R5XHJcblxyXG4gICAgICAgIGNvbnN0IGlzR3JvdW5kID0gY29sbGlkZWRCb2R5ID09PSB0aGlzLmdyb3VuZEJvZHk7XHJcbiAgICAgICAgY29uc3QgaXNQbGFjZWRPYmplY3QgPSB0aGlzLnBsYWNlZE9iamVjdEJvZGllcy5pbmNsdWRlcyhjb2xsaWRlZEJvZHkpOyAvLyBTdGF0aWMgYm94ZXNcclxuXHJcbiAgICAgICAgLy8gTkVXOiBDaGVjayBpZiBjb2xsaWRlZCBib2R5IGlzIGFuIGVuZW15IGJ5IGNoZWNraW5nIGl0cyB1c2VyRGF0YSBhbmQgdHlwZUNvbmZpZ1xyXG4gICAgICAgIGNvbnN0IGlzRW5lbXkgPSBvdGhlckJvZHlVc2VyRGF0YSAmJiAob3RoZXJCb2R5VXNlckRhdGEgYXMgQWN0aXZlRW5lbXkpLnR5cGVDb25maWcgIT09IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgaWYgKGlzR3JvdW5kIHx8IGlzUGxhY2VkT2JqZWN0KSB7XHJcbiAgICAgICAgICAgIC8vIE1hcmsgYnVsbGV0IGZvciByZW1vdmFsIGluc3RlYWQgb2YgcmVtb3ZpbmcgaW1tZWRpYXRlbHlcclxuICAgICAgICAgICAgYnVsbGV0LnNob3VsZFJlbW92ZSA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmFkZChidWxsZXQpO1xyXG4gICAgICAgIH0gZWxzZSBpZiAoaXNFbmVteSkge1xyXG4gICAgICAgICAgICBjb25zdCBlbmVteSA9IG90aGVyQm9keVVzZXJEYXRhIGFzIEFjdGl2ZUVuZW15O1xyXG4gICAgICAgICAgICBpZiAoIWVuZW15LnNob3VsZFJlbW92ZSkgeyAvLyBEb24ndCBwcm9jZXNzIGhpdHMgb24gZW5lbWllcyBhbHJlYWR5IG1hcmtlZCBmb3IgcmVtb3ZhbFxyXG4gICAgICAgICAgICAgICAgZW5lbXkuY3VycmVudEhlYWx0aC0tO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdoaXRfc291bmQnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJIaXQgc291bmQgcGxheSBkZW5pZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBFbmVteSAke2VuZW15Lm5hbWV9IGhpdCEgSGVhbHRoOiAke2VuZW15LmN1cnJlbnRIZWFsdGh9YCk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGVuZW15LmN1cnJlbnRIZWFsdGggPD0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGVuZW15LnNob3VsZFJlbW92ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbmVtaWVzVG9SZW1vdmUuYWRkKGVuZW15KTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNjb3JlICs9IGVuZW15LnR5cGVDb25maWcuc2NvcmVWYWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVNjb3JlRGlzcGxheSgpOyAvLyBVcGRhdGUgc2NvcmUgVUlcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2VuZW15X2RlYXRoX3NvdW5kJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiRW5lbXkgZGVhdGggc291bmQgcGxheSBkZW5pZWQ6XCIsIGUpKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRW5lbXkgJHtlbmVteS5uYW1lfSBkZWZlYXRlZCEgU2NvcmU6ICR7dGhpcy5zY29yZX1gKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBCdWxsZXQgYWx3YXlzIGRpc2FwcGVhcnMgb24gaGl0dGluZyBhbiBlbmVteVxyXG4gICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRzVG9SZW1vdmUuYWRkKGJ1bGxldCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBJdGVyYXRlcyB0aHJvdWdoIGJ1bGxldHMgdG8gbWFyayB0aGVtIGZvciByZW1vdmFsIGJhc2VkIG9uIGxpZmV0aW1lLCByYW5nZSwgb3Igb3V0LW9mLWJvdW5kcy5cclxuICAgICAqIEFjdHVhbCByZW1vdmFsIGlzIGRlZmVycmVkIHRvIGBwZXJmb3JtQnVsbGV0UmVtb3ZhbHNgLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZUJ1bGxldHMoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHRoaXMubGFzdFRpbWUgLyAxMDAwOyAvLyBDdXJyZW50IHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIGNvbnN0IGhhbGZHcm91bmRTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyAyO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldENvbmZpZyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQ7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5idWxsZXRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IHRoaXMuYnVsbGV0c1tpXTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIGFscmVhZHkgbWFya2VkIGZvciByZW1vdmFsIGJ5IGNvbGxpc2lvbiBvciBwcmV2aW91cyBjaGVjaywgc2tpcCBmdXJ0aGVyIHByb2Nlc3NpbmcgZm9yIHRoaXMgYnVsbGV0IHRoaXMgZnJhbWUuXHJcbiAgICAgICAgICAgIGlmIChidWxsZXQuc2hvdWxkUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgbGlmZXRpbWVcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRUaW1lIC0gYnVsbGV0LmNyZWF0aW9uVGltZSA+IGJ1bGxldENvbmZpZy5saWZldGltZSkge1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0LnNob3VsZFJlbW92ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5hZGQoYnVsbGV0KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBvdXRzaWRlIG1hcCBib3VuZGFyaWVzIG9yIGlmIGl0IHdlbnQgdG9vIGZhciBmcm9tIGl0cyBmaXJpbmcgcG9pbnRcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0UG9zID0gYnVsbGV0LmJvZHkucG9zaXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlVG9GaXJlUG9pbnQgPSBidWxsZXRQb3MuZGlzdGFuY2VUbyhidWxsZXQuZmlyZVBvc2l0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy54ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnggPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy56ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnogPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGRpc3RhbmNlVG9GaXJlUG9pbnQgPiBidWxsZXRDb25maWcubWF4UmFuZ2UgfHxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy55IDwgLTEwIC8vIElmIGl0IGZhbGxzIHZlcnkgZmFyIGJlbG93IHRoZSBncm91bmRcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmFkZChidWxsZXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBQZXJmb3JtcyB0aGUgYWN0dWFsIHJlbW92YWwgb2YgYnVsbGV0cyBtYXJrZWQgZm9yIHJlbW92YWwuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYWZ0ZXIgdGhlIHBoeXNpY3Mgc3RlcCB0byBhdm9pZCBtb2RpZnlpbmcgdGhlIHdvcmxkIGR1cmluZyBwaHlzaWNzIGNhbGN1bGF0aW9ucy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwZXJmb3JtQnVsbGV0UmVtb3ZhbHMoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBidWxsZXRUb1JlbW92ZSBvZiB0aGlzLmJ1bGxldHNUb1JlbW92ZSkge1xyXG4gICAgICAgICAgICAvLyBSZW1vdmUgZnJvbSBUaHJlZS5qcyBzY2VuZVxyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShidWxsZXRUb1JlbW92ZS5tZXNoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIENhbm5vbi5qcyB3b3JsZFxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYnVsbGV0VG9SZW1vdmUuYm9keSk7XHJcblxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgZXZlbnQgbGlzdGVuZXJcclxuICAgICAgICAgICAgaWYgKGJ1bGxldFRvUmVtb3ZlLmNvbGxpZGVIYW5kbGVyKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXRUb1JlbW92ZS5ib2R5LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NvbGxpZGUnLCBidWxsZXRUb1JlbW92ZS5jb2xsaWRlSGFuZGxlcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIHRoZSBhY3RpdmUgYnVsbGV0cyBhcnJheVxyXG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuYnVsbGV0cy5pbmRleE9mKGJ1bGxldFRvUmVtb3ZlKTtcclxuICAgICAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQ2xlYXIgdGhlIHNldCBmb3IgdGhlIG5leHQgZnJhbWVcclxuICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5jbGVhcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBVcGRhdGVzIGVuZW15IG1vdmVtZW50IGxvZ2ljIChjYWxjdWxhdGVzIHZlbG9jaXR5IGFuZCByb3RhdGlvbikuXHJcbiAgICAgKiBUaGUgYWN0dWFsIG1lc2ggc3luY2hyb25pemF0aW9uIGhhcHBlbnMgaW4gc3luY01lc2hlc1dpdGhCb2RpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlRW5lbWllcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICghdGhpcy5wbGF5ZXJCb2R5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllclBvcyA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbjtcclxuICAgICAgICBjb25zdCBoYWxmR3JvdW5kU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gMjtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBlbmVteSBvZiB0aGlzLmVuZW1pZXMpIHtcclxuICAgICAgICAgICAgaWYgKGVuZW15LnNob3VsZFJlbW92ZSkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15UG9zID0gZW5lbXkuYm9keS5wb3NpdGlvbjtcclxuXHJcbiAgICAgICAgICAgIC8vIENsYW1wIGVuZW15IHBvc2l0aW9uIHdpdGhpbiBncm91bmQgYm91bmRhcmllcyAqYmVmb3JlKiBtb3ZlbWVudCB0byBhdm9pZCBnZXR0aW5nIHN0dWNrIG91dHNpZGVcclxuICAgICAgICAgICAgLy8gVGhpcyBwcmV2ZW50cyBlbmVtaWVzIGZyb20gd2FuZGVyaW5nIG9mZiB0aGUgbWFwIG9yIGJlaW5nIHB1c2hlZCB0b28gZmFyLlxyXG4gICAgICAgICAgICBjb25zdCBoYWxmV2lkdGggPSBlbmVteS50eXBlQ29uZmlnLmRpbWVuc2lvbnMud2lkdGggLyAyO1xyXG4gICAgICAgICAgICBjb25zdCBoYWxmRGVwdGggPSBlbmVteS50eXBlQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGggLyAyO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGVuZW15UG9zLnggPiBoYWxmR3JvdW5kU2l6ZSAtIGhhbGZXaWR0aCkgeyBlbmVteS5ib2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZSAtIGhhbGZXaWR0aDsgaWYgKGVuZW15LmJvZHkudmVsb2NpdHkueCA+IDApIGVuZW15LmJvZHkudmVsb2NpdHkueCA9IDA7IH1cclxuICAgICAgICAgICAgZWxzZSBpZiAoZW5lbXlQb3MueCA8IC1oYWxmR3JvdW5kU2l6ZSArIGhhbGZXaWR0aCkgeyBlbmVteS5ib2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemUgKyBoYWxmV2lkdGg7IGlmIChlbmVteS5ib2R5LnZlbG9jaXR5LnggPCAwKSBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSAwOyB9XHJcblxyXG4gICAgICAgICAgICBpZiAoZW5lbXlQb3MueiA+IGhhbGZHcm91bmRTaXplIC0gaGFsZkRlcHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueiA9IGhhbGZHcm91bmRTaXplIC0gaGFsZkRlcHRoOyBpZiAoZW5lbXkuYm9keS52ZWxvY2l0eS56ID4gMCkgZW5lbXkuYm9keS52ZWxvY2l0eS56ID0gMDsgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChlbmVteVBvcy56IDwgLWhhbGZHcm91bmRTaXplICsgaGFsZkRlcHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueiA9IC1oYWxmR3JvdW5kU2l6ZSArIGhhbGZEZXB0aDsgaWYgKGVuZW15LmJvZHkudmVsb2NpdHkueiA8IDApIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IDA7IH1cclxuXHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBkaXJlY3Rpb24gdG93YXJkcyBwbGF5ZXIgKGZsYXR0ZW5lZCB0byBYWiBwbGFuZSlcclxuICAgICAgICAgICAgY29uc3QgZGlyZWN0aW9uID0gbmV3IENBTk5PTi5WZWMzKCk7XHJcbiAgICAgICAgICAgIHBsYXllclBvcy52c3ViKGVuZW15UG9zLCBkaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBkaXJlY3Rpb24ueSA9IDA7IC8vIE9ubHkgY29uc2lkZXIgaG9yaXpvbnRhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICBkaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgZW5lbXkgdmVsb2NpdHkgYmFzZWQgb24gZGlyZWN0aW9uIGFuZCBzcGVlZFxyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSBkaXJlY3Rpb24ueCAqIGVuZW15LnR5cGVDb25maWcuc3BlZWQ7XHJcbiAgICAgICAgICAgIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IGRpcmVjdGlvbi56ICogZW5lbXkudHlwZUNvbmZpZy5zcGVlZDtcclxuICAgICAgICAgICAgLy8gZW5lbXkuYm9keS52ZWxvY2l0eS55IGlzIG1hbmFnZWQgYnkgZ3Jhdml0eSwgc28gd2UgZG9uJ3QgbW9kaWZ5IGl0IGhlcmUuXHJcblxyXG4gICAgICAgICAgICAvLyBNYWtlIGVuZW15IGxvb2sgYXQgdGhlIHBsYXllciAoeWF3IG9ubHkpXHJcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFJvdGF0aW9uWSA9IE1hdGguYXRhbjIoZGlyZWN0aW9uLngsIGRpcmVjdGlvbi56KTsgLy8gQW5nbGUgaW4gcmFkaWFuc1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50UXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKGVuZW15LmJvZHkucXVhdGVybmlvbi54LCBlbmVteS5ib2R5LnF1YXRlcm5pb24ueSwgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLnosIGVuZW15LmJvZHkucXVhdGVybmlvbi53KTtcclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbUF4aXNBbmdsZShcclxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApLFxyXG4gICAgICAgICAgICAgICAgdGFyZ2V0Um90YXRpb25ZXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIC8vIFNtb290aCByb3RhdGlvbiBmb3IgcGh5c2ljcyBib2R5XHJcbiAgICAgICAgICAgIGNvbnN0IHNsZXJwZWRRdWF0ZXJuaW9uID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKTtcclxuICAgICAgICAgICAgc2xlcnBlZFF1YXRlcm5pb24uc2xlcnBRdWF0ZXJuaW9ucyhjdXJyZW50UXVhdGVybmlvbiwgdGFyZ2V0UXVhdGVybmlvbiwgMC4xKTsgLy8gU21vb3RoIGZhY3RvciAwLjFcclxuICAgICAgICAgICAgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLmNvcHkoc2xlcnBlZFF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBDQU5OT04uUXVhdGVybmlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBQZXJmb3JtcyB0aGUgYWN0dWFsIHJlbW92YWwgb2YgZW5lbWllcyBtYXJrZWQgZm9yIHJlbW92YWwuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYWZ0ZXIgdGhlIHBoeXNpY3Mgc3RlcC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwZXJmb3JtRW5lbXlSZW1vdmFscygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGVuZW15VG9SZW1vdmUgb2YgdGhpcy5lbmVtaWVzVG9SZW1vdmUpIHtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoZW5lbXlUb1JlbW92ZS5tZXNoKTtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGVuZW15VG9SZW1vdmUuYm9keSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuZW5lbWllcy5pbmRleE9mKGVuZW15VG9SZW1vdmUpO1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmVuZW1pZXNUb1JlbW92ZS5jbGVhcigpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBvaW50ZXIgbG9jayBzdGF0dXMgd2hlbiBpdCBjaGFuZ2VzIChlLmcuLCB1c2VyIHByZXNzZXMgRXNjKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrQ2hhbmdlKCkge1xyXG4gICAgICAgIGlmIChkb2N1bWVudC5wb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLm1velBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkud2Via2l0UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyIGxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBTaG93IGNyb3NzaGFpciBvbmx5IGlmIGdhbWUgaXMgcGxheWluZyBBTkQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICAgICAgaWYgKHRoaXMuY3Jvc3NoYWlyRWxlbWVudCAmJiB0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jcm9zc2hhaXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgdW5sb2NrZWQnKTtcclxuICAgICAgICAgICAgLy8gSGlkZSBjcm9zc2hhaXIgd2hlbiBwb2ludGVyIGlzIHVubG9ja2VkXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmNyb3NzaGFpckVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3Jvc3NoYWlyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFuaW1hdGUodGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7IC8vIFJlcXVlc3QgbmV4dCBmcmFtZVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ2FsY3VsYXRlIGRlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBVcGRhdGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gaW5wdXRcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVCdWxsZXRzKGRlbHRhVGltZSk7IC8vIE5FVzogTWFyayBidWxsZXRzIGZvciByZW1vdmFsXHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRW5lbWllcyhkZWx0YVRpbWUpOyAvLyBORVc6IFVwZGF0ZSBlbmVteSBtb3ZlbWVudFxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lKTsgLy8gU3RlcCB0aGUgcGh5c2ljcyB3b3JsZFxyXG4gICAgICAgICAgICB0aGlzLnBlcmZvcm1CdWxsZXRSZW1vdmFscygpOyAvLyBORVc6IFBlcmZvcm0gYWN0dWFsIGJ1bGxldCByZW1vdmFscyAqYWZ0ZXIqIHBoeXNpY3Mgc3RlcFxyXG4gICAgICAgICAgICB0aGlzLnBlcmZvcm1FbmVteVJlbW92YWxzKCk7IC8vIE5FVzogUGVyZm9ybSBhY3R1YWwgZW5lbXkgcmVtb3ZhbHMgKmFmdGVyKiBwaHlzaWNzIHN0ZXBcclxuICAgICAgICAgICAgdGhpcy5jbGFtcFBsYXllclBvc2l0aW9uKCk7IC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBwcmV2ZW50IGdvaW5nIGJleW9uZCBncm91bmQgZWRnZXNcclxuICAgICAgICAgICAgdGhpcy5zeW5jTWVzaGVzV2l0aEJvZGllcygpOyAvLyBTeW5jaHJvbml6ZSB2aXN1YWwgbWVzaGVzIHdpdGggcGh5c2ljcyBib2RpZXNcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTsgLy8gUmVuZGVyIHRoZSBzY2VuZVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3RlcHMgdGhlIENhbm5vbi5qcyBwaHlzaWNzIHdvcmxkIGZvcndhcmQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGh5c2ljcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIC8vIHdvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCBtYXhTdWJTdGVwcylcclxuICAgICAgICAvLyAxLzYwOiBBIGZpeGVkIHRpbWUgc3RlcCBvZiA2MCBwaHlzaWNzIHVwZGF0ZXMgcGVyIHNlY29uZCAoc3RhbmRhcmQpLlxyXG4gICAgICAgIC8vIGRlbHRhVGltZTogVGhlIGFjdHVhbCB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgcmVuZGVyIGZyYW1lLlxyXG4gICAgICAgIC8vIG1heFBoeXNpY3NTdWJTdGVwczogTGltaXRzIHRoZSBudW1iZXIgb2YgcGh5c2ljcyBzdGVwcyBpbiBvbmUgcmVuZGVyIGZyYW1lXHJcbiAgICAgICAgLy8gdG8gcHJldmVudCBpbnN0YWJpbGl0aWVzIGlmIHJlbmRlcmluZyBzbG93cyBkb3duIHNpZ25pZmljYW50bHkuXHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubWF4UGh5c2ljc1N1YlN0ZXBzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIFdBU0QgaW5wdXQgYW5kIGNhbWVyYSBvcmllbnRhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJNb3ZlbWVudCgpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgbW92ZW1lbnQgc2hvdWxkIG9ubHkgaGFwcGVuIHdoZW4gdGhlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICAvLyBJZiBwb2ludGVyIGlzIG5vdCBsb2NrZWQsIHN0b3AgaG9yaXpvbnRhbCBtb3ZlbWVudCBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBFeGl0IGVhcmx5IGFzIG5vIG1vdmVtZW50IGlucHV0IHNob3VsZCBiZSBwcm9jZXNzZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlZmZlY3RpdmVQbGF5ZXJTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IEFwcGx5IGFpciBjb250cm9sIGZhY3RvciBpZiBwbGF5ZXIgaXMgaW4gdGhlIGFpciAobm8gY29udGFjdHMgd2l0aCBhbnkgc3RhdGljIHN1cmZhY2UpXHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgZWZmZWN0aXZlUGxheWVyU3BlZWQgKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckFpckNvbnRyb2xGYWN0b3I7IC8vIFVzZSBjb25maWd1cmFibGUgYWlyIGNvbnRyb2wgZmFjdG9yXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRZVmVsb2NpdHkgPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueTsgLy8gUHJlc2VydmUgdmVydGljYWwgdmVsb2NpdHlcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtb3ZlRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMCk7IC8vIFVzZSBhIFRIUkVFLlZlY3RvcjMgZm9yIGNhbGN1bGF0aW9uIGVhc2VcclxuXHJcbiAgICAgICAgLy8gR2V0IGNhbWVyYUNvbnRhaW5lcidzIGZvcndhcmQgdmVjdG9yIChob3Jpem9udGFsIGRpcmVjdGlvbiBwbGF5ZXIgaXMgbG9va2luZylcclxuICAgICAgICBjb25zdCBjYW1lcmFEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmdldFdvcmxkRGlyZWN0aW9uKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLnkgPSAwOyAvLyBGbGF0dGVuIHRoZSB2ZWN0b3IgdG8gcmVzdHJpY3QgbW92ZW1lbnQgdG8gdGhlIGhvcml6b250YWwgcGxhbmVcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFVwID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCk7IC8vIERlZmluZSBnbG9iYWwgdXAgdmVjdG9yIGZvciBjcm9zcyBwcm9kdWN0XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgJ3JpZ2h0JyB2ZWN0b3IgcmVsYXRpdmUgdG8gY2FtZXJhJ3MgZm9yd2FyZCBkaXJlY3Rpb25cclxuICAgICAgICBjb25zdCBjYW1lcmFSaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgY2FtZXJhUmlnaHQuY3Jvc3NWZWN0b3JzKGdsb2JhbFVwLCBjYW1lcmFEaXJlY3Rpb24pLm5vcm1hbGl6ZSgpOyBcclxuXHJcbiAgICAgICAgbGV0IG1vdmluZyA9IGZhbHNlO1xyXG4gICAgICAgIC8vIFcgPC0+IFMgc3dhcCBmcm9tIHVzZXIncyBjb21tZW50cyBpbiBvcmlnaW5hbCBjb2RlOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3MnXSkgeyAvLyAncycga2V5IG5vdyBtb3ZlcyBmb3J3YXJkXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3cnXSkgeyAvLyAndycga2V5IG5vdyBtb3ZlcyBiYWNrd2FyZFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBIGFuZCBEIGNvbnRyb2xzIGFzIHN0YW5kYXJkOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2EnXSkgeyAvLyAnYScga2V5IG5vdyBzdHJhZmVzIGxlZnRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snZCddKSB7IC8vICdkJyBrZXkgbm93IHN0cmFmZXMgcmlnaHRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5hZGQoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChtb3ZpbmcpIHtcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5ub3JtYWxpemUoKS5tdWx0aXBseVNjYWxhcihlZmZlY3RpdmVQbGF5ZXJTcGVlZCk7XHJcbiAgICAgICAgICAgIC8vIERpcmVjdGx5IHNldCB0aGUgaG9yaXpvbnRhbCB2ZWxvY2l0eSBjb21wb25lbnRzLlxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IG1vdmVEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBtb3ZlRGlyZWN0aW9uLno7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSWYgbm8gbW92ZW1lbnQga2V5cyBhcmUgcHJlc3NlZDpcclxuICAgICAgICAgICAgLy8gTU9ESUZJRUQ6IEFwcGx5IGFpciBkZWNlbGVyYXRpb24gaWYgcGxheWVyIGlzIGluIHRoZSBhaXJcclxuICAgICAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyRGVjZWxlcmF0aW9uO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gUGxheWVyIGlzIG9uIHRoZSBncm91bmQgb3IgYSBzdGF0aWMgb2JqZWN0OiBDYW5ub24uanMgQ29udGFjdE1hdGVyaWFsIGZyaWN0aW9uIHdpbGwgaGFuZGxlIGRlY2VsZXJhdGlvbi5cclxuICAgICAgICAgICAgICAgIC8vIE5vIGV4cGxpY2l0IHZlbG9jaXR5IGRlY2F5IGlzIGFwcGxpZWQgaGVyZSBmb3IgZ3JvdW5kIG1vdmVtZW50LlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gY3VycmVudFlWZWxvY2l0eTsgLy8gUmVzdG9yZSBZIHZlbG9jaXR5IChncmF2aXR5L2p1bXBzKVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQURERUQ6IEFwcGxpZXMgYW4gdXB3YXJkIGltcHVsc2UgdG8gdGhlIHBsYXllciBib2R5IGZvciBqdW1waW5nLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHBsYXllckp1bXAoKSB7XHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IE9ubHkgYWxsb3cganVtcCBpZiB0aGUgcGxheWVyIGlzIGN1cnJlbnRseSBvbiBhbnkgc3RhdGljIHN1cmZhY2UgKGdyb3VuZCBvciBvYmplY3QpXHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIENsZWFyIGFueSBleGlzdGluZyB2ZXJ0aWNhbCB2ZWxvY2l0eSB0byBlbnN1cmUgYSBjb25zaXN0ZW50IGp1bXAgaGVpZ2h0XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gMDsgXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGFuIHVwd2FyZCBpbXB1bHNlIChtYXNzICogY2hhbmdlX2luX3ZlbG9jaXR5KVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkuYXBwbHlJbXB1bHNlKFxyXG4gICAgICAgICAgICAgICAgbmV3IENBTk5PTi5WZWMzKDAsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5qdW1wRm9yY2UsIDApLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIC8vIEFwcGx5IGltcHVsc2UgYXQgdGhlIGNlbnRlciBvZiBtYXNzXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xhbXBzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbiB3aXRoaW4gdGhlIGRlZmluZWQgZ3JvdW5kIGJvdW5kYXJpZXMuXHJcbiAgICAgKiBQcmV2ZW50cyB0aGUgcGxheWVyIGZyb20gbW92aW5nIGJleW9uZCB0aGUgJ2VuZCBvZiB0aGUgd29ybGQnLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNsYW1wUGxheWVyUG9zaXRpb24oKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllckJvZHkgfHwgIXRoaXMuY29uZmlnKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGhhbGZHcm91bmRTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyAyO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckhhbGZXaWR0aCA9IDAuNTsgLy8gRnJvbSBCb3hHZW9tZXRyeSgxLDIsMSkgaGFsZiBleHRlbnRzIGZvciBDYW5ub24uanNcclxuXHJcbiAgICAgICAgbGV0IHBvc1ggPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueDtcclxuICAgICAgICBsZXQgcG9zWiA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56O1xyXG4gICAgICAgIGxldCB2ZWxYID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lng7XHJcbiAgICAgICAgbGV0IHZlbFogPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkuejtcclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgWCBwb3NpdGlvblxyXG4gICAgICAgIGlmIChwb3NYID4gaGFsZkdyb3VuZFNpemUgLSBwbGF5ZXJIYWxmV2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZSAtIHBsYXllckhhbGZXaWR0aDtcclxuICAgICAgICAgICAgaWYgKHZlbFggPiAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ggPCAtaGFsZkdyb3VuZFNpemUgKyBwbGF5ZXJIYWxmV2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemUgKyBwbGF5ZXJIYWxmV2lkdGg7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYIDwgMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCBaIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKHBvc1ogPiBoYWxmR3JvdW5kU2l6ZSAtIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IGhhbGZHcm91bmRTaXplIC0gcGxheWVySGFsZldpZHRoO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA+IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAocG9zWiA8IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aDtcclxuICAgICAgICAgICAgaWYgKHZlbFogPCAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW5jaHJvbml6ZXMgdGhlIHZpc3VhbCBtZXNoZXMgd2l0aCB0aGVpciBjb3JyZXNwb25kaW5nIHBoeXNpY3MgYm9kaWVzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN5bmNNZXNoZXNXaXRoQm9kaWVzKCkge1xyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIHBvc2l0aW9uIHdpdGggaXRzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHdpdGggdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcblxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIGhvcml6b250YWwgcm90YXRpb24gKHlhdykgd2l0aCBjYW1lcmFDb250YWluZXIncyB5YXcuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnF1YXRlcm5pb24uY29weSh0aGlzLmNhbWVyYUNvbnRhaW5lci5xdWF0ZXJuaW9uKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIGdyb3VuZCBhbmQgcGxhY2VkIG9iamVjdHMgYXJlIGN1cnJlbnRseSBzdGF0aWMgKG1hc3MgMCksIHNvIHRoZWlyIHZpc3VhbCBtZXNoZXNcclxuICAgICAgICAvLyBkbyBub3QgbmVlZCB0byBiZSBzeW5jaHJvbml6ZWQgd2l0aCB0aGVpciBwaHlzaWNzIGJvZGllcyBhZnRlciBpbml0aWFsIHBsYWNlbWVudC5cclxuICAgICAgICBcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBidWxsZXQgbWVzaGVzIHdpdGggdGhlaXIgcGh5c2ljcyBib2RpZXNcclxuICAgICAgICBmb3IgKGNvbnN0IGJ1bGxldCBvZiB0aGlzLmJ1bGxldHMpIHtcclxuICAgICAgICAgICAgaWYgKCFidWxsZXQuc2hvdWxkUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQubWVzaC5wb3NpdGlvbi5jb3B5KGJ1bGxldC5ib2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQubWVzaC5xdWF0ZXJuaW9uLmNvcHkoYnVsbGV0LmJvZHkucXVhdGVybmlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlF1YXRlcm5pb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBORVc6IFN5bmNocm9uaXplIGVuZW15IG1lc2hlcyB3aXRoIHRoZWlyIHBoeXNpY3MgYm9kaWVzXHJcbiAgICAgICAgZm9yIChjb25zdCBlbmVteSBvZiB0aGlzLmVuZW1pZXMpIHtcclxuICAgICAgICAgICAgaWYgKCFlbmVteS5zaG91bGRSZW1vdmUpIHtcclxuICAgICAgICAgICAgICAgIGVuZW15Lm1lc2gucG9zaXRpb24uY29weShlbmVteS5ib2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgICAgICAgICBlbmVteS5tZXNoLnF1YXRlcm5pb24uY29weShlbmVteS5ib2R5LnF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBUSFJFRS5RdWF0ZXJuaW9uKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gU3RhcnQgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGNvbnRlbnQgaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBuZXcgR2FtZSgpO1xyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBb0J4QixJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBRkMsU0FBQUE7QUFBQSxHQUFBO0FBcUdMLE1BQU0sS0FBSztBQUFBLEVBbUVQLGNBQWM7QUFqRWQ7QUFBQSxTQUFRLFFBQW1CO0FBMkIzQjtBQUFBLFNBQVEscUJBQW1DLENBQUM7QUFDNUMsU0FBUSxxQkFBb0MsQ0FBQztBQUc3QztBQUFBLFNBQVEsVUFBMEIsQ0FBQztBQUNuQyxTQUFRLGtCQUFxQyxvQkFBSSxJQUFJO0FBS3JEO0FBQUE7QUFBQSxTQUFRLFVB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
