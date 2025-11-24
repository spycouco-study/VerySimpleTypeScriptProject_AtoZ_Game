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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiZ2FtZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuXHJcbi8vIEFkZCBtb2R1bGUgYXVnbWVudGF0aW9uIGZvciBDQU5OT04uQm9keSB0byBpbmNsdWRlIHVzZXJEYXRhIGZvciBib3RoIGJ1bGxldHMgYW5kIGVuZW1pZXNcclxuZGVjbGFyZSBtb2R1bGUgJ2Nhbm5vbi1lcycge1xyXG4gICAgaW50ZXJmYWNlIEJvZHkge1xyXG4gICAgICAgIHVzZXJEYXRhPzogQWN0aXZlQnVsbGV0IHwgQWN0aXZlRW5lbXk7IC8vIEF0dGFjaCB0aGUgQWN0aXZlQnVsbGV0IG9yIEFjdGl2ZUVuZW15IGluc3RhbmNlXHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIERlZmluZSBpbnRlcmZhY2UgZm9yIHRoZSBDYW5ub24tZXMgJ2NvbGxpZGUnIGV2ZW50XHJcbmludGVyZmFjZSBDb2xsaWRlRXZlbnQge1xyXG4gICAgLy8gVGhlIHR5cGUgcHJvcGVydHkgaXMgdXN1YWxseSBwcmVzZW50IG9uIGFsbCBDYW5ub24uanMgZXZlbnRzXHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICAvLyBUaGUgJ2NvbGxpZGUnIGV2ZW50IHNwZWNpZmljYWxseSBoYXMgdGhlc2UgcHJvcGVydGllczpcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5OyAvLyBUaGUgb3RoZXIgYm9keSBpbnZvbHZlZCBpbiB0aGUgY29sbGlzaW9uXHJcbiAgICB0YXJnZXQ6IENBTk5PTi5Cb2R5OyAvLyBUaGUgYm9keSB0aGF0IHRoZSBldmVudCBsaXN0ZW5lciBpcyBhdHRhY2hlZCB0byAoZS5nLiwgdGhlIGJ1bGxldEJvZHkpXHJcbiAgICBjb250YWN0OiBDQU5OT04uQ29udGFjdEVxdWF0aW9uOyAvLyBUaGUgY29udGFjdCBlcXVhdGlvbiBvYmplY3RcclxufVxyXG5cclxuLy8gRW51bSB0byBkZWZpbmUgdGhlIHBvc3NpYmxlIHN0YXRlcyBvZiB0aGUgZ2FtZVxyXG5lbnVtIEdhbWVTdGF0ZSB7XHJcbiAgICBUSVRMRSwgICAvLyBUaXRsZSBzY3JlZW4sIHdhaXRpbmcgZm9yIHVzZXIgaW5wdXRcclxuICAgIFBMQVlJTkcgIC8vIEdhbWUgaXMgYWN0aXZlLCB1c2VyIGNhbiBtb3ZlIGFuZCBsb29rIGFyb3VuZFxyXG59XHJcblxyXG4vLyBJbnRlcmZhY2UgZm9yIHN0YXRpYyBvYmplY3RzIChib3hlcykgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkT2JqZWN0Q29uZmlnIHtcclxuICAgIG5hbWU6IHN0cmluZzsgLy8gQSBkZXNjcmlwdGl2ZSBuYW1lIGZvciB0aGUgb2JqZWN0IGluc3RhbmNlXHJcbiAgICB0ZXh0dXJlTmFtZTogc3RyaW5nOyAvLyBOYW1lIG9mIHRoZSB0ZXh0dXJlIGZyb20gYXNzZXRzLmltYWdlc1xyXG4gICAgdHlwZTogJ2JveCc7IC8vIEV4cGxpY2l0bHkgJ2JveCdcclxuICAgIHBvc2l0aW9uOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcclxuICAgIGRpbWVuc2lvbnM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGRlcHRoOiBudW1iZXIgfTtcclxuICAgIHJvdGF0aW9uWT86IG51bWJlcjsgLy8gT3B0aW9uYWwgcm90YXRpb24gYXJvdW5kIFktYXhpcyAocmFkaWFucylcclxuICAgIG1hc3M6IG51bWJlcjsgLy8gMCBmb3Igc3RhdGljXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBlbmVteSB0eXBlIGRlZmluaXRpb25zIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBFbmVteVR5cGVDb25maWcge1xyXG4gICAgbmFtZTogc3RyaW5nOyAvLyBlLmcuLCBcImJhc2ljX2VuZW15XCJcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyOyBkZXB0aDogbnVtYmVyIH07XHJcbiAgICBtYXNzOiBudW1iZXI7XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgaGVhbHRoOiBudW1iZXI7XHJcbiAgICBzY29yZVZhbHVlOiBudW1iZXI7XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBzcGVjaWZpYyBlbmVteSBpbnN0YW5jZXMgcGxhY2VkIGluIHRoZSBzY2VuZVxyXG5pbnRlcmZhY2UgUGxhY2VkRW5lbXlJbnN0YW5jZUNvbmZpZyB7XHJcbiAgICBuYW1lOiBzdHJpbmc7IC8vIFVuaXF1ZSBpbnN0YW5jZSBuYW1lLCBlLmcuLCBcImVuZW15MVwiXHJcbiAgICBlbmVteVR5cGVOYW1lOiBzdHJpbmc7IC8vIFJlZmVyZW5jZSB0byBFbmVteVR5cGVDb25maWcubmFtZVxyXG4gICAgcG9zaXRpb246IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHo6IG51bWJlciB9O1xyXG4gICAgcm90YXRpb25ZPzogbnVtYmVyOyAvLyBPcHRpb25hbCBpbml0aWFsIHJvdGF0aW9uXHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBidWxsZXQgY29uZmlndXJhdGlvblxyXG5pbnRlcmZhY2UgQnVsbGV0Q29uZmlnIHtcclxuICAgIHRleHR1cmVOYW1lOiBzdHJpbmc7XHJcbiAgICBkaW1lbnNpb25zOiB7IHJhZGl1czogbnVtYmVyOyB9OyAvLyBGb3IgYSBzcGhlcmUgYnVsbGV0XHJcbiAgICBzcGVlZDogbnVtYmVyO1xyXG4gICAgbWFzczogbnVtYmVyO1xyXG4gICAgbGlmZXRpbWU6IG51bWJlcjsgLy8gTWF4IHRpbWUgaW4gc2Vjb25kcyBiZWZvcmUgaXQgZGVzcGF3bnNcclxuICAgIG1heFJhbmdlOiBudW1iZXI7IC8vIE1heCBkaXN0YW5jZSBmcm9tIGZpcmUgcG9pbnQgYmVmb3JlIGl0IGRlc3Bhd25zXHJcbiAgICB2b2x1bWU6IG51bWJlcjsgLy8gU291bmQgdm9sdW1lXHJcbn1cclxuXHJcbi8vIEludGVyZmFjZSB0byB0eXBlLWNoZWNrIHRoZSBnYW1lIGNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZGF0YS5qc29uXHJcbmludGVyZmFjZSBHYW1lQ29uZmlnIHtcclxuICAgIGdhbWVTZXR0aW5nczoge1xyXG4gICAgICAgIHRpdGxlU2NyZWVuVGV4dDogc3RyaW5nO1xyXG4gICAgICAgIHN0YXJ0R2FtZVByb21wdDogc3RyaW5nO1xyXG4gICAgICAgIHBsYXllclNwZWVkOiBudW1iZXI7XHJcbiAgICAgICAgbW91c2VTZW5zaXRpdml0eTogbnVtYmVyO1xyXG4gICAgICAgIGNhbWVyYUhlaWdodE9mZnNldDogbnVtYmVyOyAvLyBWZXJ0aWNhbCBvZmZzZXQgb2YgdGhlIGNhbWVyYSBmcm9tIHRoZSBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgY2VudGVyXHJcbiAgICAgICAgY2FtZXJhTmVhcjogbnVtYmVyOyAgICAgICAgIC8vIE5lYXIgY2xpcHBpbmcgcGxhbmUgZm9yIHRoZSBjYW1lcmFcclxuICAgICAgICBjYW1lcmFGYXI6IG51bWJlcjsgICAgICAgICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lIGZvciB0aGUgY2FtZXJhXHJcbiAgICAgICAgcGxheWVyTWFzczogbnVtYmVyOyAgICAgICAgIC8vIE1hc3Mgb2YgdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGdyb3VuZFNpemU6IG51bWJlcjsgICAgICAgICAvLyBTaXplICh3aWR0aC9kZXB0aCkgb2YgdGhlIHNxdWFyZSBncm91bmQgcGxhbmVcclxuICAgICAgICBtYXhQaHlzaWNzU3ViU3RlcHM6IG51bWJlcjsgLy8gTWF4aW11bSBudW1iZXIgb2YgcGh5c2ljcyBzdWJzdGVwcyBwZXIgZnJhbWUgdG8gbWFpbnRhaW4gc3RhYmlsaXR5XHJcbiAgICAgICAgZml4ZWRBc3BlY3RSYXRpbzogeyB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciB9OyAvLyBOZXc6IEZpeGVkIGFzcGVjdCByYXRpbyBmb3IgdGhlIGdhbWUgKHdpZHRoIC8gaGVpZ2h0KVxyXG4gICAgICAgIGp1bXBGb3JjZTogbnVtYmVyOyAgICAgICAgICAvLyBBRERFRDogRm9yY2UgYXBwbGllZCB3aGVuIGp1bXBpbmdcclxuICAgICAgICBzY29yZTogbnVtYmVyOyAgICAgICAgICAgICAgLy8gTkVXOiBJbml0aWFsIHNjb3JlXHJcbiAgICAgICAgZW5lbXlUeXBlczogRW5lbXlUeXBlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2YgZGlmZmVyZW50IGVuZW15IHRlbXBsYXRlc1xyXG4gICAgICAgIHN0YXRpY09iamVjdHM6IFBsYWNlZE9iamVjdENvbmZpZ1tdOyAvLyBORVc6IFJlbmFtZWQgZnJvbSBwbGFjZWRPYmplY3RzLCBvbmx5IHN0YXRpYyBib3hlc1xyXG4gICAgICAgIGVuZW15SW5zdGFuY2VzOiBQbGFjZWRFbmVteUluc3RhbmNlQ29uZmlnW107IC8vIE5FVzogQXJyYXkgb2Ygc3BlY2lmaWMgZW5lbXkgcGxhY2VtZW50c1xyXG4gICAgICAgIC8vIE5FVzogQ29uZmlndXJhYmxlIHBoeXNpY3MgcHJvcGVydGllc1xyXG4gICAgICAgIHBsYXllckdyb3VuZEZyaWN0aW9uOiBudW1iZXI7ICAgICAgICAvLyBGcmljdGlvbiBjb2VmZmljaWVudCBmb3IgcGxheWVyLWdyb3VuZCBjb250YWN0XHJcbiAgICAgICAgcGxheWVyQWlyQ29udHJvbEZhY3RvcjogbnVtYmVyOyAgICAvLyBNdWx0aXBsaWVyIGZvciBwbGF5ZXJTcGVlZCB3aGVuIGFpcmJvcm5lXHJcbiAgICAgICAgcGxheWVyQWlyRGVjZWxlcmF0aW9uOiBudW1iZXI7ICAgICAvLyBEZWNheSBmYWN0b3IgZm9yIGhvcml6b250YWwgdmVsb2NpdHkgd2hlbiBhaXJib3JuZSBhbmQgbm90IG1vdmluZ1xyXG4gICAgICAgIGJ1bGxldDogQnVsbGV0Q29uZmlnOyAvLyBORVc6IEJ1bGxldCBjb25maWd1cmF0aW9uXHJcbiAgICB9O1xyXG4gICAgYXNzZXRzOiB7XHJcbiAgICAgICAgaW1hZ2VzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9W107XHJcbiAgICAgICAgc291bmRzOiB7IG5hbWU6IHN0cmluZzsgcGF0aDogc3RyaW5nOyBkdXJhdGlvbl9zZWNvbmRzOiBudW1iZXI7IHZvbHVtZTogbnVtYmVyIH1bXTtcclxuICAgIH07XHJcbn1cclxuXHJcbi8vIE5FVzogSW50ZXJmYWNlIGZvciBhbiBhY3RpdmUgYnVsbGV0IGluc3RhbmNlXHJcbmludGVyZmFjZSBBY3RpdmVCdWxsZXQge1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgY3JlYXRpb25UaW1lOiBudW1iZXI7IC8vIFVzZWQgZm9yIGxpZmV0aW1lIGNoZWNrXHJcbiAgICBmaXJlUG9zaXRpb246IENBTk5PTi5WZWMzOyAvLyBVc2VkIGZvciBtYXhSYW5nZSBjaGVja1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gTkVXOiBGbGFnIHRvIG1hcmsgZm9yIHJlbW92YWxcclxuICAgIGNvbGxpZGVIYW5kbGVyPzogKGV2ZW50OiBDb2xsaWRlRXZlbnQpID0+IHZvaWQ7IC8vIE5FVzogU3RvcmUgdGhlIHNwZWNpZmljIGhhbmRsZXIgZnVuY3Rpb25cclxufVxyXG5cclxuLy8gTkVXOiBJbnRlcmZhY2UgZm9yIGFuIGFjdGl2ZSBlbmVteSBpbnN0YW5jZSAocnVudGltZSBkYXRhKVxyXG5pbnRlcmZhY2UgQWN0aXZlRW5lbXkge1xyXG4gICAgbmFtZTogc3RyaW5nO1xyXG4gICAgbWVzaDogVEhSRUUuTWVzaDtcclxuICAgIGJvZHk6IENBTk5PTi5Cb2R5O1xyXG4gICAgdHlwZUNvbmZpZzogRW5lbXlUeXBlQ29uZmlnOyAvLyBSZWZlcmVuY2UgdG8gaXRzIHR5cGUgZGVmaW5pdGlvblxyXG4gICAgY3VycmVudEhlYWx0aDogbnVtYmVyO1xyXG4gICAgc2hvdWxkUmVtb3ZlPzogYm9vbGVhbjsgLy8gRmxhZyB0byBtYXJrIGZvciByZW1vdmFsXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNYWluIEdhbWUgY2xhc3MgcmVzcG9uc2libGUgZm9yIGluaXRpYWxpemluZyBhbmQgcnVubmluZyB0aGUgM0QgZ2FtZS5cclxuICogSXQgaGFuZGxlcyBUaHJlZS5qcyByZW5kZXJpbmcsIENhbm5vbi1lcyBwaHlzaWNzLCBpbnB1dCwgYW5kIGdhbWUgc3RhdGUuXHJcbiAqL1xyXG5jbGFzcyBHYW1lIHtcclxuICAgIHByaXZhdGUgY29uZmlnITogR2FtZUNvbmZpZzsgLy8gR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGRhdGEuanNvblxyXG4gICAgcHJpdmF0ZSBzdGF0ZTogR2FtZVN0YXRlID0gR2FtZVN0YXRlLlRJVExFOyAvLyBDdXJyZW50IHN0YXRlIG9mIHRoZSBnYW1lXHJcblxyXG4gICAgLy8gVGhyZWUuanMgZWxlbWVudHMgZm9yIHJlbmRlcmluZ1xyXG4gICAgcHJpdmF0ZSBzY2VuZSE6IFRIUkVFLlNjZW5lO1xyXG4gICAgcHJpdmF0ZSBjYW1lcmEhOiBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYTtcclxuICAgIHByaXZhdGUgcmVuZGVyZXIhOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBjYW52YXMhOiBIVE1MQ2FudmFzRWxlbWVudDsgLy8gVGhlIEhUTUwgY2FudmFzIGVsZW1lbnQgZm9yIHJlbmRlcmluZ1xyXG5cclxuICAgIC8vIE5ldzogQSBjb250YWluZXIgb2JqZWN0IGZvciB0aGUgY2FtZXJhIHRvIGhhbmRsZSBob3Jpem9udGFsIHJvdGF0aW9uIHNlcGFyYXRlbHkgZnJvbSB2ZXJ0aWNhbCBwaXRjaC5cclxuICAgIHByaXZhdGUgY2FtZXJhQ29udGFpbmVyITogVEhSRUUuT2JqZWN0M0Q7IFxyXG5cclxuICAgIC8vIENhbm5vbi1lcyBlbGVtZW50cyBmb3IgcGh5c2ljc1xyXG4gICAgcHJpdmF0ZSB3b3JsZCE6IENBTk5PTi5Xb3JsZDtcclxuICAgIHByaXZhdGUgcGxheWVyQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBwbGF5ZXJcclxuICAgIHByaXZhdGUgZ3JvdW5kQm9keSE6IENBTk5PTi5Cb2R5OyAvLyBQaHlzaWNzIGJvZHkgZm9yIHRoZSBncm91bmRcclxuXHJcbiAgICAvLyBORVc6IENhbm5vbi1lcyBtYXRlcmlhbHMgZm9yIHBoeXNpY3NcclxuICAgIHByaXZhdGUgcGxheWVyTWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsO1xyXG4gICAgcHJpdmF0ZSBkZWZhdWx0T2JqZWN0TWF0ZXJpYWwhOiBDQU5OT04uTWF0ZXJpYWw7IC8vIEFEREVEOiBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbCE6IENBTk5PTi5NYXRlcmlhbDsgLy8gTkVXOiBNYXRlcmlhbCBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBlbmVteU1hdGVyaWFsITogQ0FOTk9OLk1hdGVyaWFsOyAvLyBORVc6IE1hdGVyaWFsIGZvciBlbmVtaWVzXHJcblxyXG4gICAgLy8gVmlzdWFsIG1lc2hlcyAoVGhyZWUuanMpIGZvciBnYW1lIG9iamVjdHNcclxuICAgIHByaXZhdGUgcGxheWVyTWVzaCE6IFRIUkVFLk1lc2g7XHJcbiAgICBwcml2YXRlIGdyb3VuZE1lc2ghOiBUSFJFRS5NZXNoO1xyXG4gICAgLy8gTkVXOiBBcnJheXMgdG8gaG9sZCByZWZlcmVuY2VzIHRvIGR5bmFtaWNhbGx5IHBsYWNlZCBvYmplY3RzXHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdE1lc2hlczogVEhSRUUuTWVzaFtdID0gW107XHJcbiAgICBwcml2YXRlIHBsYWNlZE9iamVjdEJvZGllczogQ0FOTk9OLkJvZHlbXSA9IFtdO1xyXG5cclxuICAgIC8vIE5FVzogQWN0aXZlIGJ1bGxldHNcclxuICAgIHByaXZhdGUgYnVsbGV0czogQWN0aXZlQnVsbGV0W10gPSBbXTtcclxuICAgIHByaXZhdGUgYnVsbGV0c1RvUmVtb3ZlOiBTZXQ8QWN0aXZlQnVsbGV0PiA9IG5ldyBTZXQoKTsgLy8gTkVXOiBMaXN0IG9mIGJ1bGxldHMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG4gICAgcHJpdmF0ZSBidWxsZXRHZW9tZXRyeSE6IFRIUkVFLlNwaGVyZUdlb21ldHJ5OyAvLyBSZXVzYWJsZSBnZW9tZXRyeSBmb3IgYnVsbGV0c1xyXG4gICAgcHJpdmF0ZSBidWxsZXRNYXRlcmlhbE1lc2ghOiBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbDsgLy8gUmV1c2FibGUgbWF0ZXJpYWwgZm9yIGJ1bGxldHMgKHVzaW5nIEJhc2ljIHRvIHByZXZlbnQgbGlnaHRpbmcgaXNzdWVzIGZvciBzaW1wbGUgYnVsbGV0cylcclxuXHJcbiAgICAvLyBORVc6IEFjdGl2ZSBlbmVtaWVzXHJcbiAgICBwcml2YXRlIGVuZW1pZXM6IEFjdGl2ZUVuZW15W10gPSBbXTtcclxuICAgIHByaXZhdGUgZW5lbWllc1RvUmVtb3ZlOiBTZXQ8QWN0aXZlRW5lbXk+ID0gbmV3IFNldCgpOyAvLyBMaXN0IG9mIGVuZW1pZXMgdG8gcmVtb3ZlIGFmdGVyIHBoeXNpY3Mgc3RlcFxyXG5cclxuICAgIC8vIElucHV0IGhhbmRsaW5nIHN0YXRlXHJcbiAgICBwcml2YXRlIGtleXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307IC8vIFRyYWNrcyBjdXJyZW50bHkgcHJlc3NlZCBrZXlzXHJcbiAgICBwcml2YXRlIGlzUG9pbnRlckxvY2tlZDogYm9vbGVhbiA9IGZhbHNlOyAvLyBUcnVlIGlmIG1vdXNlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICBwcml2YXRlIGNhbWVyYVBpdGNoOiBudW1iZXIgPSAwOyAvLyBWZXJ0aWNhbCByb3RhdGlvbiAocGl0Y2gpIG9mIHRoZSBjYW1lcmFcclxuXHJcbiAgICAvLyBBc3NldCBtYW5hZ2VtZW50XHJcbiAgICBwcml2YXRlIHRleHR1cmVzOiBNYXA8c3RyaW5nLCBUSFJFRS5UZXh0dXJlPiA9IG5ldyBNYXAoKTsgLy8gU3RvcmVzIGxvYWRlZCB0ZXh0dXJlc1xyXG4gICAgcHJpdmF0ZSBzb3VuZHM6IE1hcDxzdHJpbmcsIEhUTUxBdWRpb0VsZW1lbnQ+ID0gbmV3IE1hcCgpOyAvLyBTdG9yZXMgbG9hZGVkIGF1ZGlvIGVsZW1lbnRzXHJcblxyXG4gICAgLy8gVUkgZWxlbWVudHMgKGR5bmFtaWNhbGx5IGNyZWF0ZWQgZm9yIHRoZSB0aXRsZSBzY3JlZW4gYW5kIGdhbWUgb3ZlcmxheSlcclxuICAgIHByaXZhdGUgdGl0bGVTY3JlZW5PdmVybGF5ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHRpdGxlVGV4dCE6IEhUTUxEaXZFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBwcm9tcHRUZXh0ITogSFRNTERpdkVsZW1lbnQ7XHJcbiAgICBwcml2YXRlIHNjb3JlVGV4dCE6IEhUTUxEaXZFbGVtZW50OyAvLyBORVc6IFVJIGVsZW1lbnQgZm9yIHNjb3JlXHJcbiAgICBwcml2YXRlIGNyb3NzaGFpckVsZW1lbnQhOiBIVE1MRGl2RWxlbWVudDsgLy8gTkVXOiBDcm9zc2hhaXIgVUkgZWxlbWVudFxyXG5cclxuICAgIC8vIEZvciBjYWxjdWxhdGluZyBkZWx0YSB0aW1lIGJldHdlZW4gZnJhbWVzXHJcbiAgICBwcml2YXRlIGxhc3RUaW1lOiBET01IaWdoUmVzVGltZVN0YW1wID0gMDtcclxuXHJcbiAgICAvLyBNT0RJRklFRDogVHJhY2tzIHBsYXllciBjb250YWN0cyB3aXRoIEFOWSBzdGF0aWMgc3VyZmFjZSAoZ3JvdW5kIG9yIHBsYWNlZCBvYmplY3RzKSBmb3IganVtcGluZy9tb3ZlbWVudCBsb2dpY1xyXG4gICAgcHJpdmF0ZSBudW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlczogbnVtYmVyID0gMDtcclxuXHJcbiAgICAvLyBORVc6IEdhbWUgc2NvcmVcclxuICAgIHByaXZhdGUgc2NvcmU6IG51bWJlciA9IDA7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgLy8gR2V0IHRoZSBjYW52YXMgZWxlbWVudCBmcm9tIGluZGV4Lmh0bWxcclxuICAgICAgICB0aGlzLmNhbnZhcyA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdnYW1lQ2FudmFzJykgYXMgSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICAgICAgaWYgKCF0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdDYW52YXMgZWxlbWVudCB3aXRoIElEIFwiZ2FtZUNhbnZhc1wiIG5vdCBmb3VuZCEnKTtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBDYW5ub3QgcHJvY2VlZCB3aXRob3V0IGEgY2FudmFzXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuaW5pdCgpOyAvLyBTdGFydCB0aGUgYXN5bmNocm9ub3VzIGluaXRpYWxpemF0aW9uIHByb2Nlc3NcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEFzeW5jaHJvbm91c2x5IGluaXRpYWxpemVzIHRoZSBnYW1lLCBsb2FkaW5nIGNvbmZpZywgYXNzZXRzLCBhbmQgc2V0dGluZyB1cCBzeXN0ZW1zLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIGluaXQoKSB7XHJcbiAgICAgICAgLy8gMS4gTG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24gZnJvbSBkYXRhLmpzb25cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKCdkYXRhLmpzb24nKTtcclxuICAgICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQIGVycm9yISBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnR2FtZSBjb25maWd1cmF0aW9uIGxvYWRlZDonLCB0aGlzLmNvbmZpZyk7XHJcbiAgICAgICAgICAgIHRoaXMuc2NvcmUgPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc2NvcmU7IC8vIEluaXRpYWxpemUgc2NvcmUgZnJvbSBjb25maWdcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb246JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAvLyBJZiBjb25maWd1cmF0aW9uIGZhaWxzIHRvIGxvYWQsIGRpc3BsYXkgYW4gZXJyb3IgbWVzc2FnZSBhbmQgc3RvcC5cclxuICAgICAgICAgICAgY29uc3QgZXJyb3JEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50b3AgPSAnNTAlJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUubGVmdCA9ICc1MCUnO1xyXG4gICAgICAgICAgICBlcnJvckRpdi5zdHlsZS50cmFuc2Zvcm0gPSAndHJhbnNsYXRlKC01MCUsIC01MCUpJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuY29sb3IgPSAncmVkJztcclxuICAgICAgICAgICAgZXJyb3JEaXYuc3R5bGUuZm9udFNpemUgPSAnMjRweCc7XHJcbiAgICAgICAgICAgIGVycm9yRGl2LnRleHRDb250ZW50ID0gJ0Vycm9yOiBGYWlsZWQgdG8gbG9hZCBnYW1lIGNvbmZpZ3VyYXRpb24uIENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuJztcclxuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChlcnJvckRpdik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIDIuIEluaXRpYWxpemUgVGhyZWUuanMgKHNjZW5lLCBjYW1lcmEsIHJlbmRlcmVyKVxyXG4gICAgICAgIHRoaXMuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuICAgICAgICB0aGlzLmNhbWVyYSA9IG5ldyBUSFJFRS5QZXJzcGVjdGl2ZUNhbWVyYShcclxuICAgICAgICAgICAgNzUsIC8vIEZpZWxkIG9mIFZpZXcgKEZPVilcclxuICAgICAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8ud2lkdGggLyB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZml4ZWRBc3BlY3RSYXRpby5oZWlnaHQsIC8vIEZpeGVkIEFzcGVjdCByYXRpbyBmcm9tIGNvbmZpZ1xyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhTmVhciwgLy8gTmVhciBjbGlwcGluZyBwbGFuZVxyXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuY2FtZXJhRmFyICAgLy8gRmFyIGNsaXBwaW5nIHBsYW5lXHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoeyBjYW52YXM6IHRoaXMuY2FudmFzLCBhbnRpYWxpYXM6IHRydWUgfSk7XHJcbiAgICAgICAgLy8gUmVuZGVyZXIgc2l6ZSB3aWxsIGJlIHNldCBieSBhcHBseUZpeGVkQXNwZWN0UmF0aW8gdG8gZml0IHRoZSB3aW5kb3cgd2hpbGUgbWFpbnRhaW5pbmcgYXNwZWN0IHJhdGlvXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQaXhlbFJhdGlvKHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvKTtcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZm9yIGJldHRlciByZWFsaXNtXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaGFkb3dNYXAudHlwZSA9IFRIUkVFLlBDRlNvZnRTaGFkb3dNYXA7IC8vIFVzZSBzb2Z0IHNoYWRvd3NcclxuXHJcbiAgICAgICAgLy8gQ2FtZXJhIHNldHVwIGZvciBkZWNvdXBsZWQgeWF3IGFuZCBwaXRjaDpcclxuICAgICAgICAvLyBjYW1lcmFDb250YWluZXIgaGFuZGxlcyB5YXcgKGhvcml6b250YWwgcm90YXRpb24pIGFuZCBmb2xsb3dzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbi5cclxuICAgICAgICAvLyBUaGUgY2FtZXJhIGl0c2VsZiBpcyBhIGNoaWxkIG9mIGNhbWVyYUNvbnRhaW5lciBhbmQgaGFuZGxlcyBwaXRjaCAodmVydGljYWwgcm90YXRpb24pLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5jYW1lcmFDb250YWluZXIpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmFkZCh0aGlzLmNhbWVyYSk7XHJcbiAgICAgICAgLy8gUG9zaXRpb24gdGhlIGNhbWVyYSByZWxhdGl2ZSB0byB0aGUgY2FtZXJhQ29udGFpbmVyIChhdCBleWUgbGV2ZWwpXHJcbiAgICAgICAgdGhpcy5jYW1lcmEucG9zaXRpb24ueSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5jYW1lcmFIZWlnaHRPZmZzZXQ7XHJcblxyXG5cclxuICAgICAgICAvLyAzLiBJbml0aWFsaXplIENhbm5vbi1lcyAocGh5c2ljcyB3b3JsZClcclxuICAgICAgICB0aGlzLndvcmxkID0gbmV3IENBTk5PTi5Xb3JsZCgpO1xyXG4gICAgICAgIHRoaXMud29ybGQuZ3Jhdml0eS5zZXQoMCwgLTkuODIsIDApOyAvLyBTZXQgc3RhbmRhcmQgRWFydGggZ3Jhdml0eSAoWS1heGlzIGRvd24pXHJcbiAgICAgICAgdGhpcy53b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5TQVBCcm9hZHBoYXNlKHRoaXMud29ybGQpOyAvLyBVc2UgYW4gZWZmaWNpZW50IGJyb2FkcGhhc2UgYWxnb3JpdGhtXHJcbiAgICAgICAgLy8gRml4OiBDYXN0IHRoaXMud29ybGQuc29sdmVyIHRvIENBTk5PTi5HU1NvbHZlciB0byBhY2Nlc3MgdGhlICdpdGVyYXRpb25zJyBwcm9wZXJ0eVxyXG4gICAgICAgIC8vIFRoZSBkZWZhdWx0IHNvbHZlciBpbiBDYW5ub24uanMgKGFuZCBDYW5ub24tZXMpIGlzIEdTU29sdmVyLCB3aGljaCBoYXMgdGhpcyBwcm9wZXJ0eS5cclxuICAgICAgICAodGhpcy53b3JsZC5zb2x2ZXIgYXMgQ0FOTk9OLkdTU29sdmVyKS5pdGVyYXRpb25zID0gMTA7IC8vIEluY3JlYXNlIHNvbHZlciBpdGVyYXRpb25zIGZvciBiZXR0ZXIgc3RhYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIENhbm5vbi5qcyBNYXRlcmlhbHMgYW5kIENvbnRhY3RNYXRlcmlhbCBmb3IgcGxheWVyLWdyb3VuZCBpbnRlcmFjdGlvblxyXG4gICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdwbGF5ZXJNYXRlcmlhbCcpO1xyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdncm91bmRNYXRlcmlhbCcpO1xyXG4gICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZGVmYXVsdE9iamVjdE1hdGVyaWFsJyk7IC8vIEFEREVEOiBNYXRlcmlhbCBmb3IgZ2VuZXJpYyBwbGFjZWQgb2JqZWN0c1xyXG4gICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLk1hdGVyaWFsKCdidWxsZXRNYXRlcmlhbCcpOyAvLyBORVc6IE1hdGVyaWFsIGZvciBidWxsZXRzXHJcbiAgICAgICAgdGhpcy5lbmVteU1hdGVyaWFsID0gbmV3IENBTk5PTi5NYXRlcmlhbCgnZW5lbXlNYXRlcmlhbCcpOyAvLyBORVc6IE1hdGVyaWFsIGZvciBlbmVtaWVzXHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllckdyb3VuZENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckdyb3VuZEZyaWN0aW9uLCAvLyBVc2UgY29uZmlndXJhYmxlIGdyb3VuZCBmcmljdGlvblxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCwgLy8gTm8gYm91bmNlIGZvciBncm91bmRcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwocGxheWVyR3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gQURERUQ6IFBsYXllci1PYmplY3QgY29udGFjdCBtYXRlcmlhbCAoZnJpY3Rpb24gYmV0d2VlbiBwbGF5ZXIgYW5kIHBsYWNlZCBvYmplY3RzKVxyXG4gICAgICAgIGNvbnN0IHBsYXllck9iamVjdENvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLnBsYXllck1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmRlZmF1bHRPYmplY3RNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJHcm91bmRGcmljdGlvbiwgLy8gU2FtZSBmcmljdGlvbiBhcyBwbGF5ZXItZ3JvdW5kXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChwbGF5ZXJPYmplY3RDb250YWN0TWF0ZXJpYWwpO1xyXG5cclxuICAgICAgICAvLyBBRERFRDogT2JqZWN0LUdyb3VuZCBjb250YWN0IG1hdGVyaWFsIChmcmljdGlvbiBiZXR3ZWVuIHBsYWNlZCBvYmplY3RzIGFuZCBncm91bmQpXHJcbiAgICAgICAgY29uc3Qgb2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmdyb3VuZE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwob2JqZWN0R3JvdW5kQ29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBCdWxsZXQtR3JvdW5kIGNvbnRhY3QgbWF0ZXJpYWwgKG5vIGZyaWN0aW9uLCBubyByZXN0aXR1dGlvbilcclxuICAgICAgICBjb25zdCBidWxsZXRHcm91bmRDb250YWN0TWF0ZXJpYWwgPSBuZXcgQ0FOTk9OLkNvbnRhY3RNYXRlcmlhbChcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgdGhpcy5ncm91bmRNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuMCxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKGJ1bGxldEdyb3VuZENvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQnVsbGV0LU9iamVjdCBjb250YWN0IG1hdGVyaWFsIChubyBmcmljdGlvbiwgbm8gcmVzdGl0dXRpb24pXHJcbiAgICAgICAgY29uc3QgYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMuYnVsbGV0TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC4wLFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuMCxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRDb250YWN0TWF0ZXJpYWwoYnVsbGV0T2JqZWN0Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBCdWxsZXQtRW5lbXkgY29udGFjdCBtYXRlcmlhbCAoYnVsbGV0IGRpc2FwcGVhcnMsIGVuZW15IHRha2VzIGRhbWFnZSlcclxuICAgICAgICBjb25zdCBidWxsZXRFbmVteUNvbnRhY3RNYXRlcmlhbCA9IG5ldyBDQU5OT04uQ29udGFjdE1hdGVyaWFsKFxyXG4gICAgICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsLFxyXG4gICAgICAgICAgICB0aGlzLmVuZW15TWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGZyaWN0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgICAgICByZXN0aXR1dGlvbjogMC4wLFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZENvbnRhY3RNYXRlcmlhbChidWxsZXRFbmVteUNvbnRhY3RNYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogUGxheWVyLUVuZW15IGNvbnRhY3QgbWF0ZXJpYWwgKHBsYXllciBtaWdodCBwdXNoIGVuZW15IHNsaWdodGx5KVxyXG4gICAgICAgIGNvbnN0IHBsYXllckVuZW15Q29udGFjdE1hdGVyaWFsID0gbmV3IENBTk5PTi5Db250YWN0TWF0ZXJpYWwoXHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyTWF0ZXJpYWwsXHJcbiAgICAgICAgICAgIHRoaXMuZW5lbXlNYXRlcmlhbCxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZnJpY3Rpb246IDAuNSxcclxuICAgICAgICAgICAgICAgIHJlc3RpdHV0aW9uOiAwLjAsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQ29udGFjdE1hdGVyaWFsKHBsYXllckVuZW15Q29udGFjdE1hdGVyaWFsKTtcclxuXHJcblxyXG4gICAgICAgIC8vIDQuIExvYWQgYXNzZXRzICh0ZXh0dXJlcyBhbmQgc291bmRzKVxyXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZEFzc2V0cygpO1xyXG5cclxuICAgICAgICAvLyA1LiBDcmVhdGUgZ2FtZSBvYmplY3RzIChwbGF5ZXIsIGdyb3VuZCwgc3RhdGljIG9iamVjdHMsIGVuZW1pZXMpIGFuZCBsaWdodGluZ1xyXG4gICAgICAgIHRoaXMuY3JlYXRlR3JvdW5kKCk7IC8vIENyZWF0ZXMgdGhpcy5ncm91bmRCb2R5XHJcbiAgICAgICAgdGhpcy5jcmVhdGVQbGF5ZXIoKTsgLy8gQ3JlYXRlcyB0aGlzLnBsYXllckJvZHlcclxuICAgICAgICB0aGlzLmNyZWF0ZVN0YXRpY09iamVjdHMoKTsgLy8gUmVuYW1lZCBmcm9tIGNyZWF0ZVBsYWNlZE9iamVjdHMsIGNyZWF0ZXMgc3RhdGljIGJveGVzXHJcbiAgICAgICAgdGhpcy5jcmVhdGVFbmVtaWVzKCk7IC8vIE5FVzogQ3JlYXRlcyBlbmVtaWVzXHJcbiAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgIC8vIE5FVzogQ3JlYXRlIHJldXNhYmxlIGJ1bGxldCBnZW9tZXRyeSBhbmQgbWF0ZXJpYWxcclxuICAgICAgICB0aGlzLmJ1bGxldEdlb21ldHJ5ID0gbmV3IFRIUkVFLlNwaGVyZUdlb21ldHJ5KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQuZGltZW5zaW9ucy5yYWRpdXMsIDgsIDgpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldFRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldCh0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuYnVsbGV0LnRleHR1cmVOYW1lKTtcclxuICAgICAgICB0aGlzLmJ1bGxldE1hdGVyaWFsTWVzaCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogYnVsbGV0VGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IGJ1bGxldFRleHR1cmUgPyAweGZmZmZmZiA6IDB4ZmZmZjAwIC8vIFllbGxvdyBpZiBubyB0ZXh0dXJlXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIE1PRElGSUVEOiBTZXR1cCBDYW5ub24tZXMgY29udGFjdCBsaXN0ZW5lcnMgZm9yIGdlbmVyYWwgc3VyZmFjZSBjb250YWN0IGxvZ2ljXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdiZWdpbkNvbnRhY3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgbGV0IGJvZHlBID0gZXZlbnQuYm9keUE7XHJcbiAgICAgICAgICAgIGxldCBib2R5QiA9IGV2ZW50LmJvZHlCO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcGxheWVyQm9keSBpcyBpbnZvbHZlZCBpbiB0aGUgY29udGFjdFxyXG4gICAgICAgICAgICBpZiAoYm9keUEgPT09IHRoaXMucGxheWVyQm9keSB8fCBib2R5QiA9PT0gdGhpcy5wbGF5ZXJCb2R5KSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBvdGhlckJvZHkgPSBib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5ID8gYm9keUIgOiBib2R5QTtcclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSBvdGhlciBib2R5IGlzIHN0YXRpYyAobWFzcyA9IDApLCB3aGljaCBpbmNsdWRlcyBncm91bmQgYW5kIHBsYWNlZCBvYmplY3RzXHJcbiAgICAgICAgICAgICAgICBpZiAob3RoZXJCb2R5Lm1hc3MgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLm51bUNvbnRhY3RzV2l0aFN0YXRpY1N1cmZhY2VzKys7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRFdmVudExpc3RlbmVyKCdlbmRDb250YWN0JywgKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgIGxldCBib2R5QSA9IGV2ZW50LmJvZHlBO1xyXG4gICAgICAgICAgICBsZXQgYm9keUIgPSBldmVudC5ib2R5QjtcclxuXHJcbiAgICAgICAgICAgIGlmIChib2R5QSA9PT0gdGhpcy5wbGF5ZXJCb2R5IHx8IGJvZHlCID09PSB0aGlzLnBsYXllckJvZHkpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG90aGVyQm9keSA9IGJvZHlBID09PSB0aGlzLnBsYXllckJvZHkgPyBib2R5QiA6IGJvZHlBO1xyXG4gICAgICAgICAgICAgICAgaWYgKG90aGVyQm9keS5tYXNzID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5udW1Db250YWN0c1dpdGhTdGF0aWNTdXJmYWNlcyA9IE1hdGgubWF4KDAsIHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgLSAxKTsgLy8gRW5zdXJlIGl0IGRvZXNuJ3QgZ28gYmVsb3cgMFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIDcuIFNldHVwIGV2ZW50IGxpc3RlbmVycyBmb3IgdXNlciBpbnB1dCBhbmQgd2luZG93IHJlc2l6aW5nXHJcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHRoaXMub25XaW5kb3dSZXNpemUuYmluZCh0aGlzKSk7XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIHRoaXMub25LZXlEb3duLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgdGhpcy5vbktleVVwLmJpbmQodGhpcykpO1xyXG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMub25Nb3VzZU1vdmUuYmluZCh0aGlzKSk7IC8vIEZvciBtb3VzZSBsb29rXHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5vbk1vdXNlRG93bi5iaW5kKHRoaXMpKTsgLy8gTkVXOiBGb3IgZmlyaW5nIGJ1bGxldHNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRm9yIHBvaW50ZXIgbG9jayBzdGF0dXNcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3pwb2ludGVybG9ja2NoYW5nZScsIHRoaXMub25Qb2ludGVyTG9ja0NoYW5nZS5iaW5kKHRoaXMpKTsgLy8gRmlyZWZveCBjb21wYXRpYmlsaXR5XHJcbiAgICAgICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignd2Via2l0cG9pbnRlcmxvY2tjaGFuZ2UnLCB0aGlzLm9uUG9pbnRlckxvY2tDaGFuZ2UuYmluZCh0aGlzKSk7IC8vIFdlYmtpdCBjb21wYXRpYmlsaXR5XHJcblxyXG4gICAgICAgIC8vIEFwcGx5IGluaXRpYWwgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgICAgIHRoaXMuYXBwbHlGaXhlZEFzcGVjdFJhdGlvKCk7XHJcblxyXG4gICAgICAgIC8vIDguIFNldHVwIHRoZSB0aXRsZSBzY3JlZW4gVUkgYW5kIEdhbWUgVUlcclxuICAgICAgICB0aGlzLnNldHVwVGl0bGVTY3JlZW4oKTtcclxuICAgICAgICB0aGlzLnNldHVwR2FtZVVJKCk7IC8vIE5FVzogU2V0dXAgc2NvcmUgZGlzcGxheSBhbmQgY3Jvc3NoYWlyXHJcblxyXG4gICAgICAgIC8vIFN0YXJ0IHRoZSBtYWluIGdhbWUgbG9vcFxyXG4gICAgICAgIHRoaXMuYW5pbWF0ZSgwKTsgLy8gUGFzcyBpbml0aWFsIHRpbWUgMFxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTG9hZHMgYWxsIHRleHR1cmVzIGFuZCBzb3VuZHMgZGVmaW5lZCBpbiB0aGUgZ2FtZSBjb25maWd1cmF0aW9uLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIGxvYWRBc3NldHMoKSB7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZUxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5pbWFnZXMubWFwKGltZyA9PiB7XHJcbiAgICAgICAgICAgIHJldHVybiB0ZXh0dXJlTG9hZGVyLmxvYWRBc3luYyhpbWcucGF0aClcclxuICAgICAgICAgICAgICAgIC50aGVuKHRleHR1cmUgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudGV4dHVyZXMuc2V0KGltZy5uYW1lLCB0ZXh0dXJlKTtcclxuICAgICAgICAgICAgICAgICAgICB0ZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7IC8vIFJlcGVhdCB0ZXh0dXJlIGhvcml6b250YWxseVxyXG4gICAgICAgICAgICAgICAgICAgIHRleHR1cmUud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZzsgLy8gUmVwZWF0IHRleHR1cmUgdmVydGljYWxseVxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEFkanVzdCB0ZXh0dXJlIHJlcGV0aXRpb24gZm9yIHRoZSBncm91bmQgdG8gYXZvaWQgc3RyZXRjaGluZ1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbWcubmFtZSA9PT0gJ2dyb3VuZF90ZXh0dXJlJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgdGV4dHVyZS5yZXBlYXQuc2V0KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gNSwgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyA1KTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGJveCB0ZXh0dXJlcywgZW5zdXJlIHJlcGV0aXRpb24gaWYgZGVzaXJlZCwgb3Igc2V0IHRvIDEsMSBmb3Igc2luZ2xlIGFwcGxpY2F0aW9uXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGltZy5uYW1lLmVuZHNXaXRoKCdfdGV4dHVyZScpKSB7IC8vIEdlbmVyaWMgY2hlY2sgZm9yIG90aGVyIHRleHR1cmVzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvciBnZW5lcmljIGJveCB0ZXh0dXJlcywgd2UgbWlnaHQgd2FudCB0byByZXBlYXQgYmFzZWQgb24gb2JqZWN0IGRpbWVuc2lvbnNcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yIHNpbXBsaWNpdHkgbm93LCBsZXQncyBrZWVwIGRlZmF1bHQgKG5vIHJlcGVhdCB1bmxlc3MgZXhwbGljaXQgZm9yIGdyb3VuZClcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQSBtb3JlIHJvYnVzdCBzb2x1dGlvbiB3b3VsZCBpbnZvbHZlIHNldHRpbmcgcmVwZWF0IGJhc2VkIG9uIHNjYWxlL2RpbWVuc2lvbnMgZm9yIGVhY2ggb2JqZWN0XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgdGV4dHVyZTogJHtpbWcucGF0aH1gLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgZXZlbiBpZiBhbiBhc3NldCBmYWlscyB0byBsb2FkOyBmYWxsYmFja3MgKHNvbGlkIGNvbG9ycykgYXJlIHVzZWQuXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3Qgc291bmRQcm9taXNlcyA9IHRoaXMuY29uZmlnLmFzc2V0cy5zb3VuZHMubWFwKHNvdW5kID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhdWRpbyA9IG5ldyBBdWRpbyhzb3VuZC5wYXRoKTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLnZvbHVtZSA9IHNvdW5kLnZvbHVtZTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLmxvb3AgPSAoc291bmQubmFtZSA9PT0gJ2JhY2tncm91bmRfbXVzaWMnKTsgLy8gTG9vcCBiYWNrZ3JvdW5kIG11c2ljXHJcbiAgICAgICAgICAgICAgICBhdWRpby5vbmNhbnBsYXl0aHJvdWdoID0gKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLnNldChzb3VuZC5uYW1lLCBhdWRpbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIGF1ZGlvLm9uZXJyb3IgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGxvYWQgc291bmQ6ICR7c291bmQucGF0aH1gKTtcclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKCk7IC8vIFJlc29sdmUgZXZlbiBvbiBlcnJvciB0byBub3QgYmxvY2sgUHJvbWlzZS5hbGxcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChbLi4uaW1hZ2VQcm9taXNlcywgLi4uc291bmRQcm9taXNlc10pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBBc3NldHMgbG9hZGVkOiAke3RoaXMudGV4dHVyZXMuc2l6ZX0gdGV4dHVyZXMsICR7dGhpcy5zb3VuZHMuc2l6ZX0gc291bmRzLmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ3JlYXRlcyBhbmQgZGlzcGxheXMgdGhlIHRpdGxlIHNjcmVlbiBVSSBkeW5hbWljYWxseS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzZXR1cFRpdGxlU2NyZWVuKCkge1xyXG4gICAgICAgIHRoaXMudGl0bGVTY3JlZW5PdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5zdHlsZSwge1xyXG4gICAgICAgICAgICBwb3NpdGlvbjogJ2Fic29sdXRlJywgLy8gUG9zaXRpb24gcmVsYXRpdmUgdG8gYm9keSwgd2lsbCBiZSBjZW50ZXJlZCBhbmQgc2l6ZWQgYnkgYXBwbHlGaXhlZEFzcGVjdFJhdGlvXHJcbiAgICAgICAgICAgIGJhY2tncm91bmRDb2xvcjogJ3JnYmEoMCwgMCwgMCwgMC44KScsXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdmbGV4JywgZmxleERpcmVjdGlvbjogJ2NvbHVtbicsXHJcbiAgICAgICAgICAgIGp1c3RpZnlDb250ZW50OiAnY2VudGVyJywgYWxpZ25JdGVtczogJ2NlbnRlcicsXHJcbiAgICAgICAgICAgIGNvbG9yOiAnd2hpdGUnLCBmb250RmFtaWx5OiAnQXJpYWwsIHNhbnMtc2VyaWYnLFxyXG4gICAgICAgICAgICBmb250U2l6ZTogJzQ4cHgnLCB0ZXh0QWxpZ246ICdjZW50ZXInLCB6SW5kZXg6ICcxMDAwJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkpO1xyXG5cclxuICAgICAgICAvLyBDcnVjaWFsOiBDYWxsIGFwcGx5Rml4ZWRBc3BlY3RSYXRpbyBoZXJlIHRvIGVuc3VyZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICAvLyBpcyBzaXplZCBhbmQgcG9zaXRpb25lZCBjb3JyZWN0bHkgcmVsYXRpdmUgdG8gdGhlIGNhbnZhcyBmcm9tIHRoZSBzdGFydC5cclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpO1xyXG5cclxuICAgICAgICB0aGlzLnRpdGxlVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMudGl0bGVUZXh0LnRleHRDb250ZW50ID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnRpdGxlU2NyZWVuVGV4dDtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlVGV4dCk7XHJcblxyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIHRoaXMucHJvbXB0VGV4dC50ZXh0Q29udGVudCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zdGFydEdhbWVQcm9tcHQ7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLnByb21wdFRleHQuc3R5bGUsIHtcclxuICAgICAgICAgICAgbWFyZ2luVG9wOiAnMjBweCcsIGZvbnRTaXplOiAnMjRweCdcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheS5hcHBlbmRDaGlsZCh0aGlzLnByb21wdFRleHQpO1xyXG5cclxuICAgICAgICAvLyBBZGQgZXZlbnQgbGlzdGVuZXIgZGlyZWN0bHkgdG8gdGhlIG92ZXJsYXkgdG8gY2FwdHVyZSBjbGlja3MgYW5kIHN0YXJ0IHRoZSBnYW1lXHJcbiAgICAgICAgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB0aGlzLnN0YXJ0R2FtZSgpKTtcclxuXHJcbiAgICAgICAgLy8gQXR0ZW1wdCB0byBwbGF5IGJhY2tncm91bmQgbXVzaWMuIEl0IG1pZ2h0IGJlIGJsb2NrZWQgYnkgYnJvd3NlcnMgaWYgbm8gdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZCB5ZXQuXHJcbiAgICAgICAgdGhpcy5zb3VuZHMuZ2V0KCdiYWNrZ3JvdW5kX211c2ljJyk/LnBsYXkoKS5jYXRjaChlID0+IGNvbnNvbGUubG9nKFwiQkdNIHBsYXkgZGVuaWVkIChyZXF1aXJlcyB1c2VyIGdlc3R1cmUpOlwiLCBlKSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IENyZWF0ZXMgYW5kIGRpc3BsYXlzIHRoZSBnYW1lIHNjb3JlIFVJIGFuZCBjcm9zc2hhaXIuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBHYW1lVUkoKSB7XHJcbiAgICAgICAgdGhpcy5zY29yZVRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMuc2NvcmVUZXh0LnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxyXG4gICAgICAgICAgICB0b3A6ICcxMHB4JyxcclxuICAgICAgICAgICAgbGVmdDogJzEwcHgnLFxyXG4gICAgICAgICAgICBjb2xvcjogJ3doaXRlJyxcclxuICAgICAgICAgICAgZm9udEZhbWlseTogJ0FyaWFsLCBzYW5zLXNlcmlmJyxcclxuICAgICAgICAgICAgZm9udFNpemU6ICcyNHB4JyxcclxuICAgICAgICAgICAgekluZGV4OiAnMTAwMScgLy8gQWJvdmUgdGl0bGUgc2NyZWVuIG92ZXJsYXkgYnV0IHNlcGFyYXRlXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5zY29yZVRleHQudGV4dENvbnRlbnQgPSBgU2NvcmU6ICR7dGhpcy5zY29yZX1gO1xyXG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodGhpcy5zY29yZVRleHQpO1xyXG5cclxuICAgICAgICAvLyBORVc6IENyZWF0ZSBhbmQgc2V0dXAgY3Jvc3NoYWlyXHJcbiAgICAgICAgdGhpcy5jcm9zc2hhaXJFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLmNyb3NzaGFpckVsZW1lbnQuc3R5bGUsIHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIHdpZHRoOiAnMnB4JywgIC8vIENlbnRyYWwgZG90IHNpemVcclxuICAgICAgICAgICAgaGVpZ2h0OiAnMnB4JyxcclxuICAgICAgICAgICAgYmFja2dyb3VuZENvbG9yOiAnd2hpdGUnLCAvLyBDZW50cmFsIHdoaXRlIGRvdFxyXG4gICAgICAgICAgICAvLyBVc2UgYm94LXNoYWRvd3MgZm9yIG91dGxpbmVzIGFuZCBwb3RlbnRpYWwgY3Jvc3MtbGlrZSBhcHBlYXJhbmNlXHJcbiAgICAgICAgICAgIGJveFNoYWRvdzogJzAgMCAwIDFweCB3aGl0ZSwgMCAwIDAgM3B4IHJnYmEoMCwwLDAsMC44KSwgMCAwIDAgNHB4IHdoaXRlJyxcclxuICAgICAgICAgICAgYm9yZGVyUmFkaXVzOiAnNTAlJywgLy8gTWFrZSBpdCBjaXJjdWxhclxyXG4gICAgICAgICAgICB0b3A6ICc1MCUnLFxyXG4gICAgICAgICAgICBsZWZ0OiAnNTAlJyxcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgekluZGV4OiAnMTAwMicsIC8vIEFib3ZlIHRpdGxlIHNjcmVlbiBhbmQgc2NvcmVcclxuICAgICAgICAgICAgZGlzcGxheTogJ25vbmUnIC8vIEluaXRpYWxseSBoaWRkZW5cclxuICAgICAgICB9KTtcclxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHRoaXMuY3Jvc3NoYWlyRWxlbWVudCk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBORVc6IFVwZGF0ZXMgdGhlIHNjb3JlIGRpc3BsYXkgb24gdGhlIFVJLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZVNjb3JlRGlzcGxheSgpIHtcclxuICAgICAgICBpZiAodGhpcy5zY29yZVRleHQpIHtcclxuICAgICAgICAgICAgdGhpcy5zY29yZVRleHQudGV4dENvbnRlbnQgPSBgU2NvcmU6ICR7dGhpcy5zY29yZX1gO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFRyYW5zaXRpb25zIHRoZSBnYW1lIGZyb20gdGhlIHRpdGxlIHNjcmVlbiB0byB0aGUgcGxheWluZyBzdGF0ZS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBzdGFydEdhbWUoKSB7XHJcbiAgICAgICAgdGhpcy5zdGF0ZSA9IEdhbWVTdGF0ZS5QTEFZSU5HO1xyXG4gICAgICAgIC8vIFJlbW92ZSB0aGUgdGl0bGUgc2NyZWVuIG92ZXJsYXlcclxuICAgICAgICBpZiAodGhpcy50aXRsZVNjcmVlbk92ZXJsYXkgJiYgdGhpcy50aXRsZVNjcmVlbk92ZXJsYXkucGFyZW50Tm9kZSkge1xyXG4gICAgICAgICAgICBkb2N1bWVudC5ib2R5LnJlbW92ZUNoaWxkKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIHRvIGNhbnZhcyBmb3IgcmUtbG9ja2luZyBwb2ludGVyIGFmdGVyIHRpdGxlIHNjcmVlbiBpcyBnb25lXHJcbiAgICAgICAgdGhpcy5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLmhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIuYmluZCh0aGlzKSk7XHJcblxyXG4gICAgICAgIC8vIFJlcXVlc3QgcG9pbnRlciBsb2NrIGZvciBpbW1lcnNpdmUgbW91c2UgY29udHJvbFxyXG4gICAgICAgIHRoaXMuY2FudmFzLnJlcXVlc3RQb2ludGVyTG9jaygpO1xyXG4gICAgICAgIC8vIEVuc3VyZSBiYWNrZ3JvdW5kIG11c2ljIHBsYXlzIG5vdyB0aGF0IGEgdXNlciBnZXN0dXJlIGhhcyBvY2N1cnJlZFxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnYmFja2dyb3VuZF9tdXNpYycpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkJHTSBwbGF5IGZhaWxlZCBhZnRlciB1c2VyIGdlc3R1cmU6XCIsIGUpKTtcclxuXHJcbiAgICAgICAgLy8gTkVXOiBTaG93IGNyb3NzaGFpciB3aGVuIGdhbWUgc3RhcnRzXHJcbiAgICAgICAgaWYgKHRoaXMuY3Jvc3NoYWlyRWxlbWVudCkge1xyXG4gICAgICAgICAgICB0aGlzLmNyb3NzaGFpckVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSGFuZGxlcyBjbGlja3Mgb24gdGhlIGNhbnZhcyB0byByZS1sb2NrIHRoZSBwb2ludGVyIGlmIHRoZSBnYW1lIGlzIHBsYXlpbmcgYW5kIHVubG9ja2VkLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGhhbmRsZUNhbnZhc1JlTG9ja1BvaW50ZXIoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5QTEFZSU5HICYmICF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICB0aGlzLmNhbnZhcy5yZXF1ZXN0UG9pbnRlckxvY2soKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIHRoZSBwbGF5ZXIncyB2aXN1YWwgbWVzaCBhbmQgcGh5c2ljcyBib2R5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZVBsYXllcigpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgdmlzdWFsIG1lc2ggKGEgc2ltcGxlIGJveClcclxuICAgICAgICBjb25zdCBwbGF5ZXJUZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQoJ3BsYXllcl90ZXh0dXJlJyk7XHJcbiAgICAgICAgY29uc3QgcGxheWVyTWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaExhbWJlcnRNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgIG1hcDogcGxheWVyVGV4dHVyZSxcclxuICAgICAgICAgICAgY29sb3I6IHBsYXllclRleHR1cmUgPyAweGZmZmZmZiA6IDB4MDA3N2ZmIC8vIFVzZSB3aGl0ZSB3aXRoIHRleHR1cmUsIG9yIGJsdWUgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KDEsIDIsIDEpOyAvLyBQbGF5ZXIgZGltZW5zaW9uc1xyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaCA9IG5ldyBUSFJFRS5NZXNoKHBsYXllckdlb21ldHJ5LCBwbGF5ZXJNYXRlcmlhbCk7XHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnkgPSA1OyAvLyBTdGFydCBwbGF5ZXIgc2xpZ2h0bHkgYWJvdmUgdGhlIGdyb3VuZFxyXG4gICAgICAgIHRoaXMucGxheWVyTWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTsgLy8gUGxheWVyIGNhc3RzIGEgc2hhZG93XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5wbGF5ZXJNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gUGxheWVyIHBoeXNpY3MgYm9keSAoQ2Fubm9uLmpzIGJveCBzaGFwZSlcclxuICAgICAgICBjb25zdCBwbGF5ZXJTaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMygwLjUsIDEsIDAuNSkpOyAvLyBIYWxmIGV4dGVudHMgb2YgdGhlIGJveCBmb3IgY29sbGlzaW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllck1hc3MsIC8vIFBsYXllcidzIG1hc3NcclxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyh0aGlzLnBsYXllck1lc2gucG9zaXRpb24ueCwgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLnksIHRoaXMucGxheWVyTWVzaC5wb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgc2hhcGU6IHBsYXllclNoYXBlLFxyXG4gICAgICAgICAgICBmaXhlZFJvdGF0aW9uOiB0cnVlLCAvLyBQcmV2ZW50IHRoZSBwbGF5ZXIgZnJvbSBmYWxsaW5nIG92ZXIgKHNpbXVsYXRlcyBhIGNhcHN1bGUvY3lsaW5kZXIgY2hhcmFjdGVyKVxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5wbGF5ZXJNYXRlcmlhbCAvLyBBc3NpZ24gdGhlIHBsYXllciBtYXRlcmlhbCBmb3IgY29udGFjdCByZXNvbHV0aW9uXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHRoaXMucGxheWVyQm9keSk7XHJcblxyXG4gICAgICAgIC8vIFNldCBpbml0aWFsIGNhbWVyYUNvbnRhaW5lciBwb3NpdGlvbiB0byBwbGF5ZXIncyBwaHlzaWNzIGJvZHkgcG9zaXRpb24uXHJcbiAgICAgICAgLy8gVGhlIGNhbWVyYSBpdHNlbGYgaXMgYSBjaGlsZCBvZiBjYW1lcmFDb250YWluZXIgYW5kIGhhcyBpdHMgb3duIGxvY2FsIFkgb2Zmc2V0LlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBDcmVhdGVzIHRoZSBncm91bmQncyB2aXN1YWwgbWVzaCBhbmQgcGh5c2ljcyBib2R5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNyZWF0ZUdyb3VuZCgpIHtcclxuICAgICAgICAvLyBHcm91bmQgdmlzdWFsIG1lc2ggKGEgbGFyZ2UgcGxhbmUpXHJcbiAgICAgICAgY29uc3QgZ3JvdW5kVGV4dHVyZSA9IHRoaXMudGV4dHVyZXMuZ2V0KCdncm91bmRfdGV4dHVyZScpO1xyXG4gICAgICAgIGNvbnN0IGdyb3VuZE1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICBtYXA6IGdyb3VuZFRleHR1cmUsXHJcbiAgICAgICAgICAgIGNvbG9yOiBncm91bmRUZXh0dXJlID8gMHhmZmZmZmYgOiAweDg4ODg4OCAvLyBVc2Ugd2hpdGUgd2l0aCB0ZXh0dXJlLCBvciBncmV5IGlmIG5vIHRleHR1cmVcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zdCBncm91bmRHZW9tZXRyeSA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MuZ3JvdW5kU2l6ZSk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRNZXNoID0gbmV3IFRIUkVFLk1lc2goZ3JvdW5kR2VvbWV0cnksIGdyb3VuZE1hdGVyaWFsKTtcclxuICAgICAgICB0aGlzLmdyb3VuZE1lc2gucm90YXRpb24ueCA9IC1NYXRoLlBJIC8gMjsgLy8gUm90YXRlIHRvIGxheSBmbGF0IG9uIHRoZSBYWiBwbGFuZVxyXG4gICAgICAgIHRoaXMuZ3JvdW5kTWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTsgLy8gR3JvdW5kIHJlY2VpdmVzIHNoYWRvd3NcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmdyb3VuZE1lc2gpO1xyXG5cclxuICAgICAgICAvLyBHcm91bmQgcGh5c2ljcyBib2R5IChDYW5ub24uanMgcGxhbmUgc2hhcGUpXHJcbiAgICAgICAgY29uc3QgZ3JvdW5kU2hhcGUgPSBuZXcgQ0FOTk9OLlBsYW5lKCk7XHJcbiAgICAgICAgdGhpcy5ncm91bmRCb2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgbWFzczogMCwgLy8gQSBtYXNzIG9mIDAgbWFrZXMgaXQgYSBzdGF0aWMgKGltbW92YWJsZSkgYm9keVxyXG4gICAgICAgICAgICBzaGFwZTogZ3JvdW5kU2hhcGUsXHJcbiAgICAgICAgICAgIG1hdGVyaWFsOiB0aGlzLmdyb3VuZE1hdGVyaWFsIC8vIEFzc2lnbiB0aGUgZ3JvdW5kIG1hdGVyaWFsIGZvciBjb250YWN0IHJlc29sdXRpb25cclxuICAgICAgICB9KTtcclxuICAgICAgICAvLyBSb3RhdGUgdGhlIENhbm5vbi5qcyBwbGFuZSBib2R5IHRvIG1hdGNoIHRoZSBUaHJlZS5qcyBwbGFuZSBvcmllbnRhdGlvbiAoZmxhdClcclxuICAgICAgICB0aGlzLmdyb3VuZEJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygxLCAwLCAwKSwgLU1hdGguUEkgLyAyKTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkodGhpcy5ncm91bmRCb2R5KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogQ3JlYXRlcyB2aXN1YWwgbWVzaGVzIGFuZCBwaHlzaWNzIGJvZGllcyBmb3IgYWxsIHN0YXRpYyBvYmplY3RzIChib3hlcykgZGVmaW5lZCBpbiBjb25maWcuZ2FtZVNldHRpbmdzLnN0YXRpY09iamVjdHMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlU3RhdGljT2JqZWN0cygpIHsgLy8gUmVuYW1lZCBmcm9tIGNyZWF0ZVBsYWNlZE9iamVjdHNcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5zdGF0aWNPYmplY3RzKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIk5vIHN0YXRpY09iamVjdHMgZGVmaW5lZCBpbiBnYW1lU2V0dGluZ3MuXCIpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3Muc3RhdGljT2JqZWN0cy5mb3JFYWNoKG9iakNvbmZpZyA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRleHR1cmUgPSB0aGlzLnRleHR1cmVzLmdldChvYmpDb25maWcudGV4dHVyZU5hbWUpO1xyXG4gICAgICAgICAgICBjb25zdCBtYXRlcmlhbCA9IG5ldyBUSFJFRS5NZXNoTGFtYmVydE1hdGVyaWFsKHtcclxuICAgICAgICAgICAgICAgIG1hcDogdGV4dHVyZSxcclxuICAgICAgICAgICAgICAgIGNvbG9yOiB0ZXh0dXJlID8gMHhmZmZmZmYgOiAweGFhYWFhYSAvLyBEZWZhdWx0IGdyZXkgaWYgbm8gdGV4dHVyZVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBUaHJlZS5qcyBNZXNoXHJcbiAgICAgICAgICAgIGNvbnN0IGdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KG9iakNvbmZpZy5kaW1lbnNpb25zLndpZHRoLCBvYmpDb25maWcuZGltZW5zaW9ucy5oZWlnaHQsIG9iakNvbmZpZy5kaW1lbnNpb25zLmRlcHRoKTtcclxuICAgICAgICAgICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcbiAgICAgICAgICAgIG1lc2gucG9zaXRpb24uc2V0KG9iakNvbmZpZy5wb3NpdGlvbi54LCBvYmpDb25maWcucG9zaXRpb24ueSwgb2JqQ29uZmlnLnBvc2l0aW9uLnopO1xyXG4gICAgICAgICAgICBpZiAob2JqQ29uZmlnLnJvdGF0aW9uWSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBtZXNoLnJvdGF0aW9uLnkgPSBvYmpDb25maWcucm90YXRpb25ZO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1lc2guY2FzdFNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgICAgIG1lc2gucmVjZWl2ZVNoYWRvdyA9IHRydWU7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUuYWRkKG1lc2gpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYWNlZE9iamVjdE1lc2hlcy5wdXNoKG1lc2gpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIENhbm5vbi5qcyBCb2R5XHJcbiAgICAgICAgICAgIC8vIENhbm5vbi5Cb3ggdGFrZXMgaGFsZiBleHRlbnRzXHJcbiAgICAgICAgICAgIGNvbnN0IHNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKFxyXG4gICAgICAgICAgICAgICAgb2JqQ29uZmlnLmRpbWVuc2lvbnMud2lkdGggLyAyLFxyXG4gICAgICAgICAgICAgICAgb2JqQ29uZmlnLmRpbWVuc2lvbnMuaGVpZ2h0IC8gMixcclxuICAgICAgICAgICAgICAgIG9iakNvbmZpZy5kaW1lbnNpb25zLmRlcHRoIC8gMlxyXG4gICAgICAgICAgICApKTtcclxuICAgICAgICAgICAgY29uc3QgYm9keSA9IG5ldyBDQU5OT04uQm9keSh7XHJcbiAgICAgICAgICAgICAgICBtYXNzOiBvYmpDb25maWcubWFzcywgLy8gVXNlIDAgZm9yIHN0YXRpYyBvYmplY3RzXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbjogbmV3IENBTk5PTi5WZWMzKG9iakNvbmZpZy5wb3NpdGlvbi54LCBvYmpDb25maWcucG9zaXRpb24ueSwgb2JqQ29uZmlnLnBvc2l0aW9uLnopLFxyXG4gICAgICAgICAgICAgICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgICAgICAgICAgICAgbWF0ZXJpYWw6IHRoaXMuZGVmYXVsdE9iamVjdE1hdGVyaWFsIC8vIEFzc2lnbiB0aGUgZGVmYXVsdCBvYmplY3QgbWF0ZXJpYWxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGlmIChvYmpDb25maWcucm90YXRpb25ZICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIGJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygwLCAxLCAwKSwgb2JqQ29uZmlnLnJvdGF0aW9uWSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJvZHkpO1xyXG4gICAgICAgICAgICB0aGlzLnBsYWNlZE9iamVjdEJvZGllcy5wdXNoKGJvZHkpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBDcmVhdGVkICR7dGhpcy5wbGFjZWRPYmplY3RNZXNoZXMubGVuZ3RofSBzdGF0aWMgb2JqZWN0cy5gKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIE5FVzogQ3JlYXRlcyB2aXN1YWwgbWVzaGVzIGFuZCBwaHlzaWNzIGJvZGllcyBmb3IgYWxsIGVuZW15IGluc3RhbmNlcyBkZWZpbmVkIGluIGNvbmZpZy5nYW1lU2V0dGluZ3MuZW5lbXlJbnN0YW5jZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgY3JlYXRlRW5lbWllcygpIHtcclxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteUluc3RhbmNlcyB8fCAhdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15VHlwZXMpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiTm8gZW5lbXlJbnN0YW5jZXMgb3IgZW5lbXlUeXBlcyBkZWZpbmVkIGluIGdhbWVTZXR0aW5ncy5cIik7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGVuZW15VHlwZU1hcCA9IG5ldyBNYXA8c3RyaW5nLCBFbmVteVR5cGVDb25maWc+KCk7XHJcbiAgICAgICAgdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmVuZW15VHlwZXMuZm9yRWFjaCh0eXBlID0+IGVuZW15VHlwZU1hcC5zZXQodHlwZS5uYW1lLCB0eXBlKSk7XHJcblxyXG4gICAgICAgIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5lbmVteUluc3RhbmNlcy5mb3JFYWNoKGluc3RhbmNlQ29uZmlnID0+IHtcclxuICAgICAgICAgICAgY29uc3QgdHlwZUNvbmZpZyA9IGVuZW15VHlwZU1hcC5nZXQoaW5zdGFuY2VDb25maWcuZW5lbXlUeXBlTmFtZSk7XHJcbiAgICAgICAgICAgIGlmICghdHlwZUNvbmZpZykge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRW5lbXkgdHlwZSAnJHtpbnN0YW5jZUNvbmZpZy5lbmVteVR5cGVOYW1lfScgbm90IGZvdW5kIGZvciBpbnN0YW5jZSAnJHtpbnN0YW5jZUNvbmZpZy5uYW1lfScuIFNraXBwaW5nLmApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy50ZXh0dXJlcy5nZXQodHlwZUNvbmZpZy50ZXh0dXJlTmFtZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hMYW1iZXJ0TWF0ZXJpYWwoe1xyXG4gICAgICAgICAgICAgICAgbWFwOiB0ZXh0dXJlLFxyXG4gICAgICAgICAgICAgICAgY29sb3I6IHRleHR1cmUgPyAweGZmZmZmZiA6IDB4ZmYwMDAwIC8vIERlZmF1bHQgcmVkIGlmIG5vIHRleHR1cmVcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgVGhyZWUuanMgTWVzaFxyXG4gICAgICAgICAgICBjb25zdCBnZW9tZXRyeSA9IG5ldyBUSFJFRS5Cb3hHZW9tZXRyeSh0eXBlQ29uZmlnLmRpbWVuc2lvbnMud2lkdGgsIHR5cGVDb25maWcuZGltZW5zaW9ucy5oZWlnaHQsIHR5cGVDb25maWcuZGltZW5zaW9ucy5kZXB0aCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lc2ggPSBuZXcgVEhSRUUuTWVzaChnZW9tZXRyeSwgbWF0ZXJpYWwpO1xyXG4gICAgICAgICAgICBtZXNoLnBvc2l0aW9uLnNldChpbnN0YW5jZUNvbmZpZy5wb3NpdGlvbi54LCBpbnN0YW5jZUNvbmZpZy5wb3NpdGlvbi55LCBpbnN0YW5jZUNvbmZpZy5wb3NpdGlvbi56KTtcclxuICAgICAgICAgICAgaWYgKGluc3RhbmNlQ29uZmlnLnJvdGF0aW9uWSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBtZXNoLnJvdGF0aW9uLnkgPSBpbnN0YW5jZUNvbmZpZy5yb3RhdGlvblk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWVzaC5jYXN0U2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgbWVzaC5yZWNlaXZlU2hhZG93ID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQobWVzaCk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgQ2Fubm9uLmpzIEJvZHlcclxuICAgICAgICAgICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkJveChuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgICAgICAgICAgICB0eXBlQ29uZmlnLmRpbWVuc2lvbnMud2lkdGggLyAyLFxyXG4gICAgICAgICAgICAgICAgdHlwZUNvbmZpZy5kaW1lbnNpb25zLmhlaWdodCAvIDIsXHJcbiAgICAgICAgICAgICAgICB0eXBlQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGggLyAyXHJcbiAgICAgICAgICAgICkpO1xyXG4gICAgICAgICAgICBjb25zdCBib2R5ID0gbmV3IENBTk5PTi5Cb2R5KHtcclxuICAgICAgICAgICAgICAgIG1hc3M6IHR5cGVDb25maWcubWFzcyxcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBuZXcgQ0FOTk9OLlZlYzMoaW5zdGFuY2VDb25maWcucG9zaXRpb24ueCwgaW5zdGFuY2VDb25maWcucG9zaXRpb24ueSwgaW5zdGFuY2VDb25maWcucG9zaXRpb24ueiksXHJcbiAgICAgICAgICAgICAgICBzaGFwZTogc2hhcGUsXHJcbiAgICAgICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5lbmVteU1hdGVyaWFsLFxyXG4gICAgICAgICAgICAgICAgZml4ZWRSb3RhdGlvbjogdHJ1ZSAvLyBQcmV2ZW50IGVuZW1pZXMgZnJvbSB0dW1ibGluZ1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgaWYgKGluc3RhbmNlQ29uZmlnLnJvdGF0aW9uWSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBib2R5LnF1YXRlcm5pb24uc2V0RnJvbUF4aXNBbmdsZShuZXcgQ0FOTk9OLlZlYzMoMCwgMSwgMCksIGluc3RhbmNlQ29uZmlnLnJvdGF0aW9uWSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJvZHkpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgYWN0aXZlRW5lbXk6IEFjdGl2ZUVuZW15ID0ge1xyXG4gICAgICAgICAgICAgICAgbmFtZTogaW5zdGFuY2VDb25maWcubmFtZSxcclxuICAgICAgICAgICAgICAgIG1lc2g6IG1lc2gsXHJcbiAgICAgICAgICAgICAgICBib2R5OiBib2R5LFxyXG4gICAgICAgICAgICAgICAgdHlwZUNvbmZpZzogdHlwZUNvbmZpZyxcclxuICAgICAgICAgICAgICAgIGN1cnJlbnRIZWFsdGg6IHR5cGVDb25maWcuaGVhbHRoLFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBib2R5LnVzZXJEYXRhID0gYWN0aXZlRW5lbXk7IC8vIEF0dGFjaCBhY3RpdmVFbmVteSB0byBib2R5IGZvciBjb2xsaXNpb24gbG9va3VwXHJcblxyXG4gICAgICAgICAgICB0aGlzLmVuZW1pZXMucHVzaChhY3RpdmVFbmVteSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYENyZWF0ZWQgJHt0aGlzLmVuZW1pZXMubGVuZ3RofSBlbmVtaWVzLmApO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU2V0cyB1cCBhbWJpZW50IGFuZCBkaXJlY3Rpb25hbCBsaWdodGluZyBpbiB0aGUgc2NlbmUuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgc2V0dXBMaWdodGluZygpIHtcclxuICAgICAgICBjb25zdCBhbWJpZW50TGlnaHQgPSBuZXcgVEhSRUUuQW1iaWVudExpZ2h0KDB4NDA0MDQwLCAxLjApOyAvLyBTb2Z0IHdoaXRlIGFtYmllbnQgbGlnaHRcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChhbWJpZW50TGlnaHQpO1xyXG5cclxuICAgICAgICBjb25zdCBkaXJlY3Rpb25hbExpZ2h0ID0gbmV3IFRIUkVFLkRpcmVjdGlvbmFsTGlnaHQoMHhmZmZmZmYsIDAuOCk7IC8vIEJyaWdodGVyIGRpcmVjdGlvbmFsIGxpZ2h0XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5wb3NpdGlvbi5zZXQoNSwgMTAsIDUpOyAvLyBQb3NpdGlvbiB0aGUgbGlnaHQgc291cmNlXHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5jYXN0U2hhZG93ID0gdHJ1ZTsgLy8gRW5hYmxlIHNoYWRvd3MgZnJvbSB0aGlzIGxpZ2h0IHNvdXJjZVxyXG4gICAgICAgIC8vIENvbmZpZ3VyZSBzaGFkb3cgcHJvcGVydGllcyBmb3IgdGhlIGRpcmVjdGlvbmFsIGxpZ2h0XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS53aWR0aCA9IDEwMjQ7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS5oZWlnaHQgPSAxMDI0O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5uZWFyID0gMC41O1xyXG4gICAgICAgIGRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5mYXIgPSA1MDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEubGVmdCA9IC0xMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEucmlnaHQgPSAxMDtcclxuICAgICAgICBkaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5jYW1lcmEudG9wID0gMTA7XHJcbiAgICAgICAgZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmJvdHRvbSA9IC0xMDtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChkaXJlY3Rpb25hbExpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgd2luZG93IHJlc2l6aW5nIHRvIGtlZXAgdGhlIGNhbWVyYSBhc3BlY3QgcmF0aW8gYW5kIHJlbmRlcmVyIHNpemUgY29ycmVjdC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbldpbmRvd1Jlc2l6ZSgpIHtcclxuICAgICAgICB0aGlzLmFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpOyAvLyBBcHBseSB0aGUgZml4ZWQgYXNwZWN0IHJhdGlvIGFuZCBjZW50ZXIgdGhlIGNhbnZhc1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQXBwbGllcyB0aGUgY29uZmlndXJlZCBmaXhlZCBhc3BlY3QgcmF0aW8gdG8gdGhlIHJlbmRlcmVyIGFuZCBjYW1lcmEsXHJcbiAgICAgKiByZXNpemluZyBhbmQgY2VudGVyaW5nIHRoZSBjYW52YXMgdG8gZml0IHdpdGhpbiB0aGUgd2luZG93LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFwcGx5Rml4ZWRBc3BlY3RSYXRpbygpIHtcclxuICAgICAgICBjb25zdCB0YXJnZXRBc3BlY3RSYXRpbyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5maXhlZEFzcGVjdFJhdGlvLndpZHRoIC8gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmZpeGVkQXNwZWN0UmF0aW8uaGVpZ2h0O1xyXG5cclxuICAgICAgICBsZXQgbmV3V2lkdGg6IG51bWJlcjtcclxuICAgICAgICBsZXQgbmV3SGVpZ2h0OiBudW1iZXI7XHJcblxyXG4gICAgICAgIGNvbnN0IHdpbmRvd1dpZHRoID0gd2luZG93LmlubmVyV2lkdGg7XHJcbiAgICAgICAgY29uc3Qgd2luZG93SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRXaW5kb3dBc3BlY3RSYXRpbyA9IHdpbmRvd1dpZHRoIC8gd2luZG93SGVpZ2h0O1xyXG5cclxuICAgICAgICBpZiAoY3VycmVudFdpbmRvd0FzcGVjdFJhdGlvID4gdGFyZ2V0QXNwZWN0UmF0aW8pIHtcclxuICAgICAgICAgICAgLy8gV2luZG93IGlzIHdpZGVyIHRoYW4gdGFyZ2V0IGFzcGVjdCByYXRpbywgaGVpZ2h0IGlzIHRoZSBsaW1pdGluZyBmYWN0b3JcclxuICAgICAgICAgICAgbmV3SGVpZ2h0ID0gd2luZG93SGVpZ2h0O1xyXG4gICAgICAgICAgICBuZXdXaWR0aCA9IG5ld0hlaWdodCAqIHRhcmdldEFzcGVjdFJhdGlvO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIFdpbmRvdyBpcyB0YWxsZXIgKG9yIGV4YWN0bHkpIHRoZSB0YXJnZXQgYXNwZWN0IHJhdGlvLCB3aWR0aCBpcyB0aGUgbGltaXRpbmcgZmFjdG9yXHJcbiAgICAgICAgICAgIG5ld1dpZHRoID0gd2luZG93V2lkdGg7XHJcbiAgICAgICAgICAgIG5ld0hlaWdodCA9IG5ld1dpZHRoIC8gdGFyZ2V0QXNwZWN0UmF0aW87XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTZXQgcmVuZGVyZXIgc2l6ZS4gVGhlIHRoaXJkIGFyZ3VtZW50IGB1cGRhdGVTdHlsZWAgaXMgZmFsc2UgYmVjYXVzZSB3ZSBtYW5hZ2Ugc3R5bGUgbWFudWFsbHkuXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKG5ld1dpZHRoLCBuZXdIZWlnaHQsIGZhbHNlKTtcclxuICAgICAgICB0aGlzLmNhbWVyYS5hc3BlY3QgPSB0YXJnZXRBc3BlY3RSYXRpbztcclxuICAgICAgICB0aGlzLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcblxyXG4gICAgICAgIC8vIFBvc2l0aW9uIGFuZCBzaXplIHRoZSBjYW52YXMgZWxlbWVudCB1c2luZyBDU1NcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMuY2FudmFzLnN0eWxlLCB7XHJcbiAgICAgICAgICAgIHdpZHRoOiBgJHtuZXdXaWR0aH1weGAsXHJcbiAgICAgICAgICAgIGhlaWdodDogYCR7bmV3SGVpZ2h0fXB4YCxcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIHRvcDogJzUwJScsXHJcbiAgICAgICAgICAgIGxlZnQ6ICc1MCUnLFxyXG4gICAgICAgICAgICB0cmFuc2Zvcm06ICd0cmFuc2xhdGUoLTUwJSwgLTUwJSknLFxyXG4gICAgICAgICAgICBvYmplY3RGaXQ6ICdjb250YWluJyAvLyBFbnN1cmVzIGNvbnRlbnQgaXMgc2NhbGVkIGFwcHJvcHJpYXRlbHkgaWYgdGhlcmUncyBhbnkgbWlzbWF0Y2hcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gSWYgdGhlIHRpdGxlIHNjcmVlbiBpcyBhY3RpdmUsIHVwZGF0ZSBpdHMgc2l6ZSBhbmQgcG9zaXRpb24gYXMgd2VsbCB0byBtYXRjaCB0aGUgY2FudmFzXHJcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IEdhbWVTdGF0ZS5USVRMRSAmJiB0aGlzLnRpdGxlU2NyZWVuT3ZlcmxheSkge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMudGl0bGVTY3JlZW5PdmVybGF5LnN0eWxlLCB7XHJcbiAgICAgICAgICAgICAgICB3aWR0aDogYCR7bmV3V2lkdGh9cHhgLFxyXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBgJHtuZXdIZWlnaHR9cHhgLFxyXG4gICAgICAgICAgICAgICAgdG9wOiAnNTAlJyxcclxuICAgICAgICAgICAgICAgIGxlZnQ6ICc1MCUnLFxyXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKC01MCUsIC01MCUpJyxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFRoZSBjcm9zc2hhaXIgYW5kIHNjb3JlIHRleHQgd2lsbCBhdXRvbWF0aWNhbGx5IHJlLWNlbnRlciBkdWUgdG8gdGhlaXIgJ2Fic29sdXRlJyBwb3NpdGlvbmluZ1xyXG4gICAgICAgIC8vIGFuZCAndHJhbnNsYXRlKC01MCUsIC01MCUpJyByZWxhdGl2ZSB0byB0aGUgY2FudmFzJ3MgbmV3IHBvc2l0aW9uLlxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcHJlc3NlZCBkb3duLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIG9uS2V5RG93bihldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSB0cnVlO1xyXG4gICAgICAgIC8vIEFEREVEOiBIYW5kbGUganVtcCBpbnB1dCBvbmx5IHdoZW4gcGxheWluZyBhbmQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgaWYgKGV2ZW50LmtleS50b0xvd2VyQ2FzZSgpID09PSAnICcpIHsgLy8gU3BhY2ViYXJcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVySnVtcCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogUmVjb3JkcyB3aGljaCBrZXlzIGFyZSBjdXJyZW50bHkgcmVsZWFzZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25LZXlVcChldmVudDogS2V5Ym9hcmRFdmVudCkge1xyXG4gICAgICAgIHRoaXMua2V5c1tldmVudC5rZXkudG9Mb3dlckNhc2UoKV0gPSBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEhhbmRsZXMgbW91c2UgbW92ZW1lbnQgZm9yIGNhbWVyYSByb3RhdGlvbiAobW91c2UgbG9vaykuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25Nb3VzZU1vdmUoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICAvLyBPbmx5IHByb2Nlc3MgbW91c2UgbW92ZW1lbnQgaWYgdGhlIGdhbWUgaXMgcGxheWluZyBhbmQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcgJiYgdGhpcy5pc1BvaW50ZXJMb2NrZWQpIHtcclxuICAgICAgICAgICAgY29uc3QgbW92ZW1lbnRYID0gZXZlbnQubW92ZW1lbnRYIHx8IDA7XHJcbiAgICAgICAgICAgIGNvbnN0IG1vdmVtZW50WSA9IGV2ZW50Lm1vdmVtZW50WSB8fCAwO1xyXG5cclxuICAgICAgICAgICAgLy8gQXBwbHkgaG9yaXpvbnRhbCByb3RhdGlvbiAoeWF3KSB0byB0aGUgY2FtZXJhQ29udGFpbmVyIGFyb3VuZCBpdHMgbG9jYWwgWS1heGlzICh3aGljaCBpcyBnbG9iYWwgWSlcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmFDb250YWluZXIucm90YXRpb24ueSAtPSBtb3ZlbWVudFggKiB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubW91c2VTZW5zaXRpdml0eTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IHZlcnRpY2FsIHJvdGF0aW9uIChwaXRjaCkgdG8gdGhlIGNhbWVyYSBpdHNlbGYgYW5kIGNsYW1wIGl0XHJcbiAgICAgICAgICAgIC8vIE1vdXNlIFVQIChtb3ZlbWVudFkgPCAwKSBub3cgaW5jcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIHVwLlxyXG4gICAgICAgICAgICAvLyBNb3VzZSBET1dOIChtb3ZlbWVudFkgPiAwKSBub3cgZGVjcmVhc2VzIGNhbWVyYVBpdGNoIC0+IGxvb2tzIGRvd24uXHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhUGl0Y2ggLT0gbW92ZW1lbnRZICogdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLm1vdXNlU2Vuc2l0aXZpdHk7IFxyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYVBpdGNoID0gTWF0aC5tYXgoLU1hdGguUEkgLyAyLCBNYXRoLm1pbihNYXRoLlBJIC8gMiwgdGhpcy5jYW1lcmFQaXRjaCkpOyAvLyBDbGFtcCB0byAtOTAgdG8gKzkwIGRlZ3JlZXNcclxuICAgICAgICAgICAgdGhpcy5jYW1lcmEucm90YXRpb24ueCA9IHRoaXMuY2FtZXJhUGl0Y2g7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBIYW5kbGVzIG1vdXNlIGNsaWNrIGZvciBmaXJpbmcgYnVsbGV0cy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvbk1vdXNlRG93bihldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIGlmICh0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORyAmJiB0aGlzLmlzUG9pbnRlckxvY2tlZCAmJiBldmVudC5idXR0b24gPT09IDApIHsgLy8gTGVmdCBtb3VzZSBidXR0b25cclxuICAgICAgICAgICAgdGhpcy5maXJlQnVsbGV0KCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBGaXJlcyBhIGJ1bGxldCBmcm9tIHRoZSBwbGF5ZXIncyBjYW1lcmEgcG9zaXRpb24gYW5kIGRpcmVjdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBmaXJlQnVsbGV0KCkge1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldENvbmZpZyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQ7XHJcblxyXG4gICAgICAgIC8vIDEuIEdldCBidWxsZXQgaW5pdGlhbCBwb3NpdGlvbiBhbmQgZGlyZWN0aW9uXHJcbiAgICAgICAgY29uc3QgY2FtZXJhV29ybGRQb3NpdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgdGhpcy5jYW1lcmEuZ2V0V29ybGRQb3NpdGlvbihjYW1lcmFXb3JsZFBvc2l0aW9uKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FtZXJhV29ybGREaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmdldFdvcmxkRGlyZWN0aW9uKGNhbWVyYVdvcmxkRGlyZWN0aW9uKTtcclxuXHJcbiAgICAgICAgLy8gMi4gQ3JlYXRlIFRocmVlLmpzIE1lc2ggZm9yIHRoZSBidWxsZXRcclxuICAgICAgICBjb25zdCBidWxsZXRNZXNoID0gbmV3IFRIUkVFLk1lc2godGhpcy5idWxsZXRHZW9tZXRyeSwgdGhpcy5idWxsZXRNYXRlcmlhbE1lc2gpO1xyXG4gICAgICAgIGJ1bGxldE1lc2gucG9zaXRpb24uY29weShjYW1lcmFXb3JsZFBvc2l0aW9uKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZChidWxsZXRNZXNoKTtcclxuXHJcbiAgICAgICAgLy8gMy4gQ3JlYXRlIENhbm5vbi5qcyBCb2R5IGZvciB0aGUgYnVsbGV0XHJcbiAgICAgICAgY29uc3QgYnVsbGV0U2hhcGUgPSBuZXcgQ0FOTk9OLlNwaGVyZShidWxsZXRDb25maWcuZGltZW5zaW9ucy5yYWRpdXMpO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldEJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiBidWxsZXRDb25maWcubWFzcyxcclxuICAgICAgICAgICAgcG9zaXRpb246IG5ldyBDQU5OT04uVmVjMyhjYW1lcmFXb3JsZFBvc2l0aW9uLngsIGNhbWVyYVdvcmxkUG9zaXRpb24ueSwgY2FtZXJhV29ybGRQb3NpdGlvbi56KSxcclxuICAgICAgICAgICAgc2hhcGU6IGJ1bGxldFNoYXBlLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogdGhpcy5idWxsZXRNYXRlcmlhbCxcclxuICAgICAgICAgICAgLy8gQnVsbGV0cyBzaG91bGQgbm90IGJlIGFmZmVjdGVkIGJ5IHBsYXllciBtb3ZlbWVudCwgYnV0IHNob3VsZCBoYXZlIGdyYXZpdHlcclxuICAgICAgICAgICAgbGluZWFyRGFtcGluZzogMC4wMSwgLy8gU21hbGwgZGFtcGluZyB0byBwcmV2ZW50IGluZmluaXRlIHNsaWRpbmdcclxuICAgICAgICAgICAgYW5ndWxhckRhbXBpbmc6IDAuOTkgLy8gQWxsb3dzIHNvbWUgcm90YXRpb24sIGJ1dCBzdG9wcyBxdWlja2x5XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFNldCBidWxsZXQgaW5pdGlhbCB2ZWxvY2l0eVxyXG4gICAgICAgIGJ1bGxldEJvZHkudmVsb2NpdHkuc2V0KFxyXG4gICAgICAgICAgICBjYW1lcmFXb3JsZERpcmVjdGlvbi54ICogYnVsbGV0Q29uZmlnLnNwZWVkLFxyXG4gICAgICAgICAgICBjYW1lcmFXb3JsZERpcmVjdGlvbi55ICogYnVsbGV0Q29uZmlnLnNwZWVkLFxyXG4gICAgICAgICAgICBjYW1lcmFXb3JsZERpcmVjdGlvbi56ICogYnVsbGV0Q29uZmlnLnNwZWVkXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gU3RvcmUgYSByZWZlcmVuY2UgdG8gdGhlIGFjdGl2ZSBidWxsZXQgb2JqZWN0IG9uIHRoZSBib2R5IGZvciBjb2xsaXNpb24gY2FsbGJhY2tcclxuICAgICAgICBjb25zdCBhY3RpdmVCdWxsZXQ6IEFjdGl2ZUJ1bGxldCA9IHtcclxuICAgICAgICAgICAgbWVzaDogYnVsbGV0TWVzaCxcclxuICAgICAgICAgICAgYm9keTogYnVsbGV0Qm9keSxcclxuICAgICAgICAgICAgY3JlYXRpb25UaW1lOiB0aGlzLmxhc3RUaW1lIC8gMTAwMCwgLy8gU3RvcmUgY3JlYXRpb24gdGltZSBpbiBzZWNvbmRzXHJcbiAgICAgICAgICAgIGZpcmVQb3NpdGlvbjogYnVsbGV0Qm9keS5wb3NpdGlvbi5jbG9uZSgpIC8vIFN0b3JlIGluaXRpYWwgZmlyZSBwb3NpdGlvbiBmb3IgcmFuZ2UgY2hlY2tcclxuICAgICAgICB9O1xyXG4gICAgICAgIGFjdGl2ZUJ1bGxldC5jb2xsaWRlSGFuZGxlciA9IChldmVudDogQ29sbGlkZUV2ZW50KSA9PiB0aGlzLm9uQnVsbGV0Q29sbGlkZShldmVudCwgYWN0aXZlQnVsbGV0KTsgLy8gU3RvcmUgc3BlY2lmaWMgaGFuZGxlclxyXG4gICAgICAgIGJ1bGxldEJvZHkudXNlckRhdGEgPSBhY3RpdmVCdWxsZXQ7IC8vIEF0dGFjaCB0aGUgYWN0aXZlQnVsbGV0IG9iamVjdCB0byB0aGUgQ2Fubm9uLkJvZHlcclxuXHJcbiAgICAgICAgYnVsbGV0Qm9keS5hZGRFdmVudExpc3RlbmVyKCdjb2xsaWRlJywgYWN0aXZlQnVsbGV0LmNvbGxpZGVIYW5kbGVyKTsgLy8gVXNlIHRoZSBzdG9yZWQgaGFuZGxlclxyXG5cclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoYnVsbGV0Qm9keSk7XHJcbiAgICAgICAgdGhpcy5idWxsZXRzLnB1c2goYWN0aXZlQnVsbGV0KTtcclxuXHJcbiAgICAgICAgLy8gUGxheSBzaG9vdCBzb3VuZFxyXG4gICAgICAgIHRoaXMuc291bmRzLmdldCgnc2hvb3Rfc291bmQnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJTaG9vdCBzb3VuZCBwbGF5IGRlbmllZDpcIiwgZSkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBIYW5kbGVzIGJ1bGxldCBjb2xsaXNpb25zLlxyXG4gICAgICogQHBhcmFtIGV2ZW50IFRoZSBDYW5ub24uanMgY29sbGlzaW9uIGV2ZW50LlxyXG4gICAgICogQHBhcmFtIGJ1bGxldCBUaGUgQWN0aXZlQnVsbGV0IGluc3RhbmNlIHRoYXQgY29sbGlkZWQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgb25CdWxsZXRDb2xsaWRlKGV2ZW50OiBDb2xsaWRlRXZlbnQsIGJ1bGxldDogQWN0aXZlQnVsbGV0KSB7XHJcbiAgICAgICAgLy8gSWYgdGhlIGJ1bGxldCBoYXMgYWxyZWFkeSBiZWVuIHJlbW92ZWQgb3IgbWFya2VkIGZvciByZW1vdmFsLCBkbyBub3RoaW5nLlxyXG4gICAgICAgIGlmICghdGhpcy5idWxsZXRzLmluY2x1ZGVzKGJ1bGxldCkgfHwgYnVsbGV0LnNob3VsZFJlbW92ZSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBjb2xsaWRlZEJvZHkgPSBldmVudC5ib2R5OyAvLyBUaGUgYm9keSB0aGF0IHRoZSBidWxsZXQgKGV2ZW50LnRhcmdldCkgY29sbGlkZWQgd2l0aFxyXG4gICAgICAgIGNvbnN0IG90aGVyQm9keVVzZXJEYXRhID0gY29sbGlkZWRCb2R5LnVzZXJEYXRhOyAvLyBSZXRyaWV2ZSB1c2VyRGF0YSBmb3IgdGhlIGNvbGxpZGVkIGJvZHlcclxuXHJcbiAgICAgICAgY29uc3QgaXNHcm91bmQgPSBjb2xsaWRlZEJvZHkgPT09IHRoaXMuZ3JvdW5kQm9keTtcclxuICAgICAgICBjb25zdCBpc1BsYWNlZE9iamVjdCA9IHRoaXMucGxhY2VkT2JqZWN0Qm9kaWVzLmluY2x1ZGVzKGNvbGxpZGVkQm9keSk7IC8vIFN0YXRpYyBib3hlc1xyXG5cclxuICAgICAgICAvLyBORVc6IENoZWNrIGlmIGNvbGxpZGVkIGJvZHkgaXMgYW4gZW5lbXkgYnkgY2hlY2tpbmcgaXRzIHVzZXJEYXRhIGFuZCB0eXBlQ29uZmlnXHJcbiAgICAgICAgY29uc3QgaXNFbmVteSA9IG90aGVyQm9keVVzZXJEYXRhICYmIChvdGhlckJvZHlVc2VyRGF0YSBhcyBBY3RpdmVFbmVteSkudHlwZUNvbmZpZyAhPT0gdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICBpZiAoaXNHcm91bmQgfHwgaXNQbGFjZWRPYmplY3QpIHtcclxuICAgICAgICAgICAgLy8gTWFyayBidWxsZXQgZm9yIHJlbW92YWwgaW5zdGVhZCBvZiByZW1vdmluZyBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRzVG9SZW1vdmUuYWRkKGJ1bGxldCk7XHJcbiAgICAgICAgfSBlbHNlIGlmIChpc0VuZW15KSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15ID0gb3RoZXJCb2R5VXNlckRhdGEgYXMgQWN0aXZlRW5lbXk7XHJcbiAgICAgICAgICAgIGlmICghZW5lbXkuc2hvdWxkUmVtb3ZlKSB7IC8vIERvbid0IHByb2Nlc3MgaGl0cyBvbiBlbmVtaWVzIGFscmVhZHkgbWFya2VkIGZvciByZW1vdmFsXHJcbiAgICAgICAgICAgICAgICBlbmVteS5jdXJyZW50SGVhbHRoLS07XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNvdW5kcy5nZXQoJ2hpdF9zb3VuZCcpPy5wbGF5KCkuY2F0Y2goZSA9PiBjb25zb2xlLmxvZyhcIkhpdCBzb3VuZCBwbGF5IGRlbmllZDpcIiwgZSkpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYEVuZW15ICR7ZW5lbXkubmFtZX0gaGl0ISBIZWFsdGg6ICR7ZW5lbXkuY3VycmVudEhlYWx0aH1gKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoZW5lbXkuY3VycmVudEhlYWx0aCA8PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZW5lbXkuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXNUb1JlbW92ZS5hZGQoZW5lbXkpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2NvcmUgKz0gZW5lbXkudHlwZUNvbmZpZy5zY29yZVZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlU2NvcmVEaXNwbGF5KCk7IC8vIFVwZGF0ZSBzY29yZSBVSVxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc291bmRzLmdldCgnZW5lbXlfZGVhdGhfc291bmQnKT8ucGxheSgpLmNhdGNoKGUgPT4gY29uc29sZS5sb2coXCJFbmVteSBkZWF0aCBzb3VuZCBwbGF5IGRlbmllZDpcIiwgZSkpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBFbmVteSAke2VuZW15Lm5hbWV9IGRlZmVhdGVkISBTY29yZTogJHt0aGlzLnNjb3JlfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIE1PRElGSUNBVElPTjogRGVhY3RpdmF0ZSBlbmVteSBwaHlzaWNzIGJvZHkgaW1tZWRpYXRlbHkgdXBvbiBkZWF0aFxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgcHJldmVudHMgZnVydGhlciBwaHlzaWNzIGludGVyYWN0aW9ucyAobGlrZSBwbGF5ZXItZW5lbXkgY29udGFjdClcclxuICAgICAgICAgICAgICAgICAgICAvLyBmb3IgYSBib2R5IHRoYXQgaXMgYWJvdXQgdG8gYmUgcmVtb3ZlZCwgcmVkdWNpbmcgcG90ZW50aWFsIHJ1bnRpbWUgZXJyb3JzLlxyXG4gICAgICAgICAgICAgICAgICAgIGVuZW15LmJvZHkuc2xlZXAoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBCdWxsZXQgYWx3YXlzIGRpc2FwcGVhcnMgb24gaGl0dGluZyBhbiBlbmVteVxyXG4gICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgdGhpcy5idWxsZXRzVG9SZW1vdmUuYWRkKGJ1bGxldCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBJdGVyYXRlcyB0aHJvdWdoIGJ1bGxldHMgdG8gbWFyayB0aGVtIGZvciByZW1vdmFsIGJhc2VkIG9uIGxpZmV0aW1lLCByYW5nZSwgb3Igb3V0LW9mLWJvdW5kcy5cclxuICAgICAqIEFjdHVhbCByZW1vdmFsIGlzIGRlZmVycmVkIHRvIGBwZXJmb3JtQnVsbGV0UmVtb3ZhbHNgLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHVwZGF0ZUJ1bGxldHMoZGVsdGFUaW1lOiBudW1iZXIpIHtcclxuICAgICAgICBjb25zdCBjdXJyZW50VGltZSA9IHRoaXMubGFzdFRpbWUgLyAxMDAwOyAvLyBDdXJyZW50IHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIGNvbnN0IGhhbGZHcm91bmRTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyAyO1xyXG4gICAgICAgIGNvbnN0IGJ1bGxldENvbmZpZyA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5idWxsZXQ7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5idWxsZXRzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJ1bGxldCA9IHRoaXMuYnVsbGV0c1tpXTtcclxuXHJcbiAgICAgICAgICAgIC8vIElmIGFscmVhZHkgbWFya2VkIGZvciByZW1vdmFsIGJ5IGNvbGxpc2lvbiBvciBwcmV2aW91cyBjaGVjaywgc2tpcCBmdXJ0aGVyIHByb2Nlc3NpbmcgZm9yIHRoaXMgYnVsbGV0IHRoaXMgZnJhbWUuXHJcbiAgICAgICAgICAgIGlmIChidWxsZXQuc2hvdWxkUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgbGlmZXRpbWVcclxuICAgICAgICAgICAgaWYgKGN1cnJlbnRUaW1lIC0gYnVsbGV0LmNyZWF0aW9uVGltZSA+IGJ1bGxldENvbmZpZy5saWZldGltZSkge1xyXG4gICAgICAgICAgICAgICAgYnVsbGV0LnNob3VsZFJlbW92ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5hZGQoYnVsbGV0KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBvdXRzaWRlIG1hcCBib3VuZGFyaWVzIG9yIGlmIGl0IHdlbnQgdG9vIGZhciBmcm9tIGl0cyBmaXJpbmcgcG9pbnRcclxuICAgICAgICAgICAgY29uc3QgYnVsbGV0UG9zID0gYnVsbGV0LmJvZHkucG9zaXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlVG9GaXJlUG9pbnQgPSBidWxsZXRQb3MuZGlzdGFuY2VUbyhidWxsZXQuZmlyZVBvc2l0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy54ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnggPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy56ID4gaGFsZkdyb3VuZFNpemUgfHwgYnVsbGV0UG9zLnogPCAtaGFsZkdyb3VuZFNpemUgfHxcclxuICAgICAgICAgICAgICAgIGRpc3RhbmNlVG9GaXJlUG9pbnQgPiBidWxsZXRDb25maWcubWF4UmFuZ2UgfHxcclxuICAgICAgICAgICAgICAgIGJ1bGxldFBvcy55IDwgLTEwIC8vIElmIGl0IGZhbGxzIHZlcnkgZmFyIGJlbG93IHRoZSBncm91bmRcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQuc2hvdWxkUmVtb3ZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYnVsbGV0c1RvUmVtb3ZlLmFkZChidWxsZXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBQZXJmb3JtcyB0aGUgYWN0dWFsIHJlbW92YWwgb2YgYnVsbGV0cyBtYXJrZWQgZm9yIHJlbW92YWwuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYWZ0ZXIgdGhlIHBoeXNpY3Mgc3RlcCB0byBhdm9pZCBtb2RpZnlpbmcgdGhlIHdvcmxkIGR1cmluZyBwaHlzaWNzIGNhbGN1bGF0aW9ucy5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwZXJmb3JtQnVsbGV0UmVtb3ZhbHMoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCBidWxsZXRUb1JlbW92ZSBvZiB0aGlzLmJ1bGxldHNUb1JlbW92ZSkge1xyXG4gICAgICAgICAgICAvLyBSZW1vdmUgZnJvbSBUaHJlZS5qcyBzY2VuZVxyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShidWxsZXRUb1JlbW92ZS5tZXNoKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIENhbm5vbi5qcyB3b3JsZFxyXG4gICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYnVsbGV0VG9SZW1vdmUuYm9keSk7XHJcblxyXG4gICAgICAgICAgICAvLyBSZW1vdmUgZXZlbnQgbGlzdGVuZXJcclxuICAgICAgICAgICAgaWYgKGJ1bGxldFRvUmVtb3ZlLmNvbGxpZGVIYW5kbGVyKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXRUb1JlbW92ZS5ib2R5LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NvbGxpZGUnLCBidWxsZXRUb1JlbW92ZS5jb2xsaWRlSGFuZGxlcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFJlbW92ZSBmcm9tIHRoZSBhY3RpdmUgYnVsbGV0cyBhcnJheVxyXG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuYnVsbGV0cy5pbmRleE9mKGJ1bGxldFRvUmVtb3ZlKTtcclxuICAgICAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5idWxsZXRzLnNwbGljZShpbmRleCwgMSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gQ2xlYXIgdGhlIHNldCBmb3IgdGhlIG5leHQgZnJhbWVcclxuICAgICAgICB0aGlzLmJ1bGxldHNUb1JlbW92ZS5jbGVhcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBVcGRhdGVzIGVuZW15IG1vdmVtZW50IGxvZ2ljIChjYWxjdWxhdGVzIHZlbG9jaXR5IGFuZCByb3RhdGlvbikuXHJcbiAgICAgKiBUaGUgYWN0dWFsIG1lc2ggc3luY2hyb25pemF0aW9uIGhhcHBlbnMgaW4gc3luY01lc2hlc1dpdGhCb2RpZXMuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlRW5lbWllcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIGlmICghdGhpcy5wbGF5ZXJCb2R5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IHBsYXllclBvcyA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbjtcclxuICAgICAgICBjb25zdCBoYWxmR3JvdW5kU2l6ZSA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5ncm91bmRTaXplIC8gMjtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBlbmVteSBvZiB0aGlzLmVuZW1pZXMpIHtcclxuICAgICAgICAgICAgaWYgKGVuZW15LnNob3VsZFJlbW92ZSkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGVuZW15UG9zID0gZW5lbXkuYm9keS5wb3NpdGlvbjtcclxuXHJcbiAgICAgICAgICAgIC8vIENsYW1wIGVuZW15IHBvc2l0aW9uIHdpdGhpbiBncm91bmQgYm91bmRhcmllcyAqYmVmb3JlKiBtb3ZlbWVudCB0byBhdm9pZCBnZXR0aW5nIHN0dWNrIG91dHNpZGVcclxuICAgICAgICAgICAgLy8gVGhpcyBwcmV2ZW50cyBlbmVtaWVzIGZyb20gd2FuZGVyaW5nIG9mZiB0aGUgbWFwIG9yIGJlaW5nIHB1c2hlZCB0b28gZmFyLlxyXG4gICAgICAgICAgICBjb25zdCBoYWxmV2lkdGggPSBlbmVteS50eXBlQ29uZmlnLmRpbWVuc2lvbnMud2lkdGggLyAyO1xyXG4gICAgICAgICAgICBjb25zdCBoYWxmRGVwdGggPSBlbmVteS50eXBlQ29uZmlnLmRpbWVuc2lvbnMuZGVwdGggLyAyO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGVuZW15UG9zLnggPiBoYWxmR3JvdW5kU2l6ZSAtIGhhbGZXaWR0aCkgeyBlbmVteS5ib2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZSAtIGhhbGZXaWR0aDsgaWYgKGVuZW15LmJvZHkudmVsb2NpdHkueCA+IDApIGVuZW15LmJvZHkudmVsb2NpdHkueCA9IDA7IH1cclxuICAgICAgICAgICAgZWxzZSBpZiAoZW5lbXlQb3MueCA8IC1oYWxmR3JvdW5kU2l6ZSArIGhhbGZXaWR0aCkgeyBlbmVteS5ib2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemUgKyBoYWxmV2lkdGg7IGlmIChlbmVteS5ib2R5LnZlbG9jaXR5LnggPCAwKSBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSAwOyB9XHJcblxyXG4gICAgICAgICAgICBpZiAoZW5lbXlQb3MueiA+IGhhbGZHcm91bmRTaXplIC0gaGFsZkRlcHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueiA9IGhhbGZHcm91bmRTaXplIC0gaGFsZkRlcHRoOyBpZiAoZW5lbXkuYm9keS52ZWxvY2l0eS56ID4gMCkgZW5lbXkuYm9keS52ZWxvY2l0eS56ID0gMDsgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChlbmVteVBvcy56IDwgLWhhbGZHcm91bmRTaXplICsgaGFsZkRlcHRoKSB7IGVuZW15LmJvZHkucG9zaXRpb24ueiA9IC1oYWxmR3JvdW5kU2l6ZSArIGhhbGZEZXB0aDsgaWYgKGVuZW15LmJvZHkudmVsb2NpdHkueiA8IDApIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IDA7IH1cclxuXHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBkaXJlY3Rpb24gdG93YXJkcyBwbGF5ZXIgKGZsYXR0ZW5lZCB0byBYWiBwbGFuZSlcclxuICAgICAgICAgICAgY29uc3QgZGlyZWN0aW9uID0gbmV3IENBTk5PTi5WZWMzKCk7XHJcbiAgICAgICAgICAgIHBsYXllclBvcy52c3ViKGVuZW15UG9zLCBkaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBkaXJlY3Rpb24ueSA9IDA7IC8vIE9ubHkgY29uc2lkZXIgaG9yaXpvbnRhbCBtb3ZlbWVudFxyXG4gICAgICAgICAgICBkaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgZW5lbXkgdmVsb2NpdHkgYmFzZWQgb24gZGlyZWN0aW9uIGFuZCBzcGVlZFxyXG4gICAgICAgICAgICBlbmVteS5ib2R5LnZlbG9jaXR5LnggPSBkaXJlY3Rpb24ueCAqIGVuZW15LnR5cGVDb25maWcuc3BlZWQ7XHJcbiAgICAgICAgICAgIGVuZW15LmJvZHkudmVsb2NpdHkueiA9IGRpcmVjdGlvbi56ICogZW5lbXkudHlwZUNvbmZpZy5zcGVlZDtcclxuICAgICAgICAgICAgLy8gZW5lbXkuYm9keS52ZWxvY2l0eS55IGlzIG1hbmFnZWQgYnkgZ3Jhdml0eSwgc28gd2UgZG9uJ3QgbW9kaWZ5IGl0IGhlcmUuXHJcblxyXG4gICAgICAgICAgICAvLyBNYWtlIGVuZW15IGxvb2sgYXQgdGhlIHBsYXllciAoeWF3IG9ubHkpXHJcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFJvdGF0aW9uWSA9IE1hdGguYXRhbjIoZGlyZWN0aW9uLngsIGRpcmVjdGlvbi56KTsgLy8gQW5nbGUgaW4gcmFkaWFuc1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50UXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKGVuZW15LmJvZHkucXVhdGVybmlvbi54LCBlbmVteS5ib2R5LnF1YXRlcm5pb24ueSwgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLnosIGVuZW15LmJvZHkucXVhdGVybmlvbi53KTtcclxuICAgICAgICAgICAgY29uc3QgdGFyZ2V0UXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCkuc2V0RnJvbUF4aXNBbmdsZShcclxuICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApLFxyXG4gICAgICAgICAgICAgICAgdGFyZ2V0Um90YXRpb25ZXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIC8vIFNtb290aCByb3RhdGlvbiBmb3IgcGh5c2ljcyBib2R5XHJcbiAgICAgICAgICAgIGNvbnN0IHNsZXJwZWRRdWF0ZXJuaW9uID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKTtcclxuICAgICAgICAgICAgc2xlcnBlZFF1YXRlcm5pb24uc2xlcnBRdWF0ZXJuaW9ucyhjdXJyZW50UXVhdGVybmlvbiwgdGFyZ2V0UXVhdGVybmlvbiwgMC4xKTsgLy8gU21vb3RoIGZhY3RvciAwLjFcclxuICAgICAgICAgICAgZW5lbXkuYm9keS5xdWF0ZXJuaW9uLmNvcHkoc2xlcnBlZFF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBDQU5OT04uUXVhdGVybmlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogTkVXOiBQZXJmb3JtcyB0aGUgYWN0dWFsIHJlbW92YWwgb2YgZW5lbWllcyBtYXJrZWQgZm9yIHJlbW92YWwuXHJcbiAgICAgKiBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgYWZ0ZXIgdGhlIHBoeXNpY3Mgc3RlcC5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBwZXJmb3JtRW5lbXlSZW1vdmFscygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IGVuZW15VG9SZW1vdmUgb2YgdGhpcy5lbmVtaWVzVG9SZW1vdmUpIHtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUoZW5lbXlUb1JlbW92ZS5tZXNoKTtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGVuZW15VG9SZW1vdmUuYm9keSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBpbmRleCA9IHRoaXMuZW5lbWllcy5pbmRleE9mKGVuZW15VG9SZW1vdmUpO1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmVuZW1pZXMuc3BsaWNlKGluZGV4LCAxKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmVuZW1pZXNUb1JlbW92ZS5jbGVhcigpO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBvaW50ZXIgbG9jayBzdGF0dXMgd2hlbiBpdCBjaGFuZ2VzIChlLmcuLCB1c2VyIHByZXNzZXMgRXNjKS5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSBvblBvaW50ZXJMb2NrQ2hhbmdlKCkge1xyXG4gICAgICAgIGlmIChkb2N1bWVudC5wb2ludGVyTG9ja0VsZW1lbnQgPT09IHRoaXMuY2FudmFzIHx8XHJcbiAgICAgICAgICAgIChkb2N1bWVudCBhcyBhbnkpLm1velBvaW50ZXJMb2NrRWxlbWVudCA9PT0gdGhpcy5jYW52YXMgfHxcclxuICAgICAgICAgICAgKGRvY3VtZW50IGFzIGFueSkud2Via2l0UG9pbnRlckxvY2tFbGVtZW50ID09PSB0aGlzLmNhbnZhcykge1xyXG4gICAgICAgICAgICB0aGlzLmlzUG9pbnRlckxvY2tlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdQb2ludGVyIGxvY2tlZCcpO1xyXG4gICAgICAgICAgICAvLyBTaG93IGNyb3NzaGFpciBvbmx5IGlmIGdhbWUgaXMgcGxheWluZyBBTkQgcG9pbnRlciBpcyBsb2NrZWRcclxuICAgICAgICAgICAgaWYgKHRoaXMuY3Jvc3NoYWlyRWxlbWVudCAmJiB0aGlzLnN0YXRlID09PSBHYW1lU3RhdGUuUExBWUlORykge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jcm9zc2hhaXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5pc1BvaW50ZXJMb2NrZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1BvaW50ZXIgdW5sb2NrZWQnKTtcclxuICAgICAgICAgICAgLy8gSGlkZSBjcm9zc2hhaXIgd2hlbiBwb2ludGVyIGlzIHVubG9ja2VkXHJcbiAgICAgICAgICAgIGlmICh0aGlzLmNyb3NzaGFpckVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuY3Jvc3NoYWlyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogVGhlIG1haW4gZ2FtZSBsb29wLCBjYWxsZWQgb24gZXZlcnkgYW5pbWF0aW9uIGZyYW1lLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFuaW1hdGUodGltZTogRE9NSGlnaFJlc1RpbWVTdGFtcCkge1xyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGUuYmluZCh0aGlzKSk7IC8vIFJlcXVlc3QgbmV4dCBmcmFtZVxyXG5cclxuICAgICAgICBjb25zdCBkZWx0YVRpbWUgPSAodGltZSAtIHRoaXMubGFzdFRpbWUpIC8gMTAwMDsgLy8gQ2FsY3VsYXRlIGRlbHRhIHRpbWUgaW4gc2Vjb25kc1xyXG4gICAgICAgIHRoaXMubGFzdFRpbWUgPSB0aW1lO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gR2FtZVN0YXRlLlBMQVlJTkcpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVQbGF5ZXJNb3ZlbWVudCgpOyAvLyBVcGRhdGUgcGxheWVyJ3MgdmVsb2NpdHkgYmFzZWQgb24gaW5wdXRcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVCdWxsZXRzKGRlbHRhVGltZSk7IC8vIE5FVzogTWFyayBidWxsZXRzIGZvciByZW1vdmFsXHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRW5lbWllcyhkZWx0YVRpbWUpOyAvLyBORVc6IFVwZGF0ZSBlbmVteSBtb3ZlbWVudFxyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVBoeXNpY3MoZGVsdGFUaW1lKTsgLy8gU3RlcCB0aGUgcGh5c2ljcyB3b3JsZFxyXG4gICAgICAgICAgICB0aGlzLnBlcmZvcm1CdWxsZXRSZW1vdmFscygpOyAvLyBORVc6IFBlcmZvcm0gYWN0dWFsIGJ1bGxldCByZW1vdmFscyAqYWZ0ZXIqIHBoeXNpY3Mgc3RlcFxyXG4gICAgICAgICAgICB0aGlzLnBlcmZvcm1FbmVteVJlbW92YWxzKCk7IC8vIE5FVzogUGVyZm9ybSBhY3R1YWwgZW5lbXkgcmVtb3ZhbHMgKmFmdGVyKiBwaHlzaWNzIHN0ZXBcclxuICAgICAgICAgICAgdGhpcy5jbGFtcFBsYXllclBvc2l0aW9uKCk7IC8vIENsYW1wIHBsYXllciBwb3NpdGlvbiB0byBwcmV2ZW50IGdvaW5nIGJleW9uZCBncm91bmQgZWRnZXNcclxuICAgICAgICAgICAgdGhpcy5zeW5jTWVzaGVzV2l0aEJvZGllcygpOyAvLyBTeW5jaHJvbml6ZSB2aXN1YWwgbWVzaGVzIHdpdGggcGh5c2ljcyBib2RpZXNcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTsgLy8gUmVuZGVyIHRoZSBzY2VuZVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogU3RlcHMgdGhlIENhbm5vbi5qcyBwaHlzaWNzIHdvcmxkIGZvcndhcmQuXHJcbiAgICAgKi9cclxuICAgIHByaXZhdGUgdXBkYXRlUGh5c2ljcyhkZWx0YVRpbWU6IG51bWJlcikge1xyXG4gICAgICAgIC8vIHdvcmxkLnN0ZXAoZml4ZWRUaW1lU3RlcCwgZGVsdGFUaW1lLCBtYXhTdWJTdGVwcylcclxuICAgICAgICAvLyAxLzYwOiBBIGZpeGVkIHRpbWUgc3RlcCBvZiA2MCBwaHlzaWNzIHVwZGF0ZXMgcGVyIHNlY29uZCAoc3RhbmRhcmQpLlxyXG4gICAgICAgIC8vIGRlbHRhVGltZTogVGhlIGFjdHVhbCB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgcmVuZGVyIGZyYW1lLlxyXG4gICAgICAgIC8vIG1heFBoeXNpY3NTdWJTdGVwczogTGltaXRzIHRoZSBudW1iZXIgb2YgcGh5c2ljcyBzdGVwcyBpbiBvbmUgcmVuZGVyIGZyYW1lXHJcbiAgICAgICAgLy8gdG8gcHJldmVudCBpbnN0YWJpbGl0aWVzIGlmIHJlbmRlcmluZyBzbG93cyBkb3duIHNpZ25pZmljYW50bHkuXHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEgLyA2MCwgZGVsdGFUaW1lLCB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MubWF4UGh5c2ljc1N1YlN0ZXBzKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFVwZGF0ZXMgdGhlIHBsYXllcidzIHZlbG9jaXR5IGJhc2VkIG9uIFdBU0QgaW5wdXQgYW5kIGNhbWVyYSBvcmllbnRhdGlvbi5cclxuICAgICAqL1xyXG4gICAgcHJpdmF0ZSB1cGRhdGVQbGF5ZXJNb3ZlbWVudCgpIHtcclxuICAgICAgICAvLyBQbGF5ZXIgbW92ZW1lbnQgc2hvdWxkIG9ubHkgaGFwcGVuIHdoZW4gdGhlIHBvaW50ZXIgaXMgbG9ja2VkXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUG9pbnRlckxvY2tlZCkge1xyXG4gICAgICAgICAgICAvLyBJZiBwb2ludGVyIGlzIG5vdCBsb2NrZWQsIHN0b3AgaG9yaXpvbnRhbCBtb3ZlbWVudCBpbW1lZGlhdGVseVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgcmV0dXJuOyAvLyBFeGl0IGVhcmx5IGFzIG5vIG1vdmVtZW50IGlucHV0IHNob3VsZCBiZSBwcm9jZXNzZWRcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxldCBlZmZlY3RpdmVQbGF5ZXJTcGVlZCA9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJTcGVlZDtcclxuXHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IEFwcGx5IGFpciBjb250cm9sIGZhY3RvciBpZiBwbGF5ZXIgaXMgaW4gdGhlIGFpciAobm8gY29udGFjdHMgd2l0aCBhbnkgc3RhdGljIHN1cmZhY2UpXHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgZWZmZWN0aXZlUGxheWVyU3BlZWQgKj0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLnBsYXllckFpckNvbnRyb2xGYWN0b3I7IC8vIFVzZSBjb25maWd1cmFibGUgYWlyIGNvbnRyb2wgZmFjdG9yXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRZVmVsb2NpdHkgPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueTsgLy8gUHJlc2VydmUgdmVydGljYWwgdmVsb2NpdHlcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtb3ZlRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMCwgMCk7IC8vIFVzZSBhIFRIUkVFLlZlY3RvcjMgZm9yIGNhbGN1bGF0aW9uIGVhc2VcclxuXHJcbiAgICAgICAgLy8gR2V0IGNhbWVyYUNvbnRhaW5lcidzIGZvcndhcmQgdmVjdG9yIChob3Jpem9udGFsIGRpcmVjdGlvbiBwbGF5ZXIgaXMgbG9va2luZylcclxuICAgICAgICBjb25zdCBjYW1lcmFEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLmdldFdvcmxkRGlyZWN0aW9uKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgY2FtZXJhRGlyZWN0aW9uLnkgPSAwOyAvLyBGbGF0dGVuIHRoZSB2ZWN0b3IgdG8gcmVzdHJpY3QgbW92ZW1lbnQgdG8gdGhlIGhvcml6b250YWwgcGxhbmVcclxuICAgICAgICBjYW1lcmFEaXJlY3Rpb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGdsb2JhbFVwID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCk7IC8vIERlZmluZSBnbG9iYWwgdXAgdmVjdG9yIGZvciBjcm9zcyBwcm9kdWN0XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgJ3JpZ2h0JyB2ZWN0b3IgcmVsYXRpdmUgdG8gY2FtZXJhJ3MgZm9yd2FyZCBkaXJlY3Rpb25cclxuICAgICAgICBjb25zdCBjYW1lcmFSaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcbiAgICAgICAgY2FtZXJhUmlnaHQuY3Jvc3NWZWN0b3JzKGdsb2JhbFVwLCBjYW1lcmFEaXJlY3Rpb24pLm5vcm1hbGl6ZSgpOyBcclxuXHJcbiAgICAgICAgbGV0IG1vdmluZyA9IGZhbHNlO1xyXG4gICAgICAgIC8vIFcgPC0+IFMgc3dhcCBmcm9tIHVzZXIncyBjb21tZW50cyBpbiBvcmlnaW5hbCBjb2RlOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3MnXSkgeyAvLyAncycga2V5IG5vdyBtb3ZlcyBmb3J3YXJkXHJcbiAgICAgICAgICAgIG1vdmVEaXJlY3Rpb24uYWRkKGNhbWVyYURpcmVjdGlvbik7XHJcbiAgICAgICAgICAgIG1vdmluZyA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ3cnXSkgeyAvLyAndycga2V5IG5vdyBtb3ZlcyBiYWNrd2FyZFxyXG4gICAgICAgICAgICBtb3ZlRGlyZWN0aW9uLnN1YihjYW1lcmFEaXJlY3Rpb24pO1xyXG4gICAgICAgICAgICBtb3ZpbmcgPSB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBBIGFuZCBEIGNvbnRyb2xzIGFzIHN0YW5kYXJkOlxyXG4gICAgICAgIGlmICh0aGlzLmtleXNbJ2EnXSkgeyAvLyAnYScga2V5IG5vdyBzdHJhZmVzIGxlZnRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5zdWIoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMua2V5c1snZCddKSB7IC8vICdkJyBrZXkgbm93IHN0cmFmZXMgcmlnaHRcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5hZGQoY2FtZXJhUmlnaHQpOyBcclxuICAgICAgICAgICAgbW92aW5nID0gdHJ1ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChtb3ZpbmcpIHtcclxuICAgICAgICAgICAgbW92ZURpcmVjdGlvbi5ub3JtYWxpemUoKS5tdWx0aXBseVNjYWxhcihlZmZlY3RpdmVQbGF5ZXJTcGVlZCk7XHJcbiAgICAgICAgICAgIC8vIERpcmVjdGx5IHNldCB0aGUgaG9yaXpvbnRhbCB2ZWxvY2l0eSBjb21wb25lbnRzLlxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IG1vdmVEaXJlY3Rpb24ueDtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnogPSBtb3ZlRGlyZWN0aW9uLno7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgLy8gSWYgbm8gbW92ZW1lbnQga2V5cyBhcmUgcHJlc3NlZDpcclxuICAgICAgICAgICAgLy8gTU9ESUZJRUQ6IEFwcGx5IGFpciBkZWNlbGVyYXRpb24gaWYgcGxheWVyIGlzIGluIHRoZSBhaXJcclxuICAgICAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS54ICo9IHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5wbGF5ZXJBaXJEZWNlbGVyYXRpb247XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiAqPSB0aGlzLmNvbmZpZy5nYW1lU2V0dGluZ3MucGxheWVyQWlyRGVjZWxlcmF0aW9uO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgLy8gUGxheWVyIGlzIG9uIHRoZSBncm91bmQgb3IgYSBzdGF0aWMgb2JqZWN0OiBDYW5ub24uanMgQ29udGFjdE1hdGVyaWFsIGZyaWN0aW9uIHdpbGwgaGFuZGxlIGRlY2VsZXJhdGlvbi5cclxuICAgICAgICAgICAgICAgIC8vIE5vIGV4cGxpY2l0IHZlbG9jaXR5IGRlY2F5IGlzIGFwcGxpZWQgaGVyZSBmb3IgZ3JvdW5kIG1vdmVtZW50LlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gY3VycmVudFlWZWxvY2l0eTsgLy8gUmVzdG9yZSBZIHZlbG9jaXR5IChncmF2aXR5L2p1bXBzKVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQURERUQ6IEFwcGxpZXMgYW4gdXB3YXJkIGltcHVsc2UgdG8gdGhlIHBsYXllciBib2R5IGZvciBqdW1waW5nLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHBsYXllckp1bXAoKSB7XHJcbiAgICAgICAgLy8gTU9ESUZJRUQ6IE9ubHkgYWxsb3cganVtcCBpZiB0aGUgcGxheWVyIGlzIGN1cnJlbnRseSBvbiBhbnkgc3RhdGljIHN1cmZhY2UgKGdyb3VuZCBvciBvYmplY3QpXHJcbiAgICAgICAgaWYgKHRoaXMubnVtQ29udGFjdHNXaXRoU3RhdGljU3VyZmFjZXMgPiAwKSB7XHJcbiAgICAgICAgICAgIC8vIENsZWFyIGFueSBleGlzdGluZyB2ZXJ0aWNhbCB2ZWxvY2l0eSB0byBlbnN1cmUgYSBjb25zaXN0ZW50IGp1bXAgaGVpZ2h0XHJcbiAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS55ID0gMDsgXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IGFuIHVwd2FyZCBpbXB1bHNlIChtYXNzICogY2hhbmdlX2luX3ZlbG9jaXR5KVxyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkuYXBwbHlJbXB1bHNlKFxyXG4gICAgICAgICAgICAgICAgbmV3IENBTk5PTi5WZWMzKDAsIHRoaXMuY29uZmlnLmdhbWVTZXR0aW5ncy5qdW1wRm9yY2UsIDApLFxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIC8vIEFwcGx5IGltcHVsc2UgYXQgdGhlIGNlbnRlciBvZiBtYXNzXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogQ2xhbXBzIHRoZSBwbGF5ZXIncyBwb3NpdGlvbiB3aXRoaW4gdGhlIGRlZmluZWQgZ3JvdW5kIGJvdW5kYXJpZXMuXHJcbiAgICAgKiBQcmV2ZW50cyB0aGUgcGxheWVyIGZyb20gbW92aW5nIGJleW9uZCB0aGUgJ2VuZCBvZiB0aGUgd29ybGQnLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGNsYW1wUGxheWVyUG9zaXRpb24oKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnBsYXllckJvZHkgfHwgIXRoaXMuY29uZmlnKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGhhbGZHcm91bmRTaXplID0gdGhpcy5jb25maWcuZ2FtZVNldHRpbmdzLmdyb3VuZFNpemUgLyAyO1xyXG4gICAgICAgIGNvbnN0IHBsYXllckhhbGZXaWR0aCA9IDAuNTsgLy8gRnJvbSBCb3hHZW9tZXRyeSgxLDIsMSkgaGFsZiBleHRlbnRzIGZvciBDYW5ub24uanNcclxuXHJcbiAgICAgICAgbGV0IHBvc1ggPSB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueDtcclxuICAgICAgICBsZXQgcG9zWiA9IHRoaXMucGxheWVyQm9keS5wb3NpdGlvbi56O1xyXG4gICAgICAgIGxldCB2ZWxYID0gdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5Lng7XHJcbiAgICAgICAgbGV0IHZlbFogPSB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkuejtcclxuXHJcbiAgICAgICAgLy8gQ2xhbXAgWCBwb3NpdGlvblxyXG4gICAgICAgIGlmIChwb3NYID4gaGFsZkdyb3VuZFNpemUgLSBwbGF5ZXJIYWxmV2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSBoYWxmR3JvdW5kU2l6ZSAtIHBsYXllckhhbGZXaWR0aDtcclxuICAgICAgICAgICAgaWYgKHZlbFggPiAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueCA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2UgaWYgKHBvc1ggPCAtaGFsZkdyb3VuZFNpemUgKyBwbGF5ZXJIYWxmV2lkdGgpIHtcclxuICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uLnggPSAtaGFsZkdyb3VuZFNpemUgKyBwbGF5ZXJIYWxmV2lkdGg7XHJcbiAgICAgICAgICAgIGlmICh2ZWxYIDwgMCkgeyAvLyBJZiBtb3Zpbmcgb3V0d2FyZHMsIHN0b3AgaG9yaXpvbnRhbCB2ZWxvY2l0eVxyXG4gICAgICAgICAgICAgICAgdGhpcy5wbGF5ZXJCb2R5LnZlbG9jaXR5LnggPSAwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBDbGFtcCBaIHBvc2l0aW9uXHJcbiAgICAgICAgaWYgKHBvc1ogPiBoYWxmR3JvdW5kU2l6ZSAtIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IGhhbGZHcm91bmRTaXplIC0gcGxheWVySGFsZldpZHRoO1xyXG4gICAgICAgICAgICBpZiAodmVsWiA+IDApIHsgLy8gSWYgbW92aW5nIG91dHdhcmRzLCBzdG9wIGhvcml6b250YWwgdmVsb2NpdHlcclxuICAgICAgICAgICAgICAgIHRoaXMucGxheWVyQm9keS52ZWxvY2l0eS56ID0gMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAocG9zWiA8IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnBsYXllckJvZHkucG9zaXRpb24ueiA9IC1oYWxmR3JvdW5kU2l6ZSArIHBsYXllckhhbGZXaWR0aDtcclxuICAgICAgICAgICAgaWYgKHZlbFogPCAwKSB7IC8vIElmIG1vdmluZyBvdXR3YXJkcywgc3RvcCBob3Jpem9udGFsIHZlbG9jaXR5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBsYXllckJvZHkudmVsb2NpdHkueiA9IDA7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTeW5jaHJvbml6ZXMgdGhlIHZpc3VhbCBtZXNoZXMgd2l0aCB0aGVpciBjb3JyZXNwb25kaW5nIHBoeXNpY3MgYm9kaWVzLlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIHN5bmNNZXNoZXNXaXRoQm9kaWVzKCkge1xyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIHBvc2l0aW9uIHdpdGggaXRzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3luY2hyb25pemUgY2FtZXJhQ29udGFpbmVyIHBvc2l0aW9uIHdpdGggdGhlIHBsYXllcidzIHBoeXNpY3MgYm9keSdzIHBvc2l0aW9uLlxyXG4gICAgICAgIHRoaXMuY2FtZXJhQ29udGFpbmVyLnBvc2l0aW9uLmNvcHkodGhpcy5wbGF5ZXJCb2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcblxyXG4gICAgICAgIC8vIFN5bmNocm9uaXplIHBsYXllcidzIHZpc3VhbCBtZXNoIGhvcml6b250YWwgcm90YXRpb24gKHlhdykgd2l0aCBjYW1lcmFDb250YWluZXIncyB5YXcuXHJcbiAgICAgICAgdGhpcy5wbGF5ZXJNZXNoLnF1YXRlcm5pb24uY29weSh0aGlzLmNhbWVyYUNvbnRhaW5lci5xdWF0ZXJuaW9uKTtcclxuXHJcbiAgICAgICAgLy8gVGhlIGdyb3VuZCBhbmQgcGxhY2VkIG9iamVjdHMgYXJlIGN1cnJlbnRseSBzdGF0aWMgKG1hc3MgMCksIHNvIHRoZWlyIHZpc3VhbCBtZXNoZXNcclxuICAgICAgICAvLyBkbyBub3QgbmVlZCB0byBiZSBzeW5jaHJvbml6ZWQgd2l0aCB0aGVpciBwaHlzaWNzIGJvZGllcyBhZnRlciBpbml0aWFsIHBsYWNlbWVudC5cclxuICAgICAgICBcclxuICAgICAgICAvLyBTeW5jaHJvbml6ZSBidWxsZXQgbWVzaGVzIHdpdGggdGhlaXIgcGh5c2ljcyBib2RpZXNcclxuICAgICAgICBmb3IgKGNvbnN0IGJ1bGxldCBvZiB0aGlzLmJ1bGxldHMpIHtcclxuICAgICAgICAgICAgaWYgKCFidWxsZXQuc2hvdWxkUmVtb3ZlKSB7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQubWVzaC5wb3NpdGlvbi5jb3B5KGJ1bGxldC5ib2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgICAgICAgICBidWxsZXQubWVzaC5xdWF0ZXJuaW9uLmNvcHkoYnVsbGV0LmJvZHkucXVhdGVybmlvbiBhcyB1bmtub3duIGFzIFRIUkVFLlF1YXRlcm5pb24pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBORVc6IFN5bmNocm9uaXplIGVuZW15IG1lc2hlcyB3aXRoIHRoZWlyIHBoeXNpY3MgYm9kaWVzXHJcbiAgICAgICAgZm9yIChjb25zdCBlbmVteSBvZiB0aGlzLmVuZW1pZXMpIHtcclxuICAgICAgICAgICAgaWYgKCFlbmVteS5zaG91bGRSZW1vdmUpIHtcclxuICAgICAgICAgICAgICAgIGVuZW15Lm1lc2gucG9zaXRpb24uY29weShlbmVteS5ib2R5LnBvc2l0aW9uIGFzIHVua25vd24gYXMgVEhSRUUuVmVjdG9yMyk7XHJcbiAgICAgICAgICAgICAgICBlbmVteS5tZXNoLnF1YXRlcm5pb24uY29weShlbmVteS5ib2R5LnF1YXRlcm5pb24gYXMgdW5rbm93biBhcyBUSFJFRS5RdWF0ZXJuaW9uKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLy8gU3RhcnQgdGhlIGdhbWUgd2hlbiB0aGUgRE9NIGNvbnRlbnQgaXMgZnVsbHkgbG9hZGVkXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XHJcbiAgICBuZXcgR2FtZSgpO1xyXG59KTsiXSwKICAibWFwcGluZ3MiOiAiQUFBQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBb0J4QixJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDSSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBRkMsU0FBQUE7QUFBQSxHQUFBO0FBcUdMLE1BQU0sS0FBSztBQUFBLEVBbUVQLGNB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
