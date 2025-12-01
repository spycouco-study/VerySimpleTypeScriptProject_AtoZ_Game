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
        if (otherBody && otherBody.mass === 0) {
          this.numContactsWithStaticSurfaces++;
        }
      }
    });
    this.world.addEventListener("endContact", (event) => {
      let bodyA = event.bodyA;
      let bodyB = event.bodyB;
      if (bodyA === this.playerBody || bodyB === this.playerBody) {
        const otherBody = bodyA === this.playerBody ? bodyB : bodyA;
        if (otherBody && otherBody.mass === 0) {
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
          enemy.body.sleep();
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEFkZCBtb2R1bGUgYXVnbWVudGF0aW9uIGZvciBDQU5OT04uQm9keSB0byBpbmNsdWRlIHVzZXJEYXRhIGZvciBib3RoIGJ1bGxldHMgYW5kIGVuZW1pZXNcclxuZGVjbGFyZSBtb2R1bGUgJ2Nhbm5vbi1lcycge1xyXG4gICAgaW50ZXJmYWNlIEJvZHkge1xyXG4gICAgICAgIHVzZXJEYXRhPzogQWN0aXZlQnVsbGV0IHwgQWN0aXZlRW5lbXk7IC8vIEF0dGFjaCB0aGUgQWN0aXZlQnVsbGV0IG9yIEFjdGl2ZUVuZW15IGluc3RhbmNlXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIERlZmluZSBpbnRlcmZhY2UgZm9yIHRoZSBDYW5ub24tZXMgJ2NvbGxpZGUnIGV2ZW50XHJcbmludGVyZmFjZSBDb2xsaWRlRXZlbnQge1xyXG4gICAgLy8gVGhlIHR5cGUgcHJvcGVydHkgaXMgdXN1YWxseSBwcmVzZW50IG9uIGFsbCBDYW5ub24uanMgZXZlbnRzXHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICAvLyBUaGUgJ2NvbGxpZGUnIGV2ZW50IHNwZWNpZmljYWxseSBoYXMgdGhlc2UgcHJvcGVydGllczpcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5OyAvLyBUaGUgb3RoZXIgYm9keSBpbnZvbHZlZCBpbiB0aGUgY29sbGlzaW9uXHJcbiAgICB0YXJnZXQ6IENBTk5PTi5Cb2R5OyAvLyBUaGUgYm9keSB0aGF0IHRoZSBldmVudCBsaXN0ZW5lciBpcyBhdHRhY2hlZCB0byAoZS5nLiwgdGhlIGJ1bGxldEJvZHkpXHJcbiAgICBjb250YWN0OiBDQU5OT04uQ29udGFjdEVxdWF0aW9uOyAvLyBUaGUgY29udGFjdCBlcXVhdGlvbiBvYmplY3RcclxufVxyXG5cclxuLy8gRW51bSB0byBkZWZpbmUgdGhlIHBvc3NpYmxlIHN0YXRlcyBvZiB0aGUgZ2FtZVxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSwgICAvLyBUaXRsZSBzY3JlZW4sIHdhaXRpbmcgZm9yIHVzZXIgaW5wdXRcclxuICAgIFBMQVlJTkcgIC8vIEdhbWUgaXMgYWN0aXZlLCB1c2VyIGNhbiBtb3ZlIGFuZCBsb29rIGFyb3VuZFxyXG59XHJcblxyXG4vLyBJbnRlcmZhY2UgZm9yIHN0YXRpYyBvYmplY3RzIChib3hlcykgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkT2JqZWN0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZzsgLy8gQSBkZXNjcmlwdGl2ZSBuYW1lIGZvciB0aGUgb2JqZWN0IGluc3RhbmNlXHJcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBOYW1lIG9mIHRoZSB0ZXh0dXJlIGZyb20gYXNzZXRzLmltYWdlc1xyXG4gICAgdHlwZTogJ2JveCc7IC8vIEV4cGxpY2l0bHkgJ2JveCdcclxuICAgIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcclxuICAgIGRpbWVuc2lvbnM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGRlcHRoOiBudW1iZXIgfTtcclxuICAgIHJvdGF0aW9uWT86IG51bWJlcjsgLy8gT3B0aW9uYWwgcm90YXRpb24gYXJvdW5kIFktYXhpcyAocmFkaWFucylcclxuICAgIG1hc3M6IG51bWJlcjsgLy8gMCBmb3Igc3RhdGljXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBlbmVteSB0eXBlIGRlZmluaXRpb25zIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBFbmVteVR5cGVDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nOyAvLyBlLmcuLCBcImJhc2ljX2VuZW15XCJcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBkZXB0aDogbnVtYmVyIH07XHJcbiAgICBtYXNzOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBzcGVjaWZpYyBlbmVteSBpbnN0YW5jZXMgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkRW5lbXlJbnN0YW5jZUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7IC8vIFVuaXF1ZSBpbnN0YW5jZSBuYW1lLCBlLmcuLCBcImVuZW15MVwiXHJcbiAgICBlbmVteVR5cGVOYW1lOiBzdHJpbmc7IC8vIFJlZmVyZW5jZSB0byBFbmVteVR5cGVDb25maWcubmFtZVxyXG4gICAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgcm90YXRpb25ZPzogbnVtYmVyOyAvLyBPcHRpb25hbCBpbml0aWFsIHJvdGF0aW9uXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBidWxsZXQgY29uZmlndXJhdGlvblxyXG5pbnRlcmZhY2UgQnVsbGV0Q29uZmlnIHtcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHJhZGl1czogbnVtYmVyOyB9OyAvLyBGb3IgYSBzcGhlcmUgYnVsbGV0XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgbWFzczogbnVtYmVyO1xyXG4gICAgbGlmZXRpbWU6IG51bWJlcjsgLy8gTWF4IHRpbWUgaW4gc2Vjb25kcyBiZWZvcmUgaXQgZGVzcGF3bnNcclxuICAgIG1heFJhbmdlOiBudW1iZXI7IC8vIE1heCBkaXN0YW5jZSBmcm9tIGZpcmUgcG9pbnQgYmVmb3JlIGl0IGRlc3Bhd25zXHJcbiAgICB2b2x1bWU6IG51bWJlcjsgLy8gU291bmQgdm9sdW1lXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyOyAgICAgICAgICAvLyBBRERFRDogRm9yY2UgYXBwbGllZCB3aGVuIGp1bXBpbmdcclxuICAgICAgICBzY29yZTogbnVtYmVyOyAgICAgICAgICAgICAgLy8gTkVXOiBJbml0aWFsIHNjb3JlXHJcbiAgICAgICAgZW5lbXlUeXBlczogRW5lbXlUeXBlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2YgZGlmZmVyZW50IGVuZW15IHRlbXBsYXRlc1xyXG4gICAgICAgIHN0YXRpY09iamVjdHM6IFBsYWNlZE9iamVjdENvbmZpZ1tdOyAvLyBORVc6IFJlbmFtZWQgZnJvbSBwbGFjZWRPYmplY3RzLCBvbmx5IHN0YXRpYyBib3hlc1xyXG4gICAgICAgIGVuZW15SW5zdGFuY2VzOiBQbGFjZWRFbmVteUluc3RhbmNlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2Ygc3BlY2lmaWMgZW5lbXkgcGxhY2VtZW50c1xyXG4gICAgICAgIC8vIE5FVzogQ29uZmlndXJhYmxlIHBoeXNpY3MgcHJvcGVydGllc1xyXG4gICAgICAgIHBsYXllckdyb3VuZEZyaWN0aW9uOiBudW1iZXI7ICAgICAgICAvLyBGcmljdGlvbiBjb2VmZmljaWVudCBmb3IgcGxheWVyLWdyb3VuZCBjb250YWN0XHJcbiAgICAgICAgcGxheWVyQWlyQ29udHJvbEZhY3RvcjogbnVtYmVyOyAgICAvLyBNdWx0aXBsaWVyIGZvciBwbGF5ZXJTcGVlZCB3aGVuIGFpcmJvcm5lXHJcbiAgICAgICAgcGxheWVyQWlyRGVjZWxlcmF0aW9uOiBudW1iZXI7ICAgICAvLyBEZWNheSBmYWN0b3IgZm9yIGhvcml6b250YWwgdmVsb2NpdHkgd2hlbiBhaXJib3JuZSBhbmQgbm90IG1vdmluZ1xyXG4gICAgICAgIGJ1bGxldDogQnVsbGV0Q29uZmlnOyAvLyBORVc6IEJ1bGxldCBjb25maWd1cmF0aW9uXHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBhbiBhY3RpdmUgYnVsbGV0IGluc3RhbmNlXHJcbmludGVyZmFjZSBBY3RpdmVCdWxsZXQge1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgY3JlYXRpb25UaW1lOiBudW1iZXI7IC8vIFVzZWQgZm9yIGxpZmV0aW1lIGNoZWNrXHJcbiAgICBmaXJlUG9zaXRpb246IENBTk5PTi5WZWMzOyAvLyBVc2VkIGZvciBtYXhSYW5nZSBjaGVja1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gTkVXOiBGbGFnIHRvIG1hcmsgZm9yIHJlbW92YWxcclxuICAgIGNvbGxpZGVIYW5kbGVyPzogKGV2ZW50OiBDb2xsaWRlRXZlbnQpID0+IHZvaWQ7IC8vIE5FVzogU3RvcmUgdGhlIHNwZWNpZmljIGhhbmRsZXIgZnVuY3Rpb25cclxufVxyXG5cclxuLy8gTkVXOiBJbnRlcmZhY2UgZm9yIGFuIGFjdGl2ZSBlbmVteSBpbnN0YW5jZSAocnVudGltZSBkYXRhKVxyXG5pbnRlcmZhY2UgQWN0aXZlRW5lbXkge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgdHlwZUNvbmZpZzogRW5lbXlUeXBlQ29uZmlnOyAvLyBSZWZlcmVuY2UgdG8gaXRzIHR5cGUgZGVmaW5pdGlvblxyXG4gICAgY3VycmVudEhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gRmxhZyB0byBtYXJrIGZvciByZW1vdmFsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgcHJpdmF0ZSBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmEhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXIhOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDsgLy8gVGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZm9yIHJlbmRlcmluZ1xyXG5cclxuICAgIC8vIE5ldzogQSBjb250YWluZXIgb2JqZWN0IGZvciB0aGUgY2FtZXJhIHRvIGhhbmRsZSBob3Jpem9udGFsIHJvdGF0aW9uIHNlcGFyYXRlbHkgZnJvbSB2ZXJ0aWNhbCBwaXRjaC5cclxuICAgIHByaXZhdGUgY2FtZXJhQ29udGFpbmVyITogVEhSRUUuT2JqZWN0M0Q7IFxyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSB3b3JsZCE6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBORVc6IENhbm5vbi1lcyBtYXRlcmlhbHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgcGxheWVyTWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBkZWZhdWx0T2JqZWN0TWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7IC8vIEFEREVEOiBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDsgLy8gTkVXOiBNYXRlcmlhbCBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBlbmVteU1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsOyAvLyBORVc6IE1hdGVyaWFsIGZvciBlbmVtaWVzXHJcblxyXG4gICAgLy8gVmlzdWFsIG1lc2hlcyAoVGhyZWUuanMpIGZvciBnYW1lIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgLy8gTkVXOiBBcnJheXMgdG8gaG9sZCByZWZlcmVuY2VzIHRvIGR5bmFtaWNhbGx5IHBsYWNlZCBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdE1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdEJvZGllczogQ0FOTk9OLkJvZHlbXSA9IFtdO1xyXG5cclxuICAgIC8vIE5FVzogQWN0aXZlIGJ1bGxldHNcclxuICAgIHByaXZhdGUgYnVsbGV0czogQWN0aXZlQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgYnVsbGV0c1RvUmVtb3ZlOiBTZXQ8QWN0aXZlQnVsbGV0PiA9IG5ldyBTZXQoKTsgLy8gTkVXOiBMaXN0IG9mIGJ1bGxldHMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG4gICAgcHJpdmF0ZSBidWxsZXRHZW9tZXRyeSE6IFRIUkVFLlNwaGVyZUdlb21ldHJ5OyAvLyBSZXVzYWJsZSBnZW9tZXRyeSBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbE1lc2ghOiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbDsgLy8gUmV1c2FibGUgbWF0ZXJpYWwgZm9yIGJ1bGxldHMgKHVzaW5nIEJhc2ljIHRvIHByZXZlbnQgbGlnaHRpbmcgaXNzdWVzIGZvciBzaW1wbGUgYnVsbGV0cylcclxuXHJcbiAgICAvLyBORVc6IEFjdGl2ZSBlbmVtaWVzXHJcbiAgICBwcml2YXRlIGVuZW1pZXM6IEFjdGl2ZUVuZW15W10gPSBbXTtcclxuICAgIHByaXZhdGUgZW5lbWllc1RvUmVtb3ZlOiBTZXQ8QWN0aXZlRW5lbXk+ID0gbmV3IFNldCgpOyAvLyBMaXN0IG9mIGVuZW1pZXMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG5cclxuICAgIC8vIElucHV0IGhhbmRsaW5nIHN0YXRlXHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307IC8vIFRyYWNrcyBjdXJyZW50bHkgcHJlc3NlZCBrZXlzXHJcbiAgICBwcml2YXRlIGlzUG9pbnRlckxvY2tlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUcnVlIGlmIG1vdXNlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICBwcml2YXRlIGNhbWVyYVBpdGNoOiBudW1iZXIgPSAwOyAvLyBWZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIG9mIHRoZSBjYW1lcmFcclxuXHJcbiAgICAvLyBBc3NldCBtYW5hZ2VtZW50XHJcbiAgICBwcml2YXRlIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCB0ZXh0dXJlc1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIGF1ZGlvIGVsZW1lbnRzXHJcblxyXG4gICAgLy8gVUkgZWxlbWVudHMgKGR5bmFtaWNhbGx5IGNyZWF0ZWQgZm9yIHRoZSB0aXRsZSBzY3JlZW4gYW5kIGdhbWUgb3ZlcmxheSlcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHNjb3JlVGV4dCE6IEhUTUxEaXZFbGVtZW50OyAvLyBORVc6IFVJIGVsZW1lbnQgZm9yIHNjb3JlXHJcbiAgICBwcml2YXRlIGNyb3NzaGFpckVsZW1lbnQhOiBIVE1MRGl2RWxlbWVudDsgLy8gTkVXOiBDcm9zc2hhaXIgVUkgZWxlbWVudFxyXG5cclxuICAgIC8vIEZvciBjYWxjdWxhdGluZyBkZWx0YSB0aW1lIGJldHdlZW4gZnJhbWVzXHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuXHJcbiAgICAvLyBNT0RJRklFRDogVHJhY2tzIHBsYXllciBjb250YWN0cyB3aXRoIEFOWSBzdGF0aWMgc3VyZmFjZSAoZ3JvdW5kIG9yIHBsYWNlZCBvYmplY3RzKSBmb3IganVtcGluZy9tb3ZlbWVudCBsb2dpY1xyXG4gICAgcHJpdmF0ZSBudW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlczogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvLyBORVc6IEdhbWUgc2NvcmVcclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgLy8gR2V0IHRoZSBjYW52YXMgZWxlbWVudCBmcm9tIGluZGV4Lmh0bWxcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdDYW52YXMgZWxlbWVudCB3aXRoIElEIFwiZ2FtZUNhbnZhc1wiIG5vdCBmb3VuZCEnKTtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBDYW5ub3QgcHJvY2VlZCB3aXRob3V0IGEgY2FudmFzXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaW5pdCgpOyAvLyBTdGFydCB0aGUgYXN5bmNocm9ub3VzIGluaXRpYWxpemF0aW9uIHByb2Nlc3NcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFzeW5jaHJvbm91c2x5IGluaXRpYWxpemVzIHRoZSBnYW1lLCBsb2FkaW5nIGNvbmZpZywgYXNzZXRzLCBhbmQgc2V0dGluZyB1cCBzeXN0ZW1zLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgLy8gMS4gTG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBkYXRhLmpzb25cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZDonLCB0aGlzLmNvbmZpZyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2NvcmUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmU7IC8vIEluaXRpYWxpemUgc2NvcmUgZnJvbSBjb25maWdcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb246JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBJZiBjb25maWd1cmF0aW9uIGZhaWxzIHRvIGxvYWQsIGRpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBhbmQgc3RvcC5cclxuICAgICAgICAgICAgY29uc3QgZXJyb3JEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50b3AgPSAnNTAlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUubGVmdCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50cmFuc2Zvcm0gPSAndHJhbnNsYXRlKC01MCUsIC01MCUpJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuY29sb3IgPSAncmVkJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuZm9udFNpemUgPSAnMjRweCc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnRleHRDb250ZW50ID0gJ0Vycm9yOiBGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24uIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuJztcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIDIuIEluaXRpYWxpemUgVGhyZWUuanMgKHNjZW5lLCBjYW1lcmEsIHJlbmRlcmVyKVxyXG4gICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcclxuICAgICAgICAgICAgNzUsIC8vIEZpZWxkIG9mIFZpZXcgKEZPVilcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQsIC8vIEZpeGVkIEFzcGVjdCByYXRpbyBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhTmVhciwgLy8gTmVhciBjbGlwcGluZyBwbGFuZVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhRmFyICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IHRoaXMuY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XHJcbiAgICAgICAgLy8gUmVuZGVyZXIgc2l6ZSB3aWxsIGJlIHNldCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW8gdG8gZml0IHRoZSB3aW5kb3cgd2hpbGUgbWFpbnRhaW5pbmcgYXNwZWN0IHJhdGlvXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZm9yIGJldHRlciByZWFsaXNtXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7IC8vIFVzZSBzb2Z0IHNoYWRvd3NcclxuXHJcbiAgICAgICAgLy8gQ2FtZXJhIHNldHVwIGZvciBkZWNvdXBsZWQgeWF3IGFuZCBwaXRjaDpcclxuICAgICAgICAvLyBjYW1lcmFDb250YWluZXIgaGFuZGxlcyB5YXcgKGhvcml6b250YWwgcm90YXRpb24pIGFuZCBmb2xsb3dzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFuZGxlcyBwaXRjaCAodmVydGljYWwgcm90YXRpb24pLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5jYW1lcmFDb250YWluZXIpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmFkZCh0aGlzLmNhbWVyYSk7XHJcbiAgICAgICAgLy8gUG9zaXRpb24gdGhlIGNhbWVyYSByZWxhdGl2ZSB0byB0aGUgY2FtZXJhQ29udGFpbmVyIChhdCBleWUgbGV2ZWwpXHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFIZWlnaHRPZmZzZXQ7XHJcblxyXG5cclxuICAgICAgICAvLyAzLiBJbml0aWFsaXplIENhbm5vbi1lcyAocGh5c2ljcyB3b3JsZClcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG4gICAgICAgIHRoaXMud29ybGQuZ3Jhdml0eS5zZXQoMCwgLTkuODIsIDApOyAvLyBTZXQgc3RhbmRhcmQgRWFydGggZ3Jhdml0eSAoWS1heGlzIGRvd24pXHJcbiAgICAgICAgdGhpcy53b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5TQVBCcm9hZHBoYXNlKHRoaXMud29ybGQpOyAvLyBVc2UgYW4gZWZmaWNpZW50IGJyb2FkcGhhc2UgYWxnb3JpdGhtXHJcbiAgICAgICAgLy8gRml4OiBDYXN0IHRoaXMud29ybGQuc29sdmVyIHRvIENBTk5PTi5HU1NvbHZlciB0byBhY2Nlc3MgdGhlICdpdGVyYXRpb25zJyBwcm9wZXJ0eVxyXG4gICAgICAgIC8vIFRoZSBkZWZhdWx0IHNvbHZlciBpbiBDYW5ub24uanMgKGFuZCBDYW5ub24tZXMpIGlzIEdTU29sdmVyLCB3aGljaCBoYXMgdGhpcyBwcm9wZXJ0eS5cclxuICAgICAgICAodGhpcy53b3JsZC5zb2x2ZXIgYXMgQ0FOTk9OLkdTU29sdmVyKS5pdGVyYXRpb25zID0gMTA7IC8vIEluY3JlYXNlIHNvbHZlciBpdGVyYXRpb25zIGZvciBiZXR0ZXIgc3RhYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIENhbm5vbi5qcyBNYXRlcmlhbHMgYW5kIENvbnRhY3RNYXRlcmlhbCBmb3IgcGxheWVyLWdyb3VuZCBpbnRlcmFjdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdwbGF5ZXJNYXRlcmlhbCcpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdncm91bmRNYXRlcmlhbCcpO1xyXG4gICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZGVmYXVsdE9iamVjdE1hdGVyaWFsJyk7IC8vIEFEREVEOiBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0c1xyXG4gICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdidWxsZXRNYXRlcmlhbCcpOyAvLyBORVc6IE1hdGVyaWFsIGZvciBidWxsZXRzXHJcbiAgICAgICAgdGhpcy5lbmVteU1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZW5lbXlNYXRlcmlhbCcpOyAvLyBORVc6IE1hdGVyaWFsIGZvciBlbmVtaWVzXHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCAvLyBVc2UgY29uZmlndXJhYmxlIGdyb3VuZCBmcmljdGlvblxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCwgLy8gTm8gYm91bmNlIGZvciBncm91bmRcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyR3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gQURERUQ6IFBsYXllci1PYmplY3QgY29udGFjdCBtYXRlcmlhbCAoZnJpY3Rpb24gYmV0d2VlbiBwbGF5ZXIgYW5kIHBsYWNlZCBvYmplY3RzKVxyXG4gICAgICAgIGNvbnN0IHBsYXllck9iamVjdENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJHcm91bmRGcmljdGlvbiwgLy8gU2FtZSBmcmljdGlvbiBhcyBwbGF5ZXItZ3JvdW5kXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChwbGF5ZXJPYmplY3RDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBBRERFRDogT2JqZWN0LUdyb3VuZCBjb250YWN0IG1hdGVyaWFsIChmcmljdGlvbiBiZXR3ZWVuIHBsYWNlZCBvYmplY3RzIGFuZCBncm91bmQpXHJcbiAgICAgICAgY29uc3Qgb2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwob2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBCdWxsZXQtR3JvdW5kIGNvbnRhY3QgbWF0ZXJpYWwgKG5vIGZyaWN0aW9uLCBubyByZXN0aXR1dGlvbilcclxuICAgICAgICBjb25zdCBidWxsZXRHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuMCxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKGJ1bGxldEdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQnVsbGV0LU9iamVjdCBjb250YWN0IG1hdGVyaWFsIChubyBmcmljdGlvbiwgbm8gcmVzdGl0dXRpb24pXHJcbiAgICAgICAgY29uc3QgYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBCdWxsZXQtRW5lbXkgY29udGFjdCBtYXRlcmlhbCAoYnVsbGV0IGRpc2FwcGVhcnMsIGVuZW15IHRha2VzIGRhbWFnZSlcclxuICAgICAgICBjb25zdCBidWxsZXRFbmVteUNvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmVuZW15TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChidWxsZXRFbmVteUNvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogUGxheWVyLUVuZW15IGNvbnRhY3QgbWF0ZXJpYWwgKHBsYXllciBtaWdodCBwdXNoIGVuZW15IHNsaWdodGx5KVxyXG4gICAgICAgIGNvbnN0IHBsYXllckVuZW15Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbXlNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuNSxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKHBsYXllckVuZW15Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcblxyXG4gICAgICAgIC8vIDQuIExvYWQgYXNzZXRzICh0ZXh0dXJlcyBhbmQgc291bmRzKVxyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBDcmVhdGUgZ2FtZSBvYmplY3RzIChwbGF5ZXIsIGdyb3VuZCwgc3RhdGljIG9iamVjdHMsIGVuZW1pZXMpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7IC8vIENyZWF0ZXMgdGhpcy5ncm91bmRCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTsgLy8gQ3JlYXRlcyB0aGlzLnBsYXllckJvZHlcclxuICAgICAgICB0aGlzLmNyZWF0ZVN0YXRpY09iamVjdHMoKTsgLy8gUmVuYW1lZCBmcm9tIGNyZWF0ZVBsYWNlZE9iamVjdHMsIGNyZWF0ZXMgc3RhdGljIGJveGVzXHJcbiAgICAgICAgdGhpcy5jcmVhdGVFbmVtaWVzKCk7IC8vIE5FVzogQ3JlYXRlcyBlbmVtaWVzXHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIHJldXNhYmxlIGJ1bGxldCBnZW9tZXRyeSBhbmQgbWF0ZXJpYWxcclxuICAgICAgICB0aGlzLmJ1bGxldEdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQuZGltZW5zaW9ucy5yYWRpdXMsIDgsIDgpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0LnRleHR1cmVOYW1lKTtcclxuICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsTWVzaCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogYnVsbGV0VGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGJ1bGxldFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ZmZmZjAwIC8vIFllbGxvdyBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIE1PRElGSUVEOiBTZXR1cCBDYW5ub24tZXMgY29udGFjdCBsaXN0ZW5lcnMgZm9yIGdlbmVyYWwgc3VyZmFjZSBjb250YWN0IGxvZ2ljXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdiZWdpbkNvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgbGV0IGJvZHlBID0gZXZlbnQuYm9keUE7XHJcbiAgICAgICAgICAgIGxldCBib2R5QiA9IGV2ZW50LmJvZHlCO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcGxheWVyQm9keSBpcyBpbnZvbHZlZCBpbiB0aGUgY29udGFjdFxyXG4gICAgICAgICAgICBpZiAoYm9keUEgPT09IHRoaXMucGxheWVyQm9keSB8fCBib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5ID8gYm9keUIgOiBib2R5QTtcclxuICAgICAgICAgICAgICAgIC8vIEZJWDogQWRkZWQgbnVsbC91bmRlZmluZWQgY2hlY2sgZm9yIG90aGVyQm9keSB0byBwcmV2ZW50ICdDYW5ub3QgcmVhZCBwcm9wZXJ0aWVzIG9mIHVuZGVmaW5lZCAocmVhZGluZyAnbWFzcycpJ1xyXG4gICAgICAgICAgICAgICAgaWYgKG90aGVyQm9keSAmJiBvdGhlckJvZHkubWFzcyA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMrKztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLndvcmxkLmFkZEV2ZW50TGlzdGVuZXIoJ2VuZENvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgbGV0IGJvZHlBID0gZXZlbnQuYm9keUE7XHJcbiAgICAgICAgICAgIGxldCBib2R5QiA9IGV2ZW50LmJvZHlCO1xyXG5cclxuICAgICAgICAgICAgaWYgKGJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgfHwgYm9keUIgPT09IHRoaXMucGxheWVyQm9keSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb3RoZXJCb2R5ID0gYm9keUEgPT09IHRoaXMucGxheWVyQm9keSA/IGJvZHlCIDogYm9keUE7XHJcbiAgICAgICAgICAgICAgICAvLyBGSVg6IEFkZGVkIG51bGwvdW5kZWZpbmVkIGNoZWNrIGZvciBvdGhlckJvZHkgdG8gcHJldmVudCAnQ2Fubm90IHJlYWQgcHJvcGVydGllcyBvZiB1bmRlZmluZWQgKHJlYWRpbmcgJ21hc3MnKSdcclxuICAgICAgICAgICAgICAgIGlmIChvdGhlckJvZHkgJiYgb3RoZXJCb2R5Lm1hc3MgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzID0gTWF0aC5tYXgoMCwgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyAtIDEpOyAvLyBFbnN1cmUgaXQgZG9lc24ndCBnbyBiZWxvdyAwXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gNy4gU2V0dXAgZXZlbnQgbGlzdGVuZXJzIGZvciB1c2VyIGlucHV0IGFuZCB3aW5kb3cgcmVzaXppbmdcclxuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgdGhpcy5vbldpbmRvd1Jlc2l6ZS5iaW5kKHRoaXMpKTtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5vbktleURvd24uYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5dXAnLCB0aGlzLm9uS2V5VXAuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMpKTsgLy8gRm9yIG1vdXNlIGxvb2tcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLm9uTW91c2VEb3duLmJpbmQodGhpcykpOyAvLyBORVc6IEZvciBmaXJpbmcgYnVsbGV0c1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcykpOyAvLyBGb3IgcG9pbnRlciBsb2NrIHN0YXR1c1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21venBvaW50ZXJsb2NrY2hhbmdlJywgdGhpcy5vblBvaW50ZXJMb2NrQ2hhbmdlLmJpbmQodGhpcykpOyAvLyBGaXJlZm94IGNvbXBhdGliaWxpdHlcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCd3ZWJraXRwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gV2Via2l0IGNvbXBhdGliaWxpdHlcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgaW5pdGlhbCBmaXhlZCBhc3BlY3QgcmF0aW8gYW5kIGNlbnRlciB0aGUgY2FudmFzXHJcbiAgICAgICAgdGhpcy5hcHBseUZpeGVkQXNwZWN0UmF0aW8oKTtcclxuXHJcbiAgICAgICAgLy8gOC4gU2V0dXAgdGhlIHRpdGxlIHNjcmVlbiBVSSBhbmQgR2FtZSBVSVxyXG4gICAgICAgIHRoaXMuc2V0dXBUaXRsZVNjcmVlbigpO1xyXG4gICAgICAgIHRoaXMuc2V0dXBHYW1lVUkoKTsgLy8gTkVXOiBTZXR1cCBzY29yZSBkaXNwbGF5IGFuZCBjcm9zc2hhaXJcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgdGhlIG1haW4gZ2FtZSBsb29wXHJcbiAgICAgICAgdGhpcy5hbmltYXRlKDApOyAvLyBQYXNzIGluaXRpYWwgdGltZSAwXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBMb2FkcyBhbGwgdGV4dHVyZXMgYW5kIHNvdW5kcyBkZWZpbmVkIGluIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXN5bmMgbG9hZEFzc2V0cygpIHtcclxuICAgICAgICBjb25zdCB0ZXh0dXJlTG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLmltYWdlcy5tYXAoaW1nID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmVMb2FkZXIubG9hZEFzeW5jKGltZy5wYXRoKVxyXG4gICAgICAgICAgICAgICAgLnRoZW4odGV4dHVyZSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50ZXh0dXJlcy5zZXQoaW1nLm5hbWUsIHRleHR1cmUpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgaG9yaXpvbnRhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS53cmFwVCA9IFRIUkVFLlJlcGVhdFdyYXBwaW5nOyAvLyBSZXBlYXQgdGV4dHVyZSB2ZXJ0aWNhbGx5XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWRqdXN0IHRleHR1cmUgcmVwZXRpdGlvbiBmb3IgdGhlIGdyb3VuZCB0byBhdm9pZCBzdHJldGNoaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lID09PSAnZ3JvdW5kX3RleHR1cmUnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLnJlcGVhdC5zZXQodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1LCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDUpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAvLyBGb3IgYm94IHRleHR1cmVzLCBlbnN1cmUgcmVwZXRpdGlvbiBpZiBkZXNpcmVkLCBvciBzZXQgdG8gMSwxIGZvciBzaW5nbGUgYXBwbGljYXRpb25cclxuICAgICAgICAgICAgICAgICAgICBpZiAoaW1nLm5hbWUuZW5kc1dpdGgoJ190ZXh0dXJlJykpIHsgLy8gR2VuZXJpYyBjaGVjayBmb3Igb3RoZXIgdGV4dHVyZXNcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGdlbmVyaWMgYm94IHRleHR1cmVzLCB3ZSBtaWdodCB3YW50IHRvIHJlcGVhdCBiYXNlZCBvbiBvYmplY3QgZGltZW5zaW9uc1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGb3Igc2ltcGxpY2l0eSBub3csIGxldCdzIGtlZXAgZGVmYXVsdCAobm8gcmVwZWF0IHVubGVzcyBleHBsaWNpdCBmb3IgZ3JvdW5kKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBBIG1vcmUgcm9idXN0IHNvbHV0aW9uIHdvdWxkIGludm9sdmUgc2V0dGluZyByZXBlYXQgYmFzZWQgb24gc2NhbGUvZGltZW5zaW9ucyBmb3IgZWFjaCBvYmplY3RcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCB0ZXh0dXJlOiAke2ltZy5wYXRofWAsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDb250aW51ZSBldmVuIGlmIGFuIGFzc2V0IGZhaWxzIHRvIGxvYWQ7IGZhbGxiYWNrcyAoc29saWQgY29sb3JzKSBhcmUgdXNlZC5cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBzb3VuZFByb21pc2VzID0gdGhpcy5jb25maWcuYXNzZXRzLnNvdW5kcy5tYXAoc291bmQgPT4ge1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHNvdW5kLnBhdGgpO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8udm9sdW1lID0gc291bmQudm9sdW1lO1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ubG9vcCA9IChzb3VuZC5uYW1lID09PSAnYmFja2dyb3VuZF9tdXNpYycpOyAvLyBMb29wIGJhY2tncm91bmQgbXVzaWNcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uY2FucGxheXRocm91Z2ggPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuc2V0KHNvdW5kLm5hbWUsIGF1ZGlvKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7XHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICAgICAgYXVkaW8ub25lcnJvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gbG9hZCBzb3VuZDogJHtzb3VuZC5wYXRofWApO1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoKTsgLy8gUmVzb2x2ZSBldmVuIG9uIGVycm9yIHRvIG5vdCBibG9jayBQcm9taXNlLmFsbFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKFsuLi5pbWFnZVByb21pc2VzLCAuLi5zb3VuZFByb21pc2VzXSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYEFzc2V0cyBsb2FkZWQ6ICR7dGhpcy50ZXh0dXJlcy5zaXplfSB0ZXh0dXJlcywgJHt0aGlzLnNvdW5kcy5zaXplfSBzb3VuZHMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIGFuZCBkaXNwbGF5cyB0aGUgdGl0bGUgc2NyZWVuIFVJIGR5bmFtaWNhbGx5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHNldHVwVGl0bGVTY3JlZW4oKSB7XHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLCAvLyBQb3NpdGlvbiByZWxhdGl2ZSB0byBib2R5LCB3aWxsIGJlIGNlbnRlcmVkIGFuZCBzaXplZCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW9cclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAncmdiYSgwLCAwLCAwLCAwLjgpJyxcclxuICAgICAgICAgICAgZGlzcGxheTogJ2ZsZXgnLCBmbGV4RGlyZWN0aW9uOiAnY29sdW1uJyxcclxuICAgICAgICAgICAganVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLCBhbGlnbkl0ZW1zOiAnY2VudGVyJyxcclxuICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsIGZvbnRGYW1pbHk6ICdBcmlhbCwgc2Fucy1zZXJpZicsXHJcbiAgICAgICAgICAgIGZvbnRTaXplOiAnNDhweCcsIHRleHRBbGlnbjogJ2NlbnRlcicsIHpJbmRleDogJzEwMDAnXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSk7XHJcblxyXG4gICAgICAgIC8vIENydWNpYWw6IENhbGwgYXBwbHlGaXhlZEFzcGVjdFJhdGlvIGhlcmUgdG8gZW5zdXJlIHRoZSB0aXRsZSBzY3JlZW4gb3ZlcmxheVxyXG4gICAgICAgIC8vIGlzIHNpemVkIGFuZCBwb3NpdGlvbmVkIGNvcnJlY3RseSByZWxhdGl2ZSB0byB0aGUgY2FudmFzIGZyb20gdGhlIHN0YXJ0LlxyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy50aXRsZVRleHQudGV4dENvbnRlbnQgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MudGl0bGVTY3JlZW5UZXh0O1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMudGl0bGVUZXh0KTtcclxuXHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgdGhpcy5wcm9tcHRUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnN0YXJ0R2FtZVByb21wdDtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMucHJvbXB0VGV4dC5zdHlsZSwge1xyXG4gICAgICAgICAgICBtYXJnaW5Ub3A6ICcyMHB4JywgZm9udFNpemU6ICcyNHB4J1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LmFwcGVuZENoaWxkKHRoaXMucHJvbXB0VGV4dCk7XHJcblxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lciBkaXJlY3RseSB0byB0aGUgb3ZlcmxheSB0byBjYXB0dXJlIGNsaWNrcyBhbmQgc3RhcnQgdGhlIGdhbWVcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuc3RhcnRHYW1lKCkpO1xyXG5cclxuICAgICAgICAvLyBBdHRlbXB0IHRvIHBsYXkgYmFja2dyb3VuZCBtdXNpYy4gSXQgbWlnaHQgYmUgYmxvY2tlZCBieSBicm93c2VycyBpZiBubyB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkIHlldC5cclxuICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2JhY2tncm91bmRfbXVzaWMnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJCR00gcGxheSBkZW5pZWQgKHJlcXVpcmVzIHVzZXIgZ2VzdHVyZSk6XCIsIGUpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogQ3JlYXRlcyBhbmQgZGlzcGxheXMgdGhlIGdhbWUgc2NvcmUgVUkgYW5kIGNyb3NzaGFpci5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cEdhbWVVSSgpIHtcclxuICAgICAgICB0aGlzLnNjb3JlVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5zY29yZVRleHQuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIHRvcDogJzEwcHgnLFxyXG4gICAgICAgICAgICBsZWZ0OiAnMTBweCcsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnd2hpdGUnLFxyXG4gICAgICAgICAgICBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzI0cHgnLFxyXG4gICAgICAgICAgICB6SW5kZXg6ICcxMDAxJyAvLyBBYm92ZSB0aXRsZSBzY3JlZW4gb3ZlcmxheSBidXQgc2VwYXJhdGVcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnNjb3JlVGV4dC50ZXh0Q29udGVudCA9IGBTY29yZTogJHt0aGlzLnNjb3JlfWA7XHJcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh0aGlzLnNjb3JlVGV4dCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIGFuZCBzZXR1cCBjcm9zc2hhaXJcclxuICAgICAgICB0aGlzLmNyb3NzaGFpckVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMuY3Jvc3NoYWlyRWxlbWVudC5zdHlsZSwge1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgd2lkdGg6ICcycHgnLCAgLy8gQ2VudHJhbCBkb3Qgc2l6ZVxyXG4gICAgICAgICAgICBoZWlnaHQ6ICcycHgnLFxyXG4gICAgICAgICAgICBiYWNrZ3JvdW5kQ29sb3I6ICd3aGl0ZScsIC8vIENlbnRyYWwgd2hpdGUgZG90XHJcbiAgICAgICAgICAgIC8vIFVzZSBib3gtc2hhZG93cyBmb3Igb3V0bGluZXMgYW5kIHBvdGVudGlhbCBjcm9zcy1saWtlIGFwcGVhcmFuY2VcclxuICAgICAgICAgICAgYm94U2hhZG93OiAnMCAwIDAgMXB4IHdoaXRlLCAwIDAgMCAzcHggcmdiYSgwLDAsMCwwLjgpLCAwIDAgMCA0cHggd2hpdGUnLFxyXG4gICAgICAgICAgICBib3JkZXJSYWRpdXM6ICc1MCUnLCAvLyBNYWtlIGl0IGNpcmN1bGFyXHJcbiAgICAgICAgICAgIHRvcDogJzUwJScsXHJcbiAgICAgICAgICAgIGxlZnQ6ICc1MCUnLFxyXG4gICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLFxyXG4gICAgICAgICAgICB6SW5kZXg6ICcxMDAyJywgLy8gQWJvdmUgdGl0bGUgc2NyZWVuIGFuZCBzY29yZVxyXG4gICAgICAgICAgICBkaXNwbGF5OiAnbm9uZScgLy8gSW5pdGlhbGx5IGhpZGRlblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5jcm9zc2hhaXJFbGVtZW50KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogVXBkYXRlcyB0aGUgc2NvcmUgZGlzcGxheSBvbiB0aGUgVUkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlU2NvcmVEaXNwbGF5KCkge1xyXG4gICAgICAgIGlmICh0aGlzLnNjb3JlVGV4dCkge1xyXG4gICAgICAgICAgICB0aGlzLnNjb3JlVGV4dC50ZXh0Q29udGVudCA9IGBTY29yZTogJHt0aGlzLnNjb3JlfWA7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVHJhbnNpdGlvbnMgdGhlIGdhbWUgZnJvbSB0aGUgdGl0bGUgc2NyZWVuIHRvIHRoZSBwbGF5aW5nIHN0YXRlLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN0YXJ0R2FtZSgpIHtcclxuICAgICAgICB0aGlzLnN0YXRlID0gR2FtZVN0YXRlLlBMQVlJTkc7XHJcbiAgICAgICAgLy8gUmVtb3ZlIHRoZSB0aXRsZSBzY3JlZW4gb3ZlcmxheVxyXG4gICAgICAgIGlmICh0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSAmJiB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5wYXJlbnROb2RlKSB7XHJcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgdG8gY2FudmFzIGZvciByZS1sb2NraW5nIHBvaW50ZXIgYWZ0ZXIgdGl0bGUgc2NyZWVuIGlzIGdvbmVcclxuICAgICAgICB0aGlzLmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMuaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlci5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICAgICAgLy8gUmVxdWVzdCBwb2ludGVyIGxvY2sgZm9yIGltbWVyc2l2ZSBtb3VzZSBjb250cm9sXHJcbiAgICAgICAgdGhpcy5jYW52YXMucmVxdWVzdFBvaW50ZXJMb2NrKCk7XHJcbiAgICAgICAgLy8gRW5zdXJlIGJhY2tncm91bmQgbXVzaWMgcGxheXMgbm93IHRoYXQgYSB1c2VyIGdlc3R1cmUgaGFzIG9jY3VycmVkXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZmFpbGVkIGFmdGVyIHVzZXIgZ2VzdHVyZTpcIiwgZSkpO1xyXG5cclxuICAgICAgICAvLyBORVc6IFNob3cgY3Jvc3NoYWlyIHdoZW4gZ2FtZSBzdGFydHNcclxuICAgICAgICBpZiAodGhpcy5jcm9zc2hhaXJFbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHRoaXMuY3Jvc3NoYWlyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBIYW5kbGVzIGNsaWNrcyBvbiB0aGUgY2FudmFzIHRvIHJlLWxvY2sgdGhlIHBvaW50ZXIgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgdW5sb2NrZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgaGFuZGxlQ2FudmFzUmVMb2NrUG9pbnRlcigpIHtcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgIXRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIHBsYXllcidzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlUGxheWVyKCkge1xyXG4gICAgICAgIC8vIFBsYXllciB2aXN1YWwgbWVzaCAoYSBzaW1wbGUgYm94KVxyXG4gICAgICAgIGNvbnN0IHBsYXllclRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCgncGxheWVyX3RleHR1cmUnKTtcclxuICAgICAgICBjb25zdCBwbGF5ZXJNYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgbWFwOiBwbGF5ZXJUZXh0dXJlLFxyXG4gICAgICAgICAgICBjb2xvcjogcGxheWVyVGV4dHVyZSA/IDB4ZmZmZmZmIDogMHgwMDc3ZmYgLy8gVXNlIHdoaXRlIHdpdGggdGV4dHVyZSwgb3IgYmx1ZSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyR2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkoMSwgMiwgMSk7IC8vIFBsYXllciBkaW1lbnNpb25zXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoID0gbmV3IFRIUkVFLk1lc2gocGxheWVyR2VvbWV0cnksIHBsYXllck1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSA9IDU7IC8vIFN0YXJ0IHBsYXllciBzbGlnaHRseSBhYm92ZSB0aGUgZ3JvdW5kXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBQbGF5ZXIgY2FzdHMgYSBzaGFkb3dcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLnBsYXllck1lc2gpO1xyXG5cclxuICAgICAgICAvLyBQbGF5ZXIgcGh5c2ljcyBib2R5IChDYW5ub24uanMgYm94IHNoYXBlKVxyXG4gICAgICAgIGNvbnN0IHBsYXllclNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKDAuNSwgMSwgMC41KSk7IC8vIEhhbGYgZXh0ZW50cyBvZiB0aGUgYm94IGZvciBjb2xsaXNpb25cclxuICAgICAgICB0aGlzLnBsYXllckJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyTWFzcywgLy8gUGxheWVyJ3MgbWFzc1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi54LCB0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueSwgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogcGxheWVyU2hhcGUsXHJcbiAgICAgICAgICAgIGZpeGVkUm90YXRpb246IHRydWUsIC8vIFByZXZlbnQgdGhlIHBsYXllciBmcm9tIGZhbGxpbmcgb3ZlciAoc2ltdWxhdGVzIGEgY2Fwc3VsZS9jeWxpbmRlciBjaGFyYWN0ZXIpXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLnBsYXllck1hdGVyaWFsIC8vIEFzc2lnbiB0aGUgcGxheWVyIG1hdGVyaWFsIGZvciBjb250YWN0IHJlc29sdXRpb25cclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5wbGF5ZXJCb2R5KTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGluaXRpYWwgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHRvIHBsYXllcidzIHBoeXNpY3MgYm9keSBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFzIGl0cyBvd24gbG9jYWwgWSBvZmZzZXQuXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIENyZWF0ZXMgdGhlIGdyb3VuZCdzIHZpc3VhbCBtZXNoIGFuZCBwaHlzaWNzIGJvZHkuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlR3JvdW5kKCkge1xyXG4gICAgICAgIC8vIEdyb3VuZCB2aXN1YWwgbWVzaCAoYSBsYXJnZSBwbGFuZSlcclxuICAgICAgICBjb25zdCBncm91bmRUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ2dyb3VuZF90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogZ3JvdW5kVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGdyb3VuZFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ODg4ODg4IC8vIFVzZSB3aGl0ZSB3aXRoIHRleHR1cmUsIG9yIGdyZXkgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZEdlb21ldHJ5ID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkodGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2ggPSBuZXcgVEhSRUUuTWVzaChncm91bmRHZW9tZXRyeSwgZ3JvdW5kTWF0ZXJpYWwpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaC5yb3RhdGlvbi54ID0gLU1hdGguUEkgLyAyOyAvLyBSb3RhdGUgdG8gbGF5IGZsYXQgb24gdGhlIFhaIHBsYW5lXHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlOyAvLyBHcm91bmQgcmVjZWl2ZXMgc2hhZG93c1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuZ3JvdW5kTWVzaCk7XHJcblxyXG4gICAgICAgIC8vIEdyb3VuZCBwaHlzaWNzIGJvZHkgKENhbm5vbi5qcyBwbGFuZSBzaGFwZSlcclxuICAgICAgICBjb25zdCBncm91bmRTaGFwZSA9IG5ldyBDQU5OT04uUGxhbmUoKTtcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAwLCAvLyBBIG1hc3Mgb2YgMCBtYWtlcyBpdCBhIHN0YXRpYyAoaW1tb3ZhYmxlKSBib2R5XHJcbiAgICAgICAgICAgIHNoYXBlOiBncm91bmRTaGFwZSxcclxuICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuZ3JvdW5kTWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBncm91bmQgbWF0ZXJpYWwgZm9yIGNvbnRhY3QgcmVzb2x1dGlvblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIC8vIFJvdGF0ZSB0aGUgQ2Fubm9uLmpzIHBsYW5lIGJvZHkgdG8gbWF0Y2ggdGhlIFRocmVlLmpzIHBsYW5lIG9yaWVudGF0aW9uIChmbGF0KVxyXG4gICAgICAgIHRoaXMuZ3JvdW5kQm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDEsIDAsIDApLCAtTWF0aC5QSSAvIDIpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keSh0aGlzLmdyb3VuZEJvZHkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBDcmVhdGVzIHZpc3VhbCBtZXNoZXMgYW5kIHBoeXNpY3MgYm9kaWVzIGZvciBhbGwgc3RhdGljIG9iamVjdHMgKGJveGVzKSBkZWZpbmVkIGluIGNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhdGljT2JqZWN0cy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVTdGF0aWNPYmplY3RzKCkgeyAvLyBSZW5hbWVkIGZyb20gY3JlYXRlUGxhY2VkT2JqZWN0c1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnN0YXRpY09iamVjdHMpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiTm8gc3RhdGljT2JqZWN0cyBkZWZpbmVkIGluIGdhbWVTZXR0aW5ncy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zdGF0aWNPYmplY3RzLmZvckVhY2gob2JqQ29uZmlnID0+IHtcclxuICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KG9iakNvbmZpZy50ZXh0dXJlTmFtZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICAgICAgbWFwOiB0ZXh0dXJlLFxyXG4gICAgICAgICAgICAgICAgY29sb3I6IHRleHR1cmUgPyAweGZmZmZmZiA6IDB4YWFhYWFhIC8vIERlZmF1bHQgZ3JleSBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIFRocmVlLmpzIE1lc2hcclxuICAgICAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkob2JqQ29uZmlnLmRpbWVuc2lvbnMud2lkdGgsIG9iakNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCwgb2JqQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGgpO1xyXG4gICAgICAgICAgICBjb25zdCBtZXNoID0gbmV3IFRIUkVFLk1lc2goZ2VvbWV0cnksIG1hdGVyaWFsKTtcclxuICAgICAgICAgICAgbWVzaC5wb3NpdGlvbi5zZXQob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueik7XHJcbiAgICAgICAgICAgIGlmIChvYmpDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIG1lc2gucm90YXRpb24ueSA9IG9iakNvbmZpZy5yb3RhdGlvblk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQobWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMucGxhY2VkT2JqZWN0TWVzaGVzLnB1c2gobWVzaCk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgQ2Fubm9uLmpzIEJvZHlcclxuICAgICAgICAgICAgLy8gQ2Fubm9uLkJveCB0YWtlcyBoYWxmIGV4dGVudHNcclxuICAgICAgICAgICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy53aWR0aCAvIDIsXHJcbiAgICAgICAgICAgICAgICBvYmpDb25maWcuZGltZW5zaW9ucy5oZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICAgICAgb2JqQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGggLyAyXHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgICAgIG1hc3M6IG9iakNvbmZpZy5tYXNzLCAvLyBVc2UgMCBmb3Igc3RhdGljIG9iamVjdHNcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMob2JqQ29uZmlnLnBvc2l0aW9uLngsIG9iakNvbmZpZy5wb3NpdGlvbi55LCBvYmpDb25maWcucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgICAgICBzaGFwZTogc2hhcGUsXHJcbiAgICAgICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5kZWZhdWx0T2JqZWN0TWF0ZXJpYWwgLy8gQXNzaWduIHRoZSBkZWZhdWx0IG9iamVjdCBtYXRlcmlhbFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgaWYgKG9iakNvbmZpZy5yb3RhdGlvblkgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgYm9keS5xdWF0ZXJuaW9uLnNldEZyb21BeGlzQW5nbGUobmV3IENBTk5PTi5WZWMzKDAsIDEsIDApLCBvYmpDb25maWcucm90YXRpb25ZKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYm9keSk7XHJcbiAgICAgICAgICAgIHRoaXMucGxhY2VkT2JqZWN0Qm9kaWVzLnB1c2goYm9keSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYENyZWF0ZWQgJHt0aGlzLnBsYWNlZE9iamVjdE1lc2hlcy5sZW5ndGh9IHN0YXRpYyBvYmplY3RzLmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBDcmVhdGVzIHZpc3VhbCBtZXNoZXMgYW5kIHBoeXNpY3MgYm9kaWVzIGZvciBhbGwgZW5lbXkgaW5zdGFuY2VzIGRlZmluZWQgaW4gY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteUluc3RhbmNlcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBjcmVhdGVFbmVtaWVzKCkge1xyXG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SW5zdGFuY2VzIHx8ICF0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlUeXBlcykge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJObyBlbmVteUluc3RhbmNlcyBvciBlbmVteVR5cGVzIGRlZmluZWQgaW4gZ2FtZVNldHRpbmdzLlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZW5lbXlUeXBlTWFwID0gbmV3IE1hcDxzdHJpbmcsIEVuZW15VHlwZUNvbmZpZz4oKTtcclxuICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlUeXBlcy5mb3JFYWNoKHR5cGUgPT4gZW5lbXlUeXBlTWFwLnNldCh0eXBlLm5hbWUsIHR5cGUpKTtcclxuXHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15SW5zdGFuY2VzLmZvckVhY2goaW5zdGFuY2VDb25maWcgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0eXBlQ29uZmlnID0gZW5lbXlUeXBlTWFwLmdldChpbnN0YW5jZUNvbmZpZy5lbmVteVR5cGVOYW1lKTtcclxuICAgICAgICAgICAgaWYgKCF0eXBlQ29uZmlnKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFbmVteSB0eXBlICcke2luc3RhbmNlQ29uZmlnLmVuZW15VHlwZU5hbWV9JyBub3QgZm91bmQgZm9yIGluc3RhbmNlICcke2luc3RhbmNlQ29uZmlnLm5hbWV9Jy4gU2tpcHBpbmcuYCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCh0eXBlQ29uZmlnLnRleHR1cmVOYW1lKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBtYXA6IHRleHR1cmUsXHJcbiAgICAgICAgICAgICAgICBjb2xvcjogdGV4dHVyZSA/IDB4ZmZmZmZmIDogMHhmZjAwMDAgLy8gRGVmYXVsdCByZWQgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBUaHJlZS5qcyBNZXNoXHJcbiAgICAgICAgICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHR5cGVDb25maWcuZGltZW5zaW9ucy53aWR0aCwgdHlwZUNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCwgdHlwZUNvbmZpZy5kaW1lbnNpb25zLmRlcHRoKTtcclxuICAgICAgICAgICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcbiAgICAgICAgICAgIG1lc2gucG9zaXRpb24uc2V0KGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLngsIGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLnksIGluc3RhbmNlQ29uZmlnLnBvc2l0aW9uLnopO1xyXG4gICAgICAgICAgICBpZiAoaW5zdGFuY2VDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIG1lc2gucm90YXRpb24ueSA9IGluc3RhbmNlQ29uZmlnLnJvdGF0aW9uWTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtZXNoLmNhc3RTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICBtZXNoLnJlY2VpdmVTaGFkb3cgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLmFkZChtZXNoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBDYW5ub24uanMgQm9keVxyXG4gICAgICAgICAgICBjb25zdCBzaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgICAgIHR5cGVDb25maWcuZGltZW5zaW9ucy53aWR0aCAvIDIsXHJcbiAgICAgICAgICAgICAgICB0eXBlQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0IC8gMixcclxuICAgICAgICAgICAgICAgIHR5cGVDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDJcclxuICAgICAgICAgICAgKSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICAgICAgbWFzczogdHlwZUNvbmZpZy5tYXNzLFxyXG4gICAgICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyhpbnN0YW5jZUNvbmZpZy5wb3NpdGlvbi54LCBpbnN0YW5jZUNvbmZpZy5wb3NpdGlvbi55LCBpbnN0YW5jZUNvbmZpZy5wb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgICAgIHNoYXBlOiBzaGFwZSxcclxuICAgICAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLmVuZW15TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgICAgICBmaXhlZFJvdGF0aW9uOiB0cnVlIC8vIFByZXZlbnQgZW5lbWllcyBmcm9tIHR1bWJsaW5nXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBpZiAoaW5zdGFuY2VDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygwLCAxLCAwKSwgaW5zdGFuY2VDb25maWcucm90YXRpb25ZKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYm9keSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBhY3RpdmVFbmVteTogQWN0aXZlRW5lbXkgPSB7XHJcbiAgICAgICAgICAgICAgICBuYW1lOiBpbnN0YW5jZUNvbmZpZy5uYW1lLFxyXG4gICAgICAgICAgICAgICAgbWVzaDogbWVzaCxcclxuICAgICAgICAgICAgICAgIGJvZHk6IGJvZHksXHJcbiAgICAgICAgICAgICAgICB0eXBlQ29uZmlnOiB0eXBlQ29uZmlnLFxyXG4gICAgICAgICAgICAgICAgY3VycmVudEhlYWx0aDogdHlwZUNvbmZpZy5oZWFsdGgsXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIGJvZHkudXNlckRhdGEgPSBhY3RpdmVFbmVteTsgLy8gQXR0YWNoIGFjdGl2ZUVuZW15IHRvIGJvZHkgZm9yIGNvbGxpc2lvbiBsb29rdXBcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbWllcy5wdXNoKGFjdGl2ZUVuZW15KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQ3JlYXRlZCAke3RoaXMuZW5lbWllcy5sZW5ndGh9IGVuZW1pZXMuYCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTZXRzIHVwIGFtYmllbnQgYW5kIGRpcmVjdGlvbmFsIGxpZ2h0aW5nIGluIHRoZSBzY2VuZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cExpZ2h0aW5nKCkge1xyXG4gICAgICAgIGNvbnN0IGFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoMHg0MDQwNDAsIDEuMCk7IC8vIFNvZnQgd2hpdGUgYW1iaWVudCBsaWdodFxyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGFtYmllbnRMaWdodCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpcmVjdGlvbmFsTGlnaHQgPSBuZXcgVEhSRUUuRGlyZWN0aW9uYWxMaWdodCgweGZmZmZmZiwgMC44KTsgLy8gQnJpZ2h0ZXIgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldCg1LCAxMCwgNSk7IC8vIFBvc2l0aW9uIHRoZSBsaWdodCBzb3VyY2VcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LmNhc3RTaGFkb3cgPSB0cnVlOyAvLyBFbmFibGUgc2hhZG93cyBmcm9tIHRoaXMgbGlnaHQgc291cmNlXHJcbiAgICAgICAgLy8gQ29uZmlndXJlIHNoYWRvdyBwcm9wZXJ0aWVzIGZvciB0aGUgZGlyZWN0aW9uYWwgbGlnaHRcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLndpZHRoID0gMTAyNDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5tYXBTaXplLmhlaWdodCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLm5lYXIgPSAwLjU7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmZhciA9IDUwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5sZWZ0ID0gLTEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5yaWdodCA9IDEwO1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS50b3AgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEuYm90dG9tID0gLTEwO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGRpcmVjdGlvbmFsTGlnaHQpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyB3aW5kb3cgcmVzaXppbmcgdG8ga2VlcCB0aGUgY2FtZXJhIGFzcGVjdCByYXRpbyBhbmQgcmVuZGVyZXIgc2l6ZSBjb3JyZWN0LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uV2luZG93UmVzaXplKCkge1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7IC8vIEFwcGx5IHRoZSBmaXhlZCBhc3BlY3QgcmF0aW8gYW5kIGNlbnRlciB0aGUgY2FudmFzXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBcHBsaWVzIHRoZSBjb25maWd1cmVkIGZpeGVkIGFzcGVjdCByYXRpbyB0byB0aGUgcmVuZGVyZXIgYW5kIGNhbWVyYSxcclxuICAgICAqIHJlc2l6aW5nIGFuZCBjZW50ZXJpbmcgdGhlIGNhbnZhcyB0byBmaXQgd2l0aGluIHRoZSB3aW5kb3cuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCkge1xyXG4gICAgICAgIGNvbnN0IHRhcmdldEFzcGVjdFJhdGlvID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQ7XHJcblxyXG4gICAgICAgIGxldCBuZXdXaWR0aDogbnVtYmVyO1xyXG4gICAgICAgIGxldCBuZXdIZWlnaHQ6IG51bWJlcjtcclxuXHJcbiAgICAgICAgY29uc3Qgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aDtcclxuICAgICAgICBjb25zdCB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQ7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFdpbmRvd0FzcGVjdFJhdGlvID0gd2luZG93V2lkdGggLyB3aW5kb3dIZWlnaHQ7XHJcblxyXG4gICAgICAgIGlmIChjdXJyZW50V2luZG93QXNwZWN0UmF0aW8gPiB0YXJnZXRBc3BlY3RSYXRpbykge1xyXG4gICAgICAgICAgICAvLyBXaW5kb3cgaXMgd2lkZXIgdGhhbiB0YXJnZXQgYXNwZWN0IHJhdGlvLCBoZWlnaHQgaXMgdGhlIGxpbWl0aW5nIGZhY3RvclxyXG4gICAgICAgICAgICBuZXdIZWlnaHQgPSB3aW5kb3dIZWlnaHQ7XHJcbiAgICAgICAgICAgIG5ld1dpZHRoID0gbmV3SGVpZ2h0ICogdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gV2luZG93IGlzIHRhbGxlciAob3IgZXhhY3RseSkgdGhlIHRhcmdldCBhc3BlY3QgcmF0aW8sIHdpZHRoIGlzIHRoZSBsaW1pdGluZyBmYWN0b3JcclxuICAgICAgICAgICAgbmV3V2lkdGggPSB3aW5kb3dXaWR0aDtcclxuICAgICAgICAgICAgbmV3SGVpZ2h0ID0gbmV3V2lkdGggLyB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNldCByZW5kZXJlciBzaXplLiBUaGUgdGhpcmQgYXJndW1lbnQgYHVwZGF0ZVN0eWxlYCBpcyBmYWxzZSBiZWNhdXNlIHdlIG1hbmFnZSBzdHlsZSBtYW51YWxseS5cclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNpemUobmV3V2lkdGgsIG5ld0hlaWdodCwgZmFsc2UpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmFzcGVjdCA9IHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuXHJcbiAgICAgICAgLy8gUG9zaXRpb24gYW5kIHNpemUgdGhlIGNhbnZhcyBlbGVtZW50IHVzaW5nIENTU1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy5jYW52YXMuc3R5bGUsIHtcclxuICAgICAgICAgICAgd2lkdGg6IGAke25ld1dpZHRofXB4YCxcclxuICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJyxcclxuICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtNTAlLCAtNTAlKScsXHJcbiAgICAgICAgICAgIG9iamVjdEZpdDogJ2NvbnRhaW4nIC8vIEVuc3VyZXMgY29udGVudCBpcyBzY2FsZWQgYXBwcm9wcmlhdGVseSBpZiB0aGVyZSdzIGFueSBtaXNtYXRjaFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGUgdGl0bGUgc2NyZWVuIGlzIGFjdGl2ZSwgdXBkYXRlIGl0cyBzaXplIGFuZCBwb3NpdGlvbiBhcyB3ZWxsIHRvIG1hdGNoIHRoZSBjYW52YXNcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlRJVExFICYmIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuc3R5bGUsIHtcclxuICAgICAgICAgICAgICAgIHdpZHRoOiBgJHtuZXdXaWR0aH1weGAsXHJcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGAke25ld0hlaWdodH1weGAsXHJcbiAgICAgICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgbGVmdDogJzUwJScsXHJcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gVGhlIGNyb3NzaGFpciBhbmQgc2NvcmUgdGV4dCB3aWxsIGF1dG9tYXRpY2FsbHkgcmUtY2VudGVyIGR1ZSB0byB0aGVpciAnYWJzb2x1dGUnIHBvc2l0aW9uaW5nXHJcbiAgICAgICAgLy8gYW5kICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknIHJlbGF0aXZlIHRvIHRoZSBjYW52YXMncyBuZXcgcG9zaXRpb24uXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSBwcmVzc2VkIGRvd24uXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlEb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IHRydWU7XHJcbiAgICAgICAgLy8gQURERUQ6IEhhbmRsZSBqdW1wIGlucHV0IG9ubHkgd2hlbiBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBpZiAoZXZlbnQua2V5LnRvTG93ZXJDYXNlKCkgPT09ICcgJykgeyAvLyBTcGFjZWJhclxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJKdW1wKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZWNvcmRzIHdoaWNoIGtleXMgYXJlIGN1cnJlbnRseSByZWxlYXNlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbktleVVwKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5rZXlzW2V2ZW50LmtleS50b0xvd2VyQ2FzZSgpXSA9IGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBtb3VzZSBtb3ZlbWVudCBmb3IgY2FtZXJhIHJvdGF0aW9uIChtb3VzZSBsb29rKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbk1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIC8vIE9ubHkgcHJvY2VzcyBtb3VzZSBtb3ZlbWVudCBpZiB0aGUgZ2FtZSBpcyBwbGF5aW5nIGFuZCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICBjb25zdCBtb3ZlbWVudFggPSBldmVudC5tb3ZlbWVudFggfHwgMDtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRZID0gZXZlbnQubW92ZW1lbnRZIHx8IDA7XHJcblxyXG4gICAgICAgICAgICAvLyBBcHBseSBob3Jpem9udGFsIHJvdGF0aW9uICh5YXcpIHRvIHRoZSBjYW1lcmFDb250YWluZXIgYXJvdW5kIGl0cyBsb2NhbCBZLWF4aXMgKHdoaWNoIGlzIGdsb2JhbCBZKVxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYUNvbnRhaW5lci5yb3RhdGlvbi55IC09IG1vdmVtZW50WCAqIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tb3VzZVNlbnNpdGl2aXR5O1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwbHkgdmVydGljYWwgcm90YXRpb24gKHBpdGNoKSB0byB0aGUgY2FtZXJhIGl0c2VsZiBhbmQgY2xhbXAgaXRcclxuICAgICAgICAgICAgLy8gTW91c2UgVVAgKG1vdmVtZW50WSA8IDApIG5vdyBpbmNyZWFzZXMgY2FtZXJhUGl0Y2ggLT4gbG9va3MgdXAuXHJcbiAgICAgICAgICAgIC8vIE1vdXNlIERPV04gKG1vdmVtZW50WSA+IDApIG5vdyBkZWNyZWFzZXMgY2FtZXJhUGl0Y2ggLT4gbG9va3MgZG93bi5cclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFQaXRjaCAtPSBtb3ZlbWVudFkgKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTsgXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggPSBNYXRoLm1heCgtTWF0aC5QSSAvIDIsIE1hdGgubWluKE1hdGguUEkgLyAyLCB0aGlzLmNhbWVyYVBpdGNoKSk7IC8vIENsYW1wIHRvIC05MCB0byArOTAgZGVncmVlc1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5yb3RhdGlvbi54ID0gdGhpcy5jYW1lcmFQaXRjaDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IEhhbmRsZXMgbW91c2UgY2xpY2sgZm9yIGZpcmluZyBidWxsZXRzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uTW91c2VEb3duKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmIHRoaXMuaXNQb2ludGVyTG9ja2VkICYmIGV2ZW50LmJ1dHRvbiA9PT0gMCkgeyAvLyBMZWZ0IG1vdXNlIGJ1dHRvblxyXG4gICAgICAgICAgICB0aGlzLmZpcmVCdWxsZXQoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IEZpcmVzIGEgYnVsbGV0IGZyb20gdGhlIHBsYXllcidzIGNhbWVyYSBwb3NpdGlvbiBhbmQgZGlyZWN0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGZpcmVCdWxsZXQoKSB7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0Q29uZmlnID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldDtcclxuXHJcbiAgICAgICAgLy8gMS4gR2V0IGJ1bGxldCBpbml0aWFsIHBvc2l0aW9uIGFuZCBkaXJlY3Rpb25cclxuICAgICAgICBjb25zdCBjYW1lcmFXb3JsZFBvc2l0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5nZXRXb3JsZFBvc2l0aW9uKGNhbWVyYVdvcmxkUG9zaXRpb24pO1xyXG5cclxuICAgICAgICBjb25zdCBjYW1lcmFXb3JsZERpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuZ2V0V29ybGREaXJlY3Rpb24oY2FtZXJhV29ybGREaXJlY3Rpb24pO1xyXG5cclxuICAgICAgICAvLyAyLiBDcmVhdGUgVGhyZWUuanMgTWVzaCBmb3IgdGhlIGJ1bGxldFxyXG4gICAgICAgIGNvbnN0IGJ1bGxldE1lc2ggPSBuZXcgVEhSRUUuTWVzaCh0aGlzLmJ1bGxldEdlb21ldHJ5LCB0aGlzLmJ1bGxldE1hdGVyaWFsTWVzaCk7XHJcbiAgICAgICAgYnVsbGV0TWVzaC5wb3NpdGlvbi5jb3B5KGNhbWVyYVdvcmxkUG9zaXRpb24pO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKGJ1bGxldE1lc2gpO1xyXG5cclxuICAgICAgICAvLyAzLiBDcmVhdGUgQ2Fubm9uLmpzIEJvZHkgZm9yIHRoZSBidWxsZXRcclxuICAgICAgICBjb25zdCBidWxsZXRTaGFwZSA9IG5ldyBDQU5OT04uU3BoZXJlKGJ1bGxldENvbmZpZy5kaW1lbnNpb25zLnJhZGl1cyk7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0Qm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgIG1hc3M6IGJ1bGxldENvbmZpZy5tYXNzLFxyXG4gICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKGNhbWVyYVdvcmxkUG9zaXRpb24ueCwgY2FtZXJhV29ybGRQb3NpdGlvbi55LCBjYW1lcmFXb3JsZFBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICBzaGFwZTogYnVsbGV0U2hhcGUsXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLmJ1bGxldE1hdGVyaWFsLFxyXG4gICAgICAgICAgICAvLyBCdWxsZXRzIHNob3VsZCBub3QgYmUgYWZmZWN0ZWQgYnkgcGxheWVyIG1vdmVtZW50LCBidXQgc2hvdWxkIGhhdmUgZ3Jhdml0eVxyXG4gICAgICAgICAgICBsaW5lYXJEYW1waW5nOiAwLjAxLCAvLyBTbWFsbCBkYW1waW5nIHRvIHByZXZlbnQgaW5maW5pdGUgc2xpZGluZ1xyXG4gICAgICAgICAgICBhbmd1bGFyRGFtcGluZzogMC45OSAvLyBBbGxvd3Mgc29tZSByb3RhdGlvbiwgYnV0IHN0b3BzIHF1aWNrbHlcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gU2V0IGJ1bGxldCBpbml0aWFsIHZlbG9jaXR5XHJcbiAgICAgICAgYnVsbGV0Qm9keS52ZWxvY2l0eS5zZXQoXHJcbiAgICAgICAgICAgIGNhbWVyYVdvcmxkRGlyZWN0aW9uLnggKiBidWxsZXRDb25maWcuc3BlZWQsXHJcbiAgICAgICAgICAgIGNhbWVyYVdvcmxkRGlyZWN0aW9uLnkgKiBidWxsZXRDb25maWcuc3BlZWQsXHJcbiAgICAgICAgICAgIGNhbWVyYVdvcmxkRGlyZWN0aW9uLnogKiBidWxsZXRDb25maWcuc3BlZWRcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBTdG9yZSBhIHJlZmVyZW5jZSB0byB0aGUgYWN0aXZlIGJ1bGxldCBvYmplY3Qgb24gdGhlIGJvZHkgZm9yIGNvbGxpc2lvbiBjYWxsYmFja1xyXG4gICAgICAgIGNvbnN0IGFjdGl2ZUJ1bGxldDogQWN0aXZlQnVsbGV0ID0ge1xyXG4gICAgICAgICAgICBtZXNoOiBidWxsZXRNZXNoLFxyXG4gICAgICAgICAgICBib2R5OiBidWxsZXRCb2R5LFxyXG4gICAgICAgICAgICBjcmVhdGlvblRpbWU6IHRoaXMubGFzdFRpbWUgLyAxMDAwLCAvLyBTdG9yZSBjcmVhdGlvbiB0aW1lIGluIHNlY29uZHNcclxuICAgICAgICAgICAgZmlyZVBvc2l0aW9uOiBidWxsZXRCb2R5LnBvc2l0aW9uLmNsb25lKCkgLy8gU3RvcmUgaW5pdGlhbCBmaXJlIHBvc2l0aW9uIGZvciByYW5nZSBjaGVja1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgYWN0aXZlQnVsbGV0LmNvbGxpZGVIYW5kbGVyID0gKGV2ZW50OiBDb2xsaWRlRXZlbnQpID0+IHRoaXMub25CdWxsZXRDb2xsaWRlKGV2ZW50LCBhY3RpdmVCdWxsZXQpOyAvLyBTdG9yZSBzcGVjaWZpYyBoYW5kbGVyXHJcbiAgICAgICAgYnVsbGV0Qm9keS51c2VyRGF0YSA9IGFjdGl2ZUJ1bGxldDsgLy8gQXR0YWNoIHRoZSBhY3RpdmVCdWxsZXQgb2JqZWN0IHRvIHRoZSBDYW5ub24uQm9keVxyXG5cclxuICAgICAgICBidWxsZXRCb2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbGxpZGUnLCBhY3RpdmVCdWxsZXQuY29sbGlkZUhhbmRsZXIpOyAvLyBVc2UgdGhlIHN0b3JlZCBoYW5kbGVyXHJcblxyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keShidWxsZXRCb2R5KTtcclxuICAgICAgICB0aGlzLmJ1bGxldHMucHVzaChhY3RpdmVCdWxsZXQpO1xyXG5cclxuICAgICAgICAvLyBQbGF5IHNob290IHNvdW5kXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdzaG9vdF9zb3VuZCcpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIlNob290IHNvdW5kIHBsYXkgZGVuaWVkOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IEhhbmRsZXMgYnVsbGV0IGNvbGxpc2lvbnMuXHJcbiAgICAgKiBAcGFyYW0gZXZlbnQgVGhlIENhbm5vbi5qcyBjb2xsaXNpb24gZXZlbnQuXHJcbiAgICAgKiBAcGFyYW0gYnVsbGV0IFRoZSBBY3RpdmVCdWxsZXQgaW5zdGFuY2UgdGhhdCBjb2xsaWRlZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbkJ1bGxldENvbGxpZGUoZXZlbnQ6IENvbGxpZGVFdmVudCwgYnVsbGV0OiBBY3RpdmVCdWxsZXQpIHtcclxuICAgICAgICAvLyBJZiB0aGUgYnVsbGV0IGhhcyBhbHJlYWR5IGJlZW4gcmVtb3ZlZCBvciBtYXJrZWQgZm9yIHJlbW92YWwsIGRvIG5vdGhpbmcuXHJcbiAgICAgICAgaWYgKCF0aGlzLmJ1bGxldHMuaW5jbHVkZXMoYnVsbGV0KSB8fCBidWxsZXQuc2hvdWxkUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbGxpZGVkQm9keSA9IGV2ZW50LmJvZHk7IC8vIFRoZSBib2R5IHRoYXQgdGhlIGJ1bGxldCAoZXZlbnQudGFyZ2V0KSBjb2xsaWRlZCB3aXRoXHJcbiAgICAgICAgY29uc3Qgb3RoZXJCb2R5VXNlckRhdGEgPSBjb2xsaWRlZEJvZHkudXNlckRhdGE7IC8vIFJldHJpZXZlIHVzZXJEYXRhIGZvciB0aGUgY29sbGlkZWQgYm9keVxyXG5cclxuICAgICAgICBjb25zdCBpc0dyb3VuZCA9IGNvbGxpZGVkQm9keSA9PT0gdGhpcy5ncm91bmRCb2R5O1xyXG4gICAgICAgIGNvbnN0IGlzUGxhY2VkT2JqZWN0ID0gdGhpcy5wbGFjZWRPYmplY3RCb2RpZXMuaW5jbHVkZXMoY29sbGlkZWRCb2R5KTsgLy8gU3RhdGljIGJveGVzXHJcblxyXG4gICAgICAgIC8vIE5FVzogQ2hlY2sgaWYgY29sbGlkZWQgYm9keSBpcyBhbiBlbmVteSBieSBjaGVja2luZyBpdHMgdXNlckRhdGEgYW5kIHR5cGVDb25maWdcclxuICAgICAgICBjb25zdCBpc0VuZW15ID0gb3RoZXJCb2R5VXNlckRhdGEgJiYgKG90aGVyQm9keVVzZXJEYXRhIGFzIEFjdGl2ZUVuZW15KS50eXBlQ29uZmlnICE9PSB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgIGlmIChpc0dyb3VuZCB8fCBpc1BsYWNlZE9iamVjdCkge1xyXG4gICAgICAgICAgICAvLyBNYXJrIGJ1bGxldCBmb3IgcmVtb3ZhbCBpbnN0ZWFkIG9mIHJlbW92aW5nIGltbWVkaWF0ZWx5XHJcbiAgICAgICAgICAgIGJ1bGxldC5zaG91bGRSZW1vdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5hZGQoYnVsbGV0KTtcclxuICAgICAgICB9IGVsc2UgaWYgKGlzRW5lbXkpIHtcclxuICAgICAgICAgICAgY29uc3QgZW5lbXkgPSBvdGhlckJvZHlVc2VyRGF0YSBhcyBBY3RpdmVFbmVteTtcclxuICAgICAgICAgICAgaWYgKCFlbmVteS5zaG91bGRSZW1vdmUpIHsgLy8gRG9uJ3QgcHJvY2VzcyBoaXRzIG9uIGVuZW1pZXMgYWxyZWFkeSBtYXJrZWQgZm9yIHJlbW92YWxcclxuICAgICAgICAgICAgICAgIGVuZW15LmN1cnJlbnRIZWFsdGgtLTtcclxuICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLmdldCgnaGl0X3NvdW5kJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiSGl0IHNvdW5kIHBsYXkgZGVuaWVkOlwiLCBlKSk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRW5lbXkgJHtlbmVteS5uYW1lfSBoaXQhIEhlYWx0aDogJHtlbmVteS5jdXJyZW50SGVhbHRofWApO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChlbmVteS5jdXJyZW50SGVhbHRoIDw9IDApIHtcclxuICAgICAgICAgICAgICAgICAgICBlbmVteS5zaG91bGRSZW1vdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllc1RvUmVtb3ZlLmFkZChlbmVteSk7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zY29yZSArPSBlbmVteS50eXBlQ29uZmlnLnNjb3JlVmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy51cGRhdGVTY29yZURpc3BsYXkoKTsgLy8gVXBkYXRlIHNjb3JlIFVJXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdlbmVteV9kZWF0aF9zb3VuZCcpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkVuZW15IGRlYXRoIHNvdW5kIHBsYXkgZGVuaWVkOlwiLCBlKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYEVuZW15ICR7ZW5lbXkubmFtZX0gZGVmZWF0ZWQhIFNjb3JlOiAke3RoaXMuc2NvcmV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gTU9ESUZJQ0FUSU9OOiBEZWFjdGl2YXRlIGVuZW15IHBoeXNpY3MgYm9keSBpbW1lZGlhdGVseSB1cG9uIGRlYXRoXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBwcmV2ZW50cyBmdXJ0aGVyIHBoeXNpY3MgaW50ZXJhY3Rpb25zIChsaWtlIHBsYXllci1lbmVteSBjb250YWN0KVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIGZvciBhIGJvZHkgdGhhdCBpcyBhYm91dCB0byBiZSByZW1vdmVkLCByZWR1Y2luZyBwb3RlbnRpYWwgcnVudGltZSBlcnJvcnMuXHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkuYm9keS5zbGVlcCgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIC8vIEJ1bGxldCBhbHdheXMgZGlzYXBwZWFycyBvbiBoaXR0aW5nIGFuIGVuZW15XHJcbiAgICAgICAgICAgIGJ1bGxldC5zaG91bGRSZW1vdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5hZGQoYnVsbGV0KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IEl0ZXJhdGVzIHRocm91Z2ggYnVsbGV0cyB0byBtYXJrIHRoZW0gZm9yIHJlbW92YWwgYmFzZWQgb24gbGlmZXRpbWUsIHJhbmdlLCBvciBvdXQtb2YtYm91bmRzLlxyXG4gICAgICogQWN0dWFsIHJlbW92YWwgaXMgZGVmZXJyZWQgdG8gYHBlcmZvcm1CdWxsZXRSZW1vdmFsc2AuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlQnVsbGV0cyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gdGhpcy5sYXN0VGltZSAvIDEwMDA7IC8vIEN1cnJlbnQgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcbiAgICAgICAgY29uc3QgYnVsbGV0Q29uZmlnID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmJ1bGxldDtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmJ1bGxldHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0ID0gdGhpcy5idWxsZXRzW2ldO1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgYWxyZWFkeSBtYXJrZWQgZm9yIHJlbW92YWwgYnkgY29sbGlzaW9uIG9yIHByZXZpb3VzIGNoZWNrLCBza2lwIGZ1cnRoZXIgcHJvY2Vzc2luZyBmb3IgdGhpcyBidWxsZXQgdGhpcyBmcmFtZS5cclxuICAgICAgICAgICAgaWYgKGJ1bGxldC5zaG91bGRSZW1vdmUpIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBsaWZldGltZVxyXG4gICAgICAgICAgICBpZiAoY3VycmVudFRpbWUgLSBidWxsZXQuY3JlYXRpb25UaW1lID4gYnVsbGV0Q29uZmlnLmxpZmV0aW1lKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmFkZChidWxsZXQpO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIG91dHNpZGUgbWFwIGJvdW5kYXJpZXMgb3IgaWYgaXQgd2VudCB0b28gZmFyIGZyb20gaXRzIGZpcmluZyBwb2ludFxyXG4gICAgICAgICAgICBjb25zdCBidWxsZXRQb3MgPSBidWxsZXQuYm9keS5wb3NpdGlvbjtcclxuICAgICAgICAgICAgY29uc3QgZGlzdGFuY2VUb0ZpcmVQb2ludCA9IGJ1bGxldFBvcy5kaXN0YW5jZVRvKGJ1bGxldC5maXJlUG9zaXRpb24pO1xyXG5cclxuICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0UG9zLnggPiBoYWxmR3JvdW5kU2l6ZSB8fCBidWxsZXRQb3MueCA8IC1oYWxmR3JvdW5kU2l6ZSB8fFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0UG9zLnogPiBoYWxmR3JvdW5kU2l6ZSB8fCBidWxsZXRQb3MueiA8IC1oYWxmR3JvdW5kU2l6ZSB8fFxyXG4gICAgICAgICAgICAgICAgZGlzdGFuY2VUb0ZpcmVQb2ludCA+IGJ1bGxldENvbmZpZy5tYXhSYW5nZSB8fFxyXG4gICAgICAgICAgICAgICAgYnVsbGV0UG9zLnkgPCAtMTAgLy8gSWYgaXQgZmFsbHMgdmVyeSBmYXIgYmVsb3cgdGhlIGdyb3VuZFxyXG4gICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5zaG91bGRSZW1vdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzVG9SZW1vdmUuYWRkKGJ1bGxldCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFBlcmZvcm1zIHRoZSBhY3R1YWwgcmVtb3ZhbCBvZiBidWxsZXRzIG1hcmtlZCBmb3IgcmVtb3ZhbC5cclxuICAgICAqIFRoaXMgbWV0aG9kIGlzIGNhbGxlZCBhZnRlciB0aGUgcGh5c2ljcyBzdGVwIHRvIGF2b2lkIG1vZGlmeWluZyB0aGUgd29ybGQgZHVyaW5nIHBoeXNpY3MgY2FsY3VsYXRpb25zLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHBlcmZvcm1CdWxsZXRSZW1vdmFscygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGJ1bGxldFRvUmVtb3ZlIG9mIHRoaXMuYnVsbGV0c1RvUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIFRocmVlLmpzIHNjZW5lXHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKGJ1bGxldFRvUmVtb3ZlLm1lc2gpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGZyb20gQ2Fubm9uLmpzIHdvcmxkXHJcbiAgICAgICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShidWxsZXRUb1JlbW92ZS5ib2R5KTtcclxuXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBldmVudCBsaXN0ZW5lclxyXG4gICAgICAgICAgICBpZiAoYnVsbGV0VG9SZW1vdmUuY29sbGlkZUhhbmRsZXIpIHtcclxuICAgICAgICAgICAgICAgIGJ1bGxldFRvUmVtb3ZlLmJvZHkucmVtb3ZlRXZlbnRMaXN0ZW5lcignY29sbGlkZScsIGJ1bGxldFRvUmVtb3ZlLmNvbGxpZGVIYW5kbGVyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gUmVtb3ZlIGZyb20gdGhlIGFjdGl2ZSBidWxsZXRzIGFycmF5XHJcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5idWxsZXRzLmluZGV4T2YoYnVsbGV0VG9SZW1vdmUpO1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldHMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBDbGVhciB0aGUgc2V0IGZvciB0aGUgbmV4dCBmcmFtZVxyXG4gICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmNsZWFyKCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFVwZGF0ZXMgZW5lbXkgbW92ZW1lbnQgbG9naWMgKGNhbGN1bGF0ZXMgdmVsb2NpdHkgYW5kIHJvdGF0aW9uKS5cclxuICAgICAqIFRoZSBhY3R1YWwgbWVzaCBzeW5jaHJvbml6YXRpb24gaGFwcGVucyBpbiBzeW5jTWVzaGVzV2l0aEJvZGllcy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVFbmVtaWVzKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllckJvZHkpIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc3QgcGxheWVyUG9zID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uO1xyXG4gICAgICAgIGNvbnN0IGhhbGZHcm91bmRTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyAyO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGVuZW15IG9mIHRoaXMuZW5lbWllcykge1xyXG4gICAgICAgICAgICBpZiAoZW5lbXkuc2hvdWxkUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgZW5lbXlQb3MgPSBlbmVteS5ib2R5LnBvc2l0aW9uO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2xhbXAgZW5lbXkgcG9zaXRpb24gd2l0aGluIGdyb3VuZCBib3VuZGFyaWVzICpiZWZvcmUqIG1vdmVtZW50IHRvIGF2b2lkIGdldHRpbmcgc3R1Y2sgb3V0c2lkZVxyXG4gICAgICAgICAgICAvLyBUaGlzIHByZXZlbnRzIGVuZW1pZXMgZnJvbSB3YW5kZXJpbmcgb2ZmIHRoZSBtYXAgb3IgYmVpbmcgcHVzaGVkIHRvbyBmYXIuXHJcbiAgICAgICAgICAgIGNvbnN0IGhhbGZXaWR0aCA9IGVuZW15LnR5cGVDb25maWcuZGltZW5zaW9ucy53aWR0aCAvIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IGhhbGZEZXB0aCA9IGVuZW15LnR5cGVDb25maWcuZGltZW5zaW9ucy5kZXB0aCAvIDI7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAoZW5lbXlQb3MueCA+IGhhbGZHcm91bmRTaXplIC0gaGFsZldpZHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueCA9IGhhbGZHcm91bmRTaXplIC0gaGFsZldpZHRoOyBpZiAoZW5lbXkuYm9keS52ZWxvY2l0eS54ID4gMCkgZW5lbXkuYm9keS52ZWxvY2l0eS54ID0gMDsgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChlbmVteVBvcy54IDwgLWhhbGZHcm91bmRTaXplICsgaGFsZldpZHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueCA9IC1oYWxmR3JvdW5kU2l6ZSArIGhhbGZXaWR0aDsgaWYgKGVuZW15LmJvZHkudmVsb2NpdHkueCA8IDApIGVuZW15LmJvZHkudmVsb2NpdHkueCA9IDA7IH1cclxuXHJcbiAgICAgICAgICAgIGlmIChlbmVteVBvcy56ID4gaGFsZkdyb3VuZFNpemUgLSBoYWxmRGVwdGgpIHsgZW5lbXkuYm9keS5wb3NpdGlvbi56ID0gaGFsZkdyb3VuZFNpemUgLSBoYWxmRGVwdGg7IGlmIChlbmVteS5ib2R5LnZlbG9jaXR5LnogPiAwKSBlbmVteS5ib2R5LnZlbG9jaXR5LnogPSAwOyB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKGVuZW15UG9zLnogPCAtaGFsZkdyb3VuZFNpemUgKyBoYWxmRGVwdGgpIHsgZW5lbXkuYm9keS5wb3NpdGlvbi56ID0gLWhhbGZHcm91bmRTaXplICsgaGFsZkRlcHRoOyBpZiAoZW5lbXkuYm9keS52ZWxvY2l0eS56IDwgMCkgZW5lbXkuYm9keS52ZWxvY2l0eS56ID0gMDsgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGRpcmVjdGlvbiB0b3dhcmRzIHBsYXllciAoZmxhdHRlbmVkIHRvIFhaIHBsYW5lKVxyXG4gICAgICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBuZXcgQ0FOTk9OLlZlYzMoKTtcclxuICAgICAgICAgICAgcGxheWVyUG9zLnZzdWIoZW5lbXlQb3MsIGRpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIGRpcmVjdGlvbi55ID0gMDsgLy8gT25seSBjb25zaWRlciBob3Jpem9udGFsIG1vdmVtZW50XHJcbiAgICAgICAgICAgIGRpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFNldCBlbmVteSB2ZWxvY2l0eSBiYXNlZCBvbiBkaXJlY3Rpb24gYW5kIHNwZWVkXHJcbiAgICAgICAgICAgIGVuZW15LmJvZHkudmVsb2NpdHkueCA9IGRpcmVjdGlvbi54ICogZW5lbXkudHlwZUNvbmZpZy5zcGVlZDtcclxuICAgICAgICAgICAgZW5lbXkuYm9keS52ZWxvY2l0eS56ID0gZGlyZWN0aW9uLnogKiBlbmVteS50eXBlQ29uZmlnLnNwZWVkO1xyXG4gICAgICAgICAgICAvLyBlbmVteS5ib2R5LnZlbG9jaXR5LnkgaXMgbWFuYWdlZCBieSBncmF2aXR5LCBzbyB3ZSBkb24ndCBtb2RpZnkgaXQgaGVyZS5cclxuXHJcbiAgICAgICAgICAgIC8vIE1ha2UgZW5lbXkgbG9vayBhdCB0aGUgcGxheWVyICh5YXcgb25seSlcclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0Um90YXRpb25ZID0gTWF0aC5hdGFuMihkaXJlY3Rpb24ueCwgZGlyZWN0aW9uLnopOyAvLyBBbmdsZSBpbiByYWRpYW5zXHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRRdWF0ZXJuaW9uID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oZW5lbXkuYm9keS5xdWF0ZXJuaW9uLngsIGVuZW15LmJvZHkucXVhdGVybmlvbi55LCBlbmVteS5ib2R5LnF1YXRlcm5pb24ueiwgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLncpO1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRRdWF0ZXJuaW9uID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKS5zZXRGcm9tQXhpc0FuZ2xlKFxyXG4gICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCksXHJcbiAgICAgICAgICAgICAgICB0YXJnZXRSb3RhdGlvbllcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgLy8gU21vb3RoIHJvdGF0aW9uIGZvciBwaHlzaWNzIGJvZHlcclxuICAgICAgICAgICAgY29uc3Qgc2xlcnBlZFF1YXRlcm5pb24gPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpO1xyXG4gICAgICAgICAgICBzbGVycGVkUXVhdGVybmlvbi5zbGVycFF1YXRlcm5pb25zKGN1cnJlbnRRdWF0ZXJuaW9uLCB0YXJnZXRRdWF0ZXJuaW9uLCAwLjEpOyAvLyBTbW9vdGggZmFjdG9yIDAuMVxyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnF1YXRlcm5pb24uY29weShzbGVycGVkUXVhdGVybmlvbiBhcyB1bmtub3duIGFzIENBTk5PTi5RdWF0ZXJuaW9uKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFBlcmZvcm1zIHRoZSBhY3R1YWwgcmVtb3ZhbCBvZiBlbmVtaWVzIG1hcmtlZCBmb3IgcmVtb3ZhbC5cclxuICAgICAqIFRoaXMgbWV0aG9kIGlzIGNhbGxlZCBhZnRlciB0aGUgcGh5c2ljcyBzdGVwLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHBlcmZvcm1FbmVteVJlbW92YWxzKCkge1xyXG4gICAgICAgIGZvciAoY29uc3QgZW5lbXlUb1JlbW92ZSBvZiB0aGlzLmVuZW1pZXNUb1JlbW92ZSkge1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShlbmVteVRvUmVtb3ZlLm1lc2gpO1xyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoZW5lbXlUb1JlbW92ZS5ib2R5KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGluZGV4ID0gdGhpcy5lbmVtaWVzLmluZGV4T2YoZW5lbXlUb1JlbW92ZSk7XHJcbiAgICAgICAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZW5lbWllcy5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuZW5lbWllc1RvUmVtb3ZlLmNsZWFyKCk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcG9pbnRlciBsb2NrIHN0YXR1cyB3aGVuIGl0IGNoYW5nZXMgKGUuZy4sIHVzZXIgcHJlc3NlcyBFc2MpLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uUG9pbnRlckxvY2tDaGFuZ2UoKSB7XHJcbiAgICAgICAgaWYgKGRvY3VtZW50LnBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkubW96UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcyB8fFxyXG4gICAgICAgICAgICAoZG9jdW1lbnQgYXMgYW55KS53ZWJraXRQb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNQb2ludGVyTG9ja2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgbG9ja2VkJyk7XHJcbiAgICAgICAgICAgIC8vIFNob3cgY3Jvc3NoYWlyIG9ubHkgaWYgZ2FtZSBpcyBwbGF5aW5nIEFORCBwb2ludGVyIGlzIGxvY2tlZFxyXG4gICAgICAgICAgICBpZiAodGhpcy5jcm9zc2hhaXJFbGVtZW50ICYmIHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNyb3NzaGFpckVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUG9pbnRlciB1bmxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBIaWRlIGNyb3NzaGFpciB3aGVuIHBvaW50ZXIgaXMgdW5sb2NrZWRcclxuICAgICAgICAgICAgaWYgKHRoaXMuY3Jvc3NoYWlyRWxlbWVudCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jcm9zc2hhaXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBUaGUgbWFpbiBnYW1lIGxvb3AsIGNhbGxlZCBvbiBldmVyeSBhbmltYXRpb24gZnJhbWUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgYW5pbWF0ZSh0aW1lOiBET01IaWdoUmVzVGltZVN0YW1wKSB7XHJcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0ZS5iaW5kKHRoaXMpKTsgLy8gUmVxdWVzdCBuZXh0IGZyYW1lXHJcblxyXG4gICAgICAgIGNvbnN0IGRlbHRhVGltZSA9ICh0aW1lIC0gdGhpcy5sYXN0VGltZSkgLyAxMDAwOyAvLyBDYWxjdWxhdGUgZGVsdGEgdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgdGhpcy5sYXN0VGltZSA9IHRpbWU7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBsYXllck1vdmVtZW50KCk7IC8vIFVwZGF0ZSBwbGF5ZXIncyB2ZWxvY2l0eSBiYXNlZCBvbiBpbnB1dFxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUJ1bGxldHMoZGVsdGFUaW1lKTsgLy8gTkVXOiBNYXJrIGJ1bGxldHMgZm9yIHJlbW92YWxcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVFbmVtaWVzKGRlbHRhVGltZSk7IC8vIE5FVzogVXBkYXRlIGVuZW15IG1vdmVtZW50XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlUGh5c2ljcyhkZWx0YVRpbWUpOyAvLyBTdGVwIHRoZSBwaHlzaWNzIHdvcmxkXHJcbiAgICAgICAgICAgIHRoaXMucGVyZm9ybUJ1bGxldFJlbW92YWxzKCk7IC8vIE5FVzogUGVyZm9ybSBhY3R1YWwgYnVsbGV0IHJlbW92YWxzICphZnRlciogcGh5c2ljcyBzdGVwXHJcbiAgICAgICAgICAgIHRoaXMucGVyZm9ybUVuZW15UmVtb3ZhbHMoKTsgLy8gTkVXOiBQZXJmb3JtIGFjdHVhbCBlbmVteSByZW1vdmFscyAqYWZ0ZXIqIHBoeXNpY3Mgc3RlcFxyXG4gICAgICAgICAgICB0aGlzLmNsYW1wUGxheWVyUG9zaXRpb24oKTsgLy8gQ2xhbXAgcGxheWVyIHBvc2l0aW9uIHRvIHByZXZlbnQgZ29pbmcgYmV5b25kIGdyb3VuZCBlZGdlc1xyXG4gICAgICAgICAgICB0aGlzLnN5bmNNZXNoZXNXaXRoQm9kaWVzKCk7IC8vIFN5bmNocm9uaXplIHZpc3VhbCBtZXNoZXMgd2l0aCBwaHlzaWNzIGJvZGllc1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5yZW5kZXIodGhpcy5zY2VuZSwgdGhpcy5jYW1lcmEpOyAvLyBSZW5kZXIgdGhlIHNjZW5lXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTdGVwcyB0aGUgQ2Fubm9uLmpzIHBoeXNpY3Mgd29ybGQgZm9yd2FyZC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQaHlzaWNzKGRlbHRhVGltZTogbnVtYmVyKSB7XHJcbiAgICAgICAgLy8gd29ybGQuc3RlcChmaXhlZFRpbWVTdGVwLCBkZWx0YVRpbWUsIG1heFN1YlN0ZXBzKVxyXG4gICAgICAgIC8vIDEvNjA6IEEgZml4ZWQgdGltZSBzdGVwIG9mIDYwIHBoeXNpY3MgdXBkYXRlcyBwZXIgc2Vjb25kIChzdGFuZGFyZCkuXHJcbiAgICAgICAgLy8gZGVsdGFUaW1lOiBUaGUgYWN0dWFsIHRpbWUgZWxhcHNlZCBzaW5jZSB0aGUgbGFzdCByZW5kZXIgZnJhbWUuXHJcbiAgICAgICAgLy8gbWF4UGh5c2ljc1N1YlN0ZXBzOiBMaW1pdHMgdGhlIG51bWJlciBvZiBwaHlzaWNzIHN0ZXBzIGluIG9uZSByZW5kZXIgZnJhbWVcclxuICAgICAgICAvLyB0byBwcmV2ZW50IGluc3RhYmlsaXRpZXMgaWYgcmVuZGVyaW5nIHNsb3dzIGRvd24gc2lnbmlmaWNhbnRseS5cclxuICAgICAgICB0aGlzLndvcmxkLnN0ZXAoMSAvIDYwLCBkZWx0YVRpbWUsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5tYXhQaHlzaWNzU3ViU3RlcHMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXBkYXRlcyB0aGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gV0FTRCBpbnB1dCBhbmQgY2FtZXJhIG9yaWVudGF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVBsYXllck1vdmVtZW50KCkge1xyXG4gICAgICAgIC8vIFBsYXllciBtb3ZlbWVudCBzaG91bGQgb25seSBoYXBwZW4gd2hlbiB0aGUgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAoIXRoaXMuaXNQb2ludGVyTG9ja2VkKSB7XHJcbiAgICAgICAgICAgIC8vIElmIHBvaW50ZXIgaXMgbm90IGxvY2tlZCwgc3RvcCBob3Jpem9udGFsIG1vdmVtZW50IGltbWVkaWF0ZWx5XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICByZXR1cm47IC8vIEV4aXQgZWFybHkgYXMgbm8gbW92ZW1lbnQgaW5wdXQgc2hvdWxkIGJlIHByb2Nlc3NlZFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGVmZmVjdGl2ZVBsYXllclNwZWVkID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllclNwZWVkO1xyXG5cclxuICAgICAgICAvLyBNT0RJRklFRDogQXBwbHkgYWlyIGNvbnRyb2wgZmFjdG9yIGlmIHBsYXllciBpcyBpbiB0aGUgYWlyIChubyBjb250YWN0cyB3aXRoIGFueSBzdGF0aWMgc3VyZmFjZSlcclxuICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9PT0gMCkge1xyXG4gICAgICAgICAgICBlZmZlY3RpdmVQbGF5ZXJTcGVlZCAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyQ29udHJvbEZhY3RvcjsgLy8gVXNlIGNvbmZpZ3VyYWJsZSBhaXIgY29udHJvbCBmYWN0b3JcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY3VycmVudFlWZWxvY2l0eSA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55OyAvLyBQcmVzZXJ2ZSB2ZXJ0aWNhbCB2ZWxvY2l0eVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1vdmVEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAwKTsgLy8gVXNlIGEgVEhSRUUuVmVjdG9yMyBmb3IgY2FsY3VsYXRpb24gZWFzZVxyXG5cclxuICAgICAgICAvLyBHZXQgY2FtZXJhQ29udGFpbmVyJ3MgZm9yd2FyZCB2ZWN0b3IgKGhvcml6b250YWwgZGlyZWN0aW9uIHBsYXllciBpcyBsb29raW5nKVxyXG4gICAgICAgIGNvbnN0IGNhbWVyYURpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIuZ2V0V29ybGREaXJlY3Rpb24oY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ueSA9IDA7IC8vIEZsYXR0ZW4gdGhlIHZlY3RvciB0byByZXN0cmljdCBtb3ZlbWVudCB0byB0aGUgaG9yaXpvbnRhbCBwbGFuZVxyXG4gICAgICAgIGNhbWVyYURpcmVjdGlvbi5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgY29uc3QgZ2xvYmFsVXAgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKTsgLy8gRGVmaW5lIGdsb2JhbCB1cCB2ZWN0b3IgZm9yIGNyb3NzIHByb2R1Y3RcclxuXHJcbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSAncmlnaHQnIHZlY3RvciByZWxhdGl2ZSB0byBjYW1lcmEncyBmb3J3YXJkIGRpcmVjdGlvblxyXG4gICAgICAgIGNvbnN0IGNhbWVyYVJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuICAgICAgICBjYW1lcmFSaWdodC5jcm9zc1ZlY3RvcnMoZ2xvYmFsVXAsIGNhbWVyYURpcmVjdGlvbikubm9ybWFsaXplKCk7IFxyXG5cclxuICAgICAgICBsZXQgbW92aW5nID0gZmFsc2U7XHJcbiAgICAgICAgLy8gVyA8LT4gUyBzd2FwIGZyb20gdXNlcidzIGNvbW1lbnRzIGluIG9yaWdpbmFsIGNvZGU6XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sncyddKSB7IC8vICdzJyBrZXkgbm93IG1vdmVzIGZvcndhcmRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5hZGQoY2FtZXJhRGlyZWN0aW9uKTtcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1sndyddKSB7IC8vICd3JyBrZXkgbm93IG1vdmVzIGJhY2t3YXJkXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uc3ViKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIEEgYW5kIEQgY29udHJvbHMgYXMgc3RhbmRhcmQ6XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snYSddKSB7IC8vICdhJyBrZXkgbm93IHN0cmFmZXMgbGVmdFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFSaWdodCk7IFxyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5rZXlzWydkJ10pIHsgLy8gJ2QnIGtleSBub3cgc3RyYWZlcyByaWdodFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLmFkZChjYW1lcmFSaWdodCk7IFxyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKG1vdmluZykge1xyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLm5vcm1hbGl6ZSgpLm11bHRpcGx5U2NhbGFyKGVmZmVjdGl2ZVBsYXllclNwZWVkKTtcclxuICAgICAgICAgICAgLy8gRGlyZWN0bHkgc2V0IHRoZSBob3Jpem9udGFsIHZlbG9jaXR5IGNvbXBvbmVudHMuXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gbW92ZURpcmVjdGlvbi54O1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IG1vdmVEaXJlY3Rpb24uejtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBJZiBubyBtb3ZlbWVudCBrZXlzIGFyZSBwcmVzc2VkOlxyXG4gICAgICAgICAgICAvLyBNT0RJRklFRDogQXBwbHkgYWlyIGRlY2VsZXJhdGlvbiBpZiBwbGF5ZXIgaXMgaW4gdGhlIGFpclxyXG4gICAgICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckFpckRlY2VsZXJhdGlvbjtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBQbGF5ZXIgaXMgb24gdGhlIGdyb3VuZCBvciBhIHN0YXRpYyBvYmplY3Q6IENhbm5vbi5qcyBDb250YWN0TWF0ZXJpYWwgZnJpY3Rpb24gd2lsbCBoYW5kbGUgZGVjZWxlcmF0aW9uLlxyXG4gICAgICAgICAgICAgICAgLy8gTm8gZXhwbGljaXQgdmVsb2NpdHkgZGVjYXkgaXMgYXBwbGllZCBoZXJlIGZvciBncm91bmQgbW92ZW1lbnQuXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSBjdXJyZW50WVZlbG9jaXR5OyAvLyBSZXN0b3JlIFkgdmVsb2NpdHkgKGdyYXZpdHkvanVtcHMpXHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBBRERFRDogQXBwbGllcyBhbiB1cHdhcmQgaW1wdWxzZSB0byB0aGUgcGxheWVyIGJvZHkgZm9yIGp1bXBpbmcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgcGxheWVySnVtcCgpIHtcclxuICAgICAgICAvLyBNT0RJRklFRDogT25seSBhbGxvdyBqdW1wIGlmIHRoZSBwbGF5ZXIgaXMgY3VycmVudGx5IG9uIGFueSBzdGF0aWMgc3VyZmFjZSAoZ3JvdW5kIG9yIG9iamVjdClcclxuICAgICAgICBpZiAodGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA+IDApIHtcclxuICAgICAgICAgICAgLy8gQ2xlYXIgYW55IGV4aXN0aW5nIHZlcnRpY2FsIHZlbG9jaXR5IHRvIGVuc3VyZSBhIGNvbnNpc3RlbnQganVtcCBoZWlnaHRcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnkgPSAwOyBcclxuICAgICAgICAgICAgLy8gQXBwbHkgYW4gdXB3YXJkIGltcHVsc2UgKG1hc3MgKiBjaGFuZ2VfaW5fdmVsb2NpdHkpXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5hcHBseUltcHVsc2UoXHJcbiAgICAgICAgICAgICAgICBuZXcgQ0FOTk9OLlZlYzMoMCwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmp1bXBGb3JjZSwgMCksXHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24gLy8gQXBwbHkgaW1wdWxzZSBhdCB0aGUgY2VudGVyIG9mIG1hc3NcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDbGFtcHMgdGhlIHBsYXllcidzIHBvc2l0aW9uIHdpdGhpbiB0aGUgZGVmaW5lZCBncm91bmQgYm91bmRhcmllcy5cclxuICAgICAqIFByZXZlbnRzIHRoZSBwbGF5ZXIgZnJvbSBtb3ZpbmcgYmV5b25kIHRoZSAnZW5kIG9mIHRoZSB3b3JsZCcuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY2xhbXBQbGF5ZXJQb3NpdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMucGxheWVyQm9keSB8fCAhdGhpcy5jb25maWcpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaGFsZkdyb3VuZFNpemUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSAvIDI7XHJcbiAgICAgICAgY29uc3QgcGxheWVySGFsZldpZHRoID0gMC41OyAvLyBGcm9tIEJveEdlb21ldHJ5KDEsMiwxKSBoYWxmIGV4dGVudHMgZm9yIENhbm5vbi5qc1xyXG5cclxuICAgICAgICBsZXQgcG9zWCA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi54O1xyXG4gICAgICAgIGxldCBwb3NaID0gdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLno7XHJcbiAgICAgICAgbGV0IHZlbFggPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueDtcclxuICAgICAgICBsZXQgdmVsWiA9IHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56O1xyXG5cclxuICAgICAgICAvLyBDbGFtcCBYIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKHBvc1ggPiBoYWxmR3JvdW5kU2l6ZSAtIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueCA9IGhhbGZHcm91bmRTaXplIC0gcGxheWVySGFsZldpZHRoO1xyXG4gICAgICAgICAgICBpZiAodmVsWCA+IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAocG9zWCA8IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueCA9IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aDtcclxuICAgICAgICAgICAgaWYgKHZlbFggPCAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsYW1wIFogcG9zaXRpb25cclxuICAgICAgICBpZiAocG9zWiA+IGhhbGZHcm91bmRTaXplIC0gcGxheWVySGFsZldpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gaGFsZkdyb3VuZFNpemUgLSBwbGF5ZXJIYWxmV2lkdGg7XHJcbiAgICAgICAgICAgIGlmICh2ZWxaID4gMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmIChwb3NaIDwgLWhhbGZHcm91bmRTaXplICsgcGxheWVySGFsZldpZHRoKSB7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56ID0gLWhhbGZHcm91bmRTaXplICsgcGxheWVySGFsZldpZHRoO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA8IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN5bmNocm9uaXplcyB0aGUgdmlzdWFsIG1lc2hlcyB3aXRoIHRoZWlyIGNvcnJlc3BvbmRpbmcgcGh5c2ljcyBib2RpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc3luY01lc2hlc1dpdGhCb2RpZXMoKSB7XHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggcG9zaXRpb24gd2l0aCBpdHMgcGh5c2ljcyBib2R5J3MgcG9zaXRpb25cclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBjYW1lcmFDb250YWluZXIgcG9zaXRpb24gd2l0aCB0aGUgcGxheWVyJ3MgcGh5c2ljcyBib2R5J3MgcG9zaXRpb24uXHJcbiAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucG9zaXRpb24uY29weSh0aGlzLnBsYXllckJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuXHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgcGxheWVyJ3MgdmlzdWFsIG1lc2ggaG9yaXpvbnRhbCByb3RhdGlvbiAoeWF3KSB3aXRoIGNhbWVyYUNvbnRhaW5lcidzIHlhdy5cclxuICAgICAgICB0aGlzLnBsYXllck1lc2gucXVhdGVybmlvbi5jb3B5KHRoaXMuY2FtZXJhQ29udGFpbmVyLnF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAvLyBUaGUgZ3JvdW5kIGFuZCBwbGFjZWQgb2JqZWN0cyBhcmUgY3VycmVudGx5IHN0YXRpYyAobWFzcyAwKSwgc28gdGhlaXIgdmlzdWFsIG1lc2hlc1xyXG4gICAgICAgIC8vIGRvIG5vdCBuZWVkIHRvIGJlIHN5bmNocm9uaXplZCB3aXRoIHRoZWlyIHBoeXNpY3MgYm9kaWVzIGFmdGVyIGluaXRpYWwgcGxhY2VtZW50LlxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIGJ1bGxldCBtZXNoZXMgd2l0aCB0aGVpciBwaHlzaWNzIGJvZGllc1xyXG4gICAgICAgIGZvciAoY29uc3QgYnVsbGV0IG9mIHRoaXMuYnVsbGV0cykge1xyXG4gICAgICAgICAgICBpZiAoIWJ1bGxldC5zaG91bGRSZW1vdmUpIHtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5tZXNoLnBvc2l0aW9uLmNvcHkoYnVsbGV0LmJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICAgICAgICAgIGJ1bGxldC5tZXNoLnF1YXRlcm5pb24uY29weShidWxsZXQuYm9keS5xdWF0ZXJuaW9uIGFzIHVua25vd24gYXMgVEhSRUUuUXVhdGVybmlvbik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE5FVzogU3luY2hyb25pemUgZW5lbXkgbWVzaGVzIHdpdGggdGhlaXIgcGh5c2ljcyBib2RpZXNcclxuICAgICAgICBmb3IgKGNvbnN0IGVuZW15IG9mIHRoaXMuZW5lbWllcykge1xyXG4gICAgICAgICAgICBpZiAoIWVuZW15LnNob3VsZFJlbW92ZSkge1xyXG4gICAgICAgICAgICAgICAgZW5lbXkubWVzaC5wb3NpdGlvbi5jb3B5KGVuZW15LmJvZHkucG9zaXRpb24gYXMgdW5rbm93biBhcyBUSFJFRS5WZWN0b3IzKTtcclxuICAgICAgICAgICAgICAgIGVuZW15Lm1lc2gucXVhdGVybmlvbi5jb3B5KGVuZW15LmJvZHkucXVhdGVybmlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlF1YXRlcm5pb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBTdGFydCB0aGUgZ2FtZSB3aGVuIHRoZSBET00gY29udGVudCBpcyBmdWxseSBsb2FkZWRcclxuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcclxu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
